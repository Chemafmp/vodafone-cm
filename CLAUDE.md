# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Start dev server (Vite HMR)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint (flat config, eslint 9+)
```

No test runner is configured.

## Architecture

This is a **React 19 + Vite** single-page application — a Change Management (CM) tool for Vodafone network operations.

**All application code lives in one file: `src/App.jsx`** (~1600+ lines). There is no router, no external state management, and no backend — all data is in-memory seed data.

### Structure of `src/App.jsx`

1. **Seed / constant data** (top of file) — `TEAMS`, `DEPTS`, `DIRECTORS`, `SYSTEMS`, `STATUS_META`, `RISK_C`, `T` (theme token object), `MW` (maintenance windows), `SEED_CHANGES` (pre-populated change records with full step/log/approval detail).

2. **Primitive UI components** — `Badge`, `RiskPill`, `FreezeTag`, `TypeTag`, `IntrusionTag`, `Btn`, `Inp`, `Sel`, `Card`, `Modal`. All inline-styled using the `T` theme object; no CSS modules or Tailwind.

3. **Feature components**:
   - `TimelineView` — Gantt-style view of scheduled changes
   - `ChangeDetail` — Full detail panel/modal for a single change record (execution steps, approvals, audit log)
   - `MWManager` — Maintenance window management panel
   - `NotificationsPanel` — Alerts for pending/failed changes
   - `CommentStream` — Per-change comment thread
   - `CABPanel` — Change Advisory Board approval panel
   - `CreateChangeMCM` — Multi-step wizard (4 steps) for creating new changes

4. **Main `App` component** (bottom of file) — Holds all top-level state via `useState`/`useMemo`. Navigation is a `view` state string (`"dashboard"`, `"changes"`, `"timeline"`, `"templates"`, `"audit"`). The `updateChange(id, updater)` helper updates both the `changes` array and the `selected` change in one call.

### Key domain concepts

- **Change record** — has `status` (Draft → Preflight → Pending Approval → Approved → Executing → Completed/Failed/etc.), `category` (Normal/Standard/Emergency), `risk`, `approvalLevel` (L1–L3), `steps[]` with `stepLogs`, `preflightResults`, `approvals[]`, `auditLog[]`.
- **Maintenance windows** (`MW`) — changes reference a window by ID; a `freeze: true` window blocks non-emergency changes.
- **Users** (`USERS`) — roles: Engineer, Manager, Director, NOC/SAC, Bar Raiser. Role controls what actions are available in the UI.

### ESLint notes

- Flat config (`eslint.config.js`) using ESLint 9 API.
- `no-unused-vars` allows variables matching `/^[A-Z_]/` (uppercase constants).
- JSX is in `.jsx` files only (no `.js` JSX).
