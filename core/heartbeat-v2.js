// Heartbeat Execution Engine v2 — Carbon Core
// Wraps every agent execution in a tracked HeartbeatRun.
// Budget check before run. DB write via registerHeartbeatDb().

'use strict';

const crypto = require('crypto');
const { spawn } = require('child_process');

const { checkBudget, estimateCost } = require('./budget-v2.js');
const { logAgentAction, logSystemAction, ActionTypes } = require('./audit-v2.js');

// ── Constants ───────────────────────────────────────────────────────

const MAX_RUNS_BUFFER = 500;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// ── In-Memory Store ─────────────────────────────────────────────────

/** @type {Array<Object>} Ordered list of runs for iteration */
const runsBuffer = [];

/** @type {Map<string, Object>} O(1) lookup by run ID for updates */
const runsById = new Map();

// ── DB Registration (avoids circular imports) ──────────────────────

/** @type {Function|null} */
let _saveRun = null;

/** @type {Function|null} */
let _updateRun = null;

/** @type {Function|null} */
let _loadActiveRuns = null;

/**
 * Register database functions. Called from index-v2.js after DB init.
 * @param {{ saveRun: Function, updateRun: Function, loadActiveRuns: Function }} fns
 */
function registerHeartbeatDb({ saveRun, updateRun, loadActiveRuns }) {
  _saveRun = saveRun;
  _updateRun = updateRun;
  _loadActiveRuns = loadActiveRuns;
}

// ── Persistence Helpers ─────────────────────────────────────────────

function persistSave(run) {
  // Buffer
  runsBuffer.push(run);
  runsById.set(run.id, run);
  if (runsBuffer.length > MAX_RUNS_BUFFER) {
    const evicted = runsBuffer.shift();
    if (evicted) runsById.delete(evicted.id);
  }

  // SQLite
  if (_saveRun) {
    try { _saveRun(run); } catch { /* db not ready */ }
  }
}

function persistUpdate(run) {
  // Update in-place in the Map — buffer array already holds reference
  runsById.set(run.id, run);
  const idx = runsBuffer.findIndex((r) => r.id === run.id);
  if (idx !== -1) runsBuffer[idx] = run;

  // SQLite
  if (_updateRun) {
    try { _updateRun(run); } catch { /* db not ready */ }
  }
}

// ── Claude CLI: stream-json runner ─────────────────────────────────

/**
 * Spawn `claude --print --output-format stream-json` and collect:
 * - streamed text (via onStreamText callback)
 * - final token usage and session ID from the result event
 *
 * @param {string} prompt
 * @param {Object} opts
 * @param {string} [opts.model]
 * @param {string} [opts.sessionId]
 * @param {number} [opts.timeoutMs]
 * @param {Function} [opts.onStreamText]
 * @param {Function} [opts.onProgress]
 * @returns {Promise<{ text: string, newSessionId: string|null, inputTokens: number, outputTokens: number, cacheTokens: number }>}
 */
