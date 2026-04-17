/**
 * progress-reporter.js — Terminal progress bars for Carbon Core v4
 *
 * Wraps steipete/osc-progress (MIT) using OSC 9;4 escape sequences.
 * Source: https://github.com/steipete/osc-progress
 *
 * Works in Ghostty, WezTerm, Windows Terminal. Falls back to a simple
 * ASCII spinner/counter in other terminals.
 *
 * Usage:
 *   const { createProgress } = require('./progress-reporter');
 *
 *   const p = createProgress('Downloading', 100);
 *   for (let i = 0; i <= 100; i++) {
 *     await doWork(i);
 *     p.update(i);
 *   }
 *   p.done();
 */

'use strict';

// ---------------------------------------------------------------------------
// OSC 9;4 helpers (inline — no npm dep needed for basic usage)
// ---------------------------------------------------------------------------

function supportsOsc(env = process.env, isTty = process.stderr.isTTY) {
  if (!isTty) return false;
  const prog = (env.TERM_PROGRAM || '').toLowerCase();
  return (
    prog.startsWith('ghostty') ||
    prog.startsWith('wezterm') ||
    !!env.WT_SESSION // Windows Terminal
  );
}

function writeOsc(state, percent, label, write = (s) => process.stderr.write(s)) {
  // OSC 9;4 ; <state> ; <percent> ST
  // state: 0=hidden, 1=indeterminate, 2=normal, 3=error, 4=paused
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  const payload = label ? `${pct};${label}` : `${pct}`;
  write(`\x1b]9;4;${state};${payload}\x1b\\`);
}

function clearOsc(write = (s) => process.stderr.write(s)) {
  write(`\x1b]9;4;0;0\x1b\\`);
}

// ---------------------------------------------------------------------------
// Fallback ASCII progress
// ---------------------------------------------------------------------------

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let _spinIdx = 0;

function asciiProgress(label, current, total) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const filled = Math.round(pct / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stderr.write(`\r${label} [${bar}] ${pct}%   `);
}

function asciiSpinner(label) {
  const spin = SPINNER[_spinIdx++ % SPINNER.length];
  process.stderr.write(`\r${spin} ${label}   `);
}

function asciClear() {
  process.stderr.write('\r' + ' '.repeat(60) + '\r');
}

// ---------------------------------------------------------------------------
// createProgress — primary export
// ---------------------------------------------------------------------------

/**
 * Create a progress reporter.
 *
 * @param {string} label   - Human label shown in terminal title/progress bar
 * @param {number} [total] - Total units (0 = indeterminate / spinner mode)
 * @param {{ write?: Function, env?: object, isTty?: boolean }} [opts]
 * @returns {{ update(current: number): void, done(label?: string): void, fail(label?: string): void }}
 */
function createProgress(label, total = 0, opts = {}) {
  const write   = opts.write   ?? ((s) => process.stderr.write(s));
  const env     = opts.env     ?? process.env;
  const isTty   = opts.isTty  ?? process.stderr.isTTY;
  const useOsc  = supportsOsc(env, isTty);
  const indeterminate = total <= 0;

  let lastPct = -1;
  let spinTimer = null;

  if (indeterminate) {
    if (useOsc) {
      writeOsc(1, 0, label, write); // state 1 = indeterminate
    } else {
      spinTimer = setInterval(() => asciiSpinner(label), 120);
    }
  }

  function update(current) {
    if (indeterminate) return; // no-op for spinner mode
    const pct = total > 0 ? Math.round((current / total) * 100) : 0;
    if (pct === lastPct) return; // throttle identical updates
    lastPct = pct;
    if (useOsc) {
      writeOsc(2, pct, label, write);
    } else {
      asciiProgress(label, current, total);
    }
  }

  function done(doneLabel) {
    if (spinTimer) { clearInterval(spinTimer); spinTimer = null; }
    if (useOsc) {
      writeOsc(2, 100, doneLabel ?? label, write);
      setTimeout(() => clearOsc(write), 200);
    } else {
      asciClear();
      process.stderr.write(`✓ ${doneLabel ?? label}\n`);
    }
  }

  function fail(failLabel) {
    if (spinTimer) { clearInterval(spinTimer); spinTimer = null; }
    if (useOsc) {
      writeOsc(3, 0, failLabel ?? label, write); // state 3 = error
      setTimeout(() => clearOsc(write), 200);
    } else {
      asciClear();
      process.stderr.write(`✗ ${failLabel ?? label}\n`);
    }
  }

  return { update, done, fail };
}

// ---------------------------------------------------------------------------
// startSpinner — convenience wrapper for indeterminate work
// ---------------------------------------------------------------------------

/**
 * @param {string} label
 * @param {object} [opts]
 * @returns {() => void} stop function
 */
function startSpinner(label, opts = {}) {
  const p = createProgress(label, 0, opts);
  return () => p.done();
}

module.exports = { createProgress, startSpinner, supportsOsc };
