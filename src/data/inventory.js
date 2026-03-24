// ─── NETWORK INVENTORY ────────────────────────────────────────────────────────
// Static source-of-truth for Vodafone demo networks: Fiji, Hawaii, Ibiza
// Structure: SITES → NODES → SERVICES, plus ALARMS for observable health state
// ──────────────────────────────────────────────────────────────────────────────

// ─── SITES ────────────────────────────────────────────────────────────────────
export const SITES = [
  // ── FIJI ────────────────────────────────────────────────────────────────────
  { id:"fj-suva-dc1",       country:"FJ", name:"Suva DC1",              type:"DC",        city:"Suva"     },
  { id:"fj-lautoka-dc1",    country:"FJ", name:"Lautoka DC",            type:"DC",        city:"Lautoka"  },
  { id:"fj-suva-core1",     country:"FJ", name:"Suva Core PoP",         type:"Core PoP",  city:"Suva"     },
  { id:"fj-suva-ixp1",      country:"FJ", name:"Suva IXP1 — Telstra",   type:"IXP",       city:"Suva"     },
  { id:"fj-suva-ixp2",      country:"FJ", name:"Suva IXP2 — PCCW",      type:"IXP",       city:"Suva"     },

  // ── HAWAII ──────────────────────────────────────────────────────────────────
  { id:"hw-hnl1-dc1",       country:"HW", name:"Honolulu DC1",          type:"DC",        city:"Honolulu" },
  { id:"hw-hnl2-dc2",       country:"HW", name:"Honolulu DC2",          type:"DC",        city:"Honolulu" },
  { id:"hw-maui-dc1",       country:"HW", name:"Maui DC",               type:"DC",        city:"Kahului"  },
  { id:"hw-hnl-core1",      country:"HW", name:"Honolulu Core PoP",     type:"Core PoP",  city:"Honolulu" },
  { id:"hw-maui-core1",     country:"HW", name:"Maui APoP",             type:"APoP",      city:"Kahului"  },
  { id:"hw-hnl-ixp1",       country:"HW", name:"Honolulu IXP1 — AT&T",  type:"IXP",       city:"Honolulu" },
  { id:"hw-hnl-ixp2",       country:"HW", name:"Honolulu IXP2 — Cogent",type:"IXP",       city:"Honolulu" },
  { id:"hw-hnl-ixp3",       country:"HW", name:"Honolulu IXP3 — HE",    type:"IXP",       city:"Honolulu" },

  // ── IBIZA ───────────────────────────────────────────────────────────────────
  { id:"ib-town-dc1",       country:"IB", name:"Ibiza Town DC1",        type:"DC",        city:"Ibiza Town"    },
  { id:"ib-santantoni-dc1", country:"IB", name:"Sant Antoni DC",        type:"DC",        city:"Sant Antoni"   },
  { id:"ib-santaeulalia-dc1",country:"IB",name:"Santa Eulalia DC",      type:"DC",        city:"Santa Eulalia" },
  { id:"ib-escanar-dc1",    country:"IB", name:"Es Canar DC",           type:"DC",        city:"Es Canar"      },
  { id:"ib-portinatx-dc1",  country:"IB", name:"Portinatx DC",          type:"DC",        city:"Portinatx"     },
  { id:"ib-town-core1",     country:"IB", name:"Ibiza Town Core PoP",   type:"Core PoP",  city:"Ibiza Town"    },
  { id:"ib-town-ixp1",      country:"IB", name:"IXP1 — Lumen",          type:"IXP",       city:"Ibiza Town"    },
  { id:"ib-town-ixp2",      country:"IB", name:"IXP2 — Telia",          type:"IXP",       city:"Ibiza Town"    },
  { id:"ib-town-ixp3",      country:"IB", name:"IXP3 — GTT",            type:"IXP",       city:"Ibiza Town"    },
  { id:"ib-town-ixp4",      country:"IB", name:"IXP4 — Zayo",           type:"IXP",       city:"Ibiza Town"    },
];

