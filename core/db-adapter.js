/**
 * Database Adapter — Carbon Core v2
 *
 * Unified DB interface supporting:
 * - SQLite (development / local homelab)
 * - PostgreSQL (production / managed)
 *
 * Set DB_ADAPTER=postgres to use PostgreSQL.
 * Default: sqlite (zero-config dev experience).
 *
 * Both adapters implement the same interface:
 *   db.get(sql, params)   → single row or null
 *   db.all(sql, params)   → array of rows
 *   db.run(sql, params)   → { changes, lastInsertRowid }
 *   db.exec(sql)          → void
 *   db.prepare(sql)       → statement (SQLite) or template (PG)
 *   db.transaction(fn)    → wraps fn in a transaction
 */

const ADAPTER = process.env.DB_ADAPTER || 'sqlite';
const PG_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/carbon_core';
const SQLITE_PATH = process.env.SQLITE_PATH || './carbon-copy.db';

let _db = null;

// ── Initialize ──────────────────────────────────────────────────────

export async function initDb() {
  if (_db) return _db;

  if (ADAPTER === 'postgres') {
    _db = await initPostgres();
  } else {
    _db = await initSqlite();
  }

  console.log(`[db] Connected: ${ADAPTER} (${ADAPTER === 'postgres' ? PG_URL.replace(/:\/\/.*@/, '://***@') : SQLITE_PATH})`);
  return _db;
}

export function getDb() {
  if (!_db) throw new Error('DB not initialized. Call initDb() first.');
  return _db;
}

// ── SQLite Adapter ──────────────────────────────────────────────────

async function initSqlite() {
  const { default: Database } = await import('better-sqlite3');
  const raw = new Database(SQLITE_PATH);
  raw.pragma('journal_mode = WAL');
  raw.pragma('foreign_keys = ON');

  return {
    type: 'sqlite',
    raw,

    get(sql, params = []) {
      return raw.prepare(normalizeSql(sql, 'sqlite')).get(...params) || null;
    },

    all(sql, params = []) {
      return raw.prepare(normalizeSql(sql, 'sqlite')).all(...params);
    },

    run(sql, params = []) {
      const stmt = raw.prepare(normalizeSql(sql, 'sqlite'));
      const info = stmt.run(...params);
      return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    },

    exec(sql) {
      raw.exec(sql);
    },

    prepare(sql) {
      const normalized = normalizeSql(sql, 'sqlite');
      const stmt = raw.prepare(normalized);
      return {
        get: (...params) => stmt.get(...params) || null,
        all: (...params) => stmt.all(...params),
        run: (...params) => stmt.run(...params),
      };
    },

    transaction(fn) {
      return raw.transaction(fn)();
    },

    async close() {
      raw.close();
    },
  };
}

// ── PostgreSQL Adapter ──────────────────────────────────────────────

async function initPostgres() {
  // Use pg (node-postgres) — already in Carbon-Copy's package.json
  const { default: pg } = await import('pg');
  const { Pool } = pg;

  const pool = new Pool({
    connectionString: PG_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  // Test connection
  const client = await pool.connect();
  await client.query('SELECT 1');
  client.release();

  return {
    type: 'postgres',
    pool,

    async get(sql, params = []) {
      const result = await pool.query(normalizeSql(sql, 'postgres'), params);
      return result.rows[0] || null;
    },

    async all(sql, params = []) {
      const result = await pool.query(normalizeSql(sql, 'postgres'), params);
      return result.rows;
    },

    async run(sql, params = []) {
      const result = await pool.query(normalizeSql(sql, 'postgres'), params);
      return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id || null };
    },

    async exec(sql) {
      await pool.query(sql);
    },

    prepare(sql) {
      // PG doesn't have prepared statements the same way — return async wrappers
      return {
        get: async (...params) => {
          const result = await pool.query(normalizeSql(sql, 'postgres'), params);
          return result.rows[0] || null;
        },
        all: async (...params) => {
          const result = await pool.query(normalizeSql(sql, 'postgres'), params);
          return result.rows;
        },
        run: async (...params) => {
          const result = await pool.query(normalizeSql(sql, 'postgres'), params);
          return { changes: result.rowCount };
        },
      };
    },

    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    },
  };
}

