(function (root, factory) {
  "use strict";
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  if (root) root.HISTORICAL_2025_DATA = value;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  const replacementHalfPprPoints = Object.freeze({ QB: 286, RB: 158.5, WR: 162.5, TE: 124.5 });
  const rows = [
    ["chase", "Ja'Marr Chase", "WR", "CIN", 1, 99, 99, 94, 90, 8, 340, 117, "Elite target earner in a concentrated passing offense."],
    ["bijan", "Bijan Robinson", "RB", "ATL", 2, 97, 98, 82, 93, 8, 336, 63, "Three-down profile with elite receiving usage and secure volume."],
    ["jefferson", "Justin Jefferson", "WR", "MIN", 3, 98, 98, 75, 88, 12, 316, 112, "Elite route and target profile with quarterback uncertainty."],
    ["gibbs", "Jahmyr Gibbs", "RB", "DET", 4, 97, 92, 96, 91, 10, 317, 60, "Explosive dual-threat back in an elite scoring environment."],
    ["lamb", "CeeDee Lamb", "WR", "DAL", 5, 97, 98, 87, 86, 12, 317, 118, "Bankable target dominance with high-end quarterback play."],
    ["barkley", "Saquon Barkley", "RB", "PHI", 6, 94, 97, 97, 76, 22, 326, 48, "Elite line and touchdown environment offset an age-volume tax."],
    ["amon-ra", "Amon-Ra St. Brown", "WR", "DET", 7, 96, 98, 96, 93, 7, 291, 117, "High-floor target role attached to a top offense."],
    ["puka", "Puka Nacua", "WR", "LAR", 8, 98, 97, 91, 75, 24, 299, 105, "Dominant per-route production with meaningful availability risk."],
    ["cmc", "Christian McCaffrey", "RB", "SF", 9, 99, 96, 90, 48, 48, 318, 72, "League-winning workload ceiling paired with major injury and age risk."],
    ["jeanty", "Ashton Jeanty", "RB", "LV", 11, 91, 94, 58, 82, 35, 300, 63, "Rare rookie workload projection in a weak offensive environment."],
    ["nico", "Nico Collins", "WR", "HOU", 13, 96, 92, 83, 72, 23, 289, 100, "Elite efficiency and alpha usage with recurring availability concerns."],
    ["achane", "De'Von Achane", "RB", "MIA", 14, 98, 88, 79, 68, 28, 307, 74, "Difference-making efficiency and receiving work, but fragile workload assumptions."],
    ["london", "Drake London", "WR", "ATL", 16, 91, 95, 78, 90, 11, 267, 97, "Ascending target share with improving quarterback conditions."],
    ["aj-brown", "A.J. Brown", "WR", "PHI", 18, 96, 89, 92, 78, 20, 276, 91, "Elite efficiency in a lower-volume passing offense."],
    ["henry", "Derrick Henry", "RB", "BAL", 19, 92, 96, 95, 70, 27, 282, 18, "Massive touchdown environment with age and receiving-floor concerns."],
    ["mcbride", "Trey McBride", "TE", "ARI", 21, 94, 96, 72, 93, 8, 259, 113, "Position-breaking target volume with modest touchdown assumptions."],
    ["taylor", "Jonathan Taylor", "RB", "IND", 22, 93, 96, 76, 73, 22, 289, 33, "Workhorse rushing role with limited receiving and recent injury risk."],
    ["lamar", "Lamar Jackson", "QB", "BAL", 23, 99, 98, 95, 84, 13, 364, 0, "Elite dual-threat quarterback, discounted for one-QB replacement value."]
  ];
  const preseason = rows.map(([id, name, position, team, expertRank, playerSignal, opportunity, teamContext, durability, uncertainty, projectedPprPoints, projectedReceptions, evidence]) => Object.freeze({
    id,
    name,
    position,
    team,
    marketRank: expertRank,
    expertRank,
    playerSignal,
    opportunity,
    teamContext,
    durability,
    uncertainty,
    projectedPprPoints,
    projectedReceptions,
    projectedHalfPprPoints: projectedPprPoints - projectedReceptions * 0.5,
    projectedVor: projectedPprPoints - projectedReceptions * 0.5 - replacementHalfPprPoints[position],
    evidence
  }));
  const outcomes = [
    ["cmc", 365.6, 17], ["bijan", 331.3, 17], ["gibbs", 328.4, 17], ["puka", 310.5, 16], ["achane", 289.3, 16],
    ["henry", 272, 17], ["amon-ra", 265.5, 17], ["mcbride", 252.9, 17], ["chase", 251.1, 16], ["taylor", 339.3, 17],
    ["nico", 190.7, 15], ["jeanty", 217.6, 17], ["barkley", 213.8, 16], ["lamar", 214.9, 13], ["lamb", 163.4, 14],
    ["jefferson", 159.5, 17], ["london", 167.9, 12], ["aj-brown", 181.3, 15]
  ].map(([id, halfPprPoints, actualGames]) => Object.freeze({ id, halfPprPoints, actualGames }));

  return Object.freeze({
    meta: Object.freeze({
      season: 2025,
      scoring: "Half PPR, 4-point passing TD",
      frozenAt: "2025-09-04 (pre-Week 1)",
      cohort: "Public-source first-two-round pilot",
      sourceCutoffs: Object.freeze({ marketRank: "ESPN preseason rank", expertRank: "2025 preseason", projections: "2025-09-04 pre-Week 1" }),
      replacementHalfPprPoints,
      criticCoverage: Object.freeze({ projection: true, signals: true, team: true, uncertainty: true }),
      disclaimer: "The public release uses the independent ESPN preseason order for both baseline rank fields. No private league draft price is included."
    }),
    preseason: Object.freeze(preseason),
    outcomes: Object.freeze(outcomes),
    sources: Object.freeze([
      Object.freeze({ name: "ESPN 2025 preseason Top 200", use: "Independent expert baseline", url: "https://www.espn.com/fantasy/football/story/_/id/45042111/fantasy-football-rankings-2025-ppr" }),
      Object.freeze({ name: "Mike Clay 2025 projection guide", use: "PPR projection converted to half PPR", url: "https://g.espncdn.com/s/ffldraftkit/25/NFLDK2025_CS_ClayProjections2025.pdf" }),
      Object.freeze({ name: "FantasyData 2025 half-PPR leaders", use: "Post-lock evaluation only", url: "https://fantasydata.com/nfl/leaders/player/fantasy-points-half-ppr" })
    ])
  });
});
