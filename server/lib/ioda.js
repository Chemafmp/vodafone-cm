// ─── CAIDA IODA v2 integration ────────────────────────────────────────────────
// Polls IODA v2 API directly from the droplet every 5 min per Vodafone ASN.
//
// IODA (Internet Outage Detection and Analysis) — Georgia Tech / CAIDA
// Website: https://ioda.inetintel.cc.gatech.edu/
// API:     https://api.ioda.inetintel.cc.gatech.edu/v2/
// Docs:    /v2/ returns Swagger UI with full spec
// No authentication required. Rate limit: ~1 req/s sustained.
//
// ─── Data sources used ───────────────────────────────────────────────────────
//
//  bgp            Global BGP routing table — % of full-feed peers that see the
//                 ASN's prefixes. Updated every 5 min. Source: all Route Views +
//                 RIPE RIS collectors. A drop → prefixes being withdrawn globally.
//
//  ping-slash24   Active probing (Trinocular technique) — number of /24 blocks
//                 reachable from Georgia Tech's 20-prober fleet. Updated every
//                 10 min. A drop → addresses in the AS becoming unreachable.
//
//  ping-slash24-latency  Round-trip latency of successful probes, per ASN.
//
//  ping-slash24-loss     Packet loss rate of probes, per ASN.
//
//  merit-nt       Merit Network Telescope — anomalous inbound traffic from the
//                 AS. Spikes after a blackout (devices trying to reconnect).
//
// ─── Outage events ────────────────────────────────────────────────────────────
// /v2/outages/events?entityType=asn&entityCode=XXXXX&from=T&until=T&overall=true
//   overall=true → merges overlapping events across datasources into one event.
//   each event: { id, start (unix s), duration (s), score, datasource, ... }
//
// ─── Raw time series ─────────────────────────────────────────────────────────
// /v2/signals/raw/asn/{asn}?from=T&until=T&datasource=bgp&maxPoints=24
//   values: array of numbers|null — one per time bucket of size `step` seconds.
//   step: native resolution of the datasource (300s for bgp, 600s for ping-*).
//
// ─── ASN notes ────────────────────────────────────────────────────────────────
//  Most ASNs are the same as RIPE Atlas. Turkey is an exception:
//    RIPE Atlas uses AS15924 (1 probe, not reporting to msm #1001)
//    IODA uses     AS15897 (VodafoneTurkey, 772,096 IPs — much better coverage)
//  The `iodaAsn` override below handles this. RIPE Atlas config is unchanged.

import { createClient } from "@supabase/supabase-js";
import { RIPE_MARKETS } from "./ripe-atlas.js";
import { isPaused } from "./poller-control.js";

const IODA_BASE      = "https://api.ioda.inetintel.cc.gatech.edu/v2";

// ─── Supabase client ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = (SUPABASE_URL && SUPABASE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_KEY)
  : null;
const FETCH_TIMEOUT  = 20_000;          // 20s per request
const RETENTION_H    = 36;              // keep 36h of event history
const POLL_WINDOW_H  = 6;              // look back 6h for events each tick
const SIGNAL_POINTS  = 24;             // data points in raw signal history (2h at 5-min step)
const INTER_CALL_MS  = 1_200;          // 1.2s between API calls (rate limit)

// ASN overrides: use a different ASN for IODA than for RIPE Atlas
// Reason for Turkey: AS15924 has essentially no IODA coverage; AS15897 does.
const IODA_ASN_OVERRIDE = {
  tr: 15897,   // VodafoneTurkey — 772,096 IPs vs 1 RIPE probe on AS15924
};

function iodaAsn(market) {
  return IODA_ASN_OVERRIDE[market.id] ?? market.asn;
}

// ─── In-memory state ──────────────────────────────────────────────────────────
const state = new Map();

function initState() {
  for (const m of RIPE_MARKETS) {
    state.set(m.id, {
      events:         [],   // normalised outage events (last RETENTION_H hours)
      hasActiveEvent: false,
      activeCount:    0,
      recentCount:    0,    // events with start within last 1h
      status:         "unknown",
      ok:             false,
      error:          null,
      lastChecked:    null,
      // Raw signal histories (last ~2h, 5-min buckets)
      signals: {
        bgp:  { current: null, history: [], unit: "bgp_visibility_pct" },
        ping: { current: null, history: [], unit: "slash24_up_count" },
      },
    });
  }
}

