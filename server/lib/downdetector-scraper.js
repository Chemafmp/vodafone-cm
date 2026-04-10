// ─── Downdetector scraper ────────────────────────────────────────────────────
// Tries three approaches in order, from lightest to heaviest:
//   1. JSON chart-data endpoint  (/status/slug/chart-data/ or /estado/slug/chart-data/)
//      → returns [{x: epoch_ms, y: count}, ...] or [[epoch, count], ...]
//   2. HTML + Highcharts regex   (the full page)
//   3. HTML + reports-badge      (simple number embedded in page)
//
// Set SCRAPER_API_KEY env var to route requests through ScraperAPI
// (bypasses Cloudflare — required when running on datacenter IPs).
// Also set USE_SCRAPER=1 to enable this module.
//
// WARNING: fragile — for testing only. Replace with official Downdetector API.

const MARKETS = [
  { id:"es", name:"Spain",       flag:"🇪🇸", domain:"downdetector.es",     slug:"vodafone",         path:"problemas", serviceId:"33125" },
  { id:"uk", name:"UK",          flag:"🇬🇧", domain:"downdetector.co.uk",  slug:"vodafone",         path:"status",    serviceId:"32659" },
  { id:"de", name:"Germany",     flag:"🇩🇪", domain:"downdetector.de",     slug:"vodafone",         path:"status" },
  { id:"it", name:"Italy",       flag:"🇮🇹", domain:"downdetector.it",     slug:"vodafone",         path:"status" },
  { id:"pt", name:"Portugal",    flag:"🇵🇹", domain:"downdetector.pt",     slug:"vodafone",         path:"estado" },
  { id:"nl", name:"Netherlands", flag:"🇳🇱", domain:"downdetector.nl",     slug:"vodafone",         path:"status" },
  { id:"ie", name:"Ireland",     flag:"🇮🇪", domain:"downdetector.ie",     slug:"vodafone",         path:"status" },
  { id:"gr", name:"Greece",      flag:"🇬🇷", domain:"downdetector.gr",     slug:"vodafone",         path:"status" },
  { id:"ro", name:"Romania",     flag:"🇷🇴", domain:"downdetector.ro",     slug:"vodafone-romania", path:"status" },
  { id:"tr", name:"Turkey",      flag:"🇹🇷", domain:"downdetector.com.tr", slug:"vodafone",         path:"durum"  },
];

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || null;
// ScraperAPI with render=true spins up a headless browser — needs extra time
const TIMEOUT_MS = SCRAPER_API_KEY ? 55_000 : 14_000;

/** Wrap a URL through ScraperAPI when a key is configured. */
function proxied(url, opts = {}) {
  if (!SCRAPER_API_KEY) return url;
  const params = new URLSearchParams({ api_key: SCRAPER_API_KEY, url });
  if (opts.render) params.set("render", "true");
  return `https://api.scraperapi.com?${params}`;
}

const HTML_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control":   "no-cache",
  "Pragma":          "no-cache",
  "Sec-Fetch-Dest":  "document",
  "Sec-Fetch-Mode":  "navigate",
  "Sec-Fetch-Site":  "none",
};

const JSON_HEADERS = {
  "User-Agent":  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":      "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "Referer":     "", // set per-request below
};

