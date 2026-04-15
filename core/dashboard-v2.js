'use strict';
// Dashboard API v2 — Carbon Core
// All /api/v2/* routes. SSE stream for real-time activity feed.
// Mounts on existing Express app via setupDashboardV2Routes(app, db).

const { getHealthStatus, getLastHealthStatus } = require('./health-v2.js');
const { getBudgetDashboard, getAgentBudgetSummary, getAllPolicies, getRecentIncidents, createBudgetPolicy, resumeAgent, pauseAgent } = require('./budget-v2.js');
const { getRecentRuns, getActiveRuns, getTotalRuns, getAgentStats } = require('./heartbeat-v2.js');
const { getRecentActivity, getActivityByEntity, getActivityByActor, getActivityCount } = require('./audit-v2.js');
const { scanUsage, getSessionSummary, getModelBreakdown, getTotalUsageStats } = require('./usage-tracker.js');
const { getAllOrchestrationRuns, getOrchestrationRun, getActiveRuns: getActiveOrchRuns, orchestrate } = require('./orchestrator-v2.js');
const { search: knowledgeSearch, getStats: getKnowledgeStats, getCategories, getAllDocs } = require('./knowledge-service.js');
const { generateProposal, getRecentProposals, getProposal } = require('./proposal-service.js');
const { getAllPlugins, getPlugin, emitEvent } = require('./plugin-system.js');

/** @type {Set<import('http').ServerResponse>} */
const sseClients = new Set();

/**
 * Broadcast an activity entry to all connected SSE clients.
 * @param {object} entry
 */
function broadcastActivity(entry) {
  const payload = `event: activity\ndata: ${JSON.stringify(entry)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

/**
 * Register all /api/v2/* routes on the provided Express app.
 * @param {import('express').Application} app
 * @param {object} db
 */
function setupDashboardV2Routes(app, db) {

  // ── Health ──────────────────────────────────────────────────────────────────

  app.get('/api/v2/health', async (req, res) => {
    try {
      const status = await getHealthStatus();
      res.json(status);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Budget ──────────────────────────────────────────────────────────────────

  app.get('/api/v2/budget', async (req, res) => {
    try {
      const { agent_id } = req.query;
      if (agent_id) {
        const summary = await getAgentBudgetSummary(agent_id);
        return res.json(summary);
      }
      const dashboard = await getBudgetDashboard();
      res.json(dashboard);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/budget/policies', async (req, res) => {
    try {
      const { scope, scope_id, window, limit_usd, warning_threshold, auto_pause } = req.body;
      if (!scope || limit_usd == null) {
        return res.status(400).json({ error: 'scope and limit_usd are required' });
      }
      const policy = await createBudgetPolicy({ scope, scope_id, window, limit_usd, warning_threshold, auto_pause });
      res.status(201).json(policy);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/budget/agents/:agentId/resume', async (req, res) => {
    try {
      const { agentId } = req.params;
      await resumeAgent(agentId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  app.get('/api/v2/heartbeat', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const { agent_id } = req.query;

      if (agent_id) {
        const stats = await getAgentStats(agent_id);
        return res.json(stats);
      }

      const [runs, active, total] = await Promise.all([
        getRecentRuns(limit),
        getActiveRuns(),
        getTotalRuns(),
      ]);

      res.json({ runs, active, total });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Activity ────────────────────────────────────────────────────────────────

  app.get('/api/v2/activity', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const offset = parseInt(req.query.offset, 10) || 0;
      const { entity_type, actor_id } = req.query;

      let entries;
      if (entity_type) {
        entries = await getActivityByEntity(entity_type, { limit, offset });
      } else if (actor_id) {
        entries = await getActivityByActor(actor_id, { limit, offset });
      } else {
        entries = await getRecentActivity(limit, offset);
      }

      const total = await getActivityCount();
      res.json({ entries, total });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Usage ───────────────────────────────────────────────────────────────────

  app.get('/api/v2/usage', async (req, res) => {
    try {
      const [stats, sessions, models] = await Promise.all([
        getTotalUsageStats(),
        getSessionSummary(20),
        getModelBreakdown(),
      ]);
      res.json({ stats, sessions, models });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/usage/scan', async (req, res) => {
    try {
      const result = await scanUsage();
      res.json({ success: true, result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Orchestration ───────────────────────────────────────────────────────────

  app.get('/api/v2/orchestration', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const [runs, active] = await Promise.all([
        getAllOrchestrationRuns({ limit }),
        getActiveOrchRuns(),
      ]);
      res.json({ runs, active });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/orchestration/:runId', async (req, res) => {
    try {
      const run = await getOrchestrationRun(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      res.json(run);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/orchestration', async (req, res) => {
    try {
      const { task, agents, mode = 'parallel', userId } = req.body;
      if (!task) return res.status(400).json({ error: 'task is required' });

      const runId = await orchestrate({ task, agents, mode, userId });
      res.status(201).json({ runId });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Knowledge ───────────────────────────────────────────────────────────────

  app.get('/api/v2/knowledge/search', async (req, res) => {
    try {
      const { q, category } = req.query;
      const limit = parseInt(req.query.limit, 10) || 10;

      if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

      const results = await knowledgeSearch(q, { limit, category });
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/knowledge/stats', async (req, res) => {
    try {
      const [stats, categories] = await Promise.all([
        getKnowledgeStats(),
        getCategories(),
      ]);
      res.json({ stats, categories });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/knowledge/docs', async (req, res) => {
    try {
      const { category } = req.query;
      const limit = parseInt(req.query.limit, 10) || 20;
      const docs = await getAllDocs({ category, limit });
      res.json(docs);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Proposals ───────────────────────────────────────────────────────────────

  app.post('/api/v2/proposal', async (req, res) => {
    try {
      const { lead_data, transcript } = req.body;
      if (!lead_data || !transcript) {
        return res.status(400).json({ error: 'lead_data and transcript are required' });
      }
      const result = await generateProposal(lead_data, transcript);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.get('/api/v2/proposals', async (req, res) => {
    try {
      const proposals = await getRecentProposals(20);
      res.json({ proposals });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/v2/proposals/:id', async (req, res) => {
    try {
      const proposal = await getProposal(req.params.id);
      if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
      res.json(proposal);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Plugins ─────────────────────────────────────────────────────────────────

  app.get('/api/v2/plugins', async (req, res) => {
    try {
      const plugins = await getAllPlugins();
      res.json({ plugins });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/v2/plugins/:pluginId/event', async (req, res) => {
    try {
      const { event_type, payload } = req.body;
      if (!event_type) return res.status(400).json({ error: 'event_type is required' });

      const results = await emitEvent(event_type, payload);
      res.json(results);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── SSE Stream ──────────────────────────────────────────────────────────────

  app.get('/api/v2/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    sseClients.add(res);

    // Initial connected event
    res.write(`event: connected\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);

    // Keepalive ping every 15 seconds
    const pingInterval = setInterval(() => {
      try {
        res.write(`event: ping\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
      } catch {
        clearInterval(pingInterval);
        sseClients.delete(res);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(pingInterval);
      sseClients.delete(res);
    });
  });
}

module.exports = { setupDashboardV2Routes, broadcastActivity };
