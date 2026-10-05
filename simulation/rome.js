// simulation/rome.js
// Owns the Roman chain (End Season step 13): Consolidation, Presence, Infrastructure, Warning,
// a four-season countdown, then Invasion through the Old Road. After landing, Roman armies
// Consolidate, Secure Supply, then Advance. Rome is pressure, not a script: it can be beaten.

import { BALANCE } from "../config/balance.js";
import { addChronicle, armiesIn, armyTroops, districtsOf, neighbours, newArmy, uid } from "./campaign.js";
import { armyStrength, garrisonStrength, moveArmy, reachable, setStance } from "./armies.js";
import { atWar, declareWar } from "./diplomacy.js";
import { engagePlayer, playerDefends, resolveEngagementAuto } from "./engagement.js";
import { supplyState } from "./supply.js";
import { aiGovern } from "./governance.js";

const R = BALANCE.rome;

export function resolveRome(state, notes) {
  const rome = state.rome;
  const upcoming = state.turn + 1; // the season about to begin
  const road = state.districts[R.entryDistrict];

  if (rome.stage === "consolidation" && upcoming >= R.presenceSeason) {
    rome.stage = "presence";
    addChronicle(state, "Roman merchants and envoys appear in the southern harbours, asking many questions.");
    notes.push({ level: "important", text: "Roman envoys have been seen in the south. Rome's eye turns to Britannia.", districtId: "white_harbour" });
  } else if (rome.stage === "presence" && upcoming >= R.infrastructureSeason) {
    rome.stage = "infrastructure";
    for (const c of state.connections) if (c.a === R.entryDistrict || c.b === R.entryDistrict) { c.road = true; c.roadProgress = null; }
    addChronicle(state, `Roman engineers paved the ways around ${road.name}. Few believed it was for trade.`);
    notes.push({ level: "important", text: `Roman engineers have paved the roads around ${road.name}.`, districtId: R.entryDistrict });
  } else if (rome.stage === "infrastructure" && upcoming >= R.warningSeason) {
    rome.stage = "warning";
    rome.countdown = R.countdownSeasons;
    addChronicle(state, "Word came across the sea: Rome is gathering legions for Britannia.", "INVASION");
    notes.push({ level: "critical", text: `INVASION WARNING: Rome will land at ${road.name} in ${R.countdownSeasons} seasons.`, districtId: R.entryDistrict });
  } else if (rome.stage === "warning") {
    rome.countdown -= 1;
    if (rome.countdown > 0) {
      notes.push({ level: "critical", text: `Rome lands in ${rome.countdown} season${rome.countdown > 1 ? "s" : ""}. ${["", "The fleet sails.", "The legions muster on the coast of Gaul.", "Prepare your defences."][Math.min(3, rome.countdown)]}`, districtId: R.entryDistrict });
    } else land(state, notes);
  } else if (rome.stage === "invasion") {
    aiGovern(state, "rome");
    reinforce(state, notes);
    advance(state, notes);
    if (!state.armies.some((a) => a.factionId === "rome") && !districtsOf(state, "rome").length) {
      rome.stage = "repulsed";
      addChronicle(state, "Rome was thrown back into the sea. In the histories you know, the legions stayed four hundred years; here they did not.", "HISTORICAL_DIVERGENCE");
      notes.push({ level: "important", text: "Rome has been driven from Britannia!" });
    }
  }
}

function land(state, notes) {
  const rome = state.rome;
  rome.stage = "invasion";
  rome.nextReinforcement = state.turn + R.reinforcements.everySeasons;
  state.factions.rome.defeated = false;
  const f = R.firstArmy;
  const army = newArmy(uid(state, "army"), "Legio Britannica", "rome", R.entryDistrict,
    [{ type: "legionaries", troops: f.legionaries }, { type: "skirmishers", troops: f.skirmishers }], f.commander);
  army.experience = f.experience;
  army.holdSeasons = 0;
  state.armies.push(army);
  addChronicle(state, `The legions of Rome came ashore at ${state.districts[R.entryDistrict].name}.`, "INVASION");

  // the landing is an engagement from the sea
  const d = state.districts[R.entryDistrict];
  for (const fid of new Set([d.owner, ...armiesIn(state, d.id).map((a) => a.factionId)].filter((x) => x && x !== "rome"))) declareWar(state, "rome", fid);
  // Rome stands on the beach while the defender decides; losing means being thrown into the sea
  const eng = { attackerFactionId: "rome", armyIds: [army.id], fromId: null, districtId: d.id };
  if (playerDefends(state, eng)) {
    const out = engagePlayer(state, eng);
    notes.push({ level: "critical", text: out.pending ? `ROME HAS LANDED at ${d.name}! Choose your response.` : out.text, districtId: d.id });
  } else {
    const text = resolveEngagementAuto(state, eng);
    notes.push({ level: "critical", text: `ROME HAS LANDED. ${text}`, districtId: d.id });
  }
}

