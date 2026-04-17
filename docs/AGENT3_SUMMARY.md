# Agent 3 Summary — API v4 Server + Orchestration Engine

_Completed: 2026-04-17_

---

## What Was Built

### A) `core/v4/api-server-v4.js` (715 lines)

Full Express server exposing all Carbon Core capabilities. Replaces `api-server-v2.js` as the primary entry point while maintaining full v2 backward compatibility.

**Architecture:**
- Direct SQLite via `better-sqlite3` (consistent with v2 pattern)
- All v2 DB registration callbacks wired (`registerBudgetDb`, `registerHeartbeatDb`, `registerAuditDb`, `registerHealthDb`)
- In-memory agent run registry (`_agentRuns` Map, max 500 entries) + SQLite persistence
- Idempotent schema application on startup (v2 + v4 schemas, all `IF NOT EXISTS` guarded)
- Lightweight JWT auth middleware (skipped in `NODE_ENV !== 'production'`)
- Budget guard on every agent/orchestration/ralph run

### B) `core/v4/schema-v4.sql` (133 lines)

Additive schema — never drops existing tables.

| Table | Purpose |
|-------|---------|
| `ralph_runs` | Top-level ralph loop executions |
| `ralph_iterations` | Per-iteration input/output/score |
| `agent_runs` | Individual `/api/v4/agent/run` executions |
| `knowledge_chunks` | Fine-grained knowledge base with `chunk_index` + `embedding_hint` |
| `knowledge_chunks_fts` | FTS5 virtual table over content/title/tags with auto-sync triggers |
| `skill_executions` | Skill invocation audit trail |
| `pipeline_runs` | Multi-stage pipeline/phased mode runs |

### C) `core/orchestrator-v2.js` — Upgrades

**New: `phased` mode** (`_runPhased`):
- Phase 1 — Planner decomposes task into subtasks
- Phase 2 — Worker agents run all subtasks in parallel
- Phase 3 — Synthesizer agent combines worker outputs into a coherent result
- Phase 4 — Critic reviews synthesis and annotates (non-blocking)

**Upgraded: `pipeline` mode** (`_runPipeline`):
- Typed handoffs via `_buildHandoffPrompt()` — each stage receives original task + prior stage results as structured context
- Per-stage retry with exponential backoff: up to 3 attempts, delays 1s → 2s → 4s
- Input schema validation before each stage (non-empty string check)

**New export:** `orchestratePhased()` — convenience wrapper that pre-populates a planner/worker/synthesizer agent set when none provided

---

## Route List

### v4 Routes

```
GET  /api/v4/ping
GET  /api/v4/health                     Full health + model router status + v4 stats
GET  /api/v4/agents                     List agents with capabilities
POST /api/v4/agent/run                  { agentId, prompt, tools[], context, budgetLimit }
POST /api/v4/orchestration/run          { mode, agents[], task, context, userId }
POST /api/v4/ralph/run                  { task, maxIterations, verifyWith, agentId, model }
GET  /api/v4/ralph/:loopId              Ralph loop status
DELETE /api/v4/ralph/:loopId            Stop ralph loop
GET  /api/v4/knowledge/search?q=&domain=&limit=
GET  /api/v4/knowledge/domains
GET  /api/v4/skills
POST /api/v4/skills/match               { intent, limit }
GET  /api/v4/budget
GET  /api/v4/budget/:agentId
POST /api/v4/budget/reserve             { agentId, estimatedTokens }
POST /api/v4/budget/policy              { scope, scope_id, window, limit_usd }
GET  /api/v4/runs?type=all|agent|orchestration|ralph&limit=
GET  /api/v4/runs/:id                   Unified lookup (agent | orchestration | ralph)
DELETE /api/v4/runs/:id                 Cancel run
GET  /api/v4/tools
POST /api/v4/tools/execute              { tool, input, permissions, workDir, agentId }
```

### v2 Compat Routes (all still functional)

```
GET/POST /api/v2/ping
GET      /api/v2/health
GET      /api/v2/summary
GET      /api/v2/budget
GET      /api/v2/budget/:id
POST     /api/v2/budget/:id/pause|resume
GET      /api/v2/heartbeat
GET      /api/v2/heartbeat/stats/:id
GET      /api/v2/activity
GET/POST /api/v2/orchestration
GET      /api/v2/orchestration/:id
GET      /api/v2/knowledge
GET/POST /api/v2/ralph
GET      /api/v2/ralph/:id
```

---

## Schema Changes

All additive. Run `schema-v4.sql` after `schema-v2.sql`. New tables:
- `ralph_runs`, `ralph_iterations`, `agent_runs`, `knowledge_chunks`, `knowledge_chunks_fts`, `skill_executions`, `pipeline_runs`

---

## How to Run

```bash
# Standalone (port 3001)
node core/v4/api-server-v4.js

# Or via ecosystem.config.js (pm2)
pm2 start ecosystem.config.js --only carbon-core-v4
```

Auth is disabled in development (`NODE_ENV !== 'production'`).
Set `JWT_SECRET` + `INTERNAL_SERVICE_TOKEN` for production.
