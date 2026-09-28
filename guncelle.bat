@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================================
echo   Baykus - Guvenli kod guncelleme (guncelle.bat)
echo ============================================================
echo   1) Once yedek: baykus.db + uploads
echo   2) Git varsa: git pull --ff-only
echo      Git yoksa: USB / yeni zip klasorunden kod kopyalanir
echo   3) baykus.db ve uploads YEDEKTEN geri yazilir (ASLA ezilmez)
echo ============================================================
echo.

set YYYY=%date:~6,4%
set MM=%date:~3,2%
set DD=%date:~0,2%
set HH=%time:~0,2%
set MN=%time:~3,2%
set HH=%HH: =0%
set STAMP=%YYYY%%MM%%DD%_%HH%%MN%
set YEDEK_DIR=%~dp0Yedekler\once_guncelle_%STAMP%
set HAD_DB=0

echo [1/4] Yedek aliniyor...
if not exist "%~dp0Yedekler\" mkdir "%~dp0Yedekler"
mkdir "%YEDEK_DIR%" 2>nul
mkdir "%YEDEK_DIR%\apps\api\uploads" 2>nul

if exist "apps\api\baykus.db" (
  copy /y "apps\api\baykus.db" "%YEDEK_DIR%\apps\api\baykus.db" >nul
  if errorlevel 1 (
    echo [HATA] baykus.db yedeklenemedi. Guncelleme IPTAL.
    pause
    exit /b 1
  )
  set HAD_DB=1
  echo [ok] baykus.db yedeklendi
) else (
  echo [UYARI] apps\api\baykus.db yok - yalniz uploads yedeklenecek
)

if exist "apps\api\uploads\" (
  xcopy "apps\api\uploads\*" "%YEDEK_DIR%\apps\api\uploads\" /E /I /Y /Q >nul
  echo [ok] uploads yedeklendi
) else (
  echo [..] uploads klasoru yok
)
echo [ok] Yedek: %YEDEK_DIR%
echo.

REM --- Kod guncelleme: git veya USB ---
if exist ".git\" (
  goto :git_update
) else (
  goto :usb_update
)

:git_update
where git >nul 2>&1
if errorlevel 1 (
  echo [HATA] .git var ama git programi PATH'te yok.
  echo        Yedek alindi; Veritabanina dokunulmadi.
  pause
  exit /b 1
)

echo [2/4] Yerel degisiklik kontrolu...
git diff --quiet --exit-code
set DIFF_WORK=%ERRORLEVEL%
git diff --cached --quiet --exit-code
set DIFF_INDEX=%ERRORLEVEL%
set HAS_UNTRACKED=
for /f "delims=" %%U in ('git ls-files --others --exclude-standard 2^>nul') do set HAS_UNTRACKED=1

if not "%DIFF_WORK%"=="0" goto :dirty
if not "%DIFF_INDEX%"=="0" goto :dirty
if defined HAS_UNTRACKED goto :dirty
goto :clean

:dirty
echo.
echo [HATA] Calisma alani kirli (degistirilmis / eklenmemis dosyalar var).
echo        git pull --ff-only GUVENLI DEGIL.
echo        Yedek: %YEDEK_DIR%
echo        Veritabanina dokunulmadi
echo.
pause
exit /b 1

:clean
echo [ok] Calisma alani temiz
echo [..] git pull --ff-only ...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo [HATA] git pull --ff-only basarisiz. baykus.db'ye DOKUNULMADI.
  echo        Yedek: %YEDEK_DIR%
  echo.
  call :restore_data
  pause
  exit /b 1
)
echo [ok] Kod guncellendi (git ff-only)
goto :deps

