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
import { rateLimit } from "express-rate-limit";

import { registerNode, getAllNodes, getNodeCount, markSeen } from "./lib/registry.js";
import { pollNode } from "./lib/snmp-poller.js";
import { processSnapshot, getActiveAlarms, getActiveAlarmCount } from "./lib/alarm-engine.js";
import { eventFromAlarm, eventFromResolution, getRecentEvents } from "./lib/event-logger.js";
import { THRESHOLDS } from "./lib/oids.js";
import { selectNodes } from "./lib/node-pool.js";
import ticketsRouter, { autoCreateTicketFromAlarm } from "./tickets.js";
import { tickServiceStatus, getServiceStatus, initServiceStatus } from "./lib/service-status.js";
import { tickRipeAtlas, getNetworkHealth, initRipeAtlas } from "./lib/ripe-atlas.js";
import { tickBgpVisibility, getBgpVisibility, initBgpVisibility } from "./lib/bgp-visibility.js";
import { tickDnsMeasurements, getDnsMeasurements, initDnsMeasurements } from "./lib/dns-measurements.js";
import { tickIoda, getIoda, initIoda } from "./lib/ioda.js";
import { tickRisLive, getRisLive, initRisLive, stopRisLive, injectHijackCandidate } from "./lib/ris-live.js";
import { tickCfRadar, getCfRadar, initCfRadar } from "./lib/cf-radar.js";
import { checkNetworkHealth, checkServiceStatus, checkHijackCandidates, checkCloudHealth, simulateAlert, notifyTest } from "./lib/notifier.js";
import { initRpkiDaily, loadRpkiSnapshots, scheduleRpkiDaily, getRpkiSnapshot } from "./lib/rpki-daily.js";
import { computeCorrelation } from "./lib/correlation.js";
import { initCorrelationHistory, saveCorrelationPoint, getCorrelationHistory } from "./lib/correlation-history.js";
import { pauseModule, resumeModule, pauseAll, resumeAll, getPollerStatus, POLLER_MODULES } from "./lib/poller-control.js";
import { initRipeStatEnrichment, tickRipeStatEnrichment, getEnrichment } from "./lib/ripe-stat-enrichment.js";
import { initCloudHealth, tickCloudHealth, getCloudHealth, setProviderTicketId, getCloudStatusHistory } from "./lib/cloud-health.js";

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

// ─── Rate limiting (C1) ──────────────────────────────────────────────────────
// Protects write endpoints from abuse. Read-only GETs are also covered
// but at a generous limit so the SPA's polling doesn't get throttled.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,        // 1-minute window
  max:      120,               // 120 requests per IP per minute (~2/s)
  standardHeaders: "draft-7",
  legacyHeaders:   false,
  message: { error: "Too many requests, slow down." },
  skip: (req) => req.method === "GET" && req.path.startsWith("/api/tickets") === false,
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,                // 30 mutations per IP per minute
  standardHeaders: "draft-7",
  legacyHeaders:   false,
  message: { error: "Too many write requests." },
});

// ─── Tickets router ──────────────────────────────────────────────────────────
app.use("/api/tickets", apiLimiter);
app.post("/api/tickets", writeLimiter);
app.patch("/api/tickets/:id", writeLimiter);
app.post("/api/tickets/:id/events", writeLimiter);
app.post("/api/tickets/:id/evidence", writeLimiter);
app.post("/api/tickets/:id/notes", writeLimiter);
app.use("/api/tickets", ticketsRouter);

// ─── Auto-ticket toggle (env-controlled only, no public HTTP endpoint) ────────
// Fleet (simulated lab) alarm tickets are disabled by default.
// Real network alarms (hijack, Atlas, BGP, etc.) create tickets via dedicated paths.
// Set AUTO_TICKETS=true in env to re-enable fleet auto-ticketing (e.g. for testing).
const autoTicketsEnabled = process.env.AUTO_TICKETS === "true";
log(chalk.cyan(`[tickets] fleet auto-create ${autoTicketsEnabled ? "ENABLED (AUTO_TICKETS=true)" : "DISABLED (default — real network alarms create tickets via dedicated paths)"}"`));

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

// GET /api/service-status — Downdetector-style complaint data for all markets
app.get("/api/service-status", (req, res) => {
  res.json(getServiceStatus());
});

// GET /api/cloud-health — cloud / CDN / infra provider status (AWS, GCP, Azure, Cloudflare…)
app.get("/api/cloud-health", (req, res) => {
  res.json(getCloudHealth());
});

