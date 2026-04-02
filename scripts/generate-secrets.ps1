# Carbon-Copy AI Cloud - Windows Secret Generator
$ErrorActionPreference = "Stop"

Write-Host "Carbon-Copy - Generating secrets..." -ForegroundColor Cyan

if (-not (Test-Path ".env.example")) {
    Write-Host "ERROR: .env.example not found. Run from the project root directory." -ForegroundColor Red
    exit 1
}

if (Test-Path ".env") {
    Write-Host "WARNING: .env already exists. Overwriting..." -ForegroundColor Yellow
}

# Helper: generate a random hex string of N bytes
function New-RandomHex {
    param([int]$Bytes = 32)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $buffer = New-Object byte[] $Bytes
    $rng.GetBytes($buffer)
    $rng.Dispose()
    return [System.BitConverter]::ToString($buffer).Replace("-", "").ToLower()
}

# Read .env.example
$lines = Get-Content ".env.example"
$output = @()

foreach ($line in $lines) {
    # Replace change-me-* placeholder values with random hex secrets
    if ($line -match '^([A-Z_]+)=change-me') {
        $key = $Matches[1]
        $secret = New-RandomHex -Bytes 32
        $output += "$key=$secret"
        Write-Host "  Generated: $key" -ForegroundColor Green
    } else {
        $output += $line
    }
}

# Write .env
$output | Set-Content ".env" -Encoding UTF8

Write-Host ""
Write-Host ".env created successfully." -ForegroundColor Green
Write-Host "Review .env and fill in any API keys (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.) before starting." -ForegroundColor Yellow
