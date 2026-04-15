// Health Monitor v2 — Carbon Core
// 5-subsystem health checks + system metrics.
// Runs every 5 minutes via startHealthMonitor().

'use strict';

const os = require('os');
const { spawn } = require('child_process');

const { getTotalRuns, getActiveRuns } = require('./heartbeat-v2.js');
const { getActivityCount } = require('./audit-v2.js');

// ── Process Start Time (for uptime) ────────────────────────────────

const PROCESS_START_TIME = Date.now();

// ── DB Registration (avoids circular imports) ──────────────────────

/** @type {Function|null} */
let _checkDb = null;

/** @type {Function|null} */
let _getMemoryCount = null;

/** @type {Function|null} */
let _getScheduledTaskCount = null;

/**
 * Register database/subsystem query functions.
 * Called from index-v2.js after DB init.
 *
 * @param {{ checkDb: Function, getMemoryCount: Function, getScheduledTaskCount: Function }} fns
 */
function registerHealthDb({ checkDb, getMemoryCount, getScheduledTaskCount }) {
  _checkDb = checkDb;
  _getMemoryCount = getMemoryCount;
  _getScheduledTaskCount = getScheduledTaskCount;
}

// ── Subsystem Checks ────────────────────────────────────────────────

/**
 * Check SQLite database health via the registered ping function.
 * @returns {Promise<Object>}
 */
async function checkDatabase() {
  const start = Date.now();

  if (!_checkDb) {
    return {
      name: 'database',
      status: 'degraded',
      message: 'Not initialized',
      latency_ms: 0,
    };
  }

  try {
    const result = _checkDb();
    return {
      name: 'database',
      status: 'healthy',
      message: `SQLite OK${result ? ` (${result})` : ''}`,
      latency_ms: Date.now() - start,
    };
  } catch (err) {
    return {
      name: 'database',
      status: 'unhealthy',
      message: `SQLite error: ${String(err)}`,
      latency_ms: Date.now() - start,
    };
  }
}

/**
 * Check Telegram bot token configuration.
 * @returns {Promise<Object>}
 */
async function checkTelegram() {
  const hasToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return {
    name: 'telegram',
    status: hasToken ? 'healthy' : 'unhealthy',
    message: hasToken ? 'Token configured' : 'TELEGRAM_BOT_TOKEN not set',
    latency_ms: 0,
  };
}

/**
 * Check memory subsystem via registered count function.
 * @returns {Promise<Object>}
 */
async function checkMemorySystem() {
  if (!_getMemoryCount) {
    return {
      name: 'memory_system',
      status: 'degraded',
      message: 'Not initialized',
      latency_ms: 0,
    };
  }

  const start = Date.now();
  try {
    const count = _getMemoryCount();
    return {
      name: 'memory_system',
      status: 'healthy',
      message: `${count} memories stored`,
      latency_ms: Date.now() - start,
      details: { memory_count: count },
    };
  } catch (err) {
    return {
      name: 'memory_system',
      status: 'degraded',
      message: `Could not query memories: ${String(err)}`,
      latency_ms: Date.now() - start,
    };
  }
}

/**
 * Check scheduler subsystem via registered task count function.
 * @returns {Promise<Object>}
 */
async function checkScheduler() {
  if (!_getScheduledTaskCount) {
    return {
      name: 'scheduler',
      status: 'degraded',
      message: 'Not initialized',
      latency_ms: 0,
    };
  }

  const start = Date.now();
  try {
    const count = _getScheduledTaskCount();
    return {
      name: 'scheduler',
      status: 'healthy',
      message: `${count} scheduled task(s)`,
      latency_ms: Date.now() - start,
      details: { task_count: count },
    };
  } catch (err) {
    return {
      name: 'scheduler',
      status: 'degraded',
      message: `Could not query tasks: ${String(err)}`,
      latency_ms: Date.now() - start,
    };
  }
}

/**
 * Check claude CLI availability by spawning `claude --version`.
 * Non-zero exit or spawn error → unhealthy.
 * @returns {Promise<Object>}
 */
function checkClaudeCli() {
  return new Promise((resolve) => {
    const start = Date.now();
    const proc = spawn('claude', ['--version'], { env: process.env });

    let stdout = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      resolve({
        name: 'claude_cli',
        status: 'unhealthy',
        message: 'Timed out checking claude --version',
        latency_ms: Date.now() - start,
      });
    }, 5000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      const latency_ms = Date.now() - start;
      if (code === 0) {
        resolve({
          name: 'claude_cli',
          status: 'healthy',
          message: stdout.trim() || 'claude CLI available',
          latency_ms,
        });
      } else {
        resolve({
          name: 'claude_cli',
          status: 'unhealthy',
          message: `claude --version exited ${code}`,
          latency_ms,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        name: 'claude_cli',
        status: 'unhealthy',
        message: `claude CLI not found: ${err.message}`,
        latency_ms: Date.now() - start,
      });
    });
  });
}

