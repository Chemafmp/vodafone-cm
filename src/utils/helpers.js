// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function d(offset=0){
  const x=new Date(); x.setDate(x.getDate()+offset);
  return x.toISOString();
}
// genId still used for non-change records (freeze periods, etc.)
export function genId(){ return "BNOC-"+Math.floor(10000000+Math.random()*90000000); }

// Sequential change IDs — format BNOC-0000000001-A
// 10-digit counter × 26 letters = 260 billion unique IDs
let _changeSeq = 0;
export function initChangeCounter(n){ _changeSeq = n; }
export function genChangeId(){
  _changeSeq++;
  return `BNOC-${String(_changeSeq).padStart(10,"0")}-A`;
}

// Template blueprint IDs — format BNOC-TEM-00000001-A
// Visually distinct from operational change IDs
let _templateSeq = 0;
export function initTemplateCounter(n){ _templateSeq = n; }
export function genTemplateId(){
  _templateSeq++;
  return `BNOC-TEM-${String(_templateSeq).padStart(8,"0")}-A`;
}
export function now(){ return new Date().toISOString(); }
export function fmt(iso,short=false){
  if(!iso) return "—";
  const d=new Date(iso);
  if(short) return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})+" "+
         d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}
// date + time without year: "13 Mar 14:30"
export function fmtDT(iso){
  if(!iso) return "—";
  const d=new Date(iso);
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"})+" "+
         d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}
export function fmtSec(s){ const m=Math.floor(s/60), sec=s%60; return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`; }

export function exportAuditCSV(changes){
  const rows=[["Timestamp","Event","Type","Change Name","Change ID","By"]];
  changes.flatMap(c=>(c.auditLog||[]).map(e=>[fmt(e.at),e.msg,e.type,c.name,c.id,e.by]))
    .sort((a,b)=>new Date(b[0])-new Date(a[0]))
    .forEach(r=>rows.push(r));
  const csv=rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download=`bnoc-audit-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ─── PEAK CALENDAR (auto-freeze) ─────────────────────────────────────────────
// peaks array passed as parameter so App state drives everything
export function isInPeakPeriod(dateIso, peaks=[]) {
  if (!dateIso) return null;
  const d = new Date(dateIso).toISOString().slice(0,10);
  return peaks.find(p => d >= p.start && d <= p.end) || null;
}
export function getActivePeak(peaks=[]) {
  const today = new Date().toISOString().slice(0,10);
  return peaks.find(p => today >= p.start && today <= p.end) || null;
}

// ─── TEMPLATE VARIABLE SUBSTITUTION ──────────────────────────────────────────
export function applyVars(obj, vars) {
  if (typeof obj === "string") return obj.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
  if (Array.isArray(obj)) return obj.map(i => applyVars(i, vars));
  if (obj && typeof obj === "object") return Object.fromEntries(Object.entries(obj).map(([k,v])=>[k, applyVars(v, vars)]));
  return obj;
}

// ─── CHANGE CATEGORY RULES ────────────────────────────────────────────────────
export const CAT_META = {
  Standard:  { color:"#15803d", bg:"#f0fdf4", border:"#86efac", label:"Standard",  icon:"✓", desc:"Pre-approved routine operation. No CAB required. Max risk: Low." },
  Normal:    { color:"#1d4ed8", bg:"#eff6ff", border:"#93c5fd", label:"Normal",    icon:"↻", desc:"Requires approval and scheduled window. CAB required if risk ≥ High." },
  Emergency: { color:"#b91c1c", bg:"#fef2f2", border:"#fca5a5", label:"Emergency", icon:"⚡", desc:"Executed immediately during active incident. Director + Bar Raiser required." },
};
export function getCategoryRules(cat, risk) {
  const rules = [];
  if (cat === "Standard") {
    rules.push("Pre-approved — no CAB needed");
    rules.push("Risk must be Low");
    rules.push("L1 approval sufficient");
  } else if (cat === "Normal") {
    rules.push("Manager approval required (L2)");
    if (["High","Critical"].includes(risk)) rules.push("⚠ CAB review required (risk ≥ High)");
    if (risk === "Critical") rules.push("⚠ Bar Raiser required (Critical risk)");
    rules.push("Must be scheduled in maintenance window");
  } else if (cat === "Emergency") {
    rules.push("⚡ Director approval required");
    rules.push("⚡ Bar Raiser required");
    rules.push("⚡ Incident ID mandatory");
    rules.push("Skip maintenance window — immediate execution");
  }
  return rules;
}
