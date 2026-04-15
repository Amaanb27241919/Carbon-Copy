/**
 * VM Manager Client — Carbon Core v2
 *
 * Wraps the kvm-manager service and exposes it to the AI layer.
 * ARIA and orchestrator agents can provision, start, stop, and
 * run workloads inside VMs via this client.
 *
 * AI capabilities:
 * - Provision a VM with a given OS + resources
 * - Start/stop/delete VMs
 * - Run a shell command inside a VM via SSH
 * - Deploy a project into a VM
 * - Assign a VM to an AI agent for sandboxed execution
 */

const { logSystemAction, logAgentAction, ActionTypes } = require('./audit-v2.js');
const { execSync } = require('child_process');

const KVM_URL = process.env.KVM_MANAGER_URL || 'http://localhost:3004';
const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'internal-service-token';
const HOST_IP = process.env.HOST_IP || '127.0.0.1';

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${SERVICE_TOKEN}`,
});

// ── VM CRUD ─────────────────────────────────────────────────────────

/**
 * List all VMs.
 */
async function listVMs() {
  const res = await fetch(`${KVM_URL}/vms`, { headers: headers() });
  if (!res.ok) throw new Error(`listVMs failed: ${res.status}`);
  return res.json();
}

/**
 * Get a single VM by ID.
 */
async function getVM(vmId) {
  const res = await fetch(`${KVM_URL}/vms/${vmId}`, { headers: headers() });
  if (!res.ok) throw new Error(`getVM failed: ${res.status}`);
  return res.json();
}

/**
 * Create a new VM.
 * @param {object} spec
 * @param {string} spec.name - Alphanumeric name
 * @param {string} spec.os - OS preset key (ubuntu-22, debian-12, alpine-3, etc.)
 * @param {number} [spec.ram_mb] - RAM in MB (default: preset default)
 * @param {number} [spec.cpus] - CPU count (default: preset default)
 * @param {number} [spec.disk_gb] - Disk in GB (default: preset default)
 * @param {string} [spec.description] - Optional description
 * @param {string} [spec.agentId] - AI agent requesting this VM
 */
async function createVM(spec, agentId = 'system') {
  const res = await fetch(`${KVM_URL}/vms`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(spec),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`createVM failed ${res.status}: ${err.slice(0, 200)}`);
  }

  const vm = await res.json();
  logAgentAction(ActionTypes.TASK_CREATED, 'vm', vm.id, {
    name: vm.name, os: vm.os, ram_mb: vm.ram_mb, cpus: vm.cpus,
  }, agentId);

  return vm;
}

/**
 * Start a VM (boot it up).
 * @param {string} vmId
 * @param {boolean} bootFromIso - Boot from install ISO (for fresh installs)
 */
async function startVM(vmId, bootFromIso = false) {
  const res = await fetch(`${KVM_URL}/vms/${vmId}/start`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ boot_iso: bootFromIso }),
  });

  if (!res.ok) throw new Error(`startVM failed: ${res.status}`);
  logSystemAction(ActionTypes.AGENT_STARTED, 'vm', vmId, { boot_from_iso: bootFromIso });
  return res.json();
}

/**
 * Stop a VM (graceful or forced).
 */
async function stopVM(vmId, force = false) {
  const res = await fetch(`${KVM_URL}/vms/${vmId}/stop`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ force }),
  });

  if (!res.ok) throw new Error(`stopVM failed: ${res.status}`);
  logSystemAction(ActionTypes.AGENT_PAUSED, 'vm', vmId, { force });
  return res.json();
}

/**
 * Delete a VM (stops and removes disk).
 */
async function deleteVM(vmId) {
  const res = await fetch(`${KVM_URL}/vms/${vmId}`, {
    method: 'DELETE',
    headers: headers(),
  });

  if (!res.ok) throw new Error(`deleteVM failed: ${res.status}`);
  logSystemAction(ActionTypes.AGENT_DELETED, 'vm', vmId, {});
  return res.json();
}

/**
 * List available OS presets for VM creation.
 */
async function getVMPresets() {
  const res = await fetch(`${KVM_URL}/vms/presets`, { headers: headers() });
  if (!res.ok) throw new Error(`getVMPresets failed: ${res.status}`);
  return res.json();
}

// ── AI-Specific VM Operations ────────────────────────────────────────

/**
 * Provision a ready-to-use VM for an AI agent.
 * Creates the VM and starts it in one call.
 *
 * @param {object} spec - VM spec (name, os, ram_mb, cpus, disk_gb)
 * @param {string} agentId - Agent requesting the VM
 * @returns VM details including SSH connection info
 */
async function provisionAgentVM(spec, agentId = 'system') {
  console.log(`[vm] Provisioning VM for agent ${agentId}: ${spec.name} (${spec.os})`);

  const vm = await createVM({ ...spec, description: `AI agent: ${agentId}` }, agentId);
  await startVM(vm.id, false);

  logAgentAction(ActionTypes.TASK_CREATED, 'agent_vm', vm.id, {
    agent: agentId, name: vm.name, os: vm.os,
  }, agentId);

  return {
    ...vm,
    ssh_command: `ssh user@${HOST_IP} -p ${vm.ssh_port}`,
    vnc_url: `http://localhost:8080/vnc/${vm.id}`,
    status: 'starting',
    note: 'VM is booting. SSH available in ~30-60 seconds.',
  };
}

