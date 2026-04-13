// ─── RPKI Daily Validation Job ───────────────────────────────────────────────
// Validates ALL announced prefixes (v4 + v6) for every market once per day.
// Markets are processed sequentially, spaced evenly across 60 minutes so the
// total job fits in 1 hour without bursting RIPE Stat.
//
// Schedule: 03:00 UTC daily (configurable via RPKI_JOB_HOUR env var).
// Storage:  Supabase rpki_snapshots table (8-day retention per market).
// Memory:   rpkiCache — { marketId → snapshot } — loaded on boot from Supabase.
//
// Integration:
//   poller.js imports getRpkiSnapshot(marketId) and injects it into the
//   /api/network-health response, overriding the 10-prefix sample from
//   bgp-visibility.js when full data is available.

import { RIPE_MARKETS } from "./ripe-atlas.js";

const RIPE_STAT_BASE = "https://stat.ripe.net/data";
const DELAY_MS       = 300;   // between rpki-validation calls (per prefix)
const SLOT_MS        = Math.floor((60 * 60 * 1000) / RIPE_MARKETS.length); // ~4m17s per market
const JOB_HOUR_UTC   = parseInt(process.env.RPKI_JOB_HOUR ?? "3", 10);     // 03:00 UTC default
const RETENTION_DAYS = 8;

let supabase    = null;

// marketId → full RPKI snapshot
// { valid, invalid, unknown, total, sampled, coverage_pct, details[], validatedAt, full }
const rpkiCache = {};

// ── Init ──────────────────────────────────────────────────────────────────────
export function initRpkiDaily(sb) {
  supabase = sb;
}

// ── Supabase: load latest snapshot per market on boot ─────────────────────────
export async function loadRpkiSnapshots(log) {
  if (!supabase) return;
  let loaded = 0;
  for (const m of RIPE_MARKETS) {
    try {
      // Get the most recent validated_at for this market
      const { data: latest } = await supabase
        .from("rpki_snapshots")
        .select("validated_at")
        .eq("market_id", m.id)
        .order("validated_at", { ascending: false })
        .limit(1);
      if (!latest?.length) continue;

      const validatedAt = latest[0].validated_at;

      // Load all rows from that same validation run (same minute)
      const cutoff = new Date(new Date(validatedAt).getTime() - 60_000).toISOString();
      const { data: rows } = await supabase
        .from("rpki_snapshots")
        .select("prefix, status, asn")
        .eq("market_id", m.id)
        .gte("validated_at", cutoff)
        .order("validated_at", { ascending: false })
        .limit(1000);

      if (!rows?.length) continue;
      buildCache(m.id, rows, validatedAt);
      loaded++;
    } catch (e) {
      log?.(`[rpki] load error ${m.id}: ${e.message}`);
    }
  }
  log?.(`[rpki] boot: loaded snapshots for ${loaded}/${RIPE_MARKETS.length} markets from Supabase`);
}

// ── Cache builder ─────────────────────────────────────────────────────────────
function buildCache(marketId, rows, validatedAt) {
  let valid = 0, invalid = 0, unknown = 0;
  const details = [];
  for (const r of rows) {
    if      (r.status === "valid")   valid++;
    else if (r.status === "invalid") invalid++;
    else                             unknown++;
    details.push({ prefix: r.prefix, status: r.status });
  }
  const total = valid + invalid + unknown;
  rpkiCache[marketId] = {
    valid, invalid, unknown,
    total,
    sampled:      total,
    coverage_pct: total > 0 ? Math.round((valid / total) * 1000) / 10 : null,
    details,
    validatedAt,
    full: true,  // signals frontend: this is full validation, not a 10-prefix sample
  };
}

// ── Public: get snapshot for one market ───────────────────────────────────────
export function getRpkiSnapshot(marketId) {
  return rpkiCache[marketId] ?? null;
}

