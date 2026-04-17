# Carbon Core

**Secure self-hosted AI project build and deployment platform.**

Run AI projects in isolated VMs — not on your personal machine or corporate server. Local-first models, full intelligence stack, UTM-powered VMs on Apple Silicon.

---

## Quick Start

```bash
git clone https://github.com/Amaanb27241919/Carbon-Copy.git
cd Carbon-Copy
bash dev.sh
# → App: http://localhost:3006/app
# → API: http://localhost:3001/api/v2/ping
```

**Full Docker stack:**
```bash
cp .env.example .env  # edit secrets
docker compose up -d
open http://localhost/app
```

Default login: `admin` / `OmniFlow2026!`

---

## What Works Right Now

### Without Docker (`bash dev.sh`)
| Feature | Status |
|---------|--------|
| Dashboard | ✅ Live |
| Carbon Core API (`/api/v2`) | ✅ Live |
| Chat (Claude/OpenAI/Ollama) | ✅ Live |
| Models page | ✅ Live |
| Missions (orchestration) | ✅ Live |
| Agents (18 expert agents) | ✅ Live |
| Core page (health/budget/VMs) | ✅ Live |
| **VMs — UTM (Apple Silicon)** | ✅ Live |
| Budget governance | ✅ Live |
| Audit log | ✅ Live |

### Needs Docker
| Feature | Why |
|---------|-----|
| ARIA research pipeline | aria-service |
| WatchDog monitoring | aria-service |
| File storage | MinIO + data-server |
| Local Ollama models | ollama container |
| PostgreSQL persistence | postgres container |

---

## VM Management (Apple Silicon)

Carbon Core controls VMs via `utmctl` — the official CLI bundled inside UTM.app.

**Setup (one time):**
1. Download UTM: https://mac.getutm.app (free)
2. Install and open UTM
3. Start `bash dev.sh` — Carbon Core auto-detects UTM

**What you can do from the web UI (`/app/vms`):**
- **Start** — boot any UTM VM
- **Shutdown** — graceful power-off (sends signal to guest OS)
- **Stop** — force kill the VM process
- **Delete** — permanently remove VM
- **Open UTM** — brings UTM window to foreground

**Add more VMs:** Open UTM → `+` → Gallery (Ubuntu ARM, Windows 11 ARM, etc.)

**VM commands under the hood:**
```bash
utmctl list                        # list all VMs
utmctl start <uuid>                # start VM
utmctl stop <uuid> --request       # graceful shutdown
utmctl stop <uuid> --kill          # force kill
utmctl exec <uuid> -- <command>    # run command in guest
utmctl ip-address <uuid>           # get VM IP
```

---

## Architecture

```
nginx (reverse proxy, Docker)
  ├── /app          → Next.js web app (PWA)
  ├── /api/v2       → Carbon Core v3 API
  ├── /api          → API Gateway (auth, routing)
  └── /socket.io    → ARIA real-time updates

Carbon Core v3 (core/)
  ├── budget-v2.js          Per-agent spend limits + auto-pause
  ├── heartbeat-v2.js       Every agent run tracked
  ├── audit-v2.js           Immutable activity trail
  ├── health-v2.js          5-subsystem health monitor
  ├── orchestrator-v2.js    parallel/sequential/hierarchical/pipeline/phased
  ├── utm-client.js         UTM VM control via utmctl CLI
  ├── vm-manager-client.js  Docker KVM VM control
  ├── model-router-client.js Local-first: Ollama → Claude → OpenAI
  ├── agent-registry.js     7-agent OS (Scan/Ali/Quilly/Larry/Ovi/Cleo/Sam)
  ├── expert-agents.js      18 expert agent prompts (executor/verifier/planner...)
  ├── skills-registry.js    61 skills from rawclaw-platform
  ├── ralph-loop.js         Iterative self-improving loop
  ├── hooks-engine.js       Event hooks (warn/block/transform/log/notify)
  └── usage-tracker.js      Claude token/cost analytics
```

---

## Carbon Core API

Base: `http://localhost:3001/api/v2`

| Endpoint | Description |
|----------|-------------|
| `GET /ping` | Version check |
| `GET /health` | 5-subsystem health |
| `GET /summary` | Full dashboard snapshot |
| `GET /budget` | Budget policies + incidents |
| `POST /budget/policy` | Create spend limit |
| `GET /heartbeat` | Agent execution runs |
| `GET /activity` | Audit log |
| `POST /orchestration` | Start multi-agent run |
| `GET /missions` | List missions (orchestration runs) |
| `POST /missions` | Create mission |
| `GET /vms` | All VMs (UTM + Docker KVM) |
| `POST /vms/utm/:id/start` | Start UTM VM |
| `POST /vms/utm/:id/shutdown` | Graceful shutdown |
| `POST /vms/utm/:id/stop` | Force stop |
| `DELETE /vms/utm/:id` | Delete UTM VM |
| `GET /models/providers` | Available AI providers |
| `GET /agents/expert` | 18 expert agent prompts |
| `POST /agents/route` | Route task to best agent |
| `POST /ralph` | Start Ralph loop |
| `POST /chat` | Chat via Ollama/Claude/OpenAI |
| `GET /usage` | Claude token/cost analytics |
| `GET /stream` | SSE real-time hive mind feed |

---

## Model Routing

Local-first. No API key required to start.

```
Request → Ollama (free, local) → Claude (paid) → OpenAI (paid)
```

Install Ollama locally (no Docker):
```bash
brew install ollama && ollama serve
ollama pull llama3.2
```

---

## Vision

**Who**: Developers and teams who want a secure sandboxed environment for AI projects — not their personal machine or corporate server.

**Why**: Privacy + Cost (local Ollama) + Control + Speed. Deploy in 10 min. Your own private AI cloud.

**Revenue**: Freemium → managed hosting → enterprise. $10K–$100K ARR target by 2027.

**License**: Dual — community MIT + commercial enterprise.

---

## Development Guidelines

This repo uses [Karpathy-inspired coding guidelines](./CLAUDE.md):
- Think before coding (surface assumptions)
- Simplicity first (minimum code)
- Surgical changes (touch only what's needed)
- Goal-driven execution (verify before claiming done)

---

© 2026 OmniFlow Advisory — Built by Amaan Khan
