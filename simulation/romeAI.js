// simulation/romeAI.js
// Owns Rome's campaign each season: reinforcing its armies while Eboracum holds, landing new
// armies (a governor's great push on set seasons), and moving: weak armies fall back to a fort to
// recover; strong ones attack the best neighbouring region they can beat (walls count), or march
// toward the frontier. Attacks on the Picts are queued for the player in state.pending; attacks on
// the free tribes are fought out of sight.

import { BALANCE } from "../config/balance.js";
import { armyPower, garrisonPower, log, neighbours, newArmy, newUnit } from "./state.js";
import { clashAt, resolveAutoClash } from "./campaign.js";

const R = BALANCE.rome;

export function resolveRome(state, notes) {
  const rome = () => state.armies.filter((a) => a.faction === "rome");
  const eboracum = state.regions.eboracum;

  // reinforcements and new armies come up the road from Eboracum
  if (eboracum.owner === "rome") {
    if (state.turn % R.reinforceEvery === 0) {
      for (const a of rome()) {
        const template = a.units.length >= R.vexillationTemplate.length ? R.legionTemplate : R.vexillationTemplate;
        const need = {}, have = {};
        for (const t of template) need[t] = (need[t] || 0) + 1;
        for (const u of a.units) have[u.type] = (have[u.type] || 0) + 1;
        const missing = Object.keys(need).find((t) => (have[t] || 0) < need[t]);
        if (missing && a.units.length < BALANCE.maxUnitsPerArmy) a.units.push(newUnit(missing));
      }
    }
    const push = R.campaignSeasons.includes(state.turn);
    if ((push || state.turn % R.newArmyEvery === 0) && rome().length < R.maxArmies && !state.armies.some((a) => a.region === "eboracum" && a.faction !== "rome")) {
      const army = newArmy(state, { faction: "rome", name: push ? `Legio ${["II Adiutrix", "XX Valeria", "VI Victrix", "II Augusta"][state.rome.armiesRaised % 4]}` : "Vexillatio", region: "eboracum", general: ["Agricola", "Lollius", "Severus", "Urbicus"][state.rome.armiesRaised % 4], units: push ? R.legionTemplate : R.vexillationTemplate });
      state.rome.armiesRaised++;
      army.moves = 0;
      state.armies.push(army);
      log(state, push ? `A new governor lands a fresh legion at Eboracum: ${army.name}.` : "Roman reinforcements march north from Eboracum.", "bad");
      notes.push(push ? `Rome launches a great campaign: ${army.name} lands at Eboracum.` : "Roman reinforcements arrive at Eboracum.");
    }
  }

  const templatePower = (a) => armyPower({ units: R.vexillationTemplate.map(newUnit) }) * (a.units.length >= R.legionTemplate.length - 2 ? 1.6 : 1);
  for (const army of rome().sort((p, q) => armyPower(q) - armyPower(p))) {
    if (!state.armies.includes(army) || army.moves <= 0) continue;
    const power = armyPower(army);
    // battered: fall back to the nearest fort and rebuild
    if (power < templatePower(army) * 0.45 && state.regions[army.region].owner === "rome") continue;
    if (power < templatePower(army) * 0.45) {
      const back = neighbours(state, army.region).find((n) => state.regions[n].owner === "rome");
      if (back) army.region = back;
      continue;
    }
    // the best region next door that we can take
    let best = null;
    for (const n of neighbours(state, army.region)) {
      const r = state.regions[n];
      if (r.owner === "rome" && !state.armies.some((a) => a.region === n && a.faction !== "rome")) continue;
      const enemies = state.armies.filter((a) => a.region === n && a.faction !== "rome");
      const defence = enemies.reduce((s, a) => s + armyPower(a), 0) + (r.owner !== "rome" ? garrisonPower(r) : 0);
      const ratio = r.walls ? R.attackRatio * 1.15 : R.attackRatio;
      if (power < defence * ratio) continue;
      const value = (r.owner === "picts" ? 3 : 1) + (r.capital ? 2 : 0) + (r.settlement === "oppidum" ? 1 : 0) - defence / Math.max(1, power);
      if (!best || value > best.value) best = { id: n, value };
    }
    if (best) {
      army.moves = 0;
      const clash = clashAt(state, "rome", best.id);
      if (!clash) { army.region = best.id; take(state, best.id); continue; }
      if (clash.defenderFaction === "picts") {
        state.pending.push({ attackerIds: [army.id], regionId: best.id });
        notes.push(`${army.name} marches on ${state.regions[best.id].name}!`);
      } else resolveAutoClash(state, [army], clash);
      continue;
    }
    // nothing to take next door: march toward the frontier through Roman land
    const step = towardFrontier(state, army.region);
    if (step && state.regions[step].owner === "rome") { army.region = step; army.moves = 0; }
  }
}

function take(state, regionId) {
  const r = state.regions[regionId];
  if (r.owner === "rome") return;
  log(state, `Rome took ${r.name}.`, r.owner === "picts" ? "bad" : "info");
  r.owner = "rome";
  r.garrison = [];
  r.heldSince = state.turn;
  if (!r.walls) r.fortAt = state.turn + R.buildFortSeasons;
}

// First step on the shortest path from `from` to any region Rome does not hold.
function towardFrontier(state, from) {
  const prev = { [from]: null };
  const queue = [from];
  while (queue.length) {
    const here = queue.shift();
    if (state.regions[here].owner !== "rome") {
      let step = here;
      while (prev[step] && prev[step] !== from) step = prev[step];
      return step;
    }
    for (const n of neighbours(state, here)) if (!(n in prev)) { prev[n] = here; queue.push(n); }
  }
  return null;
}
