'use strict';

const app = require('./app');

const PORT = parseInt(process.env.PORT || '3002', 10);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'data-server',
    message: `Data server listening on port ${PORT}`,
    port: PORT,
    timestamp: new Date().toISOString(),
  }));
});

const shutdown = (signal) => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'data-server',
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
    service: 'data-server',
    message: 'Unhandled promise rejection',
    reason: String(reason),
    timestamp: new Date().toISOString(),
  }));
});
