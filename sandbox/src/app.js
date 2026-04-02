'use strict';

const express = require('express');
const winston = require('winston');
const { serviceAuth } = require('./middleware/serviceAuth');
const sandboxRouter = require('./routes/sandbox');

// ─── Logger ───────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'sandbox' },
  transports: [new winston.transports.Console()],
});

// Make logger available globally within the service
module.exports.logger = logger;

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();

app.use(express.json({ limit: '1mb' }));

// ─── Request logging + metrics counter ───────────────────────────────────────
let totalRequests = 0;
app.use((req, _res, next) => {
  totalRequests++;
  logger.debug('incoming request', { method: req.method, path: req.path });
  next();
});

// ─── Health (unauthenticated) ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'sandbox',
    timestamp: new Date().toISOString(),
  });
});

// ─── Metrics (unauthenticated, Prometheus text format) ────────────────────────
// Active run count is maintained in the routes module.
const { getMetrics } = require('./routes/sandbox');

app.get('/metrics', (_req, res) => {
  const { runsTotal, runsActive } = getMetrics();
  res.set('Content-Type', 'text/plain');
  res.send(
    `# HELP sandbox_runs_total Total sandbox runs ever started\n` +
    `# TYPE sandbox_runs_total counter\n` +
    `sandbox_runs_total ${runsTotal}\n` +
    `# HELP sandbox_runs_active Currently active (running) sandbox containers\n` +
    `# TYPE sandbox_runs_active gauge\n` +
    `sandbox_runs_active ${runsActive}\n` +
    `# HELP sandbox_http_requests_total Total HTTP requests received\n` +
    `# TYPE sandbox_http_requests_total counter\n` +
    `sandbox_http_requests_total ${totalRequests}\n`
  );
});

// ─── Protected sandbox routes ─────────────────────────────────────────────────
app.use('/sandbox', serviceAuth, sandboxRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('unhandled error', { error: err.message, stack: err.stack });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;
