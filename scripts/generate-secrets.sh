#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# ─── Safety check ─────────────────────────────────────────────────────────────
if [ -f ".env" ]; then
  echo "WARNING: .env already exists."
  read -r -p "Overwrite it with freshly generated secrets? [y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Aborted. Existing .env was not modified."
    exit 0
  fi
fi

if [ ! -f ".env.example" ]; then
  echo "ERROR: .env.example not found in $PROJECT_DIR"
  exit 1
fi

# ─── Generate secrets ─────────────────────────────────────────────────────────
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
INTERNAL_SERVICE_TOKEN=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)
MINIO_SECRET_KEY=$(openssl rand -hex 16)
GRAFANA_PASSWORD=$(openssl rand -hex 12)

echo "Generating .env with fresh secrets..."

sed \
  -e "s|change-me-64-char-random-hex-secret-do-not-use-in-production|${JWT_SECRET}|g" \
  -e "s|change-me-another-64-char-random-hex-secret-different-from-above|${JWT_REFRESH_SECRET}|g" \
  -e "s|change-me-internal-service-token-secret|${INTERNAL_SERVICE_TOKEN}|g" \
  -e "s|change-me-postgres-password|${POSTGRES_PASSWORD}|g" \
  -e "s|change-me-redis-password|${REDIS_PASSWORD}|g" \
  -e "s|change-me-minio-secret|${MINIO_SECRET_KEY}|g" \
  -e "s|change-me-grafana-password|${GRAFANA_PASSWORD}|g" \
  .env.example > .env

echo ""
echo ".env generated successfully."
echo ""
echo "IMPORTANT: You still need to set your LLM API key in .env:"
echo "  LLM_API_KEY=sk-..."
echo ""
echo "Default admin DB password and other secrets have been randomized."
echo "Do NOT commit .env to source control."
