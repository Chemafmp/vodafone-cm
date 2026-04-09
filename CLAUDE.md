# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Commands

```bash
npm run dev -- --port 5178   # Dev server (always use port 5178)
npm run build                 # Production build
npm run lint                  # ESLint
npm run deploy                # build + push to gh-pages (see script in package.json)
```

**If the app is blank after starting dev:** delete `.vite/` cache and restart.
```bash
rm -rf node_modules/.vite .vite && npm run dev -- --port 5178
```

**Deploy to GitHub Pages (manual fallback):**
```bash
npm run build
cd /tmp && rm -rf gh-deploy && mkdir gh-deploy && cd gh-deploy
git init && git remote add origin https://github.com/Chemafmp/vodafone-cm.git
cp -r /Users/josemafernandez/vodafone-cm/dist/. . && touch .nojekyll
git add -A && git commit -m "Deploy: <description>" && git push origin HEAD:gh-pages --force
```

---

## Current State — v1.3

**Frontend live:** https://chemafmp.github.io/vodafone-cm/
**Backend live:**  https://api.chemafmp.dev  (DigitalOcean droplet `159.89.17.36`, fra1)

React 19 + Vite SPA. Supabase DB backend (Phase 2 complete). Live poller backend on DigitalOcean.

**Supabase project:** `https://jryorwbomnilewfrdmrg.supabase.co`
Tables: `changes` (JSONB), `freeze_periods` (JSONB)
Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `.env`, not committed)
`.env.production` sets `VITE_POLLER_WS=wss://api.chemafmp.dev` (not committed)

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
```

---

## File Structure

```
server/
  poller.js              # Express + WS server. Manages fleet (fleetMap), polls nodes,
                         # broadcasts poll-result via WebSocket. Chaos Control API here.
  node-sim.js            # Simulated SNMP node (child_process.fork). Sends metrics to poller.
  lib/
    scenarios.js         # Chaos scenarios: cascade, maintenance, linkFlap, bgpLeak, thermalRunaway
    alarm-engine.js      # Threshold-based alarm detection + dedup
    events.js            # Event log builder

src/
  App.jsx                # Main app — state, navigation, layout
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
  components/
    ui/index.jsx         # Badge, RiskPill, FreezeTag, TypeTag, IntrusionTag,
                         # Btn, Inp, Sel, Card, Modal
    LiveStatusView.jsx   # ★ NEW — per-node incident aggregation (see below)
    ChaosControlPanel.jsx# ★ NEW — kill/revive/scenario modal (opened from sidebar LIVE pill)
    AlarmsView.jsx        # Flat alarm table (kept, not modified)
    EventsView.jsx        # Event log (needs redesign — Session 3)
    ChangeDetail.jsx      # Full change panel
    CreateChange.jsx      # New change wizard
    FreezeManager.jsx     # Freeze period CRUD
    TimelineView.jsx      # Gantt calendar
    ObservabilityView.jsx # Metrics charts
    TopologyView.jsx      # Network topology map
    NetworkInventory.jsx  # Node inventory CRUD
```

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
| MONITORING | `livestatus` | **LiveStatusView** ← new |
| MONITORING | `alarms` | AlarmsView |
| MONITORING | `events` | EventsView ← needs Session 3 redesign |
| MONITORING | `observability` | ObservabilityView |

---

## App.jsx Top-level State

```js
const { connected: pollerConnected, liveAlarms, liveEvents, nodeSnapshots } = usePollerSocket();
const [view, setView] = useState("changes");
const [chaosOpen, setChaosOpen] = useState(false);
// crs = changes.filter(c => !c.isTemplate)  — passed to LiveStatusView for cross-reference
```

---

## Next Work — Session 3: EventsView → Incident Timeline

**Problem:** `EventsView` exists but doesn't work well. It currently shows a flat list of
events from the WebSocket stream mixed with Supabase change history. The design is broken.

**Goal:** Replace the content of `EventsView` (or create `IncidentTimelineView.jsx`) that answers
"what happened, when, and in what order?" — a chronological feed of:
1. Network events (from `liveEvents` WebSocket stream) — alarm open/resolve, interface flap, BGP changes
2. Change management events (from `crs`) — status transitions (Approved, In Execution, Completed)
3. **Correlation:** if a change was "In Execution" at the time a network alarm fired on one of its
   `affectedDeviceIds`, flag the event as "change-correlated" (yellow badge)

**Design rules (user confirmed):**
- Organized by information type, NOT by role
- No NOC / engineer separation — single view for the whole team
- Sub-views: information categories, not personas

**Implementation approach (agreed):**
- Create `src/components/IncidentTimelineView.jsx` as a NEW component (same pattern as LiveStatusView)
- Wire it in as `view="events"` replacing the existing EventsView render in App.jsx
- Keep old `EventsView.jsx` file but stop rendering it
- Timeline items: chronological, newest first, with severity badge + node + message + "X ago"
- Correlation badge: check `crs` for changes with matching `affectedDeviceIds` and overlapping time window
- Filter bar: severity (All/Critical/Major/Minor), type (All/PERFORMANCE/INTERFACE/BGP/HARDWARE/CHANGE)

---

## Production Migration Roadmap

### ✅ Phase 0 — Prototype (DONE)
### ✅ Phase 1 — localStorage (DONE)
### ✅ Phase 2 — Supabase DB (DONE)
### ✅ Phase 2b — Live Poller Backend on DigitalOcean (DONE)
  - Docker + Caddy + Let's Encrypt on `api.chemafmp.dev`
  - Chaos Control API for live demos
  - WebSocket live feed to frontend

### 🔲 Phase 3 — Authentication (NEXT AFTER SESSION 3)
Supabase Auth (email magic link or SSO). `currentUser` from real session.

### 🔲 Phase 4 — RBAC with RLS
Row-Level Security in Supabase.

### 🔲 Phase 5 — Real-time (Supabase)
Supabase Realtime subscriptions for the change management side.

---

## ESLint Notes

- Flat config (`eslint.config.js`) ESLint 9+
- `no-unused-vars` allows `/^[A-Z_]/` (uppercase constants)
- JSX in `.jsx` files only
