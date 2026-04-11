'use strict';

const express = require('express');
const { query } = require('../services/db');

const router = express.Router();

// GET /blueprints — list all blueprints (optionally filter by category)
router.get('/', async (req, res) => {
  const { category } = req.query;
  try {
    let sql = 'SELECT id, name, category, description, created_at FROM aria_blueprints';
    const params = [];
    if (category) {
      sql += ' WHERE category = $1';
      params.push(category);
    }
    sql += ' ORDER BY category, name';
    const result = await query(sql, params);
    return res.json({ status: 'ok', data: result.rows });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /blueprints/:id — single blueprint with template
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM aria_blueprints WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ status: 'error', error: 'Blueprint not found' });
    }
    return res.json({ status: 'ok', data: result.rows[0] });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
