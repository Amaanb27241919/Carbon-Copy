# CLAUDE.md — Carbon-Copy v2 Development Guide

## What This Is

Carbon-Copy v2 is a self-hosted Docker platform combining:
- **AI Intelligence Platform** (ARIA — 5-agent research system)
- **AI Cloud** (model router: Ollama local + Claude/OpenAI/HuggingFace)
- **Homelab** (Samba, Syncthing, Immich, Tailscale, Pi-hole)
- **Data Server** (PostgreSQL + pgvector + MinIO S3 + Redis)
- **iPhone/iPad PWA** (Next.js control panel, installable from Safari)

---

## Architecture

```
Browser/iPhone → nginx:80 → gateway:3000 (JWT auth) → services
                                ├── auth:3001
                                ├── aria-service:3008  ← NEW
                                ├── model-router:3004
                                ├── data-server:3002
                                ├── vm-manager:3003
                                ├── sandbox:3005
                                ├── openclaw:8001
                                └── nemoclaw:8002

aria-service → model-router:3004 (ALL AI calls go here, never direct)
aria-service → postgres:5432 (carbon_db, aria_* tables)
aria-service → minio:9000 (S3 storage for outputs)
```

---

## Services

| Service | Port | Purpose |
|---|---|---|
| nginx | 80/443 | Reverse proxy — only externally exposed |
| gateway | 3000 | JWT auth + rate limiting + routing |
| auth | 3001 | Login/logout/refresh (JWT + bcrypt + Redis) |
| aria-service | 3008 | ARIA intelligence platform ← NEW |
| data-server | 3002 | PostgreSQL + MinIO storage |
| vm-manager | 3003 | Docker container management |
| model-router | 3004 | AI provider router (Ollama/Claude/OpenAI/HF) |
| sandbox | 3005 | Safe GitHub repo runner |
| web-app | 3006 | Next.js PWA (iPhone/iPad) |
| openclaw | 8001 | Code analysis/generation (Python/FastAPI) |
| nemoclaw | 8002 | NLP: classify/summarize/embed (Python/FastAPI) |
| postgres | 5432 | PostgreSQL 16 + pgvector |
| redis | 6379 | Token cache + rate limiting |
| minio | 9000 | S3-compatible object storage |
| ollama | 11434 | Local LLM server |
| prometheus | 9090 | Metrics scraper |
| grafana | 3001 | Metrics dashboard |

---

## Directory Structure

```
carbon-copy/
├── nginx/                  Reverse proxy
├── gateway/                API gateway (JWT, rate limiting, routing)
│   └── src/app.js          ← ARIA proxy routes added here
├── auth/                   Auth service
├── data-server/            PostgreSQL + MinIO
├── vm-manager/             Container lifecycle
├── model-router/           Universal AI provider router
│   └── src/providers/      openai.js, anthropic.js, ollama.js, huggingface.js
├── sandbox/                Safe GitHub repo runner
├── aria-service/           ← NEW: ARIA intelligence platform
│   ├── Dockerfile
│   ├── package.json
│   ├── blueprints/         Research blueprint JSON files
│   └── src/
│       ├── index.js        Entry point (port 3008)
│       ├── app.js          Express app
│       ├── orchestrator.js 5-agent mission orchestrator
│       ├── watchdog.js     Entity monitoring (WatchDog)
│       ├── dossier.js      Document intelligence
│       ├── deliver-email.js Resend email delivery
│       ├── deliver-slack.js Slack webhook delivery
│       ├── middleware/
│       │   └── serviceAuth.js
│       ├── routes/         missions, agents, watchdog, dossier, blueprints, budget, clients
│       └── services/
│           ├── db.js       PostgreSQL client (pg)
│           └── model-client.js HTTP client to model-router
├── web-app/                Next.js PWA (iPhone/iPad)
│   └── src/app/
│       ├── page.tsx        Dashboard (+ ARIA section)
│       ├── missions/       Mission list + submit
│       ├── chat/           Streaming chat (→ model-router)
│       ├── agents/         Agent status
│       ├── watchdog/       WatchDog monitors
│       ├── dossier/        Document vault
│       ├── blueprints/     Blueprint browser
│       ├── budget/         ARIA budget tracking
│       ├── models/         AI model switcher
│       ├── projects/       Sandbox project runner
│       ├── files/          MinIO file browser
│       └── settings/       Provider config
├── services/
│   ├── openclaw/           Code AI (Python/FastAPI)
│   └── nemoclaw/           NLP AI (Python/FastAPI)
├── database/
│   └── init/
│       ├── 01_schema.sql   Core tables (users, outputs, logs)
│       ├── 02_model_registry.sql
│       ├── 03_sandbox.sql
│       ├── 04_vms.sql
│       └── 05_aria.sql     ← NEW: ARIA tables
├── monitoring/             Prometheus + Grafana
├── docker-compose.yml      All services + volumes
└── scripts/                start.sh, stop.sh, generate-secrets.sh
```

---

## ARIA Service (`aria-service/`)

### What it does
Runs a 5-agent research pipeline inside Docker:

```
User submits goal → scan agent (classify + prioritize)
                  → research agent (calls model-router for AI)
                  → synthesis agent (format output)
                  → delivery agent (save + email + Slack)
                  → client_mgr agent (update memory)
```

### Key design rules
1. **Never call Anthropic/Perplexity directly** — always use `model-client.js` → `model-router:3004`
2. **Never use SQLite** — always PostgreSQL via `services/db.js`
3. **Follow the same Express pattern** as other services (health endpoint, metrics, serviceAuth middleware)
4. **All routes return** `{ status: 'ok'|'error', data: ... }` consistently

