"use strict";

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const childProcess = require("node:child_process");
const LeagueProfile = require("./league-profile.js");
const { createBrain } = require("./draft-brain.js");
const { createLocalStore } = require("./server/local-store.js");
const { createYahooConnector } = require("./server/connectors/yahoo.js");
const { createEspnConnector } = require("./server/connectors/espn.js");
const { createLeagueService } = require("./server/league-service.js");
const { createWorkspaceService } = require("./server/workspace-service.js");
const { createAnalysisService } = require("./server/analysis-service.js");
const { createApiRouter } = require("./server/api-router.js");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const bindHost = process.env.HOST || "127.0.0.1";
const publicOrigin = process.env.PUBLIC_ORIGIN || `http://127.0.0.1:${port}`;
const localProfilePath = path.join(root, "local-league-profile.json");
const localBootstrapPath = "/local-profile-bootstrap.js";
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"]
]);

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Cache-Control": "no-store"
};

function respond(response, status, body, type = "text/plain; charset=utf-8") {
  response.writeHead(status, { ...securityHeaders, "Content-Type": type });
  response.end(body);
}

function isAllowedHost(host) {
  const hostname = String(host || "").toLowerCase().replace(/:\d{1,5}$/, "").replace(/^\[|\]$/g, "");
  const configured = String(process.env.ALLOWED_HOSTS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return ["127.0.0.1", "localhost", "::1", ...configured].includes(hostname);
}

function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  return origin === `http://${request.headers.host}`;
}

