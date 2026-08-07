(function () {
  "use strict";

  const data = window.DRAFT_DATA;
  const model = window.DraftModel;
  const comparisonEngine = window.RankingComparison;
  const comparisonData = window.RANKING_COMPARISON_DATA;
  const brain = window.DraftBrain;
  const strategyEngine = window.DraftStrategy;
  const historicalData = window.HISTORICAL_2025_DATA;
  const historicalMultiSeasonData = [];
  const historicalRoundtable = window.HistoricalRoundtable;
  const historicalBacktest = window.HistoricalBacktest;
  const waitCalibration = window.WaitCalibration;
  const snapshotRegistry = window.SNAPSHOT_REGISTRY;
  const leagueProfiles = window.LeagueProfiles;
  const leagueProfile = window.LEAGUE_PROFILE;
  const identities = window.MANAGER_IDENTITIES || { currentOwners: {} };
  const context = window.DraftContextEngine.createContext(window.DRAFT_CONTEXT_DATA, data.players);
  window.DraftContext = context;
  const STORAGE_KEY = `draft-room-state-v3:${leagueProfile.id}`;
  const PRIOR_STORAGE_KEY = "draft-room-state-v2";
  const LEGACY_STORAGE_KEY = "draft-room-state-v1";
  const USER_MANAGER_ID = leagueProfile.league.userManagerId;
  const DRAFT_ROUNDS = leagueProfile.league.rounds;
  const ROSTER_SIZE = leagueProfile.league.rosterSize;
  const LATEST_HISTORY_YEAR = Math.max(...leagueProfile.seasons.map((season) => Number(season.year) || 0), 0);
  const PLAYER_PAGE_SIZE = 72;
  const defaultDraftOrder = brain.managerProfiles.map((profile) => profile.id);
  const initialUserIndex = defaultDraftOrder.indexOf(USER_MANAGER_ID);
  if (initialUserIndex >= 0) defaultDraftOrder.splice(initialUserIndex, 1);
  defaultDraftOrder.splice(Math.min(leagueProfile.league.draftSlot - 1, defaultDraftOrder.length), 0, USER_MANAGER_ID);
  const state = {
    settings: { scoring: leagueProfile.league.scoring, teams: leagueProfile.league.teams, draftSlot: leagueProfile.league.draftSlot, startingQbs: leagueProfile.league.startingQbs, useProjectedKeepers: leagueProfile.league.useProjectedKeepers, userKeeperId: "", userKeeperRound: 1 },
    weights: { ...data.defaultWeights },
    metricsById: { ...context.metricsById },
    draftLog: [],
    draftOrder: defaultDraftOrder,
    filterPosition: "ALL",
    search: "",
    sort: "recommendation",
    sortDirection: "asc",
    rankingPosition: "ALL",
    rankingSearch: "",
    rankingSort: "model",
    comparisonSource: "market",
    rankingOverrides: {},
    playerLimit: PLAYER_PAGE_SIZE,
    favoritePlayerIds: [],
    customPlayers: [],
    selectedPlayerId: data.players[0].id
  };

  const byId = (id) => document.getElementById(id);
  const playerById = new Map(data.players.map((player) => [player.id, player]));
  let latestBoardResults = [];
  let latestMacroResults = [];
  let forecastContext = null;
  let forecastCache = new Map();
  const playerScopeEntries = new Map();
  const teamScopeEntries = new Map();
  let playerSearchTimer = null;
  let accuracyRendered = false;

  const METRIC_HELP = Object.freeze({
    model: "A 0–100 draft grade combining consensus, projection value over replacement, opportunity, schedule, durability, market value, roster need, and tier urgency. Higher is better.",
    modelRank: "Overall ordering produced by the current model settings. Rank #1 is the strongest draft value.",
    tier: "Players in the same tier have similar draft value. A tier break is usually more meaningful than a one-place ranking difference.",
    baseline: "The dated baseline overall rank from ESPN and FantasyPros before this league-specific model is applied. Lower is better.",
    projection: "Projected 2026 half-PPR fantasy points from the local Mike Clay projection snapshot. This is a raw point total, not a grade.",
    vor: "A 0–100 percentile grade for projected value above this league's optimized replacement player. Higher means a larger positional advantage.",
    opportunity: "A 0–100 within-position workload percentile derived from projected attempts, carries, targets, and team shares. It is a volume grade, not a probability.",
    schedule: "A 0–100 schedule-ease grade blending projected 2026 opponent strength with prior efficiency context. Higher means easier.",
    durability: "A 0–100 availability grade blending age curve, recent and five-year availability, projected games, and workload. Higher is safer.",
    offense: "A 0–100 team offense grade blending ESPN/Mike Clay unit projections, projected points and wins, and a smaller prior-year efficiency component. Higher is better.",
    offensiveLine: "A 0–100 offensive-line grade led by ESPN/Mike Clay's projected line unit with a smaller prior-year line component. Higher is better.",
    passTendency: "Projected percentage of offensive plays that are passes, blending the current projection with the prior offense's dropback tendency. This is a percentage, not a grade.",
    paceGrade: "A 0–100 percentile grade for 2025 offensive pace. Higher means the team played faster relative to other NFL teams.",
    supportingCast: "A 0–100 position-specific supporting-cast grade built from quarterback, skill-position, offensive-line, and team-offense inputs. Higher is better.",
    market: "FantasyPros ECR compared with ADP. Positive means experts rank the player earlier than the drafting market; negative means the market drafts him earlier.",
    externalRank: "The selected app, market, or analyst rank from a dated local snapshot. Lower is earlier. N/A means the source was not publicly verified or imported for this player.",
    modelEdge: "Selected comparison rank minus model rank. Value means this model ranks the player earlier than the external board; reach means the model ranks him later. Within three picks is aligned.",
    coverage: "The percentage of configured model weight backed by an available local data signal. Coverage measures data completeness, not confidence or player quality.",
    source: "The local ranking sources contributing to this player's baseline. It is provenance, not a grade.",
    positionRank: "Projected finish within the player's fantasy position. Lower is better.",
    projectedRole: "Raw projected season volume. Carries, targets, rushes, and attempts are not normalized grades.",
    age: "Player age for the 2026 season. Age is context for durability and role, not a quality grade by itself.",
    projectedTeamPoints: "Projected NFL team points scored in 2026. This is a raw scoring projection, not a 0–100 grade.",
    epa: "The offense's 2025 expected points added per play. Positive is above zero; higher is more efficient. This is a historical raw rate.",
    paceRaw: "The offense's actual 2025 plays per game, with seconds per play shown as supporting context. Higher plays per game means faster volume.",
    matchup: "Opponent rank against this player's fantasy position after projected unit strength and small home/travel adjustments. Rank #1 is easiest.",
    accuracyScorecard: "A compact backtest scorecard. MAE is mean absolute rank error, where lower is better. Spearman rho measures ordering agreement from -1 to +1, where higher is better.",
    pointBacktest: "Projection error compares Mike Clay's preseason point projection, converted from PPR to half PPR, with the player's final half-PPR points. MAE is average absolute error; RMSE penalizes larger misses more heavily; bias above zero means the projections ran high.",
    positionalBacktest: "Position MAE compares predicted and final rank within RB and WR in this pilot. QB and TE are excluded because the cohort contains only one of each. Lower MAE is better; higher rho is better.",
    topKBacktest: "The share of the six highest-scoring players in this cohort that also appeared in the model's preseason top six. This measures early-round hit rate, not full-list ordering.",
    intervalCalibration: "The share of actual cohort finishes captured by each player's preseason rank range. The current result is descriptive only; a useful interval needs an explicit target level and many more seasons.",
    ppgBacktest: "Points-per-game rank separates weekly production quality from missed games. Lower MAE and higher Spearman rho mean the preseason order better matched each player's scoring rate while active.",
    errorDecomposition: "Total point error is split into availability error from projected games minus actual games and performance error from projected versus actual points per game. MAE uses absolute misses; positive bias means the projection ran high.",
    waitCalibration: "Brier score measures probability accuracy from 0 to 1; lower is better. Calibration error compares predicted wait-return percentages with observed return rates; lower is better. Each test year is excluded from training.",
    rosterUtility: "A four-round, 12-slot cohort simulation. The model and baseline face the same league market order and roster constraints. Positive points are better, but this is a partial early-round utility test rather than a full-season lineup simulation.",
    promotionGate: "A rule that must pass before historical critic weights can influence the live model. Every gate must pass; one small-season improvement is not enough.",
    projectedHistoricalPoints: "Mike Clay's September 4 preseason PPR projection converted to half PPR by subtracting half of projected receptions. It is a frozen input, not a hindsight estimate.",
    projectedHistoricalVor: "Projected half-PPR points above a 12-team replacement baseline from the same projection guide: QB12, RB30, WR36, or TE12. Higher is more valuable.",
    uncertaintyRange: "A symmetric cohort-rank interval based on preseason uncertainty and durability. The uncertainty critic can widen this range but cannot lower or raise the player's mean rank.",
    criticConfidence: "The critic's average confidence in the completeness and strength of its preseason evidence. This is not the probability that its recommendation is correct.",
    criticDiagnostic: "Directional hit rate is how often a mean-rank critic's suggested move pointed toward the eventual result. The uncertainty specialist is judged by interval coverage instead. Hindsight weights are diagnostic coefficients learned after all outcomes were visible.",
    originalHistoricalRank: "The preseason baseline within this 18-player pilot, blending the local draft market and an independent ESPN expert rank equally. Consensus sets the starting price but does not receive a second vote.",
    firstLoopRank: "Rank after the projection/VOR, player-signal, and team-ecosystem critics reviewed the frozen record twice. The uncertainty specialist sets a range without moving the mean.",
    crossValidatedRank: "The remade rank from three-fold holdout testing. This player's outcome was excluded when its critic weights were trained. Fold ranks were percentile-normalized before combining.",
    hindsightRank: "An outcome-aware refit trained on all 18 final results. It shows how well the critic signals can be fitted after the fact, not how they would predict a new season.",
    historicalOutcome: "The player's actual 2025 finish within this 18-player cohort, ordered by total half-PPR fantasy points. Lower is better; the point total is shown beside the rank.",
    accuracyEvidence: "The dated evidence used to classify or evaluate this source. Source placements and sample sizes are context, not a universal 0–100 accuracy grade.",
    historicalLock: "The date on which the historical preseason inputs are treated as frozen. Final results are stored separately and joined only during evaluation."
  });

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function append(parent, ...children) {
    children.filter(Boolean).forEach((child) => parent.appendChild(child));
    return parent;
  }

  function metricRank(value, entries, higherIsBetter = true) {
    const valid = entries.filter((entry) => Number.isFinite(entry.value));
    if (!Number.isFinite(Number(value)) || !valid.length) return null;
    const better = valid.filter((entry) => higherIsBetter ? entry.value > Number(value) : entry.value < Number(value)).length;
    return { rank: better + 1, total: valid.length };
  }

  function playerMetricScope(player, value, accessor, higherIsBetter = true, cacheKey = "") {
    let entries = cacheKey ? playerScopeEntries.get(cacheKey) : null;
    if (!entries) {
      entries = data.players.map((candidate) => ({ player: candidate, value: accessor(candidate) })).filter((entry) => Number.isFinite(entry.value));
      if (cacheKey) playerScopeEntries.set(cacheKey, entries);
    }
    const positionEntries = entries.filter((entry) => entry.player.position === player.position);
    const position = metricRank(value, positionEntries, higherIsBetter);
    const overall = metricRank(value, entries, higherIsBetter);
    if (!position || !overall) return "";
    return `#${position.rank}/${position.total} ${player.position} · #${overall.rank}/${overall.total} overall`;
  }

  function resultMetricScope(player, value, results, accessor, higherIsBetter = true) {
    const entries = (results || []).map((result) => ({ player: result.player, value: accessor(result) })).filter((entry) => Number.isFinite(entry.value));
    const positionEntries = entries.filter((entry) => entry.player.position === player.position);
    const position = metricRank(value, positionEntries, higherIsBetter);
    const overall = metricRank(value, entries, higherIsBetter);
    if (!position || !overall) return "";
    return `#${position.rank}/${position.total} ${player.position} · #${overall.rank}/${overall.total} overall`;
  }

  function teamMetricScope(player, value, accessor, label, positionSpecific = false, higherIsBetter = true, cacheKey = "") {
    const scopedKey = cacheKey ? `${cacheKey}:${positionSpecific ? player.position : "ALL"}` : "";
    let entries = scopedKey ? teamScopeEntries.get(scopedKey) : null;
    if (!entries) {
      const entriesByKey = new Map();
      data.players.forEach((candidate) => {
        if (positionSpecific && candidate.position !== player.position) return;
        const details = context.playerContext(candidate);
        const entryValue = accessor(details, candidate);
        const entryKey = positionSpecific ? `${candidate.team}:${candidate.position}` : candidate.team;
        if (!entriesByKey.has(entryKey) && Number.isFinite(entryValue)) entriesByKey.set(entryKey, { value: entryValue });
      });
      entries = Array.from(entriesByKey.values());
      if (scopedKey) teamScopeEntries.set(scopedKey, entries);
    }
    const rank = metricRank(value, entries, higherIsBetter);
    return rank ? `#${rank.rank}/${rank.total} ${label}` : "";
  }

  function metricTooltipText(metricKey, scope, extra) {
    return [METRIC_HELP[metricKey], scope, extra].filter(Boolean).join(" ");
  }

  function decorateMetric(node, metricKey, scope, extra, focusable = false) {
    node.classList.add("has-metric-tooltip");
    node.dataset.metricTooltip = metricTooltipText(metricKey, scope, extra);
    if (focusable) node.tabIndex = 0;
    return node;
  }

  function appendMetricScope(container, scope) {
    if (scope) container.appendChild(element("small", "metric-scope", scope));
  }

  function compactMetricRank(scope) {
    return String(scope || "").match(/^#\d+\/\d+/)?.[0] || "—";
  }

  function rankingGradeCell(value, metricKey, scope, detail) {
    const cell = element("td", "split-signal metric-value-cell");
    append(cell, element("strong", "", rankingSignal(value)));
    appendMetricScope(cell, scope);
    const gradeDetail = Number.isFinite(value) ? `${scoreLabel(value)}${detail ? ` · ${detail}` : ""}` : detail;
    if (gradeDetail) cell.appendChild(element("small", "metric-detail", gradeDetail));
    return decorateMetric(cell, metricKey, scope, gradeDetail);
  }

  function activeComparisonSource() {
    return comparisonData.sources[state.comparisonSource] || comparisonData.sources.market;
  }

  function comparisonRankFor(player) {
    return comparisonEngine.rankFor(state.comparisonSource, player, comparisonData.sources, state.rankingOverrides[state.comparisonSource] || {});
  }

  function comparisonFor(result) {
    const rank = comparisonRankFor(result.player);
    return { rank, ...comparisonEngine.evaluate(result.modelRank, rank) };
  }

  function formatExternalRank(rank) {
    if (!Number.isFinite(rank)) return "N/A";
    return Number.isInteger(rank) ? String(rank) : rank.toFixed(1);
  }

  function comparisonRankCell(result, compact = false) {
    const source = activeComparisonSource();
    const comparison = comparisonFor(result);
    const cell = element("td", compact ? "comparison-rank-cell" : "split-signal comparison-rank-cell");
    append(cell, element("strong", "", formatExternalRank(comparison.rank)));
    if (!compact) cell.appendChild(element("small", "metric-detail", Number.isFinite(comparison.rank) ? source.format : "No verified rank"));
    return decorateMetric(cell, "externalRank", Number.isFinite(comparison.rank) ? `${source.name} #${formatExternalRank(comparison.rank)} / ${source.format}` : `${source.name}: no local rank`, source.note);
  }

  function comparisonEdgeCell(result, compact = false) {
    const source = activeComparisonSource();
    const comparison = comparisonFor(result);
    const toneClass = comparison.tone === "value" ? "value-positive" : comparison.tone === "reach" ? "value-negative" : comparison.tone === "missing" ? "comparison-missing" : "comparison-aligned";
    const cell = element("td", `${toneClass}${compact ? " comparison-edge-compact" : " split-signal"}`, comparison.label);
    if (!compact && Number.isFinite(comparison.gap)) cell.appendChild(element("small", "metric-detail", `${comparison.gap > 0 ? "+" : ""}${comparison.gap} picks`));
    return decorateMetric(cell, "modelEdge", `Model #${result.modelRank} vs ${source.shortName} ${Number.isFinite(comparison.rank) ? `#${formatExternalRank(comparison.rank)}` : "N/A"}`, source.note);
  }

  function syncComparisonControls() {
    const sources = Object.values(comparisonData.sources);
    [byId("comparison-source"), byId("ranking-comparison-source"), byId("ranking-import-source")].forEach((select) => {
      if (!select) return;
      const selected = select.id === "ranking-import-source" ? select.value || state.comparisonSource : state.comparisonSource;
      select.replaceChildren(...sources.map((source) => {
        const option = element("option", "", `${source.name} / ${source.format}`);
        option.value = source.id;
        return option;
      }));
      select.value = comparisonData.sources[selected] ? selected : state.comparisonSource;
    });
  }

  function syncComparisonHeadings() {
    const source = activeComparisonSource();
    const imported = Object.keys(state.rankingOverrides[state.comparisonSource] || {}).length;
    const suffix = imported ? ` + ${imported} pasted` : "";
    byId("comparison-rank-label").textContent = `${source.shortName} rank`;
    byId("comparison-rank-heading").title = `${source.name} rank / ${source.coverage}${suffix}`;
    byId("comparison-edge-label").textContent = "Model edge";
    byId("comparison-edge-heading").title = `Model rank versus ${source.name}`;
    byId("ranking-comparison-rank-heading").textContent = source.shortName;
    byId("ranking-comparison-rank-heading").title = `${source.name} rank / ${source.coverage}${suffix}`;
    byId("ranking-comparison-edge-heading").textContent = "Model edge";
    byId("ranking-comparison-edge-heading").title = `Model rank versus ${source.name}`;
    byId("sort-comparison-option").textContent = `${source.shortName} rank`;
    syncBoardSortControls();
  }

  const boardSortDefaults = Object.freeze({ recommendation: "asc", ecr: "asc", tier: "asc", value: "desc", certainty: "desc", return: "asc", comparison: "asc", edge: "desc" });

  function syncBoardSortControls() {
    const select = byId("sort-players");
    if (select) select.value = state.sort;
    document.querySelectorAll("button[data-board-sort]").forEach((button) => {
      const heading = button.closest("th");
      const active = button.dataset.boardSort === state.sort;
      button.classList.toggle("active", active);
      button.dataset.direction = active ? state.sortDirection : "";
      heading.setAttribute("aria-sort", active ? (state.sortDirection === "desc" ? "descending" : "ascending") : "none");
      button.title = active ? `Sorted ${state.sortDirection === "desc" ? "highest to lowest" : "lowest to highest"}; click to reverse` : "Click to sort this column";
    });
  }

  function setBoardSort(sortKey, toggle = false) {
    if (!boardSortDefaults[sortKey]) return;
    state.sortDirection = toggle && state.sort === sortKey ? (state.sortDirection === "asc" ? "desc" : "asc") : boardSortDefaults[sortKey];
    state.sort = sortKey;
    state.playerLimit = PLAYER_PAGE_SIZE;
    saveState();
    renderPlayerRows(latestBoardResults);
  }

  function setComparisonSource(sourceId) {
    if (!comparisonData.sources[sourceId]) return;
    state.comparisonSource = sourceId;
    syncComparisonControls();
    syncComparisonHeadings();
    state.playerLimit = PLAYER_PAGE_SIZE;
    saveState();
    renderPlayerRows(latestBoardResults);
    if (!byId("view-rankings").hidden) renderRankings();
  }

  function openRankingImportDialog() {
    syncComparisonControls();
    byId("ranking-import-source").value = state.comparisonSource;
    byId("ranking-import-text").value = "";
    byId("ranking-import-status").textContent = "Paste rank,name lines. Unknown players are rejected rather than guessed.";
    byId("ranking-import-dialog").showModal();
  }

  function applyRankingImport() {
    const sourceId = byId("ranking-import-source").value;
    const parsed = comparisonEngine.parseRankingText(byId("ranking-import-text").value, data.players);
    if (!parsed.imported) {
      byId("ranking-import-status").textContent = parsed.errors[0] || "No valid ranking rows found.";
      return;
    }
    state.rankingOverrides[sourceId] = { ...(state.rankingOverrides[sourceId] || {}), ...parsed.ranks };
    state.comparisonSource = sourceId;
    const warning = parsed.errors.length ? ` ${parsed.errors.length} line${parsed.errors.length === 1 ? "" : "s"} skipped.` : "";
    byId("ranking-import-status").textContent = `${parsed.imported} rankings saved.${warning}`;
    saveState();
    byId("ranking-import-dialog").close();
    syncComparisonControls();
    renderPlayerRows(latestBoardResults);
    if (!byId("view-rankings").hidden) renderRankings();
  }

  function clearRankingImport() {
    const sourceId = byId("ranking-import-source").value;
    delete state.rankingOverrides[sourceId];
    saveState();
    byId("ranking-import-status").textContent = `Cleared pasted ${comparisonData.sources[sourceId].name} ranks.`;
    renderPlayerRows(latestBoardResults);
    if (!byId("view-rankings").hidden) renderRankings();
  }

  function showMetricTooltip(target) {
    const tooltip = byId("metric-tooltip");
    if (!tooltip || !target?.dataset.metricTooltip) return;
    tooltip.textContent = target.dataset.metricTooltip;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const width = Math.min(300, window.innerWidth - 24);
    const left = Math.min(window.innerWidth - width / 2 - 12, Math.max(width / 2 + 12, rect.left + rect.width / 2));
    tooltip.style.width = `${width}px`;
    tooltip.style.left = `${left}px`;
    if (rect.top > 150) {
      tooltip.style.top = `${rect.top - 8}px`;
      tooltip.dataset.placement = "above";
    } else {
      tooltip.style.top = `${rect.bottom + 8}px`;
      tooltip.dataset.placement = "below";
    }
  }

  function hideMetricTooltip() {
    const tooltip = byId("metric-tooltip");
    if (tooltip) tooltip.hidden = true;
  }

  function saveState() {
    const persisted = {
      settings: state.settings,
      weights: state.weights,
      metricsById: state.metricsById,
      draftLog: state.draftLog,
      draftOrder: state.draftOrder,
      favoritePlayerIds: state.favoritePlayerIds,
      customPlayers: state.customPlayers,
      comparisonSource: state.comparisonSource,
      rankingOverrides: state.rankingOverrides,
      sort: state.sort,
      sortDirection: state.sortDirection,
      selectedPlayerId: state.selectedPlayerId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }

  function loadState() {
    try {
      const legacyState = leagueProfile.imported ? localStorage.getItem(PRIOR_STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) : null;
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || legacyState || "null");
      if (!parsed || typeof parsed !== "object") return;
      if (parsed.settings) Object.assign(state.settings, parsed.settings);
      if (parsed.weights) Object.assign(state.weights, parsed.weights);
      if (parsed.metricsById && typeof parsed.metricsById === "object") state.metricsById = { ...context.metricsById, ...parsed.metricsById };
      if (Array.isArray(parsed.draftOrder) && parsed.draftOrder.length === Number(state.settings.teams)) state.draftOrder = parsed.draftOrder.slice();
      replaceCustomPlayers(Array.isArray(parsed.customPlayers) ? parsed.customPlayers : []);
      if (Array.isArray(parsed.draftLog)) {
        state.draftLog = normalizeDraftLog(parsed.draftLog.filter((pick) => playerById.has(pick.playerId)));
      }
      if (Array.isArray(parsed.favoritePlayerIds)) state.favoritePlayerIds = parsed.favoritePlayerIds.filter((playerId) => playerById.has(playerId));
      if (comparisonData.sources[parsed.comparisonSource]) state.comparisonSource = parsed.comparisonSource;
      if (parsed.rankingOverrides && typeof parsed.rankingOverrides === "object") state.rankingOverrides = parsed.rankingOverrides;
      if (boardSortDefaults[parsed.sort]) state.sort = parsed.sort;
      if (parsed.sortDirection === "asc" || parsed.sortDirection === "desc") state.sortDirection = parsed.sortDirection;
      if (playerById.has(parsed.selectedPlayerId)) state.selectedPlayerId = parsed.selectedPlayerId;
    } catch (error) {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  function managerName(managerId) {
    return brain.profileFor(managerId)?.name || String(managerId || "Unknown").replace(/^guest-/, "Guest ");
  }

  function normalizeCustomPlayer(player) {
    const id = String(player?.id || "");
    const position = String(player?.position || "").toUpperCase();
    const name = String(player?.name || "").trim().slice(0, 60);
    if (!/^custom-[a-z0-9-]+$/i.test(id) || !name || !["QB", "RB", "WR", "TE", "K", "DST"].includes(position)) return null;
    return Object.freeze({
      id,
      name,
      team: String(player.team || "FA").trim().toUpperCase().slice(0, 4) || "FA",
      position,
      positionRank: "—",
      rank: 999,
      tier: "Custom",
      ecrVsAdp: 0,
      rankingSource: "Manual draft entry",
      isRookie: false,
      isCustom: true
    });
  }

  function replaceCustomPlayers(players) {
    state.customPlayers.forEach((player) => { if (String(player.id).startsWith("custom-")) playerById.delete(player.id); });
    state.customPlayers = (players || []).map(normalizeCustomPlayer).filter(Boolean);
    state.customPlayers.forEach((player) => playerById.set(player.id, player));
  }

  function removeUnusedCustomPlayer(playerId) {
    if (!String(playerId || "").startsWith("custom-") || state.draftLog.some((pick) => pick.playerId === playerId)) return;
    state.customPlayers = state.customPlayers.filter((player) => player.id !== playerId);
    playerById.delete(playerId);
  }

  function isWatchlisted(playerId) {
    return state.favoritePlayerIds.includes(playerId);
  }

  function syncWatchlistCount() {
    const count = byId("watchlist-count");
    if (count) count.textContent = String(state.favoritePlayerIds.length);
  }

  function toggleWatchlist(playerId) {
    if (!playerById.has(playerId)) return false;
    if (isWatchlisted(playerId)) state.favoritePlayerIds = state.favoritePlayerIds.filter((id) => id !== playerId);
    else state.favoritePlayerIds = [...state.favoritePlayerIds, playerId];
    saveState();
    syncWatchlistCount();
    renderPlayerRows(latestBoardResults);
    renderRecommendations(latestBoardResults);
    if (!byId("view-rankings").hidden) renderRankings();
    return isWatchlisted(playerId);
  }

  function syncUserDraftSlot() {
    const teams = Number(state.settings.teams);
    const slot = Math.min(Number(state.settings.draftSlot), teams);
    const available = brain.managerProfiles.map((profile) => profile.id).filter((id) => id !== USER_MANAGER_ID);
    const existing = state.draftOrder.filter((id) => id !== USER_MANAGER_ID && available.includes(id));
    available.forEach((id) => { if (!existing.includes(id)) existing.push(id); });
    while (existing.length < teams - 1) existing.push(`guest-${existing.length + 1}`);
    state.draftOrder = existing.slice(0, teams - 1);
    state.draftOrder.splice(slot - 1, 0, USER_MANAGER_ID);
  }

  function activeKeepers() {
    const opponentKeepers = state.settings.useProjectedKeepers ? brain.projectedKeepers.map((keeper) => {
      const player = data.players.find((candidate) => candidate.name === keeper.player);
      return player ? { ...keeper, playerId: player.id } : null;
    }).filter(Boolean) : [];
    const userPlayer = playerById.get(state.settings.userKeeperId);
    if (userPlayer && brain.keeperEligible(USER_MANAGER_ID, userPlayer.name)) {
      opponentKeepers.push({ managerId: USER_MANAGER_ID, player: userPlayer.name, playerId: userPlayer.id, round: Number(state.settings.userKeeperRound) || 1 });
    }
    return opponentKeepers;
  }

  function keeperOverallSet() {
    const teams = Number(state.settings.teams);
    return new Set(activeKeepers().map((keeper) => brain.overallForManagerRound(keeper.managerId, keeper.round, teams, state.draftOrder)).filter(Boolean));
  }

  function normalizeDraftLog(entries) {
    const occupied = keeperOverallSet();
    let nextOverall = 1;
    return entries.map((pick) => {
      while (occupied.has(nextOverall)) nextOverall += 1;
      const overall = nextOverall;
      const automatic = brain.managerAtPick(overall, Number(state.settings.teams), state.draftOrder).managerId;
      const managerId = pick.managerId || automatic;
      occupied.add(overall);
      nextOverall += 1;
      return { ...pick, overall, managerId, mine: managerId === USER_MANAGER_ID };
    });
  }

  function nextOpenOverall() {
    const occupied = keeperOverallSet();
    state.draftLog.forEach((pick) => occupied.add(pick.overall));
    let overall = 1;
    while (occupied.has(overall)) overall += 1;
    return overall;
  }

  function draftedPicksForBrain() {
    return state.draftLog.map((pick) => {
      const player = playerById.get(pick.playerId);
      return { ...pick, position: player.position, name: player.name };
    });
  }

  function forecastFor(player) {
    if (forecastCache.has(player.id)) return forecastCache.get(player.id);
    if (!forecastContext) resetForecastSnapshot();
    const forecast = brain.forecastReturn(player, forecastContext);
    forecastCache.set(player.id, forecast);
    return forecast;
  }

  function resetForecastSnapshot() {
    const draftedIds = new Set([...state.draftLog.map((pick) => pick.playerId), ...activeKeepers().map((keeper) => keeper.playerId)]);
    forecastContext = {
      teams: Number(state.settings.teams),
      draftOrder: state.draftOrder,
      userManagerId: USER_MANAGER_ID,
      currentOverall: nextOpenOverall() - 1,
      draftedPicks: draftedPicksForBrain(),
      availablePlayers: data.players.filter((player) => !draftedIds.has(player.id)),
      keepers: activeKeepers(),
      maxRounds: DRAFT_ROUNDS
    };
    forecastCache = new Map();
  }

  function currentResults() {
    const draftedIds = [...state.draftLog.map((pick) => pick.playerId), ...activeKeepers().map((keeper) => keeper.playerId)];
    const roster = [...activeKeepers().filter((keeper) => keeper.managerId === USER_MANAGER_ID).map((keeper) => playerById.get(keeper.playerId)), ...state.draftLog.filter((pick) => pick.mine).map((pick) => playerById.get(pick.playerId))];
    return model.scorePlayers(data.players, {
      settings: state.settings,
      weights: state.weights,
      metricsById: state.metricsById,
      draftedIds,
      roster
    });
  }

  function macroResults() {
    return model.scorePlayers(data.players, {
      settings: state.settings,
      weights: state.weights,
      metricsById: state.metricsById,
      draftedIds: [],
      roster: []
    });
  }

  function currentRoster() {
    return [...activeKeepers().filter((keeper) => keeper.managerId === USER_MANAGER_ID).map((keeper) => playerById.get(keeper.playerId)), ...state.draftLog.filter((pick) => pick.mine).map((pick) => playerById.get(pick.playerId))];
  }

  function populateKeeperControls() {
    const playerSelect = byId("user-keeper");
    const roundSelect = byId("user-keeper-round");
    const eligible = brain.finalRosters.filter((record) => record.managerId === USER_MANAGER_ID && record.acquisition === "Draft").map((record) => data.players.find((player) => player.name === record.player)).filter(Boolean).sort((a, b) => a.rank - b.rank);
    playerSelect.replaceChildren(element("option", "", "None"));
    playerSelect.firstChild.value = "";
    eligible.forEach((player) => {
      const option = element("option", "", `${player.name} (${player.position})`);
      option.value = player.id;
      playerSelect.appendChild(option);
    });
    roundSelect.replaceChildren();
    for (let draftRound = 1; draftRound <= DRAFT_ROUNDS; draftRound += 1) {
      const option = element("option", "", `Round ${draftRound}`);
      option.value = String(draftRound);
      roundSelect.appendChild(option);
    }
  }

  function populateDraftSlots() {
    const select = byId("draft-slot");
    const previous = Math.min(Number(state.settings.draftSlot), Number(state.settings.teams));
    select.replaceChildren();
    for (let slot = 1; slot <= Number(state.settings.teams); slot += 1) {
      const option = element("option", "", `Slot ${slot}`);
      option.value = String(slot);
      option.selected = slot === previous;
      select.appendChild(option);
    }
    state.settings.draftSlot = previous;
    syncUserDraftSlot();
  }

  function formatPick(overallPick) {
    const teams = Number(state.settings.teams);
    const round = Math.floor((overallPick - 1) / teams) + 1;
    const withinRound = ((overallPick - 1) % teams) + 1;
    const slot = round % 2 === 1 ? withinRound : teams - withinRound + 1;
    return `${round}.${String(slot).padStart(2, "0")}`;
  }

  function renderRecommendations(results) {
    const container = byId("recommendations");
    container.replaceChildren();
    results.slice(0, 3).forEach((result, index) => {
      const forecast = forecastFor(result.player);
      const card = element("article", `recommendation-card${isWatchlisted(result.player.id) ? " watchlisted" : ""}`);
      card.dataset.rank = String(index + 1);
      const label = element("span", "recommendation-label", index === 0 ? "Best pick now" : index === 1 ? "Best value pivot" : "Roster alternative");
      const title = element("h3", "", result.player.name);
      const rookieLabel = result.player.isRookie ? " · Rookie" : "";
      const subline = element("div", "player-subline", `${result.player.position}${result.player.positionRank} · ${result.player.team} · Tier ${result.player.tier}${rookieLabel}`);
      const reason = element("p", "recommendation-reason", model.recommendationReason(result));
      const returnLine = element("p", "return-line", `${forecast.probability}% chance to reach pick ${formatPick(forecast.nextPick || nextOpenOverall())}`);
      const scoreLine = element("div", "score-line");
      const bar = element("progress", "score-bar");
      bar.max = 100;
      bar.value = result.recommendationScore;
      bar.setAttribute("aria-label", `Recommendation score ${result.recommendationScore} out of 100`);
      append(scoreLine, bar, element("strong", "", result.recommendationScore));
      append(card, label, title, subline, reason, returnLine, scoreLine);
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", `View ${result.player.name} details`);
      card.addEventListener("click", () => showPlayer(result.player.id));
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); showPlayer(result.player.id); }
      });
      container.appendChild(card);
    });
  }

  function confidenceCell(result) {
    const wrapper = element("div", "confidence-meter");
    const track = element("progress");
    track.max = 100;
    track.value = result.consensus.certainty;
    track.setAttribute("aria-label", `Consensus certainty ${Math.round(result.consensus.certainty)} percent`);
    append(wrapper, track, element("b", "", `${Math.round(result.consensus.certainty)}%`));
    return wrapper;
  }

  function positionBadge(position) {
    return element("span", `position-badge position-${String(position).toLowerCase()}`, position);
  }

  function draftPlayer(playerId, forceMine = false) {
    if (state.draftLog.some((pick) => pick.playerId === playerId)) return;
    const overall = nextOpenOverall();
    const automatic = brain.managerAtPick(overall, Number(state.settings.teams), state.draftOrder).managerId;
    const managerId = forceMine ? USER_MANAGER_ID : automatic;
    state.draftLog.push({ playerId, mine: managerId === USER_MANAGER_ID, managerId, overall, at: new Date().toISOString() });
    saveState();
    renderBoard();
  }

  function openCustomPickDialog() {
    const overall = nextOpenOverall();
    const teams = Number(state.settings.teams);
    const maxOverall = teams * DRAFT_ROUNDS;
    const status = byId("custom-pick-status");
    status.textContent = "";
    if (overall > maxOverall) {
      status.textContent = "The configured draft is already complete.";
      return;
    }
    const current = brain.managerAtPick(overall, teams, state.draftOrder);
    const managerSelect = byId("custom-player-manager");
    managerSelect.replaceChildren();
    state.draftOrder.forEach((managerId) => {
      const option = element("option", "", managerName(managerId));
      option.value = managerId;
      option.selected = managerId === current.managerId;
      managerSelect.appendChild(option);
    });
    byId("custom-pick-form").reset();
    managerSelect.value = current.managerId;
    byId("custom-pick-slot").textContent = `${formatPick(overall)} · ${managerName(current.managerId)} on clock`;
    byId("custom-pick-dialog").showModal();
    byId("custom-player-name").focus();
  }

  function recordCustomPick() {
    const name = byId("custom-player-name").value.trim();
    const team = byId("custom-player-team").value.trim().toUpperCase() || "FA";
    const position = byId("custom-player-position").value;
    const managerId = byId("custom-player-manager").value;
    const status = byId("custom-pick-status");
    if (!name || !position || !state.draftOrder.includes(managerId)) {
      status.textContent = "Enter a player name, position, and drafting manager.";
      return;
    }
    const tracked = data.players.find((player) => player.name.toLowerCase() === name.toLowerCase());
    if (tracked) {
      status.textContent = `${tracked.name} is already tracked. Use search in the player list to record that pick.`;
      return;
    }
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const player = normalizeCustomPlayer({ id, name, team, position });
    if (!player) {
      status.textContent = "The custom player entry is invalid.";
      return;
    }
    const overall = nextOpenOverall();
    state.customPlayers = [...state.customPlayers, player];
    playerById.set(player.id, player);
    state.draftLog.push({ playerId: player.id, mine: managerId === USER_MANAGER_ID, managerId, overall, custom: true, at: new Date().toISOString() });
    saveState();
    byId("custom-pick-dialog").close();
    renderBoard();
  }

  function renderPlayerRows(results) {
    syncComparisonHeadings();
    const body = byId("player-rows");
    const query = state.search.trim().toLowerCase();
    if (state.filterPosition === "WATCHLIST" && !latestMacroResults.length) latestMacroResults = macroResults();
    const sourceResults = state.filterPosition === "WATCHLIST" ? latestMacroResults : results;
    const draftedById = new Map(state.draftLog.map((pick) => [pick.playerId, pick]));
    const keeperById = new Map(activeKeepers().map((keeper) => [keeper.playerId, keeper]));
    let rows = sourceResults.filter((result) => {
      const player = result.player;
      const positionMatch = state.filterPosition === "ALL"
        || (state.filterPosition === "ROOKIE" ? player.isRookie : state.filterPosition === "WATCHLIST" ? isWatchlisted(player.id) : player.position === state.filterPosition);
      const searchMatch = !query || player.name.toLowerCase().includes(query) || player.team.toLowerCase().includes(query);
      return positionMatch && searchMatch;
    });
    const sortValueById = new Map(rows.map((result) => {
      const player = result.player;
      let value = result.modelRank;
      if (state.sort === "ecr") value = player.rank;
      if (state.sort === "tier") value = Number(player.tier);
      if (state.sort === "value") value = player.ecrVsAdp;
      if (state.sort === "certainty") value = result.consensus.certainty;
      if (state.sort === "return") value = draftedById.has(player.id) || keeperById.has(player.id) ? null : forecastFor(player).probability;
      if (state.sort === "comparison") value = comparisonRankFor(player);
      if (state.sort === "edge") value = comparisonFor(result).gap;
      return [player.id, value];
    }));
    const direction = state.sortDirection === "desc" ? -1 : 1;
    rows.sort((left, right) => {
      const leftValue = sortValueById.get(left.player.id);
      const rightValue = sortValueById.get(right.player.id);
      const leftAvailable = Number.isFinite(leftValue);
      const rightAvailable = Number.isFinite(rightValue);
      if (leftAvailable !== rightAvailable) return leftAvailable ? -1 : 1;
      if (leftAvailable && leftValue !== rightValue) return (leftValue - rightValue) * direction;
      return left.modelRank - right.modelRank || left.player.rank - right.player.rank;
    });

    const totalRows = rows.length;
    const visibleRows = rows.slice(0, state.playerLimit);
    const fragment = document.createDocumentFragment();
    visibleRows.forEach((result) => {
      const player = result.player;
      const draftedPick = draftedById.get(player.id);
      const keeper = keeperById.get(player.id);
      const unavailable = Boolean(draftedPick || keeper);
      const rowClasses = [isWatchlisted(player.id) ? "player-watchlisted" : "", unavailable ? "player-unavailable" : ""].filter(Boolean).join(" ");
      const row = element("tr", rowClasses);
      row.dataset.playerId = player.id;
      row.appendChild(element("td", "rank-cell", result.modelRank));

      const playerCell = element("td", "player-cell");
      const watchButton = element("button", `watchlist-toggle${isWatchlisted(player.id) ? " active" : ""}`, isWatchlisted(player.id) ? "★" : "☆");
      watchButton.type = "button";
      watchButton.dataset.playerAction = "watchlist";
      watchButton.setAttribute("aria-label", `${isWatchlisted(player.id) ? "Remove" : "Add"} ${player.name} ${isWatchlisted(player.id) ? "from" : "to"} watchlist`);
      watchButton.setAttribute("aria-pressed", String(isWatchlisted(player.id)));
      watchButton.title = isWatchlisted(player.id) ? "Remove from watchlist" : "Add to watchlist";
      const playerButton = element("button", "player-detail-button", player.name);
      playerButton.type = "button";
      playerButton.dataset.playerAction = "profile";
      playerButton.title = `Open ${player.name} profile`;
      playerButton.setAttribute("aria-label", `Open ${player.name} profile`);
      const details = element("small");
      append(details, positionBadge(player.position));
      if (player.isRookie) append(details, element("span", "rookie-badge", "R"));
      details.appendChild(document.createTextNode(`${player.team} · ${player.position}${player.positionRank}`));
      const playerNameLine = element("div", "player-name-line");
      append(playerNameLine, watchButton, playerButton);
      append(playerCell, playerNameLine, details);
      row.appendChild(playerCell);
      row.appendChild(comparisonRankCell(result, true));
      row.appendChild(element("td", "", player.tier));
      row.appendChild(comparisonEdgeCell(result, true));
      const confidence = element("td");
      confidence.appendChild(confidenceCell(result));
      row.appendChild(confidence);

      const returnCell = element("td", "return-cell");
      if (unavailable) {
        append(returnCell, element("strong", "return-danger", "Taken"), element("small", "", draftedPick ? formatPick(draftedPick.overall) : `Keeper R${keeper.round}`));
      } else {
        const forecast = forecastFor(player);
        append(returnCell, element("strong", forecast.probability >= 70 ? "return-safe" : forecast.probability >= 35 ? "return-risk" : "return-danger", `${forecast.probability}%`), element("small", "", forecast.nextPick ? formatPick(forecast.nextPick) : "—"));
        returnCell.title = forecast.insights.join(" ");
      }
      row.appendChild(returnCell);

      const actionsCell = element("td");
      if (unavailable) {
        const owner = draftedPick ? managerName(draftedPick.managerId) : managerName(keeper.managerId);
        actionsCell.appendChild(element("span", "watchlist-taken-label", owner));
      } else {
        const actions = element("div", "draft-actions");
        const mine = element("button", "draft-button secondary", "Mine");
        mine.type = "button";
        mine.dataset.playerAction = "mine";
        const taken = element("button", "draft-button", "Drafted");
        taken.type = "button";
        taken.dataset.playerAction = "drafted";
        append(actions, taken, mine);
        actionsCell.appendChild(actions);
      }
      row.appendChild(actionsCell);
      fragment.appendChild(row);
    });
    body.replaceChildren(fragment);
    const remaining = Math.max(0, totalRows - visibleRows.length);
    const listLabel = state.filterPosition === "WATCHLIST" ? "watchlisted players" : "available players";
    const sortLabel = byId("sort-players").selectedOptions[0]?.textContent || "model rank";
    byId("player-list-status").textContent = totalRows
      ? `Showing ${visibleRows.length} of ${totalRows} ${listLabel} · ${sortLabel} ${state.sortDirection === "desc" ? "high to low" : "low to high"}`
      : state.filterPosition === "WATCHLIST" ? "Your watchlist is empty. Star players anywhere to add them." : "No available players match these filters.";
    const showMore = byId("show-more-players");
    showMore.hidden = remaining === 0;
    showMore.textContent = remaining ? `Show ${Math.min(PLAYER_PAGE_SIZE, remaining)} more` : "Show more";
  }

  function buildRosterSlots(roster) {
    const starters = [];
    const bench = [];
    const remaining = [...roster];
    const addSlot = (label, eligible) => {
      const index = remaining.findIndex((player) => eligible.includes(player.position));
      const player = index >= 0 ? remaining.splice(index, 1)[0] : null;
      starters.push({ label, player });
    };
    for (let index = 0; index < Number(state.settings.startingQbs); index += 1) addSlot(index ? "SFLX" : "QB", ["QB"]);
    addSlot("RB1", ["RB"]); addSlot("RB2", ["RB"]);
    addSlot("WR1", ["WR"]); addSlot("WR2", ["WR"]);
    addSlot("TE", ["TE"]); addSlot("FLEX", ["RB", "WR", "TE"]);
    addSlot("K", ["K"]); addSlot("DST", ["DST"]);
    remaining.forEach((player, index) => bench.push({ label: `B${index + 1}`, player }));
    while (starters.length + bench.length < ROSTER_SIZE) bench.push({ label: `B${bench.length + 1}`, player: null });
    return [...starters, ...bench];
  }

  function renderRoster() {
    const roster = currentRoster();
    const container = byId("roster-slots");
    container.replaceChildren();
    buildRosterSlots(roster).forEach((slot) => {
      const row = element("div", `roster-slot${slot.player ? "" : " empty"}`);
      append(row, element("span", "slot-name", slot.label), element("span", "slot-player", slot.player ? slot.player.name : "Open"));
      container.appendChild(row);
    });
    byId("roster-count").textContent = `${roster.length} / ${ROSTER_SIZE}`;
  }

  function renderOpponentBrain() {
    const overall = nextOpenOverall();
    const current = brain.managerAtPick(overall, Number(state.settings.teams), state.draftOrder);
    const profile = brain.profileFor(current.managerId);
    const container = byId("opponent-brain");
    container.replaceChildren();
    const liveWeight = Math.round((0.05 + (Math.min(60, state.draftLog.length) / 60) * 0.25) * 100);
    byId("opponent-sample").textContent = profile ? `${profile.years.length} seasons · ${liveWeight}% live` : `Baseline · ${liveWeight}% live`;
    append(container, element("h4", "opponent-name", managerName(current.managerId)), element("p", "opponent-pick", `Pick ${formatPick(overall)} · slot ${current.slot}`));
    const positions = brain.likelyPositions(current.managerId, current.round, draftedPicksForBrain(), {
      availablePlayers: latestBoardResults,
      currentOverall: overall
    });
    const list = element("div", "opponent-position-list");
    positions.slice(0, 4).forEach((item) => {
      const row = element("div", "opponent-position-row");
      const label = element("div", "opponent-position-label");
      append(label, positionBadge(item.position), element("span", "", item.reason));
      const meter = element("div", "opponent-probability-track");
      const fill = element("span", `position-fill position-${item.position.toLowerCase()}`);
      fill.style.width = `${item.probability}%`;
      meter.appendChild(fill);
      append(row, label, meter, element("strong", "", `${item.probability}%`));
      list.appendChild(row);
    });
    container.appendChild(list);
    const personality = brain.personalityFor(current.managerId);
    const note = profile ? `${personality.label}. ${personality.details}` : personality.details;
    container.appendChild(element("p", "opponent-note", note));
  }

  function renderTeamBuilder(results) {
    const currentOverall = nextOpenOverall();
    const teams = Number(state.settings.teams);
    const currentManager = brain.managerAtPick(currentOverall, teams, state.draftOrder).managerId;
    const decisionOverall = currentManager === USER_MANAGER_ID
      ? currentOverall
      : brain.nextPickForManager(currentOverall - 1, USER_MANAGER_ID, teams, state.draftOrder, DRAFT_ROUNDS) || currentOverall;
    const nextPick = brain.nextPickForManager(decisionOverall, USER_MANAGER_ID, teams, state.draftOrder, DRAFT_ROUNDS);
    const analysis = strategyEngine.analyze({
      results,
      roster: currentRoster(),
      draftLog: draftedPicksForBrain(),
      teams,
      currentOverall: decisionOverall,
      nextPick
    });
    const container = byId("team-builder");
    container.replaceChildren();
    byId("builder-round").textContent = `Plan for ${formatPick(decisionOverall)}`;
    append(container, element("h4", "builder-headline", analysis.strategy.headline), element("p", "builder-explanation", analysis.strategy.explanation));

    const needs = element("div", "builder-needs");
    analysis.needs.filter((need) => need.severity >= 25).slice(0, 3).forEach((need) => {
      const item = element("div", "builder-need");
      append(item, positionBadge(need.position), element("span", "", `${need.label} · ${need.count}/${need.target}`), element("strong", "", `${need.severity}%`));
      item.title = need.reason;
      needs.appendChild(item);
    });
    container.appendChild(needs);

    const recommendations = element("div", "builder-recommendations");
    analysis.recommendations.forEach((candidate) => {
      const button = element("button", "builder-pick");
      button.type = "button";
      const copy = element("span", "builder-pick-copy");
      append(copy, element("strong", "", candidate.player.name), element("small", "", `${candidate.action} · ${candidate.player.position}${candidate.player.positionRank} · Tier ${candidate.player.tier}`));
      append(button, copy, element("b", "", `${candidate.score}%`));
      button.addEventListener("click", () => showPlayer(candidate.player.id));
      recommendations.appendChild(button);
    });
    container.appendChild(recommendations);
    container.appendChild(element("p", "builder-reach", `Small-reach limit: ${analysis.allowedReach} picks · Next turn ${analysis.nextPick ? formatPick(analysis.nextPick) : "—"}`));
  }

  function renderDraftGrid() {
    const grid = byId("draft-grid");
    const fragment = document.createDocumentFragment();
    const teams = Number(state.settings.teams);
    grid.style.setProperty("--draft-columns", String(teams));
    fragment.appendChild(element("div", "draft-grid-corner", "RD"));
    state.draftOrder.forEach((managerId, index) => {
      const header = element("div", `draft-grid-header${managerId === USER_MANAGER_ID ? " mine" : ""}`);
      append(header, element("span", "", String(index + 1)), element("strong", "", managerName(managerId)));
      fragment.appendChild(header);
    });
    const keeperByOverall = new Map(activeKeepers().map((keeper) => [brain.overallForManagerRound(keeper.managerId, keeper.round, teams, state.draftOrder), keeper]));
    const pickByOverall = new Map(state.draftLog.map((pick) => [pick.overall, pick]));
    const currentOverall = nextOpenOverall();
    for (let draftRound = 1; draftRound <= DRAFT_ROUNDS; draftRound += 1) {
      fragment.appendChild(element("div", "draft-round-label", draftRound));
      state.draftOrder.forEach((managerId) => {
        const overall = brain.overallForManagerRound(managerId, draftRound, teams, state.draftOrder);
        const pick = pickByOverall.get(overall);
        const keeper = keeperByOverall.get(overall);
        const player = pick ? playerById.get(pick.playerId) : keeper ? playerById.get(keeper.playerId) : null;
        const status = pick ? " filled" : keeper ? " keeper" : overall === currentOverall ? " current" : "";
        const cell = element("div", `draft-grid-cell${status}${managerId === USER_MANAGER_ID ? " mine" : ""}`);
        cell.dataset.position = player?.position || "";
        append(cell, element("span", "", formatPick(overall)), element("strong", "", player ? player.name : "—"), element("small", "", keeper ? "Projected keeper" : player ? `${player.position} · ${managerName(pick?.managerId || managerId)}${player.isCustom ? " · Custom" : ""}` : managerName(managerId)));
        fragment.appendChild(cell);
      });
    }
    grid.replaceChildren(fragment);
  }

  function renderDraftLog() {
    const list = byId("draft-log");
    list.replaceChildren();
    if (!state.draftLog.length) {
      const empty = element("p", "empty-log", "No picks recorded yet.");
      list.appendChild(empty);
    } else {
      state.draftLog.forEach((pick) => {
        const player = playerById.get(pick.playerId);
        const item = element("li");
        append(item, element("strong", "", player.name), element("span", "", managerName(pick.managerId)));
        list.appendChild(item);
      });
    }
    byId("undo-pick").disabled = !state.draftLog.length;
    const currentOverall = nextOpenOverall();
    byId("current-pick").textContent = formatPick(currentOverall);
    const current = brain.managerAtPick(currentOverall, Number(state.settings.teams), state.draftOrder);
    byId("on-clock-manager").textContent = managerName(current.managerId);
  }

  function renderBoard() {
    resetForecastSnapshot();
    const results = currentResults();
    latestBoardResults = results;
    renderRecommendations(results);
    renderPlayerRows(results);
    renderRoster();
    renderDraftGrid();
    renderOpponentBrain();
    renderTeamBuilder(results);
    renderDraftLog();
    renderModel(results);
  }

  function renderAccuracy() {
    const postmortem = historicalRoundtable.postmortem(historicalData);
    const portfolio = historicalBacktest.runPortfolio(historicalMultiSeasonData.concat(historicalData), historicalRoundtable);
    const waitResult = waitCalibration.run(historicalMultiSeasonData.concat(historicalData));
    const roundtable = postmortem.original;
    const metrics = roundtable.evaluation.metrics;
    const crossValidated = postmortem.crossValidated.metrics;
    const refit = postmortem.refit.metrics;
    const portfolioMetrics = portfolio.metrics;
    const summary = byId("accuracy-summary");
    summary.replaceChildren();
    const accuracyCards = [
      ["Frozen baseline", `${portfolioMetrics.baselineMae} MAE · ${portfolioMetrics.baselineSpearman} ρ`, "accuracyScorecard", `${portfolioMetrics.playerCount} player-seasons across ${portfolioMetrics.seasonCount} seasons.`],
      ["Locked specialist loop", `${portfolioMetrics.specialistMae} MAE · ${portfolioMetrics.specialistSpearman} ρ`, "accuracyScorecard", "No outcome-fitted weights; unavailable critics abstain."],
      ["Projection error", `${portfolioMetrics.pointMae} MAE · ${portfolioMetrics.pointRmse} RMSE`, "pointBacktest", `${portfolioMetrics.projectedPlayerCount} projection-backed records; ${portfolioMetrics.pointBias > 0 ? "+" : ""}${portfolioMetrics.pointBias}-point average bias.`],
      ["Weekly-rate order", `${portfolioMetrics.ppgMae} MAE · ${portfolioMetrics.ppgSpearman} ρ`, "ppgBacktest", "Actual points per game removes the direct missed-game penalty from final ordering."],
      ["Error decomposition", `${portfolioMetrics.availabilityMae} avail · ${portfolioMetrics.performanceMae} rate`, "errorDecomposition", `${portfolioMetrics.decompositionPlayerCount} records. Bias: ${portfolioMetrics.availabilityBias > 0 ? "+" : ""}${portfolioMetrics.availabilityBias} availability and ${portfolioMetrics.performanceBias > 0 ? "+" : ""}${portfolioMetrics.performanceBias} performance points.`],
      ["Pilot interval coverage", `${portfolioMetrics.intervalCoverage}% · ±${portfolioMetrics.meanRankBand}`, "intervalCalibration", "Single-season descriptive coverage; no forward calibration is claimed."]
    ];
    if (portfolioMetrics.rollingSeasonCount) {
      accuracyCards.splice(2, 0,
        ["Position-specific forward", `${portfolioMetrics.positionModelMae} MAE · ${portfolioMetrics.positionModelSpearman} ρ`, "accuracyScorecard", `${portfolioMetrics.rollingSeasonCount} test seasons; supported positions receive independently fitted critic weights.`],
        ["Same-test baseline", `${portfolioMetrics.rollingBaselineMae} MAE · ${portfolioMetrics.rollingBaselineSpearman} ρ`, "accuracyScorecard", "Baseline restricted to the same rolling-origin test seasons."]
      );
    }
    accuracyCards.forEach(([label, value, helpKey, detail]) => {
      const card = element("div", "summary-stat");
      const metric = decorateMetric(element("strong", "", value), helpKey, detail, label.includes("rate") || label.includes("coverage") ? "Higher is better, but sample size matters." : "Lower MAE and higher ρ are better.", true);
      append(card, element("span", "", label), metric);
      summary.appendChild(card);
    });

    decorateMetric(byId("roundtable-lock"), "historicalLock", "", `Final input cutoff ${historicalData.meta.frozenAt}; public baseline ${historicalData.meta.sourceCutoffs.marketRank}.`, true).textContent = `Locked ${historicalData.meta.frozenAt}`;
    byId("roundtable-method").textContent = `${portfolioMetrics.playerCount} player-seasons are audited in the privacy-safe public pilot. No private league draft prices or manager data are included. The ${refit.mae} hindsight result remains diagnostic only, and historical weights cannot influence the live model until multiple frozen seasons pass every promotion gate.`;

    const waitSummary = byId("wait-calibration-summary");
    waitSummary.replaceChildren();
    const waitCards = waitResult.testSeasonCount ? [
      ["Uncalibrated", `${waitResult.baselineBrier} Brier · ${waitResult.baselineEce} error`, "The fixed rank-distance curve used no historical fitting."],
      ["Season-forward calibrated", `${waitResult.calibratedBrier} Brier · ${waitResult.calibratedEce} error`, `${waitResult.testSeasonCount} held-out seasons and ${waitResult.exampleCount} conditional player/pick decisions.`],
      ["Candidate curve", `offset ${waitResult.candidateParameters.offset} · scale ${waitResult.candidateParameters.scale}`, waitResult.promoted ? "Held-out probability performance passed both gates." : "Research only; the live draft brain keeps its existing conservative probability curve."],
      ["Live status", waitResult.promoted ? "Approved" : "Research only", waitResult.promoted ? "Calibrated parameters may influence live wait-return probabilities." : `${waitResult.improvedFolds}/${waitResult.testSeasonCount} folds improved both scores; four held-out seasons are required.`]
    ] : [["League calibration", "Not loaded", "Importing league history enables manager tendencies, but a trustworthy wait-return calibration still requires multiple dated draft seasons."]];
    waitCards.forEach(([label, value, detail]) => {
      const card = element("article", `promotion-gate ${waitResult.promoted ? "passed" : "failed"}`);
      append(card, element("strong", "", label), decorateMetric(element("span", "", value), "waitCalibration", detail, "Lower Brier and calibration error are better.", true));
      waitSummary.appendChild(card);
    });
    const criticGrid = byId("critic-grid");
    criticGrid.replaceChildren();
    roundtable.generated.critics.forEach((critic) => {
      const diagnostic = postmortem.diagnostics.find((item) => item.criticId === critic.id);
      const reviews = roundtable.generated.ranking.flatMap((row) => row.critiques.flatMap((pass) => pass.reviews.filter((review) => review.criticId === critic.id)));
      const confidence = Math.round(reviews.reduce((total, review) => total + review.confidence, 0) / Math.max(reviews.length, 1));
      const card = element("article", "critic-card");
      const heading = element("div", "critic-heading");
      append(heading, element("h4", "", critic.name), decorateMetric(element("span", "critic-confidence", `${confidence}% confidence`), "criticConfidence", critic.name, "Higher means the critic had more complete preseason evidence, not that it was more accurate.", true));
      const diagnosticText = critic.id === "uncertainty" ? `${diagnostic.diagnosticRate}% interval coverage · no mean-rank vote` : `${diagnostic.diagnosticRate}% directional hit rate · hindsight weight ${diagnostic.refitWeight > 0 ? "+" : ""}${diagnostic.refitWeight}`;
      const diagnosticDetail = critic.id === "uncertainty" ? `${diagnostic.helped} outcomes inside the stated range and ${diagnostic.hurt} outside.` : `${diagnostic.helped} helpful directions, ${diagnostic.hurt} harmful, ${diagnostic.flat} neutral.`;
      append(card, heading, element("b", "", critic.personality), element("p", "", critic.focus), decorateMetric(element("p", "critic-diagnostic", diagnosticText), "criticDiagnostic", diagnosticDetail, critic.id === "uncertainty" ? "Range calibration is separate from mean-rank accuracy." : "Hindsight weights are diagnostic and are not copied into the live model.", true));
      criticGrid.appendChild(card);
    });

    const crossValidatedRankById = new Map(postmortem.crossValidated.ranking.map((row) => [row.player.id, row.rank]));
    const refitRankById = new Map(postmortem.refit.ranking.map((row) => [row.player.id, row.rank]));
    const tbody = byId("roundtable-body");
    tbody.replaceChildren();
    roundtable.evaluation.rows.slice().sort((left, right) => crossValidatedRankById.get(left.player.id) - crossValidatedRankById.get(right.player.id)).forEach((row) => {
      const tr = element("tr");
      const playerCell = element("td");
      append(playerCell, element("strong", "", row.player.name), element("span", `position-badge pos-${row.player.position.toLowerCase()}`, row.player.position));
      [
        playerCell,
        decorateMetric(element("td", "", `#${row.initialRank}`), "originalHistoricalRank", row.player.name, "Ranked before any critic adjustments.", true),
        decorateMetric(element("td", "", `#${row.finalRank}`), "firstLoopRank", row.player.name, `Moved ${row.initialRank - row.finalRank > 0 ? "up" : row.initialRank - row.finalRank < 0 ? "down" : "zero places"} from the baseline.`, true),
        decorateMetric(element("td", "audit-improved", `#${crossValidatedRankById.get(row.player.id)}`), "crossValidatedRank", row.player.name, `Actual cohort finish: #${row.outcomeRank}.`, true),
        decorateMetric(element("td", "", `#${Math.max(1, row.finalRank - row.uncertaintyBand)}–#${Math.min(metrics.playerCount, row.finalRank + row.uncertaintyBand)}`), "uncertaintyRange", `${row.player.name}: ±${row.uncertaintyBand} cohort ranks`, row.intervalHit ? "The actual finish landed inside this range." : "The actual finish landed outside this range.", true),
        decorateMetric(element("td", "", `${row.player.projectedHalfPprPoints}`), "projectedHistoricalPoints", `${row.player.projectedPprPoints} PPR points minus half of ${row.player.projectedReceptions} receptions.`, `${row.player.projectedVor > 0 ? "+" : ""}${row.player.projectedVor} projected points over replacement.`, true),
        decorateMetric(element("td", "audit-hindsight", `#${refitRankById.get(row.player.id)}`), "hindsightRank", row.player.name, "Do not treat this column as an honest preseason forecast.", true),
        decorateMetric(element("td", "", `#${row.outcomeRank} · ${row.halfPprPoints}`), "historicalOutcome", row.player.name, `${row.halfPprPoints} total half-PPR points.`, true)
      ].forEach((cell) => tr.appendChild(cell));
      tbody.appendChild(tr);
    });

    byId("promotion-status").textContent = portfolio.promoted ? "Approved for live influence" : "Research only";
    const promotionGrid = byId("promotion-gates");
    promotionGrid.replaceChildren();
    portfolio.gates.forEach((gate) => {
      const card = element("article", `promotion-gate ${gate.passed ? "passed" : "failed"}`);
      append(card, element("strong", "", gate.label), decorateMetric(element("span", "", `${gate.passed ? "PASS" : "WAIT"} · ${gate.value}`), "promotionGate", gate.passed ? "This gate passes on the current audited portfolio." : "More frozen evidence or better held-out performance is required.", "Every gate must pass before promotion.", true));
      promotionGrid.appendChild(card);
    });

    const expansionLedger = byId("expansion-ledger");
    expansionLedger.replaceChildren();
    portfolio.seasons.forEach((audit) => {
      const row = element("article", "expansion-row");
      const rollingText = audit.rollingMae === null ? "No forward test" : `Forward ${audit.rollingMae} MAE · ${audit.rollingSpearman} ρ`;
      append(row, element("strong", "", audit.season), element("span", "", "Public pilot"), element("p", "", `${audit.playerCount} players · baseline ${audit.baselineMae} MAE · ${rollingText}.`));
      expansionLedger.appendChild(row);
    });

    const grid = byId("source-grid");
    grid.replaceChildren();
    data.sourceVerdicts.forEach((source) => {
      const card = element("article", "source-card");
      const header = element("div", "source-card-header");
      const toneClass = source.tone === "neutral" ? " neutral" : source.tone === "caution" ? " caution" : "";
      append(header, element("h3", "", source.name), element("span", `verdict${toneClass}`, source.verdict));
      const evidence = element("div", "evidence-line");
      append(evidence, element("span", "", "Evidence"), decorateMetric(element("strong", "", source.evidence), "accuracyEvidence", source.name, source.conclusion, true));
      const link = element("a", "source-link", "Open source ↗");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      append(card, header, element("p", "", source.conclusion), evidence, link);
      grid.appendChild(card);
    });
  }

  function renderDraftOrderEditor() {
    const editor = byId("draft-order-editor");
    editor.replaceChildren();
    state.draftOrder.forEach((managerId, slotIndex) => {
      const row = element("label", `draft-order-row${managerId === USER_MANAGER_ID ? " mine" : ""}`);
      const slot = element("span", "", `Slot ${slotIndex + 1}`);
      const select = element("select");
      state.draftOrder.forEach((candidateId) => {
        const option = element("option", "", managerName(candidateId));
        option.value = candidateId;
        option.selected = candidateId === managerId;
        select.appendChild(option);
      });
      select.addEventListener("change", () => {
        const swapIndex = state.draftOrder.indexOf(select.value);
        [state.draftOrder[slotIndex], state.draftOrder[swapIndex]] = [state.draftOrder[swapIndex], state.draftOrder[slotIndex]];
        state.settings.draftSlot = state.draftOrder.indexOf(USER_MANAGER_ID) + 1;
        state.draftLog = normalizeDraftLog(state.draftLog);
        byId("draft-slot").value = String(state.settings.draftSlot);
        saveState();
        renderBrain();
        renderBoard();
      });
      append(row, slot, select);
      editor.appendChild(row);
    });
  }

  function renderBrain() {
    const summary = byId("brain-summary");
    summary.replaceChildren();
    const mappedPicks = brain.picks.filter((pick) => !pick.managerId.startsWith("unmapped:"));
    [["Historical picks", brain.picks.length], ["Seasons indexed", brain.history.seasons.length], ["Identity coverage", `${Math.round(mappedPicks.length / Math.max(brain.picks.length, 1) * 100)}%`]].forEach(([label, value]) => {
      const card = element("div", "summary-stat");
      append(card, element("span", "", label), element("strong", "", value));
      summary.appendChild(card);
    });
    renderDraftOrderEditor();
    const grid = byId("manager-profile-grid");
    grid.replaceChildren();
    brain.managerProfiles.forEach((profile) => {
      const card = element("article", `manager-profile-card${profile.id === USER_MANAGER_ID ? " mine" : ""}`);
      const heading = element("div", "manager-profile-heading");
      append(heading, element("h4", "", profile.name), element("span", `identity-confidence ${profile.confidence}`, profile.confidence));
      const topEarly = ["QB", "RB", "WR", "TE"].map((position) => ({ position, rate: profile.rates.early[position] || 0 })).sort((a, b) => b.rate - a.rate).slice(0, 2);
      const tendency = topEarly.map((item) => `${item.position} ${Math.round(item.rate * 100)}%`).join(" · ");
      const aliases = profile.aliases.length > 1 ? `Aliases: ${profile.aliases.slice(1).join(", ")}` : "No confirmed prior alias";
      const repeats = profile.repeats.length ? `Repeated targets: ${profile.repeats.slice(0, 2).map(([name, count]) => `${name} ${count}×`).join(", ")}` : "No repeated-player signal";
      const owner = identities.currentOwners[profile.id];
      append(card, heading, element("p", "manager-sample", `${owner ? `${owner} · ` : ""}${profile.sampleSize} picks · ${profile.years.join("–") || "no history"}`), element("p", "", `Early mix: ${tendency || "league baseline"}`), element("p", "", `Median QB R${profile.medianRound.QB || "—"} · TE R${profile.medianRound.TE || "—"}`), element("p", "manager-aliases", aliases), element("p", "manager-repeats", repeats));
      grid.appendChild(card);
    });
  }

  const weightLabels = {
    consensus: "Expert consensus",
    projectionVor: "Projection / VOR",
    opportunity: "Opportunity",
    schedule: "Schedule",
    durability: "Durability",
    market: "Market value"
  };

  function buildWeightControls() {
    const container = byId("weight-controls");
    container.replaceChildren();
    Object.keys(weightLabels).forEach((key) => {
      const row = element("div", "weight-row");
      const label = element("label", "", weightLabels[key]);
      const input = element("input");
      input.type = "range";
      input.min = "0";
      input.max = "50";
      input.step = "1";
      input.value = String(state.weights[key]);
      input.dataset.weight = key;
      input.id = `weight-${key}`;
      label.htmlFor = input.id;
      const output = element("output", "", `${state.weights[key]}%`);
      output.htmlFor = input.id;
      input.addEventListener("input", () => {
        state.weights[key] = Number(input.value);
        output.textContent = `${input.value}%`;
        saveState();
        renderBoard();
      });
      append(row, label, input, output);
      container.appendChild(row);
    });
  }

  function renderModel(results) {
    const selected = results.find((result) => result.player.id === state.selectedPlayerId) || results[0];
    if (!selected) return;
    byId("model-player-name").textContent = selected.player.name;
    byId("model-player-score").textContent = selected.recommendationScore;
    byId("coverage-label").textContent = `Coverage ${Math.round(selected.coverage)}%`;
    const anatomy = byId("score-anatomy");
    anatomy.replaceChildren();
    Object.entries(weightLabels).forEach(([key, label]) => {
      const value = selected.signals[key];
      const row = element("div", `anatomy-row${value === null ? " missing" : ""}`);
      const track = element("progress", "anatomy-track");
      track.max = 100;
      track.value = value === null ? 100 : value;
      track.setAttribute("aria-label", value === null ? `${label} unavailable` : `${label} ${Math.round(value)} out of 100`);
      append(row, element("span", "", label), track, element("b", "", value === null ? "N/A" : Math.round(value)));
      anatomy.appendChild(row);
    });
  }

  function renderData() {
    const rookieCount = data.players.filter((player) => player.isRookie).length;
    byId("dataset-count").textContent = `${data.players.length} players · ${rookieCount} rookies`;
    byId("import-status").textContent = `${context.coverage.projectedPlayers} projections matched · ${context.coverage.teams} team environments · local CSV overrides supported.`;
    const ledger = byId("source-ledger");
    ledger.replaceChildren();
    const builtInSources = context.sources.map(([source, artifact, date, url]) => ({ source, artifact, date, url }));
    const sources = [...data.researchLedger, ...builtInSources].filter((entry, index, entries) => entries.findIndex((candidate) => candidate.url === entry.url) === index);
    sources.forEach((entry) => {
      const row = element("div", "ledger-row");
      const link = element("a", "", "Review ↗");
      link.href = entry.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      append(row, element("span", "", entry.source), element("strong", "", entry.artifact), element("span", "", entry.date), link);
      ledger.appendChild(row);
    });
    const snapshotLedger = byId("snapshot-ledger");
    snapshotLedger.replaceChildren();
    snapshotRegistry.snapshots.forEach((snapshot) => {
      const row = element("div", "ledger-row");
      const status = snapshot.id === snapshotRegistry.active ? "Active" : "Archived";
      append(row, element("span", "", snapshot.asOf), element("strong", "", snapshot.label), element("span", "", `${status} · ${snapshot.files.length} files`), element("span", "", snapshot.immutable ? "Immutable" : "Mutable"));
      snapshotLedger.appendChild(row);
    });
  }

  function rankingSignal(value) {
    return Number.isFinite(value) ? String(Math.round(value)) : "—";
  }

  function renderRankingSummary(results) {
    const summary = byId("rankings-summary");
    const tierCount = new Set(results.map((result) => result.player.tier)).size;
    const projectedCount = results.filter((result) => Number.isFinite(context.playerContext(result.player)?.projection?.points)).length;
    const rookieCount = results.filter((result) => result.player.isRookie).length;
    const comparisonCount = results.filter((result) => Number.isFinite(comparisonRankFor(result.player))).length;
    summary.replaceChildren();
    [["Ranked players", results.length], ["Model tiers", tierCount], ["Point projections", projectedCount], ["Rookies tracked", rookieCount], [`${activeComparisonSource().shortName} coverage`, `${comparisonCount}/${results.length}`]].forEach(([label, value]) => {
      const card = element("div", "summary-stat");
      append(card, element("span", "", label), element("strong", "", value));
      summary.appendChild(card);
    });
  }

  function renderTierMap(results) {
    const container = byId("ranking-tier-grid");
    const position = state.rankingPosition;
    const eligible = results.filter((result) => position === "ALL" || (position === "ROOKIE" ? result.player.isRookie : result.player.position === position));
    const grouped = new Map();
    eligible.forEach((result) => {
      if (!grouped.has(result.player.tier)) grouped.set(result.player.tier, []);
      grouped.get(result.player.tier).push(result);
    });
    byId("tier-map-label").textContent = position === "ALL" ? "All positions" : position === "ROOKIE" ? "Rookies" : position;
    container.replaceChildren();
    Array.from(grouped.entries()).sort((left, right) => left[0] - right[0]).forEach(([tier, members]) => {
      const card = element("article", "tier-card");
      const heading = element("div", "tier-card-heading");
      append(heading, element("strong", "", `Tier ${tier}`), element("span", "", `${members.length} players`));
      const names = element("p", "", members.slice(0, 5).map((result) => `${result.player.name} (${result.player.position})`).join(" · "));
      append(card, heading, names);
      container.appendChild(card);
    });
  }

  function renderRankings() {
    syncComparisonHeadings();
    const results = macroResults();
    latestMacroResults = results;
    renderRankingSummary(results);
    renderTierMap(results);
    const query = state.rankingSearch.trim().toLowerCase();
    let rows = results.filter((result) => {
      const player = result.player;
      const positionMatch = state.rankingPosition === "ALL" || (state.rankingPosition === "ROOKIE" ? player.isRookie : player.position === state.rankingPosition);
      return positionMatch && (!query || player.name.toLowerCase().includes(query) || player.team.toLowerCase().includes(query));
    }).slice();
    const metric = (result, key) => Number.isFinite(result.signals[key]) ? result.signals[key] : -1;
    if (state.rankingSort === "baseline") rows.sort((left, right) => left.player.rank - right.player.rank);
    if (state.rankingSort === "projection") rows.sort((left, right) => (context.playerContext(right.player)?.projection?.points ?? -1) - (context.playerContext(left.player)?.projection?.points ?? -1) || left.player.rank - right.player.rank);
    if (state.rankingSort === "vor") rows.sort((left, right) => metric(right, "projectionVor") - metric(left, "projectionVor") || left.player.rank - right.player.rank);
    if (state.rankingSort === "opportunity") rows.sort((left, right) => metric(right, "opportunity") - metric(left, "opportunity") || left.player.rank - right.player.rank);
    if (state.rankingSort === "schedule") rows.sort((left, right) => metric(right, "schedule") - metric(left, "schedule") || left.player.rank - right.player.rank);
    if (state.rankingSort === "durability") rows.sort((left, right) => metric(right, "durability") - metric(left, "durability") || left.player.rank - right.player.rank);
    if (state.rankingSort === "tier") rows.sort((left, right) => left.player.tier - right.player.tier || left.modelRank - right.modelRank);
    if (state.rankingSort === "comparison") rows.sort((left, right) => (comparisonRankFor(left.player) ?? 9999) - (comparisonRankFor(right.player) ?? 9999) || left.modelRank - right.modelRank);
    if (state.rankingSort === "edge") rows.sort((left, right) => (comparisonFor(right).gap ?? -9999) - (comparisonFor(left).gap ?? -9999) || left.modelRank - right.modelRank);

    const draftedIds = new Set([...state.draftLog.map((pick) => pick.playerId), ...activeKeepers().map((keeper) => keeper.playerId)]);
    const body = byId("ranking-rows");
    body.replaceChildren();
    rows.forEach((result) => {
      const player = result.player;
      const details = context.playerContext(player);
      const rowClasses = [draftedIds.has(player.id) ? "ranking-drafted" : "", isWatchlisted(player.id) ? "player-watchlisted" : ""].filter(Boolean).join(" ");
      const row = element("tr", rowClasses);
      const modelRankCell = element("td", "rank-cell", result.modelRank);
      row.appendChild(decorateMetric(modelRankCell, "modelRank", `#${result.modelRank}/${results.length} overall`));
      row.appendChild(comparisonRankCell(result));
      row.appendChild(comparisonEdgeCell(result));
      const playerCell = element("td", "player-cell ranking-player-cell");
      const watchButton = element("button", `watchlist-toggle${isWatchlisted(player.id) ? " active" : ""}`, isWatchlisted(player.id) ? "★" : "☆");
      watchButton.type = "button";
      watchButton.setAttribute("aria-label", `${isWatchlisted(player.id) ? "Remove" : "Add"} ${player.name} ${isWatchlisted(player.id) ? "from" : "to"} watchlist`);
      watchButton.setAttribute("aria-pressed", String(isWatchlisted(player.id)));
      watchButton.addEventListener("click", () => toggleWatchlist(player.id));
      const button = element("button", "player-detail-button", player.name);
      button.type = "button";
      button.title = `Open ${player.name} profile`;
      button.setAttribute("aria-label", `Open ${player.name} profile`);
      button.addEventListener("click", () => showPlayer(player.id));
      const subline = element("small");
      append(subline, positionBadge(player.position));
      if (player.isRookie) append(subline, element("span", "rookie-badge", "R"));
      subline.appendChild(document.createTextNode(`${player.team} · ${player.position}${player.positionRank}`));
      if (draftedIds.has(player.id)) append(subline, element("span", "drafted-badge", "Drafted"));
      const playerNameLine = element("div", "player-name-line");
      append(playerNameLine, watchButton, button);
      append(playerCell, playerNameLine, subline);
      row.appendChild(playerCell);
      const tierCell = element("td", "tier-cell", player.tier);
      row.appendChild(decorateMetric(tierCell, "tier", `Tier ${player.tier}`));
      const baselineCell = element("td", "", player.rank);
      row.appendChild(decorateMetric(baselineCell, "baseline", `#${player.rank} overall · ${player.position}${player.positionRank}`));
      const projectionValue = details?.projection?.points;
      const projectionScope = Number.isFinite(projectionValue)
        ? playerMetricScope(player, projectionValue, (candidate) => context.playerContext(candidate)?.projection?.points)
        : "";
      const projectionCell = element("td", "split-signal projection-cell");
      append(projectionCell, element("strong", "", Number.isFinite(projectionValue) ? projectionValue : "—"));
      appendMetricScope(projectionCell, projectionScope);
      row.appendChild(decorateMetric(projectionCell, "projection", projectionScope));
      const vorScope = resultMetricScope(player, result.signals.projectionVor, results, (candidate) => candidate.signals.projectionVor);
      row.appendChild(rankingGradeCell(result.signals.projectionVor, "vor", vorScope));
      const opportunityScope = resultMetricScope(player, result.signals.opportunity, results, (candidate) => candidate.signals.opportunity);
      row.appendChild(rankingGradeCell(result.signals.opportunity, "opportunity", opportunityScope));
      const scheduleScope = resultMetricScope(player, result.signals.schedule, results, (candidate) => candidate.signals.schedule);
      row.appendChild(rankingGradeCell(result.signals.schedule, "schedule", scheduleScope, details?.schedule ? `REG ${Math.round(details.schedule.regularScore)} · PO ${Math.round(details.schedule.playoffScore)}` : ""));
      const durabilityScope = resultMetricScope(player, result.signals.durability, results, (candidate) => candidate.signals.durability);
      row.appendChild(rankingGradeCell(result.signals.durability, "durability", durabilityScope, details?.durability?.confidence || ""));
      const environmentCell = element("td", "split-signal environment-cell");
      const offenseScope = details?.team ? teamMetricScope(player, details.team.offenseQuality, (candidateDetails) => candidateDetails?.team?.offenseQuality, "NFL offenses") : "";
      const lineScope = details?.team ? teamMetricScope(player, details.team.offensiveLine, (candidateDetails) => candidateDetails?.team?.offensiveLine, "NFL offensive lines") : "";
      const castScope = details?.team ? teamMetricScope(player, details.supportingCast, (candidateDetails) => candidateDetails?.supportingCast, `${player.position} supporting casts`, true) : "";
      append(environmentCell, element("strong", "", details?.team ? `OFF ${Math.round(details.team.offenseQuality)}` : "—"), element("small", "metric-scope", offenseScope || "—"), element("small", "metric-detail", details?.team ? `${scoreLabel(details.team.offenseQuality)} · OL ${Math.round(details.team.offensiveLine)} ${compactMetricRank(lineScope)} · CAST ${Math.round(details.supportingCast)} ${compactMetricRank(castScope)}` : "—"));
      row.appendChild(decorateMetric(environmentCell, "offense", offenseScope, details?.team ? `Offensive line ${Math.round(details.team.offensiveLine)} (${lineScope}); supporting cast ${Math.round(details.supportingCast)} (${castScope}).` : ""));
      const marketCell = element("td", player.ecrVsAdp > 0 ? "value-positive" : player.ecrVsAdp < 0 ? "value-negative" : "", `${player.ecrVsAdp > 0 ? "+" : ""}${player.ecrVsAdp}`);
      const adp = player.ecrRank ? player.ecrRank + player.ecrVsAdp : null;
      row.appendChild(decorateMetric(marketCell, "market", player.ecrRank ? `ECR ${player.ecrRank} · ADP ${adp}` : "No matched ECR/ADP pair"));
      body.appendChild(row);
    });
  }

  function scoreLabel(score) {
    if (!Number.isFinite(score)) return "N/A";
    if (score >= 90) return "Elite";
    if (score >= 80) return "Excellent";
    if (score >= 70) return "Very good";
    if (score >= 60) return "Above average";
    if (score >= 50) return "Average";
    if (score >= 40) return "Below average";
    if (score >= 30) return "Poor";
    return "Very poor";
  }

  function addContextMetric(container, label, value, detail, options = {}) {
    const card = element("div", "context-metric");
    const displayValue = options.displayValue ?? (Number.isFinite(value) ? Math.round(value) : value || "N/A");
    append(card, element("span", "context-label", label), element("strong", "", displayValue));
    appendMetricScope(card, options.scope);
    card.appendChild(element("small", "metric-detail", detail || (Number.isFinite(value) && options.isGrade ? scoreLabel(value) : "")));
    decorateMetric(card, options.metricKey || "model", options.scope, options.extra, true);
    container.appendChild(card);
  }

  function playerQuickSummary(player, details, result) {
    if (!details) return `${player.name} remains in the full rankings, but the reviewed local context set does not contain enough matched projection data for a detailed profile.`;
    const projection = details.projection;
    const strengths = [];
    const risks = [];
    if (result?.signals.opportunity >= 78) strengths.push("high-end projected volume");
    if (result?.signals.projectionVor >= 78) strengths.push("strong replacement-level value");
    if (details.team?.offenseQuality >= 65) strengths.push("a favorable scoring environment");
    if (details.team?.offensiveLine >= 65) strengths.push("above-average line support");
    if (details.supportingCast >= 65) strengths.push("a strong supporting cast");
    if (details.schedule?.regularScore >= 65) strengths.push("an advantageous regular-season schedule");
    if (details.durability?.score < 60) risks.push("meaningful durability concern");
    else if (details.durability?.score < 75) risks.push("moderate availability risk");
    if (details.durability?.confidence === "Low") risks.push("limited NFL durability history");
    if (details.team?.offenseQuality < 42) risks.push("a weak projected offense");
    if (["QB", "RB"].includes(player.position) && details.team?.offensiveLine < 45) risks.push("below-average line play");
    if (details.schedule?.playoffScore < 40) risks.push("a difficult fantasy-playoff schedule");
    if (result?.signals.opportunity < 45) risks.push("uncertain weekly volume");
    const projectedFinish = projection ? `${player.position}${projection.positionRank}` : `${player.position}${player.positionRank}`;
    const projectionSentence = projection
      ? `${player.name} projects for ${projection.points} half-PPR points (${(projection.points / Math.max(projection.games, 1)).toFixed(1)} per game), a ${projectedFinish} finish.`
      : `${player.name} is currently ranked ${projectedFinish}, without a matched season-point projection.`;
    const upside = strengths.length ? strengths.slice(0, 3).join(", ") : "market value and a path to outperforming the baseline rank";
    const downside = risks.length ? risks.slice(0, 3).join(", ") : "normal injury, role, and projection uncertainty";
    const scheduleSentence = details.schedule
      ? `The schedule grades ${Math.round(details.schedule.regularScore)} for Weeks 1–14 and ${Math.round(details.schedule.playoffScore)} for Weeks 15–17, while the team environment grades ${Math.round(details.team?.offenseQuality ?? 50)} on offense and ${Math.round(details.team?.offensiveLine ?? 50)} on offensive line.`
      : "No complete schedule grade is available.";
    return `${projectionSentence} The primary upside is ${upside}. The main risk is ${downside}. ${scheduleSentence}`;
  }

  function showPlayer(playerId) {
    state.selectedPlayerId = playerId;
    const availableProfileResults = latestBoardResults.length ? latestBoardResults : currentResults();
    const result = availableProfileResults.find((item) => item.player.id === playerId);
    if (!latestMacroResults.length) latestMacroResults = macroResults();
    const profileResult = result || latestMacroResults.find((item) => item.player.id === playerId);
    const modelScopePool = result ? availableProfileResults : latestMacroResults;
    const player = playerById.get(playerId);
    if (!player) return;
    const playerContext = context.playerContext(player);
    const content = byId("player-dialog-content");
    content.replaceChildren();
    const heading = element("div", "dialog-player-heading");
    const status = player.isRookie ? " · Rookie" : "";
    const sourceSummary = player.espnOverallRank
      ? player.ecrRank ? `ESPN ${player.rank} · FantasyPros ECR ${player.ecrRank}` : `ESPN PPR rank ${player.rank}`
      : `Local watch-list rank ${player.rank} · Athlon rookie ${player.position}${player.rookiePositionRank}`;
    const sourceLine = element("p", "player-subline", sourceSummary);
    decorateMetric(sourceLine, "baseline", `Baseline #${player.rank} overall · ${player.position}${player.positionRank}`);
    const profileWatchButton = element("button", `profile-watchlist-toggle${isWatchlisted(player.id) ? " active" : ""}`, isWatchlisted(player.id) ? "★ Watchlisted" : "☆ Add to watchlist");
    profileWatchButton.type = "button";
    profileWatchButton.setAttribute("aria-pressed", String(isWatchlisted(player.id)));
    profileWatchButton.addEventListener("click", () => {
      const active = toggleWatchlist(player.id);
      profileWatchButton.classList.toggle("active", active);
      profileWatchButton.textContent = active ? "★ Watchlisted" : "☆ Add to watchlist";
      profileWatchButton.setAttribute("aria-pressed", String(active));
    });
    append(heading, element("p", "eyebrow", `${player.position}${player.positionRank} · ${player.team} · Tier ${player.tier}${status}`), element("h2", "", player.name), sourceLine, profileWatchButton);
    content.appendChild(heading);
    const metrics = element("div", "dialog-metrics");
    const modelValue = profileResult?.recommendationScore;
    const modelScope = Number.isFinite(modelValue) ? resultMetricScope(player, modelValue, modelScopePool, (candidate) => candidate.recommendationScore) : "";
    const adp = player.ecrRank ? player.ecrRank + player.ecrVsAdp : null;
    const profileComparison = profileResult ? comparisonFor(profileResult) : null;
    const comparisonSource = activeComparisonSource();
    const metricValues = [
      { label: `Vs ${comparisonSource.shortName}`, value: profileComparison?.label || "N/A", metricKey: "modelEdge", scope: profileComparison && Number.isFinite(profileComparison.rank) ? `Model #${profileResult.modelRank} / ${comparisonSource.shortName} #${formatExternalRank(profileComparison.rank)}` : "No verified comparison rank", detail: comparisonSource.format },
      { label: "Model grade", value: Number.isFinite(modelValue) ? modelValue : "—", metricKey: "model", scope: modelScope, detail: Number.isFinite(modelValue) ? `${scoreLabel(modelValue)} · ${result ? "current draft context" : "pre-draft macro grade"}` : "No active grade" },
      { label: "ECR vs ADP", value: player.ecrRank ? `${player.ecrVsAdp > 0 ? "+" : ""}${player.ecrVsAdp}` : "N/A", metricKey: "market", scope: player.ecrRank ? `ECR ${player.ecrRank} · ADP ${adp}` : "", detail: player.ecrVsAdp > 0 ? "Experts earlier" : player.ecrVsAdp < 0 ? "Market earlier" : "Market aligned" },
      { label: "Source", value: player.rankingSource, metricKey: "source", scope: "Local read-only snapshot", detail: "Baseline provenance" },
      { label: "Coverage", value: profileResult ? `${Math.round(profileResult.coverage)}%` : "—", metricKey: "coverage", scope: profileResult ? `${profileResult.activeSignalCount}/6 signals active` : "", detail: "Data completeness" }
    ];
    metricValues.forEach(({ label, value, metricKey, scope, detail }) => {
      const card = element("div", "dialog-metric");
      append(card, element("span", "", label), element("strong", "", value));
      appendMetricScope(card, scope);
      card.appendChild(element("small", "metric-detail", detail));
      decorateMetric(card, metricKey, scope, detail, true);
      metrics.appendChild(card);
    });
    content.appendChild(metrics);
    const quickSummary = element("section", "player-summary-card");
    append(quickSummary, element("div", "summary-label", "Quick decision summary"), element("p", "", playerQuickSummary(player, playerContext, profileResult)));
    content.appendChild(quickSummary);
    if (playerContext?.projection) {
      const projection = element("section", "dialog-section context-panel");
      const projectionGrid = element("div", "projection-grid");
      const projected = playerContext.projection;
      const volume = player.position === "QB" ? `${projected.passAttempts} att · ${projected.carries} rush` : `${projected.carries} car · ${projected.targets} tgt`;
      const projectionScope = playerMetricScope(player, projected.points, (candidate) => context.playerContext(candidate)?.projection?.points, true, "projection-points");
      const opportunityScope = playerMetricScope(player, playerContext.opportunity, (candidate) => context.playerContext(candidate)?.opportunity, true, "opportunity");
      const durabilityScope = playerMetricScope(player, playerContext.durability.score, (candidate) => context.playerContext(candidate)?.durability?.score, true, "durability");
      addContextMetric(projectionGrid, "Half-PPR points", projected.points, `${(projected.points / Math.max(projected.games, 1)).toFixed(1)} per game`, { metricKey: "projection", scope: projectionScope });
      addContextMetric(projectionGrid, "Position rank", `${player.position}${projected.positionRank}`, "Projected finish", { metricKey: "positionRank", scope: `#${projected.positionRank} projected ${player.position}` });
      addContextMetric(projectionGrid, "Opportunity grade", playerContext.opportunity, `${scoreLabel(playerContext.opportunity)} · ${volume}`, { metricKey: "opportunity", scope: opportunityScope, isGrade: true });
      addContextMetric(projectionGrid, "Durability grade", playerContext.durability.score, `${scoreLabel(playerContext.durability.score)} · ${playerContext.durability.confidence} confidence`, { metricKey: "durability", scope: durabilityScope, isGrade: true });
      append(projection, element("h3", "", "2026 projection and role"), projectionGrid);
      content.appendChild(projection);
    }
    if (playerContext?.team) {
      const environment = element("section", "dialog-section context-panel");
      const environmentGrid = element("div", "environment-grid");
      const offenseScope = teamMetricScope(player, playerContext.team.offenseQuality, (details) => details?.team?.offenseQuality, "NFL offenses", false, true, "offense-quality");
      const lineScope = teamMetricScope(player, playerContext.team.offensiveLine, (details) => details?.team?.offensiveLine, "NFL offensive lines", false, true, "offensive-line");
      const tendencyScope = teamMetricScope(player, playerContext.team.passTendency, (details) => details?.team?.passTendency, "most pass-heavy", false, true, "pass-tendency");
      const paceScope = teamMetricScope(player, playerContext.team.pace, (details) => details?.team?.pace, "fastest pace grades", false, true, "pace-grade");
      const castScope = teamMetricScope(player, playerContext.supportingCast, (details) => details?.supportingCast, `${player.position} supporting casts`, true, true, "supporting-cast");
      addContextMetric(environmentGrid, "Offense grade", playerContext.team.offenseQuality, `${scoreLabel(playerContext.team.offenseQuality)} · ${playerContext.team.projectedPoints ?? "—"} projected points`, { metricKey: "offense", scope: offenseScope, isGrade: true });
      addContextMetric(environmentGrid, "Offensive-line grade", playerContext.team.offensiveLine, scoreLabel(playerContext.team.offensiveLine), { metricKey: "offensiveLine", scope: lineScope, isGrade: true });
      addContextMetric(environmentGrid, "Pass tendency", playerContext.team.passTendency, "Projected/prior blend", { metricKey: "passTendency", scope: tendencyScope, displayValue: `${Math.round(playerContext.team.passTendency)}%` });
      addContextMetric(environmentGrid, "Pace grade", playerContext.team.pace, `${scoreLabel(playerContext.team.pace)} · ${playerContext.team.playsPerGame ? `${playerContext.team.playsPerGame} plays/game in 2025` : "2025 baseline"}`, { metricKey: "paceGrade", scope: paceScope, isGrade: true });
      addContextMetric(environmentGrid, "Supporting-cast grade", playerContext.supportingCast, scoreLabel(playerContext.supportingCast), { metricKey: "supportingCast", scope: castScope, isGrade: true });
      append(environment, element("h3", "", `${player.team} team environment`), environmentGrid, element("p", "context-footnote", "Forward-looking ESPN/Mike Clay grades lead each score; Sharp efficiency, pace, and tendency data are labeled 2025 baselines."));
      content.appendChild(environment);
    }
    if (playerContext) {
      const advanced = element("section", "dialog-section context-panel");
      const advancedGrid = element("div", "advanced-grid");
      const projected = playerContext.projection;
      const roleLine = player.position === "QB"
        ? projected ? `${projected.passAttempts} pass att · ${projected.carries} rush` : "No matched projection"
        : projected ? `${projected.carries} carries · ${projected.targets} targets` : "No matched projection";
      const shareLine = projected ? `${projected.carryShare}% carry · ${projected.targetShare}% target` : "—";
      addContextMetric(advancedGrid, "Projected role", roleLine, shareLine, { metricKey: "projectedRole" });
      addContextMetric(advancedGrid, "Age", playerContext.durability?.age ? playerContext.durability.age.toFixed(1) : "—", playerContext.durability?.draftYear ? `Drafted ${playerContext.durability.draftYear}` : "No age match", { metricKey: "age" });
      const projectedPointsScope = Number.isFinite(playerContext.team?.projectedPoints) ? teamMetricScope(player, playerContext.team.projectedPoints, (details) => details?.team?.projectedPoints, "NFL scoring projections", false, true, "projected-team-points") : "";
      const epaScope = Number.isFinite(playerContext.team?.historicalEpaPerPlay) ? teamMetricScope(player, playerContext.team.historicalEpaPerPlay, (details) => details?.team?.historicalEpaPerPlay, "NFL offenses by EPA/play", false, true, "historical-epa") : "";
      const rawPaceScope = Number.isFinite(playerContext.team?.playsPerGame) ? teamMetricScope(player, playerContext.team.playsPerGame, (details) => details?.team?.playsPerGame, "NFL teams by plays/game", false, true, "plays-per-game") : "";
      addContextMetric(advancedGrid, "Projected team points", playerContext.team?.projectedPoints ?? "—", playerContext.team?.projectedWins ? `${playerContext.team.projectedWins} projected wins` : "Projected scoring", { metricKey: "projectedTeamPoints", scope: projectedPointsScope, displayValue: Number.isFinite(playerContext.team?.projectedPoints) ? `${playerContext.team.projectedPoints} pts` : "—" });
      addContextMetric(advancedGrid, "2025 EPA/play", Number.isFinite(playerContext.team?.historicalEpaPerPlay) ? playerContext.team.historicalEpaPerPlay.toFixed(2) : "—", "Historical baseline", { metricKey: "epa", scope: epaScope });
      addContextMetric(advancedGrid, "2025 pace", playerContext.team?.playsPerGame ?? "—", playerContext.team?.secondsPerPlay ? `${playerContext.team.secondsPerPlay}s per play` : "Historical baseline", { metricKey: "paceRaw", scope: rawPaceScope, displayValue: Number.isFinite(playerContext.team?.playsPerGame) ? `${playerContext.team.playsPerGame}/game` : "—" });
      const advancedTendencyScope = Number.isFinite(playerContext.team?.passTendency) ? teamMetricScope(player, playerContext.team.passTendency, (details) => details?.team?.passTendency, "most pass-heavy", false, true, "pass-tendency") : "";
      addContextMetric(advancedGrid, "Pass tendency", playerContext.team?.passTendency ?? "—", "Projected/prior blend", { metricKey: "passTendency", scope: advancedTendencyScope, displayValue: Number.isFinite(playerContext.team?.passTendency) ? `${Math.round(playerContext.team.passTendency)}%` : "—" });
      append(advanced, element("h3", "", "Advanced profile"), advancedGrid);
      content.appendChild(advanced);
    }
    if (playerContext?.weekly?.length) {
      const schedule = element("section", "dialog-section context-panel");
      const scheduleHeader = element("div", "context-section-header");
      const scheduleScope = playerMetricScope(player, playerContext.schedule.score, (candidate) => context.playerContext(candidate)?.schedule?.score, true, "schedule");
      const scheduleSummary = element("span", "", `Regular ${Math.round(playerContext.schedule.regularScore)} · Playoffs ${Math.round(playerContext.schedule.playoffScore)}`);
      decorateMetric(scheduleSummary, "schedule", scheduleScope, "Regular covers Weeks 1–14; playoffs cover Weeks 15–17.");
      append(scheduleHeader, element("h3", "", "Week 1–17 matchup strip"), scheduleSummary);
      const strip = element("div", "matchup-strip");
      playerContext.weekly.forEach((week) => {
        const cell = element("div", `matchup-cell ${week.bye ? "bye" : week.difficulty.toLowerCase()}`);
        if (week.bye) {
          append(cell, element("span", "matchup-week", `W${week.week}`), element("strong", "", "BYE"), element("small", "", "—"));
        } else {
          append(cell, element("span", "matchup-week", `W${week.week}`), element("strong", "", week.label), element("small", "", `#${week.rank} ${week.difficulty}`));
          decorateMetric(cell, "matchup", `#${week.rank}/32 against ${player.position}`, `${week.venue}; ${week.outdoors ? "outdoors" : "indoors"}${week.travelZones ? `; ${week.travelZones} time zone${week.travelZones === 1 ? "" : "s"} traveled` : ""}`, true);
        }
        strip.appendChild(cell);
      });
      append(schedule, scheduleHeader, strip, element("p", "context-footnote", "Rank #1 is easiest. Weekly defense blends projected 2026 position-unit strength with prior-year EPA and pressure context, then applies small home/travel adjustments."));
      content.appendChild(schedule);
    }
    const interpretation = element("section", "dialog-section");
    append(interpretation, element("h3", "", "Model interpretation"), element("p", "", result ? model.recommendationReason(result) : "This player is already recorded in the draft log."));
    content.appendChild(interpretation);
    if (result) {
      const forecast = forecastFor(player);
      const prediction = element("section", "dialog-section");
      const threats = forecast.atRiskManagers.length ? forecast.atRiskManagers.map((manager) => `${manager.name} at ${formatPick(manager.overall)}`).join(", ") : "No strong manager-specific threat";
      append(prediction, element("h3", "", "Draft brain forecast"), element("p", "", `${forecast.probability}% estimated chance to reach your next selection at ${formatPick(forecast.nextPick)}.`), element("p", "", `Top pressure: ${threats}.`));
      content.appendChild(prediction);
    }
    if (player.note) {
      const note = element("section", "dialog-section");
      append(note, element("h3", "", "Reviewed context"), element("p", "", player.note));
      content.appendChild(note);
    }
    const source = element("section", "dialog-section");
    const list = element("ul");
    list.appendChild(element("li", "", player.espnOverallRank ? `ESPN August PPR rank: ${player.espnOverallRank} overall and ${player.position}${player.espnPositionRank}.` : "Outside ESPN's current Top 300; retained from the rookie watch list."));
    list.appendChild(element("li", "", player.ecrRank ? `FantasyPros ECR snapshot: ${player.ecrRank} overall.` : `Primary local source: ${player.rankingSource}.`));
    const harmonRank = comparisonEngine.rankFor("harmon", player, comparisonData.sources);
    if (harmonRank) list.appendChild(element("li", "", `Matt Harmon public PPR dissent snapshot: ${harmonRank} overall. This is shown as a WR/process lens and is not silently accuracy-weighted.`));
    list.appendChild(element("li", "", playerContext?.projection ? `Mike Clay 2026 half-PPR projection: ${playerContext.projection.points} points over ${playerContext.projection.games} games.` : "No reviewed 2026 projection matched this player; consensus-only fallback remains active."));
    list.appendChild(element("li", "", "Schedule: DraftCall 2026 position SoS plus ESPN projected defensive units. Durability: League Station availability, age curve, projected games, and workload."));
    list.appendChild(element("li", "", `Snapshot date: ${playerContext?.provenance.asOf || context.asOf}. The app makes no live network requests.`));
    append(source, element("h3", "", "Data provenance"), list);
    content.appendChild(source);
    byId("player-dialog").showModal();
  }

  function switchView(view) {
    document.querySelectorAll(".nav-button").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    document.querySelectorAll(".view").forEach((section) => {
      const active = section.id === `view-${view}`;
      section.hidden = !active;
      section.classList.toggle("active", active);
    });
    if (view === "rankings") renderRankings();
    if (view === "model") renderModel(currentResults());
    if (view === "brain") renderBrain();
    if (view === "accuracy" && !accuracyRendered) {
      renderAccuracy();
      accuracyRendered = true;
    }
  }

  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = element("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderLeagueProfile() {
    const historyPicks = leagueProfile.seasons.reduce((total, season) => total + season.picks.length, 0);
    const scoringLabel = { standard: "Standard", half: "Half PPR", ppr: "Full PPR" }[leagueProfile.league.scoring];
    byId("league-setup-banner").hidden = leagueProfile.imported;
    byId("league-profile-status").textContent = leagueProfile.imported ? "Imported locally" : "Blank profile";
    byId("league-profile-summary").textContent = leagueProfile.imported
      ? `${leagueProfile.league.name} · ${leagueProfile.league.teams} teams · ${leagueProfile.seasons.length} seasons · ${historyPicks} historical picks · ${leagueProfile.projectedKeepers.length} projected keepers.`
      : "Import a local JSON profile to add your managers, historical drafts, keeper pool, and league settings. Generic team placeholders keep the board usable before import.";
    byId("league-summary-line").textContent = `${leagueProfile.league.teams}-team · ${scoringLabel} · ${DRAFT_ROUNDS} rounds`;
    byId("draft-round-label").textContent = `${DRAFT_ROUNDS} rounds · horizontally scrollable`;
    byId("manager-history-label").textContent = leagueProfile.seasons.length ? `${leagueProfile.seasons.length} seasons · imported aliases` : "No history imported";
  }

  function handleLeagueProfileImport(file) {
    if (file.size > 5_000_000) {
      byId("league-import-status").textContent = "League profile rejected: file exceeds the 5 MB safety limit.";
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const profile = leagueProfiles.normalizeProfile({ ...parsed, imported: true });
        if (!profile.managerGroups.some((manager) => manager.id === profile.league.userManagerId)) throw new Error("Your userManagerId must match a manager ID.");
        localStorage.setItem(leagueProfiles.STORAGE_KEY, JSON.stringify(profile));
        localStorage.removeItem(`draft-room-state-v3:${profile.id}`);
        localStorage.removeItem(PRIOR_STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        byId("league-import-status").textContent = `Imported ${profile.league.name}. Reloading the private local profile…`;
        window.setTimeout(() => window.location.reload(), 250);
      } catch (error) {
        byId("league-import-status").textContent = `League profile rejected: ${error.message}`;
      }
    });
    reader.readAsText(file);
  }

  function clearLeagueProfile() {
    if (leagueProfile.imported && !window.confirm("Remove the imported league profile from this browser? Export it first if you need a backup.")) return;
    localStorage.removeItem(leagueProfiles.STORAGE_KEY);
    window.location.reload();
  }

  function handleStateImport(file) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.draftLog)) throw new Error("Missing draftLog array.");
        replaceCustomPlayers(Array.isArray(parsed.customPlayers) ? parsed.customPlayers : []);
        state.draftLog = parsed.draftLog.filter((pick) => playerById.has(pick.playerId) && typeof pick.mine === "boolean");
        if (parsed.settings) Object.assign(state.settings, parsed.settings);
        if (parsed.weights) Object.assign(state.weights, parsed.weights);
        if (parsed.metricsById && typeof parsed.metricsById === "object") state.metricsById = { ...context.metricsById, ...parsed.metricsById };
        if (Array.isArray(parsed.draftOrder)) state.draftOrder = parsed.draftOrder.slice();
        if (Array.isArray(parsed.favoritePlayerIds)) state.favoritePlayerIds = parsed.favoritePlayerIds.filter((playerId) => playerById.has(playerId));
        if (comparisonData.sources[parsed.comparisonSource]) state.comparisonSource = parsed.comparisonSource;
        if (parsed.rankingOverrides && typeof parsed.rankingOverrides === "object") state.rankingOverrides = parsed.rankingOverrides;
        populateDraftSlots();
        state.draftLog = normalizeDraftLog(state.draftLog);
        syncSettings();
        buildWeightControls();
        syncWatchlistCount();
        saveState();
        renderBoard();
        renderData();
      } catch (error) {
        byId("import-status").textContent = `State import rejected: ${error.message}`;
      }
    });
    reader.readAsText(file);
  }

  function handleMetricImport(file) {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      const parsed = model.parseMetricCsv(String(reader.result), data.players);
      state.metricsById = { ...state.metricsById, ...parsed.metricsById };
      saveState();
      const detail = parsed.errors.length ? ` ${parsed.errors.slice(0, 2).join(" ")}` : "";
      byId("import-status").textContent = `${parsed.imported} players imported.${detail}`;
      renderBoard();
    });
    reader.readAsText(file);
  }

  function syncSettings() {
    if (![...byId("league-teams").options].some((option) => Number(option.value) === Number(state.settings.teams))) {
      const option = element("option", "", `${state.settings.teams}`);
      option.value = String(state.settings.teams);
      byId("league-teams").appendChild(option);
    }
    byId("scoring-format").value = state.settings.scoring;
    byId("league-teams").value = String(state.settings.teams);
    byId("starting-qbs").value = String(state.settings.startingQbs);
    byId("draft-slot").value = String(state.settings.draftSlot);
    byId("projected-keepers").checked = Boolean(state.settings.useProjectedKeepers);
    byId("user-keeper").value = state.settings.userKeeperId || "";
    byId("user-keeper-round").value = String(state.settings.userKeeperRound || 9);
  }

  function bindEvents() {
    document.addEventListener("mouseover", (event) => {
      const target = event.target.closest("[data-metric-tooltip]");
      if (target) showMetricTooltip(target);
    });
    document.addEventListener("mouseout", (event) => {
      const target = event.target.closest("[data-metric-tooltip]");
      if (target && !target.contains(event.relatedTarget)) hideMetricTooltip();
    });
    document.addEventListener("focusin", (event) => {
      const target = event.target.closest("[data-metric-tooltip]");
      if (target) showMetricTooltip(target);
    });
    document.addEventListener("focusout", (event) => {
      if (event.target.closest("[data-metric-tooltip]")) hideMetricTooltip();
    });
    document.addEventListener("scroll", hideMetricTooltip, true);
    byId("open-custom-pick").addEventListener("click", openCustomPickDialog);
    byId("close-custom-pick").addEventListener("click", () => byId("custom-pick-dialog").close());
    byId("cancel-custom-pick").addEventListener("click", () => byId("custom-pick-dialog").close());
    byId("custom-pick-form").addEventListener("submit", (event) => { event.preventDefault(); recordCustomPick(); });
    byId("open-ranking-import").addEventListener("click", openRankingImportDialog);
    byId("close-ranking-import").addEventListener("click", () => byId("ranking-import-dialog").close());
    byId("cancel-ranking-import").addEventListener("click", () => byId("ranking-import-dialog").close());
    byId("clear-ranking-import").addEventListener("click", clearRankingImport);
    byId("ranking-import-form").addEventListener("submit", (event) => { event.preventDefault(); applyRankingImport(); });
    byId("comparison-source").addEventListener("change", (event) => setComparisonSource(event.target.value));
    byId("ranking-comparison-source").addEventListener("change", (event) => setComparisonSource(event.target.value));
    document.querySelectorAll(".nav-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
    byId("ranking-search").addEventListener("input", (event) => { state.rankingSearch = event.target.value; renderRankings(); });
    byId("ranking-sort").addEventListener("change", (event) => { state.rankingSort = event.target.value; renderRankings(); });
    document.querySelectorAll(".ranking-filter").forEach((button) => button.addEventListener("click", () => {
      state.rankingPosition = button.dataset.rankingPosition;
      document.querySelectorAll(".ranking-filter").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      renderRankings();
    }));
    byId("scoring-format").addEventListener("change", (event) => { state.settings.scoring = event.target.value; saveState(); renderBoard(); });
    byId("league-teams").addEventListener("change", (event) => {
      state.settings.teams = Number(event.target.value);
      populateDraftSlots();
      syncUserDraftSlot();
      state.draftLog = normalizeDraftLog(state.draftLog);
      saveState();
      renderBoard();
    });
    byId("draft-slot").addEventListener("change", (event) => { state.settings.draftSlot = Number(event.target.value); syncUserDraftSlot(); state.draftLog = normalizeDraftLog(state.draftLog); saveState(); renderBrain(); renderBoard(); });
    byId("starting-qbs").addEventListener("change", (event) => { state.settings.startingQbs = Number(event.target.value); saveState(); renderBoard(); });
    byId("projected-keepers").addEventListener("change", (event) => { state.settings.useProjectedKeepers = event.target.checked; state.draftLog = normalizeDraftLog(state.draftLog); saveState(); renderBoard(); });
    byId("user-keeper").addEventListener("change", (event) => {
      state.settings.userKeeperId = event.target.value;
      const player = playerById.get(event.target.value);
      const prior = player ? brain.playerHistory(player.name).find((pick) => pick.year === LATEST_HISTORY_YEAR && pick.managerId === USER_MANAGER_ID) : null;
      if (prior) state.settings.userKeeperRound = Math.max(1, prior.round - 2);
      byId("user-keeper-round").value = String(state.settings.userKeeperRound);
      state.draftLog = normalizeDraftLog(state.draftLog);
      saveState(); renderBoard();
    });
    byId("user-keeper-round").addEventListener("change", (event) => { state.settings.userKeeperRound = Number(event.target.value); state.draftLog = normalizeDraftLog(state.draftLog); saveState(); renderBoard(); });
    byId("player-search").addEventListener("input", (event) => {
      state.search = event.target.value;
      state.playerLimit = PLAYER_PAGE_SIZE;
      window.clearTimeout(playerSearchTimer);
      playerSearchTimer = window.setTimeout(() => renderPlayerRows(latestBoardResults), 70);
    });
    byId("sort-players").addEventListener("change", (event) => setBoardSort(event.target.value));
    document.querySelectorAll("button[data-board-sort]").forEach((button) => button.addEventListener("click", () => setBoardSort(button.dataset.boardSort, true)));
    document.querySelectorAll(".filter-button").forEach((button) => button.addEventListener("click", () => {
      state.filterPosition = button.dataset.position;
      state.playerLimit = PLAYER_PAGE_SIZE;
      document.querySelectorAll(".filter-button").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      renderPlayerRows(latestBoardResults);
    }));
    byId("show-more-players").addEventListener("click", () => {
      state.playerLimit += PLAYER_PAGE_SIZE;
      renderPlayerRows(latestBoardResults);
    });
    byId("player-rows").addEventListener("click", (event) => {
      const button = event.target.closest("button[data-player-action]");
      if (!button || !event.currentTarget.contains(button)) return;
      const playerId = button.closest("tr")?.dataset.playerId;
      if (!playerId) return;
      if (button.dataset.playerAction === "watchlist") toggleWatchlist(playerId);
      else if (button.dataset.playerAction === "profile") showPlayer(playerId);
      else draftPlayer(playerId, button.dataset.playerAction === "mine");
    });
    byId("undo-pick").addEventListener("click", () => {
      const removed = state.draftLog.pop();
      if (removed) removeUnusedCustomPlayer(removed.playerId);
      saveState();
      renderBoard();
    });
    byId("reset-draft").addEventListener("click", () => {
      if (!state.draftLog.length || window.confirm("Clear every recorded pick?")) { state.draftLog = []; replaceCustomPlayers([]); saveState(); renderBoard(); }
    });
    byId("reset-weights").addEventListener("click", () => { state.weights = { ...data.defaultWeights }; buildWeightControls(); saveState(); renderBoard(); });
    [byId("league-import-trigger"), byId("league-import-trigger-data")].forEach((button) => button.addEventListener("click", () => byId("league-import").click()));
    byId("league-template-download").addEventListener("click", () => downloadJson("league-profile-template.json", leagueProfiles.createTemplate()));
    byId("export-league-profile").addEventListener("click", () => downloadJson(`${leagueProfile.id}.json`, leagueProfile));
    byId("clear-league-profile").addEventListener("click", clearLeagueProfile);
    byId("league-import").addEventListener("change", (event) => { if (event.target.files[0]) handleLeagueProfileImport(event.target.files[0]); event.target.value = ""; });
    byId("export-state").addEventListener("click", () => downloadJson(`draft-room-${new Date().toISOString().slice(0, 10)}.json`, {
      version: 2, exportedAt: new Date().toISOString(), settings: state.settings, weights: state.weights, metricsById: state.metricsById, draftOrder: state.draftOrder, draftLog: state.draftLog, favoritePlayerIds: state.favoritePlayerIds, customPlayers: state.customPlayers, comparisonSource: state.comparisonSource, rankingOverrides: state.rankingOverrides
    }));
    byId("import-state").addEventListener("change", (event) => { if (event.target.files[0]) handleStateImport(event.target.files[0]); event.target.value = ""; });
    byId("metric-import").addEventListener("change", (event) => { if (event.target.files[0]) handleMetricImport(event.target.files[0]); event.target.value = ""; });
  }

  loadState();
  populateDraftSlots();
  populateKeeperControls();
  syncSettings();
  renderLeagueProfile();
  syncComparisonControls();
  syncComparisonHeadings();
  syncWatchlistCount();
  buildWeightControls();
  bindEvents();
  renderBrain();
  renderData();
  renderBoard();
})();
