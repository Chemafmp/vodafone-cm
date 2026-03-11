import { useState } from "react";
import { TEAMS, DEPTS } from "../data/constants.js";
import { genId } from "../utils/helpers.js";

// Deep navy + teal accent — clean NOC-tool aesthetic
const BG      = "#0c1a2e";
const ACCENT  = "#0ea5e9";   // sky-500
const CARD    = "#ffffff";

const ROLES = ["Engineer","Manager","Head of","Director","NOC/SAC","Bar Raiser"];

const PERSONAS = [
  {id:"u1", name:"Alex Torres", role:"Engineer",  team:"Core Transport", dept:"Engineering"},
  {id:"u2", name:"Chema F.",    role:"Manager",   team:"Core Transport", dept:"Engineering"},
  {id:"u3", name:"Matt I.",     role:"Director",  team:"Core Transport", dept:"Engineering"},
  {id:"u11",name:"Mabel M.",    role:"Director",  team:"Core Transport", dept:"Engineering"},
  {id:"u12",name:"Didie T.",    role:"Director",  team:"Core Transport", dept:"Engineering"},
  {id:"u5", name:"Ivan M.",     role:"Head of",   team:"Core Transport", dept:"Engineering"},
  {id:"u7", name:"Davide Z.",   role:"Engineer",  team:"Data Core",      dept:"Operations"},
  {id:"u10",name:"Sam Reyes",   role:"Manager",   team:"Data Core",      dept:"Operations"},
];

const ROLE_COLORS = {
  Engineer:    "#2563eb",
  Manager:     "#0f766e",
  "Head of":   "#0e7490",
  Director:    "#7c3aed",
  "NOC/SAC":   "#475569",
  "Bar Raiser":"#b45309",
};

