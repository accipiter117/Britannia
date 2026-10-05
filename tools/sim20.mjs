// tools/sim20.mjs
// Sanity check: runs a campaign in Node under simple player strategies, with the AI, events and
// Rome all active, and prints the state of the world each season. Fails loudly on NaN, negative
// stock, broken references or a broken save round trip.
// Usage: node tools/sim20.mjs [seasons=24] [--quiet]

import { readFileSync } from "node:fs";
import { armyTroops, createCampaign, dateLabel, deserialise, districtsOf, serialise } from "../simulation/campaign.js";
import { canBuild, startBuilding } from "../simulation/economy.js";
import { canRecruit, recruit } from "../simulation/armies.js";
import { endSeason } from "../simulation/season.js";
import { autoAnswerAll } from "../simulation/decisions.js";

const data = JSON.parse(readFileSync(new URL("../data/starter_campaign.json", import.meta.url)));
const SEASONS = +process.argv[2] || 24;
const quiet = process.argv.includes("--quiet");

const strategies = {
  idle: () => {},
  builder: (state, fid) => {
    for (const want of ["farm", "farm", "granary", "farm", "warrior_hall", "market"]) {
      for (const d of districtsOf(state, fid)) {
        if (canBuild(state, fid, d.id, want).ok) { startBuilding(state, fid, d.id, want); return; }
      }
    }
    const home = districtsOf(state, fid)[0];
    if (home && state.turn > 8 && canRecruit(state, fid, home.id, "levies").ok) recruit(state, fid, home.id, "levies");
  },
};

let failed = false;
const fail = (msg) => { console.error("BAD " + msg); failed = true; };

for (const [name, act] of Object.entries(strategies)) {
  let state = createCampaign(data);
  state.seed = 12345;
  const fid = state.playerFactionId;
  console.log(`\n=== Strategy: ${name} ===`);
  for (let i = 0; i < SEASONS; i++) {
    act(state, fid);
    const date = dateLabel(state);
    endSeason(state);
    const log = autoAnswerAll(state);
    state = deserialise(serialise(state));
    check(state);
    const world = Object.values(state.factions).filter((f) => !f.defeated && (districtsOf(state, f.id).length || state.armies.some((a) => a.factionId === f.id)))
      .map((f) => `${f.id.slice(0, 6)}:${districtsOf(state, f.id).length}d/${f.resources.food}f/${state.armies.filter((a) => a.factionId === f.id).reduce((n, a) => n + armyTroops(a), 0)}t/${f.mode?.[0] || "-"}`).join(" ");
    const r = state.factions[fid].resources;
    if (!quiet) console.log(`${date.padEnd(15)} food ${String(r.food).padStart(4)} wlth ${String(r.wealth).padStart(4)} | ${world} | wars ${state.diplomacy.wars.length} rome:${state.rome.stage}`);
    for (const l of log) if (!quiet) console.log("   ⚔ " + l);
  }
  const battles = state.chronicle.filter((c) => c.text.startsWith("Battle of"));
  console.log(`Battles: ${battles.length}. Chronicle entries: ${state.chronicle.length}.`);
  for (const b of battles.slice(-6)) console.log("  " + b.date + ": " + b.text);
}

function check(state) {
  for (const f of Object.values(state.factions)) {
    for (const [k, v] of Object.entries(f.resources)) if (!Number.isFinite(v) || v < 0) fail(`${f.id}.${k} = ${v}`);
  }
  for (const a of state.armies) {
    if (!state.districts[a.districtId]) fail(`army ${a.id} in unknown district ${a.districtId}`);
    if (!Number.isFinite(a.morale)) fail(`army ${a.id} morale ${a.morale}`);
    for (const f of a.formations) if (!Number.isFinite(f.troops) || f.troops < 0) fail(`army ${a.id} ${f.type} ${f.troops}`);
  }
  for (const d of Object.values(state.districts)) {
    if (d.owner && !state.factions[d.owner]) fail(`district ${d.id} owner ${d.owner}`);
    if (!Number.isFinite(d.population) || d.population < 0) fail(`district ${d.id} pop ${d.population}`);
  }
}

if (failed) { console.error("\nSANITY CHECK FAILED"); process.exit(1); }
console.log("\nSanity check passed: no NaN, negative stock or broken references; save round trip OK.");
