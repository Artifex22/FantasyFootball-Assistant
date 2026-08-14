(function (root, factory) {
  "use strict";
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  if (root) root.SNAPSHOT_REGISTRY = value;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  return Object.freeze({
    active: "2026-08-14T20:00:00-05:00",
    snapshots: Object.freeze([
      Object.freeze({
        id: "2026-08-14T20:00:00-05:00",
        label: "Current rankings and news snapshot",
        asOf: "2026-08-14",
        immutable: true,
        files: Object.freeze(["espn-data.js", "data.js", "comparison-data.js"]),
        contents: Object.freeze({ rankings: "ESPN August 13 complete Top 300 plus FantasyPros August 14 half-PPR top 24", context: "Existing projection and team records retained where no newer verified source was available", comparisons: "Current ESPN baseline and dated consensus layers" })
      }),
      Object.freeze({
        id: "2026-08-14T18:00:00-05:00",
        label: "Analytics governance and sandbox snapshot",
        asOf: "2026-08-14",
        immutable: true,
        scoring: "12 teams · half PPR · 4-point passing TD",
        files: Object.freeze(["analytics-research.js", "research-lab.js", "model.js", "data.js"]),
        contents: Object.freeze({ rankings: "No unvalidated rank formula promoted", context: "Schedule reduced to tiebreaker weight", comparisons: "210-player-season position-rank sandbox" }),
        note: "Read-only research pass. No remote code, package, dataset, or executable content was downloaded or run."
      }),
      Object.freeze({
        id: "2026-08-10T18:00:00-05:00",
        label: "Current rankings and manager-brain snapshot",
        asOf: "2026-08-10",
        immutable: true,
        scoring: "12 teams · half PPR · 4-point passing TD",
        files: Object.freeze(["data.js", "context-data.js", "espn-data.js", "comparison-data.js"]),
        contents: Object.freeze({ rankings: "FantasyPros top 24, verified movers, and ESPN August 9 baseline", context: "Matched projection and team records", comparisons: "Market, ESPN, Harmon, and Fitzmaurice snapshots" }),
        note: "Only independently verified movements are updated; inaccessible or incomplete public feeds remain explicitly partial."
      }),
      Object.freeze({
        id: "2026-08-06T21:00:00-05:00",
        label: "Post-preseason-research model snapshot",
        asOf: "2026-08-06",
        immutable: true,
        scoring: "12 teams · half PPR · 4-point passing TD",
        files: Object.freeze(["data.js", "context-data.js", "espn-data.js", "comparison-data.js"]),
        contents: Object.freeze({ rankings: "ESPN Top 300 player pool", context: "Matched local projection and team records", comparisons: "Market, ESPN, and analyst snapshots" }),
        note: "Local, inert JavaScript data records. No remote code, package, or executable content is included."
      }),
      Object.freeze({
        id: "2026-08-05T23:00:00-05:00",
        label: "Initial model snapshot",
        asOf: "2026-08-05",
        immutable: true,
        scoring: "12 teams · half PPR · 4-point passing TD",
        files: Object.freeze(["data.js", "espn-data.js"]),
        contents: Object.freeze({ rankings: "Initial ESPN player pool", context: "Not yet enriched", comparisons: "Initial market baseline" }),
        note: "Retained as a provenance checkpoint; it is not used as the active ranking model."
      })
    ])
  });
});
