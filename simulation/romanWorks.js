// simulation/romanWorks.js
// Owns how Rome reshapes the board once ashore (balance.romanWorks): its engineers lay a road
// along its lines and raise a fort in a held district each season, free of cost, so Roman
// Britain spreads visibly across the map. The Celtic answer is the raid (orders.js): it burns
// works in progress in the raided district and cuts supply through it for a season.

import { BALANCE } from "../config/balance.js";
import { addChronicle, districtsOf, logSeason } from "./campaign.js";

const W = BALANCE.romanWorks;

export function resolveRomanWorks(state, notes) {
  if (state.rome.stage !== "invasion") return;
  const held = new Set(districtsOf(state, "rome").map((d) => d.id));
  if (!held.size) return;
  const me = state.playerFactionId;

  // roads: first between two Roman districts, then out to the frontier
  let roads = 0;
  const unbuilt = state.connections.filter((c) => !c.road && c.roadProgress === null && (held.has(c.a) || held.has(c.b)));
  unbuilt.sort((x, y) => (held.has(y.a) && held.has(y.b)) - (held.has(x.a) && held.has(x.b)));
  for (const c of unbuilt) {
    if (roads >= W.roadsPerSeason) break;
    if (!held.has(c.a) && !held.has(c.b)) continue;
    c.roadProgress = 0;
    c.roadOwner = "rome";
    roads++;
    const from = state.districts[held.has(c.a) ? c.a : c.b], to = state.districts[held.has(c.a) ? c.b : c.a];
    logSeason(state, { t: "works", district: from.id, what: "road", to: to.id });
    if (to.owner === me) notes.push({ level: "important", text: `Roman engineers are paving a road from ${from.name} toward ${to.name}.`, districtId: from.id });
  }

  // forts: one at a time, in the held district nearest the enemy
  const building = [...held].filter((did) => state.districts[did].construction.some((j) => j.building === "fortification")).length;
  if (building < W.fortsAtOnce) {
    const site = [...held].map((did) => state.districts[did])
      .filter((d) => !d.buildings.includes("fortification") && !d.construction.length && !d.siege)
      .sort((a, b) => frontier(state, b, held) - frontier(state, a, held))[0];
    if (site) {
      site.construction.push({ building: "fortification", progress: 0, roman: true });
      logSeason(state, { t: "works", district: site.id, what: "fort" });
      addChronicle(state, `Roman engineers began a fort at ${site.name}.`, "INVASION");
      notes.push({ level: "important", text: `Rome is raising a fort at ${site.name}. Raid it before the walls are up.`, districtId: site.id });
    }
  }
}

// How exposed a district is: neighbours held by someone else.
function frontier(state, d, held) {
  return state.connections.filter((c) => (c.a === d.id && !held.has(c.b)) || (c.b === d.id && !held.has(c.a))).length;
}

// Raids burn what is being built and cut supply through the district for a while.
export function burnWorks(state, districtId, raider) {
  const d = state.districts[districtId];
  const burned = [];
  if (d.construction.length) { burned.push(...d.construction.map((j) => j.building)); d.construction = []; }
  for (const c of state.connections) {
    if ((c.a === districtId || c.b === districtId) && c.roadProgress !== null) { c.roadProgress = null; c.roadOwner = null; burned.push("road"); }
  }
  d.disruptedUntil = state.turn + W.disruptSeasons;
  if (burned.length && d.owner === "rome") addChronicle(state, `Raiders of the ${state.factions[raider].name} burned the Roman works at ${d.name}.`, "HISTORICAL_DIVERGENCE");
  return burned;
}

export function isDisrupted(state, d) {
  return (d.disruptedUntil ?? -1) >= state.turn;
}
