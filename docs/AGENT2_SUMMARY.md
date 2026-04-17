# Agent 2 Build Summary — Carbon Core v4

_Completed: 2026-04-17_

This document records what Agent 2 (FINAL-2C) built as part of the Carbon Core v4 Agent OS layer.

---

## Files Delivered

| File | Lines | Status |
|------|-------|--------|
| `core/agent-registry.js` | 293 | Rewritten |
| `core/skills-registry.js` | 167 | Rewritten |
| `core/v4/knowledge-search.js` | ~300 | New |
| `docs/AGENT2_SUMMARY.md` | — | New |

---

## core/agent-registry.js — Agent OS (8 Agents)

Complete rewrite. Replaces the old stub registry with production-grade agent definitions sourced from rawgrowth-os system prompts.

### Agent Roster

| ID | Name | Role | Primary Use |
|----|------|------|-------------|
| `scan` | Scan | Orchestrator / COO | Routes tasks to the right agent; never does the work itself. Dispatch-only. |
| `ali` | Ali | Dev Agent | Code, builds, API integrations, MCP servers, Claude Code skills, debugging. |
| `quilly` | Quilly | Content Agent | YouTube scripts, Reels, Twitter/LinkedIn posts, content calendars. Writes as the brand. |
| `larry` | Larry | Sales Agent | Cold email sequences, DM scripts, proposals, CRM updates, sales playbooks. |
| `ovi` | Ovi | Research Agent | Competitor analysis, market research, ICP research, Supabase data queries. |
| `cleo` | Cleo | Client Agent | Client onboarding, Discord monitoring, health scoring, churn prevention. |
| `sam` | Sam | Finance Agent | Budget tracking, API spend reports, infrastructure cost optimization, pricing. |
| `aria` | ARIA | Intelligence Agent | Research missions, WatchDog monitoring, Dossier document analysis (88 blueprints). |

### Key Functions

- `routeTask(taskDescription)` — keyword match against all agents, returns best-fit agent ID.
- `getRecommendedAgents(taskDescription, topN)` — top N agent matches with scores.
- `getAllAgents()` — full agent array.
- `getAgent(agentId)` — single agent by ID.

Each agent carries: `id`, `name`, `role`, `description`, `system_prompt`, `skills[]`, `routing_keywords[]`.

---

## core/skills-registry.js — 61-Skill Catalog

Complete rewrite. Replaces the hardcoded path stub with a proper runtime skill index.

### How It Works

- **61 skills** defined inline in `SKILLS_CATALOG` across 8 categories: `content`, `sales`, `marketing`, `seo`, `cro`, `research`, `tools`, `dev`.
- Each skill entry: `{ id, category, agents[], triggers[] }`.
- `findRelevantSkills(taskDescription, limit)` — trigger-based matching, returns ranked skill list.
- `loadSkillContent(skillId, skillsBasePath)` — lazy-loads `SKILL.md` from rawclaw-platform. Falls back to `SKILLS_BASE_PATH` env var or defaults to the rawclaw-platform path.
- `buildSkillContext(taskDescription, maxSkills)` — builds a string of up to N skill docs for injection into agent prompts.

### Note on Hardcoded Path

`loadSkillContent()` still contains a default fallback to the developer machine path when `SKILLS_BASE_PATH` is not set. This is a known issue flagged in `CLAUDE.md` as a BLOCKER. Fix: always set `SKILLS_BASE_PATH=./skills` in `.env`.

---

## core/v4/knowledge-search.js — FTS5 Knowledge Layer

New module. Provides chunk-based RAG retrieval over the v4 `knowledge_chunks` + `knowledge_chunks_fts` tables.

### Class: KnowledgeSearch

```js
const { KnowledgeSearch } = require('./knowledge-search');
const ks = new KnowledgeSearch(db); // raw better-sqlite3 or db-adapter
await ks.autoIngest();
```

#### Constructor

`constructor(db)` — accepts either:
- Raw `better-sqlite3` Database instance (what `api-server-v4.js` uses)
- `db-adapter` wrapper instance (detected via `.type` property)

#### Methods

| Method | Description |
|--------|-------------|
| `search(query, opts)` | FTS5 search with LIKE fallback. opts: `{ domain, limit=10, minScore=0.1 }`. Returns `[{ id, source_file, domain, title, content, score, snippet }]`. |
| `ingestDirectory(dirPath, domain)` | Walk all `.md` files, split into ~400-word chunks, INSERT OR REPLACE into `knowledge_chunks`. ID = sha1(filePath + chunkIndex). Returns `{ filesIndexed, chunksCreated, domain }`. |
| `autoIngest()` | COUNT(*) check on `knowledge_chunks`. If 0, ingests rawgrowth-os and rawclaw-platform skills. Paths are resolved relative to `core/v4/` via `../../Raw/`. |
| `getByDomain(domain)` | All chunks for a domain. |
| `listDomains()` | All domains with chunk counts. |
| `getSimilar(chunkId, limit)` | Keyword-based similarity search within same domain. |

#### Search Strategy

1. **FTS5** — `JOIN knowledge_chunks_fts ON rowid` with `MATCH ?`, ordered by `fts.rank`.
2. **LIKE fallback** — `content LIKE '%query%' OR title LIKE '%query%'` if FTS5 returns nothing or errors.

#### Auto-Ingest Paths (relative from `core/v4/`)

```
../../Raw/rawgrowth-os/knowledge/    → domain: 'knowledge'
../../Raw/rawclaw-platform/skills/active/  → domain: 'skills'
```

#### Chunking Logic

Split on `## ` headings first. If a section exceeds 400 words, subdivide into 400-word windows. Always produces at least one chunk per file.

### Tables Used (schema-v4.sql)

- `knowledge_chunks` — base table (id, source_file, domain, title, tags, content, chunk_index)
- `knowledge_chunks_fts` — FTS5 virtual table (external content, triggers keep in sync)

---

## Known Gaps / Follow-up Items

| Issue | Severity | Owner |
|-------|----------|-------|
| `skills-registry.js` fallback path is a hardcoded developer path | BLOCKER | Set `SKILLS_BASE_PATH` env var |
| `api-server-v4.js` still imports `knowledge-service.js` not `knowledge-search.js` | HIGH | Wire `KnowledgeSearch` into the v4 routes |
| `autoIngest()` paths assume `/OmniFlow/Raw/` directory exists | MEDIUM | Add `KNOWLEDGE_VAULT_PATH` env override |
| No embedding support yet | LOW | Future: add vector column + pgvector for semantic search |
| `getSimilar()` uses keyword heuristic, not cosine similarity | LOW | Future: upgrade when embeddings land |
