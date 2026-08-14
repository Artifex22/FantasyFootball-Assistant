(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WaiverEngine = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const SIGNALS = [
    { key: "recentUsageTrend", weight: 12, label: "recent usage trend" },
    { key: "snapShare", weight: 8, label: "snap share" },
    { key: "routeParticipation", weight: 8, label: "route participation" },
    { key: "opportunityShare", weight: 8, label: "opportunity share" },
    { key: "opportunity", weight: 12, label: "opportunity quality" },
    { key: "roleDurability", weight: 10, label: "role durability" },
    { key: "rosProjection", weight: 22, label: "rest-of-season projection" },
    { key: "schedule", weight: 8, label: "schedule" },
    { key: "positionScarcity", weight: 6, label: "position scarcity" },
    { key: "rosterNeed", weight: 6, label: "roster need", context: true }
  ];
  const TOTAL_WEIGHT = SIGNALS.reduce((total, signal) => total + signal.weight, 0);
  const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, value));
  const round = (value, digits = 1) => {
    const scale = 10 ** digits;
    return Math.round(value * scale) / scale;
  };

  function finite(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function grade(value) {
    const number = finite(value);
    return number === null ? null : clamp(number);
  }

  function idFor(value) {
    return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function parseCsvRows(source) {
    const rows = [];
    let row = [];
    let value = "";
    let quoted = false;
    for (let index = 0; index < source.length; index += 1) {
      const character = source[index];
      if (character === '"') {
        if (quoted && source[index + 1] === '"') { value += '"'; index += 1; }
        else quoted = !quoted;
      } else if (character === "," && !quoted) {
        row.push(value.trim()); value = "";
      } else if ((character === "\n" || character === "\r") && !quoted) {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        row.push(value.trim()); value = "";
        if (row.some(Boolean)) rows.push(row);
        row = [];
      } else value += character;
    }
    row.push(value.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
  }

  function parseCsv(source) {
    const rows = parseCsvRows(String(source || "").trim());
    if (rows.length < 2) return { candidates: [], errors: ["CSV needs a header and at least one candidate."] };
    const headers = rows[0].map((header) => String(header || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, ""));
    const aliases = {
      name: ["name", "player", "player_name"], position: ["position", "pos"], available: ["available", "is_available"], rosteredPercent: ["rostered_percent", "rostered", "roster_percent"],
      recentUsageTrend: ["recent_usage_trend", "usage_trend"], snapShare: ["snap_share", "snaps"], routeParticipation: ["route_participation", "route_share"], opportunityShare: ["opportunity_share", "opp_share"],
      opportunity: ["opportunity", "opportunity_quality"], roleDurability: ["role_durability", "role_security"], rosProjection: ["ros_projection", "rest_of_season"], schedule: ["schedule", "schedule_grade"],
      positionScarcity: ["position_scarcity", "scarcity"], injuryReplacementWeeks: ["injury_replacement_weeks", "replacement_weeks"]
    };
    const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1]));
    if (columns.name < 0 || columns.position < 0) return { candidates: [], errors: ["CSV requires name and position columns."] };
    const errors = [];
    const candidates = rows.slice(1).map((values, rowIndex) => {
      const name = String(values[columns.name] || "").trim().slice(0, 80);
      const position = String(values[columns.position] || "").trim().toUpperCase();
      if (!name || !["QB", "RB", "WR", "TE", "K", "DST"].includes(position)) {
        errors.push(`Row ${rowIndex + 2} was skipped: name or position is invalid.`);
        return null;
      }
      const candidate = { id: idFor(name), name, position };
      Object.keys(columns).filter((key) => !["name", "position", "available"].includes(key) && columns[key] >= 0).forEach((key) => {
        const value = finite(values[columns[key]]);
        if (value !== null) candidate[key] = key === "injuryReplacementWeeks" ? Math.max(0, value) : clamp(value);
      });
      if (columns.available >= 0) candidate.available = !/^(false|no|0|rostered)$/i.test(String(values[columns.available] || "").trim());
      return candidate;
    }).filter(Boolean);
    return { candidates, errors };
  }

  function createCsvTemplate() {
    return [
      "name,position,available,rostered_percent,recent_usage_trend,snap_share,route_participation,opportunity_share,opportunity,role_durability,ros_projection,schedule,position_scarcity,injury_replacement_weeks",
      "Example Running Back,RB,true,38,88,79,61,84,90,72,82,64,78,",
      "Temporary Starter,WR,true,22,74,81,86,68,73,42,58,70,55,3"
    ].join("\n");
  }

  function signalValue(signal, player, context) {
    return grade(signal.context ? context[signal.key] : player[signal.key]);
  }

  function coverageFor(player, context) {
    const present = [];
    const missing = [];
    let observedWeight = 0;
    SIGNALS.forEach((signal) => {
      if (signalValue(signal, player, context) === null) {
        missing.push(signal.key);
      } else {
        present.push(signal.key);
        observedWeight += signal.weight;
      }
    });
    const percentage = Math.round((observedWeight / TOTAL_WEIGHT) * 100);
    const confidence = percentage >= 80 && present.length >= 8
      ? "High"
      : percentage >= 55 && present.length >= 5
        ? "Medium"
        : "Low";
    return { percentage, confidence, observedWeight, totalWeight: TOTAL_WEIGHT, present, missing };
  }

  function scoreFor(player, context) {
    let weightedTotal = 0;
    let observedWeight = 0;
    SIGNALS.forEach((signal) => {
      const value = signalValue(signal, player, context);
      if (value === null) return;
      weightedTotal += value * signal.weight;
      observedWeight += signal.weight;
    });
    return observedWeight ? round(weightedTotal / observedWeight) : null;
  }

  function priorityFor(score, confidence) {
    if (score === null) return { tier: "Unrated", rank: 6 };
    let tier;
    let rank;
    if (score >= 82) ({ tier, rank } = { tier: "Priority 1", rank: 1 });
    else if (score >= 70) ({ tier, rank } = { tier: "Priority 2", rank: 2 });
    else if (score >= 58) ({ tier, rank } = { tier: "Priority 3", rank: 3 });
    else if (score >= 45) ({ tier, rank } = { tier: "Watch", rank: 4 });
    else ({ tier, rank } = { tier: "Pass", rank: 5 });
    if (confidence === "Low" && rank < 2) return { tier: "Priority 2", rank: 2 };
    return { tier, rank };
  }

  function relevanceHorizon(player) {
    const replacementWeeks = finite(player.injuryReplacementWeeks);
    if (replacementWeeks !== null) {
      const weeks = Math.max(0, Math.round(replacementWeeks));
      if (weeks === 0) return { label: "No confirmed window", weeks: 0, basis: "injuryReplacementWeeks" };
      if (weeks <= 4) return { label: `${weeks} week${weeks === 1 ? "" : "s"}`, weeks, basis: "injuryReplacementWeeks" };
      return { label: `${weeks}+ weeks`, weeks, basis: "injuryReplacementWeeks" };
    }
    const durability = grade(player.roleDurability);
    const projection = grade(player.rosProjection);
    const opportunity = grade(player.opportunity);
    if (durability !== null && projection !== null && durability >= 70 && projection >= 65) {
      return { label: "Rest of season", weeks: null, basis: "durable role and projection" };
    }
    if (opportunity !== null && opportunity >= 65) return { label: "Multi-week", weeks: null, basis: "opportunity" };
    return { label: "Unclear", weeks: null, basis: "insufficient role-window data" };
  }

  function labelsFor(player, score, coverage, horizon) {
    const projection = grade(player.rosProjection);
    const opportunity = grade(player.opportunity);
    const trend = grade(player.recentUsageTrend);
    const durability = grade(player.roleDurability);
    const upsideEvidence = [projection, opportunity, trend].filter((value) => value !== null);
    const upsideAverage = upsideEvidence.length
      ? upsideEvidence.reduce((total, value) => total + value, 0) / upsideEvidence.length
      : null;
    const upside = upsideAverage === null
      ? "Unknown"
      : upsideAverage >= 82
        ? "Elite"
        : upsideAverage >= 68
          ? "High"
          : upsideAverage >= 52
            ? "Moderate"
            : "Limited";

    const temporaryRole = horizon.basis === "injuryReplacementWeeks" && horizon.weeks !== null && horizon.weeks <= 4;
    let risk = "Unknown";
    if (durability !== null || trend !== null || temporaryRole) {
      if (temporaryRole || (durability !== null && durability < 45) || (trend !== null && trend < 35)) risk = "High";
      else if (durability !== null && durability >= 75 && trend !== null && trend >= 50) risk = "Low";
      else risk = "Medium";
    }

    let seasonWinner = "Insufficient data";
    if (coverage.confidence !== "Low" && score !== null) {
      if (score >= 86 && projection >= 82 && opportunity >= 78 && !temporaryRole) seasonWinner = "Strong candidate";
      else if (score >= 76 && (projection >= 75 || opportunity >= 75)) seasonWinner = "Possible";
      else seasonWinner = "Unlikely";
    }
    return { seasonWinner, upside, risk };
  }

  function faabFor(player, context, score, priority, coverage, labels) {
    const budget = finite(context.leagueFaabBudget);
    const remaining = finite(context.remainingFaab);
    if (score === null) {
      return { minPercent: null, targetPercent: null, maxPercent: null, minDollars: null, targetDollars: null, maxDollars: null, budget: budget === null ? null : Math.max(0, budget) };
    }

    const need = grade(context.rosterNeed);
    const scarcity = grade(player.positionScarcity);
    const rosteredPercent = grade(player.rosteredPercent);
    const week = finite(context.week);
    let target = Math.max(0, (score - 42) * 0.42);
    if (need !== null) target += Math.max(0, need - 50) * 0.055;
    if (scarcity !== null) target += Math.max(0, scarcity - 60) * 0.035;
    if (rosteredPercent !== null) target += Math.max(0, rosteredPercent - 35) * 0.018;
    if (labels.seasonWinner === "Strong candidate") target += 6;
    else if (labels.seasonWinner === "Possible") target += 2.5;
    if (week !== null) target *= week <= 4 ? 1.12 : week >= 11 ? 0.88 : 1;
    if (coverage.confidence === "Low") target *= 0.65;
    else if (coverage.confidence === "Medium") target *= 0.86;
    if (priority.rank >= 4) target = Math.min(target, priority.rank === 4 ? 3 : 1);
    target = clamp(target, 0, 55);
    const spread = coverage.confidence === "High" ? 0.28 : coverage.confidence === "Medium" ? 0.38 : 0.5;
    const minPercent = round(Math.max(0, target * (1 - spread)));
    const targetPercent = round(target);
    const maxPercent = round(Math.min(70, target * (1 + spread) + (priority.rank === 1 ? 2 : 0)));
    const availableBudget = budget === null ? null : Math.max(0, Math.min(budget, remaining === null ? budget : Math.max(0, remaining)));
    const dollars = (percent) => availableBudget === null ? null : Math.min(availableBudget, Math.round((Math.max(0, budget) * percent) / 100));
    return {
      minPercent,
      targetPercent,
      maxPercent,
      minDollars: dollars(minPercent),
      targetDollars: dollars(targetPercent),
      maxDollars: dollars(maxPercent),
      budget: budget === null ? null : Math.max(0, budget)
    };
  }

  function reasonsFor(player, context, score, coverage, labels, horizon) {
    const observations = SIGNALS.map((signal) => ({
      key: signal.key,
      label: signal.label,
      value: signalValue(signal, player, context),
      weight: signal.weight
    })).filter((signal) => signal.value !== null);
    const reasons = [];
    const strongest = observations.filter((signal) => signal.value >= 70).sort((left, right) => (right.value * right.weight) - (left.value * left.weight)).slice(0, 2);
    if (strongest.length) reasons.push(`${strongest.map((signal) => `${signal.label} ${Math.round(signal.value)}`).join(" and ")} support the claim.`);
    const concern = observations.filter((signal) => signal.value <= 40).sort((left, right) => left.value - right.value)[0];
    if (concern) reasons.push(`${concern.label} ${Math.round(concern.value)} is the clearest risk.`);
    if (horizon.basis === "injuryReplacementWeeks") reasons.push(`The current role projects for ${horizon.label}.`);
    if (labels.seasonWinner === "Strong candidate") reasons.push("The durable rest-of-season ceiling supports season-winner potential.");
    if (coverage.confidence === "Low") reasons.push(`Low confidence: ${coverage.missing.length} weighted metrics are missing.`);
    if (!reasons.length && score !== null) reasons.push(`Available evidence produces a ${score.toFixed(1)} waiver score.`);
    if (!reasons.length) reasons.push("Insufficient measured data to make a waiver claim.");
    return reasons.slice(0, 3);
  }

  function recommend(player = {}, context = {}) {
    const coverage = coverageFor(player, context);
    const score = scoreFor(player, context);
    const priority = priorityFor(score, coverage.confidence);
    const relevance = relevanceHorizon(player);
    const labels = labelsFor(player, score, coverage, relevance);
    const faab = faabFor(player, context, score, priority, coverage, labels);
    return {
      playerId: player.id || null,
      playerName: player.name || "Unknown player",
      position: player.position || null,
      rosteredPercent: grade(player.rosteredPercent),
      available: typeof player.available === "boolean" ? player.available : null,
      score,
      priorityTier: priority.tier,
      priorityRank: priority.rank,
      faab,
      relevanceHorizon: relevance,
      labels,
      coverage,
      reasons: reasonsFor(player, context, score, coverage, labels, relevance)
    };
  }

  function rank(players, context = {}) {
    return (players || []).map((player) => recommend(player, context)).sort((left, right) => {
      const scoreDifference = (right.score ?? -1) - (left.score ?? -1);
      if (scoreDifference) return scoreDifference;
      const nameLeft = left.playerName.toLowerCase();
      const nameRight = right.playerName.toLowerCase();
      return nameLeft < nameRight ? -1 : nameLeft > nameRight ? 1 : 0;
    });
  }

  return {
    INPUT_SCHEMA: {
      grades: SIGNALS.map((signal) => signal.key),
      gradeRange: [0, 100],
      playerFields: ["id", "name", "position", "available", "rosteredPercent", "injuryReplacementWeeks", ...SIGNALS.filter((signal) => !signal.context).map((signal) => signal.key)],
      contextFields: ["rosterNeed", "leagueFaabBudget", "remainingFaab", "week"]
    },
    SIGNALS: SIGNALS.map((signal) => ({ ...signal })),
    coverageFor,
    createCsvTemplate,
    parseCsv,
    rank,
    recommend
  };
});
