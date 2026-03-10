import { useState, useMemo, useEffect } from "react";

// ─── SEED DATA ────────────────────────────────────────────────────────────────
const TEAMS = ["Core Transport","Voice Core","Data Core","Access","RAN","Cloud","OSS/BSS"];
const DEPTS = ["Engineering", "Operations", "Infrastructure", "Security Ops"];
const DIRECTORS = ["Matt I.","Didier C.","Michael T.","Elena Martín"];
const MANAGERS  = ["Chema F.","Sam Reyes","Ivan M.","Adam S."];
const SYSTEMS   = ["Core Network","RAN","Transport","IP/MPLS","Cloud Infra","DNS/NTP","Security GW","OSS/BSS","Voice","Data Core"];
const COUNTRIES = [
  {code:"DE",name:"Germany"},    {code:"IT",name:"Italy"},
  {code:"UK",name:"United Kingdom"},{code:"ES",name:"Spain"},
  {code:"CZ",name:"Czech Republic"},{code:"RO",name:"Romania"},
  {code:"AL",name:"Albania"},    {code:"PT",name:"Portugal"},
  {code:"IE",name:"Ireland"},    {code:"GR",name:"Greece"},
  {code:"TR",name:"Turkey"},     {code:"HU",name:"Hungary"},
  {code:"NL",name:"Netherlands"},{code:"ZA",name:"South Africa"},
  {code:"GH",name:"Ghana"},      {code:"EG",name:"Egypt"},
];
const RISK_LEVELS = ["Low","Medium","High","Critical"];
const CHANGE_TYPES = ["Template","Ad-hoc"];
const EXEC_MODES   = ["Manual","Automated"];
const INTRUSION    = ["Intrusive","Non-Intrusive"];
const EXEC_RESULTS = ["Successful","Off-Script","Aborted","Failed","Rolled Back"];

const STATUS_META = {
  Draft:             {bg:"#f1f5f9",text:"#475569",dot:"#94a3b8"},
  Preflight:         {bg:"#fffbeb",text:"#92400e",dot:"#f59e0b"},
  "Pending Approval":{bg:"#eff6ff",text:"#1e40af",dot:"#3b82f6"},
  Approved:          {bg:"#f5f3ff",text:"#5b21b6",dot:"#8b5cf6"},
  "In Execution":    {bg:"#ecfeff",text:"#164e63",dot:"#06b6d4"},
  Completed:         {bg:"#f0fdf4",text:"#14532d",dot:"#22c55e"},
  Failed:            {bg:"#fef2f2",text:"#7f1d1d",dot:"#ef4444"},
  "Rolled Back":     {bg:"#fff7ed",text:"#7c2d12",dot:"#f97316"},
  Aborted:           {bg:"#faf5ff",text:"#4c1d95",dot:"#a855f7"},
  "Off-Script":      {bg:"#fefce8",text:"#713f12",dot:"#eab308"},
};
const RISK_C = {Low:"#15803d",Medium:"#b45309",High:"#b91c1c",Critical:"#7f1d1d"};

const T = {
  bg:"#f1f5f9", surface:"#ffffff", border:"#e2e8f0",
  text:"#0f172a", muted:"#64748b", light:"#94a3b8",
  primary:"#1d4ed8", primaryBg:"#eff6ff", primaryBorder:"#93c5fd",
  freeze:"#dc2626", freezeBg:"#fef2f2",
  accent:"#0f766e",
  sidebar:"#0f172a", sidebarBorder:"#1e293b",
  sidebarText:"#f1f5f9", sidebarMuted:"#94a3b8",
  shadow:"0 1px 3px rgba(0,0,0,0.07),0 1px 2px rgba(0,0,0,0.05)",
  shadowMd:"0 4px 12px rgba(0,0,0,0.1),0 2px 4px rgba(0,0,0,0.06)",
};

function d(offset=0){
  const x=new Date(); x.setDate(x.getDate()+offset);
  return x.toISOString();
}
function genId(){ return "VNOC-"+Math.floor(10000000+Math.random()*90000000); }
function now(){ return new Date().toISOString(); }
function fmt(iso,short=false){
  if(!iso) return "—";
  const d=new Date(iso);
  if(short) return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"});
  return d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})+" "+
         d.toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
}

const MW = [
  {id:"mw1",name:"Weekly Maintenance — Network",start:d(1)+"T22:00",end:d(2)+"T04:00",teams:["Network Ops","Transport"],recurrence:"Weekly",active:true},
  {id:"mw2",name:"Monthly Security Patching",start:d(5)+"T00:00",end:d(5)+"T06:00",teams:["Security"],recurrence:"Monthly",active:true},
  {id:"mw3",name:"Q4 Freeze Period",start:d(3)+"T00:00",end:d(10)+"T23:59",teams:["All"],recurrence:"None",active:true,freeze:true},
];

const SEED_CHANGES = [
  // 1. SW Upgrade - Completed
  {id:genId(),name:"Core Router OS Upgrade — MNL01",domain:"Core Network",risk:"High",status:"Completed",approvalLevel:"L3",
   type:"Template",execMode:"Manual",intrusion:"Intrusive",execResult:"Successful",
   country:"DE",team:"Core Transport",dept:"Engineering",director:"Matt I.",manager:"Chema F.",
   isTemplate:false,templateId:"t1",freezePeriod:false,freezeJustification:"",
   description:"IOS-XR upgrade from 7.5.1 to 7.7.2 on core PE router MNL01. Scheduled during maintenance window.",
   serviceImpact:"Potential 10-min BGP re-convergence on MNL→SGP path. MPLS-VPN traffic may reroute via backup LSP.",
   affectedServices:["MPLS-VPN","BGP-Peering","ISIS"],
   rollbackPlan:"install rollback to label baseline-7.5.1",
   scheduledFor:d(-5), actualStart:d(-5), actualEnd:d(-5), maintenanceWindow:"mw1",
   steps:[
     {id:1,name:"Pre-checks & Baseline Snapshot",duration:15,owner:"Engineer",
      instructions:"Connect and capture full operational state. Verify ISIS adjacencies, BGP sessions, MPLS forwarding table. Save output to ticket.",
      commands:["show version","show isis adjacency","show bgp summary","show mpls forwarding-table","admin show platform"],
      expectedOutcome:"All ISIS adjacencies UP. BGP sessions Established. No pre-existing alarms.",
      expectedOutput:"Router# show isis adjacency\nSGP-PE01  Gi0/0/0/1  Up  23  Yes  Up\nLON-PE02  Gi0/0/0/2  Up  28  Yes  Up",
      rollback:"N/A — read-only step.",
      subChecks:["ISIS adjacencies all UP","BGP sessions Established","No active alarms","MPLS table consistent"]},
     {id:2,name:"Backup Running Configuration",duration:10,owner:"Engineer",
      instructions:"Save running config to TFTP server and local flash. Verify MD5. Tag with ticket number.",
      commands:["copy running-config tftp://10.0.1.10/MNL01-pre-upgrade.cfg","copy running-config disk0:/backup/MNL01-pre-upgrade.cfg","show md5 file disk0:/backup/MNL01-pre-upgrade.cfg"],
      expectedOutcome:"Config saved to TFTP and local disk. MD5 hash recorded in ticket.",
      expectedOutput:"2456 bytes copied in 0.456 secs\nMD5: a3f4b2c1d9e87654321fedcba9876543",
      rollback:"N/A — backup step. If TFTP fails: copy running-config disk0:/backup/",
      subChecks:["Config saved to TFTP","Config saved to local disk","MD5 recorded"]},
     {id:3,name:"Copy & Verify Upgrade Image",duration:20,owner:"Engineer",
      instructions:"Copy IOS-XR 7.7.2 image to router. Verify MD5 matches golden image repo. Do NOT install yet.",
      commands:["scp noc@10.0.1.10:/images/iosxr-7.7.2.iso disk0:/","verify /md5 disk0:/iosxr-7.7.2.iso","dir disk0:/"],
      expectedOutcome:"Image on disk0. MD5 matches: a3f4b2c1d9e87654321fedcba9876543. Free space > 2GB.",
      expectedOutput:"verify /md5 disk0:/iosxr-7.7.2.iso\nVerified = a3f4b2c1d9e87654321fedcba9876543",
      rollback:"delete disk0:/iosxr-7.7.2.iso",
      subChecks:["Image transferred without errors","MD5 matches golden repo","Free disk space > 2GB"]},
     {id:4,name:"Apply Upgrade & Reload",duration:45,owner:"Engineer",
      instructions:"Install new image. Device will reload. Estimated downtime 8-12 min. Monitor console. DO NOT INTERRUPT. Notify NOC/SAC before this step.",
      commands:["install add source disk0:/ iosxr-7.7.2.iso","install activate iosxr-7.7.2.iso","install commit"],
      expectedOutcome:"Router reloads and boots into IOS-XR 7.7.2.",
      expectedOutput:"Cisco IOS XR Software, Version 7.7.2\nCopyright (c) 2013-2024 by Cisco Systems, Inc.",
      rollback:"install rollback to label baseline-7.5.1\ninstall commit",
      subChecks:["Install add completed","Activate triggered reload","Router came back online","Version 7.7.2 confirmed"]},
     {id:5,name:"Post-upgrade Validation",duration:20,owner:"Engineer",
      instructions:"Verify all protocols re-converged. Compare with pre-upgrade baseline. Check for new alarms.",
      commands:["show version","show isis adjacency","show bgp summary","show mpls forwarding-table","show alarms brief system active"],
      expectedOutcome:"All ISIS/BGP re-established. MPLS table restored. No new alarms. Version 7.7.2 confirmed.",
      expectedOutput:"show alarms brief system active\n--------------------------------\nNo Active Alarms Found.",
      rollback:"If validation fails: install rollback to label baseline-7.5.1",
      subChecks:["Version is 7.7.2","All ISIS adjacencies re-established","All BGP sessions Established","No new alarms"]},
     {id:6,name:"Notify NOC/SAC & Observation Window",duration:30,owner:"Engineer",
      instructions:"Notify NOC/SAC upgrade complete. Enter 30-min observation. Monitor for alarms or customer complaints.",
      commands:["show alarms brief system active","show interfaces summary | inc down"],
      expectedOutcome:"Zero incidents during 30-min observation. NOC/SAC confirmed no customer impact.",
      expectedOutput:"(No output — clean state expected)",
      rollback:"If issues: escalate to manager and initiate rollback per step 5.",
      subChecks:["NOC/SAC notified","30 min observation passed","No customer complaints","Ticket updated"]},
   ],
   preflightResults:{syntax:{status:"pass",log:"OK",by:"Alex Torres",at:d(-6)},conflict:{status:"pass",log:"No conflicts",by:"Alex Torres",at:d(-6)},reachability:{status:"pass",log:"Device reachable",by:"Alex Torres",at:d(-6)},policy:{status:"pass",log:"Policy OK",by:"Alex Torres",at:d(-6)},rollback:{status:"pass",log:"Rollback defined",by:"Alex Torres",at:d(-6)},window:{status:"pass",log:"In window",by:"Alex Torres",at:d(-6)}},
   stepLogs:{
     1:{status:"done",lines:["[MANUAL] SSH to MNL01 — OK","[MANUAL] show isis adjacency — 3 adjacencies UP","[MANUAL] show bgp summary — 12 sessions Established","[MANUAL] ✓ Baseline captured"],completedAt:d(-5),by:"Alex Torres",mode:"manual",note:"All pre-checks passed. No alarms. Baseline saved.",subCheckResults:{0:true,1:true,2:true,3:true}},
     2:{status:"done",lines:["[MANUAL] copy running-config tftp — OK","[MANUAL] MD5: a3f4b2c1d9e87654321fedcba9876543","[MANUAL] ✓ Backup verified"],completedAt:d(-5),by:"Alex Torres",mode:"manual",note:"Config backed up to TFTP and local disk.",subCheckResults:{0:true,1:true,2:true}},
     3:{status:"done",lines:["[MANUAL] SCP complete","[MANUAL] MD5 match confirmed","[MANUAL] ✓ Image ready on disk0"],completedAt:d(-5),by:"Alex Torres",mode:"manual",note:"Image transferred OK. MD5 verified.",subCheckResults:{0:true,1:true,2:true}},
     4:{status:"done",lines:["[MANUAL] install add — completed","[MANUAL] install activate — reloading...","[MANUAL] Router back online after 9 min","[MANUAL] ✓ IOS-XR 7.7.2 confirmed"],completedAt:d(-5),by:"Alex Torres",mode:"manual",note:"Reload took 9 min. Clean boot.",subCheckResults:{0:true,1:true,2:true,3:true}},
     5:{status:"done",lines:["[MANUAL] All ISIS adjacencies UP","[MANUAL] All BGP sessions Established","[MANUAL] No Active Alarms","[MANUAL] ✓ Full validation passed"],completedAt:d(-5),by:"Alex Torres",mode:"manual",note:"All protocols re-converged. No new alarms.",subCheckResults:{0:true,1:true,2:true,3:true}},
     6:{status:"done",lines:["[MANUAL] NOC/SAC notified at 11:05 UTC","[MANUAL] 30-min observation — zero incidents","[MANUAL] ✓ Change closed Successful"],completedAt:d(-5),by:"Alex Torres",mode:"manual",note:"Clean close. No customer impact.",subCheckResults:{0:true,1:true,2:true,3:true}},
   },
   approvals:[{by:"Sam Reyes",action:"approved",at:d(-6),comment:"Reviewed OK"},{by:"Jordan Lee",action:"approved",at:d(-6),comment:"Director sign-off"}],
   auditLog:[{at:d(-7),msg:"Change created",type:"info",by:"Alex Torres"},{at:d(-6),msg:"Preflight passed",type:"success",by:"Alex Torres"},{at:d(-6),msg:"Approved by Jordan Lee",type:"success",by:"Jordan Lee"},{at:d(-5),msg:"Execution started",type:"info",by:"Alex Torres"},{at:d(-5),msg:"All steps completed — Successful",type:"success",by:"Alex Torres"}],
   notifications:[],comments:[],category:"Normal"},

  // 2. BGP Config Change - Approved, ready to execute
  {id:genId(),name:"BGP Route Update — PE-LON02",domain:"IP/MPLS",risk:"Medium",status:"Approved",approvalLevel:"L2",
   type:"Template",execMode:"Manual",intrusion:"Non-Intrusive",execResult:null,
   country:"UK",team:"Core Transport",dept:"Operations",director:"Didier C.",manager:"Chema F.",
   isTemplate:false,templateId:"t1",freezePeriod:false,freezeJustification:"",
   description:"Add new /24 prefixes for EMEA expansion on PE-LON02. Non-intrusive — no service disruption expected.",
   serviceImpact:"Brief BGP update burst possible (< 1 sec). No traffic loss expected.",
   affectedServices:["BGP-Peering","MPLS-VPN"],
   rollbackPlan:"no route-map EMEA-EXPANSION\nclear bgp * soft",
   scheduledFor:d(1), actualStart:null, actualEnd:null, maintenanceWindow:"mw1",
   steps:[
     {id:1,name:"Pre-checks — BGP & Routing State",duration:10,owner:"Engineer",
      instructions:"Verify current BGP state on PE-LON02 before any changes. Document peer count and prefix counts.",
      commands:["show bgp summary","show bgp neighbors | inc BGP state","show route-map","show ip prefix-list EMEA"],
      expectedOutcome:"All BGP peers Established. No existing EMEA prefix-list conflicts.",
      expectedOutput:"Neighbor  V  AS  State/PfxRcd\n10.1.1.1  4  65001  142\n10.1.1.2  4  65002  89",
      rollback:"N/A — read-only.",
      subChecks:["All BGP peers Established","No pre-existing EMEA route-map conflicts","Prefix counts recorded"]},
     {id:2,name:"Backup Running Configuration",duration:5,owner:"Engineer",
      instructions:"Save current config before applying changes.",
      commands:["copy running-config tftp://10.0.1.10/PE-LON02-pre-bgp.cfg"],
      expectedOutcome:"Config saved to TFTP. MD5 recorded.",
      expectedOutput:"2210 bytes copied in 0.231 secs",
      rollback:"N/A — backup only.",
      subChecks:["Config saved successfully","MD5 recorded"]},
     {id:3,name:"Apply BGP Route Policy",duration:15,owner:"Engineer",
      instructions:"Apply new prefix-list and route-map for EMEA expansion prefixes. Paste config block from approved ticket.",
      commands:["conf t","ip prefix-list EMEA-EXPANSION permit 10.200.0.0/24","ip prefix-list EMEA-EXPANSION permit 10.201.0.0/24","route-map EMEA-EXPANSION permit 10","match ip address prefix-list EMEA-EXPANSION","router bgp 12345","neighbor 10.1.1.1 route-map EMEA-EXPANSION out","end","copy running-config startup-config"],
      expectedOutcome:"Route-map applied without errors. Config saved.",
      expectedOutput:"PE-LON02# copy running-config startup-config\nBuilding configuration...[OK]",
      rollback:"conf t\n no route-map EMEA-EXPANSION\n no ip prefix-list EMEA-EXPANSION\nend\nclear bgp * soft out",
      subChecks:["No syntax errors","Config saved to startup","Route-map visible in show route-map"]},
     {id:4,name:"Verify Prefix Propagation",duration:10,owner:"Engineer",
      instructions:"Confirm new prefixes are being advertised to BGP peers.",
      commands:["show bgp neighbors 10.1.1.1 advertised-routes | inc 10.200","show bgp neighbors 10.1.1.1 advertised-routes | inc 10.201"],
      expectedOutcome:"Both /24 prefixes advertised to peer 10.1.1.1.",
      expectedOutput:"*> 10.200.0.0/24   0.0.0.0   0   32768  i\n*> 10.201.0.0/24   0.0.0.0   0   32768  i",
      rollback:"clear bgp 10.1.1.1 soft out",
      subChecks:["10.200.0.0/24 advertised","10.201.0.0/24 advertised","No BGP session resets"]},
     {id:5,name:"Notify NOC/SAC & 15-min Observation",duration:15,owner:"Engineer",
      instructions:"Notify NOC/SAC. Monitor 15 min. Watch for unexpected route changes or customer impact.",
      commands:["show alarms brief system active","show bgp summary | inc Active"],
      expectedOutcome:"No alarms. No BGP sessions went Active. Zero customer tickets.",
      expectedOutput:"No Active Alarms Found.",
      rollback:"Remove route-map and clear bgp soft (see step 3 rollback).",
      subChecks:["NOC/SAC notified","15 min observation passed","No BGP sessions went Active","No customer impact"]},
   ],
   preflightResults:{syntax:{status:"pass",log:"OK",by:"Morgan Silva",at:d(-1)},conflict:{status:"pass",log:"No conflicts",by:"Morgan Silva",at:d(-1)},reachability:{status:"pass",log:"OK",by:"Morgan Silva",at:d(-1)},policy:{status:"pass",log:"OK",by:"Morgan Silva",at:d(-1)},rollback:{status:"pass",log:"Defined",by:"Morgan Silva",at:d(-1)},window:{status:"pass",log:"OK",by:"Morgan Silva",at:d(-1)}},
   stepLogs:{},
   approvals:[{by:"Tom Brandt",action:"approved",at:d(-1),comment:"L2 sign-off — proceed in MW"}],
   auditLog:[{at:d(-2),msg:"Change created",type:"info",by:"Morgan Silva"},{at:d(-1),msg:"Preflight passed",type:"success",by:"Morgan Silva"},{at:d(-1),msg:"Approved by Tom Brandt (L2)",type:"success",by:"Tom Brandt"}],
   notifications:[],comments:[],category:"Normal"},

  // 3. Firewall ACL - Failed
  {id:genId(),name:"Firewall ACL Update — DC-MAD01",domain:"Security GW",risk:"High",status:"Failed",approvalLevel:"L3",
   type:"Ad-hoc",execMode:"Manual",intrusion:"Intrusive",execResult:"Aborted",
   country:"ES",team:"Access",dept:"Security Ops",director:"Michael T.",manager:"Sam Reyes",
   isTemplate:false,templateId:null,freezePeriod:false,freezeJustification:"",
   description:"Emergency ACL change to block suspicious traffic pattern detected by SOC.",
   serviceImpact:"May block legitimate traffic if misconfigured. Priority P2.",
   affectedServices:["Firewall","DMZ"],
   rollbackPlan:"git checkout HEAD -- acl-MAD01.cfg && push to device",
   scheduledFor:d(-3), actualStart:d(-3), actualEnd:d(-3), maintenanceWindow:null,
   steps:[
     {id:1,name:"Pre-checks & Backup ACL",duration:5,owner:"Engineer",
      instructions:"Export current ACL and verify connectivity.",
      commands:["show access-list INBOUND-BLOCK","copy running-config tftp://10.0.1.10/acl-MAD01-pre.cfg"],
      expectedOutcome:"Backup committed. Current ACL exported.",
      expectedOutput:"Extended IP access list INBOUND-BLOCK\n  10 permit ip 10.0.0.0 0.255.255.255 any",
      rollback:"N/A — backup step.",
      subChecks:["ACL backed up to TFTP","Git tag created"]},
     {id:2,name:"Deploy to Staging Firewall",duration:15,owner:"Engineer",
      instructions:"Apply new ACL rule on staging FW and run connectivity tests before touching production.",
      commands:["conf t","ip access-list extended INBOUND-BLOCK","  5 deny ip 185.220.0.0 0.0.255.255 any log","end","ping 8.8.8.8 source 10.0.0.1"],
      expectedOutcome:"Deny rule active on staging. Connectivity test passes for legitimate traffic.",
      expectedOutput:"!!!!! Success rate is 100 percent (5/5)",
      rollback:"no ip access-list extended INBOUND-BLOCK",
      subChecks:["Deny rule applied","Connectivity test passed","No legitimate traffic blocked"]},
     {id:3,name:"Deploy to Production Firewall",duration:10,owner:"Engineer",
      instructions:"Promote change to production MAD01.",
      commands:["conf t","ip access-list extended INBOUND-BLOCK","  5 deny ip 185.220.0.0 0.0.255.255 any log","end","copy running-config startup-config"],
      expectedOutcome:"Rule active on production. No service impact.",
      expectedOutput:"Building configuration...[OK]",
      rollback:"no ip access-list extended INBOUND-BLOCK\ncopy startup-config running-config",
      subChecks:["Rule applied to production","No customer impact","Startup config updated"]},
   ],
   preflightResults:{syntax:{status:"pass",log:"OK",by:"Casey Nguyen",at:d(-4)},conflict:{status:"pass",log:"OK",by:"Casey Nguyen",at:d(-4)},reachability:{status:"pass",log:"OK",by:"Casey Nguyen",at:d(-4)},policy:{status:"fail",log:"Policy violation: ACL missing mandatory comment field per SEC-POL-012",by:"Casey Nguyen",at:d(-4)},rollback:{status:"pass",log:"OK",by:"Casey Nguyen",at:d(-4)},window:{status:"pass",log:"OK",by:"Casey Nguyen",at:d(-4)}},
   stepLogs:{
     1:{status:"done",lines:["[MANUAL] ✓ ACL backed up to TFTP","[MANUAL] ✓ Git tag created"],completedAt:d(-3),by:"Casey Nguyen",mode:"manual",note:"Backup committed.",subCheckResults:{0:true,1:true}},
     2:{status:"fail",lines:["[MANUAL] Applied deny rule to staging","[MANUAL] ✗ ping 8.8.8.8 — 0% success rate","[MANUAL] ✗ Rule blocking legitimate egress — ABORTED"],completedAt:d(-3),by:"Casey Nguyen",mode:"manual",note:"Staging test failed. Rule too broad. Change aborted.",subCheckResults:{0:true,1:false,2:false}},
   },
   approvals:[{by:"Lucia Ferrer",action:"approved",at:d(-4),comment:"Emergency approval"},{by:"Priya Nair",action:"approved",at:d(-4),comment:"Director override"}],
   auditLog:[{at:d(-4),msg:"Change created (ad-hoc emergency)",type:"info",by:"Casey Nguyen"},{at:d(-4),msg:"Approved — emergency override",type:"success",by:"Priya Nair"},{at:d(-3),msg:"Step 2 FAILED — connectivity test error",type:"error",by:"Casey Nguyen"},{at:d(-3),msg:"Change ABORTED — rollback initiated",type:"warning",by:"Casey Nguyen"}],
   notifications:[],comments:[],category:"Normal"},

  // 4. DNS - Draft
  {id:genId(),name:"DNS Zone Update — vodafone.internal",domain:"DNS/NTP",risk:"Low",status:"Draft",approvalLevel:"L1",
   type:"Template",execMode:"Manual",intrusion:"Non-Intrusive",execResult:null,
   country:"DE",team:"Data Core",dept:"Operations",director:"Didier C.",manager:"Sam Reyes",
   isTemplate:false,templateId:"t3",freezePeriod:false,freezeJustification:"",
   description:"Add new A records for internal tooling deployment.",
   serviceImpact:"None expected. DNS TTL propagation within 5 min.",
   affectedServices:["DNS"],
   rollbackPlan:"rndc delzone tooling.vodafone.internal && rndc reload",
   scheduledFor:d(2), actualStart:null, actualEnd:null, maintenanceWindow:"mw1",
   steps:[
     {id:1,name:"Pre-check DNS State",duration:5,owner:"Engineer",
      instructions:"Verify DNS server is healthy and no conflicts for new records.",
      commands:["dig @10.0.1.53 vodafone.internal SOA","named-checkconf","rndc status"],
      expectedOutcome:"DNS server healthy. No conflicting A records.",
      expectedOutput:"server is up and running\nzone vodafone.internal/IN: loaded",
      rollback:"N/A — read-only.",
      subChecks:["DNS server responding","No conflicting records","named config valid"]},
     {id:2,name:"Backup Zone File",duration:3,owner:"Engineer",
      instructions:"Copy current zone file before editing.",
      commands:["cp /etc/bind/zones/vodafone.internal /etc/bind/zones/vodafone.internal.bak"],
      expectedOutcome:"Backup file created.",
      expectedOutput:"(no output — success)",
      rollback:"cp /etc/bind/zones/vodafone.internal.bak /etc/bind/zones/vodafone.internal && rndc reload",
      subChecks:["Backup file created"]},
     {id:3,name:"Apply Zone Changes",duration:5,owner:"Engineer",
      instructions:"Add new A records. Increment SOA serial. Validate syntax and reload.",
      commands:["vim /etc/bind/zones/vodafone.internal","named-checkzone vodafone.internal /etc/bind/zones/vodafone.internal","rndc reload"],
      expectedOutcome:"Zone reloaded. New records visible via dig.",
      expectedOutput:"zone vodafone.internal/IN: loaded serial 2024031901\nOK",
      rollback:"cp /etc/bind/zones/vodafone.internal.bak /etc/bind/zones/vodafone.internal && rndc reload",
      subChecks:["named-checkzone passes","Zone reloaded","Serial incremented"]},
     {id:4,name:"Verify Resolution",duration:5,owner:"Engineer",
      instructions:"Test new records resolve from multiple vantage points.",
      commands:["dig @10.0.1.53 tooling01.vodafone.internal A","dig @10.0.1.53 tooling02.vodafone.internal A"],
      expectedOutcome:"Both records resolve to correct IPs.",
      expectedOutput:";; ANSWER SECTION:\ntooling01.vodafone.internal. 300 IN A 10.50.1.10",
      rollback:"Edit zone file and rndc reload.",
      subChecks:["tooling01 resolves correctly","tooling02 resolves correctly","TTL as specified"]},
   ],
   preflightResults:{},stepLogs:{},approvals:[],
   auditLog:[{at:d(-1),msg:"Change created",type:"info",by:"Alex Torres"}],
   notifications:[],comments:[],category:"Normal"},

  // 5. RAN Push - Executing (2 steps done)
  {id:genId(),name:"RAN Parameter Push — Madrid Cluster",domain:"RAN",risk:"Medium",status:"In Execution",approvalLevel:"L2",
   type:"Ad-hoc",execMode:"Manual",intrusion:"Non-Intrusive",execResult:null,
   country:"ES",team:"RAN",dept:"Engineering",director:"Matt I.",manager:"Ivan M.",
   isTemplate:false,templateId:null,freezePeriod:true,
   freezeJustification:"Critical SLA degradation in Madrid cluster. Deferral would breach contractual KPIs.",
   description:"Push updated load-balancing parameters to 24 RAN sites in Madrid cluster.",
   serviceImpact:"Handover success rate may dip 2% during push window (~20 min). No call drops expected.",
   affectedServices:["RAN","LTE","5G-NR"],
   rollbackPlan:"ansible-playbook rollback-ran.yml --limit madrid-cluster",
   scheduledFor:d(0), actualStart:d(0), actualEnd:null, maintenanceWindow:null,
   steps:[
     {id:1,name:"Pre-check KPIs & Baseline",duration:10,owner:"Engineer",
      instructions:"Capture KPI baseline from OSS before touching any parameters.",
      commands:["ansible madrid-cluster -m shell -a 'show ran-parameters load-balancing'","curl -s http://oss.vodafone.int/api/kpi/madrid?last=1h | python -m json.tool"],
      expectedOutcome:"KPI baseline captured. All 24 sites reachable. HO_SR, RRC_DR values saved.",
      expectedOutput:"madrid-cluster KPIs: HO_SR=94.2%, RRC_DR=0.8%, RSRP_avg=-85dBm",
      rollback:"N/A — read-only.",
      subChecks:["KPI baseline saved","All 24 sites reachable","No sites in alarm"]},
     {id:2,name:"Push Parameters — Batch A (Sites 1–12)",duration:20,owner:"Engineer",
      instructions:"Apply new load-balancing parameters to first 12 sites.",
      commands:["ansible-playbook push-ran-params.yml --limit madrid-batch-a --diff","ansible madrid-batch-a -m shell -a 'show ran-parameters load-balancing | inc HO_THRESHOLD'"],
      expectedOutcome:"12 sites updated. HO_THRESHOLD changed 3dB→4dB.",
      expectedOutput:"PLAY RECAP: madrid-batch-a : ok=24 changed=12 failed=0",
      rollback:"ansible-playbook rollback-ran.yml --limit madrid-batch-a",
      subChecks:["All 12 batch-A sites updated","No Ansible failures","Parameters visible on devices"]},
     {id:3,name:"Validate Batch A — KPI Check",duration:10,owner:"Engineer",
      instructions:"Wait 5 min and check KPIs for batch-A sites. Only proceed to batch B if no degradation.",
      commands:["curl -s http://oss.vodafone.int/api/kpi/madrid-batch-a?last=10m","ansible madrid-batch-a -m shell -a 'show alarms | inc CRITICAL'"],
      expectedOutcome:"HO_SR >= 94% for batch-A. No new critical alarms.",
      expectedOutput:"batch-a KPIs: HO_SR=96.1%, RRC_DR=0.6% — IMPROVED",
      rollback:"ansible-playbook rollback-ran.yml --limit madrid-batch-a",
      subChecks:["HO success rate >= 94%","No new critical alarms","KPIs stable or improved"]},
     {id:4,name:"Push Parameters — Batch B (Sites 13–24)",duration:20,owner:"Engineer",
      instructions:"Apply same parameters to remaining 12 sites.",
      commands:["ansible-playbook push-ran-params.yml --limit madrid-batch-b --diff"],
      expectedOutcome:"12 batch-B sites updated.",
      expectedOutput:"PLAY RECAP: madrid-batch-b : ok=24 changed=12 failed=0",
      rollback:"ansible-playbook rollback-ran.yml --limit madrid-batch-b",
      subChecks:["All 12 batch-B sites updated","No Ansible failures"]},
     {id:5,name:"Final Validation & NOC Notification",duration:15,owner:"Engineer",
      instructions:"Full cluster KPI check. Notify NOC/SAC. 30-min observation window.",
      commands:["curl -s http://oss.vodafone.int/api/kpi/madrid?last=30m | python -m json.tool","ansible madrid-cluster -m shell -a 'show alarms | inc CRITICAL'"],
      expectedOutcome:"HO_SR >= 95% cluster-wide. SLA target met. No critical alarms.",
      expectedOutput:"cluster KPIs: HO_SR=96.8%, RRC_DR=0.5% — TARGET MET",
      rollback:"ansible-playbook rollback-ran.yml --limit madrid-cluster",
      subChecks:["HO_SR >= 95% cluster-wide","No critical alarms","NOC/SAC notified","30-min observation passed"]},
   ],
   preflightResults:{syntax:{status:"pass",log:"OK",by:"Morgan Silva",at:d(-1)},conflict:{status:"pass",log:"No conflicts",by:"Morgan Silva",at:d(-1)},reachability:{status:"pass",log:"All 24 sites reachable",by:"Morgan Silva",at:d(-1)},policy:{status:"pass",log:"OK",by:"Morgan Silva",at:d(-1)},rollback:{status:"pass",log:"Playbook validated",by:"Morgan Silva",at:d(-1)},window:{status:"pass",log:"Freeze override justified",by:"Morgan Silva",at:d(-1)}},
   stepLogs:{
     1:{status:"done",lines:["[MANUAL] KPI baseline: HO_SR=94.2%, RRC_DR=0.8%","[MANUAL] All 24 sites reachable","[MANUAL] ✓ Baseline saved"],completedAt:d(0),by:"Morgan Silva",mode:"manual",note:"Baseline captured. All sites up.",subCheckResults:{0:true,1:true,2:true}},
     2:{status:"done",lines:["[MANUAL] Ansible — ok=24 changed=12 failed=0","[MANUAL] HO_THRESHOLD updated on all 12 batch-A sites","[MANUAL] ✓ Batch A complete"],completedAt:d(0),by:"Morgan Silva",mode:"manual",note:"Batch A pushed successfully.",subCheckResults:{0:true,1:true,2:true}},
   },
   approvals:[{by:"Tom Brandt",action:"approved",at:d(-1),comment:"L2 OK"},{by:"Elena Martín",action:"approved",at:d(-1),comment:"Director freeze override approved"}],
   auditLog:[{at:d(-2),msg:"Change created (freeze period)",type:"info",by:"Morgan Silva"},{at:d(-1),msg:"Preflight passed",type:"success",by:"Morgan Silva"},{at:d(-1),msg:"Approved — freeze override by Elena Martín",type:"success",by:"Elena Martín"},{at:d(0),msg:"Execution started",type:"info",by:"Morgan Silva"},{at:d(0),msg:"Step 1 completed",type:"success",by:"Morgan Silva"},{at:d(0),msg:"Step 2 completed",type:"success",by:"Morgan Silva"}],
   notifications:[],comments:[],category:"Normal"},
];


