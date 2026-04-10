import { useState, useEffect, useRef } from "react";
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
      {/* Last value dot */}
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
function MarketCard({ market, selected, onClick }) {
  const sm = STATUS_META[market.status] || STATUS_META.ok;
  const isOutage = market.status === "outage";
  const isWarning = market.status === "warning";

  // Worst service
  const svcStatuses = Object.values(market.services || {}).map(s => s.status);
  const hasOutageSvc = svcStatuses.includes("outage");
  const hasWarnSvc   = svcStatuses.includes("warning");

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
            {market.complaints}/h · {market.ratio}× baseline
          </div>
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
      <Sparkline trend={market.trend} status={market.status} width={148} height={28} />

      {/* Service dots */}
      <div style={{ display: "flex", gap: 5, marginTop: 8, alignItems: "center" }}>
        {Object.entries(market.services || {}).map(([svcId, svc]) => {
          const ssm = STATUS_META[svc.status] || STATUS_META.ok;
          return (
            <div key={svcId} title={`${SERVICES_META[svcId]?.name}: ${svc.complaints}/h (${svc.ratio}×)`}
              style={{
                display: "flex", alignItems: "center", gap: 3,
                fontSize: 10, color: T.muted,
              }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ssm.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 9 }}>{SERVICES_META[svcId]?.icon}</span>
            </div>
          );
        })}
        {market.ticketId && (
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

// ─── Detail panel ─────────────────────────────────────────────────────────────
function DetailPanel({ market, onClose }) {
  const sm = STATUS_META[market.status] || STATUS_META.ok;

  return (
    <div style={{
      width: 320, flexShrink: 0, background: T.surface,
      borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ padding: "16px 18px 14px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 28, lineHeight: 1 }}>{market.flag}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{market.name}</div>
            <div style={{ fontSize: 11, color: T.muted }}>Vodafone Market Monitor</div>
          </div>
          <button onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 16, color: T.muted, cursor: "pointer", padding: "2px 6px" }}>
            ✕
          </button>
        </div>

        {/* Overall status */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
          background: sm.bg, border: `1px solid ${sm.border}`, borderRadius: 8,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: sm.dot, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: sm.color }}>{sm.label}</div>
            <div style={{ fontSize: 10, color: T.muted }}>
              {market.complaints}/h · {market.ratio}× baseline ({market.baseline}/h)
            </div>
          </div>
          {market.ticketId && (
            <button
              onClick={() => window.open(`#ticket=${market.ticketId}`, "_blank")}
              style={{
                fontSize: 10, fontWeight: 700, color: "#dc2626",
                background: "#fef2f2", border: "1px solid #fca5a5",
                borderRadius: 5, padding: "3px 8px", cursor: "pointer", fontFamily: "inherit",
              }}>
              🎫 View ticket
            </button>
          )}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
        {/* Trend sparkline (large) */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            Complaint Trend (last 10 min)
          </div>
          <div style={{ background: T.bg, borderRadius: 8, padding: "10px 12px", border: `1px solid ${T.border}` }}>
            <Sparkline trend={market.trend} status={market.status} width={260} height={50} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
              <span style={{ fontSize: 9, color: T.muted }}>10 min ago</span>
              <span style={{ fontSize: 9, color: T.muted }}>now</span>
            </div>
          </div>
        </div>

        {/* Per-service breakdown */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            Service Breakdown
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(market.services || {}).map(([svcId, svc]) => {
              const ssm = STATUS_META[svc.status] || STATUS_META.ok;
              const sm_meta = SERVICES_META[svcId];
              const pct = Math.min(100, (svc.ratio / 8) * 100);
              return (
                <div key={svcId} style={{
                  padding: "10px 12px", background: T.bg, borderRadius: 8,
                  border: `1px solid ${svc.status !== "ok" ? ssm.border : T.border}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>{sm_meta?.icon}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text, flex: 1 }}>{sm_meta?.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: ssm.color,
                      background: ssm.bg, border: `1px solid ${ssm.border}`,
                      borderRadius: 4, padding: "1px 5px" }}>{ssm.label}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 4, background: T.border, borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: ssm.dot, borderRadius: 2, transition: "width 0.5s" }} />
                    </div>
                    <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace", flexShrink: 0 }}>
                      {svc.complaints}/h · {svc.ratio}×
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status legend */}
        <div style={{ marginTop: 20, padding: "10px 12px", background: T.bg, borderRadius: 8, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 6, letterSpacing: "0.4px" }}>STATUS THRESHOLDS</div>
          {[
            { label: "OK",      desc: "< 2× baseline",  ...STATUS_META.ok },
            { label: "WARNING", desc: "2–4.5× baseline", ...STATUS_META.warning },
            { label: "OUTAGE",  desc: "> 4.5× baseline — auto-ticket", ...STATUS_META.outage },
          ].map(row => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: row.dot, flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: row.color, width: 56 }}>{row.label}</span>
              <span style={{ fontSize: 10, color: T.muted }}>{row.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function ServiceStatusView() {
  const [markets, setMarkets]         = useState(() => makeDemoData());
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);
  const [usingDemo, setUsingDemo]     = useState(false);
  const [selected, setSelected]       = useState(null);
  const [filter, setFilter]           = useState("all"); // all | outage | warning
  const [lastRefresh, setLastRefresh] = useState(null);
  const intervalRef = useRef(null);

  async function load() {
    try {
      const data = await fetchServiceStatus();
      setMarkets(data);
      setLastRefresh(new Date());
      setError(null);
      setUsingDemo(false);
    } catch (e) {
      // Backend unreachable — keep showing demo data so the UI isn't blank
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

  // Keep selected market in sync with latest data
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
    <div style={{ flex: 1, display: "flex", height: "100%", overflow: "hidden" }}>
      {/* ── Left: grid ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{
          padding: "12px 20px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
          background: T.surface,
        }}>
          {/* Summary pills */}
          <div style={{ display: "flex", gap: 8 }}>
            {[
              { key: "all",     label: `All (${markets.length})`,    color: T.muted,    active: "#475569" },
              { key: "outage",  label: `Outage (${outageCount})`,   color: "#dc2626",  active: "#dc2626" },
              { key: "warning", label: `Warning (${warningCount})`, color: "#b45309",  active: "#b45309" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{
                  padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6,
                  cursor: "pointer", fontFamily: "inherit", border: "none",
                  background: filter === f.key ? f.active : T.bg,
                  color: filter === f.key ? "#fff" : f.color,
                  border: `1px solid ${filter === f.key ? f.active : T.border}`,
                }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Status summary */}
          <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.muted, marginLeft: 8 }}>
            {outageCount > 0 && (
              <span style={{ color: "#dc2626", fontWeight: 700 }}>🔴 {outageCount} outage{outageCount > 1 ? "s" : ""}</span>
            )}
            {warningCount > 0 && (
              <span style={{ color: "#b45309", fontWeight: 600 }}>🟡 {warningCount} warning{warningCount > 1 ? "s" : ""}</span>
            )}
            {okCount === markets.length && (
              <span style={{ color: "#15803d", fontWeight: 600 }}>🟢 All systems operational</span>
            )}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {usingDemo && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: "#b45309",
                background: "#fffbeb", border: "1px solid #fcd34d",
                borderRadius: 5, padding: "2px 8px", letterSpacing: "0.3px",
              }}>
                DEMO — backend offline
              </span>
            )}
            {lastRefresh && (
              <span style={{ fontSize: 10, color: T.muted }}>
                Updated {lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
            <button onClick={load}
              style={{
                fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 6,
                background: "transparent", border: `1px solid ${T.border}`, color: T.muted,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              ⟳ Refresh
            </button>
          </div>
        </div>

        {/* Market grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 20 }}>
          {displayMarkets.length === 0 ? (
            <div style={{ textAlign: "center", color: T.muted, fontSize: 13, marginTop: 60 }}>
              No markets match the current filter.
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
              gap: 12,
            }}>
              {displayMarkets.map(m => (
                <MarketCard
                  key={m.id}
                  market={m}
                  selected={selected === m.id}
                  onClick={() => setSelected(selected === m.id ? null : m.id)}
                />
              ))}
            </div>
          )}

          {/* Footer note */}
          <div style={{ marginTop: 24, fontSize: 10, color: T.muted, textAlign: "center", lineHeight: 1.6 }}>
            Complaint data is simulated (Downdetector-style). Auto-refreshes every 15s. Outage events auto-create incident tickets.
          </div>
        </div>
      </div>

      {/* ── Right: detail panel ─────────────────────────────────────────────── */}
      {selectedMarket && (
        <DetailPanel
          market={selectedMarket}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
