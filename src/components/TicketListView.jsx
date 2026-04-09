import { useState, useEffect, useCallback, useMemo } from "react";
import { T } from "../data/constants.js";
import {
  TICKET_COLORS, SEV_META, TICKET_STATUS_META, TICKET_TEAMS,
  fetchTickets, fetchTicket, computeSubStatus, SLA_RESOLVE,
} from "../utils/ticketsDb.js";
import CreateTicketModal from "./CreateTicketModal.jsx";
import TicketDetailView from "./TicketDetailView.jsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function slaLabel(ticket) {
  if (!ticket.severity || !SLA_RESOLVE[ticket.severity]) return null;
  const createdMs = new Date(ticket.created_at).getTime();
  const resolveMs = createdMs + SLA_RESOLVE[ticket.severity] * 60000;
  const remaining = resolveMs - Date.now();
  if (remaining < 0) return { text: "BREACHED", color: "#dc2626", bg: "#fef2f2" };
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const pct = (Date.now() - createdMs) / (SLA_RESOLVE[ticket.severity] * 60000);
  const color = pct >= 0.75 ? "#b45309" : "#15803d";
  const bg = pct >= 0.75 ? "#fffbeb" : "#f0fdf4";
  return { text: `${h}h ${m}m`, color, bg };
}

const SUB_STATUS_META = {
  assigned_unacknowledged: { label: "Unacked", color: "#b45309", bg: "#fffbeb" },
  sla_at_risk:             { label: "At Risk",  color: "#b45309", bg: "#fffbeb" },
  breached:                { label: "Breached", color: "#dc2626", bg: "#fef2f2" },
  no_active_work:          { label: "No Work",  color: "#6b7280", bg: "#f1f5f9" },
};

function rowBorderColor(ticket) {
  const sub = computeSubStatus(ticket);
  if (sub === "breached") return "#dc2626";
  if (sub === "sla_at_risk" || sub === "assigned_unacknowledged") return "#f59e0b";
  return "transparent";
}

