(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RankingComparison = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const normalizeName = (name) => String(name || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").replace(/-(jr|sr|ii|iii)$/, "");
  const finiteRank = (value) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;

  function rankFor(sourceId, player, snapshots = {}, overrides = {}) {
    const override = finiteRank(overrides[player.id]) ?? finiteRank(overrides[normalizeName(player.name)]);
    if (override !== null) return override;
    if (sourceId === "espn") return finiteRank(player.espnOverallRank);
    if (sourceId === "fantasypros") return finiteRank(player.ecrRank);
    if (sourceId === "market") return player.ecrRank ? finiteRank(player.ecrRank + player.ecrVsAdp) : null;
    const source = snapshots[sourceId];
    if (!source?.ranks) return null;
    return finiteRank(source.ranks[player.id]) ?? finiteRank(source.ranks[normalizeName(player.name)]);
  }

  function evaluate(modelRank, externalRank) {
    const model = finiteRank(modelRank);
    const external = finiteRank(externalRank);
    if (model === null || external === null) return { gap: null, label: "No snapshot", tone: "missing" };
    const gap = Math.round((external - model) * 10) / 10;
    if (gap >= 4) return { gap, label: `Value +${Math.round(gap)}`, tone: "value" };
    if (gap <= -4) return { gap, label: `Reach ${Math.round(Math.abs(gap))}`, tone: "reach" };
    return { gap, label: "Aligned", tone: "aligned" };
  }

  function parseRankingText(text, players) {
    const playerByKey = new Map((players || []).map((player) => [normalizeName(player.name), player]));
    const ranks = {};
    const errors = [];
    String(text || "").split(/\r?\n/).forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || /^(rank|overall)[,\t|]/i.test(line)) return;
      const commaMatch = line.match(/^\s*(\d+(?:\.\d+)?)\s*[,\t|]\s*(.+?)\s*$/);
      const spacedMatch = line.match(/^\s*(\d+(?:\.\d+)?)\s+[.)-]?\s*(.+?)\s*$/);
      const match = commaMatch || spacedMatch;
      if (!match) {
        errors.push(`Line ${index + 1}: use rank,name`);
        return;
      }
      const rank = finiteRank(match[1]);
      const player = playerByKey.get(normalizeName(match[2]));
      if (!player) {
        errors.push(`Line ${index + 1}: ${match[2]} is not in the player pool`);
        return;
      }
      ranks[player.id] = rank;
    });
    return { ranks, imported: Object.keys(ranks).length, errors };
  }

  return { evaluate, normalizeName, parseRankingText, rankFor };
});
