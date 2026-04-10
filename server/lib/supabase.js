// ─── Shared Supabase client ───────────────────────────────────────────────────
// Single instance reused across server modules (tickets, service-status, etc.)

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY    ||
  process.env.VITE_SUPABASE_ANON_KEY;

let _client = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  _client = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn("[supabase] WARNING: env vars not set — DB features disabled");
}

/** Returns the Supabase client or null if unconfigured. Never throws. */
export function getSupabase() { return _client; }
