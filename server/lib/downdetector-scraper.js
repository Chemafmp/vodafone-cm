// ─── Downdetector scraper ────────────────────────────────────────────────────
// Fetches Downdetector status pages via ScraperAPI (render=true to bypass CF).
// Extracts complaint count + status from the rendered HTML.
//
// Set SCRAPER_API_KEY env var + USE_SCRAPER=1 to enable.
// WARNING: for testing only. Use official Downdetector Partner API in production.

const MARKETS = [
  { id:"es", name:"Spain",       flag:"🇪🇸", domain:"downdetector.es",     slug:"vodafone",         path:"problemas" },
  { id:"uk", name:"UK",          flag:"🇬🇧", domain:"downdetector.co.uk",  slug:"vodafone",         path:"status" },
  { id:"de", name:"Germany",     flag:"🇩🇪", domain:"downdetector.de",     slug:"vodafone",         path:"status" },
  { id:"it", name:"Italy",       flag:"🇮🇹", domain:"downdetector.it",     slug:"vodafone",         path:"status" },
  { id:"pt", name:"Portugal",    flag:"🇵🇹", domain:"downdetector.pt",     slug:"vodafone",         path:"problemas" },
  { id:"nl", name:"Netherlands", flag:"🇳🇱", domain:"downdetector.nl",     slug:"vodafone",         path:"status" },
  { id:"ie", name:"Ireland",     flag:"🇮🇪", domain:"downdetector.ie",     slug:"vodafone",         path:"status" },
  { id:"gr", name:"Greece",      flag:"🇬🇷", domain:"downdetector.gr",     slug:"vodafone",         path:"status" },
  { id:"ro", name:"Romania",     flag:"🇷🇴", domain:"downdetector.ro",     slug:"vodafone-romania", path:"status" },
  { id:"tr", name:"Turkey",      flag:"🇹🇷", domain:"downdetector.com.tr", slug:"vodafone",         path:"durum" },
];

const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || null;
const TIMEOUT_MS      = 55_000;

function proxied(url, render = false) {
  if (!SCRAPER_API_KEY) return url;
  const p = new URLSearchParams({ api_key: SCRAPER_API_KEY, url });
  if (render) p.set("render", "true");
  return `https://api.scraperapi.com?${p}`;
}