// GET /api/cloud-health/history — last 36h of status snapshots for all providers
app.get("/api/cloud-health/history", async (req, res) => {
  try {
    const data = await getCloudStatusHistory();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/network-health — all signal layers per Vodafone market
app.get("/api/network-health", (req, res) => {
  const atlas   = getNetworkHealth();
  const bgp     = getBgpVisibility();
  const dns     = getDnsMeasurements();
  const ioda    = getIoda();
  const ris     = getRisLive();
  const bgpMap  = Object.fromEntries(bgp.map(b => [b.id, b]));
  const dnsMap  = Object.fromEntries(dns.map(d => [d.id, d]));
  const iodaMap  = Object.fromEntries(ioda.map(i => [i.id, i]));
  const risMap   = Object.fromEntries(ris.map(r => [r.id, r]));
  const radar    = getCfRadar();
  const radarMap = Object.fromEntries(radar.map(r => [r.id, r]));

  res.json(atlas.map(m => {
    const bgpData   = bgpMap[m.id]   || null;
    const dnsData   = dnsMap[m.id]   || null;
    const iodaData  = iodaMap[m.id]  || null;
    const risData   = risMap[m.id]   || null;
    const radarData = radarMap[m.id] || null;

    // Compute correlation score from all layers
    const correlation = computeCorrelation({
      atlas:  m,          // has status, ratio, current
      bgp:    bgpData,    // has status, current.visibility_pct
      ioda:   iodaData,
      radar:  radarData,
      ris:    risData,
    });

    // Correlation score history (Supabase-backed)
    const correlationHistory = getCorrelationHistory(m.id);

    return {
      ...m,
      bgp: bgpData ? {
        current:         bgpData.current,
        history:         bgpData.history,
        status:          bgpData.status,
        ok:              bgpData.ok,
        error:           bgpData.error,
        prefixes:        bgpData.prefixes        || null,
        prefixDiff:      bgpData.prefixDiff      || null,
        prefixChangeLog: bgpData.prefixChangeLog || [],
        rpki:            getRpkiSnapshot(m.id) || bgpData.rpki || null,
        pathLength:      bgpData.pathLength      || null,
      } : null,
      dns: dnsData ? {
        current:      dnsData.current,
        history:      dnsData.history,
        baseline_rtt: dnsData.baseline_rtt,
        ratio:        dnsData.ratio,
        status:       dnsData.status,
        ok:           dnsData.ok,
        error:        dnsData.error,
        probeDetails: dnsData.probeDetails || [],
      } : null,
      ioda: iodaData ? {
        events:         iodaData.events,
        hasActiveEvent: iodaData.hasActiveEvent,
        activeCount:    iodaData.activeCount,
        recentCount:    iodaData.recentCount,
        status:         iodaData.status,
        ok:             iodaData.ok,
        error:          iodaData.error,
        lastChecked:    iodaData.lastChecked,
        iodaAsn:        iodaData.iodaAsn,    // may differ from market ASN (e.g. Turkey)
        signals:        iodaData.signals,    // { bgp: { current, history[], unit }, ping: { ... } }
      } : null,
      ris: risData ? {
        connected:       risData.connected,
        withdrawals1h:   risData.withdrawals1h,
        withdrawals6h:   risData.withdrawals6h,
        announcements1h: risData.announcements1h,
        announcements6h: risData.announcements6h,
        lastEvent:       risData.lastEvent,
        status:          risData.status,
        recentEvents:            risData.recentEvents,
        recentWithdrawals:       risData.recentWithdrawals,
        recentAnnouncements:     risData.recentAnnouncements,
        hijackCandidateCount:    risData.hijackCandidateCount   ?? 0,
        recentHijackCandidates:  risData.recentHijackCandidates ?? [],
      } : null,
      radar: radarData ? {
        events:      radarData.events,
        hasAlert:    radarData.hasAlert,
        alertCount:  radarData.alertCount,
        recentCount: radarData.recentCount,
        status:      radarData.status,
        ok:          radarData.ok,
        error:       radarData.error,
        lastChecked: radarData.lastChecked,
        configured:  radarData.configured,
      } : null,
      correlation,
      correlationHistory,   // 36h history for the score trend chart
    };
  }));
});

// GET /api/asn-neighbours — BGP peer topology (upstream + peer ASNs + org names)
app.get("/api/asn-neighbours", (_req, res) => {
  res.json(getEnrichment());
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
          fetch(`http://localhost:${PORT}/api/tickets?alarm_type=${encodeURIComponent(alarmType)}&node=${encodeURIComponent(nodeId)}&status=new,assigned,in_progress,waiting`)
            .then(r => r.json())
            .then(tickets => {
              for (const t of (tickets || [])) {
                fetch(`http://localhost:${PORT}/api/tickets/${t.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "resolved", actor_name: "System" }),
                }).catch(e => log(chalk.yellow(`[poller] ticket auto-resolve failed ${t.id}: ${e.message}`)));
              }
            }).catch(e => log(chalk.yellow(`[poller] ticket lookup failed for resolve: ${e.message}`)));
        } else if (["Critical", "Major"].includes(sev)) {
          fetch(`http://localhost:${PORT}/api/tickets?alarm_type=${encodeURIComponent(alarmType)}&node=${encodeURIComponent(nodeId)}&status=new,assigned,in_progress,waiting`)
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
                }).catch(e => log(chalk.yellow(`[poller] ticket event failed ${t.id}: ${e.message}`)));
              }
            }).catch(e => log(chalk.yellow(`[poller] ticket lookup failed for event: ${e.message}`)));
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

  // Log new alarms (fleet is simulated — no Slack notifications)
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

// ─── Poller pause / resume ────────────────────────────────────────────────────
// GET  /api/control/poller/status        → {ripe:"running", bgp:"paused", ...}
// POST /api/control/poller/pause/:module → pause one module
// POST /api/control/poller/resume/:module→ resume one module
// POST /api/control/poller/pause-all     → pause everything
// POST /api/control/poller/resume-all    → resume everything

app.get("/api/control/poller/status", (req, res) => {
  res.json(getPollerStatus());
});

app.post("/api/control/poller/pause/:module", (req, res) => {
  const { module } = req.params;
  if (!POLLER_MODULES.includes(module))
    return res.status(400).json({ error: `Unknown module. Valid: ${POLLER_MODULES.join(", ")}` });
  pauseModule(module);
  log(chalk.yellow(`[poller-control] ⏸ ${module} paused`));
  res.json({ module, status: "paused" });
});

app.post("/api/control/poller/resume/:module", (req, res) => {
  const { module } = req.params;
  if (!POLLER_MODULES.includes(module))
    return res.status(400).json({ error: `Unknown module. Valid: ${POLLER_MODULES.join(", ")}` });
  resumeModule(module);
  log(chalk.green(`[poller-control] ▶ ${module} resumed`));
  res.json({ module, status: "running" });
});

app.post("/api/control/poller/pause-all", (req, res) => {
  pauseAll();
  log(chalk.yellow("[poller-control] ⏸ ALL modules paused"));
  res.json({ status: "paused", modules: POLLER_MODULES });
});

app.post("/api/control/poller/resume-all", (req, res) => {
  resumeAll();
  log(chalk.green("[poller-control] ▶ ALL modules resumed"));
  res.json({ status: "running", modules: POLLER_MODULES });
});

// ─── Notifier simulate endpoint ──────────────────────────────────────────────
// POST /api/control/notifier/simulate
// Body: { type: "warning"|"outage"|"recovery", signal: "atlas"|"bgp"|"dns"|"svc", marketId, detail? }
// Sends a synthetic Slack alert so you can verify formatting without a real incident.
// Example:
//   curl -X POST https://api.chemafmp.dev/api/control/notifier/simulate \
//     -H "Content-Type: application/json" \
//     -d '{"type":"outage","signal":"bgp","marketId":"uk","detail":"74% peers"}'

const SIMULATE_MARKETS = {
  es: { id: "es", name: "Spain",       flag: "🇪🇸" },
  uk: { id: "uk", name: "UK",          flag: "🇬🇧" },
  de: { id: "de", name: "Germany",     flag: "🇩🇪" },
  it: { id: "it", name: "Italy",       flag: "🇮🇹" },
  pt: { id: "pt", name: "Portugal",    flag: "🇵🇹" },
  nl: { id: "nl", name: "Netherlands", flag: "🇳🇱" },
  ie: { id: "ie", name: "Ireland",     flag: "🇮🇪" },
  gr: { id: "gr", name: "Greece",      flag: "🇬🇷" },
  tr: { id: "tr", name: "Turkey",      flag: "🇹🇷" },
};

app.post("/api/control/notifier/simulate", async (req, res) => {
  const { type, signal, marketId, detail, ticketId } = req.body || {};
  if (!type || !signal || !marketId) {
    return res.status(400).json({ error: "Required: type, signal, marketId" });
  }
  const market = SIMULATE_MARKETS[marketId];
  if (!market) {
    return res.status(400).json({ error: `Unknown marketId. Valid: ${Object.keys(SIMULATE_MARKETS).join(", ")}` });
  }
  if (!["warning","outage","recovery"].includes(type)) {
    return res.status(400).json({ error: "type must be warning | outage | recovery" });
  }
  if (!["atlas","bgp","dns","svc"].includes(signal)) {
    return res.status(400).json({ error: "signal must be atlas | bgp | dns | svc" });
  }

  try {
    await simulateAlert({ type, signal, market, detail: detail || "", ticketId: ticketId || null });
    log(chalk.magenta(`[notifier] 🎭 simulated ${type} · ${signal} · ${marketId}${ticketId ? ` · ticket=${ticketId}` : ""}`));
    res.json({ ok: true, type, signal, marketId, detail: detail || "", ticketId: ticketId || null });
  } catch (e) {
    log(chalk.yellow(`[notifier] simulate error: ${e.message}`));
    res.status(500).json({ error: e.message });
  }
});

// ─── Full-stack network signal simulate endpoint ──────────────────────────────
// POST /api/simulate/network
// Body: { signal, marketId, status, detail? }
// Creates a ticket AND sends Slack — same as a real checkNetworkHealth transition.
// Example:
//   curl -X POST https://api.chemafmp.dev/api/simulate/network \
//     -H "Content-Type: application/json" \
//     -d '{"signal":"atlas","marketId":"uk","status":"outage","detail":"×3.2 ratio"}'
app.post("/api/simulate/network", async (req, res) => {
  const { signal, marketId, status = "outage", detail = "" } = req.body || {};
  if (!signal || !marketId) {
    return res.status(400).json({ error: "Required: signal, marketId" });
  }
  if (!["atlas","bgp","dns","ioda","radar","svc"].includes(signal)) {
    return res.status(400).json({ error: "signal must be atlas | bgp | dns | ioda | radar | svc" });
  }
  if (!["warning","outage","alert"].includes(status)) {
    return res.status(400).json({ error: "status must be warning | outage | alert" });
  }
  const market = SIMULATE_MARKETS[marketId];
  if (!market) {
    return res.status(400).json({ error: `Unknown marketId. Valid: ${Object.keys(SIMULATE_MARKETS).join(", ")}` });
  }

  try {
    let ticketId = null;
    if (signal === "svc") {
      ticketId = await createServiceTicket({ ...market, complaints: null, ratio: null }, status === "alert" ? "alert" : "warn");
    } else {
      ticketId = await createNetworkTicket(market, signal, status === "alert" ? "outage" : status, detail);
    }

    // Post Slack with ticket link (bypass mute — it's a simulation)
    const signalLabels = { atlas: "ICMP Latency (RIPE Atlas)", bgp: "BGP Visibility", dns: "DNS RTT",
                           ioda: "CAIDA IODA Outage", radar: "Cloudflare Radar BGP", svc: "Downdetector Complaints" };
    const label    = signalLabels[signal] || signal;
    const isOutage = status === "outage" || status === "alert";
    const emoji    = isOutage ? "🔴" : "🟠";
    const color    = isOutage ? "#dc2626" : "#f59e0b";
    const severity = isOutage ? "OUTAGE" : "WARNING";
    const ts       = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

    const { ticketLinkBlock: _ } = await import("./lib/notifier.js").catch(() => ({}));
    const FRONTEND_URL = process.env.FRONTEND_URL || "https://chemafmp.github.io/vodafone-cm";
    const WEBHOOK_URL  = process.env.SLACK_WEBHOOK_URL;
    if (WEBHOOK_URL) {
      const blocks = [
        { type: "section", text: { type: "mrkdwn",
          text: `${emoji} *${severity} — ${market.flag} ${market.name}*\n*Signal:* ${label}${detail ? `  ·  ${detail}` : ""}` } },
      ];
      if (ticketId) {
        blocks.push({ type: "section", text: { type: "mrkdwn",
          text: `🎫 *<${FRONTEND_URL}/#ticket=${encodeURIComponent(ticketId)}|View Ticket ${ticketId} →>*` } });
      }
      blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `Bodaphone NOC · Simulation · ${ts} UTC` }] });
      await fetch(WEBHOOK_URL, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachments: [{ color, blocks }] }) }).catch(() => null);
    }

    log(chalk.magenta(`[simulate] 🎭 network ${signal} ${status} · ${marketId} → ticket=${ticketId || "none"}`));
    res.json({ ok: true, signal, marketId, status, detail, ticketId });
  } catch (e) {
    log(chalk.yellow(`[simulate] network error: ${e.message}`));
    res.status(500).json({ error: e.message });
  }
});

