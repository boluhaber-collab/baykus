@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================================
echo   Baykus - Guvenli kod guncelleme (guncelle.bat)
echo ============================================================
echo   - Once yedek alir (baykus.db + uploads)
echo   - Sonra sadece: git pull --ff-only
echo   - baykus.db ASLA uzaktan/USB'den kopyalanmaz
echo ============================================================
echo.

REM --- Tarih damgasi YYYYMMDD_HHMM (TR locale) ---
set YYYY=%date:~6,4%
set MM=%date:~3,2%
set DD=%date:~0,2%
set HH=%time:~0,2%
set MN=%time:~3,2%
set HH=%HH: =0%
set STAMP=%YYYY%%MM%%DD%_%HH%%MN%

set YEDEK_DIR=%~dp0Yedekler\once_guncelle_%STAMP%

REM ============================================================
REM 1) YEDEK (zorunlu, ilk adim)
REM ============================================================
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

echo [ok] Yedek klasoru:
echo     %YEDEK_DIR%
echo.

REM ============================================================
REM 2) Git kontrol + ff-only pull
REM ============================================================
where git >nul 2>&1
if errorlevel 1 (
  echo [HATA] git bulunamadi. Git kurun veya PATH'e ekleyin.
  echo        Yedek alindi; Veritabanına dokunulmadı.
  pause
  exit /b 1
)

if not exist ".git\" (
  echo [HATA] Bu klasor bir git deposu degil.
  echo        USB zip ile guncelleme icin GUNCELLEME.txt okuyun.
  echo        Yedek alindi; Veritabanına dokunulmadı.
  pause
  exit /b 1
)

echo [2/4] Yerel degisiklik kontrolu...
git diff --quiet --exit-code
set DIFF_WORK=%ERRORLEVEL%
git diff --cached --quiet --exit-code
set DIFF_INDEX=%ERRORLEVEL%
for /f "delims=" %%U in ('git ls-files --others --exclude-standard 2^>nul') do set HAS_UNTRACKED=1

if not "%DIFF_WORK%"=="0" goto :dirty
if not "%DIFF_INDEX%"=="0" goto :dirty
if defined HAS_UNTRACKED goto :dirty
goto :clean

:dirty
echo.
echo [HATA] Calisma alani kirli (degistirilmis / eklenmemis dosyalar var).
echo        git pull --ff-only GUVENLI DEGIL - catisma riski.
echo.
echo        Ne yapmalisiniz:
echo          1) Degisiklikleri kaydedin:  git stash push -u -m "once-guncelle"
echo             veya commit edin
echo          2) Ya da degisiklikleri geri alin (DIKKAT: kaybolur)
echo          3) Sonra guncelle.bat'i tekrar calistirin
echo.
echo        Yedek alindi: %YEDEK_DIR%
echo        Veritabanına dokunulmadı
echo.
pause
exit /b 1

:clean
echo [ok] Calisma alani temiz
echo [..] git pull --ff-only ...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo [HATA] git pull --ff-only basarisiz.
  echo        Uzak dal fast-forward ile birlestirilemiyor olabilir
  echo        (yerel commit'ler veya ag hatasi).
  echo        Manuel mudahale gerekir. baykus.db'ye DOKUNULMADI.
  echo        Yedek: %YEDEK_DIR%
  echo.
  pause
  exit /b 1
)
echo [ok] Kod guncellendi (ff-only)
echo.

REM ============================================================
REM 3) Bagimliliklar (sadece paket dosyalari degistiyse)
REM ============================================================
echo [3/4] Paket dosyalari kontrol...
set NEED_PIP=0
set NEED_NPM=0

REM pull sonrasi: yedek anindaki kopya yok; HEAD@{1} ile karsilastir
git diff --name-only HEAD@{1} HEAD 2>nul | findstr /i /c:"requirements.txt" /c:"pyproject.toml" >nul
if not errorlevel 1 set NEED_PIP=1

git diff --name-only HEAD@{1} HEAD 2>nul | findstr /i /c:"package.json" /c:"package-lock.json" >nul
if not errorlevel 1 set NEED_NPM=1

if "%NEED_PIP%"=="1" (
  echo [..] requirements/pyproject degisti - pip install ...
  if exist "apps\api\.venv\Scripts\pip.exe" (
    "apps\api\.venv\Scripts\pip.exe" install -r "apps\api\requirements.txt"
    if errorlevel 1 (
      echo [UYARI] pip install hata verdi. Elle kontrol edin.
    ) else (
      echo [ok] pip install tamam
    )
  ) else (
    echo [UYARI] .venv yok - once kurulum.bat calistirin, sonra tekrar deneyin.
  )
) else (
  echo [ok] Python paket dosyalari degismedi - pip atlandi
)

if "%NEED_NPM%"=="1" (
  echo [..] package.json degisti - npm install ...
  pushd "apps\web"
  call npm install
  if errorlevel 1 (
    echo [UYARI] npm install hata verdi. Elle kontrol edin.
  ) else (
    echo [ok] npm install tamam
  )
  popd
) else (
  echo [ok] npm paket dosyalari degismedi - npm atlandi
)

REM ============================================================
REM 4) Guvenlik ozeti — DB'ye ASLA dokunulmaz
REM ============================================================
echo.
echo [4/4] Guvenlik kontrolu
echo   - baykus.db uzaktan kopyalanmadi
echo   - uploads uzaktan ezilmedi
echo   - Yedek: %YEDEK_DIR%
echo.
echo ============================================================
echo   Veritabanına dokunulmadı
echo ============================================================
echo   Guncelleme tamam. baslat.bat ile uygulamayi acabilirsiniz.
echo.
pause
exit /b 0