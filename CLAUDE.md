# CLAUDE.md — Carbon-Copy v2 Development Guide

_Last updated: April 11, 2026, 1:00 AM CT_

---

## What This Is

Carbon-Copy v2 is a self-hosted Docker platform:
- **AI Intelligence Platform** (ARIA — 5-agent research, WatchDog, Dossier, Blueprints)
- **AI Cloud** (model router: Ollama local + Claude/OpenAI/HuggingFace)
- **Homelab** (Samba, Syncthing, Immich, Tailscale, Pi-hole)
- **Data Server** (PostgreSQL + pgvector + MinIO S3 + Redis)
- **iPhone/iPad PWA** (Next.js, installable from Safari)

---

## Current Status (Apr 11, 2026)

### ✅ Working
- http://localhost/app — full dashboard, auto-login (dev bypass)
- 9/9 services operational (gateway, auth, data, vm, openclaw, nemoclaw, model-router, sandbox, ARIA)
- ARIA: missions, agents, blueprints, watchdog, dossier all wired end-to-end
- PostgreSQL ARIA schema live (05_aria.sql applied)
- Web-app: Dashboard, Missions, Chat, Agents, WatchDog, Dossier, Blueprints, Budget pages
- Model router: Ollama + Claude + OpenAI + HuggingFace all routable
- Committed + pushed: https://github.com/Amaanb27241919/Carbon-Copy

### ⚠️ Known Issues (ARM Mac)
| Issue | Status | Notes |
|---|---|---|
| code-server crashing | Expected | x86 binary, disabled in nginx (returns 503) |
| ollama `unhealthy` | Expected | No GPU on M-series, works via CPU |
| nginx/web-app `unhealthy` | False alarm | Health check misconfigured, actually serving |

### 🔨 In Progress / Next
See **Backlog** section below.

---

## Architecture

```
Browser/iPhone → nginx:80 → gateway:3000 (JWT auth) → services
                                ├── auth:3001
                                ├── aria-service:3008  ← ARIA platform
                                ├── model-router:3004  ← all AI calls
                                ├── data-server:3002
                                ├── vm-manager:3003
                                ├── kvm-manager:3007
                                ├── sandbox:3005
                                ├── openclaw:8001
                                └── nemoclaw:8002

aria-service → model-router:3004  (NEVER calls Anthropic/OpenAI directly)
aria-service → postgres:5432       (carbon_db, aria_* tables)
aria-service → minio:9000          (S3 storage for outputs)
```

---

## Directory Structure

```
carbon-copy/
├── nginx/                  Reverse proxy config
├── gateway/src/app.js      API gateway ← ARIA proxy routes added here
├── auth/                   JWT + bcrypt + Redis
├── data-server/            PostgreSQL + MinIO
├── vm-manager/             Docker container lifecycle
├── kvm-manager/            QEMU/KVM VM manager
├── model-router/           Universal AI router
│   └── src/providers/      openai.js, anthropic.js, ollama.js, huggingface.js
├── sandbox/                Safe GitHub repo runner
├── aria-service/           ← ARIA intelligence platform
│   ├── Dockerfile
│   ├── blueprints/         Research blueprint JSONs
│   └── src/
│       ├── index.js        Entry (port 3008)
│       ├── app.js          Express app
│       ├── orchestrator.js 5-agent mission system
│       ├── watchdog.js     Entity monitoring
│       ├── dossier.js      Document intelligence
│       ├── deliver-email.js
│       ├── deliver-slack.js
│       ├── middleware/serviceAuth.js
│       ├── routes/         missions, agents, watchdog, dossier, blueprints, budget, clients
│       └── services/
│           ├── db.js       PostgreSQL client
│           └── model-client.js  → model-router HTTP client
├── web-app/src/app/
│   ├── page.tsx            Dashboard (service health + ARIA summary)
│   ├── missions/           Mission list + submit
│   ├── chat/               Streaming chat
│   ├── agents/             Agent status
│   ├── watchdog/           WatchDog monitors
│   ├── dossier/            Document vault
│   ├── blueprints/         Blueprint browser
│   ├── budget/             Spend tracking
│   ├── models/             Model switcher
│   ├── projects/           Sandbox runner
│   ├── files/              MinIO browser
│   └── settings/           Provider config
├── services/openclaw/      Code AI (Python/FastAPI)
├── services/nemoclaw/      NLP AI (Python/FastAPI)
├── database/init/
│   ├── 01_schema.sql       Core tables
│   ├── 02_model_registry.sql
│   ├── 03_sandbox.sql
│   ├── 04_vms.sql
│   └── 05_aria.sql         ← ARIA tables (applied manually Apr 11)
├── monitoring/             Prometheus + Grafana
├── docker-compose.yml
└── scripts/
```

