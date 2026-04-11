// ─── BGP Visibility module ─────────────────────────────────────────────────────
// Polls RIPE Stat routing-status API every 5 min per Vodafone market.
// Reports the % of global BGP peers (RIPE RIS) that can see Vodafone prefixes.
//
// Near 100% is normal. A drop signals prefix withdrawal, route leak, or BGP
// session failure — meaning parts of the Internet can no longer reach Vodafone.
// Unlike latency, BGP visibility should always be near 100% — no dynamic baseline.
//
// Status thresholds (static, not ratio-based):
//   OK       ≥ 95%
//   WARNING  ≥ 80% < 95%
//   OUTAGE   < 80%

import { createClient } from "@supabase/supabase-js";
import { RIPE_MARKETS } from "./ripe-atlas.js";
import { isPaused } from "./poller-control.js";

// ─── Config ───────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const RIPE_STAT_BASE  = "https://stat.ripe.net/data";
const HISTORY_POINTS  = 432;    // 36h at 5 min/tick
const FETCH_TIMEOUT   = 15_000;
const RETENTION_H     = 36;

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
      current:    null,
      history:    [],
      status:     "unknown",
      ok:         false,
      error:      null,
      lastUpdate: null,
      // Extended BGP metrics (polled less frequently)
      prefixes:          null,   // { v4_count, v6_count, sample, v4_list, v6_list }
      rpki:              null,   // { valid, invalid, unknown, coverage_pct, sampled, details[] }
      pathLength:        null,   // { avg, min, max, rrc_count }
      prefixDiff:        null,   // { added_v4, removed_v4, added_v6, removed_v6, since }
      prefixChangeLog:   [],     // rolling 36h log: [{ ts, added_v4, removed_v4, added_v6, removed_v6 }]
      extLastUpdate:     0,      // timestamp of last extended poll
    });
  }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function statFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } finally {
    clearTimeout(t);
  }
}

// ─── Status from visibility % ─────────────────────────────────────────────────
function statusForVisibility(pct) {
  if (pct == null) return "unknown";
  if (pct >= 95)  return "ok";
  if (pct >= 80)  return "warning";
  return "outage";
}

// ─── Extended BGP metrics ─────────────────────────────────────────────────────

// Fetch announced prefixes count + sample list (for RPKI check)
async function fetchAnnouncedPrefixes(asn) {
  const url = `${RIPE_STAT_BASE}/announced-prefixes/data.json?resource=AS${asn}`;
  const json = await statFetch(url);
  const prefixes = json?.data?.prefixes || [];
  const v4 = prefixes.filter(p => !p.prefix.includes(":"));
  const v6 = prefixes.filter(p =>  p.prefix.includes(":"));
  return {
    v4_count: v4.length,
    v6_count: v6.length,
    sample:   v4.slice(0, 10).map(p => p.prefix), // first 10 v4 prefixes for RPKI check
    v4_list:  v4.map(p => p.prefix),
    v6_list:  v6.map(p => p.prefix),
  };
}

// Check RPKI validity for a sample of prefixes
async function fetchRpkiCoverage(asn, prefixSample) {
  if (!prefixSample?.length) return null;
  let valid = 0, invalid = 0, unknown = 0;
  const details = [];
  for (const prefix of prefixSample) {
    try {
      const url = `${RIPE_STAT_BASE}/rpki-validation/data.json?resource=AS${asn}&prefix=${prefix}`;
      const json = await statFetch(url);
      const status = json?.data?.status;
      if (status === "valid")        valid++;
      else if (status === "invalid") invalid++;
      else                           unknown++;
      details.push({ prefix, status: status || "unknown" });
    } catch {
      unknown++;
      details.push({ prefix, status: "unknown" });
    }
    await new Promise(r => setTimeout(r, 200)); // 200ms between calls
  }
  const total = valid + invalid + unknown;
  return {
    valid,
    invalid,
    unknown,
    sampled:      total,
    coverage_pct: total > 0 ? Math.round((valid / total) * 1000) / 10 : null,
    details,      // per-prefix: [{ prefix, status }]
  };
}