function reinforce(state, notes) {
  const rome = state.rome;
  if (state.turn + 1 < rome.nextReinforcement) return;
  rome.nextReinforcement = state.turn + 1 + R.reinforcements.everySeasons;
  const road = state.districts[R.entryDistrict];
  if (R.reinforcements.requiresSupplyLine && road.owner !== "rome") return;
  const onIsland = state.armies.filter((a) => a.factionId === "rome").reduce((n, a) => n + armyTroops(a), 0);
  if (onIsland + R.reinforcements.legionaries > R.maxTotalTroops) return;
  const there = armiesIn(state, road.id, "rome")[0];
  const troops = R.reinforcements.legionaries;
  if (there) {
    const f = there.formations.find((x) => x.type === "legionaries");
    if (f) { f.troops += troops; f.max += troops; } else there.formations.push({ type: "legionaries", troops, max: troops });
  } else if (state.armies.filter((a) => a.factionId === "rome").length < R.maxArmies) {
    const a = newArmy(uid(state, "army"), "Legio Secunda", "rome", road.id, [{ type: "legionaries", troops }], "Average");
    a.experience = "Seasoned";
    state.armies.push(a);
  } else return;
  notes.push({ level: "important", text: `Roman reinforcements land at ${road.name}.`, districtId: road.id });
}

// Consolidate, Secure Supply, Advance.
function advance(state, notes) {
  for (const army of state.armies.filter((a) => a.factionId === "rome")) {
    if (!army.districtId || army.movesLeft <= 0) continue;
    if (army.holdSeasons < R.holdSeasonsBeforeAdvance) {
      army.holdSeasons += 1;
      setStance(state, army.id, "Defensive");
      continue;
    }
    if (supplyState(state, army) === "Strained" || supplyState(state, army) === "Starving") {
      const back = Object.entries(reachable(state, army)).find(([did, r]) => r.kind === "move" && state.districts[did].owner === "rome");
      if (back) moveArmy(state, army.id, back[0]);
      continue;
    }
    const target = pickTarget(state, army);
    if (!target) continue;
    const owner = state.districts[target].owner;
    if (owner && !atWar(state, "rome", owner)) declareWar(state, "rome", owner);
    for (const a of armiesIn(state, target)) if (a.factionId !== "rome" && !atWar(state, "rome", a.factionId)) declareWar(state, "rome", a.factionId);
    setStance(state, army.id, "Aggressive");
    const r = moveArmy(state, army.id, target);
    if (!r.ok || !r.engagement) continue;
    army.holdSeasons = 0;
    if (playerDefends(state, r.engagement)) {
      const out = engagePlayer(state, r.engagement);
      notes.push({ level: "critical", text: out.pending ? `The legions march on ${state.districts[target].name}! Choose your response.` : out.text, districtId: target });
    } else {
      notes.push({ level: "important", text: resolveEngagementAuto(state, r.engagement), districtId: target });
    }
  }
}

// Adjacent district with the best value for the least resistance.
function pickTarget(state, army) {
  let best = null;
  for (const did of neighbours(state, army.districtId)) {
    const d = state.districts[did];
    if (d.owner === "rome") continue;
    const defence = armiesIn(state, did).filter((a) => a.factionId !== "rome").reduce((n, a) => n + armyStrength(a), 0) + garrisonStrength(d);
    if (armyStrength(army) < defence) continue;
    const score = d.population / 1000 + (d.special.length ? 0.5 : 0) - defence / Math.max(1, armyStrength(army)) * 2;
    if (!best || score > best.score) best = { did, score };
  }
  return armyTroops(army) > 0 ? best?.did : null;
}
