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

import { isPaused } from "./poller-control.js";

const FETCH_TIMEOUT = 12_000; // 12s per provider

// ── Atlassian Statuspage v2 providers ────────────────────────────────────────
const STATUSPAGE_PROVIDERS = [
  { id: "cloudflare", name: "Cloudflare",   icon: "🟠", cat: "cdn",    url: "https://www.cloudflarestatus.com/api/v2/summary.json" },
  { id: "fastly",     name: "Fastly",       icon: "⚡",  cat: "cdn",    url: "https://www.fastlystatus.com/api/v2/summary.json" },
  { id: "github",     name: "GitHub",       icon: "🐙",  cat: "devops", url: "https://www.githubstatus.com/api/v2/summary.json" },
  { id: "oracle",     name: "Oracle Cloud", icon: "🔺",  cat: "cloud",  url: "https://ocistatus.oraclecloud.com/api/v2/summary.json" },
  { id: "zoom",       name: "Zoom",         icon: "📹",  cat: "comms",  url: "https://status.zoom.us/api/v2/summary.json" },
  { id: "datadog",    name: "Datadog",      icon: "🐕",  cat: "obs",    url: "https://status.datadoghq.com/api/v2/summary.json" },
  { id: "pagerduty",  name: "PagerDuty",    icon: "📟",  cat: "obs",    url: "https://status.pagerduty.com/api/v2/summary.json" },
  { id: "twilio",     name: "Twilio",       icon: "📞",  cat: "comms",  url: "https://status.twilio.com/api/v2/summary.json" },
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
      headers: { "User-Agent": "BodaphoneNOC/1.0", ...(opts.headers || {}) },
    });
  } finally {
    clearTimeout(timer);
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
  const d = await r.json();

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
    }));

  const components = (d.components || [])
    .filter(c => componentStatusRank(c.status) > 0 && !c.group)
    .sort((a, b) => componentStatusRank(b.status) - componentStatusRank(a.status))
    .slice(0, 6)
    .map(c => ({ name: c.name, status: c.status }));

  return {
    id:       provider.id,
    name:     provider.name,
    icon:     provider.icon,
    cat:      provider.cat,
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

// ── AWS fetcher ───────────────────────────────────────────────────────────────
// AWS migrated to health.aws.amazon.com. The classic data.json still exists.
async function fetchAWS() {
  const meta = { id: "aws", name: "AWS", icon: "🟡", cat: "cloud" };

  const r = await fetchWithTimeout("https://status.aws.amazon.com/data.json");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();

  // d.current = array of active events (status 0=resolved, 1=informational, 2=degraded/outage)
  const active = (d.current || []).filter(e => e.status !== 0);

  // Prefer EU region events for Vodafone correlation
  const EU_RE = /eu-west|eu-central|eu-north|ireland|frankfurt|paris|milan|spain/i;
  const euEvents = active.filter(e =>
    EU_RE.test(e.service + " " + e.summary + " " + (e.url || ""))
  );
  const shown = euEvents.length > 0 ? euEvents : active.slice(0, 5);

  const hasOutage  = shown.some(e => e.status >= 2);
  const hasWarning = shown.some(e => e.status >= 1);

  return {
    ...meta,
    status:      hasOutage ? "outage" : hasWarning ? "warning" : "ok",
    indicator:   hasOutage ? "major"  : hasWarning ? "minor"   : "none",
    description: active.length === 0
      ? "All Systems Operational"
      : `${active.length} active event${active.length !== 1 ? "s" : ""}`,
    activeIncidents: shown.map(e => ({
      id:        `${e.service}-${e.date}`,
      name:      e.summary || e.service,
      impact:    e.status >= 2 ? "major" : "minor",
      status:    "investigating",
      createdAt: new Date(e.date * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
      url:       e.url || null,
    })),
    components:  [],
    lastUpdated: new Date().toISOString(),
    ok:    true,
    error: null,
  };
}

// ── GCP fetcher ───────────────────────────────────────────────────────────────
async function fetchGCP() {
  const meta = { id: "gcp", name: "Google Cloud", icon: "🔵", cat: "cloud" };

  const r = await fetchWithTimeout("https://status.cloud.google.com/incidents.json");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const incidents = await r.json();

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
  const meta = { id: "azure", name: "Azure", icon: "🔷", cat: "cloud" };

  const r = await fetchWithTimeout("https://azure.status.microsoft/en-us/status/feed/");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();

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

// ── Tick ──────────────────────────────────────────────────────────────────────
export async function tickCloudHealth(log) {
  if (isPaused("cloud-health")) { log?.("[cloud-health] ⏸ paused"); return; }

  const customProviders = [
    fetchAWS().catch(e => errProvider({ id:"aws",  name:"AWS",          icon:"🟡", cat:"cloud" }, e)),
    fetchGCP().catch(e => errProvider({ id:"gcp",  name:"Google Cloud", icon:"🔵", cat:"cloud" }, e)),
    fetchAzure().catch(e => errProvider({ id:"azure",name:"Azure",      icon:"🔷", cat:"cloud" }, e)),
  ];

  const statuspageProviders = STATUSPAGE_PROVIDERS.map(p =>
    fetchStatuspage(p).catch(e => errProvider(p, e))
  );

  const results = await Promise.all([...customProviders, ...statuspageProviders]);
  state = results;

  const ok      = state.filter(s => s.status === "ok").length;
  const issues  = state.filter(s => s.status === "warning" || s.status === "outage").length;
  const unknown = state.filter(s => s.status === "unknown").length;
  log?.(`[cloud-health] tick: ${ok} ok · ${issues} issues · ${unknown} unknown (${state.length} providers)`);
}

export async function initCloudHealth(log) {
  log?.("[cloud-health] initialising — polling ${STATUSPAGE_PROVIDERS.length + 3} providers...");
  await tickCloudHealth(log);
}

export function getCloudHealth() {
  // Merge ticketId into each provider's state object
  return state.map(p => ({
    ...p,
    ticketId: providerTickets.get(p.id) || null,
  }));
}
