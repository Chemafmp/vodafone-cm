import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { T } from "../data/constants.js";
import { EVENTS, ALARMS, AUTOMATION_SOURCES, COUNTRY_META } from "../data/inventory/index.js";
import { useNodes } from "../context/NodesContext.jsx";
import { LAYER_COLORS } from "../data/inventory/sites.js";

/* ─── constants ────────────────────────────────────────────────────────────── */
const SEV_STYLE = {
  critical: { bg:"#fef2f2", border:"#fca5a5", dot:"#dc2626", text:"#7f1d1d", icon:"🔴" },
  error:    { bg:"#fff7ed", border:"#fed7aa", dot:"#ea580c", text:"#7c2d12", icon:"🟠" },
  warning:  { bg:"#fefce8", border:"#fde68a", dot:"#ca8a04", text:"#713f12", icon:"🟡" },
  info:     { bg:"#f0fdf4", border:"#bbf7d0", dot:"#16a34a", text:"#14532d", icon:"🟢" },
};
const TYPE_META = {
  INTERFACE:  { icon:"🔌", color:"#2563eb" },
  BGP:        { icon:"🔀", color:"#7c3aed" },
  CONFIG:     { icon:"📝", color:"#0d9488" },
  ALARM:      { icon:"🔔", color:"#dc2626" },
  TRAFFIC:    { icon:"📊", color:"#ea580c" },
  SECURITY:   { icon:"🛡", color:"#be185d" },
  SYSTEM:     { icon:"⚙️", color:"#64748b" },
  CHANGE:     { icon:"🔄", color:"#1d4ed8" },
  AUTOMATION: { icon:"🤖", color:"#7c3aed" },
};

/* ─── Swimlane definitions ───────────────────────────────────────────────── */
const LANES = [
  { id:"automation", label:"Automations", color:"#7c3aed", bg:"#f5f3ff", filter: e => e.type==="AUTOMATION" },
  { id:"config",     label:"Config / Changes", color:"#0d9488", bg:"#f0fdfa", filter: e => e.type==="CONFIG" },
  { id:"network",    label:"Network Events", color:"#2563eb", bg:"#eff6ff", filter: e => ["INTERFACE","BGP","TRAFFIC","ROUTING"].includes(e.type) },
  { id:"alarm",      label:"Alarms / Incidents", color:"#dc2626", bg:"#fef2f2", filter: e => ["ALARM","SECURITY"].includes(e.type) },
  { id:"system",     label:"System / Infra", color:"#64748b", bg:"#f8fafc", filter: e => e.type==="SYSTEM" },
];

