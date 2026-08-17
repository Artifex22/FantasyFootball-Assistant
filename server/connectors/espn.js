"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { normalizeCandidate, normalizeProfile, number, text } = require("./common.js");

const ESPN_HOSTS = new Set(["fantasy.espn.com", "lm-api-reads.fantasy.espn.com", "lm-api-writes.fantasy.espn.com", "www.espn.com", "espn.com"]);
const POSITION_BY_ID = { 1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "DST" };
const LINEUP_SLOT_BY_ID = { 0: "QB", 2: "RB", 4: "WR", 6: "TE", 16: "DST", 17: "K", 20: "BE", 21: "IR", 23: "FLEX" };

function cookiePairs(raw) {
  return String(raw || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return separator > 0 ? [part.slice(0, separator).trim(), part.slice(separator + 1).trim()] : null;
  }).filter(Boolean);
}

function discoverLeagueReferences(values, fallbackSeason = new Date().getFullYear()) {
  const discovered = new Map();
  (values || []).forEach((value) => {
    const source = String(value || "");
    const season = number(source.match(/\/seasons\/(20\d{2})/i)?.[1] || source.match(/[?&]seasonId=(20\d{2})/i)?.[1], fallbackSeason);
    const matches = [...source.matchAll(/\/leagues\/(\d+)/gi), ...source.matchAll(/[?&]leagueId=(\d+)/gi)];
    matches.forEach((match) => discovered.set(match[1], { provider: "espn", id: match[1], name: `ESPN league ${match[1]}`, season }));
  });
  return [...discovered.values()];
}

function parseHar(source) {
  const har = typeof source === "string" ? JSON.parse(source) : source;
  const entries = Array.isArray(har?.log?.entries) ? har.log.entries : [];
  const cookies = {};
  const urls = [];
  entries.forEach((entry) => {
    const request = entry?.request || {};
    let url;
    try { url = new URL(request.url); } catch (error) { return; }
    if (![...ESPN_HOSTS].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) return;
    urls.push(url.href);
    (request.cookies || []).forEach((cookie) => {
      if (["espn_s2", "SWID"].includes(cookie.name) && cookie.value) cookies[cookie.name] = cookie.value;
    });
    const cookieHeader = (request.headers || []).find((header) => String(header.name).toLowerCase() === "cookie")?.value;
    cookiePairs(cookieHeader).forEach(([name, value]) => { if (["espn_s2", "SWID"].includes(name) && value) cookies[name] = value; });
  });
  return { cookies, leagues: discoverLeagueReferences(urls), reviewedEntries: entries.length, espnEntries: urls.length };
}

function fantasyStat(player, week, sourceId, splitTypeId = 1) {
  return (player?.stats || []).find((stat) => Number(stat.statSourceId) === sourceId && Number(stat.statSplitTypeId) === splitTypeId && Number(stat.scoringPeriodId) === Number(week)) || null;
}

function normalizeRosterPlayer(entry, week) {
  const player = entry?.playerPoolEntry?.player || entry?.player || {};
  const projection = fantasyStat(player, week, 1);
  const actual = fantasyStat(player, week, 0);
  const seasonProjection = fantasyStat(player, 0, 1, 0);
  const lineupSlotId = Number(entry?.lineupSlotId);
  return {
    providerId: String(player.id || entry?.playerId || ""),
    name: text(player.fullName || player.name, "Unknown player"),
    position: POSITION_BY_ID[player.defaultPositionId] || text(player.position, "", 8).toUpperCase(),
    proTeamId: number(player.proTeamId),
    lineupSlotId,
    lineupSlot: LINEUP_SLOT_BY_ID[lineupSlotId] || `SLOT ${lineupSlotId}`,
    starter: ![20, 21].includes(lineupSlotId),
    projectedPoints: number(projection?.appliedTotal),
    actualPoints: number(actual?.appliedTotal),
    seasonProjectedPoints: number(seasonProjection?.appliedTotal),
    injuryStatus: text(player.injuryStatus, player.injured ? "INJURED" : "ACTIVE", 30),
    injured: Boolean(player.injured),
    eligibleSlots: Array.isArray(player.eligibleSlots) ? player.eligibleSlots.map(Number).filter(Number.isFinite) : []
  };
}

