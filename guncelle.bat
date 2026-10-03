@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

echo.
echo ============================================================
echo   Baykus - Guvenli guncelleme (guncelle.bat)
echo ============================================================
echo   1) Once yedek: baykus.db + uploads
echo   2) Baykus_Guncelleme.zip varsa onu uygular
echo      (bu klasor, Masaustu veya USB). Yoksa yol sorar.
echo      Git varsa ve zip yoksa: git pull --ff-only
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
set ZIPMODE=

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

REM --- Paket ara: bu klasor, Masaustu, OneDrive Masaustu, USB ---
set "ZIP="
if exist "%~dp0Baykus_Guncelleme.zip" set "ZIP=%~dp0Baykus_Guncelleme.zip"
if not defined ZIP if exist "%USERPROFILE%\Desktop\Baykus_Guncelleme.zip" set "ZIP=%USERPROFILE%\Desktop\Baykus_Guncelleme.zip"
if not defined ZIP if exist "%USERPROFILE%\OneDrive\Desktop\Baykus_Guncelleme.zip" set "ZIP=%USERPROFILE%\OneDrive\Desktop\Baykus_Guncelleme.zip"
if not defined ZIP (
  for %%D in (D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
    if not defined ZIP if exist "%%D:\Baykus_Guncelleme.zip" set "ZIP=%%D:\Baykus_Guncelleme.zip"
  )
)

set "SRC="
if not defined ZIP if exist "%~dp0Baykus_Guncelleme\BAYKUS_GUNCELLEME.marker" set "SRC=%~dp0Baykus_Guncelleme"
if not defined ZIP if not defined SRC if exist "%USERPROFILE%\Desktop\Baykus_Guncelleme\BAYKUS_GUNCELLEME.marker" set "SRC=%USERPROFILE%\Desktop\Baykus_Guncelleme"
if not defined ZIP if not defined SRC if exist "%USERPROFILE%\OneDrive\Desktop\Baykus_Guncelleme\BAYKUS_GUNCELLEME.marker" set "SRC=%USERPROFILE%\OneDrive\Desktop\Baykus_Guncelleme"
if not defined ZIP if not defined SRC (
  for %%D in (D E F G H I J K L M N O P Q R S T U V W X Y Z) do (
    if not defined SRC if exist "%%D:\Baykus_Guncelleme\BAYKUS_GUNCELLEME.marker" set "SRC=%%D:\Baykus_Guncelleme"
  )
)

if defined ZIP goto :zip_update
if defined SRC goto :marker_check

if exist ".git\" goto :git_update

echo [2/4] Baykus_Guncelleme.zip otomatik bulunamadi.
echo Zip dosyasinin tam yolunu yazin.
echo Ornek: C:\Users\Public\Desktop\Baykus_Guncelleme.zip
echo Bos birakirsaniz guncelleme IPTAL (sadece yedek kalir).
echo.
set "ZIP="
set /p ZIP=Baykus_Guncelleme.zip yolu: 
if not defined ZIP (
  echo [..] Iptal. Yedek alindi, veritabani ayni.
  pause
  exit /b 0
)
set ZIP=%ZIP:"=%
if not exist "%ZIP%" (
  echo [HATA] Dosya yok: %ZIP%
  echo        Veritabanina dokunulmadi.
  pause
  exit /b 1
)
goto :zip_update

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
git pull --ff-only origin main
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

:zip_update
echo [2/4] Paket aciliyor:
echo       %ZIP%
set "STAGE=%TEMP%\baykus_guncelle_zip_%STAMP%"
if exist "%STAGE%\" rmdir /s /q "%STAGE%"
mkdir "%STAGE%"
tar -xf "%ZIP%" -C "%STAGE%"
if errorlevel 1 (
  echo [HATA] Zip acilamadi. Veritabanina dokunulmadi.
  echo        Yedek: %YEDEK_DIR%
  pause
  exit /b 1
)
set "SRC=%STAGE%"
if exist "%STAGE%\apps\api\" goto :marker_check
for /d %%D in ("%STAGE%\*") do (
  if exist "%%D\apps\api\" set "SRC=%%D"
)

