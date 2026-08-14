"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../model.js");

const players = [
  { id: "alpha", name: "Alpha", rank: 1, tier: 1, position: "RB", positionRank: 1, stdDev: 2, ecrVsAdp: 3, formatRanks: { half: 1, ppr: 2, standard: 1 }, espnPositionRank: 1 },
  { id: "beta", name: "Beta", rank: 2, tier: 1, position: "WR", positionRank: 1, stdDev: 6, ecrVsAdp: -2, formatRanks: { half: 2, ppr: 1, standard: 2 }, espnPositionRank: 2 },
  { id: "gamma", name: "Gamma", rank: 3, tier: 2, position: "RB", positionRank: 2, stdDev: 9, ecrVsAdp: 0, formatRanks: { half: 3, ppr: 3, standard: 3 }, espnPositionRank: 2 }
];

const settings = { scoring: "half", teams: 2, startingQbs: 1 };
const weights = { consensus: 35, projectionVor: 25, opportunity: 15, schedule: 8, durability: 10, market: 7 };

test("scores every available player and preserves deterministic order", () => {
  const results = model.scorePlayers(players, { settings, weights, metricsById: {}, draftedIds: [], roster: [] });
  assert.equal(results.length, 3);
  assert.equal(results[0].player.id, "alpha");
  assert.ok(results[0].recommendationScore >= results[1].recommendationScore);
  assert.ok(results[0].coverage < 100);
});

test("removes drafted players", () => {
  const results = model.scorePlayers(players, { settings, weights, metricsById: {}, draftedIds: ["alpha"], roster: [] });
  assert.deepEqual(results.map((result) => result.player.id), ["beta", "gamma"]);
});

test("macro rankings exclude roster and tier-cliff urgency", () => {
  const players = [
    { id: "alpha", name: "Alpha", position: "WR", rank: 1, tier: 1 },
    { id: "beta", name: "Beta", position: "WR", rank: 9, tier: 1 },
    { id: "gamma", name: "Gamma", position: "WR", rank: 10, tier: 2 }
  ];
  const weights = { consensus: 100, projectionVor: 0, opportunity: 0, schedule: 0, durability: 0, market: 0 };
  const results = model.scorePlayers(players, { settings, weights, metricsById: {}, draftedIds: [], roster: [], includeDraftAdjustments: false });
  assert.equal(results[0].player.id, "alpha");
  assert.deepEqual(results.map((result) => result.adjustments), [
    { rosterNeed: 0, tierCliff: 0 },
    { rosterNeed: 0, tierCliff: 0 },
    { rosterNeed: 0, tierCliff: 0 }
  ]);
});

test("tier urgency never promotes a worse same-position player", () => {
  const tierPlayers = [
    { id: "best", name: "Best", position: "WR", rank: 1, tier: 1 },
    { id: "last-elite", name: "Last Elite", position: "WR", rank: 8, tier: 1 },
    { id: "next-tier", name: "Next Tier", position: "WR", rank: 9, tier: 2 }
  ];
  const tierWeights = { consensus: 100, projectionVor: 0, opportunity: 0, schedule: 0, durability: 0, market: 0 };
  const fullBoard = model.scorePlayers(tierPlayers, { settings, weights: tierWeights, metricsById: {}, draftedIds: [], roster: [] });
  assert.equal(fullBoard.find((result) => result.player.id === "last-elite").adjustments.tierCliff, 0);
  assert.equal(fullBoard[0].player.id, "best");
  const afterBest = model.scorePlayers(tierPlayers, { settings, weights: tierWeights, metricsById: {}, draftedIds: ["best"], roster: [] });
  assert.ok(afterBest.find((result) => result.player.id === "last-elite").adjustments.tierCliff > 0);
});

test("projection import activates VOR and increases coverage", () => {
  const metricsById = { alpha: { projection: 300 }, beta: { projection: 280 }, gamma: { projection: 220 } };
  const withoutProjection = model.scorePlayers(players, { settings, weights, metricsById: {}, draftedIds: [], roster: [] });
  const withProjection = model.scorePlayers(players, { settings, weights, metricsById, draftedIds: [], roster: [] });
  assert.ok(withProjection[0].coverage > withoutProjection[0].coverage);
  assert.ok(Number.isFinite(withProjection[0].signals.projectionVor));
});

test("CSV parser rejects unknown players and accepts numeric signals", () => {
  const parsed = model.parseMetricCsv("name,projection,opportunity,schedule,durability\nAlpha,300,90,60,80\nUnknown,200,50,50,50", players);
  assert.equal(parsed.imported, 1);
  assert.equal(parsed.metricsById.alpha.projection, 300);
  assert.equal(parsed.metricsById.alpha.opportunity, 90);
  assert.equal(parsed.errors.length, 1);
});

test("replacement thresholds respond to league settings", () => {
  assert.equal(model.replacementPositionRank("QB", { teams: 12, startingQbs: 1 }), 12);
  assert.equal(model.replacementPositionRank("QB", { teams: 12, startingQbs: 2 }), 24);
  assert.ok(model.replacementPositionRank("RB", { teams: 12, startingQbs: 1 }) > 24);
});

test("optimized replacement levels assign flex spots to best remaining scorers", () => {
  const pool = [];
  const metricsById = {};
  const add = (position, points) => {
    const id = `${position.toLowerCase()}-${points}`;
    pool.push({ id, position });
    metricsById[id] = { projection: points };
  };
  [300, 290, 280].forEach((points) => add("QB", points));
  [240, 230, 220, 210, 205, 200, 100].forEach((points) => add("RB", points));
  [235, 225, 215, 205, 190, 180, 90].forEach((points) => add("WR", points));
  [180, 170, 160, 80].forEach((points) => add("TE", points));
  const ranks = model.optimizedReplacementRanks(pool, metricsById, { teams: 2, startingQbs: 1 });
  assert.equal(ranks.QB, 3);
  assert.equal(ranks.RB, 7);
  assert.equal(ranks.WR, 5);
  assert.equal(ranks.TE, 3);
});
