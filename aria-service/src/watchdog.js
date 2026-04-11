'use strict';

const { query } = require('./services/db');
const modelClient = require('./services/model-client');

/**
 * WatchDog — monitors entities for signal changes and alerts clients.
 * Runs periodic checks against a list of monitors stored in aria_watchdog_monitors.
 */

const SIGNAL_TYPES = ['news', 'funding', 'leadership_change', 'regulatory', 'product_launch', 'market_move'];

async function createMonitor(clientId, targetEntity, signalTypes) {
  const validSignals = (signalTypes || SIGNAL_TYPES).filter(s => SIGNAL_TYPES.includes(s));
  const result = await query(
    `INSERT INTO aria_watchdog_monitors (id, client_id, target_entity, signal_types, status, created_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'active', NOW())
     RETURNING *`,
    [clientId, targetEntity, validSignals]
  );
  return result.rows[0];
}

async function listMonitors(clientId) {
  const result = await query(
    `SELECT * FROM aria_watchdog_monitors WHERE client_id = $1 ORDER BY created_at DESC`,
    [clientId]
  );
  return result.rows;
}

async function getMonitor(monitorId) {
  const result = await query(
    'SELECT * FROM aria_watchdog_monitors WHERE id = $1',
    [monitorId]
  );
  return result.rows[0] || null;
}

async function updateMonitor(monitorId, updates) {
  const { status, signalTypes } = updates;
  const result = await query(
    `UPDATE aria_watchdog_monitors
     SET status = COALESCE($2, status),
         signal_types = COALESCE($3, signal_types)
     WHERE id = $1
     RETURNING *`,
    [monitorId, status, signalTypes]
  );
  return result.rows[0] || null;
}

async function deleteMonitor(monitorId) {
  await query('DELETE FROM aria_watchdog_monitors WHERE id = $1', [monitorId]);
}

async function runCheck(monitor) {
  const messages = [
    {
      role: 'system',
      content: `You are a business intelligence monitor. Analyze recent developments for the target entity and identify any significant signals. Signal types to watch: ${(monitor.signal_types || []).join(', ')}.`,
    },
    {
      role: 'user',
      content: `Target entity: ${monitor.target_entity}\n\nIdentify any recent significant signals or changes. Return JSON with: {hasAlert: boolean, signals: [{type: string, summary: string, severity: 'low'|'medium'|'high'}], summary: string}`,
    },
  ];

  let checkResult = { hasAlert: false, signals: [], summary: 'No significant changes detected.' };

  try {
    const result = await modelClient.chat(messages);
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      checkResult = JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn(JSON.stringify({ level: 'warn', service: 'aria-service', message: 'WatchDog check failed', error: e.message }));
  }

  await query(
    'UPDATE aria_watchdog_monitors SET last_check = NOW() WHERE id = $1',
    [monitor.id]
  );

  return checkResult;
}

module.exports = { createMonitor, listMonitors, getMonitor, updateMonitor, deleteMonitor, runCheck, SIGNAL_TYPES };
