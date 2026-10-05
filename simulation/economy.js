// simulation/economy.js
// Owns the district economy: production, consumption, storage, workforce, settlement tiers,
// buildings, roads and construction orders. Pure functions over campaign state; no DOM.

import { BALANCE } from "../config/balance.js";
import { districtsOf, seasonName } from "./campaign.js";

export const RESOURCES = ["food", "timber", "materials", "wealth"];

const zero = () => ({ food: 0, timber: 0, materials: 0, wealth: 0 });

// ---------- Settlement and slots ----------

export function settlementTier(district) {
  let tier = BALANCE.settlementTiers[0];
  for (const t of BALANCE.settlementTiers) {
    const reqOk = (t.requires || []).every((b) => district.buildings.includes(b));
    if (district.population >= t.minPop && reqOk) tier = t;
  }
  return tier;
}

export function totalSlots(district) {
  return BALANCE.developmentSlots[BALANCE.districtDevelopment[district.id]] ?? BALANCE.developmentSlots.normal;
}

export function usedSlots(district) {
  return district.buildings.length + district.construction.length;
}

// ---------- Workforce ----------

export function workforce(district) {
  return Math.round(district.population * BALANCE.workforceShare);
}

// Production scales down only when population falls below its starting level (e.g. after recruitment).
export function workforceMultiplier(district) {
  const ratio = district.population / district.basePopulation;
  return Math.max(BALANCE.workforceFloor, Math.min(1, ratio));
}

// ---------- Production ----------

// Returns { total, base, buildings, seasonMult, workforceMult } for the given season (defaults to current).
export function districtProduction(state, district, season = seasonName(state)) {
  const base = { ...zero(), ...pick(BALANCE.terrainProduction[district.terrain]) };
  for (const s of district.special) addInto(base, pick(BALANCE.specialBonuses[s] || {}));

  const fromBuildings = zero();
  for (const b of district.buildings) addInto(fromBuildings, pick(BALANCE.buildings[b].effect));

  const mod = BALANCE.seasonModifiers[season];
  const wf = workforceMultiplier(district);
  const total = zero();
  for (const r of RESOURCES) {
    const seasonMult = r === "food" ? mod.foodProduction : mod.production;
    total[r] = Math.round((base[r] + fromBuildings[r]) * seasonMult * wf);
  }
  return { total, base, buildings: fromBuildings, seasonMult: { food: mod.foodProduction, other: mod.production }, workforceMult: wf };
}

export function factionProduction(state, factionId, season) {
  const sum = zero();
  for (const d of districtsOf(state, factionId)) addInto(sum, districtProduction(state, d, season).total);
  return sum;
}

// ---------- Consumption and upkeep ----------

export function districtConsumption(district, season) {
  const perSeason = (district.population / 1000) * BALANCE.foodPer1000Pop;
  const mult = season === "Winter" ? BALANCE.winterConsumptionMultiplier : 1;
  return Math.round(perSeason * mult);
}

export function factionConsumption(state, factionId, season = seasonName(state)) {
  return districtsOf(state, factionId).reduce((n, d) => n + districtConsumption(d, season), 0);
}

export function armyUpkeep(state, factionId) {
  const upkeep = { food: 0, wealth: 0 };
  for (const army of state.armies.filter((a) => a.factionId === factionId)) {
    for (const f of army.formations) {
      const cost = BALANCE.formations[f.type];
      upkeep.food += Math.round((f.troops / 100) * cost.food);
      upkeep.wealth += Math.round((f.troops / 100) * cost.wealth);
    }
  }
  return upkeep;
}

// ---------- Storage ----------

// Food storage is per district: a Granary raises that district's share. Based on non-Winter consumption.
export function foodStorageCap(state, factionId) {
  return districtsOf(state, factionId).reduce((n, d) => {
    const mult = d.buildings.includes("granary") ? BALANCE.granaryStorageMultiplier : BALANCE.storageMultiplier;
    return n + Math.round(districtConsumption(d, "Spring") * mult);
  }, 0);
}

export function timberMaterialsCap(state, factionId) {
  const owned = districtsOf(state, factionId);
  const buildings = owned.reduce((n, d) => n + d.buildings.length, 0);
  return owned.length * BALANCE.timberMaterialsStorageBase + buildings * BALANCE.timberMaterialsStoragePerBuilding;
}

