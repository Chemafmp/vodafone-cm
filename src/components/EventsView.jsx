import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { T } from "../data/constants.js";
import { EVENTS, AUTOMATION_SOURCES, COUNTRY_META, SITES, SERVICES } from "../data/inventory/index.js";
import { useNodes } from "../context/NodesContext.jsx";
import { LAYER_COLORS } from "../data/inventory/sites.js";

/* ═══════════════════════════════════════════════════════════════════════════
   Event Dashboard — flat timeline + legend + filters (country/DC/service/device)
   ═══════════════════════════════════════════════════════════════════════════ */

const DPR = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

/* ─── Event type colours & shapes ─────────────────────────────────────── */
const EV_TYPES = {
  "alarm-crit":  { fill:"#dc2626", stroke:"#ef4444", bg:"#fee2e2", tc:"#7f1d1d", lbl:"Alarm Critical", shp:"circle" },
  "alarm-warn":  { fill:"#d97706", stroke:"#f59e0b", bg:"#fef3c7", tc:"#78350f", lbl:"Alarm Warning",  shp:"circle" },
  "auto":        { fill:"#7c3aed", stroke:"#a78bfa", bg:"#ede9fe", tc:"#3b0764", lbl:"Automation",     shp:"bar" },
  "config":      { fill:"#0d9488", stroke:"#14b8a6", bg:"#ccfbf1", tc:"#134e4a", lbl:"Config Change",  shp:"bar" },
  "bgp":         { fill:"#a21caf", stroke:"#c026d3", bg:"#fae8ff", tc:"#701a75", lbl:"BGP",            shp:"tri" },
  "interface":   { fill:"#2563eb", stroke:"#3b82f6", bg:"#dbeafe", tc:"#1e3a8a", lbl:"Interface",      shp:"circle" },
  "traffic":     { fill:"#ea580c", stroke:"#f97316", bg:"#ffedd5", tc:"#7c2d12", lbl:"Traffic",        shp:"diamond" },
  "security":    { fill:"#be185d", stroke:"#ec4899", bg:"#fce7f3", tc:"#831843", lbl:"Security",       shp:"diamond" },
  "system":      { fill:"#64748b", stroke:"#94a3b8", bg:"#f1f5f9", tc:"#1e293b", lbl:"System",         shp:"circle" },
};

/* ─── Map event to type key ──────────────────────────────────────────── */
function evType(ev) {
  if (ev.type === "AUTOMATION") return "auto";
  if (ev.type === "ALARM" || (ev.severity === "critical" && ev.type !== "CONFIG")) return ev.severity === "critical" ? "alarm-crit" : "alarm-warn";
  if (ev.type === "BGP") return "bgp";
  if (ev.type === "INTERFACE") return "interface";
  if (ev.type === "TRAFFIC") return "traffic";
  if (ev.type === "CONFIG") return "config";
  if (ev.type === "SECURITY") return "security";
  return "system";
}

/* ─── Time helpers ───────────────────────────────────────────────────── */
const p2 = n => String(n).padStart(2, "0");
function fmtHM(ts) { const d = new Date(ts); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; }
function fmtDMH(ts) { const d = new Date(ts); return `${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})} ${fmtHM(ts)}`; }

