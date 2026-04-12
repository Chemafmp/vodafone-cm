// ─── DNS Measurements module ───────────────────────────────────────────────────
// Polls RIPE Atlas measurement #10001 — DNS SOA query to k.root-servers.net.
// Uses the same Vodafone probes as the ICMP ping (msm #1001), filtered by ASN.
//
// Unlike ICMP ping which tests raw IP reachability, this tests the full DNS
// query path including Vodafone's local resolver. If DNS RTT >> ICMP RTT,
// Vodafone's resolver is slow or overloaded.
//
// Same dynamic baseline + ratio model as ripe-atlas.js:
//   OK      < 2.0× above 4h rolling baseline
//   WARNING ≥ 2.0×
//   OUTAGE  ≥ 4.5×

import { createClient } from "@supabase/supabase-js";
import { RIPE_MARKETS } from "./ripe-atlas.js";
import { isPaused } from "./poller-control.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const RIPE_KEY     = process.env.RIPE_ATLAS_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const RIPE_BASE       = "https://atlas.ripe.net/api/v2";
const MSM_ID          = 10001;     // built-in: DNS SOA to k.root-servers.net
const HISTORY_POINTS      = 432;   // 36h at 5 min/tick
const PROBE_REFRESH_H     = 24;    // re-fetch probe IDs every 24h
const RESULT_WINDOW_M     = 15;    // look back 15 min for latest results
const FETCH_TIMEOUT       = 15_000;
const RETENTION_H         = 36;
const MIN_BASELINE_POINTS = 12;    // 1h of ticks before baseline is reliable
const BASELINE_TRIM_PCT   = 0.10;  // trim top 10% of DNS RTT values (spike rejection)

// ─── Supabase client ──────────────────────────────────────────────────────────
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ─── In-memory state ──────────────────────────────────────────────────────────
const state = new Map();

