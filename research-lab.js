(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.FantasyResearchLab = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const mean = (values) => values.reduce((total, value) => total + value, 0) / Math.max(values.length, 1);
  const round = (value, digits = 3) => Number(value.toFixed(digits));

  function rankMap(rows, value, eligible = () => true) {
    return new Map(rows.filter(eligible).slice().sort((left, right) => value(left) - value(right) || left.player.marketRank - right.player.marketRank).map((row, index) => [row.player.id, index + 1]));
  }

  function spearman(predicted, actual) {
    const count = predicted.length;
    if (count < 2) return 1;
    const squared = predicted.reduce((total, value, index) => total + (value - actual[index]) ** 2, 0);
    return 1 - (6 * squared) / (count * (count ** 2 - 1));
  }

  const strategies = Object.freeze({
    consensus(row, context) {
      return context.consensus.get(row.player.id);
    },
    projection35(row, context) {
      const consensus = context.consensus.get(row.player.id);
      return context.projection.has(row.player.id) ? consensus * 0.65 + context.projection.get(row.player.id) * 0.35 : consensus;
    },
    availabilityPenalty(row, context) {
      const penalty = Number.isFinite(row.player.durability) ? (100 - row.player.durability) * 0.05 : 0;
      return context.consensus.get(row.player.id) + penalty;
    },
    disagreementPenalty(row, context) {
      const disagreement = Math.abs(context.expert.get(row.player.id) - context.market.get(row.player.id));
      return context.consensus.get(row.player.id) + disagreement * 0.12;
    }
  });

  function evaluatePositionGroup(group, strategy) {
    const context = {
      expert: rankMap(group, (row) => row.player.expertRank),
      market: rankMap(group, (row) => row.player.marketRank),
      consensus: rankMap(group, (row) => (row.player.expertRank + row.player.marketRank) / 2),
      projection: rankMap(group, (row) => -row.player.projectedVor, (row) => Number.isFinite(row.player.projectedVor))
    };
    const actual = rankMap(group, (row) => -row.outcome.halfPprPoints);
    const predicted = rankMap(group, (row) => strategy(row, context));
    const eligible = group.filter((row) => actual.has(row.player.id) && predicted.has(row.player.id));
    const predictedRanks = eligible.map((row) => predicted.get(row.player.id));
    const actualRanks = eligible.map((row) => actual.get(row.player.id));
    return {
      playerCount: eligible.length,
      mae: mean(predictedRanks.map((rank, index) => Math.abs(rank - actualRanks[index]))),
      spearman: spearman(predictedRanks, actualRanks)
    };
  }

  function runPositionExperiments(datasets) {
    const results = Object.fromEntries(Object.keys(strategies).map((id) => [id, []]));
    datasets.forEach((dataset) => {
      const outcomeById = new Map(dataset.outcomes.map((outcome) => [outcome.id, outcome]));
      const rows = dataset.preseason.map((player) => ({ player, outcome: outcomeById.get(player.id) })).filter((row) => row.outcome);
      [...new Set(rows.map((row) => row.player.position))].forEach((position) => {
        const group = rows.filter((row) => row.player.position === position);
        Object.entries(strategies).forEach(([id, strategy]) => results[id].push({ season: dataset.meta.season, ...evaluatePositionGroup(group, strategy) }));
      });
    });

    return Object.freeze(Object.fromEntries(Object.entries(results).map(([id, rows]) => {
      const playerCount = rows.reduce((total, row) => total + row.playerCount, 0);
      const positionMae = rows.reduce((total, row) => total + row.mae * row.playerCount, 0) / Math.max(playerCount, 1);
      const positionSpearman = rows.reduce((total, row) => total + row.spearman * row.playerCount, 0) / Math.max(playerCount, 1);
      const seasons = [...new Set(rows.map((row) => row.season))].map((season) => {
        const seasonRows = rows.filter((row) => row.season === season);
        return Object.freeze({ season, mae: round(mean(seasonRows.map((row) => row.mae)), 2) });
      });
      return [id, Object.freeze({ playerCount, positionMae: round(positionMae), positionSpearman: round(positionSpearman), seasons: Object.freeze(seasons) })];
    })));
  }

  return Object.freeze({ runPositionExperiments, strategies });
});
