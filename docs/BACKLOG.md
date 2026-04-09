# Product Backlog

---

## FEAT-001: Observability Swimlane View (4-Level Drill-down)

**Priority:** High
**Added:** 2026-04-09
**Status:** Backlog — design phase, open questions pending

**Problem:** ObservabilityView.jsx shows flat metrics per node. Doesn't scale: 20 countries x 200 sites x 2000 nodes = inviable. NOC teams think in services, not nodes.

**Solution:** Replace ObservabilityView with a 4-level hierarchical swimlane where Y-axis = SERVICES (not nodes). Services are what hurt operationally.

### The 4 Levels

**Level 0 — Global (default view)**
- Grid of countries with aggregated health
- Each card: flag + name + "2 services degraded" + worst severity color
- Click country -> Level 1

**Level 1 — Country View**
- Services in Y-axis (5-8 rows max)
- Time in X-axis (configurable window: 1h, 6h, 12h, 24h)
- Each row = temporal health bar (color = worst severity of its nodes at that time)
- Outage 09:15-09:47 -> red segment in that range
- Cross-reference: if a change was "In Execution" in that window, mark it on the bar
- Click service -> Level 2

**Level 2 — Service Drill-down**
- Service nodes in Y-axis (3-8 nodes — manageable here)
- Node swimlane with events in X-axis (timestamps from liveEvents)
- Each event = point/mark on the line (alarm open, alarm resolve, interface flap, BGP change)
- Changes visible as vertical shaded band
- Click node -> Level 3

**Level 3 — Node Detail Panel (slide-in)**
- Interfaces + BGP peers as sub-rows
- Metrics (CPU/mem/temp) as background sparklines
- Active alarms list
- Changes touching this node

### Available Data

- `COUNTRY_META` -> FJ, HW, IB (flags, names, ASNs)
- `SITES[]` -> 22 sites with type and city
- `SERVICES[]` -> in `src/data/inventory/services.js` (criticality, nodes[], sla, description)
- `liveAlarms`, `liveEvents`, `nodeSnapshots` -> WebSocket
- `crs` -> change records with `affectedDeviceIds` and time window

### Implementation Constraints

- Only modify `ObservabilityView.jsx` (no file moves)
- Inline styles, theme `T` from `constants.js`
- No external charting libs — SVG or proportional divs
- Must work with real WebSocket data AND simulated/historical when poller is offline (static mode)
- Level 3 panel: slide-in over content, don't break layout
- Keep context panel with IncidentTimelineView filtered to current context (country -> service -> node)

### Open Design Questions

1. **Time window:** X-axis shows last N hours of real accumulated WebSocket events, or simulate 12h history with seed data so demo is always rich?
2. **Historical data:** Accumulate events in array in `usePollerSocket.js` (up to X events) or build synthetic history generator for demo?
3. **Services:** Use `SERVICES[]` from `services.js` as-is, or add a `country` field to each service for Level 1 filtering?
4. **Navigation:** Drill-down is "replace" (Level 1 replaces Level 0 in same panel) or "push" with visible breadcrumb? Back button or clickable breadcrumb?
5. **Static mode:** When `pollerConnected=false`, show "demo mode" with pre-loaded synthetic events so the view isn't empty in demo?

---

## Ideas Parking Lot

_Add new ideas here with date and one-liner. Promote to full items when ready._

- 2026-04-09: **Selector de nodos en tickets** — Al crear un change/ticket, desplegable opcional para seleccionar nodos afectados (`affectedDeviceIds`). No es mandatory, ya que hay tickets genéricos que solo necesitan title.
- 2026-04-09: **Títulos de alarmas más descriptivos** — Tipos como "Hardware" solos no dicen nada. Incluir contexto específico (ej: "Hardware — High temp on fj-suva-cr-01"). La referencia al nodo afectado está bien, mantenerla. La descripción debe auto-completarse en tickets automáticos (generados por alarmas), no en los manuales.
- 2026-04-09: **Master/child tickets para incidencias recurrentes** — Si la misma alarma se abre/cierra repetidamente, no crear tickets infinitos. Cuando una incidencia se repite X veces en un periodo, crear un master ticket y las nuevas ocurrencias pasan a ser child tickets del master. Evita el ruido de abrir/cerrar el mismo ticket constantemente.
