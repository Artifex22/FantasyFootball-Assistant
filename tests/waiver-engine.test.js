"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const engine = require("../waiver-engine.js");

const strongPlayer = {
  id: "breakout-runner",
  name: "Breakout Runner",
  position: "RB",
  available: true,
  rosteredPercent: 42,
  recentUsageTrend: 91,
  snapShare: 84,
  routeParticipation: 72,
  opportunityShare: 88,
  opportunity: 92,
  roleDurability: 86,
  rosProjection: 90,
  schedule: 74,
  positionScarcity: 82
};
const league = { rosterNeed: 88, leagueFaabBudget: 100, remainingFaab: 67, week: 3 };

test("returns deterministic priority, FAAB percentages, dollars, and explanations", () => {
  const first = engine.recommend(strongPlayer, league);
  const second = engine.recommend(strongPlayer, league);
  assert.deepEqual(first, second);
  assert.equal(first.priorityTier, "Priority 1");
  assert.equal(first.coverage.confidence, "High");
  assert.equal(first.labels.seasonWinner, "Strong candidate");
  assert.ok(first.faab.minPercent < first.faab.targetPercent);
  assert.ok(first.faab.targetPercent < first.faab.maxPercent);
  assert.equal(first.faab.targetDollars, Math.round(first.faab.targetPercent));
  assert.ok(first.faab.maxDollars <= league.remainingFaab);
  assert.ok(first.reasons.length >= 1 && first.reasons.length <= 3);
});

test("does not invent missing metrics and reports explicit low coverage", () => {
  const result = engine.recommend({ id: "unknown", name: "Unknown Add", rosProjection: 90 }, { leagueFaabBudget: 100, week: 4 });
  assert.equal(result.coverage.confidence, "Low");
  assert.equal(result.coverage.present.length, 1);
  assert.ok(result.coverage.missing.includes("opportunity"));
  assert.equal(result.score, 90);
  assert.equal(result.priorityTier, "Priority 2");
  assert.equal(result.labels.seasonWinner, "Insufficient data");
  assert.match(result.reasons.at(-1), /Low confidence/);

  const empty = engine.recommend({ name: "No Data" }, {});
  assert.equal(empty.score, null);
  assert.equal(empty.priorityTier, "Unrated");
  assert.equal(empty.faab.targetDollars, null);
  assert.equal(empty.coverage.percentage, 0);
});

test("labels short injury replacements as temporary and high risk", () => {
  const result = engine.recommend({
    ...strongPlayer,
    id: "temporary-back",
    name: "Temporary Back",
    injuryReplacementWeeks: 2
  }, league);
  assert.equal(result.relevanceHorizon.label, "2 weeks");
  assert.equal(result.labels.risk, "High");
  assert.notEqual(result.labels.seasonWinner, "Strong candidate");
  assert.ok(result.reasons.some((reason) => /2 weeks/.test(reason)));
});

test("ranks by score with stable name tie-breaking", () => {
  const ranked = engine.rank([
    { name: "Zulu", rosProjection: 60 },
    { name: "Alpha", rosProjection: 60 },
    { name: "Top", rosProjection: 80 }
  ], { leagueFaabBudget: 100 });
  assert.deepEqual(ranked.map((result) => result.playerName), ["Top", "Alpha", "Zulu"]);
});

test("exposes the same dependency-free API in a browser context", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "waiver-engine.js"), "utf8");
  const browser = { window: {} };
  vm.runInNewContext(source, browser);
  assert.equal(typeof browser.window.WaiverEngine.recommend, "function");
  assert.equal(typeof browser.window.WaiverEngine.rank, "function");
  const result = browser.window.WaiverEngine.recommend({ name: "Browser Add", rosProjection: 70 }, { leagueFaabBudget: 100 });
  assert.equal(result.score, 70);
});

test("parses a local waiver CSV without filling missing metrics", () => {
  const parsed = engine.parseCsv([
    "name,position,rostered_percent,snap_share,ros_projection",
    "Available Back,RB,31,72,81",
    "Broken Row,XYZ,10,20,30"
  ].join("\n"));
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.candidates[0].snapShare, 72);
  assert.equal(parsed.candidates[0].opportunity, undefined);
  assert.match(engine.createCsvTemplate(), /injury_replacement_weeks/);
});
