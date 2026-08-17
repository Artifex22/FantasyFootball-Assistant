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

test("local bootstrap profile loads when browser storage is empty", () => {
  const profile = profiles.loadProfile({ getItem: () => null, removeItem: () => {} }, {
    league: { name: "Local league", teams: 10, rounds: 15, draftSlot: 2, userManagerId: "mine" },
    managerGroups: [{ id: "mine", name: "My Team", aliases: ["My Team"] }]
  });
  assert.equal(profile.imported, true);
  assert.equal(profile.league.name, "Local league");
  assert.equal(profile.league.teams, 10);
});

test("same-league local bootstrap updates override stale browser copies", () => {
  const stale = profiles.normalizeProfile({ league: { name: "Local", userManagerId: "me" }, projectedKeepers: [["me", "Old Keeper", 9]] });
  const current = { ...stale, projectedKeepers: [["me", "Confirmed Keeper", 6]] };
  const storage = { getItem: () => JSON.stringify(stale), removeItem: () => {} };
  const loaded = profiles.loadProfile(storage, current);
  assert.deepEqual(loaded.projectedKeepers, [["me", "Confirmed Keeper", 6]]);
});

test("active self-hosted league replaces a stale different browser profile", () => {
  const stale = profiles.normalizeProfile({ imported: true, league: { name: "Private league", userManagerId: "me" } });
  const active = profiles.normalizeProfile({
    id: "espn-42",
    imported: true,
    provider: { id: "espn", leagueId: "42", season: 2026 },
    league: { name: "Example League", userManagerId: "8" }
  });
  const storage = { getItem: () => JSON.stringify(stale), removeItem: () => {} };
  const loaded = profiles.loadProfile(storage, active);
  assert.equal(loaded.id, "espn-42");
  assert.equal(loaded.league.name, "Example League");
});

test("confirmed keepers normalize to one authoritative entry per manager", () => {
  const profile = profiles.normalizeProfile({
    league: { name: "Keeper league", userManagerId: "me" },
    projectedKeepers: [["me", "Old Cost", 4], ["other", "Other Keeper", 8], ["me", "Confirmed Keeper", 6]]
  });
  assert.deepEqual(profile.projectedKeepers, [["me", "Confirmed Keeper", 6], ["other", "Other Keeper", 8]]);
});

test("synced leagues inherit matched local keepers and draft context", () => {
  const local = profiles.normalizeProfile({
    imported: true,
    league: { name: "Private league", teams: 4, draftSlot: 3, userManagerId: "manager-one", useProjectedKeepers: true },
    managerGroups: [
      { id: "manager-one", name: "Manager One", aliases: ["Manager One", "Former Team One"], confidence: "high" },
      { id: "manager-two", name: "Manager Two", aliases: ["Manager Two"], confidence: "high" },
      { id: "manager-three", name: "Manager Three", aliases: ["Manager Three"], confidence: "high" },
      { id: "manager-four", name: "Manager Four", aliases: ["Manager Four"], confidence: "high" }
    ],
    seasons: [{ year: 2025, league: "Example League", teams: 4, picks: [[1, 1, "Runner", "AAA", "RB", "Former Team One"]] }],
    projectedKeepers: [["manager-one", "Example Receiver", 6], ["manager-two", "Example Runner", 8]]
  });
  const synced = profiles.normalizeProfile({
    id: "espn-123",
    imported: true,
    provider: { id: "espn", leagueId: "123", season: 2026 },
    league: { name: "Example League", teams: 4, rosterSize: 17, draftSlot: 1, userManagerId: "8" },
    managerGroups: [
      { id: "8", name: "Manager One", aliases: ["Manager One"] },
      { id: "7", name: "Manager Two", aliases: ["Manager Two"] },
      { id: "4", name: "Manager Three", aliases: ["Manager Three"] },
      { id: "1", name: "Manager Four", aliases: ["Manager Four"] }
    ],
    finalRosters: [["Manager One", "Current Player", "Sync", "WR"]]
  });
  const storage = { getItem: () => JSON.stringify(synced), removeItem: () => {} };
  const merged = profiles.loadProfile(storage, local);
  assert.equal(merged.id, "espn-123");
  assert.equal(merged.league.rounds, 17);
  assert.equal(merged.league.userManagerId, "8");
  assert.equal(merged.league.draftSlot, 3);
  assert.equal(merged.league.useProjectedKeepers, true);
  assert.deepEqual(merged.projectedKeepers, [["8", "Example Receiver", 6], ["7", "Example Runner", 8]]);
  assert.equal(merged.seasons.length, 1);
  assert.deepEqual(merged.finalRosters, [["Manager One", "Current Player", "Sync", "WR"]]);
  assert.ok(merged.managerGroups.find((manager) => manager.id === "8").aliases.includes("Former Team One"));
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

test("parses canonical historical draft CSV and replaces matching seasons", () => {
  const parsed = profiles.parseHistoricalDraftText([
    "season,league,overall,manager,player,nfl_team,position",
    "2025,Test league,1,Alpha,Runner,AAA,RB",
    "2025,Test league,2,My Team,Catcher,BBB,WR"
  ].join("\n"), { teams: 4, leagueName: "Test league" });
  assert.equal(parsed.imported, 2);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.seasons[0].picks[1], [1, 2, "Catcher", "BBB", "WR", "My Team"]);

  const base = profiles.normalizeProfile({
    imported: true,
    league: { name: "Test league", teams: 4, rounds: 10, userManagerId: "mine" },
    managerGroups: [{ id: "mine", name: "My Team", aliases: ["My Team"] }],
    seasons: [{ year: 2025, league: "Test league", teams: 4, picks: [[1, 1, "Old", "AAA", "RB", "My Team"]] }]
  });
  const merged = profiles.mergeHistoricalDrafts(base, parsed.seasons);
  assert.equal(merged.seasons.length, 1);
  assert.equal(merged.seasons[0].picks.length, 2);
});

test("historical import skips unknown positions instead of guessing", () => {
  const parsed = profiles.parseHistoricalDraftText([
    "season,overall,manager,player,nfl_team,position",
    "2025,1,Team One,Mystery,AAA,XYZ"
  ].join("\n"), { teams: 12 });
  assert.equal(parsed.imported, 0);
  assert.equal(parsed.errors.length, 1);
});

test("normalizes optional dated player archetype metadata", () => {
  const profile = profiles.normalizeProfile({
    league: { name: "Metadata", teams: 4, rounds: 4, userManagerId: "me" },
    playerMetadata: [{ name: "Player One", position: "RB", age: 23.4, asOfYear: 2026, draftYear: 2025, heightIn: 71, weightLb: 214, nflDraftRound: 2, durabilityByYear: { 2025: 58 }, roleClarityByYear: { 2025: 42 } }]
  });
  assert.equal(profile.playerMetadata[0].weightLb, 214);
  assert.equal(profile.playerMetadata[0].durabilityByYear[2025], 58);
  assert.equal(profiles.toDraftHistory(profile).playerMetadata.length, 1);
});
