import { useState } from "react";
import { T, SYSTEMS, EXEC_MODES, INTRUSION, COUNTRIES, RISK_LEVELS, RISK_C } from "../data/constants.js";
import { genChangeId, genTemplateId, now, fmt, applyVars } from "../utils/helpers.js";
import { isInPeakPeriod, CAT_META, getCategoryRules } from "../utils/helpers.js";
import { RiskPill, Btn, Inp, Sel } from "./ui/index.jsx";

// severity helpers (mirrors FreezeManager SEV)
const SEV_LABEL = { orange:"🟠 Orange — Head of / Manager approval", red:"🔴 Red — Director approval" };

// ─── CREATE MODE PICKER ───────────────────────────────────────────────────────
export function CreateModePicker({templates, activePeak, currentUser, peaks=[], onPickAdHoc, onPickTemplate, onPickNewTemplate, onClose, onCreate}) {
  const [step, setStep] = useState("pick"); // "pick" | "template-list" | "template-fill"
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const OPTIONS = [
    {
      key:"from-template",
      icon:"⊡",
      label:"Use a Template",
      desc:"Start from an existing approved template. Steps, checks and rollback are pre-filled.",
      color:"#6d28d9", bg:"#f5f3ff", border:"#c4b5fd",
      action:() => setStep("template-list"),
    },
    {
      key:"new-template",
      icon:"📐",
      label:"Create a Template",
      desc:"Build a reusable template with steps, pre/post checks and rollback plans for your team.",
      color:"#0f766e", bg:"#f0fdfa", border:"#99f6e4",
      action: onPickNewTemplate,
    },
    {
      key:"adhoc",
      icon:"↻",
      label:"Ad-hoc Change",
      desc:"One-off change for a specific situation. You define everything from scratch.",
      color:"#b45309", bg:"#fffbeb", border:"#fcd34d",
      action: onPickAdHoc,
    },
  ];

  if (step === "template-fill" && selectedTemplate) {
    return <TemplateQuickFill
      template={selectedTemplate}
      activePeak={activePeak}
      peaks={peaks}
      currentUser={currentUser}
      onCreate={c => { onCreate(c); onClose(); }}
      onClose={onClose}
    />;
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",backdropFilter:"blur(3px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:640,boxShadow:"0 24px 64px rgba(0,0,0,0.22)"}}>

        {step === "pick" && <>
          <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:17,fontWeight:800,color:T.text,letterSpacing:"-0.3px"}}>New BNOC Change</div>
              <div style={{fontSize:12,color:T.muted,marginTop:2}}>How do you want to create this change?</div>
            </div>
            <button onClick={onClose} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:16,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>

          {activePeak && (()=>{
            const isOrange=activePeak.severity==="orange";
            const fc=isOrange?"#c2410c":"#dc2626", fb=isOrange?"#fff7ed":"#fef2f2", fb2=isOrange?"#fed7aa":"#fca5a5";
            const approver=isOrange?"Head of / Manager":"Director";
            return <div style={{margin:"16px 24px 0",background:fb,border:`1px solid ${fb2}`,borderRadius:10,padding:"12px 16px",display:"flex",gap:12,alignItems:"flex-start"}}>
              <span style={{fontSize:18,flexShrink:0}}>{isOrange?"⚠":"❄"}</span>
              <div>
                <div style={{fontWeight:700,color:fc,fontSize:13}}>{SEV_LABEL[activePeak.severity]||"Network Freeze"} Active: {activePeak.name}</div>
                <div style={{fontSize:12,color:fc,marginTop:2}}>Any change created now will require <b>{approver} approval + business justification</b>.</div>
              </div>
            </div>;
          })()}

          <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:12}}>
            {OPTIONS.map(o=>(
              <button key={o.key} onClick={o.action} style={{display:"flex",alignItems:"center",gap:16,padding:"16px 20px",border:`2px solid ${o.border}`,borderRadius:12,background:o.bg,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"box-shadow 0.15s"}}>
                <div style={{width:48,height:48,borderRadius:12,background:"#fff",border:`1.5px solid ${o.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                  {o.icon}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:o.color,marginBottom:3}}>{o.label}</div>
                  <div style={{fontSize:12,color:T.muted,lineHeight:1.5}}>{o.desc}</div>
                </div>
                <span style={{color:o.color,fontSize:18,flexShrink:0}}>›</span>
              </button>
            ))}
          </div>
        </>}

        {step === "template-list" && <>
          <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>setStep("pick")} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:13,padding:"5px 12px",fontFamily:"inherit"}}>← Back</button>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:T.text}}>Choose a Template</div>
              <div style={{fontSize:12,color:T.muted,marginTop:1}}>{templates.length} template{templates.length!==1?"s":""} available</div>
            </div>
            <button onClick={onClose} style={{marginLeft:"auto",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:16,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
          <div style={{padding:"16px 24px",maxHeight:420,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
            {templates.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:T.light}}>No templates yet. Create one first.</div>}
            {templates.map(t=>(
              <button key={t.id} onClick={()=>{setSelectedTemplate(t);setStep("template-fill");}} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",border:`1px solid ${T.border}`,borderRadius:10,background:T.surface,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"border-color 0.15s,box-shadow 0.15s"}}>
                <div style={{width:38,height:38,borderRadius:9,background:"#f5f3ff",border:"1.5px solid #c4b5fd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>⊡</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:3}}>{t.name}</div>
                  <div style={{fontSize:11,color:T.muted,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>{t.domain} · {t.steps?.length||0} steps · {t.approvalLevel} · <RiskPill risk={t.risk}/></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#6d28d9"}}>Quick Fill →</span>
                  <span style={{fontSize:10,color:T.light}}>{(t.variables||[]).length} var{(t.variables||[]).length!==1?"s":""}</span>
                </div>
              </button>
            ))}
          </div>
        </>}

      </div>
    </div>
  );
}

// ─── STEP EDITOR FORM (used inside wizard) ────────────────────────────────────
export function StepEditorForm({draft, sdSf, onSave, onCancel}) {
  const valid = draft.name.trim().length >= 2 && draft.instructions.trim().length >= 5;
  return (
    <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:10 }}>
        <Inp label="Step Name *" value={draft.name} onChange={sdSf("name")} placeholder="e.g. Pre-checks & Baseline Snapshot"/>
        <Inp label="Duration (min)" value={draft.duration} onChange={sdSf("duration")} type="number"/>
        <Inp label="Owner" value={draft.owner} onChange={sdSf("owner")} placeholder="e.g. Engineer"/>
      </div>
      <Inp label="Instructions *" value={draft.instructions} onChange={sdSf("instructions")} type="textarea" rows={3}
        placeholder="Describe what the engineer needs to do in this step…"/>
      <Inp label="Commands (one per line)" value={Array.isArray(draft.commands)?draft.commands.join("\n"):draft.commands} onChange={sdSf("commands")} type="textarea" rows={3}
        placeholder={"show version\nshow isis adjacency\nshow bgp summary"}/>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Inp label="Pre-checks — verify before running (one per line)" value={Array.isArray(draft.preChecks)?draft.preChecks.join("\n"):draft.preChecks} onChange={sdSf("preChecks")} type="textarea" rows={3}
          placeholder={"All ISIS adjacencies UP\nBGP sessions Established\nNo active alarms"}/>
        <Inp label="Post-checks — validate after completing (one per line)" value={Array.isArray(draft.postChecks)?draft.postChecks.join("\n"):draft.postChecks} onChange={sdSf("postChecks")} type="textarea" rows={3}
          placeholder={"Version confirmed\nAll sessions re-established\nNo new alarms"}/>
      </div>
      <Inp label="Rollback for this step (if it fails)" value={draft.rollback} onChange={sdSf("rollback")} type="textarea" rows={2}
        placeholder="e.g. install rollback to label baseline-7.5.1"/>
      <Inp label="Expected outcome" value={draft.expectedOutcome||""} onChange={sdSf("expectedOutcome")}
        placeholder="e.g. All services restored, no alarms, version confirmed"/>
      <div style={{ display:"flex", gap:8, paddingTop:4 }}>
        <Btn onClick={onSave} disabled={!valid}>✓ Save Step</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// ─── TEMPLATE QUICK-FILL ─────────────────────────────────────────────────────
export function TemplateQuickFill({template, activePeak, peaks=[], currentUser, onCreate, onClose}) {
  const tvars = template.variables || [];
  const [vars, setVars] = useState(
    Object.fromEntries(tvars.map(v => [v.key, v.defaultValue || ""]))
  );
  const setVar = k => v => setVars(prev => ({...prev, [k]: v}));

  // Derive title live from template name with vars substituted
  const autoTitle = applyVars(template.name, vars);
  const [titleOverride, setTitleOverride] = useState(null); // null = auto
  const title = titleOverride ?? autoTitle;

  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [assignedTo, setAssignedTo] = useState(currentUser.name);
  const [country, setCountry] = useState(template.country || "");

  const peakConflict = isInPeakPeriod(scheduledFor, peaks);

  // Required vars validation
  const missingRequired = tvars.filter(v => v.required && !vars[v.key]?.trim());
  const valid = title.trim().length >= 3 && scheduledFor && missingRequired.length === 0;

  function createChange() {
    // Apply variable substitution across the entire template object
    const resolved = applyVars({...template}, vars);
    const newC = {
      ...resolved,
      id: genChangeId(),
      name: title.trim(),
      scheduledFor,
      scheduledEnd,
      assignedTo,
      country,
      status: "Draft",
      isTemplate: false,
      sourceTemplateId: template.id,
      variables: [],
      steps: (resolved.steps||[]).map(s => ({...s, id: Date.now()+Math.random()})),
      preflightResults: {},
      stepLogs: {},
      approvals: [],
      comments: [],
      createdBy: currentUser.name,
      createdAt: now(),
      execResult: null,
      actualStart: null,
      actualEnd: null,
      freezePeriod: !!peakConflict,
      freezeSeverity: peakConflict?.severity || null,
      auditLog: [
        {at: now(), msg: `Change created from template: ${template.name}`, type:"info", by: currentUser.name},
        {at: now(), msg: `Assigned to: ${assignedTo}`, type:"info", by: currentUser.name},
        ...(tvars.length ? [{at:now(), msg:`Variables: ${tvars.map(v=>`${v.label}=${vars[v.key]||"(empty)"}`).join(", ")}`, type:"info", by:currentUser.name}] : []),
        ...(peakConflict ? [{at:now(), msg:`${peakConflict.severity==="orange"?"⚠ Orange":"❄ Red"} freeze — ${peakConflict.severity==="orange"?"Head of":"Director"} approval required`, type:"warning", by: currentUser.name}] : []),
      ],
      notifications: [],
    };
    onCreate(newC);
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",backdropFilter:"blur(3px)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 16px",overflowY:"auto"}}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:680,boxShadow:"0 24px 64px rgba(0,0,0,0.22)"}}>

        {/* Header */}
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:12,alignItems:"center"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#f5f3ff",border:"1.5px solid #c4b5fd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>⊡</div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:800,color:T.text}}>Create from Template</div>
            <div style={{fontSize:12,color:T.muted,marginTop:1}}>{template.name} · {template.domain} · {template.steps?.length||0} steps · <RiskPill risk={template.risk}/></div>
          </div>
          <button onClick={onClose} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:16,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>

        <div style={{padding:"22px 24px",display:"flex",flexDirection:"column",gap:14}}>

          {activePeak && (()=>{
            const isOrange=activePeak.severity==="orange";
            const fc=isOrange?"#c2410c":"#dc2626", fb=isOrange?"#fff7ed":"#fef2f2", fb2=isOrange?"#fed7aa":"#fca5a5";
            return <div style={{background:fb,border:`1px solid ${fb2}`,borderRadius:9,padding:"11px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>{isOrange?"⚠":"❄"}</span>
              <div>
                <div style={{fontWeight:700,color:fc,fontSize:13}}>{isOrange?"🟠 Orange":"🔴 Red"} Freeze: {activePeak.name}</div>
                <div style={{fontSize:12,color:fc,marginTop:1}}>{isOrange?"Head of / Manager":"Director"} approval + business justification required.</div>
              </div>
            </div>;
          })()}

          {/* ── Template Variables ── */}
          {tvars.length > 0 && (
            <div style={{background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:10,padding:"14px 16px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#5b21b6",textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:10}}>
                ⚙ Template Variables
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                {tvars.map(v => (
                  <div key={v.key}>
                    <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>
                      {v.label}{v.required&&<span style={{color:"#b91c1c",marginLeft:2}}>*</span>}
                    </div>
                    <input
                      value={vars[v.key]||""}
                      onChange={e=>setVar(v.key)(e.target.value)}
                      placeholder={v.defaultValue||`Enter ${v.label.toLowerCase()}…`}
                      style={{width:"100%",padding:"7px 10px",border:`1.5px solid ${!vars[v.key]?.trim()&&v.required?"#fca5a5":T.border}`,borderRadius:7,fontFamily:"inherit",fontSize:13,color:T.text,background:T.surface,outline:"none"}}
                    />
                  </div>
                ))}
              </div>
              {missingRequired.length > 0 && (
                <div style={{marginTop:8,fontSize:11,color:"#b91c1c"}}>
                  ⚠ Required: {missingRequired.map(v=>v.label).join(", ")}
                </div>
              )}
            </div>
          )}

          {/* Live-preview title */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:T.muted,marginBottom:4}}>
              CHANGE TITLE *
              {titleOverride!==null&&<span style={{fontWeight:400,marginLeft:8,color:T.light,cursor:"pointer"}} onClick={()=>setTitleOverride(null)}>(reset to auto)</span>}
            </div>
            <input
              value={title}
              onChange={e=>setTitleOverride(e.target.value)}
              style={{width:"100%",padding:"8px 11px",border:`1.5px solid ${T.border}`,borderRadius:8,fontFamily:"inherit",fontSize:13,color:T.text,background:T.surface,outline:"none"}}
            />
            {titleOverride===null&&tvars.length>0&&(
              <div style={{fontSize:10,color:T.light,marginTop:3}}>Auto-generated from template name · click to customise</div>
            )}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Inp label="Scheduled Start *" value={scheduledFor} onChange={setScheduledFor} type="datetime-local"/>
            <Inp label="Scheduled End" value={scheduledEnd} onChange={setScheduledEnd} type="datetime-local"/>
          </div>

          {peakConflict && (()=>{
            const isOrange=peakConflict.severity==="orange";
            const fc=isOrange?"#c2410c":"#dc2626", fb=isOrange?"#fff7ed":"#fef2f2", fb2=isOrange?"#fed7aa":"#fca5a5";
            const approver=isOrange?"Head of / Manager":"Director";
            return <div style={{background:fb,border:`1px solid ${fb2}`,borderRadius:7,padding:"9px 13px",fontSize:12,color:fc}}>
              {isOrange?"⚠":"❄"} Selected date falls in <b>{peakConflict.name}</b> ({isOrange?"🟠 Orange":"🔴 Red"} freeze). {approver} approval will be required.
            </div>;
          })()}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Inp label="Assigned Technician *" value={assignedTo} onChange={setAssignedTo}
              placeholder={currentUser.name}/>
            <Sel label="Country *" value={country} onChange={setCountry}
              options={[{value:"",label:"— Select Country —"},...COUNTRIES.map(c=>({value:c.code,label:`${c.code} — ${c.name}`}))]}/>
          </div>

          {/* Template steps preview (with vars applied) */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Template steps ({template.steps?.length||0}) — preview after substitution</div>
            <div style={{border:`1px solid ${T.border}`,borderRadius:9,overflow:"hidden"}}>
              {(template.steps||[]).map((s,i) => (
                <div key={i} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 14px",borderBottom:i<(template.steps.length-1)?`1px solid ${T.border}`:"none",background:i%2===0?T.surface:T.bg}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:T.primaryBg,color:T.primary,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:11,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:12,color:T.text}}>{applyVars(s.name, vars)}</div>
                    <div style={{fontSize:11,color:T.muted}}>{s.duration}min · {s.owner}</div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    {(s.preChecks||s.subChecks||[]).length>0&&<span style={{fontSize:10,background:"#eff6ff",color:T.primary,border:`1px solid ${T.primaryBorder}`,borderRadius:3,padding:"1px 5px"}}>{(s.preChecks||s.subChecks||[]).length} pre</span>}
                    {(s.postChecks||[]).length>0&&<span style={{fontSize:10,background:"#f0fdf4",color:"#15803d",border:"1px solid #86efac",borderRadius:3,padding:"1px 5px"}}>{(s.postChecks||[]).length} post</span>}
                  </div>
                </div>
              ))}
              {(!template.steps||template.steps.length===0)&&<div style={{padding:"20px",textAlign:"center",color:T.light,fontSize:12}}>No steps in template.</div>}
            </div>
          </div>

          <div style={{display:"flex",gap:10,paddingTop:4,borderTop:`1px solid ${T.border}`}}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <div style={{flex:1}}/>
            <Btn variant="success" disabled={!valid} onClick={createChange}>✓ Create Change from Template</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MCM-STYLE CREATE CHANGE WIZARD ───────────────────────────────────────────
const WIZARD_STEPS = ["Risk & Scope","Outage Details","Technical Plan","Execution Steps","Approvers","Rollback & Safety","Review & Submit"];

const DEFAULT_PF_STEPS = [
  {id:"syntax",      label:"Syntax Validation"},
  {id:"conflict",    label:"Conflict Detection"},
  {id:"reachability",label:"Device Reachability"},
  {id:"policy",      label:"Policy Compliance"},
  {id:"rollback",    label:"Rollback Plan Verified"},
];
const STEP_DEFAULTS = {name:"",duration:15,owner:"Engineer",instructions:"",commands:"",preChecks:"",postChecks:"",rollback:""};
const APPROVER_ROLES = ["Engineer","Manager","Director","NOC/SAC","Bar Raiser"];

// USERS is needed for quick-add approvers in the wizard
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

export default function CreateChangeMCM({nc, setNc, ncSf, ncStep, setNcStep, NC_DEFAULTS, currentUser, peaks=[], onClose, onCreate}) {
  const peakConflict = isInPeakPeriod(nc.scheduledFor, peaks);
  const catRules = getCategoryRules(nc.category, nc.risk);
  const catM = CAT_META[nc.category] || CAT_META.Normal;

  // Step editor local state
  const [editingStepIdx, setEditingStepIdx] = useState(null); // null = not editing
  const [stepDraft, setStepDraft] = useState({...STEP_DEFAULTS});
  const sdSf = k => v => setStepDraft(s=>({...s,[k]:v}));

  function openNewStep() { setStepDraft({...STEP_DEFAULTS}); setEditingStepIdx(-1); } // -1 = new
  function openEditStep(i) { setStepDraft({...nc.steps[i]}); setEditingStepIdx(i); }
  function saveStep() {
    const s = {...stepDraft,
      id: editingStepIdx===-1 ? Date.now() : stepDraft.id,
      preChecks: typeof stepDraft.preChecks==="string" ? stepDraft.preChecks.split("\n").map(l=>l.trim()).filter(Boolean) : stepDraft.preChecks,
      postChecks: typeof stepDraft.postChecks==="string" ? stepDraft.postChecks.split("\n").map(l=>l.trim()).filter(Boolean) : stepDraft.postChecks,
      commands: typeof stepDraft.commands==="string" ? stepDraft.commands.split("\n").map(l=>l.trim()).filter(Boolean) : stepDraft.commands,
      subChecks: typeof stepDraft.preChecks==="string" ? stepDraft.preChecks.split("\n").map(l=>l.trim()).filter(Boolean) : (stepDraft.preChecks||[]),
    };
    if (editingStepIdx===-1) { ncSf("steps")([...nc.steps, s]); }
    else { const arr=[...nc.steps]; arr[editingStepIdx]=s; ncSf("steps")(arr); }
    setEditingStepIdx(null);
  }
  function removeStep(i) { ncSf("steps")(nc.steps.filter((_,j)=>j!==i)); }
  function moveStep(i, dir) {
    const arr=[...nc.steps]; const j=i+dir;
    if(j<0||j>=arr.length) return;
    [arr[i],arr[j]]=[arr[j],arr[i]]; ncSf("steps")(arr);
  }

  // Preflight step editor local state
  const [pfNewLabel, setPfNewLabel] = useState("");
  function addPfStep() {
    const label = pfNewLabel.trim();
    if (!label) return;
    const id = "custom_" + Date.now();
    ncSf("preflightSteps")([...(nc.preflightSteps||[]), {id, label}]);
    setPfNewLabel("");
  }
  function removePfStep(id) {
    ncSf("preflightSteps")((nc.preflightSteps||[]).filter(s=>s.id!==id));
  }

  // Approver editor local state
  const [aprDraft, setAprDraft] = useState({name:"",role:"Manager",required:true});
  function addApprover() {
    if(!aprDraft.name.trim()) return;
    ncSf("approvers")([...nc.approvers, {...aprDraft}]);
    setAprDraft({name:"",role:"Manager",required:true});
  }
  function removeApprover(i) { ncSf("approvers")(nc.approvers.filter((_,j)=>j!==i)); }

  // auto-set approval level based on category+risk
  function autoApprovalLevel(risk) {
    if (["High","Critical"].includes(risk)) return "L3";
    if (risk === "Medium") return "L2";
    return "L1";
  }
  function autoCAB(risk) {
    return ["High","Critical"].includes(risk);
  }

  function handleRiskChange(v) {
    setNc(f => ({ ...f, risk: v,
      approvalLevel: autoApprovalLevel(v),
      cabRequired: autoCAB(v),
      barRaiserRequired: v === "Critical",
    }));
  }

  const canNext = () => {
    if (ncStep === 0) return nc.name.trim().length >= 3 && nc.risk;
    if (ncStep === 1) return nc.purpose.trim().length >= 10 && nc.expectedEndState.trim().length >= 5;
    if (ncStep === 2) return (nc.affectedServices || nc.affectedDevices);
    if (ncStep === 3) return nc.steps.length > 0; // at least one step required
    if (ncStep === 4) return true; // approvers optional
    if (ncStep === 5) return nc.rollbackPlan.trim().length >= 10;
    if (ncStep === 6) {
      if (nc.freezePeriod && nc.freezeJustification.trim().length < 10) return false;
      return nc.name.trim() && nc.rollbackPlan.trim();
    }
    return true;
  };

  function doCreate() {
    // Normalise steps: ensure commands/subChecks are arrays
    const normSteps = (nc.steps||[]).map((s,i) => ({
      ...s,
      id: s.id || i+1,
      commands: Array.isArray(s.commands) ? s.commands : (s.commands||"").split("\n").map(l=>l.trim()).filter(Boolean),
      subChecks: Array.isArray(s.preChecks) ? s.preChecks : (s.preChecks||"").split("\n").map(l=>l.trim()).filter(Boolean),
      postChecks: Array.isArray(s.postChecks) ? s.postChecks : (s.postChecks||"").split("\n").map(l=>l.trim()).filter(Boolean),
    }));
    const managerApprover = nc.approvers.find(a=>["Manager","Director"].includes(a.role));
    const directorApprover = nc.approvers.find(a=>a.role==="Director");
    const newC = {
      ...NC_DEFAULTS, ...nc,
      id: nc.isTemplate ? genTemplateId() : genChangeId(), status: "Draft",
      createdBy: currentUser.name, createdAt: now(),
      affectedServices: (nc.affectedServices||"").split(",").map(s=>s.trim()).filter(Boolean),
      team: currentUser.team || "Network Ops", dept: currentUser.dept || "Engineering",
      director: directorApprover?.name || "Elena Martín",
      manager: managerApprover?.name || "Sam Reyes",
      execResult: null,
      steps: normSteps,
      preflightResults: {},
      stepLogs: {},
      approvals: [],
      comments: [],
      cab: nc.cabRequired ? { status:"pending", approvers:[], quorum: nc.risk==="Critical"?4:3, barRaiserRequired: nc.barRaiserRequired||false, barRaiserApproved: false } : null,
      auditLog: [
        { at: now(), msg: `Change created — ${normSteps.length} step${normSteps.length!==1?"s":""}`, type:"info", by: currentUser.name },
        ...(nc.approvers.length ? [{ at:now(), msg:`Approvers assigned: ${nc.approvers.map(a=>a.name).join(", ")}`, type:"info", by: currentUser.name }] : []),
        ...(nc.freezePeriod ? [{ at:now(), msg:`${nc.freezeSeverity==="orange"?"⚠ Orange":"❄ Red"} freeze — ${nc.freezeSeverity==="orange"?"Head of":"Director"} approval required`, type:"warning", by: currentUser.name }] : []),
      ],
      notifications: [],
    };
    onCreate(newC);
  }

  const W = { background:T.surface, borderRadius:14, overflow:"hidden", border:`1px solid ${T.border}`, width:"100%", maxWidth:820, boxShadow:"0 20px 60px rgba(0,0,0,0.12)" };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:1000, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"28px 16px", overflowY:"auto" }}>
      <div style={W}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"16px 24px", borderBottom:`1px solid ${T.border}`, background:T.bg }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:800, color:T.text }}>New BNOC Request</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>Bodaphone Centro de Operaciones · {currentUser.name}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.muted, cursor:"pointer", fontSize:22, lineHeight:1 }}>×</button>
        </div>

        {/* Wizard progress */}
        <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, overflowX:"auto" }}>
          {WIZARD_STEPS.map((s,i) => (
            <button key={i} onClick={()=>i<ncStep&&setNcStep(i)}
              style={{ flex:1, minWidth:120, padding:"11px 8px", border:"none", background:"transparent", cursor: i<ncStep?"pointer":"default",
                fontSize:11, fontWeight: i===ncStep?700:500, fontFamily:"inherit",
                color: i===ncStep?T.primary : i<ncStep?"#15803d":T.light,
                borderBottom: i===ncStep?`2px solid ${T.primary}`:i<ncStep?"2px solid #86efac":"2px solid transparent" }}>
              {i < ncStep ? "✓ " : `${i+1}. `}{s}
            </button>
          ))}
        </div>

        <div style={{ padding:"24px 28px" }}>

          {/* STEP 0: Risk & Scope */}
          {ncStep === 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <Inp label="Change Title *" value={nc.name} onChange={ncSf("name")}
                placeholder="e.g. Software Upgrade IOS-XR 7.11.2 — Core Router MNL01"/>

              <Inp label="Assigned Technician" value={nc.assignedTo||""} onChange={ncSf("assignedTo")}
                placeholder={currentUser.name}/>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Risk Level *</div>
                  <div style={{ display:"flex", gap:6 }}>
                    {RISK_LEVELS.map(r => (
                      <div key={r} onClick={()=>handleRiskChange(r)}
                        style={{ flex:1, padding:"8px 4px", textAlign:"center", borderRadius:6, cursor:"pointer",
                          border:`2px solid ${nc.risk===r?(RISK_C[r]||T.border):T.border}`,
                          background: nc.risk===r?(RISK_C[r]+"14"):"transparent",
                          fontSize:11, fontWeight:nc.risk===r?700:500, color:nc.risk===r?(RISK_C[r]||T.text):T.muted }}>
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
                <Sel label="Domain" value={nc.domain} onChange={ncSf("domain")} options={SYSTEMS}/>
                <Sel label="Exec Mode" value={nc.execMode} onChange={ncSf("execMode")} options={EXEC_MODES}/>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Sel label="Intrusion Type" value={nc.intrusion} onChange={ncSf("intrusion")} options={INTRUSION}/>
                <Sel label="Country *" value={nc.country||""} onChange={ncSf("country")}
                  options={[{value:"",label:"— Select Country —"},...COUNTRIES.map(c=>({value:c.code,label:`${c.code} — ${c.name}`}))]}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Inp label="Scheduled Start *" value={nc.scheduledFor} onChange={v=>{const pk=isInPeakPeriod(v,peaks);setNc(f=>({...f,scheduledFor:v,freezePeriod:!!pk,freezeSeverity:pk?.severity||null}));}} type="datetime-local"/>
                <Inp label="Scheduled End *" value={nc.scheduledEnd||""} onChange={ncSf("scheduledEnd")} type="datetime-local"/>
              </div>

              {/* Peak period warning */}
              {peakConflict && (()=>{
                const isOrange=peakConflict.severity==="orange";
                const fc=isOrange?"#c2410c":"#dc2626", fb=isOrange?"#fff7ed":"#fef2f2", fb2=isOrange?"#fed7aa":"#fca5a5";
                const approver=isOrange?"Head of / Manager":"Director";
                return <div style={{ background:fb, border:`1px solid ${fb2}`, borderRadius:8, padding:"12px 16px" }}>
                  <div style={{ fontWeight:700, color:fc, fontSize:13, marginBottom:4 }}>{isOrange?"🟠 Orange":"🔴 Red"} Freeze: {peakConflict.name}</div>
                  <div style={{ fontSize:12, color:fc }}><b>{approver} approval + business justification are mandatory.</b></div>
                </div>;
              })()}

              {/* Auto-approver guidance */}
              {(() => {
                const autoR = [];
                if (["High","Critical"].includes(nc.risk)) autoR.push({label:"Director approval required", reason:`Risk level: ${nc.risk}`, col:"#b91c1c"});
                if (["Medium","High","Critical"].includes(nc.risk)) autoR.push({label:"Manager approval required", reason:`Risk level: ${nc.risk}`, col:T.primary});
                if (peakConflict || nc.freezePeriod) autoR.push({label:`${(peakConflict||{severity:nc.freezeSeverity}).severity==="orange"?"Head of / Manager":"Director"} approval required`, reason:`${(peakConflict||{severity:nc.freezeSeverity}).severity==="orange"?"🟠 Orange":"🔴 Red"} freeze active`, col:T.freeze});
                if (nc.risk === "Critical") autoR.push({label:"Bar Raiser required", reason:"Critical risk", col:"#7c2d12"});
                const uniq = autoR.filter((a,i) => autoR.findIndex(x=>x.label===a.label)===i);
                return uniq.length > 0 ? (
                  <div style={{ background:"#f5f3ff", border:"1px solid #c4b5fd", borderRadius:8, padding:"12px 16px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#5b21b6", textTransform:"uppercase", marginBottom:8 }}>Auto-required approvers</div>
                    {uniq.map((a,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, fontSize:12 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:a.col, flexShrink:0, display:"inline-block" }}/>
                        <span style={{ fontWeight:600, color:a.col }}>{a.label}</span>
                        <span style={{ color:T.muted }}>— {a.reason}</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* STEP 1: Outage / Activity Details (MCM style) */}
          {ncStep === 1 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:8, padding:"11px 14px", fontSize:12, color:"#92400e" }}>
                📋 Describe the change in detail — this will appear in the change ticket and audit trail.
              </div>

              <Inp label="What is the purpose of this activity or change? *" value={nc.purpose} onChange={ncSf("purpose")} type="textarea" rows={4}
                placeholder="e.g. Upgrade IOS-XR from 7.9.1 to 7.11.2 on core PE router MNL01 to resolve memory leak issue and apply security patches."/>

              <Inp label="What will be required to execute this change?" value={nc.requirementsPermissions} onChange={ncSf("requirementsPermissions")} type="textarea" rows={3}
                placeholder={"e.g.\n• TACACS access to target device\n• Maintenance window approved\n• NOC/SAC notified\n• Rollback image pre-staged on flash"}/>

              <Inp label="What is the expected end state of the system after this change? *" value={nc.expectedEndState} onChange={ncSf("expectedEndState")} type="textarea" rows={3}
                placeholder="e.g. Router running IOS-XR 7.11.2, all BGP sessions re-established, ISIS adjacencies UP, no active alarms, NOC confirmed stable."/>

              <Inp label="What assumptions, if any, are being made about the state of the system?" value={nc.assumptions} onChange={ncSf("assumptions")} type="textarea" rows={2}
                placeholder={"e.g.\n• Device is reachable and SSH access is available\n• Current config has been backed up\n• No active incidents affecting this device"}/>

              <div style={{ background:"#eff6ff", border:"1px solid #93c5fd", borderRadius:8, padding:"11px 14px", fontSize:12, color:"#1e40af" }}>
                📌 Impact / Risk Assessment
              </div>

              <Inp label="What is the impact if this change is not made?" value={nc.customerImpact} onChange={ncSf("customerImpact")} type="textarea" rows={2}
                placeholder="e.g. Devices are at risk of possible impact by Memory Leak issue or failure preventing them from operating."/>

              <Inp label="Service Impact (during execution)" value={nc.serviceImpact} onChange={ncSf("serviceImpact")} type="textarea" rows={2}
                placeholder="e.g. Potential 10-min BGP re-convergence. MPLS traffic may reroute via backup LSP."/>

              <Inp label="Blast Radius — what breaks if this goes wrong? Who is affected and how badly?" value={nc.blastRadius} onChange={ncSf("blastRadius")} type="textarea" rows={2}
                placeholder="e.g. 10-min BGP reconvergence on MNL→SGP path affecting ~12 MPLS-VPN customers. Severity P2. Backup LSP available."/>

              <Inp label="Dependencies (teams, systems, vendors to coordinate with)" value={nc.dependencies} onChange={ncSf("dependencies")} type="textarea" rows={2}
                placeholder={"e.g.\n• NOC/SAC on standby during execution\n• Transport team notified\n• Vendor TAC case pre-opened if needed"}/>

            </div>
          )}

          {/* STEP 2: Technical Plan */}
          {ncStep === 2 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <Inp label="Affected Services (comma separated) *" value={nc.affectedServices||""} onChange={ncSf("affectedServices")}
                placeholder="e.g. MPLS-VPN, BGP-Peering, ISIS"/>

              <Inp label="Affected Devices / Hostnames" value={nc.affectedDevices||""} onChange={ncSf("affectedDevices")} type="textarea" rows={3}
                placeholder="e.g.&#10;rmu1-fc-acc-sw-13-8&#10;rmu1-fc-acc-sw-7-4&#10;rmu1-fc-acc-sw-7-6"/>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Inp label="Affected Regions" value={nc.affectedRegions||""} onChange={ncSf("affectedRegions")}
                  placeholder="e.g. EMEA, AP-Southeast, LatAm"/>
                <Inp label="Affected Interfaces / Links" value={nc.affectedInterfaces||""} onChange={ncSf("affectedInterfaces")}
                  placeholder="e.g. Gi0/0/0/1, GE-1/0, LAG-12"/>
              </div>

              <Inp label="Validation Plan — how will you confirm the change worked end-to-end?" value={nc.validationPlan||""} onChange={ncSf("validationPlan")} type="textarea" rows={3}
                placeholder={"e.g.\n1. Verify BGP sessions re-established on all peers\n2. Ping all affected prefixes from 3 vantage points\n3. NOC/SAC confirm zero customer tickets\n4. 30-min observation window before closing"}/>

              <div style={{ background:T.primaryBg, border:`1px solid ${T.primaryBorder}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:T.primary }}>
                📋 You'll define execution steps with pre/post checks in the next step.
              </div>

              <Inp label="Related Tickets / Links" value={nc.relatedTickets||""} onChange={ncSf("relatedTickets")}
                placeholder="e.g. INC-20240315-001, JIRA-4521, SIM-ticket-URL"/>

              <Inp label="Incident ID (if related to an active incident)" value={nc.incidentId||""} onChange={ncSf("incidentId")} placeholder="e.g. INC-20240315-001"/>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Sel label="Type" value={nc.type} onChange={ncSf("type")} options={["Ad-hoc","Template","Automated"]}/>
                <Inp label="Estimated Duration (minutes)" value={nc.estimatedDuration||""} onChange={ncSf("estimatedDuration")} type="number" placeholder="e.g. 60"/>
              </div>

              <label style={{ display:"flex", gap:9, alignItems:"center", cursor:"pointer", fontSize:13, color:T.muted, padding:"9px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:7 }}>
                <input type="checkbox" checked={nc.isTemplate} onChange={e=>setNc(f=>({...f,isTemplate:e.target.checked}))}/>
                <span><b>Save as reusable template</b> — this change will be available as a template for future use</span>
              </label>

              {/* Preflight steps */}
              <div style={{ border:`1px solid ${T.border}`, borderRadius:10, overflow:"hidden" }}>
                <div style={{ padding:"10px 14px", background:T.bg, borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:T.text }}>Preflight Checks</div>
                    <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>Checks that must pass before the change can be approved. Defaults are pre-loaded — remove or add custom ones.</div>
                  </div>
                  <span style={{ fontSize:11, background:T.primaryBg, color:T.primary, border:`1px solid ${T.primaryBorder}`, borderRadius:10, padding:"2px 9px", fontWeight:700 }}>{(nc.preflightSteps||[]).length} checks</span>
                </div>
                <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:6 }}>
                  {(nc.preflightSteps||[]).length === 0 && (
                    <div style={{ textAlign:"center", padding:"16px 0", color:T.light, fontSize:13 }}>No preflight checks defined. Add defaults or custom checks below.</div>
                  )}
                  {(nc.preflightSteps||[]).map(s=>(
                    <div key={s.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:7 }}>
                      <span style={{ fontSize:13, color:"#15803d", flexShrink:0 }}>✓</span>
                      <span style={{ flex:1, fontSize:13, color:T.text }}>{s.label}</span>
                      <button onClick={()=>removePfStep(s.id)} style={{ background:"none", border:"none", cursor:"pointer", color:T.light, fontSize:16, lineHeight:1, padding:"0 4px", fontFamily:"inherit" }}>×</button>
                    </div>
                  ))}
                  <div style={{ borderTop:`1px solid ${T.border}`, paddingTop:10, marginTop:4, display:"flex", flexDirection:"column", gap:8 }}>
                    <div style={{ display:"flex", gap:6 }}>
                      <input
                        value={pfNewLabel}
                        onChange={e=>setPfNewLabel(e.target.value)}
                        onKeyDown={e=>e.key==="Enter"&&addPfStep()}
                        placeholder="Add custom check (e.g. Backup config verified)…"
                        style={{ flex:1, background:T.surface, border:`1px solid ${T.border}`, borderRadius:7, color:T.text, padding:"7px 11px", fontSize:13, fontFamily:"inherit", outline:"none" }}
                      />
                      <button onClick={addPfStep} style={{ background:T.primaryBg, border:`1px solid ${T.primaryBorder}`, borderRadius:7, color:T.primary, cursor:"pointer", padding:"7px 14px", fontSize:12, fontWeight:700, fontFamily:"inherit" }}>+ Add</button>
                    </div>
                    <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                      <span style={{ fontSize:11, color:T.muted, alignSelf:"center" }}>Load defaults:</span>
                      {DEFAULT_PF_STEPS.filter(d=>!(nc.preflightSteps||[]).find(s=>s.id===d.id)).map(d=>(
                        <button key={d.id} onClick={()=>ncSf("preflightSteps")([...(nc.preflightSteps||[]),d])}
                          style={{ fontSize:11, background:T.bg, border:`1px solid ${T.border}`, borderRadius:5, cursor:"pointer", padding:"3px 9px", color:T.muted, fontFamily:"inherit" }}>
                          + {d.label}
                        </button>
                      ))}
                      {DEFAULT_PF_STEPS.every(d=>(nc.preflightSteps||[]).find(s=>s.id===d.id)) && (
                        <span style={{ fontSize:11, color:"#15803d" }}>✓ All defaults loaded</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Execution Steps */}
          {ncStep === 3 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:T.primaryBg, border:`1px solid ${T.primaryBorder}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:T.primary }}>
                Define each execution step. Each step should have pre-checks (things to verify before running), commands, and post-checks (things to validate after). At least one step is required.
              </div>

              {/* ── Template Variables (only when creating a Template) ── */}
              {nc.type === "Template" && (
                <div style={{background:"#f5f3ff",border:"1px solid #c4b5fd",borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#5b21b6",marginBottom:4}}>⚙ Template Variables</div>
                  <div style={{fontSize:11,color:"#7c3aed",marginBottom:12}}>
                    Define variables that engineers fill in when using this template. Use <code style={{background:"#ede9fe",padding:"1px 5px",borderRadius:3}}>{"{{key}}"}</code> in any field — e.g. step names, commands, descriptions — as a substitutable placeholder.
                  </div>
                  {(nc.variables||[]).map((v,i)=>(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto auto",gap:8,marginBottom:8,alignItems:"center"}}>
                      <input value={v.key} onChange={e=>{const a=[...(nc.variables||[])];a[i]={...a[i],key:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"_")};ncSf("variables")(a);}}
                        placeholder="key (e.g. hostname)" style={{padding:"6px 9px",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:"monospace",fontSize:12,color:T.text,background:T.surface,outline:"none"}}/>
                      <input value={v.label} onChange={e=>{const a=[...(nc.variables||[])];a[i]={...a[i],label:e.target.value};ncSf("variables")(a);}}
                        placeholder="Label (e.g. Hostname)" style={{padding:"6px 9px",border:`1px solid ${T.border}`,borderRadius:6,fontFamily:"inherit",fontSize:12,color:T.text,background:T.surface,outline:"none"}}/>
                      <label style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:T.muted,whiteSpace:"nowrap",cursor:"pointer"}}>
                        <input type="checkbox" checked={!!v.required} onChange={e=>{const a=[...(nc.variables||[])];a[i]={...a[i],required:e.target.checked};ncSf("variables")(a);}}/>
                        Required
                      </label>
                      <button onClick={()=>ncSf("variables")((nc.variables||[]).filter((_,j)=>j!==i))}
                        style={{background:"none",border:"none",color:"#b91c1c",cursor:"pointer",fontSize:16,lineHeight:1,padding:"2px 4px"}}>×</button>
                    </div>
                  ))}
                  <button onClick={()=>ncSf("variables")([...(nc.variables||[]),{key:"",label:"",type:"text",required:false,defaultValue:""}])}
                    style={{display:"flex",alignItems:"center",gap:6,fontSize:12,color:"#6d28d9",background:"none",border:"1px dashed #c4b5fd",borderRadius:7,padding:"6px 12px",cursor:"pointer",fontFamily:"inherit",marginTop:4}}>
                    + Add Variable
                  </button>
                </div>
              )}

              {/* Step list */}
              {nc.steps.length===0&&<div style={{ textAlign:"center", padding:"28px 0", color:T.light, border:`2px dashed ${T.border}`, borderRadius:10 }}>
                <div style={{ fontSize:20, marginBottom:6 }}>📋</div>
                <div style={{ fontWeight:600 }}>No steps yet</div>
                <div style={{ fontSize:12, marginTop:3 }}>Click "Add Step" to define the execution plan</div>
              </div>}

              {nc.steps.map((s,i)=>(
                <div key={i} style={{ border:`1px solid ${T.border}`, borderRadius:10, background:T.surface, overflow:"hidden" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:T.bg, borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:T.primaryBg, color:T.primary, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, flexShrink:0 }}>{i+1}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:T.text }}>{s.name||"Unnamed step"}</div>
                      <div style={{ fontSize:11, color:T.muted }}>{s.duration}min · {s.owner} · {(Array.isArray(s.preChecks)?s.preChecks:((s.preChecks||"").split("\n").filter(Boolean))).length} pre-checks · {(Array.isArray(s.postChecks)?s.postChecks:((s.postChecks||"").split("\n").filter(Boolean))).length} post-checks</div>
                    </div>
                    <div style={{ display:"flex", gap:4 }}>
                      <button onClick={()=>moveStep(i,-1)} disabled={i===0} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:5, cursor:i===0?"not-allowed":"pointer", padding:"3px 7px", fontSize:12, color:T.muted, opacity:i===0?0.3:1 }}>↑</button>
                      <button onClick={()=>moveStep(i,1)} disabled={i===nc.steps.length-1} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:5, cursor:i===nc.steps.length-1?"not-allowed":"pointer", padding:"3px 7px", fontSize:12, color:T.muted, opacity:i===nc.steps.length-1?0.3:1 }}>↓</button>
                      <button onClick={()=>openEditStep(i)} style={{ background:T.primaryBg, border:`1px solid ${T.primaryBorder}`, borderRadius:5, cursor:"pointer", padding:"3px 9px", fontSize:11, color:T.primary, fontWeight:600, fontFamily:"inherit" }}>Edit</button>
                      <button onClick={()=>removeStep(i)} style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:5, cursor:"pointer", padding:"3px 9px", fontSize:11, color:T.freeze, fontWeight:600, fontFamily:"inherit" }}>✕</button>
                    </div>
                  </div>
                  {editingStepIdx===i&&<StepEditorForm draft={stepDraft} sdSf={sdSf} onSave={saveStep} onCancel={()=>setEditingStepIdx(null)}/>}
                </div>
              ))}

              {editingStepIdx===-1&&(
                <div style={{ border:`1px solid ${T.primaryBorder}`, borderRadius:10, background:T.primaryBg, overflow:"hidden" }}>
                  <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.primaryBorder}`, fontWeight:700, fontSize:13, color:T.primary }}>New Step</div>
                  <StepEditorForm draft={stepDraft} sdSf={sdSf} onSave={saveStep} onCancel={()=>setEditingStepIdx(null)}/>
                </div>
              )}

              {editingStepIdx===null&&<Btn variant="outline" onClick={openNewStep}>+ Add Step</Btn>}
            </div>
          )}

          {/* STEP 4: Approvers */}
          {ncStep === 4 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:"#f5f3ff", border:"1px solid #c4b5fd", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#5b21b6" }}>
                Assign approvers for this change. Required approvers must sign off before execution. Auto-determined approval level: <b>{nc.approvalLevel}</b>
                {nc.cabRequired&&<span style={{ marginLeft:8, fontWeight:700 }}>· CAB required</span>}
              </div>

              {/* Auto-required by conditions */}
              <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"11px 14px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Auto-required by conditions</div>
                {[
                  {role:"Manager", required:["L2","L3"].includes(nc.approvalLevel), label:"Manager sign-off", reason:`Risk: ${nc.risk}`},
                  {role:"Director", required:nc.approvalLevel==="L3"||nc.freezePeriod, label:"Director approval", reason:nc.freezePeriod?"Network freeze":"High/Critical risk"},
                  {role:"Bar Raiser", required:nc.barRaiserRequired, label:"Bar Raiser sign-off", reason:"Critical risk"},
                ].filter(r=>r.required).map(r=>(
                  <div key={r.role} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, fontSize:12, color:T.text }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:"#8b5cf6", display:"inline-block", flexShrink:0 }}/>
                    <span style={{ fontWeight:600 }}>{r.role}</span> <span style={{ color:T.muted }}>— {r.label} ({r.reason})</span>
                  </div>
                ))}
                {!["L2","L3"].includes(nc.approvalLevel)&&!nc.freezePeriod&&!nc.barRaiserRequired&&(
                  <div style={{ fontSize:12, color:T.muted, fontStyle:"italic" }}>No additional approvers required for Low risk changes.</div>
                )}
              </div>

              {/* Custom approvers */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Assigned approvers</div>
                {nc.approvers.length===0&&<div style={{ fontSize:12, color:T.light, marginBottom:10 }}>No approvers assigned yet — system will use policy defaults.</div>}
                {nc.approvers.map((a,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:6 }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:"#f5f3ff", color:"#6d28d9", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, flexShrink:0 }}>{a.name.charAt(0)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:T.text }}>{a.name}</div>
                      <div style={{ fontSize:11, color:T.muted }}>{a.role}{a.required?" · Required":""}</div>
                    </div>
                    <button onClick={()=>removeApprover(i)} style={{ background:"none", border:"none", cursor:"pointer", color:T.light, fontSize:16 }}>×</button>
                  </div>
                ))}
              </div>

              {/* Add approver row */}
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr auto auto", gap:8, alignItems:"end" }}>
                <Inp label="Name" value={aprDraft.name} onChange={v=>setAprDraft(d=>({...d,name:v}))} placeholder="e.g. Jordan Lee"/>
                <Sel label="Role" value={aprDraft.role} onChange={v=>setAprDraft(d=>({...d,role:v}))} options={APPROVER_ROLES}/>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:T.muted, textTransform:"uppercase", letterSpacing:"0.6px" }}>Required</label>
                  <input type="checkbox" checked={aprDraft.required} onChange={e=>setAprDraft(d=>({...d,required:e.target.checked}))} style={{ width:18, height:18, marginTop:2 }}/>
                </div>
                <div style={{ paddingBottom:2 }}>
                  <Btn onClick={addApprover} disabled={!aprDraft.name.trim()}>+ Add</Btn>
                </div>
              </div>

              {/* Suggest from USERS list */}
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:T.muted, marginBottom:6 }}>Quick-add from team</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {USERS.filter(u=>!nc.approvers.find(a=>a.name===u.name)).map(u=>(
                    <button key={u.id} onClick={()=>ncSf("approvers")([...nc.approvers, {name:u.name,role:u.role,required:["Manager","Director"].includes(u.role)}])}
                      style={{ fontSize:11, background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 10px", cursor:"pointer", color:T.muted, fontFamily:"inherit" }}>
                      + {u.name} <span style={{ color:T.light }}>({u.role})</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Rollback & Safety */}
          {ncStep === 5 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <Inp label="Rollback Plan *" value={nc.rollbackPlan} onChange={ncSf("rollbackPlan")} type="textarea" rows={4}
                placeholder="Step-by-step revert procedure:&#10;1. Run: install rollback to label baseline&#10;2. Verify: show version&#10;3. Notify NOC/SAC"/>

              <Inp label="Estimated Rollback Time" value={nc.rollbackTime||""} onChange={ncSf("rollbackTime")}
                placeholder="e.g. 15 minutes"/>

              <Inp label="Rollback Trigger — what conditions should trigger rollback?" value={nc.rollbackTrigger||""} onChange={ncSf("rollbackTrigger")} type="textarea" rows={2}
                placeholder={"e.g. Any BGP session down >2 min · Packet loss >5% on affected path · Customer complaint received · NOC escalation"}/>

              <Inp label="Escalation Path — who to call if unexpected impact occurs" value={nc.escalationPath||""} onChange={ncSf("escalationPath")} type="textarea" rows={3}
                placeholder={"e.g.\n1st: Team Lead — Jane Smith (+34 612 345 678) / Slack @jsmith\n2nd: On-call Manager — #oncall-bridge channel\n3rd: Director — Elena Martín (emergency only)"}/>

              {/* Freeze period */}
              {(nc.freezePeriod || peakConflict) && (
                <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"14px 16px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:T.freeze, marginBottom:8 }}>
                    ❄ {peakConflict ? `Change Freeze: ${peakConflict.name}` : "Change Freeze Active"} — Director Approval Required
                  </div>
                  <Inp label="Business Justification (mandatory) *" value={nc.freezeJustification} onChange={ncSf("freezeJustification")} type="textarea" rows={3}
                    placeholder="Explain why this change cannot be deferred beyond this change freeze period. Min 10 characters."/>
                </div>
              )}

              {!nc.freezePeriod && !peakConflict && (
                <label style={{ display:"flex", gap:9, alignItems:"flex-start", cursor:"pointer", padding:"11px 14px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8 }}>
                  <input type="checkbox" checked={nc.freezePeriod} onChange={e=>setNc(f=>({...f,freezePeriod:e.target.checked}))} style={{marginTop:2}}/>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:T.freeze }}>❄ Freeze Period Override</div>
                    <div style={{ fontSize:12, color:"#b91c1c", marginTop:2 }}>Check if this change requires executing during a freeze window. Requires Director approval + justification.</div>
                  </div>
                </label>
              )}
              {nc.freezePeriod && !peakConflict && (
                <Inp label="Business Justification *" value={nc.freezeJustification} onChange={ncSf("freezeJustification")} type="textarea" rows={3}
                  placeholder="Why can't this be deferred?"/>
              )}
            </div>
          )}

          {/* STEP 6: Review & Submit */}
          {ncStep === 6 && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ background:T.bg, border:`2px solid ${RISK_C[nc.risk]||T.border}`, borderRadius:10, padding:"14px 18px" }}>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:(RISK_C[nc.risk]||T.muted)+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>
                    {nc.risk==="Critical"?"🔴":nc.risk==="High"?"🟠":nc.risk==="Medium"?"🟡":"🟢"}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:16, fontWeight:800, color:RISK_C[nc.risk]||T.text }}>{nc.risk} Risk Change</div>
                    <div style={{ fontSize:12, color:T.muted }}>{nc.name}</div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <RiskPill risk={nc.risk}/>
                    <span style={{ fontSize:11, background:T.bg, border:`1px solid ${T.border}`, borderRadius:4, padding:"2px 8px", fontWeight:600, color:T.muted }}>{nc.approvalLevel}</span>
                  </div>
                </div>
              </div>

              {/* Summary table */}
              {[
                ["Domain", nc.domain], ["Risk", nc.risk], ["Type", nc.type],
                ["Exec Mode", nc.execMode], ["Intrusion", nc.intrusion], ["Approval Level", nc.approvalLevel],
                ["Assigned To", nc.assignedTo||currentUser.name],
                ["Scheduled", nc.scheduledFor ? fmt(nc.scheduledFor) : "TBD"],
                ["CAB Required", nc.cabRequired ? "Yes" : "No"],
                ["Bar Raiser", nc.barRaiserRequired ? "Yes ★" : "No"],
                ["Freeze Period", nc.freezePeriod ? "Yes — Director required" : "No"],
              ].map(([l,v]) => (
                <div key={l} style={{ display:"flex", borderBottom:`1px solid ${T.border}`, paddingBottom:7 }}>
                  <span style={{ fontSize:12, color:T.muted, fontWeight:600, width:160 }}>{l}</span>
                  <span style={{ fontSize:12, color:T.text, fontWeight: v?.includes?.("Yes") ? 700 : 400 }}>{v||"—"}</span>
                </div>
              ))}

              {["Purpose","Expected End State","Service Impact","Rollback Plan"].map(l => {
                const v = {Purpose:nc.purpose,"Expected End State":nc.expectedEndState,"Service Impact":nc.serviceImpact,"Rollback Plan":nc.rollbackPlan}[l];
                return v ? (
                  <div key={l}>
                    <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:12, color:T.text, background:T.bg, padding:"9px 12px", borderRadius:6, border:`1px solid ${T.border}`, lineHeight:1.6 }}>{v}</div>
                  </div>
                ) : null;
              })}

              {/* Steps summary */}
              {nc.steps.length>0&&(
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", marginBottom:6 }}>Execution Steps ({nc.steps.length})</div>
                  {nc.steps.map((s,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, marginBottom:5 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:T.primaryBg, color:T.primary, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700 }}>{i+1}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{s.name}</div>
                        <div style={{ fontSize:11, color:T.muted }}>{s.duration}min · {(Array.isArray(s.preChecks)?s.preChecks:(s.preChecks||"").split("\n").filter(Boolean)).length} pre · {(Array.isArray(s.postChecks)?s.postChecks:(s.postChecks||"").split("\n").filter(Boolean)).length} post</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Approvers summary */}
              {nc.approvers.length>0&&(
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", marginBottom:6 }}>Approvers ({nc.approvers.length})</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {nc.approvers.map((a,i)=>(
                      <span key={i} style={{ fontSize:11, background:"#f5f3ff", color:"#5b21b6", border:"1px solid #c4b5fd", borderRadius:6, padding:"4px 10px", fontWeight:600 }}>
                        {a.name} ({a.role}){a.required?" ★":""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {peakConflict && (
                <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"11px 14px" }}>
                  <div style={{ fontWeight:700, color:T.freeze, fontSize:13 }}>⚠ Change Freeze: {peakConflict.name}</div>
                  <div style={{ fontSize:12, color:"#b91c1c", marginTop:4 }}>Justification: {nc.freezeJustification}</div>
                </div>
              )}

              <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"11px 14px", fontSize:12, color:T.muted }}>
                {nc.freezePeriod
                  ? "❄ This change requires Director approval due to active network freeze."
                  : nc.approvalLevel==="L3"
                  ? "↻ High/Critical risk — requires Director approval. Will proceed through Preflight → Approval."
                  : nc.approvalLevel==="L2"
                  ? "↻ Medium risk — requires Manager approval. Will proceed through Preflight → Approval."
                  : "↻ This change will be created as Draft and proceed through Preflight → Approval."}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display:"flex", gap:10, marginTop:24, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
            {ncStep > 0 && <Btn variant="ghost" onClick={()=>setNcStep(s=>s-1)}>← Back</Btn>}
            <div style={{ flex:1 }}/>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            {ncStep < WIZARD_STEPS.length - 1
              ? <Btn disabled={!canNext()} onClick={()=>setNcStep(s=>s+1)}>Next →</Btn>
              : <Btn variant="success" disabled={!canNext()} onClick={doCreate}>
                  {"✓ Create Change"}
                </Btn>
            }
          </div>
        </div>
      </div>
    </div>
  );
}
