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

test("sequential board forecasts do not select the same player twice", () => {
  const brain = factory.createBrain(history);
  const availablePlayers = Array.from({ length: 12 }, (_, index) => ({
    id: `player-${index + 1}`,
    name: `Player ${index + 1}`,
    team: index % 2 ? "AAA" : "BBB",
    position: ["RB", "WR", "QB", "TE"][index % 4],
    rank: index + 1
  }));
  const forecasts = brain.predictBoard({
    teams: 2,
    draftOrder: ["alpha", "beta"],
    throughRound: 3,
    availablePlayers
  });
  const selectedIds = forecasts.map((forecast) => forecast.selectedPlayer?.playerId).filter(Boolean);

  assert.equal(selectedIds.length, 6);
  assert.equal(new Set(selectedIds).size, selectedIds.length);
});

test("conditions manager round forecasts on the simulated prior roster", () => {
  const receiverHeavyHistory = {
    managerGroups: [{ id: "receiver-heavy", name: "Receiver Heavy", aliases: ["Receiver Heavy"], confidence: "high" }],
    league: { teams: 1, rounds: 16 },
    seasons: Array.from({ length: 5 }, (_, seasonIndex) => ({
      year: 2021 + seasonIndex,
      league: "Test",
      picks: Array.from({ length: 16 }, (_, roundIndex) => [roundIndex + 1, 1, `Receiver ${seasonIndex}-${roundIndex}`, "AAA", "WR", "Receiver Heavy"])
    }))
  };
  const brain = factory.createBrain(receiverHeavyHistory);
  const availablePlayers = [
    { id: "passer", name: "Passer", team: "AAA", position: "QB", rank: 1 },
    { id: "runner", name: "Runner", team: "AAA", position: "RB", rank: 1 },
    { id: "receiver", name: "Receiver", team: "AAA", position: "WR", rank: 1 },
    { id: "tight-end", name: "Tight End", team: "AAA", position: "TE", rank: 1 },
    { id: "kicker", name: "Kicker", team: "AAA", position: "K", rank: 1 },
    { id: "defense", name: "Defense", team: "AAA", position: "DST", rank: 1 }
  ];
  const simulation = brain.simulateManagerDraft("receiver-heavy", {
    teams: 1,
    rounds: 16,
    draftOrder: ["receiver-heavy"],
    availablePlayers,
    startingQbs: 1
  });

  assert.equal(simulation.rounds.length, 16);
  assert.ok(simulation.rosterCounts.QB >= 1);
  assert.ok(simulation.rosterCounts.RB >= 2);
  assert.ok(simulation.rosterCounts.WR >= 2);
  assert.ok(simulation.rosterCounts.TE >= 1);
  assert.ok(simulation.rosterCounts.K >= 1);
  assert.ok(simulation.rosterCounts.DST >= 1);
  assert.ok(simulation.rosterCounts.WR < 10);
});

test("learns rookie and age archetypes against the league baseline", () => {
  const seasons = Array.from({ length: 6 }, (_, index) => ({
    year: 2020 + index,
    league: "Archetype test",
    teams: 2,
    picks: [
      [1, 1, `Young ${index}`, "AAA", "WR", "Alpha"],
      [1, 2, `Veteran ${index}`, "BBB", "WR", "Beta"]
    ]
  }));
  const playerProfiles = seasons.flatMap((season, index) => [
    { name: `Young ${index}`, position: "WR", age: 23, asOfYear: season.year, draftYear: season.year },
    { name: `Veteran ${index}`, position: "WR", age: 30, asOfYear: season.year, draftYear: season.year - 7 }
  ]);
  const brain = factory.createBrain({ ...history, seasons }, { currentSeason: 2026, playerProfiles });
  const alpha = brain.personalityFor("alpha");
  const rookie = alpha.archetypes.find((signal) => signal.id === "rookie");
  assert.equal(alpha.coverage, 100);
  assert.ok(rookie.lift > 0);
  assert.equal(rookie.observedRate, 1);
  assert.equal(rookie.leagueRate, 0.5);
});