// ─── NODES ────────────────────────────────────────────────────────────────────
export const NODES = [

  // ═══════════════════════════════════════════════════════════════════════════
  // FIJI — AS 65001 · Mgmt 10.10.0.0/16 · P2P 10.1.0.0/16 · Lo 172.16.1.x
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id:"fj-suva-cr-01", siteId:"fj-suva-dc1", country:"FJ",
    hostname:"fj-suva-cr-01.vodafone.fj",
    vendor:"Cisco", hwModel:"ASR 9922", layer:"IP Core", role:"cr",
    mgmtIp:"10.10.1.1", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/0/0/0", ip:"10.1.0.1/30",    description:"CORE >> fj-lautoka-pe-01 Gi0/0/0/0", peer:"fj-lautoka-pe-01" },
      { name:"GigabitEthernet0/0/0/1", ip:"10.1.0.5/30",    description:"CORE >> fj-suva-pe-01 Gi0/0/0/0",    peer:"fj-suva-pe-01"    },
      { name:"GigabitEthernet0/0/0/2", ip:"10.1.0.9/30",    description:"UPLINK >> fj-suva-igw-01 xe-0/0/1",  peer:"fj-suva-igw-01"   },
      { name:"MgmtEth0/0/CPU0/0",      ip:"10.10.1.1/16",   description:"OOB Management",                     peer:null               },
    ],
    services:["fj-internet-transit","fj-5g-data","fj-mpls-vpn"],
    goldenConfig:`! fj-suva-cr-01.vodafone.fj
! Cisco ASR 9922 | IP Core | AS 65001
! Last commit: 2026-03-10 14:22 UTC by netops
!
hostname fj-suva-cr-01
domain name vodafone.fj
!
interface Loopback0
 description ** Router ID **
 ipv4 address 172.16.1.1 255.255.255.255
!
interface GigabitEthernet0/0/0/0
 description ** CORE >> fj-lautoka-pe-01 Gi0/0/0/0 **
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
 neighbor 172.16.1.2
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-lautoka-pe-01 **
 !
 neighbor 172.16.1.3
  use neighbor-group IBGP-RR
  description ** iBGP >> fj-suva-pe-01 **
 !
!
mpls ldp
 router-id 172.16.1.1
 interface GigabitEthernet0/0/0/0
 !
 interface GigabitEthernet0/0/0/1
 !
!
snmp-server community BNOC-RO RO
snmp-server community BNOC-RW RW
ntp server 10.10.254.1
ntp server 10.10.254.2
logging 10.10.100.1
!
end`,
  },

  {
    id:"fj-suva-pe-01", siteId:"fj-suva-dc1", country:"FJ",
    hostname:"fj-suva-pe-01.vodafone.fj",
    vendor:"Cisco", hwModel:"ASR 9001", layer:"IP Core", role:"pe",
    mgmtIp:"10.10.1.3", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/0/0/0", ip:"10.1.0.6/30",  description:"CORE >> fj-suva-cr-01 Gi0/0/0/1",      peer:"fj-suva-cr-01"     },
      { name:"GigabitEthernet0/0/0/1", ip:"10.1.1.1/30",  description:"CORE >> fj-lautoka-pe-01 Gi0/0/0/1",   peer:"fj-lautoka-pe-01"  },
      { name:"GigabitEthernet0/0/0/2", ip:"10.1.2.1/30",  description:"DC >> fj-suva-dc-fabric-01 Gi1/0/1",   peer:"fj-suva-dc-fabric-01"},
    ],
    services:["fj-voice-core","fj-mpls-vpn"],
    goldenConfig:`! fj-suva-pe-01.vodafone.fj — Cisco ASR 9001 | IP Core
hostname fj-suva-pe-01
!
interface Loopback0
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
vrf ENTERPRISE
 address-family ipv4 unicast
  import route-target 65001:100
  export route-target 65001:100
 !
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
!
mpls ldp
 router-id 172.16.1.3
! ... [truncated] ...`,
  },

  {
    id:"fj-suva-5gc-01", siteId:"fj-suva-dc1", country:"FJ",
    hostname:"fj-suva-5gc-01.vodafone.fj",
    vendor:"Nokia", hwModel:"AirFrame Cloud", layer:"5G Core", role:"5gc",
    mgmtIp:"10.10.1.10", status:"UP",
    interfaces:[
      { name:"eth0", ip:"10.10.1.10/16", description:"OOB Management",        peer:null              },
      { name:"eth1", ip:"10.1.5.1/30",   description:"N6 >> fj-suva-igw-01",  peer:"fj-suva-igw-01"  },
      { name:"eth2", ip:"10.1.5.5/30",   description:"N3 >> fj-suva-cr-01",   peer:"fj-suva-cr-01"   },
    ],
    services:["fj-5g-data"],
    goldenConfig:`# fj-suva-5gc-01.vodafone.fj — Nokia AirFrame Cloud | 5G Core
# Nokia CloudBand Infrastructure Software
# Last commit: 2026-02-28 11:05 UTC

network-instance Base
  interface eth1
    ipv4 10.1.5.1/30
    description "N6 interface to IGW"
  interface eth2
    ipv4 10.1.5.5/30
    description "N3/N9 user-plane to RAN"

nf amf
  plmn 54001
  tac 0x0001 0x0002
  s-nssai 01:000001

nf smf
  dnn internet
    upf-selection pool UPF-POOL-FJ

nf upf
  n3-address 10.1.5.5
  n6-address 10.1.5.1
  pool UPF-POOL-FJ

# ... [truncated] ...`,
  },

  {
    id:"fj-suva-voip-gw-01", siteId:"fj-suva-dc1", country:"FJ",
    hostname:"fj-suva-voip-gw-01.vodafone.fj",
    vendor:"Cisco", hwModel:"CUBE 350", layer:"Voice Core", role:"voip-gw",
    mgmtIp:"10.10.1.15", status:"DEGRADED",
    interfaces:[
      { name:"GigabitEthernet0/0", ip:"10.10.1.15/16", description:"Management",             peer:null           },
      { name:"GigabitEthernet0/1", ip:"10.1.6.1/30",   description:"SIP trunk >> PSTN GW",   peer:"fj-suva-pe-01"},
    ],
    services:["fj-voice-core"],
    goldenConfig:`! fj-suva-voip-gw-01.vodafone.fj — Cisco CUBE 350 | Voice Core
! WARNING: CPU 95% — check active call load
hostname fj-suva-voip-gw-01
!
voice service voip
 ip address trusted list
  ipv4 10.1.0.0 255.255.0.0
 allow-connections sip to sip
 supplementary-service h450.2
!
sip-ua
 credentials username vodafone-fj password XXXXX realm sip.vodafone.fj
 registrar ipv4:10.1.6.2 expires 3600
!
dial-peer voice 100 voip
 description ** Inbound from PSTN **
 session protocol sipv2
 session target ipv4:10.1.6.2
 codec g711ulaw
! ... [truncated] ...`,
  },

  {
    id:"fj-suva-dc-fabric-01", siteId:"fj-suva-dc1", country:"FJ",
    hostname:"fj-suva-dc-fabric-01.vodafone.fj",
    vendor:"Cisco", hwModel:"Nexus 9336C-FX2", layer:"DC Fabric", role:"dc-fabric",
    mgmtIp:"10.10.1.20", status:"UP",
    interfaces:[
      { name:"Ethernet1/1", ip:"10.1.2.2/30",  description:"Uplink >> fj-suva-pe-01",        peer:"fj-suva-pe-01"   },
      { name:"Ethernet1/2", ip:"10.10.2.1/24",  description:"Server fabric VLAN10",           peer:null              },
      { name:"Ethernet1/3", ip:"10.10.3.1/24",  description:"Storage fabric VLAN20",          peer:null              },
    ],
    services:["fj-it-services"],
    goldenConfig:`! fj-suva-dc-fabric-01 — Cisco Nexus 9336C | DC Fabric
hostname fj-suva-dc-fabric-01
feature ospf
feature bgp
feature interface-vlan
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
  no shutdown
! ... [truncated] ...`,
  },

  {
    id:"fj-suva-distr-sw01", siteId:"fj-suva-dc1", country:"FJ",
    hostname:"fj-suva-distr-sw01.vodafone.fj",
    vendor:"Cisco", hwModel:"Catalyst 9500-40X", layer:"IP LAN", role:"distr-sw",
    mgmtIp:"10.10.1.25", status:"UP",
    interfaces:[
      { name:"TenGigabitEthernet1/0/1", ip:"10.10.4.1/24", description:"Access VLAN 10",     peer:null },
      { name:"GigabitEthernet1/0/1",    ip:"10.10.1.25/16",description:"Mgmt",               peer:null },
    ],
    services:["fj-fixed-bb"],
    goldenConfig:`! fj-suva-distr-sw01 — Cisco Catalyst 9500 | IP LAN
hostname fj-suva-distr-sw01
spanning-tree mode rapid-pvst
!
interface Vlan10
  description USER_LAN
  ip address 10.10.4.1 255.255.255.0
  no shutdown
! ... [truncated] ...`,
  },

  {
    id:"fj-lautoka-pe-01", siteId:"fj-lautoka-dc1", country:"FJ",
    hostname:"fj-lautoka-pe-01.vodafone.fj",
    vendor:"Cisco", hwModel:"ASR 9001", layer:"IP Core", role:"pe",
    mgmtIp:"10.10.2.1", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/0/0/0", ip:"10.1.0.2/30",  description:"CORE >> fj-suva-cr-01 Gi0/0/0/0",  peer:"fj-suva-cr-01"  },
      { name:"GigabitEthernet0/0/0/1", ip:"10.1.1.2/30",  description:"CORE >> fj-suva-pe-01 Gi0/0/0/1",  peer:"fj-suva-pe-01"  },
      { name:"GigabitEthernet0/0/0/2", ip:"10.1.3.1/30",  description:"DC >> fj-lautoka-dc-fabric-01",    peer:"fj-lautoka-dc-fabric-01"},
    ],
    services:["fj-voice-core","fj-mpls-vpn","fj-fixed-bb"],
    goldenConfig:`! fj-lautoka-pe-01.vodafone.fj — Cisco ASR 9001 | IP Core
hostname fj-lautoka-pe-01
!
interface Loopback0
 ipv4 address 172.16.1.2 255.255.255.255
!
interface GigabitEthernet0/0/0/0
 description ** CORE >> fj-suva-cr-01 **
 ipv4 address 10.1.0.2 255.255.255.252
!
interface GigabitEthernet0/0/0/1
 description ** CORE >> fj-suva-pe-01 **
 ipv4 address 10.1.1.2 255.255.255.252
!
router bgp 65001
 bgp router-id 172.16.1.2
 neighbor 172.16.1.1 remote-as 65001
  description ** iBGP >> fj-suva-cr-01 **
! ... [truncated] ...`,
  },

  {
    id:"fj-lautoka-dc-fabric-01", siteId:"fj-lautoka-dc1", country:"FJ",
    hostname:"fj-lautoka-dc-fabric-01.vodafone.fj",
    vendor:"Cisco", hwModel:"Nexus 3172PQ", layer:"DC Fabric", role:"dc-fabric",
    mgmtIp:"10.10.2.5", status:"UP",
    interfaces:[
      { name:"Ethernet1/1", ip:"10.1.3.2/30", description:"Uplink >> fj-lautoka-pe-01", peer:"fj-lautoka-pe-01"},
    ],
    services:["fj-it-services"],
    goldenConfig:`! fj-lautoka-dc-fabric-01 — Cisco Nexus 3172 | DC Fabric
hostname fj-lautoka-dc-fabric-01
! ... [truncated — secondary DC, mirrors suva-dc-fabric-01] ...`,
  },

  {
    id:"fj-lautoka-acc-sw01", siteId:"fj-lautoka-dc1", country:"FJ",
    hostname:"fj-lautoka-acc-sw01.vodafone.fj",
    vendor:"Cisco", hwModel:"Catalyst 2960X-48LPS", layer:"IP LAN", role:"acc-sw",
    mgmtIp:"10.10.2.10", status:"DOWN",
    interfaces:[
      { name:"GigabitEthernet0/1", ip:"10.10.4.2/24", description:"Access VLAN 10", peer:null },
    ],
    services:["fj-fixed-bb"],
    goldenConfig:`! fj-lautoka-acc-sw01 — Cisco Catalyst 2960X | IP LAN
! *** NODE DOWN — ICMP unreachable ***
hostname fj-lautoka-acc-sw01
spanning-tree mode rapid-pvst
! ... [config not retrievable — node unreachable] ...`,
  },

  {
    id:"fj-suva-bpop-01", siteId:"fj-suva-core1", country:"FJ",
    hostname:"fj-suva-bpop-01.vodafone.fj",
    vendor:"Ericsson", hwModel:"MINI-LINK 6471", layer:"BPoP", role:"bpop",
    mgmtIp:"10.10.3.1", status:"UP",
    interfaces:[
      { name:"eth0",  ip:"10.10.3.1/16", description:"Management",                    peer:null          },
      { name:"eth1",  ip:"10.1.4.1/30",  description:"Backhaul >> fj-suva-cr-01",     peer:"fj-suva-cr-01"},
    ],
    services:["fj-5g-data","fj-fixed-bb"],
    goldenConfig:`# fj-suva-bpop-01 — Ericsson MINI-LINK 6471 | BPoP
# Ericsson MINI-LINK Craft Terminal config
node-name: fj-suva-bpop-01
management-ip: 10.10.3.1/16
radio-link-1:
  modulation: adaptive-256QAM
  capacity: 1Gbps
  peer: fj-suva-cr-01
# ... [truncated] ...`,
  },

  {
    id:"fj-suva-igw-01", siteId:"fj-suva-ixp1", country:"FJ",
    hostname:"fj-suva-igw-01.vodafone.fj",
    vendor:"Juniper", hwModel:"MX204", layer:"Internet GW", role:"igw",
    mgmtIp:"10.10.4.1", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.1.0.10/30",      description:"CORE << fj-suva-cr-01 Gi0/0/0/2", peer:"fj-suva-cr-01"   },
      { name:"xe-0/0/1", ip:"203.17.128.2/30",   description:"UPSTREAM Telstra AS1221",          peer:null             },
      { name:"em0",      ip:"10.10.4.1/16",       description:"OOB Management",                  peer:null             },
    ],
    services:["fj-internet-transit"],
    goldenConfig:`set system host-name fj-suva-igw-01
set system domain-name vodafone.fj
set system ntp server 10.10.254.1
set system login message "** AUTHORISED ACCESS ONLY - Vodafone Fiji Network **"

set interfaces lo0 unit 0 family inet address 172.16.1.10/32 primary
set interfaces xe-0/0/0 description "CORE << fj-suva-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.1.0.10/30
set interfaces xe-0/0/1 description "UPSTREAM Telstra AS1221"
set interfaces xe-0/0/1 unit 0 family inet address 203.17.128.2/30
set interfaces em0 unit 0 family inet address 10.10.4.1/16

set protocols bgp group UPSTREAM-TELSTRA type external
set protocols bgp group UPSTREAM-TELSTRA peer-as 1221
set protocols bgp group UPSTREAM-TELSTRA neighbor 203.17.128.1 description "Telstra upstream"
set protocols bgp group IBGP type internal
set protocols bgp group IBGP local-address 172.16.1.10
set protocols bgp group IBGP neighbor 172.16.1.1 description "fj-suva-cr-01"

set routing-options router-id 172.16.1.10
set routing-options autonomous-system 65001

set policy-options policy-statement EXPORT-DEFAULT term 1 from route-filter 0.0.0.0/0 exact
set policy-options policy-statement EXPORT-DEFAULT term 1 then accept
set snmp community BNOC-RO authorization read-only`,
  },

  {
    id:"fj-suva-igw-02", siteId:"fj-suva-ixp2", country:"FJ",
    hostname:"fj-suva-igw-02.vodafone.fj",
    vendor:"Juniper", hwModel:"MX104", layer:"Internet GW", role:"igw",
    mgmtIp:"10.10.4.2", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.1.0.14/30",     description:"CORE << fj-suva-cr-01 Gi0/0/0/3", peer:"fj-suva-cr-01"},
      { name:"xe-0/0/1", ip:"129.250.0.2/30",   description:"UPSTREAM PCCW AS3491",             peer:null          },
    ],
    services:["fj-internet-transit"],
    goldenConfig:`set system host-name fj-suva-igw-02
set interfaces xe-0/0/0 description "CORE << fj-suva-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.1.0.14/30
set interfaces xe-0/0/1 description "UPSTREAM PCCW AS3491"
set interfaces xe-0/0/1 unit 0 family inet address 129.250.0.2/30
set protocols bgp group UPSTREAM-PCCW type external
set protocols bgp group UPSTREAM-PCCW peer-as 3491
set protocols bgp group UPSTREAM-PCCW neighbor 129.250.0.1 description "PCCW upstream"
set routing-options router-id 172.16.1.11
set routing-options autonomous-system 65001
# ... [truncated] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HAWAII — AS 65002 · Mgmt 10.20.0.0/16 · P2P 10.2.0.0/16 · Lo 172.16.2.x
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id:"hw-hnl1-cr-01", siteId:"hw-hnl1-dc1", country:"HW",
    hostname:"hw-hnl1-cr-01.vodafone.hw",
    vendor:"Juniper", hwModel:"MX960", layer:"IP Core", role:"cr",
    mgmtIp:"10.20.1.1", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.2.0.1/30",  description:"CORE >> hw-hnl1-cr-02 xe-0/0/0",   peer:"hw-hnl1-cr-02" },
      { name:"xe-0/0/1", ip:"10.2.0.5/30",  description:"CORE >> hw-hnl2-pe-01 xe-0/0/0",   peer:"hw-hnl2-pe-01" },
      { name:"xe-0/0/2", ip:"10.2.0.9/30",  description:"CORE >> hw-maui-cr-01 xe-0/0/0",   peer:"hw-maui-cr-01" },
      { name:"xe-0/0/3", ip:"10.2.0.13/30", description:"UPLINK >> hw-hnl-igw-01 xe-0/0/1", peer:"hw-hnl-igw-01"  },
      { name:"em0",      ip:"10.20.1.1/16",  description:"OOB Management",                   peer:null            },
    ],
    services:["hw-internet-transit","hw-5g-nsa","hw-mpls-vpn"],
    goldenConfig:`set system host-name hw-hnl1-cr-01
set system domain-name vodafone.hw
set system ntp server 10.20.254.1
set system login message "** AUTHORISED ACCESS ONLY - Vodafone Hawaii Network **"

set interfaces lo0 unit 0 family inet address 172.16.2.1/32 primary
set interfaces lo0 description "Router ID / Loopback"

set interfaces xe-0/0/0 description "CORE >> hw-hnl1-cr-02 xe-0/0/0"
set interfaces xe-0/0/0 unit 0 family inet address 10.2.0.1/30
set interfaces xe-0/0/1 description "CORE >> hw-hnl2-pe-01 xe-0/0/0"
set interfaces xe-0/0/1 unit 0 family inet address 10.2.0.5/30
set interfaces xe-0/0/2 description "CORE >> hw-maui-cr-01 xe-0/0/0"
set interfaces xe-0/0/2 unit 0 family inet address 10.2.0.9/30
set interfaces xe-0/0/3 description "UPLINK >> hw-hnl-igw-01 xe-0/0/1"
set interfaces xe-0/0/3 unit 0 family inet address 10.2.0.13/30
set interfaces em0 unit 0 family inet address 10.20.1.1/16

