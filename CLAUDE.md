# CLAUDE.md — Carbon Core Developer Guide

_Last updated: April 17, 2026 (v4 architect review)_

---

## What This Is

**Carbon Core** is a secure, self-hosted AI project build and deployment platform. It gives developers and small teams an isolated environment to build, test, and run AI projects without touching personal machines or corporate servers.

Core capabilities:
- **VM Management** — UTM (Apple Silicon native) + Docker KVM
- **AI Intelligence** — ARIA 5-agent research pipeline, WatchDog, Dossier, 88 blueprints
- **Model Routing** — local-first (Ollama to Claude to OpenAI), budget-governed
- **Multi-Agent Orchestration** — parallel, sequential, hierarchical, pipeline, phased
- **7 Business Agents + 18 Expert Agents** — Scan/Ali/Quilly/Larry/Ovi/Cleo/Sam + executor/verifier/planner/etc.
- **61 Skills** — indexed catalog with keyword routing
- **iPhone/iPad PWA** — Next.js, installable from Safari
- **Budget Governance** — per-agent spend limits, auto-pause, audit trail
- **Knowledge Base** — markdown RAG with TF-IDF search
- **Ralph Loop** — iterative self-improving agent execution

---

## Current Status (Apr 17, 2026)

### v2 API (live and working)
- Carbon Core API: `http://localhost:3001/api/v2/ping`
- Web app: `http://localhost:3006/app`
- All pages functional: Chat, Models, Missions, Agents, Core, VMs

### v4 (Agent 1 + Agent 3 complete — 2026-04-17)
- `core/v4/agent-tools.js` — DONE (BashTool/FileEditTool/AgentTool, hooks integration, 5 permission modes)
- `core/v4/vision-tool.js` — DONE (macOS screenshots via Peekaboo, base64 output for vision models)
- `core/v4/token-math.js` — DONE (cost calculation, MODEL_PRICING table, tallyCosts)
- `core/v4/progress-reporter.js` — DONE (OSC 9;4 progress bars, ASCII fallback)
- `core/v4/html-to-markdown.js` — DONE (readability + turndown + regex strip fallback)
- `core/v4/api-server-v4.js` — DONE (full v4 API server, 715 lines, backward-compat v2)
- `core/v4/schema-v4.sql` — DONE (additive schema: 7 new tables + FTS5)
- `core/orchestrator-v2.js` — UPGRADED (phased mode + pipeline retry/typed handoffs)
- `ecosystem.config.js` — UPDATED (carbon-core points to core/v4/api-server-v4.js, paths use __dirname)

### Working without Docker (bash dev.sh)
- Full dashboard at /app
- Budget governance, heartbeat tracking, audit log
- UTM VM management (start/shutdown/stop/delete via utmctl)
- Chat via Ollama/Claude/OpenAI
- Multi-agent orchestration (4 modes)
- Ralph loop, expert agents

### Working with Docker (docker compose up)
- All 8+ services operational
- ARIA research pipeline, WatchDog, Dossier
- PostgreSQL persistence, MinIO S3 storage
- Auto-login: admin / OmniFlow2026!

---

## Architecture

### Docker Stack (full production)

```
Browser/iPhone
    |
    v
nginx:80 (reverse proxy)
    |
    +-- /app          --> web-app:3006 (Next.js PWA)
    +-- /api          --> gateway:3000 (JWT auth, service routing)
    +-- /api/v2       --> carbon-core:3001 (Carbon Core v2/v3 API)
    +-- /api/v4       --> carbon-core:3001 (Carbon Core v4 API, same process)

gateway:3000 --> auth:3001
             --> aria-service:3008    (ARIA platform)
             --> model-router:3004    (all AI calls)
             --> data-server:3002
             --> vm-manager:3003
             --> kvm-manager:3007
             --> sandbox:3005
             --> openclaw:8001
             --> nemoclaw:8002

aria-service --> model-router:3004  (never calls Anthropic/OpenAI directly)
aria-service --> postgres:5432       (carbon_db, aria_* tables)
aria-service --> minio:9000          (S3 storage)
```

### v4 Core Architecture (api-server-v4.js, in progress)

