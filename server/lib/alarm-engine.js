// ─── Alarm Engine ─────────────────────────────────────────────────────────────
// Compares current poll snapshot with previous state to raise/resolve alarms.
//
// An ALARM is a persistent condition: "CPU is above 85% RIGHT NOW".
// It stays OPEN until the condition clears, then gets RESOLVED.
//
// This is different from an EVENT, which is a point-in-time fact:
// "At 14:30, CPU crossed 85%".

import { THRESHOLDS } from "./oids.js";

let alarmCounter = 0;

// Active alarms: Map<alarmKey, alarm>
// alarmKey = "nodeId:type:detail" (ensures one alarm per condition)
const activeAlarms = new Map();

// Previous poll snapshots per node
const prevSnapshots = new Map();

/**
 * Process a poll result, compare with previous, return { newAlarms, resolvedAlarms }
 */
export function processSnapshot(snapshot) {
  const nodeId = snapshot.nodeId;
  const prev = prevSnapshots.get(nodeId) || null;
  const newAlarms = [];
  const resolvedAlarms = [];

  if (!snapshot.reachable) {
    // ── Node unreachable ──
    const key = `${nodeId}:REACHABILITY:unreachable`;
    if (!activeAlarms.has(key)) {
      const alarm = createAlarm(nodeId, "REACHABILITY", "Critical", `Device unreachable — no SNMP response within ${THRESHOLDS.POLL_TIMEOUT_MS}ms`, key);
      activeAlarms.set(key, alarm);
      newAlarms.push(alarm);
    }
  } else {
    // ── Node reachable — resolve unreachable alarm if it existed ──
    const reachKey = `${nodeId}:REACHABILITY:unreachable`;
    if (activeAlarms.has(reachKey)) {
      const alarm = resolveAlarm(reachKey);
      if (alarm) resolvedAlarms.push(alarm);
    }

    // ── CPU thresholds ──
    checkThreshold({
      nodeId, metric: "cpu", value: snapshot.cpu,
      majorThreshold: THRESHOLDS.CPU_MAJOR,
      criticalThreshold: THRESHOLDS.CPU_CRITICAL,
      type: "PERFORMANCE",
      label: "CPU",
      newAlarms, resolvedAlarms,
    });

    // ── Memory thresholds ──
    checkThreshold({
      nodeId, metric: "mem", value: snapshot.mem,
      majorThreshold: THRESHOLDS.MEM_MAJOR,
      criticalThreshold: THRESHOLDS.MEM_CRITICAL,
      type: "PERFORMANCE",
      label: "Memory",
      newAlarms, resolvedAlarms,
    });

    // ── Temperature thresholds ──
    checkThreshold({
      nodeId, metric: "temp", value: snapshot.temp,
      majorThreshold: THRESHOLDS.TEMP_MAJOR,
      criticalThreshold: THRESHOLDS.TEMP_CRITICAL,
      type: "HARDWARE",
      label: "Temperature",
      newAlarms, resolvedAlarms,
    });

    // ── Interface status changes ──
    for (const iface of snapshot.interfaces) {
      const key = `${nodeId}:INTERFACE:${iface.name}`;
      if (iface.operStatus === "DOWN") {
        if (!activeAlarms.has(key)) {
          const alarm = createAlarm(nodeId, "INTERFACE", "Major",
            `Interface ${iface.name} is DOWN`, key);
          activeAlarms.set(key, alarm);
          newAlarms.push(alarm);
        }
      } else {
        if (activeAlarms.has(key)) {
          const alarm = resolveAlarm(key);
          if (alarm) resolvedAlarms.push(alarm);
        }
      }
    }

    // ── BGP peer status changes ──
    for (const peer of snapshot.bgpPeers) {
      if (!peer || !peer.ip) continue;
      const key = `${nodeId}:PROTOCOL:bgp:${peer.ip}`;
      const isEstablished = peer.state === 6; // BGP_STATE.ESTABLISHED
      if (!isEstablished) {
        if (!activeAlarms.has(key)) {
          const alarm = createAlarm(nodeId, "PROTOCOL", "Major",
            `BGP peer ${peer.ip} is not Established (state: ${bgpStateName(peer.state)})`, key);
          activeAlarms.set(key, alarm);
          newAlarms.push(alarm);
        }
      } else {
        if (activeAlarms.has(key)) {
          const alarm = resolveAlarm(key);
          if (alarm) resolvedAlarms.push(alarm);
        }
      }
    }
  }

  // Store snapshot for next comparison
  prevSnapshots.set(nodeId, snapshot);

  return { newAlarms, resolvedAlarms };
}

