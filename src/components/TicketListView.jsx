import { useState, useEffect, useCallback, useMemo } from "react";
import { T } from "../data/constants.js";
import {
  TICKET_COLORS, SEV_META, TICKET_STATUS_META, TICKET_TEAMS,
  fetchTickets, updateTicket, deleteTicket, seedDemoTickets, computeSubStatus, SLA_RESOLVE,
} from "../utils/ticketsDb.js";
import { timeAgo } from "../utils/helpers.js";
import CreateTicketModal from "./CreateTicketModal.jsx";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtTs(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
  const [now, setNow] = useState(Date.now());

  // Filters
  const [typeFilter, setTypeFilter] = useState(defaultType || "all");
  const [sevFilter, setSevFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [teamFilter, setTeamFilter] = useState("all");
  const [ownerFilter] = useState(defaultMine ? currentUser?.name : "all");
  const [search, setSearch] = useState("");
  const [showLab, setShowLab] = useState(true); // false = hide simulated-fleet tickets

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkOwner, setBulkOwner] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);

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
      if (statusFilter === "active") filters.status = "new,assigned,in_progress,waiting,mitigated";
      else if (statusFilter !== "all") filters.status = statusFilter;
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


  useEffect(() => {
    setLoading(true);
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function applyBulk() {
    if (!bulkStatus && !bulkOwner) return;
    setBulkApplying(true);
    const updates = {};
    if (bulkStatus) updates.status = bulkStatus;
    if (bulkOwner) updates.owner_name = bulkOwner;
    updates.actor_name = currentUser?.name || "System";
    try {
      for (const id of selectedIds) await updateTicket(id, updates);
      setSelectedIds(new Set()); setBulkStatus(""); setBulkOwner("");
      await load();
    } catch (e) { console.error("Bulk update failed:", e.message); }
    finally { setBulkApplying(false); }
  }

  async function bulkDelete() {
    if (!window.confirm(`Delete ${selectedIds.size} ticket${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkApplying(true);
    try {
      for (const id of selectedIds) await deleteTicket(id);
      setSelectedIds(new Set());
      await load();
    } catch (e) { console.error("Bulk delete failed:", e.message); }
    finally { setBulkApplying(false); }
  }

  // Lab ticket = auto-created from alarm AND no node starts with "market-" (real network prefix)
  // Fleet nodes: fj-suva-pe-01, ib-town-cr-01, etc. Real: market-es, market-uk, etc.
  const isLabTicket = t =>
    t.source === "alarm" &&
    !(t.impacted_nodes || []).some(n => n.startsWith("market-"));

  // Client-side text search + SLA watch + Lab filter
  const filtered = useMemo(() => {
    let result = tickets;
    if (!showLab) result = result.filter(t => !isLabTicket(t));
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
  }, [tickets, search, defaultSlaWatch, showLab]);

  function openTicket(t) {
    window.open(`#ticket=${encodeURIComponent(t.id)}`, "_blank");
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
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Demo ticket controls — LAB section */}
          <button
            title="Generate 20 realistic demo tickets (LAB data)"
            onClick={async () => { try { await seedDemoTickets(); await load(); } catch(e) { console.error(e); } }}
            style={{
              padding: "7px 12px", fontSize: 11, fontWeight: 600, borderRadius: 7, cursor: "pointer",
              background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.4)",
              color: "#b45309", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5,
            }}>
            <span style={{ fontSize: 9, fontWeight: 800, background: "#f59e0b", color: "#fff", borderRadius: 3, padding: "1px 4px" }}>LAB</span>
            ⟳ Demo tickets
          </button>
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
          { value: "project", label: "Requests" },
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
          <option value="active">Active (open)</option>
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

        {/* LAB toggle */}
        <button onClick={() => setShowLab(p => !p)}
          title={showLab ? "Lab tickets included — click to hide simulated fleet tickets" : "Lab tickets hidden — click to show simulated fleet tickets"}
          style={{
            padding: "5px 10px", borderRadius: 6, fontSize: 11, fontWeight: 700,
            fontFamily: "inherit", cursor: "pointer", transition: "all 0.15s", whiteSpace: "nowrap",
            border: showLab ? "1px solid rgba(245,158,11,0.5)" : `1px solid ${T.border}`,
            background: showLab ? "rgba(245,158,11,0.08)" : "transparent",
            color: showLab ? "#b45309" : T.muted,
            display: "flex", alignItems: "center", gap: 5,
          }}>
          <span style={{
            fontSize: 9, fontWeight: 800, background: showLab ? "#f59e0b" : "#94a3b8",
            color: "#fff", borderRadius: 4, padding: "1px 4px", letterSpacing: "0.3px",
          }}>LAB</span>
          {showLab ? "Included" : "Hidden"}
        </button>

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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          padding: "8px 20px", background: "#eff6ff", borderBottom: "2px solid #3b82f6",
          display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: "#1d4ed8" }}>
            {selectedIds.size} ticket{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div style={{ width: 1, height: 18, background: "#93c5fd" }} />
          <span style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 600 }}>Move to:</span>
          <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
            style={{ padding: "4px 8px", fontSize: 11, fontFamily: "inherit", borderRadius: 5, border: "1px solid #93c5fd", background: "#fff", color: T.text, cursor: "pointer" }}>
            <option value="">— Status —</option>
            {Object.entries(TICKET_STATUS_META).map(([v, m]) => <option key={v} value={v}>{m.label}</option>)}
          </select>
          <span style={{ fontSize: 11, color: "#1d4ed8", fontWeight: 600 }}>Assign to:</span>
          <select value={bulkOwner} onChange={e => setBulkOwner(e.target.value)}
            style={{ padding: "4px 8px", fontSize: 11, fontFamily: "inherit", borderRadius: 5, border: "1px solid #93c5fd", background: "#fff", color: T.text, cursor: "pointer" }}>
            <option value="">— Owner —</option>
            {users.map(u => <option key={u.id || u.name} value={u.name}>{u.name} · {u.role}</option>)}
          </select>
          <button onClick={applyBulk} disabled={bulkApplying || (!bulkStatus && !bulkOwner)}
            style={{ padding: "5px 14px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
              background: (bulkApplying || (!bulkStatus && !bulkOwner)) ? "#94a3b8" : "#1d4ed8",
              border: "none", color: "#fff", opacity: (!bulkStatus && !bulkOwner) ? 0.5 : 1 }}>
            {bulkApplying ? "Applying…" : "Apply"}
          </button>
          <div style={{ width: 1, height: 18, background: "#93c5fd" }} />
          <button onClick={bulkDelete} disabled={bulkApplying}
            style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
              background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626" }}>
            🗑 Delete selected
          </button>
          <button onClick={() => { setSelectedIds(new Set()); setBulkStatus(""); setBulkOwner(""); }}
            style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
              background: "transparent", border: "1px solid #93c5fd", color: "#1d4ed8", marginLeft: "auto" }}>
            Clear selection
          </button>
        </div>
      )}

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
                  <th style={{ padding: "8px 10px", background: T.surface, position: "sticky", top: 0, zIndex: 1, borderBottom: `1px solid ${T.border}`, width: 36 }}>
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every(t => selectedIds.has(t.id))}
                      onChange={e => setSelectedIds(e.target.checked ? new Set(filtered.map(t => t.id)) : new Set())}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
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
                        background: selectedIds.has(t.id) ? "#eff6ff" : rowBg(t),
                        borderLeft: `3px solid ${selectedIds.has(t.id) ? "#3b82f6" : rowBorderColor(t)}`,
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => { if (!selectedIds.has(t.id)) e.currentTarget.style.background = "#f8fafc"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = selectedIds.has(t.id) ? "#eff6ff" : rowBg(t); }}>
                      <td style={{ padding: "10px 10px", width: 36 }} onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selectedIds.has(t.id)}
                          onChange={e => setSelectedIds(prev => {
                            const next = new Set(prev);
                            e.target.checked ? next.add(t.id) : next.delete(t.id);
                            return next;
                          })}
                          style={{ cursor: "pointer" }}
                        />
                      </td>
                      <td style={{ padding: "10px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {t.parent_id && <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }} title={`Child of ${t.parent_id}`}>↳</span>}
                          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: T.primary }}>{t.id}</span>
                        </div>
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
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.title}</div>
                          {t.source && (
                            <span style={{ fontSize: 9, fontWeight: 700, flexShrink: 0, borderRadius: 3, padding: "1px 5px",
                              color: t.source === "alarm" ? "#b45309" : "#6366f1",
                              background: t.source === "alarm" ? "#fffbeb" : "#eef2ff",
                              border: `1px solid ${t.source === "alarm" ? "#fcd34d" : "#c7d2fe"}` }}>
                              {t.source === "alarm" ? "🤖" : "👤"}
                            </span>
                          )}
                        </div>
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
                        <div style={{ fontSize: 11, color: T.muted }}>{fmtTs(t.created_at)}</div>
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

    </div>
  );
}
