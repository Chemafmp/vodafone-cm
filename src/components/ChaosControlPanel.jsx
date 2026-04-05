import { useState, useEffect, useCallback } from "react";
import { T } from "../data/constants.js";
import { Modal, Btn } from "./ui/index.jsx";

// Derive HTTP base URL from the WS URL the poller socket uses.
// VITE_POLLER_WS looks like "wss://api.chemafmp.dev" or "ws://localhost:4000".
// We need "https://api.chemafmp.dev" / "http://localhost:4000".
const WS = import.meta.env.VITE_POLLER_WS || "ws://localhost:4000";
const HTTP_BASE = WS.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const SCENARIOS = [
  { value: "cascade",     label: "Cascade Failure",     desc: "CPU→MEM→TEMP→interfaces→BGP all fail, then recover (~55s)" },
  { value: "maintenance", label: "Maintenance Window",  desc: "CPU climbs, interface bounce, then normalize (~40s)" },
  { value: "linkflap",    label: "Link Flap Storm",     desc: "Interface bounces UP/DOWN 8 times rapidly (~35s)" },
  { value: "bgpleak",     label: "BGP Route Leak",      desc: "Peer advertises 850k prefixes, memory spikes (~30s)" },
  { value: "thermal",     label: "Thermal Runaway",     desc: "Temperature climbs until thermal shutdown (~50s)" },
];

