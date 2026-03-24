import { useState, useMemo } from "react";
import { SITES, NODES, SERVICES, ALARMS, COUNTRY_META, LAYERS } from "../data/inventory.js";
import { T } from "../data/constants.js";

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const STATUS_COLOR = { UP:"#16a34a", DEGRADED:"#d97706", DOWN:"#dc2626" };
const STATUS_BG    = { UP:"#f0fdf4",  DEGRADED:"#fffbeb",  DOWN:"#fef2f2"  };
const STATUS_DOT   = { UP:"●", DEGRADED:"●", DOWN:"●" };
const CRIT_COLOR   = { Critical:"#dc2626", High:"#d97706", Medium:"#2563eb" };

function StatusBadge({ status, small }) {
  const c = STATUS_COLOR[status] || "#64748b";
  const bg = STATUS_BG[status] || "#f8fafc";
  const sz = small ? 10 : 11;
  return (
    <span style={{ fontSize:sz, fontWeight:700, color:c, background:bg,
      border:`1px solid ${c}30`, borderRadius:4, padding:"1px 7px",
      letterSpacing:"0.3px", whiteSpace:"nowrap" }}>
      {STATUS_DOT[status]} {status}
    </span>
  );
}

function LayerTag({ layer }) {
  const colors = {
    "IP Core":"#1d4ed8","Internet GW":"#065f46","5G Core":"#6d28d9",
    "Voice Core":"#be185d","DC Fabric":"#0e7490","IP LAN":"#374151",
    "BPoP":"#92400e","APoP":"#9a3412","Transport":"#1e3a5f",
  };
  const bg = colors[layer] || "#334155";
  return (
    <span style={{ fontSize:10, fontWeight:600, color:"#fff", background:bg,
      borderRadius:3, padding:"1px 6px", whiteSpace:"nowrap" }}>
      {layer}
    </span>
  );
}

// ─── GOLDEN CONFIG MODAL ─────────────────────────────────────────────────────
function ConfigModal({ node, onClose }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.55)", zIndex:1000,
      display:"flex", alignItems:"center", justifyContent:"center" }}
      onClick={onClose}>
      <div style={{ background:"#0f172a", borderRadius:12, width:"min(860px,94vw)",
        maxHeight:"85vh", display:"flex", flexDirection:"column",
        boxShadow:"0 24px 60px rgba(0,0,0,0.5)", overflow:"hidden" }}
        onClick={e=>e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding:"14px 20px", borderBottom:"1px solid #1e293b",
          display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <span style={{ fontSize:13, fontFamily:"monospace", color:"#38bdf8", fontWeight:700 }}>
            {node.hostname}
          </span>
          <span style={{ fontSize:11, color:"#64748b" }}>{node.vendor} {node.hwModel}</span>
          <span style={{ marginLeft:"auto", fontSize:11, color:"#475569" }}>
            Golden Config — read-only
          </span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer",
            color:"#64748b", fontSize:18, lineHeight:1, padding:"0 4px" }}>×</button>
        </div>
        {/* Config */}
        <pre style={{ margin:0, padding:"16px 20px", overflowY:"auto", flex:1,
          fontSize:12, lineHeight:1.6, color:"#e2e8f0", fontFamily:"'JetBrains Mono','Fira Code',monospace",
          whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
          {node.goldenConfig || "! No config available"}
        </pre>
      </div>
    </div>
  );
}

