'use strict';

/**
 * AgentLoop v4 — Carbon Core
 *
 * Full agentic execution loop with tool dispatch, budget guard, hooks, and DB persistence.
 * Ported from claw-cli QueryEngine.ts + Tool.ts patterns, adapted to Carbon Core's
 * model-router-client and dependency-injection architecture.
 *
 * Architecture:
 *   AgentLoop maintains a messages[] array in Anthropic format (system + user + assistant
 *   + tool_result turns). Each turn calls modelRouter, parses stop_reason, dispatches
 *   any tool_use blocks via agent-tools.js, then continues until end_turn, max turns,
 *   or budget exceeded.
 *
 * Usage (dependency injection):
 *   const loop = new AgentLoop(db, modelRouter, budget, hooks, audit);
 *   const result = await loop.run({ systemPrompt, userMessage, tools: ['bash', 'file_read'] });
 *
 * Usage (convenience wrapper):
 *   const { agentRun } = require('./agent-loop');
 *   const result = await agentRun(db, { agentId: 'ali', systemPrompt, userMessage });
 *
 * Returns:
 *   { runId, output, turns[], toolCalls[], tokensUsed, cost, stopReason, duration }
 */

const crypto = require('crypto');

const { executeTool, listTools, getTool, PermissionMode } = require('./agent-tools.js');
const { triggerHooks, HookEvents }                        = require('../hooks-engine.js');
const { logAgentAction, logSystemAction, ActionTypes }    = require('../audit-v2.js');

// ── Hook events specific to AgentLoop ─────────────────────────────────────

const LOOP_HOOK = Object.freeze({
  PRE_LLM:       'loop.pre_llm',
  POST_LLM:      'loop.post_llm',
  LOOP_COMPLETE: 'loop.complete',
});

// ── Stop reasons ──────────────────────────────────────────────────────────

const StopReason = Object.freeze({
  END_TURN:       'end_turn',
  TOOL_USE:       'tool_use',
  MAX_TOKENS:     'max_tokens',
  MAX_TURNS:      'max_turns',
  BUDGET_BLOCKED: 'budget_blocked',
  ERROR:          'error',
});

// ── Tool input schemas (Anthropic tool_use format) ─────────────────────

const TOOL_SCHEMAS = {
  bash: {
    name: 'bash',
    description: 'Run a shell command in the working directory. ' +
      'Prefer read-only commands (ls, cat, grep) for inspection. ' +
      'Avoid destructive operations unless explicitly authorized.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute.',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 120000). Max 600000.',
        },
      },
      required: ['command'],
    },
  },

  file_edit: {
    name: 'file_edit',
    description: 'Edit a file by replacing old_string with new_string. ' +
      'old_string must be an exact, unique match in the file. ' +
      'Returns an error if old_string is not found or matches multiple locations.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute or relative path to the file to edit.',
        },
        old_string: {
          type: 'string',
          description: 'Exact text to replace (must be unique in the file).',
        },
        new_string: {
          type: 'string',
          description: 'Replacement text.',
        },
      },
      required: ['file_path', 'old_string', 'new_string'],
    },
  },

  file_read: {
    name: 'file_read',
    description: 'Read the contents of a file, optionally specifying a line range.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute or relative path to the file.',
        },
        offset: {
          type: 'number',
          description: 'Starting line number (1-indexed). Defaults to 1.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of lines to return. Defaults to all.',
        },
      },
      required: ['file_path'],
    },
  },

  file_write: {
    name: 'file_write',
    description: 'Write content to a file. Creates the file and any missing parent ' +
      'directories. Overwrites existing content.',
    input_schema: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Absolute or relative path to the file.',
        },
        content: {
          type: 'string',
          description: 'Full content to write to the file.',
        },
      },
      required: ['file_path', 'content'],
    },
  },

  agent: {
    name: 'agent',
    description: 'Spawn a focused sub-agent (Claude CLI) to complete an isolated subtask. ' +
      'The sub-agent gets its own working directory and permission mode. ' +
      'Use for tasks that are fully self-contained and do not need to share state.',
    input_schema: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          description: 'Complete task description for the sub-agent.',
        },
        model: {
          type: 'string',
          description: 'Model identifier (default: claude-sonnet-4-6).',
        },
        workDir: {
          type: 'string',
          description: 'Working directory for the sub-agent. Defaults to current workDir.',
        },
        permissionMode: {
          type: 'string',
          description: 'Permission mode: bypassPermissions | acceptEdits | default | plan',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default 600000).',
        },
      },
      required: ['task'],
    },
  },
};

