'use strict';

/**
 * Carbon Core v4 — Unified API Server
 *
 * Exposes all Carbon Core capabilities over HTTP at PORT (default 3001).
 * Backward-compatible: /api/v2/* routes are reimplemented here.
 *
 * New v4 routes:
 *   GET  /api/v4/health
 *   GET  /api/v4/agents
 *   POST /api/v4/agent/run
 *   POST /api/v4/orchestration/run
 *   POST /api/v4/ralph/run
 *   GET  /api/v4/ralph/:loopId
 *   DELETE /api/v4/ralph/:loopId
 *   GET  /api/v4/knowledge/search
 *   GET  /api/v4/knowledge/domains
 *   GET  /api/v4/skills
 *   POST /api/v4/skills/match
 *   GET  /api/v4/budget
 *   GET  /api/v4/budget/:agentId
 *   POST /api/v4/budget/reserve
 *   POST /api/v4/budget/policy
 *   GET  /api/v4/runs
 *   GET  /api/v4/runs/:id
 *   DELETE /api/v4/runs/:id
 *   GET  /api/v4/tools
 *   POST /api/v4/tools/execute
 */

const express  = require('express');
const cors     = require('cors');
const Database = require('better-sqlite3');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');

// ── Core Modules ──────────────────────────────────────────────────────

const {
  registerBudgetDb, initBudgetPolicies,
  getBudgetDashboard, getAgentBudgetSummary,
  createBudgetPolicy, checkBudget,
  pauseAgent, resumeAgent,
} = require('../budget-v2.js');

const {
  registerHeartbeatDb, resetStuckRuns,
  getRecentRuns, getActiveRuns: getActiveHeartbeatRuns,
  getTotalRuns, getAgentStats,
} = require('../heartbeat-v2.js');

const {
  registerAuditDb, logSystemAction, logAgentAction,
  getRecentActivity, getActivityByEntity, getActivityByActor,
  getActivityCount, ActionTypes,
} = require('../audit-v2.js');

const {
  registerHealthDb, startHealthMonitor, getHealthStatus,
} = require('../health-v2.js');

const {
  orchestrate, orchestratePhased,
  getOrchestrationRun, getAllOrchestrationRuns, cancelRun,
  getActiveRuns: getActiveOrchestrationRuns,
} = require('../orchestrator-v2.js');

const { getAllAgents, getAgent, routeTask } = require('../agent-registry.js');
const { getAllSkills, findRelevantSkills }  = require('../skills-registry.js');
const {
  search: knowledgeSearch,
  getCategories: knowledgeCategories,
  getStats:      knowledgeStats,
} = require('../knowledge-service.js');
const {
  startRalphLoop, getRalphStatus, stopRalphLoop, getAllRalphLoops,
} = require('../ralph-loop.js');
const { chat: modelChat }           = require('../model-router-client.js');
const { executeTool, listTools, PermissionMode } = require('./agent-tools.js');

// ── Constants ──────────────────────────────────────────────────────────

const PORT      = parseInt(process.env.PORT || '3001', 10);
const DB_PATH   = process.env.SQLITE_PATH
  || path.join(__dirname, '..', '..', 'carbon-copy.db');
const SCHEMA_V2 = path.join(__dirname, '..', '..', 'schema-v2.sql');
const SCHEMA_V4 = path.join(__dirname, 'schema-v4.sql');
const VERSION   = '4.0.0';

// ── Database ───────────────────────────────────────────────────────────

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply schemas idempotently (all DDL uses IF NOT EXISTS guards)
function _applySchema(filePath) {
  if (!fs.existsSync(filePath)) return;
  try {
    // db.exec is SQLite's multi-statement DDL runner — not child_process
    db.exec(fs.readFileSync(filePath, 'utf-8'));
    console.log(`[db] Schema applied: ${path.basename(filePath)}`);
  } catch (e) {
    console.warn(`[db] Schema warning (${path.basename(filePath)}):`, e.message);
  }
}
_applySchema(SCHEMA_V2);
_applySchema(SCHEMA_V4);

// ── Register DB Callbacks ──────────────────────────────────────────────