// ─── HELPERS ─────────────────────────────────────────────────────────────────
function Badge({status,small}){
  const s=STATUS_META[status]||{bg:"#f1f5f9",text:"#475569",dot:"#94a3b8"};
  return <span style={{display:"inline-flex",alignItems:"center",gap:5,background:s.bg,color:s.text,border:`1px solid ${s.dot}40`,borderRadius:20,padding:small?"1px 8px":"2px 10px",fontSize:small?10:11,fontWeight:600,whiteSpace:"nowrap"}}>
    <span style={{width:small?5:6,height:small?5:6,borderRadius:"50%",background:s.dot,display:"inline-block"}}/>
    {status}
  </span>;
}
function RiskPill({risk}){
  const c=RISK_C[risk]||"#64748b";
  return <span style={{background:c+"12",color:c,border:`1px solid ${c}30`,borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:700}}>{risk}</span>;
}
function FreezeTag(){
  return <span style={{background:"#fef2f2",color:"#dc2626",border:"1px solid #fca5a5",borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>❄ FREEZE</span>;
}
function TypeTag({type}){
  const c=type==="Template"?"#6d28d9":type==="Automated"?"#0e7490":"#b45309";
  return <span style={{background:c+"12",color:c,border:`1px solid ${c}30`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{type}</span>;
}
function IntrusionTag({v}){
  const c=v==="Intrusive"?"#b91c1c":"#15803d";
  return <span style={{background:c+"10",color:c,border:`1px solid ${c}25`,borderRadius:4,padding:"2px 7px",fontSize:10,fontWeight:700}}>{v}</span>;
}

const BV={
  primary:{background:T.primary,color:"#fff",border:"none"},
  success:{background:"#15803d",color:"#fff",border:"none"},
  danger: {background:"#b91c1c",color:"#fff",border:"none"},
  ghost:  {background:"transparent",color:T.muted,border:`1px solid ${T.border}`},
  outline:{background:"transparent",color:T.primary,border:`1px solid ${T.primary}`},
  teal:   {background:T.accent,color:"#fff",border:"none"},
};
function Btn({children,onClick,variant="primary",disabled,small,style:s}){
  return <button onClick={onClick} disabled={disabled} style={{...BV[variant],borderRadius:8,cursor:disabled?"not-allowed":"pointer",fontWeight:600,fontFamily:"inherit",padding:small?"5px 12px":"8px 18px",fontSize:small?12:13,opacity:disabled?0.45:1,transition:"opacity 0.15s,box-shadow 0.15s",letterSpacing:"0.01em",...s}}>{children}</button>;
}
function Inp({label,value,onChange,type="text",placeholder,required,rows=3,style:s}){
  const base={background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 12px",fontSize:13,fontFamily:"inherit",outline:"none",width:"100%",transition:"border-color 0.15s,box-shadow 0.15s"};
  return <div style={{display:"flex",flexDirection:"column",gap:5,...s}}>
    {label&&<label style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.6px"}}>{label}{required&&<span style={{color:T.freeze}}> *</span>}</label>}
    {type==="textarea"?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{...base,resize:"vertical"}}/>:<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={base}/>}
  </div>;
}
function Sel({label,value,onChange,options,style:s}){
  return <div style={{display:"flex",flexDirection:"column",gap:5,...s}}>
    {label&&<label style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",letterSpacing:"0.6px"}}>{label}</label>}
    <select value={value} onChange={e=>onChange(e.target.value)} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 12px",fontSize:13,fontFamily:"inherit",outline:"none",transition:"border-color 0.15s,box-shadow 0.15s"}}>
      {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
    </select>
  </div>;
}
function Card({children,style:s,onClick}){
  return <div onClick={onClick} style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:12,padding:18,boxShadow:T.shadow,cursor:onClick?"pointer":undefined,...s}}>{children}</div>;
}
function Modal({title,children,onClose,width=760}){
  return <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",backdropFilter:"blur(3px)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 20px",overflowY:"auto"}}>
    <div style={{background:T.surface,border:`1px solid ${T.border}`,borderRadius:16,width:"100%",maxWidth:width,boxShadow:"0 24px 64px rgba(0,0,0,0.22)"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 24px",borderBottom:`1px solid ${T.border}`}}>
        <h3 style={{fontSize:15,fontWeight:700,color:T.text}}>{title}</h3>
        <button onClick={onClose} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:16,lineHeight:1,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
      <div style={{padding:24}}>{children}</div>
    </div>
  </div>;
}

// ─── EXPORT AUDIT LOG ─────────────────────────────────────────────────────────
function exportAuditCSV(changes){
  const rows=[["Timestamp","Event","Type","Change Name","Change ID","By"]];
  changes.flatMap(c=>(c.auditLog||[]).map(e=>[fmt(e.at),e.msg,e.type,c.name,c.id,e.by]))
    .sort((a,b)=>new Date(b[0])-new Date(a[0]))
    .forEach(r=>rows.push(r));
  const csv=rows.map(r=>r.map(x=>`"${String(x).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
  a.download=`vnoc-audit-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ─── TIMELINE VIEW ────────────────────────────────────────────────────────────
function TimelineView({changes,onSelect}){
  const days=[];
  for(let i=-7;i<=14;i++){
    const d=new Date(); d.setDate(d.getDate()+i);
    days.push({date:d,label:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short"}),isToday:i===0,isPast:i<0});
  }
  const isToday=(iso)=>{
    if(!iso) return false;
    const d=new Date(iso), t=new Date();
    return d.getDate()===t.getDate()&&d.getMonth()===t.getMonth()&&d.getFullYear()===t.getFullYear();
  };
  const sameDay=(iso,d)=>{
    if(!iso) return false;
    const x=new Date(iso);
    return x.getDate()===d.getDate()&&x.getMonth()===d.getMonth()&&x.getFullYear()===d.getFullYear();
  };

  return <div style={{overflowX:"auto"}}>
    <div style={{display:"grid",gridTemplateColumns:`120px repeat(${days.length},1fr)`,minWidth:1100,gap:0}}>
      {/* header */}
      <div style={{background:T.bg,borderBottom:`1px solid ${T.border}`,padding:"8px 10px",fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase"}}></div>
      {days.map(d=><div key={d.label} style={{background:d.isToday?"#eff6ff":d.isPast?T.bg:T.surface,borderBottom:`1px solid ${T.border}`,borderLeft:`1px solid ${T.border}`,padding:"8px 6px",fontSize:11,fontWeight:d.isToday?700:500,color:d.isToday?T.primary:T.muted,textAlign:"center"}}>{d.label}{d.isToday&&<div style={{fontSize:9,color:T.primary,fontWeight:700}}>TODAY</div>}</div>)}
      
      {/* MW rows */}
      {MW.map(mw=><>
        <div key={mw.id+"l"} style={{background:T.bg,borderBottom:`1px solid ${T.border}`,padding:"6px 10px",fontSize:11,fontWeight:600,color:mw.freeze?T.freeze:T.accent,display:"flex",alignItems:"center",gap:4}}>
          {mw.freeze?"❄":"🔧"} {mw.name.split("—")[0]}
        </div>
        {days.map(day=>{
          const inWindow=new Date(mw.start)<=new Date(day.date.toDateString()+" 23:59")&&new Date(mw.end)>=new Date(day.date.toDateString()+" 00:00");
          return <div key={mw.id+day.label} style={{borderBottom:`1px solid ${T.border}`,borderLeft:`1px solid ${T.border}`,background:inWindow?(mw.freeze?"#fef2f2":"#f0fdfa"):"transparent",minHeight:32}}/>;
        })}
      </>)}

      {/* change rows */}
      {changes.map(c=><>
        <div key={c.id+"l"} style={{background:T.bg,borderBottom:`1px solid ${T.border}80`,padding:"6px 10px",fontSize:11,color:T.muted,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{c.team}</div>
        {days.map(day=>{
          const here=sameDay(c.scheduledFor,day.date);
          return <div key={c.id+day.label} style={{borderBottom:`1px solid ${T.border}80`,borderLeft:`1px solid ${T.border}80`,padding:2,background:day.isToday?"#fafcff":"transparent",minHeight:28,cursor:here?"pointer":undefined}} onClick={here?()=>onSelect(c):undefined}>
            {here&&<div style={{background:(STATUS_META[c.status]||{dot:"#94a3b8"}).dot,color:"#fff",borderRadius:4,padding:"2px 5px",fontSize:10,fontWeight:600,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",cursor:"pointer"}} title={c.name}>
              {c.freezePeriod?"❄ ":""}{c.name.split("—")[0]}
            </div>}
          </div>;
        })}
      </>)}
    </div>
  </div>;
}

// ─── CLOSE CHANGE PANEL ───────────────────────────────────────────────────────
function CloseChangePanel({change, currentUser, onClose}) {
  const [result, setResult] = useState("Successful");
  const [note, setNote] = useState("");
  const [pirRequired, setPirRequired] = useState(false);
  const RESULTS = [
    {v:"Successful", col:"#15803d", bg:"#f0fdf4", border:"#86efac", icon:"✓"},
    {v:"Off-Script",  col:"#b45309", bg:"#fffbeb", border:"#fcd34d", icon:"⚠"},
    {v:"Rolled Back", col:"#ea580c", bg:"#fff7ed", border:"#fed7aa", icon:"↩"},
    {v:"Failed",      col:"#b91c1c", bg:"#fef2f2", border:"#fca5a5", icon:"✕"},
  ];
  const sel = RESULTS.find(r=>r.v===result);
  const needsPIR = result === "Failed" || result === "Rolled Back";
  return (
    <div style={{ padding:"14px 13px", background:sel.bg, borderTop:`2px solid ${sel.border}` }}>
      <div style={{ fontSize:11, fontWeight:700, color:sel.col, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Close Change</div>
      <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
        {RESULTS.map(r=>(
          <button key={r.v} onClick={()=>setResult(r.v)} style={{ fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:6, padding:"5px 10px", border:`1.5px solid ${result===r.v?r.col:r.border}`, background:result===r.v?r.col:"#fff", color:result===r.v?"#fff":r.col, fontFamily:"inherit" }}>
            {r.icon} {r.v}
          </button>
        ))}
      </div>
      <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2}
        placeholder="Closing note (optional) — e.g. All services validated, no customer impact"
        style={{ width:"100%", background:"#fff", border:`1px solid ${sel.border}`, borderRadius:6, color:"#0f172a", padding:"7px 10px", fontSize:12, fontFamily:"inherit", outline:"none", resize:"none", marginBottom:8 }}/>
      {needsPIR && (
        <label style={{ display:"flex", gap:8, alignItems:"center", marginBottom:10, cursor:"pointer", padding:"9px 12px", background:"#fff", border:`1px solid ${sel.border}`, borderRadius:7 }}>
          <input type="checkbox" checked={pirRequired} onChange={e=>setPirRequired(e.target.checked)} style={{ width:15, height:15, accentColor:sel.col }}/>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:sel.col }}>📋 PIR / Post-Incident Review required</div>
            <div style={{ fontSize:11, color:"#64748b", marginTop:1 }}>Schedule debrief within 5 business days — identify root cause & preventive actions</div>
          </div>
        </label>
      )}
      <button onClick={()=>onClose(result, note, pirRequired)}
        style={{ width:"100%", background:sel.col, color:"#fff", border:"none", borderRadius:7, padding:"9px 0", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
        {sel.icon} Close as {result}
      </button>
    </div>
  );
}

// ─── COPY ID BUTTON ───────────────────────────────────────────────────────────
function CopyIdButton({id}) {
  const [copied, setCopied] = useState(false);
  function copy() {
    const url = window.location.origin + window.location.pathname + "#" + id;
    navigator.clipboard?.writeText(url).catch(()=>{});
    setCopied(true);
    setTimeout(()=>setCopied(false), 2000);
  }
  return (
    <button onClick={copy} title="Copy shareable link"
      style={{background:copied?"#f0fdf4":T.bg,border:`1px solid ${copied?"#86efac":T.border}`,borderRadius:5,
        cursor:"pointer",padding:"2px 8px",fontSize:10,color:copied?"#15803d":T.muted,fontWeight:600,fontFamily:"inherit",display:"flex",alignItems:"center",gap:4}}>
      {copied?"✓ Copied":"🔗 Copy link"}
    </button>
  );
}

// ─── CHANGE DETAIL MODAL ──────────────────────────────────────────────────────
function ChangeDetail({change,currentUser,onClose,onUpdate,windows}){
  const [tab,setTab]=useState("overview");
  const TABS=["overview","preflight","steps","approval","execution","comments","cab","log"];
  const avail=t=>{
    const s=change.status;
    if(t==="preflight") return ["Draft","Preflight"].includes(s);
    if(t==="approval")  return ["Pending Approval","Approved"].includes(s);
    if(t==="execution") return ["Approved","In Execution","Completed","Failed","Rolled Back","Aborted","Off-Script"].includes(s);
    if(t==="cab") return !!(change.cab);
    return true;
  };
  function addLog(msg,type="info"){onUpdate(c=>({...c,auditLog:[...(c.auditLog||[]),{at:now(),msg,type,by:currentUser.name}]}))}
  function moveTo(status){onUpdate(c=>({...c,status}));addLog(`Status → ${status}`);}

  // preflight
  const results=change.preflightResults||{};
  const PF_CHECKS=[
    {id:"syntax",label:"Syntax Validation"},{id:"conflict",label:"Conflict Detection"},
    {id:"reachability",label:"Device Reachability"},{id:"policy",label:"Policy Compliance"},
    {id:"rollback",label:"Rollback Plan"},{id:"window",label:"Maintenance Window"},
  ];
  const [pfLog,setPfLog]=useState({});
  const [pfModal,setPfModal]=useState(null);
  function setResult(id,data){onUpdate(c=>({...c,preflightResults:{...(c.preflightResults||{}),[id]:{...data,by:currentUser.name,at:now()}}}))}
  async function autoCheck(chk){
    setResult(chk.id,{status:"running",log:""});
    await new Promise(r=>setTimeout(r,600+Math.random()*400));
    setResult(chk.id,{status:"pass",log:`Auto-check at ${new Date().toLocaleTimeString()} — OK`});
  }
  async function runAllPF(){for(const c of PF_CHECKS){if(results[c.id]?.status==="pass") continue; await autoCheck(c);}}
  const pfAllPass=PF_CHECKS.every(c=>results[c.id]?.status==="pass");
  const pfFail=PF_CHECKS.some(c=>results[c.id]?.status==="fail");

  // ── execution state ──────────────────────────────────────────────────────
  const stepLogs = change.stepLogs || {};
  const [activeStepIdx, setActiveStepIdx] = useState(() => {
    if (!change.steps) return 0;
    const first = change.steps.findIndex(s => !(change.stepLogs?.[s.id]?.status === "done"));
    return first >= 0 ? first : 0;
  });
  const [stepNote, setStepNote] = useState("");
  const [cliOutput, setCliOutput] = useState("");
  const [subChecks, setSubChecks] = useState({});
  const [copied, setCopied] = useState(null);
  const [showRollbackConfirm, setShowRollbackConfirm] = useState(false);
  const [attachments, setAttachments] = useState({});
  const [tick, setTick] = useState(0);
  const [execStarted] = useState(change.actualStart || now());
  const [stepStartTimes, setStepStartTimes] = useState({});
  useState(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); });
  function elapsedSec(iso) { if (!iso) return 0; return Math.floor((Date.now() - new Date(iso).getTime()) / 1000); }
  function fmtSec(s) { const m = Math.floor(s / 60), sec = s % 60; return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`; }
  function setStepLog(sid, data) { onUpdate(c => ({ ...c, stepLogs: { ...(c.stepLogs || {}), [sid]: { ...(c.stepLogs?.[sid] || {}), ...data } } })); }
  function activateStep(idx) {
    const step = change.steps?.[idx];
    if (step && !stepStartTimes[step.id]) setStepStartTimes(t => ({...t, [step.id]: now()}));
    setActiveStepIdx(idx);
  }
  function copyCmd(text, idx) { navigator.clipboard?.writeText(text).catch(() => {}); setCopied(idx); setTimeout(() => setCopied(null), 1500); }
  function completeStep(step, idx, failed = false) {
    const combinedNote = [stepNote.trim(), cliOutput.trim() ? "--- CLI OUTPUT ---\n" + cliOutput.trim() : ""].filter(Boolean).join("\n");
    if (combinedNote.length < 5) return;
    const lines = combinedNote.split("\n").filter(l => l.trim()).map(l => `[MANUAL] ${l}`);
    setStepLog(step.id, { status: failed ? "fail" : "done", lines, startedAt: stepStartTimes[step.id]||execStarted, completedAt: now(), by: currentUser.name, mode: "manual", note: combinedNote, subCheckResults: subChecks, attachmentCount: (attachments[step.id] || []).length });
    addLog(`Step ${idx + 1} "${step.name}" ${failed ? "FAILED" : "completed"}`, failed ? "error" : "success");
    if (failed) { moveTo("Failed"); }
    else if (idx < (change.steps?.length || 0) - 1) { activateStep(idx + 1); setStepNote(""); setCliOutput(""); setSubChecks({}); }
  }
  const execDone = change.steps && change.steps.every(s => stepLogs[s.id]?.status === "done");
  const globalElapsed = fmtSec(elapsedSec(execStarted));
  const activeStep = change.steps?.[activeStepIdx];
  const totalEstMin = (change.steps || []).reduce((a, s) => a + (s.duration || 0), 0);

  // approvals
  const [aprComment,setAprComment]=useState("");
  const levelColor={L1:"#15803d",L2:T.primary,L3:"#b91c1c"};
  const canApprove=()=>{
    const r=currentUser.role;
    if(change.freezePeriod) return r==="Director";
    if(change.approvalLevel==="L1"&&r==="Engineer") return true;
    if(change.approvalLevel==="L2"&&["Manager","Director"].includes(r)) return true;
    if(change.approvalLevel==="L3"&&r==="Director") return true;
    return false;
  };
  const mw=windows.find(w=>w.id===change.maintenanceWindow);

  // execution TAB UI
  const execTabUI = (
    <div style={{ display:"flex", flexDirection:"column", margin:"-22px", overflow:"hidden" }}>
      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 20px", background:"#0f172a", color:"#f1f5f9", flexShrink:0, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase", letterSpacing:"0.5px" }}>EXECUTING</div>
          <div style={{ fontSize:14, fontWeight:700, color:"#f1f5f9", maxWidth:340, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{change.name}</div>
          <div style={{ fontSize:11, color:"#475569", marginTop:2 }}>{change.id} · {change.team} · {currentUser.name}</div>
        </div>
        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
          {(change.affectedServices||[]).map(s=><span key={s} style={{ fontSize:10, background:"#1e293b", color:"#94a3b8", border:"1px solid #334155", borderRadius:4, padding:"2px 7px", fontWeight:600 }}>{s}</span>)}
        </div>
        <div style={{ marginLeft:"auto", display:"flex", gap:18, alignItems:"center" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase" }}>Elapsed</div>
            <div style={{ fontSize:20, fontWeight:800, color:"#22d3ee", fontFamily:"monospace" }}>{globalElapsed}</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase" }}>Steps</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#f8fafc" }}>{change.steps?.filter(s=>stepLogs[s.id]?.status==="done").length||0}/{change.steps?.length||0}</div>
          </div>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:10, color:"#475569", textTransform:"uppercase" }}>Est. Total</div>
            <div style={{ fontSize:14, fontWeight:700, color:"#94a3b8" }}>{totalEstMin} min</div>
          </div>
          <div style={{ display:"flex", gap:7 }}>
            <button onClick={()=>{onUpdate(c=>({...c,execResult:"Off-Script"}));addLog("Marked as Off-Script","warning");}} style={{ background:"#78350f", border:"1px solid #b45309", borderRadius:6, color:"#fcd34d", padding:"6px 11px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>⚠ OFF-SCRIPT</button>
            <button onClick={()=>setShowRollbackConfirm(true)} style={{ background:"#431407", border:"1px solid #c2410c", borderRadius:6, color:"#fdba74", padding:"6px 11px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>↩ ROLLBACK</button>
            <button onClick={()=>{moveTo("Aborted");addLog("Change aborted by engineer","error");}} style={{ background:"#7f1d1d", border:"1px solid #b91c1c", borderRadius:6, color:"#fca5a5", padding:"6px 11px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>⊘ ABORT</button>
          </div>
        </div>
      </div>
      <div style={{ height:4, background:"#1e293b", flexShrink:0 }}>
        <div style={{ height:"100%", background:"linear-gradient(90deg,#1d4ed8,#06b6d4)", transition:"width 0.5s", width:`${((change.steps?.filter(s=>stepLogs[s.id]?.status==="done").length||0)/Math.max(change.steps?.length||1,1))*100}%` }}/>
      </div>
      {showRollbackConfirm&&(
        <div style={{ background:"#431407", border:"2px solid #c2410c", padding:"14px 20px", display:"flex", gap:14, alignItems:"center", flexShrink:0 }}>
          <span style={{ fontSize:13, color:"#fdba74", fontWeight:600 }}>↩ Confirm rollback?</span>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"#fbbf24", background:"#1c0a00", padding:"6px 12px", borderRadius:5, flex:1 }}>{change.rollbackPlan}</div>
          <button onClick={()=>{moveTo("Rolled Back");addLog("Rollback initiated","warning");setShowRollbackConfirm(false);}} style={{ background:"#c2410c", border:"none", borderRadius:6, color:"#fff", padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Yes, Rollback</button>
          <button onClick={()=>setShowRollbackConfirm(false)} style={{ background:"transparent", border:"1px solid #c2410c", borderRadius:6, color:"#fdba74", padding:"8px 16px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
        </div>
      )}
      <div style={{ display:"flex", flex:1, overflow:"hidden", minHeight:520 }}>
        <div style={{ width:248, flexShrink:0, borderRight:"1px solid #e2e8f0", overflowY:"auto", background:"#f8fafc" }}>
          {(change.steps||[]).map((step,idx)=>{
            const log=stepLogs[step.id]; const st=log?.status||"waiting";
            const isActive=idx===activeStepIdx; const isDone=st==="done"; const isFail=st==="fail";
            const isLocked=idx>activeStepIdx&&!isDone&&!isFail;
            const col=isDone?"#15803d":isFail?"#b91c1c":isActive?"#1d4ed8":"#94a3b8";
            const bg=isActive?"#eff6ff":isDone?"#f0fdf4":isFail?"#fef2f2":"transparent";
            return (
              <div key={step.id} onClick={()=>!isLocked&&activateStep(idx)}
                style={{ padding:"11px 13px", borderBottom:"1px solid #e2e8f0", cursor:isLocked?"default":"pointer", background:bg, borderLeft:`3px solid ${isActive?"#1d4ed8":isDone?"#15803d":isFail?"#b91c1c":"transparent"}`, opacity:isLocked?0.4:1 }}>
                <div style={{ display:"flex", gap:9, alignItems:"flex-start" }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", background:col+"18", color:col, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:11, flexShrink:0, marginTop:1 }}>{isDone?"✓":isFail?"✗":String(idx+1)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:isActive?700:600, color:isActive?"#1d4ed8":"#0f172a", lineHeight:1.3, marginBottom:2 }}>{step.name}</div>
                    <div style={{ fontSize:10, color:"#64748b" }}>{step.duration} min</div>
                    {isDone&&<div style={{ fontSize:10, color:"#15803d", marginTop:2 }}>✓ {log.by} · {log.startedAt?fmtSec(Math.max(0,Math.floor((new Date(log.completedAt)-new Date(log.startedAt))/1000)))+"min":"—"}</div>}
                    {isFail&&<div style={{ fontSize:10, color:"#b91c1c", marginTop:2 }}>✗ Failed — {log.by}</div>}
                  </div>
                </div>
              </div>
            );
          })}
          {execDone&&change.status!=="Completed"&&change.status!=="Failed"&&change.status!=="Rolled Back"&&change.status!=="Aborted"&&(
            <CloseChangePanel change={change} currentUser={currentUser} onClose={(result,note,pirRequired)=>{
              onUpdate(c=>({...c,status:"Completed",execResult:result,actualEnd:now(),pirRequired:pirRequired||false}));
              addLog(`Change closed — ${result}${note?": "+note.slice(0,60):""}${pirRequired?" · PIR scheduled":""}`,result==="Successful"?"success":"warning");
            }}/>
          )}
          {["Completed","Failed","Rolled Back","Aborted","Off-Script"].includes(change.status)&&(
            <div style={{ padding:"12px 13px", background:change.execResult==="Successful"?"#f0fdf4":"#fef2f2", borderTop:`2px solid ${change.execResult==="Successful"?"#86efac":"#fca5a5"}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:change.execResult==="Successful"?"#15803d":"#b91c1c", marginBottom:3 }}>
                {change.execResult==="Successful"?"✓ Closed as Successful":`✕ ${change.execResult||change.status}`}
              </div>
              <div style={{ fontSize:10, color:"#64748b" }}>{fmt(change.actualEnd)}</div>
            </div>
          )}
        </div>
        <div style={{ flex:1, overflowY:"auto", padding:"22px 26px", background:"#ffffff" }}>
          {!activeStep&&<div style={{ color:"#94a3b8", textAlign:"center", paddingTop:60 }}>Select a step.</div>}
          {activeStep&&(()=>{
            const log=stepLogs[activeStep.id]; const st=log?.status||"waiting";
            const isDone=st==="done"; const isFail=st==="fail";
            const hasLog=(stepNote.trim()||cliOutput.trim()).length>=5;
            const stepSubChecks=activeStep.subChecks||[];
            return <div>
              <div style={{ display:"flex", gap:12, alignItems:"flex-start", marginBottom:20 }}>
                <div style={{ width:38, height:38, borderRadius:"50%", background:isDone?"#dcfce7":isFail?"#fee2e2":"#eff6ff", color:isDone?"#15803d":isFail?"#b91c1c":"#1d4ed8", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:17, flexShrink:0 }}>{isDone?"✓":isFail?"✗":String(activeStepIdx+1)}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:20, fontWeight:800, color:"#0f172a", letterSpacing:"-0.3px" }}>{activeStep.name}</div>
                  <div style={{ fontSize:12, color:"#64748b", marginTop:3, display:"flex", gap:14 }}>
                    <span>Owner: <b style={{ color:"#0f172a" }}>{activeStep.owner}</b></span>
                    <span>Est: <b style={{ color:"#0f172a" }}>{activeStep.duration} min</b></span>
                    <span>Step <b style={{ color:"#0f172a" }}>{activeStepIdx+1}/{change.steps?.length}</b></span>
                  </div>
                </div>
                <div style={{ textAlign:"center", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:8, padding:"8px 14px", flexShrink:0 }}>
                  <div style={{ fontSize:10, color:"#64748b", textTransform:"uppercase", marginBottom:1 }}>Est. duration</div>
                  <div style={{ fontSize:18, fontWeight:800, color:"#1d4ed8", fontFamily:"monospace" }}>{String(activeStep.duration).padStart(2,"0")}:00</div>
                </div>
              </div>
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:3, height:12, background:"#f59e0b", borderRadius:2, display:"inline-block" }}/>Instructions
                </div>
                <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:7, padding:"10px 14px", fontSize:13, color:"#0f172a", lineHeight:1.7 }}>{activeStep.instructions}</div>
              </div>
              {(activeStep.commands||[]).length>0&&(
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:3, height:12, background:"#1d4ed8", borderRadius:2, display:"inline-block" }}/>Commands — click to copy
                  </div>
                  {(activeStep.commands||[]).map((cmd,i)=>(
                    <div key={i} style={{ display:"flex", borderRadius:7, border:"1px solid #e2e8f0", overflow:"hidden", marginBottom:5 }}>
                      <div style={{ flex:1, fontFamily:"monospace", fontSize:12, color:"#0f172a", background:"#f8fafc", padding:"8px 13px", lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{cmd}</div>
                      <button onClick={()=>copyCmd(cmd,i)} style={{ background:copied===i?"#dcfce7":"#f1f5f9", border:"none", borderLeft:"1px solid #e2e8f0", padding:"8px 13px", cursor:"pointer", fontSize:11, color:copied===i?"#15803d":"#64748b", fontWeight:600, fontFamily:"inherit", flexShrink:0 }}>{copied===i?"✓ Copied":"⎘ Copy"}</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ width:3, height:12, background:"#15803d", borderRadius:2, display:"inline-block" }}/>Expected outcome
                </div>
                <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:7, padding:"10px 14px" }}>
                  <div style={{ fontSize:12, color:"#14532d", fontWeight:600, marginBottom:4 }}>{activeStep.expectedOutcome}</div>
                  {activeStep.expectedOutput&&<pre style={{ fontSize:11, fontFamily:"monospace", color:"#166534", background:"#dcfce7", borderRadius:5, padding:"8px 10px", marginTop:6, overflowX:"auto", whiteSpace:"pre-wrap", lineHeight:1.6 }}>{activeStep.expectedOutput}</pre>}
                </div>
              </div>
              {activeStep.rollback&&(
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:3, height:12, background:"#ef4444", borderRadius:2, display:"inline-block" }}/>Rollback for this step
                  </div>
                  <pre style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:7, padding:"10px 14px", fontFamily:"monospace", fontSize:11, color:"#7f1d1d", lineHeight:1.7, whiteSpace:"pre-wrap" }}>{activeStep.rollback}</pre>
                </div>
              )}
              {stepSubChecks.length>0&&(
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", alignItems:"center", gap:6 }}>
                    <span style={{ width:3, height:12, background:"#8b5cf6", borderRadius:2, display:"inline-block" }}/>Validation checklist
                  </div>
                  <div style={{ background:"#faf5ff", border:"1px solid #e9d5ff", borderRadius:7, padding:"10px 14px" }}>
                    {stepSubChecks.map((chk,i)=>{
                      const checked=isDone?(log?.subCheckResults?.[i]??false):(subChecks[i]||false);
                      return (
                        <label key={i} style={{ display:"flex", gap:10, alignItems:"center", padding:"6px 0", cursor:isDone?"default":"pointer", borderBottom:i<stepSubChecks.length-1?"1px solid #ede9fe":"none" }}>
                          <input type="checkbox" checked={checked} disabled={isDone||isFail} onChange={e=>!isDone&&setSubChecks(p=>({...p,[i]:e.target.checked}))} style={{ width:15, height:15, accentColor:"#8b5cf6", cursor:isDone?"default":"pointer" }}/>
                          <span style={{ fontSize:13, color:checked?"#5b21b6":"#374151", fontWeight:checked?600:400 }}>{chk}</span>
                          {checked&&<span style={{ marginLeft:"auto", fontSize:11, color:"#8b5cf6" }}>✓</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {(isDone||isFail)&&log?.lines?.length>0&&(
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:7, display:"flex", gap:16, alignItems:"center" }}>
                    Execution Log (recorded)
                    {log.startedAt&&<span style={{ fontSize:11, color:"#64748b", fontWeight:400, textTransform:"none" }}>
                      Started: {fmt(log.startedAt)} · Completed: {fmt(log.completedAt)} · Duration: {fmtSec(Math.max(0,Math.floor((new Date(log.completedAt)-new Date(log.startedAt))/1000)))}
                    </span>}
                  </div>
                  <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:7, padding:"10px 14px" }}>
                    {log.lines.map((l,i)=><div key={i} style={{ fontSize:12, fontFamily:"monospace", lineHeight:1.9, color:l.includes("✓")?"#15803d":l.includes("✗")?"#b91c1c":"#475569" }}>{l}</div>)}
                    {log.attachmentCount>0&&<div style={{ fontSize:11, color:"#8b5cf6", marginTop:6 }}>📎 {log.attachmentCount} attachment(s)</div>}
                  </div>
                </div>
              )}
              {!isDone&&!isFail&&(
                <div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:3, height:12, background:"#3b82f6", borderRadius:2, display:"inline-block" }}/>Notes / Observations <span style={{ color:"#ef4444" }}>*</span>
                    </div>
                    <textarea value={stepNote} onChange={e=>setStepNote(e.target.value)} rows={3}
                      placeholder="What did you do? What did you observe?"
                      style={{ width:"100%", background:"#f8fafc", border:"1px solid #c7d2fe", borderRadius:7, color:"#0f172a", padding:"10px 13px", fontSize:13, fontFamily:"inherit", outline:"none", resize:"vertical", lineHeight:1.6 }}/>
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:3, height:12, background:"#0e7490", borderRadius:2, display:"inline-block" }}/>Paste CLI output <span style={{ fontSize:10, color:"#94a3b8", fontWeight:400 }}>— optional</span>
                    </div>
                    <textarea value={cliOutput} onChange={e=>setCliOutput(e.target.value)} rows={4}
                      placeholder={"Paste terminal output here:\n\nRouter# show version\nCisco IOS XR Software, Version 7.7.2"}
                      style={{ width:"100%", background:"#0f172a", border:"1px solid #334155", borderRadius:7, color:"#22d3ee", padding:"10px 13px", fontSize:12, fontFamily:"monospace", outline:"none", resize:"vertical", lineHeight:1.7 }}/>
                  </div>
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ width:3, height:12, background:"#d97706", borderRadius:2, display:"inline-block" }}/>Attachments
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <label style={{ display:"flex", alignItems:"center", gap:7, background:"#f8fafc", border:"1px dashed #d1d5db", borderRadius:7, padding:"8px 14px", cursor:"pointer", fontSize:12, color:"#64748b" }}>
                        📎 Attach file
                        <input type="file" multiple style={{ display:"none" }} onChange={e=>setAttachments(p=>({...p,[activeStep.id]:[...(p[activeStep.id]||[]),...Array.from(e.target.files).map(f=>f.name)]}))}/>
                      </label>
                      {(attachments[activeStep.id]||[]).map((name,i)=>(
                        <span key={i} style={{ fontSize:11, background:"#eff6ff", color:"#1d4ed8", border:"1px solid #93c5fd", borderRadius:4, padding:"3px 8px" }}>📄 {name}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:10, alignItems:"center", paddingTop:4, borderTop:"1px solid #f1f5f9" }}>
                    <button onClick={()=>completeStep(activeStep,activeStepIdx,false)} disabled={!hasLog}
                      style={{ background:hasLog?"#15803d":"#f1f5f9", color:hasLog?"#fff":"#94a3b8", border:"none", borderRadius:7, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:hasLog?"pointer":"not-allowed", fontFamily:"inherit" }}>✓ Step Completed</button>
                    <button onClick={()=>completeStep(activeStep,activeStepIdx,true)} disabled={!hasLog}
                      style={{ background:"transparent", color:hasLog?"#b91c1c":"#94a3b8", border:`1px solid ${hasLog?"#fca5a5":"#e2e8f0"}`, borderRadius:7, padding:"11px 24px", fontSize:14, fontWeight:700, cursor:hasLog?"pointer":"not-allowed", fontFamily:"inherit" }}>✗ Step Failed</button>
                    <span style={{ fontSize:11, color:"#94a3b8" }}>{!hasLog?"Add notes or CLI output to continue":`${(stepNote+cliOutput).trim().length} chars logged ✓`}</span>
                  </div>
                </div>
              )}
            </div>;
          })()}
        </div>
      </div>
    </div>
  );

  return <Modal title={change.name} onClose={onClose} width={940}>
    {/* chips */}
    <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:14,alignItems:"center"}}>
      <Badge status={change.status}/><RiskPill risk={change.risk}/>
      <TypeTag type={change.type}/><IntrusionTag v={change.intrusion}/>
      {change.freezePeriod&&<FreezeTag/>}
      {change.execResult&&<span style={{fontSize:11,background:"#f0fdf4",color:"#15803d",border:"1px solid #86efac",borderRadius:4,padding:"2px 8px",fontWeight:600}}>{change.execResult}</span>}
      <span style={{display:"flex",alignItems:"center",gap:6,marginLeft:"auto"}}>
        <span style={{fontSize:11,color:T.light}}>ID:</span>
        <b style={{color:T.muted,fontFamily:"monospace",fontSize:11}}>{change.id}</b>
        <CopyIdButton id={change.id}/>
      </span>
    </div>
    {/* tabs */}
    <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,marginBottom:20,overflowX:"auto",gap:2}}>
      {TABS.map(t=>{
        const label={overview:"Overview",preflight:`Preflight (${Object.keys(change.preflightResults||{}).length}/6)`,steps:`Steps (${change.steps?.length||0})`,approval:`Approvers (${change.approvals?.length||0})`,execution:"Execution",comments:`Comments (${change.comments?.length||0})`,cab:"CAB",log:"Audit Trail"}[t]||t;
        const active=tab===t;
        return <button key={t} onClick={()=>avail(t)&&setTab(t)} style={{background:active?T.primaryBg:"none",border:"none",borderBottom:active?`2px solid ${T.primary}`:"2px solid transparent",borderRadius:active?"6px 6px 0 0":0,padding:"9px 14px",cursor:avail(t)?"pointer":"not-allowed",fontSize:12,fontWeight:active?700:500,fontFamily:"inherit",color:!avail(t)?T.light:active?T.primary:T.muted,whiteSpace:"nowrap",transition:"color 0.15s,background 0.15s"}}>{label}</button>;
      })}
    </div>

    {/* overview */}
    {tab==="overview"&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
      {change.freezePeriod&&<div style={{gridColumn:"1/-1",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"12px 16px"}}>
        <div style={{fontWeight:700,color:T.freeze,fontSize:13,marginBottom:4}}>❄ Freeze Period — Director Approval Required</div>
        <div style={{fontSize:12,color:"#b91c1c",fontStyle:"italic"}}>"{change.freezeJustification}"</div>
      </div>}
      {change.purpose&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Purpose / Activity Details</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6,background:T.bg,padding:"10px 13px",borderRadius:7,border:`1px solid ${T.border}`}}>{change.purpose}</div>
      </div>}
      {change.expectedEndState&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Expected End State</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6}}>{change.expectedEndState}</div>
      </div>}
      {!change.purpose&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Description</div>
        <div style={{fontSize:14,color:T.text,lineHeight:1.6}}>{change.description}</div>
      </div>}
      <div style={{gridColumn:"1/-1",background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"12px 16px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#92400e",textTransform:"uppercase",marginBottom:4}}>⚠ Service Impact</div>
        <div style={{fontSize:13,color:T.text}}>{change.serviceImpact||"Not specified."}</div>
        {change.affectedServices?.length>0&&<div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
          {change.affectedServices.map(s=><span key={s} style={{background:"#fef9c3",color:"#713f12",border:"1px solid #fde68a",borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:600}}>{s}</span>)}
        </div>}
      </div>
      {[
        ["Domain",change.domain],["Risk",change.risk],["Country",change.country?(COUNTRIES.find(c=>c.code===change.country)?.name??change.country):"—"],
        ["Approval",change.approvalLevel],["Exec Mode",change.execMode],["Intrusion",change.intrusion],
        ["Team",change.team],["Manager",change.manager],["Director",change.director],
        ["Scheduled Start",fmt(change.scheduledFor)],["Scheduled End",fmt(change.scheduledEnd)],
        ["Actual Start",fmt(change.actualStart)],["Actual End",fmt(change.actualEnd)],
      ].map(([l,v])=>(
        <div key={l}><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>{l}</div><div style={{fontSize:13,color:T.text}}>{v||"—"}</div></div>
      ))}
      {mw&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>Maintenance Window</div><div style={{fontSize:13,color:T.accent,fontWeight:600}}>{mw.name}</div><div style={{fontSize:11,color:T.muted}}>{fmt(mw.start)} → {fmt(mw.end)}</div></div>}
      {change.relatedTickets&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>Related Tickets</div><div style={{fontSize:13,color:T.text}}>{change.relatedTickets}</div></div>}
      <div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Rollback Plan</div>
        <pre style={{fontFamily:"monospace",fontSize:12,color:T.text,background:T.bg,padding:"9px 12px",borderRadius:7,border:`1px solid ${T.border}`,whiteSpace:"pre-wrap"}}>{change.rollbackPlan}</pre>
      </div>
      {change.blastRadius&&<div style={{gridColumn:"1/-1",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"12px 16px"}}>
        <div style={{fontSize:11,fontWeight:700,color:"#b91c1c",textTransform:"uppercase",marginBottom:4}}>💥 Blast Radius</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6}}>{change.blastRadius}</div>
      </div>}
      {change.dependencies&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Dependencies</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6,whiteSpace:"pre-wrap",background:T.bg,padding:"9px 12px",borderRadius:7,border:`1px solid ${T.border}`}}>{change.dependencies}</div>
      </div>}
      {(change.affectedRegions||change.affectedInterfaces)&&<div style={{gridColumn:"1/-1",display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {change.affectedRegions&&<div><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>Affected Regions</div><div style={{fontSize:13,color:T.text}}>{change.affectedRegions}</div></div>}
        {change.affectedInterfaces&&<div><div style={{fontSize:11,color:T.muted,fontWeight:600,textTransform:"uppercase",marginBottom:2}}>Affected Interfaces</div><div style={{fontSize:13,color:T.text}}>{change.affectedInterfaces}</div></div>}
      </div>}
      {change.validationPlan&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Validation Plan</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6,whiteSpace:"pre-wrap",background:"#f0fdf4",padding:"9px 12px",borderRadius:7,border:"1px solid #86efac"}}>{change.validationPlan}</div>
      </div>}
      {change.rollbackTrigger&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Rollback Trigger</div>
        <div style={{fontSize:13,color:"#b91c1c",lineHeight:1.6,background:"#fef2f2",padding:"9px 12px",borderRadius:7,border:"1px solid #fca5a5"}}>{change.rollbackTrigger}</div>
      </div>}
      {change.escalationPath&&<div style={{gridColumn:"1/-1"}}>
        <div style={{fontSize:11,fontWeight:600,color:T.muted,textTransform:"uppercase",marginBottom:4}}>Escalation Path</div>
        <div style={{fontSize:13,color:T.text,lineHeight:1.6,whiteSpace:"pre-wrap",background:T.bg,padding:"9px 12px",borderRadius:7,border:`1px solid ${T.border}`}}>{change.escalationPath}</div>
      </div>}
      {change.pirRequired&&<div style={{gridColumn:"1/-1",background:"#fffbeb",border:"1px solid #fcd34d",borderRadius:8,padding:"10px 14px",display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:16}}>📋</span>
        <div><div style={{fontWeight:700,color:"#92400e",fontSize:13}}>PIR / Post-Incident Review Scheduled</div><div style={{fontSize:12,color:"#b45309",marginTop:1}}>Debrief required within 5 business days.</div></div>
      </div>}
      <div style={{gridColumn:"1/-1",display:"flex",gap:10,paddingTop:6,flexWrap:"wrap",alignItems:"center"}}>
        {change.status==="Draft"&&<Btn onClick={()=>{moveTo("Preflight");setTab("preflight");}}>→ Start Preflight</Btn>}
        {change.status==="Approved"&&<Btn variant="success" onClick={()=>{const t=now();moveTo("In Execution");onUpdate(c=>({...c,actualStart:t}));if(change.steps?.[0]) setStepStartTimes({[change.steps[0].id]:t});setTab("execution");}}>▶ Begin Execution</Btn>}
        <div style={{marginLeft:"auto"}}>
          {!change.isTemplate
            ? <Btn variant="ghost" small onClick={()=>{onUpdate(c=>({...c,isTemplate:true}));addLog("Saved as reusable template","info");}}>⊡ Save as Template</Btn>
            : <Btn variant="ghost" small onClick={()=>{onUpdate(c=>({...c,isTemplate:false}));addLog("Removed from templates","info");}}>↩ Remove from Templates</Btn>
          }
        </div>
      </div>
    </div>}

    {/* preflight */}
    {tab==="preflight"&&<div>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:14,padding:"9px 13px",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8}}>
        <Btn small variant="outline" onClick={runAllPF}>▶ Run All Auto</Btn>
        <span style={{fontSize:12,color:T.muted}}>or complete each check manually</span>
      </div>
      {PF_CHECKS.map(chk=>{
        const r=results[chk.id]; const st=r?.status||"pending";
        const col={pass:"#15803d",fail:"#b91c1c",running:"#b45309",pending:T.light}[st];
        const icon={pass:"✓",fail:"✗",running:"…",pending:"○"}[st];
        return <div key={chk.id} style={{border:`1px solid ${T.border}`,borderRadius:8,marginBottom:7,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:11,padding:"9px 13px",background:st==="pass"?"#f0fdf4":st==="fail"?"#fef2f2":T.surface}}>
            <div style={{width:24,height:24,borderRadius:"50%",background:col+"18",color:col,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,flexShrink:0}}>{icon}</div>
            <div style={{flex:1,fontSize:13,fontWeight:600,color:T.text}}>{chk.label}</div>
            <div style={{display:"flex",gap:6}}>
              {st==="pass"&&<span style={{fontSize:11,color:"#15803d",fontWeight:600}}>PASSED · {r.by}</span>}
              {st!=="pass"&&st!=="running"&&<><Btn small variant="outline" onClick={()=>autoCheck(chk)}>Auto</Btn><Btn small variant="ghost" onClick={()=>{setPfModal(chk);setPfLog({[chk.id]:""})}}>Manual</Btn></>}
            </div>
          </div>
          {r?.log&&<div style={{padding:"6px 48px",fontSize:11,color:T.muted,background:T.bg,borderTop:`1px solid ${T.border}`,fontFamily:"monospace"}}>{r.log}</div>}
        </div>;
      })}
      <div style={{display:"flex",gap:10,marginTop:14}}>
        {pfAllPass&&<Btn variant="success" onClick={()=>{moveTo("Pending Approval");addLog("Preflight passed","success");setTab("approval");}}>✓ All Passed — Submit for Approval</Btn>}
        {pfFail&&<Btn variant="danger" onClick={()=>{moveTo("Failed");addLog("Preflight failed","error");}}>✗ Mark Failed</Btn>}
      </div>
      {pfModal&&<Modal title={`Manual Check: ${pfModal.label}`} onClose={()=>setPfModal(null)} width={460}>
        <Inp label="Evidence log (mandatory)" value={pfLog[pfModal.id]||""} onChange={v=>setPfLog(p=>({...p,[pfModal.id]:v}))} type="textarea" rows={4} placeholder="Describe what you did and observed…" required/>
        <div style={{display:"flex",gap:10,marginTop:14}}>
          <Btn variant="success" disabled={(pfLog[pfModal.id]||"").length<5} onClick={()=>{setResult(pfModal.id,{status:"pass",log:pfLog[pfModal.id]});setPfModal(null);}}>✓ Passed</Btn>
          <Btn variant="danger"  disabled={(pfLog[pfModal.id]||"").length<5} onClick={()=>{setResult(pfModal.id,{status:"fail",log:pfLog[pfModal.id]});setPfModal(null);}}>✗ Failed</Btn>
          <Btn variant="ghost" onClick={()=>setPfModal(null)}>Cancel</Btn>
        </div>
      </Modal>}
    </div>}

    {/* steps (read-only view) */}
    {tab==="steps"&&<div>
      {(change.steps||[]).map((s,i)=><div key={s.id} style={{marginBottom:9,padding:14,background:T.bg,border:`1px solid ${T.border}`,borderRadius:9}}>
        <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:8}}>
          <div style={{width:24,height:24,borderRadius:"50%",background:T.border,color:T.muted,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,flexShrink:0}}>{i+1}</div>
          <div style={{fontWeight:700,fontSize:13,color:T.text,flex:1}}>{s.name}</div>
          <div style={{fontSize:11,color:T.muted}}>Owner: {s.owner} · {s.duration} min</div>
        </div>
        <div style={{paddingLeft:34,display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>Instructions</div><div style={{fontSize:12,color:T.text,lineHeight:1.5}}>{s.instructions}</div></div>
          <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>Expected Outcome</div><div style={{fontSize:12,color:"#15803d",lineHeight:1.5}}>{s.expectedOutcome}</div></div>
          {s.commands?.length>0&&<div style={{gridColumn:"1/-1"}}><div style={{fontSize:11,color:T.muted,marginBottom:2}}>Commands</div>{s.commands.map((cmd,ci)=><div key={ci} style={{fontFamily:"monospace",fontSize:11,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,padding:"4px 8px",marginBottom:3}}>{cmd}</div>)}</div>}
        </div>
      </div>)}
    </div>}

    {/* approval */}
    {tab==="approval"&&<div>
      {change.freezePeriod&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:8,padding:"12px 16px",marginBottom:16}}>
        <div style={{fontWeight:700,color:T.freeze,fontSize:13}}>❄ Freeze Period — Only Director can approve</div>
        <div style={{fontSize:12,color:"#b91c1c",marginTop:2,fontStyle:"italic"}}>"{change.freezeJustification}"</div>
      </div>}
      <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:18,padding:13,background:(levelColor[change.approvalLevel]||T.muted)+"0d",borderRadius:8,border:`1px solid ${(levelColor[change.approvalLevel]||T.muted)}30`}}>
        <div style={{fontSize:24,fontWeight:800,color:change.freezePeriod?T.freeze:levelColor[change.approvalLevel],fontFamily:"monospace"}}>{change.freezePeriod?"L3":change.approvalLevel}</div>
        <div>
          <div style={{fontWeight:700,color:T.text,fontSize:14}}>{change.freezePeriod?"Director (Freeze Override)":({L1:"Peer / Auto",L2:"Manager Review",L3:"Director / Bar Raiser"})[change.approvalLevel]}</div>
          <div style={{fontSize:12,color:T.muted,marginTop:3,display:"flex",gap:8,alignItems:"center"}}><RiskPill risk={change.risk}/>{change.cab&&<span style={{fontSize:11,color:T.primary,fontWeight:600}}>CAB required</span>}</div>
        </div>
      </div>
      {(change.approvals||[]).length>0&&<div style={{marginBottom:16}}>
        <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Approval History</div>
        {(change.approvals||[]).map((a,i)=><div key={i} style={{display:"flex",gap:10,padding:"8px 0",borderBottom:`1px solid ${T.border}`}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:a.action==="approved"?"#15803d":"#b91c1c",flexShrink:0,marginTop:5}}/>
          <div><span style={{fontWeight:600,color:T.text,fontSize:13}}>{a.by}</span><span style={{color:T.muted,fontSize:12}}> · {a.action} · {fmt(a.at)}</span>{a.comment&&<div style={{fontSize:12,color:T.muted,fontStyle:"italic",marginTop:2}}>"{a.comment}"</div>}</div>
        </div>)}
      </div>}
      <Inp label="Comment" value={aprComment} onChange={setAprComment} type="textarea" rows={2} placeholder="Add context…" style={{marginBottom:12}}/>
      {canApprove()
        ?<div style={{display:"flex",gap:10}}>
          <Btn variant="success" onClick={()=>{const e={by:currentUser.name,action:"approved",at:now(),comment:aprComment};onUpdate(c=>({...c,status:"Approved",approvals:[...(c.approvals||[]),e]}));addLog(`Approved by ${currentUser.name}`,"success");setAprComment("");setTab("execution");}}>✓ Approve</Btn>
          <Btn variant="danger"  onClick={()=>{const e={by:currentUser.name,action:"rejected",at:now(),comment:aprComment};onUpdate(c=>({...c,status:"Draft",approvals:[...(c.approvals||[]),e]}));addLog(`Rejected by ${currentUser.name}`,"error");setAprComment("");}}>✗ Reject</Btn>
        </div>
        :<div style={{fontSize:13,color:T.muted,padding:"9px 13px",background:T.bg,borderRadius:7,border:`1px solid ${T.border}`}}>{change.freezePeriod?`Freeze: only Directors can approve (you are ${currentUser.role})`:`Your role (${currentUser.role}) cannot approve ${change.approvalLevel}`}</div>}
    </div>}

    {/* execution */}
    {tab==="execution"&&execTabUI}

    {/* comments */}
    {tab==="comments"&&<CommentStream change={change} currentUser={currentUser} onUpdate={onUpdate}/>}

    {/* cab */}
    {tab==="cab"&&change.cab&&<CABPanel change={change} currentUser={currentUser} onUpdate={onUpdate} addLog={addLog}/>}
    {tab==="cab"&&!change.cab&&<div style={{color:T.muted,fontSize:13,padding:"20px 0"}}>CAB review is not required for this change category/risk level.</div>}

    {/* log */}
    {tab==="log"&&<div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <Btn small variant="outline" onClick={()=>exportAuditCSV([change])}>⬇ Export CSV</Btn>
      </div>
      <div style={{maxHeight:400,overflowY:"auto"}}>
        {[...(change.auditLog||[])].reverse().map((e,i)=>{
          const col={info:T.muted,success:"#15803d",error:"#b91c1c",warning:"#b45309"}[e.type]||T.muted;
          return <div key={i} style={{display:"flex",gap:11,padding:"9px 0",borderBottom:`1px solid ${T.border}`}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:col,marginTop:5,flexShrink:0}}/>
            <div style={{flex:1}}>
              <span style={{fontSize:13,color:T.text}}>{e.msg}</span>
              <span style={{fontSize:11,color:T.light,marginLeft:8}}>by {e.by}</span>
              <div style={{fontSize:11,color:T.light,marginTop:1}}>{fmt(e.at)}</div>
            </div>
          </div>;
        })}
      </div>
    </div>}
  </Modal>;
}

