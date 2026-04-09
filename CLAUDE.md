# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Commands

```bash
npm run dev -- --port 5178   # Dev server (always use port 5178)
npm run build                 # Production build
npm run lint                  # ESLint
npm run deploy                # build + push to gh-pages (works from worktree too — uses $INIT_CWD/dist)
```

**If the app is blank after starting dev:** delete `.vite/` cache and restart.
```bash
rm -rf node_modules/.vite .vite && npm run dev -- --port 5178
```

**Worktree env setup (required before building for production):**
```bash
cp /Users/josemafernandez/vodafone-cm/.env .env
cp /Users/josemafernandez/vodafone-cm/.env.production .env.production
```
> ⚠️ Without `.env.production`, the build uses `ws://localhost:4000` instead of `wss://api.chemafmp.dev`.

**Deploy to GitHub Pages (manual fallback — use this if `npm run deploy` fails):**
```bash
# Run from the worktree root (e.g. /Users/josemafernandez/vodafone-cm/.claude/worktrees/zen-fermi)
npm run build
DIST=$(pwd)/dist
cd /tmp && rm -rf gh-deploy && mkdir gh-deploy && cd gh-deploy
git init && git remote add origin https://github.com/Chemafmp/vodafone-cm.git
cp -r $DIST/. . && touch .nojekyll
git add -A && git commit -m "Deploy: <description>" && git push origin HEAD:gh-pages --force
```

> ⚠️ **Worktree deploy gotcha:** `npm run deploy` previously used a hardcoded absolute path
> (`/Users/josemafernandez/vodafone-cm/dist/`) which is the MAIN repo dist, not the worktree dist.
> Fixed in package.json to use `$INIT_CWD/dist` so it always copies from where the build ran.
> When in doubt, use the manual fallback above with `DIST=$(pwd)/dist`.

---

## Current State — v1.4

**Frontend live:** https://chemafmp.github.io/vodafone-cm/
**Backend live:**  https://api.chemafmp.dev  (DigitalOcean droplet `159.89.17.36`, fra1)

React 19 + Vite SPA. Supabase DB backend (Phase 2 complete). Live poller backend on DigitalOcean.

**Supabase project:** `https://jryorwbomnilewfrdmrg.supabase.co`
Tables: `changes` (JSONB), `freeze_periods` (JSONB), `tickets`, `ticket_events`, `ticket_evidence`
Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `.env`, not committed)
`.env.production` sets `VITE_POLLER_WS=wss://api.chemafmp.dev` (not committed)

**Pending DB migration** (run in Supabase SQL Editor if not yet applied):
```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS working_state text;
```

---

## Infrastructure (DigitalOcean)

Droplet: `bodaphone-lab`, Ubuntu 24.04, 1 GB RAM, fra1, IP `159.89.17.36`
SSH: `ssh root@159.89.17.36`
App dir: `/root/vodafone-cm/`

**docker-compose.yml** (on droplet):
- `poller` — Node.js backend, port 4000 (internal), `AUTO_FLEET=6`
- `caddy` — Caddy 2 reverse proxy, ports 80/443, auto Let's Encrypt for `api.chemafmp.dev`

**Caddyfile** (on droplet): `api.chemafmp.dev { reverse_proxy poller:4000 }`

**Update backend after git push:**
```bash
# on the droplet
cd ~/vodafone-cm && git pull && docker compose up -d --build
```

**Key backend endpoints:**
```
GET  /health                          → fleet status
GET  /api/status                      → registered nodes
GET  /api/alarms                      → active alarms
GET  /api/events                      → recent events
WS   wss://api.chemafmp.dev           → live poll-result stream
GET  /api/control/nodes               → fleet node list + status
POST /api/control/kill/:nodeId        → SIGTERM a simulated node
POST /api/control/revive/:nodeId      → re-fork a killed node
POST /api/control/scenario/:nodeId    → trigger chaos scenario (body: {scenario})
     valid scenarios: cascade | maintenance | linkflap | bgpleak | thermal

# Ticketing API (server/tickets.js):
POST   /api/tickets                   → create ticket
GET    /api/tickets                   → list (filters: type,status,severity,country,node,team,sla_at_risk)
GET    /api/tickets/:id               → ticket + events + evidence
GET    /api/tickets/sla               → tickets at risk or breached
PATCH  /api/tickets/:id               → update fields (status, owner, working_state, tags, etc.)
POST   /api/tickets/:id/events        → add log event
POST   /api/tickets/:id/evidence      → add evidence link
```

