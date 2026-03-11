import { createClient } from "@supabase/supabase-js";

// ─── CLIENT ────────────────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── LOCAL CACHE (offline fallback) ────────────────────────────────────────────
const CACHE_CHANGES = "bnoc_cache_changes";
const CACHE_PEAKS   = "bnoc_cache_peaks";

function saveCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
}
function loadCache(key) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch (_) { return null; }
}

export function getCachedChanges() { return loadCache(CACHE_CHANGES) ?? []; }
export function getCachedPeaks()   { return loadCache(CACHE_PEAKS)   ?? []; }

// ─── CHANGES ───────────────────────────────────────────────────────────────────

/** Fetch all changes from Supabase and update local cache. */
export async function fetchChanges() {
  const { data, error } = await supabase
    .from("changes")
    .select("data")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const result = data.map(row => row.data);
  saveCache(CACHE_CHANGES, result);
  return result;
}

/** Insert or update a single change. Updates local cache too. */
export async function upsertChange(change) {
  const { error } = await supabase
    .from("changes")
    .upsert({ id: change.id, data: change }, { onConflict: "id" });
  if (error) throw error;
  // Keep cache in sync
  const cached = loadCache(CACHE_CHANGES) ?? [];
  const idx = cached.findIndex(c => c.id === change.id);
  if (idx >= 0) cached[idx] = change; else cached.push(change);
  saveCache(CACHE_CHANGES, cached);
}

/** Upsert multiple changes in one request (used for seeding). */
export async function upsertChanges(changes) {
  const rows = changes.map(c => ({ id: c.id, data: c }));
  const { error } = await supabase
    .from("changes")
    .upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

/** Delete a single change by ID. */
export async function deleteChange(id) {
  const { error } = await supabase
    .from("changes")
    .delete()
    .eq("id", id);
  if (error) throw error;
  const cached = loadCache(CACHE_CHANGES) ?? [];
  saveCache(CACHE_CHANGES, cached.filter(c => c.id !== id));
}

// ─── FREEZE PERIODS ────────────────────────────────────────────────────────────

/** Fetch all freeze periods from Supabase and update local cache. */
export async function fetchPeaks() {
  const { data, error } = await supabase
    .from("freeze_periods")
    .select("data")
    .order("created_at", { ascending: true });
  if (error) throw error;
  const result = data.map(row => row.data);
  saveCache(CACHE_PEAKS, result);
  return result;
}

/** Insert or update a single freeze period. */
export async function upsertPeak(peak) {
  const { error } = await supabase
    .from("freeze_periods")
    .upsert({ id: peak.id, data: peak }, { onConflict: "id" });
  if (error) throw error;
}

/** Upsert multiple freeze periods in one request (used for seeding). */
export async function upsertPeaks(peaks) {
  const rows = peaks.map(p => ({ id: p.id, data: p }));
  const { error } = await supabase
    .from("freeze_periods")
    .upsert(rows, { onConflict: "id" });
  if (error) throw error;
}

/** Delete a single freeze period by ID. */
export async function deletePeak(id) {
  const { error } = await supabase
    .from("freeze_periods")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/** Wipe all freeze periods and re-insert the full array.
 *  Used to keep Supabase in sync when FreezeManager adds/edits/deletes. */
export async function syncPeaks(peaks) {
  await supabase.from("freeze_periods").delete().neq("id", "__none__");
  if (peaks.length > 0) await upsertPeaks(peaks);
  saveCache(CACHE_PEAKS, peaks);
}

// ─── SEED HELPERS ──────────────────────────────────────────────────────────────

/** Wipe all changes and freeze periods, then write seed data only. */
export async function resetToSeedDB(seedChanges, seedPeaks) {
  await supabase.from("changes").delete().neq("id", "__none__");
  await supabase.from("freeze_periods").delete().neq("id", "__none__");
  await upsertChanges(seedChanges);
  await upsertPeaks(seedPeaks);
  saveCache(CACHE_CHANGES, seedChanges);
  saveCache(CACHE_PEAKS, seedPeaks);
}

/** Load seed + demo data into the DB (wipes existing first). */
export async function loadDemoDB(seedChanges, demoChanges, seedPeaks) {
  await supabase.from("changes").delete().neq("id", "__none__");
  await supabase.from("freeze_periods").delete().neq("id", "__none__");
  await upsertChanges([...seedChanges, ...demoChanges]);
  await upsertPeaks(seedPeaks);
  saveCache(CACHE_CHANGES, [...seedChanges, ...demoChanges]);
  saveCache(CACHE_PEAKS, seedPeaks);
}
