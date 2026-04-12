// ─── Slack Notifier ────────────────────────────────────────────────────────────
// Sends alert messages to a Slack channel via Incoming Webhook.
//
// Usage:
//   notifyAlarm(alarm)    → fires when a new Critical alarm is detected
//   notifyResolved(alarm) → fires when a Critical alarm is resolved
//
// Rate limiting: the same alarm key (nodeId::type) is silenced for
// MUTE_MS after the first notification — avoids spam if a node flaps.
//
// Activation: set SLACK_WEBHOOK_URL env var in docker-compose.yml.
// Without it this module is a no-op (safe to deploy with no config).

const WEBHOOK_URL  = process.env.SLACK_WEBHOOK_URL;
const FRONTEND_URL = process.env.FRONTEND_URL || "https://chemafmp.github.io/vodafone-cm";
const MUTE_MS      = 10 * 60 * 1000; // 10 min cooldown per alarm key

// Track last notification time per alarm key to rate-limit
const lastSent = new Map();

function isMuted(key) {
  const t = lastSent.get(key);
  return t && (Date.now() - t) < MUTE_MS;
}

async function post(payload) {
  if (!WEBHOOK_URL) return; // no-op if not configured
  try {
    await fetch(WEBHOOK_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });
  } catch (e) {
    console.error("[notifier] Slack POST failed:", e.message);
  }
}

