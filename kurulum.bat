@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================================
echo   Baykus Baski - Kurulum (sade)
echo ============================================================
echo   Bu script Node.js ve Python kurulu mu kontrol eder.
echo   Eksikse indirme adresini gosterir. Internet gerekir.
echo ============================================================
echo.

set ERR=0

REM --- Python kontrolu ---
set PY_CMD=
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys; raise SystemExit(0 if sys.version_info>=(3,11) else 1)" >nul 2>&1
  if not errorlevel 1 set PY_CMD=py -3
)
if not defined PY_CMD (
  where python >nul 2>&1
  if not errorlevel 1 (
    python -c "import sys; raise SystemExit(0 if sys.version_info>=(3,11) else 1)" >nul 2>&1
    if not errorlevel 1 set PY_CMD=python
  )
)
if not defined PY_CMD (
  echo [HATA] Python 3.11+ bulunamadi.
  echo.
  echo   1^) Indirin: https://www.python.org/downloads/windows/
  echo   2^) Kurulumda "Add python.exe to PATH" kutusunu ISARETLEYIN.
  echo   3^) Bu pencereyi kapatip YENI bir CMD acin, sonra kurulum.bat'i tekrar calistirin.
  echo   Detay: Python_Kurulumu.txt
  echo.
  set ERR=1
) else (
  echo [ok] Python hazir: %PY_CMD%
  %PY_CMD% --version
)

REM --- Node / npm kontrolu ---
where node >nul 2>&1
if errorlevel 1 (
  echo [HATA] Node.js bulunamadi.
  echo.
  echo   1^) Indirin ^(LTS^): https://nodejs.org/
  echo   2^) Varsayilan ayarlarla kurun ^(PATH acik kalsin^).
  echo   3^) Bu pencereyi kapatip YENI bir CMD acin, sonra kurulum.bat'i tekrar calistirin.
  echo   Detay: Python_Kurulumu.txt
  echo.
  set ERR=1
) else (
  echo [ok] Node.js hazir:
  node --version
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [HATA] npm bulunamadi. Node.js LTS'yi yeniden kurun.
  echo        https://nodejs.org/
  set ERR=1
) else (
  echo [ok] npm hazir:
  npm --version
)

if not "%ERR%"=="0" (
  echo.
  echo Kurulum DURDU. Yukaridaki eksikleri giderip tekrar calistirin.
  pause
  exit /b 1
)

REM --- .env (gizli token YOK; yerel SQLite) ---
if not exist ".env" (
  echo [..] .env olusturuluyor ^(SQLite^)...
  (
    echo # Isyeri PC - SQLite ^(Alembic kullanmayin^)
    echo DATABASE_URL=sqlite:///./baykus.db
    echo SECRET_KEY=baykus-isyeri-local-change-me
    echo CORS_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
    echo ACCESS_TOKEN_EXPIRE_MINUTES=720
    echo NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
  ) > ".env"
  echo [ok] .env yazildi
) else (
  echo [ok] .env mevcut - dokunulmadi
)

if not exist "apps\web\.env.local" (
  (
    echo NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
  ) > "apps\web\.env.local"
  echo [ok] apps\web\.env.local yazildi
) else (
  echo [ok] apps\web\.env.local mevcut
)

REM --- API venv + pip ---
cd /d "%~dp0apps\api"
if not exist ".venv\Scripts\python.exe" (
  echo [..] Python sanal ortam ^(venv^) olusturuluyor...
  %PY_CMD% -m venv .venv
  if not exist ".venv\Scripts\python.exe" (
    echo [HATA] venv olusturulamadi. Python kurulumunu kontrol edin.
    pause
    exit /b 1
  )
)

echo [..] pip guncelleniyor...
".venv\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 (
  echo [HATA] pip yukseltme basarisiz. Internet baglantisini kontrol edin.
  pause
  exit /b 1
)

echo [..] Python paketleri kuruluyor ^(requirements.txt^)...
".venv\Scripts\pip.exe" install -r requirements.txt
if errorlevel 1 (
  echo [HATA] pip install basarisiz. Internet / proxy kontrol edin.
  pause
  exit /b 1
)

if exist "baykus.db" (
  echo [ok] Canli baykus.db bulundu - KORUNACAK ^(silinmez / ezilmez^)
) else (
  echo [..] baykus.db yok - ilk kurulumda olusturulacak
)
set DATABASE_URL=sqlite:///./baykus.db
echo [..] bootstrap_sqlite ^(sadece eksik tablo ekler; veriyi silmez^)...
".venv\Scripts\python.exe" -m app.bootstrap_sqlite
if errorlevel 1 (
  echo [UYARI] bootstrap hata verdi; DB varsa yine de baslatmayi deneyin.
)

REM --- npm ---
cd /d "%~dp0apps\web"
if not exist "node_modules\" (
  echo [..] npm install ... ^(birkaç dakika surebilir^)
  call npm install
  if errorlevel 1 (
    echo [HATA] npm install basarisiz. Internet / proxy kontrol edin.
    pause
    exit /b 1
  )
) else (
  echo [ok] node_modules mevcut - npm atlandi
)

cd /d "%~dp0"
if not exist "Yedekler\" mkdir "Yedekler"

echo.
echo ============================================================
echo   Kurulum tamam.
echo   Simdi: baslat.bat
echo   Tarayici: http://127.0.0.1:3000
echo ============================================================
echo.
pause
exit /b 0
