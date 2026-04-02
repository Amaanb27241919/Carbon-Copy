'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  console.error(JSON.stringify({
    level: 'error',
    service: 'auth',
    message: 'JWT_SECRET and JWT_REFRESH_SECRET environment variables must be set',
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
}

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';

/**
 * Sign an access token.
 * @param {{ sub: string, role: string }} payload
 * @returns {string}
 */
const signAccessToken = (payload) => {
  return jwt.sign(
    { sub: payload.sub, role: payload.role, type: 'access' },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL, issuer: 'carbon-auth' }
  );
};

/**
 * Sign a refresh token.
 * @param {{ sub: string }} payload
 * @returns {string}
 */
const signRefreshToken = (payload) => {
  return jwt.sign(
    { sub: payload.sub, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL, issuer: 'carbon-auth' }
  );
};

/**
 * Verify an access token. Throws on failure.
 * @param {string} token
 * @returns {object}
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, JWT_SECRET, { issuer: 'carbon-auth' });
};

/**
 * Verify a refresh token. Throws on failure.
 * @param {string} token
 * @returns {object}
 */
const verifyRefreshToken = (token) => {
  return jwt.verify(token, JWT_REFRESH_SECRET, { issuer: 'carbon-auth' });
};

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
