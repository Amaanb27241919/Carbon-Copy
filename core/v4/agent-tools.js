'use strict';

/**
 * Agent Tool Registry — Carbon Core v4
 *
 * Unified tool execution layer ported from the claw-cli tool architecture.
 * Wraps BashTool, FileEditTool, and AgentTool patterns in a clean Node.js API
 * that integrates with the Carbon Core hooks engine and permission system.
 *
 * Architecture mirrors claw-cli Tool.ts contract:
 *   tool.call(input, context) → { output, error? }
 *   tool.checkPermissions(input, context) → { allowed, reason }
 *   tool.isReadOnly() → bool
 *   tool.isDestructive() → bool
 *
 * All tool execution fires HookEvents.PRE_TOOL and POST_TOOL through hooks-engine.
 */

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { triggerHooks, HookEvents } = require('../hooks-engine.js');
const { logAgentAction, logSystemAction, ActionTypes } = require('../audit-v2.js');

// ── Permission Modes (from claw-cli PermissionMode) ──────────────────

const PermissionMode = Object.freeze({
  DEFAULT:             'default',           // Ask for each destructive op
  ACCEPT_EDITS:        'acceptEdits',       // Auto-allow file edits
  BYPASS_PERMISSIONS:  'bypassPermissions', // Auto-allow everything (CAUTION)
  PLAN:                'plan',              // Read-only: no writes or execs
  DONT_ASK:            'dontAsk',           // Auto-deny if pattern not in allowlist
});

// ── Permission Result helpers ─────────────────────────────────────────

/**
 * @param {string} [reason]
 * @returns {{ allowed: true, reason?: string }}
 */
function allow(reason) {
  return { allowed: true, reason };
}

/**
 * @param {string} reason
 * @returns {{ allowed: false, reason: string }}
 */
function deny(reason) {
  return { allowed: false, reason };
}

// ── Base Tool ──────────────────────────────────────────────────────────

/**
 * Base class for all Carbon Core v4 tools.
 * Mirrors the claw-cli Tool<Input, Output> contract.
 */
class BaseTool {
  /** @returns {string} Tool name */
  get name() { throw new Error('Tool must implement name getter'); }

  /** @returns {string} Human-readable description */
  get description() { throw new Error('Tool must implement description getter'); }

  /** @returns {boolean} True if the tool never writes or executes */
  isReadOnly() { return false; }

  /** @returns {boolean} True if the tool can cause irreversible changes */
  isDestructive() { return false; }

  /** @returns {boolean} True if multiple calls can run concurrently */
  isConcurrencySafe() { return true; }

  /**
   * Check whether this tool call is permitted.
   * @param {object} input - Tool input params
   * @param {ToolContext} ctx - Execution context
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkPermissions(input, ctx) {
    const mode = ctx?.permissionMode || PermissionMode.DEFAULT;
    if (mode === PermissionMode.BYPASS_PERMISSIONS) return allow('bypassPermissions mode');
    if (mode === PermissionMode.PLAN && !this.isReadOnly()) {
      return deny('plan mode only allows read-only operations');
    }
    return allow();
  }

  /**
   * Execute the tool.
   * @param {object} input - Tool-specific input
   * @param {ToolContext} ctx - Execution context
   * @returns {Promise<{ output: string, error?: string }>}
   */
  async call(input, ctx) { // eslint-disable-line no-unused-vars
    throw new Error('Tool must implement call()');
  }
}

// ── Tool Context ───────────────────────────────────────────────────────

/**
 * @typedef {object} ToolContext
 * @property {string} [permissionMode] - One of PermissionMode values
 * @property {string} [workDir] - Working directory for execution
 * @property {string} [agentId] - Agent ID for logging
 * @property {string[]} [allowedPatterns] - Shell patterns this agent may run
 * @property {number} [timeoutMs] - Max execution time in ms
 * @property {boolean} [dryRun] - If true, validate but don't execute
 */

// ── BashTool ───────────────────────────────────────────────────────────

/** Shell patterns that are always blocked regardless of permission mode */
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,          // rm -rf /
  /rmdir\s+\//,             // rmdir /
  /mkfs\./,                 // format filesystem
  /dd\s+if=/,               // disk dump
  /:\(\)\s*\{.*:\|:.*\}/,   // fork bomb
  />\s*\/dev\/sda/,         // write to raw disk
  /shutdown\s|reboot\s/,    // system shutdown/reboot
];

