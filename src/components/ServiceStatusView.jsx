import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../data/constants.js";

// ─── API base (mirrors ticketsDb.js pattern) ──────────────────────────────────
function apiBase() {
  const ws = import.meta.env.VITE_POLLER_WS || "ws://localhost:4000";
  if (ws.startsWith("wss://")) return ws.replace(/^wss:\/\//, "https://");
  return ws.replace(/^ws:\/\//, "http://");
}

async function fetchServiceStatus() {
  const r = await fetch(`${apiBase()}/api/service-status`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// ─── Client-side demo data (shown when backend unreachable) ──────────────────
const DEMO_MARKETS = [
  { id:"es", name:"Spain",       flag:"🇪🇸", baseline:45 },
  { id:"uk", name:"UK",          flag:"🇬🇧", baseline:60 },
  { id:"de", name:"Germany",     flag:"🇩🇪", baseline:50 },
  { id:"it", name:"Italy",       flag:"🇮🇹", baseline:40 },
  { id:"pt", name:"Portugal",    flag:"🇵🇹", baseline:20 },
  { id:"nl", name:"Netherlands", flag:"🇳🇱", baseline:25 },
  { id:"ie", name:"Ireland",     flag:"🇮🇪", baseline:15 },
  { id:"gr", name:"Greece",      flag:"🇬🇷", baseline:20 },
  { id:"ro", name:"Romania",     flag:"🇷🇴", baseline:30 },
  { id:"tr", name:"Turkey",      flag:"🇹🇷", baseline:35 },
];

// Predefined demo scenarios so it's visually interesting
const DEMO_RATIOS = { es:5.2, uk:1.1, de:2.8, it:1.3, pt:0.9, nl:3.6, ie:0.8, gr:1.0, ro:1.2, tr:4.9 };

function makeDemoData() {
  const r = (min, max) => min + Math.random() * (max - min);
  return DEMO_MARKETS.map(m => {
    const ratio = DEMO_RATIOS[m.id] * r(0.9, 1.1);
    const complaints = Math.round(m.baseline * ratio);
    const status = ratio >= 4.5 ? "outage" : ratio >= 2.0 ? "warning" : "ok";
    // Generate a plausible trend (20 points)
    const trend = Array.from({ length: 20 }, (_, i) => {
      const t = i / 19;
      return Math.round(m.baseline * (ratio * t + r(0.7, 1.1) * (1 - t)));
    });
    trend[19] = complaints;
    const svcWeights = { mobile_data:0.40, mobile_voice:0.20, fixed_bb:0.28, tv:0.12 };
    const services = Object.fromEntries(
      Object.entries(svcWeights).map(([id, w]) => {
        const sc = Math.round(complaints * w * r(0.8, 1.2));
        const sr = sc / (m.baseline * w || 1);
        return [id, { complaints: sc, ratio: Math.round(sr * 10) / 10, status: sr >= 4.5 ? "outage" : sr >= 2.0 ? "warning" : "ok" }];
      })
    );
    return { ...m, complaints, ratio: Math.round(ratio * 10) / 10, status, prevStatus: "ok", trend, ticketId: null, lastUpdate: Date.now(), services };
  });
}

// ─── Status palette ────────────────────────────────────────────────────────────
const STATUS_META = {
  ok:      { label: "OK",      color: "#15803d", bg: "#f0fdf4", border: "#86efac", dot: "#22c55e" },
  warning: { label: "WARNING", color: "#b45309", bg: "#fffbeb", border: "#fcd34d", dot: "#f59e0b" },
  outage:  { label: "OUTAGE",  color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444" },
};

const SERVICES_META = {
  mobile_data:  { name: "Mobile Data",     icon: "📶" },
  mobile_voice: { name: "Mobile Voice",    icon: "📞" },
  fixed_bb:     { name: "Fixed Broadband", icon: "🌐" },
  tv:           { name: "TV / IPTV",       icon: "📺" },
};

// ─── Time ranges ──────────────────────────────────────────────────────────────
const TIME_RANGES = [
  { key: "10m",  label: "10 min",  points:   20 },
  { key: "30m",  label: "30 min",  points:   60 },
  { key: "1h",   label: "1 h",     points:  120 },
  { key: "6h",   label: "6 h",     points:  720 },
  { key: "24h",  label: "24 h",    points: 2880 },
];

// ─── Scraper health helpers (module-level so MarketCard can use them) ─────────
/**
 * Returns true when a market claims dataSource="downdetector" but its trend has
 * zero variance — the fingerprint of a failing scraper (expired token) that
 * keeps repeating the same baseline value. Real Downdetector data always has
 * natural noise; a flat line means no real data is coming in.
 */
function isScraperStale(market) {
  if (market.dataSource !== "downdetector") return false;
  const t = market.trend;
  if (!t || t.length < 3) return false;
  return t.every(v => v === t[0]); // all identical → zero variance → stale
}

/** Returns "downdetector" only when scrape actually succeeded with real data. */
function effectiveDataSource(market) {
  return isScraperStale(market) ? "simulated" : market.dataSource;
}

// ─── Sparkline SVG ────────────────────────────────────────────────────────────
function Sparkline({ trend = [], status, width = 80, height = 28 }) {
  if (!trend || trend.length < 2) return <div style={{ width, height }} />;
  const max = Math.max(...trend, 1);
  const min = 0;
  const range = max - min || 1;
  const pts = trend.map((v, i) => {
    const x = (i / (trend.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  });
  const col = STATUS_META[status]?.dot || "#22c55e";
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={col}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.85}
      />
      {(() => {
        const lx = width;
        const lv = trend[trend.length - 1];
        const ly = height - ((lv - min) / range) * (height - 2) - 1;
        return <circle cx={lx} cy={ly} r={2.5} fill={col} />;
      })()}
    </svg>
  );
}

// ─── Market card ──────────────────────────────────────────────────────────────
function MarketCard({ market, trend, selected, onClick, fmt, hideTickets = false }) {
  const sm = STATUS_META[market.status] || STATUS_META.ok;

  return (
    <div onClick={onClick}
      style={{
        background: selected ? sm.bg : T.surface,
        border: `1.5px solid ${selected ? sm.border : T.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        cursor: "pointer",
        transition: "all 0.15s",
        boxShadow: selected ? `0 0 0 2px ${sm.border}` : "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Status accent bar */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: sm.dot, borderRadius: "12px 12px 0 0" }} />

      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{market.flag}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{market.name}</div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 2, fontFamily: "monospace" }}>
            {(() => { const f = fmt(market.complaints); return `${f.v}${f.u}`; })()}
            {market.baseline != null && <span> vs {market.baseline}/h</span>}
            {" · "}
            <span style={{ color: market.ratio >= 4.5 ? "#dc2626" : market.ratio >= 2 ? "#b45309" : T.muted }}>
              {market.ratio}×
            </span>
          </div>
          {effectiveDataSource(market) === "downdetector" ? (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3,
              fontSize: 9, fontWeight: 700, color: "#0369a1", background: "#eff6ff",
              border: "1px solid #93c5fd", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.3px" }}>
              🌐 LIVE
            </div>
          ) : (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 3,
              fontSize: 9, fontWeight: 700, color: "#64748b", background: "#f8fafc",
              border: "1px solid #cbd5e1", borderRadius: 4, padding: "1px 5px", letterSpacing: "0.3px" }}>
              ∿ SIMULATED
            </div>
          )}
        </div>
        <div style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
          color: sm.color, background: sm.bg, border: `1px solid ${sm.border}`,
          borderRadius: 5, padding: "2px 6px", flexShrink: 0,
        }}>
          {sm.label}
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline trend={trend} status={market.status} width={148} height={28} />

      {/* Service dots */}
      <div style={{ display: "flex", gap: 5, marginTop: 8, alignItems: "center" }}>
        {Object.entries(market.services || {}).map(([svcId, svc]) => {
          const ssm = STATUS_META[svc.status] || STATUS_META.ok;
          return (
            <div key={svcId} title={`${SERVICES_META[svcId]?.name}: ${svc.complaints}/h (${svc.ratio}×)`}
              style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: T.muted }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ssm.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 9 }}>{SERVICES_META[svcId]?.icon}</span>
            </div>
          );
        })}
        {market.ticketId && !hideTickets && (
          <div
            title={`Open ticket: ${market.ticketId}`}
            onClick={e => { e.stopPropagation(); window.open(`#ticket=${market.ticketId}`, "_blank"); }}
            style={{
              marginLeft: "auto", fontSize: 9, fontWeight: 700,
              color: "#dc2626", background: "#fef2f2", border: "1px solid #fca5a5",
              borderRadius: 4, padding: "1px 5px", cursor: "pointer", letterSpacing: "0.2px",
            }}>
            🎫 {market.ticketId}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Detail chart (baseline + threshold zones + hover tooltip + MA + annotations) ──
function DetailChart({ trend, baseline, status, width = 272, height = 80, perMin }) {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);

  const handlePointerMove = useCallback((clientX) => {
    if (!trend || trend.length < 2) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = clientX - rect.left;
    const idx = Math.round((mx / width) * (trend.length - 1));
    const clamped = Math.max(0, Math.min(trend.length - 1, idx));
    const v = trend[clamped];
    const ratio = baseline > 0 ? Math.round((v / baseline) * 10) / 10 : "—";
    const toY_ = (val) => height - (val / Math.max(...trend, baseline * 4.5 * 1.1, 1)) * (height - 4) - 2;
    const toX_ = (i)   => (i / (trend.length - 1)) * width;
    const display = perMin ? (v / 60 < 1 ? Math.round(v / 60 * 100) / 100 : Math.round(v / 60 * 10) / 10) : v;
    const baseDisplay = perMin ? (baseline / 60 < 1 ? Math.round(baseline / 60 * 100) / 100 : Math.round(baseline / 60 * 10) / 10) : baseline;
    const unit = perMin ? "/min" : "/h";
    setHover({ x: toX_(clamped), y: toY_(v), value: display, baseValue: baseDisplay, unit, idx: clamped, ratio });
  }, [trend, baseline, width, height, perMin]);
  const handleMouseMove = useCallback((e) => handlePointerMove(e.clientX), [handlePointerMove]);
  const handleTouchMove = useCallback((e) => { e.preventDefault(); handlePointerMove(e.touches[0].clientX); }, [handlePointerMove]);

  if (!trend || trend.length < 2) return <div style={{ width, height }} />;

  const warn2x    = baseline * 2.0;
  const outage45  = baseline * 4.5;
  const domainMax = Math.max(...trend, outage45 * 1.1, 1);
  const toY = v => height - (v / domainMax) * (height - 4) - 2;
  const toX = i => (i / (trend.length - 1)) * width;

  const pts = trend.map((v, i) => `${toX(i)},${toY(v)}`);

  // Moving average (adaptive window ~12.5% of data, min 3)
  const MA_W = Math.max(3, Math.floor(trend.length / 8));
  const maPts = trend.map((_, i) => {
    const slice = trend.slice(Math.max(0, i - MA_W + 1), i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    return `${toX(i)},${toY(avg)}`;
  });

  // Threshold crossing annotations (first crossing of warn and outage)
  const crossings = [];
  let warnMarked = false, outageMarked = false;
  for (let i = 1; i < trend.length; i++) {
    if (!warnMarked && trend[i - 1] < warn2x && trend[i] >= warn2x) {
      crossings.push({ x: toX(i), label: "2×", color: "#f59e0b" });
      warnMarked = true;
    }
    if (!outageMarked && trend[i - 1] < outage45 && trend[i] >= outage45) {
      crossings.push({ x: toX(i), label: "4.5×", color: "#ef4444" });
      outageMarked = true;
    }
  }

  const col    = STATUS_META[status]?.dot || "#22c55e";
  const baseY  = toY(baseline);
  const warn2Y = toY(warn2x);
  const out45Y = toY(outage45);
  const lastY  = toY(trend[trend.length - 1]);


  const TIP_W   = 110;
  const TIP_H   = 42;
  const tipX    = hover ? (hover.x > width * 0.6 ? hover.x - TIP_W - 8 : hover.x + 10) : 0;
  const tipY    = hover ? Math.max(2, hover.y - TIP_H / 2) : 0;
  const hStatus = hover ? (hover.ratio >= 4.5 ? "outage" : hover.ratio >= 2.0 ? "warning" : "ok") : "ok";
  const hCol    = STATUS_META[hStatus]?.dot || col;

  return (
    <svg ref={svgRef} width={width} height={height}
      style={{ display: "block", overflow: "visible", cursor: "crosshair", touchAction: "none" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHover(null)}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => setHover(null)}>

      {/* Threshold zones */}
      {out45Y > 0 && <rect x={0} y={0} width={width} height={Math.max(0, out45Y)} fill="rgba(239,68,68,0.06)" />}
      <rect x={0} y={Math.max(0, out45Y)} width={width} height={Math.max(0, warn2Y - out45Y)} fill="rgba(245,158,11,0.06)" />

      {/* Threshold lines */}
      <line x1={0} y1={out45Y} x2={width} y2={out45Y} stroke="#ef4444" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
      <line x1={0} y1={warn2Y} x2={width} y2={warn2Y} stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
      <line x1={0} y1={baseY}  x2={width} y2={baseY}  stroke="#64748b" strokeWidth={1} strokeDasharray="4,2" opacity={0.6} />

      {/* Labels */}
      <text x={width - 2} y={out45Y - 3} textAnchor="end" fontSize={7} fill="#ef4444" opacity={0.7}>OUTAGE</text>
      <text x={width - 2} y={warn2Y - 3} textAnchor="end" fontSize={7} fill="#f59e0b" opacity={0.7}>WARN</text>
      <text x={width - 2} y={baseY + 9}  textAnchor="end" fontSize={7} fill="#64748b" opacity={0.7}>BASE</text>

      {/* Threshold crossing annotations */}
      {crossings.map((c, ci) => (
        <g key={ci}>
          <line x1={c.x} y1={0} x2={c.x} y2={height} stroke={c.color} strokeWidth={1.5} strokeDasharray="2,3" opacity={0.65} />
          <rect x={c.x + 2} y={3} width={22} height={11} rx={2} fill={c.color} opacity={0.9} />
          <text x={c.x + 13} y={11} textAnchor="middle" fontSize={7} fill="#fff" fontWeight="700">{c.label}</text>
        </g>
      ))}

      {/* Moving average — thick translucent band */}
      <polyline points={maPts.join(" ")} fill="none" stroke={col} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" opacity={0.18} />

      {/* Complaint line */}
      <polyline points={pts.join(" ")} fill="none" stroke={col} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Last value dot */}
      {!hover && <circle cx={toX(trend.length - 1)} cy={lastY} r={3} fill={col} />}

      {/* Hover crosshair + tooltip */}
      {hover && (<>
        <line x1={hover.x} y1={0} x2={hover.x} y2={height} stroke="#94a3b8" strokeWidth={1} strokeDasharray="2,2" opacity={0.6} />
        <circle cx={hover.x} cy={hover.y} r={4} fill={hCol} stroke="#fff" strokeWidth={1.5} />
        <rect x={tipX} y={tipY} width={TIP_W} height={TIP_H} rx={6} fill="#1e293b" stroke={hCol} strokeWidth={2} opacity={0.97} />
        <text x={tipX + TIP_W/2} y={tipY + 15} textAnchor="middle" fontSize={14} fontWeight="700" fill="#f1f5f9" fontFamily="monospace">{hover.value}{hover.unit}</text>
        <text x={tipX + TIP_W/2} y={tipY + 30} textAnchor="middle" fontSize={10} fill={hCol}      fontFamily="monospace">{hover.ratio}× base</text>
        <text x={tipX + TIP_W/2} y={tipY + 41} textAnchor="middle" fontSize={9}  fill="#94a3b8"   fontFamily="monospace">base: {hover.baseValue}{hover.unit}</text>
      </>)}
    </svg>
  );
}

// ─── Trend direction helper ───────────────────────────────────────────────────
function trendDirection(trend) {
  if (!trend || trend.length < 4) return { arrow: "→", label: "Stable", color: "#64748b" };
  const recent = trend.slice(-4);
  const older  = trend.slice(-8, -4);
  if (older.length === 0) return { arrow: "→", label: "Stable", color: "#64748b" };
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgOlder  = older.reduce((a, b) => a + b, 0) / older.length;
  const pct = avgOlder > 0 ? (avgRecent - avgOlder) / avgOlder : 0;
  if (pct >  0.15) return { arrow: "↑", label: "Rising",    color: "#dc2626" };
  if (pct >  0.05) return { arrow: "↗", label: "Increasing",color: "#f59e0b" };
  if (pct < -0.15) return { arrow: "↓", label: "Falling",   color: "#15803d" };
  if (pct < -0.05) return { arrow: "↘", label: "Decreasing",color: "#0369a1" };
  return { arrow: "→", label: "Stable", color: "#64748b" };
}

// ─── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ market, trend, rangeLabel, rangePoints, onClose, fmt, perMin, mobile = false, onOpenTicket, hideTickets = false }) {
  const [zoom, setZoom]           = useState(1);   // 1=full, 2=50%, 4=25%, 8=12.5%
  const [copied, setCopied]       = useState(false);

  const sm  = STATUS_META[market.status] || STATUS_META.ok;
  const dir = trendDirection(trend);
  const peak = trend && trend.length > 0 ? Math.max(...trend) : market.complaints;
  const peakRatio = market.baseline > 0 ? Math.round((peak / market.baseline) * 10) / 10 : "—";

  const worstSvc = Object.entries(market.services || {})
    .sort((a, b) => b[1].ratio - a[1].ratio)[0];

  const chartWidth = mobile ? Math.min(300, window.innerWidth - 64) : 272;

  // Zoom slice — always shows the most-recent N points
  const zoomedTrend = zoom === 1
    ? trend
    : trend.slice(-Math.max(4, Math.ceil(trend.length / zoom)));

  // Live value (latest point — always visible without touch)
  const liveVal   = trend[trend.length - 1] ?? 0;
  const liveRatio = market.baseline > 0 ? Math.round((liveVal / market.baseline) * 10) / 10 : "—";
  const liveSt    = liveRatio >= 4.5 ? "outage" : liveRatio >= 2.0 ? "warning" : "ok";
  const liveSm    = STATUS_META[liveSt];
  const liveFmt   = fmt(liveVal);
  const baseFmt   = fmt(market.baseline);

  function handleShare() {
    const base = `${window.location.origin}${window.location.pathname}`;
    const url  = `${base}#standalone=service_monitor`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div style={{
      flex: mobile ? 1 : undefined,
      width: mobile ? "100%" : 340, flexShrink: 0, background: T.surface,
      borderLeft: mobile ? "none" : `1px solid ${T.border}`,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 26, lineHeight: 1 }}>{market.flag}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{market.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 2 }}>
              {effectiveDataSource(market) === "downdetector" ? (
                <span style={{ fontSize: 9, fontWeight: 700, color: "#0369a1", background: "#eff6ff",
                  border: "1px solid #93c5fd", borderRadius: 4, padding: "1px 5px" }}>🌐 LIVE</span>
              ) : (
                <span style={{ fontSize: 9, fontWeight: 700, color: "#64748b", background: "#f8fafc",
                  border: "1px solid #cbd5e1", borderRadius: 4, padding: "1px 5px" }}>∿ SIMULATED</span>
              )}
              <span style={{ fontSize: 9, fontWeight: 700, color: dir.color, background: T.bg,
                border: `1px solid ${T.border}`, borderRadius: 4, padding: "1px 5px" }}>
                {dir.arrow} {dir.label}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {market.ticketId && !hideTickets && (
              <button
                onClick={() => onOpenTicket
                  ? onOpenTicket(market.ticketId)
                  : window.open(`#ticket=${market.ticketId}`, "_blank")}
                style={{ fontSize: 10, fontWeight: 700, color: "#dc2626", background: "#fef2f2",
                  border: "1px solid #fca5a5", borderRadius: 5, padding: "3px 8px",
                  cursor: "pointer", fontFamily: "inherit" }}>
                🎫 Ticket
              </button>
            )}
            <button onClick={handleShare} title="Copy app link"
              style={{ fontSize: 10, fontWeight: 700,
                color: copied ? "#15803d" : T.muted,
                background: copied ? "#f0fdf4" : "none",
                border: copied ? "1px solid #86efac" : "none",
                borderRadius: 5, padding: copied ? "3px 8px" : "2px 4px",
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s" }}>
              {copied ? "✓ Copied" : "⎘"}
            </button>
            <button onClick={onClose}
              style={{ background: "none", border: "none", fontSize: 16, color: T.muted, cursor: "pointer", padding: "2px 4px" }}>
              ✕
            </button>
          </div>
        </div>

        {/* Status banner */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
          background: sm.bg, border: `1px solid ${sm.border}`, borderRadius: 7 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: sm.dot, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 800, color: sm.color, flex: 1 }}>{sm.label}</span>
          <span style={{ fontSize: 11, color: sm.color, fontFamily: "monospace", fontWeight: 600 }}>
            {market.ratio}× baseline
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>

        {/* ── Key metrics ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 16 }}>
          {[
            { label: "Now",      value: `${fmt(market.complaints).v}`, unit: fmt(market.complaints).u, color: sm.color },
            { label: market.baselineAuto ? "Baseline ∿" : "Baseline", value: `${fmt(market.baseline).v}`, unit: fmt(market.baseline).u, color: T.muted },
            { label: "Peak",     value: `${fmt(peak).v}`, unit: ` (${peakRatio}×)`, color: peak > market.baseline * 2 ? "#b45309" : T.muted },
          ].map(m => (
            <div key={m.label} style={{ padding: "8px 10px", background: T.bg,
              border: `1px solid ${T.border}`, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: T.muted, letterSpacing: "0.4px",
                textTransform: "uppercase", marginBottom: 3 }}>{m.label}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</div>
              <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>{m.unit}</div>
            </div>
          ))}
        </div>

        {/* ── Chart with baseline + thresholds ── */}
        <div style={{ marginBottom: 16 }}>
          {/* Header row: label + zoom controls */}
          <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.muted,
              letterSpacing: "0.5px", textTransform: "uppercase", flex: 1 }}>
              Complaints — last {zoom === 1 ? rangeLabel : `1/${zoom} window`}
            </span>
            <div style={{ display: "flex", gap: 2, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: 2 }}>
              {[1, 2, 4, 8].map(z => (
                <button key={z} onClick={() => setZoom(z)}
                  style={{ padding: "2px 7px", fontSize: 10, fontWeight: 700, borderRadius: 4, border: "none",
                    cursor: "pointer", fontFamily: "inherit",
                    background: zoom === z ? T.text : "transparent",
                    color: zoom === z ? T.surface : T.muted }}>
                  {z === 1 ? "All" : `${z}×`}
                </button>
              ))}
            </div>
          </div>

          {/* Live value bar — always visible, no touch needed */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px",
            background: liveSm.bg, border: `1px solid ${liveSm.border}`, borderRadius: "7px 7px 0 0",
            borderBottom: "none" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: liveSm.dot, flexShrink: 0 }} />
            {/* now vs base */}
            <span style={{ fontSize: 12, fontWeight: 800, color: liveSm.color, fontFamily: "monospace" }}>
              {liveFmt.v}{liveFmt.u}
            </span>
            <span style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>vs</span>
            <span style={{ fontSize: 11, color: T.muted, fontFamily: "monospace" }}>
              base {baseFmt.v}{baseFmt.u}
            </span>
            {/* ratio badge */}
            <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: liveSm.color,
              background: "#fff", border: `1px solid ${liveSm.border}`, borderRadius: 4,
              padding: "1px 7px", fontFamily: "monospace" }}>
              {liveRatio}×
            </span>
          </div>

          <div style={{ background: T.bg, borderRadius: "0 0 8px 8px", padding: "10px 12px",
            border: `1px solid ${T.border}`, borderTop: `1px solid ${liveSm.border}` }}>
            <DetailChart trend={zoomedTrend} baseline={market.baseline} status={market.status}
              width={chartWidth} height={80} rangePoints={rangePoints} perMin={perMin} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 9, color: T.muted }}>
                {zoom === 1 ? `${rangeLabel} ago` : `last 1/${zoom} of window`}
              </span>
              <span style={{ fontSize: 9, color: T.muted }}>now · {fmt(market.complaints).v}{fmt(market.complaints).u}</span>
            </div>
            {/* Legend row */}
            <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
              {[
                { color: "#64748b", label: "Baseline", dash: "4,2" },
                { color: "#f59e0b", label: "2× warn",  dash: "3,2" },
                { color: "#ef4444", label: "4.5× outage", dash: "3,2" },
              ].map(l => (
                <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width={16} height={8}>
                    <line x1={0} y1={4} x2={16} y2={4} stroke={l.color} strokeWidth={1.5} strokeDasharray={l.dash} />
                  </svg>
                  <span style={{ fontSize: 9, color: T.muted }}>{l.label}</span>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <svg width={16} height={8}>
                  <line x1={0} y1={4} x2={16} y2={4} stroke={sm.dot} strokeWidth={4} opacity={0.25} />
                </svg>
                <span style={{ fontSize: 9, color: T.muted }}>MA trend</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Service breakdown ── */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 6,
            letterSpacing: "0.5px", textTransform: "uppercase" }}>
            Service Breakdown
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {Object.entries(market.services || {})
              .sort((a, b) => b[1].ratio - a[1].ratio)
              .map(([svcId, svc]) => {
                const ssm    = STATUS_META[svc.status] || STATUS_META.ok;
                const smeta  = SERVICES_META[svcId];
                const pct    = Math.min(100, (svc.ratio / 6) * 100);
                const isWorst = svcId === worstSvc?.[0];
                return (
                  <div key={svcId} style={{ padding: "8px 10px", background: T.bg, borderRadius: 7,
                    border: `1px solid ${svc.status !== "ok" ? ssm.border : T.border}`,
                    boxShadow: isWorst && svc.status !== "ok" ? `0 0 0 1px ${ssm.border}` : "none" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                      <span style={{ fontSize: 13 }}>{smeta?.icon}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.text, flex: 1 }}>{smeta?.name}</span>
                      {/* now vs base */}
                      <span style={{ fontSize: 10, fontWeight: 700, color: ssm.color, fontFamily: "monospace" }}>
                        {fmt(svc.complaints).v}{fmt(svc.complaints).u}
                      </span>
                      <span style={{ fontSize: 9, color: T.muted, fontFamily: "monospace" }}>vs</span>
                      <span style={{ fontSize: 9, color: T.muted, fontFamily: "monospace" }}>
                        {(() => { const b = fmt(Math.round(svc.complaints / Math.max(svc.ratio, 0.1))); return `${b.v}${b.u}`; })()}
                      </span>
                      <span style={{ fontSize: 9, fontWeight: 800, color: ssm.color,
                        background: ssm.bg, border: `1px solid ${ssm.border}`,
                        borderRadius: 4, padding: "1px 5px", fontFamily: "monospace" }}>
                        {svc.ratio}×
                      </span>
                    </div>
                    <div style={{ position: "relative", height: 5, background: T.border, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: ssm.dot,
                        borderRadius: 3, transition: "width 0.5s" }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* ── Thresholds reference ── */}
        <div style={{ padding: "8px 10px", background: T.bg, borderRadius: 7, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, marginBottom: 5,
            letterSpacing: "0.4px", textTransform: "uppercase" }}>Thresholds (baseline {fmt(market.baseline).v}{fmt(market.baseline).u})</div>
          {[
            { label: "OK",      desc: `< ${fmt(market.baseline * 2).v}${fmt(market.baseline * 2).u}`,  sub: "< 2×", ...STATUS_META.ok },
            { label: "WARNING", desc: `${fmt(market.baseline * 2).v}–${fmt(Math.round(market.baseline * 4.5)).v}${fmt(0).u}`, sub: "2–4.5×", ...STATUS_META.warning },
            { label: "OUTAGE",  desc: `> ${fmt(Math.round(market.baseline * 4.5)).v}${fmt(0).u}`, sub: "> 4.5× → ticket", ...STATUS_META.outage },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: row.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: row.color, width: 52 }}>{row.label}</span>
              <span style={{ fontSize: 9, color: T.muted, flex: 1 }}>{row.desc}</span>
              <span style={{ fontSize: 9, color: T.muted, opacity: 0.7 }}>{row.sub}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function ServiceStatusView({ mobile = false, onOpenTicket, hideTickets = false }) {
  const [markets, setMarkets]         = useState(() => makeDemoData());
  const [loading, setLoading]         = useState(true);
  const [_error, setError]            = useState(null);
  const [usingDemo, setUsingDemo]     = useState(false);
  const [selected, setSelected]       = useState(null);
  const [filter, setFilter]           = useState("all");
  const [timeRange, setTimeRange]     = useState(TIME_RANGES[0]);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [perMin, setPerMin]           = useState(false);
  const intervalRef = useRef(null);

  // Detect mobile layout (standalone prop OR narrow viewport)
  const [isMobile, setIsMobile] = useState(() => mobile || window.innerWidth < 768);
  useEffect(() => {
    if (mobile) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const handler = e => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [mobile]);

  // Convert a complaints/h value to the selected unit, with label
  function fmt(val) {
    if (!perMin) return { v: val, u: "/h" };
    const m = val / 60;
    return { v: m < 1 ? Math.round(m * 100) / 100 : Math.round(m * 10) / 10, u: "/min" };
  }

  function sliceTrend(trend, points) {
    if (!trend || trend.length === 0) return [];
    if (trend.length >= points) return trend.slice(-points);
    const pad = Array(points - trend.length).fill(trend[0]);
    return [...pad, ...trend];
  }

  async function load() {
    try {
      const data = await fetchServiceStatus();
      setMarkets(data);
      setLastRefresh(new Date());
      setError(null);
      setUsingDemo(false);
    } catch (e) {
      setError(e.message);
      setUsingDemo(true);
      setMarkets(prev => prev.length > 0 ? prev : makeDemoData());
      setLastRefresh(new Date());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 15_000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const selectedMarket = selected ? markets.find(m => m.id === selected) : null;

  const displayMarkets = markets.filter(m => {
    if (filter === "outage")  return m.status === "outage";
    if (filter === "warning") return ["warning", "outage"].includes(m.status);
    return true;
  });

  const outageCount  = markets.filter(m => m.status === "outage").length;
  const warningCount = markets.filter(m => m.status === "warning").length;
  const okCount      = markets.filter(m => m.status === "ok").length;

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, gap: 10 }}>
        <span style={{ fontSize: 20 }}>⟳</span> Loading service status…
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: "flex", height: "100%", overflow: "hidden", position: "relative" }}>
      {/* ── Left: grid ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{
          padding: isMobile ? "8px 12px" : "12px 20px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", gap: isMobile ? 6 : 14,
          flexShrink: 0, background: T.surface,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}>
          {/* Filter pills */}
          <div style={{ display: "flex", gap: 5 }}>
            {[
              { key: "all",     label: isMobile ? `All` : `All (${markets.length})`,                    color: T.muted,   active: "#475569" },
              { key: "outage",  label: isMobile ? `🔴 ${outageCount}` : `Outage (${outageCount})`,      color: "#dc2626", active: "#dc2626" },
              { key: "warning", label: isMobile ? `🟡 ${warningCount}` : `Warning (${warningCount})`,   color: "#b45309", active: "#b45309" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{
                  padding: isMobile ? "5px 10px" : "5px 12px",
                  fontSize: isMobile ? 12 : 11, fontWeight: 700, borderRadius: 6,
                  cursor: "pointer", fontFamily: "inherit",
                  background: filter === f.key ? f.active : T.bg,
                  color: filter === f.key ? "#fff" : f.color,
                  border: `1px solid ${filter === f.key ? f.active : T.border}`,
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Zoom selector */}
          <div style={{ display: "flex", gap: 2, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: 2 }}>
            {TIME_RANGES.filter(r => !isMobile || ["10m","1h","6h"].includes(r.key)).map(r => (
              <button key={r.key} onClick={() => setTimeRange(r)}
                style={{
                  padding: isMobile ? "4px 8px" : "3px 9px",
                  fontSize: isMobile ? 11 : 10, fontWeight: 700, borderRadius: 5,
                  cursor: "pointer", fontFamily: "inherit", border: "none",
                  background: timeRange.key === r.key ? T.text : "transparent",
                  color: timeRange.key === r.key ? T.surface : T.muted,
                  transition: "all 0.12s",
                }}>
                {r.label}
              </button>
            ))}
          </div>

          {/* Unit toggle /h · /min */}
          <div style={{ display: "flex", gap: 2, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, padding: isMobile ? 2 : 3 }}>
            {[{ label: "/h", val: false }, { label: "/min", val: true }].map(opt => (
              <button key={opt.label} onClick={() => setPerMin(opt.val)}
                style={{
                  padding: isMobile ? "4px 8px" : "3px 9px",
                  fontSize: isMobile ? 11 : 10, fontWeight: 700, borderRadius: 5,
                  cursor: "pointer", fontFamily: "inherit", border: "none",
                  background: perMin === opt.val ? T.text : "transparent",
                  color: perMin === opt.val ? T.surface : T.muted,
                  transition: "all 0.12s",
                }}>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Status summary — hidden on mobile */}
          {!isMobile && (
            <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.muted }}>
              {outageCount > 0 && <span style={{ color: "#dc2626", fontWeight: 700 }}>🔴 {outageCount} outage{outageCount > 1 ? "s" : ""}</span>}
              {warningCount > 0 && <span style={{ color: "#b45309", fontWeight: 600 }}>🟡 {warningCount} warning{warningCount > 1 ? "s" : ""}</span>}
              {okCount === markets.length && <span style={{ color: "#15803d", fontWeight: 600 }}>🟢 All systems operational</span>}
            </div>
          )}

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            {usingDemo && (
              <span style={{ fontSize: 10, fontWeight: 700, color: "#b45309", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 5, padding: "2px 7px" }}>
                DEMO
              </span>
            )}
            {!usingDemo && (() => {
              const liveCount = markets.filter(m => effectiveDataSource(m) === "downdetector").length;
              const allSimulated = liveCount === 0;
              if (allSimulated) {
                return (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#64748b", background: "#f1f5f9",
                    border: "1px solid #cbd5e1", borderRadius: 5, padding: "2px 7px", letterSpacing: "0.2px" }}>
                    {isMobile ? "∿ SIM" : "∿ SIMULATED DATA"}
                  </span>
                );
              }
              return (
                <span style={{ fontSize: 10, fontWeight: 700, color: "#0369a1", background: "#eff6ff", border: "1px solid #93c5fd", borderRadius: 5, padding: "2px 7px" }}>
                  {isMobile ? `🌐 ${liveCount}` : `🌐 ${liveCount}/${markets.length} LIVE`}
                </span>
              );
            })()}
            {lastRefresh && !isMobile && (
              <span style={{ fontSize: 10, color: T.muted }}>
                {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button onClick={load}
              style={{
                fontSize: isMobile ? 14 : 11, fontWeight: 600,
                padding: isMobile ? "4px 8px" : "5px 10px", borderRadius: 6,
                background: "transparent", border: `1px solid ${T.border}`, color: T.muted,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              ⟳
            </button>
          </div>
        </div>

        {/* Simulated data notice — shown when backend is up but no markets have real live data */}
        {!usingDemo && markets.length > 0 && markets.every(m => effectiveDataSource(m) !== "downdetector") && (
          <div style={{
            padding: "7px 20px", background: "#f8fafc",
            borderBottom: `1px solid #e2e8f0`,
            display: "flex", alignItems: "center", gap: 8,
            flexShrink: 0,
          }}>
            <span style={{ fontSize: 13 }}>∿</span>
            <span style={{ fontSize: 11, color: "#475569" }}>
              <strong style={{ color: "#334155" }}>Simulated data</strong>
              {" "}— Complaint volumes are generated by the backend simulator (±20% noise, 3% spike probability/tick).
              Real Downdetector data will appear here once an enterprise token is configured.
            </span>
          </div>
        )}

        {/* Market grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? 10 : 20 }}>
          {displayMarkets.length === 0 ? (
            <div style={{ textAlign: "center", color: T.muted, fontSize: 13, marginTop: 60 }}>
              No markets match the current filter.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile
                ? "repeat(2, 1fr)"
                : "repeat(auto-fill, minmax(190px, 1fr))",
              gap: isMobile ? 8 : 12,
            }}>
              {displayMarkets.map(m => (
                <MarketCard
                  key={m.id}
                  market={m}
                  trend={sliceTrend(m.trend, timeRange.points)}
                  selected={selected === m.id}
                  onClick={() => setSelected(selected === m.id ? null : m.id)}
                  fmt={fmt}
                  hideTickets={hideTickets}
                />
              ))}
            </div>
          )}

          {!isMobile && (
            <div style={{ marginTop: 24, fontSize: 10, color: T.muted, textAlign: "center", lineHeight: 1.8 }}>
              🌐 LIVE markets pull real complaint counts from{" "}
              <span style={{ fontWeight: 600, color: "#0369a1" }}>Downdetector</span>
              {" "}· ∿ SIMULATED markets use modelled data · Auto-refreshes every 15s · Outages auto-create incident tickets
              <br />
              <span style={{ opacity: 0.6 }}>
                Data sourced via Downdetector public pages for monitoring purposes only.
                For official data, see{" "}
                <span style={{ fontWeight: 600 }}>downdetector.com</span>.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail panel: side panel on desktop, full-screen overlay on mobile ── */}
      {selectedMarket && !isMobile && (
        <DetailPanel
          market={selectedMarket}
          trend={sliceTrend(selectedMarket.trend, timeRange.points)}
          rangeLabel={timeRange.label}
          rangePoints={timeRange.points}
          onClose={() => setSelected(null)}
          fmt={fmt}
          perMin={perMin}
          onOpenTicket={onOpenTicket}
          hideTickets={hideTickets}
        />
      )}
      {selectedMarket && isMobile && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 10,
          background: T.surface, display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          <DetailPanel
            market={selectedMarket}
            trend={sliceTrend(selectedMarket.trend, timeRange.points)}
            rangeLabel={timeRange.label}
            rangePoints={timeRange.points}
            onClose={() => setSelected(null)}
            fmt={fmt}
            perMin={perMin}
            mobile
            onOpenTicket={onOpenTicket}
            hideTickets={hideTickets}
          />
        </div>
      )}
    </div>
  );
}
