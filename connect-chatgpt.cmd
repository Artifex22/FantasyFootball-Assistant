@echo off
setlocal
cd /d "%~dp0"

set "CODEX_COMMAND=%CODEX_CLI_PATH%"
if not defined CODEX_COMMAND set "CODEX_COMMAND=codex.exe"

if not defined CODEX_CLI_PATH (
  where codex.exe >nul 2>nul
  if errorlevel 1 goto missing
) else (
  if not exist "%CODEX_COMMAND%" goto missing
)

echo Checking the local Codex CLI login...
"%CODEX_COMMAND%" login status
if not errorlevel 1 goto connected

echo.
echo A browser-based ChatGPT sign-in will open through the trusted local Codex CLI.
echo Draft Room never receives, copies, exports, or stores your ChatGPT credentials.
"%CODEX_COMMAND%" login
if errorlevel 1 goto failed

:connected
echo.
echo Codex is authenticated. Restart Draft Room, then use Data ^& sources ^> Codex rankings refresh.
pause
exit /b 0

:missing
echo [ERROR] A separately runnable Codex CLI was not found.
echo This helper will not download or execute an installer from the internet.
echo Follow the official setup instructions, then run this file again:
echo https://learn.chatgpt.com/docs/codex/cli
pause
exit /b 1

:failed
echo [ERROR] Codex login did not complete.
echo Run this helper again, or review https://learn.chatgpt.com/docs/auth
pause
exit /b 1
