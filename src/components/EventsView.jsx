import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { T } from "../data/constants.js";
import { EVENTS, ALARMS, AUTOMATION_SOURCES, COUNTRY_META, SITES, SERVICES } from "../data/inventory/index.js";
import { useNodes } from "../context/NodesContext.jsx";
import { LAYER_COLORS } from "../data/inventory/sites.js";

/* ═══════════════════════════════════════════════════════════════════════════
   Event Dashboard — Swimlane timeline: one row per network element
   Left: device labels  |  Right: horizontal canvas timeline
   Bottom: compact event feed
   ═══════════════════════════════════════════════════════════════════════════ */

const DPR = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
const ROW_H = 30;
const LABEL_W = 200;
const AXIS_H = 24;

/* ─── Event type colours & shapes ─────────────────────────────────────── */
const EV_TYPES = {
  "change":      { fill:"#1d4ed8", stroke:"#3b82f6", bg:"#dbeafe", tc:"#1e3a8a", lbl:"Change",         shp:"bar" },
  "alarm-crit":  { fill:"#dc2626", stroke:"#ef4444", bg:"#fee2e2", tc:"#7f1d1d", lbl:"Alarm Critical", shp:"circle" },
  "alarm-warn":  { fill:"#d97706", stroke:"#f59e0b", bg:"#fef3c7", tc:"#78350f", lbl:"Alarm Warning",  shp:"circle" },
  "auto":        { fill:"#7c3aed", stroke:"#a78bfa", bg:"#ede9fe", tc:"#3b0764", lbl:"Automation",     shp:"bar" },
  "config":      { fill:"#0d9488", stroke:"#14b8a6", bg:"#ccfbf1", tc:"#134e4a", lbl:"Config Change",  shp:"bar" },
  "bgp":         { fill:"#a21caf", stroke:"#c026d3", bg:"#fae8ff", tc:"#701a75", lbl:"BGP",            shp:"tri" },
  "interface":   { fill:"#2563eb", stroke:"#3b82f6", bg:"#dbeafe", tc:"#1e3a8a", lbl:"Interface",      shp:"circle" },
  "traffic":     { fill:"#ea580c", stroke:"#f97316", bg:"#ffedd5", tc:"#7c2d12", lbl:"Traffic",        shp:"diamond" },
  "security":    { fill:"#be185d", stroke:"#ec4899", bg:"#fce7f3", tc:"#831843", lbl:"Security",       shp:"diamond" },
  "system":      { fill:"#64748b", stroke:"#94a3b8", bg:"#f1f5f9", tc:"#1e293b", lbl:"System",         shp:"circle" },
  "svc-down":    { fill:"#991b1b", stroke:"#dc2626", bg:"#fecaca", tc:"#7f1d1d", lbl:"Service Down",   shp:"bar" },
  "svc-degraded":{ fill:"#c2410c", stroke:"#ea580c", bg:"#fed7aa", tc:"#7c2d12", lbl:"Service Degraded",shp:"bar" },
  "svc-ok":      { fill:"#166534", stroke:"#22c55e", bg:"#bbf7d0", tc:"#14532d", lbl:"Service OK",     shp:"bar" },
};

const SVC_CRIT_COLORS = { Critical:"#dc2626", High:"#d97706", Medium:"#2563eb", Low:"#64748b" };

