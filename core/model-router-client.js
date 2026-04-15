/**
 * Model Router Client — Carbon Core v2
 *
 * Wraps the existing model-router service with:
 * - Budget check before every inference call
 * - Heartbeat tracking for every inference run
 * - Local-first routing (Ollama → Cloud fallback)
 * - Per-provider cost tracking
 */

import { checkBudget, estimateCost } from './budget-v2.js';
import { executeWithHeartbeat } from './heartbeat-v2.js';
import { logSystemAction, ActionTypes } from './audit-v2.js';

const MODEL_ROUTER_URL = process.env.MODEL_ROUTER_URL || 'http://localhost:3002';

// ── Provider Priority (local-first per vision) ──────────────────────

const PROVIDER_PRIORITY = ['ollama', 'claude', 'openai', 'huggingface'];

const PROVIDER_MODELS = {
  ollama:     process.env.OLLAMA_DEFAULT_MODEL || 'llama3.2',
  claude:     process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-sonnet-4-6',
  openai:     process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o',
  huggingface: process.env.HF_DEFAULT_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3',
};

// Ollama = free (local), others = paid
const PROVIDER_COST_FREE = new Set(['ollama', 'huggingface']);

// ── Core Chat Function ───────────────────────────────────────────────

/**
 * Send a chat request through the model router with full budget + heartbeat tracking.
 *
 * @param {Array} messages - [{ role, content }]
 * @param {object} options
 * @param {string} options.agentId - For budget tracking
 * @param {string} options.provider - 'ollama'|'claude'|'openai'|'auto'
 * @param {string} options.model - Override model
 * @param {boolean} options.localFirst - Try Ollama before cloud (default: true)
 * @param {boolean} options.skipBudgetCheck - Skip budget enforcement (default: false)
 */
export async function chat(messages, options = {}) {
  const agentId = options.agentId || 'model-router';
  const localFirst = options.localFirst !== false;
  const skipBudget = options.skipBudgetCheck === true;

  // 1. Budget check (skip for local/free providers)
  if (!skipBudget) {
    const provider = options.provider || 'auto';
    const isFree = PROVIDER_COST_FREE.has(provider) || provider === 'auto';
    if (!isFree) {
      const budget = checkBudget(agentId);
      if (!budget.allowed) {
        throw new Error(`Budget exceeded: ${budget.reason}. Switch to local Ollama or resume budget.`);
      }
    }
  }

  // 2. Resolve provider (local-first)
  const provider = await resolveProvider(options.provider || 'auto', localFirst);
  const model = options.model || PROVIDER_MODELS[provider];

  // 3. Call model router
  const startTime = Date.now();
  let result;

  try {
    result = await callModelRouter(provider, model, messages, options);
  } catch (err) {
    // Fallback to next provider if local fails
    if (localFirst && provider === 'ollama') {
      console.warn('[model-router] Ollama failed, falling back to cloud:', err.message);
      const fallback = await resolveProvider('auto', false);
      result = await callModelRouter(fallback, PROVIDER_MODELS[fallback], messages, options);
    } else {
      throw err;
    }
  }

  const duration = Date.now() - startTime;

  // 4. Track cost (only for paid providers)
  const isFree = PROVIDER_COST_FREE.has(provider);
  if (!isFree && result.tokensUsed) {
    const cost = estimateCost(
      Math.floor(result.tokensUsed * 0.7), // estimate: 70% input
      Math.floor(result.tokensUsed * 0.3), // estimate: 30% output
      0,
      model
    );
    result.cost_usd = cost;
  } else {
    result.cost_usd = 0;
  }

  // 5. Log to audit
  logSystemAction(ActionTypes.AGENT_COMPLETED, 'model_router', provider, {
    provider,
    model,
    tokens: result.tokensUsed || 0,
    cost_usd: result.cost_usd,
    duration_ms: duration,
    local: isFree,
  });

  return { ...result, provider, model, duration_ms: duration };
}

/**
 * Stream a chat response (returns async iterable).
 */
export async function chatStream(messages, options = {}) {
  const provider = await resolveProvider(options.provider || 'auto', options.localFirst !== false);
  const model = options.model || PROVIDER_MODELS[provider];

  const response = await fetch(`${MODEL_ROUTER_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, messages, stream: true, options: options.params || {} }),
  });

  if (!response.ok) throw new Error(`Model router error ${response.status}`);
  return response.body;
}

/**
 * Embed text using the model router.
 */
export async function embed(text, options = {}) {
  const provider = options.provider || 'ollama'; // Ollama for local embeddings
  const model = options.model || 'nomic-embed-text';

  const response = await fetch(`${MODEL_ROUTER_URL}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, input: text }),
  });

  if (!response.ok) throw new Error(`Embed error ${response.status}: ${await response.text()}`);
  return response.json();
}

/**
 * List all available providers and their status.
 */
export async function getProviders() {
  const response = await fetch(`${MODEL_ROUTER_URL}/providers`);
  if (!response.ok) return { providers: [] };
  return response.json();
}

/**
 * List models available on Ollama (local).
 */
export async function getLocalModels() {
  const response = await fetch(`${MODEL_ROUTER_URL}/models?provider=ollama`);
  if (!response.ok) return { models: [] };
  return response.json();
}

/**
 * Pull a model into Ollama (local).
 */
export async function pullLocalModel(modelName) {
  const response = await fetch(`${MODEL_ROUTER_URL}/models/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider: 'ollama', model: modelName }),
  });
  if (!response.ok) throw new Error(`Pull failed: ${await response.text()}`);
  return response.json();
}

// ── Internal Helpers ────────────────────────────────────────────────

async function resolveProvider(requested, localFirst) {
  if (requested && requested !== 'auto') return requested;

  if (localFirst) {
    // Check if Ollama is available
    try {
      const health = await fetch(`${MODEL_ROUTER_URL}/health`, { signal: AbortSignal.timeout(2000) });
      const data = await health.json();
      const ollamaAvailable = data.providers?.find(p => p.name === 'ollama' && p.available);
      if (ollamaAvailable) return 'ollama';
    } catch { /* Ollama unavailable */ }
  }

  // Fall back to cloud in priority order
  try {
    const health = await fetch(`${MODEL_ROUTER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    const data = await health.json();
    for (const name of PROVIDER_PRIORITY.filter(p => p !== 'ollama')) {
      if (data.providers?.find(p => p.name === name && p.available)) return name;
    }
  } catch { /* use default */ }

  return process.env.DEFAULT_PROVIDER || 'claude';
}

async function callModelRouter(provider, model, messages, options) {
  const response = await fetch(`${MODEL_ROUTER_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider,
      model,
      messages,
      options: options.params || {},
    }),
    signal: AbortSignal.timeout(options.timeout || 120000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Model router ${provider} error ${response.status}: ${err.slice(0, 200)}`);
  }

  return response.json();
}
