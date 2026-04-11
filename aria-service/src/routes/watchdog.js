'use strict';

const express = require('express');
const { z } = require('zod');
const watchdog = require('../watchdog');

const router = express.Router();

const MonitorSchema = z.object({
  clientId: z.string().uuid(),
  targetEntity: z.string().min(1).max(200),
  signalTypes: z.array(z.string()).optional(),
});

// GET /watchdog — list monitors (optionally filter by clientId)
router.get('/', async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) {
    return res.status(400).json({ status: 'error', error: 'clientId required' });
  }
  try {
    const monitors = await watchdog.listMonitors(clientId);
    return res.json({ status: 'ok', data: monitors });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// POST /watchdog — create monitor
router.post('/', async (req, res) => {
  const parsed = MonitorSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'error', error: parsed.error.flatten() });
  }

  const { clientId, targetEntity, signalTypes } = parsed.data;
  try {
    const monitor = await watchdog.createMonitor(clientId, targetEntity, signalTypes);
    return res.status(201).json({ status: 'ok', data: monitor });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /watchdog/:id — single monitor
router.get('/:id', async (req, res) => {
  try {
    const monitor = await watchdog.getMonitor(req.params.id);
    if (!monitor) return res.status(404).json({ status: 'error', error: 'Monitor not found' });
    return res.json({ status: 'ok', data: monitor });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// POST /watchdog/:id/check — run an immediate check
router.post('/:id/check', async (req, res) => {
  try {
    const monitor = await watchdog.getMonitor(req.params.id);
    if (!monitor) return res.status(404).json({ status: 'error', error: 'Monitor not found' });

    const result = await watchdog.runCheck(monitor);
    return res.json({ status: 'ok', data: result });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// PATCH /watchdog/:id — update monitor
router.patch('/:id', async (req, res) => {
  try {
    const updated = await watchdog.updateMonitor(req.params.id, req.body);
    if (!updated) return res.status(404).json({ status: 'error', error: 'Monitor not found' });
    return res.json({ status: 'ok', data: updated });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// DELETE /watchdog/:id
router.delete('/:id', async (req, res) => {
  try {
    await watchdog.deleteMonitor(req.params.id);
    return res.json({ status: 'ok', data: { deleted: true } });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
