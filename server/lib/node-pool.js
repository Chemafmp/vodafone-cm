// ─── Node Pool ──────────────────────────────────────────────────────────────
//
// Shared list of real seed node IDs that can be spun up as SNMP simulators.
// Used by both the interactive launcher (launch-demo.js) and the poller's
// auto-fleet mode (auto-start of simulators on boot).
//
// IDs here MUST exist in src/data/inventory/nodes-{fiji,hawaii,ibiza}.js
// so the simulator can pick up realistic vendor/hwModel/interfaces/BGP data.

export const NODE_POOL = [
  // ── Fiji ──
  { id: "fj-suva-cr-01",       country: "FJ", label: "Suva Core Router 1" },
  { id: "fj-suva-pe-01",       country: "FJ", label: "Suva PE Router 1" },
  { id: "fj-suva-cr-02",       country: "FJ", label: "Suva Core Router 2" },
  { id: "fj-lautoka-pe-01",    country: "FJ", label: "Lautoka PE Router" },
  { id: "fj-suva-fw-01",       country: "FJ", label: "Suva Firewall" },
  { id: "fj-suva-igw-01",      country: "FJ", label: "Suva Internet Gateway" },

  // ── Hawaii ──
  { id: "hw-hnl1-cr-01",       country: "HW", label: "Honolulu Core Router 1" },
  { id: "hw-hnl1-pe-01",       country: "HW", label: "Honolulu PE Router 1" },
  { id: "hw-hnl1-cr-02",       country: "HW", label: "Honolulu Core Router 2" },
  { id: "hw-hnl1-fw-01",       country: "HW", label: "Honolulu Firewall" },
  { id: "hw-maui-pe-01",       country: "HW", label: "Maui PE Router" },
  { id: "hw-hnl1-igw-01",      country: "HW", label: "Honolulu Internet Gateway" },

  // ── Ibiza ──
  { id: "ib-town-cr-01",       country: "IB", label: "Ibiza Town Core Router 1" },
  { id: "ib-town-pe-01",       country: "IB", label: "Ibiza Town PE Router 1" },
  { id: "ib-santantoni-cr-01", country: "IB", label: "San Antonio Core Router" },
  { id: "ib-town-fw-01",       country: "IB", label: "Ibiza Town Firewall" },
  { id: "ib-town-cr-02",       country: "IB", label: "Ibiza Town Core Router 2" },
  { id: "ib-town-pe-02",       country: "IB", label: "Ibiza Town PE Router 2" },
];

/**
 * Select N nodes from the pool, distributed round-robin across countries
 * so each country gets fair representation.
 */
export function selectNodes(count) {
  const countries = ["FJ", "HW", "IB"];
  const pools = {};
  for (const c of countries) pools[c] = NODE_POOL.filter(n => n.country === c);

  const selected = [];
  const idx = { FJ: 0, HW: 0, IB: 0 };
  let ci = 0;

  while (selected.length < count) {
    const c = countries[ci % countries.length];
    if (idx[c] < pools[c].length) {
      selected.push(pools[c][idx[c]]);
      idx[c]++;
    }
    ci++;
    // Safety: if all pools exhausted
    if (Object.values(idx).every((v, i) => v >= pools[countries[i]].length)) break;
  }
  return selected;
}