export default function LoginScreen({ onLogin }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Engineer");
  const [team, setTeam] = useState("Core Transport");
  const [dept, setDept] = useState("Engineering");

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    onLogin({ id: genId(), name: name.trim(), role, team, dept });
  }

  const canSubmit = name.trim().length > 0;

  return (
    <div style={{
      minHeight:"100vh", overflowY:"auto",
      background: BG,
      backgroundImage:`
        radial-gradient(ellipse at 20% 50%, rgba(14,165,233,0.07) 0%, transparent 55%),
        radial-gradient(ellipse at 80% 20%, rgba(99,102,241,0.06) 0%, transparent 50%)
      `,
      fontFamily:"'Inter',system-ui,sans-serif",
    }}>
      {/* inner wrapper — block layout avoids Windows flex+overflow scroll bug */}
      <div style={{width:"100%", maxWidth:456, margin:"0 auto", padding:"40px 24px", boxSizing:"border-box"}}>

        {/* Header */}
        <div style={{textAlign:"center", marginBottom:36}}>
          {/* Logo mark */}
          <div style={{
            width:52, height:52, borderRadius:14,
            background:`linear-gradient(135deg, ${ACCENT} 0%, #6366f1 100%)`,
            display:"inline-flex", alignItems:"center", justifyContent:"center",
            marginBottom:16,
            boxShadow:`0 8px 24px rgba(14,165,233,0.35)`,
          }}>
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <rect x="3" y="3" width="9" height="9" rx="2" fill="white" opacity="0.9"/>
              <rect x="14" y="3" width="9" height="9" rx="2" fill="white" opacity="0.55"/>
              <rect x="3" y="14" width="9" height="9" rx="2" fill="white" opacity="0.55"/>
              <rect x="14" y="14" width="9" height="9" rx="2" fill="white" opacity="0.25"/>
            </svg>
          </div>

          <div style={{fontSize:24, fontWeight:800, color:"#f8fafc", letterSpacing:"-0.5px", marginBottom:5}}>
            Bodaphone
          </div>
          <div style={{fontSize:12, color:"rgba(148,163,184,0.8)", letterSpacing:"0.08em", textTransform:"uppercase", fontWeight:500}}>
            Network Operations · Change Management
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: CARD, borderRadius:18,
          padding:"32px 32px 28px",
          boxShadow:"0 20px 60px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.2)",
          border:"1px solid rgba(255,255,255,0.06)",
        }}>
          {/* Top accent stripe */}
          <div style={{
            height:3,
            background:`linear-gradient(90deg, ${ACCENT}, #6366f1)`,
            borderRadius:"3px 3px 0 0",
            margin:"-32px -32px 28px",
          }}/>

          <h2 style={{margin:"0 0 4px", fontSize:18, fontWeight:700, color:"#0f172a"}}>Sign in</h2>
          <p style={{margin:"0 0 24px", fontSize:13, color:"#64748b"}}>
            Enter your name and role to continue.
          </p>

          <form onSubmit={handleSubmit}>
            <label style={labelStyle}>Full name</label>
            <input
              autoFocus
              value={name}
              onChange={e=>setName(e.target.value)}
              placeholder="e.g. Alex Torres"
              style={{
                ...inputStyle, marginBottom:14,
                borderColor: name.trim() ? ACCENT : "#e2e8f0",
                boxShadow: name.trim() ? `0 0 0 3px rgba(14,165,233,0.12)` : "none",
              }}
            />

            <label style={labelStyle}>Role</label>
            <select
              value={role}
              onChange={e=>setRole(e.target.value)}
              style={{...inputStyle, marginBottom:14, fontWeight:600, color: ROLE_COLORS[role]||"#0f172a"}}
            >
              {ROLES.map(r=>(
                <option key={r} value={r} style={{fontWeight:600, color:ROLE_COLORS[r]||"#0f172a"}}>{r}</option>
              ))}
            </select>

            <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:26}}>
              <div>
                <label style={labelStyle}>Team</label>
                <select value={team} onChange={e=>setTeam(e.target.value)} style={inputStyle}>
                  {TEAMS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Department</label>
                <select value={dept} onChange={e=>setDept(e.target.value)} style={inputStyle}>
                  {DEPTS.map(d=><option key={d}>{d}</option>)}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width:"100%", padding:"12px",
                background: canSubmit
                  ? `linear-gradient(135deg, ${ACCENT} 0%, #6366f1 100%)`
                  : "#e2e8f0",
                color: canSubmit ? "#fff" : "#94a3b8",
                border:"none", borderRadius:10,
                fontSize:14, fontWeight:700,
                cursor: canSubmit ? "pointer" : "not-allowed",
                transition:"opacity 0.15s",
                letterSpacing:"0.02em",
                boxShadow: canSubmit ? "0 4px 12px rgba(14,165,233,0.3)" : "none",
              }}
              onMouseEnter={e=>{ if(canSubmit) e.currentTarget.style.opacity="0.88"; }}
              onMouseLeave={e=>{ e.currentTarget.style.opacity="1"; }}
            >
              Enter →
            </button>
          </form>

          {/* Quick access */}
          <div style={{marginTop:22, paddingTop:18, borderTop:"1px solid #f1f5f9"}}>
            <div style={{fontSize:10, color:"#94a3b8", fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10}}>
              Quick access
            </div>
            <div style={{display:"flex", flexWrap:"wrap", gap:7}}>
              {PERSONAS.map(p=>(
                <button
                  key={p.id}
                  onClick={()=>onLogin(p)}
                  title={`${p.name} · ${p.role} · ${p.team}`}
                  style={{
                    display:"flex", alignItems:"center", gap:6,
                    padding:"5px 10px", borderRadius:20,
                    border:"1px solid #e2e8f0",
                    background:"#f8fafc", cursor:"pointer",
                    fontSize:12, color:"#334155",
                    transition:"all 0.12s",
                  }}
                  onMouseEnter={e=>{
                    e.currentTarget.style.borderColor = ACCENT;
                    e.currentTarget.style.color = ACCENT;
                    e.currentTarget.style.background = "#f0f9ff";
                  }}
                  onMouseLeave={e=>{
                    e.currentTarget.style.borderColor = "#e2e8f0";
                    e.currentTarget.style.color = "#334155";
                    e.currentTarget.style.background = "#f8fafc";
                  }}
                >
                  <span style={{
                    width:18, height:18, borderRadius:"50%",
                    background: ROLE_COLORS[p.role] || ACCENT,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color:"#fff", fontSize:9, fontWeight:700, flexShrink:0,
                  }}>
                    {p.name.charAt(0)}
                  </span>
                  <span style={{fontWeight:500}}>{p.name}</span>
                  <span style={{color:"#94a3b8", fontSize:10}}>({p.role})</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{textAlign:"center", marginTop:16, fontSize:11, color:"rgba(148,163,184,0.35)"}}>
          Prototype · no authentication · data stored in Supabase
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display:"block", fontSize:12, fontWeight:600, color:"#374151",
  marginBottom:5, letterSpacing:"0.02em",
};

const inputStyle = {
  width:"100%", padding:"9px 11px", borderRadius:8,
  border:"1px solid #e2e8f0", fontSize:13, color:"#0f172a",
  background:"#f8fafc", outline:"none",
  boxSizing:"border-box",
  fontFamily:"inherit",
  transition:"border-color 0.15s, box-shadow 0.15s",
};
