"use strict";

const POSITIONS = new Set(["QB", "RB", "WR", "TE", "K", "DST"]);
const slug = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const text = (value, fallback = "", maximum = 120) => String(value ?? fallback).trim().slice(0, maximum) || fallback;
const number = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function normalizePosition(value) {
  const position = String(value || "").toUpperCase().replace("D/ST", "DST").replace("DEF", "DST");
  return POSITIONS.has(position) ? position : null;
}

function normalizeCandidate(input, provider, index = 0) {
  const name = text(input.name || input.fullName, "Unknown player");
  const position = normalizePosition(input.position || input.defaultPosition);
  if (!position || name === "Unknown player") return null;
  const rosteredPercent = number(input.rosteredPercent ?? input.percentOwned);
  return {
    id: `${provider}-${text(input.providerId || input.id || slug(name) || index + 1, String(index + 1), 100)}`,
    provider,
    providerId: text(input.providerId || input.id || "", "", 100),
    name,
    position,
    team: text(input.team || input.proTeam || "FA", "FA", 8).toUpperCase(),
    available: input.available !== false,
    rosteredPercent,
    recentUsageTrend: number(input.recentUsageTrend),
    snapShare: number(input.snapShare),
    routeParticipation: number(input.routeParticipation),
    opportunityShare: number(input.opportunityShare),
    opportunity: number(input.opportunity),
    roleDurability: number(input.roleDurability),
    rosProjection: number(input.rosProjection),
    schedule: number(input.schedule),
    positionScarcity: number(input.positionScarcity),
    injuryReplacementWeeks: number(input.injuryReplacementWeeks)
  };
}

function normalizeProfile({ provider, leagueId, name, season, teams, scoring = "half", rosterSize = 16, managers = [] }) {
  const teamCount = Math.max(4, Math.min(20, Number(teams) || managers.length || 12));
  const managerGroups = managers.slice(0, teamCount).map((manager, index) => ({
    id: slug(manager.id || manager.name || `team-${index + 1}`) || `team-${index + 1}`,
    name: text(manager.name, `Team ${index + 1}`),
    aliases: [...new Set([text(manager.name, `Team ${index + 1}`), ...(manager.aliases || []).map((alias) => text(alias))])],
    confidence: "high",
    isUser: Boolean(manager.isUser)
  }));
  while (managerGroups.length < teamCount) {
    const number = managerGroups.length + 1;
    managerGroups.push({ id: `team-${number}`, name: `Team ${number}`, aliases: [`Team ${number}`], confidence: "none" });
  }
  const userManagerId = managerGroups.find((manager) => manager.isUser)?.id || managerGroups[0].id;
  return {
    version: 1,
    id: `${provider}-${slug(leagueId)}`,
    imported: true,
    provider: { id: provider, leagueId: String(leagueId), season: Number(season) || new Date().getFullYear() },
    league: {
      name: text(name, `${provider.toUpperCase()} league`),
      teams: teamCount,
      rounds: Math.max(1, Math.min(30, Number(rosterSize) || 16)),
      rosterSize: Math.max(1, Math.min(30, Number(rosterSize) || 16)),
      draftSlot: Math.max(1, managerGroups.findIndex((manager) => manager.id === userManagerId) + 1),
      scoring: ["standard", "half", "ppr"].includes(scoring) ? scoring : "half",
      startingQbs: 1,
      useProjectedKeepers: false,
      userManagerId
    },
    managerGroups,
    formerManagerGroups: [],
    seasons: [],
    finalRosters: [],
    projectedKeepers: []
  };
}

module.exports = { normalizeCandidate, normalizePosition, normalizeProfile, number, slug, text };
