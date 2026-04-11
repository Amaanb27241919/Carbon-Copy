'use strict';

const express = require('express');
const { logger } = require('./utils/logger');
const { getAvailableProviders } = require('./providers');

const chatRouter = require('./routes/chat');
const embedRouter = require('./routes/embed');
const modelsRouter = require('./routes/models');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Request logging ──────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info('Incoming request', { method: req.method, path: req.path });
  next();
});

// ─── Metrics counter ──────────────────────────────────────────────────────────
let requestCount = 0;
let chatCount = 0;
let embedCount = 0;

app.use((req, _res, next) => {
  requestCount++;
  if (req.path.startsWith('/chat')) chatCount++;
  if (req.path.startsWith('/embed')) embedCount++;
  next();
});

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const available = await getAvailableProviders();
    return res.json({
      status: 'ok',
      service: 'model-router',
      providers: available,
    });
  } catch (err) {
    return res.json({ status: 'ok', service: 'model-router', providers: [], error: err.message });
  }
});

// ─── Prometheus metrics ───────────────────────────────────────────────────────
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send([
    '# HELP model_router_requests_total Total HTTP requests',
    '# TYPE model_router_requests_total counter',
    `model_router_requests_total ${requestCount}`,
    '# HELP model_router_chat_requests_total Total chat requests',
    '# TYPE model_router_chat_requests_total counter',
    `model_router_chat_requests_total ${chatCount}`,
    '# HELP model_router_embed_requests_total Total embed requests',
    '# TYPE model_router_embed_requests_total counter',
    `model_router_embed_requests_total ${embedCount}`,
  ].join('\n') + '\n');
});

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /chat — universal chat completion
app.use('/chat', chatRouter);

// OpenAI-compatible endpoint for services using the OpenAI SDK
app.post('/v1/chat/completions', async (req, res) => {
  const { resolveProvider, getProvider } = require('./providers');
  try {
    const messages = req.body.messages || [];
    const providerName = process.env.DEFAULT_PROVIDER || 'ollama';
    const model = req.body.model;
    const providerKey = await resolveProvider(providerName);
    const provider = getProvider(providerKey);
    if (!provider) return res.status(503).json({ error: { message: 'Provider unavailable' } });
    const result = await provider.chat(messages, model, req.body.options || {});
    // Return OpenAI-compatible format
    res.json({
      id: 'chatcmpl-carbon-' + Date.now(),
      object: 'chat.completion',
      model: model || providerKey,
      choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: result.tokensUsed || 0 },
    });
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
});

// POST /embed — universal embedding
app.use('/embed', embedRouter);

// GET /models, GET /providers, POST /models/pull
app.use('/models', modelsRouter);

// GET /providers (convenience alias)
app.get('/providers', async (_req, res) => {
  try {
    const available = await getAvailableProviders();
    return res.json({ providers: available });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ─── Error handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;
