const path = require('path');
const ROOT = __dirname;

module.exports = {
  apps: [
    {
      name: 'carbon-core',
      script: path.join(ROOT, 'core', 'v4', 'api-server-v4.js'),
      cwd: ROOT,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: 'development',
        PORT: 3001,
      },
    },
    {
      name: 'carbon-web',
      script: path.join(ROOT, 'web-app', 'node_modules', '.bin', 'next'),
      args: 'dev -p 3006',
      cwd: path.join(ROOT, 'web-app'),
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
