-- HumanHands PostgreSQL schema scaffold
-- Phase 1: schema-only, no ORM yet

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Sessions ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   TEXT UNIQUE NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
  metadata     JSONB
);

-- ─── UI Graph Snapshots ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ui_graph_snapshots (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  page_id      TEXT NOT NULL,
  url          TEXT NOT NULL,
  title        TEXT,
  checksum     TEXT NOT NULL,
  graph_data   JSONB NOT NULL,
  element_count INT,
  captured_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ui_graph_snapshots_session_idx ON ui_graph_snapshots(session_id);
CREATE INDEX IF NOT EXISTS ui_graph_snapshots_checksum_idx ON ui_graph_snapshots(checksum);

-- ─── Action Log ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS action_log (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  action_id     TEXT UNIQUE NOT NULL,
  session_id    TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  action_type   TEXT NOT NULL,
  target        JSONB,
  value         TEXT,
  success       BOOLEAN NOT NULL,
  duration_ms   INT,
  retry_count   INT DEFAULT 0,
  selector_used TEXT,
  error_code    TEXT,
  error_message TEXT,
  executed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS action_log_session_idx ON action_log(session_id);
CREATE INDEX IF NOT EXISTS action_log_executed_at_idx ON action_log(executed_at);

-- ─── Workflow Executions ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_executions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id TEXT UNIQUE NOT NULL,
  workflow_id  TEXT NOT NULL,
  session_id   TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed','aborted')),
  current_step INT DEFAULT 0,
  total_steps  INT,
  step_results JSONB DEFAULT '[]',
  error        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS workflow_executions_session_idx ON workflow_executions(session_id);
