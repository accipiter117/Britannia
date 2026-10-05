// tools/battletest.mjs
// Balance check for the battle engine: fights set-piece battles with the AI on both sides and
// reports win rates, losses and time. Usage: node tools/battletest.mjs [runs=6]

import { newUnit } from "../simulation/state.js";
import { createBattle } from "../simulation/battle/setup.js";
import { autoResolve } from "../simulation/battle/engine.js";

const RUNS = +process.argv[2] || 6;
let id = 1;
const army = (faction, units) => ({ id: `t${id++}`, faction, units: units.map(newUnit) });

const BRITONS = ["chieftain", "warriors", "warriors", "warriors", "spearmen", "spearmen", "slingers", "javelinmen", "horsemen", "chariots"];
const LEGION = ["legate", "legionaries", "legionaries", "legionaries", "auxilia", "auxilia", "archers", "equites", "scorpion"];
const VEX = ["legate", "legionaries", "auxilia", "auxilia", "archers", "equites"];

function trial(label, af, au, df, du, terrain = "plains", siege = false, garrison = null) {
  let wins = 0, aLost = 0, dLost = 0, time = 0, ms = 0;
  const reasons = {};
  for (let i = 0; i < RUNS; i++) {
    const att = army(af, au), def = army(df, du);
    const t0 = Date.now();
    const b = createBattle({ region: { id: `r${i}`, name: "Test", terrain }, attacker: { faction: af, armies: [att] }, defender: { faction: df, armies: du.length ? [def] : [], garrison: garrison?.map(newUnit) }, siege, seed: i + 1 });
    const men = (side) => b.units.filter((u) => u.side === side).reduce((n, u) => n + u.men, 0);
    const a0 = men("attacker"), d0 = men("defender");
    const r = autoResolve(b);
    ms += Date.now() - t0;
    if (r.winner === "attacker") wins++;
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    aLost += a0 - b.soldiers.filter((s) => s.u.side === "attacker" && s.alive).length;
    dLost += d0 - b.soldiers.filter((s) => s.u.side === "defender" && s.alive).length;
    time += b.time;
  }
  console.log(`${label.padEnd(40)} A wins ${wins}/${RUNS}  dead A ${Math.round(aLost / RUNS)} D ${Math.round(dLost / RUNS)}  ~${Math.round(time / RUNS)}s  ${Math.round(ms / RUNS)}ms  ${JSON.stringify(reasons)}`);
}

trial("Britons attack a legion (plains)", "celts", BRITONS, "rome", LEGION);
trial("Legion attacks Britons (hills)", "rome", LEGION, "celts", BRITONS, "hills");
trial("Britons vs vexillation (fertile)", "celts", BRITONS, "rome", VEX, "fertile");
trial("Britons x1.5 vs legion (highlands)", "celts", [...BRITONS, "warriors", "warriors", "spearmen", "champions", "horsemen"], "rome", LEGION, "highlands");
trial("Legion storms an oppidum garrison", "rome", LEGION, "celts", [], "hills", true, ["spearmen", "warriors", "slingers"]);
trial("Legion vs Britons in an oppidum", "rome", LEGION, "celts", BRITONS, "hills", true, ["spearmen", "slingers"]);
trial("Britons storm a Roman fort", "celts", BRITONS, "rome", [], "plains", true, ["auxilia", "archers", "auxilia"]);
