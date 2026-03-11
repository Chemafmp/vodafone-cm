import { T, STATUS_META, RISK_C } from "../../data/constants.js";

export function Badge({status,small}){
  const s=STATUS_META[status]||{bg:"#f1f5f9",text:"#475569",dot:"#94a3b8"};
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,background:s.bg,color:s.text,border:`1px solid ${s.dot}40`,borderRadius:20,padding:small?"1px 8px":"2px 10px",fontSize:small?10:11,fontWeight:600,whiteSpace:"nowrap"}}>
    <span style={{width:small?5:6,height:small?5:6,borderRadius:"50%",background:s.dot,display:"inline-block"}}/>
    {status}
  </span>;
}
export function RiskPill({risk}){
  const c=RISK_C[risk]||"#64748b";
  return <span style={{background:c+"12",color:c,border:`1px solid ${c}30`,borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700}}>{risk}</span>;
}
export function FreezeTag({severity="red"}){
  const isOrange=severity==="orange";
  const bg=isOrange?"#fff7ed":"#fef2f2", col=isOrange?"#c2410c":"#dc2626", border=isOrange?"#fed7aa":"#fca5a5";
  return <span style={{background:bg,color:col,border:`1px solid ${border}`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{isOrange?"⚠":"❄"} FREEZE</span>;
}
export function TypeTag({type}){
  const c=type==="Template"?"#6d28d9":type==="Automated"?"#0e7490":"#b45309";
  return <span style={{background:c+"12",color:c,border:`1px solid ${c}30`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{type}</span>;
}
export function IntrusionTag({v}){
  const c=v==="Intrusive"?"#b91c1c":"#15803d";
  return <span style={{background:c+"10",color:c,border:`1px solid ${c}25`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{v}</span>;
}

const BV={
  primary:{background:T.primary,color:"#fff",border:"none"},
  success:{background:"#15803d",color:"#fff",border:"none"},
  danger: {background:"#b91c1c",color:"#fff",border:"none"},
  ghost:  {background:"transparent",color:T.muted,border:`1px solid ${T.border}`},
  outline:{background:"transparent",color:T.primary,border:`1px solid ${T.primary}`},
  teal:   {background:T.accent,color:"#fff",border:"none"},
};
export function Btn({children,onClick,variant="primary",disabled,small,style:s}){
  return <button onClick={onClick} disabled={disabled} style={{...BV[variant],borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontWeight:600,fontFamily:"inherit",padding:small?"5px 12px":"8px 18px",fontSize:small?12:13,opacity:disabled?0.45:1,transition:"opacity 0.15s,box-shadow 0.15s",letterSpacing:"0.01em",...s}}>{children}</button>;
}
export function Inp({label,value,onChange,type="text",placeholder,required,rows=3,style:s}){
  const base={background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 12px",fontSize:13,fontFamily:"inherit",outline:"none",width:"100%",transition:"border-color 0.15s,box-shadow 0.15s"};
  return <div style={{display:"flex",flexDirection:"column",gap:5,...s}}>
    {label&&<label style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.6px"}}>{label}{required&&<span style={{color:T.freeze}}> *</span>}</label>}
    {type==="textarea"?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{...base,resize:"vertical"}}/>:<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={base}/>}
  </div>;
}
export function Sel({label,value,onChange,options,style:s}){
  return <div style={{display:"flex",flexDirection:"column",gap:5,...s}}>
    {label&&<label style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.6px"}}>{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 12px",fontSize:13,fontFamily:"inherit",outline:"none",transition:"border-color 0.15s,box-shadow 0.15s"}}>
      {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
    </select>
  </div>;
}
export function Card({children,style:s,onClick}){
  return <div onClick={onClick} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:18,boxShadow:T.shadow,cursor:onClick?"pointer":undefined,...s}}>{children}</div>;
}
export function Modal({title,children,onClose,width=760}){
  return <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",backdropFilter:"blur(3px)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 20px",overflowY:"auto"}}>
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,width:"100%",maxWidth:width,boxShadow:"0 24px 64px rgba(0,0,0,0.22)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",borderBottom:`1px solid ${T.border}`}}>
        <h3 style={{fontSize:15,fontWeight:700,color:T.text}}>{title}</h3>
        <button onClick={onClose} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:16,lineHeight:1,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
      <div style={{padding:24}}>{children}</div>
    </div>
  </div>;
}
