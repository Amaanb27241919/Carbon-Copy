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
  // Each stage validates its input schema and retries with exponential backoff.
  // Typed handoff: previous stage output is passed as structured context.
  let currentInput = run.task;
  const stageResults = [];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const entry = run.agents[i];

    // Build typed handoff prompt
    const stagePrompt = i === 0
      ? currentInput
      : _buildHandoffPrompt(run.task, currentInput, agent, i, stageResults);

    // Validate input is non-empty string (basic schema check)
    if (!stagePrompt || typeof stagePrompt !== 'string' || stagePrompt.trim().length === 0) {
      entry.status = 'failed';
      entry.error = `Stage ${i} received empty input from previous stage`;
      entry.endedAt = Date.now();
      break;
    }

    entry.status = 'running';
    entry.startedAt = Date.now();

    // Retry up to 3 times with exponential backoff (1s, 2s, 4s)
    let text = null;
    let lastErr = null;
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) {
        const delayMs = 1000 * Math.pow(2, attempt - 1);
        console.log(`[orchestrator] Pipeline stage ${i} retry ${attempt} in ${delayMs}ms`);
        await _sleep(delayMs);
      }
      try {
        const result = await _spawnClaudeSync(stagePrompt, agent.systemPrompt || null, null, null);
        text = result.text;
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`[orchestrator] Pipeline stage ${i} attempt ${attempt} failed: ${err.message}`);
      }
    }

    if (lastErr) {
      entry.status = 'failed';
      entry.error = lastErr.message;
      entry.endedAt = Date.now();
      break; // pipeline breaks on unrecoverable failure
    }

    entry.status = 'completed';
    entry.result = text;
    entry.endedAt = Date.now();
    stageResults.push({ stage: i, name: entry.name, output: text });
    currentInput = text;
  }

  const last = [...run.agents].reverse().find((a) => a.result);
  run.result = last ? last.result : null;
  run.status = run.result ? 'completed' : 'failed';
  run.error = run.result ? null : 'Pipeline failed';
  run.endedAt = Date.now();
}

/**
 * Phased execution: Planner → Parallel workers → Synthesizer → Critic review.
 * Phase 1: First agent decomposes task into subtasks.
 * Phase 2: Worker agents run subtasks in parallel.
 * Phase 3: Last agent (or planner) synthesizes all worker outputs.
 * Phase 4: Critic (planner) reviews synthesis and flags issues.
 */
async function _runPhased(run, agents) {
  const planner = agents[0];
  const plannerEntry = run.agents[0];

  // ── Phase 1: Plan ──────────────────────────────────────────────────
  run.phase = 'plan';
  plannerEntry.status = 'running';
  plannerEntry.startedAt = Date.now();

  let subtasks;
  try {
    const planPrompt =
      `You are a strategic task planner. Decompose the following task into clear, ` +
      `actionable subtasks. Output ONLY the subtask descriptions, one per line. ` +
      `No numbering, bullets, or commentary.\n\nTask: ${run.task}`;
    const { text } = await _spawnClaudeSync(planPrompt, planner.systemPrompt || null, null, null);
    plannerEntry.status = 'completed';
    plannerEntry.result = text;
    plannerEntry.endedAt = Date.now();
    subtasks = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (subtasks.length === 0) subtasks = [run.task]; // fallback
    console.log(`[orchestrator] Phase 1 complete: ${subtasks.length} subtasks`);
  } catch (err) {
    plannerEntry.status = 'failed';
    plannerEntry.error = err.message;
    plannerEntry.endedAt = Date.now();
    run.status = 'failed';
    run.error = `Planner failed: ${err.message}`;
    run.endedAt = Date.now();
    return;
  }

  // ── Phase 2: Execute (parallel workers) ───────────────────────────
  run.phase = 'execute';
  const workerAgents = agents.length > 1 ? agents.slice(1, -1) : agents;
  const effectiveWorkers = workerAgents.length > 0 ? workerAgents : [planner];

  const workerPromises = subtasks.map((subtask, idx) => {
    const worker = effectiveWorkers[idx % effectiveWorkers.length];
    const fullPrompt =
      `# Original Task\n\n${run.task}\n\n# Your Assigned Subtask\n\n${subtask}\n\n` +
      `Complete this subtask fully. Be specific and thorough.`;
    return _spawnClaudeSync(fullPrompt, worker.systemPrompt || null, null, null)
      .then(({ text }) => ({ ok: true, text, subtask }))
      .catch((err) => ({ ok: false, err: err.message, subtask }));
  });

  const workerResults = await Promise.allSettled(workerPromises);
  const successfulOutputs = [];
  for (const settled of workerResults) {
    const r = settled.value || { ok: false, err: 'unknown', subtask: '' };
    if (r.ok) {
      successfulOutputs.push(`## Subtask: ${r.subtask.slice(0, 80)}\n\n${r.text}`);
    }
  }
  console.log(`[orchestrator] Phase 2 complete: ${successfulOutputs.length}/${subtasks.length} workers succeeded`);

  if (successfulOutputs.length === 0) {
    run.status = 'failed';
    run.error = 'All workers failed in Phase 2';
    run.endedAt = Date.now();
    return;
  }

  const workerOutput = successfulOutputs.join('\n\n---\n\n');

  // ── Phase 3: Synthesize ────────────────────────────────────────────
  run.phase = 'synthesize';
  const synthAgent = agents[agents.length - 1] || planner;

  let synthesis;
  try {
    const synthPrompt =
      `You are a synthesis agent. Below are the outputs from parallel worker agents ` +
      `who worked on subtasks of a larger goal. Combine them into a single coherent, ` +
      `comprehensive output that addresses the original task.\n\n` +
      `# Original Task\n\n${run.task}\n\n# Worker Outputs\n\n${workerOutput}`;
    const { text } = await _spawnClaudeSync(synthPrompt, synthAgent.systemPrompt || null, null, null);
    synthesis = text;
    console.log(`[orchestrator] Phase 3 complete: synthesis ready`);
  } catch (err) {
    // Phase 3 failure: return raw worker output as fallback
    console.warn(`[orchestrator] Phase 3 synthesis failed, using worker output: ${err.message}`);
    synthesis = workerOutput;
  }

  // ── Phase 4: Critique ──────────────────────────────────────────────
  run.phase = 'critique';
  let finalOutput = synthesis;
  try {
    const criticPrompt =
      `You are a critical reviewer. Evaluate the following output against the original task. ` +
      `If the output fully addresses the task, respond: "APPROVED: <brief reason>"\n` +
      `If there are significant gaps, respond: "NEEDS_WORK: <specific issues>"\n\n` +
      `# Original Task\n\n${run.task}\n\n# Output to Review\n\n${synthesis}`;
    const { text: criticOutput } = await _spawnClaudeSync(
      criticPrompt, planner.systemPrompt || null, null, null,
    );
    console.log(`[orchestrator] Phase 4 critique: ${criticOutput.slice(0, 100)}`);
    // Append critic review as metadata; don't replace synthesis
    finalOutput = `${synthesis}\n\n---\n\n**Critic Review:** ${criticOutput}`;
  } catch (err) {
    console.warn(`[orchestrator] Phase 4 critique failed (non-fatal): ${err.message}`);
    // Critic failure is non-fatal — use synthesis as final output
  }

  run.result = finalOutput;
  run.status = 'completed';
  run.error = null;
  run.phase = 'complete';
  run.endedAt = Date.now();
}

