'use strict';

const http = require('http');
const https = require('https');

const MODEL_ROUTER_URL = process.env.MODEL_ROUTER_URL || 'http://model-router:3004';

/**
 * Send a chat completion request to the model-router.
 * @param {Array<{role: string, content: string}>} messages
 * @param {Object} [options]
 * @param {string} [options.provider]
 * @param {string} [options.model]
 * @returns {Promise<{response: string, tokensUsed: number, costUSD: number}>}
 */
const chat = (messages, options = {}) => {
  const payload = JSON.stringify({
    messages,
    provider: options.provider,
    model: options.model,
  });

  const url = new URL(`${MODEL_ROUTER_URL}/chat`);
  const lib = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve({
                response: parsed.response || parsed.content || '',
                tokensUsed: parsed.usage?.total_tokens || 0,
                costUSD: parsed.cost_usd || 0,
              });
            } else {
              reject(new Error(`Model router error ${res.statusCode}: ${data}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse model router response: ${e.message}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

module.exports = { chat };
