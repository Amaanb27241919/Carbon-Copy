'use strict';

/**
 * Budget Governance v2 — Carbon Core
 * Ported from RawClaw v2 budget.ts
 *
 * Per-agent budget policies (daily/monthly/lifetime).
 * 80% warning threshold, auto-pause on exceed, incident logging.
 */

const crypto = require('crypto');

// ── Model Pricing (USD per 1M tokens) ──────────────────────────────

const MODEL_PRICING = {
  'claude-opus-4-6':    { input: 15.0,  output: 75.0,  cache: 1.875 },
  'claude-sonnet-4-6':  { input: 3.0,   output: 15.0,  cache: 0.375 },
  'claude-haiku-4-5':   { input: 0.80,  output: 4.0,   cache: 0.08  },
  'claude-opus-4':      { input: 15.0,  output: 75.0,  cache: 1.875 },
  'claude-sonnet-4':    { input: 3.0,   output: 15.0,  cache: 0.375 },
  'claude-haiku-3-5':   { input: 0.80,  output: 4.0,   cache: 0.08  },
  'gpt-4o':             { input: 2.50,  output: 10.0,  cache: 1.25  },
  'gpt-4o-mini':        { input: 0.15,  output: 0.60,  cache: 0.075 },
  'gpt-5':              { input: 10.0,  output: 30.0,  cache: 2.50  },
  'default':            { input: 3.0,   output: 15.0,  cache: 0.375 },
};

/** Estimate cost in USD from token counts */
function estimateCost(inputTokens, outputTokens, cacheTokens = 0, model = 'claude-sonnet-4-6') {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['default'];
  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheTokens / 1_000_000) * pricing.cache
  );
}

// ── In-Memory Store ─────────────────────────────────────────────────

const policies = new Map();     // policyId → BudgetPolicy
const incidents = [];           // BudgetIncident[]
const pausedAgents = new Set(); // agentId

// ── DB Registration (avoids circular imports) ──────────────────────

let _getSpend = null;
let _getPoliciesFromDb = null;

function registerBudgetDb({ getSpend, getPolicies }) {
  _getSpend = getSpend;
  if (getPolicies) _getPoliciesFromDb = getPolicies;
}

// ── Policy Management ───────────────────────────────────────────────

function createBudgetPolicy(scope, scopeId, window, limitUsd, options = {}) {
  const policy = {
    id: crypto.randomUUID(),
    scope,
    scope_id: scopeId,
    window,
    limit_usd: limitUsd,
    warning_threshold: options.warningThreshold ?? 0.8,
    auto_pause: options.autoPause ?? true,
    created_at: Math.floor(Date.now() / 1000),
  };
  policies.set(policy.id, policy);
  console.log(`[budget] Policy created: ${scope}/${scopeId} ${window} $${limitUsd}`);
  return policy;
}

function updateBudgetPolicy(policyId, updates) {
  const policy = policies.get(policyId);
  if (!policy) return null;
  if (updates.limit_usd !== undefined) policy.limit_usd = updates.limit_usd;
  if (updates.warning_threshold !== undefined) policy.warning_threshold = updates.warning_threshold;
  if (updates.auto_pause !== undefined) policy.auto_pause = updates.auto_pause;
  policies.set(policyId, policy);
  return policy;
}

function deleteBudgetPolicy(policyId) {
  return policies.delete(policyId);
}

function getPoliciesForAgent(agentId) {
  return [...policies.values()].filter(
    (p) => (p.scope === 'agent' && p.scope_id === agentId) || p.scope === 'company'
  );
}

function getAllPolicies() {
  return [...policies.values()];
}

// ── Window Calculation ──────────────────────────────────────────────

function getWindowStart(win) {
  switch (win) {
    case 'daily': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return Math.floor(d.getTime() / 1000);
    }
    case 'monthly': {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      return Math.floor(d.getTime() / 1000);
    }
    case 'lifetime':
    default:
      return 0;
  }
}

function getCurrentSpend(agentId, windowStart) {
  if (!_getSpend) return 0;
  try {
    const windowSeconds = Math.floor(Date.now() / 1000) - windowStart;
    return _getSpend(agentId, windowSeconds);
  } catch {
    return 0;
  }
}

// ── Budget Check ────────────────────────────────────────────────────

