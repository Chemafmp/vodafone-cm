// ─── Downdetector Partner API client ─────────────────────────────────────────
// Official REST API provided by Ookla after signing a Partner agreement.
// Set USE_OFFICIAL_API=1 + DOWNDETECTOR_API_KEY + DOWNDETECTOR_API_URL to enable.
//
// This module exports the same scrapeAll(log) interface as downdetector-scraper.js
// so service-status.js can swap between scraper / official API / simulator with
// a single env-var change — no other code needs to change.
//
// ─── How to configure once you have Ookla credentials ─────────────────────────
// 1. Set DOWNDETECTOR_API_URL  = base URL from your contract (e.g. https://api.downdetector.com/1.0)
// 2. Set DOWNDETECTOR_API_KEY  = Bearer token / API key from Ookla
// 3. Set USE_OFFICIAL_API=1    = activates this module in service-status.js
//
// ─── How to map Ookla API responses to this module ────────────────────────────
// Fill in ENDPOINT_PATH, COMPANY_SLUG_MAP and parseResponse() below once you
// have the API documentation from Ookla. Everything else is already wired up.
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = (process.env.DOWNDETECTOR_API_URL || "").replace(/\/$/, "");
const API_KEY  = process.env.DOWNDETECTOR_API_KEY || null;
const TIMEOUT_MS = 15_000;

// ─── TODO: fill in once you have Ookla API docs ───────────────────────────────

// Endpoint path pattern. Placeholders: {slug}
// Example (fictitious — replace with real path from docs):
//   "/companies/{slug}/reports/recent"
const ENDPOINT_PATH = "/companies/{slug}/reports/recent"; // ← UPDATE ME

// Map our internal market id → slug used by Ookla for Vodafone in each country.
// Check the API docs or ask Ookla for the correct company slugs.
const COMPANY_SLUG_MAP = {
  es: "vodafone-es",   // ← verify with Ookla
  uk: "vodafone-uk",
  de: "vodafone-de",
  it: "vodafone-it",
  pt: "vodafone-pt",
  nl: "vodafone-nl",
  ie: "vodafone-ie",
  gr: "vodafone-gr",
  ro: "vodafone-ro",
  tr: "vodafone-tr",
};

/**
 * Map one API response object → { complaints, baseline, status }.
 * TODO: replace field names with the actual ones from Ookla API docs.
 *
 * Expected return shape:
 *   { complaints: number, baseline: number|null, status: "ok"|"warning"|"outage"|null }
 */
function parseResponse(json) {
  // ── EXAMPLE mapping — replace with real field names ──────────────────────
  // Ookla may use: reports_last_24h, current_status, baseline_reports, etc.
  return {
    complaints: json.reports_last_24h   ?? json.report_count  ?? json.count ?? 0,
    baseline:   json.baseline_reports   ?? json.baseline      ?? null,
    status:     json.current_status     ?? json.status        ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

const MARKETS = [
  { id: "es", name: "Spain",       flag: "🇪🇸" },
  { id: "uk", name: "UK",          flag: "🇬🇧" },
  { id: "de", name: "Germany",     flag: "🇩🇪" },
  { id: "it", name: "Italy",       flag: "🇮🇹" },
  { id: "pt", name: "Portugal",    flag: "🇵🇹" },
  { id: "nl", name: "Netherlands", flag: "🇳🇱" },
  { id: "ie", name: "Ireland",     flag: "🇮🇪" },
  { id: "gr", name: "Greece",      flag: "🇬🇷" },
  { id: "ro", name: "Romania",     flag: "🇷🇴" },
  { id: "tr", name: "Turkey",      flag: "🇹🇷" },
];

async function fetchMarket(m, log) {
  const slug = COMPANY_SLUG_MAP[m.id];
  const path = ENDPOINT_PATH.replace("{slug}", slug);
  const url  = `${API_URL}${path}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Accept":        "application/json",
      },
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${await resp.text().catch(() => "")}`);
    const json = await resp.json();
    return parseResponse(json);
  } finally {
    clearTimeout(t);
  }
}

// ─── scrapeAll — same interface as downdetector-scraper.js ───────────────────
export async function scrapeAll(log) {
  if (!API_URL || !API_KEY) {
    log?.("[downdetector-api] ERROR: DOWNDETECTOR_API_URL or DOWNDETECTOR_API_KEY not set");
    return MARKETS.map(m => ({ market: m, ok: false, error: "missing credentials" }));
  }
  log?.(`[downdetector-api] fetching official API (${API_URL})…`);

  const settled = await Promise.allSettled(
    MARKETS.map(async (m) => {
      try {
        const { complaints, baseline, status } = await fetchMarket(m, log);
        log?.(`[downdetector-api] ✓ ${m.id}: ${complaints} reports`);
        return {
          market:     m,
          complaints,
          baseline:   baseline ?? null,
          trend:      null,       // null → service-status.js appends to ring buffer
          status:     status ?? null,
          ok:         true,
          source:     "official-api",
        };
      } catch (e) {
        log?.(`[downdetector-api] ✗ ${m.id}: ${e.message}`);
        return { market: m, ok: false, error: e.message };
      }
    })
  );

  return settled.map(s => s.value);
}

export { MARKETS };
