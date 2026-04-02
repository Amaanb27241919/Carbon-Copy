'use strict';

const openai = require('./openai');
const claude = require('./anthropic');
const ollama = require('./ollama');
const huggingface = require('./huggingface');

const providers = { openai, claude, ollama, huggingface };

/**
 * Get a provider adapter by name.
 * @param {string} name
 * @returns {object} provider adapter
 */
const getProvider = (name) => {
  const provider = providers[name];
  if (!provider) {
    throw new Error(`Unknown provider: "${name}". Available: ${Object.keys(providers).join(', ')}`);
  }
  return provider;
};

/**
 * Check availability of all providers.
 * @returns {Promise<Array<{name, available, defaultModel}>>}
 */
const getAvailableProviders = async () => {
  const results = await Promise.all(
    Object.entries(providers).map(async ([name, adapter]) => {
      let available = false;
      try {
        const result = adapter.isAvailable();
        available = result instanceof Promise ? await result : result;
      } catch {
        available = false;
      }

      const defaultModelMap = {
        openai: process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o',
        claude: process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-sonnet-4-6',
        ollama: process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2',
        huggingface: process.env.HF_DEFAULT_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3',
      };

      return {
        name,
        available,
        defaultModel: defaultModelMap[name] || '',
      };
    })
  );
  return results;
};

/**
 * Resolve which provider to use given a requested provider name.
 * Falls back to DEFAULT_PROVIDER env var, then first available.
 * @param {string} [requestedProvider]
 * @returns {Promise<string>} resolved provider name
 */
const resolveProvider = async (requestedProvider) => {
  if (requestedProvider && requestedProvider !== 'auto' && providers[requestedProvider]) {
    return requestedProvider;
  }

  const envDefault = process.env.DEFAULT_PROVIDER;
  if (envDefault && providers[envDefault]) {
    return envDefault;
  }

  // Fall back to first available provider
  const available = await getAvailableProviders();
  const first = available.find((p) => p.available);
  if (first) return first.name;

  return 'openai'; // final fallback
};

module.exports = { providers, getProvider, getAvailableProviders, resolveProvider };
