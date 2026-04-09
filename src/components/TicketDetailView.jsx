import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../data/constants.js";
import {
  TICKET_COLORS, SEV_META, TICKET_STATUS_META, TICKET_TEAMS,
  fetchTicket, updateTicket, addTicketEvent, addTicketEvidence,
  slaCountdown,
} from "../utils/ticketsDb.js";

// ─── Working state ─────────────────────────────────────────────────────────────
const WORKING_STATES = [
  { value: "unassigned",    label: "Unassigned",      color: "#64748b", bg: "#f1f5f9", border: "#cbd5e1" },
  { value: "acknowledged",  label: "Acknowledged",    color: "#1d4ed8", bg: "#eff6ff", border: "#93c5fd" },
  { value: "active_work",   label: "Active Work",     color: "#15803d", bg: "#f0fdf4", border: "#86efac" },
  { value: "waiting",       label: "Waiting on Others", color: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  { value: "at_risk",       label: "At Risk",         color: "#c2410c", bg: "#fff7ed", border: "#fdba74" },
  { value: "stalled",       label: "Stalled",         color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
];
const WS_MAP = Object.fromEntries(WORKING_STATES.map(s => [s.value, s]));

// ─── Constants ─────────────────────────────────────────────────────────────────
const CLOSURE_CODES = [
  { value: "no_fault_found",   label: "No Fault Found" },
  { value: "hardware_failure", label: "Hardware Failure" },
  { value: "software_bug",     label: "Software / Firmware Bug" },
  { value: "config_error",     label: "Configuration Error" },
  { value: "human_error",      label: "Human Error / Procedure" },
  { value: "capacity",         label: "Capacity / Congestion" },
  { value: "third_party",      label: "Third Party / Vendor" },
  { value: "power",            label: "Power Issue" },
  { value: "change_related",   label: "Change-Related" },
  { value: "security",         label: "Security Incident" },
  { value: "planned",          label: "Planned Maintenance" },
  { value: "duplicate",        label: "Duplicate" },
];

const EVENT_META = {
  created:        { icon: "✦", color: "#7c3aed" },
  status_change:  { icon: "⇄", color: "#0891b2" },
  assignment:     { icon: "👤", color: "#8b5cf6" },
  note:           { icon: "💬", color: "#374151" },
  alarm_linked:   { icon: "🔔", color: "#b45309" },
  alarm_resolved: { icon: "✓",  color: "#15803d" },
  evidence_added: { icon: "📎", color: "#1d4ed8" },
  updated:        { icon: "✎",  color: "#64748b" },
};

const EVIDENCE_ICONS = { attachment: "📄", snapshot: "📸", link: "🔗", alarm_ref: "🔔", change_ref: "📋" };

// ─── Markdown renderer ─────────────────────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre style="background:#1e293b;color:#e2e8f0;padding:10px 14px;border-radius:6px;font-family:monospace;font-size:11px;overflow-x:auto;margin:6px 0;">${code.trim()}</pre>`
  );
  html = html.replace(/`([^`]+)`/g,
    `<code style="background:#f1f5f9;color:#1d4ed8;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:0.92em;">$1</code>`
  );
  html = html.replace(/^&gt; ?(.*)$/gm,
    `<blockquote style="border-left:3px solid #94a3b8;margin:4px 0;padding:2px 10px;color:#64748b;font-style:italic;">$1</blockquote>`
  );
  html = html.replace(/^### (.+)$/gm, `<h3 style="font-size:13px;font-weight:700;margin:10px 0 4px;">$1</h3>`);
  html = html.replace(/^## (.+)$/gm,  `<h2 style="font-size:14px;font-weight:700;margin:12px 0 5px;">$1</h2>`);
  html = html.replace(/^# (.+)$/gm,   `<h1 style="font-size:16px;font-weight:800;margin:14px 0 6px;">$1</h1>`);
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/((?:^- .+\n?)+)/gm, (block) => {
    const items = block.trim().split(/\n/).map(line =>
      `<li style="margin:2px 0;">${line.replace(/^- /, "")}</li>`
    ).join("");
    return `<ul style="margin:6px 0;padding-left:18px;">${items}</ul>`;
  });
  html = html.replace(/\n\n+/g, "</p><p style='margin:6px 0;'>");
  html = `<p style="margin:6px 0;">${html}</p>`;
  html = html.replace(/(?<!\>)\n(?!\<)/g, "<br>");
  return html;
}

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

function fmtTs(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function initials(name) {
  return (name || "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────
function RailField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.35)", letterSpacing: "0.7px", textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function RailDivider() {
  return <div style={{ borderTop: `1px solid ${T.sidebarBorder}`, margin: "2px 0" }} />;
}

function TagEditor({ tags, onSave }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  function addTag() {
    const t = input.trim();
    if (t && !tags.includes(t)) onSave([...tags, t]);
    setInput("");
    setEditing(false);
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {tags.map(tag => (
        <span key={tag} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "#eff6ff", border: "1px solid #93c5fd", color: "#1d4ed8", display: "flex", alignItems: "center", gap: 4 }}>
          {tag}
          <button onClick={() => onSave(tags.filter(t => t !== tag))}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#93c5fd", fontSize: 9, padding: 0, lineHeight: 1 }}>✕</button>
        </span>
      ))}
      {editing ? (
        <input value={input} onChange={e => setInput(e.target.value)}
          onBlur={addTag} onKeyDown={e => e.key === "Enter" && addTag()}
          autoFocus placeholder="tag…"
          style={{ fontSize: 10, padding: "2px 6px", borderRadius: 10, border: "1px solid #93c5fd", outline: "none", width: 70, fontFamily: "inherit", background: T.bg, color: T.text }} />
      ) : (
        <button onClick={() => setEditing(true)}
          style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.2)", background: "transparent", cursor: "pointer", color: "rgba(255,255,255,0.35)", fontFamily: "inherit" }}>
          + tag
        </button>
      )}
    </div>
  );
}

function InlineEdit({ value, onSave, style = {}, placeholder = "Click to edit…" }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef();

  useEffect(() => { setVal(value); }, [value]);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);

  function finish() {
    setEditing(false);
    if (val !== value) onSave(val);
  }

  if (!editing) return (
    <span onClick={() => setEditing(true)} title="Click to edit"
      style={{ cursor: "pointer", borderBottom: "1px dashed rgba(255,255,255,0.2)", color: value ? T.sidebarText : "rgba(255,255,255,0.3)", fontStyle: value ? "normal" : "italic", ...style }}>
      {value || placeholder}
    </span>
  );

  return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onBlur={finish} onKeyDown={e => e.key === "Enter" && finish()}
      style={{ fontSize: "inherit", fontWeight: "inherit", fontFamily: "inherit", color: T.sidebarText, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, padding: "2px 6px", outline: "none", width: "100%", ...style }} />
  );
}

// ─── SLA Timer — quiet unless at risk/breached ────────────────────────────────
function SlaTimer({ ticket }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const info = slaCountdown(ticket, now);
  if (!info) return null;

  const urgent = info.pct > 0.75 || info.breached;

  if (!urgent) {
    // Quiet mode: just a small line
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.3)", letterSpacing: "0.6px", textTransform: "uppercase" }}>SLA</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.4)", fontFamily: "monospace" }}>{info.label}</span>
      </div>
    );
  }

  // Urgent mode: prominent box
  return (
    <div style={{ background: info.breached ? "rgba(220,38,38,0.2)" : "rgba(194,65,12,0.15)", border: `1px solid ${info.color}55`, borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: info.color, letterSpacing: "0.6px", textTransform: "uppercase" }}>
          {info.breached ? "⚠ SLA BREACHED" : "⚠ SLA AT RISK"}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: info.color, fontFamily: "monospace" }}>{info.label}</span>
      </div>
      <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, info.pct * 100)}%`, height: "100%", background: info.color, transition: "width 1s linear" }} />
      </div>
    </div>
  );
}