async function timedFetch(url, headers, proxyOpts = null) {
  const finalUrl = proxyOpts !== null ? proxied(url, proxyOpts) : url;
  // When routing through ScraperAPI, it handles headers internally — only pass ours for direct calls
  const finalHeaders = SCRAPER_API_KEY && proxyOpts !== null ? {} : headers;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(finalUrl, { headers: finalHeaders, signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}

// ─── Approach 1: Stats API via serviceId ─────────────────────────────────────
// Downdetector (new Next.js App Router version) exposes a stats API.
// The serviceId is embedded in the RSC payload on the status page.
// API endpoints to try (varies by deployment):
async function tryJsonEndpoint(m, serviceId = null) {
  const base = `https://${m.domain}`;
  const endpoints = [];

  // If we have a serviceId, try the v2 stats API first
  if (serviceId) {
    endpoints.push(
      `${base}/api/v2/stats/service/${serviceId}/`,
      `${base}/api/v2/stats/service/${serviceId}/history/`,
    );
  }

  // Legacy chart-data endpoints (older Downdetector versions)
  endpoints.push(
    `${base}/${m.path}/${m.slug}/chart-data/`,
    `${base}/${m.path}/${m.slug}/chart.json`,
    `${base}/api/v1/stats/${m.slug}/`,
  );

  for (const url of endpoints) {
    try {
      const r = await timedFetch(url, { ...JSON_HEADERS, Referer: `${base}/${m.path}/${m.slug}/` }, {});
      const ct = r.headers.get("content-type") || "";
      if (!r.ok) { log?.(`[downdetector]   ${m.id}: ${url.replace(base,"")} → HTTP ${r.status}`); continue; }
      if (!ct.includes("json") && !ct.includes("javascript")) { log?.(`[downdetector]   ${m.id}: ${url.replace(base,"")} → wrong ct: ${ct}`); continue; }
      if (!ct.includes("json") && !ct.includes("javascript")) continue;

      const json = await r.json();

      // Shape A: [{x: epochMs, y: count}, ...]
      if (Array.isArray(json) && json[0]?.y !== undefined) {
        const values = json.map(p => Math.round(p.y));
        return { values, url, shape: "A" };
      }
      // Shape B: [[epochMs, count], ...]
      if (Array.isArray(json) && Array.isArray(json[0])) {
        const values = json.map(p => Math.round(p[1]));
        return { values, url, shape: "B" };
      }
      // Shape C: { data: [...] }
      if (json.data && Array.isArray(json.data)) {
        const values = json.data.map(p => Array.isArray(p) ? Math.round(p[1]) : Math.round(p.y ?? p.value ?? 0));
        if (values.length > 0) return { values, url, shape: "C" };
      }
      // Shape D: { history: [...] } or { reports: [...] }
      const list = json.history ?? json.reports ?? json.series ?? json.stats;
      if (Array.isArray(list) && list.length > 0) {
        const values = list.map(p =>
          typeof p === "number" ? p :
          Math.round(p.y ?? p.count ?? p.value ?? p[1] ?? 0)
        );
        if (values.length > 0) return { values, url, shape: "D" };
      }
    } catch { /* try next */ }
  }
  return null;
}

// ─── Approach 2 & 3: HTML / RSC scraping ─────────────────────────────────────
async function tryHtmlScrape(m) {
  const url = `https://${m.domain}/${m.path}/${m.slug}/`;
  const r = await timedFetch(url, HTML_HEADERS, {});
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  const html = await r.text();

  // Pattern 1: Highcharts [[epoch, count], ...] arrays
  const hcPatterns = [
    /"data"\s*:\s*(\[\s*\[\d{10,13},\s*\d+\][\s\S]*?\])\s*[,}\]]/,
    /data\s*:\s*(\[\s*\[\d{10,13},\s*\d+\][\s\S]*?\])\s*[,}]/,
    /\[\s*(\[\d{10,13},\s*\d+\](?:\s*,\s*\[\d{10,13},\s*\d+\]){3,})\s*\]/,
  ];
  for (const pat of hcPatterns) {
    const mm = html.match(pat);
    if (!mm) continue;
    try {
      const raw = pat === hcPatterns[2] ? `[${mm[1]}]` : mm[1];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length >= 2) {
        const values = parsed.map(pt => Array.isArray(pt) ? pt[1] : pt);
        return { values, url, shape: "html-highcharts" };
      }
    } catch { /* try next */ }
  }

  // Pattern 2: Extract serviceId from RSC payload (Downdetector App Router)
  // In the RSC wire format quotes are escaped: \"serviceId\":\"12345\"
  const serviceIdMatch = html.match(/"serviceId"\s*:\s*"(\d+)"/) ||
                         html.match(/\\"serviceId\\"\s*:\s*\\"(\d+)\\"/);
  if (serviceIdMatch) {
    return { values: null, url, shape: "rsc", serviceId: serviceIdMatch[1] };
  }

  // Pattern 3: {x: epoch, y: count} pairs embedded in JS (React/Next hydration data)
  const xyMatch = html.match(/\{"x"\s*:\s*\d{10,13}\s*,\s*"y"\s*:\s*\d+\}/g);
  if (xyMatch && xyMatch.length >= 4) {
    try {
      const values = xyMatch.map(s => JSON.parse(s).y);
      return { values, url, shape: "html-xy-pairs" };
    } catch { /* fall through */ }
  }

  // Pattern 4: badge / counter text
  const badgeMatch = html.match(/class="[^"]*reports-num[^"]*"[^>]*>\s*(\d+)/) ||
                     html.match(/data-count="(\d+)"/) ||
                     html.match(/>(\d+)\s*(?:reports?|denuncias?|meldungen?|meldingen?|segnalazioni?)<\//) ;
  if (badgeMatch) {
    const count = parseInt(badgeMatch[1], 10);
    return { values: [count], url, shape: "html-badge" };
  }

  throw new Error(`could not parse HTML from ${url} (${html.length} bytes)`);
}

