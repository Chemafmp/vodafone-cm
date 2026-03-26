// ─── NETWORK EVENTS ──────────────────────────────────────────────────────────
// Synthetic event log for the Events view.
// type: INTERFACE | BGP | CONFIG | ALARM | TRAFFIC | SECURITY | SYSTEM | CHANGE | AUTOMATION
// severity: info | warning | error | critical
// source: manual | camunda | sdn-controller | tdo | hco | ansible | terraform | script | noc-engineer
// changeId: optional — links event to a change record for correlation

export const AUTOMATION_SOURCES = {
  "camunda":        { label:"Camunda Workflow", icon:"⚙️", color:"#2563eb" },
  "sdn-controller": { label:"SDN Controller",  icon:"🔀", color:"#7c3aed" },
  "tdo":            { label:"TDO",              icon:"📋", color:"#0d9488" },
  "hco":            { label:"HCO",              icon:"🏗", color:"#b45309" },
  "ansible":        { label:"Ansible",          icon:"🅰️", color:"#ee0000" },
  "terraform":      { label:"Terraform",        icon:"🟪", color:"#7b42bc" },
  "script":         { label:"Script",           icon:"📜", color:"#64748b" },
  "noc-engineer":   { label:"NOC Engineer",     icon:"👤", color:"#374151" },
  "manual":         { label:"Manual",           icon:"✋", color:"#6b7280" },
};