/** Shell patterns considered read-only (search, inspect, list) */
const READ_ONLY_PATTERNS = [
  /^(cat|head|tail|less|more|grep|rg|find|ls|dir|stat|file|wc|diff|echo|pwd|env|which|type|uname)\b/,
  /^git\s+(log|status|diff|show|blame|branch|remote|tag|rev-parse)\b/,
];

class BashToolImpl extends BaseTool {
  get name() { return 'bash'; }
  get description() { return 'Run a shell command in the working directory'; }
  isDestructive() { return true; }
  isConcurrencySafe() { return false; }

  isReadOnly() { return false; } // Bash is never assumed read-only

  /**
   * Returns true if the command matches read-only shell patterns.
   * Used to decide whether to ask for permission in default mode.
   */
  _isSearchOrRead(command) {
    const trimmed = command.trim();
    return READ_ONLY_PATTERNS.some(re => re.test(trimmed));
  }

  checkPermissions(input, ctx) {
    const { command } = input;
    if (!command || typeof command !== 'string') return deny('command must be a non-empty string');

    // Hard block regardless of mode
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return deny(`Command matches blocked safety pattern: ${pattern}`);
      }
    }

    const mode = ctx?.permissionMode || PermissionMode.DEFAULT;

    if (mode === PermissionMode.BYPASS_PERMISSIONS) return allow('bypassPermissions mode');
    if (mode === PermissionMode.PLAN) return deny('plan mode does not allow shell execution');

    // Check agent-level allowlist patterns (e.g. ["git *", "npm test"])
    const allowed = ctx?.allowedPatterns;
    if (allowed && allowed.length > 0) {
      const match = allowed.some(pat => _matchWildcard(pat, command));
      if (match) return allow('matches agent allowlist');
    }

    // Accept-edits mode allows most operations
    if (mode === PermissionMode.ACCEPT_EDITS) return allow('acceptEdits mode');

    // Default mode: read-only ops are silently allowed
    if (this._isSearchOrRead(command)) return allow('read-only command');

    // Default mode: destructive ops require explicit allowlist
    if (mode === PermissionMode.DONT_ASK) return deny('not in agent allowlist');

    // Default mode: allow (caller may prompt user separately)
    return allow('default mode — verify before running');
  }

  async call(input, ctx) {
    const { command, timeout } = input;
    const workDir = ctx?.workDir || process.cwd();
    const timeoutMs = timeout || ctx?.timeoutMs || 120_000;

    const permResult = this.checkPermissions(input, ctx);
    if (!permResult.allowed) {
      return { output: '', error: `Permission denied: ${permResult.reason}` };
    }

    // Fire PRE_TOOL hook
    const preHook = await triggerHooks(HookEvents.PRE_TOOL, {
      tool: this.name, command, agentId: ctx?.agentId,
    });
    if (!preHook.allowed) {
      return { output: '', error: `Blocked by hook: ${preHook.blocked_by}` };
    }

    if (ctx?.dryRun) {
      return { output: `[dryRun] would execute: ${command}` };
    }

    const start = Date.now();
    let output = '';
    let error = null;

    try {
      output = await _spawnShell(command, workDir, timeoutMs);
    } catch (e) {
      error = e.message;
    }

    const duration_ms = Date.now() - start;
    logAgentAction(ActionTypes.AGENT_COMPLETED, 'bash_tool', command.slice(0, 80), {
      duration_ms, error, workDir,
    }, ctx?.agentId || 'system');

    // Fire POST_TOOL hook
    await triggerHooks(HookEvents.POST_TOOL, {
      tool: this.name, command, output: output.slice(0, 500), error, duration_ms,
    });

    return error ? { output, error } : { output };
  }
}

// ── FileEditTool ──────────────────────────────────────────────────────

/** Matches the claw-cli FileEditTool input schema */
class FileEditToolImpl extends BaseTool {
  get name() { return 'file_edit'; }
  get description() { return 'Edit a file by replacing old_string with new_string (exact match required)'; }
  isDestructive() { return true; }

  checkPermissions(input, ctx) {
    const { file_path } = input;
    if (!file_path) return deny('file_path is required');

    const mode = ctx?.permissionMode || PermissionMode.DEFAULT;
    if (mode === PermissionMode.BYPASS_PERMISSIONS) return allow('bypassPermissions mode');
    if (mode === PermissionMode.PLAN) return deny('plan mode does not allow file edits');

    // Prevent writes outside working directory unless bypass
    if (ctx?.workDir && mode !== PermissionMode.BYPASS_PERMISSIONS) {
      const absPath = path.resolve(file_path);
      const absWork = path.resolve(ctx.workDir);
      if (!absPath.startsWith(absWork)) {
        return deny(`file_path ${file_path} is outside working directory ${ctx.workDir}`);
      }
    }

    return allow();
  }

