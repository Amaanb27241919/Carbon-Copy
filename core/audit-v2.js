// Activity Audit Log v2 — Carbon Core
// Immutable audit trail. Every significant action logged.
// Ring buffer (1000 entries). DB write via registerAuditDb().

'use strict';

const crypto = require('crypto');

// ── Ring Buffer ─────────────────────────────────────────────────────

const MAX_BUFFER_SIZE = 1000;

/** @type {Array<Object>} */
const activityBuffer = [];

// ── DB Registration (avoids circular imports) ──────────────────────

/** @type {Function|null} */
let _writeLog = null;

/**
 * Register database write function. Called from index-v2.js after DB init.
 * @param {{ writeLog: Function }} fns
 */
function registerAuditDb({ writeLog }) {
  _writeLog = writeLog;
}

// ── Core Logging ─────────────────────────────────────────────────────

/**
 * Log an activity event to the audit trail.
 *
 * @param {'user'|'agent'|'system'} actorType
 * @param {string} actorId
 * @param {string} actionType
 * @param {string} entityType
 * @param {string} entityId
 * @param {Object} [detail={}]
 */
function logActivity(actorType, actorId, actionType, entityType, entityId, detail = {}) {
  const entry = {
    id: crypto.randomUUID(),
    actor_type: actorType,
    actor_id: actorId,
    action_type: actionType,
    entity_type: entityType,
    entity_id: entityId,
    detail,
    created_at: Math.floor(Date.now() / 1000),
  };

  // Ring buffer — drop oldest when full
  activityBuffer.push(entry);
  if (activityBuffer.length > MAX_BUFFER_SIZE) {
    activityBuffer.shift();
  }

  // Persist to SQLite via registered function
  if (_writeLog) {
    try {
      _writeLog(entry);
    } catch {
      // DB not ready — entry is still in memory buffer
    }
  }
}

// ── Convenience Wrappers ────────────────────────────────────────────

/**
 * Log a user-initiated action.
 * @param {string} actionType
 * @param {string} entityType
 * @param {string} entityId
 * @param {Object} [detail={}]
 */
function logUserAction(actionType, entityType, entityId, detail = {}) {
  logActivity('user', 'owner', actionType, entityType, entityId, detail);
}

/**
 * Log an agent-initiated action.
 * @param {string} actionType
 * @param {string} entityType
 * @param {string} entityId
 * @param {Object} [detail={}]
 * @param {string} [agentId='system']
 */
function logAgentAction(actionType, entityType, entityId, detail = {}, agentId = 'system') {
  logActivity('agent', agentId, actionType, entityType, entityId, detail);
}

/**
 * Log a system-initiated action.
 * @param {string} actionType
 * @param {string} entityType
 * @param {string} entityId
 * @param {Object} [detail={}]
 */
function logSystemAction(actionType, entityType, entityId, detail = {}) {
  logActivity('system', 'carbon-core', actionType, entityType, entityId, detail);
}

// ── Query Functions ─────────────────────────────────────────────────

/**
 * Get recent activity entries, newest first.
 * @param {number} [limit=50]
 * @param {number} [offset=0]
 * @returns {Array<Object>}
 */
function getRecentActivity(limit = 50, offset = 0) {
  return [...activityBuffer].reverse().slice(offset, offset + limit);
}

/**
 * Get activity entries filtered by entity type, newest first.
 * @param {string} entityType
 * @param {number} [limit=50]
 * @returns {Array<Object>}
 */
function getActivityByEntity(entityType, limit = 50) {
  return [...activityBuffer]
    .reverse()
    .filter((e) => e.entity_type === entityType)
    .slice(0, limit);
}

/**
 * Get activity entries filtered by actor ID, newest first.
 * @param {string} actorId
 * @param {number} [limit=50]
 * @returns {Array<Object>}
 */
function getActivityByActor(actorId, limit = 50) {
  return [...activityBuffer]
    .reverse()
    .filter((e) => e.actor_id === actorId)
    .slice(0, limit);
}

/**
 * Get total number of entries in the in-memory buffer.
 * @returns {number}
 */
function getActivityCount() {
  return activityBuffer.length;
}

// ── Standard Action Types ───────────────────────────────────────────

const ActionTypes = Object.freeze({
  // Message events
  MESSAGE_RECEIVED:        'message.received',
  MESSAGE_SENT:            'message.sent',

  // Agent lifecycle
  AGENT_STARTED:           'agent.started',
  AGENT_COMPLETED:         'agent.completed',
  AGENT_FAILED:            'agent.failed',
  AGENT_PAUSED:            'agent.paused',
  AGENT_RESUMED:           'agent.resumed',
  AGENT_CREATED:           'agent.created',
  AGENT_DELETED:           'agent.deleted',

  // Task events
  TASK_CREATED:            'task.created',
  TASK_COMPLETED:          'task.completed',
  TASK_FAILED:             'task.failed',
  TASK_CANCELLED:          'task.cancelled',

  // Memory events
  MEMORY_CREATED:          'memory.created',
  MEMORY_PINNED:           'memory.pinned',

  // Budget events
  BUDGET_WARNING:          'budget.warning',
  BUDGET_EXCEEDED:         'budget.exceeded',
  BUDGET_POLICY_CREATED:   'budget.policy_created',
  BUDGET_POLICY_UPDATED:   'budget.policy_updated',

  // Security events
  SECURITY_LOCKED:         'security.locked',
  SECURITY_KILL:           'security.kill',

  // Delegation events
  DELEGATION_SENT:         'delegation.sent',
  DELEGATION_COMPLETED:    'delegation.completed',

  // Session events
  SESSION_STARTED:         'session.started',
  SESSION_COMPACTED:       'session.compacted',

  // System events
  SYSTEM_STARTUP:          'system.startup',
  SYSTEM_SHUTDOWN:         'system.shutdown',
  SYSTEM_HEALTH_CHECK:     'system.health_check',
  SYSTEM_ERROR:            'system.error',

  // Orchestration events
  ORCHESTRATION_STARTED:   'orchestration.started',
  ORCHESTRATION_COMPLETED: 'orchestration.completed',
  ORCHESTRATION_FAILED:    'orchestration.failed',

  // Proposal / Knowledge events
  PROPOSAL_GENERATED:      'proposal.generated',
  KNOWLEDGE_QUERIED:       'knowledge.queried',
});

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  logActivity,
  logUserAction,
  logAgentAction,
  logSystemAction,
  getRecentActivity,
  getActivityByEntity,
  getActivityByActor,
  getActivityCount,
  registerAuditDb,
  ActionTypes,
};
