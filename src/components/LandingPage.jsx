import { T } from "../data/constants.js";

const APPS = [
  {
    id: "changes",
    icon: "🔄",
    label: "Change Management",
    desc: "Create, approve, execute and track network changes across all teams.",
    gradient: "linear-gradient(135deg,#e40000,#9b0000)",
    shadow: "rgba(228,0,0,0.35)",
  },
  {
    id: "monitoring",
    icon: "📡",
    label: "Monitoring",
    desc: "Live network status, alarms, events and observability dashboards.",
    gradient: "linear-gradient(135deg,#0e7490,#0891b2)",
    shadow: "rgba(14,116,144,0.35)",
  },
  {
    id: "network",
    icon: "🗺",
    label: "Network",
    desc: "Device inventory, topology map and network asset management.",
    gradient: "linear-gradient(135deg,#0f766e,#0d9488)",
    shadow: "rgba(15,118,110,0.35)",
  },
  {
    id: "tickets",
    icon: "🎫",
    label: "Ticketing",
    desc: "Incidents, problems, and projects. Track, investigate, and resolve with full timeline and evidence.",
    gradient: "linear-gradient(135deg,#7c3aed,#6d28d9)",
    shadow: "rgba(124,58,237,0.35)",
  },
];

export default function LandingPage({ onSelectApp, user }) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      background: T.bg, minHeight: "100vh", padding: 32,
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 48 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: "0 auto 18px",
          background: "linear-gradient(135deg,#e40000,#9b0000)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 28, color: "#fff", fontWeight: 900,
          boxShadow: "0 4px 20px rgba(228,0,0,0.4)",
        }}>B</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-0.5px" }}>
          Bodaphone Operations Centre
        </div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
          Welcome back, {user.name} — {user.role}, {user.team}
        </div>
      </div>

      {/* App cards */}
      <div style={{ display: "flex", gap: 24, maxWidth: 1100, flexWrap: "wrap", justifyContent: "center" }}>
        {APPS.map(app => (
          <button
            key={app.id}
            onClick={() => onSelectApp(app.id)}
            style={{
              flex: 1, padding: "32px 28px", borderRadius: 16,
              background: T.surface, border: `1px solid ${T.border}`,
              cursor: "pointer", fontFamily: "inherit", textAlign: "left",
              display: "flex", flexDirection: "column", gap: 16,
              transition: "transform 0.15s, box-shadow 0.15s",
              boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-4px)";
              e.currentTarget.style.boxShadow = `0 8px 30px ${app.shadow}`;
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: app.gradient,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 24, boxShadow: `0 3px 12px ${app.shadow}`,
            }}>{app.icon}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>{app.label}</div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>{app.desc}</div>
            </div>
            <div style={{
              marginTop: "auto", fontSize: 12, fontWeight: 600, color: T.primary,
              display: "flex", alignItems: "center", gap: 6,
            }}>
              Open <span style={{ fontSize: 14 }}>→</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
