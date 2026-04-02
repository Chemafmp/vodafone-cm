import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { T, STATUS_META, RISK_C } from "../data/constants.js";
import { SITES, COUNTRY_META, SERVICES } from "../data/inventory/index.js";
import { LAYER_COLORS } from "../data/inventory/sites.js";
import { PEAK_PERIODS } from "../data/seed.js";
import { useNodes } from "../context/NodesContext.jsx";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const FONT = "'Inter',system-ui,sans-serif";
const LEFT_W = 240;

const ZOOM_CFG = {
  day:  { daysBack: 7, daysFwd: 14, slotsPerDay: 1,  colW: 54, slotLabel: d => d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}) },
  "12h": { daysBack: 3, daysFwd: 7,  slotsPerDay: 2,  colW: 44, slotLabel: (d,s) => s===0?"00-12":"12-24" },
  "6h":  { daysBack: 1, daysFwd: 4,  slotsPerDay: 4,  colW: 38, slotLabel: (d,s) => `${String(s*6).padStart(2,"0")}-${String((s+1)*6).padStart(2,"0")}` },
  "3h":  { daysBack: 1, daysFwd: 2,  slotsPerDay: 8,  colW: 32, slotLabel: (d,s) => `${String(s*3).padStart(2,"0")}-${String((s+1)*3).padStart(2,"0")}` },
};
const COUNTRY_ROW_H = 32;
const SITE_ROW_H = 28;
const DEVICE_ROW_H = 26;

const SITE_ICONS = { DC: "\u{1F3E2}", "Core PoP": "\u{1F4E1}", IXP: "\u{1F517}", APoP: "\u{1F4E1}", BPoP: "\u{1F4E1}" };

const COUNTRIES_FILTER = [
  { code: "ALL", label: "All Countries" },
  { code: "FJ", label: COUNTRY_META.FJ?.name || "Fiji" },
  { code: "HW", label: COUNTRY_META.HW?.name || "Hawaii" },
  { code: "IB", label: COUNTRY_META.IB?.name || "Ibiza" },
];
const STATUSES = ["All", "Draft", "Preflight", "Pending Approval", "Scheduled", "In Execution", "Completed", "Failed", "Rolled Back", "Aborted"];
const RISKS = ["All", "Low", "Medium", "High", "Critical"];

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function buildSlots(zoomKey) {
  const cfg = ZOOM_CFG[zoomKey];
  const slots = [];
  const now = new Date();
  for (let i = -cfg.daysBack; i <= cfg.daysFwd; i++) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + i);
    for (let s = 0; s < cfg.slotsPerDay; s++) {
      const slotStart = new Date(d.getTime() + s * (24 / cfg.slotsPerDay) * 3600000);
      const slotEnd = new Date(slotStart.getTime() + (24 / cfg.slotsPerDay) * 3600000);
      const isToday = i === 0;
      const dayLabel = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
      const dayOfWeek = d.toLocaleDateString("en-US", { weekday: "short" });
      slots.push({
        date: d, slotStart, slotEnd, slotIdx: s, offset: i,
        label: cfg.slotsPerDay === 1 ? dayLabel : cfg.slotLabel(d, s),
        dayLabel, dayOfWeek, isToday, isPast: i < 0,
        isWeekend: d.getDay() === 0 || d.getDay() === 6,
        isFirstSlot: s === 0,
      });
    }
  }
  return slots;
}

