import { useState } from "react";
import { T, STATUS_META } from "../data/constants.js";
import { fmt } from "../utils/helpers.js";
import { Badge, RiskPill, FreezeTag, Btn, Card } from "./ui/index.jsx";

const TERMINAL = ["Completed","Failed","Aborted","Rolled Back","Off-Script"];

export default function MyWorkView({ user, crs, onSelect }) {
  const [filter, setFilter] = useState(null);

  const myChanges = crs.filter(c =>
    c.team === user.team || c.manager === user.name || c.director === user.name
  );
  const myUpcoming = myChanges
    .filter(c => !TERMINAL.includes(c.status))
    .sort((a, b) => new Date(a.scheduledFor || 0) - new Date(b.scheduledFor || 0));
  const myActionable = myUpcoming.filter(c => ["Scheduled", "In Execution"].includes(c.status));

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, letterSpacing: "-0.4px" }}>Good day, {user.name.split(" ")[0]} 👋</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 3 }}>{user.role} · {user.team} · {user.dept}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 16 }}>
        {[
          { fk: "all", label: "Assigned to me / team", value: myUpcoming.length, col: T.primary, icon: "📋" },
          { fk: "actionable", label: "Actionable now", value: myActionable.length, col: "#0e7490", icon: "⚡" },
          { fk: "pending", label: "Pending approval", value: myUpcoming.filter(c => c.status === "Pending Approval").length, col: "#b45309", icon: "⏳" },
          { fk: "frozen", label: "In freeze period", value: myUpcoming.filter(c => c.freezePeriod).length, col: T.freeze, icon: "❄" },
        ].map(s => {
          const active = filter === s.fk;
          return <Card key={s.fk} onClick={() => setFilter(f => f === s.fk ? null : s.fk)} style={{ borderTop: `3px solid ${s.col}`, padding: "16px 18px", cursor: "pointer", background: active ? `${s.col}18` : T.surface, outline: active ? `2px solid ${s.col}` : "none", transition: "all 0.15s" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: s.col, fontFamily: "monospace", lineHeight: 1 }}>{s.value}</div>
              <span style={{ fontSize: 20, opacity: active ? 0.9 : 0.35 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 11, color: active ? s.col : T.muted, fontWeight: active ? 700 : 500 }}>{s.label}</div>
            {active && <div style={{ fontSize: 10, color: s.col, marginTop: 5, opacity: 0.7 }}>↑ pulsa para cerrar</div>}
          </Card>;
        })}
      </div>

      {filter && (() => {
        const filterMap = { all: myUpcoming, actionable: myActionable, pending: myUpcoming.filter(c => c.status === "Pending Approval"), frozen: myUpcoming.filter(c => c.freezePeriod) };
        const label = { all: "Assigned to me / team", actionable: "⚡ Actionable Now", pending: "⏳ Pending Approval", frozen: "❄ In Freeze Period" }[filter];
        const fc = filterMap[filter];
        return <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{label}</h2>
            <span style={{ fontSize: 11, background: "#eff6ff", color: T.primary, border: "1px solid #93c5fd", borderRadius: 10, padding: "2px 9px", fontWeight: 700 }}>{fc.length} change{fc.length !== 1 ? "s" : ""}</span>
            <Btn small variant="ghost" style={{ marginLeft: "auto" }} onClick={() => setFilter(null)}>Cerrar ×</Btn>
          </div>
          {fc.length === 0
            ? <Card style={{ textAlign: "center", padding: "28px 20px", color: T.muted }}><div style={{ fontWeight: 600 }}>No changes in this category</div></Card>
            : fc.map(c => {
              const statusCol = (STATUS_META[c.status] || {}).dot || "#94a3b8";
              return <Card key={c.id} onClick={() => onSelect(c)} style={{ marginBottom: 6, cursor: "pointer", padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 3, alignSelf: "stretch", borderRadius: 4, background: statusCol, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 3 }}>{c.name}</div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: T.muted, alignItems: "center" }}>
                      {c.scheduledFor && <span>📅 {fmt(c.scheduledFor, true)}</span>}
                      <span>· {c.domain}</span>{c.country && <span style={{ fontWeight: 700 }}>· {c.country}</span>}
                      {c.freezePeriod && <FreezeTag severity={c.freezeSeverity || "red"} />}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <RiskPill risk={c.risk} /><Badge status={c.status} />
                    {["Scheduled", "In Execution"].includes(c.status) && <Btn small variant={c.status === "Scheduled" ? "success" : "outline"} onClick={e => { e.stopPropagation(); onSelect(c); }}>{c.status === "Scheduled" ? "▶ Execute" : "⚙ Continue"}</Btn>}
                  </div>
                </div>
              </Card>;
            })}
        </div>;
      })()}

      {!filter && <>
        {myActionable.length > 0 && <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>⚡ Actionable Now</h2>
            <span style={{ fontSize: 11, background: "#ecfeff", color: "#0e7490", border: "1px solid #a5f3fc", borderRadius: 10, padding: "2px 9px", fontWeight: 700 }}>{myActionable.length} change{myActionable.length > 1 ? "s" : ""}</span>
          </div>
          {myActionable.map(c => <Card key={c.id} onClick={() => onSelect(c)} style={{ marginBottom: 8, cursor: "pointer", borderLeft: `4px solid ${c.status === "In Execution" ? "#06b6d4" : "#15803d"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: T.text, marginBottom: 4 }}>{c.name}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 11, color: T.muted }}>
                  <span style={{ fontWeight: 600, color: T.text }}>{fmt(c.scheduledFor)}</span>
                  <span>·</span><span>{c.domain}</span>
                  {c.steps && <><span>·</span><span>{c.steps.filter(s => c.stepLogs?.[s.id]?.status === "done").length}/{c.steps.length} steps done</span></>}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                <RiskPill risk={c.risk} /><Badge status={c.status} />
                <Btn small variant={c.status === "Scheduled" ? "success" : "outline"} onClick={e => { e.stopPropagation(); onSelect(c); }}>{c.status === "Scheduled" ? "▶ Execute" : "⚙ Continue"}</Btn>
              </div>
            </div>
          </Card>)}
          <div style={{ marginBottom: 24 }} />
        </>}

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>📅 My Upcoming Schedule</h2>
          <span style={{ fontSize: 11, color: T.muted }}>Next 14 days — {user.team}</span>
        </div>

        {(() => {
          const upcoming14 = myUpcoming.filter(c => {
            if (!c.scheduledFor) return false;
            const d = new Date(c.scheduledFor), now2 = new Date();
            return (d - now2) / 86400000 >= -1 && (d - now2) / 86400000 <= 14;
          });
          if (upcoming14.length === 0) return <Card style={{ textAlign: "center", padding: "32px 20px", color: T.muted }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>🗓</div>
            <div style={{ fontWeight: 600 }}>No changes scheduled in the next 14 days</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>for {user.team} team</div>
          </Card>;

          const byDay = {};
          upcoming14.forEach(c => {
            const day = new Date(c.scheduledFor).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "short" });
            if (!byDay[day]) byDay[day] = { date: new Date(c.scheduledFor), changes: [] };
            byDay[day].changes.push(c);
          });

          const today = new Date().toDateString();
          return Object.entries(byDay).sort((a, b) => a[1].date - b[1].date).map(([day, { date, changes: dc }]) => {
            const isToday = date.toDateString() === today;
            const isTomorrow = new Date(date - 86400000).toDateString() === today;
            return <div key={day} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: isToday ? T.primary : T.text }}>{isToday ? "TODAY — " : isTomorrow ? "TOMORROW — " : ""}{day}</div>
                {isToday && <span style={{ fontSize: 10, background: T.primaryBg, color: T.primary, border: `1px solid ${T.primaryBorder}`, borderRadius: 10, padding: "1px 8px", fontWeight: 700 }}>TODAY</span>}
                <div style={{ flex: 1, height: 1, background: T.border }} />
                <span style={{ fontSize: 11, color: T.muted }}>{dc.length} change{dc.length > 1 ? "s" : ""}</span>
              </div>
              {dc.map(c => {
                const statusCol = (STATUS_META[c.status] || {}).dot || "#94a3b8";
                return <Card key={c.id} onClick={() => onSelect(c)} style={{ marginBottom: 6, cursor: "pointer", padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 3, alignSelf: "stretch", borderRadius: 4, background: statusCol, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 3 }}>{c.name}</div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 11, color: T.muted, alignItems: "center" }}>
                        <span>🕐 {new Date(c.scheduledFor).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                        <span>· {c.domain}</span>
                        {c.country && <span style={{ fontWeight: 700 }}>· {c.country}</span>}
                        <span>· {c.approvalLevel}</span>
                        {c.freezePeriod && <FreezeTag severity={c.freezeSeverity || "red"} />}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      <RiskPill risk={c.risk} /><Badge status={c.status} />
                    </div>
                  </div>
                </Card>;
              })}
            </div>;
          });
        })()}

        {myChanges.filter(c => ["Draft", "Preflight", "Pending Approval"].includes(c.status)).length > 0 && <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, marginTop: 8 }}>
            <h2 style={{ fontSize: 14, fontWeight: 700, color: T.text }}>🗂 In Progress (awaiting execution)</h2>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>
          {myChanges.filter(c => ["Draft", "Preflight", "Pending Approval"].includes(c.status)).map(c => <Card key={c.id} onClick={() => onSelect(c)} style={{ marginBottom: 6, cursor: "pointer", padding: "11px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: T.text, marginBottom: 3 }}>{c.name}</div>
                <div style={{ fontSize: 11, color: T.muted }}>Scheduled: {c.scheduledFor ? fmt(c.scheduledFor, true) : "TBD"} · {c.domain} · {c.manager}{c.country && ` · ${c.country}`}</div>
              </div>
              <RiskPill risk={c.risk} /><Badge status={c.status} />
            </div>
          </Card>)}
        </>}
      </>}
    </div>
  );
}
