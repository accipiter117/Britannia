// simulation/settlements.js
// Owns how your tribes grow, as cities do in Civilization: people (`pop`) make silver, wheat and
// work; growth fills each season outside winter; work builds one thing at a time from the list in
// config/balance.js `buildings`. Rome's and the free tribes' lands keep their people but do not grow.
// No DOM; used by campaign.js at the end of each season and by the region panel.

import { BALANCE } from "../config/balance.js";
import { garrisonFor } from "./state.js";

const S = BALANCE.settlements, BUILD = BALANCE.buildings;

export const has = (r, id) => r.buildings.includes(id);
export function maxPop(r) {
  return (S.maxPop[r.settlement] ?? 5) + (has(r, "shrine") ? BUILD.shrine.maxPop : 0);
}
export const growthNeed = (r) => r.pop + S.growthNeedBase;
export function growthRate(r) {
  return S.growth + (has(r, "granary") ? BUILD.granary.growth : 0);
}
const calm = (r) => (r.unrest ? 0.5 : 1);

export function silverOf(r) {
  return Math.round((S.silverBase + r.pop * S.silverPerPop) * (has(r, "market") ? 1 + BUILD.market.silver : 1) * calm(r));
}
// wheat for one harvest unit (the season multiplies it)
export function wheatOf(r) {
  return r.pop * S.wheatPerPop * (has(r, "granary") ? 1 + BUILD.granary.wheat : 1) * calm(r) + (has(r, "harbour") ? BUILD.harbour.fish : 0);
}
export function workOf(r) {
  return Math.max(1, Math.round((S.workBase + r.pop * S.workPerPop) * calm(r)));
}

// What this tribe could build now, and why not when it can't.
export function buildOptions(r) {
  return Object.entries(BUILD).filter(([id]) => !has(r, id)).map(([id, b]) => {
    let reason = null;
    if (b.needs === "coast" && !r.coastal) reason = "Needs a coast";
    else if (b.needs === "noWalls" && r.walls) reason = "Already walled";
    else if (b.needs === "village" && r.settlement !== "village") reason = "Already a stronghold";
    else if (b.minPop && r.pop < b.minPop) reason = `Needs ${b.minPop} people`;
    return { id, name: b.name, desc: b.desc, work: b.work, seasons: Math.ceil(Math.max(0, b.work - (r.build === id ? r.progress : 0)) / workOf(r)), ok: !reason, reason };
  });
}

export const growthWheatCost = (r) => (r.pop + 1) * S.growthWheat;

// Silver to finish the current building at once (Civilization's "buy").
export function rushCost(r) {
  if (!r.build) return null;
  return Math.max(1, Math.ceil((BUILD[r.build].work - r.progress) * S.rushSilver));
}
export function rush(state, regionId) {
  const r = state.regions[regionId];
  const cost = rushCost(r);
  if (cost == null) return { ok: false, reason: "Nothing is being built" };
  if (state.silver < cost) return { ok: false, reason: `Needs ${cost} silver` };
  state.silver -= cost;
  const name = BUILD[r.build].name;
  finish(r, r.build);
  r.build = null; r.progress = 0;
  return { ok: true, name };
}

export function setBuild(state, regionId, id) {
  const r = state.regions[regionId];
  const opt = buildOptions(r).find((o) => o.id === id);
  if (!opt?.ok) return { ok: false, reason: opt?.reason || "Cannot build that" };
  if (r.build !== id) { r.build = id; r.progress = 0; }
  return { ok: true };
}

function finish(r, id) {
  r.buildings.push(id);
  if (id === "palisade") r.walls = true;
  if (id === "hillfort") { r.settlement = "oppidum"; r.walls = true; r.garrison = garrisonFor("celts", "oppidum"); }
}

// The season's growth and building for every tribe you hold. Returns short notes for the player.
export function growSettlements(state, season, ownerId = "celts") {
  const notes = [];
  for (const r of Object.values(state.regions)) {
    if (r.owner !== ownerId) continue;
    if (season !== "Winter" && r.pop < maxPop(r)) {
      r.growth += growthRate(r);
      // a new family needs feeding: growth draws on the granary, and waits if it is empty
      const cost = growthWheatCost(r);
      if (r.growth >= growthNeed(r) && state.wheat >= cost) { state.wheat -= cost; r.growth = 0; r.pop += 1; notes.push(`${r.name} grows to ${r.pop}.`); }
      else r.growth = Math.min(r.growth, growthNeed(r));
    }
    if (r.build) {
      r.progress += workOf(r);
      const b = BUILD[r.build];
      if (r.progress >= b.work) {
        finish(r, r.build);
        notes.push(`${b.name} finished in ${r.name}.`);
        r.build = null; r.progress = 0;
      }
    }
  }
  return notes;
}

// Fill in settlement fields on a region (new campaigns and older saves).
export function initSettlement(r) {
  r.pop ??= S.startPop[r.settlement] ?? 2;
  r.growth ??= 0;
  r.buildings ??= [];
  r.build ??= null;
  r.progress ??= 0;
  if (r.walls && r.settlement === "village" && !r.buildings.includes("palisade")) r.buildings.push("palisade");
}
