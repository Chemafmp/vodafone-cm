// ─── Service Status — Simulator + optional Downdetector scraper ───────────────
// Set USE_SCRAPER=1 in env to pull real data from Downdetector HTML pages.
// Falls back to simulation if scraping fails or USE_SCRAPER is unset.
//
// Status thresholds (ratio = complaints / baseline):
//   OK      < 2.0×
//   WARNING ≥ 2.0× and < 4.5×
//   OUTAGE  ≥ 4.5×

import { scrapeAll } from "./downdetector-scraper.js";
import { createClient } from "@supabase/supabase-js";
import { isPaused } from "./poller-control.js";

const USE_SCRAPER = process.env.USE_SCRAPER === "1";

// ─── Supabase client ──────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY) ? createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const RETENTION_H = 36;

const MARKETS = [
  { id: "es", name: "Spain",       flag: "🇪🇸", tz: "Europe/Madrid",    baseline: 45 },
  { id: "uk", name: "UK",          flag: "🇬🇧", tz: "Europe/London",    baseline: 60 },
  { id: "de", name: "Germany",     flag: "🇩🇪", tz: "Europe/Berlin",    baseline: 50 },
  { id: "it", name: "Italy",       flag: "🇮🇹", tz: "Europe/Rome",      baseline: 40 },
  { id: "pt", name: "Portugal",    flag: "🇵🇹", tz: "Europe/Lisbon",    baseline: 20 },
  { id: "nl", name: "Netherlands", flag: "🇳🇱", tz: "Europe/Amsterdam", baseline: 25 },
  { id: "ie", name: "Ireland",     flag: "🇮🇪", tz: "Europe/Dublin",    baseline: 15 },
  { id: "gr", name: "Greece",      flag: "🇬🇷", tz: "Europe/Athens",    baseline: 20 },
  { id: "ro", name: "Romania",     flag: "🇷🇴", tz: "Europe/Bucharest", baseline: 30 },
  { id: "tr", name: "Turkey",      flag: "🇹🇷", tz: "Europe/Istanbul",  baseline: 35 },
];

const SERVICES = [
  { id: "mobile_data",  name: "Mobile Data",    icon: "📶", weight: 0.40 },
  { id: "mobile_voice", name: "Mobile Voice",   icon: "📞", weight: 0.20 },
  { id: "fixed_bb",     name: "Fixed Broadband",icon: "🌐", weight: 0.28 },
  { id: "tv",           name: "TV / IPTV",      icon: "📺", weight: 0.12 },
];

const HISTORY_LEN = 2880; // 24h at 30s/tick (in-memory trend for sparkline)

// ─── Supabase persistence helpers ────────────────────────────────────────────
// community_signals: one row per market per tick (every 30s).
// 36h retention → max ~10 markets × 4320 rows = ~43 200 rows, each tiny.

async function saveCommunitySignal(marketId, complaints, ratio) {
  if (!supabase) return;
  try {
    await supabase.from("community_signals").insert({ market_id: marketId, complaints, ratio });
  } catch { /* non-fatal */ }
}

async function cleanupCommunitySignals() {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    await supabase.from("community_signals").delete().lt("measured_at", cutoff);
  } catch { /* non-fatal */ }
}

async function loadCommunityHistory(marketId) {
  if (!supabase) return [];
  try {
    const since = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("community_signals")
      .select("complaints, ratio, measured_at")
      .eq("market_id", marketId)
      .gte("measured_at", since)
      .order("measured_at", { ascending: true });
    return (data || []).map(r => ({
      ts:         new Date(r.measured_at).getTime(),
      value:      r.complaints,
      ratio:      r.ratio,
    }));
  } catch { return []; }
}

// ─── In-memory state ─────────────────────────────────────────────────────────
// marketId → { ...market fields, complaints, ratio, status, trend[], ticketId,
//              spikeRemaining, spikeMult, services: { svcId → { complaints, ratio, status } } }
const state = new Map();

function initState() {
  for (const m of MARKETS) {
    const baseline = m.baseline;
    state.set(m.id, {
      ...m,
      complaints:      Math.round(baseline),
      ratio:           1.0,
      status:          "ok",
      prevStatus:      "ok",
      trend:           Array(HISTORY_LEN).fill(Math.round(baseline)),
      history:         [],   // [{ts, value, ratio}] — loaded from Supabase on boot
      ticketId:        null,
      spikeRemaining:  0,
      spikeMult:       1,
      spikeService:    null,
      lastUpdate:      Date.now(),
      services:        Object.fromEntries(
        SERVICES.map(s => [s.id, { complaints: Math.round(baseline * s.weight), ratio: 1.0, status: "ok" }])
      ),
    });
  }
}