// ─── MAINTENANCE WINDOW MANAGER ───────────────────────────────────────────────
function MWManager({windows,onClose}){
  return <Modal title="🔧 Maintenance Windows" onClose={onClose} width={680}>
    <div style={{marginBottom:16,display:"flex",justifyContent:"flex-end"}}>
      <Btn small>+ New Window</Btn>
    </div>
    {windows.map(mw=><div key={mw.id} style={{border:`1px solid ${mw.freeze?T.freeze+"40":T.border}`,borderRadius:9,padding:14,marginBottom:10,background:mw.freeze?"#fef2f2":T.surface}}>
      <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:16}}>{mw.freeze?"❄":"🔧"}</span>
        <div style={{fontWeight:700,fontSize:14,color:mw.freeze?T.freeze:T.text,flex:1}}>{mw.name}</div>
        {mw.freeze&&<FreezeTag/>}
        <span style={{fontSize:11,background:mw.active?"#f0fdf4":"#f1f5f9",color:mw.active?"#15803d":T.muted,border:`1px solid ${mw.active?"#86efac":T.border}`,borderRadius:4,padding:"2px 7px",fontWeight:600}}>{mw.active?"ACTIVE":"INACTIVE"}</span>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
        <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>START</div><div style={{fontSize:12,color:T.text}}>{fmt(mw.start)}</div></div>
        <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>END</div><div style={{fontSize:12,color:T.text}}>{fmt(mw.end)}</div></div>
        <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>RECURRENCE</div><div style={{fontSize:12,color:T.text}}>{mw.recurrence}</div></div>
      </div>
      {mw.teams&&<div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap"}}>
        {mw.teams.map(t=><span key={t} style={{background:T.primaryBg,color:T.primary,border:`1px solid ${T.primaryBorder}`,borderRadius:4,padding:"2px 7px",fontSize:11,fontWeight:600}}>{t}</span>)}
      </div>}
    </div>)}
  </Modal>;
}

