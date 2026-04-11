// ─── RIPE RIS Live integration ────────────────────────────────────────────────
// Maintains a persistent WebSocket connection to RIPE RIS Live.
// wss://ris-live.ripe.net/v1/ws/
//
// RIS (Routing Information Service) receives BGP feeds from ~30 route collectors
// (RRCs) peered with hundreds of ASes globally. RIS Live streams BGP messages
// in real time.
//
// We subscribe to BGP UPDATE messages and filter for any that include a
// Vodafone ASN in the AS path. This gives us:
//   - ANNOUNCE: new prefix announced (origin or path involves Vodafone AS)
//   - WITHDRAW: prefix withdrawn — may indicate route flap or outage
//
// ─── Deduplication ────────────────────────────────────────────────────────────
// A single logical BGP withdrawal propagates through the global routing table
// and is observed by many RIS route collectors and many peers — each observation
// arrives as a separate RIS Live UPDATE message. Without dedup, a single real
// withdrawal can inflate into hundreds of counted events.
//
// We dedupe by `(type, prefix, 60s time bucket)`: the same prefix withdrawn by
// multiple collectors/peers within a 60s window counts as ONE event. A later
// withdrawal of the same prefix (>60s later) is counted separately, so real
// flap activity remains visible.
//
// No authentication required. Free service.
// Docs: https://ris-live.ripe.net/

import WebSocket from "ws";
import { RIPE_MARKETS } from "./ripe-atlas.js";
import { isPaused } from "./poller-control.js";

const RIS_WS_URL   = "wss://ris-live.ripe.net/v1/ws/";
const RETENTION_MS = 6  * 3600_000;   // keep 6h of events in memory
const DEDUP_BUCKET_MS = 60_000;       // collapse same-prefix events within 60s
const WARN_WD_1H   = 3;               // dedup'd withdrawals/1h threshold for WARNING
const ALERT_WD_1H  = 10;              // dedup'd withdrawals/1h threshold for ALERT
const RECONNECT_MS = 10_000;          // reconnect delay on disconnect

// Build a dedup key: same prefix + same type within a 60s bucket = duplicate
function bucketKey(type, prefix, ts) {
  return `${type}:${prefix}:${Math.floor(ts / DEDUP_BUCKET_MS)}`;
}

// Build ASN lookup Set for fast filtering: Set<number>
const VODAFONE_ASNS = new Set(RIPE_MARKETS.map(m => m.asn));
// Map ASN → market id for routing events to the right market
const ASN_TO_MARKET = new Map(RIPE_MARKETS.map(m => [m.asn, m.id]));

// ─── In-memory state ──────────────────────────────────────────────────────────
// marketId → { events[], withdrawals1h, withdrawals6h, announcements1h, ... }
const state = new Map();

function initState() {
  for (const m of RIPE_MARKETS) {
    state.set(m.id, {
      events:           [],            // { type, prefix, peer, ts, rrc, path }
      seenBuckets:      new Set(),     // dedup keys for events currently in buffer
      withdrawals1h:    0,
      withdrawals6h:    0,
      announcements1h:  0,
      announcements6h:  0,
      lastEvent:        null,
      status:           "ok",     // 0 withdrawals = ok; updated by recompute() each tick
      connected:        false,
    });
  }
}

// ─── Derive counters from event buffer ────────────────────────────────────────
function recompute(marketId) {
  const s   = state.get(marketId);
  const now = Date.now();
  const t1h = now - 3600_000;
  const t6h = now - RETENTION_MS;

  // Drop events older than 6h and rebuild the dedup Set to match so it never
  // grows unbounded.
  s.events = s.events.filter(e => e.ts > t6h);
  s.seenBuckets = new Set(s.events.map(e => bucketKey(e.type, e.prefix, e.ts)));

  s.withdrawals1h   = s.events.filter(e => e.type === "WITHDRAW"  && e.ts > t1h).length;
  s.withdrawals6h   = s.events.filter(e => e.type === "WITHDRAW").length;
  s.announcements1h = s.events.filter(e => e.type === "ANNOUNCE"  && e.ts > t1h).length;
  s.announcements6h = s.events.filter(e => e.type === "ANNOUNCE").length;

  // Status based on withdrawal rate
  if (s.withdrawals1h >= ALERT_WD_1H)     s.status = "alert";
  else if (s.withdrawals1h >= WARN_WD_1H) s.status = "warn";
  else                                     s.status = "ok";
}

