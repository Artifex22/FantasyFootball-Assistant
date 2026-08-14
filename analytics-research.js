(function (root, factory) {
  "use strict";
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  if (root) root.FANTASY_ANALYTICS_RESEARCH = value;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  return Object.freeze({
    version: 1,
    researchedAt: "2026-08-14",
    summary: "Opportunity quality and calibrated uncertainty remain the best paths to improvement. The five-season sandbox did not justify promoting a new mean-rank formula.",
    critics: Object.freeze([
      Object.freeze({ name: "Opportunity Quality Specialist", role: "Separates valuable targets, routes, goal-line work and designed quarterback runs from raw touches.", verdict: "Promote richer usage inputs when they are frozen and position-specific." }),
      Object.freeze({ name: "Signal Stability Auditor", role: "Challenges touchdowns, catchable-target rate and one-year efficiency that tend to regress.", verdict: "Use unstable efficiency for regression flags, not as a dominant positive signal." }),
      Object.freeze({ name: "Ecosystem and Market Analyst", role: "Reviews PROE, pace, line play, team scoring expectations and market-implied totals.", verdict: "Keep ecosystem data contextual and avoid counting the same team expectation twice." }),
      Object.freeze({ name: "Signal Governance Auditor", role: "Checks leakage, coverage, redundancy and held-out improvement before a metric can affect live ranks.", verdict: "Vetoed schedule-heavy and availability-penalty models in this pass." }),
      Object.freeze({ name: "Rookie Translation Specialist", role: "Evaluates NFL draft capital, age, early declaration and college production with position-specific priors.", verdict: "Sandbox only until a frozen multi-year rookie cohort is available." })
    ]),
    metrics: Object.freeze([
      Object.freeze({ metric: "Expected / weighted opportunity", decision: "Priority", use: "Core opportunity input", evidence: "Carries and targets weighted by scoring value, field position, depth and down-distance.", guardrail: "Do not substitute raw touches." }),
      Object.freeze({ metric: "Routes + target earning", decision: "Conditional", use: "WR/TE role and talent split", evidence: "Route participation, targets per route and coverage success provide different information.", guardrail: "Require stable sample and alignment context." }),
      Object.freeze({ metric: "QB designed rush + scramble share", decision: "Priority", use: "4-point passing-TD format adjustment", evidence: "Rushing volume creates replacement value not captured by passing efficiency alone.", guardrail: "Separate designed runs from kneels and scrambles." }),
      Object.freeze({ metric: "Projected team scoring / implied total", decision: "Sandbox", use: "Touchdown environment", evidence: "NFL totals markets are strong median forecasts.", guardrail: "Freeze before draft and avoid duplicating projection inputs." }),
      Object.freeze({ metric: "PROE and neutral pace", decision: "Context", use: "Team volume allocation", evidence: "Game-state-adjusted pass tendency is cleaner than raw pass rate.", guardrail: "Regress coaching changes and small samples." }),
      Object.freeze({ metric: "Preseason positional schedule", decision: "Downgrade", use: "Tiebreaker and weekly planning", evidence: "Prior-year points allowed changes substantially year to year.", guardrail: "Live model weight reduced from 8% to 3%." }),
      Object.freeze({ metric: "Age and injury history", decision: "Uncertainty", use: "Availability range", evidence: "Useful for range width and projected games, but blunt mean penalties did not improve the sandbox.", guardrail: "Do not double-penalize projections already accounting for missed games." }),
      Object.freeze({ metric: "Rookie translation profile", decision: "Sandbox", use: "Separate rookie prior", evidence: "Draft capital, draft age, early declaration and college share are plausible inputs.", guardrail: "No live influence without out-of-sample rookie validation." }),
      Object.freeze({ metric: "Offensive-line grades", decision: "Context", use: "Pressure and run-lane environment", evidence: "Tracking-based win rates isolate blocking better than team sacks or rushing yards.", guardrail: "Do not treat line rank as player talent." }),
      Object.freeze({ metric: "Touchdown / efficiency overperformance", decision: "Regression", use: "Risk and upside flag", evidence: "Expected fantasy points is more stable than realized scoring for most RB/WR roles.", guardrail: "Retain demonstrated player skill with partial regression, not full erasure." })
    ]),
    experiments: Object.freeze([
      Object.freeze({ name: "Consensus baseline", playerSeasons: 210, positionMae: 4.886, status: "Baseline", finding: "Equal expert/market consensus remained difficult to beat." }),
      Object.freeze({ name: "35% projection blend", playerSeasons: 210, positionMae: 4.857, status: "Hold", finding: "Only 0.6% lower MAE; improved two seasons, hurt two, tied one." }),
      Object.freeze({ name: "Availability mean penalty", playerSeasons: 210, positionMae: 4.895, status: "Reject", finding: "Slightly worse than consensus; availability stays in uncertainty ranges." }),
      Object.freeze({ name: "Disagreement mean penalty", playerSeasons: 210, positionMae: 4.886, status: "Reject", finding: "No improvement; analyst disagreement remains an interval-width signal." })
    ]),
    sources: Object.freeze([
      Object.freeze({ source: "PFF", artifact: "Actual Opportunity methodology", date: "Reviewed 2026-08-14", url: "https://www.pff.com/news/fantasy-football-actual-opportunity-an-introduction-for-2018" }),
      Object.freeze({ source: "PFF", artifact: "Weighted opportunity study", date: "Reviewed 2026-08-14", url: "https://www.pff.com/news/fantasy-football-weighted-opportunity-a-better-fantasy-football-predictor-than-raw-touches" }),
      Object.freeze({ source: "Reception Perception", artifact: "Coverage success and alignment study", date: "Reviewed 2026-08-14", url: "https://receptionperception.com/wp-content/uploads/2022/07/RPsummary_Success_Alignment_Outcomes_Final.pdf" }),
      Object.freeze({ source: "ESPN Analytics", artifact: "Receiver Tracking Metrics methodology", date: "Reviewed 2026-08-14", url: "https://www.espn.com/nfl/story/_/id/34649390/espn-receiver-tracking-metrics-how-new-nfl-stats-work-open-catch-yac-scores" }),
      Object.freeze({ source: "nflfastR", artifact: "Expected pass rate / PROE reference", date: "Reviewed 2026-08-14", url: "https://nflfastr.com/reference/add_xpass.html" }),
      Object.freeze({ source: "ESPN", artifact: "Preseason positional SoS validation", date: "Reviewed 2026-08-14", url: "https://www.espn.com/fantasy/football/story/_/id/11348957/fantasy-football-positional-strength-schedule-projections-little-merit" }),
      Object.freeze({ source: "PLOS One", artifact: "NFL betting-market forecast calibration", date: "Reviewed 2026-08-14", url: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0287601" }),
      Object.freeze({ source: "PlayerProfiler", artifact: "Breakout Finder rookie model inputs", date: "Reviewed 2026-08-14", url: "https://www.playerprofiler.com/article/2022-breakout-finder-guide/" }),
      Object.freeze({ source: "ESPN Analytics", artifact: "Pass- and run-block win-rate methodology", date: "Reviewed 2026-08-14", url: "https://www.espn.com/nfl/story/_/id/29813062/introducing-new-nfl-run-blocking-run-stopping-stats-how-run-block-win-rate-run-stop-win-rate-work" }),
      Object.freeze({ source: "FantasyPros", artifact: "Draft Accuracy Gap methodology", date: "Reviewed 2026-08-14", url: "https://www.fantasypros.com/about/faq/football-draft-accuracy-methodology/" })
    ])
  });
});
