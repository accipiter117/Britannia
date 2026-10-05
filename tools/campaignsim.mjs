// tools/campaignsim.mjs
// Plays a campaign in Node with every battle auto-resolved: the player either sits still or
// follows a simple plan (fill the hosts, win over weak neighbours, strike Roman land it can beat).
// Prints the map each year and round-trips the save. Usage:
//   node tools/campaignsim.mjs [seasons=40] [idle|bot] [era=caratacus] [difficulty=normal] [seed=1]

import { readFileSync } from "node:fs";
import { armyPower, createCampaign, dateLabel, deserialise, neighbours, regionsOf, serialise, garrisonPower } from "../simulation/state.js";
import { applyBattle, clashAt, decideCapture, endTurn, moveArmy, pendingBattle, recruit, recruitOptions } from "../simulation/campaign.js";
import { autoResolve } from "../simulation/battle/engine.js";

const data = JSON.parse(readFileSync(new URL("../data/britannia.json", import.meta.url)));
const [SEASONS, mode, era, difficulty, seed] = [+process.argv[2] || 40, process.argv[3] || "bot", process.argv[4] || "caratacus", process.argv[5] || "normal", +process.argv[6] || 1];
let state = createCampaign(data, { era, difficulty, seed });
let won = 0, lost = 0;

function fight(battle) {
  autoResolve(battle);
  const r = applyBattle(state, battle);
  if (r.won === true) won++; else if (r.won === false) lost++;
  if (state.capture) decideCapture(state, state.capture.from === "rome" ? "plunder" : "peace");
}

for (let i = 0; i < SEASONS && !state.over; i++) {
  for (const p of state.pending) { const b = pendingBattle(state, p); if (b) fight(b); }
  state.pending = [];
  if (mode === "bot") {
    for (const army of state.armies.filter((a) => a.faction === "celts")) {
      for (const t of ["warriors", "spearmen", "warriors", "slingers", "horsemen", "champions", "warriors"]) {
        if (state.silver < 120) break;
        if (recruitOptions(state, army).find((o) => o.type === t)?.ok) recruit(state, army.id, t);
      }
      const targets = neighbours(state, army.region).filter((n) => state.regions[n].owner !== "celts").map((n) => {
        const c = clashAt(state, "celts", n);
        const def = c ? c.armies.reduce((s, a) => s + armyPower(a), 0) + garrisonPower({ walls: c.siege, garrison: c.garrison }) : 0;
        return { n, def, roman: state.regions[n].owner === "rome" };
      }).filter((t) => armyPower(army) > t.def * 1.3).sort((a, b) => b.roman - a.roman || a.def - b.def);
      if (targets.length && army.units.length >= 6) {
        const r = moveArmy(state, army.id, targets[0].n);
        if (r.battle) fight(r.battle);
        else if (r.capture) decideCapture(state, "peace");
      }
    }
  }
  endTurn(state);
  state = deserialise(serialise(state));
  if (i % 4 === 3 || state.over) {
    const own = (f) => regionsOf(state, f).length;
    console.log(`${dateLabel(state).padEnd(18)} silver ${String(state.silver).padStart(4)} wheat ${String(state.wheat).padStart(4)}  britons ${own("celts")} rome ${own("rome")} free ${own("free")}  hosts ${state.armies.map((a) => `${a.faction[0]}:${a.region}:${a.units.length}:${a.food ?? ""}`).join(" ")}`);
  }
}
console.log(state.over || "(no result)", `battles won ${won} lost ${lost}`);
console.log(state.log.slice(-10).map((l) => `  ${l.turn}: ${l.text}`).join("\n"));
