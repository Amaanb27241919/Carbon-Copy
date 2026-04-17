'use strict';

/**
 * UTM Client — Carbon Core
 * Controls UTM VMs via `utmctl` CLI (bundled inside UTM.app).
 * No REST API needed — utmctl is the official CLI interface.
 *
 * utmctl path: /Applications/UTM.app/Contents/MacOS/utmctl
 */

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const UTMCTL = '/Applications/UTM.app/Contents/MacOS/utmctl';
const TIMEOUT_MS = 10000;

// ── Base runner ─────────────────────────────────────────────────────

async function utmctl(...args) {
  try {
    const { stdout } = await execFileAsync(UTMCTL, args, { timeout: TIMEOUT_MS });
    return stdout.trim();
  } catch (e) {
    // UTM not installed or not running
    return null;
  }
}

// ── Availability ─────────────────────────────────────────────────────

async function isUTMAvailable() {
  const result = await utmctl('version');
  return result !== null;
}

// ── List VMs ─────────────────────────────────────────────────────────

async function listUTMVMs() {
  const output = await utmctl('list');
  if (!output) return [];

  const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('UUID'));
  return lines.map(line => {
    // Format: UUID   Status   Name
    const parts = line.trim().split(/\s+/);
    const uuid = parts[0];
    const status = parts[1]?.toLowerCase() || 'stopped';
    const name = parts.slice(2).join(' ');
    return mapVM({ uuid, status, name });
  }).filter(v => v.id);
}

function mapVM({ uuid, status, name }) {
  return {
    id: uuid,
    name: name || uuid,
    provider: 'utm',
    os: detectOS(name),
    os_display: detectOSDisplay(name),
    status: mapStatus(status),
    running: status === 'started' || status === 'running',
    cpus: 0,       // utmctl list doesn't show resources — get from status
    ram_mb: 0,
    disk_gb: 0,
    ssh_port: null,
    vnc_url: null,
    screenshot_url: null,
    platform: 'apple-silicon',
  };
}

function detectOS(name = '') {
  const n = name.toLowerCase();
  if (n.includes('macos') || n.includes('mac os') || n.includes('sonoma') || n.includes('ventura') || n.includes('monterey') || n.includes('sequoia')) return 'macos';
  if (n.includes('windows') || n.includes('win11') || n.includes('win10')) return 'windows';
  if (n.includes('ubuntu')) return 'ubuntu';
  if (n.includes('debian')) return 'debian';
  if (n.includes('alpine')) return 'alpine';
  if (n.includes('fedora')) return 'fedora';
  if (n.includes('arch')) return 'arch';
  return 'linux';
}

function detectOSDisplay(name = '') {
  const os = detectOS(name);
  const map = { macos: 'macOS', windows: 'Windows', ubuntu: 'Ubuntu', debian: 'Debian', alpine: 'Alpine', fedora: 'Fedora', arch: 'Arch', linux: 'Linux' };
  return map[os] || 'Linux';
}

function mapStatus(status = '') {
  const s = status.toLowerCase();
  if (s === 'started' || s === 'running') return 'running';
  if (s === 'starting') return 'starting';
  if (s === 'stopping' || s === 'suspending') return 'stopping';
  if (s === 'paused' || s === 'suspended') return 'stopped';
  return 'stopped';
}

// ── VM Lifecycle ──────────────────────────────────────────────────────

async function startUTMVM(uuid) {
  const result = await utmctl('start', uuid);
  return { success: result !== null, message: result || 'Failed to start VM' };
}

async function stopUTMVM(uuid, force = false) {
  const args = force ? ['stop', uuid, '--kill'] : ['stop', uuid];
  const result = await utmctl(...args);
  return { success: result !== null, message: result || 'Failed to stop VM' };
}

async function suspendUTMVM(uuid) {
  const result = await utmctl('suspend', uuid);
  return { success: result !== null };
}

async function deleteUTMVM(uuid) {
  const result = await utmctl('delete', uuid);
  return { success: result !== null };
}

async function cloneUTMVM(uuid, newName) {
  const args = newName ? ['clone', uuid, '--name', newName] : ['clone', uuid];
  const result = await utmctl(...args);
  return { success: result !== null, output: result };
}

async function getUTMVMStatus(uuid) {
  const output = await utmctl('status', uuid);
  if (!output) return null;
  // Parse: "Status: started" etc
  const statusMatch = output.match(/status:\s*(\w+)/i);
  return statusMatch ? mapStatus(statusMatch[1]) : 'unknown';
}

async function getUTMVMIPAddress(uuid) {
  const output = await utmctl('ip-address', uuid);
  if (!output) return null;
  const lines = output.split('\n').filter(l => l.trim());
  return lines[0] || null;
}

// ── Create VM ─────────────────────────────────────────────────────────
// utmctl doesn't support create — users create VMs in UTM UI
// We expose this as a message directing them to UTM

async function createUTMVM(spec) {
  return {
    success: false,
    manual: true,
    message: `Open UTM to create a new VM. Recommended: use UTM Gallery for one-click ${spec.os || 'Linux'} install.`,
    utm_gallery_url: 'https://mac.getutm.app/gallery/',
  };
}

// ── Exec on Guest ─────────────────────────────────────────────────────

async function execOnVM(uuid, command) {
  const result = await utmctl('exec', uuid, '--', ...command.split(' '));
  return { success: result !== null, output: result };
}

// ── Status Summary ────────────────────────────────────────────────────

async function getUTMStatus() {
  const available = await isUTMAvailable();
  if (!available) return { available: false, vm_count: 0 };
  const vms = await listUTMVMs();
  return {
    available: true,
    vm_count: vms.length,
    running: vms.filter(v => v.running).length,
    version: await utmctl('version'),
  };
}

module.exports = {
  isUTMAvailable,
  listUTMVMs,
  getUTMStatus,
  startUTMVM,
  stopUTMVM,
  suspendUTMVM,
  deleteUTMVM,
  cloneUTMVM,
  getUTMVMStatus,
  getUTMVMIPAddress,
  execOnVM,
  createUTMVM,
};