set protocols ospf area 0.0.0.0 interface lo0.0 passive
set protocols ospf area 0.0.0.0 interface xe-0/0/0.0 metric 10
set protocols ospf area 0.0.0.0 interface xe-0/0/1.0 metric 10
set protocols ospf area 0.0.0.0 interface xe-0/0/2.0 metric 20

set protocols bgp group IBGP-CORE type internal
set protocols bgp group IBGP-CORE local-address 172.16.2.1
set protocols bgp group IBGP-CORE family inet unicast
set protocols bgp group IBGP-CORE family inet-vpn unicast
set protocols bgp group IBGP-CORE neighbor 172.16.2.2 description "hw-hnl1-cr-02"
set protocols bgp group IBGP-CORE neighbor 172.16.2.3 description "hw-hnl2-pe-01"
set protocols bgp group IBGP-CORE neighbor 172.16.2.4 description "hw-maui-cr-01"

set protocols mpls interface xe-0/0/0.0
set protocols mpls interface xe-0/0/1.0
set protocols mpls interface xe-0/0/2.0
set protocols ldp interface xe-0/0/0.0
set protocols ldp interface xe-0/0/1.0
set protocols ldp interface xe-0/0/2.0

set routing-options router-id 172.16.2.1
set routing-options autonomous-system 65002
set snmp community BNOC-RO authorization read-only`,
  },

  {
    id:"hw-hnl1-cr-02", siteId:"hw-hnl1-dc1", country:"HW",
    hostname:"hw-hnl1-cr-02.vodafone.hw",
    vendor:"Juniper", hwModel:"MX480", layer:"IP Core", role:"cr",
    mgmtIp:"10.20.1.2", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.2.0.2/30",  description:"CORE >> hw-hnl1-cr-01 xe-0/0/0",    peer:"hw-hnl1-cr-01" },
      { name:"xe-0/0/1", ip:"10.2.1.1/30",  description:"CORE >> hw-maui-cr-01 xe-0/0/1",    peer:"hw-maui-cr-01" },
      { name:"xe-0/0/2", ip:"10.2.0.17/30", description:"UPLINK >> hw-hnl-igw-02 xe-0/0/1",  peer:"hw-hnl-igw-02" },
    ],
    services:["hw-internet-transit","hw-5g-nsa","hw-mpls-vpn"],
    goldenConfig:`set system host-name hw-hnl1-cr-02
set interfaces lo0 unit 0 family inet address 172.16.2.2/32 primary
set interfaces xe-0/0/0 description "CORE >> hw-hnl1-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.2.0.2/30
set interfaces xe-0/0/1 description "CORE >> hw-maui-cr-01"
set interfaces xe-0/0/1 unit 0 family inet address 10.2.1.1/30
set protocols bgp group IBGP-CORE type internal
set protocols bgp group IBGP-CORE local-address 172.16.2.2
set protocols bgp group IBGP-CORE neighbor 172.16.2.1 description "hw-hnl1-cr-01"
set protocols bgp group IBGP-CORE neighbor 172.16.2.4 description "hw-maui-cr-01"
set routing-options autonomous-system 65002
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl1-pe-01", siteId:"hw-hnl1-dc1", country:"HW",
    hostname:"hw-hnl1-pe-01.vodafone.hw",
    vendor:"Juniper", hwModel:"MX204", layer:"IP Core", role:"pe",
    mgmtIp:"10.20.1.3", status:"DEGRADED",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.2.0.6/30",  description:"CORE >> hw-hnl1-cr-01 xe-0/0/1",  peer:"hw-hnl1-cr-01" },
      { name:"xe-0/0/1", ip:"10.2.2.1/30",  description:"VOICE >> hw-hnl2-voip-gw-01",      peer:"hw-hnl2-voip-gw-01"},
      { name:"xe-0/0/2", ip:"FLAPPING",      description:"!! FLAPPING — xe-0/0/2 to DC2",    peer:null            },
    ],
    services:["hw-voice-core","hw-mpls-vpn"],
    goldenConfig:`set system host-name hw-hnl1-pe-01
# !! DEGRADED — xe-0/0/2 flapping (8 state changes / 15 min)
set interfaces lo0 unit 0 family inet address 172.16.2.3/32 primary
set interfaces xe-0/0/0 description "CORE >> hw-hnl1-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.2.0.6/30
set interfaces xe-0/0/2 description "!! FLAPPING — investigate immediately"
set protocols bgp group IBGP-CORE type internal
set protocols bgp group IBGP-CORE neighbor 172.16.2.1 description "hw-hnl1-cr-01"
set routing-options autonomous-system 65002
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl1-5gc-01", siteId:"hw-hnl1-dc1", country:"HW",
    hostname:"hw-hnl1-5gc-01.vodafone.hw",
    vendor:"Nokia", hwModel:"AirFrame Cloud", layer:"5G Core", role:"5gc",
    mgmtIp:"10.20.1.10", status:"UP",
    interfaces:[
      { name:"eth0", ip:"10.20.1.10/16", description:"OOB Management",       peer:null             },
      { name:"eth1", ip:"10.2.5.1/30",   description:"N6 >> hw-hnl-igw-01",  peer:"hw-hnl-igw-01"  },
    ],
    services:["hw-5g-sa"],
    goldenConfig:`# hw-hnl1-5gc-01 — Nokia AirFrame Cloud | 5G SA Core
nf amf
  plmn 73401
  tac 0x0001 0x0002 0x0003
nf smf
  dnn internet
  dnn ims
nf upf
  pool HW-UPF-POOL
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl1-amf-01", siteId:"hw-hnl1-dc1", country:"HW",
    hostname:"hw-hnl1-amf-01.vodafone.hw",
    vendor:"Nokia", hwModel:"vAMF", layer:"5G Core", role:"amf",
    mgmtIp:"10.20.1.11", status:"UP",
    interfaces:[
      { name:"eth0", ip:"10.20.1.11/16", description:"Management", peer:null },
      { name:"eth1", ip:"10.2.5.9/30",   description:"N2 >> RAN",  peer:null },
    ],
    services:["hw-5g-sa"],
    goldenConfig:`# hw-hnl1-amf-01 — Nokia vAMF | 5G Core
# Virtualised AMF on Nokia AirFrame
amf-config:
  plmn-id: 73401
  tac-list: [1, 2, 3]
  n2-interface: 10.2.5.9
  n11-smf: 10.20.1.12
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl1-upf-01", siteId:"hw-hnl1-dc1", country:"HW",
    hostname:"hw-hnl1-upf-01.vodafone.hw",
    vendor:"Nokia", hwModel:"vUPF", layer:"5G Core", role:"upf",
    mgmtIp:"10.20.1.12", status:"UP",
    interfaces:[
      { name:"eth0", ip:"10.20.1.12/16", description:"Management",          peer:null           },
      { name:"eth1", ip:"10.2.5.5/30",   description:"N3 user-plane >> RAN", peer:null          },
      { name:"eth2", ip:"10.2.5.13/30",  description:"N6 >> internet GW",    peer:"hw-hnl-igw-01"},
    ],
    services:["hw-5g-sa"],
    goldenConfig:`# hw-hnl1-upf-01 — Nokia vUPF | 5G Core
upf-config:
  n3-address: 10.2.5.5
  n9-address: 10.2.5.5
  n6-address: 10.2.5.13
  pool: HW-UPF-POOL
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl1-dc-fabric-01", siteId:"hw-hnl1-dc1", country:"HW",
    hostname:"hw-hnl1-dc-fabric-01.vodafone.hw",
    vendor:"Cisco", hwModel:"Nexus 9364C", layer:"DC Fabric", role:"dc-fabric",
    mgmtIp:"10.20.1.20", status:"UP",
    interfaces:[
      { name:"Ethernet1/1", ip:"10.2.3.1/30", description:"Uplink >> hw-hnl1-cr-01", peer:"hw-hnl1-cr-01"},
      { name:"Ethernet1/2", ip:"10.20.2.1/24", description:"Server fabric VLAN10",   peer:null            },
    ],
    services:["hw-iptv","hw-it-services"],
    goldenConfig:`! hw-hnl1-dc-fabric-01 — Cisco Nexus 9364C | DC Fabric
hostname hw-hnl1-dc-fabric-01
! ... [truncated] ...`,
  },

  {
    id:"hw-hnl2-pe-01", siteId:"hw-hnl2-dc2", country:"HW",
    hostname:"hw-hnl2-pe-01.vodafone.hw",
    vendor:"Juniper", hwModel:"MX204", layer:"IP Core", role:"pe",
    mgmtIp:"10.20.2.1", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.2.0.6/30",  description:"CORE >> hw-hnl1-cr-01 xe-0/0/1",  peer:"hw-hnl1-cr-01" },
      { name:"xe-0/0/1", ip:"10.2.3.5/30",  description:"DC >> hw-hnl2-dc-fabric-01",       peer:"hw-hnl2-dc-fabric-01"},
    ],
    services:["hw-mpls-vpn"],
    goldenConfig:`set system host-name hw-hnl2-pe-01
set interfaces xe-0/0/0 description "CORE >> hw-hnl1-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.2.0.6/30
set routing-options autonomous-system 65002
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl2-voip-gw-01", siteId:"hw-hnl2-dc2", country:"HW",
    hostname:"hw-hnl2-voip-gw-01.vodafone.hw",
    vendor:"Cisco", hwModel:"CUBE 5400", layer:"Voice Core", role:"voip-gw",
    mgmtIp:"10.20.2.5", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/0", ip:"10.20.2.5/16", description:"Management", peer:null },
      { name:"GigabitEthernet0/1", ip:"10.2.2.2/30",  description:"SIP trunk >> hw-hnl1-pe-01", peer:"hw-hnl1-pe-01"},
    ],
    services:["hw-voice-core"],
    goldenConfig:`! hw-hnl2-voip-gw-01 — Cisco CUBE 5400 | Voice Core
hostname hw-hnl2-voip-gw-01
voice service voip
 allow-connections sip to sip
! ... [truncated] ...`,
  },

  {
    id:"hw-hnl2-dc-fabric-01", siteId:"hw-hnl2-dc2", country:"HW",
    hostname:"hw-hnl2-dc-fabric-01.vodafone.hw",
    vendor:"Cisco", hwModel:"Nexus 9336C-FX2", layer:"DC Fabric", role:"dc-fabric",
    mgmtIp:"10.20.2.10", status:"UP",
    interfaces:[
      { name:"Ethernet1/1", ip:"10.2.3.6/30", description:"Uplink >> hw-hnl2-pe-01", peer:"hw-hnl2-pe-01"},
    ],
    services:["hw-iptv","hw-it-services"],
    goldenConfig:`! hw-hnl2-dc-fabric-01 — Cisco Nexus 9336C | DC Fabric
hostname hw-hnl2-dc-fabric-01
! ... [truncated] ...`,
  },

  {
    id:"hw-hnl2-distr-sw01", siteId:"hw-hnl2-dc2", country:"HW",
    hostname:"hw-hnl2-distr-sw01.vodafone.hw",
    vendor:"Cisco", hwModel:"Catalyst 9500-40X", layer:"IP LAN", role:"distr-sw",
    mgmtIp:"10.20.2.15", status:"UP",
    interfaces:[
      { name:"TenGigabitEthernet1/0/1", ip:"10.20.5.1/24", description:"Access distribution", peer:null},
    ],
    services:["hw-fixed-bb"],
    goldenConfig:`! hw-hnl2-distr-sw01 — Cisco Catalyst 9500 | IP LAN
