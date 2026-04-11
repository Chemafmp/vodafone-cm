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

function dotColor(status) {
  if (!status || status === "unknown")                   return "#d1d5db";
  if (status === "ok")                                   return "#16a34a";
  if (status === "warn" || status === "warning")         return "#f59e0b";
  if (status === "alert" || status === "outage")         return "#dc2626";
  return "#d1d5db";
}

function scoreColor(score) {
  if (score == null) return "#9ca3af";
  if (score >= 90)   return "#16a34a";
  if (score >= 70)   return "#b45309";
  if (score >= 40)   return "#d97706";
  return "#dc2626";
}

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
              { icon: "🔗", title: "BGP Visibility", body: null, bgpEntry: true },
              { icon: "🔏", title: "RPKI Coverage", body: "Route Origin Authorization (ROA) coverage. RPKI lets Vodafone cryptographically sign 'I own these prefixes from this ASN'. If a rogue network announces Vodafone's IPs (BGP hijack), other routers with RPKI enabled will reject it. Coverage % = valid ROAs / sampled prefixes. <80% = meaningful hijack exposure. Near 100% = well-protected." },
              { icon: "📋", title: "Announced Prefixes", body: "Number of IPv4 and IPv6 route blocks Vodafone announces to the global BGP table. v4 prefixes = CIDR blocks of IPv4 address space. A sudden drop (e.g. 42 → 5 prefixes) is a major incident signal — even if BGP visibility stays at 329/329, affected customers on missing prefix blocks would lose connectivity." },
              { icon: "↔️", title: "AS Path Length", body: "Average number of Autonomous System hops it takes to reach Vodafone from RIPE's BGP route collectors worldwide. 3–4 hops is typical for a Tier-2 ISP. If it jumps (e.g. 3.4 → 6.1), traffic is being rerouted through longer paths — could indicate a peering failure or route leak forcing traffic through suboptimal routes." },
              { icon: "🔍", title: "DNS RTT (msm #10001)", body: "Round-trip time for a DNS SOA query to k.root-servers.net, measured from the same Vodafone probes. Unlike the ICMP ping (which tests raw IP reachability), this tests the full DNS query path including Vodafone's local resolver. If DNS RTT >> ICMP RTT, Vodafone's resolver is slow or overloaded — customers experience slow page loads even if the network path is healthy." },
              { icon: "🌐", title: "CAIDA IODA", body: "Internet Outage Detection and Analysis (IODA) monitors Internet outages using three independent signals: BGP prefix withdrawals, active probing (UCSD Network Telescope), and Merit Network Telescope (darknet traffic). When multiple IODA datasources agree on an anomaly, confidence of an outage is high. IODA monitors Vodafone by ASN — an active IODA event alongside BGP/Atlas degradation is a strong corroboration of an actual outage. Free service by CAIDA (UC San Diego)." },
              { icon: "🔄", title: "RIS Live (BGP stream)", body: "RIPE Routing Information Service Live streams real-time BGP UPDATE messages from ~30 global route collectors (RRCs) peered with hundreds of ASes. We filter for Vodafone ASNs in the AS path. Because one real withdrawal propagates through many collectors and peers as separate messages, we deduplicate by (prefix, 60s time bucket) — so one logical withdrawal counts once, and a later re-withdrawal (>60s later) counts as a new flap event. Thresholds: ≥3 unique withdrawals/1h = WARNING · ≥10 unique withdrawals/1h = ALERT. A spike in withdrawals without corresponding ANNOUNCE events suggests route instability or partial outage." },
              { icon: "☁️", title: "Cloudflare Radar", body: "Cloudflare has visibility into ~20% of global Internet traffic and actively monitors BGP events. We query two endpoints per Vodafone ASN: BGP hijack events (another AS announcing Vodafone prefixes without authorisation) and route leak events (Vodafone prefixes appearing in unexpected AS paths). Requires a Cloudflare Radar API token (CF_RADAR_TOKEN). An active hijack alert combined with RPKI INVALID prefixes is a critical incident signal." },
              { icon: "📊", title: "Correlation Score", body: "A 0–100 composite health score computed from all signal layers per market. Starts at 100 and deducts points per layer: Atlas outage −35, BGP outage −25, IODA alert −20, RIS alert −20, Radar alert −10. Extra cross-penalties apply when layers agree: Atlas+BGP (−10), Atlas+IODA (−10), BGP+RIS (−5), 3+ layers (−10). Score ≥90 = OK · ≥70 = Degraded · ≥40 = Warning · <40 = Incident. Lower score = higher confidence that something real is happening." },
            ].map(m => (
              <div key={m.title} style={{
                padding: "9px 11px", background: T.bg,
                border: `1px solid ${T.border}`, borderRadius: 7,
              }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: T.text, marginBottom: 3 }}>
                  {m.icon} {m.title}
                </div>
                {m.bgpEntry ? (
                  <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.55 }}>
                    <p style={{ margin: "0 0 6px" }}>
                      RIPE NCC runs <strong style={{ color: T.text }}>~329 BGP observers</strong> distributed worldwide.
                      Every few minutes each observer checks: <em>"can I route traffic to this Vodafone AS?"</em>
                      The value shows <strong style={{ color: T.text }}>how many can / total</strong>.
                    </p>
                    <p style={{ margin: "0 0 6px" }}>
                      Each country is measured <strong style={{ color: T.text }}>independently by ASN</strong>,
                      so an incident in Spain doesn't affect the reading for Germany.
                    </p>
                    {/* Examples */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, margin: "8px 0" }}>
                      <div style={{
                        background: "#f0fdf4", border: "1px solid #86efac",
                        borderRadius: 6, padding: "6px 9px",
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 10, color: "#16a34a", marginBottom: 2 }}>✓ Normal — 329/329 🇪🇸</div>
                        <div style={{ fontSize: 10, color: "#166534" }}>
                          All 329 observers can reach Vodafone Spain. This is the expected state.
                          The number should stay at 329/329 unless there's an incident.
                        </div>
                      </div>
                      <div style={{
                        background: "#fef2f2", border: "1px solid #fca5a5",
                        borderRadius: 6, padding: "6px 9px",
                      }}>
                        <div style={{ fontWeight: 700, fontSize: 10, color: "#dc2626", marginBottom: 2 }}>✗ Incident — 200/329 🇪🇸 · 329/329 🇩🇪</div>
                        <div style={{ fontSize: 10, color: "#991b1b" }}>
                          129 observers worldwide can no longer route to Vodafone Spain's AS — but Germany is fine.
                          Problem is Spain-specific: likely a BGP prefix withdrawal, upstream session failure,
                          or route leak. Customers on those 129 networks can't reach Vodafone Spain.
                        </div>
                      </div>
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 10 }}>
                      Thresholds: <strong style={{ color: "#16a34a" }}>OK ≥95%</strong> ·{" "}
                      <strong style={{ color: "#b45309" }}>WARNING ≥80%</strong> ·{" "}
                      <strong style={{ color: "#dc2626" }}>OUTAGE &lt;80%</strong> peers seeing this AS.
                    </p>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{m.body}</div>
                )}
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
            Status: OK &lt;2× · WARNING ≥2× · OUTAGE ≥4.5× above baseline.{" "}
            <strong style={{ color: T.text }}>Signal dots:</strong>{" "}
            <span style={{ color: "#16a34a" }}>●</span> OK ·{" "}
            <span style={{ color: "#f59e0b" }}>●</span> Warning ·{" "}
            <span style={{ color: "#dc2626" }}>●</span> Alert · grey = no data.
            Score 0–100 aggregates all 5 layers.
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
  const [prefixOpen, setPrefixOpen] = useState(false);
  const [rpkiOpen,   setRpkiOpen]   = useState(false);

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
              {/* BGP market summary */}
              {market.bgp?.current && (
                <div style={{
                  marginBottom: 12, padding: "10px 14px",
                  background: "#f0fdf4", border: "1px solid #86efac",
                  borderRadius: 8, display: "flex", flexWrap: "wrap", gap: 14,
                  alignItems: "center",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>🔗</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#16a34a", letterSpacing: "0.4px" }}>
                        BGP VISIBILITY — MARKET LEVEL
                      </div>
                      <div style={{ fontSize: 11, color: "#166534" }}>
                        {market.bgp.current.ris_peers_seeing != null
                          ? `${market.bgp.current.ris_peers_seeing} / ${market.bgp.current.total_ris_peers} RIS peers see AS${market.asn}`
                          : `${market.bgp.current.visibility_pct}% visible`}
                        {market.bgp.current.announced_prefixes > 0 &&
                          ` · ${market.bgp.current.announced_prefixes} prefixes announced`}
                      </div>
                    </div>
                  </div>
                  {/* Extended BGP metrics */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, flex: 1 }}>
                    {market.bgp?.prefixes && (
                      <div
                        onClick={market.bgp.prefixes.v4_list ? () => setPrefixOpen(true) : undefined}
                        style={{
                          minWidth: 100, cursor: market.bgp.prefixes.v4_list ? "pointer" : "default",
                          borderBottom: market.bgp.prefixes.v4_list ? "1px dashed #86efac" : "none",
                        }}
                      >
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", letterSpacing: "0.4px" }}>
                          PREFIXES {market.bgp.prefixes.v4_list && <span style={{ fontSize: 8 }}>↗</span>}
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", fontFamily: "monospace" }}>
                          v4 {market.bgp.prefixes.v4_count} · v6 {market.bgp.prefixes.v6_count}
                        </div>
                        <div style={{ fontSize: 9, color: "#166534", opacity: 0.75 }}>announced routes</div>
                      </div>
                    )}
                    {market.bgp?.rpki && (
                      <div
                        onClick={() => setRpkiOpen(true)}
                        style={{
                          minWidth: 100, cursor: "pointer",
                          borderBottom: "1px dashed #86efac",
                        }}
                      >
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", letterSpacing: "0.4px" }}>
                          RPKI COVERAGE <span style={{ fontSize: 8 }}>↗</span>
                        </div>
                        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace",
                          color: (market.bgp.rpki.coverage_pct ?? 0) >= 80 ? "#166534" : "#dc2626" }}>
                          {market.bgp.rpki.coverage_pct != null ? `${market.bgp.rpki.coverage_pct}%` : "—"}
                        </div>
                        <div style={{ fontSize: 9, color: "#166534", opacity: 0.75 }}>
                          {market.bgp.rpki.valid}✓ {market.bgp.rpki.invalid}✗ {market.bgp.rpki.unknown}? of {market.bgp.rpki.sampled} sampled
                        </div>
                      </div>
                    )}
                    {market.bgp?.pathLength && (
                      <div style={{ minWidth: 100 }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", letterSpacing: "0.4px" }}>AS PATH LENGTH</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#166534", fontFamily: "monospace" }}>
                          avg {market.bgp.pathLength.avg}
                        </div>
                        <div style={{ fontSize: 9, color: "#166534", opacity: 0.75 }}>
                          min {market.bgp.pathLength.min} · max {market.bgp.pathLength.max} · {market.bgp.pathLength.rrc_count} RRCs
                        </div>
                      </div>
                    )}
                    {!market.bgp?.prefixes && !market.bgp?.rpki && !market.bgp?.pathLength && (
                      <div style={{ fontSize: 10, color: "#166534", opacity: 0.8, fontStyle: "italic" }}>
                        RIPE RIS external observers checking if the Internet can reach Vodafone&apos;s AS.
                        ~100% is normal. A drop = routing incident visible to all of Internet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Column headers */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 180px 50px 50px 60px 80px",
                gap: 8, padding: "4px 10px 6px",
                fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: "0.5px",
              }}>
                <div>PROBE</div>
                <div>LATENCY (ICMP) — min / avg / max</div>
                <div style={{ textAlign: "right" }}>P95</div>
                <div style={{ textAlign: "right" }}>LOSS</div>
                <div style={{ textAlign: "right" }}>DNS RTT</div>
                <div>K-ROOT</div>
              </div>

              {/* Probe rows */}
              {sorted.map((p, i) => {
                const node    = inferNode(p);
                const isOdd   = p.avg_rtt && median && p.avg_rtt > median * 1.5;
                const dnsProbe = (market.dns?.probeDetails || []).find(d => d.id === p.id);
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
                    gridTemplateColumns: "1fr 180px 50px 50px 60px 80px",
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

                    {/* DNS RTT */}
                    <div style={{
                      fontFamily: "monospace", fontSize: 11, fontWeight: 600,
                      textAlign: "right",
                      color: dnsProbe?.avg_dns_rtt != null
                        ? (dnsProbe.avg_dns_rtt > (p.avg_rtt || 0) * 2 ? "#b45309" : "#8b5cf6")
                        : "#9ca3af",
                    }}>
                      {dnsProbe?.avg_dns_rtt != null ? `${dnsProbe.avg_dns_rtt}ms` : "—"}
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
                <span>
                  <span style={{ color: "#8b5cf6", fontWeight: 700 }}>■ purple</span>
                  {" "}= DNS RTT (msm #10001) · orange = DNS RTT &gt;2× ICMP latency
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
      {prefixOpen && (
        <PrefixListModal market={market} onClose={() => setPrefixOpen(false)} />
      )}
      {rpkiOpen && (
        <RpkiDetailModal market={market} onClose={() => setRpkiOpen(false)} />
      )}
    </div>
  );
}

// ─── Prefix list modal ────────────────────────────────────────────────────────
function PrefixListModal({ market, onClose }) {
  const pfx     = market.bgp?.prefixes;
  const log     = market.bgp?.prefixChangeLog || [];
  const [tab, setTab] = useState("v4"); // "v4" | "v6" | "history"

  const list = tab === "v4" ? (pfx?.v4_list || []) : (pfx?.v6_list || []);

  // Sort log newest first
  const sortedLog = [...log].sort((a, b) => b.ts - a.ts);

  function fmtTs(ts) {
    const d = new Date(ts);
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  }

  const tabBtn = (key, label, badge) => (
    <button onClick={() => setTab(key)} style={{
      padding: "5px 12px", borderRadius: 6, border: "1px solid",
      fontSize: 11, fontWeight: 700, cursor: "pointer",
      background: tab === key ? T.text : "transparent",
      color: tab === key ? T.surface : T.muted,
      borderColor: tab === key ? T.text : T.border,
      display: "flex", alignItems: "center", gap: 5,
    }}>
      {label}
      {badge != null && (
        <span style={{ opacity: 0.7, fontWeight: 400 }}>({badge})</span>
      )}
    </button>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px 16px",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 14, width: "100%", maxWidth: 580,
        maxHeight: "85vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          padding: "13px 18px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          background: "#f0f9ff",
        }}>
          <span style={{ fontSize: 20 }}>📋</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>
              {market.flag} {market.name} — Announced Prefixes
            </div>
            <div style={{ fontSize: 11, color: T.muted }}>
              AS{market.asn} · {(pfx?.v4_count ?? 0) + (pfx?.v6_count ?? 0)} total routes · RIPE Stat announced-prefixes
            </div>
          </div>
          <button onClick={onClose} style={{
            border: "none", background: "none", cursor: "pointer",
            fontSize: 18, color: T.muted, padding: "2px 6px",
          }}>✕</button>
        </div>

        {!pfx ? (
          <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 12 }}>
            Full prefix list pending… (available after first extended poll ~30 min after backend start)
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div style={{ padding: "10px 18px 0", display: "flex", gap: 6, flexShrink: 0 }}>
              {tabBtn("v4", "IPv4", pfx.v4_count)}
              {tabBtn("v6", "IPv6", pfx.v6_count)}
              <button onClick={() => setTab("history")} style={{
                padding: "5px 12px", borderRadius: 6, border: "1px solid",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: tab === "history" ? (sortedLog.length ? "#fef3c7" : T.text) : "transparent",
                color: tab === "history" ? (sortedLog.length ? "#b45309" : T.surface) : (sortedLog.length ? "#b45309" : T.muted),
                borderColor: tab === "history" ? (sortedLog.length ? "#fcd34d" : T.text) : (sortedLog.length ? "#fcd34d" : T.border),
              }}>
                History 36h {sortedLog.length > 0 ? "⚠" : ""}
                <span style={{ opacity: 0.7, fontWeight: 400 }}> ({sortedLog.length} change{sortedLog.length !== 1 ? "s" : ""})</span>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "10px 18px 18px" }}>
              {tab !== "history" ? (
                list.length === 0 ? (
                  <div style={{ color: T.muted, fontSize: 12, textAlign: "center", padding: 16 }}>
                    No {tab === "v4" ? "IPv4" : "IPv6"} prefixes found.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {list.map(p => (
                      <span key={p} style={{
                        fontSize: 11, fontFamily: "monospace", fontWeight: 600,
                        padding: "3px 8px", borderRadius: 5,
                        background: "#f0f9ff", border: "1px solid #bae6fd",
                        color: "#0369a1",
                      }}>{p}</span>
                    ))}
                  </div>
                )
              ) : (
                sortedLog.length === 0 ? (
                  <div style={{ fontSize: 12, color: T.muted, textAlign: "center", padding: 24 }}>
                    <div style={{ fontSize: 16, marginBottom: 8 }}>✓</div>
                    No prefix changes in the last 36h.
                    <div style={{ fontSize: 10, marginTop: 8 }}>
                      Log updates every ~30 min with extended metrics polls.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {sortedLog.map((entry, i) => {
                      const totalAdded   = (entry.added_v4?.length || 0) + (entry.added_v6?.length || 0);
                      const totalRemoved = (entry.removed_v4?.length || 0) + (entry.removed_v6?.length || 0);
                      return (
                        <div key={i} style={{
                          padding: "10px 12px", borderRadius: 8,
                          border: `1px solid ${T.border}`, background: T.bg,
                        }}>
                          <div style={{
                            display: "flex", alignItems: "center", gap: 8, marginBottom: 8,
                            fontSize: 10, color: T.muted, fontWeight: 600,
                          }}>
                            <span>{fmtTs(entry.ts)}</span>
                            {totalAdded > 0 && (
                              <span style={{ color: "#16a34a", background: "#f0fdf4",
                                border: "1px solid #86efac", borderRadius: 4, padding: "1px 6px" }}>
                                +{totalAdded} announced
                              </span>
                            )}
                            {totalRemoved > 0 && (
                              <span style={{ color: "#dc2626", background: "#fef2f2",
                                border: "1px solid #fca5a5", borderRadius: 4, padding: "1px 6px" }}>
                                −{totalRemoved} withdrawn
                              </span>
                            )}
                          </div>
                          {[...(entry.added_v4 || []), ...(entry.added_v6 || [])].map(p => (
                            <span key={p} style={{
                              display: "inline-block", margin: "2px 3px",
                              fontSize: 10, fontFamily: "monospace", fontWeight: 600,
                              padding: "2px 7px", borderRadius: 4,
                              background: "#f0fdf4", border: "1px solid #86efac", color: "#16a34a",
                            }}>+ {p}</span>
                          ))}
                          {[...(entry.removed_v4 || []), ...(entry.removed_v6 || [])].map(p => (
                            <span key={p} style={{
                              display: "inline-block", margin: "2px 3px",
                              fontSize: 10, fontFamily: "monospace", fontWeight: 600,
                              padding: "2px 7px", borderRadius: 4,
                              background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626",
                            }}>− {p}</span>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── RPKI detail modal ────────────────────────────────────────────────────────
function RpkiDetailModal({ market, onClose }) {
  const rpki    = market.bgp?.rpki;
  const details = rpki?.details || [];

  const STATUS = {
    valid:   { label: "VALID",   color: "#16a34a", bg: "#f0fdf4", border: "#86efac", icon: "✓",
               desc: "ROA match — origin AS + prefix length are correct." },
    invalid: { label: "INVALID", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5", icon: "✗",
               desc: "ROA mismatch — origin AS or length does not match the registered ROA." },
    unknown: { label: "UNKNOWN", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", icon: "?",
               desc: "No ROA found — prefix not covered by RPKI." },
  };

  const grouped = { valid: [], invalid: [], unknown: [] };
  for (const d of details) {
    const key = d.status in grouped ? d.status : "unknown";
    grouped[key].push(d.prefix);
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 400,
      background: "rgba(0,0,0,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px 16px",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 14, width: "100%", maxWidth: 480,
        maxHeight: "85vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
      }}>
        {/* Header */}
        <div style={{
          padding: "13px 18px", borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", gap: 10, flexShrink: 0,
          background: "#f0fdf4",
        }}>
          <span style={{ fontSize: 20 }}>🔐</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>
              {market.flag} {market.name} — RPKI Coverage
            </div>
            <div style={{ fontSize: 11, color: T.muted }}>
              AS{market.asn} · {rpki?.sampled ?? 0} prefixes sampled · RIPE Stat rpki-validation
            </div>
          </div>
          <button onClick={onClose} style={{
            border: "none", background: "none", cursor: "pointer",
            fontSize: 18, color: T.muted, padding: "2px 6px",
          }}>✕</button>
        </div>

        {!rpki ? (
          <div style={{ padding: 24, textAlign: "center", color: T.muted, fontSize: 12 }}>
            RPKI data pending… (available after first extended poll)
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
            {/* Coverage % hero */}
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <div style={{
                fontSize: 40, fontWeight: 900, fontFamily: "monospace", lineHeight: 1,
                color: rpki.coverage_pct >= 90 ? "#16a34a" : rpki.coverage_pct >= 60 ? "#b45309" : "#dc2626",
              }}>
                {rpki.coverage_pct}<span style={{ fontSize: 20 }}>%</span>
              </div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                RPKI coverage · {rpki.sampled} prefixes sampled
              </div>
            </div>

            {/* Grouped sections */}
            {details.length === 0 ? (
              <div style={{ fontSize: 12, color: T.muted, textAlign: "center" }}>
                Per-prefix detail not available (older data format)
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {["valid", "invalid", "unknown"].map(key => {
                  const s = STATUS[key];
                  const prefixes = grouped[key];
                  if (prefixes.length === 0) return null;
                  return (
                    <div key={key} style={{
                      borderRadius: 8, border: `1px solid ${s.border}`,
                      background: s.bg, overflow: "hidden",
                    }}>
                      {/* Section header */}
                      <div style={{
                        padding: "7px 12px", borderBottom: `1px solid ${s.border}`,
                        display: "flex", alignItems: "center", gap: 8,
                      }}>
                        <span style={{ fontSize: 14, color: s.color, fontWeight: 800 }}>{s.icon}</span>
                        <span style={{ fontSize: 11, fontWeight: 800, color: s.color }}>{s.label}</span>
                        <span style={{
                          marginLeft: "auto", fontSize: 16, fontWeight: 900,
                          fontFamily: "monospace", color: s.color,
                        }}>{prefixes.length}</span>
                      </div>
                      {/* Description */}
                      <div style={{ fontSize: 9, color: s.color, padding: "4px 12px 6px", opacity: 0.8 }}>
                        {s.desc}
                      </div>
                      {/* Prefix pills */}
                      <div style={{ padding: "0 12px 10px", display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {prefixes.map(p => (
                          <span key={p} style={{
                            fontSize: 11, fontFamily: "monospace", fontWeight: 600,
                            padding: "3px 8px", borderRadius: 5,
                            background: T.surface, border: `1px solid ${s.border}`,
                            color: s.color,
                          }}>{p}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{
              marginTop: 14, padding: "8px 10px", background: T.bg,
              border: `1px solid ${T.border}`, borderRadius: 6,
              fontSize: 10, color: T.muted, lineHeight: 1.5,
            }}>
              💡 Sample of first 10 IPv4 prefixes announced by AS{market.asn}.
              RPKI-valid = origin AS + prefix length match a registered ROA.
              Invalid = mismatch. Unknown = no ROA exists.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Correlation score zoom helper ────────────────────────────────────────────
// correlationHistory rows use `measured_at` (ISO string), same as other histories.
function applyZoomCorr(history, zoom) {
  if (!history || !history.length) return history || [];
  if (zoom === "36h") return history;
  const ms = ZOOM_WINDOWS[zoom];
  if (!ms) return history;
  const since = Date.now() - ms;
  const filtered = history.filter(h => new Date(h.measured_at).getTime() >= since);
  return filtered.length >= 1 ? filtered : history.slice(-2);
}

// ─── Correlation score sparkline chart ────────────────────────────────────────
function CorrelationScoreChart({ history, width = 540, height = 64 }) {
  const [hoverIdx, setHoverIdx] = useState(null);
  const svgRef = useRef(null);

  const values = history.map(h => h.score).filter(v => v != null);
  if (values.length < 2) return null;

  const W = width, H = height;
  const toX = i => (i / (values.length - 1)) * W;
  const toY = v => H - (v / 100) * H;

  const linePts  = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const areaPts  = `${toX(0)},${H} ${linePts} ${toX(values.length - 1)},${H}`;

  const displayVal  = hoverIdx !== null ? values[hoverIdx] : values[values.length - 1];
  const displayTime = hoverIdx !== null ? fmtTime(history[hoverIdx]?.measured_at) : null;
  const pointColor  = scoreColor(displayVal);

  const handlePointerMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const raw = (x / rect.width) * (values.length - 1);
    setHoverIdx(Math.max(0, Math.min(values.length - 1, Math.round(raw))));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: T.muted }}>100</span>
        <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 800, color: pointColor }}>
          {displayVal}
          {displayTime && <span style={{ fontSize: 9, color: T.muted, marginLeft: 5, fontWeight: 400 }}>@ {displayTime}</span>}
        </span>
        <span style={{ fontSize: 9, color: T.muted }}>0</span>
      </div>
      <svg
        ref={svgRef}
        width={W} height={H}
        style={{ overflow: "visible", cursor: "crosshair", display: "block", userSelect: "none" }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {/* Zone fills */}
        <rect x={0} y={toY(90)} width={W} height={Math.max(0, H - toY(90))} fill="#16a34a10" />
        <rect x={0} y={toY(70)} width={W} height={Math.max(0, toY(90) - toY(70))} fill="#b4530910" />
        <rect x={0} y={toY(40)} width={W} height={Math.max(0, toY(70) - toY(40))} fill="#d9770610" />
        <rect x={0} y={0}       width={W} height={toY(40)}                        fill="#dc262610" />
        {/* Threshold lines */}
        {[{ v: 90, c: "#16a34a" }, { v: 70, c: "#b45309" }, { v: 40, c: "#dc2626" }].map(t => (
          <line key={t.v} x1={0} y1={toY(t.v)} x2={W} y2={toY(t.v)}
            stroke={t.c} strokeWidth={1} strokeDasharray="3,3" opacity={0.4} />
        ))}
        {/* Area + line */}
        <polygon points={areaPts} fill="#3b82f614" />
        <polyline points={linePts} fill="none" stroke="#3b82f6" strokeWidth={1.8}
          strokeLinejoin="round" strokeLinecap="round" />
        {/* Latest dot */}
        <circle cx={toX(values.length - 1)} cy={toY(values[values.length - 1])} r={3}
          fill={scoreColor(values[values.length - 1])} stroke={T.surface} strokeWidth={1.5} />
        {/* Hover */}
        {hoverIdx !== null && (
          <>
            <line x1={toX(hoverIdx)} y1={0} x2={toX(hoverIdx)} y2={H}
              stroke={T.muted} strokeWidth={1} strokeDasharray="2,2" opacity={0.5} />
            <circle cx={toX(hoverIdx)} cy={toY(values[hoverIdx])} r={4}
              fill={scoreColor(values[hoverIdx])} stroke={T.surface} strokeWidth={2} />
          </>
        )}
        {/* X-axis labels */}
        <text x={2} y={H + 11} fontSize={8} fill={T.muted} fontFamily="monospace">
          {fmtTime(history[0]?.measured_at)}
        </text>
        <text x={W} y={H + 11} fontSize={8} fill={T.muted} fontFamily="monospace" textAnchor="end">
          {fmtTime(history[history.length - 1]?.measured_at)}
        </text>
      </svg>
    </div>
  );
}

// ─── Signal Detail Modal ──────────────────────────────────────────────────────
function SignalDetailModal({ signal, market, onClose }) {
  const ris   = market.ris;
  const radar = market.radar;
  const bgp   = market.bgp;
  const ioda  = market.ioda;

  const normStatus = signal.status === "alert" ? "outage"
    : signal.status === "warn" ? "warning"
    : signal.status || "unknown";
  const sc = sm(normStatus);

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", marginBottom: 8, textTransform: "uppercase" }}>{title}</div>
      {children}
    </div>
  );

  const KV = ({ label, value, sub, valueColor }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 11, color: T.muted }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: valueColor || T.text, fontFamily: "monospace" }}>{value}</span>
        {sub && <div style={{ fontSize: 9, color: T.muted }}>{sub}</div>}
      </div>
    </div>
  );

  const ThresholdRow = ({ range, status, meaning }) => {
    const c = status === "ok" ? "#16a34a" : status === "warn" ? "#b45309" : "#dc2626";
    const bg = status === "ok" ? "#f0fdf4" : status === "warn" ? "#fffbeb" : "#fef2f2";
    return (
      <div style={{ display: "flex", gap: 8, padding: "4px 8px", borderRadius: 5, background: bg, marginBottom: 3, alignItems: "center" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: c, fontFamily: "monospace", minWidth: 60 }}>{range}</span>
        <span style={{ fontSize: 9, fontWeight: 700, color: c, textTransform: "uppercase", minWidth: 40 }}>{status}</span>
        <span style={{ fontSize: 10, color: T.text, flex: 1 }}>{meaning}</span>
      </div>
    );
  };

  const EventRow = ({ label, tag, mono }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 5, background: "#fef2f2", border: "1px solid #fca5a5", marginBottom: 3 }}>
      {tag && <span style={{ fontSize: 9, fontWeight: 700, color: "#dc2626", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 3, padding: "1px 5px" }}>{tag}</span>}
      <span style={{ fontSize: 10, fontFamily: mono ? "monospace" : "inherit", color: T.text, wordBreak: "break-all" }}>{label}</span>
    </div>
  );

  function renderContent() {
    if (signal.key === "ris") {
      const wd1h = ris?.withdrawals1h ?? 0;
      const an1h = ris?.announcements1h ?? 0;
      const wd6h = ris?.withdrawals6h ?? 0;
      const an6h = ris?.announcements6h ?? 0;
      const withdrawEvents = ris?.recentWithdrawals || (ris?.recentEvents || []).filter(e => e.type === "WITHDRAW");
      const announceEvents = ris?.recentAnnouncements || (ris?.recentEvents || []).filter(e => e.type === "ANNOUNCE");
      const wdColor = wd1h >= 10 ? "#dc2626" : wd1h >= 3 ? "#b45309" : "#16a34a";

      return (<>
        <Section title="What is RIS Live?">
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, margin: 0 }}>
            RIPE RIS (Routing Information Service) Live streams real-time BGP UPDATE messages from
            <strong> 25 Route Collectors (RRCs)</strong> placed at Internet Exchange Points worldwide.
            Every time a router changes its routing table — adding or removing a route — it sends an UPDATE
            to its BGP peers, which propagates to the RIS stream.
          </p>
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
            This gives us a real-time view of BGP instability for AS{market.asn} ({market.name}).
          </p>
          <p style={{ fontSize: 11, color: T.muted, lineHeight: 1.7, marginTop: 8, marginBottom: 0, fontStyle: "italic" }}>
            Events are <strong>deduplicated by prefix over a 60-second window</strong>: one logical withdrawal
            seen by many RIS collectors/peers counts once. A later withdrawal of the same prefix
            (&gt;60s later) is counted separately, so real route-flap activity is still visible.
          </p>
        </Section>

        <Section title="Current metrics">
          <KV label="Unique withdrawals / last 1h" value={`${wd1h}`} valueColor={wdColor}
            sub={wd1h >= 10 ? "ALERT — high instability" : wd1h >= 3 ? "WARN — elevated, monitor" : "Normal BGP churn"} />
          <KV label="Unique announcements / last 1h" value={`${an1h}`}
            sub="New routes being advertised — normal activity" />
          <KV label="Unique withdrawals / last 6h" value={`${wd6h}`} />
          <KV label="Unique announcements / last 6h" value={`${an6h}`} />
          <KV label="WebSocket" value={ris?.connected ? "Connected" : "Disconnected"} valueColor={ris?.connected ? "#16a34a" : "#dc2626"} />
        </Section>

        <Section title="What do withdrawals mean?">
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, margin: "0 0 8px" }}>
            A <strong>BGP withdrawal</strong> means a router stopped announcing a prefix — it removed the route
            from its routing table. Common causes:
          </p>
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.7 }}>
            <div>• <strong>Planned maintenance:</strong> router taken offline gracefully</div>
            <div>• <strong>Link failure:</strong> upstream link dropped, router withdraws affected routes</div>
            <div>• <strong>Traffic engineering:</strong> intentional route changes for load balancing</div>
            <div>• <strong>BGP session reset:</strong> peer connection dropped and re-established</div>
          </div>
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
            A small number of withdrawals per hour is <strong>completely normal</strong>.
            It is the sustained high rate that indicates problems.
          </p>
        </Section>

        <Section title="Thresholds">
          <ThresholdRow range="0 – 2 / h"  status="ok"   meaning="Normal BGP churn. No action needed." />
          <ThresholdRow range="3 – 9 / h"  status="warn" meaning="Elevated instability. Monitor for escalation. Check if maintenance is scheduled." />
          <ThresholdRow range="≥ 10 / h"   status="alert" meaning="High instability. Investigate immediately. Cross-reference with Atlas latency and BGP visibility." />
        </Section>

        {withdrawEvents.length > 0 && (
          <Section title={`Recent withdraw events (${withdrawEvents.length} shown)`}>
            {withdrawEvents.slice(0, 15).map((e, i) => (
              <EventRow key={i} mono
                tag="WITHDRAW"
                label={`${e.prefix}  peer ${e.peer}  via ${e.rrc}  ${new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`}
              />
            ))}
          </Section>
        )}

        {announceEvents.length > 0 && (
          <Section title={`Recent announce events (${announceEvents.length} shown)`}>
            {announceEvents.slice(0, 5).map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 6, padding: "4px 8px", borderRadius: 5, background: "#f0fdf4", border: "1px solid #86efac", marginBottom: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: "#16a34a", background: "#dcfce7", border: "1px solid #86efac", borderRadius: 3, padding: "1px 5px" }}>ANNOUNCE</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: T.text, wordBreak: "break-all" }}>
                  {e.prefix}  peer {e.peer}  via {e.rrc}  {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </div>
            ))}
          </Section>
        )}

        <Section title="NOC action guide">
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8 }}>
            {wd1h < 3 && <div>✅ No action needed. BGP state is stable.</div>}
            {wd1h >= 3 && wd1h < 10 && <>
              <div>⚠️ Elevated withdrawal rate. Recommended steps:</div>
              <div style={{ paddingLeft: 16 }}>1. Check if maintenance is scheduled for AS{market.asn}</div>
              <div style={{ paddingLeft: 16 }}>2. Monitor Atlas latency for end-user impact</div>
              <div style={{ paddingLeft: 16 }}>3. Review BGP Visibility — if peers dropping, escalate</div>
              <div style={{ paddingLeft: 16 }}>4. Re-check in 15 min — if still elevated, open ticket</div>
            </>}
            {wd1h >= 10 && <>
              <div>🔴 High BGP instability. Immediate action:</div>
              <div style={{ paddingLeft: 16 }}>1. Identify which prefixes are being withdrawn (see events above)</div>
              <div style={{ paddingLeft: 16 }}>2. Check Atlas — is end-user latency rising?</div>
              <div style={{ paddingLeft: 16 }}>3. Check BGP Visibility — are peers losing sight of this AS?</div>
              <div style={{ paddingLeft: 16 }}>4. Contact NOC for AS{market.asn} — possible routing incident</div>
              <div style={{ paddingLeft: 16 }}>5. Open incident ticket if Atlas + BGP also degraded</div>
            </>}
          </div>
        </Section>
      </>);
    }

    if (signal.key === "radar") {
      const activeEvents = (radar?.events || []).filter(e => e.active);
      const hijacks = activeEvents.filter(e => e.type === "HIJACK");
      const leaks   = activeEvents.filter(e => e.type === "LEAK");
      const allEvents = radar?.events || [];

      return (<>
        <Section title="What is Cloudflare Radar?">
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, margin: 0 }}>
            Cloudflare has visibility into <strong>~20% of global Internet traffic</strong> and operates
            one of the largest BGP monitoring networks. It detects prefix hijacks and route leaks
            by cross-referencing BGP announcements against known prefix ownership (ROA records).
          </p>
        </Section>

        <Section title="Current status">
          <KV label="Active alerts" value={`${radar?.alertCount ?? 0}`} valueColor={radar?.alertCount > 0 ? "#dc2626" : "#16a34a"} />
          <KV label="Active hijacks" value={`${hijacks.length}`} valueColor={hijacks.length > 0 ? "#dc2626" : T.text} />
          <KV label="Active leaks" value={`${leaks.length}`} valueColor={leaks.length > 0 ? "#dc2626" : T.text} />
          <KV label="Total events (last 6h)" value={`${allEvents.length}`} />
          <KV label="Token configured" value={radar?.configured ? "Yes" : "No"} valueColor={radar?.configured ? "#16a34a" : "#b45309"} />
        </Section>

        <Section title="What is a BGP hijack?">
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, margin: 0 }}>
            A <strong>prefix hijack</strong> occurs when an AS announces routes for IP blocks it does not own.
            This can redirect traffic intended for Vodafone customers through a third-party network.
          </p>
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
            <strong>Impact:</strong> traffic interception, increased latency, service disruption.
            Can be accidental (misconfiguration) or malicious. ROA/RPKI validation can detect and reject hijacks.
          </p>
        </Section>

        <Section title="What is a route leak?">
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, margin: 0 }}>
            A <strong>route leak</strong> occurs when routes received from one peer are re-announced
            to other peers in violation of routing policy. This can cause traffic to take unexpected,
            suboptimal paths — or create routing loops.
          </p>
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
            <strong>Common cause:</strong> misconfigured export filters. Typically causes latency spikes
            and partial outages rather than full disconnection.
          </p>
        </Section>

        {activeEvents.length > 0 && (
          <Section title={`Active events (${activeEvents.length})`}>
            {activeEvents.map((e, i) => (
              <EventRow key={i} tag={e.type}
                label={`${e.prefix || "prefix unknown"} · AS${e.asn} · detected ${new Date(e.ts).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              />
            ))}
          </Section>
        )}

        {allEvents.length > activeEvents.length && (
          <Section title="Resolved events (last 6h)">
            {allEvents.filter(e => !e.active).slice(0, 5).map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 6, padding: "4px 8px", borderRadius: 5, background: T.bg, border: `1px solid ${T.border}`, marginBottom: 3 }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: T.muted, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 3, padding: "1px 5px" }}>{e.type}</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: T.muted, wordBreak: "break-all" }}>
                  {e.prefix || "unknown"} · AS{e.asn} · resolved
                </span>
              </div>
            ))}
          </Section>
        )}

        <Section title="NOC action guide">
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8 }}>
            {(radar?.alertCount ?? 0) === 0 && <div>✅ No active hijacks or route leaks detected.</div>}
            {hijacks.length > 0 && <>
              <div>🔴 Active prefix hijack detected. Immediate steps:</div>
              <div style={{ paddingLeft: 16 }}>1. Identify which prefixes are affected (see events above)</div>
              <div style={{ paddingLeft: 16 }}>2. Verify RPKI/ROA status for those prefixes</div>
              <div style={{ paddingLeft: 16 }}>3. Contact upstream providers to filter the hijacking AS</div>
              <div style={{ paddingLeft: 16 }}>4. Cross-reference with Atlas latency — is traffic being misdirected?</div>
              <div style={{ paddingLeft: 16 }}>5. Open Sev1 ticket immediately</div>
            </>}
            {leaks.length > 0 && hijacks.length === 0 && <>
              <div>⚠️ Route leak detected. Recommended steps:</div>
              <div style={{ paddingLeft: 16 }}>1. Identify source AS of the leak</div>
              <div style={{ paddingLeft: 16 }}>2. Check if export filters are correctly configured</div>
              <div style={{ paddingLeft: 16 }}>3. Contact leaking AS's NOC if external</div>
              <div style={{ paddingLeft: 16 }}>4. Monitor Atlas for latency impact</div>
            </>}
          </div>
        </Section>
      </>);
    }

    if (signal.key === "bgp") {
      const cur = bgp?.current;
      const vis = cur?.visibility_pct;
      const visColor = vis == null ? T.muted : vis >= 95 ? "#16a34a" : vis >= 80 ? "#b45309" : "#dc2626";

      return (<>
        <Section title="What is BGP Visibility?">
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, margin: 0 }}>
            RIPE NCC operates <strong>~329 BGP route collectors (RIS peers)</strong> distributed at
            Internet Exchange Points worldwide. Every few minutes each collector checks:
            <em> "Can I see a valid route to this Vodafone AS?"</em>
          </p>
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
            The visibility % shows how many of those 329 collectors can route to AS{market.asn}.
            At 100% all 329/329 see a valid path. A drop means some internet paths to Vodafone are broken.
          </p>
        </Section>

        <Section title="Current metrics">
          <KV label="Visibility" value={vis != null ? `${vis.toFixed(1)}%` : "no data"} valueColor={visColor}
            sub={vis >= 95 ? "All peers see a valid route" : vis >= 80 ? "Some peers losing visibility — monitor" : "Significant visibility loss — incident"} />
          <KV label="Peers seeing AS" value={cur?.ris_peers_seeing != null ? `${cur.ris_peers_seeing} / ${cur.total_ris_peers}` : "—"} />
          <KV label="Announced prefixes" value={cur?.announced_prefixes ?? "—"}
            sub="IP blocks currently advertised by this AS" />
        </Section>

        <Section title="Thresholds">
          <ThresholdRow range="≥ 95%"    status="ok"    meaning="All collectors see valid routes. Normal state." />
          <ThresholdRow range="80–94%"   status="warn"  meaning="Some paths lost. May not impact all users yet. Investigate." />
          <ThresholdRow range="< 80%"    status="alert" meaning="Major visibility loss. Significant routing incident. Escalate." />
        </Section>

        <Section title="What does a visibility drop mean?">
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8 }}>
            <div>• <strong>Partial drop (1-10 peers):</strong> Local routing issues, probably one IXP or peering link</div>
            <div>• <strong>Moderate drop (10-50 peers):</strong> Regional issue, multiple links or a major IXP</div>
            <div>• <strong>Severe drop (50+ peers):</strong> Major routing incident, possible AS deaggregation or blackholing</div>
            <div>• <strong>100% drop (0/329):</strong> Complete AS withdrawal — network is unreachable globally</div>
          </div>
        </Section>

        <Section title="NOC action guide">
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8 }}>
            {vis == null && <div>ℹ️ No data available. Check backend connectivity.</div>}
            {vis >= 95 && <div>✅ BGP visibility is normal. All 329 peers see valid routes to AS{market.asn}.</div>}
            {vis < 95 && vis >= 80 && <>
              <div>⚠️ Reduced visibility. Steps:</div>
              <div style={{ paddingLeft: 16 }}>1. Cross-reference with RIS Live withdrawals — are we seeing prefix removals?</div>
              <div style={{ paddingLeft: 16 }}>2. Check Atlas latency — are affected regions showing higher RTT?</div>
              <div style={{ paddingLeft: 16 }}>3. If withdrawals high AND visibility dropping → escalate to routing team</div>
            </>}
            {vis < 80 && <>
              <div>🔴 Major visibility loss. Immediate action:</div>
              <div style={{ paddingLeft: 16 }}>1. Open Sev1 ticket immediately</div>
              <div style={{ paddingLeft: 16 }}>2. Contact routing/NOC team for AS{market.asn}</div>
              <div style={{ paddingLeft: 16 }}>3. Check RIS Live for mass withdrawals</div>
              <div style={{ paddingLeft: 16 }}>4. Verify upstream peering sessions are up</div>
            </>}
          </div>
        </Section>
      </>);
    }

    if (signal.key === "atlas") {
      const cur = market.current;
      const ratio = market.ratio;
      const ratioColor = ratio == null ? T.muted : ratio < 2 ? "#16a34a" : ratio < 4.5 ? "#b45309" : "#dc2626";

      return (<>
        <Section title="What is RIPE Atlas?">
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, margin: 0 }}>
            RIPE Atlas is a network of <strong>10,000+ hardware probes</strong> hosted by volunteers worldwide.
            Probes inside Vodafone's AS{market.asn} send <strong>ICMP pings every ~4 minutes</strong> to
            k.root-servers.net (193.0.14.129) — one of the 13 DNS root servers, operated by RIPE NCC,
            with anycast nodes at major IXPs.
          </p>
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
            The RTT to k-root reflects the path from a Vodafone customer device through the access network,
            backbone, and Internet exit to the nearest IXP — a good proxy for Vodafone's Internet edge performance.
          </p>
        </Section>

        <Section title="Current metrics">
          <KV label="Avg RTT" value={cur?.avg_rtt != null ? `${cur.avg_rtt} ms` : "—"} />
          <KV label="P95 RTT" value={cur?.p95_rtt != null ? `${cur.p95_rtt} ms` : "—"}
            sub="95th percentile — worst 1-in-20 measurement" />
          <KV label="Packet loss" value={cur?.loss_pct != null ? `${cur.loss_pct}%` : "—"}
            valueColor={cur?.loss_pct > 5 ? "#dc2626" : cur?.loss_pct > 1 ? "#b45309" : "#16a34a"} />
          <KV label="Baseline (4h avg)" value={market.baseline_rtt != null ? `${market.baseline_rtt} ms` : "—"} />
          <KV label="Ratio vs baseline" value={ratio != null ? `${ratio}×` : "—"} valueColor={ratioColor}
            sub="Current RTT ÷ 4-hour rolling baseline" />
          <KV label="Active probes" value={cur?.probe_count ?? "—"} />
        </Section>

        <Section title="Thresholds (ratio model)">
          <ThresholdRow range="< 2×"    status="ok"    meaning="Latency within normal range of baseline." />
          <ThresholdRow range="2× – 4.5×" status="warn" meaning="Elevated latency. Possible congestion or path change." />
          <ThresholdRow range="≥ 4.5×"  status="alert" meaning="Severe latency spike. Likely access or backbone issue." />
        </Section>

        <Section title="What causes high latency?">
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8 }}>
            <div>• <strong>Access network congestion:</strong> DSLAM/OLT overloaded, affects many customers</div>
            <div>• <strong>Backbone congestion:</strong> internal transit links at capacity</div>
            <div>• <strong>Peering degradation:</strong> IXP port or peer session issues</div>
            <div>• <strong>BGP path change:</strong> traffic rerouted to longer path (check RIS)</div>
            <div>• <strong>k-root anycast shift:</strong> probes hitting a different, farther node (rare)</div>
          </div>
        </Section>

        <Section title="NOC action guide">
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8 }}>
            {(!ratio || ratio < 2) && <div>✅ Latency is normal. No action needed.</div>}
            {ratio >= 2 && ratio < 4.5 && <>
              <div>⚠️ Elevated latency. Steps:</div>
              <div style={{ paddingLeft: 16 }}>1. Check BGP — is a route change causing longer paths?</div>
              <div style={{ paddingLeft: 16 }}>2. Check if specific probe locations are affected (open Probe Breakdown)</div>
              <div style={{ paddingLeft: 16 }}>3. Monitor packet loss — if rising, escalate</div>
              <div style={{ paddingLeft: 16 }}>4. Check Downdetector for user reports</div>
            </>}
            {ratio >= 4.5 && <>
              <div>🔴 Severe latency. Immediate action:</div>
              <div style={{ paddingLeft: 16 }}>1. Open Probe Breakdown — identify which probes/regions are affected</div>
              <div style={{ paddingLeft: 16 }}>2. Cross-reference with BGP — if also degraded → routing incident</div>
              <div style={{ paddingLeft: 16 }}>3. Contact access/backbone team for AS{market.asn}</div>
              <div style={{ paddingLeft: 16 }}>4. Open incident ticket if sustained {'>'} 10 min</div>
            </>}
          </div>
        </Section>
      </>);
    }

    if (signal.key === "ioda") {
      return (<>
        <Section title="What is CAIDA IODA?">
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, margin: 0 }}>
            CAIDA IODA (Internet Outage Detection and Analysis) monitors Internet outages using
            three independent measurement signals:
          </p>
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8, marginTop: 8 }}>
            <div>• <strong>BGP:</strong> monitors prefix withdrawals globally</div>
            <div>• <strong>Active probing:</strong> UCSD telescope actively probes ASes for reachability</div>
            <div>• <strong>Darknet telescope:</strong> measures unsolicited traffic — drops indicate outages</div>
          </div>
          <p style={{ fontSize: 11, color: T.text, lineHeight: 1.7, marginTop: 8, marginBottom: 0 }}>
            When multiple datasources align on the same ASN simultaneously, confidence of an outage is high.
            IODA is particularly strong at detecting <strong>large-scale outages</strong> (country level, ISP level).
          </p>
        </Section>

        <Section title="Current status">
          <KV label="Status" value={ioda?.ok === false ? "Error" : (ioda?.status || "unknown").toUpperCase()}
            valueColor={ioda?.ok === false ? "#dc2626" : ioda?.status === "alert" ? "#dc2626" : "#16a34a"} />
          {ioda?.ok === false && (
            <KV label="Error" value={ioda?.error || "fetch failed"} valueColor="#dc2626"
              sub="IODA API may be unreachable from this server location. This is known to occur with cloud-hosted IPs." />
          )}
          {ioda?.ok !== false && <>
            <KV label="Active events" value={ioda?.activeCount ?? 0}
              valueColor={ioda?.activeCount > 0 ? "#dc2626" : "#16a34a"} />
            <KV label="Events in last 1h" value={ioda?.recentCount ?? 0} />
          </>}
        </Section>

        <Section title="How to interpret IODA alerts">
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8 }}>
            <div>• <strong>Score:</strong> deviation from baseline. Higher = larger outage.</div>
            <div>• <strong>datasource "bgp":</strong> routing withdrawal detected by IODA's BGP monitors</div>
            <div>• <strong>datasource "ping-slash24":</strong> active probing shows reduced reachability</div>
            <div>• <strong>datasource "merit-nt":</strong> darknet telescope anomaly (unsolicited traffic drop)</div>
            <div>• <strong>Multiple datasources at once:</strong> high-confidence outage</div>
          </div>
        </Section>

        {ioda?.events?.length > 0 && (
          <Section title={`Recent events (${ioda.events.length})`}>
            {ioda.events.slice(0, 10).map((e, i) => (
              <EventRow key={i}
                tag={e.datasource}
                label={`score ${e.score ?? "?"} · ${e.active ? "ACTIVE" : "resolved"} · since ${new Date(e.start).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
              />
            ))}
          </Section>
        )}

        <Section title="NOC action guide">
          <div style={{ fontSize: 11, color: T.text, lineHeight: 1.8 }}>
            {ioda?.ok === false && <div>ℹ️ IODA data unavailable from this server. Cross-reference manually at ioda.caida.org</div>}
            {ioda?.ok !== false && ioda?.activeCount === 0 && <div>✅ No outage signals detected by IODA for AS{market.asn}.</div>}
            {ioda?.activeCount > 0 && <>
              <div>🔴 IODA outage signal active. Steps:</div>
              <div style={{ paddingLeft: 16 }}>1. Check which datasources are firing (BGP, probing, telescope?)</div>
              <div style={{ paddingLeft: 16 }}>2. If BGP + probing both active → high-confidence outage</div>
              <div style={{ paddingLeft: 16 }}>3. Cross-reference with Atlas latency and RIS withdrawals</div>
              <div style={{ paddingLeft: 16 }}>4. Visit ioda.caida.org for full event details</div>
            </>}
          </div>
        </Section>
      </>);
    }

    return <div style={{ fontSize: 11, color: T.muted }}>No detail available for this signal.</div>;
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10000,
      background: "rgba(0,0,0,0.55)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`,
        borderRadius: 14, width: "100%", maxWidth: 560,
        maxHeight: "88vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        margin: "0 16px",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px", borderBottom: `1px solid ${T.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 18 }}>{signal.icon}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: T.text }}>{signal.label}</div>
            <div style={{ fontSize: 11, color: T.muted }}>{market.flag} {market.name} · AS{market.asn}</div>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.4px",
            color: sc.color, background: sc.bg, border: `1px solid ${sc.border}`,
            borderRadius: 5, padding: "3px 9px",
          }}>{(signal.status || "NO DATA").toUpperCase()}</span>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 18, color: T.muted, padding: "0 2px", lineHeight: 1,
          }}>×</button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}

// ─── Signal Layers section (used inside DetailPanel) ─────────────────────────
function SignalLayersSection({ market }) {
  const [expanded, setExpanded] = useState(false);
  const [selectedSignal, setSelectedSignal] = useState(null);

  const signals = [
    {
      key:    "atlas",
      label:  "RIPE Atlas",
      icon:   "📡",
      status: market.status,
      summary: market.ok
        ? `${market.current?.avg_rtt ?? "—"} ms avg · ${market.ratio ?? "?"}× ratio · ${market.current?.probe_count ?? 0} probes`
        : market.error || "no data",
      events: [],
    },
    {
      key:    "bgp",
      label:  "BGP Visibility",
      icon:   "🔗",
      status: market.bgp?.status,
      summary: market.bgp?.current?.ris_peers_seeing != null
        ? `${market.bgp.current.ris_peers_seeing}/${market.bgp.current.total_ris_peers} RIS peers · ${market.bgp.current.announced_prefixes ?? "?"} prefixes`
        : "no data",
      events: [],
    },
    {
      key:    "ioda",
      label:  "CAIDA IODA",
      icon:   "🌐",
      status: market.ioda?.status,
      summary: market.ioda?.ok === false
        ? (market.ioda.error || "error polling IODA")
        : market.ioda?.activeCount > 0
          ? `${market.ioda.activeCount} active event${market.ioda.activeCount !== 1 ? "s" : ""} · ${market.ioda.recentCount ?? 0} in last 1h`
          : "no outage detected",
      events: (market.ioda?.events || []).filter(e => e.active).slice(0, 3).map(e => ({
        label: `${e.datasource || "?"} · score ${e.score ?? "?"} · since ${new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      })),
    },
    {
      key:    "radar",
      label:  "Cloudflare Radar",
      icon:   "☁️",
      status: market.radar?.status,
      summary: !market.radar?.configured
        ? "token not configured — BGP hijack/leak monitoring inactive"
        : market.radar?.alertCount > 0
          ? `${market.radar.alertCount} active alert${market.radar.alertCount !== 1 ? "s" : ""} (hijack/leak)`
          : "no hijacks or leaks detected",
      events: (market.radar?.events || []).filter(e => e.active).slice(0, 3).map(e => ({
        label: `${e.type} · ${e.prefix || "prefix unknown"} · AS${e.asn}`,
      })),
    },
    {
      key:    "ris",
      label:  "RIS Live",
      icon:   "🔄",
      status: market.ris?.status,
      summary: market.ris?.connected === false
        ? "WebSocket disconnected — reconnecting…"
        : `${market.ris?.withdrawals1h ?? 0} unique withdrawals/1h · ${market.ris?.announcements1h ?? 0} unique announces/1h`,
      events: (market.ris?.recentWithdrawals || (market.ris?.recentEvents || []).filter(e => e.type === "WITHDRAW")).slice(0, 3).map(e => ({
        label: `WITHDRAW ${e.prefix} from ${e.peer} (${e.rrc})`,
      })),
    },
  ];

  const corrScore   = market.correlation?.score;
  const corrStatus  = market.correlation?.status;
  const corrInsight = market.correlation?.insight;
  const corrAlerts  = market.correlation?.alerts || [];
  const scoreC      = scoreColor(corrScore);

  return (
    <div style={{
      marginBottom: 16,
      border: `1px solid ${T.border}`, borderRadius: 9,
      background: T.surface, overflow: "hidden",
    }}>
      {/* Collapsed header */}
      <button
        onClick={() => setExpanded(o => !o)}
        style={{
          width: "100%", padding: "9px 14px", border: "none", cursor: "pointer",
          background: "none", display: "flex", alignItems: "center", gap: 8, textAlign: "left",
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 700, color: T.text, flex: 1 }}>
          Signal Layers
        </span>
        {/* Score badge */}
        {corrScore != null && (
          <span style={{
            fontSize: 11, fontWeight: 800, fontFamily: "monospace",
            color: scoreC, background: `${scoreC}14`,
            border: `1px solid ${scoreC}44`, borderRadius: 5, padding: "2px 8px",
          }}>
            {corrScore}/100
          </span>
        )}
        {/* 5 dots */}
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          {signals.map(s => (
            <div key={s.key} title={`${s.label}: ${s.status || "no data"}`}
              style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor(s.status) }} />
          ))}
        </div>
        <span style={{ fontSize: 11, color: T.muted }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "10px 14px" }}>
          {/* Signal rows */}
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 12 }}>
            {signals.map(s => {
              const normStatus = s.status === "alert" ? "outage"
                : s.status === "warn"  ? "warning"
                : s.status || "unknown";
              const sc = sm(normStatus);
              return (
                <div key={s.key} onClick={() => setSelectedSignal(s)} style={{
                  display: "flex", alignItems: "flex-start", gap: 8,
                  padding: "7px 10px", borderRadius: 6, cursor: "pointer",
                  background: T.bg, border: `1px solid ${T.border}`,
                  transition: "border-color 0.15s",
                }} onMouseEnter={e => e.currentTarget.style.borderColor = "#6b7280"}
                   onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                  <span style={{ fontSize: 14, lineHeight: 1, marginTop: 1 }}>{s.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{s.label}</span>
                      <span style={{
                        fontSize: 9, fontWeight: 800, letterSpacing: "0.4px",
                        color: sc.color, background: sc.bg,
                        border: `1px solid ${sc.border}`, borderRadius: 4, padding: "1px 5px",
                      }}>
                        {(s.status || "NO DATA").toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>
                      {s.summary}
                    </div>
                    {s.events.length > 0 && (
                      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                        {s.events.map((ev, i) => (
                          <div key={i} style={{
                            fontSize: 9, fontFamily: "monospace",
                            color: "#dc2626", background: "#fef2f2",
                            border: "1px solid #fca5a5", borderRadius: 4, padding: "2px 7px",
                          }}>
                            {ev.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 9, color: T.muted, flexShrink: 0, alignSelf: "center" }}>→</span>
                </div>
              );
            })}
          </div>

          {/* Correlation insight */}
          {corrInsight && (
            <div style={{
              padding: "9px 12px", borderRadius: 7,
              background: corrAlerts.length > 0 ? "#fef3c7" : "#f0fdf4",
              border: `1px solid ${corrAlerts.length > 0 ? "#fcd34d" : "#86efac"}`,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 700, letterSpacing: "0.4px", marginBottom: 3,
                color: corrAlerts.length > 0 ? "#b45309" : "#16a34a",
              }}>
                CORRELATION — {(corrStatus || "unknown").toUpperCase()}
              </div>
              <div style={{ fontSize: 11, color: T.text, lineHeight: 1.5 }}>
                {corrInsight}
              </div>
              {corrAlerts.length > 0 && (() => {
                const wd = market.ris?.withdrawals1h;
                const radar = market.radar;
                const vis = market.bgp?.current?.visibility_pct;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                      {corrAlerts.map(a => (
                        <span key={a} style={{
                          fontSize: 9, fontWeight: 700,
                          background: "#fee2e2", color: "#dc2626",
                          border: "1px solid #fca5a5", borderRadius: 4, padding: "1px 6px",
                        }}>{a.toUpperCase()}</span>
                      ))}
                    </div>
                    <div style={{ fontSize: 10, color: T.text, lineHeight: 1.7, borderTop: `1px solid ${corrAlerts.length > 0 ? "#fcd34d" : "#86efac"}`, paddingTop: 8 }}>
                      {corrAlerts.includes("ris") && wd != null && (
                        <div>• <strong>RIS Live:</strong> {wd} unique withdrawal event{wd !== 1 ? "s" : ""} in the last 1h (deduplicated by prefix over a 60s window, so one logical withdrawal seen by many RIS collectors counts once). Thresholds: WARNING ≥3/h · ALERT ≥10/h. {wd >= 10 ? "This rate indicates active BGP instability." : "Monitor for escalation."}</div>
                      )}
                      {corrAlerts.includes("radar") && radar?.alertCount > 0 && (
                        <div>• <strong>Cloudflare Radar:</strong> {radar.alertCount} active event{radar.alertCount !== 1 ? "s" : ""} (hijack/leak). Click the Cloudflare Radar row above for full details.</div>
                      )}
                      {corrAlerts.includes("bgp") && vis != null && (
                        <div>• <strong>BGP Visibility:</strong> {vis.toFixed(1)}% of global peers see a valid route to this AS. Normal is 100%.</div>
                      )}
                      {corrAlerts.includes("atlas") && market.ratio != null && (
                        <div>• <strong>RIPE Atlas:</strong> latency is {market.ratio}× above baseline. Threshold for OUTAGE is 4.5×.</div>
                      )}
                      {corrAlerts.includes("ioda") && (
                        <div>• <strong>CAIDA IODA:</strong> outage signal detected by independent measurement system.</div>
                      )}
                      <div style={{ marginTop: 6, fontStyle: "italic", color: T.muted }}>
                        Click any signal row above for full troubleshooting guidance.
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
      {selectedSignal && (
        <SignalDetailModal signal={selectedSignal} market={market} onClose={() => setSelectedSignal(null)} />
      )}
    </div>
  );
}

// ─── Detail panel (modal) ─────────────────────────────────────────────────────
function DetailPanel({ market, onClose }) {
  const meta   = sm(market.status);
  const cur    = market.current;
  const [zoom, setZoom] = useState("6h");
  const [probeOpen, setProbeOpen] = useState(false);
  const [prefixOpen, setPrefixOpen] = useState(false);
  const [rpkiOpen, setRpkiOpen] = useState(false);

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

          {/* Signal layers + correlation */}
          <SignalLayersSection market={market} />

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

          {/* ── Correlation score trend chart ────────────────────────────── */}
          {market.correlationHistory && market.correlationHistory.length > 1 && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
              <div style={{
                fontSize: 10, color: T.muted, fontWeight: 600, marginBottom: 6,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span>Correlation score — 36h trend</span>
                <span style={{ color: "#9ca3af", fontWeight: 400 }}>
                  ({applyZoomCorr(market.correlationHistory, zoom).length} pts · 5 min interval)
                </span>
                {market.correlation?.score != null && (
                  <span style={{
                    marginLeft: "auto", fontSize: 11, fontWeight: 800,
                    fontFamily: "monospace", color: scoreColor(market.correlation.score),
                  }}>now: {market.correlation.score}/100</span>
                )}
              </div>
              <CorrelationScoreChart
                history={applyZoomCorr(market.correlationHistory, zoom)}
              />
              <div style={{ marginTop: 5, fontSize: 9, color: T.muted, lineHeight: 1.5,
                padding: "5px 8px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 5 }}>
                💡 Score aggregates all 5 signal layers. A sudden drop = multi-source correlation
                (routing incident, outage, or hijack). 90–100 = nominal · &lt;40 = incident.
              </div>
            </div>
          )}

          {/* ── BGP Deep Metrics ─────────────────────────────────────────── */}
          {market.bgp?.ok && (
            <div style={{ marginTop: 20, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 11, color: T.text }}>
                  📡 BGP Deep Metrics
                </span>
                <span style={{
                  fontSize: 9, color: T.muted, background: T.bg,
                  border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 6px",
                }}>
                  refreshed every 30 min
                </span>
              </div>

              {/* Stat row: Prefixes / RPKI / AS Path */}
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 14,
              }}>
                {/* Announced Prefixes — clickable → PrefixListModal */}
                {(() => {
                  const total = market.bgp.prefixes
                    ? market.bgp.prefixes.v4_count + market.bgp.prefixes.v6_count
                    : (market.bgp.current?.announced_prefixes ?? null);
                  const hasFull = !!market.bgp.prefixes?.v4_list;
                  const hasDiff = market.bgp.prefixDiff && (
                    market.bgp.prefixDiff.added_v4?.length || market.bgp.prefixDiff.removed_v4?.length ||
                    market.bgp.prefixDiff.added_v6?.length || market.bgp.prefixDiff.removed_v6?.length
                  );
                  return (
                    <div
                      onClick={hasFull ? () => setPrefixOpen(true) : undefined}
                      style={{
                        padding: "9px 11px", background: T.bg,
                        border: `1px solid ${hasFull ? "#7dd3fc" : T.border}`,
                        borderRadius: 7, position: "relative",
                        cursor: hasFull ? "pointer" : "default",
                        transition: "border-color 0.15s",
                      }}
                    >
                      <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                        PREFIXES {hasFull && <span style={{ fontSize: 8, color: "#0891b2" }}>↗ list</span>}
                        {hasDiff && <span style={{ fontSize: 8, color: "#b45309" }}>⚠ diff</span>}
                      </div>
                      <div style={{
                        fontSize: 20, fontWeight: 800, fontFamily: "monospace",
                        color: "#0891b2", lineHeight: 1,
                      }}>
                        {total != null
                          ? total
                          : <span style={{ fontSize: 14, color: "#9ca3af" }}>—</span>}
                      </div>
                      {market.bgp.prefixes && (
                        <div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>
                          v4: {market.bgp.prefixes.v4_count} · v6: {market.bgp.prefixes.v6_count}
                        </div>
                      )}
                      {!market.bgp.prefixes && (
                        <div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>
                          from routing-status
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* RPKI Coverage — clickable → RpkiDetailModal */}
                {(() => {
                  const rpki = market.bgp.rpki;
                  const color = rpki?.coverage_pct != null
                    ? rpki.coverage_pct >= 90 ? "#16a34a"
                    : rpki.coverage_pct >= 60 ? "#b45309"
                    : "#dc2626"
                    : "#9ca3af";
                  const hasDetail = rpki?.details?.length > 0;
                  return (
                    <div
                      onClick={rpki ? () => setRpkiOpen(true) : undefined}
                      style={{
                        padding: "9px 11px", background: T.bg,
                        border: `1px solid ${rpki ? "#86efac" : T.border}`,
                        borderRadius: 7,
                        cursor: rpki ? "pointer" : "default",
                        transition: "border-color 0.15s",
                      }}
                    >
                      <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                        RPKI COVERAGE {hasDetail && <span style={{ fontSize: 8, color: "#16a34a" }}>↗ detail</span>}
                      </div>
                      <div style={{
                        fontSize: 20, fontWeight: 800, fontFamily: "monospace",
                        color, lineHeight: 1,
                      }}>
                        {rpki?.coverage_pct != null
                          ? <>{rpki.coverage_pct}<span style={{ fontSize: 10, fontWeight: 600 }}>%</span></>
                          : <span style={{ fontSize: 14, color: "#9ca3af" }}>—</span>}
                      </div>
                      {rpki ? (
                        <div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>
                          ✓{rpki.valid} ✗{rpki.invalid} ?{rpki.unknown} / {rpki.sampled}
                        </div>
                      ) : (
                        <div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>pending…</div>
                      )}
                    </div>
                  );
                })()}

                {/* AS Path Length */}
                {(() => {
                  const pl = market.bgp.pathLength;
                  return (
                    <div style={{
                      padding: "9px 11px", background: T.bg,
                      border: `1px solid ${T.border}`, borderRadius: 7,
                    }}>
                      <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, marginBottom: 3 }}>
                        AVG AS PATH
                      </div>
                      <div style={{
                        fontSize: 20, fontWeight: 800, fontFamily: "monospace",
                        color: "#6366f1", lineHeight: 1,
                      }}>
                        {pl?.avg != null
                          ? <>{pl.avg}<span style={{ fontSize: 10, fontWeight: 600 }}> hops</span></>
                          : <span style={{ fontSize: 14, color: "#9ca3af" }}>—</span>}
                      </div>
                      {pl ? (
                        <div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>
                          {pl.min}–{pl.max} range · {pl.rrc_count} RRCs
                        </div>
                      ) : (
                        <div style={{ fontSize: 9, color: T.muted, marginTop: 3 }}>pending…</div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Announced prefixes history chart — real 5-min time-series */}
              {(market.bgp.history?.length ?? 0) > 1 && (
                <div>
                  <div style={{
                    fontSize: 10, color: T.muted, fontWeight: 600, marginBottom: 6,
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    <span>Announced prefixes — evolution</span>
                    <span style={{ color: "#9ca3af", fontWeight: 400 }}>
                      ({applyZoom(market.bgp.history, zoom).length} pts · 5 min interval)
                    </span>
                  </div>
                  <MetricChart
                    data={applyZoom(market.bgp.history, zoom)}
                    valueKey="announced_prefixes"
                    label="Announced Prefixes"
                    unit=" routes"
                    color="#0891b2"
                    warnLevel={null}
                    critLevel={null}
                    baseline={null}
                    width={170}
                    height={60}
                  />
                  <div style={{
                    fontSize: 9, color: T.muted, marginTop: 5, lineHeight: 1.5,
                    padding: "5px 8px", background: T.bg,
                    border: `1px solid ${T.border}`, borderRadius: 5,
                  }}>
                    💡 A sudden drop signals prefix withdrawal — routes to {market.name} become unreachable
                    even if BGP peer visibility (329/329) stays normal.
                  </div>
                </div>
              )}

              {/* No extended data yet */}
              {!market.bgp.prefixes && !market.bgp.rpki && !market.bgp.pathLength && (
                <div style={{
                  fontSize: 11, color: T.muted, textAlign: "center",
                  padding: "10px 0",
                }}>
                  Extended metrics loading… (first poll up to 30 min after backend start)
                </div>
              )}
            </div>
          )}

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
      {prefixOpen && (
        <PrefixListModal
          market={market}
          onClose={() => setPrefixOpen(false)}
        />
      )}
      {rpkiOpen && (
        <RpkiDetailModal
          market={market}
          onClose={() => setRpkiOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Ratio tooltip ────────────────────────────────────────────────────────────
function RatioTooltip({ market, meta }) {
  const [show, setShow] = useState(false);
  const ratio = market.ratio;

  // Human-readable interpretation of current ratio
  const ratioLine = (() => {
    if (ratio === null || !market.ok) return null;
    const pct = Math.round(Math.abs(ratio - 1) * 100);
    if (ratio === 1.0) return "Latency exactly at baseline.";
    if (ratio < 1.0)  return `Latency ${pct}% below baseline — faster than usual.`;
    if (ratio < 2.0)  return `Latency ${pct}% above baseline — normal variation.`;
    if (ratio < 4.5)  return `Latency ${pct}% above baseline — degraded.`;
    return `Latency ${pct}% above baseline — likely outage.`;
  })();

  return (
    <div
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={e => { e.stopPropagation(); setShow(true); }}
      onMouseLeave={() => setShow(false)}
      onClick={e => e.stopPropagation()}
    >
      <span style={{
        fontSize: 9, fontWeight: 800, letterSpacing: "0.4px",
        color: meta.color, background: meta.bg, border: `1px solid ${meta.border}`,
        borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap",
        cursor: "help",
      }}>
        {meta.label}{ratio !== null && market.ok ? ` ${ratio}×` : ""}
      </span>

      {show && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 9999,
          background: "#1e293b", border: "1px solid #334155", borderRadius: 8,
          padding: "10px 12px", minWidth: 220, maxWidth: 270,
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          pointerEvents: "none",
        }}>
          {/* Ratio explanation */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.4px" }}>
            LATENCY RATIO
          </div>
          <div style={{ fontSize: 11, color: "#e2e8f0", lineHeight: 1.5, marginBottom: 8 }}>
            <span style={{ color: "#f8fafc", fontWeight: 600 }}>{ratio !== null && market.ok ? `${ratio}×` : "—"}</span>
            {" = current avg RTT ÷ 4h rolling baseline"}
            {market.baseline_rtt ? ` (${market.baseline_rtt} ms)` : ""}.
          </div>
          {ratioLine && (
            <div style={{ fontSize: 11, color: meta.color, fontWeight: 600, marginBottom: 8 }}>
              {ratioLine}
            </div>
          )}

          {/* Thresholds */}
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginBottom: 4, letterSpacing: "0.4px" }}>
            THRESHOLDS
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              { label: "OK",      range: "< 2×",   color: "#22c55e" },
              { label: "WARNING", range: "≥ 2×",   color: "#f59e0b" },
              { label: "OUTAGE",  range: "≥ 4.5×", color: "#ef4444" },
            ].map(t => (
              <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, color: t.color,
                  background: `${t.color}18`, border: `1px solid ${t.color}44`,
                  borderRadius: 3, padding: "1px 5px", minWidth: 46, textAlign: "center",
                }}>{t.label}</span>
                <span style={{ fontSize: 10, color: "#94a3b8" }}>{t.range} above baseline</span>
              </div>
            ))}
          </div>

          {/* Probe info */}
          {market.totalProbes > 0 && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #334155",
              fontSize: 10, color: "#64748b" }}>
              {market.totalProbes} Vodafone AS{market.asn} probe{market.totalProbes !== 1 ? "s" : ""} · RIPE Atlas msm #1001
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── BGP peers tooltip ────────────────────────────────────────────────────────
// Shown on hover of the X/Y peers value in the card. Explains the metric with
// a concrete normal example and an incident example using the current market's flag.
function BgpPeersTooltip({ market }) {
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const bgp   = market.bgp?.current;
  const color = market.bgp?.status === "ok"      ? "#16a34a"
              : market.bgp?.status === "warning" ? "#b45309"
              : market.bgp?.status === "outage"  ? "#dc2626" : "#9ca3af";
  const total  = bgp?.total_ris_peers  ?? 329;
  const seeing = bgp?.ris_peers_seeing ?? null;
  const pct    = bgp?.visibility_pct   ?? null;

  function handleEnter(e) {
    e.stopPropagation();
    if (ref.current) {
      const r    = ref.current.getBoundingClientRect();
      const TIP_H = 315;  // estimated tooltip height
      const TIP_W = 268;
      const left  = Math.min(Math.max(8, r.left), window.innerWidth - TIP_W - 8);
      // Flip above if not enough space below
      const spaceBelow = window.innerHeight - r.bottom - 8;
      const top = spaceBelow >= TIP_H
        ? r.bottom + 6
        : Math.max(8, r.top - TIP_H - 6);
      setPos({ top, left });
    }
  }

  return (
    <div
      ref={ref}
      style={{ position: "relative" }}
      onMouseEnter={handleEnter}
      onMouseLeave={() => setPos(null)}
      onClick={e => e.stopPropagation()}
    >
      <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, cursor: "help" }}>BGP VISIBLE ⓘ</div>
      <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", lineHeight: 1.1, color, cursor: "help" }}>
        {seeing != null ? `${seeing}/${total}` : pct != null ? `${pct}%` : "—"}
      </div>
      {pct != null && <div style={{ fontSize: 9, color: T.muted }}>{pct}% visible</div>}

      {pos && (
        <div style={{
          position: "fixed", top: pos.top, left: pos.left, zIndex: 9999,
          background: "#1e293b", border: "1px solid #334155", borderRadius: 10,
          padding: "11px 13px", width: 260,
          boxShadow: "0 10px 28px rgba(0,0,0,0.4)", pointerEvents: "none",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", letterSpacing: "0.5px", marginBottom: 7 }}>
            BGP VISIBILITY
          </div>

          {/* Core explanation */}
          <div style={{ fontSize: 11, color: "#cbd5e1", lineHeight: 1.55, marginBottom: 9 }}>
            RIPE operates <span style={{ color: "#f1f5f9", fontWeight: 700 }}>{total} BGP observers</span> worldwide.
            Each is asked: <em style={{ color: "#94a3b8" }}>"can you route traffic to AS{market.asn}?"</em>
          </div>

          {/* Examples */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 9 }}>
            <div style={{ background: "#14532d22", border: "1px solid #16a34a44", borderRadius: 6, padding: "6px 8px" }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#4ade80", letterSpacing: "0.4px", marginBottom: 2 }}>
                ✓ NORMAL
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#86efac" }}>
                {total}/{total} {market.flag}
              </div>
              <div style={{ fontSize: 10, color: "#4ade80", opacity: 0.8, marginTop: 1 }}>
                All observers reach {market.name}. Healthy.
              </div>
            </div>

            <div style={{ background: "#7f1d1d22", border: "1px solid #ef444444", borderRadius: 6, padding: "6px 8px" }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: "#f87171", letterSpacing: "0.4px", marginBottom: 2 }}>
                ✗ INCIDENT EXAMPLE
              </div>
              <div style={{ fontFamily: "monospace", fontSize: 11, color: "#fca5a5" }}>
                200/{total} {market.flag} · {total}/{total} 🇩🇪
              </div>
              <div style={{ fontSize: 10, color: "#f87171", opacity: 0.85, marginTop: 1, lineHeight: 1.4 }}>
                Problem in {market.name} only — {total - 200} observers can't reach AS{market.asn}. Germany fine.
              </div>
            </div>
          </div>

          {/* Thresholds */}
          <div style={{ borderTop: "1px solid #334155", paddingTop: 7, display: "flex", flexDirection: "column", gap: 3 }}>
            {[
              { label: "OK",      range: "≥ 95% peers seeing this AS", color: "#22c55e" },
              { label: "WARNING", range: "≥ 80%",                       color: "#f59e0b" },
              { label: "OUTAGE",  range: "< 80%",                       color: "#ef4444" },
            ].map(t => (
              <div key={t.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, color: t.color,
                  background: `${t.color}18`, border: `1px solid ${t.color}44`,
                  borderRadius: 3, padding: "1px 5px", minWidth: 46, textAlign: "center",
                }}>{t.label}</span>
                <span style={{ fontSize: 10, color: "#64748b" }}>{t.range}</span>
              </div>
            ))}
          </div>
        </div>
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
        <RatioTooltip market={market} meta={meta} />
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
          <BgpPeersTooltip market={market} />
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

      {/* Alert badges — only render when at least one control-plane / external
          signal is in warn or alert state, so healthy cards stay uncluttered */}
      {(() => {
        const badges = [];
        const risSt   = market.ris?.status;
        const radarSt = market.radar?.status;
        const iodaSt  = market.ioda?.status;
        const bgpSt   = market.bgp?.status;
        const tone = s => s === "alert" || s === "outage"
          ? { fg: "#dc2626", bg: "#fee2e2", bd: "#fca5a5" }
          : s === "warn" || s === "warning"
          ? { fg: "#b45309", bg: "#fef3c7", bd: "#fcd34d" }
          : null;

        if (tone(risSt)) {
          const wd = market.ris?.withdrawals1h ?? 0;
          badges.push({ key: "ris", icon: "🔄", label: "RIS", value: `${wd} wd/h`, ...tone(risSt) });
        }
        if (tone(radarSt)) {
          const n = market.radar?.alertCount ?? 0;
          badges.push({ key: "radar", icon: "☁️", label: "Radar", value: `${n} evt`, ...tone(radarSt) });
        }
        if (tone(iodaSt)) {
          const n = market.ioda?.activeCount ?? (market.ioda?.events?.filter(e => e.active).length ?? 0);
          badges.push({ key: "ioda", icon: "🌐", label: "IODA", value: n > 0 ? `${n} active` : "signal", ...tone(iodaSt) });
        }
        if (tone(bgpSt)) {
          const vis = market.bgp?.current?.visibility_pct;
          badges.push({ key: "bgp", icon: "🔗", label: "BGP", value: vis != null ? `${vis}%` : "degraded", ...tone(bgpSt) });
        }

        if (!badges.length) return null;
        return (
          <div style={{
            display: "flex", flexWrap: "wrap", gap: 4,
            marginTop: 7, paddingTop: 6, borderTop: `1px solid ${T.border}`,
          }}>
            {badges.map(b => (
              <div key={b.key} style={{
                display: "inline-flex", alignItems: "center", gap: 3,
                fontSize: 9, fontWeight: 700, fontFamily: "monospace",
                background: b.bg, color: b.fg,
                border: `1px solid ${b.bd}`, borderRadius: 4,
                padding: "2px 5px",
              }}>
                <span style={{ fontSize: 10 }}>{b.icon}</span>
                <span>{b.label}</span>
                <span style={{ opacity: 0.85 }}>{b.value}</span>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Signal dots + correlation score row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 5,
        marginTop: 7, paddingTop: 6, borderTop: `1px solid ${T.border}`,
      }}>
        {[
          { key: "atlas", label: "Atlas", status: market.status },
          { key: "bgp",   label: "BGP",   status: market.bgp?.status },
          { key: "ioda",  label: "IODA",  status: market.ioda?.status },
          { key: "radar", label: "Radar", status: market.radar?.status },
          { key: "ris",   label: "RIS",   status: market.ris?.status },
        ].map(sig => (
          <div key={sig.key} title={`${sig.label}: ${sig.status || "no data"}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor(sig.status) }} />
            <span style={{ fontSize: 7, color: T.muted }}>{sig.label}</span>
          </div>
        ))}
        <div style={{ flex: 1 }} />
        {market.correlation?.score != null && (
          <span style={{
            fontSize: 10, fontWeight: 800, fontFamily: "monospace",
            color: scoreColor(market.correlation.score),
            background: `${scoreColor(market.correlation.score)}18`,
            border: `1px solid ${scoreColor(market.correlation.score)}40`,
            borderRadius: 4, padding: "1px 5px",
          }}>{market.correlation.score}</span>
        )}
        <span style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>details →</span>
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

// ─── Correlation Analysis panel (always visible below market cards) ───────────
function CorrelationPanel({ markets }) {
  const [collapsed, setCollapsed] = useState(false);
  const signals = [
    { key: "atlas",  label: "Atlas",  getStatus: m => m.status },
    { key: "bgp",    label: "BGP",    getStatus: m => m.bgp?.status },
    { key: "ioda",   label: "IODA",   getStatus: m => m.ioda?.status },
    { key: "radar",  label: "Radar",  getStatus: m => m.radar?.status },
    { key: "ris",    label: "RIS",    getStatus: m => m.ris?.status },
  ];

  const active = markets.filter(m => m.correlation?.score != null && m.correlation.score < 90);

  return (
    <div style={{
      marginTop: 20,
      border: `1px solid ${T.border}`, borderRadius: 10,
      background: T.surface, overflow: "hidden",
    }}>
      {/* Header */}
      <div onClick={() => setCollapsed(c => !c)} style={{
        padding: "12px 18px", borderBottom: collapsed ? "none" : `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
        userSelect: "none",
      }}>
        <span style={{ fontSize: 16 }}>🔗</span>
        <span style={{ fontWeight: 800, fontSize: 14, color: T.text }}>
          Correlation Analysis
        </span>
        <span style={{ fontSize: 11, color: T.muted }}>
          · {markets.filter(m => m.ok).length}/{markets.length} markets · 5 signal layers
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: T.muted }}>
          {collapsed ? "▼ expand" : "▲ collapse"}
        </span>
      </div>

      {!collapsed && <div style={{ padding: "14px 18px" }}>
        {/* Signal matrix */}
        <div style={{ overflowX: "auto", marginBottom: 10 }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 2px" }}>
            <thead>
              <tr>
                <th style={{
                  fontSize: 9, fontWeight: 700, color: T.muted, textAlign: "left",
                  padding: "0 0 6px", letterSpacing: "0.5px",
                }}>MARKET</th>
                {signals.map(s => (
                  <th key={s.key} style={{
                    fontSize: 9, fontWeight: 700, color: T.muted,
                    textAlign: "center", padding: "0 12px 6px", letterSpacing: "0.5px",
                  }}>{s.label.toUpperCase()}</th>
                ))}
                <th style={{
                  fontSize: 9, fontWeight: 700, color: T.muted, textAlign: "right",
                  padding: "0 0 6px 12px", letterSpacing: "0.5px",
                }}>SCORE</th>
              </tr>
            </thead>
            <tbody>
              {markets.map(m => {
                const score = m.correlation?.score;
                const sc    = scoreColor(score);
                return (
                  <tr key={m.id} style={{ background: T.bg }}>
                    <td style={{
                      padding: "5px 8px", fontSize: 11, fontWeight: 600,
                      color: T.text, whiteSpace: "nowrap", borderRadius: "6px 0 0 6px",
                    }}>
                      {m.flag} {m.name}
                    </td>
                    {signals.map(s => (
                      <td key={s.key} style={{ textAlign: "center", padding: "5px 12px" }}>
                        <div title={s.getStatus(m) || "no data"} style={{
                          width: 10, height: 10, borderRadius: "50%",
                          background: dotColor(s.getStatus(m)),
                          margin: "0 auto",
                        }} />
                      </td>
                    ))}
                    <td style={{
                      textAlign: "right", padding: "5px 8px 5px 12px",
                      borderRadius: "0 6px 6px 0",
                    }}>
                      {score != null ? (
                        <span style={{
                          fontSize: 11, fontWeight: 800, fontFamily: "monospace", color: sc,
                        }}>{score}</span>
                      ) : (
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{
          display: "flex", gap: 12, flexWrap: "wrap",
          fontSize: 9, color: T.muted, alignItems: "center", marginBottom: 12,
        }}>
          {[
            { color: "#16a34a", label: "OK" },
            { color: "#f59e0b", label: "Warning" },
            { color: "#dc2626", label: "Alert / Outage" },
            { color: "#d1d5db", label: "No data" },
          ].map(l => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />
              <span>{l.label}</span>
            </div>
          ))}
          <span style={{ marginLeft: "auto", fontStyle: "italic" }}>
            Score: 90–100 OK · 70–89 Degraded · 40–69 Warning · &lt;40 Incident
          </span>
        </div>

        {/* Active correlations */}
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>
            Active Correlations {active.length > 0 ? `(${active.length})` : ""}
          </div>

          {active.length === 0 ? (
            <div style={{
              padding: "9px 12px", background: "#f0fdf4",
              border: "1px solid #86efac", borderRadius: 7,
              fontSize: 11, color: "#16a34a", fontWeight: 600,
            }}>
              ✓ No active correlations — all market scores ≥ 90
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {active.map(m => {
                const score = m.correlation.score;
                const sc    = scoreColor(score);
                const bgC   = score < 40 ? "#fef2f2" : score < 70 ? "#fef3c7" : "#fffbeb";
                const brC   = score < 40 ? "#fca5a5" : score < 70 ? "#fcd34d" : "#fde68a";
                return (
                  <div key={m.id} style={{
                    padding: "9px 12px", borderRadius: 7,
                    background: bgC, border: `1px solid ${brC}`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 14 }}>{m.flag}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{m.name}</span>
                      <span style={{ fontSize: 9, color: T.muted }}>AS{m.asn}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 800, fontFamily: "monospace",
                        color: sc, background: `${sc}14`, border: `1px solid ${sc}44`,
                        borderRadius: 4, padding: "1px 6px", marginLeft: "auto",
                      }}>{score}/100</span>
                    </div>
                    {m.correlation.insight && (
                      <div style={{ fontSize: 11, color: T.text, lineHeight: 1.5 }}>
                        {m.correlation.insight}
                      </div>
                    )}
                    {m.correlation.alerts?.length > 0 && (
                      <div style={{ marginTop: 5, display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {m.correlation.alerts.map(a => (
                          <span key={a} style={{
                            fontSize: 9, fontWeight: 700,
                            background: "#fee2e2", color: "#dc2626",
                            border: "1px solid #fca5a5", borderRadius: 4, padding: "1px 6px",
                          }}>{a.toUpperCase()}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>}
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
        if (!cancelled) {
          setMarkets(data);
          setLastRefresh(new Date());
          // Keep DetailPanel fresh if it's open
          setSelected(prev => prev ? (data.find(m => m.id === prev.id) || prev) : null);
        }
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
      flex: 1, minHeight: 0,
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

      {!loading && markets.length === 0 && (
        <div style={{
          padding: "32px 0", textAlign: "center", color: T.muted, fontSize: 13,
        }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📡</div>
          <div style={{ fontWeight: 600, marginBottom: 4, color: T.text }}>No data yet</div>
          <div>Backend poller is starting or unreachable — retrying every 30s.</div>
        </div>
      )}

      {!loading && markets.length > 0 && (
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

      {!loading && markets.length > 0 && <CorrelationPanel markets={markets} />}

      {!loading && <MetricsGlossary />}

      {selected && (
        <DetailPanel market={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
