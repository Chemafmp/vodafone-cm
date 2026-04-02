// ─── HAWAII NODES ─────────────────────────────────────────────────────────────
// AS 65002 · Mgmt 10.20.0.0/16 · P2P 10.2.100.0/24 · Loopbacks 10.20.1.x/32
// 36 nodes total

export const NODES_HW = [

  // ═══════════════════════════════════════════════════════════════════════════
  // IP CORE — Honolulu
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-cr-01",
    siteId: "hw-hnl-core1",
    country: "HW",
    hostname: "hw-hnl1-cr-01.vodafone.hw",
    vendor: "Juniper",
    hwModel: "MX480",
    layer: "IP Core",
    status: "UP",
    osVersion: "JunOS 22.4R2.9",
    patches: [
      { id: "junos-22.4R2-S1.9", type: "Service Release", desc: "RPD crash fix on BGP flowspec", installedDate: "2026-02-01", installedBy: "netops-hw" },
      { id: "junos-22.4R2-J1", type: "JTAC Patch", desc: "PFE wedge on 100G LAG member failover", installedDate: "2026-03-10", installedBy: "netops-hw" },
    ],
    serialNumber: "JN1248BF3A12",
    procurementDate: "2022-01-10",
    eolDate: "2032-01-10",
    supportExpiry: "2030-01-10",
    rackUnit: "HNL-CORE1-RACK01-U1",
    powerConsumptionW: 2100,
    uptime: "203d 7h",
    lastCommit: { date: "2026-03-18T10:15:00Z", user: "netops-hw" },
    features: ["BGP","MPLS","ISIS","LDP","RSVP","BFD","L3VPN","QoS"],
    lineCards: [
      { slot: 0, model: "MPC7E-10G", description: "10x10GE line card", ports: 10, portType: "10GE SFP+", status: "ACTIVE" },
      { slot: 1, model: "MPC7E-10G", description: "10x10GE line card", ports: 10, portType: "10GE SFP+", status: "ACTIVE" },
      { slot: 2, model: "MPC10E-15C-MRATE", description: "400GE/100GE mixed rate", ports: 6, portType: "100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX480-4KBAC-BB", watts: 4000, status: "OK" },
      { id: "PSU-1", model: "PWR-MX480-4KBAC-BB", watts: 4000, status: "OK" },
    ],
    interfaces: [
      { name: "et-0/2/0",      ip: "10.2.100.1/30",  speed: "100G", mtu: 9214, operStatus: "UP",   peer: "hw-hnl1-pe-01",   lastFlap: null },
      { name: "et-0/2/1",      ip: "10.2.100.5/30",  speed: "100G", mtu: 9214, operStatus: "UP",   peer: "hw-hnl1-pe-02",   lastFlap: null },
      { name: "et-0/2/2",      ip: "10.2.100.9/30",  speed: "100G", mtu: 9214, operStatus: "UP",   peer: "hw-hnl1-cr-02",   lastFlap: null },
      { name: "et-0/2/3",      ip: "10.2.100.13/30", speed: "100G", mtu: 9214, operStatus: "UP",   peer: "hw-hnl1-igw-01",  lastFlap: null },
      { name: "et-0/2/4",      ip: "10.2.100.17/30", speed: "100G", mtu: 9214, operStatus: "UP",   peer: "hw-hnl-bpop-01",  lastFlap: null },
      { name: "lo0.0",         ip: "10.20.1.1/32",   speed: "N/A", mtu: 65535, operStatus: "UP",  peer: null,               lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.1.2",  peerAs: 65002, state: "Established", rxPrefixes: 220, txPrefixes: 220, uptime: "203d" },
      { peerIp: "10.20.1.3",  peerAs: 65002, state: "Established", rxPrefixes: 310, txPrefixes: 220, uptime: "190d" },
      { peerIp: "10.20.1.4",  peerAs: 65002, state: "Established", rxPrefixes: 180, txPrefixes: 220, uptime: "162d" },
    ],
    services: ["hw-internet-transit","hw-mpls-vpn","hw-5g-nsa","hw-voice-core"],
    goldenConfig: `# hw-hnl1-cr-01 — Juniper MX480 | IP Core | JunOS 22.4R2.9
set system host-name hw-hnl1-cr-01
set interfaces et-0/2/0 unit 0 description "to-hw-hnl1-pe-01"
set interfaces et-0/2/0 unit 0 family inet address 10.2.100.1/30
set interfaces et-0/2/0 unit 0 family mpls
set interfaces lo0 unit 0 family inet address 10.20.1.1/32
set routing-options router-id 10.20.1.1
set routing-options autonomous-system 65002
set protocols bgp group IBGP type internal
set protocols bgp group IBGP local-address 10.20.1.1
set protocols bgp group IBGP family inet-vpn unicast
set protocols bgp group IBGP neighbor 10.20.1.2
set protocols bgp group IBGP neighbor 10.20.1.3
set protocols isis interface et-0/2/0.0 level 2
set protocols mpls interface et-0/2/0
set protocols ldp interface et-0/2/0.0
set policy-options policy-statement EXPORT-CONNECTED term 1 from protocol direct
set policy-options policy-statement EXPORT-CONNECTED term 1 then accept`,
  },

  {
    id: "hw-hnl1-cr-02",
    siteId: "hw-hnl-core1",
    country: "HW",
    hostname: "hw-hnl1-cr-02.vodafone.hw",
    vendor: "Juniper",
    hwModel: "MX480",
    layer: "IP Core",
    status: "UP",
    osVersion: "JunOS 22.4R2.9",
    serialNumber: "JN1248BF3B34",
    procurementDate: "2022-01-10",
    eolDate: "2032-01-10",
    supportExpiry: "2030-01-10",
    rackUnit: "HNL-CORE1-RACK01-U5",
    powerConsumptionW: 2100,
    uptime: "203d 6h",
    lastCommit: { date: "2026-03-18T10:20:00Z", user: "netops-hw" },
    features: ["BGP","MPLS","ISIS","LDP","RSVP","BFD","L3VPN","QoS"],
    lineCards: [
      { slot: 0, model: "MPC7E-10G", description: "10x10GE line card", ports: 10, portType: "10GE SFP+", status: "ACTIVE" },
      { slot: 1, model: "MPC7E-10G", description: "10x10GE line card", ports: 10, portType: "10GE SFP+", status: "ACTIVE" },
      { slot: 2, model: "MPC10E-15C-MRATE", description: "400GE/100GE mixed rate", ports: 6, portType: "100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX480-4KBAC-BB", watts: 4000, status: "OK" },
      { id: "PSU-1", model: "PWR-MX480-4KBAC-BB", watts: 4000, status: "OK" },
    ],
    interfaces: [
      { name: "et-0/2/0",      ip: "10.2.100.21/30", speed: "100G", mtu: 9214, operStatus: "UP",   peer: "hw-hnl1-pe-01",   lastFlap: null },
      { name: "et-0/2/1",      ip: "10.2.100.25/30", speed: "100G", mtu: 9214, operStatus: "UP",   peer: "hw-hnl2-pe-01",   lastFlap: null },
      { name: "et-0/2/2",      ip: "10.2.100.9/30",  speed: "100G", mtu: 9214, operStatus: "UP",   peer: "hw-hnl1-cr-01",   lastFlap: null },
      { name: "et-0/2/3",      ip: "10.2.100.29/30", speed: "100G", mtu: 9214, operStatus: "UP",   peer: "hw-hnl1-igw-02",  lastFlap: null },
      { name: "lo0.0",         ip: "10.20.1.2/32",   speed: "N/A", mtu: 65535, operStatus: "UP",  peer: null,               lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.1.1",  peerAs: 65002, state: "Established", rxPrefixes: 220, txPrefixes: 220, uptime: "203d" },
      { peerIp: "10.20.1.3",  peerAs: 65002, state: "Established", rxPrefixes: 310, txPrefixes: 220, uptime: "190d" },
    ],
    services: ["hw-internet-transit","hw-mpls-vpn"],
    goldenConfig: `# hw-hnl1-cr-02 — Juniper MX480 | IP Core | JunOS 22.4R2.9
set system host-name hw-hnl1-cr-02
set interfaces et-0/2/0 unit 0 description "to-hw-hnl1-pe-01"
set interfaces et-0/2/0 unit 0 family inet address 10.2.100.21/30
set interfaces lo0 unit 0 family inet address 10.20.1.2/32
set routing-options router-id 10.20.1.2
set routing-options autonomous-system 65002
set protocols bgp group IBGP type internal
set protocols bgp group IBGP local-address 10.20.1.2
set protocols bgp group IBGP neighbor 10.20.1.1
set protocols bgp group IBGP neighbor 10.20.1.3
set protocols isis interface et-0/2/0.0 level 2
set protocols mpls interface et-0/2/0
set protocols ldp interface et-0/2/0.0`,
  },

  {
    id: "hw-hnl1-pe-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-pe-01.vodafone.hw",
    vendor: "Juniper",
    hwModel: "MX480",
    layer: "IP Core",
    status: "DEGRADED",
    osVersion: "JunOS 22.2R3.15",
    serialNumber: "JN1248CF4D56",
    procurementDate: "2021-06-15",
    eolDate: "2031-06-15",
    supportExpiry: "2029-06-15",
    rackUnit: "HNL1-DC1-RACK03-U1",
    powerConsumptionW: 1950,
    uptime: "84d 11h",
    lastCommit: { date: "2026-03-20T09:30:00Z", user: "netops-hw" },
    features: ["BGP","MPLS","ISIS","L3VPN","RSVP","BFD"],
    lineCards: [
      { slot: 0, model: "MPC7E-10G",       description: "10x10GE PE line card", ports: 10, portType: "10GE SFP+",    status: "ACTIVE" },
      { slot: 1, model: "MPC3E-3D-NG",     description: "2x100GE + 6x10GE",    ports: 8,  portType: "100GE / 10GE", status: "ACTIVE" },
      { slot: 2, model: "MPC7E-MRATE",     description: "Uplink 100GE card",    ports: 4,  portType: "100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX480-4KBAC-BB", watts: 4000, status: "OK" },
      { id: "PSU-1", model: "PWR-MX480-4KBAC-BB", watts: 4000, status: "OK" },
    ],
    interfaces: [
      { name: "xe-0/0/0",  ip: "10.2.100.2/30",  speed: "10G", mtu: 9214, operStatus: "UP",    peer: "hw-hnl1-cr-01",  lastFlap: null },
      { name: "xe-0/0/1",  ip: "10.2.100.22/30", speed: "10G", mtu: 9214, operStatus: "UP",    peer: "hw-hnl1-cr-02",  lastFlap: null },
      { name: "xe-0/0/2",  ip: "10.2.100.33/30", speed: "10G", mtu: 9214, operStatus: "DOWN",  peer: "hw-hnl2-pe-01",  lastFlap: "2026-03-24T11:30:00Z" },
      { name: "xe-0/0/3",  ip: "10.20.6.1/24",   speed: "10G", mtu: 1500, operStatus: "UP",    peer: "enterprise-vpn", lastFlap: null },
      { name: "lo0.0",     ip: "10.20.1.3/32",   speed: "N/A", mtu: 65535, operStatus: "UP",  peer: null,              lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.1.1",  peerAs: 65002, state: "Established", rxPrefixes: 220, txPrefixes: 90, uptime: "84d" },
      { peerIp: "10.20.1.2",  peerAs: 65002, state: "Established", rxPrefixes: 220, txPrefixes: 90, uptime: "84d" },
    ],
    services: ["hw-mpls-vpn","hw-voice-core"],
    goldenConfig: `# hw-hnl1-pe-01 — Juniper MX480 | IP Core | JunOS 22.2R3.15
# *** DEGRADED: xe-0/0/2 flapping (8 state changes in 15m) — check SFP/fiber ***
set system host-name hw-hnl1-pe-01
set interfaces xe-0/0/0 unit 0 description "to-hw-hnl1-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.2.100.2/30
set interfaces xe-0/0/2 unit 0 description "to-hw-hnl2-pe-01 [FLAPPING]"
set interfaces lo0 unit 0 family inet address 10.20.1.3/32
set routing-options router-id 10.20.1.3
set routing-options autonomous-system 65002
set protocols bgp group IBGP type internal
set protocols bgp group IBGP neighbor 10.20.1.1
set protocols bgp group IBGP neighbor 10.20.1.2
set routing-instances MPLS-VPN instance-type vrf
set routing-instances MPLS-VPN vrf-target target:65002:100`,
  },

  {
    id: "hw-hnl1-pe-02",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-pe-02.vodafone.hw",
    vendor: "Juniper",
    hwModel: "MX480",
    layer: "IP Core",
    status: "UP",
    osVersion: "JunOS 22.2R3.15",
    serialNumber: "JN1248CF4E78",
    procurementDate: "2021-06-15",
    eolDate: "2031-06-15",
    supportExpiry: "2029-06-15",
    rackUnit: "HNL1-DC1-RACK03-U5",
    powerConsumptionW: 1950,
    uptime: "184d 2h",
    lastCommit: { date: "2026-03-10T11:00:00Z", user: "netops-hw" },
    features: ["BGP","MPLS","ISIS","L3VPN","RSVP","BFD"],
    lineCards: [
      { slot: 0, model: "MPC7E-10G",   description: "10x10GE PE line card", ports: 10, portType: "10GE SFP+",    status: "ACTIVE" },
      { slot: 1, model: "MPC7E-MRATE", description: "Uplink 100GE card",    ports: 4,  portType: "100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX480-4KBAC-BB", watts: 4000, status: "OK" },
      { id: "PSU-1", model: "PWR-MX480-4KBAC-BB", watts: 4000, status: "OK" },
    ],
    interfaces: [
      { name: "xe-0/0/0",  ip: "10.2.100.6/30",  speed: "10G", mtu: 9214, operStatus: "UP", peer: "hw-hnl1-cr-01",  lastFlap: null },
      { name: "xe-0/0/1",  ip: "10.20.6.2/24",   speed: "10G", mtu: 1500, operStatus: "UP", peer: "enterprise-vpn", lastFlap: null },
      { name: "lo0.0",     ip: "10.20.1.4/32",   speed: "N/A", mtu: 65535, operStatus: "UP", peer: null,            lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.1.1",  peerAs: 65002, state: "Established", rxPrefixes: 220, txPrefixes: 85, uptime: "184d" },
    ],
    services: ["hw-mpls-vpn"],
    goldenConfig: `# hw-hnl1-pe-02 — Juniper MX480 | IP Core | JunOS 22.2R3.15
set system host-name hw-hnl1-pe-02
set interfaces xe-0/0/0 unit 0 description "to-hw-hnl1-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.2.100.6/30
set interfaces lo0 unit 0 family inet address 10.20.1.4/32
set routing-options router-id 10.20.1.4
set routing-options autonomous-system 65002
set protocols bgp group IBGP type internal
set protocols bgp group IBGP neighbor 10.20.1.1
set routing-instances MPLS-VPN instance-type vrf
set routing-instances MPLS-VPN vrf-target target:65002:100`,
  },

  {
    id: "hw-hnl2-pe-01",
    siteId: "hw-hnl2-dc2",
    country: "HW",
    hostname: "hw-hnl2-pe-01.vodafone.hw",
    vendor: "Juniper",
    hwModel: "MX204",
    layer: "IP Core",
    status: "UP",
    osVersion: "JunOS 22.4R2.9",
    serialNumber: "JN9876AD2C01",
    procurementDate: "2022-09-01",
    eolDate: "2032-09-01",
    supportExpiry: "2030-09-01",
    rackUnit: "HNL2-DC2-RACK01-U1",
    powerConsumptionW: 900,
    uptime: "145d 8h",
    lastCommit: { date: "2026-03-05T14:00:00Z", user: "netops-hw" },
    features: ["BGP","MPLS","ISIS","L3VPN","BFD"],
    lineCards: [
      { slot: 0, model: "MX204-BASE", description: "4x100GE + 8x10GE fixed", ports: 12, portType: "100GE QSFP28 / 10GE SFP+", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX204-AC", watts: 850, status: "OK" },
      { id: "PSU-1", model: "PWR-MX204-AC", watts: 850, status: "OK" },
    ],
    interfaces: [
      { name: "et-0/0/0",  ip: "10.2.100.25/30", speed: "100G", mtu: 9214, operStatus: "UP", peer: "hw-hnl1-cr-02",  lastFlap: null },
      { name: "et-0/0/1",  ip: "10.20.6.3/24",   speed: "100G", mtu: 1500, operStatus: "UP", peer: "enterprise-vpn", lastFlap: null },
      { name: "lo0.0",     ip: "10.20.1.5/32",   speed: "N/A", mtu: 65535, operStatus: "UP", peer: null,             lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.1.2",  peerAs: 65002, state: "Established", rxPrefixes: 220, txPrefixes: 70, uptime: "145d" },
    ],
    services: ["hw-mpls-vpn","hw-fixed-bb"],
    goldenConfig: `# hw-hnl2-pe-01 — Juniper MX204 | IP Core | JunOS 22.4R2.9
set system host-name hw-hnl2-pe-01
set interfaces et-0/0/0 unit 0 description "to-hw-hnl1-cr-02"
set interfaces et-0/0/0 unit 0 family inet address 10.2.100.25/30
set interfaces lo0 unit 0 family inet address 10.20.1.5/32
set routing-options router-id 10.20.1.5
set routing-options autonomous-system 65002
set protocols bgp group IBGP type internal
set protocols bgp group IBGP neighbor 10.20.1.2
set routing-instances MPLS-VPN instance-type vrf`,
  },

  {
    id: "hw-maui-pe-01",
    siteId: "hw-maui-dc1",
    country: "HW",
    hostname: "hw-maui-pe-01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "ASR 9001",
    layer: "IP Core",
    status: "DOWN",
    osVersion: "IOS-XR 7.7.21",
    serialNumber: "FOX2246P0G9",
    procurementDate: "2020-11-20",
    eolDate: "2030-11-20",
    supportExpiry: "2028-11-20",
    rackUnit: "MAUI-DC1-RACK01-U1",
    powerConsumptionW: 1200,
    uptime: "0d 0h",
    lastCommit: { date: "2026-02-15T08:00:00Z", user: "netops-hw" },
    features: ["BGP","MPLS","ISIS","L3VPN","BFD"],
    lineCards: [
      { slot: 0, model: "A9K-4T-L",  description: "4x10GE line card",  ports: 4,  portType: "10GE SFP+",    status: "ACTIVE" },
      { slot: 1, model: "A9K-8T/4-L", description: "8x10GE line card", ports: 8,  portType: "10GE SFP+",    status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "A9K-750W-AC", watts: 750, status: "OK" },
      { id: "PSU-1", model: "A9K-750W-AC", watts: 750, status: "OK" },
    ],
    interfaces: [
      { name: "TenGigE0/0/0/0",  ip: "10.2.100.37/30", speed: "10G", mtu: 9000, operStatus: "DOWN", peer: "hw-hnl1-cr-01",  lastFlap: "2026-03-24T08:05:00Z" },
      { name: "TenGigE0/0/0/1",  ip: "10.20.6.4/24",   speed: "10G", mtu: 1500, operStatus: "DOWN", peer: "enterprise-vpn", lastFlap: "2026-03-24T08:05:00Z" },
      { name: "Loopback0",       ip: "10.20.1.6/32",   speed: "N/A", mtu: 65535, operStatus: "DOWN", peer: null,            lastFlap: "2026-03-24T08:05:00Z" },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.1.1",  peerAs: 65002, state: "Idle", rxPrefixes: 0, txPrefixes: 0, uptime: "0s" },
    ],
    services: ["hw-mpls-vpn"],
    goldenConfig: `! hw-maui-pe-01 — Cisco ASR 9001 | IP Core | IOS-XR 7.7.21
! *** NODE DOWN — BGP session DOWN, hold timer expired 2026-03-24T08:05Z ***
! *** Maui enterprise traffic rerouting in progress ***
hostname hw-maui-pe-01
!
interface TenGigE0/0/0/0
 description to-hw-hnl1-cr-01
 ipv4 address 10.2.100.37 255.255.255.252
!
router isis HW-ISIS
 net 49.0002.0102.0001.0006.00
 address-family ipv4 unicast
  metric-style wide
!
router bgp 65002
 bgp router-id 10.20.1.6
 neighbor 10.20.1.1
  remote-as 65002
  update-source Loopback0
! ... [node unreachable — config not retrievable] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNET GATEWAYS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-igw-01",
    siteId: "hw-hnl-ixp1",
    country: "HW",
    hostname: "hw-hnl1-igw-01.vodafone.hw",
    vendor: "Juniper",
    hwModel: "MX204",
    layer: "Internet GW",
    status: "UP",
    osVersion: "JunOS 22.4R2.9",
    serialNumber: "JN8801XY1A22",
    procurementDate: "2022-03-01",
    eolDate: "2032-03-01",
    supportExpiry: "2030-03-01",
    rackUnit: "HNL-IXP1-RACK01-U1",
    powerConsumptionW: 850,
    uptime: "210d 3h",
    lastCommit: { date: "2026-03-12T09:00:00Z", user: "netops-hw" },
    features: ["BGP","EBGP","Route-Policy","BFD","RPKI","QoS"],
    lineCards: [
      { slot: 0, model: "MX204-BASE", description: "4x100GE + 8x10GE fixed", ports: 12, portType: "100GE QSFP28 / 10GE SFP+", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX204-AC", watts: 850, status: "OK" },
      { id: "PSU-1", model: "PWR-MX204-AC", watts: 850, status: "OK" },
    ],
    interfaces: [
      { name: "et-0/0/0",  ip: "64.71.128.1/30", speed: "100G", mtu: 9214, operStatus: "UP", peer: "AT&T AS7018",      lastFlap: null },
      { name: "et-0/0/1",  ip: "10.2.100.13/30", speed: "100G", mtu: 9214, operStatus: "UP", peer: "hw-hnl1-cr-01",   lastFlap: null },
      { name: "lo0.0",     ip: "10.20.1.7/32",   speed: "N/A",  mtu: 65535, operStatus: "UP", peer: null,             lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "64.71.128.2", peerAs: 7018,  state: "Established", rxPrefixes: 892341, txPrefixes: 2, uptime: "210d" },
      { peerIp: "10.20.1.1",   peerAs: 65002, state: "Established", rxPrefixes: 2,      txPrefixes: 892341, uptime: "210d" },
    ],
    services: ["hw-internet-transit"],
    goldenConfig: `# hw-hnl1-igw-01 — Juniper MX204 | Internet GW | JunOS 22.4R2.9
set system host-name hw-hnl1-igw-01
set interfaces et-0/0/0 unit 0 description "UPSTREAM-ATT-AS7018"
set interfaces et-0/0/0 unit 0 family inet address 64.71.128.1/30
set interfaces lo0 unit 0 family inet address 10.20.1.7/32
set routing-options router-id 10.20.1.7
set routing-options autonomous-system 65002
set protocols bgp group EBGP-ATT type external
set protocols bgp group EBGP-ATT peer-as 7018
set protocols bgp group EBGP-ATT neighbor 64.71.128.2
set policy-options policy-statement IMPORT-ATT term 1 then accept
set policy-options policy-statement EXPORT-TO-ATT term 1 from protocol static
set policy-options policy-statement EXPORT-TO-ATT term 1 then accept`,
  },

  {
    id: "hw-hnl1-igw-02",
    siteId: "hw-hnl-ixp2",
    country: "HW",
    hostname: "hw-hnl1-igw-02.vodafone.hw",
    vendor: "Juniper",
    hwModel: "MX204",
    layer: "Internet GW",
    status: "UP",
    osVersion: "JunOS 22.4R2.9",
    serialNumber: "JN8801XY1B44",
    procurementDate: "2022-03-01",
    eolDate: "2032-03-01",
    supportExpiry: "2030-03-01",
    rackUnit: "HNL-IXP2-RACK01-U1",
    powerConsumptionW: 850,
    uptime: "210d 3h",
    lastCommit: { date: "2026-03-12T09:05:00Z", user: "netops-hw" },
    features: ["BGP","EBGP","Route-Policy","BFD","RPKI","QoS"],
    lineCards: [
      { slot: 0, model: "MX204-BASE", description: "4x100GE + 8x10GE fixed", ports: 12, portType: "100GE QSFP28 / 10GE SFP+", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX204-AC", watts: 850, status: "OK" },
      { id: "PSU-1", model: "PWR-MX204-AC", watts: 850, status: "OK" },
    ],
    interfaces: [
      { name: "et-0/0/0",  ip: "38.140.32.1/30", speed: "100G", mtu: 9214, operStatus: "UP", peer: "Cogent AS174",    lastFlap: null },
      { name: "et-0/0/1",  ip: "10.2.100.29/30", speed: "100G", mtu: 9214, operStatus: "UP", peer: "hw-hnl1-cr-02",  lastFlap: null },
      { name: "lo0.0",     ip: "10.20.1.8/32",   speed: "N/A",  mtu: 65535, operStatus: "UP", peer: null,            lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "38.140.32.2", peerAs: 174,   state: "Established", rxPrefixes: 876022, txPrefixes: 2, uptime: "210d" },
      { peerIp: "10.20.1.2",   peerAs: 65002, state: "Established", rxPrefixes: 2,      txPrefixes: 876022, uptime: "200d" },
    ],
    services: ["hw-internet-transit"],
    goldenConfig: `# hw-hnl1-igw-02 — Juniper MX204 | Internet GW | JunOS 22.4R2.9
set system host-name hw-hnl1-igw-02
set interfaces et-0/0/0 unit 0 description "UPSTREAM-COGENT-AS174"
set interfaces et-0/0/0 unit 0 family inet address 38.140.32.1/30
set interfaces lo0 unit 0 family inet address 10.20.1.8/32
set routing-options router-id 10.20.1.8
set routing-options autonomous-system 65002
set protocols bgp group EBGP-COGENT type external
set protocols bgp group EBGP-COGENT peer-as 174
set protocols bgp group EBGP-COGENT neighbor 38.140.32.2`,
  },

  {
    id: "hw-hnl1-igw-03",
    siteId: "hw-hnl-ixp3",
    country: "HW",
    hostname: "hw-hnl1-igw-03.vodafone.hw",
    vendor: "Juniper",
    hwModel: "MX204",
    layer: "Internet GW",
    status: "UP",
    osVersion: "JunOS 22.4R2.9",
    serialNumber: "JN8801XY1C66",
    procurementDate: "2022-03-01",
    eolDate: "2032-03-01",
    supportExpiry: "2030-03-01",
    rackUnit: "HNL-IXP3-RACK01-U1",
    powerConsumptionW: 850,
    uptime: "189d 14h",
    lastCommit: { date: "2026-03-01T12:00:00Z", user: "netops-hw" },
    features: ["BGP","EBGP","Route-Policy","BFD","RPKI"],
    lineCards: [
      { slot: 0, model: "MX204-BASE", description: "4x100GE + 8x10GE fixed", ports: 12, portType: "100GE QSFP28 / 10GE SFP+", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-MX204-AC", watts: 850, status: "OK" },
      { id: "PSU-1", model: "PWR-MX204-AC", watts: 850, status: "OK" },
    ],
    interfaces: [
      { name: "et-0/0/0",  ip: "216.218.186.1/30", speed: "100G", mtu: 9214, operStatus: "UP", peer: "HE AS6939",       lastFlap: null },
      { name: "et-0/0/1",  ip: "10.2.100.41/30",   speed: "100G", mtu: 9214, operStatus: "UP", peer: "hw-hnl1-cr-01",  lastFlap: null },
      { name: "lo0.0",     ip: "10.20.1.9/32",     speed: "N/A",  mtu: 65535, operStatus: "UP", peer: null,            lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "216.218.186.2", peerAs: 6939, state: "Established", rxPrefixes: 1021400, txPrefixes: 2, uptime: "189d" },
    ],
    services: ["hw-internet-transit","hw-cdn"],
    goldenConfig: `# hw-hnl1-igw-03 — Juniper MX204 | Internet GW | JunOS 22.4R2.9
set system host-name hw-hnl1-igw-03
set interfaces et-0/0/0 unit 0 description "UPSTREAM-HE-AS6939"
set interfaces et-0/0/0 unit 0 family inet address 216.218.186.1/30
set interfaces lo0 unit 0 family inet address 10.20.1.9/32
set routing-options router-id 10.20.1.9
set routing-options autonomous-system 65002
set protocols bgp group EBGP-HE type external
set protocols bgp group EBGP-HE peer-as 6939
set protocols bgp group EBGP-HE neighbor 216.218.186.2`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5G / MOBILE CORE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-5gc-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-5gc-01.vodafone.hw",
    vendor: "Nokia",
    hwModel: "AirFrame OX",
    layer: "5G Core",
    status: "UP",
    osVersion: "SR-OS 23.3.R2",
    serialNumber: "NK4481AFOX01",
    procurementDate: "2023-01-15",
    eolDate: "2033-01-15",
    supportExpiry: "2031-01-15",
    rackUnit: "HNL1-DC1-RACK07-U1",
    powerConsumptionW: 4500,
    uptime: "88d 6h",
    lastCommit: { date: "2026-03-20T16:00:00Z", user: "5g-ops-hw" },
    features: ["AMF","SMF","UPF","NRF","AUSF","UDM","PCF","5G-SA","5G-NSA"],
    lineCards: [
      { slot: 0, model: "AFOX-COMPUTE-1",  description: "5GC compute blade AMF/SMF",  ports: 2, portType: "25GE SFP28", status: "ACTIVE" },
      { slot: 1, model: "AFOX-UPF-1",      description: "UPF N3/N6/N9 processing",   ports: 4, portType: "25GE SFP28", status: "ACTIVE" },
      { slot: 2, model: "AFOX-COMPUTE-2",  description: "Core NF cluster blade",      ports: 2, portType: "25GE SFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "AFOX-PSU-3KW", watts: 3000, status: "OK" },
      { id: "PSU-1", model: "AFOX-PSU-3KW", watts: 3000, status: "OK" },
    ],
    interfaces: [
      { name: "eth0",  ip: "10.2.5.1/24",    speed: "25G", mtu: 1500,  operStatus: "UP", peer: "UPF-N6-to-IGW",     lastFlap: null },
      { name: "eth1",  ip: "10.2.6.1/24",    speed: "25G", mtu: 9000,  operStatus: "UP", peer: "N3-gNB-Honolulu",   lastFlap: null },
      { name: "mgmt0", ip: "10.20.0.40/24",  speed: "1G",  mtu: 1500,  operStatus: "UP", peer: "mgmt-switch",       lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-5g-nsa"],
    goldenConfig: `# hw-hnl1-5gc-01 — Nokia AirFrame OX | 5G Core | SR-OS 23.3.R2
configure system name "hw-hnl1-5gc-01"
configure router interface "N6-to-IGW"
    address 10.2.5.1/24
    port 1/1/1
configure router interface "N3-gNB"
    address 10.2.6.1/24
    port 1/1/2
configure service vprn "5G-USER-PLANE"
    interface "N6" address 10.2.5.1/24
    interface "N3" address 10.2.6.1/24
configure system ntp server 10.20.0.50
configure system snmp community "BNOC-RO" access-permissions r`,
  },

  {
    id: "hw-hnl-bpop-01",
    siteId: "hw-hnl-core1",
    country: "HW",
    hostname: "hw-hnl-bpop-01.vodafone.hw",
    vendor: "Nokia",
    hwModel: "7750 SR-12",
    layer: "IP Core",
    status: "DEGRADED",
    osVersion: "SR-OS 22.10.R3",
    serialNumber: "NK7750SR12A1",
    procurementDate: "2021-11-01",
    eolDate: "2031-11-01",
    supportExpiry: "2029-11-01",
    rackUnit: "HNL-CORE1-RACK02-U1",
    powerConsumptionW: 3200,
    uptime: "162d 5h",
    lastCommit: { date: "2026-03-22T08:00:00Z", user: "5g-ops-hw" },
    features: ["BGP","MPLS","ISIS","RSVP-TE","5G-Backhaul","QoS","eMBMS"],
    lineCards: [
      { slot: 1, model: "IOM4-e-B",     description: "100GE IMM",           ports: 2,  portType: "100GE QSFP28", status: "ACTIVE" },
      { slot: 2, model: "IOM4-e-B",     description: "100GE IMM",           ports: 2,  portType: "100GE QSFP28", status: "ACTIVE" },
      { slot: 3, model: "IOM3-XP-B",    description: "10GE access card",    ports: 10, portType: "10GE SFP+",    status: "ACTIVE" },
      { slot: 4, model: "IOM3-XP-B",    description: "10GE access card",    ports: 10, portType: "10GE SFP+",    status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "Nokia SR-PSU-AC", watts: 2400, status: "OK" },
      { id: "PSU-1", model: "Nokia SR-PSU-AC", watts: 2400, status: "OK" },
    ],
    interfaces: [
      { name: "1/1/1",  ip: "10.2.100.17/30", speed: "100G", mtu: 9212, operStatus: "UP",       peer: "hw-hnl1-cr-01",       lastFlap: null },
      { name: "1/2/1",  ip: "10.2.6.2/24",    speed: "10G",  mtu: 1500, operStatus: "DEGRADED", peer: "radio-access-hnl",    lastFlap: "2026-03-24T13:20:00Z" },
      { name: "1/3/1",  ip: "10.20.7.1/24",   speed: "10G",  mtu: 1500, operStatus: "UP",       peer: "fixed-bb-agg",        lastFlap: null },
      { name: "mgmt",   ip: "10.20.0.41/24",  speed: "1G",   mtu: 1500, operStatus: "UP",       peer: "mgmt-switch",         lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.1.1",  peerAs: 65002, state: "Established", rxPrefixes: 180, txPrefixes: 50, uptime: "162d" },
    ],
    services: ["hw-5g-nsa","hw-fixed-bb"],
    goldenConfig: `# hw-hnl-bpop-01 — Nokia 7750 SR-12 | BPoP | SR-OS 22.10.R3
# *** DEGRADED: 12% packet loss on radio links (threshold 1%) since 13:20Z ***
configure system name "hw-hnl-bpop-01"
configure router interface "to-cr-01"
    address 10.2.100.17/30
    port 1/1/1
configure router interface "5G-backhaul"
    address 10.2.6.2/24
    port 1/2/1
configure router bgp
    group "IBGP"
        peer-as 65002
        neighbor 10.20.1.1
configure qos policy "5G-PRIORITY"
    dscp ef priority 1
    dscp af41 priority 2`,
  },

  {
    id: "hw-maui-bpop-01",
    siteId: "hw-maui-core1",
    country: "HW",
    hostname: "hw-maui-bpop-01.vodafone.hw",
    vendor: "Nokia",
    hwModel: "7750 SR-7",
    layer: "IP Core",
    status: "UP",
    osVersion: "SR-OS 22.10.R3",
    serialNumber: "NK7750SR7M02",
    procurementDate: "2022-02-15",
    eolDate: "2032-02-15",
    supportExpiry: "2030-02-15",
    rackUnit: "MAUI-CORE1-RACK01-U1",
    powerConsumptionW: 1800,
    uptime: "178d 9h",
    lastCommit: { date: "2026-02-20T10:00:00Z", user: "5g-ops-hw" },
    features: ["BGP","MPLS","ISIS","5G-Backhaul","QoS"],
    lineCards: [
      { slot: 1, model: "IOM4-e-B",  description: "100GE IMM",       ports: 2,  portType: "100GE QSFP28", status: "ACTIVE" },
      { slot: 2, model: "IOM3-XP-B", description: "10GE access card",ports: 10, portType: "10GE SFP+",    status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "Nokia SR-PSU-AC", watts: 2000, status: "OK" },
      { id: "PSU-1", model: "Nokia SR-PSU-AC", watts: 2000, status: "OK" },
    ],
    interfaces: [
      { name: "1/1/1",  ip: "10.2.100.45/30", speed: "100G", mtu: 9212, operStatus: "UP", peer: "hw-hnl1-cr-01",  lastFlap: null },
      { name: "1/2/1",  ip: "10.2.6.10/24",   speed: "10G",  mtu: 1500, operStatus: "UP", peer: "radio-maui",     lastFlap: null },
      { name: "mgmt",   ip: "10.20.0.42/24",  speed: "1G",   mtu: 1500, operStatus: "UP", peer: "mgmt-switch",    lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.1.1",  peerAs: 65002, state: "Established", rxPrefixes: 180, txPrefixes: 30, uptime: "178d" },
    ],
    services: ["hw-5g-nsa","hw-fixed-bb"],
    goldenConfig: `# hw-maui-bpop-01 — Nokia 7750 SR-7 | APoP Maui | SR-OS 22.10.R3
configure system name "hw-maui-bpop-01"
configure router interface "to-hnl-cr-01"
    address 10.2.100.45/30
    port 1/1/1
configure router bgp
    group "IBGP"
        peer-as 65002
        neighbor 10.20.1.1`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VOICE CORE
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-voip-gw-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-voip-gw-01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "UCS C240 M6 (CUBE)",
    layer: "Voice Core",
    status: "UP",
    osVersion: "IOS-XE 17.9.4a",
    serialNumber: "FCH2541V0PQ",
    procurementDate: "2022-06-01",
    eolDate: "2032-06-01",
    supportExpiry: "2030-06-01",
    rackUnit: "HNL1-DC1-RACK05-U4",
    powerConsumptionW: 780,
    uptime: "155d 2h",
    lastCommit: { date: "2026-03-10T14:00:00Z", user: "voice-ops-hw" },
    features: ["CUBE","SIP","H323","PSTN","TLS-SIP","SRTP"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "UCSC-PSU2V2-770W", watts: 770, status: "OK" },
      { id: "PSU-1", model: "UCSC-PSU2V2-770W", watts: 770, status: "OK" },
    ],
    interfaces: [
      { name: "GigabitEthernet0/0/0", ip: "10.20.4.1/24", speed: "1G",  mtu: 1500, operStatus: "UP", peer: "sip-trunk-primary", lastFlap: null },
      { name: "GigabitEthernet0/0/1", ip: "10.20.0.51/24",speed: "1G",  mtu: 1500, operStatus: "UP", peer: "mgmt",              lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-voice-core"],
    goldenConfig: `! hw-hnl1-voip-gw-01 — Cisco UCS CUBE | Voice Core | IOS-XE 17.9.4a
hostname hw-hnl1-voip-gw-01
!
voice service voip
 ip address trusted list
  ipv4 10.20.4.0 255.255.255.0
 allow-connections sip to sip
 sip
  bind control source-interface GigabitEthernet0/0/0
!
dial-peer voice 100 voip
 session protocol sipv2
 session target ipv4:10.20.4.10
 codec g711ulaw
 no vad`,
  },

  {
    id: "hw-hnl2-voip-gw-01",
    siteId: "hw-hnl2-dc2",
    country: "HW",
    hostname: "hw-hnl2-voip-gw-01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "UCS C240 M6 (CUBE)",
    layer: "Voice Core",
    status: "UP",
    osVersion: "IOS-XE 17.9.4a",
    serialNumber: "FCH2541V0PR",
    procurementDate: "2022-06-01",
    eolDate: "2032-06-01",
    supportExpiry: "2030-06-01",
    rackUnit: "HNL2-DC2-RACK03-U4",
    powerConsumptionW: 780,
    uptime: "155d 1h",
    lastCommit: { date: "2026-03-10T14:05:00Z", user: "voice-ops-hw" },
    features: ["CUBE","SIP","H323","PSTN","TLS-SIP","SRTP"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "UCSC-PSU2V2-770W", watts: 770, status: "OK" },
      { id: "PSU-1", model: "UCSC-PSU2V2-770W", watts: 770, status: "OK" },
    ],
    interfaces: [
      { name: "GigabitEthernet0/0/0", ip: "10.20.4.2/24", speed: "1G", mtu: 1500, operStatus: "UP", peer: "sip-trunk-dr", lastFlap: null },
      { name: "GigabitEthernet0/0/1", ip: "10.20.0.52/24",speed: "1G", mtu: 1500, operStatus: "UP", peer: "mgmt",         lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-voice-core"],
    goldenConfig: `! hw-hnl2-voip-gw-01 — Cisco UCS CUBE | Voice Core DR | IOS-XE 17.9.4a
hostname hw-hnl2-voip-gw-01
voice service voip
 allow-connections sip to sip
 sip
  bind control source-interface GigabitEthernet0/0/0`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IP LAN / SWITCHING
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-distr-sw01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-distr-sw01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "Nexus 9336C-FX2",
    layer: "IP LAN",
    status: "UP",
    osVersion: "NX-OS 10.3(3)F",
    serialNumber: "FDO2248R0AB",
    procurementDate: "2022-04-01",
    eolDate: "2032-04-01",
    supportExpiry: "2030-04-01",
    rackUnit: "HNL1-DC1-RACK04-U1",
    powerConsumptionW: 650,
    uptime: "192d 4h",
    lastCommit: { date: "2026-03-05T09:00:00Z", user: "netops-hw" },
    features: ["vPC","OSPF","STP","LACP","VXLAN","QoS"],
    lineCards: [
      { slot: 1, model: "N9K-X9736C-FX", description: "36x100GE QSFP28 line card", ports: 36, portType: "100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "NXA-PAC-1100W-B", watts: 1100, status: "OK" },
      { id: "PSU-1", model: "NXA-PAC-1100W-B", watts: 1100, status: "OK" },
    ],
    interfaces: [
      { name: "Ethernet1/1",  ip: null,           vlan: 100,  speed: "100G", mtu: 9216, operStatus: "UP", peer: "hw-hnl1-dc-fabric-01", lastFlap: null },
      { name: "Ethernet1/2",  ip: null,           vlan: 200,  speed: "100G", mtu: 9216, operStatus: "UP", peer: "hw-hnl1-dc-fabric-02", lastFlap: null },
      { name: "Vlan100",      ip: "10.20.0.1/16", vlan: 100,  speed: "N/A", mtu: 1500,  operStatus: "UP", peer: "mgmt-gateway",          lastFlap: null },
      { name: "Vlan500",      ip: "10.20.7.1/24", vlan: 500,  speed: "N/A", mtu: 1500,  operStatus: "UP", peer: "broadband-agg",         lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-fixed-bb","hw-it-services"],
    goldenConfig: `! hw-hnl1-distr-sw01 — Cisco Nexus 9336C-FX2 | Distribution | NX-OS 10.3(3)F
hostname hw-hnl1-distr-sw01
feature vpc
feature lacp
feature interface-vlan
vlan 100
  name MGMT
vlan 200
  name VOICE
vlan 500
  name BROADBAND
interface Vlan100
  ip address 10.20.0.1/16
interface Ethernet1/1
  description to-hw-hnl1-dc-fabric-01
  switchport mode trunk`,
  },

  {
    id: "hw-hnl1-distr-sw02",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-distr-sw02.vodafone.hw",
    vendor: "Cisco",
    hwModel: "Nexus 9336C-FX2",
    layer: "IP LAN",
    status: "UP",
    osVersion: "NX-OS 10.3(3)F",
    serialNumber: "FDO2248R0AC",
    procurementDate: "2022-04-01",
    eolDate: "2032-04-01",
    supportExpiry: "2030-04-01",
    rackUnit: "HNL1-DC1-RACK04-U5",
    powerConsumptionW: 650,
    uptime: "192d 4h",
    lastCommit: { date: "2026-03-05T09:05:00Z", user: "netops-hw" },
    features: ["vPC","OSPF","STP","LACP","VXLAN"],
    lineCards: [
      { slot: 1, model: "N9K-X9736C-FX", description: "36x100GE QSFP28", ports: 36, portType: "100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "NXA-PAC-1100W-B", watts: 1100, status: "OK" },
      { id: "PSU-1", model: "NXA-PAC-1100W-B", watts: 1100, status: "OK" },
    ],
    interfaces: [
      { name: "Ethernet1/1",  ip: null,            vlan: 100, speed: "100G", mtu: 9216, operStatus: "UP", peer: "hw-hnl1-dc-fabric-01", lastFlap: null },
      { name: "Vlan100",      ip: "10.20.0.2/16",  vlan: 100, speed: "N/A",  mtu: 1500, operStatus: "UP", peer: "mgmt-gateway",          lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-fixed-bb","hw-it-services"],
    goldenConfig: `! hw-hnl1-distr-sw02 — Cisco Nexus 9336C-FX2 | Distribution | NX-OS 10.3(3)F
hostname hw-hnl1-distr-sw02
feature vpc
vlan 100,200,500
interface Ethernet1/1
  description to-hw-hnl1-dc-fabric-01
  switchport mode trunk`,
  },

  {
    id: "hw-hnl2-distr-sw01",
    siteId: "hw-hnl2-dc2",
    country: "HW",
    hostname: "hw-hnl2-distr-sw01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "Nexus 9300-48UX",
    layer: "IP LAN",
    status: "UP",
    osVersion: "NX-OS 10.2(5)M",
    serialNumber: "FDO2101R0XQ",
    procurementDate: "2021-09-01",
    eolDate: "2031-09-01",
    supportExpiry: "2029-09-01",
    rackUnit: "HNL2-DC2-RACK02-U1",
    powerConsumptionW: 580,
    uptime: "210d 1h",
    lastCommit: { date: "2026-02-28T08:00:00Z", user: "netops-hw" },
    features: ["vPC","STP","LACP","VLAN","QoS"],
    lineCards: [
      { slot: 0, model: "N9K-C9300-48UX", description: "48x10G + 6x40G fixed", ports: 54, portType: "10GE SFP+ / 40GE QSFP+", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "NXA-PAC-650W-PI", watts: 650, status: "OK" },
      { id: "PSU-1", model: "NXA-PAC-650W-PI", watts: 650, status: "OK" },
    ],
    interfaces: [
      { name: "Ethernet1/49",  ip: null,            vlan: 100, speed: "40G", mtu: 9216, operStatus: "UP", peer: "hw-hnl2-dc-fabric-01", lastFlap: null },
      { name: "Vlan100",       ip: "10.20.0.3/16",  vlan: 100, speed: "N/A", mtu: 1500, operStatus: "UP", peer: "mgmt-gateway",          lastFlap: null },
      { name: "Vlan500",       ip: "10.20.7.3/24",  vlan: 500, speed: "N/A", mtu: 1500, operStatus: "UP", peer: "fixed-bb",              lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-fixed-bb","hw-it-services"],
    goldenConfig: `! hw-hnl2-distr-sw01 — Cisco Nexus 9300-48UX | Distribution | NX-OS 10.2(5)M
hostname hw-hnl2-distr-sw01
vlan 100,200,500
interface Ethernet1/49
  description to-hw-hnl2-dc-fabric-01
  switchport mode trunk`,
  },

  {
    id: "hw-maui-distr-sw01",
    siteId: "hw-maui-dc1",
    country: "HW",
    hostname: "hw-maui-distr-sw01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "Catalyst 9500-32QC",
    layer: "IP LAN",
    status: "UP",
    osVersion: "IOS-XE 17.9.4a",
    serialNumber: "FCW2337A001",
    procurementDate: "2022-07-01",
    eolDate: "2032-07-01",
    supportExpiry: "2030-07-01",
    rackUnit: "MAUI-DC1-RACK02-U1",
    powerConsumptionW: 420,
    uptime: "140d 8h",
    lastCommit: { date: "2026-01-15T10:00:00Z", user: "netops-hw" },
    features: ["STP","LACP","VLAN","QoS","StackWise"],
    lineCards: [
      { slot: 0, model: "C9500-32QC", description: "32x40G/100G fixed", ports: 32, portType: "40G/100G QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "C9K-PWR-1500WAC-P", watts: 1500, status: "OK" },
      { id: "PSU-1", model: "C9K-PWR-1500WAC-P", watts: 1500, status: "OK" },
    ],
    interfaces: [
      { name: "HundredGigE1/0/1",  ip: null,           vlan: 100, speed: "100G", mtu: 9216, operStatus: "UP", peer: "maui-pe-01",   lastFlap: null },
      { name: "Vlan100",            ip: "10.20.0.4/16", vlan: 100, speed: "N/A",  mtu: 1500, operStatus: "UP", peer: "mgmt-gateway", lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-fixed-bb"],
    goldenConfig: `! hw-maui-distr-sw01 — Cisco Catalyst 9500 | Distribution | IOS-XE 17.9.4a
hostname hw-maui-distr-sw01
vlan 100,500
interface HundredGigE1/0/1
  description to-hw-maui-pe-01
  switchport trunk allowed vlan 100,500`,
  },

  {
    id: "hw-maui-acc-sw01",
    siteId: "hw-maui-dc1",
    country: "HW",
    hostname: "hw-maui-acc-sw01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "Catalyst 9300-48UXM",
    layer: "IP LAN",
    status: "UP",
    osVersion: "IOS-XE 17.9.4a",
    serialNumber: "FCW2337B012",
    procurementDate: "2022-07-01",
    eolDate: "2032-07-01",
    supportExpiry: "2030-07-01",
    rackUnit: "MAUI-DC1-RACK02-U5",
    powerConsumptionW: 290,
    uptime: "140d 7h",
    lastCommit: { date: "2026-01-15T10:10:00Z", user: "netops-hw" },
    features: ["STP","LACP","PoE+","VLAN"],
    lineCards: [
      { slot: 0, model: "C9300-48UXM", description: "48x mGig PoE+ + 8x10G SFP", ports: 56, portType: "mGig RJ45 / 10GE SFP+", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-C1-1100WAC", watts: 1100, status: "OK" },
      { id: "PSU-1", model: "PWR-C1-1100WAC", watts: 1100, status: "OK" },
    ],
    interfaces: [
      { name: "TenGigabitEthernet1/1/1", ip: null, vlan: 100, speed: "10G", mtu: 9216, operStatus: "UP", peer: "hw-maui-distr-sw01", lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-fixed-bb"],
    goldenConfig: `! hw-maui-acc-sw01 — Cisco Catalyst 9300 | Access | IOS-XE 17.9.4a
hostname hw-maui-acc-sw01
spanning-tree mode rapid-pvst
interface TenGigabitEthernet1/1/1
  description uplink-to-distr-sw01
  switchport mode trunk`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DC FABRIC
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-dc-fabric-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-dc-fabric-01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "Nexus 9364C",
    layer: "DC Fabric",
    status: "UP",
    osVersion: "NX-OS 10.3(3)F",
    serialNumber: "FDO2248S0FA",
    procurementDate: "2022-04-01",
    eolDate: "2032-04-01",
    supportExpiry: "2030-04-01",
    rackUnit: "HNL1-DC1-RACK08-U1",
    powerConsumptionW: 1200,
    uptime: "192d 5h",
    lastCommit: { date: "2026-03-02T07:00:00Z", user: "dc-ops-hw" },
    features: ["VXLAN","EVPN","BGP","OSPF","vPC","NX-API"],
    lineCards: [
      { slot: 1, model: "N9K-X9736C-FX", description: "36x100GE Spine",  ports: 36, portType: "100GE QSFP28", status: "ACTIVE" },
      { slot: 2, model: "N9K-X9736C-FX", description: "36x100GE Spine",  ports: 36, portType: "100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "NXA-PAC-3000W-B", watts: 3000, status: "OK" },
      { id: "PSU-1", model: "NXA-PAC-3000W-B", watts: 3000, status: "OK" },
    ],
    interfaces: [
      { name: "Ethernet1/1",  ip: "10.20.2.1/30", speed: "100G", mtu: 9216, operStatus: "UP", peer: "server-leaf-01", lastFlap: null },
      { name: "Ethernet1/2",  ip: "10.20.2.5/30", speed: "100G", mtu: 9216, operStatus: "UP", peer: "server-leaf-02", lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.2.2", peerAs: 65002, state: "Established", rxPrefixes: 180, txPrefixes: 180, uptime: "192d" },
    ],
    services: ["hw-it-services","hw-cdn"],
    goldenConfig: `! hw-hnl1-dc-fabric-01 — Cisco Nexus 9364C | DC Spine | NX-OS 10.3(3)F
hostname hw-hnl1-dc-fabric-01
feature bgp
feature nv overlay
feature vn-segment-vlan-based
nv overlay evpn
route-map PERMIT-ALL permit 10
router bgp 65002
  template peer SPINE
    remote-as 65002
    update-source loopback0
    address-family l2vpn evpn
      send-community extended`,
  },

  {
    id: "hw-hnl1-dc-fabric-02",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-dc-fabric-02.vodafone.hw",
    vendor: "Cisco",
    hwModel: "Nexus 9364C",
    layer: "DC Fabric",
    status: "UP",
    osVersion: "NX-OS 10.3(3)F",
    serialNumber: "FDO2248S0FB",
    procurementDate: "2022-04-01",
    eolDate: "2032-04-01",
    supportExpiry: "2030-04-01",
    rackUnit: "HNL1-DC1-RACK08-U5",
    powerConsumptionW: 1200,
    uptime: "192d 5h",
    lastCommit: { date: "2026-03-02T07:05:00Z", user: "dc-ops-hw" },
    features: ["VXLAN","EVPN","BGP","OSPF","vPC","NX-API"],
    lineCards: [
      { slot: 1, model: "N9K-X9736C-FX", description: "36x100GE Spine", ports: 36, portType: "100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "NXA-PAC-3000W-B", watts: 3000, status: "OK" },
      { id: "PSU-1", model: "NXA-PAC-3000W-B", watts: 3000, status: "OK" },
    ],
    interfaces: [
      { name: "Ethernet1/1", ip: "10.20.2.9/30",  speed: "100G", mtu: 9216, operStatus: "UP", peer: "server-leaf-01", lastFlap: null },
    ],
    bgpNeighbors: [
      { peerIp: "10.20.2.10", peerAs: 65002, state: "Established", rxPrefixes: 180, txPrefixes: 180, uptime: "192d" },
    ],
    services: ["hw-it-services"],
    goldenConfig: `! hw-hnl1-dc-fabric-02 — Cisco Nexus 9364C | DC Spine | NX-OS 10.3(3)F
hostname hw-hnl1-dc-fabric-02
feature bgp
feature nv overlay
nv overlay evpn
router bgp 65002
  address-family l2vpn evpn`,
  },

  {
    id: "hw-hnl2-dc-fabric-01",
    siteId: "hw-hnl2-dc2",
    country: "HW",
    hostname: "hw-hnl2-dc-fabric-01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "Nexus 9336C-FX2",
    layer: "DC Fabric",
    status: "UP",
    osVersion: "NX-OS 10.3(3)F",
    serialNumber: "FDO2248S0FC",
    procurementDate: "2022-05-01",
    eolDate: "2032-05-01",
    supportExpiry: "2030-05-01",
    rackUnit: "HNL2-DC2-RACK05-U1",
    powerConsumptionW: 800,
    uptime: "180d 2h",
    lastCommit: { date: "2026-02-15T08:00:00Z", user: "dc-ops-hw" },
    features: ["VXLAN","EVPN","BGP","vPC"],
    lineCards: [
      { slot: 1, model: "N9K-X9736C-FX", description: "36x100GE Spine", ports: 36, portType: "100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "NXA-PAC-1100W-B", watts: 1100, status: "OK" },
      { id: "PSU-1", model: "NXA-PAC-1100W-B", watts: 1100, status: "OK" },
    ],
    interfaces: [
      { name: "Ethernet1/1", ip: "10.20.5.1/30", speed: "100G", mtu: 9216, operStatus: "UP", peer: "server-leaf-dc2", lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-it-services"],
    goldenConfig: `! hw-hnl2-dc-fabric-01 — Cisco Nexus 9336C-FX2 | DC Fabric | NX-OS 10.3(3)F
hostname hw-hnl2-dc-fabric-01
feature bgp
nv overlay evpn
vlan 10,20,100,400,500`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-fw-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-fw-01.vodafone.hw",
    vendor: "Palo Alto",
    hwModel: "PA-5260",
    layer: "Security",
    status: "UP",
    osVersion: "PAN-OS 11.0.3",
    serialNumber: "PA5260HW0001",
    procurementDate: "2023-02-01",
    eolDate: "2033-02-01",
    supportExpiry: "2031-02-01",
    rackUnit: "HNL1-DC1-RACK06-U1",
    powerConsumptionW: 1100,
    uptime: "65d 11h",
    lastCommit: { date: "2026-03-15T11:00:00Z", user: "sec-ops-hw" },
    features: ["L4-FW","IPS","App-ID","URL-Filtering","Threat-Prev","HA-Active","SSL-Inspect"],
    lineCards: [
      { slot: 0, model: "PA-5260-BASE", description: "8x10GE + 4x100GE fixed", ports: 12, portType: "10GE SFP+ / 100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PA-5260-PSU", watts: 1100, status: "OK" },
      { id: "PSU-1", model: "PA-5260-PSU", watts: 1100, status: "OK" },
    ],
    interfaces: [
      { name: "ethernet1/1",  ip: "10.20.9.1/30",  speed: "10G", mtu: 1500, operStatus: "UP", peer: "outside-segment",   lastFlap: null },
      { name: "ethernet1/2",  ip: "10.20.9.2/30",  speed: "10G", mtu: 1500, operStatus: "UP", peer: "inside-DC-fabric",  lastFlap: null },
      { name: "mgmt",         ip: "10.20.0.60/24", speed: "1G",  mtu: 1500, operStatus: "UP", peer: "mgmt-switch",       lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-security"],
    goldenConfig: `# hw-hnl1-fw-01 — Palo Alto PA-5260 | Firewall Active | PAN-OS 11.0.3
set deviceconfig system hostname hw-hnl1-fw-01
set network interface ethernet ethernet1/1 layer3 ip 10.20.9.1/30
set network interface ethernet ethernet1/2 layer3 ip 10.20.9.2/30
set network virtual-router default interface [ethernet1/1 ethernet1/2]
set zone OUTSIDE network layer3 ethernet1/1
set zone INSIDE network layer3 ethernet1/2
set high-availability group 1 mode active-passive
set high-availability group 1 configuration sync enabled yes
set security policy rule ALLOW-ESTABLISHED application any
set security policy rule ALLOW-ESTABLISHED action allow`,
  },

  {
    id: "hw-hnl1-fw-02",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-fw-02.vodafone.hw",
    vendor: "Palo Alto",
    hwModel: "PA-5260",
    layer: "Security",
    status: "UP",
    osVersion: "PAN-OS 11.0.3",
    serialNumber: "PA5260HW0002",
    procurementDate: "2023-02-01",
    eolDate: "2033-02-01",
    supportExpiry: "2031-02-01",
    rackUnit: "HNL1-DC1-RACK06-U5",
    powerConsumptionW: 1100,
    uptime: "65d 11h",
    lastCommit: { date: "2026-03-15T11:05:00Z", user: "sec-ops-hw" },
    features: ["L4-FW","IPS","App-ID","URL-Filtering","HA-Standby","SSL-Inspect"],
    lineCards: [
      { slot: 0, model: "PA-5260-BASE", description: "8x10GE + 4x100GE fixed", ports: 12, portType: "10GE SFP+ / 100GE QSFP28", status: "ACTIVE" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PA-5260-PSU", watts: 1100, status: "OK" },
      { id: "PSU-1", model: "PA-5260-PSU", watts: 1100, status: "OK" },
    ],
    interfaces: [
      { name: "ethernet1/1", ip: "10.20.9.5/30",  speed: "10G", mtu: 1500, operStatus: "UP", peer: "outside-segment", lastFlap: null },
      { name: "ethernet1/2", ip: "10.20.9.6/30",  speed: "10G", mtu: 1500, operStatus: "UP", peer: "inside-DC",       lastFlap: null },
      { name: "mgmt",        ip: "10.20.0.61/24", speed: "1G",  mtu: 1500, operStatus: "UP", peer: "mgmt-switch",     lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-security"],
    goldenConfig: `# hw-hnl1-fw-02 — Palo Alto PA-5260 | Firewall Standby | PAN-OS 11.0.3
set deviceconfig system hostname hw-hnl1-fw-02
set high-availability group 1 mode active-passive
set high-availability group 1 peer-ip 10.20.0.60`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD BALANCERS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-lb-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-lb-01.vodafone.hw",
    vendor: "F5",
    hwModel: "BIG-IP i7800",
    layer: "Load Balancer",
    status: "UP",
    osVersion: "TMOS 17.1.1.1",
    serialNumber: "F5LB7800HW01",
    procurementDate: "2023-03-01",
    eolDate: "2033-03-01",
    supportExpiry: "2031-03-01",
    rackUnit: "HNL1-DC1-RACK06-U9",
    powerConsumptionW: 850,
    uptime: "42d 3h",
    lastCommit: { date: "2026-03-20T13:00:00Z", user: "app-ops-hw" },
    features: ["LTM","GTM","AFM","APM","HA-Active","SSL-Offload","iRules"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "BIG-IP-i7800-PSU", watts: 850, status: "OK" },
      { id: "PSU-1", model: "BIG-IP-i7800-PSU", watts: 850, status: "OK" },
    ],
    interfaces: [
      { name: "1.1",  ip: "10.20.20.1/24",  speed: "10G", mtu: 1500, operStatus: "UP", peer: "VIP-pool-clients", lastFlap: null },
      { name: "1.2",  ip: "10.20.2.100/24", speed: "10G", mtu: 1500, operStatus: "UP", peer: "server-farm",     lastFlap: null },
      { name: "mgmt", ip: "10.20.0.70/24",  speed: "1G",  mtu: 1500, operStatus: "UP", peer: "mgmt-switch",     lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-load-balancing"],
    goldenConfig: `# hw-hnl1-lb-01 — F5 BIG-IP i7800 | LB Active | TMOS 17.1.1.1
ltm virtual PORTAL-VIP {
    destination 10.20.20.10:443
    ip-protocol tcp
    pool PORTAL-POOL
    profiles { http { } tcp { } clientssl { } }
    source-address-translation { type automap }
}
ltm pool PORTAL-POOL {
    members {
        10.20.2.101:443 { address 10.20.2.101 }
        10.20.2.102:443 { address 10.20.2.102 }
    }
    monitor https
}`,
  },

  {
    id: "hw-hnl1-lb-02",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-lb-02.vodafone.hw",
    vendor: "F5",
    hwModel: "BIG-IP i7800",
    layer: "Load Balancer",
    status: "UP",
    osVersion: "TMOS 17.1.1.1",
    serialNumber: "F5LB7800HW02",
    procurementDate: "2023-03-01",
    eolDate: "2033-03-01",
    supportExpiry: "2031-03-01",
    rackUnit: "HNL1-DC1-RACK06-U13",
    powerConsumptionW: 850,
    uptime: "42d 3h",
    lastCommit: { date: "2026-03-20T13:05:00Z", user: "app-ops-hw" },
    features: ["LTM","GTM","HA-Standby","SSL-Offload"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "BIG-IP-i7800-PSU", watts: 850, status: "OK" },
      { id: "PSU-1", model: "BIG-IP-i7800-PSU", watts: 850, status: "OK" },
    ],
    interfaces: [
      { name: "1.1",  ip: "10.20.20.2/24",  speed: "10G", mtu: 1500, operStatus: "UP", peer: "VIP-pool-clients", lastFlap: null },
      { name: "mgmt", ip: "10.20.0.71/24",  speed: "1G",  mtu: 1500, operStatus: "UP", peer: "mgmt-switch",     lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-load-balancing"],
    goldenConfig: `# hw-hnl1-lb-02 — F5 BIG-IP i7800 | LB Standby | TMOS 17.1.1.1
# HA Standby — syncs config from hw-hnl1-lb-01
cm device hw-hnl1-lb-02.vodafone.hw { configsync-ip 10.20.0.71 }
cm trust-domain Root { ca-devices { /Common/hw-hnl1-lb-01 } }`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IT INFRASTRUCTURE — DNS / NTP / AAA
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-dns-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-dns-01.vodafone.hw",
    vendor: "Infoblox",
    hwModel: "NIOS 8.6 (IB-4010)",
    layer: "IT Infrastructure",
    status: "UP",
    osVersion: "NIOS 8.6.2",
    serialNumber: "IB4010HW0001",
    procurementDate: "2022-08-01",
    eolDate: "2030-08-01",
    supportExpiry: "2028-08-01",
    rackUnit: "HNL1-DC1-RACK09-U1",
    powerConsumptionW: 340,
    uptime: "220d 4h",
    lastCommit: { date: "2026-03-01T08:00:00Z", user: "netops-hw" },
    features: ["DNS","DHCP","IPAM","DNSSEC","RPZ","Grid-Master"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "IB-PSU-350W", watts: 350, status: "OK" },
      { id: "PSU-1", model: "IB-PSU-350W", watts: 350, status: "OK" },
    ],
    interfaces: [
      { name: "eth0", ip: "10.20.0.80/24", speed: "1G", mtu: 1500, operStatus: "UP", peer: "mgmt-switch", lastFlap: null },
      { name: "eth1", ip: "10.20.9.80/30", speed: "1G", mtu: 1500, operStatus: "UP", peer: "dns-vlan",    lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-dns"],
    goldenConfig: `# hw-hnl1-dns-01 — Infoblox NIOS 8.6 | DNS Primary | IB-4010
# Grid Master — Primary DNS for vodafone.hw zones
# HA Pair with hw-hnl1-dns-02 (Grid Member)
set hostname hw-hnl1-dns-01
set network interface eth0 10.20.0.80 netmask 255.255.255.0
set network defaultgw 10.20.0.1
set ntp server 10.20.0.90
# DNS views configured via GUI / API`,
  },

  {
    id: "hw-hnl1-dns-02",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-dns-02.vodafone.hw",
    vendor: "Infoblox",
    hwModel: "NIOS 8.6 (IB-4010)",
    layer: "IT Infrastructure",
    status: "UP",
    osVersion: "NIOS 8.6.2",
    serialNumber: "IB4010HW0002",
    procurementDate: "2022-08-01",
    eolDate: "2030-08-01",
    supportExpiry: "2028-08-01",
    rackUnit: "HNL1-DC1-RACK09-U3",
    powerConsumptionW: 340,
    uptime: "220d 4h",
    lastCommit: { date: "2026-03-01T08:05:00Z", user: "netops-hw" },
    features: ["DNS","DHCP","IPAM","Grid-Member"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "IB-PSU-350W", watts: 350, status: "OK" },
      { id: "PSU-1", model: "IB-PSU-350W", watts: 350, status: "OK" },
    ],
    interfaces: [
      { name: "eth0", ip: "10.20.0.81/24", speed: "1G", mtu: 1500, operStatus: "UP", peer: "mgmt-switch", lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-dns"],
    goldenConfig: `# hw-hnl1-dns-02 — Infoblox NIOS 8.6 | DNS Secondary | Grid Member`,
  },

  {
    id: "hw-hnl2-dns-01",
    siteId: "hw-hnl2-dc2",
    country: "HW",
    hostname: "hw-hnl2-dns-01.vodafone.hw",
    vendor: "Infoblox",
    hwModel: "NIOS 8.6 (IB-2210)",
    layer: "IT Infrastructure",
    status: "UP",
    osVersion: "NIOS 8.6.2",
    serialNumber: "IB2210HW0003",
    procurementDate: "2022-09-01",
    eolDate: "2030-09-01",
    supportExpiry: "2028-09-01",
    rackUnit: "HNL2-DC2-RACK06-U1",
    powerConsumptionW: 200,
    uptime: "215d 2h",
    lastCommit: { date: "2026-02-28T09:00:00Z", user: "netops-hw" },
    features: ["DNS","DHCP","Grid-Member-DR"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "IB-PSU-200W", watts: 200, status: "OK" },
      { id: "PSU-1", model: "IB-PSU-200W", watts: 200, status: "OK" },
    ],
    interfaces: [
      { name: "eth0", ip: "10.20.0.82/24", speed: "1G", mtu: 1500, operStatus: "UP", peer: "mgmt-switch", lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-dns"],
    goldenConfig: `# hw-hnl2-dns-01 — Infoblox NIOS 8.6 | DNS DR (HNL2) | Grid Member`,
  },

  {
    id: "hw-hnl1-ntp-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-ntp-01.vodafone.hw",
    vendor: "Microsemi",
    hwModel: "SyncServer S650",
    layer: "IT Infrastructure",
    status: "UP",
    osVersion: "S650-FW 4.8.6",
    serialNumber: "MS650HW0001",
    procurementDate: "2021-10-01",
    eolDate: "2031-10-01",
    supportExpiry: "2029-10-01",
    rackUnit: "HNL1-DC1-RACK09-U5",
    powerConsumptionW: 35,
    uptime: "280d 0h",
    lastCommit: { date: "2025-10-01T00:00:00Z", user: "netops-hw" },
    features: ["GPS-Stratum1","NTP","PTP","Stratum-2-out"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "S650-PSU-AC", watts: 40, status: "OK" },
    ],
    interfaces: [
      { name: "eth0", ip: "10.20.0.90/24", speed: "1G", mtu: 1500, operStatus: "UP", peer: "ntp-vlan", lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-ntp"],
    goldenConfig: `# hw-hnl1-ntp-01 — Microsemi SyncServer S650 | NTP Stratum-1 | GPS-disciplined
# Stratum-2 clients: all network devices in HW AS65002
# PTP domain 0 — IEEE 1588-2008
server 10.20.0.90`,
  },

  {
    id: "hw-hnl1-ntp-02",
    siteId: "hw-hnl2-dc2",
    country: "HW",
    hostname: "hw-hnl1-ntp-02.vodafone.hw",
    vendor: "Microsemi",
    hwModel: "SyncServer S650",
    layer: "IT Infrastructure",
    status: "UP",
    osVersion: "S650-FW 4.8.6",
    serialNumber: "MS650HW0002",
    procurementDate: "2021-10-01",
    eolDate: "2031-10-01",
    supportExpiry: "2029-10-01",
    rackUnit: "HNL2-DC2-RACK06-U3",
    powerConsumptionW: 35,
    uptime: "280d 0h",
    lastCommit: { date: "2025-10-01T00:00:00Z", user: "netops-hw" },
    features: ["GPS-Stratum1","NTP","PTP","Stratum-2-out"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "S650-PSU-AC", watts: 40, status: "OK" },
    ],
    interfaces: [
      { name: "eth0", ip: "10.20.0.91/24", speed: "1G", mtu: 1500, operStatus: "UP", peer: "ntp-vlan", lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-ntp"],
    goldenConfig: `# hw-hnl1-ntp-02 — Microsemi SyncServer S650 | NTP Stratum-1 Backup (HNL2) | GPS-disciplined`,
  },

  {
    id: "hw-hnl1-aaa-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-aaa-01.vodafone.hw",
    vendor: "Cisco",
    hwModel: "ISE 3595",
    layer: "IT Infrastructure",
    status: "UP",
    osVersion: "Cisco ISE 3.2 patch 5",
    serialNumber: "FCH2248ISE01",
    procurementDate: "2022-07-15",
    eolDate: "2030-07-15",
    supportExpiry: "2028-07-15",
    rackUnit: "HNL1-DC1-RACK09-U7",
    powerConsumptionW: 650,
    uptime: "188d 9h",
    lastCommit: { date: "2026-03-08T10:00:00Z", user: "sec-ops-hw" },
    features: ["RADIUS","TACACS+","802.1X","SGT","TrustSec","pxGrid","Primary"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "ISE-3595-PSU", watts: 650, status: "OK" },
      { id: "PSU-1", model: "ISE-3595-PSU", watts: 650, status: "OK" },
    ],
    interfaces: [
      { name: "eth0", ip: "10.20.0.95/24", speed: "1G", mtu: 1500, operStatus: "UP", peer: "mgmt-switch", lastFlap: null },
      { name: "eth1", ip: "10.20.9.95/30", speed: "1G", mtu: 1500, operStatus: "UP", peer: "radius-vlan",  lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-aaa"],
    goldenConfig: `# hw-hnl1-aaa-01 — Cisco ISE 3595 | AAA Primary | ISE 3.2p5
# RADIUS for all network devices in HW AS65002
# TACACS+ for device management auth
# 802.1X for LAN access control
# Deployment mode: Primary Policy Administration Node (PAN)
hostname hw-hnl1-aaa-01
ip address 10.20.0.95/24
gateway 10.20.0.1`,
  },

  {
    id: "hw-hnl1-aaa-02",
    siteId: "hw-hnl2-dc2",
    country: "HW",
    hostname: "hw-hnl1-aaa-02.vodafone.hw",
    vendor: "Cisco",
    hwModel: "ISE 3595",
    layer: "IT Infrastructure",
    status: "UP",
    osVersion: "Cisco ISE 3.2 patch 5",
    serialNumber: "FCH2248ISE02",
    procurementDate: "2022-07-15",
    eolDate: "2030-07-15",
    supportExpiry: "2028-07-15",
    rackUnit: "HNL2-DC2-RACK06-U7",
    powerConsumptionW: 650,
    uptime: "188d 9h",
    lastCommit: { date: "2026-03-08T10:05:00Z", user: "sec-ops-hw" },
    features: ["RADIUS","TACACS+","802.1X","Secondary-PSN"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "ISE-3595-PSU", watts: 650, status: "OK" },
      { id: "PSU-1", model: "ISE-3595-PSU", watts: 650, status: "OK" },
    ],
    interfaces: [
      { name: "eth0", ip: "10.20.0.96/24", speed: "1G", mtu: 1500, operStatus: "UP", peer: "mgmt-switch", lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-aaa"],
    goldenConfig: `# hw-hnl1-aaa-02 — Cisco ISE 3595 | AAA Secondary | ISE 3.2p5
# Secondary Policy Service Node (PSN) at HNL2-DC2
hostname hw-hnl1-aaa-02
ip address 10.20.0.96/24`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NMS PLATFORM
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-nms-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-nms-01.vodafone.hw",
    vendor: "Dell",
    hwModel: "PowerEdge R750",
    layer: "NMS Platform",
    status: "UP",
    osVersion: "RHEL 9.2 / Zabbix 6.4",
    serialNumber: "DELL750HW001",
    procurementDate: "2022-10-01",
    eolDate: "2030-10-01",
    supportExpiry: "2028-10-01",
    rackUnit: "HNL1-DC1-RACK10-U1",
    powerConsumptionW: 680,
    uptime: "175d 3h",
    lastCommit: { date: "2026-03-20T08:00:00Z", user: "nms-admin-hw" },
    features: ["Zabbix","SNMP-Collector","Syslog","NetFlow","Grafana","AlertManager"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "DELL-PS-800W", watts: 800, status: "OK" },
      { id: "PSU-1", model: "DELL-PS-800W", watts: 800, status: "OK" },
    ],
    interfaces: [
      { name: "eno1", ip: "10.20.0.100/24", speed: "10G", mtu: 1500, operStatus: "UP", peer: "mgmt-switch", lastFlap: null },
      { name: "eno2", ip: "10.20.9.100/30", speed: "10G", mtu: 1500, operStatus: "UP", peer: "nms-vlan",    lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-it-services"],
    goldenConfig: `# hw-hnl1-nms-01 — Dell PowerEdge R750 | NMS Primary | RHEL 9.2
# Zabbix Server + Grafana + NetFlow collector
# Monitors: all 36 HW nodes via SNMP v3
# Alerting: PagerDuty + email via SMTP relay
HOSTNAME=hw-hnl1-nms-01
IP=10.20.0.100/24
GW=10.20.0.1
DNS=10.20.0.80`,
  },

  {
    id: "hw-hnl1-nms-02",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-nms-02.vodafone.hw",
    vendor: "Dell",
    hwModel: "PowerEdge R750",
    layer: "NMS Platform",
    status: "DEGRADED",
    osVersion: "RHEL 9.2 / Zabbix 6.4",
    serialNumber: "DELL750HW002",
    procurementDate: "2022-10-01",
    eolDate: "2030-10-01",
    supportExpiry: "2028-10-01",
    rackUnit: "HNL1-DC1-RACK10-U3",
    powerConsumptionW: 680,
    uptime: "175d 3h",
    lastCommit: { date: "2026-03-20T08:05:00Z", user: "nms-admin-hw" },
    features: ["Zabbix-Proxy","Syslog-Secondary","Disk-IO-Alert"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "DELL-PS-800W", watts: 800, status: "OK" },
      { id: "PSU-1", model: "DELL-PS-800W", watts: 800, status: "OK" },
    ],
    interfaces: [
      { name: "eno1", ip: "10.20.0.101/24", speed: "10G", mtu: 1500, operStatus: "UP",       peer: "mgmt-switch",   lastFlap: null },
      { name: "eno2", ip: "10.20.9.101/30", speed: "10G", mtu: 1500, operStatus: "DEGRADED", peer: "nms-vlan",      lastFlap: "2026-03-24T15:30:00Z" },
    ],
    bgpNeighbors: [],
    services: ["hw-it-services"],
    goldenConfig: `# hw-hnl1-nms-02 — Dell PowerEdge R750 | NMS Secondary | RHEL 9.2
# *** DEGRADED: Disk I/O saturation on /var/log — write latency >200ms since 15:30Z ***
# *** Action required: review log rotation policy and disk capacity ***
HOSTNAME=hw-hnl1-nms-02
IP=10.20.0.101/24`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BSS PLATFORM
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "hw-hnl1-bss-01",
    siteId: "hw-hnl1-dc1",
    country: "HW",
    hostname: "hw-hnl1-bss-01.vodafone.hw",
    vendor: "Dell",
    hwModel: "PowerEdge R850",
    layer: "BSS Platform",
    status: "UP",
    osVersion: "RHEL 9.2 / Oracle DB 19c",
    serialNumber: "DELL850HW001",
    procurementDate: "2023-01-01",
    eolDate: "2031-01-01",
    supportExpiry: "2029-01-01",
    rackUnit: "HNL1-DC1-RACK11-U1",
    powerConsumptionW: 1200,
    uptime: "88d 5h",
    lastCommit: { date: "2026-03-15T07:00:00Z", user: "bss-admin-hw" },
    features: ["BSS","CRM","Billing","Provisioning","Oracle-RAC"],
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "DELL-PS-1600W", watts: 1600, status: "OK" },
      { id: "PSU-1", model: "DELL-PS-1600W", watts: 1600, status: "OK" },
    ],
    interfaces: [
      { name: "eno1", ip: "10.20.0.110/24", speed: "10G", mtu: 1500, operStatus: "UP", peer: "mgmt-switch", lastFlap: null },
      { name: "eno2", ip: "10.20.2.110/24", speed: "10G", mtu: 9000, operStatus: "UP", peer: "storage-san",  lastFlap: null },
    ],
    bgpNeighbors: [],
    services: ["hw-it-services"],
    goldenConfig: `# hw-hnl1-bss-01 — Dell PowerEdge R850 | BSS Platform | RHEL 9.2
# Oracle DB 19c RAC — BSS/CRM/Billing primary node
HOSTNAME=hw-hnl1-bss-01
IP=10.20.0.110/24
GW=10.20.0.1`,
  },

];
