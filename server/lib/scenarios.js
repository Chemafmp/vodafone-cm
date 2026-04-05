// ─── Chaos Scenarios ─────────────────────────────────────────────────────────
//
// Predefined sequences of events that simulate real network incidents.
// Each scenario is a function that receives the node's live `state` object
// and a `log` function, then manipulates state over time using setTimeout.
//
// Scenarios are designed to be triggered from:
//   - The demo launcher (IPC message)
//   - The control API (POST /api/chaos/:nodeId/:scenario)
//   - The node itself (random selection)

import { IF_STATUS, BGP_STATE } from "./oids.js";

/**
 * CASCADE FAILURE
 * ───────────────
 * Simulates a core router meltdown:
 *  0s   CPU spikes to 95%+
 *  3s   Memory follows to 92%+
 *  6s   Temperature rises to 70°C+
 *  10s  First interface goes DOWN
 *  13s  BGP peers start dropping (one every 2s)
 *  25s  All interfaces DOWN (total isolation)
 *  40s  Gradual recovery begins — interfaces come back
 *  55s  BGP peers re-establish
 *  70s  Metrics normalize
 */
export function cascade(state, log) {
  log("🔥 SCENARIO: Cascade Failure — starting...");

  const origCpu = state.cpu;
  const origMem = state.mem;
  const origTemp = state.temp;

  // Phase 1: CPU spike
  setTimeout(() => {
    state.cpu = 95 + Math.floor(Math.random() * 5);
    log(`⚡ CASCADE [1/7] CPU critical: ${state.cpu}%`);
  }, 0);

  // Phase 2: Memory follows
  setTimeout(() => {
    state.mem = 92 + Math.floor(Math.random() * 6);
    log(`⚡ CASCADE [2/7] Memory critical: ${state.mem}%`);
  }, 3000);

  // Phase 3: Temperature rises
  setTimeout(() => {
    state.temp = 70 + Math.floor(Math.random() * 10);
    log(`⚡ CASCADE [3/7] Temperature critical: ${state.temp}°C`);
  }, 6000);

  // Phase 4: First interface DOWN
  const upIfaces = state.interfaces.filter(i =>
    !i.name.toLowerCase().includes("loop") &&
    !i.name.toLowerCase().includes("mgmt") &&
    i.operStatus === IF_STATUS.UP
  );

  if (upIfaces.length > 0) {
    setTimeout(() => {
      upIfaces[0].operStatus = IF_STATUS.DOWN;
      log(`⚡ CASCADE [4/7] Interface DOWN: ${upIfaces[0].name}`);
    }, 10000);
  }

  // Phase 5: BGP peers drop one by one
  const upPeers = state.bgpPeers.filter(p => p.state === BGP_STATE.ESTABLISHED);
  upPeers.forEach((peer, i) => {
    setTimeout(() => {
      peer.state = BGP_STATE.ACTIVE;
      peer.prefixesRx = 0;
      log(`⚡ CASCADE [5/7] BGP DOWN: ${peer.ip} (${peer.description || "peer"})`);
    }, 13000 + i * 2000);
  });

  // Phase 6: Remaining interfaces DOWN
  if (upIfaces.length > 1) {
    setTimeout(() => {
      for (let i = 1; i < upIfaces.length; i++) {
        upIfaces[i].operStatus = IF_STATUS.DOWN;
      }
      log(`⚡ CASCADE [6/7] All interfaces DOWN — device isolated`);
    }, 25000);
  }

  // Phase 7: Recovery
  setTimeout(() => {
    log("🔄 CASCADE [7/7] Recovery starting...");

    // Interfaces come back
    setTimeout(() => {
      for (const iface of upIfaces) {
        iface.operStatus = IF_STATUS.UP;
      }
      log("✓ CASCADE: Interfaces recovered");
    }, 2000);

    // BGP peers re-establish
    setTimeout(() => {
      for (const peer of upPeers) {
        peer.state = BGP_STATE.ESTABLISHED;
        peer.prefixesRx = Math.floor(Math.random() * 500) + 100;
      }
      log("✓ CASCADE: BGP peers re-established");
    }, 8000);

    // Metrics normalize
    setTimeout(() => {
      state.cpu = origCpu + Math.floor(Math.random() * 10);
      state.mem = origMem + Math.floor(Math.random() * 5);
      state.temp = origTemp + Math.floor(Math.random() * 3);
      log("✓ CASCADE: Metrics normalized — scenario complete");
    }, 15000);
  }, 40000);
}

