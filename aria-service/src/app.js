'use strict';

const express = require('express');
const orchestrator = require('./orchestrator');

const missionsRouter = require('./routes/missions');
const agentsRouter = require('./routes/agents');
const clientsRouter = require('./routes/clients');
const watchdogRouter = require('./routes/watchdog');
const dossierRouter = require('./routes/dossier');
const blueprintsRouter = require('./routes/blueprints');
const budgetRouter = require('./routes/budget');

const app = express();
app.use(express.json({ limit: '10mb' }));

// ─── Metrics ─────────────────────────────────────────────────────────────────
let requestCount = 0;
app.use((_req, _res, next) => {
  requestCount++;
  next();
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const status = orchestrator.getStatus();
  return res.json({
    status: 'ok',
    service: 'aria-service',
    agents: status.agents,
    budget: status.budget,
    timestamp: new Date().toISOString(),
  });
});

// ─── Metrics (Prometheus scrape target) ──────────────────────────────────────
app.get('/metrics', (_req, res) => {
  const status = orchestrator.getStatus();
  const lines = [
    '# HELP aria_requests_total Total HTTP requests',
    '# TYPE aria_requests_total counter',
    `aria_requests_total ${requestCount}`,
    '# HELP aria_budget_spent_today_usd Budget spent today in USD',
    '# TYPE aria_budget_spent_today_usd gauge',
    `aria_budget_spent_today_usd ${status.budget.spentToday}`,
    '# HELP aria_tasks_queued Number of tasks in queue',
    '# TYPE aria_tasks_queued gauge',
    `aria_tasks_queued ${status.queuedTasks}`,
  ];
  res.set('Content-Type', 'text/plain');
  return res.send(lines.join('\n') + '\n');
});

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/missions', missionsRouter);
app.use('/agents', agentsRouter);
app.use('/clients', clientsRouter);
app.use('/watchdog', watchdogRouter);
app.use('/dossier', dossierRouter);
app.use('/blueprints', blueprintsRouter);
app.use('/budget', budgetRouter);

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ status: 'error', error: 'Not found' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(JSON.stringify({
    level: 'error',
    service: 'aria-service',
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  }));
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ status: 'error', error: 'Internal server error', message: err.message });
});

module.exports = app;
