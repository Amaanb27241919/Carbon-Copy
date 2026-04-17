'use strict';

/**
 * Carbon Core v3 — API Server Entry Point
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const {
  registerBudgetDb, initBudgetPolicies,
  getBudgetDashboard, getAgentBudgetSummary,
  createBudgetPolicy, resumeAgent, pauseAgent,
} = require('./core/budget-v2.js');

const {
  registerHeartbeatDb, resetStuckRuns,
  getRecentRuns, getActiveRuns, getTotalRuns, getAgentStats,
} = require('./core/heartbeat-v2.js');

const {
  registerAuditDb, logSystemAction, logAgentAction,
  getRecentActivity, getActivityByEntity, getActivityByActor,
  getActivityCount, ActionTypes,
} = require('./core/audit-v2.js');

const {
  registerHealthDb, startHealthMonitor, getHealthStatus,
} = require('./core/health-v2.js');

const {
  scanUsage, getTotalUsageStats: getUsageSummary, getTotalUsageStats: _usageStats,
} = require('./core/usage-tracker.js');
const getUsageWindow = (days) => {
  try {
    const sessions = scanUsage() || [];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0,10);
    const filtered = sessions.filter(s => (s.last_timestamp || '') >= cutoffStr);
    return { period_days: days, sessions: filtered.length,
      turns: filtered.reduce((s,r) => s + (r.turn_count||0), 0),
      cost_usd: filtered.reduce((s,r) => s + (r.cost_usd||0), 0) };
  } catch { return { period_days: days, sessions: 0, turns: 0, cost_usd: 0 }; }
};

const {
  orchestrate, orchestratePhased,
  getAllOrchestrationRuns, getOrchestrationRun,
} = require('./core/orchestrator-v2.js');

const { generateProposal } = require('./core/proposal-service.js');
const { getVMStatusSummary } = require('./core/vm-manager-client.js');
const utm = require('./core/utm-client.js');
const { chat: modelChat, getProviders, getLocalModels, pullLocalModel } = require('./core/model-router-client.js');
const { getAllExpertAgents, findBestAgent } = require('./core/expert-agents.js');
const { startRalphLoop, getRalphStatus, stopRalphLoop, getAllRalphLoops } = require('./core/ralph-loop.js');
const { listHooks, registerHook, registerDefaultHooks, triggerHooks } = require('./core/hooks-engine.js');

// ── App Setup ────────────────────────────────────────────────────────

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', true);
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Database (SQLite dev default) ────────────────────────────────────

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, 'carbon-copy.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Apply v2 schema
try {
  const schemaPath = path.join(__dirname, 'schema-v2.sql');
  if (fs.existsSync(schemaPath)) {
    db.exec(fs.readFileSync(schemaPath, 'utf-8'));
    console.log('[db] Schema applied:', DB_PATH);
  }
} catch (e) {
  console.warn('[db] Schema warning:', e.message);
}

// ── Register DB Functions ─────────────────────────────────────────────

registerBudgetDb({
  getSpend: (agentId, windowSeconds) => {
    try {
      const row = db.prepare(
        `SELECT COALESCE(SUM(cost_usd), 0) as total FROM heartbeat_runs
         WHERE agent_id = ? AND started_at > (strftime('%s','now') - ?)`
      ).get(agentId, windowSeconds);
      return row?.total || 0;
    } catch { return 0; }
  },
  getPolicies: () => {
    try { return db.prepare('SELECT * FROM budget_policies').all(); }
    catch { return []; }
  },
});

const insertRun = db.prepare(`
  INSERT OR IGNORE INTO heartbeat_runs
    (id, agent_id, invocation_source, status, prompt_preview,
     input_tokens, output_tokens, cache_tokens, cost_usd, duration_ms,
     exit_code, session_id_before, session_id_after, error, model, started_at, completed_at)
  VALUES
    (@id, @agent_id, @invocation_source, @status, @prompt_preview,
     @input_tokens, @output_tokens, @cache_tokens, @cost_usd, @duration_ms,
     @exit_code, @session_id_before, @session_id_after, @error, @model, @started_at, @completed_at)
`);
const updateRun = db.prepare(`
  UPDATE heartbeat_runs
  SET status=@status, input_tokens=@input_tokens, output_tokens=@output_tokens,
      cache_tokens=@cache_tokens, cost_usd=@cost_usd, duration_ms=@duration_ms,
      exit_code=@exit_code, session_id_after=@session_id_after, error=@error, completed_at=@completed_at
  WHERE id=@id
`);
registerHeartbeatDb({ insertRun: (r) => insertRun.run(r), updateRun: (r) => updateRun.run(r) });

const insertActivity = db.prepare(`
  INSERT OR IGNORE INTO activity_log
    (id, actor_type, actor_id, action_type, entity_type, entity_id, detail, created_at)
  VALUES
    (@id, @actor_type, @actor_id, @action_type, @entity_type, @entity_id, @detail, @created_at)
`);
registerAuditDb({ insertActivity: (e) => insertActivity.run({ ...e, detail: JSON.stringify(e.detail) }) });

registerHealthDb({
  getDbTableNames: () => db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name),
  getMemoryCount: () => { try { return db.prepare('SELECT COUNT(*) as c FROM memories').get()?.c || 0; } catch { return 0; } },
  getTaskCount: () => { try { return db.prepare("SELECT COUNT(*) as c FROM scheduled_tasks WHERE status='active'").get()?.c || 0; } catch { return 0; } },
});

// ── Startup ───────────────────────────────────────────────────────────

resetStuckRuns();
initBudgetPolicies();
startHealthMonitor(5 * 60 * 1000);
registerDefaultHooks();

logSystemAction(ActionTypes.SYSTEM_STARTUP, 'system', 'carbon-core', {
  version: '3.0.0', port: PORT, node: process.version,
});

// ── SSE Clients (hive mind feed) ──────────────────────────────────────

const sseClients = new Set();
function broadcast(event) {
  const data = JSON.stringify({ ...event, ts: Date.now() });
  for (const res of sseClients) {
    try { res.write(`data: ${data}\n\n`); }
    catch { sseClients.delete(res); }
  }
}

// ── Routes ────────────────────────────────────────────────────────────

// Ping
app.get('/api/v2/ping', (req, res) => res.json({ ok: true, version: '3.0.0', ts: Date.now() }));

// Health
app.get('/api/v2/health', async (req, res) => {
  try { res.json(await getHealthStatus()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Summary
app.get('/api/v2/summary', async (req, res) => {
  try {
    const health = await getHealthStatus().catch(() => ({ status: 'unknown' }));
    res.json({
      version: '3.0.0',
      health: health.status,
      active_runs: getActiveRuns().length,
      total_runs: getTotalRuns(),
      activity_count: getActivityCount(),
      budget: getBudgetDashboard(),
      usage_7d: getUsageWindow(7),
      recent_activity: getRecentActivity(5),
      ts: Date.now(),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Budget
app.get('/api/v2/budget', (req, res) => res.json(getBudgetDashboard()));
app.get('/api/v2/budget/:agentId', (req, res) => res.json(getAgentBudgetSummary(req.params.agentId)));
app.post('/api/v2/budget/policy', (req, res) => {
  const { scope, scope_id, window, limit_usd, warning_threshold, auto_pause } = req.body;
  if (!scope || !scope_id || !window || !limit_usd)
    return res.status(400).json({ error: 'scope, scope_id, window, limit_usd required' });
  res.json(createBudgetPolicy(scope, scope_id, window, limit_usd, { warningThreshold: warning_threshold, autoPause: auto_pause }));
});
app.post('/api/v2/budget/:agentId/pause', (req, res) => { pauseAgent(req.params.agentId); res.json({ ok: true }); });
app.post('/api/v2/budget/:agentId/resume', (req, res) => { resumeAgent(req.params.agentId); res.json({ ok: true }); });

// Heartbeat
app.get('/api/v2/heartbeat', (req, res) => res.json({
  runs: getRecentRuns(parseInt(req.query.limit) || 50, req.query.agent_id),
  active: getActiveRuns(), total: getTotalRuns(),
}));
app.get('/api/v2/heartbeat/stats/:agentId', (req, res) => res.json(getAgentStats(req.params.agentId)));

// Activity
app.get('/api/v2/activity', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const entries = req.query.entity_type ? getActivityByEntity(req.query.entity_type, limit)
    : req.query.actor_id ? getActivityByActor(req.query.actor_id, limit)
    : getRecentActivity(limit, parseInt(req.query.offset) || 0);
  res.json({ entries, total: getActivityCount() });
});

// Orchestration
app.get('/api/v2/orchestration', (req, res) => res.json(getAllOrchestrationRuns({ limit: parseInt(req.query.limit) || 20 })));
app.get('/api/v2/orchestration/:runId', (req, res) => {
  const run = getOrchestrationRun(req.params.runId);
  return run ? res.json(run) : res.status(404).json({ error: 'Run not found' });
});
app.post('/api/v2/orchestration', (req, res) => {
  const { task, agents, mode, options, userId } = req.body;
  if (!task) return res.status(400).json({ error: 'task required' });
  const result = mode === 'phased'
    ? orchestratePhased({ task, options, userId })
    : orchestrate({ task, agents: agents || [], mode: mode || 'parallel', options, userId });
  res.json(result);
});


// Missions (alias for orchestration runs, formatted as AriaMission shape)
function formatRunAsMission(run) {
  return {
    id: run.id,
    goal: run.task,
    status: run.status,
    tokens_used: 0,
    cost_usd: 0,
    created_at: run.started_at ? new Date(run.started_at).toISOString() : new Date().toISOString(),
    completed_at: run.ended_at ? new Date(run.ended_at).toISOString() : null,
    output: run.result ? { summary: String(run.result).slice(0, 200) } : null,
    mode: run.mode || 'phased',
    agent_count: run.agent_runs?.length || 0,
  };
}

app.get('/api/v2/missions', (req, res) => {
  try {
    const runs = getAllOrchestrationRuns({ limit: parseInt(req.query.limit) || 50 });
    const missions = (Array.isArray(runs) ? runs : runs.runs || []).map(formatRunAsMission);
    res.json(missions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/v2/missions', (req, res) => {
  const { goal, mode, context } = req.body;
  if (!goal) return res.status(400).json({ error: 'goal required' });
  try {
    const resolvedMode = ['parallel', 'sequential', 'hierarchical', 'pipeline'].includes(mode) ? mode : 'parallel';
    const result = orchestrate({ task: goal, agents: [], mode: resolvedMode, options: { context } });
    res.json({ missionId: result.runId || result.id, status: 'running' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/v2/missions/:id', (req, res) => {
  try {
    const run = getOrchestrationRun(req.params.id);
    return run ? res.json(formatRunAsMission(run)) : res.status(404).json({ error: 'Mission not found' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Usage
app.get('/api/v2/usage', (req, res) => { try { res.json(getUsageSummary()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/v2/usage/window', (req, res) => { try { res.json(getUsageWindow(parseInt(req.query.days) || 7)); } catch (e) { res.status(500).json({ error: e.message }); } });

// Proposals
app.post('/api/v2/proposal', async (req, res) => {
  if (!req.body.transcript) return res.status(400).json({ error: 'transcript required' });
  try { res.json(await generateProposal(req.body.lead_data || {}, req.body.transcript)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// VMs — unified UTM + Docker KVM
app.get('/api/v2/vms', async (req, res) => {
  try {
    const [kvmSummary, utmVMs, utmStatus] = await Promise.all([
      getVMStatusSummary().catch(() => ({ kvm_available: false, vms: [] })),
      utm.listUTMVMs().catch(() => []),
      utm.getUTMStatus().catch(() => ({ available: false, vm_count: 0 })),
    ]);
    const allVMs = [...utmVMs, ...(kvmSummary.vms || [])];
    res.json({
      utm_available: utmStatus.available,
      kvm_available: kvmSummary.kvm_available || false,
      total: allVMs.length,
      running: allVMs.filter(v => v.running).length,
      stopped: allVMs.filter(v => !v.running).length,
      vms: allVMs,
      providers: {
        utm: { available: utmStatus.available, description: 'Native Apple Silicon (macOS, Windows ARM, Linux)' },
        kvm: { available: kvmSummary.kvm_available || false, description: 'Linux via Docker QEMU' },
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// UTM VM actions
app.post('/api/v2/vms/utm', async (req, res) => {
  try { res.json(await utm.createUTMVM(req.body)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/v2/vms/utm/:uuid/start', async (req, res) => {
  try { res.json(await utm.startUTMVM(req.params.uuid)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/v2/vms/utm/:uuid/stop', async (req, res) => {
  try { res.json(await utm.stopUTMVM(req.params.uuid, req.body?.force)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/v2/vms/utm/:uuid', async (req, res) => {
  try { res.json(await utm.deleteUTMVM(req.params.uuid)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Models
app.get('/api/v2/models/providers', async (req, res) => {
  try { res.json(await getProviders()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/v2/models/local', async (req, res) => {
  try { res.json(await getLocalModels()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Agents — combined view (expert + pipeline + active runs)
app.get('/api/v2/agents', (req, res) => {
  try {
    const expert_agents = getAllExpertAgents();
    const active_runs = getActiveRuns();
    const pipeline_agents = [
      { id: 'scan', name: 'Scan', role: 'Orchestrator', status: 'idle', description: 'Routes tasks to the right agent' },
      { id: 'research', name: 'Research', role: 'Researcher', status: 'idle', description: 'Executes deep AI research' },
      { id: 'synthesizer', name: 'Synthesizer', role: 'Synthesizer', status: 'idle', description: 'Formats research output' },
      { id: 'delivery', name: 'Delivery', role: 'Delivery', status: 'idle', description: 'Dispatches results via email/Slack' },
      { id: 'client_mgr', name: 'Client Manager', role: 'Manager', status: 'idle', description: 'Manages client preferences' },
    ];
    res.json({
      expert_agents,
      pipeline_agents,
      active_runs,
      stats: { total_runs: getTotalRuns(), active: active_runs.length },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Unified model list (Ollama + Claude + OpenAI)
app.get('/api/v2/models', async (req, res) => {
  const claudeAvailable = !!process.env.ANTHROPIC_API_KEY;
  const openaiAvailable = !!process.env.OPENAI_API_KEY;

  try {
    const data = await getProviders();
    const providers = data.providers || [];
    const ollamaProvider = providers.find(p => p.name === 'ollama');
    const claudeProvider = providers.find(p => p.name === 'claude');
    const openaiProvider = providers.find(p => p.name === 'openai');

    let ollamaModels = [];
    if (ollamaProvider?.available) {
      try {
        const localData = await getLocalModels();
        ollamaModels = (localData.models || []).map(m => ({
          id: m.name || m.id,
          name: m.name || m.id,
          provider: 'ollama',
          available: true,
          size: m.size,
        }));
      } catch {
        ollamaModels = [{ id: 'llama3.2', name: 'Llama 3.2', provider: 'ollama', available: true }];
      }
    } else {
      ollamaModels = [{ id: 'llama3.2', name: 'Llama 3.2', provider: 'ollama', available: false }];
    }

    res.json({
      models: [
        ...ollamaModels,
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet', provider: 'claude', available: claudeProvider?.available ?? claudeAvailable },
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', available: openaiProvider?.available ?? openaiAvailable },
      ],
    });
  } catch {
    // model-router unreachable — return static list
    res.json({
      models: [
        { id: 'llama3.2', name: 'Llama 3.2', provider: 'ollama', available: false },
        { id: 'claude-sonnet-4-6', name: 'Claude Sonnet', provider: 'claude', available: claudeAvailable },
        { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', available: openaiAvailable },
      ],
    });
  }
});

// Pull an Ollama model
app.post('/api/v2/models/pull', async (req, res) => {
  const { model } = req.body;
  if (!model) return res.status(400).json({ error: 'model required' });
  try {
    await pullLocalModel(model);
    res.json({ success: true, message: `Pulling ${model}...` });
  } catch (e) {
    const msg = e.message || '';
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('Failed to fetch')) {
      res.json({ error: 'Ollama not running. Start with: docker run ollama/ollama' });
    } else {
      res.json({ error: msg || 'Pull failed' });
    }
  }
});

// Expert Agents
app.get('/api/v2/agents/expert', (req, res) => res.json(getAllExpertAgents()));
app.post('/api/v2/agents/route', (req, res) => {
  if (!req.body.task) return res.status(400).json({ error: 'task required' });
  res.json(findBestAgent(req.body.task));
});

// Ralph Loop
app.post('/api/v2/ralph', (req, res) => {
  if (!req.body.task) return res.status(400).json({ error: 'task required' });
  res.json(startRalphLoop(req.body.task, req.body));
});
app.get('/api/v2/ralph', (req, res) => res.json(getAllRalphLoops()));
app.get('/api/v2/ralph/:loopId', (req, res) => {
  const loop = getRalphStatus(req.params.loopId);
  return loop ? res.json(loop) : res.status(404).json({ error: 'Loop not found' });
});
app.delete('/api/v2/ralph/:loopId', (req, res) => {
  const ok = stopRalphLoop(req.params.loopId);
  res.json({ ok });
});

// Hooks
app.get('/api/v2/hooks', (req, res) => res.json(listHooks(req.query.event)));
app.post('/api/v2/hooks', (req, res) => {
  const { event, pattern, action, name, message } = req.body;
  if (!event || !action) return res.status(400).json({ error: 'event and action required' });
  const hookId = registerHook(event, pattern || null, action, { name, message });
  res.json({ hookId });
});

// SSE: Real-time hive mind feed
app.get('/api/v2/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Chat
app.get('/api/v2/chat/models', async (req, res) => {
  try {
    const data = await getProviders();
    const models = (data.providers || []).map(p => ({
      id: p.defaultModel || p.name,
      name: p.name,
      provider: p.name,
      available: p.available || false,
    }));
    res.json({ models });
  } catch (e) {
    res.json({ models: [] });
  }
});

app.post('/api/v2/chat', async (req, res) => {
  const { messages, model, provider } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }
  try {
    const result = await modelChat(messages, {
      model,
      provider,
      skipBudgetCheck: true,
    });
    res.json({
      content: result.content || result.response || '',
      provider: result.provider,
      model: result.model,
      tokens: result.tokensUsed,
    });
  } catch (e) {
    res.json({ error: 'No AI provider available. Start Ollama or set ANTHROPIC_API_KEY.' });
  }
});

// ── Error Handler ──────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: err.message });
});

// ── Start ──────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log('\n' + '═'.repeat(52));
  console.log('  🧠 Carbon Core v3 — Running');
  console.log('═'.repeat(52));
  console.log(`  Port:     ${PORT}`);
  console.log(`  Ping:     http://localhost:${PORT}/api/v2/ping`);
  console.log(`  Health:   http://localhost:${PORT}/api/v2/health`);
  console.log(`  Summary:  http://localhost:${PORT}/api/v2/summary`);
  console.log(`  Budget:   http://localhost:${PORT}/api/v2/budget`);
  console.log(`  VMs:      http://localhost:${PORT}/api/v2/vms`);
  console.log(`  Agents:   http://localhost:${PORT}/api/v2/agents/expert`);
  console.log(`  Ralph:    POST http://localhost:${PORT}/api/v2/ralph`);
  console.log(`  Stream:   http://localhost:${PORT}/api/v2/stream`);
  console.log('═'.repeat(52) + '\n');
});

module.exports = app;
