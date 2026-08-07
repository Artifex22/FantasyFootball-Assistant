"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../model.js");

global.window = {};
require("../espn-data.js");
require("../data.js");

const data = global.window.DRAFT_DATA;

test("supports a complete 12-team 16-round draft", () => {
  assert.ok(data.players.length >= 192);
  assert.equal(new Set(data.players.map((player) => player.id)).size, data.players.length);
  assert.deepEqual(data.players.slice(0, 300).map((player) => player.rank), Array.from({ length: 300 }, (_, index) => index + 1));
});

test("keeps recommendations available after 192 recorded picks", () => {
  const context = {
    settings: { scoring: "half", teams: 12, startingQbs: 1 },
    weights: data.defaultWeights,
    metricsById: {},
    draftedIds: [],
    roster: []
  };
  const initial = model.scorePlayers(data.players, context);
  const draftedIds = initial.slice(0, 192).map((result) => result.player.id);
  const remaining = model.scorePlayers(data.players, { ...context, draftedIds });
  assert.equal(remaining.length, data.players.length - 192);
  assert.ok(remaining.every((result) => Number.isFinite(result.recommendationScore)));
});

test("includes the major 2026 rookie board", () => {
  const rookies = data.players.filter((player) => player.isRookie);
  assert.ok(rookies.length >= 37);
  ["Jeremiyah Love", "Carnell Tate", "Jadarian Price", "Jordyn Tyson", "Makai Lemon", "Kenyon Sadiq", "KC Concepcion", "Fernando Mendoza", "Chris Bell"].forEach((name) => {
    assert.ok(rookies.some((player) => player.name === name), `${name} should be marked as a rookie`);
  });
});