```
api-server-v4.js  (routes --> /api/v4/*)
    |
    +-- orchestrator-v4.js    (pipeline/phased modes)
    |       +-- agent-tools.js  (tool execution, hooks, budget)
    |
    +-- ralph-engine.js       (iterative loop with tool awareness)
    |       +-- agent-tools.js
    |
    +-- agent-registry.js     (7 business agents: Scan/Ali/etc.)
    |       +-- skills-registry.js
    |
    +-- expert-agents.js      (18 expert agents)
    |
    +-- knowledge-search.js   (v4 search layer)
    |       +-- knowledge-service.js
    |
    +-- db-adapter.js         (SQLite dev / PG prod)
    +-- budget-v2.js
    +-- heartbeat-v2.js
    +-- audit-v2.js
```

---

## Directory Structure

```
carbon-copy/
+-- api-server-v2.js        Carbon Core v3 API entry point (port 3001)
+-- schema-v2.sql           SQLite schema for v2 tables
+-- ecosystem.config.js     PM2 config (carbon-core + carbon-web)
+-- docker-compose.yml      Full stack
+-- Dockerfile.core         Carbon Core Docker image
+-- dev.sh                  Local dev startup script
|
+-- core/                   Carbon Core business logic
|   +-- v4/                 v4-specific modules
|   |   +-- agent-tools.js        Tool registry (BashTool/FileEditTool/AgentTool) + permissions
|   |   +-- api-server-v4.js      Unified Express API — all v4 + v2 compat routes (port 3001)
|   |   +-- schema-v4.sql         Additive SQLite schema: 7 new tables + FTS5
|   |   +-- vision-tool.js        macOS screenshot/window capture via Peekaboo
|   |   +-- token-math.js         LLM token counting + cost calculation (MODEL_PRICING table)
|   |   +-- progress-reporter.js  Terminal progress bars (OSC 9;4 + ASCII fallback)
|   |   +-- html-to-markdown.js   HTML→Markdown via readability+turndown (fallback: regex strip)
|   |
|   +-- agent-registry.js   7 business agents + ARIA
|   +-- expert-agents.js    18 technical expert agents
|   +-- skills-registry.js  61-skill catalog (WARNING: hardcoded path)
|   +-- knowledge-service.js Markdown RAG, TF-IDF, in-memory+DB
|   +-- knowledge-importer.js DEPRECATE after v4 (WARNING: hardcoded path)
|   +-- orchestrator-v2.js  4-mode multi-agent orchestration
|   +-- ralph-loop.js       Iterative loop (superseded by ralph-engine)
|   +-- db-adapter.js       SQLite/PostgreSQL unified interface
|   +-- budget-v2.js        Per-agent spend limits + auto-pause
|   +-- heartbeat-v2.js     Agent run tracking
|   +-- audit-v2.js         Immutable activity log
|   +-- health-v2.js        5-subsystem health monitor
|   +-- hooks-engine.js     Pre/post event hooks
|   +-- plugin-system.js    JSON manifest plugin loader
|   +-- model-router-client.js Ollama/Claude/OpenAI routing
|   +-- vm-manager-client.js   Docker KVM lifecycle
|   +-- utm-client.js          UTM VM control via utmctl
|   +-- usage-tracker.js    Claude JSONL cost scanner
|   +-- proposal-service.js AI proposals from transcripts
|   +-- session-compaction.js
|   +-- notifications.js
|   +-- lore-commits.js
|
+-- web-app/src/app/        Next.js PWA
|   +-- page.tsx            Dashboard
|   +-- missions/           Mission list + submit
|   +-- chat/               Streaming chat
|   +-- agents/             Agent status
|   +-- watchdog/           WatchDog monitors
|   +-- dossier/            Document vault
|   +-- blueprints/         Blueprint browser
|   +-- budget/             Spend tracking
|   +-- models/             Model switcher
|   +-- projects/           Sandbox runner
|   +-- files/              MinIO browser
|   +-- settings/           Provider config
|
+-- aria-service/           ARIA intelligence platform (Docker)
|   +-- src/orchestrator.js 5-agent mission system
|   +-- src/watchdog.js     Entity monitoring
|   +-- src/dossier.js      Document intelligence
|   +-- src/routes/         missions, agents, watchdog, dossier, blueprints, budget
|
+-- model-router/           Universal AI router (Docker)
|   +-- src/providers/      openai.js, anthropic.js, ollama.js, huggingface.js
|
+-- gateway/                API gateway (JWT auth)
+-- auth/                   JWT + bcrypt + Redis
+-- data-server/            PostgreSQL + MinIO
+-- vm-manager/             Docker container lifecycle
+-- kvm-manager/            QEMU/KVM VM manager
+-- sandbox/                Safe GitHub repo runner
+-- services/openclaw/      Code AI (Python/FastAPI)
+-- services/nemoclaw/      NLP AI (Python/FastAPI)
+-- database/init/          PostgreSQL init scripts
|   +-- 01_schema.sql
|   +-- 02_model_registry.sql
|   +-- 03_sandbox.sql
|   +-- 04_vms.sql
|   +-- 05_aria.sql
+-- monitoring/             Prometheus + Grafana configs
+-- nginx/                  Reverse proxy config
+-- docs/                   Developer documentation
    +-- ARCHITECT_REVIEW.md
    +-- TECH_STACK.md
    +-- FEATURES.md
    +-- BUILD.md
    +-- SOP.md
```

