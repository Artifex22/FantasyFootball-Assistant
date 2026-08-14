"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLocalStore } = require("../server/local-store.js");
const { createEspnConnector, discoverLeagueReferences, parseHar, readFirefoxSession } = require("../server/connectors/espn.js");
const { createYahooConnector, flattenRecord, recordsWithKey } = require("../server/connectors/yahoo.js");

function temporaryStore(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "draft-room-connectors-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return createLocalStore(root);
}

test("ESPN HAR parsing keeps only required cookies and league references", () => {
  const har = {
    log: {
      entries: [
        { request: { url: "https://fantasy.espn.com/football/league?leagueId=12345&seasonId=2026", cookies: [{ name: "espn_s2", value: "session-value" }, { name: "unrelated", value: "discard-me" }], headers: [{ name: "Cookie", value: "SWID={USER}; secret_extra=nope" }] } },
        { request: { url: "https://evil.example/leagues/99999", cookies: [{ name: "espn_s2", value: "evil" }], headers: [] } }
      ]
    }
  };
  const parsed = parseHar(JSON.stringify(har));
  assert.deepEqual(parsed.cookies, { espn_s2: "session-value", SWID: "{USER}" });
  assert.deepEqual(parsed.leagues.map((league) => league.id), ["12345"]);
  assert.equal(parsed.reviewedEntries, 2);
  assert.equal(parsed.espnEntries, 1);
  assert.equal(JSON.stringify(parsed).includes("discard-me"), false);
  assert.equal(JSON.stringify(parsed).includes("secret_extra"), false);
});

test("ESPN connector responses never reveal retained cookie values", (t) => {
  const connector = createEspnConnector(temporaryStore(t), { projectRoot: path.join(os.tmpdir(), "draft-room-no-browser") });
  const result = connector.importHar(JSON.stringify({ log: { entries: [{ request: { url: "https://fantasy.espn.com/football/league?leagueId=42&seasonId=2026", cookies: [{ name: "espn_s2", value: "private-session" }, { name: "SWID", value: "private-user" }], headers: [] } }] } }));
  assert.equal(result.connected, true);
  assert.equal(result.discoveredLeagues, 1);
  assert.equal(JSON.stringify(result).includes("private-session"), false);
  assert.equal(JSON.stringify(result).includes("private-user"), false);
});

test("Firefox profile capture reads only ESPN auth cookies and league URLs", (t) => {
  const { DatabaseSync } = require("node:sqlite");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "draft-room-firefox-"));
  t.after(() => fs.rmSync(profile, { recursive: true, force: true }));
  const cookies = new DatabaseSync(path.join(profile, "cookies.sqlite"));
  cookies.exec("CREATE TABLE moz_cookies (name TEXT, value TEXT, host TEXT, lastAccessed INTEGER)");
  cookies.prepare("INSERT INTO moz_cookies VALUES (?, ?, ?, ?)").run("espn_s2", "firefox-session", ".espn.com", 3);
  cookies.prepare("INSERT INTO moz_cookies VALUES (?, ?, ?, ?)").run("SWID", "{firefox-user}", ".espn.com", 2);
  cookies.prepare("INSERT INTO moz_cookies VALUES (?, ?, ?, ?)").run("other", "discard", ".espn.com", 1);
  cookies.prepare("INSERT INTO moz_cookies VALUES (?, ?, ?, ?)").run("espn_s2", "wrong-host", ".evil.example", 4);
  cookies.close();
  const places = new DatabaseSync(path.join(profile, "places.sqlite"));
  places.exec("CREATE TABLE moz_places (url TEXT, last_visit_date INTEGER)");
  places.prepare("INSERT INTO moz_places VALUES (?, ?)").run("https://fantasy.espn.com/football/team?leagueId=98765&seasonId=2026", 2);
  places.prepare("INSERT INTO moz_places VALUES (?, ?)").run("https://evil.example/?leagueId=111", 1);
  places.close();
  const captured = readFirefoxSession(profile);
  assert.deepEqual(captured.cookies, { espn_s2: "firefox-session", SWID: "{firefox-user}" });
  assert.deepEqual(captured.leagues.map((league) => [league.id, league.season]), [["98765", 2026]]);
  assert.equal(JSON.stringify(captured).includes("discard"), false);
  assert.equal(JSON.stringify(captured).includes("wrong-host"), false);
});

