// ─── RIPE Atlas integration ───────────────────────────────────────────────────
// Polls measurement #1001 (continuous ping to k.root-servers.net / 193.0.14.129)
// every 5 minutes. Filters results by Vodafone ASNs per country, computes
// latency + packet-loss metrics, and persists to Supabase for dynamic baseline.
//
// k.root-servers.net — operated by RIPE NCC, primary node Amsterdam,
// anycast-distributed across 100+ locations. Traffic routes to nearest instance,
// so RTT mainly reflects: Vodafone access network → backbone → Internet exit.
//
// Same ratio model as Downdetector (service-status.js):
//   OK      < 2.0×  above 4h rolling baseline
//   WARNING ≥ 2.0×
//   OUTAGE  ≥ 4.5×

import { createClient } from "@supabase/supabase-js";

// ─── Config ───────────────────────────────────────────────────────────────────
const RIPE_KEY     = process.env.RIPE_ATLAS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const RIPE_BASE       = "https://atlas.ripe.net/api/v2";
const MSM_ID          = 1001;      // built-in: continuous ICMP ping to k.root-servers.net
const HISTORY_POINTS  = 432;       // 36 h at 5 min/tick (12 ticks/h × 36)
const PROBE_REFRESH_H = 24;        // re-fetch probe IDs every 24 h
const RESULT_WINDOW_M = 15;        // look back 15 min for latest results
const FETCH_TIMEOUT   = 20_000;

// Verified Vodafone ASNs (consumer/broadband networks, not global backbone)
export const RIPE_MARKETS = [
  { id: "es", name: "Spain",       flag: "🇪🇸", asn: 12430 },
  { id: "uk", name: "UK",          flag: "🇬🇧", asn: 5378  },
  { id: "de", name: "Germany",     flag: "🇩🇪", asn: 3209  },
  { id: "it", name: "Italy",       flag: "🇮🇹", asn: 30722 },
  { id: "pt", name: "Portugal",    flag: "🇵🇹", asn: 12353 },
  { id: "nl", name: "Netherlands", flag: "🇳🇱", asn: 33915 },
  { id: "ie", name: "Ireland",     flag: "🇮🇪", asn: 15502 },
  { id: "gr", name: "Greece",      flag: "🇬🇷", asn: 3329  },
  { id: "tr", name: "Turkey",      flag: "🇹🇷", asn: 15924 },
];

// ─── Supabase client ──────────────────────────────────────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ─── In-memory state ──────────────────────────────────────────────────────────
// marketId → { ...market, probeIds[], probesFetchedAt, current{}, history[],
//              baseline_rtt, ratio, status, ok, error, lastUpdate }
const state = new Map();