/* ═══════════════════════════════════════════════════════════════════════ */
export default function EventsView() {
  const { nodes: NODES } = useNodes();
  const canvasRef = useRef(null);
  const axisRef = useRef(null);
  const paneRef = useRef(null);

  /* ── View state ── */
  const [winH, setWinH] = useState(12);
  const [winS, setWinS] = useState(() => Date.now() - 6 * 3600000);
  const [hidden, setHidden] = useState(new Set());
  const [tooltip, setTooltip] = useState(null);
  const [selectedEvt, setSelectedEvt] = useState(null);
  const dragRef = useRef(null);
  const evBBoxRef = useRef([]);

  /* ── Filters ── */
  const [fCountry, setFCountry] = useState("ALL");
  const [fSite, setFSite] = useState("ALL");
  const [fService, setFService] = useState("ALL");
  const [fDevice, setFDevice] = useState("ALL");

  const nodeMap = useMemo(() => Object.fromEntries(NODES.map(n => [n.id, n])), [NODES]);

  /* ── Derived filter options ── */
  const filteredSites = useMemo(() => fCountry === "ALL" ? SITES : SITES.filter(s => s.country === fCountry), [fCountry]);
  const filteredServices = useMemo(() => fCountry === "ALL" ? SERVICES : SERVICES.filter(s => s.country === fCountry), [fCountry]);
  const filteredDevices = useMemo(() => {
    let n = NODES;
    if (fCountry !== "ALL") n = n.filter(d => d.country === fCountry);
    if (fService !== "ALL") {
      const svc = SERVICES.find(s => s.id === fService);
      if (svc) n = n.filter(d => svc.nodes.includes(d.id));
    }
    return n;
  }, [NODES, fCountry, fService]);

  /* ── Filtered events ── */
  const mappedEvents = useMemo(() => {
    let evs = EVENTS.map(ev => ({ ...ev, _type: evType(ev), _ts: new Date(ev.ts).getTime() }));
    if (fCountry !== "ALL") evs = evs.filter(e => e.country === fCountry);
    if (fSite !== "ALL") {
      // Match events whose node belongs to the selected site
      const sitePrefix = fSite.replace(/-dc\d+$|-core\d+$|-ixp\d+$/, "");
      const siteCity = fSite.split("-").slice(0, 2).join("-");
      evs = evs.filter(e => {
        const nodeCity = e.nodeId.split("-").slice(0, 2).join("-");
        return nodeCity === siteCity;
      });
    }
    if (fService !== "ALL") {
      const svc = SERVICES.find(s => s.id === fService);
      if (svc) evs = evs.filter(e => svc.nodes.includes(e.nodeId));
    }
    if (fDevice !== "ALL") evs = evs.filter(e => e.nodeId === fDevice);
    return evs;
  }, [fCountry, fSite, fService, fDevice]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    total: mappedEvents.length,
    alarms: mappedEvents.filter(e => e._type === "alarm-crit" || e._type === "alarm-warn").length,
    auto: mappedEvents.filter(e => e._type === "auto").length,
    config: mappedEvents.filter(e => e._type === "config").length,
    network: mappedEvents.filter(e => ["bgp","interface","traffic"].includes(e._type)).length,
  }), [mappedEvents]);

  const winE = winS + winH * 3600000;
  const pW = useCallback(() => paneRef.current?.clientWidth || 800, []);
  const tX = useCallback((t) => ((t - winS) / (winH * 3600000)) * pW(), [winS, winH, pW]);

  /* ── Canvas height — flat timeline: 1 row per visible event in time window ── */
  const LANE_H = 180; // flat canvas height

  /* ── Draw ──────────────────────────────────────────────────────────── */
  const drawAll = useCallback(() => {
    const cv = canvasRef.current;
    const axCv = axisRef.current;
    const pane = paneRef.current;
    if (!cv || !pane) return;
    const W = pane.clientWidth;
    const H = LANE_H;

    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    const ctx = cv.getContext("2d"); ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

    // Hour grid
    ctx.strokeStyle = "rgba(0,0,0,0.06)"; ctx.lineWidth = 0.5; ctx.setLineDash([3, 4]);
    for (let t = winS - 3600000; t <= winE + 3600000; t += 3600000) {
      const snap = Math.round(t / 3600000) * 3600000;
      const x = tX(snap);
      if (x < -2 || x > W + 2) continue;
      if (new Date(snap).getMinutes() === 0) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // Visible events in time window
    const visible = mappedEvents.filter(e => e._ts >= winS - 600000 && e._ts <= winE + 600000 && !hidden.has(e._type));

    // Distribute events vertically to avoid overlap — simple lane packing
    const evBBox = [];
    const lanes = []; // each lane stores the rightmost x used

    // Sort by time
    const sorted = [...visible].sort((a, b) => a._ts - b._ts);
    const eventLanes = new Map(); // evId -> laneIndex
    const MARKER_W = 14; // approximate marker width for collision

    for (const ev of sorted) {
      const x = tX(ev._ts);
      // Find first lane where this event doesn't overlap
      let placed = false;
      for (let li = 0; li < lanes.length; li++) {
        if (x - lanes[li] > MARKER_W + 4) {
          lanes[li] = x + MARKER_W;
          eventLanes.set(ev.id, li);
          placed = true;
          break;
        }
      }
      if (!placed) {
        eventLanes.set(ev.id, lanes.length);
        lanes.push(x + MARKER_W);
      }
    }

    const numLanes = Math.max(lanes.length, 1);
    const laneH = Math.min(28, (H - 20) / numLanes);
    const startY = 10;

    for (const ev of sorted) {
      const col = EV_TYPES[ev._type];
      if (!col) continue;
      const x = tX(ev._ts);
      const li = eventLanes.get(ev.id) || 0;
      const cy = startY + li * laneH + laneH / 2;
      const isSelected = selectedEvt === ev.id;

      // Draw marker
      const mr = isSelected ? 8 : 6;

      if (col.shp === "bar") {
        // Duration bar
        const bw = Math.max(8, tX(ev._ts + 180000) - x);
        const bh = laneH * 0.55;
        ctx.fillStyle = isSelected ? col.fill + "dd" : col.bg;
        rrect(ctx, x, cy - bh/2, bw, bh, 3); ctx.fill();
        ctx.strokeStyle = isSelected ? col.fill : col.stroke + "88"; ctx.lineWidth = isSelected ? 2 : 1;
        rrect(ctx, x, cy - bh/2, bw, bh, 3); ctx.stroke();
        evBBox.push({ ev, x1: x, x2: x + bw, yt: cy - bh/2, yb: cy + bh/2, cy });
      } else if (col.shp === "tri") {
        ctx.beginPath(); ctx.moveTo(x, cy - mr); ctx.lineTo(x + mr * 0.9, cy + mr * 0.7); ctx.lineTo(x - mr * 0.9, cy + mr * 0.7); ctx.closePath();
        ctx.fillStyle = isSelected ? col.fill + "dd" : col.bg; ctx.fill();
        ctx.strokeStyle = col.stroke; ctx.lineWidth = isSelected ? 2.2 : 1.4; ctx.stroke();
        evBBox.push({ ev, x1: x - mr, x2: x + mr, yt: cy - mr, yb: cy + mr, cy });
      } else if (col.shp === "diamond") {
        ctx.save(); ctx.translate(x, cy); ctx.rotate(Math.PI / 4);
        const s = mr * 0.7; ctx.beginPath(); ctx.rect(-s, -s, s * 2, s * 2);
        ctx.fillStyle = isSelected ? col.fill + "dd" : col.bg; ctx.fill();
        ctx.strokeStyle = col.stroke; ctx.lineWidth = isSelected ? 2.2 : 1.4; ctx.stroke();
        ctx.restore();
        evBBox.push({ ev, x1: x - mr, x2: x + mr, yt: cy - mr, yb: cy + mr, cy });
      } else {
        ctx.beginPath(); ctx.arc(x, cy, mr, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? col.fill + "dd" : col.bg; ctx.fill();
        ctx.strokeStyle = col.stroke; ctx.lineWidth = isSelected ? 2.2 : 1.4; ctx.stroke();
        evBBox.push({ ev, x1: x - mr, x2: x + mr, yt: cy - mr, yb: cy + mr, cy });
      }
    }

    // NOW line
    const nowX = tX(Date.now());
    if (nowX > 0 && nowX < W) {
      ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(nowX, 0); ctx.lineTo(nowX, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#dc2626"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center";
      ctx.fillText("NOW", nowX, 10);
    }

    evBBoxRef.current = evBBox;

    // Axis
    if (axCv) {
      const axW = W, axH = 24;
      axCv.width = Math.round(axW * DPR); axCv.height = Math.round(axH * DPR);
      axCv.style.width = axW + "px"; axCv.style.height = axH + "px";
      const ac = axCv.getContext("2d"); ac.scale(DPR, DPR); ac.clearRect(0, 0, axW, axH);
      const step = winH <= 2 ? 0.5 : winH <= 6 ? 1 : winH <= 12 ? 2 : 4;
      ac.font = "10px system-ui,sans-serif"; ac.textAlign = "center";
      for (let t = winS - 3600000 * 2; t <= winE + 3600000 * 2; t += step * 3600000) {
        const snap = Math.round(t / (step * 3600000)) * step * 3600000;
        const x = tX(snap);
        if (x < -20 || x > axW + 20) continue;
        ac.strokeStyle = "#c8d0da"; ac.lineWidth = 0.5;
        ac.beginPath(); ac.moveTo(x, 0); ac.lineTo(x, 6); ac.stroke();
        ac.fillStyle = "#7a8fa8";
        const d = new Date(snap);
        // Show date if it's midnight or different day
        if (d.getHours() === 0 && d.getMinutes() === 0) {
          ac.fillText(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), x, 16);
        } else {
          ac.fillText(fmtHM(snap), x, 16);
        }
      }
    }
  }, [winS, winH, winE, tX, pW, mappedEvents, hidden, selectedEvt]);

  useEffect(() => { drawAll(); }, [drawAll]);
  useEffect(() => { const r = () => drawAll(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, [drawAll]);

  /* ── Mouse interactions ── */
  const hitTest = useCallback((mx, my) => {
    for (const bb of evBBoxRef.current) {
      if (my < bb.yt - 4 || my > bb.yb + 4) continue;
      if (mx >= bb.x1 - 4 && mx <= bb.x2 + 4) return bb.ev;
    }
    return null;
  }, []);

  const handleCanvasMove = useCallback((e) => {
    if (dragRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const ev = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (ev) {
      const col = EV_TYPES[ev._type];
      const node = nodeMap[ev.nodeId];
      setTooltip({
        x: e.clientX + 14, y: e.clientY - 10,
        ev, col, node,
      });
    } else {
      setTooltip(null);
    }
  }, [hitTest, nodeMap]);

  const handleCanvasClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const ev = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    setSelectedEvt(ev ? (ev.id === selectedEvt ? null : ev.id) : null);
  }, [hitTest, selectedEvt]);

  // Drag to pan
  const handleMouseDown = useCallback((e) => {
    dragRef.current = { startX: e.clientX, startWinS: winS };
  }, [winS]);

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragRef.current) return;
      const mspp = (winH * 3600000) / pW();
      setWinS(dragRef.current.startWinS - (e.clientX - dragRef.current.startX) * mspp);
    };
    const handleUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [winH, pW]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const ZOOMS = [1, 2, 4, 6, 12, 24, 48];
    const idx = ZOOMS.indexOf(winH);
    const ni = Math.max(0, Math.min(ZOOMS.length - 1, (idx === -1 ? 3 : idx) + (e.deltaY > 0 ? 1 : -1)));
    setWinH(ZOOMS[ni]);
  }, [winH]);

  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const ZOOMS = [1, 2, 4, 6, 12, 24, 48];
  const pan = useCallback((h) => setWinS(s => s + h * 3600000), []);
  const toggleLeg = useCallback((k) => setHidden(h => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);

  const navLabel = useMemo(() => {
    const s = new Date(winS);
    return `${s.toLocaleDateString("en-US",{month:"short",day:"numeric"})} ${fmtHM(winS)} → ${fmtHM(winE)} (${winH}h)`;
  }, [winS, winE, winH]);

  /* ── Selected event detail ── */
  const selEvt = useMemo(() => mappedEvents.find(e => e.id === selectedEvt), [mappedEvents, selectedEvt]);
  const selNode = selEvt ? nodeMap[selEvt.nodeId] : null;
  const selCol = selEvt ? EV_TYPES[selEvt._type] : null;

  /* ── Sorted event feed ── */
  const sortedEvents = useMemo(() =>
    [...mappedEvents].filter(e => !hidden.has(e._type)).sort((a, b) => b._ts - a._ts),
  [mappedEvents, hidden]);

  const selectFeedEvent = useCallback((ev) => {
    setSelectedEvt(ev.id === selectedEvt ? null : ev.id);
    setWinS(ev._ts - 0.3 * winH * 3600000);
  }, [selectedEvt, winH]);

  /* ── Reset dependent filters when parent changes ── */
  useEffect(() => { setFSite("ALL"); setFService("ALL"); setFDevice("ALL"); }, [fCountry]);
  useEffect(() => { setFDevice("ALL"); }, [fService]);

  return <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", fontFamily:"'Inter',system-ui,sans-serif", background:"#f4f6f9", color:"#1a2535", fontSize:13 }}>

    {/* ══ TOP BAR ══ */}
    <div style={{ display:"flex", alignItems:"center", background:"#fff", borderBottom:"1px solid #dde2ea", flexShrink:0, height:48, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ padding:"0 16px", borderRight:"1px solid #dde2ea", height:"100%", display:"flex", flexDirection:"column", justifyContent:"center", minWidth:140 }}>
        <div style={{ fontFamily:"monospace", fontSize:14, fontWeight:700 }}>Event Dashboard</div>
      </div>
      {/* KPIs */}
      {[
        { v:stats.total, l:"Total", c:"#1a2535" },
        { v:stats.alarms, l:"Alarms", c:"#dc2626" },
        { v:stats.auto, l:"Auto", c:"#7c3aed" },
        { v:stats.config, l:"Config", c:"#0d9488" },
        { v:stats.network, l:"Network", c:"#2563eb" },
      ].map(k => <div key={k.l} style={{ display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:"0 12px", borderRight:"1px solid #dde2ea", height:"100%", gap:0, minWidth:58 }}>
        <div style={{ fontFamily:"monospace", fontSize:16, fontWeight:700, lineHeight:1, color:k.c }}>{k.v}</div>
        <div style={{ fontSize:8, textTransform:"uppercase", letterSpacing:0.8, color:"#7a8fa8" }}>{k.l}</div>
      </div>)}

      {/* ── Filters ── */}
      <div style={{ display:"flex", gap:6, alignItems:"center", padding:"0 12px", marginLeft:8, flex:1, flexWrap:"wrap" }}>
        <Sel value={fCountry} onChange={setFCountry} options={[{v:"ALL",l:"🌐 All Countries"},...["FJ","HW","IB"].map(c=>({v:c,l:`${COUNTRY_META[c]?.flag} ${COUNTRY_META[c]?.name}`}))]}/>
        <Sel value={fSite} onChange={setFSite} options={[{v:"ALL",l:"All DCs / Sites"},...filteredSites.map(s=>({v:s.id,l:`${s.name} (${s.type})`}))]}/>
        <Sel value={fService} onChange={setFService} options={[{v:"ALL",l:"All Services"},...filteredServices.map(s=>({v:s.id,l:s.name}))]}/>
        <Sel value={fDevice} onChange={setFDevice} options={[{v:"ALL",l:"All Devices"},...filteredDevices.map(d=>({v:d.id,l:d.id}))]}/>
      </div>
    </div>

    {/* ══ LEGEND + NAV ══ */}
    <div style={{ display:"flex", alignItems:"center", background:"#fff", borderBottom:"1px solid #dde2ea", flexShrink:0, padding:"4px 12px", gap:6, flexWrap:"wrap" }}>
      {/* Legend toggles */}
      {Object.entries(EV_TYPES).map(([k, col]) =>
        <span key={k} onClick={() => toggleLeg(k)}
          style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, color:"#7a8fa8", cursor:"pointer",
            padding:"2px 8px", borderRadius:10, border:`1px solid ${hidden.has(k)?"transparent":col.fill+"40"}`,
            background: hidden.has(k) ? "transparent" : col.bg+"80",
            opacity: hidden.has(k) ? 0.35 : 1, transition:"all 0.12s", userSelect:"none" }}>
          <span style={{ width:8, height:8, borderRadius: col.shp==="circle"?"50%":col.shp==="diamond"?"1px":"2px",
            background:col.fill, transform:col.shp==="diamond"?"rotate(45deg)":"none", flexShrink:0 }}/>
          {col.lbl}
        </span>
      )}

      <div style={{ width:1, height:18, background:"#dde2ea", margin:"0 4px" }}/>

      {/* Nav */}
      <NB onClick={() => pan(-3)}>◀◀</NB>
      <NB onClick={() => pan(-1)}>◀</NB>
      <span style={{ fontFamily:"monospace", fontSize:10, color:"#7a8fa8", minWidth:140, textAlign:"center" }}>{navLabel}</span>
      <NB onClick={() => pan(1)}>▶</NB>
      <NB onClick={() => pan(3)}>▶▶</NB>
      <div style={{ width:1, height:18, background:"#dde2ea", margin:"0 2px" }}/>
      <div style={{ display:"flex", gap:2 }}>
        {ZOOMS.map(z => <button key={z} onClick={() => setWinH(z)}
          style={{ fontSize:9, padding:"2px 7px", borderRadius:4, border:`1px solid ${winH===z?"#0077cc":"#dde2ea"}`,
            background:winH===z?"#0077cc":"#f0f2f5", color:winH===z?"#fff":"#7a8fa8", cursor:"pointer", fontFamily:"inherit" }}>
          {z}h
        </button>)}
      </div>
      <NB onClick={() => { setWinH(12); setWinS(Date.now() - 6*3600000); }}>⌂</NB>
    </div>

    {/* ══ MAIN: Canvas timeline + Event feed ══ */}
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minHeight:0 }}>
      {/* Canvas area */}
      <div style={{ flexShrink:0, display:"flex", flexDirection:"column", background:"#fff", borderBottom:"1px solid #dde2ea" }}>
        <div ref={paneRef} style={{ height:LANE_H, overflow:"hidden", position:"relative", cursor:dragRef.current?"grabbing":"grab" }}
          onMouseDown={handleMouseDown}>
          <canvas ref={canvasRef} style={{ display:"block" }}
            onMouseMove={handleCanvasMove} onMouseLeave={() => setTooltip(null)}
            onClick={handleCanvasClick}/>
        </div>
        {/* Axis */}
        <div style={{ height:24, background:"#f8f9fb", borderTop:"1px solid #eaecf0" }}>
          <canvas ref={axisRef} style={{ display:"block" }}/>
        </div>
      </div>

      {/* ── Event feed + Detail ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
        {/* Feed list */}
        <div style={{ flex:1, overflowY:"auto", background:"#fff" }}>
          <div style={{ position:"sticky", top:0, background:"#f8f9fb", borderBottom:"1px solid #dde2ea", padding:"6px 14px", fontSize:10,
            fontWeight:700, color:"#7a8fa8", textTransform:"uppercase", letterSpacing:1, display:"flex", justifyContent:"space-between", zIndex:1 }}>
            <span>Event Feed</span><span style={{ fontFamily:"monospace" }}>{sortedEvents.length} events</span>
          </div>
          {sortedEvents.map(ev => {
            const col = EV_TYPES[ev._type];
            const isSel = ev.id === selectedEvt;
            const node = nodeMap[ev.nodeId];
            const srcMeta = ev.source ? AUTOMATION_SOURCES[ev.source] : null;
            return <div key={ev.id} onClick={() => selectFeedEvent(ev)}
              style={{ display:"flex", gap:8, padding:"7px 14px", borderBottom:"1px solid #eaecf0", cursor:"pointer",
                transition:"background 0.1s", background: isSel ? col.bg : "transparent" }}
              onMouseEnter={e => { if(!isSel) e.currentTarget.style.background="#f8f9fb"; }}
              onMouseLeave={e => { e.currentTarget.style.background = isSel ? col.bg : "transparent"; }}>
              <div style={{ width:3, borderRadius:2, flexShrink:0, minHeight:28, alignSelf:"stretch", background:col.fill }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                  <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, fontWeight:600,
                    background:col.bg, color:col.tc, border:`1px solid ${col.fill}40`, flexShrink:0 }}>
                    {col.lbl}
                  </span>
                  {srcMeta && <span style={{ fontSize:9, color:srcMeta.color, fontWeight:600 }}>{srcMeta.icon} {srcMeta.label}</span>}
                  <span style={{ fontFamily:"monospace", fontSize:9, color:"#7a8fa8", marginLeft:"auto", flexShrink:0 }}>{fmtDMH(ev._ts)}</span>
                </div>
                <div style={{ fontSize:11, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.message}</div>
                <div style={{ fontSize:10, color:"#7a8fa8", display:"flex", gap:6, marginTop:1 }}>
                  <span style={{ fontFamily:"monospace", fontWeight:600, color:T.primary }}>{ev.nodeId}</span>
                  {node && <span>{node.vendor} · {node.layer}</span>}
                  <span>{COUNTRY_META[ev.country]?.flag} {ev.country}</span>
                  {ev.changeId && <span style={{ fontFamily:"monospace", fontWeight:600, color:"#d97706" }}>{ev.changeId}</span>}
                </div>
              </div>
            </div>;
          })}
          {sortedEvents.length === 0 && <div style={{ textAlign:"center", padding:40, color:"#7a8fa8" }}>No events match filters</div>}
        </div>

        {/* Detail panel */}
        {selEvt && <div style={{ width:320, flexShrink:0, borderLeft:"1px solid #dde2ea", background:"#fff", overflowY:"auto", padding:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <span style={{ fontSize:13, fontWeight:700 }}>Event Detail</span>
            <button onClick={() => setSelectedEvt(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:14, color:"#7a8fa8" }}>✕</button>
          </div>

          <span style={{ display:"inline-block", padding:"2px 8px", borderRadius:4, fontSize:11, fontWeight:600,
            background:selCol.bg, color:selCol.tc, border:`1px solid ${selCol.fill}40`, marginBottom:10 }}>
            {selCol.lbl}
          </span>

          <div style={{ fontSize:13, fontWeight:600, marginBottom:8, lineHeight:1.4 }}>{selEvt.message}</div>
          <div style={{ fontSize:12, color:"#4b5563", lineHeight:1.6, marginBottom:14, background:"#f8f9fb",
            padding:10, borderRadius:6, border:"1px solid #eaecf0" }}>{selEvt.detail}</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, fontSize:11, marginBottom:14 }}>
            <div><span style={{ color:"#7a8fa8" }}>Time:</span> <b>{fmtDMH(selEvt._ts)}</b></div>
            <div><span style={{ color:"#7a8fa8" }}>Severity:</span> <b>{selEvt.severity}</b></div>
            <div><span style={{ color:"#7a8fa8" }}>Country:</span> <b>{COUNTRY_META[selEvt.country]?.flag} {COUNTRY_META[selEvt.country]?.name}</b></div>
            <div><span style={{ color:"#7a8fa8" }}>Type:</span> <b>{selEvt.type}</b></div>
            {selEvt.source && <div><span style={{ color:"#7a8fa8" }}>Source:</span> <b>{AUTOMATION_SOURCES[selEvt.source]?.label || selEvt.source}</b></div>}
            {selEvt.changeId && <div><span style={{ color:"#7a8fa8" }}>Change:</span> <b style={{ fontFamily:"monospace" }}>{selEvt.changeId}</b></div>}
          </div>

          {selNode && <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:10, marginBottom:10 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#7a8fa8", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>Device</div>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
              <span style={{ width:7, height:7, borderRadius:"50%", background:selNode.status==="UP"?"#22c55e":selNode.status==="DEGRADED"?"#f59e0b":"#ef4444" }}/>
              <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:12 }}>{selNode.id}</span>
            </div>
            <div style={{ fontSize:11, color:"#7a8fa8" }}>{selNode.vendor} {selNode.hwModel} · {selNode.layer}</div>
            <div style={{ fontSize:11, color:"#7a8fa8" }}>{selNode.hostname}</div>
          </div>}
        </div>}
      </div>
    </div>

    {/* ══ TOOLTIP ══ */}
    {tooltip && <Tooltip {...tooltip}/>}
  </div>;
}

