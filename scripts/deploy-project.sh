#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# ─── Usage ────────────────────────────────────────────────────────────────────
VALID_SERVICES=(gateway auth data-server vm-manager openclaw nemoclaw)

usage() {
  echo "Usage: $0 <service-name>"
  echo ""
  echo "Available services:"
  for s in "${VALID_SERVICES[@]}"; do
    echo "  $s"
  done
  exit 1
}

if [ $# -lt 1 ]; then
  echo "ERROR: No service name provided."
  usage
fi

SERVICE_NAME="$1"

# ─── Validate service name ────────────────────────────────────────────────────
VALID=false
for s in "${VALID_SERVICES[@]}"; do
  if [ "$s" = "$SERVICE_NAME" ]; then
    VALID=true
    break
  fi
done

if [ "$VALID" = "false" ]; then
  echo "ERROR: Unknown service '${SERVICE_NAME}'."
  usage
fi

# ─── Rebuild and restart ──────────────────────────────────────────────────────
echo "Deploying service: ${SERVICE_NAME}..."
docker compose build "${SERVICE_NAME}"
docker compose restart "${SERVICE_NAME}"

echo ""
echo "Deployment complete. Checking health..."
sleep 3

docker compose ps "${SERVICE_NAME}"