test("uses supported manager archetypes to separate same-market candidates", () => {
  const seasons = Array.from({ length: 6 }, (_, index) => ({ year: 2020 + index, league: "Archetype test", teams: 2, picks: [[1, 1, `Rookie ${index}`, "AAA", "WR", "Alpha"], [1, 2, `Veteran ${index}`, "BBB", "WR", "Beta"]] }));
  const historicalProfiles = seasons.flatMap((season, index) => [
    { name: `Rookie ${index}`, age: 22, asOfYear: season.year, draftYear: season.year },
    { name: `Veteran ${index}`, age: 30, asOfYear: season.year, draftYear: season.year - 7 }
  ]);
  const brain = factory.createBrain({ ...history, seasons }, {
    currentSeason: 2026,
    playerProfiles: [...historicalProfiles, { name: "Current Rookie", age: 22, asOfYear: 2026, draftYear: 2026 }, { name: "Current Veteran", age: 30, asOfYear: 2026, draftYear: 2019 }]
  });
  const prediction = brain.predictPick("alpha", 1, [], {
    currentOverall: 1,
    availablePlayers: [
      { id: "current-rookie", name: "Current Rookie", team: "CCC", position: "WR", rank: 1 },
      { id: "current-veteran", name: "Current Veteran", team: "DDD", position: "WR", rank: 1 }
    ],
    limit: 2
  });
  assert.equal(prediction.players[0].name, "Current Rookie");
  assert.ok(prediction.players[0].archetypeAdjustment > prediction.players[1].archetypeAdjustment);
  assert.ok(prediction.players[0].reasons.some((reason) => /rookie bets/i.test(reason)));
});

test("does not infer historical injury appetite from current durability", () => {
  const seasons = Array.from({ length: 6 }, (_, index) => ({ year: 2020 + index, league: "Injury test", teams: 2, picks: [[1, 1, `Risk ${index}`, "AAA", "RB", "Alpha"], [1, 2, `Safe ${index}`, "BBB", "RB", "Beta"]] }));
  const playerProfiles = seasons.flatMap((season, index) => [
    { name: `Risk ${index}`, draftYear: season.year - 1, age: 23, asOfYear: season.year, durability: 20 },
    { name: `Safe ${index}`, draftYear: season.year - 1, age: 23, asOfYear: season.year, durability: 95 }
  ]);
  const brain = factory.createBrain({ ...history, seasons }, { currentSeason: 2026, playerProfiles });
  assert.ok(brain.personalityFor("alpha").limitations.includes("Injury"));
  assert.equal(brain.profileFor("alpha").archetypeSignals.find((signal) => signal.id === "injuryBet").eligible, 0);
});

test("treats only three-player team concentrations as team stacks", () => {
  const seasons = Array.from({ length: 5 }, (_, index) => ({
    year: 2021 + index,
    league: "Construction test",
    teams: 2,
    picks: [
      [1, 1, `Alpha One ${index}`, "AAA", "RB", "Alpha"],
      [2, 2, `Alpha Two ${index}`, "AAA", "WR", "Alpha"],
      [1, 2, `Beta One ${index}`, "BBB", "QB", "Beta"],
      [2, 1, `Beta Two ${index}`, "BBB", "WR", "Beta"],
      [3, 2, `Beta Three ${index}`, "BBB", "TE", "Beta"]
    ]
  }));
  const brain = factory.createBrain({ ...history, seasons });
  const alphaStack = brain.personalityFor("alpha").construction.find((signal) => signal.id === "teamStack");
  const betaStack = brain.personalityFor("beta").construction.find((signal) => signal.id === "teamStack");

  assert.equal(alphaStack.observedRate, 0);
  assert.equal(betaStack.observedRate, 1);
  assert.equal(betaStack.label, "Three-player NFL team stacks");
});
