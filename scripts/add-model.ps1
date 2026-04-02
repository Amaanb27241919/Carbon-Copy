# Carbon-Copy AI Cloud - Pull an Ollama model (Windows)
param(
    [string]$Model = "llama3.2"
)

$ErrorActionPreference = "Stop"

Write-Host "Pulling model: $Model via Ollama..." -ForegroundColor Cyan
docker compose exec ollama ollama pull $Model
Write-Host "Done. Model $Model is ready." -ForegroundColor Green
