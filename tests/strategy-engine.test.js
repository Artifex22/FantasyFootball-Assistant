"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const strategy = require("../strategy-engine.js");

function result(name, position, rank, tier, score = 70, positionRank = 1) {
  return {
    player: { id: name.toLowerCase().replace(/\s/g, "-"), name, position, rank, tier, positionRank },
    recommendationScore: score
  };
}

const pool = [
  result("Runner One", "RB", 25, 3, 76, 10),
  result("Runner Two", "RB", 35, 4, 70, 15),
  result("Receiver One", "WR", 24, 3, 78, 11),
  result("Receiver Two", "WR", 31, 3, 72, 14),
  result("Passer One", "QB", 27, 2, 75, 4),
  result("Tight End One", "TE", 29, 2, 73, 4),
  result("Kicker One", "K", 26, 1, 99, 1),
  result("Defense One", "DST", 28, 1, 99, 1)
];

test("does not recommend kicker or defense early", () => {
  const analysis = strategy.analyze({ results: pool, roster: [], draftLog: [], teams: 12, currentOverall: 25, nextPick: 48 });
  assert.ok(analysis.recommendations.every((item) => !["K", "DST"].includes(item.player.position)));
  assert.ok(analysis.recommendations.every((item) => item.reach <= analysis.allowedReach));
});

test("detects a live running back run and adapts the plan", () => {
  const draftLog = Array.from({ length: 6 }, (_, index) => ({ position: index < 4 ? "RB" : "WR", overall: index + 18 }));
  const analysis = strategy.analyze({ results: pool, roster: [{ position: "WR" }, { position: "WR" }], draftLog, teams: 12, currentOverall: 25, nextPick: 48 });
  assert.equal(analysis.activeRun.position, "RB");
  assert.match(analysis.strategy.headline, /RB run/);
});

test("suppresses early backup quarterback and tight end builds", () => {
  const roster = [{ position: "QB" }, { position: "TE" }, { position: "RB" }, { position: "WR" }];
  const analysis = strategy.analyze({ results: pool, roster, draftLog: [], teams: 12, currentOverall: 49, nextPick: 72 });
  assert.ok(analysis.recommendations.every((item) => !["QB", "TE"].includes(item.player.position)));
});
