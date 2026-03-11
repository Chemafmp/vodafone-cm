# Bodaphone BNOC — Change Management Platform

A production-ready Change Management tool for network operations teams. Manage, approve, execute and audit infrastructure changes with full traceability, freeze period enforcement, and reusable templates.

---

## Features

### Change Lifecycle
- **Full status workflow**: Draft → Preflight → Pending Approval → Approved → In Execution → Completed / Failed / Rolled Back / Aborted / Off-Script
- **Approval tiers**: L1 (Engineer self-approve), L2 (Manager), L3 (Director + Bar Raiser)
- **Categories**: Standard (pre-approved), Normal (CAB), Emergency (immediate, Director required)
- **Risk levels**: Low / Medium / High / Critical — drives approval requirements
- **Preflight checks**: Configurable automated checks that must pass before execution begins
- **Step-by-step execution**: Timed steps with engineer assignment, pre/post checks, rollback per step
- **Audit log**: Every state transition recorded with timestamp, actor, and message
- **CAB panel**: Change Advisory Board bulk approval / rejection

### Freeze Period Enforcement
- **Peak period calendar** (`PEAK_PERIODS` in `seed.js`) — date ranges that block non-emergency changes
- **Active freeze banner** shown across the entire app when a freeze is active
- **Freeze justification** required to override — automatically routed to Director approval
- Freeze periods are independent of scheduling and always enforced

### Templates & Template Variables
- **Reusable templates**: Pre-built change blueprints with steps, preflight checks, rollback plans and service impact
- **Template variables** (`{{key}}` syntax): Define substitutable placeholders in any template field
  - Variables appear as input fields when using Quick Fill
  - **Live preview** — title and step names update in real time as you type
  - Required variables block creation until filled
  - Variable values are substituted recursively across name, description, steps, commands, rollback
- **Variable definition wizard**: When creating a new template via the wizard, define variables with key, label, and required flag

### Timeline View
- Gantt-style calendar spanning 7 days past to 14 days future
- Per-team rows, colour-coded by status
- Freeze period highlighting

### Notifications & Comments
- **Notifications panel**: Alerts for pending approvals, failed changes, changes needing attention
- **Comment stream**: Per-change threaded comments with author and timestamp

### Multi-user Roles
| Role | Capabilities |
|------|-------------|
| Engineer | Create changes, execute approved changes, self-approve Standard/L1 |
| Manager | L2 approval, all engineer capabilities |
| Director | L3 approval, override freeze periods |
| Bar Raiser | Required for Critical risk and Emergency changes |
| NOC/SAC | Monitor execution, view all changes |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 19 |
| Build | Vite 7 |
| Styling | Inline styles, theme object `T` |
| State | `useState` / `useMemo` (no external library) |
| Data | In-memory seed data (no backend) |
| Routing | None — single view, `view` state string |
| Linting | ESLint 9 (flat config) |

---

## Getting Started

```bash
# Install dependencies
npm install

# Start development server (HMR)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
```

App runs at `http://localhost:5173` by default.

---

## Architecture

### File Structure

```
src/
├── App.jsx                    # Main app — all top-level state and views
├── main.jsx                   # React entry point
├── data/
│   ├── constants.js           # T (theme), TEAMS, DEPTS, STATUS_META, RISK_LEVELS, etc.
│   └── seed.js                # SEED_CHANGES (5 records), PEAK_PERIODS
├── utils/
│   ├── helpers.js             # fmt(), genId(), applyVars(), isInPeakPeriod(), etc.
│   └── id.js                  # genId() standalone export
└── components/
    ├── ui/
    │   └── index.jsx          # Badge, RiskPill, FreezeTag, Btn, Inp, Sel, Card, Modal
    ├── ChangeDetail.jsx       # Full change detail panel (steps, approvals, audit log)
    ├── TimelineView.jsx       # Gantt-style calendar
    ├── CreateChange.jsx       # CreateModePicker, TemplateQuickFill, CreateChangeMCM wizard
    ├── NotificationsPanel.jsx # Alerts panel
    ├── CommentStream.jsx      # Per-change comment thread
    └── CABPanel.jsx           # Change Advisory Board panel
```

### Key State (App component)

```js
const [changes, setChanges]   // Full change record array (starts from SEED_CHANGES)
const [selected, setSelected] // Currently open change (for detail panel)
const [view, setView]         // "dashboard" | "changes" | "timeline" | "templates" | "audit"
const [user, setUser]         // Active user (switched via bottom-left selector)
const [filters, setFilters]   // Change list filter state
```

### Change Record Shape

