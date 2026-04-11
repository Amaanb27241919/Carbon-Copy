# Carbon-Copy v2 — Self-Hosted AI Intelligence Platform

A self-hosted, Docker-based platform that is your AI cloud, intelligence platform, homelab, and data server in one. Runs on any machine. Controlled from iPhone or iPad.

**Status:** v2.0 — Live as of April 11, 2026

---

## What It Does

| Capability | How |
|---|---|
| **ARIA Intelligence** | 5-agent AI research system — missions, WatchDog monitoring, Dossier document vault, 10 research blueprints |
| **Multi-provider AI** | Model router switches between Ollama (local, no API key), Claude, OpenAI, HuggingFace at runtime |
| **Safe GitHub sandbox** | Clone & run any AI repo in an isolated container with CPU/RAM/timeout limits |
| **AI microservices** | OpenClaw (code intelligence) + NemoClaw (classify, summarize, embed) |
| **Cloud + object storage** | MinIO (S3-compatible) + PostgreSQL 16 with pgvector |
| **iPhone/iPad PWA** | Installable from Safari — no App Store, full control panel |
| **Container management** | Start/stop/restart/inspect any container via API or web UI |
| **VM management** | QEMU/KVM virtual machine lifecycle manager |
| **Monitoring** | Prometheus + Grafana for all services |
| **iPhone photo backup** | Immich — self-hosted Google Photos |
| **File sync** | Syncthing — peer-to-peer across all devices |
| **VPN access** | Tailscale — reach everything from anywhere |
| **Ad blocking + DNS** | Pi-hole — network-wide |
| **Dynamic DNS** | DuckDNS — keeps your domain updated |

---

## Architecture

```
iPhone/iPad/Browser
  http://host/app  ──► nginx:80 ──► web-app:3006 (Next.js PWA)
  http://host/api  ──► nginx:80 ──► gateway:3000 (JWT auth + routing)
                                         │
                    ┌────────────────────┼────────────────────────┐
                    │                    │                         │
               ARIA Intelligence    AI Services              Infrastructure
               aria-service:3008   model-router:3004         data-server:3002
               ├── missions         ├── ollama:11434           ├── postgres:5432
               ├── watchdog         ├── claude API             ├── minio:9000
               ├── dossier          ├── openai API             ├── redis:6379
               └── blueprints       └── huggingface API        └── vm-manager:3003
                                    openclaw:8001
                                    nemoclaw:8002
                                    sandbox:3005
```

---

## Services

| Service | Port | Status | Description |
|---|---|---|---|
| `nginx` | 80, 443 | ✅ | Reverse proxy — only externally exposed |
| `gateway` | 3000 | ✅ | JWT auth, rate limiting, routing |
| `auth` | 3001 | ✅ | Login/refresh/logout + Redis token blocklist |
| `data-server` | 3002 | ✅ | PostgreSQL + MinIO storage |
| `vm-manager` | 3003 | ✅ | Docker container lifecycle |
| `model-router` | 3004 | ✅ | Universal AI provider router |
| `sandbox` | 3005 | ✅ | Safe GitHub repo runner |
| `web-app` | 3006 | ✅ | Next.js PWA (iPhone/iPad) |
| `kvm-manager` | 3007 | ✅ | QEMU/KVM virtual machine manager |
| `aria-service` | 3008 | ✅ | ARIA intelligence platform |
| `openclaw` | 8001 | ✅ | Code analysis + generation (Python/FastAPI) |
| `nemoclaw` | 8002 | ✅ | NLP: classify, summarize, embed (Python/FastAPI) |
| `ollama` | 11434 | ✅ | Local LLM server |
| `postgres` | 5432 | ✅ | PostgreSQL 16 + pgvector |
| `redis` | 6379 | ✅ | Token cache + rate limiting |
| `minio` | 9000/9001 | ✅ | S3-compatible object storage |
| `prometheus` | 9090 | ✅ | Metrics scraper |
| `grafana` | 3001 | ✅ | Metrics dashboard |

---

## Quick Start

### Prerequisites
- Docker + Docker Compose v2
- macOS/Linux (ARM64 or x86)

### 1. Clone & configure
```bash
git clone https://github.com/Amaanb27241919/Carbon-Copy.git
cd Carbon-Copy
bash scripts/generate-secrets.sh
```

Add your AI API keys to `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
HF_API_KEY=hf_...
DEFAULT_PROVIDER=ollama   # or: claude | openai | huggingface
```

### 2. Start
```bash
bash scripts/start.sh
```

### 3. Access
| URL | What |
|---|---|
| `http://localhost/app` | iPhone/iPad PWA dashboard |
| `http://localhost:9001` | MinIO file console |
| `http://localhost:9090` | Prometheus metrics |
| `http://localhost:3001` | Grafana dashboards |

**Default credentials:** `admin` / `changeme` — change immediately after first login.

### 4. Install on iPhone
1. Open `http://YOUR_SERVER_IP/app` in Safari
2. Tap Share → Add to Home Screen
3. Full-screen app, no App Store needed

---

## ARIA Intelligence Platform

Built-in 5-agent research system accessible from the **Missions** tab.

