# Carbon-Copy — AI Cloud, Homelab & Storage Server

A self-hosted, Docker-based platform that is simultaneously your AI cloud, homelab, and personal storage server. Runs on any OS. Controlled from iPhone or iPad.

---

## What It Does

| Capability | How |
|---|---|
| **ARIA Intelligence Platform** | 5-agent AI research system: scan, research, synthesis, delivery, client_mgr — run missions, monitor entities (WatchDog), manage document vaults (Dossier), and choose from 10 research blueprints |
| **Run AI GitHub repos safely** | Sandbox clones & runs any repo in an isolated container with CPU/RAM/timeout limits |
| **Host AI services** | OpenClaw (code intelligence) + NemoClaw (NLP) as microservices |
| **Use any AI model** | Model router switches between Ollama (local), Claude, OpenAI, HuggingFace at runtime |
| **Cloud + object storage** | MinIO (S3-compatible) + PostgreSQL with pgvector |
| **Control from iPhone/iPad** | PWA installable from Safari — no App Store needed |
| **Dev environment in browser** | VS Code (code-server) at `/code` |
| **Container management** | VM Manager: start/stop/restart/inspect any container via API |
| **Monitoring** | Prometheus + Grafana for all services |
| **iPhone photo backup** | Immich — self-hosted Google Photos at `/photos` |
| **Network file shares** | Samba — access files from iPhone Files app, Windows, macOS |
| **File sync across devices** | Syncthing — continuous, peer-to-peer file sync |
| **VPN remote access** | Tailscale — access everything from anywhere, no port forwarding |
| **Ad blocking + local DNS** | Pi-hole — network-wide ad blocking |
| **Dynamic DNS** | DuckDNS — keeps your home domain updated when your IP changes |
| **Uptime dashboard** | Uptime Kuma — simple service status page at `/status` |

---

## Architecture

```
                    ┌──────────────────────────────────────────────────────┐
                    │               carbon-net (Docker bridge)              │
                    │                                                        │
iPhone/iPad/Browser │                                                        │
  http://host/app ──┼──► web-app :3006  (Next.js PWA — iOS installable)   │
  http://host/code ─┼──► code-server :8080  (VS Code in browser)           │
  http://host/api  ─┼──► gateway :3000  ──► auth :3001                     │
                    │         │                                              │
                    │    ┌────┴───────────────────────────────────┐         │
                    │    ├─ /api/openclaw  ──► openclaw  :8001    │         │
                    │    ├─ /api/nemoclaw  ──► nemoclaw  :8002    │         │
                    │    ├─ /api/data      ──► data-server :3002  │         │
                    │    ├─ /api/vm        ──► vm-manager :3003   │         │
                    │    ├─ /api/models    ──► model-router :3004 │         │
                    │    ├─ /api/chat      ──► model-router :3004 │         │
                    │    └─ /api/sandbox   ──► sandbox :3005      │         │
                    │                                              │         │
                    │  model-router ──► ollama :11434 (local)     │         │
                    │               ──► OpenAI / Claude / HF APIs │         │
                    │                                              │         │
                    │  data-server ──► postgres :5432 (pgvector)  │         │
                    │              ──► minio :9000  (S3 storage)  │         │
                    │  auth        ──► redis :6379  (token cache) │         │
                    │  vm-manager  ──► Docker Engine socket        │         │
                    │  sandbox     ──► Docker Engine socket        │         │
                    │  prometheus :9090 ◄── scrapes all services   │         │
                    └──────────────────────────────────────────────────────┘
```

---

## Services

| Service | Port | Description |
|---|---|---|
| `nginx` | 80, 443 | Reverse proxy — only externally exposed service |
| `gateway` | 3000 | API gateway: JWT auth, rate limiting, routing |
| `auth` | 3001 | JWT login/refresh/logout, Redis token blocklist |
| `data-server` | 3002 | PostgreSQL + MinIO: outputs, logs, file storage |
| `vm-manager` | 3003 | Container start/stop/restart/stats (Dockerode) |
| `model-router` | 3004 | Universal AI provider router |
| `sandbox` | 3005 | Safe GitHub repo runner in isolated containers |
| `web-app` | 3006 | Next.js PWA — iPhone/iPad control panel |
| `kvm-manager` | 3007 | QEMU/KVM virtual machine lifecycle manager |
| `aria-service` | 3008 | ARIA Intelligence Platform — missions, WatchDog, Dossier, Blueprints |
| `openclaw` | 8001 | AI code analysis + generation (Python/FastAPI) |
| `nemoclaw` | 8002 | AI classify + summarize + embed (Python/FastAPI) |
| `ollama` | 11434 | Local LLM server (any model, GPU or CPU) |
| `code-server` | 8080 | VS Code in browser |
| `postgres` | 5432 | PostgreSQL 16 with pgvector |
| `redis` | 6379 | Token blocklist + rate limit store |
| `minio` | 9000/9001 | S3-compatible object storage + console |
| `prometheus` | 9090 | Metrics scraper |
| `grafana` | 3000 | Metrics dashboard |

