// ─── Service Status Simulator ─────────────────────────────────────────────────
// Simulates Downdetector-style complaint volume data for 10 Vodafone markets.
// Ticked every 30s by poller.js; auto-creates/resolves incident tickets on OUTAGE.
//
// Status thresholds (ratio = complaints / baseline):
//   OK      < 2.0×
//   WARNING ≥ 2.0× and < 4.5×
//   OUTAGE  ≥ 4.5×

const MARKETS = [
  { id: "es", name: "Spain",       flag: "🇪🇸", tz: "Europe/Madrid",    baseline: 45 },
  { id: "uk", name: "UK",          flag: "🇬🇧", tz: "Europe/London",    baseline: 60 },
  { id: "de", name: "Germany",     flag: "🇩🇪", tz: "Europe/Berlin",    baseline: 50 },
  { id: "it", name: "Italy",       flag: "🇮🇹", tz: "Europe/Rome",      baseline: 40 },
  { id: "pt", name: "Portugal",    flag: "🇵🇹", tz: "Europe/Lisbon",    baseline: 20 },
  { id: "nl", name: "Netherlands", flag: "🇳🇱", tz: "Europe/Amsterdam", baseline: 25 },
  { id: "ie", name: "Ireland",     flag: "🇮🇪", tz: "Europe/Dublin",    baseline: 15 },
  { id: "gr", name: "Greece",      flag: "🇬🇷", tz: "Europe/Athens",    baseline: 20 },
  { id: "ro", name: "Romania",     flag: "🇷🇴", tz: "Europe/Bucharest", baseline: 30 },
  { id: "tr", name: "Turkey",      flag: "🇹🇷", tz: "Europe/Istanbul",  baseline: 35 },
];

const SERVICES = [
  { id: "mobile_data",  name: "Mobile Data",    icon: "📶", weight: 0.40 },
  { id: "mobile_voice", name: "Mobile Voice",   icon: "📞", weight: 0.20 },
  { id: "fixed_bb",     name: "Fixed Broadband",icon: "🌐", weight: 0.28 },
  { id: "tv",           name: "TV / IPTV",      icon: "📺", weight: 0.12 },
];

const HISTORY_LEN = 20; // sparkline points (20 × 30s = 10 minutes visible)

// ─── In-memory state ─────────────────────────────────────────────────────────
// marketId → { ...market fields, complaints, ratio, status, trend[], ticketId,
//              spikeRemaining, spikeMult, services: { svcId → { complaints, ratio, status } } }
const state = new Map();

function initState() {
  for (const m of MARKETS) {
    const baseline = m.baseline;
    state.set(m.id, {
      ...m,
      complaints:      Math.round(baseline),
      ratio:           1.0,
      status:          "ok",
      prevStatus:      "ok",
      trend:           Array(HISTORY_LEN).fill(Math.round(baseline)),
      ticketId:        null,
      spikeRemaining:  0,
      spikeMult:       1,
      spikeService:    null,
      lastUpdate:      Date.now(),
      services:        Object.fromEntries(
        SERVICES.map(s => [s.id, { complaints: Math.round(baseline * s.weight), ratio: 1.0, status: "ok" }])
      ),
    });
  }
}

// ─── Simulation helpers ───────────────────────────────────────────────────────

/** Time-of-day multiplier — sinusoidal; peaks at noon, troughs at 4am. */
function todMultiplier() {
  const now = new Date();
  const h = now.getUTCHours() + now.getUTCMinutes() / 60;
  // sin waves from 0 (4am UTC) to peak (12pm UTC)
  const rad = ((h - 4) / 24) * 2 * Math.PI;
  return 0.75 + 0.45 * Math.sin(rad);
}

function rand(min, max) { return min + Math.random() * (max - min); }

function statusForRatio(ratio) {
  if (ratio >= 4.5) return "outage";
  if (ratio >= 2.0) return "warning";
  return "ok";
}

// ─── Tick function ────────────────────────────────────────────────────────────
/**
 * Called every 30s. Updates all market states and triggers auto-ticket
 * creation/resolution via HTTP to the local tickets API.
 *
 * @param {number} port  — poller HTTP port (for self-calls to /api/tickets)
 */