function initState() {
  for (const m of RIPE_MARKETS) {
    state.set(m.id, {
      probes:          [],
      probesFetchedAt: 0,
      current:         null,
      history:         [],
      probeDetails:    [],   // NEW: per-probe DNS RTT breakdown
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

// ─── Probe discovery (same pattern as ripe-atlas.js) ─────────────────────────
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

// ─── Fetch DNS measurement results ───────────────────────────────────────────
async function fetchResults(probeIds) {
  if (!probeIds.length) return [];
  const stop  = Math.floor(Date.now() / 1000);
  const start = stop - RESULT_WINDOW_M * 60;

  const CHUNK = 500;
  const all   = [];
  for (let i = 0; i < probeIds.length; i += CHUNK) {
    const ids = probeIds.slice(i, i + CHUNK).join(",");
    const url = `${RIPE_BASE}/measurements/${MSM_ID}/results/`
      + `?probe_ids=${ids}&start=${start}&stop=${stop}&format=json`;
    const data = await ripeFetch(url);
    if (Array.isArray(data)) all.push(...data);
  }
  return all;
}

// ─── Compute aggregated DNS metrics ──────────────────────────────────────────
function computeMetrics(results) {
  const rtts = [];
  const rcodes = { noerror: 0, servfail: 0, nxdomain: 0, timeout: 0, other: 0 };

  for (const r of results) {
    // DNS result shape: { prb_id, result: { rt, rcode, answers }, timestamp }
    if (r.result && typeof r.result.rt === "number" && r.result.rt > 0) {
      rtts.push(r.result.rt);
    }
    // Count rcodes for error-rate analysis
    const rcode = r.result?.rcode;
    if (!rcode)                     rcodes.timeout++;
    else if (rcode === "NOERROR")   rcodes.noerror++;
    else if (rcode === "SERVFAIL")  rcodes.servfail++;
    else if (rcode === "NXDOMAIN")  rcodes.nxdomain++;
    else                            rcodes.other++;
  }

  if (!rtts.length) return null;

  const dns_rtt    = rtts.reduce((a, b) => a + b, 0) / rtts.length;
  const p95_dns_rtt = percentile(rtts, 95);
  const probe_count = new Set(results.map(r => r.prb_id).filter(Boolean)).size || results.length;
  const total = Object.values(rcodes).reduce((a, b) => a + b, 0);
  const error_pct = total > 0
    ? Math.round(((rcodes.servfail + rcodes.timeout + rcodes.other) / total) * 1000) / 10
    : 0;

  return {
    dns_rtt:      Math.round(dns_rtt * 10) / 10,
    p95_dns_rtt:  p95_dns_rtt != null ? Math.round(p95_dns_rtt * 10) / 10 : null,
    probe_count,
    measured_at:  new Date().toISOString(),
    rcodes,        // { noerror, servfail, nxdomain, timeout, other }
    error_pct,     // % of non-NOERROR responses (0–100)
  };
}

// ─── Per-probe DNS breakdown ──────────────────────────────────────────────────
// Groups DNS results by probe ID. Returns per-probe avg/p95 DNS RTT.
function computeDnsProbeDetails(results, probes) {
  const byProbe = new Map();
  for (const r of results) {
    const id = r.prb_id;
    if (!id) continue;
    if (!byProbe.has(id)) byProbe.set(id, []);
    byProbe.get(id).push(r);
  }

  const details = [];
  for (const [id, pResults] of byProbe) {
    const meta = probes.find(p => p.id === id);
    const rtts = pResults
      .map(r => r.result?.rt)
      .filter(v => typeof v === "number" && v > 0);

    if (!rtts.length) continue;
    const avg_dns_rtt = rtts.reduce((a, b) => a + b, 0) / rtts.length;
    const p95_dns_rtt = percentile(rtts, 95);

    // Collect rcodes to detect DNS errors
    const rcodes = pResults
      .map(r => r.result?.rcode)
      .filter(Boolean);
    const errorCount = rcodes.filter(rc => rc !== "NOERROR" && rc !== "NXDOMAIN").length;

    details.push({
      id,
      description: meta?.description || null,
      lat:         meta?.lat         ?? null,
      lon:         meta?.lon         ?? null,
      avg_dns_rtt: Math.round(avg_dns_rtt * 10) / 10,
      p95_dns_rtt: p95_dns_rtt != null ? Math.round(p95_dns_rtt * 10) / 10 : null,
      error_count: errorCount,
      sample_count: pResults.length,
    });
  }

  return details.sort((a, b) => (a.avg_dns_rtt ?? 999) - (b.avg_dns_rtt ?? 999));
}

// ─── Ratio → status ───────────────────────────────────────────────────────────
function statusForRatio(ratio) {
  if (ratio >= 4.5) return "outage";
  if (ratio >= 2.0) return "warning";
  return "ok";
}

// ─── Supabase persistence ─────────────────────────────────────────────────────
async function saveToSupabase(marketId, metrics) {
  if (!supabase) return;
  try {
    await supabase.from("dns_measurements").insert({
      market_id:   marketId,
      dns_rtt:     metrics.dns_rtt,
      probe_count: metrics.probe_count,
      measured_at: metrics.measured_at,
    });
  } catch { /* non-fatal */ }
}

// ─── Data retention cleanup ───────────────────────────────────────────────────
async function cleanupOldData(log) {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { count } = await supabase
      .from("dns_measurements")
      .delete()
      .lt("measured_at", cutoff)
      .select("id", { count: "exact", head: true });
    if (count > 0) log?.(`[dns] cleaned up ${count} rows older than ${RETENTION_H}h`);
  } catch { /* non-fatal */ }
}

// ─── Load history from Supabase ───────────────────────────────────────────────
async function loadHistory(marketId) {
  if (!supabase) return [];
  try {
    const since = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("dns_measurements")
      .select("dns_rtt, probe_count, measured_at")
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
    log?.(`[dns] ${m.id}: fetching probes for AS${m.asn}…`);
    s.probes = await fetchProbes(m.asn);
    s.probesFetchedAt = Date.now();
    log?.(`[dns] ${m.id}: ${s.probes.length} active probes in AS${m.asn}`);
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
    s.error = `No DNS measurement results in last ${RESULT_WINDOW_M} min for AS${m.asn}`;
    return;
  }

  // Rolling history
  s.history = [...s.history.slice(-(HISTORY_POINTS - 1)), metrics];

  // Dynamic baseline: trimmed mean of dns_rtt over history window.
  // Same logic as ripe-atlas.js: requires MIN_BASELINE_POINTS ticks (~1h)
  // before alerting, and trims top BASELINE_TRIM_PCT to reject spikes.
  const rawValues = s.history.map(h => h.dns_rtt).filter(v => v > 0);
  if (rawValues.length >= MIN_BASELINE_POINTS) {
    const sorted    = [...rawValues].sort((a, b) => a - b);
    const trimCount = Math.max(1, Math.floor(sorted.length * BASELINE_TRIM_PCT));
    const trimmed   = sorted.slice(0, sorted.length - trimCount);
    s.baseline_rtt  = Math.round((trimmed.reduce((a, b) => a + b, 0) / trimmed.length) * 10) / 10;
    s.ratio         = Math.round((metrics.dns_rtt / Math.max(0.1, s.baseline_rtt)) * 10) / 10;
    s.status        = statusForRatio(s.ratio);
  } else {
    s.baseline_rtt = s.baseline_rtt || metrics.dns_rtt;
    s.ratio        = 1.0;
    s.status       = "unknown";
  }
  s.current    = metrics;
  s.probeDetails = computeDnsProbeDetails(results, s.probes);
  s.ok         = true;
  s.error      = null;
  s.lastUpdate = Date.now();

  await saveToSupabase(m.id, metrics);
}

// ─── Public: tick all markets ─────────────────────────────────────────────────
export async function tickDnsMeasurements(log) {
  if (isPaused("dns")) { log?.("[dns] ⏸ paused"); return; }
  if (!RIPE_KEY) {
    log?.("[dns] RIPE_ATLAS_KEY not set — skipping DNS tick");
    return;
  }
  log?.("[dns] polling RIPE Atlas measurement #10001 (DNS)…");
  await cleanupOldData(log);
  for (const m of RIPE_MARKETS) {
    try {
      await pollMarket(m, log);
      const s = state.get(m.id);
      if (s.ok) {
        log?.(`[dns] ✓ ${m.id}: dns_rtt=${s.current.dns_rtt}ms probes=${s.current.probe_count} ratio=${s.ratio}× (${s.status})`);
      } else {
        log?.(`[dns] ✗ ${m.id}: ${s.error}`);
      }
    } catch (e) {
      const s = state.get(m.id);
      s.ok    = false;
      s.error = e.message;
      log?.(`[dns] ✗ ${m.id}: ${e.message}`);
    }
    // Rate limit: 600ms between markets
    await new Promise(r => setTimeout(r, 600));
  }
}

// ─── Public: get current state (for HTTP endpoint) ───────────────────────────
export function getDnsMeasurements() {
  return RIPE_MARKETS.map(m => {
    const s = state.get(m.id);
    return {
      id:           m.id,
      current:      s.current,
      history:      s.history,
      baseline_rtt: s.baseline_rtt,
      ratio:        s.ratio,
      status:       s.status,
      ok:           s.ok,
      error:        s.error,
      lastUpdate:   s.lastUpdate,
      probeDetails: s.probeDetails,  // NEW
    };
  });
}

// ─── Boot: pre-load history from Supabase ────────────────────────────────────
export async function initDnsMeasurements(log) {
  initState();
  if (!RIPE_KEY) {
    log?.("[dns] RIPE_ATLAS_KEY not set — DNS measurements will be unavailable");
    return;
  }
  if (!supabase) {
    log?.("[dns] Supabase not configured — history pre-load skipped");
    return;
  }
  log?.("[dns] loading DNS measurement history from Supabase…");
  for (const m of RIPE_MARKETS) {
    const s = state.get(m.id);
    s.history = await loadHistory(m.id);
    if (s.history.length) {
      log?.(`[dns] ${m.id}: loaded ${s.history.length} historical points`);
    }
  }
}
