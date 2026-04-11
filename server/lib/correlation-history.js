// ─── Correlation score persistence ───────────────────────────────────────────
// Saves the per-market correlation score (0-100) to Supabase every 5 min.
// This is the single most valuable time-series to persist: it summarises all
// 5 signal layers into one number and shows how network confidence evolves.
//
// Also captures IODA active count, Radar alert count, and RIS withdrawals/1h
// so we have a lightweight record of all external signal activity.
//
// Table: correlation_scores
//   id bigserial PRIMARY KEY
//   market_id   text
//   score       int
//   status      text       -- ok | degraded | warning | incident
//   alerts      text[]     -- signal names that fired (atlas, bgp, ioda, radar, ris)
//   ioda_active int        -- IODA active event count
//   radar_alerts int       -- Cloudflare Radar active alert count
//   ris_wd_1h   int        -- RIS Live withdrawals in last 1h
//   measured_at timestamptz DEFAULT now()
//
// SQL to run in Supabase:
//   CREATE TABLE IF NOT EXISTS correlation_scores (
//     id bigserial PRIMARY KEY,
//     market_id text,
//     score int,
//     status text,
//     alerts text[],
//     ioda_active int,
//     radar_alerts int,
//     ris_wd_1h int,
//     measured_at timestamptz DEFAULT now()
//   );

import { createClient } from "@supabase/supabase-js";
import { RIPE_MARKETS } from "./ripe-atlas.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const RETENTION_H  = 36;
const HISTORY_POINTS = 432;   // 36h at 5 min/tick

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ─── In-memory history ────────────────────────────────────────────────────────
// marketId → [{ score, status, alerts, ioda_active, radar_alerts, ris_wd_1h, measured_at }]
const history = new Map();

function initHistory() {
  for (const m of RIPE_MARKETS) history.set(m.id, []);
}

// ─── Load history from Supabase on boot ───────────────────────────────────────
async function loadHistory(log) {
  if (!supabase) return;
  try {
    const since = new Date(Date.now() - RETENTION_H * 3600_000).toISOString();
    const { data, error } = await supabase
      .from("correlation_scores")
      .select("market_id,score,status,alerts,ioda_active,radar_alerts,ris_wd_1h,measured_at")
      .gte("measured_at", since)
      .order("measured_at", { ascending: true });

    if (error) throw new Error(error.message);
    for (const row of data || []) {
      const h = history.get(row.market_id);
      if (h) h.push(row);
    }
    log?.(`[corr-hist] loaded ${(data || []).length} rows from Supabase`);
  } catch (e) {
    log?.(`[corr-hist] load error: ${e.message}`);
  }
}

// ─── Prune old in-memory entries ──────────────────────────────────────────────
function pruneHistory(marketId) {
  const h = history.get(marketId);
  if (!h) return;
  const since = new Date(Date.now() - RETENTION_H * 3600_000).toISOString();
  const pruned = h.filter(r => r.measured_at >= since);
  // Keep at most HISTORY_POINTS entries
  history.set(marketId, pruned.slice(-HISTORY_POINTS));
}

// ─── Save one data point ──────────────────────────────────────────────────────
export async function saveCorrelationPoint(marketId, correlation, signals, log) {
  const row = {
    market_id:   marketId,
    score:       correlation.score,
    status:      correlation.status,
    alerts:      correlation.alerts || [],
    ioda_active: signals.iodaActive ?? null,
    radar_alerts: signals.radarAlerts ?? null,
    ris_wd_1h:   signals.risWd1h ?? null,
    measured_at: new Date().toISOString(),
  };

  // Update in-memory
  const h = history.get(marketId);
  if (h) {
    h.push(row);
    pruneHistory(marketId);
  }

  // Persist to Supabase
  if (!supabase) return;
  try {
    const { error } = await supabase.from("correlation_scores").insert(row);
    if (error) log?.(`[corr-hist] insert ${marketId}: ${error.message}`);
  } catch (e) {
    log?.(`[corr-hist] insert error ${marketId}: ${e.message}`);
  }
}

// ─── Clean old rows from Supabase (call occasionally) ────────────────────────
async function cleanOldRows(log) {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - RETENTION_H * 3600_000).toISOString();
    const { error } = await supabase
      .from("correlation_scores")
      .delete()
      .lt("measured_at", cutoff);
    if (error) log?.(`[corr-hist] cleanup error: ${error.message}`);
  } catch (e) {
    log?.(`[corr-hist] cleanup error: ${e.message}`);
  }
}

// ─── Public: get history for a market ────────────────────────────────────────
export function getCorrelationHistory(marketId) {
  return history.get(marketId) || [];
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
export async function initCorrelationHistory(log) {
  initHistory();
  await loadHistory(log);
  // Clean Supabase rows older than 36h every hour
  setInterval(() => cleanOldRows(log), 3600_000);
  log?.(`[corr-hist] initialised${supabase ? " (Supabase connected)" : " (no Supabase — in-memory only)"}`);
}
