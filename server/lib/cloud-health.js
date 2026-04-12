// ─── Cloud Health Monitor ──────────────────────────────────────────────────────
// Polls public status APIs from major cloud / CDN / infrastructure providers.
// Interval: every 5 minutes.
//
// Normalised shape per provider:
// {
//   id, name, icon, category,
//   status: "ok" | "warning" | "outage" | "unknown",
//   indicator: "none" | "minor" | "major" | "critical" | "unknown",
//   description: string,
//   activeIncidents: [{ id, name, impact, status, createdAt, updatedAt, url }],
//   components: [{ name, status }],   // degraded components only
//   lastUpdated: ISO string,
//   ok: bool,
//   error: string | null,
// }

import { createClient } from "@supabase/supabase-js";
import { gunzip as _gunzip } from "node:zlib";
import { promisify }         from "node:util";
import { isPaused }          from "./poller-control.js";

const gunzip = promisify(_gunzip);

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const RETENTION_H  = 36;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

const FETCH_TIMEOUT = 12_000; // 12s per provider

// ── Atlassian Statuspage v2 providers ────────────────────────────────────────
// `cloud` = hosting infrastructure: "aws" | "gcp" | "azure" | "own" | "multi"
// NOTE: Fastly removed — their statuspage (fastly.statuspage.io) requires API key (401).
const STATUSPAGE_PROVIDERS = [
  // ── CDN / Infrastructure ──────────────────────────────────────────────────
  { id: "cloudflare",   name: "Cloudflare",    icon: "🟠", cat: "cdn",      cloud: "own",   url: "https://www.cloudflarestatus.com/api/v2/summary.json" },
  { id: "fastly",       name: "Fastly",        icon: "⚡",  cat: "cdn",      cloud: "own",   url: "https://status.fastly.com/api/v2/summary.json" },
  // ── Cloud ─────────────────────────────────────────────────────────────────
  { id: "oracle",       name: "Oracle Cloud",  icon: "🔺",  cat: "cloud",   cloud: "own",   url: "https://ocloudinfra.statuspage.io/api/v2/summary.json" },
  // ── DevOps / Dev Tools ────────────────────────────────────────────────────
  { id: "github",       name: "GitHub",        icon: "🐙",  cat: "devtools", cloud: "azure", url: "https://www.githubstatus.com/api/v2/summary.json" },
  { id: "atlassian",    name: "Atlassian",     icon: "⬡",   cat: "devtools", cloud: "aws",   url: "https://status.atlassian.com/api/v2/summary.json" },
  { id: "gitlab",       name: "GitLab",        icon: "🦊",  cat: "devtools", cloud: "gcp",   url: "https://status.gitlab.com/api/v2/summary.json" },
  { id: "hashicorp",    name: "HashiCorp",     icon: "🏔",  cat: "devtools", cloud: "aws",   url: "https://status.hashicorp.com/api/v2/summary.json" },
  // ── Observability ─────────────────────────────────────────────────────────
  { id: "datadog",      name: "Datadog",       icon: "🐕",  cat: "obs",      cloud: "aws",   url: "https://status.datadoghq.com/api/v2/summary.json" },
  { id: "pagerduty",    name: "PagerDuty",     icon: "📟",  cat: "obs",      cloud: "aws",   url: "https://status.pagerduty.com/api/v2/summary.json" },
  { id: "newrelic",     name: "New Relic",     icon: "📊",  cat: "obs",      cloud: "aws",   url: "https://status.newrelic.com/api/v2/summary.json" },
  // ── Security / SASE ──────────────────────────────────────────────────────
  { id: "forcepoint",   name: "Forcepoint",    icon: "🔒",  cat: "security", cloud: "aws",   url: "https://78lm3dxlst13.statuspage.io/api/v2/summary.json" },
  // CrowdStrike: blocked from DO IPs — removed
  // ── Identity ─────────────────────────────────────────────────────────────
  // Okta requires audience token (HTTP 401) — use their .io subdomain
  { id: "okta",         name: "Okta",          icon: "🔐",  cat: "identity", cloud: "aws",   url: "https://status.okta.com/api/v2/summary.json" },
  { id: "auth0",        name: "Auth0",         icon: "🔑",  cat: "identity", cloud: "aws",   url: "https://status.auth0.com/api/v2/summary.json" },
  { id: "duo",          name: "Duo Security",  icon: "🛡",  cat: "identity", cloud: "aws",   url: "https://status.duosecurity.com/api/v2/summary.json" },
  // ── Comms / Collaboration ─────────────────────────────────────────────────
  { id: "zoom",         name: "Zoom",          icon: "📹",  cat: "comms",    cloud: "aws",   url: "https://status.zoom.us/api/v2/summary.json" },
  { id: "discord",      name: "Discord",       icon: "🎮",  cat: "comms",    cloud: "gcp",   url: "https://discordstatus.com/api/v2/summary.json" },
  { id: "twilio",       name: "Twilio",        icon: "📞",  cat: "comms",    cloud: "aws",   url: "https://status.twilio.com/api/v2/summary.json" },
  { id: "sendgrid",     name: "SendGrid",      icon: "📧",  cat: "comms",    cloud: "aws",   url: "https://status.sendgrid.com/api/v2/summary.json" },
  // ── Gaming ────────────────────────────────────────────────────────────────
  { id: "epic",         name: "Epic Games",    icon: "🎯",  cat: "gaming",   cloud: "aws",   url: "https://status.epicgames.com/api/v2/summary.json" },
  { id: "roblox",       name: "Roblox",        icon: "🧱",  cat: "gaming",   cloud: "aws",   url: "https://status.roblox.com/api/v2/summary.json" },
  // ── Fintech / Payments ────────────────────────────────────────────────────
  { id: "stripe",       name: "Stripe",        icon: "💜",  cat: "fintech",  cloud: "aws",   url: "https://status.stripe.com/api/v2/summary.json" },
  { id: "wise",         name: "Wise",          icon: "💳",  cat: "fintech",  cloud: "aws",   url: "https://status.wise.com/api/v2/summary.json" },
  // Adyen: not Atlassian Statuspage (returns HTML) — removed
  // PayPal: returns HTML from their URL — removed
  // ── Crypto ────────────────────────────────────────────────────────────────
  { id: "kraken",       name: "Kraken",        icon: "🐙",  cat: "crypto",   cloud: "own",   url: "https://status.kraken.com/api/v2/summary.json" },
  { id: "moonpay",      name: "MoonPay",       icon: "🌙",  cat: "crypto",   cloud: "aws",   url: "https://status.moonpay.com/api/v2/summary.json" },
  // ── Design / Collaboration ────────────────────────────────────────────────
  { id: "figma",        name: "Figma",         icon: "🎨",  cat: "design",   cloud: "aws",   url: "https://status.figma.com/api/v2/summary.json" },
  // Canva: not Atlassian Statuspage (returns HTML) — removed
  { id: "miro",         name: "Miro",          icon: "🪄",  cat: "design",   cloud: "aws",   url: "https://status.miro.com/api/v2/summary.json" },
  { id: "notion",       name: "Notion",        icon: "📝",  cat: "design",   cloud: "aws",   url: "https://status.notion.so/api/v2/summary.json" },
  // ── E-commerce ────────────────────────────────────────────────────────────
  { id: "shopify",      name: "Shopify",       icon: "🛒",  cat: "ecomm",    cloud: "gcp",   url: "https://www.shopifystatus.com/api/v2/summary.json" },
  // ── Web3 ──────────────────────────────────────────────────────────────────
  { id: "opensea",      name: "OpenSea",       icon: "🌊",  cat: "web3",     cloud: "aws",   url: "https://status.opensea.io/api/v2/summary.json" },
];

