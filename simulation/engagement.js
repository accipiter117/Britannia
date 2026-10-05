// simulation/engagement.js
// Owns what happens when an army tries to enter a hostile District: who defends, the defender's
// choice (Intercept / Hold / Withdraw / Ambush), setting up the battle, and applying the battle's
// consequences to the campaign (casualties, morale, experience, commanders, retreat, capture).
// An engagement is { attackerFactionId, armyIds, fromId, districtId }.

import { BALANCE } from "../config/balance.js";
import { addChronicle, armiesIn, armyTroops, neighbours } from "./campaign.js";
import { armyStrength, garrisonStrength, removeEmptyArmies } from "./armies.js";
import { atWar, changeRelation, hasAccess } from "./diplomacy.js";
import { captureDistrict, checkEliminations } from "./governance.js";
import { autoResolve, createBattle } from "./battle.js";
import { chance } from "./random.js";

const AMBUSH_TERRAIN = ["forest", "marsh", "hills"];
const name = (state, fid) => (fid ? state.factions[fid].name : "the local militia");

export function attackers(state, eng) {
  return state.armies.filter((a) => eng.armyIds.includes(a.id));
}

// Armies in the district at war with the attacker, plus militia in a neutral district.
export function defendersOf(state, eng) {
  const d = state.districts[eng.districtId];
  const armies = armiesIn(state, eng.districtId).filter((a) => atWar(state, a.factionId, eng.attackerFactionId));
  const factionId = armies[0]?.factionId ?? d.owner;
  return { factionId, armies: armies.filter((a) => a.factionId === factionId), garrison: !d.owner && !armies.length && d.garrison ? d.garrison.levies : 0 };
}

function retreatTarget(state, army, avoidId) {
  return neighbours(state, army.districtId).find((n) => n !== avoidId &&
    hasAccess(state, army.factionId, state.districts[n].owner) &&
    !armiesIn(state, n).some((a) => atWar(state, a.factionId, army.factionId)));
}

// Options for a player defending against `eng`. Each is { id, ok, reason, armyIds }.
export function defenceOptions(state, eng) {
  const def = defendersOf(state, eng);
  const fid = def.factionId;
  const here = def.armies.map((a) => a.id);
  const near = state.armies.filter((a) => a.factionId === fid && !here.includes(a.id) &&
    neighbours(state, a.districtId).includes(eng.districtId) && neighbours(state, a.districtId).includes(eng.fromId)).map((a) => a.id);
  const terrain = state.districts[eng.districtId].terrain;
  const canRetreat = def.armies.length && def.armies.every((a) => retreatTarget(state, a, eng.fromId));
  return [
    { id: "intercept", label: "Intercept", ok: here.length + near.length > 0, armyIds: [...here, ...near], reason: "No army in or beside the district", hint: "Meet them in the open before they arrive. Armies from neighbouring districts can join." },
    { id: "hold", label: "Hold Position", ok: here.length > 0, armyIds: here, reason: "No army in the district", hint: "Defend the district's stronghold. Fortifications and hillforts help; hold until nightfall to win." },
    { id: "ambush", label: "Ambush", ok: here.length > 0 && AMBUSH_TERRAIN.includes(terrain), armyIds: here, reason: here.length ? "Needs forest, hills or marsh" : "No army in the district", hint: "Strike from cover: the enemy starts shaken and closer." },
    { id: "withdraw", label: "Withdraw", ok: !!canRetreat, armyIds: here, reason: here.length ? "Nowhere safe to fall back" : "No army to withdraw", hint: "Fall back to a neighbouring friendly district. The district is lost for now." },
  ];
}

function fortification(state, districtId) {
  const d = state.districts[districtId];
  let bonus = 0;
  for (const s of d.special) bonus += BALANCE.specialBonuses[s]?.defence || 0;
  if (d.buildings.includes("fortification")) bonus += BALANCE.buildings.fortification.effect.defence;
  return bonus;
}

// Builds the battle for a chosen response. Returns a battle, or null if no fight happens.
export function setupBattle(state, eng, response, playerSide = null) {
  const def = defendersOf(state, eng);
  const opt = response === "auto" ? null : defenceOptions(state, eng).find((o) => o.id === response);
  const defArmies = opt ? state.armies.filter((a) => opt.armyIds.includes(a.id)) : def.armies;
  const d = state.districts[eng.districtId];
  const owned = d.owner === def.factionId || !d.owner;
  const type = (response === "hold" || (response === "auto" && owned)) ? "defensive" : "field";
  const battle = createBattle(d, {
    attacker: { factionId: eng.attackerFactionId, armies: attackers(state, eng) },
    defender: { factionId: def.factionId, armies: defArmies, garrison: def.garrison },
  }, { type, ambush: response === "ambush", fortification: type === "defensive" ? fortification(state, d.id) : 0, playerSide, seed: state.turn });
  battle.engagement = eng;
  battle.response = response;
  battle.defenderArmyIds = defArmies.map((a) => a.id);
  return battle;
}

