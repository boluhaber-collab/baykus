@echo off
REM Baykus kontrol paneli - sadece GUI (CMD kalmaz)
chcp 65001 >nul
cd /d "%~dp0"
wscript //nologo "%~dp0Baykus.vbs"
exit /b 0
