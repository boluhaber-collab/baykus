@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

if not exist "Yedekler\" mkdir "Yedekler"

set YYYY=%date:~6,4%
set MM=%date:~3,2%
set DD=%date:~0,2%
set HH=%time:~0,2%
set MN=%time:~3,2%
set HH=%HH: =0%
set STAMP=%YYYY%%MM%%DD%_%HH%%MN%

set OUT=%~dp0Yedekler\baykus_yedek_%STAMP%.zip
set STAGE=%TEMP%\baykus_yedek_stage_%STAMP%

echo.
echo ============================================================
echo   Baykus yedek: baykus.db + uploads
echo ============================================================
echo.

if not exist "apps\api\baykus.db" (
  echo [HATA] apps\api\baykus.db bulunamadi.
  pause
  exit /b 1
)

if exist "%STAGE%" rmdir /s /q "%STAGE%"
mkdir "%STAGE%\apps\api\uploads" 2>nul
copy /y "apps\api\baykus.db" "%STAGE%\apps\api\baykus.db" >nul
if exist "apps\api\uploads\" xcopy "apps\api\uploads\*" "%STAGE%\apps\api\uploads\" /E /I /Y /Q >nul

powershell -NoProfile -Command "Compress-Archive -Path '%STAGE%\*' -DestinationPath '%OUT%' -Force"
set ERR=%ERRORLEVEL%
rmdir /s /q "%STAGE%" 2>nul

if not "%ERR%"=="0" (
  echo [HATA] Zip olusturulamadi.
  pause
  exit /b 1
)

echo [ok] Yedek yazildi:
echo     %OUT%
echo.
pause
exit /b 0