---

## ARIA Service Rules

1. **Never call Anthropic/OpenAI directly** — always use `model-client.js` → `model-router:3004`
2. **PostgreSQL only** — no SQLite anywhere
3. **Same Express pattern** as other services (health, metrics, serviceAuth)
4. **All routes return** `{ status: 'ok'|'error', data: ... }`
5. **Budget tracking** — log every AI call to aria_budget table

---

## ARIA Database Tables (carbon_db)

```sql
aria_missions         -- mission runs (id, client_id, goal, status, tokens_used, cost_usd, output)
aria_agents_state     -- live agent status
aria_clients          -- ARIA clients (not system users)
aria_audit_log        -- full action history
aria_watchdog_monitors -- entity monitoring configs
aria_dossier_files    -- uploaded documents
aria_blueprints       -- research templates (10 seeded)
aria_budget           -- daily/monthly spend per provider
```

---

## ARIA API Routes (via gateway /api/*)

```
GET  /api/agents              5 agent statuses + budget summary
GET  /api/missions            list missions (filter: status, clientId, limit)
POST /api/missions            submit mission {clientId, goal, context, blueprintId}
GET  /api/missions/:id        mission details + output
GET  /api/blueprints          list blueprints (filter: category)
GET  /api/watchdog            list monitors
POST /api/watchdog            create monitor {clientId, targetEntity, signalTypes}
GET  /api/dossier             list client files
POST /api/dossier             upload file (multipart)
GET  /api/clients             list clients
POST /api/clients             create client
GET  /api/aria-budget         budget status (today + month)
GET  /api/aria/health         health check
```

---

## Common Commands

```bash
# Start everything
bash scripts/start.sh

# Rebuild one service (fast)
docker compose build --no-cache <service>
docker compose up -d --force-recreate <service>

# Apply DB schema changes
docker exec -i carbon-postgres psql -U carbon -d carbon_db < database/init/05_aria.sql

# View logs
docker logs carbon-aria --tail 50 -f
docker logs carbon-gateway --tail 50 -f
docker logs carbon-web-app --tail 50 -f

# Check all containers
docker ps --format "{{.Names}}\t{{.Status}}" | grep carbon | sort

# Get auth token (for manual API testing)
curl -s -X POST http://localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"OmniFlow2026!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])"

# Test ARIA
TOKEN=$(curl -s -X POST http://localhost/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"OmniFlow2026!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
curl http://localhost/api/agents -H "Authorization: Bearer $TOKEN"
curl http://localhost/api/blueprints -H "Authorization: Bearer $TOKEN"
```

---

## Environment Variables

### Auto-generated by generate-secrets.sh
```
JWT_SECRET, JWT_REFRESH_SECRET, INTERNAL_SERVICE_TOKEN
POSTGRES_PASSWORD, REDIS_PASSWORD
MINIO_ROOT_USER, MINIO_ROOT_PASSWORD
GRAFANA_PASSWORD, CODE_SERVER_PASSWORD
```

### AI Providers
```
DEFAULT_PROVIDER=ollama       # ollama | openai | claude | huggingface
ANTHROPIC_API_KEY=            # Claude
OPENAI_API_KEY=               # OpenAI
HF_API_KEY=                   # HuggingFace
OLLAMA_DEFAULT_MODEL=llama3.2
```

### ARIA
```
ARIA_SERVICE_URL=http://aria-service:3008
BUDGET_DAILY_USD=50
BUDGET_MONTHLY_USD=1000
TELEGRAM_TOKEN=               # optional Telegram bot
RESEND_API_KEY=               # optional email delivery (Resend)
```

---

## Credentials

| Service | Username | Password |
|---|---|---|
| Carbon Cloud app | `admin` | `OmniFlow2026!` |
| MinIO console (:9001) | `minioadmin` | see `.env` MINIO_ROOT_PASSWORD |
| Grafana (:3001) | `admin` | see `.env` GRAFANA_PASSWORD |
| PostgreSQL | `carbon` | see `.env` POSTGRES_PASSWORD |

---

## Backlog (priority order)

