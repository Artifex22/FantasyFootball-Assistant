(function (root, factory) {
  "use strict";
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  if (root) root.WaitCalibration = value;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const round = (value, digits = 3) => Number(value.toFixed(digits));
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const logistic = (value) => 1 / (1 + Math.exp(-value));

  function userPicks(slot, maximumPick) {
    return Array.from({ length: Math.ceil(maximumPick / 12) }, (_, roundIndex) => roundIndex % 2 === 0
      ? roundIndex * 12 + slot
      : roundIndex * 12 + (13 - slot)).filter((pick) => pick <= maximumPick);
  }

  function buildExamples(dataset) {
    const maximumPick = dataset.preseason.length;
    const examples = [];
    for (let slot = 1; slot <= 12; slot += 1) {
      const picks = userPicks(slot, maximumPick);
      picks.slice(0, -1).forEach((currentPick, index) => {
        const nextPick = picks[index + 1];
        dataset.preseason.filter((player) => player.marketRank >= currentPick && player.expertRank <= maximumPick).forEach((player) => {
          examples.push(Object.freeze({
            season: dataset.meta.season,
            slot,
            currentPick,
            nextPick,
            playerId: player.id,
            expertRank: player.expertRank,
            marketRank: player.marketRank,
            survived: player.marketRank >= nextPick ? 1 : 0
          }));
        });
      });
    }
    return Object.freeze(examples);
  }

  function probability(example, parameters) {
    return clamp(logistic((example.expertRank - example.nextPick + parameters.offset) / parameters.scale), 0.02, 0.98);
  }

  function score(examples, parameters) {
    const rows = examples.map((example) => ({ ...example, probability: probability(example, parameters) }));
    const brier = rows.reduce((total, row) => total + (row.probability - row.survived) ** 2, 0) / Math.max(rows.length, 1);
    const bins = Array.from({ length: 5 }, (_, index) => {
      const minimum = index * 0.2;
      const maximum = minimum + 0.2;
      const members = rows.filter((row) => row.probability >= minimum && (index === 4 ? row.probability <= maximum : row.probability < maximum));
      return Object.freeze({
        minimum,
        maximum,
        count: members.length,
        predicted: members.length ? members.reduce((total, row) => total + row.probability, 0) / members.length : null,
        observed: members.length ? members.reduce((total, row) => total + row.survived, 0) / members.length : null
      });
    });
    const ece = bins.reduce((total, bin) => total + (bin.count ? Math.abs(bin.predicted - bin.observed) * bin.count : 0), 0) / Math.max(rows.length, 1);
    return Object.freeze({ exampleCount: rows.length, brier: round(brier), ece: round(ece), bins: Object.freeze(bins) });
  }

  function fit(examples) {
    let best = null;
    for (let offset = -12; offset <= 12; offset += 1) {
      for (let scale = 2; scale <= 16; scale += 1) {
        const parameters = { offset, scale };
        const metrics = score(examples, parameters);
        const objective = metrics.brier + metrics.ece * 0.2;
        if (!best || objective < best.objective) best = { parameters: Object.freeze(parameters), metrics, objective };
      }
    }
    return Object.freeze(best);
  }

  function run(datasets) {
    const ordered = datasets.filter((dataset) => dataset.preseason.length >= 24).slice().sort((left, right) => left.meta.season - right.meta.season);
    const seasonExamples = ordered.map((dataset) => Object.freeze({ season: dataset.meta.season, rows: buildExamples(dataset) }));
    const baselineParameters = Object.freeze({ offset: 0, scale: 6 });
    const rolling = seasonExamples.slice(1).map((test, index) => {
      const training = seasonExamples.slice(0, index + 1).flatMap((season) => season.rows);
      const fitted = fit(training);
      return Object.freeze({
        season: test.season,
        trainingSeasons: Object.freeze(seasonExamples.slice(0, index + 1).map((season) => season.season)),
        parameters: fitted.parameters,
        baseline: score(test.rows, baselineParameters),
        calibrated: score(test.rows, fitted.parameters)
      });
    });
    const totalExamples = rolling.reduce((total, result) => total + result.calibrated.exampleCount, 0);
    const aggregate = (key, metric) => totalExamples ? rolling.reduce((total, result) => total + result[key][metric] * result[key].exampleCount, 0) / totalExamples : null;
    const baselineBrier = aggregate("baseline", "brier");
    const calibratedBrier = aggregate("calibrated", "brier");
    const baselineEce = aggregate("baseline", "ece");
    const calibratedEce = aggregate("calibrated", "ece");
    const latest = seasonExamples.length ? fit(seasonExamples.flatMap((season) => season.rows)) : null;
    const improvedFolds = rolling.filter((result) => result.calibrated.brier < result.baseline.brier && result.calibrated.ece < result.baseline.ece).length;
    const promoted = rolling.length >= 4 && improvedFolds / rolling.length >= 0.75 && calibratedBrier <= baselineBrier * 0.98 && calibratedEce <= baselineEce * 0.9;
    return Object.freeze({
      seasonCount: seasonExamples.length,
      testSeasonCount: rolling.length,
      exampleCount: totalExamples,
      baselineBrier: baselineBrier === null ? null : round(baselineBrier),
      calibratedBrier: calibratedBrier === null ? null : round(calibratedBrier),
      baselineEce: baselineEce === null ? null : round(baselineEce),
      calibratedEce: calibratedEce === null ? null : round(calibratedEce),
      improvedFolds,
      promoted,
      activeParameters: promoted ? latest.parameters : baselineParameters,
      candidateParameters: latest?.parameters || baselineParameters,
      rolling: Object.freeze(rolling)
    });
  }

  return Object.freeze({ userPicks, buildExamples, probability, score, fit, run });
});
