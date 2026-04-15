-- Carbon Core v2 — Database Schema
-- Run this against carbon-copy.db to add v2 tables

-- ── Budget Governance ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS budget_policies (
  id                  TEXT PRIMARY KEY,
  scope               TEXT NOT NULL CHECK (scope IN ('agent', 'company')),
  scope_id            TEXT NOT NULL,
  window              TEXT NOT NULL CHECK (window IN ('daily', 'monthly', 'lifetime')),
  limit_usd           REAL NOT NULL,
  warning_threshold   REAL NOT NULL DEFAULT 0.8,
  auto_pause          INTEGER NOT NULL DEFAULT 1,
  created_at          INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_incidents (
  id                  TEXT PRIMARY KEY,
  policy_id           TEXT NOT NULL,
  agent_id            TEXT NOT NULL,
  severity            TEXT NOT NULL CHECK (severity IN ('warning', 'hard_stop')),
  current_spend       REAL NOT NULL,
  limit_usd           REAL NOT NULL,
  action_taken        TEXT NOT NULL,
  created_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_incidents_agent ON budget_incidents(agent_id);
CREATE INDEX IF NOT EXISTS idx_budget_incidents_created ON budget_incidents(created_at);

-- ── Heartbeat Execution ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS heartbeat_runs (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  invocation_source   TEXT NOT NULL,
  status              TEXT NOT NULL,
  prompt_preview      TEXT,
  input_tokens        INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  cache_tokens        INTEGER DEFAULT 0,
  cost_usd            REAL DEFAULT 0,
  duration_ms         INTEGER DEFAULT 0,
  exit_code           INTEGER,
  session_id_before   TEXT,
  session_id_after    TEXT,
  error               TEXT,
  model               TEXT,
  started_at          INTEGER NOT NULL,
  completed_at        INTEGER
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_agent ON heartbeat_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_status ON heartbeat_runs(status);
CREATE INDEX IF NOT EXISTS idx_heartbeat_started ON heartbeat_runs(started_at);

-- ── Activity Audit Log ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS activity_log (
  id                  TEXT PRIMARY KEY,
  actor_type          TEXT NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id            TEXT NOT NULL,
  action_type         TEXT NOT NULL,
  entity_type         TEXT NOT NULL,
  entity_id           TEXT NOT NULL,
  detail              TEXT, -- JSON
  created_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

-- ── Orchestration Runs ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orchestration_runs (
  id                  TEXT PRIMARY KEY,
  task                TEXT NOT NULL,
  mode                TEXT NOT NULL,
  user_id             TEXT,
  status              TEXT NOT NULL,
  phase               TEXT,
  result              TEXT, -- JSON or text
  error               TEXT,
  agent_runs          TEXT, -- JSON array
  phase_transitions   TEXT, -- JSON array
  started_at          INTEGER NOT NULL,
  ended_at            INTEGER
);

CREATE INDEX IF NOT EXISTS idx_orchestration_status ON orchestration_runs(status);
CREATE INDEX IF NOT EXISTS idx_orchestration_started ON orchestration_runs(started_at);

-- ── Proposal Storage ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proposals (
  id                  TEXT PRIMARY KEY,
  client_name         TEXT,
  company             TEXT,
  transcript_preview  TEXT,
  lead_data           TEXT, -- JSON
  extraction          TEXT, -- JSON
  proposal            TEXT, -- JSON
  created_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_proposals_company ON proposals(company);
CREATE INDEX IF NOT EXISTS idx_proposals_created ON proposals(created_at);

-- ── Knowledge Base ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS knowledge_docs (
  id                  TEXT PRIMARY KEY,
  category            TEXT NOT NULL,
  path                TEXT NOT NULL,
  title               TEXT NOT NULL,
  content             TEXT NOT NULL,
  keywords            TEXT NOT NULL DEFAULT '[]',
  indexed_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_docs(category);
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  title,
  content,
  category,
  content_rowid=rowid
);

-- ── Plugin Registry ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plugins (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL UNIQUE,
  version             TEXT,
  manifest_path       TEXT NOT NULL,
  enabled             INTEGER NOT NULL DEFAULT 1,
  installed_at        TEXT NOT NULL,
  last_run_at         TEXT
);

-- ── Claude Usage Tracking (from usage-tracker) ───────────────────────

CREATE TABLE IF NOT EXISTS usage_sessions (
  session_id           TEXT PRIMARY KEY,
  project_name         TEXT,
  first_timestamp      TEXT,
  last_timestamp       TEXT,
  git_branch           TEXT,
  total_input_tokens   INTEGER NOT NULL DEFAULT 0,
  total_output_tokens  INTEGER NOT NULL DEFAULT 0,
  total_cache_read     INTEGER NOT NULL DEFAULT 0,
  total_cache_creation INTEGER NOT NULL DEFAULT 0,
  model                TEXT,
  turn_count           INTEGER NOT NULL DEFAULT 0,
  total_cost_usd       REAL NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_sessions(model);
CREATE INDEX IF NOT EXISTS idx_usage_project ON usage_sessions(project_name);
CREATE INDEX IF NOT EXISTS idx_usage_sessions_first ON usage_sessions(first_timestamp);

CREATE TABLE IF NOT EXISTS usage_turns (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id             TEXT NOT NULL,
  timestamp              TEXT,
  model                  TEXT,
  input_tokens           INTEGER NOT NULL DEFAULT 0,
  output_tokens          INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens      INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens  INTEGER NOT NULL DEFAULT 0,
  cost_usd               REAL NOT NULL DEFAULT 0,
  tool_name              TEXT,
  cwd                    TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_turns_session ON usage_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_usage_turns_ts ON usage_turns(timestamp);

CREATE TABLE IF NOT EXISTS usage_processed_files (
  path  TEXT PRIMARY KEY,
  mtime REAL,
  lines INTEGER
);
