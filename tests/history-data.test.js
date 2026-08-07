"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const profiles = require("../league-profile.js");
const brainFactory = require("../draft-brain.js");

test("public profile starts with generic teams and no private history", () => {
  const profile = profiles.createDefaultProfile();
  const history = profiles.toDraftHistory(profile);
  const brain = brainFactory.createBrain(history);
  assert.equal(profile.imported, false);
  assert.equal(profile.league.teams, 12);
  assert.equal(profile.league.userManagerId, "user");
  assert.equal(history.seasons.length, 0);
  assert.equal(brain.picks.length, 0);
  assert.equal(brain.managerProfiles.length, 12);
});

test("imported profiles customize managers, draft size, and keeper data", () => {
  const profile = profiles.normalizeProfile({
    imported: true,
    league: { name: "Test league", teams: 4, rounds: 10, rosterSize: 10, draftSlot: 2, userManagerId: "mine" },
    managerGroups: [
      { id: "alpha", name: "Alpha", aliases: ["Alpha"] },
      { id: "mine", name: "My Team", aliases: ["My Team"] },
      { id: "beta", name: "Beta", aliases: ["Beta"] },
      { id: "gamma", name: "Gamma", aliases: ["Gamma"] }
    ],
    seasons: [{ year: 2025, teams: 4, picks: [[1, 1, "Runner", "AAA", "RB", "Alpha"], [1, 2, "Catcher", "BBB", "WR", "My Team"]] }],
    finalRosters: [["My Team", "Catcher", "Draft", "WR"]],
    projectedKeepers: [["mine", "Catcher", 4]]
  });
  const brain = brainFactory.createBrain(profiles.toDraftHistory(profile));
  assert.equal(profile.league.rounds, 10);
  assert.equal(brain.picks[1].overall, 2);
  assert.equal(brain.profileFor("mine").sampleSize, 1);
  assert.equal(brain.keeperEligible("mine", "Catcher"), true);
});
