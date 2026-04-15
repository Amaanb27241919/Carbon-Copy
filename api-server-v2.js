/**
 * Carbon Core v2 — API Server Entry Point
 *
 * Extends api-server.js with all v2 services:
 * - Budget governance
 * - Heartbeat execution tracking
 * - Activity audit log
 * - Health monitoring
 * - Multi-agent orchestration
 * - Claude usage tracking
 * - Proposal generation
 * - Real-time SSE hive mind feed
 */

import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── V2 Services ─────────────────────────────────────────────────────

import { registerBudgetDb, initBudgetPolicies } from './core/budget-v2.js';
import { registerHeartbeatDb, resetStuckRuns } from './core/heartbeat-v2.js';
import { registerAuditDb, logSystemAction, ActionTypes } from './core/audit-v2.js';
import { registerHealthDb, startHealthMonitor } from './core/health-v2.js';
import { createDashboardV2Router } from './dashboard-v2.js';

// ── App Setup ───────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', true);
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Database ────────────────────────────────────────────────────────

const db = new Database('./carbon-copy.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply v2 schema
try {
  const { readFileSync } = await import('fs');
  const schemaSql = readFileSync('./schema-v2.sql', 'utf-8');
  db.exec(schemaSql);
  console.log('[db] V2 schema applied');
} catch (e) {
  console.warn('[db] Schema apply warning:', e.message);
}

// ── Register DB Functions ───────────────────────────────────────────

// Budget
registerBudgetDb({
  getSpend: (agentId, windowSeconds) => {
    try {
      const row = db.prepare(`
        SELECT COALESCE(SUM(cost_usd), 0) as total 
        FROM heartbeat_runs 
        WHERE agent_id = ? AND started_at > (strftime('%s', 'now') - ?)
      `).get(agentId, windowSeconds);
      return row?.total || 0;
    } catch { return 0; }
  },
  getPolicies: () => {
    try { return db.prepare('SELECT * FROM budget_policies').all(); }
    catch { return []; }
  },
});

// Heartbeat
const insertRun = db.prepare(`
  INSERT OR IGNORE INTO heartbeat_runs 
    (id, agent_id, invocation_source, status, prompt_preview, input_tokens, output_tokens, cache_tokens, cost_usd, duration_ms, exit_code, session_id_before, session_id_after, error, model, started_at, completed_at)
  VALUES (@id, @agent_id, @invocation_source, @status, @prompt_preview, @input_tokens, @output_tokens, @cache_tokens, @cost_usd, @duration_ms, @exit_code, @session_id_before, @session_id_after, @error, @model, @started_at, @completed_at)
`);
const updateRun = db.prepare(`
  UPDATE heartbeat_runs SET status=@status, input_tokens=@input_tokens, output_tokens=@output_tokens, cache_tokens=@cache_tokens, cost_usd=@cost_usd, duration_ms=@duration_ms, exit_code=@exit_code, session_id_after=@session_id_after, error=@error, completed_at=@completed_at
  WHERE id=@id
`);
registerHeartbeatDb({ insertRun: (r) => insertRun.run(r), updateRun: (r) => updateRun.run(r) });

// Audit
const insertActivity = db.prepare(`
  INSERT OR IGNORE INTO activity_log (id, actor_type, actor_id, action_type, entity_type, entity_id, detail, created_at)
  VALUES (@id, @actor_type, @actor_id, @action_type, @entity_type, @entity_id, @detail, @created_at)
`);
registerAuditDb({ insertActivity: (e) => insertActivity.run({ ...e, detail: JSON.stringify(e.detail) }) });

// Health
registerHealthDb({
  getDbTableNames: () => db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name),
  getMemoryCount: () => { try { return db.prepare('SELECT COUNT(*) as c FROM memories').get()?.c || 0; } catch { return 0; } },
  getTaskCount: () => { try { return db.prepare("SELECT COUNT(*) as c FROM scheduled_tasks WHERE status='active'").get()?.c || 0; } catch { return 0; } },
});

// ── Startup Tasks ───────────────────────────────────────────────────

resetStuckRuns();
initBudgetPolicies();
startHealthMonitor(5 * 60 * 1000); // 5 min interval

logSystemAction(ActionTypes.SYSTEM_STARTUP, 'system', 'api-server-v2', {
  version: '2.0.0',
  port: PORT,
  node_version: process.version,
});

// ── Routes ──────────────────────────────────────────────────────────

// V2 Dashboard API
app.use('/api/v2', createDashboardV2Router());

// Status
app.get('/api/v2/ping', (req, res) => res.json({ ok: true, version: '2.0.0', ts: Date.now() }));

// ── Try to import and mount v1 API if it exists ──────────────────────
try {
  const { createApiRouter } = await import('./api-server.js').catch(() => null);
  if (createApiRouter) {
    app.use('/api', createApiRouter(db));
    console.log('[api] V1 routes mounted at /api');
  }
} catch { console.log('[api] V1 routes not available (standalone v2 mode)'); }

// ── ARIA Integration ─────────────────────────────────────────────────
// Forward /api/aria/* to running ARIA orchestrator if configured
const ARIA_URL = process.env.ARIA_SERVICE_URL;
if (ARIA_URL) {
  console.log(`[aria] Proxying /api/aria/* → ${ARIA_URL}`);
  app.all('/api/aria/*', async (req, res) => {
    try {
      const { default: fetch } = await import('node-fetch');
      const url = `${ARIA_URL}${req.path.replace('/api/aria', '')}`;
      const response = await fetch(url, {
        method: req.method,
        headers: { 'Content-Type': 'application/json', ...req.headers },
        body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined,
      });
      const data = await response.json();
      res.status(response.status).json(data);
    } catch (e) {
      res.status(502).json({ error: e.message });
    }
  });
}

// ── Error Handler ────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  logSystemAction(ActionTypes.SYSTEM_ERROR, 'api', req.path, { error: err.message });
  res.status(500).json({ error: err.message });
});

// ── Start ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(50));
  console.log('  🧠 Carbon Core v2 — Running');
  console.log('═'.repeat(50));
  console.log(`  Port:         ${PORT}`);
  console.log(`  Health:       http://localhost:${PORT}/api/v2/health`);
  console.log(`  Dashboard:    http://localhost:${PORT}/api/v2/summary`);
  console.log(`  Budget:       http://localhost:${PORT}/api/v2/budget`);
  console.log(`  Heartbeat:    http://localhost:${PORT}/api/v2/heartbeat`);
  console.log(`  Activity:     http://localhost:${PORT}/api/v2/activity`);
  console.log(`  Usage:        http://localhost:${PORT}/api/v2/usage`);
  console.log(`  Orchestrate:  POST http://localhost:${PORT}/api/v2/orchestration`);
  console.log(`  Proposals:    POST http://localhost:${PORT}/api/v2/proposal`);
  console.log(`  SSE Feed:     http://localhost:${PORT}/api/v2/stream`);
  console.log('═'.repeat(50) + '\n');
});

export default app;