// ─── NODE DETAIL PANEL ────────────────────────────────────────────────────────
function NodeDetail({ node, services, changes, onViewConfig }) {
  const nodeServices = services.filter(s => s.nodes.includes(node.id));
  const nodeAlarms = ALARMS.filter(a => a.nodeId === node.id);
  const activeChanges = changes.filter(c =>
    !c.isTemplate &&
    ["Scheduled","In Execution","Pending Approval"].includes(c.status) &&
    (c.affectedServices || "").toLowerCase().includes(node.id.toLowerCase())
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0, height:"100%", overflowY:"auto" }}>
      {/* Identity */}
      <div style={{ padding:"16px 18px", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:8 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:800, color:T.text, fontFamily:"monospace", marginBottom:3 }}>
              {node.hostname}
            </div>
            <div style={{ fontSize:11, color:T.muted }}>{node.vendor} {node.hwModel}</div>
          </div>
          <StatusBadge status={node.status} />
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
          <LayerTag layer={node.layer} />
          <span style={{ fontSize:10, color:T.muted, border:`1px solid ${T.border}`, borderRadius:3,
            padding:"1px 7px" }}>mgmt {node.mgmtIp}</span>
        </div>
        {nodeAlarms.length > 0 && (
          <div style={{ marginTop:10 }}>
            {nodeAlarms.map(a => (
              <div key={a.id} style={{ fontSize:11, color:a.severity==="Critical"?"#dc2626":a.severity==="Major"?"#d97706":"#6b7280",
                background:a.severity==="Critical"?"#fef2f2":a.severity==="Major"?"#fffbeb":"#f9fafb",
                border:`1px solid ${a.severity==="Critical"?"#fca5a5":a.severity==="Major"?"#fcd34d":"#e5e7eb"}`,
                borderRadius:5, padding:"5px 9px", marginBottom:4, lineHeight:1.4 }}>
                <span style={{ fontWeight:700 }}>{a.severity === "Critical" ? "⛔" : a.severity === "Major" ? "⚠" : "ℹ"} {a.severity}</span>
                {" — "}{a.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interfaces */}
      <div style={{ padding:"12px 18px", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:"0.5px",
          textTransform:"uppercase", marginBottom:8 }}>Interfaces</div>
        {node.interfaces.map((ifc, i) => (
          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:6,
            fontSize:11, lineHeight:1.4 }}>
            <span style={{ fontFamily:"monospace", color:T.primary, fontWeight:600, minWidth:140, flexShrink:0 }}>
              {ifc.name}
            </span>
            <div>
              <div style={{ color:T.text, fontFamily:"monospace" }}>{ifc.ip}</div>
              <div style={{ color:T.muted, fontSize:10 }}>{ifc.description}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Services */}
      <div style={{ padding:"12px 18px", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:"0.5px",
          textTransform:"uppercase", marginBottom:8 }}>Services on this node</div>
        {nodeServices.length === 0 ? (
          <div style={{ fontSize:11, color:T.muted }}>No services mapped</div>
        ) : nodeServices.map(svc => (
          <div key={svc.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
            <span style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
              background:CRIT_COLOR[svc.criticality] || "#64748b" }} />
            <span style={{ fontSize:12, fontWeight:600, color:T.text }}>{svc.name}</span>
            <span style={{ fontSize:10, color:CRIT_COLOR[svc.criticality], fontWeight:600,
              marginLeft:"auto" }}>{svc.criticality}</span>
          </div>
        ))}
      </div>

      {/* Active Changes */}
      <div style={{ padding:"12px 18px", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:"0.5px",
          textTransform:"uppercase", marginBottom:8 }}>Active changes</div>
        {activeChanges.length === 0 ? (
          <div style={{ fontSize:11, color:"#16a34a" }}>✓ No active changes</div>
        ) : activeChanges.map(c => (
          <div key={c.id} style={{ fontSize:11, color:"#b45309", background:"#fffbeb",
            border:"1px solid #fcd34d", borderRadius:5, padding:"4px 8px", marginBottom:4 }}>
            ⚠ {c.id} — {c.name} ({c.status})
          </div>
        ))}
      </div>

      {/* View Config */}
      <div style={{ padding:"12px 18px" }}>
        <button onClick={onViewConfig} style={{ width:"100%", padding:"8px 0",
          background:"#0f172a", color:"#38bdf8", border:"1px solid #1e40af",
          borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer",
          fontFamily:"monospace", letterSpacing:"0.3px" }}>
          {"</>"} View Golden Config
        </button>
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function NetworkInventory({ changes = [] }) {
  const [country, setCountry]       = useState("FJ");
  const [selectedNode, setSelectedNode] = useState(null);
  const [layerFilter, setLayerFilter]   = useState("All");
  const [showConfig, setShowConfig]     = useState(false);

  const meta    = COUNTRY_META[country];
  const sites   = SITES.filter(s => s.country === country);
  const allNodes= NODES.filter(n => n.country === country);
  const nodes   = layerFilter === "All" ? allNodes : allNodes.filter(n => n.layer === layerFilter);
  const services= SERVICES.filter(s => s.country === country);

  // Group nodes by site
  const bySite = useMemo(() =>
    sites.map(site => ({
      ...site,
      nodes: nodes.filter(n => n.siteId === site.id),
    })).filter(s => s.nodes.length > 0),
  [sites, nodes]);

  // Health summary
  const health = useMemo(() => ({
    up:       allNodes.filter(n => n.status === "UP").length,
    degraded: allNodes.filter(n => n.status === "DEGRADED").length,
    down:     allNodes.filter(n => n.status === "DOWN").length,
    total:    allNodes.length,
  }), [allNodes]);

  // Alarms for this country
  const countryAlarms = ALARMS.filter(a => a.country === country);

  // Layers present in this country
  const presentLayers = useMemo(() =>
    ["All", ...LAYERS.filter(l => allNodes.some(n => n.layer === l))],
  [allNodes]);

  // When country changes, reset selection
  function switchCountry(c) {
    setCountry(c);
    setSelectedNode(null);
    setLayerFilter("All");
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0, height:"100%", overflow:"hidden" }}>

      {/* ── Country Tabs + Health Summary ── */}
      <div style={{ padding:"0 0 0 0", flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"stretch", borderBottom:`1px solid ${T.border}`,
          background:T.surface, gap:0 }}>
          {Object.entries(COUNTRY_META).map(([code, m]) => {
            const cNodes = NODES.filter(n => n.country === code);
            const cDown  = cNodes.filter(n => n.status !== "UP").length;
            const active = country === code;
            return (
              <button key={code} onClick={() => switchCountry(code)} style={{
                padding:"14px 28px", border:"none", cursor:"pointer",
                background: active ? T.bg : "transparent",
                borderBottom: active ? `3px solid ${T.primary}` : "3px solid transparent",
                fontFamily:"inherit", display:"flex", alignItems:"center", gap:10,
                transition:"all 0.15s",
              }}>
                <span style={{ fontSize:18 }}>{m.flag}</span>
                <div style={{ textAlign:"left" }}>
                  <div style={{ fontSize:13, fontWeight: active ? 800 : 600,
                    color: active ? T.text : T.muted }}>{m.name}</div>
                  <div style={{ fontSize:10, color: cDown > 0 ? "#dc2626" : "#16a34a", fontWeight:600 }}>
                    {cDown > 0 ? `⚠ ${cDown} issues` : `✓ ${cNodes.length} nodes`}
                  </div>
                </div>
              </button>
            );
          })}

          {/* Health summary pills */}
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center",
            gap:10, padding:"0 24px" }}>
            {[["UP", health.up, "#16a34a"], ["DEGRADED", health.degraded, "#d97706"],
              ["DOWN", health.down, "#dc2626"]].map(([label, count, color]) => (
              <div key={label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:color }} />
                <span style={{ fontSize:11, fontWeight:700, color }}>{count}</span>
                <span style={{ fontSize:10, color:T.muted }}>{label}</span>
              </div>
            ))}
            <span style={{ fontSize:10, color:T.muted, marginLeft:4 }}>
              · {meta.asn}
            </span>
          </div>
        </div>

        {/* ── Layer Filter ── */}
        <div style={{ display:"flex", alignItems:"center", gap:6, padding:"10px 20px",
          borderBottom:`1px solid ${T.border}`, background:T.surface, flexWrap:"wrap" }}>
          <span style={{ fontSize:10, color:T.muted, fontWeight:600,
            textTransform:"uppercase", letterSpacing:"0.5px", marginRight:4 }}>Layer:</span>
          {presentLayers.map(l => (
            <button key={l} onClick={() => setLayerFilter(l)} style={{
              padding:"3px 10px", fontSize:11, fontWeight: layerFilter === l ? 700 : 500,
              borderRadius:12, border:`1px solid ${layerFilter === l ? T.primary : T.border}`,
              background: layerFilter === l ? T.primary : "transparent",
              color: layerFilter === l ? "#fff" : T.muted,
              cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s",
            }}>{l}</button>
          ))}
          {countryAlarms.length > 0 && (
            <span style={{ marginLeft:"auto", fontSize:11, fontWeight:700,
              color:"#dc2626", background:"#fef2f2", border:"1px solid #fca5a5",
              borderRadius:10, padding:"2px 10px" }}>
              🔔 {countryAlarms.length} alarm{countryAlarms.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* ── Main Body ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {/* ── Node Tree (left) ── */}
        <div style={{ width: selectedNode ? 280 : "100%", flexShrink:0,
          borderRight: selectedNode ? `1px solid ${T.border}` : "none",
          overflowY:"auto", transition:"width 0.2s" }}>
          {bySite.map(site => (
            <div key={site.id}>
              {/* Site header */}
              <div style={{ padding:"8px 16px", background:T.surface,
                borderBottom:`1px solid ${T.border}`, display:"flex",
                alignItems:"center", gap:8, position:"sticky", top:0, zIndex:1 }}>
                <span style={{ fontSize:11 }}>📍</span>
                <span style={{ fontSize:12, fontWeight:700, color:T.text }}>{site.name}</span>
                <span style={{ fontSize:10, color:T.muted, background:"#f1f5f9",
                  border:`1px solid ${T.border}`, borderRadius:4, padding:"0 6px" }}>
                  {site.type}
                </span>
                <span style={{ marginLeft:"auto", fontSize:10, color:T.muted }}>
                  {site.nodes.length} node{site.nodes.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Nodes in site */}
              {site.nodes.map(node => {
                const isSelected = selectedNode?.id === node.id;
                const sc = STATUS_COLOR[node.status] || "#64748b";
                return (
                  <button key={node.id} onClick={() => setSelectedNode(isSelected ? null : node)}
                    style={{ display:"flex", alignItems:"center", gap:10, width:"100%",
                      padding:"9px 16px 9px 28px", border:"none", cursor:"pointer",
                      fontFamily:"inherit", textAlign:"left",
                      background: isSelected ? `${T.primary}12` : "transparent",
                      borderLeft: isSelected ? `3px solid ${T.primary}` : "3px solid transparent",
                      borderBottom:`1px solid ${T.border}30`, transition:"background 0.1s" }}>
                    <span style={{ width:9, height:9, borderRadius:"50%",
                      background:sc, flexShrink:0, boxShadow:`0 0 5px ${sc}60` }} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? T.primary : T.text, fontFamily:"monospace",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {node.id}
                      </div>
                      <div style={{ fontSize:10, color:T.muted }}>
                        {node.vendor} {node.hwModel}
                      </div>
                    </div>
                    <LayerTag layer={node.layer} />
                  </button>
                );
              })}
            </div>
          ))}

          {bySite.length === 0 && (
            <div style={{ padding:32, textAlign:"center", color:T.muted, fontSize:13 }}>
              No nodes match the selected layer filter.
            </div>
          )}

          {/* ── Services ── */}
          {!selectedNode && (
            <div style={{ margin:"16px 0 0" }}>
              <div style={{ padding:"8px 16px", background:T.surface,
                borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}` }}>
                <span style={{ fontSize:11, fontWeight:700, color:T.muted,
                  textTransform:"uppercase", letterSpacing:"0.5px" }}>Services</span>
              </div>
              <div style={{ padding:"12px 16px", display:"flex", flexDirection:"column", gap:8 }}>
                {services.map(svc => {
                  const svcAlarms = ALARMS.filter(a => a.affectedServices?.includes(svc.id));
                  const svcNodes  = NODES.filter(n => svc.nodes.includes(n.id));
                  const hasIssue  = svcNodes.some(n => n.status !== "UP");
                  return (
                    <div key={svc.id} style={{ border:`1px solid ${hasIssue ? "#fca5a5" : T.border}`,
                      borderRadius:8, padding:"10px 14px",
                      background: hasIssue ? "#fff8f8" : T.surface }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
                          background: CRIT_COLOR[svc.criticality] }} />
                        <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{svc.name}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:CRIT_COLOR[svc.criticality],
                          marginLeft:"auto" }}>{svc.criticality}</span>
                        {svcAlarms.length > 0 && (
                          <span style={{ fontSize:10, fontWeight:700, color:"#dc2626",
                            background:"#fef2f2", border:"1px solid #fca5a5",
                            borderRadius:4, padding:"1px 6px" }}>
                            🔔 {svcAlarms.length}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize:11, color:T.muted, marginBottom:6 }}>{svc.description}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                        {svc.nodes.map(nid => {
                          const n = NODES.find(x => x.id === nid);
                          if (!n) return null;
                          const c = STATUS_COLOR[n.status];
                          return (
                            <button key={nid} onClick={() => {
                              const found = NODES.find(x => x.id === nid);
                              if (found) setSelectedNode(found);
                            }} style={{ fontSize:10, fontFamily:"monospace", padding:"2px 7px",
                              borderRadius:4, border:`1px solid ${c}40`,
                              background:`${c}10`, color:c, cursor:"pointer",
                              fontWeight:600 }}>
                              {nid}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Node Detail (right) ── */}
        {selectedNode && (
          <div style={{ flex:1, overflowY:"auto" }}>
            <NodeDetail
              node={selectedNode}
              services={services}
              changes={changes}
              onViewConfig={() => setShowConfig(true)}
            />
          </div>
        )}
      </div>

      {/* ── Config Modal ── */}
      {showConfig && selectedNode && (
        <ConfigModal node={selectedNode} onClose={() => setShowConfig(false)} />
      )}
    </div>
  );
}
