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

## Current State — v1.1-prototype

**Tag:** `v1.1-prototype` | **Live:** https://chemafmp.github.io/vodafone-cm/

React 19 + Vite SPA. **No backend, no auth, all data in-memory.** Next step is Phase 1: localStorage persistence.

---

## File Structure

```
src/
  App.jsx                  # Main app — all state, navigation, layout (~1700 lines)
  data/
    seed.js                # SEED_CHANGES (5 records) + PEAK_PERIODS (5 freeze periods)
    constants.js           # T (theme), TEAMS, DEPTS, DIRECTORS, MANAGERS, SYSTEMS,
                           # COUNTRIES, RISK_LEVELS, STATUS_META, RISK_C, EXEC_RESULTS
  utils/
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

Counters are initialised in `App.jsx` at module level from the seed counts.
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
const [changes, setChanges]   // All records (templates + changes)
const [peaks, setPeaks]        // Freeze periods (from PEAK_PERIODS seed, CRUD via FreezeManager)
const [selected, setSelected]  // Currently open change in detail panel
const [view, setView]          // "dashboard" | "changes" | "timeline" | "peakcal" | "audit" | "mywork"
const [filters, setFilters]    // Changes view filters (kind, status, risk, team, etc.)
const [currentUser, setCurrentUser]  // Active user (role-based UI)

// Derived
const templates = changes.filter(c => c.isTemplate)
const crs = changes.filter(c => !c.isTemplate)
const filtered = useMemo(...)    // Filtered + sorted changes for current view
const activePeak = useMemo(...)  // Current active freeze period if any
const tmplStats = useMemo(...)   // Per-template usage metrics {total, ok, fail, running}
```

`updateChange(id, updater)` — updates both `changes[]` and `selected` simultaneously.

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

### 🔲 Phase 1 — localStorage (NEXT)
**Goal:** Data survives page reload. No backend needed. Single-user only.

What to persist: `changes`, `peaks` (freeze periods), ID counters.
What NOT to persist yet: user session, audit timestamps (keep `now()`).

Implementation plan:
- Add `useLocalStorage(key, defaultValue)` custom hook in `src/utils/storage.js`
- Replace `useState(SEED_CHANGES)` → `useLocalStorage("bnoc_changes", SEED_CHANGES)`
- Replace `useState(PEAK_PERIODS)` → `useLocalStorage("bnoc_peaks", PEAK_PERIODS)`
- Persist ID counters: save `_changeSeq` / `_templateSeq` to localStorage, init from stored value
- Add a "Reset to seed data" dev button (hidden, e.g. shift+click on logo) for demos
- No schema migrations needed yet (add a `_version` key for future use)

### 🔲 Phase 2 — Supabase DB
Replace localStorage with Supabase tables. Add real-time subscriptions.
Tables: `changes`, `freeze_periods`, `users`.

### 🔲 Phase 3 — Authentication
Supabase Auth (email magic link or SSO). `currentUser` from real session.

### 🔲 Phase 4 — RBAC with RLS
Row-Level Security in Supabase. Each user sees only what their role allows.

### 🔲 Phase 5 — Real-time
Supabase Realtime subscriptions. Multiple users see live updates.

---

## ESLint Notes

- Flat config (`eslint.config.js`) ESLint 9+
- `no-unused-vars` allows `/^[A-Z_]/` (uppercase constants)
- JSX in `.jsx` files only
