// simulation/armies.js
// Owns armies on the campaign map: strength, movement points and costs, reachable districts,
// moving, stances, recruitment and military capacity, merging, and what each faction can see.
// Moving into a hostile district does not fight here: it returns an engagement (see engagement.js).

import { BALANCE } from "../config/balance.js";
import { armiesIn, armyTroops, districtsOf, logSeason, neighbours, newArmy, seasonName, uid } from "./campaign.js";
import { settlementTier } from "./economy.js";
import { atWar, hasAccess } from "./diplomacy.js";
import { captureDistrict } from "./governance.js";

const M = BALANCE.movement;

// ---------- strength ----------

export function armyStrength(army) {
  const exp = BALANCE.battle.experience[army.experience].power;
  const cmd = BALANCE.battle.commander[army.commander];
  return army.formations.reduce((n, f) => n + (f.troops / 100) * BALANCE.formations[f.type].strength, 0) * exp * cmd;
}

export function garrisonStrength(district) {
  return district.garrison ? (district.garrison.levies / 100) * BALANCE.formations.levies.strength : 0;
}

// ---------- movement ----------

export function movementPoints(state, army, season = seasonName(state)) {
  const base = Math.round(M.basePoints * BALANCE.seasonModifiers[season].movement);
  return base + (army.stance === "Forced March" ? M.forcedMarch.bonusPoints : 0);
}

export function connectionBetween(state, a, b) {
  return state.connections.find((c) => (c.a === a && c.b === b) || (c.a === b && c.b === a));
}

export function enterCost(state, from, to) {
  if (connectionBetween(state, from, to)?.road) return M.terrainCost.road;
  const d = state.districts[to];
  return M.terrainCost[d.terrain] + (d.special.includes("river") ? M.riverCrossingExtra : 0);
}

// What happens if `army` steps into `districtId`: "move", "attack" (an engagement), or "blocked".
export function entryKind(state, army, districtId) {
  const fid = army.factionId;
  const d = state.districts[districtId];
  const enemies = armiesIn(state, districtId).filter((a) => a.factionId !== fid && atWar(state, fid, a.factionId));
  if (enemies.length) return { kind: "attack" };
  if (d.owner === fid || hasAccess(state, fid, d.owner)) return { kind: "move" };
  if (!d.owner) return d.garrison ? { kind: "attack" } : { kind: "move" };
  if (atWar(state, fid, d.owner)) return { kind: "attack" };
  return { kind: "blocked", reason: `Needs war or military access with ${state.factions[d.owner].name}` };
}

// Dijkstra over connections within the army's remaining movement. A step that costs more than
// what is left is still allowed as the army's first step of the season, so no army is ever stuck.
export function reachable(state, army) {
  const full = movementPoints(state, army);
  const start = army.districtId;
  const best = { [start]: { cost: 0, path: [start], kind: "start" } };
  const queue = [start];
  while (queue.length) {
    queue.sort((a, b) => best[a].cost - best[b].cost);
    const here = queue.shift();
    if (best[here].kind === "attack") continue; // engagements end movement
    for (const next of neighbours(state, here)) {
      const step = enterCost(state, here, next);
      const cost = best[here].cost + step;
      const firstStep = here === start && army.movesLeft === full;
      if (cost > army.movesLeft && !(firstStep && army.movesLeft > 0)) continue;
      const entry = entryKind(state, army, next);
      if (entry.kind === "blocked") {
        if (!best[next]) best[next] = { cost, path: [...best[here].path, next], kind: "blocked", reason: entry.reason };
        continue;
      }
      if (best[next] && best[next].kind !== "blocked" && best[next].cost <= cost) continue;
      best[next] = { cost: Math.min(cost, army.movesLeft), path: [...best[here].path, next], kind: entry.kind };
      queue.push(next);
    }
  }
  delete best[start];
  return best;
}

