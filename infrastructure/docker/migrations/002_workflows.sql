-- HumanHands Step 4: Workflow Intelligence Schema
-- Migration: 002_workflows.sql

-- ─── Workflow Recordings (raw captured data) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_recordings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  description     TEXT,
  session_id      TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'recording'
                  CHECK (status IN ('recording', 'paused', 'completed', 'cancelled')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,
  action_count    INT DEFAULT 0,
  start_url       TEXT,
  end_url         TEXT,
  page_history    JSONB DEFAULT '[]',
  actions         JSONB DEFAULT '[]',
  tags            TEXT[] DEFAULT '{}',
  metadata        JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS recordings_session_idx ON workflow_recordings(session_id);
CREATE INDEX IF NOT EXISTS recordings_status_idx ON workflow_recordings(status);

-- ─── Compiled Workflows (the reusable DSL) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflows (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  description     TEXT,
  version         TEXT NOT NULL DEFAULT '1.0.0',
  variables       JSONB NOT NULL DEFAULT '[]',
  steps           JSONB NOT NULL DEFAULT '[]',
  metadata        JSONB NOT NULL DEFAULT '{}',
  checksum        TEXT NOT NULL,
  previous_ver_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workflows_name_idx ON workflows USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS workflows_updated_idx ON workflows(updated_at DESC);

-- ─── Workflow Versions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id     TEXT NOT NULL,
  version         TEXT NOT NULL,
  workflow_data   JSONB NOT NULL,
  changelog       TEXT,
  is_current      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, version)
);

CREATE INDEX IF NOT EXISTS versions_workflow_idx ON workflow_versions(workflow_id);

-- ─── Workflow Executions ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_executions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  execution_id    TEXT UNIQUE NOT NULL,
  workflow_id     TEXT NOT NULL,
  workflow_ver    TEXT NOT NULL,
  session_id      TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
  mode            TEXT NOT NULL DEFAULT 'production'
                  CHECK (mode IN ('dry-run', 'validation', 'production')),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'running', 'completed', 'failed', 'aborted')),
  resolved_vars   JSONB DEFAULT '{}',
  step_results    JSONB DEFAULT '[]',
  failed_at_step  TEXT,
  error           TEXT,
  summary         JSONB DEFAULT '{}',
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  total_duration  INT
);

CREATE INDEX IF NOT EXISTS executions_workflow_idx ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS executions_session_idx  ON workflow_executions(session_id);
CREATE INDEX IF NOT EXISTS executions_status_idx   ON workflow_executions(status);
CREATE INDEX IF NOT EXISTS executions_started_idx  ON workflow_executions(started_at DESC);

-- ─── Workflow Variables (extracted variable definitions) ──────────────────────

CREATE TABLE IF NOT EXISTS workflow_variables (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id     TEXT NOT NULL,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  required        BOOLEAN NOT NULL DEFAULT true,
  description     TEXT,
  placeholder     TEXT NOT NULL,
  sample_value    TEXT,
  validation      JSONB,
  default_value   JSONB,
  source_field    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workflow_id, name)
);

CREATE INDEX IF NOT EXISTS vars_workflow_idx ON workflow_variables(workflow_id);

-- ─── Workflow Migrations (compatibility tracking) ─────────────────────────────

CREATE TABLE IF NOT EXISTS workflow_migrations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id     TEXT NOT NULL,
  from_version    TEXT NOT NULL,
  to_version      TEXT NOT NULL,
  breaking        BOOLEAN NOT NULL DEFAULT false,
  notes           JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Helper views ─────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW workflow_success_rates AS
  SELECT
    workflow_id,
    COUNT(*) FILTER (WHERE mode = 'production')           AS total_runs,
    COUNT(*) FILTER (WHERE mode = 'production' AND status = 'completed') AS successful_runs,
    ROUND(
      COUNT(*) FILTER (WHERE mode = 'production' AND status = 'completed')::numeric
      / NULLIF(COUNT(*) FILTER (WHERE mode = 'production'), 0)
      * 100, 2
    ) AS success_rate_pct,
    MAX(started_at) AS last_run_at
  FROM workflow_executions
  GROUP BY workflow_id;
