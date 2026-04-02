# Carbon-Copy Homelab Start Script — Windows
$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectDir

if (-not (Test-Path ".env")) {
    Write-Host "ERROR: .env not found. Run: .\scripts\generate-secrets.ps1" -ForegroundColor Red
    exit 1
}

Write-Host "Starting Carbon-Copy (Core + Homelab + Storage)..." -ForegroundColor Cyan

docker compose up -d --build
docker compose --profile homelab up -d

$IP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" } | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host "All services running:" -ForegroundColor Green
Write-Host ""
Write-Host "  Core:"
Write-Host "    API:        http://localhost/api"
Write-Host "    App (PWA):  http://localhost/app"
Write-Host "    VS Code:    http://localhost/code"
Write-Host ""
Write-Host "  Homelab:"
Write-Host "    Status:     http://localhost/status"
Write-Host "    Photos:     http://localhost/photos"
Write-Host "    DNS:        http://localhost/dns"
Write-Host "    Sync:       http://localhost/sync"
Write-Host "    Files:      \\$IP\shared  (open in File Explorer)"
Write-Host ""
Write-Host "  Direct ports:"
Write-Host "    Immich:     http://localhost:2283"
Write-Host "    Syncthing:  http://localhost:8384"
Write-Host "    Uptime:     http://localhost:3001"
