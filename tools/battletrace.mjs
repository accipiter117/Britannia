// tools/battletrace.mjs
// Prints one auto-resolved battle every N seconds: each unit's position, men, morale and state.
// Usage: node tools/battletrace.mjs [scenario=field|siege] [every=15]

import { readFileSync } from "node:fs";
import { createCampaign, newArmy, newUnit } from "../simulation/state.js";
import { createBattle } from "../simulation/battle/setup.js";
import { startBattle, tick } from "../simulation/battle/engine.js";

const data = JSON.parse(readFileSync(new URL("../data/caledonia.json", import.meta.url)));
const scenario = process.argv[2] || "field", every = +process.argv[3] || 15;
const state = createCampaign(data);
const army = (faction, units) => newArmy(state, { faction, name: "x", region: "fib", general: "g", units });
const pict = army("picts", ["chieftain", "warband", "warband", "spearmen", "spearmen", "skirmishers", "horsemen", "chariots"]);
const legion = army("rome", ["legate", "legionaries", "legionaries", "legionaries", "auxilia", "auxilia", "archers", "equites", "ballista"]);
const b = scenario === "siege"
  ? createBattle({ region: { id: "t", terrain: "hills" }, attacker: { faction: "rome", armies: [legion] }, defender: { faction: "picts", armies: [], garrison: ["spearmen", "skirmishers", "spearmen"].map(newUnit) }, siege: true })
  : createBattle({ region: { id: "t", terrain: "fertile" }, attacker: { faction: "picts", armies: [pict] }, defender: { faction: "rome", armies: [legion] } });
startBattle(b);
let next = 0;
while (!b.over && b.time < 700) {
  tick(b);
  if (b.time >= next) {
    next += every;
    console.log(`--- t=${Math.round(b.time)}s plaza=${b.plazaTimer?.toFixed(0)} gate=${b.terrain.siege?.gateHp?.toFixed(0) ?? "-"}`);
    for (const u of b.units) console.log(`  ${u.side[0]} ${u.type.padEnd(12)} ${u.state.padEnd(8)} men ${Math.round(u.men).toString().padStart(3)}/${u.start} mor ${Math.round(u.morale).toString().padStart(4)} at ${Math.round(u.x)},${Math.round(u.y)} ${u.formation} ${u.order.kind} foes ${u.foes.length}`);
  }
}
console.log(b.result, b.log.map((l) => `${Math.round(l.t)}s ${l.text}`).join("\n"));
