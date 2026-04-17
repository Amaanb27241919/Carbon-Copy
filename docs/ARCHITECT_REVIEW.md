# Carbon Core v4 — Architect Review
**Author**: Architect Agent  
**Date**: April 17, 2026  
**Status**: Pre-build audit + integration plan

---

## 1. Situation Report

The `core/v4/` directory **does not yet exist**. Builder Agents 1, 2, and 3 have been dispatched but their output files (`docs/AGENT1_SUMMARY.md`, `docs/AGENT2_SUMMARY.md`, `docs/AGENT3_SUMMARY.md`) are not yet present. This review is therefore a **pre-build audit** — documenting the existing v2 foundation, cataloguing integration risks, and prescribing the canonical v4 file structure for the agents to target.

Update this document after agent summaries arrive.

---

## 2. What Exists Today (v2 Foundation Audit)

### 2.1 Core Module Inventory

| File | Purpose | Quality | v4 Action |
|------|---------|---------|-----------|
| `db-adapter.js` | SQLite/PG unified interface | ✅ Solid | Keep, extend for vector |
| `orchestrator-v2.js` | 4-mode multi-agent orchestration | ✅ Clean | Extend with phased + tools modes |
| `ralph-loop.js` | Iterative agent loop (Ralph Wiggum) | ✅ Works | Upgrade to ralph-engine.js |
| `agent-registry.js` | 8 business agents (Scan/Ali/etc) | ✅ Good | Keep, expose via v4 API |
| `expert-agents.js` | 18+ technical agents (executor/verifier/etc) | ✅ Good | Keep, differentiate from agent-registry |
| `skills-registry.js` | 61-skill catalog with trigger routing | ✅ Good | ⚠️ hardcoded path — fix |
| `knowledge-service.js` | Markdown RAG, TF-IDF, in-memory+DB | ✅ Good | Keep, wire into knowledge-search.js |
| `knowledge-importer.js` | Separate markdown importer | ⚠️ Overlap | Consolidate into knowledge-service.js |
| `budget-v2.js` | Per-agent spend limits, auto-pause | ✅ Solid | Keep as-is |
| `heartbeat-v2.js` | Every agent run traced | ✅ Solid | Keep as-is |
| `audit-v2.js` | Immutable activity log | ✅ Solid | Keep as-is |
| `health-v2.js` | 5-subsystem health monitor | ✅ Solid | Keep, add v4 subsystems |
| `hooks-engine.js` | Pre/post hook system | ✅ Good | Wire into agent-tools.js |
| `plugin-system.js` | JSON manifest plugins | ✅ Good | Keep, integrate with hooks |
| `usage-tracker.js` | Claude JSONL cost scanner | ✅ Useful | Keep |
| `proposal-service.js` | AI proposal from transcript | ✅ Works | Keep |
| `session-compaction.js` | Session management | ✅ Good | Keep |
| `notifications.js` | Notification delivery | ✅ Good | Keep |
| `vm-manager-client.js` | VM lifecycle client | ✅ Good | Keep |
| `model-router-client.js` | AI routing client | ✅ Good | Keep |
| `utm-client.js` | UTM management client | ✅ Good | Keep |
| `lore-commits.js` | Git-based lore system | ℹ️ Nice-to-have | Low priority |

### 2.2 What v4 Must Add

Based on the builder agent tasks:

| New File | Agent | Purpose |
|----------|-------|---------|
| `core/v4/agent-tools.js` | Agent 1 | Claude Code tool execution architecture |
| `core/v4/ralph-engine.js` | Agent 1 | Upgraded ralph-loop with tool awareness |
| `core/v4/knowledge-search.js` | Agent 2 | Enhanced search (semantic + keyword hybrid) |
| `core/v4/api-server-v4.js` | Agent 3 | New Express API server (replaces api-server-v2) |
| `core/v4/schema-v4.sql` | Agent 3 | Unified schema for v4 (SQLite + PG) |

