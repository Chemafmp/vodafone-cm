import { useState, useMemo } from "react";
import { T } from "../data/constants.js";
import { SERVICES, ALARMS, EVENTS, COUNTRY_META } from "../data/inventory/index.js";
import { useNodes } from "../context/NodesContext.jsx";
import { LAYER_COLORS, LAYERS } from "../data/inventory/sites.js";

const CRIT_C = { Critical:"#dc2626", High:"#d97706", Medium:"#2563eb", Low:"#64748b" };

function pct(n,d) { return d ? Math.round(n/d*100) : 0; }

function MiniBar({ value, max, color, height=8 }) {
  const w = max ? Math.min(100, Math.round(value/max*100)) : 0;
  return <div style={{background:T.border,borderRadius:height/2,height,width:"100%",overflow:"hidden"}}>
    <div style={{background:color,height:"100%",width:`${w}%`,borderRadius:height/2,transition:"width 0.3s"}}/>
  </div>;
}

function StatCard({ icon, label, value, sub, color, bg }) {
  return <div style={{background:bg||T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:"16px 18px",display:"flex",gap:12,alignItems:"center"}}>
    <span style={{fontSize:22,flexShrink:0}}>{icon}</span>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:26,fontWeight:800,color:color||T.text,letterSpacing:"-1px"}}>{value}</div>
      <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.4px"}}>{label}</div>
      {sub && <div style={{fontSize:10,color:T.light,marginTop:2}}>{sub}</div>}
    </div>
  </div>;
}

