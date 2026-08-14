(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TeamEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SLOT_ORDER = [0, 2, 4, 6, 23, 17, 16];
  const UNIT_POSITIONS = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST"];
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  const round = (value, places = 1) => Number(Number(value || 0).toFixed(places));
  const finite = (value) => Number.isFinite(Number(value)) && value !== null && value !== "";
  const nameKey = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[.'’]/g, "").replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();

  function gradeForRank(rank, total) {
    if (!rank || !total) return 55;
    return Math.round(98 - ((rank - 1) / Math.max(1, total - 1)) * 43);
  }

  function letterGrade(score) {
    if (score >= 95) return "A+";
    if (score >= 90) return "A";
    if (score >= 87) return "A-";
    if (score >= 83) return "B+";
    if (score >= 80) return "B";
    if (score >= 77) return "B-";
    if (score >= 73) return "C+";
    if (score >= 69) return "C";
    if (score >= 65) return "C-";
    return "D";
  }

  function evaluatePlayer(player, week, catalogByName, contextApi, currentWeek) {
    const tracked = catalogByName.get(nameKey(player.name)) || null;
    const details = tracked ? contextApi?.playerContext?.(tracked) : null;
    const matchup = details?.weekly?.find((entry) => Number(entry.week) === Number(week)) || null;
    const seasonPerGame = details?.projection ? Number(details.projection.points) / Math.max(1, Number(details.projection.games) || 17) : null;
    const matchupMultiplier = matchup?.bye ? 0 : matchup ? 0.8 + clamp(Number(matchup.score) || 50, 0, 100) * 0.004 : 1;
    const modelProjection = finite(seasonPerGame) ? seasonPerGame * matchupMultiplier : null;
    const espnProjection = Number(week) === Number(currentWeek) && finite(player.projectedPoints) ? Number(player.projectedPoints) : null;
    const projectedPoints = espnProjection ?? modelProjection;
    return {
      ...player,
      trackedId: tracked?.id || null,
      nflTeam: tracked?.team || "",
      projectedPoints: finite(projectedPoints) ? round(projectedPoints) : null,
      projectionSource: espnProjection !== null ? "ESPN weekly" : modelProjection !== null ? "Model fallback" : "Unavailable",
      opponent: matchup?.bye ? "BYE" : matchup?.label || "—",
      opponentRank: matchup?.rank || null,
      matchupDifficulty: matchup?.difficulty || (matchup?.bye ? "Bye" : "Unknown"),
      matchupHome: matchup?.home ?? null,
      actualPoints: finite(player.actualPoints) ? round(player.actualPoints) : null,
      positionRank: null,
      grade: null,
      letter: "—"
    };
  }

  function addPositionRanks(rosters) {
    const players = rosters.flatMap((roster) => roster.players);
    [...new Set(players.map((player) => player.position).filter(Boolean))].forEach((position) => {
      const pool = players.filter((player) => player.position === position && finite(player.projectedPoints)).sort((left, right) => right.projectedPoints - left.projectedPoints || left.name.localeCompare(right.name));
      pool.forEach((player, index) => {
        player.positionRank = index + 1;
        player.grade = gradeForRank(index + 1, pool.length);
        player.letter = letterGrade(player.grade);
      });
    });
  }

  function slotRows(players) {
    const starters = players.filter((player) => player.starter).sort((left, right) => SLOT_ORDER.indexOf(left.lineupSlotId) - SLOT_ORDER.indexOf(right.lineupSlotId) || right.projectedPoints - left.projectedPoints);
    const totals = new Map();
    starters.forEach((player) => totals.set(player.lineupSlot, (totals.get(player.lineupSlot) || 0) + 1));
    const counts = new Map();
    return starters.map((player) => {
      const next = (counts.get(player.lineupSlot) || 0) + 1;
      counts.set(player.lineupSlot, next);
      return { label: (totals.get(player.lineupSlot) || 0) > 1 ? `${player.lineupSlot}${next}` : player.lineupSlot, player };
    });
  }

  function totalProjection(players) {
    return round(players.filter((player) => player.starter && finite(player.projectedPoints)).reduce((sum, player) => sum + player.projectedPoints, 0));
  }

  function unitValue(players, position) {
    const eligible = position === "FLEX" ? players.filter((player) => ["RB", "WR", "TE"].includes(player.position)) : players.filter((player) => player.position === position);
    const starters = eligible.filter((player) => player.starter && finite(player.projectedPoints));
    const bench = eligible.filter((player) => !player.starter && finite(player.projectedPoints)).sort((left, right) => right.projectedPoints - left.projectedPoints);
    return starters.reduce((sum, player) => sum + player.projectedPoints, 0) + (bench[0]?.projectedPoints || 0) * 0.2;
  }

  function positionGrades(rosters, userTeamId) {
    return UNIT_POSITIONS.map((position) => {
      const values = rosters.map((roster) => ({ teamId: roster.teamId, value: unitValue(roster.players, position) })).sort((left, right) => right.value - left.value);
      const rank = Math.max(1, values.findIndex((entry) => entry.teamId === userTeamId) + 1);
      const score = gradeForRank(rank, values.length);
      return { position, rank, total: values.length, score, letter: letterGrade(score), value: round(values.find((entry) => entry.teamId === userTeamId)?.value || 0) };
    });
  }

  function compatible(benchPlayer, starter) {
    if (starter.lineupSlot === "FLEX") return ["RB", "WR", "TE"].includes(benchPlayer.position);
    return benchPlayer.position === starter.position;
  }

  function lineupAlerts(players) {
    const starters = players.filter((player) => player.starter);
    const bench = players.filter((player) => !player.starter && player.lineupSlot !== "IR" && finite(player.projectedPoints));
    const alerts = [];
    bench.forEach((candidate) => {
      const replacement = starters.filter((starter) => compatible(candidate, starter) && finite(starter.projectedPoints)).sort((left, right) => left.projectedPoints - right.projectedPoints)[0];
      if (!replacement) return;
      const delta = round(candidate.projectedPoints - replacement.projectedPoints);
      if (delta >= 1.5) alerts.push({ type: "swap", candidate, replacement, delta });
    });
    starters.filter((player) => player.injured || !["ACTIVE", "NORMAL"].includes(String(player.injuryStatus).toUpperCase())).forEach((player) => alerts.push({ type: "injury", player, delta: 0 }));
    return alerts.sort((left, right) => right.delta - left.delta).slice(0, 5);
  }

  function createDashboard(teamContext, week, catalogPlayers, contextApi) {
    if (!teamContext?.userTeamId || !Array.isArray(teamContext.rosters)) return null;
    const selectedWeek = clamp(Number(week) || Number(teamContext.currentWeek) || 1, 1, Number(teamContext.finalScoringPeriod) || 17);
    const catalogByName = new Map((catalogPlayers || []).map((player) => [nameKey(player.name), player]));
    const rosters = teamContext.rosters.map((roster) => ({
      teamId: String(roster.teamId),
      players: (roster.players || []).map((player) => evaluatePlayer(player, selectedWeek, catalogByName, contextApi, teamContext.currentWeek))
    }));
    addPositionRanks(rosters);
    const userTeamId = String(teamContext.userTeamId);
    const myRoster = rosters.find((roster) => roster.teamId === userTeamId) || { teamId: userTeamId, players: [] };
    const matchup = (teamContext.matchups || []).find((entry) => Number(entry.week) === selectedWeek && [String(entry.homeTeamId), String(entry.awayTeamId)].includes(userTeamId)) || null;
    const opponentTeamId = matchup ? (String(matchup.homeTeamId) === userTeamId ? String(matchup.awayTeamId) : String(matchup.homeTeamId)) : null;
    const opponentRoster = rosters.find((roster) => roster.teamId === opponentTeamId) || { teamId: opponentTeamId, players: [] };
    const teams = new Map((teamContext.teams || []).map((team) => [String(team.id), team]));
    const mySlots = slotRows(myRoster.players);
    const opponentSlots = slotRows(opponentRoster.players);
    const comparisonLabels = [...new Set([...mySlots.map((row) => row.label), ...opponentSlots.map((row) => row.label)])];
    const comparisons = comparisonLabels.map((label) => {
      const mine = mySlots.find((row) => row.label === label)?.player || null;
      const theirs = opponentSlots.find((row) => row.label === label)?.player || null;
      const minePoints = finite(mine?.projectedPoints) ? mine.projectedPoints : null;
      const theirPoints = finite(theirs?.projectedPoints) ? theirs.projectedPoints : null;
      return { label, mine, theirs, edge: minePoints === null || theirPoints === null ? "none" : minePoints > theirPoints ? "mine" : theirPoints > minePoints ? "theirs" : "even", delta: minePoints === null || theirPoints === null ? null : round(Math.abs(minePoints - theirPoints)) };
    });
    const myProjection = totalProjection(myRoster.players);
    const opponentProjection = totalProjection(opponentRoster.players);
    const grades = positionGrades(rosters, userTeamId);
    const strongest = grades.slice().sort((left, right) => right.score - left.score)[0];
    const weakest = grades.slice().sort((left, right) => left.score - right.score)[0];
    return {
      week: selectedWeek,
      currentWeek: Number(teamContext.currentWeek) || 1,
      syncedAt: teamContext.syncedAt,
      myTeam: teams.get(userTeamId) || { id: userTeamId, name: "My Team" },
      opponentTeam: teams.get(opponentTeamId) || (opponentTeamId ? { id: opponentTeamId, name: `Team ${opponentTeamId}` } : null),
      myRoster,
      opponentRoster,
      matchup,
      comparisons,
      positionGrades: grades,
      alerts: lineupAlerts(myRoster.players),
      myProjection,
      opponentProjection,
      projectedEdge: round(myProjection - opponentProjection),
      strongest,
      weakest,
      coverage: { myRoster: myRoster.players.filter((player) => finite(player.projectedPoints)).length, myRosterTotal: myRoster.players.length, opponent: opponentRoster.players.filter((player) => finite(player.projectedPoints)).length, opponentTotal: opponentRoster.players.length }
    };
  }

  return Object.freeze({ createDashboard, gradeForRank, letterGrade, nameKey });
});
