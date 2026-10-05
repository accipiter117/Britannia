// simulation/orders.js
// Owns army orders: what an army does with a season instead of marching. Raid strikes an
// adjacent enemy or unclaimed district for its harvest, Dig in entrenches where it stands, and
// Rest speeds recovery in friendly land. Moving cancels any order. Resolved at End Season step 7b.

import { BALANCE } from "../config/balance.js";
import { addChronicle, armiesIn, armyTroops, logSeason, neighbours } from "./campaign.js";
import { armyStrength, garrisonStrength, lossesProportional, movementPoints, removeEmptyArmies } from "./armies.js";
import { storageCaps } from "./economy.js";
import { atWar, changeRelation } from "./diplomacy.js";

const O = BALANCE.orders;
export const ORDER_KINDS = ["raid", "dig", "rest"];

// The live order of an army, or null. An order holds only where it was given.
export function orderOf(army) {
  return army.order && army.order.at === army.districtId ? army.order : null;
}

// Entrenched: dug in here for at least one End Season.
export function isDugIn(army) {
  return army.dugAt === army.districtId;
}

// Districts this army could raid: adjacent, not its own, and either unclaimed or at war with it.
export function raidTargets(state, army) {
  return neighbours(state, army.districtId).filter((n) => {
    const d = state.districts[n];
    if (d.owner === army.factionId) return false;
    return d.owner ? atWar(state, army.factionId, d.owner) : true;
  });
}

export function canOrder(state, army, kind, target = null) {
  const fresh = army.movesLeft >= movementPoints(state, army);
  if (!fresh && orderOf(army)?.turn !== state.turn) return { ok: false, reason: "Already marched this season" };
  const here = state.districts[army.districtId];
  if (kind === "rest" && here.owner !== army.factionId) return { ok: false, reason: "Rest only in your own land" };
  if (kind === "raid") {
    const targets = raidTargets(state, army);
    if (!targets.length) return { ok: false, reason: "No enemy or unclaimed land next door" };
    if (target && !targets.includes(target)) return { ok: false, reason: "Not a district you can raid" };
  }
  return { ok: true };
}

// Gives (or with kind null, cancels) an order. The army spends its movement for the season.
export function setOrder(state, armyId, kind, target = null) {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army) return { ok: false, reason: "No such army" };
  const current = orderOf(army);
  if (!kind) {
    // cancelled the season it was given: the march is still available
    if (current?.turn === state.turn) army.movesLeft = movementPoints(state, army);
    army.order = null;
    return { ok: true };
  }
  const check = canOrder(state, army, kind, target);
  if (!check.ok) return check;
  if (kind === "raid" && !target) target = raidTargets(state, army)[0];
  army.order = { kind, at: army.districtId, turn: state.turn, target: kind === "raid" ? target : null };
  army.movesLeft = 0;
  return { ok: true };
}

// ---------- End Season step 7b ----------

export function resolveOrders(state, notes) {
  const me = state.playerFactionId;
  for (const army of [...state.armies]) {
    const order = orderOf(army);
    if (!order) continue;
    if (order.kind === "dig") {
      if (!isDugIn(army)) {
        army.dugAt = army.districtId;
        if (army.factionId === me) notes.push({ level: "info", text: `${army.name} has dug in at ${state.districts[army.districtId].name}.`, districtId: army.districtId });
      }
    } else if (order.kind === "raid") {
      raid(state, army, order.target, notes);
      army.order = null; // a raid is one season's work
    }
    // rest is applied by recovery (step 7)
  }
  removeEmptyArmies(state);
}

function raid(state, army, targetId, notes) {
  const me = state.playerFactionId;
  const d = state.districts[targetId];
  const owner = d.owner;
  if (owner === army.factionId || (owner && !atWar(state, army.factionId, owner))) return; // peace was made meanwhile
  const R = O.raid;
  const defenders = armiesIn(state, targetId).filter((a) => atWar(state, a.factionId, army.factionId) || (!owner && a.factionId !== army.factionId));
  const defence = defenders.reduce((n, a) => n + armyStrength(a), 0) + (owner ? 0 : garrisonStrength(d));
  const ours = armyStrength(army);
  const raider = state.factions[army.factionId];
  const involved = army.factionId === me || owner === me;
  if (defence > ours * R.repelRatio) {
    const lost = Math.round(armyTroops(army) * R.repelledLossPct);
    lossesProportional(army, lost);
    army.morale = Math.max(0, army.morale + R.repelledMorale);
    logSeason(state, { t: "raid", army: army.id, faction: army.factionId, from: army.districtId, district: targetId, owner, repelled: true });
    if (involved) notes.push({ level: "important", text: army.factionId === me
      ? `${army.name} was driven off from ${d.name}, losing ${lost}.`
      : `Raiders of ${raider.name} were driven off from ${d.name}.`, districtId: targetId });
    return;
  }
  const scale = Math.max(0.2, Math.min(1.5, (d.prosperity ?? 50) / 50)) * Math.min(1, armyTroops(army) / R.fullPartyTroops);
  const loot = { food: Math.round(R.food * scale), wealth: Math.round(R.wealth * scale) };
  const res = raider.resources;
  const caps = storageCaps(state, army.factionId);
  res.food = Math.min(caps.food ?? Infinity, res.food + loot.food);
  res.wealth = Math.min(caps.wealth ?? Infinity, res.wealth + loot.wealth);
  if (owner && state.factions[owner]) {
    const or = state.factions[owner].resources;
    or.food = Math.max(0, or.food - Math.round(loot.food * R.ownerLosesShare));
    or.wealth = Math.max(0, or.wealth - Math.round(loot.wealth * R.ownerLosesShare));
    changeRelation(state, owner, army.factionId, R.relation);
  }
  d.prosperity = Math.max(0, (d.prosperity ?? 50) + R.prosperity);
  d.loyalty = Math.max(0, d.loyalty + R.loyalty);
  lossesProportional(army, Math.round(armyTroops(army) * R.lossPct));
  army.morale = Math.min(BALANCE.army.maxMorale, army.morale + R.successMorale);
  logSeason(state, { t: "raid", army: army.id, faction: army.factionId, from: army.districtId, district: targetId, owner, loot });
  if (army.factionId === me) {
    state.feats = { ...state.feats, raids: (state.feats?.raids || 0) + 1 };
    notes.push({ level: "important", text: `${army.name} raided ${d.name}: +${loot.food} food, +${loot.wealth} wealth.`, districtId: targetId });
    if (!state.chronicle.some((c) => /raid/i.test(c.text))) addChronicle(state, `The ${army.name} crossed into ${d.name} and came home laden with plunder.`, "BATTLE");
  } else if (owner === me) {
    notes.push({ level: "critical", text: `${raider.name} raided ${d.name}! Fields burned; ${Math.round(loot.food * R.ownerLosesShare)} food lost.`, districtId: targetId });
  }
}

// Rest: extra recovery on top of the normal season's. Called from recovery (step 7).
export function restBonus(army) {
  const o = orderOf(army);
  return o?.kind === "rest" ? O.rest : null;
}
