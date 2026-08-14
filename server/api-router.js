"use strict";

function createApiRouter(options) {
  const { connectors, leagueService, workspaceService, analysisService, respond, securityHeaders } = options;

  function json(response, status, value) {
    respond(response, status, JSON.stringify(value), "application/json; charset=utf-8");
  }

  function error(response, status, message) {
    json(response, status, { error: String(message || "Request failed.") });
  }

  function readBody(request, response, maximumBytes, callback) {
    let body = "";
    let tooLarge = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body) > maximumBytes) {
        tooLarge = true;
        body = "";
        error(response, 413, "Request body is too large.");
      }
    });
    request.on("end", () => { if (!tooLarge) callback(body); });
    request.on("error", () => { if (!response.headersSent) error(response, 400, "Request body could not be read."); });
  }

  function readJson(request, response, maximumBytes, callback) {
    if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] || "")) {
      error(response, 415, "Content-Type must be application/json.");
      return;
    }
    readBody(request, response, maximumBytes, (body) => {
      try { callback(JSON.parse(body || "{}")); } catch (parseError) { error(response, 400, "Invalid JSON body."); }
    });
  }

  async function run(response, callback) {
    try { await callback(); } catch (requestError) { error(response, 400, requestError.message); }
  }

  function redirect(response, location) {
    response.writeHead(302, { ...securityHeaders, Location: location, "Cache-Control": "no-store" });
    response.end();
  }

  return async function route(request, response, pathname, url) {
    if (!pathname.startsWith("/api/")) return false;

    if (request.method === "GET" && pathname === "/api/system/status") {
      json(response, 200, { mode: "self-hosted", version: 2, providers: ["espn", "yahoo"], workspaces: true, codexAnalysis: true });
      return true;
    }
    if (request.method === "GET" && pathname === "/api/workspaces") {
      json(response, 200, workspaceService.list());
      return true;
    }
    if (request.method === "POST" && pathname === "/api/workspaces") {
      readJson(request, response, 10 * 1024 * 1024, (body) => {
        try { json(response, 201, workspaceService.create(body)); } catch (workspaceError) { error(response, 400, workspaceError.message); }
      });
      return true;
    }
    if (request.method === "GET" && pathname === "/api/analysis/rankings") {
      json(response, 200, analysisService.status());
      return true;
    }
    if (request.method === "POST" && pathname === "/api/analysis/rankings") {
      await run(response, async () => json(response, 202, analysisService.start()));
      return true;
    }
    if (request.method === "GET" && pathname === "/api/connectors/status") {
      json(response, 200, { espn: connectors.espn.status(), yahoo: connectors.yahoo.status() });
      return true;
    }
    if (request.method === "POST" && pathname === "/api/connectors/yahoo/configure") {
      readJson(request, response, 32_000, (body) => json(response, 200, connectors.yahoo.configure(body)));
      return true;
    }
    if (request.method === "GET" && pathname === "/api/connectors/yahoo/start") {
      await run(response, async () => redirect(response, connectors.yahoo.startAuthorization()));
      return true;
    }
    if (request.method === "GET" && pathname === "/api/connectors/yahoo/callback") {
      await run(response, async () => {
        if (url.searchParams.get("error")) throw new Error(`Yahoo denied authorization: ${url.searchParams.get("error")}`);
        await connectors.yahoo.exchangeCode(url.searchParams.get("code"), url.searchParams.get("state"));
        redirect(response, "/auth-complete.html?provider=yahoo&status=connected");
      });
      return true;
    }
    if (request.method === "POST" && pathname === "/api/connectors/yahoo/disconnect") {
      json(response, 200, connectors.yahoo.disconnect());
      return true;
    }
    if (request.method === "POST" && pathname === "/api/connectors/espn/browser/start") {
      await run(response, async () => json(response, 200, connectors.espn.startBrowserLogin()));
      return true;
    }
    if (request.method === "POST" && pathname === "/api/connectors/espn/browser/capture") {
      await run(response, async () => json(response, 200, await connectors.espn.captureBrowserSession()));
      return true;
    }
    if (request.method === "POST" && pathname === "/api/connectors/espn/har") {
      readBody(request, response, 50 * 1024 * 1024, (body) => {
        try { json(response, 200, connectors.espn.importHar(body)); } catch (harError) { error(response, 400, harError.message); }
      });
      return true;
    }
    if (request.method === "POST" && pathname === "/api/connectors/espn/league") {
      readJson(request, response, 32_000, (body) => {
        try { json(response, 200, connectors.espn.addLeague(body)); } catch (leagueError) { error(response, 400, leagueError.message); }
      });
      return true;
    }
    if (request.method === "POST" && pathname === "/api/connectors/espn/disconnect") {
      json(response, 200, connectors.espn.disconnect());
      return true;
    }
    if (request.method === "GET" && pathname === "/api/leagues") {
      await run(response, async () => json(response, 200, await leagueService.discover()));
      return true;
    }

    const workspaceMatch = pathname.match(/^\/api\/workspaces\/([^/]+)(?:\/(activate))?$/);
    if (workspaceMatch) {
      const [, encodedId, action] = workspaceMatch;
      const id = decodeURIComponent(encodedId);
      if (request.method === "GET" && !action) {
        const workspace = workspaceService.get(id);
        if (!workspace) error(response, 404, "League workspace was not found."); else json(response, 200, workspace);
        return true;
      }
      if (request.method === "PUT" && !action) {
        readJson(request, response, 10 * 1024 * 1024, (body) => {
          try { json(response, 200, workspaceService.save(id, body)); } catch (workspaceError) { error(response, 400, workspaceError.message); }
        });
        return true;
      }
      if (request.method === "DELETE" && !action) {
        await run(response, async () => json(response, 200, workspaceService.remove(id)));
        return true;
      }
      if (request.method === "POST" && action === "activate") {
        await run(response, async () => json(response, 200, workspaceService.activate(id)));
        return true;
      }
    }

    const leagueMatch = pathname.match(/^\/api\/leagues\/(espn|yahoo)\/([^/]+)(?:\/(sync|activate))?$/);
    if (leagueMatch) {
      const [, provider, encodedId, action] = leagueMatch;
      const id = decodeURIComponent(encodedId);
      if (request.method === "GET" && !action) {
        const snapshot = leagueService.get(provider, id);
        if (!snapshot) error(response, 404, "League has not been synced yet."); else json(response, 200, snapshot);
        return true;
      }
      if (request.method === "POST" && action === "sync") {
        await run(response, async () => {
          const snapshot = await leagueService.sync(provider, id);
          workspaceService.upsertFromLeagueSnapshot(snapshot, { activate: false });
          json(response, 200, snapshot);
        });
        return true;
      }
      if (request.method === "POST" && action === "activate") {
        await run(response, async () => {
          const snapshot = leagueService.activate(provider, id);
          workspaceService.upsertFromLeagueSnapshot(snapshot, { activate: true });
          json(response, 200, snapshot);
        });
        return true;
      }
    }

    error(response, 404, "Unknown API route.");
    return true;
  };
}

module.exports = { createApiRouter };