// ─── HTTP fetch helper ────────────────────────────────────────────────────────
async function iodaFetch(path) {
  const url = `${IODA_BASE}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Sleep helper
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Parse raw-signal response into history array ─────────────────────────────
// Returns [{ ts: ms, value: number }, ...] sorted oldest-first.
// IODA raw response shape:
//   { data: [{ from, step, values: [num|null, ...] }] }
function parseRawSignal(json) {
  const series = json?.data?.[0];
  if (!series) return [];
  const { from, step, values } = series;
  if (!Array.isArray(values) || !step) return [];
  return values
    .map((v, i) => ({ ts: (from + i * step) * 1000, value: v }))
    .filter(p => p.value != null);
}

// ─── Normalise one outage event from IODA v2 ─────────────────────────────────
function normaliseEvent(e, nowSec) {
  const start = (e.start ?? e.time ?? 0);
  const dur   = e.duration ?? null;
  const end   = dur ? start + dur : null;
  return {
    id:         e.id ?? `ioda-${start}`,
    datasource: e.datasource ?? "overall",
    score:      typeof e.score === "number" ? Math.round(e.score * 10) / 10 : null,
    start:      start * 1000,           // → ms
    end:        end   ? end * 1000 : null,
    duration:   dur,                    // seconds
    active:     !end || end > nowSec,
  };
}

// ─── Supabase persistence ─────────────────────────────────────────────────────
// Table: ioda_signals
//   id bigserial PK, market_id text, ioda_asn int, bgp_score numeric,
//   ping_count numeric, measured_at timestamptz DEFAULT now()
//
// One row per market per tick (every 5 min). Retained for 36h → max ~9×12×36
// = ~3,888 rows, each tiny. Same retention/cleanup pattern as ripe_measurements.
//
// SQL to create (run once in Supabase SQL Editor):
//   CREATE TABLE IF NOT EXISTS ioda_signals (
//     id          bigserial PRIMARY KEY,
//     market_id   text,
//     ioda_asn    int,
//     bgp_score   numeric,
//     ping_count  numeric,
//     measured_at timestamptz DEFAULT now()
//   );

async function saveToSupabase(marketId, iodaAsnVal, bgpScore, pingCount) {
  if (!supabase) return;
  try {
    await supabase.from("ioda_signals").insert({
      market_id:  marketId,
      ioda_asn:   iodaAsnVal,
      bgp_score:  bgpScore,
      ping_count: pingCount,
    });
  } catch { /* non-fatal */ }
}

async function cleanupOldData(log) {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { count } = await supabase
      .from("ioda_signals")
      .delete()
      .lt("measured_at", cutoff)
      .select("id", { count: "exact", head: true });
    if (count > 0) log?.(`[ioda] cleaned ${count} rows older than ${RETENTION_H}h`);
  } catch { /* non-fatal */ }
}

async function loadHistory(marketId) {
  if (!supabase) return { bgp: [], ping: [] };
  try {
    const since = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("ioda_signals")
      .select("bgp_score, ping_count, measured_at")
      .eq("market_id", marketId)
      .gte("measured_at", since)
      .order("measured_at", { ascending: true });
    const rows = data || [];
    return {
      bgp:  rows.map(r => ({ ts: new Date(r.measured_at).getTime(), value: r.bgp_score  })).filter(p => p.value != null),
      ping: rows.map(r => ({ ts: new Date(r.measured_at).getTime(), value: r.ping_count })).filter(p => p.value != null),
    };
  } catch {
    return { bgp: [], ping: [] };
  }
}

// ─── Poll one market ──────────────────────────────────────────────────────────
async function pollMarket(m, log) {
  const s       = state.get(m.id);
  const asn     = iodaAsn(m);
  const nowSec  = Math.floor(Date.now() / 1000);
  const from    = nowSec - POLL_WINDOW_H * 3600;
  const sigFrom = nowSec - (SIGNAL_POINTS * 300);  // 2h back at 5-min resolution

  // ── 1. Outage events ────────────────────────────────────────────────────────
  const eventsJson = await iodaFetch(
    `/outages/events?entityType=asn&entityCode=${asn}` +
    `&from=${from}&until=${nowSec}&overall=true&limit=50`
  );

  await sleep(INTER_CALL_MS);

  // ── 2. BGP raw signal (last ~2h) ────────────────────────────────────────────
  let bgpHistory = [];
  try {
    const bgpJson = await iodaFetch(
      `/signals/raw/asn/${asn}` +
      `?from=${sigFrom}&until=${nowSec}&datasource=bgp&maxPoints=${SIGNAL_POINTS}`
    );
    bgpHistory = parseRawSignal(bgpJson);
  } catch { /* non-fatal — bgp signal unavailable for this ASN */ }

  await sleep(INTER_CALL_MS);

  // ── 3. Ping-/24 raw signal (last ~2h) ───────────────────────────────────────
  let pingHistory = [];
  try {
    const pingJson = await iodaFetch(
      `/signals/raw/asn/${asn}` +
      `?from=${sigFrom}&until=${nowSec}&datasource=ping-slash24&maxPoints=${SIGNAL_POINTS}`
    );
    pingHistory = parseRawSignal(pingJson);
  } catch { /* non-fatal */ }

  await sleep(INTER_CALL_MS);

  // ── Merge events ─────────────────────────────────────────────────────────────
  const cutoffMs     = (nowSec - RETENTION_H * 3600) * 1000;
  const rawEvents    = Array.isArray(eventsJson?.data) ? eventsJson.data : [];
  const newEvents    = rawEvents.map(e => normaliseEvent(e, nowSec));

  const existingIds  = new Set(s.events.map(e => e.id));
  const merged       = [
    ...s.events.filter(e => e.start > cutoffMs),
    ...newEvents.filter(e => !existingIds.has(e.id)),
  ].sort((a, b) => b.start - a.start);

  const hasActive   = merged.some(e => e.active);
  const activeCount = merged.filter(e => e.active).length;
  const recentMs    = Date.now() - 3600_000;
  const recentCount = merged.filter(e => e.start > recentMs).length;

  // ── Update state ──────────────────────────────────────────────────────────
  s.events         = merged;
  s.hasActiveEvent = hasActive;
  s.activeCount    = activeCount;
  s.recentCount    = recentCount;
  s.status         = hasActive ? "alert" : (merged.length > 0 ? "warning" : "ok");
  s.ok             = true;
  s.error          = null;
  s.lastChecked    = Date.now();

  const bgpCurrent  = bgpHistory.at(-1)?.value ?? null;
  const pingCurrent = pingHistory.at(-1)?.value ?? null;

  s.signals.bgp  = {
    current: bgpCurrent,
    history: bgpHistory,
    unit: "bgp_visibility_score",
    // IODA BGP score = number of full-feed peers seeing the AS's prefixes.
    // Higher = more visible globally. A sudden drop → route withdrawal event.
  };
  s.signals.ping = {
    current: pingCurrent,
    history: pingHistory,
    unit: "slash24_up_count",
    // Number of /24 blocks answering active probes from Georgia Tech.
    // A drop → address space becoming unreachable (not the same as RIPE Atlas).
  };

  // Persist to Supabase (non-blocking)
  saveToSupabase(m.id, asn, bgpCurrent, pingCurrent);

  log?.(`[ioda] ✓ ${m.id} AS${asn}: ${merged.length} events ` +
        `(${hasActive ? "ACTIVE" : "ok"}) | bgp pts:${bgpHistory.length} ` +
        `ping pts:${pingHistory.length}`);
}

// ─── Public: tick all markets ─────────────────────────────────────────────────
export async function tickIoda(log) {
  if (isPaused("ioda")) { log?.("[ioda] ⏸ paused"); return; }
  log?.("[ioda] polling CAIDA IODA v2…");
  for (const m of RIPE_MARKETS) {
    try {
      await pollMarket(m, log);
    } catch (e) {
      const s = state.get(m.id);
      s.ok     = false;
      s.error  = e.message;
      s.status = "unknown";
      log?.(`[ioda] ✗ ${m.id}: ${e.message}`);
      await sleep(INTER_CALL_MS);  // still pace even on failure
    }
  }
  cleanupOldData(log);  // prune rows older than 36h (non-blocking)
}

// ─── Public: get current state ────────────────────────────────────────────────
export function getIoda() {
  return RIPE_MARKETS.map(m => {
    const s   = state.get(m.id);
    const asn = iodaAsn(m);
    return {
      id:             m.id,
      iodaAsn:        asn,            // may differ from market.asn (e.g. Turkey)
      events:         s.events,
      hasActiveEvent: s.hasActiveEvent,
      activeCount:    s.activeCount,
      recentCount:    s.recentCount,
      status:         s.status,
      ok:             s.ok,
      error:          s.error,
      lastChecked:    s.lastChecked,
      signals:        s.signals,      // { bgp: { current, history[], unit }, ping: { ... } }
    };
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
export async function initIoda(log) {
  initState();
  log?.("[ioda] CAIDA IODA v2 module initialised");
  log?.(`[ioda] base URL: ${IODA_BASE}`);
  log?.(`[ioda] ASN overrides: TR AS15924→AS15897 (VodafoneTurkey, better coverage)`);
  if (!supabase) {
    log?.("[ioda] ⚠ Supabase not configured — signal history will be in-memory only");
    return;
  }
  // Pre-load 36h of signal history from Supabase so charts are populated
  // immediately after restart (instead of waiting for first poll tick).
  log?.("[ioda] loading signal history from Supabase…");
  for (const m of RIPE_MARKETS) {
    try {
      const hist = await loadHistory(m.id);
      const s = state.get(m.id);
      if (hist.bgp.length  > 0) s.signals.bgp.history  = hist.bgp;
      if (hist.ping.length > 0) s.signals.ping.history = hist.ping;
      s.signals.bgp.current  = hist.bgp.at(-1)?.value  ?? null;
      s.signals.ping.current = hist.ping.at(-1)?.value ?? null;
    } catch { /* non-fatal */ }
  }
  log?.("[ioda] history preloaded");
}
