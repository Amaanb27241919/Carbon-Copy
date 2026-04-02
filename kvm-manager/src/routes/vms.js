'use strict';

const express = require('express');
const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const { query } = require('../services/db');
const qemu = require('../services/qemu');

const router = express.Router();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'kvm-manager' },
  transports: [new winston.transports.Console()],
});

const CreateVmSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-zA-Z0-9-_]+$/, 'Name must be alphanumeric with - or _'),
  os: z.enum(Object.keys(qemu.OS_PRESETS)),
  ram_mb: z.number().int().min(256).max(32768).optional(),
  cpus: z.number().int().min(1).max(16).optional(),
  disk_gb: z.number().int().min(4).max(500).optional(),
  description: z.string().max(255).optional(),
});

// ── GET /vms — list all VMs ───────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const result = await query(
      `SELECT id, name, os, status, ram_mb, cpus, disk_gb, ssh_port, vnc_display,
              description, kvm_enabled, created_at, started_at
       FROM virtual_machines WHERE status != 'deleted'
       ORDER BY created_at DESC`
    );

    // Annotate live running status
    const vms = result.rows.map(vm => ({
      ...vm,
      running: vm.status === 'running' ? qemu.isVmRunning(vm.id) : false,
      ssh_command: `ssh user@${process.env.HOST_IP || 'YOUR_HOST_IP'} -p ${vm.ssh_port}`,
      vnc_url: `/console/${vm.id}`,
      os_display: qemu.OS_PRESETS[vm.os]?.display || vm.os,
    }));

    return res.json({ vms, kvm_available: qemu.kvmAvailable() });
  } catch (err) {
    logger.error('GET /vms error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /vms/presets — list available OS presets ─────────────────────────────
router.get('/presets', (_req, res) => {
  const presets = Object.entries(qemu.OS_PRESETS).map(([key, val]) => ({
    key,
    display: val.display,
    defaultRam: val.defaultRam,
    defaultCpus: val.defaultCpus,
    defaultDiskGb: val.defaultDiskGb,
  }));
  return res.json({ presets, kvm_available: qemu.kvmAvailable() });
});

// ── GET /vms/:id — get single VM ─────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM virtual_machines WHERE id = $1 AND status != 'deleted'`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'VM not found' });

    const vm = result.rows[0];
    return res.json({
      ...vm,
      running: qemu.isVmRunning(vm.id),
      ssh_command: `ssh user@${process.env.HOST_IP || 'YOUR_HOST_IP'} -p ${vm.ssh_port}`,
      vnc_url: `/console/${vm.id}`,
      os_display: qemu.OS_PRESETS[vm.os]?.display || vm.os,
      kvm_available: qemu.kvmAvailable(),
    });
  } catch (err) {
    logger.error('GET /vms/:id error', { error: err.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /vms — create a new VM ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  const parsed = CreateVmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Bad request', details: parsed.error.flatten() });
  }

  const { name, os, description } = parsed.data;
  const preset = qemu.OS_PRESETS[os];
  const ram_mb  = parsed.data.ram_mb  || preset.defaultRam;
  const cpus    = parsed.data.cpus    || preset.defaultCpus;
  const disk_gb = parsed.data.disk_gb || preset.defaultDiskGb;

  try {
    // Allocate slot
    const vmIndex = await qemu.findFreeIndex({ query });
    const sshPort = qemu.allocatePort(vmIndex, qemu.SSH_PORT_START);
    const vncDisplay = vmIndex; // QEMU VNC display :0 = port 5900, :1 = 5901, etc.

    const vmId = uuidv4();

    // Create disk image
    await qemu.createDiskImage(vmId, disk_gb);

    // Persist to DB
    await query(
      `INSERT INTO virtual_machines
         (id, name, os, ram_mb, cpus, disk_gb, ssh_port, vnc_display, description, vm_index, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'stopped')`,
      [vmId, name, os, ram_mb, cpus, disk_gb, sshPort, vncDisplay, description || null, vmIndex]
    );

    logger.info('VM created', { vmId, name, os, ram_mb, cpus, disk_gb, sshPort });

    return res.status(201).json({
      id: vmId,
      name,
      os,
      os_display: preset.display,
      ram_mb,
      cpus,
      disk_gb,
      ssh_port: sshPort,
      vnc_display: vncDisplay,
      status: 'stopped',
      message: 'VM created. Use POST /vms/:id/start to boot it.',
      ssh_command: `ssh user@${process.env.HOST_IP || 'YOUR_HOST_IP'} -p ${sshPort}`,
      vnc_url: `/console/${vmId}`,
    });
  } catch (err) {
    logger.error('POST /vms error', { error: err.message });
    if (err.message.includes('Maximum VM limit')) {
      return res.status(429).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

// ── POST /vms/:id/start — start (boot) a VM ──────────────────────────────────
router.post('/:id/start', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM virtual_machines WHERE id = $1 AND status != 'deleted'`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'VM not found' });

    const vm = result.rows[0];
    if (qemu.isVmRunning(vm.id)) {
      return res.status(409).json({ error: 'VM is already running' });
    }

    const diskPath = `${qemu.VM_IMAGES_DIR}/${vm.id}.qcow2`;
    const bootFromIso = req.body.boot_iso === true;
    let isoPath = null;

    if (bootFromIso) {
      isoPath = await qemu.ensureIso(vm.os);
    }

    const { useKvm } = await qemu.startVm({
      vmId: vm.id,
      diskPath,
      isoPath,
      ram: vm.ram_mb,
      cpus: vm.cpus,
      sshPort: vm.ssh_port,
      vncDisplay: vm.vnc_display,
      bootFromIso,
    });

    await query(
      `UPDATE virtual_machines SET status='running', kvm_enabled=$1, started_at=NOW() WHERE id=$2`,
      [useKvm, vm.id]
    );

    logger.info('VM started', { vmId: vm.id, name: vm.name, useKvm, bootFromIso });

    return res.json({
      message: `VM "${vm.name}" started`,
      kvm_enabled: useKvm,
      boot_from_iso: bootFromIso,
      ssh_command: `ssh user@${process.env.HOST_IP || 'YOUR_HOST_IP'} -p ${vm.ssh_port}`,
      vnc_url: `/console/${vm.id}`,
      note: bootFromIso
        ? 'Booting from ISO for installation. SSH will be available after OS installation completes.'
        : 'SSH available once the OS has fully booted (may take 30-60 seconds).',
    });
  } catch (err) {
    logger.error('start VM error', { id: req.params.id, error: err.message });
    return res.status(500).json({ error: 'Failed to start VM', message: err.message });
  }
});

// ── POST /vms/:id/stop — graceful shutdown ────────────────────────────────────
router.post('/:id/stop', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM virtual_machines WHERE id = $1 AND status != 'deleted'`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'VM not found' });

    const vm = result.rows[0];
    const force = req.body.force === true;

    await qemu.stopVm(vm.id, force);
    await query(`UPDATE virtual_machines SET status='stopped', started_at=NULL WHERE id=$1`, [vm.id]);

    logger.info('VM stopped', { vmId: vm.id, name: vm.name, force });
    return res.json({ message: `VM "${vm.name}" stopped`, force });
  } catch (err) {
    logger.error('stop VM error', { id: req.params.id, error: err.message });
    return res.status(500).json({ error: 'Failed to stop VM', message: err.message });
  }
});

// ── DELETE /vms/:id — stop and delete VM + disk ───────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM virtual_machines WHERE id = $1 AND status != 'deleted'`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'VM not found' });

    const vm = result.rows[0];

    // Force stop if running
    await qemu.stopVm(vm.id, true);
    qemu.deleteDisk(vm.id);

    await query(`UPDATE virtual_machines SET status='deleted' WHERE id=$1`, [vm.id]);

    logger.info('VM deleted', { vmId: vm.id, name: vm.name });
    return res.json({ message: `VM "${vm.name}" deleted` });
  } catch (err) {
    logger.error('delete VM error', { id: req.params.id, error: err.message });
    return res.status(500).json({ error: 'Failed to delete VM', message: err.message });
  }
});

module.exports = router;
