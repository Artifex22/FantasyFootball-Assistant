@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 20 or newer was not found on PATH.
  pause
  exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set "NODE_VERSION=%%v"
if not exist ".local-data" mkdir ".local-data"

echo Draft Room local setup is ready.
echo Node: %NODE_VERSION%
echo Private connector storage: %CD%\.local-data
echo.
echo Double-click start-draft-room.cmd to launch the app.
pause
