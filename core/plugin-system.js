/**
 * Plugin System v2 — Carbon Core
 * JSON manifest plugins. Event subscription. In-process loading.
 * No js-yaml dependency — use plugin.json instead of plugin.yaml.
 * Ported from rawclaw/src/plugins.ts
 */

'use strict';

const fs = require('fs');
const path = require('path');

// ── Constants ─────────────────────────────────────────────────────────

const EVENT_TYPES = Object.freeze([
  'pre_message',
  'post_message',
  'on_task',
  'on_agent_run',
  'on_startup',
  'on_shutdown',
]);

const DEFAULT_PLUGINS_DIR = path.join(process.cwd(), 'plugins');

// ── In-Memory Registry ────────────────────────────────────────────────

/**
 * @type {Map<string, { manifest: object, module: object, status: string, state: Map<string, any> }>}
 * pluginId → plugin instance
 */
const _plugins = new Map();

// ── Manifest Loading ──────────────────────────────────────────────────

/**
 * Read and validate a plugin.json manifest.
 * @param {string} pluginDir
 * @returns {object|null} manifest or null if invalid
 */
function _loadManifest(pluginDir) {
  const manifestPath = path.join(pluginDir, 'plugin.json');

  let raw;
  try {
    raw = fs.readFileSync(manifestPath, 'utf8');
  } catch {
    return null;
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    console.warn('[plugin-system] Invalid plugin.json at', manifestPath, '-', err.message);
    return null;
  }

  if (!manifest.id || typeof manifest.id !== 'string') {
    console.warn('[plugin-system] Missing or invalid id in', manifestPath);
    return null;
  }

  if (!manifest.name || typeof manifest.name !== 'string') {
    console.warn('[plugin-system] Missing name in', manifestPath);
    return null;
  }

  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version || '0.0.0',
    description: manifest.description || '',
    events: Array.isArray(manifest.events) ? manifest.events : [],
    tools: Array.isArray(manifest.tools) ? manifest.tools : [],
  };
}

/**
 * Require the plugin entry point safely.
 * @param {string} pluginDir
 * @returns {object} plugin module (empty object if no index.js)
 */
function _requirePlugin(pluginDir) {
  const entryPath = path.join(pluginDir, 'index.js');

  if (!fs.existsSync(entryPath)) return {};

  try {
    // Clear require cache to allow reloading
    delete require.cache[require.resolve(entryPath)];
    return require(entryPath) || {};
  } catch (err) {
    console.error('[plugin-system] Error loading', entryPath, '-', err.message);
    return {};
  }
}

// ── Plugin Lifecycle ──────────────────────────────────────────────────

/**
 * Load and initialize all plugins found in pluginsDir.
 * @param {string} [pluginsDir]
 * @returns {Promise<void>}
 */
async function loadPlugins(pluginsDir) {
  const dir = pluginsDir || DEFAULT_PLUGINS_DIR;

  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // plugins directory doesn't exist — silent no-op
    return;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const pluginDir = path.join(dir, entry.name);
    const manifest = _loadManifest(pluginDir);
    if (!manifest) continue;

    const { id } = manifest;

    if (_plugins.has(id)) {
      console.warn('[plugin-system] Plugin already loaded:', id);
      continue;
    }

    const pluginModule = _requirePlugin(pluginDir);
    const state = new Map();

    const instance = {
      manifest,
      module: pluginModule,
      status: 'loaded',
      state,
    };

    _plugins.set(id, instance);

    // Call init if provided
    if (typeof pluginModule.init === 'function') {
      const ctx = _buildContext(id, state);
      try {
        await pluginModule.init(ctx);
        instance.status = 'active';
      } catch (err) {
        instance.status = 'error';
        console.error('[plugin-system] init() failed for', id, '-', err.message);
        continue;
      }
    } else {
      instance.status = 'active';
    }

    console.log('[plugin-system] Loaded plugin:', id, 'v' + manifest.version);
  }

  // Emit startup event to all active plugins
  await emitEvent('on_startup', { timestamp: Date.now() });
}

/**
 * Build a context object passed to plugin.init().
 * @param {string} pluginId
 * @param {Map} state
 * @returns {object}
 */
