'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { z } = require('zod');

const db = require('../services/db');
const { cloneRepo, validateGitHubUrl } = require('../services/git');
const { detectProjectType } = require('../services/detector');
const { buildAndRunSandbox, stopSandbox, getSandboxLogs, streamSandboxLogs, cleanupSandbox } = require('../services/docker');

const router = express.Router();

// ─── In-memory metrics counters ───────────────────────────────────────────────
let runsTotal = 0;
let runsActive = 0;

const getMetrics = () => ({ runsTotal, runsActive });

// ─── Validation schemas ───────────────────────────────────────────────────────
const RunSchema = z.object({
  repoUrl: z.string().min(1, 'repoUrl is required'),
  name: z.string().max(255).optional(),
  cpuLimit: z.number().min(0.1).max(2).optional().default(1),
  memoryMb: z.number().int().min(64).max(2048).optional().default(512),
  env: z.record(z.string(), z.string()).optional().default({}),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Persist a new sandbox run record to the database.
 */
const createRunRecord = async (runId, repoUrl, name, cpuLimit, memoryMb) => {
  await db.query(
    `INSERT INTO sandbox_runs
       (run_id, repo_url, name, status, cpu_limit, memory_mb, created_at)
     VALUES ($1, $2, $3, 'pending', $4, $5, NOW())`,
    [runId, repoUrl, name || null, cpuLimit, memoryMb]
  );
};

const updateRunStatus = async (runId, status, extra = {}) => {
  const sets = ['status = $2'];
  const params = [runId, status];
  let idx = 3;

  if (extra.containerName !== undefined) {
    sets.push(`container_name = $${idx++}`);
    params.push(extra.containerName);
  }
  if (extra.projectType !== undefined) {
    sets.push(`project_type = $${idx++}`);
    params.push(extra.projectType);
  }
  if (extra.error !== undefined) {
    sets.push(`error = $${idx++}`);
    params.push(extra.error);
  }
  if (extra.startedAt) {
    sets.push(`started_at = $${idx++}`);
    params.push(extra.startedAt);
  }
  if (extra.finishedAt) {
    sets.push(`finished_at = $${idx++}`);
    params.push(extra.finishedAt);
  }
  if (extra.logs !== undefined) {
    sets.push(`logs = $${idx++}`);
    params.push(extra.logs);
  }

  await db.query(
    `UPDATE sandbox_runs SET ${sets.join(', ')} WHERE run_id = $1`,
    params
  );
};

// ─── POST /sandbox/run ────────────────────────────────────────────────────────
router.post('/run', async (req, res) => {
  // Validate request body
  const parse = RunSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: 'Validation error',
      details: parse.error.flatten().fieldErrors,
    });
  }

  const { repoUrl, name, cpuLimit, memoryMb, env } = parse.data;

  // Validate GitHub URL
  try {
    validateGitHubUrl(repoUrl);
  } catch (urlErr) {
    return res.status(400).json({ error: 'Invalid repository URL', message: urlErr.message });
  }

  const runId = uuidv4();
  const projectPath = path.join('/tmp/sandbox', runId);
  const containerName = `carbon-sandbox-${runId}`;

  // Persist initial record
  try {
    await createRunRecord(runId, repoUrl, name, cpuLimit, memoryMb);
  } catch (dbErr) {
    return res.status(500).json({ error: 'Database error', message: dbErr.message });
  }

  runsTotal++;

  // Respond immediately — the actual build/run happens async
  res.status(202).json({
    runId,
    status: 'starting',
    container: containerName,
    message: 'Sandbox run initiated. Poll /sandbox/runs/:runId for status.',
  });

  // ── Async pipeline ──────────────────────────────────────────────────────────
  (async () => {
    const io = req.app.locals.io;
    const logLines = [];

    const onLog = (line) => {
      logLines.push(line);
      if (io) {
        io.to(`run:${runId}`).emit('log', {
          runId,
          line,
          timestamp: new Date().toISOString(),
        });
      }
    };

    try {
      // 1. Clone
      onLog(`[sandbox] Cloning ${repoUrl}…`);
      fs.mkdirSync('/tmp/sandbox', { recursive: true });
      await cloneRepo(repoUrl, projectPath);
      onLog('[sandbox] Clone complete.');

      // 2. Detect project type
      const detection = detectProjectType(projectPath);
      onLog(`[sandbox] Project type: ${detection.type}, base image: ${detection.baseImage}`);

      await updateRunStatus(runId, 'building', { projectType: detection.type });

      // 3. Build + start container
      const { containerName: cName } = await buildAndRunSandbox(
        runId,
        projectPath,
        detection,
        { cpuLimit, memoryMb, env, onLog }
      );

      runsActive++;

      await updateRunStatus(runId, 'running', {
        containerName: cName,
        startedAt: new Date().toISOString(),
        logs: logLines.join('\n'),
      });

      onLog(`[sandbox] Container ${cName} is running.`);

      // 4. Stream logs in background
      if (io) {
        streamSandboxLogs(cName, io, runId).catch(() => {});
      }

    } catch (err) {
      onLog(`[sandbox] ERROR: ${err.message}`);
      runsActive = Math.max(0, runsActive - 1);

      await updateRunStatus(runId, 'failed', {
        error: err.message,
        finishedAt: new Date().toISOString(),
        logs: logLines.join('\n'),
      }).catch(() => {});

      // Cleanup
      try { await cleanupSandbox(containerName, projectPath); } catch (_) {}
    }
  })();
});