function initState() {
  for (const m of RIPE_MARKETS) {
    state.set(m.id, {
      ...m,
      probes:          [],   // [{ id, country, lat, lon, description }]
      probesFetchedAt: 0,
      current:         null,
      history:         [],   // rolling HISTORY_POINTS × { avg_rtt, p95_rtt, loss_pct, probe_count, measured_at }
      baseline_rtt:    null,
      ratio:           null,
      status:          "unknown",
      ok:              false,
      error:           null,
      lastUpdate:      null,
    });
  }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function ripeFetch(url) {
  const headers = { Accept: "application/json" };
  if (RIPE_KEY) headers.Authorization = `Key ${RIPE_KEY}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } finally {
    clearTimeout(t);
  }
}

// ─── Probe discovery ──────────────────────────────────────────────────────────
// Returns array of probe objects with id + location metadata.
async function fetchProbes(asn) {
  const probes = [];
  let url = `${RIPE_BASE}/probes/?asn_v4=${asn}&status=1&fields=id,country_code,geometry,description&page_size=500`;
  while (url) {
    const data = await ripeFetch(url);
    for (const p of (data.results || [])) {
      probes.push({
        id:          p.id,
        country:     p.country_code  || null,
        lat:         p.geometry?.coordinates?.[1] ?? null,
        lon:         p.geometry?.coordinates?.[0] ?? null,
        description: p.description  || null,
      });
    }
    url = data.next || null;
  }
  return probes;
}

// ─── Percentile helper ────────────────────────────────────────────────────────
function percentile(values, pct) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * (pct / 100));
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ─── Fetch + parse measurement results ───────────────────────────────────────
// Queries msm 1001 results for given probe IDs over the last RESULT_WINDOW_M minutes.
async function fetchResults(probeIds) {
  if (!probeIds.length) return [];
  const stop  = Math.floor(Date.now() / 1000);
  const start = stop - RESULT_WINDOW_M * 60;

  const CHUNK = 500; // RIPE API limit per request
  const all   = [];
  for (let i = 0; i < probeIds.length; i += CHUNK) {
    const chunk = probeIds.slice(i, i + CHUNK).join(",");
    const url = `${RIPE_BASE}/measurements/${MSM_ID}/results/`
      + `?probe_ids=${chunk}&start=${start}&stop=${stop}&format=json`;
    const data = await ripeFetch(url);
    if (Array.isArray(data)) all.push(...data);
  }
  return all;
}

// ─── Compute aggregated metrics from raw results array ────────────────────────
function computeMetrics(results) {
  const avgRtts  = [];
  const allRtts  = [];
  let totalSent  = 0;
  let totalRcvd  = 0;

  for (const r of results) {
    if (typeof r.avg === "number" && r.avg > 0) avgRtts.push(r.avg);
    if (typeof r.sent === "number") totalSent += r.sent;
    if (typeof r.rcvd === "number") totalRcvd += r.rcvd;
    // Collect per-ping RTTs for P95 computation
    if (Array.isArray(r.result)) {
      for (const pt of r.result) {
        if (typeof pt.rtt === "number" && pt.rtt > 0) allRtts.push(pt.rtt);
      }
    }
  }

  if (!avgRtts.length) return null;

  const avg_rtt    = avgRtts.reduce((a, b) => a + b, 0) / avgRtts.length;
  const p95_rtt    = percentile(allRtts.length ? allRtts : avgRtts, 95);
  const loss_pct   = totalSent > 0 ? ((totalSent - totalRcvd) / totalSent) * 100 : 0;
  // Count unique probe IDs — each probe can appear 3-4× in a 15-min window
  // (measurement 1001 runs every ~4 min) so results.length would over-count
  const probe_count = new Set(results.map(r => r.prb_id).filter(Boolean)).size || results.length;

  return {
    avg_rtt:     Math.round(avg_rtt  * 10) / 10,
    p95_rtt:     Math.round((p95_rtt ?? avg_rtt) * 10) / 10,
    loss_pct:    Math.round(loss_pct * 10) / 10,
    probe_count,
    measured_at: new Date().toISOString(),
  };
}

// ─── Ratio → status (same thresholds as Downdetector) ────────────────────────
function statusForRatio(ratio) {
  if (ratio >= 4.5) return "outage";
  if (ratio >= 2.0) return "warning";
  return "ok";
}

// ─── Supabase persistence ─────────────────────────────────────────────────────
async function saveToSupabase(marketId, metrics) {
  if (!supabase) return;
  try {
    await supabase.from("ripe_measurements").insert({
      market_id:   marketId,
      avg_rtt:     metrics.avg_rtt,
      p95_rtt:     metrics.p95_rtt,
      loss_pct:    metrics.loss_pct,
      probe_count: metrics.probe_count,
    });
  } catch { /* non-fatal */ }
}

// ─── Data retention cleanup (max 36h) ────────────────────────────────────────
// Called once per tick. Deletes rows older than 36h so the table stays small.
// At 9 markets × 12 ticks/h × 36h the table never exceeds ~4k rows (~200KB).
const RETENTION_H = 36;
async function cleanupOldData(log) {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { count } = await supabase
      .from("ripe_measurements")
      .delete()
      .lt("measured_at", cutoff)
      .select("id", { count: "exact", head: true });
    if (count > 0) log?.(`[ripe] cleaned up ${count} rows older than ${RETENTION_H}h`);
  } catch { /* non-fatal */ }
}

async function loadHistory(marketId) {
  if (!supabase) return [];
  try {
    const since = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("ripe_measurements")
      .select("avg_rtt, p95_rtt, loss_pct, probe_count, measured_at")
      .eq("market_id", marketId)
      .gte("measured_at", since)
      .order("measured_at", { ascending: true });
    return data || [];
  } catch {
    return [];
  }
}

// ─── Poll one market ──────────────────────────────────────────────────────────
async function pollMarket(m, log) {
  const s = state.get(m.id);

  // Refresh probes if stale or missing
  const probeAgeH = (Date.now() - s.probesFetchedAt) / 3_600_000;
  if (!s.probes.length || probeAgeH > PROBE_REFRESH_H) {
    log?.(`[ripe] ${m.id}: fetching probes for AS${m.asn}…`);
    s.probes = await fetchProbes(m.asn);
    s.probesFetchedAt = Date.now();
    log?.(`[ripe] ${m.id}: ${s.probes.length} active probes in AS${m.asn}`);
  }

  if (!s.probes.length) {
    s.ok    = false;
    s.error = `No active RIPE Atlas probes found in AS${m.asn}`;
    return;
  }

  const results = await fetchResults(s.probes.map(p => p.id));
  const metrics = computeMetrics(results);

  if (!metrics) {
    s.ok    = false;
    s.error = `No measurement results in last ${RESULT_WINDOW_M} min for AS${m.asn}`;
    return;
  }

  // Rolling history (keep last HISTORY_POINTS)
  s.history = [...s.history.slice(-(HISTORY_POINTS - 1)), metrics];

  // Dynamic baseline: mean avg_rtt over history window
  const baseValues   = s.history.map(h => h.avg_rtt).filter(v => v > 0);
  s.baseline_rtt     = baseValues.length
    ? Math.round((baseValues.reduce((a, b) => a + b, 0) / baseValues.length) * 10) / 10
    : metrics.avg_rtt;

  s.ratio      = Math.round((metrics.avg_rtt / Math.max(0.1, s.baseline_rtt)) * 10) / 10;
  s.status     = statusForRatio(s.ratio);
  s.current    = metrics;
  s.ok         = true;
  s.error      = null;
  s.lastUpdate = Date.now();

  await saveToSupabase(m.id, metrics);
}

// ─── Public: tick all markets ─────────────────────────────────────────────────
export async function tickRipeAtlas(log) {
  if (!RIPE_KEY) {
    log?.("[ripe] RIPE_ATLAS_KEY not set — skipping tick");
    return;
  }
  log?.("[ripe] polling RIPE Atlas measurement #1001…");
  await cleanupOldData(log); // remove rows older than 36h
  for (const m of RIPE_MARKETS) {
    try {
      await pollMarket(m, log);
      const s = state.get(m.id);
      if (s.ok) {
        log?.(`[ripe] ✓ ${m.id}: avg=${s.current.avg_rtt}ms p95=${s.current.p95_rtt}ms loss=${s.current.loss_pct}% probes=${s.current.probe_count} ratio=${s.ratio}× (${s.status})`);
      } else {
        log?.(`[ripe] ✗ ${m.id}: ${s.error}`);
      }
    } catch (e) {
      const s = state.get(m.id);
      s.ok    = false;
      s.error = e.message;
      log?.(`[ripe] ✗ ${m.id}: ${e.message}`);
    }
    // Small delay between markets to avoid burst requests
    await new Promise(r => setTimeout(r, 600));
  }
}

// ─── Public: get current state (for HTTP endpoint) ───────────────────────────
export function getNetworkHealth() {
  return RIPE_MARKETS.map(m => {
    const s = state.get(m.id);
    return {
      id:           m.id,
      name:         m.name,
      flag:         m.flag,
      asn:          m.asn,
      ok:           s.ok,
      error:        s.error,
      current:      s.current,
      baseline_rtt: s.baseline_rtt,
      ratio:        s.ratio,
      status:       s.status,
      // history: array of { avg_rtt, p95_rtt, loss_pct, probe_count, measured_at }
      // last 4h at 5-min resolution — used by frontend for sparkline + trend
      history:      s.history,
      lastUpdate:   s.lastUpdate,
      // Total probes discovered for this ASN (0 = no probes found / RIPE key missing)
      totalProbes:  s.probes.length,
      // Probe location metadata — descriptions (typically city/ISP info) for display
      // Capped at 20 to keep response size reasonable
      probeLocations: s.probes.slice(0, 20).map(p => ({
        id:          p.id,
        country:     p.country,
        lat:         p.lat,
        lon:         p.lon,
        description: p.description,
      })),
    };
  });
}

// ─── Boot: pre-load history from Supabase so baseline is ready on first tick ──
export async function initRipeAtlas(log) {
  initState();
  if (!RIPE_KEY) {
    log?.("[ripe] RIPE_ATLAS_KEY not set — network health data will be unavailable");
    log?.("[ripe] Set RIPE_ATLAS_KEY env var to enable (get a key at atlas.ripe.net/keys/)");
    return;
  }
  if (!supabase) {
    log?.("[ripe] Supabase not configured — history pre-load skipped");
    return;
  }
  log?.("[ripe] loading 4h history from Supabase for baseline bootstrap…");
  for (const m of RIPE_MARKETS) {
    const s = state.get(m.id);
    s.history = await loadHistory(m.id);
    if (s.history.length) {
      log?.(`[ripe] ${m.id}: loaded ${s.history.length} historical points`);
    }
  }
}
