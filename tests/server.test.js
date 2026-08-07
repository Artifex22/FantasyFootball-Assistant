"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createDraftRoomServer, isAllowedHost } = require("../server.js");

async function withServer(callback) {
  const server = createDraftRoomServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("allows only local hostnames", () => {
  assert.equal(isAllowedHost("127.0.0.1:4173"), true);
  assert.equal(isAllowedHost("localhost"), true);
  assert.equal(isAllowedHost("example.com"), false);
  assert.equal(isAllowedHost("localhost.example.com"), false);
});

test("serves the app with restrictive security headers", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-security-policy"), /connect-src 'none'/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(await response.text(), /Draft Room/);
  });
});

test("rejects unsupported methods and file extensions", async () => {
  await withServer(async (origin) => {
    const post = await fetch(`${origin}/`, { method: "POST" });
    assert.equal(post.status, 405);
    const executable = await fetch(`${origin}/server.exe`);
    assert.equal(executable.status, 404);
  });
});

test("does not expose files outside the project root", async () => {
  await withServer(async (origin) => {
    const response = await fetch(`${origin}/..%2F..%2FWindows%2Fwin.ini`);
    assert.equal(response.status, 403);
  });
});
