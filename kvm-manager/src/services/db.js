'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error(JSON.stringify({
    level: 'error', service: 'kvm-manager',
    message: 'PostgreSQL pool error', error: err.message,
    timestamp: new Date().toISOString(),
  }));
});

const query = async (text, params) => {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error(JSON.stringify({
      level: 'error', service: 'kvm-manager',
      message: 'Query error', error: err.message, query: text,
      timestamp: new Date().toISOString(),
    }));
    throw err;
  }
};

module.exports = { query };
