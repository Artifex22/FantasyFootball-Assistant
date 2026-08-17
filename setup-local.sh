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

echo "Draft Room local setup is ready."
echo "Node: $(node --version)"
echo "Private connector storage: $script_dir/.local-data"
echo "Run ./start-draft-room.sh for a foreground local session."
echo "Run sudo ./setup-pi.sh for the hardened Raspberry Pi system service."
