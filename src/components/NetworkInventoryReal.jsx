import { useState, useEffect } from "react";
import { T } from "../data/constants.js";

const MARKETS = [
  { id:"uk",  flag:"🇬🇧", name:"Vodafone UK",          asn:"AS5378",  probes:null, status:"loading" },
  { id:"de",  flag:"🇩🇪", name:"Vodafone DE",          asn:"AS3209",  probes:null, status:"loading" },
  { id:"es",  flag:"🇪🇸", name:"Vodafone ES",          asn:"AS12430", probes:null, status:"loading" },
  { id:"it",  flag:"🇮🇹", name:"Vodafone IT",          asn:"AS30722", probes:null, status:"loading" },
  { id:"pt",  flag:"🇵🇹", name:"Vodafone PT",          asn:"AS12353", probes:null, status:"loading" },
  { id:"nl",  flag:"🇳🇱", name:"Vodafone NL",          asn:"AS33915", probes:null, status:"loading" },
  { id:"ie",  flag:"🇮🇪", name:"Vodafone IE",          asn:"AS15502", probes:null, status:"loading" },
  { id:"gr",  flag:"🇬🇷", name:"Vodafone GR",          asn:"AS3329",  probes:null, status:"loading" },
  { id:"tr",  flag:"🇹🇷", name:"Vodafone TR",          asn:"AS15924", probes:null, status:"loading" },
  { id:"int", flag:"🌐", name:"Vodafone International", asn:"AS1273",  probes:null, status:"loading" },
];

const STATUS_META = {
  ok:      { color:"#15803d", bg:"#f0fdf4", border:"#86efac", dot:"#22c55e", label:"NOMINAL" },
  warn:    { color:"#b45309", bg:"#fffbeb", border:"#fcd34d", dot:"#f59e0b", label:"DEGRADED" },
  alert:   { color:"#c2410c", bg:"#fff7ed", border:"#fdba74", dot:"#f97316", label:"ALERT" },
  outage:  { color:"#991b1b", bg:"#fef2f2", border:"#fca5a5", dot:"#ef4444", label:"OUTAGE" },
  loading: { color:"#475569", bg:"#f8fafc", border:"#e2e8f0", dot:"#94a3b8", label:"LOADING" },
  error:   { color:"#6b7280", bg:"#f9fafb", border:"#e5e7eb", dot:"#9ca3af", label:"UNKNOWN" },
};

const POLLER = import.meta.env.VITE_POLLER_WS
  ? import.meta.env.VITE_POLLER_WS.replace(/^ws/, "http")
  : "http://localhost:4000";

