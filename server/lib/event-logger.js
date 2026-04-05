// ─── Event Logger ─────────────────────────────────────────────────────────────
// Records point-in-time events from alarm transitions and poll results.
// Events are immutable facts: "At 14:30, CPU crossed 85% on fj-suva-cr-01".
// They never get "resolved" — that's what alarms are for.

let eventCounter = 0;
const events = []; // newest first
const MAX_EVENTS = 500; // rolling buffer

/**
 * Create an event from a new alarm
 */
export function eventFromAlarm(alarm) {
  return addEvent({
    nodeId: alarm.nodeId,
    type: alarmTypeToEventType(alarm.type),
    severity: alarmSeverityToEventSeverity(alarm.severity),
    source: "poller",
    message: alarm.message,
  });
}

/**
 * Create an event from a resolved alarm
 */
export function eventFromResolution(alarm) {
  return addEvent({
    nodeId: alarm.nodeId,
    type: alarmTypeToEventType(alarm.type),
    severity: "info",
    source: "poller",
    message: `Resolved: ${alarm.message}`,
  });
}

/**
 * Create a custom event
 */
export function addEvent({ nodeId, type, severity, source, message }) {
  const event = {
    id: `live-evt-${++eventCounter}`,
    ts: new Date().toISOString(),
    nodeId,
    type,
    severity,
    source: source || "poller",
    message,
  };

  events.unshift(event);
  if (events.length > MAX_EVENTS) events.length = MAX_EVENTS;

  return event;
}

export function getRecentEvents(limit = 50) {
  return events.slice(0, limit);
}

export function getAllEvents() {
  return [...events];
}

// ── Mapping helpers ──────────────────────────────────────────────────────────

function alarmTypeToEventType(alarmType) {
  const map = {
    REACHABILITY: "SYSTEM",
    PERFORMANCE: "SYSTEM",
    INTERFACE: "INTERFACE",
    PROTOCOL: "BGP",
    HARDWARE: "SYSTEM",
  };
  return map[alarmType] || "SYSTEM";
}

function alarmSeverityToEventSeverity(alarmSev) {
  const map = { Critical: "critical", Major: "warning", Minor: "info" };
  return map[alarmSev] || "info";
}
