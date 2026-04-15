/**
 * Hooks Engine — Carbon Core v2
 * Inspired by claude-code-main/plugins/hookify
 *
 * Event-driven hook system for intercepting agent behaviors.
 * Hooks can warn, block, transform, log, or notify on any event.
 */

import crypto from 'crypto';
import { logSystemAction, ActionTypes } from './audit-v2.js';

// ── Hook Registry ───────────────────────────────────────────────────

const hooks = new Map(); // hookId → Hook
const hooksByEvent = new Map(); // eventType → Set<hookId>

// ── Event Types ─────────────────────────────────────────────────────

export const HookEvents = {
  PRE_MESSAGE:    'pre_message',
  POST_MESSAGE:   'post_message',
  PRE_TOOL:       'pre_tool',
  POST_TOOL:      'post_tool',
  ON_ERROR:       'on_error',
  ON_COMPLETION:  'on_completion',
  BUDGET_WARNING: 'budget_warning',
  BUDGET_EXCEEDED:'budget_exceeded',
  AGENT_START:    'agent_start',
  AGENT_END:      'agent_end',
};

// ── Hook Actions ────────────────────────────────────────────────────

export const HookActions = {
  WARN:      'warn',      // Log a warning, allow to proceed
  BLOCK:     'block',     // Stop execution with a message
  TRANSFORM: 'transform', // Modify the input/output
  LOG:       'log',       // Just log, no side effects
  NOTIFY:    'notify',    // Send a notification
};

// ── Registration ────────────────────────────────────────────────────

/**
 * Register a new hook.
 *
 * @param {string} eventType - One of HookEvents
 * @param {RegExp|string|null} pattern - Regex or string to match against context (null = always)
 * @param {string} action - One of HookActions
 * @param {object} config
 * @param {string} config.message - Message to show when triggered
 * @param {string} config.name - Human-readable hook name
 * @param {boolean} config.enabled - Whether hook is active (default true)
 * @param {Function} config.handler - Custom handler function(context) → {allow, message, transform}
 */