async function fetchPage(url, render = false) {
  const ctrl = new AbortController();
  const t    = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(proxied(url, render), {
      headers: SCRAPER_API_KEY ? {} : {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        "Accept":     "text/html",
      },
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  } finally {
    clearTimeout(t);
  }
}

// ─── Extract count + status from rendered HTML ───────────────────────────────
// Downdetector shows the 24h report count prominently on the page.
// Patterns to find (varies by locale/version):
function parseRenderedPage(html, m) {
  // Pattern 1: RSC serialised data contains the count near a known key
  // e.g. "reportsLast24h":42 or "count":42 near "status":"warning"
  const countPatterns = [
    /"reportsLast24h"\s*:\s*(\d+)/,
    /"reports_last_24h"\s*:\s*(\d+)/,
    /"totalReports"\s*:\s*(\d+)/,
    /"reportCount"\s*:\s*(\d+)/,
    // RSC escaped variants
    /\\"reportsLast24h\\"\s*:\s*(\d+)/,
    /\\"reports_last_24h\\"\s*:\s*(\d+)/,
    /\\"totalReports\\"\s*:\s*(\d+)/,
    /\\"reportCount\\"\s*:\s*(\d+)/,
  ];
  for (const pat of countPatterns) {
    const m2 = html.match(pat);
    if (m2) return { count: parseInt(m2[1], 10), source: "rsc-count" };
  }

  // Pattern 2: visible text in rendered page
  // e.g. "42 reports in the last 24 hours" or "42 Meldungen in den letzten 24 Stunden"
  const textPatterns = [
    /(\d+)\s+reports?\s+in\s+the\s+last\s+24/i,
    /(\d+)\s+Meldungen\s+in\s+den\s+letzten/i,
    /(\d+)\s+segnalazioni\s+nelle\s+ultime/i,
    /(\d+)\s+meldingen\s+in\s+de\s+afgelopen/i,
    /(\d+)\s+denuncias?\s+en\s+las\s+[uú]ltimas/i,
    /(\d+)\s+queixas?\s+nas\s+[uú]ltimas/i,
    /(\d+)\s+(?:problem|report|sorun|şikâyet)/i,
    // Generic: a standalone number followed by common report-text indicators in any lang
    /"count"\s*:\s*(\d{1,5})(?!\d)/,
  ];
  for (const pat of textPatterns) {
    const m2 = html.match(pat);
    if (m2) return { count: parseInt(m2[1], 10), source: "text-pattern" };
  }

  // Pattern 3: status string (ok / warning / outage) — at least lets us confirm status
  const statusMatch = html.match(/"status"\s*:\s*"(ok|warning|outage|danger)"/i) ||
                      html.match(/\\"status\\"\s*:\s*\\"(ok|warning|outage|danger)\\"/i);
  if (statusMatch) {
    // We know the status but not the count — return a synthetic count based on status
    const synth = { ok: 1, warning: 2.5, outage: 5, danger: 5 }[statusMatch[1].toLowerCase()] ?? 1;
    return { count: null, statusHint: statusMatch[1], source: "status-only", synth };
  }

  // Log a debug snippet so we can improve patterns
  const snippet = html.replace(/\s+/g, " ").slice(50_000, 53_000);
  throw new Error(`could not parse rendered page (${html.length} bytes)\nDEBUG[50k]: ${snippet}`);
}

// ─── Scrape one market ────────────────────────────────────────────────────────
async function scrapeMarket(m, log) {
  const url = `https://${m.domain}/${m.path}/${m.slug}/`;

  // First try without render (faster, lower ScraperAPI credit cost)
  log?.(`[downdetector]   ${m.id}: fetching (no-render)...`);
  let html;
  try {
    html = await fetchPage(url, false);
  } catch (e) {
    log?.(`[downdetector]   ${m.id}: no-render failed (${e.message}), trying render=true...`);
    html = await fetchPage(url, true);
  }

  const result = parseRenderedPage(html, m);
  return result;
}

function buildResult(parsed, m) {
  // If we only got a status hint (no count), use baseline × synth multiplier
  if (parsed.count === null && parsed.synth) {
    const baseline = 30; // safe default
    return {
      complaints: Math.round(baseline * parsed.synth),
      baseline,
      trend:  [],
      source: parsed.source,
    };
  }
  const count = parsed.count ?? 0;
  return {
    complaints: count,
    baseline:   null, // unknown without history — service-status.js keeps its own baseline
    trend:      null, // null → service-status.js appends to rolling history ring buffer
    source:     parsed.source,
  };
}

// ─── Scrape all markets ───────────────────────────────────────────────────────
export async function scrapeAll(log) {
  if (SCRAPER_API_KEY) {
    log?.(`[downdetector] using ScraperAPI (key: ...${SCRAPER_API_KEY.slice(-6)})`);
  } else {
    log?.(`[downdetector] WARNING: no SCRAPER_API_KEY — direct fetch (may hit CF 403)`);
  }

  const results = [];
  for (const m of MARKETS) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const parsed = await scrapeMarket(m, log);
      const result = buildResult(parsed, m);
      log?.(`[downdetector] ✓ ${m.id}: ${result.complaints} reports (src: ${result.source})`);
      results.push({ market: m, ...result, ok: true });
    } catch (e) {
      const msg = e.message.split("\n")[0]; // don't spam logs with full debug
      log?.(`[downdetector] ✗ ${m.id}: ${msg}`);
      if (e.message.includes("DEBUG[")) log?.(e.message.split("\n").slice(1).join("\n"));
      results.push({ market: m, ok: false, error: msg });
    }
  }
  return results;
}

export { MARKETS };
