# Product Backlog

---

## A. Arquitectura & Código

### A1: Refactor App.jsx (god component)
**Priority:** High · **Effort:** Medium · **Added:** 2026-04-25

App.jsx tiene 412 líneas y 10+ estados. Toda la orquestación, filtros, contadores y navegación vive aquí. Extraer a contextos (TicketCountsContext, NavigationContext) o usar Zustand.

### A2: Router real (React Router / TanStack Router)
**Priority:** Medium · **Effort:** Medium · **Added:** 2026-04-25

Navegación manual con `view` + `app` state. Sin back/forward del navegador, sin URLs compartibles, sin code-splitting por ruta.

### A3: Descomponer TicketDetailView (819 líneas)
**Priority:** Medium · **Effort:** Medium · **Added:** 2026-04-25

Mezcla header, left rail, tabs, SLA timer, markdown parser. Extraer sub-componentes: TicketHeader, TicketRail, TicketWorkNotes.

### A4: Eliminar duplicación de lógica
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

`timeAgo()` implementada 3 veces. Metadata severidad/color duplicada en 4 ficheros. Consolidar en helpers.js.

### A5: Sistema de estilos (inline styles → CSS modules o Tailwind)
**Priority:** Low · **Effort:** High · **Added:** 2026-04-25

1920 inline styles sin abstracción. Necesario para dark mode o temas dinámicos.

### A6: Eliminar dangerouslySetInnerHTML (XSS)
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

TicketDetailView usa `dangerouslySetInnerHTML` para markdown custom. Vector XSS potencial. Usar `marked` + `DOMPurify`.

---

## B. Robustez & Calidad

### B1: Añadir tests
**Priority:** High · **Effort:** High · **Added:** 2026-04-25

Cero tests en el repo. Empezar por `ticketsDb.js` (SLA calculations) y `alarm-engine.js` (funciones puras, fáciles de testear).

### B2: Migrar a TypeScript (incremental)
**Priority:** Medium · **Effort:** High · **Added:** 2026-04-25

100% JSX sin tipos. Props incorrectas solo en runtime. Empezar por utils/ y hooks/.

### B3: Error Boundaries en React
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

Si un componente crashea, toda la app muere. `<ErrorBoundary>` en cada vista lazy es quick win.

### B4: API client resilience (retry/timeout/dedup)
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

`ticketsDb.js` — fetch sin timeout, sin retry en errores de red, sin dedup de requests rápidos.

### B5: Fix race condition en ticket ID generation
**Priority:** High · **Effort:** Low · **Added:** 2026-04-25

`tickets.js:76-95` — dos POST simultáneos pueden generar el mismo ID. Fix: usar secuencia Supabase (`nextval`).

### B6: Fix errores silenciados en poller.js
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

`poller.js:227-255` — `.catch(() => {})` en fetch calls. Falla silenciosa de auto-tickets.

---

## C. Seguridad & Producción

### C1: Rate limiting en endpoints
**Priority:** High · **Effort:** Low · **Added:** 2026-04-25

Sin rate limiting. `express-rate-limit` es una línea.

### C2: Validación de input en backend
**Priority:** High · **Effort:** Medium · **Added:** 2026-04-25

Sin limits de longitud, sin allowlist de status/severity. Supabase previene SQL injection pero basura entra a la DB.

### C3: Docker: no correr como root
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

Falta `USER node` en Dockerfile.

### C4: Docker: HEALTHCHECK
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

Container no se reinicia si crashea silenciosamente. Añadir `HEALTHCHECK CMD curl -f http://localhost:4000/health`.

### C5: Logging estructurado (tickets.js)
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

Solo `console.error()`. Sin timestamps. `pino` o `winston` con JSON.

---

## D. UX & Producto

### D1: Paginación server-side en listas de tickets
**Priority:** High · **Effort:** Medium · **Added:** 2026-04-25

Carga todos los tickets en memoria. Con 500+ se arrastra.

### D2: Virtualización de listas largas
**Priority:** Medium · **Effort:** Medium · **Added:** 2026-04-25

AlarmsView, TicketListView, ChangesView renderizan todo. `react-window` o `@tanstack/virtual`.

### D3: Accesibilidad
**Priority:** Medium · **Effort:** High · **Added:** 2026-04-25

Muchos `<div onClick>` en vez de `<button>`. Sin keyboard nav, sin ARIA live regions.

### D4: Estados de error visibles para el usuario
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

Errores de red van a console pero el usuario ve pantalla en blanco. Necesita toast/snackbar.

