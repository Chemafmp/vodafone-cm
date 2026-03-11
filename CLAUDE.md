# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

## Commands

```bash
npm run dev -- --port 5178   # Dev server (always use port 5178)
npm run build                 # Production build
npm run lint                  # ESLint
```

**If the app is blank after starting dev:** delete `.vite/` cache and restart.
```bash
rm -rf node_modules/.vite .vite && npm run dev -- --port 5178
```

**Deploy to GitHub Pages:**
```bash
npm run build
cd /tmp && rm -rf gh-deploy && mkdir gh-deploy && cd gh-deploy
git init && git remote add origin https://github.com/Chemafmp/vodafone-cm.git
git fetch origin gh-pages --depth=1 && git checkout gh-pages
cp -r /Users/josemafernandez/vodafone-cm/dist/. . && touch .nojekyll
git add -A && git commit -m "Deploy: <description>" && git push origin HEAD:gh-pages --force
```

---

## Current State — v1.2

**Live:** https://chemafmp.github.io/vodafone-cm/

React 19 + Vite SPA. **Supabase DB backend (Phase 2 complete).** Data persists across devices/users. No auth yet (Phase 3 next).

**Supabase project:** `https://jryorwbomnilewfrdmrg.supabase.co`
Tables: `changes` (JSONB), `freeze_periods` (JSONB)
Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (in `.env`, not committed)

---

## File Structure

```
src/
  App.jsx                  # Main app — all state, navigation, layout (~1700 lines)
  data/
    seed.js                # SEED_CHANGES (7 records: 5 templates + 2 op changes)
                           # DEMO_CHANGES (20 realistic network changes)
                           # PEAK_PERIODS (6 freeze periods)
    constants.js           # T (theme), TEAMS, DEPTS, DIRECTORS, MANAGERS, SYSTEMS,
                           # COUNTRIES, RISK_LEVELS, STATUS_META, RISK_C, EXEC_RESULTS
  utils/
    db.js                  # Supabase CRUD: fetchChanges, upsertChange, deleteChange,
                           # fetchPeaks, upsertPeak, syncPeaks, resetToSeedDB, loadDemoDB
    storage.js             # localStorage helpers (legacy, kept for resetToSeed/loadDemoData)
    helpers.js             # fmt, fmtDT, genId, genChangeId, genTemplateId,
                           # initChangeCounter, initTemplateCounter, now,
                           # isInPeakPeriod, getActivePeak, applyVars,
                           # CAT_META, getCategoryRules, exportAuditCSV
  components/
    ui/index.jsx           # Badge, RiskPill, FreezeTag, TypeTag, IntrusionTag,
                           # Btn, Inp, Sel, Card, Modal
    ChangeDetail.jsx       # Full change panel (steps, approvals, audit log, comments)
    CreateChange.jsx       # + New Change flow: CreateModePicker, TemplateQuickFill,
                           # CreateChangeMCM (4-step wizard)
    FreezeManager.jsx      # Freeze period CRUD (orange/red severity)
    TimelineView.jsx       # Gantt calendar view
    CABPanel.jsx           # Change Advisory Board approvals
    CommentStream.jsx      # Per-change comment thread
```

---

## ID System

| Type | Format | Example | Counter init |
|---|---|---|---|
| Operational changes | `BNOC-0000000001-A` | `BNOC-0000000003-A` | `initChangeCounter(2)` |
| Template blueprints | `BNOC-TEM-00000001-A` | `BNOC-TEM-00000003-A` | `initTemplateCounter(3)` |
| Freeze periods etc. | `BNOC-XXXXXXXX` (random) | `BNOC-87351209` | `genId()` |

Counters are initialised in `App.jsx` on mount from the max ID in the loaded data (Option B — self-healing).
New changes: `genChangeId()` · New templates: `genTemplateId()` · Non-change: `genId()`

---

## Key Domain Concepts

- **Change record** — `status` (Draft → Preflight → Pending Approval → Approved → In Execution → Completed/Failed/Aborted/etc.), `category` (Normal/Standard/Emergency), `risk` (Low/Medium/High/Critical), `approvalLevel` (L1/L2/L3), `steps[]`, `preflightResults`, `approvals[]`, `auditLog[]`, `comments[]`
- **Templates** — `isTemplate:true`, `variables:[{key,label,type,required,defaultValue}]`, `{{key}}` placeholders in all text fields. Changes created from templates have `sourceTemplateId`.
- **Freeze periods** — `PEAK_PERIODS` in React state (`peaks`). `severity:"orange"` = Manager approval, `severity:"red"` = Director approval. Changes get `freezePeriod:true`, `freezeSeverity:"orange"|"red"` when scheduled inside a freeze.
- **Users** (`USERS` in App.jsx) — roles: Engineer, Manager, Director, NOC/SAC, Bar Raiser. Role controls available actions.
- **Approval levels** — L1 (Engineer), L2 (Manager/Director), L3 (Director only). Freeze overrides: orange→Manager+, red→Director only.

