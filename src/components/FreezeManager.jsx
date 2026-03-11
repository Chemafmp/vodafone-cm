import { useState } from "react";
import { T } from "../data/constants.js";
import { genId } from "../utils/helpers.js";
import { Btn, Inp, Card } from "./ui/index.jsx";

// ─── SEVERITY METADATA ────────────────────────────────────────────────────────
const SEV = {
  orange: { icon:"🟠", label:"Orange", approver:"Head of / Manager", color:"#c2410c", bg:"#fff7ed", border:"#fed7aa" },
  red:    { icon:"🔴", label:"Red",    approver:"Director",          color:"#dc2626", bg:"#fef2f2", border:"#fca5a5" },
};

const DRAFT_DEF = { name:"", start:"", end:"", severity:"red", reason:"" };

// ─── FREEZE MANAGER ───────────────────────────────────────────────────────────
export default function FreezeManager({ peaks, setPeaks }) {
  const [showModal,    setShowModal]    = useState(false);
  const [editing,      setEditing]      = useState(null);
  const [draft,        setDraft]        = useState(DRAFT_DEF);
  const [confirmDel,   setConfirmDel]   = useState(null);

  const sf  = k => v => setDraft(d => ({...d, [k]: v}));
  const today = new Date().toISOString().slice(0,10);

  const openNew  = ()  => { setDraft(DRAFT_DEF); setEditing(null); setShowModal(true); };
  const openEdit = (p) => { setDraft({name:p.name, start:p.start, end:p.end, severity:p.severity, reason:p.reason||""}); setEditing(p); setShowModal(true); };
  const close    = ()  => { setShowModal(false); setEditing(null); setDraft(DRAFT_DEF); };

  const valid = draft.name.trim() && draft.start && draft.end && draft.end >= draft.start;

  const save = () => {
    if (!valid) return;
    if (editing) {
      setPeaks(ps => ps.map(p => p.id===editing.id ? {...p, ...draft} : p));
    } else {
      setPeaks(ps => [...ps, {id: genId(), ...draft}].sort((a,b) => a.start.localeCompare(b.start)));
    }
    close();
  };

  const doDelete = () => {
    setPeaks(ps => ps.filter(p => p.id !== confirmDel));
    setConfirmDel(null);
  };

  const sorted = [...peaks].sort((a,b) => a.start.localeCompare(b.start));
  const deletingPeriod = peaks.find(p => p.id === confirmDel);

  return (
    <div>
      {/* Header */}
      <Card style={{marginBottom:16,padding:"16px 20px",display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
        <div style={{flex:1}}>
          <div style={{fontSize:15,fontWeight:800,color:T.text,marginBottom:4}}>❄ Change Freeze Periods</div>
          <div style={{fontSize:12,color:T.muted,display:"flex",gap:16,flexWrap:"wrap"}}>
            <span>🟠 <b>Orange</b> — Head of / Manager approval required</span>
            <span>🔴 <b>Red</b> — Director approval required</span>
          </div>
        </div>
        <Btn onClick={openNew}>+ New Freeze Period</Btn>
      </Card>

      {/* Period list */}
      {sorted.length === 0 && (
        <Card style={{textAlign:"center",padding:"32px 0",color:T.light}}>
          <div style={{fontSize:28,marginBottom:8}}>❄</div>
          <div style={{fontWeight:600,fontSize:14}}>No freeze periods defined</div>
          <div style={{fontSize:12,marginTop:4}}>Add freeze periods to protect sensitive windows from risky changes.</div>
        </Card>
      )}

      {sorted.map(p => {
        const active = today >= p.start && today <= p.end;
        const past   = today >  p.end;
        const sev    = SEV[p.severity] || SEV.red;
        return (
          <Card key={p.id} style={{marginBottom:10, borderLeft:`4px solid ${past?"#94a3b8":sev.color}`}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:12}}>
              <span style={{fontSize:22,marginTop:1,flexShrink:0}}>{past?"⚫":sev.icon}</span>
              <div style={{flex:1,minWidth:0}}>
                {/* Name + status badges */}
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                  <span style={{fontWeight:700,fontSize:14,color:past?T.muted:sev.color}}>{p.name}</span>
                  <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,fontWeight:700,
                    background:active?sev.bg:past?"#f1f5f9":"#fffbeb",
                    color:active?sev.color:past?T.light:"#92400e",
                    border:`1px solid ${active?sev.border:past?T.border:"#fcd34d"}`}}>
                    {active?"ACTIVE":past?"PASSED":"UPCOMING"}
                  </span>
                  {!past && (
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,fontWeight:700,background:sev.bg,color:sev.color,border:`1px solid ${sev.border}`}}>
                      {sev.icon} {sev.label} — {sev.approver} approval
                    </span>
                  )}
                </div>
                {/* Dates */}
                <div style={{fontSize:12,color:T.muted,marginBottom:p.reason?4:0}}>
                  📅 {p.start} → {p.end}
                </div>
                {/* Reason */}
                {p.reason && <div style={{fontSize:12,color:T.light,fontStyle:"italic"}}>{p.reason}</div>}
                {/* Active warning */}
                {active && (
                  <div style={{marginTop:10,background:sev.bg,border:`1px solid ${sev.border}`,borderRadius:7,padding:"9px 13px",fontSize:12,color:sev.color}}>
                    ⚠ Active now — <b>{sev.approver} approval required</b> for all changes. Business justification mandatory.
                  </div>
                )}
              </div>
              {/* Actions — no delete on active periods */}
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                {!past && (
                  <button onClick={()=>openEdit(p)} style={actionBtn(T.primaryBg,T.primary,T.primaryBorder)}>Edit</button>
                )}
                {!active && (
                  <button onClick={()=>setConfirmDel(p.id)} style={actionBtn("#fef2f2","#b91c1c","#fca5a5")}>Delete</button>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {/* Info card */}
      <Card style={{marginTop:16,background:"#fffbeb",border:"1px solid #fcd34d"}}>
        <div style={{fontWeight:700,color:"#92400e",fontSize:13,marginBottom:8}}>ℹ How freeze levels work</div>
        <div style={{fontSize:12,color:T.text,lineHeight:2}}>
          🟠 <b>Orange freeze</b>: Head of / Manager approval required for all changes<br/>
          🔴 <b>Red freeze</b>: Director approval required for all changes<br/>
          ⚡ <b>Emergency changes</b>: Always require Director + Bar Raiser regardless of freeze level<br/>
          📝 <b>Justification</b>: All changes during any freeze must include business justification (min. 10 chars)
        </div>
      </Card>

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.surface,borderRadius:14,width:500,boxShadow:"0 8px 40px rgba(0,0,0,0.25)",padding:"28px 28px 24px",maxHeight:"90vh",overflowY:"auto"}}>
            {/* Modal header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <div style={{fontSize:15,fontWeight:800,color:T.text}}>{editing?"Edit Freeze Period":"New Freeze Period"}</div>
              <button onClick={close} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:T.muted,lineHeight:1,padding:4}}>×</button>
            </div>

            {/* Form */}
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <Inp label="Name *" value={draft.name} onChange={sf("name")} placeholder="e.g. Black Friday 2026"/>

              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <Inp label="Start Date *" value={draft.start} onChange={sf("start")} type="date"/>
                <Inp label="End Date *"   value={draft.end}   onChange={sf("end")}   type="date"/>
              </div>
              {draft.end && draft.start && draft.end < draft.start && (
                <div style={{fontSize:12,color:"#b91c1c",fontWeight:600,marginTop:-8}}>⚠ End date must be after start date</div>
              )}

              {/* Severity picker */}
              <div>
                <div style={{fontSize:12,fontWeight:600,color:T.text,marginBottom:8}}>Severity *</div>
                <div style={{display:"flex",gap:10}}>
                  {["orange","red"].map(s => {
                    const m = SEV[s];
                    const sel = draft.severity === s;
                    return (
                      <button key={s} onClick={()=>sf("severity")(s)} style={{
                        flex:1, padding:"12px 14px", borderRadius:10, cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                        border:`2px solid ${sel?m.color:T.border}`,
                        background:sel?m.bg:T.surface, outline:"none", transition:"border-color 0.15s"
                      }}>
                        <div style={{fontSize:16,marginBottom:3}}>{m.icon} <b style={{fontSize:13,color:sel?m.color:T.text}}>{m.label}</b></div>
                        <div style={{fontSize:11,color:sel?m.color:T.muted}}>{m.approver} approval required</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Inp label="Reason / Description" value={draft.reason} onChange={sf("reason")} type="textarea" rows={2}
                placeholder="e.g. Year-end freeze — no changes without Director sign-off."/>
            </div>

            {/* Modal footer */}
            <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20,paddingTop:16,borderTop:`1px solid ${T.border}`}}>
              <Btn variant="ghost" onClick={close}>Cancel</Btn>
              <Btn onClick={save} disabled={!valid}>{editing?"Save Changes":"Create Period"}</Btn>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation ─────────────────────────────────────────────── */}
      {confirmDel && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:T.surface,borderRadius:14,width:400,padding:"26px 28px",boxShadow:"0 8px 40px rgba(0,0,0,0.25)"}}>
            <div style={{fontSize:15,fontWeight:800,color:T.text,marginBottom:8}}>Delete Freeze Period?</div>
            <div style={{fontSize:13,color:T.muted,lineHeight:1.6,marginBottom:20}}>
              <b>{deletingPeriod?.name}</b> ({deletingPeriod?.start} → {deletingPeriod?.end}) will be permanently removed.
              <br/>Changes already scheduled during this period are not affected.
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <Btn variant="ghost" onClick={()=>setConfirmDel(null)}>Cancel</Btn>
              <Btn variant="danger" onClick={doDelete}>🗑 Delete</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const actionBtn = (bg, col, border) => ({
  fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:6,
  padding:"5px 10px", fontFamily:"inherit", background:bg, color:col, border:`1px solid ${border}`
});
