// ─── Network Health View ──────────────────────────────────────────────────────
// RIPE Atlas latency + packet-loss data per Vodafone market.
// Source: GET /api/network-health (polls RIPE Atlas msm #1001 every 5 min)
//
// Ratio model (same as Downdetector): ok < 2×  warning ≥ 2×  outage ≥ 4.5×

import { useState, useEffect } from "react";
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

// ─── Trend chart (SVG) ────────────────────────────────────────────────────────
function TrendChart({ history, baseline, width = 200, height = 48, showAxes = false }) {
  if (!history || history.length < 1) {
    return (
      <div style={{
        width, height,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `1px dashed ${T.border}`, borderRadius: 4,
        fontSize: 9, color: T.muted,
      }}>
        collecting data…
      </div>
    );
  }

  const values  = history.map(h => h.avg_rtt);
  const warn2x  = baseline ? baseline * 2   : null;
  const out45x  = baseline ? baseline * 4.5 : null;
  const maxVal  = Math.max(...values, warn2x || 0, out45x || 0) * 1.15;
  const minVal  = 0;
  const range   = Math.max(maxVal - minVal, 1);
  const W = width, H = height;
  const toX = i  => values.length === 1 ? W / 2 : (i / (values.length - 1)) * W;
  const toY = v  => H - ((v - minVal) / range) * H;

  const linePts = values.map((v, i) => `${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(" ");
  const areaBot = H;
  const areaPts = `${toX(0)},${areaBot} ${linePts} ${toX(values.length - 1)},${areaBot}`;

  return (
    <svg width={W} height={H} style={{ overflow: "visible", display: "block" }}>
      {/* OK zone fill */}
      {warn2x !== null && (
        <rect x={0} y={toY(warn2x)} width={W} height={Math.max(0, H - toY(warn2x))}
          fill="rgba(34,197,94,0.06)" />
      )}
      {/* Warning zone fill */}
      {warn2x !== null && out45x !== null && (
        <rect x={0} y={toY(out45x)} width={W}
          height={Math.max(0, toY(warn2x) - toY(out45x))}
          fill="rgba(245,158,11,0.06)" />
      )}
      {/* Outage zone fill */}
      {out45x !== null && (
        <rect x={0} y={0} width={W} height={Math.max(0, toY(out45x))}
          fill="rgba(239,68,68,0.05)" />
      )}
      {/* Area under line */}
      {values.length > 1 && (
        <polygon points={areaPts} fill="rgba(59,130,246,0.08)" />
      )}
      {/* Baseline reference */}
      {baseline !== null && (
        <line x1={0} y1={toY(baseline)} x2={W} y2={toY(baseline)}
          stroke="#22c55e" strokeWidth={1} strokeDasharray="4,3" opacity={0.6} />
      )}
      {/* 2× warning line */}
      {warn2x !== null && (
        <line x1={0} y1={toY(warn2x)} x2={W} y2={toY(warn2x)}
          stroke="#f59e0b" strokeWidth={1} strokeDasharray="4,3" opacity={0.5} />
      )}
      {/* Trend line */}
      {values.length > 1 && (
        <polyline points={linePts} fill="none" stroke="#3b82f6" strokeWidth={1.8}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {/* Latest dot */}
      <circle
        cx={toX(values.length - 1)} cy={toY(values[values.length - 1])} r={3}
        fill="#3b82f6" stroke={T.surface} strokeWidth={1.5}
      />
      {/* Y-axis labels (detail mode only) */}
      {showAxes && (
        <>
          <text x={3} y={toY(values[values.length - 1]) - 4}
            fontSize={8} fill="#3b82f6" fontFamily="monospace">
            {values[values.length - 1]}ms
          </text>
          {baseline !== null && (
            <text x={3} y={toY(baseline) - 3} fontSize={7} fill="#16a34a" fontFamily="monospace">
              base {baseline}ms
            </text>
          )}
        </>
      )}
    </svg>
  );
}

// ─── Metric glossary ──────────────────────────────────────────────────────────
function MetricsGlossary() {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      border: `1px solid ${T.border}`, borderRadius: 10,
      background: T.surface, marginTop: 20,
      overflow: "hidden",
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", padding: "12px 18px",
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: 10,
          textAlign: "left",
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

          {/* Target */}
          <div style={{
            marginTop: 14, padding: "10px 14px",
            background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8,
          }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#0369a1", marginBottom: 4 }}>
              📡 Measurement target: k.root-servers.net · 193.0.14.129
            </div>
            <div style={{ fontSize: 11, color: "#075985", lineHeight: 1.6 }}>
              One of the 13 global DNS root servers. Operated by <strong>RIPE NCC</strong> —
              the same organisation that runs RIPE Atlas. Primary node in <strong>Amsterdam</strong>,
              distributed globally via anycast (100+ locations). Each probe contacts
              the geographically closest instance.
              <br /><br />
              <strong>Why this target?</strong> Because the traffic is routed to the nearest
              k-root instance, the RTT mainly reflects: Vodafone access network →
              backbone → Internet exit. It is a good proxy for the path from a Vodafone
              customer to the operator&apos;s Internet edge — not the distance to a remote server.
            </div>
          </div>

          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr",
            gap: 10, marginTop: 10,
          }}>
            {[
              {
                icon: "⏱️", title: "Average Latency (avg RTT)",
                body: `Round-trip time in ms from RIPE Atlas probes inside Vodafone's
                network to k.root-servers.net. Each probe sends 3 ICMP pings every ~4 min.
                A sudden increase indicates congestion or degradation inside Vodafone's
                own network (access, backbone or peering exit).`,
              },
              {
                icon: "📊", title: "P95 Latency (95th percentile)",
                body: `The RTT value that 95% of all pings do not exceed.
                If avg is 15 ms but P95 is 80 ms, 1 in 20 pings experience very high
                latency — users feel it even if the average looks fine.
                Captures frequent worst-case experience that the mean hides.`,
              },
              {
                icon: "📦", title: "Packet Loss",
                body: `% of ICMP pings with no reply within the timeout, aggregated
                across all active probes: (sent − received) / sent × 100.
                0% is normal. >1% signals degradation. >5% indicates a serious
                connectivity or congestion problem.`,
              },
              {
                icon: "🔬", title: "Active Probes",
                body: `Number of physical RIPE Atlas devices inside Vodafone's AS that
                reported results in the last 15 min. Probes are hardware units
                voluntarily installed by Vodafone customers. A sudden drop may indicate
                widespread access failure — or simply that few probes exist in that country
                (fewer probes = lower statistical confidence).`,
              },
            ].map(m => (
              <div key={m.title} style={{
                padding: "10px 12px",
                background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7,
              }}>
                <div style={{ fontWeight: 700, fontSize: 11, color: T.text, marginBottom: 4 }}>
                  {m.icon} {m.title}
                </div>
                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
                  {m.body}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 10, padding: "8px 12px",
            background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7,
            fontSize: 11, color: T.muted, lineHeight: 1.5,
          }}>
            <strong style={{ color: T.text }}>Chart reference lines:</strong>{" "}
            <span style={{ color: "#22c55e" }}>green dashed</span> = 4h rolling baseline ·{" "}
            <span style={{ color: "#f59e0b" }}>amber dashed</span> = 2× warning threshold ·{" "}
            <span style={{ color: "#3b82f6" }}>blue line</span> = avg RTT over time.
            Status thresholds: OK &lt;2× · WARNING ≥2× · OUTAGE ≥4.5× above baseline.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Detail panel (modal) ─────────────────────────────────────────────────────
function DetailPanel({ market, onClose }) {
  const meta = sm(market.status);
  const cur  = market.current;

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
        width: "100%", maxWidth: 560,
        maxHeight: "88vh",
        overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        {/* Header */}
        <div style={{
          padding: "14px 18px",
          borderBottom: `1px solid ${T.border}`,
          background: meta.bg,
          display: "flex", alignItems: "center", gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 24 }}>{market.flag}</span>
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 800, fontSize: 15, color: T.text }}>{market.name}</span>
            <span style={{ fontSize: 11, color: T.muted, marginLeft: 8 }}>AS{market.asn}</span>
          </div>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: "0.5px",
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

          {/* Metrics */}
          {cur ? (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4,1fr)",
              gap: 8, marginBottom: 16,
            }}>
              {[
                { label: "Avg latency",    value: cur.avg_rtt,    unit: "ms",    sub: market.baseline_rtt ? `base ${market.baseline_rtt} ms` : null },
                { label: "P95 latency",    value: cur.p95_rtt,    unit: "ms",    sub: null },
                { label: "Packet loss",    value: cur.loss_pct,   unit: "%",     sub: cur.loss_pct === 0 ? "nominal" : cur.loss_pct < 1 ? "degraded" : "critical" },
                { label: "Active probes",  value: cur.probe_count, unit: "",     sub: `of ${market.totalProbes}` },
              ].map(m2 => (
                <div key={m2.label} style={{
                  padding: "10px 12px", background: T.bg,
                  border: `1px solid ${T.border}`, borderRadius: 8, textAlign: "center",
                }}>
                  <div style={{ fontSize: 9, color: T.muted, fontWeight: 600, marginBottom: 3 }}>
                    {m2.label.toUpperCase()}
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: 800, fontFamily: "monospace",
                    color: market.status === "ok" ? "#16a34a"
                      : market.status === "warning" ? "#b45309" : "#dc2626",
                    lineHeight: 1,
                  }}>
                    {m2.value}
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{m2.unit}</span>
                  </div>
                  {m2.sub && (
                    <div style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>{m2.sub}</div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: 20, textAlign: "center", color: T.muted,
              fontSize: 12, background: T.bg, borderRadius: 8,
              border: `1px solid ${T.border}`, marginBottom: 16,
            }}>
              {market.error || "First measurement in progress…"}
            </div>
          )}

          {/* Chart */}
          <div style={{
            padding: "12px 14px", background: T.bg,
            border: `1px solid ${T.border}`, borderRadius: 8,
          }}>
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "center", marginBottom: 10,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
                Avg RTT trend — last 4h
              </span>
              <span style={{ fontSize: 10, color: T.muted }}>
                {market.history.length} pt{market.history.length !== 1 ? "s" : ""} · 5 min interval
              </span>
            </div>
            <TrendChart
              history={market.history}
              baseline={market.baseline_rtt}
              width={496}
              height={80}
              showAxes
            />
            <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
              <span style={{ fontSize: 9, color: "#22c55e" }}>── baseline (4h avg)</span>
              <span style={{ fontSize: 9, color: "#f59e0b" }}>─ ─ 2× warning</span>
              <span style={{ fontSize: 9, color: "#3b82f6" }}>── avg RTT</span>
            </div>
          </div>

          {/* Technical details */}
          <div style={{
            marginTop: 10, padding: "10px 12px",
            background: T.bg, border: `1px solid ${T.border}`,
            borderRadius: 8, fontSize: 11, color: T.muted, lineHeight: 1.6,
          }}>
            <strong style={{ color: T.text }}>Technical:</strong>{" "}
            Measurement msm #1001 · Target k.root-servers.net 193.0.14.129 (RIPE NCC, Amsterdam + anycast) ·
            AS{market.asn} · {market.totalProbes} probes registered · results window 15 min.
            RTT reflects: Vodafone access → backbone → Internet exit.{" "}
            <a href={`https://atlas.ripe.net/measurements/1001/`}
              target="_blank" rel="noreferrer" style={{ color: "#3b82f6" }}>
              View on RIPE Atlas →
            </a>
          </div>
        </div>
      </div>
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
        background:   T.surface,
        border:       `1.5px solid ${market.ok ? meta.border : T.border}`,
        borderTop:    `3px solid ${market.ok ? meta.color : T.border}`,
        borderRadius: 10,
        padding:      "13px 15px 10px",
        cursor:       "pointer",
        transition:   "box-shadow 0.15s, transform 0.1s",
        display:      "flex", flexDirection: "column", gap: 0,
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
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{market.flag}</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{market.name}</div>
          <div style={{ fontSize: 9, color: T.muted }}>AS{market.asn}</div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.4px",
          color: meta.color, background: meta.bg,
          border: `1px solid ${meta.border}`,
          borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap",
        }}>
          {meta.label}{market.ratio !== null && market.ok ? ` ${market.ratio}×` : ""}
        </span>
      </div>

      {/* Metrics */}
      {cur ? (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "6px 14px", marginBottom: 10,
        }}>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>AVG LATENCY</div>
            <div style={{
              fontSize: 20, fontWeight: 800, fontFamily: "monospace", lineHeight: 1.1,
              color: market.status === "ok"      ? "#16a34a"
                : market.status === "warning"   ? "#b45309" : "#dc2626",
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
              <span style={{ fontSize: 9, color: T.muted, fontWeight: 400 }}>/{market.totalProbes}</span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          fontSize: 11, color: T.muted, fontStyle: "italic",
          minHeight: 50, display: "flex", alignItems: "center", marginBottom: 10,
        }}>
          {market.error
            ? <span style={{ color: "#b45309" }}>⚠ {market.error}</span>
            : "First measurement in progress…"
          }
        </div>
      )}

      {/* Sparkline */}
      <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
        <TrendChart
          history={market.history}
          baseline={market.baseline_rtt}
          width={210}
          height={36}
        />
      </div>

      <div style={{
        textAlign: "right", fontSize: 9, color: T.muted,
        fontWeight: 600, marginTop: 4,
      }}>
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
        if (!cancelled) {
          setMarkets(data);
          setLastRefresh(new Date());
        }
      } catch { /* retry on next interval */ }
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

  const hasData = markets.some(m => m.ok);

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      overflowY: "auto", padding: "20px 24px", background: T.bg,
    }}>

      {/* Page header */}
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
              Latency and packet loss from physical RIPE Atlas probes inside Vodafone
              networks to <strong>k.root-servers.net</strong> (193.0.14.129 · RIPE NCC ·
              Amsterdam + anycast global). Independent technical signal — complements
              Downdetector perception data.
              <br />
              <span style={{ fontSize: 11 }}>
                Source: RIPE Atlas msm #1001 · dynamic baseline (4h rolling avg) ·
                thresholds: OK &lt;2× · WARNING ≥2× · OUTAGE ≥4.5×
              </span>
            </div>
          </div>
          {hasData && (
            <div style={{
              padding: "10px 16px", background: T.surface,
              border: `1px solid ${T.border}`, borderRadius: 8, flexShrink: 0,
            }}>
              <SummaryBar markets={markets} />
            </div>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 10, color: T.muted, fontSize: 13,
        }}>
          <span style={{ fontSize: 18, animation: "spin 1s linear infinite" }}>⟳</span>
          Loading network health data…
        </div>
      )}

      {/* Market grid */}
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

      {/* Glossary — collapsed by default */}
      {!loading && <MetricsGlossary />}

      {/* Detail modal */}
      {selected && (
        <DetailPanel market={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
