/**
 * token-math.js — LLM token + cost math for Carbon Core v4
 *
 * Inlined from steipete/tokentally (MIT).
 * Source: https://github.com/steipete/tokentally
 *
 * Usage:
 *   const { normalizeTokenUsage, estimateUsdCost, pricingFromUsdPerMillion, tallyCosts } = require('./token-math');
 *
 *   const usage  = normalizeTokenUsage({ prompt_tokens: 1000, completion_tokens: 250 });
 *   const pricing = pricingFromUsdPerMillion({ inputUsdPerMillion: 3, outputUsdPerMillion: 15 });
 *   const cost   = estimateUsdCost({ usage, pricing });
 *   // { inputUsd: 0.003, outputUsd: 0.00375, totalUsd: 0.00675 }
 */

'use strict';

// ---------------------------------------------------------------------------
// Static pricing table (USD per million tokens, as of Apr 2026)
// Update when providers change their rates.
// ---------------------------------------------------------------------------
const STATIC_PRICING_PER_MILLION = {
  // Anthropic
  'claude-opus-4':          { input: 15,    output: 75 },
  'claude-sonnet-4-5':      { input: 3,     output: 15 },
  'claude-sonnet-4-6':      { input: 3,     output: 15 },
  'claude-haiku-4-5':       { input: 0.8,   output: 4 },
  // OpenAI
  'gpt-4o':                 { input: 5,     output: 15 },
  'gpt-4o-mini':            { input: 0.15,  output: 0.6 },
  'gpt-4.1':                { input: 2,     output: 8 },
  'o3':                     { input: 10,    output: 40 },
  'o4-mini':                { input: 1.1,   output: 4.4 },
  // Ollama / local (zero cost — tracked for token counts only)
  'llama3.2':               { input: 0,     output: 0 },
  'llama3.3':               { input: 0,     output: 0 },
  'llava':                  { input: 0,     output: 0 },
  'mistral':                { input: 0,     output: 0 },
  'phi4':                   { input: 0,     output: 0 },
};

// ---------------------------------------------------------------------------
// normalizeTokenUsage — accepts any provider response shape
// ---------------------------------------------------------------------------
function normalizeTokenUsage(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  function pick(candidates) {
    for (const v of candidates) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
    }
    return null;
  }

  const inputTokens = pick([
    raw.inputTokens, raw.promptTokens,
    raw.input_tokens, raw.prompt_tokens, raw.prompt_tokens_total,
  ]);
  const outputTokens = pick([
    raw.outputTokens, raw.completionTokens,
    raw.output_tokens, raw.completion_tokens,
  ]);
  const reasoningTokens = pick([raw.reasoningTokens, raw.reasoning_tokens]);
  const totalTokens = pick([raw.totalTokens, raw.total_tokens]);

  if (inputTokens == null && outputTokens == null && reasoningTokens == null && totalTokens == null) {
    return null;
  }

  const normalizedInput     = inputTokens ?? 0;
  const normalizedOutput    = outputTokens ?? 0;
  const normalizedReasoning = reasoningTokens ?? 0;
  const inferredTotal       = normalizedInput + normalizedOutput + normalizedReasoning;

  return {
    inputTokens:     normalizedInput,
    outputTokens:    normalizedOutput,
    ...(reasoningTokens != null ? { reasoningTokens: normalizedReasoning } : {}),
    totalTokens: totalTokens ?? inferredTotal,
  };
}

// ---------------------------------------------------------------------------
// pricingFromUsdPerMillion — build a Pricing object from $/1M rates
// ---------------------------------------------------------------------------
function pricingFromUsdPerMillion({ inputUsdPerMillion, outputUsdPerMillion }) {
  if (!Number.isFinite(inputUsdPerMillion) || inputUsdPerMillion < 0) {
    throw new Error('inputUsdPerMillion must be a finite, non-negative number');
  }
  if (!Number.isFinite(outputUsdPerMillion) || outputUsdPerMillion < 0) {
    throw new Error('outputUsdPerMillion must be a finite, non-negative number');
  }
  return {
    inputUsdPerToken:  inputUsdPerMillion  / 1_000_000,
    outputUsdPerToken: outputUsdPerMillion / 1_000_000,
  };
}

// ---------------------------------------------------------------------------
// resolvePricing — look up model in static table (or return null)
// ---------------------------------------------------------------------------
function resolvePricing(modelId) {
  if (!modelId) return null;
  // Strip common provider prefixes
  const candidates = [
    modelId,
    modelId.replace(/^(openai|anthropic|google|xai|meta|mistral)\//, ''),
  ];
  for (const key of candidates) {
    const row = STATIC_PRICING_PER_MILLION[key.toLowerCase()];
    if (row) return pricingFromUsdPerMillion({ inputUsdPerMillion: row.input, outputUsdPerMillion: row.output });
  }
  return null;
}

// ---------------------------------------------------------------------------
// estimateUsdCost — compute cost from normalized usage + pricing
// ---------------------------------------------------------------------------
function estimateUsdCost({ usage, pricing }) {
  if (!usage || !pricing) return null;
  const inputUsd  = usage.inputTokens  * pricing.inputUsdPerToken;
  const outputUsd = usage.outputTokens * pricing.outputUsdPerToken;
  return { inputUsd, outputUsd, totalUsd: inputUsd + outputUsd };
}

// ---------------------------------------------------------------------------
// tallyCosts — aggregate costs across multiple model calls
// ---------------------------------------------------------------------------
async function tallyCosts({ calls, resolvePricingFn = resolvePricing }) {
  const byModel = {};

  for (const call of calls) {
    const model = call.model || 'unknown';
    const usage = call.usage;
    if (!byModel[model]) {
      byModel[model] = {
        calls: 0,
        usage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 },
        cost: null,
      };
    }
    byModel[model].calls += 1;
    if (usage) {
      const u = byModel[model].usage;
      u.inputTokens     += usage.inputTokens     ?? 0;
      u.outputTokens    += usage.outputTokens    ?? 0;
      u.reasoningTokens += usage.reasoningTokens ?? 0;
      u.totalTokens     += usage.totalTokens     ?? 0;
    }
  }

  let total = null;
  for (const [model, row] of Object.entries(byModel)) {
    const pricing = typeof resolvePricingFn === 'function'
      ? await resolvePricingFn(model)
      : resolvePricing(model);
    row.cost = estimateUsdCost({ usage: row.usage, pricing });
    if (row.cost) {
      if (!total) total = { inputUsd: 0, outputUsd: 0, totalUsd: 0 };
      total.inputUsd  += row.cost.inputUsd;
      total.outputUsd += row.cost.outputUsd;
      total.totalUsd  += row.cost.totalUsd;
    }
  }

  return { total, byModel };
}

// ---------------------------------------------------------------------------
// formatCost — human-friendly cost string
// ---------------------------------------------------------------------------
function formatCost(usd) {
  if (usd == null) return 'N/A';
  if (usd < 0.0001) return `$${(usd * 1000000).toFixed(2)}μ`;
  if (usd < 0.01)   return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

module.exports = {
  normalizeTokenUsage,
  pricingFromUsdPerMillion,
  resolvePricing,
  estimateUsdCost,
  tallyCosts,
  formatCost,
  STATIC_PRICING_PER_MILLION,
};
