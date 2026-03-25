// ─── ALARMS ───────────────────────────────────────────────────────────────────
// Seed alarms correlated with DEGRADED/DOWN node statuses
// type: REACHABILITY | PERFORMANCE | INTERFACE | PROTOCOL | HARDWARE | ROUTING | SECURITY
// severity: Critical | Major | Minor
// status: OPEN | ACKNOWLEDGED | RESOLVED

export const ALARMS = [
  {
    id:"alm-001", nodeId:"fj-lautoka-acc-sw01", country:"FJ",
    type:"REACHABILITY", severity:"Critical",
    message:"Node unreachable — ICMP timeout after 5 consecutive probes",
    detail:"Last seen: 2026-03-24T06:10:00Z. Possible power or uplink failure.",
    since:"2026-03-24T06:12:00", status:"OPEN",
    affectedServices:["fj-fixed-bb"],
  },
  {
    id:"alm-002", nodeId:"fj-suva-voip-gw-01", country:"FJ",
    type:"PERFORMANCE", severity:"Major",
    message:"CPU utilization 95% — sustained above 80% threshold for 45 min",
    detail:"High call volume detected. Consider call admission control or scaling.",
    since:"2026-03-24T09:45:00", status:"OPEN",
    affectedServices:["fj-voice-core"],
  },
  {
    id:"alm-003", nodeId:"hw-hnl1-pe-01", country:"HW",
    type:"INTERFACE", severity:"Major",
    message:"Interface xe-0/0/2 flapping — 8 state changes in 15 minutes",
    detail:"Possible SFP failure or fiber issue. Interface connecting to Honolulu DC2.",
    since:"2026-03-24T11:30:00", status:"OPEN",
    affectedServices:["hw-voice-core","hw-mpls-vpn"],
  },
  {
    id:"alm-004", nodeId:"hw-maui-pe-01", country:"HW",
    type:"REACHABILITY", severity:"Critical",
    message:"BGP session DOWN to upstream — prefix count 0, node unreachable",
    detail:"BGP hold timer expired. Maui enterprise traffic rerouting in progress.",
    since:"2026-03-24T08:05:00", status:"OPEN",
    affectedServices:["hw-mpls-vpn"],
  },
  {
    id:"alm-005", nodeId:"hw-hnl-bpop-01", country:"HW",
    type:"PERFORMANCE", severity:"Major",
    message:"Packet loss 12% on access radio links — threshold 1%",
    detail:"Radio link degradation. Possible interference or equipment issue.",
    since:"2026-03-24T13:20:00", status:"ACKNOWLEDGED",
    affectedServices:["hw-5g-nsa","hw-fixed-bb"],
  },
  {
    id:"alm-006", nodeId:"ib-town-pe-02", country:"IB",
    type:"PERFORMANCE", severity:"Major",
    message:"Memory utilization 89% — threshold 85%, risk of process restart",
    detail:"VRF table growth suspected. Review MPLS VPN route counts and BGP policy.",
    since:"2026-03-24T10:15:00", status:"OPEN",
    affectedServices:["ib-mpls-vpn"],
  },
  {
    id:"alm-007", nodeId:"ib-santantoni-distr-sw01", country:"IB",
    type:"HARDWARE", severity:"Critical",
    message:"Power supply PSU-1 failure — node running on PSU-2 only, no redundancy",
    detail:"PSU-1 FRU fault. Node at risk — replace PSU-1 before next maintenance window.",
    since:"2026-03-24T07:30:00", status:"OPEN",
    affectedServices:["ib-fixed-bb"],
  },
  {
    id:"alm-008", nodeId:"ib-santaeulalia-acc-sw01", country:"IB",
    type:"PROTOCOL", severity:"Minor",
    message:"STP topology change detected — RSTP convergence in progress",
    detail:"TCN received from port Gi1/0/3. Upstream MAC table flush may cause temporary disruption.",
    since:"2026-03-24T14:05:00", status:"OPEN",
    affectedServices:["ib-fixed-bb"],
  },
  {
    id:"alm-009", nodeId:"ib-town-igw-04", country:"IB",
    type:"ROUTING", severity:"Major",
    message:"BGP prefix count dropping — received 8,402 routes (expected >12,000 from Zayo AS6461)",
    detail:"Possible Zayo route policy change or partial outage. Internet traffic shifted to other 3 upstreams.",
    since:"2026-03-24T12:50:00", status:"OPEN",
    affectedServices:["ib-internet-transit"],
  },
  {
    id:"alm-010", nodeId:"hw-hnl1-nms-02", country:"HW",
    type:"PERFORMANCE", severity:"Minor",
    message:"Disk I/O saturation on /var/log — write latency >200ms",
    detail:"Log rotation may be lagging. Review retention policy and disk capacity.",
    since:"2026-03-24T15:30:00", status:"OPEN",
    affectedServices:["hw-it-services"],
  },
];