  async call(input, ctx) {
    const { file_path, old_string, new_string } = input;

    const permResult = this.checkPermissions(input, ctx);
    if (!permResult.allowed) {
      return { output: '', error: `Permission denied: ${permResult.reason}` };
    }

    if (!file_path || old_string === undefined || new_string === undefined) {
      return { output: '', error: 'file_edit requires file_path, old_string, new_string' };
    }

    // Fire PRE_TOOL hook
    const preHook = await triggerHooks(HookEvents.PRE_TOOL, {
      tool: this.name, file_path, old_string: old_string.slice(0, 100), agentId: ctx?.agentId,
    });
    if (!preHook.allowed) {
      return { output: '', error: `Blocked by hook: ${preHook.blocked_by}` };
    }

    if (ctx?.dryRun) {
      return { output: `[dryRun] would edit ${file_path}: "${old_string.slice(0, 40)}" → "${new_string.slice(0, 40)}"` };
    }

    let content;
    try {
      content = fs.readFileSync(file_path, 'utf-8');
    } catch (e) {
      return { output: '', error: `Cannot read file ${file_path}: ${e.message}` };
    }

    const occurrences = _countOccurrences(content, old_string);
    if (occurrences === 0) {
      return { output: '', error: `old_string not found in ${file_path}` };
    }
    if (occurrences > 1) {
      return { output: '', error: `old_string matches ${occurrences} locations in ${file_path} — provide more context to make it unique` };
    }

    const updated = content.replace(old_string, new_string);

    try {
      fs.writeFileSync(file_path, updated, 'utf-8');
    } catch (e) {
      return { output: '', error: `Cannot write file ${file_path}: ${e.message}` };
    }

    const summary = `Edited ${file_path}: replaced ${old_string.length} chars with ${new_string.length} chars`;

    logAgentAction(ActionTypes.AGENT_COMPLETED, 'file_edit', file_path, {
      old_len: old_string.length, new_len: new_string.length,
    }, ctx?.agentId || 'system');

    await triggerHooks(HookEvents.POST_TOOL, {
      tool: this.name, file_path, summary,
    });

    return { output: summary };
  }
}

// ── FileReadTool ──────────────────────────────────────────────────────

class FileReadToolImpl extends BaseTool {
  get name() { return 'file_read'; }
  get description() { return 'Read the contents of a file'; }
  isReadOnly() { return true; }
  isDestructive() { return false; }

  checkPermissions(input, ctx) {
    const { file_path } = input;
    if (!file_path) return deny('file_path is required');
    const mode = ctx?.permissionMode || PermissionMode.DEFAULT;
    if (mode === PermissionMode.BYPASS_PERMISSIONS) return allow();
    // Read is always allowed in any mode except explicit deny list
    return allow();
  }

  async call(input, _ctx) {
    const { file_path, offset, limit } = input;
    if (!file_path) return { output: '', error: 'file_path is required' };

    let content;
    try {
      content = fs.readFileSync(file_path, 'utf-8');
    } catch (e) {
      return { output: '', error: `Cannot read ${file_path}: ${e.message}` };
    }

    const lines = content.split('\n');
    const start = Math.max(0, (offset || 1) - 1);
    const end = limit ? start + limit : lines.length;
    const slice = lines.slice(start, end).join('\n');

    return { output: slice };
  }
}

// ── FileWriteTool ──────────────────────────────────────────────────────

class FileWriteToolImpl extends BaseTool {
  get name() { return 'file_write'; }
  get description() { return 'Write content to a file (creates or overwrites)'; }
  isDestructive() { return true; }

  checkPermissions(input, ctx) {
    const { file_path } = input;
    if (!file_path) return deny('file_path is required');
    const mode = ctx?.permissionMode || PermissionMode.DEFAULT;
    if (mode === PermissionMode.BYPASS_PERMISSIONS) return allow('bypassPermissions');
    if (mode === PermissionMode.PLAN) return deny('plan mode does not allow file writes');
    if (ctx?.workDir) {
      const absPath = path.resolve(file_path);
      const absWork = path.resolve(ctx.workDir);
      if (!absPath.startsWith(absWork) && mode !== PermissionMode.BYPASS_PERMISSIONS) {
        return deny(`file_path is outside working directory`);
      }
    }
    return allow();
  }

