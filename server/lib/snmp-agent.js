import snmp from "net-snmp";
import {
  SYS_DESCR, SYS_UPTIME, SYS_NAME, SYS_LOCATION, SYS_CONTACT,
  IF_NUMBER, IF_DESCR, IF_OPER_STATUS, IF_SPEED, IF_IN_OCTETS, IF_OUT_OCTETS,
  HR_PROCESSOR_LOAD,
  PRIV_MEM_USAGE, PRIV_MEM_TOTAL, PRIV_TEMP,
  PRIV_BGP_PEER_STATE, PRIV_BGP_PEER_PFX,
} from "./oids.js";

/**
 * Creates an SNMP agent for a simulated network node.
 *
 * The agent responds to standard SNMP GET/GETNEXT/GETBULK requests
 * on the given UDP port, exposing real MIB-II OIDs just like a
 * Cisco/Juniper/Nokia router would.
 *
 * @param {object} opts
 * @param {number} opts.port       - UDP port to listen on (e.g. 1161)
 * @param {string} [opts.address]  - UDP bind address (default "127.0.0.1" — localhost only)
 * @param {object} opts.nodeInfo   - Static device info { hostname, sysDescr, location, contact }
 * @param {object[]} opts.interfaces - Array of { name, speed, operStatus }
 * @param {object[]} opts.bgpPeers   - Array of { ip, state, prefixesRx }
 * @param {function} opts.getMetrics - Callback returning { cpu, mem, memTotalMB, temp, uptime, interfaces, bgpPeers }
 * @returns {object} agent instance with .close() method
 */
