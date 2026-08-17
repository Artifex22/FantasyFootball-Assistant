@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 20 or newer was not found on PATH.
  pause
  exit /b 1
)

node -e "if (Number(process.versions.node.split('.')[0]) ^< 20) process.exit(1)"
if errorlevel 1 (
  echo [ERROR] Node.js 20 or newer is required.
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
echo Run connect-chatgpt.cmd to authorize the optional Codex rankings assistant.
pause