export async function tickServiceStatus(port) {
  const tod = todMultiplier();

  for (const [marketId, m] of state) {
    // ── Spike state machine ──────────────────────────────────────────────────
    if (m.spikeRemaining > 0) {
      m.spikeRemaining--;
      if (m.spikeRemaining === 0) m.spikeMult = 1;
    } else {
      // 3% chance of a new spike per tick
      if (Math.random() < 0.03) {
        m.spikeMult        = rand(5.0, 12.0);
        m.spikeRemaining   = Math.round(rand(1, 4)); // 1–4 ticks (30s–2min)
        m.spikeService     = SERVICES[Math.floor(Math.random() * SERVICES.length)].id;
      }
    }

    // ── Compute total complaints ─────────────────────────────────────────────
    const noise  = rand(0.80, 1.20);
    let totalMult = tod * noise;
    if (m.spikeRemaining > 0) totalMult *= m.spikeMult;

    const complaints = Math.round(m.baseline * totalMult);
    const ratio      = complaints / m.baseline;
    const status     = statusForRatio(ratio);

    // ── Per-service split ────────────────────────────────────────────────────
    let remaining = complaints;
    SERVICES.forEach((s, i) => {
      let svcComplaints;
      if (i === SERVICES.length - 1) {
        svcComplaints = remaining;
      } else {
        // Amplify the spiked service; others share the rest proportionally
        let w = s.weight;
        if (m.spikeService === s.id && m.spikeRemaining > 0) w *= m.spikeMult;
        svcComplaints = Math.round(complaints * (w / SERVICES.reduce((acc, sv) => {
          let ww = sv.weight;
          if (m.spikeService === sv.id && m.spikeRemaining > 0) ww *= m.spikeMult;
          return acc + ww;
        }, 0)));
        remaining -= svcComplaints;
      }
      const svcRatio = svcComplaints / (m.baseline * s.weight || 1);
      m.services[s.id] = {
        complaints: svcComplaints,
        ratio:      Math.round(svcRatio * 10) / 10,
        status:     statusForRatio(svcRatio),
      };
    });

    // ── Update trend ─────────────────────────────────────────────────────────
    m.complaints  = complaints;
    m.ratio       = Math.round(ratio * 10) / 10;
    m.prevStatus  = m.status;
    m.status      = status;
    m.lastUpdate  = Date.now();
    m.trend       = [...m.trend.slice(1), complaints];

    // ── Auto-ticket logic ────────────────────────────────────────────────────
    if (m.status === "outage" && m.prevStatus !== "outage") {
      // New OUTAGE — create incident ticket
      try {
        const resp = await fetch(`http://localhost:${port}/api/tickets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type:          "incident",
            severity:      "sev2",
            title:         `Service Outage: Vodafone ${m.name} — elevated complaint volume (${ratio.toFixed(1)}× baseline)`,
            team:          "NOC",
            description:   `Auto-detected via service status monitoring.\n\nComplaint volume: ${complaints}/h (${ratio.toFixed(1)}× baseline of ${m.baseline}/h)\n\nAffected market: ${m.flag} ${m.name}`,
            tags:          ["service-status", "downdetector", m.id],
            actor_name:    "System",
            source:        "alarm",
          }),
        });
        if (resp.ok) {
          const ticket = await resp.json();
          m.ticketId = ticket.id;
        }
      } catch (_) { /* non-fatal */ }
    } else if (m.status !== "outage" && m.prevStatus === "outage" && m.ticketId) {
      // Recovered from OUTAGE — add event + auto-close if ticket is still fresh
      try {
        await fetch(`http://localhost:${port}/api/tickets/${encodeURIComponent(m.ticketId)}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_type: "status_change",
            actor_name: "System",
            content:    `Service recovered. Complaint volume back to ${complaints}/h (${ratio.toFixed(1)}× baseline). Status: ${m.prevStatus.toUpperCase()} → ${m.status.toUpperCase()}`,
          }),
        });
        // Auto-resolve if ticket is still in new/assigned (not yet worked on)
        const tResp = await fetch(`http://localhost:${port}/api/tickets/${encodeURIComponent(m.ticketId)}`);
        if (tResp.ok) {
          const t = await tResp.json();
          if (["new", "assigned"].includes(t.status)) {
            await fetch(`http://localhost:${port}/api/tickets/${encodeURIComponent(m.ticketId)}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                status:     "resolved",
                actor_name: "System",
              }),
            });
          }
        }
      } catch (_) { /* non-fatal */ }
      m.ticketId = null;
    } else if (m.status === "outage" && m.prevStatus === "outage") {
      // Ongoing OUTAGE — add heartbeat event if ticket exists (every ~5 ticks = 2.5 min)
      // (skipped for brevity — the sparkline shows the trend)
    }
  }
}

// ─── Read current state ───────────────────────────────────────────────────────
export function getServiceStatus() {
  return MARKETS.map(m => {
    const s = state.get(m.id);
    return {
      id:          m.id,
      name:        m.name,
      flag:        m.flag,
      baseline:    m.baseline,
      complaints:  s.complaints,
      ratio:       s.ratio,
      status:      s.status,
      prevStatus:  s.prevStatus,
      trend:       s.trend,
      ticketId:    s.ticketId,
      lastUpdate:  s.lastUpdate,
      services:    s.services,
    };
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
initState();
