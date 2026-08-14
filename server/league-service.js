"use strict";

function createLeagueService(store, connectors) {
  const keyFor = (provider, id) => `${provider}:${id}`;

  function snapshots() {
    return store.read("league-snapshots", { active: null, leagues: {} });
  }

  function saveSnapshot(snapshot) {
    return store.update("league-snapshots", (current) => {
      const value = current && current.leagues ? current : { active: null, leagues: {} };
      value.leagues[keyFor(snapshot.provider, snapshot.id)] = snapshot;
      return value;
    }, { active: null, leagues: {} });
  }

  async function discover() {
    const providerLeagues = await Promise.all(Object.entries(connectors).map(async ([provider, connector]) => {
      try {
        const status = connector.status();
        if (!status.connected && !status.leagueCount) return [];
        return (await connector.listLeagues()).map((league) => ({ ...league, provider }));
      } catch (error) {
        return [];
      }
    }));
    const current = snapshots();
    const merged = new Map();
    Object.values(current.leagues || {}).forEach((league) => merged.set(keyFor(league.provider, league.id), { provider: league.provider, id: league.id, name: league.name, season: league.season, syncedAt: league.syncedAt }));
    providerLeagues.flat().forEach((league) => merged.set(keyFor(league.provider, league.id), { ...merged.get(keyFor(league.provider, league.id)), ...league }));
    return { active: current.active, leagues: [...merged.values()].sort((left, right) => left.provider.localeCompare(right.provider) || left.name.localeCompare(right.name)) };
  }

  async function sync(provider, id) {
    const connector = connectors[provider];
    if (!connector) throw new Error("Unknown league provider.");
    const snapshot = await connector.syncLeague(id);
    saveSnapshot(snapshot);
    return snapshot;
  }

  function get(provider, id) {
    return snapshots().leagues?.[keyFor(provider, id)] || null;
  }

  function activate(provider, id) {
    const key = keyFor(provider, id);
    const current = snapshots();
    if (!current.leagues?.[key]) throw new Error("Sync this league before activating it.");
    current.active = key;
    store.write("league-snapshots", current);
    return current.leagues[key];
  }

  return Object.freeze({ activate, discover, get, saveSnapshot, sync });
}

module.exports = { createLeagueService };
