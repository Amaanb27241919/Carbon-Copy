/**
 * Carbon Core v2 — Dashboard API
 * 
 * Unified REST API exposing all Carbon Core v2 services:
 * - Budget governance
 * - Heartbeat execution tracking
 * - Activity audit log
 * - Health monitoring
 * - Multi-agent orchestration
 * - Claude usage tracking
 * - Proposal generation
 * - Knowledge base (RAG)
 * - SSE real-time hive mind feed
 */

import express from 'express';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ── Services ────────────────────────────────────────────────────────

import {
  getBudgetDashboard,
  getAgentBudgetSummary,
  createBudgetPolicy,
  resumeAgent,
  pauseAgent,
  getAllPolicies,
  getRecentIncidents,
} from './core/budget-v2.js';

import {
  getRecentRuns,
  getAgentStats,
  getActiveRuns,
  getTotalRuns,
} from './core/heartbeat-v2.js';

import {
  getRecentActivity,
  getActivityByEntity,
  getActivityByActor,
  getActivityCount,
} from './core/audit-v2.js';

import { getHealthStatus } from './core/health-v2.js';

import {
  orchestrate,
  orchestratePhased,
  getAllOrchestrationRuns,
  getOrchestrationRun,
} from './core/orchestrator-v2.js';

import { getUsageSummary, getUsageWindow, scanUsage } from './core/usage-tracker.js';
import { generateProposal } from './core/proposal-service.js';

// SSE clients for hive mind feed
const sseClients = new Set();

// ── Router ──────────────────────────────────────────────────────────

export function createDashboardV2Router() {
  const router = express.Router();

  // ── Health ──────────────────────────────────────────────────────

  router.get('/health', async (req, res) => {
    try {
      const health = await getHealthStatus();
      res.json(health);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Budget ──────────────────────────────────────────────────────

  router.get('/budget', (req, res) => {
    res.json(getBudgetDashboard());
  });

  router.get('/budget/:agentId', (req, res) => {
    res.json(getAgentBudgetSummary(req.params.agentId));
  });

  router.post('/budget/policy', (req, res) => {
    const { scope, scope_id, window, limit_usd, warning_threshold, auto_pause } = req.body;
    if (!scope || !scope_id || !window || !limit_usd) {
      return res.status(400).json({ error: 'Missing required fields: scope, scope_id, window, limit_usd' });
    }
    const policy = createBudgetPolicy(scope, scope_id, window, limit_usd, { warningThreshold: warning_threshold, autoPause: auto_pause });
    res.json(policy);
  });

  router.post('/budget/:agentId/pause', (req, res) => {
    pauseAgent(req.params.agentId);
    res.json({ success: true, agent_id: req.params.agentId, status: 'paused' });
  });

  router.post('/budget/:agentId/resume', (req, res) => {
    resumeAgent(req.params.agentId);
    res.json({ success: true, agent_id: req.params.agentId, status: 'resumed' });
  });

  // ── Heartbeat ───────────────────────────────────────────────────

  router.get('/heartbeat', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const agentId = req.query.agent_id;
    res.json({
      runs: getRecentRuns(limit, agentId),
      active: getActiveRuns(),
      total: getTotalRuns(),
    });
  });

  router.get('/heartbeat/stats/:agentId', (req, res) => {
    res.json(getAgentStats(req.params.agentId));
  });

  // ── Activity Log ────────────────────────────────────────────────

  router.get('/activity', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const entity_type = req.query.entity_type;
    const actor_id = req.query.actor_id;

    let entries;
    if (entity_type) entries = getActivityByEntity(entity_type, limit);
    else if (actor_id) entries = getActivityByActor(actor_id, limit);
    else entries = getRecentActivity(limit, offset);

    res.json({ entries, total: getActivityCount() });
  });

  // ── Orchestration ───────────────────────────────────────────────

  router.get('/orchestration', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    res.json(getAllOrchestrationRuns({ limit }));
  });

  router.get('/orchestration/:runId', (req, res) => {
    const run = getOrchestrationRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  });

  router.post('/orchestration', (req, res) => {
    const { task, agents, mode, options, userId } = req.body;
    if (!task) return res.status(400).json({ error: 'task is required' });

    if (mode === 'phased') {
      const result = orchestratePhased({ task, options, userId });
      res.json(result);
    } else {
      if (!agents || !agents.length) return res.status(400).json({ error: 'agents array is required for non-phased modes' });
      const result = orchestrate({ task, agents, mode: mode || 'parallel', options, userId });
      res.json(result);
    }
  });

  // ── Usage Tracking ──────────────────────────────────────────────

  router.get('/usage', (req, res) => {
    try {
      const summary = getUsageSummary();
      res.json(summary);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/usage/window', (req, res) => {
    const days = parseInt(req.query.days) || 7;
    try {
      res.json(getUsageWindow(days));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/usage/sessions', (req, res) => {
    try {
      const sessions = scanUsage();
      const limit = parseInt(req.query.limit) || 50;
      res.json(sessions.slice(0, limit));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── Proposal Generation ──────────────────────────────────────────

  router.post('/proposal', async (req, res) => {
    const { lead_data, transcript } = req.body;
    if (!transcript) return res.status(400).json({ error: 'transcript is required' });

    try {
      const proposal = await generateProposal(lead_data || {}, transcript);
      res.json(proposal);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── SSE: Hive Mind Feed ──────────────────────────────────────────

  router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const client = { id: Date.now(), res };
    sseClients.add(client);

    // Send initial snapshot
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    req.on('close', () => { sseClients.delete(client); });
  });

  // ── Dashboard Summary ────────────────────────────────────────────

  router.get('/summary', async (req, res) => {
    try {
      const [health, usage] = await Promise.all([
        getHealthStatus().catch(() => ({ status: 'unknown' })),
        Promise.resolve(getUsageWindow(30)).catch(() => null),
      ]);

      res.json({
        health: health.status,
        active_runs: getActiveRuns().length,
        total_runs: getTotalRuns(),
        activity_count: getActivityCount(),
        budget: getBudgetDashboard(),
        usage_30d: usage,
        recent_activity: getRecentActivity(5),
        timestamp: Date.now(),
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

// ── SSE Broadcast Helper ────────────────────────────────────────────

export function broadcastToHiveMind(event) {
  const data = JSON.stringify({ ...event, timestamp: Date.now() });
  for (const client of sseClients) {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}
