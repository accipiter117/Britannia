// tools/campaignsim.mjs
// Plays the campaign in Node: the player either sits still or follows a simple plan (recruit,
// hold the line, counter-attack), every battle auto-resolved. Prints the map each year and
// checks the save round trip. Usage: node tools/campaignsim.mjs [seasons=40] [idle|bot] [seed]

import { readFileSync } from "node:fs";
import { createCampaign, dateLabel, deserialise, regionsOf, serialise, armyPower, neighbours } from "../simulation/state.js";
import { applyBattle, endTurn, moveArmy, pendingBattle, recruit, recruitOptions, clashAt } from "../simulation/campaign.js";
import { autoResolve } from "../simulation/battle/engine.js";

const data = JSON.parse(readFileSync(new URL("../data/caledonia.json", import.meta.url)));
const SEASONS = +process.argv[2] || 40, mode = process.argv[3] || "bot", seed = +process.argv[4] || 1;
let state = createCampaign(data, seed);
let won = 0, lost = 0;

function fight(battle) {
  autoResolve(battle);
  const r = applyBattle(state, battle);
  if (r.won === true) won++; else if (r.won === false) lost++;
}

for (let i = 0; i < SEASONS && !state.over; i++) {
  for (const p of state.pending) { const b = pendingBattle(state, p); if (b) fight(b); }
  state.pending = [];
  if (mode === "bot") {
    for (const army of state.armies.filter((a) => a.faction === "picts")) {
      // fill the ranks
      for (const t of ["warband", "spearmen", "warband", "skirmishers", "horsemen", "champions", "spearmen"]) {
        if (state.silver < 250) break;
        if (recruitOptions(state, army).find((o) => o.type === t)?.ok) recruit(state, army.id, t);
      }
      // strike a weaker neighbour
      const targets = neighbours(state, army.region).filter((n) => state.regions[n].owner !== "picts").map((n) => {
        const c = clashAt(state, "picts", n);
        const def = c ? c.armies.reduce((s, a) => s + armyPower(a), 0) + c.garrison.reduce((s, u) => s + 1, 0) * 8 * (c.siege ? 1.6 : 1) : 0;
        return { n, def };
      }).filter((t) => armyPower(army) > t.def * 1.4).sort((a, b) => a.def - b.def);
      if (targets.length && army.units.length >= 6) {
        const r = moveArmy(state, army.id, targets[0].n);
        if (r.battle) fight(r.battle);
      }
    }
  }
  endTurn(state);
  state = deserialise(serialise(state));
  if (i % 4 === 3 || state.over) {
    const own = (f) => regionsOf(state, f).map((r) => r.id).join(",");
    console.log(`${dateLabel(state).padEnd(18)} silver ${String(state.silver).padStart(4)}  picts[${own("picts")}]  rome[${own("rome")}]  armies ${state.armies.map((a) => `${a.faction[0]}:${a.region}:${a.units.length}`).join(" ")}`);
  }
}
console.log(state.over || "(no result)", `battles won ${won} lost ${lost}`);
console.log(state.log.slice(-12).map((l) => `  ${l.turn}: ${l.text}`).join("\n"));
