"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { releaseFiles } = require("./release-manifest.js");

const sourceRoot = path.resolve(__dirname, "..");

function argumentsFrom(argv) {
  const options = { target: "/opt/fantasy-football-assistant" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--target" && argv[index + 1]) options.target = argv[++index];
  }
  return options;
}

function assertSafeTarget(target) {
  const resolved = path.resolve(String(target || ""));
  if (resolved === path.parse(resolved).root || resolved === sourceRoot || resolved.startsWith(`${sourceRoot}${path.sep}`)) {
    throw new Error("Choose an install folder outside the extracted package and outside the filesystem root.");
  }
  return resolved;
}

function install(options = {}) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) throw new Error(`Node.js 20 or newer is required; found ${process.version}.`);
  const target = assertSafeTarget(options.target || "/opt/fantasy-football-assistant");
  const files = releaseFiles(sourceRoot, { platform: "linux-arm64" });
  fs.mkdirSync(target, { recursive: true });
  files.forEach((file) => {
    const source = path.join(sourceRoot, ...file.split("/"));
    const destination = path.join(target, ...file.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    if (file.endsWith(".sh")) fs.chmodSync(destination, 0o755);
  });
  const releaseManifest = path.join(sourceRoot, "RELEASE-MANIFEST.json");
  if (fs.existsSync(releaseManifest)) fs.copyFileSync(releaseManifest, path.join(target, "RELEASE-MANIFEST.json"));
  fs.mkdirSync(path.join(target, ".local-data"), { recursive: true });
  return { target, files: files.length };
}

if (require.main === module) {
  try {
    const result = install(argumentsFrom(process.argv.slice(2)));
    console.log(`Installed ${result.files} allowlisted application files to ${result.target}.`);
    console.log("Private .local-data was created or preserved.");
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { argumentsFrom, assertSafeTarget, install };
