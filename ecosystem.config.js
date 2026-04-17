module.exports = {
  apps: [
    {
      name: 'carbon-core',
      script: 'api-server-v2.js',
      cwd: '/Users/amaankhan/Desktop/OmniFlow/Carbon-Copy',
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
      script: 'node_modules/.bin/next',
      args: 'dev -p 3006',
      cwd: '/Users/amaankhan/Desktop/OmniFlow/Carbon-Copy/web-app',
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
