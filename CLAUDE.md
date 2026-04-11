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

**Deploy to GitHub Pages (always build from MAIN repo, not worktree):**
```bash
cd /Users/josemafernandez/vodafone-cm   # ← ALWAYS from here
npm run build
DIST=$(pwd)/dist
cd /tmp && rm -rf gh-deploy && mkdir gh-deploy && cd gh-deploy
git init && git remote add origin https://github.com/Chemafmp/vodafone-cm.git
cp -r $DIST/. . && touch .nojekyll
git add -A && git commit -m "Deploy: <description>" && git push origin HEAD:gh-pages --force
```

> ⚠️ **Critical:** Always build from `/Users/josemafernandez/vodafone-cm` (main repo). Worktrees
> have separate working trees — files created in main repo won't be in worktree builds.

---

## Current State — v1.9

**Frontend live:** https://chemafmp.github.io/vodafone-cm/
**Backend live:**  https://api.chemafmp.dev  (DigitalOcean droplet `159.89.17.36`, fra1)

React 19 + Vite SPA. Supabase DB backend (Phase 2 complete). Live poller backend on DigitalOcean.

**Supabase project:** `https://jryorwbomnilewfrdmrg.supabase.co`
Tables: `changes` (JSONB), `freeze_periods` (JSONB), `tickets`, `ticket_events`, `ticket_evidence`,
        `ripe_measurements`, `bgp_visibility`, `dns_measurements`, `correlation_scores`,
        `ioda_signals`, `community_signals`
Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `.env`, not committed)
          `RIPE_ATLAS_KEY` — RIPE Atlas API key (in `.env` on droplet)
          `CF_RADAR_TOKEN` — Cloudflare Radar API token (in `.env.supabase` on droplet)
          `AUTOMATION_API_KEY` — protects `/api/tickets/:id/notes`
`.env.production` sets `VITE_POLLER_WS=wss://api.chemafmp.dev` (not committed)

