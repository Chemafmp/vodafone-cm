#!/usr/bin/env node
// ─── Bodaphone Node Simulator ─────────────────────────────────────────────────
//
// Simulates a single network device (router, switch, firewall...).
// Exposes an SNMP agent on a UDP port so the poller can query it,
// just like a real Cisco/Juniper/Nokia device.
//
// Usage:
//   node server/node-sim.js --id fj-suva-cr-01 --port 1161
//   node server/node-sim.js --id hw-hono-pe-01 --port 1162
//
// When you close the terminal (Ctrl+C), the SNMP agent stops responding,
// and the poller will detect it as "Device Unreachable".

import { createSnmpAgent } from "./lib/snmp-agent.js";
import { BGP_STATE, IF_STATUS } from "./lib/oids.js";
import { runScenario, SCENARIOS } from "./lib/scenarios.js";
import chalk from "chalk";

// ─── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}

const NODE_ID = getArg("id", "sim-node-01");
const SNMP_PORT = parseInt(getArg("port", "1161"));
const SNMP_ADDRESS = getArg("address", "127.0.0.1"); // loopback only by default
const POLLER_URL = getArg("poller", "http://localhost:4000");
const CHAOS = args.includes("--chaos"); // higher event frequency

// ─── Load node definition from seed data ─────────────────────────────────────
// We dynamically import the inventory files and find the matching node.
// If not found, we create a generic simulated node.

let nodeDef = null;
try {
  const [{ NODES_FJ }, { NODES_HW }, { NODES_IB }] = await Promise.all([
    import("../src/data/inventory/nodes-fiji.js"),
    import("../src/data/inventory/nodes-hawaii.js"),
    import("../src/data/inventory/nodes-ibiza.js"),
  ]);
  const allNodes = [...NODES_FJ, ...NODES_HW, ...NODES_IB];
  nodeDef = allNodes.find(n => n.id === NODE_ID);
} catch (e) {
  // Seed files not found — will use generic node
}

if (!nodeDef) {
  console.log(chalk.yellow(`[${NODE_ID}] Node not found in seed data, using generic profile`));
  nodeDef = {
    id: NODE_ID,
    hostname: `${NODE_ID}.bodaphone.net`,
    vendor: "Generic",
    hwModel: "Simulated Device",
    osVersion: "SimOS 1.0",
    layer: "Unknown",
    role: "sim",
    country: "XX",
    interfaces: [
      { name: "eth0", speed: "1G", operStatus: "UP" },
      { name: "eth1", speed: "1G", operStatus: "UP" },
      { name: "lo0",  speed: "—",  operStatus: "UP" },
    ],
    bgpNeighbors: [],
    powerConsumptionW: 500,
  };
}

// ─── Internal state (changes over time, simulating real device) ──────────────

const state = {
  cpu: 15 + Math.floor(Math.random() * 25),   // start 15-40%
  mem: 40 + Math.floor(Math.random() * 20),   // start 40-60%
  temp: 30 + Math.floor(Math.random() * 10),  // start 30-40°C
  memTotalMB: Math.floor((nodeDef.powerConsumptionW || 500) * 5), // rough estimate

  // Deep copy interfaces with live state
  interfaces: (nodeDef.interfaces || []).map(iface => ({
    name: iface.name,
    speed: iface.speed || "1G",
    operStatus: iface.operStatus === "DOWN" ? IF_STATUS.DOWN : IF_STATUS.UP,
    inOctets: Math.floor(Math.random() * 1_000_000),
    outOctets: Math.floor(Math.random() * 1_000_000),
  })),

  // Deep copy BGP peers with live state
  bgpPeers: (nodeDef.bgpNeighbors || []).map(p => ({
    ip: p.ip,
    description: p.description,
    state: p.state === "Established" ? BGP_STATE.ESTABLISHED : BGP_STATE.IDLE,
    prefixesRx: p.prefixesRx || 0,
  })),
};

// ─── Metric drift (simulates natural fluctuation) ────────────────────────────

function drift(value, min, max, maxDelta) {
  const delta = (Math.random() - 0.5) * 2 * maxDelta;
  return Math.max(min, Math.min(max, Math.round(value + delta)));
}

// Every 5 seconds: small random changes to CPU, memory, temperature
const driftInterval = setInterval(() => {
  state.cpu = drift(state.cpu, 5, 100, 5);
  state.mem = drift(state.mem, 20, 98, 3);
  state.temp = drift(state.temp, 25, 80, 2);

  // Traffic counters always grow
  for (const iface of state.interfaces) {
    if (iface.operStatus === IF_STATUS.UP) {
      iface.inOctets += Math.floor(Math.random() * 500_000);
      iface.outOctets += Math.floor(Math.random() * 400_000);
    }
  }
}, 5000);

// ─── Random events (simulates real incidents) ────────────────────────────────

const EVENT_INTERVAL_MIN = CHAOS ? 5_000 : 15_000;
const EVENT_INTERVAL_MAX = CHAOS ? 15_000 : 60_000;

