"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const teamEngine = require("../team-engine.js");

function player(name, position, slot, projectedPoints, extra = {}) {
  return { name, position, lineupSlotId: slot, lineupSlot: slot === 0 ? "QB" : slot === 2 ? "RB" : slot === 20 ? "BE" : "FLEX", starter: ![20, 21].includes(slot), projectedPoints, injuryStatus: "ACTIVE", ...extra };
}

function fixture() {
  return {
    currentWeek: 1,
    finalScoringPeriod: 17,
    syncedAt: "2026-09-10T12:00:00.000Z",
    userTeamId: "me",
    teams: [{ id: "me", name: "My Team", wins: 1, losses: 0 }, { id: "them", name: "Opponent", wins: 0, losses: 1 }],
    matchups: [{ week: 1, homeTeamId: "me", awayTeamId: "them" }, { week: 2, homeTeamId: "them", awayTeamId: "me" }],
    rosters: [
      { teamId: "me", players: [player("My QB", "QB", 0, 22), player("My RB", "RB", 2, 10), player("Bench RB", "RB", 20, 14)] },
      { teamId: "them", players: [player("Their QB", "QB", 0, 18), player("Their RB", "RB", 2, 16)] }
    ]
  };
}

test("builds weekly head-to-head comparisons and highlights the stronger slot", () => {
  const dashboard = teamEngine.createDashboard(fixture(), 1, [], null);
  assert.equal(dashboard.myProjection, 32);
  assert.equal(dashboard.opponentProjection, 34);
  assert.equal(dashboard.projectedEdge, -2);
  assert.equal(dashboard.comparisons.find((row) => row.label === "QB").edge, "mine");
  assert.equal(dashboard.comparisons.find((row) => row.label === "RB").edge, "theirs");
  assert.equal(dashboard.myRoster.players.find((entry) => entry.name === "My QB").positionRank, 1);
});

test("detects a material bench upgrade without changing the lineup", () => {
  const dashboard = teamEngine.createDashboard(fixture(), 1, [], null);
  assert.equal(dashboard.alerts[0].type, "swap");
  assert.equal(dashboard.alerts[0].candidate.name, "Bench RB");
  assert.equal(dashboard.alerts[0].replacement.name, "My RB");
  assert.equal(dashboard.alerts[0].delta, 4);
});

test("uses matchup-adjusted model projections outside the active ESPN week", () => {
  const catalog = [{ id: "my-qb", name: "My QB", position: "QB" }, { id: "their-qb", name: "Their QB", position: "QB" }];
  const details = new Map([
    ["my-qb", { projection: { points: 340, games: 17 }, weekly: [{ week: 2, score: 75, label: "@NYG", rank: 8, difficulty: "Good" }] }],
    ["their-qb", { projection: { points: 306, games: 17 }, weekly: [{ week: 2, score: 25, label: "vsDEN", rank: 27, difficulty: "Difficult" }] }]
  ]);
  const dashboard = teamEngine.createDashboard(fixture(), 2, catalog, { playerContext: (tracked) => details.get(tracked.id) });
  const mine = dashboard.myRoster.players.find((entry) => entry.name === "My QB");
  assert.equal(mine.projectionSource, "Model fallback");
  assert.equal(mine.opponent, "@NYG");
  assert.ok(mine.projectedPoints > dashboard.opponentRoster.players.find((entry) => entry.name === "Their QB").projectedPoints);
});
