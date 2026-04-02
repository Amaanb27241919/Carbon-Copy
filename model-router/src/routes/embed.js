'use strict';

const express = require('express');
const { z } = require('zod');
const { resolveProvider, getProvider } = require('../providers');
const { logger } = require('../utils/logger');

const router = express.Router();

const EmbedRequestSchema = z.object({
  texts: z.array(z.string()).min(1, 'texts array must not be empty'),
  provider: z.string().optional(),
  model: z.string().optional(),
});

router.post('/', async (req, res) => {
  try {
    const parsed = EmbedRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.errors,
      });
    }

    const { texts, provider: requestedProvider, model } = parsed.data;

    const providerName = await resolveProvider(requestedProvider);
    const adapter = getProvider(providerName);

    logger.info('Embed request', { provider: providerName, count: texts.length });

    const result = await adapter.embed(texts, model);

    return res.json({
      embeddings: result.embeddings,
      model: result.model,
      provider: result.provider,
      output_id: `embed_${Date.now()}`,
    });
  } catch (err) {
    logger.error('Embed error', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Embedding failed', message: err.message });
  }
});

module.exports = router;