// ── AgentLoop ─────────────────────────────────────────────────────────────

class AgentLoop {
  /**
   * @param {object|null} db           - db-adapter instance (null = no persistence)
   * @param {object}      modelRouter  - model-router-client { chat }
   * @param {object}      budget       - budget-v2 { checkBudget, estimateCost }
   * @param {object}      hooks        - hooks-engine { triggerHooks }
   * @param {object}      audit        - audit-v2 { logAgentAction, logSystemAction }
   */
  constructor(db, modelRouter, budget, hooks, audit) {
    this._db          = db;
    this._modelRouter = modelRouter;
    this._budget      = budget;
    this._hooks       = hooks;
    this._audit       = audit;
  }

  /**
   * Execute an agentic loop.
   *
   * @param {object}   opts
   * @param {string}   opts.systemPrompt     - System prompt for this agent
   * @param {string}   opts.userMessage      - Initial user message
   * @param {string[]} [opts.tools]          - Tool names to enable (default: all registered)
   * @param {number}   [opts.maxTurns=10]    - Maximum agentic turns before forced stop
   * @param {string}   [opts.model]          - LLM model identifier
   * @param {string}   [opts.agentId]        - Agent ID for budget + audit tracking
   * @param {number}   [opts.budgetLimit]    - Hard USD ceiling for this run
   * @param {string}   [opts.permissionMode] - PermissionMode for tool execution
   * @param {string}   [opts.workDir]        - Working directory for tool execution
   * @param {Function} [opts.onToken]        - Callback for streaming text chunks
   * @param {string}   [opts.runId]          - Pre-assigned run ID (generated if absent)
   *
   * @returns {Promise<AgentLoopResult>}
   */
  async run(opts = {}) {
    const {
      systemPrompt,
      userMessage,
      tools,
      maxTurns       = 10,
      model,
      agentId        = 'agent',
      budgetLimit,
      permissionMode = PermissionMode.DEFAULT,
      workDir        = process.cwd(),
      onToken        = null,
      runId: preRunId,
    } = opts;

    if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
      throw new Error('agent-loop: userMessage is required and must be a non-empty string');
    }

    const runId   = preRunId || crypto.randomUUID();
    const startMs = Date.now();
    const nowSec  = () => Math.floor(Date.now() / 1000);

    // ── Tool definitions for this run ────────────────────────────────────
    const toolIds  = Array.isArray(tools) && tools.length > 0
      ? tools
      : listTools().map(t => t.name);
    const toolDefs = this.buildToolDefinitions(toolIds);

    // ── Execution context for tool calls ─────────────────────────────────
    const toolCtx = { permissionMode, workDir, agentId };

    // ── Persist initial run record ────────────────────────────────────────
    this._dbInsertRun({
      id:         runId,
      agent_id:   agentId,
      prompt:     userMessage.slice(0, 2000),
      status:     'running',
      model:      model || null,
      created_at: nowSec(),
    });

    logSystemAction(ActionTypes.AGENT_STARTED, 'agent_loop', runId, {
      agent_id:   agentId,
      max_turns:  maxTurns,
      tool_count: toolDefs.length,
      prompt_len: userMessage.length,
    });

    console.log(
      `[agent-loop] Run ${runId.slice(0, 8)} started — agentId=${agentId}` +
      ` maxTurns=${maxTurns} tools=[${toolIds.join(',')}]`
    );

    // ── Message history ───────────────────────────────────────────────────
    const messages = [{ role: 'user', content: userMessage }];

    const turns      = [];
    const toolCalls  = [];
    let   totalTokens = 0;
    let   totalCost   = 0;
    let   stopReason  = StopReason.MAX_TURNS;
    let   finalOutput = '';
    let   finalError  = null;

