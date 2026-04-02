'use strict';

const express = require('express');
const { z } = require('zod');
const { providers, getAvailableProviders, getProvider } = require('../providers');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * GET /models — combined list of models from all available providers
 */
router.get('/', async (_req, res) => {
  try {
    const available = await getAvailableProviders();
    const modelLists = await Promise.all(
      available
        .filter((p) => p.available)
        .map(async (p) => {
          try {
            const adapter = getProvider(p.name);
            const models = await adapter.listModels();
            return models.map((m) => ({ model: m, provider: p.name }));
          } catch (err) {
            logger.warn('listModels failed for provider', { provider: p.name, error: err.message });
            return [];
          }
        })
    );

    const allModels = modelLists.flat();
    return res.json({ models: allModels, count: allModels.length });
  } catch (err) {
    logger.error('GET /models error', { error: err.message });
    return res.status(500).json({ error: 'Failed to list models', message: err.message });
  }
});

/**
 * GET /providers — status of each configured provider
 */
router.get('/providers', async (_req, res) => {
  try {
    const available = await getAvailableProviders();
    return res.json({ providers: available });
  } catch (err) {
    logger.error('GET /providers error', { error: err.message });
    return res.status(500).json({ error: 'Failed to list providers', message: err.message });
  }
});

const PullRequestSchema = z.object({
  provider: z.literal('ollama'),
  model: z.string().min(1),
});

/**
 * POST /models/pull — pull an Ollama model by name
 */
router.post('/pull', async (req, res) => {
  try {
    const parsed = PullRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.errors,
      });
    }

    const { model } = parsed.data;
    const ollamaAdapter = providers.ollama;

    if (!ollamaAdapter.pullModel) {
      return res.status(400).json({ error: 'pullModel not supported by this provider' });
    }

    logger.info('Pulling Ollama model', { model });
    await ollamaAdapter.pullModel(model);

    return res.json({ success: true, model, message: `Model ${model} pulled successfully` });
  } catch (err) {
    logger.error('POST /models/pull error', { error: err.message });
    return res.status(500).json({ error: 'Failed to pull model', message: err.message });
  }
});

module.exports = router;
