'use strict';

/**
 * Ralph Engine v4 — Carbon Core
 *
 * Real iterative improvement loop built on top of model-router-client.
 * Each iteration runs generate → score → decide (accept / improve / give-up).
 *
 * Differences from ralph-loop.js (v2):
 *   - Score-based acceptance (0.0–1.0) instead of completion-signal-only
 *   - Per-iteration feedback injected into next prompt
 *   - Custom verifyFn support for programmatic acceptance criteria
 *   - Full DB persistence via ralph_runs + ralph_iterations tables
 *   - Hook events on every iteration and on final completion
 *   - Budget guard before every LLM call; per-run budgetLimit respected
 *
 * Usage (dependency injection):
 *   const engine = new RalphEngine(db, modelRouterClient, budgetModule, hooksModule);
 *   const result  = await engine.run({ task, maxIterations: 5, scoreThreshold: 0.85 });
 *
 * Usage (convenience wrapper — uses default singletons):
 *   const { ralphRun } = require('./ralph-engine');
 *   const result = await ralphRun(db, { task, maxIterations: 5 });
 *
 * Returns:
 *   { runId, status, finalOutput, iterations, bestScore, totalTokens, totalCost, error? }
 */

const crypto = require('crypto');

const { logSystemAction, ActionTypes } = require('../audit-v2.js');
const { triggerHooks, HookEvents }     = require('../hooks-engine.js');

// ── Hook event strings (extend HookEvents without mutating the frozen obj) ──

const RALPH_HOOK = {
  ITERATION_COMPLETE: 'ralph.iteration_complete',
  RUN_COMPLETE:       'ralph.run_complete',
  SCORE_BELOW_THRESHOLD: 'ralph.score_below_threshold',
};

// ── Scoring ────────────────────────────────────────────────────────────────

/** Patterns that indicate incomplete or placeholder work */
const TODO_PATTERNS = [
  /\bTODO\b/,
  /\bFIXME\b/i,
  /\bPLACEHOLDER\b/i,
  /\bXXX\b/,
  /\/\/ TODO:/i,
  /# TODO:/i,
  /\[TODO[^\]]*\]/i,
];

const INCOMPLETE_PATTERNS = [
  /\[fill in\]/i,
  /\[insert [^\]]+\]/i,
  /\[your [^\]]+here\]/i,
  /\[\.{3}\]/,
];

const ERROR_PREFIXES = /^(Error:|ERROR:|Failed:|FATAL:)/m;

/**
 * Score output quality from 0.0 to 1.0.
 *
 * Deductions applied for:
 *   - Empty output              → 1.0 penalty (score = 0)
 *   - Very short (< 20 words)   → 0.40 deduction
 *   - Short (< 50 words)        → 0.15 deduction
 *   - Contains TODO markers     → 0.20 deduction (capped at one)
 *   - Contains incomplete markers → 0.15 deduction (capped at one)
 *   - Starts with error prefix  → 0.25 deduction
 *   - Custom verifyFn returns false → cap score at 0.70
 *
 * @param {string} output
 * @param {Function|null} verifyFn - async (output: string) => boolean
 * @returns {Promise<{ score: number, verified: boolean, penalties: string[] }>}
 */
async function scoreOutput(output, verifyFn = null) {
  const penalties = [];

  if (!output || !output.trim()) {
    return { score: 0.0, verified: false, penalties: ['empty output'] };
  }

  let score = 1.0;
  const wordCount = output.trim().split(/\s+/).length;

  if (wordCount < 20) {
    score -= 0.40;
    penalties.push(`very short output (${wordCount} words)`);
  } else if (wordCount < 50) {
    score -= 0.15;
    penalties.push(`short output (${wordCount} words)`);
  }

  for (const pattern of TODO_PATTERNS) {
    if (pattern.test(output)) {
      score -= 0.20;
      penalties.push(`contains TODO/FIXME marker`);
      break;
    }
  }

  for (const pattern of INCOMPLETE_PATTERNS) {
    if (pattern.test(output)) {
      score -= 0.15;
      penalties.push(`contains incomplete placeholder`);
      break;
    }
  }

  if (ERROR_PREFIXES.test(output)) {
    score -= 0.25;
    penalties.push(`output begins with error prefix`);
  }

  score = Math.max(0.0, Math.min(1.0, score));

  // Custom verification
  let verified = false;
  if (typeof verifyFn === 'function') {
    try {
      verified = Boolean(await verifyFn(output));
      if (!verified) {
        score = Math.min(score, 0.70);
        penalties.push(`custom verifyFn returned false`);
      }
    } catch (err) {
      penalties.push(`verifyFn threw: ${err.message}`);
    }
  }

  return { score, verified, penalties };
}

