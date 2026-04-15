/**
 * Notification Service — Carbon Core
 * Ported from oh-my-codex notifier.ts + RawClaw discord.ts
 *
 * Supports: Desktop (macOS), Discord webhooks, Telegram bots
 */

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const HTTP_TIMEOUT_MS = 10_000;

// ── Config ──────────────────────────────────────────────────────────

let _config = null;

function configureNotifications(config) {
  _config = config;
  console.log('[notifications] Configured:', Object.keys(config).filter(k => config[k]).join(', ') || 'none');
}

function getNotificationConfig() {
  return _config || {
    desktop: process.platform === 'darwin',
    discord: process.env.DISCORD_WEBHOOK_URL ? { webhookUrl: process.env.DISCORD_WEBHOOK_URL } : null,
    telegram: (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) ? {
      botToken: process.env.TELEGRAM_BOT_TOKEN,
      chatId: process.env.TELEGRAM_CHAT_ID,
    } : null,
  };
}

// ── Main Notify ─────────────────────────────────────────────────────

/**
 * Send a notification via all configured channels.
 * Fire-and-forget — failures are swallowed.
 */
async function notify(payload, config) {
  const cfg = config || getNotificationConfig();
  const promises = [];

  if (cfg.desktop) promises.push(sendDesktop(payload).catch(() => {}));
  if (cfg.discord?.webhookUrl) promises.push(sendDiscord(payload, cfg.discord.webhookUrl).catch(() => {}));
  if (cfg.telegram?.botToken && cfg.telegram?.chatId) {
    promises.push(sendTelegram(payload, cfg.telegram.botToken, cfg.telegram.chatId).catch(() => {}));
  }

  await Promise.allSettled(promises);
}

// ── Desktop (macOS) ─────────────────────────────────────────────────

async function sendDesktop(payload) {
  if (process.platform !== 'darwin') return;
  const title = payload.title || 'Carbon Core';
  const message = payload.message;
  const soundName = payload.type === 'error' ? 'Basso' : 'Glass';
  try {
    await execFileAsync('osascript', [
      '-e', `display notification "${message.replace(/"/g, '\\"')}" with title "${title.replace(/"/g, '\\"')}" sound name "${soundName}"`,
    ]);
  } catch { /* not on macOS or no osascript */ }
}

// ── Discord ─────────────────────────────────────────────────────────

const DISCORD_COLORS = { info: 0x5865F2, success: 0x57F287, warning: 0xFEE75C, error: 0xED4245 };

async function sendDiscord(payload, webhookUrl) {
  const body = JSON.stringify({
    embeds: [{
      title: payload.title || 'Carbon Core',
      description: payload.message,
      color: DISCORD_COLORS[payload.type] || DISCORD_COLORS.info,
      timestamp: new Date().toISOString(),
      footer: { text: payload.mode || 'carbon-core' },
    }],
  });

  const url = new URL(webhookUrl);
  await jsonRequest({
    hostname: url.hostname,
    path: url.pathname + url.search,
    body,
    errorPrefix: 'Discord webhook',
  });
}

// ── Telegram ────────────────────────────────────────────────────────

const TYPE_EMOJI = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };

async function sendTelegram(payload, botToken, chatId) {
  const emoji = TYPE_EMOJI[payload.type] || 'ℹ️';
  const text = `${emoji} *${payload.title || 'Carbon Core'}*\n\n${payload.message}`;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });

  await jsonRequest({
    hostname: 'api.telegram.org',
    path: `/bot${botToken}/sendMessage`,
    body,
    errorPrefix: 'Telegram',
  });
}

// ── HTTP Helper ─────────────────────────────────────────────────────

function jsonRequest({ hostname, path, body, errorPrefix, timeoutMs = HTTP_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const { request } = require('https');
    const req = request({
      hostname, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`${errorPrefix} HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
        else resolve(data);
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`${errorPrefix} timeout`)); });
    req.write(body);
    req.end();
  });
}

// ── Convenience Helpers ─────────────────────────────────────────────

const notifyBudgetWarning = (agentId, spend, limit, window) =>
  notify({ title: '⚠️ Budget Warning', message: `Agent ${agentId}: ${(spend/limit*100).toFixed(0)}% of ${window} budget ($${spend.toFixed(2)} / $${limit.toFixed(2)})`, type: 'warning', mode: 'budget' });

const notifyBudgetExceeded = (agentId, spend, limit, window) =>
  notify({ title: '🛑 Budget Exceeded', message: `Agent ${agentId} PAUSED: exceeded ${window} budget ($${spend.toFixed(2)} / $${limit.toFixed(2)})`, type: 'error', mode: 'budget' });

const notifyAgentCompleted = (agentId, taskPreview, cost, duration) =>
  notify({ title: '✅ Agent Done', message: `${agentId}: "${taskPreview.slice(0, 60)}" — $${cost.toFixed(4)} in ${(duration/1000).toFixed(1)}s`, type: 'success', mode: 'heartbeat' });

const notifySystemError = (message) =>
  notify({ title: '❌ System Error', message, type: 'error', mode: 'system' });

const notifyOrchestrationDone = (runId, mode, duration) =>
  notify({ title: '🎯 Orchestration Complete', message: `Run ${runId.slice(0,8)} (${mode}) finished in ${(duration/1000).toFixed(1)}s`, type: 'success', mode: 'orchestration' });


module.exports = {
  configureNotifications,
  getNotificationConfig,
  notify,
  notifyBudgetWarning,
  notifyBudgetExceeded,
  notifyAgentCompleted,
  notifySystemError,
  notifyOrchestrationDone,
};
