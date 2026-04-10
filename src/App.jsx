import { useState, useMemo, useEffect, useCallback, lazy, Suspense } from "react";

import { T, TEAMS, DEPTS, DIRECTORS, MANAGERS, COUNTRIES, RISK_LEVELS, EXEC_RESULTS } from "./data/constants.js";
import { fmt } from "./utils/helpers.js";
import { useChanges } from "./context/ChangesContext.jsx";

import { Badge, RiskPill, FreezeTag, TypeTag, IntrusionTag, Btn, Inp, Sel, Card } from "./components/ui/index.jsx";
import ChangeDetail from "./components/ChangeDetail.jsx";
import FreezeManager from "./components/FreezeManager.jsx";
import TicketDetailView from "./components/TicketDetailView.jsx";
import { ChangeWizardModal } from "./components/CreateChange.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import LandingPage from "./components/LandingPage.jsx";
import { NodesProvider, useNodes } from "./context/NodesContext.jsx";
import Sidebar from "./components/Sidebar.jsx";
import usePollerSocket from "./hooks/usePollerSocket.js";
import { fetchTickets, computeSubStatus, seedDemoTickets } from "./utils/ticketsDb.js";

// ─── Lazy-loaded views ───────────────────────────────────────────────────────
const MyWorkView      = lazy(() => import("./components/MyWorkView.jsx"));
const ChangesView     = lazy(() => import("./components/ChangesView.jsx"));
const TimelineView    = lazy(() => import("./components/TimelineView.jsx"));
const NetworkInventory = lazy(() => import("./components/NetworkInventory.jsx"));
const TopologyView    = lazy(() => import("./components/TopologyView.jsx"));
const LiveStatusView  = lazy(() => import("./components/LiveStatusView.jsx"));
const AlarmsView      = lazy(() => import("./components/AlarmsView.jsx"));
const EventsView      = lazy(() => import("./components/EventsView.jsx"));
const ObservabilityView = lazy(() => import("./components/ObservabilityView.jsx"));
const ChaosControlPanel = lazy(() => import("./components/ChaosControlPanel.jsx"));
const TicketListView    = lazy(() => import("./components/TicketListView.jsx"));
const TicketReportsView    = lazy(() => import("./components/TicketReportsView.jsx"));
const ServiceStatusView    = lazy(() => import("./components/ServiceStatusView.jsx"));
const NetworkHealthView    = lazy(() => import("./components/NetworkHealthView.jsx"));

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

