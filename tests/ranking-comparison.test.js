"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const comparison = require("../ranking-comparison.js");

const players = [
  { id: "alpha", name: "Alpha Jr.", espnOverallRank: 8, ecrRank: 10, ecrVsAdp: 5 },
  { id: "beta", name: "Beta", espnOverallRank: 20, ecrRank: null, ecrVsAdp: 0 }
];

test("resolves built-in, snapshot, and imported ranks", () => {
  assert.equal(comparison.rankFor("espn", players[0]), 8);
  assert.equal(comparison.rankFor("fantasypros", players[0]), 10);
  assert.equal(comparison.rankFor("market", players[0]), 15);
  assert.equal(comparison.rankFor("sleeper", players[0], { sleeper: { ranks: { alpha: 12 } } }), 12);
  assert.equal(comparison.rankFor("sleeper", players[0], {}, { alpha: 6 }), 6);
});

test("labels value, reach, alignment, and missing coverage", () => {
  assert.deepEqual(comparison.evaluate(10, 20), { gap: 10, label: "Value +10", tone: "value" });
  assert.deepEqual(comparison.evaluate(20, 10), { gap: -10, label: "Reach 10", tone: "reach" });
  assert.equal(comparison.evaluate(10, 12).tone, "aligned");
  assert.equal(comparison.evaluate(10, null).tone, "missing");
});

test("parses inert pasted ranking text without guessing names", () => {
  const parsed = comparison.parseRankingText("rank,name\n1,Alpha Jr.\n2 Beta\n3,Unknown", players);
  assert.deepEqual(parsed.ranks, { alpha: 1, beta: 2 });
  assert.equal(parsed.imported, 2);
  assert.equal(parsed.errors.length, 1);
});
