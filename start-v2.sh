#!/usr/bin/env bash
# Carbon Core v2 — Start Script
# Starts the v2 API server with all services

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load .env if present
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

PORT="${PORT_V2:-3001}"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Carbon Core v2 — Launch"
echo "═══════════════════════════════════════════════════════"
echo "  Dir:    $SCRIPT_DIR"
echo "  Port:   $PORT"
echo "  DB:     ${DB_PATH:-carbon-copy.db}"
echo "═══════════════════════════════════════════════════════"
echo ""

# Check Node.js version
NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[error] Node.js 18+ required (found v$(node --version))"
  exit 1
fi

# Check required deps
if [ ! -d node_modules ]; then
  echo "[deps] Installing..."
  npm install
fi

# Apply schema if DB exists or will be created
echo "[db] Schema will be applied on startup"

# Start the server
if command -v nodemon &>/dev/null && [ "${NODE_ENV}" = "development" ]; then
  echo "[start] Using nodemon (development mode)"
  exec nodemon --watch services --watch index-v2.js index-v2.js
else
  echo "[start] Starting production server"
  exec node index-v2.js
fi
