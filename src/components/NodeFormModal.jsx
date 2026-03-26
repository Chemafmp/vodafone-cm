import { useState, useMemo, useRef } from "react";
import { T } from "../data/constants.js";
import { SITES, COUNTRY_META, LAYERS, LAYER_COLORS } from "../data/inventory/sites.js";
import { useNodes } from "../context/NodesContext.jsx";
import { Btn, Modal } from "./ui/index.jsx";

const EMPTY_IFACE = { name:"", ip:"", description:"", peer:null, operStatus:"UP", speed:"1G", mtu:1500, lastFlap:null, vlan:null };
const EMPTY_BGP = { ip:"", asn:65001, description:"", state:"Established", prefixesRx:0, prefixesTx:0, uptime:"" };

const STATUSES = ["UP","DEGRADED","DOWN"];
const IF_STATUSES = ["UP","DOWN","ADMIN-DOWN"];
const BGP_STATES = ["Established","Active","Idle","Connect","OpenSent","OpenConfirm"];

function genId(country, city, role, num) {
  return `${country.toLowerCase()}-${city}-${role}-${String(num).padStart(2,"0")}`;
}

// ── Mode Picker (shown first when adding) ────────────────────────────────────
export function NodeAddPicker({ onBlank, onTemplate, onImport, onDiscover, onClose, templates }) {
  return <Modal title="Add Network Device" onClose={onClose} width={600}>
    <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:12}}>
      <div style={{fontSize:12,color:T.muted,marginBottom:4}}>Choose how to onboard the device:</div>

      {[
        { icon:"📝", label:"Blank Form", desc:"Fill in all fields manually", onClick:onBlank, color:"#1d4ed8" },
        { icon:"📋", label:`From Template (${templates.length})`, desc:"Pre-fill from a saved device template", onClick:templates.length?onTemplate:null, color:"#7c3aed", disabled:!templates.length },
        { icon:"📁", label:"Import JSON File", desc:"Upload a .json file with one or more nodes", onClick:onImport, color:"#0d9488" },
        { icon:"🔍", label:"Auto-Discover (Simulated)", desc:"Enter hostname + IP, auto-detect vendor/model/role", onClick:onDiscover, color:"#ea580c" },
      ].map(opt => <button key={opt.label} disabled={opt.disabled} onClick={opt.onClick}
        style={{display:"flex",alignItems:"center",gap:14,padding:"14px 18px",border:`1px solid ${T.border}`,borderRadius:10,
          background:T.surface,cursor:opt.disabled?"not-allowed":"pointer",opacity:opt.disabled?0.5:1,textAlign:"left",fontFamily:"inherit",transition:"all 0.15s"}}>
        <span style={{fontSize:24,width:40,textAlign:"center"}}>{opt.icon}</span>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:opt.color}}>{opt.label}</div>
          <div style={{fontSize:11,color:T.muted}}>{opt.desc}</div>
        </div>
      </button>)}
    </div>
  </Modal>;
}

// ── Template Picker ──────────────────────────────────────────────────────────
export function TemplatePicker({ templates, onSelect, onClose }) {
  return <Modal title="Select Device Template" onClose={onClose} width={600}>
    <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:8,maxHeight:400,overflowY:"auto"}}>
      {templates.map(t => <button key={t.templateId} onClick={() => onSelect(t)}
        style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",border:`1px solid ${T.border}`,borderRadius:8,
          background:T.surface,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"all 0.15s"}}>
        <span style={{width:10,height:10,borderRadius:3,background:LAYER_COLORS[t.layer]||"#64748b"}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text}}>{t.templateName}</div>
          <div style={{fontSize:11,color:T.muted}}>{t.vendor} {t.hwModel} · {t.layer} · {t.role}</div>
        </div>
        <span style={{fontSize:10,color:T.light}}>{t.country}</span>
      </button>)}
      {templates.length === 0 && <div style={{textAlign:"center",color:T.muted,padding:20}}>No templates saved yet</div>}
    </div>
  </Modal>;
}

