import { useMemo, useState, useEffect, useCallback } from "react";
import { T } from "../data/constants.js";
import { useNodes } from "../context/NodesContext.jsx";
import { SITES, COUNTRY_META, LAYER_COLORS } from "../data/inventory/index.js";

/**
 * LiveStatusView — "what is burning in the network right now?"
 *
 * Hierarchical view: Country → Site → Node incident cards.
 * Groups live poller data (nodeSnapshots + liveAlarms) into a tree
 * so operators can instantly see which country/datacenter is affected.
 */

const ACTIVE_CHANGE_STATUSES = ["Scheduled", "Preflight", "Approved", "In Execution"];
const SEVERITY_RANK = { Critical: 4, Major: 3, Minor: 2, Warning: 1, Info: 0 };
const HEALTH_KEYS = ["DOWN", "DEGRADED", "WARNING", "HEALTHY"];

const HEALTH = {
  DOWN:     { rank: 4, color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", label: "DOWN",     dot: "#ef4444" },
  DEGRADED: { rank: 3, color: "#b45309", bg: "#fffbeb", border: "#fcd34d", label: "DEGRADED", dot: "#f59e0b" },
  WARNING:  { rank: 2, color: "#0891b2", bg: "#ecfeff", border: "#67e8f9", label: "WARNING",  dot: "#06b6d4" },
  HEALTHY:  { rank: 1, color: "#15803d", bg: "#f0fdf4", border: "#86efac", label: "HEALTHY",  dot: "#22c55e" },
};

const SITE_TYPE_ICONS = { DC: "🏢", "Core PoP": "🔗", APoP: "📡", IXP: "🌐" };

// Build lookup maps once
const SITE_MAP = Object.fromEntries(SITES.map(s => [s.id, s]));

/* ── Classify ── */
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

function deriveIncidentLabel(snap, nodeAlarms) {
  if (snap && snap.reachable === false) return "NODE UNREACHABLE";
  if (nodeAlarms.length === 0) {
    if (snap && (snap.cpu >= 85 || snap.mem >= 90)) return "RESOURCE PRESSURE";
    return "ELEVATED METRICS";
  }
  const types = new Set(nodeAlarms.map(a => a.type));
  const hasPerf = types.has("PERFORMANCE"), hasHw = types.has("HARDWARE");
  const hasIf = types.has("INTERFACE"), hasBgp = types.has("BGP");
  const hasReach = types.has("REACHABILITY");
  if (hasReach) return "NODE UNREACHABLE";
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

function metricColor(value, warn, crit) {
  if (value == null) return T.muted;
  if (value >= crit) return "#dc2626";
  if (value >= warn) return "#b45309";
  return "#15803d";
}

function worstOf(healthCounts) {
  for (const k of HEALTH_KEYS) {
    if ((healthCounts[k] ?? 0) > 0) return k;
  }
  return "HEALTHY";
}

/* ══════════════════════════════════════════════════════════════════════════════
   Micro-components
   ══════════════════════════════════════════════════════════════════════════════ */

function HealthBar({ counts, width = 120 }) {
  const total = HEALTH_KEYS.reduce((s, k) => s + (counts[k] ?? 0), 0);
  if (total === 0) return null;
  return (
    <div style={{ display: "flex", width, height: 6, borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
      {HEALTH_KEYS.map(k => {
        const n = counts[k] ?? 0;
        if (n === 0) return null;
        return <div key={k} style={{ flex: n, background: HEALTH[k].dot, transition: "flex 0.3s" }} />;
      })}
    </div>
  );
}

function DotStrip({ nodes }) {
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", maxWidth: 180 }}>
      {nodes.map(n => (
        <span key={n.node} title={`${n.node} — ${n.health}`}
          style={{ width: 7, height: 7, borderRadius: "50%", background: HEALTH[n.health].dot, flexShrink: 0 }} />
      ))}
    </div>
  );
}

function MetricBar({ label, value, unit, warn, crit }) {
  const v = value ?? 0;
  const col = metricColor(v, warn, crit);
  const pct = Math.min(100, Math.max(0, v));
  return (
    <div style={{ minWidth: 78 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: col, fontFamily: "monospace" }}>{v}{unit}</span>
      </div>
      <div style={{ height: 4, background: T.bg, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 2, transition: "width 0.4s,background 0.4s" }} />
      </div>
    </div>
  );
}

function ChangeBadge({ change, onClick }) {
  const executing = change.status === "In Execution";
  return (
    <div onClick={onClick} title="Click to open change"
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
        background: executing ? "#fef3c7" : "#eff6ff",
        border: `1px solid ${executing ? "#fbbf24" : "#93c5fd"}`,
        borderRadius: 8, cursor: "pointer", marginTop: 8,
      }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{executing ? "⚡" : "📅"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: executing ? "#92400e" : "#1e40af", letterSpacing: "0.3px" }}>
          {executing ? "CHANGE IN EXECUTION" : "SCHEDULED CHANGE"} · {change.id}
        </div>
        <div style={{ fontSize: 11, color: T.text, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {change.name} {change.manager && <span style={{ color: T.muted }}>· {change.manager}</span>}
        </div>
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: executing ? "#92400e" : "#1e40af", flexShrink: 0 }}>
        {change.status} ›
      </span>
    </div>
  );
}

/* ── FilterBar ── */
function FilterBar({ sevFilter, setSevFilter, layerFilter, setLayerFilter, search, setSearch, showHealthy, setShowHealthy, allExpanded, onExpandAll, onCollapseAll }) {
  const layers = Object.keys(LAYER_COLORS);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "10px 14px", background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, marginBottom: 16,
    }}>
      {/* Search */}
      <div style={{ position: "relative", flex: "1 1 180px", minWidth: 140 }}>
        <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: T.muted, pointerEvents: "none" }}>🔍</span>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search nodes, vendors, alarms..."
          style={{
            width: "100%", padding: "6px 10px 6px 28px", fontSize: 12, fontFamily: "inherit",
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none",
          }}
        />
      </div>

      {/* Severity pills */}
      <div style={{ display: "flex", gap: 4 }}>
        {["ALL", ...HEALTH_KEYS.filter(k => k !== "HEALTHY")].map(k => {
          const active = sevFilter === k;
          const col = k === "ALL" ? T.primary : HEALTH[k]?.dot;
          return (
            <button key={k} onClick={() => setSevFilter(k)}
              style={{
                padding: "4px 10px", fontSize: 10, fontWeight: 700, letterSpacing: "0.4px",
                borderRadius: 5, border: `1px solid ${active ? col : T.border}`, cursor: "pointer",
                background: active ? (k === "ALL" ? T.primary : HEALTH[k].bg) : "transparent",
                color: active ? (k === "ALL" ? "#fff" : HEALTH[k].color) : T.muted,
                fontFamily: "inherit",
              }}>
              {k}
            </button>
          );
        })}
      </div>

      {/* Layer dropdown */}
      <select value={layerFilter} onChange={e => setLayerFilter(e.target.value)}
        style={{
          padding: "5px 8px", fontSize: 11, fontFamily: "inherit", borderRadius: 6,
          border: `1px solid ${T.border}`, background: T.bg, color: T.text, cursor: "pointer",
        }}>
        <option value="ALL">All layers</option>
        {layers.map(l => <option key={l} value={l}>{l}</option>)}
      </select>

      {/* Show healthy toggle */}
      <button onClick={() => setShowHealthy(v => !v)}
        style={{
          padding: "4px 10px", fontSize: 10, fontWeight: 700, borderRadius: 5, cursor: "pointer",
          border: `1px solid ${showHealthy ? "#86efac" : T.border}`, fontFamily: "inherit",
          background: showHealthy ? "#f0fdf4" : "transparent",
          color: showHealthy ? "#15803d" : T.muted,
        }}>
        {showHealthy ? "✓ " : ""}Healthy
      </button>

      {/* Expand / Collapse */}
      <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
        <button onClick={onExpandAll} title="Expand all"
          style={{ padding: "4px 8px", fontSize: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 5, cursor: "pointer", color: T.muted, fontFamily: "inherit" }}>↕</button>
        <button onClick={onCollapseAll} title="Collapse all"
          style={{ padding: "4px 8px", fontSize: 12, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 5, cursor: "pointer", color: T.muted, fontFamily: "inherit" }}>⊟</button>
      </div>
    </div>
  );
}