---

## How to Run

### Dev Mode (pm2, no Docker)

```bash
npm install
cd web-app && npm install && cd ..
pm2 start ecosystem.config.js

# Or use the dev script
bash dev.sh

# Logs
pm2 logs carbon-core
pm2 logs carbon-web
```

- Core API: `http://localhost:3001/api/v2/ping`
- Web app: `http://localhost:3006/app`

### Docker Mode (full stack)

```bash
bash scripts/generate-secrets.sh
cp .env.example .env
# Edit .env with your API keys

docker compose up -d
docker ps --format "{{.Names}}\t{{.Status}}" | grep carbon | sort
docker logs carbon-core --tail 50 -f
```

- App: `http://localhost/app` (via nginx)
- Login: admin / OmniFlow2026!

### Rebuild One Service

```bash
docker compose build --no-cache <service-name>
docker compose up -d --force-recreate <service-name>
```

### Apply DB Schema Changes

```bash
# PostgreSQL (Docker mode)
docker exec -i carbon-postgres psql -U carbon -d carbon_db < database/init/05_aria.sql

# SQLite (dev mode) — run schema-v2.sql using the sqlite3 CLI
sqlite3 carbon-copy.db < schema-v2.sql
```

---

## v2 API Reference

Base: `http://localhost:3001/api/v2`

All responses: `{ status: 'ok'|'error', data: ... }`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ping` | GET | Version + uptime |
| `/health` | GET | 5-subsystem health check |
| `/summary` | GET | Full dashboard snapshot |
| `/budget` | GET | Budget policies + incidents |
| `/budget/policy` | POST | Create spend limit |
| `/budget/agents/:id/resume` | POST | Resume paused agent |
| `/heartbeat` | GET | Agent execution runs |
| `/activity` | GET | Audit log |
| `/orchestration` | POST | Start multi-agent run |
| `/orchestration` | GET | List runs |
| `/orchestration/:id` | GET | Run detail + results |
| `/missions` | GET/POST | List/create missions |
| `/vms` | GET | All VMs (UTM + Docker KVM) |
| `/vms/utm/:id/start` | POST | Start UTM VM |
| `/vms/utm/:id/shutdown` | POST | Graceful shutdown |
| `/vms/utm/:id/stop` | POST | Force stop |
| `/vms/utm/:id/delete` | DELETE | Delete VM |
| `/models/providers` | GET | Available AI providers |
| `/models/local` | GET | Local Ollama models |
| `/agents/expert` | GET | 18 expert agent prompts |
| `/agents/route` | POST | Route task to best agent |
| `/ralph` | GET/POST | List/start Ralph loops |
| `/ralph/:id` | GET | Loop status |
| `/ralph/:id/stop` | POST | Stop loop |
| `/chat` | POST | Chat via AI provider |
| `/usage` | GET | Claude token/cost analytics |
| `/stream` | GET | SSE real-time feed |
| `/proposal` | POST | Generate proposal from transcript |

---

## v4 API Reference (in progress)

Base: `http://localhost:3001/api/v4`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/ping` | GET | Version + uptime |
| `/health` | GET | 7-subsystem health |
| `/agents/team` | GET | 7 business agents |
| `/agents/expert` | GET | 18+ expert agents |
| `/agents/team/:id/run` | POST | Run a business agent |
| `/agents/expert/:id/run` | POST | Run an expert agent |
| `/orchestration` | GET/POST | List/start runs |
| `/orchestration/:runId` | GET | Run + agent results |
| `/orchestration/:runId` | DELETE | Cancel run |
| `/ralph` | GET/POST | List/start Ralph loops |
| `/ralph/:loopId` | GET | Loop status + iterations |
| `/ralph/:loopId` | DELETE | Stop loop |
| `/knowledge/search` | GET | RAG search (query param: q) |
| `/knowledge/stats` | GET | Index stats |
| `/knowledge/ingest` | POST | Ingest a directory |
| `/skills` | GET | All 61 skills |
| `/skills/:id` | GET | Skill detail |
| `/skills/search` | POST | Find skills by task description |
| `/budget` | GET | Spend dashboard |
| `/budget/policies` | POST | Create policy |
| `/budget/agents/:id/resume` | POST | Resume paused agent |
| `/heartbeat` | GET | Recent runs |
| `/activity` | GET | Audit log |
| `/stream` | GET | SSE real-time feed |

