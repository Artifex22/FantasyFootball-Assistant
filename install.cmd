@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 20 or newer was not found on PATH.
  echo This installer will not download or execute anything from the internet.
  echo Install Node.js manually from a trusted source, then run install.cmd again.
  echo Official download page: https://nodejs.org/en/download
  pause
  exit /b 1
)

node scripts\install-local.js %*
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo Installation complete. Use the desktop launcher or start-draft-room.cmd in the install folder.
echo Run connect-chatgpt.cmd when you want to authorize the optional Codex rankings assistant.
echo.
echo No online code, packages, or scripts were downloaded or executed.
if /i "%~1"=="--quiet" exit /b 0
if /i "%~1"=="/quiet" exit /b 0
pause