// AI defender picks a response from what it can see: outmatched armies fall back, others hold.
export function aiResponse(state, eng) {
  const def = defendersOf(state, eng);
  if (!def.armies.length) return def.garrison ? "auto" : "none";
  const opts = defenceOptions(state, eng);
  const ours = def.armies.reduce((n, a) => n + armyStrength(a), 0);
  const theirs = attackers(state, eng).reduce((n, a) => n + armyStrength(a), 0);
  const p = def.factionId ? state.factions[def.factionId].personality : "Defender";
  if (ours < theirs * 0.5 && opts.find((o) => o.id === "withdraw").ok) return "withdraw";
  if (opts.find((o) => o.id === "ambush").ok && (p === "Warrior" || p === "Opportunist")) return "ambush";
  return "hold";
}

// Resolves a response that involves no battle. Returns a short text, or null if a battle is needed.
export function resolveWithoutBattle(state, eng, response) {
  const def = defendersOf(state, eng);
  const d = state.districts[eng.districtId];
  if (response === "withdraw") {
    for (const a of def.armies) a.districtId = retreatTarget(state, a, eng.fromId);
    advanceInto(state, eng);
    return `${name(state, def.factionId)} fell back from ${d.name}.`;
  }
  if (!def.armies.length && !def.garrison) {
    advanceInto(state, eng);
    return `${name(state, eng.attackerFactionId)} marched into ${d.name} unopposed.`;
  }
  return null;
}

function advanceInto(state, eng) {
  for (const a of attackers(state, eng)) a.districtId = eng.districtId;
  const d = state.districts[eng.districtId];
  if (d.owner !== eng.attackerFactionId && (!d.owner || atWar(state, d.owner, eng.attackerFactionId))) {
    captureDistrict(state, eng.districtId, eng.attackerFactionId);
  }
  checkEliminations(state);
}

// ---------- aftermath ----------

