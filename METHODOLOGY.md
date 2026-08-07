# Ranking Methodology

## 1. Evidence Layer

The complete baseline is ESPN's August 2, 2026 PPR Top 300. A dated public FantasyPros Expert Consensus Ranking snapshot supplies cross-source agreement, analyst dispersion, and ADP value where available. Players without those secondary inputs remain ranked but show lower model coverage rather than invented values.

## 2. Base Score

The editable model has six signals:

- **Expert consensus (35%)**: format-adjusted ECR curve, analyst dispersion, and cross-source positional agreement.
- **Projection / VOR (25%)**: Mike Clay 2026 half-PPR points minus a league-specific, flex-optimized positional replacement baseline.
- **Opportunity (15%)**: position-specific projected volume from pass attempts, rush attempts, carries, targets, and team shares.
- **Schedule (8%)**: DraftCall position SoS blended with ESPN projected defensive units and modest home/travel adjustments; Weeks 15–17 are scored separately.
- **Durability (10%)**: five-year/recent availability, age-position curve, projected games, and workload stress. Young samples regress toward a neutral prior and rookies receive low confidence.
- **Market value (7%)**: ECR versus ADP, capped to prevent market price from dominating player quality.

Missing signals are excluded and the remaining weights renormalize. Coverage reports the share of configured weight supported by local data.

External comparison boards do not change the model score. ESPN, FantasyPros ECR, platform ADP, and Matt Harmon are shown beside the model so disagreement remains visible. A player is labeled **Value** when the model is at least four picks earlier than the selected board, **Reach** when it is at least four picks later, and **Aligned** inside that band. Matt Harmon's public PPR ranks are a WR/process dissent lens; they are not given a hidden accuracy multiplier.

Pasted comparison boards use inert `rank,name` lines. They are stored only in local browser state, override built-in rows for that selected source, and are included in JSON export/import. Unknown names are rejected rather than fuzzy-matched.

## 3. Live Draft Adjustment

The base score is adjusted for:

- Unfilled starting positions.
- Early duplicate QB/TE penalties in one-QB leagues.
- RB/WR depth and FLEX eligibility.
- A tier-cliff bonus when the next available player at the position falls into a lower tier.

Future work should calibrate the wait-cost estimate against more seasons and frozen historical ADP snapshots.

## 4. Historical Draft Brain

The public app contains no league history. Users may import local draft seasons, manager IDs and aliases, final rosters, and projected keepers through a JSON league profile. Imported picks build manager profiles from position rates in early, middle, and late round bands; typical quarterback and tight-end timing; repeated-player selections; and NFL-team frequency. With no imported history, every manager regresses to the league and market baseline.

The “Returns” estimate begins with the player's current baseline rank and uncertainty around that expected selection point. It then conditions on every open opponent pick before the user's next snake selection. Each intervening pick is adjusted for that manager's historical position rate, current roster construction, prior selection of the same player, and whether a projected keeper occupies the pick. These percentages are directional decision support, not statistically calibrated guarantees.

## 5. Replacement Value

Replacement depends on league size and lineup:

- QB: teams × starting QBs.
- RB: two starters per team plus any flex spots won by the best projected remaining RBs.
- WR: two starters per team plus any flex spots won by the best projected remaining WRs.
- TE: one starter per team plus any flex spots won by the best projected remaining TEs.

The model fills 12 FLEX spots with the highest projected RB/WR/TE players after required starters, then uses the next player at each position as replacement. The app does not pretend rank-derived points are projections.

## 6. Team and Matchup Context

- **Offense quality** weights ESPN/Mike Clay 2026 unit grade, projected points, and projected wins most heavily, with 2025 Sharp EPA as a smaller historical baseline.
- **Offensive line** weights ESPN's projected 2026 line grade above Sharp's 2025 pressure baseline.
- **Run/pass tendency** blends projected team pass rate with 2025 neutral dropback tendency.
- **Pace** is a percentile of 2025 plays per game and is labeled historical until current-season evidence exists.
- **Supporting cast** changes by position: quarterbacks emphasize receivers/line, backs emphasize line/offense, and receivers/tight ends emphasize quarterback/line.
- **Weekly matchup rank** is position-specific. Rank 1 is easiest; Great is 1–5, Good 6–12, Neutral 13–20, Difficult 21–27, and Avoid 28–32.

## 7. Historical Backtest Standard

A valid analyst comparison needs a frozen preseason rank, matching scoring format, defined player universe, and final fantasy production. Use rolling season origins and freeze all inputs at the draft date. Never use final ADP, later injury news, end-of-season rosters, or same-season accuracy weights to evaluate an earlier prediction.

Recommended evaluation outputs: point MAE/RMSE, positional rank correlation, VOR error, interval calibration, and simulated roster utility. Cross-year leaderboard positions are not standardized accuracy scores.

## Historical black-box roundtable

The public Accuracy Lab includes one privacy-safe 2025 pilot built from public preseason rankings, projections, and final outcomes. It contains no private league draft prices. `historical-public-data.js` stores preseason records and outcomes separately. `generateRanking()` receives only a whitelist-sanitized preseason record; `evaluateRanking()` refuses to run until the generated order is marked locked. Automated tests prove that changing outcomes cannot alter the ranking.

Consensus is the baseline rather than a voting critic. Four specialists review the order twice: the Projection/VOR Modeler, Player Signal Scout, Team Ecosystem Analyst, and Uncertainty Calibration Specialist. The pilot is descriptive, not sufficient evidence for live historical weighting.

Mike Clay's PPR projections are converted to half PPR by subtracting half of projected receptions. Frozen replacement baselines use QB12, RB30, WR36 and TE12 from the same projection guide. The projection/VOR critic ranks the cohort by points over those position-specific baselines before applying capped adjustments.

The 2025 cohort remains deliberately labeled a first-two-round pilot rather than a full accuracy claim. Its feature grades are frozen preseason encodings with visible evidence notes. Expansion requires another dated preseason snapshot and a verified half-PPR outcome row; no player may be added because their result was interesting.

The Accuracy Lab reports rank MAE/correlation, projection point error, active points-per-game order, and interval coverage for that fixed cohort. Hindsight refits are labeled diagnostic and never influence the live model.

`historical-backtest.js` rejects incomplete or duplicate-season inputs and retains strict promotion gates for future multi-season public cohorts. Season-forward and wait-return calibration cards remain unavailable until enough privacy-safe dated seasons exist.

`snapshot-registry.js` identifies immutable, dated local input snapshots. It records provenance only; snapshots never fetch, execute, or update remote content.

## CSV Import

Use the exact headers in `data/metric-import-template.csv`:

```text
name,projection,opportunity,schedule,durability
```

`name` must exactly match a player in the app. `projection` is a numeric season-point forecast. Other signals are numeric 0–100 values. Keep a separate note outside the app with source, scoring format, retrieval timestamp, and assumptions for every imported field.
