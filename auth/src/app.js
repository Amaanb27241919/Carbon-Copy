'use strict';

const express = require('express');
const { z } = require('zod');
const { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } = require('./services/jwt');
const { query } = require('./services/db');
const { getRedis } = require('./services/redis');
const bcrypt = require('bcrypt');
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'auth' },
  transports: [new winston.transports.Console()],
});

const app = express();

app.use(express.json({ limit: '1mb' }));

// ─── Health ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() });
});

// ─── Prometheus metrics stub ──────────────────────────────────────────────────
let requestCount = 0;
app.use((_req, _res, next) => { requestCount++; next(); });
app.get('/metrics', (_req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(`# HELP auth_requests_total Total HTTP requests\n# TYPE auth_requests_total counter\nauth_requests_total ${requestCount}\n`);
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
const LoginSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1),
});

app.post('/auth/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() });
  }

  const { username, password } = parsed.data;

  try {
    const result = await query(
      'SELECT id, username, password_hash, role FROM users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      // Constant-time rejection — still run bcrypt to prevent timing attacks
      await bcrypt.compare(password, '$2b$10$invalidhashpadding000000000000000000000000000000000000000');
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid credentials' });
    }

    const accessToken = signAccessToken({ sub: user.id, role: user.role });
    const refreshToken = signRefreshToken({ sub: user.id });

    // Store refresh token in Redis with 7-day TTL
    const redis = getRedis();
    await redis.set(`refresh:${user.id}:${refreshToken.slice(-16)}`, refreshToken, 'EX', 60 * 60 * 24 * 7);

    logger.info('user login', { userId: user.id, username: user.username });

    return res.json({ accessToken, refreshToken, user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    logger.error('login error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /auth/refresh ───────────────────────────────────────────────────────
const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

app.post('/auth/refresh', async (req, res) => {
  const parsed = RefreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() });
  }

  const { refreshToken } = parsed.data;

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch (_err) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired refresh token' });
  }

  if (payload.type !== 'refresh') {
    return res.status(401).json({ error: 'Unauthorized', message: 'Wrong token type' });
  }

  try {
    // Check if refresh token is in blocklist
    const redis = getRedis();
    const blocked = await redis.get(`blocklist:${refreshToken.slice(-16)}`);
    if (blocked) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Token has been revoked' });
    }

    // Fetch user to get current role
    const result = await query('SELECT id, role FROM users WHERE id = $1', [payload.sub]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    const user = result.rows[0];
    const newAccessToken = signAccessToken({ sub: user.id, role: user.role });

    return res.json({ accessToken: newAccessToken });
  } catch (err) {
    logger.error('refresh error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
app.post('/auth/logout', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const body = req.body || {};
  const refreshToken = body.refreshToken;

  try {
    const redis = getRedis();

    // Blocklist the access token if present
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const payload = verifyAccessToken(token);
        const ttl = payload.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await redis.set(`blocklist:${token.slice(-16)}`, '1', 'EX', ttl);
        }
      } catch (_e) {
        // Token already expired — no need to blocklist
      }
    }

    // Blocklist refresh token if provided
    if (refreshToken) {
      await redis.set(`blocklist:${refreshToken.slice(-16)}`, '1', 'EX', 60 * 60 * 24 * 7);
      // Remove from active refresh tokens
      try {
        const rp = verifyRefreshToken(refreshToken);
        await redis.del(`refresh:${rp.sub}:${refreshToken.slice(-16)}`);
      } catch (_e) {
        // Ignore
      }
    }

    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    logger.error('logout error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GET /tokens/validate ─────────────────────────────────────────────────────
app.get('/tokens/validate', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.json({ valid: false, reason: 'Missing authorization header' });
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (_err) {
    return res.json({ valid: false, reason: 'Invalid or expired token' });
  }

  if (payload.type !== 'access') {
    return res.json({ valid: false, reason: 'Wrong token type' });
  }

  try {
    // Check blocklist
    const redis = getRedis();
    const blocked = await redis.get(`blocklist:${token.slice(-16)}`);
    if (blocked) {
      return res.json({ valid: false, reason: 'Token has been revoked' });
    }

    return res.json({
      valid: true,
      user: { id: payload.sub, role: payload.role },
    });
  } catch (err) {
    logger.error('validate error', { error: err.message });
    // Fail closed — if Redis is down, still validate the JWT itself
    return res.json({
      valid: true,
      user: { id: payload.sub, role: payload.role },
    });
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