function checkBudget(agentId) {
  if (pausedAgents.has(agentId)) {
    return {
      allowed: false,
      current_spend: 0,
      limit_usd: 0,
      utilization: 1.0,
      warning: true,
      policy_id: null,
      reason: 'Agent is paused due to budget limit',
    };
  }

  const agentPolicies = getPoliciesForAgent(agentId);
  if (agentPolicies.length === 0) {
    return { allowed: true, current_spend: 0, limit_usd: Infinity, utilization: 0, warning: false, policy_id: null };
  }

  let mostRestrictive = { allowed: true, current_spend: 0, limit_usd: Infinity, utilization: 0, warning: false, policy_id: null };

  for (const policy of agentPolicies) {
    const windowStart = getWindowStart(policy.window);
    const currentSpend = getCurrentSpend(agentId, windowStart);
    const utilization = policy.limit_usd > 0 ? currentSpend / policy.limit_usd : 0;
    const warning = utilization >= policy.warning_threshold;
    const exceeded = utilization >= 1.0;

    if (exceeded) {
      incidents.push({
        id: crypto.randomUUID(),
        policy_id: policy.id,
        agent_id: agentId,
        severity: 'hard_stop',
        current_spend: currentSpend,
        limit_usd: policy.limit_usd,
        action_taken: policy.auto_pause ? 'agent_paused' : 'run_blocked',
        created_at: Math.floor(Date.now() / 1000),
      });

      if (policy.auto_pause) pausedAgents.add(agentId);

      console.warn(`[budget] EXCEEDED agent=${agentId} spend=$${currentSpend.toFixed(2)} limit=$${policy.limit_usd} window=${policy.window}`);

      return {
        allowed: false,
        current_spend: currentSpend,
        limit_usd: policy.limit_usd,
        utilization,
        warning: true,
        policy_id: policy.id,
        reason: `${policy.window} budget exceeded: $${currentSpend.toFixed(2)} / $${policy.limit_usd.toFixed(2)}`,
      };
    }

    if (warning || utilization > mostRestrictive.utilization) {
      if (warning) {
        incidents.push({
          id: crypto.randomUUID(),
          policy_id: policy.id,
          agent_id: agentId,
          severity: 'warning',
          current_spend: currentSpend,
          limit_usd: policy.limit_usd,
          action_taken: 'warning_logged',
          created_at: Math.floor(Date.now() / 1000),
        });
        console.warn(`[budget] WARNING agent=${agentId} utilization=${(utilization * 100).toFixed(0)}% window=${policy.window}`);
      }
      mostRestrictive = { allowed: true, current_spend: currentSpend, limit_usd: policy.limit_usd, utilization, warning, policy_id: policy.id };
    }
  }

  return mostRestrictive;
}

// ── Agent Pause/Resume ──────────────────────────────────────────────

function pauseAgent(agentId) { pausedAgents.add(agentId); }
function resumeAgent(agentId) { pausedAgents.delete(agentId); }
function isAgentPaused(agentId) { return pausedAgents.has(agentId); }
function getPausedAgents() { return [...pausedAgents]; }

// ── Query Functions ─────────────────────────────────────────────────

function getRecentIncidents(limit = 50) { return [...incidents].reverse().slice(0, limit); }

function getAgentBudgetSummary(agentId) {
  return {
    policies: getPoliciesForAgent(agentId),
    current_spend_daily: getCurrentSpend(agentId, getWindowStart('daily')),
    current_spend_monthly: getCurrentSpend(agentId, getWindowStart('monthly')),
    is_paused: pausedAgents.has(agentId),
    recent_incidents: [...incidents].reverse().filter(i => i.agent_id === agentId).slice(0, 5),
  };
}

function getBudgetDashboard() {
  return {
    policies: getAllPolicies(),
    paused_agents: getPausedAgents(),
    recent_incidents: getRecentIncidents(20),
    total_policies: policies.size,
    total_incidents: incidents.length,
  };
}

function initBudgetPolicies() {
  if (!_getPoliciesFromDb) return;
  try {
    const saved = _getPoliciesFromDb();
    for (const p of saved) policies.set(p.id, p);
    if (saved.length > 0) console.log(`[budget] Loaded ${saved.length} policies from DB`);
  } catch { /* db not ready yet */ }
}

module.exports = {
  estimateCost,
  registerBudgetDb,
  createBudgetPolicy,
  updateBudgetPolicy,
  deleteBudgetPolicy,
  getPoliciesForAgent,
  getAllPolicies,
  checkBudget,
  pauseAgent,
  resumeAgent,
  isAgentPaused,
  getPausedAgents,
  getRecentIncidents,
  getAgentBudgetSummary,
  getBudgetDashboard,
  initBudgetPolicies,
  MODEL_PRICING,
};