  async call(input, ctx) {
    const { file_path, content } = input;

    const permResult = this.checkPermissions(input, ctx);
    if (!permResult.allowed) return { output: '', error: `Permission denied: ${permResult.reason}` };

    if (!file_path || content === undefined) {
      return { output: '', error: 'file_write requires file_path and content' };
    }

    const preHook = await triggerHooks(HookEvents.PRE_TOOL, {
      tool: this.name, file_path, content_len: content.length, agentId: ctx?.agentId,
    });
    if (!preHook.allowed) return { output: '', error: `Blocked by hook: ${preHook.blocked_by}` };

    if (ctx?.dryRun) return { output: `[dryRun] would write ${content.length} chars to ${file_path}` };

    try {
      const dir = path.dirname(file_path);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file_path, content, 'utf-8');
    } catch (e) {
      return { output: '', error: `Cannot write ${file_path}: ${e.message}` };
    }

    logAgentAction(ActionTypes.AGENT_COMPLETED, 'file_write', file_path, {
      bytes: content.length,
    }, ctx?.agentId || 'system');

    await triggerHooks(HookEvents.POST_TOOL, { tool: this.name, file_path });

    return { output: `Wrote ${content.length} chars to ${file_path}` };
  }
}

// ── AgentTool ──────────────────────────────────────────────────────────

/**
 * AgentTool — spawns a sub-agent (Claude CLI subprocess) with a focused task.
 * Mirrors claw-cli AgentTool isolation: each sub-agent gets its own workDir.
 *
 * Permission modes inherited by sub-agents:
 *   bypassPermissions — sub-agent runs without asking
 *   default           — sub-agent may ask (if interactive)
 *   plan              — sub-agent is read-only
 */
class AgentToolImpl extends BaseTool {
  get name() { return 'agent'; }
  get description() { return 'Launch a focused sub-agent to complete a subtask'; }
  isDestructive() { return true; }
  isConcurrencySafe() { return true; } // Sub-agents run in isolation

  checkPermissions(input, ctx) {
    const { task } = input;
    if (!task || typeof task !== 'string' || task.trim() === '') {
      return deny('task must be a non-empty string');
    }
    const mode = ctx?.permissionMode || PermissionMode.DEFAULT;
    if (mode === PermissionMode.PLAN) return deny('plan mode does not allow spawning agents');
    return allow();
  }

  async call(input, ctx) {
    const { task, agentId, model, workDir: inputWorkDir, permissionMode } = input;

    const permResult = this.checkPermissions(input, ctx);
    if (!permResult.allowed) return { output: '', error: `Permission denied: ${permResult.reason}` };

    const spawnId = crypto.randomUUID().slice(0, 8);
    const workDir = inputWorkDir || ctx?.workDir || process.cwd();
    const spawnModel = model || 'claude-sonnet-4-6';
    const subMode = permissionMode || ctx?.permissionMode || PermissionMode.BYPASS_PERMISSIONS;

    const preHook = await triggerHooks(HookEvents.PRE_TOOL, {
      tool: this.name, task: task.slice(0, 100), agentId: agentId || ctx?.agentId, spawnId,
    });
    if (!preHook.allowed) return { output: '', error: `Blocked by hook: ${preHook.blocked_by}` };

    if (ctx?.dryRun) {
      return { output: `[dryRun] would spawn sub-agent [${spawnId}] for: ${task.slice(0, 80)}` };
    }

    const timeoutMs = input.timeout || ctx?.timeoutMs || 10 * 60 * 1000;
    const start = Date.now();

    logAgentAction(ActionTypes.AGENT_STARTED, 'agent_tool', spawnId, {
      task: task.slice(0, 100), model: spawnModel, workDir,
    }, ctx?.agentId || 'system');

    let output = '';
    let error = null;
    try {
      output = await _spawnClaudeAgent(task, { workDir, model: spawnModel, mode: subMode, timeout: timeoutMs });
    } catch (e) {
      error = e.message;
    }

    const duration_ms = Date.now() - start;

    logAgentAction(
      error ? ActionTypes.AGENT_FAILED : ActionTypes.AGENT_COMPLETED,
      'agent_tool', spawnId,
      { duration_ms, error, output_len: output.length },
      ctx?.agentId || 'system',
    );

    await triggerHooks(HookEvents.POST_TOOL, {
      tool: this.name, spawnId, duration_ms, error,
    });

    return error ? { output, error } : { output };
  }
}

// ── Tool Registry ──────────────────────────────────────────────────────

const TOOLS = new Map();

function _register(tool) {
  TOOLS.set(tool.name, tool);
}

_register(new BashToolImpl());
_register(new FileEditToolImpl());
_register(new FileReadToolImpl());
_register(new FileWriteToolImpl());
_register(new AgentToolImpl());