export const EVENTS = [

  // ══════════════════════════════════════════════════════════════════════════
  // ▶▶ CASCADE SCENARIO: IOS-XR Upgrade on hw-hnl1-cr-01 causes alarm storm
  //    This shows how a single change cascades into alarms & service impact
  //    across multiple devices on the same site.
  //    Timeline: 08:00 → 08:52 (recovery)
  // ══════════════════════════════════════════════════════════════════════════

  // 08:00 — Camunda starts IOS-XR upgrade workflow
  { id:"cas-001", ts:"2026-03-26T08:00:00", duration: 1500000, // 25min total workflow
    nodeId:"hw-hnl1-cr-01", country:"HW",
    type:"AUTOMATION", severity:"info", source:"camunda",
    changeId:"BNOC-0000000005-A",
    message:"Camunda: IOS-XR upgrade workflow started on hw-hnl1-cr-01",
    detail:"Workflow: WF-IOS-UPGRADE-CR. Target: IOS-XR 7.11.1 → 7.11.2. Steps: pre-check → ISSU prep → install activate → post-check. Estimated duration: 25min." },

  // 08:02 — Pre-check config backup
  { id:"cas-002", ts:"2026-03-26T08:02:00", duration: 120000, // 2min
    nodeId:"hw-hnl1-cr-01", country:"HW",
    type:"CONFIG", severity:"info", source:"camunda",
    changeId:"BNOC-0000000005-A",
    message:"Pre-upgrade config backup — running-config saved to TFTP",
    detail:"Backup: tftp://172.16.50.10/backup/hw-hnl1-cr-01_pre-upgrade.cfg. Config hash: a3f7c2d. 847 lines." },

  // 08:05 — Install activate triggers reload
  { id:"cas-003", ts:"2026-03-26T08:05:00", duration: 600000, // 10min reload
    nodeId:"hw-hnl1-cr-01", country:"HW",
    type:"SYSTEM", severity:"warning", source:"camunda",
    changeId:"BNOC-0000000005-A",
    message:"ISSU install activate — router reloading for IOS-XR 7.11.2",
    detail:"install activate id 38 noprompt. Control plane going down. Expected outage: 8-12min. NSF/NSR enabled." },

  // 08:06 — CR-01 goes unreachable → CRITICAL alarm
  { id:"cas-004", ts:"2026-03-26T08:06:00", duration: 540000, // 9min down
    nodeId:"hw-hnl1-cr-01", country:"HW",
    type:"ALARM", severity:"critical", source:"manual",
    message:"CRITICAL: hw-hnl1-cr-01 unreachable — ICMP/SNMP timeout",
    detail:"5 consecutive ICMP probe failures. SNMP unreachable. Last response 08:05:58. Expected during ISSU reload. Auto-escalation in 5min." },

  // 08:06:15 — BGP sessions drop on hw-hnl1-cr-01's peers
  { id:"cas-005", ts:"2026-03-26T08:06:15", duration: 480000, // 8min
    nodeId:"hw-hnl1-pe-01", country:"HW",
    type:"BGP", severity:"critical", source:"manual",
    message:"BGP hold timer expired — session to hw-hnl1-cr-01 DOWN",
    detail:"iBGP session 172.16.0.1 (hw-hnl1-cr-01) hold timer 180s expired. 847 prefixes withdrawn. Traffic shifting to backup path via hw-hnl2-cr-01." },

  // 08:06:30 — Second peer loses BGP
  { id:"cas-006", ts:"2026-03-26T08:06:30", duration: 480000, // 8min
    nodeId:"hw-hnl1-cr-02", country:"HW",
    type:"BGP", severity:"critical", source:"manual",
    message:"BGP hold timer expired — session to hw-hnl1-cr-01 DOWN",
    detail:"iBGP session 172.16.0.1 (hw-hnl1-cr-01) DOWN. ISIS adjacency lost. ECMP path removed. All traffic via single path." },

  // 08:07 — Traffic surge on backup router
  { id:"cas-007", ts:"2026-03-26T08:07:00", duration: 720000, // 12min
    nodeId:"hw-hnl1-cr-02", country:"HW",
    type:"TRAFFIC", severity:"error", source:"manual",
    message:"Traffic surge — et-0/0/0 utilization 94% (capacity risk)",
    detail:"All HNL1 transit rerouted via hw-hnl1-cr-02. Ingress: 9.4 Gbps on 10G. Buffer utilization 78%. Packet drops starting on low-priority queues." },

  // 08:07:30 — Interface overload warning on fabric
  { id:"cas-008", ts:"2026-03-26T08:07:30", duration: 600000, // 10min
    nodeId:"hw-hnl1-dc-fabric-01", country:"HW",
    type:"INTERFACE", severity:"warning", source:"manual",
    message:"Po1 utilization 88% — approaching saturation",
    detail:"DC fabric uplink carrying rerouted traffic. Normal: 45%, current: 88%. QoS remarking active. Voice/video traffic prioritized." },

  // 08:08 — Service degradation: Internet Transit
  { id:"cas-009", ts:"2026-03-26T08:08:00", duration: 540000, // 9min
    nodeId:"hw-hnl1-pe-01", country:"HW",
    type:"ALARM", severity:"critical", source:"manual",
    message:"SERVICE DEGRADED: Internet Transit Hawaii — latency +45ms, loss 2.3%",
    detail:"SLA breach on Internet Transit service. Latency: 67ms (threshold 30ms). Packet loss: 2.3% (threshold 0.1%). Affected customers: Enterprise tier. Single-path forwarding via hw-hnl1-cr-02." },

  // 08:09 — Service degradation: MPLS VPN
  { id:"cas-010", ts:"2026-03-26T08:09:00", duration: 480000, // 8min
    nodeId:"hw-hnl1-pe-02", country:"HW",
    type:"ALARM", severity:"critical", source:"manual",
    message:"SERVICE DEGRADED: MPLS VPN Hawaii — VRF path failover active",
    detail:"MPLS VPN backup path active. VRF CUSTOMER-A: 3/5 CE sites rerouted. Latency increase +38ms. No total outage but SLA at risk. Monitoring convergence." },

  // 08:10 — Security alert: unusual traffic pattern
  { id:"cas-011", ts:"2026-03-26T08:10:00", duration: 300000, // 5min
    nodeId:"hw-hnl1-fw-01", country:"HW",
    type:"SECURITY", severity:"warning", source:"manual",
    message:"Anomaly detected — unusual traffic pattern during rerouting",
    detail:"IDS alert: 340% increase in flow volume on FW outside interface. Pattern consistent with traffic reroute (not attack). Auto-cleared after baseline recalibration." },

  // 08:15 — CR-01 comes back online
  { id:"cas-012", ts:"2026-03-26T08:15:00", duration: 60000, // 1min boot
    nodeId:"hw-hnl1-cr-01", country:"HW",
    type:"SYSTEM", severity:"info", source:"camunda",
    changeId:"BNOC-0000000005-A",
    message:"hw-hnl1-cr-01 back online — IOS-XR 7.11.2 boot complete",
    detail:"System reload complete. IOS-XR 7.11.2 running. Control plane initializing. Uptime: 0d 0h 0m." },

  // 08:16 — BGP reconvergence starts
  { id:"cas-013", ts:"2026-03-26T08:16:00", duration: 360000, // 6min reconvergence
    nodeId:"hw-hnl1-cr-01", country:"HW",
    type:"BGP", severity:"info", source:"camunda",
    changeId:"BNOC-0000000005-A",
    message:"BGP sessions re-establishing — 4 peers negotiating",
    detail:"iBGP to hw-hnl1-pe-01 ESTABLISHED. iBGP to hw-hnl1-cr-02 ESTABLISHED. eBGP upstream AS65001 negotiating. Full table expected in ~5min. Graceful restart active." },

  // 08:17 — Traffic normalizing
  { id:"cas-014", ts:"2026-03-26T08:17:00", duration: 300000, // 5min
    nodeId:"hw-hnl1-cr-02", country:"HW",
    type:"TRAFFIC", severity:"info", source:"manual",
    message:"Traffic normalizing — ECMP restored, load rebalancing",
    detail:"hw-hnl1-cr-01 re-announcing prefixes. ECMP active again. hw-hnl1-cr-02 utilization dropping: 94% → 61% → target 47%. ETA full balance: 3min." },

  // 08:22 — Services recovered
  { id:"cas-015", ts:"2026-03-26T08:22:00", duration: 120000, // 2min
    nodeId:"hw-hnl1-pe-01", country:"HW",
    type:"SYSTEM", severity:"info", source:"manual",
    message:"SERVICE RESTORED: Internet Transit Hawaii — SLA within thresholds",
    detail:"Latency: 22ms (threshold 30ms). Loss: 0.0%. All BGP paths converged. Full ECMP restored. Total service impact: 14 minutes." },

  // 08:25 — Camunda workflow completes with success
  { id:"cas-016", ts:"2026-03-26T08:25:00", duration: 120000, // 2min post-check
    nodeId:"hw-hnl1-cr-01", country:"HW",
    type:"AUTOMATION", severity:"info", source:"camunda",
    changeId:"BNOC-0000000005-A",
    message:"Camunda: IOS-XR upgrade COMPLETED — all post-checks passed",
    detail:"Post-check results: IOS-XR 7.11.2 verified. BGP: 4/4 sessions UP, 847 prefixes. ISIS: 3 adjacencies UP. Interfaces: 12/12 UP. Config hash match: a3f7c2d. Total workflow: 25min." },

  // ══════════════════════════════════════════════════════════════════════════
  // ── Mar 26 (today) — other events with durations ──
  // ══════════════════════════════════════════════════════════════════════════

  // ── Camunda workflow: BGP policy update on fj-suva-cr-01
  { id:"evt-100", ts:"2026-03-26T10:00:00", duration: 240000, // 4min workflow
    nodeId:"fj-suva-cr-01", country:"FJ",
    type:"AUTOMATION", severity:"info", source:"camunda",
    changeId:"BNOC-0000000003-A",
    message:"Camunda workflow — BGP policy update on fj-suva-cr-01",
    detail:"Workflow: WF-BGP-POLICY-UPDATE. Triggered by change BNOC-0000000003-A. Steps: pre-check → config push → validation → post-check." },
  { id:"evt-101", ts:"2026-03-26T10:02:30", duration: 45000, // 45s
    nodeId:"fj-suva-cr-01", country:"FJ",
    type:"CONFIG", severity:"info", source:"camunda",
    changeId:"BNOC-0000000003-A",
    message:"Configuration pushed by Camunda — 15 lines changed in router bgp 65001",
    detail:"Diff: +route-policy DENY_TRANSIT_v2 in, +prefix-list PL-BLOCK-BOGONS. Workflow step 2/4." },
  { id:"evt-102", ts:"2026-03-26T10:03:15", duration: 30000, // 30s
    nodeId:"fj-suva-cr-01", country:"FJ",
    type:"BGP", severity:"warning", source:"camunda",
    changeId:"BNOC-0000000003-A",
    message:"BGP peer 172.16.1.2 soft-reset triggered — route refresh in progress",
    detail:"Automated soft-reset as part of policy update. 42 prefixes being re-evaluated." },

  // ── SDN Controller VLAN changes on Ibiza DC fabric
  { id:"evt-110", ts:"2026-03-26T09:15:00", duration: 90000, // 1.5min
    nodeId:"ib-town-dc-fabric-01", country:"IB",
    type:"AUTOMATION", severity:"info", source:"sdn-controller",
    changeId:"BNOC-0000000016-A",
    message:"SDN Controller — VLAN 42 provisioning on ib-town-dc-fabric-01",
    detail:"OpenDaylight push: VLAN 42 added to port-channel Po1-Po4. Change BNOC-0000000016-A." },
  { id:"evt-111", ts:"2026-03-26T09:15:45", duration: 15000, // 15s flap
    nodeId:"ib-town-dc-fabric-01", country:"IB",
    type:"INTERFACE", severity:"warning", source:"sdn-controller",
    changeId:"BNOC-0000000016-A",
    message:"Interface Po2 brief flap during VLAN provisioning — recovered in 2s",
    detail:"STP TCN on VLAN 42 segment. MAC table flush on 4 ports. Traffic impact: <3s." },

  // ── Ansible playbook on Hawaii DC fabric
  { id:"evt-120", ts:"2026-03-26T11:30:00", duration: 180000, // 3min
    nodeId:"hw-hnl1-dc-fabric-01", country:"HW",
    type:"AUTOMATION", severity:"info", source:"ansible",
    changeId:"BNOC-0000000020-A",
    message:"Ansible playbook — Port-Channel LAG expansion on hw-hnl1-dc-fabric-01",
    detail:"Playbook: pb-lag-expand.yml. Adding Eth1/7 to Po1. Change BNOC-0000000020-A." },
  { id:"evt-121", ts:"2026-03-26T11:31:00", duration: 60000, // 1min
    nodeId:"hw-hnl1-dc-fabric-01", country:"HW",
    type:"INTERFACE", severity:"info", source:"ansible",
    changeId:"BNOC-0000000020-A",
    message:"Port-channel Po1 member added — Eth1/7 negotiated at 25G",
    detail:"LAG expanded from 6 to 7 members. LACP partner detected. Hash rebalance in progress." },
  { id:"evt-122", ts:"2026-03-26T11:32:00", duration: 45000, // 45s spike
    nodeId:"hw-hnl1-dc-fabric-01", country:"HW",
    type:"TRAFFIC", severity:"warning", source:"ansible",
    changeId:"BNOC-0000000020-A",
    message:"Traffic rebalance spike — brief 85% utilization on Po1",
    detail:"ECMP hash change redistributing flows across 7 links. Peak duration: 45s. No drops." },

  // ── TDO automated firmware check on Ibiza firewalls
  { id:"evt-130", ts:"2026-03-26T06:00:00", duration: 90000, // 1.5min
    nodeId:"ib-town-fw-01", country:"IB",
    type:"AUTOMATION", severity:"info", source:"tdo",
    message:"TDO scheduled task — firmware compliance check on Security layer",
    detail:"TDO workflow: CHECK-FW-FIRMWARE. Scanning ib-town-fw-01, ib-town-fw-02, ib-town-waf-01." },

  // ── HCO orchestrated maintenance on Hawaii PE
  { id:"evt-140", ts:"2026-03-26T05:00:00", duration: 600000, // 10min
    nodeId:"hw-hnl1-pe-01", country:"HW",
    type:"AUTOMATION", severity:"info", source:"hco",
    changeId:"BNOC-0000000005-A",
    message:"HCO maintenance workflow — pre-maintenance checks on hw-hnl1-pe-01",
    detail:"HCO workflow: MW-PE-MAINT. Pre-checks: BGP sessions, interface states, traffic baseline." },

  // ── Script-based backup on Fiji DNS
  { id:"evt-150", ts:"2026-03-26T04:00:00", duration: 90000, // 1.5min
    nodeId:"fj-suva-dns-01", country:"FJ",
    type:"AUTOMATION", severity:"info", source:"script",
    message:"Cron script — DNS zone backup started",
    detail:"Script: /opt/noc/scripts/dns-backup.sh. Target: tftp://172.16.50.10/backup/dns/" },

  // ── Today's operational events ──
  { id:"evt-001", ts:"2026-03-26T11:45:12", duration: 30000,
    nodeId:"fj-suva-cr-01", country:"FJ",
    type:"CONFIG", severity:"info", source:"noc-engineer",
    message:"Configuration committed by admin@noc",
    detail:"15 lines changed in router bgp 65001 address-family. Diff: +route-policy DENY_TRANSIT_v2 in." },
  { id:"evt-002", ts:"2026-03-26T11:30:00", duration: 4000, // 4s flap
    nodeId:"hw-hnl1-pe-01", country:"HW",
    type:"INTERFACE", severity:"warning", source:"manual",
    message:"Interface xe-0/0/2 flap — link DOWN→UP",
    detail:"Duration down: 4s. SFP light levels within spec (-2.3 dBm). 8th flap in last 3h." },
  { id:"evt-003", ts:"2026-03-26T10:55:33", duration: 120000, // 2min withdrawal
    nodeId:"ib-town-igw-04", country:"IB",
    type:"BGP", severity:"warning", source:"manual",
    message:"BGP peer 185.1.76.252 (AS6461 Zayo) prefix drop — 8,402 → 7,891",
    detail:"511 prefixes withdrawn in 2 min. Remaining prefixes stable. Other 3 upstreams unaffected." },
  { id:"evt-004", ts:"2026-03-26T10:22:00", duration: 14400000, // ongoing ~4h, spare arrives 14:00
    nodeId:"ib-santantoni-distr-sw01", country:"IB",
    type:"ALARM", severity:"critical", source:"manual",
    message:"PSU-1 failure confirmed — alarm escalated to Critical",
    detail:"FRU diagnostics: PSU-1 output voltage 0V. Node running single PSU. Spare dispatched ETA 14:00." },
  { id:"evt-005", ts:"2026-03-26T09:50:18", duration: 1500000, // 25min
    nodeId:"hw-hnl1-cr-01", country:"HW",
    type:"TRAFFIC", severity:"info", source:"manual",
    message:"Traffic threshold crossed — et-0/0/0 utilization 72% (warn: 70%)",
    detail:"Inbound 7.2 Gbps on 10G link to HNL2. Peak morning traffic. Auto-cleared at 10:15." },
  { id:"evt-006", ts:"2026-03-26T07:12:00", duration: 3600000, // 1h unreachable
    nodeId:"fj-lautoka-acc-sw01", country:"FJ",
    type:"ALARM", severity:"critical", source:"manual",
    message:"Node unreachable — ICMP timeout",
    detail:"5 consecutive probe failures. Last response 07:10:00. Power or uplink failure suspected." },
  { id:"evt-007", ts:"2026-03-26T06:45:00", duration: 3600000, // 1h blocked
    nodeId:"fj-suva-fw-01", country:"FJ",
    type:"SECURITY", severity:"warning", source:"manual",
    message:"IPS signature match — port scan detected from 203.0.113.42",
    detail:"TCP SYN scan across ports 22,80,443,8080. Source geo: external. Auto-blocked for 1h." },
  { id:"evt-008", ts:"2026-03-26T05:30:11", duration: 5000,
    nodeId:"hw-hnl1-5gc-01", country:"HW",
    type:"SYSTEM", severity:"info", source:"manual",
    message:"Scheduled NTP sync completed — drift corrected 12ms",
    detail:"Stratum 2 sync to 172.16.50.1. Previous drift: +12.3ms. Post-sync offset: <0.5ms." },

  // ── Mar 25 (yesterday) ──
  { id:"evt-160", ts:"2026-03-25T19:00:00", duration: 60000, nodeId:"hw-hnl1-dc-fabric-01", country:"HW",
    type:"AUTOMATION", severity:"info", source:"terraform",
    changeId:"BNOC-0000000020-A",
    message:"Terraform apply — ACL update on hw-hnl1-dc-fabric-01 management plane",
    detail:"Plan: 3 to add, 0 to change, 0 to destroy. Apply time: 12s." },
  { id:"evt-161", ts:"2026-03-25T19:00:45", duration: 12000, nodeId:"hw-hnl1-dc-fabric-01", country:"HW",
    type:"CONFIG", severity:"info", source:"terraform",
    changeId:"BNOC-0000000020-A",
    message:"Configuration committed by automation@terraform",
    detail:"ACL update on management plane. 3 new permit entries for monitoring subnet." },

  // Camunda workflow on Ibiza core ring
  { id:"evt-170", ts:"2026-03-25T16:30:00", duration: 180000, nodeId:"ib-town-cr-01", country:"IB",
    type:"AUTOMATION", severity:"info", source:"camunda",
    changeId:"BNOC-0000000013-A",
    message:"Camunda workflow — prefix-list update on Ibiza Core Ring",
    detail:"Workflow: WF-PREFIX-LIST-UPDATE. Target: ib-town-cr-01, ib-town-cr-02. Change BNOC-0000000013-A." },
  { id:"evt-171", ts:"2026-03-25T16:31:00", duration: 30000, nodeId:"ib-town-cr-01", country:"IB",
    type:"CONFIG", severity:"info", source:"camunda",
    changeId:"BNOC-0000000013-A",
    message:"Configuration committed by jfernandez@noc via Camunda",
    detail:"Updated prefix-list PL-CUSTOMERS with 6 new entries. Workflow step 2/3." },
  { id:"evt-172", ts:"2026-03-25T16:32:00", duration: 30000, nodeId:"ib-town-cr-02", country:"IB",
    type:"CONFIG", severity:"info", source:"camunda",
    changeId:"BNOC-0000000013-A",
    message:"Configuration committed on ib-town-cr-02 — prefix-list sync",
    detail:"Mirror config pushed to secondary core router. Prefix-list PL-CUSTOMERS now consistent." },

  { id:"evt-009", ts:"2026-03-25T23:15:00", nodeId:"ib-town-pe-02", country:"IB",
    type:"SYSTEM", severity:"warning", source:"manual",
    message:"Memory utilization 89% — threshold 85% exceeded",
    detail:"VRF table growth: 124k entries (+8k in 24h). BGP policy review recommended." },
  { id:"evt-010", ts:"2026-03-25T22:40:55", nodeId:"fj-suva-cr-02", country:"FJ",
    type:"BGP", severity:"info", source:"manual",
    message:"BGP session to fj-suva-cr-01 (172.16.1.1) — full table received",
    detail:"iBGP session re-established after planned maintenance. 42 prefixes exchanged." },
  { id:"evt-011", ts:"2026-03-25T21:30:00", nodeId:"hw-maui-pe-01", country:"HW",
    type:"BGP", severity:"critical", source:"manual",
    message:"BGP hold timer expired — session DOWN to upstream AS65002",
    detail:"No keepalive for 180s. Prefix count dropped to 0. Enterprise traffic rerouting via HNL1." },
  { id:"evt-012", ts:"2026-03-25T20:15:33", nodeId:"ib-santaeulalia-acc-sw01", country:"IB",
    type:"INTERFACE", severity:"info", source:"manual",
    message:"Interface Gi1/0/3 UP — STP converged in 1.2s",
    detail:"RSTP topology change. MAC table flush on 2 ports. No subscriber impact detected." },
  { id:"evt-013", ts:"2026-03-25T19:00:00", nodeId:"hw-hnl1-dc-fabric-01", country:"HW",
    type:"CONFIG", severity:"info", source:"ansible",
    message:"Configuration committed by automation@ansible",
    detail:"VLAN 42 added to port-channel Po1. Change ID: BNOC-0000000020-A." },
  { id:"evt-014", ts:"2026-03-25T17:45:22", nodeId:"fj-suva-voip-gw-01", country:"FJ",
    type:"TRAFFIC", severity:"warning", source:"manual",
    message:"CPU utilization spike to 95% — call processing degraded",
    detail:"Active SIP sessions: 2,847 (capacity 3,000). CAC threshold reached." },
  { id:"evt-015", ts:"2026-03-25T16:30:00", nodeId:"ib-town-cr-01", country:"IB",
    type:"CONFIG", severity:"info", source:"noc-engineer",
    message:"Configuration committed by jfernandez@noc",
    detail:"Updated prefix-list PL-CUSTOMERS with 6 new entries. Change ID: BNOC-0000000012-A." },
  { id:"evt-016", ts:"2026-03-25T15:30:00", nodeId:"hw-hnl1-nms-02", country:"HW",
    type:"SYSTEM", severity:"warning", source:"manual",
    message:"Disk I/O saturation on /var/log — write latency >200ms",
    detail:"Log partition 87% full. Oldest logs: 45 days. Retention policy: 30 days." },
  { id:"evt-017", ts:"2026-03-25T14:05:00", nodeId:"ib-santaeulalia-acc-sw01", country:"IB",
    type:"INTERFACE", severity:"warning", source:"manual",
    message:"STP topology change — TCN on Gi1/0/3",
    detail:"Root bridge unchanged. MAC flush on segment. RSTP convergence: 1.1s." },
  { id:"evt-018", ts:"2026-03-25T13:20:00", nodeId:"hw-hnl-bpop-01", country:"HW",
    type:"TRAFFIC", severity:"error", source:"manual",
    message:"Packet loss 12% on radio access links",
    detail:"Threshold: 1%. Radio link SNR degraded. Possible RF interference." },
  { id:"evt-019", ts:"2026-03-25T12:00:00", nodeId:"fj-suva-pe-01", country:"FJ",
    type:"BGP", severity:"info", source:"manual",
    message:"BGP route refresh received from fj-suva-cr-01",
    detail:"Soft reconfiguration inbound. 38 routes refreshed, 0 withdrawn." },
  { id:"evt-020", ts:"2026-03-25T10:45:00", nodeId:"ib-town-fw-01", country:"IB",
    type:"SECURITY", severity:"info", source:"tdo",
    message:"Threat intelligence feed updated — 1,247 new IoCs loaded",
    detail:"Source: Vodafone Global SOC. Categories: C2 domains (892), malware hashes (355)." },

  // ── Mar 24 ──
  { id:"evt-180", ts:"2026-03-24T22:00:00", nodeId:"hw-hnl1-cr-02", country:"HW",
    type:"AUTOMATION", severity:"info", source:"script",
    message:"Cron script — scheduled config backup",
    detail:"Script: /opt/noc/scripts/config-backup.sh. Running config exported to backup server." },

  { id:"evt-021", ts:"2026-03-24T22:00:00", nodeId:"hw-hnl1-cr-02", country:"HW",
    type:"CONFIG", severity:"info", source:"script",
    message:"Scheduled config backup completed",
    detail:"Running config exported to tftp://172.16.50.10/backup/hw-hnl1-cr-02_20260324.cfg" },
  { id:"evt-022", ts:"2026-03-24T18:30:00", nodeId:"fj-suva-igw-01", country:"FJ",
    type:"TRAFFIC", severity:"info", source:"manual",
    message:"Traffic peak — et-0/0/0 utilization 68% (10G link)",
    detail:"Evening peak. DDoS scrubbing active: 340 Mbps cleaned. No alarms triggered." },
  { id:"evt-023", ts:"2026-03-24T14:20:15", nodeId:"ib-town-lb-01", country:"IB",
    type:"SYSTEM", severity:"info", source:"script",
    message:"SSL certificate renewed — portal.vodafone.ib",
    detail:"Let's Encrypt renewal. New expiry: 2026-06-21. OCSP stapling verified." },
  { id:"evt-024", ts:"2026-03-24T11:00:00", nodeId:"hw-hnl1-pe-02", country:"HW",
    type:"INTERFACE", severity:"warning", source:"manual",
    message:"CRC errors on xe-0/0/5 — 847 in last hour (threshold: 100)",
    detail:"Physical layer issue suspected. SFP DOM: Rx power -8.2 dBm (low). Fiber inspection needed." },
  { id:"evt-025", ts:"2026-03-24T08:15:00", nodeId:"fj-suva-dns-01", country:"FJ",
    type:"SYSTEM", severity:"info", source:"manual",
    message:"DNS zone transfer completed — vodafone.fj (serial 2026032401)",
    detail:"Full AXFR to fj-suva-dns-02. 2,847 records. Transfer time: 0.8s." },
  { id:"evt-026", ts:"2026-03-24T06:00:00", nodeId:"ib-town-cr-02", country:"IB",
    type:"BGP", severity:"info", source:"manual",
    message:"BGP graceful restart completed — IS-IS adjacency re-established",
    detail:"Planned restart for IOS-XR patch. NSF maintained forwarding during restart (42s)." },
  { id:"evt-027", ts:"2026-03-24T03:30:00", nodeId:"hw-hnl2-cr-01", country:"HW",
    type:"CONFIG", severity:"info", source:"terraform",
    message:"Configuration committed by automation@terraform",
    detail:"ACL update on management plane. 3 new permit entries for monitoring subnet." },
  { id:"evt-028", ts:"2026-03-24T01:00:00", nodeId:"fj-suva-dc-fabric-01", country:"FJ",
    type:"INTERFACE", severity:"info", source:"manual",
    message:"Port-channel Po1 member added — Eth1/7 negotiated at 25G",
    detail:"LAG expanded from 6 to 7 members. Hash rebalance completed." },
  { id:"evt-029", ts:"2026-03-23T20:00:00", nodeId:"ib-town-5gc-01", country:"IB",
    type:"SYSTEM", severity:"info", source:"manual",
    message:"5GC AMF health check passed — 847 UE contexts active",
    detail:"Registration rate: 12/s. PDU session count: 623. All slices operational." },
  { id:"evt-030", ts:"2026-03-23T16:45:00", nodeId:"hw-hnl1-fw-01", country:"HW",
    type:"SECURITY", severity:"error", source:"manual",
    message:"Brute force SSH blocked — 50 attempts from 198.51.100.77",
    detail:"fail2ban triggered. Source geo: external. Banned for 24h. No successful logins." },
];
