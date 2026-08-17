"use strict";

const crypto = require("node:crypto");
const LeagueProfile = require("../league-profile.js");
const { createBrain } = require("../draft-brain.js");

const STORE_KEY = "league-workspaces";
const BLOCKED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function cleanJson(value, depth = 0) {
  if (depth > 12 || value === null || value === undefined) return value ?? null;
  if (["string", "number", "boolean"].includes(typeof value)) return value;
  if (Array.isArray(value)) return value.slice(0, 5_000).map((item) => cleanJson(item, depth + 1));
  if (typeof value !== "object") return null;
  const result = {};
  Object.entries(value).slice(0, 5_000).forEach(([key, entry]) => {
    if (!BLOCKED_KEYS.has(key)) result[key] = cleanJson(entry, depth + 1);
  });
  return result;
}

function workspaceId(value) {
  const cleaned = String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/(^-|-$)/g, "");
  return cleaned.slice(0, 80) || `league-${crypto.randomUUID()}`;
}

function providerFromSnapshot(snapshot) {
  if (!snapshot?.provider || !snapshot?.id) return null;
  return {
    id: String(snapshot.provider).toLowerCase(),
    leagueId: String(snapshot.id).slice(0, 100),
    season: Math.max(2000, Math.min(2100, Number(snapshot.season) || new Date().getFullYear()))
  };
}

function compactSnapshot(snapshot, profile) {
  if (!snapshot || typeof snapshot !== "object") return null;
  return cleanJson({
    provider: snapshot.provider || profile?.provider?.id || null,
    id: snapshot.id || profile?.provider?.leagueId || null,
    name: snapshot.name || profile?.league?.name || "Fantasy league",
    season: snapshot.season || profile?.provider?.season || null,
    syncedAt: snapshot.syncedAt || null,
    waiverCandidates: Array.isArray(snapshot.waiverCandidates) ? snapshot.waiverCandidates.slice(0, 500) : [],
    teamContext: snapshot.teamContext && typeof snapshot.teamContext === "object" ? snapshot.teamContext : null
  });
}

function normalizeAppState(input) {
  if (!input || typeof input !== "object") return null;
  const clean = cleanJson(input);
  if (Array.isArray(clean.draftLog)) clean.draftLog = clean.draftLog.slice(0, 1_000);
  if (Array.isArray(clean.draftOrder)) clean.draftOrder = clean.draftOrder.slice(0, 30);
  if (Array.isArray(clean.favoritePlayerIds)) clean.favoritePlayerIds = clean.favoritePlayerIds.slice(0, 1_000);
  if (Array.isArray(clean.customPlayers)) clean.customPlayers = clean.customPlayers.slice(0, 500);
  if (Array.isArray(clean.waiverCandidates)) clean.waiverCandidates = clean.waiverCandidates.slice(0, 500);
  return clean;
}

function buildBrainIndex(profile) {
  const brain = createBrain(LeagueProfile.toDraftHistory(profile));
  return {
    generatedAt: new Date().toISOString(),
    model: "deterministic-local-v1",
    seasons: profile.seasons.length,
    picks: brain.picks.length,
    managers: brain.managerProfiles.map((manager) => ({
      ...manager,
      personality: brain.personalityFor(manager.id)
    }))
  };
}