// ─── Simulation helpers ───────────────────────────────────────────────────────

/** Time-of-day multiplier — sinusoidal; peaks at noon, troughs at 4am. */
function todMultiplier() {
  const now = new Date();
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  // sin waves from 0 (4am UTC) to peak (12pm UTC)
  const rad = ((h - 4) / 24) * 2 * Math.PI;
  return 0.75 + 0.45 * Math.sin(rad);
}

function rand(min, max) { return min + Math.random() * (max - min); }

function statusForRatio(ratio) {
  if (ratio >= 4.5) return "outage";
  if (ratio >= 2.0) return "warning";
  return "ok";
}

// ─── Tick function ────────────────────────────────────────────────────────────
/**
 * Called every 30s. Updates all market states and triggers auto-ticket
 * creation/resolution via HTTP to the local tickets API.
 *
 * @param {number} port  — poller HTTP port (for self-calls to /api/tickets)
 */
export async function tickServiceStatus(port, log) {
  if (isPaused("service-status")) { log?.("[service-status] ⏸ paused"); return; }
  if (USE_SCRAPER) {
    await tickFromScraper(port, log);
    return;
  }
  await tickSimulated(port, log);
}

async function tickFromScraper(port, log) {
  log?.("[service-status] scraping Downdetector...");
  const results = await scrapeAll(log);

  for (const r of results) {
    const m = state.get(r.market.id);
    if (!m) continue;

    if (!r.ok) {
      // Scrape failed for this market — keep previous values, just update trend
      m.trend = [...m.trend.slice(1), m.complaints];
      m.lastUpdate = Date.now();
      continue;
    }

    const complaints = r.complaints;
    // If we got a real baseline from the chart series, use it; otherwise keep the sim baseline
    if (r.baseline !== null) m.baseline = r.baseline;
    const ratio   = complaints / Math.max(1, m.baseline);
    const status  = statusForRatio(ratio);

    m.prevStatus  = m.status;
    m.complaints  = complaints;
    m.ratio       = Math.round(ratio * 10) / 10;
    m.status      = status;
    m.lastUpdate  = Date.now();
    // Use real trend if available, otherwise append new point
    m.trend = r.trend ? r.trend : [...m.trend.slice(1), complaints];

    // Persist to Supabase + update in-memory history
    const point = { ts: Date.now(), value: complaints, ratio: m.ratio };
    m.history = [...m.history.filter(p => p.ts > Date.now() - RETENTION_H * 3600_000), point];
    saveCommunitySignal(m.id, complaints, m.ratio);

    // Auto-ticket logic (same as simulated path)
    await handleStatusTransition(m, port);
  }
}

async function tickSimulated(port, log) {
  const tod = todMultiplier();

  for (const [marketId, m] of state) {
    // ── Spike state machine ──────────────────────────────────────────────────
    if (m.spikeRemaining > 0) {
      m.spikeRemaining--;
      if (m.spikeRemaining === 0) m.spikeMult = 1;
    } else {
      // 3% chance of a new spike per tick
      if (Math.random() < 0.03) {
        m.spikeMult        = rand(5.0, 12.0);
        m.spikeRemaining   = Math.round(rand(1, 4)); // 1–4 ticks (30s–2min)
        m.spikeService     = SERVICES[Math.floor(Math.random() * SERVICES.length)].id;
      }
    }

    // ── Compute total complaints ─────────────────────────────────────────────
    const noise  = rand(0.80, 1.20);
    let totalMult = tod * noise;
    if (m.spikeRemaining > 0) totalMult *= m.spikeMult;

    const complaints = Math.round(m.baseline * totalMult);
    const ratio      = complaints / m.baseline;
    const status     = statusForRatio(ratio);

    // ── Per-service split ────────────────────────────────────────────────────
    let remaining = complaints;
    SERVICES.forEach((s, i) => {
      let svcComplaints;
      if (i === SERVICES.length - 1) {
        svcComplaints = remaining;
      } else {
        // Amplify the spiked service; others share the rest proportionally
        let w = s.weight;
        if (m.spikeService === s.id && m.spikeRemaining > 0) w *= m.spikeMult;
        svcComplaints = Math.round(complaints * (w / SERVICES.reduce((acc, sv) => {
          let ww = sv.weight;
          if (m.spikeService === sv.id && m.spikeRemaining > 0) ww *= m.spikeMult;
          return acc + ww;
        }, 0)));
        remaining -= svcComplaints;
      }
      const svcRatio = svcComplaints / (m.baseline * s.weight || 1);
      m.services[s.id] = {
        complaints: svcComplaints,
        ratio:      Math.round(svcRatio * 10) / 10,
        status:     statusForRatio(svcRatio),
      };
    });

    // ── Update trend + persist ────────────────────────────────────────────────
    m.complaints  = complaints;
    m.ratio       = Math.round(ratio * 10) / 10;
    m.prevStatus  = m.status;
    m.status      = status;
    m.lastUpdate  = Date.now();
    m.trend       = [...m.trend.slice(1), complaints];

    // Persist to Supabase + append to in-memory history
    const point = { ts: Date.now(), value: complaints, ratio: m.ratio };
    m.history = [...m.history.filter(p => p.ts > Date.now() - RETENTION_H * 3600_000), point];
    saveCommunitySignal(m.id, complaints, m.ratio);

    await handleStatusTransition(m, port);
  }
}