/* ─── Time formatting ────────────────────────────────────────────────────── */
function fmtTime(iso) { return new Date(iso).toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit",hour12:false}); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); }
function fmtFull(iso) { return new Date(iso).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}); }

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function EventsView() {
  const { nodes: NODES } = useNodes();
  const [country, setCountry] = useState("ALL");
  const [lane, setLane] = useState("ALL");
  const [source, setSource] = useState("ALL");
  const [search, setSearch] = useState("");
  const [timeRange, setTimeRange] = useState("3d"); // 6h | 12h | 1d | 3d | 7d
  const [selected, setSelected] = useState(null);
  const [collapsed, setCollapsed] = useState({}); // correlation group collapsed state
  const scrollRef = useRef(null);

  const nodeMap = useMemo(() => Object.fromEntries(NODES.map(n=>[n.id,n])), [NODES]);

  /* ── time window ── */
  const timeWindow = useMemo(() => {
    const now = Date.now();
    const h = { "6h":6, "12h":12, "1d":24, "3d":72, "7d":168 }[timeRange] || 72;
    return { start: now - h*3600*1000, end: now };
  }, [timeRange]);

  /* ── filter events ── */
  const filtered = useMemo(() => {
    let e = [...EVENTS].filter(ev => {
      const t = new Date(ev.ts).getTime();
      return t >= timeWindow.start && t <= timeWindow.end;
    });
    if (country !== "ALL") e = e.filter(x => x.country === country);
    if (lane !== "ALL") {
      const laneDef = LANES.find(l => l.id === lane);
      if (laneDef) e = e.filter(laneDef.filter);
    }
    if (source !== "ALL") e = e.filter(x => (x.source||"manual") === source);
    if (search) {
      const q = search.toLowerCase();
      e = e.filter(x => x.message.toLowerCase().includes(q) || x.nodeId.toLowerCase().includes(q) || (x.detail||"").toLowerCase().includes(q));
    }
    return e.sort((a,b) => new Date(b.ts) - new Date(a.ts));
  }, [country, lane, source, search, timeWindow]);

  /* ── group correlated events by changeId ── */
  const correlationGroups = useMemo(() => {
    const groups = {};
    const ungrouped = [];
    for (const e of filtered) {
      if (e.changeId) {
        if (!groups[e.changeId]) groups[e.changeId] = [];
        groups[e.changeId].push(e);
      } else {
        ungrouped.push(e);
      }
    }
    // Build timeline items: correlated groups + ungrouped
    const items = [];
    for (const [changeId, events] of Object.entries(groups)) {
      const sorted = events.sort((a,b) => new Date(a.ts) - new Date(b.ts));
      items.push({
        type: "group", changeId, events: sorted,
        ts: sorted[0].ts, endTs: sorted[sorted.length-1].ts,
        severity: sorted.reduce((max,e) => {
          const o = { critical:0, error:1, warning:2, info:3 };
          return (o[e.severity]||3) < (o[max]||3) ? e.severity : max;
        }, "info"),
      });
    }
    for (const e of ungrouped) {
      items.push({ type:"single", event:e, ts:e.ts, severity:e.severity });
    }
    return items.sort((a,b) => new Date(b.ts) - new Date(a.ts));
  }, [filtered]);

  /* ── stats ── */
  const stats = useMemo(() => {
    const auto = filtered.filter(e => e.type==="AUTOMATION").length;
    const config = filtered.filter(e => e.type==="CONFIG").length;
    const net = filtered.filter(e => ["INTERFACE","BGP","TRAFFIC","ROUTING"].includes(e.type)).length;
    const alarm = filtered.filter(e => ["ALARM","SECURITY"].includes(e.type)).length;
    const correlated = Object.keys(correlationGroups.filter(g => g.type==="group")).length;
    return { total:filtered.length, auto, config, net, alarm, correlated };
  }, [filtered, correlationGroups]);

  const sources = useMemo(() => [...new Set(EVENTS.map(e => e.source||"manual"))], []);

  const toggleGroup = useCallback(id => setCollapsed(p => ({...p,[id]:!p[id]})), []);

  return <div style={{ display:"flex", flexDirection:"column", gap:12, height:"100%", overflow:"hidden", padding:"16px 20px" }}>
    {/* ── Header stats ── */}
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
      {[
        { label:"Total", value:stats.total, icon:"📋", color:T.text, bg:T.surface },
        { label:"Automations", value:stats.auto, icon:"🤖", color:"#7c3aed", bg:"#f5f3ff" },
        { label:"Config", value:stats.config, icon:"📝", color:"#0d9488", bg:"#f0fdfa" },
        { label:"Network", value:stats.net, icon:"🔌", color:"#2563eb", bg:"#eff6ff" },
        { label:"Alarms", value:stats.alarm, icon:"🔔", color:"#dc2626", bg:"#fef2f2" },
      ].map(s => <div key={s.label} style={{ background:s.bg, border:`1px solid ${T.border}`, borderRadius:10,
        padding:"8px 14px", display:"flex", alignItems:"center", gap:8, minWidth:100 }}>
        <span style={{ fontSize:16 }}>{s.icon}</span>
        <div>
          <div style={{ fontSize:20, fontWeight:800, color:s.color, letterSpacing:"-0.5px" }}>{s.value}</div>
          <div style={{ fontSize:9, fontWeight:700, color:s.color, textTransform:"uppercase", opacity:0.7 }}>{s.label}</div>
        </div>
      </div>)}
      <div style={{ flex:1 }}/>
      <span style={{ fontSize:11, color:T.muted, fontWeight:600 }}>
        {correlationGroups.filter(g=>g.type==="group").length} correlated chains
      </span>
    </div>

    {/* ── Filters ── */}
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
      {/* Time range pills */}
      <div style={{ display:"flex", gap:2, background:T.surface, border:`1px solid ${T.border}`, borderRadius:8, padding:2 }}>
        {["6h","12h","1d","3d","7d"].map(r => <button key={r} onClick={() => setTimeRange(r)}
          style={{ padding:"5px 10px", borderRadius:6, border:"none", fontSize:11, fontWeight:600,
            cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s",
            background:timeRange===r?T.primary:"transparent",
            color:timeRange===r?"#fff":T.muted }}>
          {r}
        </button>)}
      </div>

      <div style={{ width:1, height:20, background:T.border }}/>

      <select value={country} onChange={e=>setCountry(e.target.value)}
        style={{ padding:"6px 10px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:T.surface, color:T.text }}>
        <option value="ALL">🌐 All</option>
        <option value="FJ">🇫🇯 Fiji</option><option value="HW">🌺 Hawaii</option><option value="IB">🏝 Ibiza</option>
      </select>

      <select value={lane} onChange={e=>setLane(e.target.value)}
        style={{ padding:"6px 10px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:T.surface, color:T.text }}>
        <option value="ALL">All Lanes</option>
        {LANES.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
      </select>

      <select value={source} onChange={e=>setSource(e.target.value)}
        style={{ padding:"6px 10px", border:`1px solid ${T.border}`, borderRadius:8, fontSize:11, fontWeight:600,
          fontFamily:"inherit", background:T.surface, color:T.text }}>
        <option value="ALL">All Sources</option>
        {sources.map(s => <option key={s} value={s}>{AUTOMATION_SOURCES[s]?.icon||"✋"} {AUTOMATION_SOURCES[s]?.label||s}</option>)}
      </select>

      <div style={{ position:"relative", flex:1, minWidth:150 }}>
        <span style={{ position:"absolute", left:8, top:"50%", transform:"translateY(-50%)", color:T.muted, fontSize:12 }}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events..."
          style={{ width:"100%", padding:"6px 10px 6px 28px", border:`1px solid ${T.border}`, borderRadius:8,
            fontSize:12, fontFamily:"inherit", background:T.surface, color:T.text, outline:"none" }}/>
      </div>
    </div>

    {/* ── Swimlane legend ── */}
    <div style={{ display:"flex", gap:6, alignItems:"center" }}>
      {LANES.map(l => <span key={l.id} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, fontWeight:600,
        color:l.color, background:l.bg, borderRadius:6, padding:"3px 8px", border:`1px solid ${l.color}20` }}>
        <span style={{ width:6, height:6, borderRadius:"50%", background:l.color }}/>
        {l.label}
      </span>)}
    </div>

    {/* ── Timeline ── */}
    <div ref={scrollRef} style={{ flex:1, overflow:"auto", display:"flex", flexDirection:"column", gap:0 }}>
      {correlationGroups.length === 0 && <div style={{ textAlign:"center", padding:40, color:T.muted }}>No events in selected time range</div>}

      {correlationGroups.map((item, idx) => {
        if (item.type === "group") return <CorrelationGroup key={item.changeId+idx} group={item}
          nodeMap={nodeMap} collapsed={!!collapsed[item.changeId]}
          onToggle={() => toggleGroup(item.changeId)}
          selected={selected} onSelect={setSelected}/>;

        return <EventRow key={item.event.id} event={item.event} nodeMap={nodeMap}
          isSelected={selected===item.event.id} onSelect={() => setSelected(item.event.id===selected?null:item.event.id)}/>;
      })}
    </div>
  </div>;
}

/* ─── Correlation Group (linked events from same change) ─────────────────── */
function CorrelationGroup({ group, nodeMap, collapsed, onToggle, selected, onSelect }) {
  const firstEvt = group.events[0];
  const lastEvt = group.events[group.events.length - 1];
  const duration = (new Date(lastEvt.ts) - new Date(firstEvt.ts)) / 1000;
  const durationStr = duration < 60 ? `${Math.round(duration)}s` : `${Math.round(duration/60)}m`;

  // Find which automation source drove this chain
  const autoEvt = group.events.find(e => e.type === "AUTOMATION");
  const srcMeta = autoEvt ? AUTOMATION_SOURCES[autoEvt.source] : null;

  // Max severity in chain
  const sevOrder = { critical:0, error:1, warning:2, info:3 };
  const maxSev = group.events.reduce((max,e) => (sevOrder[e.severity]||3) < (sevOrder[max]||3) ? e.severity : max, "info");
  const ss = SEV_STYLE[maxSev] || SEV_STYLE.info;

  // Unique nodes involved
  const uniqueNodes = [...new Set(group.events.map(e => e.nodeId))];

  // Group lanes
  const lanesHit = LANES.filter(l => group.events.some(l.filter));

  return <div style={{ marginBottom:4, borderRadius:10, border:`1px solid ${ss.border}`,
    background:ss.bg+"80", overflow:"hidden" }}>
    {/* Group header */}
    <div onClick={onToggle} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px",
      cursor:"pointer", borderBottom: collapsed ? "none" : `1px solid ${ss.border}` }}>
      {/* Expand/collapse */}
      <span style={{ fontSize:10, color:T.muted, width:16, textAlign:"center",
        transition:"transform 0.15s", transform:collapsed?"rotate(0deg)":"rotate(90deg)" }}>▶</span>

      {/* Source badge */}
      {srcMeta && <span style={{ display:"flex", alignItems:"center", gap:4, background:srcMeta.color+"15",
        color:srcMeta.color, borderRadius:6, padding:"2px 8px", fontSize:10, fontWeight:700,
        border:`1px solid ${srcMeta.color}30` }}>
        {srcMeta.icon} {srcMeta.label}
      </span>}

      {/* Change ID */}
      <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:11, color:T.primary,
        background:T.primaryBg, borderRadius:4, padding:"1px 6px" }}>{group.changeId}</span>

      {/* Description */}
      <span style={{ flex:1, fontSize:12, fontWeight:600, color:T.text, overflow:"hidden",
        textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
        {firstEvt.message}
      </span>

      {/* Lane indicators */}
      <div style={{ display:"flex", gap:3 }}>
        {lanesHit.map(l => <span key={l.id} style={{ width:8, height:8, borderRadius:"50%",
          background:l.color, border:`1px solid ${l.color}50` }}/>)}
      </div>

      {/* Meta */}
      <span style={{ fontSize:10, color:T.muted, fontWeight:600, whiteSpace:"nowrap" }}>
        {group.events.length} events · {durationStr}
      </span>
      <span style={{ fontSize:10, color:ss.text, fontWeight:600 }}>{fmtTime(firstEvt.ts)}</span>
    </div>

    {/* Expanded: show timeline of events in chain */}
    {!collapsed && <div style={{ padding:"4px 0" }}>
      {/* Mini node summary */}
      <div style={{ display:"flex", gap:4, padding:"4px 14px 8px 40px", flexWrap:"wrap" }}>
        {uniqueNodes.map(nId => {
          const node = nodeMap[nId];
          return <span key={nId} style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, fontWeight:600,
            fontFamily:"monospace", background:"#fff", border:`1px solid ${T.border}`, borderRadius:4, padding:"1px 6px" }}>
            <span style={{ width:5, height:5, borderRadius:"50%",
              background:node?.status==="UP"?"#22c55e":node?.status==="DEGRADED"?"#f59e0b":"#ef4444" }}/>
            {nId}
            {node && <span style={{ fontFamily:"inherit", fontWeight:500, color:LAYER_COLORS[node.layer]||"#64748b", fontSize:9 }}>{node.layer}</span>}
          </span>;
        })}
      </div>

      {/* Event chain */}
      {group.events.map((evt, i) => <EventRow key={evt.id} event={evt} nodeMap={nodeMap}
        isSelected={selected===evt.id} onSelect={() => onSelect(evt.id===selected?null:evt.id)}
        inGroup showConnector={i < group.events.length-1}/>)}
    </div>}
  </div>;
}

