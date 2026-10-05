// simulation/romeAI.js
// Owns Rome's campaign each season. While Rome holds its port it brings men across the sea:
// replacements for its armies and, now and then, a fresh legion. Each army then attacks the best
// neighbouring region it can beat (walls count; the Britons are the prize), or marches toward the
// frontier, or falls back to rebuild when battered. Attacks on the player are queued in
// state.pending for the player to fight; attacks on free tribes are fought out of sight.

import { BALANCE } from "../config/balance.js";
import { armyPower, garrisonPower, log, neighbours, newUnit, romanArmy } from "./state.js";
import { clashAt, resolveAutoClash } from "./campaign.js";

const R = BALANCE.rome;

export function resolveRome(state, notes) {
  const D = BALANCE.difficulty[state.difficulty];
  const rome = () => state.armies.filter((a) => a.faction === "rome");
  const port = state.regions[state.rome.port];
  const holdsPort = port?.owner === "rome";
  const romanLand = Object.values(state.regions).filter((r) => r.owner === "rome");

  if (holdsPort || romanLand.length) {
    // replacements march up from the coast
    if (state.turn % R.reinforceEvery === 0) {
      for (const a of rome()) {
        const template = a.units.length >= R.vexillation.length + 1 ? R.legion : R.vexillation;
        const need = {}, have = {};
        for (const t of template) need[t] = (need[t] || 0) + 1;
        for (const u of a.units) have[u.type] = (have[u.type] || 0) + 1;
        const missing = Object.keys(need).find((t) => (have[t] || 0) < need[t]);
        if (missing && a.units.length < BALANCE.maxUnitsPerArmy) a.units.push(newUnit(missing));
      }
    }
    // a fresh legion from Gaul, landing at the port (or the nearest Roman land)
    const every = Math.round(R.newArmyEvery * D.romeEvery);
    if (state.turn % every === 0 && rome().length < R.maxArmies) {
      const where = holdsPort ? port.id : romanLand[0]?.id;
      if (where && !state.armies.some((a) => a.region === where && a.faction !== "rome")) {
        const army = romanArmy(state, where, ["Plautius", "Ostorius", "Frontinus", "Agricola", "Cerialis"][state.rome.landed % 5], state.rome.landed % 2 ? "vexillation" : "legion");
        army.moves = 0;
        state.armies.push(army);
        log(state, `Fresh troops from Gaul: ${army.name} lands in ${state.regions[where].name}.`, "bad");
        notes.push(`${army.name} lands in ${state.regions[where].name}.`);
      }
    }
  }

  // Rome gives the Britons their first season to gather, and takes at most one free tribe a season:
  // the legions are hunting the war-leaders, not every hill farm.
  let freeTaken = state.turn < 2 ? 1 : 0;
  for (const army of rome().sort((p, q) => armyPower(q) - armyPower(p))) {
    if (!state.armies.includes(army) || army.moves <= 0) continue;
    if (state.turn < 2) continue;
    const power = armyPower(army);
    const full = armyPower({ units: R.vexillation.map((t) => newUnit(t)) });
    // battered: hold in Roman land and rebuild
    if (power < full * 0.5) {
      if (state.regions[army.region].owner !== "rome") {
        const back = neighbours(state, army.region).find((n) => state.regions[n].owner === "rome");
        if (back) { army.region = back; army.moves = 0; }
      }
      continue;
    }
    let best = null;
    for (const n of neighbours(state, army.region)) {
      const r = state.regions[n];
      if (r.owner === "rome" && !state.armies.some((a) => a.region === n && a.faction !== "rome")) continue;
      if (r.owner === "free" && freeTaken && !state.armies.some((a) => a.region === n)) continue;
      const enemies = state.armies.filter((a) => a.region === n && a.faction !== "rome");
      const defence = enemies.reduce((s, a) => s + armyPower(a), 0) + (r.owner !== "rome" ? garrisonPower(r) : 0);
      if (power < defence * R.attackRatio * (r.walls ? 1.15 : 1)) continue;
      const value = (r.owner === "celts" ? 3 : 1) + (r.settlement === "oppidum" ? 1 : 0) + (enemies.length ? 1 : 0) - defence / Math.max(1, power);
      if (!best || value > best.value) best = { id: n, value };
    }
    if (best) {
      army.moves = 0;
      if (state.regions[best.id].owner === "free") freeTaken++;
      const clash = clashAt(state, "rome", best.id);
      if (!clash) {
        army.region = best.id;
        const r = state.regions[best.id];
        if (r.owner !== "rome") {
          const was = r.owner;
          r.owner = "rome"; r.garrison = []; r.unrest = 0;
          if (!r.walls) r.fortAt = state.turn + R.fortAfter;
          log(state, `Rome took ${r.name}${was === "celts" ? " from you" : ""}.`, was === "celts" ? "bad" : "info");
        }
        continue;
      }
      if (clash.defenderFaction === "celts") {
        state.pending.push({ attackerIds: [army.id], regionId: best.id });
        notes.push(`${army.name} marches on ${state.regions[best.id].name}!`);
      } else resolveAutoClash(state, [army], clash);
      continue;
    }
    const step = towardFrontier(state, army.region);
    if (step && state.regions[step].owner === "rome") { army.region = step; army.moves = 0; }
  }
}

// First step on the shortest path to a region Rome does not hold, preferring the Britons'.
function towardFrontier(state, from) {
  const prev = { [from]: null };
  const queue = [from];
  let fallback = null;
  while (queue.length) {
    const here = queue.shift();
    const r = state.regions[here];
    if (r.owner !== "rome") {
      if (r.owner === "celts" || state.armies.some((a) => a.region === here && a.faction === "celts")) return firstStep(prev, from, here);
      fallback ||= here;
    }
    for (const n of neighbours(state, here)) if (!(n in prev)) { prev[n] = here; queue.push(n); }
  }
  return fallback ? firstStep(prev, from, fallback) : null;
}

function firstStep(prev, from, to) {
  let step = to;
  while (prev[step] && prev[step] !== from) step = prev[step];
  return step;
}
