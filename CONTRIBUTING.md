# Contributing to Carbon-Copy

Thanks for your interest. This document explains how the project is structured and how to add things to it.

---

## Project Structure

Every service follows a consistent pattern:

```
service-name/
├── Dockerfile          FROM node:20-alpine or python:3.12-slim
├── package.json        (Node) or requirements.txt (Python)
└── src/
    ├── index.js        Entry point — starts HTTP server, graceful shutdown
    ├── app.js          Express/FastAPI app — routes, middleware, error handler
    ├── middleware/
    │   └── serviceAuth.js   Validates INTERNAL_SERVICE_TOKEN
    ├── routes/         Route handlers
    └── services/       Business logic (db, docker, storage, etc.)
```

All Node.js services use CommonJS (`require`/`module.exports`) with `'use strict'`. All Python services use FastAPI with Pydantic v2.

---

## Adding a New AI Service

1. **Copy the template**

```bash
cp -r services/openclaw services/yourservice
```

2. **Update the service** — implement your routes in `routers/`, update `config.py`, update `main.py` title.

3. **Register in docker-compose.yml**

```yaml
  yourservice:
    build:
      context: ./services/yourservice
      dockerfile: Dockerfile
    container_name: carbon-yourservice
    restart: unless-stopped
    networks:
      - carbon-net
    env_file:
      - .env
    expose:
      - "800X"          # pick the next available port
    environment:
      PORT: "800X"
      DATA_SERVER_URL: "http://data-server:3002"
    depends_on:
      data-server:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:800X/health')"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 15s
```

4. **Add a gateway proxy route** in `gateway/src/app.js`:

```js
const YOURSERVICE_URL = process.env.YOURSERVICE_URL || 'http://yourservice:800X';
app.use('/api/yourservice', makeProxy(YOURSERVICE_URL, { '^/api/yourservice': '' }));
```

5. **Add the gateway env var** in docker-compose under the `gateway` service:

```yaml
YOURSERVICE_URL: "http://yourservice:800X"
```

6. **Add a Prometheus scrape target** in `monitoring/prometheus/prometheus.yml`:

```yaml
  - job_name: 'yourservice'
    static_configs:
      - targets: ['yourservice:800X']
    metrics_path: /metrics
```

7. **Expose `/health` and `/metrics`** in your service (see openclaw's `routers/health.py` for the pattern).

8. **Add to the model registry** in `database/init/02_model_registry.sql` if your service uses an LLM model.

---

## Running a Single Service Locally

```bash
# Rebuild and restart one service (no full compose restart)
bash scripts/deploy-project.sh yourservice

# Tail its logs
docker compose logs -f yourservice
```

---

## Code Style

**Node.js:**
- CommonJS only (`require`/`module.exports`) — no ES modules
- `'use strict'` at the top of every file
- Async/await, no callbacks
- Winston for logging (JSON format, `service` field in defaultMeta)
- Zod for request validation

**Python:**
- Python 3.12+
- FastAPI + Pydantic v2
- `async def` endpoints
- `logging.getLogger(__name__)` — no print statements

**General:**
- No `.env` files committed — secrets go in `.env` (gitignored)
- All inter-service calls use `INTERNAL_SERVICE_TOKEN` in `Authorization: Bearer` header
- Services must respond to `GET /health` with `{"status":"ok","service":"name"}`
- Services must respond to `GET /metrics` in Prometheus text format

---

## Database Migrations

Add a new file to `database/init/` with the next sequence number (e.g. `04_your_table.sql`). PostgreSQL runs these in filename order on first startup.

For existing deployments, run manually:
```bash
docker compose exec postgres psql -U carbon -d carbon_db -f /docker-entrypoint-initdb.d/04_your_table.sql
```

---

## Pull Requests

- One feature or fix per PR
- PR title should be concise: `Add sentiment analysis to NemoClaw`
- Include a brief description of what changed and why
- CI must pass (compose validation, lint, type-check, secret scan)

---

## Reporting Issues

Open a GitHub issue with:
- What you expected to happen
- What actually happened
- `docker compose logs <service>` output if relevant
- Your OS and Docker version