/* ─── Map event to type key ──────────────────────────────────────────── */
function evType(ev) {
  if (ev.type === "SERVICE") return ev.severity === "critical" ? "svc-down" : ev.severity === "info" ? "svc-ok" : "svc-degraded";
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
export default function EventsView({ changes = [], liveEvents = [], pollerConnected = false }) {
  const { nodes: NODES } = useNodes();
  const canvasRef = useRef(null);
  const axisRef = useRef(null);
  const paneRef = useRef(null);
  const labelsRef = useRef(null);

  /* ── View state ── */
  const [winH, setWinH] = useState(12);
  const [winS, setWinS] = useState(() => Date.now() - 6 * 3600000);
  const [hidden, setHidden] = useState(new Set());
  const [tooltip, setTooltip] = useState(null);
  const [selectedEvt, setSelectedEvt] = useState(null);
  const [feedOpen, setFeedOpen] = useState(true);
  const [feedH, setFeedH] = useState(160); // resizable event feed height
  const [cursorMode, setCursorMode] = useState("zoom"); // "zoom" | "pan"
  const dragRef = useRef(null);       // { mode:"zoom"|"pan", startX, startWinS, curX? }
  const [rubberBand, setRubberBand] = useState(null); // { x1, x2 } in px relative to pane
  const dividerDragRef = useRef(null);
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

  /* ── Merge all data sources into unified event stream ── */
  const mappedEvents = useMemo(() => {
    const fromEvents = EVENTS.map(ev => ({ ...ev, _type: evType(ev), _ts: new Date(ev.ts).getTime(), _src: "event" }));

    const now = Date.now();
    const fromAlarms = ALARMS.map(a => {
      const start = new Date(a.since).getTime();
      // OPEN alarms: duration until now. ACK/CLEARED: use duration field or 30min default
      const dur = a.status === "OPEN" ? Math.max(now - start, 300000)
                : a.duration ? a.duration
                : 1800000;
      return {
        id: "alm-ev-" + a.id, nodeId: a.nodeId, country: a.country,
        type: "ALARM", severity: a.severity === "Critical" ? "critical" : a.severity === "Major" ? "error" : "warning",
        source: "alarm", message: `${a.severity} Alarm: ${a.message}`,
        detail: a.detail, ts: a.since, changeId: null, duration: dur,
        _type: a.severity === "Critical" ? "alarm-crit" : "alarm-warn",
        _ts: start, _src: "alarm",
        _alarmStatus: a.status, _affectedServices: a.affectedServices,
      };
    });

    const fromChanges = [];
    for (const c of changes) {
      if (c.isTemplate) continue;
      const devices = c.affectedDeviceIds || [];
      const nodeId = devices[0] || "unknown";
      const node = nodeMap[nodeId];
      const country = c.country || node?.country || "??";
      const sevMap = { "Failed":"error", "Aborted":"warning", "In Execution":"warning", "Completed":"info" };
      const sev = sevMap[c.status] || "info";
      if (c.scheduledFor) {
        const cStart = new Date(c.scheduledFor).getTime();
        const cEnd = c.scheduledEnd ? new Date(c.scheduledEnd).getTime() : 0;
        const cDur = cEnd > cStart ? cEnd - cStart : 3600000; // default 1h
        fromChanges.push({
          id: "chg-" + c.id, nodeId, country,
          type: "CHANGE", severity: sev, source: c.execMode === "Automated" ? "camunda" : "noc-engineer",
          message: `${c.status}: ${c.name}`,
          detail: `Change ${c.id} · ${c.category} · ${c.risk} risk · ${c.status}. ${c.description || ""}`.trim(),
          ts: c.scheduledFor, changeId: c.id, duration: cDur,
          _type: "change", _ts: cStart, _src: "change",
          _changeStatus: c.status, _changeRisk: c.risk, _changeCategory: c.category,
          _devices: devices,
        });
      }
    }

    // Live events from the poller WebSocket
    const fromLive = liveEvents.map(le => ({
      id: le.id, nodeId: le.nodeId,
      country: le.nodeId ? le.nodeId.split("-")[0].toUpperCase() : "??",
      type: le.type, severity: le.severity, source: le.source || "poller",
      message: le.message, detail: le.message, ts: le.ts,
      _type: le.severity === "critical" ? "alarm-crit" : le.severity === "warning" ? "alarm-warn" : "system",
      _ts: new Date(le.ts).getTime(), _src: "live",
    }));

    let evs = [...fromEvents, ...fromAlarms, ...fromChanges, ...fromLive];

    if (fCountry !== "ALL") evs = evs.filter(e => e.country === fCountry);
    if (fSite !== "ALL") {
      const siteCity = fSite.split("-").slice(0, 2).join("-");
      evs = evs.filter(e => {
        if (e.serviceId) return true; // service events pass site filter (filtered by country already)
        if (!e.nodeId) return false;
        const nodeCity = e.nodeId.split("-").slice(0, 2).join("-");
        return nodeCity === siteCity;
      });
    }
    if (fService !== "ALL") {
      const svc = SERVICES.find(s => s.id === fService);
      if (svc) evs = evs.filter(e => e.serviceId === fService || svc.nodes.includes(e.nodeId));
    }
    if (fDevice !== "ALL") evs = evs.filter(e => e.nodeId === fDevice || e.serviceId);
    return evs;
  }, [fCountry, fSite, fService, fDevice, changes, liveEvents, nodeMap]);

  const svcMap = useMemo(() => Object.fromEntries(SERVICES.map(s => [s.id, s])), []);

  /* ── Build rows: services first, then devices ── */
  const { serviceRows, deviceRows, allRows, rowIdx } = useMemo(() => {
    const svcSet = new Set();
    const devSet = new Set();
    for (const ev of mappedEvents) {
      if (hidden.has(ev._type)) continue;
      if (ev.serviceId) svcSet.add(ev.serviceId);
      if (ev.nodeId) devSet.add(ev.nodeId);
    }
    // Sort services by country > name
    const sRows = [...svcSet].sort((a, b) => {
      const sa = svcMap[a], sb = svcMap[b];
      const ca = sa?.country || "ZZ", cb = sb?.country || "ZZ";
      if (ca !== cb) return ca.localeCompare(cb);
      return (sa?.name || a).localeCompare(sb?.name || b);
    });
    // Sort devices by country > id
    const dRows = [...devSet].sort((a, b) => {
      const na = nodeMap[a], nb = nodeMap[b];
      const ca = na?.country || "ZZ", cb = nb?.country || "ZZ";
      if (ca !== cb) return ca.localeCompare(cb);
      return a.localeCompare(b);
    });
    // Combined: services header row + service rows + devices header row + device rows
    const all = [];
    const idx = {};
    if (sRows.length > 0) {
      all.push({ type: "header", label: "SERVICES", count: sRows.length });
      for (const s of sRows) {
        idx["svc:" + s] = all.length;
        all.push({ type: "service", id: s });
      }
    }
    if (dRows.length > 0) {
      all.push({ type: "header", label: "NETWORK ELEMENTS", count: dRows.length });
      for (const d of dRows) {
        idx["dev:" + d] = all.length;
        all.push({ type: "device", id: d });
      }
    }
    return { serviceRows: sRows, deviceRows: dRows, allRows: all, rowIdx: idx };
  }, [mappedEvents, hidden, nodeMap, svcMap]);

  /* ── Stats ── */
  const stats = useMemo(() => ({
    total: mappedEvents.length,
    changes: mappedEvents.filter(e => e._type === "change").length,
    alarms: mappedEvents.filter(e => e._type === "alarm-crit" || e._type === "alarm-warn").length,
    auto: mappedEvents.filter(e => e._type === "auto").length,
    services: mappedEvents.filter(e => e._type === "svc-down" || e._type === "svc-degraded" || e._type === "svc-ok").length,
    network: mappedEvents.filter(e => ["bgp","interface","traffic","config","security","system"].includes(e._type)).length,
  }), [mappedEvents]);

  const winE = winS + winH * 3600000;
  const pW = useCallback(() => (paneRef.current?.clientWidth || 800), []);
  const tX = useCallback((t) => ((t - winS) / (winH * 3600000)) * pW(), [winS, winH, pW]);

  const canvasH = Math.max(allRows.length * ROW_H, 120);

  /* ── Draw ──────────────────────────────────────────────────────────── */
  const drawAll = useCallback(() => {
    const cv = canvasRef.current;
    const axCv = axisRef.current;
    const pane = paneRef.current;
    if (!cv || !pane) return;
    const W = pane.clientWidth;
    const H = canvasH;

    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    const ctx = cv.getContext("2d"); ctx.scale(DPR, DPR);
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);

    // Row alternating stripes + section headers
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];
      if (row.type === "header") {
        ctx.fillStyle = "#e8ecf2";
        ctx.fillRect(0, i * ROW_H, W, ROW_H);
        ctx.fillStyle = "#64748b"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "left";
        ctx.fillText(row.label + ` (${row.count})`, 8, i * ROW_H + ROW_H / 2 + 3);
      } else if (row.type === "service") {
        ctx.fillStyle = i % 2 === 0 ? "#fefce8" : "#fef9c3"; // yellow tint for services
        ctx.fillRect(0, i * ROW_H, W, ROW_H);
      } else {
        if (i % 2 === 1) {
          ctx.fillStyle = "#f8f9fb";
          ctx.fillRect(0, i * ROW_H, W, ROW_H);
        }
      }
      ctx.strokeStyle = "rgba(0,0,0,0.04)"; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(0, (i + 1) * ROW_H); ctx.lineTo(W, (i + 1) * ROW_H); ctx.stroke();
    }

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

    // Draw events — duration-aware: all shapes stretch to real duration
    const visible = mappedEvents.filter(e => {
      const end = e._ts + (e.duration || 0);
      if (!(end >= winS - 600000 && e._ts <= winE + 600000 && !hidden.has(e._type))) return false;
      // Must map to a row
      if (e.serviceId && rowIdx["svc:" + e.serviceId] !== undefined) return true;
      if (e.nodeId && rowIdx["dev:" + e.nodeId] !== undefined) return true;
      return false;
    });
    const evBBox = [];

    // Sort by duration desc so short events render on top of long ones
    const sorted = [...visible].sort((a, b) => (b.duration || 0) - (a.duration || 0));

    for (const ev of sorted) {
      const col = EV_TYPES[ev._type];
      if (!col) continue;
      const x = tX(ev._ts);
      const rowI = ev.serviceId ? rowIdx["svc:" + ev.serviceId] : rowIdx["dev:" + ev.nodeId];
      if (rowI === undefined) continue;
      const cy = rowI * ROW_H + ROW_H / 2;
      const isSelected = selectedEvt === ev.id;
      const dur = ev.duration || 0;
      const hasDur = dur > 0;
      const mr = isSelected ? 8 : 6;

      if (hasDur) {
        // Duration bar — applies to ALL event types when they have a duration
        const x2 = tX(ev._ts + dur);
        const bw = Math.max(6, x2 - x);
        const bh = ROW_H * 0.52;
        ctx.fillStyle = isSelected ? col.fill + "cc" : col.bg;
        rrect(ctx, x, cy - bh/2, bw, bh, 3); ctx.fill();
        ctx.strokeStyle = isSelected ? col.fill : col.stroke + "99"; ctx.lineWidth = isSelected ? 2 : 1;
        rrect(ctx, x, cy - bh/2, bw, bh, 3); ctx.stroke();

        // Draw shape icon at the start of the bar for type identification
        const iconR = 4;
        const ix = x + 5 + iconR;
        if (col.shp === "circle") {
          ctx.beginPath(); ctx.arc(ix, cy, iconR, 0, Math.PI * 2);
          ctx.fillStyle = col.fill; ctx.fill();
        } else if (col.shp === "tri") {
          ctx.beginPath(); ctx.moveTo(ix, cy - iconR); ctx.lineTo(ix + iconR * 0.8, cy + iconR * 0.6); ctx.lineTo(ix - iconR * 0.8, cy + iconR * 0.6); ctx.closePath();
          ctx.fillStyle = col.fill; ctx.fill();
        } else if (col.shp === "diamond") {
          ctx.save(); ctx.translate(ix, cy); ctx.rotate(Math.PI / 4);
          const ds = iconR * 0.6; ctx.beginPath(); ctx.rect(-ds, -ds, ds * 2, ds * 2);
          ctx.fillStyle = col.fill; ctx.fill(); ctx.restore();
        } else {
          // bar shape — just filled start cap
          ctx.fillStyle = col.fill;
          ctx.fillRect(x, cy - bh/2, 3, bh);
        }

        // Label inside bar if wide enough
        if (bw > 50) {
          ctx.font = "bold 8px system-ui"; ctx.fillStyle = col.tc + "cc"; ctx.textAlign = "left";
          const lbl = ev.message?.length > 30 ? ev.message.slice(0, 28) + "…" : ev.message;
          ctx.fillText(lbl || "", x + 14 + iconR, cy + 3);
        }

        evBBox.push({ ev, x1: x, x2: x + bw, yt: cy - bh/2, yb: cy + bh/2, cy });
      } else {
        // Point-in-time event — original shape rendering
        if (col.shp === "bar") {
          const bw = 8;
          const bh = ROW_H * 0.52;
          ctx.fillStyle = isSelected ? col.fill + "dd" : col.bg;
          rrect(ctx, x - bw/2, cy - bh/2, bw, bh, 2); ctx.fill();
          ctx.strokeStyle = isSelected ? col.fill : col.stroke + "88"; ctx.lineWidth = isSelected ? 2 : 1;
          rrect(ctx, x - bw/2, cy - bh/2, bw, bh, 2); ctx.stroke();
          evBBox.push({ ev, x1: x - bw/2, x2: x + bw/2, yt: cy - bh/2, yb: cy + bh/2, cy });
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
      const axW = W, axH = AXIS_H;
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
        if (d.getHours() === 0 && d.getMinutes() === 0) {
          ac.fillText(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), x, 16);
        } else {
          ac.fillText(fmtHM(snap), x, 16);
        }
      }
    }
  }, [winS, winH, winE, tX, pW, mappedEvents, hidden, selectedEvt, allRows, rowIdx, canvasH]);

  useEffect(() => { drawAll(); }, [drawAll]);
  useEffect(() => { const r = () => drawAll(); window.addEventListener("resize", r); return () => window.removeEventListener("resize", r); }, [drawAll]);

  /* ── Sync scroll between labels and canvas ── */
  const syncScroll = useCallback((source) => {
    const labels = labelsRef.current;
    const pane = paneRef.current;
    if (!labels || !pane) return;
    if (source === "canvas") {
      labels.scrollTop = pane.scrollTop;
    } else {
      pane.scrollTop = labels.scrollTop;
    }
  }, []);

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
    const scrollTop = paneRef.current?.scrollTop || 0;
    const ev = hitTest(e.clientX - rect.left, e.clientY - rect.top + scrollTop);
    if (ev) {
      const col = EV_TYPES[ev._type];
      const node = nodeMap[ev.nodeId];
      setTooltip({ x: e.clientX + 14, y: e.clientY - 10, ev, col, node });
    } else {
      setTooltip(null);
    }
  }, [hitTest, nodeMap]);

  const handleCanvasClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const scrollTop = paneRef.current?.scrollTop || 0;
    const ev = hitTest(e.clientX - rect.left, e.clientY - rect.top + scrollTop);
    setSelectedEvt(ev ? (ev.id === selectedEvt ? null : ev.id) : null);
  }, [hitTest, selectedEvt]);

  // Drag: normal = rubber-band zoom, shift = pan
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return; // left button only
    const rect = paneRef.current?.getBoundingClientRect();
    if (!rect) return;
    const localX = e.clientX - rect.left;
    // Shift always forces the opposite mode; otherwise use cursorMode
    const usePan = e.shiftKey ? cursorMode !== "pan" : cursorMode === "pan";
    if (usePan) {
      dragRef.current = { mode: "pan", startX: e.clientX, startWinS: winS };
    } else {
      dragRef.current = { mode: "zoom", startX: e.clientX, localStartX: localX, startWinS: winS };
      setRubberBand({ x1: localX, x2: localX });
    }
  }, [winS, cursorMode]);

  useEffect(() => {
    const handleMove = (e) => {
      if (!dragRef.current) return;
      const rect = paneRef.current?.getBoundingClientRect();
      if (dragRef.current.mode === "pan") {
        const mspp = (winH * 3600000) / pW();
        setWinS(dragRef.current.startWinS - (e.clientX - dragRef.current.startX) * mspp);
      } else if (dragRef.current.mode === "zoom" && rect) {
        const localX = e.clientX - rect.left;
        setRubberBand({ x1: dragRef.current.localStartX, x2: localX });
      }
    };
    const handleUp = (e) => {
      if (!dragRef.current) return;
      if (dragRef.current.mode === "zoom") {
        const rect = paneRef.current?.getBoundingClientRect();
        if (rect) {
          const localX = e.clientX - rect.left;
          const x1 = Math.min(dragRef.current.localStartX, localX);
          const x2 = Math.max(dragRef.current.localStartX, localX);
          const pxDist = x2 - x1;
          if (pxDist > 8) {
            // Convert pixel range to time range
            const W = pW();
            const msPerPx = (winH * 3600000) / W;
            const tStart = winS + x1 * msPerPx;
            const tEnd = winS + x2 * msPerPx;
            const newH = Math.max(0.05, (tEnd - tStart) / 3600000); // min ~3 minutes
            setWinS(tStart);
            setWinH(newH);
          }
        }
        setRubberBand(null);
      }
      dragRef.current = null;
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => { window.removeEventListener("mousemove", handleMove); window.removeEventListener("mouseup", handleUp); };
  }, [winH, winS, pW]);

  // Wheel zoom: continuous, centered on cursor
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const rect = paneRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cursorX = e.clientX - rect.left;
    const W = pW();
    const factor = e.deltaY > 0 ? 1.4 : 1 / 1.4; // zoom out / zoom in
    const newH = Math.max(0.05, Math.min(96, winH * factor));
    // Keep the time under cursor fixed
    const cursorT = winS + (cursorX / W) * winH * 3600000;
    const newWinS = cursorT - (cursorX / W) * newH * 3600000;
    setWinH(newH);
    setWinS(newWinS);
  }, [winH, winS, pW]);

  // Attach wheel handler with passive:false for preventDefault
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const handler = (e) => { if (!e.shiftKey) handleWheel(e); };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [handleWheel]);

  const ZOOMS = [1, 2, 4, 6, 12, 24, 48];
  const pan = useCallback((h) => setWinS(s => s + h * 3600000), []);
  const toggleLeg = useCallback((k) => setHidden(h => { const n = new Set(h); if (n.has(k)) n.delete(k); else n.add(k); return n; }), []);

  const navLabel = useMemo(() => {
    const s = new Date(winS);
    const hLabel = winH < 1 ? `${Math.round(winH * 60)}m` : winH % 1 === 0 ? `${winH}h` : `${winH.toFixed(1)}h`;
    return `${s.toLocaleDateString("en-US",{month:"short",day:"numeric"})} ${fmtHM(winS)} → ${fmtHM(winE)} (${hLabel})`;
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
    // Scroll to the row
    const key = ev.serviceId ? "svc:" + ev.serviceId : "dev:" + ev.nodeId;
    const ri = rowIdx[key];
    if (ri !== undefined && paneRef.current) {
      const targetScroll = ri * ROW_H - paneRef.current.clientHeight / 2 + ROW_H / 2;
      paneRef.current.scrollTop = Math.max(0, targetScroll);
      if (labelsRef.current) labelsRef.current.scrollTop = Math.max(0, targetScroll);
    }
  }, [selectedEvt, winH, rowIdx]);

  /* ── Reset dependent filters when parent changes ── */
  useEffect(() => { setFSite("ALL"); setFService("ALL"); setFDevice("ALL"); }, [fCountry]);
  useEffect(() => { setFDevice("ALL"); }, [fService]);

  return <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden", fontFamily:"'Inter',system-ui,sans-serif", background:"#f4f6f9", color:"#1a2535", fontSize:13 }}>

    {/* ══ TOP BAR ══ */}
    <div style={{ display:"flex", alignItems:"center", background:"#fff", borderBottom:"1px solid #dde2ea", flexShrink:0, height:44, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ padding:"0 14px", borderRight:"1px solid #dde2ea", height:"100%", display:"flex", flexDirection:"column", justifyContent:"center", minWidth:120 }}>
        <div style={{ fontFamily:"monospace", fontSize:13, fontWeight:700 }}>Event Dashboard</div>
      </div>
      {[
        { v:stats.total, l:"Total", c:"#1a2535" },
        { v:stats.changes, l:"Changes", c:"#1d4ed8" },
        { v:stats.alarms, l:"Alarms", c:"#dc2626" },
        { v:stats.services, l:"Services", c:"#c2410c" },
        { v:stats.auto, l:"Auto", c:"#7c3aed" },
        { v:stats.network, l:"Network", c:"#2563eb" },
      ].map(k => <div key={k.l} style={{ display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:"0 10px", borderRight:"1px solid #dde2ea", height:"100%", gap:0, minWidth:50 }}>
        <div style={{ fontFamily:"monospace", fontSize:15, fontWeight:700, lineHeight:1, color:k.c }}>{k.v}</div>
        <div style={{ fontSize:7, textTransform:"uppercase", letterSpacing:0.8, color:"#7a8fa8" }}>{k.l}</div>
      </div>)}

      {pollerConnected && <div style={{ display:"flex", alignItems:"center", gap:5, padding:"0 10px",
        borderRight:"1px solid #dde2ea", height:"100%" }}>
        <span style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e",
          boxShadow:"0 0 0 3px #22c55e40" }}/>
        <span style={{ fontSize:9, fontWeight:700, color:"#15803d", textTransform:"uppercase" }}>Live</span>
      </div>}

      <div style={{ display:"flex", gap:5, alignItems:"center", padding:"0 10px", marginLeft:6, flex:1, flexWrap:"wrap" }}>
        <Sel value={fCountry} onChange={setFCountry} options={[{v:"ALL",l:"🌐 All Countries"},...["FJ","HW","IB"].map(c=>({v:c,l:`${COUNTRY_META[c]?.flag} ${COUNTRY_META[c]?.name}`}))]}/>
        <Sel value={fSite} onChange={setFSite} options={[{v:"ALL",l:"All DCs / Sites"},...filteredSites.map(s=>({v:s.id,l:`${s.name} (${s.type})`}))]}/>
        <Sel value={fService} onChange={setFService} options={[{v:"ALL",l:"All Services"},...filteredServices.map(s=>({v:s.id,l:s.name}))]}/>
        <Sel value={fDevice} onChange={setFDevice} options={[{v:"ALL",l:"All Devices"},...filteredDevices.map(d=>({v:d.id,l:d.id}))]}/>
      </div>
    </div>

    {/* ══ LEGEND + NAV ══ */}
    <div style={{ display:"flex", alignItems:"center", background:"#fff", borderBottom:"1px solid #dde2ea", flexShrink:0, padding:"3px 10px", gap:5, flexWrap:"wrap" }}>
      {Object.entries(EV_TYPES).map(([k, col]) =>
        <span key={k} onClick={() => toggleLeg(k)}
          style={{ display:"inline-flex", alignItems:"center", gap:3, fontSize:9, color:"#7a8fa8", cursor:"pointer",
            padding:"1px 7px", borderRadius:10, border:`1px solid ${hidden.has(k)?"transparent":col.fill+"40"}`,
            background: hidden.has(k) ? "transparent" : col.bg+"80",
            opacity: hidden.has(k) ? 0.35 : 1, transition:"all 0.12s", userSelect:"none" }}>
          <span style={{ width:7, height:7, borderRadius: col.shp==="circle"?"50%":col.shp==="diamond"?"1px":"2px",
            background:col.fill, transform:col.shp==="diamond"?"rotate(45deg)":"none", flexShrink:0 }}/>
          {col.lbl}
        </span>
      )}

      <div style={{ width:1, height:16, background:"#dde2ea", margin:"0 3px" }}/>

      <NB onClick={() => pan(-3)}>◀◀</NB>
      <NB onClick={() => pan(-1)}>◀</NB>
      <span style={{ fontFamily:"monospace", fontSize:9, color:"#7a8fa8", minWidth:130, textAlign:"center" }}>{navLabel}</span>
      <NB onClick={() => pan(1)}>▶</NB>
      <NB onClick={() => pan(3)}>▶▶</NB>
      <div style={{ width:1, height:16, background:"#dde2ea", margin:"0 2px" }}/>
      <div style={{ display:"flex", gap:2 }}>
        {ZOOMS.map(z => <button key={z} onClick={() => setWinH(z)}
          style={{ fontSize:8, padding:"2px 6px", borderRadius:4, border:`1px solid ${winH===z?"#0077cc":"#dde2ea"}`,
            background:winH===z?"#0077cc":"#f0f2f5", color:winH===z?"#fff":"#7a8fa8", cursor:"pointer", fontFamily:"inherit" }}>
          {z}h
        </button>)}
      </div>
      <NB onClick={() => { setWinH(12); setWinS(Date.now() - 6*3600000); }}>⌂</NB>
      <div style={{ width:1, height:16, background:"#dde2ea", margin:"0 2px" }}/>
      {/* Cursor mode toggle */}
      {[["zoom","✛","Zoom (drag to select)"],["pan","✋","Pan (drag to move)"]].map(([m,icon,title]) =>
        <button key={m} onClick={() => setCursorMode(m)} title={title}
          style={{ fontSize:11, padding:"2px 6px", borderRadius:4, border:`1px solid ${cursorMode===m?"#0077cc":"#dde2ea"}`,
            background:cursorMode===m?"#0077cc":"#f0f2f5", color:cursorMode===m?"#fff":"#7a8fa8",
            cursor:"pointer", fontFamily:"inherit", lineHeight:1 }}>
          {icon}
        </button>
      )}
      <span style={{ fontSize:9, color:"#94a3b8", marginLeft:4 }}>{serviceRows.length} svc · {deviceRows.length} dev</span>
    </div>

    {/* ══ MAIN: Swimlane (labels + canvas) + optional detail ══ */}
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minHeight:0 }}>

      {/* ── Swimlane area ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden", minHeight:0 }}>

        {/* Left: Row labels (services + devices) */}
        <div style={{ width:LABEL_W, flexShrink:0, display:"flex", flexDirection:"column", borderRight:"1px solid #dde2ea", background:"#fff" }}>
          {/* Header */}
          <div style={{ height:AXIS_H, flexShrink:0, borderBottom:"1px solid #dde2ea", display:"flex", alignItems:"center", padding:"0 8px",
            fontSize:9, fontWeight:700, color:"#7a8fa8", textTransform:"uppercase", letterSpacing:0.8, background:"#f8f9fb" }}>
            Services &amp; Elements
          </div>
          {/* Scrollable label list */}
          <div ref={labelsRef} style={{ flex:1, overflowY:"auto", overflowX:"hidden" }}
            onScroll={() => syncScroll("labels")}>
            <div style={{ height: canvasH }}>
              {allRows.map((row, i) => {
                if (row.type === "header") {
                  return <div key={"hdr-" + row.label} style={{
                    height: ROW_H, display:"flex", alignItems:"center", padding:"0 8px",
                    background:"#e8ecf2", borderBottom:"1px solid rgba(0,0,0,0.08)",
                  }}>
                    <span style={{ fontSize:9, fontWeight:800, color:"#475569", textTransform:"uppercase", letterSpacing:1 }}>
                      {row.label}
                    </span>
                    <span style={{ fontSize:8, color:"#94a3b8", marginLeft:6 }}>({row.count})</span>
                  </div>;
                }

                if (row.type === "service") {
                  const svc = svcMap[row.id];
                  const hasSvcEvent = mappedEvents.some(e => e.serviceId === row.id && (e._type === "svc-down" || e._type === "svc-degraded"));
                  const critColor = svc ? (SVC_CRIT_COLORS[svc.criticality] || "#64748b") : "#64748b";
                  return <div key={"svc-" + row.id} style={{
                    height: ROW_H, display:"flex", alignItems:"center", gap:5, padding:"0 8px",
                    borderBottom:"1px solid rgba(0,0,0,0.04)",
                    background: i % 2 === 0 ? "#fefce8" : "#fef9c3",
                    cursor:"pointer", transition:"background 0.1s",
                  }} onMouseEnter={e => { e.currentTarget.style.background = "#fef3c7"; }}
                     onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? "#fefce8" : "#fef9c3"; }}
                     onClick={() => { setFService(row.id); }}>
                    <span style={{ width:6, height:6, borderRadius:2, flexShrink:0,
                      background: hasSvcEvent ? "#dc2626" : "#22c55e",
                      boxShadow: hasSvcEvent ? "0 0 4px 1px #dc262660" : "none" }}/>
                    <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
                      <div style={{ fontSize:10, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"#1a2535" }}>
                        {svc?.name || row.id}
                      </div>
                      <div style={{ fontSize:8, color:"#94a3b8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", display:"flex", gap:4, alignItems:"center" }}>
                        <span style={{ width:4, height:4, borderRadius:1, background:critColor, flexShrink:0 }}/>
                        {svc ? `${svc.criticality} · SLA ${svc.sla}` : "Unknown"}
                        <span style={{ marginLeft:"auto" }}>{COUNTRY_META[svc?.country]?.flag || "🌐"}</span>
                      </div>
                    </div>
                  </div>;
                }

                // device row
                const node = nodeMap[row.id];
                const hasAlarm = mappedEvents.some(e => e.nodeId === row.id && (e._type === "alarm-crit" || e._type === "alarm-warn"));
                const layerColor = node ? (LAYER_COLORS[node.layer] || "#64748b") : "#64748b";
                return <div key={"dev-" + row.id} style={{
                  height: ROW_H, display:"flex", alignItems:"center", gap:5, padding:"0 8px",
                  borderBottom:"1px solid rgba(0,0,0,0.04)",
                  background: i % 2 === 1 ? "#f8f9fb" : "#fff",
                  cursor:"pointer", transition:"background 0.1s",
                }} onMouseEnter={e => { e.currentTarget.style.background = "#eef2ff"; }}
                   onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 1 ? "#f8f9fb" : "#fff"; }}
                   onClick={() => { setFDevice(row.id); }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", flexShrink:0,
                    background: node?.status === "UP" ? "#22c55e" : node?.status === "DEGRADED" ? "#f59e0b" : "#ef4444",
                    boxShadow: hasAlarm ? "0 0 4px 1px #ef444480" : "none" }}/>
                  <div style={{ flex:1, minWidth:0, overflow:"hidden" }}>
                    <div style={{ fontFamily:"monospace", fontSize:10, fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"#1a2535" }}>
                      {row.id}
                    </div>
                    <div style={{ fontSize:8, color:"#94a3b8", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", display:"flex", gap:4, alignItems:"center" }}>
                      <span style={{ width:4, height:4, borderRadius:1, background:layerColor, flexShrink:0 }}/>
                      {node ? `${node.vendor} · ${node.layer}` : "Unknown"}
                      <span style={{ marginLeft:"auto" }}>{COUNTRY_META[node?.country]?.flag || "🌐"}</span>
                    </div>
                  </div>
                </div>;
              })}
            </div>
          </div>
        </div>

        {/* Right: Canvas timeline */}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", minWidth:0 }}>
          {/* Axis at top */}
          <div style={{ height:AXIS_H, flexShrink:0, background:"#f8f9fb", borderBottom:"1px solid #eaecf0" }}>
            <canvas ref={axisRef} style={{ display:"block" }}/>
          </div>
          {/* Scrollable canvas */}
          <div ref={paneRef} style={{ flex:1, overflowY:"auto", overflowX:"hidden", cursor: rubberBand ? "col-resize" : cursorMode === "pan" ? "grab" : "crosshair", position:"relative" }}
            onScroll={() => syncScroll("canvas")}
            onMouseDown={handleMouseDown}>
            <canvas ref={canvasRef} style={{ display:"block" }}
              onMouseMove={handleCanvasMove} onMouseLeave={() => setTooltip(null)}
              onClick={handleCanvasClick}/>
            {/* Rubber-band zoom overlay */}
            {rubberBand && (() => {
              const x1 = Math.min(rubberBand.x1, rubberBand.x2);
              const x2 = Math.max(rubberBand.x1, rubberBand.x2);
              const w = x2 - x1;
              return w > 2 ? <div style={{
                position:"absolute", top:0, left:x1, width:w, height:"100%",
                background:"rgba(14,165,233,0.12)", border:"1px solid rgba(14,165,233,0.5)",
                borderTop:"none", borderBottom:"none",
                pointerEvents:"none", zIndex:10,
              }}>
                <div style={{ position:"sticky", top:4, display:"flex", justifyContent:"center", pointerEvents:"none" }}>
                  <span style={{ fontSize:9, fontWeight:700, color:"#0369a1", background:"rgba(255,255,255,0.9)",
                    padding:"1px 6px", borderRadius:4, fontFamily:"monospace", whiteSpace:"nowrap" }}>
                    {(() => {
                      const W = pW();
                      const msPerPx = (winH * 3600000) / W;
                      const tS = winS + x1 * msPerPx;
                      const tE = winS + x2 * msPerPx;
                      const spanMs = tE - tS;
                      return spanMs < 60000 ? `${Math.round(spanMs/1000)}s`
                        : spanMs < 3600000 ? `${Math.round(spanMs/60000)}m`
                        : `${(spanMs/3600000).toFixed(1)}h`;
                    })()}
                  </span>
                </div>
              </div> : null;
            })()}
          </div>
        </div>

        {/* Detail panel (when event selected) */}
        {selEvt && <div style={{ width:280, flexShrink:0, borderLeft:"1px solid #dde2ea", background:"#fff", overflowY:"auto", padding:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
            <span style={{ fontSize:12, fontWeight:700 }}>Event Detail</span>
            <button onClick={() => setSelectedEvt(null)} style={{ background:"none", border:"none", cursor:"pointer", fontSize:13, color:"#7a8fa8" }}>✕</button>
          </div>

          <span style={{ display:"inline-block", padding:"2px 7px", borderRadius:4, fontSize:10, fontWeight:600,
            background:selCol.bg, color:selCol.tc, border:`1px solid ${selCol.fill}40`, marginBottom:8 }}>
            {selCol.lbl}
          </span>

          <div style={{ fontSize:12, fontWeight:600, marginBottom:6, lineHeight:1.4 }}>{selEvt.message}</div>
          <div style={{ fontSize:11, color:"#4b5563", lineHeight:1.5, marginBottom:12, background:"#f8f9fb",
            padding:8, borderRadius:6, border:"1px solid #eaecf0" }}>{selEvt.detail}</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5, fontSize:10, marginBottom:12 }}>
            <div><span style={{ color:"#7a8fa8" }}>Time:</span> <b>{fmtDMH(selEvt._ts)}</b></div>
            <div><span style={{ color:"#7a8fa8" }}>Severity:</span> <b>{selEvt.severity}</b></div>
            <div><span style={{ color:"#7a8fa8" }}>Country:</span> <b>{COUNTRY_META[selEvt.country]?.flag} {COUNTRY_META[selEvt.country]?.name}</b></div>
            <div><span style={{ color:"#7a8fa8" }}>Type:</span> <b>{selEvt.type}</b></div>
            {selEvt.source && <div><span style={{ color:"#7a8fa8" }}>Source:</span> <b>{AUTOMATION_SOURCES[selEvt.source]?.label || selEvt.source}</b></div>}
            {selEvt.changeId && <div><span style={{ color:"#7a8fa8" }}>Change:</span> <b style={{ fontFamily:"monospace" }}>{selEvt.changeId}</b></div>}
          </div>

          {selNode && <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:6, padding:8, marginBottom:8 }}>
            <div style={{ fontSize:9, fontWeight:700, color:"#7a8fa8", textTransform:"uppercase", letterSpacing:0.5, marginBottom:3 }}>Device</div>
            <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:selNode.status==="UP"?"#22c55e":selNode.status==="DEGRADED"?"#f59e0b":"#ef4444" }}/>
              <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:11 }}>{selNode.id}</span>
            </div>
            <div style={{ fontSize:10, color:"#7a8fa8" }}>{selNode.vendor} {selNode.hwModel} · {selNode.layer}</div>
            <div style={{ fontSize:10, color:"#7a8fa8" }}>{selNode.hostname}</div>
          </div>}

          {/* Related events on the same device */}
          {(() => {
            const related = sortedEvents.filter(e => e.nodeId === selEvt.nodeId && e.id !== selEvt.id).slice(0, 5);
            if (related.length === 0) return null;
            return <div style={{ marginTop:6 }}>
              <div style={{ fontSize:9, fontWeight:700, color:"#7a8fa8", textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>
                Related on same device ({related.length})
              </div>
              {related.map(re => {
                const rc = EV_TYPES[re._type];
                return <div key={re.id} onClick={() => { setSelectedEvt(re.id); setWinS(re._ts - 0.3 * winH * 3600000); }}
                  style={{ padding:"4px 6px", borderRadius:4, marginBottom:2, cursor:"pointer", border:"1px solid #eaecf0",
                    fontSize:10, lineHeight:1.4, background:"#fafbfc" }}>
                  <div style={{ display:"flex", gap:4, alignItems:"center" }}>
                    <span style={{ width:5, height:5, borderRadius:"50%", background:rc.fill, flexShrink:0 }}/>
                    <span style={{ fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{re.message}</span>
                  </div>
                  <div style={{ fontSize:9, color:"#94a3b8", fontFamily:"monospace" }}>{fmtDMH(re._ts)}</div>
                </div>;
              })}
            </div>;
          })()}
        </div>}
      </div>

      {/* ── Resizable divider ── */}
      {feedOpen && <div
        style={{ height:5, flexShrink:0, cursor:"row-resize", background:"#eaecf0", borderTop:"1px solid #dde2ea",
          display:"flex", alignItems:"center", justifyContent:"center", userSelect:"none" }}
        onMouseDown={(e) => {
          e.preventDefault();
          const startY = e.clientY;
          const startH = feedH;
          const onMove = (me) => {
            const delta = startY - me.clientY;
            setFeedH(Math.max(60, Math.min(500, startH + delta)));
          };
          const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}>
        <div style={{ width:30, height:2, borderRadius:1, background:"#c1c8d4" }}/>
      </div>}

      {/* ── Compact Event Feed (collapsible) ── */}
      <div style={{ flexShrink:0, borderTop: feedOpen ? "none" : "1px solid #dde2ea", background:"#fff" }}>
        <div onClick={() => setFeedOpen(!feedOpen)}
          style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"4px 14px",
            cursor:"pointer", background:"#f8f9fb", borderBottom: feedOpen ? "1px solid #dde2ea" : "none",
            fontSize:10, fontWeight:700, color:"#7a8fa8", textTransform:"uppercase", letterSpacing:1, userSelect:"none" }}>
          <span>{feedOpen ? "▾" : "▸"} Event Feed</span>
          <span style={{ fontFamily:"monospace" }}>{sortedEvents.length} events</span>
        </div>
        {feedOpen && <div style={{ height:feedH, overflowY:"auto" }}>
          {sortedEvents.slice(0, 30).map(ev => {
            const col = EV_TYPES[ev._type];
            const isSel = ev.id === selectedEvt;
            const node = nodeMap[ev.nodeId];
            const srcMeta = ev.source ? AUTOMATION_SOURCES[ev.source] : null;
            return <div key={ev.id} onClick={() => selectFeedEvent(ev)}
              style={{ display:"flex", gap:6, padding:"4px 14px", borderBottom:"1px solid #eaecf0", cursor:"pointer",
                transition:"background 0.1s", background: isSel ? col.bg : "transparent", minHeight:0 }}
              onMouseEnter={e => { if(!isSel) e.currentTarget.style.background="#f8f9fb"; }}
              onMouseLeave={e => { e.currentTarget.style.background = isSel ? col.bg : "transparent"; }}>
              <div style={{ width:3, borderRadius:2, flexShrink:0, minHeight:22, alignSelf:"stretch", background:col.fill }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:1 }}>
                  <span style={{ fontSize:8, padding:"0 5px", borderRadius:3, fontWeight:600,
                    background:col.bg, color:col.tc, border:`1px solid ${col.fill}40`, flexShrink:0 }}>
                    {col.lbl}
                  </span>
                  {srcMeta && <span style={{ fontSize:8, color:srcMeta.color, fontWeight:600 }}>{srcMeta.icon} {srcMeta.label}</span>}
                  {ev._changeStatus && <span style={{ fontSize:8, padding:"0 4px", borderRadius:3, fontWeight:600,
                    background:ev._changeStatus==="Completed"?"#d1fae5":ev._changeStatus==="Failed"?"#fee2e2":ev._changeStatus==="In Execution"?"#fef3c7":"#e0e7ff",
                    color:ev._changeStatus==="Completed"?"#065f46":ev._changeStatus==="Failed"?"#991b1b":ev._changeStatus==="In Execution"?"#92400e":"#3730a3" }}>
                    {ev._changeStatus}
                  </span>}
                  {ev._changeRisk && <span style={{ fontSize:8, padding:"0 4px", borderRadius:3, fontWeight:600,
                    background:ev._changeRisk==="Critical"?"#fee2e2":ev._changeRisk==="High"?"#ffedd5":ev._changeRisk==="Medium"?"#fef3c7":"#d1fae5",
                    color:ev._changeRisk==="Critical"?"#991b1b":ev._changeRisk==="High"?"#9a3412":ev._changeRisk==="Medium"?"#92400e":"#065f46" }}>
                    {ev._changeRisk}
                  </span>}
                  {ev._alarmStatus && <span style={{ fontSize:8, padding:"0 4px", borderRadius:3, fontWeight:600,
                    background:ev._alarmStatus==="OPEN"?"#fee2e2":"#fef3c7",
                    color:ev._alarmStatus==="OPEN"?"#991b1b":"#92400e" }}>
                    {ev._alarmStatus}
                  </span>}
                  <span style={{ fontFamily:"monospace", fontSize:8, color:"#7a8fa8", marginLeft:"auto", flexShrink:0 }}>{fmtDMH(ev._ts)}</span>
                </div>
                <div style={{ fontSize:10, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{ev.message}</div>
                <div style={{ fontSize:9, color:"#7a8fa8", display:"flex", gap:5, flexWrap:"wrap" }}>
                  <span style={{ fontFamily:"monospace", fontWeight:600, color:T.primary }}>{ev.nodeId}</span>
                  {node && <span>{node.vendor} · {node.layer}</span>}
                  <span>{COUNTRY_META[ev.country]?.flag} {ev.country}</span>
                  {ev.changeId && <span style={{ fontFamily:"monospace", fontWeight:600, color:"#d97706" }}>{ev.changeId}</span>}
                </div>
              </div>
            </div>;
          })}
          {sortedEvents.length === 0 && <div style={{ textAlign:"center", padding:20, color:"#7a8fa8", fontSize:11 }}>No events match filters</div>}
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
    style={{ padding:"3px 7px", borderRadius:6, border:"1px solid #dde2ea", fontSize:10, fontWeight:500,
      background:"#f8f9fb", color:"#1a2535", cursor:"pointer", fontFamily:"inherit", maxWidth:170 }}>
    {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
  </select>;
}

function NB({ onClick, children }) {
  return <button onClick={onClick} style={{ fontSize:10, padding:"2px 7px", borderRadius:4, border:"1px solid #dde2ea",
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
