// simulation/season.js
// Owns End Season resolution, in the fixed order from CLAUDE.md. Steps 1 to 5 and 16 live here;
// the rest call into their own system files. No DOM; returns notifications for the UI.

import { BALANCE } from "../config/balance.js";
import { chronicleEntry, dateLabel, districtsOf, logSeason, seasonName } from "./campaign.js";
import {
  RESOURCES, armyUpkeep, districtConsumption, factionProduction, settlementTier, storageCaps,
} from "./economy.js";
import { resetMovement } from "./armies.js";
import { resolveRecovery, resolveSupply } from "./supply.js";
import { resolveOrders } from "./orders.js";
import { resolveDiplomacy, resolveTrade } from "./diplomacy.js";
import { resolveAI } from "./ai.js";
import { resolveGovernance, resolveRegions, checkEliminations } from "./governance.js";
import { resolveEvents } from "./events.js";
import { resolveRome } from "./rome.js";
import { resolveVictory } from "./victory.js";

const label = (id) => id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function endSeason(state) {
  const season = seasonName(state);
  const ctx = { season, notes: [], chronicle: [], foodStatus: {} };
  const playing = Object.keys(state.factions).filter((id) => districtsOf(state, id).length > 0);
  state.seasonLog = [];
  state.logging = true;

  resolveConstruction(state, ctx);                                  // 1
  for (const fid of playing) resolveEconomy(state, ctx, fid);       // 2 production, 3 consumption
  for (const fid of playing) resolvePopulation(state, ctx, fid);    // 4
  for (const fid of playing) resolveArmyUpkeep(state, ctx, fid);    // 5
  resolveSupply(state, ctx.notes, season);                          // 6
  resolveRecovery(state, ctx.notes);                                // 7
  resolveOrders(state, ctx.notes);                                  // 7b raids, digging in
  resolveTrade(state, ctx.notes);                                   // 8
  resolveDiplomacy(state);                                          // 9
  resolveAI(state, ctx.notes);                                      // 10
  resolveGovernance(state, ctx.notes);                              // 11
  resolveEvents(state, ctx.notes);                                  // 12
  resolveRome(state, ctx.notes);                                    // 13
  resolveRegions(state, ctx.notes);                                 // 14
  checkEliminations(state);
  resolveVictory(state, ctx.notes);
  const before = dateLabel(state);
  state.chronicle.push(...ctx.chronicle.map((t) => ({ ...chronicleEntry(state, t), date: before }))); // 15
  state.logging = false;
  advanceSeason(state);                                             // 16
  resetMovement(state);

  ctx.notes.push(note("info", `${dateLabel(state)} begins.`));
  const order = { critical: 0, important: 1, info: 2 };
  state.notifications = ctx.notes.sort((a, b) => order[a.level] - order[b.level]);
  return state.notifications;
}

// ---------- 1. Construction ----------

function resolveConstruction(state, ctx) {
  const rate = BALANCE.seasonModifiers[ctx.season].construction;
  const player = state.playerFactionId;
  for (const d of Object.values(state.districts)) {
    const still = [];
    for (const job of d.construction) {
      job.progress = round2(job.progress + rate);
      if (job.progress >= BALANCE.buildings[job.building].seasons) {
        const tierBefore = settlementTier(d).id;
        d.buildings.push(job.building);
        logSeason(state, { t: "built", district: d.id, building: job.building, faction: d.owner });
        if (d.owner === player) {
          ctx.notes.push(note("important", `${label(job.building)} completed at ${d.name}.`, d.id));
          ctx.chronicle.push(`A ${label(job.building)} was raised at ${d.name}.`);
          const tierAfter = settlementTier(d).id;
          if (tierAfter !== tierBefore) ctx.chronicle.push(`${d.name} grew into a ${label(tierAfter)}.`);
        }
      } else still.push(job);
    }
    d.construction = still;
  }
  for (const c of state.connections) {
    if (c.roadProgress === null) continue;
    c.roadProgress = round2(c.roadProgress + rate);
    if (c.roadProgress >= BALANCE.road.seasons) {
      c.road = true;
      c.roadProgress = null;
      if (c.roadOwner === player) {
        const a = state.districts[c.a].name, b = state.districts[c.b].name;
        ctx.notes.push(note("important", `Road completed: ${a} to ${b}.`, c.a));
        ctx.chronicle.push(`A road now runs from ${a} to ${b}.`);
      }
    }
  }
}

