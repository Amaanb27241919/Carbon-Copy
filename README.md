# Carbon Core

**Secure self-hosted AI project build and deployment platform.**

Run AI projects in isolated VMs — not on your personal machine or corporate server. Local-first models, full intelligence stack, one `docker compose up`.

---

## What It Is

Carbon Core is a self-hosted platform that gives developers and small teams:

- **Sandboxed VMs** — provision KVM virtual machines on demand for AI projects
- **Local AI** — Ollama for free local inference, Claude/OpenAI as cloud fallback
- **ARIA Intelligence** — research agents, WatchDog monitoring, Dossier analysis
- **Budget Governance** — per-agent spend limits, auto-pause, cost tracking
- **Multi-Agent Orchestration** — parallel, sequential, hierarchical, pipeline, phased
- **Full Audit Trail** — every action logged, immutable activity log
- **Object Storage** — MinIO S3-compatible for files and AI outputs

---

## Quick Start

```bash
git clone https://github.com/Amaanb27241919/Carbon-Copy.git
cd Carbon-Copy

# Generate secrets
bash scripts/generate-secrets.sh

# Start the platform
docker compose up -d

# Open the dashboard
open http://localhost/app
```

Default login: `admin` / `changeme` — **change immediately**

---

## Architecture

```
nginx (reverse proxy)
  ├── /app          → Next.js web app (PWA, mobile-ready)
  ├── /api/v2       → Carbon Core v3 API (budget, heartbeat, orchestration)
  ├── /api          → API Gateway (auth, routing)
  ├── /socket.io    → ARIA real-time updates
  └── /console      → noVNC browser-based VM terminal

Carbon Core v3 API (core/)
  ├── Budget governance   (per-agent limits, auto-pause)
  ├── Heartbeat tracking  (every agent run logged)
  ├── Audit log           (immutable activity trail)
  ├── Health monitoring   (5 subsystems, periodic checks)
  ├── Orchestration       (parallel/sequential/hierarchical/pipeline/phased)
  ├── Model routing       (local-first: Ollama → cloud)
  ├── VM management       (AI agents provision and deploy to VMs)
  └── 18 expert agents    (executor, verifier, planner, debugger, architect...)

Docker Services
  ├── postgres        PostgreSQL + pgvector
  ├── redis           Session cache
  ├── minio           S3-compatible storage
  ├── ollama          Local AI models (llama3, mistral, etc.)
  ├── model-router    OpenAI-compatible API (Ollama → Claude → OpenAI)
  ├── aria-service    ARIA intelligence platform
  ├── carbon-core     Carbon Core v3 API
  ├── gateway         JWT auth + request routing
  ├── auth            Authentication service
  ├── data-server     File + storage API
  ├── kvm-manager     QEMU/KVM virtual machine management
  ├── sandbox         Docker-based code sandbox
  ├── web-app         Next.js dashboard (PWA)
  └── nginx           Reverse proxy
```

---

## Carbon Core v3 API

Base URL: `http://localhost:3001/api/v2`

| Endpoint | Description |
|----------|-------------|
| `GET /ping` | Version check |
| `GET /health` | System health (5 subsystems) |
| `GET /summary` | Full dashboard snapshot |
| `GET /budget` | Budget policies + incidents |
| `POST /budget/policy` | Create spend limit |
| `GET /heartbeat` | Agent execution runs |
| `GET /activity` | Audit log |
| `POST /orchestration` | Start multi-agent run |
| `GET /vms` | VM status summary |
| `GET /models/providers` | Available AI providers |
| `GET /agents/expert` | 18 expert agent prompts |
| `POST /agents/route` | Route task to best agent |
| `POST /ralph` | Start Ralph loop (iterative AI) |
| `GET /hooks` | Registered event hooks |
| `GET /stream` | SSE real-time hive mind feed |
| `POST /proposal` | Generate proposal from transcript |
| `GET /usage` | Claude token/cost analytics |

---

## Model Routing

Local-first by default. No API keys required to get started.

```
Request
  ↓
Ollama (free, local, private)  ← default
  ↓ if unavailable
Claude (paid, cloud)
  ↓ if unavailable
OpenAI (paid, cloud)
```

Set `DEFAULT_PROVIDER=ollama` in `.env` (default). Switch to `claude` or `openai` for cloud.

Pull a local model:
```bash
docker exec -it carbon-ollama ollama pull llama3.2
docker exec -it carbon-ollama ollama pull mistral
docker exec -it carbon-ollama ollama pull codellama
```

---

## Multi-Agent Orchestration

```bash
# Parallel — all agents run simultaneously
curl -X POST http://localhost:3001/api/v2/orchestration \
  -H "Content-Type: application/json" \
  -d '{"task":"Analyze competitor landscape","mode":"parallel","agents":[{"id":"research","name":"Researcher"},{"id":"analyst","name":"Analyst"}]}'

# Phased — plan → exec → verify → fix loop
curl -X POST http://localhost:3001/api/v2/orchestration \
  -d '{"task":"Build a rate limiter in Node.js","mode":"phased"}'
```

---

## Virtual Machines

AI agents can provision and deploy to VMs:

```bash
# List VMs
curl http://localhost:3001/api/v2/vms

# Provision via API (from AI agent)
curl -X POST http://localhost:3004/vms \
  -d '{"name":"my-project","os":"ubuntu-22","ram_mb":2048,"cpus":2}'
```

OS presets: `ubuntu-22`, `debian-12`, `alpine-3`, `arch`, `windows-10`

---

## Budget Governance

Prevent runaway AI spend:

```bash
# Set a $5/day limit for an agent
curl -X POST http://localhost:3001/api/v2/budget/policy \
  -d '{"scope":"agent","scope_id":"my-agent","window":"daily","limit_usd":5}'

# Check an agent's spend
curl http://localhost:3001/api/v2/budget/my-agent
```

Agents auto-pause at 100% utilization. Warning at 80%.

---

## Database

| Mode | Config | When |
|------|--------|------|
| SQLite | `DB_ADAPTER=sqlite` (default) | Development, homelab |
| PostgreSQL | `DB_ADAPTER=postgres` | Production, multi-user |

PostgreSQL is included in the Docker stack and used by default in Docker mode.

---

## Vision

**Who it's for**: Developers and small teams who want to test AI projects in a secure, isolated environment — not on their personal machines or corporate servers.

**Revenue**: Freemium (free self-hosted) + paid managed hosting. Target $10K-$100K ARR by 2027.

**License**: Dual — community open source + commercial enterprise.

---

## License

- **Community Edition**: MIT — free to use, self-host, modify
- **Enterprise Edition**: Commercial license — managed hosting, SLA, support

© 2026 OmniFlow Advisory — Built by Amaan Khan
