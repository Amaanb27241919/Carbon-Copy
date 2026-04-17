/**
 * vision-tool.js — macOS screenshot + GUI automation for Carbon Core v4 agents
 *
 * Wraps steipete/Peekaboo CLI (MIT) to enable vision-capable agents to:
 * - Capture screenshots of the full screen or a specific app window
 * - List running application windows
 * - Return images as base64 strings for use with vision AI models
 *
 * Source: https://github.com/steipete/Peekaboo
 *
 * Requirements:
 *   - macOS 15+ (Sequoia)
 *   - peekaboo CLI installed:
 *       brew install steipete/tap/peekaboo
 *     OR via npx (no install):
 *       npx -y @steipete/peekaboo <args>
 *   - Screen Recording permission granted to terminal/agent process
 *
 * Usage:
 *   const { captureScreen, captureWindow, listWindows } = require('./vision-tool');
 *
 *   const img = await captureScreen();
 *   // img.base64 — ready for Claude/GPT vision API
 *   // img.width, img.height, img.path
 *
 *   const win = await captureWindow('Safari');
 *   const windows = await listWindows();
 */

'use strict';

const { execFile }   = require('child_process');
const { promisify }  = require('util');
const fs                 = require('fs');
const path               = require('path');
const os                 = require('os');

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Resolve peekaboo binary path
// ---------------------------------------------------------------------------

function resolvePeekaboo() {
  // Homebrew default locations
  for (const p of ['/opt/homebrew/bin/peekaboo', '/usr/local/bin/peekaboo']) {
    if (fs.existsSync(p)) return p;
  }
  // Fall back to npx (slower but works without install)
  return null;
}

async function runPeekaboo(args) {
  const bin = resolvePeekaboo();
  if (bin) {
    return execFileAsync(bin, args, { maxBuffer: 50 * 1024 * 1024 });
  }
  // Use npx as fallback — execFile prevents shell injection
  return execFileAsync('npx', ['-y', '@steipete/peekaboo', ...args], {
    maxBuffer: 50 * 1024 * 1024,
  });
}

// ---------------------------------------------------------------------------
// captureScreen — full screen capture
// ---------------------------------------------------------------------------

/**
 * Capture the full screen (or a specific display).
 *
 * @param {{ retina?: boolean, screenIndex?: number, savePath?: string }} [opts]
 * @returns {Promise<{ base64: string, mimeType: string, path: string, width: number, height: number }>}
 */
async function captureScreen(opts = {}) {
  const tmpPath = opts.savePath ?? path.join(os.tmpdir(), `peekaboo-screen-${Date.now()}.png`);
  const args = [
    'image',
    '--mode', 'screen',
    '--path', tmpPath,
  ];
  if (opts.retina)      args.push('--retina');
  if (opts.screenIndex != null) args.push('--screen-index', String(opts.screenIndex));

  await runPeekaboo(args);
  return _readImageResult(tmpPath, opts.savePath == null);
}

// ---------------------------------------------------------------------------
// captureWindow — capture a specific application window
// ---------------------------------------------------------------------------

/**
 * Capture a window belonging to the named app.
 *
 * @param {string} appName     - e.g. 'Safari', 'Terminal', 'Code'
 * @param {{ retina?: boolean, windowIndex?: number, savePath?: string }} [opts]
 * @returns {Promise<{ base64: string, mimeType: string, path: string, width: number, height: number }>}
 */
async function captureWindow(appName, opts = {}) {
  const tmpPath = opts.savePath ?? path.join(os.tmpdir(), `peekaboo-window-${Date.now()}.png`);
  const args = [
    'image',
    '--mode', 'window',
    '--app',  appName,
    '--path', tmpPath,
  ];
  if (opts.retina)                    args.push('--retina');
  if (opts.windowIndex != null)       args.push('--window-index', String(opts.windowIndex));

  await runPeekaboo(args);
  return _readImageResult(tmpPath, opts.savePath == null);
}

// ---------------------------------------------------------------------------
// listWindows — enumerate open application windows
// ---------------------------------------------------------------------------

/**
 * List open application windows.
 *
 * @returns {Promise<Array<{ app: string, title: string, windowId: number }>>}
 */
async function listWindows() {
  const args = ['list', 'windows', '--json'];
  let stdout;
  try {
    const result = await runPeekaboo(args);
    stdout = result.stdout ?? result;
  } catch (err) {
    throw new Error(`peekaboo list windows failed: ${err.message}`);
  }
  try {
    const parsed = JSON.parse(stdout);
    // Peekaboo v3 returns { data: { windows: [...] } } or { windows: [...] }
    return parsed?.data?.windows ?? parsed?.windows ?? parsed ?? [];
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// listApps — enumerate running applications
// ---------------------------------------------------------------------------

/**
 * List running applications visible to peekaboo.
 *
 * @returns {Promise<Array<{ name: string, bundleId: string, pid: number }>>}
 */
async function listApps() {
  const args = ['list', 'apps', '--json'];
  let stdout;
  try {
    const result = await runPeekaboo(args);
    stdout = result.stdout ?? result;
  } catch (err) {
    throw new Error(`peekaboo list apps failed: ${err.message}`);
  }
  try {
    const parsed = JSON.parse(stdout);
    return parsed?.data?.apps ?? parsed?.apps ?? parsed ?? [];
  } catch (_) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function _readImageResult(filePath, cleanup) {
  const data = fs.readFileSync(filePath);
  const base64 = data.toString('base64');

  // Simple width/height via sips (macOS built-in) — execFile, no shell injection
  let width = 0;
  let height = 0;
  try {
    const { stdout } = await execFileAsync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', filePath]);
    const wm = stdout.match(/pixelWidth:\s*(\d+)/);
    const hm = stdout.match(/pixelHeight:\s*(\d+)/);
    if (wm) width  = parseInt(wm[1], 10);
    if (hm) height = parseInt(hm[1], 10);
  } catch (_) {}

  if (cleanup) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }

  return { base64, mimeType: 'image/png', path: filePath, width, height };
}

module.exports = { captureScreen, captureWindow, listWindows, listApps };
