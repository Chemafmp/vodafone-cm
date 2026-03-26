import { useState, useMemo } from "react";
import { T } from "../data/constants.js";

// ─── DATA IMPORTS ────────────────────────────────────────────────────────────
import { SITES, COUNTRY_META, LAYERS, LAYER_COLORS } from "../data/inventory/sites.js";
import { SERVICES } from "../data/inventory/services.js";
import { ALARMS } from "../data/inventory/alarms.js";
import { VLANS } from "../data/inventory/vlans.js";
import { IPAM } from "../data/inventory/ipam.js";
import { useNodes } from "../context/NodesContext.jsx";
import NodeFormModal, { NodeAddPicker, TemplatePicker, DiscoverDialog, ImportDialog } from "./NodeFormModal.jsx";
import { genId } from "../utils/helpers.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STATUS_COLOR = { UP:"#16a34a", DEGRADED:"#d97706", DOWN:"#dc2626" };
const STATUS_BG    = { UP:"#f0fdf4", DEGRADED:"#fffbeb", DOWN:"#fef2f2"  };
const CRIT_COLOR   = { Critical:"#dc2626", High:"#d97706", Medium:"#2563eb", Low:"#64748b" };
const NODE_TABS    = ["Hardware","Software","Interfaces","Routing","Services","Config","Changes"];

// ─── SMALL UI ATOMS ──────────────────────────────────────────────────────────
function Dot({ status }) {
  const c = STATUS_COLOR[status] || "#94a3b8";
  return <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%",
    background:c, boxShadow:`0 0 5px ${c}60`, flexShrink:0 }} />;
}

function StatusBadge({ status }) {
  const c  = STATUS_COLOR[status] || "#64748b";
  const bg = STATUS_BG[status]    || "#f8fafc";
  return <span style={{ fontSize:10, fontWeight:700, color:c, background:bg,
    border:`1px solid ${c}30`, borderRadius:4, padding:"1px 7px",
    letterSpacing:"0.3px", whiteSpace:"nowrap" }}>● {status}</span>;
}

function LayerTag({ layer }) {
  const bg = LAYER_COLORS[layer] || "#334155";
  return <span style={{ fontSize:10, fontWeight:600, color:"#fff", background:bg,
    borderRadius:3, padding:"1px 6px", whiteSpace:"nowrap" }}>{layer}</span>;
}

function SectionHead({ label, count }) {
  return (
    <div style={{ fontSize:10, fontWeight:700, color:T.muted, letterSpacing:"0.8px",
      textTransform:"uppercase", padding:"10px 18px 5px",
      display:"flex", alignItems:"center", gap:8 }}>
      {label}
      {count != null && <span style={{ fontSize:9, background:"#e2e8f0", color:"#475569",
        borderRadius:8, padding:"1px 6px", fontWeight:600 }}>{count}</span>}
    </div>
  );
}

function EmptyState({ icon, msg }) {
  return <div style={{ padding:"24px 18px", textAlign:"center", color:T.muted, fontSize:12 }}>
    <div style={{ fontSize:24, marginBottom:6 }}>{icon}</div>{msg}
  </div>;
}

// ─── CONFIG MODAL ─────────────────────────────────────────────────────────────
function ConfigModal({ node, onClose }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)",
      zIndex:2000, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#0f172a",
        borderRadius:12, width:"min(900px,96vw)", maxHeight:"88vh",
        display:"flex", flexDirection:"column",
        boxShadow:"0 24px 60px rgba(0,0,0,0.6)", overflow:"hidden" }}>
        <div style={{ padding:"12px 18px", borderBottom:"1px solid #1e293b",
          display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
          <span style={{ fontSize:12, fontFamily:"monospace", color:"#38bdf8", fontWeight:700 }}>
            {node.hostname}
          </span>
          <span style={{ fontSize:11, color:"#475569" }}>{node.vendor} {node.hwModel}</span>
          <span style={{ fontSize:10, color:"#334155", marginLeft:"auto" }}>
            {node.osVersion || "—"} · golden config (read-only)
          </span>
          {node.lastCommit && (
            <span style={{ fontSize:10, color:"#475569" }}>
              last commit {node.lastCommit.date?.slice(0,10)} by {node.lastCommit.user}
            </span>
          )}
          <button onClick={onClose} style={{ background:"none", border:"none",
            cursor:"pointer", color:"#475569", fontSize:20, lineHeight:1, padding:"0 2px" }}>×</button>
        </div>
        <pre style={{ margin:0, padding:"16px 20px", overflowY:"auto", flex:1,
          fontSize:11.5, lineHeight:1.65, color:"#e2e8f0",
          fontFamily:"'JetBrains Mono','Fira Code','Cascadia Code',monospace",
          whiteSpace:"pre-wrap", wordBreak:"break-word" }}>
          {node.goldenConfig || "! No golden config stored for this device."}
        </pre>
      </div>
    </div>
  );
}

// ─── NODE DETAIL TABS ─────────────────────────────────────────────────────────

