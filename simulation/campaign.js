// simulation/campaign.js
// Owns the campaign turn: marching hosts region to region, clashes (field battles and sieges),
// what happens to a taken region (win it over, or plunder it and stoke resistance), the wheat that
// feeds every host (the harvest fills the granary; hosts eat each season, more in winter, and
// forage abroad in summer), silver, recruiting and upgrades, revolts, and the season's end.
// Rome's moves live in romeAI.js. No DOM.

import { BALANCE } from "../config/balance.js";
import {
  armyMoves, armyPower, foodCap, garrisonFor, garrisonPower, log, neighbours, newArmy, newUnit, rankOf, regionsOf, seasonName,
} from "./state.js";
import { nextRandom } from "./random.js";
import { createBattle } from "./battle/setup.js";
import { autoResolve } from "./battle/engine.js";
import { resolveRome } from "./romeAI.js";

const C = BALANCE;
const PLAYER = "celts";

// ---------- clashes ----------

// A clash happens when a host enters a region held by someone else that has defenders: hosts or a
// garrison. Walled regions (oppida, towns, forts) are sieges.
export function clashAt(state, attackerFaction, regionId) {
  const r = state.regions[regionId];
  const enemies = state.armies.filter((a) => a.region === regionId && a.faction !== attackerFaction);
  if (r.owner === attackerFaction && !enemies.length) return null;
  const garrison = r.owner !== attackerFaction ? r.garrison : [];
  if (!enemies.length && !garrison.length) return null;
  const defenderFaction = enemies[0]?.faction || r.owner;
  return { regionId, defenderFaction, siege: r.walls && r.owner === defenderFaction && garrison.length > 0, armies: enemies.filter((a) => a.faction === defenderFaction), garrison: r.owner === defenderFaction ? garrison : [] };
}

// How a host's attack on a clash looks: the strength ratio and a word for it.
export function attackOdds(army, clash) {
  const theirs = clash.armies.reduce((n, a) => n + armyPower(a), 0) + garrisonPower({ walls: clash.siege, garrison: clash.garrison });
  const ratio = armyPower(army) / Math.max(1, theirs);
  const [word, tone] = ratio > 1.6 ? ["Easy", "good"] : ratio > 1.15 ? ["Good", "good"] : ratio > 0.85 ? ["Even", "even"] : ratio > 0.6 ? ["Hard", "bad"] : ["Desperate", "bad"];
  return { ratio, word, tone };
}

export function canMove(state, army, to) {
  if (army.moves <= 0) return { ok: false, reason: "This host has marched this season" };
  if (!neighbours(state, army.region).includes(to)) return { ok: false, reason: "One region at a time" };
  return { ok: true };
}

// Moves a host one region. Returns { battle } if the move starts a fight; { capture } if it takes an
// undefended region (the player then chooses what to do with it); else { ok }.
export function moveArmy(state, armyId, to) {
  const army = state.armies.find((a) => a.id === armyId);
  const check = canMove(state, army, to);
  if (!check.ok) return check;
  army.moves -= 1;
  const clash = clashAt(state, army.faction, to);
  if (clash) {
    army.moves = 0;
    return { battle: setupClash(state, [army], clash) };
  }
  const was = state.regions[to].owner;
  army.region = to;
  if (was !== army.faction) return take(state, to, army.faction, was);
  return { ok: true };
}

export function setupClash(state, attackerArmies, clash) {
  const region = state.regions[clash.regionId];
  const playerSide = attackerArmies[0].faction === PLAYER ? "attacker" : clash.defenderFaction === PLAYER ? "defender" : null;
  const battle = createBattle({
    region,
    attacker: { faction: attackerArmies[0].faction, armies: attackerArmies },
    defender: { faction: clash.defenderFaction, armies: clash.armies, garrison: clash.garrison },
    siege: clash.siege, playerSide, seed: state.turn * 31 + state.nextId,
  });
  battle.clash = { regionId: clash.regionId, attackerIds: attackerArmies.map((a) => a.id), defenderIds: clash.armies.map((a) => a.id), from: attackerArmies[0].region };
  return battle;
}

// A region changes hands. The player decides its fate; Rome and rebels simply hold it.
function take(state, regionId, faction, was) {
  const r = state.regions[regionId];
  r.owner = faction;
  r.garrison = [];
  r.unrest = 0;
  if (faction === "rome") {
    if (!r.walls) r.fortAt = state.turn + C.rome.fortAfter;
    log(state, `Rome took ${r.name}${was === PLAYER ? " from you" : ""}.`, was === PLAYER ? "bad" : "info");
    return { ok: true };
  }
  if (faction === PLAYER) {
    state.capture = { regionId, from: was };
    return { capture: regionId };
  }
  return { ok: true };
}