/* ── Sync live polling snapshots → NodesContext status ── */
function PollerNodeSync({ nodeSnapshots }) {
  const { updateNode } = useNodes();
  useEffect(() => {
    for (const [nodeId, snap] of Object.entries(nodeSnapshots)) {
      const status = !snap.reachable ? "DOWN"
        : (snap.cpu >= 85 || snap.mem >= 90) ? "DEGRADED" : "UP";
      updateNode(nodeId, prev => prev.status !== status ? { ...prev, status } : prev);
    }
  }, [nodeSnapshots, updateNode]);
  return null;
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App(){
  const {
    changes, peaks, setPeaks, loading, offline,
    selected, selectChange, closeChange,
    updateChange, addChange, deleteChange,
    templates, crs, activePeak, tmplStats,
    handleDemoData, handleResetSeed,
  } = useChanges();

  const { connected: pollerConnected, liveAlarms, liveEvents, nodeSnapshots } = usePollerSocket();

  const [user,setUser]=useState(() => {
    try { return JSON.parse(sessionStorage.getItem("bnocUser")) || null; } catch { return null; }
  });
  function handleLogin(u) { sessionStorage.setItem("bnocUser", JSON.stringify(u)); setUser(u); }
  function handleLogout() { sessionStorage.removeItem("bnocUser"); setUser(null); setApp(null); }
  const [app,setApp]=useState(null); // null = landing, "changes" | "monitoring" | "network"
  const [view,setView]=useState("changes");

  // ── PWA view state (null = landing, "service_monitor" | "network_health") ────
  const [pwaView, setPwaView] = useState(() => {
    const m = window.location.hash.match(/[#&]standalone=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null; // hash deep-link still works
  });
  const [creatingMode,setCreatingMode]=useState(null); // null | "picker" | "wizard"
  const [chaosOpen,setChaosOpen]=useState(false);

  // ── Ticket sidebar counts ────────────────────────────────────────────────────
  const [ticketCounts,setTicketCounts]=useState({});
  const refreshTicketCounts = useCallback(async () => {
    try {
      const open = await fetchTickets({ status:"new,assigned,in_progress,mitigated", limit:500 });
      const critical = open.filter(t=>t.severity==="sev1").length;
      const slaAt = open.filter(t=>["sla_at_risk","breached"].includes(computeSubStatus(t))).length;
      setTicketCounts({
        ticketsAll:       open.length,
        ticketsIncidents: open.filter(t=>t.type==="incident").length,
        ticketsProblems:  open.filter(t=>t.type==="problem").length,
        ticketsProjects:  open.filter(t=>t.type==="project").length,
        myTickets:        open.filter(t=>t.owner_name===user?.name).length,
        slaWatch:         slaAt,
        ticketsCritical:  critical,
      });
    } catch(_) {}
  }, [user?.name]);

  useEffect(() => {
    if (app !== "tickets") return;
    refreshTicketCounts();
    const t = setInterval(refreshTicketCounts, 60000);
    return () => clearInterval(t);
  }, [app, refreshTicketCounts]);

  const APP_DEFAULTS = { changes: "changes", monitoring: "livestatus", network: "network", tickets: "tickets_all" };
  const handleSelectApp = (a) => { setApp(a); setView(APP_DEFAULTS[a]); };
  const handleBack = () => { setApp(null); };

  // ── Hash-based deep linking: #ticket=ID → full-screen ticket page ────────────
  const [fullScreenTicketId, setFullScreenTicketId] = useState(() => {
    const m = window.location.hash.match(/[#&]ticket=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  });
  useEffect(() => {
    function readHash() {
      const m = window.location.hash.match(/[#&]ticket=([^&]+)/);
      setFullScreenTicketId(m ? decodeURIComponent(m[1]) : null);
    }
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  // kept for legacy callers that still use deepLinkTicketId
  const [deepLinkTicketId, setDeepLinkTicketId] = useState(null);


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
    frozen:dashCrs.filter(c=>c.freezePeriod&&!["Completed","Failed","Aborted","Rolled Back","Off-Script"].includes(c.status)).length,
  };

  const myChanges = user ? crs.filter(c =>
    c.team === user.team ||
    c.manager === user.name ||
    c.director === user.name
  ) : [];
  const myUpcoming = myChanges
    .filter(c => !["Completed","Failed","Aborted","Rolled Back","Off-Script"].includes(c.status))
    .sort((a,b) => new Date(a.scheduledFor||0) - new Date(b.scheduledFor||0));
  const myActionable = myUpcoming.filter(c => ["Scheduled","In Execution"].includes(c.status));

  const VIEW_TITLES = {changes:"Changes",mywork:"My Work",timeline:"Timeline",peakcal:"Change Freeze",network:"Network Inventory",topology:"Topology",livestatus:"Live Status",alarms:"Alarms",events:"Events",observability:"Observability",service_monitor:"Service Monitor",network_health:"Network Health",tickets_all:"All Tickets",tickets_incidents:"Incidents",tickets_problems:"Problems",tickets_projects:"Requests",tickets_my:"My Tickets",tickets_sla:"SLA Watch",tickets_reports:"Reports"};


  // ── Standalone PWA mode (iOS navigator.standalone or Chrome display-mode) ──────
  const isPWA = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.location.hash.includes("standalone=");

  if (isPWA) {
    const pwaTopbar = (subtitle, onBack) => (
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", background: "#e40000", flexShrink: 0,
      }}>
        {onBack && (
          <button onClick={onBack} style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#fff", fontSize: 20, lineHeight: 1, padding: "0 6px 0 0",
          }}>←</button>
        )}
        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: "linear-gradient(135deg,#fff,#ffd0d0)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 14, fontWeight: 900, color: "#e40000", flexShrink: 0,
        }}>N</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#fff", lineHeight: 1.2 }}>
            Chema NOC
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", fontWeight: 500 }}>
            {subtitle}
          </div>
        </div>
      </div>
    );

    const pwaShell = (subtitle, onBack, children) => (
      <div style={{
        display: "flex", flexDirection: "column", height: "100vh",
        background: T.bg, color: T.text, fontFamily: "'Inter','Segoe UI',sans-serif",
        fontSize: 14, overflow: "hidden",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}>
        {pwaTopbar(subtitle, onBack)}
        <Suspense fallback={
          <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", color:T.muted }}>
            Loading…
          </div>
        }>
          {children}
        </Suspense>
      </div>
    );

    // ── Landing ──────────────────────────────────────────────────────────────
    if (!pwaView) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", height: "100vh",
          background: "#0f172a", fontFamily: "'Inter','Segoe UI',sans-serif",
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}>
          {/* Header */}
          <div style={{ padding: "20px 20px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: "linear-gradient(135deg,#e40000,#9b0000)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, fontWeight: 900, color: "#fff",
              }}>N</div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 20, color: "#fff" }}>Chema NOC</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>Network Operations Centre</div>
              </div>
            </div>
            <div style={{ height: 1, background: "#1e293b", marginTop: 16 }} />
          </div>

          {/* Tiles */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 20px", gap: 14 }}>
            {[
              {
                key: "service_monitor",
                icon: "🌐",
                title: "Service Monitor",
                subtitle: "Downdetector · Community outage reports",
                detail: "15 services · Spain, UK, Germany…",
                accent: "#0ea5e9",
                bg: "linear-gradient(135deg,#0c2d4a,#0f172a)",
                border: "#1e3a5f",
              },
              {
                key: "network_health",
                icon: "📡",
                title: "Network Health",
                subtitle: "RIPE Atlas · RTT, loss, BGP visibility",
                detail: "9 Vodafone markets · msm #1001",
                accent: "#10b981",
                bg: "linear-gradient(135deg,#0c2d2a,#0f172a)",
                border: "#1e3d38",
              },
            ].map(tile => (
              <button
                key={tile.key}
                onClick={() => setPwaView(tile.key)}
                style={{
                  background: tile.bg, border: `1px solid ${tile.border}`,
                  borderRadius: 18, padding: "22px 20px",
                  textAlign: "left", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 16,
                  boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
                }}
              >
                <div style={{
                  width: 56, height: 56, borderRadius: 14, flexShrink: 0,
                  background: `${tile.accent}22`, border: `1px solid ${tile.accent}44`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 28,
                }}>{tile.icon}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 17, color: "#f1f5f9", marginBottom: 3 }}>
                    {tile.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 2 }}>{tile.subtitle}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>{tile.detail}</div>
                </div>
                <div style={{ fontSize: 18, color: tile.accent, opacity: 0.7 }}>›</div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: "0 20px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#334155" }}>
              Bodaphone Lab · Real-time network intelligence
            </div>
          </div>
        </div>
      );
    }

    // ── Service Monitor ───────────────────────────────────────────────────────
    if (pwaView === "service_monitor") {
      return pwaShell(
        "Service Monitor · Downdetector [COMMUNITY DATA]",
        () => setPwaView(null),
        <ServiceStatusView mobile hideTickets />
      );
    }

    // ── Network Health ────────────────────────────────────────────────────────
    if (pwaView === "network_health") {
      return pwaShell(
        "Network Health · RIPE Atlas",
        () => setPwaView(null),
        <NetworkHealthView />
      );
    }
  }

  if (loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:T.bg,color:T.muted,fontFamily:"'Inter','Segoe UI',sans-serif",fontSize:13,gap:10}}><span style={{fontSize:20,animation:"spin 1s linear infinite"}}>⟳</span> Connecting to database…</div>;

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  // ── Full-screen ticket page (opened via window.open with #ticket=ID hash) ────
  if (fullScreenTicketId) return (
    <NodesProvider>
      <TicketDetailView
        ticketId={fullScreenTicketId}
        currentUser={user}
        users={USERS}
        fullScreen
        onClose={() => {
          // Clear hash and close page — if opened with window.open, window.close() works
          window.history.replaceState(null, "", window.location.pathname);
          setFullScreenTicketId(null);
          if (window.opener) window.close();
        }}
      />
    </NodesProvider>
  );

  if (!app) return <NodesProvider><><PollerNodeSync nodeSnapshots={nodeSnapshots}/>
    <LandingPage user={user} onSelectApp={handleSelectApp} />
    {selected&&<ChangeDetail change={selected} currentUser={user} onClose={()=>closeChange()} onUpdate={u=>updateChange(selected.id,u)} onDelete={()=>deleteChange(selected.id)}/>}
  </></NodesProvider>;

  return <NodesProvider><><PollerNodeSync nodeSnapshots={nodeSnapshots}/><div style={{display:"flex",height:"100vh",background:T.bg,color:T.text,fontFamily:"'Inter','Segoe UI',sans-serif",fontSize:14,overflow:"hidden"}}>

    <Sidebar
      app={app} view={view} setView={setView} user={user}
      onLogout={handleLogout}
      onBack={handleBack}
      badges={{pending:stats.pending||0, actionable:myActionable.length||0, ...ticketCounts}}
      onNewChange={()=>setCreatingMode("picker")}
      onNewFreeze={()=>setPeaks(p=>[...p,{id:`BNOC-${Math.random().toString().slice(2,10)}`,name:"",start:"",end:"",severity:"orange",reason:""}])}
      onDemoData={() => {
        handleDemoData();
        seedDemoTickets()
          .then(r => { console.log("[demo] tickets seeded:", r); refreshTicketCounts(); })
          .catch(console.error);
      }}
      onResetSeed={handleResetSeed}
      onOpenChaos={()=>setChaosOpen(true)}
      pollerConnected={pollerConnected}
    />

    {/* Main */}
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Topbar */}
      <div style={{padding:"13px 28px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:14,background:T.surface,flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,letterSpacing:"-0.3px"}}>{VIEW_TITLES[view]||"Changes"}</div>
        {view==="changes"&&<span style={{fontSize:11,color:T.muted,fontWeight:500,marginLeft:4}}>— manage, execute and track network changes</span>}
        <div style={{marginLeft:"auto",display:"flex",gap:10,alignItems:"center"}}>
        </div>
      </div>

      {offline&&<div style={{background:"linear-gradient(90deg,#1e3a5f,#1e40af)",color:"#fff",padding:"9px 28px",display:"flex",alignItems:"center",gap:12,flexShrink:0,boxShadow:"0 2px 6px rgba(30,58,95,0.4)"}}>
        <span style={{fontSize:15,flexShrink:0}}>⚡</span>
        <div style={{flex:1}}>
          <span style={{fontWeight:700,fontSize:12}}>Offline mode — </span>
          <span style={{fontSize:12,opacity:0.85}}>Unable to reach the database. Showing locally cached data. Changes made now will not be saved until connectivity is restored.</span>
        </div>
        <span style={{fontSize:11,background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:6,padding:"3px 10px",fontWeight:700,letterSpacing:"0.5px",whiteSpace:"nowrap"}}>READ ONLY</span>
      </div>}

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

      <Suspense fallback={<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:T.muted,fontSize:13,gap:8}}><span style={{fontSize:18,animation:"spin 1s linear infinite"}}>⟳</span> Loading…</div>}>
      <div style={{flex:1,overflowY:["topology","network","alarms","events","observability","livestatus","service_monitor","network_health","tickets_all","tickets_incidents","tickets_problems","tickets_projects","tickets_my","tickets_sla"].includes(view)?"hidden":"auto",padding:["topology","alarms","events","observability","livestatus","service_monitor","network_health","tickets_all","tickets_incidents","tickets_problems","tickets_projects","tickets_my","tickets_sla"].includes(view)?0:"20px 24px",display:"flex",flexDirection:"column"}}>

        {/* MY WORK */}
        {view==="mywork"&&<MyWorkView user={user} crs={crs} onSelect={selectChange}/>}

        {/* DASHBOARD */}
        {view==="dashboard"&&<div>
          <Card style={{marginBottom:16,padding:"12px 16px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr",gap:10,alignItems:"end"}}>
              <Sel label="Team"     value={dashFilters.team}     onChange={sdf("team")}     options={["All",...TEAMS]}/>
              <Sel label="Manager"  value={dashFilters.manager}  onChange={sdf("manager")}  options={["All",...MANAGERS]}/>
              <Sel label="Director" value={dashFilters.director} onChange={sdf("director")} options={["All",...DIRECTORS]}/>
              <Sel label="Status"   value={dashFilters.status}   onChange={sdf("status")}   options={["All","Draft","Preflight","Pending Approval","Scheduled","In Execution","Completed","Failed","Rolled Back","Aborted","Off-Script"]}/>
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
        {view==="changes"&&<ChangesView changes={changes} crs={crs} templates={templates} tmplStats={tmplStats} onSelect={selectChange}/>}

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

        {/* NETWORK INVENTORY */}
        {view==="network"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><NetworkInventory changes={changes}/></div>}

        {/* TOPOLOGY WEATHERMAP */}
        {view==="topology"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><TopologyView/></div>}

        {/* MONITORING */}
        {view==="livestatus"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><LiveStatusView liveAlarms={liveAlarms} nodeSnapshots={nodeSnapshots} pollerConnected={pollerConnected} crs={crs} onSelectChange={selectChange} onOpenTicket={ticketId=>window.open(`#ticket=${ticketId}`,"_blank")}/></div>}
        {view==="alarms"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><AlarmsView liveAlarms={liveAlarms} pollerConnected={pollerConnected} onOpenTicket={ticketId=>window.open(`#ticket=${ticketId}`,"_blank")}/></div>}
        {view==="events"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><EventsView changes={changes} liveEvents={liveEvents} pollerConnected={pollerConnected}/></div>}
        {view==="observability"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><ObservabilityView/></div>}
        {view==="service_monitor"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><ServiceStatusView/></div>}
        {view==="network_health"&&<div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}><NetworkHealthView/></div>}

        {/* TICKETING — list views */}
        {["tickets_all","tickets_incidents","tickets_problems","tickets_projects","tickets_my","tickets_sla"].includes(view)&&(
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <TicketListView
              key={view}
              currentUser={user}
              users={USERS}
              defaultType={view==="tickets_incidents"?"incident":view==="tickets_problems"?"problem":view==="tickets_projects"?"project":undefined}
              defaultMine={view==="tickets_my"}
              defaultSlaWatch={view==="tickets_sla"}
              deepLinkTicketId={deepLinkTicketId}
              onDeepLinkConsumed={()=>setDeepLinkTicketId(null)}
            />
          </div>
        )}

        {/* TICKETING — reports */}
        {view==="tickets_reports"&&<TicketReportsView currentUser={user}/>}

      </div>
      </Suspense>
    </div>

    {/* Modals */}
    {selected&&<ChangeDetail change={selected} currentUser={user} onClose={()=>closeChange()} onUpdate={u=>updateChange(selected.id,u)} onDelete={()=>deleteChange(selected.id)}/>}
    {creatingMode&&<ChangeWizardModal
      templates={templates} activePeak={activePeak} peaks={peaks} currentUser={user}
      onClose={()=>setCreatingMode(null)}
      onCreated={newC=>{addChange(newC);setCreatingMode(null);}}
    />}
    {chaosOpen&&<Suspense fallback={null}><ChaosControlPanel onClose={()=>setChaosOpen(false)}/></Suspense>}

  </div></></NodesProvider>;
}
