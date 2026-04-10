// ─── Service Status — Simulator + Downdetector scraper/API ───────────────────
// Data source is selected by env vars (checked in priority order):
//
//   USE_OFFICIAL_API=1   → Downdetector Partner REST API (downdetector-api.js)
//                          Requires: DOWNDETECTOR_API_URL + DOWNDETECTOR_API_KEY
//   USE_SCRAPER=1        → ScraperAPI HTML scraper (downdetector-scraper.js)
//                          Requires: SCRAPER_API_KEY (optional — falls back to direct fetch)
//   (neither)            → Full simulation, no external calls
//
// Falls back to per-market simulation if a fetch/scrape fails for a given market.
//
// Status thresholds (ratio = complaints / baseline):
//   OK      < 2.0×
//   WARNING ≥ 2.0× and < 4.5×
//   OUTAGE  ≥ 4.5×

import { scrapeAll as scrapeAllScraper } from "./downdetector-scraper.js";
import { scrapeAll as scrapeAllApi }     from "./downdetector-api.js";
import { getSupabase } from "./supabase.js";

const USE_OFFICIAL_API = process.env.USE_OFFICIAL_API === "1";
const USE_SCRAPER      = !USE_OFFICIAL_API && process.env.USE_SCRAPER === "1";

function scrapeAll(log) {
  return USE_OFFICIAL_API ? scrapeAllApi(log) : scrapeAllScraper(log);
}

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

const HISTORY_LEN = 2880; // 24h at 30s/tick

// ─── In-memory state ─────────────────────────────────────────────────────────
// marketId → { ...market fields, complaints, ratio, status, trend[], ticketId,
//              spikeRemaining, spikeMult, services: { svcId → { complaints, ratio, status } } }
const state = new Map();

