export const TEAMS = ["Core Transport","Voice Core","Data Core","Access","RAN","Cloud","OSS/BSS"];
export const DEPTS = ["Engineering","Operations","Infrastructure","Security Ops"];
export const DIRECTORS = ["Matt I.","Didier C.","Michael T.","Elena Martín"];
export const MANAGERS  = ["Chema F.","Sam Reyes","Tom Brandt","Mike Ohara"];
export const SYSTEMS   = ["Core Network","RAN","Transport","IP/MPLS","Cloud Infra","DNS/NTP","Security GW","OSS/BSS","Voice","Data Core"];
export const RISK_LEVELS = ["Low","Medium","High","Critical"];
export const CHANGE_TYPES = ["Template","Ad-hoc"];
export const EXEC_MODES   = ["Manual","Automated"];
export const INTRUSION    = ["Intrusive","Non-Intrusive"];
export const EXEC_RESULTS = ["Successful","Off-Script","Aborted","Failed","Rolled Back"];

export const STATUS_META = {
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

export const RISK_C = {Low:"#15803d",Medium:"#b45309",High:"#b91c1c",Critical:"#7f1d1d"};

export const USERS = [
  {id:"u1",name:"Alex Torres",  role:"Engineer", team:"Core Transport",dept:"Engineering"},
  {id:"u2",name:"Chema F.",     role:"Manager",  team:"Core Transport",dept:"Engineering"},
  {id:"u3",name:"Matt I.",      role:"Director", team:"Core Transport",dept:"Engineering"},
  {id:"u4",name:"Ivan M.",      role:"Engineer", team:"Core Transport",dept:"Engineering"},
  {id:"u5",name:"Adam S.",      role:"Engineer", team:"Core Transport",dept:"Engineering"},
  {id:"u6",name:"Davide Z.",    role:"Engineer", team:"Data Core",     dept:"Operations"},
  {id:"u7",name:"Ram",          role:"Engineer", team:"Voice Core",    dept:"Operations"},
  {id:"u8",name:"Michael T.",   role:"Director", team:"Access",        dept:"Engineering"},
  {id:"u9",name:"Didier C.",    role:"Director", team:"Core Transport",dept:"Engineering"},
];