// ── Severity emoji + color ────────────────────────────────────────────────────
function sevMeta(severity) {
  switch (severity) {
    case "Critical": return { emoji: "🔴", color: "#dc2626" };
    case "Major":    return { emoji: "🟠", color: "#f59e0b" };
    case "Minor":    return { emoji: "🟡", color: "#eab308" };
    default:         return { emoji: "⚪", color: "#6b7280" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

// ── Network Health status transitions ────────────────────────────────────────
// Track last known status per market+signal to detect ok→warning→outage changes.
// Key: "marketId::signal" (e.g. "es::atlas", "uk::bgp", "de::dns")
const prevNetworkStatus = new Map();

/**
 * Check network health signals and notify on status changes.
 * Covers Atlas, BGP, DNS, IODA, and Cloudflare Radar.
 * Call after each tick with the full market list from getNetworkHealth().
 *
 * @param {{ id, name, flag, status, ratio, bgp:{status}, dns:{status}, ioda, radar }[]} markets
 * @param {Function} [createTicketFn] - async (market, signal, status, detail) => ticketId
 */
export async function checkNetworkHealth(markets, createTicketFn) {
  if (!WEBHOOK_URL && typeof createTicketFn !== "function") return;

  const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  for (const m of markets) {
    const checks = [
      { signal: "atlas", label: "ICMP Latency (RIPE Atlas)", status: m.status,      detail: m.ratio ? `×${m.ratio.toFixed(1)} ratio` : "" },
      { signal: "bgp",   label: "BGP Visibility",            status: m.bgp?.status, detail: m.bgp?.current ? `${m.bgp.current.visibility_pct?.toFixed(1)}% peers` : "" },
      { signal: "dns",   label: "DNS RTT",                   status: m.dns?.status, detail: m.dns?.ratio   ? `×${m.dns.ratio.toFixed(1)} ratio`   : "" },
      // IODA: hasActiveEvent → "outage", otherwise "ok"
      { signal: "ioda",  label: "CAIDA IODA Outage",
        status: m.ioda ? (m.ioda.hasActiveEvent ? "outage" : "ok") : null,
        detail: m.ioda?.activeCount > 0 ? `${m.ioda.activeCount} active event${m.ioda.activeCount !== 1 ? "s" : ""}` : "" },
      // Radar: hasAlert → "warning", otherwise "ok"
      { signal: "radar", label: "Cloudflare Radar BGP",
        status: m.radar ? (m.radar.hasAlert ? "warning" : "ok") : null,
        detail: m.radar?.alertCount > 0 ? `${m.radar.alertCount} alert${m.radar.alertCount !== 1 ? "s" : ""}` : "" },
    ];

    for (const { signal, label, status, detail } of checks) {
      if (!status || status === "unknown") continue;

      const key  = `${m.id}::${signal}`;
      const prev = prevNetworkStatus.get(key) || "ok";

      // Degradation: ok→warning, ok→outage, warning→outage
      const degraded = (prev === "ok" && (status === "warning" || status === "outage"))
                    || (prev === "warning" && status === "outage");

      // Recovery: outage/warning → ok
      const recovered = (prev === "outage" || prev === "warning") && status === "ok";

      prevNetworkStatus.set(key, status);

      if (degraded) {
        const key2 = `nh::${m.id}::${signal}`;
        if (isMuted(key2)) continue;
        lastSent.set(key2, Date.now());

        const isOutage  = status === "outage";
        const emoji     = isOutage ? "🔴" : "🟠";
        const color     = isOutage ? "#dc2626" : "#f59e0b";
        const severity  = isOutage ? "OUTAGE" : "WARNING";

        // Auto-create ticket
        let ticketId = null;
        if (typeof createTicketFn === "function") {
          ticketId = await createTicketFn(m, signal, isOutage ? "outage" : "warning", detail).catch(() => null);
        }

        if (WEBHOOK_URL) {
          const blocks = [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `${emoji} *${severity} — ${m.flag} ${m.name}*\n*Signal:* ${label}${detail ? `  ·  ${detail}` : ""}`,
              },
            },
          ];
          const link = ticketLinkBlock(ticketId);
          if (link) blocks.push(link);
          blocks.push({
            type: "context",
            elements: [{ type: "mrkdwn", text: `Bodaphone NOC · Network Health · ${ts} UTC` }],
          });
          await post({ attachments: [{ color, blocks }] });
        }
      }

      if (recovered) {
        if (WEBHOOK_URL) {
          await post({
            attachments: [{
              color: "#16a34a",
              blocks: [
                {
                  type: "section",
                  text: {
                    type: "mrkdwn",
                    text: `✅ *RECOVERED — ${m.flag} ${m.name}*\n*Signal:* ${label} back to normal`,
                  },
                },
                {
                  type: "context",
                  elements: [{ type: "mrkdwn", text: `Bodaphone NOC · Network Health · ${ts} UTC` }],
                },
              ],
            }],
          });
        }
      }
    }
  }
}

// ── Downdetector / Service Status transitions ─────────────────────────────────
// Key: "svc::marketId"  →  last known status ("ok" | "warn" | "alert")
const prevServiceStatus = new Map();

/**
 * Check Downdetector complaint levels and notify on status changes.
 * Only fires when market.dataSource === "downdetector" (real data guard).
 * Call after each tickServiceStatus().
 *
 * @param {{ id, name, flag, status, ratio, complaints, dataSource }[]} markets
 * @param {Function} [createTicketFn] - async (market, status) => ticketId
 */
export async function checkServiceStatus(markets, createTicketFn) {
  if (!WEBHOOK_URL && typeof createTicketFn !== "function") return;

  const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  for (const m of markets) {
    // ── Guard: only real Downdetector data ──────────────────────────────────
    if (m.dataSource !== "downdetector") continue;

    const status = m.status; // "ok" | "warn" | "alert"
    if (!status) continue;

    const key  = `svc::${m.id}`;
    const prev = prevServiceStatus.get(key) || "ok";

    // Degradation: ok→warn, ok→alert, warn→alert
    const degraded = (prev === "ok"   && (status === "warn" || status === "alert"))
                  || (prev === "warn" && status === "alert");

    // Recovery: warn/alert → ok
    const recovered = (prev === "warn" || prev === "alert") && status === "ok";

    prevServiceStatus.set(key, status);

    if (degraded) {
      const muteKey = `svc-mute::${m.id}`;
      if (isMuted(muteKey)) continue;
      lastSent.set(muteKey, Date.now());

      const isAlert  = status === "alert";
      const emoji    = isAlert ? "🔴" : "🟠";
      const color    = isAlert ? "#dc2626" : "#f59e0b";
      const label    = isAlert ? "ALERT" : "WARNING";
      const ratioTxt = m.ratio ? `×${m.ratio.toFixed(1)} complaints` : "";
      const countTxt = m.complaints ? `${m.complaints}/h` : "";
      const detail   = [ratioTxt, countTxt].filter(Boolean).join("  ·  ");

      // Auto-create ticket
      let ticketId = null;
      if (typeof createTicketFn === "function") {
        ticketId = await createTicketFn(m, status).catch(() => null);
      }

      if (WEBHOOK_URL) {
        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *${label} — ${m.flag} ${m.name}*\n*Signal:* Downdetector Complaints${detail ? `  ·  ${detail}` : ""}`,
            },
          },
        ];
        const link = ticketLinkBlock(ticketId);
        if (link) blocks.push(link);
        blocks.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: `Bodaphone NOC · Service Monitor · ${ts} UTC` }],
        });
        await post({ attachments: [{ color, blocks }] });
      }
    }

    if (recovered) {
      if (WEBHOOK_URL) {
        await post({
          attachments: [{
            color: "#16a34a",
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `✅ *RECOVERED — ${m.flag} ${m.name}*\n*Signal:* Downdetector Complaints back to normal`,
                },
              },
              {
                type: "context",
                elements: [{ type: "mrkdwn", text: `Bodaphone NOC · Service Monitor · ${ts} UTC` }],
              },
            ],
          }],
        });
      }
    }
  }
}

// ── Ticket link block helper ──────────────────────────────────────────────────
function ticketLinkBlock(ticketId) {
  if (!ticketId) return null;
  const url = `${FRONTEND_URL}/#ticket=${encodeURIComponent(ticketId)}`;
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `🎫 *<${url}|View Ticket ${ticketId} →>*`,
    },
  };
}

// ── BGP Hijack Candidates ─────────────────────────────────────────────────────
// Track last known hijack count per market to detect new candidates.
const prevHijackCount = new Map();

/**
 * Check RIS Live hijack candidates and alert on new detections.
 * Calls createTicketFn(marketId, candidate[]) → Promise<ticketId|null> to
 * auto-create a ticket before posting to Slack.
 *
 * @param {Array} markets - from getNetworkHealth()
 * @param {Function} createTicketFn - async (market, candidates) => ticketId
 */
export async function checkHijackCandidates(markets, createTicketFn) {
  if (!WEBHOOK_URL) return;

  const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  for (const m of markets) {
    const count = m.ris?.hijackCandidateCount ?? 0;
    const prev  = prevHijackCount.get(m.id) ?? 0;
    prevHijackCount.set(m.id, count);

    if (count <= prev || count === 0) continue; // no new candidates

    const muteKey = `hijack::${m.id}`;
    if (isMuted(muteKey)) continue;
    lastSent.set(muteKey, Date.now());

    const candidates = m.ris?.recentHijackCandidates || [];
    const newest     = candidates[0];

    // Auto-create ticket
    let ticketId = null;
    if (typeof createTicketFn === "function") {
      ticketId = await createTicketFn(m, candidates).catch(() => null);
    }

    const prefixText = newest
      ? `*Prefix:* \`${newest.prefix}\`  ·  *Origin ASN:* AS${newest.originAsn} (expected AS${newest.matchedAsn})`
      : `${count} candidate${count !== 1 ? "s" : ""} detected`;

    const blocks = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `🚨 *BGP HIJACK CANDIDATE — ${m.flag} ${m.name}*\n${prefixText}\n_Origin ASN is not a known Vodafone AS — review immediately_`,
        },
      },
    ];

    const link = ticketLinkBlock(ticketId);
    if (link) blocks.push(link);

    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `Bodaphone NOC · RIS Live · ${ts} UTC · ${count} total candidate${count !== 1 ? "s" : ""}` }],
    });

    await post({ attachments: [{ color: "#dc2626", blocks }] });
  }
}