export default function ChaosControlPanel({ onClose }) {
  const [nodes, setNodes]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [busy, setBusy]         = useState({});          // { [nodeId]: true }
  const [flash, setFlash]       = useState(null);        // { kind, text } transient toast

  const fetchNodes = useCallback(async () => {
    try {
      const r = await fetch(`${HTTP_BASE}/api/control/nodes`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      setNodes(data.nodes || []);
      setError(null);
    } catch (e) {
      setError(`Unable to reach poller at ${HTTP_BASE}: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNodes();
    const timer = setInterval(fetchNodes, 3000);  // light poll; backend is cheap
    return () => clearInterval(timer);
  }, [fetchNodes]);

  // Auto-dismiss transient flash messages
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(t);
  }, [flash]);

  const callApi = async (url, body, successText) => {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
      setFlash({ kind: "ok", text: successText });
      return data;
    } catch (e) {
      setFlash({ kind: "err", text: `Failed: ${e.message}` });
      throw e;
    }
  };

  const kill = async (id) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await callApi(`${HTTP_BASE}/api/control/kill/${id}`, null, `Killed ${id}`);
      await fetchNodes();
    } catch {/* flash already shown */}
    finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  const revive = async (id) => {
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await callApi(`${HTTP_BASE}/api/control/revive/${id}`, null, `Revived ${id}`);
      await fetchNodes();
    } catch {/* flash already shown */}
    finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  const scenario = async (id, name) => {
    if (!name) return;
    setBusy(b => ({ ...b, [id]: true }));
    try {
      await callApi(
        `${HTTP_BASE}/api/control/scenario/${id}`,
        { scenario: name },
        `Scenario "${name}" triggered on ${id}`
      );
    } catch {/* flash already shown */}
    finally { setBusy(b => ({ ...b, [id]: false })); }
  };

  const running = nodes.filter(n => n.status === "running").length;
  const killed  = nodes.length - running;

  return (
    <Modal title="Chaos Control — Simulated Fleet" onClose={onClose} width={880}>
      {/* Header strip: fleet summary */}
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16,padding:"12px 16px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:10}}>
        <span style={{fontSize:20}}>🎭</span>
        <div style={{flex:1}}>
          <div style={{fontSize:13,fontWeight:700,color:T.text}}>Live simulation fleet</div>
          <div style={{fontSize:11,color:T.muted,marginTop:2}}>
            Kill, revive, or trigger chaos scenarios on backend simulator nodes. Effects propagate
            through the poller to Alarms, Events, Topology and Node Inspector in real time.
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <span style={{fontSize:11,fontWeight:700,background:"#dcfce7",color:"#15803d",borderRadius:6,padding:"4px 10px"}}>● {running} running</span>
          {killed > 0 && <span style={{fontSize:11,fontWeight:700,background:"#fee2e2",color:"#b91c1c",borderRadius:6,padding:"4px 10px"}}>✕ {killed} killed</span>}
        </div>
      </div>

      {/* Flash toast */}
      {flash && (
        <div style={{
          marginBottom:12,padding:"9px 14px",borderRadius:8,fontSize:12,fontWeight:600,
          background: flash.kind === "ok" ? "#dcfce7" : "#fee2e2",
          color:      flash.kind === "ok" ? "#15803d" : "#b91c1c",
          border: `1px solid ${flash.kind === "ok" ? "#86efac" : "#fca5a5"}`,
        }}>
          {flash.kind === "ok" ? "✓ " : "✕ "}{flash.text}
        </div>
      )}

      {loading && <div style={{padding:"32px 0",textAlign:"center",color:T.muted,fontSize:13}}>Loading fleet state…</div>}

      {error && (
        <div style={{padding:"14px 16px",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,color:"#b91c1c",fontSize:12}}>
          <div style={{fontWeight:700,marginBottom:4}}>Connection error</div>
          <div style={{fontFamily:"monospace",fontSize:11}}>{error}</div>
          <div style={{marginTop:8,color:T.muted}}>Control API is only available when the poller has AUTO_FLEET &gt; 0 (i.e. the live demo backend).</div>
        </div>
      )}

      {!loading && !error && nodes.length === 0 && (
        <div style={{padding:"32px 0",textAlign:"center",color:T.muted,fontSize:13}}>
          Poller is running but no auto-fleet nodes are registered.
        </div>
      )}

      {!loading && nodes.length > 0 && (
        <div style={{display:"grid",gap:10}}>
          {nodes.map(node => {
            const isRunning = node.status === "running";
            const isBusy = !!busy[node.id];
            return (
              <div key={node.id} style={{
                display:"grid",gridTemplateColumns:"auto 1fr auto auto",gap:12,alignItems:"center",
                padding:"12px 14px",background:T.surface,
                border:`1px solid ${isRunning ? T.border : "#fca5a5"}`,
                borderRadius:10,
                opacity: isRunning ? 1 : 0.85,
              }}>
                <div style={{
                  width:10,height:10,borderRadius:"50%",flexShrink:0,
                  background: isRunning ? "#22c55e" : "#ef4444",
                  boxShadow: isRunning ? "0 0 0 3px rgba(34,197,94,0.25)" : "0 0 0 3px rgba(239,68,68,0.25)",
                }}/>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:T.text,fontFamily:"monospace"}}>{node.id}</div>
                  <div style={{fontSize:11,color:T.muted,marginTop:1}}>
                    {node.label} · {node.country} · port {node.port}
                  </div>
                </div>

                {/* Scenario dropdown (only meaningful if running) */}
                <select
                  disabled={!isRunning || isBusy}
                  value=""
                  onChange={e => scenario(node.id, e.target.value)}
                  style={{
                    background:T.bg,border:`1px solid ${T.border}`,borderRadius:7,
                    color:T.text,padding:"6px 10px",fontSize:12,fontFamily:"inherit",
                    cursor: isRunning && !isBusy ? "pointer" : "not-allowed",
                    opacity: isRunning && !isBusy ? 1 : 0.5,
                  }}
                  title={isRunning ? "Trigger chaos scenario" : "Revive node first"}
                >
                  <option value="">Trigger scenario…</option>
                  {SCENARIOS.map(s => (
                    <option key={s.value} value={s.value} title={s.desc}>{s.label}</option>
                  ))}
                </select>

                {/* Kill / Revive toggle */}
                {isRunning ? (
                  <Btn small variant="danger" disabled={isBusy} onClick={() => kill(node.id)} style={{minWidth:86}}>
                    {isBusy ? "…" : "💀 Kill"}
                  </Btn>
                ) : (
                  <Btn small variant="primary" disabled={isBusy} onClick={() => revive(node.id)} style={{minWidth:86}}>
                    {isBusy ? "…" : "🔄 Revive"}
                  </Btn>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{marginTop:16,padding:"10px 14px",background:T.bg,border:`1px dashed ${T.border}`,borderRadius:8,fontSize:11,color:T.muted,lineHeight:1.5}}>
        <strong style={{color:T.text}}>Tip:</strong> Killing a node stops its SNMP simulator — the poller will mark it unreachable in the next cycle (~10s) and alarms will fire. Reviving respawns the child process and the node rejoins the fleet. Scenarios run for 30-55s and generate realistic alarm/event storms.
      </div>
    </Modal>
  );
}
