import { useMemo, useState, useEffect } from "react";
import { T } from "../data/constants.js";
import { useNodes } from "../context/NodesContext.jsx";

/**
 * LiveStatusView — "what is burning in the network right now?"
 *
 * Aggregates live poller data (nodeSnapshots + liveAlarms) into per-node
 * incident cards instead of a flat alarm table. Each incident cross-references
 * crs[] via affectedDeviceIds so the engineer can see immediately if an
 * in-flight change is touching the degraded node.
 *
 * Data sources (all live via WebSocket):
 *   - nodeSnapshots: { [nodeId]: { reachable, cpu, mem, temp, interfaces, bgpPeers } }
 *   - liveAlarms:    [{ nodeId, type, severity, message, since, ... }]
 *   - crs:           [{ id, name, status, affectedDeviceIds, ... }]
 *
 * Health classification (per node, worst wins):
 *   DOWN       → !reachable OR any Critical alarm
 *   DEGRADED   → any Major alarm OR cpu≥85 OR mem≥90 OR temp≥70
 *   WARNING    → any Minor/Warning alarm OR cpu≥70 OR mem≥80
 *   HEALTHY    → everything else
 */

const ACTIVE_CHANGE_STATUSES = ["Scheduled", "Preflight", "Approved", "In Execution"];

const SEVERITY_RANK = { Critical: 4, Major: 3, Minor: 2, Warning: 1, Info: 0 };