// ─── Network signal ticket creators ──────────────────────────────────────────

const SIGNAL_META = {
  atlas: { label: "RIPE Atlas Latency",   alarmType: "NETWORK_ATLAS" },
  bgp:   { label: "BGP Visibility",       alarmType: "NETWORK_BGP"   },
  dns:   { label: "DNS RTT",              alarmType: "NETWORK_DNS"   },
  ioda:  { label: "CAIDA IODA Outage",    alarmType: "IODA_OUTAGE"   },
  radar: { label: "Cloudflare Radar BGP", alarmType: "RADAR_ALERT"   },
};

/**
 * Create a ticket for a network health signal degradation.
 * Called by checkNetworkHealth when a status transition fires.
 *
 * @param {{ id, name, flag }} market
 * @param {string} signal - "atlas" | "bgp" | "dns" | "ioda" | "radar"
 * @param {string} status - "warning" | "outage"
 * @param {string} detail - extra context string
 * @returns {Promise<string|null>} ticketId or null
 */
async function createNetworkTicket(market, signal, status, detail) {
  const meta = SIGNAL_META[signal] || { label: signal, alarmType: `NETWORK_${signal.toUpperCase()}` };
  const alarm = {
    id:       `net-${signal}-${market.id}-${Date.now()}`,
    type:     meta.alarmType,
    severity: status === "outage" ? "Critical" : "Major",
    nodeId:   `market-${market.id}`,
    message:  `${meta.label} ${status.toUpperCase()} — ${market.flag} ${market.name}${detail ? ` · ${detail}` : ""}`,
    metric:   null,
    affectedServices: [],
  };
  const nodeMeta = { country: market.name, role: `Network signal (${meta.label})` };
  try {
    const ticket = await autoCreateTicketFromAlarm(alarm, nodeMeta);
    if (ticket?.id) log(chalk.cyan(`[tickets] 🎫 ${meta.alarmType} → ${ticket.id} (${market.name})`));
    return ticket?.id || null;
  } catch (e) {
    log(chalk.yellow(`[tickets] network ticket create failed: ${e.message}`));
    return null;
  }
}

