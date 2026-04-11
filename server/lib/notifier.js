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

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;
const MUTE_MS     = 10 * 60 * 1000; // 10 min cooldown per alarm key

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
 * Check a network health signal and notify if the status degraded.
 * Call after each RIPE/BGP/DNS tick with the full market list from getNetworkHealth().
 *
 * @param {{ id, name, flag, status, ratio, bgp:{status}, dns:{status} }[]} markets
 */
export function checkNetworkHealth(markets) {
  if (!WEBHOOK_URL) return;

  const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  for (const m of markets) {
    const checks = [
      { signal: "atlas", label: "ICMP Latency (RIPE Atlas)", status: m.status,      detail: m.ratio ? `×${m.ratio.toFixed(1)} ratio` : "" },
      { signal: "bgp",   label: "BGP Visibility",            status: m.bgp?.status, detail: m.bgp?.current ? `${m.bgp.current.visibility_pct?.toFixed(1)}% peers` : "" },
      { signal: "dns",   label: "DNS RTT",                   status: m.dns?.status, detail: m.dns?.ratio   ? `×${m.dns.ratio.toFixed(1)} ratio`   : "" },
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

        post({
          attachments: [{
            color,
            blocks: [
              {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: `${emoji} *${severity} — ${m.flag} ${m.name}*\n*Signal:* ${label}${detail ? `  ·  ${detail}` : ""}`,
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

      if (recovered) {
        post({
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
