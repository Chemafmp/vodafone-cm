import { useState } from "react";
import { T, COUNTRIES } from "../data/constants.js";
import { now, fmt, fmtSec, exportAuditCSV } from "../utils/helpers.js";
import { Badge, RiskPill, FreezeTag, TypeTag, IntrusionTag, Btn, Inp, Modal } from "./ui/index.jsx";
import CommentStream from "./CommentStream.jsx";
import CABPanel from "./CABPanel.jsx";

// ─── CLOSE CHANGE PANEL ───────────────────────────────────────────────────────
function CloseChangePanel({change, currentUser, onClose}) {
  const [result, setResult] = useState("Successful");
  const [note, setNote] = useState("");
  const [pirRequired, setPirRequired] = useState(false);
  const RESULTS = [
    {v:"Successful", col:"#15803d", bg:"#f0fdf4", border:"#86efac", icon:"✓"},
    {v:"Off-Script",  col:"#b45309", bg:"#fffbeb", border:"#fcd34d", icon:"⚠"},
    {v:"Rolled Back", col:"#ea580c", bg:"#fff7ed", border:"#fed7aa", icon:"↩"},
    {v:"Failed",      col:"#b91c1c", bg:"#fef2f2", border:"#fca5a5", icon:"✕"},
  ];
  const sel = RESULTS.find(r=>r.v===result);
  const needsPIR = result === "Failed" || result === "Rolled Back";
  return (
    <div style={{ padding:"14px 13px", background:sel.bg, borderTop:`2px solid ${sel.border}` }}>
      <div style={{ fontSize:11, fontWeight:700, color:sel.col, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Close Change</div>
      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        {RESULTS.map(r=>(
          <button key={r.v} onClick={()=>setResult(r.v)} style={{ fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:6, padding:"5px 10px", border:`1.5px solid ${result===r.v?r.col:r.border}`, background:result===r.v?r.col:"#fff", color:result===r.v?"#fff":r.col, fontFamily:"inherit" }}>
            {r.icon} {r.v}
          </button>
        ))}
      </div>
      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
        placeholder="Closing note (optional) — e.g. All services validated, no customer impact"
        style={{ width:"100%", background:"#fff", border:`1px solid ${sel.border}`, borderRadius:6, color:"#0f172a", padding:"7px 10px", fontSize:12, fontFamily:"inherit", outline:"none", resize:"none", marginBottom:8 }}/>
      {needsPIR && (
        <label style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10, cursor:"pointer", padding:"9px 12px", background:"#fff", border:`1px solid ${sel.border}`, borderRadius:7 }}>
          <input type="checkbox" checked={pirRequired} onChange={e=>setPirRequired(e.target.checked)} style={{ width:15, height:15, accentColor:sel.col }}/>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:sel.col }}>📋 PIR / Post-Incident Review required</div>
            <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>Schedule debrief within 5 business days — identify root cause & preventive actions</div>
          </div>
        </label>
      )}
      <button onClick={()=>onClose(result, note, pirRequired)}
        style={{ width:"100%", background:sel.col, color:"#fff", border:"none", borderRadius:7, padding:"9px 0", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
        {sel.icon} Close as {result}
      </button>
    </div>
  );
}

