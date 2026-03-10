export function d(offset=0){
  const x=new Date(); x.setDate(x.getDate()+offset);
  return x.toISOString();
}
export function now(){ return new Date().toISOString(); }
export function fmt(iso, short=false){
  if(!iso) return "—";
  const dt=new Date(iso);
  if(short) return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  return dt.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})+" "+
         dt.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}
export function fmtTime(iso){
  if(!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}
