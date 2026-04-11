'use strict';

const { Router } = require('express');
const { randomUUID } = require('crypto');
const { query } = require('../services/db');

const router = Router();

// POST /clients — create client
router.post('/', async (req, res) => {
  const { name, industry, monthlyBudget, slackWebhook, emailTo } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const id = randomUUID();
  try {
    const result = await query(
      `INSERT INTO aria_clients (id, name, industry, monthly_budget, slack_webhook, email_to, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *`,
      [id, name, industry || '', parseFloat(monthlyBudget) || 1000, slackWebhook || null, emailTo || null]
    );
    return res.status(201).json(result.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to create client', message: e.message });
  }
});

// GET /clients — list all clients
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      `SELECT c.*, COUNT(m.id) AS mission_count, COALESCE(SUM(m.cost_usd),0) AS total_spend
       FROM aria_clients c
       LEFT JOIN aria_missions m ON m.client_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );
    return res.json(result.rows);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to list clients', message: e.message });
  }
});

// GET /clients/:id — single client with mission summary
router.get('/:id', async (req, res) => {
  try {
    const [clientRes, missionsRes] = await Promise.all([
      query('SELECT * FROM aria_clients WHERE id = $1', [req.params.id]),
      query(
        `SELECT id, goal, status, cost_usd, tokens_used, created_at FROM aria_missions
         WHERE client_id = $1 ORDER BY created_at DESC LIMIT 10`,
        [req.params.id]
      ),
    ]);
    if (clientRes.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    return res.json({ ...clientRes.rows[0], recentMissions: missionsRes.rows });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to get client', message: e.message });
  }
});

// PATCH /clients/:id — update client
router.patch('/:id', async (req, res) => {
  const { name, industry, monthlyBudget, slackWebhook, emailTo } = req.body;
  try {
    const result = await query(
      `UPDATE aria_clients
       SET name = COALESCE($2, name),
           industry = COALESCE($3, industry),
           monthly_budget = COALESCE($4, monthly_budget),
           slack_webhook = COALESCE($5, slack_webhook),
           email_to = COALESCE($6, email_to)
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, industry, monthlyBudget ? parseFloat(monthlyBudget) : null, slackWebhook, emailTo]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    return res.json(result.rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Failed to update client', message: e.message });
  }
});

// DELETE /clients/:id
router.delete('/:id', async (req, res) => {
  try {
    await query('DELETE FROM aria_clients WHERE id = $1', [req.params.id]);
    return res.json({ success: true });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to delete client', message: e.message });
  }
});

module.exports = router;
