// ─── Ticketing Router ─────────────────────────────────────────────────────────
// Express router that handles all /api/tickets/* endpoints.
// Connects to Supabase using service key (or anon key as fallback).

import { Router } from "express";
import { createClient } from "@supabase/supabase-js";

// ─── Supabase client ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
} else {
  console.warn("[tickets] WARNING: Supabase env vars not set — ticketing API will return errors");
}

function getDb() {
  if (!supabase) throw new Error("Ticketing service not configured (missing Supabase env vars)");
  return supabase;
}

// ─── Constants ───────────────────────────────────────────────────────────────
export const TICKET_TEAMS = [
  "Core Transport","Voice Core","Data Core","Access","RAN","Cloud",
  "OSS/BSS","Security Ops","Network Engineering","NOC","SAC","Platform Engineering"
];

// SLA matrix — per type + severity (minutes)
const SLA_MATRIX = {
  incident: {
    sev1: { ackMin: 5,    mitigMin: 60,    resolveMin: 240   },
    sev2: { ackMin: 15,   mitigMin: 240,   resolveMin: 480   },
    sev3: { ackMin: 60,   mitigMin: 1440,  resolveMin: 4320  },
    sev4: { ackMin: 240,  mitigMin: 4320,  resolveMin: 10080 },
  },
  problem: {
    sev1: { ackMin: 15,   mitigMin: 240,   resolveMin: 1440  },
    sev2: { ackMin: 60,   mitigMin: 1440,  resolveMin: 4320  },
    sev3: { ackMin: 240,  mitigMin: 10080, resolveMin: 20160 },
    sev4: { ackMin: 1440, mitigMin: 20160, resolveMin: 43200 },
  },
  project: {
    sev1: { ackMin: 240,  mitigMin: 1440,  resolveMin: 7200  },
    sev2: { ackMin: 240,  mitigMin: 1440,  resolveMin: 7200  },
    sev3: { ackMin: 240,  mitigMin: 1440,  resolveMin: 7200  },
    sev4: { ackMin: 240,  mitigMin: 1440,  resolveMin: 7200  },
  },
};

function getSla(ticket) {
  const type = ticket.type || "incident";
  const sev  = ticket.severity || "sev4";
  return (SLA_MATRIX[type] || SLA_MATRIX.incident)[sev] || SLA_MATRIX.incident.sev4;
}

// Legacy flat map (alarm engine + any other callers still use SLA[severity])
const SLA = SLA_MATRIX.incident;

const SEV_MAP = {
  Critical: "sev2",
  Major:    "sev3",
  Warning:  "sev3",
  Minor:    "sev3",
  Info:     "sev4",
};

const TYPE_PREFIX = { incident: "INC", problem: "PRB", project: "PRJ" };

// ─── ID generation ────────────────────────────────────────────────────────────
// Derives next seq from the highest existing id for this type, not seq_number column
// (seq_number may be null on auto-created tickets). Includes 1ms jitter so that
// concurrent calls in the same event-loop tick get different seeds — but the real
// fix is to call this sequentially, not in parallel.
async function generateTicketId(type) {
  const db = getDb();
  const prefix = TYPE_PREFIX[type] || "TKT";
  const pattern = `BNOC-${prefix}-%`;

  const { data } = await db
    .from("tickets")
    .select("id")
    .like("id", pattern)
    .order("id", { ascending: false })
    .limit(1);

  let nextSeq = 1;
  if (data && data.length > 0) {
    const last = data[0].id; // e.g. "BNOC-INC-00000043"
    const num = parseInt(last.split("-").pop(), 10);
    if (!isNaN(num)) nextSeq = num + 1;
  }
  return `BNOC-${prefix}-${String(nextSeq).padStart(8, "0")}`;
}

// ─── Sub-status computation ───────────────────────────────────────────────────
function computeSubStatus(ticket) {
  const sla = getSla(ticket);
  const now = Date.now();
  const createdMs = new Date(ticket.created_at).getTime();
  const minutesSinceCreated = (now - createdMs) / 60000;

  // Assigned but not acknowledged past ack deadline
  if (ticket.status === "assigned" && !ticket.acknowledged_at) {
    if (minutesSinceCreated > sla.ackMin) return "assigned_unacknowledged";
  }

  // Check SLA at risk (>75% of resolve time consumed) or breached
  if (!["resolved", "closed"].includes(ticket.status)) {
    const pct = minutesSinceCreated / sla.resolveMin;
    if (minutesSinceCreated >= sla.resolveMin) return "breached";
    if (pct >= 0.75) return "sla_at_risk";
  }

  return null;
}

// ─── Auto-insert event helper ──────────────────────────────────────────────────
async function insertEvent(ticketId, eventType, actorName, actorId, content, metadata = {}) {
  const db = getDb();
  const { data, error } = await db
    .from("ticket_events")
    .insert({ ticket_id: ticketId, event_type: eventType, actor_name: actorName, actor_id: actorId, content, metadata })
    .select()
    .single();
  if (error) console.error("[tickets] insertEvent error:", error.message);
  return data;
}

// ─── Router ───────────────────────────────────────────────────────────────────
const router = Router();

