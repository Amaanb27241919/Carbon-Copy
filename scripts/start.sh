#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# ─── Check .env ───────────────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
  echo "ERROR: .env file not found."
  echo ""
  echo "To get started, run:"
  echo "  bash scripts/generate-secrets.sh"
  echo ""
  echo "Or copy the example and fill in your own values:"
  echo "  cp .env.example .env"
  exit 1
fi

# ─── Warn about unchanged placeholder secrets ─────────────────────────────────
if grep -q "change-me" .env 2>/dev/null; then
  echo "WARNING: .env contains placeholder secrets (change-me). Run generate-secrets.sh first for production use."
  echo ""
fi

# ─── Start services ───────────────────────────────────────────────────────────
echo "Starting Carbon-Copy services..."
docker compose up -d --build

echo ""
echo "Services are starting. Health checks may take up to 60 seconds."
echo ""
echo "Service Endpoints:"
echo "  API Gateway:   http://localhost/api"
echo "  OpenClaw:      http://localhost/api/openclaw"
echo "  NemoClaw:      http://localhost/api/nemoclaw"
echo "  Auth login:    http://localhost/api/... (POST /auth/login)"
echo ""
echo "Internal (not exposed externally):"
echo "  Grafana:       docker exec carbon-grafana -> localhost:3000"
echo "  Prometheus:    docker exec carbon-prometheus -> localhost:9090"
echo "  MinIO Console: docker exec carbon-minio -> localhost:9001"
echo ""
echo "Run 'docker compose logs -f' to tail all logs."