    // ── Agentic turn loop ─────────────────────────────────────────────────
    for (let turn = 1; turn <= maxTurns; turn++) {

      // ── Budget guard ───────────────────────────────────────────────────
      const budgetCheck = this._budget.checkBudget(agentId);
      if (!budgetCheck.allowed) {
        console.warn(`[agent-loop] Budget blocked at turn ${turn}: ${budgetCheck.reason}`);
        stopReason = StopReason.BUDGET_BLOCKED;
        finalError = budgetCheck.reason;
        break;
      }

      // ── Per-run budget ceiling ─────────────────────────────────────────
      if (budgetLimit !== undefined && totalCost >= budgetLimit) {
        const reason = `per-run budget $${budgetLimit.toFixed(2)} reached (spent $${totalCost.toFixed(4)})`;
        console.warn(`[agent-loop] ${reason}`);
        stopReason = StopReason.BUDGET_BLOCKED;
        finalError = reason;
        break;
      }

      // ── Fire PRE_LLM hook ─────────────────────────────────────────────
      await triggerHooks(LOOP_HOOK.PRE_LLM, {
        runId, turn, agentId,
        messageCount: messages.length,
      });

      const turnStart = Date.now();
      let   llmResult = null;
      let   turnError = null;

      // ── LLM call ──────────────────────────────────────────────────────
      try {
        const chatMessages = systemPrompt
          ? [{ role: 'system', content: systemPrompt }, ...messages]
          : messages;

        llmResult = await this._modelRouter.chat(chatMessages, {
          agentId,
          model,
          skipBudgetCheck: true, // we guard manually above
          params: toolDefs.length > 0 ? { tools: toolDefs } : {},
        });
      } catch (err) {
        turnError  = err.message;
        finalError = err.message;
        stopReason = StopReason.ERROR;
        console.warn(`[agent-loop] LLM call failed at turn ${turn}: ${err.message}`);
      }

      const turnDurationMs = Date.now() - turnStart;

      // ── Accumulate cost/tokens ────────────────────────────────────────
      const turnTokens = llmResult?.tokensUsed || 0;
      const turnCost   = llmResult?.cost_usd   || 0;
      totalTokens += turnTokens;
      totalCost   += turnCost;

      // ── Fire POST_LLM hook ────────────────────────────────────────────
      await triggerHooks(LOOP_HOOK.POST_LLM, {
        runId, turn, agentId,
        tokens:      turnTokens,
        cost_usd:    turnCost,
        duration_ms: turnDurationMs,
        error:       turnError,
      });

      // ── Stop on LLM error ─────────────────────────────────────────────
      if (turnError || !llmResult) {
        turns.push({ turn, error: turnError, duration_ms: turnDurationMs });
        break;
      }

      // ── Parse response ────────────────────────────────────────────────
      const content      = llmResult.content;
      const rawStopReason = llmResult.stop_reason || StopReason.END_TURN;

      // Extract text blocks and tool_use blocks from response
      const textBlocks  = _extractTextBlocks(content);
      const toolUseBlocks = _extractToolUseBlocks(content);
      const turnText    = textBlocks.join('\n').trim();

      // Emit text tokens to caller
      if (onToken && turnText) {
        onToken(turnText, { turn, runId });
      }

      // Build assistant message for history (preserve full content array if tools present)
      const assistantMessage = {
        role: 'assistant',
        content: toolUseBlocks.length > 0
          ? _buildAssistantContent(textBlocks, toolUseBlocks)
          : (turnText || ''),
      };
      messages.push(assistantMessage);

      // ── Record turn ───────────────────────────────────────────────────
      turns.push({
        turn,
        text:        turnText,
        stop_reason: rawStopReason,
        tool_calls:  toolUseBlocks.map(b => ({ id: b.id, name: b.name, input: b.input })),
        tokens:      turnTokens,
        cost_usd:    turnCost,
        duration_ms: turnDurationMs,
      });

      logAgentAction(ActionTypes.AGENT_COMPLETED, 'agent_loop_turn', runId, {
        turn,
        stop_reason:  rawStopReason,
        tool_count:   toolUseBlocks.length,
        tokens:       turnTokens,
        cost_usd:     turnCost,
        duration_ms:  turnDurationMs,
      }, agentId);

      // ── Tool dispatch ──────────────────────────────────────────────────
      if (rawStopReason === StopReason.TOOL_USE && toolUseBlocks.length > 0) {
        const toolResults = [];

        for (const toolCall of toolUseBlocks) {
          const tcResult = await this.dispatchToolCall(toolCall, toolCtx);

          toolCalls.push({
            id:       toolCall.id,
            name:     toolCall.name,
            input:    toolCall.input,
            output:   tcResult.output,
            error:    tcResult.error || null,
            turn,
          });

          toolResults.push({
            type:        'tool_result',
            tool_use_id: toolCall.id,
            content:     tcResult.error
              ? `Error: ${tcResult.error}`
              : (tcResult.output || ''),
          });
        }

        // Push tool results back into message history as a user turn
        messages.push({ role: 'user', content: toolResults });

        // Continue the loop — model needs to process tool results
        console.log(
          `[agent-loop] Turn ${turn}: dispatched ${toolUseBlocks.length} tool(s), continuing`
        );
        continue;
      }

      // ── End of conversation ───────────────────────────────────────────
      if (rawStopReason === StopReason.END_TURN || rawStopReason === StopReason.MAX_TOKENS) {
        finalOutput = turnText;
        stopReason  = rawStopReason;
        console.log(`[agent-loop] Turn ${turn}: ${rawStopReason} — loop complete`);
        break;
      }

      // Fallback: treat unknown stop_reason as end
      finalOutput = turnText;
      stopReason  = rawStopReason || StopReason.END_TURN;
      break;
    }

