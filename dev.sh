#!/bin/bash
# Carbon Core — Dev Launcher
# Uses pm2 to keep both services alive automatically.
# Usage: bash dev.sh

REPO="$(cd "$(dirname "$0")" && pwd)"

echo "🧠 Starting Carbon Core via pm2..."

# Kill anything on our ports first
lsof -ti tcp:3001 | xargs kill -9 2>/dev/null
lsof -ti tcp:3006 | xargs kill -9 2>/dev/null
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
echo "✅ Carbon Core running:"
echo "   API:  http://localhost:3001/api/v2/ping"
echo "   App:  http://localhost:3006/app"
echo "   VMs:  http://localhost:3006/app/vms"
echo ""
echo "Commands:"
echo "   pm2 list          — check status"
echo "   pm2 logs          — view live logs"
echo "   pm2 stop all      — stop everything"
echo "   pm2 restart all   — restart everything"