/**
 * Run a shell command on a VM via SSH.
 * Requires the VM to be running and SSH to be available.
 *
 * @param {string} vmId - VM ID
 * @param {string} command - Shell command to run
 * @param {string} agentId - Agent running the command
 * @param {number} timeout - Timeout in ms (default 30s)
 */
async function runOnVM(vmId, command, agentId = 'system', timeout = 30000) {
  const vm = await getVM(vmId);
  if (!vm.running) throw new Error(`VM ${vmId} is not running`);

  const sshPort = vm.ssh_port;
  const sshCmd = `ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 -p ${sshPort} user@${HOST_IP} ${JSON.stringify(command)}`;

  logAgentAction(ActionTypes.TASK_CREATED, 'vm_command', vmId, {
    command: command.slice(0, 200), agent: agentId,
  }, agentId);

  try {
    const output = execSync(sshCmd, { timeout, encoding: 'utf-8' });
    logAgentAction(ActionTypes.TASK_COMPLETED, 'vm_command', vmId, {
      command: command.slice(0, 100), success: true,
    }, agentId);
    return { success: true, output: output.trim() };
  } catch (e) {
    logAgentAction(ActionTypes.TASK_FAILED, 'vm_command', vmId, {
      command: command.slice(0, 100), error: e.message.slice(0, 200),
    }, agentId);
    return { success: false, error: e.message.slice(0, 500), output: e.stdout?.toString() || '' };
  }
}

/**
 * Deploy a project into a VM.
 * Clones a git repo, installs deps, and starts the service.
 *
 * @param {string} vmId - VM ID
 * @param {object} project
 * @param {string} project.repo - Git URL to clone
 * @param {string} project.branch - Branch to checkout (default: main)
 * @param {string} project.install - Install command (default: npm install)
 * @param {string} project.start - Start command (default: npm start)
 * @param {string} agentId - Agent deploying
 */
async function deployToVM(vmId, project, agentId = 'system') {
  const { repo, branch = 'main', install = 'npm install', start = 'npm start' } = project;

  console.log(`[vm] Deploying ${repo} to VM ${vmId}`);

  const steps = [
    `git clone --branch ${branch} ${repo} ~/app`,
    `cd ~/app && ${install}`,
    `cd ~/app && nohup ${start} > ~/app.log 2>&1 &`,
  ];

  const results = [];
  for (const cmd of steps) {
    const result = await runOnVM(vmId, cmd, agentId, 120000);
    results.push({ command: cmd, ...result });
    if (!result.success) break;
  }

  const success = results.every(r => r.success);
  logAgentAction(success ? ActionTypes.TASK_COMPLETED : ActionTypes.TASK_FAILED, 'vm_deploy', vmId, {
    repo, branch, success,
  }, agentId);

  return { success, steps: results, vmId };
}

/**
 * Get AI-readable status summary of all VMs.
 * Useful for ARIA agents to understand infrastructure state.
 */
async function getVMStatusSummary() {
  try {
    const { vms, kvm_available } = await listVMs();
    return {
      kvm_available,
      total: vms.length,
      running: vms.filter(v => v.running).length,
      stopped: vms.filter(v => v.status === 'stopped').length,
      vms: vms.map(v => ({
        id: v.id,
        name: v.name,
        os: v.os_display || v.os,
        running: v.running,
        ram_mb: v.ram_mb,
        cpus: v.cpus,
        ssh_port: v.ssh_port,
      })),
    };
  } catch {
    return { kvm_available: false, total: 0, running: 0, stopped: 0, vms: [], error: 'KVM manager unavailable' };
  }
}


module.exports = {
  listVMs,
  getVM,
  createVM,
  startVM,
  stopVM,
  deleteVM,
  getVMPresets,
  provisionAgentVM,
  runOnVM,
  deployToVM,
  getVMStatusSummary,
};