// Fetch average AS path length (weighted across all RRCs)
async function fetchAsPathLength(asn) {
  const url = `${RIPE_STAT_BASE}/as-path-length/data.json?resource=AS${asn}`;
  const json = await statFetch(url);
  const stats = json?.data?.stats || [];
  if (!stats.length) return null;
  let totalCount = 0, weightedSum = 0, globalMin = Infinity, globalMax = 0;
  for (const s of stats) {
    const count = s.count || 0;
    const avg   = s.stripped?.avg;
    const min   = s.stripped?.min;
    const max   = s.stripped?.max;
    if (count && avg) {
      weightedSum += count * avg;
      totalCount  += count;
    }
    if (min != null && min < globalMin) globalMin = min;
    if (max != null && max > globalMax) globalMax = max;
  }
  if (!totalCount) return null;
  return {
    avg:       Math.round((weightedSum / totalCount) * 100) / 100,
    min:       globalMin === Infinity ? null : globalMin,
    max:       globalMax || null,
    rrc_count: stats.length,
  };
}

// ─── Supabase persistence ─────────────────────────────────────────────────────
async function saveToSupabase(marketId, metrics) {
  if (!supabase) return;
  try {
    await supabase.from("bgp_visibility").insert({
      market_id:           marketId,
      visibility_pct:      metrics.visibility_pct,
      announced_prefixes:  metrics.announced_prefixes,
      measured_at:         metrics.measured_at,
    });
  } catch { /* non-fatal */ }
}

// ─── Data retention cleanup ───────────────────────────────────────────────────
async function cleanupOldData(logFn) {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { count } = await supabase
      .from("bgp_visibility")
      .delete()
      .lt("measured_at", cutoff)
      .select("id", { count: "exact", head: true });
    if (count > 0) logFn?.(`[bgp] cleaned up ${count} rows older than ${RETENTION_H}h`);
  } catch { /* non-fatal */ }
}

// ─── Load history from Supabase ───────────────────────────────────────────────
async function loadHistory(marketId) {
  if (!supabase) return [];
  try {
    const since = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { data } = await supabase
      .from("bgp_visibility")
      .select("visibility_pct, announced_prefixes, measured_at")
      .eq("market_id", marketId)
      .gte("measured_at", since)
      .order("measured_at", { ascending: true });
    return data || [];
  } catch {
    return [];
  }
}

