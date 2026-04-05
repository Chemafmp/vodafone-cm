#!/usr/bin/env node
// ─── Bodaphone Demo Launcher ────────────────────────────────────────────────
//
// One command to rule them all. Starts the poller + a fleet of simulated
// network nodes across Fiji, Hawaii and Ibiza.
//
// Usage:
//   node server/launch-demo.js                  # 6 default nodes
//   node server/launch-demo.js --nodes 3        # 3 nodes (1 per country)
//   node server/launch-demo.js --nodes 12       # 12 nodes (4 per country)
//   node server/launch-demo.js --chaos          # high event frequency
//   node server/launch-demo.js --no-poller      # nodes only (poller already running)
//
// Interactive keys:
//   k <num>           Kill node #<num>  (simulates device crash)
//   r <num>           Revive node #<num>
//   c <num> <name>    Trigger scenario (cascade, maintenance, linkflap, bgpleak, thermal)
//   s                 Show status of all nodes
//   h                 Help
//   q                 Quit all processes
//
// ─────────────────────────────────────────────────────────────────────────────

import { spawn, fork } from "child_process";
import chalk from "chalk";
import readline from "readline";
import { NODE_POOL, selectNodes } from "./lib/node-pool.js";

// ─── Parse CLI args ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && args[idx + 1] ? args[idx + 1] : fallback;
}
const NODE_COUNT = Math.max(1, Math.min(20, parseInt(getArg("nodes", "6"))));
const CHAOS = args.includes("--chaos");
const SKIP_POLLER = args.includes("--no-poller");
const POLLER_PORT = parseInt(getArg("port", "4000"));

// Node fleet: representative nodes from each country, round-robin distribution.
// Pool and selector live in ./lib/node-pool.js so the poller's auto-fleet mode
// can reuse the exact same list without duplication.
const fleet = selectNodes(NODE_COUNT);

// ─── State tracking ─────────────────────────────────────────────────────────

const processes = new Map(); // nodeId → { proc, port, status, def }
const BASE_SNMP_PORT = 1161;
let pollerProc = null;
let shuttingDown = false;

// ─── Logging ────────────────────────────────────────────────────────────────

function ts() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function log(msg) {
  console.log(chalk.gray(`[${ts()}]`) + ` ${msg}`);
}

// ─── Start poller ───────────────────────────────────────────────────────────

function startPoller() {
  return new Promise((resolve) => {
    log(chalk.bold.white("Starting poller..."));
    const proc = spawn("node", ["server/poller.js", "--port", String(POLLER_PORT)], {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: process.cwd(),
    });

    pollerProc = proc;

    let started = false;
    proc.stdout.on("data", (data) => {
      const line = data.toString().trim();
      if (line && !started) {
        // Wait until we see the port message
        if (line.includes("localhost") || line.includes("Poller started")) {
          started = true;
          log(chalk.green(`✓ Poller running on :${POLLER_PORT}`));
          resolve();
        }
      }
    });

    proc.stderr.on("data", (data) => {
      const line = data.toString().trim();
      if (line) log(chalk.red(`[poller err] ${line}`));
    });

    proc.on("exit", (code) => {
      if (!shuttingDown) {
        log(chalk.red(`✗ Poller exited with code ${code}`));
      }
      pollerProc = null;
    });

    // Fallback resolve after 3s even if we don't see the message
    setTimeout(() => { if (!started) { started = true; resolve(); } }, 3000);
  });
}

// ─── Start a node ───────────────────────────────────────────────────────────

function startNode(def, port) {
  const nodeArgs = ["--id", def.id, "--port", String(port), "--poller", `http://localhost:${POLLER_PORT}`];
  if (CHAOS) nodeArgs.push("--chaos");

  // Use fork() instead of spawn() to get an IPC channel for scenario control
  const proc = fork("server/node-sim.js", nodeArgs, {
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    cwd: process.cwd(),
  });

  const entry = { proc, port, status: "STARTING", def, startedAt: Date.now() };
  processes.set(def.id, entry);

  proc.stdout.on("data", (data) => {
    const line = data.toString().trim();
    if (line.includes("Registered with poller") || line.includes("SNMP agent listening")) {
      entry.status = "RUNNING";
    }
  });

  proc.stderr.on("data", (data) => {
    const line = data.toString().trim();
    if (line) log(chalk.red(`[${def.id}] ${line}`));
  });

  proc.on("message", (msg) => {
    if (msg.type === "scenario-ack") {
      log(chalk.magenta(`🎬 ${msg.nodeId}: scenario "${msg.scenario}" started`));
    }
  });

  proc.on("exit", (code) => {
    if (!shuttingDown) {
      entry.status = "DEAD";
      entry.proc = null;
    }
  });

  return entry;
}

// ─── Kill / Revive a node ───────────────────────────────────────────────────

