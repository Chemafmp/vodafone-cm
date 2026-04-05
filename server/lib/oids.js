// ─── Standard SNMP OIDs ─────────────────────────────────────────────────────
// These are real OID addresses from RFC 1213 (MIB-II) and RFC 2790 (Host Resources).
// Any SNMP tool (snmpget, snmpwalk, PRTG, Zabbix...) uses these same addresses
// to talk to real Cisco/Juniper/Nokia routers.

// System group — basic device identity
export const SYS_DESCR    = "1.3.6.1.2.1.1.1.0";   // "Cisco ASR 9922 IOS-XR 7.5.2"
export const SYS_OBJECT_ID = "1.3.6.1.2.1.1.2.0";  // vendor object ID
export const SYS_UPTIME   = "1.3.6.1.2.1.1.3.0";   // hundredths of seconds since boot
export const SYS_CONTACT  = "1.3.6.1.2.1.1.4.0";   // admin contact
export const SYS_NAME     = "1.3.6.1.2.1.1.5.0";   // hostname
export const SYS_LOCATION = "1.3.6.1.2.1.1.6.0";   // physical location

// Interface table — one entry per interface (index = interface number)
// To query interface 1: append ".1", interface 2: ".2", etc.
export const IF_NUMBER     = "1.3.6.1.2.1.2.1.0";           // total number of interfaces
export const IF_DESCR      = "1.3.6.1.2.1.2.2.1.2";         // + .{N} → interface name
export const IF_TYPE       = "1.3.6.1.2.1.2.2.1.3";         // + .{N} → type (6=ethernet)
export const IF_SPEED      = "1.3.6.1.2.1.2.2.1.5";         // + .{N} → bits per second
export const IF_OPER_STATUS = "1.3.6.1.2.1.2.2.1.8";        // + .{N} → 1=up, 2=down, 3=testing
export const IF_IN_OCTETS  = "1.3.6.1.2.1.2.2.1.10";        // + .{N} → bytes received
export const IF_OUT_OCTETS = "1.3.6.1.2.1.2.2.1.16";        // + .{N} → bytes sent

// Host resources — CPU and memory (RFC 2790)
export const HR_PROCESSOR_LOAD = "1.3.6.1.2.1.25.3.3.1.2";  // + .{N} → CPU % (0-100)

// Private enterprise OIDs (under our own "Bodaphone" subtree: 1.3.6.1.4.1.99999)
// In real life, each vendor has their own enterprise number.
// We use 99999 for our custom metrics.
export const PRIVATE_BASE     = "1.3.6.1.4.1.99999";
export const PRIV_MEM_USAGE   = "1.3.6.1.4.1.99999.1.1.0";    // memory % (0-100)
export const PRIV_MEM_TOTAL   = "1.3.6.1.4.1.99999.1.2.0";    // total memory MB
export const PRIV_TEMP        = "1.3.6.1.4.1.99999.1.3.0";    // temperature celsius
export const PRIV_BGP_PEER_STATE = "1.3.6.1.4.1.99999.2.1";   // + .{N} → 1=established, 2=idle, 3=connect, 4=active, 5=opensent, 6=openconfirm
export const PRIV_BGP_PEER_PFX  = "1.3.6.1.4.1.99999.2.2";   // + .{N} → prefixes received

// Interface operStatus values
export const IF_STATUS = { UP: 1, DOWN: 2, TESTING: 3 };

// BGP peer state values (standard BGP FSM states)
export const BGP_STATE = {
  IDLE: 1, CONNECT: 2, ACTIVE: 3,
  OPENSENT: 4, OPENCONFIRM: 5, ESTABLISHED: 6,
};

// Alarm thresholds — the poller uses these to decide when to raise alarms
export const THRESHOLDS = {
  CPU_MAJOR: 85,
  CPU_CRITICAL: 95,
  MEM_MAJOR: 90,
  MEM_CRITICAL: 95,
  TEMP_MAJOR: 65,
  TEMP_CRITICAL: 75,
  POLL_TIMEOUT_MS: 3000,   // if no SNMP response in 3s → unreachable
  POLL_INTERVAL_MS: 10000, // poll every 10 seconds
};
