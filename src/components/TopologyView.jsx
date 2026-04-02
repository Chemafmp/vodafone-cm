import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { T } from "../data/constants.js";
import { SITES, COUNTRY_META, LAYERS, LAYER_COLORS } from "../data/inventory/sites.js";
import { SERVICES } from "../data/inventory/services.js";
import { useNodes } from "../context/NodesContext.jsx";
import NodeFormModal from "./NodeFormModal.jsx";

// ─── ICON MAP ────────────────────────────────────────────────────────────────
const ICON_MAP = {
  cr: "router", pe: "router", igw: "router", asr: "router",
  fw: "firewall", waf: "firewall",
  lb: "loadbalancer",
  dns: "server", ntp: "server", aaa: "server", nms: "server",
  bss: "server", oss: "server",
  "5gc": "fiveg", amf: "fiveg", smf: "fiveg", upf: "fiveg",
  "voip-gw": "phone",
  "dc-fabric": "switch", "distr-sw": "switch", "acc-sw": "switch",
  bpop: "antenna", apop: "antenna",
  "IP Core": "router", "Internet GW": "router", "Transport": "router",
  "Security": "firewall", "Load Balancer": "loadbalancer",
  "5G Core": "fiveg", "Voice Core": "phone",
  "DC Fabric": "switch", "IP LAN": "switch",
  "BPoP": "antenna", "APoP": "antenna",
  "IT Infrastructure": "server", "NMS Platform": "server", "BSS Platform": "server",
};

function getIconType(node) {
  if (node._isCloud) return "cloud";
  return ICON_MAP[node.role] || ICON_MAP[node.layer] || "router";
}

// ─── LAYER ORDER FOR LAYOUT ──────────────────────────────────────────────────
const LAYER_ORDER = [
  "_cloud",
  "Internet GW", "IP Core", "Security", "5G Core", "Voice Core",
  "Load Balancer", "DC Fabric", "IP LAN", "BPoP", "APoP", "Transport",
  "IT Infrastructure", "NMS Platform", "BSS Platform",
];

// ─── CISCO-STYLE SVG ICONS ──────────────────────────────────────────────────

function RouterIcon({ color }) {
  // Classic Cisco router: barrel/cylinder with arrows
  return (
    <g>
      {/* Main body - rounded rectangle */}
      <rect x="-18" y="-10" width="36" height="20" rx="4" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      {/* Inner core */}
      <rect x="-12" y="-6" width="24" height="12" rx="2" fill={color} opacity="0.3"/>
      {/* Left arrow */}
      <polygon points="-22,-4 -22,4 -28,0" fill={color} opacity="0.8"/>
      {/* Right arrow */}
      <polygon points="22,-4 22,4 28,0" fill={color} opacity="0.8"/>
      {/* Crosshair lines */}
      <line x1="-8" y1="0" x2="8" y2="0" stroke={color} strokeWidth="1.2" opacity="0.6"/>
      <line x1="0" y1="-5" x2="0" y2="5" stroke={color} strokeWidth="1.2" opacity="0.6"/>
      {/* Port dots */}
      <circle cx="-6" cy="-3" r="1.2" fill={color} opacity="0.7"/>
      <circle cx="6" cy="-3" r="1.2" fill={color} opacity="0.7"/>
      <circle cx="-6" cy="3" r="1.2" fill={color} opacity="0.7"/>
      <circle cx="6" cy="3" r="1.2" fill={color} opacity="0.7"/>
    </g>
  );
}

function SwitchIcon({ color }) {
  // Classic Cisco switch: rectangle with arrows in 4 directions
  return (
    <g>
      <rect x="-16" y="-10" width="32" height="20" rx="3" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      <rect x="-10" y="-6" width="20" height="12" rx="1.5" fill={color} opacity="0.25"/>
      {/* Four directional arrows */}
      <polygon points="0,-14 -3,-10 3,-10" fill={color} opacity="0.8"/>
      <polygon points="0,14 -3,10 3,10" fill={color} opacity="0.8"/>
      <polygon points="-20,0 -16,-3 -16,3" fill={color} opacity="0.8"/>
      <polygon points="20,0 16,-3 16,3" fill={color} opacity="0.8"/>
      {/* Port grid */}
      {[-6, -2, 2, 6].map(x => (
        <rect key={x} x={x - 1} y="-3" width="2" height="6" rx="0.5" fill={color} opacity="0.4"/>
      ))}
    </g>
  );
}

function FirewallIcon({ color }) {
  // Cisco firewall: wall with brick pattern
  const c = color || "#dc2626";
  return (
    <g>
      <rect x="-16" y="-12" width="32" height="24" rx="2" fill={c} opacity="0.12" stroke={c} strokeWidth="1.5"/>
      {/* Brick rows */}
      {[-8, -2, 4].map((y, row) => (
        <g key={y}>
          {(row % 2 === 0 ? [-12, -2, 8] : [-7, 3]).map((x, i) => (
            <rect key={i} x={x} y={y} width={row % 2 === 0 ? 8 : 12} height="4.5" rx="0.5" fill={c} opacity="0.35"/>
          ))}
        </g>
      ))}
      {/* Flame accent on top */}
      <path d="M0,-14 Q3,-10 1,-8 Q4,-10 2,-14 Q1,-11 0,-14Z" fill="#f59e0b" opacity="0.7"/>
    </g>
  );
}

