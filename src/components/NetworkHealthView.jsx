// ─── Network Health View ──────────────────────────────────────────────────────
// RIPE Atlas latency + packet-loss data per Vodafone market.
// Source: GET /api/network-health (polls RIPE Atlas msm #1001 every 5 min)
// Ratio model: ok <2×  warning ≥2×  outage ≥4.5× above 4h rolling baseline

import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../data/constants.js";

function apiBase() {
  const ws = import.meta.env.VITE_POLLER_WS || "ws://localhost:4000";
  if (ws.startsWith("wss://")) return ws.replace(/^wss:\/\//, "https://");
  return ws.replace(/^ws:\/\//, "http://");
}

const STATUS_META = {
  ok:      { label: "OK",      color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
  warning: { label: "WARNING", color: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  outage:  { label: "OUTAGE",  color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  unknown: { label: "NO DATA", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
};
const sm = s => STATUS_META[s] || STATUS_META.unknown;

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch { return ""; }
}

// ─── K-root anycast nodes nearest to each Vodafone market ────────────────────
// Source: RIPE NCC k-root deployment list (https://www.ripe.net/analyse/dns/k-root/)
// Each entry: city where a k-root node is present + the IXP it peers at
const KROOT_NEARBY = {
  es: [{ city: "Madrid",    ix: "ESPANIX" },    { city: "Frankfurt", ix: "DE-CIX" }],
  uk: [{ city: "London",    ix: "LINX / LONAP"},{ city: "Amsterdam", ix: "AMS-IX" }],
  de: [{ city: "Frankfurt", ix: "DE-CIX" },     { city: "Berlin",    ix: "BCIX"   }, { city: "Amsterdam", ix: "AMS-IX" }],
  it: [{ city: "Milan",     ix: "MIX" },        { city: "Rome",      ix: "NaMeX"  }, { city: "Frankfurt", ix: "DE-CIX" }],
  pt: [{ city: "Lisbon",    ix: "GigaPix" },    { city: "Madrid",    ix: "ESPANIX"}],
  nl: [{ city: "Amsterdam", ix: "AMS-IX (primary)" }],
  ie: [{ city: "Dublin",    ix: "INEX" },       { city: "London",    ix: "LINX"   }],
  gr: [{ city: "Athens",    ix: "GR-IX" },      { city: "Frankfurt", ix: "DE-CIX" }],
  tr: [{ city: "Istanbul",  ix: "TREX" },       { city: "Frankfurt", ix: "DE-CIX" }],
};

// ─── Zoom filter ──────────────────────────────────────────────────────────────
// Time-window filter using measured_at timestamps.
// History has up to 432 points (36h at 5min/tick).
const ZOOM_WINDOWS = {
  "10m":  10 * 60 * 1000,
  "30m":  30 * 60 * 1000,
  "1h":    1 * 3600 * 1000,
  "6h":    6 * 3600 * 1000,
  "12h":  12 * 3600 * 1000,
  "24h":  24 * 3600 * 1000,
  "36h":  36 * 3600 * 1000,
};

function applyZoom(history, zoom) {
  if (!history || !history.length) return history || [];
  if (zoom === "36h") return history;
  const ms = ZOOM_WINDOWS[zoom];
  if (!ms) return history;
  const since = Date.now() - ms;
  const filtered = history.filter(h => new Date(h.measured_at).getTime() >= since);
  return filtered.length >= 1 ? filtered : history.slice(-2);
}

// ─── Interactive chart ────────────────────────────────────────────────────────
// Each of the 4 metric charts in the detail panel.
function MetricChart({
  data,        // filtered history array
  valueKey,    // "avg_rtt" | "p95_rtt" | "loss_pct" | "probe_count"
  label,
  unit,
  color,
  warnLevel,   // optional horizontal warning line
  critLevel,   // optional critical line
  baseline,    // optional baseline ref line (green dashed)
  width = 240,
  height = 72,
}) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const values = data.map(d => d[valueKey]).filter(v => v !== null && v !== undefined);

  const handlePointerMove = useCallback((e) => {
    if (!svgRef.current || !values.length) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const raw = (x / rect.width) * (values.length - 1);
    setHoverIdx(Math.max(0, Math.min(values.length - 1, Math.round(raw))));
  }, [values.length]);

  const handlePointerLeave = useCallback(() => setHoverIdx(null), []);

  if (!values.length) {
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{label}</span>
        </div>
        <div style={{
          width, height,
          display: "flex", alignItems: "center", justifyContent: "center",
          border: `1px dashed ${T.border}`, borderRadius: 5,
          fontSize: 10, color: T.muted,
        }}>
          collecting data…
        </div>
      </div>
    );
  }

  const W = width, H = height;
  const refVals = [
    ...values,
    baseline != null ? baseline : null,
    warnLevel != null ? warnLevel * 1.05 : null,
    critLevel != null ? critLevel * 1.05 : null,
  ].filter(v => v != null);
  const maxVal = Math.max(...refVals) * 1.15;
  const minVal = 0;
  const range  = Math.max(maxVal - minVal, 0.001);

  const toX = i  => values.length === 1 ? W / 2 : (i / (values.length - 1)) * W;
  const toY = v  => H - ((v - minVal) / range) * H;

  const linePts  = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const areaPts  = `${toX(0)},${H} ${linePts} ${toX(values.length - 1)},${H}`;

  const displayVal = hoverIdx !== null ? values[hoverIdx] : values[values.length - 1];
  const displayTime = hoverIdx !== null ? fmtTime(data[hoverIdx]?.measured_at) : null;
  const latestVal  = values[values.length - 1];

  return (
    <div>
      {/* Metric header row */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "baseline",
        marginBottom: 4,
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{label}</span>
        <span style={{ fontSize: 13, fontFamily: "monospace", fontWeight: 800, color }}>
          {displayVal}{unit}
          {displayTime && (
            <span style={{ fontSize: 9, color: T.muted, marginLeft: 5, fontWeight: 400 }}>
              @ {displayTime}
            </span>
          )}
          {!displayTime && (
            <span style={{ fontSize: 9, color: T.muted, marginLeft: 5, fontWeight: 400 }}>
              now
            </span>
          )}
        </span>
      </div>

      {/* SVG chart */}
      <div style={{ position: "relative" }}>
        <svg
          ref={svgRef}
          width={W} height={H}
          style={{ overflow: "visible", cursor: "crosshair", display: "block", userSelect: "none" }}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
        >
          {/* Warn zone */}
          {warnLevel != null && critLevel == null && (
            <rect x={0} y={0} width={W} height={toY(warnLevel)}
              fill="rgba(239,68,68,0.05)" />
          )}
          {warnLevel != null && (
            <rect x={0} y={toY(warnLevel)} width={W}
              height={Math.max(0, H - toY(warnLevel))}
              fill="rgba(34,197,94,0.05)" />
          )}
          {/* Crit zone */}
          {critLevel != null && (
            <rect x={0} y={0} width={W} height={Math.max(0, toY(critLevel))}
              fill="rgba(239,68,68,0.06)" />
          )}
          {/* Area fill */}
          {values.length > 1 && (
            <polygon points={areaPts} fill={`${color}14`} />
          )}
          {/* Baseline */}
          {baseline != null && (
            <line x1={0} y1={toY(baseline)} x2={W} y2={toY(baseline)}
              stroke="#22c55e" strokeWidth={1} strokeDasharray="4,3" opacity={0.7} />
          )}
          {/* Warn line */}
          {warnLevel != null && (
            <line x1={0} y1={toY(warnLevel)} x2={W} y2={toY(warnLevel)}
              stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3" opacity={0.65} />
          )}
          {/* Crit line */}
          {critLevel != null && (
            <line x1={0} y1={toY(critLevel)} x2={W} y2={toY(critLevel)}
              stroke="#ef4444" strokeWidth={1} strokeDasharray="4,3" opacity={0.65} />
          )}
          {/* Trend line */}
          {values.length > 1 && (
            <polyline points={linePts} fill="none" stroke={color} strokeWidth={1.8}
              strokeLinejoin="round" strokeLinecap="round" />
          )}
          {/* Latest dot */}
          <circle cx={toX(values.length - 1)} cy={toY(latestVal)} r={3}
            fill={color} stroke={T.surface} strokeWidth={1.5} />

          {/* Hover crosshair */}
          {hoverIdx !== null && (
            <>
              <line
                x1={toX(hoverIdx)} y1={0} x2={toX(hoverIdx)} y2={H}
                stroke={T.muted} strokeWidth={1} strokeDasharray="2,2" opacity={0.6}
              />
              <circle cx={toX(hoverIdx)} cy={toY(values[hoverIdx])} r={4}
                fill={color} stroke={T.surface} strokeWidth={2}
              />
            </>
          )}

          {/* X-axis time labels */}
          {values.length > 1 && data.length > 0 && (
            <>
              <text x={2} y={H + 11} fontSize={8} fill={T.muted} fontFamily="monospace">
                {fmtTime(data[0]?.measured_at)}
              </text>
              <text x={W} y={H + 11} fontSize={8} fill={T.muted} fontFamily="monospace"
                textAnchor="end">
                {fmtTime(data[data.length - 1]?.measured_at)}
              </text>
            </>
          )}
        </svg>
      </div>
    </div>
  );
}

// ─── Compact sparkline for card (no interaction) ──────────────────────────────
function CardSparkline({ history, baseline, width = 220, height = 32 }) {
  if (!history || history.length < 1) {
    return (
      <div style={{
        width, height,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, color: T.muted,
      }}>
        collecting data…
      </div>
    );
  }
  const values  = history.map(h => h.avg_rtt);
  const warn    = baseline ? baseline * 2   : null;
  const out     = baseline ? baseline * 4.5 : null;
  const maxVal  = Math.max(...values, warn || 0, out || 0) * 1.1;
  const W = width, H = height;
  const toX = i => values.length === 1 ? W / 2 : (i / (values.length - 1)) * W;
  const toY = v => H - (v / Math.max(maxVal, 0.001)) * H;
  const pts = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");

  return (
    <svg width={W} height={H} style={{ overflow: "visible", display: "block" }}>
      {baseline != null && (
        <line x1={0} y1={toY(baseline)} x2={W} y2={toY(baseline)}
          stroke="#22c55e" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
      )}
      {warn != null && (
        <line x1={0} y1={toY(warn)} x2={W} y2={toY(warn)}
          stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,3" opacity={0.45} />
      )}
      {values.length > 1 && (
        <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth={1.5}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      <circle cx={toX(values.length - 1)} cy={toY(values[values.length - 1])} r={2.5}
        fill="#3b82f6" />
    </svg>
  );
}

// ─── Metrics glossary (collapsed by default) ──────────────────────────────────
function MetricsGlossary() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      border: `1px solid ${T.border}`, borderRadius: 10,
      background: T.surface, marginTop: 20, marginBottom: 24,
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "12px 18px",
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10, textAlign: "left",
        }}
      >
        <span style={{ fontSize: 16 }}>ℹ️</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: T.text, flex: 1 }}>
          About these metrics
        </span>
        <span style={{ fontSize: 12, color: T.muted }}>{open ? "▲ collapse" : "▼ expand"}</span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px", borderTop: `1px solid ${T.border}` }}>
          <div style={{
            marginTop: 14, padding: "10px 14px",
            background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, marginBottom: 10,
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#0369a1", marginBottom: 4 }}>
              📡 Target: k.root-servers.net · 193.0.14.129
            </div>
            <div style={{ fontSize: 11, color: "#075985", lineHeight: 1.6 }}>
              One of the 13 global DNS root servers. Operated by <strong>RIPE NCC</strong> — the
              same org that runs RIPE Atlas. Primary node in <strong>Amsterdam</strong>, anycast in
              100+ locations. Because traffic routes to the nearest instance, RTT mainly reflects:
              Vodafone access → backbone → Internet exit. A good proxy for the path from a Vodafone
              customer to the operator&apos;s Internet edge.
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { icon: "⏱️", title: "Avg Latency",   body: "Mean round-trip time across all active probes. Each probe sends 3 ICMP pings every ~4 min to the nearest k-root anycast node. An increase signals congestion inside Vodafone's access, backbone or peering exit." },
              { icon: "📊", title: "P95 Latency",   body: "95th percentile RTT. If avg is 15ms but P95 is 80ms, 1-in-20 pings hit very high latency — users feel it even if the average looks fine. Detects bursty congestion the mean hides." },
              { icon: "📦", title: "Packet Loss",   body: "% of ICMP pings with no reply: (sent−received)/sent×100, aggregated over all probes. 0% is normal. >1% signals degradation. >5% indicates a serious connectivity problem." },
              { icon: "🔬", title: "Active Probes", body: "Physical RIPE Atlas devices inside Vodafone's AS reporting in the last 15 min. A sudden drop may indicate widespread access failure — or just few probes in that country (fewer = lower statistical confidence)." },
            ].map(m => (
              <div key={m.title} style={{
                padding: "9px 11px", background: T.bg,
                border: `1px solid ${T.border}`, borderRadius: 7,
              }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: T.text, marginBottom: 3 }}>
                  {m.icon} {m.title}
                </div>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{m.body}</div>
              </div>
            ))}
          </div>
          <div style={{
            marginTop: 8, padding: "7px 11px",
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7,
            fontSize: 11, color: T.muted,
          }}>
            <strong style={{ color: T.text }}>Chart lines:</strong>{" "}
            <span style={{ color: "#22c55e" }}>green dashed</span> = 4h rolling baseline ·{" "}
            <span style={{ color: "#f59e0b" }}>amber dashed</span> = warning threshold ·{" "}
            <span style={{ color: "#ef4444" }}>red dashed</span> = critical threshold.
            Status: OK &lt;2× · WARNING ≥2× · OUTAGE ≥4.5× above baseline.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Zoom selector ────────────────────────────────────────────────────────────
const ZOOM_OPTIONS = [
  { key: "10m", label: "10m" },
  { key: "30m", label: "30m" },
  { key: "1h",  label: "1h"  },
  { key: "6h",  label: "6h"  },
  { key: "12h", label: "12h" },
  { key: "24h", label: "24h" },
  { key: "36h", label: "36h" },
];

function ZoomSelector({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <span style={{ fontSize: 10, color: T.muted, marginRight: 2 }}>Zoom:</span>
      {ZOOM_OPTIONS.map(z => (
        <button
          key={z.key}
          onClick={() => onChange(z.key)}
          style={{
            padding: "2px 9px", fontSize: 10, fontWeight: 700,
            borderRadius: 5, cursor: "pointer",
            border: `1px solid ${value === z.key ? "#3b82f6" : T.border}`,
            background: value === z.key ? "#eff6ff" : "none",
            color: value === z.key ? "#1d4ed8" : T.muted,
          }}
        >
          {z.label}
        </button>
      ))}
    </div>
  );
}

// ─── Per-probe bar chart row ──────────────────────────────────────────────────
// SVG horizontal bar with min–max range band + avg/p95 marker
function ProbeBar({ value, minVal, maxVal, globalMax, color, isLoss }) {
  const W = 160, H = 20;
  if (!value && value !== 0) return <div style={{ width: W }} />;

  const pct    = v => Math.max(0, Math.min(1, v / Math.max(globalMax, 0.001)));
  const avgX   = pct(value) * W;
  const minX   = minVal != null ? pct(minVal) * W : avgX;
  const maxX   = maxVal != null ? pct(maxVal) * W : avgX;
  const rangeW = Math.max(maxX - minX, 2);

  return (
    <svg width={W} height={H} style={{ overflow: "visible", display: "block" }}>
      {/* Track */}
      <rect x={0} y={8} width={W} height={4} rx={2} fill={T.border} />
      {/* Min–max range band */}
      {rangeW > 2 && (
        <rect x={minX} y={7} width={rangeW} height={6} rx={2}
          fill={color} opacity={0.22} />
      )}
      {/* Avg/P95 marker */}
      <rect x={Math.max(0, avgX - 2)} y={5} width={4} height={10} rx={2}
        fill={color} />
      {/* Value label */}
      <text x={avgX + 6} y={13} fontSize={9} fontFamily="monospace"
        fill={color} fontWeight={700}>
        {isLoss ? `${value}%` : `${value}ms`}
      </text>
    </svg>
  );
}

// ─── Per-probe breakdown modal ────────────────────────────────────────────────
// Opens when user clicks "🔬 per-probe" on Avg Latency, P95 Latency, or Packet Loss.
function ProbeBreakdown({ market, metricKey, onClose }) {
  const probes = market.probeDetails || [];
  const nearby = KROOT_NEARBY[market.id] || [];

  // Pick which value to visualise based on the clicked metric
  const isLoss = metricKey === "loss_pct";
  const valKey = metricKey === "p95_rtt" ? "p95_rtt" : isLoss ? "loss_pct" : "avg_rtt";

  const metaLabel = {
    avg_rtt:  "Avg Latency per probe",
    p95_rtt:  "P95 Latency per probe",
    loss_pct: "Packet Loss per probe",
  }[metricKey] || "Per-probe results";

  // Colour per metric
  const barColor = metricKey === "p95_rtt" ? "#8b5cf6"
                 : metricKey === "loss_pct" ? "#ef4444"
                 : "#3b82f6";

  // Sort probes by the selected metric
  const sorted = [...probes].sort((a, b) => (a[valKey] ?? 999) - (b[valKey] ?? 999));

  // Anycast inference uses avg_rtt regardless of selected metric
  const allAvg = probes.map(p => p.avg_rtt).filter(Boolean);
  const median = allAvg.length
    ? [...allAvg].sort((a, b) => a - b)[Math.floor(allAvg.length / 2)]
    : null;

  function inferNode(probe) {
    if (!probe.avg_rtt || !nearby.length) return null;
    if (!median || nearby.length < 2) return nearby[0] || null;
    return probe.avg_rtt > median * 1.5 ? nearby[1] : nearby[0];
  }

  // Global max for bar scaling
  const globalMax = isLoss
    ? Math.max(...sorted.map(p => p.loss_pct || 0), 5)
    : Math.max(...sorted.map(p => p[valKey] || 0), 1);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px 16px",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 14, width: "100%", maxWidth: 660,
        maxHeight: "88vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          padding: "13px 18px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          background: "#f0f9ff",
        }}>
          <span style={{ fontSize: 20 }}>🔬</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>
              {market.flag} {market.name} — {metaLabel}
            </div>
            <div style={{ fontSize: 11, color: T.muted }}>
              AS{market.asn} · {probes.length} probes · msm #1001 · last 15 min window
            </div>
          </div>
          <button onClick={onClose} style={{
            border: "none", background: "none", cursor: "pointer",
            fontSize: 18, color: T.muted, padding: "2px 6px",
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {probes.length === 0 ? (
            <div style={{ textAlign: "center", color: T.muted, fontSize: 12, padding: 24 }}>
              Per-probe data not yet available. Will appear after the next poll cycle.
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 180px 72px 72px 130px",
                gap: 8, padding: "4px 10px 6px",
                fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: "0.5px",
              }}>
                <div>PROBE</div>
                <div>{metricKey === "loss_pct" ? "LOSS" : "LATENCY (min–avg–max)"}</div>
                <div style={{ textAlign: "right" }}>
                  {metricKey === "p95_rtt" ? "P95" : metricKey === "loss_pct" ? "LOSS" : "AVG"}
                </div>
                <div style={{ textAlign: "right" }}>LOSS</div>
                <div>LIKELY K-ROOT</div>
              </div>

              {/* Probe rows */}
              {sorted.map((p, i) => {
                const node    = inferNode(p);
                const isOdd   = p.avg_rtt && median && p.avg_rtt > median * 1.5;
                const hasLoss = p.loss_pct > 0;
                const dispVal = p[valKey] ?? null;

                return (
                  <div key={p.id} style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 180px 72px 72px 130px",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    background: i % 2 === 0 ? T.bg : T.surface,
                    borderRadius: 7,
                    marginBottom: 3,
                    border: hasLoss ? "1px solid #fca5a5" : `1px solid transparent`,
                  }}>
                    {/* Probe identity */}
                    <div>
                      <div style={{
                        fontSize: 11, fontWeight: 600, color: T.text,
                        display: "flex", alignItems: "center", gap: 5,
                      }}>
                        {p.description || `Probe #${p.id}`}
                        {hasLoss && (
                          <span style={{
                            fontSize: 9, fontWeight: 700, color: "#dc2626",
                            background: "#fef2f2", border: "1px solid #fca5a5",
                            borderRadius: 3, padding: "1px 4px",
                          }}>loss!</span>
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: T.muted }}>
                        #{p.id}
                        {p.lat && p.lon && ` · ${p.lat.toFixed(1)}°, ${p.lon.toFixed(1)}°`}
                      </div>
                    </div>

                    {/* Bar chart */}
                    <ProbeBar
                      value={isLoss ? p.loss_pct : (metricKey === "p95_rtt" ? p.p95_rtt : p.avg_rtt)}
                      minVal={isLoss ? null : p.min_rtt}
                      maxVal={isLoss ? null : p.max_rtt}
                      globalMax={globalMax}
                      color={isOdd ? "#f59e0b" : barColor}
                      isLoss={isLoss}
                    />

                    {/* Primary value */}
                    <div style={{
                      fontFamily: "monospace", fontWeight: 800, fontSize: 13,
                      color: hasLoss && isLoss ? "#dc2626"
                           : isOdd && !isLoss ? "#b45309"
                           : "#16a34a",
                      textAlign: "right",
                    }}>
                      {dispVal != null ? (isLoss ? `${dispVal}%` : `${dispVal}ms`) : "—"}
                    </div>

                    {/* Loss (always shown as context) */}
                    <div style={{
                      fontFamily: "monospace", fontSize: 11, textAlign: "right",
                      color: hasLoss ? "#dc2626" : T.muted,
                    }}>
                      {p.loss_pct}%
                    </div>

                    {/* Likely k-root node */}
                    <div>
                      {node && (
                        <div style={{
                          fontSize: 9, fontWeight: 700,
                          color: isOdd ? "#b45309" : "#16a34a",
                          background: isOdd ? "#fffbeb" : "#f0fdf4",
                          border: `1px solid ${isOdd ? "#fcd34d" : "#86efac"}`,
                          borderRadius: 4, padding: "2px 6px",
                          display: "inline-flex", alignItems: "center", gap: 3,
                        }}>
                          <span>{isOdd ? "↗" : "✓"}</span>
                          <span>{node.city}</span>
                          <span style={{ fontWeight: 400, opacity: 0.75 }}>{node.ix}</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Chart legend */}
              <div style={{
                marginTop: 10, padding: "10px 14px", background: T.bg,
                border: `1px solid ${T.border}`, borderRadius: 7,
              }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: T.text, marginBottom: 8 }}>
                  How to read the bars
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {/* Bar anatomy */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Mini bar example */}
                    <svg width={120} height={20} style={{ flexShrink: 0, overflow: "visible" }}>
                      <rect x={0} y={8} width={120} height={4} rx={2} fill={T.border} />
                      <rect x={20} y={7} width={70} height={6} rx={2} fill="#3b82f6" opacity={0.22} />
                      <rect x={52} y={5} width={4} height={10} rx={2} fill="#3b82f6" />
                      {/* min label */}
                      <line x1={20} y1={4} x2={20} y2={16} stroke="#94a3b8" strokeWidth={1} strokeDasharray="2,1"/>
                      <text x={21} y={3} fontSize={7} fill="#94a3b8">min</text>
                      {/* max label */}
                      <line x1={90} y1={4} x2={90} y2={16} stroke="#94a3b8" strokeWidth={1} strokeDasharray="2,1"/>
                      <text x={91} y={3} fontSize={7} fill="#94a3b8">max</text>
                      {/* avg label */}
                      <text x={57} y={3} fontSize={7} fill="#3b82f6" fontWeight={700}>avg</text>
                    </svg>
                    <span style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>
                      <strong style={{ color: T.text }}>Shaded band</strong> = min–max spread
                      across all pings in the 15-min window (each probe sends ~3 pings every 4 min ≈ 12 samples).
                      A wide band means <em>jitter</em> — latency is inconsistent.
                      The <strong style={{ color: T.text }}>solid marker</strong> is the avg (or P95 when viewing P95).
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.4 }}>
                    <span style={{
                      display: "inline-block", width: 10, height: 10,
                      background: "#f59e0b", borderRadius: 2, marginRight: 5, verticalAlign: "middle",
                    }} />
                    <strong style={{ color: "#b45309" }}>Amber bar</strong> = probe RTT is &gt;1.5× above
                    the market median ({median !== null ? `${Math.round(median)}ms` : "—"}ms) — it likely
                    connects to a farther k-root anycast node
                    {nearby[1] ? ` (e.g. ${nearby[1].city} via ${nearby[1].ix})` : ""}.
                    {" "}<a href="https://atlas.ripe.net/measurements/1001/"
                      target="_blank" rel="noreferrer" style={{ color: "#3b82f6" }}>
                      View on RIPE Atlas →
                    </a>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail panel (modal) ─────────────────────────────────────────────────────
function DetailPanel({ market, onClose }) {
  const meta   = sm(market.status);
  const cur    = market.current;
  const [zoom, setZoom] = useState("6h");
  const [drillMetric, setDrillMetric] = useState(null);

  const data = applyZoom(market.history, zoom);
  const bl   = market.baseline_rtt;

  // Per-metric config
  const charts = [
    {
      key: "avg_rtt",     label: "Avg Latency",   unit: " ms",   color: "#3b82f6",
      baseline: bl,       warnLevel: bl ? bl * 2 : null,         critLevel: bl ? bl * 4.5 : null,
    },
    {
      key: "p95_rtt",     label: "P95 Latency",   unit: " ms",   color: "#8b5cf6",
      baseline: null,     warnLevel: null,                        critLevel: null,
    },
    {
      key: "loss_pct",    label: "Packet Loss",   unit: "%",     color: "#ef4444",
      baseline: null,     warnLevel: 1,                           critLevel: 5,
    },
    {
      key: "probe_count", label: "Active Probes", unit: "",      color: "#0891b2",
      baseline: null,     warnLevel: null,                        critLevel: null,
    },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.45)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px 16px",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        width: "100%", maxWidth: 620,
        maxHeight: "90vh",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        {/* Header */}
        <div style={{
          padding: "13px 18px", borderBottom: `1px solid ${T.border}`,
          background: meta.bg, display: "flex", alignItems: "center", gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 22 }}>{market.flag}</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{market.name}</span>
            <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>
              AS{market.asn} · {market.totalProbes} probes · msm #1001
            </span>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.4px",
            color: meta.color, background: meta.bg,
            border: `1px solid ${meta.border}`,
            borderRadius: 5, padding: "2px 8px",
          }}>
            {meta.label}{market.ratio !== null ? ` · ${market.ratio}×` : ""}
          </span>
          <button onClick={onClose} style={{
            border: "none", background: "none", cursor: "pointer",
            fontSize: 18, color: T.muted, padding: "2px 6px",
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>

          {/* Current values row */}
          {cur && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4,1fr)",
              gap: 8, marginBottom: 16,
            }}>
              {[
                { label: "AVG RTT",      value: cur.avg_rtt,     unit: " ms", color: "#3b82f6" },
                { label: "P95 RTT",      value: cur.p95_rtt,     unit: " ms", color: "#8b5cf6" },
                { label: "PACKET LOSS",  value: cur.loss_pct,    unit: "%",   color: "#ef4444" },
                { label: "PROBES",       value: cur.probe_count, unit: "",    color: "#0891b2" },
              ].map(m2 => (
                <div key={m2.label} style={{
                  padding: "9px 11px", background: T.bg,
                  border: `1px solid ${T.border}`, borderRadius: 7, textAlign: "center",
                }}>
                  <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, marginBottom: 2 }}>
                    {m2.label}
                  </div>
                  <div style={{
                    fontSize: 20, fontWeight: 800, fontFamily: "monospace",
                    color: m2.color, lineHeight: 1,
                  }}>
                    {m2.value}
                    <span style={{ fontSize: 10, fontWeight: 600 }}>{m2.unit}</span>
                  </div>
                  {m2.label === "AVG RTT" && bl && (
                    <div style={{ fontSize: 9, color: T.muted, marginTop: 1 }}>
                      base {bl} ms
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {!cur && (
            <div style={{
              padding: 18, textAlign: "center", color: T.muted, fontSize: 12,
              background: T.bg, borderRadius: 8, border: `1px solid ${T.border}`,
              marginBottom: 16,
            }}>
              {market.error || "First measurement in progress…"}
            </div>
          )}

          {/* Zoom selector */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: 12,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
              Trend — {data.length} point{data.length !== 1 ? "s" : ""} · 5 min interval
            </span>
            <ZoomSelector value={zoom} onChange={setZoom} />
          </div>

          {/* 4 metric charts in 2×2 grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px 20px",
          }}>
            {charts.map(cfg => (
              <div key={cfg.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <MetricChart
                  data={data}
                  valueKey={cfg.key}
                  label={cfg.label}
                  unit={cfg.unit}
                  color={cfg.color}
                  baseline={cfg.baseline}
                  warnLevel={cfg.warnLevel}
                  critLevel={cfg.critLevel}
                  width={268}
                  height={72}
                />
                {market.probeDetails && market.probeDetails.length > 0
                  && cfg.key !== "probe_count" && (
                  <button
                    onClick={() => setDrillMetric(cfg.key)}
                    style={{
                      alignSelf: "flex-end",
                      fontSize: 9, fontWeight: 700,
                      color: "#3b82f6", background: "#eff6ff",
                      border: "1px solid #bfdbfe", borderRadius: 4,
                      padding: "2px 7px", cursor: "pointer",
                      letterSpacing: "0.2px",
                    }}
                  >
                    🔬 per-probe ↗
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Chart legend */}
          <div style={{
            marginTop: 16, padding: "8px 12px",
            background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: 7, display: "flex", gap: 18, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 9, color: "#22c55e" }}>── 4h baseline</span>
            <span style={{ fontSize: 9, color: "#f59e0b" }}>─ ─ warning threshold</span>
            <span style={{ fontSize: 9, color: "#ef4444" }}>─ ─ critical threshold</span>
            <span style={{ fontSize: 9, color: T.muted, marginLeft: "auto" }}>
              hover chart to see value at point in time
            </span>
          </div>

          {/* Probe locations + k-root nodes */}
          <div style={{
            marginTop: 14, display: "grid",
            gridTemplateColumns: "1fr 1fr", gap: 10,
          }}>
            {/* Probe locations */}
            <div style={{
              padding: "10px 12px", background: T.bg,
              border: `1px solid ${T.border}`, borderRadius: 8,
            }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: T.text, marginBottom: 6 }}>
                🔬 Probe locations — AS{market.asn}
              </div>
              {market.probeLocations && market.probeLocations.length > 0 ? (
                <div>
                  {/* Group by non-null descriptions */}
                  {[...new Set(
                    market.probeLocations
                      .map(p => p.description)
                      .filter(Boolean)
                      .slice(0, 8)
                  )].map((desc, i) => (
                    <div key={i} style={{
                      display: "flex", alignItems: "center", gap: 6,
                      fontSize: 11, color: T.muted, marginBottom: 3,
                    }}>
                      <span style={{ color: "#3b82f6", fontSize: 9 }}>●</span>
                      <span style={{ flex: 1 }}>{desc}</span>
                    </div>
                  ))}
                  {market.probeLocations.filter(p => !p.description).length > 0 && (
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>
                      + {market.probeLocations.filter(p => !p.description).length} probes (no description)
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 6 }}>
                    {market.totalProbes} total · {market.current?.probe_count || 0} active now
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 11, color: T.muted }}>Loading probe locations…</div>
              )}
            </div>

            {/* K-root nearest nodes */}
            <div style={{
              padding: "10px 12px", background: T.bg,
              border: `1px solid ${T.border}`, borderRadius: 8,
            }}>
              <div style={{ fontWeight: 700, fontSize: 11, color: T.text, marginBottom: 6 }}>
                🎯 Nearest k-root nodes (193.0.14.129)
              </div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, lineHeight: 1.4 }}>
                Probes route to the closest anycast instance. Likely nodes from {market.name}:
              </div>
              {(KROOT_NEARBY[market.id] || []).map((node, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 11, marginBottom: 3,
                }}>
                  <span style={{ color: "#16a34a", fontSize: 9 }}>●</span>
                  <span style={{ fontWeight: 600, color: T.text }}>{node.city}</span>
                  <span style={{ color: T.muted, fontSize: 10 }}>via {node.ix}</span>
                </div>
              ))}
              <div style={{ fontSize: 10, color: T.muted, marginTop: 6, lineHeight: 1.4 }}>
                RTT reflects Vodafone access + backbone + path to nearest node above.
              </div>
            </div>
          </div>

          {/* Technical footer */}
          <div style={{ marginTop: 10, fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
            msm #1001 · k.root-servers.net 193.0.14.129 · AS{market.asn} · 15-min result window ·{" "}
            <a href="https://atlas.ripe.net/measurements/1001/"
              target="_blank" rel="noreferrer" style={{ color: "#3b82f6" }}>
              View on RIPE Atlas →
            </a>
          </div>
        </div>
      </div>

      {/* Per-probe drill-down modal (renders on top of this panel) */}
      {drillMetric && (
        <ProbeBreakdown
          market={market}
          metricKey={drillMetric}
          onClose={() => setDrillMetric(null)}
        />
      )}
    </div>
  );
}

