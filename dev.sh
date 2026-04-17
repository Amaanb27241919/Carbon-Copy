#!/bin/bash
# Carbon Core — Local Dev Launcher
# Usage: bash dev.sh

REPO="$(cd "$(dirname "$0")" && pwd)"

# Kill anything on our ports first
echo "🧹 Clearing ports 3001 and 3006..."
lsof -ti :3001 | xargs kill -9 2>/dev/null
lsof -ti :3006 | xargs kill -9 2>/dev/null
sleep 1

echo "🧠 Starting Carbon Core API (port 3001)..."
node "$REPO/api-server-v2.js" &
API_PID=$!
sleep 1

# Verify API started
if ! curl -s http://localhost:3001/api/v2/ping > /dev/null 2>&1; then
  echo "⚠️  API still starting..."
  sleep 2
fi

echo "🌐 Starting web app (port 3006)..."
cd "$REPO/web-app" && npm run dev &
WEB_PID=$!

echo ""
echo "✅ Carbon Core dev running:"
echo "   API:  http://localhost:3001/api/v2/ping"
echo "   App:  http://localhost:3006/app"
echo "   Core: http://localhost:3006/app/core"
echo ""
echo "Press Ctrl+C to stop both."

trap "echo ''; echo 'Stopping...'; kill $API_PID $WEB_PID 2>/dev/null; lsof -ti :3001 :3006 | xargs kill -9 2>/dev/null; exit" INT TERM
wait