---

---

## ARIA Intelligence Platform

Carbon-Copy v2 includes a built-in AI intelligence platform accessible from the Missions tab of the PWA.

### Core Features

| Feature | Description |
|---|---|
| **Missions** | Submit research goals to the 5-agent pipeline. ARIA scan → research → synthesize → deliver. |
| **WatchDog** | Monitor companies, people, or topics for signal changes (funding, leadership, regulatory, news). |
| **Dossier** | Upload documents — ARIA auto-summarizes and injects them as context into future missions. |
| **Blueprints** | 10 built-in research templates: competitive analysis, M&A, market research, due diligence, and more. |
| **Budget tracking** | Daily and monthly token/cost limits with utilization metrics in the dashboard. |

### API Endpoints

```bash
# Submit a research mission
curl -X POST http://localhost/api/missions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"<uuid>","goal":"Analyse the competitive landscape for AI CRMs"}'

# Get agent statuses
curl http://localhost/api/agents -H "Authorization: Bearer $TOKEN"

# Create a WatchDog monitor
curl -X POST http://localhost/api/watchdog \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"<uuid>","targetEntity":"Salesforce","signalTypes":["funding","product_launch"]}'

# Browse blueprints
curl http://localhost/api/blueprints -H "Authorization: Bearer $TOKEN"

# Check budget
curl http://localhost/api/aria-budget -H "Authorization: Bearer $TOKEN"
```

### 5-Agent Pipeline

```
Mission submitted
      │
      ▼
 [Scanner]       — classifies request type and priority
      │
      ▼
 [Researcher]    — runs AI-powered deep research via model-router
      │
      ▼
 [Synthesizer]   — formats output into structured JSON
      │
      ▼
 [Delivery]      — sends via email (Resend) or Slack webhook
      │
      ▼
 [Client Manager] — updates client knowledge vault
```

All AI calls route through the model-router — no direct Anthropic/OpenAI SDK calls.

---

## Quick Start

### Prerequisites
- **Linux/macOS:** Docker + Docker Compose v2
- **Windows:** Docker Desktop with WSL2 enabled

### 1. Clone & configure

```bash
git clone https://github.com/Amaanb27241919/Carbon-Copy.git
cd Carbon-Copy
```

**Linux/macOS:**
```bash
bash scripts/generate-secrets.sh
```

**Windows (PowerShell):**
```powershell
.\scripts\generate-secrets.ps1
```

This creates a `.env` file with randomised secrets. Open it and optionally set an LLM API key (not required — Ollama runs fully locally).

### 2. Start all services

**Linux/macOS:**
```bash
bash scripts/start.sh
```

**Windows:**
```powershell
.\scripts\start.ps1
```

Services start in order via health-check dependencies. Allow ~60 seconds on first run while images build.

### 3. Access

| URL | What |
|---|---|
| `http://localhost/app` | iPhone/iPad PWA dashboard |
| `http://localhost/code` | VS Code in browser |
| `http://localhost/api/health` | API health check |
| `http://localhost/auth/login` | Login endpoint |

**Default credentials:** `admin` / `changeme` — change immediately.

### 4. Install on iPhone or iPad

1. Open `http://YOUR_SERVER_IP/app` in **Safari**
2. Tap the **Share** button → **Add to Home Screen**
3. Tap **Add** — Carbon Cloud installs as a full-screen app

---

## iPhone / iPad App Tabs

| Tab | Features |
|---|---|
| **Dashboard** | Live health status of every service, system stats, recent AI outputs |
| **Projects** | Manage running containers, launch any GitHub AI repo in the sandbox |
| **Models** | Browse models by provider, switch active provider, built-in chat |
| **Files** | MinIO file browser — upload, download, browse storage |
| **Terminal** | Live container logs, container selector |
| **Settings** | Switch AI provider, enter API keys, logout |

---

## AI Models — Fully Local, No API Key Required

By default Carbon-Copy uses **Ollama** — runs entirely on your hardware.

```bash
# Pull a model (Linux/macOS)
bash scripts/add-model.sh llama3.2
bash scripts/add-model.sh codellama
bash scripts/add-model.sh mistral
bash scripts/add-model.sh nomic-embed-text

# Windows
.\scripts\add-model.ps1 llama3.2
```

