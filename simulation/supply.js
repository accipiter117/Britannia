// simulation/supply.js
// Owns supply (operational access, separate from upkeep) and army recovery: End Season steps 6
// and 7. Supply is the distance in connections from the nearest friendly district; roads carry
// supply for free along their connection, depots reach further, and armies forage in good land.

import { BALANCE } from "../config/balance.js";
import { addChronicle, armyTroops, neighbours, seasonName } from "./campaign.js";
import { connectionBetween, lossesProportional, removeEmptyArmies } from "./armies.js";
import { hasAccess } from "./diplomacy.js";

const S = BALANCE.supply;

// Distance (0, 1, 2...) from `districtId` to the nearest district that supplies `fid`.
export function supplyDistance(state, fid, districtId, season = seasonName(state)) {
  const sources = new Set();
  for (const d of Object.values(state.districts)) {
    if (!hasAccess(state, fid, d.owner)) continue;
    sources.add(d.id);
    if (d.owner === fid && d.buildings.includes("supply_depot")) {
      neighbours(state, d.id).forEach((n) => sources.add(n)); // depot: +1 range
    }
  }
  // 0-1 BFS: road connections cost 0, others 1
  const dist = { [districtId]: 0 };
  const deque = [districtId];
  let best = Infinity;
  while (deque.length) {
    const here = deque.shift();
    if (sources.has(here)) best = Math.min(best, dist[here]);
    for (const n of neighbours(state, here)) {
      const w = connectionBetween(state, here, n).road ? 0 : 1;
      const nd = dist[here] + w;
      if (dist[n] !== undefined && dist[n] <= nd) continue;
      dist[n] = nd;
      if (w === 0) deque.unshift(n); else deque.push(n);
    }
  }
  const terrain = state.districts[districtId].terrain;
  const forage = (season === "Summer" || season === "Autumn") ? S.foragingBonus[terrain] || 0 : 0;
  return Math.max(0, best - forage);
}

export function supplyState(state, army, season) {
  const d = supplyDistance(state, army.factionId, army.districtId, season);
  return S.byDistance[d] || S.states[S.states.length - 1];
}

// ---------- step 6: supply ----------

export function resolveSupply(state, notes, season) {
  const player = state.playerFactionId;
  for (const army of state.armies) {
    const st = supplyState(state, army, season);
    army.supply = st;
    const fx = S.effects[st];
    army.morale = clampMorale(army.morale + fx.morale);
    let pct = fx.attritionPct;
    if (season === "Winter") pct *= S.winterAttritionMultiplier;
    if (pct > 0) {
      const lost = Math.round(armyTroops(army) * pct);
      lossesProportional(army, lost);
      if (army.factionId === player && lost > 0) {
        notes.push({ level: st === "Starving" ? "critical" : "important", text: `${army.name} is ${st.toLowerCase()}: ${lost} lost to hunger and desertion.`, districtId: army.districtId });
      }
    }
    if (armyTroops(army) === 0) addChronicle(state, `The ${army.name} melted away for want of supply.`, army.factionId === player ? "DEFEAT" : "LOG");
  }
  removeEmptyArmies(state);
}

// ---------- step 7: recovery ----------

export function resolveRecovery(state, notes) {
  const R = BALANCE.recovery;
  for (const army of state.armies) {
    if (army.unpaid?.length) army.morale = clampMorale(army.morale - BALANCE.army.unpaidMoralePenalty);
    if (!S.effects[army.supply].recovery) continue;
    army.morale = clampMorale(army.morale + R.moralePerSeason);
    army.fatigue = Math.max(0, army.fatigue - BALANCE.army.fatigueRecoveryPerSeason);
    const d = state.districts[army.districtId];
    if (d.owner !== army.factionId) continue; // replacements only in friendly territory
    if (army.factionId === "rome") continue;  // Rome's numbers come only from reinforcements (capped)
    const res = state.factions[army.factionId].resources;
    let added = 0;
    for (const f of army.formations) {
      const gap = f.max - f.troops;
      if (gap <= 0) continue;
      const cost100 = BALANCE.recruitCostWealthPer100[f.type] ?? 0;
      let n = Math.min(gap, Math.ceil(f.max * R.replacementsPctPerSeason));
      n = Math.min(n, Math.max(0, d.population - d.basePopulation * BALANCE.workforceFloor));
      if (cost100) n = Math.min(n, Math.floor((res.wealth / cost100) * 100));
      if (n <= 0) continue;
      f.troops += n;
      d.population -= n;
      res.wealth -= Math.round((n / 100) * cost100);
      added += n;
    }
    if (added && army.factionId === state.playerFactionId) notes.push({ level: "info", text: `${army.name} took in ${added} replacements at ${d.name}.`, districtId: d.id });
  }
}

const clampMorale = (m) => Math.max(0, Math.min(BALANCE.army.maxMorale, Math.round(m)));