### Agents
| Agent | Role |
|---|---|
| `scan` | Classify and prioritize the request |
| `research` | Run AI research via model-router |
| `synthesis` | Format and structure output |
| `delivery` | Save to vault, email, Slack |
| `client_mgr` | Update client memory |

### Features
- **Missions** — Submit research goals, track status, view outputs
- **WatchDog** — Monitor companies/people for signals (news, funding, hiring, etc.)
- **Dossier** — Upload documents, get AI summaries, inject context into missions
- **Blueprints** — 10 research templates (competitive analysis, M&A, market research, etc.)
- **Budget** — Daily/monthly spend tracking per client

### API
```bash
# All routes require JWT (via gateway)
GET  /api/agents          — agent status
GET  /api/missions        — list missions
POST /api/missions        — submit mission
GET  /api/blueprints      — list templates
GET  /api/watchdog        — list monitors
POST /api/watchdog        — create monitor
POST /api/dossier         — upload document
GET  /api/aria-budget     — budget status
GET  /api/clients         — list clients
```

---

## iPhone/iPad App — Navigation

| Tab | What you get |
|---|---|
| **Dashboard** | Service health, system stats, ARIA summary, recent activity |
| **Missions** | Submit + track ARIA research missions |
| **Chat** | Streaming AI chat (Ollama/Claude/OpenAI) |
| **Models** | Browse providers, pull Ollama models, switch default |
| **Files** | MinIO file browser — upload, download, manage |
| **Settings** | API keys, provider config, account |

Additional pages (accessible from Dashboard):
- **Agents** — Live ARIA agent status
- **WatchDog** — Entity monitoring
- **Dossier** — Document vault
- **Blueprints** — Research templates
- **Budget** — AI spend tracking
- **Projects** — GitHub sandbox runner

---

## AI Models

### Local (no API key needed)
```bash
bash scripts/add-model.sh llama3.2
bash scripts/add-model.sh codellama
bash scripts/add-model.sh mistral
bash scripts/add-model.sh nomic-embed-text
```

### Cloud providers
Set in `.env`:
```env
DEFAULT_PROVIDER=claude    # ollama | openai | claude | huggingface
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
HF_API_KEY=...
```

Switch per-request (no restart):
```bash
curl -X POST http://localhost/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"provider":"claude"}'
```

---

## Database

### Schemas
- `01_schema.sql` — users, model_outputs, service_logs, container_events
- `02_model_registry.sql` — model registry
- `03_sandbox.sql` — sandbox runs
- `04_vms.sql` — VM records
- `05_aria.sql` — ARIA tables (missions, agents, clients, watchdog, dossier, blueprints, budget)

### Connect directly
```bash
docker exec -it carbon-postgres psql -U carbon -d carbon_db
```

---

## Development

### Rebuild a single service
```bash
docker compose build --no-cache <service>
docker compose up -d --force-recreate <service>
```

### View logs
```bash
docker logs carbon-aria --tail 50 -f
docker logs carbon-gateway --tail 50 -f
```

### Apply schema changes
```bash
docker exec -i carbon-postgres psql -U carbon -d carbon_db < database/init/05_aria.sql
```

See [CLAUDE.md](./CLAUDE.md) for the full development guide.

---

## Roadmap

### In Progress
- [ ] VM management UI (kvm-manager page)
- [ ] System stats (outputs, storage, container count)
- [ ] Files page (MinIO browser)
- [ ] Chat streaming (rawclaw-chat pattern)

### Planned
- [ ] Claude Code agent (code tasks via sandboxed claude-code)
- [ ] AI cost tracking (per-provider spend dashboard)
- [ ] Settings page (API key management)
- [ ] Skills library (ARIA reusable workflows)
- [ ] Tailscale + DuckDNS (remote access)
- [ ] Self-healing + auto-updates

---

## Security

- `.env` is gitignored — never commit it
- Run `generate-secrets.sh` before any deployment
- Change default admin password immediately
- Only `nginx` is exposed externally
- Service-to-service auth via `INTERNAL_SERVICE_TOKEN`
- Sandbox containers are CPU/RAM capped and network-isolated

---

## Directory Structure

```
carbon-copy/
├── nginx/              Reverse proxy
├── gateway/            API gateway (JWT, routing) ← ARIA routes added
├── auth/               Auth service
├── data-server/        PostgreSQL + MinIO
├── vm-manager/         Docker container manager
├── model-router/       Universal AI router (Ollama/Claude/OpenAI/HF)
├── sandbox/            Safe GitHub repo runner
├── aria-service/       ← NEW: ARIA intelligence platform
│   ├── blueprints/     Research templates
│   └── src/            orchestrator, watchdog, dossier, routes, services
├── kvm-manager/        QEMU/KVM VM manager
├── web-app/            Next.js PWA (iPhone/iPad)
│   └── src/app/        Dashboard, Missions, Chat, Agents, WatchDog, Dossier, Blueprints, Budget
├── services/
│   ├── openclaw/       Code AI (Python/FastAPI)
│   └── nemoclaw/       NLP AI (Python/FastAPI)
├── database/init/      SQL schemas (01-05)
├── monitoring/         Prometheus + Grafana
├── docker-compose.yml
└── scripts/            start, stop, generate-secrets, add-model
```
