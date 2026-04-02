#!/bin/bash
MODEL=${1:-"llama3.2"}
echo "Pulling model: $MODEL via Ollama..."
docker compose exec ollama ollama pull "$MODEL"
echo "Done. Model $MODEL is ready."