// ── Auto-Discover Dialog ─────────────────────────────────────────────────────
export function DiscoverDialog({ onResult, onClose }) {
  const [hostname, setHostname] = useState("");
  const [mgmtIp, setMgmtIp] = useState("");
  const { autoDiscover } = useNodes();

  return <Modal title="Auto-Discover Device" onClose={onClose} width={480}>
    <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <div style={{fontSize:12,color:T.muted}}>Enter hostname following the naming convention (e.g. <code>hw-hnl1-cr-03</code>) and management IP. The system will infer vendor, model, layer, and role.</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
        <div>
          <label style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4,display:"block"}}>Hostname *</label>
          <input value={hostname} onChange={e=>setHostname(e.target.value)} placeholder="fj-suva-cr-03"
            style={{width:"100%",padding:"8px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:13,fontFamily:"monospace",background:T.surface,color:T.text,outline:"none"}} />
        </div>
        <div>
          <label style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:4,display:"block"}}>Management IP *</label>
          <input value={mgmtIp} onChange={e=>setMgmtIp(e.target.value)} placeholder="172.16.1.50"
            style={{width:"100%",padding:"8px 12px",border:`1px solid ${T.border}`,borderRadius:8,fontSize:13,fontFamily:"monospace",background:T.surface,color:T.text,outline:"none"}} />
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
        <Btn variant="ghost" onClick={onClose} small>Cancel</Btn>
        <Btn onClick={() => { if (hostname.trim()) onResult(autoDiscover(hostname.trim(), mgmtIp.trim())); }} disabled={!hostname.trim()} small>Discover</Btn>
      </div>
    </div>
  </Modal>;
}

// ── JSON Import Dialog ───────────────────────────────────────────────────────
export function ImportDialog({ onResult, onClose }) {
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();
  const { nodes } = useNodes();

  const handleFile = e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        let data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) data = [data];
        // Validate required fields
        const required = ["id","hostname","country","layer","role"];
        const invalid = data.filter(n => required.some(f => !n[f]));
        if (invalid.length) { setError(`Missing required fields (${required.join(", ")}) in ${invalid.length} node(s)`); return; }
        // Check duplicates
        const existingIds = new Set(nodes.map(n => n.id));
        const dupes = data.filter(n => existingIds.has(n.id));
        setPreview({ nodes: data, dupes });
        setError(null);
      } catch (err) { setError("Invalid JSON: " + err.message); }
    };
    reader.readAsText(file);
  };

  return <Modal title="Import JSON" onClose={onClose} width={560}>
    <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:14}}>
      <div style={{fontSize:12,color:T.muted}}>Upload a <code>.json</code> file containing a single node object or an array of nodes.</div>
      <input ref={fileRef} type="file" accept=".json" onChange={handleFile}
        style={{padding:8,border:`1px dashed ${T.border}`,borderRadius:8,fontSize:12}} />
      {error && <div style={{color:"#dc2626",fontSize:12,background:"#fef2f2",padding:"8px 12px",borderRadius:6}}>{error}</div>}
      {preview && <div style={{fontSize:12}}>
        <div style={{fontWeight:700,color:T.text,marginBottom:4}}>{preview.nodes.length} node(s) found</div>
        {preview.dupes.length > 0 && <div style={{color:"#b45309",fontSize:11,marginBottom:4}}>⚠ {preview.dupes.length} duplicate ID(s) will be skipped: {preview.dupes.map(d=>d.id).join(", ")}</div>}
        <div style={{maxHeight:150,overflowY:"auto",border:`1px solid ${T.border}`,borderRadius:6,padding:8}}>
          {preview.nodes.map(n => <div key={n.id} style={{fontSize:11,padding:"2px 0",display:"flex",gap:8}}>
            <span style={{fontFamily:"monospace",fontWeight:600,color:T.primary}}>{n.id}</span>
            <span style={{color:T.muted}}>{n.vendor} {n.hwModel}</span>
            <span style={{color:T.light}}>{n.layer}</span>
          </div>)}
        </div>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:10}}>
          <Btn variant="ghost" onClick={onClose} small>Cancel</Btn>
          <Btn onClick={() => onResult(preview.nodes.filter(n => !preview.dupes.some(d=>d.id===n.id)))} small>
            Import {preview.nodes.length - preview.dupes.length} node(s)
          </Btn>
        </div>
      </div>}
    </div>
  </Modal>;
}