function killNode(index) {
  const node = fleet[index];
  if (!node) { log(chalk.yellow(`No node at index ${index}`)); return; }
  const entry = processes.get(node.id);
  if (!entry || !entry.proc) {
    log(chalk.yellow(`${node.id} is already dead`));
    return;
  }
  log(chalk.red(`💀 Killing ${chalk.bold(node.id)} (${node.label})...`));
  entry.proc.kill("SIGTERM");
  entry.status = "KILLED";
  entry.proc = null;
}

function reviveNode(index) {
  const node = fleet[index];
  if (!node) { log(chalk.yellow(`No node at index ${index}`)); return; }
  const entry = processes.get(node.id);
  if (entry && entry.proc) {
    log(chalk.yellow(`${node.id} is already running`));
    return;
  }
  log(chalk.green(`🔄 Reviving ${chalk.bold(node.id)} (${node.label})...`));
  const port = entry ? entry.port : BASE_SNMP_PORT + index;
  startNode(node, port);
}

// ─── Trigger scenario on a node ─────────────────────────────────────────────

const SCENARIO_NAMES = ["cascade", "maintenance", "linkflap", "bgpleak", "thermal"];

function triggerScenario(index, scenarioName) {
  const node = fleet[index];
  if (!node) { log(chalk.yellow(`No node at index ${index}`)); return; }
  const entry = processes.get(node.id);
  if (!entry || !entry.proc) {
    log(chalk.yellow(`${node.id} is not running — can't trigger scenario`));
    return;
  }
  if (!scenarioName || !SCENARIO_NAMES.includes(scenarioName)) {
    log(chalk.yellow(`Available scenarios: ${SCENARIO_NAMES.join(", ")}`));
    return;
  }
  log(chalk.magenta(`🎬 Sending "${scenarioName}" to ${chalk.bold(node.id)}...`));
  entry.proc.send({ type: "scenario", scenario: scenarioName });
}

// ─── Status display ─────────────────────────────────────────────────────────

function showFleetStatus() {
  console.log("");
  console.log(chalk.bold.white("  ═══ Fleet Status ═══"));
  console.log("");

  const countries = { FJ: "🇫🇯 Fiji", HW: "🌺 Hawaii", IB: "🏝  Ibiza" };
  let lastCountry = null;

  fleet.forEach((node, i) => {
    if (node.country !== lastCountry) {
      lastCountry = node.country;
      console.log(chalk.bold(`  ${countries[node.country] || node.country}`));
    }

    const entry = processes.get(node.id);
    const statusIcon = !entry ? "⬛" :
      entry.status === "RUNNING"  ? "🟢" :
      entry.status === "STARTING" ? "🟡" :
      entry.status === "KILLED"   ? "💀" :
      entry.status === "DEAD"     ? "🔴" : "⬜";

    const statusText = !entry ? "NOT STARTED" :
      entry.status === "RUNNING"  ? chalk.green("RUNNING") :
      entry.status === "STARTING" ? chalk.yellow("STARTING") :
      entry.status === "KILLED"   ? chalk.red("KILLED") :
      entry.status === "DEAD"     ? chalk.red("CRASHED") : chalk.gray("UNKNOWN");

    const port = entry ? `:${entry.port}` : "";
    console.log(`    ${statusIcon}  ${chalk.gray(`[${i}]`)} ${chalk.bold(node.id.padEnd(20))} ${statusText.padEnd(20)} ${chalk.gray(port.padEnd(6))} ${chalk.dim(node.label)}`);
  });

  console.log("");
  console.log(chalk.gray("  Commands: k<n> kill · r<n> revive · c<n> <scenario> · s status · h help · q quit"));
  console.log("");
}

// ─── Interactive input ──────────────────────────────────────────────────────