/* ── Small components ────────────────────────────────────────────────── */
function Sel({ value, onChange, options }) {
  return <select value={value} onChange={e => onChange(e.target.value)}
    style={{ padding:"4px 8px", borderRadius:6, border:"1px solid #dde2ea", fontSize:11, fontWeight:500,
      background:"#f8f9fb", color:"#1a2535", cursor:"pointer", fontFamily:"inherit", maxWidth:180 }}>
    {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
  </select>;
}

function NB({ onClick, children }) {
  return <button onClick={onClick} style={{ fontSize:11, padding:"3px 8px", borderRadius:4, border:"1px solid #dde2ea",
    background:"#f0f2f5", cursor:"pointer", color:"#1a2535", fontFamily:"inherit" }}>{children}</button>;
}

function Tooltip({ ev, col, node, x, y }) {
  const srcMeta = ev.source ? AUTOMATION_SOURCES[ev.source] : null;
  return <div style={{
    position:"fixed", zIndex:9999, pointerEvents:"none",
    left: x + 270 > window.innerWidth ? x - 280 : x, top: y,
    background:"#fffffff5", border:"1px solid #c8d0da", borderRadius:7,
    padding:"10px 13px", fontSize:11, lineHeight:1.7, minWidth:200, maxWidth:260,
    boxShadow:"0 4px 20px rgba(0,0,0,0.12)"
  }}>
    <div style={{ fontSize:12, fontWeight:600, marginBottom:3 }}>{ev.message}</div>
    <span style={{ display:"inline-block", padding:"1px 6px", borderRadius:3, fontSize:10, fontWeight:600, marginBottom:3,
      background:col.bg, color:col.tc, border:`1px solid ${col.fill}40` }}>{col.lbl}</span><br/>
    <span style={{ color:"#7a8fa8" }}>Time: {fmtDMH(ev._ts)}</span><br/>
    <span style={{ color:"#7a8fa8" }}>Node: <b>{ev.nodeId}</b></span><br/>
    {node && <><span style={{ color:"#7a8fa8" }}>{node.vendor} · {node.layer}</span><br/></>}
    {srcMeta && <><span style={{ color:"#7a8fa8" }}>Source: {srcMeta.icon} {srcMeta.label}</span><br/></>}
    <span style={{ color:"#7a8fa8" }}>Severity: {ev.severity}</span><br/>
    {ev.changeId && <><span style={{ color:"#d97706" }}>Change: {ev.changeId}</span><br/></>}
    <span style={{ color:"#7a8fa8", fontSize:10 }}>{ev.detail?.slice(0, 100)}{(ev.detail?.length||0)>100?"…":""}</span>
  </div>;
}

/* ── Canvas helpers ──────────────────────────────────────────────────── */
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r); ctx.closePath();
}