---

## Agent System

### Business Agents (core/agent-registry.js)

7 agents covering the full business OS. Each has a role, system prompt, skills, and routing keywords:

| Agent | Role | Primary Skills |
|-------|------|----------------|
| `scan` | Orchestrator / COO | orchestrate, dispatch, synthesize |
| `ali` | Dev Agent | coding, debugging, deployment |
| `quilly` | Content Agent | content-creation, social-content, yt-pipeline |
| `larry` | Sales Agent | cold-email, proposal, sales-enablement |
| `ovi` | Research Agent | research, competitor-alternatives, signal-scan |
| `cleo` | Client Agent | churn-prevention, customer-research |
| `sam` | Finance Agent | pricing-strategy, analytics-tracking |
| `aria` | Intelligence Agent | research, rag-query, watchdog |

**Add a new business agent:**
1. Open `core/agent-registry.js`
2. Add entry to `AGENT_REGISTRY` with: id, name, role, description, system_prompt, skills[], routing_keywords[]
3. The agent is automatically available at `GET /api/v4/agents/team`

### Expert Agents (core/expert-agents.js)

18 technical execution agents: executor, verifier, planner, architect, debugger, code-reviewer, product-manager, analyst, test-engineer, designer, security-reviewer, quality-reviewer, git-master, researcher, writer, critic, build-fixer, performance-reviewer.

**Add a new expert agent:**
1. Open `core/expert-agents.js`
2. Add entry to `EXPERT_AGENTS` with: id, name, description, use_when[], system_prompt
3. Automatically available at `GET /api/v4/agents/expert`

---

## Knowledge Base

### Adding Knowledge

1. Create `knowledge-vault/` at project root
2. Organize by category (subdirectory name = category):
   - `knowledge-vault/brand/` — brand docs
   - `knowledge-vault/sales/` — sales playbooks
   - `knowledge-vault/ops/` — SOPs
   - `knowledge-vault/content/` — content guides
   - `knowledge-vault/strategy/` — strategy docs
3. Drop `.md` files in the appropriate subdirectory
4. Trigger ingest:

```bash
curl -X POST http://localhost:3001/api/v4/knowledge/ingest \
  -H "Content-Type: application/json" \
  -d '{"path": "./knowledge-vault", "category": "brand"}'
```

**Important**: `knowledge-service.js` is the canonical RAG engine. `knowledge-importer.js` is deprecated — do not use it in new code. The v4 `knowledge-search.js` wraps `knowledge-service.js`.

---

## Skills

61 skills across 8 categories: content, sales, marketing, seo, cro, research, tools, dev.

**Add a new skill:**
1. Add entry to `SKILLS_CATALOG` in `core/skills-registry.js`
2. Create `skills/<skill-id>/SKILL.md` with documentation
3. Set `SKILLS_BASE_PATH=./skills` in `.env` — never use a hardcoded absolute path

---

## Budget Governance

```bash
# Create a daily spend limit for an agent
curl -X POST http://localhost:3001/api/v2/budget/policy \
  -H "Content-Type: application/json" \
  -d '{ "agentId": "ali", "window": "daily", "limitUsd": 5.00 }'

# Resume a paused agent
curl -X POST http://localhost:3001/api/v2/budget/agents/ali/resume
```

