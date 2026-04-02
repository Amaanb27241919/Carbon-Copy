'use strict';

const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const app = require('./app');

const PORT = parseInt(process.env.PORT || '3005', 10);

const server = http.createServer(app);

// Attach socket.io — used by /sandbox/runs/:runId/stream
const io = new SocketIOServer(server, {
  cors: { origin: '*' },
  path: '/socket.io',
});

// Make io available to routes via app locals
app.locals.io = io;

io.on('connection', (socket) => {
  const { runId } = socket.handshake.query;
  if (runId && typeof runId === 'string') {
    socket.join(`run:${runId}`);
    socket.emit('connected', { runId, message: 'Joined sandbox log stream' });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'sandbox',
    message: `Sandbox service listening on port ${PORT}`,
    port: PORT,
    timestamp: new Date().toISOString(),
  }));
});

const shutdown = (signal) => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'sandbox',
    message: `Received ${signal}, shutting down gracefully`,
    timestamp: new Date().toISOString(),
  }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 15000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({
    level: 'error',
    service: 'sandbox',
    message: 'Unhandled promise rejection',
    reason: String(reason),
    timestamp: new Date().toISOString(),
  }));
});

process.on('uncaughtException', (err) => {
  console.error(JSON.stringify({
    level: 'error',
    service: 'sandbox',
    message: 'Uncaught exception',
    error: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
});