export default function NetworkInventoryReal() {
  const [markets, setMarkets] = useState(MARKETS);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("");
  const [lastFetch, setLastFetch] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchHealth() {
      try {
        const r = await fetch(`${POLLER}/api/network-health`);
        if (!r.ok) throw new Error(r.status);
        const data = await r.json();
        if (cancelled) return;
        setMarkets(prev => prev.map(m => {
          const live = data.find(d => d.id === m.id);
          if (!live) return { ...m, status:"error" };
          return {
            ...m,
            status: live.correlation?.status || live.status || "ok",
            probes: live.totalProbes ?? 0,
            metrics: {
              rtt:          live.current?.avg_rtt,
              rtt_ratio:    live.ratio,
              bgp_vis:      live.bgp?.current?.visibility_pct,
              dns_rtt:      live.dns?.current?.dns_rtt,
              announced:    live.bgp?.current?.announced_prefixes,
              ris_wd_1h:    live.ris?.withdrawals1h,
              ioda_events:  live.ioda?.activeCount ?? 0,
              score:        live.correlation?.score,
              insight:      live.correlation?.insight,
            },
            probeLocations: live.probeLocations ?? [],
          };
        }));
        setLastFetch(new Date());
      } catch {
        if (!cancelled) setMarkets(prev => prev.map(m => ({ ...m, status:"error" })));
      }
    }
    fetchHealth();
    const t = setInterval(fetchHealth, 30_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const visible = markets.filter(m =>
    !filter || m.name.toLowerCase().includes(filter.toLowerCase()) || m.asn.toLowerCase().includes(filter.toLowerCase())
  );

  const sel = selected ? markets.find(m => m.id === selected) : null;

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden", background:T.bg, fontFamily:"inherit" }}>

      {/* ── Left panel ── */}
      <div style={{ width:340, flexShrink:0, borderRight:`1px solid ${T.border}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ padding:"16px 16px 12px", borderBottom:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
            <span style={{ fontSize:18 }}>🌐</span>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:T.text }}>Real Network Inventory</div>
              <div style={{ fontSize:11, color:T.muted }}>Live ASN data · RIPE Atlas · BGP</div>
            </div>
            <div style={{ marginLeft:"auto", fontSize:10, color:T.muted, textAlign:"right" }}>
              {lastFetch ? <>Updated<br/>{lastFetch.toLocaleTimeString()}</> : "Fetching…"}
            </div>
          </div>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by name or ASN…"
            style={{ width:"100%", boxSizing:"border-box", padding:"7px 10px", borderRadius:7,
              border:`1px solid ${T.border}`, background:T.card, color:T.text,
              fontSize:12, fontFamily:"inherit", outline:"none" }}
          />
        </div>

        {/* Market list */}
        <div style={{ flex:1, overflowY:"auto" }}>
          {visible.map(m => {
            const sm = STATUS_META[m.status] || STATUS_META.error;
            const isSelected = m.id === selected;
            return (
              <div key={m.id} onClick={() => setSelected(isSelected ? null : m.id)}
                style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px",
                  borderBottom:`1px solid ${T.border}`, cursor:"pointer",
                  background: isSelected ? "#eff6ff" : "transparent",
                  borderLeft: isSelected ? "3px solid #2563eb" : "3px solid transparent",
                  transition:"background 0.12s" }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background="#f8fafc"; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background="transparent"; }}>

                <span style={{ fontSize:20, flexShrink:0 }}>{m.flag}</span>

                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:2 }}>{m.name}</div>
                  <div style={{ fontSize:11, color:T.muted }}>{m.asn}</div>
                </div>

                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                  <span style={{ fontSize:10, fontWeight:700, color:sm.color, background:sm.bg,
                    border:`1px solid ${sm.border}`, borderRadius:8, padding:"2px 7px",
                    display:"flex", alignItems:"center", gap:4 }}>
                    <span style={{ width:6, height:6, borderRadius:"50%", background:sm.dot, flexShrink:0 }}/>
                    {sm.label}
                  </span>
                  {m.probes != null && (
                    <span style={{ fontSize:10, color:T.muted }}>{m.probes} probes</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer summary */}
        <div style={{ padding:"10px 16px", borderTop:`1px solid ${T.border}`, display:"flex", gap:12 }}>
          {["ok","warn","alert","outage"].map(s => {
            const count = markets.filter(m => m.status === s).length;
            if (!count) return null;
            const sm = STATUS_META[s];
            return <span key={s} style={{ fontSize:11, color:sm.color, fontWeight:600 }}>
              {count} {sm.label.toLowerCase()}
            </span>;
          })}
        </div>
      </div>

      {/* ── Detail panel ── */}
      {sel ? (
        <MarketDetail market={sel} onClose={() => setSelected(null)} />
      ) : (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", color:T.muted, gap:12 }}>
          <div style={{ fontSize:40 }}>🌐</div>
          <div style={{ fontSize:14, fontWeight:600, color:T.text }}>Select a market</div>
          <div style={{ fontSize:12 }}>Click any ASN to view live metrics</div>
          <div style={{ marginTop:24, padding:"12px 20px", borderRadius:10,
            background:"#eff6ff", border:"1px solid #bfdbfe",
            fontSize:11, color:"#1d4ed8", maxWidth:380, textAlign:"center", lineHeight:1.6 }}>
            Data sourced from RIPE Atlas, RIPE Stat BGP, RIS Live, CAIDA IODA, and Cloudflare Radar.
            Updates every 30s.
          </div>
        </div>
      )}
    </div>
  );
}

function MetricRow({ label, value, unit, warn, alert: alertVal, ok }) {
  let color = T.text;
  if (alertVal !== undefined && value >= alertVal) color = "#dc2626";
  else if (warn !== undefined && value >= warn) color = "#b45309";
  else if (ok !== undefined && value >= ok) color = "#15803d";
  const display = value == null ? "—" : typeof value === "number" ? value.toFixed(1) : value;
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
      <span style={{ fontSize:12, color:T.muted }}>{label}</span>
      <span style={{ fontSize:12, fontWeight:600, color }}>
        {display}{value != null && unit ? <span style={{ fontWeight:400, color:T.muted }}> {unit}</span> : ""}
      </span>
    </div>
  );
}

function MarketDetail({ market: m, onClose }) {
  const sm = STATUS_META[m.status] || STATUS_META.error;
  const mx = m.metrics || {};
  const score = mx.score;

  return (
    <div style={{ flex:1, overflowY:"auto", padding:"24px", display:"flex", flexDirection:"column", gap:20 }}>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:16 }}>
        <span style={{ fontSize:36 }}>{m.flag}</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:T.text, marginBottom:4 }}>{m.name}</div>
          <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{ fontSize:11, background:"#1e293b", color:"#94a3b8",
              borderRadius:6, padding:"2px 8px", fontWeight:600 }}>{m.asn}</span>
            <span style={{ fontSize:11, fontWeight:700, color:sm.color, background:sm.bg,
              border:`1px solid ${sm.border}`, borderRadius:8, padding:"2px 8px",
              display:"inline-flex", alignItems:"center", gap:4 }}>
              <span style={{ width:6, height:6, borderRadius:"50%", background:sm.dot }}/>
              {sm.label}
            </span>
            {m.probes != null && (
              <span style={{ fontSize:11, color:T.muted }}>{m.probes} active probes</span>
            )}
          </div>
        </div>
        <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer",
          color:T.muted, fontSize:18, padding:"2px 6px" }}>✕</button>
      </div>

      {/* Health score */}
      {score != null && (
        <div style={{ padding:"14px 16px", borderRadius:10,
          background: score >= 80 ? "#f0fdf4" : score >= 50 ? "#fffbeb" : "#fef2f2",
          border:`1px solid ${score >= 80 ? "#86efac" : score >= 50 ? "#fcd34d" : "#fca5a5"}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <div style={{ fontSize:22, fontWeight:800,
              color: score >= 80 ? "#15803d" : score >= 50 ? "#b45309" : "#991b1b" }}>{score}</div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px" }}>Correlation Score</div>
              <div style={{ fontSize:11, color: score >= 80 ? "#15803d" : score >= 50 ? "#b45309" : "#991b1b" }}>
                {score >= 80 ? "All signals nominal" : score >= 50 ? "Some signals degraded" : "Multiple signals impacted"}
              </div>
            </div>
          </div>
          {mx.insight && <div style={{ fontSize:11, color:T.muted, lineHeight:1.5 }}>{mx.insight}</div>}
        </div>
      )}

      {/* RIPE Atlas metrics */}
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 16px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:8 }}>
          📡 RIPE Atlas — ICMP Latency
        </div>
        <MetricRow label="Avg RTT"     value={mx.rtt}       unit="ms" warn={80} alert={150} />
        <MetricRow label="RTT Ratio"   value={mx.rtt_ratio} unit="×"  warn={1.5} alert={2} ok={0} />
        <MetricRow label="Active Probes" value={m.probes}   />
      </div>

      {/* BGP metrics */}
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 16px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:8 }}>
          🔗 BGP Visibility — RIPE Stat
        </div>
        <MetricRow label="Visibility"         value={mx.bgp_vis}   unit="%" ok={95} warn={80} />
        <MetricRow label="Announced Prefixes" value={mx.announced} />
        <MetricRow label="RIS Withdrawals/h"  value={mx.ris_wd_1h} warn={3} alert={10} />
      </div>

      {/* DNS metrics */}
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 16px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:8 }}>
          🌐 DNS Measurements — RIPE Atlas
        </div>
        <MetricRow label="DNS RTT" value={mx.dns_rtt} unit="ms" warn={50} alert={100} />
      </div>

      {/* IODA */}
      <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 16px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:8 }}>
          🌐 CAIDA IODA — Outage Detection
        </div>
        <MetricRow label="Active Events" value={mx.ioda_events} alert={1} />
      </div>

      {/* Probe locations */}
      {m.probeLocations?.length > 0 && (
        <div style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:10, padding:"14px 16px" }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:10 }}>
            📍 Probe Locations ({m.probeLocations.length})
          </div>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {m.probeLocations.slice(0, 20).map((loc, i) => (
              <span key={i} style={{ fontSize:11, background:"#f1f5f9", border:"1px solid #e2e8f0",
                borderRadius:6, padding:"3px 8px", color:T.muted }}>
                {loc.country || "??"} {loc.lat?.toFixed(1)},{loc.lon?.toFixed(1)}
              </span>
            ))}
            {m.probeLocations.length > 20 && (
              <span style={{ fontSize:11, color:T.muted }}>+{m.probeLocations.length - 20} more</span>
            )}
          </div>
        </div>
      )}

      {/* Source note */}
      <div style={{ fontSize:11, color:T.muted, padding:"8px 0", lineHeight:1.6 }}>
        This node is read-only — data is sourced from external measurement APIs.
        To view historical charts and signal correlation, open <strong>Network Health</strong> or <strong>Signal Fusion</strong>.
      </div>
    </div>
  );
}
