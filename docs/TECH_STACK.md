# Carbon Core — Technology Stack

_Last updated: April 17, 2026_

---

## Overview

Carbon Core uses a layered stack that prioritizes:
1. **Local-first AI** — Ollama runs on the same machine, no cloud required
2. **SQLite for dev, PostgreSQL for prod** — zero-config local development
3. **Docker Compose for production** — reproducible, portable, one-command deploy
4. **Node.js throughout** — single runtime, shared patterns across all services

---

## Full Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 14 | PWA framework, file-based routing, server components |
| TypeScript | 5.x | Type safety in web-app |
| React | 18 | Component model |
| TailwindCSS | 3.x | Utility-first styling |

**Why Next.js**: PWA support needed for iPhone/iPad installability. App Router provides server-side data fetching. next/image handles optimization automatically.

**Design system**: Dark background (#060B08), accent (#0CBF6A), no light mode. Defined in `web-app/src/app/globals.css`.

### API Layer

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20 (LTS) | Runtime for all backend services |
| Express | 4.x | HTTP framework for Carbon Core API, gateway, all services |
| better-sqlite3 | 9.x | Synchronous SQLite driver (dev mode) |
| pg (node-postgres) | 8.x | Async PostgreSQL driver (prod mode) |
| jsonwebtoken | 9.x | JWT auth in gateway and auth service |
| bcryptjs | 2.x | Password hashing in auth service |

**Why Express**: Minimal, battle-tested, all team members know it. Services are small — no framework overhead needed.

**Why better-sqlite3**: Synchronous SQLite is significantly faster than async for simple queries. The db-adapter.js wraps both drivers under a unified interface.

### Database

| Technology | Version | Purpose |
|-----------|---------|---------|
| SQLite (better-sqlite3) | 3.x | Development, local homelab, single-node |
| PostgreSQL | 16 | Production, multi-user, concurrent writes |
| pgvector extension | 0.7.x | Vector embeddings for future semantic search |
| Redis | 7 | Session cache, rate limiting, JWT refresh tokens |
| MinIO | latest | S3-compatible object storage for files and AI outputs |

**SQLite dev / PostgreSQL prod strategy**: `db-adapter.js` provides a unified interface. SQLite uses `?` placeholders and synchronous calls. PostgreSQL uses `$1` placeholders and async calls. The adapter normalizes SQL placeholders automatically.

**pgvector**: Already included in the Docker Compose PostgreSQL image (`pgvector/pgvector:pg16`). The `cc_knowledge_docs` table has a full-text search index. When vector search ships, embeddings go into `cc_knowledge_chunks.embedding` (BLOB in SQLite, vector in PG).

### AI Routing

| Technology | Purpose |
|-----------|---------|
| Ollama | Local LLM inference — llama3.2, mistral, codellama, etc. |
| Anthropic SDK | Claude claude-sonnet-4-6, claude-opus-4-6 |
| OpenAI SDK | GPT-4o, GPT-4o-mini |
| HuggingFace Inference API | Open models hosted by HF |

**Local-first routing strategy**: Every AI request flows through `model-router-client.js` → `model-router:3004`. The router tries providers in order: Ollama → Claude → OpenAI. If Ollama is up and the model exists, it's used. Cloud providers are only invoked when local is unavailable or explicitly requested. This keeps the default cost at $0.

**Rule**: ARIA and Carbon Core services NEVER call Anthropic or OpenAI directly. All calls go through model-router. This is a hard architectural constraint — single billing point, consistent budget governance.

### Infrastructure

| Technology | Purpose |
|-----------|---------|
| Docker Compose | Orchestrates all 15+ services |
| nginx | Reverse proxy, TLS termination, routing /app and /api |
| PM2 | Process manager for dev mode (carbon-core + carbon-web) |
| Prometheus | Metrics scraping |
| Grafana | Metrics visualization |
| Docker Socket Proxy (tecnativa) | Restricts Docker API surface for vm-manager and sandbox |

**Docker Compose profiles**:
- Default: core services (nginx, gateway, auth, carbon-core, aria-service, model-router, data-server, vm-manager, sandbox, web-app, postgres, redis, minio, ollama, kvm-manager, novnc)
- `--profile homelab`: adds tailscale, duckdns, uptime-kuma, pi-hole, immich, samba, syncthing
- `--profile code-server`: adds VS Code server (x86 only)

### VM Management

| Technology | Purpose |
|-----------|---------|
| UTM / utmctl | Apple Silicon native VMs (macOS, Windows ARM, Linux ARM) |
| KVM / QEMU | Linux VM management via kvm-manager service |
| noVNC | Browser-based VNC console for KVM VMs |

**UTM integration**: Carbon Core calls `utmctl list`, `utmctl start`, `utmctl stop`, etc. via `core/utm-client.js`. UTM must be installed on the host macOS machine. Works only in dev mode — Docker containers cannot run UTM.

### AI Services

| Technology | Purpose |
|-----------|---------|
| OpenClaw | Code intelligence (Python/FastAPI) |
| NemoClaw | NLP intelligence (Python/FastAPI) |
| ARIA | 5-agent research pipeline (Node.js/Express) |

---

## Carbon Core v4 New Tech

v4 introduces a tool execution architecture for agents:

| Technology | Purpose |
|-----------|---------|
| `core/v4/agent-tools.js` | Tool registry: BashTool, FileEditTool, FileReadTool, FileWriteTool, AgentTool |
| PermissionMode system | DEFAULT, ACCEPT_EDITS, BYPASS_PERMISSIONS, PLAN, DONT_ASK |
| HookEvents | PRE_TOOL, POST_TOOL fire through hooks-engine for every tool execution |

The v4 agent-tools architecture mirrors the Claude Code tool contract:
- `tool.call(input, context)` returns `{ output, error? }`
- `tool.checkPermissions(input, context)` returns `{ allowed, reason }`
- `tool.isReadOnly()`, `tool.isDestructive()` for permission mode decisions

---

## Why Not...

**Why not tRPC or GraphQL?** REST with consistent `{ status, data }` envelopes is simpler to debug, easier to test with curl, and sufficient for this use case.

**Why not Prisma?** The dual SQLite/PostgreSQL requirement is non-standard. The custom db-adapter.js gives full control over query normalization and handles the synchronous/asynchronous mismatch between better-sqlite3 and pg.

**Why not Redis for sessions only?** Redis also handles rate limiting in the gateway. The auth service stores JWT refresh tokens there with TTL expiry.

**Why not a monorepo tool (nx, turborepo)?** Each service is independent and deployable separately. The Docker Compose orchestrates them. Adding a monorepo tool would add overhead without benefit for this architecture.

**Why not vector search from day one?** The TF-IDF keyword search in `knowledge-service.js` is good enough for the current knowledge base size (hundreds of docs). pgvector is already installed. Vector search gets added when the knowledge base grows past ~10K docs and keyword search recall degrades.

---

## Security Choices

| Decision | Rationale |
|----------|-----------|
| Docker Socket Proxy | vm-manager and sandbox connect to a restricted Docker API proxy, not the raw socket. Prevents container escape via over-privileged Docker API access. |
| Internal service tokens | INTERNAL_SERVICE_TOKEN required for service-to-service calls. Prevents SSRF exploitation if a service is compromised. |
| JWT with short expiry + refresh | Access tokens expire quickly. Refresh tokens stored in Redis with revocation support. |
| No secrets in environment defaults | All secrets empty string defaults in docker-compose.yml, populated by .env. generate-secrets.sh creates random values. |

---

## Database Schema

### v2 Tables (schema-v2.sql)

| Table | Purpose |
|-------|---------|
| `budget_policies` | Per-agent spend limits |
| `budget_incidents` | Budget warning/hard-stop events |
| `heartbeat_runs` | Every agent execution run |
| `activity_log` | Immutable audit trail |
| `orchestration_runs` | Multi-agent run history |
| `ralph_loops` | Iterative loop history |
| `proposals` | AI-generated proposals |
| `knowledge_docs` | RAG document index |
| `vm_assignments` | VM to agent assignments |
| `model_usage` | Token/cost analytics |

### v4 Tables (schema-v4.sql — in progress)

| Table | Purpose |
|-------|---------|
| `cc_tool_calls` | Per-tool-call execution log (v4 only) |
| `cc_knowledge_chunks` | Document chunks with embedding field for future vector search |
| `cc_skill_executions` | Skill invocation log with cost tracking |
| `cc_ralph_loops` | Adds tool_calls_count, completion_fn_used columns |

### ARIA Tables (database/init/05_aria.sql)

| Table | Purpose |
|-------|---------|
| `aria_missions` | Research mission runs |
| `aria_agents_state` | Live 5-agent status |
| `aria_clients` | ARIA client accounts |
| `aria_audit_log` | Full action history |
| `aria_watchdog_monitors` | Entity monitoring configs |
| `aria_dossier_files` | Uploaded documents |
| `aria_blueprints` | 88 research templates |
| `aria_budget` | Daily/monthly spend per provider |
