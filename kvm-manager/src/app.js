'use strict';

const express = require('express');
const winston = require('winston');
const { serviceAuth } = require('./middleware/serviceAuth');
const vmRoutes = require('./routes/vms');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'kvm-manager' },
  transports: [new winston.transports.Console()],
});

const app = express();
app.use(express.json({ limit: '1mb' }));

// ── Metrics ───────────────────────────────────────────────────────────────────
let requestCount = 0;
app.use((_req, _res, next) => { requestCount++; next(); });

// ── Health (unauthenticated) ──────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'kvm-manager', timestamp: new Date().toISOString() });
});

app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(
    `# HELP kvm_manager_requests_total Total HTTP requests\n` +
    `# TYPE kvm_manager_requests_total counter\n` +
    `kvm_manager_requests_total ${requestCount}\n`
  );
});

// ── VM routes (require service or admin token) ────────────────────────────────
app.use('/vms', serviceAuth, vmRoutes);

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('unhandled error', { error: err.message, stack: err.stack });
  res.status(err.status || 500).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;
