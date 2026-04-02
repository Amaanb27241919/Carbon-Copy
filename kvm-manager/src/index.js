'use strict';

const app = require('./app');

const PORT = parseInt(process.env.PORT || '3007', 10);

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'kvm-manager',
    message: `KVM Manager listening on port ${PORT}`,
    port: PORT,
    vm_images_dir: process.env.VM_IMAGES_DIR || '/var/lib/carbon-vms',
    ssh_port_start: process.env.VM_SSH_PORT_START || 2200,
    timestamp: new Date().toISOString(),
  }));
});

const shutdown = (signal) => {
  console.log(JSON.stringify({
    level: 'info',
    service: 'kvm-manager',
    message: `Received ${signal}, shutting down`,
    timestamp: new Date().toISOString(),
  }));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error(JSON.stringify({
    level: 'error',
    service: 'kvm-manager',
    message: 'Unhandled rejection',
    reason: String(reason),
    timestamp: new Date().toISOString(),
  }));
});
