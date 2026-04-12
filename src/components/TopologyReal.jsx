import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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

const NEIGHBOUR_TYPE_LABEL = { left: "Upstream", uncertain: "Peer" };

const MARKET_IDS = ["uk","de","es","it","pt","nl","ie","gr","tr","int"];
const FLAGS = { uk:"🇬🇧", de:"🇩🇪", es:"🇪🇸", it:"🇮🇹", pt:"🇵🇹",
                nl:"🇳🇱", ie:"🇮🇪", gr:"🇬🇷", tr:"🇹🇷", int:"🌐" };
const NAMES = { uk:"UK", de:"DE", es:"ES", it:"IT", pt:"PT",
                nl:"NL", ie:"IE", gr:"GR", tr:"TR", int:"INT" };

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

function layoutMarkets(cx, cy, r1, r2) {
  const positions = {};
  positions["int"] = { x: cx, y: cy };
  const outer = MARKET_IDS.filter(id => id !== "int");
  outer.forEach((id, i) => {
    const angle = (i / outer.length) * 2 * Math.PI - Math.PI / 2;
    positions[id] = { x: cx + r2 * Math.cos(angle), y: cy + r2 * Math.sin(angle) };
  });
  return positions;
}

// Compute transit nodes: ASNs appearing as upstream (left) in 2+ markets
function computeTransitNodes(enrichment, cx, cy, r3) {
  const asnMarkets = new Map();
  for (const m of enrichment) {
    for (const n of m.neighbours) {
      if (n.type === "left") {
        if (!asnMarkets.has(n.asn)) asnMarkets.set(n.asn, []);
        asnMarkets.get(n.asn).push({ marketId: m.id, ...n });
      }
    }
  }

  const shared = [...asnMarkets.entries()]
    .filter(([, arr]) => arr.length >= 2)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12);

  return shared.map(([asn, arr], i) => {
    const angle = (i / shared.length) * 2 * Math.PI - Math.PI / 2;
    return {
      asn,
      orgName: arr[0]?.orgName || `AS${asn}`,
      markets: arr.map(m => m.marketId),
      x: cx + r3 * Math.cos(angle),
      y: cy + r3 * Math.sin(angle),
    };
  });
}

