'use strict';

const express = require('express');
const multer = require('multer');
const dossier = require('../dossier');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// GET /dossier?clientId=xxx — list files for client
router.get('/', async (req, res) => {
  const { clientId, limit = 20 } = req.query;
  if (!clientId) {
    return res.status(400).json({ status: 'error', error: 'clientId required' });
  }
  try {
    const files = await dossier.getClientFiles(clientId, parseInt(limit, 10));
    return res.json({ status: 'ok', data: files });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// POST /dossier — upload a file with text extraction
router.post('/', upload.single('file'), async (req, res) => {
  const { clientId } = req.body;
  if (!clientId) {
    return res.status(400).json({ status: 'error', error: 'clientId required' });
  }
  if (!req.file) {
    return res.status(400).json({ status: 'error', error: 'file required' });
  }

  const filename = req.file.originalname;
  const extractedText = req.file.buffer.toString('utf8').substring(0, 50000);
  const filePath = `/data/knowledge/${clientId}/${Date.now()}-${filename}`;

  try {
    const file = await dossier.addFile(clientId, filename, extractedText, filePath);
    return res.status(201).json({ status: 'ok', data: file });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /dossier/:id — single file
router.get('/:id', async (req, res) => {
  try {
    const file = await dossier.getFile(req.params.id);
    if (!file) return res.status(404).json({ status: 'error', error: 'File not found' });
    return res.json({ status: 'ok', data: file });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// DELETE /dossier/:id
router.delete('/:id', async (req, res) => {
  try {
    await dossier.deleteFile(req.params.id);
    return res.json({ status: 'ok', data: { deleted: true } });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /dossier/search?clientId=xxx&q=query
router.get('/search', async (req, res) => {
  const { clientId, q } = req.query;
  if (!clientId || !q) {
    return res.status(400).json({ status: 'error', error: 'clientId and q required' });
  }
  try {
    const results = await dossier.searchFiles(clientId, q, 10);
    return res.json({ status: 'ok', data: results });
  } catch (err) {
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