test("ESPN sync maps the authenticated SWID to the user's team", async (t) => {
  const store = temporaryStore(t);
  let requestHeaders;
  const requestUrls = [];
  const connector = createEspnConnector(store, {
    projectRoot: path.join(os.tmpdir(), "draft-room-no-browser"),
    fetchImpl: async (url, options) => {
      requestUrls.push(url);
      requestHeaders = options.headers;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            seasonId: 2026,
            scoringPeriodId: 1,
            status: { currentMatchupPeriod: 1, finalScoringPeriod: 17 },
            settings: { name: "Test ESPN", size: 2, rosterSettings: { lineupSlotCounts: { 0: 1, 2: 2, 20: 5 } }, scoringSettings: { scoringItems: [{ statId: 53, points: 0.5 }] }, scheduleSettings: { matchupPeriodCount: 14 } },
            members: [{ id: "owner-a", displayName: "Manager A" }, { id: "owner-b", displayName: "Manager B" }],
            teams: [{ id: 10, name: "Away Team", owners: ["owner-a"], roster: { entries: [] } }, { id: 20, name: "My Team", owners: ["{OWNER-B}"], roster: { entries: [] } }],
            schedule: [{
              id: 1,
              matchupPeriodId: 1,
              home: { teamId: 20, rosterForCurrentScoringPeriod: { entries: [{ lineupSlotId: 0, playerPoolEntry: { player: { id: 1, fullName: "My Quarterback", defaultPositionId: 1, proTeamId: 1, stats: [{ scoringPeriodId: 1, statSourceId: 1, statSplitTypeId: 1, appliedTotal: 21.5 }] } } }] } },
              away: { teamId: 10, rosterForCurrentScoringPeriod: { entries: [{ lineupSlotId: 0, playerPoolEntry: { player: { id: 2, fullName: "Their Quarterback", defaultPositionId: 1, proTeamId: 2, stats: [{ scoringPeriodId: 1, statSourceId: 1, statSplitTypeId: 1, appliedTotal: 18.25 }] } } }] } }
            }],
            players: []
          };
        }
      };
    }
  });
  connector.importHar(JSON.stringify({ log: { entries: [{ request: { url: "https://fantasy.espn.com/football/league?leagueId=42&seasonId=2026", cookies: [{ name: "espn_s2", value: "private-session" }, { name: "SWID", value: "{owner-b}" }], headers: [] } }] } }));
  const snapshot = await connector.syncLeague("42");
  assert.equal(snapshot.profile.league.userManagerId, "20");
  assert.equal(snapshot.profile.league.draftSlot, 2);
  assert.equal(snapshot.profile.league.scoring, "half");
  assert.equal(snapshot.teamContext.userTeamId, "20");
  assert.equal(snapshot.teamContext.rosters.find((roster) => roster.teamId === "20").players[0].projectedPoints, 21.5);
  assert.equal(snapshot.teamContext.matchups[0].awayTeamId, "10");
  assert.match(requestUrls[1], /rosterForTeamId=20/);
  assert.match(requestHeaders.Cookie, /^espn_s2=/);
  assert.equal(JSON.stringify(snapshot).includes("private-session"), false);
});

test("ESPN league discovery handles path and query formats", () => {
  const leagues = discoverLeagueReferences([
    "https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2025/segments/0/leagues/777",
    "https://fantasy.espn.com/football/team?leagueId=888&seasonId=2026"
  ], 2024);
  assert.deepEqual(leagues.map((league) => [league.id, league.season]), [["777", 2025], ["888", 2026]]);
});

test("Yahoo configuration and status redact credentials", (t) => {
  const store = temporaryStore(t);
  const connector = createYahooConnector(store, { origin: "http://127.0.0.1:4173" });
  const status = connector.configure({ clientId: "client-id", clientSecret: "private-secret" });
  assert.deepEqual(status, { provider: "yahoo", configured: true, connected: false, redirectUri: "http://127.0.0.1:4173/api/connectors/yahoo/callback" });
  assert.equal(JSON.stringify(status).includes("private-secret"), false);
  const authorizationUrl = new URL(connector.startAuthorization());
  assert.equal(authorizationUrl.hostname, "api.login.yahoo.com");
  assert.equal(authorizationUrl.searchParams.get("client_id"), "client-id");
  assert.ok(authorizationUrl.searchParams.get("state"));
  assert.equal(authorizationUrl.href.includes("private-secret"), false);
});

test("Yahoo record flattening treats provider JSON as inert data", () => {
  const fixture = { fantasy_content: { users: [{ leagues: [{ league: [{ league_key: "449.l.123", name: "Test League", season: "2026" }] }] }] } };
  const records = recordsWithKey(fixture, "league_key");
  assert.equal(records.length, 1);
  assert.equal(records[0].league_key, "449.l.123");
  assert.equal(records[0].name, "Test League");
  assert.deepEqual(flattenRecord([{ player_key: "449.p.1" }, { name: { full: "Player Name" } }]), { player_key: "449.p.1", name: "Player Name" });
});
