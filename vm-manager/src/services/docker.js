'use strict';

const Dockerode = require('dockerode');

const DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';

const dockerClient = new Dockerode({ socketPath: DOCKER_SOCKET });

/**
 * Find a container by name (exact or with leading slash).
 * @param {string} name
 * @returns {Promise<import('dockerode').Container>}
 */
const findContainer = async (name) => {
  const containers = await dockerClient.listContainers({ all: true });
  const match = containers.find((c) =>
    c.Names.some((n) => n === `/${name}` || n === name)
  );
  if (!match) {
    const err = new Error(`Container ${name} not found`);
    err.statusCode = 404;
    throw err;
  }
  return dockerClient.getContainer(match.Id);
};

/**
 * List all containers whose names start with "carbon-".
 * @returns {Promise<Array>}
 */
const listContainers = async () => {
  const containers = await dockerClient.listContainers({ all: true });
  return containers
    .filter((c) => c.Names.some((n) => n.startsWith('/carbon-')))
    .map((c) => ({
      id: c.Id.slice(0, 12),
      names: c.Names.map((n) => n.replace(/^\//, '')),
      image: c.Image,
      status: c.Status,
      state: c.State,
      created: new Date(c.Created * 1000).toISOString(),
      ports: c.Ports,
    }));
};

/**
 * Start a container by name.
 * @param {string} name
 */
const startContainer = async (name) => {
  const container = await findContainer(name);
  await container.start();
};

/**
 * Stop a container by name.
 * @param {string} name
 */
const stopContainer = async (name) => {
  const container = await findContainer(name);
  await container.stop();
};

/**
 * Restart a container by name.
 * @param {string} name
 */
const restartContainer = async (name) => {
  const container = await findContainer(name);
  await container.restart();
};

/**
 * Get the last N lines of logs from a container.
 * @param {string} name
 * @param {number} [tail=100]
 * @returns {Promise<string[]>}
 */
const getContainerLogs = async (name, tail = 100) => {
  const container = await findContainer(name);

  const logsBuffer = await container.logs({
    stdout: true,
    stderr: true,
    tail,
    timestamps: true,
  });

  // Docker multiplexes stdout/stderr with an 8-byte header per chunk.
  // Strip those headers to get clean log lines.
  const raw = logsBuffer.toString('utf8');
  const lines = raw.split('\n').map((line) => {
    // Remove the 8-byte docker stream header if present
    if (line.length > 8) {
      const stripped = line.slice(8);
      return stripped;
    }
    return line;
  }).filter(Boolean);

  return lines;
};

/**
 * Get a single stats snapshot (CPU + memory) for a container.
 * @param {string} name
 * @returns {Promise<object>}
 */
const getContainerStats = async (name) => {
  const container = await findContainer(name);

  return new Promise((resolve, reject) => {
    container.stats({ stream: false }, (err, data) => {
      if (err) return reject(err);
      if (!data) return reject(new Error('No stats returned'));

      const cpuDelta = data.cpu_stats.cpu_usage.total_usage - data.precpu_stats.cpu_usage.total_usage;
      const systemDelta = data.cpu_stats.system_cpu_usage - data.precpu_stats.system_cpu_usage;
      const numCpus = data.cpu_stats.online_cpus || data.cpu_stats.cpu_usage.percpu_usage?.length || 1;
      const cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * numCpus * 100 : 0;

      const memUsage = data.memory_stats.usage || 0;
      const memLimit = data.memory_stats.limit || 1;
      const memPercent = (memUsage / memLimit) * 100;

      resolve({
        cpu_percent: Math.round(cpuPercent * 100) / 100,
        memory_usage_mb: Math.round(memUsage / 1024 / 1024 * 100) / 100,
        memory_limit_mb: Math.round(memLimit / 1024 / 1024 * 100) / 100,
        memory_percent: Math.round(memPercent * 100) / 100,
        pids: data.pids_stats?.current || 0,
        read: data.read,
      });
    });
  });
};

module.exports = {
  listContainers,
  startContainer,
  stopContainer,
  restartContainer,
  getContainerLogs,
  getContainerStats,
};