export function captureOptions(state) {
  const c = state.capture;
  if (!c) return null;
  const r = state.regions[c.regionId];
  const roman = c.from === "rome";
  const loot = lootFor(r);
  return {
    region: r, roman,
    peace: roman ? { label: `Free ${r.name}`, hint: "Its people rally to you: a band of their warriors joins your host." }
      : { label: `Win over the ${r.name}`, hint: "They swear to you. A band of their warriors joins your host." },
    plunder: { label: roman ? `Sack ${r.seat || r.name}` : `Plunder the ${r.name}`, hint: `+${loot.silver} silver, +${loot.wheat} wheat. They will not forget: unrest, and the free tribes nearby harden.`, loot },
  };
}

function lootFor(r) {
  const P = C.plunder;
  const rich = r.settlement === "town" ? 2.2 : r.settlement === "oppidum" ? 1.4 : 1;
  return { silver: Math.round(P.silver * rich), wheat: Math.round(P.food * rich) };
}

export function decideCapture(state, choice) {
  const c = state.capture;
  if (!c) return;
  state.capture = null;
  const r = state.regions[c.regionId];
  const host = state.armies.find((a) => a.region === r.id && a.faction === PLAYER);
  r.walls = r.settlement === "oppidum" || r.settlement === "town";
  if (choice === "plunder") {
    const loot = lootFor(r);
    state.silver += loot.silver;
    state.wheat += loot.wheat;
    r.unrest = C.plunder.unrest;
    r.plundered = true;
    if (r.settlement === "town") { r.settlement = "village"; r.walls = false; }
    for (const n of neighbours(state, r.id)) {
      const nr = state.regions[n];
      if (nr.owner === "free") { nr.anger += C.plunder.nearbyAnger; nr.garrison.push(newUnit(nr.anger > 1 ? "warriors" : "spearmen")); }
    }
    log(state, `You ${c.from === "rome" ? "sacked" : "plundered"} ${r.name}: +${loot.silver} silver, +${loot.wheat} wheat.`, "good");
  } else {
    if (host && host.units.length < C.maxUnitsPerArmy) host.units.push(newUnit(c.from === "rome" ? "spearmen" : "warriors"));
    log(state, c.from === "rome" ? `${r.name} is free of Rome and stands with you.` : `The ${r.name} swear to fight beside you.`, "good");
  }
  r.garrison = garrisonFor(PLAYER, r.settlement);
  checkEnd(state);
}

// ---------- battle results ----------

export function applyBattle(state, battle) {
  const { clash, result } = battle;
  const won = result.winner;
  const sides = { attacker: clash.attackerIds, defender: clash.defenderIds };
  const region = state.regions[clash.regionId];
  for (const u of battle.units) {
    const cu = u.ref.garrison ? region.garrison[u.ref.index] : state.armies.find((a) => a.id === u.ref.armyId)?.units[u.ref.index];
    if (!cu) continue;
    cu.men = u.soldiers.filter((s) => s.alive).length;
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
        log(state, `${g.name} fell at ${region.name}.`, army.faction === PLAYER ? "bad" : "good");
        army.general = { name: successor(state, army.faction), xp: 0, rank: 0 };
        if (army.units.length) army.units.unshift(newUnit(army.faction === "rome" ? "legate" : "chieftain"));
      } else {
        g.xp += C.generals.xpPerBattle + (side === won ? C.generals.xpPerWin : 0);
        g.rank = C.generals.rankXp.filter((x) => g.xp >= x).length - 1;
      }
    }
  }
  // the beaten fall back; the winning attackers advance
  const loserIds = won === "attacker" ? sides.defender : sides.attacker;
  for (const id of loserIds) {
    const army = state.armies.find((a) => a.id === id);
    if (!army) continue;
    if (won === "defender") continue; // attackers stay where they came from
    const back = neighbours(state, army.region).find((n) => state.regions[n].owner === army.faction && !state.armies.some((a) => a.region === n && a.faction !== army.faction));
    if (back) army.region = back;
    else { army.units = []; log(state, `${army.name} was cut down with nowhere to run.`, army.faction === PLAYER ? "bad" : "good"); }
  }
  state.armies = state.armies.filter((a) => a.units.length);
  let capture = null;
  if (won === "attacker") {
    const stillThere = state.armies.some((a) => a.region === clash.regionId && sides.defender.includes(a.id));
    if (!stillThere) {
      for (const id of sides.attacker) { const a = state.armies.find((x) => x.id === id); if (a) a.region = clash.regionId; }
      const faction = battle.sides.attacker.faction;
      if (region.owner !== faction) capture = take(state, clash.regionId, faction, region.owner).capture || null;
    }
  }
  const mine = battle.playerSide;
  log(state, `Battle of ${region.name}: ${result.reason}${mine ? (won === mine ? " Victory!" : " Defeat.") : ""}`, mine ? (won === mine ? "good" : "bad") : "info");
  checkEnd(state);
  return { won: mine ? won === mine : null, capture };
}