/**
 * Create a ticket for a Downdetector service status degradation.
 * Called by checkServiceStatus when a real Downdetector market degrades.
 *
 * @param {{ id, name, flag, complaints, ratio }} market
 * @param {string} status - "warn" | "alert"
 * @returns {Promise<string|null>} ticketId or null
 */
async function createServiceTicket(market, status) {
  const alarm = {
    id:       `svc-${market.id}-${Date.now()}`,
    type:     "DOWNDETECTOR",
    severity: status === "alert" ? "Critical" : "Major",
    nodeId:   `market-${market.id}`,
    message:  `Downdetector Complaints ${status.toUpperCase()} — ${market.flag} ${market.name}`,
    metric:   market.complaints || null,
    affectedServices: [],
  };
  const nodeMeta = { country: market.name, role: "Service monitoring (Downdetector)" };
  try {
    const ticket = await autoCreateTicketFromAlarm(alarm, nodeMeta);
    if (ticket?.id) log(chalk.cyan(`[tickets] 🎫 DOWNDETECTOR → ${ticket.id} (${market.name})`));
    return ticket?.id || null;
  } catch (e) {
    log(chalk.yellow(`[tickets] service ticket create failed: ${e.message}`));
    return null;
  }
}

// ─── Cloud Health ticket creator ─────────────────────────────────────────────
/**
 * Auto-create a ticket when a cloud provider degrades.
 * @param {{ id, name, icon, cat, activeIncidents[] }} provider
 * @param {string} status - "warning" | "outage"
 * @returns {Promise<string|null>} ticketId or null
 */
