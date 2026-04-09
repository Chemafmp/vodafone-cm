-- tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id              text PRIMARY KEY,
  type            text NOT NULL CHECK (type IN ('incident','problem','project')),
  title           text NOT NULL,
  severity        text CHECK (severity IN ('sev1','sev2','sev3','sev4')),
  status          text NOT NULL DEFAULT 'new',
  owner_id        text,
  owner_name      text,
  team            text DEFAULT 'Core Transport',
  parent_id       text REFERENCES tickets(id),
  description     text,
  impacted_services  text[] DEFAULT '{}',
  impacted_nodes     text[] DEFAULT '{}',
  country         text,
  alarm_id        text,
  alarm_type      text,
  created_at      timestamptz DEFAULT now(),
  assigned_at     timestamptz,
  acknowledged_at timestamptz,
  work_started_at timestamptz,
  mitigated_at    timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  sla_breached    boolean DEFAULT false,
  tags            text[] DEFAULT '{}',
  seq_number      bigserial UNIQUE
);

-- ticket_events table (immutable timeline)
CREATE TABLE IF NOT EXISTS ticket_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   text NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  event_type  text NOT NULL,
  actor_name  text,
  actor_id    text,
  content     text,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now()
);

-- ticket_evidence table
CREATE TABLE IF NOT EXISTS ticket_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     text NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN ('attachment','snapshot','link','alarm_ref','change_ref')),
  label         text NOT NULL,
  url           text,
  metadata      jsonb DEFAULT '{}',
  uploaded_by   text,
  created_at    timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tickets_type ON tickets(type);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_severity ON tickets(severity);
CREATE INDEX IF NOT EXISTS idx_tickets_alarm_id ON tickets(alarm_id);
CREATE INDEX IF NOT EXISTS idx_ticket_events_ticket_id ON ticket_events(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_evidence_ticket_id ON ticket_evidence(ticket_id);
