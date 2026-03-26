import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { T } from "../data/constants.js";
import { EVENTS, ALARMS, AUTOMATION_SOURCES, COUNTRY_META } from "../data/inventory/index.js";
import { useNodes } from "../context/NodesContext.jsx";
import { LAYER_COLORS } from "../data/inventory/sites.js";

/* ═══════════════════════════════════════════════════════════════════════════
   Canvas-based Element Event Dashboard — inspired by PE-MAD-01 format.
   Swimlane rows · Correlation chains · Time axis · Zoom/Pan · Right panel
   ═══════════════════════════════════════════════════════════════════════════ */

const DPR = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;

/* ─── Row colour palette ─────────────────────────────────────────────────── */
const RC = {
  "auto-camunda":  { fill:"#2563eb", stroke:"#4f8af7", bg:"#dbeafe", tc:"#1e3a8a", lbl:"Camunda",          shp:"bar" },
  "auto-sdn":      { fill:"#7c3aed", stroke:"#9d5cf5", bg:"#ede9fe", tc:"#3b0764", lbl:"SDN Controller",   shp:"bar" },
  "auto-ansible":  { fill:"#dc2626", stroke:"#ef4444", bg:"#fee2e2", tc:"#7f1d1d", lbl:"Ansible/Terraform", shp:"bar" },
  "auto-hco-tdo":  { fill:"#b45309", stroke:"#d97706", bg:"#fef3c7", tc:"#78350f", lbl:"HCO / TDO",        shp:"bar" },
  "auto-script":   { fill:"#64748b", stroke:"#94a3b8", bg:"#f1f5f9", tc:"#1e293b", lbl:"Script",           shp:"bar" },
  "alarm-crit":    { fill:"#dc2626", stroke:"#ef4444", bg:"#fee2e2", tc:"#7f1d1d", lbl:"Critical",         shp:"circle" },
  "alarm-warn":    { fill:"#d97706", stroke:"#f59e0b", bg:"#fef3c7", tc:"#78350f", lbl:"Warning / Major",  shp:"circle" },
  "bgp":           { fill:"#a21caf", stroke:"#c026d3", bg:"#fae8ff", tc:"#701a75", lbl:"BGP",              shp:"tri" },
  "interface":     { fill:"#2563eb", stroke:"#3b82f6", bg:"#dbeafe", tc:"#1e3a8a", lbl:"Interface",        shp:"circle" },
  "traffic":       { fill:"#ea580c", stroke:"#f97316", bg:"#ffedd5", tc:"#7c2d12", lbl:"Traffic",          shp:"diamond" },
  "config":        { fill:"#0d9488", stroke:"#14b8a6", bg:"#ccfbf1", tc:"#134e4a", lbl:"Config commits",   shp:"bar" },
  "security":      { fill:"#be185d", stroke:"#ec4899", bg:"#fce7f3", tc:"#831843", lbl:"Security",         shp:"diamond" },
  "system":        { fill:"#64748b", stroke:"#94a3b8", bg:"#f1f5f9", tc:"#1e293b", lbl:"System",           shp:"circle" },
};

/* ─── Groups ─────────────────────────────────────────────────────────────── */
const GRP = [
  { lbl:"Automations", col:"#7c3aed", rows:[
    {k:"auto-camunda",l:"Camunda"},{k:"auto-sdn",l:"SDN Controller"},
    {k:"auto-ansible",l:"Ansible / Terraform"},{k:"auto-hco-tdo",l:"HCO / TDO"},{k:"auto-script",l:"Script"}]},
  { lbl:"Alarms", col:"#dc2626", rows:[{k:"alarm-crit",l:"Critical"},{k:"alarm-warn",l:"Warning / Major"}]},
  { lbl:"Network", col:"#2563eb", rows:[{k:"bgp",l:"BGP events"},{k:"interface",l:"Interface"},{k:"traffic",l:"Traffic"}]},
  { lbl:"Operations", col:"#0d9488", rows:[{k:"config",l:"Config"},{k:"security",l:"Security"},{k:"system",l:"System"}]},
];
const ALL_ROWS = GRP.flatMap(g => g.rows);
const RH = 38, GHH = 22;

