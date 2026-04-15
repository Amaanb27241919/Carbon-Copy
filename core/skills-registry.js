/**
 * Skills Registry — Carbon Core
 * Indexes all 61 skills from rawclaw-platform/skills/active/
 *
 * Each skill has: id, name, description, category, triggers, agent_affinity
 * Skills are loaded as context into agent prompts when relevant.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ── Skills Catalog ──────────────────────────────────────────────────

export const SKILLS_CATALOG = [
  // ── Content & Copywriting ─────────────────────────────────────────
  { id: 'brand-voice',              category: 'content',  agents: ['quilly', 'larry'], triggers: ['brand voice', 'tone', 'style guide', 'writing style'] },
  { id: 'content-creation',         category: 'content',  agents: ['quilly'],          triggers: ['create content', 'write content', 'content piece', 'blog post', 'article'] },
  { id: 'content-strategy',         category: 'content',  agents: ['quilly', 'scan'],  triggers: ['content strategy', 'content plan', 'editorial calendar', 'content roadmap'] },
  { id: 'content-ideation-pipeline',category: 'content',  agents: ['quilly'],          triggers: ['content ideas', 'ideation', 'topic ideas', 'what to write about'] },
  { id: 'copywriting',              category: 'content',  agents: ['quilly', 'larry'], triggers: ['copy', 'headline', 'landing page copy', 'ad copy', 'website copy'] },
  { id: 'copy-editing',             category: 'content',  agents: ['quilly'],          triggers: ['edit copy', 'proofread', 'improve writing', 'refine'] },
  { id: 'copy-pipeline',            category: 'content',  agents: ['quilly'],          triggers: ['copy pipeline', 'content pipeline', 'batch content'] },
  { id: 'social-content',           category: 'content',  agents: ['quilly'],          triggers: ['social media', 'instagram', 'twitter', 'linkedin post', 'tweet'] },
  { id: 'story-sequence',           category: 'content',  agents: ['quilly'],          triggers: ['story', 'narrative', 'storytelling', 'brand story'] },
  { id: 'yt-pipeline',              category: 'content',  agents: ['quilly'],          triggers: ['youtube', 'yt video', 'video script', 'youtube channel'] },
  { id: 'yt-search',                category: 'content',  agents: ['quilly', 'ovi'],   triggers: ['youtube seo', 'youtube search', 'video seo', 'youtube keyword'] },
  { id: 'yt-spinoff',               category: 'content',  agents: ['quilly'],          triggers: ['youtube spinoff', 'repurpose video', 'video repurposing'] },

  // ── Sales & Outreach ──────────────────────────────────────────────
  { id: 'cold-email',               category: 'sales',    agents: ['larry'],           triggers: ['cold email', 'outreach email', 'prospecting email', 'sales email', 'sdr'] },
  { id: 'email-sequence',           category: 'sales',    agents: ['larry'],           triggers: ['email sequence', 'drip campaign', 'nurture sequence', 'follow-up sequence'] },
  { id: 'proposal',                 category: 'sales',    agents: ['larry'],           triggers: ['proposal', 'business proposal', 'sales proposal', 'pitch deck content'] },
  { id: 'sales',                    category: 'sales',    agents: ['larry'],           triggers: ['sales strategy', 'sales process', 'close deal', 'sales framework'] },
  { id: 'sales-enablement',         category: 'sales',    agents: ['larry'],           triggers: ['sales collateral', 'sales deck', 'one-pager', 'battlecard', 'objection handling'] },
  { id: 'sales-prep-pipeline',      category: 'sales',    agents: ['larry', 'ovi'],    triggers: ['sales prep', 'pre-call research', 'prospect research', 'account research'] },
  { id: 'revops',                   category: 'sales',    agents: ['larry', 'ali'],    triggers: ['revops', 'revenue operations', 'crm', 'sales ops', 'pipeline management'] },
  { id: 'waterfall',                category: 'sales',    agents: ['larry'],           triggers: ['waterfall', 'lead waterfall', 'outbound sequence', 'multi-channel outreach'] },
  { id: 'steal',                    category: 'sales',    agents: ['ovi', 'larry'],    triggers: ['competitive steal', 'steal competitor', 'competitive displacement'] },

  // ── Marketing & Growth ────────────────────────────────────────────
  { id: 'marketing-ideas',          category: 'marketing', agents: ['scan', 'quilly'], triggers: ['marketing ideas', 'growth ideas', 'campaign ideas', 'marketing brainstorm'] },
  { id: 'marketing-psychology',     category: 'marketing', agents: ['quilly', 'larry'],triggers: ['psychology', 'persuasion', 'behavioral', 'cognitive bias', 'cialdini'] },
  { id: 'launch-strategy',          category: 'marketing', agents: ['scan', 'quilly'], triggers: ['launch', 'product launch', 'go-to-market', 'launch plan'] },
  { id: 'lead-magnets',             category: 'marketing', agents: ['quilly', 'larry'],triggers: ['lead magnet', 'freebie', 'opt-in', 'free resource'] },
  { id: 'community-marketing',      category: 'marketing', agents: ['quilly', 'cleo'], triggers: ['community', 'discord', 'slack community', 'community building'] },
  { id: 'referral-program',         category: 'marketing', agents: ['quilly', 'ali'],  triggers: ['referral', 'affiliate', 'word of mouth', 'viral growth'] },
  { id: 'paid-ads',                 category: 'marketing', agents: ['quilly'],          triggers: ['paid ads', 'google ads', 'facebook ads', 'meta ads', 'ppc'] },
  { id: 'ad-creative',              category: 'marketing', agents: ['quilly'],          triggers: ['ad creative', 'ad copy', 'creative brief', 'banner ad'] },
  { id: 'product-marketing-context',category: 'marketing', agents: ['scan', 'quilly'],  triggers: ['product context', 'product marketing', 'positioning', 'messaging'] },

  // ── SEO & Content Distribution ────────────────────────────────────
  { id: 'ai-seo',                   category: 'seo',      agents: ['quilly', 'ovi'],   triggers: ['ai seo', 'llm seo', 'seo for ai', 'perplexity seo', 'sgeo'] },
  { id: 'seo-audit',                category: 'seo',      agents: ['ovi'],             triggers: ['seo audit', 'technical seo', 'site audit', 'seo check'] },
  { id: 'programmatic-seo',         category: 'seo',      agents: ['ali', 'ovi'],      triggers: ['programmatic seo', 'pSEO', 'automated seo pages', 'seo at scale'] },
  { id: 'schema-markup',            category: 'seo',      agents: ['ali'],             triggers: ['schema', 'structured data', 'rich snippets', 'json-ld'] },
  { id: 'site-architecture',        category: 'seo',      agents: ['ali', 'ovi'],      triggers: ['site architecture', 'information architecture', 'nav structure'] },
  { id: 'free-tool-strategy',       category: 'seo',      agents: ['scan', 'ali'],     triggers: ['free tool', 'lead gen tool', 'calculator', 'free resource strategy'] },
  { id: 'competitor-alternatives',  category: 'seo',      agents: ['ovi'],             triggers: ['alternative to', 'vs competitor', 'competitor comparison page'] },

  // ── CRO & Conversion ─────────────────────────────────────────────
  { id: 'ab-test-setup',            category: 'cro',      agents: ['ali', 'ovi'],      triggers: ['a/b test', 'split test', 'conversion test', 'hypothesis'] },
  { id: 'form-cro',                 category: 'cro',      agents: ['ali'],             triggers: ['form optimization', 'form cro', 'form conversion', 'signup form'] },
  { id: 'funnel-pipeline',          category: 'cro',      agents: ['ali', 'larry'],    triggers: ['funnel', 'conversion funnel', 'sales funnel', 'pipeline optimization'] },
  { id: 'onboarding-cro',           category: 'cro',      agents: ['cleo', 'ali'],     triggers: ['onboarding optimization', 'activation', 'first week cro', 'new user'] },
  { id: 'page-cro',                 category: 'cro',      agents: ['ali', 'quilly'],   triggers: ['page cro', 'landing page optimization', 'page conversion'] },
  { id: 'paywall-upgrade-cro',      category: 'cro',      agents: ['ali', 'larry'],    triggers: ['paywall', 'upgrade cro', 'upgrade conversion', 'paid conversion'] },
  { id: 'popup-cro',                category: 'cro',      agents: ['ali'],             triggers: ['popup', 'modal cro', 'exit intent', 'popup conversion'] },
  { id: 'signup-flow-cro',          category: 'cro',      agents: ['ali', 'cleo'],     triggers: ['signup flow', 'registration cro', 'signup conversion', 'onboarding flow'] },

  // ── Research & Analysis ───────────────────────────────────────────
  { id: 'research',                 category: 'research', agents: ['ovi', 'aria'],     triggers: ['research', 'analyze', 'investigate', 'market research', 'deep dive'] },
  { id: 'customer-research',        category: 'research', agents: ['ovi', 'cleo'],     triggers: ['customer research', 'user research', 'icp research', 'buyer persona'] },
  { id: 'signal-scan',              category: 'research', agents: ['ovi', 'aria'],     triggers: ['signal scan', 'market signals', 'buying signals', 'intent signals'] },
  { id: 'rag-query',                category: 'research', agents: ['ovi', 'aria'],     triggers: ['knowledge base', 'query knowledge', 'rag', 'search docs'] },

  // ── Tools & Integrations ──────────────────────────────────────────
  { id: 'gmail',                    category: 'tools',    agents: ['ali', 'larry'],    triggers: ['gmail', 'email', 'send email', 'email automation'] },
  { id: 'google-calendar',          category: 'tools',    agents: ['ali', 'scan'],     triggers: ['calendar', 'google calendar', 'schedule', 'meeting'] },
  { id: 'slack',                    category: 'tools',    agents: ['ali', 'scan'],     triggers: ['slack', 'slack message', 'slack channel', 'slack notification'] },
  { id: 'clickup',                  category: 'tools',    agents: ['ali', 'scan'],     triggers: ['clickup', 'task management', 'project management', 'tasks'] },
  { id: 'notebooklm',               category: 'tools',    agents: ['ovi', 'aria'],     triggers: ['notebooklm', 'google notebook', 'document analysis'] },
  { id: 'mcp-creator',              category: 'tools',    agents: ['ali'],             triggers: ['mcp', 'mcp server', 'create mcp', 'model context protocol'] },
  { id: 'skill-creator',            category: 'tools',    agents: ['ali'],             triggers: ['create skill', 'new skill', 'skill template'] },

  // ── Pricing & Product ─────────────────────────────────────────────
  { id: 'pricing-strategy',         category: 'product',  agents: ['scan', 'larry'],   triggers: ['pricing', 'price strategy', 'pricing model', 'tiered pricing'] },
  { id: 'churn-prevention',         category: 'product',  agents: ['cleo'],            triggers: ['churn', 'retention', 'cancel', 'churned user', 'at-risk'] },

  // ── Dev & Shipping ────────────────────────────────────────────────
  { id: 'analytics-tracking',       category: 'dev',      agents: ['ali'],             triggers: ['analytics', 'tracking', 'ga4', 'gtm', 'event tracking', 'mixpanel'] },
  { id: 'frontend-theme',           category: 'dev',      agents: ['ali'],             triggers: ['frontend', 'ui', 'design system', 'component', 'theme', 'css', 'tailwind'] },
  { id: 'ship-check',               category: 'dev',      agents: ['ali'],             triggers: ['ship check', 'pre-launch', 'launch checklist', 'ready to ship'] },
];

// ── Skills Index ────────────────────────────────────────────────────

const skillsById = {};
for (const skill of SKILLS_CATALOG) skillsById[skill.id] = skill;

export function getSkill(id) { return skillsById[id] || null; }
export function getAllSkills() { return SKILLS_CATALOG; }
export function getSkillsByCategory(category) { return SKILLS_CATALOG.filter(s => s.category === category); }
export function getSkillsByAgent(agentId) { return SKILLS_CATALOG.filter(s => s.agents.includes(agentId)); }

/**
 * Find relevant skills for a task description.
 */
