"use strict";

const fs = require("node:fs");
const path = require("node:path");

const COMMON_ROOT_FILES = [
  ".nojekyll",
  ".gitattributes",
  "AGENTS.md",
  "METHODOLOGY.md",
  "README.md",
  "RASPBERRY_PI_HOSTING.md",
  "SECURITY.md",
  "SELF_HOSTING.md",
  "SESSION_HANDOFF.md",
  "SOURCES.md",
  "analytics-research.js",
  "app.js",
  "auth-complete.html",
  "auth-complete.js",
  "comparison-data.js",
  "context-data.js",
  "context-engine.js",
  "data.js",
  "draft-brain.js",
  "draft-room.code-workspace",
  "espn-data.js",
  "historical-backtest.js",
  "historical-public-data.js",
  "historical-roundtable.js",
  "index.html",
  "league-profile.js",
  "local-profile-bootstrap.js",
  "model.js",
  "package.json",
  "ranking-comparison.js",
  "research-lab.js",
  "server.js",
  "snapshot-registry.js",
  "strategy-engine.js",
  "styles.css",
  "team-engine.js",
  "wait-calibration.js",
  "waiver-engine.js"
];

const PLATFORM_ROOT_FILES = {
  windows: ["connect-chatgpt.cmd", "install.cmd", "setup-local.cmd", "start-draft-room.cmd"],
  "linux-arm64": ["connect-chatgpt.sh", "setup-local.sh", "setup-pi.sh", "start-draft-room.sh"]
};

const DIRECTORY_FILES = {
  ".vscode": ["launch.json", "tasks.json"],
  data: ["league-profile-template.json", "metric-import-template.csv"],
  "deploy/raspberry-pi": ["draft-room.env.example", "draft-room.service"],
  scripts: ["package-release.js", "release-manifest.js"],
  server: ["analysis-service.js", "api-router.js", "league-service.js", "local-store.js", "workspace-service.js"],
  "server/connectors": ["common.js", "espn.js", "yahoo.js"],
  tests: [
    "analysis-service.test.js", "connectors.test.js", "context-engine.test.js", "data.test.js",
    "draft-brain.test.js", "historical-backtest.test.js", "historical-roundtable.test.js",
    "history-data.test.js", "league-service.test.js", "manager-identities.test.js", "model.test.js",
    "ranking-comparison.test.js", "server.test.js",
    "strategy-engine.test.js", "team-engine.test.js", "wait-calibration.test.js", "waiver-engine.test.js",
    "workspace-service.test.js"
  ]
};

const PLATFORM_DIRECTORY_FILES = {
  windows: { scripts: ["install-local.js"] },
  "linux-arm64": { scripts: ["install-pi.js"] }
};

const PORTABLE_DIRECTORY_FILES = {
  tests: ["package-release.test.js"]
};

const PRIVATE_PATTERNS = [
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)\.local-data(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)exports(\/|$)/i,
  /(^|\/)dist(\/|$)/i,
  /(^|\/)local-league-profile\.json$/i,
  /(^|\/)manager-identities\.js$/i,
  /(^|\/)history-20\d{2}\.js$/i,
  /(^|\/)history-rosters-.*\.js$/i,
  /(^|\/)history-data\.js$/i,
  /(^|\/)historical-(2025-data|multi-season-data|cohort-expansion)\.js$/i,
  /(^|\/)manager-alias-map-template\.csv$/i,
  /\.(har|pem|key|p12|log)$/i,
  /(^|\/)\.env(?:\.|$)/i,
  /auth\.json$/i
];

function normalizeRelative(file) {
  return String(file || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isPrivatePath(file) {
  const normalized = normalizeRelative(file);
  return PRIVATE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function releaseFiles(root, options = {}) {
  const platform = String(options.platform || "portable").toLowerCase();
  if (!["portable", ...Object.keys(PLATFORM_ROOT_FILES)].includes(platform)) throw new Error(`Unsupported release platform: ${platform}`);
  const platformFiles = platform === "portable"
    ? Object.values(PLATFORM_ROOT_FILES).flat()
    : PLATFORM_ROOT_FILES[platform];
  const files = [...COMMON_ROOT_FILES, ...platformFiles];
  Object.entries(DIRECTORY_FILES).forEach(([directory, names]) => names.forEach((name) => files.push(`${directory}/${name}`)));
  const platformDirectories = platform === "portable"
    ? Object.values(PLATFORM_DIRECTORY_FILES)
    : [PLATFORM_DIRECTORY_FILES[platform]];
  platformDirectories.forEach((directories) => Object.entries(directories).forEach(([directory, names]) => names.forEach((name) => files.push(`${directory}/${name}`))));
  if (platform === "portable") Object.entries(PORTABLE_DIRECTORY_FILES).forEach(([directory, names]) => names.forEach((name) => files.push(`${directory}/${name}`)));
  const unique = [...new Set(files.map(normalizeRelative))].sort();
  unique.forEach((file) => {
    if (isPrivatePath(file)) throw new Error(`Private path cannot enter the release: ${file}`);
    const absolute = path.join(root, ...file.split("/"));
    if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) throw new Error(`Release file is missing: ${file}`);
  });
  return unique;
}

module.exports = { COMMON_ROOT_FILES, PLATFORM_ROOT_FILES, PLATFORM_DIRECTORY_FILES, PORTABLE_DIRECTORY_FILES, PRIVATE_PATTERNS, isPrivatePath, releaseFiles };
