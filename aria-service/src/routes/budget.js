'use strict';

const express = require('express');
const { query } = require('../services/db');
const orchestrator = require('../orchestrator');

const router = express.Router();

// GET /budget — current budget status
router.get('/', async (req, res) => {
  try {
    const todayResult = await query(
      'SELECT * FROM aria_budget WHERE date = CURRENT_DATE LIMIT 1'
    );
    const monthResult = await query(
      `SELECT SUM(tokens_used) AS tokens_month, SUM(cost_usd) AS cost_month, SUM(missions_run) AS missions_month
       FROM aria_budget WHERE DATE_TRUNC('month', date) = DATE_TRUNC('month', CURRENT_DATE)`
    );

    const today = todayResult.rows[0] || { tokens_used: 0, cost_usd: 0, missions_run: 0 };
    const month = monthResult.rows[0] || { tokens_month: 0, cost_month: 0, missions_month: 0 };

    const { budgetState } = orchestrator;

    return res.json({
      status: 'ok',
      data: {
        limits: {
          dailyUSD: budgetState.dailyLimit,
          monthlyUSD: budgetState.monthlyLimit,
        },
        today: {
          tokensUsed: parseInt(today.tokens_used) || 0,
          costUSD: parseFloat(today.cost_usd) || 0,
          missionsRun: parseInt(today.missions_run) || 0,
        },
        month: {
          tokensUsed: parseInt(month.tokens_month) || 0,
          costUSD: parseFloat(month.cost_month) || 0,
          missionsRun: parseInt(month.missions_month) || 0,
        },
        utilization: {
          dailyPct: budgetState.dailyLimit > 0
            ? Math.round((parseFloat(today.cost_usd || 0) / budgetState.dailyLimit) * 100)
            : 0,
          monthlyPct: budgetState.monthlyLimit > 0
            ? Math.round((parseFloat(month.cost_month || 0) / budgetState.monthlyLimit) * 100)
            : 0,
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /budget/history — last 30 days
router.get('/history', async (req, res) => {
  try {
    const result = await query(
      `SELECT date, tokens_used, cost_usd, missions_run
       FROM aria_budget
       ORDER BY date DESC
       LIMIT 30`
    );
    return res.json({ status: 'ok', data: result.rows });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