---

## Ralph Loop

Iterative agent execution until a completion signal appears or max iterations hit.

```bash
# Start a loop
curl -X POST http://localhost:3001/api/v2/ralph \
  -H "Content-Type: application/json" \
  -d '{
    "task": "Build a cold email campaign",
    "completionPromise": "CAMPAIGN_COMPLETE",
    "maxIterations": 10,
    "agentId": "larry"
  }'

# Check status
curl http://localhost:3001/api/v2/ralph/<loopId>

# Stop loop
curl -X POST http://localhost:3001/api/v2/ralph/<loopId>/stop
```

---

## ARIA Service Rules

1. **Never call Anthropic/OpenAI directly** — always use model-client.js via model-router:3004
2. **PostgreSQL only** — no SQLite in aria-service
3. **Same Express pattern** as other services (health, metrics, serviceAuth)
4. **All routes return** `{ status: 'ok'|'error', data: ... }`
5. **Budget tracking** — log every AI call to aria_budget table

---

## Carbon Core API v4 (`/api/v4/*`)

All routes served by `core/v4/api-server-v4.js` on port 3001.
Auth is disabled in development (`NODE_ENV !== 'production'`).

```
GET    /api/v4/ping
GET    /api/v4/health
GET    /api/v4/agents
POST   /api/v4/agent/run                    { agentId, prompt, tools[], context, budgetLimit }
POST   /api/v4/orchestration/run            { mode, agents[], task, context, userId }
POST   /api/v4/ralph/run                    { task, maxIterations, verifyWith, agentId, model }
GET    /api/v4/ralph/:loopId
DELETE /api/v4/ralph/:loopId
GET    /api/v4/knowledge/search?q=&domain=&limit=
GET    /api/v4/knowledge/domains
GET    /api/v4/skills
POST   /api/v4/skills/match                 { intent, limit }
GET    /api/v4/budget
GET    /api/v4/budget/:agentId
POST   /api/v4/budget/reserve               { agentId, estimatedTokens }
POST   /api/v4/budget/policy                { scope, scope_id, window, limit_usd }
GET    /api/v4/runs?type=all|agent|orchestration|ralph&limit=
GET    /api/v4/runs/:id
DELETE /api/v4/runs/:id
GET    /api/v4/tools
POST   /api/v4/tools/execute                { tool, input, permissions, workDir, agentId }
```

