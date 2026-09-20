# Baykuş Web — Windows (Next.js)
# Kullanım (repo kökünden):  .\scripts\dev-web-windows.ps1
# Önce API'yi başka bir pencerede çalıştırın: .\scripts\dev-api-windows.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$ApiPublic = "http://localhost:8000"
$env:NEXT_PUBLIC_API_URL = $ApiPublic

# Root .env varsa NEXT_PUBLIC_API_URL oku
$EnvFile = Join-Path $Root ".env"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match '^\s*NEXT_PUBLIC_API_URL=(.+)$') {
            $env:NEXT_PUBLIC_API_URL = $Matches[1].Trim().Trim('"')
        }
    }
}

$WebDir = Join-Path $Root "apps\web"
Set-Location $WebDir

if (-not (Test-Path "node_modules")) {
    Write-Host "==> npm install" -ForegroundColor Cyan
    npm install
}

Write-Host "==> Next.js: http://localhost:3000  (API: $env:NEXT_PUBLIC_API_URL)" -ForegroundColor Green
npm run dev
