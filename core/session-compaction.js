/**
 * Session Compaction — Carbon Core
 * Ported from RawClaw v2 session-compaction.ts
 *
 * Auto-rotates sessions at: 200 runs | 2M input tokens | 72 hours
 * Prevents context rot for long-running agents.
 */

import { logSystemAction, ActionTypes } from './audit-v2.js';

const DEFAULT_CONFIG = {
  maxSessionRuns: 200,
  maxRawInputTokens: 2_000_000,
  maxSessionAgeHours: 72,
};

// Per-agent session state
const sessionStates = new Map();

// DB registration
let _clearSession = null;

export function registerCompactionDb({ clearSession }) {
  _clearSession = clearSession;
}

// ── Session State Management ────────────────────────────────────────

export function getOrCreateSessionState(agentId) {
  if (!sessionStates.has(agentId)) {
    sessionStates.set(agentId, {
      agentId,
      sessionId: null,
      runCount: 0,
      totalInputTokens: 0,
      sessionStartedAt: Math.floor(Date.now() / 1000),
      lastRunAt: Math.floor(Date.now() / 1000),
    });
  }
  return sessionStates.get(agentId);
}

export function updateSessionState(agentId, sessionId, inputTokens) {
  const state = getOrCreateSessionState(agentId);
  state.sessionId = sessionId || state.sessionId;
  state.runCount++;
  state.totalInputTokens += inputTokens || 0;
  state.lastRunAt = Math.floor(Date.now() / 1000);
  return state;
}

// ── Compaction Check ────────────────────────────────────────────────

/**
 * Determine if a session should be rotated.
 * Call this before each agent run.
 */
export function shouldRotateSession(agentId, config = DEFAULT_CONFIG) {
  const state = getOrCreateSessionState(agentId);
  if (!state.sessionId) return { shouldRotate: false, reason: null, currentState: state };

  const ageHours = (Math.floor(Date.now() / 1000) - state.sessionStartedAt) / 3600;

  if (state.runCount >= config.maxSessionRuns) {
    return { shouldRotate: true, reason: `Max runs exceeded (${state.runCount}/${config.maxSessionRuns})`, currentState: state };
  }

  if (state.totalInputTokens >= config.maxRawInputTokens) {
    return { shouldRotate: true, reason: `Max tokens exceeded (${state.totalInputTokens}/${config.maxRawInputTokens})`, currentState: state };
  }

  if (ageHours >= config.maxSessionAgeHours) {
    return { shouldRotate: true, reason: `Session age exceeded (${ageHours.toFixed(1)}h/${config.maxSessionAgeHours}h)`, currentState: state };
  }

  return { shouldRotate: false, reason: null, currentState: state };
}

/**
 * Rotate a session — clears the session ID and resets counters.
 */
export function rotateSession(agentId) {
  const state = getOrCreateSessionState(agentId);
  const oldSessionId = state.sessionId;

  state.sessionId = null;
  state.runCount = 0;
  state.totalInputTokens = 0;
  state.sessionStartedAt = Math.floor(Date.now() / 1000);

  if (_clearSession && oldSessionId) {
    try { _clearSession(agentId); } catch { /* db not ready */ }
  }

  logSystemAction(ActionTypes.SESSION_ROTATED, 'session', agentId, {
    old_session_id: oldSessionId,
    run_count_at_rotation: state.runCount,
  });

  console.log(`[compaction] Session rotated for agent ${agentId}`);
  return oldSessionId;
}

// ── Stats ───────────────────────────────────────────────────────────

export function getCompactionStats(agentId) {
  const state = getOrCreateSessionState(agentId);
  const config = DEFAULT_CONFIG;
  const ageHours = (Math.floor(Date.now() / 1000) - state.sessionStartedAt) / 3600;

  return {
    agentId,
    sessionId: state.sessionId,
    runCount: state.runCount,
    runUtilization: state.runCount / config.maxSessionRuns,
    totalInputTokens: state.totalInputTokens,
    tokenUtilization: state.totalInputTokens / config.maxRawInputTokens,
    ageHours: parseFloat(ageHours.toFixed(2)),
    ageUtilization: ageHours / config.maxSessionAgeHours,
    maxRunCount: config.maxSessionRuns,
    maxTokens: config.maxRawInputTokens,
    maxAgeHours: config.maxSessionAgeHours,
  };
}

export function getAllCompactionStats() {
  return [...sessionStates.keys()].map(id => getCompactionStats(id));
}