All /api/v2/* routes remain functional (reimplemented in the same process).

### Orchestration modes
- `parallel` — all agents simultaneously, results merged
- `sequential` — chain, each agent sees previous output
- `hierarchical` — planner decomposes → workers in parallel
- `pipeline` — typed handoffs, per-stage retry (3×, exponential backoff)
- `phased` — Plan → Execute (parallel) → Synthesize → Critique

### v4 DB tables (carbon-copy.db)
`ralph_runs`, `ralph_iterations`, `agent_runs`, `knowledge_chunks`, `knowledge_chunks_fts` (FTS5), `skill_executions`, `pipeline_runs`

---

## ARIA API Routes (via gateway /api/*)

```
GET  /api/agents              5 agent statuses + budget summary
GET  /api/missions            list missions
POST /api/missions            submit mission
GET  /api/missions/:id        mission details + output
GET  /api/blueprints          list blueprints
GET  /api/watchdog            list monitors
POST /api/watchdog            create monitor
GET  /api/dossier             list client files
POST /api/dossier             upload file (multipart)
GET  /api/clients             list clients
POST /api/clients             create client
GET  /api/aria-budget         budget status
GET  /api/aria/health         health check
```

---

## ARIA Database Tables (carbon_db)

```sql
aria_missions          -- mission runs
aria_agents_state      -- live agent status
aria_clients           -- ARIA clients
aria_audit_log         -- full action history
aria_watchdog_monitors -- entity monitoring configs
aria_dossier_files     -- uploaded documents
aria_blueprints        -- research templates (88 seeded)
aria_budget            -- daily/monthly spend per provider
```

---

## Environment Variables

### Core Service
```bash
PORT=3001
DB_ADAPTER=sqlite                # sqlite | postgres
SQLITE_PATH=./carbon-copy.db
DATABASE_URL=postgresql://...    # only if DB_ADAPTER=postgres
MODEL_ROUTER_URL=http://model-router:3004
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
KNOWLEDGE_VAULT_PATH=./knowledge-vault  # do NOT hardcode
SKILLS_BASE_PATH=./skills               # do NOT hardcode
BUDGET_DAILY_USD=50
BUDGET_MONTHLY_USD=1000
```

### Auto-generated secrets (scripts/generate-secrets.sh)
```bash
JWT_SECRET
JWT_REFRESH_SECRET
INTERNAL_SERVICE_TOKEN
POSTGRES_PASSWORD
REDIS_PASSWORD
MINIO_ROOT_USER
MINIO_ROOT_PASSWORD
GRAFANA_PASSWORD
CODE_SERVER_PASSWORD
```

### AI Providers
```bash
DEFAULT_PROVIDER=ollama              # ollama | openai | claude | huggingface
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
HF_API_KEY=
OLLAMA_DEFAULT_MODEL=llama3.2
ANTHROPIC_DEFAULT_MODEL=claude-sonnet-4-6
OPENAI_DEFAULT_MODEL=gpt-4o
```

### ARIA
```bash
ARIA_SERVICE_URL=http://aria-service:3008
TELEGRAM_TOKEN=
RESEND_API_KEY=
```

### Homelab (optional, --profile homelab)
```bash
TAILSCALE_AUTH_KEY=
DUCKDNS_TOKEN=
DUCKDNS_SUBDOMAIN=
PIHOLE_PASSWORD=
SAMBA_PASSWORD=
```

---

## Credentials (dev defaults)

| Service | Username | Password |
|---------|----------|----------|
| Web app | `admin` | `OmniFlow2026!` |
| MinIO console (:9001) | `minioadmin` | see .env MINIO_ROOT_PASSWORD |
| Grafana | `admin` | see .env GRAFANA_PASSWORD |
| PostgreSQL | `carbon` | see .env POSTGRES_PASSWORD |

---

## Common Commands

```bash
# Get auth token (Docker mode)
TOKEN=$(curl -s -X POST http://localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"OmniFlow2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# Test v2 API
curl http://localhost:3001/api/v2/ping
curl http://localhost:3001/api/v2/health

# Test ARIA
curl http://localhost/api/agents -H "Authorization: Bearer $TOKEN"
curl http://localhost/api/blueprints -H "Authorization: Bearer $TOKEN"

# Check containers
docker ps --format "{{.Names}}\t{{.Status}}" | grep carbon | sort

# PM2
pm2 list
pm2 logs carbon-core --lines 50
```

---

## v4 Critical Issues (must fix before ship)

| Issue | Severity | File | Fix |
|-------|----------|------|-----|
| Hardcoded developer machine path | BLOCKER | knowledge-importer.js:14 | Use KNOWLEDGE_VAULT_PATH env var |
| Hardcoded developer machine path | BLOCKER | skills-registry.js:126 | Use SKILLS_BASE_PATH env var |
| Duplicate knowledge systems | HIGH | knowledge-service.js + knowledge-importer.js | Consolidate into v4 knowledge-search |
| In-memory orchestration runs lost on restart | HIGH | orchestrator-v2.js | Persist to DB in v4 |
| knowledge-service.js auto-ingest on require | HIGH | knowledge-service.js:301 | Move to explicit startup call |
| Parallel orchestrator wrong agent index on failure | MEDIUM | orchestrator-v2.js:129 | Fix i:0 default |
| index-v4.js not yet built | HIGH | — | Build master entry point |

---

## What Is NOT in v4 Yet (planned)

- **index-v4.js** — master entry point (auto-migrate, register all services, start server)
- **knowledge-vault/** — seed knowledge directory committed to repo
- **skills/** — active skills copied into repo (remove absolute path dependency)
- **Web UI v4 pages** — Agents, Skills, Ralph pages in web-app
- **PM2 config update** — add v4 process to ecosystem.config.js
- **Auth login page** — currently bypassed with auto-login for dev

---

## Behavioral Guidelines (Karpathy)

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

Before implementing: state assumptions explicitly. If multiple interpretations exist, present them. If a simpler approach exists, say so. If something is unclear, stop and ask.

### 2. Simplicity First

Minimum code that solves the problem. No features beyond what was asked. No abstractions for single-use code. No error handling for impossible scenarios. If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes

When editing existing code: do not improve adjacent code. Do not refactor things that aren't broken. Match existing style. If you notice unrelated dead code, mention it — do not delete it.

### 4. Goal-Driven Execution

Transform tasks into verifiable goals:
- "Add validation" becomes "Write tests for invalid inputs, then make them pass"
- "Fix the bug" becomes "Write a test that reproduces it, then make it pass"

For multi-step tasks, state a plan with verify steps before starting.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

## Agent Rules (from steipete/agent-rules)

_Integrated: 2026-04-17. Source: https://github.com/steipete/agent-rules_

The following rules extend Carbon Core's agent coding conventions with patterns from steipete's production agent work.

### Multi-Agent / Subagent Protocol

- When spawning subagents, read `docs/subagent.md` (if present) before assigning tasks.
- Keep files under ~500 LOC. Split and refactor when a file grows beyond this.
- Commits: use Conventional Commits (`feat|fix|refactor|build|ci|chore|docs|style|perf|test`).
- Before handoff: run the full gate (lint/typecheck/tests/docs). CI red = fix before continuing.
- Ship small commits. In multi-agent contexts, check `git status/diff` before edits to avoid collisions.

### Git Safety in Agent Context

- Safe by default: `git status/diff/log`. Push only when user explicitly asks.
- Destructive ops (`reset --hard`, `clean`, `restore`, `rm`) are forbidden unless the user is explicit.
- No repo-wide search/replace scripts. Keep edits small and reviewable.
- No amend unless asked.

### Tool Preferences

- **Peekaboo** (`core/v4/vision-tool.js`): For screenshots and GUI automation. Requires Screen Recording + Accessibility permissions. `captureScreen()`, `captureWindow(appName)`, `listWindows()`.
- **mcporter** (`npx mcporter`): Call any configured MCP server from CLI. `npx mcporter list` shows all available tools.
- **oracle** (`npx -y @steipete/oracle`): Run once per session before first use. Use when stuck or for deep code review. Bundles prompts + files for a second model.
- **peekaboo CLI**: `peekaboo image --mode screen --retina --path ~/Desktop/screen.png`

### MCP Server Quickstart

Add these to `~/.claude/claude_desktop_config.json` or via `claude mcp add-json`:

```bash
# File ops + web fetch
claude mcp add-json -s user conduit '{"command":"npx","args":["-y","@steipete/conduit-mcp@beta"],"env":{"CONDUIT_ALLOWED_PATHS":"~/Desktop/OmniFlow/Carbon-Copy:/tmp"}}'

# Terminal control (macOS)
claude mcp add-json -s user terminator '{"command":"npx","args":["-y","@steipete/terminator-mcp@beta"],"env":{"TERMINATOR_APP":"Terminal"}}'

# Claude Code as sub-agent
claude mcp add-json -s user agent '{"command":"npx","args":["-y","@steipete/claude-code-mcp@latest"]}'

# Screenshots + GUI (macOS)
claude mcp add-json -s user peekaboo '{"command":"npx","args":["-y","@steipete/peekaboo"]}'
```

See `docs/MCP_SERVERS.md` for full configuration details.

### Web / Frontend Quality

Avoid "AI slop" UI:
- Pick a specific font. Avoid Inter/Roboto/Arial system defaults.
- Commit to a palette. Use CSS variables. Bold accents over timid gradients.
- 1-2 high-impact motion moments (staggered reveal > random micro-animations).
- Add depth (gradients/patterns) to backgrounds.
- Avoid purple-on-white cliches, generic card grids, predictable layouts.

### Critical Thinking Protocol

- Fix root cause, not band-aids.
- If unsure: read more code. If still stuck, ask with short options.
- Call out conflicts. Pick the safer path.
- Unrecognized changes: assume another agent worked there. Keep going. If it causes issues, stop and ask.
- Leave breadcrumb notes in thread when context is getting long.

### New Dep Health Check

Before adding any new dependency:
1. Check recent releases/commits — is it actively maintained?
2. Check adoption (downloads, stars, issues).
3. Prefer packages with >1K weekly downloads or strong niche reputation.
4. Quick check: `npm info <package>` for last publish date.
