"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDraftRoomServer, isAllowedHost, isPrivateLocalPath } = require("../server.js");

async function withServer(callback) {
  const server = createDraftRoomServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("allows only local hostnames", () => {
  assert.equal(isAllowedHost("127.0.0.1:4173"), true);
  assert.equal(isAllowedHost("localhost"), true);
  assert.equal(isAllowedHost("example.com"), false);
  assert.equal(isAllowedHost("localhost.example.com"), false);
});

test("recognizes private local data paths", () => {
  assert.equal(isPrivateLocalPath("/local-league-profile.json"), true);
  assert.equal(isPrivateLocalPath("/history-2025.js"), true);
  assert.equal(isPrivateLocalPath("/.local-data/league-workspaces.json"), true);
  assert.equal(isPrivateLocalPath("/server/analysis-service.js"), true);
  assert.equal(isPrivateLocalPath("/app.js"), false);
});

test("serves the app with restrictive security headers", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /connect-src 'self'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(await response.text(), /Draft Room/);
  });
});

test("exposes self-hosted connector status without secrets", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/system/status`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { mode: "self-hosted", version: 2, providers: ["espn", "yahoo"], workspaces: true, codexAnalysis: true });
  });
});

test("rejects cross-origin connector mutations", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/connectors/espn/league`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify({ leagueId: "42", season: 2026 })
    });
    assert.equal(response.status, 403);
  });
});

test("rejects unsupported methods and file extensions", async () => {
  await withServer(async (origin) => {
    const post = await fetch(`${origin}/`, { method: "POST" });
    assert.equal(post.status, 405);
    const executable = await fetch(`${origin}/server.exe`);
    assert.equal(executable.status, 404);
  });
});

test("builds local round-by-round manager brains from JSON", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/league/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile: {
          league: { name: "Test", teams: 4, rounds: 2, userManagerId: "me" },
          managerGroups: [
            { id: "me", name: "Me", aliases: ["Me"] },
            { id: "a", name: "A", aliases: ["A"] },
            { id: "b", name: "B", aliases: ["B"] },
            { id: "c", name: "C", aliases: ["C"] }
          ],
          seasons: [{ year: 2025, teams: 4, picks: [[1, 1, "Runner", "ATL", "RB", "A"], [2, 2, "Receiver", "DET", "WR", "A"]] }]
        },
        availablePlayers: [{ id: "rb", name: "Available Runner", team: "ATL", position: "RB", rank: 1 }]
      })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.model, "deterministic-local-v1");
    assert.equal(result.history.picks, 2);
    assert.equal(result.managers.length, 4);
    assert.equal(result.managers[1].rounds.length, 2);
  });
});

test("rejects non-JSON league analysis requests", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/api/league/analyze`, { method: "POST", body: "not json" });
    assert.equal(response.status, 415);
  });
});

test("bootstraps the local profile without exposing its JSON file", async () => {
  await withServer(async (origin) => {
    const bootstrap = await fetch(`${origin}/local-profile-bootstrap.js`);
    assert.equal(bootstrap.status, 200);
    const bootstrapSource = await bootstrap.text();
    assert.match(bootstrapSource, /window\.LOCAL_LEAGUE_PROFILE =/);
    assert.match(bootstrapSource, /window\.LOCAL_LEAGUE_SNAPSHOT =/);
    assert.match(bootstrapSource, /window\.LOCAL_WORKSPACE =/);
    const privateProfile = await fetch(`${origin}/local-league-profile.json`);
    assert.equal(privateProfile.status, 404);
  });
});

test("does not expose files outside the project root", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/..%2F..%2FWindows%2Fwin.ini`);
    assert.equal(response.status, 403);
  });
});

test("does not expose private server-side workspace files", async () => {
  await withServer(async (origin) => {
    const workspaceStore = await fetch(`${origin}/.local-data/league-workspaces.json`);
    assert.equal(workspaceStore.status, 404);
    const serverSource = await fetch(`${origin}/server/workspace-service.js`);
    assert.equal(serverSource.status, 404);
  });
});
