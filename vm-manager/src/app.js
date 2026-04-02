'use strict';

const express = require('express');
const winston = require('winston');
const { serviceAuth } = require('./middleware/serviceAuth');
const docker = require('./services/docker');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'vm-manager' },
  transports: [new winston.transports.Console()],
});

const app = express();
app.use(express.json({ limit: '1mb' }));

// ─── Metrics ─────────────────────────────────────────────────────────────────
let requestCount = 0;
app.use((_req, _res, next) => { requestCount++; next(); });

// ─── Health (unauthenticated) ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'vm-manager', timestamp: new Date().toISOString() });
});

app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`# HELP vm_manager_requests_total Total HTTP requests\n# TYPE vm_manager_requests_total counter\nvm_manager_requests_total ${requestCount}\n`);
});

// ─── Apply service auth to all container routes ───────────────────────────────
app.use('/containers', serviceAuth);

// ─── GET /containers ──────────────────────────────────────────────────────────
app.get('/containers', async (_req, res) => {
  try {
    const containers = await docker.listContainers();
    return res.json({ containers });
  } catch (err) {
    logger.error('GET /containers error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// ─── POST /containers/:name/start ─────────────────────────────────────────────
app.post('/containers/:name/start', async (req, res) => {
  const { name } = req.params;
  try {
    await docker.startContainer(name);
    logger.info('container started', { container: name });
    return res.json({ message: `Container ${name} started successfully` });
  } catch (err) {
    if (err.statusCode === 304) {
      return res.status(409).json({ error: 'Conflict', message: 'Container is already running' });
    }
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'Not found', message: `Container ${name} not found` });
    }
    logger.error('start container error', { container: name, error: err.message });
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// ─── POST /containers/:name/stop ──────────────────────────────────────────────
app.post('/containers/:name/stop', async (req, res) => {
  const { name } = req.params;
  try {
    await docker.stopContainer(name);
    logger.info('container stopped', { container: name });
    return res.json({ message: `Container ${name} stopped successfully` });
  } catch (err) {
    if (err.statusCode === 304) {
      return res.status(409).json({ error: 'Conflict', message: 'Container is already stopped' });
    }
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'Not found', message: `Container ${name} not found` });
    }
    logger.error('stop container error', { container: name, error: err.message });
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// ─── POST /containers/:name/restart ───────────────────────────────────────────
app.post('/containers/:name/restart', async (req, res) => {
  const { name } = req.params;
  try {
    await docker.restartContainer(name);
    logger.info('container restarted', { container: name });
    return res.json({ message: `Container ${name} restarted successfully` });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'Not found', message: `Container ${name} not found` });
    }
    logger.error('restart container error', { container: name, error: err.message });
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// ─── GET /containers/:name/logs ───────────────────────────────────────────────
app.get('/containers/:name/logs', async (req, res) => {
  const { name } = req.params;
  const tail = parseInt(req.query.tail || '100', 10);
  try {
    const logs = await docker.getContainerLogs(name, tail);
    return res.json({ container: name, logs });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'Not found', message: `Container ${name} not found` });
    }
    logger.error('get logs error', { container: name, error: err.message });
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// ─── GET /containers/:name/stats ──────────────────────────────────────────────
app.get('/containers/:name/stats', async (req, res) => {
  const { name } = req.params;
  try {
    const stats = await docker.getContainerStats(name);
    return res.json({ container: name, stats });
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'Not found', message: `Container ${name} not found` });
    }
    logger.error('get stats error', { container: name, error: err.message });
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('unhandled error', { error: err.message, stack: err.stack });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;