### ARIA Database Tables (in carbon_db)
```sql
aria_missions         -- mission runs
aria_agents_state     -- live agent status
aria_clients          -- ARIA clients (not system users)
aria_audit_log        -- action history
aria_watchdog_monitors -- entity monitoring configs
aria_dossier_files    -- uploaded documents
aria_blueprints       -- research templates
aria_budget           -- daily/monthly spend tracking
```

### API Routes (via gateway /api/*)
```
GET  /api/agents              — 5 agent statuses + budget
GET  /api/missions            — list missions
POST /api/missions            — submit new mission
GET  /api/missions/:id        — mission details
GET  /api/blueprints          — list blueprints
GET  /api/watchdog            — list monitors
POST /api/watchdog            — create monitor
GET  /api/dossier             — list client files
POST /api/dossier             — upload file
GET  /api/clients             — list clients
POST /api/clients             — create client
GET  /api/aria-budget         — budget status
GET  /api/aria/health         — health check
```

---

## Common Development Tasks

### Rebuild a single service
```bash
docker compose build --no-cache <service>
docker compose up -d --force-recreate <service>
```

### Apply database schema changes
```bash
docker exec -i carbon-postgres psql -U carbon -d carbon_db < database/init/05_aria.sql
```

### View service logs
```bash
docker logs carbon-aria --tail 50 -f
docker logs carbon-gateway --tail 50 -f
docker logs carbon-web-app --tail 50 -f
```

### Run full stack
```bash
bash scripts/start.sh
```

### Stop everything
```bash
docker compose down
```

### Add a new AI provider
Edit `model-router/src/providers/` — add a new provider file following the pattern in `anthropic.js`.

### Add a new blueprint
Add a JSON file to `aria-service/blueprints/` following the existing format, then rebuild aria-service.

### Add a new web-app page
Create `web-app/src/app/<page>/page.tsx` following existing page patterns. API calls go via `ariaApi.*` from `src/lib/api.ts`.

---

## Environment Variables

### Core (auto-generated by generate-secrets.sh)
```
JWT_SECRET
JWT_REFRESH_SECRET
INTERNAL_SERVICE_TOKEN
POSTGRES_PASSWORD
REDIS_PASSWORD
MINIO_SECRET_KEY
GRAFANA_PASSWORD
CODE_SERVER_PASSWORD
```

### AI Providers
```
DEFAULT_PROVIDER=ollama          # ollama | openai | claude | huggingface
ANTHROPIC_API_KEY=               # Claude
OPENAI_API_KEY=                  # OpenAI
HF_API_KEY=                      # HuggingFace
OLLAMA_DEFAULT_MODEL=llama3.2
```

### ARIA
```
ARIA_SERVICE_URL=http://aria-service:3008
BUDGET_DAILY_USD=50
BUDGET_MONTHLY_USD=1000
TELEGRAM_TOKEN=                  # optional Telegram bot
RESEND_API_KEY=                  # optional email delivery
```

---

## Known Issues (ARM Mac / M-series)

| Issue | Status | Notes |
|---|---|---|
| code-server crashing | ✅ Disabled | x86 binary, returns 503 on ARM |
| ollama `unhealthy` | ✅ Expected | No GPU on M-series, still works via CPU |
| nginx `unhealthy` | ✅ False alarm | Serving correctly (confirmed 200) |
| web-app `unhealthy` | ✅ False alarm | Health check misconfigured, app works |

---

## Default Credentials

| Service | Username | Password |
|---|---|---|
| Carbon Cloud app | `admin` | `changeme` ← **CHANGE THIS** |
| MinIO console | `minioadmin` | see `.env` MINIO_SECRET_KEY |
| Grafana | `admin` | see `.env` GRAFANA_PASSWORD |

**Change the admin password immediately after first login.**

---

## Integration Points

### ARIA + Model Router
All AI calls in aria-service go through model-router. This means ARIA works with:
- Ollama (local, no API key, any model)
- Claude (Anthropic API key)
- OpenAI (OpenAI API key)
- HuggingFace (HF API key)

Switch provider by setting `DEFAULT_PROVIDER` in `.env` and restarting model-router.

### ARIA + Data Server
Mission outputs are stored in:
- PostgreSQL `aria_missions` table (metadata)
- MinIO `aria-outputs` bucket (full output files)

### ARIA + Web App
The web-app communicates with aria-service via `ariaApi.*` methods in `web-app/src/lib/api.ts`. All requests go through the gateway with JWT auth.

---

## What Was Integrated (April 2026)

Everything in `~/Desktop/OmniFlow/` was integrated into this platform:

| Source | Where it went |
|---|---|
| Carbon-Copy v1 | Base platform, unchanged |
| Carbon-Copy-v2 orchestrator | `aria-service/src/orchestrator.js` |
| Carbon-Copy-v2 React dashboard | `web-app/src/app/missions|agents|budget|etc` |
| ARIA/OmniCore agent pipeline | `aria-service/src/orchestrator.js` |
| ARIA/OmniCore WatchDog | `aria-service/src/watchdog.js` |
| ARIA/OmniCore Dossier | `aria-service/src/dossier.js` |
| Raw/rawclaw-platform | `web-app` page patterns |
| Raw/rawclaw-chat | `web-app/src/app/chat` streaming pattern |
| Raw/rawclaw budget/governance | `aria-service` budget tracking |
| Leaked Claude Code | Agent design patterns (not shipped) |
