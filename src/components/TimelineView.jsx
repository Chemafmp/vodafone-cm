import { T, STATUS_META } from "../data/constants.js";

export default function TimelineView({changes,onSelect}){
  const days=[];
  for(let i=-7;i<=14;i++){
    const d=new Date(); d.setDate(d.getDate()+i);
    days.push({date:d,label:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),isToday:i===0,isPast:i<0});
  }
  const sameDay=(iso,d)=>{
    if(!iso) return false;
    const x=new Date(iso);
    return x.getDate()===d.getDate()&&x.getMonth()===d.getMonth()&&x.getFullYear()===d.getFullYear();
  };

  return <div style={{overflowX:"auto"}}>
    <div style={{display:"grid",gridTemplateColumns:`120px repeat(${days.length},1fr)`,minWidth:1100,gap:0}}>
      {/* header */}
      <div style={{background:T.bg,borderBottom:`1px solid ${T.border}`,padding:"8px 10px",fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase"}}></div>
      {days.map(d=><div key={d.label} style={{background:d.isToday?"#eff6ff":d.isPast?T.bg:T.surface,borderBottom:`1px solid ${T.border}`,borderLeft:`1px solid ${T.border}`,padding:"8px 6px",fontSize:11,fontWeight:d.isToday?700:500,color:d.isToday?T.primary:T.muted,textAlign:"center"}}>{d.label}{d.isToday&&<div style={{fontSize:9,color:T.primary,fontWeight:700}}>TODAY</div>}</div>)}

      {/* change rows */}
      {changes.map(c=><>
        <div key={c.id+"l"} style={{background:T.bg,borderBottom:`1px solid ${T.border}80`,padding:"6px 10px",fontSize:11,color:T.muted,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{c.team}</div>
        {days.map(day=>{
          const here=sameDay(c.scheduledFor,day.date);
          return <div key={c.id+day.label} style={{borderBottom:`1px solid ${T.border}80`,borderLeft:`1px solid ${T.border}80`,padding:2,background:day.isToday?"#fafcff":"transparent",minHeight:28,cursor:here?"pointer":undefined}} onClick={here?()=>onSelect(c):undefined}>
            {here&&<div style={{background:(STATUS_META[c.status]||{dot:"#94a3b8"}).dot,color:"#fff",borderRadius:4,padding:"2px 5px",fontSize:10,fontWeight:600,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",cursor:"pointer"}} title={c.name}>
              {c.freezePeriod?"❄ ":""}{c.name.split("—")[0]}
            </div>}
          </div>;
        })}
      </>)}
    </div>
  </div>;
}