// ── Simulation helper (for /api/control/notifier/simulate) ───────────────────
/**
 * Post a synthetic Slack alert that looks exactly like a real one.
 * Used to demo / verify alert formatting without waiting for a real incident.
 *
 * @param {{ type: "warning"|"outage"|"recovery", signal: "atlas"|"bgp"|"dns"|"svc",
 *            market: { id, name, flag }, detail?: string }} opts
 */
export async function simulateAlert({ type, signal, market, detail = "", ticketId = null }) {
  const signalLabels = {
    atlas: "ICMP Latency (RIPE Atlas)",
    bgp:   "BGP Visibility",
    dns:   "DNS RTT",
    svc:   "Downdetector Complaints",
  };
  const label = signalLabels[signal] || signal;
  const ts    = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  if (type === "recovery") {
    await post({
      attachments: [{
        color: "#16a34a",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ *RECOVERED — ${market.flag} ${market.name}*\n*Signal:* ${label} back to normal`,
            },
          },
          {
            type: "context",
            elements: [{ type: "mrkdwn", text: `Bodaphone NOC · Simulation · ${ts} UTC` }],
          },
        ],
      }],
    });
    return;
  }

  const isOutage = type === "outage";
  const emoji    = isOutage ? "🔴" : "🟠";
  const color    = isOutage ? "#dc2626" : "#f59e0b";
  const severity = isOutage ? "OUTAGE" : "WARNING";

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${severity} — ${market.flag} ${market.name}*\n*Signal:* ${label}${detail ? `  ·  ${detail}` : ""}`,
      },
    },
  ];
  const link = ticketLinkBlock(ticketId);
  if (link) blocks.push(link);
  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: `Bodaphone NOC · Simulation · ${ts} UTC` }],
  });
  await post({ attachments: [{ color, blocks }] });
}

