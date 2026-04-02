'use strict';

const axios = require('axios');
const { logger } = require('../utils/logger');

const BASE_URL = () => process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const DEFAULT_MODEL = () => process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2';

/**
 * Returns true if Ollama API is reachable.
 */
const isAvailable = async () => {
  try {
    await axios.get(`${BASE_URL()}/api/tags`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
};

/**
 * Chat completion via Ollama.
 * @param {Array} messages - OpenAI-format messages array
 * @param {string} [model]
 * @param {Object} [options]
 * @returns {Promise<{content, model, provider, usage}>}
 */
const chat = async (messages, model, options = {}) => {
  const resolvedModel = model || DEFAULT_MODEL();

  const body = {
    model: resolvedModel,
    messages,
    stream: false,
    options: {},
  };

  if (options.temperature !== undefined) {
    body.options.temperature = options.temperature;
  }
  if (options.max_tokens !== undefined) {
    body.options.num_predict = options.max_tokens;
  }

  logger.info('Ollama chat request', { model: resolvedModel, baseUrl: BASE_URL() });

  const response = await axios.post(`${BASE_URL()}/api/chat`, body, { timeout: 120000 });
  const data = response.data;

  return {
    content: data.message ? data.message.content : '',
    model: resolvedModel,
    provider: 'ollama',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  };
};

/**
 * Generate embeddings via Ollama.
 * @param {string[]} texts
 * @param {string} [model]
 * @returns {Promise<{embeddings, model, provider}>}
 */
const embed = async (texts, model) => {
  const resolvedModel = model || 'nomic-embed-text';

  logger.info('Ollama embed request', { model: resolvedModel, count: texts.length });

  const embeddings = await Promise.all(
    texts.map(async (prompt) => {
      const response = await axios.post(
        `${BASE_URL()}/api/embeddings`,
        { model: resolvedModel, prompt },
        { timeout: 30000 }
      );
      return response.data.embedding;
    })
  );

  return {
    embeddings,
    model: resolvedModel,
    provider: 'ollama',
  };
};

/**
 * List locally available models from Ollama.
 * @returns {Promise<string[]>}
 */
const listModels = async () => {
  const response = await axios.get(`${BASE_URL()}/api/tags`, { timeout: 5000 });
  const models = response.data.models || [];
  return models.map((m) => m.name);
};

/**
 * Pull (download) a model via Ollama.
 * @param {string} modelName
 * @returns {Promise<void>}
 */
const pullModel = async (modelName) => {
  logger.info('Ollama pull model', { model: modelName });
  await axios.post(
    `${BASE_URL()}/api/pull`,
    { name: modelName, stream: false },
    { timeout: 600000 }
  );
};

module.exports = { chat, embed, listModels, isAvailable, pullModel };