// ---------- 2 + 3. Production, consumption, storage ----------

function resolveEconomy(state, ctx, fid) {
  const f = state.factions[fid];
  const res = f.resources;
  const production = factionProduction(state, fid, ctx.season);
  for (const r of RESOURCES) res[r] += production[r];

  const consumption = districtsOf(state, fid).reduce((n, d) => n + districtConsumption(d, ctx.season), 0);
  let status = production.food >= consumption ? "surplus" : "stable";
  res.food -= consumption;
  if (res.food < 0) {
    status = "starving";
    res.food = 0;
  }

  const caps = storageCaps(state, fid);
  const wasted = {};
  for (const r of ["food", "timber", "materials"]) {
    if (res[r] > caps[r]) {
      wasted[r] = res[r] - caps[r];
      res[r] = caps[r];
    }
  }

  ctx.foodStatus[fid] = status;
  f.lastFoodStatus = status;
  f.starvingSeasons = status === "starving" ? f.starvingSeasons + 1 : 0;

  if (fid !== state.playerFactionId) return;
  if (status === "starving") {
    ctx.notes.push(note("critical", "Starvation: the granaries are empty and the people go hungry."));
    if (f.starvingSeasons === 1) ctx.chronicle.push(`Hunger gripped the ${f.name}.`);
  }
  const lost = Object.entries(wasted).map(([r, v]) => `${v} ${r}`);
  if (lost.length) ctx.notes.push(note("info", `Storage full: ${lost.join(", ")} spoiled.`));
}

// ---------- 4. Population ----------

function resolvePopulation(state, ctx, fid) {
  const g = BALANCE.populationGrowth;
  const status = ctx.foodStatus[fid];
  let rate = status === "starving" ? g.starving : status === "surplus" ? g.surplus : g.stable;
  if (ctx.season === "Winter" && status !== "starving") rate = g.winter;
  for (const d of districtsOf(state, fid)) {
    const tierBefore = settlementTier(d).id;
    const P = BALANCE.prosperity;
    const scaled = rate > 0 ? rate * (P.growthMin + ((d.prosperity ?? P.start) / 100) * P.growthSpan) : rate;
    d.population = Math.max(0, d.population + Math.round(d.population * scaled));
    const tierAfter = settlementTier(d).id;
    if (fid === state.playerFactionId && tierAfter !== tierBefore) {
      ctx.notes.push(note("important", `${d.name} is now a ${label(tierAfter)}.`, d.id));
      ctx.chronicle.push(`${d.name} ${rate > 0 ? "grew into" : "dwindled to"} a ${label(tierAfter)}.`);
    }
  }
}

// ---------- 5. Army upkeep (affordability only; supply is M4) ----------

function resolveArmyUpkeep(state, ctx, fid) {
  if (fid === "rome") return; // the legions are paid from Gaul
  const upkeep = armyUpkeep(state, fid);
  if (!upkeep.food && !upkeep.wealth) return;
  const res = state.factions[fid].resources;
  const unpaid = [];
  for (const r of ["food", "wealth"]) {
    res[r] -= upkeep[r];
    if (res[r] < 0) {
      unpaid.push(r);
      res[r] = 0;
    }
  }
  for (const a of state.armies.filter((x) => x.factionId === fid)) a.unpaid = unpaid;
  if (fid === state.playerFactionId && unpaid.length) {
    ctx.notes.push(note("critical", `Army upkeep unpaid (${unpaid.join(" and ")}): your hosts go without.`));
  }
}

// ---------- 16. Advance ----------

function advanceSeason(state) {
  state.turn += 1;
  state.seasonIndex = (state.seasonIndex + 1) % BALANCE.seasons.length;
  if (state.seasonIndex === 0) state.year += 1;
}

function note(level, text, districtId = null) {
  return { level, text, districtId };
}

const round2 = (n) => Math.round(n * 100) / 100;
