// ─── RIPE Stat ASN Enrichment ─────────────────────────────────────────────────
// Fetches BGP peer topology for each Vodafone market ASN using RIPE Stat APIs:
//   asn-neighbours: upstream, peer, and downstream ASNs + relationship type
//   whois:          org name for each neighbour ASN (cached across refreshes)
//
// Caches neighbour lists for 1h to respect RIPE Stat rate limits.
// Rate-limits individual calls to ~600ms apart.
//
// Exports: initRipeStatEnrichment(log), tickRipeStatEnrichment(log), getEnrichment()

import { RIPE_MARKETS } from "./ripe-atlas.js";

const RIPE_STAT      = "https://stat.ripe.net/data";
const CACHE_TTL_MS   = 3_600_000;   // 1 hour per market
const CALL_DELAY_MS  = 600;         // 600ms between API calls
const MAX_NEIGHBOURS = 15;          // top N upstream/peer neighbours per market

// Org name cache: ASN (number) → { orgName, country } — survives across 1h refreshes
const orgCache = new Map();

// Enrichment state: marketId → { asn, neighbours[], lastUpdated }
const enrichState = new Map();
let logFn = null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function statFetch(path) {
  const url = `${RIPE_STAT}/${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "bodaphone-lab/1.0 (network monitoring; admin@chemafmp.dev)",
      Accept:       "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Fetch neighbours for one ASN — returns array of { asn, type, power }
async function fetchNeighbours(asn) {
  const json = await statFetch(`asn-neighbours/data.json?resource=AS${asn}&lod=1`);
  const raw = json?.data?.neighbours || [];
  return raw
    .filter(n => n.type !== "right")                // skip customers — too noisy
    .map(n => ({ asn: n.asn, type: n.type, power: n.power ?? 0 }))
    .sort((a, b) => (b.power || 0) - (a.power || 0))
    .slice(0, MAX_NEIGHBOURS);
}

// Fetch org name for one ASN — result cached globally
async function fetchOrgName(asn) {
  if (orgCache.has(asn)) return orgCache.get(asn);
  try {
    const json = await statFetch(`whois/data.json?resource=AS${asn}`);
    const records = json?.data?.records || [];
    let orgName = null, country = null;
    for (const group of records) {
      for (const field of group) {
        if (!orgName && (field.key === "as-name" || field.key === "ASName")) {
          orgName = field.value?.replace(/_/g, " ").trim() || null;
        }
        if (!country && (field.key === "country" || field.key === "Country")) {
          country = field.value?.toUpperCase() || null;
        }
      }
    }
    const entry = { orgName: orgName || `AS${asn}`, country };
    orgCache.set(asn, entry);
    await sleep(CALL_DELAY_MS);
    return entry;
  } catch {
    const entry = { orgName: `AS${asn}`, country: null };
    orgCache.set(asn, entry);
    return entry;
  }
}

// Enrich one market: fetch neighbours + resolve org names
async function enrichMarket(m) {
  try {
    logFn?.(`[enrich] fetching neighbours for AS${m.asn} (${m.id})…`);
    const neighbours = await fetchNeighbours(m.asn);
    await sleep(CALL_DELAY_MS);

    // Resolve org names for any ASN not yet cached
    const uncached = neighbours.filter(n => !orgCache.has(n.asn));
    for (const n of uncached) {
      const info = await fetchOrgName(n.asn);
      n.orgName  = info.orgName;
      n.country  = info.country;
    }
    // Fill already-cached entries
    for (const n of neighbours) {
      if (!n.orgName) {
        const cached = orgCache.get(n.asn);
        n.orgName = cached?.orgName || `AS${n.asn}`;
        n.country = cached?.country || null;
      }
    }

    enrichState.set(m.id, { asn: m.asn, neighbours, lastUpdated: Date.now() });
    logFn?.(`[enrich] ✓ ${m.id} AS${m.asn}: ${neighbours.length} upstream/peer neighbours`);
  } catch (e) {
    logFn?.(`[enrich] ✗ ${m.id}: ${e.message}`);
    if (!enrichState.has(m.id)) {
      enrichState.set(m.id, { asn: m.asn, neighbours: [], lastUpdated: null });
    }
  }
}

// Refresh any markets whose cache has expired
async function refresh() {
  const stale = RIPE_MARKETS.filter(m => {
    const s = enrichState.get(m.id);
    return !s || !s.lastUpdated || (Date.now() - s.lastUpdated > CACHE_TTL_MS);
  });
  if (!stale.length) return;
  logFn?.(`[enrich] refreshing ${stale.length} markets…`);
  for (const m of stale) {
    await enrichMarket(m);
    await sleep(CALL_DELAY_MS);
  }
}

export async function initRipeStatEnrichment(log) {
  logFn = log;
  log?.("[enrich] RIPE Stat ASN enrichment starting…");
  await refresh();
}

// Call once per hour from poller
export async function tickRipeStatEnrichment(log) {
  logFn = log;
  await refresh();
}

// Returns array of { id, asn, name, neighbours[], lastUpdated }
export function getEnrichment() {
  return RIPE_MARKETS.map(m => {
    const s = enrichState.get(m.id) || { asn: m.asn, neighbours: [], lastUpdated: null };
    return {
      id:          m.id,
      asn:         m.asn,
      name:        m.name,
      neighbours:  s.neighbours,
      lastUpdated: s.lastUpdated,
    };
  });
}
