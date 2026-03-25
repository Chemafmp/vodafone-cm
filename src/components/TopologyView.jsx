import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { T } from "../data/constants.js";
import { SITES, COUNTRY_META, LAYERS, LAYER_COLORS } from "../data/inventory/sites.js";
import { NODES } from "../data/inventory/index.js";

// ─── TRAFFIC LOAD COLOR GRADIENT (weathermap style) ─────────────────────────
const LOAD_STEPS = [
  { pct: 0,   color: "#9333ea" },  // purple  0-1%
  { pct: 1,   color: "#6366f1" },  // indigo
  { pct: 10,  color: "#3b82f6" },  // blue    1-10%
  { pct: 25,  color: "#06b6d4" },  // cyan    10-25%
  { pct: 40,  color: "#22c55e" },  // green   25-40%
  { pct: 55,  color: "#84cc16" },  // lime    40-55%
  { pct: 70,  color: "#eab308" },  // yellow  55-70%
  { pct: 80,  color: "#f97316" },  // orange  70-80%
  { pct: 90,  color: "#ef4444" },  // red     80-90%
  { pct: 95,  color: "#dc2626" },  // dark red 90-95%
  { pct: 100, color: "#991b1b" },  // deep red 95-100%
];

function loadColor(pct) {
  if (pct <= 0) return LOAD_STEPS[0].color;
  for (let i = 1; i < LOAD_STEPS.length; i++) {
    if (pct <= LOAD_STEPS[i].pct) {
      const prev = LOAD_STEPS[i - 1];
      const next = LOAD_STEPS[i];
      const t = (pct - prev.pct) / (next.pct - prev.pct);
      return lerpColor(prev.color, next.color, t);
    }
  }
  return LOAD_STEPS[LOAD_STEPS.length - 1].color;
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return `#${((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1)}`;
}

// ─── SEEDED RANDOM (deterministic per-link) ─────────────────────────────────
function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function simTraffic(fromId, toId, speed) {
  const seed = hashStr(fromId + toId);
  // Deterministic pseudo-random 0-1
  const r = ((seed * 9301 + 49297) % 233280) / 233280;
  // Parse speed to Mbps
  const speedMbps = parseSpeed(speed);
  // Load percentage — weighted toward 20-60% with some outliers
  const load = Math.min(100, Math.max(0.5, r < 0.1 ? r * 5 : r < 0.85 ? 15 + r * 55 : 70 + r * 30));
  const bw = (speedMbps * load / 100);
  return { load: Math.round(load * 10) / 10, bwMbps: bw, speedMbps };
}

function parseSpeed(s) {
  if (!s) return 1000;
  const n = parseFloat(s);
  if (s.includes("100G")) return 100000;
  if (s.includes("40G")) return 40000;
  if (s.includes("10G")) return 10000;
  if (s.includes("1G") || s.includes("GE")) return 1000;
  if (n >= 100) return n * 1000;
  return n || 1000;
}

