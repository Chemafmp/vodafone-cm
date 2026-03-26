import { useState, useMemo } from "react";
import { T } from "../data/constants.js";
import { EVENTS, COUNTRY_META } from "../data/inventory/index.js";
import { useNodes } from "../context/NodesContext.jsx";
import { LAYER_COLORS } from "../data/inventory/sites.js";

const SEV_STYLE = {
  critical: { bg:"#fef2f2", border:"#fca5a5", dot:"#dc2626", text:"#7f1d1d", icon:"🔴" },
  error:    { bg:"#fff7ed", border:"#fed7aa", dot:"#ea580c", text:"#7c2d12", icon:"🟠" },
  warning:  { bg:"#fefce8", border:"#fde68a", dot:"#ca8a04", text:"#713f12", icon:"🟡" },
  info:     { bg:"#f0fdf4", border:"#bbf7d0", dot:"#16a34a", text:"#14532d", icon:"🟢" },
};
const TYPE_META = {
  INTERFACE: { icon:"🔌", color:"#2563eb" },
  BGP:       { icon:"🔀", color:"#7c3aed" },
  CONFIG:    { icon:"📝", color:"#0d9488" },
  ALARM:     { icon:"🔔", color:"#dc2626" },
  TRAFFIC:   { icon:"📊", color:"#ea580c" },
  SECURITY:  { icon:"🛡", color:"#be185d" },
  SYSTEM:    { icon:"⚙", color:"#64748b" },
};

function fmtTS(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

function dayLabel(iso) {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today - day) / 86400000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" });
}