// Moves the army along its cheapest path. Returns { ok, engagement? }. For an attack the army
// stops in the district before the target; the engagement decides what happens next.
export function moveArmy(state, armyId, targetId) {
  const army = state.armies.find((a) => a.id === armyId);
  const route = reachable(state, army)[targetId];
  if (!route || route.kind === "blocked") return { ok: false, reason: route?.reason || "Out of reach this season" };
  if (army.stance === "Forced March" && army.movesLeft === movementPoints(state, army)) {
    army.fatigue = Math.min(100, army.fatigue + M.forcedMarch.fatigue);
    army.morale = Math.max(0, army.morale - M.forcedMarch.moralePenalty);
  }
  const path = route.path;
  const stopAt = route.kind === "attack" ? path.length - 2 : path.length - 1;
  logSeason(state, { t: "move", army: army.id, faction: army.factionId, path: path.slice(0, stopAt + 1), target: route.kind === "attack" ? targetId : null,
    snapshot: { name: army.name, factionId: army.factionId, formations: army.formations.map((f) => ({ ...f })), movesLeft: 0, supply: army.supply, stance: army.stance } });
  army.districtId = path[stopAt];
  army.movesLeft = Math.max(0, army.movesLeft - route.cost);
  army.order = null;
  if (route.kind === "attack") {
    army.movesLeft = 0;
    return { ok: true, engagement: { attackerFactionId: army.factionId, armyIds: [army.id], fromId: path[stopAt], districtId: targetId } };
  }
  // an empty, unclaimed district is claimed by walking in
  const d = state.districts[targetId];
  if (!d.owner && !d.garrison) captureDistrict(state, targetId, army.factionId);
  return { ok: true };
}

export function setStance(state, armyId, stance) {
  const army = state.armies.find((a) => a.id === armyId);
  const wasForced = army.stance === "Forced March";
  army.stance = stance;
  // Forced March grants its bonus point only while the stance is held and before moving
  if (stance === "Forced March" && !wasForced && army.movesLeft === movementPoints(state, { ...army, stance: "Normal" })) army.movesLeft += M.forcedMarch.bonusPoints;
  if (wasForced && stance !== "Forced March") army.movesLeft = Math.max(0, army.movesLeft - M.forcedMarch.bonusPoints);
}

// ---------- recruitment ----------

export function militaryCapacity(state, fid) {
  return districtsOf(state, fid).reduce((n, d) => n + settlementTier(d).militaryCapacity +
    d.buildings.reduce((m, b) => m + (BALANCE.buildings[b].effect.militaryCapacity || 0), 0), 0);
}

export function professionalsInService(state, fid) {
  return state.armies.filter((a) => a.factionId === fid)
    .reduce((n, a) => n + a.formations.filter((f) => BALANCE.professionalFormations.includes(f.type)).reduce((m, f) => m + f.troops, 0), 0);
}

export function canRecruit(state, fid, districtId, type) {
  const d = state.districts[districtId];
  const batch = BALANCE.recruitBatch;
  const cost = { wealth: Math.round(BALANCE.recruitCostWealthPer100[type] * batch / 100) };
  const fail = (reason) => ({ ok: false, reason, cost });
  const def = BALANCE.formations[type];
  if (d.owner !== fid) return fail("Not your district");
  if (d.stage === "Occupied") return fail("Occupied districts will not raise troops");
  if (d.siege) return fail("Under siege: no one can reach the muster");
  if (def.romanOnly) return fail("Roman only");
  if (def.requires && !d.buildings.includes(def.requires)) return fail(`Needs a ${def.requires.replace(/_/g, " ")} here`);
  if (BALANCE.professionalFormations.includes(type) && professionalsInService(state, fid) + batch > militaryCapacity(state, fid)) {
    return fail(`Military capacity full (${militaryCapacity(state, fid)})`);
  }
  if (d.population - batch < d.basePopulation * BALANCE.workforceFloor) return fail("Too few people left to work the land");
  const here = armiesIn(state, districtId, fid);
  if (!here.length && state.armies.filter((a) => a.factionId === fid).length >= BALANCE.army.maxArmiesPerFaction) {
    return fail(`At most ${BALANCE.army.maxArmiesPerFaction} armies`);
  }
  if (state.factions[fid].resources.wealth < cost.wealth) return fail(`Need ${cost.wealth - state.factions[fid].resources.wealth} more Wealth`);
  return { ok: true, reason: null, cost };
}

// Recruiting removes people from the district (and so from its workforce).
export function recruit(state, fid, districtId, type) {
  const check = canRecruit(state, fid, districtId, type);
  if (!check.ok) return check;
  const d = state.districts[districtId];
  const batch = BALANCE.recruitBatch;
  state.factions[fid].resources.wealth -= check.cost.wealth;
  d.population -= batch;
  let army = armiesIn(state, districtId, fid)[0];
  if (!army) {
    army = newArmy(uid(state, "army"), `Host of ${d.name}`, fid, districtId, []);
    army.movesLeft = 0; // new levies need a season to muster
    state.armies.push(army);
  }
  const f = army.formations.find((x) => x.type === type);
  if (f) {
    f.troops += batch;
    f.max += batch;
  } else army.formations.push({ type, troops: batch, max: batch });
  return { ...check, armyId: army.id };
}

