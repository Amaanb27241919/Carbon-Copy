'use strict';

const express = require('express');
const orchestrator = require('../orchestrator');

const router = express.Router();

// GET /agents — list all agent statuses
router.get('/', (_req, res) => {
  const status = orchestrator.getStatus();
  return res.json({ status: 'ok', data: status.agents });
});

// GET /agents/:id — single agent status
router.get('/:id', (req, res) => {
  const agent = orchestrator.agents[req.params.id];
  if (!agent) {
    return res.status(404).json({ status: 'error', error: 'Agent not found' });
  }
  return res.json({ status: 'ok', data: agent.toJSON() });
});

module.exports = router;