// ── RalphEngine ────────────────────────────────────────────────────────────

class RalphEngine {
  /**
   * @param {object|null} db            - db-adapter instance (null = no persistence)
   * @param {object}      modelRouter   - model-router-client (chat, estimateCost)
   * @param {object}      budget        - budget-v2 module (checkBudget, estimateCost)
   * @param {object}      hooks         - hooks-engine module (triggerHooks)
   */
  constructor(db, modelRouter, budget, hooks) {
    this._db          = db;
    this._modelRouter = modelRouter;
    this._budget      = budget;
    this._hooks       = hooks;
  }

  /**
   * Run a Ralph iterative improvement loop.
   *
   * @param {object} opts
   * @param {string}        opts.task             - Task description (required)
   * @param {number}        [opts.maxIterations=5] - Maximum improvement iterations
   * @param {number}        [opts.scoreThreshold=0.85] - Accept when score >= this value
   * @param {string}        [opts.model]           - LLM model identifier
   * @param {string}        [opts.agentId='ralph'] - For budget/audit tracking
   * @param {number}        [opts.budgetLimit]      - Hard USD ceiling for this run
   * @param {string}        [opts.completionSignal] - Accept if output contains this string
   * @param {Function}      [opts.verifyFn]         - async (output) => bool
   * @param {object}        [opts.context]          - Extra context injected into prompts
   *
   * @returns {Promise<RalphResult>}
   */
  async run(opts = {}) {
    const {
      task,
      maxIterations   = 5,
      scoreThreshold  = 0.85,
      model,
      agentId         = 'ralph',
      budgetLimit,
      completionSignal,
      verifyFn        = null,
      context         = {},
    } = opts;

    if (!task || typeof task !== 'string' || !task.trim()) {
      throw new Error('ralph-engine: task is required and must be a non-empty string');
    }

    const runId    = crypto.randomUUID();
    const nowSec   = () => Math.floor(Date.now() / 1000);

    // ── Persist initial run record ──────────────────────────────────────
    this._dbInsertRun({
      id:               runId,
      task,
      completionSignal: completionSignal || '',
      maxIterations,
      scoreThreshold,
      status:           'running',
      createdAt:        nowSec(),
    });

    logSystemAction(ActionTypes.AGENT_STARTED, 'ralph_engine', runId, {
      task:            task.slice(0, 100),
      max_iterations:  maxIterations,
      score_threshold: scoreThreshold,
      agent_id:        agentId,
    });

    console.log(
      `[ralph-engine] Run ${runId.slice(0, 8)} started` +
      ` — max ${maxIterations} iter, threshold ${scoreThreshold}`
    );

    const iterations  = [];
    let bestScore     = 0;
    let bestOutput    = '';
    let totalTokens   = 0;
    let totalCost     = 0;
    let finalStatus   = 'max_iterations';
    let finalError    = null;

    // ── Iteration loop ──────────────────────────────────────────────────
    for (let i = 1; i <= maxIterations; i++) {

      // ── Budget guard ──────────────────────────────────────────────────
      const budgetCheck = this._budget.checkBudget(agentId);
      if (!budgetCheck.allowed) {
        console.warn(`[ralph-engine] Budget blocked at iteration ${i}: ${budgetCheck.reason}`);
        finalStatus = 'budget_blocked';
        finalError  = budgetCheck.reason;
        this._dbUpdateRun(runId, { status: finalStatus, error: finalError, completedAt: nowSec() });
        logSystemAction(ActionTypes.BUDGET_EXCEEDED, 'ralph_engine', runId, { reason: finalError });
        break;
      }

      // ── Per-run budget ceiling ────────────────────────────────────────
      if (budgetLimit !== undefined && totalCost >= budgetLimit) {
        const reason = `per-run budget limit $${budgetLimit.toFixed(2)} reached`;
        console.warn(`[ralph-engine] ${reason} at iteration ${i}`);
        finalStatus = 'budget_blocked';
        finalError  = reason;
        this._dbUpdateRun(runId, { status: finalStatus, error: finalError, completedAt: nowSec() });
        break;
      }

      const iterStart  = Date.now();
      const iterPrompt = this._buildIterationPrompt(task, i, maxIterations, iterations, context);

      // ── Fire PRE_MESSAGE hook ─────────────────────────────────────────
      await triggerHooks(HookEvents.PRE_MESSAGE, {
        runId, iteration: i, agentId, prompt: iterPrompt.slice(0, 200),
      });

      // ── LLM call ──────────────────────────────────────────────────────
      let output     = '';
      let iterTokens = 0;
      let iterCost   = 0;
      let iterError  = null;

      try {
        const result = await this._modelRouter.chat(
          [{ role: 'user', content: iterPrompt }],
          { agentId, model, skipBudgetCheck: true },
        );
        output     = _extractText(result);
        iterTokens = result.tokensUsed || Math.ceil((iterPrompt.length + output.length) / 4);
        iterCost   = result.cost_usd  || this._budget.estimateCost(
          Math.ceil(iterPrompt.length / 4),
          Math.ceil(output.length / 4),
          0,
          model || 'claude-sonnet-4-6',
        );
      } catch (err) {
        iterError = err.message;
        console.warn(`[ralph-engine] LLM call failed at iteration ${i}: ${err.message}`);
      }

      const duration_ms = Date.now() - iterStart;
      totalTokens += iterTokens;
      totalCost   += iterCost;

      // ── Fire POST_MESSAGE hook ────────────────────────────────────────
      await triggerHooks(HookEvents.POST_MESSAGE, {
        runId, iteration: i, output: output.slice(0, 200), tokens: iterTokens,
      });

      // ── Score ─────────────────────────────────────────────────────────
      const { score, verified, penalties } = await scoreOutput(output, verifyFn);

      // ── Persist iteration ─────────────────────────────────────────────
      const iterRecord = {
        id:          crypto.randomUUID(),
        runId,
        iteration:   i,
        input:       iterPrompt.slice(0, 2000),
        output:      output.slice(0, 5000),
        score,
        verified,
        duration_ms,
        cost_usd:    iterCost,
        error:       iterError,
        penalties,
      };
      iterations.push(iterRecord);
      this._dbInsertIteration(iterRecord);
      this._dbUpdateRun(runId, { currentIteration: i, totalTokens, totalCost });

      // ── Fire RALPH_ITERATION_COMPLETE hook ────────────────────────────
      await triggerHooks(RALPH_HOOK.ITERATION_COMPLETE, {
        runId,
        iteration: i,
        score,
        verified,
        penalties,
        cost_usd:  iterCost,
        duration_ms,
      });

      const scoreLabel = (score * 100).toFixed(0);
      console.log(
        `[ralph-engine] Iter ${i}/${maxIterations}` +
        ` score=${score.toFixed(3)} tokens=${iterTokens} cost=$${iterCost.toFixed(4)}` +
        (penalties.length ? ` penalties=[${penalties.slice(0, 2).join('; ')}]` : '') +
        (iterError ? ` ERR:${iterError}` : '')
      );

      // ── Track best ────────────────────────────────────────────────────
      if (score > bestScore) {
        bestScore  = score;
        bestOutput = output;
      }

      // ── Acceptance checks ─────────────────────────────────────────────
      if (completionSignal && output.includes(completionSignal)) {
        finalStatus = 'completed';
        console.log(`[ralph-engine] ✅ Completion signal "${completionSignal}" found at iter ${i}`);
        break;
      }

      if (score >= scoreThreshold) {
        finalStatus = 'completed';
        console.log(`[ralph-engine] ✅ Score threshold met (${scoreLabel}/100 >= ${Math.round(scoreThreshold * 100)}) at iter ${i}`);
        break;
      }

      if (score < scoreThreshold) {
        await triggerHooks(RALPH_HOOK.SCORE_BELOW_THRESHOLD, {
          runId, iteration: i, score, threshold: scoreThreshold, penalties,
        });
      }

      // Terminal error on last iteration
      if (iterError && i === maxIterations) {
        finalStatus = 'failed';
        finalError  = iterError;
      }
    }

    // ── Finalize ──────────────────────────────────────────────────────────
    const completedAt = nowSec();
    this._dbUpdateRun(runId, {
      status:           finalStatus,
      result:           bestOutput.slice(0, 10_000),
      error:            finalError,
      totalTokens,
      totalCost,
      currentIteration: iterations.length,
      completedAt,
    });

    const auditAction = finalStatus === 'completed'
      ? ActionTypes.AGENT_COMPLETED
      : ActionTypes.AGENT_FAILED;

    logSystemAction(auditAction, 'ralph_engine', runId, {
      iterations:  iterations.length,
      best_score:  bestScore,
      total_cost:  totalCost,
      total_tokens: totalTokens,
    });

    await triggerHooks(RALPH_HOOK.RUN_COMPLETE, {
      runId, status: finalStatus, bestScore, iterations: iterations.length, totalCost,
    });

    console.log(
      `[ralph-engine] Run ${runId.slice(0, 8)} ${finalStatus}` +
      ` — ${iterations.length} iter, score=${bestScore.toFixed(3)}, cost=$${totalCost.toFixed(4)}`
    );

    return this._buildResult(runId, finalStatus, bestOutput, iterations, bestScore, totalTokens, totalCost, finalError);
  }