function extractTeamContext(payload, profile, week) {
  const managerNameById = new Map(profile.managerGroups.map((manager) => [String(manager.id), manager.name]));
  const teams = (payload.teams || []).map((team) => ({
    id: String(team.id),
    name: managerNameById.get(String(team.id)) || text(team.name || [team.location, team.nickname].filter(Boolean).join(" "), `Team ${team.id}`),
    abbreviation: text(team.abbrev, "", 8),
    projectedRank: number(team.currentProjectedRank),
    playoffSeed: number(team.playoffSeed),
    wins: number(team.record?.overall?.wins),
    losses: number(team.record?.overall?.losses),
    pointsFor: number(team.record?.overall?.pointsFor)
  }));
  const rosterByTeam = new Map();
  const rememberRoster = (teamId, roster) => {
    const entries = Array.isArray(roster?.entries) ? roster.entries : [];
    if (!teamId || !entries.length || entries.length <= (rosterByTeam.get(String(teamId))?.length || 0)) return;
    rosterByTeam.set(String(teamId), entries.map((entry) => normalizeRosterPlayer(entry, week)).filter((player) => player.name !== "Unknown player"));
  };
  (payload.teams || []).forEach((team) => rememberRoster(team.id, team.roster));
  const matchups = (payload.schedule || []).map((matchup) => {
    rememberRoster(matchup.home?.teamId, matchup.home?.rosterForCurrentScoringPeriod || matchup.home?.rosterForMatchupPeriod);
    rememberRoster(matchup.away?.teamId, matchup.away?.rosterForCurrentScoringPeriod || matchup.away?.rosterForMatchupPeriod);
    return {
      id: String(matchup.id || `${matchup.matchupPeriodId}-${matchup.home?.teamId}-${matchup.away?.teamId}`),
      week: number(matchup.matchupPeriodId),
      homeTeamId: matchup.home?.teamId === undefined ? null : String(matchup.home.teamId),
      awayTeamId: matchup.away?.teamId === undefined ? null : String(matchup.away.teamId),
      homePoints: number(matchup.home?.totalPoints),
      awayPoints: number(matchup.away?.totalPoints),
      winner: text(matchup.winner, "UNDECIDED", 20)
    };
  }).filter((matchup) => matchup.week && matchup.homeTeamId && matchup.awayTeamId);
  return {
    provider: "espn",
    syncedAt: new Date().toISOString(),
    season: number(payload.seasonId, profile.provider?.season),
    currentWeek: Math.max(1, number(payload.scoringPeriodId || payload.status?.currentMatchupPeriod, week)),
    regularSeasonWeeks: number(payload.settings?.scheduleSettings?.matchupPeriodCount, 14),
    finalScoringPeriod: number(payload.status?.finalScoringPeriod, 17),
    userTeamId: String(profile.league.userManagerId),
    lineupSlotCounts: Object.fromEntries(Object.entries(payload.settings?.rosterSettings?.lineupSlotCounts || {}).map(([slot, count]) => [slot, number(count)])),
    teams,
    matchups,
    rosters: teams.map((team) => ({ teamId: team.id, players: rosterByTeam.get(team.id) || [] }))
  };
}

function readFirefoxSession(profileDirectory) {
  const { DatabaseSync } = require("node:sqlite");
  const cookieDatabase = path.join(profileDirectory, "cookies.sqlite");
  if (!fs.existsSync(cookieDatabase)) throw new Error("Firefox has not created its ESPN profile yet. Open the login window and sign in first.");
  const cookies = {};
  let cookieConnection;
  try {
    cookieConnection = new DatabaseSync(cookieDatabase, { readOnly: true });
    const rows = cookieConnection.prepare("SELECT name, value, host FROM moz_cookies WHERE name IN ('espn_s2', 'SWID') AND (host = 'espn.com' OR host = '.espn.com' OR host LIKE '%.espn.com') ORDER BY lastAccessed DESC").all();
    rows.forEach((cookie) => { if (!cookies[cookie.name] && cookie.value) cookies[cookie.name] = cookie.value; });
  } finally {
    cookieConnection?.close();
  }

  const references = [];
  const placesDatabase = path.join(profileDirectory, "places.sqlite");
  if (fs.existsSync(placesDatabase)) {
    let placesConnection;
    try {
      placesConnection = new DatabaseSync(placesDatabase, { readOnly: true });
      const rows = placesConnection.prepare("SELECT url FROM moz_places WHERE url LIKE '%espn.com%' AND (url LIKE '%leagueId=%' OR url LIKE '%/leagues/%') ORDER BY last_visit_date DESC LIMIT 100").all();
      rows.forEach((row) => references.push(row.url));
    } catch (error) {
      if (!cookies.espn_s2 || !cookies.SWID) throw error;
    } finally {
      placesConnection?.close();
    }
  }
  return { cookies, leagues: discoverLeagueReferences(references), reviewedUrls: references.length };
}

