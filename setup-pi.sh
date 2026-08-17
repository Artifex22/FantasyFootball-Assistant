#!/usr/bin/env bash
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root: sudo bash setup-pi.sh"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required. Install Debian's nodejs package first."
  exit 1
fi

node_major="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ "$node_major" -lt 20 ]]; then
  echo "Node.js 20 or newer is required; found $(node --version)."
  exit 1
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
app_dir="/opt/fantasy-football-assistant"
service_user="draftroom"

if ! id "$service_user" >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$app_dir/.local-data" --shell /usr/sbin/nologin "$service_user"
fi

node "$script_dir/scripts/install-pi.js" --target "$app_dir"
install -d -m 0755 /etc/draft-room
if [[ ! -f /etc/draft-room/draft-room.env ]]; then
  install -m 0600 "$app_dir/deploy/raspberry-pi/draft-room.env.example" /etc/draft-room/draft-room.env
fi
install -m 0644 "$app_dir/deploy/raspberry-pi/draft-room.service" /etc/systemd/system/draft-room.service

chown -R root:root "$app_dir"
chmod -R go-w "$app_dir"
chown -R "$service_user:$service_user" "$app_dir/.local-data"
chmod 0700 "$app_dir/.local-data"
chmod 0600 /etc/draft-room/draft-room.env
systemctl daemon-reload

echo
echo "Installation is staged but not started."
echo "1. Edit /etc/draft-room/draft-room.env for the authenticated HTTPS hostname."
echo "2. Configure Tailscale Serve or Cloudflare Tunnel using RASPBERRY_PI_HOSTING.md."
echo "3. Run: sudo systemctl enable --now draft-room"
