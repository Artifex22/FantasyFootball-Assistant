#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$script_dir"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js 20 or newer was not found on PATH."
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ "$node_major" -lt 20 ]]; then
  echo "[ERROR] Node.js 20 or newer is required; found $(node --version)."
  exit 1
fi

install -d -m 0700 .local-data
export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-4173}"
export PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-http://127.0.0.1:${PORT}}"

echo "Starting Draft Room at $PUBLIC_ORIGIN"
exec node server.js
