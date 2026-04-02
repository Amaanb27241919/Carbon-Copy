'use strict';

const express = require('express');
const { z } = require('zod');
const { resolveProvider, getProvider } = require('../providers');
const { logger } = require('../utils/logger');

const router = express.Router();

const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    })
  ).min(1, 'messages array must not be empty'),
  provider: z.string().optional(),
  model: z.string().optional(),
  options: z
    .object({
      temperature: z.number().min(0).max(2).optional(),
      max_tokens: z.number().int().positive().optional(),
    })
    .optional()
    .default({}),
});

router.post('/', async (req, res) => {
  try {
    const parsed = ChatRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.errors,
      });
    }

    const { messages, provider: requestedProvider, model, options } = parsed.data;

    const providerName = await resolveProvider(requestedProvider);
    const adapter = getProvider(providerName);

    logger.info('Chat request', { provider: providerName, model: model || 'default' });

    const result = await adapter.chat(messages, model, options);

    return res.json(result);
  } catch (err) {
    logger.error('Chat error', { error: err.message, stack: err.stack });
    return res.status(500).json({ error: 'Chat completion failed', message: err.message });
  }
});

module.exports = router;