**Switch to a cloud provider** — edit `.env` and restart:
```env
DEFAULT_PROVIDER=claude          # or: openai | huggingface
ANTHROPIC_API_KEY=sk-ant-...
```

**Switch provider per-request** (no restart needed):
```bash
curl -X POST http://localhost/api/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}],"provider":"claude"}'
```

Supported providers: `ollama` · `openai` · `claude` · `huggingface`

---

## Safe Sandbox — Run Any AI GitHub Repo

```bash
curl -X POST http://localhost/api/sandbox/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/user/some-ai-project",
    "name": "my-experiment",
    "cpuLimit": 1,
    "memoryMb": 1024
  }'
```

**Isolation per run:**
- Fresh container — no state leakage between projects
- CPU cap (default: 2 cores), RAM cap (default: 2 GB)
- 30-minute timeout — auto force-killed
- Auto-detects project type: Python, Node.js, Go, Rust, or custom Dockerfile
- All runs recorded in PostgreSQL

---

## API Reference

### Login
```bash
curl -X POST http://localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}'
# → { "accessToken": "eyJ...", "refreshToken": "eyJ..." }

export TOKEN="eyJ..."
```

### OpenClaw — Code Intelligence
```bash
# Analyse code
curl -X POST http://localhost/api/openclaw/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"def fib(n): return fib(n-1)+fib(n-2)","language":"python"}'

# Generate code
curl -X POST http://localhost/api/openclaw/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Write a Redis cache wrapper in Python","language":"python"}'
```

### NemoClaw — Language Intelligence
```bash
# Classify
curl -X POST http://localhost/api/nemoclaw/classify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"New GPU delivers 40% better perf","labels":["tech","finance","sports"]}'

# Summarise
curl -X POST http://localhost/api/nemoclaw/summarize \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text":"Long article...","max_length":100,"style":"bullet-points"}'

# Embed
curl -X POST http://localhost/api/nemoclaw/embed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"texts":["Hello world","Machine learning"]}'
```

### Container Management (admin only)
```bash
# List all carbon-* containers
curl http://localhost/api/vm/containers -H "Authorization: Bearer $TOKEN"

# Restart a service
curl -X POST http://localhost/api/vm/containers/carbon-openclaw/restart \
  -H "Authorization: Bearer $TOKEN"

# Get logs
curl "http://localhost/api/vm/containers/carbon-openclaw/logs?tail=50" \
  -H "Authorization: Bearer $TOKEN"
```

---

## Development

### Edit code in the browser
Open `http://localhost/code` — the full project is mounted at `/home/coder/carbon-copy`.

### Rebuild a single service
```bash
bash scripts/deploy-project.sh openclaw   # Linux/macOS
```

### Add a new AI service
1. Create `services/your-service/` following the openclaw or nemoclaw pattern
2. Add it to `docker-compose.yml`
3. Add a proxy route in `gateway/src/app.js`
4. Add a scrape target in `monitoring/prometheus/prometheus.yml`

### Database
```bash
docker compose exec postgres psql -U carbon -d carbon_db
```

---

## Directory Structure

```
carbon-copy/
├── nginx/              Reverse proxy (routes /app, /code, /api/*)
├── gateway/            API gateway — JWT, rate limiting, proxying
├── auth/               Auth service (JWT + bcrypt + Redis blocklist)
├── data-server/        Storage (PostgreSQL + MinIO)
├── vm-manager/         Container lifecycle manager
├── model-router/       Universal AI provider router
│   └── providers/      openai.js · anthropic.js · ollama.js · huggingface.js
├── sandbox/            Safe isolated GitHub repo runner
├── web-app/            Next.js 14 PWA — iPhone/iPad control panel
├── services/
│   ├── openclaw/       Code analysis + generation (Python/FastAPI)
│   ├── nemoclaw/       NLP: classify, summarise, embed (Python/FastAPI)
│   └── ollama/         Local model server with GPU support
├── database/init/      SQL schema migrations (auto-applied on first start)
├── monitoring/         Prometheus scrape config + Grafana datasource
└── scripts/
    ├── start.sh / .ps1             Start all services
    ├── stop.sh                     Stop all services
    ├── generate-secrets.sh / .ps1  Generate .env with random secrets
    ├── deploy-project.sh           Rebuild & restart one service
    └── add-model.sh / .ps1         Pull an Ollama model
```

---

## Environment Variables

### Core Secrets (auto-generated)

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs access tokens (15 min expiry) |
| `JWT_REFRESH_SECRET` | Signs refresh tokens (7 day expiry) |
| `INTERNAL_SERVICE_TOKEN` | Service-to-service authentication |
| `POSTGRES_PASSWORD` | Database password |
| `REDIS_PASSWORD` | Redis auth password |
| `MINIO_SECRET_KEY` | Object storage secret |
| `GRAFANA_PASSWORD` | Monitoring dashboard password |
| `CODE_SERVER_PASSWORD` | VS Code browser access password |