// ─── Scrape one market — tries all approaches ─────────────────────────────────
async function scrapeMarket(m, log) {
  // Step 1: get HTML to extract serviceId (RSC payload)
  log?.(`[downdetector]   ${m.id}: fetching page for serviceId...`);
  let serviceId = m.serviceId ?? null; // use hardcoded fallback if available
  try {
    const h = await tryHtmlScrape(m);
    if (h.shape === "rsc" && h.serviceId) {
      serviceId = h.serviceId;
      log?.(`[downdetector]   ${m.id}: serviceId=${serviceId}`);
    } else if (h.values) {
      // Got data directly from HTML parsing
      log?.(`[downdetector] ✓ ${m.id}: HTML ${h.shape}`);
      return buildResult(h.values, h.shape);
    }
  } catch (e) {
    log?.(`[downdetector]   ${m.id}: HTML fetch failed (${e.message})`);
  }

  // Step 2: call stats API with serviceId (or legacy chart-data endpoints)
  log?.(`[downdetector]   ${m.id}: trying stats API (serviceId=${serviceId})...`);
  try {
    const j = await tryJsonEndpoint(m, serviceId);
    if (j) {
      log?.(`[downdetector] ✓ ${m.id}: API ${j.shape} → ${j.values.length} points`);
      return buildResult(j.values, `api-${j.shape}`);
    }
  } catch (e) {
    log?.(`[downdetector]   ${m.id}: API failed (${e.message})`);
  }

  throw new Error(`all approaches failed for ${m.id}`);
}

function buildResult(values, source) {
  if (!values || values.length === 0) throw new Error("empty values");
  const current  = values[values.length - 1];
  const mean     = values.reduce((a, b) => a + b, 0) / values.length;
  const baseline = Math.max(1, Math.round(mean));
  const trend    = values.length > 20 ? values.slice(-20) : values;
  return { complaints: current, baseline, trend, source };
}

// ─── Scrape all markets ───────────────────────────────────────────────────────
export async function scrapeAll(log) {
  if (SCRAPER_API_KEY) {
    log?.(`[downdetector] using ScraperAPI proxy (key: ...${SCRAPER_API_KEY.slice(-6)})`);
  } else {
    log?.(`[downdetector] WARNING: no SCRAPER_API_KEY — direct fetch (may hit CF 403)`);
  }
  const results = [];
  for (const m of MARKETS) {
    await new Promise(r => setTimeout(r, 800));
    try {
      const data = await scrapeMarket(m, log);
      log?.(`[downdetector] ✓ ${m.id}: ${data.complaints} reports (baseline ~${data.baseline}, src: ${data.source})`);
      results.push({ market: m, ...data, ok: true });
    } catch (e) {
      log?.(`[downdetector] ✗ ${m.id}: ${e.message}`);
      results.push({ market: m, ok: false, error: e.message });
    }
  }
  return results;
}

export { MARKETS };