// ── Main Node Form ───────────────────────────────────────────────────────────
export default function NodeFormModal({ mode = "add", initialData = null, onSave, onClose }) {
  const { nodes } = useNodes();
  const [node, setNode] = useState(() => initialData || {
    id:"", siteId:"", country:"FJ", hostname:"", vendor:"", hwModel:"", layer:"IP Core", role:"cr",
    mgmtIp:"", status:"UP", osVersion:"", serialNumber:"", procurementDate:"", eolDate:"", supportExpiry:"",
    rackUnit:"", powerConsumptionW:null, lastCommit:null, lineCards:[], powerSupplies:[],
    interfaces:[{ ...EMPTY_IFACE, name:"Loopback0" }], bgpNeighbors:[], services:[], goldenConfig:"",
  });
  const [section, setSection] = useState("identity");
  const [errors, setErrors] = useState({});

  const set = (k, v) => setNode(n => ({ ...n, [k]: v }));
  const countrySites = SITES.filter(s => s.country === node.country);

  const validate = () => {
    const e = {};
    if (!node.id.trim()) e.id = "Required";
    if (mode === "add" && nodes.some(n => n.id === node.id)) e.id = "ID already exists";
    if (!node.hostname.trim()) e.hostname = "Required";
    if (!node.country) e.country = "Required";
    if (!node.layer) e.layer = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => { if (validate()) onSave(node); };

  const SECTIONS = ["identity","network","hardware","interfaces","bgp"];

  // Interface helpers
  const addIface = () => setNode(n => ({ ...n, interfaces:[...n.interfaces, { ...EMPTY_IFACE }] }));
  const updateIface = (i, k, v) => setNode(n => ({ ...n, interfaces:n.interfaces.map((ifc,j) => j===i ? { ...ifc, [k]:v } : ifc) }));
  const removeIface = i => setNode(n => ({ ...n, interfaces:n.interfaces.filter((_,j)=>j!==i) }));

  // BGP helpers
  const addBgp = () => setNode(n => ({ ...n, bgpNeighbors:[...n.bgpNeighbors, { ...EMPTY_BGP }] }));
  const updateBgp = (i, k, v) => setNode(n => ({ ...n, bgpNeighbors:n.bgpNeighbors.map((b,j) => j===i ? { ...b, [k]:v } : b) }));
  const removeBgp = i => setNode(n => ({ ...n, bgpNeighbors:n.bgpNeighbors.filter((_,j)=>j!==i) }));

  const F = ({label, required, error, children}) => <div style={{display:"flex",flexDirection:"column",gap:4}}>
    <label style={{fontSize:10,fontWeight:700,color:error?"#dc2626":T.muted,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}{required&&<span style={{color:"#dc2626"}}> *</span>}</label>
    {children}
    {error && <span style={{fontSize:10,color:"#dc2626"}}>{error}</span>}
  </div>;

  const inp = (k, placeholder, mono) => <input value={node[k]||""} onChange={e=>set(k,e.target.value)} placeholder={placeholder}
    style={{padding:"7px 10px",border:`1px solid ${errors[k]?"#fca5a5":T.border}`,borderRadius:6,fontSize:12,fontFamily:mono?"monospace":"inherit",background:T.surface,color:T.text,outline:"none",width:"100%"}} />;

  const sel = (k, options) => <select value={node[k]||""} onChange={e=>set(k,e.target.value)}
    style={{padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:6,fontSize:12,fontFamily:"inherit",background:T.surface,color:T.text}}>
    {options.map(o => <option key={typeof o==="string"?o:o.value} value={typeof o==="string"?o:o.value}>{typeof o==="string"?o:o.label}</option>)}
  </select>;

  const peerNodes = useMemo(() => nodes.filter(n => n.id !== node.id).map(n => ({ value:n.id, label:`${n.id} (${n.hostname})` })), [nodes, node.id]);

  return <Modal title={mode === "add" ? "Add Network Device" : `Edit ${node.id}`} onClose={onClose} width={860}>
    {/* Section tabs */}
    <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,padding:"0 24px",background:"#f8fafc"}}>
      {SECTIONS.map(s => <button key={s} onClick={()=>setSection(s)}
        style={{padding:"10px 16px",border:"none",cursor:"pointer",background:"transparent",fontFamily:"inherit",fontSize:12,fontWeight:600,
          color:section===s?T.primary:T.muted,borderBottom:section===s?`2px solid ${T.primary}`:"2px solid transparent",textTransform:"capitalize"}}>
        {s}
      </button>)}
    </div>

    <div style={{padding:"16px 24px",maxHeight:"60vh",overflowY:"auto"}}>
      {/* ── Identity ── */}
      {section==="identity" && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <F label="Node ID" required error={errors.id}>{inp("id","fj-suva-cr-03",true)}</F>
        <F label="Hostname" required error={errors.hostname}>{inp("hostname","fj-suva-cr-03.vodafone.fj",true)}</F>
        <F label="Country" required error={errors.country}>{sel("country",Object.keys(COUNTRY_META).map(c=>({value:c,label:`${COUNTRY_META[c].flag} ${COUNTRY_META[c].name}`})))}</F>
        <F label="Site">{sel("siteId",[{value:"",label:"— Select site —"},...countrySites.map(s=>({value:s.id,label:`${s.name} (${s.type})`}))])}</F>
        <F label="Vendor">{inp("vendor","Cisco")}</F>
        <F label="Hardware Model">{inp("hwModel","ASR 9922")}</F>
        <F label="Layer" required error={errors.layer}>{sel("layer",LAYERS)}</F>
        <F label="Role">{inp("role","cr",true)}</F>
      </div>}

      {/* ── Network ── */}
      {section==="network" && <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <F label="Management IP">{inp("mgmtIp","172.16.1.50",true)}</F>
        <F label="Status">{sel("status",STATUSES)}</F>
        <F label="OS Version">{inp("osVersion","IOS-XR 7.5.2",true)}</F>
        <F label="Serial Number">{inp("serialNumber","FOC2345N1AB",true)}</F>
      </div>}

      {/* ── Hardware ── */}
      {section==="hardware" && <div style={{display:"flex",flexDirection:"column",gap:14}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          <F label="Procurement Date">{inp("procurementDate","2024-01-15")}</F>
          <F label="EoL Date">{inp("eolDate","2029-12-31")}</F>
          <F label="Support Expiry">{inp("supportExpiry","2027-06-30")}</F>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <F label="Rack Unit">{inp("rackUnit","DC1-R05-U22")}</F>
          <F label="Power (W)"><input type="number" value={node.powerConsumptionW||""} onChange={e=>set("powerConsumptionW",e.target.value?Number(e.target.value):null)}
            style={{padding:"7px 10px",border:`1px solid ${T.border}`,borderRadius:6,fontSize:12,background:T.surface,color:T.text,outline:"none",width:"100%"}} /></F>
        </div>
      </div>}

      {/* ── Interfaces ── */}
      {section==="interfaces" && <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:12,fontWeight:700,color:T.text}}>{node.interfaces.length} interface(s)</span>
          <Btn onClick={addIface} small variant="outline">+ Add Interface</Btn>
        </div>
        {node.interfaces.map((ifc,i) => <div key={i} style={{border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",background:"#f8fafc"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:11,fontWeight:700,fontFamily:"monospace",color:T.primary}}>{ifc.name||`Interface ${i+1}`}</span>
            <button onClick={()=>removeIface(i)} style={{background:"none",border:"none",cursor:"pointer",color:"#dc2626",fontSize:14}}>×</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>NAME</label>
              <input value={ifc.name} onChange={e=>updateIface(i,"name",e.target.value)} placeholder="et-0/0/0"
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,fontFamily:"monospace",background:T.surface,color:T.text,outline:"none"}} /></div>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>IP</label>
              <input value={ifc.ip||""} onChange={e=>updateIface(i,"ip",e.target.value)} placeholder="172.16.0.1/30"
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,fontFamily:"monospace",background:T.surface,color:T.text,outline:"none"}} /></div>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>SPEED</label>
              <input value={ifc.speed||""} onChange={e=>updateIface(i,"speed",e.target.value)} placeholder="10G"
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,fontFamily:"monospace",background:T.surface,color:T.text,outline:"none"}} /></div>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>STATUS</label>
              <select value={ifc.operStatus||"UP"} onChange={e=>updateIface(i,"operStatus",e.target.value)}
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,background:T.surface,color:T.text}}>
                {IF_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr",gap:8,marginTop:6}}>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>PEER NODE (topology link)</label>
              <select value={ifc.peer||""} onChange={e=>updateIface(i,"peer",e.target.value||null)}
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${ifc.peer?T.primary+"40":T.border}`,borderRadius:4,fontSize:11,fontFamily:"monospace",background:T.surface,color:T.text}}>
                <option value="">— No peer —</option>
                {peerNodes.map(p=><option key={p.value} value={p.value}>{p.value}</option>)}
              </select></div>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>MTU</label>
              <input type="number" value={ifc.mtu??""} onChange={e=>updateIface(i,"mtu",e.target.value?Number(e.target.value):null)}
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,background:T.surface,color:T.text,outline:"none"}} /></div>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>VLAN</label>
              <input type="number" value={ifc.vlan??""} onChange={e=>updateIface(i,"vlan",e.target.value?Number(e.target.value):null)}
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,background:T.surface,color:T.text,outline:"none"}} /></div>
          </div>
          <div style={{marginTop:6}}>
            <label style={{fontSize:9,color:T.muted,fontWeight:600}}>DESCRIPTION</label>
            <input value={ifc.description||""} onChange={e=>updateIface(i,"description",e.target.value)}
              style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,background:T.surface,color:T.text,outline:"none"}} />
          </div>
        </div>)}
      </div>}

      {/* ── BGP ── */}
      {section==="bgp" && <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:12,fontWeight:700,color:T.text}}>{node.bgpNeighbors.length} BGP neighbor(s)</span>
          <Btn onClick={addBgp} small variant="outline">+ Add Neighbor</Btn>
        </div>
        {node.bgpNeighbors.map((b,i) => <div key={i} style={{border:`1px solid ${T.border}`,borderRadius:8,padding:"10px 12px",background:"#f8fafc"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
            <span style={{fontSize:11,fontWeight:700,fontFamily:"monospace",color:T.primary}}>{b.ip||`Neighbor ${i+1}`}</span>
            <button onClick={()=>removeBgp(i)} style={{background:"none",border:"none",cursor:"pointer",color:"#dc2626",fontSize:14}}>×</button>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>PEER IP</label>
              <input value={b.ip} onChange={e=>updateBgp(i,"ip",e.target.value)}
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,fontFamily:"monospace",background:T.surface,color:T.text,outline:"none"}} /></div>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>ASN</label>
              <input type="number" value={b.asn} onChange={e=>updateBgp(i,"asn",Number(e.target.value))}
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,fontFamily:"monospace",background:T.surface,color:T.text,outline:"none"}} /></div>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>STATE</label>
              <select value={b.state} onChange={e=>updateBgp(i,"state",e.target.value)}
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,background:T.surface,color:T.text}}>
                {BGP_STATES.map(s=><option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label style={{fontSize:9,color:T.muted,fontWeight:600}}>DESCRIPTION</label>
              <input value={b.description} onChange={e=>updateBgp(i,"description",e.target.value)}
                style={{width:"100%",padding:"5px 8px",border:`1px solid ${T.border}`,borderRadius:4,fontSize:11,background:T.surface,color:T.text,outline:"none"}} /></div>
          </div>
        </div>)}
      </div>}
    </div>

    {/* Footer */}
    <div style={{padding:"14px 24px",borderTop:`1px solid ${T.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
      <span style={{fontSize:11,color:T.muted}}>
        {node.interfaces.length} iface(s) · {node.bgpNeighbors.length} BGP · {node.interfaces.filter(i=>i.peer).length} topology link(s)
      </span>
      <div style={{display:"flex",gap:8}}>
        <Btn variant="ghost" onClick={onClose} small>Cancel</Btn>
        <Btn onClick={handleSave} small>{mode === "add" ? "Add Device" : "Save Changes"}</Btn>
      </div>
    </div>
  </Modal>;
}
