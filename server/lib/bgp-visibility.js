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

  await saveToSupabase(m.id, metrics);
}

// ─── Public: tick all markets ─────────────────────────────────────────────────
export async function tickBgpVisibility(log) {
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