// ── System Metrics ──────────────────────────────────────────────────

/**
 * Sample CPU utilization from os.cpus() idle vs total times.
 * Averages across all cores. Single snapshot — not a delta.
 * @returns {number} Percentage 0–100, one decimal place
 */
function getCpuPercent() {
  const cpus = os.cpus();
  if (cpus.length === 0) return 0;

  let totalIdle = 0;
  let totalTime = 0;

  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      totalTime += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }

  if (totalTime === 0) return 0;
  const usedPercent = ((totalTime - totalIdle) / totalTime) * 100;
  return Math.round(usedPercent * 10) / 10;
}

/**
 * Collect OS-level system metrics.
 * @returns {Object}
 */
function getSystemMetrics() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    cpu_percent: getCpuPercent(),
    memory_percent: Math.round((usedMem / totalMem) * 1000) / 10,
    memory_total_mb: Math.round(totalMem / 1024 / 1024),
    memory_used_mb: Math.round(usedMem / 1024 / 1024),
    platform: `${os.platform()} ${os.arch()}`,
    hostname: os.hostname(),
    node_version: process.version,
  };
}

// ── Aggregate Status ────────────────────────────────────────────────

/**
 * Derive overall health from subsystem results.
 * Critical: database, telegram, claude_cli.
 * Any critical unhealthy → 'unhealthy'.
 * Any degraded/unhealthy → 'degraded'.
 * All healthy → 'healthy'.
 *
 * @param {Array<Object>} subsystems
 * @returns {'healthy'|'degraded'|'unhealthy'}
 */
function deriveOverallStatus(subsystems) {
  const CRITICAL = new Set(['database', 'telegram', 'claude_cli']);

  for (const s of subsystems) {
    if (CRITICAL.has(s.name) && s.status === 'unhealthy') return 'unhealthy';
  }

  for (const s of subsystems) {
    if (s.status !== 'healthy') return 'degraded';
  }

  return 'healthy';
}

// ── Cached Last Result ──────────────────────────────────────────────

/** @type {Object|null} */
let _lastHealthStatus = null;

// ── Main Health Check ───────────────────────────────────────────────

/**
 * Run all 5 subsystem health checks and return a comprehensive status report.
 * Caches the result as the last known status.
 *
 * @returns {Promise<Object>} SystemHealth
 */
async function getHealthStatus() {
  const subsystems = await Promise.all([
    checkDatabase(),
    checkTelegram(),
    checkMemorySystem(),
    checkScheduler(),
    checkClaudeCli(),
  ]);

  const health = {
    status: deriveOverallStatus(subsystems),
    timestamp: Date.now(),
    uptime_seconds: Math.floor((Date.now() - PROCESS_START_TIME) / 1000),
    subsystems,
    system: getSystemMetrics(),
    stats: {
      total_heartbeat_runs: getTotalRuns(),
      active_runs: getActiveRuns().length,
      activity_log_entries: getActivityCount(),
    },
  };

  _lastHealthStatus = health;
  return health;
}

/**
 * Return the last cached health status without running checks.
 * Returns null if getHealthStatus() has never been called.
 * @returns {Object|null}
 */
function getLastHealthStatus() {
  return _lastHealthStatus;
}

// ── Periodic Monitor ────────────────────────────────────────────────

/**
 * Start a periodic health monitor at the given interval.
 * Logs status transitions and degraded subsystems to console.
 *
 * @param {number} [intervalMs=300000] Default: 5 minutes
 * @returns {NodeJS.Timeout} Interval handle — pass to stopHealthMonitor() to cancel
 */
function startHealthMonitor(intervalMs = 300_000) {
  let lastStatus = null;

  const handle = setInterval(async () => {
    try {
      const health = await getHealthStatus();

      if (health.status !== lastStatus) {
        if (lastStatus !== null) {
          console.log(`[health] Status changed: ${lastStatus} → ${health.status}`);
        }
        lastStatus = health.status;
      }

      if (health.status !== 'healthy') {
        const degraded = health.subsystems
          .filter((s) => s.status !== 'healthy')
          .map((s) => `${s.name}(${s.status})`)
          .join(', ');
        console.warn(`[health] ${health.status.toUpperCase()}: ${degraded}`);
      }
    } catch (err) {
      console.error('[health] Monitor check failed:', err);
    }
  }, intervalMs);

  console.log(`[health] Monitor started (interval: ${intervalMs}ms)`);
  return handle;
}

/**
 * Stop a running health monitor.
 * @param {NodeJS.Timeout} handle
 */
function stopHealthMonitor(handle) {
  if (handle) {
    clearInterval(handle);
    console.log('[health] Monitor stopped');
  }
}

// ── Exports ─────────────────────────────────────────────────────────

module.exports = {
  getHealthStatus,
  getLastHealthStatus,
  startHealthMonitor,
  stopHealthMonitor,
  registerHealthDb,
};