function createWorkspaceService(store, options = {}) {
  const now = options.now || (() => new Date().toISOString());
  const contextProfile = options.contextProfile || null;

  function readState() {
    const current = store.read(STORE_KEY, null);
    if (current?.version === 1 && current.workspaces && typeof current.workspaces === "object") return current;
    return migrateLegacy();
  }

  function writeState(state) {
    return store.write(STORE_KEY, state);
  }

  function uniqueId(preferred, state) {
    const base = workspaceId(preferred);
    if (!state.workspaces[base]) return base;
    let suffix = 2;
    while (state.workspaces[`${base}-${suffix}`]) suffix += 1;
    return `${base}-${suffix}`;
  }

  function normalizeProfile(profileInput, snapshot = null) {
    let profile = LeagueProfile.normalizeProfile({ ...(profileInput || {}), imported: true });
    if (contextProfile) profile = LeagueProfile.mergeProfileContext(profile, { ...contextProfile, imported: true });
    const provider = providerFromSnapshot(snapshot);
    if (provider) profile = LeagueProfile.normalizeProfile({ ...profile, provider, imported: true });
    return profile;
  }

  function makeWorkspace(input, state, preferredId) {
    const timestamp = now();
    const snapshot = input.leagueSnapshot || input.snapshot || null;
    const profile = normalizeProfile(input.profile || snapshot?.profile, snapshot);
    const id = uniqueId(preferredId || input.id || profile.id || profile.league.name, state);
    return {
      version: 1,
      id,
      name: String(input.name || snapshot?.name || profile.league.name || "Fantasy league").trim().slice(0, 100),
      createdAt: timestamp,
      updatedAt: timestamp,
      syncedAt: snapshot?.syncedAt || null,
      provider: providerFromSnapshot(snapshot) || profile.provider || null,
      profile,
      leagueSnapshot: compactSnapshot(snapshot, profile),
      appState: normalizeAppState(input.appState),
      brainIndex: buildBrainIndex(profile),
      rankingAnalysis: cleanJson(input.rankingAnalysis)
    };
  }

  function migrateLegacy() {
    const state = { version: 1, active: null, workspaces: {} };
    const snapshots = store.read("league-snapshots", { active: null, leagues: {} });
    Object.entries(snapshots.leagues || {}).forEach(([key, snapshot]) => {
      if (!snapshot?.profile) return;
      const workspace = makeWorkspace({ snapshot }, state, `${snapshot.provider}-${snapshot.id}`);
      state.workspaces[workspace.id] = workspace;
      if (snapshots.active === key) state.active = workspace.id;
    });
    if (!Object.keys(state.workspaces).length && contextProfile) {
      const workspace = makeWorkspace({ profile: contextProfile, name: contextProfile.league?.name }, state, contextProfile.id);
      state.workspaces[workspace.id] = workspace;
      state.active = workspace.id;
    }
    if (!state.active) state.active = Object.keys(state.workspaces)[0] || null;
    return writeState(state);
  }

  function summary(workspace) {
    return {
      id: workspace.id,
      name: workspace.name,
      provider: workspace.provider,
      updatedAt: workspace.updatedAt,
      syncedAt: workspace.syncedAt,
      seasons: workspace.profile?.seasons?.length || 0,
      historicalPicks: workspace.brainIndex?.picks || 0,
      managers: workspace.profile?.managerGroups?.length || 0,
      keepers: workspace.profile?.projectedKeepers?.length || 0,
      rosters: workspace.leagueSnapshot?.teamContext?.rosters?.length || 0,
      waivers: workspace.leagueSnapshot?.waiverCandidates?.length || workspace.appState?.waiverCandidates?.length || 0,
      matchups: workspace.leagueSnapshot?.teamContext?.matchups?.length || 0,
      analysis: workspace.rankingAnalysis || null
    };
  }

  function list() {
    const state = readState();
    return {
      version: 1,
      active: state.active,
      workspaces: Object.values(state.workspaces).map(summary).sort((left, right) => left.name.localeCompare(right.name))
    };
  }

  function get(id) {
    return readState().workspaces[String(id)] || null;
  }

  function active() {
    const state = readState();
    return state.active ? state.workspaces[state.active] || null : null;
  }

  function create(input = {}) {
    const state = readState();
    const workspace = makeWorkspace(input, state);
    state.workspaces[workspace.id] = workspace;
    if (input.activate !== false) state.active = workspace.id;
    writeState(state);
    return workspace;
  }

  function save(id, input = {}) {
    const state = readState();
    const workspace = state.workspaces[String(id)];
    if (!workspace) throw new Error("League workspace was not found.");
    const snapshot = input.leagueSnapshot === undefined ? workspace.leagueSnapshot : input.leagueSnapshot;
    const profile = input.profile ? normalizeProfile(input.profile, snapshot) : workspace.profile;
    const updated = {
      ...workspace,
      name: String(input.name || workspace.name).trim().slice(0, 100) || workspace.name,
      updatedAt: now(),
      syncedAt: snapshot?.syncedAt || workspace.syncedAt,
      provider: providerFromSnapshot(snapshot) || profile.provider || workspace.provider,
      profile,
      leagueSnapshot: compactSnapshot(snapshot, profile),
      appState: input.appState === undefined ? workspace.appState : normalizeAppState(input.appState),
      brainIndex: input.profile ? buildBrainIndex(profile) : workspace.brainIndex,
      rankingAnalysis: input.rankingAnalysis === undefined ? workspace.rankingAnalysis : cleanJson(input.rankingAnalysis)
    };
    state.workspaces[workspace.id] = updated;
    writeState(state);
    return updated;
  }

  function activate(id) {
    const state = readState();
    if (!state.workspaces[String(id)]) throw new Error("League workspace was not found.");
    state.active = String(id);
    writeState(state);
    return state.workspaces[state.active];
  }

  function remove(id) {
    const state = readState();
    const key = String(id);
    if (!state.workspaces[key]) throw new Error("League workspace was not found.");
    delete state.workspaces[key];
    if (state.active === key) state.active = Object.keys(state.workspaces)[0] || null;
    writeState(state);
    return { active: state.active };
  }

  function upsertFromLeagueSnapshot(snapshot, options = {}) {
    const state = readState();
    const existing = Object.values(state.workspaces).find((workspace) => workspace.provider?.id === snapshot.provider && String(workspace.provider?.leagueId) === String(snapshot.id));
    let workspace;
    if (existing) {
      workspace = {
        ...existing,
        name: String(snapshot.name || existing.name).slice(0, 100),
        updatedAt: now(),
        syncedAt: snapshot.syncedAt || existing.syncedAt,
        profile: normalizeProfile(snapshot.profile || existing.profile, snapshot),
        leagueSnapshot: compactSnapshot(snapshot, snapshot.profile || existing.profile)
      };
      workspace.brainIndex = buildBrainIndex(workspace.profile);
      state.workspaces[workspace.id] = workspace;
    } else {
      workspace = makeWorkspace({ snapshot }, state, `${snapshot.provider}-${snapshot.id}`);
      state.workspaces[workspace.id] = workspace;
    }
    if (options.activate !== false) state.active = workspace.id;
    writeState(state);
    return workspace;
  }

  return Object.freeze({ active, activate, create, get, list, remove, save, upsertFromLeagueSnapshot });
}

module.exports = { STORE_KEY, buildBrainIndex, cleanJson, createWorkspaceService, normalizeAppState };
