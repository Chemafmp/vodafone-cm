// ─── IBIZA NODES ────────────────────────────────────────────────────────────
// AS 65003 · Mgmt 10.30.0.0/16 · P2P 10.3.0.0/16 · Loopbacks 172.16.3.x
// 53 nodes total (35 existing enriched + 18 new)

export const NODES_IB = [

  // ═══════════════════════════════════════════════════════════════════════════
  // IP CORE — Ibiza Town DC1 (primary)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-cr-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-cr-01.vodafone.ib",
    vendor: "Nokia",
    hwModel: "7750 SR-12e",
    layer: "IP Core",
    role: "cr",
    mgmtIp: "10.30.1.1",
    status: "UP",
    osVersion: "SR-OS 23.10.R2",
    serialNumber: "NOK-SR12E-IB01",
    procurementDate: "2022-06-01",
    eolDate: "2032-06-01",
    supportExpiry: "2030-06-01",
    rackUnit: "IBZ-DC1-ROW1-RACK01-U1",
    powerConsumptionW: 3500,
    lastCommit: { date: "2026-03-20T08:00:00Z", user: "netops" },
    lineCards: [
      { slot: 1, model: "iom4-e-b", description: "IOM4-e 100GE", ports: 6, portType: "100GE QSFP28", status: "OK" },
      { slot: 2, model: "iom4-e-b", description: "IOM4-e 100GE", ports: 6, portType: "100GE QSFP28", status: "OK" },
      { slot: 3, model: "iom3-xp-b", description: "IOM3-XP 10GE", ports: 20, portType: "10GE SFP+", status: "OK" },
      { slot: "CPM-A", model: "cpm5p", description: "Control Plane Module (primary)", ports: 0, portType: "CPM", status: "OK" },
      { slot: "CPM-B", model: "cpm5p", description: "Control Plane Module (standby)", ports: 0, portType: "CPM", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-A", model: "Nokia 3600W AC", status: "OK", watts: 3600 },
      { id: "PSU-B", model: "Nokia 3600W AC", status: "OK", watts: 3600 },
    ],
    interfaces: [
      { name: "1/1/c1/1", ip: "10.3.0.1/30", description: "To ib-town-cr-02 1/1/c1/1", peer: "ib-town-cr-02", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:00:00Z" },
      { name: "1/1/c2/1", ip: "10.3.0.5/30", description: "To ib-santantoni-cr-01 1/1/c1/1", peer: "ib-santantoni-cr-01", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:01:00Z" },
      { name: "1/1/c3/1", ip: "10.3.0.9/30", description: "To ib-santaeulalia-cr-01", peer: "ib-santaeulalia-cr-01", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:02:00Z" },
      { name: "3/1/1", ip: "10.3.0.13/30", description: "To ib-town-pe-01 et-0/0/0", peer: "ib-town-pe-01", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-01-15T06:00:00Z" },
      { name: "3/1/2", ip: "10.3.0.17/30", description: "To ib-town-pe-02 et-0/0/0", peer: "ib-town-pe-02", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-01-15T06:01:00Z" },
      { name: "system", ip: "172.16.3.1/32", description: "System / Loopback", peer: null, operStatus: "UP", speed: "—", mtu: 1500, lastFlap: null },
      { name: "mgmt", ip: "10.30.1.1/24", description: "Management", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [
      { peer: "172.16.3.2", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 18200, uptime: "82d 6h" },
      { peer: "172.16.3.3", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 18200, uptime: "82d 6h" },
      { peer: "172.16.3.4", asn: 65003, state: "Established", prefixesRx: 8400, prefixesTx: 18200, uptime: "60d 2h" },
      { peer: "172.16.3.10", asn: 65003, state: "Established", prefixesRx: 1200, prefixesTx: 18200, uptime: "50d 4h" },
    ],
    services: ["ib-internet-transit", "ib-mpls-vpn", "ib-5g-sa", "ib-sdwan"],
    goldenConfig: `# hw-town-cr-01 — Nokia 7750 SR-12e | SR-OS 23.10.R2
/configure system name "ib-town-cr-01"
/configure router interface "system" address 172.16.3.1/32
/configure router interface "to-cr02" address 10.3.0.1/30 port 1/1/c1/1
/configure router ospf 0 area 0.0.0.0
    interface "system"
    interface "to-cr02"
    interface "to-santantoni"
    interface "to-santaeulalia"
/configure router bgp autonomous-system 65003
/configure router bgp group "IBGP"
    peer-as 65003
    neighbor 172.16.3.2
    neighbor 172.16.3.3
    neighbor 172.16.3.4
/configure router mpls
    interface "to-cr02"
    interface "to-santantoni"`,
  },

  {
    id: "ib-town-cr-02",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-cr-02.vodafone.ib",
    vendor: "Nokia",
    hwModel: "7750 SR-12e",
    layer: "IP Core",
    role: "cr",
    mgmtIp: "10.30.1.2",
    status: "UP",
    osVersion: "SR-OS 23.10.R2",
    serialNumber: "NOK-SR12E-IB02",
    procurementDate: "2022-06-01",
    eolDate: "2032-06-01",
    supportExpiry: "2030-06-01",
    rackUnit: "IBZ-DC1-ROW1-RACK02-U1",
    powerConsumptionW: 3500,
    lastCommit: { date: "2026-03-20T08:05:00Z", user: "netops" },
    lineCards: [
      { slot: 1, model: "iom4-e-b", description: "IOM4-e 100GE", ports: 6, portType: "100GE QSFP28", status: "OK" },
      { slot: 3, model: "iom3-xp-b", description: "IOM3-XP 10GE", ports: 20, portType: "10GE SFP+", status: "OK" },
      { slot: "CPM-A", model: "cpm5p", description: "Control Plane Module", ports: 0, portType: "CPM", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-A", model: "Nokia 3600W AC", status: "OK", watts: 3600 },
      { id: "PSU-B", model: "Nokia 3600W AC", status: "OK", watts: 3600 },
    ],
    interfaces: [
      { name: "1/1/c1/1", ip: "10.3.0.2/30", description: "To ib-town-cr-01", peer: "ib-town-cr-01", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:00:00Z" },
      { name: "1/1/c2/1", ip: "10.3.0.21/30", description: "To ib-santantoni-cr-01", peer: "ib-santantoni-cr-01", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:03:00Z" },
      { name: "system", ip: "172.16.3.2/32", description: "System / Loopback", peer: null, operStatus: "UP", speed: "—", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [
      { peer: "172.16.3.1", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 18200, uptime: "82d 6h" },
      { peer: "172.16.3.3", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 18200, uptime: "82d 6h" },
    ],
    services: ["ib-internet-transit", "ib-mpls-vpn"],
    goldenConfig: `# ib-town-cr-02 — Nokia 7750 SR-12e | SR-OS 23.10.R2
/configure system name "ib-town-cr-02"
/configure router interface "system" address 172.16.3.2/32
/configure router bgp autonomous-system 65003
/configure router bgp group "IBGP"
    neighbor 172.16.3.1
    neighbor 172.16.3.3`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IP CORE — Sant Antoni DC
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-santantoni-cr-01",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-cr-01.vodafone.ib",
    vendor: "Nokia",
    hwModel: "7750 SR-7s",
    layer: "IP Core",
    role: "cr",
    mgmtIp: "10.30.2.1",
    status: "UP",
    osVersion: "SR-OS 23.10.R2",
    serialNumber: "NOK-SR7S-IB01",
    procurementDate: "2022-09-01",
    eolDate: "2032-09-01",
    supportExpiry: "2030-09-01",
    rackUnit: "SA-DC1-ROW1-RACK01-U1",
    powerConsumptionW: 2200,
    lastCommit: { date: "2026-03-20T08:10:00Z", user: "netops" },
    lineCards: [
      { slot: 1, model: "iom4-e-b", description: "IOM4-e 100GE", ports: 6, portType: "100GE QSFP28", status: "OK" },
      { slot: 3, model: "iom3-xp-b", description: "IOM3-XP 10GE", ports: 20, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-A", model: "Nokia 2400W AC", status: "OK", watts: 2400 },
      { id: "PSU-B", model: "Nokia 2400W AC", status: "OK", watts: 2400 },
    ],
    interfaces: [
      { name: "1/1/c1/1", ip: "10.3.0.6/30", description: "To ib-town-cr-01", peer: "ib-town-cr-01", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:01:00Z" },
      { name: "1/1/c2/1", ip: "10.3.0.22/30", description: "To ib-town-cr-02", peer: "ib-town-cr-02", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:03:00Z" },
      { name: "1/1/c3/1", ip: "10.3.0.25/30", description: "To ib-santaeulalia-cr-01", peer: "ib-santaeulalia-cr-01", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:04:00Z" },
      { name: "system", ip: "172.16.3.3/32", description: "System", peer: null, operStatus: "UP", speed: "—", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [
      { peer: "172.16.3.1", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 18200, uptime: "82d 6h" },
      { peer: "172.16.3.2", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 18200, uptime: "82d 6h" },
      { peer: "172.16.3.4", asn: 65003, state: "Established", prefixesRx: 8400, prefixesTx: 18200, uptime: "60d 2h" },
    ],
    services: ["ib-mpls-vpn", "ib-5g-sa", "ib-sdwan"],
    goldenConfig: `# ib-santantoni-cr-01 — Nokia 7750 SR-7s | SR-OS 23.10.R2
/configure system name "ib-santantoni-cr-01"
/configure router interface "system" address 172.16.3.3/32
/configure router bgp autonomous-system 65003`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IP CORE — Santa Eulalia DC / Es Canar / Portinatx
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-santaeulalia-cr-01",
    siteId: "ib-santaeulalia-dc1",
    country: "IB",
    hostname: "ib-santaeulalia-cr-01.vodafone.ib",
    vendor: "Nokia",
    hwModel: "7750 SR-7s",
    layer: "IP Core",
    role: "cr",
    mgmtIp: "10.30.3.1",
    status: "DEGRADED",
    osVersion: "SR-OS 23.7.R1",
    serialNumber: "NOK-SR7S-IB02",
    procurementDate: "2022-09-01",
    eolDate: "2032-09-01",
    supportExpiry: "2030-09-01",
    rackUnit: "SE-DC1-ROW1-RACK01-U1",
    powerConsumptionW: 2200,
    lastCommit: { date: "2026-02-15T10:00:00Z", user: "netops" },
    lineCards: [
      { slot: 1, model: "iom4-e-b", description: "IOM4-e 100GE", ports: 6, portType: "100GE QSFP28", status: "DEGRADED" },
      { slot: 3, model: "iom3-xp-b", description: "IOM3-XP 10GE", ports: 20, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-A", model: "Nokia 2400W AC", status: "OK", watts: 2400 },
      { id: "PSU-B", model: "Nokia 2400W AC", status: "FAILED", watts: 2400 },
    ],
    interfaces: [
      { name: "1/1/c1/1", ip: "10.3.0.10/30", description: "To ib-town-cr-01", peer: "ib-town-cr-01", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:02:00Z" },
      { name: "1/1/c2/1", ip: "10.3.0.26/30", description: "To ib-santantoni-cr-01", peer: "ib-santantoni-cr-01", operStatus: "UP", speed: "100G", mtu: 9212, lastFlap: "2026-01-02T04:04:00Z" },
      { name: "3/1/1", ip: "10.3.0.29/30", description: "To ib-escanar-distr-sw01", peer: "ib-escanar-distr-sw01", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-02-01T09:00:00Z" },
      { name: "3/1/2", ip: "10.3.0.33/30", description: "To ib-portinatx-distr-sw01", peer: "ib-portinatx-distr-sw01", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-02-01T09:01:00Z" },
      { name: "system", ip: "172.16.3.4/32", description: "System", peer: null, operStatus: "UP", speed: "—", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [
      { peer: "172.16.3.1", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 8400, uptime: "60d 2h" },
      { peer: "172.16.3.3", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 8400, uptime: "60d 2h" },
    ],
    services: ["ib-mpls-vpn", "ib-fixed-bb"],
    goldenConfig: `# ib-santaeulalia-cr-01 — Nokia 7750 SR-7s | SR-OS 23.7.R1
# WARNING: PSU-B FAILED, IOM slot 1 degraded (CRC errors)
/configure system name "ib-santaeulalia-cr-01"
/configure router interface "system" address 172.16.3.4/32`,
  },

  {
    id: "ib-escanar-distr-sw01",
    siteId: "ib-escanar-dc1",
    country: "IB",
    hostname: "ib-escanar-distr-sw01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Nexus 5672UP",
    layer: "IP LAN",
    role: "distr-sw",
    mgmtIp: "10.30.4.1",
    status: "UP",
    osVersion: "NX-OS 7.3(14)N1(1)",
    serialNumber: "SAL2200CC01",
    procurementDate: "2020-03-01",
    eolDate: "2028-03-01",
    supportExpiry: "2027-03-01",
    rackUnit: "EC-DC1-ROW1-RACK01-U38",
    powerConsumptionW: 600,
    lastCommit: { date: "2026-03-10T10:00:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "N56-M-48TP", description: "48x10GE + 6x40GE", ports: 54, portType: "10GE/40GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "NXA-PAC-650W", status: "OK", watts: 650 },
      { id: "PSU-2", model: "NXA-PAC-650W", status: "OK", watts: 650 },
    ],
    interfaces: [
      { name: "Ethernet1/1", ip: "10.3.0.30/30", description: "To ib-santaeulalia-cr-01", peer: "ib-santaeulalia-cr-01", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-02-01T09:00:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-fixed-bb"],
    goldenConfig: `!! ib-escanar-distr-sw01 — Cisco Nexus 5672UP
hostname ib-escanar-distr-sw01`,
  },

  {
    id: "ib-portinatx-distr-sw01",
    siteId: "ib-portinatx-dc1",
    country: "IB",
    hostname: "ib-portinatx-distr-sw01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Nexus 5672UP",
    layer: "IP LAN",
    role: "distr-sw",
    mgmtIp: "10.30.5.1",
    status: "UP",
    osVersion: "NX-OS 7.3(14)N1(1)",
    serialNumber: "SAL2200CC02",
    procurementDate: "2020-03-01",
    eolDate: "2028-03-01",
    supportExpiry: "2027-03-01",
    rackUnit: "PT-DC1-ROW1-RACK01-U38",
    powerConsumptionW: 600,
    lastCommit: { date: "2026-03-10T10:05:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "N56-M-48TP", description: "48x10GE + 6x40GE", ports: 54, portType: "10GE/40GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "NXA-PAC-650W", status: "OK", watts: 650 },
      { id: "PSU-2", model: "NXA-PAC-650W", status: "OK", watts: 650 },
    ],
    interfaces: [
      { name: "Ethernet1/1", ip: "10.3.0.34/30", description: "To ib-santaeulalia-cr-01", peer: "ib-santaeulalia-cr-01", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-02-01T09:01:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-fixed-bb"],
    goldenConfig: `!! ib-portinatx-distr-sw01 — Cisco Nexus 5672UP
hostname ib-portinatx-distr-sw01`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNET GATEWAY — Peering Routers (4 IXPs)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-pe-01",
    siteId: "ib-town-ixp1",
    country: "IB",
    hostname: "ib-town-pe-01.vodafone.ib",
    vendor: "Juniper",
    hwModel: "MX480",
    layer: "Internet GW",
    role: "pe",
    mgmtIp: "10.30.1.10",
    status: "UP",
    osVersion: "JunOS 23.4R1",
    serialNumber: "JN-MX480-IB01",
    procurementDate: "2023-01-15",
    eolDate: "2033-01-15",
    supportExpiry: "2031-01-15",
    rackUnit: "IBZ-IXP1-RACK01-U20",
    powerConsumptionW: 1800,
    lastCommit: { date: "2026-03-18T09:00:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "RE-S-X6-128G", description: "Routing Engine", ports: 0, portType: "RE", status: "OK" },
      { slot: 1, model: "MPC7E-10G", description: "10GE MPC", ports: 24, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX480-2520-AC", status: "OK", watts: 2520 },
      { id: "PSU-1", model: "PWR-MX480-2520-AC", status: "OK", watts: 2520 },
    ],
    interfaces: [
      { name: "et-0/0/0", ip: "10.3.0.14/30", description: "To ib-town-cr-01 3/1/1", peer: "ib-town-cr-01", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-01-15T06:00:00Z" },
      { name: "et-0/0/1", ip: "198.51.200.2/30", description: "Lumen Transit (IXP1)", peer: "Lumen", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-20T04:00:00Z" },
      { name: "lo0.0", ip: "172.16.3.10/32", description: "Loopback", peer: null, operStatus: "UP", speed: "—", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [
      { peer: "172.16.3.1", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 1200, uptime: "50d 4h" },
      { peer: "198.51.200.1", asn: 3356, state: "Established", prefixesRx: 980000, prefixesTx: 450, uptime: "64d 1h" },
    ],
    services: ["ib-internet-transit"],
    goldenConfig: `## ib-town-pe-01 — Juniper MX480 | JunOS 23.4R1
set system host-name ib-town-pe-01
set interfaces lo0 unit 0 family inet address 172.16.3.10/32
set protocols bgp group TRANSIT neighbor 198.51.200.1 peer-as 3356
set protocols bgp group IBGP neighbor 172.16.3.1 peer-as 65003`,
  },

  {
    id: "ib-town-pe-02",
    siteId: "ib-town-ixp2",
    country: "IB",
    hostname: "ib-town-pe-02.vodafone.ib",
    vendor: "Juniper",
    hwModel: "MX480",
    layer: "Internet GW",
    role: "pe",
    mgmtIp: "10.30.1.11",
    status: "UP",
    osVersion: "JunOS 23.4R1",
    serialNumber: "JN-MX480-IB02",
    procurementDate: "2023-01-15",
    eolDate: "2033-01-15",
    supportExpiry: "2031-01-15",
    rackUnit: "IBZ-IXP2-RACK01-U20",
    powerConsumptionW: 1800,
    lastCommit: { date: "2026-03-18T09:05:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "RE-S-X6-128G", description: "Routing Engine", ports: 0, portType: "RE", status: "OK" },
      { slot: 1, model: "MPC7E-10G", description: "10GE MPC", ports: 24, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX480-2520-AC", status: "OK", watts: 2520 },
      { id: "PSU-1", model: "PWR-MX480-2520-AC", status: "OK", watts: 2520 },
    ],
    interfaces: [
      { name: "et-0/0/0", ip: "10.3.0.18/30", description: "To ib-town-cr-01 3/1/2", peer: "ib-town-cr-01", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-01-15T06:01:00Z" },
      { name: "et-0/0/1", ip: "203.0.200.2/30", description: "Telia Transit (IXP2)", peer: "Telia", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-20T04:05:00Z" },
      { name: "lo0.0", ip: "172.16.3.11/32", description: "Loopback", peer: null, operStatus: "UP", speed: "—", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [
      { peer: "172.16.3.1", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 1200, uptime: "50d 4h" },
      { peer: "203.0.200.1", asn: 1299, state: "Established", prefixesRx: 980000, prefixesTx: 450, uptime: "64d 1h" },
    ],
    services: ["ib-internet-transit"],
    goldenConfig: `## ib-town-pe-02 — Juniper MX480 | JunOS 23.4R1
set system host-name ib-town-pe-02
set protocols bgp group TRANSIT neighbor 203.0.200.1 peer-as 1299`,
  },

  {
    id: "ib-town-pe-03",
    siteId: "ib-town-ixp3",
    country: "IB",
    hostname: "ib-town-pe-03.vodafone.ib",
    vendor: "Juniper",
    hwModel: "MX240",
    layer: "Internet GW",
    role: "pe",
    mgmtIp: "10.30.1.12",
    status: "UP",
    osVersion: "JunOS 23.4R1",
    serialNumber: "JN-MX240-IB01",
    procurementDate: "2023-06-01",
    eolDate: "2033-06-01",
    supportExpiry: "2031-06-01",
    rackUnit: "IBZ-IXP3-RACK01-U20",
    powerConsumptionW: 1200,
    lastCommit: { date: "2026-03-18T09:10:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "RE-S-X6-128G", description: "Routing Engine", ports: 0, portType: "RE", status: "OK" },
      { slot: 1, model: "MPC7E-10G", description: "10GE MPC", ports: 12, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX240-AC", status: "OK", watts: 1200 },
      { id: "PSU-1", model: "PWR-MX240-AC", status: "OK", watts: 1200 },
    ],
    interfaces: [
      { name: "et-0/0/0", ip: "10.3.0.37/30", description: "To ib-town-cr-02", peer: "ib-town-cr-02", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-01-15T06:10:00Z" },
      { name: "et-0/0/1", ip: "100.64.3.2/30", description: "GTT Transit (IXP3)", peer: "GTT", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-20T04:10:00Z" },
      { name: "lo0.0", ip: "172.16.3.12/32", description: "Loopback", peer: null, operStatus: "UP", speed: "—", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [
      { peer: "172.16.3.2", asn: 65003, state: "Established", prefixesRx: 18200, prefixesTx: 1200, uptime: "50d 4h" },
      { peer: "100.64.3.1", asn: 3257, state: "Established", prefixesRx: 980000, prefixesTx: 450, uptime: "64d 1h" },
    ],
    services: ["ib-internet-transit"],
    goldenConfig: `## ib-town-pe-03 — Juniper MX240 | JunOS 23.4R1
set system host-name ib-town-pe-03
set protocols bgp group TRANSIT neighbor 100.64.3.1 peer-as 3257`,
  },

  {
    id: "ib-town-pe-04",
    siteId: "ib-town-ixp4",
    country: "IB",
    hostname: "ib-town-pe-04.vodafone.ib",
    vendor: "Juniper",
    hwModel: "MX240",
    layer: "Internet GW",
    role: "pe",
    mgmtIp: "10.30.1.13",
    status: "DOWN",
    osVersion: "JunOS 23.4R1",
    serialNumber: "JN-MX240-IB02",
    procurementDate: "2023-06-01",
    eolDate: "2033-06-01",
    supportExpiry: "2031-06-01",
    rackUnit: "IBZ-IXP4-RACK01-U20",
    powerConsumptionW: 1200,
    lastCommit: { date: "2026-03-10T08:00:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "RE-S-X6-128G", description: "Routing Engine", ports: 0, portType: "RE", status: "FAILED" },
      { slot: 1, model: "MPC7E-10G", description: "10GE MPC", ports: 12, portType: "10GE SFP+", status: "FAILED" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX240-AC", status: "OK", watts: 1200 },
      { id: "PSU-1", model: "PWR-MX240-AC", status: "FAILED", watts: 1200 },
    ],
    interfaces: [
      { name: "et-0/0/0", ip: "10.3.0.41/30", description: "To ib-town-cr-02 (DOWN)", peer: "ib-town-cr-02", operStatus: "DOWN", speed: "10G", mtu: 9212, lastFlap: "2026-03-22T02:15:00Z" },
      { name: "et-0/0/1", ip: "100.64.4.2/30", description: "Zayo Transit (IXP4) — DOWN", peer: "Zayo", operStatus: "DOWN", speed: "10G", mtu: 1500, lastFlap: "2026-03-22T02:15:00Z" },
      { name: "lo0.0", ip: "172.16.3.13/32", description: "Loopback", peer: null, operStatus: "DOWN", speed: "—", mtu: 1500, lastFlap: "2026-03-22T02:15:00Z" },
    ],
    bgpNeighbors: [
      { peer: "172.16.3.2", asn: 65003, state: "Idle", prefixesRx: 0, prefixesTx: 0, uptime: "—" },
      { peer: "100.64.4.1", asn: 6461, state: "Idle", prefixesRx: 0, prefixesTx: 0, uptime: "—" },
    ],
    services: ["ib-internet-transit"],
    goldenConfig: `## ib-town-pe-04 — Juniper MX240 | JunOS 23.4R1
## *** NODE DOWN — RE failure + PSU-1 fault — since 2026-03-22 02:15 UTC ***
set system host-name ib-town-pe-04
! ... [config not retrievable — node unreachable] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IP LAN — Distribution Switches (Ibiza Town DC1 + Sant Antoni)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-distr-sw01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-distr-sw01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Nexus 9396PX",
    layer: "IP LAN",
    role: "distr-sw",
    mgmtIp: "10.30.1.20",
    status: "UP",
    osVersion: "NX-OS 10.3(4a)",
    serialNumber: "SAL2300DD01",
    procurementDate: "2022-09-01",
    eolDate: "2030-09-01",
    supportExpiry: "2029-09-01",
    rackUnit: "IBZ-DC1-ROW2-RACK01-U38",
    powerConsumptionW: 750,
    lastCommit: { date: "2026-03-15T11:00:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "N9K-X9396PX", description: "48x10GE + 12x40GE", ports: 60, portType: "10GE/40GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "NXA-PAC-1100W", status: "OK", watts: 1100 },
      { id: "PSU-2", model: "NXA-PAC-1100W", status: "OK", watts: 1100 },
    ],
    interfaces: [
      { name: "Ethernet1/1", ip: "10.3.0.45/30", description: "To ib-town-cr-01 3/1/5", peer: "ib-town-cr-01", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-01-05T03:00:00Z" },
      { name: "Ethernet1/2", ip: "10.30.10.1/24", description: "VLAN 10 SVI — Servers", peer: null, operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: null, vlan: 10 },
    ],
    bgpNeighbors: [],
    services: ["ib-fixed-bb", "ib-it-services"],
    goldenConfig: `!! ib-town-distr-sw01 — Cisco Nexus 9396PX
hostname ib-town-distr-sw01
feature vpc
vlan 10
 name SERVERS`,
  },

  {
    id: "ib-town-distr-sw02",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-distr-sw02.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Nexus 9396PX",
    layer: "IP LAN",
    role: "distr-sw",
    mgmtIp: "10.30.1.21",
    status: "UP",
    osVersion: "NX-OS 10.3(4a)",
    serialNumber: "SAL2300DD02",
    procurementDate: "2022-09-01",
    eolDate: "2030-09-01",
    supportExpiry: "2029-09-01",
    rackUnit: "IBZ-DC1-ROW2-RACK02-U38",
    powerConsumptionW: 750,
    lastCommit: { date: "2026-03-15T11:05:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "N9K-X9396PX", description: "48x10GE + 12x40GE", ports: 60, portType: "10GE/40GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "NXA-PAC-1100W", status: "OK", watts: 1100 },
      { id: "PSU-2", model: "NXA-PAC-1100W", status: "OK", watts: 1100 },
    ],
    interfaces: [
      { name: "Ethernet1/1", ip: "10.3.0.49/30", description: "To ib-town-cr-02", peer: "ib-town-cr-02", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-01-05T03:01:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-fixed-bb", "ib-it-services"],
    goldenConfig: `!! ib-town-distr-sw02 — Cisco Nexus 9396PX
hostname ib-town-distr-sw02`,
  },

  {
    id: "ib-santantoni-distr-sw01",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-distr-sw01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Nexus 9396PX",
    layer: "IP LAN",
    role: "distr-sw",
    mgmtIp: "10.30.2.20",
    status: "UP",
    osVersion: "NX-OS 10.3(4a)",
    serialNumber: "SAL2300DD03",
    procurementDate: "2022-09-01",
    eolDate: "2030-09-01",
    supportExpiry: "2029-09-01",
    rackUnit: "SA-DC1-ROW2-RACK01-U38",
    powerConsumptionW: 750,
    lastCommit: { date: "2026-03-15T11:10:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "N9K-X9396PX", description: "48x10GE + 12x40GE", ports: 60, portType: "10GE/40GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "NXA-PAC-1100W", status: "OK", watts: 1100 },
      { id: "PSU-2", model: "NXA-PAC-1100W", status: "OK", watts: 1100 },
    ],
    interfaces: [
      { name: "Ethernet1/1", ip: "10.3.0.53/30", description: "To ib-santantoni-cr-01", peer: "ib-santantoni-cr-01", operStatus: "UP", speed: "10G", mtu: 9212, lastFlap: "2026-01-05T03:05:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-fixed-bb", "ib-it-services"],
    goldenConfig: `!! ib-santantoni-distr-sw01 — Cisco Nexus 9396PX
hostname ib-santantoni-distr-sw01`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DC FABRIC — Top-of-Rack
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-top-sw01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-top-sw01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Nexus 93180YC-FX",
    layer: "DC Fabric",
    role: "top-sw",
    mgmtIp: "10.30.1.30",
    status: "UP",
    osVersion: "NX-OS 10.3(4a)",
    serialNumber: "SAL2400EE01",
    procurementDate: "2023-03-01",
    eolDate: "2033-03-01",
    supportExpiry: "2031-03-01",
    rackUnit: "IBZ-DC1-ROW3-RACK01-U42",
    powerConsumptionW: 450,
    lastCommit: { date: "2026-03-12T08:00:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "N9K-C93180YC-FX", description: "48x25GE + 6x100GE", ports: 54, portType: "25GE/100GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "NXA-PAC-650W-PE", status: "OK", watts: 650 },
      { id: "PSU-2", model: "NXA-PAC-650W-PE", status: "OK", watts: 650 },
    ],
    interfaces: [
      { name: "Ethernet1/49", ip: "10.30.10.2/24", description: "Uplink to distr-sw01", peer: "ib-town-distr-sw01", operStatus: "UP", speed: "100G", mtu: 9000, lastFlap: "2026-01-05T03:10:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-5g-sa", "ib-it-services", "ib-iptv"],
    goldenConfig: `!! ib-town-top-sw01 — Cisco Nexus 93180YC-FX
hostname ib-town-top-sw01
vlan 30
 name 5G_CORE`,
  },

  {
    id: "ib-town-top-sw02",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-top-sw02.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Nexus 93180YC-FX",
    layer: "DC Fabric",
    role: "top-sw",
    mgmtIp: "10.30.1.31",
    status: "UP",
    osVersion: "NX-OS 10.3(4a)",
    serialNumber: "SAL2400EE02",
    procurementDate: "2023-03-01",
    eolDate: "2033-03-01",
    supportExpiry: "2031-03-01",
    rackUnit: "IBZ-DC1-ROW3-RACK02-U42",
    powerConsumptionW: 450,
    lastCommit: { date: "2026-03-12T08:05:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "N9K-C93180YC-FX", description: "48x25GE + 6x100GE", ports: 54, portType: "25GE/100GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "NXA-PAC-650W-PE", status: "OK", watts: 650 },
      { id: "PSU-2", model: "NXA-PAC-650W-PE", status: "OK", watts: 650 },
    ],
    interfaces: [
      { name: "Ethernet1/49", ip: "10.30.10.3/24", description: "Uplink to distr-sw02", peer: "ib-town-distr-sw02", operStatus: "UP", speed: "100G", mtu: 9000, lastFlap: "2026-01-05T03:11:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-5g-sa", "ib-it-services"],
    goldenConfig: `!! ib-town-top-sw02 — Cisco Nexus 93180YC-FX
hostname ib-town-top-sw02`,
  },

  {
    id: "ib-santantoni-top-sw01",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-top-sw01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Nexus 93180YC-FX",
    layer: "DC Fabric",
    role: "top-sw",
    mgmtIp: "10.30.2.30",
    status: "UP",
    osVersion: "NX-OS 10.3(4a)",
    serialNumber: "SAL2400EE03",
    procurementDate: "2023-03-01",
    eolDate: "2033-03-01",
    supportExpiry: "2031-03-01",
    rackUnit: "SA-DC1-ROW3-RACK01-U42",
    powerConsumptionW: 450,
    lastCommit: { date: "2026-03-12T08:10:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "N9K-C93180YC-FX", description: "48x25GE + 6x100GE", ports: 54, portType: "25GE/100GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "NXA-PAC-650W-PE", status: "OK", watts: 650 },
      { id: "PSU-2", model: "NXA-PAC-650W-PE", status: "OK", watts: 650 },
    ],
    interfaces: [
      { name: "Ethernet1/49", ip: "10.30.20.2/24", description: "Uplink to santantoni-distr-sw01", peer: "ib-santantoni-distr-sw01", operStatus: "UP", speed: "100G", mtu: 9000, lastFlap: "2026-01-05T03:15:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-it-services"],
    goldenConfig: `!! ib-santantoni-top-sw01 — Cisco Nexus 93180YC-FX
hostname ib-santantoni-top-sw01`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5G CORE — Ibiza Town
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-5gcore-amf01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-5gcore-amf01.vodafone.ib",
    vendor: "Nokia",
    hwModel: "AirFrame Open Edge (AMF)",
    layer: "5G Core",
    role: "5gcore-amf",
    mgmtIp: "10.30.1.40",
    status: "UP",
    osVersion: "CBND 23.8",
    serialNumber: "NOK-AMF-IB01",
    procurementDate: "2023-09-01",
    eolDate: "2033-09-01",
    supportExpiry: "2031-09-01",
    rackUnit: "IBZ-DC1-ROW4-RACK01-U10",
    powerConsumptionW: 800,
    lastCommit: { date: "2026-03-10T12:00:00Z", user: "5gops" },
    lineCards: [
      { slot: 0, model: "AirFrame COTS Server", description: "2x Intel Xeon 6338N, 256GB RAM", ports: 4, portType: "25GE SFP28", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "Nokia PSU-800W", status: "OK", watts: 800 },
      { id: "PSU-2", model: "Nokia PSU-800W", status: "OK", watts: 800 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.30.1.40/24", description: "Management", peer: null, operStatus: "UP", speed: "25G", mtu: 1500, lastFlap: null },
      { name: "eth1", ip: "10.30.30.10/24", description: "N2 (AMF ↔ gNB)", peer: "ib-town-top-sw01", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: "2026-01-10T08:00:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-5g-sa", "ib-5g-nsa"],
    goldenConfig: `# ib-town-5gcore-amf01 — Nokia AirFrame (AMF) | CBND 23.8
amf:
  plmn: "214-07"
  capacity: 100000
  nssai:
    - sst: 1
      sd: "000001"`,
  },

  {
    id: "ib-town-5gcore-upf01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-5gcore-upf01.vodafone.ib",
    vendor: "Nokia",
    hwModel: "AirFrame Open Edge (UPF)",
    layer: "5G Core",
    role: "5gcore-upf",
    mgmtIp: "10.30.1.41",
    status: "UP",
    osVersion: "CBND 23.8",
    serialNumber: "NOK-UPF-IB01",
    procurementDate: "2023-09-01",
    eolDate: "2033-09-01",
    supportExpiry: "2031-09-01",
    rackUnit: "IBZ-DC1-ROW4-RACK01-U14",
    powerConsumptionW: 1200,
    lastCommit: { date: "2026-03-10T12:05:00Z", user: "5gops" },
    lineCards: [
      { slot: 0, model: "AirFrame COTS Server", description: "2x Intel Xeon 6338N, 512GB RAM, SmartNIC", ports: 6, portType: "25GE SFP28", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "Nokia PSU-1200W", status: "OK", watts: 1200 },
      { id: "PSU-2", model: "Nokia PSU-1200W", status: "OK", watts: 1200 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.30.1.41/24", description: "Management", peer: null, operStatus: "UP", speed: "25G", mtu: 1500, lastFlap: null },
      { name: "eth1", ip: "10.30.31.11/24", description: "N4 (UPF ↔ SMF)", peer: "ib-town-5gcore-amf01", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: "2026-01-10T08:01:00Z" },
      { name: "eth2", ip: "10.30.32.10/24", description: "N6 (UPF ↔ Internet)", peer: "ib-town-cr-01", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: "2026-01-10T08:02:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-5g-sa", "ib-5g-nsa"],
    goldenConfig: `# ib-town-5gcore-upf01 — Nokia AirFrame (UPF) | CBND 23.8
upf:
  dataplane: DPDK
  max_throughput_gbps: 80`,
  },

  {
    id: "ib-santantoni-5gcore-amf02",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-5gcore-amf02.vodafone.ib",
    vendor: "Nokia",
    hwModel: "AirFrame Open Edge (AMF)",
    layer: "5G Core",
    role: "5gcore-amf",
    mgmtIp: "10.30.2.40",
    status: "UP",
    osVersion: "CBND 23.8",
    serialNumber: "NOK-AMF-IB02",
    procurementDate: "2023-09-01",
    eolDate: "2033-09-01",
    supportExpiry: "2031-09-01",
    rackUnit: "SA-DC1-ROW4-RACK01-U10",
    powerConsumptionW: 800,
    lastCommit: { date: "2026-03-10T12:10:00Z", user: "5gops" },
    lineCards: [
      { slot: 0, model: "AirFrame COTS Server", description: "2x Intel Xeon 6338N, 256GB RAM", ports: 4, portType: "25GE SFP28", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "Nokia PSU-800W", status: "OK", watts: 800 },
      { id: "PSU-2", model: "Nokia PSU-800W", status: "OK", watts: 800 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.30.2.40/24", description: "Management", peer: null, operStatus: "UP", speed: "25G", mtu: 1500, lastFlap: null },
      { name: "eth1", ip: "10.30.33.10/24", description: "N2 (AMF ↔ gNB)", peer: "ib-santantoni-top-sw01", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: "2026-01-10T08:05:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-5g-sa", "ib-5g-nsa"],
    goldenConfig: `# ib-santantoni-5gcore-amf02 — Nokia AirFrame (AMF) | CBND 23.8
# Secondary AMF for geographic redundancy`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE CORE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-cube-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-cube-01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "ISR 4461 (CUBE)",
    layer: "Voice Core",
    role: "cube",
    mgmtIp: "10.30.1.50",
    status: "UP",
    osVersion: "IOS-XE 17.12.2",
    serialNumber: "FHH2340P002",
    procurementDate: "2023-03-01",
    eolDate: "2033-03-01",
    supportExpiry: "2031-03-01",
    rackUnit: "IBZ-DC1-ROW5-RACK01-U20",
    powerConsumptionW: 500,
    lastCommit: { date: "2026-03-05T10:00:00Z", user: "voiceops" },
    lineCards: [
      { slot: 0, model: "ISR4461/K9", description: "Integrated 4x1GE + 2xNIM", ports: 4, portType: "1GE RJ45", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-4460-AC", status: "OK", watts: 500 },
      { id: "PSU-1", model: "PWR-4460-AC", status: "OK", watts: 500 },
    ],
    interfaces: [
      { name: "GigabitEthernet0/0/0", ip: "10.30.50.1/24", description: "SIP Trunk (PSTN)", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: "2026-01-12T05:00:00Z" },
      { name: "GigabitEthernet0/0/1", ip: "10.30.51.1/24", description: "SIP Trunk (5G IMS)", peer: "ib-town-5gcore-amf01", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: "2026-01-12T05:01:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-voice-core"],
    goldenConfig: `!! ib-town-cube-01 — Cisco ISR 4461 (CUBE) | IOS-XE 17.12.2
hostname ib-town-cube-01
voice service voip
 allow-connections sip to sip`,
  },

  {
    id: "ib-santantoni-cube-02",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-cube-02.vodafone.ib",
    vendor: "Cisco",
    hwModel: "ISR 4461 (CUBE)",
    layer: "Voice Core",
    role: "cube",
    mgmtIp: "10.30.2.50",
    status: "UP",
    osVersion: "IOS-XE 17.12.2",
    serialNumber: "FHH2340P003",
    procurementDate: "2023-03-01",
    eolDate: "2033-03-01",
    supportExpiry: "2031-03-01",
    rackUnit: "SA-DC1-ROW5-RACK01-U20",
    powerConsumptionW: 500,
    lastCommit: { date: "2026-03-05T10:05:00Z", user: "voiceops" },
    lineCards: [
      { slot: 0, model: "ISR4461/K9", description: "Integrated 4x1GE + 2xNIM", ports: 4, portType: "1GE RJ45", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-4460-AC", status: "OK", watts: 500 },
      { id: "PSU-1", model: "PWR-4460-AC", status: "OK", watts: 500 },
    ],
    interfaces: [
      { name: "GigabitEthernet0/0/0", ip: "10.30.52.1/24", description: "SIP Trunk (PSTN)", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: "2026-01-12T05:05:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-voice-core"],
    goldenConfig: `!! ib-santantoni-cube-02 — Cisco ISR 4461 (CUBE)
hostname ib-santantoni-cube-02`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSPORT — Microwave Links
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-mw-01",
    siteId: "ib-town-core1",
    country: "IB",
    hostname: "ib-town-mw-01.vodafone.ib",
    vendor: "Ericsson",
    hwModel: "MINI-LINK 6366",
    layer: "Transport",
    role: "mw",
    mgmtIp: "10.30.1.55",
    status: "UP",
    osVersion: "R24B",
    serialNumber: "ERI-ML6366-IB01",
    procurementDate: "2022-01-01",
    eolDate: "2032-01-01",
    supportExpiry: "2030-01-01",
    rackUnit: "IBZ-CORE-RACK01-U5",
    powerConsumptionW: 200,
    lastCommit: { date: "2026-03-01T08:00:00Z", user: "txops" },
    lineCards: [
      { slot: 1, model: "RAU2 80G", description: "80 GHz E-band — 20Gbps", ports: 2, portType: "SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-DC", model: "MINI-LINK PSU-48VDC", status: "OK", watts: 220 },
    ],
    interfaces: [
      { name: "Radio1", ip: null, description: "80G link to Sant Antoni", peer: "ib-santantoni-mw-01", operStatus: "UP", speed: "20G", mtu: 9000, lastFlap: "2026-01-05T04:00:00Z" },
      { name: "Eth1", ip: "10.3.0.57/30", description: "To ib-town-cr-01", peer: "ib-town-cr-01", operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: "2026-01-05T04:01:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-mpls-vpn"],
    goldenConfig: `# ib-town-mw-01 — Ericsson MINI-LINK 6366 | R24B
system-name ib-town-mw-01
radio-link rl-1
 frequency 80000
 capacity target 20000`,
  },

  {
    id: "ib-santantoni-mw-01",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-mw-01.vodafone.ib",
    vendor: "Ericsson",
    hwModel: "MINI-LINK 6366",
    layer: "Transport",
    role: "mw",
    mgmtIp: "10.30.2.55",
    status: "UP",
    osVersion: "R24B",
    serialNumber: "ERI-ML6366-IB02",
    procurementDate: "2022-01-01",
    eolDate: "2032-01-01",
    supportExpiry: "2030-01-01",
    rackUnit: "SA-DC1-RACK-OUTDOOR-U1",
    powerConsumptionW: 200,
    lastCommit: { date: "2026-03-01T08:05:00Z", user: "txops" },
    lineCards: [
      { slot: 1, model: "RAU2 80G", description: "80 GHz E-band — 20Gbps", ports: 2, portType: "SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-DC", model: "MINI-LINK PSU-48VDC", status: "OK", watts: 220 },
    ],
    interfaces: [
      { name: "Radio1", ip: null, description: "80G link to Ibiza Town", peer: "ib-town-mw-01", operStatus: "UP", speed: "20G", mtu: 9000, lastFlap: "2026-01-05T04:00:00Z" },
      { name: "Eth1", ip: "10.3.0.61/30", description: "To ib-santantoni-cr-01", peer: "ib-santantoni-cr-01", operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: "2026-01-05T04:02:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-mpls-vpn"],
    goldenConfig: `# ib-santantoni-mw-01 — Ericsson MINI-LINK 6366 | R24B
system-name ib-santantoni-mw-01`,
  },

  {
    id: "ib-santaeulalia-mw-01",
    siteId: "ib-santaeulalia-dc1",
    country: "IB",
    hostname: "ib-santaeulalia-mw-01.vodafone.ib",
    vendor: "Ericsson",
    hwModel: "MINI-LINK 6352",
    layer: "Transport",
    role: "mw",
    mgmtIp: "10.30.3.55",
    status: "DEGRADED",
    osVersion: "R24A",
    serialNumber: "ERI-ML6352-IB01",
    procurementDate: "2020-06-01",
    eolDate: "2030-06-01",
    supportExpiry: "2028-06-01",
    rackUnit: "SE-DC1-RACK-OUTDOOR-U1",
    powerConsumptionW: 180,
    lastCommit: { date: "2026-02-15T09:00:00Z", user: "txops" },
    lineCards: [
      { slot: 1, model: "RAU2 60G", description: "60 GHz — 10Gbps (degraded)", ports: 2, portType: "SFP+", status: "DEGRADED" },
    ],
    powerSupplies: [
      { id: "PSU-DC", model: "MINI-LINK PSU-48VDC", status: "OK", watts: 200 },
    ],
    interfaces: [
      { name: "Radio1", ip: null, description: "60G link to Es Canar (rain fade)", peer: "ib-escanar-distr-sw01", operStatus: "UP", speed: "6G", mtu: 9000, lastFlap: "2026-03-20T14:30:00Z" },
      { name: "Eth1", ip: "10.3.0.65/30", description: "To ib-santaeulalia-cr-01", peer: "ib-santaeulalia-cr-01", operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: "2026-02-01T09:05:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-fixed-bb"],
    goldenConfig: `# ib-santaeulalia-mw-01 — Ericsson MINI-LINK 6352 | R24A
# DEGRADED: Adaptive modulation dropped (rain fade)
system-name ib-santaeulalia-mw-01`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ACCESS SWITCHES
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-acc-sw01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-acc-sw01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Catalyst 9300-48UXM",
    layer: "IP LAN",
    role: "acc-sw",
    mgmtIp: "10.30.1.60",
    status: "UP",
    osVersion: "IOS-XE 17.9.4a",
    serialNumber: "FOC2501V00C",
    procurementDate: "2023-06-01",
    eolDate: "2033-06-01",
    supportExpiry: "2031-06-01",
    rackUnit: "IBZ-DC1-ROW5-RACK01-U1",
    powerConsumptionW: 400,
    lastCommit: { date: "2026-03-08T14:00:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "C9300-48UXM", description: "48x mGig PoE+ + 4x10GE", ports: 52, portType: "mGig/10GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "PWR-C1-1100WAC", status: "OK", watts: 1100 },
    ],
    interfaces: [
      { name: "TenGigabitEthernet1/1/1", ip: "10.30.10.5/24", description: "Uplink to distr-sw01", peer: "ib-town-distr-sw01", operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: "2026-01-05T03:20:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-it-services"],
    goldenConfig: `!! ib-town-acc-sw01 — Cisco Catalyst 9300
hostname ib-town-acc-sw01`,
  },

  {
    id: "ib-santantoni-acc-sw01",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-acc-sw01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "Catalyst 9300-48UXM",
    layer: "IP LAN",
    role: "acc-sw",
    mgmtIp: "10.30.2.60",
    status: "UP",
    osVersion: "IOS-XE 17.9.4a",
    serialNumber: "FOC2501V00D",
    procurementDate: "2023-06-01",
    eolDate: "2033-06-01",
    supportExpiry: "2031-06-01",
    rackUnit: "SA-DC1-ROW5-RACK01-U1",
    powerConsumptionW: 400,
    lastCommit: { date: "2026-03-08T14:05:00Z", user: "dcops" },
    lineCards: [
      { slot: 1, model: "C9300-48UXM", description: "48x mGig PoE+ + 4x10GE", ports: 52, portType: "mGig/10GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "PWR-C1-1100WAC", status: "OK", watts: 1100 },
    ],
    interfaces: [
      { name: "TenGigabitEthernet1/1/1", ip: "10.30.20.5/24", description: "Uplink to santantoni-distr-sw01", peer: "ib-santantoni-distr-sw01", operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: "2026-01-05T03:25:00Z" },
    ],
    bgpNeighbors: [],
    services: ["ib-it-services"],
    goldenConfig: `!! ib-santantoni-acc-sw01 — Cisco Catalyst 9300
hostname ib-santantoni-acc-sw01`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY — Firewalls + WAF
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-fw-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-fw-01.vodafone.ib",
    vendor: "Palo Alto",
    hwModel: "PA-5280",
    layer: "Security",
    role: "fw",
    mgmtIp: "10.30.1.70",
    status: "UP",
    osVersion: "PAN-OS 11.1.2",
    serialNumber: "PA5280-IB-001",
    procurementDate: "2023-06-01",
    eolDate: "2031-06-01",
    supportExpiry: "2029-06-01",
    rackUnit: "IBZ-DC1-ROW1-RACK03-U10",
    powerConsumptionW: 1000,
    lastCommit: { date: "2026-03-22T09:00:00Z", user: "secops" },
    lineCards: [
      { slot: 0, model: "PA-5280", description: "12x10GE + 4x40GE + 4x100GE", ports: 20, portType: "10GE/40GE/100GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-A", model: "PA-5200-PSU-A", status: "OK", watts: 1000 },
      { id: "PSU-B", model: "PA-5200-PSU-A", status: "OK", watts: 1000 },
    ],
    interfaces: [
      { name: "ethernet1/1", ip: "10.30.70.1/30", description: "Outside — to cr-01", peer: "ib-town-cr-01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-12T06:00:00Z" },
      { name: "ethernet1/2", ip: "10.30.70.5/30", description: "Inside — to distr-sw01", peer: "ib-town-distr-sw01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-12T06:01:00Z" },
      { name: "ethernet1/3", ip: "10.30.70.9/30", description: "DMZ", peer: null, operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-12T06:02:00Z" },
      { name: "ethernet1/8", ip: "10.30.70.13/30", description: "HA1 link to fw-02", peer: "ib-santantoni-fw-02", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: "2026-01-12T06:03:00Z" },
      { name: "management", ip: "10.30.1.70/24", description: "Management", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-security", "ib-internet-transit"],
    goldenConfig: `# ib-town-fw-01 — Palo Alto PA-5280 | PAN-OS 11.1.2
# HA Active with ib-santantoni-fw-02
set deviceconfig system hostname ib-town-fw-01
set network interface ethernet ethernet1/1 layer3 ip 10.30.70.1/30
set rulebase security rules ALLOW-OUTBOUND from inside to outside action allow
set rulebase security rules DENY-ALL from any to any action deny log-start yes`,
  },

  {
    id: "ib-santantoni-fw-02",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-fw-02.vodafone.ib",
    vendor: "Palo Alto",
    hwModel: "PA-5280",
    layer: "Security",
    role: "fw",
    mgmtIp: "10.30.2.70",
    status: "UP",
    osVersion: "PAN-OS 11.1.2",
    serialNumber: "PA5280-IB-002",
    procurementDate: "2023-06-01",
    eolDate: "2031-06-01",
    supportExpiry: "2029-06-01",
    rackUnit: "SA-DC1-ROW1-RACK03-U10",
    powerConsumptionW: 1000,
    lastCommit: { date: "2026-03-22T09:05:00Z", user: "secops" },
    lineCards: [
      { slot: 0, model: "PA-5280", description: "12x10GE + 4x40GE + 4x100GE", ports: 20, portType: "10GE/40GE/100GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-A", model: "PA-5200-PSU-A", status: "OK", watts: 1000 },
      { id: "PSU-B", model: "PA-5200-PSU-A", status: "OK", watts: 1000 },
    ],
    interfaces: [
      { name: "ethernet1/1", ip: "10.30.71.1/30", description: "Outside — to santantoni-cr-01", peer: "ib-santantoni-cr-01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-12T06:05:00Z" },
      { name: "ethernet1/8", ip: "10.30.70.14/30", description: "HA1 link to fw-01", peer: "ib-town-fw-01", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: "2026-01-12T06:03:00Z" },
      { name: "management", ip: "10.30.2.70/24", description: "Management", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-security"],
    goldenConfig: `# ib-santantoni-fw-02 — Palo Alto PA-5280 | PAN-OS 11.1.2
# HA Passive (standby for ib-town-fw-01)
set deviceconfig system hostname ib-santantoni-fw-02
set high-availability group 1 mode active-passive`,
  },

  {
    id: "ib-town-waf-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-waf-01.vodafone.ib",
    vendor: "F5",
    hwModel: "BIG-IP i7800 (ASM)",
    layer: "Security",
    role: "waf",
    mgmtIp: "10.30.1.75",
    status: "UP",
    osVersion: "TMOS 17.1.1 + ASM",
    serialNumber: "F5-i7800-IB01",
    procurementDate: "2023-09-01",
    eolDate: "2031-09-01",
    supportExpiry: "2029-09-01",
    rackUnit: "IBZ-DC1-ROW1-RACK03-U20",
    powerConsumptionW: 700,
    lastCommit: { date: "2026-03-20T11:00:00Z", user: "secops" },
    lineCards: [
      { slot: 0, model: "i7800", description: "8x10GE + 4x40GE", ports: 12, portType: "10GE/40GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "F5-PWR-AC-700W", status: "OK", watts: 700 },
      { id: "PSU-2", model: "F5-PWR-AC-700W", status: "OK", watts: 700 },
    ],
    interfaces: [
      { name: "1.1", ip: "10.30.75.1/24", description: "WAF external", peer: "ib-town-distr-sw01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-12T07:00:00Z" },
      { name: "mgmt", ip: "10.30.1.75/24", description: "Management", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-security", "ib-cdn"],
    goldenConfig: `# ib-town-waf-01 — F5 BIG-IP i7800 (ASM) | TMOS 17.1.1
# Web Application Firewall for public-facing services
asm policy /Common/VODAFONE_WAF_POLICY {
  enforcement-mode blocking
  signature-staging disabled
}`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD BALANCERS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-lb-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-lb-01.vodafone.ib",
    vendor: "F5",
    hwModel: "BIG-IP i7800",
    layer: "Load Balancer",
    role: "lb",
    mgmtIp: "10.30.1.80",
    status: "UP",
    osVersion: "TMOS 17.1.1",
    serialNumber: "F5-i7800-IB02",
    procurementDate: "2023-06-01",
    eolDate: "2031-06-01",
    supportExpiry: "2029-06-01",
    rackUnit: "IBZ-DC1-ROW2-RACK02-U20",
    powerConsumptionW: 700,
    lastCommit: { date: "2026-03-18T14:00:00Z", user: "appops" },
    lineCards: [
      { slot: 0, model: "i7800", description: "8x10GE + 4x40GE", ports: 12, portType: "10GE/40GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "F5-PWR-AC-700W", status: "OK", watts: 700 },
      { id: "PSU-2", model: "F5-PWR-AC-700W", status: "OK", watts: 700 },
    ],
    interfaces: [
      { name: "1.1", ip: "10.30.80.1/24", description: "External VLAN", peer: "ib-town-distr-sw01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-12T07:05:00Z" },
      { name: "1.2", ip: "10.30.81.1/24", description: "Internal VLAN", peer: "ib-town-top-sw01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-12T07:06:00Z" },
      { name: "mgmt", ip: "10.30.1.80/24", description: "Management", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-load-balancing", "ib-iptv", "ib-cdn", "ib-it-services"],
    goldenConfig: `# ib-town-lb-01 — F5 BIG-IP i7800 | TMOS 17.1.1
# Active in HA pair
ltm virtual VS_CDN_HTTPS {
  destination 10.30.80.100:443
  pool POOL_CDN_ORIGIN
}`,
  },

  {
    id: "ib-santantoni-lb-02",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-lb-02.vodafone.ib",
    vendor: "F5",
    hwModel: "BIG-IP i7800",
    layer: "Load Balancer",
    role: "lb",
    mgmtIp: "10.30.2.80",
    status: "UP",
    osVersion: "TMOS 17.1.1",
    serialNumber: "F5-i7800-IB03",
    procurementDate: "2023-06-01",
    eolDate: "2031-06-01",
    supportExpiry: "2029-06-01",
    rackUnit: "SA-DC1-ROW2-RACK02-U20",
    powerConsumptionW: 700,
    lastCommit: { date: "2026-03-18T14:05:00Z", user: "appops" },
    lineCards: [
      { slot: 0, model: "i7800", description: "8x10GE + 4x40GE", ports: 12, portType: "10GE/40GE", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "F5-PWR-AC-700W", status: "OK", watts: 700 },
      { id: "PSU-2", model: "F5-PWR-AC-700W", status: "OK", watts: 700 },
    ],
    interfaces: [
      { name: "1.1", ip: "10.30.180.1/24", description: "External VLAN", peer: "ib-santantoni-distr-sw01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: "2026-01-12T07:10:00Z" },
      { name: "mgmt", ip: "10.30.2.80/24", description: "Management", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-load-balancing"],
    goldenConfig: `# ib-santantoni-lb-02 — F5 BIG-IP i7800 | TMOS 17.1.1
# Standby in HA pair`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IT INFRASTRUCTURE — DNS, NTP, AAA
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-dns-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-dns-01.vodafone.ib",
    vendor: "Infoblox",
    hwModel: "NIOS B-4010",
    layer: "IT Infrastructure",
    role: "dns",
    mgmtIp: "10.30.1.90",
    status: "UP",
    osVersion: "NIOS 9.0.3",
    serialNumber: "IB-4010-IB01",
    procurementDate: "2023-06-01",
    eolDate: "2031-06-01",
    supportExpiry: "2029-06-01",
    rackUnit: "IBZ-DC1-ROW5-RACK02-U5",
    powerConsumptionW: 350,
    lastCommit: { date: "2026-03-22T10:00:00Z", user: "dnsops" },
    lineCards: [
      { slot: 0, model: "B-4010", description: "Grid Master — 4x1GE", ports: 4, portType: "1GE RJ45", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "IB-PSU-AC-350W", status: "OK", watts: 350 },
      { id: "PSU-2", model: "IB-PSU-AC-350W", status: "OK", watts: 350 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.30.1.90/24", description: "DNS service", peer: "ib-town-distr-sw01", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
      { name: "eth1", ip: "10.30.90.1/24", description: "Grid replication", peer: "ib-santantoni-dns-02", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-dns"],
    goldenConfig: `# ib-town-dns-01 — Infoblox NIOS B-4010 | 9.0.3
# Grid Master
set grid_master on
set dns_zone vodafone.ib primary`,
  },

  {
    id: "ib-santantoni-dns-02",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-dns-02.vodafone.ib",
    vendor: "Infoblox",
    hwModel: "NIOS B-4010",
    layer: "IT Infrastructure",
    role: "dns",
    mgmtIp: "10.30.2.90",
    status: "UP",
    osVersion: "NIOS 9.0.3",
    serialNumber: "IB-4010-IB02",
    procurementDate: "2023-06-01",
    eolDate: "2031-06-01",
    supportExpiry: "2029-06-01",
    rackUnit: "SA-DC1-ROW5-RACK02-U5",
    powerConsumptionW: 350,
    lastCommit: { date: "2026-03-22T10:05:00Z", user: "dnsops" },
    lineCards: [
      { slot: 0, model: "B-4010", description: "Grid Secondary — 4x1GE", ports: 4, portType: "1GE RJ45", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "IB-PSU-AC-350W", status: "OK", watts: 350 },
      { id: "PSU-2", model: "IB-PSU-AC-350W", status: "OK", watts: 350 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.30.2.90/24", description: "DNS service", peer: "ib-santantoni-distr-sw01", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
      { name: "eth1", ip: "10.30.90.2/24", description: "Grid replication", peer: "ib-town-dns-01", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-dns"],
    goldenConfig: `# ib-santantoni-dns-02 — Infoblox NIOS B-4010 | 9.0.3
# Grid Secondary`,
  },

  {
    id: "ib-santaeulalia-dns-03",
    siteId: "ib-santaeulalia-dc1",
    country: "IB",
    hostname: "ib-santaeulalia-dns-03.vodafone.ib",
    vendor: "Infoblox",
    hwModel: "NIOS B-2205",
    layer: "IT Infrastructure",
    role: "dns",
    mgmtIp: "10.30.3.90",
    status: "UP",
    osVersion: "NIOS 9.0.3",
    serialNumber: "IB-2205-IB01",
    procurementDate: "2023-06-01",
    eolDate: "2031-06-01",
    supportExpiry: "2029-06-01",
    rackUnit: "SE-DC1-ROW2-RACK01-U5",
    powerConsumptionW: 200,
    lastCommit: { date: "2026-03-22T10:10:00Z", user: "dnsops" },
    lineCards: [
      { slot: 0, model: "B-2205", description: "Grid Member — 2x1GE", ports: 2, portType: "1GE RJ45", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "IB-PSU-AC-200W", status: "OK", watts: 200 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.30.3.90/24", description: "DNS service", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-dns"],
    goldenConfig: `# ib-santaeulalia-dns-03 — Infoblox NIOS B-2205 | 9.0.3
# Grid Member (Santa Eulalia)`,
  },

  {
    id: "ib-escanar-dns-04",
    siteId: "ib-escanar-dc1",
    country: "IB",
    hostname: "ib-escanar-dns-04.vodafone.ib",
    vendor: "Infoblox",
    hwModel: "NIOS B-2205",
    layer: "IT Infrastructure",
    role: "dns",
    mgmtIp: "10.30.4.90",
    status: "UP",
    osVersion: "NIOS 9.0.3",
    serialNumber: "IB-2205-IB02",
    procurementDate: "2023-06-01",
    eolDate: "2031-06-01",
    supportExpiry: "2029-06-01",
    rackUnit: "EC-DC1-ROW2-RACK01-U5",
    powerConsumptionW: 200,
    lastCommit: { date: "2026-03-22T10:15:00Z", user: "dnsops" },
    lineCards: [
      { slot: 0, model: "B-2205", description: "Grid Member — 2x1GE", ports: 2, portType: "1GE RJ45", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "IB-PSU-AC-200W", status: "OK", watts: 200 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.30.4.90/24", description: "DNS service", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-dns"],
    goldenConfig: `# ib-escanar-dns-04 — Infoblox NIOS B-2205 | 9.0.3
# Grid Member (Es Canar)`,
  },

  {
    id: "ib-town-ntp-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-ntp-01.vodafone.ib",
    vendor: "Microsemi",
    hwModel: "SyncServer S650",
    layer: "IT Infrastructure",
    role: "ntp",
    mgmtIp: "10.30.1.95",
    status: "UP",
    osVersion: "TimePictra 2.3",
    serialNumber: "MS-S650-IB01",
    procurementDate: "2023-01-15",
    eolDate: "2033-01-15",
    supportExpiry: "2031-01-15",
    rackUnit: "IBZ-DC1-ROW5-RACK02-U10",
    powerConsumptionW: 55,
    lastCommit: { date: "2025-06-01T12:00:00Z", user: "infraops" },
    lineCards: [
      { slot: 0, model: "S650", description: "GPS + GNSS + PTP, 2x1GE", ports: 2, portType: "1GE RJ45", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "S650-PSU-AC", status: "OK", watts: 55 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.30.1.95/24", description: "NTP service", peer: "ib-town-distr-sw01", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-ntp"],
    goldenConfig: `# ib-town-ntp-01 — Microsemi SyncServer S650
# Stratum 1 — GPS + PTP grandmaster
ntp server 127.127.28.0 prefer
ntp server 10.30.2.95`,
  },

  {
    id: "ib-santantoni-ntp-02",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-ntp-02.vodafone.ib",
    vendor: "Microsemi",
    hwModel: "SyncServer S650",
    layer: "IT Infrastructure",
    role: "ntp",
    mgmtIp: "10.30.2.95",
    status: "UP",
    osVersion: "TimePictra 2.3",
    serialNumber: "MS-S650-IB02",
    procurementDate: "2023-01-15",
    eolDate: "2033-01-15",
    supportExpiry: "2031-01-15",
    rackUnit: "SA-DC1-ROW5-RACK02-U10",
    powerConsumptionW: 55,
    lastCommit: { date: "2025-06-01T12:05:00Z", user: "infraops" },
    lineCards: [
      { slot: 0, model: "S650", description: "GPS + GNSS + PTP, 2x1GE", ports: 2, portType: "1GE RJ45", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "S650-PSU-AC", status: "OK", watts: 55 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.30.2.95/24", description: "NTP service", peer: "ib-santantoni-distr-sw01", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-ntp"],
    goldenConfig: `# ib-santantoni-ntp-02 — Microsemi SyncServer S650
# Stratum 1 — GPS (Sant Antoni)
ntp server 127.127.28.0 prefer
ntp server 10.30.1.95`,
  },

  {
    id: "ib-town-aaa-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-aaa-01.vodafone.ib",
    vendor: "Cisco",
    hwModel: "ISE 3395",
    layer: "IT Infrastructure",
    role: "aaa",
    mgmtIp: "10.30.1.100",
    status: "UP",
    osVersion: "ISE 3.3 Patch 2",
    serialNumber: "ISE-3395-IB01",
    procurementDate: "2023-09-01",
    eolDate: "2031-09-01",
    supportExpiry: "2029-09-01",
    rackUnit: "IBZ-DC1-ROW5-RACK02-U15",
    powerConsumptionW: 400,
    lastCommit: { date: "2026-03-18T16:00:00Z", user: "secops" },
    lineCards: [
      { slot: 0, model: "SNS-3395-K9", description: "Appliance — 4x10GE", ports: 4, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "ISE-PSU-AC-400W", status: "OK", watts: 400 },
      { id: "PSU-2", model: "ISE-PSU-AC-400W", status: "OK", watts: 400 },
    ],
    interfaces: [
      { name: "TenGigabitEthernet0", ip: "10.30.1.100/24", description: "RADIUS/TACACS+", peer: "ib-town-distr-sw01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: null },
      { name: "TenGigabitEthernet1", ip: "10.30.100.1/24", description: "ISE replication", peer: "ib-santantoni-aaa-02", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-aaa"],
    goldenConfig: `# ib-town-aaa-01 — Cisco ISE 3395 | 3.3p2
# Primary Administration Node (PAN)
hostname ib-town-aaa-01
ip domain-name vodafone.ib`,
  },

  {
    id: "ib-santantoni-aaa-02",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-aaa-02.vodafone.ib",
    vendor: "Cisco",
    hwModel: "ISE 3395",
    layer: "IT Infrastructure",
    role: "aaa",
    mgmtIp: "10.30.2.100",
    status: "UP",
    osVersion: "ISE 3.3 Patch 2",
    serialNumber: "ISE-3395-IB02",
    procurementDate: "2023-09-01",
    eolDate: "2031-09-01",
    supportExpiry: "2029-09-01",
    rackUnit: "SA-DC1-ROW5-RACK02-U15",
    powerConsumptionW: 400,
    lastCommit: { date: "2026-03-18T16:05:00Z", user: "secops" },
    lineCards: [
      { slot: 0, model: "SNS-3395-K9", description: "Appliance — 4x10GE", ports: 4, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "ISE-PSU-AC-400W", status: "OK", watts: 400 },
      { id: "PSU-2", model: "ISE-PSU-AC-400W", status: "OK", watts: 400 },
    ],
    interfaces: [
      { name: "TenGigabitEthernet0", ip: "10.30.2.100/24", description: "RADIUS/TACACS+", peer: "ib-santantoni-distr-sw01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: null },
      { name: "TenGigabitEthernet1", ip: "10.30.100.2/24", description: "ISE replication", peer: "ib-town-aaa-01", operStatus: "UP", speed: "10G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-aaa"],
    goldenConfig: `# ib-santantoni-aaa-02 — Cisco ISE 3395 | 3.3p2
# Secondary Administration Node`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NMS PLATFORM
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-nms-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-nms-01.vodafone.ib",
    vendor: "Dell",
    hwModel: "PowerEdge R750",
    layer: "NMS Platform",
    role: "nms",
    mgmtIp: "10.30.1.110",
    status: "UP",
    osVersion: "RHEL 9.2 / LibreNMS 24.1",
    serialNumber: "DELL-R750-IB01",
    procurementDate: "2023-09-01",
    eolDate: "2030-09-01",
    supportExpiry: "2028-09-01",
    rackUnit: "IBZ-DC1-ROW6-RACK01-U5",
    powerConsumptionW: 750,
    lastCommit: { date: "2026-03-24T08:00:00Z", user: "nmsops" },
    lineCards: [
      { slot: 0, model: "R750 Onboard", description: "2x Intel Xeon 6338, 256GB RAM, 4x25GE", ports: 4, portType: "25GE SFP28", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "Dell 1100W Platinum", status: "OK", watts: 1100 },
      { id: "PSU-2", model: "Dell 1100W Platinum", status: "OK", watts: 1100 },
    ],
    interfaces: [
      { name: "eno1", ip: "10.30.1.110/24", description: "NMS polling", peer: "ib-town-distr-sw01", operStatus: "UP", speed: "25G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-it-services"],
    goldenConfig: `# ib-town-nms-01 — Dell R750 | RHEL 9.2
# LibreNMS + Grafana + Prometheus`,
  },

  {
    id: "ib-santantoni-nms-02",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-nms-02.vodafone.ib",
    vendor: "Dell",
    hwModel: "PowerEdge R750",
    layer: "NMS Platform",
    role: "nms",
    mgmtIp: "10.30.2.110",
    status: "UP",
    osVersion: "RHEL 9.2 / Oxidized 0.29",
    serialNumber: "DELL-R750-IB02",
    procurementDate: "2023-09-01",
    eolDate: "2030-09-01",
    supportExpiry: "2028-09-01",
    rackUnit: "SA-DC1-ROW6-RACK01-U5",
    powerConsumptionW: 750,
    lastCommit: { date: "2026-03-24T08:05:00Z", user: "nmsops" },
    lineCards: [
      { slot: 0, model: "R750 Onboard", description: "2x Intel Xeon 6338, 256GB RAM, 4x25GE", ports: 4, portType: "25GE SFP28", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "Dell 1100W Platinum", status: "OK", watts: 1100 },
      { id: "PSU-2", model: "Dell 1100W Platinum", status: "OK", watts: 1100 },
    ],
    interfaces: [
      { name: "eno1", ip: "10.30.2.110/24", description: "Config backup / Oxidized", peer: "ib-santantoni-distr-sw01", operStatus: "UP", speed: "25G", mtu: 1500, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-it-services"],
    goldenConfig: `# ib-santantoni-nms-02 — Dell R750 | RHEL 9.2
# Oxidized config backup + NetBox DCIM`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OSS / BSS PLATFORM
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "ib-town-oss-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-oss-01.vodafone.ib",
    vendor: "Dell",
    hwModel: "PowerEdge R860",
    layer: "BSS Platform",
    role: "oss",
    mgmtIp: "10.30.1.115",
    status: "UP",
    osVersion: "RHEL 9.2 / Nokia NetAct 22.4",
    serialNumber: "DELL-R860-IB01",
    procurementDate: "2024-01-15",
    eolDate: "2031-01-15",
    supportExpiry: "2029-01-15",
    rackUnit: "IBZ-DC1-ROW6-RACK02-U1",
    powerConsumptionW: 1200,
    lastCommit: { date: "2026-03-22T18:00:00Z", user: "ossops" },
    lineCards: [
      { slot: 0, model: "R860 Onboard", description: "4x Intel Xeon 8470, 1TB RAM, 4x25GE", ports: 4, portType: "25GE SFP28", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "Dell 2400W Titanium", status: "OK", watts: 2400 },
      { id: "PSU-2", model: "Dell 2400W Titanium", status: "OK", watts: 2400 },
    ],
    interfaces: [
      { name: "eno1", ip: "10.30.1.115/24", description: "OSS application", peer: "ib-town-top-sw01", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-it-services"],
    goldenConfig: `# ib-town-oss-01 — Dell R860 | Nokia NetAct 22.4
# OSS — RAN management, fault management, performance management`,
  },

  {
    id: "ib-town-bss-01",
    siteId: "ib-town-dc1",
    country: "IB",
    hostname: "ib-town-bss-01.vodafone.ib",
    vendor: "Dell",
    hwModel: "PowerEdge R860",
    layer: "BSS Platform",
    role: "bss",
    mgmtIp: "10.30.1.120",
    status: "UP",
    osVersion: "RHEL 9.2 / Amdocs Optima 14.2",
    serialNumber: "DELL-R860-IB02",
    procurementDate: "2024-01-15",
    eolDate: "2031-01-15",
    supportExpiry: "2029-01-15",
    rackUnit: "IBZ-DC1-ROW6-RACK02-U5",
    powerConsumptionW: 1200,
    lastCommit: { date: "2026-03-22T18:10:00Z", user: "bssops" },
    lineCards: [
      { slot: 0, model: "R860 Onboard", description: "4x Intel Xeon 8470, 1TB RAM, 4x25GE", ports: 4, portType: "25GE SFP28", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "Dell 2400W Titanium", status: "OK", watts: 2400 },
      { id: "PSU-2", model: "Dell 2400W Titanium", status: "OK", watts: 2400 },
    ],
    interfaces: [
      { name: "eno1", ip: "10.30.1.120/24", description: "BSS application", peer: "ib-town-top-sw01", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: null },
      { name: "eno2", ip: "10.30.120.1/24", description: "DB replication", peer: "ib-santantoni-bss-02", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-it-services"],
    goldenConfig: `# ib-town-bss-01 — Dell R860 | Amdocs Optima 14.2
# Primary BSS — billing, CRM, provisioning
# Oracle RAC 19c`,
  },

  {
    id: "ib-santantoni-bss-02",
    siteId: "ib-santantoni-dc1",
    country: "IB",
    hostname: "ib-santantoni-bss-02.vodafone.ib",
    vendor: "Dell",
    hwModel: "PowerEdge R860",
    layer: "BSS Platform",
    role: "bss",
    mgmtIp: "10.30.2.120",
    status: "UP",
    osVersion: "RHEL 9.2 / Amdocs Optima 14.2",
    serialNumber: "DELL-R860-IB03",
    procurementDate: "2024-01-15",
    eolDate: "2031-01-15",
    supportExpiry: "2029-01-15",
    rackUnit: "SA-DC1-ROW6-RACK02-U5",
    powerConsumptionW: 1200,
    lastCommit: { date: "2026-03-22T18:15:00Z", user: "bssops" },
    lineCards: [
      { slot: 0, model: "R860 Onboard", description: "4x Intel Xeon 8470, 1TB RAM, 4x25GE", ports: 4, portType: "25GE SFP28", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-1", model: "Dell 2400W Titanium", status: "OK", watts: 2400 },
      { id: "PSU-2", model: "Dell 2400W Titanium", status: "OK", watts: 2400 },
    ],
    interfaces: [
      { name: "eno1", ip: "10.30.2.120/24", description: "BSS application (DR)", peer: "ib-santantoni-top-sw01", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: null },
      { name: "eno2", ip: "10.30.120.2/24", description: "DB replication", peer: "ib-town-bss-01", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["ib-it-services"],
    goldenConfig: `# ib-santantoni-bss-02 — Dell R860 | Amdocs Optima 14.2
# DR BSS — Oracle DataGuard sync`,
  },

];