function ServerIcon({ color }) {
  // Classic server rack: stacked horizontal bars
  return (
    <g>
      <rect x="-14" y="-14" width="28" height="28" rx="3" fill={color} opacity="0.1" stroke={color} strokeWidth="1.5"/>
      {/* Three rack units */}
      {[-9, -2, 5].map((y, i) => (
        <g key={i}>
          <rect x="-10" y={y} width="20" height="5.5" rx="1" fill={color} opacity="0.3"/>
          <circle cx="-6" cy={y + 2.75} r="1" fill={color} opacity="0.7"/>
          <rect x="2" y={y + 1} width="6" height="3.5" rx="0.5" fill={color} opacity="0.15"/>
        </g>
      ))}
    </g>
  );
}

function FiveGIcon({ color }) {
  // Cell tower with signal waves
  return (
    <g>
      {/* Tower base */}
      <polygon points="-8,14 8,14 4,-6 -4,-6" fill={color} opacity="0.2" stroke={color} strokeWidth="1.2"/>
      {/* Tower top */}
      <rect x="-2" y="-12" width="4" height="8" rx="1" fill={color} opacity="0.5"/>
      {/* Signal waves */}
      <path d="M6,-10 Q12,-6 6,-2" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5"/>
      <path d="M9,-12 Q18,-6 9,0" fill="none" stroke={color} strokeWidth="1" opacity="0.35"/>
      <path d="M-6,-10 Q-12,-6 -6,-2" fill="none" stroke={color} strokeWidth="1.2" opacity="0.5"/>
      <path d="M-9,-12 Q-18,-6 -9,0" fill="none" stroke={color} strokeWidth="1" opacity="0.35"/>
      {/* 5G label */}
      <text x="0" y="10" fill={color} fontSize="7" fontWeight="800" textAnchor="middle" fontFamily="monospace" opacity="0.8">5G</text>
    </g>
  );
}

function PhoneIcon({ color }) {
  // VoIP handset
  return (
    <g>
      {/* Phone body */}
      <rect x="-12" y="-8" width="24" height="16" rx="3" fill={color} opacity="0.15" stroke={color} strokeWidth="1.5"/>
      {/* Screen */}
      <rect x="-8" y="-5" width="10" height="10" rx="1" fill={color} opacity="0.25"/>
      {/* Keypad dots */}
      {[5, 9].map(x => [-3, 0, 3].map(y => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="1" fill={color} opacity="0.5"/>
      )))}
      {/* Handset */}
      <path d="M-14,-4 Q-16,0 -14,4" fill="none" stroke={color} strokeWidth="2" opacity="0.6" strokeLinecap="round"/>
    </g>
  );
}

function LoadBalancerIcon({ color }) {
  // Horizontal bar splitting to multiple paths
  return (
    <g>
      {/* Central bar */}
      <rect x="-18" y="-4" width="36" height="8" rx="3" fill={color} opacity="0.2" stroke={color} strokeWidth="1.5"/>
      {/* Arrow in */}
      <line x1="-24" y1="0" x2="-18" y2="0" stroke={color} strokeWidth="1.5" opacity="0.6"/>
      <polygon points="-18,-2 -18,2 -14,0" fill={color} opacity="0.6"/>
      {/* Arrows out (fan) */}
      {[-8, 0, 8].map((dy, i) => (
        <g key={i}>
          <line x1="18" y1="0" x2="26" y2={dy} stroke={color} strokeWidth="1.2" opacity="0.5"/>
          <circle cx="27" cy={dy} r="1.5" fill={color} opacity="0.6"/>
        </g>
      ))}
      {/* Balance symbol */}
      <text x="0" y="3" fill={color} fontSize="6" fontWeight="800" textAnchor="middle" fontFamily="monospace" opacity="0.6">LB</text>
    </g>
  );
}

function AntennaIcon({ color }) {
  // Radio tower with signal arcs
  return (
    <g>
      {/* Tower */}
      <line x1="0" y1="-14" x2="0" y2="12" stroke={color} strokeWidth="2" opacity="0.5"/>
      <line x1="-8" y1="12" x2="8" y2="12" stroke={color} strokeWidth="2" opacity="0.5" strokeLinecap="round"/>
      {/* Cross beams */}
      <line x1="-5" y1="0" x2="5" y2="0" stroke={color} strokeWidth="1.2" opacity="0.4"/>
      <line x1="-3" y1="-6" x2="3" y2="-6" stroke={color} strokeWidth="1" opacity="0.3"/>
      {/* Top antenna */}
      <circle cx="0" cy="-14" r="2.5" fill={color} opacity="0.5"/>
      {/* Signal arcs */}
      <path d="M4,-16 Q10,-12 4,-8" fill="none" stroke={color} strokeWidth="1" opacity="0.4"/>
      <path d="M7,-18 Q16,-12 7,-6" fill="none" stroke={color} strokeWidth="0.8" opacity="0.25"/>
      <path d="M-4,-16 Q-10,-12 -4,-8" fill="none" stroke={color} strokeWidth="1" opacity="0.4"/>
    </g>
  );
}

function CloudIcon({ color }) {
  return (
    <g>
      <ellipse cx="0" cy="-2" rx="22" ry="12" fill={color || "#475569"} opacity="0.1" stroke={color || "#475569"} strokeWidth="1.5"/>
      <ellipse cx="-8" cy="-4" rx="10" ry="7" fill={color || "#475569"} opacity="0.08"/>
      <ellipse cx="8" cy="-3" rx="11" ry="8" fill={color || "#475569"} opacity="0.08"/>
      <text x="0" y="2" fill={color || "#475569"} fontSize="7" fontWeight="700" textAnchor="middle" fontFamily="system-ui" opacity="0.7">ISP</text>
    </g>
  );
}

