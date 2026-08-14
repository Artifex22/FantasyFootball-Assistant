(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DraftModel = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const POSITIONS = ["QB", "RB", "WR", "TE"];
  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  const round = (value, precision = 1) => {
    const factor = 10 ** precision;
    return Math.round(value * factor) / factor;
  };

  function adjustedRank(player, scoring) {
    const exact = player.formatRanks && player.formatRanks[scoring];
    if (exact) return exact;
    const shifts = {
      ppr: { QB: 3, RB: 1, WR: -2, TE: -1 },
      half: { QB: 0, RB: 0, WR: 0, TE: 0 },
      standard: { QB: 1, RB: -2, WR: 2, TE: 2 }
    };
    return Math.max(1, player.rank + ((shifts[scoring] || shifts.half)[player.position] || 0));
  }

  function rankToSignal(rank, poolSize) {
    const size = Math.max(poolSize, 2);
    const percentile = clamp((Math.max(rank, 1) - 1) / (size - 1), 0, 1);
    return clamp(100 - 85 * percentile ** 0.65);
  }

  function consensusSignal(player, settings, poolSize) {
    const rankComponent = rankToSignal(adjustedRank(player, settings.scoring), poolSize);
    const certainty = Number.isFinite(player.stdDev) ? clamp(100 - (player.stdDev / 30) * 100) : 55;
    let sourceAgreement = null;
    if (player.espnPositionRank && player.ecrPositionRank) {
      sourceAgreement = clamp(100 - Math.abs(player.ecrPositionRank - player.espnPositionRank) * 7);
    }
    const agreementComponent = sourceAgreement === null ? certainty : (sourceAgreement * 0.65 + certainty * 0.35);
    return {
      value: round(rankComponent * 0.86 + agreementComponent * 0.14),
      certainty: round(certainty),
      sourceAgreement: sourceAgreement === null ? null : round(sourceAgreement),
      adjustedRank: adjustedRank(player, settings.scoring)
    };
  }

  function replacementPositionRank(position, settings) {
    const teams = Number(settings.teams) || 12;
    const starters = {
      QB: teams * (Number(settings.startingQbs) || 1),
      RB: teams * 2,
      WR: teams * 2,
      TE: teams
    };
    const flexShare = position === "RB" ? 0.52 : position === "WR" ? 0.4 : position === "TE" ? 0.08 : 0;
    return Math.max(1, Math.round(starters[position] + teams * flexShare));
  }

  function optimizedReplacementRanks(players, metricsById, settings) {
    const teams = Number(settings.teams) || 12;
    const baseStarters = {
      QB: teams * (Number(settings.startingQbs) || 1),
      RB: teams * 2,
      WR: teams * 2,
      TE: teams
    };
    const projectedByPosition = Object.fromEntries(POSITIONS.map((position) => [position, players
      .filter((player) => player.position === position && Number.isFinite(metricsById[player.id]?.projection))
      .sort((left, right) => metricsById[right.id].projection - metricsById[left.id].projection)]));
    const selectedCounts = { ...baseStarters };
    const flexCandidates = ["RB", "WR", "TE"].flatMap((position) => projectedByPosition[position].slice(baseStarters[position]))
      .sort((left, right) => metricsById[right.id].projection - metricsById[left.id].projection)
      .slice(0, teams);
    flexCandidates.forEach((player) => { selectedCounts[player.position] += 1; });
    return Object.fromEntries(POSITIONS.map((position) => [position, Math.min(projectedByPosition[position].length, selectedCounts[position] + 1)]));
  }

  function calculateVorSignals(players, metricsById, settings) {
    const replacementRanks = optimizedReplacementRanks(players, metricsById, settings);
    const projectedByPosition = Object.fromEntries(POSITIONS.map((position) => [position, players
      .filter((player) => player.position === position && Number.isFinite(metricsById[player.id]?.projection))
      .sort((left, right) => metricsById[right.id].projection - metricsById[left.id].projection)]));
    const raw = new Map();
    POSITIONS.forEach((position) => {
      const projected = projectedByPosition[position];
      if (!projected.length) return;
      const replacementIndex = Math.max(0, (replacementRanks[position] || 1) - 1);
      const replacement = metricsById[projected[replacementIndex].id].projection;
      projected.forEach((player) => raw.set(player.id, metricsById[player.id].projection - replacement));
    });

    if (!raw.size) return new Map();
    const values = Array.from(raw.values());
    const min = Math.min(...values);
    const max = Math.max(...values);
    const spread = Math.max(max - min, 1);
    return new Map(Array.from(raw.entries()).map(([id, value]) => [id, round(clamp(((value - min) / spread) * 100))]));
  }

  function rosterCounts(roster) {
    return (roster || []).reduce((counts, player) => {
      counts[player.position] = (counts[player.position] || 0) + 1;
      return counts;
    }, { QB: 0, RB: 0, WR: 0, TE: 0 });
  }

  function rosterNeedAdjustment(player, roster, settings) {
    const counts = rosterCounts(roster);
    const targets = { QB: Number(settings.startingQbs) || 1, RB: 2, WR: 2, TE: 1 };
    const rosterSize = roster.length;
    const deficit = Math.max(0, targets[player.position] - counts[player.position]);
    let adjustment = deficit ? (rosterSize < 7 ? 5.5 : 3) : 0;

    if (player.position === "QB" && counts.QB >= targets.QB && rosterSize < 9) adjustment -= 7;
    if (player.position === "TE" && counts.TE >= 1 && rosterSize < 10) adjustment -= 5;
    if ((player.position === "RB" || player.position === "WR") && counts[player.position] < 4) adjustment += 1.5;
    return round(adjustment);
  }

  function tierCliffAdjustment(player, availablePlayers) {
    const samePosition = availablePlayers
      .filter((candidate) => candidate.position === player.position)
      .sort((a, b) => a.rank - b.rank);
    if (samePosition[0]?.id !== player.id) return 0;
    const next = samePosition[1];
    if (!next) return 1;
    if (next.tier > player.tier) return clamp(2 + (next.tier - player.tier) * 1.5, 0, 5);
    const rankGap = next.rank - player.rank;
    return rankGap >= 8 ? 2 : 0;
  }

  function scorePlayers(players, context) {
    const settings = context.settings || { scoring: "half", teams: 12, startingQbs: 1 };
    const weights = context.weights || { consensus: 35, projectionVor: 28, opportunity: 17, schedule: 3, durability: 10, market: 7 };
    const metricsById = context.metricsById || {};
    const draftedIds = new Set(context.draftedIds || []);
    const roster = context.roster || [];
    const includeDraftAdjustments = context.includeDraftAdjustments !== false;
    const availablePlayers = players.filter((player) => !draftedIds.has(player.id));
    const vorSignals = calculateVorSignals(players, metricsById, settings);
    const totalWeight = Object.values(weights).reduce((sum, value) => sum + Number(value || 0), 0) || 1;

    return availablePlayers.map((player) => {
      const consensus = consensusSignal(player, settings, players.length);
      const metrics = metricsById[player.id] || {};
      const signals = {
        consensus: consensus.value,
        projectionVor: vorSignals.has(player.id) ? vorSignals.get(player.id) : null,
        opportunity: Number.isFinite(metrics.opportunity) ? clamp(metrics.opportunity) : null,
        schedule: Number.isFinite(metrics.schedule) ? clamp(metrics.schedule) : null,
        durability: Number.isFinite(metrics.durability) ? clamp(metrics.durability) : null,
        market: player.ecrRank && Number.isFinite(player.ecrVsAdp) ? clamp(50 + player.ecrVsAdp * 2.5) : null
      };
      const active = Object.entries(signals).filter(([key, value]) => value !== null && Number.isFinite(value) && Number(weights[key] || 0) > 0);
      let usedWeight = 0;
      let weightedSum = 0;
      Object.entries(signals).forEach(([key, value]) => {
        if (value === null || !Number.isFinite(value)) return;
        const weight = Number(weights[key] || 0);
        usedWeight += weight;
        weightedSum += value * weight;
      });
      const baseScore = usedWeight ? weightedSum / usedWeight : 0;
      const need = includeDraftAdjustments ? rosterNeedAdjustment(player, roster, settings) : 0;
      const tierCliff = includeDraftAdjustments ? tierCliffAdjustment(player, availablePlayers) : 0;
      const recommendationScore = clamp(baseScore + need + tierCliff);
      const coverage = clamp((usedWeight / totalWeight) * 100);

      return {
        player,
        baseScore: round(baseScore),
        recommendationScore: round(recommendationScore),
        coverage: round(coverage),
        signals,
        consensus,
        adjustments: { rosterNeed: need, tierCliff: round(tierCliff) },
        activeSignalCount: active.length
      };
    }).sort((a, b) => b.recommendationScore - a.recommendationScore || a.player.rank - b.player.rank)
      .map((result, index) => ({ ...result, modelRank: index + 1 }));
  }

  function recommendationReason(result) {
    const reasons = [];
    if (result.player.ecrVsAdp >= 7) reasons.push(`experts are ${result.player.ecrVsAdp} picks above ADP`);
    if (result.adjustments.rosterNeed >= 3) reasons.push("fills a starting roster need");
    if (result.adjustments.tierCliff >= 3) reasons.push("sits before a tier break");
    if (result.consensus.certainty >= 75) reasons.push("analysts show tight agreement");
    if (result.consensus.sourceAgreement !== null && result.consensus.sourceAgreement >= 85) reasons.push("ECR and ESPN largely agree");
    if (result.player.isRookie && result.player.rank <= 160) reasons.push("rookie with current redraft relevance");
    if (!reasons.length) reasons.push("best blended value among available players");
    return reasons.slice(0, 2).join("; ");
  }

  function parseMetricCsv(text, players) {
    const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
    if (lines.length < 2) return { metricsById: {}, errors: ["CSV has no data rows."], imported: 0 };
    const parseLine = (line) => {
      const cells = [];
      let current = "";
      let quoted = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"' && quoted && line[index + 1] === '"') { current += '"'; index += 1; }
        else if (character === '"') quoted = !quoted;
        else if (character === "," && !quoted) { cells.push(current.trim()); current = ""; }
        else current += character;
      }
      cells.push(current.trim());
      return cells;
    };
    const headers = parseLine(lines[0]).map((header) => header.toLowerCase());
    const required = ["name"];
    const errors = required.filter((header) => !headers.includes(header)).map((header) => `Missing required column: ${header}`);
    if (errors.length) return { metricsById: {}, errors, imported: 0 };
    const byName = new Map(players.map((player) => [player.name.toLowerCase(), player]));
    const allowed = ["projection", "opportunity", "schedule", "durability"];
    const metricsById = {};
    lines.slice(1).forEach((line, rowIndex) => {
      const values = parseLine(line);
      const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
      const player = byName.get(String(record.name).toLowerCase());
      if (!player) { errors.push(`Row ${rowIndex + 2}: player not found (${record.name || "blank"}).`); return; }
      const metrics = {};
      allowed.forEach((key) => {
        if (record[key] === "") return;
        const value = Number(record[key]);
        if (!Number.isFinite(value)) errors.push(`Row ${rowIndex + 2}: ${key} is not numeric.`);
        else metrics[key] = key === "projection" ? value : clamp(value);
      });
      metricsById[player.id] = metrics;
    });
    return { metricsById, errors, imported: Object.keys(metricsById).length };
  }

  return Object.freeze({
    adjustedRank,
    calculateVorSignals,
    clamp,
    consensusSignal,
    parseMetricCsv,
    optimizedReplacementRanks,
    rankToSignal,
    recommendationReason,
    replacementPositionRank,
    rosterCounts,
    scorePlayers
  });
});