/* ─── Map event to row key ───────────────────────────────────────────────── */
function eventRow(ev) {
  if (ev.type === "AUTOMATION") {
    const s = ev.source || "manual";
    if (s === "camunda") return "auto-camunda";
    if (s === "sdn-controller") return "auto-sdn";
    if (s === "ansible" || s === "terraform") return "auto-ansible";
    if (s === "hco" || s === "tdo") return "auto-hco-tdo";
    return "auto-script";
  }
  if (ev.type === "ALARM") return ev.severity === "critical" ? "alarm-crit" : "alarm-warn";
  if (ev.severity === "critical" && ev.type !== "CONFIG") return "alarm-crit";
  if (ev.type === "BGP") return "bgp";
  if (ev.type === "INTERFACE") return "interface";
  if (ev.type === "TRAFFIC") return "traffic";
  if (ev.type === "CONFIG") return "config";
  if (ev.type === "SECURITY") return "security";
  return "system";
}

/* ─── Build row Y positions ──────────────────────────────────────────────── */
function rowYMap() {
  const m = {};
  let y = 0;
  for (const g of GRP) { y += GHH; for (const r of g.rows) { m[r.k] = y; y += RH; } }
  return m;
}
function totalH() { let h = 0; for (const g of GRP) { h += GHH; h += g.rows.length * RH; } return h; }

/* ─── Time helpers ───────────────────────────────────────────────────────── */
const p2 = n => String(n).padStart(2, "0");
function fmtHM(ts) { const d = new Date(ts); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; }
function fmtDMH(ts) { const d = new Date(ts); return `${d.toLocaleDateString("en-US",{month:"short",day:"numeric"})} ${fmtHM(ts)}`; }
function fmtDur(ms) { const m = Math.round(ms/60000); return m >= 60 ? `${Math.floor(m/60)}h ${m%60}m` : `${m}m`; }

