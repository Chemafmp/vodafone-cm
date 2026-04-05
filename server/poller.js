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
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// GET /health — simple liveness probe for Fly.io / load balancers
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    nodesRegistered: getNodeCount(),
    activeAlarms: getActiveAlarmCount(),
    autoFleet: AUTO_FLEET,
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

const fleetProcs = [];

function startAutoFleet() {
  if (AUTO_FLEET <= 0) return;

  const fleet = selectNodes(AUTO_FLEET);
  log(chalk.white(`Auto-fleet: launching ${fleet.length} simulated nodes...`));

  fleet.forEach((node, i) => {
    const port = BASE_SNMP_PORT + i;
    const nodeArgs = [
      "--id", node.id,
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

    fleetProcs.push({ proc, id: node.id, port });

    proc.on("exit", (code) => {
      if (!shuttingDown && code !== 0) {
        log(chalk.red(`✗ Auto-fleet node ${node.id} exited with code ${code}`));
      }
    });

    log(chalk.cyan(`  [${i}] ${node.id} → 127.0.0.1:${port}`));
  });
}

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

  for (const { proc } of fleetProcs) {
    if (proc && !proc.killed) {
      try { proc.kill("SIGTERM"); } catch { /* ignore */ }
    }
  }

  server.close(() => process.exit(0));
  // Force exit after 3s if something hangs
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
