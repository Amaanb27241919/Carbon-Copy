'use strict';

const axios = require('axios');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth:3001';

// Paths that do not require authentication
const PUBLIC_PATHS = new Set(['/health', '/metrics']);

/**
 * JWT auth middleware.
 * Delegates validation to the auth service so the gateway never touches JWT secrets directly.
 */
const authMiddleware = async (req, res, next) => {
  // Skip auth for public routes
  if (PUBLIC_PATHS.has(req.path)) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const response = await axios.get(`${AUTH_SERVICE_URL}/tokens/validate`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
    });

    const { valid, user } = response.data;

    if (!valid || !user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }

    // Attach user context for downstream handlers
    req.user = { id: user.id, role: user.role };

    // Forward user info to upstream services as headers
    req.headers['x-user-id'] = String(user.id);
    req.headers['x-user-role'] = String(user.role);

    return next();
  } catch (err) {
    // Auth service returned 4xx (invalid token)
    if (err.response && err.response.status >= 400 && err.response.status < 500) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }

    // Auth service unavailable — fail closed
    console.error(JSON.stringify({
      level: 'error',
      service: 'gateway',
      message: 'Auth service unreachable',
      error: err.message,
      timestamp: new Date().toISOString(),
    }));

    return res.status(503).json({ error: 'Service unavailable', message: 'Auth service is unreachable' });
  }
};

module.exports = { authMiddleware };