    // ── Finalize ──────────────────────────────────────────────────────────
    const totalDurationMs = Date.now() - startMs;
    const finalStatus     = finalError ? 'failed' : 'completed';

    this._dbUpdateRun(runId, {
      status:       finalStatus,
      output:       finalOutput.slice(0, 10_000),
      error:        finalError,
      tokens_used:  totalTokens,
      cost_usd:     totalCost,
      duration_ms:  totalDurationMs,
      model:        llmResult?.model || model || null,
      provider:     llmResult?.provider || null,
      completed_at: Math.floor(Date.now() / 1000),
    });

    const auditAction = finalError ? ActionTypes.AGENT_FAILED : ActionTypes.AGENT_COMPLETED;
    logSystemAction(auditAction, 'agent_loop', runId, {
      agent_id:    agentId,
      turns:       turns.length,
      tool_calls:  toolCalls.length,
      stop_reason: stopReason,
      total_tokens: totalTokens,
      total_cost:  totalCost,
      duration_ms: totalDurationMs,
    });

    await triggerHooks(LOOP_HOOK.LOOP_COMPLETE, {
      runId, agentId, stopReason, turns: turns.length,
      toolCalls: toolCalls.length, totalCost,
    });

    console.log(
      `[agent-loop] Run ${runId.slice(0, 8)} ${finalStatus}` +
      ` — ${turns.length} turns, ${toolCalls.length} tool calls,` +
      ` cost=$${totalCost.toFixed(4)}, ${stopReason}`
    );

