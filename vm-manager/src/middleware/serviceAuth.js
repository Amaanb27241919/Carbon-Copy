'use strict';

const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

if (!INTERNAL_SERVICE_TOKEN) {
  console.error(JSON.stringify({
    level: 'error',
    service: 'vm-manager',
    message: 'INTERNAL_SERVICE_TOKEN environment variable must be set',
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
}

/**
 * Middleware that enforces the internal service token on all protected routes.
 */
const serviceAuth = (req, res, next) => {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Missing Authorization header',
    });
  }

  const token = authHeader.slice(7);

  if (token !== INTERNAL_SERVICE_TOKEN) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid service token',
    });
  }

  return next();
};

module.exports = { serviceAuth };