// ── Pipeline Helpers ────────────────────────────────────────────────

/**
 * Build a typed handoff prompt for pipeline stage N.
 * Provides the original task, stage context, and previous output.
 */
function _buildHandoffPrompt(originalTask, previousOutput, agent, stageIndex, priorResults) {
  const priorSummary = priorResults.length > 0
    ? priorResults.map((r) => `Stage ${r.stage} (${r.name}): ${r.output.slice(0, 200)}`).join('\n')
    : '(no prior stages)';

  return (
    `# Pipeline Stage ${stageIndex}\n\n` +
    `## Original Task\n\n${originalTask}\n\n` +
    `## Previous Stage Output\n\n${previousOutput}\n\n` +
    `## Prior Stage Summary\n\n${priorSummary}\n\n` +
    `## Your Instructions\n\n${agent.systemPrompt ? `Role: ${agent.systemPrompt}\n\n` : ''}` +
    `Continue the pipeline by processing the previous stage's output. ` +
    `Build on it, refine it, or transform it as appropriate for your role.`
  );
}

/**
 * Sleep for a given number of milliseconds.
 * @param {number} ms
 * @returns {Promise<void>}
 */
function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main Execution Driver ─────────────────────────────────────────────

async function _executeOrchestration(run, agents) {
  try {
    switch (run.mode) {
      case 'parallel':     await _runParallel(run, agents);     break;
      case 'sequential':   await _runSequential(run, agents);   break;
      case 'hierarchical': await _runHierarchical(run, agents); break;
      case 'pipeline':     await _runPipeline(run, agents);     break;
      case 'phased':       await _runPhased(run, agents);       break;
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

/**
 * Start a phased orchestration run (Plan → Execute → Synthesize → Critique).
 * Convenience wrapper around orchestrate() that forces mode='phased' and
 * ensures at least 2 agents (planner + worker) are present.
 *
 * @param {{ task: string, agents?: Array<{ name: string, systemPrompt?: string }>, options?: object, userId?: string }} opts
 * @returns {{ runId: string }}
 */
function orchestratePhased({ task, agents, options: _options, userId = null }) {
  if (!task) throw new Error('task is required');

  const normalizedAgents = (agents && agents.length >= 2)
    ? agents
    : [
        { name: 'planner',     systemPrompt: 'You are a strategic task planner.' },
        { name: 'worker',      systemPrompt: 'You are a focused task executor.' },
        { name: 'synthesizer', systemPrompt: 'You are a synthesis and quality agent.' },
      ];

  return orchestrate({ task, agents: normalizedAgents, mode: 'phased', userId });
}

module.exports = {
  orchestrate,
  orchestratePhased,
  getOrchestrationRun,
  getAllOrchestrationRuns,
  getActiveRuns,
  cancelRun,
};
