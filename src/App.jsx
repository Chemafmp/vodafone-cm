import { useState, useMemo, useEffect } from "react";

import { T, TEAMS, DEPTS, DIRECTORS, MANAGERS, SYSTEMS, COUNTRIES, RISK_LEVELS, EXEC_RESULTS, STATUS_META } from "./data/constants.js";
import { SEED_CHANGES, PEAK_PERIODS } from "./data/seed.js";
import { fmt, fmtDT, now, getActivePeak, initChangeCounter, genChangeId } from "./utils/helpers.js";

// Seed data uses IDs 1–5; new changes start from 6
initChangeCounter(SEED_CHANGES.length);

import { Badge, RiskPill, FreezeTag, TypeTag, IntrusionTag, Btn, Inp, Sel, Card } from "./components/ui/index.jsx";
import TimelineView from "./components/TimelineView.jsx";
import ChangeDetail from "./components/ChangeDetail.jsx";
import FreezeManager from "./components/FreezeManager.jsx";
import { CreateModePicker } from "./components/CreateChange.jsx";
import CreateChangeMCM from "./components/CreateChange.jsx";

// ─── USERS ────────────────────────────────────────────────────────────────────
const USERS=[
  {id:"u1",name:"Alex Torres", role:"Engineer", team:"Core Transport",dept:"Engineering"},
  {id:"u2",name:"Chema F.",    role:"Manager",  team:"Core Transport",dept:"Engineering"},
  {id:"u3",name:"Matt I.",     role:"Director", team:"Core Transport",dept:"Engineering"},
  {id:"u4",name:"Didier C.",   role:"Director", team:"Core Transport",dept:"Engineering"},
  {id:"u5",name:"Ivan M.",     role:"Engineer", team:"Core Transport",dept:"Engineering"},
  {id:"u6",name:"Adam S.",     role:"Engineer", team:"Core Transport",dept:"Engineering"},
  {id:"u7",name:"Davide Z.",   role:"Engineer", team:"Data Core",     dept:"Operations"},
  {id:"u8",name:"Ram",         role:"Engineer", team:"Voice Core",    dept:"Operations"},
  {id:"u9",name:"Michael T.",  role:"Director", team:"Access",        dept:"Engineering"},
  {id:"u10",name:"Sam Reyes",  role:"Manager",  team:"Data Core",     dept:"Operations"},
];

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const [changes,setChanges]=useState(SEED_CHANGES);
  const user=USERS[0];
  const [view,setView]=useState("changes");
  const [selected,setSelected]=useState(null);
  const [creatingMode,setCreatingMode]=useState(null); // null | "picker" | "wizard"
  const [peaks,setPeaks]=useState(PEAK_PERIODS);
  const activePeak = useMemo(()=>getActivePeak(peaks),[peaks]);
  const [myWorkFilter,setMyWorkFilter]=useState(null);

  // Hash-based change linking
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && hash.startsWith("BNOC-")) {
      const c = changes.find(x => x.id === hash);
      if (c) setSelected(c);
    }
  }, []);

  function selectChange(c) {
    setSelected(c);
    window.location.hash = c ? c.id : "";
  }
  function closeChange() {
    setSelected(null);
    window.location.hash = "";
  }

  // filters
  const [filters,setFilters]=useState({
    search:"",status:"All",risk:"All",type:"All",intrusion:"All",execMode:"All",
    team:"All",dept:"All",director:"All",manager:"All",domain:"All",country:"All",
    dateFrom:"",dateTo:"",sortBy:"date",sortDir:"desc",viewMode:"list",kind:"Changes",
  });
  const sf=k=>v=>setFilters(f=>({...f,[k]:v}));

  const templates=changes.filter(c=>c.isTemplate);
  const crs=changes.filter(c=>!c.isTemplate);

  function updateChange(id,updater){
    setChanges(cs=>cs.map(c=>c.id===id?(typeof updater==="function"?updater(c):{...c,...updater}):c));
    setSelected(p=>p?.id===id?(typeof updater==="function"?updater(p):{...p,...updater}):p);
  }

  const filtered=useMemo(()=>{
    let r=changes;
    if(filters.kind==="Templates") r=r.filter(c=>c.isTemplate);
    else if(filters.kind==="Changes") r=r.filter(c=>!c.isTemplate);
    if(filters.search) r=r.filter(c=>c.name.toLowerCase().includes(filters.search.toLowerCase())||c.id.includes(filters.search));
    if(filters.status!=="All") r=r.filter(c=>c.status===filters.status);
    if(filters.risk!=="All") r=r.filter(c=>c.risk===filters.risk);
    if(filters.type!=="All") r=r.filter(c=>c.type===filters.type);
    if(filters.intrusion!=="All") r=r.filter(c=>c.intrusion===filters.intrusion);
    if(filters.execMode!=="All") r=r.filter(c=>c.execMode===filters.execMode);
    if(filters.team!=="All") r=r.filter(c=>c.team===filters.team);
    if(filters.dept!=="All") r=r.filter(c=>c.dept===filters.dept);
    if(filters.director!=="All") r=r.filter(c=>c.director===filters.director);
    if(filters.manager!=="All") r=r.filter(c=>c.manager===filters.manager);
    if(filters.domain!=="All") r=r.filter(c=>c.domain===filters.domain);
    if(filters.country&&filters.country!=="All") r=r.filter(c=>c.country===filters.country);
    if(filters.dateFrom) r=r.filter(c=>c.scheduledFor&&new Date(c.scheduledFor)>=new Date(filters.dateFrom));
    if(filters.dateTo)   r=r.filter(c=>c.scheduledFor&&new Date(c.scheduledFor)<=new Date(filters.dateTo+"T23:59"));
    r=[...r].sort((a,b)=>{
      let av,bv;
      if(filters.sortBy==="date"){av=new Date(a.scheduledFor||0);bv=new Date(b.scheduledFor||0);}
      else if(filters.sortBy==="name"){av=a.name;bv=b.name;}
      else if(filters.sortBy==="risk"){const o={Low:0,Medium:1,High:2,Critical:3};av=o[a.risk];bv=o[b.risk];}
      else {av=a.status;bv=b.status;}
      return filters.sortDir==="asc"?(av>bv?1:-1):(av<bv?1:-1);
    });
    return r;
  },[crs,filters]);

  const notifCount=[...crs].filter(c=>["Pending Approval","Failed","Aborted"].includes(c.status)||c.freezePeriod&&["Draft","Preflight","Pending Approval"].includes(c.status)).length;

  const [dashFilters,setDashFilters]=useState({team:"All",manager:"All",director:"All",status:"All",risk:"All",country:"All",dateFrom:"",dateTo:""});
  const sdf=k=>v=>setDashFilters(f=>({...f,[k]:v}));
  const dashCrs=useMemo(()=>{
    let r=crs;
    if(dashFilters.team!=="All") r=r.filter(c=>c.team===dashFilters.team);
    if(dashFilters.manager!=="All") r=r.filter(c=>c.manager===dashFilters.manager);
    if(dashFilters.director!=="All") r=r.filter(c=>c.director===dashFilters.director);
    if(dashFilters.status!=="All") r=r.filter(c=>c.status===dashFilters.status);
    if(dashFilters.risk!=="All") r=r.filter(c=>c.risk===dashFilters.risk);
    if(dashFilters.country&&dashFilters.country!=="All") r=r.filter(c=>c.country===dashFilters.country);
    if(dashFilters.dateFrom) r=r.filter(c=>c.scheduledFor&&new Date(c.scheduledFor)>=new Date(dashFilters.dateFrom));
    if(dashFilters.dateTo)   r=r.filter(c=>c.scheduledFor&&new Date(c.scheduledFor)<=new Date(dashFilters.dateTo+"T23:59"));
    return r;
  },[crs,dashFilters]);

  const stats={
    total:dashCrs.length,
    pending:dashCrs.filter(c=>c.status==="Pending Approval").length,
    executing:dashCrs.filter(c=>c.status==="In Execution").length,
    completed:dashCrs.filter(c=>c.status==="Completed").length,
    failed:dashCrs.filter(c=>["Failed","Aborted","Rolled Back","Off-Script"].includes(c.status)).length,
    frozen:dashCrs.filter(c=>c.freezePeriod&&!["Completed","Failed","Aborted","Rolled Back"].includes(c.status)).length,
  };

  const myChanges = crs.filter(c =>
    c.team === user.team ||
    c.manager === user.name ||
    c.director === user.name
  );
  const myUpcoming = myChanges
    .filter(c => !["Completed","Failed","Aborted","Rolled Back"].includes(c.status))
    .sort((a,b) => new Date(a.scheduledFor||0) - new Date(b.scheduledFor||0));
  const myActionable = myUpcoming.filter(c => ["Approved","In Execution"].includes(c.status));

  const NAV=[
    {id:"changes",  icon:"↻",label:"Changes",   badge:stats.pending||null},
    {id:"mywork",   icon:"👤",label:"My Work",   badge:myActionable.length||null},
    {id:"timeline", icon:"⋮",label:"Timeline"},
  ];

  const NC_DEFAULTS={
    name:"",domain:SYSTEMS[0],risk:"Low",type:"Ad-hoc",execMode:"Manual",
    intrusion:"Non-Intrusive",approvalLevel:"L1",scheduledFor:"",scheduledEnd:"",isTemplate:false,variables:[],
    assignedTo:"",country:"",
    purpose:"",requirementsPermissions:"",expectedEndState:"",assumptions:"",
    serviceImpact:"",affectedServices:"",affectedDevices:"",customerImpact:"",
    rollbackPlan:"",rollbackTime:"",
    freezePeriod:false,freezeJustification:"",freezeSeverity:null,
    relatedTickets:"",lseId:"",incidentId:"",
    cabRequired:false,barRaiserRequired:false,
    blastRadius:"",dependencies:"",
    affectedRegions:"",affectedInterfaces:"",validationPlan:"",
    escalationPath:"",rollbackTrigger:"",pirRequired:false,
    steps:[],
    approvers:[],
    preflightSteps:[
      {id:"syntax",      label:"Syntax Validation"},
      {id:"conflict",    label:"Conflict Detection"},
      {id:"reachability",label:"Device Reachability"},
      {id:"policy",      label:"Policy Compliance"},
      {id:"rollback",    label:"Rollback Plan Verified"},
    ],
  };
  const [nc,setNc]=useState(NC_DEFAULTS);
  const [ncStep,setNcStep]=useState(0);
  const ncSf=k=>v=>setNc(f=>({...f,[k]:v}));

  return <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text,fontFamily:"'Inter','Segoe UI',sans-serif",fontSize:14,overflow:"hidden"}}>

    {/* Sidebar */}
    <div style={{width:232,flexShrink:0,background:T.sidebar,borderRight:`1px solid ${T.sidebarBorder}`,display:"flex",flexDirection:"column",padding:"0 0 16px"}}>
      <div style={{padding:"18px 16px 16px",borderBottom:`1px solid ${T.sidebarBorder}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#e40000,#9b0000)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff",fontWeight:900,flexShrink:0,boxShadow:"0 2px 8px rgba(228,0,0,0.4)"}}>B</div>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#fff",letterSpacing:"-0.3px",lineHeight:1.25}}>Bodaphone</div>
            <div style={{fontSize:11,fontWeight:500,color:T.sidebarMuted,letterSpacing:"0.2px",lineHeight:1.25}}>BNOC Change Management Platform</div>
          </div>
        </div>
      </div>

      {/* ── New Change CTA ── */}
      <div style={{padding:"12px 10px 0"}}>
        <button onClick={()=>setCreatingMode("picker")} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,width:"100%",padding:"11px 14px",background:"linear-gradient(135deg,#e40000,#9b0000)",color:"#fff",border:"none",borderRadius:9,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:700,boxShadow:"0 2px 10px rgba(228,0,0,0.45)",letterSpacing:"0.1px"}}>
          <span style={{fontSize:18,lineHeight:1,fontWeight:300}}>+</span> New Change
        </button>
      </div>

      <nav style={{flex:1,padding:"10px 8px"}}>
        {NAV.map(item=><button key={item.id} onClick={()=>setView(item.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",marginBottom:2,background:view===item.id?"rgba(255,255,255,0.1)":"transparent",color:view===item.id?"#fff":T.sidebarMuted,fontSize:13,fontWeight:view===item.id?600:400,transition:"background 0.15s,color 0.15s"}}>
          <span style={{fontSize:15,opacity:view===item.id?1:0.7}}>{item.icon}</span>{item.label}
          {item.badge&&<span style={{marginLeft:"auto",background:"#e40000",color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{item.badge}</span>}
        </button>)}

        <div style={{borderTop:`1px solid ${T.sidebarBorder}`,marginTop:10,paddingTop:10}}>
          <button onClick={()=>setView("peakcal")} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",marginBottom:2,background:view==="peakcal"?"rgba(255,255,255,0.1)":"transparent",color:view==="peakcal"?"#fff":T.sidebarMuted,fontSize:13,fontWeight:view==="peakcal"?600:400,transition:"background 0.15s,color 0.15s"}}>
            🔴 Change Freeze
          </button>
        </div>
      </nav>

      <div style={{margin:"0 10px",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.sidebarBorder}`,borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#1d4ed8,#0e7490)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",flexShrink:0}}>
          {user.name.split(" ").map(p=>p[0]).join("").slice(0,2)}
        </div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:12,fontWeight:700,color:T.sidebarText,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
          <div style={{fontSize:11,color:T.sidebarMuted}}>{user.role} · {user.team}</div>
        </div>
      </div>
    </div>

    {/* Main */}
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Topbar */}
      <div style={{padding:"13px 28px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:14,background:T.surface,flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,letterSpacing:"-0.3px"}}>{view==="mywork"?"My Work":view==="peakcal"?"Change Freeze":NAV.find(n=>n.id===view)?.label ?? "Change Freeze"}</div>
        {view==="changes"&&<span style={{fontSize:11,color:T.muted,fontWeight:500,marginLeft:4}}>— manage, execute and track network changes</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:10,alignItems:"center"}}>
          <Btn onClick={()=>setCreatingMode("picker")}>+ New Change</Btn>
        </div>
      </div>

      {activePeak&&(()=>{
        const isOrange=activePeak.severity==="orange";
        const bg=isOrange?"linear-gradient(90deg,#78350f,#92400e)":"linear-gradient(90deg,#7f1d1d,#991b1b)";
        const shadow=isOrange?"rgba(120,53,15,0.3)":"rgba(127,29,29,0.3)";
        const approver=isOrange?"Head of / Manager":"Director";
        const icon=isOrange?"⚠":"❄";
        return <div style={{background:bg,color:"#fff",padding:"10px 28px",display:"flex",alignItems:"center",gap:14,flexShrink:0,boxShadow:`0 2px 8px ${shadow}`}}>
          <span style={{fontSize:16,flexShrink:0}}>{icon}</span>
          <div style={{flex:1}}>
            <span style={{fontWeight:700,fontSize:13}}>{isOrange?"🟠":"🔴"} Network Freeze Period Active — {activePeak.name}</span>
            <span style={{fontSize:12,opacity:0.85,marginLeft:12}}>{activePeak.start} → {activePeak.end} · All changes require {approver} approval + business justification.</span>
          </div>
          <span style={{fontSize:11,background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:6,padding:"3px 10px",fontWeight:700,letterSpacing:"0.5px",whiteSpace:"nowrap"}}>ACTIVE FREEZE</span>
        </div>;
      })()}

      <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>

        {/* MY WORK */}
        {view==="mywork"&&<div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:"-0.4px"}}>Good day, {user.name.split(" ")[0]} 👋</div>
            <div style={{fontSize:13,color:T.muted,marginTop:3}}>{user.role} · {user.team} · {user.dept}</div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:16}}>
            {[
              {fk:"all",       label:"Assigned to me / team", value:myChanges.length,                                           col:T.primary, icon:"📋"},
              {fk:"actionable",label:"Actionable now",         value:myActionable.length,                                        col:"#0e7490", icon:"⚡"},
              {fk:"pending",   label:"Pending approval",       value:myUpcoming.filter(c=>c.status==="Pending Approval").length, col:"#b45309", icon:"⏳"},
              {fk:"frozen",    label:"In freeze period",       value:myUpcoming.filter(c=>c.freezePeriod).length,                col:T.freeze,  icon:"❄"},
            ].map(s=>{
              const active=myWorkFilter===s.fk;
              return <Card key={s.fk} onClick={()=>setMyWorkFilter(f=>f===s.fk?null:s.fk)} style={{borderTop:`3px solid ${s.col}`,padding:"16px 18px",cursor:"pointer",background:active?`${s.col}18`:T.surface,outline:active?`2px solid ${s.col}`:"none",transition:"all 0.15s"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                  <div style={{fontSize:34,fontWeight:800,color:s.col,fontFamily:"monospace",lineHeight:1}}>{s.value}</div>
                  <span style={{fontSize:20,opacity:active?0.9:0.35}}>{s.icon}</span>
                </div>
                <div style={{fontSize:11,color:active?s.col:T.muted,fontWeight:active?700:500}}>{s.label}</div>
                {active&&<div style={{fontSize:10,color:s.col,marginTop:5,opacity:0.7}}>↑ pulsa para cerrar</div>}
              </Card>;
            })}
          </div>

          {myWorkFilter&&(()=>{
            const filterMap={
              all:myChanges,
              actionable:myActionable,
              pending:myUpcoming.filter(c=>c.status==="Pending Approval"),
              frozen:myUpcoming.filter(c=>c.freezePeriod),
            };
            const label={all:"Assigned to me / team",actionable:"⚡ Actionable Now",pending:"⏳ Pending Approval",frozen:"❄ In Freeze Period"}[myWorkFilter];
            const fc=filterMap[myWorkFilter];
            return <div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                <h2 style={{fontSize:14,fontWeight:700,color:T.text}}>{label}</h2>
                <span style={{fontSize:11,background:"#eff6ff",color:T.primary,border:"1px solid #93c5fd",borderRadius:10,padding:"2px 9px",fontWeight:700}}>{fc.length} change{fc.length!==1?"s":""}</span>
                <Btn small variant="ghost" style={{marginLeft:"auto"}} onClick={()=>setMyWorkFilter(null)}>Cerrar ×</Btn>
              </div>
              {fc.length===0
                ?<Card style={{textAlign:"center",padding:"28px 20px",color:T.muted}}><div style={{fontWeight:600}}>No changes in this category</div></Card>
                :fc.map(c=>{
                  const statusCol=(STATUS_META[c.status]||{}).dot||"#94a3b8";
                  return <Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:6,cursor:"pointer",padding:"12px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:3,alignSelf:"stretch",borderRadius:4,background:statusCol,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:13,color:T.text,marginBottom:3}}>{c.name}</div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:11,color:T.muted,alignItems:"center"}}>
                          {c.scheduledFor&&<span>📅 {fmt(c.scheduledFor,true)}</span>}
                          <span>· {c.domain}</span>{c.country&&<span style={{fontWeight:700}}>· {c.country}</span>}
                          {c.freezePeriod&&<FreezeTag severity={c.freezeSeverity||"red"}/>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        <RiskPill risk={c.risk}/><Badge status={c.status}/>
                        {["Approved","In Execution"].includes(c.status)&&<Btn small variant={c.status==="Approved"?"success":"outline"} onClick={e=>{e.stopPropagation();selectChange(c);}}>{c.status==="Approved"?"▶ Execute":"⚙ Continue"}</Btn>}
                      </div>
                    </div>
                  </Card>;
                })
              }
            </div>;
          })()}

          {!myWorkFilter&&<>
          {myActionable.length>0&&<>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <h2 style={{fontSize:14,fontWeight:700,color:T.text}}>⚡ Actionable Now</h2>
              <span style={{fontSize:11,background:"#ecfeff",color:"#0e7490",border:"1px solid #a5f3fc",borderRadius:10,padding:"2px 9px",fontWeight:700}}>{myActionable.length} change{myActionable.length>1?"s":""}</span>
            </div>
            {myActionable.map(c=>{
              return <Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:8,cursor:"pointer",borderLeft:`4px solid ${c.status==="In Execution"?"#06b6d4":"#15803d"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,color:T.text,marginBottom:4}}>{c.name}</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:11,color:T.muted}}>
                      <span style={{fontWeight:600,color:T.text}}>{fmt(c.scheduledFor)}</span>
                      <span>·</span><span>{c.domain}</span>
                      {c.steps&&<><span>·</span><span>{c.steps.filter(s=>c.stepLogs?.[s.id]?.status==="done").length}/{c.steps.length} steps done</span></>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                    <RiskPill risk={c.risk}/>
                    <Badge status={c.status}/>
                    <Btn small variant={c.status==="Approved"?"success":"outline"} onClick={e=>{e.stopPropagation();selectChange(c);}}>
                      {c.status==="Approved"?"▶ Execute":"⚙ Continue"}
                    </Btn>
                  </div>
                </div>
              </Card>;
            })}
            <div style={{marginBottom:24}}/>
          </>}

          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <h2 style={{fontSize:14,fontWeight:700,color:T.text}}>📅 My Upcoming Schedule</h2>
            <span style={{fontSize:11,color:T.muted}}>Next 14 days — {user.team}</span>
          </div>

          {(()=>{
            const upcoming14=myUpcoming.filter(c=>{
              if(!c.scheduledFor) return false;
              const d=new Date(c.scheduledFor), now2=new Date();
              const diff=(d-now2)/(1000*60*60*24);
              return diff>=-1&&diff<=14;
            });
            if(upcoming14.length===0) return <Card style={{textAlign:"center",padding:"32px 20px",color:T.muted}}>
              <div style={{fontSize:24,marginBottom:8}}>🗓</div>
              <div style={{fontWeight:600}}>No changes scheduled in the next 14 days</div>
              <div style={{fontSize:12,marginTop:4}}>for {user.team} team</div>
            </Card>;

            const byDay={};
            upcoming14.forEach(c=>{
              const day=new Date(c.scheduledFor).toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"short"});
              if(!byDay[day]) byDay[day]={date:new Date(c.scheduledFor),changes:[]};
              byDay[day].changes.push(c);
            });

            const today=new Date().toDateString();
            return Object.entries(byDay).sort((a,b)=>a[1].date-b[1].date).map(([day,{date,changes:dc}])=>{
              const isToday=date.toDateString()===today;
              const isTomorrow=new Date(date-86400000).toDateString()===today;
              return <div key={day} style={{marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:isToday?T.primary:T.text}}>
                    {isToday?"TODAY — ":isTomorrow?"TOMORROW — ":""}{day}
                  </div>
                  {isToday&&<span style={{fontSize:10,background:T.primaryBg,color:T.primary,border:`1px solid ${T.primaryBorder}`,borderRadius:10,padding:"1px 8px",fontWeight:700}}>TODAY</span>}
                  <div style={{flex:1,height:1,background:T.border}}/>
                  <span style={{fontSize:11,color:T.muted}}>{dc.length} change{dc.length>1?"s":""}</span>
                </div>
                {dc.map(c=>{
                  const statusCol=(STATUS_META[c.status]||{}).dot||"#94a3b8";
                  return <Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:6,cursor:"pointer",padding:"12px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:3,alignSelf:"stretch",borderRadius:4,background:statusCol,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:13,color:T.text,marginBottom:3}}>{c.name}</div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:11,color:T.muted,alignItems:"center"}}>
                          <span>🕐 {new Date(c.scheduledFor).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>
                          <span>· {c.domain}</span>
                          {c.country&&<span style={{fontWeight:700}}>· {c.country}</span>}
                          <span>· {c.approvalLevel}</span>
                          {c.freezePeriod&&<FreezeTag severity={c.freezeSeverity||"red"}/>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        <RiskPill risk={c.risk}/>
                        <Badge status={c.status}/>
                      </div>
                    </div>
                  </Card>;
                })}
              </div>;
            });
          })()}

          {myChanges.filter(c=>["Draft","Preflight","Pending Approval"].includes(c.status)).length>0&&<>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,marginTop:8}}>
              <h2 style={{fontSize:14,fontWeight:700,color:T.text}}>🗂 In Progress (awaiting execution)</h2>
              <div style={{flex:1,height:1,background:T.border}}/>
            </div>
            {myChanges.filter(c=>["Draft","Preflight","Pending Approval"].includes(c.status)).map(c=><Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:6,cursor:"pointer",padding:"11px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,color:T.text,marginBottom:3}}>{c.name}</div>
                  <div style={{fontSize:11,color:T.muted}}>
                    Scheduled: {c.scheduledFor?fmt(c.scheduledFor,true):"TBD"} · {c.domain} · {c.manager}{c.country&&` · ${c.country}`}
                  </div>
                </div>
                <RiskPill risk={c.risk}/><Badge status={c.status}/>
              </div>
            </Card>)}
          </>}
          </>}
        </div>}

        {/* DASHBOARD */}
        {view==="dashboard"&&<div>
          <Card style={{marginBottom:16,padding:"12px 16px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr",gap:10,alignItems:"end"}}>
              <Sel label="Team"     value={dashFilters.team}     onChange={sdf("team")}     options={["All",...TEAMS]}/>
              <Sel label="Manager"  value={dashFilters.manager}  onChange={sdf("manager")}  options={["All",...MANAGERS]}/>
              <Sel label="Director" value={dashFilters.director} onChange={sdf("director")} options={["All",...DIRECTORS]}/>
              <Sel label="Status"   value={dashFilters.status}   onChange={sdf("status")}   options={["All","Draft","Preflight","Pending Approval","Approved","In Execution","Completed","Failed","Rolled Back","Aborted","Off-Script"]}/>
              <Sel label="Risk"     value={dashFilters.risk}     onChange={sdf("risk")}     options={["All",...RISK_LEVELS]}/>
              <Sel label="Country"  value={dashFilters.country}  onChange={sdf("country")}  options={["All",...COUNTRIES.map(c=>({value:c.code,label:`${c.code} — ${c.name}`}))]}/>
              <Inp label="From"     value={dashFilters.dateFrom} onChange={sdf("dateFrom")} type="date"/>
              <Inp label="To"       value={dashFilters.dateTo}   onChange={sdf("dateTo")}   type="date"/>
            </div>
            <div style={{display:"flex",gap:10,marginTop:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:T.muted}}>{dashCrs.length} change{dashCrs.length!==1?"s":""} match filters</span>
              <Btn small variant="ghost" style={{marginLeft:"auto"}} onClick={()=>setDashFilters({team:"All",manager:"All",director:"All",status:"All",risk:"All",country:"All",dateFrom:"",dateTo:""})}>Clear filters</Btn>
            </div>
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:14,marginBottom:24}}>
            {[
              {label:"Total Changes",value:stats.total,col:T.primary,icon:"↻"},
              {label:"Pending Approval",value:stats.pending,col:"#b45309",icon:"⏳"},
              {label:"In Execution",value:stats.executing,col:"#0e7490",icon:"⚡"},
              {label:"Completed",value:stats.completed,col:"#15803d",icon:"✓"},
              {label:"Failed / Aborted",value:stats.failed,col:"#b91c1c",icon:"✕"},
              {label:"Freeze Period",value:stats.frozen,col:T.freeze,icon:"❄"},
            ].map(s=><Card key={s.label} style={{borderTop:`3px solid ${s.col}`,padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{fontSize:34,fontWeight:800,color:s.col,fontFamily:"monospace",lineHeight:1}}>{s.value}</div>
                <span style={{fontSize:18,opacity:0.35}}>{s.icon}</span>
              </div>
              <div style={{fontSize:11,color:T.muted,fontWeight:500}}>{s.label}</div>
            </Card>)}
          </div>

          {stats.frozen>0&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"13px 16px",marginBottom:18,display:"flex",gap:12,alignItems:"center"}}>
            <span style={{fontSize:18}}>❄</span>
            <div><div style={{fontWeight:700,color:T.freeze,fontSize:13}}>{stats.frozen} change{stats.frozen>1?"s":""} in freeze period</div><div style={{fontSize:12,color:"#b91c1c"}}>Director approval and business justification required.</div></div>
            <Btn small variant="ghost" style={{marginLeft:"auto",borderColor:"#fca5a5",color:T.freeze}} onClick={()=>{setView("changes");sf("status")("Pending Approval");}}>Review →</Btn>
          </div>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:22}}>
            <Card>
              <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>Execution Results</div>
              {EXEC_RESULTS.map(r=>{
                const cnt=dashCrs.filter(c=>c.execResult===r).length;
                const col={Successful:"#15803d",Failed:"#b91c1c",Aborted:"#7c3aed","Off-Script":"#b45309","Rolled Back":"#f97316"}[r]||T.muted;
                return cnt>0&&<div key={r} style={{display:"flex",gap:10,alignItems:"center",marginBottom:7}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:col,flexShrink:0}}/>
                  <span style={{fontSize:13,color:T.text,flex:1}}>{r}</span>
                  <span style={{fontSize:13,fontWeight:700,color:col,fontFamily:"monospace"}}>{cnt}</span>
                  <div style={{width:80,height:5,background:T.bg,borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${(cnt/Math.max(dashCrs.length,1))*100}%`,height:"100%",background:col,borderRadius:3}}/>
                  </div>
                </div>;
              })}
            </Card>
            <Card>
              <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>By Team</div>
              {TEAMS.map(t=>{
                const cnt=dashCrs.filter(c=>c.team===t).length;
                return cnt>0&&<div key={t} style={{display:"flex",gap:10,alignItems:"center",marginBottom:7}}>
                  <span style={{fontSize:12,color:T.text,flex:1}}>{t}</span>
                  <span style={{fontSize:12,fontWeight:700,color:T.primary,fontFamily:"monospace"}}>{cnt}</span>
                  <div style={{width:80,height:5,background:T.bg,borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${(cnt/Math.max(dashCrs.length,1))*100}%`,height:"100%",background:T.primary,borderRadius:3}}/>
                  </div>
                </div>;
              })}
            </Card>
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h2 style={{fontSize:15,fontWeight:700,color:T.text}}>Recent Changes</h2>
            <Btn small variant="ghost" onClick={()=>setView("changes")}>View all →</Btn>
          </div>
          {dashCrs.slice(0,5).map(c=><Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:7,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:3}}>
                <span style={{fontWeight:700,fontSize:13,color:T.text}}>{c.name}</span>
                {c.freezePeriod&&<FreezeTag severity={c.freezeSeverity||"red"}/>}
                {c.country&&<span style={{fontSize:10,fontWeight:700,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,padding:"1px 6px"}}>{c.country}</span>}
              </div>
              <div style={{fontSize:11,color:T.muted}}>{c.team} · {c.manager} · {fmt(c.scheduledFor,true)}</div>
            </div>
            <TypeTag type={c.type}/><IntrusionTag v={c.intrusion}/><RiskPill risk={c.risk}/><Badge status={c.status}/>
            <span style={{color:T.light}}>›</span>
          </Card>)}
        </div>}

        {/* CHANGES */}
        {view==="changes"&&<div>
          {/* ── Compact KPI row ── */}
          <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
            {[
              {label:"Total",      value:crs.length,                                                                                               col:T.primary, filter:null},
              {label:"Pending",    value:crs.filter(c=>c.status==="Pending Approval").length,                                                      col:"#b45309", filter:"Pending Approval"},
              {label:"Executing",  value:crs.filter(c=>c.status==="In Execution").length,                                                          col:"#0e7490", filter:"In Execution"},
              {label:"Completed",  value:crs.filter(c=>c.status==="Completed").length,                                                             col:"#15803d", filter:"Completed"},
              {label:"Failed",     value:crs.filter(c=>["Failed","Aborted","Rolled Back","Off-Script"].includes(c.status)).length,                 col:"#b91c1c", filter:"Failed"},
              {label:"❄ Freeze",   value:crs.filter(c=>c.freezePeriod&&!["Completed","Failed","Aborted","Rolled Back"].includes(c.status)).length, col:T.freeze,  filter:null},
            ].map(s=>{
              const active=s.filter&&filters.status===s.filter;
              return <div key={s.label} onClick={s.filter?()=>sf("status")(active?"All":s.filter):undefined}
                style={{display:"flex",alignItems:"center",gap:6,padding:"6px 13px",borderRadius:8,
                  background:active?`${s.col}18`:T.surface,border:`1px solid ${active?s.col:T.border}`,
                  cursor:s.filter?"pointer":"default",transition:"all 0.15s",userSelect:"none"}}>
                <span style={{fontWeight:800,fontSize:18,color:s.col,fontFamily:"monospace",lineHeight:1}}>{s.value}</span>
                <span style={{fontSize:11,color:active?s.col:T.muted,fontWeight:active?700:400}}>{s.label}</span>
              </div>;
            })}
            {stats.frozen>0&&<div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,padding:"6px 13px",borderRadius:8,background:"#fef2f2",border:"1px solid #fca5a5"}}>
              <span style={{fontSize:12}}>❄</span>
              <span style={{fontSize:11,fontWeight:700,color:T.freeze}}>{stats.frozen} change{stats.frozen>1?"s":""} in freeze — Director approval required</span>
            </div>}
          </div>

          <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center"}}>
            <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:9,overflow:"hidden",boxShadow:T.shadow}}>
              {["Changes","Templates"].map(k=>(
                <button key={k} onClick={()=>sf("kind")(k)} style={{padding:"8px 18px",border:"none",background:filters.kind===k?T.primary:T.surface,color:filters.kind===k?"#fff":T.muted,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:filters.kind===k?700:500,transition:"background 0.15s,color 0.15s"}}>
                  {k==="Templates"?"⊡ Templates":"↻ Changes"}
                  <span style={{marginLeft:6,fontSize:11,opacity:0.75}}>
                    {k==="Templates"?templates.length:crs.length}
                  </span>
                </button>
              ))}
            </div>
            <><div style={{position:"relative",flex:1}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:13,pointerEvents:"none"}}>🔍</span>
              <input value={filters.search} onChange={e=>sf("search")(e.target.value)} placeholder="Search by name or ID…" style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 12px 8px 34px",fontSize:13,fontFamily:"inherit",outline:"none",boxShadow:T.shadow}}/>
            </div>
            <Sel value={filters.status} onChange={sf("status")} options={["All","Draft","Preflight","Pending Approval","Approved","In Execution","Completed","Failed","Rolled Back","Aborted","Off-Script"]} style={{minWidth:160}}/>
            <Sel value={filters.risk} onChange={sf("risk")} options={["All",...RISK_LEVELS]} style={{minWidth:100}}/></>
          </div>

          <Card style={{marginBottom:12,padding:"10px 14px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr",gap:10,alignItems:"end"}}>
              <Sel label="Team"     value={filters.team}     onChange={sf("team")}     options={["All",...TEAMS]}/>
              <Sel label="Dept"     value={filters.dept}     onChange={sf("dept")}     options={["All",...DEPTS]}/>
              <Sel label="Director" value={filters.director} onChange={sf("director")} options={["All",...DIRECTORS]}/>
              <Sel label="Manager"  value={filters.manager}  onChange={sf("manager")}  options={["All",...MANAGERS]}/>
              <Sel label="Country"  value={filters.country||"All"} onChange={sf("country")} options={["All",...COUNTRIES.map(c=>({value:c.code,label:`${c.code} — ${c.name}`}))]}/>
              <Inp label="From" value={filters.dateFrom} onChange={sf("dateFrom")} type="date"/>
              <Inp label="To"   value={filters.dateTo}   onChange={sf("dateTo")}   type="date"/>
            </div>
            <div style={{display:"flex",gap:10,marginTop:10,alignItems:"center"}}>
              <Sel value={filters.sortBy} onChange={sf("sortBy")} options={[{value:"date",label:"Sort: Sched. Start"},{value:"name",label:"Sort: Name"},{value:"risk",label:"Sort: Risk"},{value:"status",label:"Sort: Status"}]} style={{minWidth:160}}/>
              <button onClick={()=>sf("sortDir")(filters.sortDir==="asc"?"desc":"asc")} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",padding:"7px 12px",fontSize:12,color:T.muted,fontFamily:"inherit"}}>
                {filters.sortDir==="asc"?"↑ Asc":"↓ Desc"}
              </button>
              <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden"}}>
                {["list","grid"].map(m=><button key={m} onClick={()=>sf("viewMode")(m)} style={{padding:"7px 12px",border:"none",background:filters.viewMode===m?T.primaryBg:"transparent",color:filters.viewMode===m?T.primary:T.muted,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:filters.viewMode===m?600:400}}>{m==="list"?"☰ List":"⊞ Grid"}</button>)}
              </div>
              <span style={{fontSize:12,color:T.muted,marginLeft:"auto"}}>{filtered.length} result{filtered.length!==1?"s":""}</span>
              <Btn small variant="ghost" onClick={()=>setFilters(f=>({...f,search:"",status:"All",risk:"All",type:"All",intrusion:"All",execMode:"All",team:"All",dept:"All",director:"All",manager:"All",domain:"All",country:"All",dateFrom:"",dateTo:"",kind:"Changes"}))}>Clear</Btn>
            </div>
          </Card>

          {filtered.length===0&&<div style={{textAlign:"center",padding:60,color:T.light}}>No changes match these filters.</div>}

          {filters.viewMode==="list"&&filtered.map(c=><Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:7,cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
                  {c.isTemplate&&<span style={{fontSize:10,background:"#f5f3ff",color:"#6d28d9",border:"1px solid #c4b5fd",borderRadius:3,padding:"1px 6px",fontWeight:700}}>TEMPLATE</span>}
                  <span style={{fontWeight:700,fontSize:13,color:T.text}}>{c.name}</span>
                  {c.freezePeriod&&<FreezeTag severity={c.freezeSeverity||"red"}/>}
                </div>
                <div style={{fontSize:11,color:T.muted,display:"flex",gap:10,flexWrap:"wrap"}}>
                  <button onClick={e=>{e.stopPropagation();const url=window.location.origin+window.location.pathname+"#"+c.id;navigator.clipboard?.writeText(url).catch(()=>{});}} title="Copy shareable link" style={{fontFamily:"monospace",fontSize:11,color:T.primary,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline",fontWeight:600}}>{c.id}</button><span>·</span><span>{c.team}</span><span>·</span><span>{c.manager}</span>
                  {c.country&&<><span>·</span><span style={{fontWeight:700}}>{c.country}</span></>}
                  {c.scheduledFor&&<><span>·</span><span>📅 {fmtDT(c.scheduledFor)}{c.scheduledEnd&&<> → {fmtDT(c.scheduledEnd)}</>}</span></>}
                  {c.execResult&&<><span>·</span><span style={{color:{Successful:"#15803d",Failed:"#b91c1c",Aborted:"#7c3aed"}[c.execResult]||T.muted,fontWeight:600}}>{c.execResult}</span></>}
                </div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                <TypeTag type={c.type}/><IntrusionTag v={c.intrusion}/><RiskPill risk={c.risk}/><Badge status={c.status}/>
                <span style={{color:T.light}}>›</span>
              </div>
            </div>
          </Card>)}

          {filters.viewMode==="grid"&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {filtered.map(c=><Card key={c.id} onClick={()=>selectChange(c)} style={{cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                {c.isTemplate?<span style={{fontSize:10,background:"#f5f3ff",color:"#6d28d9",border:"1px solid #c4b5fd",borderRadius:4,padding:"2px 7px",fontWeight:700}}>TEMPLATE</span>:<Badge status={c.status} small/>}
                <RiskPill risk={c.risk}/>
              </div>
              <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:4,lineHeight:1.3}}>{c.name}</div>
              <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{c.domain} · {c.team}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                <TypeTag type={c.type}/><IntrusionTag v={c.intrusion}/>
                {c.freezePeriod&&<FreezeTag severity={c.freezeSeverity||"red"}/>}
              </div>
              <div style={{fontSize:11,color:T.light,marginTop:8}}>{c.scheduledFor?<>📅 {fmtDT(c.scheduledFor)}{c.scheduledEnd&&<> → {fmtDT(c.scheduledEnd)}</>}</>:"—"} · {c.manager}</div>
            </Card>)}
          </div>}
        </div>}

        {/* TIMELINE */}
        {view==="timeline"&&<div>
          <Card style={{padding:0,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:16,alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>Change Calendar</div>
              <div style={{display:"flex",gap:10,fontSize:11,color:T.muted,alignItems:"center"}}>
                <span style={{width:12,height:12,borderRadius:3,background:"#f0fdfa",border:"1px solid #0e7490",display:"inline-block"}}/> Maintenance Window
                <span style={{width:12,height:12,borderRadius:3,background:"#fef2f2",border:"1px solid #dc2626",display:"inline-block"}}/> Freeze Period
              </div>
            </div>
            <div style={{padding:14}}>
              <TimelineView changes={crs} onSelect={selectChange}/>
            </div>
          </Card>
        </div>}

        {/* PEAK CALENDAR — managed via FreezeManager */}
        {view==="peakcal"&&<FreezeManager peaks={peaks} setPeaks={setPeaks}/>}

      </div>
    </div>

    {/* Modals */}
    {selected&&<ChangeDetail change={selected} currentUser={user} onClose={()=>closeChange()} onUpdate={u=>updateChange(selected.id,u)} onDelete={()=>{setChanges(cs=>cs.filter(c=>c.id!==selected.id));closeChange();}}/>}
    {creatingMode==="picker"&&<CreateModePicker
      templates={templates}
      activePeak={activePeak}
      peaks={peaks}
      currentUser={user}
      onClose={()=>setCreatingMode(null)}
      onPickAdHoc={()=>{setNc({...NC_DEFAULTS,isTemplate:false,type:"Ad-hoc"});setNcStep(0);setCreatingMode("wizard");}}
      onPickNewTemplate={()=>{setNc({...NC_DEFAULTS,isTemplate:true,type:"Template"});setNcStep(0);setCreatingMode("wizard");}}
      onPickTemplate={t=>{
        setNc({
          ...NC_DEFAULTS,
          name:"["+t.name+"] ",
          domain:t.domain||NC_DEFAULTS.domain,
          risk:t.risk||"Low",
          approvalLevel:t.approvalLevel||"L1",
          execMode:t.execMode||"Manual",
          intrusion:t.intrusion||"Non-Intrusive",
          type:"Template",
          rollbackPlan:t.rollbackPlan||"",
          serviceImpact:t.serviceImpact||"",
          affectedServices:Array.isArray(t.affectedServices)?t.affectedServices.join(", "):(t.affectedServices||""),
          steps:(t.steps||[]).map(s=>({...s,id:Date.now()+Math.random()})),
          isTemplate:false,
        });
        setNcStep(0);
        setCreatingMode("wizard");
      }}
      onCreate={newC=>{setChanges(cs=>[newC,...cs]);setCreatingMode(null);}}
    />}
    {creatingMode==="wizard"&&<CreateChangeMCM
      nc={nc} setNc={setNc} ncSf={ncSf} ncStep={ncStep} setNcStep={setNcStep}
      NC_DEFAULTS={NC_DEFAULTS}
      peaks={peaks}
      currentUser={user}
      onClose={()=>{setCreatingMode(null);setNcStep(0);setNc(NC_DEFAULTS);}}
      onCreate={newC=>{setChanges(cs=>[newC,...cs]);setCreatingMode(null);setNcStep(0);setNc(NC_DEFAULTS);}}
    />}

    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      ::-webkit-scrollbar{width:6px;height:6px;}
      ::-webkit-scrollbar-track{background:transparent;}
      ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:6px;}
      ::-webkit-scrollbar-thumb:hover{background:#94a3b8;}
      input[type=checkbox]{accent-color:#1d4ed8;cursor:pointer;}
      input[type=date],input[type=datetime-local]{color-scheme:light;}
      button{transition:opacity 0.15s,background 0.15s,box-shadow 0.15s;}
      button:not(:disabled):hover{opacity:0.82;}
      textarea:focus,input:focus,select:focus{border-color:#93c5fd!important;outline:none;box-shadow:0 0 0 3px rgba(147,197,253,0.25)!important;}
      [data-card]:hover{box-shadow:0 4px 12px rgba(0,0,0,0.1)!important;}
    `}</style>
  </div>;
}