---

## Changes View — Tab Logic

| Tab | Filter | Default |
|---|---|---|
| ↻ Changes | `!c.isTemplate` | ✅ Yes |
| ⊡ Templates | `c.isTemplate` | No |

`kind:"Changes"` is the default filter value. "All" tab was removed intentionally.

---

## App.jsx Top-level State

```js
const [changes, setChanges]   // All records (templates + changes) — loaded from Supabase on mount
const [peaks, setPeaks]        // Freeze periods — loaded from Supabase, synced on every change
const [loading, setLoading]    // true while Supabase fetch is in flight
const [selected, setSelected]  // Currently open change in detail panel
const [view, setView]          // "changes" | "timeline" | "peakcal" | "audit" | "mywork"
const [filters, setFilters]    // Changes view filters (kind, status, risk, team, etc.)

// Derived
const templates = changes.filter(c => c.isTemplate)
const crs = changes.filter(c => !c.isTemplate)
const filtered = useMemo(...)    // Filtered + sorted changes for current view
const activePeak = useMemo(...)  // Current active freeze period if any
const tmplStats = useMemo(...)   // Per-template usage metrics {total, ok, fail, running}
```

`updateChange(id, updater)` — updates `changes[]` + `selected` in React state AND calls `upsertChange()` to persist to Supabase.
`addChange(newC)` — prepends to state AND calls `upsertChange()`.
`syncPeaks(peaks)` — called via `useEffect` whenever `peaks` changes; wipes and re-inserts all freeze periods in Supabase.

---

## NC_DEFAULTS (new change skeleton)

```js
{
  name:"", domain:"", risk:"Medium", category:"Normal", type:"Ad-hoc",
  execMode:"Manual", intrusion:"Non-Intrusive", approvalLevel:"L1",
  scheduledFor:"", scheduledEnd:"", isTemplate:false, variables:[],
  freezePeriod:false, freezeJustification:"", freezeSeverity:null,
  sourceTemplateId:null,
  steps:[], preflightSteps:[], approvers:[], affectedServices:"",
  description:"", rollbackPlan:"", serviceImpact:"", incidentId:"",
  country:"", team:"", dept:"", director:"", manager:""
}
```

---

## Production Migration Roadmap

The app is fully functional as a prototype. Migration plan (one phase at a time):

### ✅ Phase 0 — Prototype (DONE)
In-memory, all data resets on page reload. Tagged `v1.1-prototype`.

### ✅ Phase 1 — localStorage (DONE)
Data survives page reload. `src/utils/storage.js` — `useLocalStorage`, `resetToSeed`, `loadDemoData`.
Dev toolbar: `⟳ Demo data` / `↺ Reset seed` buttons in sidebar.

### ✅ Phase 2 — Supabase DB (DONE)
Supabase Postgres replaces localStorage. Data shared across devices/users.
- `src/utils/db.js` — all CRUD functions
- `scripts/seed-supabase.mjs` — seeds freeze_periods; changes seeded via `⟳ Demo data` button
- `updateChange` and `addChange` persist to Supabase automatically
- `syncPeaks` keeps freeze_periods in sync via `useEffect`
- Dev toolbar buttons now write to Supabase (not localStorage)

### 🔲 Phase 3 — Authentication (NEXT)
Supabase Auth (email magic link or SSO). `currentUser` from real session.
`USERS` array in App.jsx replaced by `supabase.auth.getUser()`.

### 🔲 Phase 4 — RBAC with RLS
Row-Level Security in Supabase. Each user sees only what their role allows.
Add generated columns (`data->>'team'`, `data->>'status'`) for policy filtering.

### 🔲 Phase 5 — Real-time
Supabase Realtime subscriptions. Multiple users see live updates without refresh.

---

## ESLint Notes

- Flat config (`eslint.config.js`) ESLint 9+
- `no-unused-vars` allows `/^[A-Z_]/` (uppercase constants)
- JSX in `.jsx` files only