---

## File Structure

```
server/
  poller.js              # Express + WS server. Manages fleet (fleetMap), polls nodes,
                         # broadcasts poll-result via WebSocket. Chaos Control API here.
                         # Auto-creates tickets from alarms sequentially (race condition fix).
  tickets.js             # ★ Ticketing router — all /api/tickets/* endpoints.
                         # generateTicketId uses LIKE on id column (not seq_number).
                         # autoCreateTicketFromAlarm exported and called by poller.js.
  node-sim.js            # Simulated SNMP node (child_process.fork). Sends metrics to poller.
  lib/
    scenarios.js         # Chaos scenarios: cascade, maintenance, linkFlap, bgpLeak, thermalRunaway
    alarm-engine.js      # Threshold-based alarm detection + dedup
    events.js            # Event log builder

src/
  App.jsx                # Main app — state, navigation, layout.
                         # fullScreenTicketId detection via window.location.hash (#ticket=ID).
                         # User state persisted in sessionStorage (works across new tabs).
  context/
    ChangesContext.jsx   # Supabase CRUD + all change state
    NodesContext.jsx     # Network inventory state (localStorage)
  hooks/
    usePollerSocket.js   # WebSocket hook → { connected, liveAlarms, liveEvents, nodeSnapshots }
  data/
    seed.js              # SEED_CHANGES, DEMO_CHANGES (affectedDeviceIds links changes to nodes),
                         # PEAK_PERIODS
    constants.js         # T (theme), TEAMS, DEPTS, DIRECTORS, MANAGERS, SYSTEMS,
                         # COUNTRIES, RISK_LEVELS, STATUS_META, RISK_C, EXEC_RESULTS
    inventory/           # Node inventory seed data
  utils/
    db.js                # Supabase CRUD
    helpers.js           # fmt, fmtDT, genId, genChangeId, applyVars, exportAuditCSV, etc.
    tickets.js           # fetchTickets, fetchTicket, patchTicket (Supabase direct from frontend)
  components/
    ui/index.jsx         # Badge, RiskPill, FreezeTag, TypeTag, IntrusionTag,
                         # Btn, Inp, Sel, Card, Modal
    LiveStatusView.jsx   # Per-node incident aggregation. Ticket badge on alarm rows.
    ChaosControlPanel.jsx# Kill/revive/scenario modal (opened from sidebar LIVE pill)
    AlarmsView.jsx       # Flat alarm table. Ticket badge in detail drawer.
    TicketListView.jsx   # ★ Ticket list — opens tickets in new tab via window.open('#ticket=ID')
    TicketDetailView.jsx # ★ Full-screen ticket detail (hash routing + fullScreen prop).
                         # Working state dropdown, SLA timer, log tab with 3 categories.
    EventsView.jsx       # Event log (needs redesign — Session 3)
    ChangeDetail.jsx     # Full change panel
    CreateChange.jsx     # New change wizard
    FreezeManager.jsx    # Freeze period CRUD
    TimelineView.jsx     # Gantt calendar
    ObservabilityView.jsx# Metrics charts
    TopologyView.jsx     # Network topology map
    NetworkInventory.jsx # Node inventory CRUD
```

---

## Ticketing System — How it works

### Supabase tables
- `tickets` — main ticket record. Key fields: `id` (BNOC-INC-XXXXXXXX), `type` (incident/problem/project),
  `severity` (sev1–sev4), `status`, `working_state`, `owner_name`, `team`, `impacted_nodes[]`,
  `alarm_id`, `alarm_type`, `tags[]`, `closure_code`, `resolution_summary`, `related_change_id`.
