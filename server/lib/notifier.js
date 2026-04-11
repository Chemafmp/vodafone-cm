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

/**
 * Notify a new alarm. Only fires for Critical severity (for now).
 * @param {{ nodeId, type, severity, message, since }} alarm
 */
export function notifyAlarm(alarm) {
  if (!WEBHOOK_URL) return;
  if (alarm.severity !== "Critical") return;   // ← tune here later

  const key = `${alarm.nodeId}::${alarm.type}`;
  if (isMuted(key)) return;
  lastSent.set(key, Date.now());

  const { emoji, color } = sevMeta(alarm.severity);
  const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  post({
    attachments: [{
      color,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `${emoji} *${alarm.severity} — ${alarm.type}*\n*Node:* \`${alarm.nodeId}\`\n*${alarm.message}*`,
          },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `Bodaphone NOC · ${ts} UTC` }],
        },
      ],
    }],
  });
}

/**
 * Notify a resolved alarm (only if it was Critical — matches notifyAlarm filter).
 * @param {{ nodeId, type, severity, message }} alarm
 */
export function notifyResolved(alarm) {
  if (!WEBHOOK_URL) return;
  if (alarm.severity !== "Critical") return;

  const ts = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });

  post({
    attachments: [{
      color: "#16a34a",
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✅ *RESOLVED — ${alarm.type}*\n*Node:* \`${alarm.nodeId}\`\n*${alarm.message}*`,
          },
        },
        {
          type: "context",
          elements: [{ type: "mrkdwn", text: `Bodaphone NOC · ${ts} UTC` }],
        },
      ],
    }],
  });
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
