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
PIHOLE_PASSWORD=$(openssl rand -hex 12)
SAMBA_PASSWORD=$(openssl rand -hex 12)
CODE_SERVER_PASSWORD=$(openssl rand -hex 12)

echo "Generating .env with fresh secrets..."

sed \
  -e "s|change-me-64-char-random-hex-secret-do-not-use-in-production|${JWT_SECRET}|g" \
  -e "s|change-me-another-64-char-random-hex-secret-different-from-above|${JWT_REFRESH_SECRET}|g" \
  -e "s|change-me-internal-service-token-secret|${INTERNAL_SERVICE_TOKEN}|g" \
  -e "s|change-me-postgres-password|${POSTGRES_PASSWORD}|g" \
  -e "s|change-me-redis-password|${REDIS_PASSWORD}|g" \
  -e "s|change-me-minio-secret|${MINIO_SECRET_KEY}|g" \
  -e "s|change-me-grafana-password|${GRAFANA_PASSWORD}|g" \
  -e "s|change-me-pihole-password|${PIHOLE_PASSWORD}|g" \
  -e "s|change-me-samba-password|${SAMBA_PASSWORD}|g" \
  -e "s|change-me-vscode-password|${CODE_SERVER_PASSWORD}|g" \
  .env.example > .env

echo ""
echo ".env generated successfully."
echo ""
echo "IMPORTANT: Optional — set these in .env to unlock more features:"
echo "  LLM_API_KEY=sk-...                  (OpenAI — Ollama works without it)"
echo "  TAILSCALE_AUTH_KEY=tskey-auth-...   (VPN remote access)"
echo "  DUCKDNS_TOKEN=...                   (dynamic DNS)"
echo ""
echo "All secrets randomized. Do NOT commit .env to source control."
