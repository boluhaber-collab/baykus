# Baykuş — Windows hızlı kurulum (SQLite, Docker yok)
# Bu script .env + venv + bootstrap yapar; ardından 2 pencere talimatı verir.
# API ve Web'i ayrı başlatmak için: dev-api-windows.ps1 / dev-web-windows.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host @"

╔══════════════════════════════════════════════════════════╗
║  Baykuş Baskı — Windows (Docker yok / SQLite)            ║
╚══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan

$EnvFile = Join-Path $Root ".env"
$SqliteUrl = "sqlite:///./baykus.db"
$ApiPublic = "http://localhost:8000"
$Cors = "http://localhost:3000,http://127.0.0.1:3000"

if (-not (Test-Path $EnvFile)) {
    @"
# Windows yerel — SQLite (Alembic kullanmayın; create_all + seed)
DATABASE_URL=$SqliteUrl
SECRET_KEY=baykus-dev-secret-change-in-production
CORS_ORIGINS=$Cors
ACCESS_TOKEN_EXPIRE_MINUTES=720
NEXT_PUBLIC_API_URL=$ApiPublic
"@ | Set-Content -Path $EnvFile -Encoding UTF8
    Write-Host "[ok] .env oluşturuldu (SQLite)" -ForegroundColor Green
} else {
    Write-Host "[ok] .env mevcut" -ForegroundColor Green
}

$env:DATABASE_URL = $SqliteUrl
$env:SECRET_KEY = "baykus-dev-secret-change-in-production"
$env:CORS_ORIGINS = $Cors

$ApiDir = Join-Path $Root "apps\api"
Push-Location $ApiDir
try {
    $VenvPython = Join-Path $ApiDir ".venv\Scripts\python.exe"
    $VenvPip = Join-Path $ApiDir ".venv\Scripts\pip.exe"
    if (-not (Test-Path $VenvPython)) {
        Write-Host "==> venv..." -ForegroundColor Cyan
        try { py -3 -m venv .venv } catch { python -m venv .venv }
    }
    Write-Host "==> pip install..." -ForegroundColor Cyan
    & $VenvPip install -r requirements.txt
    Write-Host "==> create_all + seed..." -ForegroundColor Cyan
    & $VenvPython -m app.bootstrap_sqlite
} finally {
    Pop-Location
}

$WebDir = Join-Path $Root "apps\web"
if (-not (Test-Path (Join-Path $WebDir "node_modules"))) {
    Write-Host "==> npm install (web)..." -ForegroundColor Cyan
    Push-Location $WebDir
    try { npm install } finally { Pop-Location }
}

Write-Host @"

Kurulum tamam. İKİ ayrı PowerShell penceresi açın:

  Pencere 1 (API):
    cd $Root
    .\scripts\dev-api-windows.ps1

  Pencere 2 (Web):
    cd $Root
    .\scripts\dev-web-windows.ps1

Sonra: http://localhost:3000
Giriş: admin@baykus.local / admin123

Not: SQLite için Alembic ÇALIŞTIRMAYIN.
     Postgres/Docker için README'deki docker compose yolunu kullanın.

"@ -ForegroundColor Green
