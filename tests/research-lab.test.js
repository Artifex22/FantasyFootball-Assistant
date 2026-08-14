"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const lab = require("../research-lab.js");
const expanded = require("../historical-cohort-expansion.js");
const current = require("../historical-public-data.js");
const research = require("../analytics-research.js");

test("research sandbox reproduces the five-season position experiments", () => {
  const results = lab.runPositionExperiments([...expanded, current]);
  assert.equal(results.consensus.playerCount, 210);
  assert.equal(results.consensus.positionMae, 4.886);
  assert.equal(results.projection35.positionMae, 4.857);
  assert.ok(results.availabilityPenalty.positionMae > results.consensus.positionMae);
});

test("research brain keeps unproven candidates out of live promotion", () => {
  assert.equal(research.experiments.some((experiment) => experiment.status === "Promote"), false);
  assert.equal(research.metrics.find((metric) => metric.metric === "Preseason positional schedule").decision, "Downgrade");
  assert.ok(research.critics.some((critic) => critic.name === "Signal Governance Auditor"));
});
