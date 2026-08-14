"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLeagueService } = require("../server/league-service.js");

function memoryStore() {
  const values = new Map();
  return {
    read(key, fallback) { return values.has(key) ? structuredClone(values.get(key)) : structuredClone(fallback); },
    write(key, value) { values.set(key, structuredClone(value)); return value; },
    update(key, updater, fallback) { return this.write(key, updater(this.read(key, fallback))); }
  };
}

test("discovers manually referenced ESPN leagues before authentication", async () => {
  const service = createLeagueService(memoryStore(), {
    espn: { status: () => ({ connected: false, leagueCount: 1 }), listLeagues: async () => [{ id: "42", name: "ESPN league 42", season: 2026 }] },
    yahoo: { status: () => ({ connected: false }), listLeagues: async () => { throw new Error("should not run"); } }
  });
  const result = await service.discover();
  assert.deepEqual(result.leagues, [{ provider: "espn", id: "42", name: "ESPN league 42", season: 2026 }]);
});