---

## 3. Integration Conflicts & Risks

### 3.1 CRITICAL: Duplicate Knowledge Systems

**Problem**: `knowledge-service.js` and `knowledge-importer.js` both exist with overlapping functionality:
- Both walk markdown directories
- Both write to `knowledge_docs` table
- `knowledge-service.js` has TF-IDF search; `knowledge-importer.js` has SQL LIKE search
- Different ID hashing (SHA1 vs MD5)

**Resolution**: v4 `knowledge-search.js` should consume **only** `knowledge-service.js`. The `knowledge-importer.js` should be deprecated — its import functionality absorbed by `knowledge-service.ingestKnowledgeVault()`.

**DB registration pattern mismatch**: `knowledge-service.js` uses `registerKnowledgeDb({ saveDoc, searchDocs, getDoc })` (function injection), while `knowledge-importer.js` uses `registerKnowledgeDb(db)` (whole DB object). These will conflict if both are initialized.

### 3.2 HIGH: Hardcoded Absolute Paths

Two files have paths hardcoded to the developer's machine:

```js
// knowledge-importer.js:14
const DEFAULT_SOURCE = '/Users/amaankhan/Desktop/OmniFlow/Raw/rawgrowth-os/knowledge';

// skills-registry.js:126
const defaultPath = '/Users/amaankhan/Desktop/OmniFlow/Raw/rawclaw-platform/skills/active';
```

**Resolution**: Both must use environment variables before v4 ships:
```
KNOWLEDGE_VAULT_PATH=./knowledge-vault
SKILLS_BASE_PATH=./skills
```
Default to relative paths that work in Docker. The skills directory should be committed to the repo.

### 3.3 MEDIUM: Two Agent Registries Without Clear Separation

`agent-registry.js` = business team agents (Scan, Ali, Quilly, Larry, Ovi, Cleo, Sam, ARIA)  
`expert-agents.js` = technical execution agents (executor, verifier, planner, architect, debugger, etc.)

These serve fundamentally different purposes but there's no documentation distinguishing them, and neither is wired into the API yet.

**Resolution**: v4 API server must expose both clearly:
- `GET /api/v4/agents/team` → business agents from agent-registry.js
- `GET /api/v4/agents/expert` → expert agents from expert-agents.js
- `POST /api/v4/agents/team/:id/run` → run a business agent
- `POST /api/v4/agents/expert/:id/run` → run an expert agent

### 3.4 MEDIUM: Orchestrator v2 vs v4 Upgrade

`orchestrator-v2.js` uses `claude --print` subprocess directly. The v4 upgrade should route through `agent-tools.js` (Claude SDK calls) instead of subprocess spawning.

Risk: If Agent 3 rewrites orchestrator-v2.js in-place, it breaks the existing API server. It must be a new file: `core/v4/orchestrator-v4.js`.

### 3.5 LOW: DB Adapter Async Mismatch

SQLite methods in `db-adapter.js` are synchronous (better-sqlite3), but PostgreSQL methods are async. Code that calls `db.get()` without `await` will silently fail in production (PG mode). The v4 API server must `await` all DB calls unconditionally.

### 3.6 LOW: Plugin and Hook Overlap

`plugin-system.js` has events: `pre_message`, `post_message`, `on_task`, `on_agent_run`  
`hooks-engine.js` has events: `pre_message`, `post_message`, `pre_tool`, `post_tool`, `budget_warning`

These are parallel systems doing similar things. For v4, `agent-tools.js` should be the single integration point — hooks fire via the hooks engine, plugins subscribe via plugin system. Don't merge them, but document the boundary clearly.

---

## 4. v4 Integration Architecture

### 4.1 How the Pieces Wire Together