### D5: URLs compartibles (se solapa con A2)
**Priority:** Medium · **Effort:** Medium · **Added:** 2026-04-25

No se puede enviar link directo a un ticket/cambio.

### D6: Búsqueda global
**Priority:** Medium · **Effort:** Medium · **Added:** 2026-04-25

No hay search bar. Buscar ticket, cambio o nodo por texto libre. Muy útil para NOC.

### D7: Sistema de notificaciones/toasts
**Priority:** Low · **Effort:** Low · **Added:** 2026-04-25

Acciones como "ticket actualizado" no dan feedback visual.

### D8: Fix login page desaparece tras refresh
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

`sessionStorage` persiste sesión → no vuelve a ver selector de usuario.

---

## E. Features Nuevas

### E1: Dashboard ejecutivo
**Priority:** High · **Effort:** Medium · **Added:** 2026-04-25

KPIs (MTTR, SLA compliance, tickets abiertos por sev), trending, top offenders. Para directores.

### E2: Observability Swimlane View (4-Level Drill-down)
**Priority:** High · **Effort:** High · **Added:** 2026-04-09

4 niveles drill-down: Global → Country → Service → Node. Diseño ya acordado.
Ver diseño detallado en sección dedicada abajo.

### E3: Incident Timeline (EventsView redesign)
**Priority:** Medium · **Effort:** Medium · **Added:** 2026-04-25

Feed cronológico correlacionando alarmas + cambios. Diseño ya acordado.

### E4: Audit trail exportable
**Priority:** Medium · **Effort:** Low · **Added:** 2026-04-25

CSV/PDF de historia de ticket o cambio. Compliance lo necesita.

### E5: Mobile responsive
**Priority:** Medium · **Effort:** High · **Added:** 2026-04-25

NOC on-call necesita ver alarmas desde el móvil.

### E6: Dark mode
**Priority:** Low · **Effort:** Medium · **Added:** 2026-04-25

Tema T centraliza colores. Invertir valores + toggle. Nice-to-have para NOC nocturno.

---

## Observability Swimlane — Diseño detallado (FEAT E2)

**Problem:** ObservabilityView.jsx shows flat metrics per node. Doesn't scale. NOC teams think in services, not nodes.

**Solution:** Replace ObservabilityView with a 4-level hierarchical swimlane where Y-axis = SERVICES.

### The 4 Levels

**Level 0 — Global (default view)**
- Grid of countries with aggregated health
- Each card: flag + name + "2 services degraded" + worst severity color
- Click country -> Level 1

**Level 1 — Country View**
- Services in Y-axis (5-8 rows max)
- Time in X-axis (configurable window: 1h, 6h, 12h, 24h)
- Each row = temporal health bar (color = worst severity of its nodes at that time)
- Cross-reference: if a change was "In Execution" in that window, mark it on the bar
- Click service -> Level 2

**Level 2 — Service Drill-down**
- Service nodes in Y-axis (3-8 nodes)
- Node swimlane with events in X-axis
- Changes visible as vertical shaded band
- Click node -> Level 3

**Level 3 — Node Detail Panel (slide-in)**
- Interfaces + BGP peers as sub-rows
- Metrics (CPU/mem/temp) as sparklines
- Active alarms list
- Changes touching this node

### Open Design Questions

1. X-axis: real WebSocket events or synthetic 12h history for demo richness?
2. Historical data: accumulate in `usePollerSocket.js` or build synthetic generator?
3. Services: add `country` field for Level 1 filtering?
4. Navigation: "replace" drill-down or "push" with breadcrumb?
5. Static mode: pre-loaded synthetic events when poller disconnected?

---

## Ideas Parking Lot

_Add new ideas here with date and one-liner._

- 2026-04-09: **Selector de nodos en tickets** — Desplegable para seleccionar nodos afectados (`affectedDeviceIds`).
- 2026-04-09: **Títulos de alarmas más descriptivos** — Incluir contexto específico (ej: "Hardware — High temp on fj-suva-cr-01").
- 2026-04-09: **Master/child tickets para incidencias recurrentes** — Cuando misma alarma se repite X veces, crear master ticket + child tickets.
- 2026-04-25: **Ticket list — re-fire count visible** (requiere columna denormalizada)
- 2026-04-25: **RBAC Phase 4** — Row-Level Security en Supabase
- 2026-04-25: **Supabase Realtime subscriptions** (Phase 5)
- 2026-04-25: **Authentication Phase 3** — Supabase Auth (magic link o SSO)
