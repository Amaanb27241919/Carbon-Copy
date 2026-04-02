'use strict';

const path = require('path');
const { simpleGit } = require('simple-git');

// Maximum time allowed for a clone operation (60 seconds)
const CLONE_TIMEOUT_MS = 60_000;

// Allow only github.com URLs in the form: https://github.com/owner/repo[.git][/...]
const GITHUB_URL_RE = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?(\/.*)?$/;

// Block any attempt to use path-traversal sequences or dangerous characters
const SUSPICIOUS_RE = /(\.\.|\/\/|\\|;|`|\$\(|&&|\|\|)/;

/**
 * Validate that a URL is a safe, public GitHub repository URL.
 * Returns true on success, throws on failure.
 * @param {string} url
 * @returns {boolean}
 */
const validateGitHubUrl = (url) => {
  if (typeof url !== 'string' || url.trim() === '') {
    throw new Error('Repository URL must be a non-empty string');
  }

  const trimmed = url.trim();

  // Must start with https://github.com/
  if (!trimmed.startsWith('https://github.com/')) {
    throw new Error('Only public GitHub repository URLs (https://github.com/...) are supported');
  }

  // Block localhost, private IP ranges embedded in URL (shouldn't happen with the
  // prefix check above, but defence in depth)
  if (/localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\./i.test(trimmed)) {
    throw new Error('Private or loopback addresses are not permitted');
  }

  // Block path traversal and shell injection characters
  if (SUSPICIOUS_RE.test(trimmed)) {
    throw new Error('Repository URL contains suspicious characters');
  }

  // Validate overall shape
  if (!GITHUB_URL_RE.test(trimmed)) {
    throw new Error('Repository URL does not match expected GitHub format (https://github.com/owner/repo)');
  }

  return true;
};

/**
 * Clone a GitHub repository to destPath with depth 1.
 * @param {string} repoUrl - Validated GitHub HTTPS URL
 * @param {string} destPath - Absolute path to clone into (must not yet exist)
 * @returns {Promise<void>}
 */
const cloneRepo = async (repoUrl, destPath) => {
  // Extra safety: ensure destPath is under /tmp/sandbox/
  const resolved = path.resolve(destPath);
  if (!resolved.startsWith('/tmp/sandbox/')) {
    throw new Error(`Clone destination must be under /tmp/sandbox/, got: ${resolved}`);
  }

  const git = simpleGit({
    timeout: { block: CLONE_TIMEOUT_MS },
  });

  await git.clone(repoUrl, resolved, [
    '--depth', '1',
    '--single-branch',
    '--no-tags',
  ]);
};

module.exports = { cloneRepo, validateGitHubUrl };
