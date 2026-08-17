"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { releaseFiles } = require("./release-manifest.js");

const projectRoot = path.resolve(__dirname, "..");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const safe = date.getFullYear() < 1980 ? new Date(1980, 0, 1) : date;
  return {
    date: ((safe.getFullYear() - 1980) << 9) | ((safe.getMonth() + 1) << 5) | safe.getDate(),
    time: (safe.getHours() << 11) | (safe.getMinutes() << 5) | Math.floor(safe.getSeconds() / 2)
  };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach((entry) => {
    const name = Buffer.from(entry.name.replace(/\\/g, "/"), "utf8");
    const contents = Buffer.isBuffer(entry.contents) ? entry.contents : Buffer.from(entry.contents);
    const compressed = zlib.deflateRawSync(contents, { level: 9 });
    const checksum = crc32(contents);
    const stamp = dosDateTime(entry.mtime || new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(contents.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(contents.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((entry.mode || 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  });
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function argumentsFrom(argv) {
  const options = { platform: "portable" };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--platform" && argv[index + 1]) options.platform = argv[++index];
    else if (argv[index] === "--output" && argv[index + 1]) options.outputDirectory = argv[++index];
  }
  return options;
}

function buildRelease(options = {}) {
  const outputDirectory = path.resolve(options.outputDirectory || path.join(projectRoot, "dist"));
  const platform = String(options.platform || "portable").toLowerCase();
  const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  const version = String(packageJson.version || "0.0.0").replace(/[^0-9A-Za-z.-]/g, "-");
  const folderName = `FantasyFootball-Assistant-${version}`;
  const files = releaseFiles(projectRoot, { platform });
  const generatedAt = new Date().toISOString();
  const manifest = {
    name: packageJson.name,
    version,
    platform,
    generatedAt,
    privacy: "Allowlisted public application files only. Local workspaces, credentials, cookies, HAR files, logs, and auth stores are excluded.",
    files
  };
  const entries = files.map((file) => {
    const absolute = path.join(projectRoot, ...file.split("/"));
    return { name: `${folderName}/${file}`, contents: fs.readFileSync(absolute), mtime: fs.statSync(absolute).mtime, mode: file.endsWith(".sh") ? 0o100755 : 0o100644 };
  });
  entries.push({ name: `${folderName}/RELEASE-MANIFEST.json`, contents: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`), mtime: new Date(generatedAt) });
  const archive = createZip(entries);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const archivePath = path.join(outputDirectory, `${folderName}-${platform}.zip`);
  fs.writeFileSync(archivePath, archive, { mode: 0o600 });
  const digest = crypto.createHash("sha256").update(archive).digest("hex");
  fs.writeFileSync(`${archivePath}.sha256`, `${digest}  ${path.basename(archivePath)}\n`, { mode: 0o600 });
  return { archivePath, digest, entries: entries.map((entry) => entry.name), files, manifest };
}

if (require.main === module) {
  try {
    const result = buildRelease(argumentsFrom(process.argv.slice(2)));
    console.log(`Created ${result.archivePath}`);
    console.log(`SHA-256 ${result.digest}`);
    console.log(`Included ${result.entries.length} public files; private local data was excluded.`);
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { argumentsFrom, buildRelease, createZip, crc32 };
