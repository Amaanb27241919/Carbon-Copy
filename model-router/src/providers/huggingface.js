'use strict';

const axios = require('axios');
const { logger } = require('../utils/logger');

const BASE_URL = () => process.env.HF_BASE_URL || 'https://api-inference.huggingface.co';
const DEFAULT_MODEL = () => process.env.HF_DEFAULT_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';

const SUGGESTED_MODELS = [
  'mistralai/Mistral-7B-Instruct-v0.3',
  'meta-llama/Llama-3.1-8B-Instruct',
  'google/gemma-2-9b-it',
  'Qwen/Qwen2.5-7B-Instruct',
];

/**
 * Returns true if HF_API_KEY is set or HF_USE_LOCAL is "true".
 */
const isAvailable = () => {
  const hasApiKey = !!(process.env.HF_API_KEY && process.env.HF_API_KEY.trim() !== '');
  const useLocal = process.env.HF_USE_LOCAL === 'true';
  return hasApiKey || useLocal;
};

/**
 * Build HF Inference API authorization headers.
 */
const getHeaders = () => {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.HF_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.HF_API_KEY}`;
  }
  return headers;
};

/**
 * Format an OpenAI-style messages array into a single conversation string
 * suitable for HF instruction models.
 * @param {Array} messages
 * @returns {string}
 */
const formatMessages = (messages) => {
  return messages
    .map((msg) => {
      if (msg.role === 'system') return `[INST] <<SYS>>\n${msg.content}\n<</SYS>>\n\n`;
      if (msg.role === 'user') return `[INST] ${msg.content} [/INST]`;
      if (msg.role === 'assistant') return msg.content;
      return msg.content;
    })
    .join('\n');
};

/**
 * Chat completion via HuggingFace Inference API.
 * @param {Array} messages - OpenAI-format messages array
 * @param {string} [model]
 * @param {Object} [options]
 * @returns {Promise<{content, model, provider, usage}>}
 */
const chat = async (messages, model, options = {}) => {
  const resolvedModel = model || DEFAULT_MODEL();
  const prompt = formatMessages(messages);

  const payload = {
    inputs: prompt,
    parameters: {
      max_new_tokens: options.max_tokens || 2048,
      temperature: options.temperature !== undefined ? options.temperature : 0.7,
      return_full_text: false,
    },
  };

  logger.info('HuggingFace chat request', { model: resolvedModel });

  const response = await axios.post(
    `${BASE_URL()}/models/${encodeURIComponent(resolvedModel)}`,
    payload,
    { headers: getHeaders(), timeout: 120000 }
  );

  const data = response.data;
  let content = '';

  if (Array.isArray(data) && data.length > 0) {
    content = data[0].generated_text || '';
  } else if (data && data.generated_text) {
    content = data.generated_text;
  }

  return {
    content,
    model: resolvedModel,
    provider: 'huggingface',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  };
};

/**
 * Embeddings via HuggingFace Inference API.
 * @param {string[]} texts
 * @param {string} [model]
 * @returns {Promise<{embeddings, model, provider}>}
 */
const embed = async (texts, model) => {
  const resolvedModel = model || 'sentence-transformers/all-MiniLM-L6-v2';

  logger.info('HuggingFace embed request', { model: resolvedModel, count: texts.length });

  const response = await axios.post(
    `${BASE_URL()}/pipeline/feature-extraction/${encodeURIComponent(resolvedModel)}`,
    { inputs: texts },
    { headers: getHeaders(), timeout: 60000 }
  );

  const embeddings = Array.isArray(response.data[0])
    ? response.data
    : [response.data];

  return {
    embeddings,
    model: resolvedModel,
    provider: 'huggingface',
  };
};

/**
 * Return a static list of common HF model suggestions.
 * @returns {Promise<string[]>}
 */
const listModels = async () => {
  return [...SUGGESTED_MODELS];
};

module.exports = { chat, embed, listModels, isAvailable };
