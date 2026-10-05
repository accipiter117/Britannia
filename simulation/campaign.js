// simulation/campaign.js
// Owns the campaign turn: moving hosts between regions, which clashes become battles (field or
// siege), recruiting, upgrades and raising new hosts, silver income and upkeep, simple supply
// (men lost in hostile land, regained at home), applying battle results, and the season's end.
// Rome's moves live in romeAI.js. No DOM.

import { BALANCE } from "../config/balance.js";
import {
  armiesIn, armyMoves, armyPower, garrisonPower, log, neighbours, newArmy, newUnit, rankOf, regionsOf, seasonName,
} from "./state.js";
import { createBattle } from "./battle/setup.js";
import { autoResolve } from "./battle/engine.js";
import { resolveRome } from "./romeAI.js";

const C = BALANCE;

// ---------- who stands where ----------

export const hostile = (state, faction, region) => region.owner !== faction;

// A clash happens when a host enters a region held by someone else that has defenders: armies,
// or a garrison. Walled regions are sieges.
export function clashAt(state, attackerFaction, regionId) {
  const r = state.regions[regionId];
  const enemies = state.armies.filter((a) => a.region === regionId && a.faction !== attackerFaction);
  if (r.owner === attackerFaction && !enemies.length) return null;
  const garrison = r.owner !== attackerFaction ? r.garrison : [];
  if (!enemies.length && !garrison.length) return null;
  const defenderFaction = enemies[0]?.faction || r.owner;
  return { regionId, defenderFaction, siege: r.walls && r.owner === defenderFaction, armies: enemies.filter((a) => a.faction === defenderFaction), garrison: r.owner === defenderFaction ? garrison : [] };
}

export function canMove(state, army, to) {
  if (army.moves <= 0) return { ok: false, reason: "This host has marched this season" };
  if (!neighbours(state, army.region).includes(to)) return { ok: false, reason: "Too far: one region at a time" };
  return { ok: true };
}

// Moves a host one region. Returns { battle } if the move starts a fight (the attacker stays at
// the edge until it is decided), else { ok }.
export function moveArmy(state, armyId, to) {
  const army = state.armies.find((a) => a.id === armyId);
  const check = canMove(state, army, to);
  if (!check.ok) return check;
  army.moves -= 1;
  const clash = clashAt(state, army.faction, to);
  if (clash) {
    army.moves = 0;
    const attackers = [army, ...state.armies.filter((a) => a !== army && a.faction === army.faction && a.region === army.region && a.moves > 0 && a.joinNext)];
    return { battle: setupClash(state, attackers, clash) };
  }
  army.region = to;
  claim(state, to, army.faction);
  return { ok: true };
}

export function setupClash(state, attackerArmies, clash) {
  const region = state.regions[clash.regionId];
  const playerSide = attackerArmies[0].faction === "picts" ? "attacker" : clash.defenderFaction === "picts" ? "defender" : null;
  const battle = createBattle({
    region,
    attacker: { faction: attackerArmies[0].faction, armies: attackerArmies },
    defender: { faction: clash.defenderFaction, armies: clash.armies, garrison: clash.garrison },
    siege: clash.siege, playerSide, seed: state.turn * 31 + state.nextId,
  });
  battle.clash = { regionId: clash.regionId, attackerIds: attackerArmies.map((a) => a.id), defenderIds: clash.armies.map((a) => a.id), from: attackerArmies[0].region };
  return battle;
}

function claim(state, regionId, faction) {
  const r = state.regions[regionId];
  if (r.owner === faction) return;
  const was = r.owner;
  r.owner = faction;
  r.heldSince = state.turn;
  r.garrison = [];
  if (faction === "rome" && !r.walls) r.fortAt = state.turn + C.rome.buildFortSeasons;
  log(state, `${state.factions[faction].name} took ${r.name}${was ? ` from ${state.factions[was].name}` : ""}.`, faction === "picts" ? "good" : was === "picts" ? "bad" : "info");
}

// ---------- battle results ----------

