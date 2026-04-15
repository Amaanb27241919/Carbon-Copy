/**
 * Multi-Agent Orchestrator v2 — Carbon Core
 * 4 modes: parallel, sequential, hierarchical, pipeline
 * Spawns claude CLI subprocesses. In-memory run registry.
 */

'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const { logSystemAction, ActionTypes } = require('./audit-v2.js');
const { checkBudget } = require('./budget-v2.js');

// ── Constants ────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const MAX_RUNS = 200;

// ── Run Registry ─────────────────────────────────────────────────────

/** @type {Map<string, object>} */
const _runs = new Map();

function _pruneRuns() {
  if (_runs.size <= MAX_RUNS) return;
  const sorted = [..._runs.entries()].sort((a, b) => a[1].startedAt - b[1].startedAt);
  const toRemove = sorted.slice(0, _runs.size - MAX_RUNS);
  for (const [id] of toRemove) _runs.delete(id);
}

// ── Claude Subprocess Helper ─────────────────────────────────────────

/**
 * Spawn claude CLI and return the printed response text.
 * @param {string} prompt
 * @param {string} [systemPrompt]
 * @param {string} [workDir]
 * @param {number} [maxTurns]
 * @returns {Promise<{ text: string, exitCode: number }>}
 */
function _spawnClaudeSync(prompt, systemPrompt, workDir, maxTurns) {
  return new Promise((resolve, reject) => {
    const args = ['--print', '--output-format', 'json'];

    if (systemPrompt) {
      args.push('--system-prompt', systemPrompt);
    }
    if (maxTurns) {
      args.push('--max-turns', String(maxTurns));
    }

    args.push(prompt);

    const proc = spawn('claude', args, {
      cwd: workDir || process.cwd(),
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGTERM');
      reject(new Error('claude subprocess timed out after 5 minutes'));
    }, DEFAULT_TIMEOUT);

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) return;

      let text = stdout.trim();
      // claude --output-format json wraps in { result: "..." } or similar
      try {
        const parsed = JSON.parse(text);
        text = parsed.result || parsed.text || parsed.content || text;
      } catch {
        // plain text output — use as-is
      }

      if (code !== 0) {
        reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
      } else {
        resolve({ text, exitCode: code });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ── Internal: Build Agent Entry ──────────────────────────────────────

function _makeAgentEntry(agent) {
  return {
    name: agent.name || 'agent',
    status: 'pending',
    result: null,
    error: null,
    startedAt: null,
    endedAt: null,
  };
}

// ── Orchestration Modes ──────────────────────────────────────────────

async function _runParallel(run, agents) {
  for (const a of run.agents) { a.status = 'running'; a.startedAt = Date.now(); }

  const promises = agents.map((agent, i) =>
    _spawnClaudeSync(run.task, agent.systemPrompt || null, null, null)
      .then(({ text }) => ({ ok: true, text, i }))
      .catch((err) => ({ ok: false, err: err.message, i }))
  );

  const results = await Promise.allSettled(promises);

  const parts = [];
  for (const settled of results) {
    // Promise.allSettled always fulfills; our inner promise handles errors
    const r = settled.value || { ok: false, err: 'unknown', i: 0 };
    const entry = run.agents[r.i];
    entry.endedAt = Date.now();
    if (r.ok) {
      entry.status = 'completed';
      entry.result = r.text;
      parts.push(`## ${entry.name}\n\n${r.text}`);
    } else {
      entry.status = 'failed';
      entry.error = r.err;
    }
  }

  run.result = parts.length > 0 ? parts.join('\n\n---\n\n') : null;
  run.status = run.result ? 'completed' : 'failed';
  run.error = run.result ? null : 'All agents failed';
  run.endedAt = Date.now();
}

async function _runSequential(run, agents) {
  let previousResult = null;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const entry = run.agents[i];
    entry.status = 'running';
    entry.startedAt = Date.now();

    const prompt = previousResult
      ? `# Original Task\n\n${run.task}\n\n# Previous Agent Output\n\n${previousResult}\n\n# Your Task\n\nBuild on the above output.`
      : run.task;

    try {
      const { text } = await _spawnClaudeSync(prompt, agent.systemPrompt || null, null, null);
      entry.status = 'completed';
      entry.result = text;
      entry.endedAt = Date.now();
      previousResult = text;
    } catch (err) {
      entry.status = 'failed';
      entry.error = err.message;
      entry.endedAt = Date.now();
    }
  }

  const last = [...run.agents].reverse().find((a) => a.result);
  run.result = last ? last.result : null;
  run.status = run.result ? 'completed' : 'failed';
  run.error = run.result ? null : 'No agent produced output';
  run.endedAt = Date.now();
}

async function _runHierarchical(run, agents) {
  // First agent is the planner — decomposes into subtasks (one per line)
  const planner = agents[0];
  const plannerEntry = run.agents[0];
  plannerEntry.status = 'running';
  plannerEntry.startedAt = Date.now();

  let subtasks;
  try {
    const planPrompt = `You are a task planner. Decompose the following task into clear subtasks, one per line. Output only the subtask descriptions, no numbering or bullets.\n\nTask: ${run.task}`;
    const { text } = await _spawnClaudeSync(planPrompt, planner.systemPrompt || null, null, null);
    plannerEntry.status = 'completed';
    plannerEntry.result = text;
    plannerEntry.endedAt = Date.now();
    subtasks = text.split('\n').map((l) => l.trim()).filter(Boolean);
  } catch (err) {
    plannerEntry.status = 'failed';
    plannerEntry.error = err.message;
    plannerEntry.endedAt = Date.now();
    run.status = 'failed';
    run.error = `Planner failed: ${err.message}`;
    run.endedAt = Date.now();
    return;
  }

  // Each subtask runs in parallel as its own agent call
  const workerAgents = agents.slice(1);
  const subtaskPromises = subtasks.map((subtask, idx) => {
    const workerAgent = workerAgents[idx % Math.max(workerAgents.length, 1)] || planner;
    return _spawnClaudeSync(subtask, workerAgent.systemPrompt || null, null, null)
      .then(({ text }) => ({ ok: true, text, subtask }))
      .catch((err) => ({ ok: false, err: err.message, subtask }));
  });

  const subtaskResults = await Promise.allSettled(subtaskPromises);
  const parts = [];
  for (const settled of subtaskResults) {
    const r = settled.value || { ok: false, err: 'unknown', subtask: '' };
    if (r.ok) {
      parts.push(`## Subtask: ${r.subtask.slice(0, 80)}\n\n${r.text}`);
    }
  }

  run.result = parts.length > 0 ? parts.join('\n\n---\n\n') : null;
  run.status = run.result ? 'completed' : 'failed';
  run.error = run.result ? null : 'All subtasks failed';
  run.endedAt = Date.now();
}

async function _runPipeline(run, agents) {
  let currentInput = run.task;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const entry = run.agents[i];
    entry.status = 'running';
    entry.startedAt = Date.now();

    try {
      const { text } = await _spawnClaudeSync(currentInput, agent.systemPrompt || null, null, null);
      entry.status = 'completed';
      entry.result = text;
      entry.endedAt = Date.now();
      currentInput = text; // output becomes next agent's input
    } catch (err) {
      entry.status = 'failed';
      entry.error = err.message;
      entry.endedAt = Date.now();
      break; // pipeline breaks on failure
    }
  }

  const last = [...run.agents].reverse().find((a) => a.result);
  run.result = last ? last.result : null;
  run.status = run.result ? 'completed' : 'failed';
  run.error = run.result ? null : 'Pipeline failed';
  run.endedAt = Date.now();
}

// ── Main Execution Driver ─────────────────────────────────────────────

async function _executeOrchestration(run, agents) {
  try {
    switch (run.mode) {
      case 'parallel':     await _runParallel(run, agents);     break;
      case 'sequential':   await _runSequential(run, agents);   break;
      case 'hierarchical': await _runHierarchical(run, agents); break;
      case 'pipeline':     await _runPipeline(run, agents);     break;
      default:
        throw new Error(`Unknown orchestration mode: ${run.mode}`);
    }

    logSystemAction(ActionTypes.ORCHESTRATION_COMPLETED, 'orchestration', run.id, {
      mode: run.mode,
      duration_ms: run.endedAt - run.startedAt,
    });
  } catch (err) {
    run.status = 'failed';
    run.error = err.message;
    run.endedAt = Date.now();
    logSystemAction(ActionTypes.ORCHESTRATION_FAILED, 'orchestration', run.id, { error: err.message });
    console.error(`[orchestrator] Run ${run.id} failed:`, err.message);
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Start an orchestration run. Returns immediately with { runId }.
 * Execution continues in the background.
 *
 * @param {{ task: string, agents?: Array<{ name: string, systemPrompt?: string }>, mode?: string, userId?: string }} opts
 * @returns {{ runId: string }}
 */
function orchestrate({ task, agents, mode = 'parallel', userId = null }) {
  if (!task) throw new Error('task is required');

  const runId = crypto.randomUUID();
  const normalizedAgents = (agents && agents.length > 0)
    ? agents
    : [{ name: 'assistant', systemPrompt: null }];

  // Budget check (best-effort — don't block if no policies set)
  try {
    const budgetCheck = checkBudget(userId || 'orchestrator');
    if (!budgetCheck.allowed) {
      throw new Error(`Budget limit reached: ${budgetCheck.reason}`);
    }
  } catch (err) {
    if (err.message.startsWith('Budget limit')) throw err;
    // No budget registered — proceed
  }

  const run = {
    id: runId,
    task,
    mode,
    status: 'running',
    agents: normalizedAgents.map(_makeAgentEntry),
    result: null,
    error: null,
    startedAt: Date.now(),
    endedAt: null,
    userId,
  };

  _runs.set(runId, run);
  _pruneRuns();

  logSystemAction(ActionTypes.ORCHESTRATION_STARTED, 'orchestration', runId, {
    mode,
    task: task.slice(0, 100),
    agent_count: normalizedAgents.length,
  });

  // Fire-and-forget
  _executeOrchestration(run, normalizedAgents).catch(() => {});

  return { runId };
}

/**
 * @param {string} runId
 * @returns {object|null}
 */
function getOrchestrationRun(runId) {
  return _runs.get(runId) || null;
}

/**
 * @param {{ limit?: number }} [opts]
 * @returns {object[]}
 */
function getAllOrchestrationRuns({ limit = 50 } = {}) {
  return [..._runs.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

/**
 * @returns {object[]}
 */
function getActiveRuns() {
  return [..._runs.values()].filter((r) => r.status === 'running');
}

/**
 * Attempt to cancel a running orchestration. Because agents are async
 * subprocesses we mark it failed immediately; the subprocess may still finish.
 * @param {string} runId
 * @returns {boolean}
 */
function cancelRun(runId) {
  const run = _runs.get(runId);
  if (!run || run.status !== 'running') return false;
  run.status = 'failed';
  run.error = 'Cancelled by user';
  run.endedAt = Date.now();
  logSystemAction(ActionTypes.ORCHESTRATION_FAILED, 'orchestration', runId, { error: 'cancelled' });
  return true;
}

module.exports = {
  orchestrate,
  getOrchestrationRun,
  getAllOrchestrationRuns,
  getActiveRuns,
  cancelRun,
};
