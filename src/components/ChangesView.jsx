import { useState, useMemo } from "react";
import { T, TEAMS, DEPTS, DIRECTORS, MANAGERS, RISK_LEVELS, COUNTRIES } from "../data/constants.js";
import { fmtDT } from "../utils/helpers.js";
import { Badge, RiskPill, FreezeTag, TypeTag, IntrusionTag, Btn, Inp, Sel, Card } from "./ui/index.jsx";

const INIT_FILTERS = {
  search:"",status:"All",risk:"All",type:"All",intrusion:"All",execMode:"All",
  team:"All",dept:"All",director:"All",manager:"All",domain:"All",country:"All",
  dateFrom:"",dateTo:"",sortBy:"date",sortDir:"desc",viewMode:"list",kind:"Changes",
};

export default function ChangesView({ changes, crs, templates, tmplStats, onSelect }) {
  const [filters, setFilters] = useState(INIT_FILTERS);
  const sf = k => v => setFilters(f => ({ ...f, [k]: v }));

  const filtered = useMemo(() => {
    let r = changes;
    if (filters.kind === "Templates") r = r.filter(c => c.isTemplate);
    else if (filters.kind === "Changes") r = r.filter(c => !c.isTemplate);
    if (filters.search) r = r.filter(c => c.name.toLowerCase().includes(filters.search.toLowerCase()) || c.id.includes(filters.search));
    if (filters.status !== "All") r = r.filter(c => c.status === filters.status);
    if (filters.risk !== "All") r = r.filter(c => c.risk === filters.risk);
    if (filters.type !== "All") r = r.filter(c => c.type === filters.type);
    if (filters.intrusion !== "All") r = r.filter(c => c.intrusion === filters.intrusion);
    if (filters.execMode !== "All") r = r.filter(c => c.execMode === filters.execMode);
    if (filters.team !== "All") r = r.filter(c => c.team === filters.team);
    if (filters.dept !== "All") r = r.filter(c => c.dept === filters.dept);
    if (filters.director !== "All") r = r.filter(c => c.director === filters.director);
    if (filters.manager !== "All") r = r.filter(c => c.manager === filters.manager);
    if (filters.domain !== "All") r = r.filter(c => c.domain === filters.domain);
    if (filters.country && filters.country !== "All") r = r.filter(c => c.country === filters.country);
    if (filters.dateFrom) r = r.filter(c => c.scheduledFor && new Date(c.scheduledFor) >= new Date(filters.dateFrom));
    if (filters.dateTo) r = r.filter(c => c.scheduledFor && new Date(c.scheduledFor) <= new Date(filters.dateTo + "T23:59"));
    r = [...r].sort((a, b) => {
      let av, bv;
      if (filters.sortBy === "date") { av = new Date(a.scheduledFor || 0); bv = new Date(b.scheduledFor || 0); }
      else if (filters.sortBy === "name") { av = a.name; bv = b.name; }
      else if (filters.sortBy === "risk") { const o = { Low: 0, Medium: 1, High: 2, Critical: 3 }; av = o[a.risk]; bv = o[b.risk]; }
      else { av = a.status; bv = b.status; }
      return filters.sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
    });
    return r;
  }, [changes, filters]);

  return (
    <div>
      {/* ── Compact KPI row ── */}
      <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
        {[
          {label:"Total",      value:crs.length,                                                                                               col:T.primary, filter:null},
          {label:"Pending",    value:crs.filter(c=>c.status==="Pending Approval").length,                                                      col:"#b45309", filter:"Pending Approval"},
          {label:"Executing",  value:crs.filter(c=>c.status==="In Execution").length,                                                          col:"#0e7490", filter:"In Execution"},
          {label:"Completed",  value:crs.filter(c=>c.status==="Completed").length,                                                             col:"#15803d", filter:"Completed"},
          {label:"Failed",     value:crs.filter(c=>["Failed","Aborted","Rolled Back","Off-Script"].includes(c.status)).length,                 col:"#b91c1c", filter:"Failed"},
          {label:"❄ Freeze",   value:crs.filter(c=>c.freezePeriod&&!["Completed","Failed","Aborted","Rolled Back","Off-Script"].includes(c.status)).length, col:T.freeze,  filter:null},
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
        <Sel value={filters.status} onChange={sf("status")} options={["All","Draft","Preflight","Pending Approval","Scheduled","In Execution","Completed","Failed","Rolled Back","Aborted","Off-Script"]} style={{minWidth:160}}/>
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

      {filters.viewMode==="list"&&filtered.map(c=><Card key={c.id} onClick={()=>onSelect(c)} style={{marginBottom:7,cursor:"pointer"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
              {c.isTemplate&&<span style={{fontSize:10,background:"#f5f3ff",color:"#6d28d9",border:"1px solid #c4b5fd",borderRadius:3,padding:"1px 6px",fontWeight:700}}>TEMPLATE</span>}
              <span style={{fontWeight:700,fontSize:13,color:T.text}}>{c.name}</span>
              {c.freezePeriod&&<FreezeTag severity={c.freezeSeverity||"red"}/>}
            </div>
            {c.isTemplate?(
              <div style={{fontSize:11,color:T.muted,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
                <button onClick={e=>{e.stopPropagation();const url=window.location.origin+window.location.pathname+"#"+c.id;navigator.clipboard?.writeText(url).catch(()=>{});}} title="Copy shareable link" style={{fontFamily:"monospace",fontSize:11,color:T.primary,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline",fontWeight:600}}>{c.id}</button>
                <span>·</span><span>{c.dept}</span><span>·</span><span>{c.domain}</span>
                {c.variables?.length>0&&<><span>·</span><span>⚙ {c.variables.length} variable{c.variables.length!==1?"s":""}</span></>}
                {(()=>{const s=tmplStats[c.id];if(!s) return <><span>·</span><span style={{color:T.light}}>No uses yet</span></>;
                  return <><span>·</span>
                    <span style={{fontWeight:600,color:T.text}}>{s.total} use{s.total!==1?"s":""}</span>
                    {s.ok>0&&<span style={{color:"#15803d",fontWeight:600}}>✓ {s.ok}</span>}
                    {s.fail>0&&<span style={{color:"#b91c1c",fontWeight:600}}>✗ {s.fail}</span>}
                    {s.running>0&&<span style={{color:"#0e7490",fontWeight:600}}>⟳ {s.running}</span>}
                  </>;})()}
              </div>
            ):(
              <div style={{fontSize:11,color:T.muted,display:"flex",gap:10,flexWrap:"wrap"}}>
                <button onClick={e=>{e.stopPropagation();const url=window.location.origin+window.location.pathname+"#"+c.id;navigator.clipboard?.writeText(url).catch(()=>{});}} title="Copy shareable link" style={{fontFamily:"monospace",fontSize:11,color:T.primary,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline",fontWeight:600}}>{c.id}</button><span>·</span><span>{c.team}</span><span>·</span><span>{c.manager}</span>
                {c.country&&<><span>·</span><span style={{fontWeight:700}}>{c.country}</span></>}
                {c.scheduledFor&&<><span>·</span><span>📅 {fmtDT(c.scheduledFor)}{c.scheduledEnd&&<> → {fmtDT(c.scheduledEnd)}</>}</span></>}
                {c.execResult&&<><span>·</span><span style={{color:{Successful:"#15803d",Failed:"#b91c1c",Aborted:"#7c3aed"}[c.execResult]||T.muted,fontWeight:600}}>{c.execResult}</span></>}
              </div>
            )}
          </div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            {c.isTemplate?(
              <><IntrusionTag v={c.intrusion}/><RiskPill risk={c.risk}/></>
            ):(
              <><TypeTag type={c.type}/><IntrusionTag v={c.intrusion}/><RiskPill risk={c.risk}/><Badge status={c.status}/></>
            )}
            <span style={{color:T.light}}>›</span>
          </div>
        </div>
      </Card>)}

      {filters.viewMode==="grid"&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        {filtered.map(c=><Card key={c.id} onClick={()=>onSelect(c)} style={{cursor:"pointer"}}>
          {c.isTemplate?(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <span style={{fontSize:10,background:"#f5f3ff",color:"#6d28d9",border:"1px solid #c4b5fd",borderRadius:4,padding:"2px 7px",fontWeight:700}}>TEMPLATE</span>
                <RiskPill risk={c.risk}/>
              </div>
              <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:4,lineHeight:1.3}}>{c.name}</div>
              <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{c.dept} · {c.domain}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center",marginBottom:8}}>
                <IntrusionTag v={c.intrusion}/>
                {c.variables?.length>0&&<span style={{fontSize:10,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,padding:"2px 7px"}}>⚙ {c.variables.length} var{c.variables.length!==1?"s":""}</span>}
              </div>
              {(()=>{const s=tmplStats[c.id];
                if(!s) return <div style={{fontSize:11,color:T.light,borderTop:`1px solid ${T.border}`,paddingTop:8}}>No uses yet</div>;
                return <div style={{fontSize:11,display:"flex",gap:8,alignItems:"center",borderTop:`1px solid ${T.border}`,paddingTop:8}}>
                  <span style={{fontWeight:700,color:T.text}}>{s.total} use{s.total!==1?"s":""}</span>
                  {s.ok>0&&<span style={{color:"#15803d",fontWeight:600}}>✓ {s.ok}</span>}
                  {s.fail>0&&<span style={{color:"#b91c1c",fontWeight:600}}>✗ {s.fail}</span>}
                  {s.running>0&&<span style={{color:"#0e7490",fontWeight:600}}>⟳ {s.running}</span>}
                </div>;})()}
            </>
          ):(
            <>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                <Badge status={c.status} small/>
                <RiskPill risk={c.risk}/>
              </div>
              <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:4,lineHeight:1.3}}>{c.name}</div>
              <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{c.domain} · {c.team}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                <TypeTag type={c.type}/><IntrusionTag v={c.intrusion}/>
                {c.freezePeriod&&<FreezeTag severity={c.freezeSeverity||"red"}/>}
              </div>
              <div style={{fontSize:11,color:T.light,marginTop:8}}>{c.scheduledFor?<>📅 {fmtDT(c.scheduledFor)}{c.scheduledEnd&&<> → {fmtDT(c.scheduledEnd)}</>}</>:"—"} · {c.manager}</div>
            </>
          )}
        </Card>)}
      </div>}
    </div>
  );
}
