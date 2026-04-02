'use strict';

const Redis = require('ioredis');

let redisClient = null;

const getRedis = () => {
  if (!redisClient) {
    const REDIS_URL = process.env.REDIS_URL;
    if (!REDIS_URL) {
      throw new Error('REDIS_URL environment variable must be set');
    }

    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: false,
      retryStrategy: (times) => {
        if (times > 10) return null;
        return Math.min(times * 100, 3000);
      },
    });

    redisClient.on('error', (err) => {
      console.error(JSON.stringify({
        level: 'error',
        service: 'auth',
        message: 'Redis client error',
        error: err.message,
        timestamp: new Date().toISOString(),
      }));
    });

    redisClient.on('connect', () => {
      console.log(JSON.stringify({
        level: 'info',
        service: 'auth',
        message: 'Redis connected',
        timestamp: new Date().toISOString(),
      }));
    });
  }

  return redisClient;
};

module.exports = { getRedis };