// ── In-memory state ───────────────────────────────────────────────────────────
let state = [];

// ticketId per provider (set after auto-creation, shown in frontend)
const providerTickets = new Map();

/** Called by poller.js after auto-creating a ticket for a cloud event */
export function setProviderTicketId(providerId, ticketId) {
  if (ticketId) providerTickets.set(providerId, ticketId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function indicatorToStatus(indicator) {
  if (!indicator || indicator === "none") return "ok";
  if (indicator === "minor")             return "warning";
  return "outage"; // major | critical
}

function componentStatusRank(s) {
  const r = { major_outage: 3, partial_outage: 2, degraded_performance: 1, under_maintenance: 0, operational: -1 };
  return r[s] ?? -1;
}

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        "User-Agent":      "BodaphoneNOC/1.0",
        "Accept":          "application/json, text/plain, */*",
        // "identity" tells the server: don't compress — avoids gzip decode issues
        // when Node.js fetch doesn't auto-decompress (custom headers drop Accept-Encoding)
        "Accept-Encoding": "identity",
        ...(opts.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Parse JSON with a readable error showing the first bytes of the actual response */
async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.slice(0, 120).replace(/[\x00-\x1f]/g, "·");
    throw new Error(`Non-JSON response (${res.status}) from ${res.url} — got: ${preview}`);
  }
}

function errProvider(meta, error) {
  return {
    ...meta,
    status: "unknown",
    indicator: "unknown",
    description: "Data unavailable",
    activeIncidents: [],
    components: [],
    lastUpdated: new Date().toISOString(),
    ok: false,
    error: error.message ?? String(error),
  };
}

// ── Statuspage v2 fetcher ─────────────────────────────────────────────────────
async function fetchStatuspage(provider) {
  const r = await fetchWithTimeout(provider.url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await safeJson(r);

  const indicator = d.status?.indicator || "none";

  const activeIncidents = (d.incidents || [])
    .filter(i => i.status !== "resolved" && i.status !== "postmortem")
    .map(i => ({
      id:        i.id,
      name:      i.name,
      impact:    i.impact || "none",
      status:    i.status,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      url:       i.shortlink || null,
      // Affected components give region/service context
      affectedComponents: (i.components || []).slice(0, 6).map(c => c.name),
    }));

  const components = (d.components || [])
    .filter(c => componentStatusRank(c.status) >= 0 && !c.group)
    .sort((a, b) => componentStatusRank(b.status) - componentStatusRank(a.status))
    .slice(0, 6)
    .map(c => ({ name: c.name, status: c.status }));

  return {
    id:       provider.id,
    name:     provider.name,
    icon:     provider.icon,
    cat:      provider.cat,
    cloud:    provider.cloud || null,
    status:   indicatorToStatus(indicator),
    indicator,
    description:      d.status?.description || "Unknown",
    activeIncidents,
    components,
    lastUpdated:      d.page?.updated_at || new Date().toISOString(),
    ok:    true,
    error: null,
  };
}

// ── AWS date parser — handles seconds, ms, or ISO string ─────────────────────
function parseAwsDate(d) {
  if (!d) return new Date().toISOString();
  const n = Number(d);
  if (!isNaN(n) && n > 0) {
    // >13 digits = milliseconds; <=10 digits = seconds
    const ms = n > 9_999_999_999 ? n : n * 1000;
    const dt = new Date(ms);
    if (!isNaN(dt.getTime())) return dt.toISOString();
  }
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

// ── AWS region code → human-readable label ────────────────────────────────────
const AWS_REGION_NAMES = {
  "us-east-1": "US East (N. Virginia)",
  "us-east-2": "US East (Ohio)",
  "us-west-1": "US West (N. California)",
  "us-west-2": "US West (Oregon)",
  "eu-west-1": "EU (Ireland)",
  "eu-west-2": "EU (London)",
  "eu-west-3": "EU (Paris)",
  "eu-central-1": "EU (Frankfurt)",
  "eu-central-2": "EU (Zurich)",
  "eu-north-1": "EU (Stockholm)",
  "eu-south-1": "EU (Milan)",
  "eu-south-2": "EU (Spain)",
  "ap-southeast-1": "Asia Pacific (Singapore)",
  "ap-southeast-2": "Asia Pacific (Sydney)",
  "ap-northeast-1": "Asia Pacific (Tokyo)",
  "ap-northeast-2": "Asia Pacific (Seoul)",
  "ap-northeast-3": "Asia Pacific (Osaka)",
  "ap-south-1": "Asia Pacific (Mumbai)",
  "ap-south-2": "Asia Pacific (Hyderabad)",
  "ap-east-1": "Asia Pacific (Hong Kong)",
  "me-south-1": "Middle East (Bahrain)",
  "me-central-1": "Middle East (UAE)",
  "af-south-1": "Africa (Cape Town)",
  "ca-central-1": "Canada (Central)",
  "ca-west-1": "Canada West (Calgary)",
  "sa-east-1": "South America (São Paulo)",
  "il-central-1": "Israel (Tel Aviv)",
  "global": "Global",
};
function awsRegionLabel(code) {
  if (!code) return null;
  return AWS_REGION_NAMES[code.toLowerCase()] || code;
}

// ── AWS fetcher ───────────────────────────────────────────────────────────────
// AWS Health Dashboard: health.aws.amazon.com/public/currentevents
// Response is gzip-compressed + UTF-16 LE JSON — requires manual decode.
async function fetchAWS() {
  const meta = { id: "aws", name: "AWS", icon: "🟡", cat: "cloud", cloud: "own" };

  // Fetch raw bytes — we'll handle gzip + encoding manually
  const r = await fetchWithTimeout("https://health.aws.amazon.com/public/currentevents", {
    headers: { "Accept-Encoding": "gzip", "Accept": "application/json" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);

  const raw = Buffer.from(await r.arrayBuffer());

  let events;
  try {
    // Decompress if gzip (magic bytes 0x1f 0x8b)
    const bytes = (raw[0] === 0x1f && raw[1] === 0x8b) ? await gunzip(raw) : raw;
    // Try UTF-8 first (most likely), then UTF-16 LE with/without BOM
    let text;
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) {
      // UTF-16 LE BOM
      text = bytes.slice(2).toString("utf16le");
    } else if (bytes[0] === 0xFE && bytes[1] === 0xFF) {
      // UTF-16 BE BOM — rare but possible
      text = bytes.slice(2).swap16().toString("utf16le");
    } else {
      // Try UTF-8 first; if it fails, try UTF-16 LE (no BOM)
      const utf8text = bytes.toString("utf8");
      try {
        JSON.parse(utf8text); // test parse
        text = utf8text;
      } catch {
        text = bytes.toString("utf16le");
      }
    }
    events = JSON.parse(text);
  } catch (e) {
    throw new Error(`AWS decode failed: ${e.message} — first bytes: ${raw.slice(0, 8).toString("hex")}`);
  }

  // Shape: [{ date, arn, region_name, status, service, service_name, summary, event_log[] }]
  // status: "1"=ok, "2"=informational, "3"=degraded, "4"=outage
  // Debug: log first event keys so we can see the actual structure if unexpected
  const all    = Array.isArray(events) ? events : Object.values(events).find(Array.isArray) || [];
  const active = all.filter(e => parseInt(e.status) > 1);

  const EU_RE = /eu-west|eu-central|eu-north|ireland|frankfurt|paris|milan|spain|london|amsterdam/i;
  // Also include Middle East (Bahrain, UAE) — relevant for Vodafone
  const VODAFONE_RE = new RegExp(EU_RE.source + "|me-south|me-central|bahrain|uae|dubai", "i");
  const euEvents = active.filter(e =>
    VODAFONE_RE.test(`${e.region_name} ${e.service} ${e.summary}`)
  );
  const shown = euEvents.length > 0 ? euEvents : active.slice(0, 5);

  const hasOutage  = shown.some(e => parseInt(e.status) >= 3);
  const hasWarning = shown.some(e => parseInt(e.status) >= 2);

  return {
    ...meta,
    status:      hasOutage ? "outage" : hasWarning ? "warning" : "ok",
    indicator:   hasOutage ? "major"  : hasWarning ? "minor"   : "none",
    description: active.length === 0
      ? "All Systems Operational"
      : `${active.length} active event${active.length !== 1 ? "s" : ""}`,
    activeIncidents: shown.map(e => {
      // Extract latest log entry for update text
      const logs       = Array.isArray(e.event_log) ? [...e.event_log].reverse() : [];
      const latestLog  = logs[0];
      const regionLabel = awsRegionLabel(e.region_name);
      const svcLabel    = e.service_name || e.service || null;
      return {
        id:        e.arn || `aws-${e.date}`,
        name:      e.summary || svcLabel || "AWS Incident",
        impact:    parseInt(e.status) >= 3 ? "major" : "minor",
        status:    "investigating",
        region:    regionLabel,
        service:   svcLabel,
        createdAt: parseAwsDate(e.date || e.start_time || e.timestamp),
        updatedAt: latestLog
          ? parseAwsDate(latestLog.date || latestLog.timestamp)
          : new Date().toISOString(),
        url:       "https://health.aws.amazon.com",
        latestUpdate: latestLog ? {
          text:      latestLog.message || latestLog.description || null,
          updatedAt: parseAwsDate(latestLog.date || latestLog.timestamp),
        } : null,
      };
    }),
    components:  [],
    lastUpdated: new Date().toISOString(),
    ok:    true,
    error: null,
  };
}

// ── GCP fetcher ───────────────────────────────────────────────────────────────
async function fetchGCP() {
  const meta = { id: "gcp", name: "Google Cloud", icon: "🔵", cat: "cloud", cloud: "own" };

  const r = await fetchWithTimeout("https://status.cloud.google.com/incidents.json");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const incidents = await safeJson(r);

  const now = Date.now();
  const DAY  = 24 * 60 * 60 * 1000;

  // Active = no end date AND started within last 7 days
  const active = (incidents || []).filter(i =>
    !i.end && new Date(i.begin).getTime() > now - 7 * DAY
  );

  // EU-relevant filter for Vodafone correlation
  const EU_RE = /europe|frankfurt|belgium|netherlands|london|warsaw|madrid|milan|amsterdam/i;
  const euActive = active.filter(i => EU_RE.test(JSON.stringify(i).toLowerCase()));
  const shown = euActive.length > 0 ? euActive : active.slice(0, 3);

  const hasOutage = shown.some(i => i.severity === "high");

  return {
    ...meta,
    status:      shown.length > 0 ? (hasOutage ? "outage" : "warning") : "ok",
    indicator:   shown.length > 0 ? (hasOutage ? "major"  : "minor")   : "none",
    description: shown.length > 0
      ? `${shown.length} active incident${shown.length !== 1 ? "s" : ""}`
      : "All Systems Operational",
    activeIncidents: shown.map(i => ({
      id:        String(i.number || i.id || Math.random()),
      name:      i.external_desc || "GCP Incident",
      impact:    i.severity === "high" ? "major" : "minor",
      status:    "investigating",
      createdAt: i.begin,
      updatedAt: i.modified || i.begin,
      url:       "https://status.cloud.google.com",
    })),
    components: [...new Set(
      shown.flatMap(i => (i.affected_products || []).map(p => p.title))
    )].slice(0, 6).map(name => ({ name, status: "degraded_performance" })),
    lastUpdated: new Date().toISOString(),
    ok:    true,
    error: null,
  };
}

// ── Azure fetcher ─────────────────────────────────────────────────────────────
// Azure publishes an Atom/RSS feed — parse it with regex (no external lib)
async function fetchAzure() {
  const meta = { id: "azure", name: "Azure", icon: "🔷", cat: "cloud", cloud: "own" };

  const r = await fetchWithTimeout("https://azure.status.microsoft/en-us/status/feed/", {
    headers: { Accept: "application/xml, text/xml, */*" },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  if (!xml.includes("<feed") && !xml.includes("<?xml")) {
    throw new Error(`Expected XML feed, got: ${xml.slice(0, 80).replace(/[\x00-\x1f]/g, "·")}`);
  }

  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
    const s     = m[1];
    const title   = (s.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || "";
    const updated = (s.match(/<updated>(.*?)<\/updated>/) || [])[1] || "";
    const link    = (s.match(/<link[^>]*href="([^"]*)"/) || [])[1] || "";
    const summary = (s.match(/<summary[^>]*>([\s\S]*?)<\/summary>/) || [])[1] || "";
    return {
      title:   title.replace(/<[^>]+>/g, "").trim(),
      updated,
      summary: summary.replace(/<[^>]+>/g, "").trim(),
      link,
    };
  });

  const cutoff     = Date.now() - 24 * 60 * 60 * 1000;
  const recent     = entries.filter(e => e.updated && new Date(e.updated).getTime() > cutoff);
  const activeOnes = recent.filter(e =>
    !/(mitigated|resolved|closed|rca)/i.test(e.title + " " + e.summary)
  );

  return {
    ...meta,
    status:      activeOnes.length > 0 ? "warning" : "ok",
    indicator:   activeOnes.length > 0 ? "minor"   : "none",
    description: activeOnes.length > 0
      ? `${activeOnes.length} active issue${activeOnes.length !== 1 ? "s" : ""}`
      : "All Systems Operational",
    activeIncidents: activeOnes.slice(0, 5).map((e, i) => ({
      id:        `azure-${i}-${Date.now()}`,
      name:      e.title,
      impact:    "minor",
      status:    "investigating",
      createdAt: e.updated,
      updatedAt: e.updated,
      url:       e.link || "https://azure.status.microsoft",
    })),
    components:  [],
    lastUpdated: new Date().toISOString(),
    ok:    true,
    error: null,
  };
}

// ── Slack fetcher ─────────────────────────────────────────────────────────────
async function fetchSlack() {
  const meta = { id: "slack", name: "Slack", icon: "💬", cat: "comms", cloud: "aws" };
  const r = await fetchWithTimeout("https://status.slack.com/api/v2.0.0/current");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await safeJson(r);

  const activeIncidents = (d.active_incidents || []).map(i => ({
    id:        i.id || String(Math.random()),
    name:      i.title || "Slack Incident",
    impact:    i.type === "outage" ? "major" : "minor",
    status:    "investigating",
    createdAt: i.date_created,
    updatedAt: i.date_updated,
    url:       "https://status.slack.com",
  }));

  return {
    ...meta,
    status:      activeIncidents.length > 0 ? "warning" : "ok",
    indicator:   activeIncidents.length > 0 ? "minor" : "none",
    description: d.status === "ok" ? "All systems operational" : `${activeIncidents.length} active incident${activeIncidents.length !== 1 ? "s" : ""}`,
    activeIncidents,
    components:  [],
    lastUpdated: d.date_updated || new Date().toISOString(),
    ok: true, error: null,
  };
}

// ── Binance fetcher ───────────────────────────────────────────────────────────
async function fetchBinance() {
  const meta = { id: "binance", name: "Binance", icon: "🟡", cat: "crypto", cloud: "aws" };
  const r = await fetchWithTimeout("https://api.binance.com/sapi/v1/system/status");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await safeJson(r);
  // { status: 0, msg: "normal" } or { status: 1, msg: "system maintenance" }
  const isOk = d.status === 0;
  return {
    ...meta,
    status:      isOk ? "ok"   : "outage",
    indicator:   isOk ? "none" : "major",
    description: isOk ? "All systems operational" : (d.msg || "System maintenance"),
    activeIncidents: isOk ? [] : [{
      id: "binance-main", name: d.msg || "System Maintenance",
      impact: "major", status: "investigating",
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), url: null,
    }],
    components:  [],
    lastUpdated: new Date().toISOString(),
    ok: true, error: null,
  };
}

// ── Supabase persistence ──────────────────────────────────────────────────────
async function saveToSupabase(providers) {
  if (!supabase || !providers?.length) return;
  try {
    const rows = providers.map(p => ({
      provider_id:    p.id,
      provider_name:  p.name,
      status:         p.status || "unknown",
      indicator:      p.indicator || "unknown",
      incident_count: (p.activeIncidents || []).length,
      description:    p.description || null,
      measured_at:    new Date().toISOString(),
    }));
    await supabase.from("cloud_provider_status").insert(rows);
  } catch { /* non-fatal */ }
}

async function cleanupOldData(logFn) {
  if (!supabase) return;
  try {
    const cutoff = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { count } = await supabase
      .from("cloud_provider_status")
      .delete()
      .lt("measured_at", cutoff)
      .select("id", { count: "exact", head: true });
    if (count > 0) logFn?.(`[cloud-health] cleaned ${count} rows older than ${RETENTION_H}h`);
  } catch { /* non-fatal */ }
}

export async function getCloudStatusHistory() {
  if (!supabase) return [];
  try {
    const since = new Date(Date.now() - RETENTION_H * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("cloud_provider_status")
      .select("provider_id, status, indicator, incident_count, description, measured_at")
      .gte("measured_at", since)
      .order("measured_at", { ascending: true });
    if (error) throw error;
    return data || [];
  } catch { return []; }
}

// ── Tick ──────────────────────────────────────────────────────────────────────
export async function tickCloudHealth(log) {
  if (isPaused("cloud-health")) { log?.("[cloud-health] ⏸ paused"); return; }

  const customProviders = [
    fetchAWS().catch(e    => errProvider({ id:"aws",     name:"AWS",          icon:"🟡", cat:"cloud",  cloud:"own" }, e)),
    fetchGCP().catch(e    => errProvider({ id:"gcp",     name:"Google Cloud", icon:"🔵", cat:"cloud",  cloud:"own" }, e)),
    fetchAzure().catch(e  => errProvider({ id:"azure",   name:"Azure",        icon:"🔷", cat:"cloud",  cloud:"own" }, e)),
    fetchSlack().catch(e  => errProvider({ id:"slack",   name:"Slack",        icon:"💬", cat:"comms",  cloud:"aws" }, e)),
    fetchBinance().catch(e=> errProvider({ id:"binance", name:"Binance",      icon:"🟡", cat:"crypto", cloud:"aws" }, e)),
  ];

  const statuspageProviders = STATUSPAGE_PROVIDERS.map(p =>
    fetchStatuspage(p).catch(e => errProvider(p, e))
  );

  const results = await Promise.all([...customProviders, ...statuspageProviders]);
  state = results;

  // Log per-provider failures for easier debugging
  for (const r of state) {
    if (!r.ok) log?.(`[cloud-health] ✗ ${r.id}: ${r.error}`);
  }

  await saveToSupabase(state).catch(() => {});
  await cleanupOldData(log).catch(() => {});

  const ok      = state.filter(s => s.status === "ok").length;
  const issues  = state.filter(s => s.status === "warning" || s.status === "outage").length;
  const unknown = state.filter(s => s.status === "unknown").length;
  log?.(`[cloud-health] tick: ${ok} ok · ${issues} issues · ${unknown} unknown (${state.length} providers)`);
}

export async function initCloudHealth(log) {
  log?.(`[cloud-health] initialising — polling ${STATUSPAGE_PROVIDERS.length + 5} providers...`);
  await tickCloudHealth(log);
}

export function getCloudHealth() {
  // Merge ticketId into each provider's state object
  return state.map(p => ({
    ...p,
    ticketId: providerTickets.get(p.id) || null,
  }));
}
