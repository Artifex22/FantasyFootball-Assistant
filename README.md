# Draft Room

A dependency-free, local-first fantasy football draft decision assistant. The public app starts with generic teams and no private league history. Each user can import a local league profile or, when self-hosted, connect ESPN or Yahoo and save each league as an isolated private server workspace.

The Accuracy Lab keeps historical outcomes outside the preseason ranking path, separates directional critics from uncertainty calibration, and blocks historical weights from the live model until strict multi-season promotion gates pass. The public release contains one privacy-safe public-source pilot and no league-specific draft prices.

## Raspberry Pi and Linux setup

Install the signed operating-system prerequisites, then run the Linux setup helper:

```bash
sudo apt update
sudo apt install --no-install-recommends nodejs unzip
./setup-local.sh
./start-draft-room.sh
```

The foreground server is available at `http://127.0.0.1:4173`. For a persistent Raspberry Pi service with authenticated remote access, run `sudo ./setup-pi.sh` and follow `RASPBERRY_PI_HOSTING.md`.

Build a reviewed Linux ARM64 release with:

```bash
node scripts/package-release.js --platform linux-arm64
```

This writes `dist/FantasyFootball-Assistant-<version>-linux-arm64.zip` and its SHA-256 checksum. The Linux package contains only Linux shell launchers and excludes Windows setup scripts.

No `npm install` is required. The project has no third-party runtime dependencies.

## Windows setup

From a downloadable Windows release generated with `node scripts/package-release.js --platform windows`:

1. Extract `FantasyFootball-Assistant-<version>-windows.zip`.
2. Double-click `install.cmd`. It installs to `%LOCALAPPDATA%\FantasyFootballAssistant` and creates desktop launchers.
3. Use **Fantasy Football Assistant** on the desktop to start the local server.

The installer preserves an existing `.local-data` folder during upgrades. It never downloads code or dependencies, and the release archive excludes local leagues, cookies, tokens, HAR files, browser profiles, logs, and ChatGPT/Codex credentials.

No PowerShell execution-policy change is required.

Create a cross-platform maintainer archive only when needed with:

```powershell
node scripts/package-release.js --platform portable
```

The release commands write versioned ZIPs and SHA-256 checksums under `dist/` from an explicit public-file allowlist.

## Run in VS Code

1. Open `draft-room.code-workspace` in Visual Studio Code.
2. Choose **Terminal → Run Task → Run Draft Room**.
3. Open `http://127.0.0.1:4173` in your browser.

Or run directly:

```powershell
node server.js
```

Run the maintained source tests with:

```bash
node --test "tests/*.test.js"
```

No package installation is required. The project has no third-party runtime dependencies, remote scripts, web fonts, trackers, or analytics. Optional league connectors make read-only provider requests from the self-hosted Node server after explicit authorization.

## Host on GitHub Pages

The app is static and needs no build step. In the GitHub repository, open **Settings → Pages**, choose **Deploy from a branch**, select the release branch, and use `/ (root)` as the folder.

Each browser keeps its own static league profile and draft state. For a complete self-hosted migration, use **Data & sources → Export full profile** on the old computer and **Import full profile** on the new one. The file carries league settings, keepers, historical manager brains, draft state, favorites, rosters, waivers, and matchups, but never connector or ChatGPT credentials.

GitHub Pages cannot run the connector server, OAuth callback, or private credential store. The static app continues to support manual JSON/CSV imports; run the Node server for ESPN/Yahoo sync.

## Current Scope

- 308 ranked players for configurable 4–20 team and 1–30 round leagues.
- ESPN's August 13 PPR Top 300 as the complete baseline, with FantasyPros' August 14 half-PPR top 24 layered in as the current consensus check.
- 37 identified 2026 rookies, including eight deep watch-list players beyond ESPN's Top 300.
- Top-24 scoring-format snapshots for standard, half-PPR, and PPR adjustments.
- FantasyPros ECR data as a dated cross-check where available.
- Selectable ESPN, FantasyPros, platform-composite, Yahoo, Sleeper, and Matt Harmon comparisons with explicit coverage and model value/reach labels.
- Local `rank,name` paste imports for completing app draft boards without network requests or executable downloads.
- Draft tracking, configurable roster construction, rookie/K/DST filters, search, tier-cliff logic, and live recommendations.
- Clickable draft-board headers for two-way model, selected-source rank, tier, model-edge, confidence, and return-probability sorting; selecting ESPN makes its rank column directly sortable.
- An optional local draft-history brain indexed by manager, player, round band, position, and NFL team.
- Sleeper-style configurable draft grid with automatic snake ownership and editable manager order.
- A weekly **My team** command center for synced ESPN leagues with current rosters, opponent pairings, starter-vs-starter slot comparisons, league-relative position-room grades, weekly player ranks, injury flags, and read-only start/sit alerts.
- Keeper-aware return estimates showing whether a player is likely to survive until your next selection and which opponents create the most pressure.
- Imported final-roster acquisition data can preserve keeper eligibility; trades and waiver additions remain distinguishable from drafted players.
- Evidence-led source verdicts; unavailable comparisons remain explicitly unscored.
- A frozen public-source 2025 pilot with active points-per-game evaluation and availability/performance error decomposition.
- A held-out wait-return probability lab; candidate calibration stays research-only until four test seasons pass.
- Immutable local snapshot registry for dated ranking, projection, context, and comparison inputs.
- Built-in half-PPR projections, position-specific opportunity, regular-season/playoff schedule grades, durability, offense, line, tendency, pace, and supporting-cast scores.
- Week 1–17 matchup strips with projected opponent position rank, home/away, indoor/outdoor, and travel context.
- A full 308-player rankings tab with tier maps, position/rookie filters, sortable model signals, schedule splits, and team-environment comparisons.
- CSV overrides for projections, opportunity, schedule, and durability.
- JSON export/import for draft state.
- JSON league-profile import/export with a safe blank default and a downloadable template.
- Private server-side league workspaces that separately retain settings, keepers, manager-history personalities, draft progress, favorites, custom players, rosters, waivers, matchups, and weekly team state.
- A constrained self-hosted Codex rankings-refresh job with fixed instructions, workspace-write sandboxing, one-job concurrency, local status history, and no browser-supplied shell command or prompt.

