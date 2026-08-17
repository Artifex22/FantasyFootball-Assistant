(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.LeagueProfiles = api;
    root.LEAGUE_PROFILE = api.loadProfile(root.localStorage, root.LOCAL_LEAGUE_PROFILE);
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
  const headerKey = (value) => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "");

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
    const picks = (Array.isArray(season?.picks) ? season.picks : []).filter((pick) => Array.isArray(pick) && pick.length >= 6).map((pick) => {
      const position = String(pick[4] || "").toUpperCase();
      if (!POSITIONS.has(position)) return null;
      return [
        clamp(Number(pick[0]) || 1, 1, 30),
        clamp(Number(pick[1]) || 1, 1, teams),
        text(pick[2], "Unknown player"),
        text(pick[3], "FA", 5),
        position,
        text(pick[5], "Unknown team")
      ];
    }).filter(Boolean);
    return { year: clamp(Number(season?.year) || new Date().getFullYear(), 2000, 2100), league: text(season?.league, "Imported league"), teams, picks };
  }

  function parseCsvRows(source) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character === '"') {
        if (quoted && source[index + 1] === '"') {
          value += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (character === "," && !quoted) {
        row.push(value.trim());
        value = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(value.trim());
        value = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else {
        value += character;
      }
    }
    row.push(value.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  function parseHistoricalDraftText(source, options = {}) {
    const raw = String(source || "").trim();
    if (!raw) return { seasons: [], imported: 0, errors: ["No draft history was provided."], format: "unknown" };
    const teams = clamp(Number(options.teams) || 12, 4, 20);
    const leagueName = text(options.leagueName, "Imported league");
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        const parsed = JSON.parse(raw);
        const candidates = Array.isArray(parsed) ? parsed : Array.isArray(parsed.seasons) ? parsed.seasons : Array.isArray(parsed.picks) ? [parsed] : [];
        const seasons = candidates.map((season) => normalizeSeason({ ...season, league: season.league || leagueName, teams: season.teams || teams }, teams)).filter((season) => season.picks.length);
        const imported = seasons.reduce((total, season) => total + season.picks.length, 0);
        return { seasons, imported, errors: imported ? [] : ["JSON contained no valid draft picks."], format: "json" };
      } catch (error) {
        return { seasons: [], imported: 0, errors: [`Invalid JSON: ${error.message}`], format: "json" };
      }
    }

    const rows = parseCsvRows(raw);
    if (rows.length < 2) return { seasons: [], imported: 0, errors: ["CSV needs a header and at least one pick."], format: "csv" };
    const headers = rows[0].map(headerKey);
    const aliases = {
      year: ["year", "season"],
      league: ["league", "league_name"],
      round: ["round", "draft_round"],
      slot: ["slot", "round_pick", "pick_in_round"],
      overall: ["overall", "overall_pick", "pick"],
      player: ["player", "player_name"],
      nflTeam: ["nfl_team", "pro_team", "team"],
      position: ["position", "pos"],
      manager: ["manager", "manager_name", "fantasy_team", "team_name"]
    };
    const column = (name) => aliases[name].map((alias) => headers.indexOf(alias)).find((index) => index >= 0) ?? -1;
    const columns = Object.fromEntries(Object.keys(aliases).map((name) => [name, column(name)]));
    const missing = ["year", "player", "position", "manager"].filter((name) => columns[name] < 0);
    if (columns.round < 0 && columns.overall < 0) missing.push("round or overall");
    if (missing.length) return { seasons: [], imported: 0, errors: [`Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`], format: "csv" };

    const grouped = new Map();
    const errors = [];
    rows.slice(1).forEach((values, rowIndex) => {
      const year = Number(values[columns.year]);
      const overall = columns.overall >= 0 ? Number(values[columns.overall]) : null;
      const draftRound = columns.round >= 0 ? Number(values[columns.round]) : Math.floor((overall - 1) / teams) + 1;
      const slot = columns.slot >= 0 ? Number(values[columns.slot]) : ((overall - 1) % teams) + 1;
      const player = text(values[columns.player], "", 80);
      const position = String(values[columns.position] || "").toUpperCase();
      const manager = text(values[columns.manager], "", 80);
      if (!Number.isFinite(year) || year < 2000 || year > 2100 || !Number.isFinite(draftRound) || draftRound < 1 || draftRound > 30 || !Number.isFinite(slot) || slot < 1 || slot > teams || !player || !manager || !POSITIONS.has(position)) {
        errors.push(`Row ${rowIndex + 2} was skipped: verify year, round/overall, slot, player, manager, and position.`);
        return;
      }
      const league = columns.league >= 0 ? text(values[columns.league], leagueName) : leagueName;
      const nflTeam = columns.nflTeam >= 0 ? text(values[columns.nflTeam], "FA", 5).toUpperCase() : "FA";
      const groupKey = `${year}:${league}`;
      if (!grouped.has(groupKey)) grouped.set(groupKey, { year, league, teams, picks: [] });
      grouped.get(groupKey).picks.push([draftRound, slot, player, nflTeam, position, manager]);
    });
    const seasons = [...grouped.values()].map((season) => ({ ...season, picks: season.picks.sort((left, right) => left[0] - right[0] || left[1] - right[1]) })).sort((left, right) => left.year - right.year);
    return { seasons, imported: seasons.reduce((total, season) => total + season.picks.length, 0), errors, format: "csv" };
  }

  function mergeHistoricalDrafts(profile, importedSeasons) {
    const normalizedProfile = normalizeProfile(profile);
    const replacements = new Set((importedSeasons || []).map((season) => Number(season.year)));
    const seasons = normalizedProfile.seasons.filter((season) => !replacements.has(Number(season.year))).concat(importedSeasons || []).sort((left, right) => Number(left.year) - Number(right.year));
    return normalizeProfile({ ...normalizedProfile, imported: true, seasons });
  }

  function createHistoryCsvTemplate() {
    return [
      "season,league,overall,round,round_pick,manager,player,nfl_team,position",
      "2025,Example league,1,1,1,Team One,Player Name,DET,RB",
      "2025,Example league,2,1,2,Team Two,Player Name,CIN,WR"
    ].join("\n");
  }

  function normalizeYearScores(input) {
    const scores = {};
    if (!input || typeof input !== "object" || Array.isArray(input)) return scores;
    Object.entries(input).slice(0, 20).forEach(([year, value]) => {
      const numericYear = Number(year);
      const numericValue = Number(value);
      if (Number.isInteger(numericYear) && numericYear >= 2000 && numericYear <= 2100 && Number.isFinite(numericValue)) scores[numericYear] = clamp(numericValue, 0, 100);
    });
    return scores;
  }

  function normalizePlayerMetadata(input) {
    return (Array.isArray(input) ? input : []).slice(0, 2_000).map((record) => {
      const name = text(record?.name, "", 80);
      if (!name) return null;
      const position = String(record?.position || "").toUpperCase();
      const numeric = (value, minimum, maximum) => Number.isFinite(Number(value)) ? clamp(Number(value), minimum, maximum) : null;
      return {
        name,
        ...(POSITIONS.has(position) ? { position } : {}),
        age: numeric(record.age, 18, 50),
        asOfYear: numeric(record.asOfYear, 2000, 2100),
        birthYear: numeric(record.birthYear, 1950, 2100),
        draftYear: numeric(record.draftYear, 1950, 2100),
        heightIn: numeric(record.heightIn, 60, 90),
        weightLb: numeric(record.weightLb, 140, 400),
        nflDraftRound: numeric(record.nflDraftRound, 1, 7),
        durabilityByYear: normalizeYearScores(record.durabilityByYear),
        roleClarityByYear: normalizeYearScores(record.roleClarityByYear)
      };
    }).filter(Boolean);
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
    const projectedKeeperMap = new Map();
    (Array.isArray(input.projectedKeepers) ? input.projectedKeepers : []).filter((row) => Array.isArray(row) && row.length >= 3).forEach((row) => {
      const managerId = slug(row[0]);
      if (managerId) projectedKeeperMap.set(managerId, [managerId, text(row[1], "Unknown player"), clamp(Number(row[2]) || 1, 1, rounds)]);
    });
    const projectedKeepers = [...projectedKeeperMap.values()];
    const sourceProvider = input.provider && typeof input.provider === "object" ? input.provider : null;
    const provider = sourceProvider ? {
      id: ["espn", "yahoo"].includes(String(sourceProvider.id).toLowerCase()) ? String(sourceProvider.id).toLowerCase() : "local",
      leagueId: text(sourceProvider.leagueId, "", 100),
      season: clamp(Number(sourceProvider.season) || new Date().getFullYear(), 2000, 2100)
    } : null;
    const formerManagerGroups = (Array.isArray(input.formerManagerGroups) ? input.formerManagerGroups : []).map((manager, index) => ({
      id: slug(manager?.id || `former-${index + 1}`),
      name: text(manager?.name, `Former team ${index + 1}`),
      aliases: (Array.isArray(manager?.aliases) ? manager.aliases : []).map((alias) => text(alias, "Former team"))
    }));
    const playerMetadata = normalizePlayerMetadata(input.playerMetadata);
    return {
      version: 1,
      id: profileId,
      imported: input.imported === undefined ? Boolean(seasons.length || finalRosters.length || projectedKeepers.length || input.managerGroups || input.managers) : Boolean(input.imported),
      ...(provider ? { provider } : {}),
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
      projectedKeepers,
      playerMetadata
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
      projectedKeepers: [["my-team", "Player name", 4]],
      playerMetadata: [{ name: "Player name", position: "RB", age: 23.5, asOfYear: 2026, draftYear: 2025, heightIn: 71, weightLb: 212, nflDraftRound: 2, durabilityByYear: { 2025: 72 }, roleClarityByYear: { 2025: 55 } }]
    };
  }

  function profileContextMatches(profile, contextProfile) {
    if (!profile?.provider || !contextProfile?.imported || Number(profile.league?.teams) !== Number(contextProfile.league?.teams)) return false;
    const contextAliases = new Set((contextProfile.managerGroups || []).flatMap((manager) => manager.aliases || []).map(slug).filter(Boolean));
    const matchedManagers = (profile.managerGroups || []).filter((manager) => (manager.aliases || []).some((alias) => contextAliases.has(slug(alias)))).length;
    const requiredMatches = Math.max(4, Math.ceil(Number(profile.league?.teams || 0) * 0.6));
    const leagueName = slug(profile.league?.name);
    const historicalLeagueMatch = (contextProfile.seasons || []).some((season) => slug(season.league) === leagueName);
    return matchedManagers >= requiredMatches || (historicalLeagueMatch && matchedManagers >= 4);
  }

  function mergeProfileContext(profileInput, contextInput) {
    const profile = normalizeProfile(profileInput);
    const contextProfile = normalizeProfile(contextInput);
    if (!profileContextMatches(profile, contextProfile)) return profile;

    const contextManagerByAlias = new Map();
    contextProfile.managerGroups.forEach((manager) => manager.aliases.forEach((alias) => contextManagerByAlias.set(slug(alias), manager)));
    const contextToProfileManager = new Map();
    const managerGroups = profile.managerGroups.map((manager) => {
      const contextManager = manager.aliases.map((alias) => contextManagerByAlias.get(slug(alias))).find(Boolean);
      if (!contextManager) return manager;
      contextToProfileManager.set(contextManager.id, manager.id);
      return {
        ...manager,
        aliases: [...new Set([...manager.aliases, ...contextManager.aliases])],
        confidence: contextManager.confidence === "high" ? "high" : manager.confidence
      };
    });
    const projectedKeepers = contextProfile.projectedKeepers.map(([managerId, player, draftRound]) => {
      const syncedManagerId = contextToProfileManager.get(managerId);
      return syncedManagerId ? [syncedManagerId, player, draftRound] : null;
    }).filter(Boolean);

    return normalizeProfile({
      ...profile,
      league: { ...profile.league, draftSlot: contextProfile.league.draftSlot, useProjectedKeepers: projectedKeepers.length > 0 || profile.league.useProjectedKeepers },
      managerGroups,
      formerManagerGroups: contextProfile.formerManagerGroups,
      seasons: contextProfile.seasons,
      finalRosters: profile.finalRosters.length ? profile.finalRosters : contextProfile.finalRosters,
      projectedKeepers
    });
  }

  function loadProfile(storage, localProfile) {
    try {
      const saved = storage?.getItem(STORAGE_KEY);
      const normalizedLocal = localProfile ? normalizeProfile({ ...localProfile, imported: true }) : null;
      if (saved) {
        const normalizedSaved = normalizeProfile({ ...JSON.parse(saved), imported: true });
        if (normalizedLocal?.provider?.id && normalizedSaved.id !== normalizedLocal.id) return normalizedLocal;
        if (!normalizedLocal || normalizedSaved.id !== normalizedLocal.id) return normalizedLocal ? mergeProfileContext(normalizedSaved, normalizedLocal) : normalizedSaved;
      }
      if (normalizedLocal) return normalizedLocal;
      return createDefaultProfile();
    } catch (error) {
      storage?.removeItem(STORAGE_KEY);
      return localProfile ? normalizeProfile({ ...localProfile, imported: true }) : createDefaultProfile();
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
      projectedKeepers: profile.projectedKeepers,
      playerMetadata: profile.playerMetadata
    };
  }

  return Object.freeze({ STORAGE_KEY, normalizeProfile, createDefaultProfile, createTemplate, parseHistoricalDraftText, mergeHistoricalDrafts, createHistoryCsvTemplate, profileContextMatches, mergeProfileContext, loadProfile, toDraftHistory });
});