export function createSnmpAgent({ port, address = "127.0.0.1", nodeInfo, interfaces, bgpPeers, getMetrics }) {
  // Security: by default bind to loopback only so simulated SNMP agents are
  // never reachable from the public internet. The poller runs on the same
  // host and talks to them via localhost.
  const agent = snmp.createAgent(
    { port, address, disableAuthorization: true },
    (error, data) => {
      if (error) console.error("[snmp-agent] Request error:", error);
    }
  );

  const mib = agent.getMib();

  // ── System scalars ──────────────────────────────────────────────────────────
  const scalars = [
    { name: "sysDescr",    oid: "1.3.6.1.2.1.1.1", type: snmp.ObjectType.OctetString },
    { name: "sysUpTime",   oid: "1.3.6.1.2.1.1.3", type: snmp.ObjectType.TimeTicks },
    { name: "sysContact",  oid: "1.3.6.1.2.1.1.4", type: snmp.ObjectType.OctetString },
    { name: "sysName",     oid: "1.3.6.1.2.1.1.5", type: snmp.ObjectType.OctetString },
    { name: "sysLocation", oid: "1.3.6.1.2.1.1.6", type: snmp.ObjectType.OctetString },
    { name: "ifNumber",    oid: "1.3.6.1.2.1.2.1",  type: snmp.ObjectType.Integer },
    // CPU load (scalar — we simulate a single CPU)
    { name: "hrProcessorLoad", oid: "1.3.6.1.2.1.25.3.3.1.2", type: snmp.ObjectType.Integer,
      handler: (req) => { mib.setScalarValue("hrProcessorLoad", getMetrics().cpu); req.done(); } },
    // Private: memory
    { name: "privMemUsage", oid: "1.3.6.1.4.1.99999.1.1", type: snmp.ObjectType.Integer,
      handler: (req) => { mib.setScalarValue("privMemUsage", getMetrics().mem); req.done(); } },
    { name: "privMemTotal", oid: "1.3.6.1.4.1.99999.1.2", type: snmp.ObjectType.Integer,
      handler: (req) => { mib.setScalarValue("privMemTotal", getMetrics().memTotalMB); req.done(); } },
    { name: "privTemp",     oid: "1.3.6.1.4.1.99999.1.3", type: snmp.ObjectType.Integer,
      handler: (req) => { mib.setScalarValue("privTemp", getMetrics().temp); req.done(); } },
  ];

  for (const s of scalars) {
    const provider = {
      name: s.name,
      type: snmp.MibProviderType.Scalar,
      oid: s.oid,
      scalarType: s.type,
      maxAccess: snmp.MaxAccess["read-only"],
    };
    if (s.handler) provider.handler = s.handler;
    mib.registerProvider(provider);
  }

  // Set initial static values
  mib.setScalarValue("sysDescr", nodeInfo.sysDescr || "Simulated Node");
  mib.setScalarValue("sysUpTime", 0);
  mib.setScalarValue("sysContact", nodeInfo.contact || "noc@bodaphone.net");
  mib.setScalarValue("sysName", nodeInfo.hostname || "unknown");
  mib.setScalarValue("sysLocation", nodeInfo.location || "Simulation Lab");
  mib.setScalarValue("ifNumber", interfaces.length);
  mib.setScalarValue("hrProcessorLoad", 0);
  mib.setScalarValue("privMemUsage", 0);
  mib.setScalarValue("privMemTotal", nodeInfo.memTotalMB || 16384);
  mib.setScalarValue("privTemp", 35);

  // ── Interface table ─────────────────────────────────────────────────────────
  // Standard MIB-II ifTable at 1.3.6.1.2.1.2.2.1
  mib.registerProvider({
    name: "ifTable",
    type: snmp.MibProviderType.Table,
    oid: "1.3.6.1.2.1.2.2.1",
    maxAccess: snmp.MaxAccess["not-accessible"],
    tableColumns: [
      { number: 1,  name: "ifIndex",      type: snmp.ObjectType.Integer,     maxAccess: snmp.MaxAccess["read-only"] },
      { number: 2,  name: "ifDescr",      type: snmp.ObjectType.OctetString, maxAccess: snmp.MaxAccess["read-only"] },
      { number: 5,  name: "ifSpeed",      type: snmp.ObjectType.Gauge,       maxAccess: snmp.MaxAccess["read-only"] },
      { number: 8,  name: "ifOperStatus", type: snmp.ObjectType.Integer,     maxAccess: snmp.MaxAccess["read-only"] },
      { number: 10, name: "ifInOctets",   type: snmp.ObjectType.Counter,     maxAccess: snmp.MaxAccess["read-only"] },
      { number: 16, name: "ifOutOctets",  type: snmp.ObjectType.Counter,     maxAccess: snmp.MaxAccess["read-only"] },
    ],
    tableIndex: [{ columnName: "ifIndex" }],
    handler: (req) => {
      // Update interface statuses from live metrics before responding
      const m = getMetrics();
      for (let i = 0; i < m.interfaces.length; i++) {
        const iface = m.interfaces[i];
        const row = [i + 1, iface.name, speedToGauge(iface.speed), iface.operStatus, iface.inOctets || 0, iface.outOctets || 0];
        try { mib.deleteTableRow("ifTable", [i + 1]); } catch {}
        mib.addTableRow("ifTable", row);
      }
      req.done();
    },
  });

  // Seed initial interface rows
  interfaces.forEach((iface, i) => {
    mib.addTableRow("ifTable", [
      i + 1,                          // ifIndex
      iface.name,                     // ifDescr
      speedToGauge(iface.speed),      // ifSpeed (bits/s)
      iface.operStatus === "DOWN" ? 2 : 1, // ifOperStatus
      0,                              // ifInOctets
      0,                              // ifOutOctets
    ]);
  });

  // ── BGP peer table (private OID) ────────────────────────────────────────────
  mib.registerProvider({
    name: "bgpPeerTable",
    type: snmp.MibProviderType.Table,
    oid: "1.3.6.1.4.1.99999.2.1",
    maxAccess: snmp.MaxAccess["not-accessible"],
    tableColumns: [
      { number: 1, name: "bgpPeerIndex", type: snmp.ObjectType.Integer,     maxAccess: snmp.MaxAccess["read-only"] },
      { number: 2, name: "bgpPeerState", type: snmp.ObjectType.Integer,     maxAccess: snmp.MaxAccess["read-only"] },
      { number: 3, name: "bgpPeerPfxRx", type: snmp.ObjectType.Integer,     maxAccess: snmp.MaxAccess["read-only"] },
    ],
    tableIndex: [{ columnName: "bgpPeerIndex" }],
    handler: (req) => {
      const m = getMetrics();
      for (let i = 0; i < m.bgpPeers.length; i++) {
        const p = m.bgpPeers[i];
        try { mib.deleteTableRow("bgpPeerTable", [i + 1]); } catch {}
        mib.addTableRow("bgpPeerTable", [i + 1, p.state, p.prefixesRx || 0]);
      }
      req.done();
    },
  });

  // Seed initial BGP rows
  bgpPeers.forEach((p, i) => {
    mib.addTableRow("bgpPeerTable", [i + 1, p.state || 6, p.prefixesRx || 0]);
  });

  // ── Uptime ticker ───────────────────────────────────────────────────────────
  // sysUpTime is in hundredths of a second (TimeTicks)
  const startTime = Date.now();
  const uptimeInterval = setInterval(() => {
    const hundredths = Math.floor((Date.now() - startTime) / 10);
    mib.setScalarValue("sysUpTime", hundredths);
  }, 1000);

  // ── Return handle ───────────────────────────────────────────────────────────
  return {
    agent,
    mib,
    close() {
      clearInterval(uptimeInterval);
      agent.close();
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function speedToGauge(speed) {
  // SNMP Gauge32 max is 4,294,967,295 (~4.3 Gbps).
  // For speeds > 4G, we cap at max Gauge32 value.
  // (Real devices use ifHighSpeed in Mbps for this reason.)
  if (!speed || speed === "—") return 0;
  const match = speed.match(/^(\d+)(G|M)?$/i);
  if (!match) return 0;
  const val = parseInt(match[1]);
  const unit = (match[2] || "").toUpperCase();
  let bps;
  if (unit === "G") bps = val * 1_000_000_000;
  else if (unit === "M") bps = val * 1_000_000;
  else bps = val;
  return Math.min(bps, 4_294_967_295); // Gauge32 max
}