export default function EventsView() {
  const { nodes: NODES } = useNodes();
  const [country, setCountry] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);

  const nodeMap = useMemo(() => Object.fromEntries(NODES.map(n=>[n.id,n])), [NODES]);

  const filtered = useMemo(() => {
    let e = [...EVENTS];
    if (country !== "ALL") e = e.filter(x => x.country === country);
    if (severity !== "ALL") e = e.filter(x => x.severity === severity);
    if (type !== "ALL") e = e.filter(x => x.type === type);
    if (search) {
      const q = search.toLowerCase();
      e = e.filter(x => x.message.toLowerCase().includes(q) || x.nodeId.toLowerCase().includes(q) || (x.detail||"").toLowerCase().includes(q));
    }
    return e.sort((a,b) => new Date(b.ts) - new Date(a.ts));
  }, [country, severity, type, search]);

  // Group by day
  const grouped = useMemo(() => {
    const g = {};
    for (const e of filtered) {
      const key = dayLabel(e.ts);
      if (!g[key]) g[key] = [];
      g[key].push(e);
    }
    return Object.entries(g);
  }, [filtered]);

  const sevCounts = useMemo(() => ({
    critical: EVENTS.filter(e=>e.severity==="critical").length,
    error: EVENTS.filter(e=>e.severity==="error").length,
    warning: EVENTS.filter(e=>e.severity==="warning").length,
    info: EVENTS.filter(e=>e.severity==="info").length,
  }), []);

  const types = [...new Set(EVENTS.map(e=>e.type))];

  return <div style={{display:"flex",flexDirection:"column",gap:16,height:"100%",overflow:"auto",padding:"20px 24px"}}>
    {/* ── Summary bar ── */}
    <div style={{display:"flex",gap:12,alignItems:"stretch"}}>
      {[
        { label:"Critical", count:sevCounts.critical, ...SEV_STYLE.critical },
        { label:"Error", count:sevCounts.error, ...SEV_STYLE.error },
        { label:"Warning", count:sevCounts.warning, ...SEV_STYLE.warning },
        { label:"Info", count:sevCounts.info, ...SEV_STYLE.info },
      ].map(s => <div key={s.label} style={{flex:1,background:s.bg,border:`1px solid ${s.border}`,borderRadius:10,padding:"12px 16px",
        display:"flex",alignItems:"center",gap:10,cursor:"pointer",transition:"all 0.15s",
        outline:severity===s.label.toLowerCase()?`2px solid ${s.dot}`:"none"}}
        onClick={() => setSeverity(p => p===s.label.toLowerCase()?"ALL":s.label.toLowerCase())}>
        <span style={{fontSize:20}}>{s.icon}</span>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:s.text,letterSpacing:"-0.5px"}}>{s.count}</div>
          <div style={{fontSize:10,fontWeight:600,color:s.text,opacity:0.7,textTransform:"uppercase"}}>{s.label}</div>
        </div>
      </div>)}
      <div style={{flex:1,background:T.surface,border:`1px solid ${T.border}`,borderRadius:10,padding:"12px 16px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>📋</span>
        <div>
          <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:"-0.5px"}}>{EVENTS.length}</div>
          <div style={{fontSize:10,fontWeight:600,color:T.muted,textTransform:"uppercase"}}>Total Events</div>
        </div>
      </div>
    </div>

    {/* ── Filters ── */}
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{position:"relative",flex:1,minWidth:200}}>
        <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:13}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search events..."
          style={{width:"100%",padding:"8px 12px 8px 32px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit",background:T.surface,color:T.text,outline:"none"}} />
      </div>
      <select value={country} onChange={e=>setCountry(e.target.value)}
        style={{padding:"8px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:12,fontFamily:"inherit",background:T.surface,color:T.text,fontWeight:500}}>
        <option value="ALL">All Countries</option>
        <option value="FJ">🇫🇯 Fiji</option><option value="HW">🌺 Hawaii</option><option value="IB">🏝 Ibiza</option>
      </select>
      <select value={type} onChange={e=>setType(e.target.value)}
        style={{padding:"8px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:12,fontFamily:"inherit",background:T.surface,color:T.text,fontWeight:500}}>
        <option value="ALL">All Types</option>
        {types.map(t => <option key={t} value={t}>{TYPE_META[t]?.icon} {t}</option>)}
      </select>
      <span style={{fontSize:11,color:T.muted,fontWeight:500}}>{filtered.length} event{filtered.length!==1?"s":""}</span>
    </div>

    {/* ── Timeline ── */}
    <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column",gap:0}}>
      {filtered.length === 0 && <div style={{textAlign:"center",padding:40,color:T.muted}}>No events match filters</div>}
      {grouped.map(([day, events]) => <div key={day}>
        {/* Day header */}
        <div style={{position:"sticky",top:0,background:T.bg,zIndex:2,padding:"10px 0 6px",borderBottom:`1px solid ${T.border}`,marginBottom:4}}>
          <span style={{fontSize:12,fontWeight:700,color:T.text}}>{day}</span>
          <span style={{fontSize:11,color:T.muted,marginLeft:8}}>{events.length} event{events.length!==1?"s":""}</span>
        </div>

        {/* Events for this day */}
        {events.map(evt => {
          const ss = SEV_STYLE[evt.severity] || SEV_STYLE.info;
          const tm = TYPE_META[evt.type] || { icon:"❓", color:"#64748b" };
          const node = nodeMap[evt.nodeId];
          const isExpanded = expanded === evt.id;

          return <div key={evt.id} style={{display:"flex",gap:0,marginBottom:2}}>
            {/* Timeline spine */}
            <div style={{width:40,display:"flex",flexDirection:"column",alignItems:"center",flexShrink:0}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:ss.dot,border:`2px solid ${ss.border}`,flexShrink:0,marginTop:14}}/>
              <div style={{width:2,flex:1,background:T.border}}/>
            </div>

            {/* Event card */}
            <div onClick={() => setExpanded(p => p===evt.id?null:evt.id)}
              style={{flex:1,background:isExpanded?ss.bg:T.surface,border:`1px solid ${isExpanded?ss.border:T.border}`,
                borderRadius:8,padding:"10px 14px",marginBottom:4,cursor:"pointer",transition:"all 0.15s"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                    <span style={{fontSize:12}}>{tm.icon}</span>
                    <span style={{fontSize:12,fontWeight:700,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{evt.message}</span>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap",fontSize:11,color:T.muted}}>
                    <span style={{fontFamily:"monospace",fontWeight:600,color:T.primary,fontSize:10}}>{evt.nodeId}</span>
                    <span style={{background:tm.color+"15",color:tm.color,borderRadius:3,padding:"0px 5px",fontSize:9,fontWeight:700}}>{evt.type}</span>
                    <span>{COUNTRY_META[evt.country]?.flag} {evt.country}</span>
                    {node && <span style={{background:(LAYER_COLORS[node.layer]||"#64748b")+"18",color:LAYER_COLORS[node.layer]||"#64748b",
                      borderRadius:3,padding:"0px 5px",fontSize:9,fontWeight:600}}>{node.layer}</span>}
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:11,fontWeight:600,color:ss.text}}>{fmtTS(evt.ts)}</div>
                  <div style={{fontSize:10,color:T.muted}}>{new Date(evt.ts).toLocaleTimeString()}</div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && <div style={{marginTop:10,paddingTop:10,borderTop:`1px solid ${ss.border}`}}>
                <div style={{fontSize:12,color:T.text,lineHeight:1.6,background:"#f8fafc",padding:10,borderRadius:6,border:`1px solid ${T.border}`}}>{evt.detail}</div>
                <div style={{display:"flex",gap:12,marginTop:8,fontSize:11,color:T.muted}}>
                  <span>Timestamp: <b>{new Date(evt.ts).toLocaleString()}</b></span>
                  <span>Event ID: <b style={{fontFamily:"monospace"}}>{evt.id}</b></span>
                  {node && <span>Vendor: <b>{node.vendor} {node.hwModel}</b></span>}
                </div>
              </div>}
            </div>
          </div>;
        })}
      </div>)}
    </div>
  </div>;
}