// ─── NOTIFICATIONS PANEL ──────────────────────────────────────────────────────
function NotificationsPanel({changes,onClose}){
  const notifs=[];
  changes.forEach(c=>{
    if(c.status==="Pending Approval") notifs.push({type:"approval",msg:`${c.id}: "${c.name}" needs approval (${c.approvalLevel})`,at:c.auditLog?.slice(-1)[0]?.at,change:c,color:"#3b82f6"});
    if(c.freezePeriod&&["Draft","Preflight","Pending Approval"].includes(c.status)) notifs.push({type:"freeze",msg:`❄ Freeze period change: "${c.name}" — Director approval required`,at:c.auditLog?.slice(-1)[0]?.at,change:c,color:T.freeze});
    if(c.status==="In Execution") notifs.push({type:"executing",msg:`▶ Currently executing: "${c.name}"`,at:c.actualStart,change:c,color:"#0e7490"});
    if(["Failed","Aborted","Rolled Back"].includes(c.status)) notifs.push({type:"alert",msg:`⚠ ${c.status}: "${c.name}" requires attention`,at:c.auditLog?.slice(-1)[0]?.at,change:c,color:"#b91c1c"});
  });
  notifs.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));

  return <Modal title={`🔔 Notifications (${notifs.length})`} onClose={onClose} width={560}>
    {notifs.length===0&&<div style={{textAlign:"center",padding:40,color:T.light}}>No notifications.</div>}
    {notifs.map((n,i)=><div key={i} style={{display:"flex",gap:12,padding:"11px 0",borderBottom:`1px solid ${T.border}`,alignItems:"flex-start"}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:n.color,flexShrink:0,marginTop:5}}/>
      <div style={{flex:1}}>
        <div style={{fontSize:13,color:T.text,lineHeight:1.4}}>{n.msg}</div>
        <div style={{fontSize:11,color:T.light,marginTop:3}}>{fmt(n.at)}</div>
      </div>
    </div>)}
  </Modal>;
}

// ─── PEAK CALENDAR (auto-freeze) ─────────────────────────────────────────────
const PEAK_PERIODS = [
  {id:"p1", name:"Prime Day 2025",       start:"2025-07-08", end:"2025-07-09", color:"#dc2626"},
  {id:"p2", name:"Black Friday 2025",    start:"2025-11-28", end:"2025-11-28", color:"#dc2626"},
  {id:"p3", name:"Cyber Monday 2025",    start:"2025-12-01", end:"2025-12-01", color:"#dc2626"},
  {id:"p4", name:"Holiday Peak Q4 2025", start:"2025-12-15", end:"2026-01-05", color:"#b91c1c"},
  {id:"p5", name:"Super Promo MAR 2026", start:"2026-03-07", end:"2026-03-14", color:"#dc2626"},
];
function isInPeakPeriod(dateIso) {
  if (!dateIso) return null;
  const d = new Date(dateIso).toISOString().slice(0,10);
  return PEAK_PERIODS.find(p => d >= p.start && d <= p.end) || null;
}
function getActivePeak() {
  const today = new Date().toISOString().slice(0,10);
  return PEAK_PERIODS.find(p => today >= p.start && today <= p.end) || null;
}

// ─── CHANGE CATEGORY RULES ────────────────────────────────────────────────────
const CAT_META = {
  Standard:  { color:"#15803d", bg:"#f0fdf4", border:"#86efac", label:"Standard",  icon:"✓", desc:"Pre-approved routine operation. No CAB required. Max risk: Low." },
  Normal:    { color:"#1d4ed8", bg:"#eff6ff", border:"#93c5fd", label:"Normal",    icon:"↻", desc:"Requires approval and scheduled window. CAB required if risk ≥ High." },
  Emergency: { color:"#b91c1c", bg:"#fef2f2", border:"#fca5a5", label:"Emergency", icon:"⚡", desc:"Executed immediately during active incident. Director + Bar Raiser required." },
};
function getCategoryRules(cat, risk) {
  const rules = [];
  if (cat === "Standard") {
    rules.push("Pre-approved — no CAB needed");
    rules.push("Risk must be Low");
    rules.push("L1 approval sufficient");
  } else if (cat === "Normal") {
    rules.push("Manager approval required (L2)");
    if (["High","Critical"].includes(risk)) rules.push("⚠ CAB review required (risk ≥ High)");
    if (risk === "Critical") rules.push("⚠ Bar Raiser required (Critical risk)");
    rules.push("Must be scheduled in maintenance window");
  } else if (cat === "Emergency") {
    rules.push("⚡ Director approval required");
    rules.push("⚡ Bar Raiser required");
    rules.push("⚡ Incident ID mandatory");
    rules.push("Skip maintenance window — immediate execution");
  }
  return rules;
}