function _buildContext(pluginId, state) {
  return {
    pluginId,
    getState: (key) => state.get(key),
    setState: (key, value) => { state.set(key, value); },
    log: (msg) => console.log('[plugin:' + pluginId + ']', msg),
  };
}

// ── Event Emission ────────────────────────────────────────────────────

/**
 * Emit an event to all subscribed active plugins.
 * @param {string} eventType
 * @param {object} [payload]
 * @returns {Promise<Array<{ pluginId: string, result: any, error: string|null }>>}
 */
async function emitEvent(eventType, payload) {
  const results = [];

  for (const [pluginId, instance] of _plugins.entries()) {
    if (instance.status !== 'active') continue;

    const subscribes = instance.manifest.events.includes(eventType);
    const hasHandler = typeof instance.module.onEvent === 'function';

    if (!subscribes && !hasHandler) continue;
    if (!subscribes) continue; // only call if manifest declares the event

    try {
      const result = hasHandler
        ? await instance.module.onEvent(eventType, payload || {})
        : undefined;
      results.push({ pluginId, result: result !== undefined ? result : null, error: null });
    } catch (err) {
      results.push({ pluginId, result: null, error: err.message });
      console.error('[plugin-system] onEvent error in', pluginId, '-', err.message);
    }
  }

  return results;
}

// ── Tool Call Dispatch ────────────────────────────────────────────────

/**
 * Dispatch a tool call to plugins that handle it.
 * @param {string} toolName
 * @param {object} [args]
 * @returns {Promise<Array<{ pluginId: string, result: any, error: string|null }>>}
 */
async function dispatchToolCall(toolName, args) {
  const results = [];

  for (const [pluginId, instance] of _plugins.entries()) {
    if (instance.status !== 'active') continue;
    if (!instance.manifest.tools.includes(toolName)) continue;
    if (typeof instance.module.onToolCall !== 'function') continue;

    try {
      const result = await instance.module.onToolCall(toolName, args || {});
      results.push({ pluginId, result: result !== undefined ? result : null, error: null });
    } catch (err) {
      results.push({ pluginId, result: null, error: err.message });
    }
  }

  return results;
}

// ── Plugin Queries ────────────────────────────────────────────────────

/**
 * @param {string} pluginId
 * @returns {object|null}
 */
function getPlugin(pluginId) {
  return _plugins.get(pluginId) || null;
}

/**
 * @returns {Array<{ id: string, name: string, version: string, status: string, events: string[] }>}
 */
function getAllPlugins() {
  return [..._plugins.entries()].map(([id, instance]) => ({
    id,
    name: instance.manifest.name,
    version: instance.manifest.version,
    status: instance.status,
    events: instance.manifest.events,
  }));
}

/**
 * Unload a plugin — calls shutdown() if defined.
 * @param {string} pluginId
 * @returns {Promise<boolean>}
 */
async function unloadPlugin(pluginId) {
  const instance = _plugins.get(pluginId);
  if (!instance) return false;

  if (typeof instance.module.shutdown === 'function') {
    try {
      await instance.module.shutdown();
    } catch (err) {
      console.error('[plugin-system] shutdown() error for', pluginId, '-', err.message);
    }
  }

  _plugins.delete(pluginId);
  console.log('[plugin-system] Unloaded plugin:', pluginId);
  return true;
}

// ── Per-Plugin State ──────────────────────────────────────────────────

/**
 * @param {string} pluginId
 * @param {string} key
 * @returns {any}
 */
function getPluginState(pluginId, key) {
  const instance = _plugins.get(pluginId);
  if (!instance) return undefined;
  return instance.state.get(key);
}

/**
 * @param {string} pluginId
 * @param {string} key
 * @param {any} value
 */
function setPluginState(pluginId, key, value) {
  const instance = _plugins.get(pluginId);
  if (!instance) return;
  instance.state.set(key, value);
}

module.exports = {
  loadPlugins,
  emitEvent,
  dispatchToolCall,
  getPlugin,
  getAllPlugins,
  unloadPlugin,
  getPluginState,
  setPluginState,
  EVENT_TYPES,
};
