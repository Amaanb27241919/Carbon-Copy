'use strict';

const app = require('./app');

const PORT = parseInt(process.env.PORT || '3001', 10);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'auth',
    message: `Auth service listening on port ${PORT}`,
    port: PORT,
    timestamp: new Date().toISOString(),
  }));
});

const shutdown = (signal) => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'auth',
    message: `Received ${signal}, shutting down gracefully`,
    timestamp: new Date().toISOString(),
  }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({
    level: 'error',
    service: 'auth',
    message: 'Unhandled promise rejection',
    reason: String(reason),
    timestamp: new Date().toISOString(),
  }));
});