function setupInput() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt(chalk.gray("bodaphone> "));

  rl.on("line", (line) => {
    const cmd = line.trim().toLowerCase();

    if (cmd === "q" || cmd === "quit" || cmd === "exit") {
      shutdown();
      return;
    }

    if (cmd === "s" || cmd === "status") {
      showFleetStatus();
      rl.prompt();
      return;
    }

    // k0, k1, k2... kill node
    const killMatch = cmd.match(/^k\s*(\d+)$/);
    if (killMatch) {
      killNode(parseInt(killMatch[1]));
      rl.prompt();
      return;
    }

    // r0, r1, r2... revive node
    const reviveMatch = cmd.match(/^r\s*(\d+)$/);
    if (reviveMatch) {
      reviveNode(parseInt(reviveMatch[1]));
      rl.prompt();
      return;
    }

    // c0 cascade, c1 linkflap, c2 bgpleak...
    const chaosMatch = cmd.match(/^c\s*(\d+)\s*(\w+)?$/);
    if (chaosMatch) {
      const idx = parseInt(chaosMatch[1]);
      const scenario = chaosMatch[2] || null;
      if (!scenario) {
        console.log("");
        console.log(chalk.bold("  Available scenarios:"));
        console.log("    cascade      CPU→MEM→TEMP→interfaces→BGP all fail, then recover (~55s)");
        console.log("    maintenance  CPU climbs, interface bounce, then normalize (~40s)");
        console.log("    linkflap     Interface bounces UP/DOWN 8 times rapidly (~35s)");
        console.log("    bgpleak      Peer advertises 850k prefixes, memory spikes (~30s)");
        console.log("    thermal      Temperature climbs until thermal shutdown (~50s)");
        console.log("");
        console.log(chalk.gray(`  Usage: c${idx} cascade`));
        console.log("");
      } else {
        triggerScenario(idx, scenario);
      }
      rl.prompt();
      return;
    }

    if (cmd === "help" || cmd === "h" || cmd === "?") {
      console.log("");
      console.log(chalk.bold("  Commands:"));
      console.log("    s              Show fleet status");
      console.log("    k <num>        Kill node by index (e.g. k0, k2)");
      console.log("    r <num>        Revive killed node (e.g. r0, r2)");
      console.log("    c <num> <name> Trigger scenario (e.g. c0 cascade, c1 linkflap)");
      console.log("    q              Quit everything");
      console.log("");
      console.log(chalk.bold("  Scenarios:"));
      console.log("    cascade      Full meltdown: CPU→MEM→TEMP→links→BGP");
      console.log("    maintenance  Planned work: CPU climb + interface bounce");
      console.log("    linkflap     Rapid interface UP/DOWN flapping");
      console.log("    bgpleak      BGP route leak → memory spike → session drop");
      console.log("    thermal      Cooling failure → temperature climb → shutdown");
      console.log("");
      rl.prompt();
      return;
    }

    if (cmd) {
      log(chalk.yellow(`Unknown command: "${cmd}". Type 'h' for help.`));
    }
    rl.prompt();
  });

  rl.on("close", () => shutdown());

  // Show prompt after a short delay (let boot messages finish)
  setTimeout(() => rl.prompt(), 2000);
}

// ─── Shutdown ───────────────────────────────────────────────────────────────

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("");
  log(chalk.yellow("Shutting down all processes..."));

  // Kill all nodes
  for (const [id, entry] of processes) {
    if (entry.proc) {
      entry.proc.kill("SIGTERM");
    }
  }

  // Kill poller
  if (pollerProc) {
    pollerProc.kill("SIGTERM");
  }

  setTimeout(() => {
    log(chalk.green("All processes stopped. Goodbye!"));
    process.exit(0);
  }, 1000);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log(chalk.bold.white("  ┌─────────────────────────────────────────────────────┐"));
  console.log(chalk.bold.white("  │") + chalk.bold.red("  BODAPHONE") + chalk.bold.white(" Demo Launcher                          │"));
  console.log(chalk.bold.white("  └─────────────────────────────────────────────────────┘"));
  console.log("");
  console.log(`  Nodes:       ${chalk.bold(NODE_COUNT)} (${fleet.map(n => n.id).join(", ")})`);
  console.log(`  Poller:      ${SKIP_POLLER ? chalk.yellow("skipped (--no-poller)") : chalk.green(`:${POLLER_PORT}`)}`);
  console.log(`  SNMP ports:  ${chalk.bold(`:${BASE_SNMP_PORT}`)} – ${chalk.bold(`:${BASE_SNMP_PORT + fleet.length - 1}`)}`);
  if (CHAOS) console.log(chalk.red.bold("  Mode:        🔥 CHAOS — high event frequency"));
  console.log("");

  // 1. Start poller (unless skipped)
  if (!SKIP_POLLER) {
    await startPoller();
    // Small delay to let poller be fully ready
    await new Promise(r => setTimeout(r, 1000));
  }

  // 2. Start nodes with staggered delay (avoid SNMP port conflicts)
  log(chalk.white(`Launching ${fleet.length} nodes...`));
  for (let i = 0; i < fleet.length; i++) {
    const port = BASE_SNMP_PORT + i;
    startNode(fleet[i], port);
    log(chalk.cyan(`  [${i}] ${fleet[i].id} → :${port}`));
    // Small stagger to avoid overwhelming the poller registration endpoint
    await new Promise(r => setTimeout(r, 300));
  }

  // 3. Wait for nodes to register, then show status
  log(chalk.white("Waiting for nodes to register with poller..."));
  await new Promise(r => setTimeout(r, 3000));

  showFleetStatus();

  log(chalk.bold.green("Demo ready! Open http://localhost:5178 → Alarms / Events to see live data."));
  log(chalk.gray("Type 'h' for commands, 'k0' to kill node [0], 'r0' to revive it, 'q' to quit."));
  console.log("");

  // 4. Interactive control
  setupInput();
}

main().catch(err => {
  console.error(chalk.red("Fatal error:"), err);
  shutdown();
});
