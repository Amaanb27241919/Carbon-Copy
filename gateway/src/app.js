'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { createProxyMiddleware } = require('http-proxy-middleware');
const Redis = require('ioredis');

const { requestLogger } = require('./middleware/logger');
const { authMiddleware } = require('./middleware/auth');

const app = express();

// ─── Body Parser ─────────────────────────────────────────────────────────────
app.set('trust proxy', 1);  // trust nginx proxy

// Auth forward must be BEFORE express.json() so body stream is not consumed
const httpLib = require('http');
const AUTH_HOST = (process.env.AUTH_SERVICE_URL || 'http://auth:3001').replace('http://','').split(':');
app.use('/auth', (req, res) => {
  const options = {
    hostname: AUTH_HOST[0],
    port: parseInt(AUTH_HOST[1]) || 3001,
    path: '/auth' + req.url,
    method: req.method,
    headers: { ...req.headers, host: AUTH_HOST[0] },
  };
  const proxy = httpLib.request(options, (authRes) => {
    res.status(authRes.statusCode);
    Object.entries(authRes.headers).forEach(([k,v]) => { try { res.setHeader(k,v); } catch(_){} });
    authRes.pipe(res);
  });
  proxy.on('error', (e) => res.status(502).json({ error: 'Auth unavailable', message: e.message }));
  req.pipe(proxy);
});

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
  validate: { xForwardedForHeader: false }, // trust proxy is set, suppress warning
  skip: (req) => req.path === '/health' || req.path === '/metrics',
  handler: (_req, res) => {
    res.status(429).json({ error: 'Too many requests, please slow down.' });
  },
});

// app.use(limiter); // temporarily disabled for debugging

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
const AUTH_SERVICE_URL_PROXY = process.env.AUTH_SERVICE_URL || 'http://auth:3001';
const OPENCLAW_SERVICE_URL  = process.env.OPENCLAW_SERVICE_URL  || 'http://openclaw:8001';
const NEMOCLAW_SERVICE_URL  = process.env.NEMOCLAW_SERVICE_URL  || 'http://nemoclaw:8002';
const DATA_SERVER_URL       = process.env.DATA_SERVER_URL       || 'http://data-server:3002';
const VM_MANAGER_URL        = process.env.VM_MANAGER_URL        || 'http://vm-manager:3003';
const MODEL_ROUTER_URL      = process.env.MODEL_ROUTER_URL      || 'http://model-router:3004';
const KVM_MANAGER_URL       = process.env.KVM_MANAGER_URL       || 'http://kvm-manager:3007';
const ARIA_SERVICE_URL      = process.env.ARIA_SERVICE_URL      || 'http://aria-service:3008';

// Body-aware proxy: re-attaches JSON body after express.json() consumed it
const makeBodyProxy = (target, pathRewrite) => {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite,
    selfHandleResponse: false,
    on: {
      proxyReq: (proxyReq, req) => {
        if (req.body) {
          const body = JSON.stringify(req.body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(body));
          proxyReq.write(body);
          // Do NOT call proxyReq.end() - http-proxy-middleware handles that
        }
      },
      error: (err, _req, res) => {
        console.log(JSON.stringify({debug:'PROXY_ERROR',error:err.message,code:err.code}));
        if (!res.headersSent) res.status(502).json({ error: 'Bad gateway', message: err.message });
      },
    },
  });
};

// OpenClaw — AI code intelligence
app.use('/api/openclaw', makeBodyProxy(OPENCLAW_SERVICE_URL, { '^/api/openclaw': '' }));

// NemoClaw — AI NLP intelligence
app.use('/api/nemoclaw', makeBodyProxy(NEMOCLAW_SERVICE_URL, { '^/api/nemoclaw': '' }));

// Data Server — storage service
app.use(
  '/api/data',
  makeProxy(DATA_SERVER_URL, { '^/api/data': '' })
);

// VM Manager (Docker containers) — admin only
app.use('/api/vm', (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
  }
  next();
}, makeBodyProxy(VM_MANAGER_URL, { '^/api/vm': '' }));

// KVM Manager (QEMU/KVM virtual machines) — admin only
app.use('/api/kvm', (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden', message: 'Admin role required' });
  }
  next();
}, makeBodyProxy(KVM_MANAGER_URL, { '^/api/kvm': '' }));

// Model Router — universal AI chat/embed/models (/api/models/*, /api/chat, /api/embed)
app.use(
  '/api/models',
  makeBodyProxy(MODEL_ROUTER_URL, { '^/': '/models' })
);

app.use(
  '/api/chat',
  makeBodyProxy(MODEL_ROUTER_URL, { '^/': '/chat' })
);

app.use(
  '/api/embed',
  makeBodyProxy(MODEL_ROUTER_URL, { '^/': '/embed' })
);

// ARIA Service — intelligence platform (missions, watchdog, dossier, blueprints)
// Use native http.request to avoid http-proxy-middleware path rewrite issues
const http = require('http');
const [ARIA_HOST, ARIA_PORT] = (ARIA_SERVICE_URL.replace('http://', '')).split(':');

const pipeToAria = (ariaPath) => (req, res) => {
  const body = req.body && Object.keys(req.body).length ? JSON.stringify(req.body) : null;
  const subPath = req.url && req.url !== '/' ? req.url : '';
  const targetPath = ariaPath + subPath;
  const opts = {
    hostname: ARIA_HOST,
    port: parseInt(ARIA_PORT) || 3008,
    path: targetPath || '/',
    method: req.method,
    headers: {
      'content-type': 'application/json',
      'content-length': body ? Buffer.byteLength(body) : 0,
      'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN || '',
    },
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    res.status(proxyRes.statusCode);
    Object.entries(proxyRes.headers).forEach(([k, v]) => { try { res.setHeader(k, v); } catch(_){} });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => {
    console.error(JSON.stringify({ level: 'error', service: 'gateway', message: 'ARIA proxy error', error: e.message, path: targetPath }));
    if (!res.headersSent) res.status(502).json({ error: 'ARIA service unavailable', message: e.message });
  });
  if (body) proxyReq.write(body);
  proxyReq.end();
};

app.use('/api/missions',    pipeToAria('/missions'));
app.use('/api/watchdog',    pipeToAria('/watchdog'));
app.use('/api/dossier',     pipeToAria('/dossier'));
app.use('/api/blueprints',  pipeToAria('/blueprints'));
app.use('/api/agents',      pipeToAria('/agents'));
app.use('/api/clients',     pipeToAria('/clients'));
app.use('/api/aria-budget', pipeToAria('/budget'));
app.use('/api/aria',        pipeToAria(''));

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