export function applyBattle(state, battle) {
  const eng = battle.engagement;
  const win = battle.result.winner;
  const lose = win === "attacker" ? "defender" : "attacker";
  const factions = { attacker: eng.attackerFactionId, defender: battle.sides.defender.factionId };
  const lost = { attacker: 0, defender: 0 };
  const d = state.districts[eng.districtId];

  // write surviving troops back to each army
  const touched = new Set();
  for (const u of battle.units) {
    const pursuit = u.escaped && u.side === lose ? BALANCE.battle.pursuitLossPct : 0;
    const left = Math.round(u.troops * (1 - pursuit));
    lost[u.side] += Math.round(u.start - left);
    if (!u.armyId) {
      if (d.garrison) d.garrison.levies = Math.max(0, (touched.has("garrison") ? d.garrison.levies : 0) + left);
      touched.add("garrison");
      continue;
    }
    const army = state.armies.find((a) => a.id === u.armyId);
    if (!army) continue;
    if (!touched.has(army.id)) {
      touched.add(army.id);
      army.formations.forEach((f) => { f.troops = 0; });
      army._morale = [];
    }
    army.formations.find((f) => f.type === u.type).troops += left;
    army._morale.push([Math.max(0, u.morale), left]);
  }

  const order = ["Poor", "Average", "Skilled", "Exceptional"];
  for (const id of touched) {
    const army = state.armies.find((a) => a.id === id);
    if (!army) continue;
    const side = army.factionId === factions.attacker && eng.armyIds.includes(army.id) ? "attacker" : "defender";
    const weight = army._morale.reduce((n, [, t]) => n + t, 0) || 1;
    const avg = army._morale.reduce((n, [m, t]) => n + m * t, 0) / weight;
    delete army._morale;
    army.formations = army.formations.filter((f) => f.troops > 0);
    army.morale = Math.round(side === win ? Math.min(BALANCE.army.maxMorale, avg + 10) : Math.max(10, avg / 2));
    army.battles += 1;
    const exp = BALANCE.battle.experience;
    if (exp[army.experience].next && army.battles >= thresholdFor(army.experience)) army.experience = army.experience === "Green" ? "Seasoned" : "Veteran";
    const deathChance = side === lose ? BALANCE.battle.commanderDeathChanceIfRouted : BALANCE.battle.commanderDeathChancePerBattle;
    if (armyTroops(army) > 0 && chance(state, deathChance)) {
      addChronicle(state, `The commander of the ${army.name} fell at ${d.name}.`, "COMMANDER_DEATH");
      army.commander = order[Math.max(0, order.indexOf(army.commander) - 1)];
    }
  }

  if (win === "defender" && !eng.fromId) {
    for (const a of attackers(state, eng)) {
      a.formations = [];
      addChronicle(state, `The ${a.name} was thrown back into the sea at ${d.name}.`, "HISTORICAL_DIVERGENCE");
    }
  }
  removeEmptyArmies(state);
  if (d.garrison && d.garrison.levies <= 0) d.garrison = null;

  // the losers fall back or scatter; winning attackers advance
  if (win === "attacker") {
    for (const a of state.armies.filter((x) => battle.defenderArmyIds.includes(x.id))) {
      const to = retreatTarget(state, a, eng.fromId);
      if (to) a.districtId = to;
      else {
        addChronicle(state, `The ${a.name} was scattered with nowhere left to run.`, a.factionId === state.playerFactionId ? "DEFEAT" : "BATTLE");
        a.formations = [];
      }
    }
    removeEmptyArmies(state);
    if (!defendersOf(state, eng).armies.length) advanceInto(state, eng);
  }
  if (factions.attacker && factions.defender) changeRelation(state, factions.attacker, factions.defender, BALANCE.diplomacy.battleRelationPenalty);
  for (const side of ["attacker", "defender"]) {
    const f = state.factions[factions[side]];
    if (f) f.memory.battles = [...f.memory.battles.slice(-7), { turn: state.turn, district: d.id, won: side === win, enemy: factions[side === "attacker" ? "defender" : "attacker"] }];
  }

  const text = `Battle of ${d.name}: ${name(state, factions[win])} defeated ${name(state, factions[lose])}. ${battle.result.reason}. Losses ${lost.attacker} attacking, ${lost.defender} defending.`;
  const player = state.playerFactionId;
  const type = factions[win] === player ? "VICTORY" : factions[lose] === player ? "DEFEAT" : "BATTLE";
  addChronicle(state, text, type);
  return { text, winner: factions[win], loser: factions[lose], lost };
}

function thresholdFor(level) {
  const exp = BALANCE.battle.experience;
  return level === "Green" ? exp.Green.next : exp.Green.next + exp.Seasoned.next;
}

// Rough odds for the pre-battle screen (strength ratio, not a promise), from `side`'s point of view.
export function oddsText(state, eng, side = "attacker", defenderArmyIds = null) {
  const def = defendersOf(state, eng);
  const defArmies = defenderArmyIds ? state.armies.filter((a) => defenderArmyIds.includes(a.id)) : def.armies;
  const att = attackers(state, eng).reduce((n, a) => n + armyStrength(a), 0);
  const dfn = defArmies.reduce((n, a) => n + armyStrength(a), 0) + garrisonStrength(state.districts[eng.districtId]);
  const r = side === "attacker" ? att / Math.max(0.1, dfn) : dfn / Math.max(0.1, att);
  return r > 1.6 ? "Overwhelming" : r > 1.15 ? "Favourable" : r > 0.85 ? "Even" : r > 0.6 ? "Unfavourable" : "Desperate";
}

// ---------- running an engagement without the player ----------

export function playerDefends(state, eng) {
  return defendersOf(state, eng).factionId === state.playerFactionId;
}

// AI-vs-AI (or AI vs militia): the defender chooses, the battle auto-resolves. Returns a text.
export function resolveEngagementAuto(state, eng) {
  const response = aiResponse(state, eng);
  const quiet = resolveWithoutBattle(state, eng, response === "none" ? "none" : response);
  if (quiet) return quiet;
  const battle = setupBattle(state, eng, response);
  autoResolve(battle);
  return applyBattle(state, battle).text;
}

// The player is attacked: either a decision is queued for them, or (if nothing can respond)
// the district simply falls. Returns { pending } or { text }.
export function engagePlayer(state, eng) {
  const opts = defenceOptions(state, eng);
  if (!opts.some((o) => o.ok)) return { text: resolveWithoutBattle(state, eng, "none") };
  state.pending.push({ kind: "defend", eng });
  return { pending: true };
}
