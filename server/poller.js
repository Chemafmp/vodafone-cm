#!/usr/bin/env node
// ─── Bodaphone Poller Backend ─────────────────────────────────────────────────
//
// Central polling engine that:
// 1. Accepts node registrations (POST /register)
// 2. Polls all registered nodes via SNMP every X seconds
// 3. Compares state changes → raises/resolves alarms
// 4. Pushes results to the frontend via WebSocket
//
// Usage:
//   node server/poller.js
//   node server/poller.js --port 4000 --interval 10
//
// The frontend connects via WebSocket to ws://localhost:4000

import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { fork } from "child_process";
import chalk from "chalk";

import { registerNode, getAllNodes, getNodeCount, markSeen } from "./lib/registry.js";
import { pollNode } from "./lib/snmp-poller.js";
import { processSnapshot, getActiveAlarms, getActiveAlarmCount } from "./lib/alarm-engine.js";
import { eventFromAlarm, eventFromResolution, getRecentEvents } from "./lib/event-logger.js";
import { THRESHOLDS } from "./lib/oids.js";
import { selectNodes } from "./lib/node-pool.js";
import ticketsRouter, { autoCreateTicketFromAlarm } from "./tickets.js";

// ─── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const PORT = parseInt(getArg("port", "4000"));
const POLL_INTERVAL = parseInt(getArg("interval", String(THRESHOLDS.POLL_INTERVAL_MS / 1000))) * 1000;

// Auto-fleet: how many simulated nodes to fork on boot. 0 = manual mode
// (caller is responsible for starting nodes via launch-demo.js or node-sim.js).
// In production (Fly.io / Droplet) set AUTO_FLEET=6 so the box is self-contained.
const AUTO_FLEET = parseInt(process.env.AUTO_FLEET || getArg("auto-fleet", "0"));
const AUTO_FLEET_CHAOS = process.env.AUTO_FLEET_CHAOS === "1" || args.includes("--auto-fleet-chaos");
const BASE_SNMP_PORT = 1161;

// ─── CORS / origin whitelist ─────────────────────────────────────────────────
// Origins allowed to hit the HTTP API and open WebSockets.
// Extended via env var ALLOWED_ORIGINS (comma-separated) or --allowed-origins CLI flag.
const DEFAULT_ORIGINS = [
  "http://localhost:5178",
  "http://localhost:5173",
  "http://127.0.0.1:5178",
  "https://chemafmp.github.io",
];
const extraOrigins = (process.env.ALLOWED_ORIGINS || getArg("allowed-origins", ""))
  .split(",").map(s => s.trim()).filter(Boolean);
const ALLOWED_ORIGINS = new Set([...DEFAULT_ORIGINS, ...extraOrigins]);

function isOriginAllowed(origin) {
  if (!origin) return true;                        // curl, node-to-node, health checks
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // Allow any localhost port for local dev convenience
  if (/^http:\/\/localhost:\d+$/.test(origin)) return true;
  if (/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) return true;
  return false;
}

// ─── Express + HTTP server ───────────────────────────────────────────────────
const app = express();
app.use(express.json());

// CORS — strict origin whitelist (reflects origin when allowed)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    if (origin) res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── Tickets router ──────────────────────────────────────────────────────────
app.use("/api/tickets", ticketsRouter);

// ─── Auto-ticket toggle (env-controlled only, no public HTTP endpoint) ────────
const autoTicketsEnabled = process.env.AUTO_TICKETS !== "false";
log(chalk.cyan(`[tickets] auto-create ${autoTicketsEnabled ? "ENABLED" : "DISABLED"} (AUTO_TICKETS=${process.env.AUTO_TICKETS ?? "unset"})`));

// GET /health — simple liveness probe for Fly.io / load balancers
app.get("/health", (req, res) => {
  const fleetRunning = [...fleetMap.values()].filter(n => n.status === "running").length;
  res.json({
    status: "ok",
    uptime: process.uptime(),
    nodesRegistered: getNodeCount(),
    activeAlarms: getActiveAlarmCount(),
    autoFleet: AUTO_FLEET,
    fleetRunning,
    fleetKilled: fleetMap.size - fleetRunning,
  });
});