export default function ObservabilityView() {
  const { nodes: NODES } = useNodes();
  const [country, setCountry] = useState("ALL");

  const nodes = useMemo(() => country==="ALL"?NODES:NODES.filter(n=>n.country===country), [country, NODES]);
  const services = useMemo(() => country==="ALL"?SERVICES:SERVICES.filter(s=>s.country===country), [country]);
  const alarms = useMemo(() => country==="ALL"?ALARMS:ALARMS.filter(a=>a.country===country), [country]);
  const events = useMemo(() => country==="ALL"?EVENTS:EVENTS.filter(e=>e.country===country), [country]);

  // ── KPIs ──
  const nodesUp = nodes.filter(n=>n.status==="UP").length;
  const nodesDeg = nodes.filter(n=>n.status==="DEGRADED").length;
  const nodesDown = nodes.filter(n=>n.status==="DOWN").length;
  const availability = pct(nodesUp, nodes.length);

  const totalIfaces = nodes.reduce((s,n)=>s+(n.interfaces||[]).length, 0);
  const ifacesUp = nodes.reduce((s,n)=>s+(n.interfaces||[]).filter(i=>i.operStatus==="UP").length, 0);

  const totalBgp = nodes.reduce((s,n)=>s+(n.bgpNeighbors||[]).length, 0);
  const bgpEstab = nodes.reduce((s,n)=>s+(n.bgpNeighbors||[]).filter(b=>b.state==="Established").length, 0);

  const openAlarms = alarms.filter(a=>a.status!=="RESOLVED");
  const critAlarms = openAlarms.filter(a=>a.severity==="Critical").length;
  const majorAlarms = openAlarms.filter(a=>a.severity==="Major").length;

  const recentEvents = events.filter(e => (Date.now()-new Date(e.ts).getTime()) < 24*3600*1000).length;

  // ── Per-country breakdown ──
  const countries = ["FJ","HW","IB"];
  const countryStats = useMemo(() => countries.map(c => {
    const cn = NODES.filter(n=>n.country===c);
    const ca = ALARMS.filter(a=>a.country===c&&a.status!=="RESOLVED");
    const cs = SERVICES.filter(s=>s.country===c);
    return {
      code: c,
      meta: COUNTRY_META[c],
      nodes: cn.length,
      up: cn.filter(n=>n.status==="UP").length,
      down: cn.filter(n=>n.status==="DOWN").length,
      degraded: cn.filter(n=>n.status==="DEGRADED").length,
      alarms: ca.length,
      critical: ca.filter(a=>a.severity==="Critical").length,
      services: cs.length,
      servicesOk: cs.filter(s => s.nodes.every(nId => { const nd = NODES.find(x=>x.id===nId); return nd?.status==="UP"; })).length,
    };
  }), []);

  // ── Per-layer breakdown ──
  const layerStats = useMemo(() => {
    const active = [...new Set(nodes.map(n=>n.layer))];
    return active.map(l => {
      const ln = nodes.filter(n=>n.layer===l);
      return { layer:l, total:ln.length, up:ln.filter(n=>n.status==="UP").length, down:ln.filter(n=>n.status==="DOWN").length, degraded:ln.filter(n=>n.status==="DEGRADED").length };
    }).sort((a,b) => b.total-a.total);
  }, [nodes]);

  // ── Service health ──
  const svcHealth = useMemo(() => services.map(s => {
    const sNodes = s.nodes.map(nId => NODES.find(n=>n.id===nId)).filter(Boolean);
    const allUp = sNodes.every(n=>n.status==="UP");
    const anyDown = sNodes.some(n=>n.status==="DOWN");
    const relAlarms = ALARMS.filter(a=>s.nodes.includes(a.nodeId)&&a.status!=="RESOLVED");
    return { ...s, status: anyDown?"DOWN":allUp?"UP":"DEGRADED", nodeCount:sNodes.length, upCount:sNodes.filter(n=>n.status==="UP").length, alarmCount:relAlarms.length };
  }).sort((a,b) => {
    const o = { DOWN:0, DEGRADED:1, UP:2 };
    return (o[a.status]??2) - (o[b.status]??2);
  }), [services]);

  return <div style={{display:"flex",flexDirection:"column",gap:20,height:"100%",overflow:"auto",padding:"20px 24px"}}>
    {/* ── Country filter ── */}
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      {["ALL","FJ","HW","IB"].map(c => <button key={c} onClick={() => setCountry(c)}
        style={{padding:"6px 14px",borderRadius:8,border:`1px solid ${country===c?T.primary:T.border}`,
          background:country===c?T.primaryBg:T.surface,color:country===c?T.primary:T.muted,
          fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
        {c==="ALL"?"🌐 All Networks":`${COUNTRY_META[c]?.flag} ${COUNTRY_META[c]?.name}`}
      </button>)}
    </div>

    {/* ── Top KPI row ── */}
    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12}}>
      <StatCard icon="🟢" label="Availability" value={`${availability}%`} sub={`${nodesUp}/${nodes.length} nodes UP`} color={availability>=95?"#15803d":"#b91c1c"} bg={availability>=95?"#f0fdf4":"#fef2f2"} />
      <StatCard icon="🔌" label="Interfaces UP" value={`${pct(ifacesUp,totalIfaces)}%`} sub={`${ifacesUp}/${totalIfaces}`} color="#2563eb" bg="#eff6ff" />
      <StatCard icon="🔀" label="BGP Sessions" value={`${pct(bgpEstab,totalBgp)}%`} sub={`${bgpEstab}/${totalBgp} established`} color="#7c3aed" bg="#f5f3ff" />
      <StatCard icon="🔔" label="Open Alarms" value={openAlarms.length} sub={`${critAlarms} critical · ${majorAlarms} major`} color={critAlarms>0?"#dc2626":"#ea580c"} bg={critAlarms>0?"#fef2f2":"#fff7ed"} />
      <StatCard icon="📋" label="Events (24h)" value={recentEvents} sub="Network events last 24h" color="#0d9488" bg="#f0fdfa" />
    </div>

    {/* ── Country health cards ── */}
    {country === "ALL" && <div>
      <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>Network Health by Country</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {countryStats.map(c => {
          const health = pct(c.up, c.nodes);
          const hColor = health>=90?"#15803d":health>=70?"#b45309":"#b91c1c";
          return <div key={c.code} onClick={() => setCountry(c.code)}
            style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:18,cursor:"pointer",transition:"all 0.15s"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:20}}>{c.meta?.flag}</span>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:T.text}}>{c.meta?.name}</div>
                  <div style={{fontSize:10,color:T.muted}}>AS{c.meta?.asn}</div>
                </div>
              </div>
              <div style={{fontSize:24,fontWeight:800,color:hColor}}>{health}%</div>
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,fontSize:11}}>
              <div><span style={{color:T.muted}}>Nodes:</span> <span style={{color:"#15803d",fontWeight:700}}>{c.up} UP</span>{c.degraded>0&&<span style={{color:"#b45309"}}> · {c.degraded} DEG</span>}{c.down>0&&<span style={{color:"#dc2626"}}> · {c.down} DOWN</span>}</div>
              <div><span style={{color:T.muted}}>Alarms:</span> <span style={{fontWeight:700,color:c.critical>0?"#dc2626":"#15803d"}}>{c.alarms} open</span>{c.critical>0&&<span style={{color:"#dc2626"}}> ({c.critical} crit)</span>}</div>
              <div><span style={{color:T.muted}}>Services:</span> <span style={{fontWeight:700}}>{c.servicesOk}/{c.services}</span> <span style={{color:T.light}}>healthy</span></div>
            </div>

            <div style={{marginTop:10}}>
              <MiniBar value={c.up} max={c.nodes} color={hColor} />
            </div>
          </div>;
        })}
      </div>
    </div>}

    {/* ── Layer health ── */}
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
      <div>
        <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>Health by Layer</div>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
          {layerStats.map((l,i) => {
            const lc = LAYER_COLORS[l.layer]||"#64748b";
            return <div key={l.layer} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderBottom:i<layerStats.length-1?`1px solid ${T.border}`:"none"}}>
              <span style={{width:10,height:10,borderRadius:3,background:lc,flexShrink:0}}/>
              <span style={{fontSize:12,fontWeight:600,color:T.text,width:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.layer}</span>
              <div style={{flex:1}}><MiniBar value={l.up} max={l.total} color={lc} /></div>
              <span style={{fontSize:11,fontWeight:600,color:T.muted,width:50,textAlign:"right"}}>{l.up}/{l.total}</span>
              {l.down>0 && <span style={{fontSize:10,fontWeight:700,color:"#dc2626",background:"#fef2f2",borderRadius:4,padding:"1px 5px"}}>{l.down} DOWN</span>}
              {l.degraded>0 && <span style={{fontSize:10,fontWeight:700,color:"#b45309",background:"#fff7ed",borderRadius:4,padding:"1px 5px"}}>{l.degraded} DEG</span>}
            </div>;
          })}
        </div>
      </div>

      {/* ── Service health matrix ── */}
      <div>
        <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>Service Health</div>
        <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden",maxHeight:400,overflowY:"auto"}}>
          {svcHealth.map((s,i) => {
            const sc = s.status==="UP"?"#15803d":s.status==="DEGRADED"?"#b45309":"#dc2626";
            const sbg = s.status==="UP"?"#f0fdf4":s.status==="DEGRADED"?"#fff7ed":"#fef2f2";
            const cc = CRIT_C[s.criticality]||"#64748b";
            return <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",background:s.status!=="UP"?sbg:"transparent",
              borderBottom:i<svcHealth.length-1?`1px solid ${T.border}`:"none"}}>
              <span style={{width:8,height:8,borderRadius:"50%",background:sc,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.name}</div>
                <div style={{fontSize:10,color:T.muted}}>
                  <span style={{color:cc,fontWeight:600}}>{s.criticality}</span>
                  {" · SLA "+s.sla+" · "+s.upCount+"/"+s.nodeCount+" nodes"}
                </div>
              </div>
              <span style={{fontSize:10,fontWeight:700,color:sc,background:sc+"15",borderRadius:4,padding:"2px 6px"}}>{s.status}</span>
              {s.alarmCount>0 && <span style={{fontSize:10,fontWeight:700,color:"#dc2626",background:"#fef2f2",borderRadius:4,padding:"2px 6px"}}>🔔 {s.alarmCount}</span>}
            </div>;
          })}
        </div>
      </div>
    </div>

    {/* ── Recent events mini-feed ── */}
    <div>
      <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:10}}>Recent Events (last 24h)</div>
      <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,overflow:"hidden"}}>
        {events.filter(e => (Date.now()-new Date(e.ts).getTime()) < 24*3600*1000).slice(0,8).map((e,i,arr) => {
          const ss = { critical:{dot:"#dc2626"},error:{dot:"#ea580c"},warning:{dot:"#ca8a04"},info:{dot:"#16a34a"} }[e.severity]||{dot:"#64748b"};
          return <div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 14px",borderBottom:i<arr.length-1?`1px solid ${T.border}`:"none"}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:ss.dot,flexShrink:0}}/>
            <span style={{fontSize:12,fontWeight:600,color:T.text,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{e.message}</span>
            <span style={{fontSize:10,fontFamily:"monospace",color:T.primary,flexShrink:0}}>{e.nodeId}</span>
            <span style={{fontSize:10,color:T.muted,flexShrink:0}}>{new Date(e.ts).toLocaleTimeString()}</span>
          </div>;
        })}
      </div>
    </div>
  </div>;
}
