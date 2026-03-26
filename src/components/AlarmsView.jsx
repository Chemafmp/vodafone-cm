import { useState, useMemo } from "react";
import { T } from "../data/constants.js";
import { ALARMS, SERVICES, COUNTRY_META } from "../data/inventory/index.js";
import { useNodes } from "../context/NodesContext.jsx";
import { LAYER_COLORS } from "../data/inventory/sites.js";
import { Card } from "./ui/index.jsx";

const SEV_META = {
  Critical: { bg:"#fef2f2", border:"#fca5a5", dot:"#dc2626", text:"#7f1d1d", icon:"🔴" },
  Major:    { bg:"#fff7ed", border:"#fed7aa", dot:"#ea580c", text:"#7c2d12", icon:"🟠" },
  Minor:    { bg:"#fefce8", border:"#fde68a", dot:"#ca8a04", text:"#713f12", icon:"🟡" },
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

export default function AlarmsView() {
  const { nodes: NODES } = useNodes();
  const [country, setCountry] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);

  const nodeMap = useMemo(() => Object.fromEntries(NODES.map(n=>[n.id,n])), [NODES]);
  const svcMap = useMemo(() => Object.fromEntries(SERVICES.map(s=>[s.id,s])), []);

  const filtered = useMemo(() => {
    let a = [...ALARMS];
    if (country !== "ALL") a = a.filter(x => x.country === country);
    if (severity !== "ALL") a = a.filter(x => x.severity === severity);
    if (type !== "ALL") a = a.filter(x => x.type === type);
    if (status !== "ALL") a = a.filter(x => x.status === status);
    if (search) {
      const q = search.toLowerCase();
      a = a.filter(x => x.message.toLowerCase().includes(q) || x.nodeId.toLowerCase().includes(q) || x.detail.toLowerCase().includes(q));
    }
    return a.sort((a,b) => new Date(b.since) - new Date(a.since));
  }, [country, severity, type, status, search]);

  const counts = useMemo(() => ({
    total: ALARMS.length,
    critical: ALARMS.filter(a=>a.severity==="Critical"&&a.status!=="RESOLVED").length,
    major: ALARMS.filter(a=>a.severity==="Major"&&a.status!=="RESOLVED").length,
    minor: ALARMS.filter(a=>a.severity==="Minor"&&a.status!=="RESOLVED").length,
    open: ALARMS.filter(a=>a.status==="OPEN").length,
    ack: ALARMS.filter(a=>a.status==="ACKNOWLEDGED").length,
    resolved: ALARMS.filter(a=>a.status==="RESOLVED").length,
  }), []);

  const types = [...new Set(ALARMS.map(a=>a.type))];

  const sel = selected ? ALARMS.find(a=>a.id===selected) : null;
  const selNode = sel ? nodeMap[sel.nodeId] : null;

  return <div style={{display:"flex",flexDirection:"column",gap:16,height:"100%",overflow:"auto",padding:"20px 24px"}}>
    {/* ── Summary cards ── */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:12}}>
      {[
        { label:"Total Alarms", value:counts.total, color:T.text, bg:T.surface },
        { label:"Critical", value:counts.critical, color:"#dc2626", bg:"#fef2f2" },
        { label:"Major", value:counts.major, color:"#ea580c", bg:"#fff7ed" },
        { label:"Minor", value:counts.minor, color:"#ca8a04", bg:"#fefce8" },
        { label:"Open", value:counts.open, color:"#b91c1c", bg:"#fef2f2" },
        { label:"Acknowledged", value:counts.ack, color:"#1d4ed8", bg:"#eff6ff" },
      ].map(c => <div key={c.label} style={{background:c.bg,border:`1px solid ${T.border}`,borderRadius:12,padding:"14px 16px",textAlign:"center"}}>
        <div style={{fontSize:28,fontWeight:800,color:c.color,letterSpacing:"-1px"}}>{c.value}</div>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginTop:2}}>{c.label}</div>
      </div>)}
    </div>

    {/* ── Filters ── */}
    <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{position:"relative",flex:1,minWidth:200}}>
        <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:13}}>🔍</span>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search alarms..."
          style={{width:"100%",padding:"8px 12px 8px 32px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:13,fontFamily:"inherit",background:T.surface,color:T.text,outline:"none"}} />
      </div>
      {[
        { val:country, set:setCountry, opts:["ALL","FJ","HW","IB"], label:"Country" },
        { val:severity, set:setSeverity, opts:["ALL","Critical","Major","Minor"], label:"Severity" },
        { val:type, set:setType, opts:["ALL",...types], label:"Type" },
        { val:status, set:setStatus, opts:["ALL","OPEN","ACKNOWLEDGED","RESOLVED"], label:"Status" },
      ].map(f => <select key={f.label} value={f.val} onChange={e=>f.set(e.target.value)}
        style={{padding:"8px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:12,fontFamily:"inherit",background:T.surface,color:T.text,fontWeight:500}}>
        {f.opts.map(o => <option key={o} value={o}>{o === "ALL" ? `All ${f.label}` : o}</option>)}
      </select>)}
    </div>

    {/* ── Alarm list + detail ── */}
    <div style={{display:"flex",gap:16,flex:1,minHeight:0}}>
      {/* List */}
      <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column",gap:6}}>
        {filtered.length === 0 && <div style={{textAlign:"center",padding:40,color:T.muted}}>No alarms match filters</div>}
        {filtered.map(a => {
          const sm = SEV_META[a.severity];
          const st = STATUS_BG[a.status];
          const node = nodeMap[a.nodeId];
          return <div key={a.id} onClick={() => setSelected(a.id)}
            style={{background:selected===a.id ? sm.bg : T.surface, border:`1px solid ${selected===a.id ? sm.border : T.border}`,
              borderRadius:10, padding:"12px 16px", cursor:"pointer", transition:"all 0.15s",
              borderLeft:`4px solid ${sm.dot}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <span style={{fontSize:12}}>{sm.icon}</span>
                  <span style={{fontSize:13,fontWeight:700,color:T.text}}>{a.message}</span>
                </div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",fontSize:11,color:T.muted}}>
                  <span style={{fontFamily:"monospace",fontWeight:600,color:T.primary}}>{a.nodeId}</span>
                  {node && <span>· {node.vendor} {node.hwModel}</span>}
                  <span>· {COUNTRY_META[a.country]?.flag} {a.country}</span>
                  <span style={{background:TYPE_COLORS[a.type]+"15",color:TYPE_COLORS[a.type],border:`1px solid ${TYPE_COLORS[a.type]}30`,
                    borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>{a.type}</span>
                  <span style={{background:st.bg,color:st.color,border:`1px solid ${st.border}`,
                    borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>{a.status}</span>
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontSize:11,fontWeight:600,color:sm.text}}>{timeSince(a.since)}</div>
                <div style={{fontSize:10,color:T.muted,marginTop:2}}>{new Date(a.since).toLocaleString()}</div>
              </div>
            </div>
          </div>;
        })}
      </div>

      {/* Detail panel */}
      {sel && <Card style={{width:380,flexShrink:0,overflow:"auto",padding:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <span style={{fontSize:15,fontWeight:800,color:T.text}}>Alarm Detail</span>
          <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:16,color:T.muted}}>✕</button>
        </div>

        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
          <span style={{fontSize:16}}>{SEV_META[sel.severity].icon}</span>
          <span style={{fontSize:14,fontWeight:700,color:SEV_META[sel.severity].text}}>{sel.severity}</span>
          <span style={{background:STATUS_BG[sel.status].bg,color:STATUS_BG[sel.status].color,border:`1px solid ${STATUS_BG[sel.status].border}`,
            borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700}}>{sel.status}</span>
        </div>

        <div style={{fontSize:13,fontWeight:600,color:T.text,marginBottom:8}}>{sel.message}</div>
        <div style={{fontSize:12,color:T.muted,lineHeight:1.6,marginBottom:16,background:"#f8fafc",padding:12,borderRadius:8,border:`1px solid ${T.border}`}}>{sel.detail}</div>

        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:12,marginBottom:16}}>
          <div><span style={{color:T.muted}}>Type:</span> <span style={{fontWeight:600,color:TYPE_COLORS[sel.type]}}>{sel.type}</span></div>
          <div><span style={{color:T.muted}}>Since:</span> <span style={{fontWeight:600}}>{timeSince(sel.since)}</span></div>
          <div><span style={{color:T.muted}}>Country:</span> <span style={{fontWeight:600}}>{COUNTRY_META[sel.country]?.flag} {COUNTRY_META[sel.country]?.name}</span></div>
          <div><span style={{color:T.muted}}>Alarm ID:</span> <span style={{fontFamily:"monospace",fontWeight:600}}>{sel.id}</span></div>
        </div>

        {/* Affected node */}
        {selNode && <div style={{marginBottom:16}}>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Affected Node</div>
          <div style={{background:"#f0f9ff",border:"1px solid #bae6fd",borderRadius:8,padding:12}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:selNode.status==="UP"?"#22c55e":selNode.status==="DEGRADED"?"#f59e0b":"#ef4444"}}/>
              <span style={{fontFamily:"monospace",fontWeight:700,fontSize:12,color:T.text}}>{selNode.id}</span>
              <span style={{background:(LAYER_COLORS[selNode.layer]||"#64748b")+"18",color:LAYER_COLORS[selNode.layer]||"#64748b",
                borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:600}}>{selNode.layer}</span>
            </div>
            <div style={{fontSize:11,color:T.muted}}>{selNode.vendor} {selNode.hwModel} · {selNode.hostname}</div>
          </div>
        </div>}

        {/* Affected services */}
        {sel.affectedServices?.length > 0 && <div>
          <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:6}}>Affected Services</div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {sel.affectedServices.map(sId => {
              const svc = svcMap[sId];
              if (!svc) return <div key={sId} style={{fontSize:11,fontFamily:"monospace",color:T.muted}}>{sId}</div>;
              const cc = {Critical:"#dc2626",High:"#d97706",Medium:"#2563eb",Low:"#64748b"}[svc.criticality]||"#64748b";
              return <div key={sId} style={{display:"flex",alignItems:"center",gap:8,fontSize:12,padding:"6px 10px",background:"#fefce8",border:"1px solid #fde68a",borderRadius:6}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:cc}}/>
                <span style={{fontWeight:600}}>{svc.name}</span>
                <span style={{fontSize:10,color:T.muted}}>SLA {svc.sla} · RTO {svc.rto}</span>
              </div>;
            })}
          </div>
        </div>}
      </Card>}
    </div>
  </div>;
}