export function applyBattle(state, battle) {
  const { clash, result } = battle;
  const won = result.winner;
  const sides = { attacker: clash.attackerIds, defender: clash.defenderIds };
  const region = state.regions[clash.regionId];
  // write survivors back, award experience
  for (const u of battle.units) {
    const cu = u.ref.garrison ? region.garrison[u.ref.index] : state.armies.find((a) => a.id === u.ref.armyId)?.units[u.ref.index];
    if (!cu) continue;
    cu.men = Math.max(0, Math.round(u.men));
    cu.xp += C.xp.perBattle + u.kills * C.xp.perKill + (u.side === won ? C.xp.win : 0);
    cu.dead = cu.men < 1;
  }
  region.garrison = region.garrison.filter((u) => !u.dead);
  for (const side of ["attacker", "defender"]) {
    for (const id of sides[side]) {
      const army = state.armies.find((a) => a.id === id);
      if (!army) continue;
      army.units = army.units.filter((u) => !u.dead);
      const g = army.general;
      if (battle.sides[side].generalSlain) {
        log(state, `${g.name} fell at ${region.name}.`, army.faction === "picts" ? "bad" : "good");
        army.general = { name: successor(state, army.faction), xp: 0, rank: 0 };
        if (!army.units.some((u) => BALANCE.units[u.type].general)) army.units.unshift(newUnit(army.faction === "rome" ? "legate" : "chieftain"));
      } else {
        g.xp += C.generals.xpPerBattle + (side === won ? C.generals.xpPerWin : 0);
        g.rank = C.generals.rankXp.filter((x) => g.xp >= x).length - 1;
      }
    }
  }
  // the losers fall back; the winning attackers advance
  const loserIds = won === "attacker" ? sides.defender : sides.attacker;
  for (const id of loserIds) {
    const army = state.armies.find((a) => a.id === id);
    if (!army) continue;
    const back = retreatTo(state, army, won === "attacker" ? clash.regionId : clash.from);
    if (won === "defender" && clash.from) army.region = clash.from; // attackers fall back where they came from
    else if (back) army.region = back;
    else { army.units = []; log(state, `${army.name} was cut down with nowhere to run.`, army.faction === "picts" ? "bad" : "good"); }
  }
  state.armies = state.armies.filter((a) => a.units.length);
  if (won === "attacker") {
    const stillThere = state.armies.some((a) => a.region === clash.regionId && sides.defender.includes(a.id));
    if (!stillThere) {
      for (const id of sides.attacker) { const a = state.armies.find((x) => x.id === id); if (a) a.region = clash.regionId; }
      claim(state, clash.regionId, battle.sides.attacker.faction);
    }
  }
  const pictsSide = battle.playerSide;
  const text = `Battle of ${region.name}: ${result.reason} ${won === pictsSide ? "Victory!" : pictsSide ? "Defeat." : ""}`;
  log(state, text, pictsSide ? (won === pictsSide ? "good" : "bad") : "info");
  checkEnd(state);
  return { won: pictsSide ? won === pictsSide : null, text };
}

function retreatTo(state, army, avoid) {
  return neighbours(state, army.region).find((n) => n !== avoid && state.regions[n].owner === army.faction && !state.armies.some((a) => a.region === n && a.faction !== army.faction));
}

const NAMES = { picts: ["Bridei", "Talorc", "Nechtan", "Uuen", "Ciniod", "Gartnait", "Brude", "Oengus"], rome: ["Lucullus", "Quintus", "Marcellus", "Urbicus", "Severus", "Aulus"] };
function successor(state, faction) {
  const list = NAMES[faction] || NAMES.picts;
  return list[(state.turn + state.nextId++) % list.length];
}

// A Roman attack waiting for the player: the battle, rebuilt from the current map (or null if
// the attack has come to nothing meanwhile).
export function pendingBattle(state, p) {
  const attackers = p.attackerIds.map((id) => state.armies.find((a) => a.id === id)).filter(Boolean);
  if (!attackers.length) return null;
  const clash = clashAt(state, attackers[0].faction, p.regionId);
  if (!clash) {
    attackers.forEach((a) => { a.region = p.regionId; });
    claim(state, p.regionId, attackers[0].faction);
    return null;
  }
  return setupClash(state, attackers, clash);
}

// AI-vs-AI clashes (Rome against the free tribes) are fought out of sight.
export function resolveAutoClash(state, attackerArmies, clash) {
  const battle = setupClash(state, attackerArmies, clash);
  autoResolve(battle);
  return applyBattle(state, battle);
}

// ---------- the muster ----------

export function recruitOptions(state, army) {
  const r = state.regions[army.region];
  return Object.entries(BALANCE.units).filter(([, d]) => d.side === "picts" && !d.general).map(([type, d]) => {
    const need = BALANCE.requires[type];
    let reason = null;
    if (r.owner !== "picts") reason = "Only in your own land";
    else if (army.units.length >= C.maxUnitsPerArmy) reason = `This host is full (${C.maxUnitsPerArmy})`;
    else if (need === "oppidum" && r.settlement !== "oppidum") reason = "Needs an oppidum";
    else if (need === "lowland" && r.terrain === "highlands") reason = "No chariots in the high glens";
    else if (state.silver < d.cost) reason = `Needs ${d.cost} silver`;
    return { type, cost: d.cost, ok: !reason, reason };
  });
}

export function recruit(state, armyId, type) {
  const army = state.armies.find((a) => a.id === armyId);
  const opt = recruitOptions(state, army).find((o) => o.type === type);
  if (!opt?.ok) return { ok: false, reason: opt?.reason || "Unknown unit" };
  state.silver -= opt.cost;
  army.units.push(newUnit(type));
  return { ok: true };
}

export function upgradeCost(unit, kind) {
  return C.upgrades[kind].cost * (unit[kind] + 1);
}