**Droplet deploy:**
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
CREATE TABLE IF NOT EXISTS correlation_scores (
  id bigserial PRIMARY KEY, market_id text, score int, status text,
  alerts text[], ioda_active int, radar_alerts int, ris_wd_1h int,
  measured_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ioda_signals (
  id bigserial PRIMARY KEY, market_id text, ioda_asn int,
  bgp_score numeric, ping_count numeric,
  measured_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS community_signals (
  id bigserial PRIMARY KEY, market_id text,
  complaints numeric, ratio numeric,
  measured_at timestamptz DEFAULT now()
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

# Poller pause/resume (runtime, no restart needed):
GET  /api/control/poller/status          → {ripe:"running", bgp:"paused", ...}
POST /api/control/poller/pause/:module   → pause one module
POST /api/control/poller/resume/:module  → resume one module
POST /api/control/poller/pause-all       → pause all 7 modules
POST /api/control/poller/resume-all      → resume all modules
     modules: ripe · bgp · dns · ioda · ris · radar · service-status

# Network Health API:
GET  /api/network-health              → array of 9 markets (see shape below)

# Service Status (Downdetector / simulator):
GET  /api/service-status              → array of 10 markets:
     { id, name, flag, baseline, complaints, ratio, status, trend[], history[], services, dataSource }
     history[]: [{ts, value, ratio}] — Supabase-persisted, survives restarts

# Ticketing API (server/tickets.js):
POST   /api/tickets                   → create ticket
GET    /api/tickets                   → list (filters: type,status,severity,country,node,team,sla_at_risk)
GET    /api/tickets/:id               → ticket + events + evidence
GET    /api/tickets/sla               → tickets at risk or breached
PATCH  /api/tickets/:id               → update fields
POST   /api/tickets/:id/events        → add log event
POST   /api/tickets/:id/evidence      → add evidence link
POST   /api/tickets/:id/notes         → automation alias (x-api-key header, body: {content, source, metadata})
```

---

## Poller Control — Cheat Sheet

```bash
# Status
curl https://api.chemafmp.dev/api/control/poller/status

# Pause all (zero external traffic)
curl -X POST https://api.chemafmp.dev/api/control/poller/pause-all

# Resume all
curl -X POST https://api.chemafmp.dev/api/control/poller/resume-all

# Per module (ripe · bgp · dns · ioda · ris · radar · service-status)
curl -X POST https://api.chemafmp.dev/api/control/poller/pause/ioda
curl -X POST https://api.chemafmp.dev/api/control/poller/resume/ioda
```

> Pause is in-memory — container restart resumes all modules automatically.

---

## File Structure

```
server/
  poller.js              # Express + WS server. Fleet management, poll cycle, WebSocket broadcast,
                         # Chaos Control API, Poller Control pause/resume API.
                         # Auto-creates tickets from alarms sequentially (race condition fix).
  tickets.js             # ★ Ticketing router — all /api/tickets/* endpoints.
                         # generateTicketId uses LIKE on id column (not seq_number).
                         # autoCreateTicketFromAlarm exported and called by poller.js.
  node-sim.js            # Simulated SNMP node (child_process.fork). Sends metrics to poller.
  lib/
    poller-control.js    # ★ Runtime pause/resume per module. Singleton Set<string>.
                         # Exports: isPaused(m), pauseModule(m), resumeModule(m),
                         # pauseAll(), resumeAll(), getPollerStatus(), POLLER_MODULES[].
                         # Every tick function imports isPaused() and returns early if paused.
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
                         #   as ripe-atlas.js. Per-probe breakdown. Dynamic baseline.
                         #   Exports: initDnsMeasurements, tickDnsMeasurements, getDnsMeasurements.
    ioda.js              # ★ CAIDA IODA v2. Base: api.ioda.inetintel.cc.gatech.edu/v2
                         #   3 API calls per market per tick (1.2s apart):
                         #     /v2/outages/events → macroscopic outage events
                         #     /v2/signals/raw/asn/{asn}?datasource=bgp → BGP score history
                         #     /v2/signals/raw/asn/{asn}?datasource=ping-slash24 → /24 up count
                         #   Turkey override: IODA uses AS15897, RIPE Atlas keeps AS15924.
                         #   Supabase: ioda_signals table, 36h retention, preloaded on boot.
                         #   Exports: initIoda (async), tickIoda, getIoda.
    ris-live.js          # ★ RIPE RIS Live WebSocket stream. Real-time BGP UPDATE messages.
                         #   Dedup: (type, prefix, 60s bucket) — one withdrawal per prefix per minute.
                         #   Thresholds: WARN ≥3 wd/h · ALERT ≥10 wd/h.
                         #   Exports: initRisLive, tickRisLive, getRisLive, stopRisLive.
    cf-radar.js          # ★ Cloudflare Radar BGP hijack/leak events. Requires CF_RADAR_TOKEN.
                         #   Exports: initCfRadar, tickCfRadar, getCfRadar.
    correlation.js       # ★ Health score 0-100. Penalties per signal + cross-penalties.
                         #   score=100 nominal, <40 = incident. insight text generated.
    correlation-history.js # Supabase persistence for correlation_scores. 36h retention.
    service-status.js    # ★ Downdetector simulator (USE_SCRAPER=0) or real scraper (=1).
                         #   trend[]: starts EMPTY on boot, fills with real measured values only
                         #   (no flat baseline padding). Max HISTORY_LEN=2880 (24h at 30s/tick).
                         #   history[]: [{ts,value,ratio}] persisted to Supabase community_signals,
                         #   preloaded on boot via initServiceStatus(). Survives restarts.
                         #   Supabase: community_signals table, 36h retention.
                         #   Exports: initServiceStatus (async), tickServiceStatus, getServiceStatus.

src/
  App.jsx                # Main app — state, navigation, layout.
                         # NetworkHealthView gets onOpenSignalFusion prop.
                         # SignalFusionView gets onOpenNetworkHealth prop.
                         # PWA: 3 tiles (Service Monitor, Network Health, Signal Fusion).
  context/
    ChangesContext.jsx   # Supabase CRUD + all change state
    NodesContext.jsx     # Network inventory state (localStorage)
  hooks/
    usePollerSocket.js   # WebSocket hook → { connected, liveAlarms, liveEvents, nodeSnapshots }
  data/
    seed.js              # SEED_CHANGES, DEMO_CHANGES, PEAK_PERIODS
    constants.js         # T (theme), TEAMS, DEPTS, DIRECTORS, MANAGERS, SYSTEMS,
                         # COUNTRIES, RISK_LEVELS, STATUS_META, RISK_C, EXEC_RESULTS
    inventory/           # Node inventory seed data
  utils/
    db.js                # Supabase CRUD
    helpers.js           # fmt, fmtDT, genId, genChangeId, applyVars, exportAuditCSV, etc.
    tickets.js           # fetchTickets, fetchTicket, patchTicket (Supabase direct from frontend)
  components/
    ui/index.jsx         # Badge, RiskPill, FreezeTag, TypeTag, IntrusionTag, Btn, Inp, Sel, Card, Modal
    LiveStatusView.jsx   # Per-node incident aggregation. Ticket badge on alarm rows.
    ChaosControlPanel.jsx# Kill/revive/scenario modal (opened from sidebar LIVE pill)
    AlarmsView.jsx       # Flat alarm table. Ticket badge in detail drawer.
    TicketListView.jsx   # ★ Ticket list — opens tickets in new tab via window.open('#ticket=ID')
    TicketDetailView.jsx # ★ Full-screen ticket detail (hash routing + fullScreen prop).
                         # Working state dropdown, SLA timer, log tab with 3 categories.
    EventsView.jsx       # Event log (placeholder — needs redesign)
    ChangeDetail.jsx     # Full change panel
    CreateChange.jsx     # New change wizard
    FreezeManager.jsx    # Freeze period CRUD
    TimelineView.jsx     # Gantt calendar
    ObservabilityView.jsx# Metrics charts
    TopologyView.jsx     # Network topology map
    NetworkInventory.jsx # Node inventory CRUD
    ServiceStatusView.jsx# ★ PWA / service monitor. Props: mobile, onOpenTicket.
                         # Sparkline uses svc.trend[] (real measured values only, no fake baseline).
                         # DetailChart: SVG with MA, threshold zones, crossing annotations.
                         # Standalone PWA: App.jsx detects navigator.standalone → renders directly.
    NetworkHealthView.jsx# ★ RIPE Atlas Network Health. GET /api/network-health every 30s.
                         # Props: onOpenSignalFusion() — shows "Open Signal Fusion →" CTA.
                         # MarketCard: 3×2 metric grid + alert badge row (warn/alert signals).
                         # DetailPanel: 6 charts, 7 zoom options, ProbeBreakdown modal.
                         # CorrelationPanel + MetricsGlossary REMOVED (moved to Signal Fusion).
    SignalFusionView.jsx # ★ Cross-signal correlation view.
                         # Fetches /api/network-health + /api/service-status every 30s.
                         # Signal Matrix: 9 markets × 6 signals (Atlas·BGP·RIS·Radar·IODA·DD).
                         #   "Downdetector" col (shortLabel "DD"), not "Community".
                         #   "Degraded only" toggle. Health score (0-100) per market.
                         # Event Feed: chronological stream. ⚡ clusters = 2+ signals / market / 30min.
                         # Market Detail Panel (400px wide): opens on row click.
                         #   CorrelationChart: 5 series SVG (Downdetector amber area, Atlas RTT blue,
                         #   BGP vis% orange, IODA BGP purple, IODA ping cyan) + RIS red markers.
                         #   Zoom selector: 30m · 1h · 2h · 6h · 12h · 24h.
                         #   Hover tooltip: crosshair + dots on each series + raw values + time.
                         #   Uses svc.history[] (Supabase) with svc.trend[] fallback.
                         # AboutMetrics: collapsible section at bottom. 8 concepts explained.
                         # Props: onOpenNetworkHealth() — "Open in Network Health →" button.
                         # PWA: 3rd tile (purple 🔀).
```

---

## Signal Fusion — How it works

`src/components/SignalFusionView.jsx` — view id `"signal_fusion"`, sidebar "🔀 Signal Fusion" under MONITORING.

**6 signal columns:**
| Key | Icon | Label | Source | Metric |
|---|---|---|---|---|
| atlas | 📡 | Atlas | RIPE Atlas msm#1001 | avg RTT ms, ratio |
| bgp | 🔗 | BGP | RIPE Stat routing-status | visibility % |
| ris | 🔄 | RIS Live | RIPE RIS WebSocket | withdrawals/h |
| radar | ☁️ | Radar | Cloudflare Radar | event count |
| ioda | 🌐 | IODA | CAIDA IODA v2 | active events |
| smon | 👥 | Downdetector | service-status API | reports, ratio |

**Health Score (0-100):** Atlas WARNING −10/OUTAGE −25 · BGP WARNING −8/OUTAGE −20 ·
RIS WARNING −5/ALERT −15 · Radar ALERT −10 · IODA ALERT −10 · DD WARNING −5/OUTAGE −15.
Cross-penalty: 2+ signals degrade together → additional −10.

**Incident clustering:** 2+ signal events on same market within 30min → "PROBABLE INCIDENT" in feed.

**CorrelationChart series:**
- 🟡 Downdetector — `svc.history[].value` (Supabase) or `svc.trend[]` fallback. 30s resolution.
- 🔵 Atlas RTT — `market.history[].avg_rtt` (5min resolution, 36h)
- 🟠 BGP vis% — `market.bgp.history[].visibility_pct`
- 🟣 IODA BGP — `market.ioda.signals.bgp.history[].value`
- 🩵 IODA ping — `market.ioda.signals.ping.history[].value`
- 🔴 RIS markers — `market.ris.recentWithdrawals[].ts` (vertical dashes)
All series normalised to [0,1] independently. Zoom: 30m/1h/2h/6h/12h/24h.
Hover: crosshair + dots on each series + tooltip with raw values + timestamp.

---

## Ticketing System — How it works

### Supabase tables
- `tickets` — `id` (BNOC-INC-XXXXXXXX), `type`, `severity`, `status`, `working_state`,
  `owner_name`, `team`, `impacted_nodes[]`, `alarm_id`, `alarm_type`, `tags[]`, etc.
- `ticket_events` — timeline log: `ticket_id`, `event_type`, `actor_name`, `content`, `metadata`
- `ticket_evidence` — `ticket_id`, `type`, `label`, `url`, `metadata`, `uploaded_by`

### ID generation (`server/tickets.js`)
```js
const { data } = await db.from("tickets").select("id").like("id", `BNOC-${prefix}-%`)
  .order("id", { ascending: false }).limit(1);
```

### Auto-create from alarms
Sequential (not parallel) to avoid ID collisions:
```js
for (const alarm of allNewAlarms) { await autoCreateTicketFromAlarm(alarm, nodeMeta); }
```

### Hash routing for full-screen ticket
`window.open('#ticket=BNOC-INC-XXXXXXXX', '_blank')` — App.jsx reads hash on load.
User session in `sessionStorage` so new tabs keep the login.

### Working state
`unassigned | acknowledged | active_work | waiting | at_risk | stalled`

### SLA tiers
| Severity | Ack | Mitigate | Resolve |
|---|---|---|---|
| sev1 | 5 min | 60 min | 240 min |
| sev2 | 15 min | 240 min | 480 min |
| sev3 | 60 min | 1440 min | 4320 min |
| sev4 | 240 min | 4320 min | 10080 min |

---

## WebSocket Data Shape (`usePollerSocket`)

```js
// poll-result message broadcast every ~10s:
{
  type: "poll-result", cycle: number, timestamp: ISO string,
  nodes: { [nodeId]: { reachable, cpu, mem, temp, uptime, interfaces[], bgpPeers[] } },
  newAlarms: Alarm[], resolvedAlarms: Alarm[], newEvents: Event[], activeAlarmCount: number,
}
// Alarm: { id, key, nodeId, type, severity, status, message, since, resolvedAt }
// types: PERFORMANCE | INTERFACE | HARDWARE | BGP | REACHABILITY
```

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
| MONITORING | `events` | EventsView ← placeholder, needs redesign |
| MONITORING | `observability` | ObservabilityView |
| MONITORING | `network_health` | NetworkHealthView ★ |
| MONITORING | `signal_fusion` | SignalFusionView ★ |
| TICKETS | `tickets_*` | TicketListView, TicketDetailView |
| PWA only | `service_monitor` | ServiceStatusView |
| PWA only | `network_health` | NetworkHealthView |
| PWA only | `signal_fusion` | SignalFusionView |

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

---

## Key Domain Concepts

- **Change record** — `status` (Draft → Preflight → Pending Approval → Approved → In Execution → Completed/Failed/Aborted), `category` (Normal/Standard/Emergency), `risk` (Low/Medium/High/Critical), `approvalLevel` (L1/L2/L3)
- **Templates** — `isTemplate:true`, `variables[]`, `{{key}}` placeholders, `sourceTemplateId`
- **Freeze periods** — `severity:"orange"` = Manager approval, `"red"` = Director approval
- **Users** (`USERS` in App.jsx) — roles: Engineer, Manager, Director, NOC/SAC, Bar Raiser
- **Approval levels** — L1 (Engineer), L2 (Manager/Director), L3 (Director only)

---

## Backlog / Session History

### ✅ Sessions 1-4 — Core platform
  Change management CRUD, Supabase migration, templates, freeze periods, timeline, topology

### ✅ Session 5 — Service Monitor + PWA
  SVG chart (threshold zones, MA, crossings), live value bar, zoom, PWA (iPhone app), share button

### ✅ Session 6 — Ticketing + Automation API
  Supabase tickets, auto-create from alarms, SLA timer, working state, automation POST /notes

### ✅ Session 6b — Network Health View
  RIPE Atlas latency, BGP visibility, DNS RTT, 9 markets, ratio model, probe breakdown

### ✅ Session 7 — Correlation Layer
  Cloudflare Radar, CAIDA IODA, RIPE RIS Live, correlation score 0-100, CorrelationPanel,
  SignalDetailModal, RIS dedup fix, droplet deploy alias

### ✅ Session 8 — Signal Fusion + Persistence (2026-04-11)

  **IODA v2 native** (`server/lib/ioda.js` rewrite):
  - New URL: `api.ioda.inetintel.cc.gatech.edu/v2` (no cloud IP block)
  - 3 API calls/market: outage events + BGP signal + ping-slash24 signal
  - Turkey: AS15897 for IODA (vs AS15924 for RIPE Atlas)
  - Supabase `ioda_signals` table, 36h persistence, preloaded on boot
  - Removed: Mac cron `ioda-sync.py`, `/api/ioda-push` endpoint

  **Signal Fusion view** (`src/components/SignalFusionView.jsx`):
  - Signal Matrix: 9 markets × 6 signals, health score, "Degraded only" toggle
  - Event Feed: chronological + ⚡ incident clustering
  - Market Detail Panel (400px): metrics, signal layers, CorrelationChart, About
  - CorrelationChart: 5 series + RIS markers, zoom 30m-24h, hover tooltip with raw values
  - AboutMetrics: collapsible, explains all 8 concepts
  - PWA: 3rd tile (purple)

  **NetworkHealthView cleanup**:
  - Removed CorrelationPanel + MetricsGlossary (moved to Signal Fusion)
  - Added "Open Signal Fusion →" CTA banner
  - `onOpenSignalFusion` prop wired from App.jsx

  **community_signals Supabase persistence**:
  - `service-status.js`: saveCommunitySignal() every 30s tick, loadCommunityHistory() on boot
  - `trend[]` starts empty (no fake baseline padding) — sparklines show real data only
  - `svc.history[]` returned in API, used by CorrelationChart (Supabase-backed)

  **Poller Control** (`server/lib/poller-control.js`):
  - Runtime pause/resume per module without container restart
  - All 7 tick functions check `isPaused()` at entry
  - REST endpoints: GET/POST /api/control/poller/*

### 🔲 Next — EventsView redesign
  Replace placeholder EventsView with real Incident Timeline:
  - Merge liveEvents (WS) + change status transitions (crs)
  - ⚡ correlation badge when change "In Execution" during alarm on same node
  - Filter: severity + type

### 🔲 Phase 3 — Authentication (Supabase Auth magic link or SSO)
### 🔲 Phase 4 — RBAC with RLS

---

## Network Health — Data shape

```js
// GET /api/network-health → array of 9 markets:
{
  id, name, flag, asn, ok, error,
  current: { avg_rtt, p95_rtt, loss_pct, probe_count, measured_at },
  baseline_rtt, ratio, status,
  history: [{ measured_at, avg_rtt, p95_rtt, loss_pct }],   // 36h, 5min intervals
  totalProbes, probeDetails[], probeLocations[],
  bgp: { current: { visibility_pct, ris_peers_seeing, total_ris_peers, announced_prefixes },
         history[], status, ok, error },
  dns: { current: { dns_rtt, p95_dns_rtt, probe_count }, history[], baseline_rtt, ratio,
         status, ok, error, probeDetails[] },
  ris: { status, connected, withdrawals1h, announces1h, recentWithdrawals[], recentAnnouncements[] },
  radar: { status, configured, alertCount, events[] },
  ioda: { status, hasActiveEvent, activeCount, recentCount, events[], iodaAsn,
          signals: { bgp: { current, history[], unit }, ping: { current, history[], unit } } },
  correlation: { score, status, insight, alerts[] },
  correlationHistory: [{ measured_at, score, status }],
}
```

---

## ESLint Notes

- Flat config (`eslint.config.js`) ESLint 9+
- `no-unused-vars` allows `/^[A-Z_]/` (uppercase constants)
- JSX in `.jsx` files only
