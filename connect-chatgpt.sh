#!/usr/bin/env bash
set -euo pipefail

codex_command="${CODEX_CLI_PATH:-codex}"
if [[ "$codex_command" == */* ]]; then
  if [[ ! -x "$codex_command" ]]; then
    echo "[ERROR] CODEX_CLI_PATH is not an executable file: $codex_command"
    exit 1
  fi
elif ! command -v "$codex_command" >/dev/null 2>&1; then
  echo "[ERROR] A separately runnable Codex CLI was not found."
  echo "This helper will not download or execute an installer from the internet."
  echo "Follow the official setup instructions, then run this script again:"
  echo "https://learn.chatgpt.com/docs/codex/cli"
  exit 1
fi

echo "Checking the local Codex CLI login..."
if "$codex_command" login status; then
  echo "Codex is already authenticated."
else
  echo "A browser-based ChatGPT sign-in will open through the trusted local Codex CLI."
  echo "Draft Room never receives, copies, exports, or stores your ChatGPT credentials."
  "$codex_command" login
fi

echo "Codex is authenticated. Restart Draft Room, then use Data & sources > Codex rankings refresh."