/**
 * MAINTENANCE WINDOW
 * ──────────────────
 * Simulates a planned maintenance that goes slightly wrong:
 *  0s   CPU starts climbing gradually
 *  10s  CPU hits Major threshold (85%)
 *  18s  CPU hits Critical threshold (95%)
 *  25s  One interface bounces (planned failover)
 *  30s  CPU drops back to normal (maintenance applied)
 *  35s  Interface comes back UP
 *  40s  Everything stable
 */
export function maintenance(state, log) {
  log("🔧 SCENARIO: Maintenance Window — starting...");

  const origCpu = state.cpu;

  // Gradual CPU climb
  let step = 0;
  const climb = setInterval(() => {
    step++;
    state.cpu = Math.min(98, origCpu + step * 8);
    if (step >= 5) clearInterval(climb);
  }, 2000);

  setTimeout(() => {
    state.cpu = 87;
    log("⚡ MAINT [1/5] CPU Major: 87% — maintenance load building");
  }, 10000);

  setTimeout(() => {
    state.cpu = 96;
    log("⚡ MAINT [2/5] CPU Critical: 96% — maintenance peak");
  }, 18000);

  // Interface bounce (planned failover)
  const target = state.interfaces.find(i =>
    !i.name.toLowerCase().includes("loop") &&
    !i.name.toLowerCase().includes("mgmt") &&
    i.operStatus === IF_STATUS.UP
  );

  if (target) {
    setTimeout(() => {
      target.operStatus = IF_STATUS.DOWN;
      log(`⚡ MAINT [3/5] Planned failover: ${target.name} DOWN`);
    }, 25000);

    setTimeout(() => {
      target.operStatus = IF_STATUS.UP;
      log(`✓ MAINT [4/5] Failover complete: ${target.name} UP`);
    }, 35000);
  }

  // Recovery
  setTimeout(() => {
    clearInterval(climb);
    state.cpu = origCpu + Math.floor(Math.random() * 5);
    log("✓ MAINT [5/5] Maintenance complete — CPU normalized");
  }, 30000);
}

/**
 * LINK FLAP STORM
 * ────────────────
 * An interface alternates UP/DOWN rapidly, simulating a bad cable or optic:
 *  Flaps every 3-5 seconds for 30 seconds, then stabilizes.
 *  Each flap may trigger BGP reconvergence.
 */
export function linkFlap(state, log) {
  log("⚡ SCENARIO: Link Flap Storm — starting...");

  const candidates = state.interfaces.filter(i =>
    !i.name.toLowerCase().includes("loop") &&
    !i.name.toLowerCase().includes("mgmt")
  );

  if (candidates.length === 0) {
    log("⚠ LINK FLAP: No eligible interfaces — skipping");
    return;
  }

  const target = candidates[Math.floor(Math.random() * candidates.length)];
  let flapCount = 0;
  const maxFlaps = 8;

  log(`⚡ LINK FLAP target: ${target.name}`);

  const flap = () => {
    if (flapCount >= maxFlaps) {
      target.operStatus = IF_STATUS.UP;
      log(`✓ LINK FLAP: ${target.name} stabilized after ${flapCount} flaps`);
      return;
    }

    flapCount++;
    const isDown = target.operStatus === IF_STATUS.DOWN;
    target.operStatus = isDown ? IF_STATUS.UP : IF_STATUS.DOWN;
    const status = isDown ? "UP" : "DOWN";
    log(`⚡ LINK FLAP [${flapCount}/${maxFlaps}] ${target.name} → ${status}`);

    setTimeout(flap, 3000 + Math.random() * 2000);
  };

  flap();
}

/**
 * BGP ROUTE LEAK
 * ──────────────
 * A BGP peer starts advertising an abnormal number of prefixes,
 * then the session drops and recovers:
 *  0s   Peer prefix count spikes (route leak detected)
 *  8s   Memory spikes from RIB overflow
 *  15s  BGP session drops (protective shutdown)
 *  25s  BGP session re-establishes with normal prefix count
 *  30s  Memory recovers
 */
