// ─── INVENTORY AGGREGATOR ────────────────────────────────────────────────────
// Re-exports everything from split files + aggregates NODES from all countries

export { SITES, COUNTRY_META, LAYERS, LAYER_COLORS } from "./sites.js";
export { SERVICES } from "./services.js";
export { ALARMS } from "./alarms.js";
export { VLANS } from "./vlans.js";
export { IPAM } from "./ipam.js";

import { NODES_FJ } from "./nodes-fiji.js";
import { NODES_HW } from "./nodes-hawaii.js";
import { NODES_IB } from "./nodes-ibiza.js";

export const NODES = [...NODES_FJ, ...NODES_HW, ...NODES_IB];
