// simulation/victory.js
// Owns dominance scoring (territory, population, military, economy, regional influence), the
// Major Power / Hegemon / Decisive Dominance milestones, the offer to Continue or End Chronicle,
// defeat, and the closing narrative summary built from the Chronicle.

import { BALANCE } from "../config/balance.js";
import { addChronicle, districtsOf } from "./campaign.js";
import { armyStrength } from "./armies.js";
import { factionProduction } from "./economy.js";
import { regionStatus } from "./governance.js";

const V = BALANCE.victory;

export function dominanceScores(state) {
  const ids = Object.keys(state.factions).filter((id) => !state.factions[id].defeated);
  const raw = {};
  for (const id of ids) {
    const owned = districtsOf(state, id);
    const prod = factionProduction(state, id, "Summer");
    raw[id] = {
      territory: owned.length,
      population: owned.reduce((n, d) => n + d.population, 0),
      military: state.armies.filter((a) => a.factionId === id).reduce((n, a) => n + armyStrength(a), 0),
      economy: prod.food + prod.timber + prod.materials + prod.wealth,
      regional: state.regions.reduce((n, r) => n + (["Majority", "Dominant", "Complete"].includes(regionStatus(state, id, r.id)) ? 1 : 0), 0),
    };
  }
  const totals = {};
  for (const k of Object.keys(V.weights)) totals[k] = ids.reduce((n, id) => n + raw[id][k], 0) || 1;
  const score = {};
  for (const id of ids) {
    score[id] = Object.entries(V.weights).reduce((n, [k, w]) => n + w * (raw[id][k] / totals[k]), 0);
  }
  return score;
}

export function dominanceLevel(score) {
  if (score >= V.decisiveDominance) return "Decisive Dominance";
  if (score >= V.hegemon) return "Hegemon";
  if (score >= V.majorPower) return "Major Power";
  return null;
}

export function resolveVictory(state, notes) {
  const player = state.playerFactionId;
  const scores = dominanceScores(state);
  const before = dominanceLevel(state.victory.score?.[player] || 0);
  state.victory.score = scores;
  const now = dominanceLevel(scores[player] || 0);
  if (now && now !== before && (scores[player] || 0) > (state.victory.best || 0)) {
    notes.push({ level: "important", text: `Your people are now reckoned a ${now}.` });
    addChronicle(state, `The ${state.factions[player].name} rose to become a ${now} in Britannia.`, "VICTORY");
  }
  state.victory.best = Math.max(state.victory.best || 0, scores[player] || 0);
  if (now === "Decisive Dominance" && !state.victory.offered) {
    state.victory.offered = true;
    state.pending.push({ kind: "dominance" });
  }
  const f = state.factions[player];
  if (!state.victory.defeatOffered && !districtsOf(state, player).length && !state.armies.some((a) => a.factionId === player)) {
    state.victory.defeatOffered = true;
    state.pending.push({ kind: "defeat" });
    void f;
  }
}

// A short history of the campaign, written from the Chronicle.
// closing: true for the End Chronicle summary, false for the story so far.
export function narrative(state, closing = true) {
  const p = state.factions[state.playerFactionId];
  const fought = state.chronicle.filter((c) => c.text.startsWith("Battle of"));
  const count = (t) => state.chronicle.filter((c) => c.type === t).length;
  const wins = fought.filter((c) => c.type === "VICTORY").length, losses = fought.filter((c) => c.type === "DEFEAT").length, battles = fought.length;
  const held = districtsOf(state, p.id).map((d) => d.name);
  const level = dominanceLevel(state.victory.score?.[p.id] || 0);
  const rome = state.rome.stage;
  const lines = [];
  lines.push(closing ? `Across ${state.turn - 1} seasons the ${p.name} wrote their own history.` : `${state.turn - 1} seasons into their history, the ${p.name} write on.`);
  const hold = closing ? "At the close they held" : "They hold";
  lines.push(held.length
    ? `${hold} ${held.length} district${held.length > 1 ? "s" : ""}: ${held.join(", ")}${level ? `, and ${closing ? "were" : "are"} reckoned a ${level}` : ""}.`
    : `${hold} no land at all, a people remembered in song more than stone.`);
  if (battles) lines.push(`${battles} battle${battles > 1 ? "s have" : " has"} been fought in the land; the ${p.name} won ${wins} and lost ${losses}.`);
  if (rome === "repulsed") lines.push("Rome came, and Rome was driven back into the sea. History turned on that shore.");
  else if (rome === "invasion") lines.push(`Rome came and stayed, holding ${districtsOf(state, "rome").length} district${districtsOf(state, "rome").length === 1 ? "" : "s"}${closing ? " when the Chronicle closed" : " for now"}.`);
  else lines.push("Rome's legions never set foot on the island while the Chronicle was kept.");
  const fallen = state.chronicle.filter((c) => c.type === "FACTION_DEFEATED").map((c) => c.text);
  if (fallen.length) lines.push(fallen.join(" "));
  const reb = count("REBELLION");
  if (reb) lines.push(`${reb} rebellion${reb > 1 ? "s" : ""} shook the land.`);
  const divergence = state.chronicle.filter((c) => c.type === "HISTORICAL_DIVERGENCE").map((c) => c.text);
  if (divergence.length) lines.push(...divergence);
  return lines;
}

export function endChronicle(state) {
  state.victory.ended = true;
  addChronicle(state, "Here the Chronicle closes.", "FOUNDING");
}
