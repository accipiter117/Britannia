// simulation/state.js
// Owns the campaign state shape: creating a campaign from the map data for a chosen leader (era)
// and difficulty, units and hosts, lookups, and save/load. Factions: "celts" (the player), "rome"
// and "free" (tribes not yet won over). No DOM; runs in the browser and in Node.

import { BALANCE } from "../config/balance.js";
import { buildMapGrid, regionLinks } from "./mapGrid.js";

export const SAVE_VERSION = 2;
export const FACTIONS = {
  celts: { name: "The Britons", colour: "#3d6fb5" },
  rome: { name: "Rome", colour: "#b8323a" },
  free: { name: "Free tribes", colour: "#9a8a5a" },
};

export function newUnit(type, xp = 0) {
  const def = BALANCE.units[type];
  return { type, men: def.men, maxMen: def.men, xp, weapons: 0, armour: 0 };
}

export function newArmy(state, { faction, region, general, units, name }) {
  const army = {
    id: `${faction[0]}${state.nextId++}`, faction, region, name: name || `${general}'s host`,
    general: { name: general, xp: 0, rank: 0 }, units: units.map((t) => (typeof t === "string" ? newUnit(t) : t)),
    moves: 0, food: 0,
  };
  army.moves = armyMoves(army);
  army.food = foodCap(army);
  return army;
}

export function armyMoves(army) {
  return army.units.every((u) => BALANCE.units[u.type].tags?.includes("mounted")) ? BALANCE.fastMoves : BALANCE.movesPerSeason;
}

export function foodCap(army) {
  return army.units.length * BALANCE.food.carry;
}

export function createCampaign(data, { era = "caratacus", difficulty = "normal", seed = 1 } = {}) {
  const E = data.eras[era];
  const D = BALANCE.difficulty[difficulty];
  const grid = buildMapGrid(data.regions);
  const state = {
    version: SAVE_VERSION, era, difficulty, turn: 1, startYear: E.year, rng: (seed | 0) || 1, nextId: 10,
    silver: Math.round(E.silver * D.silver), wheat: E.wheat,
    regions: {}, links: regionLinks(data.regions, grid), armies: [],
    rome: { port: E.port, landed: 0 }, pending: [], capture: null, log: [], over: null, intro: E.intro,
  };
  const romanLand = new Set([...E.rome, ...(E.romeHoldsExtra || [])]);
  for (const r of data.regions) {
    const owner = E.player.includes(r.id) ? "celts" : romanLand.has(r.id) ? "rome" : "free";
    const town = (E.romanTowns || []).includes(r.id);
    const settlement = town ? "town" : r.settlement;
    state.regions[r.id] = {
      id: r.id, name: r.name, seat: r.seat || null, pos: r.pos, terrain: r.terrain, settlement, port: !!r.port,
      owner, walls: settlement === "oppidum" || settlement === "town", unrest: 0, fortAt: null, anger: 0, plundered: false,
      garrison: garrisonFor(owner, settlement),
    };
  }
  for (const a of E.playerArmies) state.armies.push(newArmy(state, { faction: "celts", region: a.region, general: a.general, units: a.units }));
  for (const a of E.romeArmies) state.armies.push(romanArmy(state, a.region, a.general, a.template));
  log(state, E.intro, "story");
  return state;
}

export function garrisonFor(owner, settlement) {
  if (owner === "celts") return settlement === "oppidum" ? ["spearmen", "slingers"].map((t) => newUnit(t)) : [];
  if (owner === "rome") return (settlement === "town" ? BALANCE.garrison.town : settlement === "fort" ? BALANCE.garrison.fort : []).map((t) => newUnit(t));
  return (BALANCE.garrison[settlement] || BALANCE.garrison.village).map((t) => newUnit(t));
}

export function romanArmy(state, region, general, template) {
  const D = BALANCE.difficulty[state.difficulty];
  const units = BALANCE.rome[template].map((t) => {
    const u = newUnit(t, D.romeStrength > 1 ? 40 : 0);
    if (D.romeStrength < 1) u.men = u.maxMen = Math.round(u.maxMen * D.romeStrength);
    return u;
  });
  const name = template === "legion" ? `Legio ${["II Augusta", "IX Hispana", "XIV Gemina", "XX Valeria", "II Adiutrix"][state.rome.landed % 5]}` : `${general}'s cohorts`;
  state.rome.landed++;
  return newArmy(state, { faction: "rome", region, general, units, name });
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
  return state.startYear + Math.floor((state.turn - 1) / 4);
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

// Rough fighting value, for the AI and the odds shown before a battle.
export function unitPower(u) {
  const d = BALANCE.units[u.type];
  const rk = BALANCE.ranks[rankOf(u)];
  const up = BALANCE.upgrades;
  const att = d.attack + rk.attack + up.weapons.perLevel * u.weapons;
  const def = d.defence + rk.defence + up.armour.perLevel * u.armour + d.shield * 0.4;
  return (u.men * d.hp * (att + def + (d.missile || 0) * 2 + d.charge * 0.25)) / 40;
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
