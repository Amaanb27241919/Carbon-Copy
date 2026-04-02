'use strict';

const app = require('./app');

const PORT = parseInt(process.env.PORT || '3000', 10);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'gateway',
    message: `Gateway listening on port ${PORT}`,
    port: PORT,
    env: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString(),
  }));
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'gateway',
    message: `Received ${signal}, shutting down gracefully`,
    timestamp: new Date().toISOString(),
  }));
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({
    level: 'error',
    service: 'gateway',
    message: 'Unhandled promise rejection',
    reason: String(reason),
    timestamp: new Date().toISOString(),
  }));
});
