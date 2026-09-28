@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo.
echo ============================================================
echo   Baykus Baski - Baslat (API 8000 + Web 3000)
echo ============================================================
echo.

if exist "runtime\python\python.exe" (
  set "BAYKUS_PY=%~dp0runtime\python\python.exe"
) else if exist "apps\api\.venv\Scripts\python.exe" (
  set "BAYKUS_PY=%~dp0apps\api\.venv\Scripts\python.exe"
) else if exist ".venv\Scripts\python.exe" (
  set "BAYKUS_PY=%~dp0.venv\Scripts\python.exe"
) else if exist "venv\Scripts\python.exe" (
  set "BAYKUS_PY=%~dp0venv\Scripts\python.exe"
) else (
  set "BAYKUS_PY="
  where py >nul 2>&1 && for /f "delims=" %%I in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "BAYKUS_PY=%%I"
  if not defined BAYKUS_PY (
    where python >nul 2>&1 && for /f "delims=" %%I in ('where python') do (
      if not defined BAYKUS_PY set "BAYKUS_PY=%%I"
    )
  )
  if not defined BAYKUS_PY (
    echo [HATA] Python bulunamadi.
    echo        Sira: runtime\python -^> .venv -^> sistem py -3 / python
    echo        Sade: once kurulum.bat  veya  Masaustu\baykus kullanin.
    pause
    exit /b 1
  )
)

if exist "runtime\node\npm.cmd" (
  set "PATH=%~dp0runtime\node;%~dp0runtime\python;%~dp0runtime\python\Scripts;%PATH%"
) else (
  where node >nul 2>&1
  if errorlevel 1 (
    echo [HATA] Node.js bulunamadi.
    echo        Sira: runtime\node -^> sistem node
    pause
    exit /b 1
  )
)

if not exist "apps\web\node_modules\" (
  echo [HATA] apps\web\node_modules yok.
  echo        Sade kurulum: once kurulum.bat
  echo        Tasinabilir paket: zip bozuk olabilir, yeniden cikarin.
  pause
  exit /b 1
)

if not exist ".env" (
  (
    echo DATABASE_URL=sqlite:///./baykus.db
    echo SECRET_KEY=baykus-isyeri-local-change-me
    echo CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
    echo ACCESS_TOKEN_EXPIRE_MINUTES=720
    echo NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
  ) > ".env"
)
if not exist "apps\web\.env.local" (
  (
    echo NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
  ) > "apps\web\.env.local"
)

echo [..] API penceresi aciliyor (port 8000)...
start "Baykus API" cmd /k "cd /d ""%~dp0apps\api"" && set DATABASE_URL=sqlite:///./baykus.db && set CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000 && set NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 && ""%BAYKUS_PY%"" -m uvicorn app.main:app --host 127.0.0.1 --port 8000"

timeout /t 3 /nobreak >nul

echo [..] Web penceresi aciliyor (port 3000)...
start "Baykus Web" cmd /k "cd /d ""%~dp0apps\web"" && set NEXT_PUBLIC_API_URL=http://127.0.0.1:8000 && set PATH=%~dp0runtime\node;%~dp0runtime\python;%~dp0runtime\python\Scripts;%PATH% && npm run dev"

echo.
echo Iki pencere acildi.
echo Tarayici: http://127.0.0.1:3000
echo Kapatmak icin her iki pencereyi de kapatin.
echo.
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:3000"
exit /b 0