export function registerHook(eventType, pattern, action, config = {}) {
  const hookId = crypto.randomUUID();

  const hook = {
    id: hookId,
    event: eventType,
    pattern: pattern ? (pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i')) : null,
    action,
    name: config.name || `hook_${hookId.slice(0, 8)}`,
    message: config.message || '',
    enabled: config.enabled !== false,
    handler: config.handler || null,
    triggered_count: 0,
    created_at: Date.now(),
  };

  hooks.set(hookId, hook);

  if (!hooksByEvent.has(eventType)) hooksByEvent.set(eventType, new Set());
  hooksByEvent.get(eventType).add(hookId);

  logSystemAction(ActionTypes.SYSTEM_STARTUP, 'hook', hookId, {
    event: eventType, action, name: hook.name,
  });

  console.log(`[hooks] Registered: ${hook.name} (${eventType} → ${action})`);
  return hookId;
}

export function removeHook(hookId) {
  const hook = hooks.get(hookId);
  if (!hook) return false;
  hooks.delete(hookId);
  hooksByEvent.get(hook.event)?.delete(hookId);
  console.log(`[hooks] Removed: ${hook.name}`);
  return true;
}

export function enableHook(hookId) {
  const hook = hooks.get(hookId);
  if (hook) hook.enabled = true;
}

export function disableHook(hookId) {
  const hook = hooks.get(hookId);
  if (hook) hook.enabled = false;
}

export function listHooks(eventType) {
  if (eventType) {
    return [...(hooksByEvent.get(eventType) || [])].map(id => hooks.get(id)).filter(Boolean);
  }
  return [...hooks.values()];
}

// ── Trigger ─────────────────────────────────────────────────────────

/**
 * Trigger all hooks for an event.
 * Returns { allowed, blocked_by, warnings, transforms }
 */
export async function triggerHooks(eventType, context = {}) {
  const eventHookIds = hooksByEvent.get(eventType) || new Set();
  const contextStr = JSON.stringify(context);

  const result = {
    allowed: true,
    blocked_by: null,
    warnings: [],
    transforms: [],
    triggered: [],
  };

  for (const hookId of eventHookIds) {
    const hook = hooks.get(hookId);
    if (!hook || !hook.enabled) continue;

    // Pattern matching
    if (hook.pattern && !hook.pattern.test(contextStr)) continue;

    hook.triggered_count++;
    result.triggered.push(hook.name);

    // Custom handler
    if (hook.handler) {
      try {
        const handlerResult = await hook.handler(context);
        if (handlerResult?.allow === false) {
          result.allowed = false;
          result.blocked_by = hook.name;
          return result; // Stop processing
        }
        if (handlerResult?.transform) result.transforms.push(handlerResult.transform);
        if (handlerResult?.warning) result.warnings.push(handlerResult.warning);
      } catch (e) {
        console.warn(`[hooks] Handler error in ${hook.name}: ${e.message}`);
      }
      continue;
    }

    // Built-in actions
    switch (hook.action) {
      case HookActions.BLOCK:
        result.allowed = false;
        result.blocked_by = hook.name;
        result.warnings.push(`BLOCKED: ${hook.message}`);
        logSystemAction(ActionTypes.SECURITY_LOCKED, 'hook', hookId, { event: eventType, context: contextStr.slice(0, 200) });
        return result;

      case HookActions.WARN:
        result.warnings.push(`WARNING (${hook.name}): ${hook.message}`);
        if (hook.message) console.warn(`[hooks] ${hook.name}: ${hook.message}`);
        break;

      case HookActions.LOG:
        console.log(`[hooks] ${hook.name} triggered on ${eventType}`);
        logSystemAction(ActionTypes.SYSTEM_HEALTH_CHECK, 'hook', hookId, { event: eventType });
        break;

      case HookActions.NOTIFY:
        result.warnings.push(hook.message);
        break;
    }
  }

  return result;
}

// ── Load from Config ────────────────────────────────────────────────

/**
 * Load hooks from a JSON config file.
 * Format: [{ event, pattern, action, name, message }]
 */
export async function loadHooksFromConfig(configPath) {
  const { readFileSync, existsSync } = await import('fs');
  if (!existsSync(configPath)) return 0;

  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  let loaded = 0;

  for (const hookDef of config) {
    try {
      registerHook(hookDef.event, hookDef.pattern, hookDef.action, hookDef);
      loaded++;
    } catch (e) {
      console.warn(`[hooks] Failed to load hook ${hookDef.name}: ${e.message}`);
    }
  }

  console.log(`[hooks] Loaded ${loaded} hooks from ${configPath}`);
  return loaded;
}

// ── Built-in Hooks ──────────────────────────────────────────────────

/**
 * Register default Carbon Core hooks.
 */
export function registerDefaultHooks() {
  // Block dangerous shell commands
  registerHook(HookEvents.PRE_TOOL, /rm\s+-rf\s+\/|rmdir\s+\/|mkfs\.|dd\s+if=|:(){ :|:& };:/, HookActions.BLOCK, {
    name: 'block-dangerous-commands',
    message: 'Dangerous system command blocked by Carbon Core safety policy.',
  });

  // Warn on large file writes
  registerHook(HookEvents.PRE_TOOL, null, HookActions.WARN, {
    name: 'warn-large-writes',
    message: 'Large file write detected — verify this is intentional.',
    handler: (ctx) => {
      if (ctx.tool === 'write' && ctx.content?.length > 100_000) {
        return { warning: `Large write: ${Math.round(ctx.content.length / 1024)}KB` };
      }
      return { allow: true };
    },
  });

  // Log all agent completions
  registerHook(HookEvents.ON_COMPLETION, null, HookActions.LOG, {
    name: 'log-completions',
    message: 'Agent run completed',
  });

  console.log('[hooks] Default hooks registered');
}
