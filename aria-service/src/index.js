'use strict';

const http = require('http');
const { Server: SocketIO } = require('socket.io');

const app = require('./app');
const orchestrator = require('./orchestrator');

const PORT = parseInt(process.env.PORT || '3008', 10);

const server = http.createServer(app);

// ─── Socket.IO — real-time dashboard updates ─────────────────────────────────
const io = new SocketIO(server, {
  cors: { origin: '*' },
  path: '/socket.io',
});

io.on('connection', (socket) => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'aria-service',
    message: 'WebSocket client connected',
    socketId: socket.id,
    timestamp: new Date().toISOString(),
  }));

  // Send current status on connect
  socket.emit('status', orchestrator.getStatus());

  socket.on('disconnect', () => {
    console.log(JSON.stringify({
      level: 'info',
      service: 'aria-service',
      message: 'WebSocket client disconnected',
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    }));
  });
});

// Pipe orchestrator events to all connected clients
orchestrator.on('agent:status', (data) => io.emit('agent:status', data));
orchestrator.on('mission:completed', (data) => io.emit('mission:completed', data));
orchestrator.on('budget:threshold', (data) => io.emit('budget:alert', data));

// ─── Startup ──────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'aria-service',
    message: `ARIA service listening on port ${PORT}`,
    port: PORT,
    timestamp: new Date().toISOString(),
  }));
});

const shutdown = (signal) => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'aria-service',
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
    service: 'aria-service',
    message: 'Unhandled promise rejection',
    reason: String(reason),
    timestamp: new Date().toISOString(),
  }));
});
