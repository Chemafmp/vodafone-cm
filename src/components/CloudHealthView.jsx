// ─── Cloud Health View ─────────────────────────────────────────────────────────
// Fetches cloud provider status DIRECTLY from public APIs (browser-side).
// 5 providers work cross-origin: Cloudflare, GitHub, GCP, Datadog, Twilio.
// 6 providers are CORS-blocked from browser and come from /api/cloud-health:
//   AWS, Azure, Fastly, Oracle, Zoom, PagerDuty.

import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../data/constants.js";

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
  { id: "fastly",      name: "Fastly",       icon: "⚡",  cat: "cdn",      cloud: "own",   url: "https://status.fastly.com/api/v2/summary.json" },
  { id: "oracle",      name: "Oracle Cloud", icon: "🔺",  cat: "cloud",    cloud: "own",   url: "https://ocloudinfra.statuspage.io/api/v2/summary.json" },
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
  { id: "okta",        name: "Okta",         icon: "🔐",  cat: "identity", cloud: "aws",   url: "https://status.okta.com/api/v2/summary.json" },
  { id: "auth0",       name: "Auth0",        icon: "🔑",  cat: "identity", cloud: "aws",   url: "https://status.auth0.com/api/v2/summary.json" },
  { id: "duo",         name: "Duo Security", icon: "🛡",  cat: "identity", cloud: "aws",   url: "https://status.duosecurity.com/api/v2/summary.json" },
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
  { id: "notion",      name: "Notion",       icon: "📝",  cat: "design",   cloud: "aws",   url: "https://status.notion.so/api/v2/summary.json" },
  // ── E-commerce ────────────────────────────────────────────────────────────
  { id: "shopify",     name: "Shopify",      icon: "🛒",  cat: "ecomm",    cloud: "gcp",   url: "https://www.shopifystatus.com/api/v2/summary.json" },
  // ── Web3 ──────────────────────────────────────────────────────────────────
  { id: "opensea",     name: "OpenSea",      icon: "🌊",  cat: "web3",     cloud: "aws",   url: "https://status.opensea.io/api/v2/summary.json" },
];

// CORS-blocked or custom API — data comes from backend /api/cloud-health:
const BACKEND_ONLY_META = [
  { id: "aws",     name: "AWS",     icon: "🟡", cat: "cloud",  cloud: "own", statusUrl: "https://health.aws.amazon.com" },
  { id: "azure",   name: "Azure",   icon: "🔷", cat: "cloud",  cloud: "own", statusUrl: "https://azure.status.microsoft" },
  { id: "slack",   name: "Slack",   icon: "💬", cat: "comms",  cloud: "aws", statusUrl: "https://status.slack.com" },
  { id: "binance", name: "Binance", icon: "🟡", cat: "crypto", cloud: "aws", statusUrl: "https://www.binance.com" },
];

