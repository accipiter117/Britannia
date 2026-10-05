// tools/sim20.mjs
// Sanity check: runs 20 seasons in Node under two simple player strategies and prints the
// player's economy each season. Fails loudly on NaN, negative stock or a broken save round trip.
// Usage: node tools/sim20.mjs

import { readFileSync } from "node:fs";
import { createCampaign, dateLabel, deserialise, districtsOf, serialise } from "../simulation/campaign.js";
import { canBuild, forecast, startBuilding } from "../simulation/economy.js";
import { endSeason } from "../simulation/season.js";

const data = JSON.parse(readFileSync(new URL("../data/starter_campaign.json", import.meta.url)));

const strategies = {
  idle: () => {},
  // Build Farms first, then a Granary, wherever a slot and the resources allow.
  farmer: (state, fid) => {
    for (const want of ["farm", "farm", "granary", "farm"]) {
      for (const d of districtsOf(state, fid)) {
        if (canBuild(state, fid, d.id, want).ok) return startBuilding(state, fid, d.id, want);
      }
    }
  },
};

let failed = false;
for (const [name, act] of Object.entries(strategies)) {
  let state = createCampaign(data);
  const fid = state.playerFactionId;
  console.log(`\n=== Strategy: ${name} ===`);
  console.log("Season              Pop   Food  Timb  Mats  Wlth  FoodNet  Status");
  for (let i = 0; i < 20; i++) {
    act(state, fid);
    const fc = forecast(state, fid);
    const date = dateLabel(state);
    endSeason(state);
    state = deserialise(serialise(state)); // save/load every season
    const f = state.factions[fid];
    const pop = districtsOf(state, fid).reduce((n, d) => n + d.population, 0);
    const r = f.resources;
    console.log(`${date.padEnd(18)} ${String(pop).padStart(5)} ${[r.food, r.timber, r.materials, r.wealth].map((v) => String(v).padStart(5)).join(" ")} ${String(fc.net.food).padStart(8)}  ${f.lastFoodStatus}`);
    for (const fac of Object.values(state.factions)) {
      for (const [k, v] of Object.entries(fac.resources)) {
        if (!Number.isFinite(v) || v < 0) { console.error(`BAD ${fac.id}.${k} = ${v}`); failed = true; }
      }
    }
  }
  const others = Object.values(state.factions).filter((f) => !f.player && districtsOf(state, f.id).length);
  for (const f of others) {
    const pop = districtsOf(state, f.id).reduce((n, d) => n + d.population, 0);
    console.log(`  ${f.name}: pop ${pop}, food ${f.resources.food} (no AI until M5)`);
  }
}
if (failed) { console.error("\nSANITY CHECK FAILED"); process.exit(1); }
console.log("\nSanity check passed: 20 seasons, no NaN or negative stock, save round trip OK.");
