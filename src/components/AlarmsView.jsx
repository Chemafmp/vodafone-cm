import { useState, useMemo, useCallback } from "react";
import { T } from "../data/constants.js";
import { ALARMS, SERVICES, SITES, COUNTRY_META } from "../data/inventory/index.js";
import { useNodes } from "../context/NodesContext.jsx";
import { LAYER_COLORS } from "../data/inventory/sites.js";
import { Card } from "./ui/index.jsx";

/* ─── constants ────────────────────────────────────────────────────────────── */
const SEV_META = {
  Critical: { bg:"#fef2f2", border:"#fca5a5", dot:"#dc2626", text:"#7f1d1d", icon:"🔴", ring:"#dc262640" },
  Major:    { bg:"#fff7ed", border:"#fed7aa", dot:"#ea580c", text:"#7c2d12", icon:"🟠", ring:"#ea580c40" },
  Minor:    { bg:"#fefce8", border:"#fde68a", dot:"#ca8a04", text:"#713f12", icon:"🟡", ring:"#ca8a0440" },
};
const TYPE_COLORS = {
  REACHABILITY:"#dc2626", PERFORMANCE:"#ea580c", INTERFACE:"#2563eb",
  PROTOCOL:"#7c3aed", HARDWARE:"#b45309", ROUTING:"#0d9488", SECURITY:"#be185d",
};
const STATUS_BG = {
  OPEN:         { bg:"#fef2f2", color:"#b91c1c", border:"#fca5a5" },
  ACKNOWLEDGED: { bg:"#eff6ff", color:"#1d4ed8", border:"#93c5fd" },
  RESOLVED:     { bg:"#f0fdf4", color:"#15803d", border:"#86efac" },
};

function timeSince(iso) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return `${Math.floor(d)}s ago`;
  if (d < 3600) return `${Math.floor(d/60)}m ago`;
  if (d < 86400) return `${Math.floor(d/3600)}h ${Math.floor((d%3600)/60)}m ago`;
  return `${Math.floor(d/86400)}d ${Math.floor((d%86400)/3600)}h ago`;
}

/* ─── Severity badge with pulse ──────────────────────────────────────────── */
function SevBadge({ severity, count }) {
  const m = SEV_META[severity];
  if (!m || !count) return null;
  return <span style={{ display:"inline-flex", alignItems:"center", gap:4, background:m.bg,
    border:`1px solid ${m.border}`, borderRadius:12, padding:"2px 8px", fontSize:10, fontWeight:700,
    color:m.text, whiteSpace:"nowrap" }}>
    <span style={{ width:7, height:7, borderRadius:"50%", background:m.dot,
      boxShadow: severity==="Critical" ? `0 0 0 3px ${m.ring}` : "none" }}/>
    {count}
  </span>;
}

