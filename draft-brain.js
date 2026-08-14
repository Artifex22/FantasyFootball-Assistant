(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.DraftBrainFactory = api;
    root.DraftBrain = api.createBrain(root.DRAFT_HISTORY || { seasons: [], managerGroups: [], projectedKeepers: [] });
  }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const POSITIONS = ["QB", "RB", "WR", "TE", "K", "DST"];
  const CORE_POSITIONS = ["QB", "RB", "WR", "TE"];
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const round = (value) => Math.round(value * 10) / 10;
  const sum = (values) => values.reduce((total, value) => total + value, 0);
  const key = (value) => String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const bandForRound = (draftRound) => draftRound <= 3 ? "early" : draftRound <= 8 ? "middle" : "late";

  function normalizeDistribution(values) {
    const total = sum(POSITIONS.map((position) => Math.max(0, values[position] || 0))) || 1;
    return Object.fromEntries(POSITIONS.map((position) => [position, Math.max(0, values[position] || 0) / total]));
  }

  function integerPercentages(distribution) {
    const exact = POSITIONS.map((position) => ({ position, exact: distribution[position] * 100 }));
    const floors = exact.map((item) => ({ ...item, value: Math.floor(item.exact), remainder: item.exact - Math.floor(item.exact) }));
    let remaining = 100 - sum(floors.map((item) => item.value));
    floors.sort((left, right) => right.remainder - left.remainder).slice(0, remaining).forEach((item) => { item.value += 1; });
    return Object.fromEntries(floors.map((item) => [item.position, item.value]));
  }

  function managerAtPick(overallPick, teams, draftOrder) {
    const teamCount = Number(teams) || 12;
    const draftRound = Math.floor((overallPick - 1) / teamCount) + 1;
    const withinRound = ((overallPick - 1) % teamCount) + 1;
    const slot = draftRound % 2 === 1 ? withinRound : teamCount - withinRound + 1;
    return { managerId: draftOrder[slot - 1] || null, slot, round: draftRound, overall: overallPick };
  }

  function overallForManagerRound(managerId, draftRound, teams, draftOrder) {
    const teamCount = Number(teams) || 12;
    const slot = draftOrder.indexOf(managerId) + 1;
    if (!slot) return null;
    const withinRound = draftRound % 2 === 1 ? slot : teamCount - slot + 1;
    return (draftRound - 1) * teamCount + withinRound;
  }

  function nextPickForManager(afterOverall, managerId, teams, draftOrder, maxRounds = 16) {
    const limit = (Number(teams) || 12) * maxRounds;
    for (let overall = Number(afterOverall) + 1; overall <= limit; overall += 1) {
      if (managerAtPick(overall, teams, draftOrder).managerId === managerId) return overall;
    }
    return null;
  }

  function createBrain(history) {
    const groups = Array.isArray(history.managerGroups) ? history.managerGroups : [];
    const formerGroups = Array.isArray(history.formerManagerGroups) ? history.formerManagerGroups : [];
    const aliasToManager = new Map();
    [...groups, ...formerGroups].forEach((group) => group.aliases.forEach((alias) => aliasToManager.set(key(alias), group.id)));
    const picks = [];
    (history.seasons || []).forEach((season) => {
      const seasonTeams = Number(season.teams || history.league?.teams) || 12;
      (season.picks || []).forEach(([draftRound, slot, player, nflTeam, position, manager]) => {
        picks.push({
          year: season.year,
          league: season.league,
          round: Number(draftRound),
          slot: Number(slot),
          overall: (Number(draftRound) - 1) * seasonTeams + Number(slot),
          player,
          playerKey: key(player),
          nflTeam,
          position,
          manager,
          managerId: aliasToManager.get(key(manager)) || `unmapped:${key(manager)}`
        });
      });
    });

    const picksByManager = new Map(groups.map((group) => [group.id, []]));
    picks.forEach((pick) => {
      if (!picksByManager.has(pick.managerId)) picksByManager.set(pick.managerId, []);
      picksByManager.get(pick.managerId).push(pick);
    });

    const leagueBandCounts = Object.fromEntries(["early", "middle", "late"].map((band) => [band, Object.fromEntries(POSITIONS.map((position) => [position, 0]))]));
    const leagueBandTotals = { early: 0, middle: 0, late: 0 };
    picks.forEach((pick) => {
      const band = bandForRound(pick.round);
      leagueBandCounts[band][pick.position] += 1;
      leagueBandTotals[band] += 1;
    });

    const managerProfiles = groups.map((group) => {
      const managerPicks = picksByManager.get(group.id) || [];
      const years = [...new Set(managerPicks.map((pick) => pick.year))].sort();
      const bandCounts = Object.fromEntries(["early", "middle", "late"].map((band) => [band, Object.fromEntries(POSITIONS.map((position) => [position, 0]))]));
      const bandTotals = { early: 0, middle: 0, late: 0 };
      const playerCounts = new Map();
      const nflTeamCounts = new Map();
      managerPicks.forEach((pick) => {
        const band = bandForRound(pick.round);
        bandCounts[band][pick.position] += 1;
        bandTotals[band] += 1;
        playerCounts.set(pick.player, (playerCounts.get(pick.player) || 0) + 1);
        nflTeamCounts.set(pick.nflTeam, (nflTeamCounts.get(pick.nflTeam) || 0) + 1);
      });
      const rates = Object.fromEntries(Object.keys(bandCounts).map((band) => [band, Object.fromEntries(POSITIONS.map((position) => [position, bandTotals[band] ? bandCounts[band][position] / bandTotals[band] : 0]))]));
      const medianRound = Object.fromEntries(CORE_POSITIONS.map((position) => {
        const values = years.map((year) => {
          const rounds = managerPicks.filter((pick) => pick.year === year && pick.position === position).map((pick) => pick.round);
          return rounds.length ? Math.min(...rounds) : null;
        }).filter(Number.isFinite).sort((a, b) => a - b);
        return [position, values.length ? values[Math.floor(values.length / 2)] : null];
      }));
      const repeats = [...playerCounts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const favoriteTeams = [...nflTeamCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      return Object.freeze({
        id: group.id,
        name: group.name,
        aliases: Object.freeze(group.aliases.slice()),
        confidence: group.confidence,
        years: Object.freeze(years),
        sampleSize: managerPicks.length,
        rates: Object.freeze(rates),
        medianRound: Object.freeze(medianRound),
        repeats: Object.freeze(repeats),
        favoriteTeams: Object.freeze(favoriteTeams)
      });
    });
    const profileById = new Map(managerProfiles.map((profile) => [profile.id, profile]));
    const playerPicks = new Map();
    picks.forEach((pick) => {
      if (!playerPicks.has(pick.playerKey)) playerPicks.set(pick.playerKey, []);
      playerPicks.get(pick.playerKey).push(pick);
    });
    const finalRosters = (history.finalRosters || []).map(([manager, player, acquisition, slot]) => ({
      manager,
      managerId: aliasToManager.get(key(manager)) || `unmapped:${key(manager)}`,
      player,
      playerKey: key(player),
      acquisition,
      slot
    }));
    const eligibleKeys = new Set(finalRosters.filter((record) => record.acquisition === "Draft").map((record) => `${record.managerId}:${record.playerKey}`));

    const newestSeason = Math.max(...picks.map((pick) => pick.year), 2025);
    const leagueRoundCache = new Map();
    const identityWeights = Object.freeze({ high: 1, medium: 0.82, low: 0.62, none: 0.4 });

    function recencyWeight(year) {
      return 2 ** (-Math.max(0, newestSeason - Number(year || newestSeason)) / 2);
    }

    function roundWeight(distance) {
      if (distance === 0) return 1;
      if (distance === 1) return 0.45;
      if (distance === 2) return 0.15;
      return 0.03;
    }

    function roundKernel(sourcePicks, draftRound) {
      const counts = Object.fromEntries(POSITIONS.map((position) => [position, 0.08]));
      sourcePicks.forEach((pick) => {
        const distance = Math.abs(Number(pick.round) - Number(draftRound));
        const proximity = roundWeight(distance);
        counts[pick.position] += proximity * recencyWeight(pick.year);
      });
      return normalizeDistribution(counts);
    }

    function leagueRoundDistribution(draftRound) {
      if (leagueRoundCache.has(draftRound)) return leagueRoundCache.get(draftRound);
      const distribution = roundKernel(picks, draftRound);
      if (draftRound <= 10) {
        distribution.K *= 0.08;
        distribution.DST *= 0.08;
      }
      const normalized = normalizeDistribution(distribution);
      leagueRoundCache.set(draftRound, normalized);
      return normalized;
    }

    function managerHistoryDetails(managerId, draftRound) {
      const league = leagueRoundDistribution(draftRound);
      const managerPicks = picksByManager.get(managerId) || [];
      const exactSample = managerPicks.filter((pick) => Number(pick.round) === Number(draftRound)).reduce((total, pick) => total + recencyWeight(pick.year), 0);
      const effectiveSample = managerPicks.reduce((total, pick) => total + roundWeight(Math.abs(Number(pick.round) - Number(draftRound))) * recencyWeight(pick.year), 0);
      const profile = profileById.get(managerId);
      const identityWeight = identityWeights[profile?.confidence] || identityWeights.none;
      const managerConfidence = clamp(identityWeight * effectiveSample / (effectiveSample + 8), 0, 0.72);
      if (managerPicks.length < 2) return { distribution: league, exactSample, effectiveSample, managerConfidence: 0, identityWeight };
      const manager = roundKernel(managerPicks, draftRound);
      return {
        distribution: normalizeDistribution(Object.fromEntries(POSITIONS.map((position) => [position, manager[position] * managerConfidence + league[position] * (1 - managerConfidence)]))),
        exactSample,
        effectiveSample,
        managerConfidence,
        identityWeight
      };
    }

    function managerHistoryDistribution(managerId, draftRound) {
      return managerHistoryDetails(managerId, draftRound).distribution;
    }

    function marketDistribution(draftRound, currentOverall, availablePlayers) {
      const league = leagueRoundDistribution(draftRound);
      const candidates = (availablePlayers || []).map((entry) => entry.player || entry).filter((player) => player && POSITIONS.includes(player.position));
      if (!candidates.length) return league;
      const expectedPick = Number(currentOverall) || ((draftRound - 1) * 12 + 6.5);
      const counts = Object.fromEntries(POSITIONS.map((position) => [position, 0.03]));
      candidates.forEach((player) => {
        const rank = Number(player.rank || player.ecrRank || expectedPick);
        const distance = Math.abs(rank - expectedPick);
        if (distance > 36) return;
        counts[player.position] += Math.exp(-(distance ** 2) / 180);
      });
      return normalizeDistribution(counts);
    }

    function liveDistribution(draftedPicks, draftRound) {
      const league = leagueRoundDistribution(draftRound);
      const live = (draftedPicks || []).filter((pick) => POSITIONS.includes(pick.position)).slice().sort((left, right) => Number(left.overall || 0) - Number(right.overall || 0));
      if (!live.length) return league;
      const counts = Object.fromEntries(POSITIONS.map((position) => [position, league[position] * 3]));
      live.slice(-18).forEach((pick, index, recent) => {
        const age = recent.length - index - 1;
        const samePhase = Math.abs((Number(pick.round) || draftRound) - draftRound) <= 1 ? 1.25 : 0.75;
        counts[pick.position] += Math.exp(-age / 7) * samePhase;
      });
      return normalizeDistribution(counts);
    }

    function rosterFactors(managerId, draftedPicks, draftRound) {
      const managerPicks = (draftedPicks || []).filter((pick) => pick.managerId === managerId);
      const counts = Object.fromEntries(POSITIONS.map((position) => [position, managerPicks.filter((pick) => pick.position === position).length]));
      const factors = { QB: 1, RB: 1, WR: 1, TE: 1, K: 1, DST: 1 };

      if (counts.QB) factors.QB = draftRound < 9 ? 0.04 : draftRound < 13 ? 0.16 : 0.48;
      else if (draftRound <= 2) factors.QB = 0.72;
      else if (draftRound >= 9) factors.QB = 1.18;

      if (counts.TE) factors.TE = draftRound < 10 ? 0.03 : draftRound < 13 ? 0.12 : 0.38;
      else if (draftRound <= 2) factors.TE = 0.7;
      else if (draftRound >= 9) factors.TE = 1.16;

      const expectedBacks = Math.min(4, Math.max(1, Math.ceil(draftRound * 0.28)));
      const expectedReceivers = Math.min(5, Math.max(1, Math.ceil(draftRound * 0.34)));
      if (counts.RB < expectedBacks) factors.RB = 1.13;
      if (counts.WR < expectedReceivers) factors.WR = 1.13;
      if (counts.RB >= 5) factors.RB = 0.56;
      else if (counts.RB >= 4) factors.RB = 0.78;
      if (counts.WR >= 6) factors.WR = 0.58;
      else if (counts.WR >= 5) factors.WR = 0.8;

      factors.K = counts.K ? 0.01 : draftRound <= 11 ? 0.025 : draftRound === 12 ? 0.16 : 1.08;
      factors.DST = counts.DST ? 0.01 : draftRound <= 11 ? 0.025 : draftRound === 12 ? 0.18 : 1.12;
      return { counts, factors };
    }

    function positionProbabilities(managerId, draftRound, draftedPicks, options = {}) {
      const historyDetails = managerHistoryDetails(managerId, draftRound);
      const historyDistribution = historyDetails.distribution;
      const market = marketDistribution(draftRound, options.currentOverall, options.availablePlayers);
      const live = liveDistribution(draftedPicks, draftRound);
      const league = leagueRoundDistribution(draftRound);
      const liveSample = Math.min(60, (draftedPicks || []).length);
      const liveWeight = 0.04 + (liveSample / 60) * 0.18;
      const historyWeight = 0.12 + historyDetails.managerConfidence * 0.46;
      const marketWeight = 0.3;
      const leagueWeight = Math.max(0.01, 1 - historyWeight - marketWeight - liveWeight);
      const roster = rosterFactors(managerId, draftedPicks, draftRound);
      const raw = Object.fromEntries(POSITIONS.map((position) => {
        const blended = historyDistribution[position] * historyWeight + market[position] * marketWeight + live[position] * liveWeight + league[position] * leagueWeight;
        return [position, blended * roster.factors[position]];
      }));
      const normalized = normalizeDistribution(raw);
      const percentages = integerPercentages(normalized);
      return POSITIONS.map((position) => {
        const historyDelta = historyDistribution[position] - league[position];
        const liveDelta = live[position] - league[position];
        const reasons = [];
        if (historyDelta > 0.045) reasons.push("manager history");
        if (liveDelta > 0.06) reasons.push("live room trend");
        if (market[position] > league[position] + 0.05) reasons.push("current player market");
        if (roster.factors[position] < 0.2) reasons.push(`already drafted ${position}`);
        if (!reasons.length) reasons.push("blended baseline");
        return {
          position,
          probability: percentages[position],
          historyProbability: Math.round(historyDistribution[position] * 100),
          marketProbability: Math.round(market[position] * 100),
          liveProbability: Math.round(live[position] * 100),
          rosterCount: roster.counts[position],
          reason: reasons.slice(0, 2).join(" + ")
        };
      }).sort((left, right) => right.probability - left.probability || POSITIONS.indexOf(left.position) - POSITIONS.indexOf(right.position));
    }

    function archetypesFor(player) {
      const rank = Number(player.rank || player.ecrRank || 999);
      const rookie = Boolean(player.isRookie);
      if (player.position === "QB") return [rank <= 40 ? "premium quarterback" : rank <= 120 ? "mid-round starter" : "late-round upside"];
      if (player.position === "RB") return [rank <= 36 ? "workload anchor" : rookie ? "rookie backfield upside" : rank <= 120 ? "committee value" : "bench upside"];
      if (player.position === "WR") return [rank <= 36 ? "alpha-volume profile" : rookie ? "rookie breakout" : rank <= 120 ? "target-earning depth" : "late-round receiver"];
      if (player.position === "TE") return [rank <= 48 ? "premium tight end" : rank <= 130 ? "breakout target" : "late streamer"];
      return [player.position === "DST" ? "defense streamer" : "kicker streamer"];
    }

    function roundProfile(managerId, draftRound, draftedPicks = [], options = {}) {
      const positions = positionProbabilities(managerId, draftRound, draftedPicks, options);
      const historyDetails = managerHistoryDetails(managerId, draftRound);
      const liveSample = Math.min(60, draftedPicks.length);
      const liveWeight = 0.04 + (liveSample / 60) * 0.18;
      const historyWeight = 0.12 + historyDetails.managerConfidence * 0.46;
      const marketWeight = 0.3;
      const leagueWeight = Math.max(0.01, 1 - historyWeight - marketWeight - liveWeight);
      const coverage = Math.round(clamp((historyDetails.effectiveSample / 8) * 0.7 + (options.availablePlayers?.length ? 0.3 : 0), 0, 1) * 100);
      const confidenceScore = Math.round(clamp(historyDetails.managerConfidence * 0.62 + Math.min(1, liveSample / 36) * 0.18 + (options.availablePlayers?.length ? 0.2 : 0), 0, 1) * 100);
      return {
        managerId,
        round: Number(draftRound),
        positions,
        topPosition: positions[0],
        exactSample: round(historyDetails.exactSample),
        effectiveSample: round(historyDetails.effectiveSample),
        confidence: {
          score: confidenceScore,
          grade: confidenceScore >= 68 ? "High" : confidenceScore >= 42 ? "Medium" : "Low",
          coverage,
          managerWeight: Math.round(historyWeight * 100),
          marketWeight: Math.round(marketWeight * 100),
          liveWeight: Math.round(liveWeight * 100),
          leagueWeight: Math.round(leagueWeight * 100)
        }
      };
    }

    function predictPick(managerId, draftRound, draftedPicks = [], options = {}) {
      const currentOverall = Number(options.currentOverall) || ((Number(draftRound) - 1) * (Number(history.league?.teams) || 12) + 1);
      const roundOutlook = roundProfile(managerId, draftRound, draftedPicks, options);
      const positionByName = new Map(roundOutlook.positions.map((item) => [item.position, item]));
      const candidates = (options.availablePlayers || []).map((entry) => entry.player || entry).filter((player) => player && POSITIONS.includes(player.position));
      const profile = profileById.get(managerId);
      const favoriteTeamCounts = new Map(profile?.favoriteTeams || []);
      const managerPicks = picksByManager.get(managerId) || [];
      const draftedIds = new Set((draftedPicks || []).map((pick) => pick.playerId).filter(Boolean));
      const scored = candidates.filter((player) => !draftedIds.has(player.id)).map((player) => {
        const rank = Number(player.rank || player.ecrRank || currentOverall + 36);
        const spread = Math.min(26, 10 + currentOverall * 0.025);
        const marketFit = Math.exp(-((rank - currentOverall) ** 2) / (2 * spread ** 2));
        const positionProbability = (positionByName.get(player.position)?.probability || 1) / 100;
        const repeats = managerPicks.filter((pick) => pick.playerKey === key(player.name));
        const repeatWeight = repeats.reduce((total, pick) => total + recencyWeight(pick.year), 0);
        const teamShare = (favoriteTeamCounts.get(player.team) || 0) / Math.max(profile?.sampleSize || 1, 1);
        const loyaltyMultiplier = 1 + Math.min(0.4, repeatWeight * 0.16);
        const teamMultiplier = 1 + Math.min(0.18, teamShare * 1.8);
        const score = Math.max(0.0001, positionProbability * (0.18 + marketFit * 0.82) * loyaltyMultiplier * teamMultiplier);
        const reasons = [];
        if (marketFit >= 0.72) reasons.push("fits the current market range");
        if (positionProbability >= 0.35) reasons.push(`${player.position} leads this manager forecast`);
        if (repeatWeight > 0) reasons.push("repeat-player history");
        if (teamShare >= 0.08) reasons.push(`${player.team} affinity`);
        if (!reasons.length) reasons.push("market and league baseline");
        return { player, rank, score, positionProbability, marketFit, reasons };
      });
      const positionTotals = new Map();
      scored.forEach((item) => positionTotals.set(item.player.position, (positionTotals.get(item.player.position) || 0) + item.score));
      const predictions = scored.map((item) => {
        const conditionalProbability = item.score / Math.max(positionTotals.get(item.player.position) || item.score, 0.0001);
        const absoluteProbability = item.positionProbability * conditionalProbability;
        const rangeWidth = Math.round(Math.min(28, 9 + item.rank * 0.035));
        return {
          playerId: item.player.id,
          name: item.player.name,
          team: item.player.team,
          position: item.player.position,
          probability: round(absoluteProbability * 100),
          conditionalProbability: round(conditionalProbability * 100),
          expectedRange: [Math.max(1, item.rank - rangeWidth), item.rank + rangeWidth],
          archetypes: archetypesFor(item.player),
          reasons: item.reasons.slice(0, 3)
        };
      }).sort((left, right) => right.probability - left.probability || left.expectedRange[0] - right.expectedRange[0]);
      const topPlayers = predictions.slice(0, Math.max(1, Number(options.limit) || 3));
      const namedProbability = sum(topPlayers.map((player) => player.probability));
      return {
        managerId,
        pick: { overall: currentOverall, round: Number(draftRound) },
        positions: roundOutlook.positions,
        players: topPlayers,
        fieldProbability: round(Math.max(0, 100 - namedProbability)),
        confidence: roundOutlook.confidence,
        evidence: {
          exactRoundSample: roundOutlook.exactSample,
          effectiveSample: roundOutlook.effectiveSample,
          personality: personalityFor(managerId)
        }
      };
    }

    function predictBoard(context = {}) {
      const teams = Number(context.teams) || Number(history.league?.teams) || 12;
      const draftOrder = context.draftOrder || groups.map((group) => group.id);
      const fromOverall = Math.max(1, Number(context.fromOverall) || 1);
      const throughRound = Math.max(1, Number(context.throughRound) || Number(history.league?.rounds) || 16);
      const forecasts = [];
      for (let overall = fromOverall; overall <= teams * throughRound; overall += 1) {
        const pick = managerAtPick(overall, teams, draftOrder);
        forecasts.push(predictPick(pick.managerId, pick.round, context.draftedPicks || [], { ...context, currentOverall: overall }));
      }
      return forecasts;
    }

  function personalityFor(managerId) {
      const profile = profileById.get(managerId);
      if (!profile || profile.sampleSize < 4) return { label: "League baseline", details: "Not enough confirmed manager history is available, so current market and room trends receive more weight." };
      const early = profile.rates.early;
      const favoriteEarly = early.RB >= early.WR ? "RB-leaning starts" : "WR-leaning starts";
      const qbTiming = profile.medianRound.QB ? `QB around Round ${profile.medianRound.QB}` : "unsettled QB timing";
      const teTiming = profile.medianRound.TE ? `TE around Round ${profile.medianRound.TE}` : "unsettled TE timing";
      const repeatCount = sum(profile.repeats.map(([, count]) => count - 1));
      const loyalty = repeatCount >= 4 ? "high player loyalty" : repeatCount >= 2 ? "some repeat-player loyalty" : "little repeat-player loyalty";
      const earlyMix = `early mix ${Math.round(early.RB * 100)}% RB / ${Math.round(early.WR * 100)}% WR`;
      return { label: favoriteEarly, details: `${earlyMix}; ${qbTiming}; ${teTiming}; ${loyalty}.` };
    }

    function marketSurvival(playerRank, currentOverall, targetOverall) {
      const rank = Math.max(1, Number(playerRank) || targetOverall);
      const spread = Math.min(18, 7 + rank * 0.035);
      const cdf = (pick) => 1 / (1 + Math.exp(-(pick - rank) / spread));
      const already = cdf(currentOverall);
      const byTarget = cdf(targetOverall - 0.5);
      return clamp((1 - byTarget) / Math.max(1 - already, 0.001), 0.01, 0.99);
    }

    function forecastReturn(player, context) {
      const teams = Number(context.teams) || 12;
      const draftOrder = context.draftOrder || groups.map((group) => group.id);
      const userManagerId = context.userManagerId;
      const draftedPicks = context.draftedPicks || [];
      const completed = Number(context.currentOverall) || 0;
      const currentPick = completed + 1;
      const currentManager = managerAtPick(currentPick, teams, draftOrder).managerId;
      const after = currentManager === userManagerId ? currentPick : completed;
      const nextPick = nextPickForManager(after, userManagerId, teams, draftOrder, context.maxRounds || 16);
      if (!nextPick) return { probability: 0, nextPick: null, atRiskManagers: [], insights: ["No future user pick remains."] };
      const keeperPicks = new Set((context.keepers || []).map((keeper) => overallForManagerRound(keeper.managerId, keeper.round, teams, draftOrder)).filter(Boolean));
      const opportunities = [];
      for (let overall = currentPick; overall < nextPick; overall += 1) {
        if (keeperPicks.has(overall)) continue;
        const pick = managerAtPick(overall, teams, draftOrder);
        if (pick.managerId === userManagerId) continue;
        const probabilityCache = context.positionProbabilityCache || (context.positionProbabilityCache = new Map());
        const cacheKey = `${pick.managerId}:${pick.round}:${pick.overall}`;
        if (!probabilityCache.has(cacheKey)) {
          probabilityCache.set(cacheKey, positionProbabilities(pick.managerId, pick.round, draftedPicks, {
            availablePlayers: context.availablePlayers,
            currentOverall: pick.overall
          }));
        }
        const positionForecast = probabilityCache.get(cacheKey).find((item) => item.position === player.position);
        const baseline = leagueRoundDistribution(pick.round)[player.position] || 0.01;
        const historical = (positionForecast?.probability || 0) / 100;
        const loyalty = (playerPicks.get(key(player.name)) || []).some((past) => past.managerId === pick.managerId) ? 1.1 : 1;
        const pressure = clamp((historical / baseline) * loyalty, 0.28, 1.72);
        opportunities.push({ ...pick, pressure, historical, loyalty });
      }
      const base = marketSurvival(player.rank, completed, nextPick);
      const averagePressure = opportunities.length ? opportunities.reduce((sum, pick) => sum + pick.pressure, 0) / opportunities.length : 1;
      const probability = clamp(base ** averagePressure, 0.01, 0.99);
      const atRiskManagers = opportunities.slice().sort((a, b) => b.pressure - a.pressure).slice(0, 3).map((pick) => ({
        managerId: pick.managerId,
        name: profileById.get(pick.managerId)?.name || pick.managerId.replace(/^unmapped:/, ""),
        overall: pick.overall,
        pressure: round(pick.pressure)
      }));
      const highPressure = atRiskManagers.filter((manager) => manager.pressure >= 1.15).length;
      const insights = [
        `Baseline rank ${player.rank}; next user pick ${nextPick}.`,
        `${opportunities.length} opponent selections before that pick.`,
        highPressure ? `${highPressure} manager tendencies increase ${player.position} pressure.` : `No strong historical ${player.position} pressure detected.`
      ];
      return { probability: Math.round(probability * 100), nextPick, baseProbability: Math.round(base * 100), averagePressure: round(averagePressure), atRiskManagers, insights };
    }

    function likelyPositions(managerId, draftRound, draftedPicks, options) {
      return positionProbabilities(managerId, draftRound, draftedPicks || [], options);
    }

    return Object.freeze({
      history,
      picks: Object.freeze(picks),
      managerProfiles: Object.freeze(managerProfiles),
      projectedKeepers: Object.freeze((history.projectedKeepers || []).map(([managerId, player, draftRound]) => Object.freeze({ managerId, player, round: draftRound }))),
      finalRosters: Object.freeze(finalRosters),
      keeperEligible: (managerId, name) => eligibleKeys.has(`${managerId}:${key(name)}`),
      profileFor: (managerId) => profileById.get(managerId) || null,
      playerHistory: (name) => Object.freeze((playerPicks.get(key(name)) || []).slice()),
      managerAtPick,
      overallForManagerRound,
      nextPickForManager,
      likelyPositions,
      positionProbabilities,
      roundProfile,
      predictPick,
      predictBoard,
      personalityFor,
      forecastReturn
    });
  }

  return Object.freeze({ createBrain, managerAtPick, nextPickForManager, overallForManagerRound });
});