## Import Your League

Open **Data & sources → League profile** and import a JSON file based on `data/league-profile-template.json`. Profiles can include:

- League name, team count, rounds, roster size, scoring, draft slot, and quarterback format.
- Current manager IDs, display names, and historical aliases.
- Historical picks as `[round, slot, player, NFL team, position, manager alias]` rows.
- Final roster acquisition rows and projected keeper costs.
- Optional `playerMetadata` records for deeper manager archetypes: `age`, `asOfYear`, `draftYear`, `heightIn`, `weightLb`, `nflDraftRound`, and dated 0–100 `durabilityByYear` / `roleClarityByYear` maps.

The profile is parsed as inert JSON and normalized. In static mode it stays in that browser. In self-hosted mode it becomes a private workspace under `.local-data`, and a full workspace export can include both the profile and its saved app state.

The brain automatically matches historical names to the reviewed active-player catalog for age and experience tendencies. Size, draft-capital, injury-at-draft, and role-ambiguity conclusions appear only when their supporting metadata exists. Every manager card shows trait coverage, observed rate, league baseline, shrunk percentage-point difference, eligible sample, build patterns, and unavailable categories.

## Connect ESPN or Yahoo

Run the local server, open **Data & sources → League connections**, and choose a provider:

- **ESPN:** open the dedicated Firefox login, sign in, visit the league, then select **Finish connection**. A saved HAR is also supported as a fallback. Sync normalizes all league rosters, the fantasy schedule, current-week projections/actuals, available players, and your owner/team mapping. The raw HAR is discarded after parsing.
- **Yahoo:** create a Yahoo developer app, enter its client ID and secret, register the callback URL shown in the app, then authorize through Yahoo's official OAuth page.
- Select a discovered league in the header and press **Sync**. The normalized profile, roster/waiver snapshot, and independent app state are saved under that league's private workspace. The header switches between all saved workspaces.

Connector secrets are stored only under `.local-data/`, which is excluded from Git. See `SELF_HOSTING.md` and `SECURITY.md` before exposing the server beyond your own computer.

## Codex rankings refresh

The **Data & sources → Codex rankings refresh** button starts a separate `codex exec` process; it cannot post into this current desktop task. The job uses `--sandbox workspace-write`, `--ask-for-approval never`, a fixed server-owned prompt, and local log files under `.local-data/analysis-jobs`.

On Linux, run `./connect-chatgpt.sh` to check a separately installed Codex CLI and start its supported browser-based `codex login` flow. Windows releases provide the equivalent `connect-chatgpt.cmd`. Draft Room never receives or stores the ChatGPT password, browser cookies, API key, or Codex credential cache. The CLI supports ChatGPT subscription sign-in or API-key authentication; see the official [OpenAI authentication documentation](https://learn.chatgpt.com/docs/auth).

The Microsoft Store desktop app's bundled executable may block child-process launch. Install a separately runnable Codex CLI or set `CODEX_CLI_PATH` to an absolute trusted executable, then restart Draft Room. The app disables the button and shows a readiness explanation when no runnable CLI is available. See the official [Codex CLI documentation](https://learn.chatgpt.com/docs/codex/cli) for setup and command behavior.

`SESSION_HANDOFF.md` and `AGENTS.md` orient a new coding session to the architecture, privacy boundaries, commands, model governance, and current workflow without embedding any private league context.

## Important Limitation

Mike Clay projections match 257 of 308 ranked entries; most unmatched entries are kickers, defenses, or deep watch-list players. Those players retain consensus, schedule, and team-context support without fabricated point projections. This is decision support, not a guarantee or betting advice.

See `METHODOLOGY.md`, `SOURCES.md`, and `SECURITY.md` for the full workflow.
