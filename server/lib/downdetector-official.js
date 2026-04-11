// ─── Downdetector Official Enterprise API client ─────────────────────────────
//
// Activation: set these env vars in the droplet's docker-compose.yml (under
// the `poller` service's `environment:` block) and restart:
//
//   DOWNDETECTOR_CLIENT_ID:     your OAuth2 client_id
//   DOWNDETECTOR_CLIENT_SECRET: your OAuth2 client_secret
//
// That's it — service-status.js picks them up automatically and switches from
// simulator → real Downdetector data per market.
//
// Downdetector Enterprise API docs:
//   https://enterprise.downdetector.com/api/v2/
//
// Auth flow: OAuth2 Client Credentials
//   POST https://api.downdetector.com/auth/token
//   body: { client_id, client_secret, grant_type: "client_credentials" }
//   → { access_token, expires_in }
//
// Reports endpoint (reports per company per hour):
//   GET https://api.downdetector.com/api/v2/reports/reportcount/
//   ?company_slug=vodafone&since=<ISO>&until=<ISO>&country_iso=es
//   Authorization: Bearer <access_token>
//   → { data: [{ date, reports_count }] }
//
// Company slugs we use (same slug across all DD markets):
//   vodafone (ES, UK, DE, IT, PT, NL, IE, GR, TR)
//   vodafone-romania (RO)
//
// Country ISO codes:
//   es, gb, de, it, pt, nl, ie, gr, ro, tr

const BASE_URL = "https://api.downdetector.com";

// Map our market IDs to Downdetector country + slug params
const DD_MARKETS = {
  es: { country: "es", slug: "vodafone" },
  uk: { country: "gb", slug: "vodafone" },
  de: { country: "de", slug: "vodafone" },
  it: { country: "it", slug: "vodafone" },
  pt: { country: "pt", slug: "vodafone" },
  nl: { country: "nl", slug: "vodafone" },
  ie: { country: "ie", slug: "vodafone" },
  gr: { country: "gr", slug: "vodafone" },
  ro: { country: "ro", slug: "vodafone-romania" },
  tr: { country: "tr", slug: "vodafone" },
};

let _token     = null;
let _tokenExp  = 0;

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function getToken(clientId, clientSecret) {
  if (_token && Date.now() < _tokenExp - 60_000) return _token; // reuse if >1min left

  const r = await fetch(`${BASE_URL}/auth/token`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      grant_type:    "client_credentials",
    }),
  });

  if (!r.ok) throw new Error(`DD auth failed: ${r.status}`);
  const { access_token, expires_in } = await r.json();
  _token    = access_token;
  _tokenExp = Date.now() + expires_in * 1000;
  return _token;
}

// ─── Fetch complaint count for one market (last ~1 hour) ─────────────────────
async function fetchMarketReports(marketId, token) {
  const dd = DD_MARKETS[marketId];
  if (!dd) return { ok: false, error: `Unknown market: ${marketId}` };

  const until = new Date();
  const since = new Date(until.getTime() - 60 * 60 * 1000); // last 1h

  const params = new URLSearchParams({
    company_slug: dd.slug,
    since:        since.toISOString(),
    until:        until.toISOString(),
    country_iso:  dd.country,
  });

  const r = await fetch(`${BASE_URL}/api/v2/reports/reportcount/?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };

  const { data } = await r.json();
  if (!data || data.length === 0) return { ok: false, error: "no data" };

  // Sum reports across all buckets in the window → complaints/h
  const complaints = data.reduce((sum, b) => sum + (b.reports_count || 0), 0);

  // Build trend array from the time-series buckets
  const trend = data.map(b => b.reports_count || 0);

  return { ok: true, complaints, trend, baseline: null };
}

// ─── Public: fetch all markets ────────────────────────────────────────────────
/**
 * Fetch all 10 markets from the official Downdetector API.
 * Returns an array matching the shape expected by tickFromScraper:
 *   [{ market: { id }, ok, complaints, trend, baseline }]
 *
 * @param {string} clientId
 * @param {string} clientSecret
 * @param {Function} log
 */
export async function fetchAllOfficial(clientId, clientSecret, log) {
  let token;
  try {
    token = await getToken(clientId, clientSecret);
  } catch (e) {
    log?.(`[dd-official] auth error: ${e.message}`);
    return Object.keys(DD_MARKETS).map(id => ({ market: { id }, ok: false, error: "auth failed" }));
  }

  const results = await Promise.all(
    Object.keys(DD_MARKETS).map(async id => {
      try {
        const res = await fetchMarketReports(id, token);
        return { market: { id }, ...res };
      } catch (e) {
        log?.(`[dd-official] ${id} error: ${e.message}`);
        return { market: { id }, ok: false, error: e.message };
      }
    })
  );

  const ok    = results.filter(r => r.ok).length;
  const total = results.length;
  log?.(`[dd-official] ${ok}/${total} markets fetched successfully`);
  return results;
}

/** True if both required env vars are present */
export function isConfigured() {
  return !!(process.env.DOWNDETECTOR_CLIENT_ID && process.env.DOWNDETECTOR_CLIENT_SECRET);
}
