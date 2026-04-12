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
import { isPaused } from "./poller-control.js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const RETENTION_H  = 36;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
}

const FETCH_TIMEOUT = 12_000; // 12s per provider

// ── Atlassian Statuspage v2 providers ────────────────────────────────────────
const STATUSPAGE_PROVIDERS = [
  { id: "cloudflare", name: "Cloudflare",   icon: "🟠", cat: "cdn",     url: "https://www.cloudflarestatus.com/api/v2/summary.json" },
  { id: "fastly",     name: "Fastly",       icon: "⚡",  cat: "cdn",     url: "https://www.fastlystatus.com/api/v2/summary.json" },
  { id: "github",     name: "GitHub",       icon: "🐙",  cat: "devtools", url: "https://www.githubstatus.com/api/v2/summary.json" },
  { id: "atlassian",  name: "Atlassian",    icon: "⬡",   cat: "devtools", url: "https://status.atlassian.com/api/v2/summary.json" },
  { id: "gitlab",     name: "GitLab",       icon: "🦊",  cat: "devtools", url: "https://status.gitlab.com/api/v2/summary.json" },
  { id: "oracle",     name: "Oracle Cloud", icon: "🔺",  cat: "cloud",    url: "https://ocistatus.oraclecloud.com/api/v2/summary.json" },
  { id: "zoom",       name: "Zoom",         icon: "📹",  cat: "comms",    url: "https://status.zoom.us/api/v2/summary.json" },
  { id: "discord",    name: "Discord",      icon: "🎮",  cat: "comms",    url: "https://discordstatus.com/api/v2/summary.json" },
  { id: "datadog",    name: "Datadog",      icon: "🐕",  cat: "obs",      url: "https://status.datadoghq.com/api/v2/summary.json" },
  { id: "pagerduty",  name: "PagerDuty",    icon: "📟",  cat: "obs",      url: "https://status.pagerduty.com/api/v2/summary.json" },
  { id: "twilio",     name: "Twilio",       icon: "📞",  cat: "comms",    url: "https://status.twilio.com/api/v2/summary.json" },
  { id: "epic",       name: "Epic Games",   icon: "🎯",  cat: "gaming",   url: "https://status.epicgames.com/api/v2/summary.json" },
  { id: "wise",       name: "Wise",         icon: "💳",  cat: "fintech",  url: "https://status.wise.com/api/v2/summary.json" },
  { id: "figma",      name: "Figma",        icon: "🎨",  cat: "design",   url: "https://status.figma.com/api/v2/summary.json" },
  { id: "canva",      name: "Canva",        icon: "🖌",  cat: "design",   url: "https://status.canva.com/api/v2/summary.json" },
  { id: "miro",       name: "Miro",         icon: "🪄",  cat: "design",   url: "https://status.miro.com/api/v2/summary.json" },
  { id: "shopify",    name: "Shopify",      icon: "🛒",  cat: "ecomm",    url: "https://www.shopifystatus.com/api/v2/summary.json" },
  { id: "opensea",    name: "OpenSea",      icon: "🌊",  cat: "web3",     url: "https://status.opensea.io/api/v2/summary.json" },
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

// ── Slack fetcher ─────────────────────────────────────────────────────────────
async function fetchSlack() {
  const meta = { id: "slack", name: "Slack", icon: "💬", cat: "comms" };
  const r = await fetchWithTimeout("https://status.slack.com/api/v2.0.0/current");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();

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
  const meta = { id: "binance", name: "Binance", icon: "🟡", cat: "fintech" };
  const r = await fetchWithTimeout("https://api.binance.com/sapi/v1/system/status");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json();
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
    fetchAWS().catch(e    => errProvider({ id:"aws",     name:"AWS",          icon:"🟡", cat:"cloud"   }, e)),
    fetchGCP().catch(e    => errProvider({ id:"gcp",     name:"Google Cloud", icon:"🔵", cat:"cloud"   }, e)),
    fetchAzure().catch(e  => errProvider({ id:"azure",   name:"Azure",        icon:"🔷", cat:"cloud"   }, e)),
    fetchSlack().catch(e  => errProvider({ id:"slack",   name:"Slack",        icon:"💬", cat:"comms"   }, e)),
    fetchBinance().catch(e=> errProvider({ id:"binance", name:"Binance",      icon:"🟡", cat:"fintech" }, e)),
  ];

  const statuspageProviders = STATUSPAGE_PROVIDERS.map(p =>
    fetchStatuspage(p).catch(e => errProvider(p, e))
  );

  const results = await Promise.all([...customProviders, ...statuspageProviders]);
  state = results;

  await saveToSupabase(state).catch(() => {});
  await cleanupOldData(log).catch(() => {});

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