function initState() {
  for (const m of MARKETS) {
    const baseline = m.baseline;
    state.set(m.id, {
      ...m,
      complaints:       Math.round(baseline),
      ratio:            1.0,
      status:           "ok",
      prevStatus:       "ok",
      trend:            Array(HISTORY_LEN).fill(Math.round(baseline)),
      ticketId:         null,
      spikeRemaining:   0,
      spikeMult:        1,
      spikeService:     null,
      lastUpdate:       Date.now(),
      dataSource:       "simulated",
      baselineAuto:     false,   // true once enough history to compute dynamically
      baselineOriginal: baseline, // original hardcoded value, kept for cap/reference
      tickCount:        0,
      services:         Object.fromEntries(
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

// ─── Dynamic baseline ─────────────────────────────────────────────────────────
/**
 * Recalculates the market baseline from its trend ring buffer.
 * Uses the 25th percentile of non-padding values — captures "normal quiet"
 * traffic, robust to spikes and incident periods.
 * Called every 10 ticks. Needs ≥120 real data points (≥1h of history).
 * Capped at 2× the original value to prevent runaway drift during sustained outages.
 */
function recomputeBaseline(m) {
  m.tickCount = (m.tickCount || 0) + 1;
  if (m.tickCount % 10 !== 0) return; // only every 10 ticks

  // Exclude padding (values equal to original baseline fill from initState)
  // Use all values once we have real history from DB restore or live ticks
  const values = m.trend.filter(v => v > 0).sort((a, b) => a - b);
  if (values.length < 120) return; // need ≥1h

  const p25 = values[Math.floor(values.length * 0.25)];
  if (!p25 || p25 <= 0) return;

  // Cap: don't let auto-baseline exceed 2× original (sustained outage protection)
  const cap = m.baselineOriginal * 2;
  m.baseline    = Math.round(Math.min(p25, cap));
  m.baselineAuto = true;
}

// ─── Supabase persistence ─────────────────────────────────────────────────────

/** Fire-and-forget write. Never blocks the tick. Never throws. */
function persistTick(m) {
  const db = getSupabase();
  if (!db) return;
  db.from("service_status_history")
    .insert({ market_id: m.id, complaints: m.complaints, ratio: m.ratio, status: m.status, data_source: m.dataSource })
    .then(({ error }) => { if (error) console.warn(`[service-status] persist failed (${m.id}): ${error.message}`); })
    .catch(e => console.warn(`[service-status] persist exception (${m.id}): ${e.message}`));
}

// ─── Tick function ────────────────────────────────────────────────────────────
/**
 * Called every 30s. Updates all market states and triggers auto-ticket
 * creation/resolution via HTTP to the local tickets API.
 *
 * @param {number} port  — poller HTTP port (for self-calls to /api/tickets)
 */
let _scraping = false; // prevent concurrent fetch cycles
export async function tickServiceStatus(port, log) {
  if (USE_OFFICIAL_API || USE_SCRAPER) {
    if (_scraping) { log?.("[service-status] skipping tick — previous fetch still running"); return; }
    _scraping = true;
    try { await tickFromScraper(port, log); } finally { _scraping = false; }
    return;
  }
  await tickSimulated(port, log);
}

async function tickFromScraper(port, log) {
  log?.(USE_OFFICIAL_API ? "[service-status] fetching Downdetector official API..." : "[service-status] scraping Downdetector...");
  const results = await scrapeAll(log);

  console.log(`[DEBUG tickFromScraper] results: ${results.length} — ${results.map(r => `${r.market?.id}:ok=${r.ok}:c=${r.complaints}`).join(", ")}`);

  for (const r of results) {
    const m = state.get(r.market.id);
    console.log(`[DEBUG] ${r.market?.id}: stateFound=${!!m} ok=${r.ok} complaints=${r.complaints}`);
    if (!m) continue;

    if (!r.ok) {
      // Scrape failed — run simulation tick so this market stays lively
      await tickOneSimulated(m, port);
      continue;
    }

    const complaints = r.complaints;
    if (r.baseline !== null) m.baseline = r.baseline;
    const ratio   = complaints / Math.max(1, m.baseline);
    const status  = statusForRatio(ratio);

    m.prevStatus  = m.status;
    m.complaints  = complaints;
    m.ratio       = Math.round(ratio * 10) / 10;
    m.status      = status;
    m.lastUpdate  = Date.now();
    m.dataSource  = "downdetector";
    m.trend       = r.trend ? r.trend : [...m.trend.slice(1), complaints];

    recomputeBaseline(m);
    persistTick(m);
    await handleStatusTransition(m, port);
  }
}

async function tickOneSimulated(m, port) {
  const tod = todMultiplier();
  // Spike state machine
  if (m.spikeRemaining > 0) {
    m.spikeRemaining--;
    if (m.spikeRemaining === 0) m.spikeMult = 1;
  } else if (Math.random() < 0.03) {
    m.spikeMult      = rand(5.0, 12.0);
    m.spikeRemaining = Math.round(rand(1, 4));
    m.spikeService   = SERVICES[Math.floor(Math.random() * SERVICES.length)].id;
  }
  const noise      = rand(0.80, 1.20);
  let   totalMult  = tod * noise;
  if (m.spikeRemaining > 0) totalMult *= m.spikeMult;

  const complaints = Math.round(m.baseline * totalMult);
  const ratio      = complaints / m.baseline;
  const status     = statusForRatio(ratio);

  let remaining = complaints;
  SERVICES.forEach((s, i) => {
    let svcComplaints;
    if (i === SERVICES.length - 1) {
      svcComplaints = remaining;
    } else {
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
    m.services[s.id] = { complaints: svcComplaints, ratio: Math.round(svcRatio * 10) / 10, status: statusForRatio(svcRatio) };
  });

  m.complaints = complaints;
  m.ratio      = Math.round(ratio * 10) / 10;
  m.prevStatus = m.status;
  m.status     = status;
  m.lastUpdate = Date.now();
  m.dataSource = "simulated";
  m.trend      = [...m.trend.slice(1), complaints];
  recomputeBaseline(m);
  persistTick(m);
  await handleStatusTransition(m, port);
}

async function tickSimulated(port, log) {
  for (const [, m] of state) {
    await tickOneSimulated(m, port);
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
      ticketId:      s.ticketId,
      lastUpdate:    s.lastUpdate,
      services:      s.services,
      dataSource:    s.dataSource ?? (USE_SCRAPER ? "downdetector" : "simulated"),
      baselineAuto:  s.baselineAuto ?? false,
    };
  });
}

// ─── DB restore + retention ───────────────────────────────────────────────────

/**
 * Reads last 24h of rows from Supabase and hydrates each market's ring buffer.
 * Called once at startup before the first tick so historical trend is preserved
 * across server restarts.
 */
export async function restoreHistoryFromDb(log) {
  const db = getSupabase();
  if (!db) { log?.("[service-status] no Supabase — skipping history restore"); return; }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("service_status_history")
    .select("market_id, complaints, recorded_at")
    .gte("recorded_at", since)
    .order("recorded_at", { ascending: true });

  if (error) { log?.(`[service-status] history restore failed: ${error.message}`); return; }

  const byMarket = {};
  for (const row of data) {
    (byMarket[row.market_id] ??= []).push(row.complaints);
  }
  for (const [marketId, values] of Object.entries(byMarket)) {
    const m = state.get(marketId);
    if (!m) continue;
    const slice = values.slice(-HISTORY_LEN);
    m.trend.splice(HISTORY_LEN - slice.length, slice.length, ...slice);
    log?.(`[service-status] restored ${slice.length} pts for ${marketId}`);
  }
}

/** Deletes rows older than 25h. Call hourly. Non-fatal on error. */
export async function pruneHistory() {
  const db = getSupabase();
  if (!db) return;
  const cutoff = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
  const { error } = await db.from("service_status_history").delete().lt("recorded_at", cutoff);
  if (error) console.warn(`[service-status] prune failed: ${error.message}`);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
initState();
