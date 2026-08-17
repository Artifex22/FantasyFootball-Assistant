"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildRelease } = require("../scripts/package-release.js");
const { install } = require("../scripts/install-local.js");
const { install: installPi } = require("../scripts/install-pi.js");
const { isPrivatePath, releaseFiles } = require("../scripts/release-manifest.js");

const root = path.resolve(__dirname, "..");

test("release allowlist includes platform setup and excludes private paths", () => {
  const files = releaseFiles(root, { platform: "portable" });
  ["install.cmd", "setup-pi.sh", "start-draft-room.sh", "RASPBERRY_PI_HOSTING.md", "deploy/raspberry-pi/draft-room.service", "connect-chatgpt.cmd", "connect-chatgpt.sh", "SESSION_HANDOFF.md", "server.js", "server/connectors/espn.js"].forEach((file) => assert.ok(files.includes(file), file));
  files.forEach((file) => assert.equal(isPrivatePath(file), false, file));
  [".local-data/connectors.json", "local-league-profile.json", "history-2025.js", "account.har", ".codex/auth.json"].forEach((file) => assert.equal(isPrivatePath(file), true, file));
});

test("Linux release contains shell tooling and excludes Windows launchers", () => {
  const files = releaseFiles(root, { platform: "linux-arm64" });
  ["setup-local.sh", "setup-pi.sh", "start-draft-room.sh", "connect-chatgpt.sh", "scripts/install-pi.js"].forEach((file) => assert.ok(files.includes(file), file));
  assert.equal(files.some((file) => file.endsWith(".cmd")), false);
  assert.equal(files.includes("scripts/install-local.js"), false);
});

test("Windows release excludes Linux-only launchers", () => {
  const files = releaseFiles(root, { platform: "windows" });
  ["install.cmd", "setup-local.cmd", "start-draft-room.cmd", "connect-chatgpt.cmd", "scripts/install-local.js"].forEach((file) => assert.ok(files.includes(file), file));
  assert.equal(files.some((file) => file.endsWith(".sh")), false);
  assert.equal(files.includes("scripts/install-pi.js"), false);
});

test("every relative module required by a shipped test is included", () => {
  const files = releaseFiles(root);
  const included = new Set(files);
  files.filter((file) => file.startsWith("tests/") && file.endsWith(".test.js")).forEach((file) => {
    const source = fs.readFileSync(path.join(root, ...file.split("/")), "utf8");
    for (const match of source.matchAll(/require\(["']\.\.\/([^"']+)["']\)/g)) {
      assert.ok(included.has(match[1]), `${file} requires omitted release file ${match[1]}`);
    }
  });
});

test("release builder creates a Linux zip and checksum without private entries", () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "draft-room-release-"));
  const result = buildRelease({ outputDirectory: output, platform: "linux-arm64" });
  assert.ok(fs.statSync(result.archivePath).size > 100_000);
  assert.match(path.basename(result.archivePath), /-linux-arm64\.zip$/);
  assert.match(fs.readFileSync(`${result.archivePath}.sha256`, "utf8"), new RegExp(`^${result.digest}`));
  assert.ok(result.entries.some((entry) => entry.endsWith("/setup-pi.sh")));
  assert.equal(result.entries.some((entry) => entry.endsWith(".cmd")), false);
  assert.equal(result.entries.some((entry) => isPrivatePath(entry)), false);
});

test("installer preserves private state while copying only allowlisted app files", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "draft-room-install-"));
  const privateDirectory = path.join(target, ".local-data");
  fs.mkdirSync(privateDirectory);
  fs.writeFileSync(path.join(privateDirectory, "sentinel.json"), "private");
  const result = install({ target, launcher: false });
  assert.ok(result.files > 40);
  assert.equal(fs.readFileSync(path.join(privateDirectory, "sentinel.json"), "utf8"), "private");
  assert.ok(fs.existsSync(path.join(target, "server.js")));
  assert.equal(fs.existsSync(path.join(target, "local-league-profile.json")), false);
});

test("Pi installer preserves private state while copying only allowlisted app files", () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "draft-room-pi-install-"));
  const privateDirectory = path.join(target, ".local-data");
  fs.mkdirSync(privateDirectory);
  fs.writeFileSync(path.join(privateDirectory, "sentinel.json"), "private");
  const result = installPi({ target });
  assert.ok(result.files > 40);
  assert.equal(fs.readFileSync(path.join(privateDirectory, "sentinel.json"), "utf8"), "private");
  assert.ok(fs.existsSync(path.join(target, "deploy", "raspberry-pi", "draft-room.service")));
  assert.ok(fs.existsSync(path.join(target, "start-draft-room.sh")));
  assert.equal(fs.existsSync(path.join(target, "install.cmd")), false);
  assert.equal(fs.existsSync(path.join(target, "local-league-profile.json")), false);
});