// ── x-api-key middleware (automation-facing endpoints only) ──────────────────
// No-op if AUTOMATION_API_KEY env var is not set (dev mode).
// When set, requires header `x-api-key: <key>` to match.
function requireAutomationKey(req, res, next) {
  const expected = process.env.AUTOMATION_API_KEY;
  if (!expected) return next(); // dev: no key configured → allow
  const provided = req.get("x-api-key");
  if (provided && provided === expected) return next();
  return res.status(401).json({ error: "Invalid or missing x-api-key header" });
}

// ── POST /api/tickets ─────────────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const db = getDb();
    const {
      type, title, severity, owner_name, owner_id, team, description,
      impacted_services, impacted_nodes, country, alarm_id, alarm_type,
      parent_id, tags, actor_name,
    } = req.body;

    if (!type || !title) {
      return res.status(400).json({ error: "type and title are required" });
    }
    if (!["incident","problem","project"].includes(type)) {
      return res.status(400).json({ error: "type must be incident, problem, or project" });
    }

    // Validate parent_id: must exist
    if (parent_id) {
      const { data: parent, error: pErr } = await db
        .from("tickets").select("id").eq("id", parent_id).maybeSingle();
      if (pErr || !parent) {
        return res.status(400).json({ error: `Parent ticket ${parent_id} not found` });
      }
    }

    const id = await generateTicketId(type);

    const { data: ticket, error } = await db
      .from("tickets")
      .insert({
        id, type, title, severity, status: "new",
        source: "manual",
        owner_id: owner_id || null,
        owner_name: owner_name || null,
        team: team || "Core Transport",
        description: description || null,
        impacted_services: impacted_services || [],
        impacted_nodes: impacted_nodes || [],
        country: country || null,
        alarm_id: alarm_id || null,
        alarm_type: alarm_type || null,
        parent_id: parent_id || null,
        tags: tags || [],
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Auto-create 'created' event
    await insertEvent(id, "created", actor_name || "System", owner_id || null, `Ticket created: ${title}`);

    // Cross-events when child ticket is created
    if (parent_id) {
      await insertEvent(id, "parent_linked", "System", null,
        `Created as child of ${parent_id}`,
        { parent_id });
      await insertEvent(parent_id, "child_created", actor_name || "System", owner_id || null,
        `Child ticket ${id} created${team ? ` — ${team}` : ""}`,
        { child_id: id, child_type: type, child_team: team || null });
    }

    res.status(201).json(ticket);
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    console.error("[tickets] POST / error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/tickets/sla — must come before /:id ──────────────────────────────
router.get("/sla", async (req, res) => {
  try {
    const db = getDb();
    const { data: tickets, error } = await db
      .from("tickets")
      .select("*")
      .not("status", "in", "(resolved,closed)")
      .not("severity", "is", null);

    if (error) return res.status(500).json({ error: error.message });

    const now = Date.now();
    const result = (tickets || []).map(t => {
      const sla = getSla(t);
      const createdMs = new Date(t.created_at).getTime();
      const minutesElapsed = (now - createdMs) / 60000;
      const resolveDeadlineMs = createdMs + sla.resolveMin * 60000;
      const timeRemainingMin = (resolveDeadlineMs - now) / 60000;
      const pct = minutesElapsed / sla.resolveMin;

      let sla_status = null;
      if (minutesElapsed >= sla.resolveMin) sla_status = "breached";
      else if (pct >= 0.75) sla_status = "at_risk";
      else return null; // not at risk

      return { ...t, sla_status, time_remaining_min: Math.round(timeRemainingMin), sub_status: computeSubStatus(t) };
    }).filter(Boolean);

    res.json(result);
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/tickets ───────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const db = getDb();
    const { type, status, severity, country, node, owner_name, team, sla_at_risk, alarm_type } = req.query;

    let query = db.from("tickets").select("*").order("created_at", { ascending: false });

    if (type) query = query.eq("type", type);
    if (severity) query = query.eq("severity", severity);
    if (country) query = query.eq("country", country);
    if (owner_name) query = query.eq("owner_name", owner_name);
    if (team) query = query.eq("team", team);
    if (alarm_type) query = query.eq("alarm_type", alarm_type);

    // Status can be comma-separated
    if (status) {
      const statuses = status.split(",").map(s => s.trim());
      if (statuses.length === 1) query = query.eq("status", statuses[0]);
      else query = query.in("status", statuses);
    }

    // node searches impacted_nodes array
    if (node) query = query.contains("impacted_nodes", [node]);

    const { data: tickets, error } = await query;
    if (error) return res.status(500).json({ error: error.message });

    let result = (tickets || []).map(t => ({ ...t, sub_status: computeSubStatus(t) }));

    // Filter by sla_at_risk if requested
    if (sla_at_risk === "true") {
      result = result.filter(t => t.sub_status === "sla_at_risk" || t.sub_status === "breached");
    }

    res.json(result);
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/tickets/:id ───────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const [{ data: ticket, error: tErr }, { data: events, error: eErr }, { data: evidence, error: evErr }] =
      await Promise.all([
        db.from("tickets").select("*").eq("id", id).single(),
        db.from("ticket_events").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
        db.from("ticket_evidence").select("*").eq("ticket_id", id).order("created_at", { ascending: true }),
      ]);

    if (tErr) return res.status(tErr.code === "PGRST116" ? 404 : 500).json({ error: tErr.message });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.json({ ...ticket, sub_status: computeSubStatus(ticket), events: events || [], evidence: evidence || [] });
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/tickets/:id/children ─────────────────────────────────────────────
router.get("/:id/children", async (req, res) => {
  try {
    const db = getDb();
    const { data, error } = await db
      .from("tickets")
      .select("*")
      .eq("parent_id", req.params.id)
      .order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json((data || []).map(t => ({ ...t, sub_status: computeSubStatus(t) })));
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── PATCH /api/tickets/:id ────────────────────────────────────────────────────
router.patch("/:id", async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { status, owner_name, owner_id, team, title, severity, description, tags,
            closure_code, resolution_summary, related_change_id, actor_name } = req.body;

    // Fetch current ticket to check existing timestamps
    const { data: current, error: fetchErr } = await db.from("tickets").select("*").eq("id", id).single();
    if (fetchErr || !current) return res.status(404).json({ error: "Ticket not found" });

    // Guard: closing a parent with open children requires explicit confirmation (?force=true)
    const isClosing = status && ["resolved","closed"].includes(status) && !["resolved","closed"].includes(current.status);
    if (isClosing && req.query.force !== "true") {
      const { data: openChildren } = await db
        .from("tickets").select("id,title,status,team")
        .eq("parent_id", id)
        .not("status", "in", "(resolved,closed)");
      if (openChildren && openChildren.length > 0) {
        return res.status(409).json({
          error: `This ticket has ${openChildren.length} open child ticket(s). Close them first or confirm with ?force=true.`,
          open_children: openChildren,
        });
      }
    }

    const updates = {};
    const now = new Date().toISOString();

    if (status !== undefined) updates.status = status;
    if (owner_name !== undefined) updates.owner_name = owner_name;
    if (owner_id !== undefined) updates.owner_id = owner_id;
    if (team !== undefined) updates.team = team;
    if (title !== undefined) updates.title = title;
    if (severity !== undefined) updates.severity = severity;
    if (description !== undefined) updates.description = description;
    if (tags !== undefined) updates.tags = tags;
    if (closure_code !== undefined) updates.closure_code = closure_code;
    if (resolution_summary !== undefined) updates.resolution_summary = resolution_summary;
    if (related_change_id !== undefined) updates.related_change_id = related_change_id;

    // Auto-set timestamps based on status transitions
    if (status === "assigned" && !current.assigned_at) updates.assigned_at = now;
    if (status === "in_progress" && !current.acknowledged_at) updates.acknowledged_at = now;
    if (status === "mitigated" && !current.mitigated_at) updates.mitigated_at = now;
    if (status === "resolved" && !current.resolved_at) updates.resolved_at = now;
    if (status === "closed" && !current.closed_at) updates.closed_at = now;

    const { data: updated, error: upErr } = await db
      .from("tickets")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (upErr) return res.status(500).json({ error: upErr.message });

    // Auto-insert event
    let eventType = "updated";
    let content = "Ticket updated";
    if (status && status !== current.status) {
      eventType = "status_change";
      content = `Status changed from ${current.status} to ${status}`;
    } else if ((owner_name && owner_name !== current.owner_name) || (owner_id && owner_id !== current.owner_id)) {
      eventType = "assignment";
      content = `Assigned to ${owner_name || owner_id}`;
    }

    await insertEvent(id, eventType, actor_name || "System", owner_id || null, content);

    res.json({ ...updated, sub_status: computeSubStatus(updated) });
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tickets/:id/events ──────────────────────────────────────────────
router.post("/:id/events", async (req, res) => {
  try {
    const db = getDb();
    const { event_type, content, actor_name, actor_id, metadata } = req.body;
    if (!event_type) return res.status(400).json({ error: "event_type is required" });

    const { data, error } = await db
      .from("ticket_events")
      .insert({ ticket_id: req.params.id, event_type, content, actor_name, actor_id, metadata: metadata || {} })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tickets/:id/notes ───────────────────────────────────────────────
// Clean alias for external automation (Camunda, Nagios, Ansible). Inserts a
// ticket_events row with event_type="automation_note" so it renders in the
// Worklog tab of TicketDetailView (🤖 icon, blue tint). Protected by x-api-key
// when AUTOMATION_API_KEY is set in the environment.
//
// Body: { content: string, source?: string, metadata?: object }
//   - content  : markdown/plain text (required). Rendered as pre-wrap.
//   - source   : human label shown as the event author (e.g. "Camunda — Node Health Check")
//   - metadata : free-form JSON. TicketDetailView surfaces `source`, `workflow_id`, `node` as pills.
router.post("/:id/notes", requireAutomationKey, async (req, res) => {
  try {
    const db = getDb();
    const { content, source, metadata } = req.body || {};
    if (!content || typeof content !== "string") {
      return res.status(400).json({ error: "content is required (string)" });
    }

    // Ticket must exist — fail clearly if not
    const { data: ticket, error: tErr } = await db.from("tickets").select("id").eq("id", req.params.id).maybeSingle();
    if (tErr) return res.status(500).json({ error: tErr.message });
    if (!ticket) return res.status(404).json({ error: `Ticket ${req.params.id} not found` });

    // Fold `source` into metadata so the UI can show it as a pill even if omitted
    const md = { ...(metadata && typeof metadata === "object" ? metadata : {}) };
    if (source && !md.source) md.source = source;

    const { data, error } = await db
      .from("ticket_events")
      .insert({
        ticket_id: req.params.id,
        event_type: "automation_note",
        actor_name: source || "Automation",
        actor_id: null,
        content,
        metadata: md,
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tickets/:id/evidence ────────────────────────────────────────────
router.post("/:id/evidence", async (req, res) => {
  try {
    const db = getDb();
    const { type, label, url, metadata, uploaded_by } = req.body;
    if (!type || !label) return res.status(400).json({ error: "type and label are required" });

    const { data, error } = await db
      .from("ticket_evidence")
      .insert({ ticket_id: req.params.id, type, label, url, metadata: metadata || {}, uploaded_by })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Add timeline event
    await insertEvent(req.params.id, "evidence_added", uploaded_by || "System", null, `Evidence added: ${label} (${type})`);

    res.status(201).json(data);
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/tickets/:id — hard delete ticket + events + evidence ──────────
router.delete("/:id", async (req, res) => {
  try {
    const db = getDb();
    const id = req.params.id;

    // Verify ticket exists
    const { data: ticket, error: fetchErr } = await db
      .from("tickets")
      .select("id, title")
      .eq("id", id)
      .single();

    if (fetchErr || !ticket) return res.status(404).json({ error: "Ticket not found" });

    // Delete child records first (FK may not have CASCADE)
    await db.from("ticket_events").delete().eq("ticket_id", id);
    await db.from("ticket_evidence").delete().eq("ticket_id", id);

    // Delete ticket
    const { error } = await db.from("tickets").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });

    res.json({ ok: true, id, title: ticket.title });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/tickets/:id/evidence/:evidenceId ──────────────────────────────
router.delete("/:id/evidence/:evidenceId", async (req, res) => {
  try {
    const db = getDb();
    const { data: ev, error: fetchErr } = await db
      .from("ticket_evidence")
      .select("label, type, uploaded_by")
      .eq("id", req.params.evidenceId)
      .eq("ticket_id", req.params.id)
      .single();

    if (fetchErr || !ev) return res.status(404).json({ error: "Evidence not found" });

    const { error } = await db
      .from("ticket_evidence")
      .delete()
      .eq("id", req.params.evidenceId);

    if (error) return res.status(500).json({ error: error.message });

    await insertEvent(req.params.id, "updated", ev.uploaded_by || "System", null, `Evidence removed: ${ev.label} (${ev.type})`);

    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/tickets/:id/evidence/upload ─────────────────────────────────────
// MVP: stores file metadata + external URL. If Supabase Storage is not configured,
// stores as a link type evidence record.
router.post("/:id/evidence/upload", async (req, res) => {
  try {
    const db = getDb();
    const { label, url, uploaded_by } = req.body;
    if (!url) return res.status(400).json({ error: "url is required (use external link for MVP)" });

    const { data, error } = await db
      .from("ticket_evidence")
      .insert({ ticket_id: req.params.id, type: "link", label: label || url, url, uploaded_by })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    await insertEvent(req.params.id, "evidence_added", uploaded_by || "System", null, `Link added: ${label || url}`);
    res.status(201).json(data);
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// ─── Troubleshooting worklog builder ─────────────────────────────────────────
function buildTroubleshootingNote(alarm, nodeMeta) {
  const ts = new Date().toISOString();
  const node = alarm.nodeId;
  const loc = nodeMeta?.country ? `${nodeMeta.country}` : "unknown location";
  const role = nodeMeta?.role || nodeMeta?.type || "network node";

  const lines = [
    `**Auto-generated troubleshooting guide** — ${ts}`,
    `**Node:** ${node} | **Location:** ${loc} | **Role:** ${role}`,
    `**Alarm:** ${alarm.message || alarm.type} | **Severity:** ${alarm.severity}`,
    "",
  ];

  const type = alarm.type || "";

  if (type === "PERFORMANCE" || type.includes("CPU")) {
    const val = alarm.metric != null ? ` (current: ${alarm.metric}%)` : "";
    lines.push(
      `**CPU alert${val}** — Recommended steps:`,
      `1. SSH to node and run \`top -bn1 | head -20\` to identify the top consumer process`,
      `2. Check for runaway daemons: \`ps aux --sort=-%cpu | head -10\``,
      `3. Review recent config pushes or scheduled jobs that may have triggered high load`,
      `4. If CPU > 95% for > 5 min and node is unresponsive, consider failover`,
      `5. Check correlated alarms — high CPU during a BGP reconvergence is expected and transient`,
    );
  } else if (type === "MEMORY") {
    const val = alarm.metric != null ? ` (current: ${alarm.metric}%)` : "";
    lines.push(
      `**Memory alert${val}** — Recommended steps:`,
      `1. Run \`free -h\` and \`vmstat -s\` to see memory breakdown`,
      `2. Check for memory leaks: \`ps aux --sort=-%mem | head -10\``,
      `3. Review routing table size — FIB bloat is a common cause on edge routers`,
      `4. If swap is in use, node is at risk of OOM — consider emergency maintenance window`,
    );
  } else if (type === "TEMPERATURE" || type.includes("TEMP")) {
    const val = alarm.metric != null ? ` (current: ${alarm.metric}°C)` : "";
    lines.push(
      `**Temperature alert${val}** — Recommended steps:`,
      `1. Verify data centre HVAC is functioning — check cooling unit status`,
      `2. Check fan speeds via SNMP OID or IPMI: \`ipmitool sensor list | grep Fan\``,
      `3. If temperature > 75°C, initiate graceful failover and notify DC team`,
      `4. Check neighbouring racks for hot-spot propagation`,
    );
  } else if (type === "REACHABILITY") {
    lines.push(
      `**Node unreachable** — Recommended steps:`,
      `1. Ping from a different vantage point to confirm it is not a path issue`,
      `2. Check management plane: try SSH via out-of-band (console server / IPMI)`,
      `3. Verify upstream interface state: \`show interfaces brief\``,
      `4. Check for recent planned maintenance or change in BNOC that may explain the outage`,
      `5. If unreachable via both OOB and production, escalate to on-site field team`,
    );
  } else if (type === "INTERFACE") {
    lines.push(
      `**Interface down** — Recommended steps:`,
      `1. Identify the affected interface from the alarm detail`,
      `2. Check physical layer: \`show interface <if> | grep line\``,
      `3. Verify SFP/cable — check error counters for input errors or CRC`,
      `4. Confirm with peer device that the far-end port is up`,
      `5. If this interface carries customer traffic, open a P1 with the transit provider`,
    );
  } else if (type === "BGP") {
    lines.push(
      `**BGP peer down** — Recommended steps:`,
      `1. Identify which peer session dropped from the alarm detail`,
      `2. Check BGP state: \`show bgp neighbor <peer> | grep state\``,
      `3. Review BGP logs for NOTIFICATION messages — they carry the error code`,
      `4. Verify TCP connectivity to the peer on port 179`,
      `5. Check for AS-PATH or prefix-limit policy changes that may have triggered a reset`,
      `6. Correlate with RIPE RIS Live withdrawals in Network Health → Signal Fusion`,
    );
  } else if (type === "NETWORK_ATLAS") {
    lines.push(
      `**RIPE Atlas ICMP latency degradation** — Recommended steps:`,
      `1. Review the Atlas RTT ratio trend in BNOC Network Health → this market's Atlas chart`,
      `2. Check if degradation is probe-wide or isolated to specific ASNs / probe locations`,
      `3. Compare with BGP visibility and DNS RTT for the same market — co-degradation indicates broader issue`,
      `4. If widespread, look for routing anomalies in Signal Fusion → RIS Live column`,
      `5. Check for planned or emergency maintenance in BNOC Change Management for this market`,
    );
  } else if (type === "NETWORK_BGP") {
    lines.push(
      `**BGP visibility degradation (RIPE Stat)** — Recommended steps:`,
      `1. Check RIPE Stat routing status for this ASN: https://stat.ripe.net/app/launchpad`,
      `2. Review BGP visibility % trend in Network Health → BGP chart`,
      `3. Look for prefix withdrawal spikes in Signal Fusion → RIS Live column`,
      `4. Verify RPKI ROAs are valid for the affected prefixes`,
      `5. If peers are dropping: check for route filter changes or session resets with upstream providers`,
    );
  } else if (type === "NETWORK_DNS") {
    lines.push(
      `**DNS RTT degradation (RIPE Atlas)** — Recommended steps:`,
      `1. Review DNS RTT ratio trend in Network Health → DNS chart`,
      `2. Check if RIPE Atlas DNS probes are concentrated in a specific geography or ASN`,
      `3. Verify authoritative DNS server availability — test SOA query response times`,
      `4. Cross-reference with Atlas ICMP latency: if both degrade, suspect a broader infrastructure issue`,
      `5. Check for DNS amplification or volumetric attack patterns if RTT is extremely high`,
    );
  } else if (type === "DOWNDETECTOR") {
    lines.push(
      `**Downdetector complaint surge** — Recommended steps:`,
      `1. Review the Service Monitor chart in BNOC for this market's complaint trend and ratio`,
      `2. Check Downdetector directly for the affected services (mobile, internet, TV)`,
      `3. Correlate with Network Health signals — is there a matching Atlas / BGP degradation?`,
      `4. Check social media (Twitter/X) and operator status pages for public announcements`,
      `5. Initiate customer impact assessment — triage to the appropriate service team`,
    );
  } else if (type === "IODA_OUTAGE") {
    lines.push(
      `**CAIDA IODA outage event** — Recommended steps:`,
      `1. Review IODA dashboard for this market/ASN: https://ioda.live`,
      `2. Check both BGP score and ping-slash24 signals — are both degraded?`,
      `3. BGP-only drop → routing issue; ping-slash24 drop → confirmed reachability loss`,
      `4. Check event duration — transient (< 5 min) events are often false positives`,
      `5. Correlate with RIPE Atlas ICMP and Downdetector to assess customer impact`,
    );
  } else if (type === "RADAR_ALERT") {
    lines.push(
      `**Cloudflare Radar BGP event** — Recommended steps:`,
      `1. Check Cloudflare Radar for BGP hijack/leak events: https://radar.cloudflare.com/routing`,
      `2. Review the specific prefixes and originating ASNs involved in the event`,
      `3. Determine if Vodafone is the victim (hijack) or source (route leak) of the anomaly`,
      `4. For a confirmed hijack: coordinate with Cloudflare and upstream transit providers immediately`,
      `5. For a route leak: identify the originating router and apply emergency route filters`,
    );
  } else if (type === "HIJACK") {
    lines.push(
      `**BGP hijack candidate (RIS Live)** — Recommended steps:`,
      `1. Review hijack candidates in BNOC Network Health → this market → Hijack Candidates`,
      `2. Verify the origin ASN against known Vodafone ASNs and CDN/transit partners`,
      `3. Check RIPE Stat for the affected prefix: https://stat.ripe.net/`,
      `4. Check BGP.HE.NET for the originating AS: https://bgp.he.net/`,
      `5. If confirmed hijack: notify NOC leadership and upstream transit providers immediately`,
      `6. Document the affected prefix, origin ASN, and timeline in this ticket's worklog`,
    );
  } else {
    lines.push(
      `**General alert** — Recommended first steps:`,
      `1. Verify node is reachable via ICMP and management plane`,
      `2. Review recent changes in BNOC Change Management for this node or its upstream`,
      `3. Check correlated alarms on peer nodes in the same site`,
    );
  }

  lines.push(
    "",
    `**Data sources to check:**`,
    `- BNOC Network Health → Signal Fusion (cross-signal correlation)`,
    `- RIPE Atlas: latency trend for this market`,
    `- RIPE RIS Live: recent BGP withdrawals from this ASN`,
    `- Downdetector: community complaints spike for this market`,
  );

  return lines.join("\n");
}

// ─── Auto-create ticket from alarm ───────────────────────────────────────────
export async function autoCreateTicketFromAlarm(alarm, nodeMeta) {
  if (!supabase) return null; // tickets service not configured

  try {
    const db = getDb();
    const severity = SEV_MAP[alarm.severity] || "sev3";
    const alarmType = alarm.type || "UNKNOWN";
    const nodeId = alarm.nodeId;

    // Dedup check 1: existing OPEN ticket for same alarm_type + node → re-fire
    const { data: existing } = await db
      .from("tickets")
      .select("id, status")
      .eq("alarm_type", alarmType)
      .contains("impacted_nodes", [nodeId])
      .not("status", "in", "(resolved,closed)")
      .limit(1);

    if (existing && existing.length > 0) {
      const existingTicket = existing[0];
      await insertEvent(
        existingTicket.id, "alarm_linked", "System", null,
        `Alarm re-fired: ${alarm.message || alarmType} on ${nodeId}`,
        { alarm_id: alarm.id, alarm_severity: alarm.severity, refire: true }
      );
      return existingTicket;
    }

    // Dedup check 2: recently closed/resolved ticket (< 2h) → reopen
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await db
      .from("tickets")
      .select("id, status, closed_at, resolved_at")
      .eq("alarm_type", alarmType)
      .contains("impacted_nodes", [nodeId])
      .in("status", ["resolved", "closed"])
      .gte("updated_at", twoHoursAgo)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (recent && recent.length > 0) {
      const t = recent[0];
      await db.from("tickets").update({ status: "in_progress", resolved_at: null, closed_at: null }).eq("id", t.id);
      await insertEvent(
        t.id, "alarm_linked", "System", null,
        `Ticket reopened: same alarm re-fired within 2h — ${alarm.message || alarmType}`,
        { alarm_id: alarm.id, alarm_severity: alarm.severity, refire: true, reopened: true }
      );
      return t;
    }

    // Build a clear, structured title
    const alarmTypeLabel = alarmType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const locationSuffix = nodeMeta?.country ? ` — ${nodeMeta.country}` : "";
    const title = alarm.message
      ? `${alarm.message}${locationSuffix}`
      : `${alarm.severity} ${alarmTypeLabel} on ${nodeId}${locationSuffix}`;

    // Build a structured description with context
    const nodeRole = nodeMeta?.role || nodeMeta?.type || "network node";
    const description = [
      `**Alarm triggered at:** ${new Date().toISOString()}`,
      `**Node:** ${nodeId} (${nodeRole}${locationSuffix})`,
      `**Alarm type:** ${alarmTypeLabel} | **Severity:** ${alarm.severity}`,
      alarm.message ? `**Detail:** ${alarm.message}` : null,
      alarm.metric != null ? `**Metric value at trigger:** ${alarm.metric}` : null,
      "",
      `This ticket was auto-created by the BNOC alarm engine. `,
      `Review the worklog tab for troubleshooting steps specific to this alarm type.`,
    ].filter(Boolean).join("\n");

    const id = await generateTicketId("incident");

    const { data: ticket, error } = await db
      .from("tickets")
      .insert({
        id, type: "incident", title, severity, status: "new",
        description,
        source: "alarm",
        team: "Core Transport",
        country: nodeMeta?.country || null,
        impacted_nodes: [nodeId],
        impacted_services: alarm.affectedServices || [],
        alarm_id: alarm.id,
        alarm_type: alarmType,
      })
      .select()
      .single();

    if (error) {
      console.error("[tickets] autoCreate error:", error.message);
      return null;
    }

    // Created event
    await insertEvent(id, "created", "System", null,
      `Ticket auto-created from ${alarm.severity} ${alarmTypeLabel} alarm on ${nodeId}`,
      { alarm_id: alarm.id, alarm_severity: alarm.severity, node: nodeId }
    );

    // Troubleshooting worklog — structured guide for the responding engineer
    const tsNote = buildTroubleshootingNote(alarm, nodeMeta);
    await insertEvent(id, "worklog", "BNOC Automation", null, tsNote,
      { source: "alarm-engine", alarm_type: alarmType, node: nodeId }
    );

    return ticket;
  } catch (e) {
    console.error("[tickets] autoCreateTicketFromAlarm error:", e.message);
    return null;
  }
}

// ── POST /api/tickets/demo — seed realistic demo tickets ──────────────────────
router.post("/demo", async (req, res) => {
  try {
    const db = getDb();
    const now = Date.now();
    const ago = (h) => new Date(now - h * 3600000).toISOString();

    // Delete existing demo tickets first (tagged with demo:true in tags)
    await db.from("tickets").delete().contains("tags", ["demo"]);

    const DEMO_TICKETS = [
      // ── 10 Problems ────────────────────────────────────────────────────────
      {
        type:"problem", severity:"sev2",
        title:"BGP route oscillation causing intermittent path instability on fj-suva-cr-01",
        description:"BGP sessions are flapping every 15–20 minutes between fj-suva-cr-01 and its upstream peers, triggering route withdrawals and re-advertisements. Root cause under investigation.",
        status:"in_progress", owner_name:"Alex Torres", team:"Core Transport",
        impacted_nodes:["fj-suva-cr-01"], country:"FJ", created_at: ago(72),
      },
      {
        type:"problem", severity:"sev1",
        title:"Recurring packet loss on trans-Pacific link fj-suva → hw-hnl1",
        description:"30–40% packet loss observed in 10-minute bursts every ~2h on the trans-Pacific segment. Correlated with high CPU on fj-suva-cr-01 during BGP convergence. Possible queue starvation.",
        status:"in_progress", owner_name:"Ivan M.", team:"Core Transport",
        impacted_nodes:["fj-suva-cr-01","hw-hnl1-cr-01"], country:"FJ", created_at: ago(6),
      },
      {
        type:"problem", severity:"sev2",
        title:"Memory leak in MPLS FIB table on hw-hnl1-pe-01 after software upgrade",
        description:"Following the v15.4 software upgrade, hw-hnl1-pe-01 shows a steady memory increase of ~0.8% per hour in MPLS FIB. No traffic impact yet but node will require reload if unresolved.",
        status:"assigned", owner_name:"Davide Z.", team:"Data Core",
        impacted_nodes:["hw-hnl1-pe-01"], country:"HW", created_at: ago(48), acknowledged_at: ago(47),
      },
      {
        type:"problem", severity:"sev3",
        title:"OSPF adjacency instability in Access ring — flapping every 4h",
        description:"OSPF adjacencies in the Ibiza access ring are dropping and re-forming. Suspected MTU mismatch or hello/dead timer misconfiguration introduced during last maintenance window.",
        status:"new", owner_name:"Adam S.", team:"Access",
        impacted_nodes:["ib-town-cr-01","ib-town-pe-01"], country:"IB", created_at: ago(24),
      },
      {
        type:"problem", severity:"sev3",
        title:"NTP drift causing log correlation failures across NOC toolset",
        description:"Multiple nodes showing NTP offset > 500ms. This is breaking event correlation in the NOC dashboard — alarm timestamps from different nodes cannot be reliably compared.",
        status:"assigned", owner_name:"Ram", team:"NOC",
        impacted_nodes:[], country:null, created_at: ago(96), acknowledged_at: ago(95),
      },
      {
        type:"problem", severity:"sev2",
        title:"Spanning tree topology change storm on Data Core L2 segment",
        description:"A series of uncontrolled topology changes in the Data Core L2 domain caused a brief broadcast storm. Traffic was restored after disabling the offending port. Root cause: unauthorised device connected to access switch.",
        status:"mitigated", owner_name:"Ivan M.", team:"Data Core",
        impacted_nodes:[], country:null, created_at: ago(120),
      },
      {
        type:"problem", severity:"sev3",
        title:"VLAN mismatch causing intermittent traffic drops on enterprise customer A",
        description:"Customer A is reporting 2–3 minute traffic outages every few hours. Investigation points to a VLAN tag mismatch between two PE handoff interfaces introduced during last patch.",
        status:"in_progress", owner_name:"Alex Torres", team:"Core Transport",
        impacted_nodes:["ib-town-pe-01"], country:"IB", created_at: ago(50),
      },
      {
        type:"problem", severity:"sev1",
        title:"BGP prefix leak from AS64512 propagating to internet peers",
        description:"Customer BGP session (AS64512) is advertising more-specific prefixes that are leaking into upstream transit. Risk of traffic hijacking. Filters applied as emergency mitigation — permanent fix required.",
        status:"in_progress", owner_name:"Chema F.", team:"Core Transport",
        impacted_nodes:["fj-suva-cr-01"], country:"FJ", created_at: ago(2),
      },
      {
        type:"problem", severity:"sev4",
        title:"QoS policy misconfiguration on core PE — EF class not prioritised correctly",
        description:"Traffic engineering review found that the EF (Expedited Forwarding) DSCP queue is not being serviced correctly on three core PE nodes. Voice/video traffic may experience higher jitter under congestion.",
        status:"new", owner_name:"Adam S.", team:"Core Transport",
        impacted_nodes:["hw-hnl1-pe-01","fj-suva-pe-01"], country:null, created_at: ago(168),
      },
      {
        type:"problem", severity:"sev2",
        title:"DNS resolution failures for internal services after resolver config change",
        description:"Internal DNS resolvers are returning NXDOMAIN for some internal hostnames following a config push yesterday. Affects monitoring agents and automation scripts. Public DNS resolution unaffected.",
        status:"new", owner_name:"Davide Z.", team:"Platform Engineering",
        impacted_nodes:[], country:null, created_at: ago(1),
      },

      // ── 3 Requests ──────────────────────────────────────────────────────────
      {
        type:"project", severity:"sev4",
        title:"MPLS core firmware upgrade — Q3 2026 maintenance window request",
        description:"Request to schedule and execute an MPLS core firmware upgrade across all 6 core routers during the next maintenance window. Upgrade addresses 3 CVEs and includes performance improvements for RSVP-TE.",
        status:"new", owner_name:"Matt I.", team:"Core Transport",
        impacted_nodes:["fj-suva-cr-01","hw-hnl1-cr-01","ib-town-cr-01"], country:null, created_at: ago(336),
      },
      {
        type:"project", severity:"sev4",
        title:"New customer VLAN provisioning — Vodafone Enterprise contract expansion",
        description:"New VLAN required for Vodafone Enterprise customer expansion into the Pacific region. Requires provisioning on fj-suva-pe-01 and hw-hnl1-pe-01 with BGP handoff configuration.",
        status:"assigned", owner_name:"Sam Reyes", team:"Data Core",
        impacted_nodes:["fj-suva-pe-01","hw-hnl1-pe-01"], country:"FJ", created_at: ago(240), acknowledged_at: ago(238),
      },
      {
        type:"project", severity:"sev4",
        title:"Pacific Ring capacity review — bandwidth forecast for H2 2026",
        description:"Conduct a capacity review of the Pacific Ring based on current utilisation trends. Deliverable: a capacity report with 6-month forecast, identified congestion points, and upgrade recommendations.",
        status:"in_progress", owner_name:"Alex Torres", team:"Core Transport",
        impacted_nodes:["fj-suva-cr-01","hw-hnl1-cr-01"], country:null, created_at: ago(480),
      },
    ];

    const inserted = [];
    for (const t of DEMO_TICKETS) {
      const id = await generateTicketId(t.type);
      const { data, error } = await db
        .from("tickets")
        .insert({
          id,
          type: t.type,
          title: t.title,
          description: t.description || null,
          severity: t.severity || null,
          status: t.status || "new",
          owner_name: t.owner_name || null,
          team: t.team || "Core Transport",
          impacted_nodes: t.impacted_nodes || [],
          impacted_services: [],
          country: t.country || null,
          tags: ["demo"],
          created_at: t.created_at,
          acknowledged_at: t.acknowledged_at || null,
        })
        .select()
        .single();

      if (error) { console.error("[demo]", error.message); continue; }

      await insertEvent(id, "created", t.owner_name || "System", null,
        `Demo ticket created: ${t.title}`,
        { demo: true }
      );

      // Add a status-transition event for tickets not in 'new'
      if (t.status === "assigned") {
        await insertEvent(id, "status_changed", t.owner_name, null,
          `Assigned to ${t.owner_name}`, { from: "new", to: "assigned" }
        );
      } else if (t.status === "in_progress") {
        await insertEvent(id, "status_changed", t.owner_name, null,
          "Investigation started — working to identify root cause.", { from: "assigned", to: "in_progress" }
        );
      } else if (t.status === "mitigated") {
        await insertEvent(id, "status_changed", t.owner_name, null,
          "Issue mitigated — monitoring for recurrence.", { from: "in_progress", to: "mitigated" }
        );
      }

      inserted.push(data);
    }

    res.json({ inserted: inserted.length, ids: inserted.map(t => t.id) });
  } catch (e) {
    if (e.message.includes("not configured")) return res.status(503).json({ error: e.message });
    console.error("[tickets] demo seed error:", e);
    res.status(500).json({ error: e.message });
  }
});

export default router;