```
api-server-v4.js  (HTTP layer, routes, SSE)
    │
    ├── orchestrator-v4.js  (run coordination, phased/pipeline/parallel)
    │       └── agent-tools.js  (Claude SDK calls, tool execution)
    │               ├── hooks-engine.js  (pre/post tool hooks)
    │               ├── budget-v2.js  (spend check before every call)
    │               └── heartbeat-v2.js  (log every run)
    │
    ├── ralph-engine.js  (iterative loop, uses agent-tools.js internally)
    │       └── budget-v2.js
    │
    ├── agent-registry.js  (business team: Scan/Ali/Quilly/etc.)
    │       └── skills-registry.js  (inject skill context into prompts)
    │
    ├── expert-agents.js  (executor/verifier/planner/etc.)
    │
    ├── knowledge-search.js  (v4 search layer)
    │       └── knowledge-service.js  (underlying RAG engine)
    │
    ├── db-adapter.js  (SQLite dev / PG prod)
    ├── audit-v2.js
    ├── usage-tracker.js
    └── proposal-service.js
```

### 4.2 Agent-Tools.js Design Contract

Agent 1 must produce a module with this interface:

```js
// core/v4/agent-tools.js

// Execute one Claude turn with tools available
async function runWithTools(prompt, options = {}) {
  // options: { agentId, tools, systemPrompt, model, workDir, budgetCheck }
  // Returns: { text, toolCalls, inputTokens, outputTokens, cost }
}

// Available tool definitions for Claude's tool_use API
const BUILTIN_TOOLS = {
  bash: { ... },
  read_file: { ... },
  write_file: { ... },
  search_knowledge: { ... },  // ← calls knowledge-search.js
  run_agent: { ... },         // ← calls orchestrator
}

module.exports = { runWithTools, BUILTIN_TOOLS }
```

### 4.3 Ralph Engine Design Contract

Agent 1 must produce a ralph-engine that:
- Uses `runWithTools()` instead of raw `claude --print` subprocess
- Tracks tool calls per iteration (not just text output)
- Has a `completionFn` option (function that evaluates output) in addition to `completionPromise` string
- Persists loop state to DB via `schema-v4.sql` ralph_loops table

### 4.4 Knowledge-Search v4 Design Contract

Agent 2 must produce a search layer that:
- Wraps `knowledge-service.js` search (TF-IDF keyword)
- Adds optional semantic search stub (returns keyword results if no vector DB configured)
- Exposes: `search(query, opts)`, `indexDocument(doc)`, `getStats()`
- Is the ONLY knowledge module called by api-server-v4.js and agent-tools.js

### 4.5 API Server v4 Design Contract

Agent 3 must produce an Express server with:

```
GET  /api/v4/ping
GET  /api/v4/health
GET  /api/v4/agents/team
GET  /api/v4/agents/expert
POST /api/v4/agents/team/:id/run
POST /api/v4/agents/expert/:id/run
GET  /api/v4/orchestration
GET  /api/v4/orchestration/:runId
POST /api/v4/orchestration
GET  /api/v4/ralph
GET  /api/v4/ralph/:loopId
POST /api/v4/ralph
DELETE /api/v4/ralph/:loopId
GET  /api/v4/knowledge/search?q=
GET  /api/v4/knowledge/stats
POST /api/v4/knowledge/ingest
GET  /api/v4/skills
GET  /api/v4/skills/:id
POST /api/v4/skills/search
GET  /api/v4/budget
POST /api/v4/budget/policies
GET  /api/v4/heartbeat
GET  /api/v4/activity
GET  /api/v4/stream  (SSE)
```

All routes return `{ status: 'ok'|'error', data: ... }` — consistent with aria-service pattern.

---

## 5. Canonical v4 Directory Layout

