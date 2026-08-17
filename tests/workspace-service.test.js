"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createWorkspaceService } = require("../server/workspace-service.js");

function memoryStore(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, structuredClone(value)]));
  return {
    read(key, fallback) { return values.has(key) ? structuredClone(values.get(key)) : structuredClone(fallback); },
    write(key, value) { values.set(key, structuredClone(value)); return value; },
    update(key, updater, fallback) { return this.write(key, updater(this.read(key, fallback))); }
  };
}

function profile(name, managerPrefix) {
  return {
    league: { name, teams: 4, rounds: 4, rosterSize: 4, draftSlot: 1, scoring: "half", userManagerId: `${managerPrefix}-1` },
    managerGroups: Array.from({ length: 4 }, (_, index) => ({ id: `${managerPrefix}-${index + 1}`, name: `${name} Manager ${index + 1}`, aliases: [`${name} Team ${index + 1}`] })),
    seasons: [{ year: 2025, league: name, teams: 4, picks: [[1, 1, "Runner One", "ATL", "RB", `${name} Team 1`], [1, 2, "Receiver One", "DET", "WR", `${name} Team 2`]] }],
    projectedKeepers: [[`${managerPrefix}-1`, "Runner One", 2]],
    imported: true
  };
}

function snapshot(provider, id, name, managerPrefix) {
  return {
    provider,
    id,
    name,
    season: 2026,
    syncedAt: "2026-08-14T20:00:00.000Z",
    profile: profile(name, managerPrefix),
    waiverCandidates: [{ id: `${id}-waiver`, name: "Waiver Player" }],
    teamContext: { rosters: [{ id: `${id}-roster` }], matchups: [{ id: `${id}-matchup` }] }
  };
}

test("migrates synced leagues into isolated active workspaces", () => {
  const first = snapshot("espn", "11", "League One", "one");
  const second = snapshot("yahoo", "22", "League Two", "two");
  const store = memoryStore({
    "league-snapshots": { active: "espn:11", leagues: { "espn:11": first, "yahoo:22": second } }
  });
  const service = createWorkspaceService(store, { now: () => "2026-08-14T21:00:00.000Z" });
  const listed = service.list();
  assert.equal(listed.workspaces.length, 2);
  assert.equal(service.active().name, "League One");
  assert.equal(service.active().brainIndex.picks, 2);
  assert.equal(service.active().brainIndex.managers.length, 4);
  assert.equal(listed.workspaces.find((workspace) => workspace.name === "League One").keepers, 1);
});

test("keeps draft, roster, waiver, and matchup state separate by workspace", () => {
  const service = createWorkspaceService(memoryStore());
  const first = service.create({ name: "Alpha", profile: profile("Alpha", "alpha"), appState: { draftLog: [{ playerId: "alpha-player" }], favoritePlayerIds: ["alpha-player"] } });
  const second = service.create({ name: "Beta", profile: profile("Beta", "beta"), appState: { draftLog: [{ playerId: "beta-player" }] } });
  service.save(first.id, { leagueSnapshot: snapshot("espn", "101", "Alpha", "alpha"), appState: { draftLog: [{ playerId: "alpha-player" }], waiverCandidates: [{ id: "alpha-waiver" }] } });
  service.activate(second.id);

  assert.deepEqual(service.get(first.id).appState.draftLog, [{ playerId: "alpha-player" }]);
  assert.equal(service.get(first.id).leagueSnapshot.teamContext.rosters[0].id, "101-roster");
  assert.deepEqual(service.get(second.id).appState.draftLog, [{ playerId: "beta-player" }]);
  assert.equal(service.active().id, second.id);
});

test("filters prototype keys from saved browser state", () => {
  const service = createWorkspaceService(memoryStore());
  const workspace = service.create({ profile: profile("Safe", "safe") });
  const malicious = JSON.parse('{"settings":{"scoring":"half","__proto__":{"polluted":true}},"draftLog":[]}');
  service.save(workspace.id, { appState: malicious });
  assert.equal(service.get(workspace.id).appState.settings.polluted, undefined);
  assert.equal({}.polluted, undefined);
});

test("imports a secret-free full workspace with app and analysis state", () => {
  const service = createWorkspaceService(memoryStore());
  const workspace = service.create({
    name: "Portable league",
    profile: profile("Portable league", "portable"),
    leagueSnapshot: snapshot("espn", "404", "Portable league", "portable"),
    appState: { draftLog: [{ playerId: "portable-player" }], favoritePlayerIds: ["portable-player"] },
    rankingAnalysis: { status: "completed", summary: "Portable summary" }
  });
  assert.equal(workspace.rankingAnalysis.summary, "Portable summary");
  assert.deepEqual(workspace.appState.favoritePlayerIds, ["portable-player"]);
  assert.equal(workspace.leagueSnapshot.teamContext.rosters.length, 1);
});
