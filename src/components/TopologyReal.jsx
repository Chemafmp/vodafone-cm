import { useState, useEffect, useRef } from "react";
import { T } from "../data/constants.js";

const POLLER = import.meta.env.VITE_POLLER_WS
  ? import.meta.env.VITE_POLLER_WS.replace(/^ws/, "http")
  : "http://localhost:4000";

const STATUS_COLOR = {
  ok:      "#22c55e",
  warn:    "#f59e0b",
  alert:   "#f97316",
  outage:  "#ef4444",
  loading: "#94a3b8",
  error:   "#6b7280",
};

const STATUS_LABEL = {
  ok:"NOMINAL", warn:"DEGRADED", alert:"ALERT", outage:"OUTAGE", loading:"…", error:"N/A",
};

/* Arrange 10 markets in two concentric circles */
const MARKET_IDS = ["uk","de","es","it","pt","nl","ie","gr","tr","int"];

function layoutMarkets(cx, cy, r1, r2) {
  const inner = ["int"];
  const outer = MARKET_IDS.filter(id => id !== "int");
  const positions = {};
  inner.forEach((id, i) => {
    const angle = (i / inner.length) * 2 * Math.PI - Math.PI / 2;
    positions[id] = { x: cx + r1 * Math.cos(angle), y: cy + r1 * Math.sin(angle) };
  });
  outer.forEach((id, i) => {
    const angle = (i / outer.length) * 2 * Math.PI - Math.PI / 2;
    positions[id] = { x: cx + r2 * Math.cos(angle), y: cy + r2 * Math.sin(angle) };
  });
  return positions;
}

const FLAGS = { uk:"🇬🇧", de:"🇩🇪", es:"🇪🇸", it:"🇮🇹", pt:"🇵🇹",
                nl:"🇳🇱", ie:"🇮🇪", gr:"🇬🇷", tr:"🇹🇷", int:"🌐" };
const NAMES = { uk:"UK", de:"DE", es:"ES", it:"IT", pt:"PT",
                nl:"NL", ie:"IE", gr:"GR", tr:"TR", int:"INT" };