const ICON_COMPONENTS = {
  router: RouterIcon,
  switch: SwitchIcon,
  firewall: FirewallIcon,
  server: ServerIcon,
  fiveg: FiveGIcon,
  phone: PhoneIcon,
  loadbalancer: LoadBalancerIcon,
  antenna: AntennaIcon,
  cloud: CloudIcon,
};

// ─── DEVICE PALETTE ─────────────────────────────────────────────────────────
const PALETTE_ITEMS = [
  { label:"Router",    iconType:"router",       role:"cr",       layer:"IP Core" },
  { label:"PE Router", iconType:"router",       role:"pe",       layer:"IP Core" },
  { label:"IGW",       iconType:"router",       role:"igw",      layer:"Internet GW" },
  { label:"Switch L2", iconType:"switch",       role:"acc-sw",   layer:"IP LAN" },
  { label:"Switch L3", iconType:"switch",       role:"distr-sw", layer:"DC Fabric" },
  { label:"DC Fabric", iconType:"switch",       role:"dc-fabric",layer:"DC Fabric" },
  { label:"Firewall",  iconType:"firewall",     role:"fw",       layer:"Security" },
  { label:"Load Bal.", iconType:"loadbalancer", role:"lb",       layer:"Load Balancer" },
  { label:"5G Core",   iconType:"fiveg",        role:"5gc",      layer:"5G Core" },
  { label:"VoIP GW",   iconType:"phone",        role:"voip-gw",  layer:"Voice Core" },
  { label:"BPoP",      iconType:"antenna",      role:"bpop",     layer:"BPoP" },
  { label:"APoP",      iconType:"antenna",      role:"apop",     layer:"APoP" },
  { label:"Server",    iconType:"server",       role:"nms",      layer:"IT Infrastructure" },
  { label:"DNS",       iconType:"server",       role:"dns",      layer:"IT Infrastructure" },
];

// ─── STATUS COLORS ──────────────────────────────────────────────────────────
const STATUS_COLOR = { UP: "#22c55e", DEGRADED: "#f59e0b", DOWN: "#ef4444" };

// ─── LINK EXTRACTION ────────────────────────────────────────────────────────
function extractLinks(nodes) {
  const nodeSet = new Set(nodes.map(n => n.id));
  const seen = new Set();
  const links = [];
  nodes.forEach(node => {
    if (node._isCloud) return;
    (node.interfaces || []).forEach(iface => {
      if (!iface.peer || !nodeSet.has(iface.peer)) return;
      const key = [node.id, iface.peer].sort().join("↔");
      if (seen.has(key)) return;
      seen.add(key);
      const peerNode = nodes.find(n => n.id === iface.peer);
      const isDown = iface.operStatus === "DOWN" || peerNode?.status === "DOWN" || node.status === "DOWN";
      const isDegraded = node.status === "DEGRADED" || peerNode?.status === "DEGRADED";
      links.push({
        from: node.id,
        to: iface.peer,
        speed: iface.speed || "1G",
        ifaceName: iface.name,
        ifaceIp: iface.ip,
        down: isDown,
        degraded: isDegraded,
        operDown: iface.operStatus === "DOWN",
      });
    });
  });
  return links;
}

function linkColor(link) {
  if (link.operDown || link.down) return "#94a3b8";
  if (link.degraded) return "#f59e0b";
  return "#22c55e";
}

function linkWidth(speed) {
  if (!speed) return 2;
  if (speed.includes("100G")) return 4;
  if (speed.includes("10G")) return 3;
  return 2;
}

// ─── HIERARCHICAL AUTO-LAYOUT ───────────────────────────────────────────────
function computeAutoLayout(nodes, canvasW) {
  const byLayer = {};
  nodes.forEach(n => {
    const l = n._isCloud ? "_cloud" : (n.layer || "Other");
    if (!byLayer[l]) byLayer[l] = [];
    byLayer[l].push(n);
  });

  const ordered = LAYER_ORDER.filter(l => byLayer[l]);
  Object.keys(byLayer).forEach(l => { if (!ordered.includes(l)) ordered.push(l); });

  const positions = {};
  const layerCount = ordered.length || 1;
  const LAYER_GAP = layerCount > 10 ? 60 : 80;
  const NODE_MIN_GAP = 65;
  let y = 30;
  const cx = Math.max(canvasW / 2, 400);

  ordered.forEach(layer => {
    const layerNodes = byLayer[layer];
    layerNodes.sort((a, b) => (a.siteId || "").localeCompare(b.siteId || "") || a.id.localeCompare(b.id));
    const count = layerNodes.length;
    const totalW = (count - 1) * NODE_MIN_GAP;
    const startX = cx - totalW / 2;
    layerNodes.forEach((node, i) => {
      positions[node.id] = { x: startX + i * NODE_MIN_GAP, y };
    });
    y += LAYER_GAP;
  });

  return positions;
}

// ─── STORAGE ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "topology-positions";