// ─── COPY ID BUTTON ───────────────────────────────────────────────────────────
function CopyIdButton({id}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const url = window.location.origin + window.location.pathname + "#" + id;
    navigator.clipboard?.writeText(url).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false), 2000);
  }
  return (
    <button onClick={copy} title="Copy shareable link"
      style={{background:copied?"#f0fdf4":T.bg,border:`1px solid ${copied?"#86efac":T.border}`,borderRadius:5,
        cursor:"pointer",padding:"2px 8px",fontSize:10,color:copied?"#15803d":T.muted,fontWeight:600,fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
      {copied?"✓ Copied":"🔗 Copy link"}
    </button>
  );
}

// ─── CHANGE DETAIL MODAL ──────────────────────────────────────────────────────
export default function ChangeDetail({change,currentUser,onClose,onUpdate,windows}){
  const [tab,setTab]=useState("overview");
  const TABS=["overview","preflight","steps","approval","execution","comments","cab","log"];
  const avail=t=>{
    const s=change.status;
    if(t==="preflight") return ["Draft","Preflight"].includes(s);
    if(t==="approval")  return ["Pending Approval","Approved"].includes(s);
    if(t==="execution") return ["Approved","In Execution","Completed","Failed","Rolled Back","Aborted","Off-Script"].includes(s);
    if(t==="cab") return !!(change.cab);
    return true;
  };
  function addLog(msg,type="info"){onUpdate(c=>({...c,auditLog:[...(c.auditLog||[]),{at:now(),msg,type,by:currentUser.name}]}))}
  function moveTo(status){onUpdate(c=>({...c,status}));addLog(`Status → ${status}`);}

  // preflight
  const results=change.preflightResults||{};
  const DEFAULT_PF_CHECKS=[
    {id:"syntax",label:"Syntax Validation"},{id:"conflict",label:"Conflict Detection"},
    {id:"reachability",label:"Device Reachability"},{id:"policy",label:"Policy Compliance"},
    {id:"rollback",label:"Rollback Plan Verified"},{id:"window",label:"Maintenance Window Confirmed"},
  ];
  const PF_CHECKS = (change.preflightSteps && change.preflightSteps.length > 0)
    ? change.preflightSteps
    : DEFAULT_PF_CHECKS;
  const [pfLog,setPfLog]=useState({});
  const [pfModal,setPfModal]=useState(null);
  function setResult(id,data){onUpdate(c=>({...c,preflightResults:{...(c.preflightResults||{}),[id]:{...data,by:currentUser.name,at:now()}}}))}
  async function autoCheck(chk){
    setResult(chk.id,{status:"running",log:""});
    await new Promise(r=>setTimeout(r,600+Math.random()*400));
    setResult(chk.id,{status:"pass",log:`Auto-check at ${new Date().toLocaleTimeString()} — OK`});
  }
  async function runAllPF(){for(const c of PF_CHECKS){if(results[c.id]?.status==="pass") continue; await autoCheck(c);}}
  const pfAllPass=PF_CHECKS.every(c=>results[c.id]?.status==="pass");
  const pfFail=PF_CHECKS.some(c=>results[c.id]?.status==="fail");

  // ── execution state ──────────────────────────────────────────────────────
  const stepLogs = change.stepLogs || {};
  const [activeStepIdx, setActiveStepIdx] = useState(() => {
    if (!change.steps) return 0;
    const first = change.steps.findIndex(s => !(change.stepLogs?.[s.id]?.status === "done"));
    return first >= 0 ? first : 0;
  });
  const [stepNote, setStepNote] = useState("");
  const [cliOutput, setCliOutput] = useState("");
  const [subChecks, setSubChecks] = useState({});
  const [copied, setCopied] = useState(null);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [attachments, setAttachments] = useState({});
  const [tick, setTick] = useState(0);
  const [execStarted] = useState(change.actualStart || now());
  const [stepStartTimes, setStepStartTimes] = useState({});
  useState(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); });
  function elapsedSec(iso) { if (!iso) return 0; return Math.floor((Date.now() - new Date(iso).getTime()) / 1000); }
  function setStepLog(sid, data) { onUpdate(c => ({ ...c, stepLogs: { ...(c.stepLogs || {}), [sid]: { ...(c.stepLogs?.[sid] || {}), ...data } } })); }
  function activateStep(idx) {
    const step = change.steps?.[idx];
    if (step && !stepStartTimes[step.id]) setStepStartTimes(t => ({...t, [step.id]: now()}));
    setActiveStepIdx(idx);
  }
  function copyCmd(text, idx) { navigator.clipboard?.writeText(text).catch(() => {}); setCopied(idx); setTimeout(() => setCopied(null), 1500); }
  function completeStep(step, idx, failed = false) {
    const combinedNote = [stepNote.trim(), cliOutput.trim() ? "--- CLI OUTPUT ---\n" + cliOutput.trim() : ""].filter(Boolean).join("\n");
    if (combinedNote.length < 5) return;
    const lines = combinedNote.split("\n").filter(l => l.trim()).map(l => `[MANUAL] ${l}`);
    setStepLog(step.id, { status: failed ? "fail" : "done", lines, startedAt: stepStartTimes[step.id]||execStarted, completedAt: now(), by: currentUser.name, mode: "manual", note: combinedNote, subCheckResults: subChecks, attachmentCount: (attachments[step.id] || []).length });
    addLog(`Step ${idx + 1} "${step.name}" ${failed ? "FAILED" : "completed"}`, failed ? "error" : "success");
    if (failed) { moveTo("Failed"); }
    else if (idx < (change.steps?.length || 0) - 1) { activateStep(idx + 1); setStepNote(""); setCliOutput(""); setSubChecks({}); }
  }
  const execDone = change.steps && change.steps.every(s => stepLogs[s.id]?.status === "done");
  const globalElapsed = fmtSec(elapsedSec(execStarted));
  const activeStep = change.steps?.[activeStepIdx];
  const totalEstMin = (change.steps || []).reduce((a, s) => a + (s.duration || 0), 0);

  // approvals
  const [aprComment,setAprComment]=useState("");
  const levelColor={L1:"#15803d",L2:T.primary,L3:"#b91c1c"};
  const canApprove=()=>{
    const r=currentUser.role;
    if(change.freezePeriod) return r==="Director";
    if(change.approvalLevel==="L1"&&r==="Engineer") return true;
    if(change.approvalLevel==="L2"&&["Manager","Director"].includes(r)) return true;
    if(change.approvalLevel==="L3"&&r==="Director") return true;
    return false;
  };
  const mw=windows.find(w=>w.id===change.maintenanceWindow);

  // execution TAB UI
  const execTabUI = (
    <div style={{ display:"flex", flexDirection:"column", margin:"-22px", overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 20px", background:"#0f172a", color:"#f1f5f9", flexShrink:0, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:"0.5px" }}>EXECUTING</div>
          <div style={{ fontSize:14, fontWeight:700, color:"#f1f5f9", maxWidth:340, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{change.name}</div>
          <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>{change.id} · {change.team} · {currentUser.name}</div>
        </div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {(change.affectedServices||[]).map(s=><span key={s} style={{ fontSize:10, background:"#1e293b", color:"#94a3b8", border:"1px solid #334155", borderRadius:4, padding:"2px 7px", fontWeight:600 }}>{s}</span>)}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:18, alignItems:"center" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase" }}>Elapsed</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#22d3ee", fontFamily:"monospace" }}>{globalElapsed}</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase" }}>Steps</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#f8fafc" }}>{change.steps?.filter(s=>stepLogs[s.id]?.status==="done").length||0}/{change.steps?.length||0}</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase" }}>Est. Total</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#94a3b8" }}>{totalEstMin} min</div>
          </div>
          <div style={{ display:"flex", gap:7 }}>
            <button onClick={()=>{onUpdate(c=>({...c,execResult:"Off-Script"}));addLog("Marked as Off-Script","warning");}} style={{ background:"#78350f", border:"1px solid #b45309", borderRadius:6, color:"#fcd34d", padding:"6px 11px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>⚠ OFF-SCRIPT</button>
            <button onClick={()=>setShowRollbackConfirm(true)} style={{ background:"#431407", border:"1px solid #c2410c", borderRadius:6, color:"#fdba74", padding:"6px 11px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>↩ ROLLBACK</button>
            <button onClick={()=>{moveTo("Aborted");addLog("Change aborted by engineer","error");}} style={{ background:"#7f1d1d", border:"1px solid #b91c1c", borderRadius:6, color:"#fca5a5", padding:"6px 11px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>⊘ ABORT</button>
          </div>
        </div>
      </div>
      <div style={{ height:4, background:"#1e293b", flexShrink:0 }}>
        <div style={{ height:"100%", background:"linear-gradient(90deg,#1d4ed8,#06b6d4)", transition:"width 0.5s", width:`${((change.steps?.filter(s=>stepLogs[s.id]?.status==="done").length||0)/Math.max(change.steps?.length||1,1))*100}%` }}/>
      </div>
      {showRollbackConfirm&&(
        <div style={{ background:"#431407", border:"2px solid #c2410c", padding:"14px 20px", display:"flex", gap:14, alignItems:"center", flexShrink:0 }}>
          <span style={{ fontSize:13, color:"#fdba74", fontWeight:600 }}>↩ Confirm rollback?</span>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#fbbf24", background:"#1c0a00", padding:"6px 12px", borderRadius:5, flex:1 }}>{change.rollbackPlan}</div>
          <button onClick={()=>{moveTo("Rolled Back");addLog("Rollback initiated","warning");setShowRollbackConfirm(false);}} style={{ background:"#c2410c", border:"none", borderRadius:6, color:"#fff", padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Yes, Rollback</button>
          <button onClick={()=>setShowRollbackConfirm(false)} style={{ background:"transparent", border:"1px solid #c2410c", borderRadius:6, color:"#fdba74", padding:"8px 16px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
        </div>
      )}
      <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:520 }}>
        <div style={{ width:248, flexShrink:0, borderRight:"1px solid #e2e8f0", overflowY:"auto", background:"#f8fafc" }}>
          {(change.steps||[]).map((step,idx)=>{
            const log=stepLogs[step.id]; const st=log?.status||"waiting";
            const isActive=idx===activeStepIdx; const isDone=st==="done"; const isFail=st==="fail";
            const isLocked=idx>activeStepIdx&&!isDone&&!isFail;
            const col=isDone?"#15803d":isFail?"#b91c1c":isActive?"#1d4ed8":"#94a3b8";
            const bg=isActive?"#eff6ff":isDone?"#f0fdf4":isFail?"#fef2f2":"transparent";
            return (
              <div key={step.id} onClick={()=>!isLocked&&activateStep(idx)}
                style={{ padding:"11px 13px", borderBottom:"1px solid #e2e8f0", cursor:isLocked?"default":"pointer", background:bg, borderLeft:`3px solid ${isActive?"#1d4ed8":isDone?"#15803d":isFail?"#b91c1c":"transparent"}`, opacity:isLocked?0.4:1 }}>
                <div style={{ display:"flex", gap:9, alignItems:"flex-start" }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", background:col+"18", color:col, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:11, flexShrink:0, marginTop:1 }}>{isDone?"✓":isFail?"✗":String(idx+1)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:isActive?700:600, color:isActive?"#1d4ed8":"#0f172a", lineHeight:1.3, marginBottom:2 }}>{step.name}</div>
                    <div style={{ fontSize:10, color:"#64748b" }}>{step.duration} min</div>
                    {isDone&&<div style={{ fontSize:10, color:"#15803d", marginTop:2 }}>✓ {log.by} · {log.startedAt?fmtSec(Math.max(0,Math.floor((new Date(log.completedAt)-new Date(log.startedAt))/1000)))+"min":"—"}</div>}
                    {isFail&&<div style={{ fontSize:10, color:"#b91c1c", marginTop:2 }}>✗ Failed — {log.by}</div>}
                  </div>
                </div>
              </div>
            );
          })}
          {execDone&&change.status!=="Completed"&&change.status!=="Failed"&&change.status!=="Rolled Back"&&change.status!=="Aborted"&&(
            <CloseChangePanel change={change} currentUser={currentUser} onClose={(result,note,pirRequired)=>{
              onUpdate(c=>({...c,status:"Completed",execResult:result,actualEnd:now(),pirRequired:pirRequired||false}));
              addLog(`Change closed — ${result}${note?": "+note.slice(0,60):""}${pirRequired?" · PIR scheduled":""}`,result==="Successful"?"success":"warning");
            }}/>
          )}
          {["Completed","Failed","Rolled Back","Aborted","Off-Script"].includes(change.status)&&(
            <div style={{ padding:"12px 13px", background:change.execResult==="Successful"?"#f0fdf4":"#fef2f2", borderTop:`2px solid ${change.execResult==="Successful"?"#86efac":"#fca5a5"}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:change.execResult==="Successful"?"#15803d":"#b91c1c", marginBottom:3 }}>
                {change.execResult==="Successful"?"✓ Closed as Successful":`✕ ${change.execResult||change.status}`}
              </div>
              <div style={{ fontSize:10, color:"#64748b" }}>{fmt(change.actualEnd)}</div>
            </div>
          )}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"22px 26px", background:"#ffffff" }}>
          {!activeStep&&<div style={{ color:"#94a3b8", textAlign:"center", paddingTop:60 }}>Select a step.</div>}
          {activeStep&&(()=>{
            const log=stepLogs[activeStep.id]; const st=log?.status||"waiting";
            const isDone=st==="done"; const isFail=st==="fail";
            const hasLog=(stepNote.trim()||cliOutput.trim()).length>=5;
            const stepSubChecks=activeStep.subChecks||[];
            return <div>
              <div style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:20 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:isDone?"#dcfce7":isFail?"#fee2e2":"#eff6ff", color:isDone?"#15803d":isFail?"#b91c1c":"#1d4ed8", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:17, flexShrink:0 }}>{isDone?"✓":isFail?"✗":String(activeStepIdx+1)}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:20, fontWeight:800, color:"#0f172a", letterSpacing:"-0.3px" }}>{activeStep.name}</div>
                  <div style={{ fontSize:12, color:"#64748b", marginTop:3, display:"flex", gap:14 }}>
                    <span>Owner: <b style={{ color:"#0f172a" }}>{activeStep.owner}</b></span>
                    <span>Est: <b style={{ color:"#0f172a" }}>{activeStep.duration} min</b></span>
                    <span>Step <b style={{ color:"#0f172a" }}>{activeStepIdx+1}/{change.steps?.length}</b></span>
                  </div>
                </div>
                <div style={{ textAlign:"center", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 14px", flexShrink:0 }}>
                  <div style={{ fontSize:10, color:"#64748b", textTransform:"uppercase", marginBottom:1 }}>Est. duration</div>
                  <div style={{ fontSize:18, fontWeight:800, color:"#1d4ed8", fontFamily:"monospace" }}>{String(activeStep.duration).padStart(2,"0")}:00</div>
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:3, height:12, background:"#f59e0b", borderRadius:2, display:"inline-block" }}/>Instructions
                </div>
                <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:7, padding:"10px 14px", fontSize:13, color:"#0f172a", lineHeight:1.7 }}>{activeStep.instructions}</div>
              </div>
              {(activeStep.commands||[]).length>0&&(
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:3, height:12, background:"#1d4ed8", borderRadius:2, display:"inline-block" }}/>Commands — click to copy
                  </div>
                  {(activeStep.commands||[]).map((cmd,i)=>(
                    <div key={i} style={{ display:"flex", borderRadius:7, border:"1px solid #e2e8f0", overflow:"hidden", marginBottom:5 }}>
                      <div style={{ flex:1, fontFamily:"monospace", fontSize:12, color:"#0f172a", background:"#f8fafc", padding:"8px 13px", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{cmd}</div>
                      <button onClick={()=>copyCmd(cmd,i)} style={{ background:copied===i?"#dcfce7":"#f1f5f9", border:"none", borderLeft:"1px solid #e2e8f0", padding:"8px 13px", cursor:"pointer", fontSize:11, color:copied===i?"#15803d":"#64748b", fontWeight:600, fontFamily:"inherit", flexShrink:0 }}>{copied===i?"✓ Copied":"⎘ Copy"}</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:3, height:12, background:"#15803d", borderRadius:2, display:"inline-block" }}/>Expected outcome
                </div>
                <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:7, padding:"10px 14px" }}>
                  <div style={{ fontSize:12, color:"#14532d", fontWeight:600, marginBottom:4 }}>{activeStep.expectedOutcome}</div>
                  {activeStep.expectedOutput&&<pre style={{ fontSize:11, fontFamily:"monospace", color:"#166534", background:"#dcfce7", borderRadius:5, padding:"8px 10px", marginTop:6, overflowX:"auto", whiteSpace:"pre-wrap", lineHeight:1.6 }}>{activeStep.expectedOutput}</pre>}
                </div>
              </div>
              {activeStep.rollback&&(
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:3, height:12, background:"#ef4444", borderRadius:2, display:"inline-block" }}/>Rollback for this step
                  </div>
                  <pre style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:7, padding:"10px 14px", fontFamily:"monospace", fontSize:11, color:"#7f1d1d", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{activeStep.rollback}</pre>
                </div>
              )}
              {stepSubChecks.length>0&&(
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:3, height:12, background:"#8b5cf6", borderRadius:2, display:"inline-block" }}/>Validation checklist
                  </div>
                  <div style={{ background:"#faf5ff", border:"1px solid #e9d5ff", borderRadius:7, padding:"10px 14px" }}>
                    {stepSubChecks.map((chk,i)=>{
                      const checked=isDone?(log?.subCheckResults?.[i]??false):(subChecks[i]||false);
                      return (
                        <label key={i} style={{ display:"flex", gap:10, alignItems:"center", padding:"6px 0", cursor:isDone?"default":"pointer", borderBottom:i<stepSubChecks.length-1?"1px solid #ede9fe":"none" }}>
                          <input type="checkbox" checked={checked} disabled={isDone||isFail} onChange={e=>!isDone&&setSubChecks(p=>({...p,[i]:e.target.checked}))} style={{ width:15, height:15, accentColor:"#8b5cf6", cursor:isDone?"default":"pointer" }}/>
                          <span style={{ fontSize:13, color:checked?"#5b21b6":"#374151", fontWeight:checked?600:400 }}>{chk}</span>
                          {checked&&<span style={{ marginLeft:"auto", fontSize:11, color:"#8b5cf6" }}>✓</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {(isDone||isFail)&&log?.lines?.length>0&&(
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", gap:16, alignItems:"center" }}>
                    Execution Log (recorded)
                    {log.startedAt&&<span style={{ fontSize:11, color:"#64748b", fontWeight:400, textTransform:"none" }}>
                      Started: {fmt(log.startedAt)} · Completed: {fmt(log.completedAt)} · Duration: {fmtSec(Math.max(0,Math.floor((new Date(log.completedAt)-new Date(log.startedAt))/1000)))}
                    </span>}
                  </div>
                  <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:7, padding:"10px 14px" }}>
                    {log.lines.map((l,i)=><div key={i} style={{ fontSize:12, fontFamily:"monospace", lineHeight:1.9, color:l.includes("✓")?"#15803d":l.includes("✗")?"#b91c1c":"#475569" }}>{l}</div>)}
                    {log.attachmentCount>0&&<div style={{ fontSize:11, color:"#8b5cf6", marginTop:6 }}>📎 {log.attachmentCount} attachment(s)</div>}
                  </div>
                </div>
              )}
              {!isDone&&!isFail&&(
                <div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:3, height:12, background:"#3b82f6", borderRadius:2, display:"inline-block" }}/>Notes / Observations <span style={{ color:"#ef4444" }}>*</span>
                    </div>
                    <textarea value={stepNote} onChange={e=>setStepNote(e.target.value)} rows={3}
                      placeholder="What did you do? What did you observe?"
                      style={{ width:"100%", background:"#f8fafc", border:"1px solid #c7d2fe", borderRadius:7, color:"#0f172a", padding:"10px 13px", fontSize:13, fontFamily:"inherit", outline:"none", resize:"vertical", lineHeight:1.6 }}/>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:3, height:12, background:"#0e7490", borderRadius:2, display:"inline-block" }}/>Paste CLI output <span style={{ fontSize:10, color:"#94a3b8", fontWeight:400 }}>— optional</span>
                    </div>
                    <textarea value={cliOutput} onChange={e=>setCliOutput(e.target.value)} rows={4}
                      placeholder={"Paste terminal output here:\n\nRouter# show version\nCisco IOS XR Software, Version 7.7.2"}
                      style={{ width:"100%", background:"#0f172a", border:"1px solid #334155", borderRadius:7, color:"#22d3ee", padding:"10px 13px", fontSize:12, fontFamily:"monospace", outline:"none", resize:"vertical", lineHeight:1.7 }}/>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:3, height:12, background:"#d97706", borderRadius:2, display:"inline-block" }}/>Attachments
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:7, background:"#f8fafc", border:"1px dashed #d1d5db", borderRadius:7, padding:"8px 14px", cursor:"pointer", fontSize:12, color:"#64748b" }}>
                        📎 Attach file
                        <input type="file" multiple style={{ display:"none" }} onChange={e=>setAttachments(p=>({...p,[activeStep.id]:[...(p[activeStep.id]||[]),...Array.from(e.target.files).map(f=>f.name)]}))}/>
                      </label>
                      {(attachments[activeStep.id]||[]).map((name,i)=>(
                        <span key={i} style={{ fontSize:11, background:"#eff6ff", color:"#1d4ed8", border:"1px solid #93c5fd", borderRadius:4, padding:"3px 8px" }}>📄 {name}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:10, alignItems:"center", paddingTop:4, borderTop:"1px solid #f1f5f9" }}>
                    <button onClick={()=>completeStep(activeStep,activeStepIdx,false)} disabled={!hasLog}
                      style={{ background:hasLog?"#15803d":"#f1f5f9", color:hasLog?"#fff":"#94a3b8", border:"none", borderRadius:7, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:hasLog?"pointer":"not-allowed", fontFamily:"inherit" }}>✓ Step Completed</button>
                    <button onClick={()=>completeStep(activeStep,activeStepIdx,true)} disabled={!hasLog}
                      style={{ background:"transparent", color:hasLog?"#b91c1c":"#94a3b8", border:`1px solid ${hasLog?"#fca5a5":"#e2e8f0"}`, borderRadius:7, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:hasLog?"pointer":"not-allowed", fontFamily:"inherit" }}>✗ Step Failed</button>
                    <span style={{ fontSize:11, color:"#94a3b8" }}>{!hasLog?"Add notes or CLI output to continue":`${(stepNote+cliOutput).trim().length} chars logged ✓`}</span>
                  </div>
                </div>
              )}
            </div>;
          })()}
        </div>
      </div>
    </div>
  );

  return <Modal title={change.name} onClose={onClose} width={940}>
    {/* chips */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
      <Badge status={change.status}/><RiskPill risk={change.risk}/>
      <TypeTag type={change.type}/><IntrusionTag v={change.intrusion}/>
      {change.freezePeriod&&<FreezeTag/>}
      {change.execResult&&<span style={{fontSize:11,background:"#f0fdf4",color:"#15803d",border:"1px solid #86efac",borderRadius:4,padding:"2px 8px",fontWeight:600}}>{change.execResult}</span>}
      <span style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
        <span style={{fontSize:11,color:T.light}}>ID:</span>
        <b style={{color:T.muted,fontFamily:"monospace",fontSize:11}}>{change.id}</b>
        <CopyIdButton id={change.id}/>
      </span>
    </div>
    {/* tabs */}
    <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,marginBottom:20,overflowX:"auto",gap:2}}>
      {TABS.map(t=>{
        const label={overview:"Overview",preflight:`Preflight (${Object.keys(change.preflightResults||{}).length}/6)`,steps:`Steps (${change.steps?.length||0})`,approval:`Approvers (${change.approvals?.length||0})`,execution:"Execution",comments:`Comments (${change.comments?.length||0})`,cab:"CAB",log:"Audit Trail"}[t]||t;
        const active=tab===t;
        return <button key={t} onClick={()=>avail(t)&&setTab(t)} style={{background:active?T.primaryBg:"none",border:"none",borderBottom:active?`2px solid ${T.primary}`:"2px solid transparent",borderRadius:active?"6px 6px 0 0":0,padding:"9px 14px",cursor:avail(t)?"pointer":"not-allowed",fontSize:12,fontWeight:active?700:500,fontFamily:"inherit",color:!avail(t)?T.light:active?T.primary:T.muted,whiteSpace:"nowrap",transition:"color 0.15s,background 0.15s"}}>{label}</button>;
      })}
    </div>

    {/* overview */}
    {tab==="overview"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      {change.freezePeriod&&<div style={{gridColumn:"1/-1",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"12px 16px"}}>
        <div style={{fontWeight:700,color:T.freeze,fontSize:13,marginBottom:4}}>❄ Freeze Period — Director Approval Required</div>
        <div style={{fontSize:12,color:"#b91c1c",fontStyle:"italic"}}>"{change.freezeJustification}"</div>
      </div>}
      {change.purpose&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Purpose / Activity Details</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6,background:T.bg,padding:"10px 13px",borderRadius:7,border:`1px solid ${T.border}`}}>{change.purpose}</div>
      </div>}
      {change.expectedEndState&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Expected End State</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6}}>{change.expectedEndState}</div>
      </div>}
      {!change.purpose&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Description</div>
        <div style={{fontSize:14,color:T.text,lineHeight:1.6}}>{change.description}</div>
      </div>}
      <div style={{gridColumn:"1/-1",background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"12px 16px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#92400e",textTransform:"uppercase",marginBottom:4}}>⚠ Service Impact</div>
        <div style={{fontSize:13,color:T.text}}>{change.serviceImpact||"Not specified."}</div>
        {change.affectedServices?.length>0&&<div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
          {change.affectedServices.map(s=><span key={s} style={{background:"#fef9c3",color:"#713f12",border:"1px solid #fde68a",borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:600}}>{s}</span>)}
        </div>}
      </div>
      {[
        ["Domain",change.domain],["Risk",change.risk],["Country",change.country?(COUNTRIES.find(c=>c.code===change.country)?.name??change.country):"—"],
        ["Approval",change.approvalLevel],["Exec Mode",change.execMode],["Intrusion",change.intrusion],
        ["Team",change.team],["Manager",change.manager],["Director",change.director],
        ["Scheduled Start",fmt(change.scheduledFor)],["Scheduled End",fmt(change.scheduledEnd)],
        ["Actual Start",fmt(change.actualStart)],["Actual End",fmt(change.actualEnd)],
      ].map(([l,v])=>(
        <div key={l}><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{l}</div><div style={{fontSize:13,color:T.text}}>{v||"—"}</div></div>
      ))}
      {mw&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>Maintenance Window</div><div style={{fontSize:13,color:T.accent,fontWeight:600}}>{mw.name}</div><div style={{fontSize:11,color:T.muted}}>{fmt(mw.start)} → {fmt(mw.end)}</div></div>}
      {change.relatedTickets&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>Related Tickets</div><div style={{fontSize:13,color:T.text}}>{change.relatedTickets}</div></div>}
      <div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Rollback Plan</div>
        <pre style={{fontFamily:"monospace",fontSize:12,color:T.text,background:T.bg,padding:"9px 12px",borderRadius:7,border:`1px solid ${T.border}`,whiteSpace:"pre-wrap"}}>{change.rollbackPlan}</pre>
      </div>
      {change.blastRadius&&<div style={{gridColumn:"1/-1",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"12px 16px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#b91c1c",textTransform:"uppercase",marginBottom:4}}>💥 Blast Radius</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6}}>{change.blastRadius}</div>
      </div>}
      {change.dependencies&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Dependencies</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6,whiteSpace:"pre-wrap",background:T.bg,padding:"9px 12px",borderRadius:7,border:`1px solid ${T.border}`}}>{change.dependencies}</div>
      </div>}
      {(change.affectedRegions||change.affectedInterfaces)&&<div style={{gridColumn:"1/-1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {change.affectedRegions&&<div><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>Affected Regions</div><div style={{fontSize:13,color:T.text}}>{change.affectedRegions}</div></div>}
        {change.affectedInterfaces&&<div><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>Affected Interfaces</div><div style={{fontSize:13,color:T.text}}>{change.affectedInterfaces}</div></div>}
      </div>}
      {change.validationPlan&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Validation Plan</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6,whiteSpace:"pre-wrap",background:"#f0fdf4",padding:"9px 12px",borderRadius:7,border:"1px solid #86efac"}}>{change.validationPlan}</div>
      </div>}
      {change.rollbackTrigger&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Rollback Trigger</div>
        <div style={{fontSize:13,color:"#b91c1c",lineHeight:1.6,background:"#fef2f2",padding:"9px 12px",borderRadius:7,border:"1px solid #fca5a5"}}>{change.rollbackTrigger}</div>
      </div>}
      {change.escalationPath&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Escalation Path</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6,whiteSpace:"pre-wrap",background:T.bg,padding:"9px 12px",borderRadius:7,border:`1px solid ${T.border}`}}>{change.escalationPath}</div>
      </div>}
      {change.pirRequired&&<div style={{gridColumn:"1/-1",background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:16}}>📋</span>
        <div><div style={{fontWeight:700,color:"#92400e",fontSize:13}}>PIR / Post-Incident Review Scheduled</div><div style={{fontSize:12,color:"#b45309",marginTop:1}}>Debrief required within 5 business days.</div></div>
      </div>}
      <div style={{gridColumn:"1/-1",display:"flex",gap:10,paddingTop:6,flexWrap:"wrap",alignItems:"center"}}>
        {change.status==="Draft"&&<Btn onClick={()=>{moveTo("Preflight");setTab("preflight");}}>→ Start Preflight</Btn>}
        {change.status==="Approved"&&<Btn variant="success" onClick={()=>{const t=now();moveTo("In Execution");onUpdate(c=>({...c,actualStart:t}));if(change.steps?.[0]) setStepStartTimes({[change.steps[0].id]:t});setTab("execution");}}>▶ Begin Execution</Btn>}
        <div style={{marginLeft:"auto"}}>
          {!change.isTemplate
            ? <Btn variant="ghost" small onClick={()=>{onUpdate(c=>({...c,isTemplate:true}));addLog("Saved as reusable template","info");}}>⊡ Save as Template</Btn>
            : <Btn variant="ghost" small onClick={()=>{onUpdate(c=>({...c,isTemplate:false}));addLog("Removed from templates","info");}}>↩ Remove from Templates</Btn>
          }
        </div>
      </div>
    </div>}

    {/* preflight */}
    {tab==="preflight"&&<div>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,padding:"9px 13px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8}}>
        <Btn small variant="outline" onClick={runAllPF}>▶ Run All Auto</Btn>
        <span style={{fontSize:12,color:T.muted}}>or complete each check manually</span>
      </div>
      {PF_CHECKS.map(chk=>{
        const r=results[chk.id]; const st=r?.status||"pending";
        const col={pass:"#15803d",fail:"#b91c1c",running:"#b45309",pending:T.light}[st];
        const icon={pass:"✓",fail:"✗",running:"…",pending:"○"}[st];
        return <div key={chk.id} style={{border:`1px solid ${T.border}`,borderRadius:8,marginBottom:7,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:11,padding:"9px 13px",background:st==="pass"?"#f0fdf4":st==="fail"?"#fef2f2":T.surface}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:col+"18",color:col,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,flexShrink:0}}>{icon}</div>
            <div style={{flex:1,fontSize:13,fontWeight:600,color:T.text}}>{chk.label}</div>
            <div style={{display:"flex",gap:6}}>
              {st==="pass"&&<span style={{fontSize:11,color:"#15803d",fontWeight:600}}>PASSED · {r.by}</span>}
              {st!=="pass"&&st!=="running"&&<>
                {!chk.id.startsWith("custom_")&&<Btn small variant="outline" onClick={()=>autoCheck(chk)}>Auto</Btn>}
                <Btn small variant="ghost" onClick={()=>{setPfModal(chk);setPfLog({[chk.id]:""})}}>Manual</Btn>
              </>}
            </div>
          </div>
          {r?.log&&<div style={{padding:"6px 48px",fontSize:11,color:T.muted,background:T.bg,borderTop:`1px solid ${T.border}`,fontFamily:"monospace"}}>{r.log}</div>}
        </div>;
      })}
      <div style={{display:"flex",gap:10,marginTop:14}}>
        {pfAllPass&&<Btn variant="success" onClick={()=>{moveTo("Pending Approval");addLog("Preflight passed","success");setTab("approval");}}>✓ All Passed — Submit for Approval</Btn>}
        {pfFail&&<Btn variant="danger" onClick={()=>{moveTo("Failed");addLog("Preflight failed","error");}}>✗ Mark Failed</Btn>}
      </div>
      {pfModal&&<Modal title={`Manual Check: ${pfModal.label}`} onClose={()=>setPfModal(null)} width={460}>
        <Inp label="Evidence log (mandatory)" value={pfLog[pfModal.id]||""} onChange={v=>setPfLog(p=>({...p,[pfModal.id]:v}))} type="textarea" rows={4} placeholder="Describe what you did and observed…" required/>
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <Btn variant="success" disabled={(pfLog[pfModal.id]||"").length<5} onClick={()=>{setResult(pfModal.id,{status:"pass",log:pfLog[pfModal.id]});setPfModal(null);}}>✓ Passed</Btn>
          <Btn variant="danger"  disabled={(pfLog[pfModal.id]||"").length<5} onClick={()=>{setResult(pfModal.id,{status:"fail",log:pfLog[pfModal.id]});setPfModal(null);}}>✗ Failed</Btn>
          <Btn variant="ghost" onClick={()=>setPfModal(null)}>Cancel</Btn>
        </div>
      </Modal>}
    </div>}

    {/* steps (read-only view) */}
    {tab==="steps"&&<div>
      {(change.steps||[]).map((s,i)=><div key={s.id} style={{marginBottom:9,padding:14,background:T.bg,border:`1px solid ${T.border}`,borderRadius:9}}>
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
          <div style={{width:24,height:24,borderRadius:"50%",background:T.border,color:T.muted,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,flexShrink:0}}>{i+1}</div>
          <div style={{fontWeight:700,fontSize:13,color:T.text,flex:1}}>{s.name}</div>
          <div style={{fontSize:11,color:T.muted}}>Owner: {s.owner} · {s.duration} min</div>
        </div>
        <div style={{paddingLeft:34,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>Instructions</div><div style={{fontSize:12,color:T.text,lineHeight:1.5}}>{s.instructions}</div></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>Expected Outcome</div><div style={{fontSize:12,color:"#15803d",lineHeight:1.5}}>{s.expectedOutcome}</div></div>
          {s.commands?.length>0&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:11,color:T.muted,marginBottom:2}}>Commands</div>{s.commands.map((cmd,ci)=><div key={ci} style={{fontFamily:"monospace",fontSize:11,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,padding:"4px 8px",marginBottom:3}}>{cmd}</div>)}</div>}
        </div>
      </div>)}
    </div>}

    {/* approval */}
    {tab==="approval"&&<div>
      {change.freezePeriod&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"12px 16px",marginBottom:16}}>
        <div style={{fontWeight:700,color:T.freeze,fontSize:13}}>❄ Freeze Period — Only Director can approve</div>
        <div style={{fontSize:12,color:"#b91c1c",marginTop:2,fontStyle:"italic"}}>"{change.freezeJustification}"</div>
      </div>}
      <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:18,padding:13,background:(levelColor[change.approvalLevel]||T.muted)+"0d",borderRadius:8,border:`1px solid ${(levelColor[change.approvalLevel]||T.muted)}30`}}>
        <div style={{fontSize:24,fontWeight:800,color:change.freezePeriod?T.freeze:levelColor[change.approvalLevel],fontFamily:"monospace"}}>{change.freezePeriod?"L3":change.approvalLevel}</div>
        <div>
          <div style={{fontWeight:700,color:T.text,fontSize:14}}>{change.freezePeriod?"Director (Freeze Override)":({L1:"Peer / Auto",L2:"Manager Review",L3:"Director / Bar Raiser"})[change.approvalLevel]}</div>
          <div style={{fontSize:12,color:T.muted,marginTop:3,display:"flex",gap:8,alignItems:"center"}}><RiskPill risk={change.risk}/>{change.cab&&<span style={{fontSize:11,color:T.primary,fontWeight:600}}>CAB required</span>}</div>
        </div>
      </div>
      {(change.approvals||[]).length>0&&<div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Approval History</div>
        {(change.approvals||[]).map((a,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:a.action==="approved"?"#15803d":"#b91c1c",flexShrink:0,marginTop:5}}/>
          <div><span style={{fontWeight:600,color:T.text,fontSize:13}}>{a.by}</span><span style={{color:T.muted,fontSize:12}}> · {a.action} · {fmt(a.at)}</span>{a.comment&&<div style={{fontSize:12,color:T.muted,fontStyle:"italic",marginTop:2}}>"{a.comment}"</div>}</div>
        </div>)}
      </div>}
      <Inp label="Comment" value={aprComment} onChange={setAprComment} type="textarea" rows={2} placeholder="Add context…" style={{marginBottom:12}}/>
      {canApprove()
        ?<div style={{display:"flex",gap:10}}>
          <Btn variant="success" onClick={()=>{const e={by:currentUser.name,action:"approved",at:now(),comment:aprComment};onUpdate(c=>({...c,status:"Approved",approvals:[...(c.approvals||[]),e]}));addLog(`Approved by ${currentUser.name}`,"success");setAprComment("");setTab("execution");}}>✓ Approve</Btn>
          <Btn variant="danger"  onClick={()=>{const e={by:currentUser.name,action:"rejected",at:now(),comment:aprComment};onUpdate(c=>({...c,status:"Draft",approvals:[...(c.approvals||[]),e]}));addLog(`Rejected by ${currentUser.name}`,"error");setAprComment("");}}>✗ Reject</Btn>
        </div>
        :<div style={{fontSize:13,color:T.muted,padding:"9px 13px",background:T.bg,borderRadius:7,border:`1px solid ${T.border}`}}>{change.freezePeriod?`Freeze: only Directors can approve (you are ${currentUser.role})`:`Your role (${currentUser.role}) cannot approve ${change.approvalLevel}`}</div>}
    </div>}

    {/* execution */}
    {tab==="execution"&&execTabUI}

    {/* comments */}
    {tab==="comments"&&<CommentStream change={change} currentUser={currentUser} onUpdate={onUpdate}/>}

    {/* cab */}
    {tab==="cab"&&change.cab&&<CABPanel change={change} currentUser={currentUser} onUpdate={onUpdate} addLog={addLog}/>}
    {tab==="cab"&&!change.cab&&<div style={{color:T.muted,fontSize:13,padding:"20px 0"}}>CAB review is not required for this change category/risk level.</div>}

    {/* log */}
    {tab==="log"&&<div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <Btn small variant="outline" onClick={()=>exportAuditCSV([change])}>⬇ Export CSV</Btn>
      </div>
      <div style={{maxHeight:400,overflowY:"auto"}}>
        {[...(change.auditLog||[])].reverse().map((e,i)=>{
          const col={info:T.muted,success:"#15803d",error:"#b91c1c",warning:"#b45309"}[e.type]||T.muted;
          return <div key={i} style={{display:"flex",gap:11,padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:col,marginTop:5,flexShrink:0}}/>
            <div style={{flex:1}}>
              <span style={{fontSize:13,color:T.text}}>{e.msg}</span>
              <span style={{fontSize:11,color:T.light,marginLeft:8}}>by {e.by}</span>
              <div style={{fontSize:11,color:T.light,marginTop:1}}>{fmt(e.at)}</div>
            </div>
          </div>;
        })}
      </div>
    </div>}
  </Modal>;
}
