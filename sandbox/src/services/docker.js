'use strict';

const path = require('path');
const fs = require('fs');
const { rimraf } = require('rimraf');
const Dockerode = require('dockerode');

const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const docker = new Dockerode({ socketPath: DOCKER_SOCKET });

// Track active timeout handles so we can clear them on stop
const runTimers = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pull a Docker image if it is not already present locally.
 * @param {string} image
 * @returns {Promise<void>}
 */
const ensureImage = async (image) => {
  try {
    await docker.getImage(image).inspect();
  } catch (_) {
    // Image not found locally — pull it
    await new Promise((resolve, reject) => {
      docker.pull(image, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (pullErr) => {
          if (pullErr) return reject(pullErr);
          resolve();
        });
      });
    });
  }
};

/**
 * Build a Docker image from a Dockerfile in the given directory.
 * @param {string} contextPath - Directory containing Dockerfile
 * @param {string} tag         - Image tag to apply
 * @returns {Promise<void>}
 */
const buildImage = async (contextPath, tag) => {
  const stream = await docker.buildImage(
    { context: contextPath, src: ['.'] },
    { t: tag, rm: true, forcerm: true }
  );
  await new Promise((resolve, reject) => {
    docker.modem.followProgress(stream, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
};

/**
 * Strip Docker stream multiplexing headers and return clean text.
 * @param {Buffer|string} raw
 * @returns {string[]}
 */
const demuxLogs = (raw) => {
  const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
  const lines = [];
  let offset = 0;
  while (offset + 8 <= buf.length) {
    const size = buf.readUInt32BE(offset + 4);
    offset += 8;
    if (size > 0 && offset + size <= buf.length) {
      lines.push(buf.slice(offset, offset + size).toString('utf8'));
    }
    offset += size;
  }
  // If demux produced nothing (pre-multiplexed), fall back to raw split
  if (lines.length === 0) {
    return buf.toString('utf8').split('\n').filter(Boolean);
  }
  return lines.join('').split('\n').filter(Boolean);
};

/**
 * Run a shell command inside a running container and wait for it to finish.
 * Returns stdout output as a string.
 * @param {import('dockerode').Container} container
 * @param {string[]} cmd
 * @returns {Promise<string>}
 */
const execInContainer = async (container, cmd) => {
  const exec = await container.exec({
    Cmd: ['sh', '-c', cmd.join(' && ')],
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });

  const stream = await exec.start({ hijack: true, stdin: false });

  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build and start an isolated sandbox container for a cloned project.
 *
 * Phase 1 (build) – container has network access to install dependencies.
 * Phase 2 (run)   – container is restarted with --network none.
 *
 * Because Docker doesn't allow changing network mode on a running container
 * without recreating it, we use a two-container approach:
 *   1. Start a builder container (with network) and run build commands inside it.
 *   2. Commit the builder image.
 *   3. Start the final runner container (network=none) from the committed image.
 *
 * @param {string} runId
 * @param {string} projectPath - Absolute path to cloned repo on the host
 * @param {import('./detector').DetectionResult} detection
 * @param {object} opts
 * @param {number} [opts.cpuLimit=1]         - Number of CPU cores (float)
 * @param {number} [opts.memoryMb=512]       - Memory limit in MB
 * @param {Record<string,string>} [opts.env] - Extra environment variables
 * @param {function} [opts.onLog]            - Callback(line: string) for build logs
 * @returns {Promise<{containerName: string}>}
 */
const buildAndRunSandbox = async (runId, projectPath, detection, opts = {}) => {
  const {
    cpuLimit = 1,
    memoryMb = 512,
    env = {},
    onLog = () => {},
  } = opts;

  const nanoCpus = Math.min(cpuLimit, 2) * 1e9;
  const memoryBytes = Math.min(memoryMb, 2048) * 1024 * 1024;
  const builderContainerName = `carbon-sandbox-builder-${runId}`;
  const runnerName = `carbon-sandbox-${runId}`;
  const committedImage = `carbon-sandbox-img-${runId}`;

  onLog(`[sandbox] Detected project type: ${detection.type}`);

  // ── Step 1: Prepare image ──────────────────────────────────────────────────
  if (detection.type === 'docker') {
    // Build from their own Dockerfile
    onLog('[sandbox] Building from repo Dockerfile…');
    await buildImage(projectPath, committedImage);
  } else {
    onLog(`[sandbox] Pulling base image: ${detection.baseImage}`);
    await ensureImage(detection.baseImage);
  }

  // ── Step 2: Build phase container (network ON) ────────────────────────────
  let builderContainer;

  if (detection.type === 'docker') {
    // Their Dockerfile already handles build + start; skip build phase
    // Jump straight to runner
    onLog('[sandbox] Starting runner container (custom Dockerfile)…');
    const envArr = Object.entries(env).map(([k, v]) => `${k}=${v}`);
    const runnerContainer = await docker.createContainer({
      name: runnerName,
      Image: committedImage,
      Env: envArr,
      HostConfig: {
        NanoCpus: nanoCpus,
        Memory: memoryBytes,
        NetworkMode: 'none',
        AutoRemove: false,
        Binds: [],
        ReadonlyRootfs: false,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
      },
      NetworkingConfig: {},
    });
    await runnerContainer.start();
    _scheduleTimeout(runId, runnerName, projectPath);
    return { containerName: runnerName };
  }

  // Non-Dockerfile projects: mount repo into builder, run install commands
  if (detection.buildCmds.length > 0) {
    onLog('[sandbox] Starting build phase container…');
    builderContainer = await docker.createContainer({
      name: builderContainerName,
      Image: detection.baseImage,
      Cmd: ['sh', '-c', 'sleep 600'],  // Keep it alive while we exec
      WorkingDir: '/workspace',
      Env: [],
      HostConfig: {
        Binds: [`${path.resolve(projectPath)}:/workspace:rw`],
        NanoCpus: nanoCpus,
        Memory: memoryBytes,
        NetworkMode: 'bridge',  // Network ON for dependency installation
        AutoRemove: false,
        CapDrop: ['ALL'],
        SecurityOpt: ['no-new-privileges'],
      },
    });
    await builderContainer.start();

    for (const cmd of detection.buildCmds) {
      onLog(`[sandbox] Running build command: ${cmd}`);
      try {
        const output = await execInContainer(builderContainer, [cmd]);
        if (output.trim()) {
          output.trim().split('\n').forEach((line) => onLog(`[build] ${line}`));
        }
      } catch (buildErr) {
        onLog(`[sandbox] Build command failed: ${buildErr.message}`);
        // Stop and remove builder before re-throwing
        try { await builderContainer.stop({ t: 5 }); } catch (_) {}
        try { await builderContainer.remove({ force: true }); } catch (_) {}
        throw buildErr;
      }
    }

    // Commit the built state as a new image
    onLog('[sandbox] Committing built container image…');
    await builderContainer.commit({ repo: committedImage, tag: 'latest' });

    // Clean up builder container
    try { await builderContainer.stop({ t: 5 }); } catch (_) {}
    try { await builderContainer.remove({ force: true }); } catch (_) {}
  }
  // If no build commands were run, runnerImage falls back to detection.baseImage below.

  // ── Step 3: Runner container (network NONE) ────────────────────────────────
  onLog('[sandbox] Starting isolated runner container (network=none)…');
  const envArr = Object.entries(env).map(([k, v]) => `${k}=${v}`);
  const runnerImage = detection.buildCmds.length > 0 ? committedImage : detection.baseImage;

  const runnerContainer = await docker.createContainer({
    name: runnerName,
    Image: runnerImage,
    Cmd: ['sh', '-c', detection.startCmd],
    WorkingDir: '/workspace',
    Env: envArr,
    HostConfig: {
      Binds: [`${path.resolve(projectPath)}:/workspace:rw`],
      NanoCpus: nanoCpus,
      Memory: memoryBytes,
      NetworkMode: 'none',
      AutoRemove: false,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
    },
  });

  await runnerContainer.start();
  onLog(`[sandbox] Container ${runnerName} started.`);

  _scheduleTimeout(runId, runnerName, projectPath);

  return { containerName: runnerName };
};

/**
 * Schedule a hard-kill timeout for a sandbox container.
 * @param {string} runId
 * @param {string} containerName
 * @param {string} projectPath
 */
const _scheduleTimeout = (runId, containerName, projectPath) => {
  const handle = setTimeout(async () => {
    console.log(JSON.stringify({
      level: 'warn',
      service: 'sandbox',
      message: 'Sandbox timed out — force killing container',
      runId,
      containerName,
      timestamp: new Date().toISOString(),
    }));
    try {
      await cleanupSandbox(containerName, projectPath);
    } catch (err) {
      console.error(JSON.stringify({
        level: 'error',
        service: 'sandbox',
        message: 'Error during timeout cleanup',
        runId,
        error: err.message,
        timestamp: new Date().toISOString(),
      }));
    }
  }, SANDBOX_TIMEOUT_MS);

  runTimers.set(runId, handle);
};

/**
 * Stop and remove a sandbox container by container name.
 * @param {string} containerName
 * @returns {Promise<void>}
 */
const stopSandbox = async (containerName) => {
  let container;
  try {
    const list = await docker.listContainers({ all: true });
    const match = list.find((c) =>
      c.Names.some((n) => n === `/${containerName}` || n === containerName)
    );
    if (!match) return; // Already gone
    container = docker.getContainer(match.Id);
  } catch (_) {
    return;
  }

  try { await container.stop({ t: 10 }); } catch (_) {}
  try { await container.remove({ force: true }); } catch (_) {}

  // Also clean up any committed image for this run
  const runId = containerName.replace('carbon-sandbox-', '');
  const imgTag = `carbon-sandbox-img-${runId}`;
  try {
    await docker.getImage(imgTag).remove({ force: true });
  } catch (_) {}
};

/**
 * Get the last N lines of logs from a sandbox container.
 * @param {string} containerName
 * @param {number} [tail=100]
 * @returns {Promise<string[]>}
 */
const getSandboxLogs = async (containerName, tail = 100) => {
  const list = await docker.listContainers({ all: true });
  const match = list.find((c) =>
    c.Names.some((n) => n === `/${containerName}` || n === containerName)
  );
  if (!match) {
    return [`[sandbox] Container ${containerName} not found or already removed`];
  }

  const container = docker.getContainer(match.Id);
  const raw = await container.logs({
    stdout: true,
    stderr: true,
    tail,
    timestamps: true,
  });

  return demuxLogs(raw);
};

/**
 * Stream real-time logs from a sandbox container to a socket.io room.
 * Emits { line, timestamp } objects to the room `run:<runId>`.
 *
 * @param {string} containerName
 * @param {import('socket.io').Server} io
 * @param {string} runId
 * @returns {Promise<void>} Resolves when the log stream ends
 */
const streamSandboxLogs = async (containerName, io, runId) => {
  const list = await docker.listContainers({ all: true });
  const match = list.find((c) =>
    c.Names.some((n) => n === `/${containerName}` || n === containerName)
  );

  if (!match) {
    io.to(`run:${runId}`).emit('log', {
      runId,
      line: `[sandbox] Container ${containerName} not found`,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const container = docker.getContainer(match.Id);

  const logStream = await container.logs({
    stdout: true,
    stderr: true,
    follow: true,
    timestamps: true,
    tail: 50,
  });

  return new Promise((resolve) => {
    container.modem.demuxStream(logStream, {
      write(chunk) {
        const text = chunk.toString('utf8');
        text.split('\n').filter(Boolean).forEach((line) => {
          io.to(`run:${runId}`).emit('log', {
            runId,
            line,
            timestamp: new Date().toISOString(),
          });
        });
      },
    }, {
      write(chunk) {
        const text = chunk.toString('utf8');
        text.split('\n').filter(Boolean).forEach((line) => {
          io.to(`run:${runId}`).emit('log', {
            runId,
            line,
            timestamp: new Date().toISOString(),
          });
        });
      },
    });

    logStream.on('end', () => {
      io.to(`run:${runId}`).emit('stream_end', { runId });
      resolve();
    });

    logStream.on('error', (err) => {
      io.to(`run:${runId}`).emit('stream_error', { runId, error: err.message });
      resolve();
    });
  });
};

/**
 * Stop and remove a sandbox container AND delete its temporary project directory.
 * Also cancels any pending timeout.
 * @param {string} containerName
 * @param {string} projectPath
 * @returns {Promise<void>}
 */
const cleanupSandbox = async (containerName, projectPath) => {
  // Cancel scheduled timeout if any
  const runId = containerName.replace('carbon-sandbox-', '');
  if (runTimers.has(runId)) {
    clearTimeout(runTimers.get(runId));
    runTimers.delete(runId);
  }

  // Stop and remove container
  await stopSandbox(containerName);

  // Delete temporary project directory
  if (projectPath && projectPath.startsWith('/tmp/sandbox/')) {
    try {
      await rimraf(path.resolve(projectPath));
    } catch (err) {
      console.warn(JSON.stringify({
        level: 'warn',
        service: 'sandbox',
        message: 'Could not delete project path during cleanup',
        projectPath,
        error: err.message,
        timestamp: new Date().toISOString(),
      }));
    }
  }
};

module.exports = {
  buildAndRunSandbox,
  stopSandbox,
  getSandboxLogs,
  streamSandboxLogs,
  cleanupSandbox,
};