  // ── Prompt builder ───────────────────────────────────────────────────────

  _buildIterationPrompt(task, iteration, maxIterations, previousIterations, context) {
    const contextSection = Object.keys(context).length > 0
      ? `\n\nContext:\n${JSON.stringify(context, null, 2)}`
      : '';

    if (iteration === 1) {
      return `${task}${contextSection}`;
    }

    const last       = previousIterations[previousIterations.length - 1];
    const prevOutput = last?.output || '(no output)';
    const prevScore  = last?.score  ?? 0;
    const prevPens   = (last?.penalties ?? []).slice(0, 4);

    const feedbackLines = prevPens.length > 0
      ? `\n\nIssues detected in previous attempt:\n${prevPens.map(p => `  • ${p}`).join('\n')}`
      : '';

    return [
      task + contextSection,
      '',
      `--- [Iteration ${iteration}/${maxIterations}] ---`,
      `Previous attempt quality: ${(prevScore * 100).toFixed(0)}/100${feedbackLines}`,
      '',
      'Previous output (for reference — improve upon it):',
      '<previous_output>',
      prevOutput.slice(0, 1500),
      '</previous_output>',
      '',
      'Please address the issues above and produce an improved, complete response.',
    ].join('\n');
  }

  // ── Result builder ───────────────────────────────────────────────────────