// ── Cloud Dependency Status transitions ──────────────────────────────────────
// Key: "cloud::providerId"  →  last known status ("ok" | "warning" | "outage")
const prevCloudStatus = new Map();

/**
 * Check cloud provider statuses and notify on status changes.
 * Fires Slack alert + auto-creates ticket on degradation.
 *
 * @param {{ id, name, icon, cat, status, description, activeIncidents[] }[]} providers
 * @param {Function} [createTicketFn] - async (provider, status) => ticketId
 */
export async function checkCloudHealth(providers, createTicketFn) {
  if (!WEBHOOK_URL && typeof createTicketFn !== "function") return;

  const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  for (const p of providers) {
    if (!p.status || p.status === "unknown") continue;

    const key  = `cloud::${p.id}`;
    const prev = prevCloudStatus.get(key) || "ok";

    // Degradation: ok→warning, ok→outage, warning→outage
    const degraded = (prev === "ok"      && (p.status === "warning" || p.status === "outage"))
                  || (prev === "warning" && p.status === "outage");

    // Recovery
    const recovered = (prev === "warning" || prev === "outage") && p.status === "ok";

    prevCloudStatus.set(key, p.status);

    if (degraded) {
      const muteKey = `cloud-mute::${p.id}`;
      if (isMuted(muteKey)) continue;
      lastSent.set(muteKey, Date.now());

      const isOutage  = p.status === "outage";
      const emoji     = isOutage ? "🔴" : "🟠";
      const color     = isOutage ? "#dc2626" : "#f59e0b";
      const severity  = isOutage ? "OUTAGE" : "WARNING";

      // Auto-create ticket
      let ticketId = null;
      if (typeof createTicketFn === "function") {
        ticketId = await createTicketFn(p, p.status).catch(() => null);
      }

      if (WEBHOOK_URL) {
        const incident = p.activeIncidents?.[0];
        const detail   = incident ? incident.name : p.description;

        const blocks = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${emoji} *${severity} — ${p.icon} ${p.name}*\n*Signal:* Cloud Dependency${detail ? `  ·  ${detail}` : ""}`,
            },
          },
        ];
        const link = ticketLinkBlock(ticketId);
        if (link) blocks.push(link);
        blocks.push({
          type: "context",
          elements: [{ type: "mrkdwn", text: `Bodaphone NOC · Cloud Health · ${ts} UTC · ${p.cat?.toUpperCase() || "CLOUD"}` }],
        });
        await post({ attachments: [{ color, blocks }] });
      }
    }

    if (recovered) {
      if (WEBHOOK_URL) {
        await post({
          attachments: [{
            color: "#16a34a",
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `✅ *RECOVERED — ${p.icon} ${p.name}*\n*Signal:* Cloud Dependency back to normal`,
                },
              },
              {
                type: "context",
                elements: [{ type: "mrkdwn", text: `Bodaphone NOC · Cloud Health · ${ts} UTC` }],
              },
            ],
          }],
        });
      }
    }
  }
}

/**
 * Send a test message to verify the webhook is working.
 */
export async function notifyTest() {
  if (!WEBHOOK_URL) {
    console.log("[notifier] SLACK_WEBHOOK_URL not set — test skipped");
    return;
  }
  await post({
    text: "✅ *Bodaphone NOC* — Slack notifications active. You'll receive Critical alerts here.",
  });
  console.log("[notifier] test message sent to Slack");
}