const NAMES = { celts: ["Cunobelin", "Adminius", "Venutius", "Cartimandua", "Epaticcus", "Dubnovellaunus", "Cogidubnus", "Tasciovanus"], rome: ["Ostorius", "Didius", "Frontinus", "Cerialis", "Quintus", "Lucullus"] };
function successor(state, faction) {
  const list = NAMES[faction] || NAMES.celts;
  return list[(state.turn + state.nextId++) % list.length];
}

// Clashes the player is not part of are fought out of sight.
export function resolveAutoClash(state, attackerArmies, clash) {
  const battle = setupClash(state, attackerArmies, clash);
  autoResolve(battle);
  return applyBattle(state, battle);
}

// A Roman attack waiting for the player: the battle, rebuilt from the current map (or null if it
// has come to nothing meanwhile).
export function pendingBattle(state, p) {
  const attackers = p.attackerIds.map((id) => state.armies.find((a) => a.id === id)).filter(Boolean);
  if (!attackers.length) return null;
  const clash = clashAt(state, attackers[0].faction, p.regionId);
  if (!clash) {
    attackers.forEach((a) => { a.region = p.regionId; });
    take(state, p.regionId, attackers[0].faction, state.regions[p.regionId].owner);
    return null;
  }
  return setupClash(state, attackers, clash);
}

// ---------- the muster ----------