hostname hw-hnl2-distr-sw01
! ... [truncated] ...`,
  },

  {
    id:"hw-maui-cr-01", siteId:"hw-maui-dc1", country:"HW",
    hostname:"hw-maui-cr-01.vodafone.hw",
    vendor:"Juniper", hwModel:"MX204", layer:"IP Core", role:"cr",
    mgmtIp:"10.20.3.1", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.2.0.10/30", description:"CORE >> hw-hnl1-cr-01 xe-0/0/2",  peer:"hw-hnl1-cr-01"},
      { name:"xe-0/0/1", ip:"10.2.1.2/30",  description:"CORE >> hw-hnl1-cr-02 xe-0/0/1",  peer:"hw-hnl1-cr-02"},
      { name:"xe-0/0/2", ip:"10.2.4.1/30",  description:"CORE >> hw-maui-pe-01",            peer:"hw-maui-pe-01"},
    ],
    services:["hw-mpls-vpn"],
    goldenConfig:`set system host-name hw-maui-cr-01
set interfaces lo0 unit 0 family inet address 172.16.2.4/32 primary
set interfaces xe-0/0/0 description "CORE >> hw-hnl1-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.2.0.10/30
set interfaces xe-0/0/1 description "CORE >> hw-hnl1-cr-02"
set interfaces xe-0/0/1 unit 0 family inet address 10.2.1.2/30
set protocols bgp group IBGP-CORE type internal
set protocols bgp group IBGP-CORE neighbor 172.16.2.1 description "hw-hnl1-cr-01"
set protocols bgp group IBGP-CORE neighbor 172.16.2.2 description "hw-hnl1-cr-02"
set routing-options autonomous-system 65002
# ... [truncated] ...`,
  },

  {
    id:"hw-maui-pe-01", siteId:"hw-maui-dc1", country:"HW",
    hostname:"hw-maui-pe-01.vodafone.hw",
    vendor:"Cisco", hwModel:"ASR 9001", layer:"IP Core", role:"pe",
    mgmtIp:"10.20.3.2", status:"DOWN",
    interfaces:[
      { name:"GigabitEthernet0/0/0/0", ip:"10.2.4.2/30", description:"CORE >> hw-maui-cr-01", peer:"hw-maui-cr-01"},
    ],
    services:["hw-mpls-vpn"],
    goldenConfig:`! hw-maui-pe-01 — Cisco ASR 9001 | IP Core
! *** NODE DOWN — BGP session lost, no route to host ***
hostname hw-maui-pe-01
! ... [config not retrievable — node unreachable] ...`,
  },

  {
    id:"hw-maui-dc-fabric-01", siteId:"hw-maui-dc1", country:"HW",
    hostname:"hw-maui-dc-fabric-01.vodafone.hw",
    vendor:"Cisco", hwModel:"Nexus 3172PQ", layer:"DC Fabric", role:"dc-fabric",
    mgmtIp:"10.20.3.5", status:"UP",
    interfaces:[
      { name:"Ethernet1/1", ip:"10.2.4.5/30", description:"Uplink >> hw-maui-cr-01", peer:"hw-maui-cr-01"},
    ],
    services:["hw-it-services"],
    goldenConfig:`! hw-maui-dc-fabric-01 — Cisco Nexus 3172 | DC Fabric
hostname hw-maui-dc-fabric-01
! ... [truncated] ...`,
  },

  {
    id:"hw-maui-distr-sw01", siteId:"hw-maui-dc1", country:"HW",
    hostname:"hw-maui-distr-sw01.vodafone.hw",
    vendor:"Juniper", hwModel:"EX4300-48P", layer:"IP LAN", role:"distr-sw",
    mgmtIp:"10.20.3.10", status:"UP",
    interfaces:[
      { name:"ge-0/0/0", ip:"10.20.6.1/24", description:"Access distribution", peer:null},
    ],
    services:["hw-fixed-bb"],
    goldenConfig:`set system host-name hw-maui-distr-sw01
set interfaces ge-0/0/0 description "Access distribution LAN"
# ... [truncated] ...`,
  },

  {
    id:"hw-maui-acc-sw01", siteId:"hw-maui-dc1", country:"HW",
    hostname:"hw-maui-acc-sw01.vodafone.hw",
    vendor:"Juniper", hwModel:"EX2300-24P", layer:"IP LAN", role:"acc-sw",
    mgmtIp:"10.20.3.11", status:"UP",
    interfaces:[
      { name:"ge-0/0/0", ip:"10.20.6.2/24", description:"Access LAN", peer:null},
    ],
    services:["hw-fixed-bb"],
    goldenConfig:`set system host-name hw-maui-acc-sw01
set interfaces ge-0/0/0 description "Access LAN"
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl-bpop-01", siteId:"hw-hnl-core1", country:"HW",
    hostname:"hw-hnl-bpop-01.vodafone.hw",
    vendor:"Ericsson", hwModel:"MINI-LINK 6474", layer:"BPoP", role:"bpop",
    mgmtIp:"10.20.4.1", status:"DEGRADED",
    interfaces:[
      { name:"eth0", ip:"10.20.4.1/16", description:"Management",             peer:null            },
      { name:"eth1", ip:"10.2.6.1/30",  description:"Backhaul >> hw-hnl1-cr-01", peer:"hw-hnl1-cr-01"},
    ],
    services:["hw-5g-nsa","hw-fixed-bb"],
    goldenConfig:`# hw-hnl-bpop-01 — Ericsson MINI-LINK 6474 | BPoP
# !! DEGRADED — packet loss 12% on access links
node-name: hw-hnl-bpop-01
radio-link-1:
  capacity: 2Gbps
  packet-loss: 12%  # ALERT threshold 1%
# ... [truncated] ...`,
  },

  {
    id:"hw-maui-apop-01", siteId:"hw-maui-core1", country:"HW",
    hostname:"hw-maui-apop-01.vodafone.hw",
    vendor:"Ericsson", hwModel:"MINI-LINK 6448", layer:"APoP", role:"apop",
    mgmtIp:"10.20.4.5", status:"UP",
    interfaces:[
      { name:"eth0", ip:"10.20.4.5/16", description:"Management",             peer:null            },
      { name:"eth1", ip:"10.2.6.5/30",  description:"Backhaul >> hw-maui-cr-01",peer:"hw-maui-cr-01"},
    ],
    services:["hw-5g-nsa"],
    goldenConfig:`# hw-maui-apop-01 — Ericsson MINI-LINK 6448 | APoP
node-name: hw-maui-apop-01
radio-link-1:
  capacity: 1Gbps
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl-igw-01", siteId:"hw-hnl-ixp1", country:"HW",
    hostname:"hw-hnl-igw-01.vodafone.hw",
    vendor:"Juniper", hwModel:"MX10003", layer:"Internet GW", role:"igw",
    mgmtIp:"10.20.5.1", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.2.0.14/30", description:"CORE << hw-hnl1-cr-01 xe-0/0/3", peer:"hw-hnl1-cr-01"},
      { name:"xe-0/0/1", ip:"12.0.1.2/30",  description:"UPSTREAM AT&T AS7018",            peer:null          },
    ],
    services:["hw-internet-transit"],
    goldenConfig:`set system host-name hw-hnl-igw-01
set interfaces xe-0/0/0 description "CORE << hw-hnl1-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.2.0.14/30
set interfaces xe-0/0/1 description "UPSTREAM AT&T AS7018"
set interfaces xe-0/0/1 unit 0 family inet address 12.0.1.2/30
set protocols bgp group UPSTREAM-ATT type external
set protocols bgp group UPSTREAM-ATT peer-as 7018
set protocols bgp group UPSTREAM-ATT neighbor 12.0.1.1 description "AT&T upstream"
set routing-options autonomous-system 65002
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl-igw-02", siteId:"hw-hnl-ixp2", country:"HW",
    hostname:"hw-hnl-igw-02.vodafone.hw",
    vendor:"Juniper", hwModel:"MX480", layer:"Internet GW", role:"igw",
    mgmtIp:"10.20.5.2", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.2.0.18/30", description:"CORE << hw-hnl1-cr-02 xe-0/0/2", peer:"hw-hnl1-cr-02"},
      { name:"xe-0/0/1", ip:"38.0.1.2/30",  description:"UPSTREAM Cogent AS174",           peer:null          },
    ],
    services:["hw-internet-transit"],
    goldenConfig:`set system host-name hw-hnl-igw-02
set interfaces xe-0/0/1 description "UPSTREAM Cogent AS174"
set interfaces xe-0/0/1 unit 0 family inet address 38.0.1.2/30
set protocols bgp group UPSTREAM-COGENT peer-as 174
set protocols bgp group UPSTREAM-COGENT neighbor 38.0.1.1
set routing-options autonomous-system 65002
# ... [truncated] ...`,
  },

  {
    id:"hw-hnl-igw-03", siteId:"hw-hnl-ixp3", country:"HW",
    hostname:"hw-hnl-igw-03.vodafone.hw",
    vendor:"Nokia", hwModel:"7750 SR-1", layer:"Internet GW", role:"igw",
    mgmtIp:"10.20.5.3", status:"UP",
    interfaces:[
      { name:"1/1/1", ip:"10.2.0.21/30",   description:"CORE << hw-hnl1-cr-01",      peer:"hw-hnl1-cr-01"},
      { name:"1/1/2", ip:"216.218.1.2/30", description:"UPSTREAM Hurricane Electric AS6939", peer:null    },
    ],
    services:["hw-internet-transit"],
    goldenConfig:`# hw-hnl-igw-03 — Nokia 7750 SR-1 | Internet GW
configure router Base
  interface "to-hw-hnl1-cr-01"
    address 10.2.0.21/30
  interface "to-HE-AS6939"
    address 216.218.1.2/30
  bgp group "UPSTREAM-HE"
    type external
    peer-as 6939
    neighbor 216.218.1.1
# ... [truncated] ...`,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // IBIZA — AS 65003 · Mgmt 10.30.0.0/16 · P2P 10.3.0.0/16 · Lo 172.16.3.x
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id:"ib-town-cr-01", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-cr-01.vodafone.ib",
    vendor:"Nokia", hwModel:"7750 SR-12e", layer:"IP Core", role:"cr",
    mgmtIp:"10.30.1.1", status:"UP",
    interfaces:[
      { name:"1/1/1", ip:"10.3.0.1/30",  description:"CORE >> ib-town-cr-02 1/1/1",        peer:"ib-town-cr-02"       },
      { name:"1/1/2", ip:"10.3.0.5/30",  description:"CORE >> ib-town-pe-01 1/1/1",         peer:"ib-town-pe-01"       },
      { name:"1/1/3", ip:"10.3.0.9/30",  description:"CORE >> ib-santantoni-pe-01 1/1/1",   peer:"ib-santantoni-pe-01" },
      { name:"1/1/4", ip:"10.3.0.13/30", description:"UPLINK >> ib-town-igw-01 xe-0/0/0",   peer:"ib-town-igw-01"      },
      { name:"1/1/5", ip:"10.3.0.17/30", description:"CORE >> ib-town-asr-01 Gi0/0/0/0",    peer:"ib-town-asr-01"      },
    ],
    services:["ib-internet-transit","ib-5g-nsa","ib-mpls-vpn","ib-sdwan"],
    goldenConfig:`# ib-town-cr-01.vodafone.ib
# Nokia 7750 SR-12e | IP Core | AS 65003
# Last commit: 2026-03-15 09:45 UTC by netops
#
configure
    system
        name "ib-town-cr-01"
        dns
            domain "vodafone.ib"
        exit
        ntp
            server 10.30.254.1 prefer
            server 10.30.254.2
            no shutdown
        exit
        snmp
            community "BNOC-RO" hash2 access-permissions r
            community "BNOC-RW" hash2 access-permissions rw
        exit
        login-banner "** AUTHORISED ACCESS ONLY - Vodafone Ibiza Network **"
    exit
    port 1/1/1
        description "CORE >> ib-town-cr-02 port 1/1/1"
        ethernet
            mode network
        exit
        no shutdown
    exit
    port 1/1/2
        description "CORE >> ib-town-pe-01 port 1/1/1"
        ethernet
            mode network
        exit
        no shutdown
    exit
    port 1/1/3
        description "CORE >> ib-santantoni-pe-01 port 1/1/1"
        ethernet
            mode network
        exit
        no shutdown
    exit
    router Base
        autonomous-system 65003
        router-id 172.16.3.1
        interface "system"
            address 172.16.3.1/32
            no shutdown
        exit
        interface "to-ib-town-cr-02"
            address 10.3.0.1/30
            description "CORE >> ib-town-cr-02"
            port 1/1/1
            no shutdown
        exit
        interface "to-ib-town-pe-01"
            address 10.3.0.5/30
            description "CORE >> ib-town-pe-01"
            port 1/1/2
            no shutdown
        exit
        interface "to-ib-santantoni-pe-01"
            address 10.3.0.9/30
            description "CORE >> ib-santantoni-pe-01"
            port 1/1/3
            no shutdown
        exit
        ospf
            router-id 172.16.3.1
            area 0.0.0.0
                interface "system"
                    passive
                    no shutdown
                exit
                interface "to-ib-town-cr-02"
                    metric 10
                    no shutdown
                exit
                interface "to-ib-town-pe-01"
                    metric 10
                    no shutdown
                exit
                interface "to-ib-santantoni-pe-01"
                    metric 20
                    no shutdown
                exit
            exit
            no shutdown
        exit
        bgp
            router-id 172.16.3.1
            local-as 65003
            group "IBGP-CORE"
                type internal
                local-address 172.16.3.1
                family ipv4
                family vpn-ipv4
                neighbor 172.16.3.2
                    description "ib-town-cr-02"
                    no shutdown
                exit
                neighbor 172.16.3.3
                    description "ib-town-pe-01"
                    no shutdown
                exit
                neighbor 172.16.3.4
                    description "ib-town-pe-02"
                    no shutdown
                exit
            exit
            no shutdown
        exit
        ldp
            interface "to-ib-town-cr-02"
                no shutdown
            exit
            interface "to-ib-town-pe-01"
                no shutdown
            exit
            no shutdown
        exit
    exit
exit all`,
  },

  {
    id:"ib-town-cr-02", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-cr-02.vodafone.ib",
    vendor:"Nokia", hwModel:"7750 SR-7", layer:"IP Core", role:"cr",
    mgmtIp:"10.30.1.2", status:"UP",
    interfaces:[
      { name:"1/1/1", ip:"10.3.0.2/30",  description:"CORE >> ib-town-cr-01 1/1/1",        peer:"ib-town-cr-01"       },
      { name:"1/1/2", ip:"10.3.1.1/30",  description:"CORE >> ib-town-pe-02 1/1/1",         peer:"ib-town-pe-02"       },
      { name:"1/1/3", ip:"10.3.1.5/30",  description:"CORE >> ib-santaeulalia-pe-01 1/1/1", peer:"ib-santaeulalia-pe-01"},
      { name:"1/1/4", ip:"10.3.0.21/30", description:"UPLINK >> ib-town-igw-02 xe-0/0/0",   peer:"ib-town-igw-02"      },
    ],
    services:["ib-internet-transit","ib-5g-nsa","ib-mpls-vpn"],
    goldenConfig:`# ib-town-cr-02 — Nokia 7750 SR-7 | IP Core
configure router Base
  autonomous-system 65003
  router-id 172.16.3.2
  interface "to-ib-town-cr-01"
    address 10.3.0.2/30
    port 1/1/1
  interface "to-ib-town-pe-02"
    address 10.3.1.1/30
    port 1/1/2
  bgp group "IBGP-CORE"
    type internal
    neighbor 172.16.3.1 description "ib-town-cr-01"
    neighbor 172.16.3.4 description "ib-town-pe-02"
# ... [truncated] ...`,
  },

  {
    id:"ib-town-pe-01", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-pe-01.vodafone.ib",
    vendor:"Nokia", hwModel:"7750 SR-1", layer:"IP Core", role:"pe",
    mgmtIp:"10.30.1.3", status:"UP",
    interfaces:[
      { name:"1/1/1", ip:"10.3.0.6/30",  description:"CORE >> ib-town-cr-01 1/1/2",    peer:"ib-town-cr-01"       },
      { name:"1/1/2", ip:"10.3.2.1/30",  description:"DC >> ib-town-dc-fabric-01",      peer:"ib-town-dc-fabric-01"},
    ],
    services:["ib-mpls-vpn"],
    goldenConfig:`# ib-town-pe-01 — Nokia 7750 SR-1 | IP Core
configure router Base
  router-id 172.16.3.3
  interface "to-ib-town-cr-01"
    address 10.3.0.6/30
  vprn 100
    description "ENTERPRISE VPN"
    route-distinguisher 65003:100
    vrf-target target:65003:100
# ... [truncated] ...`,
  },

  {
    id:"ib-town-pe-02", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-pe-02.vodafone.ib",
    vendor:"Nokia", hwModel:"7750 SR-1", layer:"IP Core", role:"pe",
    mgmtIp:"10.30.1.4", status:"DEGRADED",
    interfaces:[
      { name:"1/1/1", ip:"10.3.1.2/30",  description:"CORE >> ib-town-cr-02 1/1/2",    peer:"ib-town-cr-02"       },
      { name:"1/1/2", ip:"10.3.2.5/30",  description:"DC >> ib-town-dc-fabric-02",      peer:"ib-town-dc-fabric-02"},
    ],
    services:["ib-mpls-vpn"],
    goldenConfig:`# ib-town-pe-02 — Nokia 7750 SR-1 | IP Core
# !! DEGRADED — Memory 89% (threshold 85%)
configure router Base
  router-id 172.16.3.4
  interface "to-ib-town-cr-02"
    address 10.3.1.2/30
# ... [truncated] ...`,
  },

  {
    id:"ib-town-5gc-01", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-5gc-01.vodafone.ib",
    vendor:"Nokia", hwModel:"AirFrame Cloud", layer:"5G Core", role:"5gc",
    mgmtIp:"10.30.1.10", status:"UP",
    interfaces:[
      { name:"eth0", ip:"10.30.1.10/16", description:"Management",         peer:null           },
      { name:"eth1", ip:"10.3.5.1/30",   description:"N6 >> ib-town-igw-01",peer:"ib-town-igw-01"},
    ],
    services:["ib-5g-sa"],
    goldenConfig:`# ib-town-5gc-01 — Nokia AirFrame Cloud | 5G Core
nf amf
  plmn 21401
  tac 0x0001 0x0002 0x0003 0x0004
nf smf
  dnn internet
  dnn ims
  dnn enterprise
nf upf
  pool IB-UPF-POOL-1
  pool IB-UPF-POOL-2
# ... [truncated] ...`,
  },

  {
    id:"ib-town-amf-01", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-amf-01.vodafone.ib",
    vendor:"Nokia", hwModel:"vAMF", layer:"5G Core", role:"amf",
    mgmtIp:"10.30.1.11", status:"UP",
    interfaces:[
      { name:"eth0", ip:"10.30.1.11/16", description:"Management", peer:null},
      { name:"eth1", ip:"10.3.5.9/30",   description:"N2 >> RAN",  peer:null},
    ],
    services:["ib-5g-sa"],
    goldenConfig:`# ib-town-amf-01 — Nokia vAMF | 5G Core
amf-config:
  plmn-id: 21401
  tac-list: [1, 2, 3, 4]
# ... [truncated] ...`,
  },

  {
    id:"ib-town-smf-01", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-smf-01.vodafone.ib",
    vendor:"Nokia", hwModel:"vSMF", layer:"5G Core", role:"smf",
    mgmtIp:"10.30.1.12", status:"UP",
    interfaces:[
      { name:"eth0", ip:"10.30.1.12/16", description:"Management", peer:null},
    ],
    services:["ib-5g-sa"],
    goldenConfig:`# ib-town-smf-01 — Nokia vSMF | 5G Core
smf-config:
  dnn: internet
  dnn: ims
  dnn: enterprise
# ... [truncated] ...`,
  },

  {
    id:"ib-town-upf-01", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-upf-01.vodafone.ib",
    vendor:"Nokia", hwModel:"vUPF", layer:"5G Core", role:"upf",
    mgmtIp:"10.30.1.13", status:"UP",
    interfaces:[
      { name:"eth0", ip:"10.30.1.13/16", description:"Management",        peer:null          },
      { name:"eth1", ip:"10.3.5.5/30",   description:"N3/N9 user-plane",  peer:null          },
      { name:"eth2", ip:"10.3.5.13/30",  description:"N6 >> internet GW", peer:"ib-town-igw-01"},
    ],
    services:["ib-5g-sa"],
    goldenConfig:`# ib-town-upf-01 — Nokia vUPF | 5G Core
upf-config:
  pool: IB-UPF-POOL-1
  n3: 10.3.5.5
  n6: 10.3.5.13
# ... [truncated] ...`,
  },

  {
    id:"ib-town-upf-02", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-upf-02.vodafone.ib",
    vendor:"Nokia", hwModel:"vUPF", layer:"5G Core", role:"upf",
    mgmtIp:"10.30.1.14", status:"UP",
    interfaces:[
      { name:"eth1", ip:"10.3.5.17/30",  description:"N3/N9 user-plane",  peer:null          },
      { name:"eth2", ip:"10.3.5.21/30",  description:"N6 >> internet GW", peer:"ib-town-igw-02"},
    ],
    services:["ib-5g-sa"],
    goldenConfig:`# ib-town-upf-02 — Nokia vUPF | 5G Core (secondary pool)
upf-config:
  pool: IB-UPF-POOL-2
  n6: 10.3.5.21
# ... [truncated] ...`,
  },

  {
    id:"ib-town-voip-gw-01", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-voip-gw-01.vodafone.ib",
    vendor:"Cisco", hwModel:"CUBE 5400", layer:"Voice Core", role:"voip-gw",
    mgmtIp:"10.30.1.20", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/0", ip:"10.30.1.20/16", description:"Management", peer:null},
      { name:"GigabitEthernet0/1", ip:"10.3.6.1/30",   description:"SIP trunk Primary", peer:"ib-town-pe-01"},
    ],
    services:["ib-voice-core"],
    goldenConfig:`! ib-town-voip-gw-01 — Cisco CUBE 5400 | Voice Core (Primary)
hostname ib-town-voip-gw-01
voice service voip
 allow-connections sip to sip
 sip
  bind control source-interface GigabitEthernet0/1
! ... [truncated] ...`,
  },

  {
    id:"ib-town-voip-gw-02", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-voip-gw-02.vodafone.ib",
    vendor:"Cisco", hwModel:"CUBE 5400", layer:"Voice Core", role:"voip-gw",
    mgmtIp:"10.30.1.21", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/1", ip:"10.3.6.5/30", description:"SIP trunk Secondary", peer:"ib-town-pe-02"},
    ],
    services:["ib-voice-core"],
    goldenConfig:`! ib-town-voip-gw-02 — Cisco CUBE 5400 | Voice Core (Secondary/HA)
hostname ib-town-voip-gw-02
! ... [truncated] ...`,
  },

  {
    id:"ib-town-dc-fabric-01", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-dc-fabric-01.vodafone.ib",
    vendor:"Nokia", hwModel:"7220 IXR-D2", layer:"DC Fabric", role:"dc-fabric",
    mgmtIp:"10.30.1.30", status:"UP",
    interfaces:[
      { name:"ethernet-1/1", ip:"10.3.2.2/30",  description:"Uplink >> ib-town-pe-01",  peer:"ib-town-pe-01"},
      { name:"ethernet-1/2", ip:"10.30.2.1/24",  description:"Server fabric VLAN10",    peer:null           },
    ],
    services:["ib-iptv","ib-it-services"],
    goldenConfig:`# ib-town-dc-fabric-01 — Nokia 7220 IXR-D2 | DC Fabric
configure
  interface ethernet-1/1
    admin-state enable
    ipv4 address 10.3.2.2/30
  vlan 10
    name SERVER_FABRIC
# ... [truncated] ...`,
  },

  {
    id:"ib-town-dc-fabric-02", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-dc-fabric-02.vodafone.ib",
    vendor:"Nokia", hwModel:"7220 IXR-D2", layer:"DC Fabric", role:"dc-fabric",
    mgmtIp:"10.30.1.31", status:"UP",
    interfaces:[
      { name:"ethernet-1/1", ip:"10.3.2.6/30", description:"Uplink >> ib-town-pe-02",  peer:"ib-town-pe-02"},
    ],
    services:["ib-iptv","ib-it-services"],
    goldenConfig:`# ib-town-dc-fabric-02 — Nokia 7220 IXR-D2 | DC Fabric (redundant)
# ... [truncated] ...`,
  },

  {
    id:"ib-town-distr-sw01", siteId:"ib-town-dc1", country:"IB",
    hostname:"ib-town-distr-sw01.vodafone.ib",
    vendor:"Nokia", hwModel:"7210 SAS-M", layer:"IP LAN", role:"distr-sw",
    mgmtIp:"10.30.1.40", status:"UP",
    interfaces:[
      { name:"1/1/1", ip:"10.30.3.1/24", description:"Access VLAN 10", peer:null},
    ],
    services:["ib-fixed-bb"],
    goldenConfig:`# ib-town-distr-sw01 — Nokia 7210 SAS-M | IP LAN
configure interface 1/1/1
  vlan 10 name USER_LAN
# ... [truncated] ...`,
  },

  // ── Ibiza Sant Antoni DC ─────────────────────────────────────────────────

  {
    id:"ib-santantoni-pe-01", siteId:"ib-santantoni-dc1", country:"IB",
    hostname:"ib-santantoni-pe-01.vodafone.ib",
    vendor:"Juniper", hwModel:"MX204", layer:"IP Core", role:"pe",
    mgmtIp:"10.30.2.1", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.3.0.10/30", description:"CORE >> ib-town-cr-01 1/1/3",  peer:"ib-town-cr-01"       },
      { name:"xe-0/0/1", ip:"10.3.3.1/30",  description:"DC >> ib-santantoni-dc-fabric-01", peer:"ib-santantoni-dc-fabric-01"},
    ],
    services:["ib-mpls-vpn"],
    goldenConfig:`set system host-name ib-santantoni-pe-01
set interfaces xe-0/0/0 description "CORE >> ib-town-cr-01"
set interfaces xe-0/0/0 unit 0 family inet address 10.3.0.10/30
set protocols bgp group IBGP-CORE type internal
set protocols bgp group IBGP-CORE neighbor 172.16.3.1 description "ib-town-cr-01"
set routing-options autonomous-system 65003
# ... [truncated] ...`,
  },

  {
    id:"ib-santantoni-dc-fabric-01", siteId:"ib-santantoni-dc1", country:"IB",
    hostname:"ib-santantoni-dc-fabric-01.vodafone.ib",
    vendor:"Juniper", hwModel:"QFX5120-32C", layer:"DC Fabric", role:"dc-fabric",
    mgmtIp:"10.30.2.5", status:"UP",
    interfaces:[
      { name:"et-0/0/0", ip:"10.3.3.2/30", description:"Uplink >> ib-santantoni-pe-01", peer:"ib-santantoni-pe-01"},
    ],
    services:["ib-iptv","ib-it-services"],
    goldenConfig:`set system host-name ib-santantoni-dc-fabric-01
set interfaces et-0/0/0 description "Uplink >> ib-santantoni-pe-01"
# ... [truncated] ...`,
  },

  {
    id:"ib-santantoni-distr-sw01", siteId:"ib-santantoni-dc1", country:"IB",
    hostname:"ib-santantoni-distr-sw01.vodafone.ib",
    vendor:"Juniper", hwModel:"EX4300-48T", layer:"IP LAN", role:"distr-sw",
    mgmtIp:"10.30.2.10", status:"DOWN",
    interfaces:[
      { name:"ge-0/0/0", ip:"10.30.4.1/24", description:"Access distribution", peer:null},
    ],
    services:["ib-fixed-bb"],
    goldenConfig:`set system host-name ib-santantoni-distr-sw01
# *** NODE DOWN — Power supply PSU-1 failure ***
# ... [config not retrievable — node unreachable] ...`,
  },

  {
    id:"ib-santantoni-acc-sw01", siteId:"ib-santantoni-dc1", country:"IB",
    hostname:"ib-santantoni-acc-sw01.vodafone.ib",
    vendor:"Juniper", hwModel:"EX2300-24P", layer:"IP LAN", role:"acc-sw",
    mgmtIp:"10.30.2.11", status:"UP",
    interfaces:[
      { name:"ge-0/0/0", ip:"10.30.4.2/24", description:"Access LAN", peer:null},
    ],
    services:["ib-fixed-bb"],
    goldenConfig:`set system host-name ib-santantoni-acc-sw01
# ... [truncated] ...`,
  },

  {
    id:"ib-santantoni-bpop-01", siteId:"ib-santantoni-dc1", country:"IB",
    hostname:"ib-santantoni-bpop-01.vodafone.ib",
    vendor:"Ericsson", hwModel:"MINI-LINK 6477", layer:"BPoP", role:"bpop",
    mgmtIp:"10.30.2.15", status:"UP",
    interfaces:[
      { name:"eth1", ip:"10.3.7.1/30", description:"Backhaul >> ib-town-cr-01", peer:"ib-town-cr-01"},
    ],
    services:["ib-5g-nsa"],
    goldenConfig:`# ib-santantoni-bpop-01 — Ericsson MINI-LINK 6477 | BPoP
node-name: ib-santantoni-bpop-01
radio-link-1:
  capacity: 2Gbps
  peer: ib-town-cr-01
# ... [truncated] ...`,
  },

  // ── Ibiza Santa Eulalia DC ───────────────────────────────────────────────

  {
    id:"ib-santaeulalia-pe-01", siteId:"ib-santaeulalia-dc1", country:"IB",
    hostname:"ib-santaeulalia-pe-01.vodafone.ib",
    vendor:"Juniper", hwModel:"MX104", layer:"IP Core", role:"pe",
    mgmtIp:"10.30.3.1", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.3.1.6/30",  description:"CORE >> ib-town-cr-02 1/1/3",         peer:"ib-town-cr-02"        },
      { name:"xe-0/0/1", ip:"10.3.4.1/30",  description:"DC >> ib-santaeulalia-dc-fabric-01",   peer:"ib-santaeulalia-dc-fabric-01"},
    ],
    services:["ib-mpls-vpn"],
    goldenConfig:`set system host-name ib-santaeulalia-pe-01
set interfaces xe-0/0/0 description "CORE >> ib-town-cr-02"
set interfaces xe-0/0/0 unit 0 family inet address 10.3.1.6/30
set routing-options autonomous-system 65003
# ... [truncated] ...`,
  },

  {
    id:"ib-santaeulalia-dc-fabric-01", siteId:"ib-santaeulalia-dc1", country:"IB",
    hostname:"ib-santaeulalia-dc-fabric-01.vodafone.ib",
    vendor:"Cisco", hwModel:"Nexus 3000", layer:"DC Fabric", role:"dc-fabric",
    mgmtIp:"10.30.3.5", status:"UP",
    interfaces:[
      { name:"Ethernet1/1", ip:"10.3.4.2/30", description:"Uplink >> ib-santaeulalia-pe-01", peer:"ib-santaeulalia-pe-01"},
    ],
    services:["ib-it-services"],
    goldenConfig:`! ib-santaeulalia-dc-fabric-01 — Cisco Nexus 3000 | DC Fabric
hostname ib-santaeulalia-dc-fabric-01
# ... [truncated] ...`,
  },

  {
    id:"ib-santaeulalia-distr-sw01", siteId:"ib-santaeulalia-dc1", country:"IB",
    hostname:"ib-santaeulalia-distr-sw01.vodafone.ib",
    vendor:"Cisco", hwModel:"Catalyst 9300-48P", layer:"IP LAN", role:"distr-sw",
    mgmtIp:"10.30.3.10", status:"UP",
    interfaces:[
      { name:"TenGigabitEthernet1/0/1", ip:"10.30.5.1/24", description:"Access distribution", peer:null},
    ],
    services:["ib-fixed-bb"],
    goldenConfig:`! ib-santaeulalia-distr-sw01 — Cisco Catalyst 9300 | IP LAN
hostname ib-santaeulalia-distr-sw01
# ... [truncated] ...`,
  },

  {
    id:"ib-santaeulalia-acc-sw01", siteId:"ib-santaeulalia-dc1", country:"IB",
    hostname:"ib-santaeulalia-acc-sw01.vodafone.ib",
    vendor:"Cisco", hwModel:"Catalyst 3850-48P", layer:"IP LAN", role:"acc-sw",
    mgmtIp:"10.30.3.11", status:"DEGRADED",
    interfaces:[
      { name:"GigabitEthernet1/0/1", ip:"10.30.5.2/24", description:"Access LAN — STP change", peer:null},
    ],
    services:["ib-fixed-bb"],
    goldenConfig:`! ib-santaeulalia-acc-sw01 — Cisco Catalyst 3850 | IP LAN
! !! DEGRADED — STP topology change in progress
hostname ib-santaeulalia-acc-sw01
spanning-tree mode rapid-pvst
! ... [truncated] ...`,
  },

  {
    id:"ib-santaeulalia-apop-01", siteId:"ib-santaeulalia-dc1", country:"IB",
    hostname:"ib-santaeulalia-apop-01.vodafone.ib",
    vendor:"Ericsson", hwModel:"MINI-LINK 6448", layer:"APoP", role:"apop",
    mgmtIp:"10.30.3.15", status:"UP",
    interfaces:[
      { name:"eth1", ip:"10.3.7.5/30", description:"Backhaul >> ib-town-cr-02", peer:"ib-town-cr-02"},
    ],
    services:["ib-5g-nsa"],
    goldenConfig:`# ib-santaeulalia-apop-01 — Ericsson MINI-LINK 6448 | APoP
node-name: ib-santaeulalia-apop-01
# ... [truncated] ...`,
  },

  // ── Ibiza Es Canar DC ────────────────────────────────────────────────────

  {
    id:"ib-escanar-pe-01", siteId:"ib-escanar-dc1", country:"IB",
    hostname:"ib-escanar-pe-01.vodafone.ib",
    vendor:"Cisco", hwModel:"ASR 901", layer:"IP Core", role:"pe",
    mgmtIp:"10.30.4.1", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/0", ip:"10.3.8.2/30", description:"CORE >> ib-town-asr-01",  peer:"ib-town-asr-01"},
    ],
    services:["ib-it-services"],
    goldenConfig:`! ib-escanar-pe-01 — Cisco ASR 901 | IP Core (edge DC)
hostname ib-escanar-pe-01
# ... [truncated] ...`,
  },

  {
    id:"ib-escanar-acc-sw01", siteId:"ib-escanar-dc1", country:"IB",
    hostname:"ib-escanar-acc-sw01.vodafone.ib",
    vendor:"Cisco", hwModel:"Catalyst 2960X-24TS", layer:"IP LAN", role:"acc-sw",
    mgmtIp:"10.30.4.5", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/1", ip:"10.30.6.1/24", description:"Access LAN", peer:null},
    ],
    services:["ib-fixed-bb"],
    goldenConfig:`! ib-escanar-acc-sw01 — Cisco Catalyst 2960X | IP LAN
hostname ib-escanar-acc-sw01
# ... [truncated] ...`,
  },

  {
    id:"ib-escanar-apop-01", siteId:"ib-escanar-dc1", country:"IB",
    hostname:"ib-escanar-apop-01.vodafone.ib",
    vendor:"Ericsson", hwModel:"MINI-LINK 6448", layer:"APoP", role:"apop",
    mgmtIp:"10.30.4.10", status:"UP",
    interfaces:[
      { name:"eth1", ip:"10.3.8.5/30", description:"Backhaul >> ib-town-asr-01", peer:"ib-town-asr-01"},
    ],
    services:["ib-5g-nsa"],
    goldenConfig:`# ib-escanar-apop-01 — Ericsson MINI-LINK 6448 | APoP
# ... [truncated] ...`,
  },

  // ── Ibiza Portinatx DC ───────────────────────────────────────────────────

  {
    id:"ib-portinatx-pe-01", siteId:"ib-portinatx-dc1", country:"IB",
    hostname:"ib-portinatx-pe-01.vodafone.ib",
    vendor:"Cisco", hwModel:"ASR 901", layer:"IP Core", role:"pe",
    mgmtIp:"10.30.5.1", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/0", ip:"10.3.9.2/30", description:"CORE >> ib-town-asr-02", peer:"ib-town-asr-02"},
    ],
    services:["ib-it-services"],
    goldenConfig:`! ib-portinatx-pe-01 — Cisco ASR 901 | IP Core (north edge DC)
hostname ib-portinatx-pe-01
# ... [truncated] ...`,
  },

  {
    id:"ib-portinatx-acc-sw01", siteId:"ib-portinatx-dc1", country:"IB",
    hostname:"ib-portinatx-acc-sw01.vodafone.ib",
    vendor:"Cisco", hwModel:"Catalyst 2960X-24TS", layer:"IP LAN", role:"acc-sw",
    mgmtIp:"10.30.5.5", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/1", ip:"10.30.7.1/24", description:"Access LAN", peer:null},
    ],
    services:["ib-fixed-bb"],
    goldenConfig:`! ib-portinatx-acc-sw01 — Cisco Catalyst 2960X | IP LAN
# ... [truncated] ...`,
  },

  // ── Ibiza Town Core PoP ──────────────────────────────────────────────────

  {
    id:"ib-town-asr-01", siteId:"ib-town-core1", country:"IB",
    hostname:"ib-town-asr-01.vodafone.ib",
    vendor:"Cisco", hwModel:"ASR 9901", layer:"Transport", role:"asr",
    mgmtIp:"10.30.6.1", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/0/0/0", ip:"10.3.0.18/30", description:"CORE >> ib-town-cr-01 1/1/5",    peer:"ib-town-cr-01"  },
      { name:"GigabitEthernet0/0/0/1", ip:"10.3.8.1/30",  description:"EDGE >> ib-escanar-pe-01",       peer:"ib-escanar-pe-01"},
      { name:"GigabitEthernet0/0/0/2", ip:"10.3.10.1/30", description:"UPLINK >> ib-town-igw-03 xe-0/0/0",peer:"ib-town-igw-03"},
    ],
    services:["ib-sdwan"],
    goldenConfig:`! ib-town-asr-01 — Cisco ASR 9901 | Transport
hostname ib-town-asr-01
!
interface GigabitEthernet0/0/0/0
 description ** CORE >> ib-town-cr-01 **
 ipv4 address 10.3.0.18 255.255.255.252
interface GigabitEthernet0/0/0/1
 description ** EDGE >> ib-escanar-pe-01 **
 ipv4 address 10.3.8.1 255.255.255.252
! ... [truncated] ...`,
  },

  {
    id:"ib-town-asr-02", siteId:"ib-town-core1", country:"IB",
    hostname:"ib-town-asr-02.vodafone.ib",
    vendor:"Cisco", hwModel:"ASR 9901", layer:"Transport", role:"asr",
    mgmtIp:"10.30.6.2", status:"UP",
    interfaces:[
      { name:"GigabitEthernet0/0/0/0", ip:"10.3.0.22/30", description:"CORE >> ib-town-cr-01", peer:"ib-town-cr-01"    },
      { name:"GigabitEthernet0/0/0/1", ip:"10.3.9.1/30",  description:"EDGE >> ib-portinatx-pe-01", peer:"ib-portinatx-pe-01"},
    ],
    services:["ib-sdwan"],
    goldenConfig:`! ib-town-asr-02 — Cisco ASR 9901 | Transport (redundant)
# ... [truncated] ...`,
  },

  // ── Ibiza IXPs ───────────────────────────────────────────────────────────

  {
    id:"ib-town-igw-01", siteId:"ib-town-ixp1", country:"IB",
    hostname:"ib-town-igw-01.vodafone.ib",
    vendor:"Nokia", hwModel:"7750 SR-7", layer:"Internet GW", role:"igw",
    mgmtIp:"10.30.7.1", status:"UP",
    interfaces:[
      { name:"1/1/1", ip:"10.3.0.14/30",  description:"CORE << ib-town-cr-01 1/1/4", peer:"ib-town-cr-01"},
      { name:"1/1/2", ip:"4.0.1.2/30",    description:"UPSTREAM Lumen AS3356",       peer:null          },
    ],
    services:["ib-internet-transit","ib-cdn","ib-sdwan"],
    goldenConfig:`# ib-town-igw-01 — Nokia 7750 SR-7 | Internet GW (Lumen)
configure router Base
  interface "to-ib-town-cr-01"
    address 10.3.0.14/30
    port 1/1/1
  interface "to-LUMEN-AS3356"
    address 4.0.1.2/30
    port 1/1/2
  bgp group "UPSTREAM-LUMEN"
    type external
    peer-as 3356
    neighbor 4.0.1.1 description "Lumen Technologies"
  bgp group "IBGP-CORE"
    type internal
    neighbor 172.16.3.1 description "ib-town-cr-01"
# ... [truncated] ...`,
  },

  {
    id:"ib-town-igw-02", siteId:"ib-town-ixp2", country:"IB",
    hostname:"ib-town-igw-02.vodafone.ib",
    vendor:"Nokia", hwModel:"7750 SR-1", layer:"Internet GW", role:"igw",
    mgmtIp:"10.30.7.2", status:"UP",
    interfaces:[
      { name:"1/1/1", ip:"10.3.0.22/30",  description:"CORE << ib-town-cr-02 1/1/4", peer:"ib-town-cr-02"},
      { name:"1/1/2", ip:"213.0.1.2/30",  description:"UPSTREAM Telia AS1299",       peer:null          },
    ],
    services:["ib-internet-transit","ib-cdn","ib-sdwan"],
    goldenConfig:`# ib-town-igw-02 — Nokia 7750 SR-1 | Internet GW (Telia)
configure router Base
  interface "to-TELIA-AS1299"
    address 213.0.1.2/30
  bgp group "UPSTREAM-TELIA"
    peer-as 1299
    neighbor 213.0.1.1 description "Telia Carrier"
# ... [truncated] ...`,
  },

  {
    id:"ib-town-igw-03", siteId:"ib-town-ixp3", country:"IB",
    hostname:"ib-town-igw-03.vodafone.ib",
    vendor:"Juniper", hwModel:"MX204", layer:"Internet GW", role:"igw",
    mgmtIp:"10.30.7.3", status:"UP",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.3.10.2/30",  description:"CORE << ib-town-asr-01 Gi0/0/0/2", peer:"ib-town-asr-01"},
      { name:"xe-0/0/1", ip:"89.0.1.2/30",   description:"UPSTREAM GTT AS3257",               peer:null          },
    ],
    services:["ib-internet-transit","ib-cdn"],
    goldenConfig:`set system host-name ib-town-igw-03
set interfaces xe-0/0/1 description "UPSTREAM GTT AS3257"
set interfaces xe-0/0/1 unit 0 family inet address 89.0.1.2/30
set protocols bgp group UPSTREAM-GTT peer-as 3257
set protocols bgp group UPSTREAM-GTT neighbor 89.0.1.1
set routing-options autonomous-system 65003
# ... [truncated] ...`,
  },

  {
    id:"ib-town-igw-04", siteId:"ib-town-ixp4", country:"IB",
    hostname:"ib-town-igw-04.vodafone.ib",
    vendor:"Juniper", hwModel:"MX104", layer:"Internet GW", role:"igw",
    mgmtIp:"10.30.7.4", status:"DEGRADED",
    interfaces:[
      { name:"xe-0/0/0", ip:"10.3.0.26/30",  description:"CORE << ib-town-cr-02", peer:"ib-town-cr-02"},
      { name:"xe-0/0/1", ip:"64.0.1.2/30",   description:"UPSTREAM Zayo AS6461 — prefix count dropping", peer:null},
    ],
    services:["ib-internet-transit"],
    goldenConfig:`set system host-name ib-town-igw-04
# !! DEGRADED — BGP prefix count 8,402 (expected >12,000)
set interfaces xe-0/0/1 description "UPSTREAM Zayo AS6461"
set interfaces xe-0/0/1 unit 0 family inet address 64.0.1.2/30
set protocols bgp group UPSTREAM-ZAYO peer-as 6461
set protocols bgp group UPSTREAM-ZAYO neighbor 64.0.1.1
# ... [truncated] ...`,
  },
];

