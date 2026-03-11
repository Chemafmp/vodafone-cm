import { useState, useEffect } from "react";

// ─── SCHEMA VERSION ────────────────────────────────────────────────────────────
// Bump this when the data shape changes to trigger future migrations.
export const STORAGE_VERSION = "1";

// ─── KEYS ──────────────────────────────────────────────────────────────────────
export const KEYS = {
  VERSION: "bnoc_version",
  CHANGES: "bnoc_changes",
  PEAKS:   "bnoc_peaks",
};

// ─── HOOK ──────────────────────────────────────────────────────────────────────
// Drop-in replacement for useState that persists to localStorage.
// State initialises directly from storage (no flash), and syncs on every update.
export function useLocalStorage(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("[bnoc] localStorage write failed:", e);
    }
  }, [key, value]);

  return [value, setValue];
}

// ─── VERSION GUARD ─────────────────────────────────────────────────────────────
// Call once on startup. Records the current schema version.
// In future phases: check stored version and run migrations before returning.
export function initStorageVersion() {
  const stored = localStorage.getItem(KEYS.VERSION);
  if (stored !== STORAGE_VERSION) {
    // Placeholder for future migrations:
    // if (stored === "1") migrate_1_to_2()
    localStorage.setItem(KEYS.VERSION, STORAGE_VERSION);
  }
}

// ─── RESET ─────────────────────────────────────────────────────────────────────
// Restores app data to seed-only state and reloads.
// Pass SEED_CHANGES and PEAK_PERIODS to write them directly — this ensures
// demo changes are dropped while seeds are preserved immediately on next load.
// Triggered by Shift+click on the logo (dev/demo helper).
export function resetToSeed(seedChanges, seedPeaks) {
  localStorage.setItem(KEYS.CHANGES, JSON.stringify(seedChanges));
  localStorage.setItem(KEYS.PEAKS,   JSON.stringify(seedPeaks));
  localStorage.setItem(KEYS.VERSION, STORAGE_VERSION);
  window.location.reload();
}
