// simulation/campaign.js
// Owns the campaign state shape: creation from starter data, lookups, and JSON save/load.
// No DOM access. The starter data is passed in, so this runs in the browser and in Node.

import { BALANCE } from "../config/balance.js";
import { foodStorageCap } from "./economy.js";

export const SAVE_VERSION = 1;

export function createCampaign(data) {
  const factions = {};
  for (const f of data.factions) {
    factions[f.id] = {
      id: f.id,
      name: f.name,
      culture: f.culture,
      colour: f.colour,
      player: !!f.player,
      resources: { food: 0, timber: 0, materials: 0, wealth: 0 },
      starvingSeasons: 0,
      lastFoodStatus: "stable",
    };
  }

  const districts = {};
  for (const d of data.districts) {
    districts[d.id] = {
      id: d.id,
      name: d.name,
      region: d.region,
      terrain: d.terrain,
      special: [...d.special],
      owner: d.owner,
      population: d.population,
      basePopulation: d.population, // workforce reference: production only scales down below this
      culture: "celtic",
      buildings: [],
      construction: [], // { building, progress }
      garrison: d.owner ? null : { ...BALANCE.neutralGarrison },
      pos: d.pos,
    };
  }

  const state = {
    version: SAVE_VERSION,
    turn: 1, // 1 = Year 1 Spring; matches the test plan pressure beats
    year: data.campaign.year,
    seasonIndex: BALANCE.seasons.indexOf(data.campaign.season),
    phase: data.campaign.phase,
    playerFactionId: data.factions.find((f) => f.player).id,
    regions: data.regions,
    districts,
    connections: data.connections.map(([a, b]) => ({ a, b, road: false, roadProgress: null, roadOwner: null })),
    factions,
    armies: data.armies.map((a) => ({
      id: a.id,
      name: a.name,
      factionId: a.factionId,
      districtId: a.districtId,
      formations: a.formations.map(([type, troops]) => ({ type, troops })),
    })),
    romanInvasion: { ...data.roman_invasion },
    notifications: [],
    chronicle: [],
  };

  for (const f of Object.values(factions)) {
    const start = BALANCE.startingResources;
    const owns = Object.values(districts).some((d) => d.owner === f.id);
    if (!owns) continue; // Rome starts off-map with nothing
    f.resources.food = start.food === "full" ? foodStorageCap(state, f.id) : start.food;
    f.resources.timber = start.timber;
    f.resources.materials = start.materials;
    f.resources.wealth = start.wealth;
  }

  state.chronicle.push(chronicleEntry(state, "The Chronicle begins. Three Celtic peoples share the land; rumours speak of Rome across the sea."));
  return state;
}

export function seasonName(state) {
  return BALANCE.seasons[state.seasonIndex];
}

export function dateLabel(state) {
  return `Year ${state.year} ${seasonName(state)}`;
}

export function chronicleEntry(state, text) {
  return { turn: state.turn, date: dateLabel(state), text };
}

export function districtsOf(state, factionId) {
  return Object.values(state.districts).filter((d) => d.owner === factionId);
}

export function neighbours(state, districtId) {
  return state.connections
    .filter((c) => c.a === districtId || c.b === districtId)
    .map((c) => (c.a === districtId ? c.b : c.a));
}

export function serialise(state) {
  return JSON.stringify(state);
}

export function deserialise(json) {
  const state = JSON.parse(json);
  if (!state || state.version !== SAVE_VERSION) throw new Error("Save is from a different version");
  return state;
}