function createEspnConnector(store, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const projectRoot = options.projectRoot || path.dirname(store.directory);
  const browserProfile = path.resolve(store.directory, "espn-firefox-profile");
  let browserProcess = null;

  function credentials() {
    return store.read("connector-espn", { cookies: {}, leagues: [] });
  }

  function save(value) {
    return store.write("connector-espn", value);
  }

  function status() {
    const value = credentials();
    return {
      provider: "espn",
      connected: Boolean(value.cookies?.espn_s2 && value.cookies?.SWID),
      browserRunning: Boolean(browserProcess && !browserProcess.killed),
      leagueCount: Array.isArray(value.leagues) ? value.leagues.length : 0,
      source: value.source || null
    };
  }

  function mergeSession(session, source) {
    const current = credentials();
    const leagueMap = new Map([...(current.leagues || []), ...(session.leagues || [])].map((league) => [String(league.id), league]));
    const cookies = { ...current.cookies, ...(session.cookies || {}) };
    save({ cookies, leagues: [...leagueMap.values()], source, updatedAt: new Date().toISOString() });
    return status();
  }

  function importHar(source) {
    const parsed = parseHar(source);
    if (!parsed.cookies.espn_s2 || !parsed.cookies.SWID) throw new Error("The HAR did not contain both espn_s2 and SWID for an authenticated ESPN request.");
    return { ...mergeSession(parsed, "har"), reviewedEntries: parsed.reviewedEntries, espnEntries: parsed.espnEntries, discoveredLeagues: parsed.leagues.length };
  }

  function browserExecutable() {
    const candidates = [
      process.env.ESPN_FIREFOX_PATH,
      "/usr/bin/firefox",
      "/usr/bin/firefox-esr",
      "/snap/bin/firefox",
      "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe"
    ].filter(Boolean);
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
  }

  function startBrowserLogin() {
    const executable = browserExecutable();
    if (!executable) throw new Error("Mozilla Firefox was not found. Set ESPN_FIREFOX_PATH or use the HAR import instead.");
    if (browserProcess && browserProcess.exitCode === null && !browserProcess.killed) return { ...status(), message: "The dedicated Firefox window is already open." };
    fs.mkdirSync(browserProfile, { recursive: true, mode: 0o700 });
    browserProcess = spawn(executable, [
      "-no-remote",
      "-profile",
      browserProfile,
      "-new-window",
      "https://fantasy.espn.com/football/"
    ], { cwd: projectRoot, detached: false, stdio: "ignore", windowsHide: false });
    browserProcess.once("exit", () => { browserProcess = null; });
    return { ...status(), message: "Use the dedicated Firefox window to sign in and open your fantasy league, then finish the connection in Draft Room." };
  }

  async function captureBrowserSession() {
    const { cookies, leagues, reviewedUrls } = readFirefoxSession(browserProfile);
    if (!cookies.espn_s2 || !cookies.SWID) throw new Error("ESPN login was not detected. Sign in inside the dedicated window and open a league first.");
    return { ...mergeSession({ cookies, leagues }, "dedicated-firefox"), discoveredLeagues: leagues.length, reviewedUrls };
  }

  function addLeague({ leagueId, season }) {
    const id = String(leagueId || "").replace(/\D/g, "");
    if (!id) throw new Error("A numeric ESPN league ID is required.");
    const year = Math.max(2020, Math.min(2100, Number(season) || new Date().getFullYear()));
    return mergeSession({ leagues: [{ provider: "espn", id, name: `ESPN league ${id}`, season: year }] }, credentials().source || "manual");
  }

  async function api(leagueId, season, filter, query = {}) {
    const value = credentials();
    if (!value.cookies?.espn_s2 || !value.cookies?.SWID) throw new Error("ESPN is not connected.");
    const parameters = new URLSearchParams();
    ["mSettings", "mTeam", "mRoster", "mStandings", "mStatus", "mMatchupScore", "mScoreboard", "mLiveScoring", "mPositionalRatings", "kona_player_info"].forEach((view) => parameters.append("view", view));
    Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") parameters.set(key, String(value)); });
    const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?${parameters}`;
    const headers = {
      Accept: "application/json",
      Cookie: `espn_s2=${value.cookies.espn_s2}; SWID=${value.cookies.SWID}`,
      Origin: "https://fantasy.espn.com",
      Referer: `https://fantasy.espn.com/football/league?leagueId=${leagueId}`,
      "User-Agent": "DraftRoomLocal/1.0"
    };
    if (filter) headers["x-fantasy-filter"] = JSON.stringify(filter);
    const response = await fetchImpl(url, { headers });
    if (response.status === 401 || response.status === 403) throw new Error("ESPN session expired. Reconnect with the dedicated login window or a new HAR.");
    if (!response.ok) throw new Error(`ESPN league request failed (${response.status}).`);
    return response.json();
  }

  async function listLeagues() {
    return credentials().leagues || [];
  }

  async function syncLeague(leagueId) {
    const credentialState = credentials();
    const known = (credentialState.leagues || []).find((league) => String(league.id) === String(leagueId));
    const season = Number(known?.season) || new Date().getFullYear();
    const playerFilter = { players: { filterStatus: { value: ["FREEAGENT", "WAIVERS"] }, limit: 500, sortPercOwned: { sortPriority: 1, sortAsc: false } } };
    const payload = await api(leagueId, season, playerFilter);
    const members = new Map((payload.members || []).map((member) => [String(member.id), member.displayName || member.firstName || member.id]));
    const currentOwnerId = String(credentialState.cookies?.SWID || "").replace(/[{}]/g, "").toLowerCase();
    const managers = (payload.teams || []).map((team, index) => ({
      id: String(team.id || index + 1),
      name: text(team.name || [team.location, team.nickname].filter(Boolean).join(" "), `Team ${index + 1}`),
      aliases: (team.owners || []).map((owner) => members.get(String(owner))).filter(Boolean),
      isUser: (team.owners || []).some((owner) => String(owner).replace(/[{}]/g, "").toLowerCase() === currentOwnerId)
    }));
    const scoringItems = payload.settings?.scoringSettings?.scoringItems || [];
    const receptionPoints = number(scoringItems.find((item) => Number(item.statId) === 53)?.points, 0);
    const scoring = receptionPoints >= 0.75 ? "ppr" : receptionPoints >= 0.25 ? "half" : "standard";
    const lineupCounts = payload.settings?.rosterSettings?.lineupSlotCounts || {};
    const rosterSize = Object.values(lineupCounts).reduce((sum, value) => sum + (Number(value) || 0), 0) || 16;
    const candidates = (payload.players || []).map((entry, index) => {
      const player = entry.player || entry.playerPoolEntry?.player || entry;
      return normalizeCandidate({
        providerId: player.id,
        name: player.fullName || player.name,
        position: POSITION_BY_ID[player.defaultPositionId] || player.position,
        team: player.proTeamAbbreviation || player.proTeamId,
        percentOwned: player.ownership?.percentOwned,
        available: true
      }, "espn", index);
    }).filter(Boolean);
    const profile = normalizeProfile({ provider: "espn", leagueId, name: payload.settings?.name || known?.name, season, teams: payload.settings?.size || managers.length, scoring, rosterSize, managers });
    const currentWeek = Math.max(1, number(payload.scoringPeriodId || payload.status?.currentMatchupPeriod, 1));
    const rosterPayload = await api(leagueId, season, playerFilter, { rosterForTeamId: profile.league.userManagerId, scoringPeriodId: currentWeek });
    const teamContext = extractTeamContext({ ...payload, ...rosterPayload, settings: rosterPayload.settings || payload.settings, status: rosterPayload.status || payload.status, teams: rosterPayload.teams || payload.teams, schedule: rosterPayload.schedule || payload.schedule }, profile, currentWeek);
    const teamNameById = new Map(teamContext.teams.map((team) => [team.id, team.name]));
    profile.finalRosters = teamContext.rosters.flatMap((roster) => roster.players.map((player) => [teamNameById.get(roster.teamId) || `Team ${roster.teamId}`, player.name, "Sync", player.position])).filter((row) => row[1] !== "Unknown player" && row[3]);
    const leagues = (credentialState.leagues || []).map((league) => String(league.id) === String(leagueId) ? { ...league, name: profile.league.name, season } : league);
    save({ ...credentialState, leagues });
    return { provider: "espn", id: String(leagueId), name: profile.league.name, season, syncedAt: new Date().toISOString(), profile, waiverCandidates: candidates, teamContext };
  }

  function disconnect() {
    if (browserProcess && !browserProcess.killed) browserProcess.kill();
    browserProcess = null;
    store.remove("connector-espn");
    const expectedPrefix = `${path.resolve(store.directory)}${path.sep}`;
    if (browserProfile.startsWith(expectedPrefix)) fs.rmSync(browserProfile, { recursive: true, force: true });
    return status();
  }

  return Object.freeze({ addLeague, api, captureBrowserSession, disconnect, importHar, listLeagues, startBrowserLogin, status, syncLeague });
}

module.exports = { createEspnConnector, discoverLeagueReferences, extractTeamContext, normalizeRosterPlayer, parseHar, readFirefoxSession };
