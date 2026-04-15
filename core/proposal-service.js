// Proposal Generator Service v2 — Carbon Core
// Generates personalized proposals from sales call transcripts using Claude.
// Voice rules enforced. Quality gates validated.

'use strict';

const { spawn } = require('child_process');
const crypto = require('crypto');
const { logSystemAction, ActionTypes } = require('./audit-v2.js');

// ── Constants ────────────────────────────────────────────────────────

const MAX_PROPOSALS = 50;
const CLAUDE_TIMEOUT_MS = 120_000;

// ── System Prompt ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a proposal generation engine. You analyze sales call transcripts and lead data to produce personalized proposal content.

Your output must be valid JSON. No commentary, no preamble, no markdown wrapping.

VOICE RULES (non-negotiable):
- Short sentences. Real numbers. No fluff.
- NEVER use: "certainly", "leverage", "streamline", "empower", "game-changer", "unlock", "revolutionary", "cutting-edge", "synergy", "deep dive", "utilize"
- No em dashes. Use commas, periods, or "and" instead.
- Contractions always: "we'll", "you're", "it's", "don't"
- Engineering vocabulary: install, deploy, build, plug in, productize, stack, source of truth
- Peer-to-peer tone. Lead with proof and specifics, not promises.`;

// ── In-Memory Store ──────────────────────────────────────────────────

/** @type {Array<Object>} ring buffer — newest last */
const proposalStore = [];

// ── DB Registration ──────────────────────────────────────────────────

let _saveProposal = null;
let _getProposalFromDb = null;
let _listProposalsFromDb = null;

/**
 * Register persistent storage functions. Call from server init after DB is ready.
 * @param {{ saveProposal: Function, getProposal: Function, listProposals: Function }} fns
 */
function registerProposalDb({ saveProposal, getProposal, listProposals }) {
  _saveProposal = saveProposal;
  _getProposalFromDb = getProposal;
  _listProposalsFromDb = listProposals;
}

// ── Prompt Builder ───────────────────────────────────────────────────

/**
 * Build the user-facing prompt from lead data and transcript.
 * @param {{ name: string, company: string, industry: string, revenue: string, team_size: string|number, website: string }} leadData
 * @param {string} transcript
 * @returns {string}
 */
function buildUserPrompt(leadData, transcript) {
  return `Analyze the following sales call transcript and lead data. Return a single JSON object matching the schema exactly.

LEAD DATA:
- Name: ${leadData.name}
- Company: ${leadData.company}
- Industry: ${leadData.industry}
- Revenue: ${leadData.revenue}
- Team Size: ${leadData.team_size}
- Website: ${leadData.website}

TRANSCRIPT:
${transcript}

