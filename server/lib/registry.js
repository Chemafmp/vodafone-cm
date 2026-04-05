// ─── Node Registry ────────────────────────────────────────────────────────────
// Keeps track of which simulated nodes are currently alive and where to reach them.
// Nodes register themselves via POST /register when they start up.
// The poller iterates this registry every polling cycle.

const nodes = new Map(); // id → { id, hostname, port, vendor, hwModel, layer, country, interfaces, bgpPeers, registeredAt }

export function registerNode(info) {
  nodes.set(info.id, {
    ...info,
    registeredAt: Date.now(),
    lastSeen: Date.now(),
  });
}

export function unregisterNode(id) {
  nodes.delete(id);
}

export function markSeen(id) {
  const n = nodes.get(id);
  if (n) n.lastSeen = Date.now();
}

export function getNode(id) {
  return nodes.get(id);
}

export function getAllNodes() {
  return [...nodes.values()];
}

export function getNodeCount() {
  return nodes.size;
}
