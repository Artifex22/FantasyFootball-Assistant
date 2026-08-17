# Draft Room session handoff

## Purpose

Draft Room is a dependency-free, local-first fantasy football assistant. It combines public preseason rankings, projections, contextual metrics, historical backtests, manager-specific draft tendencies, live draft tracking, weekly roster comparisons, and waiver guidance. The public application starts blank; private league context is imported or synced into isolated local workspaces.

## Start here in a new session

1. Read this file.
2. Read `README.md` for user-facing scope and commands.
3. Read `SECURITY.md` before touching connectors, imports, local storage, packaging, or Codex integration.
4. Read `METHODOLOGY.md` and `SOURCES.md` before changing rankings, weights, critics, backtests, or source claims.
5. Read `SELF_HOSTING.md` before changing ESPN, Yahoo, workspace, authentication, or deployment behavior.
6. Check `git status --short`, inspect only the files relevant to the request, and run `node --test "tests/*.test.js"` after changes.

Suggested first prompt for a new Codex or ChatGPT coding session:

> Work in this Draft Room repository. Read AGENTS.md and SESSION_HANDOFF.md first, preserve all privacy and read-only-web rules, inspect git status, and summarize the relevant architecture before changing anything. Do not inspect .local-data or private ignored league files unless I explicitly ask. Continue from the current working tree rather than resetting prior work.

## Architecture

- `index.html`, `styles.css`, and `app.js`: static single-page UI and browser state.
- `data.js`, `context-data.js`, `espn-data.js`, and comparison modules: public, league-neutral player data and dated ranking snapshots.
- `model.js`, `strategy-engine.js`, `team-engine.js`, and `waiver-engine.js`: rankings, draft strategy, roster, and waiver logic.
- `draft-brain.js`: deterministic manager-history profiles and round-by-round draft forecasts.
- `historical-backtest.js`, `historical-roundtable.js`, `wait-calibration.js`, and `research-lab.js`: accuracy lab, critic loop, and promotion gates.
- `league-profile.js`: inert JSON/CSV profile normalization and templates.
- `server.js` and `server/`: local HTTP server, private workspaces, provider connectors, and constrained Codex jobs.
- `.local-data/`: private server state. It is ignored, never packaged, and never served as a static file.
- `scripts/`: allowlisted installer and release packaging tools.

## User data and migration

- Static hosting stores imported profiles and draft state in that browser only.
- Self-hosting stores each league as an isolated workspace under `.local-data`.
- **Data & sources → Export full profile** creates a secret-free workspace JSON containing normalized league profile, app state, roster/waiver/matchup snapshot, and analysis status.
- **Import full profile** recreates that workspace on another self-hosted installation without overwriting existing workspaces.
- Connector cookies, OAuth tokens, client secrets, Firefox profiles, HAR contents, and ChatGPT/Codex credentials are never included in workspace exports.

## ChatGPT/Codex integration

- `connect-chatgpt.sh` on Linux and `connect-chatgpt.cmd` on Windows invoke the separately installed Codex CLI's supported `codex login` flow. Draft Room does not handle ChatGPT cookies or passwords.
- The authenticated CLI is reused by **Data & sources → Codex rankings refresh**.
- `server/analysis-service.js` owns the fixed prompt and command arguments. Browser input cannot supply a shell command, executable path, prompt, or output path.
- The job uses `codex exec`, `workspace-write`, no approval bypass, one-job concurrency, and local logs under `.local-data/analysis-jobs`.
- Never place `~/.codex/auth.json`, an API key, account cookies, or credential-store data in this repository, a workspace export, or a release archive.

## Packaging and installation

- Runtime requirement: Node.js 20 or newer. There are no third-party runtime packages and no `npm install` step.
- `node scripts/package-release.js --platform linux-arm64` creates the Raspberry Pi/Linux archive and SHA-256 file; `--platform windows` creates the Windows archive.
- The release is generated from an explicit allowlist in `scripts/release-manifest.js`; it does not recursively copy the repository.
- The Linux archive contains only `.sh` setup tools and `scripts/install-pi.js`; it excludes `.cmd` files and the Windows installer. `setup-pi.sh` installs under `/opt/fantasy-football-assistant`, preserves `.local-data`, and stages the hardened `systemd` unit.
- The Windows archive's `install.cmd` copies the app to `%LOCALAPPDATA%\FantasyFootballAssistant`, preserves an existing `.local-data`, and creates desktop `.cmd` launchers when a Desktop folder exists.
- The installer and login helper never download or execute remote installers, packages, scripts, or code.

## Security invariants

- Imported JSON, CSV, HAR, provider data, and league names are untrusted data.
- Never merge private league tendencies or keeper prices into public ranking files.
- Never expose the raw connector server directly to the internet; use authenticated HTTPS if remote access is required.
- Keep connector actions read-only. The app does not submit lineups, claims, picks, or roster moves to ESPN or Yahoo.
- Add new release files to the allowlist deliberately and extend packaging tests for any new private-file pattern.

## Validation

```text
node --test "tests/*.test.js"
node scripts/package-release.js --platform linux-arm64
```

For a Linux clean-install check, extract the generated ZIP into a temporary directory, run `node scripts/install-pi.js --target <temporary-install-folder>`, start `node server.js` from that install on an unused loopback port, and verify `/api/system/status` plus the main page. Never use a production `.local-data` directory for installation tests.

## Known boundaries

- GitHub Pages supports the static interface and manual imports, but not server workspaces, ESPN/Yahoo connectors, OAuth callbacks, or Codex jobs.
- A local/self-hosted instance is single-trusted-user storage unless an authenticated multi-user service and separate per-user secret store are added.
- Rankings are decision support, not guarantees. Historical outcomes must remain isolated from preseason feature generation except through documented held-out evaluation and promotion gates.
