# Bodaphone BNOC — Network Operations Centre Platform

A production-ready NOC platform covering change management, live monitoring, ticketing, and network health intelligence. Built for Vodafone's internal operations teams.

**Live:** https://chemafmp.github.io/vodafone-cm/  
**API:** https://api.chemafmp.dev  
**PWA:** Add to home screen on iPhone → "Chema NOC"

---

## Modules

### Change Management
- **Full lifecycle**: Draft → Preflight → Pending Approval → Approved → In Execution → Completed / Failed / Rolled Back
- **Approval tiers**: L1 (Engineer self-approve), L2 (Manager), L3 (Director + Bar Raiser)
- **Categories**: Standard (pre-approved), Normal (CAB), Emergency (Director required)
- **Preflight checks**, step-by-step execution with per-step rollback, full audit log
- **Templates** with `{{variable}}` substitution and live preview
- **Freeze period enforcement** — peak calendar blocks non-emergency changes

### Live Monitoring
- **Live Status** — per-node incident aggregation (DOWN/DEGRADED/WARNING/HEALTHY), change cross-reference, ticket badges
- **Alarms** — flat alarm table with severity, ticket badge in detail drawer
- **Chaos Control** — kill/revive/scenario for simulated nodes (cascade, maintenance, linkflap, bgpleak, thermal)
- **Observability** — metrics charts per node
- **Topology** — network topology map

### Network Health (RIPE Atlas)
Real network measurements from RIPE Atlas probes physically inside Vodafone's AS, across 9 European markets:

| Metric | Source | What it measures |
|---|---|---|
| ICMP Latency (avg + P95) | RIPE Atlas msm #1001 | RTT from inside Vodafone to k-root-servers.net |
| Packet Loss | RIPE Atlas msm #1001 | Loss % from Vodafone probes |
| BGP Visibility | RIPE Stat routing-status | % of global BGP peers that can route to Vodafone AS |
| DNS RTT | RIPE Atlas msm #10001 | DNS query time from inside Vodafone's resolver |

- Dynamic 4h rolling baseline + ratio model (OK <2× / WARNING ≥2× / OUTAGE ≥4.5×)
- Per-probe breakdown modal with ICMP bar chart, DNS RTT column, BGP context panel
- 36h history with zoom (10m/30m/1h/6h/12h/24h/36h)
- Hover tooltip on status pill explains the ratio

### Ticketing System (ITSM)
- **Types**: Incidents (auto-created from alarms), Problems, Requests
- **SLA tracking**: per severity, visual timer, SLA Watch view
- **Auto-ticket**: SEV1/2 alarms create tickets automatically; SEV3/4 auto-resolve
- **Automation API**: `POST /api/tickets/:id/notes` for Camunda/Nagios/Ansible runbooks (x-api-key auth)
- **Reports**: MTTR, SLA compliance, auto vs manual breakdown

### PWA / iPhone App
- Installable as "Chema NOC" on iOS
- Landing page: two tiles — Service Monitor and Network Health
- Safe-area-inset, in-app ticket navigation via hash routing

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 7 |
| Styling | Inline styles, theme object `T` |
| State | useState / Context (no external library) |
| Backend | Node.js + Express + WebSocket |
| Database | Supabase (PostgreSQL) |
| Hosting | GitHub Pages (frontend) + DigitalOcean (backend) |
| Proxy | Caddy 2 with auto Let's Encrypt |
| Monitoring data | RIPE Atlas + RIPE Stat APIs |

---

## Getting Started

```bash
npm install
cp /path/to/.env .env                    # Supabase credentials
cp /path/to/.env.production .env.production   # VITE_POLLER_WS=wss://api.chemafmp.dev
npm run dev -- --port 5178              # Dev server
npm run build                            # Production build
```

Deploy to GitHub Pages (manual):
```bash
npm run build
DIST=$(pwd)/dist
cd /tmp && rm -rf gh-deploy && mkdir gh-deploy && cd gh-deploy
git init && git remote add origin https://github.com/Chemafmp/vodafone-cm.git
cp -r $DIST/. . && touch .nojekyll
git add -A && git commit -m "Deploy: description" && git push origin HEAD:gh-pages --force
```

---

## Backend (DigitalOcean)

Droplet: `bodaphone-lab`, Ubuntu 24.04, fra1, IP `159.89.17.36`

```bash
# Update after git push:
ssh root@159.89.17.36
cd ~/vodafone-cm && git pull && docker compose up -d --build
```

**Services:**
- `poller` — Node.js, port 4000: WebSocket live feed, SNMP simulation, alarm engine, RIPE Atlas polling
- `caddy` — reverse proxy → `api.chemafmp.dev` with auto TLS

**Key env vars on droplet:**
- `VITE_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- `RIPE_ATLAS_KEY` — enables Network Health polling (RIPE Atlas + RIPE Stat APIs)
- `AUTOMATION_API_KEY` — secures `/api/tickets/:id/notes`

---

*Internal tool — Bodaphone Network Operations Centre (BNOC)*