```
core/
├── v4/                          ← NEW (v4-specific modules)
│   ├── agent-tools.js           ← Claude tool execution (Agent 1)
│   ├── ralph-engine.js          ← Upgraded iterative loop (Agent 1)
│   ├── knowledge-search.js      ← Enhanced search layer (Agent 2)
│   ├── api-server-v4.js         ← New Express API (Agent 3)
│   ├── orchestrator-v4.js       ← Pipeline upgrade (Agent 3, NEW FILE)
│   └── schema-v4.sql            ← Unified schema (Agent 3)
│
├── agent-registry.js            ← Business agents (keep, updated by Agent 2)
├── skills-registry.js           ← 61 skills catalog (keep, fix hardcoded path)
├── knowledge-importer.js        ← DEPRECATE after v4 ships
├── knowledge-service.js         ← Core RAG engine (keep)
├── expert-agents.js             ← Technical agents (keep)
├── orchestrator-v2.js           ← Keep for backward compat, not changed
├── ralph-loop.js                ← Keep, superseded by ralph-engine.js
├── db-adapter.js                ← Keep, unchanged
├── budget-v2.js                 ← Keep, unchanged
├── heartbeat-v2.js              ← Keep, unchanged
├── audit-v2.js                  ← Keep, unchanged
├── health-v2.js                 ← Keep, extend in v4 health check
├── hooks-engine.js              ← Keep, wired via agent-tools
├── plugin-system.js             ← Keep, unchanged
├── usage-tracker.js             ← Keep
├── proposal-service.js          ← Keep
├── session-compaction.js        ← Keep
├── notifications.js             ← Keep
├── model-router-client.js       ← Keep
├── vm-manager-client.js         ← Keep
├── utm-client.js                ← Keep
└── lore-commits.js              ← Low priority, defer
```

---

## 6. Schema v4 — Required Tables

`schema-v4.sql` must create these tables (extending v2 schema):

```sql
-- Agent tool call log (new in v4)
CREATE TABLE IF NOT EXISTS cc_tool_calls (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  tool_name     TEXT NOT NULL,
  tool_input    TEXT,
  tool_result   TEXT,
  duration_ms   INTEGER,
  created_at    INTEGER NOT NULL
);

-- Ralph loop v4 (replaces/supplements cc_ralph_loops)
-- Add tool_calls_count, completion_fn_used columns to existing table
ALTER TABLE cc_ralph_loops ADD COLUMN IF NOT EXISTS tool_calls_count INTEGER DEFAULT 0;
ALTER TABLE cc_ralph_loops ADD COLUMN IF NOT EXISTS completion_fn_used BOOLEAN DEFAULT FALSE;

-- Knowledge document chunks (for future vector search)
CREATE TABLE IF NOT EXISTS cc_knowledge_chunks (
  id            TEXT PRIMARY KEY,
  doc_id        TEXT NOT NULL,
  chunk_index   INTEGER NOT NULL,
  content       TEXT NOT NULL,
  embedding     BLOB,    -- NULL until vector search added
  created_at    INTEGER NOT NULL,
  FOREIGN KEY (doc_id) REFERENCES cc_knowledge_docs(id)
);

-- Skill execution log
CREATE TABLE IF NOT EXISTS cc_skill_executions (
  id            TEXT PRIMARY KEY,
  skill_id      TEXT NOT NULL,
  agent_id      TEXT,
  task_preview  TEXT,
  result_preview TEXT,
  cost_usd      REAL DEFAULT 0,
  duration_ms   INTEGER,
  created_at    INTEGER NOT NULL
);
```

---

## 7. Code Quality Concerns

### Must Fix Before Ship

1. **Hardcoded paths** in `knowledge-importer.js` and `skills-registry.js` — will break Docker deployment.

2. **knowledge-importer.js registration collision** — if both `knowledge-service.js` and `knowledge-importer.js` are imported and both call `registerKnowledgeDb()`, the second call silently overwrites the first. The v4 API server must only import one.

3. **orchestrator-v2.js concurrent run limit** — `MAX_RUNS = 200` with in-memory map only. Restarts lose all run history. v4 must persist to DB.

