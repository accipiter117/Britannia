// simulation/state.js
// Owns the campaign state shape: creation from the map data, lookups, units, and save/load.
// No DOM. The data is passed in, so this runs in the browser and in Node.

import { BALANCE } from "../config/balance.js";

export const SAVE_VERSION = 1;

export function newUnit(type) {
  const def = BALANCE.units[type];
  return { type, men: def.men, maxMen: def.men, xp: 0, weapons: 0, armour: 0 };
}

export function newArmy(state, { faction, name, region, general, units }) {
  const id = `${faction[0]}${state.nextId++}`;
  return { id, faction, name, region, general: { name: general, xp: 0, rank: 0 }, units: units.map(newUnit), moves: movesFor(units) };
}

function movesFor(types) {
  const fast = types.every((t) => BALANCE.units[t].mounted);
  return fast ? BALANCE.fastMoves : BALANCE.movesPerSeason;
}

export function armyMoves(army) {
  return movesFor(army.units.map((u) => u.type));
}

export function createCampaign(data, seed = 1) {
  const state = {
    version: SAVE_VERSION,
    turn: 1,
    rng: seed,
    nextId: 10,
    silver: BALANCE.startSilver,
    factions: data.factions,
    regions: {},
    links: data.links,
    armies: [],
    rome: { armiesRaised: 0 },
    pending: [],         // Roman attacks waiting for the player: { attackerIds, regionId }
    log: [],             // { turn, text, kind }
    over: null,          // { won, text }
  };
  for (const r of data.regions) {
    state.regions[r.id] = {
      id: r.id, name: r.name, pos: r.pos, terrain: r.terrain, owner: r.owner,
      settlement: r.settlement, capital: !!r.capital,
      walls: r.settlement === "oppidum" || r.settlement === "fort" || r.settlement === "fortress",
      garrison: (r.garrison || BALANCE.battle.garrison[r.settlement] || []).map(newUnit),
      heldSince: 0,
    };
    // Roman villages are policed by the armies; Pictish and free villages keep a militia
    const reg = state.regions[r.id];
    if (!reg.walls && r.owner === "rome") reg.garrison = [];
  }
  for (const a of data.armies) {
    const army = newArmy(state, a);
    army.id = a.id;
    state.armies.push(army);
  }
  log(state, "The tribes of the north gather. Rome's governor looks beyond the Forth.", "story");
  return state;
}

// ---------- lookups ----------

export function neighbours(state, id) {
  return state.links.filter(([a, b]) => a === id || b === id).map(([a, b]) => (a === id ? b : a));
}

export function armiesIn(state, regionId, faction = null) {
  return state.armies.filter((a) => a.region === regionId && (!faction || a.faction === faction));
}

export function regionsOf(state, faction) {
  return Object.values(state.regions).filter((r) => r.owner === faction);
}

export function seasonName(state) {
  return BALANCE.seasons[(state.turn - 1) % 4];
}

export function year(state) {
  return BALANCE.startYear + Math.floor((state.turn - 1) / 4);
}

export function dateLabel(state) {
  return `${seasonName(state)}, AD ${year(state)}`;
}

export function armyMen(army) {
  return army.units.reduce((n, u) => n + u.men, 0);
}

export function rankOf(unit) {
  let r = 0;
  BALANCE.ranks.forEach((k, i) => { if (unit.xp >= k.xp) r = i; });
  return r;
}

// Rough strength for AI and odds: men x (attack + defence) x upgrades and rank.
export function unitPower(u) {
  const d = BALANCE.units[u.type];
  const rk = BALANCE.ranks[rankOf(u)];
  const up = BALANCE.upgrades;
  return (u.men / 100) * (d.attack * rk.attack * (1 + up.weapons.perLevel * u.weapons) + d.defence * rk.defence * (1 + up.armour.perLevel * u.armour) + (d.missile || 0) * 1.5 + d.charge * 0.3);
}

export function armyPower(army) {
  return army.units.reduce((n, u) => n + unitPower(u), 0);
}

export function garrisonPower(region) {
  return region.garrison.reduce((n, u) => n + unitPower(u), 0) * (region.walls ? 1.6 : 1);
}

export function log(state, text, kind = "info") {
  state.log.push({ turn: state.turn, text, kind });
  if (state.log.length > 200) state.log.shift();
}

// ---------- save / load ----------

export function serialise(state) {
  return JSON.stringify(state);
}

export function deserialise(json) {
  const s = JSON.parse(json);
  if (s.version !== SAVE_VERSION) throw new Error("Save from another version");
  return s;
}