function fmtBw(mbps) {
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(2)}G`;
  if (mbps >= 1) return `${mbps.toFixed(1)}M`;
  return `${(mbps * 1000).toFixed(0)}K`;
}

// ─── EXTRACT LINKS WITH TRAFFIC ─────────────────────────────────────────────
function extractLinks(nodes) {
  const nodeSet = new Set(nodes.map(n => n.id));
  const seen = new Set();
  const links = [];
  nodes.forEach(node => {
    (node.interfaces || []).forEach(iface => {
      if (!iface.peer || !nodeSet.has(iface.peer)) return;
      const key = [node.id, iface.peer].sort().join("↔");
      if (seen.has(key)) return;
      seen.add(key);
      const isDown = iface.operStatus === "DOWN" ||
        nodes.find(n => n.id === iface.peer)?.status === "DOWN" ||
        node.status === "DOWN";
      const traffic = simTraffic(node.id, iface.peer, iface.speed);
      links.push({
        from: node.id, to: iface.peer,
        speed: iface.speed || "1G",
        down: isDown,
        ...traffic,
      });
    });
  });
  return links;
}

// ─── LAYER ORDER ────────────────────────────────────────────────────────────
const LAYER_ORDER = [
  "Internet GW", "IP Core", "Security", "5G Core", "Voice Core",
  "Load Balancer", "DC Fabric", "IP LAN", "BPoP", "Transport",
  "IT Infrastructure", "NMS Platform", "BSS Platform",
];

// ─── SITE-GROUPED LAYOUT ────────────────────────────────────────────────────
function computeLayout(nodes, links) {
  const NODE_R = 22;
  const SITE_PAD = 40;
  const LAYER_GAP = 90;
  const NODE_GAP = 70;
  const PAD = 60;

  // Group by layer
  const byLayer = {};
  nodes.forEach(n => {
    const l = n.layer || "Other";
    if (!byLayer[l]) byLayer[l] = [];
    byLayer[l].push(n);
  });

  const orderedLayers = LAYER_ORDER.filter(l => byLayer[l]);
  Object.keys(byLayer).forEach(l => { if (!orderedLayers.includes(l)) orderedLayers.push(l); });

  // Position: layers top-to-bottom, nodes spread horizontally per layer
  const positions = {};
  let y = PAD;
  let maxX = 0;

  orderedLayers.forEach(layer => {
    const layerNodes = byLayer[layer];
    // Sort by site then id for consistency
    layerNodes.sort((a, b) => (a.siteId || "").localeCompare(b.siteId || "") || a.id.localeCompare(b.id));

    const totalW = layerNodes.length * NODE_GAP;
    const startX = PAD + 140; // leave room for layer label

    layerNodes.forEach((node, i) => {
      const x = startX + i * NODE_GAP + NODE_GAP / 2;
      positions[node.id] = { x, y: y + NODE_R, r: NODE_R, node };
      maxX = Math.max(maxX, x + NODE_R + PAD);
    });

    y += LAYER_GAP;
  });

  const totalW = Math.max(maxX, 800);
  const totalH = y + PAD;

  return { positions, orderedLayers, byLayer, totalW, totalH, PAD };
}

// ─── ROUTER ICON (SVG inline) ───────────────────────────────────────────────
function RouterIcon({ x, y, r, status, isSelected, layer }) {
  const fill = status === "UP" ? "#16a34a" : status === "DEGRADED" ? "#d97706" : "#dc2626";
  const layerCol = LAYER_COLORS[layer] || "#64748b";
  const glow = isSelected ? T.primary : fill;
  return (
    <g>
      {/* Glow ring */}
      {isSelected && (
        <circle cx={x} cy={y} r={r + 6} fill="none" stroke={T.primary} strokeWidth={2}
          strokeDasharray="4,3" opacity={0.6} />
      )}
      {/* Outer ring — layer color */}
      <circle cx={x} cy={y} r={r} fill={layerCol + "18"} stroke={layerCol} strokeWidth={2.5} />
      {/* Inner fill with status */}
      <circle cx={x} cy={y} r={r - 5} fill="#fff" stroke={fill} strokeWidth={1.5} />
      {/* Status dot */}
      <circle cx={x} cy={y} r={4} fill={fill}>
        {status !== "UP" && (
          <animate attributeName="opacity" values="1;0.4;1" dur="1.5s" repeatCount="indefinite" />
        )}
      </circle>
      {/* Router crosshair icon */}
      <line x1={x - r + 8} y1={y} x2={x - r + 12} y2={y} stroke={layerCol} strokeWidth={1.5} />
      <line x1={x + r - 12} y1={y} x2={x + r - 8} y2={y} stroke={layerCol} strokeWidth={1.5} />
      <line x1={x} y1={y - r + 8} x2={x} y2={y - r + 12} stroke={layerCol} strokeWidth={1.5} />
      <line x1={x} y1={y + r - 12} x2={x} y2={y + r - 8} stroke={layerCol} strokeWidth={1.5} />
    </g>
  );
}

// ─── LINK WITH TRAFFIC LABEL ────────────────────────────────────────────────
function TrafficLink({ x1, y1, x2, y2, link, positions }) {
  if (link.down) {
    return (
      <g>
        <line x1={x1} y1={y1} x2={x2} y2={y2}
          stroke="#dc2626" strokeWidth={3} strokeDasharray="8,4" opacity={0.7} />
        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6}
          fill="#dc2626" fontSize={8} fontWeight={700} textAnchor="middle"
          fontFamily="monospace">DOWN</text>
      </g>
    );
  }

  const color = loadColor(link.load);
  const thickness = Math.max(2, Math.min(8, link.load / 15 + 1.5));

  // Midpoint for label
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  // Angle for label rotation
  const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  const flipLabel = angle > 90 || angle < -90;
  const labelAngle = flipLabel ? angle + 180 : angle;

  // Offset label perpendicular to link
  const len = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
  const nx = -(y2 - y1) / len * 9;
  const ny = (x2 - x1) / len * 9;

  return (
    <g>
      {/* Link shadow */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={thickness + 2} opacity={0.15} strokeLinecap="round" />
      {/* Main link */}
      <line x1={x1} y1={y1} x2={x2} y2={y2}
        stroke={color} strokeWidth={thickness} opacity={0.85} strokeLinecap="round" />
      {/* BW label */}
      <g transform={`translate(${mx + nx}, ${my + ny}) rotate(${labelAngle})`}>
        <rect x={-22} y={-7} width={44} height={13} rx={3}
          fill="#000" fillOpacity={0.65} />
        <text x={0} y={3.5} fill="#fff" fontSize={8} fontWeight={700}
          textAnchor="middle" fontFamily="monospace">{fmtBw(link.bwMbps)}</text>
      </g>
      {/* Load % label on other side */}
      <g transform={`translate(${mx - nx}, ${my - ny}) rotate(${labelAngle})`}>
        <rect x={-16} y={-7} width={32} height={13} rx={3}
          fill={color} fillOpacity={0.85} />
        <text x={0} y={3.5} fill="#fff" fontSize={7.5} fontWeight={700}
          textAnchor="middle" fontFamily="monospace">{link.load}%</text>
      </g>
    </g>
  );
}

// ─── NODE POPUP ─────────────────────────────────────────────────────────────
function NodePopup({ node, screenX, screenY, onClose }) {
  const bgColor = node.status === "UP" ? "#16a34a" : node.status === "DEGRADED" ? "#d97706" : "#dc2626";
  return (
    <div onClick={e => e.stopPropagation()} style={{
      position: "absolute", left: screenX, top: screenY + 30,
      background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10,
      boxShadow: "0 8px 30px rgba(0,0,0,0.18)", padding: "12px 16px",
      minWidth: 280, zIndex: 200, fontSize: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: bgColor,
          boxShadow: `0 0 6px ${bgColor}80` }} />
        <span style={{ fontWeight: 800, fontFamily: "monospace", color: T.text, fontSize: 13 }}>
          {node.hostname}
        </span>
        <button onClick={onClose} style={{ marginLeft: "auto", background: "none", border: "none",
          cursor: "pointer", color: T.muted, fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {[
          ["Vendor", node.vendor],
          ["Model", node.hwModel],
          ["Mgmt IP", node.mgmtIp],
          ["OS", node.osVersion || "—"],
          ["Layer", node.layer],
          ["Status", node.status],
          ["Site", node.siteId],
          ["Role", node.role || "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, textTransform: "uppercase",
              letterSpacing: "0.5px" }}>{k}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text,
              fontFamily: k === "Mgmt IP" ? "monospace" : "inherit" }}>{v}</div>
          </div>
        ))}
      </div>
      {/* Interfaces summary */}
      <div style={{ marginTop: 8, borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, textTransform: "uppercase",
          letterSpacing: "0.5px", marginBottom: 4 }}>Interfaces ({(node.interfaces || []).length})</div>
        {(node.interfaces || []).slice(0, 5).map((iface, i) => (
          <div key={i} style={{ fontSize: 10, color: T.muted, display: "flex", gap: 6, lineHeight: 1.6 }}>
            <span style={{ fontFamily: "monospace", color: T.text, minWidth: 100 }}>{iface.name}</span>
            <span style={{ color: iface.operStatus === "UP" ? "#16a34a" : iface.operStatus === "DOWN" ? "#dc2626" : T.muted }}>
              ● {iface.operStatus}
            </span>
            <span>{iface.speed}</span>
          </div>
        ))}
        {(node.interfaces || []).length > 5 && (
          <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
            +{(node.interfaces || []).length - 5} more…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── LEGEND ─────────────────────────────────────────────────────────────────
function WmLegend() {
  const steps = [0, 1, 10, 25, 40, 55, 70, 80, 90, 95, 100];
  return (
    <div style={{
      position: "absolute", bottom: 12, left: 12, background: "#ffffffee",
      border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 14px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)", zIndex: 50,
    }}>
      <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, textTransform: "uppercase",
        letterSpacing: "0.5px", marginBottom: 6 }}>Traffic Load</div>
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {steps.slice(0, -1).map((pct, i) => (
          <div key={i} style={{
            width: 28, height: 14, background: loadColor((pct + steps[i + 1]) / 2),
            borderRadius: i === 0 ? "3px 0 0 3px" : i === steps.length - 2 ? "0 3px 3px 0" : 0,
          }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 0, marginTop: 2 }}>
        {steps.map((pct, i) => (
          <div key={i} style={{
            width: i === 0 || i === steps.length - 1 ? 14 : 28, fontSize: 7, color: T.muted,
            textAlign: i === 0 ? "left" : i === steps.length - 1 ? "right" : "center",
            fontFamily: "monospace", fontWeight: 600,
          }}>{pct}%</div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 9, color: T.muted }}>
        <span style={{ display: "flex", alignItems: "center", gap: 3 }}>
          <svg width={16} height={8}><line x1={0} y1={4} x2={16} y2={4} stroke="#dc2626" strokeWidth={3} strokeDasharray="4,2" /></svg>
          Down
        </span>
        <span>Scroll = zoom</span>
        <span>Drag = pan</span>
      </div>
    </div>
  );
}

// ─── MAIN TOPOLOGY VIEW ─────────────────────────────────────────────────────
export default function TopologyView() {
  const [country, setCountry] = useState("FJ");
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const containerRef = useRef(null);

  const meta = COUNTRY_META[country];
  const countryNodes = useMemo(() => NODES.filter(n => n.country === country), [country]);
  const links = useMemo(() => extractLinks(countryNodes), [countryNodes]);
  const layout = useMemo(() => computeLayout(countryNodes, links), [countryNodes, links]);

  const selectedNode = selectedNodeId ? countryNodes.find(n => n.id === selectedNodeId) : null;
  const selectedPos = selectedNodeId ? layout.positions[selectedNodeId] : null;

  // Aggregate traffic per node (sum of link bw for connected links)
  const nodeTraffic = useMemo(() => {
    const m = {};
    links.forEach(l => {
      if (!l.down) {
        m[l.from] = (m[l.from] || 0) + l.bwMbps;
        m[l.to] = (m[l.to] || 0) + l.bwMbps;
      }
    });
    return m;
  }, [links]);

  function switchCountry(c) {
    setCountry(c);
    setSelectedNodeId(null);
    setTransform({ x: 0, y: 0, scale: 1 });
  }

  // Zoom with scroll wheel
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform(t => {
      const newScale = Math.max(0.2, Math.min(4, t.scale * delta));
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, scale: newScale };
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      return {
        scale: newScale,
        x: mx - (mx - t.x) * (newScale / t.scale),
        y: my - (my - t.y) * (newScale / t.scale),
      };
    });
  }, []);

  // Pan with mouse drag
  const handleMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setDragging(true);
    setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
  }, [transform]);

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !dragStart) return;
    setTransform(t => ({ ...t, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
  }, [dragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
    setDragStart(null);
  }, []);

  // Attach wheel listener with passive:false
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // Fit to screen
  function fitToScreen() {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return; // not mounted yet
    const scaleX = rect.width / layout.totalW;
    const scaleY = rect.height / layout.totalH;
    const scale = Math.min(scaleX, scaleY, 1.5) * 0.88;
    setTransform({
      scale: Math.max(0.15, scale),
      x: (rect.width - layout.totalW * scale) / 2,
      y: Math.max(8, (rect.height - layout.totalH * scale) / 2),
    });
  }

  // Fit on country change
  useEffect(() => {
    const timer = setTimeout(fitToScreen, 150);
    return () => clearTimeout(timer);
  }, [country, layout]);

  // Health & traffic summary
  const health = useMemo(() => ({
    up: countryNodes.filter(n => n.status === "UP").length,
    degraded: countryNodes.filter(n => n.status === "DEGRADED").length,
    down: countryNodes.filter(n => n.status === "DOWN").length,
  }), [countryNodes]);

  const avgLoad = useMemo(() => {
    const active = links.filter(l => !l.down);
    if (!active.length) return 0;
    return Math.round(active.reduce((s, l) => s + l.load, 0) / active.length);
  }, [links]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ── Country Tabs + Controls ── */}
      <div style={{ display: "flex", alignItems: "stretch", borderBottom: `1px solid ${T.border}`,
        background: T.surface, flexShrink: 0 }}>
        {Object.entries(COUNTRY_META).map(([code, m]) => {
          const cn = NODES.filter(n => n.country === code);
          const iss = cn.filter(n => n.status !== "UP").length;
          const act = country === code;
          return (
            <button key={code} onClick={() => switchCountry(code)} style={{
              padding: "10px 22px", border: "none", cursor: "pointer",
              background: act ? T.bg : "transparent",
              borderBottom: act ? `3px solid ${T.primary}` : "3px solid transparent",
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10,
              transition: "all 0.15s" }}>
              <span style={{ fontSize: 18 }}>{m.flag}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: act ? 800 : 600,
                  color: act ? T.text : T.muted }}>{m.name}</div>
                <div style={{ fontSize: 10, color: iss > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                  {iss > 0 ? `${iss} issue${iss > 1 ? "s" : ""}` : `${cn.length} nodes`}
                </div>
              </div>
            </button>
          );
        })}

        {/* Controls */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "0 16px" }}>
          {/* Health dots */}
          {[["UP", health.up, "#16a34a"], ["DEG", health.degraded, "#d97706"],
            ["DOWN", health.down, "#dc2626"]].map(([l, c, col]) => c > 0 && (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{c}</span>
              <span style={{ fontSize: 9, color: T.muted }}>{l}</span>
            </div>
          ))}
          <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
            {links.length} links · avg {avgLoad}%
          </span>
          <div style={{ display: "flex", gap: 2 }}>
            <button onClick={fitToScreen} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 600,
              border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface,
              color: T.muted, cursor: "pointer", fontFamily: "inherit" }}>Fit</button>
            <button onClick={() => setTransform(t => ({ ...t, scale: Math.min(4, t.scale * 1.3) }))}
              style={{ padding: "3px 8px", fontSize: 12, border: `1px solid ${T.border}`,
                borderRadius: 5, background: T.surface, color: T.muted, cursor: "pointer" }}>+</button>
            <button onClick={() => setTransform(t => ({ ...t, scale: Math.max(0.2, t.scale * 0.7) }))}
              style={{ padding: "3px 8px", fontSize: 12, border: `1px solid ${T.border}`,
                borderRadius: 5, background: T.surface, color: T.muted, cursor: "pointer" }}>−</button>
          </div>
          <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
            {Math.round(transform.scale * 100)}%
          </span>
        </div>
      </div>

      {/* ── Canvas ── */}
      <div ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={() => setSelectedNodeId(null)}
        style={{ flex: 1, overflow: "hidden", position: "relative",
          cursor: dragging ? "grabbing" : "grab",
          background: "#0f172a",
          backgroundImage: "radial-gradient(circle, #1e293b 1px, transparent 1px)",
          backgroundSize: "24px 24px" }}>

        <svg
          width="100%" height="100%"
          style={{ position: "absolute", top: 0, left: 0 }}
        >
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>

            {/* Layer labels (left side) */}
            {layout.orderedLayers.map(layer => {
              const layerNodes = layout.byLayer[layer];
              if (!layerNodes?.length) return null;
              const firstPos = layout.positions[layerNodes[0].id];
              if (!firstPos) return null;
              return (
                <g key={layer}>
                  <text x={16} y={firstPos.y + 4}
                    fill={LAYER_COLORS[layer] || "#94a3b8"} fontSize={10} fontWeight={700}
                    fontFamily="system-ui, sans-serif" opacity={0.7}
                    textAnchor="start">
                    {layer.toUpperCase()}
                  </text>
                  {/* Faint horizontal line */}
                  <line x1={layout.PAD + 130} y1={firstPos.y}
                    x2={layout.totalW - layout.PAD} y2={firstPos.y}
                    stroke={LAYER_COLORS[layer] || "#94a3b8"} strokeWidth={0.5} opacity={0.12} />
                </g>
              );
            })}

            {/* Links with traffic */}
            {links.map((link, i) => {
              const from = layout.positions[link.from];
              const to = layout.positions[link.to];
              if (!from || !to) return null;
              return (
                <TrafficLink key={i}
                  x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                  link={link} positions={layout.positions} />
              );
            })}

            {/* Nodes */}
            {Object.entries(layout.positions).map(([id, pos]) => {
              const node = pos.node;
              const isSel = selectedNodeId === id;
              const traffic = nodeTraffic[id] || 0;
              return (
                <g key={id}
                  onClick={(e) => { e.stopPropagation(); setSelectedNodeId(isSel ? null : id); }}
                  style={{ cursor: "pointer" }}>
                  <RouterIcon x={pos.x} y={pos.y} r={pos.r}
                    status={node.status} isSelected={isSel} layer={node.layer} />
                  {/* Hostname label */}
                  <text x={pos.x} y={pos.y + pos.r + 13}
                    fill="#e2e8f0" fontSize={8} fontWeight={700}
                    textAnchor="middle" fontFamily="monospace">
                    {node.id.replace(/^(fj|hw|ib)-/, "").replace(/(town|santantoni|santaeulalia|escanar|portinatx|hnl1|hnl2|maui|suva|lautoka)-/, "")}
                  </text>
                  {/* Traffic total label */}
                  {traffic > 0 && (
                    <text x={pos.x} y={pos.y + pos.r + 23}
                      fill="#94a3b8" fontSize={7} fontWeight={600}
                      textAnchor="middle" fontFamily="monospace">
                      {fmtBw(traffic)}
                    </text>
                  )}
                </g>
              );
            })}

          </g>
        </svg>

        {/* Popup (HTML overlay) */}
        {selectedNode && selectedPos && (
          <NodePopup node={selectedNode}
            screenX={selectedPos.x * transform.scale + transform.x}
            screenY={selectedPos.y * transform.scale + transform.y}
            onClose={() => setSelectedNodeId(null)} />
        )}

        {/* Legend */}
        <WmLegend />

        {/* Network title overlay */}
        <div style={{
          position: "absolute", top: 12, right: 16,
          background: "#0f172aee", border: "1px solid #334155",
          borderRadius: 8, padding: "8px 14px", zIndex: 50,
        }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#e2e8f0", letterSpacing: "-0.3px" }}>
            {meta.flag} {meta.name} Weathermap
          </div>
          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "monospace", marginTop: 2 }}>
            {meta.asn} · {countryNodes.length} nodes · {links.length} links
          </div>
        </div>
      </div>
    </div>
  );
}