export function findRelevantSkills(taskDescription, limit = 5) {
  const lower = taskDescription.toLowerCase();
  const scored = [];

  for (const skill of SKILLS_CATALOG) {
    const matches = skill.triggers.filter(t => lower.includes(t));
    if (matches.length > 0) scored.push({ skill, score: matches.length });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map(s => s.skill);
}

/**
 * Load skill SKILL.md content from rawclaw-platform skills directory.
 * Returns skill documentation as a string for injecting into agent prompts.
 */
export function loadSkillContent(skillId, skillsBasePath) {
  const defaultPath = '/Users/amaankhan/Desktop/OmniFlow/Raw/rawclaw-platform/skills/active';
  const basePath = skillsBasePath || defaultPath;
  const skillPath = join(basePath, skillId, 'SKILL.md');

  if (!existsSync(skillPath)) return null;
  try {
    return readFileSync(skillPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Build a context string of relevant skills for a prompt.
 * Injects top N skill docs into agent context.
 */
export function buildSkillContext(taskDescription, maxSkills = 3) {
  const relevant = findRelevantSkills(taskDescription, maxSkills);
  const parts = [];

  for (const skill of relevant) {
    const content = loadSkillContent(skill.id);
    if (content) {
      parts.push(`## Skill: ${skill.id}\n\n${content.slice(0, 2000)}`);
    }
  }

  return parts.length > 0
    ? `# Relevant Skills\n\n${parts.join('\n\n---\n\n')}`
    : '';
}