function rowBg(ticket) {
  const sub = computeSubStatus(ticket);
  if (sub === "breached") return "rgba(220,38,38,0.04)";
  if (sub === "sla_at_risk" || sub === "assigned_unacknowledged") return "rgba(245,158,11,0.05)";
  return T.surface;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TicketListView({ currentUser, users = [], defaultType, defaultMine, defaultSlaWatch, deepLinkTicketId, onDeepLinkConsumed, onSelectTicket }) {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [now, setNow] = useState(Date.now());

  // Filters
  const [typeFilter, setTypeFilter] = useState(defaultType || "all");
  const [sevFilter, setSevFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [ownerFilter] = useState(defaultMine ? currentUser?.name : "all");
  const [search, setSearch] = useState("");

  // Tick for SLA countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Load tickets
  const load = useCallback(async () => {
    try {
      const filters = {};
      if (typeFilter !== "all") filters.type = typeFilter;
      if (sevFilter !== "all") filters.severity = sevFilter;
      if (teamFilter !== "all") filters.team = teamFilter;
      if (statusFilter !== "all") filters.status = statusFilter;
      if (ownerFilter && ownerFilter !== "all") filters.owner_name = ownerFilter;
      const data = await fetchTickets(filters);
      setTickets(data || []);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, sevFilter, statusFilter, teamFilter, ownerFilter]);

  // Deep link: open ticket by ID from URL hash
  useEffect(() => {
    if (!deepLinkTicketId) return;
    fetchTicket(deepLinkTicketId)
      .then(t => { setSelectedTicket(t); onDeepLinkConsumed?.(); })
      .catch(() => onDeepLinkConsumed?.());
  }, [deepLinkTicketId, onDeepLinkConsumed]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  // Client-side text search + SLA watch filter
  const filtered = useMemo(() => {
    let result = tickets;
    if (defaultSlaWatch) {
      result = result.filter(t => {
        const sub = computeSubStatus(t);
        return sub === "sla_at_risk" || sub === "breached";
      });
    }
    if (!search) return result;
    const q = search.toLowerCase();
    return result.filter(t =>
      t.id.toLowerCase().includes(q) ||
      t.title.toLowerCase().includes(q) ||
      (t.owner_name || "").toLowerCase().includes(q) ||
      (t.impacted_nodes || []).some(n => n.toLowerCase().includes(q)) ||
      (t.tags || []).some(tag => tag.toLowerCase().includes(q))
    );
  }, [tickets, search, defaultSlaWatch]);

  async function openTicket(t) {
    // Fetch full ticket with events + evidence
    try {
      const full = await fetchTicket(t.id);
      setSelectedTicket(full);
      onSelectTicket?.(full);
    } catch {
      setSelectedTicket(t);
    }
  }

  // Badge counts
  const openIncidents = tickets.filter(t => t.type === "incident" && !["resolved","closed"].includes(t.status)).length;
  const myOpen = tickets.filter(t => t.owner_name === currentUser?.name && !["resolved","closed"].includes(t.status)).length;
  const slaAtRisk = tickets.filter(t => {
    const sub = computeSubStatus(t);
    return sub === "sla_at_risk" || sub === "breached";
  }).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: T.bg }}>
      {/* Header */}
      <div style={{
        padding: "16px 24px 12px", background: T.surface, borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>Tickets</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>
            {filtered.length} ticket{filtered.length !== 1 ? "s" : ""}
            {openIncidents > 0 && <span style={{ color: "#dc2626", fontWeight: 700 }}> · {openIncidents} open incidents</span>}
            {slaAtRisk > 0 && <span style={{ color: "#b45309", fontWeight: 700 }}> · {slaAtRisk} SLA at risk</span>}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => setCreating(true)}
            style={{
              padding: "9px 18px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: "pointer",
              background: "#7c3aed", border: "none", color: "#fff", fontFamily: "inherit",
              boxShadow: "0 2px 8px rgba(124,58,237,0.3)",
            }}>
            + New Ticket
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{
        padding: "10px 24px", background: T.surface, borderBottom: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", flexShrink: 0,
      }}>
        {/* Type pills */}
        {[
          { value: "all", label: "All" },
          { value: "incident", label: "Incidents", badgeCount: openIncidents },
          { value: "problem", label: "Problems" },
          { value: "project", label: "Projects" },
        ].map(f => {
          const active = typeFilter === f.value;
          const col = f.value === "all" ? T.primary : TICKET_COLORS[f.value];
          return (
            <button key={f.value} onClick={() => setTypeFilter(f.value)}
              style={{
                padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${active ? (f.value === "all" ? T.primary : col.border) : T.border}`,
                background: active ? (f.value === "all" ? T.primary : col.bg) : "transparent",
                color: active ? (f.value === "all" ? "#fff" : col.text) : T.muted,
                display: "flex", alignItems: "center", gap: 5,
              }}>
              {f.label}
              {f.badgeCount > 0 && (
                <span style={{ background: "#dc2626", color: "#fff", borderRadius: 8, fontSize: 9, fontWeight: 800, padding: "1px 5px" }}>{f.badgeCount}</span>
              )}
            </button>
          );
        })}

        <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />

        {/* Severity pills */}
        {["all","sev1","sev2","sev3","sev4"].map(s => {
          const active = sevFilter === s;
          const meta = s === "all" ? null : SEV_META[s];
          return (
            <button key={s} onClick={() => setSevFilter(s)}
              style={{
                padding: "4px 10px", fontSize: 10, fontWeight: 700, borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
                border: `1px solid ${active && meta ? meta.border : active ? T.primary : T.border}`,
                background: active && meta ? meta.bg : active ? T.primaryBg : "transparent",
                color: active && meta ? meta.color : active ? T.primary : T.muted,
              }}>
              {s === "all" ? "All Sev" : meta.label}
            </button>
          );
        })}

        <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />

        {/* Status dropdown */}
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{
            padding: "5px 8px", fontSize: 11, fontFamily: "inherit", borderRadius: 6,
            border: `1px solid ${T.border}`, background: T.bg, color: T.text, cursor: "pointer",
          }}>
          <option value="all">All Statuses</option>
          {Object.entries(TICKET_STATUS_META).map(([v,m]) => <option key={v} value={v}>{m.label}</option>)}
        </select>

        {/* Team dropdown */}
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
          style={{
            padding: "5px 8px", fontSize: 11, fontFamily: "inherit", borderRadius: 6,
            border: `1px solid ${T.border}`, background: T.bg, color: T.text, cursor: "pointer",
          }}>
          <option value="all">All Teams</option>
          {TICKET_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px", minWidth: 140 }}>
          <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: T.muted, pointerEvents: "none" }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search tickets..."
            style={{
              width: "100%", padding: "6px 10px 6px 26px", fontSize: 11, fontFamily: "inherit",
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text,
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          margin: "24px", background: "#fef2f2", border: "1px solid #fca5a5",
          borderRadius: 10, padding: "20px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 16, marginBottom: 8 }}>Ticketing service unavailable</div>
          <div style={{ fontSize: 13, color: "#dc2626" }}>{error}</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 8 }}>The backend may not be running or may not have the tickets API configured.</div>
        </div>
      )}

      {/* Table */}
      {!error && (
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading && tickets.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center", color: T.muted, fontSize: 13 }}>Loading tickets…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "48px", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🎫</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 6 }}>No tickets found</div>
              <div style={{ fontSize: 12, color: T.muted }}>
                {tickets.length === 0 ? "No tickets yet. Create one above." : "Try clearing filters."}
              </div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  {["ID","Type","Title","Nodes","Owner","Team","Status","Opened","SLA"].map(h => (
                    <th key={h} style={{
                      padding: "8px 14px", fontSize: 10, fontWeight: 700, color: T.muted,
                      letterSpacing: "0.5px", textTransform: "uppercase", textAlign: "left",
                      background: T.surface, position: "sticky", top: 0, zIndex: 1,
                      borderBottom: `1px solid ${T.border}`,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const tc = TICKET_COLORS[t.type] || TICKET_COLORS.incident;
                  const sev = t.severity ? SEV_META[t.severity] : null;
                  const statusMeta = TICKET_STATUS_META[t.status] || { label: t.status, color: T.muted };
                  const sub = computeSubStatus(t);
                  const subMeta = sub ? SUB_STATUS_META[sub] : null;
                  const sla = t.severity ? slaLabel(t) : null;
                  return (
                    <tr key={t.id} onClick={() => openTicket(t)}
                      style={{
                        cursor: "pointer", borderBottom: `1px solid ${T.border}`,
                        background: rowBg(t),
                        borderLeft: `3px solid ${rowBorderColor(t)}`,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg(t)}>
                      <td style={{ padding: "10px 14px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: T.primary }}>{t.id}</span>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{
                            fontSize: 9, fontWeight: 800, color: tc.text, background: tc.bg,
                            border: `1px solid ${tc.border}`, borderRadius: 4, padding: "1px 6px", letterSpacing: "0.3px",
                            display: "inline-block", width: "fit-content",
                          }}>{t.type.toUpperCase()}</span>
                          {sev && (
                            <span style={{
                              fontSize: 9, fontWeight: 800, color: sev.color, background: sev.bg,
                              border: `1px solid ${sev.border}`, borderRadius: 4, padding: "1px 6px", letterSpacing: "0.3px",
                              display: "inline-block", width: "fit-content",
                            }}>{sev.label}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px", maxWidth: 280 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                        {(t.tags || []).length > 0 && (
                          <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
                            {t.tags.slice(0,3).map(tag => (
                              <span key={tag} style={{ fontSize: 9, color: T.muted, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3, padding: "1px 5px" }}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {(t.impacted_nodes || []).slice(0,2).map(n => (
                            <span key={n} style={{ fontSize: 10, fontFamily: "monospace", color: "#dc2626", fontWeight: 700 }}>{n}</span>
                          ))}
                          {(t.impacted_nodes || []).length > 2 && (
                            <span style={{ fontSize: 10, color: T.muted }}>+{t.impacted_nodes.length - 2} more</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 12, color: t.owner_name ? T.text : T.muted, fontStyle: t.owner_name ? "normal" : "italic" }}>
                          {t.owner_name || "Unassigned"}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, color: T.muted }}>{t.team || "—"}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: statusMeta.color,
                            background: `${statusMeta.color}14`, border: `1px solid ${statusMeta.color}33`,
                            borderRadius: 4, padding: "2px 6px", display: "inline-block", width: "fit-content",
                          }}>{statusMeta.label}</span>
                          {subMeta && (
                            <span style={{
                              fontSize: 9, fontWeight: 700, color: subMeta.color, background: subMeta.bg,
                              border: `1px solid ${subMeta.color}44`, borderRadius: 3,
                              padding: "1px 5px", display: "inline-block", width: "fit-content", letterSpacing: "0.3px",
                            }}>{subMeta.label}</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ fontSize: 11, color: T.muted }}>{timeAgo(t.created_at)}</div>
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        {sla ? (
                          <span style={{
                            fontSize: 10, fontWeight: 700, color: sla.color, background: sla.bg,
                            border: `1px solid ${sla.color}33`, borderRadius: 4, padding: "2px 6px",
                          }}>{sla.text}</span>
                        ) : <span style={{ fontSize: 11, color: T.muted }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Create modal */}
      {creating && (
        <CreateTicketModal
          currentUser={currentUser}
          onClose={() => setCreating(false)}
          onCreated={ticket => {
            setCreating(false);
            load();
            openTicket(ticket);
          }}
          prefill={defaultType ? { type: defaultType } : {}}
        />
      )}

      {/* Detail view */}
      {selectedTicket && (
        <TicketDetailView
          ticket={selectedTicket}
          currentUser={currentUser}
          users={users}
          onClose={() => setSelectedTicket(null)}
          onUpdated={updated => {
            setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
          }}
        />
      )}
    </div>
  );
}