Return this exact JSON structure (no extra keys, no markdown):
{
  "extraction": {
    "pain_points": [{ "pain": "", "severity": "high|medium|low", "direct_quote": "", "proposed_solution": "" }],
    "current_setup": "",
    "goals": [],
    "budget_signals": "",
    "objections": [{ "objection": "", "quote": "", "handled": true }],
    "temperature": "hot|warm|cold"
  },
  "proposal": {
    "summary": "",
    "problems": [{ "title": "", "desc": "" }],
    "what_we_build": [{ "system": "", "description": "", "impact": "" }],
    "roi_projection": { "hours_saved_weekly": 0, "revenue_impact_monthly": 0, "cost_reduction_monthly": 0, "payback_period_months": 0 },
    "phases": [{ "phase": 1, "name": "", "duration_weeks": 2, "deliverables": [], "price_range": "" }],
    "email_body": "",
    "next_steps": []
  }
}`;
}

// ── Claude Invocation ────────────────────────────────────────────────

/**
 * Call the Claude CLI and return parsed JSON output.
 * @param {string} fullPrompt
 * @returns {Promise<Object>}
 */
function callClaude(fullPrompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn('claude', ['--print', '--output-format', 'json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new Error('Claude CLI timed out after 120s'));
    }, CLAUDE_TIMEOUT_MS);

    proc.stdin.write(fullPrompt);
    proc.stdin.end();

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        return reject(new Error(`Claude CLI exited ${code}: ${stderr.trim()}`));
      }

      try {
        // claude --output-format json wraps the response in an envelope
        const envelope = JSON.parse(stdout.trim());
        const raw = envelope.result ?? envelope.content ?? stdout.trim();
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return resolve(parsed);
      } catch (_envelopeErr) {
        // Fall back to treating raw stdout as the JSON payload
        try {
          return resolve(JSON.parse(stdout.trim()));
        } catch (parseErr) {
          return reject(new Error(`Failed to parse Claude output: ${parseErr.message}`));
        }
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });
  });
}

// ── Quality Gates ────────────────────────────────────────────────────

/**
 * Validate the generated result against required quality criteria.
 * @param {{ extraction: Object, proposal: Object }} result
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateProposal(result) {
  const errors = [];
  const { extraction, proposal } = result;

  if (!extraction || !Array.isArray(extraction.pain_points) || extraction.pain_points.length < 1) {
    errors.push('Must have at least 1 pain_point in extraction');
  }

  if (!proposal || typeof proposal.summary !== 'string' || proposal.summary.length <= 100) {
    errors.push('Proposal summary must be longer than 100 characters');
  }

  if (!proposal || !Array.isArray(proposal.what_we_build) || proposal.what_we_build.length < 1) {
    errors.push('Must have at least 1 item in what_we_build');
  }

  const validTemps = ['hot', 'warm', 'cold'];
  if (!extraction || !validTemps.includes(extraction.temperature)) {
    errors.push(`Temperature must be one of: ${validTemps.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
}

// ── Store Helpers ────────────────────────────────────────────────────

/**
 * Push a proposal record into the ring buffer and optionally persist it.
 * @param {Object} record
 */
function storeProposal(record) {
  proposalStore.push(record);
  if (proposalStore.length > MAX_PROPOSALS) {
    proposalStore.shift();
  }

  if (_saveProposal) {
    try {
      _saveProposal(record);
    } catch {
      // DB not ready — record survives in memory
    }
  }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Generate a proposal from a sales transcript and lead data.
 * @param {{ name: string, company: string, industry: string, revenue: string, team_size: string|number, website: string }} leadData
 * @param {string} transcript
 * @returns {Promise<{ success: boolean, proposal: Object|null, extraction: Object|null, id: string|null, error: string|null }>}
 */
async function generateProposal(leadData, transcript) {
  const id = crypto.randomUUID();

  try {
    const userPrompt = buildUserPrompt(leadData, transcript);
    const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

    const result = await callClaude(fullPrompt);

    const { valid, errors } = validateProposal(result);
    if (!valid) {
      return {
        success: false,
        proposal: null,
        extraction: null,
        id: null,
        error: `Quality gate failed: ${errors.join('; ')}`,
      };
    }

    const record = {
      id,
      lead: leadData,
      extraction: result.extraction,
      proposal: result.proposal,
      created_at: Date.now(),
    };

    storeProposal(record);

    logSystemAction(ActionTypes.PROPOSAL_GENERATED, 'proposal', id, {
      company: leadData.company,
      temperature: result.extraction.temperature,
    });

    return {
      success: true,
      proposal: result.proposal,
      extraction: result.extraction,
      id,
      error: null,
    };
  } catch (err) {
    logSystemAction(ActionTypes.SYSTEM_ERROR, 'proposal', id, { error: err.message });
    return { success: false, proposal: null, extraction: null, id: null, error: err.message };
  }
}

/**
 * Retrieve a proposal by ID. Checks memory first, then registered DB.
 * @param {string} id
 * @returns {Object|null}
 */
function getProposal(id) {
  const found = proposalStore.find((p) => p.id === id) ?? null;
  if (found) return found;

  if (_getProposalFromDb) {
    try {
      return _getProposalFromDb(id) ?? null;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Get the most recent proposals, newest first.
 * @param {number} [limit=10]
 * @returns {Array<Object>}
 */
function getRecentProposals(limit = 10) {
  return [...proposalStore].reverse().slice(0, limit);
}

// ── Exports ──────────────────────────────────────────────────────────

module.exports = {
  generateProposal,
  getProposal,
  getRecentProposals,
  registerProposalDb,
};