- `ticket_events` — timeline log. Fields: `ticket_id`, `event_type`, `actor_name`, `actor_id`,
  `content`, `metadata` (JSONB), `created_at`.
- `ticket_evidence` — attachments/links. Fields: `ticket_id`, `type`, `label`, `url`, `metadata`, `uploaded_by`.

### ID generation (`server/tickets.js`)
Uses LIKE on the `id` column (not `seq_number` which may be null on auto-created tickets):
```js
const { data } = await db.from("tickets").select("id").like("id", `BNOC-${prefix}-%`)
  .order("id", { ascending: false }).limit(1);
```

### Auto-create from alarms (`server/poller.js`)
After each poll cycle, new alarms are processed **sequentially** (not in parallel) to avoid
concurrent `generateTicketId` calls colliding on the same ID:
```js
for (const alarm of allNewAlarms) {
  await autoCreateTicketFromAlarm(alarm, nodeMeta);
}
```
Dedup check: existing open ticket for same `alarm_type + nodeId` → links alarm, no new ticket.

### Hash routing for full-screen ticket
`window.open('#ticket=BNOC-INC-XXXXXXXX', '_blank')` — App.jsx reads `window.location.hash` on load
and renders `<TicketDetailView fullScreen>` instead of the normal shell.
User session persisted via `sessionStorage` so the new tab knows who is logged in.

### Working state (separate from lifecycle status)
Values: `unassigned | acknowledged | active_work | waiting | at_risk | stalled`
Stored as `working_state` text column in `tickets`. Dropdown in ticket header, colour-coded.

### Log tab categories in TicketDetailView
- **Operator Actions** — `actor_name` is not "System" and not null. Avatar, full prominence.
- **System Events** — `actor_name === "System"` or null. Muted, compact, opacity 0.75.
- *(Planned) Automated Actions* — `event_type === "automation_note"`. Robot icon 🤖, pre-wrap content, light blue tint.

### SLA tiers
| Severity | Ack | Mitigate | Resolve |
|---|---|---|---|
| sev1 | 5 min | 60 min | 240 min |
| sev2 | 15 min | 240 min | 480 min |
| sev3 | 60 min | 1440 min | 4320 min |
| sev4 | 240 min | 4320 min | 10080 min |

SLA timer shown quietly when <75% elapsed; turns prominent (orange/red) at >75% or breached.

---

## WebSocket Data Shape (`usePollerSocket`)

```js
// poll-result message broadcast every ~10s:
{
  type: "poll-result",
  cycle: number,
  timestamp: ISO string,
  nodes: {
    [nodeId]: {
      reachable: boolean,
      cpu: number,      // %
      mem: number,      // %
      temp: number,     // °C
      uptime: number,
      interfaces: [{ name, speed, operStatus: "UP"|"DOWN" }],
      bgpPeers: [{ ip, description, state: "Established"|"Idle", prefixesRx }],
    }
  },
  newAlarms: Alarm[],
  resolvedAlarms: Alarm[],
  newEvents: Event[],
  activeAlarmCount: number,
}

// Alarm shape:
{ id, key, nodeId, type, severity, status, message, since, resolvedAt }
// types: PERFORMANCE | INTERFACE | HARDWARE | BGP | REACHABILITY
// severity: Critical | Major | Minor | Warning | Info
```

---

## LiveStatusView — How it works

`src/components/LiveStatusView.jsx` — view id `"livestatus"`, sidebar item "◉ Live Status" under MONITORING.

**Props:** `{ liveAlarms, nodeSnapshots, pollerConnected, crs, onSelectChange }`

**Health classification (per node, worst wins):**
- `DOWN`     → `!reachable` OR any Critical alarm
- `DEGRADED` → any Major alarm OR cpu≥85 OR mem≥90 OR temp≥70
- `WARNING`  → any alarm OR cpu≥70 OR mem≥80
- `HEALTHY`  → otherwise

**Incident label** derived from alarm type combination (CASCADE FAILURE, BGP INSTABILITY, THERMAL EVENT, LINK FLAP STORM, etc.)

