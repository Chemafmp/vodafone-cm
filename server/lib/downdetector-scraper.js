// ─── Downdetector scraper ────────────────────────────────────────────────────
// Quick-and-dirty HTML scraper for Vodafone complaint data.
// WARNING: fragile — for testing only. Replace with official API in production.
//
// Downdetector embeds Highcharts data in a <script> tag like:
//   "data":[[1700000000000,12],[1700003600000,23],...]
// We extract the last 24h series, use the latest point as "current complaints"
// and the mean as the "baseline".

const MARKETS = [
  { id:"es", name:"Spain",       flag:"🇪🇸", url:"https://downdetector.es/estado/vodafone/" },
  { id:"uk", name:"UK",          flag:"🇬🇧", url:"https://downdetector.co.uk/status/vodafone/" },
  { id:"de", name:"Germany",     flag:"🇩🇪", url:"https://downdetector.de/status/vodafone/" },
  { id:"it", name:"Italy",       flag:"🇮🇹", url:"https://downdetector.it/status/vodafone/" },
  { id:"pt", name:"Portugal",    flag:"🇵🇹", url:"https://downdetector.pt/estado/vodafone/" },
  { id:"nl", name:"Netherlands", flag:"🇳🇱", url:"https://downdetector.nl/status/vodafone/" },
  { id:"ie", name:"Ireland",     flag:"🇮🇪", url:"https://downdetector.ie/status/vodafone/" },
  { id:"gr", name:"Greece",      flag:"🇬🇷", url:"https://downdetector.gr/status/vodafone/" },
  { id:"ro", name:"Romania",     flag:"🇷🇴", url:"https://downdetector.ro/status/vodafone-romania/" },
  { id:"tr", name:"Turkey",      flag:"🇹🇷", url:"https://downdetector.com.tr/durum/vodafone/" },
];

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache",
};

const FETCH_TIMEOUT_MS = 12_000;

// ─── Parse Highcharts data from HTML ─────────────────────────────────────────
// Tries three progressively looser patterns to find the chart series.
function parseHighchartsData(html) {
  // Pattern 1: standard Highcharts series data embedded as JSON
  // matches: "data":[[1700000000,23],[1700003600,45],...]
  const patterns = [
    /"data"\s*:\s*(\[\s*\[\d{10,13},\s*\d+\][\s\S]*?\])\s*[,}]/,
    /data\s*:\s*(\[\s*\[\d{10,13},\s*\d+\][\s\S]*?\])\s*[,}]/,
    /\[\s*(\[\d{10,13},\s*\d+\](?:\s*,\s*\[\d{10,13},\s*\d+\])+)\s*\]/,
  ];

  for (const pat of patterns) {
    const m = html.match(pat);
    if (!m) continue;
    try {
      // Normalise: wrap in outer [] if pattern 3 (no outer brackets)
      const raw = pat === patterns[2] ? `[${m[1]}]` : m[1];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch { /* try next */ }
  }
  return null;
}

// ─── Parse plain "N reports" badge ───────────────────────────────────────────
// Downdetector sometimes renders <p class="num reports-num">123</p>
function parseReportsBadge(html) {
  const m = html.match(/class="[^"]*reports-num[^"]*"[^>]*>\s*(\d+)/);
  if (m) return parseInt(m[1], 10);

  // Alternative: data-count attribute
  const m2 = html.match(/data-count="(\d+)"/);
  if (m2) return parseInt(m2[1], 10);

  return null;
}

// ─── Scrape one market ────────────────────────────────────────────────────────
async function scrapeMarket(market) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html;
  try {
    const r = await fetch(market.url, { headers: FETCH_HEADERS, signal: controller.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    html = await r.text();
  } finally {
    clearTimeout(timer);
  }

  // Try chart data first (richer: gives trend)
  const series = parseHighchartsData(html);
  if (series && series.length >= 2) {
    const values = series.map(pt => (Array.isArray(pt) ? pt[1] : pt));
    const current = values[values.length - 1];
    const mean    = values.reduce((a, b) => a + b, 0) / values.length;
    const baseline = Math.max(1, Math.round(mean));
    // Last 20 readings for sparkline (trim to 20 points)
    const trend = values.length > 20 ? values.slice(-20) : values;
    return { complaints: current, baseline, trend, source: "highcharts" };
  }

  // Fallback: badge count only (no trend data)
  const badge = parseReportsBadge(html);
  if (badge !== null) {
    return { complaints: badge, baseline: null, trend: null, source: "badge" };
  }

  throw new Error("could not parse page — HTML structure may have changed");
}

// ─── Scrape all markets (staggered, 600ms apart to be polite) ─────────────────
export async function scrapeAll(log) {
  const results = [];
  for (const m of MARKETS) {
    await new Promise(r => setTimeout(r, 600)); // polite delay
    try {
      const data = await scrapeMarket(m);
      log?.(`[downdetector] ✓ ${m.id}: ${data.complaints} reports (src: ${data.source})`);
      results.push({ market: m, ...data, ok: true });
    } catch (e) {
      log?.(`[downdetector] ✗ ${m.id}: ${e.message}`);
      results.push({ market: m, ok: false, error: e.message });
    }
  }
  return results;
}

export { MARKETS };
