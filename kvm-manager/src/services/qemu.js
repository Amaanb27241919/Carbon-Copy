'use strict';

const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);

const VM_IMAGES_DIR = process.env.VM_IMAGES_DIR || '/var/lib/carbon-vms';
const SSH_PORT_START = parseInt(process.env.VM_SSH_PORT_START || '2200', 10);
const VNC_PORT_START = parseInt(process.env.VM_VNC_PORT_START || '5900', 10);
const MAX_VMS = parseInt(process.env.VM_MAX_COUNT || '10', 10);

// ── Supported OS presets ──────────────────────────────────────────────────────
const OS_PRESETS = {
  'ubuntu-22.04': {
    display: 'Ubuntu 22.04 LTS',
    isoUrl: 'https://releases.ubuntu.com/22.04/ubuntu-22.04.5-live-server-amd64.iso',
    defaultRam: 2048,
    defaultCpus: 2,
    defaultDiskGb: 20,
  },
  'ubuntu-24.04': {
    display: 'Ubuntu 24.04 LTS',
    isoUrl: 'https://releases.ubuntu.com/24.04/ubuntu-24.04.1-live-server-amd64.iso',
    defaultRam: 2048,
    defaultCpus: 2,
    defaultDiskGb: 20,
  },
  'alpine-3.19': {
    display: 'Alpine Linux 3.19',
    isoUrl: 'https://dl-cdn.alpinelinux.org/alpine/v3.19/releases/x86_64/alpine-standard-3.19.1-x86_64.iso',
    defaultRam: 512,
    defaultCpus: 1,
    defaultDiskGb: 8,
  },
  'debian-12': {
    display: 'Debian 12 Bookworm',
    isoUrl: 'https://cdimage.debian.org/debian-cd/current/amd64/iso-cd/debian-12.7.0-amd64-netinst.iso',
    defaultRam: 1024,
    defaultCpus: 2,
    defaultDiskGb: 20,
  },
};

// ── KVM availability check ────────────────────────────────────────────────────
const kvmAvailable = () => fs.existsSync('/dev/kvm');

// ── Port allocation ───────────────────────────────────────────────────────────
const allocatePort = (index, base) => base + index;

const findFreeIndex = async (db) => {
  const result = await db.query(
    `SELECT vm_index FROM virtual_machines WHERE status != 'deleted' ORDER BY vm_index`
  );
  const used = new Set(result.rows.map(r => r.vm_index));
  for (let i = 0; i < MAX_VMS; i++) {
    if (!used.has(i)) return i;
  }
  throw new Error(`Maximum VM limit (${MAX_VMS}) reached`);
};

// ── Create VM disk image ──────────────────────────────────────────────────────
const createDiskImage = async (vmId, sizeGb) => {
  const imgPath = path.join(VM_IMAGES_DIR, `${vmId}.qcow2`);
  await execFileAsync('qemu-img', ['create', '-f', 'qcow2', imgPath, `${sizeGb}G`]);
  return imgPath;
};

// ── Download ISO (if not already cached) ─────────────────────────────────────
const ensureIso = async (osPreset) => {
  const preset = OS_PRESETS[osPreset];
  if (!preset) throw new Error(`Unknown OS preset: ${osPreset}`);

  const isoName = path.basename(preset.isoUrl);
  const isoPath = path.join(VM_IMAGES_DIR, 'isos', isoName);

  if (!fs.existsSync(path.join(VM_IMAGES_DIR, 'isos'))) {
    fs.mkdirSync(path.join(VM_IMAGES_DIR, 'isos'), { recursive: true });
  }

  if (!fs.existsSync(isoPath)) {
    console.log(JSON.stringify({
      level: 'info', service: 'kvm-manager',
      message: `Downloading ISO: ${isoName}`,
      url: preset.isoUrl,
      timestamp: new Date().toISOString(),
    }));
    await execFileAsync('wget', ['-q', '-O', isoPath, preset.isoUrl], { timeout: 600000 });
  }

  return isoPath;
};

// ── Build QEMU command ────────────────────────────────────────────────────────
const buildQemuArgs = ({ vmId, diskPath, isoPath, ram, cpus, sshPort, vncDisplay, useKvm, bootFromIso }) => {
  const args = [
    '-name', `carbon-vm-${vmId}`,
    '-m', `${ram}M`,
    '-smp', `${cpus}`,
    '-drive', `file=${diskPath},format=qcow2,if=virtio`,
    '-netdev', `user,id=net0,hostfwd=tcp::${sshPort}-:22`,
    '-device', 'virtio-net-pci,netdev=net0',
    '-vnc', `:${vncDisplay}`,
    '-pidfile', path.join(VM_IMAGES_DIR, `${vmId}.pid`),
    '-daemonize',
    '-no-reboot',
  ];

  if (useKvm) {
    args.unshift('-enable-kvm');
    args.push('-cpu', 'host');
  } else {
    args.push('-cpu', 'qemu64');
  }

  if (bootFromIso && isoPath) {
    args.push('-cdrom', isoPath, '-boot', 'order=dc');
  } else {
    args.push('-boot', 'order=c');
  }

  return args;
};

// ── Start a VM ────────────────────────────────────────────────────────────────
const startVm = async ({ vmId, diskPath, isoPath, ram, cpus, sshPort, vncDisplay, bootFromIso = false }) => {
  const useKvm = kvmAvailable();
  const args = buildQemuArgs({ vmId, diskPath, isoPath, ram, cpus, sshPort, vncDisplay, useKvm, bootFromIso });

  await execFileAsync('qemu-system-x86_64', args, { timeout: 30000 });

  // Give QEMU a moment to write the PID file
  await new Promise(r => setTimeout(r, 1000));

  const pidFile = path.join(VM_IMAGES_DIR, `${vmId}.pid`);
  if (!fs.existsSync(pidFile)) {
    throw new Error('QEMU failed to start — PID file not created');
  }

  return { useKvm };
};

// ── Stop a VM ─────────────────────────────────────────────────────────────────
const stopVm = async (vmId, force = false) => {
  const pidFile = path.join(VM_IMAGES_DIR, `${vmId}.pid`);
  if (!fs.existsSync(pidFile)) return;

  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  if (isNaN(pid)) return;

  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch (err) {
    if (err.code !== 'ESRCH') throw err; // ESRCH = no such process (already stopped)
  }

  // Clean up PID file
  try { fs.unlinkSync(pidFile); } catch (_) {}
};

// ── Delete VM disk image ──────────────────────────────────────────────────────
const deleteDisk = (vmId) => {
  const imgPath = path.join(VM_IMAGES_DIR, `${vmId}.qcow2`);
  try { fs.unlinkSync(imgPath); } catch (_) {}
};

// ── Check if VM process is running ───────────────────────────────────────────
const isVmRunning = (vmId) => {
  const pidFile = path.join(VM_IMAGES_DIR, `${vmId}.pid`);
  if (!fs.existsSync(pidFile)) return false;
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  if (isNaN(pid)) return false;
  try {
    process.kill(pid, 0); // Signal 0 = existence check, no signal sent
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = {
  OS_PRESETS,
  kvmAvailable,
  allocatePort,
  findFreeIndex,
  createDiskImage,
  ensureIso,
  startVm,
  stopVm,
  deleteDisk,
  isVmRunning,
  SSH_PORT_START,
  VNC_PORT_START,
  VM_IMAGES_DIR,
};
