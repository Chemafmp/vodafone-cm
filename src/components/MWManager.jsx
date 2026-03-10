import { T } from "../data/constants.js";
import { fmt } from "../utils/helpers.js";
import { FreezeTag, Btn, Modal } from "./ui/index.jsx";

// ─── MAINTENANCE WINDOW MANAGER ───────────────────────────────────────────────
export default function MWManager({windows,onClose}){
  return <Modal title="🔧 Maintenance Windows" onClose={onClose} width={680}>
    <div style={{marginBottom:16,display:"flex",justifyContent:"flex-end"}}>
      <Btn small>+ New Window</Btn>
    </div>
    {windows.map(mw=><div key={mw.id} style={{border:`1px solid ${mw.freeze?T.freeze+"40":T.border}`,borderRadius:9,padding:14,marginBottom:10,background:mw.freeze?"#fef2f2":T.surface}}>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:16}}>{mw.freeze?"❄":"🔧"}</span>
        <div style={{fontWeight:700,fontSize:14,color:mw.freeze?T.freeze:T.text,flex:1}}>{mw.name}</div>
        {mw.freeze&&<FreezeTag/>}
        <span style={{fontSize:11,background:mw.active?"#f0fdf4":"#f1f5f9",color:mw.active?"#15803d":T.muted,border:`1px solid ${mw.active?"#86efac":T.border}`,borderRadius:4,padding:"2px 7px",fontWeight:600}}>{mw.active?"ACTIVE":"INACTIVE"}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>START</div><div style={{fontSize:12,color:T.text}}>{fmt(mw.start)}</div></div>
        <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>END</div><div style={{fontSize:12,color:T.text}}>{fmt(mw.end)}</div></div>
        <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>RECURRENCE</div><div style={{fontSize:12,color:T.text}}>{mw.recurrence}</div></div>
      </div>
      {mw.teams&&<div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
        {mw.teams.map(t=><span key={t} style={{background:T.primaryBg,color:T.primary,border:`1px solid ${T.primaryBorder}`,borderRadius:4,padding:"2px 7px",fontSize:11,fontWeight:600}}>{t}</span>)}
      </div>}
    </div>)}
  </Modal>;
}
