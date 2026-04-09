import { T } from "../data/constants.js";

const ALL_NAV_GROUPS=[
  { label:"OPERATIONS", app:"changes", items:[
    {id:"changes",  icon:"↻", label:"Changes",        badgeKey:"pending"},
    {id:"mywork",   icon:"👤",label:"My Work",         badgeKey:"actionable"},
    {id:"timeline", icon:"⋮", label:"Timeline"},
    {id:"peakcal",  icon:"❄", label:"Freeze Periods"},
  ]},
  { label:"NETWORK", app:"network", items:[
    {id:"network",  icon:"🗺", label:"Inventory"},
    {id:"topology", icon:"🔗", label:"Topology"},
  ]},
  { label:"MONITORING", app:"monitoring", items:[
    {id:"livestatus",    icon:"◉", label:"Live Status"},
    {id:"alarms",        icon:"🔔", label:"Alarms"},
    {id:"events",        icon:"📋", label:"Events"},
    {id:"observability", icon:"📈", label:"Observability"},
  ]},
  { label:"TICKETING", app:"tickets", items:[
    {id:"tickets_all",       icon:"🎫", label:"All Tickets"},
    {id:"tickets_incidents", icon:"🚨", label:"Incidents"},
    {id:"tickets_problems",  icon:"🔍", label:"Problems"},
    {id:"tickets_projects",  icon:"📁", label:"Projects"},
    {id:"tickets_my",        icon:"👤", label:"My Tickets",  badgeKey:"myTickets"},
    {id:"tickets_sla",       icon:"⏱", label:"SLA Watch",   badgeKey:"slaWatch"},
    {id:"tickets_reports",   icon:"📊", label:"Reports"},
  ]},
];

const APP_TITLES = {
  changes: "Change Management",
  monitoring: "Monitoring",
  network: "Network",
  tickets: "Ticketing",
};

