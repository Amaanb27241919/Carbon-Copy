#!/usr/bin/env bash
# Start Carbon-Copy with homelab + storage services enabled
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

if [ ! -f ".env" ]; then
  echo "ERROR: .env not found. Run: bash scripts/generate-secrets.sh"
  exit 1
fi

echo "Starting Carbon-Copy (Core + Homelab + Storage)..."
echo ""

# Start core services
docker compose up -d --build

# Start homelab profile services
docker compose --profile homelab up -d

echo ""
echo "All services running:"
echo ""
echo "  Core:"
echo "    API:        http://localhost/api"
echo "    App (PWA):  http://localhost/app"
echo "    VS Code:    http://localhost/code"
echo ""
echo "  Homelab:"
echo "    Status:     http://localhost/status    (Uptime Kuma)"
echo "    Photos:     http://localhost/photos    (Immich)"
echo "    DNS:        http://localhost/dns       (Pi-hole)"
echo "    Sync:       http://localhost/sync      (Syncthing)"
echo "    Files:      \\\\$(hostname -I | awk '{print $1}')\\shared  (Samba)"
echo ""
echo "  Direct ports:"
echo "    Immich:     http://localhost:2283"
echo "    Syncthing:  http://localhost:8384"
echo "    Uptime:     http://localhost:3001"
echo ""
if grep -q "TAILSCALE_AUTH_KEY=sk-tskey" .env 2>/dev/null || grep -q "TAILSCALE_AUTH_KEY=$" .env 2>/dev/null; then
  echo "  Tailscale: not configured (set TAILSCALE_AUTH_KEY in .env)"
else
  echo "  Tailscale: enabled — check 'docker logs carbon-tailscale' for status"
fi