// ── SQL Normalization ───────────────────────────────────────────────

/**
 * Normalize SQL between SQLite and PostgreSQL syntax.
 * - SQLite uses ? placeholders, PG uses $1, $2...
 * - Some type differences handled here
 */
function normalizeSql(sql, target) {
  if (target === 'sqlite') {
    // Convert PG $1 placeholders to ? for SQLite
    return sql.replace(/\$(\d+)/g, '?');
  }
  if (target === 'postgres') {
    // Convert ? to $1, $2... for PostgreSQL
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }
  return sql;
}

// ── Schema Migration ────────────────────────────────────────────────

/**
 * Apply v2 schema to PostgreSQL.
 * Runs all DDL from schema-v2.sql converted to PostgreSQL syntax.
 */
export async function migrateV2Schema(db) {
  if (db.type !== 'postgres') {
    // SQLite: run the sqlite schema-v2.sql
    const { readFileSync, existsSync } = await import('fs');
    if (existsSync('./schema-v2.sql')) {
      const sql = readFileSync('./schema-v2.sql', 'utf-8');
      // Strip SQLite-only syntax for PG
      db.exec(sql);
      console.log('[db] SQLite schema-v2 applied');
    }
    return;
  }

  // PostgreSQL: run the PostgreSQL-native v2 schema
  await db.exec(POSTGRES_V2_SCHEMA);
  console.log('[db] PostgreSQL schema-v2 applied');
}

// ── PostgreSQL v2 Schema ────────────────────────────────────────────