**Change cross-reference:** for each incident node, finds `crs` entries where `c.affectedDeviceIds.includes(nodeId)` AND `c.status` is one of `["Scheduled","Preflight","Approved","In Execution"]`. Shows as yellow (In Execution) or blue (Scheduled) banner on the card. Clicking opens the change detail panel.

**Ticket badge:** each alarm row shows a 🎫 badge if an open ticket exists for that alarm (keyed by `nodeId::alarmType`). Clicking opens ticket in new tab.

---

## ChaosControlPanel — How it works

`src/components/ChaosControlPanel.jsx` — opened by clicking the LIVE pill in the sidebar.
HTTP base URL derived from `VITE_POLLER_WS` (wss→https, ws→http).
3s polling to keep node state fresh. Kill/Revive/Scenario via REST to `/api/control/*`.

---

## ID System

| Type | Format | Example |
|---|---|---|
| Operational changes | `BNOC-0000000001-A` | `BNOC-0000000003-A` |
| Template blueprints | `BNOC-TEM-00000001-A` | `BNOC-TEM-00000003-A` |
| Freeze periods / misc | `BNOC-XXXXXXXX` (random) | `BNOC-87351209` |
| Incident tickets | `BNOC-INC-XXXXXXXX` | `BNOC-INC-00000042` |
| Problem tickets | `BNOC-PRB-XXXXXXXX` | `BNOC-PRB-00000001` |
| Project tickets | `BNOC-PRJ-XXXXXXXX` | `BNOC-PRJ-00000001` |

Node IDs (inventory + poller fleet):
`fj-suva-cr-01`, `fj-suva-pe-01`, `hw-hnl1-cr-01`, `hw-hnl1-pe-01`, `ib-town-cr-01`, `ib-town-pe-01`
(plus many more in inventory that are NOT in the live fleet)

Changes cross-reference nodes via `affectedDeviceIds: string[]` using these same IDs.

---

## Key Domain Concepts

- **Change record** — `status` (Draft → Preflight → Pending Approval → Approved → In Execution → Completed/Failed/Aborted/etc.), `category` (Normal/Standard/Emergency), `risk` (Low/Medium/High/Critical), `approvalLevel` (L1/L2/L3), `steps[]`, `preflightResults`, `approvals[]`, `auditLog[]`, `comments[]`
- **Templates** — `isTemplate:true`, `variables:[{key,label,type,required,defaultValue}]`, `{{key}}` placeholders. Changes from templates have `sourceTemplateId`.
- **Freeze periods** — `severity:"orange"` = Manager approval, `severity:"red"` = Director approval.
- **Users** (`USERS` in App.jsx) — roles: Engineer, Manager, Director, NOC/SAC, Bar Raiser.
- **Approval levels** — L1 (Engineer), L2 (Manager/Director), L3 (Director only).

---

## Views in Sidebar

| Group | view id | Component |
|---|---|---|
| OPERATIONS | `changes` | ChangesView |
| OPERATIONS | `mywork` | MyWorkView |
| OPERATIONS | `timeline` | TimelineView |
| OPERATIONS | `peakcal` | FreezeManager |
| NETWORK | `network` | NetworkInventory |
| NETWORK | `topology` | TopologyView |
| MONITORING | `livestatus` | LiveStatusView |
| MONITORING | `alarms` | AlarmsView |
| MONITORING | `events` | EventsView ← needs Session 3 redesign |
| MONITORING | `observability` | ObservabilityView |
| TICKETS | `tickets` | TicketListView ★ |

---

## App.jsx Top-level State

```js
const { connected: pollerConnected, liveAlarms, liveEvents, nodeSnapshots } = usePollerSocket();
const [view, setView] = useState("changes");
const [chaosOpen, setChaosOpen] = useState(false);

// Full-screen ticket routing (hash-based)
const [fullScreenTicketId, setFullScreenTicketId] = useState(() => {
  const m = window.location.hash.match(/[#&]ticket=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
});

// User session — persisted in sessionStorage so new tabs (ticket windows) keep the login
const [user, setUser] = useState(() => {
  try { return JSON.parse(sessionStorage.getItem("bnocUser")) || null; } catch { return null; }
});

// crs = changes.filter(c => !c.isTemplate)  — passed to LiveStatusView for cross-reference
```