### 🔴 High — next session
1. **System stats** — fix "0 Outputs / 0 B Storage / 0 Containers" on dashboard
   - `/api/data/outputs` count, `/api/data/storage/stats`, `/api/vm/containers` count
   - File: `web-app/src/app/page.tsx`

2. **Files page** — hitting 403, needs correct data-server endpoint
   - Check `/api/data/files` vs `/api/data/objects`
   - File: `web-app/src/app/files/page.tsx`

3. **Chat streaming** — connect to `/api/chat` with SSE streaming
   - Use pattern from `~/Desktop/OmniFlow/Raw/rawclaw-chat/app/stream/chat/route.js`
   - File: `web-app/src/app/chat/page.tsx`

4. **Sandbox/Projects page** — `/api/sandbox/runs` returning 404
   - Find correct sandbox endpoint, fix page
   - File: `web-app/src/app/projects/page.tsx`

### 🟡 Medium — this week
5. **AI cost tracking** — per-provider spend dashboard
   - OpenAI: `api.openai.com/v1/usage`
   - Anthropic: parse response usage fields
   - Perplexity: manual tracking
   - New service or extend aria-service budget routes
   - File: `web-app/src/app/budget/page.tsx`

6. **VM management UI** — kvm-manager page
   - List VMs, start/stop/create, noVNC console
   - File: `web-app/src/app/vms/page.tsx` (new)
   - API: `/api/kvm/vms`

7. **Settings page** — API key management
   - Form to set ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.
   - Store encrypted in DB or env
   - File: `web-app/src/app/settings/page.tsx`

### 🟢 Planned — future
8. **Claude Code agent** — sandboxed coding agent
   - Source: `~/Desktop/OmniFlow/Leaked/claude-code-source-code-v2.1.88/`
   - New Docker service `claude-agent` exposed via `/api/claude-agent`
   - Web UI: `web-app/src/app/code-agent/page.tsx`

9. **Raw repos full integration**
   - rawclaw-chat → better streaming chat UI
   - rawclaw-platform → cluster/agent management patterns
   - rawgrowth-os → skills system for ARIA
   - proposal-generator → output formatting templates
   - Source: `~/Desktop/OmniFlow/Raw/`

10. **Tailscale + DuckDNS** — remote access from anywhere
    - Add TAILSCALE_AUTH_KEY + DUCKDNS_TOKEN to .env
    - Run: `bash scripts/start-homelab.sh`

11. **Ollama model UI** — pull/delete/switch models from dashboard
    - File: `web-app/src/app/models/page.tsx` (extend existing)

12. **Auth login page** — restore proper login flow
    - Currently bypassed with auto-login for dev
    - File: `web-app/src/components/AuthGuard.tsx`
    - Fix login form submit → POST /auth/login → store token → redirect

---

## What Was Integrated (April 10-11, 2026)

Everything from `~/Desktop/OmniFlow/` was consolidated here:

| Source | Integration |
|---|---|
| Carbon-Copy v1 | Base platform, all services preserved |
| Carbon-Copy-v2 orchestrator | `aria-service/src/orchestrator.js` |
| Carbon-Copy-v2 React dashboard | `web-app/src/app/missions|agents|budget|...` |
| ARIA/OmniCore agent pipeline | `aria-service/src/orchestrator.js` |
| ARIA/OmniCore WatchDog | `aria-service/src/watchdog.js` |
| ARIA/OmniCore Dossier | `aria-service/src/dossier.js` |
| Raw/rawclaw-platform | web-app page patterns |
| Raw/rawclaw-chat | chat streaming pattern (pending) |
| Raw/rawclaw budget/governance | aria-service budget tracking |
| Leaked/claude-code-source-code | Studied for agent patterns (pending service) |
| Leaked/oh-my-codex | Agent orchestration patterns |

---

## Session Log

### Apr 10-11, 2026 (overnight)
- Built Carbon-Copy v2 from scratch
- Integrated ARIA intelligence platform as Docker microservice
- Added 7 new web-app pages (Missions, Chat, Agents, WatchDog, Dossier, Blueprints, Budget)
- Fixed gateway ARIA proxy routing (http-proxy-middleware v3 pathRewrite bug)
- Applied PostgreSQL ARIA schema
- Fixed web-app basePath for nginx routing
- Auto-login bypass for dev (AuthGuard.tsx)
- Fixed service health checks (9/9 operational)
- Committed 59 files, 14K+ lines
- Pushed to GitHub: https://github.com/Amaanb27241919/Carbon-Copy
