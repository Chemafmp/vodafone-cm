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
              { icon: "🔗", title: "BGP Visibility", body: "% of RIPE RIS (Routing Information Service) BGP peers globally that can see Vodafone's IP prefixes. Near 100% is normal. A drop signals prefix withdrawal, route leak, or BGP session failure — meaning parts of the Internet can no longer reach Vodafone customers. This is the earliest warning of a routing incident, often visible before latency degrades." },
              { icon: "🔍", title: "DNS RTT (msm #10001)", body: "Round-trip time for a DNS SOA query to k.root-servers.net, measured from the same Vodafone probes. Unlike the ICMP ping (which tests raw IP reachability), this tests the full DNS query path including Vodafone's local resolver. If DNS RTT >> ICMP RTT, Vodafone's resolver is slow or overloaded — customers experience slow page loads even if the network path is healthy." },
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
// Single combined view — all metrics per probe in one table.
function ProbeBreakdown({ market, onClose }) {
  const probes = market.probeDetails || [];
  const nearby = KROOT_NEARBY[market.id] || [];

  // Sort by avg_rtt ascending (fastest first)
  const sorted = [...probes].sort((a, b) => (a.avg_rtt ?? 999) - (b.avg_rtt ?? 999));

  const allAvg = probes.map(p => p.avg_rtt).filter(Boolean);
  const median = allAvg.length
    ? [...allAvg].sort((a, b) => a - b)[Math.floor(allAvg.length / 2)]
    : null;

  function inferNode(probe) {
    if (!probe.avg_rtt || !nearby.length) return null;
    if (!median || nearby.length < 2) return nearby[0] || null;
    return probe.avg_rtt > median * 1.5 ? nearby[1] : nearby[0];
  }

  const maxRtt = Math.max(...sorted.map(p => p.max_rtt || p.avg_rtt || 0), 1);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 300,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px 16px",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 14, width: "100%", maxWidth: 700,
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
              {market.flag} {market.name} — Per-probe breakdown
            </div>
            <div style={{ fontSize: 11, color: T.muted }}>
              AS{market.asn} · {probes.length} probes · msm #1001 · last 15-min window
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
                gridTemplateColumns: "1fr 200px 52px 52px 120px",
                gap: 8, padding: "4px 10px 6px",
                fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: "0.5px",
              }}>
                <div>PROBE</div>
                <div>LATENCY — min / avg / max</div>
                <div style={{ textAlign: "right" }}>P95</div>
                <div style={{ textAlign: "right" }}>LOSS</div>
                <div>LIKELY K-ROOT</div>
              </div>

              {/* Probe rows */}
              {sorted.map((p, i) => {
                const node    = inferNode(p);
                const isOdd   = p.avg_rtt && median && p.avg_rtt > median * 1.5;
                const hasLoss = p.loss_pct > 0;
                const barColor = isOdd ? "#f59e0b" : "#3b82f6";

                // Bar positions (scale on max_rtt of all probes)
                const pct  = v => v != null ? Math.max(0, Math.min(1, v / maxRtt)) : 0;
                const W = 200;
                const minX  = pct(p.min_rtt) * W;
                const avgX  = pct(p.avg_rtt) * W;
                const maxX  = pct(p.max_rtt) * W;

                return (
                  <div key={p.id} style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 200px 52px 52px 120px",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 10px",
                    background: i % 2 === 0 ? T.bg : T.surface,
                    borderRadius: 7,
                    marginBottom: 3,
                    border: hasLoss ? "1px solid #fca5a5" : "1px solid transparent",
                  }}>

                    {/* Probe identity */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.text,
                        display: "flex", alignItems: "center", gap: 5 }}>
                        {p.description || `Probe #${p.id}`}
                        {hasLoss && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: "#dc2626",
                            background: "#fef2f2", border: "1px solid #fca5a5",
                            borderRadius: 3, padding: "1px 4px" }}>loss!</span>
                        )}
                      </div>
                      <div style={{ fontSize: 9, color: T.muted }}>
                        #{p.id}{p.lat && p.lon && ` · ${p.lat.toFixed(1)}°, ${p.lon.toFixed(1)}°`}
                      </div>
                    </div>

                    {/* Latency bar + min/avg/max text */}
                    <div>
                      {/* SVG bar */}
                      <svg width={W} height={14} style={{ display: "block", overflow: "visible" }}>
                        {/* Track */}
                        <rect x={0} y={5} width={W} height={4} rx={2} fill={T.border} />
                        {/* min–max band */}
                        {p.min_rtt != null && p.max_rtt != null && (
                          <rect x={minX} y={4} width={Math.max(maxX - minX, 2)} height={6}
                            rx={2} fill={barColor} opacity={0.2} />
                        )}
                        {/* avg marker */}
                        <rect x={Math.max(0, avgX - 2)} y={2} width={4} height={10}
                          rx={2} fill={barColor} />
                      </svg>
                      {/* min / avg / max text row */}
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        fontSize: 9, fontFamily: "monospace", marginTop: 2,
                      }}>
                        <span style={{ color: T.muted }}>
                          {p.min_rtt != null ? `${p.min_rtt}ms` : "—"}
                        </span>
                        <span style={{ color: barColor, fontWeight: 700 }}>
                          {p.avg_rtt != null ? `${p.avg_rtt}ms` : "—"}
                        </span>
                        <span style={{ color: T.muted }}>
                          {p.max_rtt != null ? `${p.max_rtt}ms` : "—"}
                        </span>
                      </div>
                    </div>

                    {/* P95 */}
                    <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                      textAlign: "right", color: isOdd ? "#b45309" : "#8b5cf6" }}>
                      {p.p95_rtt != null ? `${p.p95_rtt}ms` : "—"}
                    </div>

                    {/* Loss */}
                    <div style={{ fontFamily: "monospace", fontSize: 11, fontWeight: hasLoss ? 700 : 400,
                      textAlign: "right", color: hasLoss ? "#dc2626" : T.muted }}>
                      {p.loss_pct}%
                    </div>

                    {/* Likely k-root */}
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

              {/* Legend */}
              <div style={{
                marginTop: 10, padding: "9px 14px", background: T.bg,
                border: `1px solid ${T.border}`, borderRadius: 7,
                display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center",
                fontSize: 11, color: T.muted,
              }}>
                <span>
                  <strong style={{ color: T.text }}>Bar:</strong>{" "}
                  shaded band = min–max jitter range · solid marker = avg
                </span>
                <span>
                  <span style={{ color: "#f59e0b", fontWeight: 700 }}>■ amber</span>
                  {" "}= RTT &gt;1.5× median → likely farther k-root node
                </span>
                <a href="https://atlas.ripe.net/measurements/1001/"
                  target="_blank" rel="noreferrer"
                  style={{ color: "#3b82f6", marginLeft: "auto" }}>
                  View on RIPE Atlas →
                </a>
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
  const [probeOpen, setProbeOpen] = useState(false);

  const data = applyZoom(market.history, zoom);
  const bl   = market.baseline_rtt;

  // Per-metric config — 6 charts in 3×2 grid
  const charts = [
    {
      key: "avg_rtt",     label: "Avg Latency",   unit: " ms",   color: "#3b82f6",
      baseline: bl,       warnLevel: bl ? bl * 2 : null,         critLevel: bl ? bl * 4.5 : null,
      dataSource: "main",
    },
    {
      key: "loss_pct",    label: "Packet Loss",   unit: "%",     color: "#ef4444",
      baseline: null,     warnLevel: 1,                           critLevel: 5,
      dataSource: "main",
    },
    {
      key: "bgp_visibility", label: "BGP Visibility", unit: "%", color: "#16a34a",
      baseline: null,     warnLevel: null,                        critLevel: null,
      dataSource: "bgp",
    },
    {
      key: "p95_rtt",     label: "P95 Latency",   unit: " ms",   color: "#8b5cf6",
      baseline: null,     warnLevel: null,                        critLevel: null,
      dataSource: "main",
    },
    {
      key: "dns_rtt",     label: "DNS RTT",        unit: " ms",  color: "#8b5cf6",
      baseline: market.dns?.baseline_rtt ?? null,
      warnLevel: market.dns?.baseline_rtt ? market.dns.baseline_rtt * 2   : null,
      critLevel: market.dns?.baseline_rtt ? market.dns.baseline_rtt * 4.5 : null,
      dataSource: "dns",
    },
    {
      key: "probe_count", label: "Active Probes", unit: "",      color: "#0891b2",
      baseline: null,     warnLevel: null,                        critLevel: null,
      dataSource: "main",
    },
  ];

  // Return the right data array for each chart
  function dataFor(cfg) {
    if (cfg.dataSource === "bgp") {
      return applyZoom(
        (market.bgp?.history || []).map(h => ({ ...h, bgp_visibility: h.visibility_pct })),
        zoom
      );
    }
    if (cfg.dataSource === "dns") {
      return applyZoom(market.dns?.history || [], zoom);
    }
    return data;
  }

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

          {/* Current values row — 3×2 grid */}
          {cur && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3,1fr)",
              gap: 8, marginBottom: 16,
            }}>
              {[
                { label: "AVG RTT",     value: cur.avg_rtt,     unit: " ms", color: "#3b82f6" },
                { label: "P95 RTT",     value: cur.p95_rtt,     unit: " ms", color: "#8b5cf6" },
                { label: "PACKET LOSS", value: cur.loss_pct,    unit: "%",   color: "#ef4444" },
                {
                  label: "BGP VIS",
                  value: market.bgp?.current?.visibility_pct != null
                    ? market.bgp.current.visibility_pct : null,
                  unit: "%",
                  color: market.bgp?.status === "ok"      ? "#16a34a"
                       : market.bgp?.status === "warning" ? "#b45309"
                       : market.bgp?.status === "outage"  ? "#dc2626"
                       : "#9ca3af",
                },
                {
                  label: "DNS RTT",
                  value: market.dns?.current?.dns_rtt != null
                    ? market.dns.current.dns_rtt : null,
                  unit: " ms",
                  color: market.dns?.status === "ok"      ? "#8b5cf6"
                       : market.dns?.status === "warning" ? "#b45309"
                       : market.dns?.status === "outage"  ? "#dc2626"
                       : "#9ca3af",
                },
                { label: "PROBES",      value: cur.probe_count, unit: "",    color: "#0891b2" },
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
                    {m2.value != null
                      ? <>{m2.value}<span style={{ fontSize: 10, fontWeight: 600 }}>{m2.unit}</span></>
                      : <span style={{ fontSize: 14, color: "#9ca3af" }}>—</span>}
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

          {/* 6 metric charts in 3×2 grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "18px 16px",
          }}>
            {charts.map(cfg => (
              <MetricChart
                key={cfg.key}
                data={dataFor(cfg)}
                valueKey={cfg.key}
                label={cfg.label}
                unit={cfg.unit}
                color={cfg.color}
                baseline={cfg.baseline}
                warnLevel={cfg.warnLevel}
                critLevel={cfg.critLevel}
                width={170}
                height={60}
              />
            ))}
          </div>

          {/* Single per-probe button */}
          {market.probeDetails && market.probeDetails.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setProbeOpen(true)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  fontSize: 11, fontWeight: 700,
                  color: "#1d4ed8", background: "#eff6ff",
                  border: "1px solid #bfdbfe", borderRadius: 6,
                  padding: "5px 12px", cursor: "pointer",
                }}
              >
                🔬 Per-probe breakdown — {market.probeDetails.length} probes ↗
              </button>
            </div>
          )}

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
      {probeOpen && (
        <ProbeBreakdown
          market={market}
          onClose={() => setProbeOpen(false)}
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
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          gap: "5px 10px", marginBottom: 10,
        }}>
          {/* Row 1: AVG LATENCY | PACKET LOSS | BGP VISIBLE */}
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>AVG LATENCY</div>
            <div style={{
              fontSize: 18, fontWeight: 800, fontFamily: "monospace", lineHeight: 1.1,
              color: market.status === "ok"     ? "#16a34a"
                : market.status === "warning" ? "#b45309" : "#dc2626",
            }}>
              {cur.avg_rtt}<span style={{ fontSize: 10, fontWeight: 600 }}> ms</span>
            </div>
            {market.baseline_rtt && (
              <div style={{ fontSize: 9, color: T.muted }}>base {market.baseline_rtt} ms</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>PACKET LOSS</div>
            <div style={{
              fontSize: 18, fontWeight: 800, fontFamily: "monospace", lineHeight: 1.1,
              color: cur.loss_pct === 0 ? "#16a34a" : cur.loss_pct < 1 ? "#b45309" : "#dc2626",
            }}>
              {cur.loss_pct}<span style={{ fontSize: 10, fontWeight: 600 }}> %</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>BGP VISIBLE</div>
            <div style={{
              fontSize: 18, fontWeight: 800, fontFamily: "monospace", lineHeight: 1.1,
              color: market.bgp?.current?.visibility_pct != null
                ? (market.bgp.status === "ok"      ? "#16a34a"
                  : market.bgp.status === "warning" ? "#b45309" : "#dc2626")
                : "#9ca3af",
            }}>
              {market.bgp?.current?.visibility_pct != null
                ? <>{market.bgp.current.visibility_pct}<span style={{ fontSize: 10, fontWeight: 600 }}>%</span></>
                : <span style={{ fontSize: 13 }}>—</span>}
            </div>
          </div>
          {/* Row 2: P95 LATENCY | DNS RTT | ACTIVE PROBES */}
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>P95 LATENCY</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: T.text }}>
              {cur.p95_rtt} ms
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>DNS RTT</div>
            <div style={{
              fontSize: 13, fontWeight: 700, fontFamily: "monospace",
              color: market.dns?.current?.dns_rtt != null
                ? (market.dns.status === "ok"      ? "#8b5cf6"
                  : market.dns.status === "warning" ? "#b45309" : "#dc2626")
                : "#9ca3af",
            }}>
              {market.dns?.current?.dns_rtt != null
                ? `${market.dns.current.dns_rtt} ms`
                : "—"}
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