// ─── SERVICES ─────────────────────────────────────────────────────────────────
export const SERVICES = [
  // ── FIJI ────────────────────────────────────────────────────────────────────
  {
    id:"fj-internet-transit", country:"FJ",
    name:"Internet Transit", criticality:"Critical", layer:"Internet GW",
    nodes:["fj-suva-igw-01","fj-suva-igw-02","fj-suva-cr-01"],
    description:"Dual-homed internet transit via Telstra (AS1221) and PCCW (AS3491). Primary exit via igw-01.",
  },
  {
    id:"fj-5g-data", country:"FJ",
    name:"5G Data", criticality:"Critical", layer:"5G Core",
    nodes:["fj-suva-5gc-01","fj-suva-cr-01","fj-suva-bpop-01"],
    description:"5G SA/NSA data service for Fiji subscribers. 5GC hosted in Suva DC1.",
  },
  {
    id:"fj-voice-core", country:"FJ",
    name:"Voice Core", criticality:"Critical", layer:"Voice Core",
    nodes:["fj-suva-voip-gw-01","fj-suva-pe-01","fj-lautoka-pe-01"],
    description:"National voice services via Cisco CUBE. PSTN interconnect at Suva DC1.",
  },
  {
    id:"fj-fixed-bb", country:"FJ",
    name:"Fixed Broadband", criticality:"High", layer:"IP LAN",
    nodes:["fj-suva-distr-sw01","fj-suva-bpop-01","fj-lautoka-pe-01","fj-lautoka-acc-sw01"],
    description:"Fixed broadband residential and SME service via DSLAM and Ethernet.",
  },
  {
    id:"fj-mpls-vpn", country:"FJ",
    name:"MPLS VPN Enterprise", criticality:"High", layer:"IP Core",
    nodes:["fj-suva-cr-01","fj-suva-pe-01","fj-lautoka-pe-01"],
    description:"L3 VPN service for enterprise customers. Route targets: 65001:100.",
  },
  {
    id:"fj-it-services", country:"FJ",
    name:"IT Services", criticality:"Medium", layer:"DC Fabric",
    nodes:["fj-suva-dc-fabric-01","fj-lautoka-dc-fabric-01"],
    description:"Internal IT systems, OSS/BSS platforms, and hosted enterprise applications.",
  },

  // ── HAWAII ──────────────────────────────────────────────────────────────────
  {
    id:"hw-internet-transit", country:"HW",
    name:"Internet Transit", criticality:"Critical", layer:"Internet GW",
    nodes:["hw-hnl-igw-01","hw-hnl-igw-02","hw-hnl-igw-03","hw-hnl1-cr-01","hw-hnl1-cr-02"],
    description:"Triple-homed internet transit via AT&T (AS7018), Cogent (AS174), Hurricane Electric (AS6939).",
  },
  {
    id:"hw-5g-sa", country:"HW",
    name:"5G SA", criticality:"Critical", layer:"5G Core",
    nodes:["hw-hnl1-5gc-01","hw-hnl1-amf-01","hw-hnl1-upf-01"],
    description:"5G Standalone core. AMF, SMF, UPF hosted on Nokia AirFrame in Honolulu DC1.",
  },
  {
    id:"hw-5g-nsa", country:"HW",
    name:"5G NSA", criticality:"Critical", layer:"5G Core",
    nodes:["hw-hnl1-cr-01","hw-hnl1-cr-02","hw-hnl-bpop-01","hw-maui-apop-01"],
    description:"5G Non-Standalone service anchored on 4G EPC. Backhaul via BPoP/APoP.",
  },
  {
    id:"hw-voice-core", country:"HW",
    name:"Voice Core", criticality:"Critical", layer:"Voice Core",
    nodes:["hw-hnl2-voip-gw-01","hw-hnl1-pe-01"],
    description:"National voice and IMS services. CUBE HA pair at Honolulu DC2.",
  },
  {
    id:"hw-fixed-bb", country:"HW",
    name:"Fixed Broadband", criticality:"High", layer:"IP LAN",
    nodes:["hw-hnl2-distr-sw01","hw-maui-distr-sw01","hw-maui-acc-sw01","hw-hnl-bpop-01"],
    description:"Fixed broadband residential service. Maui aggregated via BPoP/APoP.",
  },
  {
    id:"hw-iptv", country:"HW",
    name:"IPTV", criticality:"High", layer:"DC Fabric",
    nodes:["hw-hnl1-dc-fabric-01","hw-hnl2-dc-fabric-01"],
    description:"IPTV streaming platform. Content servers co-located in Honolulu DC1 and DC2.",
  },
  {
    id:"hw-mpls-vpn", country:"HW",
    name:"MPLS VPN", criticality:"High", layer:"IP Core",
    nodes:["hw-hnl1-cr-01","hw-hnl1-cr-02","hw-maui-cr-01","hw-hnl2-pe-01","hw-hnl1-pe-01"],
    description:"L3 VPN enterprise service. Route targets: 65002:100.",
  },
  {
    id:"hw-it-services", country:"HW",
    name:"IT Services", criticality:"Medium", layer:"DC Fabric",
    nodes:["hw-hnl1-dc-fabric-01","hw-hnl2-dc-fabric-01","hw-maui-dc-fabric-01"],
    description:"Internal OSS/BSS, network management systems and enterprise apps.",
  },

  // ── IBIZA ───────────────────────────────────────────────────────────────────
  {
    id:"ib-internet-transit", country:"IB",
    name:"Internet Transit", criticality:"Critical", layer:"Internet GW",
    nodes:["ib-town-igw-01","ib-town-igw-02","ib-town-igw-03","ib-town-igw-04","ib-town-cr-01","ib-town-cr-02"],
    description:"Quad-homed internet transit: Lumen (AS3356), Telia (AS1299), GTT (AS3257), Zayo (AS6461).",
  },
  {
    id:"ib-5g-sa", country:"IB",
    name:"5G SA", criticality:"Critical", layer:"5G Core",
    nodes:["ib-town-5gc-01","ib-town-amf-01","ib-town-smf-01","ib-town-upf-01","ib-town-upf-02"],
    description:"5G Standalone core with dual UPF pools. AMF, SMF hosted on Nokia AirFrame in Ibiza Town DC1.",
  },
  {
    id:"ib-5g-nsa", country:"IB",
    name:"5G NSA", criticality:"Critical", layer:"5G Core",
    nodes:["ib-town-cr-01","ib-town-cr-02","ib-santantoni-bpop-01","ib-santaeulalia-apop-01","ib-escanar-apop-01"],
    description:"5G Non-Standalone. Island-wide coverage via BPoP in Sant Antoni and APoPs in east/centre.",
  },
  {
    id:"ib-voice-core", country:"IB",
    name:"Voice Core", criticality:"Critical", layer:"Voice Core",
    nodes:["ib-town-voip-gw-01","ib-town-voip-gw-02"],
    description:"Voice and IMS. Active/Active CUBE pair for national PSTN interconnect.",
  },
  {
    id:"ib-fixed-bb", country:"IB",
    name:"Fixed Broadband", criticality:"High", layer:"IP LAN",
    nodes:["ib-town-distr-sw01","ib-santantoni-distr-sw01","ib-santantoni-acc-sw01","ib-santaeulalia-distr-sw01","ib-santaeulalia-acc-sw01","ib-escanar-acc-sw01","ib-portinatx-acc-sw01"],
    description:"Fixed broadband island-wide. Residential and SME via VDSL/Ethernet aggregation.",
  },
  {
    id:"ib-iptv", country:"IB",
    name:"IPTV", criticality:"High", layer:"DC Fabric",
    nodes:["ib-town-dc-fabric-01","ib-town-dc-fabric-02","ib-santantoni-dc-fabric-01"],
    description:"IPTV/OTT streaming. Content CDN nodes in Town DC1 and Sant Antoni.",
  },
  {
    id:"ib-mpls-vpn", country:"IB",
    name:"MPLS VPN", criticality:"High", layer:"IP Core",
    nodes:["ib-town-cr-01","ib-town-cr-02","ib-town-pe-01","ib-town-pe-02","ib-santantoni-pe-01","ib-santaeulalia-pe-01"],
    description:"L3 VPN enterprise and government service. Route targets: 65003:100.",
  },
  {
    id:"ib-sdwan", country:"IB",
    name:"SD-WAN", criticality:"High", layer:"Internet GW",
    nodes:["ib-town-igw-01","ib-town-igw-02","ib-town-asr-01","ib-town-asr-02"],
    description:"SD-WAN overlay for enterprise branch connectivity across the island.",
  },
  {
    id:"ib-it-services", country:"IB",
    name:"IT Services", criticality:"Medium", layer:"DC Fabric",
    nodes:["ib-town-dc-fabric-01","ib-town-dc-fabric-02","ib-santantoni-dc-fabric-01","ib-santaeulalia-dc-fabric-01","ib-escanar-pe-01","ib-portinatx-pe-01"],
    description:"OSS/BSS, network management, and enterprise hosted services across 5 DCs.",
  },
  {
    id:"ib-cdn", country:"IB",
    name:"CDN", criticality:"High", layer:"Internet GW",
    nodes:["ib-town-igw-01","ib-town-igw-02","ib-town-igw-03"],
    description:"Content Delivery Network edge nodes peered directly with upstream providers.",
  },
];