const POSTGRES_V2_SCHEMA = `
-- Carbon Core v2 — PostgreSQL Schema
-- Supplements the existing database/init/ schemas

-- ── Budget Governance ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_budget_policies (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope               VARCHAR(20) NOT NULL CHECK (scope IN ('agent', 'company')),
  scope_id            VARCHAR(100) NOT NULL,
  window              VARCHAR(20) NOT NULL CHECK (window IN ('daily', 'monthly', 'lifetime')),
  limit_usd           NUMERIC(12, 4) NOT NULL,
  warning_threshold   NUMERIC(4, 3) NOT NULL DEFAULT 0.8,
  auto_pause          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS cc_budget_incidents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id           UUID NOT NULL,
  agent_id            VARCHAR(100) NOT NULL,
  severity            VARCHAR(20) NOT NULL CHECK (severity IN ('warning', 'hard_stop')),
  current_spend       NUMERIC(12, 4) NOT NULL,
  limit_usd           NUMERIC(12, 4) NOT NULL,
  action_taken        VARCHAR(50) NOT NULL,
  created_at          BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cc_budget_incidents_agent ON cc_budget_incidents(agent_id);
CREATE INDEX IF NOT EXISTS idx_cc_budget_incidents_created ON cc_budget_incidents(created_at DESC);

-- ── Heartbeat Execution ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_heartbeat_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id            VARCHAR(100) NOT NULL,
  invocation_source   VARCHAR(50) NOT NULL,
  status              VARCHAR(30) NOT NULL,
  prompt_preview      TEXT,
  input_tokens        INTEGER DEFAULT 0,
  output_tokens       INTEGER DEFAULT 0,
  cache_tokens        INTEGER DEFAULT 0,
  cost_usd            NUMERIC(12, 6) DEFAULT 0,
  duration_ms         INTEGER DEFAULT 0,
  exit_code           INTEGER,
  session_id_before   VARCHAR(200),
  session_id_after    VARCHAR(200),
  error               TEXT,
  model               VARCHAR(100),
  provider            VARCHAR(50),
  is_local            BOOLEAN DEFAULT FALSE,
  started_at          BIGINT NOT NULL,
  completed_at        BIGINT
);

CREATE INDEX IF NOT EXISTS idx_cc_heartbeat_agent ON cc_heartbeat_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_cc_heartbeat_status ON cc_heartbeat_runs(status);
CREATE INDEX IF NOT EXISTS idx_cc_heartbeat_started ON cc_heartbeat_runs(started_at DESC);

-- ── Activity Audit Log ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_activity_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type          VARCHAR(20) NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id            VARCHAR(100) NOT NULL,
  action_type         VARCHAR(100) NOT NULL,
  entity_type         VARCHAR(100) NOT NULL,
  entity_id           VARCHAR(200) NOT NULL,
  detail              JSONB DEFAULT '{}',
  created_at          BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cc_activity_actor ON cc_activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_cc_activity_entity ON cc_activity_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_cc_activity_action ON cc_activity_log(action_type);
CREATE INDEX IF NOT EXISTS idx_cc_activity_created ON cc_activity_log(created_at DESC);

-- ── Orchestration Runs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_orchestration_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task                TEXT NOT NULL,
  mode                VARCHAR(30) NOT NULL,
  user_id             UUID,
  status              VARCHAR(30) NOT NULL,
  phase               VARCHAR(30),
  result              TEXT,
  error               TEXT,
  agent_runs          JSONB DEFAULT '[]',
  phase_transitions   JSONB DEFAULT '[]',
  started_at          BIGINT NOT NULL,
  ended_at            BIGINT
);

CREATE INDEX IF NOT EXISTS idx_cc_orchestration_status ON cc_orchestration_runs(status);
CREATE INDEX IF NOT EXISTS idx_cc_orchestration_started ON cc_orchestration_runs(started_at DESC);

-- ── Ralph Loop Tracking ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_ralph_loops (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task                TEXT NOT NULL,
  completion_promise  VARCHAR(200) NOT NULL,
  max_iterations      INTEGER NOT NULL DEFAULT 50,
  current_iteration   INTEGER DEFAULT 0,
  status              VARCHAR(30) NOT NULL,
  total_cost          NUMERIC(12, 6) DEFAULT 0,
  total_tokens        INTEGER DEFAULT 0,
  result              TEXT,
  error               TEXT,
  agent_id            VARCHAR(100),
  started_at          BIGINT NOT NULL,
  completed_at        BIGINT
);

-- ── Proposals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_proposals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name         VARCHAR(200),
  company_name        VARCHAR(200),
  transcript_preview  TEXT,
  lead_data           JSONB DEFAULT '{}',
  extraction          JSONB DEFAULT '{}',
  proposal            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_proposals_company ON cc_proposals(company_name);
CREATE INDEX IF NOT EXISTS idx_cc_proposals_created ON cc_proposals(created_at DESC);

-- ── Knowledge Base ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_knowledge_docs (
  id                  VARCHAR(32) PRIMARY KEY,
  category            VARCHAR(100) NOT NULL,
  subcategory         VARCHAR(100),
  file_path           TEXT,
  title               VARCHAR(500) NOT NULL,
  content             TEXT NOT NULL,
  keywords            TEXT,
  indexed_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_knowledge_category ON cc_knowledge_docs(category);
CREATE INDEX IF NOT EXISTS idx_cc_knowledge_title ON cc_knowledge_docs USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_cc_knowledge_content ON cc_knowledge_docs USING gin(to_tsvector('english', content));

-- ── VM AI Assignments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_vm_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vm_id               UUID NOT NULL,
  agent_id            VARCHAR(100) NOT NULL,
  purpose             TEXT,
  assigned_at         TIMESTAMPTZ DEFAULT NOW(),
  released_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cc_vm_agent ON cc_vm_assignments(agent_id);
CREATE INDEX IF NOT EXISTS idx_cc_vm_vmid ON cc_vm_assignments(vm_id);

-- ── Model Usage Cache ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cc_model_usage (
  session_id          VARCHAR(200) PRIMARY KEY,
  project_name        VARCHAR(200),
  first_timestamp     TEXT,
  last_timestamp      TEXT,
  model               VARCHAR(100),
  provider            VARCHAR(50),
  is_local            BOOLEAN DEFAULT FALSE,
  total_input_tokens  INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cache_read    INTEGER DEFAULT 0,
  turn_count          INTEGER DEFAULT 0,
  cost_usd            NUMERIC(12, 6) DEFAULT 0,
  scanned_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cc_model_usage_model ON cc_model_usage(model);
CREATE INDEX IF NOT EXISTS idx_cc_model_usage_provider ON cc_model_usage(provider);
`;
