/**
 * Claude Usage Tracker v2 — Carbon Core
 * Scans ~/.claude/projects/**\/*.jsonl for session token usage.
 * SQLite storage (via registered DB functions). Estimates cost from token counts.
 * Ported from /Users/amaankhan/Documents/claude-usage/scanner.py
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// ── Model Pricing (USD per 1M tokens) ────────────────────────────────

const MODEL_PRICING = {
  'claude-opus-4-6':   { input: 15.0,  output: 75.0,  cache: 1.875 },
  'claude-sonnet-4-6': { input: 3.0,   output: 15.0,  cache: 0.375 },
  'claude-haiku-4-5':  { input: 0.80,  output: 4.0,   cache: 0.08  },
  'default':           { input: 3.0,   output: 15.0,  cache: 0.375 },
};

// ── In-Memory Fallback Store ──────────────────────────────────────────

/** @type {Map<string, object>} sessionId → session aggregate */
const _sessions = new Map();

/** @type {Map<string, { mtime: number, lineCount: number }>} filePath → process record */
const _processedFiles = new Map();

// ── DB Registration ───────────────────────────────────────────────────

let _db = null;

/**
 * Register DB callback functions. When registered, persistence goes to the DB.
 * @param {{ saveSession: Function, saveTurn: Function, getSession: Function, markProcessed: Function, wasProcessed: Function }} fns
 */
function registerUsageDb(fns) {
  _db = fns;
}

// ── Cost Estimation ───────────────────────────────────────────────────

/**
 * @param {number} inputTokens
 * @param {number} outputTokens
 * @param {number} [cacheTokens]
 * @param {string} [model]
 * @returns {number} cost in USD
 */
