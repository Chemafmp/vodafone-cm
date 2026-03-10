// ─── SEED DATA ────────────────────────────────────────────────────────────────
export const TEAMS = ["Core Transport","Voice Core","Data Core","Access","RAN","Cloud","OSS/BSS"];
export const DEPTS = ["Engineering", "Operations", "Infrastructure", "Security Ops"];
export const DIRECTORS = ["Matt I.","Didier C.","Michael T.","Elena Martín"];
export const MANAGERS  = ["Chema F.","Sam Reyes","Ivan M.","Adam S."];
export const SYSTEMS   = ["Core Network","RAN","Transport","IP/MPLS","Cloud Infra","DNS/NTP","Security GW","OSS/BSS","Voice","Data Core"];
export const COUNTRIES = [
  {code:"DE",name:"Germany"},    {code:"IT",name:"Italy"},
  {code:"UK",name:"United Kingdom"},{code:"ES",name:"Spain"},
  {code:"CZ",name:"Czech Republic"},{code:"RO",name:"Romania"},
  {code:"AL",name:"Albania"},    {code:"PT",name:"Portugal"},
  {code:"IE",name:"Ireland"},    {code:"GR",name:"Greece"},
  {code:"TR",name:"Turkey"},     {code:"HU",name:"Hungary"},
  {code:"NL",name:"Netherlands"},{code:"ZA",name:"South Africa"},
  {code:"GH",name:"Ghana"},      {code:"EG",name:"Egypt"},
];
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

export const T = {
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