// ─── Closure modal ─────────────────────────────────────────────────────────────
function ClosureModal({ targetStatus, onConfirm, onCancel }) {
  const [code, setCode] = useState("");
  const [summary, setSummary] = useState("");

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.6)" }}>
      <div style={{ width: 480, background: T.surface, borderRadius: 16, padding: "28px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.35)", border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 5 }}>
          {targetStatus === "resolved" ? "Resolve ticket" : "Close ticket"}
        </div>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 22 }}>
          Fill in the closure details to complete the transition.
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", textTransform: "uppercase" }}>Closure code *</label>
          <select value={code} onChange={e => setCode(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 10px", fontSize: 13, fontFamily: "inherit", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: code ? T.text : T.muted, outline: "none", cursor: "pointer" }}>
            <option value="">— Select closure code —</option>
            {CLOSURE_CODES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", textTransform: "uppercase" }}>
            Resolution summary{targetStatus === "resolved" ? " *" : " (optional)"}
          </label>
          <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3}
            placeholder="What was done to resolve / close this ticket?"
            style={{ display: "block", width: "100%", marginTop: 6, padding: "9px 10px", fontSize: 12, fontFamily: "inherit", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel}
            style={{ padding: "9px 18px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button
            onClick={() => code && onConfirm({ closure_code: code, resolution_summary: summary })}
            disabled={!code || (targetStatus === "resolved" && !summary.trim())}
            style={{ padding: "9px 20px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: targetStatus === "resolved" ? "#15803d" : "#374151", color: "#fff", cursor: (code && (targetStatus !== "resolved" || summary.trim())) ? "pointer" : "default", fontFamily: "inherit", opacity: (code && (targetStatus !== "resolved" || summary.trim())) ? 1 : 0.5 }}>
            {targetStatus === "resolved" ? "Mark resolved" : "Close ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Note avatar ──────────────────────────────────────────────────────────────
function Avatar({ name, size = 32 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#1d4ed8,#0e7490)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: size * 0.38, color: "#fff", flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TicketDetailView({ ticket: initialTicket, ticketId, currentUser, users = [], onClose, onUpdated, fullScreen = false }) {
  const [ticket, setTicket] = useState(initialTicket || null);
  const [events, setEvents] = useState(initialTicket?.events || []);
  const [evidence, setEvidence] = useState(initialTicket?.evidence || []);
  const [loadingTicket, setLoadingTicket] = useState(!initialTicket && !!ticketId);
  const [activeTab, setActiveTab] = useState("work");
  const [noteText, setNoteText] = useState("");
  const [postingNote, setPostingNote] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [copying, setCopying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(initialTicket?.description || "");
  const [closureModal, setClosureModal] = useState(null);
  const notesEndRef = useRef();

  // Full-screen mode: load ticket by ID on mount
  useEffect(() => {
    if (!ticketId || initialTicket) return;
    setLoadingTicket(true);
    fetchTicket(ticketId)
      .then(data => {
        setTicket(data);
        setEvents(data.events || []);
        setEvidence(data.evidence || []);
        setDescDraft(data.description || "");
      })
      .catch(() => {})
      .finally(() => setLoadingTicket(false));
  }, [ticketId, initialTicket]);

  useEffect(() => {
    notesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  const refresh = useCallback(async () => {
    const id = ticket?.id;
    if (!id) return;
    try {
      const data = await fetchTicket(id);
      setTicket(data);
      setEvents(data.events || []);
      setEvidence(data.evidence || []);
    } catch { /* ignore */ }
  }, [ticket?.id]);

  // Auto-refresh every 10s while ticket is open
  useEffect(() => {
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [refresh]);

  async function patchTicket(updates) {
    setSaving(true);
    try {
      const updated = await updateTicket(ticket.id, { ...updates, actor_name: currentUser?.name });
      setTicket(updated);
      onUpdated?.(updated);
      await refresh();
    } catch (e) {
      console.error("patch ticket failed:", e.message);
    } finally {
      setSaving(false);
    }
  }

  function handleStatusChange(newStatus) {
    if (["resolved", "closed"].includes(newStatus)) {
      setClosureModal({ targetStatus: newStatus });
    } else {
      patchTicket({ status: newStatus });
    }
  }

  async function postNote() {
    if (!noteText.trim()) return;
    setPostingNote(true);
    try {
      await addTicketEvent(ticket.id, {
        event_type: "note",
        content: noteText.trim(),
        actor_name: currentUser?.name || "Unknown",
        actor_id: currentUser?.id || null,
      });
      setNoteText("");
      await refresh();
    } catch (e) {
      console.error("post note failed:", e.message);
    } finally {
      setPostingNote(false);
    }
  }

  async function addLink() {
    if (!linkUrl.trim()) return;
    setAddingLink(true);
    try {
      await addTicketEvidence(ticket.id, {
        type: "link",
        label: linkLabel.trim() || linkUrl.trim(),
        url: linkUrl.trim(),
        uploaded_by: currentUser?.name,
      });
      setLinkUrl(""); setLinkLabel("");
      await refresh();
    } catch (e) {
      console.error("add link failed:", e.message);
    } finally {
      setAddingLink(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#ticket=${ticket.id}`;
    navigator.clipboard.writeText(url).then(() => { setCopying(true); setTimeout(() => setCopying(false), 2000); }).catch(() => {});
  }

  // Loading state (full-screen mode, fetching ticket by ID)
  if (loadingTicket || !ticket) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: T.bg, color: T.muted, fontSize: 13, fontFamily: "'Inter','Segoe UI',sans-serif", gap: 10 }}>
        <span style={{ fontSize: 20 }}>⟳</span> Loading ticket…
      </div>
    );
  }

  const tc = TICKET_COLORS[ticket.type] || TICKET_COLORS.incident;
  const sev = ticket.severity ? SEV_META[ticket.severity] : null;
  const statusMeta = TICKET_STATUS_META[ticket.status] || { label: ticket.status, color: T.muted };
  const wsState = ticket.working_state ? WS_MAP[ticket.working_state] : null;
  const notes = events.filter(e => e.event_type === "note");
  const logEvents = events.filter(e => e.event_type !== "note");
  const automationEvents = logEvents.filter(e => e.event_type === "automation_note");
  const systemEvents = logEvents.filter(e => e.event_type !== "automation_note" && (!e.actor_name || e.actor_name === "System"));
  const humanEvents = logEvents.filter(e => e.event_type !== "automation_note" && e.actor_name && e.actor_name !== "System");
  const closureLabel = ticket.closure_code ? CLOSURE_CODES.find(c => c.value === ticket.closure_code)?.label : null;

  // ─── Left rail style helpers ───────────────────────────────────────────────
  const railSelectStyle = {
    width: "100%", padding: "5px 8px", fontSize: 11, borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.06)",
    color: T.sidebarText, fontFamily: "inherit", outline: "none", cursor: "pointer",
  };

  const containerStyle = fullScreen
    ? { position: "fixed", inset: 0, background: T.bg, display: "flex", flexDirection: "column", fontFamily: "'Inter','Segoe UI',sans-serif" }
    : { position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "stretch" };

  return (
    <div style={containerStyle} onClick={!fullScreen ? (e => e.target === e.currentTarget && onClose()) : undefined}>

      <div style={fullScreen
        ? { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }
        : { marginLeft: "auto", width: "92%", maxWidth: 1200, background: T.bg, display: "flex", flexDirection: "column", height: "100%", boxShadow: "-8px 0 48px rgba(0,0,0,0.25)" }
      }>

        {/* ── TOPBAR ──────────────────────────────────────────────────────── */}
        <div style={{ padding: "12px 20px", background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: T.muted, flexShrink: 0 }}>{ticket.id}</span>

          <span style={{ fontSize: 10, fontWeight: 800, color: tc.text, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 5, padding: "2px 8px", flexShrink: 0 }}>
            {ticket.type.toUpperCase()}
          </span>

          {ticket.type === "incident" && (
            <select
              value={ticket.severity || ""}
              disabled={saving}
              onChange={e => patchTicket({ severity: e.target.value || null })}
              style={{
                fontSize: 10, fontWeight: 800, fontFamily: "inherit",
                color: sev?.color || T.muted,
                background: sev?.bg || T.bg,
                border: `1px solid ${sev?.border || T.border}`,
                borderRadius: 5, padding: "2px 6px",
                cursor: "pointer", outline: "none", flexShrink: 0,
              }}>
              <option value="">— No SEV —</option>
              {Object.entries(SEV_META).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          )}

          {/* Title — editable, fills remaining space */}
          <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: T.text }}>
            <InlineEdit
              value={ticket.title}
              onSave={v => patchTicket({ title: v })}
              style={{ fontSize: 15, fontWeight: 700, color: T.text, borderBottom: "1px dashed " + T.border }}
              placeholder="Untitled ticket"
            />
          </div>

          {/* Status */}
          <select value={ticket.status} disabled={saving}
            onChange={e => handleStatusChange(e.target.value)}
            style={{ padding: "5px 10px", fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: "pointer", border: `1px solid ${statusMeta.color}55`, background: `${statusMeta.color}15`, color: statusMeta.color, fontFamily: "inherit", outline: "none", flexShrink: 0 }}>
            {Object.entries(TICKET_STATUS_META).map(([v, m]) => (
              <option key={v} value={v}>{m.label}</option>
            ))}
          </select>

          {/* Working state — lightweight attention indicator */}
          <select
            value={ticket.working_state || "unassigned"}
            disabled={saving}
            onChange={e => patchTicket({ working_state: e.target.value })}
            style={{
              padding: "5px 10px", fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: "pointer",
              fontFamily: "inherit", outline: "none", flexShrink: 0,
              border: `1px solid ${(wsState || WS_MAP.unassigned).border}`,
              background: (wsState || WS_MAP.unassigned).bg,
              color: (wsState || WS_MAP.unassigned).color,
            }}>
            {WORKING_STATES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>

          <button onClick={copyLink}
            style={{ padding: "5px 11px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer", background: "transparent", border: `1px solid ${T.border}`, color: copying ? "#15803d" : T.muted, fontFamily: "inherit", flexShrink: 0 }}>
            {copying ? "✓ Copied!" : "Copy link"}
          </button>

          {saving && <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>saving…</span>}

          <button onClick={onClose}
            style={{ background: "none", border: "none", fontSize: 20, color: T.muted, cursor: "pointer", padding: "2px 6px", lineHeight: 1, flexShrink: 0 }}>✕</button>
        </div>

        {/* ── BODY ────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

          {/* ── LEFT RAIL (dark, sidebar-style) ───────────────────────────── */}
          <div style={{
            width: 220, flexShrink: 0, overflowY: "auto", padding: "16px 14px",
            borderRight: `1px solid ${T.sidebarBorder}`,
            background: T.sidebar,
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <SlaTimer ticket={ticket} />
            <RailDivider />

            {/* Owner */}
            <RailField label="Owner">
              <select value={ticket.owner_name || ""} disabled={saving}
                onChange={e => patchTicket({ owner_name: e.target.value || null })}
                style={railSelectStyle}>
                <option value="">— Unassigned —</option>
                {users.map(u => <option key={u.id} value={u.name}>{u.name} · {u.role}</option>)}
              </select>
            </RailField>

            {/* Team */}
            <RailField label="Team">
              <select value={ticket.team || ""} disabled={saving}
                onChange={e => patchTicket({ team: e.target.value })}
                style={railSelectStyle}>
                {TICKET_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </RailField>

            <RailDivider />

            {/* Nodes */}
            {ticket.impacted_nodes?.length > 0 && (
              <RailField label="Impacted Nodes">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {ticket.impacted_nodes.map(n => (
                    <span key={n} style={{ fontSize: 10, fontFamily: "monospace", fontWeight: 700, background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", padding: "2px 7px", borderRadius: 5 }}>
                      ● {n}
                    </span>
                  ))}
                </div>
              </RailField>
            )}

            {/* Services */}
            {ticket.impacted_services?.length > 0 && (
              <RailField label="Impacted Services">
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {ticket.impacted_services.map(s => (
                    <span key={s} style={{ fontSize: 10, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", color: T.sidebarMuted, padding: "2px 6px", borderRadius: 4 }}>{s}</span>
                  ))}
                </div>
              </RailField>
            )}

            {/* Country */}
            {ticket.country && (
              <RailField label="Country">
                <span style={{ fontSize: 12, color: T.sidebarText }}>{ticket.country}</span>
              </RailField>
            )}

            <RailDivider />

            {/* Tags */}
            <RailField label="Tags">
              <TagEditor tags={ticket.tags || []} onSave={tags => patchTicket({ tags })} />
            </RailField>

            <RailDivider />

            {/* Related Change */}
            <RailField label="Related Change">
              <InlineEdit
                value={ticket.related_change_id || ""}
                onSave={v => patchTicket({ related_change_id: v || null })}
                style={{ fontSize: 11 }}
                placeholder="BNOC-000…"
              />
            </RailField>

            {/* Parent Ticket */}
            <RailField label="Parent Ticket">
              <InlineEdit
                value={ticket.parent_id || ""}
                onSave={v => patchTicket({ parent_id: v || null })}
                style={{ fontSize: 11 }}
                placeholder="BNOC-PRB-…"
              />
            </RailField>

            <RailDivider />

            {/* Closure code (read-only, shown when resolved/closed) */}
            {closureLabel && (
              <RailField label="Closure Code">
                <span style={{ fontSize: 11, fontWeight: 600, color: "#4ade80" }}>{closureLabel}</span>
              </RailField>
            )}

            {/* Created */}
            <RailField label="Created">
              <span style={{ fontSize: 11, color: T.sidebarMuted }}>{fmtTs(ticket.created_at)}</span>
            </RailField>

            {ticket.resolved_at && (
              <RailField label="Resolved">
                <span style={{ fontSize: 11, color: T.sidebarMuted }}>{fmtTs(ticket.resolved_at)}</span>
              </RailField>
            )}
          </div>

          {/* ── RIGHT — TABS + CONTENT ─────────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.surface }}>
              {[
                { key: "work",        label: `Work (${notes.length})` },
                { key: "log",         label: `Log (${logEvents.length})` },
                { key: "attachments", label: `Attachments (${evidence.length})` },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: "12px 20px", fontSize: 12, fontWeight: activeTab === tab.key ? 700 : 400,
                    color: activeTab === tab.key ? T.primary : T.muted,
                    background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                    borderBottom: `2px solid ${activeTab === tab.key ? T.primary : "transparent"}`,
                    marginBottom: -1, transition: "color 0.15s",
                  }}>{tab.label}</button>
              ))}
            </div>

            {/* ── WORK TAB ───────────────────────────────────────────────────── */}
            {activeTab === "work" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

                {/* Alarm-cleared banner — SEV1/SEV2 only, shown when alarm resolved but ticket still open */}
                {(() => {
                  const alarmClearedEv = [...events].reverse().find(e => e.event_type === "alarm_resolved");
                  const needsVerification = alarmClearedEv && !["resolved","closed"].includes(ticket.status) && ["sev1","sev2"].includes(ticket.severity);
                  if (!needsVerification) return null;
                  return (
                    <div style={{ background: "#fffbeb", borderBottom: `2px solid #fbbf24`, padding: "10px 22px", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                      <span style={{ fontSize: 16 }}>⚡</span>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>Alarm cleared — operator verification required </span>
                        <span style={{ fontSize: 11, color: "#b45309" }}>The triggering alarm has resolved but this ticket must be closed manually after verifying service is stable.</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Description block */}
                <div style={{ padding: "16px 22px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", textTransform: "uppercase" }}>Description</div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                      <button onClick={() => { setEditingDesc(!editingDesc); setDescDraft(ticket.description || ""); }}
                        style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, borderRadius: 5, cursor: "pointer", fontFamily: "inherit", background: editingDesc ? T.primary : "transparent", border: `1px solid ${editingDesc ? T.primary : T.border}`, color: editingDesc ? "#fff" : T.muted }}>
                        {editingDesc ? "Preview" : "Edit"}
                      </button>
                      {editingDesc && (
                        <button onClick={() => { patchTicket({ description: descDraft }); setEditingDesc(false); }}
                          style={{ padding: "3px 10px", fontSize: 10, fontWeight: 700, borderRadius: 5, cursor: "pointer", fontFamily: "inherit", background: "#15803d", border: "none", color: "#fff" }}>
                          Save
                        </button>
                      )}
                    </div>
                  </div>
                  {editingDesc ? (
                    <textarea
                      value={descDraft} onChange={e => setDescDraft(e.target.value)} rows={6}
                      placeholder="Describe the issue… Markdown supported: **bold**, `code`, ``` blocks, - lists"
                      style={{ width: "100%", padding: "10px 12px", fontSize: 12, fontFamily: "monospace", lineHeight: 1.7, background: "#1e293b", color: "#e2e8f0", border: "none", borderRadius: 8, outline: "none", resize: "vertical", boxSizing: "border-box" }}
                    />
                  ) : (
                    <div
                      onClick={() => { setEditingDesc(true); setDescDraft(ticket.description || ""); }}
                      style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 14px", minHeight: 56, fontSize: 13, lineHeight: 1.75, color: T.text, cursor: "text" }}
                      dangerouslySetInnerHTML={{ __html: ticket.description ? renderMarkdown(ticket.description) : `<span style="color:${T.muted};font-style:italic;">No description — click to add one.</span>` }}
                    />
                  )}

                  {/* Resolution summary banner */}
                  {ticket.resolution_summary && (
                    <div style={{ marginTop: 10, padding: "10px 14px", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#15803d", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 4 }}>Resolution Summary</div>
                      <div style={{ fontSize: 13, color: "#166534", lineHeight: 1.6 }}>{ticket.resolution_summary}</div>
                    </div>
                  )}
                </div>

                {/* Notes feed */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
                  {notes.length === 0 && (
                    <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic", textAlign: "center", padding: "28px 0" }}>
                      No notes yet — add context, paste command output, share findings.
                    </div>
                  )}
                  {notes.map((ev, i) => (
                    <div key={ev.id}>
                      {i > 0 && <div style={{ borderTop: `1px solid ${T.border}`, margin: "18px 0" }} />}
                      {/* Author line */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "linear-gradient(135deg,#1d4ed8,#0e7490)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 9, color: "#fff", flexShrink: 0 }}>
                          {initials(ev.actor_name)}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{ev.actor_name || "System"}</span>
                        <span style={{ fontSize: 11, color: T.muted }}>{fmtTs(ev.created_at)}</span>
                      </div>
                      {/* Content — no bubble, plain text */}
                      <div
                        style={{ fontSize: 13, lineHeight: 1.75, color: T.text, paddingLeft: 28 }}
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(ev.content) }}
                      />
                    </div>
                  ))}
                  <div ref={notesEndRef} />
                </div>

                {/* Note composer — always visible at bottom */}
                <div style={{ padding: "12px 22px 16px", borderTop: `1px solid ${T.border}`, flexShrink: 0, background: T.surface }}>
                  <div style={{ flex: 1 }}>
                      <textarea
                        value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                        placeholder="Add a note, paste command output, share analysis… (Markdown supported)"
                        style={{ width: "100%", padding: "9px 12px", fontSize: 12, fontFamily: "inherit", lineHeight: 1.6, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box", marginBottom: 8 }}
                        onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postNote(); }}
                      />
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
                        <span style={{ fontSize: 10, color: T.muted }}>⌘+Enter to post</span>
                        <button onClick={postNote} disabled={postingNote || !noteText.trim()}
                          style={{ padding: "7px 18px", fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", background: "#7c3aed", border: "none", color: "#fff", opacity: postingNote || !noteText.trim() ? 0.6 : 1 }}>
                          {postingNote ? "Posting…" : "Post note"}
                        </button>
                      </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── LOG TAB ─────────────────────────────────────────────────────── */}
            {activeTab === "log" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
                {logEvents.length === 0 && (
                  <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>No events yet.</div>
                )}

                {/* Human-originated events — more prominent */}
                {humanEvents.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: "0.7px", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>Operator Actions</span>
                      <span style={{ flex: 1, height: 1, background: T.border }} />
                    </div>
                    {humanEvents.map(ev => {
                      const meta = EVENT_META[ev.event_type] || { icon: "•", color: T.muted };
                      return (
                        <div key={ev.id} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                          <Avatar name={ev.actor_name} size={28} />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{ev.actor_name}</span>
                              <span style={{ fontSize: 9, color: meta.color, fontWeight: 700, background: `${meta.color}12`, border: `1px solid ${meta.color}30`, padding: "1px 6px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.4px" }}>{ev.event_type.replace(/_/g, " ")}</span>
                              <span style={{ fontSize: 10, color: T.muted, marginLeft: "auto" }}>{fmtTs(ev.created_at)}</span>
                            </div>
                            {ev.content && <div style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }}>{ev.content}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Automated Actions — robots/scripts, prominent + pre-wrap */}
                {automationEvents.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: "#0369a1", letterSpacing: "0.7px", textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>Automated Actions</span>
                      <span style={{ flex: 1, height: 1, background: "#bae6fd" }} />
                    </div>
                    {automationEvents.map(ev => {
                      const meta = ev.metadata || {};
                      return (
                        <div key={ev.id} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                          <div style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, background: "#e0f2fe", border: "1px solid #38bdf8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>
                            🤖
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{ev.actor_name}</span>
                              <span style={{ fontSize: 10, color: T.muted, marginLeft: "auto" }}>{fmtTs(ev.created_at)}</span>
                            </div>
                            {ev.content && (
                              <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderLeft: "4px solid #38bdf8", borderRadius: 6, padding: "10px 14px", fontSize: 12, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono','Fira Mono',monospace" }}>
                                {ev.content}
                              </div>
                            )}
                            {(meta.source || meta.node || meta.workflow_id) && (
                              <div style={{ display: "flex", gap: 6, marginTop: 7, flexWrap: "wrap" }}>
                                {meta.source && <span style={{ fontSize: 10, fontWeight: 600, color: "#0369a1", background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: 4, padding: "2px 7px" }}>{meta.source}</span>}
                                {meta.node && <span style={{ fontSize: 10, fontWeight: 600, color: "#334155", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 4, padding: "2px 7px" }}>{meta.node}</span>}
                                {meta.workflow_id && <span style={{ fontSize: 10, fontWeight: 600, color: "#6b21a8", background: "#faf5ff", border: "1px solid #d8b4fe", borderRadius: 4, padding: "2px 7px" }}>{meta.workflow_id}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* System events — compact, muted */}
                {systemEvents.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.muted, letterSpacing: "0.7px", textTransform: "uppercase", marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                      <span>System Events</span>
                      <span style={{ flex: 1, height: 1, background: T.border }} />
                    </div>
                    {systemEvents.map(ev => {
                      const meta = EVENT_META[ev.event_type] || { icon: "•", color: T.muted };
                      return (
                        <div key={ev.id} style={{ display: "flex", gap: 10, marginBottom: 8, opacity: 0.75 }}>
                          <div style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, background: `${meta.color}10`, border: `1px solid ${meta.color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: meta.color }}>
                            {meta.icon}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: T.muted }}>{ev.event_type.replace(/_/g, " ")}</span>
                              <span style={{ fontSize: 10, color: T.muted, marginLeft: "auto" }}>{fmtTs(ev.created_at)}</span>
                            </div>
                            {ev.content && <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5, marginTop: 1 }}>{ev.content}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── ATTACHMENTS TAB ──────────────────────────────────────────────── */}
            {activeTab === "attachments" && (
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 22px" }}>
                {evidence.length === 0 && (
                  <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic", marginBottom: 20 }}>No attachments yet.</div>
                )}
                {evidence.map(ev => (
                  <div key={ev.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", marginBottom: 8, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                    <span style={{ fontSize: 18 }}>{EVIDENCE_ICONS[ev.type] || "📎"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ev.url
                          ? <a href={ev.url} target="_blank" rel="noopener noreferrer" style={{ color: T.primary, textDecoration: "none" }}>{ev.label}</a>
                          : ev.label}
                      </div>
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{ev.type} · {ev.uploaded_by || "System"} · {timeAgo(ev.created_at)}</div>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: 20, padding: "16px 18px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: 12 }}>Add link</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)} placeholder="https://…"
                      style={{ flex: 2, padding: "8px 10px", fontSize: 12, fontFamily: "inherit", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, outline: "none" }}
                    />
                    <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)} placeholder="Label (optional)"
                      style={{ flex: 1, padding: "8px 10px", fontSize: 12, fontFamily: "inherit", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, outline: "none" }}
                    />
                    <button onClick={addLink} disabled={addingLink || !linkUrl.trim()}
                      style={{ padding: "8px 18px", fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", background: T.primary, border: "none", color: "#fff", opacity: addingLink || !linkUrl.trim() ? 0.6 : 1 }}>
                      {addingLink ? "…" : "Add"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CLOSURE MODAL ───────────────────────────────────────────────────── */}
      {closureModal && (
        <ClosureModal
          targetStatus={closureModal.targetStatus}
          onConfirm={async (fields) => {
            setClosureModal(null);
            await patchTicket({ status: closureModal.targetStatus, ...fields });
          }}
          onCancel={() => setClosureModal(null)}
        />
      )}
    </div>
  );
}