// ─── GET /sandbox/runs ────────────────────────────────────────────────────────
router.get('/runs', async (_req, res) => {
  try {
    const result = await db.query(
      `SELECT run_id, repo_url, name, project_type, container_name,
              status, cpu_limit, memory_mb, created_at, started_at, finished_at
       FROM sandbox_runs
       ORDER BY created_at DESC
       LIMIT 200`
    );
    return res.json({ runs: result.rows });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// ─── GET /sandbox/runs/:runId ─────────────────────────────────────────────────
router.get('/runs/:runId', async (req, res) => {
  const { runId } = req.params;

  // Basic UUID shape validation to prevent SQL injection vectors
  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return res.status(400).json({ error: 'Invalid runId format' });
  }

  try {
    const result = await db.query(
      `SELECT run_id, repo_url, name, project_type, container_name,
              status, cpu_limit, memory_mb, error,
              created_at, started_at, finished_at,
              (SELECT string_agg(line, E'\\n') FROM (
                SELECT unnest(string_to_array(logs, E'\\n')) AS line
                LIMIT 100
              ) sub) AS recent_logs
       FROM sandbox_runs
       WHERE run_id = $1`,
      [runId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found', runId });
    }

    return res.json({ run: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ error: 'Database error', message: err.message });
  }
});

// ─── POST /sandbox/runs/:runId/stop ──────────────────────────────────────────
router.post('/runs/:runId/stop', async (req, res) => {
  const { runId } = req.params;

  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return res.status(400).json({ error: 'Invalid runId format' });
  }

  try {
    const result = await db.query(
      'SELECT container_name, status FROM sandbox_runs WHERE run_id = $1',
      [runId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found', runId });
    }

    const { container_name: containerName, status } = result.rows[0];

    if (status === 'stopped' || status === 'failed') {
      return res.status(409).json({ error: 'Conflict', message: `Run is already ${status}` });
    }

    const projectPath = path.join('/tmp/sandbox', runId);
    await cleanupSandbox(containerName, projectPath);

    runsActive = Math.max(0, runsActive - 1);

    await updateRunStatus(runId, 'stopped', {
      finishedAt: new Date().toISOString(),
    });

    return res.json({ runId, status: 'stopped', message: 'Sandbox stopped and cleaned up.' });
  } catch (err) {
    return res.status(500).json({ error: 'Stop failed', message: err.message });
  }
});

// ─── GET /sandbox/runs/:runId/logs ───────────────────────────────────────────
router.get('/runs/:runId/logs', async (req, res) => {
  const { runId } = req.params;
  const tail = Math.min(parseInt(req.query.tail || '100', 10), 1000);

  if (!/^[0-9a-f-]{36}$/i.test(runId)) {
    return res.status(400).json({ error: 'Invalid runId format' });
  }

  try {
    const result = await db.query(
      'SELECT container_name, status, logs FROM sandbox_runs WHERE run_id = $1',
      [runId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Run not found', runId });
    }

    const { container_name: containerName, status, logs: dbLogs } = result.rows[0];

    // For running containers, fetch live logs from Docker
    if (status === 'running' && containerName) {
      try {
        const liveLogs = await getSandboxLogs(containerName, tail);
        return res.json({ runId, source: 'live', logs: liveLogs });
      } catch (_) {
        // Fall through to DB logs
      }
    }

    // Return stored logs from DB
    const storedLines = dbLogs ? dbLogs.split('\n').slice(-tail) : [];
    return res.json({ runId, source: 'stored', logs: storedLines });
  } catch (err) {
    return res.status(500).json({ error: 'Logs retrieval failed', message: err.message });
  }
});

module.exports = router;
module.exports.getMetrics = getMetrics;
