// tools/smartbot.mjs
// Balance probe: plays the player's side the way a sensible human might (feed the people first,
// build a Warrior Hall, keep the host at home, hold when attacked, accept alliances against Rome)
// across several seeds, and reports how the Confederation fares. Usage: node tools/smartbot.mjs [seeds] [seasons]

import { readFileSync } from "node:fs";
import { armyTroops, createCampaign, districtsOf } from "../simulation/campaign.js";
import { canBuild, forecast, startBuilding } from "../simulation/economy.js";
import { canRecruit, disband, moveArmy, reachable, recruit, visibleArmies } from "../simulation/armies.js";
import { atWar, canTrade, playerAction } from "../simulation/diplomacy.js";
import { neighbours } from "../simulation/campaign.js";
import { endSeason } from "../simulation/season.js";
import { finishBattle, resolveAllyCall, resolveDefence, resolveEnding, resolveEvent, resolveProposal } from "../simulation/decisions.js";
import { defenceOptions } from "../simulation/engagement.js";

const data = JSON.parse(readFileSync(new URL("../data/starter_campaign.json", import.meta.url)));
const SEEDS = +process.argv[2] || 8;
const SEASONS = +process.argv[3] || 40;

function playerTurn(state) {
  const fid = state.playerFactionId;
  const owned = districtsOf(state, fid);
  const fc = forecast(state, fid);
  // guard the border: send each host to the owned district nearest a hostile army
  const foes = visibleArmies(state, fid).filter((a) => a.factionId !== fid && atWar(state, fid, a.factionId));
  const threatened = owned.filter((d) => foes.some((a) => a.districtId === d.id || neighbours(state, d.id).includes(a.districtId)));
  for (const army of state.armies.filter((a) => a.factionId === fid && a.movesLeft > 0)) {
    const goal = threatened.find((d) => d.id !== army.districtId && reachable(state, army)[d.id]?.kind === "move");
    if (goal && !threatened.some((d) => d.id === army.districtId)) moveArmy(state, army.id, goal.id);
  }
  // sell what piles up
  const res0 = state.factions[fid].resources;
  if (res0.materials > 400 && !state.diplomacy.trades.some((t) => t.from === fid)) {
    const partner = Object.keys(state.factions).find((o) => o !== fid && !state.factions[o].defeated && canTrade(state, o).ok);
    if (partner) playerAction(state, partner, "trade", { sell: true, resource: "materials", amount: 100 });
  }
  // an army we cannot pay is a burden: send levies home
  if (res0.wealth < 20 && fc.net.wealth < 0) {
    const a = state.armies.find((x) => x.factionId === fid && x.formations.some((f) => f.type === "levies"));
    if (a) disband(state, a.id, "levies");
  }
  const wants = [];
  if (fc.net.food < 50) wants.push("farm");
  if (state.seasonIndex === 1 || state.seasonIndex === 2) wants.push("granary");
  wants.push("warrior_hall", "farm", "market", "fortification");
  for (const b of wants) {
    const d = owned.find((x) => canBuild(state, fid, x.id, b).ok);
    if (d) { startBuilding(state, fid, d.id, b); break; }
  }
  // keep a reserve, then raise warriors (or levies) in the most exposed district
  const res = state.factions[fid].resources;
  const romeComing = ["warning", "invasion"].includes(state.rome.stage);
  for (let i = 0; i < (romeComing ? 3 : 1); i++) {
    if (res.wealth < (romeComing ? 60 : 160) || fc.net.food < 0) break;
    const d = owned.find((x) => canRecruit(state, fid, x.id, "warriors").ok) || owned.find((x) => canRecruit(state, fid, x.id, "levies").ok);
    if (!d) break;
    recruit(state, fid, d.id, canRecruit(state, fid, d.id, "warriors").ok ? "warriors" : "levies");
  }
}

function answer(state) {
  for (const p of [...state.pending]) {
    if (p.kind === "defend") {
      const opts = defenceOptions(state, p.eng);
      const pick = ["hold", "ambush", "intercept", "withdraw"].find((id) => opts.find((o) => o.id === id).ok) || "withdraw";
      const r = resolveDefence(state, p, pick);
      if (r.battle) finishBattle(state, r.battle, true);
    } else if (p.kind === "allyCall") resolveAllyCall(state, p, p.aggressor === "rome" ? "honour" : "limited");
    else if (p.kind === "proposal") resolveProposal(state, p, true);
    else if (p.kind === "event") resolveEvent(state, p, 0);
    else resolveEnding(state, p, false);
  }
}

const rows = [];
for (let seed = 1; seed <= SEEDS; seed++) {
  const state = createCampaign(data);
  state.seed = seed * 104729;
  const fid = state.playerFactionId;
  let lowPop = Infinity;
  for (let i = 0; i < SEASONS; i++) {
    playerTurn(state);
    endSeason(state);
    answer(state);
    lowPop = Math.min(lowPop, districtsOf(state, fid).reduce((n, d) => n + d.population, 0));
  }
  const mine = districtsOf(state, fid);
  const troops = state.armies.filter((a) => a.factionId === fid).reduce((n, a) => n + armyTroops(a), 0);
  const battles = state.chronicle.filter((c) => c.text.startsWith("Battle of"));
  const won = battles.filter((c) => c.type === "VICTORY").length, lost = battles.filter((c) => c.type === "DEFEAT").length;
  rows.push({ seed, districts: mine.length, troops, won, lost, rome: `${state.rome.stage}:${districtsOf(state, "rome").length}`, lowPop,
    food: state.factions[fid].resources.food, wealth: state.factions[fid].resources.wealth });
}
console.table(rows);
