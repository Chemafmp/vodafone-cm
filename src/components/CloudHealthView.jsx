// ─── Cloud Health View ─────────────────────────────────────────────────────────
// Fetches cloud provider status DIRECTLY from public APIs (browser-side).
// 5 providers work cross-origin: Cloudflare, GitHub, GCP, Datadog, Twilio.
// 6 providers are CORS-blocked from browser and come from /api/cloud-health:
//   AWS, Azure, Fastly, Oracle, Zoom, PagerDuty.

import { useState, useEffect, useRef } from "react";
import { T } from "../data/constants.js";
import { timeAgo, impactColor } from "../utils/helpers.js";

// ── API base ──────────────────────────────────────────────────────────────────
function apiBase() {
  const ws = import.meta.env.VITE_POLLER_WS || "ws://localhost:4000";
  return ws.startsWith("wss://")
    ? ws.replace(/^wss:\/\//, "https://")
    : ws.replace(/^ws:\/\//, "http://");
}

const FRONTEND_BASE = "https://chemafmp.github.io/vodafone-cm";

// ── Provider definitions ──────────────────────────────────────────────────────
// `cloud` = hosting infrastructure: "aws" | "gcp" | "azure" | "own" | "multi"
// NOTE: Fastly statuspage requires API key (401) — removed.
// All providers here are CORS-accessible from browser.
const STATUSPAGE_PROVIDERS = [
  // ── CDN ───────────────────────────────────────────────────────────────────
  { id: "cloudflare",  name: "Cloudflare",   icon: "🟠", cat: "cdn",      cloud: "own",   url: "https://www.cloudflarestatus.com/api/v2/summary.json" },
  // ── Cloud ─────────────────────────────────────────────────────────────────
  { id: "oracle",      name: "Oracle Cloud", icon: "🔺",  cat: "cloud",    cloud: "oracle", url: "https://ocloudinfra.statuspage.io/api/v2/summary.json" },
  { id: "vercel",      name: "Vercel",       icon: "▲",   cat: "cloud",    cloud: "aws",   url: "https://www.vercel-status.com/api/v2/summary.json" },
  { id: "netlify",     name: "Netlify",      icon: "🟩",  cat: "cloud",    cloud: "aws",   url: "https://www.netlifystatus.com/api/v2/summary.json" },
  // ── DevOps / Dev Tools ────────────────────────────────────────────────────
  { id: "github",      name: "GitHub",       icon: "🐙",  cat: "devtools", cloud: "azure", url: "https://www.githubstatus.com/api/v2/summary.json" },
  { id: "atlassian",   name: "Atlassian",    icon: "⬡",   cat: "devtools", cloud: "aws",   url: "https://status.atlassian.com/api/v2/summary.json" },
  { id: "gitlab",      name: "GitLab",       icon: "🦊",  cat: "devtools", cloud: "gcp",   url: "https://status.gitlab.com/api/v2/summary.json" },
  { id: "hashicorp",   name: "HashiCorp",    icon: "🏔",  cat: "devtools", cloud: "aws",   url: "https://status.hashicorp.com/api/v2/summary.json" },
  // ── Observability ─────────────────────────────────────────────────────────
  { id: "datadog",     name: "Datadog",      icon: "🐕",  cat: "obs",      cloud: "aws",   url: "https://status.datadoghq.com/api/v2/summary.json" },
  { id: "pagerduty",   name: "PagerDuty",    icon: "📟",  cat: "obs",      cloud: "aws",   url: "https://status.pagerduty.com/api/v2/summary.json" },
  { id: "newrelic",    name: "New Relic",    icon: "📊",  cat: "obs",      cloud: "aws",   url: "https://status.newrelic.com/api/v2/summary.json" },
  // ── Security / SASE ───────────────────────────────────────────────────────
  { id: "forcepoint",  name: "Forcepoint",   icon: "🔒",  cat: "security", cloud: "aws",   url: "https://78lm3dxlst13.statuspage.io/api/v2/summary.json" },
  // ── Identity ──────────────────────────────────────────────────────────────
  // Okta (401), Auth0 (404) blocked server-side — fetched from frontend only
  { id: "duo",         name: "Duo Security", icon: "🛡",  cat: "identity", cloud: "aws",   url: "https://status.duosecurity.com/api/v2/summary.json" },
  { id: "onelogin",    name: "OneLogin",     icon: "🔓",  cat: "identity", cloud: "aws",   url: "https://status.onelogin.com/api/v2/summary.json" },
  // ── Comms / Collaboration ─────────────────────────────────────────────────
  { id: "zoom",        name: "Zoom",         icon: "📹",  cat: "comms",    cloud: "aws",   url: "https://status.zoom.us/api/v2/summary.json" },
  { id: "discord",     name: "Discord",      icon: "🎮",  cat: "comms",    cloud: "gcp",   url: "https://discordstatus.com/api/v2/summary.json" },
  { id: "twilio",      name: "Twilio",       icon: "📞",  cat: "comms",    cloud: "aws",   url: "https://status.twilio.com/api/v2/summary.json" },
  { id: "sendgrid",    name: "SendGrid",     icon: "📧",  cat: "comms",    cloud: "aws",   url: "https://status.sendgrid.com/api/v2/summary.json" },
  // ── Gaming ────────────────────────────────────────────────────────────────
  { id: "epic",        name: "Epic Games",   icon: "🎯",  cat: "gaming",   cloud: "aws",   url: "https://status.epicgames.com/api/v2/summary.json" },
  { id: "roblox",      name: "Roblox",       icon: "🧱",  cat: "gaming",   cloud: "aws",   url: "https://status.roblox.com/api/v2/summary.json" },
  // ── Fintech / Payments ────────────────────────────────────────────────────
  { id: "stripe",      name: "Stripe",       icon: "💜",  cat: "fintech",  cloud: "aws",   url: "https://status.stripe.com/api/v2/summary.json" },
  { id: "wise",        name: "Wise",         icon: "💳",  cat: "fintech",  cloud: "aws",   url: "https://status.wise.com/api/v2/summary.json" },
  // ── Crypto ────────────────────────────────────────────────────────────────
  { id: "kraken",      name: "Kraken",       icon: "🐙",  cat: "crypto",   cloud: "own",   url: "https://status.kraken.com/api/v2/summary.json" },
  { id: "moonpay",     name: "MoonPay",      icon: "🌙",  cat: "crypto",   cloud: "aws",   url: "https://status.moonpay.com/api/v2/summary.json" },
  // ── Design ────────────────────────────────────────────────────────────────
  { id: "figma",       name: "Figma",        icon: "🎨",  cat: "design",   cloud: "aws",   url: "https://status.figma.com/api/v2/summary.json" },
  { id: "miro",        name: "Miro",         icon: "🪄",  cat: "design",   cloud: "aws",   url: "https://status.miro.com/api/v2/summary.json" },
  // ── E-commerce ────────────────────────────────────────────────────────────
  { id: "shopify",     name: "Shopify",      icon: "🛒",  cat: "ecomm",    cloud: "gcp",   url: "https://www.shopifystatus.com/api/v2/summary.json" },
  // ── Web3 ──────────────────────────────────────────────────────────────────
  { id: "opensea",     name: "OpenSea",      icon: "🌊",  cat: "web3",     cloud: "aws",   url: "https://status.opensea.io/api/v2/summary.json" },
];

// CORS-blocked or custom API — data comes from backend /api/cloud-health:
const BACKEND_ONLY_META = [
  { id: "aws",     name: "AWS",     icon: "🟡", cat: "cloud",  cloud: "aws",   statusUrl: "https://health.aws.amazon.com" },
  { id: "azure",   name: "Azure",   icon: "🔷", cat: "cloud",  cloud: "azure", statusUrl: "https://azure.status.microsoft" },
  { id: "slack",   name: "Slack",   icon: "💬", cat: "comms",  cloud: "aws",   statusUrl: "https://status.slack.com" },
  { id: "binance", name: "Binance", icon: "🟡", cat: "crypto", cloud: "aws",   statusUrl: "https://www.binance.com" },
];

// ── Cloud hosting metadata ────────────────────────────────────────────────────
const CLOUD_META = {
  aws:    { label: "AWS",    icon: "🟡", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  gcp:    { label: "GCP",    icon: "🔵", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
  azure:  { label: "Azure",  icon: "🔷", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
  oracle: { label: "Oracle", icon: "🔺", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
  own:    { label: "Own",    icon: "🏢", color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
  multi:  { label: "Multi",  icon: "🌐", color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
};

const STATUS_PAGE_URLS = {
  cloudflare:  "https://www.cloudflarestatus.com",
  github:      "https://www.githubstatus.com",
  atlassian:   "https://status.atlassian.com",
  gitlab:      "https://status.gitlab.com",
  oracle:      "https://ocistatus.oraclecloud.com",
  zoom:        "https://status.zoom.us",
  discord:     "https://discordstatus.com",
  datadog:     "https://status.datadoghq.com",
  pagerduty:   "https://status.pagerduty.com",
  twilio:      "https://status.twilio.com",
  epic:        "https://status.epicgames.com",
  roblox:      "https://status.roblox.com",
  wise:        "https://status.wise.com",
  stripe:      "https://status.stripe.com",
  adyen:       "https://www.adyenstatus.com",
  paypal:      "https://www.paypal-status.com",
  kraken:      "https://status.kraken.com",
  moonpay:     "https://status.moonpay.com",
  figma:       "https://status.figma.com",
  canva:       "https://status.canva.com",
  miro:        "https://status.miro.com",
  shopify:     "https://www.shopifystatus.com",
  slack:       "https://status.slack.com",
  binance:     "https://www.binance.com",
  opensea:     "https://status.opensea.io",
  forcepoint:  "https://csg.status.forcepoint.com",
  crowdstrike: "https://status.crowdstrike.com",
  okta:        "https://status.okta.com",
  duo:         "https://status.duosecurity.com",
  aws:         "https://health.aws.amazon.com",
  gcp:         "https://status.cloud.google.com",
  azure:       "https://azure.status.microsoft",
};

// ── Uptime history helpers ────────────────────────────────────────────────────
/**
 * Compute 36 hourly uptime slots from Supabase snapshot rows for one provider.
 * Returns null if no data rows found for this provider.
 */
function computeUptimeFromSnapshots(snapshots, providerId, numHours = 36) {
  const rows = (snapshots || []).filter(s => s.provider_id === providerId);
  if (!rows.length) return null;

  const slots = [];
  const now   = new Date();
  for (let i = numHours - 1; i >= 0; i--) {
    const slotStart = new Date(now);
    slotStart.setMinutes(0, 0, 0);
    slotStart.setHours(slotStart.getHours() - i);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(59, 59, 999);

    const inSlot = rows.filter(s => {
      const ts = new Date(s.measured_at);
      return ts >= slotStart && ts <= slotEnd;
    });

    // Default to "ok" (green) — absence of a recorded incident = assumed operational.
    // Only show warning/outage when we have Supabase data that explicitly says so.
    // This avoids the "all grey" bar when Supabase history is less than 36 h old.
    let status = "ok";
    for (const s of inSlot) {
      if (s.status === "outage")  { status = "outage"; break; }
      if (s.status === "warning") { status = "warning"; }
    }

    slots.push({
      date: new Date(slotStart),
      status,
      incidents: inSlot
        .filter(s => s.incident_count > 0)
        .map(s => ({ name: s.description || "Incident", impact: s.status === "outage" ? "major" : "minor" })),
    });
  }
  return slots;
}

// ── Status meta ───────────────────────────────────────────────────────────────
const STATUS_META = {
  ok:      { label: "Operational",  color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0", dot: "#22c55e" },
  warning: { label: "Degraded",     color: "#b45309", bg: "#fffbeb", border: "#fde68a", dot: "#f59e0b" },
  outage:  { label: "Outage",       color: "#dc2626", bg: "#fef2f2", border: "#fecaca", dot: "#ef4444" },
  unknown: { label: "Unknown",      color: "#64748b", bg: "#f8fafc", border: "#e2e8f0", dot: "#94a3b8" },
};

const CAT_LABELS = {
  cloud:    "☁️ Cloud",
  cdn:      "⚡ CDN",
  devtools: "🔧 DevTools",
  obs:      "📊 Observability",
  comms:    "💬 Comms",
  gaming:   "🎮 Gaming",
  fintech:  "💰 Fintech",
  security: "🔒 Security",
  identity: "🔐 Identity",
  crypto:   "🔗 Crypto",
  design:   "🎨 Design",
  ecomm:    "🛒 E-commerce",
  web3:     "🌐 Web3",
};

function StatusDot({ status, size = 10 }) {
  const m = STATUS_META[status] || STATUS_META.unknown;
  return (
    <span style={{
      display: "inline-block", width: size, height: size, borderRadius: "50%",
      background: m.dot, flexShrink: 0,
      boxShadow: status !== "ok" && status !== "unknown" ? `0 0 0 3px ${m.dot}33` : "none",
    }} />
  );
}

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " " +
           d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch { return iso; }
}

// ── Component status row ──────────────────────────────────────────────────────
const COMP_STATUS = {
  operational:          { label: "Operational",    color: "#16a34a", bg: "#f0fdf4", dot: "#22c55e" },
  degraded_performance: { label: "Degraded",       color: "#b45309", bg: "#fffbeb", dot: "#f59e0b" },
  partial_outage:       { label: "Partial Outage", color: "#c2410c", bg: "#fff7ed", dot: "#f97316" },
  major_outage:         { label: "Major Outage",   color: "#dc2626", bg: "#fef2f2", dot: "#ef4444" },
  under_maintenance:    { label: "Maintenance",    color: "#6366f1", bg: "#eef2ff", dot: "#818cf8" },
};

function ComponentRow({ c }) {
  const cs = COMP_STATUS[c.status] || COMP_STATUS.operational;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "7px 12px", borderBottom: `1px solid ${T.border}`,
      background: c.status !== "operational" ? cs.bg : "transparent",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: cs.dot, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, color: T.text }}>{c.name}</span>
      <span style={{ fontSize: 11, fontWeight: 600, color: cs.color, flexShrink: 0 }}>{cs.label}</span>
    </div>
  );
}

// ── Incident row ──────────────────────────────────────────────────────────────
function IncidentRow({ inc }) {
  const [showUpdate, setShowUpdate] = useState(false);
  const ic = impactColor(inc.impact);
  const statusColors = {
    investigating: "#dc2626", identified: "#ea580c",
    monitoring: "#d97706", resolved: "#16a34a", postmortem: "#64748b",
  };
  const sc = statusColors[inc.status] || "#64748b";

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${ic}`, borderRadius: 8,
      overflow: "hidden", marginBottom: 8,
    }}>
      <div style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>
              {inc.name}
            </div>
            {/* Region / service / affected component pills */}
            {(inc.region || inc.service || inc.affectedComponents?.length > 0) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 5 }}>
                {inc.region && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: "#0369a1",
                    background: "#e0f2fe", border: "1px solid #bae6fd",
                    borderRadius: 4, padding: "2px 7px",
                  }}>📍 {inc.region}</span>
                )}
                {inc.service && (
                  <span style={{
                    fontSize: 10, fontWeight: 600, color: "#6d28d9",
                    background: "#ede9fe", border: "1px solid #ddd6fe",
                    borderRadius: 4, padding: "2px 7px",
                  }}>⚙️ {inc.service}</span>
                )}
                {(inc.affectedComponents || []).map((c, i) => (
                  <span key={i} style={{
                    fontSize: 10, fontWeight: 500, color: "#475569",
                    background: "#f1f5f9", border: "1px solid #e2e8f0",
                    borderRadius: 4, padding: "2px 7px",
                  }}>{c}</span>
                ))}
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 5, alignItems: "center" }}>
              <span style={{
                fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em",
                color: "#fff", background: ic, borderRadius: 4, padding: "2px 7px",
              }}>{inc.impact}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                color: sc, border: `1px solid ${sc}33`, background: `${sc}18`,
                borderRadius: 4, padding: "2px 7px",
              }}>{inc.status}</span>
              <span style={{ fontSize: 11, color: T.muted }}>
                Started {fmtTime(inc.createdAt)}
              </span>
              {inc.updatedAt && inc.updatedAt !== inc.createdAt && (
                <span style={{ fontSize: 11, color: T.muted }}>
                  · Updated {timeAgo(inc.updatedAt)}
                </span>
              )}
              {inc.latestUpdate && (
                <button
                  onClick={e => { e.stopPropagation(); setShowUpdate(v => !v); }}
                  style={{
                    fontSize: 10, fontWeight: 600, color: "#3b82f6",
                    background: "#eff6ff", border: "1px solid #bfdbfe",
                    borderRadius: 5, padding: "2px 8px", cursor: "pointer",
                  }}
                >
                  {showUpdate ? "▲ Hide update" : "▼ Latest update"}
                </button>
              )}
            </div>
          </div>
          {inc.url && (
            <a href={inc.url} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: 11, fontWeight: 600, color: "#3b82f6", textDecoration: "none",
                flexShrink: 0, border: "1px solid #bfdbfe", borderRadius: 6,
                padding: "4px 10px", background: "#eff6ff",
              }}>↗ Details</a>
          )}
        </div>
        {/* Auto-inline first sentence of update when incident name is generic */}
        {inc.latestUpdate?.text && !showUpdate && (() => {
          const firstSentence = inc.latestUpdate.text.split(/\.\s+/)[0]?.trim();
          // Show inline only if it adds info beyond the incident name (>20 chars different)
          if (!firstSentence || firstSentence.length < 20) return null;
          return (
            <div style={{
              marginTop: 7, fontSize: 11, color: "#475569", lineHeight: 1.5,
              padding: "6px 10px", background: "#f8fafc", borderRadius: 5,
              border: `1px solid ${T.border}`, fontStyle: "italic",
            }}>
              {firstSentence}{firstSentence.endsWith(".") ? "" : "."}
            </div>
          );
        })()}
        {/* Full update text (expanded) */}
        {showUpdate && inc.latestUpdate && (
          <div style={{
            marginTop: 10, padding: "10px 12px",
            background: "#f8fafc", border: `1px solid ${T.border}`,
            borderRadius: 6, fontSize: 12, color: T.text, lineHeight: 1.7,
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
              📋 Update · {timeAgo(inc.latestUpdate.updatedAt)}
            </div>
            <div dangerouslySetInnerHTML={{ __html: inc.latestUpdate.text?.replace(/\n/g, "<br/>") || "" }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Uptime Bar ────────────────────────────────────────────────────────────────
const DAY_COLORS = {
  ok:      "#22c55e",
  warning: "#f59e0b",
  outage:  "#ef4444",
  unknown: "#cbd5e1",
};

function UptimeBar({ days }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);
  if (!days?.length) return null;

  const okCount    = days.filter(d => d.status === "ok").length;
  const uptimePct  = ((okCount / days.length) * 100).toFixed(2);
  const pctColor   = Number(uptimePct) >= 99.9 ? "#16a34a" : Number(uptimePct) >= 99 ? "#b45309" : "#dc2626";

  return (
    <div style={{ userSelect: "none" }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
          📊 36h Uptime
        </span>
        <span style={{ fontSize: 14, fontWeight: 800, color: pctColor }}>{uptimePct}%</span>
      </div>

      {/* Bar strip */}
      <div style={{ position: "relative" }}>
        <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 36 }}>
          {days.map((day, i) => {
            const isHov = hoveredIdx === i;
            return (
              <div
                key={i}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                title={`${day.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} — ${day.status}`}
                style={{
                  flex: 1,
                  height: isHov ? 36 : 28,
                  borderRadius: 3,
                  background: DAY_COLORS[day.status] || DAY_COLORS.unknown,
                  cursor: "default",
                  transition: "height 0.1s, opacity 0.1s",
                  opacity: hoveredIdx !== null && !isHov ? 0.55 : 1,
                  flexShrink: 0,
                }}
              />
            );
          })}
        </div>

        {/* Tooltip */}
        {hoveredIdx !== null && days[hoveredIdx] && (() => {
          const day = days[hoveredIdx];
          const pct = Math.min(Math.max((hoveredIdx / days.length) * 100, 5), 85);
          return (
            <div style={{
              position: "absolute",
              bottom: 44,
              left: `${pct}%`,
              transform: "translateX(-50%)",
              background: "#0f172a",
              color: "#f8fafc",
              fontSize: 11,
              borderRadius: 8,
              padding: "8px 12px",
              whiteSpace: "nowrap",
              zIndex: 50,
              pointerEvents: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
              lineHeight: 1.6,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 3 }}>
                {day.date.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </div>
              <div style={{ color: DAY_COLORS[day.status], fontWeight: 700 }}>
                {day.status === "ok" ? "✓ No incidents" : day.status === "outage" ? "✕ Outage" : "⚠ Degraded"}
              </div>
              {day.incidents.map((inc, j) => (
                <div key={j} style={{ color: "#94a3b8", marginTop: 2, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {inc.name}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Time axis */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
        <span style={{ fontSize: 10, color: T.muted }}>36h ago</span>
        <span style={{ fontSize: 10, color: T.muted }}>Now</span>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
        {[["ok","Operational"],["warning","Degraded"],["outage","Outage"]].map(([s, label]) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: DAY_COLORS[s], display: "inline-block" }} />
            <span style={{ fontSize: 10, color: T.muted }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Cloud Infrastructure Correlation Panel ────────────────────────────────────
function CloudInfraPanel({ providers, isMobile }) {
  const [expandedCloud, setExpandedCloud] = useState({});
  const cloudProviderIds = ["aws", "gcp", "azure", "oracle"];
  const cloudStatus = {};
  for (const id of cloudProviderIds) {
    const p = providers.find(x => x.id === id);
    cloudStatus[id] = p?.status || "unknown";
  }

  const hosted = { aws: [], gcp: [], azure: [], own: [], multi: [] };
  for (const p of providers) {
    if (cloudProviderIds.includes(p.id)) continue;
    const bucket = p.cloud || "own";
    if (hosted[bucket]) hosted[bucket].push(p);
  }

  const hasRisk = cloudProviderIds.some(id => cloudStatus[id] !== "ok" && cloudStatus[id] !== "unknown");
  const PREVIEW = isMobile ? 5 : 99; // on mobile show 5, rest behind tap

  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, marginBottom: 20, overflow: "hidden",
    }}>
      <div style={{
        padding: "10px 14px", borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 8, background: T.bg,
      }}>
        <span style={{ fontSize: 15 }}>🔗</span>
        <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>Cloud Infrastructure Correlation</span>
        <span style={{ fontSize: 11, color: T.muted, marginLeft: "auto" }}>
          Which providers run on which cloud
        </span>
      </div>
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: isMobile ? "column" : "row", gap: 8 }}>
        {cloudProviderIds.map(cid => {
          const cm     = CLOUD_META[cid] || CLOUD_META.own;
          const st     = cloudStatus[cid];
          const sm     = STATUS_META[st] || STATUS_META.unknown;
          const deps   = hosted[cid] || [];
          const affected = deps.filter(p => p.status === "warning" || p.status === "outage");
          const cloudProv = providers.find(x => x.id === cid);
          const isExpanded = !!expandedCloud[cid];
          const showAll    = isExpanded || deps.length <= PREVIEW;
          const visibleDeps = showAll ? deps : deps.slice(0, PREVIEW);
          const hiddenCount = deps.length - PREVIEW;

          return (
            <div key={cid} style={{
              flex: isMobile ? "none" : "1 1 0",
              background: st !== "ok" && st !== "unknown" ? sm.bg : T.bg,
              border: `1px solid ${st !== "ok" && st !== "unknown" ? sm.border : T.border}`,
              borderLeft: `4px solid ${sm.dot}`,
              borderRadius: 8, padding: "10px 12px",
            }}>
              {/* Header row — always visible, tappable to expand */}
              <div
                onClick={() => deps.length > PREVIEW && setExpandedCloud(e => ({ ...e, [cid]: !e[cid] }))}
                style={{
                  display: "flex", alignItems: "center", gap: 6, marginBottom: 6,
                  cursor: deps.length > PREVIEW ? "pointer" : "default",
                }}
              >
                <span style={{ fontSize: 16 }}>{cloudProv?.icon || cm.icon}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: T.text }}>{cloudProv?.name || cm.label}</span>
                <span style={{
                  marginLeft: "auto", fontSize: 11, fontWeight: 700,
                  color: sm.color, background: sm.bg,
                  border: `1px solid ${sm.border}`, borderRadius: 5, padding: "2px 7px",
                }}>{sm.label}</span>
                {deps.length > PREVIEW && (
                  <span style={{ fontSize: 12, color: T.muted, marginLeft: 4 }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 11, color: T.muted, marginBottom: 6 }}>
                {deps.length} service{deps.length !== 1 ? "s" : ""} hosted here
              </div>

              {deps.length > 0 && (
                <>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {visibleDeps.map(p => {
                      const pm = STATUS_META[p.status] || STATUS_META.unknown;
                      return (
                        <span key={p.id} style={{
                          fontSize: 10, padding: "2px 6px",
                          borderRadius: 5, fontWeight: 600,
                          color: pm.color, background: pm.bg, border: `1px solid ${pm.border}`,
                        }}>
                          {p.icon} {p.name}
                        </span>
                      );
                    })}
                  </div>
                  {/* Expand button — only when collapsed and there are hidden items */}
                  {!showAll && hiddenCount > 0 && (
                    <button
                      onClick={() => setExpandedCloud(e => ({ ...e, [cid]: true }))}
                      style={{
                        marginTop: 8, width: "100%",
                        background: sm.bg, border: `1px solid ${sm.border}`,
                        borderRadius: 7, padding: "6px 0",
                        fontSize: 11, fontWeight: 700, color: sm.color,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      ▼ Show {hiddenCount} more service{hiddenCount !== 1 ? "s" : ""}
                    </button>
                  )}
                  {/* Collapse button */}
                  {isExpanded && deps.length > PREVIEW && (
                    <button
                      onClick={() => setExpandedCloud(e => ({ ...e, [cid]: false }))}
                      style={{
                        marginTop: 8, width: "100%",
                        background: T.surface, border: `1px solid ${T.border}`,
                        borderRadius: 7, padding: "6px 0",
                        fontSize: 11, fontWeight: 600, color: T.muted,
                        cursor: "pointer", fontFamily: "inherit",
                      }}
                    >
                      ▲ Collapse
                    </button>
                  )}
                </>
              )}

              {affected.length > 0 && (
                <div style={{ marginTop: 8, fontSize: 11, fontWeight: 700, color: sm.color }}>
                  ⚠ {affected.length} service{affected.length !== 1 ? "s" : ""} degraded on this cloud
                </div>
              )}
              {hasRisk && st !== "ok" && st !== "unknown" && deps.length > 0 && (
                <div style={{ marginTop: 4, fontSize: 10, color: "#7c2d12", background: "#fff7ed", borderRadius: 4, padding: "3px 6px" }}>
                  Downstream impact possible
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Provider Card ─────────────────────────────────────────────────────────────
function ProviderCard({ p, expanded, onToggle }) {
  const m         = STATUS_META[p.status] || STATUS_META.unknown;
  const hasIssues = p.activeIncidents?.length > 0;
  const ticketUrl = p.ticketId
    ? `${FRONTEND_BASE}/#ticket=${encodeURIComponent(p.ticketId)}`
    : null;
  const statusPageUrl = STATUS_PAGE_URLS[p.id] || p.statusUrl || null;
  const isBackendOnly = !!p.backendOnly;
  const cm = p.cloud ? (CLOUD_META[p.cloud] || CLOUD_META.own) : null;

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${p.status !== "ok" ? m.border : T.border}`,
      borderLeft: `4px solid ${m.dot}`,
      borderRadius: 10,
      overflow: "hidden",
      boxShadow: expanded ? `0 0 0 2px ${m.dot}55` : "none",
    }}>
      {/* ── Compact header ── */}
      <div
        onClick={isBackendOnly ? undefined : onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px",
          cursor: isBackendOnly ? "default" : "pointer",
        }}
      >
        <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{p.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: T.text }}>{p.name}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span>{CAT_LABELS[p.cat] || p.cat}</span>
            {cm && (
              <span style={{
                fontSize: 10, fontWeight: 700, color: cm.color,
                background: cm.bg, border: `1px solid ${cm.border}`,
                borderRadius: 5, padding: "1px 6px",
              }}>{cm.icon} {cm.label}</span>
            )}
            {isBackendOnly && (
              <span style={{ fontSize: 10, color: "#6366f1", background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 5, padding: "1px 6px" }}>
                via backend
              </span>
            )}
            {ticketUrl && (
              <a href={ticketUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", background: "#ede9fe", border: "1px solid #c4b5fd", borderRadius: 6, padding: "1px 7px", textDecoration: "none" }}>
                🎫 {p.ticketId}
              </a>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <StatusDot status={p.status} size={9} />
              <span style={{ fontSize: 12, fontWeight: 700, color: m.color }}>{m.label}</span>
            </div>
            {hasIssues && (
              <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>
                {p.activeIncidents.length} incident{p.activeIncidents.length !== 1 ? "s" : ""}
              </div>
            )}
            {p.componentSummary && p.componentSummary.total > 0 && !hasIssues && (
              <div style={{ fontSize: 10, marginTop: 2,
                color: p.componentSummary.degraded > 0 ? "#6366f1" : T.muted }}>
                {p.componentSummary.degraded > 0
                  ? `🔧 ${p.componentSummary.degraded} maintenance`
                  : `${p.componentSummary.operational}/${p.componentSummary.total} components OK`}
              </div>
            )}
          </div>
          {!isBackendOnly && (
            <span style={{ fontSize: 13, color: T.muted }}>{expanded ? "▲" : "▼"}</span>
          )}
          {isBackendOnly && statusPageUrl && (
            <a href={statusPageUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none", border: "1px solid #bfdbfe", borderRadius: 6, padding: "4px 10px", background: "#eff6ff", fontWeight: 600 }}>
              ↗
            </a>
          )}
        </div>
      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && !isBackendOnly && (
        <div style={{ borderTop: `1px solid ${T.border}`, background: T.bg }}>

          {/* Status bar */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "10px 16px", background: m.bg || T.surface,
            borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <StatusDot status={p.status} size={10} />
              <span style={{ fontSize: 13, fontWeight: 700, color: m.color }}>
                {p.error ? "⚠ Data unavailable" : p.description}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {p.lastUpdated && (
                <span style={{ fontSize: 11, color: T.muted }}>Updated {timeAgo(p.lastUpdated)}</span>
              )}
              {statusPageUrl && (
                <a href={statusPageUrl} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none", border: "1px solid #bfdbfe", borderRadius: 6, padding: "3px 10px", background: "#eff6ff", fontWeight: 600 }}>
                  ↗ Status page
                </a>
              )}
            </div>
          </div>

          {/* Error */}
          {p.error && (
            <div style={{ padding: "12px 16px", fontSize: 12, color: "#b45309", background: "#fffbeb" }}>
              ⚠ {p.error}
            </div>
          )}

          {/* Uptime history (36h hourly bars) */}
          {p.uptimeDays?.length > 0 && (
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
              <UptimeBar days={p.uptimeDays} />
            </div>
          )}

          {/* Component summary bar */}
          {p.componentSummary && p.componentSummary.total > 0 && (
            <div style={{
              padding: "10px 16px", borderBottom: `1px solid ${T.border}`,
              display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
            }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.muted }}>COMPONENTS</span>
              <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>
                ✓ {p.componentSummary.operational} operational
              </span>
              {p.componentSummary.degraded > 0 && (
                <span style={{ fontSize: 12, color: "#dc2626", fontWeight: 700 }}>
                  ✕ {p.componentSummary.degraded} affected
                </span>
              )}
            </div>
          )}

          {/* Affected locations (GCP) */}
          {p.affectedLocations?.length > 0 && (
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, background: "#fff7ed" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#9a3412", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                🗺 Affected Locations
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {p.affectedLocations.map((loc, i) => (
                  <span key={i} style={{
                    fontSize: 11, background: "#fed7aa", color: "#7c2d12",
                    border: "1px solid #fdba74", borderRadius: 6, padding: "2px 8px",
                  }}>{loc}</span>
                ))}
              </div>
            </div>
          )}

          {/* Active incidents */}
          {hasIssues && (
            <div style={{ padding: "14px 16px", borderBottom: p.components?.length > 0 ? `1px solid ${T.border}` : "none" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
                🚨 Active Incidents ({p.activeIncidents.length})
              </div>
              {p.activeIncidents.map((inc, i) => (
                <IncidentRow key={inc.id || i} inc={inc} />
              ))}
            </div>
          )}

          {/* Affected / maintenance components */}
          {p.components?.length > 0 && (() => {
            const hasOnlyMaint = p.components.every(c => c.status === "under_maintenance");
            return (
              <div style={{ borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.07em", padding: "12px 16px 8px" }}>
                  {hasOnlyMaint ? "🔧 Under Maintenance" : "⚠ Affected Components"} ({p.components.length})
                </div>
                <div>
                  {p.components.map((c, i) => <ComponentRow key={i} c={c} />)}
                </div>
              </div>
            );
          })()}

          {/* All clear / maintenance notice */}
          {!hasIssues && !p.error && (
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              {p.componentSummary?.degraded > 0 ? (
                <>
                  <span style={{ fontSize: 18 }}>🔧</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#6366f1" }}>Maintenance in progress</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
                      {p.componentSummary.degraded} component{p.componentSummary.degraded !== 1 ? "s" : ""} under maintenance — no active incidents
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 18 }}>✅</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#16a34a" }}>All systems operational</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>No active incidents or degraded components</div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Ticket link */}
          {ticketUrl && (
            <div style={{ padding: "10px 16px", borderTop: `1px solid ${T.border}`, background: "#faf5ff", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13 }}>🎫</span>
              <span style={{ fontSize: 12, color: "#6b21a8" }}>Auto-created ticket:</span>
              <a href={ticketUrl} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 12, fontWeight: 700, color: "#7c3aed", textDecoration: "none" }}>
                {p.ticketId} →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Correlation Banner ────────────────────────────────────────────────────────
function CorrelationBanner({ providers }) {
  const outages  = (providers || []).filter(p => p.status === "outage");
  const warnings = (providers || []).filter(p => p.status === "warning");
  if (outages.length === 0 && warnings.length === 0) return null;

  const critical = outages.length > 0;
  return (
    <div style={{
      background: critical ? "#fef2f2" : "#fff7ed",
      border: `1px solid ${critical ? "#fecaca" : "#fed7aa"}`,
      borderLeft: `4px solid ${critical ? "#dc2626" : "#f97316"}`,
      borderRadius: 10, padding: "12px 16px", marginBottom: 20,
      display: "flex", alignItems: "flex-start", gap: 12,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0 }}>{critical ? "🔴" : "🟠"}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: critical ? "#991b1b" : "#9a3412", marginBottom: 4 }}>
          {critical ? "Service Outages Detected" : "Service Degradation Detected"}
        </div>
        <div style={{ fontSize: 12, color: critical ? "#7f1d1d" : "#7c2d12", lineHeight: 1.6 }}>
          {outages.length > 0 && (
            <span><strong>{outages.map(p => p.name).join(", ")}</strong> {outages.length === 1 ? "is" : "are"} experiencing an outage. </span>
          )}
          {warnings.length > 0 && (
            <span><strong>{warnings.map(p => p.name).join(", ")}</strong> {warnings.length === 1 ? "is" : "are"} degraded. </span>
          )}
          Check if VF network incidents may originate from these upstream dependencies.
        </div>
      </div>
    </div>
  );
}

// ── Main View ─────────────────────────────────────────────────────────────────
export default function CloudHealthView({ mobile: mobileProp = false }) {
  const [providers, setProviders]         = useState([]);
  const [loading, setLoading]             = useState(true);
  const [lastFetch, setLastFetch]         = useState(null);
  const [error, setError]                 = useState(null);
  const [filterCat, setFilterCat]         = useState("all");
  const [filterStatus, setFilterStatus]   = useState("all");
  const [filterCloud, setFilterCloud]     = useState("all");
  const [filterSearch, setFilterSearch]   = useState("");
  const [expanded, setExpanded]           = useState({});
  const [windowW, setWindowW]             = useState(window.innerWidth);
  const timerRef = useRef(null);
  const base = apiBase();

  // Responsive: detect narrow viewport (mobile PWA or narrow desktop)
  useEffect(() => {
    const onResize = () => setWindowW(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const isMobile = mobileProp || windowW < 640;

  async function refresh() {
    // ── All 33 providers come from the backend cache (no per-provider browser
    //    fetches). This makes the page load ~instantly instead of waiting up to
    //    12 s for each individual statuspage API call.
    try {
      const CLOUD_ID_OVERRIDE = { aws: "aws", gcp: "gcp", azure: "azure", oracle: "oracle" };

      const [backendResult, historyResult] = await Promise.allSettled([
        fetch(`${base}/api/cloud-health`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${base}/api/cloud-health/history`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      const backendData = backendResult.status === "fulfilled" ? backendResult.value : null;
      const historyData = historyResult.status === "fulfilled" ? historyResult.value : null;

      let allProviders;

      if (Array.isArray(backendData) && backendData.length > 0) {
        // Apply cloud-section override: main clouds use their own id as section key,
        // not the generic "own" value the backend stores for historical reasons.
        allProviders = backendData.map(p => ({
          ...p,
          cloud: CLOUD_ID_OVERRIDE[p.id] || p.cloud,
        }));
      } else {
        // Backend not reachable — show static placeholders so the UI isn't blank
        allProviders = [...STATUSPAGE_PROVIDERS, ...BACKEND_ONLY_META].map(p => ({
          ...p,
          status: "unknown", indicator: "unknown",
          description: "Backend offline — cannot fetch provider status",
          activeIncidents: [], components: [],
          lastUpdated: new Date().toISOString(),
          ok: false, error: null,
        }));
      }

      // ── Uptime bars: hybrid approach ──────────────────────────────────────────
      // 1. Backend already computed uptimeDays from incident history (all 36 h).
      // 2. Supabase snapshots (last ~36 h, 5-min resolution) override where available
      //    so we show real observed status rather than inferred absence-of-incidents.
      // 3. For hourly slots where Supabase has no row yet, keep the backend value
      //    (green if operational, rather than "unknown"/grey).
      if (Array.isArray(historyData) && historyData.length > 0) {
        allProviders = allProviders.map(p => {
          const snapshotSlots = computeUptimeFromSnapshots(historyData, p.id);
          if (!snapshotSlots) return p; // no Supabase rows for this provider yet
          // Merge: prefer Supabase data per slot, fall back to backend uptimeDays
          const incidentSlots = p.uptimeDays;
          const merged = snapshotSlots.map((slot, i) => {
            if (slot.status !== "unknown") return slot; // Supabase has real data
            return incidentSlots?.[i] ?? slot;          // fall back to incident-based
          });
          return { ...p, uptimeDays: merged };
        });
      }

      setProviders(allProviders);
      setError(null);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    timerRef.current = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // ── Filters ───────────────────────────────────────────────────────────────
  const cats     = ["all", ...new Set((providers || []).map(p => p.cat).filter(Boolean))];
  const searchQ = filterSearch.trim().toLowerCase();
  const filtered = (providers || []).filter(p => {
    if (filterCat !== "all" && p.cat !== filterCat) return false;
    if (filterCloud !== "all" && (p.cloud || "own") !== filterCloud) return false;
    if (filterStatus === "issues" && p.status === "ok") return false;
    if (filterStatus === "ok"     && p.status !== "ok") return false;
    if (filterStatus === "maintenance" &&
        !(p.componentSummary?.degraded > 0 && !p.activeIncidents?.length)) return false;
    if (searchQ && !p.name.toLowerCase().includes(searchQ) &&
        !(p.cat || "").toLowerCase().includes(searchQ) &&
        !(CAT_LABELS[p.cat] || "").toLowerCase().includes(searchQ) &&
        !(p.activeIncidents || []).some(i => i.name?.toLowerCase().includes(searchQ))) return false;
    return true;
  });

  // ── Maintenance count (for pill) ──────────────────────────────────────────
  const maintenanceCount = (providers || []).filter(p =>
    p.componentSummary?.degraded > 0 && !p.activeIncidents?.length
  ).length;

  // ── Summary counts ────────────────────────────────────────────────────────
  const realProviders = (providers || []).filter(p => p.status !== "unknown");
  const ok      = realProviders.filter(p => p.status === "ok").length;
  const issues  = realProviders.filter(p => p.status === "warning" || p.status === "outage").length;
  const outages = realProviders.filter(p => p.status === "outage").length;
  const unknown = (providers || []).filter(p => p.status === "unknown").length;

  // ── All active incidents (for the top summary block) ─────────────────────
  const allIncidents = (providers || [])
    .filter(p => p.activeIncidents?.length > 0)
    .flatMap(p => p.activeIncidents.map(i => ({
      ...i, providerName: p.name, providerIcon: p.icon, ticketId: p.ticketId || null,
    })))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  function toggleExpand(id) {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
  }

  const groupedCats = [...new Set(filtered.map(p => p.cat))];

  const pad = isMobile ? "12px 14px" : "24px 28px";

  return (
    <div style={{ flex: 1, overflow: "auto", background: T.bg, color: T.text, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: isMobile ? "100%" : 1100, margin: "0 auto", padding: pad }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: isMobile ? 17 : 22, fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              ☁️ Cloud Health Monitor
            </h1>
            <div style={{ fontSize: isMobile ? 11 : 12, color: T.muted, marginTop: 3 }}>
              {providers.length} providers · every 5 min
              {lastFetch && <span style={{ marginLeft: 6 }}>· {timeAgo(lastFetch.toISOString())}</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: T.muted, pointerEvents: "none" }}>🔍</span>
              <input
                type="text"
                placeholder="Search providers…"
                value={filterSearch}
                onChange={e => setFilterSearch(e.target.value)}
                style={{
                  paddingLeft: 28, paddingRight: filterSearch ? 24 : 10,
                  paddingTop: 6, paddingBottom: 6,
                  width: isMobile ? 130 : 180,
                  fontSize: 12, background: T.surface,
                  border: `1px solid ${T.border}`, borderRadius: 8,
                  color: T.text, outline: "none",
                  fontFamily: "inherit",
                }}
              />
              {filterSearch && (
                <button onClick={() => setFilterSearch("")} style={{
                  position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", cursor: "pointer",
                  fontSize: 12, color: T.muted, padding: 0, lineHeight: 1,
                }}>✕</button>
              )}
            </div>
            <button
              onClick={refresh}
              style={{
                background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
                padding: isMobile ? "6px 10px" : "7px 14px", fontSize: 12,
                cursor: "pointer", color: T.text, fontWeight: 600, flexShrink: 0,
              }}
            >↺</button>
          </div>
        </div>

        {/* ── Summary pills ── */}
        {!loading && providers.length > 0 && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
              <StatusDot status="ok" size={7} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#16a34a" }}>{ok}</span>
              <span style={{ fontSize: 11, color: "#166534" }}>OK</span>
            </div>
            {issues > 0 && (
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                <StatusDot status="warning" size={7} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#b45309" }}>{issues - outages}</span>
                <span style={{ fontSize: 11, color: "#92400e" }}>Degraded</span>
              </div>
            )}
            {outages > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                <StatusDot status="outage" size={7} />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#dc2626" }}>{outages}</span>
                <span style={{ fontSize: 11, color: "#991b1b" }}>Outage</span>
              </div>
            )}
            {maintenanceCount > 0 && (
              <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
                onClick={() => setFilterStatus(s => s === "maintenance" ? "all" : "maintenance")}>
                <span style={{ fontSize: 11 }}>🔧</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#4f46e5" }}>{maintenanceCount}</span>
                <span style={{ fontSize: 11, color: "#3730a3" }}>Maintenance</span>
              </div>
            )}
            {unknown > 0 && (
              <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                <StatusDot status="unknown" size={7} />
                <span style={{ fontSize: 13, fontWeight: 700, color: T.muted }}>{unknown}</span>
                <span style={{ fontSize: 11, color: T.muted }}>Pending</span>
              </div>
            )}
          </div>
        )}

        {/* ── Alert banner ── */}
        <CorrelationBanner providers={providers} />

        {/* ── Loading / error ── */}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, color: T.muted, gap: 10 }}>
            <span style={{ fontSize: 20 }}>⟳</span> Polling {providers.length || "…"} providers…
          </div>
        )}
        {error && !loading && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 16px", color: "#dc2626", fontSize: 12 }}>
            ⚠ Fetch error — {error}
          </div>
        )}

        {/* ── Filter bar ── */}
        {!loading && providers.length > 0 && (
          <div style={{ marginBottom: 16, display: "flex", gap: 6, alignItems: "center", overflowX: "auto", flexWrap: "nowrap", paddingBottom: 2, WebkitOverflowScrolling: "touch" }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Filter</span>
            {[
              { key: "all",         label: "All" },
              { key: "issues",      label: "🔴 Issues" },
              { key: "maintenance", label: "🔧 Maintenance" },
              { key: "ok",          label: "✓ OK only" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilterStatus(f.key)} style={{
                background: filterStatus === f.key ? "#0f172a" : T.surface,
                color: filterStatus === f.key ? "#fff" : T.text,
                border: `1px solid ${filterStatus === f.key ? "#0f172a" : T.border}`,
                borderRadius: 20, padding: "4px 11px", fontSize: 11, cursor: "pointer",
                fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
              }}>{f.label}</button>
            ))}
          </div>
        )}

        {/* ── Cloud-grouped provider view ── */}
        {!loading && filtered.length > 0 && (() => {
          // Main cloud vendors: placed in their own section by id, not by cloud field.
          // All other providers: bucketed by their p.cloud (which cloud they run on).
          const MAIN_CLOUDS = new Set(["aws", "gcp", "azure", "oracle"]);
          const getSection = (p) => MAIN_CLOUDS.has(p.id) ? p.id : (p.cloud || "own");

          const cloudSections = [
            { id: "aws",    label: "AWS",               icon: "🟡", meta: CLOUD_META.aws    },
            { id: "gcp",    label: "Google Cloud",       icon: "🔵", meta: CLOUD_META.gcp    },
            { id: "azure",  label: "Azure",              icon: "🔷", meta: CLOUD_META.azure  },
            { id: "oracle", label: "Oracle Cloud",       icon: "🔺", meta: CLOUD_META.oracle },
            { id: "own",    label: "Own Infrastructure", icon: "🏢", meta: CLOUD_META.own    },
            { id: "multi",  label: "Multi-cloud",        icon: "🌐", meta: CLOUD_META.multi  },
          ];

          return cloudSections.map(section => {
            const sectionProviders = filtered.filter(p => getSection(p) === section.id);
            if (sectionProviders.length === 0) return null;

            const hasIssues = sectionProviders.some(p => p.status === "warning" || p.status === "outage");
            const outageCount = sectionProviders.filter(p => p.status === "outage").length;
            const warnCount   = sectionProviders.filter(p => p.status === "warning").length;
            const okCount     = sectionProviders.filter(p => p.status === "ok").length;

            // Find the base cloud provider entry (if exists in providers, e.g. AWS itself)
            const cloudProvider = providers.find(p => p.id === section.id);
            // Services hosted on this cloud (excludes the platform itself)
            const hostedServices = sectionProviders.filter(p => p.id !== section.id);

            const sectionBg     = hasIssues
              ? (outageCount > 0 ? "#fff8f8" : "#fffdf0")
              : "transparent";
            const sectionBorder = hasIssues
              ? (outageCount > 0 ? "#fecaca" : "#fde68a")
              : T.border;

            return (
              <div key={section.id} style={{
                marginBottom: isMobile ? 20 : 28,
                background: sectionBg,
                border: hasIssues ? `1px solid ${sectionBorder}` : "none",
                borderRadius: hasIssues ? 12 : 0,
                padding: hasIssues ? (isMobile ? "12px 10px" : "16px 18px") : 0,
              }}>
                {/* Section header */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 20 }}>{section.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: T.text }}>{section.label}</div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 1, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {hostedServices.length > 0 && (
                        <span>{hostedServices.length} hosted service{hostedServices.length !== 1 ? "s" : ""}</span>
                      )}
                      {okCount > 0 && <span style={{ color: "#16a34a" }}>✓ {okCount} OK</span>}
                      {warnCount > 0 && <span style={{ color: "#b45309" }}>⚠ {warnCount} degraded</span>}
                      {outageCount > 0 && <span style={{ color: "#dc2626" }}>✕ {outageCount} outage</span>}
                    </div>
                  </div>
                  {/* Cloud provider own status (if it's a cloud platform) */}
                  {cloudProvider && cloudProvider.status !== "unknown" && (
                    <div style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                      color: STATUS_META[cloudProvider.status]?.color || T.muted,
                      background: STATUS_META[cloudProvider.status]?.bg || T.surface,
                      border: `1px solid ${STATUS_META[cloudProvider.status]?.border || T.border}`,
                      borderRadius: 6, padding: "3px 8px", flexShrink: 0,
                    }}>
                      Platform {STATUS_META[cloudProvider.status]?.label || cloudProvider.status}
                    </div>
                  )}
                </div>

                {/* ── Platform Status Block — always shown when cloudProvider exists ── */}
                {cloudProvider && (() => {
                  const sm  = STATUS_META[cloudProvider.status] || STATUS_META.unknown;
                  const hasInc = cloudProvider.activeIncidents?.length > 0;
                  const compOk  = cloudProvider.componentSummary?.operational ?? null;
                  const compTot = cloudProvider.componentSummary?.total ?? null;
                  const statusUrl = STATUS_PAGE_URLS[cloudProvider.id] || cloudProvider.statusUrl || null;

                  return (
                    <div style={{
                      marginBottom: 14,
                      border: `1px solid ${hasInc ? sm.border : T.border}`,
                      borderLeft: `4px solid ${hasInc ? sm.dot : "#22c55e"}`,
                      borderRadius: 8, overflow: "hidden",
                      background: hasInc ? sm.bg : T.surface,
                    }}>
                      {/* ── Summary row ── */}
                      <div style={{
                        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                        padding: "10px 14px",
                        borderBottom: hasInc ? `1px solid ${sm.border}` : "none",
                      }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{cloudProvider.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: 13, color: T.text }}>
                            {cloudProvider.name}
                          </div>
                          <div style={{ fontSize: 11, color: T.muted, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, color: hasInc ? sm.color : "#16a34a" }}>
                              {hasInc ? `⚠ ${cloudProvider.description}` : `✓ ${cloudProvider.description || "All systems operational"}`}
                            </span>
                            {compTot !== null && (
                              <span>{compOk}/{compTot} components OK</span>
                            )}
                            {cloudProvider.lastUpdated && (
                              <span>· updated {timeAgo(cloudProvider.lastUpdated)}</span>
                            )}
                          </div>
                        </div>
                        {/* Status badge */}
                        <span style={{
                          fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                          color: hasInc ? sm.color : "#16a34a",
                          background: hasInc ? sm.bg : "#f0fdf4",
                          border: `1px solid ${hasInc ? sm.border : "#bbf7d0"}`,
                          borderRadius: 5, padding: "3px 9px", flexShrink: 0,
                        }}>
                          {hasInc ? sm.label : "Operational"}
                        </span>
                        {statusUrl && (
                          <a href={statusUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none",
                              border: "1px solid #bfdbfe", borderRadius: 5, padding: "3px 9px",
                              background: "#eff6ff", fontWeight: 600, flexShrink: 0 }}>
                            ↗ Status page
                          </a>
                        )}
                      </div>

                      {/* ── Incident rows (only when incidents exist) ── */}
                      {hasInc && cloudProvider.activeIncidents.map((inc, idx) => {
                        const ic = impactColor(inc.impact);
                        const firstSentence = inc.latestUpdate?.text?.split(/\.\s+/)[0]?.trim();
                        return (
                          <div key={inc.id || idx} style={{
                            padding: "10px 14px",
                            borderBottom: idx < cloudProvider.activeIncidents.length - 1 ? `1px solid ${sm.border}` : "none",
                            background: T.bg,
                          }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
                              <span style={{
                                fontSize: 10, fontWeight: 800, textTransform: "uppercase",
                                color: "#fff", background: ic, borderRadius: 4, padding: "2px 7px",
                                flexShrink: 0, alignSelf: "center",
                              }}>{inc.impact}</span>
                              <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1, minWidth: 0 }}>
                                {inc.name}
                              </span>
                            </div>
                            {(inc.region || inc.service || inc.affectedComponents?.length > 0) && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                                {inc.region && (
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "#0369a1",
                                    background: "#e0f2fe", border: "1px solid #bae6fd",
                                    borderRadius: 4, padding: "2px 7px" }}>📍 {inc.region}</span>
                                )}
                                {inc.service && (
                                  <span style={{ fontSize: 10, fontWeight: 600, color: "#6d28d9",
                                    background: "#ede9fe", border: "1px solid #ddd6fe",
                                    borderRadius: 4, padding: "2px 7px" }}>⚙️ {inc.service}</span>
                                )}
                                {(inc.affectedComponents || []).map((c, i) => (
                                  <span key={i} style={{ fontSize: 10, fontWeight: 500, color: "#475569",
                                    background: "#f1f5f9", border: "1px solid #e2e8f0",
                                    borderRadius: 4, padding: "2px 7px" }}>{c}</span>
                                ))}
                              </div>
                            )}
                            {firstSentence && firstSentence.length > 20 && (
                              <div style={{ marginTop: 6, fontSize: 11, color: "#475569", lineHeight: 1.5,
                                padding: "5px 9px", background: "#f8fafc", borderRadius: 4,
                                border: `1px solid ${T.border}`, fontStyle: "italic" }}>
                                {firstSentence}{firstSentence.endsWith(".") ? "" : "."}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Service cards — exclude the cloud provider itself (shown above) */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
                  gap: isMobile ? 8 : 10,
                }}>
                  {sectionProviders
                    .filter(p => p.id !== section.id)   // cloud vendor pinned above, not repeated in grid
                    .map(p => (
                      <ProviderCard
                        key={p.id}
                        p={p}
                        expanded={!!expanded[p.id]}
                        onToggle={() => toggleExpand(p.id)}
                      />
                    ))}
                </div>
              </div>
            );
          });
        })()}

        {!loading && filtered.length === 0 && !error && (
          <div style={{ textAlign: "center", color: T.muted, padding: 40, fontSize: 13 }}>
            No providers match the current filter.
          </div>
        )}

      </div>
    </div>
  );
}