### AI Provider

| Variable | Default | Notes |
|---|---|---|
| `DEFAULT_PROVIDER` | `ollama` | `ollama` \| `openai` \| `claude` \| `huggingface` |
| `OPENAI_API_KEY` | _(blank)_ | Leave blank to disable OpenAI |
| `ANTHROPIC_API_KEY` | _(blank)_ | Leave blank to disable Claude |
| `HF_API_KEY` | _(blank)_ | Leave blank to use free HF tier |
| `OLLAMA_DEFAULT_MODEL` | `llama3.2` | Default local model |
| `OLLAMA_PRELOAD_MODELS` | `llama3.2` | Comma-separated models to pull on startup |

### Sandbox

| Variable | Default | Notes |
|---|---|---|
| `SANDBOX_CPU_LIMIT` | `2` | Max CPU cores per run |
| `SANDBOX_MEMORY_MB` | `2048` | Max RAM per run |
| `SANDBOX_TIMEOUT_MINUTES` | `30` | Auto-kill timeout |

---

---

## Homelab + Storage

### Start with homelab services

```bash
bash scripts/start-homelab.sh     # Linux/macOS
.\scripts\start-homelab.ps1       # Windows
```

Homelab services use Docker Compose [profiles](https://docs.docker.com/compose/profiles/) so they don't run unless explicitly started.

### Service map

| URL | Service | What it does |
|---|---|---|
| `http://HOST/status` | Uptime Kuma | Is everything up? Simple status page |
| `http://HOST/photos` | Immich | iPhone photo backup — like iCloud, self-hosted |
| `http://HOST/sync` | Syncthing | File sync dashboard |
| `http://HOST/dns` | Pi-hole | DNS + ad blocker admin |
| `http://HOST:2283` | Immich (direct) | Mobile app endpoint |
| `http://HOST:8384` | Syncthing (direct) | Sync config |

### iPhone photo backup (Immich)

1. Install the **Immich** app from the App Store
2. Open it → tap **+** → enter `http://YOUR_HOST/photos` as the server URL
3. Log in and enable **Background Backup** — your camera roll backs up automatically

### Access files from iPhone (Samba)

1. Open the **Files** app on iPhone
2. Tap **...** (top right) → **Connect to Server**
3. Enter `smb://YOUR_HOST_IP`
4. Username: `carbon`, Password: `SAMBA_PASSWORD` from `.env`
5. Your shared folders appear in Files alongside iCloud

### Access files from Windows

```
\\YOUR_HOST_IP\shared
\\YOUR_HOST_IP\ai-outputs
\\YOUR_HOST_IP\photos
```

### VPN access from anywhere (Tailscale)

1. Get a free auth key at [tailscale.com](https://login.tailscale.com/admin/settings/keys)
2. Add it to `.env`: `TAILSCALE_AUTH_KEY=tskey-auth-...`
3. Run `bash scripts/start-homelab.sh`
4. Install Tailscale on your iPhone — Carbon-Copy appears as `carbon-copy` in your tailnet
5. Access everything via `http://carbon-copy/app` from anywhere in the world

### Dynamic DNS (DuckDNS)

1. Create a free account at [duckdns.org](https://www.duckdns.org)
2. Create a subdomain (e.g. `mycarbon`)
3. Set in `.env`:
   ```env
   DUCKDNS_SUBDOMAIN=mycarbon
   DUCKDNS_TOKEN=your-token
   ```
4. Your server is reachable at `mycarbon.duckdns.org` even when your home IP changes

### Automated backups

```bash
bash scripts/backup.sh
```

Backs up PostgreSQL (gzipped SQL dump) and your `.env` (AES-256 encrypted) to `storage/backups/`. Keeps the last 7 backups. Schedule it with cron:

```bash
# Run backup every night at 2am
0 2 * * * cd /path/to/carbon-copy && bash scripts/backup.sh
```

### Storage layout

```
storage/
├── shared/       Samba share + Syncthing folder — all devices
├── ai-outputs/   AI model outputs exported for access via Files app
└── backups/      Automated database + config backups
```

---

## Security

- `.env` is gitignored — never commit it
- Run `generate-secrets.sh` before any deployment
- Change the default admin password immediately after first start
- `vm-manager` and `sandbox` APIs require `admin` role JWT
- Sandbox containers are CPU/RAM capped and network-isolated at runtime
- All inter-service traffic uses `INTERNAL_SERVICE_TOKEN` on the internal Docker network
- Only `nginx` is exposed to the internet