// ─── Shared auto-ticket logic ─────────────────────────────────────────────────
async function handleStatusTransition(m, port) {
  if (m.status === "outage" && m.prevStatus !== "outage") {
    try {
      const src = USE_SCRAPER ? "Downdetector (real data)" : "service status simulator";
      const resp = await fetch(`http://localhost:${port}/api/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type:        "incident",
          severity:    "sev2",
          title:       `Service Outage: Vodafone ${m.name} — elevated complaint volume (${m.ratio}× baseline)`,
          team:        "NOC",
          description: `Auto-detected via service status monitoring (${src}).\n\nComplaint volume: ${m.complaints}/h (${m.ratio}× baseline of ${m.baseline}/h)\n\nAffected market: ${m.flag} ${m.name}`,
          tags:        ["service-status", "downdetector", m.id],
          actor_name:  "System",
          source:      "alarm",
        }),
      });
      if (resp.ok) { const t = await resp.json(); m.ticketId = t.id; }
    } catch (_) { /* non-fatal */ }
  } else if (m.status !== "outage" && m.prevStatus === "outage" && m.ticketId) {
    try {
      await fetch(`http://localhost:${port}/api/tickets/${encodeURIComponent(m.ticketId)}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_type: "status_change",
          actor_name: "System",
          content:    `Service recovered. Volume back to ${m.complaints}/h (${m.ratio}× baseline). Status: OUTAGE → ${m.status.toUpperCase()}`,
        }),
      });
      const tResp = await fetch(`http://localhost:${port}/api/tickets/${encodeURIComponent(m.ticketId)}`);
      if (tResp.ok) {
        const t = await tResp.json();
        if (["new", "assigned"].includes(t.status)) {
          await fetch(`http://localhost:${port}/api/tickets/${encodeURIComponent(m.ticketId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "resolved", actor_name: "System" }),
          });
        }
      }
    } catch (_) { /* non-fatal */ }
    m.ticketId = null;
  }
}

// ─── Read current state ───────────────────────────────────────────────────────
export function getServiceStatus() {
  return MARKETS.map(m => {
    const s = state.get(m.id);
    return {
      id:          m.id,
      name:        m.name,
      flag:        m.flag,
      baseline:    m.baseline,
      complaints:  s.complaints,
      ratio:       s.ratio,
      status:      s.status,
      prevStatus:  s.prevStatus,
      trend:       s.trend,
      history:     s.history,   // [{ts, value, ratio}] — persistent, from Supabase
      ticketId:    s.ticketId,
      lastUpdate:  s.lastUpdate,
      services:    s.services,
      dataSource:  USE_SCRAPER ? "downdetector" : "simulated",
    };
  });
}

// ─── Boot — preload history from Supabase ────────────────────────────────────
export async function initServiceStatus(log) {
  initState();
  if (!supabase) {
    log?.("[service-status] ⚠ Supabase not configured — history in-memory only");
    return;
  }
  log?.("[service-status] loading community history from Supabase…");
  for (const m of MARKETS) {
    try {
      const hist = await loadCommunityHistory(m.id);
      if (hist.length > 0) {
        const s = state.get(m.id);
        s.history = hist;
        // Also seed the last value into current state
        const last = hist.at(-1);
        if (last) {
          s.complaints = last.value;
          s.ratio      = last.ratio;
          s.status     = last.ratio >= 4.5 ? "outage" : last.ratio >= 2 ? "warning" : "ok";
        }
      }
    } catch { /* non-fatal */ }
  }
  cleanupCommunitySignals();
  log?.("[service-status] community history preloaded");
}