// ─── ALARMS ───────────────────────────────────────────────────────────────────
// Seed alarms correlated with DEGRADED/DOWN node statuses
export const ALARMS = [
  {
    id:"alm-001", nodeId:"fj-lautoka-acc-sw01", country:"FJ",
    type:"REACHABILITY", severity:"Critical",
    message:"Node unreachable — ICMP timeout after 5 consecutive probes",
    since:"2026-03-24T06:12:00", status:"OPEN",
    affectedServices:["fj-fixed-bb"],
  },
  {
    id:"alm-002", nodeId:"fj-suva-voip-gw-01", country:"FJ",
    type:"PERFORMANCE", severity:"Major",
    message:"CPU utilization 95% — sustained above 80% threshold for 45 min",
    since:"2026-03-24T09:45:00", status:"OPEN",
    affectedServices:["fj-voice-core"],
  },
  {
    id:"alm-003", nodeId:"hw-hnl1-pe-01", country:"HW",
    type:"INTERFACE", severity:"Major",
    message:"Interface xe-0/0/2 flapping — 8 state changes in 15 minutes",
    since:"2026-03-24T11:30:00", status:"OPEN",
    affectedServices:["hw-voice-core","hw-mpls-vpn"],
  },
  {
    id:"alm-004", nodeId:"hw-maui-pe-01", country:"HW",
    type:"REACHABILITY", severity:"Critical",
    message:"BGP session DOWN to upstream — prefix count 0, node unreachable",
    since:"2026-03-24T08:05:00", status:"OPEN",
    affectedServices:["hw-mpls-vpn"],
  },
  {
    id:"alm-005", nodeId:"hw-hnl-bpop-01", country:"HW",
    type:"PERFORMANCE", severity:"Major",
    message:"Packet loss 12% on access radio links — threshold 1%",
    since:"2026-03-24T13:20:00", status:"ACKNOWLEDGED",
    affectedServices:["hw-5g-nsa","hw-fixed-bb"],
  },
  {
    id:"alm-006", nodeId:"ib-town-pe-02", country:"IB",
    type:"PERFORMANCE", severity:"Major",
    message:"Memory utilization 89% — threshold 85%, risk of process restart",
    since:"2026-03-24T10:15:00", status:"OPEN",
    affectedServices:["ib-mpls-vpn"],
  },
  {
    id:"alm-007", nodeId:"ib-santantoni-distr-sw01", country:"IB",
    type:"HARDWARE", severity:"Critical",
    message:"Power supply PSU-1 failure — node running on PSU-2 only, no redundancy",
    since:"2026-03-24T07:30:00", status:"OPEN",
    affectedServices:["ib-fixed-bb"],
  },
  {
    id:"alm-008", nodeId:"ib-santaeulalia-acc-sw01", country:"IB",
    type:"PROTOCOL", severity:"Minor",
    message:"STP topology change detected — RSTP convergence in progress",
    since:"2026-03-24T14:05:00", status:"OPEN",
    affectedServices:["ib-fixed-bb"],
  },
  {
    id:"alm-009", nodeId:"ib-town-igw-04", country:"IB",
    type:"ROUTING", severity:"Major",
    message:"BGP prefix count dropping — received 8,402 routes (expected >12,000 from Zayo AS6461)",
    since:"2026-03-24T12:50:00", status:"OPEN",
    affectedServices:["ib-internet-transit"],
  },
];

// ─── COUNTRY META ─────────────────────────────────────────────────────────────
export const COUNTRY_META = {
  FJ:{ name:"Fiji",   flag:"🇫🇯", asn:"AS 65001", mgmt:"10.10.0.0/16", loopback:"172.16.1.0/24" },
  HW:{ name:"Hawaii", flag:"🌺",  asn:"AS 65002", mgmt:"10.20.0.0/16", loopback:"172.16.2.0/24" },
  IB:{ name:"Ibiza",  flag:"🏝",  asn:"AS 65003", mgmt:"10.30.0.0/16", loopback:"172.16.3.0/24" },
};

// ─── LAYERS ───────────────────────────────────────────────────────────────────
export const LAYERS = [
  "IP Core","Internet GW","5G Core","Voice Core","DC Fabric","IP LAN","BPoP","APoP","Transport"
];