/**
 * Look up a registered tool by name.
 * @param {string} name
 * @returns {BaseTool|null}
 */
function getTool(name) {
  return TOOLS.get(name) || null;
}

/**
 * List all registered tool names and descriptions.
 * @returns {Array<{ name: string, description: string, readOnly: boolean, destructive: boolean }>}
 */
function listTools() {
  return [...TOOLS.values()].map(t => ({
    name: t.name,
    description: t.description,
    readOnly: t.isReadOnly(),
    destructive: t.isDestructive(),
    concurrencySafe: t.isConcurrencySafe(),
  }));
}

/**
 * Execute a tool by name with input and context.
 * Convenience wrapper that resolves the tool, fires hooks, and returns results.
 *
 * @param {string} toolName
 * @param {object} input
 * @param {ToolContext} [ctx]
 * @returns {Promise<{ output: string, error?: string }>}
 */
async function executeTool(toolName, input, ctx = {}) {
  const tool = getTool(toolName);
  if (!tool) return { output: '', error: `Unknown tool: ${toolName}` };
  return tool.call(input, ctx);
}

/**
 * Register a custom tool in the registry.
 * Accepts a plain object that matches the BaseTool interface.
 *
 * @param {{ name: string, description: string, call: Function, checkPermissions?: Function, isReadOnly?: Function, isDestructive?: Function }} toolDef
 */
function registerCustomTool(toolDef) {
  if (!toolDef.name || typeof toolDef.call !== 'function') {
    throw new Error('Custom tool must have a name and call() function');
  }

  class CustomTool extends BaseTool {
    get name() { return toolDef.name; }
    get description() { return toolDef.description || ''; }
    isReadOnly() { return toolDef.isReadOnly ? toolDef.isReadOnly() : false; }
    isDestructive() { return toolDef.isDestructive ? toolDef.isDestructive() : false; }
    checkPermissions(input, ctx) {
      if (toolDef.checkPermissions) return toolDef.checkPermissions(input, ctx);
      return allow();
    }
    call(input, ctx) { return toolDef.call(input, ctx); }
  }

  _register(new CustomTool());
  console.log(`[agent-tools] Registered custom tool: ${toolDef.name}`);
}

// ── Utility helpers ────────────────────────────────────────────────────

/**
 * Wildcard pattern matching (e.g. "git *", "npm *").
 * Used for agent allowlist checks.
 * @param {string} pattern
 * @param {string} command
 * @returns {boolean}
 */
function _matchWildcard(pattern, command) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}`, 'i').test(command.trim());
}

/**
 * Count non-overlapping occurrences of needle in haystack.
 * @param {string} haystack
 * @param {string} needle
 * @returns {number}
 */
function _countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = haystack.indexOf(needle, pos)) !== -1) {
    count++;
    pos += needle.length;
  }
  return count;
}

/**
 * Spawn a shell command and return stdout as a string.
 * @param {string} command
 * @param {string} workDir
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
function _spawnShell(command, workDir, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn('bash', ['-c', command], {
      cwd: workDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${command.slice(0, 80)}`));
    }, timeoutMs);

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        // Non-zero exit: include stderr in output, resolve (not reject) so caller sees output
        resolve(stdout.trim() + (stderr ? `\n[stderr] ${stderr.trim()}` : ''));
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Spawn a Claude CLI sub-agent for a focused task.
 * @param {string} task
 * @param {{ workDir: string, model: string, mode: string, timeout: number }} opts
 * @returns {Promise<string>}
 */
function _spawnClaudeAgent(task, opts) {
  return new Promise((resolve, reject) => {
    const args = ['--permission-mode', opts.mode, '--print', task];
    if (opts.model) args.push('--model', opts.model);

    const proc = spawn('claude', args, {
      cwd: opts.workDir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error(`Sub-agent timed out after ${opts.timeout}ms`));
    }, opts.timeout);

    proc.on('close', code => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Sub-agent exited ${code}: ${stderr.slice(0, 300)}`));
      }
    });

    proc.on('error', err => {
      clearTimeout(timer);
      reject(err);
    });
  });
}


module.exports = {
  // Tool execution
  getTool,
  listTools,
  executeTool,
  registerCustomTool,

  // Permission system
  PermissionMode,
  allow,
  deny,

  // Tool classes (for extension)
  BaseTool,
  BashToolImpl,
  FileEditToolImpl,
  FileReadToolImpl,
  FileWriteToolImpl,
  AgentToolImpl,
};
