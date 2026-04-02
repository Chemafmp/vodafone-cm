// ─── FIJI NODES ─────────────────────────────────────────────────────────────
// AS 65001 · Mgmt 10.10.0.0/16 · P2P 10.1.0.0/16 · Loopbacks 172.16.1.x
// 23 nodes total (12 existing enriched + 11 new)

export const NODES_FJ = [

  // ═══════════════════════════════════════════════════════════════════════════
  // IP CORE — Suva
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fj-suva-cr-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-cr-01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "ASR 9922",
    layer: "IP Core",
    role: "cr",
    mgmtIp: "10.10.1.1",
    status: "UP",
    osVersion: "IOS-XR 7.5.2",
    patches: [
      { id: "asr9k-sysadmin-7.5.2.CSCwi33901", type: "SMU", desc: "LPTS policer rate fix for BFD scale", installedDate: "2026-01-20", installedBy: "netops" },
      { id: "asr9k-os-7.5.2.CSCwi44502", type: "SMU", desc: "ISIS adjacency flap under ECMP", installedDate: "2026-02-12", installedBy: "netops" },
      { id: "asr9k-security-7.5.2.CSCwi55123", type: "Security", desc: "CVE-2025-39821 SSH key exchange vuln", installedDate: "2026-03-05", installedBy: "secops" },
    ],
    serialNumber: "FXS2411Q1A7",
    procurementDate: "2021-03-15",
    eolDate: "2031-03-15",
    supportExpiry: "2029-03-15",
    rackUnit: "DC1-ROW1-RACK01-U1",
    powerConsumptionW: 3200,
    lastCommit: { date: "2026-03-10T14:22:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "A9K-8X100GE-L", description: "8-port 100GE Line Card", ports: 8, portType: "100GE QSFP28", status: "OK" },
      { slot: 1, model: "A9K-24X10GE-1G-SE", description: "24-port 10GE Line Card", ports: 24, portType: "10GE SFP+", status: "OK" },
      { slot: 2, model: "A9K-24X10GE-1G-SE", description: "24-port 10GE Line Card", ports: 24, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "A9K-3KW-AC", status: "OK", watts: 3000 },
      { id: "PSU-1", model: "A9K-3KW-AC", status: "OK", watts: 3000 },
    ],
    interfaces: [
      { name: "Loopback0",               ip: "172.16.1.1/32",     description: "Router ID / RR endpoint",               peer: null,                  operStatus: "UP",    speed: "1G",   mtu: 65535, lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/0",  ip: "10.1.0.1/30",       description: "CORE >> fj-suva-cr-02 Gi0/0/0/0",       peer: "fj-suva-cr-02",       operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/1",  ip: "10.1.0.5/30",       description: "CORE >> fj-suva-pe-01 Gi0/0/0/0",       peer: "fj-suva-pe-01",       operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/2",  ip: "10.1.0.9/30",       description: "UPLINK >> fj-suva-igw-01 xe-0/0/1",     peer: "fj-suva-igw-01",      operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/3",  ip: "10.1.0.17/30",      description: "CORE >> fj-lautoka-pe-01 Gi0/0/0/0",    peer: "fj-lautoka-pe-01",    operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/4",  ip: "10.1.4.2/30",       description: "BPOP >> fj-suva-bpop-01 eth1",          peer: "fj-suva-bpop-01",     operStatus: "UP",    speed: "1G",   mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "MgmtEth0/0/CPU0/0",       ip: "10.10.1.1/16",      description: "OOB Management",                        peer: null,                  operStatus: "UP",    speed: "1G",   mtu: 1500,  lastFlap: null,               vlan: null },
    ],
    bgpNeighbors: [
      { ip: "172.16.1.12", asn: 65001, description: "iBGP >> fj-suva-cr-02",      state: "Established", prefixesRx: 38,  prefixesTx: 42,  uptime: "47d 03h 11m" },
      { ip: "172.16.1.2",  asn: 65001, description: "iBGP >> fj-lautoka-pe-01",   state: "Established", prefixesRx: 22,  prefixesTx: 42,  uptime: "47d 03h 09m" },
      { ip: "172.16.1.3",  asn: 65001, description: "iBGP >> fj-suva-pe-01",      state: "Established", prefixesRx: 18,  prefixesTx: 42,  uptime: "47d 03h 10m" },
      { ip: "172.16.1.10", asn: 65001, description: "iBGP >> fj-suva-igw-01",     state: "Established", prefixesRx: 850, prefixesTx: 5,   uptime: "47d 03h 08m" },
    ],
    services: ["fj-internet-transit", "fj-5g-data", "fj-mpls-vpn"],
    goldenConfig: `! fj-suva-cr-01.vodafone.fj
! Cisco ASR 9922 | IP Core | AS 65001
! Last commit: 2026-03-10 14:22 UTC by netops
!
hostname fj-suva-cr-01
domain name vodafone.fj
!
interface Loopback0
 description ** Router ID / RR endpoint **
 ipv4 address 172.16.1.1 255.255.255.255
!
interface GigabitEthernet0/0/0/0
 description ** CORE >> fj-suva-cr-02 Gi0/0/0/0 **
 ipv4 address 10.1.0.1 255.255.255.252
 no shutdown
!
interface GigabitEthernet0/0/0/1
 description ** CORE >> fj-suva-pe-01 Gi0/0/0/0 **
 ipv4 address 10.1.0.5 255.255.255.252
 no shutdown
!
interface GigabitEthernet0/0/0/2
 description ** UPLINK >> fj-suva-igw-01 xe-0/0/1 **
 ipv4 address 10.1.0.9 255.255.255.252
 no shutdown
!
interface GigabitEthernet0/0/0/3
 description ** CORE >> fj-lautoka-pe-01 **
 ipv4 address 10.1.0.17 255.255.255.252
 no shutdown
!
interface GigabitEthernet0/0/0/4
 description ** BPOP >> fj-suva-bpop-01 **
 ipv4 address 10.1.4.2 255.255.255.252
 no shutdown
!
interface MgmtEth0/0/CPU0/0
 description ** OOB Management **
 ipv4 address 10.10.1.1 255.255.0.0
 no shutdown
!
router ospf 1
 router-id 172.16.1.1
 area 0
  interface Loopback0
   passive enable
  !
  interface GigabitEthernet0/0/0/0
   cost 10
  !
  interface GigabitEthernet0/0/0/1
   cost 10
  !
  interface GigabitEthernet0/0/0/3
   cost 10
  !
 !
!
router bgp 65001
 bgp router-id 172.16.1.1
 !
 neighbor-group IBGP-RR
  remote-as 65001
  update-source Loopback0
  address-family ipv4 unicast
   next-hop-self
  !
  address-family vpnv4 unicast
  !
 !
 neighbor 172.16.1.12
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-suva-cr-02 **
 !
 neighbor 172.16.1.2
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-lautoka-pe-01 **
 !
 neighbor 172.16.1.3
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-suva-pe-01 **
 !
 neighbor 172.16.1.10
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-suva-igw-01 **
 !
 neighbor 172.16.1.11
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-suva-igw-02 **
 !
!
mpls ldp
 router-id 172.16.1.1
 interface GigabitEthernet0/0/0/0
 !
 interface GigabitEthernet0/0/0/1
 !
 interface GigabitEthernet0/0/0/3
 !
!
snmp-server community BNOC-RO RO
snmp-server community BNOC-RW RW
ntp server 10.10.1.65
logging 10.10.1.80
!
end`,
  },

  {
    id: "fj-suva-cr-02",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-cr-02.vodafone.fj",
    vendor: "Cisco",
    hwModel: "ASR 9001",
    layer: "IP Core",
    role: "cr",
    mgmtIp: "10.10.1.2",
    status: "UP",
    osVersion: "IOS-XR 7.5.2",
    serialNumber: "FXS2409R0C3",
    procurementDate: "2022-06-20",
    eolDate: "2029-06-20",
    supportExpiry: "2027-06-20",
    rackUnit: "DC1-ROW1-RACK02-U1",
    powerConsumptionW: 1800,
    lastCommit: { date: "2026-03-10T14:25:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "A9K-4T16GE-SE", description: "4-port 10GE + 16-port 1GE", ports: 20, portType: "10GE SFP+/1GE SFP", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "A9K-750W-AC", status: "OK",  watts: 750 },
      { id: "PSU-1", model: "A9K-750W-AC", status: "OK",  watts: 750 },
    ],
    interfaces: [
      { name: "Loopback0",               ip: "172.16.1.12/32",    description: "Router ID",                              peer: null,                  operStatus: "UP",    speed: "1G",   mtu: 65535, lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/0",  ip: "10.1.0.2/30",       description: "CORE >> fj-suva-cr-01 Gi0/0/0/0",       peer: "fj-suva-cr-01",       operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/1",  ip: "10.1.0.25/30",      description: "CORE >> fj-suva-cr-01 (secondary)",      peer: "fj-suva-cr-01",       operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/2",  ip: "10.1.0.29/30",      description: "CORE >> fj-lautoka-pe-01 (secondary)",   peer: "fj-lautoka-pe-01",    operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/3",  ip: "10.1.0.13/30",      description: "UPLINK >> fj-suva-igw-02 xe-0/0/2",     peer: "fj-suva-igw-02",      operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "MgmtEth0/0/CPU0/0",       ip: "10.10.1.2/16",      description: "OOB Management",                        peer: null,                  operStatus: "UP",    speed: "1G",   mtu: 1500,  lastFlap: null,               vlan: null },
    ],
    bgpNeighbors: [
      { ip: "172.16.1.1",  asn: 65001, description: "iBGP >> fj-suva-cr-01",      state: "Established", prefixesRx: 42,  prefixesTx: 38,  uptime: "47d 03h 10m" },
      { ip: "172.16.1.2",  asn: 65001, description: "iBGP >> fj-lautoka-pe-01",   state: "Established", prefixesRx: 22,  prefixesTx: 38,  uptime: "47d 02h 58m" },
      { ip: "172.16.1.11", asn: 65001, description: "iBGP >> fj-suva-igw-02",     state: "Established", prefixesRx: 820, prefixesTx: 5,   uptime: "47d 03h 01m" },
    ],
    services: ["fj-internet-transit", "fj-mpls-vpn"],
    goldenConfig: `! fj-suva-cr-02.vodafone.fj
! Cisco ASR 9001 | IP Core | AS 65001 — redundant core
! Last commit: 2026-03-10 14:25 UTC by netops
!
hostname fj-suva-cr-02
domain name vodafone.fj
!
interface Loopback0
 description ** Router ID **
 ipv4 address 172.16.1.12 255.255.255.255
!
interface GigabitEthernet0/0/0/0
 description ** CORE >> fj-suva-cr-01 (primary) **
 ipv4 address 10.1.0.2 255.255.255.252
 no shutdown
!
interface GigabitEthernet0/0/0/1
 description ** CORE >> fj-suva-cr-01 (secondary link) **
 ipv4 address 10.1.0.25 255.255.255.252
 no shutdown
!
interface GigabitEthernet0/0/0/2
 description ** CORE >> fj-lautoka-pe-01 (secondary path) **
 ipv4 address 10.1.0.29 255.255.255.252
 no shutdown
!
interface GigabitEthernet0/0/0/3
 description ** UPLINK >> fj-suva-igw-02 xe-0/0/2 **
 ipv4 address 10.1.0.13 255.255.255.252
 no shutdown
!
interface MgmtEth0/0/CPU0/0
 description ** OOB Management **
 ipv4 address 10.10.1.2 255.255.0.0
 no shutdown
!
router ospf 1
 router-id 172.16.1.12
 area 0
  interface Loopback0
   passive enable
  interface GigabitEthernet0/0/0/0
   cost 10
  interface GigabitEthernet0/0/0/1
   cost 20
  interface GigabitEthernet0/0/0/2
   cost 15
 !
!
router bgp 65001
 bgp router-id 172.16.1.12
 neighbor-group IBGP-RR
  remote-as 65001
  update-source Loopback0
  address-family ipv4 unicast
   next-hop-self
  address-family vpnv4 unicast
 !
 neighbor 172.16.1.1
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-suva-cr-01 **
 neighbor 172.16.1.2
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-lautoka-pe-01 **
 neighbor 172.16.1.11
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-suva-igw-02 **
!
mpls ldp
 router-id 172.16.1.12
 interface GigabitEthernet0/0/0/0
 interface GigabitEthernet0/0/0/2
!
snmp-server community BNOC-RO RO
ntp server 10.10.1.65
logging 10.10.1.80
! ... [truncated] ...`,
  },

  {
    id: "fj-suva-pe-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-pe-01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "ASR 9001",
    layer: "IP Core",
    role: "pe",
    mgmtIp: "10.10.1.3",
    status: "UP",
    osVersion: "IOS-XR 7.3.4",
    serialNumber: "FXS2108P2B1",
    procurementDate: "2020-08-10",
    eolDate: "2029-08-10",
    supportExpiry: "2027-08-10",
    rackUnit: "DC1-ROW1-RACK03-U1",
    powerConsumptionW: 1600,
    lastCommit: { date: "2026-02-22T09:15:00Z", user: "lmere" },
    lineCards: [
      { slot: 0, model: "A9K-4T16GE-SE", description: "4-port 10GE + 16-port 1GE", ports: 20, portType: "10GE SFP+/1GE SFP", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "A9K-750W-AC", status: "OK",  watts: 750 },
      { id: "PSU-1", model: "A9K-750W-AC", status: "OK",  watts: 750 },
    ],
    interfaces: [
      { name: "Loopback0",               ip: "172.16.1.3/32",    description: "Router ID",                             peer: null,                    operStatus: "UP",    speed: "1G",   mtu: 65535, lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/0",  ip: "10.1.0.6/30",      description: "CORE >> fj-suva-cr-01 Gi0/0/0/1",      peer: "fj-suva-cr-01",         operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/1",  ip: "10.1.1.1/30",      description: "CORE >> fj-lautoka-pe-01 Gi0/0/0/1",   peer: "fj-lautoka-pe-01",      operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/2",  ip: "10.1.2.1/30",      description: "DC >> fj-suva-dc-fabric-01 Eth1/1",    peer: "fj-suva-dc-fabric-01",  operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/0/0/3",  ip: "10.1.6.1/30",      description: "VOICE >> fj-suva-voip-gw-01",          peer: "fj-suva-voip-gw-01",    operStatus: "UP",    speed: "1G",   mtu: 1500,  lastFlap: null,               vlan: null },
      { name: "MgmtEth0/0/CPU0/0",       ip: "10.10.1.3/16",     description: "OOB Management",                       peer: null,                    operStatus: "UP",    speed: "1G",   mtu: 1500,  lastFlap: null,               vlan: null },
    ],
    bgpNeighbors: [
      { ip: "172.16.1.1",  asn: 65001, description: "iBGP >> fj-suva-cr-01",    state: "Established", prefixesRx: 42,  prefixesTx: 18,  uptime: "47d 03h 09m" },
      { ip: "172.16.1.2",  asn: 65001, description: "iBGP >> fj-lautoka-pe-01", state: "Established", prefixesRx: 22,  prefixesTx: 18,  uptime: "42d 16h 22m" },
    ],
    services: ["fj-voice-core", "fj-mpls-vpn"],
    goldenConfig: `! fj-suva-pe-01.vodafone.fj — Cisco ASR 9001 | IP Core (PE)
! Last commit: 2026-02-22 09:15 UTC by lmere
!
hostname fj-suva-pe-01
!
interface Loopback0
 description ** Router ID **
 ipv4 address 172.16.1.3 255.255.255.255
!
interface GigabitEthernet0/0/0/0
 description ** CORE >> fj-suva-cr-01 **
 ipv4 address 10.1.0.6 255.255.255.252
!
interface GigabitEthernet0/0/0/1
 description ** CORE >> fj-lautoka-pe-01 **
 ipv4 address 10.1.1.1 255.255.255.252
!
interface GigabitEthernet0/0/0/2
 description ** DC >> fj-suva-dc-fabric-01 **
 ipv4 address 10.1.2.1 255.255.255.252
!
vrf ENTERPRISE
 address-family ipv4 unicast
  import route-target 65001:100
  export route-target 65001:100
 !
!
vrf VOICE
 address-family ipv4 unicast
  import route-target 65001:200
  export route-target 65001:200
!
router ospf 1
 router-id 172.16.1.3
 area 0
  interface Loopback0
   passive enable
  interface GigabitEthernet0/0/0/0
  interface GigabitEthernet0/0/0/1
!
router bgp 65001
 bgp router-id 172.16.1.3
 neighbor 172.16.1.1 remote-as 65001
  description ** iBGP >> fj-suva-cr-01 **
  update-source Loopback0
 neighbor 172.16.1.2 remote-as 65001
  description ** iBGP >> fj-lautoka-pe-01 **
  update-source Loopback0
!
mpls ldp
 router-id 172.16.1.3
! ... [truncated] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNET GATEWAYS — Suva
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fj-suva-igw-01",
    siteId: "fj-suva-ixp1",
    country: "FJ",
    hostname: "fj-suva-igw-01.vodafone.fj",
    vendor: "Juniper",
    hwModel: "MX204",
    layer: "Internet GW",
    role: "igw",
    mgmtIp: "10.10.4.1",
    status: "UP",
    osVersion: "JunOS 23.4R1.9",
    serialNumber: "JN2318BB0ADC",
    procurementDate: "2022-01-20",
    eolDate: "2030-01-20",
    supportExpiry: "2028-01-20",
    rackUnit: "DC1-ROW3-RACK01-U14",
    powerConsumptionW: 850,
    lastCommit: { date: "2026-03-05T08:40:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "MX204-BUILT-IN", description: "4x100GE + 8x10GE built-in", ports: 12, portType: "100GE QSFP28 / 10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "JPSU-850W-AC-AFO", status: "OK", watts: 850 },
      { id: "PSU-1", model: "JPSU-850W-AC-AFO", status: "OK", watts: 850 },
    ],
    interfaces: [
      { name: "lo0.0",     ip: "172.16.1.10/32",   description: "Loopback / Router ID",             peer: null,              operStatus: "UP",    speed: "1G",   mtu: 65535, lastFlap: null,               vlan: null },
      { name: "xe-0/0/0",  ip: "10.1.0.10/30",     description: "CORE << fj-suva-cr-01 Gi0/0/0/2",  peer: "fj-suva-cr-01",   operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "xe-0/0/1",  ip: "203.17.128.2/30",  description: "UPSTREAM Telstra AS1221",           peer: null,              operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "xe-0/0/2",  ip: "10.1.5.2/30",      description: "N6 << fj-suva-5gc-01 eth1",         peer: "fj-suva-5gc-01",  operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "em0",       ip: "10.10.4.1/16",     description: "OOB Management",                   peer: null,              operStatus: "UP",    speed: "1G",   mtu: 1500,  lastFlap: null,               vlan: null },
    ],
    bgpNeighbors: [
      { ip: "203.17.128.1", asn: 1221,  description: "UPSTREAM Telstra",        state: "Established", prefixesRx: 850, prefixesTx: 12,  uptime: "112d 07h 33m" },
      { ip: "172.16.1.1",   asn: 65001, description: "iBGP >> fj-suva-cr-01",   state: "Established", prefixesRx: 5,   prefixesTx: 850, uptime: "47d 03h 08m"  },
      { ip: "172.16.1.12",  asn: 65001, description: "iBGP >> fj-suva-cr-02",   state: "Established", prefixesRx: 5,   prefixesTx: 850, uptime: "47d 03h 01m"  },
    ],
    services: ["fj-internet-transit"],
    goldenConfig: `set system host-name fj-suva-igw-01
set system domain-name vodafone.fj
set system ntp server 10.10.1.65
set system login message "** AUTHORISED ACCESS ONLY - Vodafone Fiji Network **"

set interfaces lo0 unit 0 family inet address 172.16.1.10/32 primary
set interfaces xe-0/0/0 description "CORE << fj-suva-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.1.0.10/30
set interfaces xe-0/0/1 description "UPSTREAM Telstra AS1221"
set interfaces xe-0/0/1 unit 0 family inet address 203.17.128.2/30
set interfaces xe-0/0/2 description "N6 << fj-suva-5gc-01"
set interfaces xe-0/0/2 unit 0 family inet address 10.1.5.2/30
set interfaces em0 unit 0 family inet address 10.10.4.1/16

set protocols bgp group UPSTREAM-TELSTRA type external
set protocols bgp group UPSTREAM-TELSTRA peer-as 1221
set protocols bgp group UPSTREAM-TELSTRA neighbor 203.17.128.1 description "Telstra upstream AS1221"
set protocols bgp group UPSTREAM-TELSTRA neighbor 203.17.128.1 import ACCEPT-DEFAULT
set protocols bgp group UPSTREAM-TELSTRA neighbor 203.17.128.1 export EXPORT-VODAFONE-FJ

set protocols bgp group IBGP type internal
set protocols bgp group IBGP local-address 172.16.1.10
set protocols bgp group IBGP neighbor 172.16.1.1 description "fj-suva-cr-01"
set protocols bgp group IBGP neighbor 172.16.1.12 description "fj-suva-cr-02"

set routing-options router-id 172.16.1.10
set routing-options autonomous-system 65001
set routing-options static route 0.0.0.0/0 next-hop 203.17.128.1

set policy-options policy-statement EXPORT-VODAFONE-FJ term 1 from route-filter 180.200.0.0/19 orlonger
set policy-options policy-statement EXPORT-VODAFONE-FJ term 1 then accept
set policy-options policy-statement EXPORT-VODAFONE-FJ term default then reject
set policy-options policy-statement ACCEPT-DEFAULT term 1 from route-filter 0.0.0.0/0 exact
set policy-options policy-statement ACCEPT-DEFAULT term 1 then accept

set snmp community BNOC-RO authorization read-only
set snmp trap-group BNOC-TRAPS targets 10.10.1.80`,
  },

  {
    id: "fj-suva-igw-02",
    siteId: "fj-suva-ixp2",
    country: "FJ",
    hostname: "fj-suva-igw-02.vodafone.fj",
    vendor: "Juniper",
    hwModel: "MX104",
    layer: "Internet GW",
    role: "igw",
    mgmtIp: "10.10.4.2",
    status: "UP",
    osVersion: "JunOS 21.4R3.15",
    serialNumber: "JN1947CC2EBF",
    procurementDate: "2019-11-05",
    eolDate: "2027-11-05",
    supportExpiry: "2026-11-05",
    rackUnit: "DC1-ROW3-RACK02-U14",
    powerConsumptionW: 650,
    lastCommit: { date: "2026-02-18T11:30:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "MX104-BUILT-IN", description: "4x10GE SFP+ built-in", ports: 4, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "JPSU-650W-AC", status: "OK",  watts: 650 },
      { id: "PSU-1", model: "JPSU-650W-AC", status: "OK",  watts: 650 },
    ],
    interfaces: [
      { name: "lo0.0",     ip: "172.16.1.11/32",  description: "Loopback / Router ID",              peer: null,              operStatus: "UP",    speed: "1G",   mtu: 65535, lastFlap: null,               vlan: null },
      { name: "xe-0/0/0",  ip: "10.1.0.14/30",    description: "CORE << fj-suva-cr-01 Gi0/0/0/3",   peer: "fj-suva-cr-01",   operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "xe-0/0/1",  ip: "129.250.0.2/30",  description: "UPSTREAM PCCW AS3491",              peer: null,              operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "xe-0/0/2",  ip: "10.1.0.14/30",    description: "CORE << fj-suva-cr-02 Gi0/0/0/3",   peer: "fj-suva-cr-02",   operStatus: "UP",    speed: "10G",  mtu: 9000,  lastFlap: null,               vlan: null },
      { name: "em0",       ip: "10.10.4.2/16",    description: "OOB Management",                   peer: null,              operStatus: "UP",    speed: "1G",   mtu: 1500,  lastFlap: null,               vlan: null },
    ],
    bgpNeighbors: [
      { ip: "129.250.0.1",  asn: 3491,  description: "UPSTREAM PCCW",          state: "Established", prefixesRx: 820, prefixesTx: 12,  uptime: "89d 14h 02m"  },
      { ip: "172.16.1.1",   asn: 65001, description: "iBGP >> fj-suva-cr-01",  state: "Established", prefixesRx: 5,   prefixesTx: 820, uptime: "47d 03h 08m"  },
      { ip: "172.16.1.12",  asn: 65001, description: "iBGP >> fj-suva-cr-02",  state: "Established", prefixesRx: 5,   prefixesTx: 820, uptime: "47d 03h 01m"  },
    ],
    services: ["fj-internet-transit"],
    goldenConfig: `set system host-name fj-suva-igw-02
set system domain-name vodafone.fj
set system ntp server 10.10.1.65
set system login message "** AUTHORISED ACCESS ONLY - Vodafone Fiji Network **"

set interfaces lo0 unit 0 family inet address 172.16.1.11/32 primary
set interfaces xe-0/0/0 description "CORE << fj-suva-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.1.0.14/30
set interfaces xe-0/0/1 description "UPSTREAM PCCW AS3491"
set interfaces xe-0/0/1 unit 0 family inet address 129.250.0.2/30
set interfaces xe-0/0/2 description "CORE << fj-suva-cr-02 (secondary)"
set interfaces xe-0/0/2 unit 0 family inet address 10.1.0.30/30
set interfaces em0 unit 0 family inet address 10.10.4.2/16

set protocols bgp group UPSTREAM-PCCW type external
set protocols bgp group UPSTREAM-PCCW peer-as 3491
set protocols bgp group UPSTREAM-PCCW neighbor 129.250.0.1 description "PCCW upstream AS3491"
set protocols bgp group IBGP type internal
set protocols bgp group IBGP local-address 172.16.1.11
set protocols bgp group IBGP neighbor 172.16.1.1 description "fj-suva-cr-01"
set protocols bgp group IBGP neighbor 172.16.1.12 description "fj-suva-cr-02"

set routing-options router-id 172.16.1.11
set routing-options autonomous-system 65001
set snmp community BNOC-RO authorization read-only
# ... [truncated] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 5G CORE & VOICE — Suva
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fj-suva-5gc-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-5gc-01.vodafone.fj",
    vendor: "Nokia",
    hwModel: "AirFrame Cloud",
    layer: "5G Core",
    role: "5gc",
    mgmtIp: "10.10.1.10",
    status: "UP",
    osVersion: "SR-OS 23.10.R2",
    serialNumber: "NSN-AFCL-FJ-00142",
    procurementDate: "2023-04-01",
    eolDate: "2033-04-01",
    supportExpiry: "2031-04-01",
    rackUnit: "DC1-ROW2-RACK01-U1",
    powerConsumptionW: 2400,
    lastCommit: { date: "2026-03-01T06:00:00Z", user: "5gc-admin" },
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "Nokia AC 2400W", status: "OK", watts: 2400 },
      { id: "PSU-1", model: "Nokia AC 2400W", status: "OK", watts: 2400 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.10.1.10/16", description: "OOB Management",        peer: null,              operStatus: "UP",  speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
      { name: "eth1", ip: "10.1.5.1/30",   description: "N6 >> fj-suva-igw-01",  peer: "fj-suva-igw-01",  operStatus: "UP",  speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "eth2", ip: "10.1.5.5/30",   description: "N3/N9 >> fj-suva-cr-01 (RAN user-plane)", peer: "fj-suva-cr-01", operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "eth3", ip: "10.1.5.9/30",   description: "N2 >> RAN (control-plane)",               peer: null,            operStatus: "UP", speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-5g-data"],
    goldenConfig: `# fj-suva-5gc-01.vodafone.fj — Nokia AirFrame Cloud | 5G Core
# Nokia CloudBand Infrastructure Software + Nokia CBIS
# Last commit: 2026-03-01 06:00 UTC by 5gc-admin

network-instance Base
  interface eth1
    ipv4 10.1.5.1/30
    description "N6 interface to IGW"
  interface eth2
    ipv4 10.1.5.5/30
    description "N3/N9 user-plane to RAN"
  interface eth3
    ipv4 10.1.5.9/30
    description "N2 control-plane to RAN"

nf amf
  plmn 54001
  tac 0x0001 0x0002
  s-nssai 01:000001
  n2-interface eth3

nf smf
  dnn internet
    upf-selection pool UPF-POOL-FJ
  dnn ims
    upf-selection pool UPF-POOL-FJ

nf upf
  n3-address 10.1.5.5
  n6-address 10.1.5.1
  pool UPF-POOL-FJ

nf pcf
  policy-store local
  default-qos qi=9 arp=8

nf udr
  address 10.10.1.10
  port 8080

# ... [truncated] ...`,
  },

  {
    id: "fj-suva-voip-gw-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-voip-gw-01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "CUBE 350",
    layer: "Voice Core",
    role: "voip-gw",
    mgmtIp: "10.10.1.15",
    status: "DEGRADED",
    osVersion: "IOS-XE 17.9.3a",
    serialNumber: "FGL2247A0NK",
    procurementDate: "2021-07-14",
    eolDate: "2028-07-14",
    supportExpiry: "2026-07-14",
    rackUnit: "DC1-ROW2-RACK02-U14",
    powerConsumptionW: 400,
    lastCommit: { date: "2025-11-30T16:44:00Z", user: "voice-ops" },
    lineCards: [
      { slot: 0, model: "CUBE-350-PVDM4-256", description: "PVDM4-256 DSP Module", ports: 0, portType: "DSP", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-4430-AC", status: "OK",  watts: 400 },
    ],
    interfaces: [
      { name: "GigabitEthernet0/0", ip: "10.10.1.15/16", description: "Management",           peer: null,            operStatus: "UP",    speed: "1G",  mtu: 1500, lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/1", ip: "10.1.6.1/30",   description: "SIP trunk >> pe-01",   peer: "fj-suva-pe-01", operStatus: "UP",    speed: "1G",  mtu: 1500, lastFlap: null,               vlan: null },
      { name: "GigabitEthernet0/2", ip: "10.1.6.5/30",   description: "SIP >> PSTN GW",       peer: null,            operStatus: "DEGRADED", speed: "1G", mtu: 1500, lastFlap: "2026-03-22T04:17:00Z", vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-voice-core"],
    goldenConfig: `! fj-suva-voip-gw-01.vodafone.fj — Cisco CUBE 350 | Voice Core
! *** DEGRADED: CPU 93%, Gi0/2 SIP retransmit storm — investigate ***
! Last commit: 2025-11-30 16:44 UTC by voice-ops
!
hostname fj-suva-voip-gw-01
!
voice service voip
 ip address trusted list
  ipv4 10.1.0.0 255.255.0.0
 allow-connections sip to sip
 supplementary-service h450.2
 fax protocol t38 version 0 ls-redundancy 0 hs-redundancy 0 fallback none
!
sip-ua
 credentials username vodafone-fj password 7 XXXXX realm sip.vodafone.fj
 registrar ipv4:10.1.6.2 expires 3600
 retry invite 3
 retry response 3
 retry bye 3
!
dial-peer voice 100 voip
 description ** Inbound from PSTN **
 session protocol sipv2
 session target ipv4:10.1.6.2
 codec g711ulaw
 dtmf-relay rtp-nte
!
dial-peer voice 200 voip
 description ** Outbound to PSTN **
 destination-pattern .T
 session protocol sipv2
 session target ipv4:10.1.6.2
 codec g711ulaw
! ... [truncated] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DC FABRIC & LAN — Suva
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fj-suva-dc-fabric-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-dc-fabric-01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "Nexus 9336C-FX2",
    layer: "DC Fabric",
    role: "dc-fabric",
    mgmtIp: "10.10.1.20",
    status: "UP",
    osVersion: "NX-OS 10.3(3)F",
    serialNumber: "FDO2405R0KL",
    procurementDate: "2022-09-12",
    eolDate: "2032-09-12",
    supportExpiry: "2030-09-12",
    rackUnit: "DC1-ROW1-RACK05-U14",
    powerConsumptionW: 1100,
    lastCommit: { date: "2026-01-15T10:00:00Z", user: "dc-ops" },
    lineCards: [
      { slot: 0, model: "N9K-C9336C-FX2", description: "36x100GE QSFP28 fixed", ports: 36, portType: "100GE QSFP28", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "NXA-PAC-1100W-B", status: "OK",   watts: 1100 },
      { id: "PSU-1", model: "NXA-PAC-1100W-B", status: "OK",   watts: 1100 },
    ],
    interfaces: [
      { name: "Ethernet1/1",    ip: "10.1.2.2/30",    description: "Uplink >> fj-suva-pe-01 Gi0/0/0/2",    peer: "fj-suva-pe-01",   operStatus: "UP",  speed: "10G",  mtu: 9000, lastFlap: null, vlan: null },
      { name: "Ethernet1/2",    ip: "10.1.7.1/30",    description: "Inline FW >> fj-suva-fw-01 eth1",      peer: "fj-suva-fw-01",   operStatus: "UP",  speed: "10G",  mtu: 9000, lastFlap: null, vlan: null },
      { name: "Ethernet1/3",    ip: "10.1.7.5/30",    description: "Inline FW >> fj-suva-fw-02 eth1",      peer: "fj-suva-fw-02",   operStatus: "UP",  speed: "10G",  mtu: 9000, lastFlap: null, vlan: null },
      { name: "Vlan10",         ip: "10.10.2.1/24",   description: "Server fabric VLAN10",                 peer: null,              operStatus: "UP",  speed: null,   mtu: 9000, lastFlap: null, vlan: 10  },
      { name: "Vlan20",         ip: "10.10.3.1/24",   description: "Storage fabric VLAN20",                peer: null,              operStatus: "UP",  speed: null,   mtu: 9000, lastFlap: null, vlan: 20  },
      { name: "mgmt0",          ip: "10.10.1.20/16",  description: "OOB Management",                       peer: null,              operStatus: "UP",  speed: "1G",   mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-it-services"],
    goldenConfig: `! fj-suva-dc-fabric-01 — Cisco Nexus 9336C-FX2 | DC Fabric
! Last commit: 2026-01-15 10:00 UTC by dc-ops
!
hostname fj-suva-dc-fabric-01
feature ospf
feature bgp
feature interface-vlan
feature vpc
feature lacp
!
vlan 10
  name SERVER_FABRIC
vlan 20
  name STORAGE_FABRIC
vlan 100
  name MGMT
!
interface Ethernet1/1
  description Uplink >> fj-suva-pe-01
  ip address 10.1.2.2/30
  mtu 9000
  no shutdown
!
interface Ethernet1/2
  description Inline-FW >> fj-suva-fw-01
  ip address 10.1.7.1/30
  mtu 9000
  no shutdown
!
interface Ethernet1/3
  description Inline-FW >> fj-suva-fw-02
  ip address 10.1.7.5/30
  mtu 9000
  no shutdown
!
interface Vlan10
  description SERVER_FABRIC
  ip address 10.10.2.1/24
  no shutdown
!
interface Vlan20
  description STORAGE_FABRIC
  ip address 10.10.3.1/24
  no shutdown
!
interface mgmt0
  ip address 10.10.1.20/16
!
router ospf 1
  router-id 10.10.1.20
  area 0.0.0.0
!
snmp-server community BNOC-RO group network-operator
ntp server 10.10.1.65
! ... [truncated] ...`,
  },

  {
    id: "fj-suva-distr-sw01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-distr-sw01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "Catalyst 9500-40X",
    layer: "IP LAN",
    role: "distr-sw",
    mgmtIp: "10.10.1.25",
    status: "UP",
    osVersion: "IOS-XE 17.9.4a",
    serialNumber: "FDO2312A1PQ",
    procurementDate: "2022-03-08",
    eolDate: "2032-03-08",
    supportExpiry: "2030-03-08",
    rackUnit: "DC1-ROW2-RACK04-U14",
    powerConsumptionW: 550,
    lastCommit: { date: "2026-01-20T13:30:00Z", user: "netops" },
    lineCards: [
      { slot: 1, model: "C9500-40X", description: "40x10GE SFP+ fixed", ports: 40, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-C4-950WAC-R", status: "OK", watts: 950 },
      { id: "PSU-1", model: "PWR-C4-950WAC-R", status: "OK", watts: 950 },
    ],
    interfaces: [
      { name: "TenGigabitEthernet1/0/1", ip: "10.10.4.1/24",  description: "Access VLAN 10 user LAN",    peer: null,              operStatus: "UP",  speed: "10G", mtu: 9000, lastFlap: null, vlan: 10  },
      { name: "TenGigabitEthernet1/0/2", ip: "10.10.5.1/24",  description: "Access VLAN 20 voice LAN",   peer: null,              operStatus: "UP",  speed: "10G", mtu: 1500, lastFlap: null, vlan: 20  },
      { name: "GigabitEthernet0/0",      ip: "10.10.1.25/16", description: "Management",                 peer: null,              operStatus: "UP",  speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-fixed-bb"],
    goldenConfig: `! fj-suva-distr-sw01 — Cisco Catalyst 9500-40X | IP LAN
! Last commit: 2026-01-20 13:30 UTC by netops
!
hostname fj-suva-distr-sw01
spanning-tree mode rapid-pvst
!
vlan 10
 name USER_LAN
vlan 20
 name VOICE_LAN
vlan 100
 name MGMT
!
interface Vlan10
 description USER_LAN
 ip address 10.10.4.1 255.255.255.0
 no shutdown
!
interface Vlan20
 description VOICE_LAN
 ip address 10.10.5.1 255.255.255.0
 no shutdown
!
interface TenGigabitEthernet1/0/1
 switchport mode trunk
 switchport trunk allowed vlan 10,100
 no shutdown
!
interface TenGigabitEthernet1/0/2
 switchport mode trunk
 switchport trunk allowed vlan 20,100
 no shutdown
!
ip dhcp pool USER_LAN
 network 10.10.4.0 255.255.255.0
 default-router 10.10.4.1
 dns-server 10.10.1.60 10.10.1.61
!
ntp server 10.10.1.65
snmp-server community BNOC-RO RO
! ... [truncated] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY — Suva (inline FW pair)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fj-suva-fw-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-fw-01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "Firepower 4150",
    layer: "Security",
    role: "fw",
    mgmtIp: "10.10.1.50",
    status: "UP",
    osVersion: "FTD 7.4.1",
    serialNumber: "JAD2308L1FP",
    procurementDate: "2023-08-22",
    eolDate: "2033-08-22",
    supportExpiry: "2031-08-22",
    rackUnit: "DC1-ROW2-RACK05-U14",
    powerConsumptionW: 1200,
    lastCommit: { date: "2026-03-12T09:00:00Z", user: "sec-ops" },
    lineCards: [
      { slot: 0, model: "FPR4K-NM-8X10G", description: "8-port 10GE Network Module", ports: 8, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "FPR4K-PWR-AC-1200", status: "OK",  watts: 1200 },
      { id: "PSU-1", model: "FPR4K-PWR-AC-1200", status: "OK",  watts: 1200 },
    ],
    interfaces: [
      { name: "Management1/1",  ip: "10.10.1.50/16", description: "OOB Management / FMC reach",   peer: null,                    operStatus: "UP",  speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
      { name: "Ethernet1/1",    ip: "10.1.7.2/30",   description: "INSIDE << fj-suva-dc-fabric-01", peer: "fj-suva-dc-fabric-01", operStatus: "UP",  speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "Ethernet1/2",    ip: "10.1.7.9/30",   description: "OUTSIDE >> fj-suva-pe-01",      peer: "fj-suva-pe-01",         operStatus: "UP",  speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "Ethernet1/3",    ip: "10.10.1.51/30", description: "HA link >> fj-suva-fw-02",      peer: "fj-suva-fw-02",         operStatus: "UP",  speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-security"],
    goldenConfig: `! fj-suva-fw-01.vodafone.fj — Cisco Firepower 4150 FTD 7.4.1 | Security
! Managed by FMC at 10.10.1.80 — do NOT edit locally
! Last commit: 2026-03-12 09:00 UTC by sec-ops (via FMC policy push)
!
interface Management1/1
 management-only
 nameif management
 security-level 100
 ip address 10.10.1.50 255.255.0.0
 no shutdown
!
interface Ethernet1/1
 nameif inside
 security-level 100
 ip address 10.1.7.2 255.255.255.252
 no shutdown
!
interface Ethernet1/2
 nameif outside
 security-level 0
 ip address 10.1.7.9 255.255.255.252
 no shutdown
!
interface Ethernet1/3
 nameif ha-link
 security-level 50
 ip address 10.10.1.50 255.255.255.252
 no shutdown
!
failover
 failover lan unit primary
 failover lan interface ha-link Ethernet1/3
 failover link ha-link Ethernet1/3
 failover interface ip ha-link 10.10.1.52 255.255.255.252 standby 10.10.1.53
!
access-list OUTSIDE_IN extended permit ip 10.0.0.0 255.0.0.0 any
access-list OUTSIDE_IN extended deny ip any any log
access-group OUTSIDE_IN in interface outside
!
nat (inside,outside) dynamic interface
!
route outside 0.0.0.0 0.0.0.0 10.1.7.10 1
snmp-server host management 10.10.1.80 community BNOC-RO
ntp server 10.10.1.65
! ... [truncated] ...`,
  },

  {
    id: "fj-suva-fw-02",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-fw-02.vodafone.fj",
    vendor: "Cisco",
    hwModel: "Firepower 4150",
    layer: "Security",
    role: "fw",
    mgmtIp: "10.10.1.51",
    status: "UP",
    osVersion: "FTD 7.4.1",
    serialNumber: "JAD2308L2FP",
    procurementDate: "2023-08-22",
    eolDate: "2033-08-22",
    supportExpiry: "2031-08-22",
    rackUnit: "DC1-ROW2-RACK05-U20",
    powerConsumptionW: 1200,
    lastCommit: { date: "2026-03-12T09:00:00Z", user: "sec-ops" },
    lineCards: [
      { slot: 0, model: "FPR4K-NM-8X10G", description: "8-port 10GE Network Module", ports: 8, portType: "10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "FPR4K-PWR-AC-1200", status: "OK",  watts: 1200 },
      { id: "PSU-1", model: "FPR4K-PWR-AC-1200", status: "OK",  watts: 1200 },
    ],
    interfaces: [
      { name: "Management1/1",  ip: "10.10.1.51/16", description: "OOB Management",                    peer: null,                    operStatus: "UP",  speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
      { name: "Ethernet1/1",    ip: "10.1.7.6/30",   description: "INSIDE << fj-suva-dc-fabric-01",    peer: "fj-suva-dc-fabric-01",  operStatus: "UP",  speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "Ethernet1/2",    ip: "10.1.7.13/30",  description: "OUTSIDE >> fj-suva-pe-01 (HA path)", peer: "fj-suva-pe-01",         operStatus: "UP",  speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "Ethernet1/3",    ip: "10.10.1.53/30", description: "HA link << fj-suva-fw-01",          peer: "fj-suva-fw-01",         operStatus: "UP",  speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-security"],
    goldenConfig: `! fj-suva-fw-02.vodafone.fj — Cisco Firepower 4150 FTD 7.4.1 | Security
! HA STANDBY unit — managed by FMC at 10.10.1.80
! Configuration is sync'd from fw-01 (primary) via HA link
!
failover
 failover lan unit secondary
 failover lan interface ha-link Ethernet1/3
 failover link ha-link Ethernet1/3
 failover interface ip ha-link 10.10.1.52 255.255.255.252 standby 10.10.1.53
! ... [synced from primary — local edit not required] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LOAD BALANCER — Suva
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fj-suva-lb-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-lb-01.vodafone.fj",
    vendor: "F5",
    hwModel: "BIG-IP i5800",
    layer: "Load Balancer",
    role: "lb",
    mgmtIp: "10.10.1.55",
    status: "UP",
    osVersion: "TMOS 17.1.1",
    serialNumber: "f5-lbfj-kq28-rntx",
    procurementDate: "2023-02-14",
    eolDate: "2031-02-14",
    supportExpiry: "2029-02-14",
    rackUnit: "DC1-ROW2-RACK06-U14",
    powerConsumptionW: 750,
    lastCommit: { date: "2026-02-28T14:10:00Z", user: "lb-admin" },
    lineCards: [
      { slot: 0, model: "i5800-BUILT-IN", description: "8x10GE SFP+ + 2x40GE QSFP built-in", ports: 10, portType: "10GE SFP+ / 40GE QSFP", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "F5-UPG-AC-800W", status: "OK", watts: 800 },
      { id: "PSU-1", model: "F5-UPG-AC-800W", status: "OK", watts: 800 },
    ],
    interfaces: [
      { name: "mgmt",    ip: "10.10.1.55/16",   description: "OOB Management",          peer: null, operStatus: "UP", speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
      { name: "1.1",     ip: "10.1.8.2/30",     description: "Internal (server-side)",  peer: null, operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "1.2",     ip: "10.1.8.6/30",     description: "External (client-side)",  peer: null, operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-load-balancing"],
    goldenConfig: `# fj-suva-lb-01.vodafone.fj — F5 BIG-IP i5800 | TMOS 17.1.1
# Last commit: 2026-02-28 14:10 UTC by lb-admin
# Managed via F5 BIG-IQ at 10.10.1.80

sys management-ip 10.10.1.55/16
sys management-route default gateway 10.10.1.1

net interface 1.1 {
  media-fixed 10000T-FD
  mtu 9000
}
net interface 1.2 {
  media-fixed 10000T-FD
}

net self internal_self {
  address 10.1.8.2/30
  vlan internal
  allow-service { default }
}
net self external_self {
  address 10.1.8.6/30
  vlan external
  allow-service { default }
}

ltm pool PORTAL_POOL {
  members {
    10.10.2.10:443 { address 10.10.2.10 }
    10.10.2.11:443 { address 10.10.2.11 }
  }
  monitor https
}

ltm virtual PORTAL_VIP {
  destination 10.10.20.10:443
  ip-protocol tcp
  pool PORTAL_POOL
  profiles { http {} tcp {} clientssl { context clientside } }
  source-address-translation { type automap }
}

ltm pool NMS_POOL {
  members {
    10.10.1.80:443 { address 10.10.1.80 }
  }
  monitor https
}

sys ntp {
  servers { 10.10.1.65 }
}
sys snmp {
  communities {
    BNOC-RO {
      community-name BNOC-RO
      access ro
    }
  }
}
# ... [truncated] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IT INFRASTRUCTURE — Suva (DNS, NTP, AAA, NMS, BSS)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fj-suva-dns-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-dns-01.vodafone.fj",
    vendor: "Infoblox",
    hwModel: "NIOS B-2205",
    layer: "IT Infrastructure",
    role: "dns",
    mgmtIp: "10.10.1.60",
    status: "UP",
    osVersion: "NIOS 8.6.4",
    serialNumber: "IBX-B2205-FJ001",
    procurementDate: "2022-05-30",
    eolDate: "2030-05-30",
    supportExpiry: "2028-05-30",
    rackUnit: "DC1-ROW3-RACK03-U14",
    powerConsumptionW: 350,
    lastCommit: { date: "2026-03-01T07:00:00Z", user: "dns-admin" },
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "Infoblox AC 350W", status: "OK", watts: 350 },
      { id: "PSU-1", model: "Infoblox AC 350W", status: "OK", watts: 350 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.10.1.60/16", description: "Management + DNS service",   peer: null, operStatus: "UP", speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
      { name: "eth1", ip: "10.10.1.62/16", description: "Grid replication to dns-02", peer: "fj-suva-dns-02", operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-dns"],
    goldenConfig: `# fj-suva-dns-01.vodafone.fj — Infoblox NIOS B-2205 | NIOS 8.6.4
# PRIMARY DNS / Grid Master
# Last commit: 2026-03-01 07:00 UTC by dns-admin

grid {
  name: "BNOC-FJ-GRID"
  master: 10.10.1.60
  member: fj-suva-dns-01
  shared-secret: <REDACTED>
}

view "internal" {
  match-clients { 10.0.0.0/8; };
  zone "vodafone.fj" {
    type master;
    file "vodafone.fj.db";
  }
  zone "10.10.in-addr.arpa" {
    type master;
    file "10.10.rev.db";
  }
}

view "external" {
  match-clients { any; };
  recursion no;
  zone "vodafone.fj" {
    type master;
    file "vodafone.fj.ext.db";
  }
}

dhcp-server {
  lease-time 86400;
  subnet 10.10.4.0/24 {
    range 10.10.4.100 10.10.4.250;
    option routers 10.10.4.1;
    option domain-name-servers 10.10.1.60 10.10.1.61;
  }
}

snmp community BNOC-RO read-only
ntp-server 10.10.1.65
# ... [truncated] ...`,
  },

  {
    id: "fj-suva-dns-02",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-dns-02.vodafone.fj",
    vendor: "Infoblox",
    hwModel: "NIOS B-2205",
    layer: "IT Infrastructure",
    role: "dns",
    mgmtIp: "10.10.1.61",
    status: "UP",
    osVersion: "NIOS 8.6.4",
    serialNumber: "IBX-B2205-FJ002",
    procurementDate: "2022-05-30",
    eolDate: "2030-05-30",
    supportExpiry: "2028-05-30",
    rackUnit: "DC1-ROW3-RACK03-U20",
    powerConsumptionW: 350,
    lastCommit: { date: "2026-03-01T07:05:00Z", user: "dns-admin" },
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "Infoblox AC 350W", status: "OK", watts: 350 },
      { id: "PSU-1", model: "Infoblox AC 350W", status: "OK", watts: 350 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.10.1.61/16", description: "Management + DNS service (secondary)", peer: null,              operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null, vlan: null },
      { name: "eth1", ip: "10.10.1.63/16", description: "Grid replication from dns-01",         peer: "fj-suva-dns-01",  operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-dns"],
    goldenConfig: `# fj-suva-dns-02.vodafone.fj — Infoblox NIOS B-2205 | NIOS 8.6.4
# SECONDARY DNS / Grid Member
# Configuration synced from Grid Master fj-suva-dns-01 (10.10.1.60)

grid {
  name: "BNOC-FJ-GRID"
  master: 10.10.1.60
  member: fj-suva-dns-02
  shared-secret: <REDACTED>
}

# All zone data replicated from grid master
# Local overrides: none
snmp community BNOC-RO read-only
ntp-server 10.10.1.65
# ... [truncated — secondary, synced from dns-01] ...`,
  },

  {
    id: "fj-suva-ntp-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-ntp-01.vodafone.fj",
    vendor: "Microsemi",
    hwModel: "SyncServer S600",
    layer: "IT Infrastructure",
    role: "ntp",
    mgmtIp: "10.10.1.65",
    status: "UP",
    osVersion: "S600 FW 2.8.2",
    serialNumber: "MSM-S600-FJ001",
    procurementDate: "2021-09-01",
    eolDate: "2031-09-01",
    supportExpiry: "2029-09-01",
    rackUnit: "DC1-ROW3-RACK04-U14",
    powerConsumptionW: 150,
    lastCommit: { date: "2024-11-10T09:00:00Z", user: "infra-ops" },
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "S600-AC-150W", status: "OK", watts: 150 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.10.1.65/16", description: "Management + NTP stratum-1 service", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-ntp"],
    goldenConfig: `# fj-suva-ntp-01.vodafone.fj — Microsemi SyncServer S600 | FW 2.8.2
# Stratum-1 GPS-disciplined NTP server
# Last commit: 2024-11-10 by infra-ops

system {
  hostname: fj-suva-ntp-01
  ip-address: 10.10.1.65/16
  gateway: 10.10.1.1
}

time-source {
  gps {
    enabled: true
    antenna-cable-delay: 15ns
  }
}

ntp {
  stratum: 1
  broadcast-mode: false
  restrict default kod notrap nomodify nopeer noquery
  restrict 10.10.0.0/16 nomodify notrap
  restrict 10.1.0.0/16 nomodify notrap
  restrict 127.0.0.1
}

snmp {
  community: BNOC-RO
  read-only: true
  trap-receiver: 10.10.1.80
}`,
  },

  {
    id: "fj-suva-aaa-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-aaa-01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "ISE 3655",
    layer: "IT Infrastructure",
    role: "aaa",
    mgmtIp: "10.10.1.70",
    status: "UP",
    osVersion: "ISE 3.3 Patch 3",
    serialNumber: "FCH2301V0AA",
    procurementDate: "2023-01-18",
    eolDate: "2030-01-18",
    supportExpiry: "2028-01-18",
    rackUnit: "DC1-ROW3-RACK04-U20",
    powerConsumptionW: 650,
    lastCommit: { date: "2026-02-15T11:20:00Z", user: "sec-admin" },
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "ISE3655-PWR-AC", status: "OK", watts: 650 },
      { id: "PSU-1", model: "ISE3655-PWR-AC", status: "OK", watts: 650 },
    ],
    interfaces: [
      { name: "GigabitEthernet0", ip: "10.10.1.70/16", description: "Management + RADIUS/TACACS service", peer: null, operStatus: "UP", speed: "1G", mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-aaa"],
    goldenConfig: `# fj-suva-aaa-01.vodafone.fj — Cisco ISE 3655 | ISE 3.3 Patch 3
# AAA: RADIUS + TACACS+ for all network devices
# Last commit: 2026-02-15 11:20 UTC by sec-admin

# ISE configuration is managed via GUI / pxGrid / REST API
# CLI export (partial):

network-devices {
  group "FJ-CORE-ROUTERS" {
    radius-key: <REDACTED>
    tacacs-key: <REDACTED>
    members: [10.10.1.1, 10.10.1.2, 10.10.1.3]
  }
  group "FJ-DC-SWITCHES" {
    members: [10.10.1.20, 10.10.1.25, 10.10.2.5, 10.10.2.10]
  }
  group "FJ-SECURITY" {
    members: [10.10.1.50, 10.10.1.51, 10.10.1.55]
  }
}

authorization-policy {
  rule "NETWORK-ADMIN" {
    identity-group: CN=netops,OU=Groups,DC=vodafone,DC=fj
    permissions: shell-profile FULL-ACCESS
  }
  rule "READ-ONLY" {
    identity-group: CN=noc,OU=Groups,DC=vodafone,DC=fj
    permissions: shell-profile READ-ONLY
  }
}

radius {
  port: 1812 1813
  coa-port: 1700
}
tacacs {
  port: 49
}
# ... [truncated] ...`,
  },

  {
    id: "fj-suva-nms-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-nms-01.vodafone.fj",
    vendor: "Dell",
    hwModel: "PowerEdge R750",
    layer: "NMS Platform",
    role: "nms",
    mgmtIp: "10.10.1.80",
    status: "UP",
    osVersion: "Ubuntu Server 22.04.4 LTS",
    serialNumber: "DLPE-R750-FJ001",
    procurementDate: "2022-11-01",
    eolDate: "2032-11-01",
    supportExpiry: "2030-11-01",
    rackUnit: "DC1-ROW4-RACK01-U1",
    powerConsumptionW: 800,
    lastCommit: { date: "2026-03-20T08:30:00Z", user: "nms-admin" },
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "Dell EMC 800W AC Mixed Mode", status: "OK", watts: 800 },
      { id: "PSU-1", model: "Dell EMC 800W AC Mixed Mode", status: "OK", watts: 800 },
    ],
    interfaces: [
      { name: "eno1", ip: "10.10.1.80/16",  description: "Management + NMS services",  peer: null, operStatus: "UP", speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
      { name: "eno2", ip: "10.10.1.81/16",  description: "NMS collection (SNMP/sFlow)", peer: null, operStatus: "UP", speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-it-services"],
    goldenConfig: `# fj-suva-nms-01.vodafone.fj — Dell PowerEdge R750 | NMS Platform
# OS: Ubuntu Server 22.04.4 LTS
# Services: LibreNMS, Oxidized (config backup), Syslog (rsyslog), SNMP trap receiver
# Last commit: 2026-03-20 08:30 UTC by nms-admin

# /etc/network/interfaces (relevant excerpt)
auto eno1
iface eno1 inet static
  address 10.10.1.80
  netmask 255.255.0.0
  gateway 10.10.1.1

auto eno2
iface eno2 inet static
  address 10.10.1.81
  netmask 255.255.0.0
  mtu 9000

# LibreNMS community config: /opt/librenms/config.php (excerpt)
# $config['snmp']['community'] = ['BNOC-RO'];
# $config['nets'][] = '10.10.0.0/16';
# $config['nets'][] = '10.20.0.0/16';
# $config['nets'][] = '10.1.0.0/16';

# Oxidized config: /etc/oxidized/config (excerpt)
# username: oxidized
# source: sql  (postgresql backend)
# groups: { cisco_xr: {}, junos: {}, nxos: {} }

# Rsyslog: /etc/rsyslog.d/99-network.conf
# $UDPServerRun 514
# $template NetworkLogs,"/var/log/network/%HOSTNAME%/%$YEAR%-%$MONTH%-%$DAY%.log"
# ... [truncated] ...`,
  },

  {
    id: "fj-suva-bss-01",
    siteId: "fj-suva-dc1",
    country: "FJ",
    hostname: "fj-suva-bss-01.vodafone.fj",
    vendor: "Dell",
    hwModel: "PowerEdge R860",
    layer: "BSS Platform",
    role: "bss",
    mgmtIp: "10.10.1.90",
    status: "UP",
    osVersion: "RHEL 9.3",
    serialNumber: "DLPE-R860-FJ001",
    procurementDate: "2023-06-15",
    eolDate: "2033-06-15",
    supportExpiry: "2031-06-15",
    rackUnit: "DC1-ROW4-RACK02-U1",
    powerConsumptionW: 1400,
    lastCommit: { date: "2026-03-18T16:00:00Z", user: "bss-admin" },
    lineCards: [],
    powerSupplies: [
      { id: "PSU-0", model: "Dell EMC 1400W AC Mixed Mode", status: "OK", watts: 1400 },
      { id: "PSU-1", model: "Dell EMC 1400W AC Mixed Mode", status: "OK", watts: 1400 },
    ],
    interfaces: [
      { name: "eno1", ip: "10.10.1.90/16",  description: "Management",              peer: null, operStatus: "UP", speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
      { name: "eno2", ip: "10.10.1.91/16",  description: "BSS application traffic", peer: null, operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "eno3", ip: "10.10.20.1/24",  description: "VIP service range (via lb-01)", peer: "fj-suva-lb-01", operStatus: "UP", speed: "25G", mtu: 9000, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-it-services"],
    goldenConfig: `# fj-suva-bss-01.vodafone.fj — Dell PowerEdge R860 | BSS Platform
# OS: RHEL 9.3
# Services: Amdocs Optima BSS stack, PostgreSQL 15, Redis 7, Kafka 3.5
# Traffic load-balanced via fj-suva-lb-01 (VIP 10.10.20.10)
# Last commit: 2026-03-18 16:00 UTC by bss-admin

# /etc/sysconfig/network-scripts/ifcfg-eno1
DEVICE=eno1
BOOTPROTO=static
IPADDR=10.10.1.90
NETMASK=255.255.0.0
GATEWAY=10.10.1.1
DNS1=10.10.1.60
DNS2=10.10.1.61
ONBOOT=yes

# /etc/sysconfig/network-scripts/ifcfg-eno2
DEVICE=eno2
BOOTPROTO=static
IPADDR=10.10.1.91
NETMASK=255.255.0.0
MTU=9000
ONBOOT=yes

# systemd services active:
# amdocs-optima.service — BSS application server
# postgresql-15.service — primary DB
# redis.service         — session cache
# kafka.service         — event streaming
# ... [truncated] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RADIO ACCESS / BACKHAUL — Suva BPoP
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fj-suva-bpop-01",
    siteId: "fj-suva-core1",
    country: "FJ",
    hostname: "fj-suva-bpop-01.vodafone.fj",
    vendor: "Ericsson",
    hwModel: "MINI-LINK 6471",
    layer: "BPoP",
    role: "bpop",
    mgmtIp: "10.10.3.1",
    status: "UP",
    osVersion: "ML-PT R8C07",
    serialNumber: "ERC-ML6471-FJ001",
    procurementDate: "2021-11-20",
    eolDate: "2029-11-20",
    supportExpiry: "2027-11-20",
    rackUnit: "CORE1-ROW1-RACK01-U14",
    powerConsumptionW: 300,
    lastCommit: { date: "2025-10-05T07:30:00Z", user: "radio-ops" },
    lineCards: [
      { slot: 0, model: "ML-PT 6471-ETH",   description: "4x1GE Ethernet tributary",       ports: 4, portType: "1GE SFP",   status: "OK" },
      { slot: 1, model: "ML-PT 6471-RADIO",  description: "Dual-carrier 15/18 GHz radio",   ports: 2, portType: "Microwave", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "ML-PT AC 300W", status: "OK", watts: 300 },
    ],
    interfaces: [
      { name: "eth0", ip: "10.10.3.1/16",  description: "Management",                   peer: null,           operStatus: "UP", speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
      { name: "eth1", ip: "10.1.4.1/30",   description: "Backhaul uplink >> fj-suva-cr-01", peer: "fj-suva-cr-01", operStatus: "UP", speed: "1G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "radio0", ip: null,           description: "Radio carrier 1 — 18GHz 256QAM", peer: null,          operStatus: "UP", speed: "1G",  mtu: 9000, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-5g-data", "fj-fixed-bb"],
    goldenConfig: `# fj-suva-bpop-01 — Ericsson MINI-LINK 6471 | BPoP
# Ericsson MINI-LINK Craft Terminal configuration
# Last commit: 2025-10-05 07:30 UTC by radio-ops

node-name: fj-suva-bpop-01
management-ip: 10.10.3.1/16
management-gateway: 10.10.3.254

ethernet:
  port eth0:
    mode: management
  port eth1:
    mode: data
    ip: 10.1.4.1/30
    description: "Backhaul uplink >> fj-suva-cr-01"

radio-link:
  carrier-1:
    frequency: 18000 MHz
    modulation: adaptive-256QAM
    tx-power: 23 dBm
    capacity: 1Gbps
    peer-node: fj-suva-ran-site-03
  carrier-2:
    frequency: 15000 MHz
    modulation: adaptive-128QAM
    tx-power: 20 dBm
    capacity: 500Mbps
    peer-node: fj-suva-ran-site-07

qos:
  queue-1: { dscp: EF,  priority: strict, bandwidth: 20% }
  queue-2: { dscp: AF41, priority: wfq,   bandwidth: 40% }
  queue-3: { dscp: BE,  priority: wfq,   bandwidth: 40% }

snmp community BNOC-RO read-only
ntp server 10.10.1.65
# ... [truncated] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LAUTOKA — IP Core, DC Fabric, LAN
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "fj-lautoka-pe-01",
    siteId: "fj-lautoka-dc1",
    country: "FJ",
    hostname: "fj-lautoka-pe-01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "ASR 9001",
    layer: "IP Core",
    role: "pe",
    mgmtIp: "10.10.2.1",
    status: "UP",
    osVersion: "IOS-XR 7.3.4",
    serialNumber: "FXS2004K3A2",
    procurementDate: "2019-05-22",
    eolDate: "2028-05-22",
    supportExpiry: "2026-05-22",
    rackUnit: "LKA-DC1-ROW1-RACK01-U1",
    powerConsumptionW: 1600,
    lastCommit: { date: "2026-03-08T10:10:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "A9K-4T16GE-SE", description: "4-port 10GE + 16-port 1GE", ports: 20, portType: "10GE SFP+/1GE SFP", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "A9K-750W-AC", status: "OK", watts: 750 },
      { id: "PSU-1", model: "A9K-750W-AC", status: "OK", watts: 750 },
    ],
    interfaces: [
      { name: "Loopback0",               ip: "172.16.1.2/32",   description: "Router ID",                             peer: null,                     operStatus: "UP",  speed: "1G",   mtu: 65535, lastFlap: null, vlan: null },
      { name: "GigabitEthernet0/0/0/0",  ip: "10.1.0.18/30",   description: "CORE >> fj-suva-cr-01 Gi0/0/0/3",      peer: "fj-suva-cr-01",          operStatus: "UP",  speed: "10G",  mtu: 9000,  lastFlap: null, vlan: null },
      { name: "GigabitEthernet0/0/0/1",  ip: "10.1.1.2/30",    description: "CORE >> fj-suva-pe-01 Gi0/0/0/1",      peer: "fj-suva-pe-01",          operStatus: "UP",  speed: "10G",  mtu: 9000,  lastFlap: null, vlan: null },
      { name: "GigabitEthernet0/0/0/2",  ip: "10.1.0.30/30",   description: "CORE >> fj-suva-cr-02 Gi0/0/0/2",      peer: "fj-suva-cr-02",          operStatus: "UP",  speed: "10G",  mtu: 9000,  lastFlap: null, vlan: null },
      { name: "GigabitEthernet0/0/0/3",  ip: "10.1.3.1/30",    description: "DC >> fj-lautoka-dc-fabric-01 Eth1/1", peer: "fj-lautoka-dc-fabric-01", operStatus: "UP",  speed: "10G",  mtu: 9000,  lastFlap: null, vlan: null },
      { name: "MgmtEth0/0/CPU0/0",       ip: "10.10.2.1/16",   description: "OOB Management",                       peer: null,                     operStatus: "UP",  speed: "1G",   mtu: 1500,  lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [
      { ip: "172.16.1.1",  asn: 65001, description: "iBGP >> fj-suva-cr-01",  state: "Established", prefixesRx: 42,  prefixesTx: 22,  uptime: "47d 03h 09m" },
      { ip: "172.16.1.12", asn: 65001, description: "iBGP >> fj-suva-cr-02",  state: "Established", prefixesRx: 38,  prefixesTx: 22,  uptime: "47d 02h 58m" },
      { ip: "172.16.1.3",  asn: 65001, description: "iBGP >> fj-suva-pe-01",  state: "Established", prefixesRx: 18,  prefixesTx: 22,  uptime: "42d 16h 22m" },
    ],
    services: ["fj-voice-core", "fj-mpls-vpn", "fj-fixed-bb"],
    goldenConfig: `! fj-lautoka-pe-01.vodafone.fj — Cisco ASR 9001 | IP Core (PE)
! Last commit: 2026-03-08 10:10 UTC by netops
!
hostname fj-lautoka-pe-01
!
interface Loopback0
 description ** Router ID **
 ipv4 address 172.16.1.2 255.255.255.255
!
interface GigabitEthernet0/0/0/0
 description ** CORE >> fj-suva-cr-01 **
 ipv4 address 10.1.0.18 255.255.255.252
!
interface GigabitEthernet0/0/0/1
 description ** CORE >> fj-suva-pe-01 **
 ipv4 address 10.1.1.2 255.255.255.252
!
interface GigabitEthernet0/0/0/2
 description ** CORE >> fj-suva-cr-02 (secondary) **
 ipv4 address 10.1.0.30 255.255.255.252
!
interface GigabitEthernet0/0/0/3
 description ** DC >> fj-lautoka-dc-fabric-01 **
 ipv4 address 10.1.3.1 255.255.255.252
!
router ospf 1
 router-id 172.16.1.2
 area 0
  interface Loopback0
   passive enable
  interface GigabitEthernet0/0/0/0
  interface GigabitEthernet0/0/0/1
  interface GigabitEthernet0/0/0/2
!
router bgp 65001
 bgp router-id 172.16.1.2
 neighbor 172.16.1.1  remote-as 65001
  description ** iBGP >> fj-suva-cr-01 **
  update-source Loopback0
 neighbor 172.16.1.12 remote-as 65001
  description ** iBGP >> fj-suva-cr-02 **
  update-source Loopback0
 neighbor 172.16.1.3  remote-as 65001
  description ** iBGP >> fj-suva-pe-01 **
  update-source Loopback0
!
mpls ldp
 router-id 172.16.1.2
! ... [truncated] ...`,
  },

  {
    id: "fj-lautoka-dc-fabric-01",
    siteId: "fj-lautoka-dc1",
    country: "FJ",
    hostname: "fj-lautoka-dc-fabric-01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "Nexus 3172PQ",
    layer: "DC Fabric",
    role: "dc-fabric",
    mgmtIp: "10.10.2.5",
    status: "UP",
    osVersion: "NX-OS 9.3(11)",
    serialNumber: "FDO2003P1KL",
    procurementDate: "2019-09-10",
    eolDate: "2027-09-10",
    supportExpiry: "2025-09-10",
    rackUnit: "LKA-DC1-ROW1-RACK03-U14",
    powerConsumptionW: 550,
    lastCommit: { date: "2025-12-01T09:00:00Z", user: "dc-ops" },
    lineCards: [
      { slot: 0, model: "N3K-C3172PQ", description: "72x10GE SFP+ + 6x40GE QSFP fixed", ports: 78, portType: "10GE SFP+ / 40GE QSFP", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "NXA-PAC-550W", status: "OK",  watts: 550 },
      { id: "PSU-1", model: "NXA-PAC-550W", status: "OK",  watts: 550 },
    ],
    interfaces: [
      { name: "Ethernet1/1", ip: "10.1.3.2/30",   description: "Uplink >> fj-lautoka-pe-01 Gi0/0/0/3", peer: "fj-lautoka-pe-01",    operStatus: "UP",  speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "Ethernet1/2", ip: "10.10.6.1/24",  description: "Server fabric VLAN10",                  peer: null,                  operStatus: "UP",  speed: "10G", mtu: 9000, lastFlap: null, vlan: 10  },
      { name: "mgmt0",       ip: "10.10.2.5/16",  description: "OOB Management",                        peer: null,                  operStatus: "UP",  speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-it-services"],
    goldenConfig: `! fj-lautoka-dc-fabric-01 — Cisco Nexus 3172PQ | DC Fabric
! Secondary DC — mirrors suva-dc-fabric-01 architecture
! Support expired 2025-09 — EOL tracking: CR-2025-1142
!
hostname fj-lautoka-dc-fabric-01
feature interface-vlan
feature lacp
!
vlan 10
  name SERVER_FABRIC
vlan 100
  name MGMT
!
interface Ethernet1/1
  description Uplink >> fj-lautoka-pe-01
  ip address 10.1.3.2/30
  mtu 9000
  no shutdown
!
interface Ethernet1/2
  switchport mode trunk
  switchport trunk allowed vlan 10,100
  no shutdown
!
interface Vlan10
  ip address 10.10.6.1/24
  no shutdown
!
interface mgmt0
  ip address 10.10.2.5/16
!
ntp server 10.10.1.65
snmp-server community BNOC-RO group network-operator
! ... [truncated — secondary DC] ...`,
  },

  {
    id: "fj-lautoka-distr-sw01",
    siteId: "fj-lautoka-dc1",
    country: "FJ",
    hostname: "fj-lautoka-distr-sw01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "Catalyst 9300-48P",
    layer: "IP LAN",
    role: "distr-sw",
    mgmtIp: "10.10.2.15",
    status: "UP",
    osVersion: "IOS-XE 17.9.4a",
    serialNumber: "FDO2318A2PQ",
    procurementDate: "2023-03-01",
    eolDate: "2033-03-01",
    supportExpiry: "2031-03-01",
    rackUnit: "LKA-DC1-ROW1-RACK04-U14",
    powerConsumptionW: 400,
    lastCommit: { date: "2026-01-10T14:00:00Z", user: "netops" },
    lineCards: [
      { slot: 1, model: "C9300-48P", description: "48x1GE PoE+ + 4x10GE uplinks", ports: 52, portType: "1GE RJ45 / 10GE SFP+", status: "OK" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-C1-715WAC", status: "OK", watts: 715 },
      { id: "PSU-1", model: "PWR-C1-715WAC", status: "OK", watts: 715 },
    ],
    interfaces: [
      { name: "TenGigabitEthernet1/1/1", ip: "10.10.2.15/16",  description: "Uplink >> fj-lautoka-dc-fabric-01", peer: "fj-lautoka-dc-fabric-01", operStatus: "UP",  speed: "10G", mtu: 9000, lastFlap: null, vlan: null },
      { name: "Vlan10",                  ip: "10.10.7.1/24",   description: "User LAN VLAN10",                    peer: null,                      operStatus: "UP",  speed: null,  mtu: 1500, lastFlap: null, vlan: 10  },
      { name: "Vlan20",                  ip: "10.10.8.1/24",   description: "Voice LAN VLAN20",                   peer: null,                      operStatus: "UP",  speed: null,  mtu: 1500, lastFlap: null, vlan: 20  },
      { name: "GigabitEthernet0/0",      ip: "10.10.2.15/16",  description: "Management",                         peer: null,                      operStatus: "UP",  speed: "1G",  mtu: 1500, lastFlap: null, vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-fixed-bb"],
    goldenConfig: `! fj-lautoka-distr-sw01 — Cisco Catalyst 9300-48P | IP LAN
! Last commit: 2026-01-10 14:00 UTC by netops
!
hostname fj-lautoka-distr-sw01
spanning-tree mode rapid-pvst
!
vlan 10
 name USER_LAN
vlan 20
 name VOICE_LAN
vlan 100
 name MGMT
!
interface Vlan10
 description USER_LAN
 ip address 10.10.7.1 255.255.255.0
 no shutdown
!
interface Vlan20
 description VOICE_LAN
 ip address 10.10.8.1 255.255.255.0
 no shutdown
!
interface TenGigabitEthernet1/1/1
 description Uplink >> fj-lautoka-dc-fabric-01
 switchport mode trunk
 switchport trunk allowed vlan 10,20,100
 no shutdown
!
ip dhcp pool LAUTOKA_USER_LAN
 network 10.10.7.0 255.255.255.0
 default-router 10.10.7.1
 dns-server 10.10.1.60 10.10.1.61
!
ntp server 10.10.1.65
snmp-server community BNOC-RO RO
! ... [truncated] ...`,
  },

  {
    id: "fj-lautoka-acc-sw01",
    siteId: "fj-lautoka-dc1",
    country: "FJ",
    hostname: "fj-lautoka-acc-sw01.vodafone.fj",
    vendor: "Cisco",
    hwModel: "Catalyst 2960X-48LPS",
    layer: "IP LAN",
    role: "acc-sw",
    mgmtIp: "10.10.2.10",
    status: "DOWN",
    osVersion: "IOS 15.2(7)E6",
    serialNumber: "FOC1948X00P",
    procurementDate: "2018-04-15",
    eolDate: "2025-04-15",
    supportExpiry: "2023-04-15",
    rackUnit: "LKA-DC1-ROW2-RACK01-U14",
    powerConsumptionW: 370,
    lastCommit: { date: "2025-08-14T12:00:00Z", user: "netops" },
    lineCards: [
      { slot: 0, model: "C2960X-48LPS-L", description: "48x1GE PoE+ + 4x1G SFP", ports: 52, portType: "1GE RJ45 / 1GE SFP", status: "FAILED" },
    ],
    powerSupplies: [
      { id: "PSU-0", model: "PWR-C2-250WAC", status: "FAILED", watts: 250 },
    ],
    interfaces: [
      { name: "GigabitEthernet0/1", ip: "10.10.4.2/24",  description: "Access VLAN 10 (DOWN)", peer: null, operStatus: "DOWN", speed: "1G", mtu: 1500, lastFlap: "2026-03-20T03:44:00Z", vlan: 10  },
      { name: "GigabitEthernet0/2", ip: "10.10.2.10/16", description: "Management (unreachable)", peer: null, operStatus: "DOWN", speed: "1G", mtu: 1500, lastFlap: "2026-03-20T03:44:00Z", vlan: null },
    ],
    bgpNeighbors: [],
    services: ["fj-fixed-bb"],
    goldenConfig: `! fj-lautoka-acc-sw01 — Cisco Catalyst 2960X-48LPS | IP LAN
! *** NODE DOWN — PSU failure — ICMP unreachable since 2026-03-20 03:44 UTC ***
! *** EOL: 2025-04-15 | Support expired: 2023-04-15 — replacement CR pending ***
!
hostname fj-lautoka-acc-sw01
! ... [config not retrievable — node unreachable] ...`,
  },

];