/* ─── Tree row ───────────────────────────────────────────────────────────── */
function TreeRow({ depth, label, icon, sub, alarmCounts, isOpen, onToggle, hasChildren, isSelected, onClick, extra }) {
  const indent = depth * 24;
  const total = (alarmCounts.Critical||0) + (alarmCounts.Major||0) + (alarmCounts.Minor||0);
  return <div onClick={onClick} style={{
    display:"flex", alignItems:"center", gap:8, padding:"8px 12px 8px "+(12+indent)+"px",
    background: isSelected ? "#eff6ff" : "transparent",
    borderBottom:`1px solid ${T.border}`, cursor:"pointer", transition:"background 0.12s",
    borderLeft: isSelected ? "3px solid #2563eb" : "3px solid transparent",
  }}
    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background="#f8fafc"; }}
    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background="transparent"; }}>
    {/* expand arrow */}
    {hasChildren
      ? <span onClick={e => { e.stopPropagation(); onToggle(); }}
          style={{ width:18, height:18, display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:10, color:T.muted, cursor:"pointer", borderRadius:4,
            background:"#f1f5f9", transition:"transform 0.15s",
            transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
      : <span style={{ width:18 }}/>}

    {/* icon */}
    <span style={{ fontSize:14 }}>{icon}</span>

    {/* label */}
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ fontSize:12, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:T.muted, marginTop:1 }}>{sub}</div>}
    </div>

    {extra}

    {/* alarm count badges */}
    <div style={{ display:"flex", gap:4, flexShrink:0 }}>
      <SevBadge severity="Critical" count={alarmCounts.Critical}/>
      <SevBadge severity="Major" count={alarmCounts.Major}/>
      <SevBadge severity="Minor" count={alarmCounts.Minor}/>
      {total === 0 && <span style={{ fontSize:10, color:"#15803d", fontWeight:600, background:"#f0fdf4", borderRadius:8, padding:"2px 8px" }}>✓ Clear</span>}
    </div>
  </div>;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function AlarmsView() {
  const { nodes: NODES } = useNodes();
  const [expanded, setExpanded] = useState({ FJ:true, HW:true, IB:true }); // country-level open
  const [expandedSites, setExpandedSites] = useState({});
  const [expandedDevices, setExpandedDevices] = useState({});
  const [selected, setSelected] = useState(null); // alarm id or device id
  const [selectedType, setSelectedType] = useState(null); // "alarm" | "device"
  const [statusFilter, setStatusFilter] = useState("ACTIVE"); // ACTIVE | ALL | RESOLVED
  const [sevFilter, setSevFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false); // false = only devices with active alarms
  const [fCountry, setFCountry] = useState("ALL");
  const [fSite, setFSite] = useState("ALL");
  const [fService, setFService] = useState("ALL");
  const [fType, setFType] = useState("ALL");

  const handleCountryChange = useCallback((v) => { setFCountry(v); setFSite("ALL"); setFService("ALL"); }, []);

  const nodeMap = useMemo(() => Object.fromEntries(NODES.map(n=>[n.id,n])), [NODES]);
  const svcMap = useMemo(() => Object.fromEntries(SERVICES.map(s=>[s.id,s])), []);
  const filteredSites = useMemo(() => fCountry === "ALL" ? SITES : SITES.filter(s => s.country === fCountry), [fCountry]);
  const filteredServices = useMemo(() => fCountry === "ALL" ? SERVICES : SERVICES.filter(s => s.country === fCountry), [fCountry]);

  /* ── filtered alarms ── */
  const filteredAlarms = useMemo(() => {
    let a = [...ALARMS];
    if (statusFilter === "ACTIVE") a = a.filter(x => x.status !== "RESOLVED");
    else if (statusFilter === "RESOLVED") a = a.filter(x => x.status === "RESOLVED");
    if (sevFilter !== "ALL") a = a.filter(x => x.severity === sevFilter);
    if (fCountry !== "ALL") a = a.filter(x => x.country === fCountry);
    if (fSite !== "ALL") {
      const siteCity = fSite.split("-").slice(0, 2).join("-");
      const siteNodeIds = new Set(NODES.filter(n => {
        if (n.siteId) return n.siteId === fSite;
        return n.id.split("-").slice(0,2).join("-") === siteCity;
      }).map(n => n.id));
      a = a.filter(x => siteNodeIds.has(x.nodeId));
    }
    if (fService !== "ALL") {
      const svc = SERVICES.find(s => s.id === fService);
      if (svc) a = a.filter(x => svc.nodes.includes(x.nodeId));
    }
    if (fType !== "ALL") a = a.filter(x => x.type === fType);
    if (search) {
      const q = search.toLowerCase();
      a = a.filter(x => x.message.toLowerCase().includes(q) || x.nodeId.toLowerCase().includes(q) || x.detail.toLowerCase().includes(q));
    }
    return a;
  }, [NODES, statusFilter, sevFilter, search, fCountry, fSite, fService, fType]);

  /* ── build tree data ── */
  const tree = useMemo(() => {
    const countries = ["FJ","HW","IB"];
    return countries.map(c => {
      const cAlarms = filteredAlarms.filter(a => a.country === c);
      const cSites = SITES.filter(s => s.country === c);
      const cNodes = NODES.filter(n => n.country === c);

      // Group nodes by site using siteId field or city-based matching
      // Build a map: siteId → nodes
      const siteNodeMap = {};
      for (const site of cSites) siteNodeMap[site.id] = [];
      for (const node of cNodes) {
        if (node.siteId && siteNodeMap[node.siteId]) {
          siteNodeMap[node.siteId].push(node);
        } else {
          // Match by city: extract city portion from node id (e.g. "fj-suva-cr-01" → "fj-suva")
          const nodeParts = node.id.split("-");
          const nodeCity = nodeParts.slice(0,2).join("-"); // e.g. "fj-suva"
          // Find best matching site: DC first, then Core PoP
          const matchSite = cSites.find(s => {
            const sCity = s.id.split("-").slice(0,2).join("-");
            return sCity === nodeCity && s.type === "DC";
          }) || cSites.find(s => {
            const sCity = s.id.split("-").slice(0,2).join("-");
            return sCity === nodeCity;
          });
          if (matchSite) siteNodeMap[matchSite.id].push(node);
        }
      }

      const sitesData = cSites.map(site => {
        const siteNodes = siteNodeMap[site.id] || [];
        const siteAlarms = cAlarms.filter(a => siteNodes.some(n => n.id === a.nodeId));

        const nodesData = siteNodes.map(node => {
          const nodeAlarms = cAlarms.filter(a => a.nodeId === node.id);
          return { node, alarms: nodeAlarms, counts: countSev(nodeAlarms) };
        }).filter(nd => showAll || nd.alarms.length > 0);

        return { site, nodes: nodesData, alarms: siteAlarms, counts: countSev(siteAlarms) };
      }).filter(sd => showAll ? sd.nodes.length > 0 : sd.alarms.length > 0);

      return { country: c, meta: COUNTRY_META[c], sites: sitesData, alarms: cAlarms, counts: countSev(cAlarms) };
    });
  }, [NODES, filteredAlarms, search, showAll]);

  /* ── summary counts ── */
  const totalCounts = useMemo(() => {
    const active = ALARMS.filter(a => a.status !== "RESOLVED");
    return {
      total: ALARMS.length,
      active: active.length,
      critical: active.filter(a=>a.severity==="Critical").length,
      major: active.filter(a=>a.severity==="Major").length,
      minor: active.filter(a=>a.severity==="Minor").length,
      resolved: ALARMS.filter(a=>a.status==="RESOLVED").length,
    };
  }, []);

  const toggle = useCallback((key, setter) => setter(prev => ({...prev, [key]: !prev[key]})), []);

  /* ── selected detail ── */
  const selAlarm = selectedType === "alarm" ? ALARMS.find(a => a.id === selected) : null;
  const selDevice = selectedType === "device" ? nodeMap[selected] : null;
  const selNode = selAlarm ? nodeMap[selAlarm.nodeId] : null;
  const deviceAlarms = selDevice ? filteredAlarms.filter(a => a.nodeId === selDevice.id) : [];

  return <div style={{ display:"flex", flexDirection:"column", gap:12, height:"100%", overflow:"hidden", padding:"16px 20px" }}>
    {/* ── Summary strip ── */}
    <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
      <div style={{ display:"flex", gap:6 }}>
        {[
          { label:"Active", value:totalCounts.active, bg:"#fef2f2", color:"#b91c1c", border:"#fca5a5" },
          { label:"Critical", value:totalCounts.critical, bg:"#fef2f2", color:"#dc2626", border:"#fca5a5" },
          { label:"Major", value:totalCounts.major, bg:"#fff7ed", color:"#ea580c", border:"#fed7aa" },
          { label:"Minor", value:totalCounts.minor, bg:"#fefce8", color:"#ca8a04", border:"#fde68a" },
          { label:"Resolved", value:totalCounts.resolved, bg:"#f0fdf4", color:"#15803d", border:"#86efac" },
        ].map(c => <div key={c.label} style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:10,
          padding:"8px 14px", textAlign:"center", minWidth:70 }}>
          <div style={{ fontSize:22, fontWeight:800, color:c.color, letterSpacing:"-0.5px" }}>{c.value}</div>
          <div style={{ fontSize:9, fontWeight:700, color:c.color, textTransform:"uppercase", opacity:0.7 }}>{c.label}</div>
        </div>)}
      </div>
      <div style={{ flex:1 }}/>

      {/* Filters */}
      <div style={{ position:"relative" }}>
        <span style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", color:T.muted, fontSize:12 }}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search alarms..."
          style={{ padding:"7px 10px 7px 28px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:12,
            fontFamily:"inherit", background:T.surface, color:T.text, outline:"none", width:180 }}/>
      </div>
      <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
        style={{ padding:"7px 10px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:T.surface, color:T.text }}>
        <option value="ACTIVE">Active Only</option>
        <option value="ALL">All Status</option>
        <option value="RESOLVED">Resolved</option>
      </select>
      <select value={sevFilter} onChange={e=>setSevFilter(e.target.value)}
        style={{ padding:"7px 10px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:T.surface, color:T.text }}>
        <option value="ALL">All Severity</option>
        <option value="Critical">🔴 Critical</option>
        <option value="Major">🟠 Major</option>
        <option value="Minor">🟡 Minor</option>
      </select>
      <select value={fCountry} onChange={e=>handleCountryChange(e.target.value)}
        style={{ padding:"7px 10px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:T.surface, color:T.text }}>
        <option value="ALL">🌐 All Countries</option>
        {["FJ","HW","IB"].map(c => <option key={c} value={c}>{COUNTRY_META[c]?.flag} {COUNTRY_META[c]?.name}</option>)}
      </select>
      <select value={fSite} onChange={e=>setFSite(e.target.value)}
        style={{ padding:"7px 10px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:T.surface, color:T.text }}>
        <option value="ALL">All DCs / Sites</option>
        {filteredSites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
      </select>
      <select value={fService} onChange={e=>setFService(e.target.value)}
        style={{ padding:"7px 10px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:T.surface, color:T.text }}>
        <option value="ALL">All Services</option>
        {filteredServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <select value={fType} onChange={e=>setFType(e.target.value)}
        style={{ padding:"7px 10px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:T.surface, color:T.text }}>
        <option value="ALL">All Types</option>
        {["REACHABILITY","PERFORMANCE","INTERFACE","PROTOCOL","HARDWARE","ROUTING","SECURITY"].map(t =>
          <option key={t} value={t}>{t}</option>)}
      </select>
      <button onClick={() => setShowAll(p => !p)}
        style={{ padding:"7px 12px", border:`1px solid ${showAll ? T.primary : T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:showAll ? T.primaryBg : T.surface, color:showAll ? T.primary : T.muted,
          cursor:"pointer", transition:"all 0.15s", whiteSpace:"nowrap" }}>
        {showAll ? "🔍 All Devices" : "⚠️ Alarmed Only"}
      </button>
    </div>

    {/* ── Main: Tree + Detail panel ── */}
    <div style={{ display:"flex", gap:16, flex:1, minHeight:0, overflow:"hidden" }}>
      {/* ── Tree panel ── */}
      <div style={{ flex:1, overflow:"auto", background:T.surface, border:`1px solid ${T.border}`, borderRadius:12 }}>
        {tree.map(c => <div key={c.country}>
          {/* Country row */}
          <TreeRow depth={0} icon={c.meta?.flag||"🌐"} label={c.meta?.name||c.country}
            sub={`${NODES.filter(n=>n.country===c.country).length} devices · ${c.alarms.length} alarm${c.alarms.length!==1?"s":""}`}
            alarmCounts={c.counts} isOpen={!!expanded[c.country]} hasChildren={c.sites.length>0}
            onToggle={() => toggle(c.country, setExpanded)}
            isSelected={false} onClick={() => toggle(c.country, setExpanded)}/>

          {/* Sites */}
          {expanded[c.country] && c.sites.map(sd => <div key={sd.site.id}>
            <TreeRow depth={1} icon={sd.site.type==="DC"?"🏢":sd.site.type==="IXP"?"🔗":"📡"}
              label={sd.site.name} sub={`${sd.site.city} · ${sd.site.type} · ${sd.nodes.length} device${sd.nodes.length!==1?"s":""}`}
              alarmCounts={sd.counts} isOpen={!!expandedSites[sd.site.id]} hasChildren={sd.nodes.length>0}
              onToggle={() => toggle(sd.site.id, setExpandedSites)}
              isSelected={false} onClick={() => toggle(sd.site.id, setExpandedSites)}/>

            {/* Devices */}
            {expandedSites[sd.site.id] && sd.nodes.map(nd => <div key={nd.node.id}>
              <TreeRow depth={2}
                icon={<span style={{ width:8, height:8, borderRadius:"50%", display:"inline-block",
                  background: nd.node.status==="UP"?"#22c55e":nd.node.status==="DEGRADED"?"#f59e0b":"#ef4444" }}/>}
                label={nd.node.id}
                sub={`${nd.node.vendor} ${nd.node.hwModel} · ${nd.node.layer}`}
                alarmCounts={nd.counts}
                isOpen={!!expandedDevices[nd.node.id]}
                hasChildren={nd.alarms.length > 0}
                onToggle={() => toggle(nd.node.id, setExpandedDevices)}
                isSelected={selectedType==="device" && selected===nd.node.id}
                onClick={() => { setSelected(nd.node.id); setSelectedType("device"); }}
                extra={<span style={{ background:(LAYER_COLORS[nd.node.layer]||"#64748b")+"18",
                  color:LAYER_COLORS[nd.node.layer]||"#64748b", borderRadius:4, padding:"1px 6px",
                  fontSize:9, fontWeight:600, whiteSpace:"nowrap" }}>{nd.node.layer}</span>}/>

              {/* Alarm rows under device */}
              {expandedDevices[nd.node.id] && nd.alarms.map(a => {
                const sm = SEV_META[a.severity];
                const st = STATUS_BG[a.status];
                return <div key={a.id} onClick={() => { setSelected(a.id); setSelectedType("alarm"); }}
                  style={{
                    display:"flex", alignItems:"center", gap:8,
                    padding:"6px 12px 6px "+(12+72)+"px",
                    background: selectedType==="alarm"&&selected===a.id ? sm.bg : "transparent",
                    borderBottom:`1px solid ${T.border}`, cursor:"pointer",
                    borderLeft: selectedType==="alarm"&&selected===a.id ? `3px solid ${sm.dot}` : "3px solid transparent",
                  }}>
                  <span style={{ fontSize:10 }}>{sm.icon}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.message}</div>
                    <div style={{ fontSize:10, color:T.muted, display:"flex", gap:6, marginTop:1 }}>
                      <span style={{ background:TYPE_COLORS[a.type]+"15", color:TYPE_COLORS[a.type],
                        borderRadius:3, padding:"0 4px", fontSize:9, fontWeight:700 }}>{a.type}</span>
                      <span style={{ background:st.bg, color:st.color, borderRadius:3, padding:"0 4px",
                        fontSize:9, fontWeight:700 }}>{a.status}</span>
                    </div>
                  </div>
                  <span style={{ fontSize:10, color:sm.text, fontWeight:600, flexShrink:0 }}>{timeSince(a.since)}</span>
                </div>;
              })}
            </div>)}
          </div>)}
        </div>)}

        {filteredAlarms.length === 0 && <div style={{ textAlign:"center", padding:40, color:T.muted, fontSize:13 }}>
          No alarms match current filters
        </div>}
      </div>

      {/* ── Detail panel ── */}
      {(selAlarm || selDevice) && <Card style={{ width:380, flexShrink:0, overflow:"auto", padding:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
          <span style={{ fontSize:14, fontWeight:800, color:T.text }}>
            {selAlarm ? "Alarm Detail" : "Device Alarms"}
          </span>
          <button onClick={() => { setSelected(null); setSelectedType(null); }}
            style={{ background:"none", border:"none", cursor:"pointer", fontSize:16, color:T.muted }}>✕</button>
        </div>

        {/* ── Alarm detail ── */}
        {selAlarm && <>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <span style={{ fontSize:16 }}>{SEV_META[selAlarm.severity].icon}</span>
            <span style={{ fontSize:14, fontWeight:700, color:SEV_META[selAlarm.severity].text }}>{selAlarm.severity}</span>
            <span style={{ background:STATUS_BG[selAlarm.status].bg, color:STATUS_BG[selAlarm.status].color,
              border:`1px solid ${STATUS_BG[selAlarm.status].border}`,
              borderRadius:4, padding:"2px 8px", fontSize:11, fontWeight:700 }}>{selAlarm.status}</span>
          </div>

          <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:8 }}>{selAlarm.message}</div>
          <div style={{ fontSize:12, color:T.muted, lineHeight:1.6, marginBottom:16,
            background:"#f8fafc", padding:12, borderRadius:8, border:`1px solid ${T.border}` }}>{selAlarm.detail}</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12, marginBottom:16 }}>
            <div><span style={{ color:T.muted }}>Type:</span> <span style={{ fontWeight:600, color:TYPE_COLORS[selAlarm.type] }}>{selAlarm.type}</span></div>
            <div><span style={{ color:T.muted }}>Since:</span> <span style={{ fontWeight:600 }}>{timeSince(selAlarm.since)}</span></div>
            <div><span style={{ color:T.muted }}>Country:</span> <span style={{ fontWeight:600 }}>{COUNTRY_META[selAlarm.country]?.flag} {COUNTRY_META[selAlarm.country]?.name}</span></div>
            <div><span style={{ color:T.muted }}>Alarm ID:</span> <span style={{ fontFamily:"monospace", fontWeight:600 }}>{selAlarm.id}</span></div>
          </div>

          {selNode && <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Affected Node</div>
            <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                <span style={{ width:8, height:8, borderRadius:"50%", background:selNode.status==="UP"?"#22c55e":selNode.status==="DEGRADED"?"#f59e0b":"#ef4444" }}/>
                <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:12, color:T.text }}>{selNode.id}</span>
                <span style={{ background:(LAYER_COLORS[selNode.layer]||"#64748b")+"18", color:LAYER_COLORS[selNode.layer]||"#64748b",
                  borderRadius:4, padding:"1px 6px", fontSize:10, fontWeight:600 }}>{selNode.layer}</span>
              </div>
              <div style={{ fontSize:11, color:T.muted }}>{selNode.vendor} {selNode.hwModel} · {selNode.hostname}</div>
            </div>
          </div>}

          {selAlarm.affectedServices?.length > 0 && <div>
            <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Affected Services</div>
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {selAlarm.affectedServices.map(sId => {
                const svc = svcMap[sId];
                if (!svc) return <div key={sId} style={{ fontSize:11, fontFamily:"monospace", color:T.muted }}>{sId}</div>;
                const cc = { Critical:"#dc2626", High:"#d97706", Medium:"#2563eb", Low:"#64748b" }[svc.criticality]||"#64748b";
                return <div key={sId} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12,
                  padding:"6px 10px", background:"#fefce8", border:"1px solid #fde68a", borderRadius:6 }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:cc }}/>
                  <span style={{ fontWeight:600 }}>{svc.name}</span>
                  <span style={{ fontSize:10, color:T.muted }}>SLA {svc.sla} · RTO {svc.rto}</span>
                </div>;
              })}
            </div>
          </div>}
        </>}

        {/* ── Device alarm summary ── */}
        {selDevice && <>
          <div style={{ background:"#f0f9ff", border:"1px solid #bae6fd", borderRadius:8, padding:12, marginBottom:16 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
              <span style={{ width:10, height:10, borderRadius:"50%", background:selDevice.status==="UP"?"#22c55e":selDevice.status==="DEGRADED"?"#f59e0b":"#ef4444" }}/>
              <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:13, color:T.text }}>{selDevice.id}</span>
            </div>
            <div style={{ fontSize:12, color:T.muted, marginBottom:4 }}>{selDevice.vendor} {selDevice.hwModel}</div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap", fontSize:11 }}>
              <span style={{ background:(LAYER_COLORS[selDevice.layer]||"#64748b")+"18", color:LAYER_COLORS[selDevice.layer]||"#64748b",
                borderRadius:4, padding:"1px 6px", fontWeight:600 }}>{selDevice.layer}</span>
              <span style={{ color:T.muted }}>{COUNTRY_META[selDevice.country]?.flag} {selDevice.country}</span>
              <span style={{ color:T.muted }}>{selDevice.hostname}</span>
            </div>
          </div>

          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>
            Alarms ({deviceAlarms.length})
          </div>

          {deviceAlarms.length === 0 && <div style={{ textAlign:"center", padding:20, color:"#15803d", fontSize:12, fontWeight:600 }}>
            ✓ No active alarms on this device
          </div>}

          {deviceAlarms.map(a => {
            const sm = SEV_META[a.severity];
            const st = STATUS_BG[a.status];
            return <div key={a.id} onClick={() => { setSelected(a.id); setSelectedType("alarm"); }}
              style={{ background:sm.bg, border:`1px solid ${sm.border}`, borderRadius:8,
                padding:10, marginBottom:6, cursor:"pointer", borderLeft:`3px solid ${sm.dot}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                <span style={{ fontSize:11 }}>{sm.icon}</span>
                <span style={{ fontSize:12, fontWeight:600, color:T.text }}>{a.message}</span>
              </div>
              <div style={{ display:"flex", gap:6, fontSize:10, color:T.muted }}>
                <span style={{ background:TYPE_COLORS[a.type]+"15", color:TYPE_COLORS[a.type],
                  borderRadius:3, padding:"0 4px", fontWeight:700 }}>{a.type}</span>
                <span style={{ background:st.bg, color:st.color, borderRadius:3, padding:"0 4px", fontWeight:700 }}>{a.status}</span>
                <span>{timeSince(a.since)}</span>
              </div>
            </div>;
          })}

          {/* Services depending on this device */}
          {(() => {
            const svcs = SERVICES.filter(s => s.nodes.includes(selDevice.id));
            if (svcs.length === 0) return null;
            return <div style={{ marginTop:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Dependent Services ({svcs.length})</div>
              {svcs.map(s => {
                const cc = { Critical:"#dc2626", High:"#d97706", Medium:"#2563eb", Low:"#64748b" }[s.criticality]||"#64748b";
                return <div key={s.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 8px",
                  background:"#fefce8", border:"1px solid #fde68a", borderRadius:6, marginBottom:3, fontSize:11 }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:cc }}/>
                  <span style={{ fontWeight:600 }}>{s.name}</span>
                  <span style={{ fontSize:9, color:T.muted }}>SLA {s.sla}</span>
                </div>;
              })}
            </div>;
          })()}
        </>}
      </Card>}
    </div>
  </div>;
}

/* helper */
function countSev(alarms) {
  return {
    Critical: alarms.filter(a=>a.severity==="Critical").length,
    Major: alarms.filter(a=>a.severity==="Major").length,
    Minor: alarms.filter(a=>a.severity==="Minor").length,
  };
}
