(function (root, factory) {
  "use strict";
  const value = factory();
  if (typeof module === "object" && module.exports) module.exports = value;
  if (root) root.SNAPSHOT_REGISTRY = value;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  return Object.freeze({
    active: "2026-08-06T21:00:00-05:00",
    snapshots: Object.freeze([
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