export function storageCaps(state, factionId) {
  const tm = timberMaterialsCap(state, factionId);
  return { food: foodStorageCap(state, factionId), timber: tm, materials: tm, wealth: Infinity };
}

// ---------- Forecast (what End Season will do this season) ----------

export function forecast(state, factionId) {
  const season = seasonName(state);
  const production = factionProduction(state, factionId, season);
  const consumption = factionConsumption(state, factionId, season);
  const upkeep = armyUpkeep(state, factionId);
  const net = { ...production };
  net.food -= consumption + upkeep.food;
  net.wealth -= upkeep.wealth;
  const food = state.factions[factionId].resources.food;
  const famine = food + net.food < 0;
  return { season, production, consumption, upkeep, net, famine };
}

// ---------- Buildings and construction ----------

export function buildingCost(state, factionId, cost) {
  const hasWorkshop = districtsOf(state, factionId).some((d) => d.buildings.includes("workshop"));
  const mult = hasWorkshop ? BALANCE.buildings.workshop.effect.constructionCostMultiplier : 1;
  const out = {};
  for (const [r, v] of Object.entries(cost)) out[r] = Math.round(v * mult);
  return out;
}

function shortfall(state, factionId, cost) {
  const res = state.factions[factionId].resources;
  return Object.entries(cost).filter(([r, v]) => res[r] < v).map(([r, v]) => `${v - res[r]} more ${cap(r)}`);
}

// Returns { ok, reason, cost } so the UI can show every option, greyed with a reason when unavailable.
export function canBuild(state, factionId, districtId, buildingId) {
  const d = state.districts[districtId];
  const def = BALANCE.buildings[buildingId];
  const cost = buildingCost(state, factionId, def.cost);
  const fail = (reason) => ({ ok: false, reason, cost });
  if (d.owner !== factionId) return fail("Not your district");
  if (def.requiresTerrain && !def.requiresTerrain.includes(d.terrain)) return fail(`Requires ${def.requiresTerrain.join(" or ")} terrain`);
  const count = d.buildings.filter((b) => b === buildingId).length + d.construction.filter((c) => c.building === buildingId).length;
  if (def.maxPerDistrict && count >= def.maxPerDistrict) return fail("Already built here");
  if (usedSlots(d) >= totalSlots(d)) return fail("No free development slots");
  const short = shortfall(state, factionId, cost);
  if (short.length) return fail(`Need ${short.join(", ")}`);
  return { ok: true, reason: null, cost };
}

export function startBuilding(state, factionId, districtId, buildingId) {
  const check = canBuild(state, factionId, districtId, buildingId);
  if (!check.ok) return check;
  pay(state, factionId, check.cost);
  state.districts[districtId].construction.push({ building: buildingId, progress: 0 });
  return check;
}

export function canBuildRoad(state, factionId, connectionIndex) {
  const c = state.connections[connectionIndex];
  const cost = buildingCost(state, factionId, BALANCE.road.cost);
  const fail = (reason) => ({ ok: false, reason, cost });
  const ownA = state.districts[c.a].owner === factionId;
  const ownB = state.districts[c.b].owner === factionId;
  if (!ownA && !ownB) return fail("Must own one end");
  if (c.road) return fail("Road already built");
  if (c.roadProgress !== null) return fail("Under construction");
  const short = shortfall(state, factionId, cost);
  if (short.length) return fail(`Need ${short.join(", ")}`);
  return { ok: true, reason: null, cost };
}

export function startRoad(state, factionId, connectionIndex) {
  const check = canBuildRoad(state, factionId, connectionIndex);
  if (!check.ok) return check;
  pay(state, factionId, check.cost);
  const c = state.connections[connectionIndex];
  c.roadProgress = 0;
  c.roadOwner = factionId;
  return check;
}

// ---------- helpers ----------

function pay(state, factionId, cost) {
  const res = state.factions[factionId].resources;
  for (const [r, v] of Object.entries(cost)) res[r] -= v;
}

function pick(obj) {
  const out = {};
  for (const r of RESOURCES) if (typeof obj[r] === "number") out[r] = obj[r];
  return out;
}

function addInto(target, src) {
  for (const [k, v] of Object.entries(src)) target[k] = (target[k] || 0) + v;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
