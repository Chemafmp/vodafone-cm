import { useState } from "react";
import { T } from "../data/constants.js";
import { now, fmt } from "../utils/helpers.js";
import { Inp, Btn } from "./ui/index.jsx";

// ─── CAB PANEL ────────────────────────────────────────────────────────────────
export default function CABPanel({change, currentUser, onUpdate, addLog}) {
  const cab = change.cab || { status:"pending", approvers:[], quorum:3, barRaiserRequired:change.barRaiserRequired||false, barRaiserApproved:false };
  const [comment, setComment] = useState("");

  const isBarRaiser = currentUser.role === "Director";
  const alreadyApproved = cab.approvers.some(a => a.by === currentUser.name);
  const approvedCount = cab.approvers.filter(a => a.action === "approved").length;
  const quorumMet = approvedCount >= cab.quorum;
  const barRaiserMet = !cab.barRaiserRequired || cab.barRaiserApproved;
  const cabApproved = quorumMet && barRaiserMet;

  function doApprove(action) {
    const entry = { by: currentUser.name, role: currentUser.role, action, comment, at: now() };
    const newApprovers = [...(cab.approvers||[]), entry];
    const newBarRaiser = isBarRaiser && action === "approved" ? true : cab.barRaiserApproved;
    const newCab = { ...cab, approvers: newApprovers, barRaiserApproved: newBarRaiser };
    const newApprovedCount = newApprovers.filter(a => a.action === "approved").length;
    const newStatus = (newApprovedCount >= cab.quorum && (!cab.barRaiserRequired || newBarRaiser)) ? "approved" : "pending";
    onUpdate(c => ({ ...c, cab: { ...newCab, status: newStatus },
      status: newStatus === "approved" ? "Approved" : c.status }));
    addLog(`CAB: ${currentUser.name} (${currentUser.role}) ${action}`, action === "approved" ? "success" : "warning");
    setComment("");
  }

  const ACTION_COL = { approved:"#15803d", rejected:"#b91c1c", abstained:"#b45309" };

  return (
    <div>
      {/* CAB header */}
      <div style={{ background: cabApproved ? "#f0fdf4" : "#fffbeb", border:`1px solid ${cabApproved?"#86efac":"#fcd34d"}`,
        borderRadius:9, padding:"14px 16px", marginBottom:16, display:"flex", gap:16, alignItems:"center" }}>
        <div style={{ fontSize:28, fontWeight:800, color:cabApproved?"#15803d":"#b45309" }}>{approvedCount}/{cab.quorum}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, color:T.text, fontSize:14 }}>CAB Quorum — {cabApproved?"✓ Met":"Pending"}</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>
            {cab.barRaiserRequired && <span style={{ color:barRaiserMet?"#15803d":"#b91c1c", fontWeight:600, marginRight:8 }}>
              {barRaiserMet?"✓":"⚠"} Bar Raiser
            </span>}
            Requires {cab.quorum} approvals · {change.risk} risk
          </div>
        </div>
        {cabApproved && <span style={{ fontSize:13, fontWeight:700, color:"#15803d", background:"#dcfce7", padding:"6px 12px", borderRadius:6 }}>✓ CAB APPROVED</span>}
      </div>

      {/* approver list */}
      {cab.approvers.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", marginBottom:8 }}>Individual Approvers ({cab.approvers.length})</div>
          <div style={{ border:`1px solid ${T.border}`, borderRadius:9, overflow:"hidden" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 100px 80px 1fr 100px", padding:"7px 14px",
              background:T.bg, fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", borderBottom:`1px solid ${T.border}` }}>
              <div>Approver</div><div>Role</div><div>Level</div><div>Status / Comment</div><div>Time</div>
            </div>
            {cab.approvers.map((a,i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 100px 80px 1fr 100px",
                padding:"10px 14px", borderBottom: i<cab.approvers.length-1?`1px solid ${T.border}`:"none",
                background: i%2===0 ? T.surface : T.bg, alignItems:"center" }}>
                <div style={{ fontWeight:600, fontSize:13, color:T.text }}>{a.by}</div>
                <div style={{ fontSize:11, color:T.muted }}>{a.role}</div>
                <div>
                  {a.role==="Director" && <span style={{ fontSize:10, background:"#fef2f2", color:T.freeze, border:"1px solid #fca5a5", borderRadius:3, padding:"1px 5px", fontWeight:700 }}>Bar Raiser</span>}
                </div>
                <div>
                  <span style={{ fontSize:12, color:ACTION_COL[a.action]||T.muted, fontWeight:600, textTransform:"capitalize" }}>{a.action}</span>
                  {a.comment && <div style={{ fontSize:11, color:T.muted, fontStyle:"italic", marginTop:2 }}>"{a.comment}"</div>}
                </div>
                <div style={{ fontSize:11, color:T.light }}>{fmt(a.at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* action */}
      {!alreadyApproved && (
        <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:9, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:10 }}>
            Your vote — {currentUser.name} ({currentUser.role})
            {isBarRaiser && <span style={{ marginLeft:8, fontSize:11, color:T.freeze, fontWeight:700 }}>★ Bar Raiser</span>}
          </div>
          <Inp label="Comment (optional)" value={comment} onChange={setComment} type="textarea" rows={2}
            placeholder="Reason for approval/rejection…" style={{marginBottom:12}}/>
          <div style={{ display:"flex", gap:10 }}>
            <Btn variant="success" onClick={()=>doApprove("approved")}>✓ Approve</Btn>
            <Btn variant="danger"  onClick={()=>doApprove("rejected")}>✗ Reject</Btn>
            <Btn variant="ghost"   onClick={()=>doApprove("abstained")}>— Abstain</Btn>
          </div>
        </div>
      )}
      {alreadyApproved && (
        <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, padding:"11px 14px", color:T.muted, fontSize:13 }}>
          ✓ You have already voted on this CAB review.
        </div>
      )}
    </div>
  );
}