export function recruitOptions(state, army) {
  const r = state.regions[army.region];
  return Object.entries(C.units).filter(([, d]) => d.side === "celts" && !d.tags?.includes("general")).map(([type, d]) => {
    const need = C.requires[type];
    let reason = null;
    if (r.owner !== PLAYER) reason = "Only in your own land";
    else if (army.units.length >= C.maxUnitsPerArmy) reason = `Host is full (${C.maxUnitsPerArmy})`;
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
  if (state.regions[army.region].owner !== PLAYER) return { ok: false, reason: "Only in your own land" };
  const cost = upgradeCost(u, kind);
  if (state.silver < cost) return { ok: false, reason: `Needs ${cost} silver` };
  state.silver -= cost;
  u[kind] += 1;
  return { ok: true };
}

export function canRaiseArmy(state, regionId) {
  const r = state.regions[regionId];
  if (r.owner !== PLAYER) return { ok: false, reason: "Only in your own land" };
  if (state.armies.filter((a) => a.faction === PLAYER).length >= C.maxArmies) return { ok: false, reason: `At most ${C.maxArmies} hosts` };
  if (state.armies.some((a) => a.region === regionId && a.faction === PLAYER)) return { ok: false, reason: "A host already stands here" };
  if (state.silver < C.newArmyCost) return { ok: false, reason: `Needs ${C.newArmyCost} silver` };
  return { ok: true };
}

export function raiseArmy(state, regionId) {
  const check = canRaiseArmy(state, regionId);
  if (!check.ok) return check;
  state.silver -= C.newArmyCost;
  const army = newArmy(state, { faction: PLAYER, region: regionId, general: successor(state, PLAYER), units: ["chieftain", "warriors"] });
  army.moves = 0;
  state.armies.push(army);
  return { ok: true, army };
}

export function disband(state, armyId, index) {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army || C.units[army.units[index]?.type]?.tags?.includes("general")) return { ok: false };
  army.units.splice(index, 1);
  return { ok: true };
}

export function transfer(state, fromId, index, toId) {
  const from = state.armies.find((a) => a.id === fromId), to = state.armies.find((a) => a.id === toId);
  if (!from || !to || from.region !== to.region || to.units.length >= C.maxUnitsPerArmy) return { ok: false };
  if (C.units[from.units[index]?.type]?.tags?.includes("general")) return { ok: false };
  to.units.push(...from.units.splice(index, 1));
  return { ok: true };
}

// ---------- silver and wheat ----------

export function income(state) {
  const D = C.difficulty[state.difficulty];
  const gross = Math.round(regionsOf(state, PLAYER).reduce((n, r) => n + (C.regionYield[r.settlement]?.silver ?? 15) * (r.unrest ? 0.5 : 1), 0) * D.silver);
  const upkeep = Math.round(state.armies.filter((a) => a.faction === PLAYER).reduce((n, a) => n + a.units.length * C.upkeepPerUnit, 0));
  return { gross, upkeep, net: gross - upkeep };
}

export function harvest(state, season = seasonName(state)) {
  const mult = season === "Summer" ? 1.5 : season === "Autumn" ? 1 : 0;
  return Math.round(regionsOf(state, PLAYER).reduce((n, r) => n + (C.regionYield[r.settlement]?.food ?? 4) * (r.unrest ? 0.5 : 1), 0) * mult);
}

// What a host eats this season, and where it will come from.
export function foodNeed(army, season) {
  return Math.ceil(army.units.length * C.food.eatPerUnit * (season === "Winter" ? 1 + C.food.winterExtra : 1));
}

// ---------- the season's end ----------

export function endTurn(state) {
  const notes = [];
  const season = seasonName(state);
  const inc = income(state);
  state.silver = Math.max(0, state.silver + inc.net);
  const crop = harvest(state, season);
  state.wheat += crop;
  if (crop) notes.push(`The harvest brings ${crop} wheat.`);
  supply(state, season, notes);
  unrest(state, notes);
  state.pending = [];
  resolveRome(state, notes);
  for (const r of Object.values(state.regions)) {
    if (r.owner === "rome" && r.fortAt && state.turn >= r.fortAt) {
      r.walls = true; r.settlement = "fort"; r.fortAt = null; r.garrison = garrisonFor("rome", "fort");
      log(state, `Rome raised a fort in ${r.name}.`, "bad");
    }
  }
  checkEnd(state);
  state.turn += 1;
  for (const a of state.armies) a.moves = armyMoves(a);
  notes.push(`${seasonName(state)} begins. Silver ${inc.net >= 0 ? "+" : ""}${inc.net}.`);
  return notes;
}

// Hosts eat. At home they live off the land outside winter, and refill from the granary;
// abroad they forage half their needs in summer and autumn, and nothing in winter.
// An empty wagon means hunger, and men slip away.
function supply(state, season, notes) {
  for (const army of state.armies.filter((a) => a.faction === PLAYER)) {
    const need = foodNeed(army, season);
    const home = state.regions[army.region].owner === PLAYER;
    let eat = need;
    if (home && season !== "Winter") eat = 0;
    else if (!home && (season === "Summer" || season === "Autumn")) eat = Math.ceil(need * (1 - C.food.forageSummer));
    army.food -= eat;
    if (home) {
      const room = foodCap(army) - Math.max(0, army.food);
      const take = Math.min(room, state.wheat);
      state.wheat -= take;
      army.food = Math.max(0, army.food) + take;
    }
    if (army.food < 0) {
      army.food = 0;
      for (const u of army.units) u.men = Math.max(1, Math.round(u.men * (1 - C.food.starvingLossPct)));
      notes.push(`${army.name} is starving: men are deserting.`);
      log(state, `${army.name} went hungry.`, "bad");
    }
    // men return to the colours at home, for silver
    if (home) for (const u of army.units) {
      const gap = u.maxMen - u.men;
      if (gap <= 0) continue;
      const add = Math.min(gap, Math.ceil(u.maxMen * C.replenishPct), Math.floor(state.silver / C.replenishCost));
      state.silver -= add * C.replenishCost;
      u.men += add;
    }
  }
  // Rome keeps its legions fed by sea and road, and rebuilds them in its own land
  for (const army of state.armies.filter((a) => a.faction === "rome")) {
    if (state.regions[army.region].owner !== "rome") continue;
    for (const u of army.units) u.men = Math.min(u.maxMen, u.men + Math.ceil(u.maxMen * C.replenishPct));
  }
}

// Plundered regions may rise against you when no host is there to keep them down.
function unrest(state, notes) {
  for (const r of regionsOf(state, PLAYER)) {
    if (!r.unrest) continue;
    const held = state.armies.some((a) => a.region === r.id && a.faction === PLAYER);
    if (!held && nextRandom(state) < C.revoltChance) {
      r.owner = "free";
      r.garrison = garrisonFor("free", r.settlement === "town" ? "village" : r.settlement);
      r.unrest = 0;
      log(state, `${r.name} has risen against you.`, "bad");
      notes.push(`${r.name} has risen against you!`);
      continue;
    }
    r.unrest -= 1;
  }
}

export function checkEnd(state) {
  if (state.over) return;
  const romeLeft = regionsOf(state, "rome").length + state.armies.filter((a) => a.faction === "rome").length;
  if (!romeLeft) {
    state.over = { won: true, text: "Rome has been driven from Britannia. The island belongs to its own people again." };
    log(state, state.over.text, "good");
  } else if (!regionsOf(state, PLAYER).length && !state.armies.some((a) => a.faction === PLAYER)) {
    state.over = { won: false, text: "The last of the free Britons has fallen. Britannia is a Roman province." };
    log(state, state.over.text, "bad");
  }
}

export { armyPower, garrisonPower, rankOf };
