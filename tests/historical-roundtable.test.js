"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../historical-roundtable.js");
const dataset = require("../historical-public-data.js");

test("runs four critics for exactly two passes", () => {
  const generated = engine.generateRanking(dataset.preseason);
  assert.equal(generated.critics.length, 4);
  assert.equal(generated.passCount, 2);
  generated.ranking.forEach((row) => {
    assert.equal(row.critiques.length, 2);
    assert.equal(row.critiques[0].reviews.length, 4);
    assert.equal(row.critiques[1].reviews.length, 4);
  });
});

test("outcomes cannot alter the black-box ranking", () => {
  const before = engine.generateRanking(dataset.preseason).ranking.map((row) => row.player.id);
  const reversedOutcomes = dataset.outcomes.slice().reverse().map((outcome, index) => ({ ...outcome, halfPprPoints: index * 1000 }));
  engine.evaluateRanking(engine.generateRanking(dataset.preseason), reversedOutcomes);
  const after = engine.generateRanking(dataset.preseason).ranking.map((row) => row.player.id);
  assert.deepEqual(after, before);
});

test("sanitizer strips outcome-like fields", () => {
  const sanitized = engine.sanitizePreseason([{ ...dataset.preseason[0], halfPprPoints: 999, outcomeRank: 1 }]);
  assert.equal(sanitized[0].halfPprPoints, undefined);
  assert.equal(sanitized[0].outcomeRank, undefined);
});

test("evaluation reports finite pre-lock and post-roundtable metrics", () => {
  const result = engine.run(dataset);
  assert.equal(result.evaluation.metrics.playerCount, dataset.preseason.length);
  assert.ok(Number.isFinite(result.evaluation.metrics.initialMae));
  assert.ok(Number.isFinite(result.evaluation.metrics.finalSpearman));
});

test("postmortem rebuild keeps every held-out player outside its training fold", () => {
  const result = engine.postmortem(dataset);
  result.crossValidated.folds.forEach((fold) => {
    const training = new Set(fold.trainingIds);
    fold.heldoutIds.forEach((id) => assert.equal(training.has(id), false));
  });
  assert.equal(result.crossValidated.ranking.length, dataset.preseason.length);
  assert.equal(result.refit.outcomeAware, true);
  assert.equal(result.crossValidated.outcomeAware, false);
});

test("held-out remake remains distinct from hindsight refit", () => {
  const result = engine.postmortem(dataset);
  assert.ok(Number.isFinite(result.crossValidated.metrics.mae));
  assert.ok(Number.isFinite(result.refit.metrics.mae));
  assert.equal(result.refit.outcomeAware, true);
  assert.equal(result.crossValidated.outcomeAware, false);
});