function randomInterval() {
  return EVENT_INTERVAL_MIN + Math.random() * (EVENT_INTERVAL_MAX - EVENT_INTERVAL_MIN);
}

function scheduleEvent() {
  setTimeout(() => {
    triggerRandomEvent();
    scheduleEvent();
  }, randomInterval());
}

function triggerRandomEvent() {
  const events = [];

  // Weight events by what makes sense for this node
  if (state.interfaces.length > 1) events.push("link_flap", "link_flap"); // more likely
  if (state.bgpPeers.length > 0) events.push("bgp_drop");
  events.push("cpu_spike", "cpu_spike", "mem_spike", "temp_spike");

  const event = events[Math.floor(Math.random() * events.length)];

  switch (event) {
    case "cpu_spike": {
      const oldCpu = state.cpu;
      state.cpu = 85 + Math.floor(Math.random() * 15); // 85-100%
      log(chalk.red(`⚡ CPU SPIKE: ${oldCpu}% → ${state.cpu}%`));
      // Recover after 15-45s
      setTimeout(() => {
        state.cpu = 20 + Math.floor(Math.random() * 30);
        log(chalk.green(`✓ CPU recovered: → ${state.cpu}%`));
      }, 15_000 + Math.random() * 30_000);
      break;
    }

    case "mem_spike": {
      const oldMem = state.mem;
      state.mem = 88 + Math.floor(Math.random() * 10); // 88-98%
      log(chalk.red(`⚡ MEM SPIKE: ${oldMem}% → ${state.mem}%`));
      setTimeout(() => {
        state.mem = 40 + Math.floor(Math.random() * 25);
        log(chalk.green(`✓ MEM recovered: → ${state.mem}%`));
      }, 20_000 + Math.random() * 40_000);
      break;
    }

    case "temp_spike": {
      const oldTemp = state.temp;
      state.temp = 65 + Math.floor(Math.random() * 15); // 65-80°C
      log(chalk.yellow(`⚡ TEMP SPIKE: ${oldTemp}°C → ${state.temp}°C`));
      setTimeout(() => {
        state.temp = 30 + Math.floor(Math.random() * 10);
        log(chalk.green(`✓ TEMP recovered: → ${state.temp}°C`));
      }, 10_000 + Math.random() * 20_000);
      break;
    }

    case "link_flap": {
      // Pick a non-loopback interface
      const candidates = state.interfaces.filter(i =>
        !i.name.toLowerCase().includes("loop") &&
        !i.name.toLowerCase().includes("mgmt") &&
        i.operStatus === IF_STATUS.UP
      );
      if (candidates.length === 0) break;
      const iface = candidates[Math.floor(Math.random() * candidates.length)];
      iface.operStatus = IF_STATUS.DOWN;
      log(chalk.red(`⚡ LINK DOWN: ${iface.name}`));
      // Recover after 8-25s
      setTimeout(() => {
        iface.operStatus = IF_STATUS.UP;
        log(chalk.green(`✓ LINK UP: ${iface.name}`));
      }, 8_000 + Math.random() * 17_000);
      break;
    }

    case "bgp_drop": {
      const established = state.bgpPeers.filter(p => p.state === BGP_STATE.ESTABLISHED);
      if (established.length === 0) break;
      const peer = established[Math.floor(Math.random() * established.length)];
      peer.state = BGP_STATE.IDLE;
      const oldPfx = peer.prefixesRx;
      peer.prefixesRx = 0;
      log(chalk.red(`⚡ BGP DOWN: ${peer.ip} (${peer.description}) → Idle`));
      // Reconnect after 10-30s
      setTimeout(() => {
        peer.state = BGP_STATE.ESTABLISHED;
        peer.prefixesRx = oldPfx;
        log(chalk.green(`✓ BGP UP: ${peer.ip} → Established (${oldPfx} pfx)`));
      }, 10_000 + Math.random() * 20_000);
      break;
    }
  }
}

// ─── Start SNMP agent ────────────────────────────────────────────────────────

const sysDescr = `${nodeDef.vendor} ${nodeDef.hwModel} ${nodeDef.osVersion}`;

const snmpHandle = createSnmpAgent({
  port: SNMP_PORT,
  address: SNMP_ADDRESS,
  nodeInfo: {
    hostname: nodeDef.hostname || NODE_ID,
    sysDescr,
    location: `${nodeDef.country || "XX"} — Simulated`,
    contact: "noc@bodaphone.net",
    memTotalMB: state.memTotalMB,
  },
  interfaces: state.interfaces.map(i => ({
    name: i.name,
    speed: i.speed,
    operStatus: i.operStatus === IF_STATUS.DOWN ? "DOWN" : "UP",
  })),
  bgpPeers: state.bgpPeers,
  getMetrics: () => state,
});

// ─── Register with poller ────────────────────────────────────────────────────

