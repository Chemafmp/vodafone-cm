import { useState, useEffect, useRef, useCallback } from "react";
import { T } from "../data/constants.js";
import {
  TICKET_COLORS, SEV_META, TICKET_STATUS_META, TICKET_TEAMS,
  fetchTicket, updateTicket, addTicketEvent, addTicketEvidence,
  slaCountdown,
} from "../utils/ticketsDb.js";

// ─── Simple markdown renderer (no external deps) ──────────────────────────────
function renderMarkdown(text) {
  if (!text) return "";
  let html = text
    // Escape HTML entities first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks (``` ... ```)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) =>
    `<pre style="background:#1e293b;color:#e2e8f0;padding:10px 14px;border-radius:6px;font-family:monospace;font-size:11px;overflow-x:auto;margin:6px 0;">${code.trim()}</pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g,
    `<code style="background:#f1f5f9;color:#1d4ed8;padding:1px 5px;border-radius:3px;font-family:monospace;font-size:0.92em;">$1</code>`
  );

  // Blockquote (> ...)
  html = html.replace(/^&gt; ?(.*)$/gm,
    `<blockquote style="border-left:3px solid #94a3b8;margin:4px 0;padding:2px 10px;color:#64748b;font-style:italic;">$1</blockquote>`
  );

  // Headings
  html = html.replace(/^### (.+)$/gm, `<h3 style="font-size:13px;font-weight:700;margin:10px 0 4px;color:#0f172a;">$1</h3>`);
  html = html.replace(/^## (.+)$/gm,  `<h2 style="font-size:14px;font-weight:700;margin:12px 0 5px;color:#0f172a;">$1</h2>`);
  html = html.replace(/^# (.+)$/gm,   `<h1 style="font-size:16px;font-weight:800;margin:14px 0 6px;color:#0f172a;">$1</h1>`);

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered lists — collect consecutive - lines
  html = html.replace(/((?:^- .+\n?)+)/gm, (block) => {
    const items = block.trim().split(/\n/).map(line =>
      `<li style="margin:2px 0;">${line.replace(/^- /, "")}</li>`
    ).join("");
    return `<ul style="margin:6px 0;padding-left:18px;">${items}</ul>`;
  });

  // Paragraph breaks (blank lines)
  html = html.replace(/\n\n+/g, "</p><p style='margin:6px 0;'>");
  html = `<p style="margin:6px 0;">${html}</p>`;
  // Single newlines inside paragraphs → <br>
  html = html.replace(/(?<!\>)\n(?!\<)/g, "<br>");

  return html;
}

// ─── Event type icons & colors ─────────────────────────────────────────────────
const EVENT_META = {
  created:          { icon: "✦", color: "#7c3aed" },
  status_change:    { icon: "⇄", color: "#0891b2" },
  assignment:       { icon: "👤", color: "#8b5cf6" },
  note:             { icon: "💬", color: "#374151" },
  alarm_linked:     { icon: "🔔", color: "#b45309" },
  alarm_resolved:   { icon: "✓", color: "#15803d" },
  evidence_added:   { icon: "📎", color: "#1d4ed8" },
  updated:          { icon: "✎", color: "#64748b" },
};

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

const EVIDENCE_ICONS = { attachment: "📄", snapshot: "📸", link: "🔗", alarm_ref: "🔔", change_ref: "📋" };

// ─── SLA Timer ────────────────────────────────────────────────────────────────
function SlaTimer({ ticket }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const info = slaCountdown(ticket, now);
  if (!info) return null;

  return (
    <div style={{
      background: info.breached ? "#fef2f2" : info.pct >= 0.75 ? "#fffbeb" : "#f0fdf4",
      border: `1px solid ${info.color}44`,
      borderRadius: 8, padding: "10px 14px", marginBottom: 14,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", marginBottom: 4 }}>SLA</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: info.color, fontFamily: "monospace", marginBottom: 6 }}>{info.label}</div>
      <div style={{ height: 6, background: "#e2e8f0", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          width: `${Math.min(100, info.pct * 100)}%`, height: "100%",
          background: info.color, borderRadius: 3, transition: "width 1s linear",
        }} />
      </div>
    </div>
  );
}

// ─── Inline editable field ────────────────────────────────────────────────────
function InlineEdit({ value, onSave, style = {}, placeholder = "Click to edit..." }) {
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
      style={{ cursor: "pointer", borderBottom: `1px dashed ${T.border}`, ...style }}>
      {value || <span style={{ color: T.muted, fontStyle: "italic" }}>{placeholder}</span>}
    </span>
  );

  return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onBlur={finish} onKeyDown={e => e.key === "Enter" && finish()}
      style={{
        fontSize: "inherit", fontWeight: "inherit", fontFamily: "inherit", color: "inherit",
        background: T.bg, border: `1px solid ${T.primary}`, borderRadius: 4,
        padding: "2px 6px", outline: "none", width: "100%", ...style,
      }}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function TicketDetailView({ ticket: initialTicket, currentUser, onClose, onUpdated }) {
  const [ticket, setTicket] = useState(initialTicket);
  const [events, setEvents] = useState(initialTicket.events || []);
  const [evidence, setEvidence] = useState(initialTicket.evidence || []);
  const [descMode, setDescMode] = useState("preview");
  const [noteText, setNoteText] = useState("");
  const [postingNote, setPostingNote] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [addingLink, setAddingLink] = useState(false);
  const [copying, setCopying] = useState(false);
  const [saving, setSaving] = useState(false);
  const timelineRef = useRef();

  // Scroll timeline to bottom
  useEffect(() => {
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [events]);

  // Refresh ticket from API
  const refresh = useCallback(async () => {
    try {
      const data = await fetchTicket(ticket.id);
      setTicket(data);
      setEvents(data.events || []);
      setEvidence(data.evidence || []);
    } catch { /* ignore */ }
  }, [ticket.id]);

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
      setLinkUrl("");
      setLinkLabel("");
      await refresh();
    } catch (e) {
      console.error("add link failed:", e.message);
    } finally {
      setAddingLink(false);
    }
  }

  function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}#ticket=${ticket.id}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    }).catch(() => {});
  }

  const tc = TICKET_COLORS[ticket.type] || TICKET_COLORS.incident;
  const sev = ticket.severity ? SEV_META[ticket.severity] : null;
  const statusMeta = TICKET_STATUS_META[ticket.status] || { label: ticket.status, color: T.muted };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 900, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "stretch",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        marginLeft: "auto", width: "90%", maxWidth: 1100, background: T.bg,
        display: "flex", flexDirection: "column", height: "100%", boxShadow: "-8px 0 40px rgba(0,0,0,0.2)",
      }}>
        {/* Topbar */}
        <div style={{
          padding: "14px 24px", background: T.surface, borderBottom: `1px solid ${T.border}`,
          display: "flex", alignItems: "center", gap: 14, flexShrink: 0,
        }}>
          <span style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 800, color: T.text }}>{ticket.id}</span>
          {/* Type pill */}
          <span style={{
            fontSize: 10, fontWeight: 800, color: tc.text, background: tc.bg,
            border: `1px solid ${tc.border}`, borderRadius: 5, padding: "2px 8px", letterSpacing: "0.4px",
          }}>{ticket.type.toUpperCase()}</span>
          {/* Sev pill */}
          {sev && (
            <span style={{
              fontSize: 10, fontWeight: 800, color: sev.color, background: sev.bg,
              border: `1px solid ${sev.border}`, borderRadius: 5, padding: "2px 8px", letterSpacing: "0.4px",
            }}>{sev.label}</span>
          )}
          {/* Status dropdown */}
          <select value={ticket.status} disabled={saving}
            onChange={e => patchTicket({ status: e.target.value })}
            style={{
              padding: "4px 8px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: "pointer",
              border: `1px solid ${statusMeta.color}44`, background: `${statusMeta.color}11`,
              color: statusMeta.color, fontFamily: "inherit", outline: "none",
            }}>
            {Object.entries(TICKET_STATUS_META).map(([v, m]) => (
              <option key={v} value={v}>{m.label}</option>
            ))}
          </select>

          <button onClick={copyLink}
            style={{
              padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
              background: "transparent", border: `1px solid ${T.border}`, color: copying ? "#15803d" : T.muted, fontFamily: "inherit",
            }}>
            {copying ? "✓ Copied!" : "Copy link"}
          </button>
          <div style={{ marginLeft: "auto" }}>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.muted, cursor: "pointer", padding: "2px 8px" }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* LEFT — 60% */}
          <div style={{ flex: 3, overflowY: "auto", padding: "24px 28px", borderRight: `1px solid ${T.border}` }}>

            {/* Title */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: "0.5px", textTransform: "uppercase" }}>Title</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text, lineHeight: 1.3 }}>
                <InlineEdit
                  value={ticket.title}
                  onSave={v => patchTicket({ title: v })}
                  style={{ fontSize: 18, fontWeight: 800 }}
                />
              </div>
            </div>

            {/* SLA Timer */}
            <SlaTimer ticket={ticket} />

            {/* Owner / Team row */}
            <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 4, letterSpacing: "0.5px", textTransform: "uppercase" }}>Owner</div>
                <InlineEdit
                  value={ticket.owner_name || ""}
                  onSave={v => patchTicket({ owner_name: v })}
                  style={{ fontSize: 13 }}
                  placeholder="Unassigned"
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 4, letterSpacing: "0.5px", textTransform: "uppercase" }}>Team</div>
                <select value={ticket.team || "Core Transport"} disabled={saving}
                  onChange={e => patchTicket({ team: e.target.value })}
                  style={{
                    padding: "3px 6px", fontSize: 12, borderRadius: 5, cursor: "pointer",
                    border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontFamily: "inherit", outline: "none",
                  }}>
                  {TICKET_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 4, letterSpacing: "0.5px", textTransform: "uppercase" }}>Created</div>
                <div style={{ fontSize: 12, color: T.text }}>{fmtTs(ticket.created_at)}</div>
              </div>
            </div>

            {/* Impacted Nodes */}
            {(ticket.impacted_nodes?.length > 0) && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: "0.5px", textTransform: "uppercase" }}>Impacted Nodes</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ticket.impacted_nodes.map(n => (
                    <span key={n} style={{
                      fontSize: 11, fontFamily: "monospace", fontWeight: 700,
                      background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626",
                      padding: "3px 8px", borderRadius: 5,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ef4444", display: "inline-block", marginRight: 5, verticalAlign: "middle" }} />
                      {n}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Impacted Services */}
            {(ticket.impacted_services?.length > 0) && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: "0.5px", textTransform: "uppercase" }}>Impacted Services</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {ticket.impacted_services.map(s => (
                    <span key={s} style={{
                      fontSize: 11, background: T.bg, border: `1px solid ${T.border}`, color: T.text,
                      padding: "3px 8px", borderRadius: 5,
                    }}>{s}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, letterSpacing: "0.5px", textTransform: "uppercase" }}>Description</div>
                <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
                  {["edit","preview"].map(m => (
                    <button key={m} onClick={() => setDescMode(m)}
                      style={{
                        padding: "3px 10px", fontSize: 10, fontWeight: 700, borderRadius: 5, cursor: "pointer", fontFamily: "inherit",
                        background: descMode === m ? T.primary : "transparent",
                        border: `1px solid ${descMode === m ? T.primary : T.border}`,
                        color: descMode === m ? "#fff" : T.muted, textTransform: "capitalize",
                      }}>{m}</button>
                  ))}
                </div>
              </div>
              {descMode === "edit" ? (
                <textarea
                  value={ticket.description || ""} rows={8}
                  onChange={e => setTicket(t => ({ ...t, description: e.target.value }))}
                  onBlur={e => patchTicket({ description: e.target.value })}
                  placeholder="Describe the issue... (supports **markdown**)"
                  style={{
                    width: "100%", padding: "10px 12px", fontSize: 12, fontFamily: "monospace", lineHeight: 1.7,
                    background: "#1e293b", color: "#e2e8f0", border: "none", borderRadius: 8,
                    outline: "none", resize: "vertical", boxSizing: "border-box", minHeight: 200,
                  }}
                />
              ) : (
                <div
                  style={{
                    background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
                    padding: "12px 16px", minHeight: 80, fontSize: 13, lineHeight: 1.7, color: T.text,
                  }}
                  dangerouslySetInnerHTML={{ __html: ticket.description ? renderMarkdown(ticket.description) : `<span style="color:${T.muted};font-style:italic;">No description — click Edit to add one.</span>` }}
                />
              )}
            </div>

            {/* Evidence */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, marginBottom: 10, letterSpacing: "0.5px", textTransform: "uppercase" }}>Evidence</div>
              {evidence.length === 0 && (
                <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic", marginBottom: 10 }}>No evidence attached yet.</div>
              )}
              {evidence.map(ev => (
                <div key={ev.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 6,
                  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8,
                }}>
                  <span style={{ fontSize: 16 }}>{EVIDENCE_ICONS[ev.type] || "📎"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.url ? <a href={ev.url} target="_blank" rel="noopener noreferrer" style={{ color: T.primary, textDecoration: "none" }}>{ev.label}</a> : ev.label}
                    </div>
                    <div style={{ fontSize: 10, color: T.muted }}>{ev.type} · {ev.uploaded_by || "System"} · {timeAgo(ev.created_at)}</div>
                  </div>
                </div>
              ))}

              {/* Add link form */}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input value={linkUrl} onChange={e => setLinkUrl(e.target.value)}
                  placeholder="https://..."
                  style={{
                    flex: 2, padding: "7px 10px", fontSize: 11, fontFamily: "inherit",
                    background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, outline: "none",
                  }}
                />
                <input value={linkLabel} onChange={e => setLinkLabel(e.target.value)}
                  placeholder="Label (optional)"
                  style={{
                    flex: 1, padding: "7px 10px", fontSize: 11, fontFamily: "inherit",
                    background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, outline: "none",
                  }}
                />
                <button onClick={addLink} disabled={addingLink || !linkUrl.trim()}
                  style={{
                    padding: "7px 14px", fontSize: 11, fontWeight: 700, borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                    background: "#1d4ed8", border: "none", color: "#fff", opacity: addingLink || !linkUrl.trim() ? 0.6 : 1,
                  }}>
                  {addingLink ? "…" : "Add Link"}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT — 40% timeline */}
          <div style={{ flex: 2, display: "flex", flexDirection: "column", overflow: "hidden", background: T.surface }}>
            <div style={{ padding: "16px 20px 10px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Timeline</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Chronological activity log</div>
            </div>

            {/* Events list */}
            <div ref={timelineRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px" }}>
              {events.length === 0 && (
                <div style={{ fontSize: 12, color: T.muted, fontStyle: "italic", padding: "20px 0" }}>No events yet.</div>
              )}
              {events.map(ev => {
                const meta = EVENT_META[ev.event_type] || { icon: "•", color: T.muted };
                return (
                  <div key={ev.id} style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                      background: `${meta.color}15`, border: `1px solid ${meta.color}44`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, color: meta.color,
                    }}>{meta.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{ev.actor_name || "System"}</span>
                        <span style={{ fontSize: 9, color: T.muted, fontWeight: 600, background: T.bg, border: `1px solid ${T.border}`, padding: "1px 5px", borderRadius: 3, textTransform: "uppercase", letterSpacing: "0.3px" }}>{ev.event_type.replace(/_/g, " ")}</span>
                        <span style={{ fontSize: 10, color: T.muted, marginLeft: "auto" }}>{timeAgo(ev.created_at)}</span>
                      </div>
                      {ev.content && (
                        ev.event_type === "note" ? (
                          <div
                            style={{
                              background: "#f8fafc", border: `1px solid ${T.border}`, borderRadius: 7,
                              padding: "8px 12px", fontSize: 12, lineHeight: 1.6, color: T.text,
                            }}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(ev.content) }}
                          />
                        ) : (
                          <div style={{ fontSize: 12, color: T.muted, marginTop: 1 }}>{ev.content}</div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add note */}
            <div style={{ padding: "12px 16px", borderTop: `1px solid ${T.border}`, flexShrink: 0, background: T.surface }}>
              <textarea
                value={noteText} onChange={e => setNoteText(e.target.value)} rows={3}
                placeholder="Add a note… (supports **markdown**)"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: "inherit", lineHeight: 1.6,
                  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text,
                  outline: "none", resize: "none", boxSizing: "border-box", marginBottom: 8,
                }}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) postNote(); }}
              />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button onClick={postNote} disabled={postingNote || !noteText.trim()}
                  style={{
                    padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                    background: "#7c3aed", border: "none", color: "#fff",
                    opacity: postingNote || !noteText.trim() ? 0.6 : 1,
                  }}>
                  {postingNote ? "Posting…" : "Post note"}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