// ─── COMMENT STREAM ───────────────────────────────────────────────────────────
function CommentStream({change, currentUser, onUpdate}) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState(false);
  const comments = change.comments || [];

  function addComment() {
    if (!text.trim()) return;
    const c = { id: genId(), by: currentUser.name, role: currentUser.role, at: now(), text: text.trim(), edited: false };
    onUpdate(ch => ({ ...ch, comments: [...(ch.comments||[]), c] }));
    setText("");
  }

  return (
    <div>
      <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:12 }}>
        Comment Stream ({comments.length})
      </div>

      {/* existing comments */}
      <div style={{ marginBottom:16 }}>
        {comments.length === 0 && <div style={{ color:T.light, fontSize:13, fontStyle:"italic", padding:"12px 0" }}>No comments yet.</div>}
        {[...comments].reverse().map(c => (
          <div key={c.id} style={{ display:"flex", gap:11, padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
            <div style={{ width:34, height:34, borderRadius:"50%", background:T.primaryBg, color:T.primary,
              display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:13, flexShrink:0 }}>
              {c.by.split(" ").map(w=>w[0]).join("").slice(0,2)}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:"flex", gap:8, alignItems:"baseline", marginBottom:4 }}>
                <span style={{ fontWeight:700, fontSize:13, color:T.text }}>{c.by}</span>
                <span style={{ fontSize:11, color:T.light, background:T.bg, border:`1px solid ${T.border}`, borderRadius:3, padding:"1px 6px" }}>{c.role}</span>
                <span style={{ fontSize:11, color:T.light, marginLeft:"auto" }}>{fmt(c.at)}</span>
              </div>
              <div style={{ fontSize:13, color:T.text, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{c.text}</div>
            </div>
          </div>
        ))}
      </div>

      {/* input */}
      <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:9, overflow:"hidden" }}>
        <div style={{ display:"flex", borderBottom:`1px solid ${T.border}` }}>
          {["Write","Preview"].map(m => (
            <button key={m} onClick={()=>setPreview(m==="Preview")}
              style={{ padding:"7px 14px", border:"none", background:((m==="Preview")===preview)?T.primaryBg:"transparent",
                color:((m==="Preview")===preview)?T.primary:T.muted, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}>
              {m}
            </button>
          ))}
          <span style={{ marginLeft:"auto", fontSize:11, color:T.light, padding:"7px 12px" }}>Markdown supported</span>
        </div>
        {preview
          ? <div style={{ padding:"10px 14px", minHeight:80, fontSize:13, color:T.text, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{text||<span style={{color:T.light}}>Nothing to preview.</span>}</div>
          : <textarea value={text} onChange={e=>setText(e.target.value)} rows={3}
              placeholder="Leave a comment — supports Markdown…"
              style={{ width:"100%", padding:"10px 14px", border:"none", background:"transparent", fontFamily:"inherit",
                fontSize:13, color:T.text, resize:"vertical", outline:"none", lineHeight:1.6 }}/>
        }
        <div style={{ display:"flex", justifyContent:"flex-end", padding:"8px 12px", borderTop:`1px solid ${T.border}` }}>
          <Btn small disabled={!text.trim()} onClick={addComment}>Add Comment</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── CAB PANEL ────────────────────────────────────────────────────────────────
function CABPanel({change, currentUser, onUpdate, addLog}) {
  const cab = change.cab || { status:"pending", approvers:[], quorum:3, barRaiserRequired:change.barRaiserRequired||false, barRaiserApproved:false };
  const [comment, setComment] = useState("");

  const isBarRaiser = currentUser.role === "Director";
  const alreadyApproved = cab.approvers.some(a => a.by === currentUser.name);
  const approvedCount = cab.approvers.filter(a => a.action === "approved").length;
  const quorumMet = approvedCount >= cab.quorum;
  const barRaiserMet = !cab.barRaiserRequired || cab.barRaiserApproved;
  const cabApproved = quorumMet && barRaiserMet;

  function doApprove(action) {
    const entry = { by: currentUser.name, role: currentUser.role, action, comment, at: now() };
    const newApprovers = [...(cab.approvers||[]), entry];
    const newBarRaiser = isBarRaiser && action === "approved" ? true : cab.barRaiserApproved;
    const newCab = { ...cab, approvers: newApprovers, barRaiserApproved: newBarRaiser };
    const newApprovedCount = newApprovers.filter(a => a.action === "approved").length;
    const newStatus = (newApprovedCount >= cab.quorum && (!cab.barRaiserRequired || newBarRaiser)) ? "approved" : "pending";
    onUpdate(c => ({ ...c, cab: { ...newCab, status: newStatus },
      status: newStatus === "approved" ? "Approved" : c.status }));
    addLog(`CAB: ${currentUser.name} (${currentUser.role}) ${action}`, action === "approved" ? "success" : "warning");
    setComment("");
  }

  const ACTION_COL = { approved:"#15803d", rejected:"#b91c1c", abstained:"#b45309" };

  return (
    <div>
      {/* CAB header */}
      <div style={{ background: cabApproved ? "#f0fdf4" : "#fffbeb", border:`1px solid ${cabApproved?"#86efac":"#fcd34d"}`,
        borderRadius:9, padding:"14px 16px", marginBottom:16, display:"flex", gap:16, alignItems:"center" }}>
        <div style={{ fontSize:28, fontWeight:800, color:cabApproved?"#15803d":"#b45309" }}>{approvedCount}/{cab.quorum}</div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, color:T.text, fontSize:14 }}>CAB Quorum — {cabApproved?"✓ Met":"Pending"}</div>
          <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>
            {cab.barRaiserRequired && <span style={{ color:barRaiserMet?"#15803d":"#b91c1c", fontWeight:600, marginRight:8 }}>
              {barRaiserMet?"✓":"⚠"} Bar Raiser
            </span>}
            Requires {cab.quorum} approvals · {change.risk} risk
          </div>
        </div>
        {cabApproved && <span style={{ fontSize:13, fontWeight:700, color:"#15803d", background:"#dcfce7", padding:"6px 12px", borderRadius:6 }}>✓ CAB APPROVED</span>}
      </div>

      {/* approver list */}
      {cab.approvers.length > 0 && (
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", marginBottom:8 }}>Individual Approvers ({cab.approvers.length})</div>
          <div style={{ border:`1px solid ${T.border}`, borderRadius:9, overflow:"hidden" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 100px 80px 1fr 100px", padding:"7px 14px",
              background:T.bg, fontSize:10, fontWeight:700, color:T.muted, textTransform:"uppercase", borderBottom:`1px solid ${T.border}` }}>
              <div>Approver</div><div>Role</div><div>Level</div><div>Status / Comment</div><div>Time</div>
            </div>
            {cab.approvers.map((a,i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 100px 80px 1fr 100px",
                padding:"10px 14px", borderBottom: i<cab.approvers.length-1?`1px solid ${T.border}`:"none",
                background: i%2===0 ? T.surface : T.bg, alignItems:"center" }}>
                <div style={{ fontWeight:600, fontSize:13, color:T.text }}>{a.by}</div>
                <div style={{ fontSize:11, color:T.muted }}>{a.role}</div>
                <div>
                  {a.role==="Director" && <span style={{ fontSize:10, background:"#fef2f2", color:T.freeze, border:"1px solid #fca5a5", borderRadius:3, padding:"1px 5px", fontWeight:700 }}>Bar Raiser</span>}
                </div>
                <div>
                  <span style={{ fontSize:12, color:ACTION_COL[a.action]||T.muted, fontWeight:600, textTransform:"capitalize" }}>{a.action}</span>
                  {a.comment && <div style={{ fontSize:11, color:T.muted, fontStyle:"italic", marginTop:2 }}>"{a.comment}"</div>}
                </div>
                <div style={{ fontSize:11, color:T.light }}>{fmt(a.at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* action */}
      {!alreadyApproved && (
        <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:9, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:600, color:T.text, marginBottom:10 }}>
            Your vote — {currentUser.name} ({currentUser.role})
            {isBarRaiser && <span style={{ marginLeft:8, fontSize:11, color:T.freeze, fontWeight:700 }}>★ Bar Raiser</span>}
          </div>
          <Inp label="Comment (optional)" value={comment} onChange={setComment} type="textarea" rows={2}
            placeholder="Reason for approval/rejection…" style={{marginBottom:12}}/>
          <div style={{ display:"flex", gap:10 }}>
            <Btn variant="success" onClick={()=>doApprove("approved")}>✓ Approve</Btn>
            <Btn variant="danger"  onClick={()=>doApprove("rejected")}>✗ Reject</Btn>
            <Btn variant="ghost"   onClick={()=>doApprove("abstained")}>— Abstain</Btn>
          </div>
        </div>
      )}
      {alreadyApproved && (
        <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, padding:"11px 14px", color:T.muted, fontSize:13 }}>
          ✓ You have already voted on this CAB review.
        </div>
      )}
    </div>
  );
}

// ─── CREATE MODE PICKER ───────────────────────────────────────────────────────
function CreateModePicker({templates, activePeak, windows, currentUser, onPickAdHoc, onPickTemplate, onPickNewTemplate, onClose, onCreate}) {
  const [step, setStep] = useState("pick"); // "pick" | "template-list" | "template-fill"
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const OPTIONS = [
    {
      key:"from-template",
      icon:"⊡",
      label:"Use a Template",
      desc:"Start from an existing approved template. Steps, checks and rollback are pre-filled.",
      color:"#6d28d9", bg:"#f5f3ff", border:"#c4b5fd",
      action:() => templates.length ? setStep("template-list") : onPickAdHoc(),
    },
    {
      key:"new-template",
      icon:"📐",
      label:"Create a Template",
      desc:"Build a reusable template with steps, pre/post checks and rollback plans for your team.",
      color:"#0f766e", bg:"#f0fdfa", border:"#99f6e4",
      action: onPickNewTemplate,
    },
    {
      key:"adhoc",
      icon:"↻",
      label:"Ad-hoc Change",
      desc:"One-off change for a specific situation. You define everything from scratch.",
      color:"#b45309", bg:"#fffbeb", border:"#fcd34d",
      action: onPickAdHoc,
    },
  ];

  if (step === "template-fill" && selectedTemplate) {
    return <TemplateQuickFill
      template={selectedTemplate}
      activePeak={activePeak}
      currentUser={currentUser}
      windows={windows}
      onCreate={c => { onCreate(c); onClose(); }}
      onClose={onClose}
    />;
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",backdropFilter:"blur(3px)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:640,boxShadow:"0 24px 64px rgba(0,0,0,0.22)"}}>

        {step === "pick" && <>
          <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:17,fontWeight:800,color:T.text,letterSpacing:"-0.3px"}}>New VNOC Change</div>
              <div style={{fontSize:12,color:T.muted,marginTop:2}}>How do you want to create this change?</div>
            </div>
            <button onClick={onClose} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:16,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>

          {activePeak && (
            <div style={{margin:"16px 24px 0",background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"12px 16px",display:"flex",gap:12,alignItems:"flex-start"}}>
              <span style={{fontSize:18,flexShrink:0}}>❄</span>
              <div>
                <div style={{fontWeight:700,color:T.freeze,fontSize:13}}>Network Freeze Active: {activePeak.name}</div>
                <div style={{fontSize:12,color:"#b91c1c",marginTop:2}}>Any change created now will require <b>Director approval + business justification</b>. All changes are affected.</div>
              </div>
            </div>
          )}

          <div style={{padding:"20px 24px",display:"flex",flexDirection:"column",gap:12}}>
            {OPTIONS.map(o=>(
              <button key={o.key} onClick={o.action} style={{display:"flex",alignItems:"center",gap:16,padding:"16px 20px",border:`2px solid ${o.border}`,borderRadius:12,background:o.bg,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"box-shadow 0.15s"}}>
                <div style={{width:48,height:48,borderRadius:12,background:"#fff",border:`1.5px solid ${o.border}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>
                  {o.icon}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:15,fontWeight:700,color:o.color,marginBottom:3}}>{o.label}</div>
                  <div style={{fontSize:12,color:T.muted,lineHeight:1.5}}>{o.desc}</div>
                </div>
                <span style={{color:o.color,fontSize:18,flexShrink:0}}>›</span>
              </button>
            ))}
          </div>
        </>}

        {step === "template-list" && <>
          <div style={{padding:"20px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:12}}>
            <button onClick={()=>setStep("pick")} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:13,padding:"5px 12px",fontFamily:"inherit"}}>← Back</button>
            <div>
              <div style={{fontSize:15,fontWeight:700,color:T.text}}>Choose a Template</div>
              <div style={{fontSize:12,color:T.muted,marginTop:1}}>{templates.length} template{templates.length!==1?"s":""} available</div>
            </div>
            <button onClick={onClose} style={{marginLeft:"auto",background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:16,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
          </div>
          <div style={{padding:"16px 24px",maxHeight:420,overflowY:"auto",display:"flex",flexDirection:"column",gap:8}}>
            {templates.length===0&&<div style={{textAlign:"center",padding:"40px 0",color:T.light}}>No templates yet. Create one first.</div>}
            {templates.map(t=>(
              <button key={t.id} onClick={()=>{setSelectedTemplate(t);setStep("template-fill");}} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 16px",border:`1px solid ${T.border}`,borderRadius:10,background:T.surface,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"border-color 0.15s,box-shadow 0.15s"}}>
                <div style={{width:38,height:38,borderRadius:9,background:"#f5f3ff",border:"1.5px solid #c4b5fd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0}}>⊡</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:3}}>{t.name}</div>
                  <div style={{fontSize:11,color:T.muted,display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>{t.domain} · {t.steps?.length||0} steps · {t.approvalLevel} · <RiskPill risk={t.risk}/></div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4,flexShrink:0}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#6d28d9"}}>Quick Fill →</span>
                  <span style={{fontSize:10,color:T.light}}>~2 fields</span>
                </div>
              </button>
            ))}
          </div>
        </>}

      </div>
    </div>
  );
}

// ─── STEP EDITOR FORM (used inside wizard) ────────────────────────────────────
function StepEditorForm({draft, sdSf, onSave, onCancel}) {
  const valid = draft.name.trim().length >= 2 && draft.instructions.trim().length >= 5;
  return (
    <div style={{ padding:"16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
      <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr", gap:10 }}>
        <Inp label="Step Name *" value={draft.name} onChange={sdSf("name")} placeholder="e.g. Pre-checks & Baseline Snapshot"/>
        <Inp label="Duration (min)" value={draft.duration} onChange={sdSf("duration")} type="number"/>
        <Inp label="Owner" value={draft.owner} onChange={sdSf("owner")} placeholder="e.g. Engineer"/>
      </div>
      <Inp label="Instructions *" value={draft.instructions} onChange={sdSf("instructions")} type="textarea" rows={3}
        placeholder="Describe what the engineer needs to do in this step…"/>
      <Inp label="Commands (one per line)" value={Array.isArray(draft.commands)?draft.commands.join("\n"):draft.commands} onChange={sdSf("commands")} type="textarea" rows={3}
        placeholder={"show version\nshow isis adjacency\nshow bgp summary"}/>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        <Inp label="Pre-checks — verify before running (one per line)" value={Array.isArray(draft.preChecks)?draft.preChecks.join("\n"):draft.preChecks} onChange={sdSf("preChecks")} type="textarea" rows={3}
          placeholder={"All ISIS adjacencies UP\nBGP sessions Established\nNo active alarms"}/>
        <Inp label="Post-checks — validate after completing (one per line)" value={Array.isArray(draft.postChecks)?draft.postChecks.join("\n"):draft.postChecks} onChange={sdSf("postChecks")} type="textarea" rows={3}
          placeholder={"Version confirmed\nAll sessions re-established\nNo new alarms"}/>
      </div>
      <Inp label="Rollback for this step (if it fails)" value={draft.rollback} onChange={sdSf("rollback")} type="textarea" rows={2}
        placeholder="e.g. install rollback to label baseline-7.5.1"/>
      <Inp label="Expected outcome" value={draft.expectedOutcome||""} onChange={sdSf("expectedOutcome")}
        placeholder="e.g. All services restored, no alarms, version confirmed"/>
      <div style={{ display:"flex", gap:8, paddingTop:4 }}>
        <Btn onClick={onSave} disabled={!valid}>✓ Save Step</Btn>
        <Btn variant="ghost" onClick={onCancel}>Cancel</Btn>
      </div>
    </div>
  );
}

// ─── TEMPLATE QUICK-FILL ─────────────────────────────────────────────────────
function TemplateQuickFill({template, activePeak, currentUser, windows, onCreate, onClose}) {
  const [title, setTitle] = useState("[" + template.name + "] ");
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [mw, setMw] = useState(template.maintenanceWindow||"");
  const [assignedTo, setAssignedTo] = useState(currentUser.name);
  const [country, setCountry] = useState(template.country||"");
  const [notes, setNotes] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  const valid = title.trim().length >= 3 && scheduledFor;
  const peakConflict = isInPeakPeriod(scheduledFor);

  function createChange() {
    const newC = {
      ...template,
      id: genId(),
      name: title.trim(),
      scheduledFor,
      scheduledEnd,
      maintenanceWindow: mw || template.maintenanceWindow || null,
      assignedTo,
      country,
      status: "Draft",
      isTemplate: false,
      steps: (template.steps||[]).map(s => ({...s, id: Date.now()+Math.random()})),
      preflightResults: {},
      stepLogs: {},
      approvals: [],
      comments: [],
      createdBy: currentUser.name,
      createdAt: now(),
      execResult: null,
      actualStart: null,
      actualEnd: null,
      freezePeriod: !!peakConflict,
      auditLog: [
        {at: now(), msg: `Change created from template: ${template.name}`, type:"info", by: currentUser.name},
        {at: now(), msg: `Assigned to: ${assignedTo}`, type:"info", by: currentUser.name},
        ...(peakConflict ? [{at:now(), msg:`❄ Network freeze — Director approval required`, type:"warning", by: currentUser.name}] : []),
      ],
      notifications: [],
    };
    onCreate(newC);
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.55)",backdropFilter:"blur(3px)",zIndex:1000,display:"flex",alignItems:"flex-start",justifyContent:"center",padding:"28px 16px",overflowY:"auto"}}>
      <div style={{background:T.surface,borderRadius:16,width:"100%",maxWidth:680,boxShadow:"0 24px 64px rgba(0,0,0,0.22)"}}>

        {/* Header */}
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:12,alignItems:"center"}}>
          <div style={{width:40,height:40,borderRadius:10,background:"#f5f3ff",border:"1.5px solid #c4b5fd",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>⊡</div>
          <div style={{flex:1}}>
            <div style={{fontSize:15,fontWeight:800,color:T.text}}>Create from Template</div>
            <div style={{fontSize:12,color:T.muted,marginTop:1}}>{template.name} · {template.domain} · {template.steps?.length||0} steps · <RiskPill risk={template.risk}/></div>
          </div>
          <button onClick={onClose} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,color:T.muted,cursor:"pointer",fontSize:16,width:30,height:30,display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
        </div>

        <div style={{padding:"22px 24px",display:"flex",flexDirection:"column",gap:14}}>

          {activePeak && (
            <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:9,padding:"11px 14px",display:"flex",gap:10,alignItems:"flex-start"}}>
              <span style={{fontSize:16,flexShrink:0}}>❄</span>
              <div>
                <div style={{fontWeight:700,color:T.freeze,fontSize:13}}>Network Freeze: {activePeak.name}</div>
                <div style={{fontSize:12,color:"#b91c1c",marginTop:1}}>All changes require Director approval + business justification.</div>
              </div>
            </div>
          )}

          <Inp label="Change Title *" value={title} onChange={setTitle}
            placeholder="Give this instance a specific name…"/>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Inp label="Scheduled Start *" value={scheduledFor} onChange={v=>{setScheduledFor(v);}} type="datetime-local"/>
            <Inp label="Scheduled End" value={scheduledEnd} onChange={setScheduledEnd} type="datetime-local"/>
          </div>

          {peakConflict && (
            <div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:7,padding:"9px 13px",fontSize:12,color:T.freeze}}>
              ⚠ Selected date falls in <b>{peakConflict.name}</b> freeze. Director approval will be required.
            </div>
          )}

          <Sel label="Maintenance Window" value={mw} onChange={setMw}
            options={[{value:"",label:"— None —"},...windows.map(w=>({value:w.id,label:w.name}))]}/>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Inp label="Assigned Technician *" value={assignedTo} onChange={setAssignedTo}
              placeholder={currentUser.name}/>
            <Sel label="Country *" value={country} onChange={setCountry}
              options={[{value:"",label:"— Select Country —"},...COUNTRIES.map(c=>({value:c.code,label:`${c.code} — ${c.name}`}))]}/>
          </div>

          <Inp label="Instance Notes (device names, sites, variables)" value={notes} onChange={setNotes} type="textarea" rows={3}
            placeholder={"Specific devices, site IDs, or any change to the template defaults…\ne.g. Target device: rmu1-acc-sw-14-7, Site: Madrid DC1"}/>

          {/* Template steps preview */}
          <div>
            <div style={{fontSize:11,fontWeight:700,color:T.muted,textTransform:"uppercase",letterSpacing:"0.5px",marginBottom:8}}>Template steps ({template.steps?.length||0})</div>
            <div style={{border:`1px solid ${T.border}`,borderRadius:9,overflow:"hidden"}}>
              {(template.steps||[]).map((s,i) => (
                <div key={i} style={{display:"flex",gap:10,alignItems:"center",padding:"9px 14px",borderBottom:i<(template.steps.length-1)?`1px solid ${T.border}`:"none",background:i%2===0?T.surface:T.bg}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:T.primaryBg,color:T.primary,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:11,flexShrink:0}}>{i+1}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:12,color:T.text}}>{s.name}</div>
                    <div style={{fontSize:11,color:T.muted}}>{s.duration}min · {s.owner}</div>
                  </div>
                  <div style={{display:"flex",gap:4}}>
                    {(s.preChecks||s.subChecks||[]).length>0&&<span style={{fontSize:10,background:"#eff6ff",color:T.primary,border:`1px solid ${T.primaryBorder}`,borderRadius:3,padding:"1px 5px"}}>{(s.preChecks||s.subChecks||[]).length} pre</span>}
                    {(s.postChecks||[]).length>0&&<span style={{fontSize:10,background:"#f0fdf4",color:"#15803d",border:"1px solid #86efac",borderRadius:3,padding:"1px 5px"}}>{(s.postChecks||[]).length} post</span>}
                  </div>
                </div>
              ))}
              {(!template.steps||template.steps.length===0)&&<div style={{padding:"20px",textAlign:"center",color:T.light,fontSize:12}}>No steps in template.</div>}
            </div>
          </div>

          <div style={{display:"flex",gap:10,paddingTop:4,borderTop:`1px solid ${T.border}`}}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <div style={{flex:1}}/>
            <Btn variant="success" disabled={!valid} onClick={createChange}>✓ Create Change from Template</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MCM-STYLE CREATE CHANGE WIZARD ───────────────────────────────────────────
const WIZARD_STEPS = ["Risk & Scope","Outage Details","Technical Plan","Execution Steps","Approvers","Rollback & Safety","Review & Submit"];
const STEP_DEFAULTS = {name:"",duration:15,owner:"Engineer",instructions:"",commands:"",preChecks:"",postChecks:"",rollback:""};
const APPROVER_ROLES = ["Engineer","Manager","Director","NOC/SAC","Bar Raiser"];

function CreateChangeMCM({nc, setNc, ncSf, ncStep, setNcStep, NC_DEFAULTS, currentUser, windows, onClose, onCreate}) {
  const peakConflict = isInPeakPeriod(nc.scheduledFor);
  const catRules = getCategoryRules(nc.category, nc.risk);
  const catM = CAT_META[nc.category] || CAT_META.Normal;

  // Step editor local state
  const [editingStepIdx, setEditingStepIdx] = useState(null); // null = not editing
  const [stepDraft, setStepDraft] = useState({...STEP_DEFAULTS});
  const sdSf = k => v => setStepDraft(s=>({...s,[k]:v}));

  function openNewStep() { setStepDraft({...STEP_DEFAULTS}); setEditingStepIdx(-1); } // -1 = new
  function openEditStep(i) { setStepDraft({...nc.steps[i]}); setEditingStepIdx(i); }
  function saveStep() {
    const s = {...stepDraft,
      id: editingStepIdx===-1 ? Date.now() : stepDraft.id,
      preChecks: typeof stepDraft.preChecks==="string" ? stepDraft.preChecks.split("\n").map(l=>l.trim()).filter(Boolean) : stepDraft.preChecks,
      postChecks: typeof stepDraft.postChecks==="string" ? stepDraft.postChecks.split("\n").map(l=>l.trim()).filter(Boolean) : stepDraft.postChecks,
      commands: typeof stepDraft.commands==="string" ? stepDraft.commands.split("\n").map(l=>l.trim()).filter(Boolean) : stepDraft.commands,
      subChecks: typeof stepDraft.preChecks==="string" ? stepDraft.preChecks.split("\n").map(l=>l.trim()).filter(Boolean) : (stepDraft.preChecks||[]),
    };
    if (editingStepIdx===-1) { ncSf("steps")([...nc.steps, s]); }
    else { const arr=[...nc.steps]; arr[editingStepIdx]=s; ncSf("steps")(arr); }
    setEditingStepIdx(null);
  }
  function removeStep(i) { ncSf("steps")(nc.steps.filter((_,j)=>j!==i)); }
  function moveStep(i, dir) {
    const arr=[...nc.steps]; const j=i+dir;
    if(j<0||j>=arr.length) return;
    [arr[i],arr[j]]=[arr[j],arr[i]]; ncSf("steps")(arr);
  }

  // Approver editor local state
  const [aprDraft, setAprDraft] = useState({name:"",role:"Manager",required:true});
  function addApprover() {
    if(!aprDraft.name.trim()) return;
    ncSf("approvers")([...nc.approvers, {...aprDraft}]);
    setAprDraft({name:"",role:"Manager",required:true});
  }
  function removeApprover(i) { ncSf("approvers")(nc.approvers.filter((_,j)=>j!==i)); }

  // auto-set approval level based on category+risk
  function autoApprovalLevel(risk) {
    if (["High","Critical"].includes(risk)) return "L3";
    if (risk === "Medium") return "L2";
    return "L1";
  }
  function autoCAB(risk) {
    return ["High","Critical"].includes(risk);
  }

  function handleRiskChange(v) {
    setNc(f => ({ ...f, risk: v,
      approvalLevel: autoApprovalLevel(v),
      cabRequired: autoCAB(v),
      barRaiserRequired: v === "Critical",
    }));
  }

  const canNext = () => {
    if (ncStep === 0) return nc.name.trim().length >= 3 && nc.risk;
    if (ncStep === 1) return nc.purpose.trim().length >= 10 && nc.expectedEndState.trim().length >= 5;
    if (ncStep === 2) return (nc.affectedServices || nc.affectedDevices);
    if (ncStep === 3) return nc.steps.length > 0; // at least one step required
    if (ncStep === 4) return true; // approvers optional
    if (ncStep === 5) return nc.rollbackPlan.trim().length >= 10;
    if (ncStep === 6) {
      if (nc.freezePeriod && nc.freezeJustification.trim().length < 10) return false;
      return nc.name.trim() && nc.rollbackPlan.trim();
    }
    return true;
  };

  function doCreate() {
    // Normalise steps: ensure commands/subChecks are arrays
    const normSteps = (nc.steps||[]).map((s,i) => ({
      ...s,
      id: s.id || i+1,
      commands: Array.isArray(s.commands) ? s.commands : (s.commands||"").split("\n").map(l=>l.trim()).filter(Boolean),
      subChecks: Array.isArray(s.preChecks) ? s.preChecks : (s.preChecks||"").split("\n").map(l=>l.trim()).filter(Boolean),
      postChecks: Array.isArray(s.postChecks) ? s.postChecks : (s.postChecks||"").split("\n").map(l=>l.trim()).filter(Boolean),
    }));
    const managerApprover = nc.approvers.find(a=>["Manager","Director"].includes(a.role));
    const directorApprover = nc.approvers.find(a=>a.role==="Director");
    const newC = {
      ...NC_DEFAULTS, ...nc,
      id: genId(), status: "Draft",
      createdBy: currentUser.name, createdAt: now(),
      affectedServices: (nc.affectedServices||"").split(",").map(s=>s.trim()).filter(Boolean),
      team: currentUser.team || "Network Ops", dept: currentUser.dept || "Engineering",
      director: directorApprover?.name || "Elena Martín",
      manager: managerApprover?.name || "Sam Reyes",
      execResult: null,
      steps: normSteps,
      preflightResults: {},
      stepLogs: {},
      approvals: [],
      comments: [],
      cab: nc.cabRequired ? { status:"pending", approvers:[], quorum: nc.risk==="Critical"?4:3, barRaiserRequired: nc.barRaiserRequired||false, barRaiserApproved: false } : null,
      auditLog: [
        { at: now(), msg: `Change created — ${normSteps.length} step${normSteps.length!==1?"s":""}`, type:"info", by: currentUser.name },
        ...(nc.approvers.length ? [{ at:now(), msg:`Approvers assigned: ${nc.approvers.map(a=>a.name).join(", ")}`, type:"info", by: currentUser.name }] : []),
        ...(nc.freezePeriod ? [{ at:now(), msg:`⚠ Network freeze — Director approval required`, type:"warning", by: currentUser.name }] : []),
      ],
      notifications: [],
    };
    onCreate(newC);
  }

  const W = { background:T.surface, borderRadius:14, overflow:"hidden", border:`1px solid ${T.border}`, width:"100%", maxWidth:820, boxShadow:"0 20px 60px rgba(0,0,0,0.12)" };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:1000, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"28px 16px", overflowY:"auto" }}>
      <div style={W}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", gap:14, padding:"16px 24px", borderBottom:`1px solid ${T.border}`, background:T.bg }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:800, color:T.text }}>New VNOC Request</div>
            <div style={{ fontSize:12, color:T.muted, marginTop:2 }}>Vodafone Network Operations Change · {currentUser.name}</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none", color:T.muted, cursor:"pointer", fontSize:22, lineHeight:1 }}>×</button>
        </div>

        {/* Wizard progress */}
        <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, overflowX:"auto" }}>
          {WIZARD_STEPS.map((s,i) => (
            <button key={i} onClick={()=>i<ncStep&&setNcStep(i)}
              style={{ flex:1, minWidth:120, padding:"11px 8px", border:"none", background:"transparent", cursor: i<ncStep?"pointer":"default",
                fontSize:11, fontWeight: i===ncStep?700:500, fontFamily:"inherit",
                color: i===ncStep?T.primary : i<ncStep?"#15803d":T.light,
                borderBottom: i===ncStep?`2px solid ${T.primary}`:i<ncStep?"2px solid #86efac":"2px solid transparent" }}>
              {i < ncStep ? "✓ " : `${i+1}. `}{s}
            </button>
          ))}
        </div>

        <div style={{ padding:"24px 28px" }}>

          {/* STEP 0: Risk & Scope */}
          {ncStep === 0 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <Inp label="Change Title *" value={nc.name} onChange={ncSf("name")}
                placeholder="e.g. [FFN][Cisco 9300][RMU1] Replace Multiple C9300 Access Switch"/>

              <Inp label="Assigned Technician" value={nc.assignedTo||""} onChange={ncSf("assignedTo")}
                placeholder={currentUser.name}/>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:6 }}>Risk Level *</div>
                  <div style={{ display:"flex", gap:6 }}>
                    {RISK_LEVELS.map(r => (
                      <div key={r} onClick={()=>handleRiskChange(r)}
                        style={{ flex:1, padding:"8px 4px", textAlign:"center", borderRadius:6, cursor:"pointer",
                          border:`2px solid ${nc.risk===r?(RISK_C[r]||T.border):T.border}`,
                          background: nc.risk===r?(RISK_C[r]+"14"):"transparent",
                          fontSize:11, fontWeight:nc.risk===r?700:500, color:nc.risk===r?(RISK_C[r]||T.text):T.muted }}>
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
                <Sel label="Domain" value={nc.domain} onChange={ncSf("domain")} options={SYSTEMS}/>
                <Sel label="Exec Mode" value={nc.execMode} onChange={ncSf("execMode")} options={EXEC_MODES}/>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Sel label="Intrusion Type" value={nc.intrusion} onChange={ncSf("intrusion")} options={INTRUSION}/>
                <Sel label="Country *" value={nc.country||""} onChange={ncSf("country")}
                  options={[{value:"",label:"— Select Country —"},...COUNTRIES.map(c=>({value:c.code,label:`${c.code} — ${c.name}`}))]}/>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Inp label="Scheduled Start *" value={nc.scheduledFor} onChange={v=>{ncSf("scheduledFor")(v); ncSf("freezePeriod")(!!isInPeakPeriod(v));}} type="datetime-local"/>
                <Inp label="Scheduled End *" value={nc.scheduledEnd||""} onChange={ncSf("scheduledEnd")} type="datetime-local"/>
              </div>

              {/* Peak period warning */}
              {peakConflict && (
                <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"12px 16px" }}>
                  <div style={{ fontWeight:700, color:T.freeze, fontSize:13, marginBottom:4 }}>❄ Network Freeze: {peakConflict.name}</div>
                  <div style={{ fontSize:12, color:"#b91c1c" }}>This change falls within a protected freeze period. <b>Director approval + business justification are mandatory.</b></div>
                </div>
              )}

              {/* Auto-approver guidance */}
              {(() => {
                const autoR = [];
                if (["High","Critical"].includes(nc.risk)) autoR.push({label:"Director approval required", reason:`Risk level: ${nc.risk}`, col:"#b91c1c"});
                if (["Medium","High","Critical"].includes(nc.risk)) autoR.push({label:"Manager approval required", reason:`Risk level: ${nc.risk}`, col:T.primary});
                if (peakConflict || nc.freezePeriod) autoR.push({label:"Director approval required", reason:"Network freeze active", col:T.freeze});
                if (nc.risk === "Critical") autoR.push({label:"Bar Raiser required", reason:"Critical risk", col:"#7c2d12"});
                const uniq = autoR.filter((a,i) => autoR.findIndex(x=>x.label===a.label)===i);
                return uniq.length > 0 ? (
                  <div style={{ background:"#f5f3ff", border:"1px solid #c4b5fd", borderRadius:8, padding:"12px 16px" }}>
                    <div style={{ fontSize:11, fontWeight:700, color:"#5b21b6", textTransform:"uppercase", marginBottom:8 }}>Auto-required approvers</div>
                    {uniq.map((a,i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, fontSize:12 }}>
                        <span style={{ width:8, height:8, borderRadius:"50%", background:a.col, flexShrink:0, display:"inline-block" }}/>
                        <span style={{ fontWeight:600, color:a.col }}>{a.label}</span>
                        <span style={{ color:T.muted }}>— {a.reason}</span>
                      </div>
                    ))}
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* STEP 1: Outage / Activity Details (MCM style) */}
          {ncStep === 1 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:8, padding:"11px 14px", fontSize:12, color:"#92400e" }}>
                📋 Describe the change in detail — this will appear in the change ticket and audit trail.
              </div>

              <Inp label="What is the purpose of this activity or change? *" value={nc.purpose} onChange={ncSf("purpose")} type="textarea" rows={4}
                placeholder="e.g. Replace the following acc-sw: rmu1-fc-acc-sw-13-8. Switches are not operating as expected and need replacement per the following reason: IOS-XR memory leak issue…"/>

              <Inp label="What will be required to execute this change?" value={nc.requirementsPermissions} onChange={ncSf("requirementsPermissions")} type="textarea" rows={3}
                placeholder="Permissions needed, tools required, access levels, TACACS, NARF, etc.&#10;e.g.&#10;• OpsTechIT-Technician-Network-Authorization&#10;• TACACS access to run commands&#10;• NARF General Access"/>

              <Inp label="What is the expected end state of the system after this change? *" value={nc.expectedEndState} onChange={ncSf("expectedEndState")} type="textarea" rows={3}
                placeholder="e.g. Faulty devices replaced with healthy switches. NARF updated with new serial numbers. Network operating normally."/>

              <Inp label="What assumptions, if any, are being made about the state of the system?" value={nc.assumptions} onChange={ncSf("assumptions")} type="textarea" rows={2}
                placeholder="e.g.&#10;• NARF is functioning correctly&#10;• Device configurations in NARF are correct&#10;• Imperium Cafe CLI functioning correctly"/>

              <div style={{ background:"#eff6ff", border:"1px solid #93c5fd", borderRadius:8, padding:"11px 14px", fontSize:12, color:"#1e40af" }}>
                📌 Impact / Risk Assessment
              </div>

              <Inp label="What is the impact if this change is not made?" value={nc.customerImpact} onChange={ncSf("customerImpact")} type="textarea" rows={2}
                placeholder="e.g. Devices are at risk of possible impact by Memory Leak issue or failure preventing them from operating."/>

              <Inp label="Service Impact (during execution)" value={nc.serviceImpact} onChange={ncSf("serviceImpact")} type="textarea" rows={2}
                placeholder="e.g. Potential 10-min BGP re-convergence. MPLS traffic may reroute via backup LSP."/>

              <Inp label="Blast Radius — what breaks if this goes wrong? Who is affected and how badly?" value={nc.blastRadius} onChange={ncSf("blastRadius")} type="textarea" rows={2}
                placeholder="e.g. 10-min BGP reconvergence on MNL→SGP path affecting ~12 MPLS-VPN customers. Severity P2. Backup LSP available."/>

              <Inp label="Dependencies (teams, systems, vendors to coordinate with)" value={nc.dependencies} onChange={ncSf("dependencies")} type="textarea" rows={2}
                placeholder={"e.g.\n• NOC/SAC notification required\n• Transport team on standby\n• Cisco TAC case pre-opened (case# 123456)"}/>

              <Sel label="Maintenance Window" value={nc.maintenanceWindow||""} onChange={ncSf("maintenanceWindow")}
                options={[{value:"",label:"— None (Emergency or no window) —"},...MW.map(w=>({value:w.id,label:w.name}))]}/>
            </div>
          )}

          {/* STEP 2: Technical Plan */}
          {ncStep === 2 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <Inp label="Affected Services (comma separated) *" value={nc.affectedServices||""} onChange={ncSf("affectedServices")}
                placeholder="e.g. MPLS-VPN, BGP-Peering, ISIS"/>

              <Inp label="Affected Devices / Hostnames" value={nc.affectedDevices||""} onChange={ncSf("affectedDevices")} type="textarea" rows={3}
                placeholder="e.g.&#10;rmu1-fc-acc-sw-13-8&#10;rmu1-fc-acc-sw-7-4&#10;rmu1-fc-acc-sw-7-6"/>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Inp label="Affected Regions" value={nc.affectedRegions||""} onChange={ncSf("affectedRegions")}
                  placeholder="e.g. EMEA, AP-Southeast, LatAm"/>
                <Inp label="Affected Interfaces / Links" value={nc.affectedInterfaces||""} onChange={ncSf("affectedInterfaces")}
                  placeholder="e.g. Gi0/0/0/1, GE-1/0, LAG-12"/>
              </div>

              <Inp label="Validation Plan — how will you confirm the change worked end-to-end?" value={nc.validationPlan||""} onChange={ncSf("validationPlan")} type="textarea" rows={3}
                placeholder={"e.g.\n1. Verify BGP sessions re-established on all peers\n2. Ping all affected prefixes from 3 vantage points\n3. NOC/SAC confirm zero customer tickets\n4. 30-min observation window before closing"}/>

              <div style={{ background:T.primaryBg, border:`1px solid ${T.primaryBorder}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:T.primary }}>
                📋 You'll define execution steps with pre/post checks in the next step.
              </div>

              <Inp label="Related Tickets / Links" value={nc.relatedTickets||""} onChange={ncSf("relatedTickets")}
                placeholder="e.g. INC-20240315-001, JIRA-4521, SIM-ticket-URL"/>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Inp label="LSE ID (if related to Live Site Event)" value={nc.lseId||""} onChange={ncSf("lseId")} placeholder="e.g. LSE-2024-03-001"/>
                <Inp label="Incident ID" value={nc.incidentId||""} onChange={ncSf("incidentId")} placeholder="e.g. INC-20240315-001"/>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                <Sel label="Type" value={nc.type} onChange={ncSf("type")} options={["Ad-hoc","Template","Automated"]}/>
                <Inp label="Estimated Duration (minutes)" value={nc.estimatedDuration||""} onChange={ncSf("estimatedDuration")} type="number" placeholder="e.g. 60"/>
              </div>

              <label style={{ display:"flex", gap:9, alignItems:"center", cursor:"pointer", fontSize:13, color:T.muted, padding:"9px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:7 }}>
                <input type="checkbox" checked={nc.isTemplate} onChange={e=>setNc(f=>({...f,isTemplate:e.target.checked}))}/>
                <span><b>Save as reusable template</b> — this change will be available as a template for future use</span>
              </label>
            </div>
          )}

          {/* STEP 3: Execution Steps */}
          {ncStep === 3 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:T.primaryBg, border:`1px solid ${T.primaryBorder}`, borderRadius:8, padding:"10px 14px", fontSize:12, color:T.primary }}>
                Define each execution step. Each step should have pre-checks (things to verify before running), commands, and post-checks (things to validate after). At least one step is required.
              </div>

              {/* Step list */}
              {nc.steps.length===0&&<div style={{ textAlign:"center", padding:"28px 0", color:T.light, border:`2px dashed ${T.border}`, borderRadius:10 }}>
                <div style={{ fontSize:20, marginBottom:6 }}>📋</div>
                <div style={{ fontWeight:600 }}>No steps yet</div>
                <div style={{ fontSize:12, marginTop:3 }}>Click "Add Step" to define the execution plan</div>
              </div>}

              {nc.steps.map((s,i)=>(
                <div key={i} style={{ border:`1px solid ${T.border}`, borderRadius:10, background:T.surface, overflow:"hidden" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:T.bg, borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ width:24, height:24, borderRadius:"50%", background:T.primaryBg, color:T.primary, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, flexShrink:0 }}>{i+1}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:T.text }}>{s.name||"Unnamed step"}</div>
                      <div style={{ fontSize:11, color:T.muted }}>{s.duration}min · {s.owner} · {(Array.isArray(s.preChecks)?s.preChecks:((s.preChecks||"").split("\n").filter(Boolean))).length} pre-checks · {(Array.isArray(s.postChecks)?s.postChecks:((s.postChecks||"").split("\n").filter(Boolean))).length} post-checks</div>
                    </div>
                    <div style={{ display:"flex", gap:4 }}>
                      <button onClick={()=>moveStep(i,-1)} disabled={i===0} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:5, cursor:i===0?"not-allowed":"pointer", padding:"3px 7px", fontSize:12, color:T.muted, opacity:i===0?0.3:1 }}>↑</button>
                      <button onClick={()=>moveStep(i,1)} disabled={i===nc.steps.length-1} style={{ background:"none", border:`1px solid ${T.border}`, borderRadius:5, cursor:i===nc.steps.length-1?"not-allowed":"pointer", padding:"3px 7px", fontSize:12, color:T.muted, opacity:i===nc.steps.length-1?0.3:1 }}>↓</button>
                      <button onClick={()=>openEditStep(i)} style={{ background:T.primaryBg, border:`1px solid ${T.primaryBorder}`, borderRadius:5, cursor:"pointer", padding:"3px 9px", fontSize:11, color:T.primary, fontWeight:600, fontFamily:"inherit" }}>Edit</button>
                      <button onClick={()=>removeStep(i)} style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:5, cursor:"pointer", padding:"3px 9px", fontSize:11, color:T.freeze, fontWeight:600, fontFamily:"inherit" }}>✕</button>
                    </div>
                  </div>
                  {editingStepIdx===i&&<StepEditorForm draft={stepDraft} sdSf={sdSf} onSave={saveStep} onCancel={()=>setEditingStepIdx(null)}/>}
                </div>
              ))}

              {editingStepIdx===-1&&(
                <div style={{ border:`1px solid ${T.primaryBorder}`, borderRadius:10, background:T.primaryBg, overflow:"hidden" }}>
                  <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.primaryBorder}`, fontWeight:700, fontSize:13, color:T.primary }}>New Step</div>
                  <StepEditorForm draft={stepDraft} sdSf={sdSf} onSave={saveStep} onCancel={()=>setEditingStepIdx(null)}/>
                </div>
              )}

              {editingStepIdx===null&&<Btn variant="outline" onClick={openNewStep}>+ Add Step</Btn>}
            </div>
          )}

          {/* STEP 4: Approvers */}
          {ncStep === 4 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ background:"#f5f3ff", border:"1px solid #c4b5fd", borderRadius:8, padding:"10px 14px", fontSize:12, color:"#5b21b6" }}>
                Assign approvers for this change. Required approvers must sign off before execution. Auto-determined approval level: <b>{nc.approvalLevel}</b>
                {nc.cabRequired&&<span style={{ marginLeft:8, fontWeight:700 }}>· CAB required</span>}
              </div>

              {/* Auto-required by conditions */}
              <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"11px 14px" }}>
                <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Auto-required by conditions</div>
                {[
                  {role:"Manager", required:["L2","L3"].includes(nc.approvalLevel), label:"Manager sign-off", reason:`Risk: ${nc.risk}`},
                  {role:"Director", required:nc.approvalLevel==="L3"||nc.freezePeriod, label:"Director approval", reason:nc.freezePeriod?"Network freeze":"High/Critical risk"},
                  {role:"Bar Raiser", required:nc.barRaiserRequired, label:"Bar Raiser sign-off", reason:"Critical risk"},
                ].filter(r=>r.required).map(r=>(
                  <div key={r.role} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5, fontSize:12, color:T.text }}>
                    <span style={{ width:8, height:8, borderRadius:"50%", background:"#8b5cf6", display:"inline-block", flexShrink:0 }}/>
                    <span style={{ fontWeight:600 }}>{r.role}</span> <span style={{ color:T.muted }}>— {r.label} ({r.reason})</span>
                  </div>
                ))}
                {!["L2","L3"].includes(nc.approvalLevel)&&!nc.freezePeriod&&!nc.barRaiserRequired&&(
                  <div style={{ fontSize:12, color:T.muted, fontStyle:"italic" }}>No additional approvers required for Low risk changes.</div>
                )}
              </div>

              {/* Custom approvers */}
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:8 }}>Assigned approvers</div>
                {nc.approvers.length===0&&<div style={{ fontSize:12, color:T.light, marginBottom:10 }}>No approvers assigned yet — system will use policy defaults.</div>}
                {nc.approvers.map((a,i)=>(
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:6 }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:"#f5f3ff", color:"#6d28d9", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:12, flexShrink:0 }}>{a.name.charAt(0)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:13, color:T.text }}>{a.name}</div>
                      <div style={{ fontSize:11, color:T.muted }}>{a.role}{a.required?" · Required":""}</div>
                    </div>
                    <button onClick={()=>removeApprover(i)} style={{ background:"none", border:"none", cursor:"pointer", color:T.light, fontSize:16 }}>×</button>
                  </div>
                ))}
              </div>

              {/* Add approver row */}
              <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr auto auto", gap:8, alignItems:"end" }}>
                <Inp label="Name" value={aprDraft.name} onChange={v=>setAprDraft(d=>({...d,name:v}))} placeholder="e.g. Jordan Lee"/>
                <Sel label="Role" value={aprDraft.role} onChange={v=>setAprDraft(d=>({...d,role:v}))} options={APPROVER_ROLES}/>
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:T.muted, textTransform:"uppercase", letterSpacing:"0.6px" }}>Required</label>
                  <input type="checkbox" checked={aprDraft.required} onChange={e=>setAprDraft(d=>({...d,required:e.target.checked}))} style={{ width:18, height:18, marginTop:2 }}/>
                </div>
                <div style={{ paddingBottom:2 }}>
                  <Btn onClick={addApprover} disabled={!aprDraft.name.trim()}>+ Add</Btn>
                </div>
              </div>

              {/* Suggest from USERS list */}
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:T.muted, marginBottom:6 }}>Quick-add from team</div>
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  {USERS.filter(u=>!nc.approvers.find(a=>a.name===u.name)).map(u=>(
                    <button key={u.id} onClick={()=>ncSf("approvers")([...nc.approvers, {name:u.name,role:u.role,required:["Manager","Director"].includes(u.role)}])}
                      style={{ fontSize:11, background:T.bg, border:`1px solid ${T.border}`, borderRadius:6, padding:"5px 10px", cursor:"pointer", color:T.muted, fontFamily:"inherit" }}>
                      + {u.name} <span style={{ color:T.light }}>({u.role})</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Rollback & Safety */}
          {ncStep === 5 && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <Inp label="Rollback Plan *" value={nc.rollbackPlan} onChange={ncSf("rollbackPlan")} type="textarea" rows={4}
                placeholder="Step-by-step revert procedure:&#10;1. Run: install rollback to label baseline&#10;2. Verify: show version&#10;3. Notify NOC/SAC"/>

              <Inp label="Estimated Rollback Time" value={nc.rollbackTime||""} onChange={ncSf("rollbackTime")}
                placeholder="e.g. 15 minutes"/>

              <Inp label="Rollback Trigger — what conditions should trigger rollback?" value={nc.rollbackTrigger||""} onChange={ncSf("rollbackTrigger")} type="textarea" rows={2}
                placeholder={"e.g. Any BGP session down >2 min · Packet loss >5% on affected path · Customer complaint received · NOC escalation"}/>

              <Inp label="Escalation Path — who to call if unexpected impact occurs" value={nc.escalationPath||""} onChange={ncSf("escalationPath")} type="textarea" rows={3}
                placeholder={"e.g.\n1st: Team Lead — Jane Smith (+34 612 345 678) / Slack @jsmith\n2nd: On-call Manager — #oncall-bridge channel\n3rd: Director — Elena Martín (emergency only)"}/>

              {/* Freeze period */}
              {(nc.freezePeriod || peakConflict) && (
                <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"14px 16px" }}>
                  <div style={{ fontSize:13, fontWeight:700, color:T.freeze, marginBottom:8 }}>
                    ❄ {peakConflict ? `Change Freeze: ${peakConflict.name}` : "Change Freeze Active"} — Director Approval Required
                  </div>
                  <Inp label="Business Justification (mandatory) *" value={nc.freezeJustification} onChange={ncSf("freezeJustification")} type="textarea" rows={3}
                    placeholder="Explain why this change cannot be deferred beyond this change freeze period. Min 10 characters."/>
                </div>
              )}

              {!nc.freezePeriod && !peakConflict && (
                <label style={{ display:"flex", gap:9, alignItems:"flex-start", cursor:"pointer", padding:"11px 14px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8 }}>
                  <input type="checkbox" checked={nc.freezePeriod} onChange={e=>setNc(f=>({...f,freezePeriod:e.target.checked}))} style={{marginTop:2}}/>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:T.freeze }}>❄ Freeze Period Override</div>
                    <div style={{ fontSize:12, color:"#b91c1c", marginTop:2 }}>Check if this change requires executing during a freeze window. Requires Director approval + justification.</div>
                  </div>
                </label>
              )}
              {nc.freezePeriod && !peakConflict && (
                <Inp label="Business Justification *" value={nc.freezeJustification} onChange={ncSf("freezeJustification")} type="textarea" rows={3}
                  placeholder="Why can't this be deferred?"/>
              )}
            </div>
          )}

          {/* STEP 6: Review & Submit */}
          {ncStep === 6 && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              <div style={{ background:T.bg, border:`2px solid ${RISK_C[nc.risk]||T.border}`, borderRadius:10, padding:"14px 18px" }}>
                <div style={{ display:"flex", gap:12, alignItems:"center" }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:(RISK_C[nc.risk]||T.muted)+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>
                    {nc.risk==="Critical"?"🔴":nc.risk==="High"?"🟠":nc.risk==="Medium"?"🟡":"🟢"}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:16, fontWeight:800, color:RISK_C[nc.risk]||T.text }}>{nc.risk} Risk Change</div>
                    <div style={{ fontSize:12, color:T.muted }}>{nc.name}</div>
                  </div>
                  <div style={{ display:"flex", gap:8 }}>
                    <RiskPill risk={nc.risk}/>
                    <span style={{ fontSize:11, background:T.bg, border:`1px solid ${T.border}`, borderRadius:4, padding:"2px 8px", fontWeight:600, color:T.muted }}>{nc.approvalLevel}</span>
                  </div>
                </div>
              </div>

              {/* Summary table */}
              {[
                ["Domain", nc.domain], ["Risk", nc.risk], ["Type", nc.type],
                ["Exec Mode", nc.execMode], ["Intrusion", nc.intrusion], ["Approval Level", nc.approvalLevel],
                ["Assigned To", nc.assignedTo||currentUser.name],
                ["Scheduled", nc.scheduledFor ? fmt(nc.scheduledFor) : "TBD"],
                ["CAB Required", nc.cabRequired ? "Yes" : "No"],
                ["Bar Raiser", nc.barRaiserRequired ? "Yes ★" : "No"],
                ["Freeze Period", nc.freezePeriod ? "Yes — Director required" : "No"],
              ].map(([l,v]) => (
                <div key={l} style={{ display:"flex", borderBottom:`1px solid ${T.border}`, paddingBottom:7 }}>
                  <span style={{ fontSize:12, color:T.muted, fontWeight:600, width:160 }}>{l}</span>
                  <span style={{ fontSize:12, color:T.text, fontWeight: v?.includes?.("Yes") ? 700 : 400 }}>{v||"—"}</span>
                </div>
              ))}

              {["Purpose","Expected End State","Service Impact","Rollback Plan"].map(l => {
                const v = {Purpose:nc.purpose,"Expected End State":nc.expectedEndState,"Service Impact":nc.serviceImpact,"Rollback Plan":nc.rollbackPlan}[l];
                return v ? (
                  <div key={l}>
                    <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", marginBottom:4 }}>{l}</div>
                    <div style={{ fontSize:12, color:T.text, background:T.bg, padding:"9px 12px", borderRadius:6, border:`1px solid ${T.border}`, lineHeight:1.6 }}>{v}</div>
                  </div>
                ) : null;
              })}

              {/* Steps summary */}
              {nc.steps.length>0&&(
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", marginBottom:6 }}>Execution Steps ({nc.steps.length})</div>
                  {nc.steps.map((s,i)=>(
                    <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 12px", background:T.bg, border:`1px solid ${T.border}`, borderRadius:7, marginBottom:5 }}>
                      <div style={{ width:20, height:20, borderRadius:"50%", background:T.primaryBg, color:T.primary, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700 }}>{i+1}</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:T.text }}>{s.name}</div>
                        <div style={{ fontSize:11, color:T.muted }}>{s.duration}min · {(Array.isArray(s.preChecks)?s.preChecks:(s.preChecks||"").split("\n").filter(Boolean)).length} pre · {(Array.isArray(s.postChecks)?s.postChecks:(s.postChecks||"").split("\n").filter(Boolean)).length} post</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Approvers summary */}
              {nc.approvers.length>0&&(
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:T.muted, textTransform:"uppercase", marginBottom:6 }}>Approvers ({nc.approvers.length})</div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {nc.approvers.map((a,i)=>(
                      <span key={i} style={{ fontSize:11, background:"#f5f3ff", color:"#5b21b6", border:"1px solid #c4b5fd", borderRadius:6, padding:"4px 10px", fontWeight:600 }}>
                        {a.name} ({a.role}){a.required?" ★":""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {peakConflict && (
                <div style={{ background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, padding:"11px 14px" }}>
                  <div style={{ fontWeight:700, color:T.freeze, fontSize:13 }}>⚠ Change Freeze: {peakConflict.name}</div>
                  <div style={{ fontSize:12, color:"#b91c1c", marginTop:4 }}>Justification: {nc.freezeJustification}</div>
                </div>
              )}

              <div style={{ background:T.bg, border:`1px solid ${T.border}`, borderRadius:8, padding:"11px 14px", fontSize:12, color:T.muted }}>
                {nc.freezePeriod
                  ? "❄ This change requires Director approval due to active network freeze."
                  : nc.approvalLevel==="L3"
                  ? "↻ High/Critical risk — requires Director approval. Will proceed through Preflight → Approval."
                  : nc.approvalLevel==="L2"
                  ? "↻ Medium risk — requires Manager approval. Will proceed through Preflight → Approval."
                  : "↻ This change will be created as Draft and proceed through Preflight → Approval."}
              </div>
            </div>
          )}

          {/* Navigation */}
          <div style={{ display:"flex", gap:10, marginTop:24, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
            {ncStep > 0 && <Btn variant="ghost" onClick={()=>setNcStep(s=>s-1)}>← Back</Btn>}
            <div style={{ flex:1 }}/>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            {ncStep < WIZARD_STEPS.length - 1
              ? <Btn disabled={!canNext()} onClick={()=>setNcStep(s=>s+1)}>Next →</Btn>
              : <Btn variant="success" disabled={!canNext()} onClick={doCreate}>
                  {"✓ Create Change"}
                </Btn>
            }
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
const USERS=[
  {id:"u1",name:"Alex Torres", role:"Engineer", team:"Core Transport",dept:"Engineering"},
  {id:"u2",name:"Chema F.",    role:"Manager",  team:"Core Transport",dept:"Engineering"},
  {id:"u3",name:"Matt I.",     role:"Director", team:"Core Transport",dept:"Engineering"},
  {id:"u4",name:"Didier C.",   role:"Director", team:"Core Transport",dept:"Engineering"},
  {id:"u5",name:"Ivan M.",     role:"Engineer", team:"Core Transport",dept:"Engineering"},
  {id:"u6",name:"Adam S.",     role:"Engineer", team:"Core Transport",dept:"Engineering"},
  {id:"u7",name:"Davide Z.",   role:"Engineer", team:"Data Core",     dept:"Operations"},
  {id:"u8",name:"Ram",         role:"Engineer", team:"Voice Core",    dept:"Operations"},
  {id:"u9",name:"Michael T.",  role:"Director", team:"Access",        dept:"Engineering"},
  {id:"u10",name:"Sam Reyes",  role:"Manager",  team:"Data Core",     dept:"Operations"},
];

export default function App(){
  const [changes,setChanges]=useState(SEED_CHANGES);
  const user=USERS[0];
  const [view,setView]=useState("mywork");
  const [selected,setSelected]=useState(null);
  const [creatingMode,setCreatingMode]=useState(null); // null | "picker" | "wizard"
  const activePeak = useMemo(()=>getActivePeak(),[]);

  // Hash-based change linking
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash && hash.startsWith("VNOC-")) {
      const c = changes.find(x => x.id === hash);
      if (c) setSelected(c);
    }
  }, []);

  function selectChange(c) {
    setSelected(c);
    window.location.hash = c ? c.id : "";
  }
  function closeChange() {
    setSelected(null);
    window.location.hash = "";
  }

  // filters
  const [filters,setFilters]=useState({
    search:"",status:"All",risk:"All",type:"All",intrusion:"All",execMode:"All",
    team:"All",dept:"All",director:"All",manager:"All",domain:"All",country:"All",
    dateFrom:"",dateTo:"",sortBy:"date",sortDir:"desc",viewMode:"list",kind:"All",
  });
  const sf=k=>v=>setFilters(f=>({...f,[k]:v}));

  const templates=changes.filter(c=>c.isTemplate);
  const crs=changes.filter(c=>!c.isTemplate);

  function updateChange(id,updater){
    setChanges(cs=>cs.map(c=>c.id===id?(typeof updater==="function"?updater(c):{...c,...updater}):c));
    setSelected(p=>p?.id===id?(typeof updater==="function"?updater(p):{...p,...updater}):p);
  }

  const filtered=useMemo(()=>{
    let r=changes; // all changes: templates + unique
    if(filters.kind==="Templates") r=r.filter(c=>c.isTemplate);
    else if(filters.kind==="Unique") r=r.filter(c=>!c.isTemplate);
    if(filters.search) r=r.filter(c=>c.name.toLowerCase().includes(filters.search.toLowerCase())||c.id.includes(filters.search));
    if(filters.status!=="All") r=r.filter(c=>c.status===filters.status);
    if(filters.risk!=="All") r=r.filter(c=>c.risk===filters.risk);
    if(filters.type!=="All") r=r.filter(c=>c.type===filters.type);
    if(filters.intrusion!=="All") r=r.filter(c=>c.intrusion===filters.intrusion);
    if(filters.execMode!=="All") r=r.filter(c=>c.execMode===filters.execMode);
    if(filters.team!=="All") r=r.filter(c=>c.team===filters.team);
    if(filters.dept!=="All") r=r.filter(c=>c.dept===filters.dept);
    if(filters.director!=="All") r=r.filter(c=>c.director===filters.director);
    if(filters.manager!=="All") r=r.filter(c=>c.manager===filters.manager);
    if(filters.domain!=="All") r=r.filter(c=>c.domain===filters.domain);
    if(filters.country&&filters.country!=="All") r=r.filter(c=>c.country===filters.country);
    if(filters.dateFrom) r=r.filter(c=>c.scheduledFor&&new Date(c.scheduledFor)>=new Date(filters.dateFrom));
    if(filters.dateTo)   r=r.filter(c=>c.scheduledFor&&new Date(c.scheduledFor)<=new Date(filters.dateTo+"T23:59"));
    r=[...r].sort((a,b)=>{
      let av,bv;
      if(filters.sortBy==="date"){av=new Date(a.scheduledFor||0);bv=new Date(b.scheduledFor||0);}
      else if(filters.sortBy==="name"){av=a.name;bv=b.name;}
      else if(filters.sortBy==="risk"){const o={Low:0,Medium:1,High:2,Critical:3};av=o[a.risk];bv=o[b.risk];}
      else {av=a.status;bv=b.status;}
      return filters.sortDir==="asc"?(av>bv?1:-1):(av<bv?1:-1);
    });
    return r;
  },[crs,filters]);

  const notifCount=[...crs].filter(c=>["Pending Approval","Failed","Aborted"].includes(c.status)||c.freezePeriod&&["Draft","Preflight","Pending Approval"].includes(c.status)).length;

  const [dashFilters,setDashFilters]=useState({team:"All",manager:"All",director:"All",status:"All",risk:"All",country:"All",dateFrom:"",dateTo:""});
  const sdf=k=>v=>setDashFilters(f=>({...f,[k]:v}));
  const dashCrs=useMemo(()=>{
    let r=crs;
    if(dashFilters.team!=="All") r=r.filter(c=>c.team===dashFilters.team);
    if(dashFilters.manager!=="All") r=r.filter(c=>c.manager===dashFilters.manager);
    if(dashFilters.director!=="All") r=r.filter(c=>c.director===dashFilters.director);
    if(dashFilters.status!=="All") r=r.filter(c=>c.status===dashFilters.status);
    if(dashFilters.risk!=="All") r=r.filter(c=>c.risk===dashFilters.risk);
    if(dashFilters.country&&dashFilters.country!=="All") r=r.filter(c=>c.country===dashFilters.country);
    if(dashFilters.dateFrom) r=r.filter(c=>c.scheduledFor&&new Date(c.scheduledFor)>=new Date(dashFilters.dateFrom));
    if(dashFilters.dateTo)   r=r.filter(c=>c.scheduledFor&&new Date(c.scheduledFor)<=new Date(dashFilters.dateTo+"T23:59"));
    return r;
  },[crs,dashFilters]);

  const stats={
    total:dashCrs.length,
    pending:dashCrs.filter(c=>c.status==="Pending Approval").length,
    executing:dashCrs.filter(c=>c.status==="In Execution").length,
    completed:dashCrs.filter(c=>c.status==="Completed").length,
    failed:dashCrs.filter(c=>["Failed","Aborted","Rolled Back","Off-Script"].includes(c.status)).length,
    frozen:dashCrs.filter(c=>c.freezePeriod&&!["Completed","Failed","Aborted","Rolled Back"].includes(c.status)).length,
  };

  // My Work — changes for current user's team or where user is manager/director
  const myChanges = crs.filter(c =>
    c.team === user.team ||
    c.manager === user.name ||
    c.director === user.name
  );
  const myUpcoming = myChanges
    .filter(c => !["Completed","Failed","Aborted","Rolled Back"].includes(c.status))
    .sort((a,b) => new Date(a.scheduledFor||0) - new Date(b.scheduledFor||0));
  const myActionable = myUpcoming.filter(c => ["Approved","In Execution"].includes(c.status));

  const NAV=[
    {id:"mywork",   icon:"👤",label:"My Work",  badge:myActionable.length||null},
    {id:"dashboard",icon:"⊞",label:"Dashboard"},
    {id:"changes",  icon:"↻",label:"Changes",  badge:stats.pending||null},
    {id:"timeline", icon:"⋮",label:"Timeline"},
  ];

  // simple new change form
  const NC_DEFAULTS={
    name:"",domain:SYSTEMS[0],risk:"Low",type:"Ad-hoc",execMode:"Manual",
    intrusion:"Non-Intrusive",approvalLevel:"L1",scheduledFor:"",scheduledEnd:"",maintenanceWindow:"",isTemplate:false,
    assignedTo:"",country:"",
    // Outage/Activity Details (MCM style)
    purpose:"",requirementsPermissions:"",expectedEndState:"",assumptions:"",
    // Impact
    serviceImpact:"",affectedServices:"",affectedDevices:"",customerImpact:"",
    rollbackPlan:"",rollbackTime:"",
    // Freeze
    freezePeriod:false,freezeJustification:"",
    // Related
    relatedTickets:"",lseId:"",incidentId:"",
    // CAB
    cabRequired:false,barRaiserRequired:false,
    // AWS framework fields
    blastRadius:"",dependencies:"",
    affectedRegions:"",affectedInterfaces:"",validationPlan:"",
    escalationPath:"",rollbackTrigger:"",pirRequired:false,
    // Steps & Approvers
    steps:[],
    approvers:[],
  };
  const [nc,setNc]=useState(NC_DEFAULTS);
  const [ncStep,setNcStep]=useState(0); // wizard step
  const ncSf=k=>v=>setNc(f=>({...f,[k]:v}));

  return <div style={{display:"flex",height:"100vh",background:T.bg,color:T.text,fontFamily:"'Inter','Segoe UI',sans-serif",fontSize:14,overflow:"hidden"}}>

    {/* Sidebar */}
    <div style={{width:232,flexShrink:0,background:T.sidebar,borderRight:`1px solid ${T.sidebarBorder}`,display:"flex",flexDirection:"column",padding:"0 0 16px"}}>
      <div style={{padding:"18px 16px 16px",borderBottom:`1px solid ${T.sidebarBorder}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#e40000,#9b0000)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,color:"#fff",fontWeight:900,flexShrink:0,boxShadow:"0 2px 8px rgba(228,0,0,0.4)"}}>V</div>
          <div>
            <div style={{fontSize:13,fontWeight:800,color:"#fff",letterSpacing:"-0.3px",lineHeight:1.25}}>Vodafone</div>
            <div style={{fontSize:11,fontWeight:500,color:T.sidebarMuted,letterSpacing:"0.2px",lineHeight:1.25}}>VNOC · Network Operations</div>
          </div>
        </div>
      </div>


      <nav style={{flex:1,padding:"10px 8px"}}>
        {NAV.map(item=><button key={item.id} onClick={()=>setView(item.id)} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",marginBottom:2,background:view===item.id?"rgba(255,255,255,0.1)":"transparent",color:view===item.id?"#fff":T.sidebarMuted,fontSize:13,fontWeight:view===item.id?600:400,transition:"background 0.15s,color 0.15s"}}>
          <span style={{fontSize:15,opacity:view===item.id?1:0.7}}>{item.icon}</span>{item.label}
          {item.badge&&<span style={{marginLeft:"auto",background:"#e40000",color:"#fff",borderRadius:10,fontSize:10,fontWeight:700,padding:"1px 7px"}}>{item.badge}</span>}
        </button>)}

        <div style={{borderTop:`1px solid ${T.sidebarBorder}`,marginTop:10,paddingTop:10}}>
          <button onClick={()=>setView("peakcal")} style={{display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 12px",borderRadius:8,border:"none",cursor:"pointer",fontFamily:"inherit",marginBottom:2,background:view==="peakcal"?"rgba(255,255,255,0.1)":"transparent",color:view==="peakcal"?"#fff":T.sidebarMuted,fontSize:13,fontWeight:view==="peakcal"?600:400,transition:"background 0.15s,color 0.15s"}}>
            🔴 Change Freeze
          </button>
        </div>
      </nav>

      <div style={{margin:"0 10px",background:"rgba(255,255,255,0.06)",border:`1px solid ${T.sidebarBorder}`,borderRadius:10,padding:"10px 12px",display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#1d4ed8,#0e7490)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,color:"#fff",flexShrink:0}}>
          {user.name.split(" ").map(p=>p[0]).join("").slice(0,2)}
        </div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:12,fontWeight:700,color:T.sidebarText,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{user.name}</div>
          <div style={{fontSize:11,color:T.sidebarMuted}}>{user.role} · {user.team}</div>
        </div>
      </div>
    </div>

    {/* Main */}
    <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      {/* Topbar */}
      <div style={{padding:"13px 28px",borderBottom:`1px solid ${T.border}`,display:"flex",alignItems:"center",gap:14,background:T.surface,flexShrink:0,boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>
        <div style={{fontSize:17,fontWeight:800,color:T.text,letterSpacing:"-0.3px"}}>{view==="mywork"?"My Work":view==="peakcal"?"Change Freeze":NAV.find(n=>n.id===view)?.label ?? "Change Freeze"}</div>
        <div style={{marginLeft:"auto",display:"flex",gap:10,alignItems:"center"}}>
          <Btn onClick={()=>setCreatingMode("picker")}>+ New Change</Btn>
        </div>
      </div>

      {activePeak&&<div style={{background:"linear-gradient(90deg,#7f1d1d,#991b1b)",color:"#fff",padding:"10px 28px",display:"flex",alignItems:"center",gap:14,flexShrink:0,boxShadow:"0 2px 8px rgba(127,29,29,0.3)"}}>
        <span style={{fontSize:16,flexShrink:0}}>❄</span>
        <div style={{flex:1}}>
          <span style={{fontWeight:700,fontSize:13}}>Network Freeze Period Active — {activePeak.name}</span>
          <span style={{fontSize:12,opacity:0.85,marginLeft:12}}>{activePeak.start} → {activePeak.end} · All changes require Director approval + business justification. No changes proceed without Director sign-off.</span>
        </div>
        <span style={{fontSize:11,background:"rgba(255,255,255,0.15)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:6,padding:"3px 10px",fontWeight:700,letterSpacing:"0.5px",whiteSpace:"nowrap"}}>ACTIVE FREEZE</span>
      </div>}

      <div style={{flex:1,overflowY:"auto",padding:"20px 24px"}}>

        {/* MY WORK */}
        {view==="mywork"&&<div>
          {/* Header */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:22,fontWeight:800,color:T.text,letterSpacing:"-0.4px"}}>Good day, {user.name.split(" ")[0]} 👋</div>
            <div style={{fontSize:13,color:T.muted,marginTop:3}}>{user.role} · {user.team} · {user.dept}</div>
          </div>

          {/* Quick stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14,marginBottom:24}}>
            {[
              {label:"Assigned to me/team",value:myChanges.length,col:T.primary,icon:"📋"},
              {label:"Actionable now",value:myActionable.length,col:"#0e7490",icon:"⚡"},
              {label:"Pending approval",value:myUpcoming.filter(c=>c.status==="Pending Approval").length,col:"#b45309",icon:"⏳"},
              {label:"In freeze period",value:myUpcoming.filter(c=>c.freezePeriod).length,col:T.freeze,icon:"❄"},
            ].map(s=><Card key={s.label} style={{borderTop:`3px solid ${s.col}`,padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{fontSize:34,fontWeight:800,color:s.col,fontFamily:"monospace",lineHeight:1}}>{s.value}</div>
                <span style={{fontSize:20,opacity:0.35}}>{s.icon}</span>
              </div>
              <div style={{fontSize:11,color:T.muted,fontWeight:500}}>{s.label}</div>
            </Card>)}
          </div>

          {/* Actionable now */}
          {myActionable.length>0&&<>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
              <h2 style={{fontSize:14,fontWeight:700,color:T.text}}>⚡ Actionable Now</h2>
              <span style={{fontSize:11,background:"#ecfeff",color:"#0e7490",border:"1px solid #a5f3fc",borderRadius:10,padding:"2px 9px",fontWeight:700}}>{myActionable.length} change{myActionable.length>1?"s":""}</span>
            </div>
            {myActionable.map(c=>{
              const mw=MW.find(w=>w.id===c.maintenanceWindow);
              return <Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:8,cursor:"pointer",borderLeft:`4px solid ${c.status==="In Execution"?"#06b6d4":"#15803d"}`}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14,color:T.text,marginBottom:4}}>{c.name}</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",fontSize:11,color:T.muted}}>
                      <span style={{fontWeight:600,color:T.text}}>{fmt(c.scheduledFor)}</span>
                      {mw&&<><span>·</span><span style={{color:"#0e7490",fontWeight:600}}>🔧 {mw.name}</span></>}
                      <span>·</span><span>{c.domain}</span>
                      {c.steps&&<><span>·</span><span>{c.steps.filter(s=>c.stepLogs?.[s.id]?.status==="done").length}/{c.steps.length} steps done</span></>}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                    <RiskPill risk={c.risk}/>
                    <Badge status={c.status}/>
                    <Btn small variant={c.status==="Approved"?"success":"outline"} onClick={e=>{e.stopPropagation();selectChange(c);}}>
                      {c.status==="Approved"?"▶ Execute":"⚙ Continue"}
                    </Btn>
                  </div>
                </div>
              </Card>;
            })}
            <div style={{marginBottom:24}}/>
          </>}

          {/* Upcoming schedule */}
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <h2 style={{fontSize:14,fontWeight:700,color:T.text}}>📅 My Upcoming Schedule</h2>
            <span style={{fontSize:11,color:T.muted}}>Next 14 days — {user.team}</span>
          </div>

          {/* Week-by-week grouping */}
          {(()=>{
            const upcoming14=myUpcoming.filter(c=>{
              if(!c.scheduledFor) return false;
              const d=new Date(c.scheduledFor), now2=new Date();
              const diff=(d-now2)/(1000*60*60*24);
              return diff>=-1&&diff<=14;
            });
            if(upcoming14.length===0) return <Card style={{textAlign:"center",padding:"32px 20px",color:T.muted}}>
              <div style={{fontSize:24,marginBottom:8}}>🗓</div>
              <div style={{fontWeight:600}}>No changes scheduled in the next 14 days</div>
              <div style={{fontSize:12,marginTop:4}}>for {user.team} team</div>
            </Card>;

            // Group by day
            const byDay={};
            upcoming14.forEach(c=>{
              const day=new Date(c.scheduledFor).toLocaleDateString("en-GB",{weekday:"long",day:"2-digit",month:"short"});
              if(!byDay[day]) byDay[day]={date:new Date(c.scheduledFor),changes:[]};
              byDay[day].changes.push(c);
            });

            const today=new Date().toDateString();
            return Object.entries(byDay).sort((a,b)=>a[1].date-b[1].date).map(([day,{date,changes:dc}])=>{
              const isToday=date.toDateString()===today;
              const isTomorrow=new Date(date-86400000).toDateString()===today;
              return <div key={day} style={{marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:700,color:isToday?T.primary:T.text}}>
                    {isToday?"TODAY — ":isTomorrow?"TOMORROW — ":""}{day}
                  </div>
                  {isToday&&<span style={{fontSize:10,background:T.primaryBg,color:T.primary,border:`1px solid ${T.primaryBorder}`,borderRadius:10,padding:"1px 8px",fontWeight:700}}>TODAY</span>}
                  <div style={{flex:1,height:1,background:T.border}}/>
                  <span style={{fontSize:11,color:T.muted}}>{dc.length} change{dc.length>1?"s":""}</span>
                </div>
                {dc.map(c=>{
                  const mw=MW.find(w=>w.id===c.maintenanceWindow);
                  const statusCol=(STATUS_META[c.status]||{}).dot||"#94a3b8";
                  return <Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:6,cursor:"pointer",padding:"12px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:12}}>
                      <div style={{width:3,alignSelf:"stretch",borderRadius:4,background:statusCol,flexShrink:0}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:13,color:T.text,marginBottom:3}}>{c.name}</div>
                        <div style={{display:"flex",gap:10,flexWrap:"wrap",fontSize:11,color:T.muted,alignItems:"center"}}>
                          <span>🕐 {new Date(c.scheduledFor).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>
                          {mw?<span style={{color:mw.freeze?T.freeze:"#0e7490",fontWeight:600}}>
                            {mw.freeze?"❄":"🔧"} {mw.name}
                          </span>:<span style={{color:"#b45309",fontWeight:600}}>⚠ No window</span>}
                          <span>· {c.domain}</span>
                          {c.country&&<span style={{fontWeight:700}}>· {c.country}</span>}
                          <span>· {c.approvalLevel}</span>
                          {c.freezePeriod&&<FreezeTag/>}
                        </div>
                      </div>
                      <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                        <RiskPill risk={c.risk}/>
                        <Badge status={c.status}/>
                      </div>
                    </div>
                  </Card>;
                })}
              </div>;
            });
          })()}

          {/* All team changes not yet scheduled or further out */}
          {myChanges.filter(c=>["Draft","Preflight","Pending Approval"].includes(c.status)).length>0&&<>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,marginTop:8}}>
              <h2 style={{fontSize:14,fontWeight:700,color:T.text}}>🗂 In Progress (awaiting execution)</h2>
              <div style={{flex:1,height:1,background:T.border}}/>
            </div>
            {myChanges.filter(c=>["Draft","Preflight","Pending Approval"].includes(c.status)).map(c=><Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:6,cursor:"pointer",padding:"11px 16px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:13,color:T.text,marginBottom:3}}>{c.name}</div>
                  <div style={{fontSize:11,color:T.muted}}>
                    Scheduled: {c.scheduledFor?fmt(c.scheduledFor,true):"TBD"} · {c.domain} · {c.manager}{c.country&&` · ${c.country}`}
                  </div>
                </div>
                <RiskPill risk={c.risk}/><Badge status={c.status}/>
              </div>
            </Card>)}
          </>}
        </div>}

        {/* DASHBOARD */}
        {view==="dashboard"&&<div>
          {/* Dashboard filters */}
          <Card style={{marginBottom:16,padding:"12px 16px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr",gap:10,alignItems:"end"}}>
              <Sel label="Team"     value={dashFilters.team}     onChange={sdf("team")}     options={["All",...TEAMS]}/>
              <Sel label="Manager"  value={dashFilters.manager}  onChange={sdf("manager")}  options={["All",...MANAGERS]}/>
              <Sel label="Director" value={dashFilters.director} onChange={sdf("director")} options={["All",...DIRECTORS]}/>
              <Sel label="Status"   value={dashFilters.status}   onChange={sdf("status")}   options={["All","Draft","Preflight","Pending Approval","Approved","In Execution","Completed","Failed","Rolled Back","Aborted","Off-Script"]}/>
              <Sel label="Risk"     value={dashFilters.risk}     onChange={sdf("risk")}     options={["All",...RISK_LEVELS]}/>
              <Sel label="Country"  value={dashFilters.country}  onChange={sdf("country")}  options={["All",...COUNTRIES.map(c=>({value:c.code,label:`${c.code} — ${c.name}`}))]}/>
              <Inp label="From"     value={dashFilters.dateFrom} onChange={sdf("dateFrom")} type="date"/>
              <Inp label="To"       value={dashFilters.dateTo}   onChange={sdf("dateTo")}   type="date"/>
            </div>
            <div style={{display:"flex",gap:10,marginTop:8,alignItems:"center"}}>
              <span style={{fontSize:12,color:T.muted}}>{dashCrs.length} change{dashCrs.length!==1?"s":""} match filters</span>
              <Btn small variant="ghost" style={{marginLeft:"auto"}} onClick={()=>setDashFilters({team:"All",manager:"All",director:"All",status:"All",risk:"All",country:"All",dateFrom:"",dateTo:""})}>Clear filters</Btn>
            </div>
          </Card>
          <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:14,marginBottom:24}}>
            {[
              {label:"Total Changes",value:stats.total,col:T.primary,icon:"↻"},
              {label:"Pending Approval",value:stats.pending,col:"#b45309",icon:"⏳"},
              {label:"In Execution",value:stats.executing,col:"#0e7490",icon:"⚡"},
              {label:"Completed",value:stats.completed,col:"#15803d",icon:"✓"},
              {label:"Failed / Aborted",value:stats.failed,col:"#b91c1c",icon:"✕"},
              {label:"Freeze Period",value:stats.frozen,col:T.freeze,icon:"❄"},
            ].map(s=><Card key={s.label} style={{borderTop:`3px solid ${s.col}`,padding:"16px 18px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{fontSize:34,fontWeight:800,color:s.col,fontFamily:"monospace",lineHeight:1}}>{s.value}</div>
                <span style={{fontSize:18,opacity:0.35}}>{s.icon}</span>
              </div>
              <div style={{fontSize:11,color:T.muted,fontWeight:500}}>{s.label}</div>
            </Card>)}
          </div>

          {stats.frozen>0&&<div style={{background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:10,padding:"13px 16px",marginBottom:18,display:"flex",gap:12,alignItems:"center"}}>
            <span style={{fontSize:18}}>❄</span>
            <div><div style={{fontWeight:700,color:T.freeze,fontSize:13}}>{stats.frozen} change{stats.frozen>1?"s":""} in freeze period</div><div style={{fontSize:12,color:"#b91c1c"}}>Director approval and business justification required.</div></div>
            <Btn small variant="ghost" style={{marginLeft:"auto",borderColor:"#fca5a5",color:T.freeze}} onClick={()=>{setView("changes");sf("status")("Pending Approval");}}>Review →</Btn>
          </div>}

          {/* exec results breakdown */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:22}}>
            <Card>
              <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>Execution Results</div>
              {EXEC_RESULTS.map(r=>{
                const cnt=dashCrs.filter(c=>c.execResult===r).length;
                const col={Successful:"#15803d",Failed:"#b91c1c",Aborted:"#7c3aed","Off-Script":"#b45309","Rolled Back":"#f97316"}[r]||T.muted;
                return cnt>0&&<div key={r} style={{display:"flex",gap:10,alignItems:"center",marginBottom:7}}>
                  <div style={{width:7,height:7,borderRadius:"50%",background:col,flexShrink:0}}/>
                  <span style={{fontSize:13,color:T.text,flex:1}}>{r}</span>
                  <span style={{fontSize:13,fontWeight:700,color:col,fontFamily:"monospace"}}>{cnt}</span>
                  <div style={{width:80,height:5,background:T.bg,borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${(cnt/Math.max(dashCrs.length,1))*100}%`,height:"100%",background:col,borderRadius:3}}/>
                  </div>
                </div>;
              })}
            </Card>
            <Card>
              <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:12}}>By Team</div>
              {TEAMS.map(t=>{
                const cnt=dashCrs.filter(c=>c.team===t).length;
                return cnt>0&&<div key={t} style={{display:"flex",gap:10,alignItems:"center",marginBottom:7}}>
                  <span style={{fontSize:12,color:T.text,flex:1}}>{t}</span>
                  <span style={{fontSize:12,fontWeight:700,color:T.primary,fontFamily:"monospace"}}>{cnt}</span>
                  <div style={{width:80,height:5,background:T.bg,borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${(cnt/Math.max(dashCrs.length,1))*100}%`,height:"100%",background:T.primary,borderRadius:3}}/>
                  </div>
                </div>;
              })}
            </Card>
          </div>

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <h2 style={{fontSize:15,fontWeight:700,color:T.text}}>Recent Changes</h2>
            <Btn small variant="ghost" onClick={()=>setView("changes")}>View all →</Btn>
          </div>
          {dashCrs.slice(0,5).map(c=><Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:7,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:3}}>
                <span style={{fontWeight:700,fontSize:13,color:T.text}}>{c.name}</span>
                {c.freezePeriod&&<FreezeTag/>}
                {c.country&&<span style={{fontSize:10,fontWeight:700,color:T.muted,background:T.bg,border:`1px solid ${T.border}`,borderRadius:4,padding:"1px 6px"}}>{c.country}</span>}
              </div>
              <div style={{fontSize:11,color:T.muted}}>{c.team} · {c.manager} · {fmt(c.scheduledFor,true)}</div>
            </div>
            <TypeTag type={c.type}/><IntrusionTag v={c.intrusion}/><RiskPill risk={c.risk}/><Badge status={c.status}/>
            <span style={{color:T.light}}>›</span>
          </Card>)}
        </div>}

        {/* CHANGES */}
        {view==="changes"&&<div>
          {/* Kind toggle + search bar */}
          <div style={{display:"flex",gap:10,marginBottom:12,alignItems:"center"}}>
            <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:9,overflow:"hidden",boxShadow:T.shadow}}>
              {["All","Unique","Templates","Windows"].map(k=>(
                <button key={k} onClick={()=>sf("kind")(k)} style={{padding:"8px 18px",border:"none",background:filters.kind===k?T.primary:T.surface,color:filters.kind===k?"#fff":T.muted,cursor:"pointer",fontFamily:"inherit",fontSize:13,fontWeight:filters.kind===k?700:500,transition:"background 0.15s,color 0.15s"}}>
                  {k==="Templates"?"⊡ Templates":k==="Unique"?"↻ Unique":k==="Windows"?"🔧 Windows":"All"}
                  {k!=="Windows"&&<span style={{marginLeft:6,fontSize:11,opacity:0.75}}>
                    {k==="All"?changes.length:k==="Templates"?templates.length:crs.length}
                  </span>}
                  {k==="Windows"&&<span style={{marginLeft:6,fontSize:11,opacity:0.75}}>{MW.length}</span>}
                </button>
              ))}
            </div>
            {filters.kind!=="Windows"&&<><div style={{position:"relative",flex:1}}>
              <span style={{position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:13,pointerEvents:"none"}}>🔍</span>
              <input value={filters.search} onChange={e=>sf("search")(e.target.value)} placeholder="Search by name or ID…" style={{width:"100%",background:T.surface,border:`1px solid ${T.border}`,borderRadius:8,color:T.text,padding:"8px 12px 8px 34px",fontSize:13,fontFamily:"inherit",outline:"none",boxShadow:T.shadow}}/>
            </div>
            <Sel value={filters.status} onChange={sf("status")} options={["All","Draft","Preflight","Pending Approval","Approved","In Execution","Completed","Failed","Rolled Back","Aborted","Off-Script"]} style={{minWidth:160}}/>
            <Sel value={filters.risk} onChange={sf("risk")} options={["All",...RISK_LEVELS]} style={{minWidth:100}}/></>}
          </div>

          {/* Secondary filters collapsible row */}
          {filters.kind!=="Windows"&&<Card style={{marginBottom:12,padding:"10px 14px"}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr 1fr 1fr 1fr",gap:10,alignItems:"end"}}>
              <Sel label="Team"     value={filters.team}     onChange={sf("team")}     options={["All",...TEAMS]}/>
              <Sel label="Dept"     value={filters.dept}     onChange={sf("dept")}     options={["All",...DEPTS]}/>
              <Sel label="Director" value={filters.director} onChange={sf("director")} options={["All",...DIRECTORS]}/>
              <Sel label="Manager"  value={filters.manager}  onChange={sf("manager")}  options={["All",...MANAGERS]}/>
              <Sel label="Country"  value={filters.country||"All"} onChange={sf("country")} options={["All",...COUNTRIES.map(c=>({value:c.code,label:`${c.code} — ${c.name}`}))]}/>
              <Inp label="From" value={filters.dateFrom} onChange={sf("dateFrom")} type="date"/>
              <Inp label="To"   value={filters.dateTo}   onChange={sf("dateTo")}   type="date"/>
            </div>
            <div style={{display:"flex",gap:10,marginTop:10,alignItems:"center"}}>
              <Sel value={filters.sortBy} onChange={sf("sortBy")} options={[{value:"date",label:"Sort: Sched. Start"},{value:"name",label:"Sort: Name"},{value:"risk",label:"Sort: Risk"},{value:"status",label:"Sort: Status"}]} style={{minWidth:160}}/>
              <button onClick={()=>sf("sortDir")(filters.sortDir==="asc"?"desc":"asc")} style={{background:T.bg,border:`1px solid ${T.border}`,borderRadius:8,cursor:"pointer",padding:"7px 12px",fontSize:12,color:T.muted,fontFamily:"inherit"}}>
                {filters.sortDir==="asc"?"↑ Asc":"↓ Desc"}
              </button>
              <div style={{display:"flex",border:`1px solid ${T.border}`,borderRadius:8,overflow:"hidden"}}>
                {["list","grid"].map(m=><button key={m} onClick={()=>sf("viewMode")(m)} style={{padding:"7px 12px",border:"none",background:filters.viewMode===m?T.primaryBg:"transparent",color:filters.viewMode===m?T.primary:T.muted,cursor:"pointer",fontFamily:"inherit",fontSize:12,fontWeight:filters.viewMode===m?600:400}}>{m==="list"?"☰ List":"⊞ Grid"}</button>)}
              </div>
              <span style={{fontSize:12,color:T.muted,marginLeft:"auto"}}>{filtered.length} result{filtered.length!==1?"s":""}</span>
              <Btn small variant="ghost" onClick={()=>setFilters(f=>({...f,search:"",status:"All",risk:"All",type:"All",intrusion:"All",execMode:"All",team:"All",dept:"All",director:"All",manager:"All",domain:"All",country:"All",dateFrom:"",dateTo:"",kind:"All"}))}>Clear</Btn>
            </div>
          </Card>}

          {filters.kind==="Windows"&&<div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>Maintenance Windows</div>
              <span style={{fontSize:11,color:T.muted}}>Pre-loaded windows available for scheduling changes</span>
            </div>
            {MW.map(mw=><Card key={mw.id} style={{marginBottom:10,borderLeft:`4px solid ${mw.freeze?T.freeze:T.accent}`}}>
              <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                <span style={{fontSize:20,flexShrink:0}}>{mw.freeze?"❄":"🔧"}</span>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:6,flexWrap:"wrap"}}>
                    <div style={{fontWeight:700,fontSize:14,color:mw.freeze?T.freeze:T.text}}>{mw.name}</div>
                    {mw.freeze&&<FreezeTag/>}
                    <span style={{fontSize:11,background:mw.active?"#f0fdf4":"#f1f5f9",color:mw.active?"#15803d":T.muted,border:`1px solid ${mw.active?"#86efac":T.border}`,borderRadius:4,padding:"2px 7px",fontWeight:600,marginLeft:"auto"}}>{mw.active?"ACTIVE":"INACTIVE"}</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:8}}>
                    <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>START</div><div style={{fontSize:12,color:T.text,fontWeight:500}}>{fmt(mw.start)}</div></div>
                    <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>END</div><div style={{fontSize:12,color:T.text,fontWeight:500}}>{fmt(mw.end)}</div></div>
                    <div><div style={{fontSize:11,color:T.muted,marginBottom:2}}>RECURRENCE</div><div style={{fontSize:12,color:T.text,fontWeight:500}}>{mw.recurrence}</div></div>
                  </div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    {(mw.teams||[]).map(t=><span key={t} style={{background:T.primaryBg,color:T.primary,border:`1px solid ${T.primaryBorder}`,borderRadius:4,padding:"2px 7px",fontSize:11,fontWeight:600}}>{t}</span>)}
                    <span style={{marginLeft:"auto",fontSize:11,color:T.muted}}>{changes.filter(c=>c.maintenanceWindow===mw.id).length} change{changes.filter(c=>c.maintenanceWindow===mw.id).length!==1?"s":""} scheduled</span>
                  </div>
                </div>
              </div>
            </Card>)}
          </div>}

          {filters.kind!=="Windows"&&filtered.length===0&&<div style={{textAlign:"center",padding:60,color:T.light}}>No changes match these filters.</div>}

          {filters.kind!=="Windows"&&filters.viewMode==="list"&&filtered.map(c=><Card key={c.id} onClick={()=>selectChange(c)} style={{marginBottom:7,cursor:"pointer"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:3,flexWrap:"wrap"}}>
                  {c.isTemplate&&<span style={{fontSize:10,background:"#f5f3ff",color:"#6d28d9",border:"1px solid #c4b5fd",borderRadius:3,padding:"1px 6px",fontWeight:700}}>TEMPLATE</span>}
                  <span style={{fontWeight:700,fontSize:13,color:T.text}}>{c.name}</span>
                  {c.freezePeriod&&<FreezeTag/>}
                </div>
                <div style={{fontSize:11,color:T.muted,display:"flex",gap:10,flexWrap:"wrap"}}>
                  <button onClick={e=>{e.stopPropagation();const url=window.location.origin+window.location.pathname+"#"+c.id;navigator.clipboard?.writeText(url).catch(()=>{});}} title="Copy shareable link" style={{fontFamily:"monospace",fontSize:11,color:T.primary,background:"none",border:"none",cursor:"pointer",padding:0,textDecoration:"underline",fontWeight:600}}>{c.id}</button><span>·</span><span>{c.team}</span><span>·</span><span>{c.manager}</span>
                  {c.country&&<><span>·</span><span style={{fontWeight:700}}>{c.country}</span></>}
                  {c.scheduledFor&&<><span>·</span><span>📅 {fmt(c.scheduledFor,true)}</span></>}
                  {c.scheduledEnd&&<><span>→</span><span>{fmt(c.scheduledEnd,true)}</span></>}
                  {c.execResult&&<><span>·</span><span style={{color:{Successful:"#15803d",Failed:"#b91c1c",Aborted:"#7c3aed"}[c.execResult]||T.muted,fontWeight:600}}>{c.execResult}</span></>}
                </div>
              </div>
              <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
                <TypeTag type={c.type}/><IntrusionTag v={c.intrusion}/><RiskPill risk={c.risk}/><Badge status={c.status}/>
                <span style={{color:T.light}}>›</span>
              </div>
            </div>
          </Card>)}

          {filters.kind!=="Windows"&&filters.viewMode==="grid"&&<div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {filtered.map(c=><Card key={c.id} onClick={()=>selectChange(c)} style={{cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
                {c.isTemplate?<span style={{fontSize:10,background:"#f5f3ff",color:"#6d28d9",border:"1px solid #c4b5fd",borderRadius:4,padding:"2px 7px",fontWeight:700}}>TEMPLATE</span>:<Badge status={c.status} small/>}
                <RiskPill risk={c.risk}/>
              </div>
              <div style={{fontWeight:700,fontSize:13,color:T.text,marginBottom:4,lineHeight:1.3}}>{c.name}</div>
              <div style={{fontSize:11,color:T.muted,marginBottom:8}}>{c.domain} · {c.team}</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                <TypeTag type={c.type}/><IntrusionTag v={c.intrusion}/>
                {c.freezePeriod&&<FreezeTag/>}
              </div>
              <div style={{fontSize:11,color:T.light,marginTop:8}}>{fmt(c.scheduledFor,true)} · {c.manager}</div>
            </Card>)}
          </div>}
        </div>}

        {/* TIMELINE */}
        {view==="timeline"&&<div>
          <Card style={{padding:0,overflow:"hidden"}}>
            <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:16,alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:T.text}}>Change Calendar</div>
              <div style={{display:"flex",gap:10,fontSize:11,color:T.muted,alignItems:"center"}}>
                <span style={{width:12,height:12,borderRadius:3,background:"#f0fdfa",border:"1px solid #0e7490",display:"inline-block"}}/> Maintenance Window
                <span style={{width:12,height:12,borderRadius:3,background:"#fef2f2",border:"1px solid #dc2626",display:"inline-block"}}/> Freeze Period
              </div>
            </div>
            <div style={{padding:14}}>
              <TimelineView changes={crs} onSelect={selectChange}/>
            </div>
          </Card>
        </div>}

        {/* PEAK CALENDAR */}
        {view==="peakcal"&&<div>
          <Card style={{marginBottom:16,padding:"16px 20px"}}>
            <div style={{fontSize:15,fontWeight:800,color:T.text,marginBottom:4}}>🔴 Change Freeze Calendar</div>
            <div style={{fontSize:13,color:T.muted}}>Changes scheduled during freeze periods require Director approval and business justification. Non-critical changes may be blocked.</div>
          </Card>
          {PEAK_PERIODS.map(p=>{
            const now2=new Date().toISOString().slice(0,10);
            const active=now2>=p.start&&now2<=p.end;
            const past=now2>p.end;
            return <Card key={p.id} style={{marginBottom:10,borderLeft:`4px solid ${past?"#94a3b8":p.color}`}}>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:20}}>{active?"🔴":past?"⚫":"🟡"}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,color:past?T.muted:p.color}}>{p.name}</div>
                  <div style={{fontSize:12,color:T.muted,marginTop:2}}>{p.start} → {p.end}</div>
                </div>
                <span style={{fontSize:11,padding:"3px 10px",borderRadius:10,fontWeight:700,
                  background:active?"#fef2f2":past?"#f1f5f9":"#fffbeb",
                  color:active?T.freeze:past?T.light:"#92400e",
                  border:`1px solid ${active?"#fca5a5":past?T.border:"#fcd34d"}`}}>
                  {active?"ACTIVE — CHANGES FROZEN":past?"PASSED":"UPCOMING"}
                </span>
              </div>
              {active&&<div style={{marginTop:10,background:"#fef2f2",border:"1px solid #fca5a5",borderRadius:7,padding:"9px 13px",fontSize:12,color:T.freeze}}>
                ⚠ This change freeze is currently active. All changes require Director approval and business justification.
              </div>}
            </Card>;
          })}
          <Card style={{marginTop:16,background:"#fffbeb",border:"1px solid #fcd34d"}}>
            <div style={{fontWeight:700,color:"#92400e",fontSize:13,marginBottom:6}}>ℹ How change freezes affect changes</div>
            <div style={{fontSize:12,color:T.text,lineHeight:1.8}}>
              • <b>Low / Medium risk</b>: Allowed with normal approval outside freeze<br/>
              • <b>High / Critical risk</b>: Require Director approval at all times<br/>
              • <b>During Change Freeze</b>: Director approval + business justification mandatory for all changes<br/>
              • <b>Critical SLA breach</b>: Director may grant freeze override with Bar Raiser review
            </div>
          </Card>
        </div>}

      </div>
    </div>

    {/* Modals */}
    {selected&&<ChangeDetail change={selected} currentUser={user} onClose={()=>closeChange()} onUpdate={u=>updateChange(selected.id,u)} windows={MW}/>}
    {/* MCM-style Create Change Modal */}
    {creatingMode==="picker"&&<CreateModePicker
      templates={templates}
      activePeak={activePeak}
      windows={MW}
      currentUser={user}
      onClose={()=>setCreatingMode(null)}
      onPickAdHoc={()=>{setNc({...NC_DEFAULTS,isTemplate:false,type:"Ad-hoc"});setNcStep(0);setCreatingMode("wizard");}}
      onPickNewTemplate={()=>{setNc({...NC_DEFAULTS,isTemplate:true,type:"Template"});setNcStep(0);setCreatingMode("wizard");}}
      onPickTemplate={t=>{
        setNc({
          ...NC_DEFAULTS,
          name:"["+t.name+"] ",
          domain:t.domain||NC_DEFAULTS.domain,
          risk:t.risk||"Low",
          approvalLevel:t.approvalLevel||"L1",
          execMode:t.execMode||"Manual",
          intrusion:t.intrusion||"Non-Intrusive",
          type:"Template",
          rollbackPlan:t.rollbackPlan||"",
          serviceImpact:t.serviceImpact||"",
          affectedServices:Array.isArray(t.affectedServices)?t.affectedServices.join(", "):(t.affectedServices||""),
          steps:(t.steps||[]).map(s=>({...s,id:Date.now()+Math.random()})),
          isTemplate:false,
        });
        setNcStep(0);
        setCreatingMode("wizard");
      }}
      onCreate={newC=>{setChanges(cs=>[newC,...cs]);setCreatingMode(null);}}
    />}
    {creatingMode==="wizard"&&<CreateChangeMCM
      nc={nc} setNc={setNc} ncSf={ncSf} ncStep={ncStep} setNcStep={setNcStep}
      NC_DEFAULTS={NC_DEFAULTS}
      currentUser={user} windows={MW}
      onClose={()=>{setCreatingMode(null);setNcStep(0);setNc(NC_DEFAULTS);}}
      onCreate={newC=>{setChanges(cs=>[newC,...cs]);setCreatingMode(null);setNcStep(0);setNc(NC_DEFAULTS);}}
    />}

    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
      *{box-sizing:border-box;margin:0;padding:0;}
      ::-webkit-scrollbar{width:6px;height:6px;}
      ::-webkit-scrollbar-track{background:transparent;}
      ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:6px;}
      ::-webkit-scrollbar-thumb:hover{background:#94a3b8;}
      input[type=checkbox]{accent-color:#1d4ed8;cursor:pointer;}
      input[type=date],input[type=datetime-local]{color-scheme:light;}
      button{transition:opacity 0.15s,background 0.15s,box-shadow 0.15s;}
      button:not(:disabled):hover{opacity:0.82;}
      textarea:focus,input:focus,select:focus{border-color:#93c5fd!important;outline:none;box-shadow:0 0 0 3px rgba(147,197,253,0.25)!important;}
      [data-card]:hover{box-shadow:0 4px 12px rgba(0,0,0,0.1)!important;}
    `}</style>
  </div>;
}
