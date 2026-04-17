-- Carbon Core v4 — Additive Schema
-- Run AFTER schema-v2.sql. Never drops existing tables.
-- All new tables use IF NOT EXISTS guards.

-- ── Ralph Loop Runs ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ralph_runs (
  id                  TEXT PRIMARY KEY,
  task                TEXT NOT NULL,
  completion_promise  TEXT NOT NULL DEFAULT 'DONE',
  max_iterations      INTEGER NOT NULL DEFAULT 50,
  current_iteration   INTEGER DEFAULT 0,
  score_threshold     REAL DEFAULT 0.8,
  status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','failed','cancelled','max_iterations','budget_blocked')),
  result              TEXT,
  error               TEXT,
  total_tokens        INTEGER DEFAULT 0,
  total_cost_usd      REAL DEFAULT 0,
  verify_with         TEXT,
  created_at          INTEGER NOT NULL,
  completed_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ralph_runs_status  ON ralph_runs(status);
CREATE INDEX IF NOT EXISTS idx_ralph_runs_created ON ralph_runs(created_at DESC);

-- ── Ralph Iterations ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ralph_iterations (
  id                  TEXT PRIMARY KEY,
  run_id              TEXT NOT NULL REFERENCES ralph_runs(id) ON DELETE CASCADE,
  iteration           INTEGER NOT NULL,
  input               TEXT NOT NULL,
  output              TEXT,
  score               REAL,
  verified            INTEGER DEFAULT 0,
  duration_ms         INTEGER DEFAULT 0,
  cost_usd            REAL DEFAULT 0,
  created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_ralph_iter_run     ON ralph_iterations(run_id);
CREATE INDEX IF NOT EXISTS idx_ralph_iter_created ON ralph_iterations(created_at DESC);

-- ── Agent Runs ────────────────────────────────────────────────────────
-- Individual agent execution requests (not heartbeat / orchestration).
CREATE TABLE IF NOT EXISTS agent_runs (
  id                  TEXT PRIMARY KEY,
  agent_id            TEXT NOT NULL,
  prompt              TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','failed','cancelled')),
  output              TEXT,
  error               TEXT,
  tokens_used         INTEGER DEFAULT 0,
  cost_usd            REAL DEFAULT 0,
  duration_ms         INTEGER DEFAULT 0,
  model               TEXT,
  provider            TEXT,
  created_at          INTEGER NOT NULL,
  completed_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent   ON agent_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status  ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_created ON agent_runs(created_at DESC);

-- ── Knowledge Chunks ──────────────────────────────────────────────────
-- Fine-grained knowledge base: each row is one chunk of a source document.
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id                  TEXT PRIMARY KEY,
  source_file         TEXT,
  domain              TEXT NOT NULL DEFAULT 'content',
  title               TEXT NOT NULL,
  tags                TEXT,           -- comma-separated tag list
  content             TEXT NOT NULL,
  chunk_index         INTEGER DEFAULT 0,
  embedding_hint      TEXT,           -- model ID used to generate embedding (if any)
  created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_kchunks_domain  ON knowledge_chunks(domain);
CREATE INDEX IF NOT EXISTS idx_kchunks_created ON knowledge_chunks(created_at DESC);

-- FTS5 virtual table backed by knowledge_chunks (external content).
-- Triggers keep the index synchronized with the base table.
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
  content,
  title,
  tags,
  content='knowledge_chunks',
  content_rowid='rowid'
);

-- Keep FTS index in sync with knowledge_chunks.
CREATE TRIGGER IF NOT EXISTS kchunks_ai AFTER INSERT ON knowledge_chunks BEGIN
  INSERT INTO knowledge_chunks_fts(rowid, content, title, tags)
  VALUES (new.rowid, new.content, new.title, COALESCE(new.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS kchunks_ad AFTER DELETE ON knowledge_chunks BEGIN
  INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content, title, tags)
  VALUES ('delete', old.rowid, old.content, old.title, COALESCE(old.tags, ''));
END;

CREATE TRIGGER IF NOT EXISTS kchunks_au AFTER UPDATE ON knowledge_chunks BEGIN
  INSERT INTO knowledge_chunks_fts(knowledge_chunks_fts, rowid, content, title, tags)
  VALUES ('delete', old.rowid, old.content, old.title, COALESCE(old.tags, ''));
  INSERT INTO knowledge_chunks_fts(rowid, content, title, tags)
  VALUES (new.rowid, new.content, new.title, COALESCE(new.tags, ''));
END;

-- ── Skill Executions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skill_executions (
  id                  TEXT PRIMARY KEY,
  skill_id            TEXT NOT NULL,
  context             TEXT,
  output              TEXT,
  duration_ms         INTEGER DEFAULT 0,
  created_at          INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
CREATE INDEX IF NOT EXISTS idx_skill_exec_skill ON skill_executions(skill_id);

-- ── Pipeline Runs ─────────────────────────────────────────────────────
-- Tracks executions of multi-stage orchestration (pipeline / phased modes).
CREATE TABLE IF NOT EXISTS pipeline_runs (
  id                  TEXT PRIMARY KEY,
  mode                TEXT NOT NULL,           -- 'pipeline' | 'phased'
  agents_json         TEXT NOT NULL DEFAULT '[]',
  status              TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','failed','cancelled')),
  stages_json         TEXT DEFAULT '[]',        -- per-stage results array
  output_json         TEXT DEFAULT '{}',        -- final merged artifacts / output
  created_at          INTEGER NOT NULL,
  completed_at        INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status  ON pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_created ON pipeline_runs(created_at DESC);