// POST /register — nodes call this when they start
app.post("/register", (req, res) => {
  const info = req.body;
  if (!info || !info.id || !info.port) {
    return res.status(400).json({ error: "id and port required" });
  }
  registerNode(info);
  log(chalk.cyan(`📡 Node registered: ${chalk.bold(info.id)} on :${info.port} (${info.vendor || "?"} ${info.hwModel || ""})`));
  res.json({ ok: true, pollInterval: POLL_INTERVAL });
});

// GET /api/status — current state snapshot
app.get("/api/status", (req, res) => {
  res.json({
    nodes: getAllNodes(),
    alarms: getActiveAlarms(),
    events: getRecentEvents(50),
    polling: { interval: POLL_INTERVAL, registered: getNodeCount() },
  });
});

// GET /api/alarms — active alarms
app.get("/api/alarms", (req, res) => {
  res.json(getActiveAlarms());
});

// GET /api/events — recent events
app.get("/api/events", (req, res) => {
  const limit = parseInt(req.query.limit || "100");
  res.json(getRecentEvents(limit));
});

const server = http.createServer(app);

// ─── WebSocket server ────────────────────────────────────────────────────────
const wss = new WebSocketServer({
  server,
  verifyClient: (info, cb) => {
    const origin = info.req.headers.origin;
    if (isOriginAllowed(origin)) return cb(true);
    log(chalk.yellow(`🚫 WebSocket connection rejected — origin not allowed: ${origin}`));
    cb(false, 403, "Forbidden origin");
  },
});
const wsClients = new Set();

wss.on("connection", (ws) => {
  wsClients.add(ws);
  log(chalk.green(`🔌 WebSocket client connected (${wsClients.size} total)`));

  // Send current state on connect
  ws.send(JSON.stringify({
    type: "init",
    alarms: getActiveAlarms(),
    events: getRecentEvents(50),
    nodes: getAllNodes().map(n => ({ id: n.id, hostname: n.hostname, port: n.port, vendor: n.vendor, layer: n.layer, country: n.country })),
  }));

  ws.on("close", () => {
    wsClients.delete(ws);
    log(chalk.gray(`🔌 WebSocket client disconnected (${wsClients.size} total)`));
  });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === 1) ws.send(data); // 1 = OPEN
  }
}

// ─── Polling loop ────────────────────────────────────────────────────────────

let pollCycle = 0;

