@echo off
REM Baykus - format sonrasi tek tik kurulum (zipi actiktan sonra cift tiklayin)
chcp 65001 >nul
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Kur.ps1"
if errorlevel 1 pause
exit /b 0