/* ─── Single event row ───────────────────────────────────────────────────── */
function EventRow({ event, nodeMap, isSelected, onSelect, inGroup, showConnector }) {
  const ss = SEV_STYLE[event.severity] || SEV_STYLE.info;
  const tm = TYPE_META[event.type] || { icon:"❓", color:"#64748b" };
  const node = nodeMap[event.nodeId];
  const srcMeta = event.source ? AUTOMATION_SOURCES[event.source] : null;

  // Determine which lane this event belongs to
  const laneDef = LANES.find(l => l.filter(event));

  return <div style={{ display:"flex", gap:0 }}>
    {/* Timeline spine */}
    <div style={{ width: inGroup ? 40 : 36, display:"flex", flexDirection:"column", alignItems:"center", flexShrink:0 }}>
      <div style={{ width:10, height:10, borderRadius:"50%", background: laneDef?.color || ss.dot,
        border:`2px solid ${laneDef?.color || ss.border}40`, flexShrink:0, marginTop:12,
        boxShadow: event.severity==="critical" ? `0 0 0 3px ${ss.dot}30` : "none" }}/>
      {showConnector !== false && <div style={{ width:2, flex:1, background: inGroup ? (laneDef?.color||T.border)+"40" : T.border }}/>}
    </div>

    {/* Event card */}
    <div onClick={onSelect}
      style={{ flex:1, background:isSelected ? ss.bg : (inGroup ? "#ffffff" : T.surface),
        border:`1px solid ${isSelected ? ss.border : T.border}`,
        borderRadius:8, padding:"8px 12px", marginBottom:2, marginRight: inGroup ? 14 : 0,
        cursor:"pointer", transition:"all 0.12s",
        borderLeft:`3px solid ${laneDef?.color || ss.dot}` }}>

      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:3 }}>
            <span style={{ fontSize:11 }}>{tm.icon}</span>
            <span style={{ fontSize:12, fontWeight:600, color:T.text, overflow:"hidden",
              textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{event.message}</span>
          </div>
          <div style={{ display:"flex", gap:5, alignItems:"center", flexWrap:"wrap", fontSize:10, color:T.muted }}>
            <span style={{ fontFamily:"monospace", fontWeight:600, color:T.primary, fontSize:10 }}>{event.nodeId}</span>
            <span style={{ background:tm.color+"15", color:tm.color, borderRadius:3, padding:"0px 5px",
              fontSize:9, fontWeight:700 }}>{event.type}</span>
            {srcMeta && !inGroup && <span style={{ background:srcMeta.color+"12", color:srcMeta.color,
              borderRadius:3, padding:"0px 5px", fontSize:9, fontWeight:600 }}>{srcMeta.icon} {srcMeta.label}</span>}
            <span>{COUNTRY_META[event.country]?.flag} {event.country}</span>
            {node && <span style={{ background:(LAYER_COLORS[node.layer]||"#64748b")+"18",
              color:LAYER_COLORS[node.layer]||"#64748b", borderRadius:3, padding:"0px 5px",
              fontSize:9, fontWeight:600 }}>{node.layer}</span>}
            {event.changeId && !inGroup && <span style={{ fontFamily:"monospace", fontWeight:700, fontSize:9,
              color:T.primary, background:T.primaryBg, borderRadius:3, padding:"0px 5px" }}>{event.changeId}</span>}
          </div>
        </div>
        <div style={{ textAlign:"right", flexShrink:0 }}>
          <div style={{ fontSize:11, fontWeight:600, color:ss.text }}>{fmtTime(event.ts)}</div>
          <div style={{ fontSize:9, color:T.muted }}>{fmtDate(event.ts)}</div>
        </div>
      </div>

      {/* Expanded detail */}
      {isSelected && <div style={{ marginTop:8, paddingTop:8, borderTop:`1px solid ${ss.border}` }}>
        <div style={{ fontSize:12, color:T.text, lineHeight:1.6, background:"#f8fafc",
          padding:10, borderRadius:6, border:`1px solid ${T.border}` }}>{event.detail}</div>
        <div style={{ display:"flex", gap:10, marginTop:6, fontSize:10, color:T.muted, flexWrap:"wrap" }}>
          <span>Timestamp: <b>{fmtFull(event.ts)}</b></span>
          <span>Event ID: <b style={{ fontFamily:"monospace" }}>{event.id}</b></span>
          {node && <span>Vendor: <b>{node.vendor} {node.hwModel}</b></span>}
          {event.source && <span>Source: <b>{AUTOMATION_SOURCES[event.source]?.label || event.source}</b></span>}
          {event.changeId && <span>Change: <b style={{ fontFamily:"monospace" }}>{event.changeId}</b></span>}
        </div>
      </div>}
    </div>
  </div>;
}
