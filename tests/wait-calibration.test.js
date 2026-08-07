"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const calibration = require("../wait-calibration.js");

const datasets = Array.from({ length: 5 }, (_, seasonIndex) => ({
  meta: { season: 2021 + seasonIndex },
  preseason: Array.from({ length: 36 }, (_, index) => ({ id: `${seasonIndex}-${index}`, expertRank: index + 1, marketRank: ((index + seasonIndex * 3) % 36) + 1 }))
}));

test("builds conditional wait-return examples without outcomes", () => {
  const examples = calibration.buildExamples(datasets[0]);
  assert.ok(examples.length > 0);
  assert.ok(examples.every((row) => row.marketRank >= row.currentPick));
  assert.ok(examples.every((row) => row.survived === 0 || row.survived === 1));
});

test("rolling wait calibration keeps each test season out of training", () => {
  const result = calibration.run(datasets);
  assert.equal(result.testSeasonCount, datasets.length - 1);
  result.rolling.forEach((fold) => assert.equal(fold.trainingSeasons.includes(fold.season), false));
  assert.ok(Number.isFinite(result.calibratedBrier));
  assert.ok(Number.isFinite(result.calibratedEce));
});
