"use strict";

const fs = require("node:fs");
const path = require("node:path");

function createLocalStore(projectRoot) {
  const directory = path.join(projectRoot, ".local-data");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  function fileFor(name) {
    if (!/^[a-z0-9-]+$/i.test(name)) throw new Error("Invalid local-store key.");
    return path.join(directory, `${name}.json`);
  }

  function read(name, fallback = {}) {
    try {
      return JSON.parse(fs.readFileSync(fileFor(name), "utf8"));
    } catch (error) {
      return fallback;
    }
  }

  function write(name, value) {
    const target = fileFor(name);
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, target);
    try { fs.chmodSync(target, 0o600); } catch (error) { /* Windows ACLs remain the boundary. */ }
    return value;
  }

  function update(name, updater, fallback = {}) {
    return write(name, updater(read(name, fallback)));
  }

  function remove(name) {
    try { fs.unlinkSync(fileFor(name)); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }

  return Object.freeze({ directory, read, write, update, remove });
}

module.exports = { createLocalStore };
