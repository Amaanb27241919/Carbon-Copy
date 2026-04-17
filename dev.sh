#!/bin/bash
# Carbon Core — Local Dev Launcher
# Usage: bash dev.sh

REPO="$(cd "$(dirname "$0")" && pwd)"

echo "🧠 Starting Carbon Core API (port 3001)..."
node "$REPO/api-server-v2.js" &
API_PID=$!

sleep 1

echo "🌐 Starting web app (port 3006)..."
cd "$REPO/web-app" && NEXT_PUBLIC_CORE_API_URL=http://localhost:3001/api/v2 npm run dev &
WEB_PID=$!

echo ""
echo "✅ Carbon Core dev running:"
echo "   API:  http://localhost:3001/api/v2/ping"
echo "   App:  http://localhost:3006/app"
echo "   Core: http://localhost:3006/app/core"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $API_PID $WEB_PID 2>/dev/null; exit" INT TERM
wait
