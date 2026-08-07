# Draft Room

A dependency-free, local-first fantasy football draft decision assistant. The public app starts with generic teams and no private league history. Each user can import a local league profile to add settings, manager aliases, historical drafts, final rosters, and keepers without uploading that data.

The Accuracy Lab keeps historical outcomes outside the preseason ranking path, separates directional critics from uncertainty calibration, and blocks historical weights from the live model until strict multi-season promotion gates pass. The public release contains one privacy-safe public-source pilot and no league-specific draft prices.

## Run in VS Code

1. Open `draft-room.code-workspace` in Visual Studio Code.
2. Choose **Terminal → Run Task → Run Draft Room**.
3. Open `http://127.0.0.1:4173` in your browser.

Or run directly:

```powershell
node server.js
```

Run tests with:

```powershell
node --test
```

No package installation is required. The project has no third-party runtime dependencies, remote scripts, web fonts, trackers, analytics, API keys, or online data fetches.

## Host on GitHub Pages

The app is static and needs no build step. In the GitHub repository, open **Settings → Pages**, choose **Deploy from a branch**, select the release branch, and use `/ (root)` as the folder.

Each browser keeps its own league profile and draft state. Export both JSON files from the desktop and import them on a phone when you want the same setup there.

## Current Scope

- 308 ranked players for configurable 4–20 team and 1–30 round leagues.
- ESPN's August 2 PPR Top 300 as the complete baseline.
- 37 identified 2026 rookies, including eight deep watch-list players beyond ESPN's Top 300.
- Top-24 scoring-format snapshots for standard, half-PPR, and PPR adjustments.
- FantasyPros ECR data as a dated cross-check where available.
- Selectable ESPN, FantasyPros, platform-composite, Yahoo, Sleeper, and Matt Harmon comparisons with explicit coverage and model value/reach labels.
- Local `rank,name` paste imports for completing app draft boards without network requests or executable downloads.
- Draft tracking, configurable roster construction, rookie/K/DST filters, search, tier-cliff logic, and live recommendations.
- Clickable draft-board headers for two-way model, selected-source rank, tier, model-edge, confidence, and return-probability sorting; selecting ESPN makes its rank column directly sortable.
- An optional local draft-history brain indexed by manager, player, round band, position, and NFL team.
- Sleeper-style configurable draft grid with automatic snake ownership and editable manager order.
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

## Import Your League

Open **Data & sources → League profile** and import a JSON file based on `data/league-profile-template.json`. Profiles can include:

- League name, team count, rounds, roster size, scoring, draft slot, and quarterback format.
- Current manager IDs, display names, and historical aliases.
- Historical picks as `[round, slot, player, NFL team, position, manager alias]` rows.
- Final roster acquisition rows and projected keeper costs.

The profile is parsed as inert JSON, normalized, and stored only in that browser. Export it before switching browsers or devices.

## Important Limitation

Mike Clay projections match 257 of 308 ranked entries; most unmatched entries are kickers, defenses, or deep watch-list players. Those players retain consensus, schedule, and team-context support without fabricated point projections. This is decision support, not a guarantee or betting advice.

See `METHODOLOGY.md`, `SOURCES.md`, and `SECURITY.md` for the full workflow.
