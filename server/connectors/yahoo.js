"use strict";

const crypto = require("node:crypto");
const { normalizeCandidate, normalizeProfile, number, text } = require("./common.js");

const AUTH_URL = "https://api.login.yahoo.com/oauth2/request_auth";
const TOKEN_URL = "https://api.login.yahoo.com/oauth2/get_token";
const API_ROOT = "https://fantasysports.yahooapis.com/fantasy/v2";

function flattenRecord(value, output = {}) {
  if (Array.isArray(value)) value.forEach((item) => flattenRecord(item, output));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => {
    if (item === null || ["string", "number", "boolean"].includes(typeof item)) output[key] = item;
    else if (key === "name" && item && typeof item === "object") output.name = item.full || item.first || output.name;
    else if (["manager", "percent_owned", "selected_position"].includes(key)) flattenRecord(item, output);
  });
  return output;
}

function recordsWithKey(value, recordKey, results = [], seen = new Set()) {
  if (Array.isArray(value)) {
    const record = flattenRecord(value, {});
    if (record[recordKey] && !seen.has(String(record[recordKey]))) {
      seen.add(String(record[recordKey]));
      results.push(record);
    }
    value.forEach((item) => recordsWithKey(item, recordKey, results, seen));
  } else if (value && typeof value === "object") {
    if (value[recordKey] && !seen.has(String(value[recordKey]))) {
      seen.add(String(value[recordKey]));
      results.push(flattenRecord(value, {}));
    }
    Object.values(value).forEach((item) => recordsWithKey(item, recordKey, results, seen));
  }
  return results;
}

function createYahooConnector(store, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const origin = options.origin || "http://127.0.0.1:4173";

  function credentials() {
    return store.read("connector-yahoo", {});
  }

  function save(value) {
    return store.write("connector-yahoo", value);
  }

  function configure({ clientId, clientSecret, redirectUri }) {
    const current = credentials();
    save({
      ...current,
      clientId: text(clientId, current.clientId || "", 300),
      clientSecret: text(clientSecret, current.clientSecret || "", 500),
      redirectUri: text(redirectUri, current.redirectUri || `${origin}/api/connectors/yahoo/callback`, 500)
    });
    return status();
  }

  function status() {
    const value = credentials();
    return {
      provider: "yahoo",
      configured: Boolean(value.clientId && value.clientSecret),
      connected: Boolean(value.refreshToken || (value.accessToken && Number(value.expiresAt) > Date.now())),
      redirectUri: value.redirectUri || `${origin}/api/connectors/yahoo/callback`
    };
  }

  function startAuthorization() {
    const value = credentials();
    if (!value.clientId || !value.clientSecret) throw new Error("Yahoo client ID and secret are required first.");
    const state = crypto.randomBytes(24).toString("hex");
    save({ ...value, oauthState: state, oauthStateExpiresAt: Date.now() + 10 * 60_000 });
    const parameters = new URLSearchParams({ client_id: value.clientId, redirect_uri: value.redirectUri, response_type: "code", state, language: "en-us" });
    return `${AUTH_URL}?${parameters}`;
  }

  async function exchangeCode(code, state) {
    const value = credentials();
    if (!state || state !== value.oauthState || Number(value.oauthStateExpiresAt) < Date.now()) throw new Error("Yahoo authorization state is invalid or expired.");
    const authorization = Buffer.from(`${value.clientId}:${value.clientSecret}`).toString("base64");
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", redirect_uri: value.redirectUri, code })
    });
    if (!response.ok) throw new Error(`Yahoo token exchange failed (${response.status}).`);
    const token = await response.json();
    save({
      ...value,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || value.refreshToken,
      tokenType: token.token_type || "bearer",
      expiresAt: Date.now() + Math.max(60, Number(token.expires_in) || 3600) * 1000,
      oauthState: null,
      oauthStateExpiresAt: null
    });
    return status();
  }

  async function accessToken() {
    const value = credentials();
    if (value.accessToken && Number(value.expiresAt) > Date.now() + 60_000) return value.accessToken;
    if (!value.refreshToken) throw new Error("Yahoo is not connected.");
    const authorization = Buffer.from(`${value.clientId}:${value.clientSecret}`).toString("base64");
    const response = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { Authorization: `Basic ${authorization}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", redirect_uri: value.redirectUri, refresh_token: value.refreshToken })
    });
    if (!response.ok) throw new Error(`Yahoo token refresh failed (${response.status}).`);
    const token = await response.json();
    save({ ...value, accessToken: token.access_token, refreshToken: token.refresh_token || value.refreshToken, expiresAt: Date.now() + Math.max(60, Number(token.expires_in) || 3600) * 1000 });
    return token.access_token;
  }

  async function api(pathname) {
    const token = await accessToken();
    const response = await fetchImpl(`${API_ROOT}/${pathname}${pathname.includes("?") ? "&" : "?"}format=json`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (!response.ok) throw new Error(`Yahoo Fantasy request failed (${response.status}).`);
    return response.json();
  }

  async function listLeagues() {
    const payload = await api("users;use_login=1/games;game_keys=nfl/leagues");
    return recordsWithKey(payload, "league_key").map((record) => ({
      provider: "yahoo",
      id: text(record.league_key),
      name: text(record.name, `Yahoo league ${record.league_id || ""}`),
      season: number(record.season, new Date().getFullYear()),
      url: text(record.url)
    }));
  }

  async function syncLeague(leagueId) {
    const encoded = encodeURIComponent(leagueId);
    const [leaguePayload, freeAgentPayload, waiverPayload] = await Promise.all([
      api(`league/${encoded};out=settings,teams,standings`),
      api(`league/${encoded}/players;status=FA;count=200`),
      api(`league/${encoded}/players;status=W;count=200`)
    ]);
    const leagueRecord = recordsWithKey(leaguePayload, "league_key")[0] || { league_key: leagueId };
    const teamRecords = recordsWithKey(leaguePayload, "team_key");
    const managers = teamRecords.map((record, index) => ({
      id: record.team_key || `team-${index + 1}`,
      name: record.name || `Team ${index + 1}`,
      aliases: record.nickname ? [record.nickname] : [],
      isUser: Boolean(Number(record.is_owned_by_current_login))
    }));
    const candidateRecords = [...recordsWithKey(freeAgentPayload, "player_key"), ...recordsWithKey(waiverPayload, "player_key")];
    const candidates = candidateRecords.map((record, index) => normalizeCandidate({
      providerId: record.player_key,
      name: record.name || record.full,
      position: record.display_position || record.position_type,
      team: record.editorial_team_abbr,
      percentOwned: record.value ?? record.percent_owned,
      available: true
    }, "yahoo", index)).filter(Boolean);
    const rosterSize = teamRecords.length ? number(teamRecords[0].roster_size, 16) : 16;
    const profile = normalizeProfile({
      provider: "yahoo",
      leagueId,
      name: leagueRecord.name,
      season: leagueRecord.season,
      teams: number(leagueRecord.num_teams, managers.length),
      rosterSize,
      managers
    });
    return {
      provider: "yahoo",
      id: String(leagueId),
      name: profile.league.name,
      season: profile.provider.season,
      syncedAt: new Date().toISOString(),
      profile,
      waiverCandidates: candidates
    };
  }

  function disconnect() {
    const value = credentials();
    save({ clientId: value.clientId, clientSecret: value.clientSecret, redirectUri: value.redirectUri });
    return status();
  }

  return Object.freeze({ api, configure, disconnect, exchangeCode, listLeagues, startAuthorization, status, syncLeague });
}

module.exports = { createYahooConnector, flattenRecord, recordsWithKey };