```js
{
  id: "BNOC-12345678",
  name: "Core Router OS Upgrade — PE-MNL01",
  status: "Approved",                    // workflow status
  category: "Normal",                    // Standard | Normal | Emergency
  risk: "High",                          // Low | Medium | High | Critical
  approvalLevel: "L2",                   // L1 | L2 | L3
  type: "Unique",                        // Unique | Template | Standard
  domain: "Core Network",
  team: "Core Transport",
  dept: "Engineering",
  director: "Matt I.",
  manager: "Chema F.",
  country: "DE",
  scheduledFor: "2026-03-15T02:00:00Z",
  scheduledEnd:  "2026-03-15T04:00:00Z",
  freezePeriod: false,
  freezeJustification: "",
  isTemplate: false,
  variables: [],                         // template variable definitions
  steps: [{ id, name, duration, role, preChecks, postChecks, rollback, commands }],
  stepLogs: { [stepId]: { status, startedAt, completedAt, notes } },
  preflightResults: { [checkId]: { status, output } },
  approvals: [{ role, name, decision, at, comment }],
  auditLog:  [{ at, msg, type, by }],
  comments:  [{ id, author, text, at }],
  serviceImpact: "",
  rollbackPlan:  "",
  incidentId:    "",
  execMode:  "Automated",               // Automated | Manual | Hybrid
  intrusion: "Intrusive",               // Intrusive | Non-Intrusive | Partially Intrusive
}
```

### Template Variables

Templates use `{{key}}` syntax in any string field:

```js
// Template definition in seed.js
{
  isTemplate: true,
  variables: [
    { key: "hostname", label: "Hostname",      type: "text", required: true,  defaultValue: "" },
    { key: "bgp_as",   label: "BGP AS Number", type: "text", required: true,  defaultValue: "" },
  ],
  name: "BGP Route Update — {{hostname}}",
  steps: [
    { name: "Pre-checks on {{hostname}}", ... }
  ]
}

// applyVars() substitutes recursively across the entire object
import { applyVars } from "./utils/helpers.js";
const resolved = applyVars(template, { hostname: "PE-MNL01", bgp_as: "65001" });
// → { name: "BGP Route Update — PE-MNL01", steps: [{ name: "Pre-checks on PE-MNL01", ... }] }
```

### Adding Freeze Periods

Edit `src/data/seed.js`:

```js
export const PEAK_PERIODS = [
  {
    id: "peak-q1-2026",
    name: "Super Promo MAR 2026",
    start: "2026-03-07",
    end:   "2026-03-14",
    reason: "All changes require Director approval + business justification.",
    severity: "high",   // high | medium
  },
];
```

---

## Seed Data

The app ships with 5 pre-loaded records:

| Name | Status | Type |
|------|--------|------|
| Core Router OS Upgrade — `{{hostname}}` | Draft | Template |
| BGP Route Update — `{{hostname}}` | Draft | Template |
| DNS Zone Update — `{{zone_name}}` | Draft | Template |
| Batch Server Upgrade — Madrid Cluster | In Execution | Unique |
| Emergency DNS Failover | Failed | Unique |

IDs are generated at startup with `genId()` (format: `BNOC-XXXXXXXX`).

---

## Deploying to GitHub Pages

```bash
npm run build
git checkout gh-pages
cp -r dist/* .
git add -A
git commit -m "deploy: $(date +%Y-%m-%d)"
git push origin gh-pages
git checkout main
```

---

## Roadmap (Prototype → Production)

### Backend & Persistence
- [ ] REST API (FastAPI / Node.js) replacing in-memory seed data
- [ ] PostgreSQL for change records, audit logs, comments
- [ ] WebSocket / SSE for real-time execution updates
- [ ] File/attachment support for rollback plans and evidence

### Authentication & RBAC
- [ ] SSO integration (SAML / OAuth2 with corporate IdP)
- [ ] Fine-grained RBAC tied to real user directory
- [ ] Session management and audit trail with real user identity

### Integrations
- [ ] ITSM ticketing (ServiceNow / Jira) — auto-create tickets from changes
- [ ] CI/CD pipelines — trigger Jenkins/GitLab jobs from step execution
- [ ] Monitoring integration — auto-attach alerts to change records
- [ ] Notification channels — email, Slack, Teams alerts on status changes
- [ ] CMDB sync — auto-populate team/system fields from configuration database

### Execution Engine
- [ ] Ansible / Terraform runbook execution
- [ ] Automated preflight script runner
- [ ] Rollback automation
- [ ] Evidence collection (screenshots, command output, metrics)

### UX Improvements
- [ ] Mobile-responsive layout
- [ ] Dark mode
- [ ] Bulk actions on change list
- [ ] Drag-and-drop timeline rescheduling
- [ ] Change dependency mapping
- [ ] Export to PDF / Word

---

*Internal tool — Bodaphone Network Operations Centre (BNOC)*
