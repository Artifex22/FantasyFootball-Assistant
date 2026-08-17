"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { releaseFiles } = require("./release-manifest.js");

const sourceRoot = path.resolve(__dirname, "..");

function argumentsFrom(argv) {
  const options = { quiet: false, launcher: true, target: null };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (["--quiet", "/quiet"].includes(argument.toLowerCase())) options.quiet = true;
    else if (argument === "--no-launcher") options.launcher = false;
    else if (argument === "--target" && argv[index + 1]) options.target = argv[++index];
    else if (!argument.startsWith("-") && !argument.startsWith("/")) options.target = argument;
  }
  return options;
}

function defaultTarget() {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"), "FantasyFootballAssistant");
}

function assertSafeTarget(target) {
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  if (resolved === root || resolved === sourceRoot || resolved.startsWith(`${sourceRoot}${path.sep}`)) throw new Error("Choose an install folder outside the extracted package and outside the drive root.");
  return resolved;
}

function writeLauncher(file, target, command) {
  const contents = `@echo off\r\ncall "${path.join(target, command)}"\r\n`;
  fs.writeFileSync(file, contents, "utf8");
}

function launcherDirectories() {
  const candidates = [
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, "Desktop"),
    process.env.OneDrive && path.join(process.env.OneDrive, "Desktop"),
    process.env.OneDriveConsumer && path.join(process.env.OneDriveConsumer, "Desktop"),
    process.env.APPDATA && path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs")
  ].filter(Boolean);
  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))].filter((candidate) => fs.statSync(candidate, { throwIfNoEntry: false })?.isDirectory());
}

function install(options = {}) {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 20) throw new Error(`Node.js 20 or newer is required; found ${process.version}.`);
  const target = assertSafeTarget(options.target || defaultTarget());
  const files = releaseFiles(sourceRoot, { platform: "windows" });
  fs.mkdirSync(target, { recursive: true });
  files.forEach((file) => {
    const source = path.join(sourceRoot, ...file.split("/"));
    const destination = path.join(target, ...file.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  });
  const releaseManifest = path.join(sourceRoot, "RELEASE-MANIFEST.json");
  if (fs.existsSync(releaseManifest)) fs.copyFileSync(releaseManifest, path.join(target, "RELEASE-MANIFEST.json"));
  fs.mkdirSync(path.join(target, ".local-data"), { recursive: true });

  const launchers = [];
  if (options.launcher !== false) {
    launcherDirectories().forEach((directory) => {
      const appLauncher = path.join(directory, "Fantasy Football Assistant.cmd");
      const loginLauncher = path.join(directory, "Connect Fantasy Assistant to ChatGPT.cmd");
      writeLauncher(appLauncher, target, "start-draft-room.cmd");
      writeLauncher(loginLauncher, target, "connect-chatgpt.cmd");
      launchers.push(appLauncher, loginLauncher);
    });
  }
  return { target, files: files.length, launchers };
}

if (require.main === module) {
  try {
    const result = install(argumentsFrom(process.argv.slice(2)));
    console.log(`Installed Fantasy Football Assistant to ${result.target}`);
    console.log(`Copied ${result.files} allowlisted application files.`);
    console.log("Private .local-data was created or preserved; no credentials or league data were imported.");
    if (result.launchers.length) console.log(`Desktop launchers: ${result.launchers.join(", ")}`);
    console.log("Export a full league profile on the old laptop, then import it under Data & sources on this installation.");
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { argumentsFrom, assertSafeTarget, defaultTarget, install, launcherDirectories };