// ── Validate all prefixes for one market ─────────────────────────────────────
async function validateMarket(m, log) {
  // Step 1: fetch all announced prefixes
  const url  = `${RIPE_STAT_BASE}/announced-prefixes/data.json?resource=AS${m.asn}`;
  const res  = await fetch(url, { headers: { "User-Agent": "BNOC-RPKI/1.0" }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`announced-prefixes HTTP ${res.status}`);
  const json = await res.json();

  const prefixes = json?.data?.prefixes || [];
  const v4 = prefixes.filter(p => !p.prefix.includes(":")).map(p => p.prefix);
  const v6 = prefixes.filter(p =>  p.prefix.includes(":")).map(p => p.prefix);
  const all = [...v4, ...v6];

  log?.(`[rpki-daily] ${m.flag} ${m.id} AS${m.asn}: validating ${all.length} prefixes (${v4.length} v4 · ${v6.length} v6)`);
  if (!all.length) {
    log?.(`[rpki-daily] ${m.id}: no prefixes announced — skipping`);
    return;
  }

  // Step 2: validate each prefix against RIPE Stat rpki-validation
  const now  = new Date().toISOString();
  const rows = [];
  for (const prefix of all) {
    try {
      const u = `${RIPE_STAT_BASE}/rpki-validation/data.json?resource=AS${m.asn}&prefix=${encodeURIComponent(prefix)}`;
      const r = await fetch(u, { headers: { "User-Agent": "BNOC-RPKI/1.0" }, signal: AbortSignal.timeout(15_000) });
      const j = await r.json();
      const status = j?.data?.status ?? "unknown";
      rows.push({ market_id: m.id, asn: m.asn, prefix, status, validated_at: now });
    } catch {
      rows.push({ market_id: m.id, asn: m.asn, prefix, status: "unknown", validated_at: now });
    }
    await new Promise(r => setTimeout(r, DELAY_MS));
  }

  // Step 3: save to Supabase in batches of 100
  if (supabase && rows.length) {
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("rpki_snapshots").insert(rows.slice(i, i + 100));
      if (error) log?.(`[rpki-daily] Supabase insert error ${m.id}: ${error.message}`);
    }
    // Cleanup: remove rows older than RETENTION_DAYS
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
    await supabase.from("rpki_snapshots").delete()
      .eq("market_id", m.id).lt("validated_at", cutoff);
  }

  // Step 4: update in-memory cache
  buildCache(m.id, rows, now);
  const snap = rpkiCache[m.id];
  log?.(`[rpki-daily] ✓ ${m.id}: ${snap.total} prefixes — ✓${snap.valid} valid · ✗${snap.invalid} invalid · ?${snap.unknown} unknown`);
}

// ── Run the full daily job ────────────────────────────────────────────────────
export async function runRpkiDailyJob(log) {
  log?.(`[rpki-daily] 🔐 Starting daily RPKI job — ${RIPE_MARKETS.length} markets · ~${Math.round(SLOT_MS / 60000)}min apart · est. 1h total`);
  for (let i = 0; i < RIPE_MARKETS.length; i++) {
    const m = RIPE_MARKETS[i];
    try {
      await validateMarket(m, log);
    } catch (e) {
      log?.(`[rpki-daily] ✗ ${m.id} failed: ${e.message}`);
    }
    // Wait for next slot (not after last market)
    if (i < RIPE_MARKETS.length - 1) {
      log?.(`[rpki-daily] waiting ${Math.round(SLOT_MS / 60000)}m before next market…`);
      await new Promise(r => setTimeout(r, SLOT_MS));
    }
  }
  log?.(`[rpki-daily] ✅ Daily RPKI job complete — all markets validated`);
}

// ── Schedule: run at JOB_HOUR_UTC daily ──────────────────────────────────────
export function scheduleRpkiDaily(log) {
  function msUntilNextRun() {
    const now  = new Date();
    const next = new Date(now);
    next.setUTCHours(JOB_HOUR_UTC, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    return next.getTime() - now.getTime();
  }

  function schedule() {
    const ms = msUntilNextRun();
    const h  = Math.floor(ms / 3_600_000);
    const m  = Math.floor((ms % 3_600_000) / 60_000);
    log?.(`[rpki-daily] next run in ${h}h ${m}m (${JOB_HOUR_UTC.toString().padStart(2,"0")}:00 UTC)`);
    setTimeout(async () => {
      await runRpkiDailyJob(log).catch(e => log?.(`[rpki-daily] job error: ${e.message}`));
      schedule(); // reschedule for next day
    }, ms);
  }

  schedule();
}