---

## Next Work — Session 4: Automation API (Camunda / runbook integration)

**Goal:** Allow external automation tools (Camunda workflows, Nagios scripts, Ansible runbooks)
to post information into tickets via REST API — check results, remediation actions, metrics.

**What's missing:**
1. **API key auth** — `AUTOMATION_API_KEY` env var + `x-api-key` header middleware in `server/tickets.js`.
   Apply to all POST/PATCH routes. GET routes stay open (read-only).
2. **`/api/tickets/:id/notes` alias** — clean automation-friendly endpoint:
   `{ content, source, metadata }` → inserts event with `event_type: "automation_note"`.
3. **Third log category in TicketDetailView** — "Automated Actions":
   `event_type === "automation_note"` → 🤖 icon, `#f0f9ff` background, `4px solid #38bdf8` left border,
   `white-space: pre-wrap` content, metadata pills (source, node, workflow_id).

**Example Camunda call:**
```bash
curl -X POST https://api.chemafmp.dev/api/tickets/BNOC-INC-00000042/notes \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_KEY" \
  -d '{
    "content": "✅ Interface check: 4/4 UP\n✅ BGP peers: 4/4 Established\n❌ CPU: 91%\n\nAcción: restart proceso. CPU bajó a 43% tras 90s.",
    "source": "Camunda — Node Health Check",
    "metadata": { "workflow_id": "NHC-001", "node": "fj-suva-cr-01", "duration_s": 47 }
  }'
```

---

## Backlog / Next Sessions

### Session 3 (planned): EventsView → Incident Timeline
Create `src/components/IncidentTimelineView.jsx` — chronological feed of:
1. Network events (from `liveEvents` WS stream) — alarm open/resolve, interface flap, BGP changes
2. Change management events (from `crs`) — status transitions
3. Correlation badge: if change was "In Execution" when alarm fired on an `affectedDeviceId`

Rules: single view for whole team, organized by type not role.
Filter bar: severity (All/Critical/Major/Minor), type (All/PERFORMANCE/INTERFACE/BGP/HARDWARE/CHANGE).

### Session 4 (planned): Automation API
See "Next Work" section above.

### Phase 3 (after sessions): Authentication
Supabase Auth (email magic link or SSO). `currentUser` from real session.

### Phase 4: RBAC with RLS
Row-Level Security in Supabase.

---

## Production Migration Roadmap

### ✅ Phase 0 — Prototype (DONE)
### ✅ Phase 1 — localStorage (DONE)
### ✅ Phase 2 — Supabase DB (DONE)
### ✅ Phase 2b — Live Poller Backend on DigitalOcean (DONE)
  - Docker + Caddy + Let's Encrypt on `api.chemafmp.dev`
  - Chaos Control API for live demos
  - WebSocket live feed to frontend
### ✅ Phase 2c — Ticketing System (DONE)
  - Supabase tables: tickets, ticket_events, ticket_evidence
  - Auto-ticket creation from alarms (sequential, dedup, race-condition-safe)
  - Full-screen ticket detail (hash routing, new tab, sessionStorage auth)
  - Working state, SLA timer, log tab with operator/system split
  - Ticket badges in LiveStatusView and AlarmsView

### 🔲 Phase 2d — Automation API (NEXT)
  - API key auth on POST/PATCH ticket endpoints
  - /api/tickets/:id/notes alias for automation
  - Third log category "Automated Actions" in TicketDetailView

### 🔲 Phase 3 — Authentication
### 🔲 Phase 4 — RBAC with RLS
### 🔲 Phase 5 — Real-time (Supabase)

---

## ESLint Notes

- Flat config (`eslint.config.js`) ESLint 9+
- `no-unused-vars` allows `/^[A-Z_]/` (uppercase constants)
- JSX in `.jsx` files only
