/**
 * Lore Commits — Carbon Core v2
 * Ported from oh-my-codex executor prompt (Lore commit protocol)
 *
 * Lore commits describe WHY, not WHAT (the diff shows what).
 * Git trailers provide decision context for future agents.
 */

const { execSync, spawnSync } = require('child_process');

// ── Format ──────────────────────────────────────────────────────────

/**
 * Format a Lore commit message.
 *
 * @param {string} intent - WHY this change was made (not WHAT)
 * @param {object} trailers - Optional context trailers
 * @param {string} trailers.Constraint - External forces that shaped the decision
 * @param {string|string[]} trailers.Rejected - "<alternative> | <reason>" pairs
 * @param {string} trailers.Directive - Warning for future modifiers ("do not X without Y")
 * @param {'low'|'medium'|'high'} trailers.Confidence - Decision confidence
 * @param {'narrow'|'moderate'|'broad'} trailers.ScopeRisk - Impact breadth
 * @param {string} trailers.Tested - What was verified
 * @param {string} trailers.NotTested - Known gaps
 */
function formatLoreCommit(intent, trailers = {}) {
  const lines = [intent.trim()];

  const hasTrailers = Object.values(trailers).some(v => v);
  if (!hasTrailers) return lines[0];

  lines.push(''); // Blank line before trailers

  if (trailers.Constraint) lines.push(`Constraint: ${trailers.Constraint}`);

  if (trailers.Rejected) {
    const rejected = Array.isArray(trailers.Rejected) ? trailers.Rejected : [trailers.Rejected];
    for (const r of rejected) lines.push(`Rejected: ${r}`);
  }

  if (trailers.Directive) lines.push(`Directive: ${trailers.Directive}`);
  if (trailers.Confidence) lines.push(`Confidence: ${trailers.Confidence}`);
  if (trailers.ScopeRisk) lines.push(`Scope-risk: ${trailers.ScopeRisk}`);
  if (trailers.Tested) lines.push(`Tested: ${trailers.Tested}`);
  if (trailers.NotTested) lines.push(`Not-tested: ${trailers.NotTested}`);

  return lines.join('\n');
}

/**
 * Parse a Lore commit message back into intent + trailers.
 */
function parseLoreCommit(message) {
  const lines = message.trim().split('\n');
  const intent = lines[0];
  const trailers = {};

  for (const line of lines.slice(2)) {
    const match = line.match(/^([\w-]+):\s+(.+)$/);
    if (!match) continue;
    const [, key, value] = match;
    const normalKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (trailers[normalKey]) {
      trailers[normalKey] = Array.isArray(trailers[normalKey])
        ? [...trailers[normalKey], value]
        : [trailers[normalKey], value];
    } else {
      trailers[normalKey] = value;
    }
  }

  return { intent, trailers };
}

/**
 * Create a Lore commit in a git repository.
 * Stages specified files and commits with the Lore format.
 */
function createLoreCommit(dir, files, intent, trailers = {}) {
  const message = formatLoreCommit(intent, trailers);

  try {
    // Stage files
    if (files && files.length > 0) {
      const result = spawnSync('git', ['add', ...files], { cwd: dir, stdio: 'pipe' });
      if (result.status !== 0) throw new Error(`git add failed: ${result.stderr.toString()}`);
    }

    // Commit
    const result = spawnSync('git', ['commit', '-m', message], { cwd: dir, stdio: 'pipe' });
    if (result.status !== 0) throw new Error(`git commit failed: ${result.stderr.toString()}`);

    const commitResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, stdio: 'pipe' });
    const hash = commitResult.stdout.toString().trim().slice(0, 7);

    console.log(`[lore] Committed ${hash}: ${intent.slice(0, 60)}`);
    return { hash, message };
  } catch (e) {
    throw new Error(`Lore commit failed: ${e.message}`);
  }
}

/**
 * Generate a Lore-format commit message using Claude.
 * Analyzes the git diff and writes a WHY-focused intent.
 */
async function generateLoreCommit(dir, context = '') {
  const { spawn } = await import('child_process');

  const diff = spawnSync('git', ['diff', '--staged'], { cwd: dir, stdio: 'pipe' }).stdout.toString();
  if (!diff.trim()) throw new Error('No staged changes to commit');

  const prompt = `Analyze this git diff and write a Lore commit message.

LORE FORMAT RULES:
- First line: WHY this change was made (not WHAT — the diff shows what)
- Blank line after first line
- Optional trailers (only include if valuable):
  Constraint: <external forces that shaped the decision>
  Rejected: <alternative considered> | <why rejected>
  Directive: <warning for future modifiers>
  Confidence: low|medium|high
  Scope-risk: narrow|moderate|broad
  Tested: <what was verified>
  Not-tested: <known gaps>

${context ? `Context: ${context}\n\n` : ''}Git diff:
\`\`\`
${diff.slice(0, 3000)}
\`\`\`

Output ONLY the commit message, no explanation.`;

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--permission-mode', 'bypassPermissions', '--print', prompt], {
      cwd: dir, env: { ...process.env },
    });
    let stdout = '';
    proc.stdout.on('data', d => { stdout += d; });
    proc.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error('Failed to generate commit message')));
    proc.on('error', reject);
    setTimeout(() => { proc.kill(); reject(new Error('Timeout')); }, 30000);
  });
}

// ── Conventional Commit Helpers ──────────────────────────────────────

const CONVENTIONAL_TYPES = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore', 'perf', 'ci', 'build', 'revert'];

function formatConventionalCommit(type, scope, description, body = '', breaking = false) {
  if (!CONVENTIONAL_TYPES.includes(type)) throw new Error(`Invalid type: ${type}. Use: ${CONVENTIONAL_TYPES.join(', ')}`);
  const scopePart = scope ? `(${scope})` : '';
  const breakingMark = breaking ? '!' : '';
  const header = `${type}${scopePart}${breakingMark}: ${description}`;
  return body ? `${header}\n\n${body}` : header;
}


module.exports = {
  formatLoreCommit,
  parseLoreCommit,
  createLoreCommit,
  generateLoreCommit,
  formatConventionalCommit,
};
