@echo off
REM Baykus Panel launcher
chcp 65001 >nul
cd /d "%~dp0"
wscript //nologo "%~dp0Baykus.vbs"
exit /b 0
