(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.LeagueProfiles = api;
    root.LEAGUE_PROFILE = api.loadProfile(root.localStorage);
    root.DRAFT_HISTORY = api.toDraftHistory(root.LEAGUE_PROFILE);
    root.MANAGER_IDENTITIES = Object.freeze({ currentOwners: Object.freeze({}) });
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  const STORAGE_KEY = "draft-room-league-profile-v1";
  const POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DST"]);
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const slug = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const text = (value, fallback, maximum = 80) => String(value || fallback).trim().slice(0, maximum) || fallback;

  function genericManagers(teams, draftSlot, userManagerId) {
    return Array.from({ length: teams }, (_, index) => {
      const isUser = index === draftSlot - 1;
      return {
        id: isUser ? userManagerId : `team-${index + 1}`,
        name: isUser ? "My Team" : `Team ${index + 1}`,
        aliases: [isUser ? "My Team" : `Team ${index + 1}`],
        confidence: "none"
      };
    });
  }

  function normalizeManagers(input, teams, draftSlot, userManagerId) {
    const seen = new Set();
    const managers = (Array.isArray(input) ? input : []).map((manager, index) => {
      const name = text(manager?.name, `Team ${index + 1}`);
      let id = slug(manager?.id || name) || `team-${index + 1}`;
      while (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      const aliases = [...new Set([name, ...(Array.isArray(manager?.aliases) ? manager.aliases : [])].map((alias) => text(alias, name)).filter(Boolean))];
      return { id, name, aliases, confidence: ["high", "medium", "low", "none"].includes(manager?.confidence) ? manager.confidence : "low" };
    }).slice(0, teams);

    const existingUser = managers.find((manager) => manager.id === userManagerId);
    if (!existingUser) {
      const user = { id: userManagerId, name: "My Team", aliases: ["My Team"], confidence: "none" };
      managers.splice(Math.min(draftSlot - 1, managers.length), 0, user);
    }
    while (managers.length < teams) {
      const number = managers.length + 1;
      let id = `team-${number}`;
      while (seen.has(id) || id === userManagerId) id = `${id}-guest`;
      seen.add(id);
      managers.push({ id, name: `Team ${number}`, aliases: [`Team ${number}`], confidence: "none" });
    }
    return managers.slice(0, teams);
  }

  function normalizeSeason(season, defaultTeams) {
    const teams = clamp(Number(season?.teams) || defaultTeams, 4, 20);
    const picks = (Array.isArray(season?.picks) ? season.picks : []).filter((pick) => Array.isArray(pick) && pick.length >= 6).map((pick) => [
      clamp(Number(pick[0]) || 1, 1, 30),
      clamp(Number(pick[1]) || 1, 1, teams),
      text(pick[2], "Unknown player"),
      text(pick[3], "FA", 5),
      POSITIONS.has(String(pick[4]).toUpperCase()) ? String(pick[4]).toUpperCase() : "WR",
      text(pick[5], "Unknown team")
    ]);
    return { year: clamp(Number(season?.year) || new Date().getFullYear(), 2000, 2100), league: text(season?.league, "Imported league"), teams, picks };
  }

  function normalizeProfile(input = {}) {
    const sourceLeague = input.league || input.settings || {};
    const teams = clamp(Number(sourceLeague.teams) || 12, 4, 20);
    const rounds = clamp(Number(sourceLeague.rounds) || Number(sourceLeague.rosterSize) || 16, 1, 30);
    const rosterSize = clamp(Number(sourceLeague.rosterSize) || rounds, 1, 30);
    const draftSlot = clamp(Number(sourceLeague.draftSlot) || 1, 1, teams);
    const userManagerId = slug(sourceLeague.userManagerId || input.userManagerId || "user") || "user";
    const name = text(sourceLeague.name, "My fantasy league");
    const managerGroups = normalizeManagers(input.managerGroups || input.managers, teams, draftSlot, userManagerId);
    const profileId = slug(input.id || `${name}-${userManagerId}`) || "default-league";
    const seasons = (Array.isArray(input.seasons) ? input.seasons : []).map((season) => normalizeSeason(season, teams));
    const finalRosters = (Array.isArray(input.finalRosters) ? input.finalRosters : []).filter((row) => Array.isArray(row) && row.length >= 4).map((row) => row.slice(0, 4).map((value) => text(value, "")));
    const projectedKeepers = (Array.isArray(input.projectedKeepers) ? input.projectedKeepers : []).filter((row) => Array.isArray(row) && row.length >= 3).map((row) => [slug(row[0]), text(row[1], "Unknown player"), clamp(Number(row[2]) || 1, 1, rounds)]);
    const formerManagerGroups = (Array.isArray(input.formerManagerGroups) ? input.formerManagerGroups : []).map((manager, index) => ({
      id: slug(manager?.id || `former-${index + 1}`),
      name: text(manager?.name, `Former team ${index + 1}`),
      aliases: (Array.isArray(manager?.aliases) ? manager.aliases : []).map((alias) => text(alias, "Former team"))
    }));
    return {
      version: 1,
      id: profileId,
      imported: input.imported === undefined ? Boolean(seasons.length || finalRosters.length || projectedKeepers.length || input.managerGroups || input.managers) : Boolean(input.imported),
      league: {
        name,
        teams,
        rounds,
        rosterSize,
        draftSlot,
        scoring: ["standard", "half", "ppr"].includes(sourceLeague.scoring) ? sourceLeague.scoring : "half",
        startingQbs: Number(sourceLeague.startingQbs) === 2 ? 2 : 1,
        useProjectedKeepers: Boolean(sourceLeague.useProjectedKeepers),
        userManagerId
      },
      managerGroups,
      formerManagerGroups,
      seasons,
      finalRosters,
      projectedKeepers
    };
  }

  function createDefaultProfile() {
    return normalizeProfile({
      id: "default-league",
      league: { name: "My fantasy league", teams: 12, rounds: 16, rosterSize: 16, draftSlot: 1, scoring: "half", startingQbs: 1, useProjectedKeepers: false, userManagerId: "user" },
      managerGroups: genericManagers(12, 1, "user"),
      imported: false
    });
  }

  function createTemplate() {
    return {
      version: 1,
      league: { name: "Example league", teams: 12, rounds: 16, rosterSize: 16, draftSlot: 3, scoring: "half", startingQbs: 1, useProjectedKeepers: false, userManagerId: "my-team" },
      managerGroups: genericManagers(12, 3, "my-team"),
      formerManagerGroups: [],
      seasons: [{ year: 2025, league: "Example league", teams: 12, picks: [[1, 1, "Player name", "NFL", "RB", "Team 1"]] }],
      finalRosters: [["My Team", "Player name", "Draft", "RB"]],
      projectedKeepers: [["my-team", "Player name", 4]]
    };
  }

  function loadProfile(storage) {
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      return saved ? normalizeProfile({ ...JSON.parse(saved), imported: true }) : createDefaultProfile();
    } catch (error) {
      storage?.removeItem(STORAGE_KEY);
      return createDefaultProfile();
    }
  }

  function toDraftHistory(profile) {
    return {
      version: profile.version,
      generated: "local import",
      league: profile.league,
      seasons: profile.seasons,
      managerGroups: profile.managerGroups,
      formerManagerGroups: profile.formerManagerGroups,
      finalRosters: profile.finalRosters,
      projectedKeepers: profile.projectedKeepers
    };
  }

  return Object.freeze({ STORAGE_KEY, normalizeProfile, createDefaultProfile, createTemplate, loadProfile, toDraftHistory });
});
