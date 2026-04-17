# Carbon Core

**Secure self-hosted AI project build and deployment platform.**

Your own private AI cloud. VMs on demand. Local models. Full intelligence stack. Deploy in 10 minutes.

---

## What It Is

Carbon Core gives developers and small teams an isolated environment to build, test, and run AI projects — without touching personal machines or corporate servers.

**The problem**: You're building something with AI — agents, automations, integrations — but you can't run it on your work machine (security), your personal machine (privacy), or cloud SaaS (cost + lock-in). You need your own isolated environment.

**The answer**: Carbon Core. Spin up a VM, deploy your project, run it safely.

---

## Quick Start

```bash
git clone https://github.com/Amaanb27241919/Carbon-Copy.git
cd Carbon-Copy
bash dev.sh
# App: http://localhost:3006/app
# API: http://localhost:3001/api/v2/ping
```

**Full Docker stack:**
```bash
cp .env.example .env      # fill in secrets
docker compose up -d
open http://localhost/app  # admin / OmniFlow2026!
```

---

## What Works Right Now

### Without Docker (bash dev.sh)

| Feature | Status |
|---------|--------|
| Dashboard | Live |
| Carbon Core API (/api/v2) | Live |
| Chat (Claude/OpenAI/Ollama) | Live |
| Models page | Live |
| Missions (orchestration) | Live |
| Agents (18 expert agents) | Live |
| Core page (health/budget/VMs) | Live |
| VMs — UTM (Apple Silicon) | Live |
| Budget governance | Live |
| Audit log | Live |
| Ralph iterative loop | Live |

### Requires Docker

| Feature | Why |
|---------|-----|
| ARIA research pipeline | aria-service |
| WatchDog monitoring | aria-service |
| File storage | MinIO + data-server |
| Local Ollama models | ollama container |
| PostgreSQL persistence | postgres container |

---

## Architecture

```
Browser / iPhone
      |
   nginx:80
      |
   +--+----------------------------------+
   |                                     |
/app                                  /api
Next.js PWA                       gateway:3000
                                      |
              +-----------+-----------+----------+-----------+
              |           |           |          |           |
          auth:3001   aria:3008  model-router  carbon-    data-
                                   :3004       core:3001  server

Carbon Core v4 (core/)
  api-server-v4.js
    |-- agent-tools.js      Claude tool execution
    |-- ralph-engine.js     Iterative self-improving loop
    |-- orchestrator-v4.js  Parallel/sequential/hierarchical/pipeline
    |-- agent-registry.js   7 business agents
    |-- expert-agents.js    18 expert agents
    |-- knowledge-search.js RAG + TF-IDF search
    |-- skills-registry.js  61 skills catalog
    |-- budget-v2.js        Per-agent spend limits
    |-- heartbeat-v2.js     Every run tracked
    |-- audit-v2.js         Immutable activity trail
    +-- db-adapter.js       SQLite (dev) / PostgreSQL (prod)
```

---

## Features

### AI Agents

**7 Business OS Agents** — the team that runs your AI business:

| Agent | Role | Does |
|-------|------|------|
| Scan | COO / Orchestrator | Routes tasks, coordinates agents, synthesizes output |
| Ali | Dev Agent | Code, builds, APIs, deployments, debugging |
| Quilly | Content Agent | YouTube scripts, Reels, Twitter, content calendar |
| Larry | Sales Agent | Cold email, DMs, proposals, CRM ops |
| Ovi | Research Agent | Competitor analysis, market research, data |
| Cleo | Client Agent | Onboarding, health monitoring, churn prevention |
| Sam | Finance Agent | Budget tracking, cost reports, infra optimization |

**18 Expert Agents** — technical execution specialists:

executor, verifier, planner, architect, debugger, code-reviewer, product-manager, analyst, test-engineer, designer, security-reviewer, quality-reviewer, git-master, researcher, writer, critic, build-fixer, performance-reviewer

**ARIA Intelligence Platform** — 5-agent research pipeline:

scan → research → synthesis → delivery. 88 research blueprints. WatchDog monitoring. Dossier document analysis.

### 61 Skills

Organized across 8 categories with keyword-based routing:

- **Content**: brand-voice, content-creation, yt-pipeline, social-content, copywriting, story-sequence
- **Sales**: cold-email, email-sequence, proposal, sales-enablement, waterfall, steal
- **Marketing**: launch-strategy, lead-magnets, paid-ads, referral-program, community-marketing
- **SEO**: ai-seo, seo-audit, programmatic-seo, competitor-alternatives
- **CRO**: ab-test-setup, funnel-pipeline, onboarding-cro, paywall-upgrade-cro
- **Research**: customer-research, signal-scan, rag-query
- **Tools**: gmail, slack, clickup, mcp-creator, skill-creator
- **Dev**: analytics-tracking, frontend-theme, ship-check

### Multi-Agent Orchestration

4 modes available today, v4 adds pipeline and phased:

- **Parallel** — all agents run simultaneously, results merged
- **Sequential** — each agent builds on the previous output
- **Hierarchical** — planner decomposes task, workers execute subtasks in parallel
- **Pipeline** — output of each agent becomes input of the next

### Ralph Loop

Iterative self-improving agent execution. Named after Ralph Wiggum — persistent despite setbacks. Runs until a completion promise appears in the output or max iterations hit. Budget-governed, full iteration history.

### Knowledge Base