/**
 * Handle a node that was in registry but didn't get polled (removed/crashed)
 */
export function markNodeGone(nodeId) {
  const key = `${nodeId}:REACHABILITY:unreachable`;
  if (!activeAlarms.has(key)) {
    const alarm = createAlarm(nodeId, "REACHABILITY", "Critical",
      "Device unreachable — removed from polling", key);
    activeAlarms.set(key, alarm);
    return alarm;
  }
  return null;
}

export function getActiveAlarms() {
  return [...activeAlarms.values()];
}

export function getActiveAlarmCount() {
  return activeAlarms.size;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function checkThreshold({ nodeId, metric, value, majorThreshold, criticalThreshold, type, label, newAlarms, resolvedAlarms }) {
  const majorKey = `${nodeId}:${type}:${metric}:major`;
  const critKey = `${nodeId}:${type}:${metric}:critical`;
  const unit = metric === "temp" ? "°C" : "%";

  if (value >= criticalThreshold) {
    // Upgrade: resolve major if exists, create critical
    if (activeAlarms.has(majorKey)) {
      const a = resolveAlarm(majorKey);
      if (a) resolvedAlarms.push(a);
    }
    if (!activeAlarms.has(critKey)) {
      const alarm = createAlarm(nodeId, type, "Critical",
        `${label} critical: ${value}${unit} (threshold: ${criticalThreshold}${unit})`, critKey);
      activeAlarms.set(critKey, alarm);
      newAlarms.push(alarm);
    }
  } else if (value >= majorThreshold) {
    // Downgrade: resolve critical if exists, create major
    if (activeAlarms.has(critKey)) {
      const a = resolveAlarm(critKey);
      if (a) resolvedAlarms.push(a);
    }
    if (!activeAlarms.has(majorKey)) {
      const alarm = createAlarm(nodeId, type, "Major",
        `${label} high: ${value}${unit} (threshold: ${majorThreshold}${unit})`, majorKey);
      activeAlarms.set(majorKey, alarm);
      newAlarms.push(alarm);
    }
  } else {
    // Below thresholds — resolve both if they exist
    if (activeAlarms.has(critKey)) {
      const a = resolveAlarm(critKey);
      if (a) resolvedAlarms.push(a);
    }
    if (activeAlarms.has(majorKey)) {
      const a = resolveAlarm(majorKey);
      if (a) resolvedAlarms.push(a);
    }
  }
}

function createAlarm(nodeId, type, severity, message, key) {
  return {
    id: `live-alm-${++alarmCounter}`,
    key,
    nodeId,
    type,
    severity,
    status: "OPEN",
    message,
    since: new Date().toISOString(),
    resolvedAt: null,
  };
}

function resolveAlarm(key) {
  const alarm = activeAlarms.get(key);
  if (!alarm) return null;
  alarm.status = "RESOLVED";
  alarm.resolvedAt = new Date().toISOString();
  activeAlarms.delete(key);
  return { ...alarm };
}

function bgpStateName(state) {
  const names = { 1: "Idle", 2: "Connect", 3: "Active", 4: "OpenSent", 5: "OpenConfirm", 6: "Established" };
  return names[state] || `Unknown(${state})`;
}
