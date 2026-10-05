// simulation/decisions.js
// Owns the player's pending decisions: defending against an attack, alliance calls, AI proposals,
// event choices, and the Continue / End Chronicle offers. Each resolve function removes the item
// from state.pending. Defence choices that lead to a fight return the battle for the UI to play
// (or auto-resolve); the UI then calls finishBattle.

import { answerAllyCall, changeRelation, formAlliance, makePeace } from "./diplomacy.js";
import { applyBattle, defenceOptions, engagementStillValid, resolveWithoutBattle, setupBattle } from "./engagement.js";
import { applyEventChoice } from "./events.js";
import { autoResolve } from "./battle.js";
import { endChronicle } from "./victory.js";
import { answerOverture, overtureView } from "./overtures.js";

export function pendingText(state, p) {
  const fac = (id) => state.factions[id]?.name || "Unknown";
  if (p.kind === "defend") return `${fac(p.eng.attackerFactionId)} march on ${state.districts[p.eng.districtId].name}.`;
  if (p.kind === "allyCall") return `${fac(p.victim)} is attacked by ${fac(p.aggressor)} and calls on your alliance.`;
  if (p.kind === "proposal") return p.action === "peace" ? `${fac(p.from)} sues for peace.` : `${fac(p.from)} proposes an alliance.`;
  if (p.kind === "event") return p.text;
  if (p.kind === "overture") return overtureView(state, p).text;
  if (p.kind === "dominance") return "Your people hold Decisive Dominance over Britannia.";
  if (p.kind === "defeat") return "Your people have no land and no army left.";
  return "";
}

// Returns { battle } when a fight must happen, else { text }.
export function resolveDefence(state, p, response) {
  state.pending = state.pending.filter((x) => x !== p);
  // the attacker may no longer exist (destroyed in an earlier decision this season)
  if (!engagementStillValid(state, p.eng)) return { text: "The attack came to nothing." };
  const opt = defenceOptions(state, p.eng).find((o) => o.id === response);
  if (!opt?.ok) response = "none";
  const quiet = resolveWithoutBattle(state, p.eng, response);
  if (quiet) return { text: quiet };
  return { battle: setupBattle(state, p.eng, response, "defender") };
}

export function finishBattle(state, battle, auto = false) {
  if (auto || !battle.over) autoResolve(battle);
  return applyBattle(state, battle);
}

export function resolveAllyCall(state, p, answer) {
  state.pending = state.pending.filter((x) => x !== p);
  answerAllyCall(state, p.ally, p.victim, p.aggressor, answer);
}

export function resolveProposal(state, p, accept) {
  state.pending = state.pending.filter((x) => x !== p);
  const player = state.playerFactionId;
  if (!accept) return changeRelation(state, player, p.from, -5);
  if (p.action === "peace") makePeace(state, player, p.from);
  if (p.action === "alliance") formAlliance(state, player, p.from);
}

export function resolveEvent(state, p, choiceIndex) {
  state.pending = state.pending.filter((x) => x !== p);
  applyEventChoice(state, p, choiceIndex);
}

export function resolveEnding(state, p, end) {
  state.pending = state.pending.filter((x) => x !== p);
  if (end) endChronicle(state);
}

// For the Node simulation: answers every pending item the way a cautious player would.
export function autoAnswerAll(state) {
  const log = [];
  for (const p of [...state.pending]) {
    if (p.kind === "defend") {
      const opt = defenceOptions(state, p.eng).find((o) => o.ok && o.id !== "withdraw") || { id: "withdraw" };
      const r = resolveDefence(state, p, opt.id);
      log.push(r.battle ? finishBattle(state, r.battle, true).text : r.text);
    } else if (p.kind === "allyCall") resolveAllyCall(state, p, "limited");
    else if (p.kind === "proposal") resolveProposal(state, p, true);
    else if (p.kind === "overture") answerOverture(state, p, overtureView(state, p).choices.find((c) => c.ok).id);
    else if (p.kind === "event") resolveEvent(state, p, 0);
    else resolveEnding(state, p, false);
  }
  return log;
}