// ── Cloud hosting metadata ────────────────────────────────────────────────────
const CLOUD_META = {
  aws:   { label: "AWS",   icon: "🟡", color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
  gcp:   { label: "GCP",   icon: "🔵", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe" },
  azure: { label: "Azure", icon: "🔷", color: "#6366f1", bg: "#eef2ff", border: "#c7d2fe" },
  own:   { label: "Own",   icon: "🏢", color: "#64748b", bg: "#f8fafc", border: "#e2e8f0" },
  multi: { label: "Multi", icon: "🌐", color: "#8b5cf6", bg: "#f5f3ff", border: "#ddd6fe" },
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

// ── Fetch helpers ─────────────────────────────────────────────────────────────
function indicatorToStatus(ind) {
  if (!ind || ind === "none") return "ok";
  if (ind === "minor")        return "warning";
  return "outage";
}

function compRank(s) {
  return { major_outage:3, partial_outage:2, degraded_performance:1, under_maintenance:0 }[s] ?? -1;
}

async function fetchStatuspage(p) {
  const baseUrl = p.url.replace("/api/v2/summary.json", "");
  const [summaryRes, historyRes] = await Promise.allSettled([
    fetch(p.url, { headers: { Accept: "application/json" } }),
    fetch(`${baseUrl}/api/v2/incidents.json?limit=100`, { headers: { Accept: "application/json" } }),
  ]);
  if (summaryRes.status !== "fulfilled" || !summaryRes.value.ok) {
    throw new Error(summaryRes.status === "fulfilled" ? `HTTP ${summaryRes.value.status}` : "fetch failed");
  }
  const r = summaryRes.value;
  const d = await r.json();

  const indicator = d.status?.indicator || "none";

  const activeIncidents = (d.incidents || [])
    .filter(i => i.status !== "resolved" && i.status !== "postmortem")
    .map(i => {
      // Latest update text from incident_updates[]
      const sortedUpdates = (i.incident_updates || [])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const latestUpdate = sortedUpdates[0] || null;
      return {
        id:           i.id,
        name:         i.name,
        impact:       i.impact || "none",
        status:       i.status,
        createdAt:    i.created_at,
        updatedAt:    i.updated_at,
        url:          i.shortlink || null,
        // Affected components surface region / service context
        affectedComponents: (i.components || []).slice(0, 6).map(c => c.name),
        latestUpdate: latestUpdate ? {
          text:      latestUpdate.body,
          updatedAt: latestUpdate.created_at,
        } : null,
      };
    });

  // All non-operational components (degraded + maintenance)
  const degradedComponents = (d.components || [])
    .filter(c => compRank(c.status) >= 0 && !c.group)
    .sort((a, b) => compRank(b.status) - compRank(a.status))
    .map(c => ({ name: c.name, status: c.status }));

  // Component summary: count all leaf components
  const leafComponents = (d.components || []).filter(c => !c.group);
  const operationalCount = leafComponents.filter(c => c.status === "operational").length;

  // Historical incidents for uptime chart
  let uptimeDays = null;
  if (historyRes.status === "fulfilled" && historyRes.value.ok) {
    try {
      const hd = await historyRes.value.json();
      uptimeDays = computeUptimeHours(hd.incidents || []);
    } catch { /* ignore */ }
  }

  return {
    ...p,
    status:           indicatorToStatus(indicator),
    indicator,
    description:      d.status?.description || "Unknown",
    activeIncidents,
    components:       degradedComponents,
    componentSummary: {
      total:       leafComponents.length,
      operational: operationalCount,
      degraded:    leafComponents.length - operationalCount,
    },
    uptimeDays,
    lastUpdated: d.page?.updated_at || new Date().toISOString(),
    ok: true, error: null,
  };
}

async function fetchGCP() {
  const meta = { id: "gcp", name: "Google Cloud", icon: "🔵", cat: "cloud" };
  const r = await fetch("https://status.cloud.google.com/incidents.json");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const incidents = await r.json();

  const now = Date.now();
  const active = (incidents || []).filter(i => !i.end && new Date(i.begin).getTime() > now - 7 * 86400000);
  const EU_RE  = /europe|frankfurt|belgium|netherlands|london|warsaw|madrid|milan|amsterdam/i;
  const euActive = active.filter(i => EU_RE.test(JSON.stringify(i).toLowerCase()));
  const shown  = euActive.length > 0 ? euActive : active.slice(0, 3);

  const hasOutage = shown.some(i => i.severity === "high");

  // Affected locations (EU-relevant)
  const allLocations = [...new Set(
    shown.flatMap(i => (i.currently_affected_locations || []).map(l => l.title))
  )].slice(0, 8);

  // Latest update text
  const allUpdates = shown.flatMap(i =>
    (i.updates || []).map(u => ({ ...u, _ts: u.created || u.modified || "" }))
  ).sort((a, b) => new Date(b._ts) - new Date(a._ts));
  const latestUpdate = allUpdates[0]
    ? { text: allUpdates[0].text, updatedAt: allUpdates[0]._ts }
    : null;

  // Uptime history from all incidents (including ended ones)
  const allIncidentsForHistory = (incidents || []).map(i => ({
    name:        i.external_desc || "GCP Incident",
    impact:      i.severity === "high" ? "major" : "minor",
    created_at:  i.begin,
    resolved_at: i.end || null,
  }));
  const uptimeDays = computeUptimeHours(allIncidentsForHistory);

  // Affected products
  const affectedProducts = [...new Set(
    shown.flatMap(i => (i.affected_products || []).map(p => p.title))
  )].slice(0, 6);

  return {
    ...meta,
    status:      shown.length > 0 ? (hasOutage ? "outage" : "warning") : "ok",
    indicator:   shown.length > 0 ? (hasOutage ? "major"  : "minor")   : "none",
    description: shown.length > 0
      ? `${shown.length} active incident${shown.length !== 1 ? "s" : ""}`
      : "All services operating normally",
    activeIncidents: shown.map(i => {
      const sortedUpd = (i.updates || []).sort((a, b) => new Date(b.created||b.modified) - new Date(a.created||a.modified));
      const upd  = sortedUpd[0];
      const locs = (i.currently_affected_locations || []).map(l => l.title).slice(0, 4);
      const svcs = (i.affected_products || []).map(p => p.title).slice(0, 4);
      return {
        id:                 String(i.number || Math.random()),
        name:               i.external_desc || "GCP Incident",
        impact:             i.severity === "high" ? "major" : "minor",
        status:             "investigating",
        region:             locs.length > 0 ? locs.join(", ") : null,
        affectedComponents: svcs,
        createdAt:          i.begin,
        updatedAt:          i.modified || i.begin,
        url:                "https://status.cloud.google.com",
        latestUpdate: upd ? { text: upd.text, updatedAt: upd.created || upd.modified } : null,
      };
    }),
    components: affectedProducts.map(name => ({ name, status: "degraded_performance" })),
    affectedLocations: allLocations,
    latestUpdate,
    uptimeDays,
    lastUpdated: new Date().toISOString(),
    ok: true, error: null,
  };
}

function errProvider(meta, err) {
  return {
    ...meta,
    status: "unknown", indicator: "unknown",
    description: "Data unavailable",
    activeIncidents: [], components: [],
    lastUpdated: new Date().toISOString(),
    ok: false, error: err?.message || String(err),
  };
}

// ── Uptime history helpers ────────────────────────────────────────────────────
/** Map: impact → severity rank (for picking worst-of-day) */
function impactRank(impact) {
  return { critical: 3, major: 2, minor: 1, none: 0 }[impact] ?? 0;
}

/**
 * Given an array of incidents (with created_at / resolved_at),
 * return an array of 36 hourly slots: { date, status, incidents[] }.
 */
function computeUptimeHours(incidents, numHours = 36) {
  const slots = [];
  const now   = new Date();
  for (let i = numHours - 1; i >= 0; i--) {
    const slotStart = new Date(now);
    slotStart.setMinutes(0, 0, 0);
    slotStart.setHours(slotStart.getHours() - i);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(59, 59, 999);

    const active = (incidents || []).filter(inc => {
      const created  = new Date(inc.created_at || inc.begin || 0);
      const resolved = inc.resolved_at ? new Date(inc.resolved_at) : (inc.end ? new Date(inc.end) : new Date());
      return created <= slotEnd && resolved >= slotStart;
    });

    const worst = active.reduce((best, inc) => {
      const rank = impactRank(inc.impact || inc.severity || "none");
      return rank > impactRank(best) ? (inc.impact || inc.severity || "none") : best;
    }, "none");

    slots.push({
      date:      new Date(slotStart),
      status:    worst === "none" ? "ok" : worst === "minor" ? "warning" : "outage",
      incidents: active.map(i => ({ name: i.name || i.external_desc || "Incident", impact: i.impact || i.severity })),
    });
  }
  return slots;
}

/**
 * Compute 36 hourly uptime slots from Supabase snapshot rows for one provider.
 * Returns null if no data found for this provider.
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

    let status = "unknown";
    if (inSlot.length > 0) {
      status = "ok";
      for (const s of inSlot) {
        if (s.status === "outage")  { status = "outage"; break; }
        if (s.status === "warning") { status = "warning"; }
      }
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

async function fetchSlack() {
  const meta = { id: "slack", name: "Slack", icon: "💬", cat: "comms" };
  const [curRes, histRes] = await Promise.allSettled([
    fetch("https://status.slack.com/api/v2.0.0/current"),
    fetch("https://status.slack.com/api/v2.0.0/history"),
  ]);
  if (curRes.status !== "fulfilled" || !curRes.value.ok) throw new Error("Fetch failed");
  const d = await curRes.value.json();

  const activeIncidents = (d.active_incidents || []).map(i => ({
    id:        i.id || String(Math.random()),
    name:      i.title || "Slack Incident",
    impact:    i.type === "outage" ? "major" : "minor",
    status:    "investigating",
    createdAt: i.date_created,
    updatedAt: i.date_updated,
    url:       "https://status.slack.com",
    latestUpdate: i.notes?.length > 0
      ? { text: i.notes[i.notes.length - 1].body, updatedAt: i.notes[i.notes.length - 1].date_created }
      : null,
  }));

  let uptimeDays = null;
  if (histRes.status === "fulfilled" && histRes.value.ok) {
    try {
      const history = await histRes.value.json();
      const incidents = (Array.isArray(history) ? history : []).map(i => ({
        name:        i.title || "Slack Incident",
        impact:      i.type === "outage" ? "major" : "minor",
        created_at:  i.date_created,
        resolved_at: i.date_resolved || null,
      }));
      uptimeDays = computeUptimeHours(incidents);
    } catch { /* ignore */ }
  }

  return {
    ...meta,
    status:      activeIncidents.length > 0 ? "warning" : "ok",
    indicator:   activeIncidents.length > 0 ? "minor" : "none",
    description: d.status === "ok" ? "All systems operational" : `${activeIncidents.length} active incident${activeIncidents.length !== 1 ? "s" : ""}`,
    activeIncidents,
    components: [],
    uptimeDays,
    lastUpdated: d.date_updated || new Date().toISOString(),
    ok: true, error: null,
  };
}

