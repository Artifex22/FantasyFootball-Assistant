(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DraftStrategy = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"];
  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  const round = (value) => Math.round(value * 10) / 10;

  function rosterCounts(roster) {
    return (roster || []).reduce((counts, player) => {
      if (player && POSITIONS.includes(player.position)) counts[player.position] += 1;
      return counts;
    }, Object.fromEntries(POSITIONS.map((position) => [position, 0])));
  }

  function targetsForRound(draftRound) {
    const roundNumber = Number(draftRound) || 1;
    if (roundNumber <= 2) return { QB: 0, RB: 1, WR: 1, TE: 0, K: 0, DST: 0 };
    if (roundNumber <= 4) return { QB: 0, RB: 2, WR: 2, TE: 0, K: 0, DST: 0 };
    if (roundNumber <= 7) return { QB: roundNumber >= 6 ? 1 : 0, RB: 3, WR: 3, TE: roundNumber >= 7 ? 1 : 0, K: 0, DST: 0 };
    if (roundNumber <= 10) return { QB: 1, RB: 4, WR: 4, TE: 1, K: 0, DST: 0 };
    if (roundNumber <= 13) return { QB: 1, RB: 4, WR: 5, TE: 1, K: 0, DST: 0 };
    return { QB: 1, RB: 5, WR: 5, TE: 1, K: 1, DST: 1 };
  }

  function detectRuns(draftLog) {
    const recent = (draftLog || []).filter((pick) => POSITIONS.includes(pick.position)).slice(-8);
    const counts = Object.fromEntries(POSITIONS.map((position) => [position, recent.filter((pick) => pick.position === position).length]));
    return POSITIONS.map((position) => ({
      position,
      count: counts[position],
      sample: recent.length,
      percentage: recent.length ? Math.round((counts[position] / recent.length) * 100) : 0,
      active: recent.length >= 5 && counts[position] >= 4
    })).sort((left, right) => right.count - left.count);
  }

  function positionDepth(results, position, currentOverall, nextPick) {
    const players = (results || []).filter((result) => result.player.position === position).sort((left, right) => left.player.rank - right.player.rank);
    if (!players.length) return { available: 0, beforeNextPick: 0, topTier: null, tierSupply: 0, scarcity: 100 };
    const topTier = players[0].player.tier;
    const tierSupply = players.filter((result) => result.player.tier === topTier).length;
    const returnBoundary = Number(nextPick) || (Number(currentOverall) + 20);
    const beforeNextPick = players.filter((result) => Number(result.player.rank) <= returnBoundary + 4).length;
    const rankGap = players[1] ? Number(players[1].player.rank) - Number(players[0].player.rank) : 12;
    const tierCliff = players[1] && players[1].player.tier > topTier ? 28 : 0;
    const scarcity = clamp(18 + tierCliff + Math.max(0, 4 - tierSupply) * 9 + Math.max(0, 3 - beforeNextPick) * 10 + Math.min(18, rankGap * 1.5));
    return { available: players.length, beforeNextPick, topTier, tierSupply, scarcity: Math.round(scarcity) };
  }

  function needScores(counts, targets, draftRound, depthByPosition) {
    return POSITIONS.map((position) => {
      const target = targets[position];
      const count = counts[position];
      const deficit = Math.max(0, target - count);
      let severity = deficit ? 44 + deficit * 20 : 12;
      if ((position === "RB" || position === "WR") && count < 3 && draftRound >= 5) severity += 12;
      if (position === "QB" && count >= 1 && draftRound < 12) severity = 2;
      if (position === "TE" && count >= 1 && draftRound < 13) severity = 2;
      if ((position === "K" || position === "DST") && draftRound < 13) severity = 0;
      if (!deficit && (position === "RB" || position === "WR") && count < 5) severity += 16;
      severity += deficit ? depthByPosition[position].scarcity * 0.16 : 0;
      const label = severity >= 75 ? "Critical" : severity >= 55 ? "Priority" : severity >= 30 ? "Depth" : "Stable";
      const reason = deficit
        ? `${count}/${target} target by this phase; ${depthByPosition[position].beforeNextPick} likely options before your next pick.`
        : `${count} rostered; ${depthByPosition[position].tierSupply} remain in the best available tier.`;
      return { position, count, target, deficit, severity: Math.round(clamp(severity)), label, reason };
    }).sort((left, right) => right.severity - left.severity);
  }

  function analyze(context) {
    const results = context.results || [];
    const roster = context.roster || [];
    const draftLog = context.draftLog || [];
    const teams = Number(context.teams) || 12;
    const currentOverall = Number(context.currentOverall) || 1;
    const draftRound = Math.floor((currentOverall - 1) / teams) + 1;
    const nextPick = Number(context.nextPick) || currentOverall + teams * 2 - 1;
    const counts = rosterCounts(roster);
    const targets = targetsForRound(draftRound);
    const runs = detectRuns(draftLog);
    const depthByPosition = Object.fromEntries(POSITIONS.map((position) => [position, positionDepth(results, position, currentOverall, nextPick)]));
    const needs = needScores(counts, targets, draftRound, depthByPosition);
    const needByPosition = Object.fromEntries(needs.map((need) => [need.position, need]));
    const activeRun = runs.find((run) => run.active);
    const picksUntilNext = Math.max(1, nextPick - currentOverall);
    const allowedReach = Math.min(12, Math.max(4, Math.round(picksUntilNext * 0.42)));

    const candidates = results.map((result) => {
      const player = result.player;
      const need = needByPosition[player.position];
      const depth = depthByPosition[player.position];
      const reach = Number(player.rank) - currentOverall;
      const value = currentOverall - Number(player.rank);
      const duplicatePenalty = (player.position === "QB" && counts.QB >= 1 && draftRound < 12) || (player.position === "TE" && counts.TE >= 1 && draftRound < 13) ? 28 : 0;
      const earlySpecialistPenalty = (player.position === "K" || player.position === "DST") && draftRound < 13 ? 100 : 0;
      const runAdjustment = activeRun?.position === player.position ? (need.severity >= 55 ? 5 : -4) : 0;
      const controlledReachBonus = reach > 0 && reach <= allowedReach && need.severity >= 55 && depth.scarcity >= 50 ? 7 : 0;
      const score = clamp(Number(result.recommendationScore) * 0.82 + need.severity * 0.1 + depth.scarcity * 0.04 + runAdjustment + controlledReachBonus - duplicatePenalty - earlySpecialistPenalty - Math.max(0, reach - allowedReach) * 0.7);
      let action = "Best fit";
      if (value >= 5) action = "Best value";
      else if (controlledReachBonus) action = "Controlled reach";
      else if (need.severity >= 60) action = "Depth protection";
      const eligible = !((player.position === "QB" && counts.QB >= 1 && draftRound < 12)
        || (player.position === "TE" && counts.TE >= 1 && draftRound < 13)
        || ((player.position === "K" || player.position === "DST") && draftRound < 13))
        && reach <= allowedReach;
      return { result, player, score: round(score), action, reach, value, need, depth, eligible };
    }).filter((candidate) => candidate.eligible).sort((left, right) => right.score - left.score || left.player.rank - right.player.rank);

    const recommendations = [];
    candidates.forEach((candidate) => {
      if (recommendations.length >= 3) return;
      if (recommendations.some((item) => item.player.position === candidate.player.position)) return;
      recommendations.push(candidate);
    });
    if (recommendations.length < 3) candidates.forEach((candidate) => {
      if (recommendations.length < 3 && !recommendations.includes(candidate)) recommendations.push(candidate);
    });
    recommendations.sort((left, right) => right.score - left.score || left.player.rank - right.player.rank);

    const topNeed = needs.find((need) => need.severity > 0);
    let headline = topNeed ? `Build around ${topNeed.position} depth` : "Stay value-first";
    let explanation = topNeed ? topNeed.reason : "No urgent roster hole is forcing this pick.";
    if (activeRun) {
      const runNeed = needByPosition[activeRun.position];
      if (runNeed.severity >= 55) {
        headline = `Respond selectively to the ${activeRun.position} run`;
        explanation = `${activeRun.count} of the last ${activeRun.sample} picks were ${activeRun.position}. Take the tier value, but do not chase beyond a ${allowedReach}-pick reach.`;
      } else {
        const pivot = needs.find((need) => need.position !== activeRun.position && need.severity >= 30);
        headline = `Fade the ${activeRun.position} run`;
        explanation = `${activeRun.percentage}% of recent picks were ${activeRun.position}, but your build is stable there. Harvest ${pivot?.position || "another position"} value instead.`;
      }
    } else if (recommendations[0]?.value >= 6) {
      headline = `Take the falling ${recommendations[0].player.position} value`;
      explanation = `${recommendations[0].player.name} is ${recommendations[0].value} spots past baseline rank without creating a roster imbalance.`;
    }

    return {
      round: draftRound,
      currentOverall,
      nextPick,
      allowedReach,
      counts,
      targets,
      needs,
      runs,
      activeRun,
      recommendations,
      strategy: { headline, explanation }
    };
  }

  return Object.freeze({ analyze, detectRuns, positionDepth, rosterCounts, targetsForRound });
});
