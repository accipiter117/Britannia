// tools/battletest.mjs
// Balance check for the battle engine: fights set-piece battles with the AI on both sides many
// times and reports who wins and the losses. Usage: node tools/battletest.mjs [runs=10]

import { readFileSync } from "node:fs";
import { createCampaign, newArmy, newUnit } from "../simulation/state.js";
import { createBattle } from "../simulation/battle/setup.js";
import { autoResolve } from "../simulation/battle/engine.js";

const data = JSON.parse(readFileSync(new URL("../data/caledonia.json", import.meta.url)));
const RUNS = +process.argv[2] || 10;
const state = createCampaign(data);
const army = (faction, units) => newArmy(state, { faction, name: "x", region: "fib", general: "g", units });

const PICT_HOST = ["chieftain", "warband", "warband", "spearmen", "spearmen", "skirmishers", "horsemen", "chariots"];
const PICT_BIG = [...PICT_HOST, "warband", "champions"];
const LEGION = ["legate", "legionaries", "legionaries", "legionaries", "auxilia", "auxilia", "archers", "equites", "ballista"];
const VEX = ["legate", "legionaries", "auxilia", "archers", "equites"];

function trial(label, attackerFaction, attackerUnits, defenderFaction, defenderUnits, terrain = "fertile", siege = false, garrison = null) {
  let wins = 0, aLost = 0, dLost = 0, time = 0;
  const reasons = {};
  for (let i = 0; i < RUNS; i++) {
    const att = army(attackerFaction, attackerUnits), def = army(defenderFaction, defenderUnits);
    const region = { id: `r${i}`, name: "Test", terrain };
    const b = createBattle({ region, attacker: { faction: attackerFaction, armies: [att] }, defender: { faction: defenderFaction, armies: defenderUnits.length ? [def] : [], garrison: garrison?.map(newUnit) }, siege, seed: i + 1 });
    const startA = b.units.filter((u) => u.side === "attacker").reduce((n, u) => n + u.men, 0);
    const startD = b.units.filter((u) => u.side === "defender").reduce((n, u) => n + u.men, 0);
    const r = autoResolve(b);
    if (r.winner === "attacker") wins++;
    reasons[r.reason] = (reasons[r.reason] || 0) + 1;
    aLost += startA - b.units.filter((u) => u.side === "attacker").reduce((n, u) => n + u.men, 0);
    dLost += startD - b.units.filter((u) => u.side === "defender").reduce((n, u) => n + u.men, 0);
    time += b.time;
  }
  console.log(`${label.padEnd(44)} attacker wins ${wins}/${RUNS}  losses A ${Math.round(aLost / RUNS)} D ${Math.round(dLost / RUNS)}  ~${Math.round(time / RUNS)}s  ${JSON.stringify(reasons)}`);
}

trial("Pict host attacks a legion (fertile)", "picts", PICT_HOST, "rome", LEGION);
trial("Legion attacks Pict host (highlands)", "rome", LEGION, "picts", PICT_HOST, "highlands");
trial("Pict host vs vexillation (plains)", "picts", PICT_HOST, "rome", VEX, "plains");
trial("Big Pict host vs legion (hills)", "picts", PICT_BIG, "rome", LEGION, "hills");
trial("Legion besieges an oppidum (garrison)", "rome", LEGION, "picts", [], "hills", true, ["spearmen", "skirmishers", "spearmen"]);
trial("Legion besieges Pict host in an oppidum", "rome", LEGION, "picts", PICT_HOST, "hills", true, ["spearmen", "skirmishers"]);
trial("Pict host storms a Roman fort", "picts", PICT_HOST, "rome", [], "plains", true, ["auxilia", "archers", "auxilia"]);
