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
        { icon:"📁", label:"Import Devices (JSON / CSV)", desc:"Upload a .json or .csv file with one or more devices", onClick:onImport, color:"#0d9488" },
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

// ── Device Import Dialog (JSON + CSV) ────────────────────────────────────────

const VALID_COUNTRIES = ["FJ","HW","IB"];
const VALID_STATUSES  = ["UP","DEGRADED","DOWN"];
const REQUIRED_IMPORT = ["id","siteId","country","vendor","hwModel","layer","mgmtIp"];
const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

const JSON_TEMPLATE = [
  {
    _comment: "Required fields are marked with (REQUIRED). Remove _comment fields before uploading.",
    id: "(REQUIRED) Unique device ID, e.g. ib-town-cr-03",
    siteId: "(REQUIRED) Site ID from: fj-suva-dc1, fj-lautoka-dc1, hw-hnl1-dc1, hw-hnl2-dc2, hw-maui-dc1, ib-town-dc1, ib-santantoni-dc1, ib-santaeulalia-dc1, ib-escanar-dc1, ib-portinatx-dc1, etc.",
    country: "(REQUIRED) FJ | HW | IB",
    hostname: "ib-town-cr-03.vodafone.ib",
    vendor: "(REQUIRED) Nokia | Cisco | Juniper | Palo Alto | F5 | Infoblox | Microsemi | Arista",
    hwModel: "(REQUIRED) e.g. 7750 SR-12e, ASR 9901, NCS-5501",
    serialNumber: "NOK-SR12E-IB03",
    layer: "(REQUIRED) IP Core | Internet GW | 5G Core | Voice Core | DC Fabric | IP LAN | BPoP | APoP | Transport | Security | Load Balancer | IT Infrastructure | NMS Platform | BSS Platform",
    role: "cr | pe | igw | fw | lb | dns | ntp | aaa | dc-fabric | bpop | apop | acc-sw | distr-sw | 5gc | amf | smf | upf | voip-gw | nms | bss | oss | waf | asr",
    mgmtIp: "(REQUIRED) e.g. 10.30.1.50",
    status: "UP | DEGRADED | DOWN (default: UP)",
    osVersion: "SR-OS 23.10.R2",
    interfaces: [
      { name: "1/1/c1/1", ip: "10.3.0.100/30", description: "To ib-town-cr-01", peer: "ib-town-cr-01", operStatus: "UP", speed: "100G", mtu: 9212 }
    ],
    bgpNeighbors: [
      { peer: "172.16.3.1", asn: 65003, state: "Established", prefixesRx: 0, prefixesTx: 0, description: "To ib-town-cr-01" }
    ],
    services: ["ib-mpls-vpn"],
    features: ["MPLS", "BGP", "ISIS"],
  }
];

const CSV_TEMPLATE_HEADER = "id,siteId,country,hostname,vendor,hwModel,serialNumber,layer,role,mgmtIp,status,osVersion";
const CSV_TEMPLATE_ROW    = "ib-town-cr-03,ib-town-dc1,IB,ib-town-cr-03.vodafone.ib,Nokia,7750 SR-12e,NOK-SR12E-IB03,IP Core,cr,10.30.1.50,UP,SR-OS 23.10.R2";

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
}

function validateDevice(d, existingIds, siteIds, layerSet) {
  const errors = [];
  REQUIRED_IMPORT.forEach(f => { if (!d[f] || !String(d[f]).trim()) errors.push(`Missing required field: ${f}`); });
  if (d.siteId && !siteIds.has(d.siteId)) errors.push(`Unknown siteId: ${d.siteId}`);
  if (d.country && !VALID_COUNTRIES.includes(d.country)) errors.push(`Invalid country: ${d.country} (must be FJ, HW, or IB)`);
  if (d.layer && !layerSet.has(d.layer)) errors.push(`Invalid layer: ${d.layer}`);
  if (d.id && existingIds.has(d.id)) errors.push(`Device ID already exists: ${d.id}`);
  if (d.mgmtIp && !IP_RE.test(d.mgmtIp)) errors.push(`Invalid mgmtIp format: ${d.mgmtIp}`);
  if (d.status && !VALID_STATUSES.includes(d.status)) errors.push(`Invalid status: ${d.status} (must be UP, DEGRADED, or DOWN)`);
  return errors.length ? { valid: false, errors } : { valid: true };
}

function normalizeDevice(d) {
  return {
    ...d,
    status: VALID_STATUSES.includes(d.status) ? d.status : "UP",
    interfaces: Array.isArray(d.interfaces) ? d.interfaces : [],
    bgpNeighbors: Array.isArray(d.bgpNeighbors) ? d.bgpNeighbors : [],
    services: Array.isArray(d.services) ? d.services : [],
    features: Array.isArray(d.features) ? d.features : [],
    rackUnit: d.rackUnit || "",
    procurementDate: d.procurementDate || "",
    eolDate: d.eolDate || "",
    supportExpiry: d.supportExpiry || "",
    serialNumber: d.serialNumber || "",
    osVersion: d.osVersion || "",
    hostname: d.hostname || "",
    role: d.role || "",
    lineCards: Array.isArray(d.lineCards) ? d.lineCards : [],
    powerSupplies: Array.isArray(d.powerSupplies) ? d.powerSupplies : [],
    powerConsumptionW: d.powerConsumptionW ?? null,
    lastCommit: d.lastCommit || null,
    goldenConfig: d.goldenConfig || "",
  };
}