4. **ralph-loop.js iteration output truncated at 500 chars** — the stored `output` field in `state.outputs` is `.slice(0, 500)`. Fine for status but inadequate for reviewing what an iteration actually did. v4 ralph-engine.js should store full output to DB, truncate only in the API response.

5. **No input sanitization on orchestrator task field** — tasks are passed directly to `claude --print` subprocess. While Claude CLI handles this, the task string should be validated (max length, no null bytes) at the API layer.

### Should Fix (Not Blocking)

6. **knowledge-service.js auto-ingest on module load** — `autoIngest()` fires at require time. This runs during test imports and in contexts where it shouldn't. Move to explicit call in api-server startup.

7. **orchestrator-v2.js Promise.allSettled wrapping** — the parallel mode has a subtle bug: `settled.value || { ok: false, err: 'unknown', i: 0 }` defaults `i` to `0`, meaning all failed promises blame agent 0. Should use the actual index.

8. **db-adapter.js sync/async mismatch** — the SQLite `prepare()` returns a synchronous statement but wraps it in an object interface. Callers can't tell if they need `await`. Document this clearly or normalize to always return promises.

---

## 8. Gaps to Address in Next Session

### After Agent Builds Complete

- [ ] Review actual `core/v4/*.js` files produced by agents
- [ ] Verify `agent-tools.js` uses Anthropic SDK (not subprocess) 
- [ ] Verify `ralph-engine.js` is a drop-in replacement for `ralph-loop.js` (same external API + backward compat)
- [ ] Verify `api-server-v4.js` does NOT start the server at module load (export the app, let index-v4.js start it)
- [ ] Verify `schema-v4.sql` is SQLite-compatible by default (PostgreSQL extensions only if `DB_ADAPTER=postgres`)

### Functionality Gaps (Not Yet Built)

- [ ] **index-v4.js** — the master entry point that: inits DB, runs schema-v4, registers all services, starts api-server-v4
- [ ] **knowledge-vault/** — seed directory with at least a README; Docker should mount this
- [ ] **skills/** — copy active skills from rawclaw-platform into repo so path is no longer absolute
- [ ] **env.example** — document all env vars for v4
- [ ] **Web UI v4 pages** — Agents, Skills, Ralph pages in `web-app/src/app/`
- [ ] **PM2 config** — add Carbon Core v4 process to `ecosystem.config.js`

### Architecture Decisions to Lock

- [ ] Should `agent-tools.js` use Anthropic SDK directly, or route through `model-router-client.js`? **Recommendation**: route through model-router — maintains the local-first promise and single billing point.
- [ ] Should v4 API replace v2 API (`/api/v2/*`) or run alongside? **Recommendation**: run alongside on same port, different prefix. Migrate web-app pages one at a time.

---

## 9. Alignment with VISION.md

| Vision Pillar | v4 Status |
|--------------|-----------|
| Privacy: data never leaves machine | ✅ All AI routes through model-router (local Ollama first) |
| Cost: unlimited local inference | ✅ budget-v2 + model-router enforce local-first |
| Control: own your infra | ✅ Docker Compose, no SaaS deps |
| Speed: deploy in 10 minutes | ⚠️ Currently requires manual schema steps — index-v4.js must auto-migrate |
| SQLite dev / PG prod | ✅ db-adapter.js handles both |
| 7 named agents (Scan, Ali, etc.) | ✅ agent-registry.js has 8 |
| 61 skills | ✅ skills-registry.js has 61 |
| Orchestration: parallel/sequential/hierarchical/pipeline | ✅ orchestrator-v2.js + v4 pipeline upgrade |
| Budget governance | ✅ budget-v2.js |
| Open source community edition | ⚠️ Hardcoded paths and absolute paths to dev machine block this |

**Biggest blocker for open source**: absolute paths to `/Users/amaankhan/Desktop/OmniFlow/Raw/`. These must be replaced with configurable paths before any public release.