registerBudgetDb({
  getSpend: (agentId, windowSeconds) => {
    try {
      const row = db.prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) AS total
         FROM cc_heartbeat_runs
         WHERE agent_id = ? AND started_at > (strftime('%s','now') - ?)`
      ).get(agentId, windowSeconds);
      return row?.total || 0;
    } catch { return 0; }
  },
  getPolicies: () => {
    try { return db.prepare('SELECT * FROM cc_budget_policies').all(); }
    catch { return []; }
  },
});

const _saveRunStmt = db.prepare(`
  INSERT OR IGNORE INTO cc_heartbeat_runs
    (id, agent_id, invocation_source, status, prompt_preview,
     input_tokens, output_tokens, cache_tokens, cost_usd, duration_ms,
     exit_code, error, model, started_at, completed_at)
  VALUES
    (@id, @agent_id, @invocation_source, @status, @prompt_preview,
     @input_tokens, @output_tokens, @cache_tokens, @cost_usd, @duration_ms,
     @exit_code, @error, @model, @started_at, @completed_at)
`);
const _updateRunStmt = db.prepare(`
  UPDATE cc_heartbeat_runs
  SET status=@status, cost_usd=@cost_usd, duration_ms=@duration_ms,
      exit_code=@exit_code, error=@error, completed_at=@completed_at
  WHERE id=@id
`);
registerHeartbeatDb({
  saveRun:       (r) => _saveRunStmt.run(r),
  updateRun:     (r) => _updateRunStmt.run(r),
  loadActiveRuns: () => {
    try { return db.prepare(`SELECT * FROM cc_heartbeat_runs WHERE status='running'`).all(); }
    catch { return []; }
  },
});

const _writeLogStmt = db.prepare(`
  INSERT OR IGNORE INTO cc_activity_log
    (id, actor_type, actor_id, action_type, entity_type, entity_id, detail, created_at)
  VALUES
    (@id, @actor_type, @actor_id, @action_type, @entity_type, @entity_id, @detail, @created_at)
`);
registerAuditDb({
  writeLog: (entry) => _writeLogStmt.run({
    ...entry, detail: JSON.stringify(entry.detail || {}),
  }),
});

registerHealthDb({
  checkDb: () => { db.prepare('SELECT 1').get(); return 'ok'; },
  getMemoryCount: () => {
    try { return db.prepare('SELECT COUNT(*) AS c FROM memories').get()?.c || 0; }
    catch { return 0; }
  },
  getScheduledTaskCount: () => {
    try {
      return db.prepare(`SELECT COUNT(*) AS c FROM scheduled_tasks WHERE status='active'`).get()?.c || 0;
    } catch { return 0; }
  },
});

// ── Agent Run Registry (in-memory + DB) ───────────────────────────────

/** @type {Map<string, object>} */
const _agentRuns = new Map();
const MAX_AGENT_RUNS = 500;

const _insertAgentRun = db.prepare(`
  INSERT OR IGNORE INTO agent_runs
    (id, agent_id, prompt, status, output, error,
     tokens_used, cost_usd, duration_ms, model, provider, created_at)
  VALUES
    (@id, @agent_id, @prompt, @status, @output, @error,
     @tokens_used, @cost_usd, @duration_ms, @model, @provider, @created_at)
`);
const _updateAgentRun = db.prepare(`
  UPDATE agent_runs
  SET status=@status, output=@output, error=@error, tokens_used=@tokens_used,
      cost_usd=@cost_usd, duration_ms=@duration_ms, completed_at=@completed_at
  WHERE id=@id
`);

function _saveAgentRun(run) {
  _agentRuns.set(run.id, run);
  if (_agentRuns.size > MAX_AGENT_RUNS) {
    _agentRuns.delete(_agentRuns.keys().next().value);
  }
  try { _insertAgentRun.run(run); } catch { /* table may not exist yet */ }
}

function _finishAgentRun(id, updates) {
  const run = _agentRuns.get(id);
  if (run) Object.assign(run, updates);
  try { _updateAgentRun.run({ id, ...updates }); } catch { /* non-fatal */ }
}

// ── Startup ────────────────────────────────────────────────────────────

resetStuckRuns();
initBudgetPolicies();
startHealthMonitor(5 * 60 * 1000);
logSystemAction(ActionTypes.SYSTEM_STARTUP, 'system', 'carbon-core', {
  version: VERSION, port: PORT, node: process.version,
});

// ── Express App ────────────────────────────────────────────────────────

const app = express();
app.set('trust proxy', true);
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Auth Middleware ────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  // Skip in development or when explicitly disabled
  if (process.env.NODE_ENV !== 'production' || process.env.AUTH_DISABLED === 'true') {
    return next();
  }

  // Service-to-service internal token
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (internalToken && req.headers['x-internal-token'] === internalToken) {
    req.auth = { type: 'service', id: 'internal' };
    return next();
  }

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization: Bearer <token> required' });
  }

  const token = authHeader.slice(7);
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) return res.status(500).json({ error: 'Server auth not configured' });

  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT structure');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    const sigInput = `${parts[0]}.${parts[1]}`;
    const expected = crypto.createHmac('sha256', jwtSecret).update(sigInput).digest('base64url');
    if (expected !== parts[2]) throw new Error('Invalid signature');
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
    req.auth = { type: 'jwt', id: payload.sub || payload.userId || 'user', payload };
    return next();
  } catch (e) {
    return res.status(401).json({ error: `Invalid token: ${e.message}` });
  }
}

// ── Request Audit Logging ──────────────────────────────────────────────

app.use((req, _res, next) => {
  if (!req.path.includes('/health') && !req.path.includes('/ping')) {
    logSystemAction('http.request', 'api', req.path, { method: req.method, ip: req.ip });
  }
  next();
});

// ── Budget Guard Helper ────────────────────────────────────────────────

function _guardBudget(agentId, res) {
  try {
    const b = checkBudget(agentId || 'api');
    if (!b.allowed) {
      res.status(402).json({ error: `Budget limit: ${b.reason}`, budget: b });
      return false;
    }
  } catch { /* No policy — allow */ }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// API v4 Routes
// ═══════════════════════════════════════════════════════════════════════

app.get('/api/v4/ping', (_req, res) => res.json({ ok: true, version: VERSION, ts: Date.now() }));

// Health ───────────────────────────────────────────────────────────────

app.get('/api/v4/health', async (_req, res) => {
  try {
    const health = await getHealthStatus();

    let modelRouterStatus = { name: 'model_router', status: 'unknown', latency_ms: 0 };
    try {
      const t0 = Date.now();
      const r = await fetch(
        `${process.env.MODEL_ROUTER_URL || 'http://localhost:3002'}/health`,
        { signal: AbortSignal.timeout(3000) },
      );
      modelRouterStatus = {
        name:       'model_router',
        status:     r.ok ? 'healthy' : 'unhealthy',
        latency_ms: Date.now() - t0,
      };
    } catch {
      modelRouterStatus = { name: 'model_router', status: 'unhealthy', message: 'unreachable' };
    }

    res.json({
      ...health,
      subsystems: [...health.subsystems, modelRouterStatus],
      v4: {
        active_orchestration_runs: getActiveOrchestrationRuns().length,
        active_agent_runs:         [..._agentRuns.values()].filter((r) => r.status === 'running').length,
        knowledge_index:           knowledgeStats(),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Agents ───────────────────────────────────────────────────────────────

app.get('/api/v4/agents', authMiddleware, (_req, res) => {
  const agents = getAllAgents().map((a) => ({
    id:           a.id,
    name:         a.name,
    role:         a.role,
    description:  a.description,
    skills:       a.skills || [],
    capabilities: a.routing_keywords || [],
    status:       'available',
  }));
  res.json({ agents, total: agents.length });
});

// Agent Run ────────────────────────────────────────────────────────────

app.post('/api/v4/agent/run', authMiddleware, async (req, res) => {
  const { agentId, prompt, tools, context, budgetLimit } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const resolvedAgentId = agentId || routeTask(prompt);
  if (!_guardBudget(resolvedAgentId, res)) return;

  const runId     = crypto.randomUUID();
  const now       = Math.floor(Date.now() / 1000);
  const agentDef  = getAgent(resolvedAgentId);

  const run = {
    id: runId, agent_id: resolvedAgentId, prompt, status: 'running',
    output: null, error: null, tokens_used: 0, cost_usd: 0, duration_ms: 0,
    model: null, provider: null, created_at: now, completed_at: null,
  };
  _saveAgentRun(run);
  logAgentAction(ActionTypes.AGENT_STARTED, 'agent_run', runId,
    { agent_id: resolvedAgentId, prompt_preview: prompt.slice(0, 100) }, resolvedAgentId);

  const startMs = Date.now();
  const messages = [
    ...(agentDef?.system_prompt ? [{ role: 'system', content: agentDef.system_prompt }] : []),
    ...(context ? [{ role: 'user', content: `Context:\n${context}` }] : []),
    { role: 'user', content: prompt },
  ];

  // Fire-and-forget — poll via GET /api/v4/runs/:id
  modelChat(messages, { agentId: resolvedAgentId, skipBudgetCheck: true, budgetLimit, tools })
    .then((result) => {
      const dur = Date.now() - startMs;
      _finishAgentRun(runId, {
        status: 'completed',
        output: result.content || result.text || JSON.stringify(result),
        tokens_used: result.tokensUsed || 0,
        cost_usd: result.cost_usd || 0,
        duration_ms: dur,
        model: result.model || null,
        provider: result.provider || null,
        completed_at: Math.floor(Date.now() / 1000),
      });
      logAgentAction(ActionTypes.AGENT_COMPLETED, 'agent_run', runId,
        { duration_ms: dur, cost_usd: result.cost_usd || 0 }, resolvedAgentId);
    })
    .catch((err) => {
      _finishAgentRun(runId, {
        status: 'failed', error: err.message,
        duration_ms: Date.now() - startMs,
        completed_at: Math.floor(Date.now() / 1000),
      });
      logAgentAction(ActionTypes.AGENT_FAILED, 'agent_run', runId,
        { error: err.message }, resolvedAgentId);
    });

  res.status(202).json({
    runId, status: 'running', agentId: resolvedAgentId,
    poll: `/api/v4/runs/${runId}`,
  });
});

// Orchestration ────────────────────────────────────────────────────────

app.post('/api/v4/orchestration/run', authMiddleware, (req, res) => {
  const { mode = 'parallel', agents = [], prompt, task, context, userId } = req.body;
  const resolvedTask = task || prompt;
  if (!resolvedTask) return res.status(400).json({ error: 'task or prompt is required' });

  if (!_guardBudget(userId || 'orchestrator', res)) return;

  try {
    const fullTask = context ? `${resolvedTask}\n\nContext:\n${context}` : resolvedTask;
    const result = mode === 'phased'
      ? orchestratePhased({ task: fullTask, agents, userId })
      : orchestrate({ task: fullTask, agents, mode, userId });

    res.status(202).json({
      runId: result.runId, status: 'running', mode,
      poll: `/api/v4/runs/${result.runId}`,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Ralph ────────────────────────────────────────────────────────────────

app.post('/api/v4/ralph/run', authMiddleware, (req, res) => {
  const {
    task, maxIterations = 50, verifyWith, completionPromise,
    agentId, model,
  } = req.body;
  if (!task) return res.status(400).json({ error: 'task is required' });

  if (!_guardBudget(agentId || 'ralph', res)) return;

  const { loopId } = startRalphLoop(task, {
    completionPromise: completionPromise || verifyWith || 'DONE',
    maxIterations:     Math.min(maxIterations, 100),
    agentId:           agentId || 'ralph',
    model:             model || 'claude-sonnet-4-6',
    workDir:           process.cwd(),
  });

  res.status(202).json({ loopId, status: 'running', poll: `/api/v4/runs/${loopId}` });
});

app.get('/api/v4/ralph/:loopId', authMiddleware, (req, res) => {
  const s = getRalphStatus(req.params.loopId);
  return s ? res.json(s) : res.status(404).json({ error: 'Loop not found' });
});

app.delete('/api/v4/ralph/:loopId', authMiddleware, (req, res) => {
  res.json({ ok: stopRalphLoop(req.params.loopId) });
});

// Knowledge ────────────────────────────────────────────────────────────

app.get('/api/v4/knowledge/search', authMiddleware, (req, res) => {
  const { q, domain, limit = '10' } = req.query;
  if (!q || typeof q !== 'string' || !q.trim()) {
    return res.status(400).json({ error: 'q (search query) is required' });
  }
  const result = knowledgeSearch(q, {
    category: domain || null,
    limit:    Math.min(parseInt(limit, 10) || 10, 50),
  });
  logSystemAction(ActionTypes.KNOWLEDGE_QUERIED, 'knowledge', q.slice(0, 80), {
    domain, results: result.total,
  });
  res.json(result);
});

app.get('/api/v4/knowledge/domains', authMiddleware, (_req, res) => {
  res.json({ domains: knowledgeCategories(), stats: knowledgeStats() });
});

// Skills ───────────────────────────────────────────────────────────────

app.get('/api/v4/skills', authMiddleware, (_req, res) => {
  const skills = getAllSkills().map((s) => ({
    id:       s.id,
    category: s.category,
    agents:   s.agents || [],
    triggers: s.triggers || [],
  }));
  res.json({ skills, total: skills.length });
});

app.post('/api/v4/skills/match', authMiddleware, (req, res) => {
  const { intent, limit = 5 } = req.body;
  if (!intent) return res.status(400).json({ error: 'intent is required' });
  const matched = findRelevantSkills(intent, Math.min(limit, 20));
  res.json({ skills: matched, query: intent, total: matched.length });
});

// Budget ───────────────────────────────────────────────────────────────

app.get('/api/v4/budget', authMiddleware, (_req, res) => res.json(getBudgetDashboard()));

app.get('/api/v4/budget/:agentId', authMiddleware, (req, res) => {
  res.json(getAgentBudgetSummary(req.params.agentId));
});

app.post('/api/v4/budget/reserve', authMiddleware, (req, res) => {
  const { agentId, estimatedTokens = 0 } = req.body;
  if (!agentId) return res.status(400).json({ error: 'agentId is required' });

  try {
    const b = checkBudget(agentId);
    if (!b.allowed) return res.status(402).json({ error: b.reason, allowed: false, budget: b });
    res.json({
      allowed: true, agentId, estimated_tokens: estimatedTokens,
      current_spend: b.current_spend, limit_usd: b.limit_usd,
      utilization: b.utilization, reserved_at: Math.floor(Date.now() / 1000),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v4/budget/policy', authMiddleware, (req, res) => {
  const { scope, scope_id, window, limit_usd, warning_threshold, auto_pause } = req.body;
  if (!scope || !scope_id || !window || !limit_usd) {
    return res.status(400).json({ error: 'scope, scope_id, window, limit_usd required' });
  }
  res.json(createBudgetPolicy(scope, scope_id, window, limit_usd, {
    warningThreshold: warning_threshold, autoPause: auto_pause,
  }));
});

// Runs (unified: agent + orchestration + ralph) ────────────────────────

app.get('/api/v4/runs', authMiddleware, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const type  = req.query.type || 'all';

  const results = [];

  if (type === 'all' || type === 'agent') {
    [..._agentRuns.values()]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
      .forEach((r) => results.push({ ...r, run_type: 'agent' }));
  }
  if (type === 'all' || type === 'orchestration') {
    getAllOrchestrationRuns({ limit })
      .forEach((r) => results.push({ ...r, run_type: 'orchestration' }));
  }
  if (type === 'all' || type === 'ralph') {
    getAllRalphLoops()
      .slice(0, limit)
      .forEach((r) => results.push({ ...r, run_type: 'ralph' }));
  }

  results.sort((a, b) => (b.created_at || b.startedAt || 0) - (a.created_at || a.startedAt || 0));
  res.json({ runs: results.slice(0, limit), total: results.length });
});

app.get('/api/v4/runs/:id', authMiddleware, (req, res) => {
  const { id } = req.params;

  if (_agentRuns.has(id)) return res.json({ ..._agentRuns.get(id), run_type: 'agent' });

  const orch = getOrchestrationRun(id);
  if (orch) return res.json({ ...orch, run_type: 'orchestration' });

  const ralph = getRalphStatus(id);
  if (ralph) return res.json({ ...ralph, run_type: 'ralph' });

  res.status(404).json({ error: 'Run not found' });
});

app.delete('/api/v4/runs/:id', authMiddleware, (req, res) => {
  res.json({ ok: cancelRun(req.params.id) });
});

// Tools ────────────────────────────────────────────────────────────────

app.get('/api/v4/tools', authMiddleware, (_req, res) => res.json({ tools: listTools() }));

app.post('/api/v4/tools/execute', authMiddleware, async (req, res) => {
  const { tool, input = {}, permissions = 'default', workDir, agentId } = req.body;
  if (!tool) return res.status(400).json({ error: 'tool is required' });

  const ctx = {
    permissionMode: PermissionMode[permissions.toUpperCase()] || PermissionMode.DEFAULT,
    workDir:        workDir || process.cwd(),
    agentId:        agentId || 'api',
  };

  try {
    const result = await executeTool(tool, input, ctx);
    res.json(result);
  } catch (e) {
    res.status(500).json({ output: '', error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// API v2 Backward-Compat Routes
// ═══════════════════════════════════════════════════════════════════════

app.get('/api/v2/ping', (_req, res) => res.json({ ok: true, version: VERSION, ts: Date.now() }));

app.get('/api/v2/health', async (_req, res) => {
  try { res.json(await getHealthStatus()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/v2/summary', async (_req, res) => {
  try {
    const health = await getHealthStatus().catch(() => ({ status: 'unknown' }));
    res.json({
      version: VERSION, health: health.status,
      active_runs:     getActiveHeartbeatRuns().length,
      total_runs:      getTotalRuns(),
      activity_count:  getActivityCount(),
      budget:          getBudgetDashboard(),
      recent_activity: getRecentActivity(5),
      ts: Date.now(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/v2/budget',       (_req, res) => res.json(getBudgetDashboard()));
app.get('/api/v2/budget/:id',   (req, res)  => res.json(getAgentBudgetSummary(req.params.id)));
app.post('/api/v2/budget/:id/pause',  (req, res) => { pauseAgent(req.params.id);  res.json({ ok: true }); });
app.post('/api/v2/budget/:id/resume', (req, res) => { resumeAgent(req.params.id); res.json({ ok: true }); });

app.get('/api/v2/heartbeat', (req, res) => res.json({
  runs:   getRecentRuns(parseInt(req.query.limit, 10) || 50, req.query.agent_id),
  active: getActiveHeartbeatRuns(),
  total:  getTotalRuns(),
}));
app.get('/api/v2/heartbeat/stats/:id', (req, res) => res.json(getAgentStats(req.params.id)));

app.get('/api/v2/activity', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const entries = req.query.entity_type  ? getActivityByEntity(req.query.entity_type, limit)
    : req.query.actor_id                 ? getActivityByActor(req.query.actor_id, limit)
    : getRecentActivity(limit, parseInt(req.query.offset, 10) || 0);
  res.json({ entries, total: getActivityCount() });
});

app.get('/api/v2/orchestration', (req, res) =>
  res.json(getAllOrchestrationRuns({ limit: parseInt(req.query.limit, 10) || 20 })));
app.get('/api/v2/orchestration/:id', (req, res) => {
  const run = getOrchestrationRun(req.params.id);
  return run ? res.json(run) : res.status(404).json({ error: 'Run not found' });
});
app.post('/api/v2/orchestration', (req, res) => {
  const { task, agents, mode, userId } = req.body;
  if (!task) return res.status(400).json({ error: 'task required' });
  try {
    const r = mode === 'phased'
      ? orchestratePhased({ task, agents, userId })
      : orchestrate({ task, agents: agents || [], mode: mode || 'parallel', userId });
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/v2/knowledge', (req, res) =>
  res.json(knowledgeSearch(req.query.q || '', {
    limit: 10, category: req.query.category || null,
  })));

app.get('/api/v2/ralph',      (_req, res) => res.json(getAllRalphLoops()));
app.get('/api/v2/ralph/:id',  (req, res) => {
  const s = getRalphStatus(req.params.id);
  return s ? res.json(s) : res.status(404).json({ error: 'Loop not found' });
});
app.post('/api/v2/ralph', (req, res) => {
  const { task, completionPromise, maxIterations, agentId, model } = req.body;
  if (!task) return res.status(400).json({ error: 'task required' });
  res.json(startRalphLoop(task, { completionPromise, maxIterations, agentId, model }));
});

// ── Error Handlers ─────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api-v4] Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ── Listen ─────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  console.log(`[api-v4] Carbon Core v${VERSION} — http://localhost:${PORT}`);
  console.log(`[api-v4] Routes: /api/v4/*  |  Compat: /api/v2/*`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[api-v4] Port ${PORT} in use. Set PORT= env var.`);
    process.exit(1);
  }
  throw err;
});

module.exports = { app, server };
