(function (root, factory) {
  "use strict";
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  if (root) root.HistoricalRoundtable = value;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const round = (value, digits = 2) => Number(value.toFixed(digits));
  const mean = (values) => values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
  const rmse = (values) => Math.sqrt(mean(values.map((value) => value ** 2)));

  const critics = Object.freeze([
    Object.freeze({
      id: "projection",
      name: "Projection / VOR Modeler",
      personality: "Replacement-value forecaster",
      focus: "Scoring-format projections and points above a 12-team replacement baseline",
      review(player, context) {
        if (player.projectionAvailable === false || !Number.isFinite(player.projectionRank) || !Number.isFinite(player.projectedVor)) return {
          adjustment: 0,
          confidence: 0,
          unavailable: true,
          reason: "No frozen projection was available for this player, so the projection critic abstains."
        };
        const gap = context.rank - player.projectionRank;
        const cap = context.pass === 1 ? 3 : 1.25;
        return {
          adjustment: round(clamp(gap * (context.pass === 1 ? 0.28 : 0.11), -cap, cap)),
          confidence: Math.round(clamp(72 + Math.abs(player.projectedVor) * 0.11, 72, 94)),
          reason: gap > 1 ? "The scoring-format projection and replacement value support an earlier selection." : gap < -1 ? "The current price exceeds the player's projected replacement-value edge." : "Projected points and VOR support the current neighborhood."
        };
      }
    }),
    Object.freeze({
      id: "signals",
      name: "Player Signal Scout",
      personality: "Film-and-metrics talent evaluator",
      focus: "Target earning, efficiency, workload and role quality",
      review(player, context) {
        if (player.signalAvailable === false) return {
          adjustment: 0,
          confidence: 0,
          unavailable: true,
          reason: "No frozen, repeatable player-signal dataset was available, so this critic abstains."
        };
        const signal = player.playerSignal * 0.58 + player.opportunity * 0.42;
        const scale = context.pass === 1 ? 0.14 : 0.055;
        return {
          adjustment: round(clamp((signal - 91) * scale, context.pass === 1 ? -2.25 : -0.9, context.pass === 1 ? 2.25 : 0.9)),
          confidence: Math.round(clamp(55 + signal * 0.4, 60, 96)),
          reason: signal >= 95 ? "Elite player-level evidence supports an aggressive rank." : signal < 88 ? "The talent or workload case is thinner than the price implies." : "Player-level evidence broadly confirms the current range."
        };
      }
    }),
    Object.freeze({
      id: "team",
      name: "Team Ecosystem Analyst",
      personality: "Projection-room systems thinker",
      focus: "Offense quality, line play, pace, coaching and touchdown environment",
      review(player, context) {
        if (player.teamContextAvailable === false) return {
          adjustment: 0,
          confidence: 0,
          unavailable: true,
          reason: "No frozen, repeatable team-context dataset was available, so this critic abstains."
        };
        const scale = context.pass === 1 ? 0.105 : 0.04;
        return {
          adjustment: round(clamp((player.teamContext - 82) * scale, context.pass === 1 ? -2 : -0.75, context.pass === 1 ? 2 : 0.75)),
          confidence: Math.round(clamp(62 + Math.abs(player.teamContext - 50) * 0.55, 62, 91)),
          reason: player.teamContext >= 90 ? "Elite scoring conditions raise the ceiling and touchdown expectation." : player.teamContext < 70 ? "A weak projected offense creates volume and touchdown friction." : "The team environment is not strong enough to force a major change."
        };
      }
    }),
    Object.freeze({
      id: "uncertainty",
      name: "Uncertainty Calibration Specialist",
      personality: "Forecast-range and tail-risk auditor",
      focus: "Injury, role ambiguity, age curves and confidence-interval calibration",
      optimizable: false,
      review(player) {
        const durabilityPenalty = player.durabilityAvailable === false || !Number.isFinite(player.durability) ? 0 : (100 - player.durability) / 18;
        const rankBand = Math.round(clamp(1.5 + player.uncertainty / 8 + durabilityPenalty, 2, 10));
        return {
          adjustment: 0,
          rankBand,
          confidence: Math.round(clamp(96 - player.uncertainty * 0.7 - durabilityPenalty * 4.5, 48, 94)),
          reason: rankBand >= 7 ? "The mean rank stays intact, but the plausible outcome range must remain wide." : rankBand <= 3 ? "Stable role and availability evidence support a relatively narrow rank range." : "Material uncertainty is represented as a wider interval, not a hidden mean-rank penalty."
        };
      }
    })
  ]);

  const optimizableCritics = Object.freeze(critics.filter((critic) => critic.optimizable !== false));
  const allowedPreseasonKeys = Object.freeze(["id", "name", "position", "team", "marketRank", "expertRank", "playerSignal", "opportunity", "teamContext", "signalAvailable", "teamContextAvailable", "projectionAvailable", "durabilityAvailable", "durability", "uncertainty", "projectedGames", "projectedPprPoints", "projectedReceptions", "projectedHalfPprPoints", "projectedVor", "evidence"]);

  function sanitizePreseason(players) {
    return players.map((player) => Object.freeze(Object.fromEntries(allowedPreseasonKeys.map((key) => [key, player[key]]))));
  }

  function withProjectionRanks(players) {
    const projectionRankById = new Map(players.filter((player) => player.projectionAvailable !== false && Number.isFinite(player.projectedVor)).sort((left, right) => right.projectedVor - left.projectedVor || left.marketRank - right.marketRank).map((player, index) => [player.id, index + 1]));
    return players.map((player) => Object.freeze({ ...player, projectionRank: projectionRankById.get(player.id) }));
  }

  function rankRows(rows) {
    return rows.slice().sort((left, right) => right.score - left.score || left.player.marketRank - right.player.marketRank || left.player.name.localeCompare(right.player.name)).map((row, index) => ({ ...row, rank: index + 1 }));
  }

  function initialRows(players) {
    const cohortSize = players.length;
    return rankRows(players.map((player) => {
      const consensusRank = mean([player.marketRank, player.expertRank]);
      const consensusScore = 100 - ((consensusRank - 1) / Math.max(cohortSize * 1.5, 1)) * 42;
      return { player, score: round(consensusScore), critiques: [], uncertaintyBand: 0 };
    }));
  }

  function applyPass(rows, pass) {
    const reviewed = rows.map((row) => {
      const critiques = critics.map((critic) => ({ criticId: critic.id, ...critic.review(row.player, { pass, rank: row.rank, score: row.score, priorCritiques: row.critiques }) }));
      const adjustment = critiques.reduce((total, critique) => total + critique.adjustment, 0);
      const uncertaintyReview = critiques.find((critique) => critique.criticId === "uncertainty");
      return { ...row, score: round(row.score + adjustment), uncertaintyBand: uncertaintyReview?.rankBand || row.uncertaintyBand, critiques: row.critiques.concat(Object.freeze({ pass, reviews: Object.freeze(critiques) })) };
    });
    return rankRows(reviewed);
  }

  function generateRanking(preseasonPlayers) {
    const players = withProjectionRanks(sanitizePreseason(preseasonPlayers));
    const initial = initialRows(players);
    const passOne = applyPass(initial, 1);
    const passTwo = applyPass(passOne, 2);
    const initialRankById = new Map(initial.map((row) => [row.player.id, row.rank]));
    const passOneRankById = new Map(passOne.map((row) => [row.player.id, row.rank]));
    return Object.freeze({
      locked: true,
      passCount: 2,
      baseline: "Market rank and independent expert rank blended equally",
      critics,
      ranking: Object.freeze(passTwo.map((row) => Object.freeze({ ...row, initialRank: initialRankById.get(row.player.id), passOneRank: passOneRankById.get(row.player.id), finalRank: row.rank })))
    });
  }

  function spearman(predicted, actual) {
    const count = predicted.length;
    if (count < 2) return 1;
    const squared = predicted.reduce((total, value, index) => total + ((value - actual[index]) ** 2), 0);
    return 1 - (6 * squared) / (count * ((count ** 2) - 1));
  }

  function positionRankMaps(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      if (!groups.has(row.player.position)) groups.set(row.player.position, []);
      groups.get(row.player.position).push(row);
    });
    const initial = new Map();
    const final = new Map();
    const outcome = new Map();
    const eligible = new Set();
    groups.forEach((group) => {
      if (group.length < 2) return;
      group.forEach((row) => eligible.add(row.player.id));
      group.slice().sort((left, right) => left.initialRank - right.initialRank).forEach((row, index) => initial.set(row.player.id, index + 1));
      group.slice().sort((left, right) => left.finalRank - right.finalRank).forEach((row, index) => final.set(row.player.id, index + 1));
      group.slice().sort((left, right) => right.halfPprPoints - left.halfPprPoints).forEach((row, index) => outcome.set(row.player.id, index + 1));
    });
    return { initial, final, outcome, eligible };
  }

  function evaluateRanking(generated, outcomes) {
    if (!generated || generated.locked !== true) throw new Error("Ranking must be locked before outcomes are evaluated.");
    const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
    const available = generated.ranking.filter((row) => outcomeById.has(row.player.id));
    const actualOrder = available.slice().sort((left, right) => outcomeById.get(right.player.id).halfPprPoints - outcomeById.get(left.player.id).halfPprPoints);
    const actualRankById = new Map(actualOrder.map((row, index) => [row.player.id, index + 1]));
    const ppgEligible = available.filter((row) => Number.isFinite(outcomeById.get(row.player.id).actualGames) && outcomeById.get(row.player.id).actualGames > 0);
    const actualPpgRankById = new Map(ppgEligible.slice().sort((left, right) => {
      const leftOutcome = outcomeById.get(left.player.id);
      const rightOutcome = outcomeById.get(right.player.id);
      return rightOutcome.halfPprPoints / rightOutcome.actualGames - leftOutcome.halfPprPoints / leftOutcome.actualGames;
    }).map((row, index) => [row.player.id, index + 1]));
    let rows = available.map((row) => ({
      ...row,
      outcomeRank: actualRankById.get(row.player.id),
      halfPprPoints: outcomeById.get(row.player.id).halfPprPoints,
      actualGames: outcomeById.get(row.player.id).actualGames,
      actualPpg: Number.isFinite(outcomeById.get(row.player.id).actualGames) && outcomeById.get(row.player.id).actualGames > 0 ? outcomeById.get(row.player.id).halfPprPoints / outcomeById.get(row.player.id).actualGames : null,
      outcomePpgRank: actualPpgRankById.get(row.player.id),
      initialError: Math.abs(row.initialRank - actualRankById.get(row.player.id)),
      finalError: Math.abs(row.finalRank - actualRankById.get(row.player.id)),
      pointError: Number.isFinite(row.player.projectedHalfPprPoints) ? row.player.projectedHalfPprPoints - outcomeById.get(row.player.id).halfPprPoints : null,
      intervalHit: actualRankById.get(row.player.id) >= row.finalRank - row.uncertaintyBand && actualRankById.get(row.player.id) <= row.finalRank + row.uncertaintyBand
    }));
    rows = rows.map((row) => {
      const decomposable = Number.isFinite(row.player.projectedHalfPprPoints) && Number.isFinite(row.player.projectedGames) && row.player.projectedGames > 0 && Number.isFinite(row.actualGames) && row.actualGames > 0;
      if (!decomposable) return { ...row, projectedPpg: null, availabilityError: null, performanceError: null };
      const projectedPpg = row.player.projectedHalfPprPoints / row.player.projectedGames;
      return {
        ...row,
        projectedPpg,
        availabilityError: projectedPpg * (row.player.projectedGames - row.actualGames),
        performanceError: (projectedPpg - row.actualPpg) * row.actualGames
      };
    });
    const positionMaps = positionRankMaps(rows);
    rows = rows.map((row) => ({ ...row, initialPositionRank: positionMaps.initial.get(row.player.id), finalPositionRank: positionMaps.final.get(row.player.id), outcomePositionRank: positionMaps.outcome.get(row.player.id) }));
    const positionalRows = rows.filter((row) => positionMaps.eligible.has(row.player.id));
    const topCount = Math.min(6, rows.length);
    const predictedTop = new Set(rows.slice().sort((left, right) => left.finalRank - right.finalRank).slice(0, topCount).map((row) => row.player.id));
    const actualTop = rows.slice().sort((left, right) => left.outcomeRank - right.outcomeRank).slice(0, topCount);
    const initialRanks = rows.map((row) => row.initialRank);
    const finalRanks = rows.map((row) => row.finalRank);
    const actualRanks = rows.map((row) => row.outcomeRank);
    const pointRows = rows.filter((row) => Number.isFinite(row.pointError));
    const decompositionRows = rows.filter((row) => Number.isFinite(row.availabilityError) && Number.isFinite(row.performanceError));
    const ppgRows = rows.filter((row) => Number.isFinite(row.outcomePpgRank));
    return Object.freeze({
      rows: Object.freeze(rows),
      metrics: Object.freeze({
        playerCount: rows.length,
        initialMae: round(mean(rows.map((row) => row.initialError))),
        finalMae: round(mean(rows.map((row) => row.finalError))),
        initialSpearman: round(spearman(initialRanks, actualRanks), 3),
        finalSpearman: round(spearman(finalRanks, actualRanks), 3),
        pointMae: pointRows.length ? round(mean(pointRows.map((row) => Math.abs(row.pointError)))) : null,
        pointRmse: pointRows.length ? round(rmse(pointRows.map((row) => row.pointError))) : null,
        pointBias: pointRows.length ? round(mean(pointRows.map((row) => row.pointError))) : null,
        projectedPlayerCount: pointRows.length,
        ppgMae: ppgRows.length ? round(mean(ppgRows.map((row) => Math.abs(row.finalRank - row.outcomePpgRank)))) : null,
        ppgSpearman: ppgRows.length ? round(spearman(ppgRows.map((row) => row.finalRank), ppgRows.map((row) => row.outcomePpgRank)), 3) : null,
        availabilityMae: decompositionRows.length ? round(mean(decompositionRows.map((row) => Math.abs(row.availabilityError)))) : null,
        availabilityBias: decompositionRows.length ? round(mean(decompositionRows.map((row) => row.availabilityError))) : null,
        performanceMae: decompositionRows.length ? round(mean(decompositionRows.map((row) => Math.abs(row.performanceError)))) : null,
        performanceBias: decompositionRows.length ? round(mean(decompositionRows.map((row) => row.performanceError))) : null,
        decompositionPlayerCount: decompositionRows.length,
        initialPositionMae: round(mean(positionalRows.map((row) => Math.abs(row.initialPositionRank - row.outcomePositionRank)))),
        finalPositionMae: round(mean(positionalRows.map((row) => Math.abs(row.finalPositionRank - row.outcomePositionRank)))),
        finalPositionSpearman: round(spearman(positionalRows.map((row) => row.finalPositionRank), positionalRows.map((row) => row.outcomePositionRank)), 3),
        eligiblePositionPlayers: positionalRows.length,
        topSixHitRate: Math.round(actualTop.filter((row) => predictedTop.has(row.player.id)).length / Math.max(topCount, 1) * 100),
        intervalCoverage: Math.round(rows.filter((row) => row.intervalHit).length / Math.max(rows.length, 1) * 100),
        meanRankBand: round(mean(rows.map((row) => row.uncertaintyBand))),
        intervalMissDistance: round(mean(rows.map((row) => Math.max(0, Math.abs(row.finalRank - row.outcomeRank) - row.uncertaintyBand))))
      })
    });
  }

  function criticAdjustments(row) {
    const adjustments = Object.fromEntries(critics.map((critic) => [critic.id, 0]));
    row.critiques.forEach((pass) => pass.reviews.forEach((review) => {
      adjustments[review.criticId] += review.adjustment;
    }));
    return adjustments;
  }

  function weightedRanking(rows, weights) {
    return rows.map((row) => {
      const adjustments = row.adjustments || criticAdjustments(row);
      const originalAdjustment = Object.values(adjustments).reduce((total, value) => total + value, 0);
      const baseScore = Number.isFinite(row.baseScore) ? row.baseScore : row.score - originalAdjustment;
      const score = baseScore + optimizableCritics.reduce((total, critic) => total + (weights[critic.id] || 0) * adjustments[critic.id], 0);
      return { ...row, score: round(score), adjustments };
    }).sort((left, right) => right.score - left.score || left.initialRank - right.initialRank).map((row, index) => ({ ...row, rank: index + 1 }));
  }

  function rankingMetrics(rows, targetKey) {
    const predicted = rows.map((row) => row.rank);
    const actual = rows.map((row) => row[targetKey]);
    return {
      mae: round(mean(rows.map((row) => Math.abs(row.rank - row[targetKey])))),
      spearman: round(spearman(predicted, actual), 3)
    };
  }

  function weightCombinations(ids, values, index = 0, current = {}, combinations = []) {
    if (index === ids.length) {
      combinations.push({ ...current, uncertainty: 0 });
      return combinations;
    }
    values.forEach((value) => {
      current[ids[index]] = value;
      weightCombinations(ids, values, index + 1, current, combinations);
    });
    return combinations;
  }

  function optimizeWeights(rows, values, targetKey) {
    const preparedRows = rows.map((row) => {
      const adjustments = criticAdjustments(row);
      return { ...row, adjustments, baseScore: row.score - Object.values(adjustments).reduce((total, value) => total + value, 0) };
    });
    let best = null;
    const ids = optimizableCritics.map((critic) => critic.id);
    weightCombinations(ids, values).forEach((weights) => {
      const ranking = weightedRanking(preparedRows, weights);
      const metrics = rankingMetrics(ranking, targetKey);
      const objective = metrics.mae - metrics.spearman * 0.5;
      const complexity = ids.reduce((total, id) => total + Math.abs(weights[id]), 0);
      if (!best || objective < best.objective || (objective === best.objective && complexity < best.complexity)) best = { weights, ranking, metrics, objective, complexity };
    });
    return best;
  }

  function optimizeWeightsByGroups(groups, values, targetKey) {
    const preparedGroups = groups.map((rows) => rows.map((row) => {
      const adjustments = criticAdjustments(row);
      return { ...row, adjustments, baseScore: row.score - Object.values(adjustments).reduce((total, value) => total + value, 0) };
    }));
    let best = null;
    const ids = optimizableCritics.map((critic) => critic.id);
    weightCombinations(ids, values).forEach((weights) => {
      const groupResults = preparedGroups.map((rows) => {
        const ranking = weightedRanking(rows, weights);
        return { ranking, metrics: rankingMetrics(ranking, targetKey) };
      });
      const playerCount = preparedGroups.reduce((total, rows) => total + rows.length, 0);
      const mae = round(groupResults.reduce((total, result) => total + result.metrics.mae * result.ranking.length, 0) / Math.max(playerCount, 1));
      const spearmanValue = round(groupResults.reduce((total, result) => total + result.metrics.spearman * result.ranking.length, 0) / Math.max(playerCount, 1), 3);
      const objective = mae - spearmanValue * 0.5;
      const complexity = ids.reduce((total, id) => total + Math.abs(weights[id]), 0);
      if (!best || objective < best.objective || (objective === best.objective && complexity < best.complexity)) best = { weights, groupResults, metrics: { mae, spearman: spearmanValue }, objective, complexity };
    });
    return best;
  }

  function rerankOutcomes(rows) {
    const targetById = new Map(rows.slice().sort((left, right) => right.halfPprPoints - left.halfPprPoints).map((row, index) => [row.player.id, index + 1]));
    return rows.map((row) => ({ ...row, trainingOutcomeRank: targetById.get(row.player.id) }));
  }

  function crossValidateCritics(evaluation, foldCount = 3) {
    const folds = Array.from({ length: foldCount }, () => []);
    evaluation.rows.slice().sort((left, right) => left.initialRank - right.initialRank).forEach((row, index) => folds[index % foldCount].push(row.player.id));
    const predictions = [];
    const foldResults = [];
    folds.forEach((heldoutIds, foldIndex) => {
      const heldout = new Set(heldoutIds);
      const trainingRows = rerankOutcomes(evaluation.rows.filter((row) => !heldout.has(row.player.id)));
      const optimized = optimizeWeights(trainingRows, [-3, -2, -1, 0, 1, 2, 3], "trainingOutcomeRank");
      const allScores = weightedRanking(evaluation.rows, optimized.weights);
      allScores.filter((row) => heldout.has(row.player.id)).forEach((row) => predictions.push({ ...row, foldIndex, heldout: true, crossValidatedScore: evaluation.rows.length + 1 - row.rank }));
      foldResults.push(Object.freeze({ foldIndex, trainingIds: Object.freeze(trainingRows.map((row) => row.player.id)), heldoutIds: Object.freeze(heldoutIds.slice()), weights: Object.freeze(optimized.weights) }));
    });
    const ranking = predictions.sort((left, right) => right.crossValidatedScore - left.crossValidatedScore || left.initialRank - right.initialRank).map((row, index) => ({ ...row, rank: index + 1 }));
    return Object.freeze({ outcomeAware: false, ranking: Object.freeze(ranking), metrics: Object.freeze(rankingMetrics(ranking, "outcomeRank")), folds: Object.freeze(foldResults) });
  }

  function refitAfterCritique(evaluation) {
    const optimized = optimizeWeights(evaluation.rows, [-3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3], "outcomeRank");
    return Object.freeze({ outcomeAware: true, weights: Object.freeze(optimized.weights), ranking: Object.freeze(optimized.ranking), metrics: Object.freeze(optimized.metrics) });
  }

  function criticDiagnostics(evaluation, refit) {
    return Object.freeze(critics.map((critic) => {
      if (critic.id === "uncertainty") {
        const covered = evaluation.rows.filter((row) => row.intervalHit).length;
        return Object.freeze({ criticId: critic.id, helped: covered, hurt: evaluation.rows.length - covered, flat: 0, diagnosticRate: Math.round(covered / Math.max(evaluation.rows.length, 1) * 100), metricLabel: "interval coverage", refitWeight: 0 });
      }
      let helped = 0;
      let hurt = 0;
      let flat = 0;
      evaluation.rows.forEach((row) => {
        const adjustment = criticAdjustments(row)[critic.id];
        const direction = Math.sign(adjustment);
        const desired = Math.sign(row.initialRank - row.outcomeRank);
        if (!direction || !desired) flat += 1;
        else if (direction === desired) helped += 1;
        else hurt += 1;
      });
      const decided = helped + hurt;
      return Object.freeze({ criticId: critic.id, helped, hurt, flat, diagnosticRate: decided ? Math.round(helped / decided * 100) : 0, metricLabel: "directional hit rate", refitWeight: refit.weights[critic.id] });
    }));
  }

  function promotionAssessment(evaluation, crossValidated, seasonCount = 1) {
    const gates = Object.freeze([
      Object.freeze({ id: "seasons", label: "At least three frozen seasons", passed: seasonCount >= 3, value: `${seasonCount}/3` }),
      Object.freeze({ id: "sample", label: "At least 100 player-seasons", passed: evaluation.metrics.playerCount >= 100, value: `${evaluation.metrics.playerCount}/100` }),
      Object.freeze({ id: "mae", label: "Held-out MAE beats baseline", passed: crossValidated.metrics.mae < evaluation.metrics.initialMae, value: `${crossValidated.metrics.mae} vs ${evaluation.metrics.initialMae}` }),
      Object.freeze({ id: "correlation", label: "Held-out correlation beats baseline", passed: crossValidated.metrics.spearman > evaluation.metrics.initialSpearman, value: `${crossValidated.metrics.spearman} vs ${evaluation.metrics.initialSpearman}` })
    ]);
    return Object.freeze({ promoted: gates.every((gate) => gate.passed), gates });
  }

  function postmortem(dataset) {
    const original = run(dataset);
    const crossValidated = crossValidateCritics(original.evaluation);
    const refit = refitAfterCritique(original.evaluation);
    return Object.freeze({
      original,
      crossValidated,
      refit,
      diagnostics: criticDiagnostics(original.evaluation, refit),
      promotion: promotionAssessment(original.evaluation, crossValidated),
      passes: Object.freeze([
        Object.freeze({ pass: 1, name: "Responsibility audit", conclusion: "Consensus was removed as a duplicate vote, projection/VOR became an explicit specialist, and uncertainty moved from mean-rank penalties to forecast ranges." }),
        Object.freeze({ pass: 2, name: "Held-out rebuild", conclusion: "Only the three directional specialists are weight-fitted; the uncertainty specialist is judged by interval coverage and never learns from a player's own outcome." })
      ])
    });
  }

  function run(dataset) {
    const generated = generateRanking(dataset.preseason);
    return Object.freeze({ generated, evaluation: evaluateRanking(generated, dataset.outcomes) });
  }

  return Object.freeze({ critics, sanitizePreseason, generateRanking, evaluateRanking, weightedRanking, rankingMetrics, optimizeWeights, optimizeWeightsByGroups, crossValidateCritics, refitAfterCritique, promotionAssessment, postmortem, run });
});
