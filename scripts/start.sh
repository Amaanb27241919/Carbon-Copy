#!/bin/bash
set -e

# Detect OS
OS="$(uname -s)"
ARCH="$(uname -m)"

echo "Carbon-Copy AI Cloud"
echo "OS: $OS | Arch: $ARCH"
echo ""

# Check .env
if [ ! -f .env ]; then
    echo "ERROR: .env not found. Run: bash scripts/generate-secrets.sh"
    exit 1
fi

# Warn about placeholder secrets
if grep -q "change-me" .env 2>/dev/null; then
    echo "WARNING: .env contains placeholder secrets (change-me). Run generate-secrets.sh first for production use."
    echo ""
fi

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker not found."
    if [ "$OS" = "Darwin" ]; then
        echo "Install: https://docs.docker.com/desktop/mac/"
    elif [ "$OS" = "Linux" ]; then
        echo "Install: curl -fsSL https://get.docker.com | sh"
    fi
    exit 1
fi

# Start services
echo "Starting Carbon-Copy services..."
docker compose up -d

echo ""
echo "Services running:"
echo "  API Gateway:   http://localhost:80"
echo "  Model Router:  http://localhost:3004 (internal)"
echo "  Ollama:        http://localhost:11434"
echo "  MinIO Console: http://localhost:9001"
echo "  Grafana:       http://localhost:3001"
echo ""
echo "API Endpoints:"
echo "  POST /api/openclaw/analyze"
echo "  POST /api/openclaw/generate"
echo "  POST /api/nemoclaw/classify"
echo "  POST /api/nemoclaw/summarize"
echo "  POST /api/nemoclaw/embed"
