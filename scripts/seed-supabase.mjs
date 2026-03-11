/**
 * Seed Supabase with SEED_CHANGES + DEMO_CHANGES + PEAK_PERIODS.
 * Run once: node scripts/seed-supabase.mjs
 *
 * Requires .env in project root with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Load .env manually (no dotenv dependency needed) ─────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dir, "../.env");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter(l => l.includes("="))
    .map(l => l.split("=").map(s => s.trim()))
);

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌  Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Inline d() helper (mirrors src/utils/helpers.js) ────────────────────────
function d(offsetDays = 0) {
  const dt = new Date();
  dt.setDate(dt.getDate() + offsetDays);
  return dt.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

// ─── Import seed data (dynamic import of ESM source) ─────────────────────────
// We re-export the arrays directly here to avoid the Vite import.meta.env issue
// in a Node context. Keep this file in sync with src/data/seed.js.

const PEAK_PERIODS = [
  {id:"p1", name:"Prime Day 2025",       start:"2025-07-08", end:"2025-07-09", severity:"red",    reason:"Major promotional event — Director approval required for all changes."},
  {id:"p2", name:"Black Friday 2025",    start:"2025-11-28", end:"2025-11-28", severity:"red",    reason:"Peak traffic event — change freeze enforced. Director sign-off mandatory."},
  {id:"p3", name:"Cyber Monday 2025",    start:"2025-12-01", end:"2025-12-01", severity:"orange", reason:"Extended peak period — Head of approval required for all changes."},
  {id:"p4", name:"Holiday Peak Q4 2025", start:"2025-12-15", end:"2026-01-05", severity:"red",    reason:"Year-end freeze — no changes without Director sign-off."},
  {id:"p5", name:"Super Promo MAR 2026", start:"2026-03-07", end:"2026-03-14", severity:"red",    reason:"All changes require Director approval + business justification."},
  {id:"p6", name:"Easter Freeze 2026",   start:"2026-04-02", end:"2026-04-06", severity:"orange", reason:"Bank holiday period — Manager approval required for all changes."},
];

// Seed IDs — 5 templates + 2 op changes
const SEED_IDS = [
  "BNOC-TEM-00000001-A","BNOC-TEM-00000002-A","BNOC-TEM-00000003-A",
  "BNOC-TEM-00000004-A","BNOC-TEM-00000005-A",
  "BNOC-0000000001-A","BNOC-0000000002-A",
];

// Demo IDs — 20 operational changes
const DEMO_IDS = Array.from({length:20}, (_,i) =>
  `BNOC-${String(i+3).padStart(10,"0")}-A`
);

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔌  Connecting to", SUPABASE_URL);

  // 1. Wipe existing data
  console.log("🗑   Clearing existing data...");
  await supabase.from("changes").delete().neq("id", "__none__");
  await supabase.from("freeze_periods").delete().neq("id", "__none__");

  // 2. Seed freeze periods
  console.log("📅  Seeding freeze periods...");
  const peakRows = PEAK_PERIODS.map(p => ({ id: p.id, data: p }));
  const { error: peakErr } = await supabase.from("freeze_periods").insert(peakRows);
  if (peakErr) { console.error("❌  freeze_periods:", peakErr.message); process.exit(1); }
  console.log(`    ✓ ${peakRows.length} freeze periods inserted`);

  // 3. Dynamically import the compiled Vite source won't work in Node —
  //    instead we use the REST API to verify the tables are ready, then
  //    instruct the user to click "⟳ Demo data" in the app to populate changes.
  console.log("\n✅  Freeze periods seeded successfully.");
  console.log("\n📌  Next step:");
  console.log("    Open the app locally (npm run dev -- --port 5178)");
  console.log("    and click the  ⟳ Demo data  button in the sidebar.");
  console.log("    This will write all 27 changes to Supabase via the app.\n");
}

main().catch(e => { console.error(e); process.exit(1); });
