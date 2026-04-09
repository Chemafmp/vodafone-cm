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
  mitigated:   { label: "Mitigated",   color: "#f59e0b" },
  resolved:    { label: "Resolved",    color: "#15803d" },
  closed:      { label: "Closed",      color: "#374151" },
};

export const TICKET_TEAMS = [
  "Core Transport","Voice Core","Data Core","Access","RAN","Cloud",
  "OSS/BSS","Security Ops","Network Engineering","NOC","SAC","Platform Engineering"
];

// SLA ack deadlines (minutes) — used client-side for sub-status
export const SLA_ACK = { sev1: 5, sev2: 15, sev3: 60, sev4: 240 };
export const SLA_RESOLVE = { sev1: 240, sev2: 480, sev3: 4320, sev4: 10080 };

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

export async function fetchSlaTickets() {
  return apiFetch("/api/tickets/sla");
}

// ─── Client-side sub-status computation (mirrors server) ─────────────────────
export function computeSubStatus(ticket) {
  if (!ticket.severity || !SLA_ACK[ticket.severity]) return null;
  const now = Date.now();
  const createdMs = new Date(ticket.created_at).getTime();
  const minutesSinceCreated = (now - createdMs) / 60000;
  const ackDeadline = SLA_ACK[ticket.severity];
  const resolveDeadline = SLA_RESOLVE[ticket.severity];

  if (ticket.status === "assigned" && !ticket.acknowledged_at && minutesSinceCreated > ackDeadline) {
    return "assigned_unacknowledged";
  }
  if (!["resolved","closed"].includes(ticket.status)) {
    if (minutesSinceCreated >= resolveDeadline) return "breached";
    if (minutesSinceCreated / resolveDeadline >= 0.75) return "sla_at_risk";
  }
  if (ticket.status === "in_progress" && !ticket.work_started_at) return "no_active_work";
  return null;
}

// ─── SLA countdown helper ────────────────────────────────────────────────────
export function slaCountdown(ticket, nowMs) {
  if (!ticket.severity || !SLA_RESOLVE[ticket.severity]) return null;
  const createdMs = new Date(ticket.created_at).getTime();
  const resolveMs = createdMs + SLA_RESOLVE[ticket.severity] * 60000;
  const remainingMs = resolveMs - nowMs;
  const pct = Math.min(1, (nowMs - createdMs) / (SLA_RESOLVE[ticket.severity] * 60000));

  const absMin = Math.abs(Math.floor(remainingMs / 60000));
  const h = Math.floor(absMin / 60);
  const m = absMin % 60;
  const label = remainingMs < 0
    ? `BREACHED ${h > 0 ? h + "h " : ""}${m}m ago`
    : `${h > 0 ? h + "h " : ""}${m}m remaining`;
  const color = pct >= 1 ? "#dc2626" : pct >= 0.75 ? "#b45309" : "#15803d";

  return { label, pct, color, breached: remainingMs < 0 };
}