async function createCloudTicket(provider, status) {
  const isOutage = status === "outage";
  const incident = provider.activeIncidents?.[0];
  const detail   = incident ? ` — ${incident.name}` : "";
  const alarm = {
    id:               `cloud-${provider.id}-${Date.now()}`,
    type:             "CLOUD_DEPENDENCY",
    severity:         isOutage ? "Critical" : "Major",
    nodeId:           `cloud-${provider.id}`,
    message:          `${provider.icon} ${provider.name} ${status.toUpperCase()}${detail}`,
    metric:           provider.activeIncidents?.length || null,
    affectedServices: [provider.name],
  };
  const nodeMeta = {
    country: "Global",
    role:    `Cloud dependency (${provider.cat?.toUpperCase() || "CLOUD"})`,
  };
  try {
    const ticket = await autoCreateTicketFromAlarm(alarm, nodeMeta);
    if (ticket?.id) {
      setProviderTicketId(provider.id, ticket.id);
      log(chalk.cyan(`[tickets] 🎫 CLOUD_DEPENDENCY → ${ticket.id} (${provider.name})`));
    }
    return ticket?.id || null;
  } catch (e) {
    log(chalk.yellow(`[tickets] cloud ticket create failed: ${e.message}`));
    return null;
  }
}

// ─── Hijack ticket creator (used by checkHijackCandidates + simulate) ────────
async function createHijackTicket(market, candidates) {
  const newest = candidates[0] || {};
  const alarm = {
    id:       `hijack-${market.id}-${Date.now()}`,
    type:     "HIJACK",
    severity: "Critical",
    nodeId:   `market-${market.id}`,
    message:  `BGP Hijack Candidate — prefix ${newest.prefix || "unknown"} announced by unexpected AS${newest.originAsn || "?"}`,
    metric:   candidates.length,
    affectedServices: [],
  };
  const nodeMeta = { country: market.name, role: "BGP routing (RIS Live)" };
  try {
    const ticket = await autoCreateTicketFromAlarm(alarm, nodeMeta);
    return ticket?.id || null;
  } catch { return null; }
}

