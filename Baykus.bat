@echo off
REM Baykus kontrol paneli — sadece GUI (CMD kalmaz)
cd /d "%~dp0"
wscript //nologo "%~dp0Baykus.vbs"
exit /b 0