  _buildResult(runId, status, finalOutput, iterations, bestScore, totalTokens, totalCost, error) {
    return {
      runId,
      status,
      finalOutput,
      iterations: iterations.map(it => ({
        iteration:   it.iteration,
        score:       it.score,
        verified:    it.verified,
        duration_ms: it.duration_ms,
        cost_usd:    it.cost_usd,
        penalties:   it.penalties,
        error:       it.error || null,
      })),
      bestScore,
      totalTokens,
      totalCost,
      error: error || null,
    };
  }

  // ── DB helpers (all swallow errors — DB unavailability must not crash runs) ─

  _dbInsertRun(r) {
    if (!this._db) return;
    try {
      this._db.run(
        `INSERT OR IGNORE INTO ralph_runs
           (id, task, completion_promise, max_iterations, score_threshold, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [r.id, r.task, r.completionSignal, r.maxIterations, r.scoreThreshold, r.status, r.createdAt],
      );
    } catch (e) {
      console.warn(`[ralph-engine] DB insert run: ${e.message}`);
    }
  }

  _dbUpdateRun(runId, u) {
    if (!this._db) return;
    try {
      const sets = [];
      const vals = [];
      if (u.status !== undefined)           { sets.push('status = ?');           vals.push(u.status); }
      if (u.result !== undefined)           { sets.push('result = ?');           vals.push(u.result); }
      if (u.error !== undefined)            { sets.push('error = ?');            vals.push(u.error); }
      if (u.totalTokens !== undefined)      { sets.push('total_tokens = ?');     vals.push(u.totalTokens); }
      if (u.totalCost !== undefined)        { sets.push('total_cost_usd = ?');   vals.push(u.totalCost); }
      if (u.currentIteration !== undefined) { sets.push('current_iteration = ?'); vals.push(u.currentIteration); }
      if (u.completedAt !== undefined)      { sets.push('completed_at = ?');     vals.push(u.completedAt); }
      if (!sets.length) return;
      vals.push(runId);
      this._db.run(`UPDATE ralph_runs SET ${sets.join(', ')} WHERE id = ?`, vals);
    } catch (e) {
      console.warn(`[ralph-engine] DB update run: ${e.message}`);
    }
  }

  _dbInsertIteration(it) {
    if (!this._db) return;
    try {
      this._db.run(
        `INSERT OR IGNORE INTO ralph_iterations
           (id, run_id, iteration, input, output, score, verified, duration_ms, cost_usd, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          it.id, it.runId, it.iteration,
          it.input, it.output,
          it.score, it.verified ? 1 : 0,
          it.duration_ms, it.cost_usd,
          Math.floor(Date.now() / 1000),
        ],
      );
    } catch (e) {
      console.warn(`[ralph-engine] DB insert iteration: ${e.message}`);
    }
  }
}

