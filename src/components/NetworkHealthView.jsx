// ─── Network Health View ──────────────────────────────────────────────────────
// Displays RIPE Atlas latency + packet-loss data per Vodafone market.
// Data source: GET /api/network-health (polling RIPE Atlas msm #1001 every 5min)
//
// k.root-servers.net (193.0.14.129):
//   Operated by RIPE NCC · Primary node Amsterdam · Anycast in 100+ locations
//   Traffic routes to nearest instance → RTT reflects: Vodafone access + backbone
//   + Internet exit. A good proxy for "how good is the path from a Vodafone
//   customer to the Internet edge?"
//
// Same ratio model as Downdetector: ok < 2× baseline, warning ≥ 2×, outage ≥ 4.5×

import { useState, useEffect } from "react";
import { T } from "../data/constants.js";

// ─── API base ─────────────────────────────────────────────────────────────────
function apiBase() {
  const ws = import.meta.env.VITE_POLLER_WS || "ws://localhost:4000";
  if (ws.startsWith("wss://")) return ws.replace(/^wss:\/\//, "https://");
  return ws.replace(/^ws:\/\//, "http://");
}

// ─── Status colours ───────────────────────────────────────────────────────────
const STATUS_META = {
  ok:      { label: "OK",      color: "#16a34a", bg: "#f0fdf4", border: "#86efac" },
  warning: { label: "WARNING", color: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  outage:  { label: "OUTAGE",  color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  unknown: { label: "NO DATA", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
};

function statusMeta(status) { return STATUS_META[status] || STATUS_META.unknown; }

// ─── Sparkline ────────────────────────────────────────────────────────────────
function Sparkline({ history, baseline, width = 120, height = 32 }) {
  if (!history || history.length < 2) {
    return <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ fontSize: 9, color: T.muted }}>no data</span>
    </div>;
  }

  const values = history.map(h => h.avg_rtt);
  const max    = Math.max(...values, baseline ? baseline * 5 : 0) * 1.1;
  const min    = 0;
  const range  = Math.max(max - min, 1);

  const W = width;
  const H = height;
  const toX = i => (i / (values.length - 1)) * W;
  const toY = v => H - ((v - min) / range) * H;

  const pts = values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");

  // Threshold lines
  const warn2x   = baseline ? baseline * 2   : null;
  const outage45 = baseline ? baseline * 4.5 : null;
  const baseY    = baseline ? toY(baseline)  : null;
  const warnY    = warn2x   ? toY(warn2x)   : null;
  const outageY  = outage45 ? toY(outage45) : null;

  return (
    <svg width={W} height={H} style={{ overflow: "visible", display: "block" }}>
      {/* Baseline zone (below 2×) */}
      {baseY !== null && warnY !== null && (
        <rect x={0} y={baseY} width={W} height={Math.max(0, H - baseY)}
          fill="rgba(34,197,94,0.06)" />
      )}
      {/* Warning zone (2× – 4.5×) */}
      {warnY !== null && outageY !== null && outageY < warnY && (
        <rect x={0} y={outageY} width={W} height={Math.max(0, warnY - outageY)}
          fill="rgba(245,158,11,0.07)" />
      )}
      {/* Baseline reference line */}
      {baseY !== null && (
        <line x1={0} y1={baseY} x2={W} y2={baseY}
          stroke="#22c55e" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
      )}
      {/* 2× warning line */}
      {warnY !== null && (
        <line x1={0} y1={warnY} x2={W} y2={warnY}
          stroke="#f59e0b" strokeWidth={1} strokeDasharray="3,3" opacity={0.5} />
      )}
      {/* Trend polyline */}
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth={1.5}
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Latest value dot */}
      <circle cx={toX(values.length - 1)} cy={toY(values[values.length - 1])} r={2.5}
        fill="#3b82f6" />
    </svg>
  );
}

// ─── Metric tooltip box ───────────────────────────────────────────────────────
function MetricExplainer({ title, children }) {
  return (
    <div style={{
      background: "#f8faff",
      border: "1px solid #dbeafe",
      borderRadius: 6,
      padding: "8px 10px",
      marginBottom: 8,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 3 }}>
        {title}
      </div>
      <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}

// ─── Detail panel (expanded card) ────────────────────────────────────────────
function DetailPanel({ market, onClose }) {
  const sm  = statusMeta(market.status);
  const cur = market.current;

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
        width: "100%",
        maxWidth: 600,
        maxHeight: "90vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: `1px solid ${T.border}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: sm.bg,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 24 }}>{market.flag}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: T.text }}>
              {market.name}
              <span style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginLeft: 8 }}>
                AS{market.asn}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>
              {market.totalProbes} sondas activas · msm #{1001} · k.root-servers.net
            </div>
          </div>
          <span style={{
            fontSize: 11, fontWeight: 800, color: sm.color,
            background: sm.bg, border: `1px solid ${sm.border}`,
            borderRadius: 6, padding: "3px 10px", letterSpacing: "0.5px",
          }}>
            {sm.label}
            {market.ratio !== null && <span style={{ opacity: 0.8 }}> · {market.ratio}×</span>}
          </span>
          <button onClick={onClose} style={{
            border: "none", background: "none", cursor: "pointer",
            fontSize: 18, color: T.muted, padding: "2px 6px", borderRadius: 4,
          }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>

          {/* Metrics grid */}
          {cur ? (
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 10, marginBottom: 18,
            }}>
              {[
                {
                  label: "Latencia media",
                  value: `${cur.avg_rtt} ms`,
                  good: cur.avg_rtt < (market.baseline_rtt || 999) * 2,
                },
                {
                  label: "P95 latencia",
                  value: `${cur.p95_rtt} ms`,
                  good: cur.p95_rtt < (market.baseline_rtt || 999) * 3,
                },
                {
                  label: "Pérdida paquetes",
                  value: `${cur.loss_pct} %`,
                  good: cur.loss_pct < 1,
                  bad: cur.loss_pct >= 5,
                },
                {
                  label: "Sondas activas",
                  value: `${cur.probe_count}`,
                  good: cur.probe_count > 0,
                  sub: `de ${market.totalProbes} en AS${market.asn}`,
                },
              ].map(m2 => (
                <div key={m2.label} style={{
                  padding: "12px 14px",
                  background: T.bg,
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                }}>
                  <div style={{ fontSize: 10, color: T.muted, fontWeight: 600, marginBottom: 4 }}>
                    {m2.label}
                  </div>
                  <div style={{
                    fontSize: 22, fontWeight: 800, fontFamily: "monospace",
                    color: m2.bad ? "#dc2626" : m2.good ? "#16a34a" : "#b45309",
                  }}>
                    {m2.value}
                  </div>
                  {m2.sub && (
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{m2.sub}</div>
                  )}
                  {market.baseline_rtt && m2.label === "Latencia media" && (
                    <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
                      base {market.baseline_rtt} ms (4h)
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{
              padding: "24px", textAlign: "center", color: T.muted,
              fontSize: 12, marginBottom: 18,
              background: T.bg, borderRadius: 8, border: `1px solid ${T.border}`,
            }}>
              {market.error || "Sin datos — primera medición en curso…"}
            </div>
          )}

          {/* Sparkline */}
          {market.history && market.history.length >= 2 && (
            <div style={{
              marginBottom: 18, padding: "12px 14px",
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
            }}>
              <div style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", marginBottom: 8,
              }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
                  Tendencia — últimas 4h (avg RTT)
                </span>
                <span style={{ fontSize: 10, color: T.muted }}>
                  {market.history.length} puntos · intervalo 5 min
                </span>
              </div>
              <Sparkline
                history={market.history}
                baseline={market.baseline_rtt}
                width={530}
                height={60}
              />
              <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                <span style={{ fontSize: 9, color: "#22c55e" }}>── baseline</span>
                <span style={{ fontSize: 9, color: "#f59e0b" }}>─ ─ 2× warning</span>
                <span style={{ fontSize: 9, color: "#3b82f6" }}>── RTT avg</span>
              </div>
            </div>
          )}

          {/* Metric explanations */}
          <div style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>
              ℹ️ Qué mide cada métrica
            </div>

            <MetricExplainer title="📡 Target: k.root-servers.net · 193.0.14.129">
              Uno de los 13 servidores raíz del DNS global. Operado directamente
              por <strong>RIPE NCC</strong> (la misma organización que gestiona RIPE Atlas).
              Nodo primario en <strong>Ámsterdam</strong>, distribuido en 100+ ubicaciones
              vía anycast — cada sonda contacta la instancia geográficamente más cercana.
              Es el target ideal: infraestructura de RIPE, siempre accesible, sin
              restricciones de terceros.
            </MetricExplainer>

            <MetricExplainer title="⏱️ Latencia media (avg RTT)">
              RTT promedio en ms de los pings ICMP enviados desde las sondas físicas RIPE Atlas
              instaladas en la red Vodafone (AS{market.asn}) hacia k.root-servers.net.
              <br /><br />
              <strong>Cómo se mide:</strong> cada sonda envía 3 pings ICMP cada ~4 minutos.
              El RTT incluye: red de acceso Vodafone → backbone Vodafone → peering → nodo
              anycast k-root más cercano. Como el tráfico se enruta al nodo k-root más cercano,
              este indicador refleja principalmente la calidad del <strong>camino usuario → salida
              Internet</strong> de Vodafone, no la distancia al destino.
              <br /><br />
              <strong>Qué indica un aumento:</strong> congestión o degradación dentro de la
              propia red Vodafone (acceso, backbone o peering de salida).
            </MetricExplainer>

            <MetricExplainer title="📊 P95 Latencia (percentil 95)">
              El RTT que el 95% de los pings no supera. Si el avg es 15ms pero el P95
              es 80ms, significa que 1 de cada 20 pings experimenta latencia muy alta —
              aunque la media parezca bien.
              <br /><br />
              <strong>Por qué importa:</strong> la media puede ocultar ráfagas de congestión
              que afectan a un subconjunto de usuarios. El P95 captura la
              <strong> peor experiencia frecuente</strong> antes de que se vea en la media.
            </MetricExplainer>

            <MetricExplainer title="📦 Pérdida de paquetes">
              Porcentaje de pings ICMP que no reciben respuesta (echo-reply) dentro del
              timeout. Se calcula como: (enviados − recibidos) / enviados × 100, agregado
              sobre todas las sondas activas del AS.
              <br /><br />
              <strong>Umbrales:</strong> 0% es normal. {">"}1% señala degradación. {">"}5%
              indica problema serio de conectividad o congestión severa.
            </MetricExplainer>

            <MetricExplainer title="🔬 Sondas activas en AS{market.asn}">
              Número de sondas físicas RIPE Atlas instaladas en redes de usuarios dentro
              del AS de Vodafone {market.name} que han reportado resultados en los últimos
              15 minutos. Las sondas son dispositivos hardware instalados voluntariamente
              por usuarios de Vodafone.
              <br /><br />
              <strong>Total en AS{market.asn}:</strong> {market.totalProbes} sondas registradas.
              Si el número de sondas activas cae bruscamente puede indicar un fallo de
              acceso generalizado — o simplemente que hay pocas sondas en este país (menos
              sondas = menos representatividad estadística).
            </MetricExplainer>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Market card ──────────────────────────────────────────────────────────────
function MarketCard({ market, onClick }) {
  const sm  = statusMeta(market.status);
  const cur = market.current;

  return (
    <div
      onClick={onClick}
      style={{
        background:   T.surface,
        border:       `1.5px solid ${market.ok ? sm.border : T.border}`,
        borderTop:    `3px solid ${market.ok ? sm.color : T.border}`,
        borderRadius: 10,
        padding:      "14px 16px",
        cursor:       "pointer",
        transition:   "box-shadow 0.15s, transform 0.1s",
        position:     "relative",
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
          <div style={{ fontSize: 10, color: T.muted }}>AS{market.asn}</div>
        </div>
        <span style={{
          fontSize: 9, fontWeight: 800, letterSpacing: "0.5px",
          color: sm.color, background: sm.bg,
          border: `1px solid ${sm.border}`,
          borderRadius: 5, padding: "2px 7px",
        }}>
          {sm.label}
          {market.ratio !== null && ` ${market.ratio}×`}
        </span>
      </div>

      {/* Metrics row */}
      {cur ? (
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr",
          gap: "6px 12px", marginBottom: 10,
        }}>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>Latencia avg</div>
            <div style={{
              fontSize: 18, fontWeight: 800, fontFamily: "monospace",
              color: market.status === "ok" ? "#16a34a"
                : market.status === "warning" ? "#b45309" : "#dc2626",
            }}>
              {cur.avg_rtt}<span style={{ fontSize: 11, fontWeight: 600 }}> ms</span>
            </div>
            {market.baseline_rtt && (
              <div style={{ fontSize: 9, color: T.muted }}>base {market.baseline_rtt} ms</div>
            )}
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>Pérdida pkts</div>
            <div style={{
              fontSize: 18, fontWeight: 800, fontFamily: "monospace",
              color: cur.loss_pct === 0 ? "#16a34a"
                : cur.loss_pct < 1 ? "#b45309" : "#dc2626",
            }}>
              {cur.loss_pct}<span style={{ fontSize: 11, fontWeight: 600 }}> %</span>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>P95 latencia</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: T.text }}>
              {cur.p95_rtt} ms
            </div>
          </div>
          <div>
            <div style={{ fontSize: 9, color: T.muted, fontWeight: 600 }}>Sondas activas</div>
            <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: T.text }}>
              {cur.probe_count}
              <span style={{ fontSize: 9, color: T.muted, fontWeight: 400 }}>
                {" "}/ {market.totalProbes}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          fontSize: 11, color: T.muted, fontStyle: "italic",
          marginBottom: 10, minHeight: 52,
          display: "flex", alignItems: "center",
        }}>
          {market.error
            ? <span style={{ color: "#b45309" }}>⚠ {market.error}</span>
            : "Primera medición en curso…"
          }
        </div>
      )}

      {/* Sparkline */}
      {market.history && market.history.length >= 3 && (
        <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
          <Sparkline
            history={market.history}
            baseline={market.baseline_rtt}
            width={200}
            height={28}
          />
        </div>
      )}

      {/* Details cue */}
      <div style={{
        position: "absolute", bottom: 8, right: 10,
        fontSize: 9, color: T.muted, fontWeight: 600,
      }}>
        ver detalle →
      </div>
    </div>
  );
}