// Only fetch providers accessible from browser (GCP + Slack have custom fetchers):
async function fetchBrowserProviders() {
  const results = await Promise.allSettled([
    fetchGCP().catch(e   => errProvider({ id: "gcp",   name: "Google Cloud", icon: "🔵", cat: "cloud", cloud: "own"  }, e)),
    fetchSlack().catch(e => errProvider({ id: "slack",  name: "Slack",        icon: "💬", cat: "comms", cloud: "aws"  }, e)),
    ...STATUSPAGE_PROVIDERS.map(p => fetchStatuspage(p).catch(e => errProvider(p, e))),
  ]);
  return results.map(r => r.status === "fulfilled" ? r.value : r.reason);
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

function impactColor(impact) {
  if (impact === "critical" || impact === "major") return "#dc2626";
  if (impact === "minor") return "#b45309";
  return "#64748b";
}

function fmtTime(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) + " " +
           d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  } catch { return iso; }
}

function timeAgo(iso) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)     return "just now";
  if (diff < 3_600_000)  return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
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
        {/* Latest update text */}
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
  const cloudProviderIds = ["aws", "gcp", "azure"];
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
    try {
      const [browserResult, backendResult, historyResult] = await Promise.allSettled([
        fetchBrowserProviders(),
        fetch(`${base}/api/cloud-health`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`${base}/api/cloud-health/history`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);

      let browserProviders = browserResult.status === "fulfilled" ? browserResult.value : [];
      const backendData    = backendResult.status === "fulfilled"  ? backendResult.value  : null;
      const historyData    = historyResult.status === "fulfilled"  ? historyResult.value  : null;

      let allProviders = [...browserProviders];

      if (Array.isArray(backendData)) {
        // Merge ticketIds into browser-fetched providers
        const ticketMap = Object.fromEntries(
          backendData.filter(p => p.ticketId).map(p => [p.id, p.ticketId])
        );
        allProviders = allProviders.map(p => ({ ...p, ticketId: ticketMap[p.id] || null }));

        // Add backend-only providers (AWS, Azure, Fastly, Oracle, Zoom, PagerDuty)
        const browserIds = new Set(allProviders.map(p => p.id));
        const backendOnly = backendData
          .filter(p => !browserIds.has(p.id))
          .map(p => ({ ...p, backendOnly: false })); // real data from backend
        allProviders = [...allProviders, ...backendOnly];
      } else {
        // Backend not available — show static placeholders for backend-only providers
        const backendPlaceholders = BACKEND_ONLY_META.map(p => ({
          ...p,
          status:          "unknown",
          indicator:       "unknown",
          description:     "Deploy backend to see live data",
          activeIncidents: [],
          components:      [],
          lastUpdated:     new Date().toISOString(),
          ok:              false,
          error:           null,
          backendOnly:     true,
        }));
        allProviders = [...allProviders, ...backendPlaceholders];
      }

      // Enrich uptimeDays from Supabase history (overrides Atlassian incidents-based uptime)
      if (Array.isArray(historyData) && historyData.length > 0) {
        allProviders = allProviders.map(p => {
          const snapshotUptime = computeUptimeFromSnapshots(historyData, p.id);
          return snapshotUptime ? { ...p, uptimeDays: snapshotUptime } : p;
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

        {/* ── Cloud infrastructure correlation ── */}
        {!loading && providers.length > 0 && (
          <CloudInfraPanel providers={providers} isMobile={isMobile} />
        )}

        {/* ── Active incidents summary block ── */}
        {allIncidents.length > 0 && (
          <div style={{ marginBottom: 20, background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid #fed7aa", display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15 }}>🚨</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: "#9a3412" }}>
                Active Incidents ({allIncidents.length})
              </span>
            </div>
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              {allIncidents.map((inc, i) => {
                const providerTicketUrl = inc.ticketId
                  ? `${FRONTEND_BASE}/#ticket=${encodeURIComponent(inc.ticketId)}`
                  : null;
                return (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 8,
                    background: "#fff", border: "1px solid #fde68a",
                    borderLeft: `3px solid ${impactColor(inc.impact)}`,
                    borderRadius: 8, padding: "8px 10px",
                  }}>
                    <span style={{ fontSize: 14, flexShrink: 0 }}>{inc.providerIcon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {inc.providerName} · {inc.name}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ color: impactColor(inc.impact), fontWeight: 600, textTransform: "uppercase", fontSize: 10 }}>{inc.impact}</span>
                        <span>· {fmtTime(inc.createdAt)}</span>
                        {providerTicketUrl && (
                          <a href={providerTicketUrl} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 10, fontWeight: 700, color: "#7c3aed", background: "#ede9fe", border: "1px solid #c4b5fd", borderRadius: 6, padding: "1px 6px", textDecoration: "none" }}>
                            🎫 {inc.ticketId}
                          </a>
                        )}
                      </div>
                    </div>
                    {inc.url && (
                      <a href={inc.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 11, color: "#3b82f6", textDecoration: "none", flexShrink: 0 }}>↗</a>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Filter bar — two rows ── */}
        <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 7 }}>
          {/* Row 1: status + cloud hosting */}
          <div style={{
            display: "flex", gap: 6, alignItems: "center",
            overflowX: "auto", flexWrap: "nowrap",
            paddingBottom: 2, WebkitOverflowScrolling: "touch",
          }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Status</span>
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
            <span style={{ width: 1, height: 16, background: T.border, margin: "0 4px", flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cloud</span>
            {[
              { key: "all",   label: "All" },
              { key: "aws",   label: "🟡 AWS" },
              { key: "gcp",   label: "🔵 GCP" },
              { key: "azure", label: "🔷 Azure" },
              { key: "own",   label: "🏢 Own infra" },
            ].map(f => {
              const cm = CLOUD_META[f.key];
              const active = filterCloud === f.key;
              return (
                <button key={f.key} onClick={() => setFilterCloud(f.key)} style={{
                  background: active ? (cm?.color || "#0f172a") : T.surface,
                  color: active ? "#fff" : (cm?.color || T.text),
                  border: `1px solid ${active ? (cm?.color || "#0f172a") : T.border}`,
                  borderRadius: 20, padding: "4px 11px", fontSize: 11, cursor: "pointer",
                  fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
                }}>{f.label}</button>
              );
            })}
          </div>
          {/* Row 2: categories */}
          <div style={{
            display: "flex", gap: 6, alignItems: "center",
            overflowX: "auto", flexWrap: "nowrap",
            paddingBottom: 2, WebkitOverflowScrolling: "touch",
          }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 700, flexShrink: 0, textTransform: "uppercase", letterSpacing: "0.06em" }}>Category</span>
            {cats.map(cat => (
              <button key={cat} onClick={() => setFilterCat(cat)} style={{
                background: filterCat === cat ? "#3b82f6" : T.surface,
                color: filterCat === cat ? "#fff" : T.text,
                border: `1px solid ${filterCat === cat ? "#3b82f6" : T.border}`,
                borderRadius: 20, padding: "4px 11px", fontSize: 11, cursor: "pointer",
                fontWeight: 600, flexShrink: 0, whiteSpace: "nowrap",
              }}>{cat === "all" ? "All" : (CAT_LABELS[cat] || cat)}</button>
            ))}
          </div>
        </div>

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

        {/* ── Provider grid grouped by category ── */}
        {!loading && filtered.length > 0 && groupedCats.map(cat => (
          <div key={cat} style={{ marginBottom: isMobile ? 20 : 28 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              {CAT_LABELS[cat] || cat}
            </div>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))",
              gap: isMobile ? 8 : 10,
            }}>
              {filtered.filter(p => p.cat === cat).map(p => (
                <ProviderCard
                  key={p.id}
                  p={p}
                  expanded={!!expanded[p.id]}
                  onToggle={() => toggleExpand(p.id)}
                />
              ))}
            </div>
          </div>
        ))}

        {!loading && filtered.length === 0 && !error && (
          <div style={{ textAlign: "center", color: T.muted, padding: 40, fontSize: 13 }}>
            No providers match the current filter.
          </div>
        )}

        {/* ── Footer ── */}
        {!isMobile && (
          <div style={{ marginTop: 12, padding: "12px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, fontSize: 11, color: T.muted, lineHeight: 1.7 }}>
            <strong style={{ color: T.text }}>Browser-direct:</strong> GCP · Cloudflare · GitHub · Discord · Atlassian · GitLab · Datadog · PagerDuty · Twilio · Epic · Wise · Figma · Canva · Miro · Shopify · Slack.
            {" "}<strong style={{ color: T.text }}>Backend-polled:</strong> AWS · Azure · Fastly · Oracle · Binance + others.
            {" "}Incident updates expand inline. Refresh: 5 min.
          </div>
        )}

      </div>
    </div>
  );
}