const HEALTH = {
  DOWN:     { rank: 4, color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", label: "DOWN",     dot: "#ef4444" },
  DEGRADED: { rank: 3, color: "#b45309", bg: "#fffbeb", border: "#fcd34d", label: "DEGRADED", dot: "#f59e0b" },
  WARNING:  { rank: 2, color: "#0891b2", bg: "#ecfeff", border: "#67e8f9", label: "WARNING",  dot: "#06b6d4" },
  HEALTHY:  { rank: 1, color: "#15803d", bg: "#f0fdf4", border: "#86efac", label: "HEALTHY",  dot: "#22c55e" },
};

/** Classify a node into one of the HEALTH buckets */
function classify(snap, nodeAlarms) {
  const worstSev = nodeAlarms.reduce((m, a) => Math.max(m, SEVERITY_RANK[a.severity] ?? 0), 0);
  if (snap && snap.reachable === false) return "DOWN";
  if (worstSev >= 4) return "DOWN";
  if (worstSev >= 3) return "DEGRADED";
  if (snap) {
    if ((snap.cpu ?? 0) >= 85 || (snap.mem ?? 0) >= 90 || (snap.temp ?? 0) >= 70) return "DEGRADED";
  }
  if (worstSev >= 1) return "WARNING";
  if (snap && ((snap.cpu ?? 0) >= 70 || (snap.mem ?? 0) >= 80)) return "WARNING";
  return "HEALTHY";
}

/** Derive a human incident label from the set of alarm types firing on a node */
function deriveIncidentLabel(snap, nodeAlarms) {
  if (snap && snap.reachable === false) return "NODE UNREACHABLE";
  if (nodeAlarms.length === 0) {
    if (snap && (snap.cpu >= 85 || snap.mem >= 90)) return "RESOURCE PRESSURE";
    return "ELEVATED METRICS";
  }
  const types = new Set(nodeAlarms.map(a => a.type));
  const hasPerf = types.has("PERFORMANCE");
  const hasHw   = types.has("HARDWARE");
  const hasIf   = types.has("INTERFACE");
  const hasBgp  = types.has("BGP");
  const hasReach = types.has("REACHABILITY");
  if (hasReach) return "NODE UNREACHABLE";
  // Cascade = 3+ distinct alarm domains hit simultaneously
  const domainCount = [hasPerf, hasHw, hasIf, hasBgp].filter(Boolean).length;
  if (domainCount >= 3) return "CASCADE FAILURE";
  if (hasBgp && hasIf) return "BGP + LINK INSTABILITY";
  if (hasBgp) return "BGP INSTABILITY";
  if (hasHw && hasPerf) return "THERMAL + LOAD EVENT";
  if (hasHw) return "THERMAL EVENT";
  if (hasIf && nodeAlarms.length >= 3) return "LINK FLAP STORM";
  if (hasIf) return "INTERFACE DOWN";
  if (hasPerf) return "PERFORMANCE DEGRADATION";
  return "ACTIVE ALARMS";
}

/** "34s ago", "2m 12s ago", "1h 05m ago" */
function timeAgo(iso, now) {
  if (!iso) return "—";
  const ms = now - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, "0")}m ago`;
}

/** Color-code a metric value against two thresholds */
function metricColor(value, warn, crit) {
  if (value == null) return T.muted;
  if (value >= crit) return "#dc2626";
  if (value >= warn) return "#b45309";
  return "#15803d";
}

function MetricBar({ label, value, unit, warn, crit }) {
  const v = value ?? 0;
  const col = metricColor(v, warn, crit);
  const pct = Math.min(100, Math.max(0, v));
  return (
    <div style={{minWidth:78}}>
      <div style={{display:"flex",justifyContent:"space-between",fontSize:9,fontWeight:700,color:T.muted,letterSpacing:"0.5px",marginBottom:2}}>
        <span>{label}</span>
        <span style={{color:col,fontFamily:"monospace"}}>{v}{unit}</span>
      </div>
      <div style={{height:4,background:T.bg,borderRadius:2,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:col,borderRadius:2,transition:"width 0.4s,background 0.4s"}}/>
      </div>
    </div>
  );
}

function ChangeBadge({ change, onClick }) {
  const executing = change.status === "In Execution";
  return (
    <div
      onClick={onClick}
      style={{
        display:"flex",alignItems:"center",gap:10,padding:"8px 12px",
        background: executing ? "#fef3c7" : "#eff6ff",
        border: `1px solid ${executing ? "#fbbf24" : "#93c5fd"}`,
        borderRadius:8,cursor:"pointer",marginTop:8,
      }}
      title="Click to open change"
    >
      <span style={{fontSize:14,flexShrink:0}}>{executing ? "⚡" : "📅"}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:11,fontWeight:800,color:executing ? "#92400e" : "#1e40af",letterSpacing:"0.3px"}}>
          {executing ? "⚠ CHANGE IN EXECUTION" : "SCHEDULED CHANGE"} · {change.id}
        </div>
        <div style={{fontSize:11,color:T.text,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {change.name} {change.manager && <span style={{color:T.muted}}>· {change.manager}</span>}
        </div>
      </div>
      <span style={{fontSize:10,fontWeight:700,color:executing ? "#92400e" : "#1e40af",flexShrink:0}}>
        {change.status} ›
      </span>
    </div>
  );
}

function IncidentCard({ incident, expanded, onToggle, onOpenChange, now }) {
  const h = HEALTH[incident.health];
  const { node, snap, alarms, activeChanges, label, nodeMeta, startedAt } = incident;

  return (
    <div style={{
      background:T.surface,
      border:`1px solid ${h.border}`,
      borderLeft:`4px solid ${h.dot}`,
      borderRadius:10,
      padding:"14px 16px",
      marginBottom:10,
      boxShadow:"0 1px 3px rgba(0,0,0,0.04)",
    }}>
      {/* Header row */}
      <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
            <span style={{width:10,height:10,borderRadius:"50%",background:h.dot,flexShrink:0,boxShadow:`0 0 0 3px ${h.bg}`}}/>
            <span style={{fontSize:14,fontWeight:800,color:T.text,fontFamily:"monospace"}}>{node}</span>
            <span style={{fontSize:9,fontWeight:800,color:h.color,background:h.bg,border:`1px solid ${h.border}`,padding:"2px 7px",borderRadius:4,letterSpacing:"0.5px"}}>{h.label}</span>
          </div>
          <div style={{fontSize:12,fontWeight:700,color:h.color,marginBottom:3}}>{label}</div>
          <div style={{fontSize:11,color:T.muted}}>
            {nodeMeta?.vendor && <span>{nodeMeta.vendor} {nodeMeta.hwModel}</span>}
            {nodeMeta?.country && <span> · {nodeMeta.country}</span>}
            {nodeMeta?.layer && <span> · {nodeMeta.layer}</span>}
            {alarms.length > 0 && <span> · <strong style={{color:h.color}}>{alarms.length} alarm{alarms.length!==1?"s":""}</strong> firing</span>}
            {startedAt && <span> · started {timeAgo(startedAt, now)}</span>}
          </div>
        </div>

        {/* Metrics column */}
        {snap && snap.reachable !== false && (
          <div style={{display:"flex",gap:10,flexShrink:0}}>
            <MetricBar label="CPU"  value={snap.cpu}  unit="%"  warn={70} crit={85}/>
            <MetricBar label="MEM"  value={snap.mem}  unit="%"  warn={80} crit={90}/>
            <MetricBar label="TEMP" value={snap.temp} unit="°C" warn={60} crit={70}/>
          </div>
        )}
      </div>

      {/* Active change cross-reference (the critical feature) */}
      {activeChanges.map(c => (
        <ChangeBadge key={c.id} change={c} onClick={() => onOpenChange(c)}/>
      ))}

      {/* Expand toggle — only if there are alarms to show */}
      {alarms.length > 0 && (
        <>
          <button
            onClick={onToggle}
            style={{
              marginTop:10,background:"transparent",border:"none",color:T.muted,fontSize:11,fontWeight:600,
              cursor:"pointer",padding:0,display:"flex",alignItems:"center",gap:6,fontFamily:"inherit",
            }}
          >
            <span style={{transition:"transform 0.15s",transform:expanded?"rotate(90deg)":"rotate(0)"}}>›</span>
            {expanded ? "Hide" : "Show"} {alarms.length} alarm{alarms.length!==1?"s":""}
          </button>
          {expanded && (
            <div style={{marginTop:8,paddingTop:8,borderTop:`1px dashed ${T.border}`,display:"flex",flexDirection:"column",gap:5}}>
              {alarms.map(a => {
                const sevCol = a.severity === "Critical" ? "#dc2626"
                  : a.severity === "Major" ? "#b45309"
                  : "#0891b2";
                return (
                  <div key={a.id || a.key} style={{display:"flex",gap:10,alignItems:"center",fontSize:11}}>
                    <span style={{fontSize:9,fontWeight:800,color:"#fff",background:sevCol,padding:"2px 6px",borderRadius:3,letterSpacing:"0.4px",minWidth:54,textAlign:"center"}}>{a.severity.toUpperCase()}</span>
                    <span style={{fontSize:9,fontWeight:700,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,padding:"2px 6px",borderRadius:3,minWidth:72,textAlign:"center"}}>{a.type}</span>
                    <span style={{flex:1,color:T.text,fontFamily:"monospace",fontSize:11}}>{a.message}</span>
                    <span style={{color:T.muted,fontSize:10}}>{timeAgo(a.since, now)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function LiveStatusView({ liveAlarms = [], nodeSnapshots = {}, pollerConnected, crs = [], onSelectChange }) {
  const { nodes: inventoryNodes } = useNodes();
  const [expanded, setExpanded] = useState({});           // { [nodeId]: bool }
  const [now, setNow] = useState(Date.now());

  // Tick every second so "X ago" labels stay fresh
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Build incident list: union of (nodes with snapshots) ∪ (nodes with open alarms)
  const { incidents, healthy, counts } = useMemo(() => {
    const nodeIds = new Set([
      ...Object.keys(nodeSnapshots),
      ...liveAlarms.filter(a => a.status !== "RESOLVED").map(a => a.nodeId),
    ]);

    const all = [...nodeIds].map(id => {
      const snap = nodeSnapshots[id];
      const alarms = liveAlarms
        .filter(a => a.nodeId === id && a.status !== "RESOLVED")
        .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));

      const health = classify(snap, alarms);
      const activeChanges = crs.filter(c =>
        Array.isArray(c.affectedDeviceIds) &&
        c.affectedDeviceIds.includes(id) &&
        ACTIVE_CHANGE_STATUSES.includes(c.status)
      );

      return {
        node: id,
        snap,
        alarms,
        activeChanges,
        health,
        label: deriveIncidentLabel(snap, alarms),
        nodeMeta: inventoryNodes.find(n => n.id === id),
        startedAt: alarms.length > 0
          ? alarms.reduce((min, a) => (!min || new Date(a.since) < new Date(min)) ? a.since : min, null)
          : null,
      };
    });

    const incidents = all
      .filter(e => e.health !== "HEALTHY")
      .sort((a, b) => HEALTH[b.health].rank - HEALTH[a.health].rank
        || (b.alarms.length - a.alarms.length)
        || (new Date(a.startedAt || 0) - new Date(b.startedAt || 0)));

    const healthy = all.filter(e => e.health === "HEALTHY");

    const counts = {
      HEALTHY:  all.filter(e => e.health === "HEALTHY").length,
      WARNING:  all.filter(e => e.health === "WARNING").length,
      DEGRADED: all.filter(e => e.health === "DEGRADED").length,
      DOWN:     all.filter(e => e.health === "DOWN").length,
      total:    all.length,
    };

    return { incidents, healthy, counts };
  }, [liveAlarms, nodeSnapshots, crs, inventoryNodes]);

  const toggle = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div style={{flex:1,overflowY:"auto",padding:"20px 24px",background:T.bg}}>
      {/* ─── Fleet Health header ─── */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:T.text,letterSpacing:"-0.3px"}}>Live Network Status</div>
          <div style={{fontSize:11,color:T.muted,marginTop:2}}>Real-time fleet health derived from poller snapshots and open alarms.</div>
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:8,
          background:pollerConnected?"#dcfce7":"#fef2f2",
          border:`1px solid ${pollerConnected?"#86efac":"#fca5a5"}`,
          color:pollerConnected?"#15803d":"#b91c1c",fontSize:11,fontWeight:700}}>
          <span style={{width:8,height:8,borderRadius:"50%",background:pollerConnected?"#22c55e":"#ef4444",boxShadow:pollerConnected?"0 0 0 3px rgba(34,197,94,0.3)":"none"}}/>
          {pollerConnected?"LIVE · Poller connected":"STATIC · No poller"}
        </div>
      </div>

      {/* Counter cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20}}>
        {[
          { key:"HEALTHY",  label:"HEALTHY"  },
          { key:"WARNING",  label:"WARNING"  },
          { key:"DEGRADED", label:"DEGRADED" },
          { key:"DOWN",     label:"DOWN"     },
        ].map(c => {
          const h = HEALTH[c.key];
          const v = counts[c.key];
          return (
            <div key={c.key} style={{
              background:T.surface,
              border:`1px solid ${v>0?h.border:T.border}`,
              borderTop:`3px solid ${h.dot}`,
              borderRadius:10,padding:"14px 18px",
              opacity: v===0 && c.key!=="HEALTHY" ? 0.55 : 1,
            }}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{fontSize:38,fontWeight:800,color:h.color,fontFamily:"monospace",lineHeight:1}}>{v}</div>
                <span style={{width:10,height:10,borderRadius:"50%",background:h.dot,marginTop:6,boxShadow:v>0?`0 0 0 3px ${h.bg}`:"none"}}/>
              </div>
              <div style={{fontSize:11,fontWeight:700,color:T.muted,letterSpacing:"0.6px",marginTop:6}}>{c.label}</div>
            </div>
          );
        })}
      </div>

      {/* ─── Active incidents ─── */}
      <div style={{fontSize:12,fontWeight:800,color:T.muted,letterSpacing:"0.6px",marginBottom:10,textTransform:"uppercase"}}>
        Active Incidents {incidents.length>0 && <span style={{color:"#dc2626"}}>· {incidents.length}</span>}
      </div>

      {incidents.length === 0 ? (
        <div style={{
          background:"#f0fdf4",border:"1px solid #86efac",borderRadius:10,
          padding:"30px 20px",textAlign:"center",color:"#15803d",fontSize:14,fontWeight:700,
        }}>
          ✓ All systems nominal — {counts.HEALTHY} node{counts.HEALTHY!==1?"s":""} reporting healthy
        </div>
      ) : (
        incidents.map(inc => (
          <IncidentCard
            key={inc.node}
            incident={inc}
            expanded={!!expanded[inc.node]}
            onToggle={() => toggle(inc.node)}
            onOpenChange={onSelectChange}
            now={now}
          />
        ))
      )}

      {/* ─── Healthy strip ─── */}
      {healthy.length > 0 && (
        <>
          <div style={{fontSize:12,fontWeight:800,color:T.muted,letterSpacing:"0.6px",marginTop:24,marginBottom:10,textTransform:"uppercase"}}>
            Healthy Nodes · {healthy.length}
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
            {healthy.map(e => (
              <div key={e.node} style={{
                display:"flex",alignItems:"center",gap:8,padding:"7px 12px",
                background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,
              }}>
                <span style={{width:7,height:7,borderRadius:"50%",background:"#22c55e",boxShadow:"0 0 0 2px rgba(34,197,94,0.2)"}}/>
                <span style={{fontSize:11,fontWeight:700,color:T.text,fontFamily:"monospace"}}>{e.node}</span>
                {e.snap && e.snap.cpu != null && (
                  <span style={{fontSize:10,color:T.muted,fontFamily:"monospace"}}>
                    {e.snap.cpu}% · {e.snap.mem}% · {e.snap.temp}°C
                  </span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
