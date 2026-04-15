/**
 * Ralph Loop — Carbon Core v2
 * Ported from oh-my-codex/plugins/ralph-wiggum
 *
 * The Ralph Wiggum technique: iterative self-improving AI loop.
 * Feed the same prompt repeatedly until a completion promise appears.
 * Each iteration sees previous file changes and git history.
 *
 * Named after Ralph Wiggum (The Simpsons): persistent iteration despite setbacks.
 */

const { spawn } = require('child_process');
const crypto = require('crypto');
const { logSystemAction, logAgentAction, ActionTypes } = require('./audit-v2.js');
const { checkBudget, estimateCost } = require('./budget-v2.js');

const activeLoops = new Map(); // loopId → RalphLoopState

// ── Start Loop ──────────────────────────────────────────────────────

/**
 * Start a Ralph loop — iterative agent execution until completion.
 *
 * @param {string} task - The task prompt (stays constant across iterations)
 * @param {object} options
 * @param {string} options.completionPromise - String that signals completion (e.g. "DONE")
 * @param {number} options.maxIterations - Max iterations before giving up (default 50)
 * @param {string} options.agentId - Agent ID for budget/heartbeat tracking
 * @param {string} options.workDir - Working directory for claude CLI
 * @param {string} options.model - Claude model to use
 * @returns {{ loopId: string }} - Returns immediately with loop ID
 */
function startRalphLoop(task, options = {}) {
  const loopId = crypto.randomUUID();
  const completionPromise = options.completionPromise || 'DONE';
  const maxIterations = options.maxIterations || 50;
  const agentId = options.agentId || 'ralph';
  const workDir = options.workDir || process.cwd();
  const model = options.model || 'claude-sonnet-4-6';

  const state = {
    id: loopId,
    task,
    completionPromise,
    maxIterations,
    agentId,
    workDir,
    model,
    status: 'running',
    currentIteration: 0,
    outputs: [],
    totalTokens: 0,
    totalCost: 0,
    startedAt: Date.now(),
    completedAt: null,
    result: null,
    error: null,
  };

  activeLoops.set(loopId, state);

  logSystemAction(ActionTypes.AGENT_STARTED, 'ralph_loop', loopId, {
    task: task.slice(0, 100),
    completion_promise: completionPromise,
    max_iterations: maxIterations,
  });

  console.log(`[ralph] Loop ${loopId.slice(0, 8)} started — max ${maxIterations} iterations, looking for: "${completionPromise}"`);

  // Run async
  _runLoop(state).catch(err => {
    state.status = 'failed';
    state.error = err.message;
    state.completedAt = Date.now();
    logSystemAction(ActionTypes.AGENT_FAILED, 'ralph_loop', loopId, { error: err.message });
    console.error(`[ralph] Loop ${loopId.slice(0, 8)} failed:`, err.message);
  });

  return { loopId };
}

// ── Internal Loop ───────────────────────────────────────────────────

async function _runLoop(state) {
  while (state.currentIteration < state.maxIterations && state.status === 'running') {
    state.currentIteration++;

    console.log(`[ralph] Loop ${state.id.slice(0, 8)} — Iteration ${state.currentIteration}/${state.maxIterations}`);

    // Budget check
    const budget = checkBudget(state.agentId);
    if (!budget.allowed) {
      state.status = 'budget_blocked';
      state.error = budget.reason;
      state.completedAt = Date.now();
      console.warn(`[ralph] Loop ${state.id.slice(0, 8)} blocked: ${budget.reason}`);
      return;
    }

    // Build iteration prompt (includes iteration number for context)
    const iterPrompt = state.currentIteration === 1
      ? state.task
      : `${state.task}\n\n[Iteration ${state.currentIteration}/${state.maxIterations}. Previous output is in files. Continue where you left off.]`;

    // Run claude
    let output = '';
    const iterStart = Date.now();
    try {
      output = await _runClaude(iterPrompt, state.workDir, state.model);
    } catch (e) {
      console.warn(`[ralph] Iteration ${state.currentIteration} failed: ${e.message}`);
      state.outputs.push({ iteration: state.currentIteration, error: e.message, duration_ms: Date.now() - iterStart });
      continue; // Try again next iteration
    }

    const duration = Date.now() - iterStart;
    const inputTokens = Math.ceil(iterPrompt.length / 4);
    const outputTokens = Math.ceil(output.length / 4);
    const cost = estimateCost(inputTokens, outputTokens, 0, state.model);

    state.totalTokens += inputTokens + outputTokens;
    state.totalCost += cost;
    state.outputs.push({
      iteration: state.currentIteration,
      output: output.slice(0, 500),
      duration_ms: duration,
      cost_usd: cost,
      found_completion: output.includes(state.completionPromise),
    });

    logAgentAction(ActionTypes.AGENT_COMPLETED, 'ralph_iteration', `${state.id}:${state.currentIteration}`, {
      iteration: state.currentIteration,
      cost_usd: cost,
      duration_ms: duration,
      found_completion: output.includes(state.completionPromise),
    }, state.agentId);

    // Check for completion
    if (output.includes(state.completionPromise)) {
      state.status = 'completed';
      state.result = output;
      state.completedAt = Date.now();
      logSystemAction(ActionTypes.AGENT_COMPLETED, 'ralph_loop', state.id, {
        iterations: state.currentIteration,
        total_cost: state.totalCost,
        total_tokens: state.totalTokens,
      });
      console.log(`[ralph] ✅ Loop ${state.id.slice(0, 8)} COMPLETE after ${state.currentIteration} iterations — $${state.totalCost.toFixed(4)}`);
      return;
    }

    console.log(`[ralph] Iteration ${state.currentIteration}: no completion yet, continuing...`);
  }

  // Max iterations hit
  if (state.status === 'running') {
    state.status = 'max_iterations';
    state.completedAt = Date.now();
    state.result = state.outputs[state.outputs.length - 1]?.output || null;
    console.warn(`[ralph] Loop ${state.id.slice(0, 8)} hit max iterations (${state.maxIterations})`);
  }
}

function _runClaude(prompt, workDir, model, timeout = 10 * 60 * 1000) {
  return new Promise((resolve, reject) => {
    const args = ['--permission-mode', 'bypassPermissions', '--print', prompt];
    if (model) args.push('--model', model);

    const proc = spawn('claude', args, { cwd: workDir, env: { ...process.env } });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });
    proc.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`)));
    proc.on('error', reject);
    setTimeout(() => { proc.kill(); reject(new Error('Iteration timed out')); }, timeout);
  });
}

// ── Query Functions ─────────────────────────────────────────────────

function getRalphStatus(loopId) {
  return activeLoops.get(loopId) || null;
}

function stopRalphLoop(loopId) {
  const state = activeLoops.get(loopId);
  if (!state) return false;
  state.status = 'cancelled';
  state.completedAt = Date.now();
  logSystemAction(ActionTypes.AGENT_PAUSED, 'ralph_loop', loopId, { reason: 'manual_stop' });
  console.log(`[ralph] Loop ${loopId.slice(0, 8)} stopped manually`);
  return true;
}

function getAllRalphLoops() {
  return [...activeLoops.values()].sort((a, b) => b.startedAt - a.startedAt);
}

function getActiveRalphLoops() {
  return [...activeLoops.values()].filter(l => l.status === 'running');
}


module.exports = {
  startRalphLoop,
  getRalphStatus,
  stopRalphLoop,
  getAllRalphLoops,
  getActiveRalphLoops,
};
