#!/bin/sh
set -e

# Start ollama serve in background
ollama serve &
OLLAMA_PID=$!

# Wait for Ollama to be ready
echo "Waiting for Ollama to be ready..."
MAX_WAIT=60
WAITED=0
until curl -sf http://localhost:11434/api/tags > /dev/null 2>&1; do
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "ERROR: Ollama did not become ready within ${MAX_WAIT}s"
    kill "$OLLAMA_PID" 2>/dev/null || true
    exit 1
  fi
  sleep 2
  WAITED=$((WAITED + 2))
done

echo "Ollama is ready."

# Preload models if OLLAMA_PRELOAD_MODELS is set
if [ -n "${OLLAMA_PRELOAD_MODELS:-}" ]; then
  echo "Preloading models: $OLLAMA_PRELOAD_MODELS"
  # Split comma-separated list
  echo "$OLLAMA_PRELOAD_MODELS" | tr ',' '\n' | while IFS= read -r model; do
    model="$(echo "$model" | tr -d '[:space:]')"
    if [ -n "$model" ]; then
      echo "Pulling model: $model ..."
      ollama pull "$model" || echo "WARNING: Failed to pull $model"
    fi
  done
  echo "Model preloading complete."
fi

# Keep container alive by waiting on the Ollama background process
wait "$OLLAMA_PID"
