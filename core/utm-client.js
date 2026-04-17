'use strict';

/**
 * UTM Client — Carbon Core
 * Wraps UTM REST API for Apple Silicon VM management.
 * UTM uses Apple Virtualization Framework — runs macOS, Windows ARM, Linux natively.
 *
 * Enable in UTM: Settings → Server → Enable (port 8080)
 */

const UTM_URL = process.env.UTM_API_URL || 'http://localhost:8080/api';
const TIMEOUT_MS = 3000;

// ── Base request ────────────────────────────────────────────────────

async function utmRequest(method, path, body) {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const res = await fetch(`${UTM_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return null;
  }
}

// ── Status helpers ──────────────────────────────────────────────────

function mapUTMStatus(status) {
  const map = { started: 'running', stopped: 'stopped', starting: 'starting', stopping: 'stopping', paused: 'stopped' };
  return map[status] || 'stopped';
}

function detectOSDisplay(vm) {
  const name = (vm.name || '').toLowerCase();
  if (name.includes('macos') || name.includes('mac os') || name.includes('sonoma') || name.includes('ventura') || name.includes('monterey')) return 'macOS';
  if (name.includes('windows') || name.includes('win11') || name.includes('win10')) return 'Windows';
  if (name.includes('ubuntu')) return 'Ubuntu';
  if (name.includes('debian')) return 'Debian';
  if (name.includes('alpine')) return 'Alpine';
  if (name.includes('fedora')) return 'Fedora';
  return vm.configuration?.operatingSystem || 'Linux';
}

function mapToVMShape(vm) {
  return {
    id: vm.uuid || vm.id,
    name: vm.name,
    provider: 'utm',
    os: vm.configuration?.operatingSystem || 'linux',
    os_display: detectOSDisplay(vm),
    status: mapUTMStatus(vm.status),
    running: vm.status === 'started',
    cpus: vm.configuration?.cpu?.cpuCount || 0,
    ram_mb: Math.round((vm.configuration?.memory?.memorySize || 0) / 1024 / 1024),
    disk_gb: 0,
    ssh_port: null,
    vnc_url: null,
    screenshot_url: `${UTM_URL}/vms/${vm.uuid || vm.id}/screenshot`,
    platform: 'apple-silicon',
  };
}

// ── Public API ──────────────────────────────────────────────────────

async function isUTMAvailable() {
  const result = await utmRequest('GET', '/vms');
  return Array.isArray(result);
}

async function listUTMVMs() {
  const result = await utmRequest('GET', '/vms');
  if (!Array.isArray(result)) return [];
  return result.map(mapToVMShape);
}

async function getUTMStatus() {
  const vms = await utmRequest('GET', '/vms');
  if (!Array.isArray(vms)) return { available: false, vm_count: 0 };
  return { available: true, vm_count: vms.length };
}

async function startUTMVM(uuid) {
  return utmRequest('POST', `/vms/${uuid}/start`);
}

async function stopUTMVM(uuid, force = false) {
  return utmRequest('POST', `/vms/${uuid}/stop`, { force });
}

async function deleteUTMVM(uuid) {
  return utmRequest('DELETE', `/vms/${uuid}`);
}

async function getUTMVMScreenshot(uuid) {
  return `${UTM_URL}/vms/${uuid}/screenshot`;
}

async function createUTMVM(spec) {
  // Map our spec to UTM create format
  const osMap = {
    'macos-sonoma': { backend: 'apple', operatingSystem: 'macOS' },
    'windows-11-arm': { backend: 'apple', operatingSystem: 'windows' },
    'ubuntu-24-arm': { backend: 'apple', operatingSystem: 'linux' },
    'linux-generic': { backend: 'qemu', operatingSystem: 'linux' },
  };
  const osConfig = osMap[spec.os] || osMap['linux-generic'];
  return utmRequest('POST', '/vms', {
    name: spec.name,
    backend: osConfig.backend,
    operatingSystem: osConfig.operatingSystem,
    cpuCount: spec.cpus || 2,
    memorySize: (spec.ram_mb || 4096) * 1024 * 1024,
    diskSize: (spec.disk_gb || 64) * 1024 * 1024 * 1024,
  });
}

module.exports = {
  isUTMAvailable,
  listUTMVMs,
  getUTMStatus,
  startUTMVM,
  stopUTMVM,
  deleteUTMVM,
  getUTMVMScreenshot,
  createUTMVM,
};