function isPrivateLocalPath(pathname) {
  const normalized = `/${String(pathname || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
  if (["/.local-data/", "/.git/", "/.vscode/", "/server/", "/tests/"].some((prefix) => normalized.toLowerCase().startsWith(prefix))) return true;
  const filename = path.posix.basename(pathname);
  return filename === "local-league-profile.json"
    || filename === "manager-identities.js"
    || /^history-20\d{2}\.js$/.test(filename)
    || /^history-rosters-20\d{2}\.js$/.test(filename)
    || filename === "history-data.js"
    || /^historical-(2025-data|multi-season-data|cohort-expansion)\.js$/.test(filename)
    || filename === "manager-alias-map-template.csv";
}

function serializeForBootstrap(value) {
  return JSON.stringify(value ?? null).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

function localProfileBootstrap(profile, snapshot = null, workspace = null) {
  return `"use strict";\nwindow.LOCAL_LEAGUE_PROFILE = ${serializeForBootstrap(profile)};\nwindow.LOCAL_LEAGUE_SNAPSHOT = ${serializeForBootstrap(snapshot)};\nwindow.LOCAL_WORKSPACE = ${serializeForBootstrap(workspace)};\n`;
}

function serveLocalProfileBootstrap(request, response) {
  fs.readFile(localProfilePath, "utf8", (error, contents) => {
    let localProfile = null;
    if (!error) {
      try {
        localProfile = JSON.parse(contents);
      } catch (parseError) {
        console.error(`Local league profile is invalid JSON: ${parseError.message}`);
      }
    }
    const activeWorkspace = localRuntime().workspaceService.active();
    const activeProfile = activeWorkspace?.profile || localProfile;
    const activeSnapshot = activeWorkspace?.leagueSnapshot || null;
    const safeSnapshot = activeSnapshot ? {
      provider: activeSnapshot.provider,
      id: activeSnapshot.id,
      name: activeSnapshot.name,
      season: activeSnapshot.season,
      syncedAt: activeSnapshot.syncedAt,
      profile: activeProfile,
      waiverCandidates: Array.isArray(activeSnapshot.waiverCandidates) ? activeSnapshot.waiverCandidates.slice(0, 500) : [],
      teamContext: activeSnapshot.teamContext && typeof activeSnapshot.teamContext === "object" ? activeSnapshot.teamContext : null
    } : null;
    const safeWorkspace = activeWorkspace ? {
      id: activeWorkspace.id,
      name: activeWorkspace.name,
      updatedAt: activeWorkspace.updatedAt,
      syncedAt: activeWorkspace.syncedAt,
      appState: activeWorkspace.appState || null,
      rankingAnalysis: activeWorkspace.rankingAnalysis || null
    } : null;
    const body = localProfileBootstrap(activeProfile, safeSnapshot, safeWorkspace);
    response.writeHead(200, { ...securityHeaders, "Content-Type": contentTypes.get(".js"), "Content-Length": Buffer.byteLength(body) });
    response.end(request.method === "HEAD" ? undefined : body);
  });
}

function readJsonBody(request, response, callback) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) {
    respond(response, 415, "Content-Type must be application/json.");
    return;
  }
  let body = "";
  let tooLarge = false;
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    body += chunk;
    if (Buffer.byteLength(body) > 5 * 1024 * 1024) {
      tooLarge = true;
      request.destroy();
    }
  });
  request.on("end", () => {
    if (tooLarge) return;
    try {
      callback(JSON.parse(body || "{}"));
    } catch (error) {
      respond(response, 400, "Invalid JSON body.");
    }
  });
  request.on("error", () => {
    if (tooLarge && !response.headersSent) respond(response, 413, "Request body is too large.");
  });
}

function analyzeLeague(request, response) {
  readJsonBody(request, response, (body) => {
    const profile = LeagueProfile.normalizeProfile({ ...(body.profile || body), imported: true });
    const brain = createBrain(LeagueProfile.toDraftHistory(profile));
    const availablePlayers = (Array.isArray(body.availablePlayers) ? body.availablePlayers : []).slice(0, 1000).map((player, index) => ({
      id: String(player.id || `player-${index + 1}`).slice(0, 100),
      name: String(player.name || "Unknown player").slice(0, 100),
      team: String(player.team || "FA").slice(0, 10),
      position: String(player.position || "").toUpperCase(),
      rank: Math.max(1, Number(player.rank) || index + 1)
    })).filter((player) => ["QB", "RB", "WR", "TE", "K", "DST"].includes(player.position));
    const draftOrder = profile.managerGroups.slice(0, profile.league.teams).map((manager) => manager.id);
    const rounds = Math.min(profile.league.rounds, Math.max(1, Number(body.rounds) || profile.league.rounds));
    const managers = profile.managerGroups.map((manager) => ({
      id: manager.id,
      name: manager.name,
      personality: brain.personalityFor(manager.id),
      profile: brain.profileFor(manager.id),
      rounds: Array.from({ length: rounds }, (_, index) => brain.predictPick(manager.id, index + 1, [], {
        availablePlayers,
        draftOrder,
        currentOverall: brain.overallForManagerRound(manager.id, index + 1, profile.league.teams, draftOrder),
        limit: 3
      }))
    }));
    respond(response, 200, JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      model: "deterministic-local-v1",
      league: profile.league,
      history: { seasons: profile.seasons.length, picks: brain.picks.length },
      managers
    }), "application/json; charset=utf-8");
  });
}

function createRuntime() {
  const store = createLocalStore(root);
  let contextProfile = null;
  try { contextProfile = JSON.parse(fs.readFileSync(localProfilePath, "utf8")); } catch (error) { /* A public blank install has no private profile. */ }
  const connectors = {
    yahoo: createYahooConnector(store, { origin: publicOrigin }),
    espn: createEspnConnector(store, { projectRoot: root })
  };
  const leagueService = createLeagueService(store, connectors);
  const workspaceService = createWorkspaceService(store, { contextProfile });
  const analysisService = createAnalysisService(store, workspaceService, { projectRoot: root });
  const apiRouter = createApiRouter({ connectors, leagueService, workspaceService, analysisService, respond, securityHeaders });
  return { store, connectors, leagueService, workspaceService, analysisService, apiRouter };
}

let runtime;
function localRuntime() {
  if (!runtime) runtime = createRuntime();
  return runtime;
}

function createDraftRoomServer() {
  return http.createServer(async (request, response) => {
  if (!isAllowedHost(request.headers.host)) {
    respond(response, 403, "Forbidden host.");
    return;
  }
  let pathname;
  let requestUrl;
  try {
    requestUrl = new URL(request.url, `http://${request.headers.host}`);
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch (error) {
    respond(response, 400, "Invalid request path.");
    return;
  }
  if (request.method === "POST" && pathname === "/api/league/analyze") {
    analyzeLeague(request, response);
    return;
  }
  if (pathname.startsWith("/api/") && request.method !== "GET" && request.method !== "HEAD" && !isAllowedOrigin(request)) {
    respond(response, 403, "Forbidden origin.");
    return;
  }
  if (pathname.startsWith("/api/") && await localRuntime().apiRouter(request, response, pathname, requestUrl)) return;
  if (request.method !== "GET" && request.method !== "HEAD") {
    respond(response, 405, "Method not allowed.");
    return;
  }
  if (pathname === "/") pathname = "/index.html";
  if (pathname === localBootstrapPath) {
    serveLocalProfileBootstrap(request, response);
    return;
  }
  if (isPrivateLocalPath(pathname)) {
    respond(response, 404, "Not found.");
    return;
  }
  const target = path.resolve(root, `.${pathname}`);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    respond(response, 403, "Forbidden path.");
    return;
  }
  const extension = path.extname(target).toLowerCase();
  if (!contentTypes.has(extension)) {
    respond(response, 404, "Not found.");
    return;
  }

  fs.stat(target, (statError, stats) => {
    if (statError || !stats.isFile()) {
      respond(response, 404, "Not found.");
      return;
    }
    response.writeHead(200, { ...securityHeaders, "Content-Type": contentTypes.get(extension), "Content-Length": stats.size });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(target).pipe(response);
  });
  });
}

const server = createDraftRoomServer();

server.on("error", (error) => {
  console.error(`Draft Room failed to start: ${error.message}`);
  process.exitCode = 1;
});

if (require.main === module) {
  server.listen(port, bindHost, () => {
    console.log(`Draft Room is running at ${publicOrigin}`);
    console.log("Press Ctrl+C to stop.");
    if (process.env.DRAFT_ROOM_OPEN_BROWSER === "1" && process.platform === "win32") {
      childProcess.execFile("cmd.exe", ["/c", "start", "", publicOrigin], { windowsHide: true }, () => {});
    }
  });
}

module.exports = { createDraftRoomServer, isAllowedHost, isAllowedOrigin, isPrivateLocalPath, localProfileBootstrap, analyzeLeague, localRuntime, securityHeaders };