export default function TopologyReal() {
  const containerRef = useRef(null);
  const svgRef       = useRef(null);
  const dragRef      = useRef(null);   // { startX, startY, startTx, startTy }

  const [markets, setMarkets]       = useState(() =>
    Object.fromEntries(MARKET_IDS.map(id => [id, { id, status:"loading", score:null, metrics:{} }]))
  );
  const [enrichment, setEnrichment] = useState([]);
  const [selected,   setSelected]   = useState(null);
  const [showTransit, setShowTransit] = useState(true);
  const [lastFetch,  setLastFetch]  = useState(null);
  const [dims,       setDims]       = useState({ w:900, h:600 });

  // Pan + Zoom state
  const [tx, setTx]     = useState(0);
  const [ty, setTy]     = useState(0);
  const [scale, setScale] = useState(1);

  /* Responsive dims */
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setDims({ w: Math.max(400, width), h: Math.max(300, height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* Network health */
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
              score:  m.correlation?.score ?? null,
              metrics: {
                rtt:  m.current?.avg_rtt,
                bgp:  m.bgp?.current?.visibility_pct,
                ris:  m.ris?.withdrawals1h,
                ioda: m.ioda?.activeCount ?? 0,
              },
              insight:    m.correlation?.insight,
              totalProbes: m.totalProbes,
            };
          });
          return next;
        });
        setLastFetch(new Date());
      } catch {
        if (!cancelled)
          setMarkets(prev => Object.fromEntries(
            Object.keys(prev).map(id => [id, { ...prev[id], status:"error" }])
          ));
      }
    }
    fetchHealth();
    const t = setInterval(fetchHealth, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  /* BGP enrichment — server caches 1h, we poll every 10 min */
  useEffect(() => {
    let cancelled = false;
    async function fetchEnrichment() {
      try {
        const r = await fetch(`${POLLER}/api/asn-neighbours`);
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        if (!cancelled) setEnrichment(data);
      } catch { /* non-fatal */ }
    }
    fetchEnrichment();
    const t = setInterval(fetchEnrichment, 600_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  /* ── Layout maths ── */
  const cx = dims.w / 2;
  const cy = dims.h / 2;
  const r1 = 22;                              // INT center offset (kept tiny — center IS the hub)
  const r2 = Math.min(cx, cy) * 0.52;        // Vodafone market ring
  const r3 = Math.min(cx, cy) * 0.82;        // Transit provider ring (was 0.88 — less clipping)
  const positions = useMemo(() => layoutMarkets(cx, cy, r1, r2), [cx, cy, r2]);

  const transitNodes = useMemo(
    () => (showTransit && enrichment.length ? computeTransitNodes(enrichment, cx, cy, r3) : []),
    [enrichment, showTransit, cx, cy, r3]
  );

  /* ── Pan & Zoom handlers ── */
  const onWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(s => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s * delta)));
  }, []);

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startTx: tx, startTy: ty };
  }, [tx, ty]);

  const onMouseMove = useCallback((e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setTx(dragRef.current.startTx + dx);
    setTy(dragRef.current.startTy + dy);
  }, []);

  const onMouseUp = useCallback(() => { dragRef.current = null; }, []);

  const resetView = () => { setTx(0); setTy(0); setScale(1); };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const selMarket = selected ? markets[selected] : null;
  const selEnrich = selected ? enrichment.find(e => e.id === selected) : null;

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden", background:T.bg }}>

      {/* ── SVG canvas ── */}
      <div ref={containerRef} style={{ flex:1, position:"relative", overflow:"hidden" }}>

        {/* Toolbar */}
        <div style={{ position:"absolute", top:12, left:12, zIndex:10,
          display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.text, background:T.card,
            border:`1px solid ${T.border}`, borderRadius:8, padding:"5px 10px",
            display:"flex", alignItems:"center", gap:6 }}>
            🗺 BGP ASN Topology — Vodafone Markets
          </div>
          {lastFetch && (
            <div style={{ fontSize:10, color:T.muted, background:T.card,
              border:`1px solid ${T.border}`, borderRadius:8, padding:"5px 10px" }}>
              Live · {lastFetch.toLocaleTimeString()}
            </div>
          )}
          <button onClick={() => setShowTransit(v => !v)}
            style={{ fontSize:10, fontWeight:700, padding:"5px 10px", borderRadius:8,
              border:`1px solid ${showTransit ? "#6366f1" : T.border}`,
              background: showTransit ? "rgba(99,102,241,0.15)" : T.card,
              color: showTransit ? "#a5b4fc" : T.muted,
              cursor:"pointer", fontFamily:"inherit" }}>
            🔗 Transit Peers {transitNodes.length > 0 ? `(${transitNodes.length})` : ""}
          </button>
          <button onClick={resetView}
            style={{ fontSize:10, fontWeight:600, padding:"5px 10px", borderRadius:8,
              border:`1px solid ${T.border}`, background:T.card, color:T.muted,
              cursor:"pointer", fontFamily:"inherit" }}>
            ⊙ Reset view
          </button>
        </div>

        {/* Zoom hint */}
        <div style={{ position:"absolute", top:12, right:12, zIndex:10,
          fontSize:10, color:T.muted, background:T.card,
          border:`1px solid ${T.border}`, borderRadius:8, padding:"5px 10px" }}>
          Scroll to zoom · Drag to pan
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
          {showTransit && transitNodes.length > 0 && (
            <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:10, color:T.muted }}>
              <span style={{ width:10, height:6, borderRadius:2,
                background:"rgba(99,102,241,0.3)", border:"1px solid #6366f1", flexShrink:0 }}/>
              Transit (2+ markets)
            </div>
          )}
        </div>

        <svg ref={svgRef} width={dims.w} height={dims.h}
          style={{ display:"block", cursor: dragRef.current ? "grabbing" : "grab" }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>

          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="shadowLight">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.3"/>
            </filter>
          </defs>

          {/* All content inside this group — pan + zoom applied here */}
          <g transform={`translate(${tx},${ty}) scale(${scale})`}
            style={{ transformOrigin:"center" }}>

            {/* Background rings */}
            {[r2 * 0.55, r2 * 1.05, ...(showTransit && transitNodes.length ? [r3 * 1.0] : [])].map((r, i) => (
              <circle key={i} cx={cx} cy={cy} r={r}
                fill="none" stroke={T.border} strokeWidth={1}
                strokeDasharray="4 8" opacity={0.4}/>
            ))}

            {/* ── Transit edges (market → transit node) ── */}
            {showTransit && transitNodes.map(tn =>
              tn.markets.map(marketId => {
                const from = positions[marketId];
                if (!from) return null;
                const isHighlighted = selected === marketId || (selected && tn.markets.includes(selected));
                return (
                  <line key={`${tn.asn}-${marketId}`}
                    x1={from.x} y1={from.y} x2={tn.x} y2={tn.y}
                    stroke={isHighlighted ? "#818cf8" : "rgba(99,102,241,0.45)"}
                    strokeWidth={isHighlighted ? 2 : 1.5}
                    strokeDasharray="5 5"
                    opacity={isHighlighted ? 1 : 0.65}
                  />
                );
              })
            )}

            {/* ── Hub-spoke edges (market → INT) ── */}
            {MARKET_IDS.filter(id => id !== "int").map(id => {
              const from = positions[id];
              const to   = positions["int"];
              const m    = markets[id] || {};
              const col  = STATUS_COLOR[m.status] || "#94a3b8";
              const isHL = selected === id || selected === "int";
              return (
                <line key={id}
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  stroke={isHL ? col : "rgba(148,163,184,0.35)"}
                  strokeWidth={isHL ? 2.5 : 1.5}
                  strokeDasharray={m.status === "ok" || m.status === "loading" ? "none" : "6 4"}
                  opacity={isHL ? 1 : 0.6}
                />
              );
            })}

            {/* ── Transit provider nodes ── */}
            {showTransit && transitNodes.map(tn => {
              const isHL = selected && tn.markets.includes(selected);
              const label = tn.orgName.length > 11 ? tn.orgName.slice(0, 10) + "…" : tn.orgName;
              const boxW  = 64, boxH = 22;
              return (
                <g key={tn.asn}>
                  <rect x={tn.x - boxW/2} y={tn.y - boxH/2} width={boxW} height={boxH} rx={5}
                    fill={isHL ? "rgba(99,102,241,0.25)" : "rgba(30,41,59,0.85)"}
                    stroke={isHL ? "#818cf8" : "rgba(99,102,241,0.55)"}
                    strokeWidth={isHL ? 1.5 : 1}
                    filter="url(#shadowLight)"/>
                  <text x={tn.x} y={tn.y - 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize={9} fontWeight={isHL ? 700 : 600}
                    fill={isHL ? "#c7d2fe" : "#94a3b8"}>
                    {label}
                  </text>
                  <text x={tn.x} y={tn.y + 8} textAnchor="middle"
                    fontSize={7.5} fill="rgba(99,102,241,0.7)" fontWeight={500}>
                    AS{tn.asn} · {tn.markets.length} markets
                  </text>
                </g>
              );
            })}

            {/* ── Market nodes ── */}
            {MARKET_IDS.map(id => {
              const pos      = positions[id];
              const m        = markets[id] || {};
              const col      = STATUS_COLOR[m.status] || "#94a3b8";
              const isCenter = id === "int";
              const r        = isCenter ? 30 : 24;
              const isSelected = id === selected;

              return (
                <g key={id} style={{ cursor:"pointer" }}
                  onClick={e => { e.stopPropagation(); setSelected(isSelected ? null : id); }}>

                  {/* Status pulse ring */}
                  {m.status && m.status !== "ok" && m.status !== "loading" && (
                    <circle cx={pos.x} cy={pos.y} r={r + 7}
                      fill="none" stroke={col} strokeWidth={1.5} opacity={0.2}/>
                  )}
                  {/* Selection ring */}
                  {isSelected && (
                    <circle cx={pos.x} cy={pos.y} r={r + 5}
                      fill="none" stroke="#2563eb" strokeWidth={2.5} opacity={0.7}/>
                  )}
                  {/* Node body */}
                  <circle cx={pos.x} cy={pos.y} r={r}
                    fill={T.card} stroke={isSelected ? "#2563eb" : col}
                    strokeWidth={isSelected ? 3 : 2}
                    filter={isSelected ? "url(#glow)" : "none"}/>
                  {/* Status dot */}
                  <circle cx={pos.x + r * 0.65} cy={pos.y - r * 0.65} r={5}
                    fill={col} stroke={T.card} strokeWidth={1.5}/>
                  {/* Flag */}
                  <text x={pos.x} y={pos.y - 2} textAnchor="middle" dominantBaseline="middle"
                    fontSize={isCenter ? 16 : 13} style={{ pointerEvents:"none" }}>
                    {FLAGS[id]}
                  </text>
                  {/* Name */}
                  <text x={pos.x} y={pos.y + 12} textAnchor="middle"
                    fontSize={9} fontWeight={700} fill={T.muted} style={{ pointerEvents:"none" }}>
                    {NAMES[id]}
                  </text>
                  {/* Score badge */}
                  {isSelected && m.score != null && (
                    <text x={pos.x} y={pos.y + r + 14} textAnchor="middle"
                      fontSize={10} fontWeight={700}
                      fill={m.score >= 80 ? "#22c55e" : m.score >= 50 ? "#f59e0b" : "#ef4444"}>
                      {m.score}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* ── Detail sidebar ── */}
      {selMarket && (
        <div style={{ width:290, flexShrink:0, borderLeft:`1px solid ${T.border}`,
          overflowY:"auto", padding:"16px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
            <span style={{ fontSize:24 }}>{FLAGS[selMarket.id]}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:T.text }}>
                Vodafone {NAMES[selMarket.id]}
              </div>
              <div style={{ fontSize:11, color:T.muted }}>
                {selEnrich ? `AS${selEnrich.asn}` : ""}
                {selMarket.totalProbes != null ? ` · ${selMarket.totalProbes} probes` : ""}
              </div>
            </div>
            <button onClick={() => setSelected(null)}
              style={{ background:"none", border:"none", cursor:"pointer",
                color:T.muted, fontSize:16 }}>✕</button>
          </div>

          {/* Health score */}
          <div style={{ padding:"8px 10px", borderRadius:8, marginBottom:12,
            background: selMarket.score >= 80 ? "#f0fdf4"
              : selMarket.score >= 50 ? "#fffbeb" : "#fef2f2",
            border:`1px solid ${selMarket.score >= 80 ? "#86efac"
              : selMarket.score >= 50 ? "#fcd34d" : "#fca5a5"}` }}>
            <div style={{ fontSize:20, fontWeight:800,
              color: selMarket.score >= 80 ? "#15803d"
                : selMarket.score >= 50 ? "#b45309" : "#991b1b", marginBottom:2 }}>
              {selMarket.score ?? "—"}
              <span style={{ fontSize:11, fontWeight:500, color:T.muted, marginLeft:6 }}>/ 100</span>
            </div>
            {selMarket.insight && (
              <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{selMarket.insight}</div>
            )}
          </div>

          {/* Signal metrics */}
          {[
            { label:"Avg RTT",        value:selMarket.metrics?.rtt,  unit:"ms" },
            { label:"BGP Visibility", value:selMarket.metrics?.bgp,  unit:"%" },
            { label:"RIS Wd/h",       value:selMarket.metrics?.ris },
            { label:"IODA Events",    value:selMarket.metrics?.ioda },
          ].map(({ label, value, unit }) => (
            <div key={label} style={{ display:"flex", justifyContent:"space-between",
              padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
              <span style={{ fontSize:12, color:T.muted }}>{label}</span>
              <span style={{ fontSize:12, fontWeight:600, color:T.text }}>
                {value == null ? "—" : typeof value === "number" ? value.toFixed(1) : value}
                {value != null && unit
                  ? <span style={{ fontWeight:400, color:T.muted }}> {unit}</span> : ""}
              </span>
            </div>
          ))}

          {/* BGP Neighbours */}
          {selEnrich && selEnrich.neighbours.length > 0 && (
            <div style={{ marginTop:14 }}>
              <div style={{ fontSize:10, fontWeight:700,
                color:"rgba(255,255,255,0.3)", letterSpacing:"0.8px",
                textTransform:"uppercase", marginBottom:8 }}>
                BGP Neighbours
              </div>
              {selEnrich.neighbours.map(n => (
                <div key={n.asn} style={{ display:"flex", alignItems:"center", gap:8,
                  padding:"5px 0", borderBottom:`1px solid ${T.border}` }}>
                  <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:4,
                    background: n.type === "left"
                      ? "rgba(37,99,235,0.15)" : "rgba(124,58,237,0.15)",
                    color: n.type === "left" ? "#60a5fa" : "#a78bfa",
                    border:`1px solid ${n.type === "left"
                      ? "rgba(37,99,235,0.3)" : "rgba(124,58,237,0.3)"}`,
                    flexShrink:0, textTransform:"uppercase" }}>
                    {NEIGHBOUR_TYPE_LABEL[n.type] || n.type}
                  </span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text,
                      overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                      {n.orgName}
                    </div>
                    <div style={{ fontSize:10, color:T.muted }}>
                      AS{n.asn}{n.country ? ` · ${n.country}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {selEnrich && selEnrich.neighbours.length === 0 && selEnrich.lastUpdated == null && (
            <div style={{ marginTop:14, fontSize:11, color:T.muted }}>
              Loading BGP neighbours from RIPE Stat…
            </div>
          )}
        </div>
      )}
    </div>
  );
}
