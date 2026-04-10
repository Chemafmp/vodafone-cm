// ─── Downdetector scraper ────────────────────────────────────────────────────
// Uses the internal Downdetector/Ookla stats API found in their Next.js bundle.
//
// Flow:
//   1. GET auth token from consumer-downdetector-api.speedtest.net
//   2. GET company stats (stats_24, baseline) from st.downdetectorapi.com/v2
//
// serviceId (= companyId in Ookla API) is embedded in the RSC payload on each
// market's status page. Known IDs are hardcoded to avoid extra scrape requests.
// For unknown markets, we fetch the page via ScraperAPI to extract the serviceId.
//
// Set SCRAPER_API_KEY env var to route HTML page fetches through ScraperAPI
// (needed to extract serviceId from CF-protected pages for new markets).
// Already-known serviceIds need NO ScraperAPI requests at all.

const MARKETS = [
  { id:"es", name:"Spain",       flag:"🇪🇸", domain:"downdetector.es",     slug:"vodafone",         path:"problemas", serviceId:"33125" },
  { id:"uk", name:"UK",          flag:"🇬🇧", domain:"downdetector.co.uk",  slug:"vodafone",         path:"status",    serviceId:"32659" },
  { id:"de", name:"Germany",     flag:"🇩🇪", domain:"downdetector.de",     slug:"vodafone",         path:"status",    serviceId:"10120" },
  { id:"it", name:"Italy",       flag:"🇮🇹", domain:"downdetector.it",     slug:"vodafone",         path:"status" },
  { id:"pt", name:"Portugal",    flag:"🇵🇹", domain:"downdetector.pt",     slug:"vodafone",         path:"estado" },
  { id:"nl", name:"Netherlands", flag:"🇳🇱", domain:"downdetector.nl",     slug:"vodafone",         path:"status" },
  { id:"ie", name:"Ireland",     flag:"🇮🇪", domain:"downdetector.ie",     slug:"vodafone",         path:"status" },
  { id:"gr", name:"Greece",      flag:"🇬🇷", domain:"downdetector.gr",     slug:"vodafone",         path:"status" },
  { id:"ro", name:"Romania",     flag:"🇷🇴", domain:"downdetector.ro",     slug:"vodafone-romania", path:"status" },
  { id:"tr", name:"Turkey",      flag:"🇹🇷", domain:"downdetector.com.tr", slug:"vodafone",         path:"durum" },
];

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || null;

// ─── Ookla / Downdetector API auth ────────────────────────────────────────────
// API key is public — embedded in Downdetector's own JS bundles.
const OOKLA_API_KEY   = "OadSrodvhVEPxvs8fhA3vlYQ6MVzoG";
const OOKLA_UA        = "Speedtest/6.6.3.251114 (Android 12; Google; Pixel 6; en)";
const STATS_BASE      = "https://st.downdetectorapi.com/v2";
const AUTH_URL        = "https://consumer-downdetector-api.speedtest.net/v1/dd/config?latitude=51.5&longitude=-0.1";

let _token     = null;
let _tokenExp  = 0;

async function getToken(log) {
  if (_token && Date.now() < _tokenExp) return _token;
  log?.("[downdetector] refreshing auth token...");
  const r = await fetch(AUTH_URL, {
    headers: { "X-Ookla-Api-Key": OOKLA_API_KEY, "User-Agent": OOKLA_UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`auth HTTP ${r.status}`);
  const data = await r.json();
  _token    = data.accessToken;
  _tokenExp = Date.now() + 50 * 60 * 1000; // 50-min cache (tokens expire in ~1h)
  if (!_token) throw new Error("auth response missing accessToken");
  log?.("[downdetector] auth token ok");
  return _token;
}

// ─── Fetch company stats from Ookla API ───────────────────────────────────────
async function fetchCompanyStats(companyId, log) {
  const token = await getToken(log);
  // Try individual company endpoint first
  const url = `${STATS_BASE}/companies/${companyId}?fields=stats_24,baseline,status,name`;
  const r = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}`, "User-Agent": OOKLA_UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`company API HTTP ${r.status} for id=${companyId}`);
  return r.json();
}

// ─── Extract serviceId from Downdetector RSC payload (via ScraperAPI) ────────
function proxied(url) {
  if (!SCRAPER_API_KEY) return url;
  return `https://api.scraperapi.com?${new URLSearchParams({ api_key: SCRAPER_API_KEY, url })}`;
}

async function extractServiceId(m, log) {
  const pageUrl = `https://${m.domain}/${m.path}/${m.slug}/`;
  log?.(`[downdetector]   ${m.id}: fetching page to extract serviceId...`);
  const r = await fetch(proxied(pageUrl), {
    headers: SCRAPER_API_KEY ? {} : {
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`page HTTP ${r.status}`);
  const html = await r.text();
  // RSC wire format escapes quotes: \"serviceId\":\"12345\"
  const m1 = html.match(/"serviceId"\s*:\s*"(\d+)"/) ||
              html.match(/\\"serviceId\\"\s*:\s*\\"(\d+)\\"/);
  if (!m1) throw new Error(`serviceId not found in ${html.length}-byte page`);
  return m1[1];
}

// ─── Scrape one market ────────────────────────────────────────────────────────
async function scrapeMarket(m, log) {
  // Ensure we have a serviceId
  let serviceId = m.serviceId ?? null;
  if (!serviceId) {
    serviceId = await extractServiceId(m, log);
    log?.(`[downdetector]   ${m.id}: serviceId=${serviceId}`);
  }

  // Fetch stats from Ookla API
  const data = await fetchCompanyStats(serviceId, log);

  // stats_24 is an array of 24 hourly report counts
  const stats24 = data.stats_24 ?? data.stats24 ?? data.reports;
  if (Array.isArray(stats24) && stats24.length > 0) {
    const values = stats24.map(v => Math.round(typeof v === "number" ? v : v?.count ?? 0));
    const baselineRaw = data.baseline;
    const baseline = Array.isArray(baselineRaw)
      ? Math.round(baselineRaw.reduce((a, b) => a + b, 0) / baselineRaw.length)
      : (typeof baselineRaw === "number" ? baselineRaw : null);
    return { values, baseline, source: "ookla-api" };
  }

  throw new Error(`unexpected API shape: ${JSON.stringify(data).slice(0, 200)}`);
}

function buildResult(values, baseline, source) {
  if (!values || values.length === 0) throw new Error("empty values");
  const current = values[values.length - 1];
  const mean    = baseline ?? Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return {
    complaints: current,
    baseline:   Math.max(1, mean),
    trend:      values.length > 20 ? values.slice(-20) : values,
    source,
  };
}

// ─── Scrape all markets ───────────────────────────────────────────────────────
export async function scrapeAll(log) {
  log?.(`[downdetector] using Ookla stats API${SCRAPER_API_KEY ? " (ScraperAPI for unknown serviceIds)" : ""}`);
  const results = [];
  for (const m of MARKETS) {
    await new Promise(r => setTimeout(r, 300)); // polite delay
    try {
      const { values, baseline, source } = await scrapeMarket(m, log);
      const result = buildResult(values, baseline, source);
      log?.(`[downdetector] ✓ ${m.id}: ${result.complaints} reports (baseline ~${result.baseline}, src: ${source})`);
      results.push({ market: m, ...result, ok: true });
    } catch (e) {
      log?.(`[downdetector] ✗ ${m.id}: ${e.message}`);
      results.push({ market: m, ok: false, error: e.message });
    }
  }
  return results;
}

export { MARKETS };
