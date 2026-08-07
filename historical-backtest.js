(function (root, factory) {
  "use strict";
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  if (root) root.HistoricalBacktest = value;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const expansionRegistry = Object.freeze([
    Object.freeze({ season: 2021, status: "audited top-48", requirement: "Frozen ESPN rank, league draft price and final half-PPR outcome; projections cover the original top 24" }),
    Object.freeze({ season: 2022, status: "audited top-48", requirement: "First rolling-origin test season; trained only on 2021" }),
    Object.freeze({ season: 2023, status: "audited top-48", requirement: "Rolling-origin test trained only on 2021-2022" }),
    Object.freeze({ season: 2024, status: "audited top-48", requirement: "Rolling-origin test trained only on 2021-2023" }),
    Object.freeze({ season: 2025, status: "audited pilot", requirement: "18-player first-two-round cohort; advanced critic inputs available only here" })
  ]);

  const round = (value, digits = 2) => Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
  const mean = (values) => values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);

  function validateDataset(dataset) {
    const errors = [];
    if (!dataset?.meta?.season) errors.push("Missing season metadata");
    if (!dataset?.meta?.scoring) errors.push("Missing scoring format");
    if (!dataset?.meta?.frozenAt) errors.push("Missing preseason lock date");
    if (!Array.isArray(dataset?.preseason) || !dataset.preseason.length) errors.push("Missing preseason cohort");
    if (!Array.isArray(dataset?.outcomes) || !dataset.outcomes.length) errors.push("Missing outcome cohort");
    const preseasonIds = new Set((dataset?.preseason || []).map((player) => player.id));
    const outcomeIds = new Set((dataset?.outcomes || []).map((player) => player.id));
    if (preseasonIds.size !== (dataset?.preseason || []).length) errors.push("Duplicate preseason player IDs");
    if (outcomeIds.size !== (dataset?.outcomes || []).length) errors.push("Duplicate outcome player IDs");
    if ([...preseasonIds].some((id) => !outcomeIds.has(id))) errors.push("Preseason players are missing outcomes");
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors) });
  }

  function weightedMean(results, selector, countSelector = (result) => result.playerCount) {
    const eligible = results.filter((result) => Number.isFinite(selector(result)) && countSelector(result) > 0);
    const denominator = eligible.reduce((total, result) => total + countSelector(result), 0);
    return denominator ? eligible.reduce((total, result) => total + selector(result) * countSelector(result), 0) / denominator : null;
  }

  function draftOrder(rounds) {
    return Array.from({ length: rounds }, (_, roundIndex) => roundIndex % 2 === 0
      ? Array.from({ length: 12 }, (value, index) => index + 1)
      : Array.from({ length: 12 }, (value, index) => 12 - index)).flat();
  }

  function rosterAdjustedRank(row, selector, roster, roundNumber) {
    let rank = selector(row);
    const position = row.player.position;
    const positionCount = roster.filter((pick) => pick.player.position === position).length;
    const rbWrCount = roster.filter((pick) => pick.player.position === "RB" || pick.player.position === "WR").length;
    if ((position === "QB" || position === "TE") && positionCount) rank += 1000;
    if (roundNumber === 4 && rbWrCount < 3 && position !== "RB" && position !== "WR") rank += 500;
    return rank;
  }

  function simulateRosterAwareUtility(rows, rankSelector, rounds = 4) {
    if (rows.length < rounds * 12) return null;
    function runSlot(userSlot, selector) {
      const available = rows.slice();
      const roster = [];
      draftOrder(rounds).forEach((team, pickIndex) => {
        const roundNumber = Math.floor(pickIndex / 12) + 1;
        const selected = available.slice().sort((left, right) => {
          const leftRank = team === userSlot ? rosterAdjustedRank(left, selector, roster, roundNumber) : left.player.marketRank;
          const rightRank = team === userSlot ? rosterAdjustedRank(right, selector, roster, roundNumber) : right.player.marketRank;
          return leftRank - rightRank || left.player.marketRank - right.player.marketRank;
        })[0];
        available.splice(available.indexOf(selected), 1);
        if (team === userSlot) roster.push(selected);
      });
      return { points: roster.reduce((total, row) => total + row.halfPprPoints, 0), roster };
    }

    const slotResults = Array.from({ length: 12 }, (_, index) => {
      const slot = index + 1;
      const baseline = runSlot(slot, (row) => row.player.marketRank);
      const model = runSlot(slot, rankSelector);
      return Object.freeze({
        slot,
        baselinePoints: round(baseline.points, 1),
        modelPoints: round(model.points, 1),
        lift: round(model.points - baseline.points, 1),
        modelRoster: Object.freeze(model.roster.map((row) => row.player.id))
      });
    });
    return Object.freeze({
      rounds,
      averageLift: round(mean(slotResults.map((result) => result.lift)), 1),
      positiveSlotRate: Math.round(slotResults.filter((result) => result.lift > 0).length / slotResults.length * 100),
      slots: Object.freeze(slotResults)
    });
  }

  function simulateTwoRoundUtility(rows, rankSelector) {
    return simulateRosterAwareUtility(rows, rankSelector, 2);
  }

  function calibrateRankBands(trainingGroups, targetCoverage = 0.8) {
    const requiredMultipliers = trainingGroups.flatMap((rows) => rows.map((row) => Math.abs(row.finalRank - row.outcomeRank) / Math.max(row.uncertaintyBand, 1))).sort((left, right) => left - right);
    const targetIndex = Math.max(0, Math.ceil(requiredMultipliers.length * targetCoverage) - 1);
    return Math.max(1, Math.ceil((requiredMultipliers[targetIndex] || 1) * 4) / 4);
  }

  function evaluateCalibratedBands(rows, multiplier) {
    const bands = rows.map((row) => Math.max(2, Math.ceil(row.uncertaintyBand * multiplier)));
    const hits = rows.filter((row, index) => Math.abs(row.rank - row.outcomeRank) <= bands[index]).length;
    return Object.freeze({ multiplier, coverage: Math.round(hits / Math.max(rows.length, 1) * 100), meanRankBand: round(mean(bands)) });
  }

  function combinePositionRankings(rows, trainingGroups, engine, fallbackWeights) {
    const positions = [...new Set(rows.map((row) => row.player.position))];
    const ranked = [];
    const models = [];
    positions.forEach((position) => {
      const positionTrainingGroups = trainingGroups.map((group) => group.filter((row) => row.player.position === position && Number.isFinite(row.outcomePositionRank))).filter((group) => group.length >= 2);
      const trainingCount = positionTrainingGroups.reduce((total, group) => total + group.length, 0);
      const supported = positionTrainingGroups.length >= 2 && trainingCount >= 12;
      const weights = supported ? engine.optimizeWeightsByGroups(positionTrainingGroups, [-3, -2, -1, 0, 1, 2, 3], "outcomePositionRank").weights : fallbackWeights;
      engine.weightedRanking(rows.filter((row) => row.player.position === position), weights).forEach((row) => ranked.push(row));
      models.push(Object.freeze({ position, supported, trainingSeasons: positionTrainingGroups.length, trainingCount, weights: Object.freeze({ ...weights }) }));
    });
    const ranking = ranked.sort((left, right) => right.score - left.score || left.initialRank - right.initialRank).map((row, index) => ({ ...row, rank: index + 1 }));
    return Object.freeze({ ranking: Object.freeze(ranking), models: Object.freeze(models), metrics: Object.freeze(engine.rankingMetrics(ranking, "outcomeRank")) });
  }

  function rowCoverage(dataset, criticId) {
    const available = dataset.preseason.filter((player) => {
      if (criticId === "projection") return player.projectionAvailable !== false && Number.isFinite(player.projectedVor);
      if (criticId === "signals") return player.signalAvailable !== false;
      if (criticId === "team") return player.teamContextAvailable !== false;
      return true;
    }).length;
    return available / Math.max(dataset.preseason.length, 1);
  }

  function runPortfolio(datasets, engine) {
    const seasons = new Set();
    const ordered = datasets.slice().sort((left, right) => left.meta.season - right.meta.season);
    const audited = ordered.map((dataset) => {
      const validation = validateDataset(dataset);
      if (!validation.valid) throw new Error(`Invalid ${dataset?.meta?.season || "unknown"} dataset: ${validation.errors.join("; ")}`);
      if (seasons.has(dataset.meta.season)) throw new Error(`Duplicate season ${dataset.meta.season}`);
      seasons.add(dataset.meta.season);
      return Object.freeze({ dataset, run: engine.run(dataset) });
    });

    const rolling = [];
    for (let index = 1; index < audited.length; index += 1) {
      const trainingGroups = audited.slice(0, index).map((entry) => entry.run.evaluation.rows);
      const optimized = engine.optimizeWeightsByGroups(trainingGroups, [-3, -2, -1, 0, 1, 2, 3], "outcomeRank");
      const testEntry = audited[index];
      const ranking = engine.weightedRanking(testEntry.run.evaluation.rows, optimized.weights);
      const metrics = engine.rankingMetrics(ranking, "outcomeRank");
      const positionSpecific = combinePositionRankings(testEntry.run.evaluation.rows, trainingGroups, engine, optimized.weights);
      const baselineMetrics = { mae: testEntry.run.evaluation.metrics.initialMae, spearman: testEntry.run.evaluation.metrics.initialSpearman };
      const utility = simulateRosterAwareUtility(positionSpecific.ranking, (row) => row.rank);
      const interval = evaluateCalibratedBands(positionSpecific.ranking, calibrateRankBands(trainingGroups));
      rolling.push(Object.freeze({
        season: testEntry.dataset.meta.season,
        trainingSeasons: Object.freeze(audited.slice(0, index).map((entry) => entry.dataset.meta.season)),
        playerCount: ranking.length,
        weights: Object.freeze({ ...optimized.weights }),
        ranking: Object.freeze(ranking),
        metrics: Object.freeze(metrics),
        positionSpecific,
        baselineMetrics: Object.freeze(baselineMetrics),
        interval,
        utility
      }));
    }

    const results = audited.map((entry) => {
      const metrics = entry.run.evaluation.metrics;
      const rollingResult = rolling.find((result) => result.season === entry.dataset.meta.season);
      return Object.freeze({
        season: entry.dataset.meta.season,
        playerCount: metrics.playerCount,
        baselineMae: metrics.initialMae,
        baselineSpearman: metrics.initialSpearman,
        specialistMae: metrics.finalMae,
        specialistSpearman: metrics.finalSpearman,
        pointMae: metrics.pointMae,
        pointRmse: metrics.pointRmse,
        pointBias: metrics.pointBias,
        projectedPlayerCount: metrics.projectedPlayerCount,
        ppgMae: metrics.ppgMae,
        ppgSpearman: metrics.ppgSpearman,
        availabilityMae: metrics.availabilityMae,
        availabilityBias: metrics.availabilityBias,
        performanceMae: metrics.performanceMae,
        performanceBias: metrics.performanceBias,
        decompositionPlayerCount: metrics.decompositionPlayerCount,
        positionMae: metrics.finalPositionMae,
        positionSpearman: metrics.finalPositionSpearman,
        intervalCoverage: metrics.intervalCoverage,
        meanRankBand: metrics.meanRankBand,
        rollingMae: rollingResult?.metrics.mae ?? null,
        rollingSpearman: rollingResult?.metrics.spearman ?? null,
        positionModelMae: rollingResult?.positionSpecific.metrics.mae ?? null,
        positionModelSpearman: rollingResult?.positionSpecific.metrics.spearman ?? null,
        rollingIntervalCoverage: rollingResult?.interval.coverage ?? null,
        rollingMeanRankBand: rollingResult?.interval.meanRankBand ?? null,
        rollingUtilityLift: rollingResult?.utility?.averageLift ?? null
      });
    });

    const rollingSeasonRows = rolling.map((result) => ({
      playerCount: result.playerCount,
      baselineMae: result.baselineMetrics.mae,
      baselineSpearman: result.baselineMetrics.spearman,
      rollingMae: result.metrics.mae,
      rollingSpearman: result.metrics.spearman,
      positionModelMae: result.positionSpecific.metrics.mae,
      positionModelSpearman: result.positionSpecific.metrics.spearman,
      intervalCoverage: result.interval.coverage,
      meanRankBand: result.interval.meanRankBand,
      utilityLift: result.utility?.averageLift ?? null
    }));
    const utilityRows = rollingSeasonRows.filter((result) => result.utilityLift !== null);
    const playerCount = results.reduce((total, result) => total + result.playerCount, 0);
    const coverageIds = ["projection", "signals", "team"];
    const criticCoverage = Object.fromEntries(coverageIds.map((id) => [id, Math.round(weightedMean(ordered.map((dataset) => ({ dataset, playerCount: dataset.preseason.length, coverage: rowCoverage(dataset, id) * 100 })), (result) => result.coverage))]));
    const criticCoverageSeasons = Object.fromEntries(coverageIds.map((id) => [id, ordered.filter((dataset) => rowCoverage(dataset, id) >= 0.8).length]));
    const metrics = Object.freeze({
      seasonCount: results.length,
      playerCount,
      baselineMae: round(weightedMean(results, (result) => result.baselineMae)),
      specialistMae: round(weightedMean(results, (result) => result.specialistMae)),
      baselineSpearman: round(weightedMean(results, (result) => result.baselineSpearman), 3),
      specialistSpearman: round(weightedMean(results, (result) => result.specialistSpearman), 3),
      pointMae: round(weightedMean(results, (result) => result.pointMae, (result) => result.projectedPlayerCount)),
      pointRmse: round(weightedMean(results, (result) => result.pointRmse, (result) => result.projectedPlayerCount)),
      pointBias: round(weightedMean(results, (result) => result.pointBias, (result) => result.projectedPlayerCount)),
      projectedPlayerCount: results.reduce((total, result) => total + result.projectedPlayerCount, 0),
      ppgMae: round(weightedMean(results, (result) => result.ppgMae)),
      ppgSpearman: round(weightedMean(results, (result) => result.ppgSpearman), 3),
      availabilityMae: round(weightedMean(results, (result) => result.availabilityMae, (result) => result.decompositionPlayerCount)),
      availabilityBias: round(weightedMean(results, (result) => result.availabilityBias, (result) => result.decompositionPlayerCount)),
      performanceMae: round(weightedMean(results, (result) => result.performanceMae, (result) => result.decompositionPlayerCount)),
      performanceBias: round(weightedMean(results, (result) => result.performanceBias, (result) => result.decompositionPlayerCount)),
      decompositionPlayerCount: results.reduce((total, result) => total + result.decompositionPlayerCount, 0),
      positionMae: round(weightedMean(results, (result) => result.positionMae)),
      positionSpearman: round(weightedMean(results, (result) => result.positionSpearman), 3),
      intervalCoverage: Math.round(weightedMean(results, (result) => result.intervalCoverage)),
      meanRankBand: round(weightedMean(results, (result) => result.meanRankBand)),
      rollingSeasonCount: rollingSeasonRows.length,
      rollingBaselineMae: rollingSeasonRows.length ? round(weightedMean(rollingSeasonRows, (result) => result.baselineMae)) : null,
      rollingOriginMae: rollingSeasonRows.length ? round(weightedMean(rollingSeasonRows, (result) => result.rollingMae)) : null,
      rollingBaselineSpearman: rollingSeasonRows.length ? round(weightedMean(rollingSeasonRows, (result) => result.baselineSpearman), 3) : null,
      rollingOriginSpearman: rollingSeasonRows.length ? round(weightedMean(rollingSeasonRows, (result) => result.rollingSpearman), 3) : null,
      positionModelMae: rollingSeasonRows.length ? round(weightedMean(rollingSeasonRows, (result) => result.positionModelMae)) : null,
      positionModelSpearman: rollingSeasonRows.length ? round(weightedMean(rollingSeasonRows, (result) => result.positionModelSpearman), 3) : null,
      rollingIntervalCoverage: rollingSeasonRows.length ? Math.round(weightedMean(rollingSeasonRows, (result) => result.intervalCoverage)) : null,
      rollingMeanRankBand: rollingSeasonRows.length ? round(weightedMean(rollingSeasonRows, (result) => result.meanRankBand)) : null,
      rollingUtilityLift: utilityRows.length ? round(weightedMean(utilityRows, (result) => result.utilityLift), 1) : null,
      heldoutMae: rollingSeasonRows.length ? round(weightedMean(rollingSeasonRows, (result) => result.positionModelMae)) : null,
      heldoutSpearman: rollingSeasonRows.length ? round(weightedMean(rollingSeasonRows, (result) => result.positionModelSpearman), 3) : null,
      criticCoverage: Object.freeze(criticCoverage),
      criticCoverageSeasons: Object.freeze(criticCoverageSeasons)
    });
    const coverageValue = coverageIds.map((id) => `${id} ${criticCoverage[id]}% / ${criticCoverageSeasons[id]} seasons`).join(" · ");
    const gates = Object.freeze([
      Object.freeze({ id: "seasons", label: "At least three frozen seasons", passed: metrics.seasonCount >= 3, value: `${metrics.seasonCount}/3` }),
      Object.freeze({ id: "sample", label: "At least 200 player-seasons", passed: metrics.playerCount >= 200, value: `${metrics.playerCount}/200` }),
      Object.freeze({ id: "mae", label: "Position models improve MAE by at least 2%", passed: metrics.positionModelMae !== null && metrics.positionModelMae <= metrics.rollingBaselineMae * 0.98, value: metrics.positionModelMae === null ? "No test season" : `${metrics.positionModelMae} vs ${metrics.rollingBaselineMae}` }),
      Object.freeze({ id: "correlation", label: "Position models add at least 0.02 correlation", passed: metrics.positionModelSpearman !== null && metrics.positionModelSpearman >= metrics.rollingBaselineSpearman + 0.02, value: metrics.positionModelSpearman === null ? "No test season" : `${metrics.positionModelSpearman} vs ${metrics.rollingBaselineSpearman}` }),
      Object.freeze({ id: "interval", label: "Intervals cover 70-90% without exceeding ±12 ranks", passed: metrics.rollingIntervalCoverage >= 70 && metrics.rollingIntervalCoverage <= 90 && metrics.rollingMeanRankBand <= 12, value: metrics.rollingIntervalCoverage === null ? "No test season" : `${metrics.rollingIntervalCoverage}% at ±${metrics.rollingMeanRankBand}` }),
      Object.freeze({ id: "coverage", label: "Each mean-rank critic has 80% coverage in three seasons", passed: coverageIds.every((id) => criticCoverageSeasons[id] >= 3), value: coverageValue })
    ]);
    return Object.freeze({ seasons: Object.freeze(results), rolling: Object.freeze(rolling), metrics, gates, promoted: gates.every((gate) => gate.passed) });
  }

  return Object.freeze({ expansionRegistry, validateDataset, simulateTwoRoundUtility, simulateRosterAwareUtility, calibrateRankBands, evaluateCalibratedBands, combinePositionRankings, runPortfolio });
});
