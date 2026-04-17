#!/bin/bash
# Carbon Core — Standalone Dev Launcher (no Docker needed)
# For full Docker stack: docker compose up -d (stop pm2 first)

REPO="$(cd "$(dirname "$0")" && pwd)"

# Warn if Docker containers are running on our ports
if docker ps 2>/dev/null | grep -q "carbon-core\|carbon-nginx"; then
  echo "⚠️  Docker stack detected. Stop it first: docker compose down"
  echo "   Then run: bash dev.sh"
  exit 1
fi

echo "🧠 Starting Carbon Core (standalone dev mode)..."

# Kill anything on our ports
lsof -ti tcp:3001 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti tcp:3006 2>/dev/null | xargs kill -9 2>/dev/null
sleep 1

# Start or restart via pm2
if pm2 list 2>/dev/null | grep -q "carbon-core"; then
  pm2 restart ecosystem.config.js
else
  pm2 start ecosystem.config.js
fi

sleep 4
pm2 list

echo ""
echo "✅ Carbon Core running (standalone):"
echo "   API:  http://localhost:3001/api/v2/ping"
echo "   App:  http://localhost:3006/app"
echo ""
echo "For full Docker stack:"
echo "   pm2 stop all && docker compose up -d"
echo "   → http://localhost/app (all 8 services)"
