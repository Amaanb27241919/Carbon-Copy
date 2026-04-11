'use strict';

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error(JSON.stringify({
    level: 'error',
    service: 'aria-service',
    message: 'DATABASE_URL environment variable must be set',
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error(JSON.stringify({
    level: 'error',
    service: 'aria-service',
    message: 'Unexpected PostgreSQL pool error',
    error: err.message,
    timestamp: new Date().toISOString(),
  }));
});

/**
 * Execute a parameterized SQL query.
 * @param {string} text - SQL statement
 * @param {Array} [params] - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      console.warn(JSON.stringify({
        level: 'warn',
        service: 'aria-service',
        message: 'Slow query detected',
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      }));
    }
    return result;
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error',
      service: 'aria-service',
      message: 'Database query error',
      error: err.message,
      timestamp: new Date().toISOString(),
    }));
    throw err;
  }
};

module.exports = { query, pool };