export function ImportDialog({ onResult, onClose }) {
  const [tab, setTab] = useState("json");
  const [parseError, setParseError] = useState(null);
  const [devices, setDevices] = useState(null);       // array of { device, validation }
  const [fileName, setFileName] = useState(null);
  const [fileSize, setFileSize] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [importDone, setImportDone] = useState(null);  // success message
  const fileRef = useRef();
  const { nodes } = useNodes();

  const siteIds  = useMemo(() => new Set(SITES.map(s => s.id)), []);
  const layerSet = useMemo(() => new Set(LAYERS), []);
  const existingIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes]);

  const reset = () => { setDevices(null); setParseError(null); setFileName(null); setFileSize(null); setImportDone(null); };

  const processData = (rawDevices, fname, fsize) => {
    setFileName(fname);
    setFileSize(fsize);
    setParseError(null);
    setImportDone(null);
    const results = rawDevices.map(d => {
      const norm = normalizeDevice(d);
      const validation = validateDevice(norm, existingIds, siteIds, layerSet);
      return { device: norm, validation };
    });
    setDevices(results);
  };

  const handleFile = file => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (ext !== "json" && ext !== "csv") {
      setParseError("Unsupported file type. Please upload a .json or .csv file.");
      return;
    }
    // Auto-switch tab to match file type
    if (ext === "csv") setTab("csv");
    else setTab("json");

    const reader = new FileReader();
    reader.onload = ev => {
      try {
        let data;
        if (ext === "json") {
          data = JSON.parse(ev.target.result);
          if (!Array.isArray(data)) data = [data];
          // Strip _comment fields
          data = data.map(d => { const c = { ...d }; delete c._comment; return c; });
        } else {
          data = parseCSV(ev.target.result);
        }
        if (!data.length) { setParseError("No devices found in file."); return; }
        processData(data, file.name, file.size);
      } catch (err) {
        setParseError(ext === "json" ? "Invalid JSON: " + err.message : "CSV parse error: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const onFileInput = e => { handleFile(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = ""; };
  const onDrop = e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); };
  const onDragOver = e => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  const validCount   = devices ? devices.filter(d => d.validation.valid).length : 0;
  const invalidCount = devices ? devices.filter(d => !d.validation.valid).length : 0;
  const totalCount   = devices ? devices.length : 0;

  const handleImport = () => {
    const toImport = devices.filter(d => d.validation.valid).map(d => d.device);
    if (!toImport.length) return;
    onResult(toImport);
    setImportDone(`Successfully imported ${toImport.length} device(s).`);
  };

  const tabBtn = (id, label) => (
    <button key={id} onClick={() => { setTab(id); reset(); }}
      style={{ padding:"8px 20px", border:"none", cursor:"pointer", background:"transparent",
        fontFamily:"inherit", fontSize:12, fontWeight:600,
        color: tab === id ? T.primary : T.muted,
        borderBottom: tab === id ? `2px solid ${T.primary}` : "2px solid transparent" }}>
      {label}
    </button>
  );

  const fmtSize = bytes => bytes < 1024 ? bytes + " B" : (bytes / 1024).toFixed(1) + " KB";

  return <Modal title="Import Devices" onClose={onClose} width={880}>
    {/* Tabs */}
    <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, background:"#f8fafc", padding:"0 24px", marginTop:-24 }}>
      {tabBtn("json", "JSON")}
      {tabBtn("csv", "CSV")}
    </div>

    <div style={{ padding:"20px 0 0", display:"flex", flexDirection:"column", gap:14 }}>

      {/* Download template */}
      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:12, color:T.muted }}>Download template:</span>
        {tab === "json" ? (
          <button onClick={() => downloadFile("device-template.json", JSON.stringify(JSON_TEMPLATE, null, 2), "application/json")}
            style={{ fontSize:11, fontWeight:600, color:T.primary, background:"#eff6ff", border:`1px solid ${T.primary}30`,
              borderRadius:6, padding:"4px 12px", cursor:"pointer", fontFamily:"inherit" }}>
            device-template.json
          </button>
        ) : (
          <button onClick={() => downloadFile("device-template.csv", CSV_TEMPLATE_HEADER + "\n" + CSV_TEMPLATE_ROW + "\n", "text/csv")}
            style={{ fontSize:11, fontWeight:600, color:"#0d9488", background:"#f0fdfa", border:"1px solid #0d948830",
              borderRadius:6, padding:"4px 12px", cursor:"pointer", fontFamily:"inherit" }}>
            device-template.csv
          </button>
        )}
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? T.primary : T.border}`,
          borderRadius: 10,
          background: dragOver ? "#eff6ff" : "#f8fafc",
          padding: "28px 20px",
          textAlign: "center",
          cursor: "pointer",
          transition: "all 0.15s",
        }}>
        <input ref={fileRef} type="file" accept=".json,.csv" onChange={onFileInput} style={{ display:"none" }} />
        {fileName ? (
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{fileName}</div>
            <div style={{ fontSize:11, color:T.muted, marginTop:2 }}>{fmtSize(fileSize)}</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize:20, marginBottom:4 }}>{tab === "json" ? "{}" : ","}</div>
            <div style={{ fontSize:12, color:T.muted }}>
              Drag & drop a <strong>.{tab}</strong> file here, or <span style={{ color:T.primary, fontWeight:600 }}>click to browse</span>
            </div>
          </div>
        )}
      </div>

      {/* Parse error */}
      {parseError && (
        <div style={{ color:"#dc2626", fontSize:12, background:"#fef2f2", padding:"8px 12px", borderRadius:6 }}>
          {parseError}
        </div>
      )}

      {/* Success message */}
      {importDone && (
        <div style={{ color:"#16a34a", fontSize:12, fontWeight:600, background:"#f0fdf4", padding:"10px 14px", borderRadius:6,
          border:"1px solid #bbf7d0", textAlign:"center" }}>
          {importDone}
        </div>
      )}

      {/* Preview table */}
      {devices && !importDone && (
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:8, display:"flex", alignItems:"center", gap:10 }}>
            <span>{validCount} of {totalCount} devices valid</span>
            {invalidCount > 0 && <span style={{ fontSize:11, color:"#dc2626", fontWeight:600 }}>{invalidCount} invalid</span>}
          </div>

          <div style={{ maxHeight:260, overflowY:"auto", border:`1px solid ${T.border}`, borderRadius:8, overflow:"hidden" }}>
            <table style={{ width:"100%", fontSize:11, borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ background:"#f1f5f9", position:"sticky", top:0, zIndex:1 }}>
                  {["","ID","Site","Country","Vendor","Model","Layer","Mgmt IP","Errors"].map(h => (
                    <th key={h} style={{ padding:"6px 8px", textAlign:"left", fontWeight:700, color:T.muted,
                      fontSize:10, borderBottom:`1px solid ${T.border}`, whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map((d, i) => (
                  <tr key={d.device.id || i} style={{
                    background: d.validation.valid ? "#fff" : "#fef2f2",
                    borderBottom: `1px solid ${T.border}30`,
                  }}>
                    <td style={{ padding:"5px 8px", textAlign:"center" }}>
                      {d.validation.valid
                        ? <span style={{ color:"#16a34a", fontWeight:700 }}>&#10003;</span>
                        : <span style={{ color:"#dc2626", fontWeight:700 }}>&#10007;</span>}
                    </td>
                    <td style={{ padding:"5px 8px", fontFamily:"monospace", fontWeight:600, color:T.primary, whiteSpace:"nowrap" }}>
                      {d.device.id || "—"}
                    </td>
                    <td style={{ padding:"5px 8px", fontSize:10, color:T.muted, whiteSpace:"nowrap" }}>
                      {d.device.siteId || "—"}
                    </td>
                    <td style={{ padding:"5px 8px", fontSize:10, whiteSpace:"nowrap" }}>
                      {d.device.country || "—"}
                    </td>
                    <td style={{ padding:"5px 8px", fontSize:10, whiteSpace:"nowrap" }}>
                      {d.device.vendor || "—"}
                    </td>
                    <td style={{ padding:"5px 8px", fontSize:10, fontFamily:"monospace", whiteSpace:"nowrap" }}>
                      {d.device.hwModel || "—"}
                    </td>
                    <td style={{ padding:"5px 8px" }}>
                      {d.device.layer
                        ? <span style={{ fontSize:9, fontWeight:600, color:"#fff",
                            background: LAYER_COLORS[d.device.layer] || "#334155",
                            borderRadius:3, padding:"1px 5px", whiteSpace:"nowrap" }}>{d.device.layer}</span>
                        : "—"}
                    </td>
                    <td style={{ padding:"5px 8px", fontFamily:"monospace", fontSize:10, whiteSpace:"nowrap" }}>
                      {d.device.mgmtIp || "—"}
                    </td>
                    <td style={{ padding:"5px 8px", fontSize:10, color:"#dc2626", maxWidth:220, wordBreak:"break-word" }}>
                      {d.validation.valid ? "" : d.validation.errors.join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Import button */}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:12 }}>
            <Btn variant="ghost" onClick={() => { reset(); }} small>Clear</Btn>
            <Btn variant="ghost" onClick={onClose} small>Cancel</Btn>
            <Btn onClick={handleImport} disabled={validCount === 0} small>
              Import {validCount} valid device{validCount !== 1 ? "s" : ""}
            </Btn>
          </div>
        </div>
      )}
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
