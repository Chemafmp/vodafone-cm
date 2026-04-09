// ─── Tickets API client ───────────────────────────────────────────────────────
// All calls go to the backend API (not Supabase directly).
// Base URL derived from VITE_POLLER_WS, same pattern as ChaosControlPanel.

export const TICKET_COLORS = {
  incident: { bg: "#fef2f2", border: "#fca5a5", dot: "#ef4444", text: "#dc2626" },
  problem:  { bg: "#fffbeb", border: "#fcd34d", dot: "#f59e0b", text: "#b45309" },
  project:  { bg: "#eff6ff", border: "#93c5fd", dot: "#3b82f6", text: "#1d4ed8" },
};

export const SEV_META = {
  sev1: { label: "SEV1", color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  sev2: { label: "SEV2", color: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  sev3: { label: "SEV3", color: "#0891b2", bg: "#ecfeff", border: "#67e8f9" },
  sev4: { label: "SEV4", color: "#6b7280", bg: "#f9fafb", border: "#d1d5db" },
};

export const TICKET_STATUS_META = {
  new:         { label: "New",         color: "#6b7280" },
  assigned:    { label: "Assigned",    color: "#8b5cf6" },
  in_progress: { label: "In Progress", color: "#0891b2" },
  waiting:     { label: "Waiting",     color: "#d97706" },
  mitigated:   { label: "Mitigated",   color: "#f59e0b" },
  resolved:    { label: "Resolved",    color: "#15803d" },
  closed:      { label: "Closed",      color: "#374151" },
};

export const TICKET_TEAMS = [
  "Core Transport","Voice Core","Data Core","Access","RAN","Cloud",
  "OSS/BSS","Security Ops","Network Engineering","NOC","SAC","Platform Engineering"
];

// ─── SLA matrix (minutes) — per type + severity ───────────────────────────────
//
//  Incident  SEV1:  ACK 5m    / Resolve 4h (240m)
//            SEV2:  ACK 15m   / Resolve 8h (480m)
//            SEV3:  ACK 60m   / Resolve 72h (4320m)
//            SEV4:  ACK 4h    / Resolve 7d (10080m)
//
//  Problem   SEV1:  ACK 15m   / Resolve 24h (1440m)
//            SEV2:  ACK 60m   / Resolve 72h (4320m)
//            SEV3:  ACK 4h    / Resolve 14d (20160m)
//            SEV4:  ACK 24h   / Resolve 30d (43200m)
//
//  Request   (no severity)    ACK 4h / Resolve 5 business days (7200m)

const SLA_MATRIX = {
  incident: {
    ack:     { sev1: 5,    sev2: 15,   sev3: 60,    sev4: 240   },
    resolve: { sev1: 240,  sev2: 480,  sev3: 4320,  sev4: 10080 },
  },
  problem: {
    ack:     { sev1: 15,   sev2: 60,   sev3: 240,   sev4: 1440  },
    resolve: { sev1: 1440, sev2: 4320, sev3: 20160, sev4: 43200 },
  },
  project: {
    ack:     { sev1: 240,  sev2: 240,  sev3: 240,   sev4: 240   }, // 4h for all
    resolve: { sev1: 7200, sev2: 7200, sev3: 7200,  sev4: 7200  }, // 5 days for all
  },
};

/** Get ACK deadline (minutes) for a ticket, or null if unknown type/sev. */
export function getSlaAck(ticket) {
  const type = ticket.type === "project" ? "project" : (ticket.type || "incident");
  const sev  = ticket.severity || "sev4";
  return SLA_MATRIX[type]?.ack[sev] ?? SLA_MATRIX.incident.ack[sev] ?? null;
}

/** Get resolve deadline (minutes) for a ticket, or null if unknown type/sev. */
export function getSlaResolve(ticket) {
  const type = ticket.type === "project" ? "project" : (ticket.type || "incident");
  const sev  = ticket.severity || "sev4";
  return SLA_MATRIX[type]?.resolve[sev] ?? SLA_MATRIX.incident.resolve[sev] ?? null;
}

// Legacy flat exports kept for any remaining callers (map to incident SLAs)
export const SLA_ACK     = SLA_MATRIX.incident.ack;
export const SLA_RESOLVE = SLA_MATRIX.incident.resolve;

// ─── Base URL ────────────────────────────────────────────────────────────────
function apiBase() {
  const ws = import.meta.env.VITE_POLLER_WS || "ws://localhost:4000";
  if (ws.startsWith("wss://")) return ws.replace(/^wss:\/\//, "https://");
  return ws.replace(/^ws:\/\//, "http://");
}

async function apiFetch(path, options = {}) {
  const base = apiBase();
  const url = `${base}${path}`;
  const resp = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => ({ error: resp.statusText }));
    throw new Error(body.error || `HTTP ${resp.status}`);
  }
  return resp.json();
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function seedDemoTickets() {
  return apiFetch("/api/tickets/demo", { method: "POST" });
}

export async function fetchTickets(filters = {}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, v);
  }
  const qs = params.toString();
  return apiFetch(`/api/tickets${qs ? "?" + qs : ""}`);
}

export async function fetchTicket(id) {
  return apiFetch(`/api/tickets/${encodeURIComponent(id)}`);
}

export async function createTicket(data) {
  return apiFetch("/api/tickets", { method: "POST", body: JSON.stringify(data) });
}

export async function updateTicket(id, data) {
  return apiFetch(`/api/tickets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function addTicketEvent(id, event) {
  return apiFetch(`/api/tickets/${encodeURIComponent(id)}/events`, {
    method: "POST",
    body: JSON.stringify(event),
  });
}

export async function addTicketEvidence(id, evidence) {
  return apiFetch(`/api/tickets/${encodeURIComponent(id)}/evidence`, {
    method: "POST",
    body: JSON.stringify(evidence),
  });
}

export async function deleteTicketEvidence(ticketId, evidenceId) {
  return apiFetch(`/api/tickets/${encodeURIComponent(ticketId)}/evidence/${encodeURIComponent(evidenceId)}`, {
    method: "DELETE",
  });
}

export async function fetchSlaTickets() {
  return apiFetch("/api/tickets/sla");
}

// ─── Client-side sub-status computation (mirrors server) ─────────────────────
export function computeSubStatus(ticket) {
  const ackDeadline     = getSlaAck(ticket);
  const resolveDeadline = getSlaResolve(ticket);
  if (!ackDeadline || !resolveDeadline) return null;

  const now = Date.now();
  const createdMs = new Date(ticket.created_at).getTime();
  const minutesSinceCreated = (now - createdMs) / 60000;

  if (ticket.status === "assigned" && !ticket.acknowledged_at && minutesSinceCreated > ackDeadline) {
    return "assigned_unacknowledged";
  }
  if (!["resolved","closed"].includes(ticket.status)) {
    if (minutesSinceCreated >= resolveDeadline) return "breached";
    if (minutesSinceCreated / resolveDeadline >= 0.75) return "sla_at_risk";
  }
  return null;
}

// ─── SLA countdown helper ────────────────────────────────────────────────────
export function slaCountdown(ticket, nowMs) {
  const resolveDeadline = getSlaResolve(ticket);
  if (!resolveDeadline) return null;
  const createdMs = new Date(ticket.created_at).getTime();
  const resolveMs = createdMs + resolveDeadline * 60000;
  const remainingMs = resolveMs - nowMs;
  const pct = Math.min(1, (nowMs - createdMs) / (resolveDeadline * 60000));

  const absMin = Math.abs(Math.floor(remainingMs / 60000));
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  const label = remainingMs < 0
    ? `BREACHED ${h > 0 ? h + "h " : ""}${m}m ago`
    : `${h > 0 ? h + "h " : ""}${m}m remaining`;
  const color = pct >= 1 ? "#dc2626" : pct >= 0.75 ? "#b45309" : "#15803d";

  return { label, pct, color, breached: remainingMs < 0 };
}
