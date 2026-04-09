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

const SLA = {
  sev1: { ackMin: 5,   mitigMin: 60,   resolveMin: 240   },
  sev2: { ackMin: 15,  mitigMin: 240,  resolveMin: 480   },
  sev3: { ackMin: 60,  mitigMin: 1440, resolveMin: 4320  },
  sev4: { ackMin: 240, mitigMin: 4320, resolveMin: 10080 },
};

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
  if (!ticket.severity || !SLA[ticket.severity]) return null;
  const sla = SLA[ticket.severity];
  const now = Date.now();
  const createdMs = new Date(ticket.created_at).getTime();
  const minutesSinceCreated = (now - createdMs) / 60000;

  // Assigned but not acknowledged past ack deadline
  if (ticket.status === "assigned" && !ticket.acknowledged_at) {
    if (minutesSinceCreated > sla.ackMin) return "assigned_unacknowledged";
  }

  // Check SLA at risk (>75% of resolve time consumed) or breached
  if (!["resolved", "closed"].includes(ticket.status)) {
    const resolveDeadlineMin = sla.resolveMin;
    const pct = minutesSinceCreated / resolveDeadlineMin;
    if (minutesSinceCreated >= resolveDeadlineMin) return "breached";
    if (pct >= 0.75) return "sla_at_risk";
  }

  // In progress but no active work note
  if (ticket.status === "in_progress" && !ticket.work_started_at) {
    return "no_active_work";
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

    const id = await generateTicketId(type);

    const { data: ticket, error } = await db
      .from("tickets")
      .insert({
        id, type, title, severity, status: "new",
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
      const sla = SLA[t.severity];
      if (!sla) return null;
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
    const { type, status, severity, country, node, owner_name, team, sla_at_risk } = req.query;

    let query = db.from("tickets").select("*").order("created_at", { ascending: false });

    if (type) query = query.eq("type", type);
    if (severity) query = query.eq("severity", severity);
    if (country) query = query.eq("country", country);
    if (owner_name) query = query.eq("owner_name", owner_name);
    if (team) query = query.eq("team", team);

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
            closure_code, resolution_summary, related_change_id, working_state, actor_name } = req.body;

    // Fetch current ticket to check existing timestamps
    const { data: current, error: fetchErr } = await db.from("tickets").select("*").eq("id", id).single();
    if (fetchErr || !current) return res.status(404).json({ error: "Ticket not found" });

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
    if (working_state !== undefined) updates.working_state = working_state;

    // Auto-set timestamps based on status transitions
    if (status === "assigned" && !current.assigned_at) updates.assigned_at = now;
    if (status === "in_progress") {
      if (!current.acknowledged_at) updates.acknowledged_at = now;
      if (!current.work_started_at) updates.work_started_at = now;
    }
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

// ─── Auto-create ticket from alarm ───────────────────────────────────────────
export async function autoCreateTicketFromAlarm(alarm, nodeMeta) {
  if (!supabase) return null; // tickets service not configured

  try {
    const db = getDb();
    const severity = SEV_MAP[alarm.severity] || "sev3";
    const alarmType = alarm.type || "UNKNOWN";
    const nodeId = alarm.nodeId;

    // Dedup check: existing open ticket for same alarm_type + node
    const { data: existing } = await db
      .from("tickets")
      .select("id, status")
      .eq("alarm_type", alarmType)
      .contains("impacted_nodes", [nodeId])
      .not("status", "in", "(resolved,closed)")
      .limit(1);

    if (existing && existing.length > 0) {
      // Link alarm to existing ticket
      const existingTicket = existing[0];
      await insertEvent(
        existingTicket.id, "alarm_linked", "System", null,
        `Alarm re-fired: ${alarm.message || alarmType} on ${nodeId}`,
        { alarm_id: alarm.id, alarm_severity: alarm.severity }
      );
      return existingTicket;
    }

    // Create new incident ticket
    const title = `${alarmType.replace(/_/g, " ")} — ${nodeId}`;
    const id = await generateTicketId("incident");

    const { data: ticket, error } = await db
      .from("tickets")
      .insert({
        id, type: "incident", title, severity, status: "new",
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

    await insertEvent(id, "created", "System", null,
      `Auto-created from alarm: ${alarm.message || title}`,
      { alarm_id: alarm.id, alarm_severity: alarm.severity, node: nodeId }
    );

    return ticket;
  } catch (e) {
    console.error("[tickets] autoCreateTicketFromAlarm error:", e.message);
    return null;
  }
}

export default router;