export default function TopologyReal() {
  const svgRef = useRef(null);
  const [markets, setMarkets] = useState(() =>
    Object.fromEntries(MARKET_IDS.map(id => [id, { id, status:"loading", score:null, metrics:{} }]))
  );
  const [selected, setSelected] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [dims, setDims] = useState({ w:800, h:600 });

  /* Responsive SVG */
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setDims({ w: Math.max(400, width), h: Math.max(300, height) });
    });
    ro.observe(svgRef.current.parentElement);
    return () => ro.disconnect();
  }, []);

  /* Live data */
  useEffect(() => {
    let cancelled = false;
    async function fetchHealth() {
      try {
        const r = await fetch(`${POLLER}/api/network-health`);
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        if (cancelled) return;
        setMarkets(prev => {
          const next = { ...prev };
          data.forEach(m => {
            next[m.id] = {
              id: m.id,
              status: m.correlation?.status || m.status || "ok",
              score: m.correlation?.score ?? null,
              metrics: {
                rtt:     m.current?.avg_rtt,
                bgp:     m.bgp?.current?.visibility_pct,
                ris:     m.ris?.withdrawals1h,
                ioda:    m.ioda?.activeCount ?? 0,
              },
              insight: m.correlation?.insight,
              totalProbes: m.totalProbes,
            };
          });
          return next;
        });
        setLastFetch(new Date());
      } catch {
        if (!cancelled) {
          setMarkets(prev => Object.fromEntries(
            Object.keys(prev).map(id => [id, { ...prev[id], status:"error" }])
          ));
        }
      }
    }
    fetchHealth();
    const t = setInterval(fetchHealth, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const cx = dims.w / 2, cy = dims.h / 2;
  const r1 = Math.min(cx, cy) * 0.18;
  const r2 = Math.min(cx, cy) * 0.62;
  const positions = layoutMarkets(cx, cy, r1, r2);

  const selMarket = selected ? markets[selected] : null;

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden", background:T.bg }}>

      {/* ── SVG Topology ── */}
      <div ref={svgRef} style={{ flex:1, position:"relative", overflow:"hidden" }}>

        {/* Toolbar */}
        <div style={{ position:"absolute", top:12, left:12, zIndex:10,
          display:"flex", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.text, background:T.card,
            border:`1px solid ${T.border}`, borderRadius:8, padding:"5px 10px",
            display:"flex", alignItems:"center", gap:6 }}>
            <span>🗺</span> BGP ASN Topology — Vodafone Markets
          </div>
          {lastFetch && (
            <div style={{ fontSize:10, color:T.muted, background:T.card,
              border:`1px solid ${T.border}`, borderRadius:8, padding:"5px 10px" }}>
              Live · {lastFetch.toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ position:"absolute", bottom:12, left:12, zIndex:10,
          background:T.card, border:`1px solid ${T.border}`, borderRadius:8,
          padding:"8px 12px", display:"flex", gap:12, flexWrap:"wrap" }}>
          {Object.entries(STATUS_COLOR).filter(([k]) => k !== "loading").map(([k, col]) => (
            <div key={k} style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:T.muted }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:col, flexShrink:0 }}/>
              {STATUS_LABEL[k]}
            </div>
          ))}
        </div>

        <svg width={dims.w} height={dims.h} style={{ display:"block" }}>
          <defs>
            <radialGradient id="bgGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#1e293b" stopOpacity="0.03"/>
              <stop offset="100%" stopColor="#0f172a" stopOpacity="0.08"/>
            </radialGradient>
            {/* Glow filter for selected node */}
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Background grid rings */}
          {[r1 * 1.5, r2 * 0.8, r2 * 1.08].map((r, i) => (
            <circle key={i} cx={cx} cy={cy} r={r}
              fill="none" stroke={T.border} strokeWidth={1} strokeDasharray="4 6" opacity={0.5}/>
          ))}

          {/* Edges: outer markets → INT hub */}
          {MARKET_IDS.filter(id => id !== "int").map(id => {
            const from = positions[id];
            const to = positions["int"];
            const mStatus = markets[id]?.status || "loading";
            const col = STATUS_COLOR[mStatus] || "#94a3b8";
            const isHighlighted = selected === id || selected === "int";
            return (
              <line key={id}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke={isHighlighted ? col : T.border}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeDasharray={mStatus === "ok" ? "none" : "5 4"}
                opacity={isHighlighted ? 0.9 : 0.4}
              />
            );
          })}

          {/* Nodes */}
          {MARKET_IDS.map(id => {
            const pos = positions[id];
            const m = markets[id] || {};
            const col = STATUS_COLOR[m.status] || "#94a3b8";
            const isCenter = id === "int";
            const r = isCenter ? 30 : 24;
            const isSelected = id === selected;
            return (
              <g key={id} style={{ cursor:"pointer" }}
                onClick={() => setSelected(isSelected ? null : id)}>
                {/* Pulse ring for non-ok status */}
                {m.status && m.status !== "ok" && m.status !== "loading" && (
                  <circle cx={pos.x} cy={pos.y} r={r + 6}
                    fill="none" stroke={col} strokeWidth={1.5} opacity={0.25}/>
                )}
                {/* Selected glow */}
                {isSelected && (
                  <circle cx={pos.x} cy={pos.y} r={r + 4}
                    fill="none" stroke="#2563eb" strokeWidth={2.5} opacity={0.6}/>
                )}
                {/* Node circle */}
                <circle cx={pos.x} cy={pos.y} r={r}
                  fill={T.card} stroke={isSelected ? "#2563eb" : col}
                  strokeWidth={isSelected ? 3 : 2}
                  filter={isSelected ? "url(#glow)" : "none"}/>
                {/* Status dot */}
                <circle cx={pos.x + r * 0.65} cy={pos.y - r * 0.65} r={5}
                  fill={col} stroke={T.card} strokeWidth={1.5}/>
                {/* Flag emoji */}
                <text x={pos.x} y={pos.y - 3} textAnchor="middle" dominantBaseline="middle"
                  fontSize={isCenter ? 16 : 14}>{FLAGS[id]}</text>
                {/* Name label */}
                <text x={pos.x} y={pos.y + 11} textAnchor="middle"
                  fontSize={9} fontWeight={700} fill={T.muted}>{NAMES[id]}</text>
                {/* Score badge if selected */}
                {isSelected && m.score != null && (
                  <text x={pos.x} y={pos.y + r + 14} textAnchor="middle"
                    fontSize={10} fontWeight={700}
                    fill={m.score >= 80 ? "#15803d" : m.score >= 50 ? "#b45309" : "#dc2626"}>
                    {m.score}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Coming-soon enrichment banner */}
        <div style={{ position:"absolute", top:12, right:12, zIndex:10,
          background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8,
          padding:"8px 12px", maxWidth:220, fontSize:11, color:"#1d4ed8", lineHeight:1.5 }}>
          <div style={{ fontWeight:700, marginBottom:3 }}>BGP Peer Edges — Coming Soon</div>
          Real upstream/peer/downstream relationships via RIPE Stat asn-neighbours will be wired here.
        </div>
      </div>

      {/* ── Detail sidebar ── */}
      {selMarket && (
        <div style={{ width:280, flexShrink:0, borderLeft:`1px solid ${T.border}`,
          overflowY:"auto", padding:"16px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
            <span style={{ fontSize:24 }}>{FLAGS[selMarket.id]}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:T.text }}>
                Vodafone {NAMES[selMarket.id]}
              </div>
              <div style={{ fontSize:11, color:T.muted }}>
                {selMarket.totalProbes != null ? `${selMarket.totalProbes} probes` : ""}
              </div>
            </div>
            <button onClick={() => setSelected(null)}
              style={{ background:"none", border:"none", cursor:"pointer", color:T.muted, fontSize:16 }}>✕</button>
          </div>

          {/* Status */}
          <div style={{ padding:"8px 10px", borderRadius:8, marginBottom:12,
            background: selMarket.score >= 80 ? "#f0fdf4" : selMarket.score >= 50 ? "#fffbeb" : "#fef2f2",
            border:`1px solid ${selMarket.score >= 80 ? "#86efac" : selMarket.score >= 50 ? "#fcd34d" : "#fca5a5"}` }}>
            <div style={{ fontSize:20, fontWeight:800,
              color: selMarket.score >= 80 ? "#15803d" : selMarket.score >= 50 ? "#b45309" : "#991b1b",
              marginBottom:2 }}>
              {selMarket.score ?? "—"}
              <span style={{ fontSize:11, fontWeight:500, color:T.muted, marginLeft:6 }}>/ 100</span>
            </div>
            {selMarket.insight && (
              <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{selMarket.insight}</div>
            )}
          </div>

          {/* Metrics */}
          {[
            { label:"Avg RTT",       value:selMarket.metrics?.rtt,  unit:"ms" },
            { label:"BGP Visibility",value:selMarket.metrics?.bgp,  unit:"%" },
            { label:"RIS Wd/h",      value:selMarket.metrics?.ris },
            { label:"IODA Events",   value:selMarket.metrics?.ioda },
          ].map(({ label, value, unit }) => (
            <div key={label} style={{ display:"flex", justifyContent:"space-between",
              padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
              <span style={{ fontSize:12, color:T.muted }}>{label}</span>
              <span style={{ fontSize:12, fontWeight:600, color:T.text }}>
                {value == null ? "—" : typeof value === "number" ? value.toFixed(1) : value}
                {value != null && unit ? <span style={{ fontWeight:400, color:T.muted }}> {unit}</span> : ""}
              </span>
            </div>
          ))}

          <div style={{ marginTop:16, fontSize:11, color:T.muted, lineHeight:1.6 }}>
            BGP peer connections will appear here once RIPE Stat asn-neighbours integration is complete.
          </div>
        </div>
      )}
    </div>
  );
}
