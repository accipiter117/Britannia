// tools/battletrace.mjs
// Prints one auto-resolved battle every N seconds: each band's men, morale, stamina, state,
// position and order, plus the battle log. Usage: node tools/battletrace.mjs [field|siege] [every=10]

import { newUnit } from "../simulation/state.js";
import { createBattle } from "../simulation/battle/setup.js";
import { startBattle, tick } from "../simulation/battle/engine.js";

const scenario = process.argv[2] || "field", every = +process.argv[3] || 10;
const army = (id, faction, types) => ({ id, faction, units: types.map(newUnit) });
const celts = army("c", "celts", ["chieftain", "warriors", "warriors", "warriors", "spearmen", "spearmen", "slingers", "javelinmen", "horsemen", "chariots"]);
const legion = army("r", "rome", ["legate", "legionaries", "legionaries", "legionaries", "auxilia", "auxilia", "archers", "equites", "scorpion"]);
const b = scenario === "siege"
  ? createBattle({ region: { id: "t", terrain: "hills" }, attacker: { faction: "rome", armies: [legion] }, defender: { faction: "celts", armies: [], garrison: ["spearmen", "warriors", "slingers"].map(newUnit) }, siege: true })
  : createBattle({ region: { id: "t", terrain: "plains" }, attacker: { faction: "celts", armies: [celts] }, defender: { faction: "rome", armies: [legion] } });
startBattle(b);
let next = 0, logged = 0;
while (!b.over && b.time < 600) {
  tick(b);
  if (b.time >= next) {
    next += every;
    console.log(`--- t=${Math.round(b.time)}s gate=${b.terrain.siege ? Math.round(b.terrain.siege.gateHp) : "-"} plaza=${Math.round(b.plazaTimer)}`);
    for (const u of b.units) console.log(`  ${u.side[0]} ${u.type.padEnd(12)} ${u.state.padEnd(9)} men ${String(u.men).padStart(2)}/${u.start} mor ${String(Math.round(u.morale)).padStart(4)} sta ${String(Math.round(u.stamina)).padStart(3)} at ${Math.round(u.cx)},${Math.round(u.cy)} ${u.order.kind} fight ${u.fighting} kills ${u.kills}`);
    for (; logged < b.log.length; logged++) console.log(`  * ${Math.round(b.log[logged].t)}s ${b.log[logged].text}`);
  }
}
console.log(b.result);