function loadPositions() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function savePositions(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

// ─── NODE DETAIL PANEL ──────────────────────────────────────────────────────
function NodeDetailPanel({ node, onClose }) {
  if (!node || node._isCloud) return null;
  const statusCol = STATUS_COLOR[node.status] || "#94a3b8";
  const layerCol = LAYER_COLORS[node.layer] || "#64748b";
  const iconType = getIconType(node);

  const nodeServices = SERVICES.filter(s => s.nodes?.includes(node.id));

  return (
    <div style={{
      width: 280, height: "100%", background: T.surface, borderLeft: `1px solid ${T.border}`,
      overflowY: "auto", flexShrink: 0, fontSize: 12,
    }}>
      {/* Header */}
      <div style={{ padding: "16px 14px 12px", borderBottom: `1px solid ${T.border}`, background: T.primaryBg }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="36" height="36" viewBox="-30 -20 60 40">
              {(() => { const Ic = ICON_COMPONENTS[iconType]; return Ic ? <Ic color={layerCol}/> : null; })()}
            </svg>
            <div>
              <div style={{ fontWeight: 800, fontFamily: "monospace", fontSize: 12, color: T.text }}>{node.id}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusCol, boxShadow: `0 0 6px ${statusCol}60` }}/>
                <span style={{ fontSize: 10, fontWeight: 700, color: statusCol }}>{node.status}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer", color: T.muted, fontSize: 20, lineHeight: 1, padding: "0 4px",
          }}>&times;</button>
        </div>
      </div>

      {/* Properties */}
      <div style={{ padding: "10px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px" }}>
          {[
            ["Vendor", node.vendor], ["Model", node.hwModel],
            ["OS", node.osVersion || "---"], ["Layer", node.layer],
            ["Site", node.siteId || "---"], ["Role", node.role || "---"],
            ["Serial", node.serialNumber || "---"],
          ].map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{k}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{v}</div>
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>Mgmt IP</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text, fontFamily: "monospace" }}>{node.mgmtIp || "---"}</div>
          </div>
        </div>
      </div>

      {/* Interfaces */}
      {(node.interfaces || []).length > 0 && (
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
            Interfaces ({node.interfaces.length})
          </div>
          <div style={{ maxHeight: 160, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ color: T.muted, fontWeight: 700, fontSize: 9 }}>
                  <td style={{ padding: "2px 4px" }}>Name</td>
                  <td>Status</td>
                  <td>Speed</td>
                </tr>
              </thead>
              <tbody>
                {node.interfaces.map((iface, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${T.border}08` }}>
                    <td style={{ padding: "2px 4px", fontFamily: "monospace", color: T.text, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{iface.name}</td>
                    <td style={{ color: iface.operStatus === "UP" ? "#22c55e" : iface.operStatus === "DOWN" ? "#ef4444" : T.muted, fontWeight: 600 }}>
                      {iface.operStatus}
                    </td>
                    <td style={{ color: T.muted }}>{iface.speed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BGP Neighbors */}
      {(node.bgpNeighbors || []).length > 0 && (
        <div style={{ padding: "0 14px 10px" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
            BGP Neighbors ({node.bgpNeighbors.length})
          </div>
          <div style={{ maxHeight: 120, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ color: T.muted, fontWeight: 700, fontSize: 9 }}>
                  <td style={{ padding: "2px 4px" }}>Peer</td>
                  <td>ASN</td>
                  <td>State</td>
                </tr>
              </thead>
              <tbody>
                {node.bgpNeighbors.map((bgp, i) => (
                  <tr key={i}>
                    <td style={{ padding: "2px 4px", fontFamily: "monospace", color: T.text }}>{bgp.peer}</td>
                    <td style={{ color: T.muted }}>{bgp.asn}</td>
                    <td style={{ color: bgp.state === "Established" ? "#22c55e" : "#ef4444", fontWeight: 600, fontSize: 9 }}>{bgp.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Services */}
      {nodeServices.length > 0 && (
        <div style={{ padding: "0 14px 14px" }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 4, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
            Services ({nodeServices.length})
          </div>
          {nodeServices.map(svc => (
            <div key={svc.id} style={{ fontSize: 10, padding: "3px 0", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: svc.criticality === "Critical" ? "#dc2626" : svc.criticality === "High" ? "#d97706" : "#3b82f6" }}/>
              <span style={{ color: T.text, fontWeight: 600 }}>{svc.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── LINK TOOLTIP ───────────────────────────────────────────────────────────
function LinkTooltip({ link, x, y }) {
  return (
    <div style={{
      position: "absolute", left: x + 12, top: y - 10,
      background: "#fffffff5", border: "1px solid #c8d0da", borderRadius: 6,
      padding: "8px 10px", fontSize: 10, color: "#1e293b", zIndex: 300,
      pointerEvents: "none", whiteSpace: "nowrap", fontFamily: "monospace",
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    }}>
      <div style={{ fontWeight: 700, marginBottom: 3 }}>{link.from} &harr; {link.to}</div>
      <div style={{ color: "#94a3b8" }}>
        <span>Speed: {link.speed}</span>
        {link.ifaceName && <span> &middot; {link.ifaceName}</span>}
      </div>
      {link.ifaceIp && <div style={{ color: "#94a3b8" }}>IP: {link.ifaceIp}</div>}
      <div style={{ color: link.down || link.operDown ? "#ef4444" : link.degraded ? "#f59e0b" : "#22c55e", fontWeight: 700, marginTop: 2 }}>
        {link.down || link.operDown ? "DOWN" : link.degraded ? "DEGRADED" : "UP"}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function TopologyView() {
  const { nodes: NODES, addNode } = useNodes();
  const [country, setCountry] = useState("IB");
  const [positions, setPositions] = useState({});
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1.0 });
  const [dragging, setDragging] = useState(null); // { nodeId, offsetX, offsetY }
  const [panning, setPanning] = useState(null); // { startX, startY, startTx, startTy }
  const [showLabels, setShowLabels] = useState(true);
  const [showLinkInfo, setShowLinkInfo] = useState(false);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [addFormData, setAddFormData] = useState(null);
  const containerRef = useRef(null);
  const svgRef = useRef(null);

  const meta = COUNTRY_META[country];

  // Build country nodes + virtual ISP cloud
  const countryNodes = useMemo(() => {
    const real = NODES.filter(n => n.country === country);
    const cloud = {
      id: `${country.toLowerCase()}-isp-cloud`,
      _isCloud: true, hostname: "ISP / Internet", layer: "_cloud", role: "cloud",
      status: "UP", vendor: "Internet", hwModel: "", mgmtIp: "", country,
      interfaces: [], bgpNeighbors: [], services: [],
    };
    // Connect IGW nodes to cloud
    const igwNodes = real.filter(n => n.layer === "Internet GW" || n.role === "igw");
    cloud.interfaces = igwNodes.map(n => ({
      name: `to-${n.id}`, peer: n.id, operStatus: "UP", speed: "100G",
    }));
    // Add reverse interfaces on IGW nodes
    const enriched = real.map(n => {
      if (n.layer === "Internet GW" || n.role === "igw") {
        return {
          ...n,
          interfaces: [
            ...(n.interfaces || []),
            { name: `to-isp`, peer: cloud.id, operStatus: "UP", speed: "100G", ip: "", description: "To ISP Cloud" },
          ],
        };
      }
      return n;
    });
    return [cloud, ...enriched];
  }, [country, NODES]);

  const links = useMemo(() => extractLinks(countryNodes), [countryNodes]);

  // Auto-layout computation
  const autoLayout = useMemo(() => {
    const el = containerRef.current;
    const w = el ? el.clientWidth : 1200;
    return computeAutoLayout(countryNodes, w);
  }, [countryNodes]);

  // Initialize positions from storage or auto-layout
  useEffect(() => {
    const saved = loadPositions();
    const countryPositions = saved[country] || {};
    const merged = {};
    Object.keys(autoLayout).forEach(id => {
      merged[id] = countryPositions[id] || autoLayout[id];
    });
    setPositions(merged);
    setSelectedNodeId(null);
  }, [country, autoLayout]);

  // Save position on drag end
  const saveCurrentPositions = useCallback((newPositions) => {
    const all = loadPositions();
    all[country] = newPositions;
    savePositions(all);
  }, [country]);

  // Health summary
  const health = useMemo(() => {
    const real = countryNodes.filter(n => !n._isCloud);
    return {
      up: real.filter(n => n.status === "UP").length,
      degraded: real.filter(n => n.status === "DEGRADED").length,
      down: real.filter(n => n.status === "DOWN").length,
      total: real.length,
    };
  }, [countryNodes]);

  // Selected node
  const selectedNode = useMemo(
    () => selectedNodeId ? countryNodes.find(n => n.id === selectedNodeId) : null,
    [selectedNodeId, countryNodes]
  );

  // ─── Transform helpers ────────────────────────────────────────────────────
  const screenToSvg = useCallback((clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale,
    };
  }, [transform]);

  // ─── DRAG HANDLERS ────────────────────────────────────────────────────────
  const handleNodeMouseDown = useCallback((e, nodeId) => {
    e.stopPropagation();
    e.preventDefault();
    const svgPt = screenToSvg(e.clientX, e.clientY);
    const pos = positions[nodeId];
    if (!pos) return;
    setDragging({
      nodeId,
      offsetX: svgPt.x - pos.x,
      offsetY: svgPt.y - pos.y,
    });
  }, [positions, screenToSvg]);

  const handleMouseMove = useCallback((e) => {
    setMousePos({ x: e.clientX, y: e.clientY });

    if (dragging) {
      const svgPt = screenToSvg(e.clientX, e.clientY);
      setPositions(prev => ({
        ...prev,
        [dragging.nodeId]: {
          x: svgPt.x - dragging.offsetX,
          y: svgPt.y - dragging.offsetY,
        },
      }));
      return;
    }

    if (panning) {
      setTransform(t => ({
        ...t,
        x: e.clientX - panning.startX + panning.startTx,
        y: e.clientY - panning.startY + panning.startTy,
      }));
    }
  }, [dragging, panning, screenToSvg]);

  const handleMouseUp = useCallback(() => {
    if (dragging) {
      setPositions(prev => {
        saveCurrentPositions(prev);
        return prev;
      });
      setDragging(null);
    }
    setPanning(null);
  }, [dragging, saveCurrentPositions]);

  // ─── PAN HANDLER (background) ─────────────────────────────────────────────
  const handleBgMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    setPanning({
      startX: e.clientX,
      startY: e.clientY,
      startTx: transform.x,
      startTy: transform.y,
    });
  }, [transform]);

  // ─── ZOOM ─────────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    setTransform(t => {
      const newScale = Math.max(0.2, Math.min(3.0, t.scale * delta));
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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ─── FIT TO VIEW ──────────────────────────────────────────────────────────
  const fitToView = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ids = Object.keys(positions);
    if (!ids.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    ids.forEach(id => {
      const p = positions[id];
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
    const pad = 50;
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    if (contentW < 1 || contentH < 1) return;
    // Account for detail panel and palette width
    const availW = (selectedNodeId ? rect.width - 280 : rect.width) - 150;
    const scaleX = availW / contentW;
    const scaleY = rect.height / contentH;
    const scale = Math.min(scaleX, scaleY, 2.0) * 0.95;
    setTransform({
      scale,
      x: (availW - contentW * scale) / 2 - minX * scale,
      y: (rect.height - contentH * scale) / 2 - minY * scale,
    });
  }, [positions, selectedNodeId]);

  // Fit whenever positions change (handles initial load + country switch)
  const fitPendingRef = useRef(true);
  useEffect(() => {
    if (Object.keys(positions).length === 0) return; // skip empty
    if (!fitPendingRef.current) return;
    fitPendingRef.current = false;
    const timer = setTimeout(fitToView, 50);
    return () => clearTimeout(timer);
  }, [positions, fitToView]);

  // Mark fit pending on country change
  useEffect(() => { fitPendingRef.current = true; }, [country]);

  // ─── RESET LAYOUT ─────────────────────────────────────────────────────────
  const resetLayout = useCallback(() => {
    const all = loadPositions();
    delete all[country];
    savePositions(all);
    setPositions({ ...autoLayout });
    setTimeout(fitToView, 100);
  }, [country, autoLayout, fitToView]);

  // ─── SAVE LAYOUT ──────────────────────────────────────────────────────────
  const handleSaveLayout = useCallback(() => {
    saveCurrentPositions(positions);
  }, [positions, saveCurrentPositions]);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  const cursorStyle = dragging ? "grabbing" : panning ? "grabbing" : "grab";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* ── TOP BAR ── */}
      <div style={{
        display: "flex", alignItems: "stretch", borderBottom: `1px solid ${T.border}`,
        background: T.surface, flexShrink: 0,
      }}>
        {/* Country tabs */}
        {Object.entries(COUNTRY_META).map(([code, m]) => {
          const cn = NODES.filter(n => n.country === code);
          const iss = cn.filter(n => n.status !== "UP").length;
          const act = country === code;
          return (
            <button key={code} onClick={() => setCountry(code)} style={{
              padding: "10px 20px", border: "none", cursor: "pointer",
              background: act ? T.bg : "transparent",
              borderBottom: act ? `3px solid ${T.primary}` : "3px solid transparent",
              fontFamily: "inherit", display: "flex", alignItems: "center", gap: 10,
              transition: "all 0.15s",
            }}>
              <span style={{ fontSize: 18 }}>{m.flag}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: act ? 800 : 600, color: act ? T.text : T.muted }}>{m.name}</div>
                <div style={{ fontSize: 10, color: iss > 0 ? "#dc2626" : "#16a34a", fontWeight: 600 }}>
                  {iss > 0 ? `${iss} issue${iss > 1 ? "s" : ""}` : `${cn.length} nodes`}
                </div>
              </div>
            </button>
          );
        })}

        {/* Health + Controls */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "0 14px", flexWrap: "wrap" }}>
          {/* Health dots */}
          {[["UP", health.up, "#22c55e"], ["DEG", health.degraded, "#f59e0b"], ["DOWN", health.down, "#ef4444"]].map(([l, c, col]) => c > 0 && (
            <div key={l} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }}/>
              <span style={{ fontSize: 11, fontWeight: 700, color: col }}>{c}</span>
              <span style={{ fontSize: 9, color: T.muted }}>{l}</span>
            </div>
          ))}

          <span style={{ width: 1, height: 20, background: T.border }}/>

          {/* Toggles */}
          <label style={{ fontSize: 10, color: T.muted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={showLabels} onChange={e => setShowLabels(e.target.checked)} style={{ width: 12, height: 12 }}/>
            Labels
          </label>
          <label style={{ fontSize: 10, color: T.muted, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
            <input type="checkbox" checked={showLinkInfo} onChange={e => setShowLinkInfo(e.target.checked)} style={{ width: 12, height: 12 }}/>
            Link Info
          </label>

          <span style={{ width: 1, height: 20, background: T.border }}/>

          {/* Buttons */}
          <div style={{ display: "flex", gap: 3 }}>
            {[
              { label: "Fit", fn: fitToView },
              { label: "+", fn: () => setTransform(t => ({ ...t, scale: Math.min(3, t.scale * 1.25) })) },
              { label: "\u2212", fn: () => setTransform(t => ({ ...t, scale: Math.max(0.2, t.scale * 0.8) })) },
            ].map(btn => (
              <button key={btn.label} onClick={btn.fn} style={{
                padding: "3px 10px", fontSize: 10, fontWeight: 600,
                border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface,
                color: T.muted, cursor: "pointer", fontFamily: "inherit",
              }}>{btn.label}</button>
            ))}
          </div>

          <span style={{ fontSize: 10, color: T.muted, fontFamily: "monospace" }}>
            {Math.round(transform.scale * 100)}%
          </span>

          <span style={{ width: 1, height: 20, background: T.border }}/>

          <button onClick={resetLayout} style={{
            padding: "3px 10px", fontSize: 10, fontWeight: 600,
            border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface,
            color: T.muted, cursor: "pointer", fontFamily: "inherit",
          }}>Reset Layout</button>
          <button onClick={handleSaveLayout} style={{
            padding: "3px 10px", fontSize: 10, fontWeight: 600,
            border: `1px solid ${T.primary}`, borderRadius: 5, background: T.primaryBg,
            color: T.primary, cursor: "pointer", fontFamily: "inherit",
          }}>Save Layout</button>
        </div>
      </div>

      {/* ── MAIN AREA: Palette + Canvas + Detail Panel ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Device Palette */}
        <div style={{
          width: paletteOpen ? 140 : 40, flexShrink: 0, background: "#fff",
          borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column",
          transition: "width 0.2s", overflow: "hidden",
        }}>
          <button onClick={() => setPaletteOpen(p => !p)} style={{
            padding: "8px", border: "none", borderBottom: `1px solid ${T.border}`,
            background: "transparent", cursor: "pointer", fontSize: 10, fontWeight: 700,
            color: T.muted, textAlign: "center", whiteSpace: "nowrap",
          }}>
            {paletteOpen ? "◀ Devices" : "▶"}
          </button>
          {paletteOpen && (
            <div style={{ flex: 1, overflowY: "auto", padding: "6px" }}>
              <div style={{ fontSize: 8, color: T.muted, textAlign: "center", marginBottom: 6, lineHeight: 1.3 }}>
                Drag to canvas to add
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                {PALETTE_ITEMS.map(item => {
                  const Ic = ICON_COMPONENTS[item.iconType];
                  const col = LAYER_COLORS[item.layer] || "#64748b";
                  return (
                    <div key={item.label}
                      draggable
                      onDragStart={e => {
                        e.dataTransfer.setData("text/plain", JSON.stringify(item));
                        e.dataTransfer.effectAllowed = "copy";
                      }}
                      style={{
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                        padding: "6px 4px", borderRadius: 6, border: `1px solid ${T.border}`,
                        cursor: "grab", background: "#fafbfc", transition: "all 0.12s", userSelect: "none",
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "#eff6ff"; e.currentTarget.style.borderColor = T.primary; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#fafbfc"; e.currentTarget.style.borderColor = T.border; }}
                    >
                      <svg width="28" height="28" viewBox="-30 -20 60 40">
                        {Ic && <Ic color={col}/>}
                      </svg>
                      <span style={{ fontSize: 7, fontWeight: 600, color: T.muted, textAlign: "center", lineHeight: 1.2 }}>{item.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* SVG Canvas */}
        <div
          ref={containerRef}
          onMouseDown={handleBgMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
          onDrop={e => {
            e.preventDefault();
            try {
              const item = JSON.parse(e.dataTransfer.getData("text/plain"));
              if (!item.role) return;
              const svgPt = screenToSvg(e.clientX, e.clientY);
              setAddFormData({
                x: svgPt.x, y: svgPt.y,
                initialData: {
                  id: "", siteId: "", country, hostname: "", vendor: "", hwModel: "",
                  layer: item.layer, role: item.role, mgmtIp: "", status: "UP", osVersion: "",
                  serialNumber: "", procurementDate: "", eolDate: "", supportExpiry: "",
                  rackUnit: "", powerConsumptionW: null, lastCommit: null,
                  lineCards: [], powerSupplies: [],
                  interfaces: [{ name:"Loopback0", ip:"", description:"System/Loopback", peer:null, operStatus:"UP", speed:"—", mtu:1500, lastFlap:null }],
                  bgpNeighbors: [], services: [], features: [], goldenConfig: "",
                },
              });
            } catch {}
          }}
          style={{
            flex: 1, overflow: "hidden", position: "relative",
            cursor: cursorStyle,
            background: "#ffffff",
            backgroundImage: "radial-gradient(circle, #e2e8f0 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <svg
            ref={svgRef}
            width="100%" height="100%"
            style={{ position: "absolute", top: 0, left: 0 }}
          >
            <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>

              {/* LINKS */}
              {links.map((link, i) => {
                const from = positions[link.from];
                const to = positions[link.to];
                if (!from || !to) return null;
                const col = linkColor(link);
                const w = linkWidth(link.speed);
                const mx = (from.x + to.x) / 2;
                const my = (from.y + to.y) / 2;
                const isHovered = hoveredLink === i;

                return (
                  <g key={i}
                    onMouseEnter={() => setHoveredLink(i)}
                    onMouseLeave={() => setHoveredLink(null)}
                    style={{ cursor: "pointer" }}
                  >
                    {/* Invisible wider hit area */}
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke="transparent" strokeWidth={12}/>
                    {/* Shadow */}
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={col} strokeWidth={w + 2} opacity={0.15} strokeLinecap="round"/>
                    {/* Main line */}
                    <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                      stroke={col} strokeWidth={isHovered ? w + 1 : w} opacity={link.down || link.operDown ? 0.5 : 0.9}
                      strokeLinecap="round"
                      strokeDasharray={link.down || link.operDown ? "6,4" : "none"}/>
                    {/* Speed label on link */}
                    {showLinkInfo && (
                      <g>
                        <rect x={mx - 16} y={my - 7} width={32} height={13} rx={3}
                          fill="#000" fillOpacity={0.6}/>
                        <text x={mx} y={my + 3} fill="#ffffff" fontSize={7.5} fontWeight={700}
                          textAnchor="middle" fontFamily="monospace">{link.speed}</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* NODES */}
              {countryNodes.map(node => {
                const pos = positions[node.id];
                if (!pos) return null;
                const iconType = getIconType(node);
                const IconComp = ICON_COMPONENTS[iconType];
                const layerCol = node._isCloud ? "#475569" : (LAYER_COLORS[node.layer] || "#64748b");
                const statusCol = STATUS_COLOR[node.status] || "#94a3b8";
                const isSel = selectedNodeId === node.id;
                const isDragging = dragging?.nodeId === node.id;
                const shortLabel = node._isCloud
                  ? "ISP / Internet"
                  : node.id.replace(/^(fj|hw|ib)-/, "").replace(/(town|santantoni|santaeulalia|escanar|portinatx|hnl1|hnl2|maui|suva|lautoka)-/, "");

                return (
                  <g key={node.id}
                    transform={`translate(${pos.x}, ${pos.y})${isDragging ? " scale(1.1)" : ""}`}
                    onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!dragging) setSelectedNodeId(isSel ? null : node.id);
                    }}
                    style={{ cursor: isDragging ? "grabbing" : "grab" }}
                  >
                    {/* Selection ring */}
                    {isSel && (
                      <circle cx={0} cy={0} r={30} fill="none" stroke={T.primary} strokeWidth={2}
                        strokeDasharray="5,3" opacity={0.7}>
                        <animate attributeName="stroke-dashoffset" values="0;16" dur="1.5s" repeatCount="indefinite"/>
                      </circle>
                    )}

                    {/* Drag shadow */}
                    {isDragging && (
                      <ellipse cx={2} cy={4} rx={26} ry={18} fill="#000" opacity={0.25}/>
                    )}

                    {/* Colored background ring */}
                    <circle cx={0} cy={0} r={24} fill={layerCol + "10"} stroke={layerCol} strokeWidth={1.5} opacity={0.5}/>

                    {/* Icon */}
                    {IconComp && <IconComp color={layerCol}/>}

                    {/* Status indicator (bottom-right) */}
                    {!node._isCloud && (
                      <g transform="translate(16, 14)">
                        <circle cx={0} cy={0} r={5} fill="#ffffff"/>
                        <circle cx={0} cy={0} r={3.5} fill={statusCol}>
                          {node.status === "DOWN" && (
                            <animate attributeName="opacity" values="1;0.3;1" dur="1s" repeatCount="indefinite"/>
                          )}
                        </circle>
                        {node.status !== "UP" && (
                          <circle cx={0} cy={0} r={5} fill="none" stroke={statusCol} strokeWidth={1} opacity={0.4}>
                            <animate attributeName="r" values="5;8;5" dur="1.5s" repeatCount="indefinite"/>
                            <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite"/>
                          </circle>
                        )}
                      </g>
                    )}

                    {/* Labels */}
                    {showLabels && (
                      <>
                        <text x={0} y={32} fill="#1e293b" fontSize={9} fontWeight={700}
                          textAnchor="middle" fontFamily="monospace">
                          {shortLabel}
                        </text>
                        {!node._isCloud && (
                          <text x={0} y={42} fill="#64748b" fontSize={7} fontWeight={500}
                            textAnchor="middle" fontFamily="system-ui, sans-serif">
                            {node.vendor} {node.hwModel ? node.hwModel.split(" ").slice(0, 2).join(" ") : ""}
                          </text>
                        )}
                      </>
                    )}
                  </g>
                );
              })}

            </g>
          </svg>

          {/* Hovered link tooltip (HTML overlay) */}
          {hoveredLink !== null && links[hoveredLink] && (
            <LinkTooltip link={links[hoveredLink]} x={mousePos.x - (containerRef.current?.getBoundingClientRect()?.left || 0)} y={mousePos.y - (containerRef.current?.getBoundingClientRect()?.top || 0)}/>
          )}

          {/* Network info overlay — top right, small */}
          <div style={{
            position: "absolute", top: 8, right: selectedNodeId ? 288 : 8,
            background: "#ffffffdd", border: "1px solid #e2e8f0",
            borderRadius: 6, padding: "4px 10px", zIndex: 50,
            pointerEvents: "none",
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
              {meta.flag} {meta.asn} &middot; {health.total} nodes &middot; {links.length} links
            </span>
          </div>

          {/* Legend */}
          <div style={{
            position: "absolute", bottom: 12, left: 12, background: "#ffffffee",
            border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", zIndex: 50,
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6 }}>
              Status
            </div>
            <div style={{ display: "flex", gap: 12, fontSize: 9, color: "#475569" }}>
              {[["UP", "#22c55e"], ["DEGRADED", "#f59e0b"], ["DOWN", "#ef4444"]].map(([label, col]) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: col }}/>
                  {label}
                </span>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, fontSize: 9, color: "#94a3b8", marginTop: 5 }}>
              <span>Scroll = zoom</span>
              <span>Drag bg = pan</span>
              <span>Drag node = move</span>
            </div>
          </div>

          {/* Add device form modal */}
          {addFormData && (
            <div style={{ position:"absolute", inset:0, zIndex:200, background:"rgba(0,0,0,0.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <NodeFormModal
                mode="add"
                initialData={addFormData.initialData}
                onSave={node => {
                  addNode(node);
                  setPositions(prev => {
                    const next = { ...prev, [node.id]: { x: addFormData.x, y: addFormData.y } };
                    const all = loadPositions();
                    all[country] = next;
                    savePositions(all);
                    return next;
                  });
                  setAddFormData(null);
                }}
                onClose={() => setAddFormData(null)}
              />
            </div>
          )}
        </div>

        {/* ── Detail Panel ── */}
        {selectedNode && (
          <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNodeId(null)}/>
        )}
      </div>
    </div>
  );
}
