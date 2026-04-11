// ─── CAIDA IODA integration ───────────────────────────────────────────────────
// Polls CAIDA IODA v2 API every 5 min per Vodafone ASN.
// IODA (Internet Outage Detection and Analysis) monitors Internet outages using
// three independent signals:
//   - BGP: prefix withdrawal events from global routing tables
//   - Active probing (UCSD Network Telescope): reduction in unsolicited traffic
//   - Merit Network Telescope: similar darknet-based measurement
//
// A score > 0 means IODA detected anomalous reduction in those signals.
// When multiple datasources align, confidence of outage is high.
//
// API: https://api.ioda.caida.org/v2/
// No authentication required. Rate limit: ~1 req/s sustained.

import { RIPE_MARKETS } from "./ripe-atlas.js";

const IODA_BASE     = "https://api.ioda.caida.org/v2";
const FETCH_TIMEOUT = 15_000;
const RETENTION_H   = 36;
const POLL_WINDOW_H = 6;    // look back 6h when polling for events

// ─── In-memory state ──────────────────────────────────────────────────────────
const state = new Map();

function initState() {
  for (const m of RIPE_MARKETS) {
    state.set(m.id, {
      events:         [],     // last RETENTION_H hours
      hasActiveEvent: false,
      status:         "unknown",
      ok:             false,
      error:          null,
      lastChecked:    null,
    });
  }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function iodaFetch(url) {
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

// ─── Poll one market ──────────────────────────────────────────────────────────
async function pollMarket(m, log) {
  const s = state.get(m.id);
  const now    = Math.floor(Date.now() / 1000);
  const from   = now - POLL_WINDOW_H * 3600;
  const cutoff = now - RETENTION_H * 3600;

  // IODA events endpoint for this ASN
  const url = `${IODA_BASE}/signals/events` +
    `?entityType=asn&entityCode=AS${m.asn}` +
    `&from=${from}&until=${now}&limit=50`;

  const json = await iodaFetch(url);

  // Response: { data: { alerts: [...] } } or { data: [] }
  const rawData = json?.data;
  const alerts  = Array.isArray(rawData)
    ? rawData
    : (rawData?.alerts ?? []);

  // Normalise events into our shape
  const newEvents = alerts.map(a => ({
    id:         a.fqid || `${m.asn}-${a.time}`,
    datasource: a.datasource || a.type || "unknown",
    score:      typeof a.score === "number" ? Math.round(a.score * 10) / 10 : null,
    level:      a.level || (a.score > 1 ? "warning" : "normal"),
    start:      (a.alertStart || a.time) * 1000,   // → ms
    end:        a.alertEnd   ? a.alertEnd * 1000 : null,
    active:     !a.alertEnd || a.alertEnd > now,
  })).filter(e => e.level !== "normal");  // only keep anomalies

  // Merge with existing events, drop anything older than RETENTION_H
  const existingIds = new Set(s.events.map(e => e.id));
  const merged = [
    ...s.events.filter(e => e.start > cutoff * 1000),
    ...newEvents.filter(e => !existingIds.has(e.id)),
  ].sort((a, b) => b.start - a.start);

  const hasActive = merged.some(e => e.active);

  s.events         = merged;
  s.hasActiveEvent = hasActive;
  s.status         = hasActive ? "alert" : "ok";
  s.ok             = true;
  s.error          = null;
  s.lastChecked    = Date.now();

  log?.(`[ioda] ✓ ${m.id} AS${m.asn}: ${merged.length} events (${hasActive ? "ACTIVE" : "ok"})`);
}

// ─── Public: tick all markets ─────────────────────────────────────────────────
export async function tickIoda(log) {
  log?.("[ioda] polling CAIDA IODA…");
  for (const m of RIPE_MARKETS) {
    try {
      await pollMarket(m, log);
    } catch (e) {
      const s = state.get(m.id);
      s.ok     = false;
      s.error  = e.message;
      s.status = "unknown";
      log?.(`[ioda] ✗ ${m.id}: ${e.message}`);
    }
    // 1s between calls to respect IODA rate limit
    await new Promise(r => setTimeout(r, 1000));
  }
}

// ─── Public: get current state ────────────────────────────────────────────────
export function getIoda() {
  return RIPE_MARKETS.map(m => {
    const s = state.get(m.id);
    return {
      id:             m.id,
      events:         s.events,
      hasActiveEvent: s.hasActiveEvent,
      status:         s.status,
      ok:             s.ok,
      error:          s.error,
      lastChecked:    s.lastChecked,
      // Summary counters for easy frontend use
      activeCount:    s.events.filter(e => e.active).length,
      recentCount:    s.events.filter(e => e.start > Date.now() - 3600_000).length, // last 1h
    };
  });
}

// ─── External push (from Mac cron script, bypasses cloud IP block) ───────────
export function injectIodaData(marketId, rawAlerts, log) {
  const s = state.get(marketId);
  if (!s) return false;

  const now    = Math.floor(Date.now() / 1000);
  const cutoff = now - RETENTION_H * 3600;

  const newEvents = rawAlerts.map(a => ({
    id:         a.fqid || `${marketId}-${a.time}`,
    datasource: a.datasource || a.type || "unknown",
    score:      typeof a.score === "number" ? Math.round(a.score * 10) / 10 : null,
    level:      a.level || (a.score > 1 ? "warning" : "normal"),
    start:      (a.alertStart || a.time) * 1000,
    end:        a.alertEnd ? a.alertEnd * 1000 : null,
    active:     !a.alertEnd || a.alertEnd > now,
  })).filter(e => e.level !== "normal");

  const existingIds = new Set(s.events.map(e => e.id));
  const merged = [
    ...s.events.filter(e => e.start > cutoff * 1000),
    ...newEvents.filter(e => !existingIds.has(e.id)),
  ].sort((a, b) => b.start - a.start);

  const hasActive = merged.some(e => e.active);
  s.events         = merged;
  s.hasActiveEvent = hasActive;
  s.status         = hasActive ? "alert" : "ok";
  s.ok             = true;
  s.error          = null;
  s.lastChecked    = Date.now();

  log?.(`[ioda] injected ${newEvents.length} events for ${marketId} (${hasActive ? "ACTIVE" : "ok"})`);
  return true;
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
export function initIoda(log) {
  initState();
  log?.("[ioda] CAIDA IODA module initialised (no auth required)");
}