:usb_update
echo [2/4] Git yok - USB / zip ile kod guncelleme
echo.
echo   Yeni paketi AYRI bir klasore cikarin (bu klasorun UZERINE DEGIL).
echo   Sonra asagiya o klasorun yolunu yazin.
echo.
echo   Ornek: C:\Users\Public\Baykus_Tasinabilir_20260928
echo   Bos birakirsaniz guncelleme IPTAL (sadece yedek kalir).
echo.
set SRC=
set /p SRC=Yeni paket klasoru: 
if not defined SRC (
  echo [..] Iptal. Yedek alindi, veritabani ayni.
  pause
  exit /b 0
)
set SRC=%SRC:"=%
if not exist "%SRC%\" (
  echo [HATA] Klasor yok: %SRC%
  echo        Veritabanina dokunulmadi.
  pause
  exit /b 1
)
if not exist "%SRC%\apps\api\" (
  for /d %%D in ("%SRC%\*") do (
    if exist "%%D\apps\api\" set SRC=%%D
  )
)
if not exist "%SRC%\apps\api\" (
  echo [HATA] Kaynakta apps\api yok. Zip'i cikardiginiz klasoru verin
  echo        (icinde baslat.bat ve apps klasoru olmali).
  pause
  exit /b 1
)
if /i "%SRC%"=="%~dp0" (
  echo [HATA] Kaynak ile hedef ayni klasor olamaz.
  pause
  exit /b 1
)
if /i "%SRC%"=="%~dp0\" (
  echo [HATA] Kaynak ile hedef ayni klasor olamaz.
  pause
  exit /b 1
)

echo [..] Kod kopyalaniyor (baykus.db / uploads / .venv / node_modules / runtime HARIC)...
robocopy "%SRC%" "%~dp0." /E /NFL /NDL /NJH /NJS /nc /ns /np ^
  /XD node_modules .venv runtime Yedekler .git uploads .next __pycache__ .pytest_cache ^
  /XF baykus.db baykus.db-journal .env .env.local
set RC=%ERRORLEVEL%
if %RC% GEQ 8 (
  echo [HATA] robocopy basarisiz (kod %RC%). Yedekten db geri yazilacak.
  call :restore_data
  pause
  exit /b 1
)
echo [ok] Kod kopyalandi (korunan dosyalar atlandi)
goto :deps

:deps
echo.
echo [3/4] Paketler
if exist "runtime\python\python.exe" (
  set "PATH=%~dp0runtime\node;%~dp0runtime\python;%~dp0runtime\python\Scripts;%PATH%"
)

set NEED_PIP=0
set NEED_NPM=0
if exist ".git\" (
  git diff --name-only HEAD@{1} HEAD 2>nul | findstr /i /c:"requirements.txt" /c:"pyproject.toml" >nul
  if not errorlevel 1 set NEED_PIP=1
  git diff --name-only HEAD@{1} HEAD 2>nul | findstr /i /c:"package.json" /c:"package-lock.json" >nul
  if not errorlevel 1 set NEED_NPM=1
) else (
  REM USB guncellemesinde paket dosyasi gelmis olabilir - venv/runtime varsa dene
  set NEED_PIP=1
  set NEED_NPM=1
)

if "%NEED_PIP%"=="1" (
  if exist "runtime\python\python.exe" (
    echo [..] portable Python paketleri...
    "runtime\python\python.exe" -m pip install -r "apps\api\requirements.txt"
  ) else if exist "apps\api\.venv\Scripts\pip.exe" (
    echo [..] pip install ...
    "apps\api\.venv\Scripts\pip.exe" install -r "apps\api\requirements.txt"
  ) else (
    echo [UYARI] Python ortamı yok - sade pakette kurulum.bat calistirin.
  )
) else (
  echo [ok] Python paket dosyalari degismedi
)

if "%NEED_NPM%"=="1" (
  if exist "apps\web\package.json" (
    echo [..] npm install ...
    pushd "apps\web"
    call npm install
    if errorlevel 1 echo [UYARI] npm install hata verdi.
    popd
  )
) else (
  echo [ok] npm paket dosyalari degismedi
)

echo.
echo [4/4] Veri koruma: yedekteki baykus.db + uploads geri yaziliyor
call :restore_data
echo.
echo ============================================================
echo   Veritabanina dokunulmadi (yedekten geri yazildi)
echo ============================================================
echo   Yedek: %YEDEK_DIR%
echo   Simdi baslat.bat ile acabilirsiniz.
echo.
pause
exit /b 0

:restore_data
if exist "%YEDEK_DIR%\apps\api\baykus.db" (
  copy /y "%YEDEK_DIR%\apps\api\baykus.db" "apps\api\baykus.db" >nul
  echo [ok] baykus.db yedekten yerine yazildi (is yeri defteri korunur)
)
if exist "%YEDEK_DIR%\apps\api\uploads\" (
  if not exist "apps\api\uploads\" mkdir "apps\api\uploads"
  xcopy "%YEDEK_DIR%\apps\api\uploads\*" "apps\api\uploads\" /E /I /Y /Q >nul
  echo [ok] uploads yedekten yerine yazildi
)
exit /b 0