/* ── IncidentCard (compact) ── */
function IncidentCard({ incident, expanded, onToggle, onOpenChange, now }) {
  const h = HEALTH[incident.health];
  const { node, snap, alarms, activeChanges, label, nodeMeta, startedAt } = incident;
  const layerCol = nodeMeta?.layer ? LAYER_COLORS[nodeMeta.layer] : null;

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${h.border}`,
      borderLeft: `4px solid ${h.dot}`,
      borderRadius: 10,
      padding: "10px 14px",
      marginBottom: 6,
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: h.dot, flexShrink: 0, boxShadow: `0 0 0 2px ${h.bg}` }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: T.text, fontFamily: "monospace" }}>{node}</span>
            <span style={{ fontSize: 9, fontWeight: 800, color: h.color, background: h.bg, border: `1px solid ${h.border}`, padding: "1px 6px", borderRadius: 4, letterSpacing: "0.4px" }}>{h.label}</span>
            {layerCol && (
              <span style={{ fontSize: 9, fontWeight: 700, color: layerCol, background: `${layerCol}11`, border: `1px solid ${layerCol}44`, padding: "1px 6px", borderRadius: 4 }}>{nodeMeta.layer}</span>
            )}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: h.color, marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 10, color: T.muted }}>
            {nodeMeta?.vendor && <span>{nodeMeta.vendor} {nodeMeta.hwModel}</span>}
            {alarms.length > 0 && <span> · <strong style={{ color: h.color }}>{alarms.length} alarm{alarms.length !== 1 ? "s" : ""}</strong></span>}
            {startedAt && <span> · {timeAgo(startedAt, now)}</span>}
          </div>
        </div>
        {snap && snap.reachable !== false && (
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <MetricBar label="CPU" value={snap.cpu} unit="%" warn={70} crit={85} />
            <MetricBar label="MEM" value={snap.mem} unit="%" warn={80} crit={90} />
            <MetricBar label="TEMP" value={snap.temp} unit="°C" warn={60} crit={70} />
          </div>
        )}
      </div>

      {activeChanges.map(c => <ChangeBadge key={c.id} change={c} onClick={() => onOpenChange(c)} />)}

      {alarms.length > 0 && (
        <>
          <button onClick={onToggle}
            style={{
              marginTop: 6, background: "transparent", border: "none", color: T.muted, fontSize: 10, fontWeight: 600,
              cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 5, fontFamily: "inherit",
            }}>
            <span style={{ transition: "transform 0.15s", transform: expanded ? "rotate(90deg)" : "rotate(0)" }}>›</span>
            {expanded ? "Hide" : "Show"} {alarms.length} alarm{alarms.length !== 1 ? "s" : ""}
          </button>
          {expanded && (
            <div style={{ marginTop: 6, paddingTop: 6, borderTop: `1px dashed ${T.border}`, display: "flex", flexDirection: "column", gap: 4 }}>
              {alarms.map(a => {
                const sevCol = a.severity === "Critical" ? "#dc2626" : a.severity === "Major" ? "#b45309" : "#0891b2";
                return (
                  <div key={a.id || a.key} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 10 }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: "#fff", background: sevCol, padding: "1px 5px", borderRadius: 3, letterSpacing: "0.3px", minWidth: 50, textAlign: "center" }}>{a.severity.toUpperCase()}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: T.muted, background: T.bg, border: `1px solid ${T.border}`, padding: "1px 5px", borderRadius: 3, minWidth: 66, textAlign: "center" }}>{a.type}</span>
                    <span style={{ flex: 1, color: T.text, fontFamily: "monospace", fontSize: 10 }}>{a.message}</span>
                    <span style={{ color: T.muted, fontSize: 9 }}>{timeAgo(a.since, now)}</span>
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

/* ══════════════════════════════════════════════════════════════════════════════
   Main component
   ══════════════════════════════════════════════════════════════════════════════ */

export default function LiveStatusView({ liveAlarms = [], nodeSnapshots = {}, pollerConnected, crs = [], onSelectChange }) {
  const { nodes: inventoryNodes } = useNodes();

  // Alarm expand per node
  const [expanded, setExpanded] = useState({});
  // Section collapse state
  const [collapsed, setCollapsed] = useState({});
  // Filters
  const [search, setSearch] = useState("");
  const [sevFilter, setSevFilter] = useState("ALL");
  const [layerFilter, setLayerFilter] = useState("ALL");
  const [showHealthy, setShowHealthy] = useState(false);
  // Time tick
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  /* ── Hierarchical data pipeline ── */
  const { countryGroups, globalCounts } = useMemo(() => {
    // O(1) lookup for node metadata
    const metaMap = Object.fromEntries(inventoryNodes.map(n => [n.id, n]));

    // Union of nodes with snapshots ∪ nodes with open alarms
    const nodeIds = new Set([
      ...Object.keys(nodeSnapshots),
      ...liveAlarms.filter(a => a.status !== "RESOLVED").map(a => a.nodeId),
    ]);

    // Build per-node records
    const allNodes = [...nodeIds].map(id => {
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
      const nodeMeta = metaMap[id];
      return {
        node: id, snap, alarms, activeChanges, health,
        label: deriveIncidentLabel(snap, alarms),
        nodeMeta,
        startedAt: alarms.length > 0
          ? alarms.reduce((min, a) => (!min || new Date(a.since) < new Date(min)) ? a.since : min, null)
          : null,
      };
    });

    // Global counts (before filtering)
    const globalCounts = { DOWN: 0, DEGRADED: 0, WARNING: 0, HEALTHY: 0, total: allNodes.length };
    for (const n of allNodes) globalCounts[n.health]++;

    // Apply filters
    let filtered = allNodes;
    if (sevFilter !== "ALL") filtered = filtered.filter(n => n.health === sevFilter);
    if (layerFilter !== "ALL") filtered = filtered.filter(n => n.nodeMeta?.layer === layerFilter);
    if (!showHealthy) filtered = filtered.filter(n => n.health !== "HEALTHY");
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(n =>
        n.node.toLowerCase().includes(q) ||
        (n.nodeMeta?.vendor || "").toLowerCase().includes(q) ||
        (n.nodeMeta?.hwModel || "").toLowerCase().includes(q) ||
        (n.nodeMeta?.layer || "").toLowerCase().includes(q) ||
        n.alarms.some(a => (a.message || "").toLowerCase().includes(q))
      );
    }

    // Sort nodes
    const sortNodes = (a, b) =>
      HEALTH[b.health].rank - HEALTH[a.health].rank ||
      b.alarms.length - a.alarms.length ||
      (new Date(a.startedAt || 0) - new Date(b.startedAt || 0));
    filtered.sort(sortNodes);

    // Group: country → site → nodes
    const countryMap = {};
    for (const n of filtered) {
      const cc = n.nodeMeta?.country || "??";
      const siteId = n.nodeMeta?.siteId || "unknown";
      if (!countryMap[cc]) countryMap[cc] = { sites: {} };
      if (!countryMap[cc].sites[siteId]) countryMap[cc].sites[siteId] = [];
      countryMap[cc].sites[siteId].push(n);
    }

    // Also count ALL nodes per country/site for "X of Y" display
    const totalByCountry = {};
    const totalBySite = {};
    for (const n of allNodes) {
      const cc = n.nodeMeta?.country || "??";
      const sid = n.nodeMeta?.siteId || "unknown";
      totalByCountry[cc] = (totalByCountry[cc] || 0) + 1;
      totalBySite[sid] = (totalBySite[sid] || 0) + 1;
    }

    // Build structured groups
    const countryGroups = Object.entries(countryMap).map(([cc, { sites }]) => {
      const siteGroups = Object.entries(sites).map(([siteId, nodes]) => {
        const healthCounts = { DOWN: 0, DEGRADED: 0, WARNING: 0, HEALTHY: 0 };
        let alarmCount = 0;
        for (const n of nodes) { healthCounts[n.health]++; alarmCount += n.alarms.length; }
        return {
          siteId,
          siteMeta: SITE_MAP[siteId],
          nodes,
          healthCounts,
          alarmCount,
          worst: worstOf(healthCounts),
          totalNodes: totalBySite[siteId] || nodes.length,
        };
      }).sort((a, b) => HEALTH[b.worst].rank - HEALTH[a.worst].rank || b.alarmCount - a.alarmCount);

      const healthCounts = { DOWN: 0, DEGRADED: 0, WARNING: 0, HEALTHY: 0 };
      let alarmCount = 0;
      for (const sg of siteGroups) {
        for (const k of HEALTH_KEYS) healthCounts[k] += sg.healthCounts[k];
        alarmCount += sg.alarmCount;
      }

      return {
        country: cc,
        meta: COUNTRY_META[cc] || { name: cc, flag: "" },
        siteGroups,
        healthCounts,
        alarmCount,
        worst: worstOf(healthCounts),
        affectedNodes: siteGroups.reduce((s, sg) => s + sg.nodes.length, 0),
        totalNodes: totalByCountry[cc] || 0,
        affectedSites: siteGroups.length,
      };
    }).sort((a, b) => HEALTH[b.worst].rank - HEALTH[a.worst].rank || b.alarmCount - a.alarmCount);

    return { countryGroups, globalCounts };
  }, [liveAlarms, nodeSnapshots, crs, inventoryNodes, sevFilter, layerFilter, showHealthy, search]);

  const toggleNode = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleSection = id => setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));

  const expandAll = useCallback(() => setCollapsed({}), []);
  const collapseAll = useCallback(() => {
    const c = {};
    for (const cg of countryGroups) {
      c[cg.country] = true;
      for (const sg of cg.siteGroups) c[sg.siteId] = true;
    }
    setCollapsed(c);
  }, [countryGroups]);

  const hasIncidents = countryGroups.length > 0;
  const totalFiltered = countryGroups.reduce((s, cg) => s + cg.affectedNodes, 0);

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", background: T.bg }}>
      {/* ─── Header ─── */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: "-0.3px" }}>Live Network Status</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Real-time fleet health derived from poller snapshots and open alarms.</div>
        </div>
        <div style={{
          marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 8,
          background: pollerConnected ? "#dcfce7" : "#fef2f2",
          border: `1px solid ${pollerConnected ? "#86efac" : "#fca5a5"}`,
          color: pollerConnected ? "#15803d" : "#b91c1c", fontSize: 11, fontWeight: 700,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: pollerConnected ? "#22c55e" : "#ef4444", boxShadow: pollerConnected ? "0 0 0 3px rgba(34,197,94,0.3)" : "none" }} />
          {pollerConnected ? "LIVE · Poller connected" : "STATIC · No poller"}
        </div>
      </div>

      {/* ─── Counter cards (clickable as filter) ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        {HEALTH_KEYS.map(k => {
          const h = HEALTH[k];
          const v = globalCounts[k];
          const active = sevFilter === k;
          return (
            <div key={k} onClick={() => setSevFilter(sevFilter === k ? "ALL" : k)}
              style={{
                background: active ? h.bg : T.surface,
                border: `1px solid ${active ? h.dot : v > 0 ? h.border : T.border}`,
                borderTop: `3px solid ${h.dot}`,
                borderRadius: 10, padding: "14px 18px", cursor: "pointer",
                opacity: v === 0 && k !== "HEALTHY" ? 0.55 : 1,
                transition: "background 0.15s, border 0.15s",
              }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ fontSize: 38, fontWeight: 800, color: h.color, fontFamily: "monospace", lineHeight: 1 }}>{v}</div>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: h.dot, marginTop: 6, boxShadow: v > 0 ? `0 0 0 3px ${h.bg}` : "none" }} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, letterSpacing: "0.6px", marginTop: 6 }}>{k}</div>
            </div>
          );
        })}
      </div>

      {/* ─── Filter bar ─── */}
      <FilterBar
        sevFilter={sevFilter} setSevFilter={setSevFilter}
        layerFilter={layerFilter} setLayerFilter={setLayerFilter}
        search={search} setSearch={setSearch}
        showHealthy={showHealthy} setShowHealthy={setShowHealthy}
        onExpandAll={expandAll} onCollapseAll={collapseAll}
      />

      {/* ─── Nominal state ─── */}
      {!hasIncidents && (
        <div style={{
          background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10,
          padding: "30px 20px", textAlign: "center", color: "#15803d", fontSize: 14, fontWeight: 700,
        }}>
          ✓ All systems nominal — {globalCounts.HEALTHY} node{globalCounts.HEALTHY !== 1 ? "s" : ""} reporting healthy
        </div>
      )}

      {/* ─── Country sections ─── */}
      {countryGroups.map(cg => {
        const isCollapsed = !!collapsed[cg.country];
        const worst = HEALTH[cg.worst];
        return (
          <div key={cg.country} style={{ marginBottom: 16 }}>
            {/* Country header */}
            <button onClick={() => toggleSection(cg.country)}
              style={{
                display: "flex", alignItems: "center", gap: 12, width: "100%",
                padding: "12px 16px", borderRadius: 10,
                background: T.surface, border: `1px solid ${T.border}`,
                borderLeft: `4px solid ${worst.dot}`,
                cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
              }}>
              <span style={{ fontSize: 12, color: T.muted, transition: "transform 0.15s", transform: isCollapsed ? "rotate(0)" : "rotate(90deg)" }}>▶</span>
              <span style={{ fontSize: 20, lineHeight: 1 }}>{cg.meta.flag}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{cg.meta.name}</div>
                <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
                  {cg.affectedSites} site{cg.affectedSites !== 1 ? "s" : ""} affected · {cg.alarmCount} alarm{cg.alarmCount !== 1 ? "s" : ""} · {cg.affectedNodes} of {cg.totalNodes} nodes
                </div>
              </div>
              <HealthBar counts={cg.healthCounts} />
              <span style={{
                fontSize: 10, fontWeight: 800, color: worst.color, background: worst.bg,
                border: `1px solid ${worst.border}`, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.4px", flexShrink: 0,
              }}>{cg.worst}</span>
            </button>

            {/* Sites within country */}
            {!isCollapsed && (
              <div style={{ marginLeft: 16, marginTop: 8 }}>
                {cg.siteGroups.map(sg => {
                  const siteCollapsed = !!collapsed[sg.siteId];
                  const sw = HEALTH[sg.worst];
                  const siteMeta = sg.siteMeta;
                  return (
                    <div key={sg.siteId} style={{ marginBottom: 10 }}>
                      {/* Site header */}
                      <button onClick={() => toggleSection(sg.siteId)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, width: "100%",
                          padding: "8px 14px", borderRadius: 8,
                          background: T.surface, border: `1px solid ${T.border}`,
                          borderLeft: `3px solid ${sw.dot}`,
                          cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                        }}>
                        <span style={{ fontSize: 10, color: T.muted, transition: "transform 0.15s", transform: siteCollapsed ? "rotate(0)" : "rotate(90deg)" }}>▶</span>
                        <span style={{ fontSize: 14, lineHeight: 1 }}>{SITE_TYPE_ICONS[siteMeta?.type] || "📍"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                            {siteMeta?.name || sg.siteId}
                            {siteMeta?.city && <span style={{ fontWeight: 400, color: T.muted }}> · {siteMeta.city}</span>}
                          </div>
                          <div style={{ fontSize: 10, color: T.muted }}>
                            {sg.nodes.length} of {sg.totalNodes} nodes · {sg.alarmCount} alarm{sg.alarmCount !== 1 ? "s" : ""}
                            {sg.healthCounts.DOWN > 0 && <span style={{ color: "#dc2626", fontWeight: 700 }}> · {sg.healthCounts.DOWN} DOWN</span>}
                            {sg.healthCounts.DEGRADED > 0 && <span style={{ color: "#b45309", fontWeight: 700 }}> · {sg.healthCounts.DEGRADED} DEGRADED</span>}
                          </div>
                        </div>
                        <DotStrip nodes={sg.nodes} />
                      </button>

                      {/* Node cards within site */}
                      {!siteCollapsed && (
                        <div style={{ marginLeft: 20, marginTop: 6 }}>
                          {sg.nodes.map(inc => (
                            <IncidentCard
                              key={inc.node}
                              incident={inc}
                              expanded={!!expanded[inc.node]}
                              onToggle={() => toggleNode(inc.node)}
                              onOpenChange={onSelectChange}
                              now={now}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