export function upgrade(state, armyId, index, kind) {
  const army = state.armies.find((a) => a.id === armyId);
  const u = army?.units[index];
  if (!u || u[kind] >= C.upgrades.maxLevel) return { ok: false, reason: "Fully upgraded" };
  if (state.regions[army.region].owner !== "picts") return { ok: false, reason: "Only in your own land" };
  const cost = upgradeCost(u, kind);
  if (state.silver < cost) return { ok: false, reason: `Needs ${cost} silver` };
  state.silver -= cost;
  u[kind] += 1;
  return { ok: true };
}

export function canRaiseArmy(state, regionId) {
  const r = state.regions[regionId];
  if (r.owner !== "picts") return { ok: false, reason: "Only in your own land" };
  if (state.armies.filter((a) => a.faction === "picts").length >= C.maxArmies) return { ok: false, reason: `At most ${C.maxArmies} hosts` };
  if (state.armies.some((a) => a.region === regionId && a.faction === "picts")) return { ok: false, reason: "A host already stands here" };
  if (state.silver < C.newArmyCost) return { ok: false, reason: `Needs ${C.newArmyCost} silver` };
  return { ok: true };
}

export function raiseArmy(state, regionId) {
  const check = canRaiseArmy(state, regionId);
  if (!check.ok) return check;
  state.silver -= C.newArmyCost;
  const r = state.regions[regionId];
  const army = newArmy(state, { faction: "picts", name: `Host of ${r.name}`, region: regionId, general: successor(state, "picts"), units: ["chieftain"] });
  army.moves = 0;
  state.armies.push(army);
  return { ok: true, army };
}

export function disband(state, armyId, index) {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || BALANCE.units[army.units[index]?.type]?.general) return { ok: false };
  army.units.splice(index, 1);
  return { ok: true };
}

// Hand a unit to another of your hosts in the same region.
export function transfer(state, fromId, index, toId) {
  const from = state.armies.find((a) => a.id === fromId), to = state.armies.find((a) => a.id === toId);
  if (!from || !to || from.region !== to.region || to.units.length >= C.maxUnitsPerArmy) return { ok: false };
  const [u] = from.units.splice(index, 1);
  if (BALANCE.units[u.type].general) { from.units.splice(index, 0, u); return { ok: false }; }
  to.units.push(u);
  return { ok: true };
}

// ---------- the season's end ----------

export function income(state) {
  const I = C.income;
  const gross = regionsOf(state, "picts").reduce((n, r) => n + I.base + (r.settlement === "oppidum" ? I.oppidum : 0) + (r.terrain === "fertile" ? I.fertile : r.terrain === "coast" ? I.coast : 0), 0);
  const upkeep = state.armies.filter((a) => a.faction === "picts").reduce((n, a) => n + a.units.length * C.upkeepPerUnit, 0);
  return { gross, upkeep, net: gross - upkeep };
}

// Ends the player's season: silver, supply, Rome's moves (which may queue battles for the
// player in state.pending), new forts, then the next season.
export function endTurn(state) {
  const notes = [];
  const inc = income(state);
  state.silver = Math.max(0, state.silver + inc.net);
  supply(state, notes);
  state.pending = [];
  resolveRome(state, notes);
  for (const r of Object.values(state.regions)) {
    if (r.owner === "rome" && r.fortAt && state.turn >= r.fortAt) {
      r.walls = true; r.settlement = "fort"; r.fortAt = null;
      r.garrison = C.battle.garrison.fort.map(newUnit);
      log(state, `Rome raised a fort at ${r.name}.`, "bad");
    }
  }
  checkEnd(state);
  state.turn += 1;
  for (const a of state.armies) { a.moves = armyMoves(a); a.joinNext = false; }
  notes.push(`${seasonName(state)} begins. Silver ${inc.net >= 0 ? "+" : ""}${inc.net}.`);
  return notes;
}

function supply(state, notes) {
  const S = C.supply;
  const winter = seasonName(state) === "Winter";
  for (const army of state.armies) {
    const home = state.regions[army.region].owner === army.faction;
    for (const u of army.units) {
      if (home) {
        const gap = u.maxMen - u.men;
        if (gap <= 0) continue;
        let add = Math.ceil(u.maxMen * S.homeReplenishPct);
        add = Math.min(gap, add);
        if (army.faction === "picts") {
          const cost = Math.ceil(add * C.replenishCostPerMan);
          if (state.silver < cost) continue;
          state.silver -= cost;
        }
        u.men += add;
      } else {
        const lost = Math.round(u.men * (winter ? S.winterAttritionPct : S.hostileAttritionPct));
        u.men = Math.max(1, u.men - lost);
      }
    }
    if (!home && army.faction === "picts") notes.push(`${army.name} is far from home and losing men.`);
  }
}

export function checkEnd(state) {
  if (state.over) return;
  if (state.regions[C.victoryRegion].owner === "picts") {
    state.over = { won: true, text: "Eboracum has fallen to the Picts. Rome's grip on the north is broken." };
    log(state, state.over.text, "good");
  } else if (!regionsOf(state, "picts").length) {
    state.over = { won: false, text: "The last Pictish stronghold has fallen. The north belongs to Rome." };
    log(state, state.over.text, "bad");
  }
}

export { armyPower, garrisonPower, rankOf };