export function bgpLeak(state, log) {
  log("🌐 SCENARIO: BGP Route Leak — starting...");

  const peer = state.bgpPeers.find(p => p.state === BGP_STATE.ESTABLISHED);
  if (!peer) {
    log("⚠ BGP LEAK: No established peers — skipping");
    return;
  }

  const origPfx = peer.prefixesRx;
  const origMem = state.mem;

  // Phase 1: Prefix spike
  setTimeout(() => {
    peer.prefixesRx = 850000; // route leak — massive prefix count
    log(`⚡ BGP LEAK [1/5] ${peer.ip}: prefix count spiked to 850,000 (was ${origPfx})`);
  }, 0);

  // Phase 2: Memory spike from RIB overflow
  setTimeout(() => {
    state.mem = 94 + Math.floor(Math.random() * 4);
    log(`⚡ BGP LEAK [2/5] Memory critical: ${state.mem}% — RIB overflow`);
  }, 8000);

  // Phase 3: Protective shutdown
  setTimeout(() => {
    peer.state = BGP_STATE.IDLE;
    peer.prefixesRx = 0;
    log(`⚡ BGP LEAK [3/5] ${peer.ip}: session SHUTDOWN (max-prefix exceeded)`);
  }, 15000);

  // Phase 4: Re-establish
  setTimeout(() => {
    peer.state = BGP_STATE.ESTABLISHED;
    peer.prefixesRx = origPfx;
    log(`✓ BGP LEAK [4/5] ${peer.ip}: session re-established (${origPfx} prefixes)`);
  }, 25000);

  // Phase 5: Memory recovery
  setTimeout(() => {
    state.mem = origMem + Math.floor(Math.random() * 5);
    log(`✓ BGP LEAK [5/5] Memory recovered: ${state.mem}%`);
  }, 30000);
}

/**
 * THERMAL RUNAWAY
 * ───────────────
 * Simulates a cooling failure: temperature climbs steadily until
 * the device hits thermal shutdown threshold, then "recovers"
 * (simulating ops team fixing the cooling).
 */
export function thermalRunaway(state, log) {
  log("🌡 SCENARIO: Thermal Runaway — starting...");

  const origTemp = state.temp;
  let step = 0;

  const climb = setInterval(() => {
    step++;
    state.temp = Math.min(85, origTemp + step * 5);

    if (state.temp >= 65 && state.temp < 75) {
      log(`⚡ THERMAL [${step}] Temperature warning: ${state.temp}°C`);
    } else if (state.temp >= 75) {
      log(`⚡ THERMAL [${step}] Temperature CRITICAL: ${state.temp}°C`);
    }

    if (state.temp >= 85) {
      clearInterval(climb);
      log("⚡ THERMAL: Thermal shutdown threshold reached! Ops team alerted...");

      // Recovery after 20s (ops fixes cooling)
      setTimeout(() => {
        state.temp = origTemp + Math.floor(Math.random() * 5);
        log(`✓ THERMAL: Cooling restored — temperature back to ${state.temp}°C`);
      }, 20000);
    }
  }, 4000);
}

// ─── Scenario registry ──────────────────────────────────────────────────────

export const SCENARIOS = {
  cascade:    { fn: cascade,        label: "Cascade Failure",  desc: "CPU→MEM→TEMP→interfaces→BGP all fail, then recover", duration: "~55s" },
  maintenance:{ fn: maintenance,    label: "Maintenance Window", desc: "CPU climbs, interface bounce, then normalize", duration: "~40s" },
  linkflap:   { fn: linkFlap,       label: "Link Flap Storm",  desc: "Interface bounces UP/DOWN 8 times rapidly", duration: "~35s" },
  bgpleak:    { fn: bgpLeak,        label: "BGP Route Leak",   desc: "Peer advertises 850k prefixes, memory spikes, session drops", duration: "~30s" },
  thermal:    { fn: thermalRunaway,  label: "Thermal Runaway",  desc: "Temperature climbs until thermal shutdown, then recovers", duration: "~50s" },
};

/**
 * Run a scenario by name on a node's state.
 * Returns true if the scenario was found and started, false otherwise.
 */
export function runScenario(name, state, log) {
  const scenario = SCENARIOS[name];
  if (!scenario) return false;
  scenario.fn(state, log);
  return true;
}
