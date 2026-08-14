"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const factory = require("../draft-brain.js");

const history = {
  managerGroups: [
    { id: "alpha", name: "Alpha", aliases: ["Alpha"], confidence: "high" },
    { id: "beta", name: "Beta", aliases: ["Beta"], confidence: "high" }
  ],
  seasons: [{ year: 2025, league: "Test", picks: [[1, 1, "Runner", "AAA", "RB", "Alpha"], [1, 2, "Catcher", "BBB", "WR", "Beta"], [2, 1, "Runner Two", "AAA", "RB", "Beta"], [2, 2, "Catcher Two", "BBB", "WR", "Alpha"]] }],
  finalRosters: [["Alpha", "Runner", "Draft", "RB"], ["Beta", "Catcher", "Trade", "WR"]],
  projectedKeepers: [["beta", "Catcher", 3]]
};

test("maps snake picks to managers", () => {
  const order = ["alpha", "beta"];
  assert.equal(factory.managerAtPick(1, 2, order).managerId, "alpha");
  assert.equal(factory.managerAtPick(3, 2, order).managerId, "beta");
  assert.equal(factory.overallForManagerRound("alpha", 2, 2, order), 4);
});

test("builds indexed manager profiles", () => {
  const brain = factory.createBrain(history);
  assert.equal(brain.picks.length, 4);
  assert.equal(brain.profileFor("alpha").sampleSize, 2);
  assert.equal(brain.playerHistory("Runner")[0].managerId, "alpha");
  assert.equal(brain.keeperEligible("alpha", "Runner"), true);
  assert.equal(brain.keeperEligible("beta", "Catcher"), false);
});

test("estimates return probability and next user pick", () => {
  const brain = factory.createBrain(history);
  const forecast = brain.forecastReturn({ name: "Target", rank: 5, position: "WR" }, {
    teams: 2,
    draftOrder: ["alpha", "beta"],
    userManagerId: "alpha",
    currentOverall: 0,
    draftedPicks: [],
    keepers: [],
    maxRounds: 5
  });
  assert.equal(forecast.nextPick, 4);
  assert.ok(forecast.probability >= 1 && forecast.probability <= 99);
});

test("returns normalized position percentages", () => {
  const brain = factory.createBrain(history);
  const positions = brain.likelyPositions("alpha", 6, [], {
    currentOverall: 11,
    availablePlayers: [
      { name: "QB", position: "QB", rank: 11 },
      { name: "RB", position: "RB", rank: 12 },
      { name: "WR", position: "WR", rank: 13 },
      { name: "TE", position: "TE", rank: 14 }
    ]
  });
  assert.equal(positions.reduce((total, item) => total + item.probability, 0), 100);
  assert.ok(positions.every((item) => Number.isInteger(item.probability)));
});

test("strongly suppresses a second tight end in normal rounds", () => {
  const brain = factory.createBrain(history);
  const positions = brain.likelyPositions("alpha", 6, [{ managerId: "alpha", position: "TE", round: 3, overall: 5 }], {
    currentOverall: 12,
    availablePlayers: [
      { name: "RB", position: "RB", rank: 12 },
      { name: "WR", position: "WR", rank: 13 },
      { name: "TE", position: "TE", rank: 12 }
    ]
  });
  assert.ok(positions.find((item) => item.position === "TE").probability <= 3);
});

test("live position runs influence the next-pick distribution", () => {
  const brain = factory.createBrain(history);
  const availablePlayers = [
    { name: "Runner", position: "RB", rank: 20 },
    { name: "Catcher", position: "WR", rank: 20 },
    { name: "Passer", position: "QB", rank: 20 },
    { name: "End", position: "TE", rank: 20 }
  ];
  const baseline = brain.likelyPositions("alpha", 4, [], { currentOverall: 20, availablePlayers });
  const liveRun = Array.from({ length: 8 }, (_, index) => ({ managerId: "beta", position: "RB", round: 3, overall: index + 10 }));
  const adjusted = brain.likelyPositions("alpha", 4, liveRun, { currentOverall: 20, availablePlayers });
  assert.ok(adjusted.find((item) => item.position === "RB").probability > baseline.find((item) => item.position === "RB").probability);
});

test("predicts round-specific positions and plausible player names", () => {
  const brain = factory.createBrain(history);
  const forecast = brain.predictPick("alpha", 4, [], {
    currentOverall: 20,
    availablePlayers: [
      { id: "runner-two", name: "Runner Two", team: "AAA", position: "RB", rank: 20 },
      { id: "catcher-two", name: "Catcher Two", team: "BBB", position: "WR", rank: 21 },
      { id: "tight-two", name: "Tight Two", team: "CCC", position: "TE", rank: 22 }
    ]
  });
  assert.equal(forecast.managerId, "alpha");
  assert.equal(forecast.pick.round, 4);
  assert.equal(forecast.positions.reduce((total, item) => total + item.probability, 0), 100);
  assert.ok(forecast.players.length > 0);
  assert.ok(forecast.players[0].probability > 0);
  assert.ok(forecast.fieldProbability >= 0);
  assert.ok(["Low", "Medium", "High"].includes(forecast.confidence.grade));
});

test("builds a round-by-round board forecast", () => {
  const brain = factory.createBrain(history);
  const forecasts = brain.predictBoard({
    teams: 2,
    draftOrder: ["alpha", "beta"],
    fromOverall: 1,
    throughRound: 3,
    availablePlayers: [{ id: "runner-two", name: "Runner Two", team: "AAA", position: "RB", rank: 3 }]
  });
  assert.equal(forecasts.length, 6);
  assert.deepEqual(forecasts.map((forecast) => forecast.managerId), ["alpha", "beta", "beta", "alpha", "alpha", "beta"]);
});