// ─── Simulate hijack endpoint ─────────────────────────────────────────────────
// POST /api/simulate/hijack
// Body: { marketId?, prefix?, originAsn? }
// Injects a synthetic hijack candidate for the given market, auto-creates a ticket,
// and fires a Slack alert with a ticket link.
app.post("/api/simulate/hijack", async (req, res) => {
  const { marketId = "es", prefix = "212.166.64.0/19", originAsn = 64512 } = req.body || {};
  const market = SIMULATE_MARKETS[marketId];
  if (!market) {
    return res.status(400).json({ error: `Unknown marketId. Valid: ${Object.keys(SIMULATE_MARKETS).join(", ")}` });
  }

  // Inject into RIS Live state
  const matchedAsn = { es: 12430, uk: 5378, de: 3209, it: 30722, pt: 12353, nl: 33915, ie: 15502, gr: 3329, tr: 15924 }[marketId] || 12430;
  const ok = injectHijackCandidate(marketId, { prefix, originAsn, matchedAsn });
  if (!ok) return res.status(500).json({ error: `Could not inject into market ${marketId}` });

  // Build candidate list from current state (after injection)
  const nh = getNetworkHealth();
  const mData = nh.find(m => m.id === marketId) || {};
  const candidates = mData.ris?.recentHijackCandidates || [{ prefix, originAsn, matchedAsn, ts: Date.now() }];

  // Auto-create ticket
  const ticketId = await createHijackTicket(
    { ...market, flag: { es:"🇪🇸",uk:"🇬🇧",de:"🇩🇪",it:"🇮🇹",pt:"🇵🇹",nl:"🇳🇱",ie:"🇮🇪",gr:"🇬🇷",tr:"🇹🇷" }[marketId] || "🌍" },
    candidates
  );

  // Fire Slack (bypass mute for simulation)
  await checkHijackCandidates(
    nh.map(m => m.id === marketId ? { ...m, ris: { ...m.ris, hijackCandidateCount: 999, recentHijackCandidates: candidates } } : m),
    async () => ticketId
  ).catch(() => null);

  log(chalk.magenta(`[hijack] 🎭 simulated hijack injection — ${marketId} · prefix=${prefix} · originAS=${originAsn} · ticket=${ticketId || "none"}`));
  res.json({ ok: true, marketId, prefix, originAsn, matchedAsn, ticketId });
});

