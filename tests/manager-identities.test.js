"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const profiles = require("../league-profile.js");

test("normalizes malformed league values without evaluating imported text", () => {
  const profile = profiles.normalizeProfile({
    imported: true,
    league: { name: "<script>alert(1)</script>", teams: 100, rounds: -2, draftSlot: 99, userManagerId: "My Owner" },
    managers: [{ id: "My Owner", name: "<img src=x onerror=alert(1)>", aliases: [] }],
    seasons: [{ year: 9999, picks: [[0, 99, "Player", "TEAMNAME", "invalid", "Manager"]] }]
  });
  assert.equal(profile.league.teams, 20);
  assert.equal(profile.league.rounds, 1);
  assert.equal(profile.league.draftSlot, 20);
  assert.equal(profile.league.userManagerId, "my-owner");
  assert.equal(profile.seasons[0].year, 2100);
  assert.equal(profile.seasons[0].picks[0][4], "WR");
  assert.equal(typeof profile.league.name, "string");
});