async function registerWithPoller() {
  try {
    const res = await fetch(`${POLLER_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: NODE_ID,
        hostname: nodeDef.hostname || NODE_ID,
        port: SNMP_PORT,
        vendor: nodeDef.vendor,
        hwModel: nodeDef.hwModel,
        layer: nodeDef.layer,
        country: nodeDef.country,
        interfaces: state.interfaces.map(i => i.name),
        bgpPeers: state.bgpPeers.map(p => p.ip),
      }),
    });
    if (res.ok) {
      log(chalk.cyan(`Registered with poller at ${POLLER_URL}`));
    }
  } catch {
    log(chalk.gray(`Poller not running at ${POLLER_URL} (will retry)`));
    // Retry after 10s
    setTimeout(registerWithPoller, 10_000);
  }
}

// ─── Status display ──────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  console.log(chalk.gray(`[${ts}]`) + ` ${chalk.bold(NODE_ID)} ${msg}`);
}

function showStatus() {
  const ifaces = state.interfaces.map(i => {
    const s = i.operStatus === IF_STATUS.UP ? chalk.green("UP") : chalk.red("DOWN");
    return `${i.name}: ${s}`;
  }).join("  ");

  const peers = state.bgpPeers.map(p => {
    const s = p.state === BGP_STATE.ESTABLISHED
      ? chalk.green(`Established (${p.prefixesRx} pfx)`)
      : chalk.red("Idle");
    return `${p.ip}: ${s}`;
  }).join("  ");

  const cpuColor = state.cpu > 85 ? chalk.red : state.cpu > 60 ? chalk.yellow : chalk.green;
  const memColor = state.mem > 90 ? chalk.red : state.mem > 75 ? chalk.yellow : chalk.green;
  const tempColor = state.temp > 65 ? chalk.red : state.temp > 50 ? chalk.yellow : chalk.green;

  console.log(chalk.gray("─".repeat(70)));
  console.log(
    `  CPU: ${cpuColor(state.cpu + "%")}  ` +
    `MEM: ${memColor(state.mem + "%")}  ` +
    `TEMP: ${tempColor(state.temp + "°C")}  ` +
    `Uptime: ${formatUptime(Date.now() - startTime)}`
  );
  console.log(`  ${ifaces}`);
  if (peers) console.log(`  ${peers}`);
  console.log(chalk.gray("─".repeat(70)));
}

function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// ─── Boot sequence ───────────────────────────────────────────────────────────

const startTime = Date.now();

console.log("");
console.log(chalk.bold.white(`  ┌─────────────────────────────────────────────────┐`));
console.log(chalk.bold.white(`  │`) + chalk.bold.red(`  BODAPHONE`) + chalk.bold.white(` Network Node Simulator             │`));
console.log(chalk.bold.white(`  └─────────────────────────────────────────────────┘`));
console.log("");
console.log(`  Node ID:    ${chalk.bold(NODE_ID)}`);
console.log(`  Hostname:   ${nodeDef.hostname || NODE_ID}`);
console.log(`  Device:     ${chalk.cyan(sysDescr)}`);
console.log(`  Country:    ${nodeDef.country || "XX"}`);
console.log(`  Layer:      ${nodeDef.layer || "Unknown"}`);
console.log(`  SNMP Addr:  ${chalk.bold.green(`${SNMP_ADDRESS}:${SNMP_PORT}`)} (UDP)`);
console.log(`  Interfaces: ${state.interfaces.length}`);
console.log(`  BGP Peers:  ${state.bgpPeers.length}`);
if (CHAOS) console.log(chalk.red.bold(`  MODE:       🔥 CHAOS (high event frequency)`));
console.log("");

log(chalk.green(`SNMP agent listening on ${SNMP_ADDRESS}:${SNMP_PORT}`));

// Try to register with poller (non-blocking)
registerWithPoller();

// Start random events
scheduleEvent();

// Show status every 30s
const statusInterval = setInterval(showStatus, 30_000);
showStatus();

// ─── IPC: receive commands from launcher ─────────────────────────────────────

if (process.send) {
  // We were spawned with IPC channel (fork or spawn with 'ipc' in stdio)
  process.on("message", (msg) => {
    if (msg.type === "scenario") {
      const name = msg.scenario;
      if (runScenario(name, state, log)) {
        log(chalk.magenta(`🎬 Scenario "${name}" triggered via IPC`));
        process.send({ type: "scenario-ack", scenario: name, nodeId: NODE_ID });
      } else {
        log(chalk.yellow(`⚠ Unknown scenario: "${name}". Available: ${Object.keys(SCENARIOS).join(", ")}`));
        process.send({ type: "scenario-error", scenario: name, nodeId: NODE_ID, error: "unknown scenario" });
      }
    }
  });
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

process.on("SIGINT", () => {
  console.log("");
  log(chalk.yellow("Shutting down..."));
  clearInterval(driftInterval);
  clearInterval(statusInterval);
  snmpHandle.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  clearInterval(driftInterval);
  clearInterval(statusInterval);
  snmpHandle.close();
  process.exit(0);
});