// ── Utility ───────────────────────────────────────────────────────────────

/**
 * Extract plain text from a model-router-client result.
 * Handles: content as string, content as array of Claude content blocks.
 */
function _extractText(result) {
  const content = result?.content;
  if (!content) return '';
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .filter(b => b && b.type === 'text')
      .map(b => b.text || '')
      .join('\n')
      .trim();
  }
  return String(content).trim();
}

// ── Convenience wrapper ───────────────────────────────────────────────────

/**
 * Run a Ralph engine loop using the default module singletons.
 * Suitable for calling from api-server-v4.js.
 *
 * @param {object|null} db   - DB adapter (may be null in tests)
 * @param {object}      opts - Same opts as RalphEngine.run()
 * @returns {Promise<RalphResult>}
 */
async function ralphRun(db, opts) {
  const modelRouter = require('../model-router-client.js');
  const budget      = require('../budget-v2.js');
  const hooks       = require('../hooks-engine.js');
  const engine      = new RalphEngine(db, modelRouter, budget, hooks);
  return engine.run(opts);
}

/**
 * Query a ralph run record from the DB.
 * @param {object} db
 * @param {string} runId
 */
function getRalphRun(db, runId) {
  if (!db) return null;
  try {
    return db.get('SELECT * FROM ralph_runs WHERE id = ?', [runId]);
  } catch {
    return null;
  }
}

/**
 * Query iteration records for a run.
 * @param {object} db
 * @param {string} runId
 */
function getRalphIterations(db, runId) {
  if (!db) return [];
  try {
    return db.all('SELECT * FROM ralph_iterations WHERE run_id = ? ORDER BY iteration ASC', [runId]);
  } catch {
    return [];
  }
}

/**
 * List recent ralph runs.
 * @param {object} db
 * @param {number} [limit=20]
 */
function listRalphRuns(db, limit = 20) {
  if (!db) return [];
  try {
    return db.all('SELECT * FROM ralph_runs ORDER BY created_at DESC LIMIT ?', [limit]);
  } catch {
    return [];
  }
}


module.exports = {
  RalphEngine,
  ralphRun,
  getRalphRun,
  getRalphIterations,
  listRalphRuns,
  scoreOutput,       // exported for testing
  RALPH_HOOK,
};