export default function Sidebar({ app, view, setView, user, onLogout, onBack, badges, onNewChange, onNewFreeze, onDemoData, onResetSeed, onOpenChaos, pollerConnected = false }) {
  const navGroups = ALL_NAV_GROUPS.filter(g => g.app === app);

  return (
    <div style={{width:232,flexShrink:0,background:T.sidebar,borderRight:`1px solid ${T.sidebarBorder}`,display:"flex",flexDirection:"column",padding:"0 0 16px"}}>

      {/* ── Branding ── */}
      <div style={{padding:"18px 16px 16px",borderBottom:`1px solid ${T.sidebarBorder}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#e40000,#9b0000)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff",fontWeight:900,flexShrink:0,boxShadow:"0 2px 8px rgba(228,0,0,0.4)",cursor:"default"}}>B</div>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#fff",letterSpacing:"-0.3px",lineHeight:1.25}}>Bodaphone</div>
            <div style={{fontSize:11,fontWeight:500,color:T.sidebarMuted,letterSpacing:"0.2px",lineHeight:1.25}}>{APP_TITLES[app] || "Operations Centre"}</div>
          </div>
        </div>
      </div>

      {/* ── Back button ── */}
      <div style={{padding:"10px 10px 0"}}>
        <button onClick={onBack} style={{display:"flex",alignItems:"center",gap:8,width:"100%",padding:"9px 12px",borderRadius:8,border:`1px solid ${T.sidebarBorder}`,background:"rgba(255,255,255,0.04)",cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:600,color:T.sidebarMuted,transition:"background 0.15s"}}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,0.08)"}
          onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,0.04)"}>
          <span style={{fontSize:14,lineHeight:1}}>←</span> Back to Home
        </button>
      </div>

      {/* ── Contextual Action Button ── */}
      <div style={{padding:"8px 10px 0"}}>
        {(view==="changes"||view==="mywork"||view==="timeline") && (
          <button onClick={onNewChange} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"11px 14px",background:"linear-gradient(135deg,#e40000,#9b0000)",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,boxShadow:"0 2px 10px rgba(228,0,0,0.45)",letterSpacing:"0.1px"}}>
            <span style={{fontSize:18,lineHeight:1,fontWeight:300}}>+</span> New Change
          </button>
        )}
        {view==="peakcal" && (
          <button onClick={onNewFreeze} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"11px 14px",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,boxShadow:"0 2px 10px rgba(37,99,235,0.4)",letterSpacing:"0.1px"}}>
            <span style={{fontSize:18,lineHeight:1,fontWeight:300}}>+</span> New Freeze Period
          </button>
        )}
        {view==="network" && (
          <button onClick={()=>{}} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"11px 14px",background:"linear-gradient(135deg,#0f766e,#0d9488)",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,boxShadow:"0 2px 10px rgba(13,148,136,0.4)",letterSpacing:"0.1px"}}>
            <span style={{fontSize:15,lineHeight:1}}>📋</span> Export Inventory
          </button>
        )}
        {view==="topology" && (
          <button onClick={()=>setView("network")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"11px 14px",background:"linear-gradient(135deg,#1d4ed8,#3b82f6)",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,boxShadow:"0 2px 10px rgba(29,78,216,0.4)",letterSpacing:"0.1px"}}>
            <span style={{fontSize:15,lineHeight:1}}>🗺</span> Open Inventory
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <nav style={{flex:1,padding:"10px 8px",overflowY:"auto"}}>
        {navGroups.map((group,gi)=>(
          <div key={group.label} style={{marginBottom:4}}>
            <div style={{fontSize:9,fontWeight:700,color:"rgba(255,255,255,0.25)",letterSpacing:"1px",textTransform:"uppercase",padding:"8px 12px 4px",marginTop:gi>0?6:0}}>{group.label}</div>
            {group.items.map(item=>{
              const badge = item.badgeKey ? badges[item.badgeKey] : null;
              return (
                <button key={item.id} disabled={item.disabled} onClick={()=>!item.disabled&&setView(item.id)}
                  style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:8,border:"none",
                    cursor:item.disabled?"default":"pointer",fontFamily:"inherit",marginBottom:2,
                    background:view===item.id?"rgba(255,255,255,0.1)":"transparent",
                    color:item.disabled?"rgba(255,255,255,0.2)":view===item.id?"#fff":T.sidebarMuted,
                    fontSize:13,fontWeight:view===item.id?600:400,transition:"background 0.15s,color 0.15s",
                    opacity:item.disabled?0.5:1}}>
                  <span style={{fontSize:14,opacity:item.disabled?0.4:view===item.id?1:0.7}}>{item.icon}</span>
                  {item.label}
                  {badge>0&&<span style={{marginLeft:"auto",background:"#e40000",color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{badge}</span>}
                  {item.disabled&&<span style={{marginLeft:"auto",fontSize:9,color:"rgba(255,255,255,0.2)",fontWeight:600,letterSpacing:"0.5px"}}>SOON</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* ── Dev tools ── */}
      <div style={{margin:"0 10px 8px",display:"flex",gap:6}}>
        <button onClick={onDemoData} title="Populate with 20 realistic demo changes" style={{flex:1,padding:"5px 0",fontSize:10,fontWeight:600,color:T.sidebarMuted,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.sidebarBorder}`,borderRadius:6,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.3px"}}>⟳ Demo data</button>
        <button onClick={onResetSeed} title="Reset to hardcoded seed records only" style={{flex:1,padding:"5px 0",fontSize:10,fontWeight:600,color:T.sidebarMuted,background:"rgba(255,255,255,0.06)",border:`1px solid ${T.sidebarBorder}`,borderRadius:6,cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.3px"}}>↺ Reset seed</button>
      </div>

      {/* ── Poller status ── */}
      <button
        onClick={pollerConnected && onOpenChaos ? onOpenChaos : undefined}
        disabled={!pollerConnected}
        title={pollerConnected ? "Open Chaos Control" : "Poller not connected"}
        style={{margin:"0 10px 8px",display:"flex",alignItems:"center",gap:8,padding:"8px 12px",
          background:pollerConnected?"rgba(34,197,94,0.1)":"rgba(255,255,255,0.04)",
          border:`1px solid ${pollerConnected?"rgba(34,197,94,0.3)":T.sidebarBorder}`,borderRadius:8,
          cursor:pollerConnected?"pointer":"default",fontFamily:"inherit",textAlign:"left",width:"calc(100% - 20px)"}}>
        <span style={{width:8,height:8,borderRadius:"50%",flexShrink:0,
          background:pollerConnected?"#22c55e":"#64748b",
          boxShadow:pollerConnected?"0 0 0 3px rgba(34,197,94,0.3)":"none"}}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,color:pollerConnected?"#4ade80":"rgba(255,255,255,0.3)",
            letterSpacing:"0.5px"}}>{pollerConnected?"LIVE — Poller connected":"STATIC — No poller"}</div>
          {pollerConnected&&<div style={{fontSize:9,color:"rgba(255,255,255,0.45)",marginTop:1,letterSpacing:"0.3px"}}>Click for Chaos Control →</div>}
        </div>
      </button>

      {/* ── User profile ── */}
      <div style={{margin:"0 10px",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.sidebarBorder}`,borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#1d4ed8,#0e7490)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",flexShrink:0}}>
          {user.name.split(" ").map(p=>p[0]).join("").slice(0,2)}
        </div>
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontSize:12,fontWeight:700,color:T.sidebarText,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
          <div style={{fontSize:11,color:T.sidebarMuted}}>{user.role} · {user.team}</div>
        </div>
        <button onClick={onLogout} title="Sign out" style={{background:"none",border:"none",cursor:"pointer",color:T.sidebarMuted,fontSize:14,padding:"2px 4px",lineHeight:1,flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.color="#f1f5f9"} onMouseLeave={e=>e.currentTarget.style.color=T.sidebarMuted}>⏏</button>
      </div>
    </div>
  );
}