    return {
      runId,
      output:      finalOutput,
      turns,
      toolCalls,
      tokensUsed:  totalTokens,
      cost:        totalCost,
      stopReason,
      duration:    totalDurationMs,
      error:       finalError || null,
    };
  }

  // ── Tool definitions ───────────────────────────────────────────────────

  /**
   * Build Anthropic-format tool definitions for the requested tool IDs.
   * Skips any tool IDs that are not registered.
   *
   * @param {string[]} toolIds - Names of tools to include
   * @returns {object[]} Anthropic tool_use format definitions
   */
  buildToolDefinitions(toolIds) {
    return toolIds
      .map(id => {
        // Use known schema if available, otherwise build a minimal one from registry
        if (TOOL_SCHEMAS[id]) return TOOL_SCHEMAS[id];

        const tool = getTool(id);
        if (!tool) return null;

        return {
          name:         tool.name,
          description:  tool.description,
          input_schema: {
            type:       'object',
            properties: {},
          },
        };
      })
      .filter(Boolean);
  }

  // ── Tool dispatch ──────────────────────────────────────────────────────

  /**
   * Dispatch a single tool_use block to the agent-tools registry.
   * Fires PRE_TOOL and POST_TOOL hooks, logs to audit.
   *
   * @param {{ id: string, name: string, input: object }} toolCall
   * @param {import('./agent-tools.js').ToolContext} context
   * @returns {Promise<{ output: string, error?: string }>}
   */
  async dispatchToolCall(toolCall, context) {
    const { id, name, input } = toolCall;

    // ── Fire PRE_TOOL hook ───────────────────────────────────────────────
    const preHook = await triggerHooks(HookEvents.PRE_TOOL, {
      tool:    name,
      input:   JSON.stringify(input).slice(0, 300),
      agentId: context.agentId,
      runId:   context.runId,
    });

    if (!preHook.allowed) {
      const errMsg = `Blocked by hook: ${preHook.blocked_by}`;
      console.warn(`[agent-loop] Tool ${name} blocked by hook: ${preHook.blocked_by}`);
      logAgentAction(ActionTypes.SECURITY_LOCKED, 'tool', name, {
        tool_use_id: id, reason: preHook.blocked_by,
      }, context.agentId || 'system');
      return { output: '', error: errMsg };
    }

    const toolStart = Date.now();
    let   result    = { output: '', error: undefined };

    try {
      result = await executeTool(name, input, context);
    } catch (err) {
      result = { output: '', error: `Unexpected error in ${name}: ${err.message}` };
    }

    const toolDurationMs = Date.now() - toolStart;

    // ── Fire POST_TOOL hook ──────────────────────────────────────────────
    await triggerHooks(HookEvents.POST_TOOL, {
      tool:        name,
      tool_use_id: id,
      output:      (result.output || '').slice(0, 500),
      error:       result.error,
      duration_ms: toolDurationMs,
      agentId:     context.agentId,
    });

    const logAction = result.error ? ActionTypes.AGENT_FAILED : ActionTypes.AGENT_COMPLETED;
    logAgentAction(logAction, 'tool', name, {
      tool_use_id: id,
      duration_ms: toolDurationMs,
      output_len:  (result.output || '').length,
      error:       result.error || null,
    }, context.agentId || 'system');

    console.log(
      `[agent-loop] Tool ${name}` +
      (result.error ? ` ERROR: ${result.error.slice(0, 80)}` : ` OK (${toolDurationMs}ms)`)
    );

    return result;
  }

  // ── DB helpers (swallow errors — DB unavailability must not crash runs) ─

  /**
   * @param {{ id, agent_id, prompt, status, model, created_at }} r
   */
  _dbInsertRun(r) {
    if (!this._db) return;
    try {
      this._db.run(
        `INSERT OR IGNORE INTO agent_runs
           (id, agent_id, prompt, status, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [r.id, r.agent_id, r.prompt, r.status, r.model || null, r.created_at],
      );
    } catch (e) {
      console.warn(`[agent-loop] DB insert run: ${e.message}`);
    }
  }

  /**
   * Update a run record with partial fields.
   * @param {string} runId
   * @param {object} u
   */
  _dbUpdateRun(runId, u) {
    if (!this._db) return;
    try {
      const sets = [];
      const vals = [];

      if (u.status       !== undefined) { sets.push('status = ?');       vals.push(u.status); }
      if (u.output       !== undefined) { sets.push('output = ?');       vals.push(u.output); }
      if (u.error        !== undefined) { sets.push('error = ?');        vals.push(u.error); }
      if (u.tokens_used  !== undefined) { sets.push('tokens_used = ?');  vals.push(u.tokens_used); }
      if (u.cost_usd     !== undefined) { sets.push('cost_usd = ?');     vals.push(u.cost_usd); }
      if (u.duration_ms  !== undefined) { sets.push('duration_ms = ?');  vals.push(u.duration_ms); }
      if (u.model        !== undefined) { sets.push('model = ?');        vals.push(u.model); }
      if (u.provider     !== undefined) { sets.push('provider = ?');     vals.push(u.provider); }
      if (u.completed_at !== undefined) { sets.push('completed_at = ?'); vals.push(u.completed_at); }

      if (!sets.length) return;
      vals.push(runId);
      this._db.run(`UPDATE agent_runs SET ${sets.join(', ')} WHERE id = ?`, vals);
    } catch (e) {
      console.warn(`[agent-loop] DB update run: ${e.message}`);
    }
  }
}

// ── Utility: parse LLM content blocks ────────────────────────────────────

/**
 * Extract plain text strings from a model-router-client response.
 * Handles: string content, array of content blocks (Anthropic format).
 *
 * @param {string|Array} content
 * @returns {string[]}
 */
function _extractTextBlocks(content) {
  if (!content) return [];
  if (typeof content === 'string') return content ? [content.trim()] : [];
  if (!Array.isArray(content)) return [String(content).trim()];

  return content
    .filter(b => b && b.type === 'text' && b.text)
    .map(b => b.text.trim())
    .filter(Boolean);
}

/**
 * Extract tool_use blocks from a model-router-client response.
 * Returns empty array if response is plain text (no tool use).
 *
 * @param {string|Array} content
 * @returns {Array<{ id: string, name: string, input: object }>}
 */
function _extractToolUseBlocks(content) {
  if (!content || typeof content === 'string') return [];
  if (!Array.isArray(content)) return [];

  return content
    .filter(b => b && b.type === 'tool_use' && b.name)
    .map(b => ({
      id:    b.id || crypto.randomUUID(),
      name:  b.name,
      input: b.input || {},
    }));
}

/**
 * Build the assistant content array from text blocks and tool_use blocks.
 * This is the format required by the Anthropic messages API for multi-block turns.
 *
 * @param {string[]} textBlocks
 * @param {Array<{ id, name, input }>} toolUseBlocks
 * @returns {Array}
 */
function _buildAssistantContent(textBlocks, toolUseBlocks) {
  const blocks = [];

  for (const text of textBlocks) {
    if (text) blocks.push({ type: 'text', text });
  }

  for (const tu of toolUseBlocks) {
    blocks.push({ type: 'tool_use', id: tu.id, name: tu.name, input: tu.input });
  }

  return blocks;
}

// ── Convenience wrapper ───────────────────────────────────────────────────

/**
 * Run an agentic loop using the default Carbon Core module singletons.
 * Suitable for calling directly from api-server-v4.js route handlers.
 *
 * @param {object|null} db   - DB adapter (may be null in tests)
 * @param {object}      opts - Same opts as AgentLoop.run()
 * @returns {Promise<AgentLoopResult>}
 */
async function agentRun(db, opts) {
  const modelRouter = require('../model-router-client.js');
  const budget      = require('../budget-v2.js');
  const hooks       = require('../hooks-engine.js');
  const audit       = require('../audit-v2.js');
  const loop        = new AgentLoop(db, modelRouter, budget, hooks, audit);
  return loop.run(opts);
}

/**
 * Retrieve a single agent run record from the DB.
 *
 * @param {object} db
 * @param {string} runId
 * @returns {object|null}
 */
function getAgentRun(db, runId) {
  if (!db) return null;
  try {
    return db.get('SELECT * FROM agent_runs WHERE id = ?', [runId]);
  } catch {
    return null;
  }
}

/**
 * List recent agent runs.
 *
 * @param {object} db
 * @param {{ limit?: number, agentId?: string }} [opts]
 * @returns {object[]}
 */
function listAgentRuns(db, opts = {}) {
  if (!db) return [];
  const { limit = 20, agentId } = opts;
  try {
    if (agentId) {
      return db.all(
        'SELECT * FROM agent_runs WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?',
        [agentId, limit],
      );
    }
    return db.all('SELECT * FROM agent_runs ORDER BY created_at DESC LIMIT ?', [limit]);
  } catch {
    return [];
  }
}


module.exports = {
  // Main class
  AgentLoop,

  // Convenience wrappers
  agentRun,
  getAgentRun,
  listAgentRuns,

  // Constants
  StopReason,
  LOOP_HOOK,
  TOOL_SCHEMAS,
};
