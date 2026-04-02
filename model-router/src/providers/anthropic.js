'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const { logger } = require('../utils/logger');

const DEFAULT_MODEL = process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-sonnet-4-6';

const getClient = () => {
  return new Anthropic.default({
    apiKey: process.env.ANTHROPIC_API_KEY || 'placeholder',
  });
};

/**
 * Returns true if ANTHROPIC_API_KEY is configured.
 */
const isAvailable = () => {
  return !!(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim() !== '');
};

/**
 * Convert OpenAI-format messages to Anthropic format.
 * Extracts system message and converts remaining messages.
 * @param {Array} messages
 * @returns {{ system: string|undefined, messages: Array }}
 */
const convertMessages = (messages) => {
  let system;
  const converted = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system = msg.content;
    } else {
      converted.push({ role: msg.role, content: msg.content });
    }
  }

  return { system, messages: converted };
};

/**
 * Chat completion via Anthropic Claude.
 * @param {Array} messages - OpenAI-format messages array
 * @param {string} [model]
 * @param {Object} [options]
 * @returns {Promise<{content, model, provider, usage}>}
 */
const chat = async (messages, model, options = {}) => {
  const client = getClient();
  const resolvedModel = model || DEFAULT_MODEL;
  const { system, messages: anthropicMessages } = convertMessages(messages);

  const params = {
    model: resolvedModel,
    messages: anthropicMessages,
    max_tokens: options.max_tokens || 2048,
  };

  if (system) {
    params.system = system;
  }

  if (options.temperature !== undefined) {
    params.temperature = options.temperature;
  }

  logger.info('Anthropic chat request', { model: resolvedModel });

  const response = await client.messages.create(params);
  const textBlock = response.content.find((b) => b.type === 'text');

  return {
    content: textBlock ? textBlock.text : '',
    model: response.model,
    provider: 'claude',
    usage: {
      input_tokens: response.usage ? response.usage.input_tokens : 0,
      output_tokens: response.usage ? response.usage.output_tokens : 0,
    },
  };
};

/**
 * Anthropic does not support embeddings.
 */
const embed = async (_texts, _model) => {
  throw new Error('Anthropic does not support embeddings — use OpenAI or Ollama');
};

/**
 * Return known Anthropic models.
 * @returns {Promise<string[]>}
 */
const listModels = async () => {
  return [
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-haiku-4-5-20251001',
  ];
};

module.exports = { chat, embed, listModels, isAvailable };
