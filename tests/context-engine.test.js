"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../context-engine.js");

const teams = [
  ["AAA", 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 1, 4, 1, 4, 1],
  ["BBB", 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 28, 2, 28, 2, 28]
];
const schedule = Array.from({ length: 17 }, (_, index) => [index % 2 ? "AAA" : "BBB", index % 3 === 0]);
const raw = {
  asOf: "2026-08-06",
  projections: [
    ["Test Runner Jr.", "AAA", "RB", 220, 17, 1, 0, 260, 70, 50, 70, 15],
    ["New Runner", "BBB", "RB", 180, 17, 2, 0, 210, 45, 35, 55, 10]
  ],
  ages: [["Test Runner", "RB", 25, 2022, 2], ["New Runner", "RB", 21, 2026, 1]],
  durability: [["Test Runner", "RB", 90, 88, 0, 2, 1, 3, 0, 0]],
  sos: { RB: [["AAA", 20, 8, 19, 20], ["BBB", 18, 25, 22, 4]] },
  schedules: [["AAA", 8, ...schedule], ["BBB", 25, ...schedule.map(([opponent, home]) => [opponent === "AAA" ? "BBB" : "AAA", home])]],
  units: teams,
  standings: [["AAA", 11, 6, 12, 450, 350, 100, 20], ["BBB", 5, 12, 5, 310, 450, -140, 5]],
  sharp: {
    pace: [["AAA", 66, 64, 27, 26, 62, 125], ["BBB", 55, 54, 31, 30, 50, 105]],
    tendencies: [["AAA", 60, 20, 10, 40, 6], ["BBB", 50, 30, 5, 35, 4]],
    offensiveLine: [["AAA", 20, 22, 3, 1, 14], ["BBB", 35, 31, 1, 4, 22]],
    offense: [["AAA", 0.15, 6, 7, 3, 8, 78], ["BBB", -0.1, 4, 5, 1, 5, 60]],
    defense: [["AAA", 0.12, 5, 5, 2, 5, 70], ["BBB", -0.08, 6, 6, 3, 8, 60]],
    defensiveLine: [["AAA", 45, 42, 1, 20], ["BBB", 25, 28, 3, 14]]
  },
  sources: []
};
const players = [
  { id: "test-runner", name: "Test Runner", team: "AAA", position: "RB", isRookie: false },
  { id: "new-runner", name: "New Runner", team: "BBB", position: "RB", isRookie: true }
];

test("normalizes suffixes and common team aliases", () => {
  assert.equal(engine.normalizeName("Test Runner Jr."), "test runner");
  assert.equal(engine.normalizeTeam("JAX"), "JAC");
});

test("builds projection, environment, and weekly matchup context", () => {
  const context = engine.createContext(raw, players);
  const details = context.playerContext("test-runner");
  assert.equal(context.metricsById["test-runner"].projection, 220);
  assert.equal(details.weekly.length, 17);
  assert.ok(details.team.offenseQuality > context.teamContext("BBB").offenseQuality);
  assert.ok(Number.isFinite(details.schedule.regularScore));
});

test("uses a conservative low-confidence durability prior for rookies", () => {
  const context = engine.createContext(raw, players);
  const durability = context.playerContext("new-runner").durability;
  assert.equal(durability.confidence, "Low");
  assert.ok(durability.score <= 86);
});