function estimateCost(inputTokens, outputTokens, cacheTokens, model) {
  const safeCache = cacheTokens || 0;
  const safeModel = model || 'claude-sonnet-4-6';
  const pricing = MODEL_PRICING[safeModel] || MODEL_PRICING['default'];
  return (
    (inputTokens  / 1_000_000) * pricing.input  +
    (outputTokens / 1_000_000) * pricing.output +
    (safeCache    / 1_000_000) * pricing.cache
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function _projectNameFromCwd(cwd) {
  if (!cwd) return 'unknown';
  const parts = cwd.replace(/\\/g, '/').replace(/\/$/, '').split('/').filter(Boolean);
  if (parts.length >= 2) return parts.slice(-2).join('/');
  return parts[parts.length - 1] || 'unknown';
}

function _findJsonlFiles(dir) {
  const results = [];

  function walk(current) {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  }

  walk(dir);
  return results;
}

function _parseJsonlFile(filepath) {
  const sessionMeta = {};
  const turns = [];

  let content;
  try {
    content = fs.readFileSync(filepath, 'utf8');
  } catch (err) {
    return { sessionMeta, turns, error: err.message };
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const rtype = record.type;
    if (rtype !== 'assistant' && rtype !== 'user') continue;

    const sessionId = record.sessionId;
    if (!sessionId) continue;

    const timestamp = record.timestamp || '';
    const cwd = record.cwd || '';
    const gitBranch = record.gitBranch || '';

    // Upsert session metadata
    if (!sessionMeta[sessionId]) {
      sessionMeta[sessionId] = {
        sessionId,
        projectName: _projectNameFromCwd(cwd),
        firstTimestamp: timestamp,
        lastTimestamp: timestamp,
        gitBranch,
        model: null,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCacheRead: 0,
        totalCacheCreation: 0,
        turnCount: 0,
        costUsd: 0,
      };
    } else {
      const meta = sessionMeta[sessionId];
      if (timestamp && (!meta.firstTimestamp || timestamp < meta.firstTimestamp)) {
        meta.firstTimestamp = timestamp;
      }
      if (timestamp && (!meta.lastTimestamp || timestamp > meta.lastTimestamp)) {
        meta.lastTimestamp = timestamp;
      }
      if (gitBranch && !meta.gitBranch) meta.gitBranch = gitBranch;
    }

    // Only assistant records carry token usage
    if (rtype !== 'assistant') continue;

    const msg = record.message || {};
    const usage = msg.usage || {};
    const model = msg.model || '';
    const inputTokens  = usage.input_tokens || 0;
    const outputTokens = usage.output_tokens || 0;
    const cacheRead    = usage.cache_read_input_tokens || 0;
    const cacheCreate  = usage.cache_creation_input_tokens || 0;

    if (inputTokens + outputTokens + cacheRead + cacheCreate === 0) continue;

    if (model) sessionMeta[sessionId].model = model;

    const turnCost = estimateCost(inputTokens, outputTokens, cacheRead + cacheCreate, model);

    sessionMeta[sessionId].totalInputTokens  += inputTokens;
    sessionMeta[sessionId].totalOutputTokens += outputTokens;
    sessionMeta[sessionId].totalCacheRead    += cacheRead;
    sessionMeta[sessionId].totalCacheCreation += cacheCreate;
    sessionMeta[sessionId].turnCount         += 1;
    sessionMeta[sessionId].costUsd           += turnCost;

    turns.push({
      id: crypto.randomUUID(),
      sessionId,
      timestamp,
      model,
      inputTokens,
      outputTokens,
      cacheReadTokens: cacheRead,
      cacheCreationTokens: cacheCreate,
      cwd,
      costUsd: turnCost,
    });
  }

  return { sessionMeta, turns, error: null };
}

function _wasProcessed(filepath, mtime) {
  if (_db && _db.wasProcessed) {
    try { return _db.wasProcessed(filepath, mtime); } catch { /* ignore */ }
  }
  const rec = _processedFiles.get(filepath);
  return !!(rec && Math.abs(rec.mtime - mtime) < 0.01);
}

function _markProcessed(filepath, mtime, lineCount) {
  if (_db && _db.markProcessed) {
    try { _db.markProcessed(filepath, mtime, lineCount); } catch { /* ignore */ }
  }
  _processedFiles.set(filepath, { mtime, lineCount });
}

function _saveSession(session) {
  if (_db && _db.saveSession) {
    try { _db.saveSession(session); } catch { /* ignore */ }
  }
  const existing = _sessions.get(session.sessionId) || {};
  _sessions.set(session.sessionId, { ...existing, ...session });
}

function _saveTurn(turn) {
  if (_db && _db.saveTurn) {
    try { _db.saveTurn(turn); } catch { /* ignore */ }
  }
  // Turns are aggregated into sessions in memory; no separate in-memory turn store
}

// ── Public: scanUsage ─────────────────────────────────────────────────

/**
 * Scan ~/.claude/projects/**\/*.jsonl and ingest token usage.
 * @param {{ projectsDir?: string, verbose?: boolean }} [options]
 * @returns {Promise<{ sessions_found: number, turns_found: number, total_cost_usd: number, errors: string[] }>}
 */
async function scanUsage(options) {
  const opts = options || {};
  const projectsDir = opts.projectsDir || path.join(os.homedir(), '.claude', 'projects');
  const verbose = opts.verbose || false;

  const summary = { sessions_found: 0, turns_found: 0, total_cost_usd: 0, errors: [] };

  let files;
  try {
    files = _findJsonlFiles(projectsDir);
  } catch (err) {
    summary.errors.push('Cannot read projects dir: ' + err.message);
    return summary;
  }

  for (const filepath of files) {
    let mtime;
    try {
      mtime = fs.statSync(filepath).mtimeMs / 1000;
    } catch {
      continue;
    }

    if (_wasProcessed(filepath, mtime)) continue;

    if (verbose) console.log('[usage-tracker] scanning', filepath);

    const { sessionMeta, turns, error } = _parseJsonlFile(filepath);
    if (error) summary.errors.push(filepath + ': ' + error);

    for (const session of Object.values(sessionMeta)) {
      _saveSession(session);
      summary.sessions_found++;
      summary.total_cost_usd += session.costUsd;
    }

    for (const turn of turns) {
      _saveTurn(turn);
      summary.turns_found++;
    }

    const lineCount = turns.length;
    _markProcessed(filepath, mtime, lineCount);
  }

  return summary;
}

// ── Public: Query Functions ───────────────────────────────────────────

/**
 * @param {number} [limit]
 * @returns {object[]}
 */
function getSessionSummary(limit) {
  const safeLimit = limit === undefined ? 50 : limit;
  const sessions = [..._sessions.values()];
  sessions.sort((a, b) => (b.lastTimestamp || '').localeCompare(a.lastTimestamp || ''));
  return sessions.slice(0, safeLimit);
}

/**
 * @returns {Object.<string, { sessions: number, turns: number, input_tokens: number, output_tokens: number, cost_usd: number }>}
 */
function getModelBreakdown() {
  const breakdown = {};

  for (const session of _sessions.values()) {
    const model = session.model || 'unknown';
    if (!breakdown[model]) {
      breakdown[model] = { sessions: 0, turns: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 };
    }
    const entry = breakdown[model];
    entry.sessions      += 1;
    entry.turns         += session.turnCount || 0;
    entry.input_tokens  += session.totalInputTokens || 0;
    entry.output_tokens += session.totalOutputTokens || 0;
    entry.cost_usd      += session.costUsd || 0;
  }

  return breakdown;
}

/**
 * @returns {{ total_sessions: number, total_turns: number, total_input_tokens: number, total_output_tokens: number, total_cost_usd: number, models_used: string[] }}
 */
function getTotalUsageStats() {
  let totalSessions = 0;
  let totalTurns    = 0;
  let totalInput    = 0;
  let totalOutput   = 0;
  let totalCost     = 0;
  const modelsUsed  = new Set();

  for (const session of _sessions.values()) {
    totalSessions += 1;
    totalTurns    += session.turnCount || 0;
    totalInput    += session.totalInputTokens || 0;
    totalOutput   += session.totalOutputTokens || 0;
    totalCost     += session.costUsd || 0;
    if (session.model) modelsUsed.add(session.model);
  }

  return {
    total_sessions: totalSessions,
    total_turns: totalTurns,
    total_input_tokens: totalInput,
    total_output_tokens: totalOutput,
    total_cost_usd: totalCost,
    models_used: [...modelsUsed],
  };
}

module.exports = {
  scanUsage,
  getSessionSummary,
  getModelBreakdown,
  getTotalUsageStats,
  estimateCost,
  registerUsageDb,
};
