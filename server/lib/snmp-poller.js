// ─── SNMP Poller Client ───────────────────────────────────────────────────────
// Queries a single node via SNMP GET and returns a structured snapshot.
// If the node doesn't respond within TIMEOUT_MS, returns { reachable: false }.

import snmp from "net-snmp";
import { THRESHOLDS } from "./oids.js";

/**
 * Poll a single node via SNMP.
 *
 * @param {object} node - Registry entry { id, hostname, port, interfaces, bgpPeers }
 * @returns {Promise<object>} Snapshot: { reachable, cpu, mem, temp, uptime, interfaces[], bgpPeers[] }
 */
export function pollNode(node) {
  return new Promise((resolve) => {
    const session = snmp.createSession("127.0.0.1", "public", {
      port: node.port,
      timeout: THRESHOLDS.POLL_TIMEOUT_MS,
      retries: 0,
    });

    // ── Step 1: Get scalar values ──
    const scalarOids = [
      "1.3.6.1.2.1.1.3.0",           // sysUpTime
      "1.3.6.1.2.1.1.5.0",           // sysName
      "1.3.6.1.2.1.25.3.3.1.2.0",    // CPU (hrProcessorLoad)
      "1.3.6.1.4.1.99999.1.1.0",     // memUsage
      "1.3.6.1.4.1.99999.1.3.0",     // temperature
      "1.3.6.1.2.1.2.1.0",           // ifNumber
    ];

    session.get(scalarOids, (error, varbinds) => {
      if (error) {
        session.close();
        resolve({ reachable: false, nodeId: node.id, error: error.message });
        return;
      }

      const result = {
        reachable: true,
        nodeId: node.id,
        timestamp: new Date().toISOString(),
        uptime: 0,
        hostname: "",
        cpu: 0,
        mem: 0,
        temp: 0,
        ifCount: 0,
        interfaces: [],
        bgpPeers: [],
      };

      for (const vb of varbinds) {
        if (snmp.isVarbindError(vb)) continue;
        const val = Buffer.isBuffer(vb.value) ? vb.value.toString() : vb.value;

        switch (vb.oid) {
          case "1.3.6.1.2.1.1.3.0":        result.uptime = val; break;
          case "1.3.6.1.2.1.1.5.0":        result.hostname = val; break;
          case "1.3.6.1.2.1.25.3.3.1.2.0": result.cpu = val; break;
          case "1.3.6.1.4.1.99999.1.1.0":  result.mem = val; break;
          case "1.3.6.1.4.1.99999.1.3.0":  result.temp = val; break;
          case "1.3.6.1.2.1.2.1.0":        result.ifCount = val; break;
        }
      }

      // ── Step 2: Get interface statuses ──
      const ifCount = result.ifCount || (node.interfaces ? node.interfaces.length : 0);
      if (ifCount === 0) {
        session.close();
        resolve(result);
        return;
      }

      const ifOids = [];
      for (let i = 1; i <= ifCount; i++) {
        ifOids.push(`1.3.6.1.2.1.2.2.1.2.${i}`);  // ifDescr
        ifOids.push(`1.3.6.1.2.1.2.2.1.8.${i}`);  // ifOperStatus
      }

      // Also get BGP peer states if node has peers
      const bgpCount = node.bgpPeers ? node.bgpPeers.length : 0;
      for (let i = 1; i <= bgpCount; i++) {
        ifOids.push(`1.3.6.1.4.1.99999.2.1.1.2.${i}`); // bgpPeerState column 2
        ifOids.push(`1.3.6.1.4.1.99999.2.1.1.3.${i}`); // bgpPeerPfxRx column 3
      }

      if (ifOids.length === 0) {
        session.close();
        resolve(result);
        return;
      }

      session.get(ifOids, (error2, varbinds2) => {
        session.close();

        if (error2) {
          // Scalar data was OK, just couldn't get tables — still reachable
          resolve(result);
          return;
        }

        // Parse interface data
        const ifMap = {}; // index → { name, operStatus }
        for (const vb of varbinds2) {
          if (snmp.isVarbindError(vb)) continue;
          const val = Buffer.isBuffer(vb.value) ? vb.value.toString() : vb.value;

          // ifDescr: 1.3.6.1.2.1.2.2.1.2.{N}
          const descrMatch = vb.oid.match(/^1\.3\.6\.1\.2\.1\.2\.2\.1\.2\.(\d+)$/);
          if (descrMatch) {
            const idx = descrMatch[1];
            if (!ifMap[idx]) ifMap[idx] = {};
            ifMap[idx].name = val;
          }

          // ifOperStatus: 1.3.6.1.2.1.2.2.1.8.{N}
          const statusMatch = vb.oid.match(/^1\.3\.6\.1\.2\.1\.2\.2\.1\.8\.(\d+)$/);
          if (statusMatch) {
            const idx = statusMatch[1];
            if (!ifMap[idx]) ifMap[idx] = {};
            ifMap[idx].operStatus = val; // 1=up, 2=down
          }

          // bgpPeerState: 1.3.6.1.4.1.99999.2.1.1.2.{N}
          const bgpStateMatch = vb.oid.match(/^1\.3\.6\.1\.4\.1\.99999\.2\.1\.1\.2\.(\d+)$/);
          if (bgpStateMatch) {
            const idx = parseInt(bgpStateMatch[1]) - 1;
            if (!result.bgpPeers[idx]) result.bgpPeers[idx] = {};
            result.bgpPeers[idx].state = val; // 6=established, 1=idle, etc.
            result.bgpPeers[idx].ip = node.bgpPeers?.[idx] || `peer-${idx}`;
          }

          // bgpPeerPfxRx: 1.3.6.1.4.1.99999.2.1.1.3.{N}
          const bgpPfxMatch = vb.oid.match(/^1\.3\.6\.1\.4\.1\.99999\.2\.1\.1\.3\.(\d+)$/);
          if (bgpPfxMatch) {
            const idx = parseInt(bgpPfxMatch[1]) - 1;
            if (!result.bgpPeers[idx]) result.bgpPeers[idx] = {};
            result.bgpPeers[idx].prefixesRx = val;
          }
        }

        result.interfaces = Object.entries(ifMap)
          .sort(([a], [b]) => parseInt(a) - parseInt(b))
          .map(([idx, data]) => ({
            index: parseInt(idx),
            name: data.name || `if${idx}`,
            operStatus: data.operStatus === 1 ? "UP" : "DOWN",
          }));

        resolve(result);
      });
    });
  });
}