// ─── Market card ──────────────────────────────────────────────────────────────
function MarketCard({ market, onClick }) {
  const meta = sm(market.status);
  const cur  = market.current;

  return (
    <div
      onClick={onClick}
      style={{
        background: T.surface,
        border: `1.5px solid ${market.ok ? meta.border : T.border}`,
        borderTop: `3px solid ${market.ok ? meta.color : T.border}`,
        borderRadius: 10, padding: "13px 15px 10px",
        cursor: "pointer", transition: "box-shadow 0.15s, transform 0.1s",
        display: "flex", flexDirection: "column",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.transform = "";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{market.flag}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{market.name}</div>
          <div style={{ fontSize: 9, color: T.muted }}>AS{market.asn}</div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.4px",
          color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
          borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap",
        }}>
          {meta.label}{market.ratio !== null && market.ok ? ` ${market.ratio}×` : ""}
        </span>
      </div>

      {/* Metrics */}
      {cur ? (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "5px 12px", marginBottom: 10,
        }}>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>AVG LATENCY</div>
            <div style={{
              fontSize: 20, fontWeight: 800, fontFamily: "monospace", lineHeight: 1.1,
              color: market.status === "ok"     ? "#16a34a"
                : market.status === "warning" ? "#b45309" : "#dc2626",
            }}>
              {cur.avg_rtt}<span style={{ fontSize: 11, fontWeight: 600 }}> ms</span>
            </div>
            {market.baseline_rtt && (
              <div style={{ fontSize: 9, color: T.muted }}>base {market.baseline_rtt} ms</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>PACKET LOSS</div>
            <div style={{
              fontSize: 20, fontWeight: 800, fontFamily: "monospace", lineHeight: 1.1,
              color: cur.loss_pct === 0 ? "#16a34a" : cur.loss_pct < 1 ? "#b45309" : "#dc2626",
            }}>
              {cur.loss_pct}<span style={{ fontSize: 11, fontWeight: 600 }}> %</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>P95 LATENCY</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: T.text }}>
              {cur.p95_rtt} ms
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>ACTIVE PROBES</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: T.text }}>
              {cur.probe_count}
              <span style={{ fontSize: 9, color: T.muted, fontWeight: 400 }}>
                /{market.totalProbes}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          fontSize: 11, color: T.muted, fontStyle: "italic",
          minHeight: 50, display: "flex", alignItems: "center", marginBottom: 10,
        }}>
          <span style={{ color: "#b45309" }}>
            {market.error ? `⚠ ${market.error}` : "First measurement in progress…"}
          </span>
        </div>
      )}

      {/* Sparkline */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 7 }}>
        <CardSparkline
          history={market.history}
          baseline={market.baseline_rtt}
          width={220}
          height={32}
        />
      </div>
      <div style={{ textAlign: "right", fontSize: 9, color: T.muted, fontWeight: 600, marginTop: 3 }}>
        details →
      </div>
    </div>
  );
}

