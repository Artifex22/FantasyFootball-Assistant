"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const backtest = require("../historical-backtest.js");
const engine = require("../historical-roundtable.js");
const dataset = require("../historical-public-data.js");

test("validates the audited historical cohort", () => {
  assert.deepEqual(backtest.validateDataset(dataset), { valid: true, errors: [] });
});

test("portfolio refuses promotion on a one-season pilot", () => {
  const result = backtest.runPortfolio([dataset], engine);
  assert.equal(result.metrics.seasonCount, 1);
  assert.equal(result.metrics.playerCount, 18);
  assert.equal(result.promoted, false);
  assert.equal(result.gates.find((gate) => gate.id === "seasons").passed, false);
  assert.equal(result.gates.find((gate) => gate.id === "mae").passed, false);
  assert.equal(result.metrics.rollingOriginMae, null);
});

test("rejects incomplete and duplicate-season portfolios", () => {
  assert.equal(backtest.validateDataset({ meta: { season: 2024 } }).valid, false);
  assert.throws(() => backtest.runPortfolio([dataset, dataset], engine), /Duplicate season/);
});
