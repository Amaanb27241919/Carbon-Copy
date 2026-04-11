'use strict';

const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../services/db');
const orchestrator = require('../orchestrator');
const dossier = require('../dossier');

const router = express.Router();

const MissionSchema = z.object({
  clientId: z.string().uuid(),
  goal: z.string().min(1).max(2000),
  context: z.string().max(5000).optional().default(''),
  blueprintId: z.string().optional(),
  format: z.enum(['pdf', 'slack', 'email', 'json']).optional().default('json'),
});

// GET /missions — list missions
router.get('/', async (req, res) => {
  const { clientId, status, limit = 20 } = req.query;
  const cap = Math.min(parseInt(limit, 10), 100);

  try {
    let sql = 'SELECT id, client_id, goal, status, tokens_used, cost_usd, created_at, completed_at FROM aria_missions WHERE 1=1';
    const params = [];
    let idx = 1;

    if (clientId) { sql += ` AND client_id = $${idx++}`; params.push(clientId); }
    if (status) { sql += ` AND status = $${idx++}`; params.push(status); }
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(cap);

    const result = await query(sql, params);
    return res.json({ status: 'ok', data: result.rows });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// POST /missions — submit new mission
router.post('/', async (req, res) => {
  const parsed = MissionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', error: parsed.error.flatten() });
  }

  const { clientId, goal, context, blueprintId, format } = parsed.data;
  const missionId = uuidv4();

  try {
    await query(
      `INSERT INTO aria_missions (id, client_id, goal, status, created_at)
       VALUES ($1, $2, $3, 'pending', NOW())`,
      [missionId, clientId, goal]
    );

    // Enhance context with dossier files
    const { context: enhancedContext } = await dossier.enhanceMissionContext(clientId, goal, context);

    // Run mission async
    orchestrator.runMission(missionId, goal, clientId, enhancedContext, blueprintId)
      .catch(e => {
        console.error(JSON.stringify({ level: 'error', service: 'aria-service', message: 'Mission failed', missionId, error: e.message }));
      });

    return res.status(202).json({
      status: 'ok',
      data: { missionId, status: 'pending', message: 'Mission submitted and queued' },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /missions/:id — get mission detail
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM aria_missions WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Mission not found' });
    }
    return res.json({ status: 'ok', data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
