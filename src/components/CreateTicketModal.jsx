import { useState } from "react";
import { T } from "../data/constants.js";
import { TICKET_TEAMS, TICKET_COLORS, createTicket } from "../utils/ticketsDb.js";

const TICKET_TYPES = [
  { value: "incident", icon: "🚨", label: "Incident", desc: "Service disruption or degradation requiring immediate action" },
  { value: "problem",  icon: "🔍", label: "Problem",  desc: "Root cause investigation for recurring or complex incidents" },
  { value: "project",  icon: "📋", label: "Request",  desc: "Team demand, planned work item, improvement, or network project" },
];

const SEVERITIES = ["sev1","sev2","sev3","sev4"];
const SEV_LABELS = { sev1: "SEV1 — Critical", sev2: "SEV2 — Major", sev3: "SEV3 — Minor", sev4: "SEV4 — Info" };
const SEV_COLORS = {
  sev1: { color: "#dc2626", bg: "#fef2f2", border: "#fca5a5" },
  sev2: { color: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  sev3: { color: "#0891b2", bg: "#ecfeff", border: "#67e8f9" },
  sev4: { color: "#6b7280", bg: "#f9fafb", border: "#d1d5db" },
};

export default function CreateTicketModal({ currentUser, onClose, onCreated, prefill = {} }) {
  const [type, setType] = useState(prefill.type || "incident");
  const [title, setTitle] = useState(prefill.title || "");
  const [severity, setSeverity] = useState(prefill.severity || "sev3");
  const [ownerName, setOwnerName] = useState(prefill.owner_name || currentUser?.name || "");
  const [team, setTeam] = useState(prefill.team || currentUser?.team || "Core Transport");
  const [nodes, setNodes] = useState((prefill.impacted_nodes || []).join(", "));
  const [description, setDescription] = useState(prefill.description || "");
  const [tags, setTags] = useState((prefill.tags || []).join(", "));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const ticket = await createTicket({
        type,
        title: title.trim(),
        severity: type === "incident" ? severity : undefined,
        owner_name: ownerName || undefined,
        team,
        description: description || undefined,
        impacted_nodes: nodes ? nodes.split(",").map(s => s.trim()).filter(Boolean) : [],
        tags: tags ? tags.split(",").map(s => s.trim()).filter(Boolean) : [],
        actor_name: currentUser?.name || "System",
      });
      onCreated(ticket);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: T.surface, borderRadius: 14, width: "100%", maxWidth: 580,
        boxShadow: "0 24px 64px rgba(0,0,0,0.2)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 24px 14px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>New Ticket</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>Create an incident, problem, or request ticket</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: T.muted, cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ padding: "20px 24px", maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}>

            {/* Type selection */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8, letterSpacing: "0.5px", textTransform: "uppercase" }}>Type</div>
              <div style={{ display: "flex", gap: 8 }}>
                {TICKET_TYPES.map(t => {
                  const active = type === t.value;
                  const col = TICKET_COLORS[t.value];
                  return (
                    <button key={t.value} type="button" onClick={() => setType(t.value)}
                      style={{
                        flex: 1, padding: "12px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit",
                        border: `2px solid ${active ? col.border : T.border}`,
                        background: active ? col.bg : T.bg,
                        textAlign: "left", display: "flex", flexDirection: "column", gap: 4, transition: "all 0.15s",
                      }}>
                      <div style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: active ? col.text : T.text }}>{t.label}</div>
                      <div style={{ fontSize: 10, color: T.muted, lineHeight: 1.4 }}>{t.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Title */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: "0.5px", textTransform: "uppercase" }}>Title *</label>
              <input
                value={title} onChange={e => setTitle(e.target.value)} required
                placeholder="Brief description of the issue or work item"
                style={{
                  width: "100%", padding: "9px 12px", fontSize: 13, fontFamily: "inherit",
                  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text,
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Severity — only for incidents */}
            {type === "incident" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: "0.5px", textTransform: "uppercase" }}>Severity</label>
                <div style={{ display: "flex", gap: 6 }}>
                  {SEVERITIES.map(s => {
                    const active = severity === s;
                    const col = SEV_COLORS[s];
                    return (
                      <button key={s} type="button" onClick={() => setSeverity(s)}
                        style={{
                          flex: 1, padding: "7px 6px", fontSize: 10, fontWeight: 700, borderRadius: 7, cursor: "pointer", fontFamily: "inherit",
                          border: `1px solid ${active ? col.border : T.border}`,
                          background: active ? col.bg : "transparent",
                          color: active ? col.color : T.muted,
                        }}>
                        {SEV_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Owner + Team */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: "0.5px", textTransform: "uppercase" }}>Owner</label>
                <input
                  value={ownerName} onChange={e => setOwnerName(e.target.value)}
                  placeholder="Name or leave blank"
                  style={{
                    width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: "inherit",
                    background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text,
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: "0.5px", textTransform: "uppercase" }}>Team</label>
                <select value={team} onChange={e => setTeam(e.target.value)}
                  style={{
                    width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: "inherit",
                    background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text,
                    outline: "none", cursor: "pointer",
                  }}>
                  {TICKET_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Impacted Nodes */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: "0.5px", textTransform: "uppercase" }}>Impacted Nodes</label>
              <input
                value={nodes} onChange={e => setNodes(e.target.value)}
                placeholder="fj-suva-cr-01, hw-hnl1-pe-01 (comma-separated)"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: "monospace",
                  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text,
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Description */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: "0.5px", textTransform: "uppercase" }}>Description</label>
              <textarea
                value={description} onChange={e => setDescription(e.target.value)} rows={4}
                placeholder="Optional — describe the issue, steps taken, impact..."
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: "inherit", lineHeight: 1.6,
                  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text,
                  outline: "none", resize: "vertical", boxSizing: "border-box",
                }}
              />
            </div>

            {/* Tags */}
            <div style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 5, letterSpacing: "0.5px", textTransform: "uppercase" }}>Tags</label>
              <input
                value={tags} onChange={e => setTags(e.target.value)}
                placeholder="bgp, core-router, planned (comma-separated)"
                style={{
                  width: "100%", padding: "8px 10px", fontSize: 12, fontFamily: "inherit",
                  background: T.bg, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text,
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>

            {error && (
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginTop: 12, fontSize: 12, color: "#dc2626" }}>
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={onClose} disabled={saving}
              style={{
                padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: "pointer",
                background: "transparent", border: `1px solid ${T.border}`, color: T.muted, fontFamily: "inherit",
              }}>
              Cancel
            </button>
            <button type="submit" disabled={saving || !title.trim()}
              style={{
                padding: "9px 18px", fontSize: 13, fontWeight: 700, borderRadius: 8, cursor: saving ? "not-allowed" : "pointer",
                background: saving || !title.trim() ? T.muted : "#7c3aed",
                border: "none", color: "#fff", fontFamily: "inherit", opacity: saving || !title.trim() ? 0.7 : 1,
              }}>
              {saving ? "Creating…" : "Create Ticket"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