// /api/ioda-push removed — IODA v2 is now polled natively from the droplet.
// The old Mac-cron workaround was needed because api.ioda.caida.org blocked
// cloud IPs; the new endpoint api.ioda.inetintel.cc.gatech.edu/v2/ does not.

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

  // Service status — preload Supabase history then start tick every 30s
  const SERVICE_STATUS_INTERVAL = 30_000;
  const useScraper = process.env.USE_SCRAPER === "1";
  log(chalk.cyan(`[service-status] starting — mode: ${useScraper ? chalk.bold("SCRAPER (Downdetector)") : "simulator"} (tick every ${SERVICE_STATUS_INTERVAL / 1000}s)`));
  initServiceStatus(log).then(() => {
    setInterval(() => {
      tickServiceStatus(PORT, log)
        .then(() => checkServiceStatus(getServiceStatus(), createServiceTicket))
        .catch(e => log(chalk.yellow(`[service-status] tick error: ${e.message}`)));
    }, SERVICE_STATUS_INTERVAL);
    setTimeout(() => tickServiceStatus(PORT, log)
      .then(() => checkServiceStatus(getServiceStatus(), createServiceTicket))
      .catch(e => log(chalk.yellow(`[service-status] first tick error: ${e.message}`))), 2000);
  }).catch(e => log(chalk.yellow(`[service-status] init error: ${e.message}`)));

  // RIPE Atlas network health — tick every 5 min
  const RIPE_INTERVAL = 5 * 60 * 1000;
  initRipeAtlas(log).then(() => {
    log(chalk.cyan(`[ripe] network health polling started (every ${RIPE_INTERVAL / 60000} min)`));
    setInterval(() => {
      tickRipeAtlas(log)
        .then(() => checkNetworkHealth(getNetworkHealth(), createNetworkTicket))
        .catch(e => log(chalk.yellow(`[ripe] tick error: ${e.message}`)));
    }, RIPE_INTERVAL);
    // First tick after 10s to let other init settle
    setTimeout(() => tickRipeAtlas(log)
      .then(() => checkNetworkHealth(getNetworkHealth(), createNetworkTicket))
      .catch(e => log(chalk.yellow(`[ripe] first tick error: ${e.message}`))), 10_000);
  }).catch(e => log(chalk.yellow(`[ripe] init error: ${e.message}`)));

  // BGP visibility — tick every 5 min, staggered 15s after RIPE Atlas
  initBgpVisibility(log).then(() => {
    log(chalk.cyan(`[bgp] BGP visibility polling started (every ${RIPE_INTERVAL / 60000} min)`));
    setInterval(() => {
      tickBgpVisibility(log)
        .then(() => checkNetworkHealth(getNetworkHealth(), createNetworkTicket))
        .catch(e => log(chalk.yellow(`[bgp] tick error: ${e.message}`)));
    }, RIPE_INTERVAL);
    setTimeout(() => tickBgpVisibility(log)
      .then(() => checkNetworkHealth(getNetworkHealth(), createNetworkTicket))
      .catch(e => log(chalk.yellow(`[bgp] first tick error: ${e.message}`))), 15_000);
  }).catch(e => log(chalk.yellow(`[bgp] init error: ${e.message}`)));

  // DNS measurements — tick every 5 min, staggered 20s after RIPE Atlas
  initDnsMeasurements(log).then(() => {
    log(chalk.cyan(`[dns] DNS measurement polling started (every ${RIPE_INTERVAL / 60000} min)`));
    setInterval(() => {
      tickDnsMeasurements(log)
        .then(() => checkNetworkHealth(getNetworkHealth(), createNetworkTicket))
        .catch(e => log(chalk.yellow(`[dns] tick error: ${e.message}`)));
    }, RIPE_INTERVAL);
    setTimeout(() => tickDnsMeasurements(log)
      .then(() => checkNetworkHealth(getNetworkHealth(), createNetworkTicket))
      .catch(e => log(chalk.yellow(`[dns] first tick error: ${e.message}`))), 20_000);
  }).catch(e => log(chalk.yellow(`[dns] init error: ${e.message}`)));

  // CAIDA IODA — tick every 5 min, staggered 25s
  // initIoda is async: loads 36h history from Supabase before first tick
  initIoda(log).catch(e => log(chalk.yellow(`[ioda] init error: ${e.message}`)));
  setInterval(async () => {
    await tickIoda(log).catch(e => log(chalk.yellow(`[ioda] tick error: ${e.message}`)));
    tickRisLive();   // recompute RIS counters every cycle
    await tickCfRadar(log).catch(e => log(chalk.yellow(`[radar] tick error: ${e.message}`)));
    // Check IODA + Radar signal transitions (Atlas/BGP/DNS already checked in their own intervals)
    await checkNetworkHealth(getNetworkHealth(), createNetworkTicket).catch(e => log(chalk.yellow(`[notifier] ioda/radar check error: ${e.message}`)));
    await checkHijackCandidates(getNetworkHealth(), createHijackTicket).catch(e => log(chalk.yellow(`[hijack] notify error: ${e.message}`)));
    await saveAllCorrelationPoints(log);
  }, RIPE_INTERVAL);
  setTimeout(() => tickIoda(log).catch(e => log(chalk.yellow(`[ioda] first tick error: ${e.message}`))), 25_000);
  setTimeout(() => tickCfRadar(log).catch(e => log(chalk.yellow(`[radar] first tick error: ${e.message}`))), 35_000);

  // RIS Live — persistent WebSocket, starts immediately
  initRisLive(log);

  // Cloudflare Radar — token from CF_RADAR_TOKEN env var
  initCfRadar(log);

  // Cloud Health — AWS, GCP, Azure, Cloudflare, Fastly, GitHub… every 5 min
  const CLOUD_HEALTH_INTERVAL = 5 * 60 * 1000;
  initCloudHealth(log)
    .then(() => {
      log(chalk.cyan(`[cloud-health] polling 11 providers (every ${CLOUD_HEALTH_INTERVAL / 60000} min) · alarms + tickets enabled`));
      setInterval(() => {
        tickCloudHealth(log)
          .then(() => checkCloudHealth(getCloudHealth(), createCloudTicket))
          .catch(e => log(chalk.yellow(`[cloud-health] tick error: ${e.message}`)));
      }, CLOUD_HEALTH_INTERVAL);
    })
    .catch(e => log(chalk.yellow(`[cloud-health] init error: ${e.message}`)));

  // RIPE Stat ASN enrichment — BGP peer topology, org names (1h cache, no Supabase)
  initRipeStatEnrichment(log)
    .then(() => log(chalk.cyan("[enrich] RIPE Stat ASN enrichment ready")))
    .catch(e => log(chalk.yellow(`[enrich] init error: ${e.message}`)));
  // Refresh every 1h
  setInterval(() => {
    tickRipeStatEnrichment(log).catch(e => log(chalk.yellow(`[enrich] tick error: ${e.message}`)));
  }, 3_600_000);

  // Correlation history — load from Supabase on boot, persist each tick
  initCorrelationHistory(log).catch(e => log(chalk.yellow(`[corr-hist] init error: ${e.message}`)));

  // Slack notifications — send a test message on startup to confirm webhook works
  notifyTest();

  // RPKI daily job — load latest snapshot from Supabase on boot, then schedule daily at 03:00 UTC
  initRpkiDaily(supabase);
  loadRpkiSnapshots(log).catch(e => log(chalk.yellow(`[rpki] boot load error: ${e.message}`)));
  scheduleRpkiDaily(log);
});