// ─── Summary bar ──────────────────────────────────────────────────────────────
function SummaryBar({ markets }) {
  const counts = {};
  for (const m of markets) counts[m.status] = (counts[m.status] || 0) + 1;
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
      {[
        { key: "ok",      label: "OK",      color: "#16a34a" },
        { key: "warning", label: "WARNING", color: "#b45309" },
        { key: "outage",  label: "OUTAGE",  color: "#dc2626" },
        { key: "unknown", label: "NO DATA", color: "#9ca3af" },
      ].filter(s => counts[s.key] > 0).map(s => (
        <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{counts[s.key]}</span>
          <span style={{ fontSize: 11, color: T.muted }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function NetworkHealthView() {
  const [markets, setMarkets]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`${apiBase()}/api/network-health`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) { setMarkets(data); setLastRefresh(new Date()); }
      } catch { /* retry on next tick */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load();
    const t = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  function fmtAge(d) {
    if (!d) return "";
    const s = Math.round((Date.now() - d) / 1000);
    if (s < 5)  return "just now";
    if (s < 60) return `${s}s ago`;
    return `${Math.round(s / 60)}m ago`;
  }

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      overflowY: "auto", padding: "20px 24px", background: T.bg,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 20 }}>🌐</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: T.text }}>
                Network Health — RIPE Atlas
              </span>
              {lastRefresh && (
                <span style={{ fontSize: 11, color: T.muted }}>
                  · updated {fmtAge(lastRefresh)}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, maxWidth: 680 }}>
              Real-time network quality from Vodafone operator networks — 9 markets.
              Click any card to see charts, probe locations and k-root nodes.
            </div>
          </div>
          {markets.some(m => m.ok) && (
            <div style={{
              padding: "10px 16px", background: T.surface,
              border: `1px solid ${T.border}`, borderRadius: 8, flexShrink: 0,
            }}>
              <SummaryBar markets={markets} />
            </div>
          )}
        </div>
      </div>

      {loading && (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 10, color: T.muted, fontSize: 13,
        }}>
          <span style={{ fontSize: 18, animation: "spin 1s linear infinite" }}>⟳</span>
          Loading network health data…
        </div>
      )}

      {!loading && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(248px, 1fr))",
          gap: 14,
        }}>
          {markets.map(m => (
            <MarketCard key={m.id} market={m} onClick={() => setSelected(m)} />
          ))}
        </div>
      )}

      {!loading && <MetricsGlossary />}

      {selected && (
        <DetailPanel market={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
