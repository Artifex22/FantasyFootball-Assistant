"use strict";

const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"]
]);

const securityHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
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
  return /^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(host || "");
}

function createDraftRoomServer() {
  return http.createServer((request, response) => {
  if (!isAllowedHost(request.headers.host)) {
    respond(response, 403, "Forbidden host.");
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    respond(response, 405, "Method not allowed.");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname);
  } catch (error) {
    respond(response, 400, "Invalid request path.");
    return;
  }
  if (pathname === "/") pathname = "/index.html";
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
  server.listen(port, "127.0.0.1", () => {
    console.log(`Draft Room is running at http://127.0.0.1:${port}`);
    console.log("Press Ctrl+C to stop.");
  });
}

module.exports = { createDraftRoomServer, isAllowedHost, securityHeaders };