function TabHardware({ node }) {
  const lc = node.lineCards || [];
  const ps = node.powerSupplies || [];
  return (
    <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:16 }}>
      {/* Identity card */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {[
          ["Vendor",      node.vendor],
          ["Model",       node.hwModel],
          ["Serial",      node.serialNumber || "—"],
          ["Rack Unit",   node.rackUnit || "—"],
          ["Procurement", node.procurementDate || "—"],
          ["EoL Date",    node.eolDate || "—"],
          ["Support Exp", node.supportExpiry || "—"],
          ["Power (W)",   node.powerConsumptionW ? `${node.powerConsumptionW} W` : "—"],
        ].map(([k,v])=>(
          <div key={k} style={{ background:"#f8fafc", border:`1px solid ${T.border}`,
            borderRadius:6, padding:"7px 10px" }}>
            <div style={{ fontSize:9, fontWeight:700, color:T.muted,
              textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:2 }}>{k}</div>
            <div style={{ fontSize:12, fontWeight:600, color:T.text,
              fontFamily: k==="Serial"||k==="Model"?"monospace":"inherit" }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Line cards */}
      {lc.length > 0 && <>
        <SectionHead label="Line Cards / Modules" count={lc.length} />
        <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ background:"#f1f5f9" }}>
              {["Slot","Model","Description","Ports","Port Type","Status"].map(h=>(
                <th key={h} style={{ padding:"5px 8px", textAlign:"left", fontWeight:700,
                  color:T.muted, fontSize:10, borderBottom:`1px solid ${T.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lc.map((c,i)=>(
              <tr key={i} style={{ borderBottom:`1px solid ${T.border}30` }}>
                <td style={{ padding:"5px 8px", fontFamily:"monospace", color:T.primary }}>
                  {c.slot}</td>
                <td style={{ padding:"5px 8px", fontFamily:"monospace", fontSize:10 }}>
                  {c.model}</td>
                <td style={{ padding:"5px 8px", color:T.muted, fontSize:10 }}>
                  {c.description}</td>
                <td style={{ padding:"5px 8px", textAlign:"center" }}>
                  {c.ports ?? "—"}</td>
                <td style={{ padding:"5px 8px", color:T.muted, fontSize:10 }}>
                  {c.portType || "—"}</td>
                <td style={{ padding:"5px 8px" }}>
                  <span style={{ fontSize:10, fontWeight:700,
                    color: c.status==="ACTIVE"?"#16a34a":c.status==="STANDBY"?"#0e7490":"#dc2626" }}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </>}

      {/* Power supplies */}
      {ps.length > 0 && <>
        <SectionHead label="Power Supplies" count={ps.length} />
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {ps.map((p,i)=>(
            <div key={i} style={{ border:`1px solid ${p.status==="OK"?"#bbf7d0":"#fca5a5"}`,
              background: p.status==="OK"?"#f0fdf4":"#fef2f2",
              borderRadius:7, padding:"8px 14px", minWidth:160 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.text }}>{p.id}</div>
              <div style={{ fontSize:10, fontFamily:"monospace", color:T.muted }}>{p.model}</div>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4 }}>
                <span style={{ fontSize:11, fontWeight:700,
                  color: p.status==="OK"?"#16a34a":"#dc2626" }}>
                  {p.status==="OK"?"✓ OK":"⚠ FAILED"}
                </span>
                <span style={{ fontSize:10, color:T.muted }}>{p.watts}W</span>
              </div>
            </div>
          ))}
        </div>
      </>}

      {lc.length === 0 && ps.length === 0 && (
        <EmptyState icon="🔧" msg="No hardware detail recorded for this device" />
      )}
    </div>
  );
}

function TabSoftware({ node }) {
  const features = node.features || [];
  return (
    <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:14 }}>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {[
          ["OS Version",    node.osVersion || "—"],
          ["Last Commit",   node.lastCommit?.date?.replace("T"," ").slice(0,16) || "—"],
          ["Committed by",  node.lastCommit?.user || "—"],
          ["Uptime",        node.uptime || "—"],
        ].map(([k,v])=>(
          <div key={k} style={{ background:"#f8fafc", border:`1px solid ${T.border}`,
            borderRadius:6, padding:"7px 10px" }}>
            <div style={{ fontSize:9, fontWeight:700, color:T.muted,
              textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:2 }}>{k}</div>
            <div style={{ fontSize:12, fontWeight:600, color:T.text,
              fontFamily:"monospace" }}>{v}</div>
          </div>
        ))}
      </div>
      {features.length > 0 && <>
        <SectionHead label="Enabled Features / Packages" />
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {features.map(f=>(
            <span key={f} style={{ fontSize:10, fontWeight:600, background:"#eff6ff",
              color:"#1d4ed8", border:"1px solid #bfdbfe", borderRadius:4, padding:"2px 8px" }}>
              {f}
            </span>
          ))}
        </div>
      </>}
    </div>
  );
}

function TabInterfaces({ node }) {
  const ifaces = node.interfaces || [];
  if (ifaces.length === 0) return <EmptyState icon="🔌" msg="No interfaces recorded" />;
  const opColor = { UP:"#16a34a", DOWN:"#dc2626", "ADMIN-DOWN":"#64748b" };
  return (
    <div style={{ padding:"14px 18px" }}>
      <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ background:"#f1f5f9" }}>
            {["Interface","IP / VLAN","Speed","MTU","Status","Peer","Last Flap"].map(h=>(
              <th key={h} style={{ padding:"5px 8px", textAlign:"left", fontWeight:700,
                color:T.muted, fontSize:10, borderBottom:`1px solid ${T.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ifaces.map((ifc,i)=>{
            const st = ifc.operStatus || (ifc.ip === "FLAPPING" ? "DOWN" : "UP");
            return (
              <tr key={i} style={{ borderBottom:`1px solid ${T.border}30`,
                background: st==="DOWN"?"#fff8f8":st==="ADMIN-DOWN"?"#f9fafb":"transparent" }}>
                <td style={{ padding:"5px 8px", fontFamily:"monospace", fontSize:10,
                  color:T.primary, fontWeight:600, whiteSpace:"nowrap" }}>{ifc.name}</td>
                <td style={{ padding:"5px 8px", fontFamily:"monospace", fontSize:10 }}>
                  {ifc.vlan ? `VLAN ${ifc.vlan}` : ifc.ip || "—"}
                </td>
                <td style={{ padding:"5px 8px", color:T.muted }}>{ifc.speed || "—"}</td>
                <td style={{ padding:"5px 8px", color:T.muted }}>{ifc.mtu ?? "—"}</td>
                <td style={{ padding:"5px 8px" }}>
                  <span style={{ fontSize:10, fontWeight:700, color:opColor[st]||"#64748b" }}>
                    {st}
                  </span>
                </td>
                <td style={{ padding:"5px 8px", fontSize:10, color:T.muted }}>
                  {ifc.peer || "—"}
                </td>
                <td style={{ padding:"5px 8px", fontSize:9, color:T.muted }}>
                  {ifc.lastFlap ? ifc.lastFlap.slice(0,10) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabRouting({ node }) {
  const bgp = node.bgpNeighbors || [];
  if (bgp.length === 0) return <EmptyState icon="🗺" msg="No BGP neighbors — not a routing device" />;
  const stColor = { Established:"#16a34a", Active:"#d97706", Idle:"#dc2626" };
  return (
    <div style={{ padding:"14px 18px" }}>
      <SectionHead label="BGP Neighbors" count={bgp.length} />
      <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse", marginTop:6 }}>
        <thead>
          <tr style={{ background:"#f1f5f9" }}>
            {["Peer IP","ASN","Description","State","Prefixes Rx","Prefixes Tx","Uptime"].map(h=>(
              <th key={h} style={{ padding:"5px 8px", textAlign:"left", fontWeight:700,
                color:T.muted, fontSize:10, borderBottom:`1px solid ${T.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bgp.map((b,i)=>(
            <tr key={i} style={{ borderBottom:`1px solid ${T.border}30` }}>
              <td style={{ padding:"5px 8px", fontFamily:"monospace", color:T.primary }}>{b.ip}</td>
              <td style={{ padding:"5px 8px", fontFamily:"monospace" }}>AS{b.asn}</td>
              <td style={{ padding:"5px 8px", color:T.muted, fontSize:10 }}>{b.description}</td>
              <td style={{ padding:"5px 8px" }}>
                <span style={{ fontSize:10, fontWeight:700,
                  color:stColor[b.state]||"#64748b" }}>{b.state}</span>
              </td>
              <td style={{ padding:"5px 8px", textAlign:"right",
                color:b.prefixesRx>0?"#1d4ed8":T.muted }}>
                {b.prefixesRx?.toLocaleString() ?? "—"}
              </td>
              <td style={{ padding:"5px 8px", textAlign:"right", color:T.muted }}>
                {b.prefixesTx?.toLocaleString() ?? "—"}
              </td>
              <td style={{ padding:"5px 8px", color:T.muted, fontSize:10 }}>{b.uptime||"—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TabServices({ node, services }) {
  const nodeServices = services.filter(s => s.nodes.includes(node.id));
  if (nodeServices.length === 0) return <EmptyState icon="⚡" msg="No services mapped to this node" />;
  return (
    <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:8 }}>
      {nodeServices.map(svc=>(
        <div key={svc.id} style={{ border:`1px solid ${T.border}`, borderRadius:8,
          padding:"10px 14px", background:T.surface }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
            <span style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
              background:CRIT_COLOR[svc.criticality] }} />
            <span style={{ fontSize:13, fontWeight:700, color:T.text }}>{svc.name}</span>
            <span style={{ marginLeft:"auto", fontSize:10, fontWeight:700,
              color:CRIT_COLOR[svc.criticality] }}>{svc.criticality}</span>
            <span style={{ fontSize:10, color:T.muted }}>SLA {svc.sla}</span>
          </div>
          <div style={{ fontSize:11, color:T.muted, marginBottom:4 }}>{svc.description}</div>
          <div style={{ display:"flex", gap:10, fontSize:10, color:T.muted }}>
            <span>RTO {svc.rto}</span>
            <span>RPO {svc.rpo}</span>
            <span>{svc.nodes.length} nodes</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TabChanges({ node, changes }) {
  const list = Array.isArray(changes) ? changes : [];
  const nodeChanges = list.filter(c => {
    try {
      return !c.isTemplate && (
        (c.affectedServices || "").toLowerCase().includes(node.id.toLowerCase()) ||
        (c.name || "").toLowerCase().includes(node.id.toLowerCase())
      );
    } catch { return false; }
  }).sort((a,b)=>(new Date(b.scheduledFor||0))-(new Date(a.scheduledFor||0))).slice(0,10);

  if (nodeChanges.length === 0) return (
    <EmptyState icon="✓" msg="No recent changes reference this node" />
  );
  const stColor = { "In Execution":"#7c3aed","Scheduled":"#0e7490","Pending Approval":"#b45309",
    "Completed":"#16a34a","Failed":"#dc2626","Aborted":"#dc2626" };
  return (
    <div style={{ padding:"14px 18px", display:"flex", flexDirection:"column", gap:6 }}>
      {nodeChanges.map(c=>(
        <div key={c.id} style={{ border:`1px solid ${T.border}`, borderRadius:7,
          padding:"8px 12px", background:T.surface }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
            <span style={{ fontSize:10, fontFamily:"monospace", fontWeight:700,
              color:T.primary }}>{c.id}</span>
            <span style={{ fontSize:10, fontWeight:700,
              color:stColor[c.status]||T.muted }}>{c.status}</span>
            <span style={{ marginLeft:"auto", fontSize:10, color:T.muted }}>
              {c.scheduledFor?.slice(0,10) || "—"}
            </span>
          </div>
          <div style={{ fontSize:12, color:T.text, fontWeight:500 }}>{c.name}</div>
        </div>
      ))}
    </div>
  );
}

// ─── FULL NODE DETAIL PANEL ──────────────────────────────────────────────────
function NodeDetail({ node, services, changes, nodeTab, setNodeTab, onViewConfig }) {
  const nodeAlarms = ALARMS.filter(a => a.nodeId === node.id);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"12px 18px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:6 }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:800, color:T.text,
              fontFamily:"monospace", marginBottom:2,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {node.hostname}
            </div>
            <div style={{ fontSize:11, color:T.muted }}>{node.vendor} {node.hwModel}</div>
          </div>
          <StatusBadge status={node.status} />
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
          <LayerTag layer={node.layer} />
          <span style={{ fontSize:10, color:T.muted, border:`1px solid ${T.border}`,
            borderRadius:3, padding:"1px 7px" }}>mgmt {node.mgmtIp}</span>
          {node.osVersion && <span style={{ fontSize:10, color:T.muted, border:`1px solid ${T.border}`,
            borderRadius:3, padding:"1px 7px", fontFamily:"monospace" }}>{node.osVersion}</span>}
        </div>
        {nodeAlarms.map(a=>(
          <div key={a.id} style={{ marginTop:7, fontSize:11,
            color:a.severity==="Critical"?"#dc2626":a.severity==="Major"?"#d97706":"#6b7280",
            background:a.severity==="Critical"?"#fef2f2":a.severity==="Major"?"#fffbeb":"#f9fafb",
            border:`1px solid ${a.severity==="Critical"?"#fca5a5":a.severity==="Major"?"#fcd34d":"#e5e7eb"}`,
            borderRadius:5, padding:"5px 9px", lineHeight:1.4 }}>
            {a.severity==="Critical"?"⛔":a.severity==="Major"?"⚠":"ℹ"}{" "}
            <strong>{a.severity}</strong> — {a.message}
          </div>
        ))}
      </div>

      {/* Tab selector */}
      <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`,
        background:T.surface, flexShrink:0, overflowX:"auto" }}>
        {NODE_TABS.map(tab=>(
          <button key={tab} onClick={()=>setNodeTab(tab.toLowerCase())}
            style={{ padding:"7px 12px", border:"none", cursor:"pointer",
              background:"transparent", fontFamily:"inherit", fontSize:11, fontWeight:600,
              color: nodeTab===tab.toLowerCase() ? T.primary : T.muted,
              borderBottom: nodeTab===tab.toLowerCase() ? `2px solid ${T.primary}` : "2px solid transparent",
              whiteSpace:"nowrap", transition:"all 0.1s" }}>
            {tab}
          </button>
        ))}
        <button onClick={onViewConfig} style={{ marginLeft:"auto", padding:"7px 12px",
          border:"none", cursor:"pointer", background:"transparent", fontFamily:"monospace",
          fontSize:11, fontWeight:700, color:"#38bdf8", whiteSpace:"nowrap" }}>
          {"</>"} Config
        </button>
      </div>

      {/* Tab content */}
      <div style={{ flex:1, overflowY:"auto" }}>
        {nodeTab==="hardware"   && <TabHardware  node={node} />}
        {nodeTab==="software"   && <TabSoftware  node={node} />}
        {nodeTab==="interfaces" && <TabInterfaces node={node} />}
        {nodeTab==="routing"    && <TabRouting   node={node} />}
        {nodeTab==="services"   && <TabServices  node={node} services={services} />}
        {nodeTab==="config"     && <div style={{ padding:"14px 18px" }}>
          <button onClick={onViewConfig} style={{ width:"100%", padding:"10px",
            background:"#0f172a", color:"#38bdf8", border:"1px solid #1e40af",
            borderRadius:7, fontSize:12, fontWeight:700, cursor:"pointer",
            fontFamily:"monospace" }}>Open Golden Config ↗</button>
        </div>}
        {nodeTab==="changes"    && <TabChanges   node={node} changes={changes} />}
      </div>
    </div>
  );
}

// ─── SERVICES SUB-VIEW ────────────────────────────────────────────────────────
function ServicesView({ country }) {
  const services = SERVICES.filter(s => s.country === country);
  const [selected, setSelected] = useState(null);
  return (
    <div style={{ display:"flex", gap:0, height:"100%", overflow:"hidden" }}>
      {/* List */}
      <div style={{ width:320, flexShrink:0, borderRight:`1px solid ${T.border}`, overflowY:"auto" }}>
        {["Critical","High","Medium","Low"].map(crit=>{
          const svcs = services.filter(s=>s.criticality===crit);
          if (!svcs.length) return null;
          return <div key={crit}>
            <div style={{ padding:"8px 14px", background:"#f8fafc",
              borderBottom:`1px solid ${T.border}`,
              fontSize:10, fontWeight:700, color:CRIT_COLOR[crit]||T.muted,
              textTransform:"uppercase", letterSpacing:"0.5px" }}>{crit}</div>
            {svcs.map(svc=>{
              const svcNodes = NODES.filter(n=>svc.nodes.includes(n.id));
              const hasIssue = svcNodes.some(n=>n.status!=="UP");
              const sel = selected?.id===svc.id;
              return (
                <div key={svc.id} onClick={()=>setSelected(sel?null:svc)}
                  style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}30`,
                    cursor:"pointer", background:sel?`${CRIT_COLOR[crit]}08`:"transparent",
                    borderLeft: sel?`3px solid ${CRIT_COLOR[crit]}`:"3px solid transparent" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", flexShrink:0,
                      background: hasIssue?"#dc2626":"#16a34a" }} />
                    <span style={{ fontSize:12, fontWeight:700, color:T.text }}>{svc.name}</span>
                    <LayerTag layer={svc.layer} />
                  </div>
                  <div style={{ fontSize:10, color:T.muted }}>
                    {svc.nodes.length} nodes · SLA {svc.sla}
                  </div>
                </div>
              );
            })}
          </div>;
        })}
      </div>

      {/* Detail */}
      {selected ? (
        <div style={{ flex:1, overflowY:"auto", padding:"18px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <h2 style={{ fontSize:18, fontWeight:800, color:T.text, margin:0 }}>{selected.name}</h2>
            <span style={{ fontSize:11, fontWeight:700, color:CRIT_COLOR[selected.criticality] }}>
              {selected.criticality}
            </span>
            <LayerTag layer={selected.layer} />
          </div>
          <p style={{ fontSize:13, color:T.muted, marginBottom:16, lineHeight:1.5 }}>
            {selected.description}
          </p>
          <div style={{ display:"flex", gap:12, marginBottom:20 }}>
            {[["SLA",selected.sla],["RTO",selected.rto],["RPO",selected.rpo]].map(([k,v])=>(
              <div key={k} style={{ background:"#f8fafc", border:`1px solid ${T.border}`,
                borderRadius:8, padding:"10px 16px", textAlign:"center" }}>
                <div style={{ fontSize:9, fontWeight:700, color:T.muted,
                  textTransform:"uppercase", letterSpacing:"0.5px" }}>{k}</div>
                <div style={{ fontSize:16, fontWeight:800, color:T.text, fontFamily:"monospace" }}>{v}</div>
              </div>
            ))}
          </div>

          <SectionHead label={`Nodes carrying this service (${selected.nodes.length})`} />
          <div style={{ marginTop:8, display:"flex", flexDirection:"column", gap:5 }}>
            {selected.nodes.map(nid=>{
              const n = NODES.find(x=>x.id===nid);
              if (!n) return null;
              return (
                <div key={nid} style={{ display:"flex", alignItems:"center", gap:10,
                  padding:"8px 12px", border:`1px solid ${T.border}`, borderRadius:7,
                  background: n.status!=="UP"?"#fff8f8":T.surface }}>
                  <Dot status={n.status} />
                  <span style={{ fontSize:12, fontFamily:"monospace", fontWeight:600,
                    color:T.text }}>{nid}</span>
                  <LayerTag layer={n.layer} />
                  <span style={{ marginLeft:"auto", fontSize:10, color:T.muted }}>
                    {n.vendor} {n.hwModel}
                  </span>
                </div>
              );
            })}
          </div>

          {ALARMS.filter(a=>a.affectedServices?.includes(selected.id)).map(a=>(
            <div key={a.id} style={{ marginTop:8, fontSize:11,
              color:a.severity==="Critical"?"#dc2626":a.severity==="Major"?"#d97706":"#6b7280",
              background:a.severity==="Critical"?"#fef2f2":a.severity==="Major"?"#fffbeb":"#f9fafb",
              border:`1px solid ${a.severity==="Critical"?"#fca5a5":a.severity==="Major"?"#fcd34d":"#e5e7eb"}`,
              borderRadius:5, padding:"8px 12px" }}>
              {a.severity==="Critical"?"⛔":a.severity==="Major"?"⚠":"ℹ"}{" "}
              <strong>{a.severity}</strong> — {a.message}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center",
          color:T.muted, fontSize:13 }}>
          Select a service to view details
        </div>
      )}
    </div>
  );
}

// ─── VLAN DB SUB-VIEW ─────────────────────────────────────────────────────────
function VlanView({ country }) {
  const vlans = VLANS[country] || [];
  return (
    <div style={{ padding:"18px", overflowY:"auto", height:"100%" }}>
      <div style={{ marginBottom:14 }}>
        <h2 style={{ fontSize:16, fontWeight:800, color:T.text, margin:"0 0 4px" }}>
          VLAN Registry — {COUNTRY_META[country]?.name}
        </h2>
        <p style={{ fontSize:12, color:T.muted, margin:0 }}>
          {vlans.length} VLANs defined · Source of truth for L2 segmentation
        </p>
      </div>
      <table style={{ width:"100%", fontSize:12, borderCollapse:"collapse" }}>
        <thead>
          <tr style={{ background:"#f1f5f9" }}>
            {["ID","Name","Purpose","Sites","Subnet","Status"].map(h=>(
              <th key={h} style={{ padding:"8px 12px", textAlign:"left", fontWeight:700,
                color:T.muted, fontSize:11, borderBottom:`2px solid ${T.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vlans.map((v,i)=>(
            <tr key={v.id} style={{ borderBottom:`1px solid ${T.border}30`,
              background: i%2===0?"transparent":"#fafafa" }}>
              <td style={{ padding:"7px 12px", fontFamily:"monospace", fontWeight:700,
                color:T.primary }}>{v.id}</td>
              <td style={{ padding:"7px 12px", fontFamily:"monospace", fontWeight:600,
                color:T.text }}>{v.name}</td>
              <td style={{ padding:"7px 12px", color:T.muted, fontSize:11 }}>{v.purpose}</td>
              <td style={{ padding:"7px 12px", fontSize:11 }}>
                <div style={{ display:"flex", flexWrap:"wrap", gap:3 }}>
                  {v.sites.slice(0,3).map(s=>(
                    <span key={s} style={{ fontSize:9, background:"#eff6ff", color:"#1d4ed8",
                      border:"1px solid #bfdbfe", borderRadius:3, padding:"1px 5px" }}>
                      {s.split("-").slice(1,3).join("-")}
                    </span>
                  ))}
                  {v.sites.length > 3 && <span style={{ fontSize:9, color:T.muted }}>
                    +{v.sites.length-3}
                  </span>}
                </div>
              </td>
              <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:11,
                color: v.subnet ? T.text : T.muted }}>{v.subnet || "—"}</td>
              <td style={{ padding:"7px 12px" }}>
                <span style={{ fontSize:10, fontWeight:700,
                  color: v.status==="ACTIVE"?"#16a34a":v.status==="RESERVED"?"#64748b":"#d97706" }}>
                  {v.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── IP PLAN SUB-VIEW ─────────────────────────────────────────────────────────
function IpamView({ country }) {
  const plan = IPAM[country];
  if (!plan) return <EmptyState icon="📡" msg="No IPAM data for this country" />;

  const usePct = (used,total) => Math.round((used/total)*100);
  const barColor = pct => pct>=90?"#dc2626":pct>=70?"#d97706":"#16a34a";

  return (
    <div style={{ padding:"18px", overflowY:"auto", height:"100%" }}>
      <div style={{ marginBottom:16 }}>
        <h2 style={{ fontSize:16, fontWeight:800, color:T.text, margin:"0 0 4px" }}>
          IP Address Plan — {COUNTRY_META[country]?.name}
        </h2>
        <p style={{ fontSize:12, color:T.muted, margin:0 }}>AS {plan.asn}</p>
      </div>

      {/* Summary blocks */}
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        {plan.blocks.map(b=>{
          const pct = usePct(b.used,b.total);
          return (
            <div key={b.block} style={{ border:`1px solid ${T.border}`, borderRadius:8,
              padding:"12px 16px", minWidth:200, background:T.surface }}>
              <div style={{ fontFamily:"monospace", fontWeight:700, color:T.primary,
                fontSize:13, marginBottom:3 }}>{b.block}</div>
              <div style={{ fontSize:11, color:T.muted, marginBottom:8 }}>{b.purpose}</div>
              <div style={{ background:"#e2e8f0", borderRadius:3, height:5, marginBottom:4 }}>
                <div style={{ background:barColor(pct), height:"100%",
                  borderRadius:3, width:`${pct}%`, transition:"width 0.3s" }} />
              </div>
              <div style={{ fontSize:10, color:T.muted }}>
                {b.used.toLocaleString()} / {b.total.toLocaleString()} used ({pct}%)
              </div>
            </div>
          );
        })}
      </div>

      {/* Subnet table */}
      <SectionHead label="Subnet Allocations" count={plan.subnets.length} />
      <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse", marginTop:8 }}>
        <thead>
          <tr style={{ background:"#f1f5f9" }}>
            {["Subnet","Purpose","Assigned To","Utilisation"].map(h=>(
              <th key={h} style={{ padding:"7px 10px", textAlign:"left", fontWeight:700,
                color:T.muted, fontSize:10, borderBottom:`2px solid ${T.border}` }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.subnets.map((s,i)=>{
            const pct = usePct(s.used, s.total);
            return (
              <tr key={i} style={{ borderBottom:`1px solid ${T.border}30`,
                background: i%2===0?"transparent":"#fafafa" }}>
                <td style={{ padding:"6px 10px", fontFamily:"monospace", fontWeight:600,
                  color:T.primary, whiteSpace:"nowrap" }}>{s.subnet}</td>
                <td style={{ padding:"6px 10px", color:T.muted, fontSize:11 }}>{s.purpose}</td>
                <td style={{ padding:"6px 10px", fontFamily:"monospace", fontSize:10,
                  color:T.text }}>{s.assignedTo}</td>
                <td style={{ padding:"6px 10px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:60, background:"#e2e8f0", borderRadius:3, height:4 }}>
                      <div style={{ background:barColor(pct), height:"100%",
                        borderRadius:3, width:`${Math.min(pct,100)}%` }} />
                    </div>
                    <span style={{ fontSize:10, color:barColor(pct), fontWeight:600 }}>
                      {pct}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function NetworkInventory({ changes = [] }) {
  const { nodes: NODES, nodeTemplates, addNode, addNodes, updateNode, deleteNode, addNodeTemplate, resetNodes } = useNodes();
  const [country,      setCountry]      = useState("FJ");
  const [subView,      setSubView]      = useState("nodes");  // nodes|services|vlans|ipam
  const [selectedNode, setSelectedNode] = useState(null);
  const [layerFilter,  setLayerFilter]  = useState("All");
  const [nodeTab,      setNodeTab]      = useState("hardware");
  const [showConfig,   setShowConfig]   = useState(false);
  const [onboardMode,  setOnboardMode]  = useState(null); // null|"picker"|"form"|"template"|"import"|"discover"
  const [editNode,     setEditNode]     = useState(null);  // node being edited

  const meta    = COUNTRY_META[country];
  const sites   = SITES.filter(s => s.country === country);
  const allNodes= NODES.filter(n => n.country === country);
  const nodes   = layerFilter === "All" ? allNodes : allNodes.filter(n => n.layer === layerFilter);
  const services= SERVICES.filter(s => s.country === country);

  const bySite = useMemo(() =>
    sites.map(site => ({
      ...site,
      nodes: nodes.filter(n => n.siteId === site.id),
    })).filter(s => s.nodes.length > 0),
  [sites, nodes]);

  const health = useMemo(()=>({
    up:       allNodes.filter(n=>n.status==="UP").length,
    degraded: allNodes.filter(n=>n.status==="DEGRADED").length,
    down:     allNodes.filter(n=>n.status==="DOWN").length,
    total:    allNodes.length,
  }),[allNodes]);

  const countryAlarms = ALARMS.filter(a => a.country === country);
  const presentLayers = useMemo(()=>
    ["All",...LAYERS.filter(l=>allNodes.some(n=>n.layer===l))],
  [allNodes]);

  function switchCountry(c) {
    setCountry(c); setSelectedNode(null); setLayerFilter("All");
  }

  const SUB_VIEWS = [
    { id:"nodes",    icon:"🖧", label:"Nodes" },
    { id:"services", icon:"⚡", label:"Services" },
    { id:"vlans",    icon:"🔌", label:"VLAN DB" },
    { id:"ipam",     icon:"📡", label:"IP Plan" },
  ];

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>

      {/* ── Country Tabs ── */}
      <div style={{ display:"flex", alignItems:"stretch", borderBottom:`1px solid ${T.border}`,
        background:T.surface, flexShrink:0 }}>
        {Object.entries(COUNTRY_META).map(([code,m])=>{
          const cn  = NODES.filter(n=>n.country===code);
          const iss = cn.filter(n=>n.status!=="UP").length;
          const act = country===code;
          return (
            <button key={code} onClick={()=>switchCountry(code)} style={{
              padding:"12px 24px", border:"none", cursor:"pointer",
              background: act ? T.bg : "transparent",
              borderBottom: act ? `3px solid ${T.primary}` : "3px solid transparent",
              fontFamily:"inherit", display:"flex", alignItems:"center", gap:10,
              transition:"all 0.15s" }}>
              <span style={{ fontSize:18 }}>{m.flag}</span>
              <div style={{ textAlign:"left" }}>
                <div style={{ fontSize:13, fontWeight:act?800:600,
                  color:act?T.text:T.muted }}>{m.name}</div>
                <div style={{ fontSize:10, color:iss>0?"#dc2626":"#16a34a", fontWeight:600 }}>
                  {iss>0?`⚠ ${iss} issue${iss>1?"s":""}`:`✓ ${cn.length} nodes`}
                </div>
              </div>
            </button>
          );
        })}

        {/* Health pills */}
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center",
          gap:10, padding:"0 20px" }}>
          {[["UP",health.up,"#16a34a"],["DEGRADED",health.degraded,"#d97706"],
            ["DOWN",health.down,"#dc2626"]].map(([l,c,col])=>(
            <div key={l} style={{ display:"flex", alignItems:"center", gap:4 }}>
              <span style={{ width:8, height:8, borderRadius:"50%", background:col }} />
              <span style={{ fontSize:11, fontWeight:700, color:col }}>{c}</span>
              <span style={{ fontSize:10, color:T.muted }}>{l}</span>
            </div>
          ))}
          <span style={{ fontSize:10, color:T.muted }}>· {meta.asn}</span>
          {countryAlarms.length>0 && (
            <span style={{ fontSize:11, fontWeight:700, color:"#dc2626", background:"#fef2f2",
              border:"1px solid #fca5a5", borderRadius:10, padding:"2px 9px" }}>
              🔔 {countryAlarms.length}
            </span>
          )}
        </div>
      </div>

      {/* ── Sub-nav ── */}
      <div style={{ display:"flex", alignItems:"center", gap:2,
        padding:"6px 14px", borderBottom:`1px solid ${T.border}`,
        background:T.surface, flexShrink:0 }}>
        {SUB_VIEWS.map(sv=>(
          <button key={sv.id} onClick={()=>{ setSubView(sv.id); setSelectedNode(null); }}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px",
              borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit",
              fontSize:12, fontWeight:subView===sv.id?700:500,
              background: subView===sv.id?`${T.primary}15`:"transparent",
              color: subView===sv.id?T.primary:T.muted,
              transition:"all 0.15s" }}>
            <span style={{ fontSize:13 }}>{sv.icon}</span>{sv.label}
          </button>
        ))}
        <div style={{marginLeft:"auto",display:"flex",gap:6}}>
          <button onClick={()=>setOnboardMode("picker")}
            style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderRadius:6,border:"none",
              cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:700,background:T.primary,color:"#fff"}}>
            <span style={{fontSize:14,fontWeight:300}}>+</span> Add Device
          </button>
        </div>
      </div>

      {/* Layer filter — only on nodes view, separate row */}
      {subView==="nodes" && (
        <div style={{ display:"flex", alignItems:"center", gap:5,
          padding:"5px 14px", borderBottom:`1px solid ${T.border}`,
          background:T.surface, flexShrink:0, overflowX:"auto" }}>
          <span style={{ fontSize:10, color:T.muted, fontWeight:600,
            textTransform:"uppercase", letterSpacing:"0.5px", flexShrink:0 }}>Layer:</span>
          {presentLayers.map(l=>(
            <button key={l} onClick={()=>setLayerFilter(l)} style={{
              padding:"2px 9px", fontSize:10, fontWeight:layerFilter===l?700:500,
              borderRadius:10, border:`1px solid ${layerFilter===l?T.primary:T.border}`,
              background: layerFilter===l?T.primary:"transparent",
              color: layerFilter===l?"#fff":T.muted,
              cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s",
              whiteSpace:"nowrap", flexShrink:0 }}>{l}</button>
          ))}
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex:1, display:"flex", overflow:"hidden" }}>

        {subView==="services" && <ServicesView country={country} />}
        {subView==="vlans"    && <VlanView country={country} />}
        {subView==="ipam"     && <IpamView country={country} />}

        {subView==="nodes" && <>
          {/* Node tree */}
          <div style={{ width:selectedNode?300:"100%", flexShrink:0,
            borderRight:selectedNode?`1px solid ${T.border}`:"none",
            overflowY:"auto", transition:"width 0.2s" }}>
            {bySite.map(site=>(
              <div key={site.id}>
                <div style={{ padding:"7px 14px", background:T.surface,
                  borderBottom:`1px solid ${T.border}`,
                  display:"flex", alignItems:"center", gap:7,
                  position:"sticky", top:0, zIndex:1 }}>
                  <span style={{ fontSize:11 }}>📍</span>
                  <span style={{ fontSize:12, fontWeight:700, color:T.text }}>{site.name}</span>
                  <span style={{ fontSize:10, color:T.muted, background:"#f1f5f9",
                    border:`1px solid ${T.border}`, borderRadius:3, padding:"0 5px" }}>
                    {site.type}
                  </span>
                  <span style={{ marginLeft:"auto", fontSize:10, color:T.muted }}>
                    {site.nodes.length}
                  </span>
                </div>

                {site.nodes.map(node=>{
                  const isSel = selectedNode?.id===node.id;
                  return (
                    <button key={node.id} onClick={()=>{ setSelectedNode(isSel?null:node); setNodeTab("hardware"); }}
                      style={{ display:"flex", alignItems:"center", gap:9, width:"100%",
                        padding:"8px 14px 8px 26px", border:"none", cursor:"pointer",
                        fontFamily:"inherit", textAlign:"left",
                        background: isSel?`${T.primary}10`:"transparent",
                        borderLeft: isSel?`3px solid ${T.primary}`:"3px solid transparent",
                        borderBottom:`1px solid ${T.border}20`, transition:"background 0.1s" }}>
                      <Dot status={node.status} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:11, fontWeight:isSel?700:500,
                          color:isSel?T.primary:T.text, fontFamily:"monospace",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {node.id}
                        </div>
                        <div style={{ fontSize:9, color:T.muted }}>
                          {node.vendor} {node.hwModel}
                        </div>
                      </div>
                      <LayerTag layer={node.layer} />
                    </button>
                  );
                })}
              </div>
            ))}
            {bySite.length===0&&<EmptyState icon="🔍" msg="No nodes match filter"/>}
          </div>

          {/* Node detail */}
          {selectedNode && (
            <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
              {/* Action bar for selected node */}
              <div style={{display:"flex",gap:6,padding:"8px 14px",borderBottom:`1px solid ${T.border}`,background:"#f8fafc",flexShrink:0}}>
                <button onClick={()=>{setEditNode(selectedNode);setOnboardMode("form");}}
                  style={{fontSize:11,fontWeight:600,color:T.primary,background:`${T.primary}10`,border:`1px solid ${T.primary}30`,borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                  ✏ Edit
                </button>
                <button onClick={()=>{
                  const tmpl = {...selectedNode};
                  delete tmpl.mgmtIp; delete tmpl.serialNumber; delete tmpl.status;
                  tmpl.interfaces = (tmpl.interfaces||[]).map(i=>({...i, peer:null}));
                  tmpl.bgpNeighbors = (tmpl.bgpNeighbors||[]).map(b=>({...b, state:"Established", uptime:""}));
                  tmpl.templateId = genId();
                  tmpl.templateName = `${tmpl.vendor} ${tmpl.hwModel} — ${tmpl.layer}`;
                  tmpl.isDeviceTemplate = true;
                  tmpl.createdAt = new Date().toISOString();
                  addNodeTemplate(tmpl);
                }}
                  style={{fontSize:11,fontWeight:600,color:"#7c3aed",background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit"}}>
                  💾 Save as Template
                </button>
                <button onClick={()=>{if(confirm(`Delete node ${selectedNode.id}?`)){deleteNode(selectedNode.id);setSelectedNode(null);}}}
                  style={{fontSize:11,fontWeight:600,color:"#dc2626",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontFamily:"inherit",marginLeft:"auto"}}>
                  🗑 Delete
                </button>
              </div>
              <div style={{flex:1, overflow:"hidden"}}>
                <NodeDetail
                  node={selectedNode}
                  services={services}
                  changes={changes}
                  nodeTab={nodeTab}
                  setNodeTab={setNodeTab}
                  onViewConfig={()=>setShowConfig(true)}
                />
              </div>
            </div>
          )}
        </>}
      </div>

      {showConfig && selectedNode && (
        <ConfigModal node={selectedNode} onClose={()=>setShowConfig(false)} />
      )}

      {/* ── Onboarding Modals ── */}
      {onboardMode==="picker" && <NodeAddPicker
        templates={nodeTemplates}
        onBlank={()=>{setEditNode(null);setOnboardMode("form");}}
        onTemplate={()=>setOnboardMode("template")}
        onImport={()=>setOnboardMode("import")}
        onDiscover={()=>setOnboardMode("discover")}
        onClose={()=>setOnboardMode(null)}
      />}

      {onboardMode==="template" && <TemplatePicker
        templates={nodeTemplates}
        onSelect={tmpl=>{
          const base = {...tmpl};
          delete base.templateId; delete base.templateName; delete base.isDeviceTemplate; delete base.createdAt;
          base.id = ""; base.hostname = ""; base.mgmtIp = ""; base.serialNumber = ""; base.status = "UP";
          setEditNode(base);
          setOnboardMode("form");
        }}
        onClose={()=>setOnboardMode("picker")}
      />}

      {onboardMode==="discover" && <DiscoverDialog
        onResult={node=>{setEditNode(node);setOnboardMode("form");}}
        onClose={()=>setOnboardMode("picker")}
      />}

      {onboardMode==="import" && <ImportDialog
        onResult={imported=>{
          addNodes(imported);
          setOnboardMode(null);
        }}
        onClose={()=>setOnboardMode("picker")}
      />}

      {onboardMode==="form" && <NodeFormModal
        mode={editNode?.id && NODES.some(n=>n.id===editNode.id) ? "edit" : "add"}
        initialData={editNode}
        onSave={node=>{
          if (NODES.some(n=>n.id===node.id)) {
            updateNode(node.id, node);
            setSelectedNode(node);
          } else {
            addNode(node);
            setSelectedNode(node);
          }
          setOnboardMode(null);
          setEditNode(null);
        }}
        onClose={()=>{setOnboardMode(null);setEditNode(null);}}
      />}
    </div>
  );
}