function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// ─── FILTER SELECT ───────────────────────────────────────────────────────────
function FilterSelect({ label, value, onChange, options }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          fontFamily: FONT, fontSize: 11, padding: "3px 6px", borderRadius: 5,
          border: `1px solid ${T.border}`, background: T.surface, color: T.text,
          cursor: "pointer", outline: "none", minWidth: 70,
        }}
      >
        {options.map(o => {
          const val = typeof o === "string" ? o : o.code || o.value;
          const lab = typeof o === "string" ? o : o.label || o.name;
          return <option key={val} value={val}>{lab}</option>;
        })}
      </select>
    </div>
  );
}

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
function Tooltip({ change, x, y }) {
  if (!change) return null;
  const sm = STATUS_META[change.status] || { dot: "#94a3b8", bg: "#f1f5f9", text: "#475569" };
  return (
    <div style={{
      position: "fixed", left: x + 12, top: y - 8, zIndex: 9999,
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
      padding: "10px 14px", minWidth: 220, maxWidth: 320,
      boxShadow: T.shadowMd, fontFamily: FONT, pointerEvents: "none",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>{change.name || "Untitled"}</div>
      <div style={{ fontSize: 10, color: T.muted, marginBottom: 6 }}>{change.id}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 10, marginBottom: 4 }}>
        <span style={{ padding: "1px 6px", borderRadius: 4, background: sm.bg, color: sm.text, fontWeight: 600 }}>{change.status}</span>
        <span style={{ padding: "1px 6px", borderRadius: 4, background: "#f1f5f9", color: RISK_C[change.risk] || T.muted, fontWeight: 600 }}>{change.risk}</span>
        {change.category && <span style={{ padding: "1px 6px", borderRadius: 4, background: "#f5f3ff", color: "#5b21b6", fontWeight: 600 }}>{change.category}</span>}
      </div>
      {change.team && <div style={{ fontSize: 10, color: T.muted }}>Team: {change.team}</div>}
      {change.scheduledFor && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>Start: {new Date(change.scheduledFor).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
      {change.scheduledEnd && <div style={{ fontSize: 10, color: T.muted }}>End: {new Date(change.scheduledEnd).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
      {change.freezePeriod && <div style={{ fontSize: 10, color: T.freeze, fontWeight: 600, marginTop: 2 }}>Freeze period change</div>}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function TimelineView({ changes, onSelect }) {
  const { nodes } = useNodes();
  const [country, setCountry] = useState("ALL");
  const [status, setStatus] = useState("All");
  const [risk, setRisk] = useState("All");
  const [showAll, setShowAll] = useState(false);
  const [zoom, setZoom] = useState("day");
  const [tooltip, setTooltip] = useState(null);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [expanded, setExpanded] = useState(() => {
    const init = {};
    Object.keys(COUNTRY_META).forEach(c => { init[c] = true; });
    SITES.forEach(s => { init[s.id] = true; });
    return init;
  });

  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const ganttRef = useRef(null);
  const [rubberBand, setRubberBand] = useState(null); // { startX, currentX }
  const rbRef = useRef(null); // for mousemove/mouseup

  // ── Slots & timing (must be before callbacks that use totalMs) ──
  const cfg = ZOOM_CFG[zoom];
  const slots = useMemo(() => buildSlots(zoom), [zoom]);
  const DAY_W = cfg.colW;
  const rangeStart = slots[0].slotStart;
  const rangeEndMs = slots[slots.length - 1].slotEnd;
  const totalMs = rangeEndMs.getTime() - rangeStart.getTime();

  // ── Wheel zoom on gantt area ──
  const ZOOM_KEYS = Object.keys(ZOOM_CFG); // ["day","12h","6h","3h"]
  useEffect(() => {
    const el = ganttRef.current;
    if (!el) return;
    const handler = (e) => {
      if (!e.ctrlKey && !e.metaKey) return; // only zoom with ctrl/cmd + wheel
      e.preventDefault();
      setZoom(prev => {
        const idx = ZOOM_KEYS.indexOf(prev);
        if (e.deltaY < 0) return ZOOM_KEYS[Math.min(idx + 1, ZOOM_KEYS.length - 1)]; // zoom in
        return ZOOM_KEYS[Math.max(idx - 1, 0)]; // zoom out
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // ── Rubber-band zoom: mousedown/move/up on gantt ──
  const handleGanttMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    const rect = ganttRef.current?.getBoundingClientRect();
    if (!rect) return;
    const startX = e.clientX - rect.left;
    rbRef.current = { startX, currentX: startX };
    setRubberBand({ startX, currentX: startX });

    const onMove = (me) => {
      const cx = me.clientX - rect.left;
      rbRef.current = { ...rbRef.current, currentX: cx };
      setRubberBand(prev => prev ? { ...prev, currentX: cx } : null);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const rb = rbRef.current;
      if (!rb) { setRubberBand(null); return; }
      const dx = Math.abs(rb.currentX - rb.startX);
      if (dx < 15) { setRubberBand(null); return; } // too small, ignore
      const scrollLeft = ganttRef.current?.scrollLeft || 0;
      const pxLeft = Math.min(rb.startX, rb.currentX) + scrollLeft;
      const pxRight = Math.max(rb.startX, rb.currentX) + scrollLeft;
      const gridW = ganttRef.current?.scrollWidth || 1;
      const fracLeft = pxLeft / gridW;
      const fracRight = pxRight / gridW;
      const selMs = (fracRight - fracLeft) * totalMs;
      const selDays = selMs / 86400000;
      let bestZoom = "day";
      if (selDays <= 2) bestZoom = "3h";
      else if (selDays <= 5) bestZoom = "6h";
      else if (selDays <= 10) bestZoom = "12h";
      setZoom(bestZoom);
      setRubberBand(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [totalMs]);

  // ── Filter changes ──
  const filtered = useMemo(() => {
    return changes.filter(c => {
      if (c.isTemplate) return false;
      if (country !== "ALL" && c.country !== country) return false;
      if (status !== "All" && c.status !== status) return false;
      if (risk !== "All" && c.risk !== risk) return false;
      return true;
    });
  }, [changes, country, status, risk]);

  // ── Build node map ──
  const nodeMap = useMemo(() => {
    const m = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  // ── Build site map ──
  const siteMap = useMemo(() => {
    const m = {};
    for (const s of SITES) m[s.id] = s;
    return m;
  }, []);

  // ── Map changes to devices/countries ──
  // deviceChanges: nodeId -> [change, ...]
  // countryChanges: countryCode -> [change, ...] (for changes with no device mapping)
  const { deviceChanges, countryChanges } = useMemo(() => {
    const dc = {};
    const cc = {};
    for (const c of filtered) {
      const devIds = c.affectedDeviceIds;
      if (devIds && devIds.length > 0) {
        for (const did of devIds) {
          if (!dc[did]) dc[did] = [];
          dc[did].push(c);
        }
      } else if (c.country) {
        if (!cc[c.country]) cc[c.country] = [];
        cc[c.country].push(c);
      }
    }
    return { deviceChanges: dc, countryChanges: cc };
  }, [filtered]);

  // ── Build hierarchy: Country > Site > Device ──
  // Only show items with changes unless showAll is on
  const hierarchy = useMemo(() => {
    const devicesWithChanges = new Set(Object.keys(deviceChanges));
    const countriesWithChanges = new Set(Object.keys(countryChanges));

    // Group nodes by site
    const nodeBySite = {};
    for (const n of nodes) {
      if (!n.siteId) continue;
      if (!nodeBySite[n.siteId]) nodeBySite[n.siteId] = [];
      nodeBySite[n.siteId].push(n);
    }

    const countryCodes = Object.keys(COUNTRY_META);
    if (country !== "ALL") {
      const idx = countryCodes.indexOf(country);
      if (idx === -1) return [];
      return buildCountryTree(country);
    }
    return countryCodes.flatMap(cc => buildCountryTree(cc));

    function buildCountryTree(cc) {
      const sites = SITES.filter(s => s.country === cc);
      const siteEntries = [];

      for (const site of sites) {
        const siteNodes = (nodeBySite[site.id] || []).sort((a, b) => a.id.localeCompare(b.id));
        const deviceEntries = [];

        for (const node of siteNodes) {
          const hasChanges = devicesWithChanges.has(node.id);
          if (!showAll && !hasChanges) continue;
          deviceEntries.push({ type: "device", node, hasChanges });
        }

        if (!showAll && deviceEntries.length === 0) continue;
        siteEntries.push({ type: "site", site, devices: deviceEntries });
      }

      const countryHasGeneralChanges = countriesWithChanges.has(cc);
      if (!showAll && siteEntries.length === 0 && !countryHasGeneralChanges) return [];

      const totalChanges = (countryChanges[cc] || []).length +
        siteEntries.reduce((sum, se) => sum + se.devices.reduce((ds, de) => ds + (deviceChanges[de.node.id] || []).length, 0), 0);

      return [{ type: "country", code: cc, meta: COUNTRY_META[cc], sites: siteEntries, totalChanges, hasGeneralChanges: countryHasGeneralChanges }];
    }
  }, [nodes, deviceChanges, countryChanges, showAll, country]);

  // ── Build flat row list from hierarchy ──
  const rows = useMemo(() => {
    const r = [];
    for (const cEntry of hierarchy) {
      r.push({ kind: "country", code: cEntry.code, meta: cEntry.meta, totalChanges: cEntry.totalChanges, hasGeneralChanges: cEntry.hasGeneralChanges });
      if (!expanded[cEntry.code]) continue;
      for (const sEntry of cEntry.sites) {
        r.push({ kind: "site", site: sEntry.site, deviceCount: sEntry.devices.length });
        if (!expanded[sEntry.site.id]) continue;
        for (const dEntry of sEntry.devices) {
          r.push({ kind: "device", node: dEntry.node, hasChanges: dEntry.hasChanges });
        }
      }
    }
    return r;
  }, [hierarchy, expanded]);

  // ── Freeze bands ──
  const freezeBands = useMemo(() => {
    return PEAK_PERIODS.map(p => {
      const s = new Date(p.start + "T00:00:00");
      const e = new Date(p.end + "T23:59:59");
      if (e < rangeStart || s > rangeEndMs) return null;
      const cs = s < rangeStart ? rangeStart : s;
      const ce = e > rangeEndMs ? rangeEndMs : e;
      const leftPct = ((cs.getTime() - rangeStart.getTime()) / totalMs) * 100;
      const widthPct = ((ce.getTime() - cs.getTime()) / totalMs) * 100;
      return { ...p, leftPct, widthPct };
    }).filter(Boolean);
  }, [rangeStart, rangeEndMs, totalMs]);

  // ── Heatmap: changes per slot ──
  const changeCounts = useMemo(() => {
    return slots.map(slot => {
      let count = 0;
      for (const c of filtered) {
        const start = parseDate(c.scheduledFor);
        const end = parseDate(c.scheduledEnd) || (start ? new Date(start.getTime() + 3600000) : null);
        if (!start) continue;
        if (start < slot.slotEnd && end > slot.slotStart) count++;
      }
      return count;
    });
  }, [slots, filtered]);
  const maxCount = Math.max(1, ...changeCounts);

  // ── Bar position ──
  const getBar = useCallback((c) => {
    const start = parseDate(c.scheduledFor);
    if (!start) return null;
    const defaultDur = zoom === "day" ? 86400000 : 3600000; // 1 day for day view, 1h for hourly
    const end = parseDate(c.scheduledEnd) || new Date(start.getTime() + defaultDur);
    const cs = start < rangeStart ? rangeStart : start;
    const ce = end > rangeEndMs ? rangeEndMs : end;
    if (cs >= ce) return null;
    const leftPct = ((cs.getTime() - rangeStart.getTime()) / totalMs) * 100;
    const minW = zoom === "day" ? 1.2 : 0.5;
    const widthPct = Math.max(((ce.getTime() - cs.getTime()) / totalMs) * 100, minW);
    return { leftPct, widthPct };
  }, [rangeStart, rangeEndMs, totalMs, zoom]);

  const handleBarHover = useCallback((e, c) => {
    setTooltip({ change: c, x: e.clientX, y: e.clientY });
  }, []);
  const handleBarLeave = useCallback(() => { setTooltip(null); }, []);

  const toggleExpand = useCallback((key) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Sync scroll
  const onLeftScroll = useCallback(() => {
    if (rightRef.current && leftRef.current) {
      rightRef.current.scrollTop = leftRef.current.scrollTop;
    }
  }, []);
  const onRightScroll = useCallback(() => {
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
    }
  }, []);

  const gridW = slots.length * DAY_W;

  function rowHeight(row) {
    if (row.kind === "country") return COUNTRY_ROW_H;
    if (row.kind === "site") return SITE_ROW_H;
    return DEVICE_ROW_H;
  }

  // ── Get changes for a specific row ──
  function getRowChanges(row) {
    if (row.kind === "device") return deviceChanges[row.node.id] || [];
    if (row.kind === "country") return countryChanges[row.code] || [];
    return [];
  }

  const statusDot = (st) => {
    const colors = { UP: "#22c55e", DEGRADED: "#f59e0b", DOWN: "#ef4444", MAINTENANCE: "#3b82f6" };
    return colors[st] || "#94a3b8";
  };

  return (
    <div style={{ fontFamily: FONT, display: "flex", flexDirection: "column", height: "100%", minHeight: 0, flex: 1 }}>

      {/* ── FILTER BAR ── */}
      <div style={{
        display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap",
        padding: "8px 12px", borderBottom: `1px solid ${T.border}`, background: T.bg,
      }}>
        <FilterSelect label="Country" value={country} onChange={setCountry} options={COUNTRIES_FILTER} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUSES} />
        <FilterSelect label="Risk" value={risk} onChange={setRisk} options={RISKS} />

        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: T.muted, cursor: "pointer", marginLeft: 8 }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)}
            style={{ width: 13, height: 13, cursor: "pointer" }} />
          Show all devices
        </label>

        <div style={{ display: "flex", gap: 2, marginLeft: 8 }}>
          {Object.keys(ZOOM_CFG).map(z => (
            <button key={z} onClick={() => setZoom(z)} style={{
              padding: "3px 8px", fontSize: 9, borderRadius: 4, fontWeight: 600, cursor: "pointer",
              border: `1px solid ${zoom === z ? T.primary : T.border}`,
              background: zoom === z ? T.primary : "transparent",
              color: zoom === z ? "#fff" : T.muted, fontFamily: "inherit",
            }}>{z}</button>
          ))}
        </div>

        <div style={{ marginLeft: "auto", fontSize: 11, color: T.muted, fontWeight: 600 }}>
          {filtered.length} change{filtered.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* ── MAIN GANTT AREA ── */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* ── LEFT PANEL ── */}
        <div style={{ width: LEFT_W, minWidth: LEFT_W, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: `1px solid ${T.border}`, background: T.surface }}>
          {/* Header */}
          <div style={{
            height: 52, borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "flex-end", padding: "0 12px 6px",
            fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.5px",
            background: T.bg, flexShrink: 0,
          }}>
            Network Elements
          </div>
          {/* Heatmap label */}
          <div style={{
            height: 24, borderBottom: `1px solid ${T.border}`,
            display: "flex", alignItems: "center", padding: "0 12px",
            fontSize: 9, fontWeight: 600, color: T.muted, textTransform: "uppercase", background: T.bg, flexShrink: 0,
          }}>
            Density
          </div>
          {/* Scrollable rows */}
          <div ref={leftRef} onScroll={onLeftScroll}
            style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {rows.map((row, i) => {
              const h = rowHeight(row);
              const isHov = hoveredRow === (row.kind === "device" ? row.node.id : row.kind === "site" ? row.site.id : row.code);
              const rowKey = row.kind === "device" ? row.node.id : row.kind === "site" ? row.site.id : row.code;

              if (row.kind === "country") {
                const isExp = expanded[row.code] !== false;
                return (
                  <div key={rowKey}
                    onMouseEnter={() => setHoveredRow(rowKey)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={() => toggleExpand(row.code)}
                    style={{
                      height: h, display: "flex", alignItems: "center", gap: 6, padding: "0 8px",
                      cursor: "pointer", background: isHov ? "#e2e8f0" : "#f1f5f9",
                      borderBottom: `1px solid ${T.border}`, fontWeight: 700, fontSize: 11,
                    }}>
                    <span style={{ fontSize: 9, color: T.muted, width: 12, textAlign: "center" }}>{isExp ? "\u25BC" : "\u25B6"}</span>
                    <span>{row.meta?.flag || ""}</span>
                    <span style={{ color: T.text, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {row.meta?.name || row.code}
                    </span>
                    {row.totalChanges > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, color: T.primary, background: T.primaryBg, padding: "1px 5px", borderRadius: 8 }}>
                        {row.totalChanges}
                      </span>
                    )}
                  </div>
                );
              }

              if (row.kind === "site") {
                const isExp = expanded[row.site.id] !== false;
                const icon = SITE_ICONS[row.site.type] || "\u{1F3E2}";
                return (
                  <div key={rowKey}
                    onMouseEnter={() => setHoveredRow(rowKey)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={() => toggleExpand(row.site.id)}
                    style={{
                      height: h, display: "flex", alignItems: "center", gap: 5, padding: "0 8px 0 22px",
                      cursor: "pointer", background: isHov ? "#eef2ff" : T.surface,
                      borderBottom: `1px solid ${T.border}40`, fontSize: 10,
                    }}>
                    <span style={{ fontSize: 8, color: T.muted, width: 10, textAlign: "center" }}>{isExp ? "\u25BC" : "\u25B6"}</span>
                    <span style={{ fontSize: 11 }}>{icon}</span>
                    <span style={{ color: T.text, fontWeight: 600, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                      {row.site.name}
                    </span>
                    <span style={{ fontSize: 9, color: T.light }}>{row.deviceCount}</span>
                  </div>
                );
              }

              // device
              const lc = LAYER_COLORS[row.node.layer] || T.muted;
              return (
                <div key={rowKey}
                  onMouseEnter={() => setHoveredRow(rowKey)}
                  onMouseLeave={() => setHoveredRow(null)}
                  style={{
                    height: h, display: "flex", alignItems: "center", gap: 5, padding: "0 8px 0 40px",
                    background: isHov ? "#f0f9ff" : (i % 2 === 0 ? T.surface : T.bg),
                    borderBottom: `1px solid ${T.border}20`, fontSize: 10,
                  }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusDot(row.node.status), flexShrink: 0 }} />
                  <span style={{ fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 9, color: T.text, fontWeight: 500, flex: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {row.node.id}
                  </span>
                  <span style={{ fontSize: 8, color: lc, fontWeight: 600, flexShrink: 0, maxWidth: 50, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                    {row.node.layer}
                  </span>
                </div>
              );
            })}
            {rows.length === 0 && (
              <div style={{ padding: 20, textAlign: "center", fontSize: 11, color: T.light }}>
                No devices match filters
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL (Gantt) ── */}
        <div ref={ganttRef} onMouseDown={handleGanttMouseDown}
          style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", cursor: "crosshair" }}>
          {/* Slot headers — fixed */}
          <div style={{ display: "flex", height: 52, borderBottom: `1px solid ${T.border}`, background: T.bg, flexShrink: 0, overflowX: "hidden" }}>
            <div style={{ display: "flex", minWidth: gridW }}>
              {slots.map((d, si) => (
                <div key={si} style={{
                  width: DAY_W, minWidth: DAY_W, flexShrink: 0,
                  borderLeft: `1px solid ${d.isFirstSlot ? T.border : T.border + "60"}`,
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", paddingBottom: 4,
                  background: d.isToday ? "#eff6ff" : d.isWeekend ? "#f8fafc" : "transparent",
                }}>
                  {d.isFirstSlot && <span style={{ fontSize: 9, color: d.isToday ? T.primary : T.light, fontWeight: 500 }}>{d.dayOfWeek}</span>}
                  <span style={{ fontSize: cfg.slotsPerDay > 1 ? 8 : 11, fontWeight: d.isToday ? 800 : 600, color: d.isToday ? T.primary : d.isPast ? T.light : T.muted }}>
                    {d.isFirstSlot && cfg.slotsPerDay > 1 ? d.dayLabel : d.label}
                  </span>
                  {cfg.slotsPerDay > 1 && !d.isFirstSlot && <span style={{ fontSize: 8, color: T.light, fontWeight: 500 }}>{d.label}</span>}
                  {d.isToday && d.isFirstSlot && <span style={{ fontSize: 7, fontWeight: 800, color: T.primary, letterSpacing: "0.5px" }}>TODAY</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Heatmap row — fixed */}
          <div style={{ display: "flex", height: 24, borderBottom: `1px solid ${T.border}`, background: T.bg, flexShrink: 0, overflowX: "hidden" }}>
            <div style={{ display: "flex", minWidth: gridW }}>
              {slots.map((d, i) => {
                const count = changeCounts[i];
                const intensity = count / maxCount;
                const bg = count === 0 ? "transparent" : `rgba(29,78,216,${0.08 + intensity * 0.35})`;
                return (
                  <div key={d.label + "h"} style={{
                    width: DAY_W, minWidth: DAY_W, flexShrink: 0, borderLeft: `1px solid ${T.border}40`,
                    display: "flex", alignItems: "center", justifyContent: "center", background: bg,
                  }}>
                    {count > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: intensity > 0.5 ? "#1e40af" : T.muted }}>{count}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scrollable Gantt rows */}
          <div ref={rightRef} onScroll={onRightScroll}
            style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
            <div style={{ minWidth: gridW, position: "relative" }}>

              {/* Freeze bands */}
              {freezeBands.map(fb => (
                <div key={fb.id} style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: `${fb.leftPct}%`, width: `${fb.widthPct}%`,
                  background: fb.severity === "red" ? "rgba(239,68,68,0.08)" : "rgba(249,115,22,0.08)",
                  borderLeft: `2px solid ${fb.severity === "red" ? "#ef444480" : "#f9731680"}`,
                  borderRight: `2px solid ${fb.severity === "red" ? "#ef444480" : "#f9731680"}`,
                  zIndex: 1, pointerEvents: "none",
                }} title={`${fb.name} (${fb.severity})`} />
              ))}

              {/* Today line */}
              {(() => {
                const now = new Date();
                const todayPct = ((now.getTime() - rangeStart.getTime()) / totalMs) * 100;
                if (todayPct < 0 || todayPct > 100) return null;
                return (
                  <div style={{
                    position: "absolute", top: 0, bottom: 0,
                    left: `${todayPct}%`, width: 2,
                    background: "#ef4444", opacity: 0.5, zIndex: 5, pointerEvents: "none",
                  }} />
                );
              })()}

              {/* Slot column grid lines */}
              {slots.map((d, i) => (
                <div key={i + "gl"} style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: i * DAY_W, width: DAY_W,
                  borderLeft: `1px solid ${d.isFirstSlot ? T.border + "40" : T.border + "18"}`,
                  background: d.isToday ? "rgba(29,78,216,0.03)" : d.isWeekend ? "rgba(0,0,0,0.015)" : "transparent",
                  pointerEvents: "none",
                }} />
              ))}

              {/* Rows with bars */}
              {rows.map((row, idx) => {
                const h = rowHeight(row);
                const rowKey = row.kind === "device" ? row.node.id : row.kind === "site" ? row.site.id : row.code;
                const isHov = hoveredRow === rowKey;
                const rowChanges = getRowChanges(row);
                const barH = Math.round(h * 0.6);
                const barTop = Math.round((h - barH) / 2);

                let bgColor = "transparent";
                if (row.kind === "country") bgColor = isHov ? "#e2e8f0" : "#f1f5f9";
                else if (row.kind === "site") bgColor = isHov ? "#eef2ff" : "transparent";
                else bgColor = isHov ? "#f0f9ff" : (idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.01)");

                return (
                  <div key={rowKey + "-gantt"}
                    onMouseEnter={() => setHoveredRow(rowKey)}
                    onMouseLeave={() => setHoveredRow(null)}
                    style={{
                      height: h, position: "relative",
                      borderBottom: row.kind === "country" ? `1px solid ${T.border}` : `1px solid ${T.border}${row.kind === "site" ? "40" : "20"}`,
                      background: bgColor,
                    }}>
                    {/* Change bars */}
                    {rowChanges.map(c => {
                      const bar = getBar(c);
                      if (!bar) return null;
                      const sm = STATUS_META[c.status] || { dot: "#94a3b8" };
                      return (
                        <div key={c.id}
                          onClick={() => onSelect(c)}
                          onMouseMove={e => handleBarHover(e, c)}
                          onMouseLeave={handleBarLeave}
                          style={{
                            position: "absolute",
                            left: `${bar.leftPct}%`,
                            width: `${bar.widthPct}%`,
                            top: barTop, height: barH,
                            background: `linear-gradient(135deg, ${sm.dot}, ${sm.dot}cc)`,
                            borderRadius: 3, cursor: "pointer",
                            display: "flex", alignItems: "center", paddingLeft: 4,
                            overflow: "hidden", zIndex: 3,
                            boxShadow: isHov ? `0 1px 4px ${sm.dot}40` : "none",
                            transition: "box-shadow .15s",
                          }}>
                          <span style={{
                            fontSize: 8, fontWeight: 700, color: "#fff",
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                          }}>
                            {c.name ? c.name.split("\u2014")[0].trim() : c.id}
                          </span>
                        </div>
                      );
                    })}

                  </div>
                );
              })}

              {rows.length === 0 && (
                <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.light }}>
                  No data to display
                </div>
              )}
            </div>
          </div>

          {/* Rubber-band overlay */}
          {rubberBand && Math.abs(rubberBand.currentX - rubberBand.startX) > 3 && (
            <div style={{
              position: "absolute", top: 0, bottom: 0,
              left: Math.min(rubberBand.startX, rubberBand.currentX),
              width: Math.abs(rubberBand.currentX - rubberBand.startX),
              background: "rgba(37,99,235,0.12)", border: "1px solid rgba(37,99,235,0.4)",
              zIndex: 100, pointerEvents: "none", borderRadius: 2,
            }}>
              <div style={{
                position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                background: "#1d4ed8", color: "#fff", fontSize: 9, fontWeight: 700,
                padding: "2px 8px", borderRadius: 4, whiteSpace: "nowrap",
              }}>
                {Math.abs(rubberBand.currentX - rubberBand.startX) > 30 ? "Release to zoom" : ""}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── TOOLTIP ── */}
      {tooltip && <Tooltip change={tooltip.change} x={tooltip.x} y={tooltip.y} />}

      {/* ── LEGEND ── */}
      <div style={{
        display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap",
        padding: "6px 12px", borderTop: `1px solid ${T.border}`, background: T.bg,
        fontSize: 10, color: T.muted, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", fontSize: 9 }}>Legend:</span>
        {Object.entries(STATUS_META).map(([name, meta]) => (
          <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.dot }} />
            {name}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(239,68,68,0.15)", border: "1px solid #ef444480" }} />
          Red Freeze
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "rgba(249,115,22,0.15)", border: "1px solid #f9731680" }} />
          Orange Freeze
        </span>
        <span style={{ marginLeft: "auto", fontSize: 9, color: T.light }}>Drag to zoom · Ctrl+Scroll to zoom</span>
      </div>
    </div>
  );
}