function runClaudeStreaming(prompt, opts = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '--print',
      '--output-format', 'stream-json',
      '--max-turns', '10',
    ];

    if (opts.model) {
      args.push('--model', opts.model);
    }

    // Resume existing session if provided
    if (opts.sessionId) {
      args.push('--resume', opts.sessionId);
    }

    // Prompt goes last as a positional argument
    args.push(prompt);

    const proc = spawn('claude', args, {
      env: process.env,
    });

    let stderrBuf = '';
    let fullText = '';
    let newSessionId = null;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheTokens = 0;
    let lineBuf = '';

    proc.stdout.on('data', (chunk) => {
      lineBuf += chunk.toString();
      const lines = lineBuf.split('\n');
      lineBuf = lines.pop(); // incomplete trailing line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        let event;
        try {
          event = JSON.parse(trimmed);
        } catch {
          // Non-JSON line — skip
          continue;
        }

        if (event.type === 'assistant' && Array.isArray(event.message?.content)) {
          for (const block of event.message.content) {
            if (block.type === 'text' && typeof block.text === 'string') {
              fullText += block.text;
              if (opts.onStreamText) {
                try { opts.onStreamText(block.text); } catch { /* caller error */ }
              }
            }
          }
        } else if (event.type === 'result') {
          // Final result event carries usage + session_id
          if (event.session_id) newSessionId = event.session_id;
          if (event.usage) {
            inputTokens = event.usage.input_tokens || 0;
            outputTokens = event.usage.output_tokens || 0;
            cacheTokens = event.usage.cache_read_input_tokens || 0;
          }
        } else if (event.type === 'system' && opts.onProgress) {
          try {
            opts.onProgress({ type: event.subtype || 'system', description: event.message || '' });
          } catch { /* caller error */ }
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Agent execution timed out'));
    }, opts.timeoutMs || DEFAULT_TIMEOUT_MS);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ text: fullText.trim(), newSessionId, inputTokens, outputTokens, cacheTokens });
      } else {
        reject(new Error(`claude exited ${code}: ${stderrBuf.slice(0, 500)}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── Core Execution ──────────────────────────────────────────────────

/**
 * Execute an agent run with full heartbeat tracking.
 *
 * 1. Check budget — return budget_blocked run if denied.
 * 2. Create HeartbeatRun with status 'running', save to buffer + DB.
 * 3. Spawn claude CLI with stream-json output.
 * 4. Parse streamed events for text, tokens, session ID.
 * 5. Update run with final status, tokens, cost, duration.
 *
 * @param {string} prompt
 * @param {Object} [options={}]
 * @param {string} [options.agentId]
 * @param {'on_demand'|'timer'|'mission'|'delegation'|'orchestration'} [options.source]
 * @param {string} [options.sessionId]
 * @param {string} [options.model]
 * @param {Function} [options.onProgress]
 * @param {Function} [options.onStreamText]
 * @returns {Promise<{ run: Object, result: { text: string, newSessionId: string|null }, budgetCheck: Object }>}
 */
async function executeWithHeartbeat(prompt, options = {}) {
  const agentId = options.agentId || 'default';
  const source = options.source || 'on_demand';
  const model = options.model || 'claude-sonnet-4-6';
  const startTime = Date.now();

  // ── 1. Budget check ────────────────────────────────────────────
  const budgetCheck = checkBudget(agentId);

  if (!budgetCheck.allowed) {
    const blockedRun = {
      id: crypto.randomUUID(),
      agent_id: agentId,
      invocation_source: source,
      status: 'budget_blocked',
      prompt_preview: prompt.slice(0, 200),
      input_tokens: 0,
      output_tokens: 0,
      cache_tokens: 0,
      cost_usd: 0,
      duration_ms: Date.now() - startTime,
      exit_code: null,
      session_id_before: options.sessionId || null,
      session_id_after: null,
      error: budgetCheck.reason || 'Budget exceeded',
      model,
      started_at: Math.floor(startTime / 1000),
      completed_at: Math.floor(Date.now() / 1000),
    };

    persistSave(blockedRun);

    logAgentAction(ActionTypes.AGENT_FAILED, 'heartbeat_run', blockedRun.id, {
      reason: 'budget_blocked',
      current_spend: budgetCheck.current_spend,
      limit_usd: budgetCheck.limit_usd,
    }, agentId);

    return {
      run: blockedRun,
      result: { text: `Budget limit reached: ${budgetCheck.reason}`, newSessionId: null },
      budgetCheck,
    };
  }

  // ── 2. Create run record ───────────────────────────────────────
  const run = {
    id: crypto.randomUUID(),
    agent_id: agentId,
    invocation_source: source,
    status: 'running',
    prompt_preview: prompt.slice(0, 200),
    input_tokens: 0,
    output_tokens: 0,
    cache_tokens: 0,
    cost_usd: 0,
    duration_ms: 0,
    exit_code: null,
    session_id_before: options.sessionId || null,
    session_id_after: null,
    error: null,
    model,
    started_at: Math.floor(startTime / 1000),
    completed_at: null,
  };

  persistSave(run);

  logAgentAction(ActionTypes.AGENT_STARTED, 'heartbeat_run', run.id, {
    source,
    prompt_preview: run.prompt_preview,
  }, agentId);

  // ── 3 & 4. Spawn claude, parse stream ─────────────────────────
  let claudeResult;
  try {
    claudeResult = await runClaudeStreaming(prompt, {
      model,
      sessionId: options.sessionId,
      onStreamText: options.onStreamText,
      onProgress: options.onProgress,
    });
  } catch (err) {
    const endTime = Date.now();
    run.status = 'failed';
    run.error = String(err);
    run.exit_code = 1;
    run.duration_ms = endTime - startTime;
    run.completed_at = Math.floor(endTime / 1000);

    persistUpdate(run);

    logAgentAction(ActionTypes.AGENT_FAILED, 'heartbeat_run', run.id, {
      error: run.error,
      duration_ms: run.duration_ms,
    }, agentId);

    return { run, result: { text: '', newSessionId: null }, budgetCheck };
  }

  // ── 5. Update run with results ────────────────────────────────
  const endTime = Date.now();
  run.status = 'completed';
  run.exit_code = 0;
  run.duration_ms = endTime - startTime;
  run.completed_at = Math.floor(endTime / 1000);
  run.session_id_after = claudeResult.newSessionId;
  run.input_tokens = claudeResult.inputTokens;
  run.output_tokens = claudeResult.outputTokens;
  run.cache_tokens = claudeResult.cacheTokens;
  run.cost_usd = estimateCost(run.input_tokens, run.output_tokens, run.cache_tokens, model);

  persistUpdate(run);

  logAgentAction(ActionTypes.AGENT_COMPLETED, 'heartbeat_run', run.id, {
    duration_ms: run.duration_ms,
    cost_usd: run.cost_usd,
    input_tokens: run.input_tokens,
    output_tokens: run.output_tokens,
    cache_tokens: run.cache_tokens,
  }, agentId);

  return {
    run,
    result: { text: claudeResult.text, newSessionId: claudeResult.newSessionId },
    budgetCheck,
  };
}

// ── Startup Repair ──────────────────────────────────────────────────

/**
 * Mark any 'running' runs as 'failed'. Called on startup to clean up
 * runs that were interrupted by a process restart.
 */
function resetStuckRuns() {
  let resetCount = 0;
  for (const run of runsBuffer) {
    if (run.status === 'running') {
      run.status = 'failed';
      run.error = 'Process restart — run was interrupted';
      run.completed_at = Math.floor(Date.now() / 1000);
      persistUpdate(run);
      resetCount++;
    }
  }

  if (resetCount > 0) {
    logSystemAction(ActionTypes.SYSTEM_STARTUP, 'heartbeat', 'startup', { reset_count: resetCount });
  }
}

// ── Query Functions ─────────────────────────────────────────────────

/**
 * Get currently running heartbeat runs.
 * @returns {Array<Object>}
 */
function getActiveRuns() {
  return runsBuffer.filter((r) => r.status === 'running');
}

/**
 * Get recent heartbeat runs, newest first.
 * @param {number} [limit=50]
 * @returns {Array<Object>}
 */
function getRecentRuns(limit = 50) {
  return [...runsBuffer].reverse().slice(0, limit);
}

/**
 * Get total number of runs in the in-memory buffer.
 * @returns {number}
 */
function getTotalRuns() {
  return runsBuffer.length;
}

/**
 * Get aggregate stats for a specific agent.
 * @param {string} agentId
 * @returns {{ total_runs: number, total_cost_usd: number, avg_duration_ms: number, success_rate: number }}
 */
function getAgentStats(agentId) {
  const runs = runsBuffer.filter((r) => r.agent_id === agentId);
  const completed = runs.filter((r) => r.status === 'completed');
  const failed = runs.filter((r) => r.status === 'failed');

  const totalCostUsd = runs.reduce((sum, r) => sum + r.cost_usd, 0);
  const avgDurationMs = completed.length > 0
    ? completed.reduce((sum, r) => sum + r.duration_ms, 0) / completed.length
    : 0;
  const successRate = runs.length > 0 ? completed.length / runs.length : 0;

  return {
    total_runs: runs.length,
    total_cost_usd: totalCostUsd,
    avg_duration_ms: avgDurationMs,
    success_rate: successRate,
    completed: completed.length,
    failed: failed.length,
    budget_blocked: runs.filter((r) => r.status === 'budget_blocked').length,
  };
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  executeWithHeartbeat,
  resetStuckRuns,
  getActiveRuns,
  getRecentRuns,
  getTotalRuns,
  getAgentStats,
  registerHeartbeatDb,
};