// ─── Parse a raw RIS message ──────────────────────────────────────────────────
function handleMessage(raw, log) {
  let msg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (msg.type !== "ris_message") return;

  const d = msg.data;
  if (!d) return;

  const isAnnounce = d.type === "UPDATE" && d.announcements?.length > 0;
  const isWithdraw = d.type === "UPDATE" && d.withdrawals?.length  > 0;
  if (!isAnnounce && !isWithdraw) return;

  // Extract all ASNs from the AS path and find which Vodafone AS is involved
  const path = d.path || [];
  // path is array of AS numbers (may contain sets [{...}] for AS sets — flatten)
  const flatPath = path.flatMap(hop =>
    typeof hop === "object" && hop.type === "set" ? hop.value : [hop]
  );

  const matchedAsn = flatPath.find(asn => VODAFONE_ASNS.has(asn));
  if (!matchedAsn) return;

  const marketId = ASN_TO_MARKET.get(matchedAsn);
  const s = state.get(marketId);
  if (!s) return;

  const ts  = (d.timestamp || Date.now() / 1000) * 1000;
  const rrc = d.host || "unknown";
  const peer = d.peer || "unknown";

  if (isWithdraw) {
    for (const prefix of d.withdrawals) {
      const k = bucketKey("WITHDRAW", prefix, ts);
      if (s.seenBuckets.has(k)) continue;   // same prefix within 60s window = duplicate
      s.seenBuckets.add(k);
      s.events.push({ type: "WITHDRAW", prefix, peer, ts, rrc, asn: matchedAsn });
    }
  }
  if (isAnnounce) {
    for (const ann of d.announcements) {
      const prefix = ann.prefixes?.[0] || ann.prefix || "unknown";
      const k = bucketKey("ANNOUNCE", prefix, ts);
      if (s.seenBuckets.has(k)) continue;   // same prefix within 60s window = duplicate
      s.seenBuckets.add(k);
      s.events.push({ type: "ANNOUNCE", prefix, peer, ts, rrc, asn: matchedAsn });
    }
  }

  s.lastEvent = Date.now();
  recompute(marketId);
}

// ─── WebSocket management ─────────────────────────────────────────────────────
let ws       = null;
let logFn    = null;
let running  = false;

function connect() {
  if (!running) return;

  logFn?.("[ris] connecting to RIS Live WebSocket…");

  ws = new WebSocket(RIS_WS_URL, { handshakeTimeout: 10_000 });

  ws.on("open", () => {
    logFn?.("[ris] ✓ connected to wss://ris-live.ripe.net/v1/ws/");
    for (const s of state.values()) s.connected = true;

    // Subscribe to all BGP UPDATE messages
    // We filter by ASN in handleMessage — no server-side ASN filter in RIS Live v1
    ws.send(JSON.stringify({
      type: "ris_subscribe",
      data: {
        type:          "UPDATE",
        socketOptions: { includeRaw: false },
      },
    }));
  });

  ws.on("message", raw => handleMessage(raw, logFn));

  ws.on("error", err => {
    logFn?.(`[ris] WebSocket error: ${err.message}`);
  });

  ws.on("close", (code, reason) => {
    logFn?.(`[ris] disconnected (${code}): ${reason || "no reason"}. Reconnecting in ${RECONNECT_MS / 1000}s…`);
    for (const s of state.values()) s.connected = false;
    if (running) setTimeout(connect, RECONNECT_MS);
  });
}

// ─── Periodic cleanup (call from poller tick) ─────────────────────────────────
export function tickRisLive(log) {
  if (isPaused("ris")) { log?.("[ris] ⏸ paused"); return; }
  for (const m of RIPE_MARKETS) {
    recompute(m.id);
  }
}

// ─── Public: get current state ────────────────────────────────────────────────
export function getRisLive() {
  return RIPE_MARKETS.map(m => {
    const s = state.get(m.id);
    const sorted = [...s.events].sort((a, b) => b.ts - a.ts);
    const fmt = e => ({ type: e.type, prefix: e.prefix, peer: e.peer, rrc: e.rrc, ts: e.ts });

    // Separate arrays so high-volume announces don't crowd out withdrawals
    const recentWithdrawals  = sorted.filter(e => e.type === "WITHDRAW").slice(0, 20).map(fmt);
    const recentAnnouncements = sorted.filter(e => e.type === "ANNOUNCE").slice(0, 10).map(fmt);

    return {
      id:               m.id,
      connected:        s.connected,
      withdrawals1h:    s.withdrawals1h,
      withdrawals6h:    s.withdrawals6h,
      announcements1h:  s.announcements1h,
      announcements6h:  s.announcements6h,
      lastEvent:        s.lastEvent,
      status:           s.status,
      recentWithdrawals,    // up to 20 most recent withdrawals
      recentAnnouncements,  // up to 10 most recent announcements
      // legacy alias so existing code doesn't break
      recentEvents: sorted.slice(0, 20).map(fmt),
    };
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
export function initRisLive(log) {
  initState();
  logFn  = log;
  running = true;
  connect();
  log?.("[ris] RIS Live module initialised — WebSocket connecting");
}

// ─── Shutdown (optional, for clean exit) ─────────────────────────────────────
export function stopRisLive() {
  running = false;
  ws?.close();
}