// ─── Poll one market ──────────────────────────────────────────────────────────
async function pollMarket(m) {
  const s = state.get(m.id);
  const url = `${RIPE_STAT_BASE}/routing-status/data.json?resource=AS${m.asn}`;

  const json = await statFetch(url);
  const vis  = json?.data?.visibility;
  const space = json?.data?.announced_space;

  if (!vis) {
    s.ok    = false;
    s.error = `No visibility data in RIPE Stat response for AS${m.asn}`;
    return;
  }

  const v4total  = vis.v4?.total_ris_peers ?? 0;
  const v4seeing = vis.v4?.ris_peers_seeing ?? 0;
  const visibility_pct = v4total > 0
    ? Math.round((v4seeing / v4total) * 1000) / 10
    : null;

  const v4prefixes = space?.v4?.prefixes ?? 0;
  const v6prefixes = space?.v6?.prefixes ?? 0;
  const announced_prefixes = v4prefixes + v6prefixes;

  const metrics = {
    visibility_pct,
    ris_peers_seeing: v4seeing,
    total_ris_peers:  v4total,
    announced_prefixes,
    measured_at: new Date().toISOString(),
  };

  // Rolling history
  s.history = [...s.history.slice(-(HISTORY_POINTS - 1)), metrics];
  s.current    = metrics;
  s.status     = statusForVisibility(visibility_pct);
  s.ok         = true;
  s.error      = null;
  s.lastUpdate = Date.now();

  // Poll extended metrics every 30 min (not every 5 min tick)
  const extAgeMin = (Date.now() - s.extLastUpdate) / 60_000;
  if (extAgeMin > 30 || s.extLastUpdate === 0) {
    try {
      const prev = s.prefixes;
      const pfx  = await fetchAnnouncedPrefixes(m.asn);
      // Compute diff vs previous poll and append to rolling 36h change log
      if (prev?.v4_list && pfx.v4_list) {
        const prevV4 = new Set(prev.v4_list);
        const curV4  = new Set(pfx.v4_list);
        const prevV6 = new Set(prev.v6_list || []);
        const curV6  = new Set(pfx.v6_list || []);
        const added_v4   = pfx.v4_list.filter(p => !prevV4.has(p));
        const removed_v4 = prev.v4_list.filter(p => !curV4.has(p));
        const added_v6   = pfx.v6_list.filter(p => !prevV6.has(p));
        const removed_v6 = (prev.v6_list || []).filter(p => !curV6.has(p));
        const hasChange  = added_v4.length || removed_v4.length || added_v6.length || removed_v6.length;
        s.prefixDiff = { added_v4, removed_v4, added_v6, removed_v6, since: Date.now() };
        // Append to 36h log only when there are actual changes
        if (hasChange) {
          const cutoff = Date.now() - RETENTION_H * 3600 * 1000;
          s.prefixChangeLog = [
            ...s.prefixChangeLog.filter(e => e.ts > cutoff),
            { ts: Date.now(), added_v4, removed_v4, added_v6, removed_v6 },
          ];
        }
      }
      s.prefixes   = pfx;
      s.rpki       = await fetchRpkiCoverage(m.asn, pfx.sample);
      s.pathLength = await fetchAsPathLength(m.asn);
      s.extLastUpdate = Date.now();
    } catch (e) {
      // Non-fatal — extended metrics are best-effort
    }
  }

  await saveToSupabase(m.id, metrics);
}

// ─── Public: tick all markets ─────────────────────────────────────────────────
export async function tickBgpVisibility(log) {
  if (isPaused("bgp")) { log?.("[bgp] ⏸ paused"); return; }
  log?.("[bgp] polling RIPE Stat routing-status…");
  await cleanupOldData(log);
  for (const m of RIPE_MARKETS) {
    try {
      await pollMarket(m);
      const s = state.get(m.id);
      if (s.ok) {
        log?.(`[bgp] ✓ ${m.id}: visibility=${s.current.visibility_pct}% prefixes=${s.current.announced_prefixes} (${s.status})`);
      } else {
        log?.(`[bgp] ✗ ${m.id}: ${s.error}`);
      }
    } catch (e) {
      const s = state.get(m.id);
      s.ok    = false;
      s.error = e.message;
      log?.(`[bgp] ✗ ${m.id}: ${e.message}`);
    }
    // Rate limit: 600ms between markets (RIPE Stat rate limits)
    await new Promise(r => setTimeout(r, 600));
  }
}

// ─── Public: get current state (for HTTP endpoint) ───────────────────────────
export function getBgpVisibility() {
  return RIPE_MARKETS.map(m => {
    const s = state.get(m.id);
    return {
      id:         m.id,
      current:    s.current,
      history:    s.history,
      status:     s.status,
      ok:         s.ok,
      error:      s.error,
      lastUpdate: s.lastUpdate,
      prefixes:        s.prefixes,
      prefixDiff:      s.prefixDiff,
      prefixChangeLog: s.prefixChangeLog,
      rpki:            s.rpki,
      pathLength:      s.pathLength,
    };
  });
}

// ─── Boot: pre-load history from Supabase ────────────────────────────────────
export async function initBgpVisibility(log) {
  initState();
  if (!supabase) {
    log?.("[bgp] Supabase not configured — history pre-load skipped");
    return;
  }
  log?.("[bgp] loading BGP visibility history from Supabase…");
  for (const m of RIPE_MARKETS) {
    const s = state.get(m.id);
    s.history = await loadHistory(m.id);
    if (s.history.length) {
      log?.(`[bgp] ${m.id}: loaded ${s.history.length} historical points`);
    }
  }
}
