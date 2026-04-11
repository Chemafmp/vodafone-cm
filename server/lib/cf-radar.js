// ─── Cloudflare Radar integration ─────────────────────────────────────────────
// Polls Cloudflare Radar API every 5 min per Vodafone ASN.
// Cloudflare has visibility into ~20% of global Internet traffic and actively
// monitors BGP events (hijacks, leaks) and traffic anomalies.
//
// Endpoints used:
//   GET /radar/bgp/hijacks/events   — BGP prefix hijack events involving the ASN
//   GET /radar/bgp/leaks/events     — BGP route leak events involving the ASN
//   GET /radar/traffic-anomalies/   — verified traffic anomalies for the country/ASN
//
// Auth: Bearer token via CF_RADAR_TOKEN env var.
// Docs: https://developers.cloudflare.com/radar/

import { RIPE_MARKETS } from "./ripe-atlas.js";

const CF_BASE      = "https://api.cloudflare.com/client/v4/radar";
const FETCH_TIMEOUT = 15_000;
const RETENTION_H  = 36;
const LOOK_BACK_H  = 6;    // query last 6h of events

// ─── In-memory state ──────────────────────────────────────────────────────────
const state = new Map();

function initState() {
  for (const m of RIPE_MARKETS) {
    state.set(m.id, {
      events:      [],    // merged hijacks + leaks + anomalies, last RETENTION_H
      hasAlert:    false,
      status:      "unknown",
      ok:          false,
      error:       null,
      lastChecked: null,
    });
  }
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
let token = null;

function cfFetch(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: ctrl.signal,
  }).finally(() => clearTimeout(t)).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
    return r.json();
  });
}

function iso(offsetHours) {
  return new Date(Date.now() - offsetHours * 3600_000).toISOString().slice(0, 19) + "Z";
}

// ─── Poll one market ──────────────────────────────────────────────────────────
async function pollMarket(m, log) {
  const s = state.get(m.id);
  const dateStart = iso(LOOK_BACK_H);
  const dateEnd   = iso(0);
  const cutoff    = Date.now() - RETENTION_H * 3600_000;
  const newEvents = [];

  // 1. BGP hijack events involving this ASN
  try {
    const url = `${CF_BASE}/bgp/hijacks/events` +
      `?involvedAsn=${m.asn}&dateStart=${dateStart}&dateEnd=${dateEnd}&per_page=50`;
    const json = await cfFetch(url);
    const hijacks = json?.result?.events || json?.result?.asn_hijacks || [];
    for (const h of hijacks) {
      newEvents.push({
        id:       `hijack-${h.id || h.time}`,
        type:     "HIJACK",
        subtype:  h.type || "prefix_hijack",
        asn:      m.asn,
        prefix:   h.prefix || h.hijacked_prefix || null,
        peer:     null,
        ts:       new Date(h.detected_ts || h.time || dateStart).getTime(),
        active:   !h.resolved_ts,
        source:   "cloudflare",
      });
    }
    log?.(`[radar] ${m.id}: ${hijacks.length} hijack events`);
  } catch (e) {
    log?.(`[radar] ${m.id} hijacks: ${e.message}`);
  }

  // 2. BGP route leak events involving this ASN
  try {
    const url = `${CF_BASE}/bgp/leaks/events` +
      `?involvedAsn=${m.asn}&dateStart=${dateStart}&dateEnd=${dateEnd}&per_page=50`;
    const json = await cfFetch(url);
    const leaks = json?.result?.events || json?.result?.asn_leaks || [];
    for (const l of leaks) {
      newEvents.push({
        id:      `leak-${l.id || l.detected_ts}`,
        type:    "LEAK",
        subtype: l.type || "route_leak",
        asn:     m.asn,
        prefix:  l.prefix || null,
        peer:    null,
        ts:      new Date(l.detected_ts || dateStart).getTime(),
        active:  !l.resolved_ts,
        source:  "cloudflare",
      });
    }
    log?.(`[radar] ${m.id}: ${leaks.length} leak events`);
  } catch (e) {
    log?.(`[radar] ${m.id} leaks: ${e.message}`);
  }

  // Merge: keep existing events still within retention, add new ones (dedup by id)
  const existingIds = new Set(newEvents.map(e => e.id));
  s.events = [
    ...s.events.filter(e => e.ts > cutoff && !existingIds.has(e.id)),
    ...newEvents,
  ].sort((a, b) => b.ts - a.ts);

  s.hasAlert    = s.events.some(e => e.active);
  s.status      = s.hasAlert ? "alert" : (s.events.length > 0 ? "warn" : "ok");
  s.ok          = true;
  s.error       = null;
  s.lastChecked = Date.now();

  log?.(`[radar] ✓ ${m.id} AS${m.asn}: ${s.events.length} total events (${s.hasAlert ? "ALERT" : s.status})`);
}

// ─── Public: tick all markets ─────────────────────────────────────────────────
export async function tickCfRadar(log) {
  if (!token) {
    log?.("[radar] CF_RADAR_TOKEN not set — skipping");
    return;
  }
  log?.("[radar] polling Cloudflare Radar…");
  for (const m of RIPE_MARKETS) {
    try {
      await pollMarket(m, log);
    } catch (e) {
      const s = state.get(m.id);
      s.ok     = false;
      s.error  = e.message;
      s.status = "unknown";
      log?.(`[radar] ✗ ${m.id}: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 500)); // 500ms between markets
  }
}

// ─── Public: get current state ────────────────────────────────────────────────
export function getCfRadar() {
  return RIPE_MARKETS.map(m => {
    const s = state.get(m.id);
    return {
      id:          m.id,
      events:      s.events.slice(0, 20),  // latest 20 for UI
      hasAlert:    s.hasAlert,
      alertCount:  s.events.filter(e => e.active).length,
      recentCount: s.events.filter(e => e.ts > Date.now() - 3600_000).length,
      status:      s.status,
      ok:          s.ok,
      error:       s.error,
      lastChecked: s.lastChecked,
      configured:  !!token,
    };
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
export function initCfRadar(log) {
  token = process.env.CF_RADAR_TOKEN || null;
  initState();
  if (!token) {
    log?.("[radar] CF_RADAR_TOKEN not set — Cloudflare Radar disabled");
  } else {
    log?.("[radar] Cloudflare Radar module initialised (token configured)");
  }
}
