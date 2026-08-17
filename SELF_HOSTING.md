# Self-hosting and league analysis

The browser app can import league profiles and normalized historical-draft CSV files on both GitHub Pages and a local server. GitHub Pages keeps data in that browser's local storage. The self-hosted server additionally stores isolated league workspaces under `.local-data`.

## Raspberry Pi and Linux setup

Run `./setup-local.sh` once, then use `./start-draft-room.sh` for a foreground local session. For a persistent Pi service, run `sudo ./setup-pi.sh`; it installs the allowlisted Linux release under `/opt/fantasy-football-assistant`, creates an unprivileged service account, preserves `.local-data`, and stages the hardened `systemd` service without exposing a network port.

Build the Pi package with `node scripts/package-release.js --platform linux-arm64`. The resulting `-linux-arm64.zip` excludes Windows `.cmd` launchers and can be verified with `sha256sum -c` before extraction. No `npm install` is needed.

Follow `RASPBERRY_PI_HOSTING.md` for the complete Raspberry Pi OS, Tailscale/Cloudflare, Google Nest Wifi Pro, backup, upgrade, and validation workflow.

## Windows setup

Run `setup-local.cmd` once, then use `start-draft-room.cmd`. These scripts call `node` directly, so PowerShell's script execution policy does not affect startup.

For another Windows laptop, extract the versioned release ZIP and run `install.cmd`. The installer copies only the reviewed public-file allowlist to `%LOCALAPPDATA%\FantasyFootballAssistant`, creates desktop launchers, and preserves an existing `.local-data` during upgrades. It does not invoke `npm`, PowerShell, a package manager, or any remote installer.

Before moving computers, use **Data & sources → Export full profile** for each league. On the new installation, use **Import full profile** to recreate the isolated workspace. Workspace exports include normalized league data and saved app state but exclude ESPN cookies, Yahoo tokens/client secrets, Firefox profiles, HAR contents, and Codex credentials. Provider connections must be authorized again on the new computer.

## League connectors

The self-hosted server adds a same-origin league API and a private `.local-data` store:

- Yahoo uses the official OAuth authorization-code flow. Register the callback URL displayed in **Data & sources → League connections**.
- ESPN uses a dedicated Firefox profile. Sign in there and open your league before pressing **Finish connection**. Only `espn_s2`, `SWID`, and ESPN league URLs are read from Firefox's local profile databases; only the cookies and normalized league references are retained.
- On Linux, Firefox is detected at `/usr/bin/firefox`, `/usr/bin/firefox-esr`, or `/snap/bin/firefox`; set `ESPN_FIREFOX_PATH` when it is installed elsewhere. A headless `systemd` service should normally use HAR import instead of interactive browser launch.
- ESPN HAR import is a fallback. The parser accepts only ESPN hosts, retains only the two required cookie names and league references, and discards the raw HAR.
- Provider tokens and cookies never enter frontend JavaScript, browser exports, or league profile files.

Synced provider data is normalized into the same league-profile format used by manual imports. Select a workspace in the header to activate its isolated settings, keepers, history-based manager brains, draft state, favorites, rosters, waivers, matchups, and weekly team view. Use **Sync** to refresh teams, settings, current rosters, the fantasy matchup schedule, weekly projections/actuals, and available/waiver players. The **My team** tab remains read-only and never submits lineup changes.

Use **Data & sources → League workspaces** to rename, explicitly save, duplicate, export, or delete a workspace. Browser changes also debounce-save to the active workspace. Existing `league-snapshots.json` data migrates automatically the first time the updated server starts.

## Local analysis API

Run `npm start`, then send JSON to `POST http://127.0.0.1:4173/api/league/analyze` with `Content-Type: application/json`.

```json
{
  "profile": { "league": {}, "managerGroups": [], "seasons": [] },
  "availablePlayers": [{ "id": "player-id", "name": "Player", "team": "NFL", "position": "RB", "rank": 1 }],
  "rounds": 16
}
```

The response contains each manager's evidence summary, personality, and round-by-round position and player forecast. The engine is deterministic and local: it does not transmit league data, invoke a model, download code, or persist the request.

The server binds to `127.0.0.1` and rejects non-local host headers by default. Advanced deployments may set `PUBLIC_ORIGIN` and a comma-separated `ALLOWED_HOSTS`, but should keep `HOST=127.0.0.1` and place the app behind an authenticated HTTPS tunnel or reverse proxy on the same machine. Never expose the raw connector server directly to the public internet.

Example environment values for a reverse-proxied host:

```text
HOST=127.0.0.1
PUBLIC_ORIGIN=https://draft.example.com
ALLOWED_HOSTS=draft.example.com
```

Yahoo's registered callback must then be `https://draft.example.com/api/connectors/yahoo/callback`. Workspaces and provider credentials are shared by the single trusted self-hosted instance, so place any remote deployment behind authentication before allowing multiple people to reach it.

## Local Codex rankings job

The rankings-refresh button invokes a separate authenticated Codex CLI process through the stable non-interactive `codex exec` command. It uses a fixed server-owned prompt, `workspace-write` sandboxing, no approval bypass, no arbitrary browser prompt, and one running job at a time. The prompt requires online material to be treated as read-only text and prohibits downloading or running remote code.

If readiness reports that no CLI is available, install a separately runnable CLI or set an absolute trusted path before starting the server:

```powershell
$env:CODEX_CLI_PATH = "C:\Path\To\codex.exe"
node server.js
```

The Microsoft Store desktop app's bundled `codex.exe` may be visible on `PATH` while Windows still denies child-process execution. Draft Room verifies the executable before enabling the button and never falls back to a shell command.

Run `./connect-chatgpt.sh` on Linux or `connect-chatgpt.cmd` on Windows for a user-visible authentication flow. It first calls `codex login status` and, when needed, calls `codex login`; the Codex CLI owns the browser sign-in and credential cache. Draft Room does not read or migrate that cache. The supported authentication options and credential behavior are documented by [OpenAI](https://learn.chatgpt.com/docs/auth).

When opening the project in a new Codex or ChatGPT coding session, provide `SESSION_HANDOFF.md` and ask the session to read `AGENTS.md` first. Those files explain the current architecture and safety rules without containing a user's private league data.