async function runPollCycle() {
  const nodes = getAllNodes();
  if (nodes.length === 0) return;

  pollCycle++;
  const cycleStart = Date.now();

  // Poll all nodes in parallel
  const results = await Promise.all(nodes.map(n => pollNode(n)));

  const allNewAlarms = [];
  const allResolvedAlarms = [];
  const allNewEvents = [];
  const nodeSnapshots = {};

  for (const snapshot of results) {
    if (snapshot.reachable) {
      markSeen(snapshot.nodeId);
    }

    // Process through alarm engine
    const { newAlarms, resolvedAlarms } = processSnapshot(snapshot);

    // Generate events for each alarm change
    for (const alarm of newAlarms) {
      const event = eventFromAlarm(alarm);
      allNewEvents.push(event);
      allNewAlarms.push(alarm);
    }
    for (const alarm of resolvedAlarms) {
      const event = eventFromResolution(alarm);
      allNewEvents.push(event);
      allResolvedAlarms.push(alarm);

      // For resolved alarms: auto-resolve sev3/sev4 tickets; add timeline event for sev1/sev2
      try {
        const sev = alarm.severity;
        const alarmType = alarm.type;
        const nodeId = alarm.nodeId;

        // Look up open tickets for this alarm type + node
        // For sev3/sev4 (Minor, Warning, Info) → auto-resolve
        // For sev1/sev2 (Critical, Major) → just add timeline event
        if (["Minor", "Warning", "Info"].includes(sev)) {
          // Use fetch to avoid circular dep; just call our own HTTP API
          fetch(`http://localhost:${PORT}/api/tickets?alarm_type=${encodeURIComponent(alarmType)}&node=${encodeURIComponent(nodeId)}&status=new,assigned,in_progress`)
            .then(r => r.json())
            .then(tickets => {
              for (const t of (tickets || [])) {
                fetch(`http://localhost:${PORT}/api/tickets/${t.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "resolved", actor_name: "System" }),
                }).catch(() => {});
              }
            }).catch(() => {});
        } else if (["Critical", "Major"].includes(sev)) {
          fetch(`http://localhost:${PORT}/api/tickets?alarm_type=${encodeURIComponent(alarmType)}&node=${encodeURIComponent(nodeId)}&status=new,assigned,in_progress`)
            .then(r => r.json())
            .then(tickets => {
              for (const t of (tickets || [])) {
                fetch(`http://localhost:${PORT}/api/tickets/${t.id}/events`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    event_type: "alarm_resolved",
                    actor_name: "System",
                    content: `Underlying alarm cleared: ${alarm.message || alarmType}`,
                    metadata: { alarm_id: alarm.id, alarm_type: alarmType },
                  }),
                }).catch(() => {});
              }
            }).catch(() => {});
        }
      } catch (e) {
        // non-fatal
      }
    }

    // Build node status for broadcast
    nodeSnapshots[snapshot.nodeId] = {
      reachable: snapshot.reachable,
      cpu: snapshot.cpu,
      mem: snapshot.mem,
      temp: snapshot.temp,
      uptime: snapshot.uptime,
      interfaces: snapshot.interfaces,
      bgpPeers: snapshot.bgpPeers,
    };
  }

  // Auto-create tickets sequentially to avoid ID race conditions
  // (concurrent inserts all read the same MAX(seq_number) → collisions)
  if (autoTicketsEnabled && allNewAlarms.length > 0) {
    (async () => {
      for (const alarm of allNewAlarms) {
        const nodeEntry = fleetMap.get(alarm.nodeId);
        const nodeMeta = nodeEntry ? { country: nodeEntry.def.country } : null;
        try {
          await autoCreateTicketFromAlarm(alarm, nodeMeta);
        } catch (e) {
          log(chalk.yellow(`[tickets] auto-create failed: ${e.message}`));
        }
      }
    })();
  }

  const elapsed = Date.now() - cycleStart;

  // Log summary
  const reachable = results.filter(r => r.reachable).length;
  const unreachable = results.length - reachable;
  const alarmCount = getActiveAlarmCount();

  let summary = chalk.gray(`[cycle ${pollCycle}]`) + ` ${reachable}/${results.length} reachable`;
  if (unreachable > 0) summary += chalk.red(` · ${unreachable} unreachable`);
  if (allNewAlarms.length > 0) summary += chalk.red(` · +${allNewAlarms.length} alarm${allNewAlarms.length > 1 ? "s" : ""}`);
  if (allResolvedAlarms.length > 0) summary += chalk.green(` · ✓${allResolvedAlarms.length} resolved`);
  summary += chalk.gray(` · ${alarmCount} active · ${elapsed}ms`);
  log(summary);

  // Log new alarms
  for (const a of allNewAlarms) {
    const sevColor = a.severity === "Critical" ? chalk.red : chalk.yellow;
    log(sevColor(`  🔔 ${a.severity} [${a.type}] ${a.nodeId}: ${a.message}`));
  }
  for (const a of allResolvedAlarms) {
    log(chalk.green(`  ✓  RESOLVED [${a.type}] ${a.nodeId}: ${a.message}`));
  }

  // Broadcast to WebSocket clients
  if (wsClients.size > 0) {
    broadcast({
      type: "poll-result",
      cycle: pollCycle,
      timestamp: new Date().toISOString(),
      nodes: nodeSnapshots,
      newAlarms: allNewAlarms,
      resolvedAlarms: allResolvedAlarms,
      newEvents: allNewEvents,
      activeAlarmCount: alarmCount,
    });
  }
}

// ─── Auto-fleet: spawn simulated nodes as child processes ────────────────────
//
// When AUTO_FLEET > 0, the poller forks N node-sim.js processes after it
// starts listening. Each simulator binds its SNMP agent to 127.0.0.1 and
// registers itself back with us via POST /register.
//
// This makes the poller fully self-contained for production deployments
// (Fly.io, Droplet) where there is no interactive launcher.

// Map of nodeId → { proc, def, index, port, status: "running" | "killed" }.
// Using a Map (not array) so the control API can look up nodes by id in O(1).
const fleetMap = new Map();

function spawnFleetNode(def, index, port) {
  const nodeArgs = [
    "--id", def.id,
    "--port", String(port),
    "--address", "127.0.0.1",
    "--poller", `http://localhost:${PORT}`,
  ];
  if (AUTO_FLEET_CHAOS) nodeArgs.push("--chaos");

  // Inherit stderr so crashes surface in the poller log; stdout is piped
  // silently — the poller's own log lines tell us when each node registers.
  const proc = fork("server/node-sim.js", nodeArgs, {
    stdio: ["ignore", "ignore", "inherit", "ipc"],
    cwd: process.cwd(),
  });

  const entry = { proc, def, index, port, status: "running" };
  fleetMap.set(def.id, entry);

  proc.on("exit", (code) => {
    if (shuttingDown) return;
    // If the status is still "running" it means the exit wasn't requested
    // via the control API → crash. Mark as killed so the UI reflects it.
    if (entry.status === "running") {
      entry.status = "killed";
      entry.proc = null;
      if (code !== 0) log(chalk.red(`✗ Auto-fleet node ${def.id} exited with code ${code}`));
    }
  });

  return entry;
}

function startAutoFleet() {
  if (AUTO_FLEET <= 0) return;

  const fleet = selectNodes(AUTO_FLEET);
  log(chalk.white(`Auto-fleet: launching ${fleet.length} simulated nodes...`));

  fleet.forEach((node, i) => {
    const port = BASE_SNMP_PORT + i;
    spawnFleetNode(node, i, port);
    log(chalk.cyan(`  [${i}] ${node.id} → 127.0.0.1:${port}`));
  });
}

// ─── Control API — chaos engineering endpoints ───────────────────────────────
//
// These let the frontend (or curl) kill/revive simulated nodes and trigger
// named scenarios on them. Only available when AUTO_FLEET > 0, since they
// operate on child processes owned by the poller.

const VALID_SCENARIOS = ["cascade", "maintenance", "linkflap", "bgpleak", "thermal"];

// GET /api/control/nodes — list fleet state for the chaos panel
app.get("/api/control/nodes", (req, res) => {
  const nodes = [...fleetMap.values()].map(n => ({
    id: n.def.id,
    label: n.def.label,
    country: n.def.country,
    index: n.index,
    port: n.port,
    status: n.status,
  }));
  res.json({ autoFleet: AUTO_FLEET, nodes });
});

// POST /api/control/kill/:nodeId — SIGTERM the child process
app.post("/api/control/kill/:nodeId", (req, res) => {
  const entry = fleetMap.get(req.params.nodeId);
  if (!entry) return res.status(404).json({ error: "node not found" });
  if (entry.status === "killed") return res.json({ ok: true, already: true, status: "killed" });
  if (entry.proc) {
    try { entry.proc.kill("SIGTERM"); } catch { /* ignore */ }
  }
  entry.status = "killed";
  entry.proc = null;
  log(chalk.red(`💀 KILL via API: ${chalk.bold(entry.def.id)}`));
  res.json({ ok: true, id: entry.def.id, status: "killed" });
});

// POST /api/control/revive/:nodeId — re-fork the child process
app.post("/api/control/revive/:nodeId", (req, res) => {
  const entry = fleetMap.get(req.params.nodeId);
  if (!entry) return res.status(404).json({ error: "node not found" });
  if (entry.status === "running" && entry.proc) {
    return res.json({ ok: true, already: true, status: "running" });
  }
  spawnFleetNode(entry.def, entry.index, entry.port);
  log(chalk.green(`🔄 REVIVE via API: ${chalk.bold(entry.def.id)}`));
  res.json({ ok: true, id: entry.def.id, status: "running" });
});

// POST /api/control/scenario/:nodeId — send IPC scenario message to child
//   body: { "scenario": "cascade" | "maintenance" | "linkflap" | "bgpleak" | "thermal" }
app.post("/api/control/scenario/:nodeId", (req, res) => {
  const entry = fleetMap.get(req.params.nodeId);
  if (!entry) return res.status(404).json({ error: "node not found" });
  if (!entry.proc || entry.status !== "running") {
    return res.status(409).json({ error: "node not running — revive it first" });
  }
  const { scenario } = req.body || {};
  if (!VALID_SCENARIOS.includes(scenario)) {
    return res.status(400).json({ error: "invalid scenario", valid: VALID_SCENARIOS });
  }
  try {
    entry.proc.send({ type: "scenario", scenario });
  } catch (e) {
    return res.status(500).json({ error: "IPC send failed", detail: String(e) });
  }
  log(chalk.magenta(`🎬 SCENARIO via API: ${chalk.bold(entry.def.id)} → ${scenario}`));
  res.json({ ok: true, id: entry.def.id, scenario });
});

// ─── Start ───────────────────────────────────────────────────────────────────

let shuttingDown = false;

// Bind address: 0.0.0.0 in production (behind nginx/fly-proxy), localhost otherwise.
const BIND_HOST = process.env.HOST || (AUTO_FLEET > 0 ? "0.0.0.0" : "127.0.0.1");

server.listen(PORT, BIND_HOST, () => {
  console.log("");
  console.log(chalk.bold.white(`  ┌─────────────────────────────────────────────────┐`));
  console.log(chalk.bold.white(`  │`) + chalk.bold.red(`  BODAPHONE`) + chalk.bold.white(` Poller Engine                      │`));
  console.log(chalk.bold.white(`  └─────────────────────────────────────────────────┘`));
  console.log("");
  console.log(`  HTTP API:    ${chalk.bold.green(`http://${BIND_HOST}:${PORT}`)}`);
  console.log(`  WebSocket:   ${chalk.bold.green(`ws://${BIND_HOST}:${PORT}`)}`);
  console.log(`  Poll every:  ${chalk.bold(`${POLL_INTERVAL / 1000}s`)}`);
  console.log(`  Origins:     ${chalk.gray([...ALLOWED_ORIGINS].join(", "))}`);
  console.log(`  Auto-fleet:  ${AUTO_FLEET > 0 ? chalk.bold.green(`${AUTO_FLEET} nodes${AUTO_FLEET_CHAOS ? " (CHAOS)" : ""}`) : chalk.gray("off (manual mode)")}`);
  console.log(`  Endpoints:   POST /register · GET /api/status · GET /api/alarms · GET /api/events`);
  if (AUTO_FLEET > 0) {
    console.log(`  Control:     GET /api/control/nodes · POST /api/control/{kill,revive,scenario}/:id`);
  }
  console.log("");
  log(chalk.green("Poller started. Waiting for nodes to register..."));
  if (AUTO_FLEET === 0) {
    log(chalk.gray("Start nodes with: node server/node-sim.js --id <node-id> --port <port>"));
  }
  console.log("");

  // Start auto-fleet if requested
  startAutoFleet();

  // Start polling loop
  setInterval(runPollCycle, POLL_INTERVAL);
});

function log(msg) {
  const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  console.log(chalk.gray(`[${ts}]`) + ` ${msg}`);
}

// Graceful shutdown — also kills any auto-fleet children
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("");
  log(chalk.yellow(`Shutting down poller (${signal})...`));

  for (const entry of fleetMap.values()) {
    if (entry.proc && !entry.proc.killed) {
      try { entry.proc.kill("SIGTERM"); } catch { /* ignore */ }
    }
  }

  server.close(() => process.exit(0));
  // Force exit after 3s if something hangs
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
