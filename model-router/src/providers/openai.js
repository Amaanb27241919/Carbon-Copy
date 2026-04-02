'use strict';

const { OpenAI } = require('openai');
const { logger } = require('../utils/logger');

const getClient = () => {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || 'placeholder',
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  });
};

const DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o';

/**
 * Returns true if OPENAI_API_KEY is configured.
 */
const isAvailable = () => {
  return !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '');
};

/**
 * Chat completion via OpenAI (or any OpenAI-compatible endpoint).
 * @param {Array} messages - OpenAI-format messages array
 * @param {string} [model]
 * @param {Object} [options]
 * @returns {Promise<{content, model, provider, usage}>}
 */
const chat = async (messages, model, options = {}) => {
  const client = getClient();
  const resolvedModel = model || DEFAULT_MODEL;

  const params = {
    model: resolvedModel,
    messages,
    temperature: options.temperature !== undefined ? options.temperature : 0.7,
    max_tokens: options.max_tokens || 2048,
  };

  logger.info('OpenAI chat request', { model: resolvedModel });

  const response = await client.chat.completions.create(params);
  const choice = response.choices[0];

  return {
    content: choice.message.content,
    model: response.model,
    provider: 'openai',
    usage: {
      input_tokens: response.usage ? response.usage.prompt_tokens : 0,
      output_tokens: response.usage ? response.usage.completion_tokens : 0,
    },
  };
};

/**
 * Embedding via OpenAI.
 * @param {string[]} texts
 * @param {string} [model]
 * @returns {Promise<{embeddings, model, provider}>}
 */
const embed = async (texts, model) => {
  const client = getClient();
  const resolvedModel = model || 'text-embedding-3-small';

  logger.info('OpenAI embed request', { model: resolvedModel, count: texts.length });

  const response = await client.embeddings.create({
    model: resolvedModel,
    input: texts,
  });

  return {
    embeddings: response.data.map((d) => d.embedding),
    model: resolvedModel,
    provider: 'openai',
  };
};

/**
 * List models available via the configured OpenAI-compatible endpoint.
 * @returns {Promise<string[]>}
 */
const listModels = async () => {
  try {
    const client = getClient();
    const response = await client.models.list();
    return response.data.map((m) => m.id);
  } catch (err) {
    logger.warn('OpenAI listModels failed', { error: err.message });
    return [DEFAULT_MODEL, 'gpt-4o-mini', 'gpt-3.5-turbo'];
  }
};

module.exports = { chat, embed, listModels, isAvailable };