/* ─── Build correlations from changeId ───────────────────────────────────── */
function buildCorrelations(events) {
  const groups = {};
  for (const ev of events) {
    if (ev.changeId) {
      if (!groups[ev.changeId]) groups[ev.changeId] = [];
      groups[ev.changeId].push(ev);
    }
  }
  return Object.entries(groups)
    .filter(([,evs]) => evs.length >= 2)
    .map(([changeId, evs]) => {
      const sorted = evs.sort((a, b) => new Date(a.ts) - new Date(b.ts));
      const sevOrder = { critical:0, error:1, warning:2, info:3 };
      const maxSev = sorted.reduce((m, e) => (sevOrder[e.severity]||3) < (sevOrder[m]||3) ? e.severity : m, "info");
      const autoEvt = sorted.find(e => e.type === "AUTOMATION");
      const src = autoEvt?.source || "manual";
      const dur = new Date(sorted[sorted.length-1].ts) - new Date(sorted[0].ts);
      // Build summary
      const types = [...new Set(sorted.map(e => e.type))];
      const sum = `${sorted.length} events · ${fmtDur(dur)} · ${types.join(" → ")}`;
      return { changeId, events: sorted, maxSev, src, dur, sum, evIds: new Set(sorted.map(e=>e.id)) };
    })
    .sort((a, b) => new Date(b.events[0].ts) - new Date(a.events[0].ts));
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function EventsView() {
  const { nodes: NODES } = useNodes();
  const canvasRef = useRef(null);
  const axisRef = useRef(null);
  const paneRef = useRef(null);
  const [winH, setWinH] = useState(12); // hours visible
  const [winS, setWinS] = useState(() => Date.now() - 6*3600000); // window start ms
  const [hidden, setHidden] = useState(new Set());
  const [hlSet, setHlSet] = useState(new Set());
  const [activeCorr, setActiveCorr] = useState(null);
  const [corrOn, setCorrOn] = useState(true);
  const [country, setCountry] = useState("ALL");
  const [tooltip, setTooltip] = useState(null);
  const dragRef = useRef(null);
  const evDataRef = useRef([]); // cached event bbox data for hit testing

  const nodeMap = useMemo(() => Object.fromEntries(NODES.map(n => [n.id, n])), [NODES]);

  /* ── Filtered events, each assigned a row key ── */
  const mappedEvents = useMemo(() => {
    let evs = EVENTS.map(ev => ({ ...ev, _row: eventRow(ev), _ts: new Date(ev.ts).getTime() }));
    if (country !== "ALL") evs = evs.filter(e => e.country === country);
    return evs;
  }, [country]);

  const correlations = useMemo(() => buildCorrelations(mappedEvents), [mappedEvents]);
  const corrAllIds = useMemo(() => new Set(correlations.flatMap(c => [...c.evIds])), [correlations]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    total: mappedEvents.length,
    alarms: mappedEvents.filter(e => e._row === "alarm-crit" || e._row === "alarm-warn").length,
    auto: mappedEvents.filter(e => e._row.startsWith("auto-")).length,
    bgp: mappedEvents.filter(e => e._row === "bgp").length,
    corr: correlations.length,
  }), [mappedEvents, correlations]);

  const winE = winS + winH * 3600000;
  const pW = useCallback(() => paneRef.current?.clientWidth || 800, []);
  const tX = useCallback((t) => ((t - winS) / (winH * 3600000)) * pW(), [winS, winH, pW]);

  /* ── Draw canvas ──────────────────────────────────────────────────────── */
  const drawAll = useCallback(() => {
    const cv = canvasRef.current;
    const axCv = axisRef.current;
    const pane = paneRef.current;
    if (!cv || !pane) return;
    const W = pane.clientWidth;
    const H = totalH();
    const rY = rowYMap();

    // Main canvas
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    const ctx = cv.getContext("2d"); ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, W, H);

    const evBBox = [];

    // Draw groups + rows + events
    let absY = 0;
    for (const g of GRP) {
      // Group header
      ctx.fillStyle = "#eef1f6"; ctx.fillRect(0, absY, W, GHH);
      ctx.strokeStyle = "#dde2ea"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, absY + GHH); ctx.lineTo(W, absY + GHH); ctx.stroke();
      ctx.font = "600 9px 'Inter',system-ui,sans-serif"; ctx.fillStyle = "#8090a8"; ctx.textAlign = "left";
      ctx.fillText(g.lbl.toUpperCase(), 8, absY + GHH * 0.68);
      absY += GHH;

      // Hour grid lines
      ctx.strokeStyle = "rgba(0,0,0,0.05)"; ctx.lineWidth = 0.5; ctx.setLineDash([3, 4]);
      for (let h = 0; h <= 168; h += 0.5) {
        const t = winS + h * 3600000;
        if (t < winS || t > winE) continue;
        const x = tX(t);
        if (x < -2 || x > W + 2) continue;
        // Only draw full-hour lines
        if (new Date(t).getMinutes() === 0) {
          ctx.beginPath(); ctx.moveTo(x, absY); ctx.lineTo(x, absY + g.rows.length * RH); ctx.stroke();
        }
      }
      ctx.setLineDash([]);

      for (let ri = 0; ri < g.rows.length; ri++) {
        const row = g.rows[ri];
        const rowTop = absY;
        const cy = absY + RH / 2;

        // Row bg
        ctx.fillStyle = ri % 2 === 0 ? "#ffffff" : "#fafbfe"; ctx.fillRect(0, absY, W, RH);
        ctx.strokeStyle = "#eaecf0"; ctx.lineWidth = 0.5;
        ctx.beginPath(); ctx.moveTo(0, absY + RH); ctx.lineTo(W, absY + RH); ctx.stroke();

        if (!hidden.has(row.k)) {
          const col = RC[row.k];
          const evs = mappedEvents.filter(e => e._row === row.k && e._ts >= winS - 3600000 && e._ts <= winE + 3600000);

          for (const ev of evs) {
            const isCorr = corrOn && corrAllIds.has(ev.id);
            const isHL = hlSet.size > 0 && hlSet.has(ev.id);
            const grey = hlSet.size > 0 && !hlSet.has(ev.id);
            const x1 = tX(ev._ts);

            ctx.globalAlpha = grey ? 0.18 : 1;

            // Duration events (automation workflows) — draw as bars
            if (ev.type === "AUTOMATION" || ev.type === "CONFIG") {
              // Duration bar — estimate ~3min duration for display
              const dur = 180000; // 3 min
              const x2 = tX(ev._ts + dur);
              const bw = Math.max(6, x2 - x1);
              const bh = RH * 0.48;

              ctx.fillStyle = isHL ? col.fill + "cc" : col.bg;
              rrect(ctx, x1, cy - bh/2, bw, bh, 3); ctx.fill();
              ctx.strokeStyle = isHL ? col.fill : col.stroke + "99"; ctx.lineWidth = isHL ? 2 : 1.2;
              rrect(ctx, x1, cy - bh/2, bw, bh, 3); ctx.stroke();

              if (isCorr && !grey) {
                ctx.strokeStyle = "#c07010bb"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
                rrect(ctx, x1 - 2, cy - bh/2 - 2, bw + 4, bh + 4, 4); ctx.stroke(); ctx.setLineDash([]);
              }

              if (bw > 60) {
                ctx.font = "10px system-ui,sans-serif"; ctx.textAlign = "left"; ctx.fillStyle = col.tc;
                const lb = ev.message.length > 28 ? ev.message.slice(0, 28) + "…" : ev.message;
                ctx.fillText(lb, x1 + 5, cy + 3.5);
              }

              evBBox.push({ ev, x1, x2: x1 + bw, yt: rowTop, yb: rowTop + RH, cy });
            } else {
              // Point events — draw as markers
              const mr = 7;
              drawMarker(ctx, col, row.k, x1, cy, mr, isHL);

              if (isCorr && !grey) {
                ctx.strokeStyle = "#c07010aa"; ctx.lineWidth = 1.2; ctx.setLineDash([3, 2]);
                ctx.beginPath(); ctx.arc(x1, cy, mr + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
              }

              // Vertical whiskers
              ctx.strokeStyle = col.fill + "33"; ctx.lineWidth = 0.5; ctx.setLineDash([3, 3]);
              ctx.beginPath(); ctx.moveTo(x1, rowTop); ctx.lineTo(x1, cy - mr - 2); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(x1, cy + mr + 2); ctx.lineTo(x1, rowTop + RH); ctx.stroke();
              ctx.setLineDash([]);

              evBBox.push({ ev, x1, x2: x1, yt: rowTop, yb: rowTop + RH, cy });
            }

            ctx.globalAlpha = 1;
          }
        }
        absY += RH;
      }
    }

    // "Now" line
    const nowX = tX(Date.now());
    if (nowX > 0 && nowX < W) {
      ctx.strokeStyle = "#dc2626"; ctx.lineWidth = 1.2; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(nowX, 0); ctx.lineTo(nowX, totalH()); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#dc2626"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center";
      ctx.fillText("NOW", nowX, 10);
    }

    evDataRef.current = evBBox;

    // Axis canvas
    if (axCv) {
      const axW = pane.clientWidth;
      const axH = 26;
      axCv.width = Math.round(axW * DPR); axCv.height = Math.round(axH * DPR);
      axCv.style.width = axW + "px"; axCv.style.height = axH + "px";
      const ac = axCv.getContext("2d"); ac.scale(DPR, DPR); ac.clearRect(0, 0, axW, axH);
      const step = winH <= 2 ? 0.5 : winH <= 6 ? 1 : winH <= 12 ? 2 : 4;
      ac.font = "10px system-ui,sans-serif"; ac.textAlign = "center";
      // Draw hour ticks
      const startHour = Math.floor((winS - Date.now() + 168*3600000) / 3600000) * 3600000 + Date.now() - 168*3600000;
      for (let t = winS - 3600000; t <= winE + 3600000; t += step * 3600000) {
        const snapT = Math.round(t / (step*3600000)) * step * 3600000;
        const x = tX(snapT);
        if (x < -20 || x > axW + 20) continue;
        ac.strokeStyle = "#c8d0da"; ac.lineWidth = 0.5;
        ac.beginPath(); ac.moveTo(x, 0); ac.lineTo(x, 7); ac.stroke();
        ac.fillStyle = "#7a8fa8";
        const d = new Date(snapT);
        ac.fillText(fmtHM(snapT), x, 18);
      }
    }
  }, [winS, winH, winE, tX, pW, mappedEvents, hidden, hlSet, corrOn, corrAllIds]);

  /* ── Redraw on state change ── */
  useEffect(() => { drawAll(); }, [drawAll]);
  useEffect(() => { const r = () => drawAll(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, [drawAll]);

  /* ── Mouse: hover/click/drag ── */
  const hitTest = useCallback((mx, my) => {
    for (const bb of evDataRef.current) {
      if (my < bb.yt || my > bb.yb) continue;
      if (bb.x1 === bb.x2) { if (Math.abs(mx - bb.x1) <= 11) return bb.ev; }
      else { if (mx >= bb.x1 && mx <= Math.max(bb.x1 + 6, bb.x2)) return bb.ev; }
    }
    return null;
  }, []);

  const handleCanvasMove = useCallback((e) => {
    if (dragRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const ev = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (ev) {
      const col = RC[ev._row];
      setTooltip({
        x: e.clientX + 14, y: e.clientY - 10,
        title: ev.message,
        row: ev._row, col,
        time: fmtDMH(ev._ts),
        source: AUTOMATION_SOURCES[ev.source]?.label || ev.source || "—",
        node: ev.nodeId,
        severity: ev.severity,
        detail: ev.detail,
        changeId: ev.changeId,
        corrChain: correlations.find(c => c.evIds.has(ev.id)),
      });
    } else {
      setTooltip(null);
    }
  }, [hitTest, correlations]);

  const handleCanvasClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const ev = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (!ev) { setHlSet(new Set()); setActiveCorr(null); return; }
    const chain = correlations.find(c => c.evIds.has(ev.id));
    if (chain) { setHlSet(new Set(chain.evIds)); setActiveCorr(chain.changeId); }
    else { setHlSet(new Set([ev.id])); setActiveCorr(null); }
  }, [hitTest, correlations]);

  const handleMouseDown = useCallback((e) => {
    dragRef.current = { startX: e.clientX, startWinS: winS };
  }, [winS]);

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragRef.current) return;
      const mspp = (winH * 3600000) / pW();
      const newWinS = dragRef.current.startWinS - (e.clientX - dragRef.current.startX) * mspp;
      setWinS(newWinS);
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

  /* ── Zoom buttons ── */
  const ZOOMS = [1, 2, 4, 6, 12, 24, 48];
  const pan = useCallback((h) => setWinS(s => s + h * 3600000), []);

  /* ── Nav label ── */
  const navLabel = useMemo(() => {
    const s = new Date(winS); const e = new Date(winE);
    return `${s.toLocaleDateString("en-US",{month:"short",day:"numeric"})} ${fmtHM(winS)} → ${fmtHM(winE)} (${winH}h)`;
  }, [winS, winE, winH]);

  /* ── Select correlation from right panel ── */
  const selectCorr = useCallback((c) => {
    setActiveCorr(c.changeId); setHlSet(new Set(c.evIds));
    // Pan to first event
    const first = c.events[0]._ts;
    setWinS(first - 0.2 * winH * 3600000);
  }, [winH]);

  const selectFeedEvent = useCallback((ev) => {
    const chain = correlations.find(c => c.evIds.has(ev.id));
    if (chain) { setHlSet(new Set(chain.evIds)); setActiveCorr(chain.changeId); }
    else { setHlSet(new Set([ev.id])); setActiveCorr(null); }
    setWinS(ev._ts - 0.25 * winH * 3600000);
  }, [correlations, winH]);

  const toggleLeg = useCallback((k) => setHidden(h => {
    const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n;
  }), []);

  /* ── Visible events sorted by time ── */
  const sortedEvents = useMemo(() => [...mappedEvents].sort((a, b) => b._ts - a._ts), [mappedEvents]);

  return <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", fontFamily:"'Inter',system-ui,sans-serif", background:"#f4f6f9", color:"#1a2535", fontSize:13 }}>
    {/* ══ TOP BAR ══ */}
    <div style={{ display:"flex", alignItems:"center", background:"#fff", borderBottom:"1px solid #dde2ea", flexShrink:0, height:50, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ padding:"0 16px", borderRight:"1px solid #dde2ea", height:"100%", display:"flex", flexDirection:"column", justifyContent:"center", gap:1, minWidth:160 }}>
        <div style={{ fontFamily:"monospace", fontSize:14, fontWeight:700, letterSpacing:0.5 }}>Event Dashboard</div>
        <div style={{ fontSize:10, color:"#7a8fa8" }}>Network Operations · {country === "ALL" ? "All Networks" : COUNTRY_META[country]?.name}</div>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 12px", borderRight:"1px solid #dde2ea", height:"100%" }}>
        <span style={{ width:8, height:8, borderRadius:"50%", background:"#1a9940", animation:"pulse 2s infinite" }}/>
        <span style={{ fontSize:11, color:"#1a9940", fontWeight:600 }}>OPERATIONAL</span>
      </div>
      {/* KPIs */}
      {[
        { v:stats.alarms, l:"Alarms", c:"#dc2626" },
        { v:stats.auto, l:"Automations", c:"#7c3aed" },
        { v:stats.bgp, l:"BGP", c:"#a21caf" },
        { v:stats.corr, l:"Correlations", c:"#d97706" },
        { v:stats.total, l:"Total", c:"#1a2535" },
      ].map(k => <div key={k.l} style={{ display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:"0 14px", borderRight:"1px solid #dde2ea", height:"100%", gap:1, minWidth:68 }}>
        <div style={{ fontFamily:"monospace", fontSize:17, fontWeight:700, lineHeight:1, color:k.c }}>{k.v}</div>
        <div style={{ fontSize:8, textTransform:"uppercase", letterSpacing:1, color:"#7a8fa8" }}>{k.l}</div>
      </div>)}
      <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8, padding:"0 14px" }}>
        <select value={country} onChange={e => setCountry(e.target.value)}
          style={{ padding:"4px 8px", borderRadius:6, border:"1px solid #dde2ea", fontSize:11, fontWeight:600, background:"#f0f2f5", color:"#1a2535", cursor:"pointer" }}>
          <option value="ALL">🌐 All</option><option value="FJ">🇫🇯 Fiji</option><option value="HW">🌺 Hawaii</option><option value="IB">🏝 Ibiza</option>
        </select>
        <button onClick={() => { setCorrOn(p=>!p); if(corrOn){setHlSet(new Set());setActiveCorr(null);} }}
          style={{ fontSize:11, padding:"4px 12px", borderRadius:12, cursor:"pointer", border:`1px solid ${corrOn?"#d97706":"#c8d0da"}`,
            background:corrOn?"#fff8e0":"#f0f2f5", color:corrOn?"#d97706":"#7a8fa8", fontWeight:600, transition:"all 0.15s" }}>
          ⚡ Correlation {corrOn?"":"off"}
        </button>
      </div>
    </div>

    {/* ══ MAIN LAYOUT: Timeline + Right Panel ══ */}
    <div style={{ display:"grid", gridTemplateColumns:"1fr 290px", flex:1, overflow:"hidden", minHeight:0 }}>

      {/* ── TIMELINE COLUMN ── */}
      <div style={{ display:"flex", flexDirection:"column", overflow:"hidden", borderRight:"1px solid #dde2ea", background:"#fff" }}>
        {/* Legend bar */}
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderBottom:"1px solid #dde2ea", flexShrink:0, flexWrap:"wrap", background:"#f0f2f5" }}>
          <span style={{ fontSize:9, letterSpacing:1.5, textTransform:"uppercase", color:"#b0bfcc", marginRight:2 }}>View:</span>
          {ALL_ROWS.map(r => {
            const col = RC[r.k];
            return <span key={r.k} onClick={() => toggleLeg(r.k)}
              style={{ display:"inline-flex", alignItems:"center", gap:4, fontSize:10, color:"#7a8fa8", cursor:"pointer",
                padding:"2px 7px", borderRadius:10, border:"1px solid transparent", userSelect:"none", transition:"all 0.12s",
                opacity: hidden.has(r.k) ? 0.3 : 1 }}>
              <span style={{ width:9, height:9, borderRadius: col.shp==="circle"?"50%": col.shp==="diamond"?"1px":"2px",
                background:col.fill, transform: col.shp==="diamond"?"rotate(45deg)":"none", flexShrink:0 }}/>
              {col.lbl}
            </span>;
          })}
        </div>

        {/* Navigation bar */}
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderBottom:"1px solid #dde2ea", flexShrink:0, background:"#fff" }}>
          <NB onClick={() => pan(-3)}>◀◀</NB>
          <NB onClick={() => pan(-1)}>◀</NB>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#7a8fa8", flex:1, textAlign:"center" }}>{navLabel}</div>
          <NB onClick={() => pan(1)}>▶</NB>
          <NB onClick={() => pan(3)}>▶▶</NB>
          <div style={{ width:1, height:16, background:"#dde2ea", margin:"0 2px" }}/>
          <div style={{ display:"flex", gap:3 }}>
            {ZOOMS.map(z => <button key={z} onClick={() => setWinH(z)}
              style={{ fontSize:10, padding:"2px 8px", borderRadius:5, border:`1px solid ${winH===z?"#0077cc":"#dde2ea"}`,
                background:winH===z?"#0077cc":"#f0f2f5", color:winH===z?"#fff":"#7a8fa8", cursor:"pointer" }}>
              {z}h
            </button>)}
          </div>
          <NB onClick={() => { setWinH(12); setWinS(Date.now() - 6*3600000); }}>⌂</NB>
        </div>

        {/* Timeline viewport */}
        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", minHeight:0 }}>
          <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>
            {/* Label column */}
            <div style={{ width:140, flexShrink:0, background:"#fff", borderRight:"1px solid #dde2ea", overflow:"hidden", display:"flex", flexDirection:"column" }}>
              {GRP.map(g => <div key={g.lbl}>
                <div style={{ display:"flex", alignItems:"center", gap:5, padding:"0 10px", background:"#eef1f6",
                  borderBottom:"1px solid #dde2ea", height:GHH, fontSize:9, textTransform:"uppercase", letterSpacing:1.5, color:"#8090a8" }}>
                  <span style={{ width:5, height:5, borderRadius:"50%", background:g.col, flexShrink:0 }}/>
                  {g.lbl}
                </div>
                {g.rows.map(r => <div key={r.k} style={{ height:RH, display:"flex", alignItems:"center", padding:"0 10px 0 12px",
                  borderBottom:"1px solid #eaecf0", fontSize:11, color:"#7a8fa8", gap:5 }}>
                  <span style={{ width:3, height:18, borderRadius:2, background:RC[r.k].fill+"66", flexShrink:0 }}/>
                  <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{r.l}</span>
                </div>)}
              </div>)}
            </div>

            {/* Canvas pane */}
            <div ref={paneRef} style={{ flex:1, overflow:"hidden", position:"relative", cursor:dragRef.current?"grabbing":"grab" }}
              onMouseDown={handleMouseDown}>
              <canvas ref={canvasRef} style={{ display:"block" }}
                onMouseMove={handleCanvasMove} onMouseLeave={() => setTooltip(null)}
                onClick={handleCanvasClick}/>
            </div>
          </div>

          {/* Axis strip */}
          <div style={{ flexShrink:0, height:26, background:"#f0f2f5", borderTop:"1px solid #dde2ea", display:"flex" }}>
            <div style={{ width:140, flexShrink:0, borderRight:"1px solid #dde2ea" }}/>
            <div style={{ flex:1, overflow:"hidden", position:"relative" }}>
              <canvas ref={axisRef} style={{ display:"block" }}/>
            </div>
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div style={{ display:"flex", flexDirection:"column", overflow:"hidden", background:"#fff" }}>
        {/* Correlation chains */}
        <div style={{ padding:"8px 12px 6px", borderBottom:"1px solid #dde2ea", flexShrink:0 }}>
          <div style={{ fontSize:10, letterSpacing:1.5, textTransform:"uppercase", color:"#7a8fa8", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span>Correlation chains</span>
            <span style={{ fontFamily:"monospace", fontSize:12, color:"#d97706" }}>{correlations.length}</span>
          </div>
        </div>
        <div style={{ padding:"8px 10px", display:"flex", flexDirection:"column", gap:5, borderBottom:"1px solid #dde2ea", flexShrink:0, maxHeight:250, overflowY:"auto" }}>
          {!corrOn && <div style={{ fontSize:11, color:"#7a8fa8", padding:"4px 0" }}>Correlation disabled</div>}
          {corrOn && correlations.map(c => {
            const isA = c.changeId === activeCorr;
            const srcMeta = AUTOMATION_SOURCES[c.src];
            return <div key={c.changeId} onClick={() => selectCorr(c)}
              style={{ border:`1px solid ${isA?"#d97706":"#dde2ea"}`, borderRadius:6, padding:"8px 10px", cursor:"pointer",
                transition:"all 0.12s", background:isA?"#fffbf0":"#fff" }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:6, marginBottom:3 }}>
                <div style={{ fontSize:11, fontWeight:600, flex:1, lineHeight:1.3 }}>
                  {srcMeta?.icon} {srcMeta?.label || c.src} → {c.events.length} events
                </div>
                <div style={{ fontSize:10, padding:"1px 6px", borderRadius:8, background:"#fff8e0", color:"#a06000", border:"1px solid #e0c060", fontFamily:"monospace", flexShrink:0 }}>
                  {c.changeId}
                </div>
              </div>
              <div style={{ fontSize:10, color:"#7a8fa8", lineHeight:1.5 }}>{c.sum}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:3, marginTop:4 }}>
                {c.events.slice(0, 4).map(ev => {
                  const col = RC[ev._row];
                  return <span key={ev.id} style={{ fontSize:9, padding:"1px 5px", borderRadius:3, background:col.bg, color:col.tc, border:`1px solid ${col.fill}55` }}>
                    {ev.message.slice(0, 22)}{ev.message.length > 22 ? "…" : ""}
                  </span>;
                })}
                {c.events.length > 4 && <span style={{ fontSize:9, color:"#7a8fa8" }}>+{c.events.length - 4} more</span>}
              </div>
            </div>;
          })}
        </div>

        {/* Event feed */}
        <div style={{ padding:"8px 12px 6px", borderBottom:"1px solid #dde2ea", flexShrink:0 }}>
          <div style={{ fontSize:10, letterSpacing:1.5, textTransform:"uppercase", color:"#7a8fa8", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span>Event feed</span>
            <span style={{ fontFamily:"monospace", fontSize:12 }}>{sortedEvents.length} events</span>
          </div>
        </div>
        <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>
          {sortedEvents.map(ev => {
            const col = RC[ev._row];
            const isHL = hlSet.size === 0 || hlSet.has(ev.id);
            const chain = correlations.find(c => c.evIds.has(ev.id));
            return <div key={ev.id} onClick={() => selectFeedEvent(ev)}
              style={{ display:"flex", gap:8, padding:"7px 12px", borderBottom:"1px solid #eaecf0", cursor:"pointer",
                transition:"background 0.1s", background:isHL && hlSet.size > 0 ? "#fffce8" : "transparent" }}
              onMouseEnter={e => { if(!(isHL && hlSet.size>0)) e.currentTarget.style.background="#f0f2f5"; }}
              onMouseLeave={e => { e.currentTarget.style.background = isHL && hlSet.size > 0 ? "#fffce8" : "transparent"; }}>
              <div style={{ width:3, borderRadius:2, flexShrink:0, minHeight:28, alignSelf:"stretch", background:col.fill }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                  <span style={{ fontSize:9, padding:"1px 6px", borderRadius:3, fontWeight:600, textTransform:"uppercase",
                    background:col.bg, color:col.tc, border:`1px solid ${col.fill}55`, flexShrink:0 }}>
                    {ev._row.replace(/-/g," ")}
                  </span>
                  <span style={{ fontFamily:"monospace", fontSize:9, color:"#7a8fa8", marginLeft:"auto", flexShrink:0 }}>{fmtDMH(ev._ts)}</span>
                </div>
                <div style={{ fontSize:11, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.message}</div>
                <div style={{ fontSize:10, color:"#7a8fa8", lineHeight:1.4, marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {ev.nodeId} · {ev.detail?.slice(0, 60)}{(ev.detail?.length||0) > 60 ? "…" : ""}
                </div>
                {corrOn && chain && <div style={{ fontSize:9, color:"#c07010", marginTop:2 }}>⚡ {chain.changeId} · {chain.events.length} events</div>}
              </div>
            </div>;
          })}
        </div>
      </div>
    </div>

    {/* ══ TOOLTIP ══ */}
    {tooltip && <div style={{
      position:"fixed", zIndex:9999, pointerEvents:"none",
      left: tooltip.x + 275 > window.innerWidth ? tooltip.x - 285 : tooltip.x,
      top: tooltip.y, background:"#fffffff2", border:"1px solid #c8d0da", borderRadius:7,
      padding:"10px 13px", fontSize:11, lineHeight:1.7, minWidth:200, maxWidth:270,
      boxShadow:"0 4px 20px rgba(0,0,0,0.15)"
    }}>
      <div style={{ fontSize:12, fontWeight:600, marginBottom:3 }}>{tooltip.title}</div>
      <span style={{ display:"inline-block", padding:"1px 7px", borderRadius:3, fontSize:10, marginBottom:3, fontWeight:600,
        background:tooltip.col?.bg, color:tooltip.col?.tc, border:`1px solid ${tooltip.col?.fill}55` }}>
        {tooltip.row?.replace(/-/g," ")}
      </span><br/>
      <span style={{ color:"#7a8fa8" }}>Time: {tooltip.time}</span><br/>
      <span style={{ color:"#7a8fa8" }}>Node: {tooltip.node}</span><br/>
      <span style={{ color:"#7a8fa8" }}>Source: {tooltip.source}</span><br/>
      <span style={{ color:"#7a8fa8" }}>Severity: {tooltip.severity}</span><br/>
      {tooltip.changeId && <span style={{ color:"#7a8fa8" }}>Change: {tooltip.changeId}</span>}
      {tooltip.changeId && <br/>}
      {tooltip.corrChain && <div style={{ color:"#c07010", fontSize:10, marginTop:3 }}>
        ⚡ {tooltip.corrChain.changeId} · {tooltip.corrChain.events.length} events
      </div>}
      <span style={{ color:"#7a8fa8" }}>{tooltip.detail?.slice(0, 120)}{(tooltip.detail?.length||0)>120?"…":""}</span>
    </div>}

    <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
  </div>;
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function NB({ onClick, children }) {
  return <button onClick={onClick} style={{ fontSize:12, padding:"3px 10px", borderRadius:5, border:"1px solid #dde2ea",
    background:"#f0f2f5", cursor:"pointer", color:"#1a2535", transition:"all 0.12s" }}>{children}</button>;
}

function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y); ctx.arcTo(x+w, y, x+w, y+r, r);
  ctx.lineTo(x+w, y+h-r); ctx.arcTo(x+w, y+h, x+w-r, y+h, r);
  ctx.lineTo(x+r, y+h); ctx.arcTo(x, y+h, x, y+h-r, r);
  ctx.lineTo(x, y+r); ctx.arcTo(x, y, x+r, y, r); ctx.closePath();
}

function drawMarker(ctx, col, key, x, y, r, hl) {
  ctx.setLineDash([]);
  if (key === "bgp") {
    ctx.beginPath(); ctx.moveTo(x, y-r); ctx.lineTo(x+r*0.9, y+r*0.8); ctx.lineTo(x-r*0.9, y+r*0.8); ctx.closePath();
  } else if (key === "traffic" || key === "security") {
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI/4);
    const s = r*0.7; ctx.beginPath(); ctx.rect(-s, -s, s*2, s*2); ctx.restore();
  } else {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2);
  }
  ctx.fillStyle = hl ? col.fill+"dd" : col.bg;
  ctx.strokeStyle = col.stroke; ctx.lineWidth = hl ? 2.2 : 1.5;
  ctx.fill(); ctx.stroke();
}