:marker_check
if not exist "%SRC%\apps\api\" (
  echo [HATA] Pakette apps\api yok.
  echo        Veritabanina dokunulmadi.
  pause
  exit /b 1
)
if /i "%SRC%"=="%~dp0" (
  echo [HATA] Kaynak ile hedef ayni klasor olamaz.
  pause
  exit /b 1
)
if /i "%SRC%\"=="%~dp0" (
  echo [HATA] Kaynak ile hedef ayni klasor olamaz.
  pause
  exit /b 1
)
if exist "%SRC%\BAYKUS_GUNCELLEME.marker" goto :copy_src
echo.
echo [UYARI] BAYKUS_GUNCELLEME isareti yok.
echo         Yine de baykus.db ve uploads KORUNUR.
echo Devam icin E yazin.
set "OK="
set /p OK=E/H: 
if /i not "%OK%"=="E" (
  echo [..] Iptal. Yedek alindi, veritabani ayni.
  pause
  exit /b 0
)

:copy_src
echo [..] Kod kopyalaniyor (baykus.db / uploads / .env HARIC)...
set "COPY_RUNTIME=0"
if exist "%SRC%\runtime\python\python.exe" set "COPY_RUNTIME=1"
if exist "%SRC%\runtime\node\node.exe" set "COPY_RUNTIME=1"
if "%COPY_RUNTIME%"=="1" goto :copy_with_runtime
echo [..] Pakette tasinabilir runtime yok; mevcut runtime silinmez.
robocopy "%SRC%" "%~dp0." /E /NFL /NDL /NJH /NJS /nc /ns /np /XD uploads Yedekler .git __pycache__ .pytest_cache .ruff_cache backups .venv venv runtime /XF baykus.db baykus.db-journal .env .env.local Baykus_Guncelleme.zip
goto :copy_done
:copy_with_runtime
robocopy "%SRC%" "%~dp0." /E /NFL /NDL /NJH /NJS /nc /ns /np /XD uploads Yedekler .git __pycache__ .pytest_cache .ruff_cache backups .venv venv /XF baykus.db baykus.db-journal .env .env.local Baykus_Guncelleme.zip
:copy_done
set RC=%ERRORLEVEL%
if %RC% GEQ 8 (
  echo [HATA] robocopy basarisiz (kod %RC%). Yedekten db geri yazilacak.
  call :restore_data
  pause
  exit /b 1
)
echo [ok] Kod kopyalandi (baykus.db ve uploads atlandi, sonra yedekten yazilacak)
set "ZIPMODE=1"
goto :deps

:deps
echo.
echo [3/4] Paketler
if exist "runtime\python\python.exe" (
  set "PATH=%~dp0runtime\node;%~dp0runtime\python;%~dp0runtime\python\Scripts;%PATH%"
)

set NEED_PIP=0
set NEED_NPM=0
if "%ZIPMODE%"=="1" goto :deps_zip
if exist ".git\" (
  git diff --name-only HEAD@{1} HEAD 2>nul | findstr /i /c:"requirements.txt" /c:"pyproject.toml" >nul
  if not errorlevel 1 set NEED_PIP=1
  git diff --name-only HEAD@{1} HEAD 2>nul | findstr /i /c:"package.json" /c:"package-lock.json" >nul
  if not errorlevel 1 set NEED_NPM=1
) else (
  set NEED_PIP=1
  set NEED_NPM=1
)
goto :deps_run

:deps_zip
set NEED_PIP=1
if not exist "apps\web\node_modules\" set NEED_NPM=1
goto :deps_run

:deps_run
if "%NEED_PIP%"=="1" (
  if exist "runtime\python\python.exe" (
    echo [..] portable Python paketleri...
    "runtime\python\python.exe" -m pip install -r "apps\api\requirements.txt"
  ) else if exist "apps\api\.venv\Scripts\pip.exe" (
    echo [..] pip install ...
    "apps\api\.venv\Scripts\pip.exe" install -r "apps\api\requirements.txt"
  ) else (
    echo [UYARI] Python ortami yok - sade pakette kurulum.bat calistirin.
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
  echo [ok] npm paket dosyalari degismedi veya node_modules pakette geldi
)

echo.
echo [4/4] Veri koruma: yedekteki baykus.db + uploads geri yaziliyor
call :restore_data
echo.
echo ============================================================
echo   Veritabanina dokunulmadi (yedekten geri yazildi)
echo ============================================================
echo   Yedek: %YEDEK_DIR%
echo   Simdi Baykus.bat ile acabilirsiniz.
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
