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
  { id:"es", name:"Spain",       flag:"🇪🇸", domain:"downdetector.es",     slug:"vodafone",         path:"problemas" },
  { id:"uk", name:"UK",          flag:"🇬🇧", domain:"downdetector.co.uk",  slug:"vodafone",         path:"status" },
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

// ─── Approach 1: JSON chart-data endpoint ────────────────────────────────────
// Downdetector loads chart data from a lightweight JSON endpoint.
// Known patterns (varies by market/version):
//   /status/vodafone/chart-data/          → [{x, y}, ...]
//   /estado/vodafone/chart-data/          → same
//   /status/vodafone/chart.json           → same
async function tryJsonEndpoint(m) {
  const base = `https://${m.domain}`;
  const endpoints = [
    `${base}/${m.path}/${m.slug}/chart-data/`,
    `${base}/${m.path}/${m.slug}/chart.json`,
    `${base}/api/v1/stats/${m.slug}/`,
  ];

  for (const url of endpoints) {
    try {
      const r = await timedFetch(url, { ...JSON_HEADERS, Referer: `${base}/${m.path}/${m.slug}/` }, {});
      if (!r.ok) continue;

      const ct = r.headers.get("content-type") || "";
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
    } catch { /* try next */ }
  }
  return null;
}

// ─── Approach 2 & 3: HTML scraping ───────────────────────────────────────────
async function tryHtmlScrape(m) {
  const url = `https://${m.domain}/${m.path}/${m.slug}/`;
  // Do NOT use render=true — Highcharts data lives in <script> tags in raw HTML.
  // render=true produces a fully-executed SPA with no inline script data.
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

  // Pattern 2: Next.js __NEXT_DATA__ (Downdetector uses Next.js)
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const obj = JSON.parse(nextDataMatch[1]);
      // DEBUG: log top-level keys of pageProps so we can find where chart data lives
      const pp = obj?.props?.pageProps;
      if (pp) log?.(`[downdetector] __NEXT_DATA__ pageProps keys: ${Object.keys(pp).join(", ")}`);

      // Look for an array of {x,y} or [[epoch,count]] anywhere in the object (depth-first)
      const findSeries = (o, depth = 0) => {
        if (depth > 8 || !o || typeof o !== "object") return null;
        if (Array.isArray(o) && o.length >= 4) {
          if (typeof o[0]?.y === "number") return o.map(p => Math.round(p.y));
          if (Array.isArray(o[0]) && o[0].length === 2 && typeof o[0][1] === "number") return o.map(p => Math.round(p[1]));
        }
        for (const v of Object.values(o)) {
          const r = findSeries(v, depth + 1);
          if (r) return r;
        }
        return null;
      };
      const values = findSeries(obj);
      if (values) return { values, url, shape: "next-data" };
    } catch (e) {
      log?.(`[downdetector]   __NEXT_DATA__ parse error: ${e.message}`);
    }
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

  // DEBUG: log end of HTML (where __NEXT_DATA__ / RSC payloads typically live)
  const tail = html.replace(/\s+/g, " ").slice(-3000);
  const hasNextData = html.includes("__NEXT_DATA__");
  const scriptTypes = [...html.matchAll(/<script([^>]*)>/g)].map(m => m[1].trim()).filter(Boolean).slice(0, 15).join(" | ");
  throw new Error(`could not parse HTML from ${url} (${html.length} bytes, hasNextData=${hasNextData})\nSCRIPTS: ${scriptTypes}\nTAIL: ${tail}`);
}

// ─── Scrape one market — tries all approaches ─────────────────────────────────
async function scrapeMarket(m, log) {
  // Try JSON endpoint first (faster, no render needed)
  log?.(`[downdetector]   ${m.id}: trying JSON endpoint...`);
  try {
    const j = await tryJsonEndpoint(m);
    if (j) {
      log?.(`[downdetector] ✓ ${m.id}: JSON ${j.shape} → ${j.values.length} points`);
      return buildResult(j.values, `json-${j.shape}`);
    }
  } catch (e) {
    log?.(`[downdetector]   ${m.id}: JSON failed (${e.message}), trying HTML...`);
  }

  // Fallback: rendered HTML scrape (slow — headless browser)
  log?.(`[downdetector]   ${m.id}: trying HTML (render=true)...`);
  const h = await tryHtmlScrape(m);
  log?.(`[downdetector] ✓ ${m.id}: HTML ${h.shape}`);
  return buildResult(h.values, h.shape);
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
