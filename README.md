# Carbon-Copy: AI Cloud Infrastructure

A Docker-based cloud infrastructure for hosting AI projects. Carbon-Copy provides a full-stack platform with an API gateway, authentication, persistent storage, container management, and two AI microservices — OpenClaw (code intelligence) and NemoClaw (NLP/language intelligence).

---

## Architecture

```
                          ┌─────────────────────────────────────────────┐
                          │               carbon-net (Docker bridge)     │
                          │                                               │
Internet ──► :80/:443 ──► │  nginx (reverse proxy)                       │
                          │       │                                       │
                          │       ▼                                       │
                          │  gateway :3000  ◄──── rate limit + JWT auth  │
                          │       │                                       │
                          │  ┌────┴──────────────────────┐               │
                          │  │                           │               │
                          │  ▼                           ▼               │
                          │  auth :3001           data-server :3002      │
                          │  (JWT, bcrypt)        (PostgreSQL + MinIO)   │
                          │                                               │
                          │  vm-manager :3003     openclaw :8001         │
                          │  (Dockerode)          (code analysis/gen)    │
                          │                                               │
                          │  nemoclaw :8002                               │
                          │  (classify/summarize/embed)                  │
                          │                                               │
                          │  postgres :5432   redis :6379   minio :9000  │
                          │  prometheus :9090    grafana :3000 (internal)│
                          └─────────────────────────────────────────────┘
```

All services communicate on the `carbon-net` Docker network. Service-to-service calls use `INTERNAL_SERVICE_TOKEN` in the `Authorization: Bearer` header. Only nginx is exposed externally on ports 80 and 443.

---

## Quick Start

### 1. Clone and configure

```bash
git clone <repo-url> carbon-copy
cd carbon-copy

# Generate a .env with randomized secrets
bash scripts/generate-secrets.sh

# Set your LLM API key in .env
# LLM_API_KEY=sk-...
```

### 2. Start all services

```bash
bash scripts/start.sh
# or directly:
docker compose up -d --build
```

### 3. Verify

```bash
curl http://localhost/health
# {"status":"ok","service":"gateway"}
```

---

## Service Endpoints

All external traffic goes through nginx on port 80:

| Route | Upstream service | Auth required |
|---|---|---|
| `GET /health` | gateway | No |
| `POST /auth/login` | auth (via gateway) | No |
| `POST /auth/refresh` | auth (via gateway) | No |
| `POST /auth/logout` | auth (via gateway) | Bearer token |
| `GET /tokens/validate` | auth (via gateway) | Bearer token |
| `POST /api/openclaw/analyze` | openclaw | Bearer token |
| `POST /api/openclaw/generate` | openclaw | Bearer token |
| `POST /api/nemoclaw/classify` | nemoclaw | Bearer token |
| `POST /api/nemoclaw/summarize` | nemoclaw | Bearer token |
| `POST /api/nemoclaw/embed` | nemoclaw | Bearer token |
| `GET /api/data/outputs` | data-server | Bearer token |
| `GET/POST /api/vm/*` | vm-manager | Bearer token + admin role |

---

## API Examples

### Login

```bash
curl -s -X POST http://localhost/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"changeme"}' | jq .
```

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": {"id": "...", "username": "admin", "role": "admin"}
}
```

### OpenClaw — Analyze Code

```bash
TOKEN="eyJ..."

curl -s -X POST http://localhost/api/openclaw/analyze \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "def fib(n):\n  if n <= 1: return n\n  return fib(n-1) + fib(n-2)",
    "language": "python"
  }' | jq .
```

```json
{
  "analysis": "The function is correct but has O(2^n) exponential time complexity...",
  "language": "python",
  "tokens_used": 412,
  "output_id": "3f4a1b2c-..."
}
```

### OpenClaw — Generate Code

```bash
curl -s -X POST http://localhost/api/openclaw/generate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a Python function that debounces a callable",
    "language": "python"
  }' | jq .
```

### NemoClaw — Classify Text

```bash
curl -s -X POST http://localhost/api/nemoclaw/classify \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The new GPU architecture delivers 40% better performance per watt",
    "labels": ["technology", "finance", "sports", "politics"],
    "multi_label": false
  }' | jq .
```

```json
{
  "labels": [{"label": "technology", "confidence": 0.97}],
  "output_id": "..."
}
```

### NemoClaw — Summarize

```bash
curl -s -X POST http://localhost/api/nemoclaw/summarize \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Long article text here...",
    "max_length": 100,
    "style": "bullet-points"
  }' | jq .
```

### NemoClaw — Embed

```bash
curl -s -X POST http://localhost/api/nemoclaw/embed \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "texts": ["Hello world", "Machine learning is fascinating"]
  }' | jq '.embeddings[0][:5]'
```

---

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `JWT_SECRET` | HMAC secret for access tokens | (required) |
| `JWT_REFRESH_SECRET` | HMAC secret for refresh tokens | (required) |
| `INTERNAL_SERVICE_TOKEN` | Shared bearer token for service-to-service calls | (required) |
| `POSTGRES_USER` | PostgreSQL username | `carbon` |
| `POSTGRES_PASSWORD` | PostgreSQL password | (required) |
| `POSTGRES_DB` | PostgreSQL database name | `carbon_db` |
| `REDIS_PASSWORD` | Redis password | (required) |
| `MINIO_ACCESS_KEY` | MinIO access key | `carbonminio` |
| `MINIO_SECRET_KEY` | MinIO secret key | (required) |
| `GRAFANA_USER` | Grafana admin username | `admin` |
| `GRAFANA_PASSWORD` | Grafana admin password | (required) |
| `LLM_API_BASE_URL` | OpenAI-compatible API base URL | `https://api.openai.com/v1` |
| `LLM_API_KEY` | API key for LLM provider | (required) |
| `OPENCLAW_LLM_MODEL` | Model used by OpenClaw | `gpt-4o` |
| `NEMOCLAW_LLM_MODEL` | Chat model used by NemoClaw | `gpt-4o-mini` |
| `NEMOCLAW_EMBEDDING_MODEL` | Embedding model used by NemoClaw | `text-embedding-3-small` |

---

## Utility Scripts

| Script | Description |
|---|---|
| `scripts/generate-secrets.sh` | Generate `.env` from `.env.example` with random secrets |
| `scripts/start.sh` | Start all services (`docker compose up -d`) |
| `scripts/stop.sh` | Stop all services (`docker compose down`) |
| `scripts/deploy-project.sh <service>` | Rebuild and restart a single service |

---

## Monitoring

Prometheus scrapes all services every 15 seconds. Grafana is pre-configured with a Prometheus datasource.

Access Grafana via:
```bash
docker compose exec grafana sh
# then connect to http://localhost:3000 via port-forward or SSH tunnel
```

Or expose it temporarily:
```bash
docker compose port grafana 3000
```

---

## Security Notes

- Change the default admin password (`changeme`) immediately after first login.
- Never commit `.env` to source control (it is in `.gitignore`).
- Run `generate-secrets.sh` before any production deployment.
- The `vm-manager` API requires `admin` role — only admins can manage containers.
- All inter-service traffic uses `INTERNAL_SERVICE_TOKEN`; only the gateway is externally reachable.
