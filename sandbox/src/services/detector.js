'use strict';

const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} DetectionResult
 * @property {'python'|'node'|'go'|'rust'|'docker'|'unknown'} type
 * @property {string} baseImage   - Docker base image to use
 * @property {string[]} buildCmds - Commands to run during the build phase (with network)
 * @property {string} startCmd   - Command to run the project (isolation phase)
 */

/**
 * Detect the project type of a cloned repository.
 * Priority: Dockerfile > package.json > requirements.txt|pyproject.toml > go.mod > Cargo.toml > fallback python
 *
 * @param {string} projectPath - Absolute path to the cloned repository root
 * @returns {DetectionResult}
 */
const detectProjectType = (projectPath) => {
  const exists = (file) => fs.existsSync(path.join(projectPath, file));

  // Highest priority: repo ships its own Dockerfile
  if (exists('Dockerfile') || exists('dockerfile')) {
    return {
      type: 'docker',
      baseImage: null, // We'll build from their Dockerfile
      buildCmds: [],
      startCmd: null,  // Let Docker entrypoint handle it
    };
  }

  // Node.js
  if (exists('package.json')) {
    // Prefer yarn if yarn.lock exists, otherwise npm
    const hasYarnLock = exists('yarn.lock');
    const hasPnpmLock = exists('pnpm-lock.yaml');
    let installCmd;
    if (hasPnpmLock) {
      installCmd = 'npm install -g pnpm && pnpm install --frozen-lockfile';
    } else if (hasYarnLock) {
      installCmd = 'yarn install --frozen-lockfile';
    } else {
      installCmd = 'npm install --omit=dev';
    }

    // Try to detect start script from package.json
    let startCmd = 'node index.js';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectPath, 'package.json'), 'utf8'));
      if (pkg.scripts && pkg.scripts.start) {
        startCmd = 'npm start';
      } else if (pkg.main) {
        startCmd = `node ${pkg.main}`;
      }
    } catch (_) {
      // ignore parse errors
    }

    return {
      type: 'node',
      baseImage: 'node:20-alpine',
      buildCmds: [installCmd],
      startCmd,
    };
  }

  // Python
  if (exists('requirements.txt') || exists('pyproject.toml')) {
    const buildCmds = ['pip install --no-cache-dir --upgrade pip'];
    if (exists('requirements.txt')) {
      buildCmds.push('pip install --no-cache-dir -r requirements.txt');
    } else {
      buildCmds.push('pip install --no-cache-dir .');
    }

    // Detect entry point: main.py, app.py, run.py, src/main.py
    let startCmd = 'python main.py';
    for (const candidate of ['main.py', 'app.py', 'run.py', 'src/main.py', '__main__.py']) {
      if (exists(candidate)) {
        startCmd = `python ${candidate}`;
        break;
      }
    }

    return {
      type: 'python',
      baseImage: 'python:3.12-slim',
      buildCmds,
      startCmd,
    };
  }

  // Go
  if (exists('go.mod')) {
    return {
      type: 'go',
      baseImage: 'golang:1.22-alpine',
      buildCmds: ['go mod download', 'go build -o /app/main .'],
      startCmd: '/app/main',
    };
  }

  // Rust
  if (exists('Cargo.toml')) {
    return {
      type: 'rust',
      baseImage: 'rust:1.77-slim',
      buildCmds: ['cargo build --release'],
      // Detect binary name from Cargo.toml
      startCmd: (() => {
        try {
          const cargoToml = fs.readFileSync(path.join(projectPath, 'Cargo.toml'), 'utf8');
          const nameMatch = cargoToml.match(/^\s*name\s*=\s*"([^"]+)"/m);
          if (nameMatch) return `./target/release/${nameMatch[1]}`;
        } catch (_) {
          // ignore
        }
        return './target/release/app';
      })(),
    };
  }

  // Fallback: treat as Python
  return {
    type: 'unknown',
    baseImage: 'python:3.12-slim',
    buildCmds: [],
    startCmd: 'python main.py',
  };
};

module.exports = { detectProjectType };