// Disband a batch of one formation. In your own district the troops go home to the land.
export function disband(state, armyId, type) {
  const army = state.armies.find((a) => a.id === armyId);
  const f = army?.formations.find((x) => x.type === type);
  if (!f) return { ok: false, reason: "No such formation" };
  const n = Math.min(f.troops, BALANCE.recruitBatch);
  f.troops -= n;
  f.max = Math.max(f.troops, f.max - n);
  const d = state.districts[army.districtId];
  const home = d.owner === army.factionId;
  if (home) d.population += n;
  army.formations = army.formations.filter((x) => x.troops > 0);
  removeEmptyArmies(state);
  return { ok: true, home, n };
}

// Merge `fromId` into `intoId` (same district, same faction).
export function mergeArmies(state, intoId, fromId) {
  const into = state.armies.find((a) => a.id === intoId);
  const from = state.armies.find((a) => a.id === fromId);
  if (!into || !from || into.districtId !== from.districtId || into.factionId !== from.factionId) return false;
  const total = armyTroops(into) + armyTroops(from);
  into.morale = Math.round((into.morale * armyTroops(into) + from.morale * armyTroops(from)) / Math.max(1, total));
  into.movesLeft = Math.min(into.movesLeft, from.movesLeft);
  for (const f of from.formations) {
    const g = into.formations.find((x) => x.type === f.type);
    if (g) {
      g.troops += f.troops;
      g.max += f.max;
    } else into.formations.push({ ...f });
  }
  const order = ["Poor", "Average", "Skilled", "Exceptional"];
  if (order.indexOf(from.commander) > order.indexOf(into.commander)) into.commander = from.commander;
  state.armies = state.armies.filter((a) => a.id !== fromId);
  return true;
}

// Removes troops proportionally across formations (attrition, pursuit).
export function lossesProportional(army, lost) {
  const total = armyTroops(army);
  if (total <= 0) return;
  for (const f of army.formations) f.troops = Math.max(0, f.troops - Math.round((f.troops / total) * lost));
  army.formations = army.formations.filter((f) => f.troops > 0);
}

export function removeEmptyArmies(state) {
  state.armies = state.armies.filter((a) => armyTroops(a) > 0);
}

// ---------- visibility (no omniscience) ----------

export function visibleDistricts(state, fid) {
  const seen = new Set();
  const seeds = [...districtsOf(state, fid).map((d) => d.id), ...state.armies.filter((a) => a.factionId === fid).map((a) => a.districtId)];
  for (const s of seeds) {
    let frontier = [s];
    seen.add(s);
    for (let r = 0; r < BALANCE.army.visibilityRange; r++) {
      frontier = frontier.flatMap((x) => neighbours(state, x));
      frontier.forEach((x) => seen.add(x));
    }
  }
  return seen;
}

export function visibleArmies(state, fid) {
  const seen = visibleDistricts(state, fid);
  return state.armies.filter((a) => a.factionId === fid || seen.has(a.districtId));
}

// What the player last saw of enemy hosts: kept so armies that slip out of sight remain on the
// board as "last seen" markers. Hosts seen to be gone (their district is in view) are dropped.
export function updateIntel(state, fid) {
  state.intel ||= {};
  const seen = visibleDistricts(state, fid);
  for (const a of state.armies) {
    if (a.factionId === fid || !seen.has(a.districtId)) continue;
    state.intel[a.id] = { id: a.id, factionId: a.factionId, districtId: a.districtId, troops: Math.round(armyTroops(a) / 100) * 100, turn: state.turn };
  }
  for (const [id, info] of Object.entries(state.intel)) {
    const army = state.armies.find((a) => a.id === id);
    const visibleNow = army && seen.has(army.districtId);
    if (visibleNow) continue;
    if (seen.has(info.districtId) || state.turn - info.turn > BALANCE.army.intelSeasons) delete state.intel[id];
  }
}

export function ghostsFor(state, fid) {
  const seen = visibleDistricts(state, fid);
  return Object.values(state.intel || {}).filter((g) => {
    const army = state.armies.find((a) => a.id === g.id);
    return !(army && seen.has(army.districtId)) && !seen.has(g.districtId);
  });
}

export function resetMovement(state) {
  for (const a of state.armies) a.movesLeft = movementPoints(state, a);
}
