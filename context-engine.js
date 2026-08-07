(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DraftContextEngine = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  const round = (value, precision = 1) => {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  };
  const INDOOR = new Set(["ARI", "ATL", "DAL", "DET", "HOU", "IND", "LAC", "LAR", "LV", "MIN", "NO"]);
  const TIME_ZONE = {
    SEA: 0, SF: 0, LAR: 0, LAC: 0, LV: 0, ARI: 1, DEN: 1,
    DAL: 2, HOU: 2, KC: 2, MIN: 2, GB: 2, CHI: 2, NO: 2, TEN: 2,
    BUF: 3, MIA: 3, NE: 3, NYJ: 3, NYG: 3, PHI: 3, PIT: 3, BAL: 3,
    WAS: 3, CLE: 3, CIN: 3, IND: 3, DET: 3, ATL: 3, CAR: 3, JAC: 3, TB: 3
  };
  const NAME_ALIASES = new Map([
    ["kenneth walker", "ken walker"],
    ["james cook iii", "james cook"],
    ["marvin harrison", "marvin harrison jr"],
    ["michael pittman", "michael pittman jr"],
    ["brian robinson", "brian robinson jr"],
    ["kenny gainwell", "kenneth gainwell"],
    ["chig okonkwo", "chigoziem okonkwo"],
    ["cam ward", "cameron ward"]
  ]);

  function normalizeName(value) {
    let name = String(value || "").toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
    name = name.replace(/\b(jr|sr|ii|iii|iv)\b/g, "").replace(/\s+/g, " ").trim();
    name = name.replace(/^([a-z])\s+([a-z])\b/, "$1$2");
    return NAME_ALIASES.get(name) || name;
  }

  function normalizeTeam(value) {
    const aliases = { JAX: "JAC", WSH: "WAS", OAK: "LV", SD: "LAC", STL: "LAR" };
    const team = String(value || "").toUpperCase();
    return aliases[team] || team;
  }

  function indexed(rows, key = (row) => row[0]) {
    return new Map((rows || []).map((row) => [key(row), row]));
  }

  function percentileMap(records, valueFor, higherIsBetter = true) {
    const valid = records.map((record) => ({ record, value: Number(valueFor(record)) })).filter((item) => Number.isFinite(item.value));
    valid.sort((left, right) => left.value - right.value);
    const output = new Map();
    valid.forEach((item, index) => {
      const percentile = valid.length === 1 ? 0.5 : index / (valid.length - 1);
      output.set(item.record, round((higherIsBetter ? percentile : 1 - percentile) * 100));
    });
    return output;
  }

  function scoreFromRank(rank, size = 32, lowerRankIsBetter = true) {
    if (!Number.isFinite(Number(rank))) return 50;
    const percentile = (clamp(Number(rank), 1, size) - 1) / Math.max(size - 1, 1);
    return round((lowerRankIsBetter ? 1 - percentile : percentile) * 100);
  }

  function ageScore(position, age) {
    if (!Number.isFinite(age)) return 72;
    const curves = {
      QB: [[25, 88], [30, 94], [34, 88], [36, 78], [38, 62], [41, 42]],
      RB: [[22, 91], [24, 95], [26, 86], [27, 77], [28, 66], [29, 54], [31, 34]],
      WR: [[22, 88], [25, 95], [28, 91], [30, 80], [31, 70], [33, 52], [35, 36]],
      TE: [[23, 86], [26, 94], [29, 91], [31, 82], [33, 65], [35, 45]]
    };
    const curve = curves[position] || curves.WR;
    if (age <= curve[0][0]) return curve[0][1];
    for (let index = 1; index < curve.length; index += 1) {
      const [rightAge, rightScore] = curve[index];
      const [leftAge, leftScore] = curve[index - 1];
      if (age <= rightAge) return round(leftScore + ((age - leftAge) / (rightAge - leftAge)) * (rightScore - leftScore));
    }
    return Math.max(20, curve[curve.length - 1][1] - (age - curve[curve.length - 1][0]) * 8);
  }

  function createContext(raw, players) {
    const source = raw || {};
    const projectionRows = source.projections || [];
    const projectionByName = indexed(projectionRows, (row) => normalizeName(row[0]));
    const ageByName = indexed(source.ages || [], (row) => normalizeName(row[0]));
    const durabilityByName = indexed(source.durability || [], (row) => normalizeName(row[0]));
    const scheduleByTeam = indexed(source.schedules || [], (row) => normalizeTeam(row[0]));
    const unitByTeam = indexed(source.units || [], (row) => normalizeTeam(row[0]));
    const standingByTeam = indexed(source.standings || [], (row) => normalizeTeam(row[0]));
    const sharp = source.sharp || {};
    const paceByTeam = indexed(sharp.pace || [], (row) => normalizeTeam(row[0]));
    const tendencyByTeam = indexed(sharp.tendencies || [], (row) => normalizeTeam(row[0]));
    const lineByTeam = indexed(sharp.offensiveLine || [], (row) => normalizeTeam(row[0]));
    const offenseByTeam = indexed(sharp.offense || [], (row) => normalizeTeam(row[0]));
    const defenseByTeam = indexed(sharp.defense || [], (row) => normalizeTeam(row[0]));
    const defensiveLineByTeam = indexed(sharp.defensiveLine || [], (row) => normalizeTeam(row[0]));
    const sosByPosition = Object.fromEntries(Object.entries(source.sos || {}).map(([position, rows]) => [position, indexed(rows, (row) => normalizeTeam(row[0]))]));
    const teams = Array.from(new Set((source.units || []).map((row) => normalizeTeam(row[0]))));

    const playerProjections = projectionRows.map((row) => ({
      name: row[0], team: normalizeTeam(row[1]), position: row[2], points: Number(row[3]), games: Number(row[4]), positionRank: Number(row[5]),
      passAttempts: Number(row[6]), carries: Number(row[7]), targets: Number(row[8]), receptions: Number(row[9]), carryShare: Number(row[10]), targetShare: Number(row[11])
    }));

    const opportunityRaw = (projection) => {
      if (projection.position === "QB") return projection.passAttempts + projection.carries * 2.2;
      if (projection.position === "RB") return (projection.carries + projection.targets * 1.5) + projection.carryShare * 2 + projection.targetShare * 2.5;
      if (projection.position === "TE") return projection.targets + projection.targetShare * 4;
      return projection.targets + projection.targetShare * 3.2;
    };
    const opportunityScores = new Map();
    ["QB", "RB", "WR", "TE"].forEach((position) => {
      const group = playerProjections.filter((projection) => projection.position === position && projection.points > 0);
      percentileMap(group, opportunityRaw).forEach((value, projection) => opportunityScores.set(normalizeName(projection.name), value));
    });

    const projectedPassRate = new Map();
    teams.forEach((team) => {
      const rows = playerProjections.filter((projection) => projection.team === team);
      const passAttempts = Math.max(0, ...rows.filter((projection) => projection.position === "QB").map((projection) => projection.passAttempts));
      const carries = rows.reduce((sum, projection) => sum + projection.carries, 0);
      projectedPassRate.set(team, passAttempts / Math.max(passAttempts + carries, 1) * 100);
    });

    const projectedOffenseRankScore = percentileMap(source.standings || [], (row) => Number(row[4]));
    const projectedWinsScore = percentileMap(source.standings || [], (row) => Number(row[1]));
    const historicalOffenseScore = percentileMap(sharp.offense || [], (row) => Number(row[1]));
    const historicalPaceScore = percentileMap(sharp.pace || [], (row) => Number(row[1]));
    const historicalLineScore = percentileMap(sharp.offensiveLine || [], (row) => Number(row[1]), false);

    const teamContexts = new Map();
    teams.forEach((team) => {
      const unit = unitByTeam.get(team);
      const standing = standingByTeam.get(team);
      const pace = paceByTeam.get(team);
      const tendency = tendencyByTeam.get(team);
      const line = lineByTeam.get(team);
      const offense = offenseByTeam.get(team);
      const unitOffense = unit ? Number(unit[11]) * 10 : 50;
      const offenseScore = round(unitOffense * 0.45 + (projectedOffenseRankScore.get(standing) ?? 50) * 0.32 + (projectedWinsScore.get(standing) ?? 50) * 0.13 + (historicalOffenseScore.get(offense) ?? 50) * 0.1);
      const espnLine = unit ? Number(unit[5]) * 10 : 50;
      const offensiveLine = round(espnLine * 0.72 + (historicalLineScore.get(line) ?? 50) * 0.28);
      const priorDropback = tendency ? Number(tendency[1]) : 58;
      const passTendency = round(priorDropback * 0.45 + (projectedPassRate.get(team) || 58) * 0.55);
      const paceScore = historicalPaceScore.get(pace) ?? 50;
      teamContexts.set(team, {
        team,
        offenseQuality: clamp(offenseScore),
        offensiveLine: clamp(offensiveLine),
        passTendency: clamp(passTendency),
        pace: clamp(paceScore),
        projectedPoints: standing ? Number(standing[4]) : null,
        projectedWins: standing ? Number(standing[1]) : null,
        playsPerGame: pace ? Number(pace[1]) : null,
        secondsPerPlay: pace ? Number(pace[3]) : null,
        historicalEpaPerPlay: offense ? Number(offense[1]) : null,
        unitGrades: unit ? { QB: Number(unit[1]) * 10, RB: Number(unit[2]) * 10, WR: Number(unit[3]) * 10, TE: Number(unit[4]) * 10, OL: Number(unit[5]) * 10 } : {},
        labels: { projection: "ESPN/Mike Clay 2026", historical: "Sharp 2025 baseline" }
      });
    });

    const defensiveRaw = new Map();
    teams.forEach((team) => {
      const unit = unitByTeam.get(team);
      const defense = defenseByTeam.get(team);
      const defensiveLine = defensiveLineByTeam.get(team);
      const base = unit ? { DI: Number(unit[6]) * 10, ED: Number(unit[7]) * 10, LB: Number(unit[8]) * 10, CB: Number(unit[9]) * 10, S: Number(unit[10]) * 10 } : { DI: 50, ED: 50, LB: 50, CB: 50, S: 50 };
      const previousDefense = defense ? clamp(50 + Number(defense[1]) * 100) : 50;
      const pressure = defensiveLine ? clamp(Number(defensiveLine[1])) : 50;
      defensiveRaw.set(team, {
        QB: (base.ED * 0.22 + base.CB * 0.32 + base.S * 0.18 + previousDefense * 0.18 + pressure * 0.1),
        RB: (base.DI * 0.34 + base.LB * 0.29 + base.ED * 0.17 + pressure * 0.1 + previousDefense * 0.1),
        WR: (base.CB * 0.48 + base.S * 0.24 + base.ED * 0.1 + previousDefense * 0.18),
        TE: (base.LB * 0.42 + base.S * 0.32 + base.CB * 0.12 + previousDefense * 0.14),
        K: (base.DI * 0.12 + base.ED * 0.18 + base.CB * 0.2 + base.S * 0.18 + previousDefense * 0.32)
      });
    });

    const opponentRanks = {};
    ["QB", "RB", "WR", "TE", "K"].forEach((position) => {
      const ordered = teams.slice().sort((left, right) => defensiveRaw.get(left)[position] - defensiveRaw.get(right)[position]);
      opponentRanks[position] = new Map(ordered.map((team, index) => [team, index + 1]));
    });
    const dstOrdered = teams.slice().sort((left, right) => teamContexts.get(left).offenseQuality - teamContexts.get(right).offenseQuality);
    opponentRanks.DST = new Map(dstOrdered.map((team, index) => [team, index + 1]));
    const defenseStrength = percentileMap(teams, (team) => (defensiveRaw.get(team).QB + defensiveRaw.get(team).RB + defensiveRaw.get(team).WR + defensiveRaw.get(team).TE) / 4);

    function weeklyMatchups(player) {
      const team = normalizeTeam(player.team);
      const schedule = scheduleByTeam.get(team);
      if (!schedule || !opponentRanks[player.position]) return [];
      return schedule.slice(2, 19).map((game, index) => {
        if (!game) return { week: index + 1, bye: true, label: "BYE" };
        const opponent = normalizeTeam(game[0]);
        const home = Boolean(game[1]);
        const baseRank = opponentRanks[player.position].get(opponent) || 16;
        const travelZones = home ? 0 : Math.abs((TIME_ZONE[team] ?? 2) - (TIME_ZONE[opponent] ?? 2));
        const adjustedRank = clamp(Math.round(baseRank + (home ? -0.8 : 0.8) + travelZones * 0.35), 1, 32);
        const difficulty = adjustedRank <= 5 ? "Great" : adjustedRank <= 12 ? "Good" : adjustedRank <= 20 ? "Neutral" : adjustedRank <= 27 ? "Difficult" : "Avoid";
        return {
          week: index + 1,
          opponent,
          home,
          rank: adjustedRank,
          score: scoreFromRank(adjustedRank),
          difficulty,
          venue: home ? "Home" : "Away",
          outdoors: !INDOOR.has(home ? team : opponent),
          travelZones,
          label: `${home ? "vs" : "@"} ${opponent}`
        };
      });
    }

    function scheduleSummary(player) {
      const team = normalizeTeam(player.team);
      const sos = sosByPosition[player.position]?.get(team);
      const weeks = weeklyMatchups(player);
      const regular = weeks.filter((week) => week.week <= 14 && !week.bye);
      const playoffs = weeks.filter((week) => week.week >= 15 && week.week <= 17 && !week.bye);
      const average = (list) => list.length ? list.reduce((sum, week) => sum + week.score, 0) / list.length : 50;
      const publishedRegular = sos ? scoreFromRank(Number(sos[2])) : 50;
      const publishedPlayoffs = sos ? scoreFromRank(Number(sos[4])) : 50;
      const regularScore = round(publishedRegular * 0.58 + average(regular) * 0.42);
      const playoffScore = round(publishedPlayoffs * 0.68 + average(playoffs) * 0.32);
      return {
        score: round(regularScore * 0.72 + playoffScore * 0.28),
        regularScore,
        playoffScore,
        regularRank: sos ? Number(sos[2]) : null,
        playoffRank: sos ? Number(sos[4]) : null,
        projectedPositionPointsAllowed: sos ? Number(sos[1]) : null,
        projectedPlayoffPointsAllowed: sos ? Number(sos[3]) : null
      };
    }

    function durabilitySummary(player, projection) {
      if (!(["QB", "RB", "WR", "TE"].includes(player.position))) return null;
      const name = normalizeName(player.name);
      const age = ageByName.get(name);
      const history = durabilityByName.get(name);
      const playerAge = age ? Number(age[2]) : null;
      const draftYear = age ? Number(age[3]) : null;
      const rookie = player.isRookie || draftYear === 2026;
      const projectedGamesScore = projection ? clamp(Number(projection[4]) / 17 * 100) : 72;
      if (rookie && !history) {
        const score = Math.min(86, 72 * 0.45 + ageScore(player.position, playerAge) * 0.2 + projectedGamesScore * 0.35);
        return { score: round(score), confidence: "Low", age: playerAge, draftYear, fiveYearAvailability: null, recentAvailability: null };
      }
      const fiveYearAvailability = history ? Number(history[2]) : 74;
      const misses = history ? history.slice(5, 10).map(Number) : [4, 4, 4, 4, 4];
      const weights = [0.36, 0.26, 0.18, 0.12, 0.08];
      const weightedMisses = misses.reduce((sum, games, index) => sum + Math.min(games, 17) * weights[index], 0);
      const recentAvailability = clamp(100 - weightedMisses / 17 * 100);
      const experience = Number.isFinite(draftYear) ? Math.max(0, 2026 - draftYear) : 3;
      const historyReliability = Math.min(1, experience / 3);
      const regressedFiveYear = fiveYearAvailability * historyReliability + 78 * (1 - historyReliability);
      const regressedRecent = recentAvailability * historyReliability + 78 * (1 - historyReliability);
      const workload = projection ? (Number(projection[7]) + Number(projection[8])) : 0;
      const workloadPenalty = player.position === "RB" && workload > 300 ? 5 : player.position === "QB" && Number(projection?.[7]) > 100 ? 2 : 0;
      const score = clamp(regressedFiveYear * 0.34 + regressedRecent * 0.29 + ageScore(player.position, playerAge) * 0.22 + projectedGamesScore * 0.15 - workloadPenalty);
      return { score: round(score), confidence: history ? (experience >= 3 ? "High" : "Medium") : "Medium", age: playerAge, draftYear, fiveYearAvailability: history ? fiveYearAvailability : null, recentAvailability: history ? round(recentAvailability) : null };
    }

    function supportingCast(player) {
      const team = teamContexts.get(normalizeTeam(player.team));
      if (!team) return 50;
      const grades = team.unitGrades;
      if (player.position === "QB") return round((grades.WR || 50) * 0.38 + (grades.TE || 50) * 0.18 + (grades.OL || 50) * 0.3 + team.offenseQuality * 0.14);
      if (player.position === "RB") return round((grades.OL || 50) * 0.5 + (grades.QB || 50) * 0.18 + team.offenseQuality * 0.32);
      if (player.position === "K") return round(team.offenseQuality * 0.72 + (grades.OL || 50) * 0.28);
      if (player.position === "DST") return defenseStrength.get(normalizeTeam(player.team)) ?? 50;
      return round((grades.QB || 50) * 0.46 + (grades.OL || 50) * 0.22 + team.offenseQuality * 0.32);
    }

    const metricsById = {};
    const detailById = new Map();
    (players || []).forEach((player) => {
      const name = normalizeName(player.name);
      const projection = projectionByName.get(name);
      const schedule = scheduleSummary(player);
      const team = teamContexts.get(normalizeTeam(player.team)) || null;
      const durability = durabilitySummary(player, projection);
      const contextualOpportunity = player.position === "K" ? team?.offenseQuality : player.position === "DST" ? defenseStrength.get(normalizeTeam(player.team)) : null;
      const details = {
        projection: projection ? { points: Number(projection[3]), games: Number(projection[4]), positionRank: Number(projection[5]), passAttempts: Number(projection[6]), carries: Number(projection[7]), targets: Number(projection[8]), receptions: Number(projection[9]), carryShare: Number(projection[10]), targetShare: Number(projection[11]) } : null,
        opportunity: projection ? opportunityScores.get(name) ?? null : contextualOpportunity ?? null,
        schedule,
        durability,
        team,
        supportingCast: supportingCast(player),
        weekly: weeklyMatchups(player),
        provenance: { asOf: source.asOf, projection: "ESPN/Mike Clay 2026", schedule: "DraftCall 2026 + ESPN projected units", historical: "Sharp 2025 + League Station five-year availability" }
      };
      const metrics = {};
      if (projection) metrics.projection = Number(projection[3]);
      if (details.opportunity !== null) metrics.opportunity = details.opportunity;
      if (schedule.regularRank !== null || details.weekly.length) metrics.schedule = schedule.score;
      if (Number.isFinite(durability?.score)) metrics.durability = durability.score;
      metricsById[player.id] = metrics;
      detailById.set(player.id, details);
    });

    const projectedPlayers = Object.values(metricsById).filter((metrics) => Number.isFinite(metrics.projection)).length;
    return Object.freeze({
      asOf: source.asOf,
      metricsById: Object.freeze(metricsById),
      teamContexts,
      sources: source.sources || [],
      coverage: { players: (players || []).length, projectedPlayers, teams: teamContexts.size },
      playerContext(playerOrId) {
        const id = typeof playerOrId === "string" ? playerOrId : playerOrId?.id;
        return detailById.get(id) || null;
      },
      teamContext(team) { return teamContexts.get(normalizeTeam(team)) || null; },
      weeklyMatchups(player) { return weeklyMatchups(player); }
    });
  }

  return Object.freeze({ ageScore, createContext, normalizeName, normalizeTeam, scoreFromRank });
});
