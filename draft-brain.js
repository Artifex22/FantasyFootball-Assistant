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
  const metadataKey = (value) => key(value).replace(/-(jr|sr|ii|iii)$/, "");
  const bandForRound = (draftRound) => draftRound <= 3 ? "early" : draftRound <= 8 ? "middle" : "late";
  const ARCHETYPE_DEFINITIONS = Object.freeze([
    { id: "rookie", label: "Rookie bets", category: "Experience" },
    { id: "secondYear", label: "Second-year breakouts", category: "Experience" },
    { id: "young", label: "Young profiles", category: "Age" },
    { id: "veteran", label: "Veteran bets", category: "Age" },
    { id: "lateYouth", label: "Late youth darts", category: "Age" },
    { id: "largeFrame", label: "Large-frame players", category: "Size" },
    { id: "lightFrame", label: "Light-frame players", category: "Size" },
    { id: "premiumCapital", label: "Premium NFL draft capital", category: "Draft capital" },
    { id: "dayThreeCapital", label: "Day 3 NFL draft capital", category: "Draft capital" },
    { id: "durableAtDraft", label: "Durable-at-draft profiles", category: "Injury" },
    { id: "injuryBet", label: "Injury-discount bets", category: "Injury" },
    { id: "clearRole", label: "Clear lead roles", category: "Role" },
    { id: "ambiguousRole", label: "Ambiguous lead-role bets", category: "Role" }
  ]);
  const CONSTRUCTION_DEFINITIONS = Object.freeze([
    { id: "samePositionDouble", label: "Same-position double-taps" },
    { id: "teamStack", label: "Three-player NFL team stacks" },
    { id: "qbStack", label: "QB + pass-catcher stacks" },
    { id: "backfieldPair", label: "Same-team RB pairs" }
  ]);

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

  function createBrain(history, options = {}) {
    const groups = Array.isArray(history.managerGroups) ? history.managerGroups : [];
    const formerGroups = Array.isArray(history.formerManagerGroups) ? history.formerManagerGroups : [];
    const identityWeights = Object.freeze({ high: 1, medium: 0.82, low: 0.62, none: 0.4 });
    const metadataByPlayer = new Map();
    [...(Array.isArray(history.playerMetadata) ? history.playerMetadata : []), ...(Array.isArray(options.playerProfiles) ? options.playerProfiles : [])].forEach((record) => {
      if (!record?.name) return;
      const lookup = metadataKey(record.name);
      const previous = metadataByPlayer.get(lookup) || {};
      metadataByPlayer.set(lookup, {
        ...previous,
        ...record,
        durabilityByYear: { ...(previous.durabilityByYear || {}), ...(record.durabilityByYear || {}) },
        roleClarityByYear: { ...(previous.roleClarityByYear || {}), ...(record.roleClarityByYear || {}) }
      });
    });
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
    const newestSeason = Math.max(...picks.map((pick) => pick.year), Number(options.currentSeason) - 1 || 2025);
    const currentSeason = Number(options.currentSeason) || newestSeason + 1;

    function estimatedAge(metadata, year) {
      const age = Number(metadata?.age);
      const asOfYear = Number(metadata?.asOfYear) || currentSeason;
      if (Number.isFinite(age)) return age - (asOfYear - Number(year));
      const birthYear = Number(metadata?.birthYear);
      return Number.isFinite(birthYear) ? Number(year) - birthYear : null;
    }

    function ageClass(position, age) {
      if (!Number.isFinite(age)) return null;
      const youngCeiling = { QB: 25.5, RB: 23.5, WR: 24, TE: 24.5 }[position] ?? 24;
      const veteranFloor = { QB: 32, RB: 27, WR: 29, TE: 30 }[position] ?? 29;
      if (age <= youngCeiling) return "young";
      if (age >= veteranFloor) return "veteran";
      return "prime";
    }

    function sizeClass(position, metadata) {
      const weight = Number(metadata?.weightLb);
      if (!Number.isFinite(weight)) return null;
      const largeFloor = { QB: 225, RB: 215, WR: 210, TE: 250 }[position];
      const lightCeiling = { QB: 210, RB: 200, WR: 185, TE: 235 }[position];
      if (Number.isFinite(largeFloor) && weight >= largeFloor) return "large";
      if (Number.isFinite(lightCeiling) && weight <= lightCeiling) return "light";
      return "average";
    }

    function archetypeValues(position, draftRound, year, metadata) {
      const draftYear = Number(metadata?.draftYear);
      const experience = Number.isFinite(draftYear) ? Number(year) - draftYear : null;
      const age = estimatedAge(metadata, year);
      const ageBucket = ageClass(position, age);
      const sizeBucket = sizeClass(position, metadata);
      const nflDraftRound = Number(metadata?.nflDraftRound);
      const datedDurability = Number(metadata?.durabilityByYear?.[year]);
      const datedRoleClarity = Number(metadata?.roleClarityByYear?.[year]);
      return {
        rookie: Number.isFinite(experience) ? experience === 0 : null,
        secondYear: Number.isFinite(experience) ? experience === 1 : null,
        young: ageBucket ? ageBucket === "young" : null,
        veteran: ageBucket ? ageBucket === "veteran" : null,
        lateYouth: ageBucket && Number.isFinite(experience) ? Number(draftRound) >= 6 && ageBucket === "young" && experience <= 1 : null,
        largeFrame: sizeBucket ? sizeBucket === "large" : null,
        lightFrame: sizeBucket ? sizeBucket === "light" : null,
        premiumCapital: Number.isFinite(nflDraftRound) ? nflDraftRound <= 2 : null,
        dayThreeCapital: Number.isFinite(nflDraftRound) ? nflDraftRound >= 4 : null,
        durableAtDraft: Number.isFinite(datedDurability) ? datedDurability >= 82 : null,
        injuryBet: Number.isFinite(datedDurability) ? datedDurability < 60 : null,
        clearRole: Number.isFinite(datedRoleClarity) ? datedRoleClarity >= 75 : null,
        ambiguousRole: Number.isFinite(datedRoleClarity) ? datedRoleClarity <= 45 : null
      };
    }

    const traitValuesByPick = new Map(picks.map((pick) => [pick, archetypeValues(pick.position, pick.round, pick.year, metadataByPlayer.get(metadataKey(pick.player)))]));

    function rawArchetypeStats(sourcePicks) {
      return Object.fromEntries(ARCHETYPE_DEFINITIONS.map((definition) => {
        const values = sourcePicks.map((pick) => traitValuesByPick.get(pick)?.[definition.id]).filter((value) => typeof value === "boolean");
        return [definition.id, { eligible: values.length, positives: values.filter(Boolean).length, rate: values.length ? values.filter(Boolean).length / values.length : null }];
      }));
    }

    const leagueArchetypeStats = rawArchetypeStats(picks);

    function managerArchetypeProfile(managerPicks, confidence) {
      const raw = rawArchetypeStats(managerPicks);
      const identityWeight = identityWeights[confidence] || identityWeights.none;
      const matched = managerPicks.filter((pick) => {
        const values = traitValuesByPick.get(pick) || {};
        return Object.values(values).some((value) => typeof value === "boolean");
      }).length;
      const coverage = managerPicks.length ? matched / managerPicks.length : 0;
      const signals = ARCHETYPE_DEFINITIONS.map((definition) => {
        const manager = raw[definition.id];
        const league = leagueArchetypeStats[definition.id];
        const observedRate = manager.rate;
        const leagueRate = league.rate;
        const reliability = manager.eligible ? manager.eligible / (manager.eligible + 10) * identityWeight * Math.sqrt(coverage) : 0;
        const adjustedRate = Number.isFinite(observedRate) && Number.isFinite(leagueRate) ? leagueRate + (observedRate - leagueRate) * reliability : null;
        const lift = Number.isFinite(adjustedRate) && Number.isFinite(leagueRate) ? adjustedRate - leagueRate : null;
        return Object.freeze({ ...definition, eligible: manager.eligible, positives: manager.positives, observedRate, leagueRate, adjustedRate, lift, reliability });
      });
      return {
        coverage,
        matched,
        signals: signals.sort((left, right) => Math.abs(right.lift || 0) - Math.abs(left.lift || 0) || right.eligible - left.eligible),
        unavailableCategories: [...new Set(signals.filter((signal) => !signal.eligible).map((signal) => signal.category))]
      };
    }

    function rawConstructionStats(sourcePicks) {
      const byDraft = new Map();
      sourcePicks.forEach((pick) => {
        const groupKey = `${pick.managerId}:${pick.year}`;
        if (!byDraft.has(groupKey)) byDraft.set(groupKey, []);
        byDraft.get(groupKey).push(pick);
      });
      let transitions = 0;
      let samePositionTransitions = 0;
      let teamStacks = 0;
      let qbStacks = 0;
      let backfieldPairs = 0;
      byDraft.forEach((draftPicks) => {
        const ordered = draftPicks.slice().sort((left, right) => left.round - right.round || left.slot - right.slot);
        for (let index = 1; index < ordered.length; index += 1) {
          transitions += 1;
          if (ordered[index].position === ordered[index - 1].position) samePositionTransitions += 1;
        }
        const teamGroups = new Map();
        ordered.forEach((pick) => {
          if (!pick.nflTeam || pick.nflTeam === "FA") return;
          if (!teamGroups.has(pick.nflTeam)) teamGroups.set(pick.nflTeam, []);
          teamGroups.get(pick.nflTeam).push(pick);
        });
        if ([...teamGroups.values()].some((team) => team.length >= 3)) teamStacks += 1;
        if ([...teamGroups.values()].some((team) => team.some((pick) => pick.position === "QB") && team.some((pick) => pick.position === "WR" || pick.position === "TE"))) qbStacks += 1;
        if ([...teamGroups.values()].some((team) => team.filter((pick) => pick.position === "RB").length >= 2)) backfieldPairs += 1;
      });
      const drafts = byDraft.size;
      return {
        samePositionDouble: { rate: transitions ? samePositionTransitions / transitions : null, sample: transitions },
        teamStack: { rate: drafts ? teamStacks / drafts : null, sample: drafts },
        qbStack: { rate: drafts ? qbStacks / drafts : null, sample: drafts },
        backfieldPair: { rate: drafts ? backfieldPairs / drafts : null, sample: drafts }
      };
    }

    const leagueConstructionStats = rawConstructionStats(picks);

    function managerConstructionProfile(managerPicks, confidence) {
      const manager = rawConstructionStats(managerPicks);
      const identityWeight = identityWeights[confidence] || identityWeights.none;
      return CONSTRUCTION_DEFINITIONS.map((definition) => {
        const observedRate = manager[definition.id].rate;
        const leagueRate = leagueConstructionStats[definition.id].rate;
        const sample = manager[definition.id].sample;
        const reliability = sample ? sample / (sample + 8) * identityWeight : 0;
        const adjustedRate = Number.isFinite(observedRate) && Number.isFinite(leagueRate) ? leagueRate + (observedRate - leagueRate) * reliability : null;
        return Object.freeze({ ...definition, sample, observedRate, leagueRate, adjustedRate, lift: Number.isFinite(adjustedRate) ? adjustedRate - leagueRate : null, reliability });
      }).sort((left, right) => Math.abs(right.lift || 0) - Math.abs(left.lift || 0));
    }

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
      const archetypeProfile = managerArchetypeProfile(managerPicks, group.confidence);
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
        favoriteTeams: Object.freeze(favoriteTeams),
        archetypeCoverage: Object.freeze({ rate: archetypeProfile.coverage, matched: archetypeProfile.matched, total: managerPicks.length }),
        archetypeSignals: Object.freeze(archetypeProfile.signals),
        unavailableArchetypes: Object.freeze(archetypeProfile.unavailableCategories),
        constructionSignals: Object.freeze(managerConstructionProfile(managerPicks, group.confidence))
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

    const leagueRoundCache = new Map();
    const repeatWeightCache = new Map();

    function recencyWeight(year) {
      return 2 ** (-Math.max(0, newestSeason - Number(year || newestSeason)) / 2);
    }

    function roundWeight(distance) {
      if (distance === 0) return 1;
      if (distance === 1) return 0.45;
      if (distance === 2) return 0.15;
      return 0.03;
    }

    function repeatWeightsFor(managerId) {
      if (repeatWeightCache.has(managerId)) return repeatWeightCache.get(managerId);
      const weights = new Map();
      (picksByManager.get(managerId) || []).forEach((pick) => {
        weights.set(pick.playerKey, (weights.get(pick.playerKey) || 0) + recencyWeight(pick.year));
      });
      repeatWeightCache.set(managerId, weights);
      return weights;
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

    function rosterFactors(managerId, draftedPicks, draftRound, options = {}) {
      const rosterSource = Array.isArray(options.rosterPicks) ? options.rosterPicks : draftedPicks;
      const managerPicks = (rosterSource || []).filter((pick) => pick.managerId === managerId);
      const counts = Object.fromEntries(POSITIONS.map((position) => [position, 0]));
      managerPicks.forEach((pick) => { if (POSITIONS.includes(pick.position)) counts[pick.position] += 1; });
      const factors = { QB: 1, RB: 1, WR: 1, TE: 1, K: 1, DST: 1 };
      const startingQbs = Number(options.startingQbs) === 2 ? 2 : 1;
      const totalRounds = Math.max(Number(options.totalRounds) || Number(history.league?.rounds) || 16, Number(draftRound));
      const starterTargets = { QB: startingQbs, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 };

      if (counts.QB >= startingQbs) factors.QB = counts.QB > startingQbs ? 0.04 : draftRound < 9 ? 0.04 : draftRound < 13 ? 0.16 : 0.48;
      else if (draftRound <= 2) factors.QB = 0.72;
      else if (draftRound >= 10) factors.QB = 3.4;
      else if (draftRound >= 8) factors.QB = 2.15;
      else if (startingQbs === 2) factors.QB = 1.35;

      if (counts.TE) factors.TE = draftRound < 10 ? 0.03 : draftRound < 13 ? 0.12 : 0.38;
      else if (draftRound <= 2) factors.TE = 0.7;
      else if (draftRound >= 10) factors.TE = 3.1;
      else if (draftRound >= 8) factors.TE = 1.9;

      const expectedBacks = Math.min(4, Math.max(1, Math.ceil(draftRound * 0.28)));
      const expectedReceivers = Math.min(5, Math.max(1, Math.ceil(draftRound * 0.34)));
      if (counts.RB < expectedBacks) factors.RB = 1.13;
      if (counts.WR < expectedReceivers) factors.WR = 1.13;
      if (counts.RB < 2 && draftRound >= 8) factors.RB *= 2.4;
      else if (counts.RB < 2 && draftRound >= 6) factors.RB *= 1.6;
      if (counts.WR < 2 && draftRound >= 8) factors.WR *= 2.4;
      else if (counts.WR < 2 && draftRound >= 6) factors.WR *= 1.6;
      if (counts.RB >= 6) factors.RB = 0.025;
      else if (counts.RB >= 5) factors.RB = 0.46;
      else if (counts.RB >= 4) factors.RB = 0.78;
      if (counts.WR >= 7) factors.WR = 0.025;
      else if (counts.WR >= 6) factors.WR = 0.22;
      else if (counts.WR >= 5) factors.WR = 0.8;

      factors.K = counts.K ? 0.01 : draftRound <= 11 ? 0.025 : draftRound === 12 ? 0.12 : draftRound === 13 ? 0.48 : 1.35;
      factors.DST = counts.DST ? 0.01 : draftRound <= 11 ? 0.025 : draftRound === 12 ? 0.14 : draftRound === 13 ? 0.56 : 1.45;

      const missingByPosition = Object.fromEntries(POSITIONS.map((position) => [position, Math.max(0, starterTargets[position] - counts[position])]));
      const missingStarterSlots = sum(Object.values(missingByPosition));
      const remainingPicks = totalRounds - Number(draftRound) + 1;
      if (missingStarterSlots && remainingPicks <= missingStarterSlots + 1) {
        POSITIONS.forEach((position) => {
          factors[position] *= missingByPosition[position] ? 4.5 : 0.025;
        });
      } else if (missingStarterSlots && remainingPicks <= missingStarterSlots + 3) {
        POSITIONS.forEach((position) => {
          if (missingByPosition[position]) factors[position] *= 1.75;
        });
      }
      return { counts, factors };
    }

    function positionProbabilities(managerId, draftRound, draftedPicks, options = {}) {
      const historyDetails = managerHistoryDetails(managerId, draftRound);
      const historyDistribution = historyDetails.distribution;
      const market = marketDistribution(draftRound, options.currentOverall, options.availablePlayers);
      const live = liveDistribution(Array.isArray(options.livePicks) ? options.livePicks : draftedPicks, draftRound);
      const league = leagueRoundDistribution(draftRound);
      const liveSample = Math.min(60, (draftedPicks || []).length);
      const liveWeight = 0.04 + (liveSample / 60) * 0.18;
      const historyWeight = 0.12 + historyDetails.managerConfidence * 0.46;
      const marketWeight = 0.3;
      const leagueWeight = Math.max(0.01, 1 - historyWeight - marketWeight - liveWeight);
      const roster = rosterFactors(managerId, draftedPicks, draftRound, options);
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
        if (roster.factors[position] < 0.2) {
          if (roster.counts[position]) reasons.push(`already drafted ${position}`);
          else if (position === "K" || position === "DST") reasons.push("normally reserved for late rounds");
          else reasons.push("current roster construction");
        }
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

    function currentArchetypeValues(player) {
      const metadata = metadataByPlayer.get(metadataKey(player.name)) || {};
      const stable = archetypeValues(player.position, 1, currentSeason, metadata);
      if (player.isRookie && stable.rookie === null) stable.rookie = true;
      return stable;
    }

    function archetypeFitFor(managerId, player, rosterPicks = []) {
      const profile = profileById.get(managerId);
      const values = currentArchetypeValues(player);
      const matchedSignals = (profile?.archetypeSignals || []).filter((signal) => values[signal.id] === true && signal.eligible >= 6 && Number.isFinite(signal.lift) && Math.abs(signal.lift) >= 0.025);
      let adjustment = sum(matchedSignals.map((signal) => signal.lift * 0.7));
      const constructionReasons = [];
      const managerRoster = rosterPicks.filter((pick) => pick.managerId === managerId);
      const constructionById = new Map((profile?.constructionSignals || []).map((signal) => [signal.id, signal]));
      const sameTeam = managerRoster.filter((pick) => pick.team && pick.team === player.team);
      const stackSignal = constructionById.get("qbStack");
      const formsQbStack = sameTeam.some((pick) => (player.position === "QB" && (pick.position === "WR" || pick.position === "TE")) || ((player.position === "WR" || player.position === "TE") && pick.position === "QB"));
      if (formsQbStack && stackSignal?.lift > 0.03) {
        adjustment += stackSignal.lift * 0.45;
        constructionReasons.push(`QB-stack tendency (+${Math.round(stackSignal.lift * 100)}pp vs league)`);
      }
      const backfieldSignal = constructionById.get("backfieldPair");
      if (player.position === "RB" && sameTeam.some((pick) => pick.position === "RB") && backfieldSignal?.lift > 0.03) {
        adjustment += backfieldSignal.lift * 0.35;
        constructionReasons.push(`same-team RB pairing (+${Math.round(backfieldSignal.lift * 100)}pp)`);
      }
      return {
        multiplier: 1 + clamp(adjustment, -0.16, 0.18),
        adjustment: clamp(adjustment, -0.16, 0.18),
        signals: matchedSignals,
        reasons: constructionReasons
      };
    }

    function archetypesFor(player) {
      const rank = Number(player.rank || player.ecrRank || 999);
      const metadata = metadataByPlayer.get(metadataKey(player.name)) || {};
      const values = currentArchetypeValues(player);
      const labels = [];
      if (values.rookie) labels.push("rookie bet");
      else if (values.secondYear) labels.push("second-year breakout");
      if (values.young) labels.push("young profile");
      else if (values.veteran) labels.push("veteran profile");
      const currentDurability = Number(metadata.durability);
      if (Number.isFinite(currentDurability) && currentDurability < 60) labels.push("current durability risk");
      else if (Number.isFinite(currentDurability) && currentDurability >= 85) labels.push("durable profile");
      const projection = metadata.projection || {};
      if (player.position === "QB") labels.push(Number(projection.carries) >= 70 ? "rushing-upside QB" : rank <= 80 ? "priority starter" : "late QB value");
      else if (player.position === "RB") {
        if (Number(projection.targets) >= 55) labels.push("receiving back");
        else if (Number(projection.carries) >= 220) labels.push("early-down volume");
        else labels.push(rank <= 120 ? "committee upside" : "bench upside");
      } else if (player.position === "WR") labels.push(Number(projection.targets) >= 120 || Number(projection.targetShare) >= 22 ? "alpha-volume projection" : rank <= 120 ? "target-growth bet" : "late receiver dart");
      else if (player.position === "TE") labels.push(Number(projection.targets) >= 85 ? "target-focal tight end" : rank <= 130 ? "breakout tight end" : "late streamer");
      else labels.push(player.position === "DST" ? "defense streamer" : "kicker streamer");
      if (Number(player.stdDev) >= 12) labels.push("market-volatile");
      return [...new Set(labels)].slice(0, 4);
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
      const repeatWeights = repeatWeightsFor(managerId);
      const draftedIds = new Set((draftedPicks || []).map((pick) => pick.playerId).filter(Boolean));
      const availableCandidates = candidates.filter((player) => !draftedIds.has(player.id));
      const rosterPicks = Array.isArray(options.rosterPicks) ? options.rosterPicks : draftedPicks;
      const spread = Math.min(26, 10 + currentOverall * 0.025);
      const candidateWindow = Math.max(42, spread * 3.2);
      const nearbyCandidates = availableCandidates.filter((player) => Math.abs(Number(player.rank || player.ecrRank || currentOverall + 36) - currentOverall) <= candidateWindow);
      const scored = (nearbyCandidates.length ? nearbyCandidates : availableCandidates).map((player) => {
        const rank = Number(player.rank || player.ecrRank || currentOverall + 36);
        const marketFit = Math.exp(-((rank - currentOverall) ** 2) / (2 * spread ** 2));
        const positionProbability = (positionByName.get(player.position)?.probability || 1) / 100;
        const repeatWeight = repeatWeights.get(key(player.name)) || 0;
        const teamShare = (favoriteTeamCounts.get(player.team) || 0) / Math.max(profile?.sampleSize || 1, 1);
        const archetypeFit = archetypeFitFor(managerId, player, rosterPicks);
        const loyaltyMultiplier = 1 + Math.min(0.4, repeatWeight * 0.16);
        const teamMultiplier = 1 + Math.min(0.18, teamShare * 1.8);
        const score = Math.max(0.0001, positionProbability * (0.18 + marketFit * 0.82) * loyaltyMultiplier * teamMultiplier * archetypeFit.multiplier);
        const reasons = [];
        if (marketFit >= 0.72) reasons.push("fits the current market range");
        if (positionProbability >= 0.35) reasons.push(`${player.position} leads this manager forecast`);
        if (repeatWeight > 0) reasons.push("repeat-player history");
        if (teamShare >= 0.08) reasons.push(`${player.team} affinity`);
        const strongestArchetype = archetypeFit.signals[0];
        if (strongestArchetype) reasons.push(`${strongestArchetype.label.toLowerCase()} ${strongestArchetype.lift >= 0 ? "+" : ""}${Math.round(strongestArchetype.lift * 100)}pp vs league`);
        reasons.push(...archetypeFit.reasons);
        if (!reasons.length) reasons.push("market and league baseline");
        return { player, rank, score, positionProbability, marketFit, reasons, archetypeFit };
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
          archetypeAdjustment: round(item.archetypeFit.adjustment * 100),
          reasons: item.reasons.slice(0, 4)
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
      const totalPicks = teams * throughRound;
      const actualPicks = (context.draftedPicks || []).slice().sort((left, right) => Number(left.overall || 0) - Number(right.overall || 0));
      const lockedPicks = (context.lockedPicks || []).slice();
      const fixedByOverall = new Map([...actualPicks, ...lockedPicks].map((pick) => [Number(pick.overall), pick]));
      const simulatedPicks = [];
      const unavailableIds = new Set([...actualPicks, ...lockedPicks].map((pick) => pick.playerId).filter(Boolean));
      const forecasts = [];
      for (let overall = 1; overall <= totalPicks; overall += 1) {
        const pick = managerAtPick(overall, teams, draftOrder);
        const fixedPick = fixedByOverall.get(overall);
        if (fixedPick) {
          simulatedPicks.push(fixedPick);
          if (overall >= fromOverall) {
            forecasts.push(Object.freeze({
              managerId: pick.managerId,
              pick: { overall, round: pick.round },
              positions: [],
              players: [],
              fieldProbability: 0,
              confidence: { score: 100, grade: "Recorded", coverage: 100, managerWeight: 0, marketWeight: 0, liveWeight: 0, leagueWeight: 0 },
              evidence: { exactRoundSample: 0, effectiveSample: 0, personality: personalityFor(pick.managerId) },
              selectedPlayer: fixedPick,
              actual: actualPicks.includes(fixedPick),
              locked: lockedPicks.includes(fixedPick)
            }));
          }
          continue;
        }
        const availablePlayers = (context.availablePlayers || []).filter((entry) => {
          const player = entry?.player || entry;
          return player?.id && !unavailableIds.has(player.id);
        });
        const visibleLivePicks = actualPicks.filter((entry) => Number(entry.overall || 0) < overall);
        const prediction = predictPick(pick.managerId, pick.round, simulatedPicks, {
          ...context,
          availablePlayers,
          currentOverall: overall,
          livePicks: visibleLivePicks,
          rosterPicks: simulatedPicks,
          totalRounds: throughRound
        });
        const selectedPlayer = prediction.players[0] || null;
        const selectedPosition = selectedPlayer?.position || prediction.positions[0]?.position || null;
        const simulatedPick = {
          managerId: pick.managerId,
          position: selectedPosition,
          round: pick.round,
          overall,
          playerId: selectedPlayer?.playerId || `simulated:${pick.managerId}:${overall}`,
          name: selectedPlayer?.name || "Simulated pick",
          team: selectedPlayer?.team || null
        };
        simulatedPicks.push(simulatedPick);
        if (selectedPlayer?.playerId) unavailableIds.add(selectedPlayer.playerId);
        if (overall >= fromOverall) forecasts.push(Object.freeze({ ...prediction, selectedPlayer, actual: false, locked: false }));
      }
      return forecasts;
    }

    function simulateManagerDraft(managerId, options = {}) {
      const teams = Number(options.teams) || Number(history.league?.teams) || 12;
      const draftOrder = options.draftOrder || groups.map((group) => group.id);
      const totalRounds = Math.max(1, Number(options.rounds) || Number(history.league?.rounds) || 16);
      const actualPicks = (options.draftedPicks || []).slice().sort((left, right) => Number(left.overall || 0) - Number(right.overall || 0));
      const actualByRound = new Map(actualPicks.filter((pick) => pick.managerId === managerId).map((pick) => [Number(pick.round), pick]));
      const rosterPicks = [];
      const rounds = [];

      for (let draftRound = 1; draftRound <= totalRounds; draftRound += 1) {
        const currentOverall = overallForManagerRound(managerId, draftRound, teams, draftOrder);
        const visiblePicks = actualPicks.filter((pick) => Number(pick.overall || 0) < currentOverall);
        const actualPick = actualByRound.get(draftRound);
        const draftedIds = new Set(visiblePicks.map((pick) => pick.playerId).filter(Boolean));
        const availablePlayers = (options.availablePlayers || []).filter((player) => !draftedIds.has(player.id));
        const outlook = roundProfile(managerId, draftRound, visiblePicks, {
          ...options,
          availablePlayers,
          currentOverall,
          rosterPicks,
          totalRounds
        });
        const selectedPosition = actualPick?.position || outlook.topPosition.position;
        const selectedProbability = actualPick ? 100 : outlook.positions.find((item) => item.position === selectedPosition)?.probability || 0;
        const simulatedPick = actualPick || {
          managerId,
          position: selectedPosition,
          round: draftRound,
          overall: currentOverall,
          playerId: `simulated:${managerId}:${draftRound}`
        };
        rosterPicks.push(simulatedPick);
        rounds.push(Object.freeze({
          ...outlook,
          selectedPosition,
          selectedProbability,
          actual: Boolean(actualPick),
          rosterCounts: Object.freeze(Object.fromEntries(POSITIONS.map((position) => [position, rosterPicks.filter((pick) => pick.position === position).length])))
        }));
      }

      return Object.freeze({
        managerId,
        rounds: Object.freeze(rounds),
        rosterCounts: rounds.length ? rounds[rounds.length - 1].rosterCounts : Object.freeze(Object.fromEntries(POSITIONS.map((position) => [position, 0])))
      });
    }

  function personalityFor(managerId) {
      const profile = profileById.get(managerId);
      if (!profile || profile.sampleSize < 4) return { label: "League baseline", details: "Not enough confirmed manager history is available, so current market and room trends receive more weight.", archetypes: [], construction: [], coverage: 0, limitations: ["Low historical sample"] };
      const early = profile.rates.early;
      const favoriteEarly = early.RB >= early.WR ? "RB-leaning starts" : "WR-leaning starts";
      const qbTiming = profile.medianRound.QB ? `QB around Round ${profile.medianRound.QB}` : "unsettled QB timing";
      const teTiming = profile.medianRound.TE ? `TE around Round ${profile.medianRound.TE}` : "unsettled TE timing";
      const repeatCount = sum(profile.repeats.map(([, count]) => count - 1));
      const loyalty = repeatCount >= 4 ? "high player loyalty" : repeatCount >= 2 ? "some repeat-player loyalty" : "little repeat-player loyalty";
      const earlyMix = `early mix ${Math.round(early.RB * 100)}% RB / ${Math.round(early.WR * 100)}% WR`;
      const archetypes = profile.archetypeSignals.filter((signal) => signal.eligible >= 6 && Math.abs(signal.lift || 0) >= 0.025).slice(0, 4);
      const construction = profile.constructionSignals.filter((signal) => signal.sample >= 3 && Math.abs(signal.lift || 0) >= 0.025).slice(0, 4);
      const archetypeSummary = archetypes[0] ? ` strongest player-type signal: ${archetypes[0].label.toLowerCase()} ${archetypes[0].lift >= 0 ? "+" : ""}${Math.round(archetypes[0].lift * 100)} percentage points versus this league` : " no stable player-type divergence yet";
      return {
        label: favoriteEarly,
        details: `${earlyMix}; ${qbTiming}; ${teTiming}; ${loyalty};${archetypeSummary}.`,
        archetypes,
        construction,
        coverage: Math.round(profile.archetypeCoverage.rate * 100),
        limitations: profile.unavailableArchetypes
      };
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
      simulateManagerDraft,
      personalityFor,
      forecastReturn
    });
  }

  return Object.freeze({ createBrain, managerAtPick, nextPickForManager, overallForManagerRound });
});
