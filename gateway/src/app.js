'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const Redis = require('ioredis');

const { requestLogger } = require('./middleware/logger');
const { authMiddleware } = require('./middleware/auth');

const app = express();

// ─── Body Parser ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Request Logger ───────────────────────────────────────────────────────────
app.use(requestLogger);

// ─── Health Check (unauthenticated) ──────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'gateway', timestamp: new Date().toISOString() });
});

// ─── Prometheus metrics stub ─────────────────────────────────────────────────
let requestCount = 0;
app.use((req, _res, next) => {
  requestCount++;
  next();
});

app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`# HELP gateway_requests_total Total HTTP requests\n# TYPE gateway_requests_total counter\ngateway_requests_total ${requestCount}\n`);
});

// ─── Redis-backed Rate Limiter ────────────────────────────────────────────────
let redisClient = null;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: false,
    lazyConnect: true,
  });
  redisClient.on('error', (err) => {
    console.error(JSON.stringify({ level: 'error', service: 'gateway', message: 'Redis error', error: err.message }));
  });
}

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/health' || req.path === '/metrics',
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests, please slow down.' });
  },
});

app.use(limiter);

// ─── Auth Middleware (applied to all /api/* routes) ───────────────────────────
app.use('/api', authMiddleware);

// ─── Proxy helper factory ─────────────────────────────────────────────────────
const makeProxy = (target, pathRewrite) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    on: {
      error: (err, _req, res) => {
        console.error(JSON.stringify({
          level: 'error',
          service: 'gateway',
          message: 'Proxy error',
          error: err.message,
          target,
        }));
        if (!res.headersSent) {
          res.status(502).json({ error: 'Bad gateway', message: 'Upstream service unavailable' });
        }
      },
    },
  });
};

// ─── Proxy Routes ─────────────────────────────────────────────────────────────
const OPENCLAW_SERVICE_URL = process.env.OPENCLAW_SERVICE_URL || 'http://openclaw:8001';
const NEMOCLAW_SERVICE_URL = process.env.NEMOCLAW_SERVICE_URL || 'http://nemoclaw:8002';
const DATA_SERVER_URL = process.env.DATA_SERVER_URL || 'http://data-server:3002';
const VM_MANAGER_URL = process.env.VM_MANAGER_URL || 'http://vm-manager:3003';
const MODEL_ROUTER_URL = process.env.MODEL_ROUTER_URL || 'http://model-router:3004';

// OpenClaw — AI code intelligence
app.use(
  '/api/openclaw',
  makeProxy(OPENCLAW_SERVICE_URL, { '^/api/openclaw': '' })
);

// NemoClaw — AI NLP intelligence
app.use(
  '/api/nemoclaw',
  makeProxy(NEMOCLAW_SERVICE_URL, { '^/api/nemoclaw': '' })
);

// Data Server — storage service
app.use(
  '/api/data',
  makeProxy(DATA_SERVER_URL, { '^/api/data': '' })
);

// VM Manager — admin only
app.use('/api/vm', (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
  }
  next();
}, makeProxy(VM_MANAGER_URL, { '^/api/vm': '' }));

// Model Router — universal AI chat/embed/models (/api/models/*, /api/chat, /api/embed)
app.use(
  '/api/models',
  makeProxy(MODEL_ROUTER_URL, { '^/api/models': '/models' })
);

app.use(
  '/api/chat',
  makeProxy(MODEL_ROUTER_URL, { '^/api/chat': '/chat' })
);

app.use(
  '/api/embed',
  makeProxy(MODEL_ROUTER_URL, { '^/api/embed': '/embed' })
);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(JSON.stringify({
    level: 'error',
    service: 'gateway',
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  }));
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;
