// ─── Signal Fusion View ────────────────────────────────────────────────────────
// Cross-signal correlation across Network Health (RIPE Atlas, BGP, RIS, Radar,
// IODA) and Service Monitor (Downdetector community reports).
//
// Layout:
//   1. Signal Matrix  — 9 markets × 6 signals, always visible
//   2. Event Feed     — chronological stream, incident clustering
//   3. Market Detail  — right panel on row click

import { useState, useEffect, useRef } from "react";
import { T } from "../data/constants.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiBase() {
  const ws = import.meta.env.VITE_POLLER_WS || "ws://localhost:4000";
  if (ws.startsWith("wss://")) return ws.replace(/^wss:\/\//, "https://");
  return ws.replace(/^ws:\/\//, "http://");
}

const STATUS_META = {
  ok:      { label: "OK",      color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
  warning: { label: "WARNING", color: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  outage:  { label: "OUTAGE",  color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  unknown: { label: "NO DATA", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
};
const sm = s => STATUS_META[s] || STATUS_META.unknown;

function normStatus(s) {
  if (!s) return "unknown";
  if (s === "alert") return "outage";
  return s;
}

function dotColor(status) {
  const n = normStatus(status);
  if (n === "ok")      return "#16a34a";
  if (n === "warning") return "#f59e0b";
  if (n === "outage")  return "#dc2626";
  return "#d1d5db";
}

function scoreColor(score) {
  if (score == null) return "#9ca3af";
  if (score >= 90)   return "#16a34a";
  if (score >= 70)   return "#b45309";
  if (score >= 40)   return "#d97706";
  return "#dc2626";
}

function fmtAgo(ts) {
  if (!ts) return "";
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 5)   return "just now";
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return `${Math.round(s / 3600)}h ago`;
}

function fmtHHMM(ts) {
  if (!ts) return "";
  try { return new Date(typeof ts === "number" ? ts : ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }); }
  catch { return ""; }
}

// ─── Signal column definitions ────────────────────────────────────────────────

const SIGNAL_COLS = [
  { key: "atlas",  icon: "📡", label: "Atlas",     shortLabel: "Atlas",  desc: "ICMP latency to k-root (RIPE Atlas)" },
  { key: "bgp",    icon: "🔗", label: "BGP",       shortLabel: "BGP",    desc: "Prefix visibility (RIPE Stat)" },
  { key: "ris",    icon: "🔄", label: "RIS Live",  shortLabel: "RIS",    desc: "Real-time BGP stream (RIPE RIS)" },
  { key: "radar",  icon: "☁️", label: "Radar",     shortLabel: "Radar",  desc: "BGP hijack/leak (Cloudflare)" },
  { key: "ioda",   icon: "🌐", label: "IODA",      shortLabel: "IODA",   desc: "Outage detection (CAIDA)" },
  { key: "smon",   icon: "👥", label: "Downdetector", shortLabel: "DD",  desc: "User reports (Downdetector)" },
];

// ─── Extract per-signal cell data from merged market ─────────────────────────

function getSignalCell(market, svc, colKey) {
  switch (colKey) {
    case "atlas": {
      const s = normStatus(market?.status);
      const rtt = market?.current?.avg_rtt;
      const ratio = market?.ratio;
      return {
        status: s,
        metric: rtt != null ? `${rtt} ms` : "—",
        sub: ratio != null && ratio > 1 ? `×${ratio.toFixed(1)}` : null,
      };
    }
    case "bgp": {
      const s = normStatus(market?.bgp?.status);
      const pct = market?.bgp?.current?.visibility_pct;
      const peers = market?.bgp?.current?.ris_peers_seeing;
      const total = market?.bgp?.current?.total_ris_peers;
      return {
        status: s,
        metric: pct != null ? `${pct}%` : "—",
        sub: peers != null ? `${peers}/${total} peers` : null,
      };
    }
    case "ris": {
      const s = normStatus(market?.ris?.status);
      const wd = market?.ris?.withdrawals1h;
      return {
        status: market?.ris?.connected === false ? "unknown" : s,
        metric: wd != null ? `${wd} wd/h` : "—",
        sub: market?.ris?.connected === false ? "disconnected" : null,
      };
    }
    case "radar": {
      const s = normStatus(market?.radar?.status);
      const n = market?.radar?.alertCount;
      return {
        status: market?.radar?.configured === false ? "unknown" : s,
        metric: n != null ? (n === 0 ? "clear" : `${n} evt`) : "—",
        sub: null,
      };
    }
    case "ioda": {
      const s = normStatus(market?.ioda?.status);
      const n = market?.ioda?.activeCount ?? market?.ioda?.hasActiveEvent ? 1 : 0;
      return {
        status: s,
        metric: s === "unknown" ? "—" : (n > 0 ? `${n} active` : "clear"),
        sub: null,
      };
    }
    case "smon": {
      if (!svc) return { status: "unknown", metric: "—", sub: null };
      const s = normStatus(svc.status);
      return {
        status: s,
        metric: svc.complaints != null ? `${svc.complaints} rep` : "—",
        sub: svc.ratio != null && svc.ratio > 1 ? `×${svc.ratio.toFixed(1)}` : null,
      };
    }
    default:
      return { status: "unknown", metric: "—", sub: null };
  }
}

// ─── Build chronological event feed ──────────────────────────────────────────

function buildFeed(markets, svcMap) {
  const events = [];
  const now = Date.now();

  for (const m of markets) {
    const svc = svcMap[m.id];

    // RIS withdrawals (real timestamps)
    for (const e of (m.ris?.recentWithdrawals || [])) {
      events.push({
        id: `ris-wd-${m.id}-${e.prefix}-${e.ts}`,
        ts: e.ts,
        marketId: m.id,
        flag: m.flag,
        marketName: m.name,
        signal: "ris",
        icon: "🔄",
        severity: "warning",
        text: `BGP WITHDRAW ${e.prefix}`,
        sub: `via ${e.rrc} · peer ${e.peer}`,
      });
    }

    // IODA events
    for (const e of (m.ioda?.events || [])) {
      events.push({
        id: `ioda-${m.id}-${e.start || e.ts || now}`,
        ts: e.start ? new Date(e.start).getTime() : (e.ts || now),
        marketId: m.id,
        flag: m.flag,
        marketName: m.name,
        signal: "ioda",
        icon: "🌐",
        severity: e.severity || "alert",
        text: `IODA: ${e.type || "outage signal"}`,
        sub: e.datasource ? `datasource: ${e.datasource}` : null,
      });
    }

    // Radar events
    for (const e of (m.radar?.events || [])) {
      events.push({
        id: `radar-${m.id}-${e.id || now}`,
        ts: e.start ? new Date(e.start).getTime() : (e.ts || now),
        marketId: m.id,
        flag: m.flag,
        marketName: m.name,
        signal: "radar",
        icon: "☁️",
        severity: "alert",
        text: `Radar: ${e.type || "BGP event"}`,
        sub: e.prefix ? `prefix ${e.prefix}` : null,
      });
    }

    // Synthesize: current degraded Atlas state
    const atlasS = normStatus(m.status);
    if (atlasS === "warning" || atlasS === "outage") {
      const measuredAt = m.current?.measured_at;
      events.push({
        id: `atlas-${m.id}-${atlasS}`,
        ts: measuredAt ? new Date(measuredAt).getTime() : now - 60_000,
        marketId: m.id,
        flag: m.flag,
        marketName: m.name,
        signal: "atlas",
        icon: "📡",
        severity: atlasS,
        text: `Atlas ${atlasS === "outage" ? "OUTAGE" : "WARNING"}: ${m.current?.avg_rtt ?? "?"}ms avg latency`,
        sub: m.ratio ? `×${m.ratio.toFixed(1)} above baseline` : null,
      });
    }

    // Synthesize: current degraded BGP state
    const bgpS = normStatus(m.bgp?.status);
    if (bgpS === "warning" || bgpS === "outage") {
      events.push({
        id: `bgp-${m.id}-${bgpS}`,
        ts: now - 30_000,
        marketId: m.id,
        flag: m.flag,
        marketName: m.name,
        signal: "bgp",
        icon: "🔗",
        severity: bgpS,
        text: `BGP visibility ${bgpS}: ${m.bgp?.current?.visibility_pct ?? "?"}%`,
        sub: `${m.bgp?.current?.ris_peers_seeing ?? "?"}/${m.bgp?.current?.total_ris_peers ?? "?"} peers`,
      });
    }

    // Synthesize: community reports spike
    if (svc && (svc.status === "warning" || svc.status === "outage")) {
      events.push({
        id: `smon-${m.id}`,
        ts: svc.lastUpdate || now,
        marketId: m.id,
        flag: m.flag,
        marketName: m.name,
        signal: "smon",
        icon: "👥",
        severity: svc.status,
        text: `Downdetector spike: ${svc.complaints} reports`,
        sub: svc.ratio != null ? `×${svc.ratio.toFixed(1)} above baseline` : null,
      });
    }
  }

  // Sort newest first
  events.sort((a, b) => b.ts - a.ts);

  // Cluster: group events by market within 30-min windows
  const clusters = [];
  const used = new Set();
  for (const ev of events) {
    if (used.has(ev.id)) continue;
    const siblings = events.filter(e =>
      !used.has(e.id) &&
      e.marketId === ev.marketId &&
      Math.abs(e.ts - ev.ts) < 30 * 60_000
    );
    if (siblings.length >= 2) {
      siblings.forEach(s => used.add(s.id));
      clusters.push({ type: "incident", ts: Math.max(...siblings.map(s => s.ts)), marketId: ev.marketId, flag: ev.flag, marketName: ev.marketName, events: siblings });
    } else {
      used.add(ev.id);
      clusters.push({ type: "event", ts: ev.ts, ...ev });
    }
  }

  return clusters.sort((a, b) => b.ts - a.ts).slice(0, 60);
}

// ─── MatrixCell ───────────────────────────────────────────────────────────────

function MatrixCell({ cell }) {
  const { status, metric, sub } = cell;
  const color = dotColor(status);
  const isOk  = status === "ok" || status === "unknown";
  return (
    <div style={{ textAlign: "center", minWidth: 70 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{
          fontSize: 11, fontFamily: "monospace", fontWeight: isOk ? 400 : 700,
          color: isOk ? T.muted : color,
        }}>{metric}</span>
      </div>
      {sub && <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

// ─── Signal Matrix ────────────────────────────────────────────────────────────

function SignalMatrix({ markets, svcMap, showDegradedOnly, selected, onSelect }) {
  const rows = showDegradedOnly
    ? markets.filter(m => {
        const anyDegraded = [
          normStatus(m.status),
          normStatus(m.bgp?.status),
          normStatus(m.ris?.status),
          normStatus(m.radar?.status),
          normStatus(m.ioda?.status),
          normStatus(svcMap[m.id]?.status),
        ].some(s => s === "warning" || s === "outage");
        return anyDegraded;
      })
    : markets;

  if (rows.length === 0) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center", color: T.muted, fontSize: 13 }}>
        ✅ All markets healthy — no degraded signals
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: T.surface }}>
            <th style={{ textAlign: "left", padding: "8px 12px", fontWeight: 700, color: T.muted, fontSize: 10, letterSpacing: "0.4px", whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}` }}>
              MARKET
            </th>
            <th style={{ textAlign: "center", padding: "8px 8px", fontWeight: 700, color: T.muted, fontSize: 10, letterSpacing: "0.4px", borderBottom: `1px solid ${T.border}` }}>
              SCORE
            </th>
            {SIGNAL_COLS.map(col => (
              <th key={col.key} title={col.desc}
                style={{ textAlign: "center", padding: "8px 8px", fontWeight: 700, color: T.muted, fontSize: 10, letterSpacing: "0.4px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                {col.icon} {col.shortLabel}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((market, i) => {
            const svc = svcMap[market.id];
            const isSelected = selected?.id === market.id;
            const score = market.correlation?.score;
            const overallStatus = normStatus(market.status);
            const isHealthy = [
              overallStatus,
              normStatus(market.bgp?.status),
              normStatus(market.ris?.status),
              normStatus(market.radar?.status),
              normStatus(market.ioda?.status),
              normStatus(svc?.status),
            ].every(s => s === "ok" || s === "unknown");

            return (
              <tr
                key={market.id}
                onClick={() => onSelect(isSelected ? null : market)}
                style={{
                  background: isSelected
                    ? `${T.border}80`
                    : i % 2 === 0 ? "transparent" : `${T.surface}`,
                  borderBottom: `1px solid ${T.border}`,
                  cursor: "pointer",
                  transition: "background 0.1s",
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = `${T.border}50`; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = i % 2 === 0 ? "transparent" : T.surface; }}
              >
                {/* Market name */}
                <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    {isSelected && <span style={{ color: "#e40000", fontSize: 8 }}>▶</span>}
                    <span style={{ fontSize: 16 }}>{market.flag}</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 12, color: T.text }}>{market.name}</div>
                      <div style={{ fontSize: 9, color: T.muted }}>AS{market.asn}</div>
                    </div>
                    {!isHealthy && (
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: dotColor(market.correlation?.status || market.status),
                        flexShrink: 0,
                      }} />
                    )}
                  </div>
                </td>

                {/* Correlation score */}
                <td style={{ textAlign: "center", padding: "9px 8px" }}>
                  {score != null ? (
                    <span style={{
                      fontSize: 13, fontWeight: 800, fontFamily: "monospace",
                      color: scoreColor(score),
                    }}>{score}</span>
                  ) : (
                    <span style={{ color: T.muted, fontSize: 10 }}>—</span>
                  )}
                </td>

                {/* Signal cells */}
                {SIGNAL_COLS.map(col => (
                  <td key={col.key} style={{ padding: "9px 8px" }}>
                    <MatrixCell cell={getSignalCell(market, svc, col.key)} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Event Feed ───────────────────────────────────────────────────────────────

function EventFeed({ markets, svcMap }) {
  const feed = buildFeed(markets, svcMap);

  if (feed.length === 0) {
    return (
      <div style={{ padding: "24px 0", textAlign: "center", color: T.muted, fontSize: 12 }}>
        No signal events detected. All markets are healthy.
      </div>
    );
  }

  const severityColor = s => {
    if (s === "outage" || s === "alert") return "#dc2626";
    if (s === "warning" || s === "warn") return "#b45309";
    return "#6b7280";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {feed.map((item, i) => {
        if (item.type === "incident") {
          // Clustered incident
          const worst = item.events.some(e => e.severity === "outage" || e.severity === "alert") ? "outage" : "warning";
          const sc = sm(worst);
          return (
            <div key={`cluster-${i}`} style={{
              background: sc.bg, border: `1px solid ${sc.border}`,
              borderLeft: `4px solid ${sc.color}`,
              borderRadius: 8, padding: "10px 14px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 14 }}>⚡</span>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 12, color: sc.color }}>
                    PROBABLE INCIDENT
                  </span>
                  <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>
                    {item.flag} {item.marketName}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: T.muted }}>{fmtAgo(item.ts)}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {item.events.map((e, j) => (
                  <div key={j} style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 11 }}>
                    <span>{e.icon}</span>
                    <span style={{ color: severityColor(e.severity), fontWeight: 600 }}>{e.text}</span>
                    {e.sub && <span style={{ color: T.muted, fontSize: 10 }}>{e.sub}</span>}
                    <span style={{ color: T.muted, fontSize: 9, marginLeft: "auto" }}>{fmtHHMM(e.ts)}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: sc.color, marginTop: 6, fontWeight: 600 }}>
                {item.events.length} signals correlated within 30 min — open ticket if not yet tracked
              </div>
            </div>
          );
        }

        // Single event
        const color = severityColor(item.severity);
        const isAlert = item.severity === "outage" || item.severity === "alert";
        return (
          <div key={item.id || i} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "7px 12px",
            background: isAlert ? "#fef2f2" : item.severity === "warning" ? "#fffbeb" : T.surface,
            border: `1px solid ${isAlert ? "#fca5a5" : item.severity === "warning" ? "#fcd34d" : T.border}`,
            borderRadius: 6,
          }}>
            <span style={{ fontSize: 13, flexShrink: 0 }}>{item.icon}</span>
            <span style={{ fontSize: 11, color: T.muted, flexShrink: 0, fontFamily: "monospace" }}>
              {item.flag}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: isAlert ? 700 : 500, color }}>{item.text}</span>
              {item.sub && <span style={{ fontSize: 10, color: T.muted, marginLeft: 6 }}>{item.sub}</span>}
            </div>
            <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>{fmtAgo(item.ts)}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Correlation Chart ────────────────────────────────────────────────────────
// 5 normalised series + RIS markers + zoom selector (30m → 24h).
// All series normalised independently to [0,1] so they can share one Y-axis
// regardless of unit (ms, %, count). Hover tooltip shows raw value.

const CORR_ZOOMS = [
  { label: "30m", ms: 30 * 60_000 },
  { label: "1h",  ms:  1 * 3600_000 },
  { label: "2h",  ms:  2 * 3600_000 },
  { label: "6h",  ms:  6 * 3600_000 },
  { label: "12h", ms: 12 * 3600_000 },
  { label: "24h", ms: 24 * 3600_000 },
];

const CORR_SERIES = [
  { key: "smon",     label: "Downdetector", color: "#f59e0b", area: true  },
  { key: "atlas",    label: "Atlas RTT",  color: "#3b82f6", area: false },
  { key: "bgp",      label: "BGP vis%",   color: "#f97316", area: false },
  { key: "iodaBgp",  label: "IODA BGP",   color: "#8b5cf6", area: false },
  { key: "iodaPing", label: "IODA ping",  color: "#06b6d4", area: false },
];

// Units shown in tooltip per series key
const CORR_UNITS = {
  smon:     { unit: "rep",   fmt: v => Math.round(v) },
  atlas:    { unit: "ms",    fmt: v => v.toFixed(1) },
  bgp:      { unit: "%",     fmt: v => v.toFixed(1) },
  iodaBgp:  { unit: "",      fmt: v => v.toFixed(1) },
  iodaPing: { unit: "/24s",  fmt: v => Math.round(v) },
};

function CorrelationChart({ market, svc }) {
  const [zoom, setZoom]     = useState("2h");
  const [hover, setHover]   = useState(null); // { svgX, ts, rows:[{key,label,color,rawVal,unit}] }
  const svgRef              = useRef(null);

  const windowMs = CORR_ZOOMS.find(z => z.label === zoom)?.ms || 2 * 3600_000;
  const now      = Date.now();
  const startMs  = now - windowMs;

  // ── Build series ───────────────────────────────────────────────────────────
  // Use persistent Supabase history if available; fall back to in-memory trend reconstruction
  const smonPts = (() => {
    if (svc?.history?.length) {
      return svc.history
        .filter(p => p.ts >= startMs && typeof p.value === "number")
        .map(p => ({ ts: p.ts, v: p.value }));
    }
    if (!svc?.trend?.length) return [];
    const len = svc.trend.length;
    return svc.trend
      .map((v, i) => ({ ts: now - (len - 1 - i) * 30_000, v }))
      .filter(p => p.ts >= startMs && typeof p.v === "number");
  })();

  const atlasPts = (market?.history || [])
    .map(h => ({ ts: h.measured_at ? new Date(h.measured_at).getTime() : (h.ts || 0), v: h.avg_rtt ?? h.value ?? null }))
    .filter(p => p.ts >= startMs && p.v != null);

  const bgpPts = (market?.bgp?.history || [])
    .map(h => ({ ts: h.measured_at ? new Date(h.measured_at).getTime() : (h.ts || 0), v: h.visibility_pct ?? h.value ?? null }))
    .filter(p => p.ts >= startMs && p.v != null);

  const iodaBgpPts = (market?.ioda?.signals?.bgp?.history || [])
    .map(h => ({ ts: h.ts || (h.measured_at ? new Date(h.measured_at).getTime() : 0), v: h.value ?? null }))
    .filter(p => p.ts >= startMs && p.v != null);

  const iodaPingPts = (market?.ioda?.signals?.ping?.history || [])
    .map(h => ({ ts: h.ts || (h.measured_at ? new Date(h.measured_at).getTime() : 0), v: h.value ?? null }))
    .filter(p => p.ts >= startMs && p.v != null);

  const risTimes = (market?.ris?.recentWithdrawals || [])
    .filter(e => e.ts >= startMs).map(e => e.ts);

  const seriesData = { smon: smonPts, atlas: atlasPts, bgp: bgpPts, iodaBgp: iodaBgpPts, iodaPing: iodaPingPts };

  // ── Normalise ──────────────────────────────────────────────────────────────
  function normalize(pts) {
    if (pts.length < 2) return pts.map(p => ({ ...p, norm: 0.5 }));
    const vals = pts.map(p => p.v);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    return pts.map(p => ({ ...p, norm: (p.v - min) / range }));
  }

  const normData = Object.fromEntries(
    Object.entries(seriesData).map(([k, pts]) => [k, normalize(pts)])
  );

  const hasData = Object.values(seriesData).some(pts => pts.length > 1);
  if (!hasData) return (
    <div style={{ padding: "10px 0", textAlign: "center", color: T.muted, fontSize: 9 }}>
      Not enough history for correlation chart
    </div>
  );

  // ── SVG geometry ───────────────────────────────────────────────────────────
  const W = 380, H = 160;
  const PAD = { top: 10, right: 10, bottom: 22, left: 10 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const tx = ts => PAD.left + ((ts - startMs) / windowMs) * plotW;
  const ty = n  => PAD.top + plotH - n * plotH;

  function linePath(pts) {
    if (pts.length < 2) return "";
    return pts.map((p, i) => `${i === 0 ? "M" : "L"}${tx(p.ts).toFixed(1)},${ty(p.norm).toFixed(1)}`).join(" ");
  }
  function areaPath(pts) {
    if (pts.length < 2) return "";
    const botY = (PAD.top + plotH).toFixed(1);
    return `${linePath(pts)} L${tx(pts.at(-1).ts).toFixed(1)},${botY} L${tx(pts[0].ts).toFixed(1)},${botY} Z`;
  }

  // X-axis ticks
  const tickCount = 5;
  const xTicks = Array.from({ length: tickCount }, (_, i) => {
    const ts = startMs + (i / (tickCount - 1)) * windowMs;
    return { ts, label: i === tickCount - 1 ? "now" : fmtHHMM(ts), anchor: i === 0 ? "start" : i === tickCount - 1 ? "end" : "middle" };
  });

  // ── Hover handler ──────────────────────────────────────────────────────────
  function handleMouseMove(e) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Scale clientX → viewBox X
    const svgX = ((e.clientX - rect.left) / rect.width) * W;
    const clampedX = Math.max(PAD.left, Math.min(PAD.left + plotW, svgX));
    const hoverTs = startMs + ((clampedX - PAD.left) / plotW) * windowMs;

    // Nearest raw value per series (within reasonable tolerance)
    const rows = CORR_SERIES.map(s => {
      const pts = seriesData[s.key];
      if (!pts.length) return null;
      const nearest = pts.reduce((best, p) =>
        Math.abs(p.ts - hoverTs) < Math.abs(best.ts - hoverTs) ? p : best
      );
      // Only show if within 10% of window from cursor
      if (Math.abs(nearest.ts - hoverTs) > windowMs * 0.1) return null;
      const u = CORR_UNITS[s.key];
      return { key: s.key, label: s.label, color: s.color, val: `${u.fmt(nearest.v)} ${u.unit}`.trim() };
    }).filter(Boolean);

    // RIS markers nearby
    const nearRis = risTimes.filter(ts => Math.abs(ts - hoverTs) < windowMs * 0.05);

    setHover({ svgX: clampedX, ts: hoverTs, rows, risCount: nearRis.length });
  }

  // Tooltip left/right flip so it doesn't go off-edge
  const tooltipOnRight = hover ? hover.svgX < W * 0.65 : true;

  return (
    <div style={{ marginBottom: 14 }}>
      {/* Title + zoom bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", textTransform: "uppercase" }}>
          Correlation Chart
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {CORR_ZOOMS.map(z => (
            <button key={z.label} onClick={() => setZoom(z.label)} style={{
              padding: "2px 6px", fontSize: 9, fontWeight: 600, cursor: "pointer",
              fontFamily: "inherit", borderRadius: 4,
              border: `1px solid ${zoom === z.label ? "#3b82f6" : T.border}`,
              background: zoom === z.label ? "#3b82f6" : "transparent",
              color: zoom === z.label ? "#fff" : T.muted,
            }}>{z.label}</button>
          ))}
        </div>
      </div>

      {/* Legend — only series with data */}
      <div style={{ display: "flex", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
        {CORR_SERIES.filter(s => normData[s.key]?.length > 1).map(s => (
          <span key={s.key} style={{ fontSize: 9, color: s.color, display: "flex", alignItems: "center", gap: 3 }}>
            {s.area
              ? <span style={{ width: 10, height: 6, background: s.color + "33", border: `1px solid ${s.color}`, borderRadius: 2, display: "inline-block" }} />
              : <span style={{ width: 14, height: 2, background: s.color, display: "inline-block" }} />
            }
            {s.label}
          </span>
        ))}
        {risTimes.length > 0 && (
          <span style={{ fontSize: 9, color: "#dc2626", display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 1, height: 9, background: "#dc2626", display: "inline-block" }} />
            BGP wd
          </span>
        )}
      </div>

      {/* SVG chart */}
      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          {/* Grid */}
          {[0, 0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={PAD.left} y1={ty(f)} x2={PAD.left + plotW} y2={ty(f)}
              stroke={f === 0 || f === 1 ? "#d1d5db" : "#f3f4f6"} strokeWidth="0.5" />
          ))}

          {/* Area fills */}
          {CORR_SERIES.filter(s => s.area && normData[s.key]?.length > 1).map(s => (
            <path key={`${s.key}-area`} d={areaPath(normData[s.key])} fill={s.color + "22"} stroke="none" />
          ))}

          {/* Lines */}
          {CORR_SERIES.filter(s => normData[s.key]?.length > 1).map(s => (
            <path key={s.key} d={linePath(normData[s.key])} fill="none" stroke={s.color} strokeWidth="1.5" />
          ))}

          {/* Dot on each series at hover position */}
          {hover && CORR_SERIES.map(s => {
            const pts = seriesData[s.key];
            if (!pts.length) return null;
            const nearest = pts.reduce((b, p) => Math.abs(p.ts - hover.ts) < Math.abs(b.ts - hover.ts) ? p : b);
            const nd = normData[s.key]?.find(p => p.ts === nearest.ts);
            if (!nd) return null;
            return (
              <circle key={s.key}
                cx={tx(nearest.ts)} cy={ty(nd.norm)}
                r="3" fill={s.color} stroke="#fff" strokeWidth="1.5" />
            );
          })}

          {/* RIS withdrawal markers */}
          {risTimes.map((ts, i) => (
            <line key={i} x1={tx(ts)} y1={PAD.top} x2={tx(ts)} y2={PAD.top + plotH}
              stroke="#dc2626" strokeWidth="1" strokeDasharray="3,2" opacity="0.75" />
          ))}

          {/* Hover crosshair */}
          {hover && (
            <line x1={hover.svgX} y1={PAD.top} x2={hover.svgX} y2={PAD.top + plotH}
              stroke="#64748b" strokeWidth="0.75" strokeDasharray="3,2" />
          )}

          {/* X-axis */}
          <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH}
            stroke="#d1d5db" strokeWidth="0.5" />
          {xTicks.map((t, i) => (
            <text key={i} x={tx(t.ts)} y={H - 5}
              textAnchor={t.anchor} fontSize="7" fill="#9ca3af">{t.label}</text>
          ))}
        </svg>

        {/* Hover tooltip — rendered as HTML div over the SVG */}
        {hover && hover.rows.length > 0 && (
          <div style={{
            position: "absolute",
            top: 6,
            ...(tooltipOnRight
              ? { left: `${(hover.svgX / W) * 100 + 2}%` }
              : { right: `${((W - hover.svgX) / W) * 100 + 2}%` }),
            background: "rgba(15,23,42,0.92)",
            border: "1px solid #334155",
            borderRadius: 6,
            padding: "6px 9px",
            pointerEvents: "none",
            zIndex: 10,
            minWidth: 130,
          }}>
            <div style={{ fontSize: 8, color: "#94a3b8", marginBottom: 5, fontFamily: "monospace" }}>
              {fmtHHMM(hover.ts)}
            </div>
            {hover.rows.map(r => (
              <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: r.color, flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: "#cbd5e1", flex: 1 }}>{r.label}</span>
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: "monospace", color: "#f1f5f9" }}>{r.val}</span>
              </div>
            ))}
            {hover.risCount > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3, paddingTop: 3, borderTop: "1px solid #334155" }}>
                <span style={{ width: 6, height: 6, borderRadius: 1, background: "#dc2626", flexShrink: 0 }} />
                <span style={{ fontSize: 9, color: "#fca5a5" }}>BGP withdraw ×{hover.risCount}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Market Detail Panel ──────────────────────────────────────────────────────

function MarketDetailPanel({ market, svc, onClose, onOpenNetworkHealth }) {
  if (!market) return null;

  const score = market.correlation?.score;
  const insight = market.correlation?.insight;
  const signals = [
    { col: SIGNAL_COLS[0], cell: getSignalCell(market, svc, "atlas") },
    { col: SIGNAL_COLS[1], cell: getSignalCell(market, svc, "bgp") },
    { col: SIGNAL_COLS[2], cell: getSignalCell(market, svc, "ris") },
    { col: SIGNAL_COLS[3], cell: getSignalCell(market, svc, "radar") },
    { col: SIGNAL_COLS[4], cell: getSignalCell(market, svc, "ioda") },
    { col: SIGNAL_COLS[5], cell: getSignalCell(market, svc, "smon") },
  ];

  return (
    <div style={{
      width: 400, flexShrink: 0,
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, display: "flex", flexDirection: "column",
      maxHeight: "100%", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 14px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 22 }}>{market.flag}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{market.name}</div>
          <div style={{ fontSize: 10, color: T.muted }}>AS{market.asn} · {SIGNAL_COLS.length} signals</div>
        </div>
        {score != null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "monospace", color: scoreColor(score), lineHeight: 1 }}>
              {score}
            </div>
            <div style={{ fontSize: 8, color: T.muted }}>HEALTH SCORE</div>
          </div>
        )}
        <button onClick={onClose} style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 16, color: T.muted, padding: "2px 4px",
        }}>×</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
        {/* Current Atlas metrics */}
        {market.current && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>
              ICMP Latency (RIPE Atlas)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              {[
                { label: "AVG RTT",  value: `${market.current.avg_rtt} ms`,   color: dotColor(market.status) },
                { label: "P95 RTT",  value: `${market.current.p95_rtt} ms`,   color: T.text },
                { label: "LOSS",     value: `${market.current.loss_pct}%`,     color: market.current.loss_pct > 0 ? "#dc2626" : T.text },
                { label: "BASELINE", value: market.baseline_rtt ? `${market.baseline_rtt} ms` : "—", color: T.muted },
                { label: "RATIO",    value: market.ratio ? `×${market.ratio.toFixed(1)}` : "—", color: market.ratio >= 4.5 ? "#dc2626" : market.ratio >= 2 ? "#b45309" : T.muted },
                { label: "PROBES",   value: `${market.current.probe_count}/${market.totalProbes}`, color: T.text },
              ].map(m => (
                <div key={m.label} style={{ background: T.bg, borderRadius: 6, padding: "7px 9px", textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: T.muted, fontWeight: 700, letterSpacing: "0.4px", marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: m.color }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Signal status list */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>
            Signal Layers
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {signals.map(({ col, cell }) => {
              const c = dotColor(cell.status);
              const isOk = cell.status === "ok" || cell.status === "unknown";
              return (
                <div key={col.key} style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "6px 10px", borderRadius: 6,
                  background: isOk ? "transparent" : (cell.status === "outage" ? "#fef2f222" : "#fffbeb44"),
                  border: `1px solid ${isOk ? T.border : (cell.status === "outage" ? "#fca5a5" : "#fcd34d")}`,
                }}>
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{col.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{col.label}</div>
                    <div style={{ fontSize: 9, color: T.muted }}>{col.desc}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: isOk ? 400 : 700, fontFamily: "monospace", color: c }}>{cell.metric}</div>
                    {cell.sub && <div style={{ fontSize: 9, color: T.muted }}>{cell.sub}</div>}
                  </div>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: c, flexShrink: 0 }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Insight */}
        {insight && (
          <div style={{
            marginBottom: 14, padding: "10px 12px",
            background: "#eff6ff", border: "1px solid #bfdbfe",
            borderRadius: 8, fontSize: 11, color: "#1e40af", lineHeight: 1.6,
          }}>
            💡 {insight}
          </div>
        )}

        {/* Community reports */}
        {svc && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>
              Community Reports (Downdetector)
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {[
                { label: "REPORTS", value: svc.complaints != null ? String(svc.complaints) : "—" },
                { label: "RATIO",   value: svc.ratio != null ? `×${svc.ratio.toFixed(1)}` : "—" },
              ].map(m => (
                <div key={m.label} style={{ background: T.bg, borderRadius: 6, padding: "7px 9px", textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: T.muted, fontWeight: 700, letterSpacing: "0.4px", marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: T.text }}>{m.value}</div>
                </div>
              ))}
            </div>
            {svc.services && Object.keys(svc.services).length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                {Object.entries(svc.services).slice(0, 6).map(([id, s]) => (
                  <span key={id} style={{
                    fontSize: 9, padding: "2px 7px", borderRadius: 4,
                    background: s.status === "ok" ? "#f0fdf4" : s.status === "warning" ? "#fffbeb" : "#fef2f2",
                    border: `1px solid ${s.status === "ok" ? "#86efac" : s.status === "warning" ? "#fcd34d" : "#fca5a5"}`,
                    color: s.status === "ok" ? "#16a34a" : s.status === "warning" ? "#b45309" : "#dc2626",
                    fontWeight: 600,
                  }}>{s.name || id}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Correlation Chart */}
        <CorrelationChart market={market} svc={svc} />

        {/* Open in Network Health */}
        <button
          onClick={onOpenNetworkHealth}
          style={{
            width: "100%", padding: "8px 0",
            background: "#e40000", color: "#fff",
            border: "none", borderRadius: 7, cursor: "pointer",
            fontSize: 12, fontWeight: 700, fontFamily: "inherit",
          }}>
          Open in Network Health →
        </button>
      </div>
    </div>
  );
}

// ─── About These Metrics ─────────────────────────────────────────────────────

const ABOUT_ITEMS = [
  {
    icon: "📡",
    title: "Atlas — ICMP Latency",
    desc: "RIPE Atlas probes inside Vodafone's ASN send ICMP pings to k.root-servers.net every 5 min. We measure avg RTT, P95, and packet loss. A 4h rolling baseline is kept; ratio = current ÷ baseline. OK <2× · WARNING ≥2× · OUTAGE ≥4.5×.",
  },
  {
    icon: "🔗",
    title: "BGP — Prefix Visibility",
    desc: "RIPE Stat routing-status API: how many of ~329 global RIS BGP collectors can route to this ASN's prefixes. 329/329 = perfect visibility. Drops signal route withdrawals. OK ≥95% · WARNING ≥80% · OUTAGE <80%.",
  },
  {
    icon: "🔄",
    title: "RIS Live — BGP Stream",
    desc: "Real-time BGP update stream from RIPE RIS. Prefix withdrawals are deduplicated per 60s bucket (each prefix counted once regardless of how many RIS peers report it). OK <3 wd/h · WARNING ≥3 · ALERT ≥10.",
  },
  {
    icon: "☁️",
    title: "Radar — Cloudflare BGP Events",
    desc: "Cloudflare Radar BGP hijack and route-leak detection, filtered to prefixes belonging to each Vodafone ASN. Requires CF_RADAR_TOKEN env var — shows 'unconfigured' when missing.",
  },
  {
    icon: "🌐",
    title: "IODA — Internet Outage Detection",
    desc: "CAIDA IODA v2 (Georgia Tech). Polls /v2/outages/events per ASN — macroscopic outage events fusing BGP routing data, active probing (ping-slash24), and the Merit network telescope. Also returns raw bgp and ping-slash24 time series. OK = no active events · ALERT = ≥1 active event.",
  },
  {
    icon: "👥",
    title: "Community — Downdetector Reports",
    desc: "User-reported complaints from Downdetector. Simulated when USE_SCRAPER=0; real data when the scraper is enabled. Each market has its own baseline (hourly average). Ratio = current ÷ baseline. OK <2× · WARNING ≥2× · OUTAGE ≥4.5×.",
  },
  {
    icon: "📊",
    title: "Health Score (0–100)",
    desc: "Composite score penalising each degraded signal layer. Atlas WARNING −10 / OUTAGE −25. BGP WARNING −8 / OUTAGE −20. RIS WARNING −5 / ALERT −15. Radar ALERT −10. IODA ALERT −10. Community WARNING −5 / OUTAGE −15. Cross-penalty: 2+ signals degrade together → additional −10.",
  },
  {
    icon: "⚡",
    title: "Incident Clustering",
    desc: "When 2+ signal events for the same market occur within a 30-minute window, the Event Feed groups them as a PROBABLE INCIDENT cluster — helping distinguish transient single-layer blips from real multi-layer incidents that need immediate attention.",
  },
];

function AboutMetrics() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", padding: "10px 20px",
          background: open ? T.surface : "transparent",
          border: "none", borderBottom: open ? `1px solid ${T.border}` : "none",
          cursor: "pointer", fontFamily: "inherit",
          fontSize: 12, fontWeight: 600, color: T.muted, textAlign: "left",
        }}>
        <span style={{ fontSize: 14 }}>ℹ️</span>
        <span>About these metrics</span>
        <span style={{ marginLeft: "auto", fontSize: 9, letterSpacing: "0.4px" }}>{open ? "▲ collapse" : "▼ expand"}</span>
      </button>

      {open && (
        <div style={{
          padding: "14px 20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 10,
        }}>
          {ABOUT_ITEMS.map(item => (
            <div key={item.title} style={{
              background: T.surface, border: `1px solid ${T.border}`,
              borderRadius: 8, padding: "11px 13px",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{item.title}</span>
              </div>
              <p style={{ fontSize: 10, color: T.muted, lineHeight: 1.65, margin: 0 }}>{item.desc}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function SignalFusionView({ onOpenNetworkHealth }) {
  const [markets,   setMarkets]   = useState([]);
  const [svcMap,    setSvcMap]    = useState({});
  const [loading,   setLoading]   = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [showDegradedOnly, setShowDegradedOnly] = useState(false);
  const [selected,  setSelected]  = useState(null);
  const [activeTab, setActiveTab] = useState("matrix"); // "matrix" | "feed"

  // Fetch both data sources
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [nhRes, svcRes] = await Promise.all([
          fetch(`${apiBase()}/api/network-health`),
          fetch(`${apiBase()}/api/service-status`),
        ]);
        const [nhData, svcData] = await Promise.all([
          nhRes.ok ? nhRes.json() : [],
          svcRes.ok ? svcRes.json() : [],
        ]);
        if (!cancelled) {
          setMarkets(nhData);
          // Build id → svc map
          const m = {};
          for (const s of (Array.isArray(svcData) ? svcData : [])) m[s.id] = s;
          setSvcMap(m);
          setLastRefresh(new Date());
          // Keep selection fresh
          setSelected(prev => prev ? (nhData.find(x => x.id === prev.id) || prev) : null);
        }
      } catch { /* retry on next tick */ }
      finally { if (!cancelled) setLoading(false); }
    }

    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  function fmtAge(d) {
    if (!d) return "";
    const s = Math.round((Date.now() - d) / 1000);
    if (s < 5)  return "just now";
    if (s < 60) return `${s}s ago`;
    return `${Math.round(s / 60)}m ago`;
  }

  // Count degraded markets
  const degradedCount = markets.filter(m => {
    return [
      normStatus(m.status),
      normStatus(m.bgp?.status),
      normStatus(m.ris?.status),
      normStatus(m.radar?.status),
      normStatus(m.ioda?.status),
      normStatus(svcMap[m.id]?.status),
    ].some(s => s === "warning" || s === "outage");
  }).length;

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 13, gap: 10 }}>
      <span style={{ fontSize: 20, animation: "spin 1s linear infinite" }}>⟳</span>
      Loading signal data…
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.bg, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
              <span style={{ fontSize: 20 }}>🔀</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: T.text }}>Signal Fusion</span>
              {lastRefresh && (
                <span style={{ fontSize: 11, color: T.muted }}>· updated {fmtAge(lastRefresh)}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, maxWidth: 640 }}>
              Cross-signal correlation — RIPE Atlas, BGP, RIS Live, Cloudflare Radar, IODA, and Downdetector community reports across {markets.length} Vodafone markets.
            </div>
          </div>
          {/* Degraded badge */}
          {degradedCount > 0 ? (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              background: "#fef2f2", border: "1px solid #fca5a5",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#dc2626" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626" }}>
                {degradedCount} market{degradedCount !== 1 ? "s" : ""} degraded
              </span>
            </div>
          ) : (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8,
              background: "#f0fdf4", border: "1px solid #86efac",
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#16a34a" }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#16a34a" }}>All markets healthy</span>
            </div>
          )}
        </div>

        {/* Tab bar + toggle */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, borderBottom: `1px solid ${T.border}` }}>
          {[
            { id: "matrix", label: "📊 Signal Matrix" },
            { id: "feed",   label: "📡 Event Feed" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: "8px 16px", fontSize: 12, fontWeight: 600,
                fontFamily: "inherit", border: "none", cursor: "pointer",
                background: "transparent",
                color: activeTab === tab.id ? "#e40000" : T.muted,
                borderBottom: activeTab === tab.id ? "2px solid #e40000" : "2px solid transparent",
                marginBottom: -1,
              }}>
              {tab.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.muted, cursor: "pointer", paddingBottom: 8 }}>
            <input
              type="checkbox"
              checked={showDegradedOnly}
              onChange={e => setShowDegradedOnly(e.target.checked)}
              style={{ cursor: "pointer" }}
            />
            Degraded only
          </label>
        </div>
      </div>

      {/* Main content area */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* Left: matrix or feed */}
        <div style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: "14px 20px" }}>
          {activeTab === "matrix" && (
            <div>
              {/* Signal legend */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 14, fontSize: 10, color: T.muted }}>
                {SIGNAL_COLS.map(col => (
                  <span key={col.key} title={col.desc} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {col.icon} <span style={{ fontWeight: 600 }}>{col.label}</span>
                    <span style={{ opacity: 0.7 }}>— {col.desc}</span>
                  </span>
                ))}
              </div>

              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                <SignalMatrix
                  markets={markets}
                  svcMap={svcMap}
                  showDegradedOnly={showDegradedOnly}
                  selected={selected}
                  onSelect={setSelected}
                />
              </div>

              {/* Score legend */}
              <div style={{ marginTop: 10, display: "flex", gap: 16, fontSize: 10, color: T.muted, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>Health Score:</span>
                {[
                  { range: "90–100", color: "#16a34a", label: "Healthy" },
                  { range: "70–89",  color: "#b45309", label: "Degraded" },
                  { range: "40–69",  color: "#d97706", label: "Warning" },
                  { range: "<40",    color: "#dc2626", label: "Incident" },
                ].map(s => (
                  <span key={s.range} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ color: s.color, fontWeight: 700 }}>●</span> {s.range} {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeTab === "feed" && (
            <div>
              <div style={{ marginBottom: 12, fontSize: 11, color: T.muted }}>
                Chronological stream of signal events across all markets. ⚡ incident clusters = 2+ signals correlated within 30 min.
              </div>
              <EventFeed markets={markets} svcMap={svcMap} />
            </div>
          )}
        </div>

        {/* Right: market detail panel */}
        {selected && (
          <div style={{ padding: "14px 14px 14px 0", flexShrink: 0, display: "flex", flexDirection: "column" }}>
            <MarketDetailPanel
              market={selected}
              svc={svcMap[selected.id]}
              onClose={() => setSelected(null)}
              onOpenNetworkHealth={() => onOpenNetworkHealth && onOpenNetworkHealth()}
            />
          </div>
        )}
      </div>

      {/* About these metrics — pinned at bottom */}
      <AboutMetrics />
    </div>
  );
}
