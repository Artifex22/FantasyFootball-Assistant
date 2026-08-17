@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  echo Install it from a trusted source, then run this file again.
  pause
  exit /b 1
)

node -e "if (Number(process.versions.node.split('.')[0]) ^< 20) process.exit(1)"
if errorlevel 1 (
  echo Node.js 20 or newer is required.
  pause
  exit /b 1
)

if not exist ".local-data" mkdir ".local-data"
set "DRAFT_ROOM_OPEN_BROWSER=1"
echo Starting Draft Room. Press Ctrl+C here to stop it.
node server.js
if errorlevel 1 pause
