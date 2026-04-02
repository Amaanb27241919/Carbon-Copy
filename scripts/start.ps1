# Carbon-Copy AI Cloud - Windows Start Script
$ErrorActionPreference = "Stop"

Write-Host "Carbon-Copy AI Cloud" -ForegroundColor Cyan
Write-Host "Platform: Windows" -ForegroundColor Gray
Write-Host ""

# Check .env
if (-not (Test-Path ".env")) {
    Write-Host "ERROR: .env not found. Run: .\scripts\generate-secrets.ps1" -ForegroundColor Red
    exit 1
}

# Warn about placeholder secrets
$envContent = Get-Content ".env" -Raw -ErrorAction SilentlyContinue
if ($envContent -match "change-me") {
    Write-Host "WARNING: .env contains placeholder secrets (change-me). Run generate-secrets.ps1 first for production use." -ForegroundColor Yellow
    Write-Host ""
}

# Check Docker
if (-not (Get-Command "docker" -ErrorAction SilentlyContinue)) {
    Write-Host "ERROR: Docker not found." -ForegroundColor Red
    Write-Host "Install Docker Desktop: https://docs.docker.com/desktop/windows/"
    exit 1
}

# Check WSL2 for GPU support (optional)
$wslVersion = wsl --version 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "WSL2 detected - GPU passthrough available" -ForegroundColor Green
}

Write-Host "Starting Carbon-Copy services..."
docker compose up -d

Write-Host ""
Write-Host "Services running:" -ForegroundColor Green
Write-Host "  API Gateway:   http://localhost:80"
Write-Host "  Model Router:  http://localhost:3004 (internal)"
Write-Host "  Ollama:        http://localhost:11434"
Write-Host "  MinIO Console: http://localhost:9001"
Write-Host "  Grafana:       http://localhost:3001"
