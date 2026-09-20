# Baykuş API — Windows (SQLite, Docker yok)
# Kullanım (repo kökünden):  .\scripts\dev-api-windows.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "==> Repo kökü: $Root" -ForegroundColor Cyan

# .env oluştur / SQLITE satırını güvenceye al
$EnvFile = Join-Path $Root ".env"
$SqliteUrl = "sqlite:///./baykus.db"
$ApiPublic = "http://localhost:8000"
$Cors = "http://localhost:3000,http://127.0.0.1:3000"

if (-not (Test-Path $EnvFile)) {
    Write-Host "==> .env yok — oluşturuluyor (SQLite)" -ForegroundColor Yellow
    @"
# Windows yerel — SQLite (Alembic kullanmayın; create_all + seed)
DATABASE_URL=$SqliteUrl
SECRET_KEY=baykus-dev-secret-change-in-production
CORS_ORIGINS=$Cors
ACCESS_TOKEN_EXPIRE_MINUTES=720
NEXT_PUBLIC_API_URL=$ApiPublic
"@ | Set-Content -Path $EnvFile -Encoding UTF8
} else {
    $content = Get-Content $EnvFile -Raw
    if ($content -notmatch "(?m)^DATABASE_URL=") {
        Add-Content $EnvFile "`nDATABASE_URL=$SqliteUrl"
    }
    if ($content -notmatch "(?m)^NEXT_PUBLIC_API_URL=") {
        Add-Content $EnvFile "`nNEXT_PUBLIC_API_URL=$ApiPublic"
    }
}

# Ortam değişkenleri (apps/api .env aramasına bağımlı olmadan)
$env:DATABASE_URL = $SqliteUrl
$env:SECRET_KEY = "baykus-dev-secret-change-in-production"
$env:CORS_ORIGINS = $Cors
$env:NEXT_PUBLIC_API_URL = $ApiPublic

$ApiDir = Join-Path $Root "apps\api"
Set-Location $ApiDir

$VenvPython = Join-Path $ApiDir ".venv\Scripts\python.exe"
$VenvPip = Join-Path $ApiDir ".venv\Scripts\pip.exe"

if (-not (Test-Path $VenvPython)) {
    Write-Host "==> Python venv oluşturuluyor..." -ForegroundColor Cyan
    py -3 -m venv .venv
    if (-not (Test-Path $VenvPython)) {
        python -m venv .venv
    }
}

Write-Host "==> pip install -r requirements.txt" -ForegroundColor Cyan
& $VenvPip install -r requirements.txt

Write-Host "==> SQLite bootstrap (create_all + seed)" -ForegroundColor Cyan
& $VenvPython -m app.bootstrap_sqlite

Write-Host ""
Write-Host "API başlatılıyor: http://localhost:8000  (docs: /docs)" -ForegroundColor Green
Write-Host "Web için ayrı terminalde:  .\scripts\dev-web-windows.ps1" -ForegroundColor Green
Write-Host ""

& $VenvPython -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
