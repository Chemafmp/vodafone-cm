// ─── Poller Control — runtime pause/resume per module ─────────────────────────
// Modules: ripe · bgp · dns · ioda · ris · radar · service-status · cloud-health
// Each tick function calls isPaused(name) at the top and returns early if true.

const paused = new Set();

export const POLLER_MODULES = ["ripe", "bgp", "dns", "ioda", "ris", "radar", "service-status", "cloud-health"];

export function isPaused(module) { return paused.has(module); }

export function pauseModule(module)  { paused.add(module); }
export function resumeModule(module) { paused.delete(module); }

export function pauseAll()  { POLLER_MODULES.forEach(m => paused.add(m)); }
export function resumeAll() { paused.clear(); }

export function getPollerStatus() {
  return Object.fromEntries(
    POLLER_MODULES.map(m => [m, paused.has(m) ? "paused" : "running"])
  );
}