// ─── Save correlation scores for all markets to Supabase ─────────────────────
async function saveAllCorrelationPoints(logFn) {
  const atlas    = getNetworkHealth();
  const bgp      = getBgpVisibility();
  const dns      = getDnsMeasurements();
  const ioda     = getIoda();
  const ris      = getRisLive();
  const radar    = getCfRadar();
  const bgpMap   = Object.fromEntries(bgp.map(b => [b.id, b]));
  const iodaMap  = Object.fromEntries(ioda.map(i => [i.id, i]));
  const risMap   = Object.fromEntries(ris.map(r => [r.id, r]));
  const radarMap = Object.fromEntries(radar.map(r => [r.id, r]));

  for (const m of atlas) {
    const bgpData   = bgpMap[m.id]   || null;
    const iodaData  = iodaMap[m.id]  || null;
    const risData   = risMap[m.id]   || null;
    const radarData = radarMap[m.id] || null;

    const correlation = computeCorrelation({ atlas: m, bgp: bgpData, ioda: iodaData, radar: radarData, ris: risData });
    const signals = {
      iodaActive:  iodaData?.activeCount   ?? null,
      radarAlerts: radarData?.alertCount   ?? null,
      risWd1h:     risData?.withdrawals1h  ?? null,
    };

    await saveCorrelationPoint(m.id, correlation, signals, logFn)
      .catch(e => logFn?.(`[corr-hist] save ${m.id}: ${e.message}`));
  }
}

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
  stopRisLive();

  server.close(() => process.exit(0));
  // Force exit after 3s if something hangs
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
