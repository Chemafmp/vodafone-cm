import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../data/constants.js";
import {
  TICKET_COLORS, SEV_META, TICKET_STATUS_META, TICKET_TEAMS,
  fetchTicket, updateTicket, addTicketEvent, addTicketEvidence, deleteTicketEvidence,
  fetchTicketChildren, slaCountdown,
} from "../utils/ticketsDb.js";
import { uploadEvidenceFile, deleteEvidenceFile } from "../utils/db.js";
import CreateTicketModal from "./CreateTicketModal.jsx";

// ─── Lightweight Markdown renderer (bold, inline code, lists) ─────────────────
function renderMd(text) {
  if (!text) return null;
  const fmt = (str) =>
    str.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((t, i) => {
      if (t.startsWith("**") && t.endsWith("**")) return <strong key={i}>{t.slice(2, -2)}</strong>;
      if (t.startsWith("`") && t.endsWith("`")) return <code key={i} style={{ background: "#f1f5f9", borderRadius: 3, padding: "0 3px", fontFamily: "monospace", fontSize: "0.92em" }}>{t.slice(1, -1)}</code>;
      return t;
    });
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^[-*] /.test(line)) {
      const items = [];
      while (i < lines.length && /^[-*] /.test(lines[i])) items.push(<li key={i}>{fmt(lines[i++].slice(2))}</li>);
      out.push(<ul key={`u${i}`} style={{ margin: "2px 0 6px", paddingLeft: 18 }}>{items}</ul>);
    } else if (/^\d+\. /.test(line)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(<li key={i}>{fmt(lines[i++].replace(/^\d+\. /, ""))}</li>);
      out.push(<ol key={`o${i}`} style={{ margin: "2px 0 6px", paddingLeft: 18 }}>{items}</ol>);
    } else if (line.trim() === "") {
      out.push(<div key={i++} style={{ height: 5 }} />);
    } else {
      out.push(<div key={i++} style={{ marginBottom: 1 }}>{fmt(line)}</div>);
    }
  }
  return out;
}

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
  const [worklogText, setWorklogText] = useState("");
  const [postingWorklog, setPostingWorklog] = useState(false);
  const [postingNote, setPostingNote] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const [copying, setCopying]         = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700);
  const [railOpen, setRailOpen] = useState(false);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(initialTicket?.description || "");
  const [closureModal, setClosureModal] = useState(null);
  const [closeChildrenModal, setCloseChildrenModal] = useState(null); // { targetStatus, openChildren }
  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [createChildOpen, setCreateChildOpen] = useState(false);
  const notesEndRef = useRef();

  // Mobile detection
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

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

  // Load child tickets whenever the ticket ID is known
  useEffect(() => {
    if (!ticket?.id) return;
    setLoadingChildren(true);
    fetchTicketChildren(ticket.id)
      .then(c => setChildren(c))
      .catch(() => setChildren([]))
      .finally(() => setLoadingChildren(false));
  }, [ticket?.id]);

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

  async function patchTicket(updates, { force = false } = {}) {
    setSaving(true);
    try {
      const updated = await updateTicket(ticket.id, { ...updates, actor_name: currentUser?.name }, { force });
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
      const openChildren = children.filter(c => !["resolved","closed"].includes(c.status));
      if (openChildren.length > 0) {
        setCloseChildrenModal({ targetStatus: newStatus, openChildren });
      } else {
        setClosureModal({ targetStatus: newStatus });
      }
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

  async function postWorklog() {
    if (!worklogText.trim()) return;
    setPostingWorklog(true);
    try {
      await addTicketEvent(ticket.id, {
        event_type: "worklog",
        actor_name: currentUser?.name,
        actor_id: currentUser?.id,
        content: worklogText.trim(),
      });
      setWorklogText("");
      await refresh();
    } catch (e) {
      console.error("post worklog failed:", e.message);
    } finally {
      setPostingWorklog(false);
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

  async function handleFileUpload(files) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const publicUrl = await uploadEvidenceFile(ticket.id, file);
        await addTicketEvidence(ticket.id, {
          type: "attachment",
          label: file.name,
          url: publicUrl,
          metadata: { size: file.size, mime: file.type },
          uploaded_by: currentUser?.name,
        });
      }
      await refresh();
    } catch (e) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDeleteEvidence(ev) {
    if (!window.confirm(`Delete "${ev.label}"?`)) return;
    try {
      if (ev.type === "attachment" && ev.url) await deleteEvidenceFile(ev.url);
      await deleteTicketEvidence(ticket.id, ev.id);
      await refresh();
    } catch (e) {
      alert(`Delete failed: ${e.message}`);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#ticket=${ticket.id}`;
    navigator.clipboard.writeText(url).then(() => { setCopying(true); setTimeout(() => setCopying(false), 2000); }).catch(() => {});
  }

  function buildAiPrompt() {
    const ageMin = ticket.created_at
      ? Math.round((Date.now() - new Date(ticket.created_at)) / 60000)
      : null;
    const ageStr = ageMin != null
      ? ageMin < 60 ? `${ageMin}m ago` : `${Math.floor(ageMin / 60)}h ${ageMin % 60}m ago`
      : "unknown";

    const nodes = (ticket.impacted_nodes || []).join(", ") || "—";

    // Automation notes: full content (they are structured guides — never truncate)
    // Human worklog entries: last 4, capped at 600 chars each
    const autoNotes = worklogEvents
      .filter(e => e.event_type === "automation_note")
      .map(e => `[AUTO ${fmtTs(e.created_at)} — ${e.actor_name || "System"}]\n${e.content || ""}`)
      .join("\n\n");

    const humanWorklog = worklogEvents
      .filter(e => e.event_type !== "automation_note")
      .slice(-4)
      .map(e => `  - [${fmtTs(e.created_at)}] ${e.actor_name || "System"}: ${e.content?.slice(0, 600) || ""}`)
      .join("\n");

    const evidenceList = evidence.map(e =>
      `  - [${e.type}] ${e.label || e.url || ""}`)
      .join("\n");

    return `You are a NOC troubleshooting assistant. Help me diagnose and resolve this network incident quickly and accurately.

TICKET: ${ticket.id}
TYPE: ${ticket.type?.toUpperCase() || "INCIDENT"} | SEVERITY: ${ticket.severity?.toUpperCase() || "—"} | STATUS: ${ticket.status}
ALARM TYPE: ${ticket.alarm_type || "—"}
IMPACTED: ${nodes}
OPENED: ${ageStr}
TEAM: ${ticket.team || "—"}

INCIDENT DETAILS:
${ticket.description || ticket.title || "No description."}

${autoNotes ? `AUTOMATED ANALYSIS (BNOC system-generated, use as starting point):\n${autoNotes}` : ""}
${humanWorklog ? `\nENGINEER WORKLOG:\n${humanWorklog}` : ""}
${evidenceList ? `\nEVIDENCE:\n${evidenceList}` : ""}

---
RESPOND IN THIS EXACT FORMAT. English only. No prose. Max 15 lines total.

TOP CAUSES (ranked 1→3 by likelihood, one line each — include specific technical reason):

ACTIONS NOW (max 5 — be specific: exact URL, CLI command, or dashboard name):

KEY PREFIXES / IPs TO INVESTIGATE (list any specific prefixes, ASNs or IPs from the description worth checking first):

ESCALATE IF: (one line — specific threshold or condition)`;
  }

  function copyAiPrompt() {
    const prompt = buildAiPrompt();
    navigator.clipboard.writeText(prompt)
      .then(() => { setCopiedPrompt(true); setTimeout(() => setCopiedPrompt(false), 2500); })
      .catch(() => {});
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
  const notes = events.filter(e => e.event_type === "note");
  const worklogEvents = events.filter(e => e.event_type === "worklog" || e.event_type === "automation_note");
  const logEvents = events.filter(e => !["note", "worklog", "automation_note"].includes(e.event_type));
  const systemEvents = logEvents.filter(e => !e.actor_name || e.actor_name === "System");
  const humanEvents = logEvents.filter(e => e.actor_name && e.actor_name !== "System");
  const closureLabel = ticket.closure_code ? CLOSURE_CODES.find(c => c.value === ticket.closure_code)?.label : null;

  // ─── Created by ───────────────────────────────────────────────────────────
  const createdEvent = events.find(e => e.event_type === "created");
  const createdByActor = createdEvent?.actor_name || null;
  // source field is authoritative when present; fall back to event actor heuristic
  const isAutoCreated = ticket.source
    ? ticket.source === "alarm"
    : (!createdByActor || createdByActor === "System");

  // ─── Alarm lifecycle derived state ────────────────────────────────────────
  const isOpen = !["resolved", "closed"].includes(ticket.status);
  const alarmClearedEvents = events.filter(e => e.event_type === "alarm_resolved");
  const showAlarmClearedBanner = isOpen && alarmClearedEvents.length > 0 && ["sev1", "sev2"].includes(ticket.severity);
  const reopenedEvents = events.filter(e => e.event_type === "alarm_linked" && e.metadata?.reopened);
  const wasReopened = reopenedEvents.length > 0;
  const refireCount = events.filter(e => e.event_type === "alarm_linked" && e.metadata?.refire && !e.metadata?.reopened).length;

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
        {isMobile ? (
          <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            {/* Mobile row 1: back + ID + close */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px" }}>
              <button onClick={onClose}
                style={{ background: "none", border: "none", fontSize: 13, color: T.muted, cursor: "pointer", padding: "2px 4px", fontFamily: "inherit", flexShrink: 0 }}>
                {fullScreen ? "← Back" : "✕"}
              </button>
              <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 800, color: T.muted, flex: 1 }}>{ticket.id}</span>
              {sev && <span style={{ fontSize: 10, fontWeight: 800, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 5, padding: "2px 7px", flexShrink: 0 }}>{sev.label}</span>}
              <span style={{ fontSize: 10, fontWeight: 800, color: statusMeta.color, background: `${statusMeta.color}18`, border: `1px solid ${statusMeta.color}55`, borderRadius: 5, padding: "2px 7px", flexShrink: 0 }}>{statusMeta.label}</span>
            </div>
            {/* Mobile row 2: title */}
            <div style={{ padding: "0 14px 10px", fontSize: 14, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>
              {ticket.title}
            </div>
            {/* Mobile row 3: badges + details toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "0 14px 10px", overflowX: "auto" }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: tc.text, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 4, padding: "2px 6px", flexShrink: 0 }}>
                {ticket.type === "project" ? "REQUEST" : ticket.type.toUpperCase()}
              </span>
              <span style={{ fontSize: 9, fontWeight: 700, borderRadius: 4, padding: "2px 6px", flexShrink: 0,
                color: isAutoCreated ? "#b45309" : "#6366f1",
                background: isAutoCreated ? "#fffbeb" : "#eef2ff",
                border: `1px solid ${isAutoCreated ? "#fcd34d" : "#c7d2fe"}` }}>
                {isAutoCreated ? "🤖 Auto" : "👤 Manual"}
              </span>
              {ticket.team && <span style={{ fontSize: 9, color: T.muted, flexShrink: 0 }}>👥 {ticket.team}</span>}
              <div style={{ flex: 1 }} />
              <button onClick={() => setRailOpen(v => !v)}
                style={{ fontSize: 11, fontWeight: 600, color: railOpen ? T.text : T.muted, background: railOpen ? T.border : "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
                {railOpen ? "Details ▲" : "Details ▼"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: "12px 20px", background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 800, color: T.muted, flexShrink: 0 }}>{ticket.id}</span>
            <span style={{ fontSize: 10, fontWeight: 800, color: tc.text, background: tc.bg, border: `1px solid ${tc.border}`, borderRadius: 5, padding: "2px 8px", flexShrink: 0 }}>
              {ticket.type === "project" ? "REQUEST" : ticket.type.toUpperCase()}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "2px 8px", flexShrink: 0,
              color: isAutoCreated ? "#b45309" : "#6366f1",
              background: isAutoCreated ? "#fffbeb" : "#eef2ff",
              border: `1px solid ${isAutoCreated ? "#fcd34d" : "#c7d2fe"}` }}>
              {isAutoCreated ? "🤖 Auto" : "👤 Manual"}
            </span>
            {sev && (
              <span style={{ fontSize: 10, fontWeight: 800, color: sev.color, background: sev.bg, border: `1px solid ${sev.border}`, borderRadius: 5, padding: "2px 8px", flexShrink: 0 }}>
                {sev.label}
              </span>
            )}
            {refireCount > 0 && (
              <span title={`${refireCount} re-fire${refireCount > 1 ? "s" : ""} since ticket opened`}
                style={{ fontSize: 10, fontWeight: 700, color: "#b45309", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 5, padding: "2px 8px", flexShrink: 0, cursor: "default" }}>
                ↺ {refireCount}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 700, color: T.text }}>
              <InlineEdit value={ticket.title} onSave={v => patchTicket({ title: v })}
                style={{ fontSize: 15, fontWeight: 700, color: T.text, borderBottom: "1px dashed " + T.border }}
                placeholder="Untitled ticket" />
            </div>
            {saving && <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>saving…</span>}
            <button onClick={copyLink}
              style={{ padding:"5px 11px", fontSize:11, fontWeight:600, borderRadius:6, cursor:"pointer", background:"transparent", border:`1px solid ${T.border}`, color: copying ? "#15803d" : T.muted, fontFamily:"inherit", flexShrink:0 }}>
              {copying ? "✓ Copied!" : "🔗 Copy link"}
            </button>
            {fullScreen
              ? <button onClick={onClose}
                  style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", fontSize:12, fontWeight:600, borderRadius:7, cursor:"pointer", background:"transparent", border:`1px solid ${T.border}`, color:T.muted, fontFamily:"inherit", flexShrink:0 }}>
                  ← Back to Tickets
                </button>
              : <button onClick={onClose}
                  style={{ background:"none", border:"none", fontSize:20, color:T.muted, cursor:"pointer", padding:"2px 6px", lineHeight:1, flexShrink:0 }}>✕</button>
            }
          </div>
        )}

        {/* ── ALARM LIFECYCLE BANNERS ─────────────────────────────────────── */}
        {showAlarmClearedBanner && (
          <div style={{ padding: "8px 20px", background: "#fffbeb", borderBottom: "1px solid #fcd34d", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 14 }}>⚡</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#b45309" }}>
              Underlying alarm has cleared — this ticket requires manual resolution.
            </span>
          </div>
        )}
        {wasReopened && (
          <div style={{ padding: "8px 20px", background: "#fef2f2", borderBottom: "1px solid #fca5a5", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 14 }}>🔁</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#dc2626" }}>
              Ticket reopened — same alarm re-fired within 2h of being closed.
            </span>
          </div>
        )}

        {/* ── PARENT LINK BANNER ──────────────────────────────────────────── */}
        {ticket.parent_id && (
          <div style={{ padding: "6px 20px", background: "#f0f9ff", borderBottom: "1px solid #bae6fd", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: "#0369a1" }}>↑</span>
            <span style={{ fontSize: 11, color: "#0369a1" }}>
              Child of{" "}
              <button
                onClick={() => window.open(`${window.location.pathname}#ticket=${ticket.parent_id}`, "_blank")}
                style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: "#0369a1", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
                {ticket.parent_id}
              </button>
            </span>
          </div>
        )}

        {/* ── BODY ────────────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", overflow: "hidden" }}>

          {/* ── LEFT RAIL (dark, sidebar-style) ───────────────────────────── */}
          <div style={{
            width: isMobile ? "100%" : 220,
            flexShrink: 0,
            overflowY: "auto",
            padding: isMobile ? "12px 14px" : "16px 14px",
            borderRight: isMobile ? "none" : `1px solid ${T.sidebarBorder}`,
            borderBottom: isMobile ? `1px solid ${T.sidebarBorder}` : "none",
            background: T.sidebar,
            display: isMobile && !railOpen ? "none" : "flex",
            flexDirection: "column",
            gap: isMobile ? 10 : 14,
            maxHeight: isMobile ? 340 : "none",
          }}>
            {/* Status */}
            <RailField label="Status">
              <select value={ticket.status} disabled={saving}
                onChange={e => handleStatusChange(e.target.value)}
                style={{ ...railSelectStyle, fontWeight: 700, color: statusMeta.color, background: `${statusMeta.color}18`, border: `1px solid ${statusMeta.color}55` }}>
                {Object.entries(TICKET_STATUS_META).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </select>
            </RailField>

            {/* Severity */}
            <RailField label="Severity">
              <select value={ticket.severity || ""} disabled={saving}
                onChange={e => patchTicket({ severity: e.target.value })}
                style={{ ...railSelectStyle, fontWeight: 700, color: sev?.color || T.sidebarMuted, background: sev ? `${sev.color}18` : "transparent", border: `1px solid ${sev ? sev.color + "55" : "rgba(255,255,255,0.1)"}` }}>
                {Object.entries(SEV_META).map(([v, m]) => (
                  <option key={v} value={v}>{m.label}</option>
                ))}
              </select>
            </RailField>

            <RailDivider />
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

            {/* Created */}
            <RailField label="Created">
              <span style={{ fontSize: 11, color: T.sidebarMuted }}>{fmtTs(ticket.created_at)}</span>
            </RailField>

            {/* Created by */}
            <RailField label="Created by">
              {isAutoCreated ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13 }}>🤖</span>
                  <span style={{ fontSize: 11, color: T.sidebarMuted }}>BNOC Alarm Engine</span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                    {createdByActor[0].toUpperCase()}
                  </div>
                  <span style={{ fontSize: 11, color: T.sidebarText }}>{createdByActor}</span>
                </div>
              )}
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

            {ticket.resolved_at && (
              <RailField label="Resolved">
                <span style={{ fontSize: 11, color: T.sidebarMuted }}>{fmtTs(ticket.resolved_at)}</span>
              </RailField>
            )}
          </div>

          {/* ── RIGHT — TABS + CONTENT ─────────────────────────────────────── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

            {/* ── TABS ──────────────────────────────────────────────────────── */}
            <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: T.surface, overflowX: "auto" }}>
              {[
                { key: "work",        label: isMobile ? `Work` : `Work (${notes.length})` },
                { key: "worklog",     label: isMobile ? `Worklog` : `Worklog (${worklogEvents.length})`, count: worklogEvents.length },
                { key: "log",         label: isMobile ? `Log` : `Log (${logEvents.length})` },
                { key: "attachments", label: isMobile ? `Files` : `Attachments (${evidence.length})` },
                { key: "children",    label: isMobile ? `Children` : `Children (${children.length})`, dot: children.filter(c => !["resolved","closed"].includes(c.status)).length > 0 },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  style={{
                    padding: isMobile ? "10px 14px" : "12px 20px",
                    fontSize: isMobile ? 11 : 12,
                    fontWeight: activeTab === tab.key ? 700 : 400,
                    color: activeTab === tab.key ? T.primary : T.muted,
                    background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit",
                    borderBottom: `2px solid ${activeTab === tab.key ? T.primary : "transparent"}`,
                    marginBottom: -1, transition: "color 0.15s", display: "flex", alignItems: "center", gap: 4,
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                  {tab.label}
                  {isMobile && tab.count > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: T.primary, background: `${T.primary}18`, borderRadius: 8, padding: "0 4px" }}>{tab.count}</span>}
                  {tab.dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />}
                </button>
              ))}
            </div>

            {/* ── WORK TAB ───────────────────────────────────────────────────── */}
            {activeTab === "work" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

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

            {/* ── WORKLOG TAB ─────────────────────────────────────────────────── */}
            {activeTab === "worklog" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Entries */}
                <div style={{ flex: 1, overflowY: "auto", padding: isMobile ? "10px 12px" : "16px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {worklogEvents.length === 0 && (
                    <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>No worklog entries yet. Paste command outputs, quick notes, or automation results here.</div>
                  )}
                  {worklogEvents.map(ev => {
                    const isAuto = ev.event_type === "automation_note";
                    return (
                      <div key={ev.id} style={{
                        borderRadius: 8,
                        border: isAuto ? "1px solid #38bdf8" : `1px solid ${T.border}`,
                        borderLeft: isAuto ? "4px solid #38bdf8" : `4px solid ${T.border}`,
                        background: isAuto ? "#f0f9ff" : T.surface,
                        overflow: "hidden",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderBottom: `1px solid ${isAuto ? "#bae6fd" : T.border}`, background: isAuto ? "#e0f2fe" : T.bg }}>
                          <span style={{ fontSize: 12 }}>{isAuto ? "🤖" : "📋"}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, color: isAuto ? "#0369a1" : T.muted }}>
                            {isAuto ? (ev.metadata?.source || "Automation") : (ev.actor_name || "System")}
                          </span>
                          {isAuto && ev.metadata?.workflow_id && (
                            <span style={{ fontSize: 10, color: "#0ea5e9", background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: 4, padding: "1px 5px" }}>{ev.metadata.workflow_id}</span>
                          )}
                          {isAuto && ev.metadata?.node && (
                            <span style={{ fontSize: 10, fontFamily: "monospace", color: "#0369a1", background: "#e0f2fe", border: "1px solid #bae6fd", borderRadius: 4, padding: "1px 5px" }}>{ev.metadata.node}</span>
                          )}
                          <span style={{ fontSize: 10, color: T.muted, marginLeft: "auto" }}>{fmtTs(ev.created_at)}</span>
                        </div>
                        <div style={{ margin: 0, padding: "10px 14px", fontSize: 11, lineHeight: 1.6, color: isAuto ? "#0c4a6e" : T.text }}>
                          {renderMd(ev.content)}
                        </div>
                        {isAuto && (
                          <div style={{ padding: "6px 14px 10px", display: "flex", justifyContent: "flex-end" }}>
                            <button
                              onClick={copyAiPrompt}
                              title="Copy a structured AI prompt with all ticket context — paste into Claude, ChatGPT, etc."
                              style={{
                                display: "flex", alignItems: "center", gap: 5,
                                padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 6,
                                cursor: "pointer", fontFamily: "inherit", transition: "all 0.2s",
                                background: copiedPrompt ? "#f0fdf4" : "#e0f2fe",
                                border: `1px solid ${copiedPrompt ? "#86efac" : "#bae6fd"}`,
                                color: copiedPrompt ? "#15803d" : "#0369a1",
                              }}>
                              {copiedPrompt ? "✓ Prompt copied!" : "🤖 Copy AI Prompt"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Input */}
                <div style={{ flexShrink: 0, padding: isMobile ? "8px 12px" : "12px 22px", borderTop: `1px solid ${T.border}`, background: T.surface }}>
                  <textarea
                    value={worklogText}
                    onChange={e => setWorklogText(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postWorklog(); }}
                    placeholder="Paste command output, quick note, diagnostic result… (Cmd+Enter to submit)"
                    rows={4}
                    style={{ width: "100%", padding: "8px 10px", fontSize: 11, fontFamily: "monospace", lineHeight: 1.6, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box" }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                    <button onClick={postWorklog} disabled={postingWorklog || !worklogText.trim()}
                      style={{ padding: "7px 20px", fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", background: "#374151", border: "none", color: "#fff", opacity: postingWorklog || !worklogText.trim() ? 0.5 : 1 }}>
                      {postingWorklog ? "…" : "Add entry"}
                    </button>
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
                      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{ev.type}{ev.metadata?.size ? ` · ${(ev.metadata.size / 1024).toFixed(0)} KB` : ""} · {ev.uploaded_by || "System"} · {timeAgo(ev.created_at)}</div>
                    </div>
                    <button onClick={() => handleDeleteEvidence(ev)} title="Delete"
                      style={{ flexShrink: 0, background: "none", border: "none", cursor: "pointer", fontSize: 14, color: T.muted, padding: "4px 6px", borderRadius: 5, lineHeight: 1 }}
                      onMouseEnter={e => e.currentTarget.style.color = "#dc2626"}
                      onMouseLeave={e => e.currentTarget.style.color = T.muted}>
                      ✕
                    </button>
                  </div>
                ))}

                {/* ── File upload zone ── */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={e => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
                  onClick={() => !uploading && fileInputRef.current?.click()}
                  style={{
                    marginTop: 20, padding: "22px 18px", textAlign: "center", cursor: uploading ? "wait" : "pointer",
                    background: dragOver ? `${T.primary}10` : T.surface,
                    border: `2px dashed ${dragOver ? T.primary : T.border}`,
                    borderRadius: 10, transition: "all 0.15s",
                  }}
                >
                  <input ref={fileInputRef} type="file" multiple hidden
                    onChange={e => handleFileUpload(e.target.files)}
                  />
                  <div style={{ fontSize: 22, marginBottom: 6 }}>{uploading ? "⏳" : "📁"}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: uploading ? T.muted : T.text }}>
                    {uploading ? "Uploading…" : "Drop files here or click to upload"}
                  </div>
                  <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                    PDF, images, text, CSV, JSON, XLSX, DOCX, ZIP · Max 10 MB
                  </div>
                  {uploadError && (
                    <div style={{ fontSize: 11, color: "#dc2626", marginTop: 8, fontWeight: 600 }}>{uploadError}</div>
                  )}
                </div>

                {/* ── Add link ── */}
                <div style={{ marginTop: 12, padding: "16px 18px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
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

            {/* ── CHILDREN TAB ──────────────────────────────────────────────── */}
            {activeTab === "children" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                {/* Header */}
                <div style={{ padding: "14px 22px 10px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>
                      {children.length === 0 ? "No child tickets" : `${children.filter(c => !["resolved","closed"].includes(c.status)).length} open · ${children.filter(c => ["resolved","closed"].includes(c.status)).length} closed`}
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Dependencies and sub-tasks tracked under this ticket</div>
                  </div>
                  <button onClick={() => setCreateChildOpen(true)}
                    style={{ padding: "7px 14px", fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", background: "#7c3aed", border: "none", color: "#fff" }}>
                    + Add child
                  </button>
                </div>
                {/* List */}
                <div style={{ flex: 1, overflowY: "auto", padding: "12px 22px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {loadingChildren && (
                    <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic" }}>Loading…</div>
                  )}
                  {!loadingChildren && children.length === 0 && (
                    <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic", textAlign: "center", padding: "32px 0" }}>
                      No child tickets yet.<br />
                      <span style={{ fontSize: 11 }}>Use "+ Add child" to track dependencies or sub-tasks with other teams.</span>
                    </div>
                  )}
                  {children.map(child => {
                    const cTC = TICKET_COLORS[child.type] || TICKET_COLORS.incident;
                    const cSev = child.severity ? SEV_META[child.severity] : null;
                    const cStatus = TICKET_STATUS_META[child.status] || { label: child.status, color: T.muted };
                    const isDone = ["resolved","closed"].includes(child.status);
                    return (
                      <div key={child.id}
                        onClick={() => window.open(`${window.location.pathname}#ticket=${child.id}`, "_blank")}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                          borderRadius: 8, cursor: "pointer", opacity: isDone ? 0.6 : 1,
                          border: `1px solid ${T.border}`, background: T.surface,
                          transition: "background 0.12s",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = T.bg}
                        onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3, flexShrink: 0 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 700, color: T.primary }}>{child.id}</span>
                          <span style={{ fontSize: 9, fontWeight: 800, color: cTC.text, background: cTC.bg, border: `1px solid ${cTC.border}`, borderRadius: 3, padding: "1px 5px", width: "fit-content" }}>
                            {child.type === "project" ? "REQUEST" : child.type.toUpperCase()}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{child.title}</div>
                          {child.team && <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{child.team}{child.owner_name ? ` · ${child.owner_name}` : ""}</div>}
                        </div>
                        {cSev && <span style={{ fontSize: 9, fontWeight: 700, color: cSev.color, background: cSev.bg, border: `1px solid ${cSev.border}`, borderRadius: 3, padding: "1px 6px", flexShrink: 0 }}>{cSev.label}</span>}
                        <span style={{ fontSize: 10, fontWeight: 700, color: cStatus.color, background: `${cStatus.color}14`, border: `1px solid ${cStatus.color}33`, borderRadius: 4, padding: "2px 8px", flexShrink: 0 }}>{cStatus.label}</span>
                        <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>↗</span>
                      </div>
                    );
                  })}
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
            await patchTicket({ status: closureModal.targetStatus, ...fields }, { force: true });
          }}
          onCancel={() => setClosureModal(null)}
        />
      )}

      {/* ── CLOSE WITH OPEN CHILDREN CONFIRMATION ───────────────────────────── */}
      {closeChildrenModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 28, width: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.5)", fontFamily: "'Inter','Segoe UI',sans-serif" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 8 }}>⚠️ Open child tickets</div>
            <div style={{ fontSize: 13, color: T.muted, marginBottom: 14, lineHeight: 1.6 }}>
              This ticket has <strong style={{ color: T.text }}>{closeChildrenModal.openChildren.length}</strong> open child ticket{closeChildrenModal.openChildren.length !== 1 ? "s" : ""}. These won't be closed automatically — close them if needed, or confirm below to continue.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20, maxHeight: 200, overflowY: "auto" }}>
              {closeChildrenModal.openChildren.map(c => {
                const cStatus = TICKET_STATUS_META[c.status] || { label: c.status, color: T.muted };
                return (
                  <div key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 10px", background: T.bg, borderRadius: 6 }}>
                    <span style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 700, color: T.primary, flexShrink: 0 }}>{c.id}</span>
                    <span style={{ fontSize: 11, color: T.text, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                    {c.team && <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>{c.team}</span>}
                    <span style={{ fontSize: 9, fontWeight: 700, color: cStatus.color, flexShrink: 0 }}>{cStatus.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setCloseChildrenModal(null)}
                style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", background: "transparent", border: `1px solid ${T.border}`, color: T.text }}>
                Cancel
              </button>
              <button onClick={() => { const ts = closeChildrenModal.targetStatus; setCloseChildrenModal(null); setClosureModal({ targetStatus: ts }); }}
                style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: "pointer", fontFamily: "inherit", background: "#dc2626", border: "none", color: "#fff" }}>
                Close anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE CHILD TICKET MODAL ────────────────────────────────────────── */}
      {createChildOpen && (
        <CreateTicketModal
          currentUser={currentUser}
          parentTicketId={ticket.id}
          prefill={{
            impacted_nodes: ticket.impacted_nodes || [],
            country: ticket.country,
            related_change_id: ticket.related_change_id,
          }}
          onClose={() => setCreateChildOpen(false)}
          onCreated={async (newTicket) => {
            setCreateChildOpen(false);
            // Reload children to show the new one
            const updated = await fetchTicketChildren(ticket.id).catch(() => children);
            setChildren(updated);
          }}
        />
      )}
    </div>
  );
}