// ─── Summary bar ─────────────────────────────────────────────────────────────
function SummaryBar({ markets }) {
  const counts = { ok: 0, warning: 0, outage: 0, unknown: 0 };
  for (const m of markets) counts[m.status] = (counts[m.status] || 0) + 1;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
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
  const [markets, setMarkets]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [_error, setError]          = useState(null);
  const [selected, setSelected]     = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [noKey, setNoKey]           = useState(false);

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
          setError(null);
          // If all markets have error containing "RIPE_ATLAS_KEY", show setup hint
          const allNoKey = data.every(m => !m.ok && m.error?.includes("RIPE_ATLAS_KEY"));
          setNoKey(allNoKey);
        }
      } catch (e) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 30_000); // refresh every 30s
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  function fmtRefresh(d) {
    if (!d) return "—";
    const diff = Math.round((Date.now() - d.getTime()) / 1000);
    if (diff < 5) return "just now";
    if (diff < 60) return `${diff}s ago`;
    return `${Math.round(diff / 60)}m ago`;
  }

  const hasData = markets.some(m => m.ok);

  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      overflowY: "auto", padding: "20px 24px",
      background: T.bg,
    }}>

      {/* Page header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 20 }}>🌐</span>
              <span style={{ fontWeight: 800, fontSize: 18, color: T.text }}>
                Network Health — RIPE Atlas
              </span>
              {lastRefresh && (
                <span style={{ fontSize: 11, color: T.muted, fontWeight: 500 }}>
                  · actualizado {fmtRefresh(lastRefresh)}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5, maxWidth: 680 }}>
              Latencia y pérdida de paquetes desde sondas físicas RIPE Atlas en redes
              Vodafone hacia <strong>k.root-servers.net</strong> (193.0.14.129, RIPE NCC,
              Ámsterdam + anycast global). Señal técnica independiente — complementa los
              datos de percepción de Downdetector.
              <br />
              <span style={{ fontSize: 11 }}>
                Fuente: <em>RIPE Atlas msm #{1001}</em> · baseline dinámico (media 4h) ·
                umbrales: OK {`<`}2× / WARNING ≥2× / OUTAGE ≥4.5×
              </span>
            </div>
          </div>
          {hasData && (
            <div style={{
              padding: "10px 16px",
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              flexShrink: 0,
            }}>
              <SummaryBar markets={markets} />
            </div>
          )}
        </div>
      </div>

      {/* Setup notice (no API key) */}
      {noKey && (
        <div style={{
          background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 10,
          padding: "16px 20px", marginBottom: 20, display: "flex", gap: 14, alignItems: "flex-start",
        }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚙️</span>
          <div>
            <div style={{ fontWeight: 700, color: "#b45309", fontSize: 13, marginBottom: 4 }}>
              RIPE_ATLAS_KEY no configurada
            </div>
            <div style={{ fontSize: 12, color: "#92400e", lineHeight: 1.5 }}>
              Para activar los datos de red en tiempo real, añade la variable de entorno
              en el droplet y reinicia el backend:
              <br />
              <code style={{
                display: "block", marginTop: 6,
                background: "#fef3c7", border: "1px solid #fcd34d",
                borderRadius: 4, padding: "6px 10px", fontFamily: "monospace", fontSize: 11,
              }}>
                RIPE_ATLAS_KEY=24e4c78b-07ff-4243-a435-99bd1fc84999
              </code>
              <span style={{ fontSize: 11 }}>
                Obtén o gestiona tus API keys en{" "}
                <a href="https://atlas.ripe.net/keys/" target="_blank" rel="noreferrer"
                  style={{ color: "#1d4ed8" }}>
                  atlas.ripe.net/keys/
                </a>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{
          flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
          gap: 10, color: T.muted, fontSize: 13,
        }}>
          <span style={{ fontSize: 18, animation: "spin 1s linear infinite" }}>⟳</span>
          Cargando datos de red…
        </div>
      )}

      {/* Market grid */}
      {!loading && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
          gap: 14,
        }}>
          {markets.map(m => (
            <MarketCard
              key={m.id}
              market={m}
              onClick={() => setSelected(m)}
            />
          ))}
        </div>
      )}

      {/* Info footer */}
      {!loading && hasData && (
        <div style={{
          marginTop: 24, padding: "12px 16px",
          background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, fontSize: 11, color: T.muted, lineHeight: 1.6,
        }}>
          <strong style={{ color: T.text }}>Sobre esta señal:</strong>{" "}
          RIPE Atlas tiene ~12.000 sondas físicas distribuidas globalmente. Las sondas
          en redes Vodafone miden continuamente la latencia hacia k.root-servers.net
          (msm #{1001}). Al ser el destino anycast y operar en 100+ ubicaciones, el RTT
          medido refleja principalmente el camino dentro de la red Vodafone hasta el punto
          de salida Internet — no la distancia al servidor. Un aumento brusco indica
          degradación interna (red de acceso, backbone o peering), no un problema en el
          destino.{" "}
          <a href="https://atlas.ripe.net/measurements/1001/" target="_blank" rel="noreferrer"
            style={{ color: "#3b82f6" }}>
            Ver medición en RIPE Atlas →
          </a>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <DetailPanel
          market={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