Markdown RAG with TF-IDF scoring. Organized by category. Auto-ingests from `knowledge-vault/` on startup. DB-backed persistence. In-memory fast search. v4 adds semantic search stub.

### Budget Governance

Per-agent daily/monthly/lifetime spend limits. Auto-pause when limit hit. Manual resume. Full incident log. Warning at 80% of limit.

### VM Management

**UTM (Apple Silicon native):** Start, shutdown, force-stop, delete macOS/Windows ARM/Linux VMs via utmctl CLI.

**Docker KVM:** Provision, manage, and connect to QEMU/KVM VMs with VNC console via noVNC.

---

## Carbon Core API (v2)

Base URL: `http://localhost:3001/api/v2`

| Route | Description |
|-------|-------------|
| GET /ping | Version + uptime |
| GET /health | 5-subsystem health |
| GET /summary | Full dashboard snapshot |
| GET /budget | Budget policies + incidents |
| POST /budget/policy | Create spend limit |
| GET /heartbeat | Agent execution runs |
| GET /activity | Audit log |
| POST /orchestration | Start multi-agent run |
| GET /orchestration | List runs |
| GET /missions | List missions |
| POST /missions | Create mission |
| GET /vms | All VMs (UTM + Docker KVM) |
| POST /vms/utm/:id/start | Start UTM VM |
| GET /agents/expert | 18 expert agent prompts |
| POST /agents/route | Route task to best agent |
| POST /ralph | Start Ralph loop |
| POST /chat | Chat via Ollama/Claude/OpenAI |
| GET /stream | SSE real-time feed |

---

## Model Routing

Local-first. No API key required to start.

```
Request  -->  Ollama (free, local)  -->  Claude (paid)  -->  OpenAI (paid)
```

Install Ollama (no Docker):
```bash
brew install ollama && ollama serve
ollama pull llama3.2
```

Set in `.env`:
```bash
DEFAULT_PROVIDER=ollama
OLLAMA_DEFAULT_MODEL=llama3.2
```

---

## VM Management (Apple Silicon)

Carbon Core controls UTM VMs via `utmctl` — the official CLI bundled in UTM.app.

**Setup (one time):**
1. Download UTM: https://mac.getutm.app (free)
2. Install and open UTM
3. Start `bash dev.sh` — Carbon Core auto-detects UTM

**From the web UI (/app/vms):** Start, Shutdown, Stop, Delete, Open UTM

**Add VMs:** Open UTM → + → Gallery → Ubuntu ARM, Windows 11 ARM, etc.

---

## Roadmap

### Now (v4 — first pass complete)
- [x] Claude tool execution architecture (`core/v4/agent-tools.js`)
- [x] macOS vision tool / screenshots (`core/v4/vision-tool.js`)
- [x] Token math + cost tracking (`core/v4/token-math.js`)
- [x] Progress bars for long-running ops (`core/v4/progress-reporter.js`)
- [x] HTML → Markdown for web content ingest (`core/v4/html-to-markdown.js`)
- [x] v4 API server — all routes live (`core/v4/api-server-v4.js`)
- [x] v4 schema — agent_runs, ralph_iterations, knowledge_chunks (FTS5), pipeline_runs (`core/v4/schema-v4.sql`)
- [x] PM2 ecosystem updated — carbon-core now runs `core/v4/api-server-v4.js`
- [ ] Ralph engine with tool awareness (`core/v4/ralph-engine.js`)
- [ ] Enhanced knowledge search (`core/v4/knowledge-search.js`)
- [ ] Fix hardcoded absolute paths in knowledge-importer.js + skills-registry.js (BLOCKER for open source)
- [ ] index-v4.js master entry point (auto-migrate + start)

### Next
- [ ] Web UI v4 pages — Agents, Skills, Ralph
- [ ] Seed knowledge-vault directory in repo
- [ ] Copy skills into repo (remove external path dependency)
- [ ] Chat streaming (SSE) from web-app to /api/chat
- [ ] Auth login page (currently auto-login in dev)
- [ ] PM2 ecosystem update for v4 process

### Later
- [ ] Claude Code agent (sandboxed) — `/api/claude-agent`
- [ ] Ollama model UI — pull/delete/switch from dashboard
- [ ] Tailscale + DuckDNS remote access
- [ ] AI cost tracking per-provider
- [ ] Vector search for knowledge base

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| API server | Node.js, Express |
| Web app | Next.js 14, TypeScript |
| Database | SQLite (dev), PostgreSQL 16 + pgvector (prod) |
| Object storage | MinIO (S3-compatible) |
| AI routing | Ollama, Anthropic SDK, OpenAI SDK |
| Cache | Redis |
| Reverse proxy | nginx |
| Process manager | PM2 (dev), Docker Compose (prod) |
| VMs | UTM (macOS), KVM/QEMU (Linux), noVNC |
| Monitoring | Prometheus, Grafana |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

Dev guidelines: [CLAUDE.md](./CLAUDE.md).

Architecture: [docs/ARCHITECT_REVIEW.md](./docs/ARCHITECT_REVIEW.md).

---

## Vision

**Who**: Developers and teams who want a secure sandboxed environment for AI projects.

**Why**: Privacy + Cost (local Ollama) + Control + Speed. Your own private AI cloud.

**Revenue**: Freemium community edition → managed hosting → enterprise. Target: $10K–$100K ARR by 2027.

**License**: Dual — community (MIT) + commercial enterprise.

---

© 2026 OmniFlow Advisory — Built by Amaan Khan
