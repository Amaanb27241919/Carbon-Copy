'use strict';

const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { serviceAuth } = require('./middleware/serviceAuth');
const { query } = require('./services/db');
const { uploadFile, downloadFile, ensureBucket } = require('./services/storage');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'data-server' },
  transports: [new winston.transports.Console()],
});

const app = express();
app.use(express.json({ limit: '10mb' }));

// ─── Metrics ─────────────────────────────────────────────────────────────────
let requestCount = 0;
const routeHits = {};

app.use((req, _res, next) => {
  requestCount++;
  const key = `${req.method}:${req.path}`;
  routeHits[key] = (routeHits[key] || 0) + 1;
  next();
});

// ─── Health (unauthenticated) ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'data-server', timestamp: new Date().toISOString() });
});

app.get('/metrics', (_req, res) => {
  const lines = [
    '# HELP data_server_requests_total Total HTTP requests',
    '# TYPE data_server_requests_total counter',
    `data_server_requests_total ${requestCount}`,
  ];
  for (const [route, count] of Object.entries(routeHits)) {
    const safe = route.replace(/[^a-zA-Z0-9_]/g, '_');
    lines.push(`data_server_route_hits{route="${safe}"} ${count}`);
  }
  res.set('Content-Type', 'text/plain');
  res.send(lines.join('\n') + '\n');
});

// ─── Apply service auth to all /outputs, /logs, /files routes ────────────────
app.use(['/outputs', '/logs', '/files'], serviceAuth);

// ─── Model Outputs ────────────────────────────────────────────────────────────
const OutputSchema = z.object({
  projectName: z.string().min(1).max(100),
  inputData: z.record(z.unknown()).optional(),
  outputData: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

app.post('/outputs', async (req, res) => {
  const parsed = OutputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() });
  }

  const { projectName, inputData, outputData, metadata } = parsed.data;

  try {
    const result = await query(
      `INSERT INTO model_outputs (project, input_data, output_data, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [projectName, inputData || {}, outputData || {}, metadata || {}]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('POST /outputs error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/outputs', async (req, res) => {
  const project = req.query.project;
  const limit = Math.min(parseInt(req.query.limit || '50', 10), 500);

  try {
    let result;
    if (project) {
      result = await query(
        `SELECT id, project, input_data, output_data, metadata, created_at
         FROM model_outputs WHERE project = $1 ORDER BY created_at DESC LIMIT $2`,
        [project, limit]
      );
    } else {
      result = await query(
        `SELECT id, project, input_data, output_data, metadata, created_at
         FROM model_outputs ORDER BY created_at DESC LIMIT $1`,
        [limit]
      );
    }
    return res.json({ outputs: result.rows, count: result.rowCount });
  } catch (err) {
    logger.error('GET /outputs error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/outputs/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await query(
      `SELECT id, project, input_data, output_data, metadata, created_at
       FROM model_outputs WHERE id = $1`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    logger.error('GET /outputs/:id error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Service Logs ─────────────────────────────────────────────────────────────
const LogSchema = z.object({
  service: z.string().min(1).max(100),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
});

app.post('/logs', async (req, res) => {
  const parsed = LogSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() });
  }

  const { service, level, message, metadata } = parsed.data;

  try {
    const result = await query(
      `INSERT INTO service_logs (service, level, message, metadata)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [service, level, message, metadata || {}]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error('POST /logs error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/logs', async (req, res) => {
  const service = req.query.service;
  const level = req.query.level;
  const limit = Math.min(parseInt(req.query.limit || '100', 10), 1000);

  try {
    let sql = 'SELECT id, service, level, message, metadata, created_at FROM service_logs WHERE 1=1';
    const params = [];
    let idx = 1;

    if (service) { sql += ` AND service = $${idx++}`; params.push(service); }
    if (level) { sql += ` AND level = $${idx++}`; params.push(level); }
    sql += ` ORDER BY created_at DESC LIMIT $${idx}`;
    params.push(limit);

    const result = await query(sql, params);
    return res.json({ logs: result.rows, count: result.rowCount });
  } catch (err) {
    logger.error('GET /logs error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── File Storage ─────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

app.post('/files', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Bad request', message: 'No file provided' });
  }

  const bucket = req.body.bucket || 'carbon-outputs';
  const key = req.body.key || `${Date.now()}-${req.file.originalname}`;
  const contentType = req.file.mimetype || 'application/octet-stream';

  try {
    await ensureBucket(bucket);
    await uploadFile(bucket, key, req.file.buffer, contentType);
    return res.status(201).json({ bucket, key, size: req.file.size, contentType });
  } catch (err) {
    logger.error('POST /files error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/files/:bucket/:key(*)', async (req, res) => {
  const { bucket } = req.params;
  const key = req.params.key;

  try {
    const stream = await downloadFile(bucket, key);
    res.set('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
    stream.pipe(res);
  } catch (err) {
    if (err.code === 'NoSuchKey' || err.code === 'NotFound') {
      return res.status(404).json({ error: 'Not found' });
    }
    logger.error('GET /files error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Error Handler ────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('unhandled error', { error: err.message, stack: err.stack });
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ error: 'Internal server error', message: err.message });
});

module.exports = app;
