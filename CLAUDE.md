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

## Current State — v1.6

**Frontend live:** https://chemafmp.github.io/vodafone-cm/
**Backend live:**  https://api.chemafmp.dev  (DigitalOcean droplet `159.89.17.36`, fra1)

React 19 + Vite SPA. Supabase DB backend (Phase 2 complete). Live poller backend on DigitalOcean.

**Supabase project:** `https://jryorwbomnilewfrdmrg.supabase.co`
Tables: `changes` (JSONB), `freeze_periods` (JSONB), `tickets`, `ticket_events`, `ticket_evidence`,
        `ripe_measurements`, `bgp_visibility`, `dns_measurements`
Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `.env`, not committed)
          `RIPE_ATLAS_KEY` — RIPE Atlas API key (in `.env` on droplet, enables network health polling)
`.env.production` sets `VITE_POLLER_WS=wss://api.chemafmp.dev` (not committed)

**⚠️ Droplet needs update** — run this to activate BGP + DNS modules:
```bash
ssh root@159.89.17.36
cd ~/vodafone-cm && git pull && docker compose up -d --build
```

**Pending DB migrations** (run in Supabase SQL Editor if not yet applied):
```sql
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS working_state text;

CREATE TABLE IF NOT EXISTS ripe_measurements (
  id bigserial PRIMARY KEY, market_id text, avg_rtt numeric, p95_rtt numeric,
  loss_pct numeric, probe_count int, measured_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bgp_visibility (
  id bigserial PRIMARY KEY, market_id text, visibility_pct numeric,
  announced_prefixes int, measured_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dns_measurements (
  id bigserial PRIMARY KEY, market_id text, dns_rtt numeric,
  probe_count int, measured_at timestamptz DEFAULT now()
);
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

# Network Health API (server/poller.js + lib/ripe-atlas.js + bgp-visibility.js + dns-measurements.js):
GET  /api/network-health              → array of 9 markets, each:
     { id, name, flag, asn, ok, error, current, baseline_rtt, ratio, status,
       history[], totalProbes, probeDetails[], probeLocations[],
       bgp: { current:{visibility_pct, ris_peers_seeing, total_ris_peers, announced_prefixes},
              history[], status, ok, error },
       dns: { current:{dns_rtt, p95_dns_rtt, probe_count}, history[], baseline_rtt, ratio,
              status, ok, error, probeDetails[] } }

# Ticketing API (server/tickets.js):
POST   /api/tickets                   → create ticket
GET    /api/tickets                   → list (filters: type,status,severity,country,node,team,sla_at_risk)
GET    /api/tickets/:id               → ticket + events + evidence
GET    /api/tickets/sla               → tickets at risk or breached
PATCH  /api/tickets/:id               → update fields (status, owner, working_state, tags, etc.)
POST   /api/tickets/:id/events        → add log event
POST   /api/tickets/:id/evidence      → add evidence link
POST   /api/tickets/:id/notes         → automation alias (x-api-key header, body: {content, source, metadata})
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
    ripe-atlas.js        # ★ RIPE Atlas msm #1001 (ICMP ping to k-root). Fetches probes by Vodafone
                         #   ASN, polls results every 5 min, dynamic 4h baseline, ratio model.
                         #   Exports: initRipeAtlas, tickRipeAtlas, getNetworkHealth.
                         #   probeDetails per-probe: avg/p95/min/max/loss. 36h retention.
                         #   Fallback: 60-min window for sparse markets (≤3 probes).
    bgp-visibility.js    # ★ RIPE Stat routing-status API. Polls % of RIS BGP peers seeing
                         #   each Vodafone ASN. Returns ris_peers_seeing/total_ris_peers +
                         #   announced_prefixes. Static thresholds: ok≥95%, warn≥80%.
                         #   Exports: initBgpVisibility, tickBgpVisibility, getBgpVisibility.
    dns-measurements.js  # ★ RIPE Atlas msm #10001 (DNS SOA to k-root). Same probe selection
                         #   as ripe-atlas.js. DNS result shape: {prb_id, result:{rt, rcode}}.
                         #   Per-probe breakdown (computeDnsProbeDetails). Dynamic baseline.
                         #   Exports: initDnsMeasurements, tickDnsMeasurements, getDnsMeasurements.

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
    ServiceStatusView.jsx# ★ PWA / service monitor. Props: mobile, onOpenTicket.
                         # DetailChart: SVG with MA, threshold zones, crossing annotations.
                         # DetailPanel: live value bar, zoom ×1-8, share button.
                         # Standalone PWA: App.jsx detects navigator.standalone → renders this directly.
                         # In-app ticket nav: onOpenTicket(id) → window.location.hash = #ticket=ID
    NetworkHealthView.jsx# ★ RIPE Atlas Network Health. GET /api/network-health every 30s.
                         # MarketCard: 3×2 metric grid (AVG/P95 Latency, Packet Loss,
                         #   BGP Visible [X/Y peers], DNS RTT, Active Probes).
                         #   RatioTooltip: hover status pill → ×ratio explained + thresholds.
                         # DetailPanel: 6 charts (avg/p95/loss/bgp/dns history), 7 zoom options,
                         #   ProbeBreakdown button (opens per-probe modal).
                         # ProbeBreakdown: per-probe table — ICMP latency bar (min/avg/max),
                         #   P95, loss, DNS RTT column (purple/orange), K-ROOT inference.
                         #   BGP summary panel (peer counts + explanation).
                         # MetricsGlossary: explains all 6 metrics with measurement source.
                         # RIPE_MARKETS: ES/UK/DE/IT/PT/NL/IE/GR/TR (9 markets).
                         #   All have active probes except TR (AS15924 — 1 probe, not reporting).
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
| MONITORING | `network_health` | NetworkHealthView ★ |
| TICKETS | `tickets` | TicketListView ★ |
| PWA only | `service_monitor` | ServiceStatusView (standalone mode, no login) |
| PWA only | `network_health` | NetworkHealthView (PWA tile from landing page) |

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

## Next Work — Session 7: EventsView → Incident Timeline

**Goal:** Replace the placeholder `EventsView` with a real chronological incident timeline.

**What to build (`src/components/IncidentTimelineView.jsx`):**
1. Chronological feed merging:
   - Network events from `liveEvents` WS stream (alarm open/resolve, interface flap, BGP changes)
   - Change management events from `crs` (status transitions: Approved → In Execution → Completed)
2. Correlation badge: if a change was "In Execution" when an alarm fired on one of its `affectedDeviceIds`, show a ⚡ correlation badge linking the two.
3. Filter bar: severity (All/Critical/Major/Minor), type (All/PERFORMANCE/INTERFACE/BGP/HARDWARE/CHANGE).
4. Single feed for the whole team, newest first.

**Also consider:**
- Network Health → real-world validation once droplet is updated (BGP/DNS data flowing)
- Turkey market: AS15924 has 1 probe not reporting. Might stay as "no data" permanently.
- Downdetector official API: user's token expired. Contact `enterprise.downdetector.com` for renewal.

---

## Backlog / Next Sessions

### Session 3 (planned): EventsView → Incident Timeline
See "Next Work — Session 7" section above.

### ✅ Session 5 — Service Monitor chart improvements (DONE, claude/zealous-bassi → main)
  - SVG chart with threshold zones (rgba fills) and dashed reference lines (baseline/2×/4.5×)
  - Hover + touch crosshair tooltip
  - trendDirection() helper, key metrics grid (Now/Baseline/Peak), service breakdown sorted by ratio
  - Threshold reference table, perMin toggle

### ✅ Session 5b — PWA (iPhone app) (DONE, claude/nifty-proskuriakova → main)
  - manifest.json, apple-touch-icon, display:standalone, safe-area-inset
  - Standalone detection via navigator.standalone / display-mode media query
  - App name: "Chema NOC", icon: navy + red band + ECG pulse line
  - Ticket navigation fixed in PWA: onOpenTicket callback → hash routing instead of window.open
  - PWA landing page: two tiles (🌐 Service Monitor + 📡 Network Health)

### ✅ Session 5c — Chart improvements v2 (DONE, claude/nifty-proskuriakova → main)
  - Live value bar (always visible above chart, no touch needed)
  - Zoom buttons All/2×/4×/8× within chart panel
  - Moving average line (thick translucent band)
  - Threshold crossing annotation markers (vertical line + label at first 2× and 4.5× crossings)
  - Share button (⎘) copies PWA deep link to clipboard

### ✅ Session 6 — Automation API (DONE, already merged to main)
  - POST /api/tickets/:id/notes alias for Camunda/Nagios/Ansible
  - x-api-key middleware (AUTOMATION_API_KEY env var), scoped to /notes only
  - Frontend: automation_note events rendered in Worklog tab (🤖 icon, blue tint)

### ✅ Session 6b — Network Health View (DONE, claude/nifty-proskuriakova → main 2026-04-10)
  - RIPE Atlas msm #1001 (ICMP ping to k-root) per Vodafone market, 9 countries
  - 3×2 card: AVG/P95 Latency, Packet Loss, BGP Visible (peer counts), DNS RTT, Active Probes
  - 6-chart DetailPanel with 7 time window options (10m→36h)
  - Per-probe breakdown modal: ICMP bars (min/avg/max), P95, DNS RTT column, BGP summary
  - BGP Visibility: RIPE Stat routing-status API — ris_peers_seeing/total, prefixes announced
  - DNS RTT: RIPE Atlas msm #10001 (DNS SOA), per-probe breakdown, dynamic baseline
  - Ratio tooltip on status pill: explains ×ratio, thresholds, probe count
  - MetricsGlossary: all 6 metrics explained (ICMP, P95, loss, BGP, DNS, probes)
  - Probe coverage: 8/9 markets active (Turkey AS15924 has 1 probe not reporting — no fix available)
  - 60-min fallback window for sparse markets (≤3 probes)

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

### ✅ Phase 2d — Automation API (DONE)
  - POST /api/tickets/:id/notes alias (x-api-key, body: {content, source, metadata})
  - requireAutomationKey middleware scoped to /notes only
  - automation_note events in TicketDetailView Worklog tab

### ✅ Phase 2e — PWA / iPhone app (DONE)
  - manifest.json, icons (Pillow-generated: navy + red + ECG), app name "Chema NOC"
  - Standalone detection, safe-area-insets, in-app ticket navigation via hash routing
  - Chart: live value bar, zoom ×1-8, moving average, threshold crossings, share button
  - Landing page: two tiles (Service Monitor + Network Health)

### ✅ Phase 2f — Network Health View (DONE 2026-04-10)
  - RIPE Atlas msm #1001 latency per Vodafone market (9 countries)
  - BGP Visibility via RIPE Stat (ris_peers_seeing/total, prefixes)
  - DNS RTT via RIPE Atlas msm #10001 (per-probe breakdown)
  - Dynamic 4h baseline, ratio model, 36h Supabase persistence
  - ⚠️ Droplet needs: git pull && docker compose up -d --build

### 🔲 Phase 3 — Authentication (Supabase Auth magic link or SSO)
### 🔲 Phase 4 — RBAC with RLS
### 🔲 Phase 5 — Real-time (Supabase)

---

## Network Health View — How it works

`src/components/NetworkHealthView.jsx` — view id `"network_health"`, sidebar item "📡 Network Health" under MONITORING. Also accessible from PWA landing page tile.

**Data source:** `GET /api/network-health` — polled every 30s by the frontend.
**Backend polling:** every 5 min per market, staggered 600ms between markets.

**Three metrics, three modules:**

| Metric | Module | Measurement | Notes |
|---|---|---|---|
| ICMP Latency + Loss | `ripe-atlas.js` | msm #1001 — ICMP ping to k.root-servers.net | Probes inside Vodafone AS |
| BGP Visibility | `bgp-visibility.js` | RIPE Stat routing-status API | External RIS peers looking AT Vodafone |
| DNS RTT | `dns-measurements.js` | msm #10001 — DNS SOA to k.root-servers.net | Same probes as ICMP |

**Ratio model (ICMP + DNS):**
- `ratio = current_metric / 4h_rolling_baseline`
- OK <2× · WARNING ≥2× · OUTAGE ≥4.5×

**BGP thresholds (static, not ratio):**
- OK ≥95% · WARNING ≥80% · OUTAGE <80%

**Markets and ASNs:**
| Market | ASN | Probes (active) |
|---|---|---|
| ES | 12430 | 6 |
| UK | 5378 | 18 |
| DE | 3209 | 199 |
| IT | 30722 | 15 |
| PT | 12353 | 14 |
| NL | 33915 | 60 |
| IE | 15502 | 12 |
| GR | 3329 | 14 |
| TR | 15924 | 1 (not reporting) |

Turkey has only 1 RIPE Atlas probe on Vodafone's ASN and it doesn't report to msm #1001. No alternative Vodafone TR ASN has probes (AS47331=0, Turk Telekom and Superonline are NOT Vodafone). Show as "no data" — 60-min fallback window applied.

**Why BGP data looks like 329/329 (all same)?**
RIPE Stat's routing-status API returns a snapshot of the CURRENT global routing table. `total_ris_peers` is the global count of all RIPE RIS BGP collectors (same number for every ASN, ~329). `ris_peers_seeing` is how many of those can route to this specific AS. When all 329/329 see you = perfect visibility. The value never changes unless there's a routing incident.

**Supabase tables (36h retention, auto-cleaned each tick):**
- `ripe_measurements` — {market_id, avg_rtt, p95_rtt, loss_pct, probe_count, measured_at}
- `bgp_visibility` — {market_id, visibility_pct, announced_prefixes, measured_at}
- `dns_measurements` — {market_id, dns_rtt, probe_count, measured_at}

---

## ESLint Notes

- Flat config (`eslint.config.js`) ESLint 9+
- `no-unused-vars` allows `/^[A-Z_]/` (uppercase constants)
- JSX in `.jsx` files only
