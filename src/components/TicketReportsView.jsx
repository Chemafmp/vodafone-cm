import { useState, useEffect, useMemo } from "react";
import { T } from "../data/constants.js";
import { fetchTickets, SEV_META, TICKET_STATUS_META, TICKET_COLORS } from "../utils/ticketsDb.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function mttrHours(ticket) {
  if (!ticket.resolved_at || !ticket.created_at) return null;
  return (new Date(ticket.resolved_at) - new Date(ticket.created_at)) / 3600000;
}

function fmtDuration(hours) {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function avg(arr) {
  if (!arr.length) return null;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─── Mini bar chart using divs ─────────────────────────────────────────────
function BarChart({ data, colorFn, maxLabel = 6 }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
      {data.slice(0, maxLabel).map(d => (
        <div key={d.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 130, fontSize: 11, color: T.text, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
          <div style={{ flex: 1, height: 18, background: T.bg, borderRadius: 4, overflow: "hidden", border: `1px solid ${T.border}` }}>
            <div style={{
              width: `${(d.value / max) * 100}%`, height: "100%",
              background: colorFn ? colorFn(d) : T.primary,
              borderRadius: 3, transition: "width 0.4s ease",
              minWidth: d.value > 0 ? 4 : 0,
            }} />
          </div>
          <div style={{ width: 28, fontSize: 11, fontWeight: 700, color: T.text, textAlign: "right", flexShrink: 0 }}>{d.value}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Metric card ──────────────────────────────────────────────────────────────
function MetricCard({ label, value, sub, color = T.primary, icon }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 18px", borderTop: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: "monospace", lineHeight: 1 }}>{value}</div>
        {icon && <span style={{ fontSize: 18, opacity: 0.35 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 11, color: T.muted, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 10, color: T.muted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

const RANGES = [
  { label: "7d",    days: 7 },
  { label: "30d",   days: 30 },
  { label: "90d",   days: 90 },
  { label: "All",   days: null },
];

const STATUS_COLORS = {
  new:         "#6b7280",
  assigned:    "#8b5cf6",
  in_progress: "#0891b2",
  mitigated:   "#f59e0b",
  resolved:    "#15803d",
  closed:      "#374151",
};

export default function TicketReportsView() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState(30);
  const [teamFilter, setTeamFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  useEffect(() => {
    fetchTickets({}).then(data => {
      setTickets(data || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Derived filter options from all tickets (not scoped — so dropdown always shows full list)
  const allTeams = useMemo(() => [...new Set(tickets.map(t => t.team).filter(Boolean))].sort(), [tickets]);
  const allOwners = useMemo(() => [...new Set(tickets.map(t => t.owner_name).filter(Boolean))].sort(), [tickets]);

  // Apply time range + team + owner filters
  const scoped = useMemo(() => {
    let result = tickets;
    if (range) {
      const cutoff = Date.now() - range * 86400000;
      result = result.filter(t => new Date(t.created_at).getTime() >= cutoff);
    }
    if (teamFilter !== "all") result = result.filter(t => t.team === teamFilter);
    if (ownerFilter !== "all") result = result.filter(t => t.owner_name === ownerFilter);
    return result;
  }, [tickets, range, teamFilter, ownerFilter]);

  // ── Aggregations ────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = scoped.length;
    const open = scoped.filter(t => !["resolved","closed"].includes(t.status)).length;
    const resolved = scoped.filter(t => ["resolved","closed"].includes(t.status)).length;
    const incidents = scoped.filter(t => t.type === "incident").length;

    // MTTR overall
    const mttrs = scoped.map(mttrHours).filter(v => v != null);
    const mttrAvg = avg(mttrs);

    // SLA compliance: tickets resolved before SLA deadline
    const SLA_RESOLVE_MIN = { sev1: 240, sev2: 480, sev3: 4320, sev4: 10080 };
    const withSla = scoped.filter(t => t.severity && t.resolved_at);
    const slaOk = withSla.filter(t => {
      const h = mttrHours(t);
      if (h == null) return false;
      return h * 60 <= (SLA_RESOLVE_MIN[t.severity] || Infinity);
    });
    const slaPct = withSla.length > 0 ? Math.round((slaOk.length / withSla.length) * 100) : null;

    // By status
    const byStatus = Object.entries(TICKET_STATUS_META).map(([k, m]) => ({
      label: m.label, value: scoped.filter(t => t.status === k).length, key: k,
    })).filter(d => d.value > 0);

    // By severity
    const bySev = Object.entries(SEV_META).map(([k, m]) => ({
      label: m.label, value: scoped.filter(t => t.severity === k).length, key: k,
      color: m.color,
    })).filter(d => d.value > 0);

    // By type
    const byType = ["incident","problem","project"].map(type => ({
      label: type.charAt(0).toUpperCase() + type.slice(1),
      value: scoped.filter(t => t.type === type).length,
      key: type,
    })).filter(d => d.value > 0);

    // By team (top 8)
    const teamCounts = {};
    scoped.forEach(t => { if (t.team) teamCounts[t.team] = (teamCounts[t.team] || 0) + 1; });
    const byTeam = Object.entries(teamCounts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);

    // MTTR by severity
    const mttrBySev = Object.keys(SEV_META).map(sev => {
      const resolved = scoped.filter(t => t.severity === sev && t.resolved_at);
      const hours = resolved.map(mttrHours).filter(v => v != null);
      return { sev, label: SEV_META[sev].label, color: SEV_META[sev].color, bg: SEV_META[sev].bg, border: SEV_META[sev].border, avg: avg(hours), count: resolved.length };
    });

    return { total, open, resolved, incidents, mttrAvg, slaPct, byStatus, bySev, byType, byTeam, mttrBySev };
  }, [scoped]);

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 13 }}>
      Loading report data…
    </div>
  );

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px", background: T.bg }}>

      {/* Header + filters */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>Ticket Reports</div>
          <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{scoped.length} ticket{scoped.length !== 1 ? "s" : ""} match filters</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Team filter */}
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
            style={{ padding: "5px 10px", fontSize: 11, fontFamily: "inherit", borderRadius: 6, border: `1px solid ${T.border}`, background: teamFilter !== "all" ? "#eff6ff" : T.bg, color: T.text, cursor: "pointer" }}>
            <option value="all">All Teams</option>
            {allTeams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {/* Owner filter */}
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
            style={{ padding: "5px 10px", fontSize: 11, fontFamily: "inherit", borderRadius: 6, border: `1px solid ${T.border}`, background: ownerFilter !== "all" ? "#eff6ff" : T.bg, color: T.text, cursor: "pointer" }}>
            <option value="all">All People</option>
            {allOwners.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {(teamFilter !== "all" || ownerFilter !== "all") && (
            <button onClick={() => { setTeamFilter("all"); setOwnerFilter("all"); }}
              style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 6, cursor: "pointer", fontFamily: "inherit", background: "transparent", border: `1px solid ${T.border}`, color: T.muted }}>
              Clear
            </button>
          )}
          <div style={{ width: 1, height: 20, background: T.border }} />
          {/* Time range */}
          {RANGES.map(r => {
            const active = range === r.days;
            return (
              <button key={r.label} onClick={() => setRange(r.days)}
                style={{
                  padding: "5px 14px", fontSize: 11, fontWeight: 700, borderRadius: 6,
                  cursor: "pointer", fontFamily: "inherit",
                  background: active ? T.primary : "transparent",
                  border: `1px solid ${active ? T.primary : T.border}`,
                  color: active ? "#fff" : T.muted,
                }}>
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 28 }}>
        <MetricCard label="Total Tickets"     value={stats.total}     color={T.primary}  icon="🎫" />
        <MetricCard label="Open"              value={stats.open}      color="#b45309"    icon="🔓" />
        <MetricCard label="Resolved/Closed"   value={stats.resolved}  color="#15803d"    icon="✓" />
        <MetricCard label="Incidents"         value={stats.incidents} color="#dc2626"    icon="🚨" />
        <MetricCard label="Avg MTTR"          value={fmtDuration(stats.mttrAvg)} color="#0891b2" icon="⏱" sub="mean time to resolve" />
        <MetricCard label="SLA Compliance"    value={stats.slaPct != null ? `${stats.slaPct}%` : "—"} color={stats.slaPct >= 90 ? "#15803d" : stats.slaPct >= 70 ? "#b45309" : "#dc2626"} icon="📋" sub="tickets resolved within SLA" />
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>

        {/* By Status */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 16 }}>By Status</div>
          <BarChart data={stats.byStatus} colorFn={d => STATUS_COLORS[d.key] || T.primary} />
          {stats.byStatus.length === 0 && <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>No data</div>}
        </div>

        {/* By Severity */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 16 }}>By Severity</div>
          <BarChart data={stats.bySev} colorFn={d => d.color} />
          {stats.bySev.length === 0 && <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>No data</div>}
        </div>

        {/* By Team */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 16 }}>By Team</div>
          <BarChart data={stats.byTeam} colorFn={() => "#7c3aed"} maxLabel={8} />
          {stats.byTeam.length === 0 && <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>No data</div>}
        </div>
      </div>

      {/* MTTR by severity */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px", marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 16 }}>MTTR by Severity <span style={{ fontSize: 10, fontWeight: 400, color: T.muted }}>(mean time to resolve — resolved tickets only)</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {stats.mttrBySev.map(s => (
            <div key={s.sev} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: s.color, letterSpacing: "0.5px", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: "monospace" }}>{fmtDuration(s.avg)}</div>
              <div style={{ fontSize: 10, color: s.color, opacity: 0.7, marginTop: 4 }}>{s.count} resolved</div>
            </div>
          ))}
        </div>
      </div>

      {/* By Type */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "18px 20px" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 16 }}>By Type</div>
        <div style={{ display: "flex", gap: 16 }}>
          {stats.byType.map(d => {
            const tc = TICKET_COLORS[d.key] || TICKET_COLORS.incident;
            const pct = stats.total > 0 ? Math.round((d.value / stats.total) * 100) : 0;
            return (
              <div key={d.key} style={{ flex: 1, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: tc.text, textTransform: "uppercase", marginBottom: 4 }}>{d.label}</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: tc.text, fontFamily: "monospace" }}>{d.value}</div>
                <div style={{ fontSize: 10, color: tc.text, opacity: 0.7, marginTop: 2 }}>{pct}% of total</div>
              </div>
            );
          })}
          {stats.byType.length === 0 && <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>No data</div>}
        </div>
      </div>

    </div>
  );
}
