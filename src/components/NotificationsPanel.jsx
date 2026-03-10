import { T } from "../data/constants.js";
import { fmt } from "../utils/helpers.js";
import { Modal } from "./ui/index.jsx";

// ─── NOTIFICATIONS PANEL ──────────────────────────────────────────────────────
export default function NotificationsPanel({changes,onClose}){
  const notifs=[];
  changes.forEach(c=>{
    if(c.status==="Pending Approval") notifs.push({type:"approval",msg:`${c.id}: "${c.name}" needs approval (${c.approvalLevel})`,at:c.auditLog?.slice(-1)[0]?.at,change:c,color:"#3b82f6"});
    if(c.freezePeriod&&["Draft","Preflight","Pending Approval"].includes(c.status)) notifs.push({type:"freeze",msg:`❄ Freeze period change: "${c.name}" — Director approval required`,at:c.auditLog?.slice(-1)[0]?.at,change:c,color:T.freeze});
    if(c.status==="In Execution") notifs.push({type:"executing",msg:`▶ Currently executing: "${c.name}"`,at:c.actualStart,change:c,color:"#0e7490"});
    if(["Failed","Aborted","Rolled Back"].includes(c.status)) notifs.push({type:"alert",msg:`⚠ ${c.status}: "${c.name}" requires attention`,at:c.auditLog?.slice(-1)[0]?.at,change:c,color:"#b91c1c"});
  });
  notifs.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));

  return <Modal title={`🔔 Notifications (${notifs.length})`} onClose={onClose} width={560}>
    {notifs.length===0&&<div style={{textAlign:"center",padding:40,color:T.light}}>No notifications.</div>}
    {notifs.map((n,i)=><div key={i} style={{display:"flex",gap:12,padding:"11px 0",borderBottom:`1px solid ${T.border}`,alignItems:"flex-start"}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:n.color,flexShrink:0,marginTop:5}}/>
      <div style={{flex:1}}>
        <div style={{fontSize:13,color:T.text,lineHeight:1.4}}>{n.msg}</div>
        <div style={{fontSize:11,color:T.light,marginTop:3}}>{fmt(n.at)}</div>
      </div>
    </div>)}
  </Modal>;
}
