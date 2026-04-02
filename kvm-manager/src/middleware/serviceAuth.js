'use strict';

const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN;

if (!INTERNAL_SERVICE_TOKEN) {
  console.error(JSON.stringify({
    level: 'error', service: 'kvm-manager',
    message: 'INTERNAL_SERVICE_TOKEN must be set',
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
}

const serviceAuth = (req, res, next) => {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(403).json({ error: 'Forbidden', message: 'Missing Authorization header' });
  }
  if (auth.slice(7) !== INTERNAL_SERVICE_TOKEN) {
    return res.status(403).json({ error: 'Forbidden', message: 'Invalid service token' });
  }
  return next();
};

module.exports = { serviceAuth };
