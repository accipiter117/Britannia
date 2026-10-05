// simulation/campaign.js
// Owns the campaign state shape: creation from starter data, lookups, and JSON save/load.
// No DOM access. The starter data is passed in, so this runs in the browser and in Node.

import { BALANCE } from "../config/balance.js";
import { foodStorageCap } from "./economy.js";

export const SAVE_VERSION = 2;

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
      personality: BALANCE.ai.factionPersonalities[f.id] || "Defender",
      mode: "PROSPER",       // AI priority this season (M5)
      memory: { threat: {}, battles: [] },
      emergent: false,       // rebel factions born in play (M9)
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
      culture: { celtic: 100, roman: 0 }, // percentage shares; shifts slowly under Integrate (M9)
      stage: "Integrated",   // Occupied / Administered / Integrated (M9)
      stageSeasons: 0,
      loyalty: d.owner ? 80 : 60,
      policy: "Integrate",
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
    armies: data.armies.map((a) => newArmy(a.id, a.name, a.factionId, a.districtId,
      a.formations.map(([type, troops]) => ({ type, troops })),
      BALANCE.army.startingCommanders[a.id] || BALANCE.army.defaultCommander)),
    diplomacy: { relations: {}, wars: [], alliances: [], access: [], trades: [] },
    pending: [],          // decisions waiting for the player (defence choices, alliance calls, events)
    events: [],           // ongoing event effects { kind, districtId, factionId, until }
    rome: { stage: data.roman_invasion.stage, countdown: null, nextReinforcement: null },
    victory: { offered: false, ended: false, score: {} },
    nextId: 1,
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

  state.chronicle.push(chronicleEntry(state, "The Chronicle begins. Three Celtic peoples share the land; rumours speak of Rome across the sea.", "FOUNDING"));
  return state;
}

export function newArmy(id, name, factionId, districtId, formations, commander = BALANCE.army.defaultCommander) {
  return {
    id, name, factionId, districtId,
    formations: formations.map((f) => ({ type: f.type, troops: f.troops, max: f.max ?? f.troops })),
    morale: BALANCE.army.startMorale,
    fatigue: 0,
    experience: "Green",
    battles: 0,
    commander,
    stance: "Normal",
    movesLeft: BALANCE.movement.basePoints,
    supply: "Well Supplied",
    unpaid: [],
    holdSeasons: 0,
  };
}

export function uid(state, prefix) {
  return `${prefix}_${state.nextId++}`;
}

export function seasonName(state) {
  return BALANCE.seasons[state.seasonIndex];
}

export function dateLabel(state) {
  return `Year ${state.year} ${seasonName(state)}`;
}

// type is one of the Chronicle categories: FOUNDING, BATTLE, VICTORY, DEFEAT, SETTLEMENT_FOUNDED,
// SETTLEMENT_DESTROYED, FACTION_DEFEATED, ALLIANCE, REBELLION, INVASION, COMMANDER_DEATH,
// MAJOR_DISASTER, HISTORICAL_DIVERGENCE, or LOG for everyday entries.
export function chronicleEntry(state, text, type = "LOG") {
  return { turn: state.turn, date: dateLabel(state), text, type };
}

export function addChronicle(state, text, type = "LOG") {
  state.chronicle.push(chronicleEntry(state, text, type));
}

export function armyTroops(army) {
  return army.formations.reduce((n, f) => n + f.troops, 0);
}

export function armiesIn(state, districtId, factionId = null) {
  return state.armies.filter((a) => a.districtId === districtId && (!factionId || a.factionId === factionId));
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
