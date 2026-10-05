// ui/modal.js
// Owns the Event Window content: pending decisions (defence, alliance calls, proposals, events,
// dominance, defeat), the pre-battle screen, battle results, war confirmation and the closing
// narrative. Returns HTML with data-action buttons handled in ui/main.js.

import { armyTroops } from "../simulation/campaign.js";
import { BALANCE } from "../config/balance.js";
import { attackers, defenceOptions, oddsText } from "../simulation/engagement.js";
import { sideSummary } from "../simulation/battle.js";
import { narrative } from "../simulation/victory.js";
import { pendingText } from "../simulation/decisions.js";
import { esc, num } from "./format.js";

const fac = (state, id) => (id ? state.factions[id].name : "Local militia");

export function pendingHtml(state, p, index) {
  const total = state.pending.length;
  const more = total > 1 ? `<p class="muted small">${total - 1} more decision${total > 2 ? "s" : ""} waiting.</p>` : "";
  if (p.kind === "defend") return defendHtml(state, p, index) + more;
  if (p.kind === "allyCall") {
    return box("⚔ Your ally calls", pendingText(state, p), [
      ["ally", "honour", "Honour the alliance (declare war)"],
      ["ally", "limited", "Send limited help (Wealth)"],
      ["ally", "refuse", "Refuse (relations suffer)"],
    ], index) + more;
  }
  if (p.kind === "proposal") {
    return box(p.action === "peace" ? "🕊 An offer of peace" : "🤝 An offer of alliance", pendingText(state, p), [
      ["proposal", "yes", "Accept"], ["proposal", "no", "Decline"],
    ], index) + more;
  }
  if (p.kind === "event") {
    return box(`📜 ${esc(p.title)}`, esc(p.text), p.choices.map((c, i) => ["event", String(i), c.label]), index) + more;
  }
  if (p.kind === "dominance") {
    return box("👑 Decisive Dominance", "No power in Britannia can stand against you. The bards are already composing. Will you close the Chronicle here, or play on?", [
      ["ending", "continue", "Continue the campaign"], ["ending", "end", "End the Chronicle"],
    ], index);
  }
  if (p.kind === "defeat") {
    return box("🕯 The last fire goes out", "Your people hold no land and field no army. Their story may yet be told.", [
      ["ending", "end", "Close the Chronicle"], ["ending", "continue", "Watch on"],
    ], index);
  }
  return "";
}

function box(title, text, buttons, index) {
  return `<h2>${title}</h2><p>${text}</p>
    <div class="choices">${buttons.map(([kind, value, lbl]) => `<button data-action="decide" data-kind="${kind}" data-value="${value}" data-index="${index}">${esc(lbl)}</button>`).join("")}</div>`;
}

function defendHtml(state, p, index) {
  const eng = p.eng;
  const d = state.districts[eng.districtId];
  const att = attackers(state, eng);
  const troops = att.reduce((n, a) => n + armyTroops(a), 0);
  const opts = defenceOptions(state, eng);
  const fromSea = !eng.fromId;
  return `<h2>⚠ ${fromSea ? "The legions land" : "Attack"} at ${esc(d.name)}</h2>
    <p>${esc(fac(state, eng.attackerFactionId))} ${fromSea ? "come ashore" : `march from ${esc(state.districts[eng.fromId].name)}`} with about ${num(Math.round(troops / 100) * 100)} troops (${att.map((a) => esc(a.name)).join(", ")}).</p>
    <div class="choices">${opts.map((o) => `<button data-action="decide" data-kind="defend" data-value="${o.id}" data-index="${index}" ${o.ok ? "" : "disabled"}>
        <b>${o.label}</b>${o.ok && o.id !== "withdraw" ? ` <small>${oddsText(state, eng, "defender", o.armyIds)}</small>` : ""}
        <small class="muted">${o.ok ? esc(o.hint) : esc(o.reason)}</small></button>`).join("")}</div>`;
}

export function preBattleHtml(state, battle) {
  const eng = battle.engagement;
  const d = state.districts[eng.districtId];
  const playerSide = battle.playerSide;
  const a = sideSummary(battle, "attacker"), df = sideSummary(battle, "defender");
  const odds = playerSide === "attacker" ? oddsText(state, eng, "attacker") : oddsText(state, eng, "defender", battle.defenderArmyIds);
  const kind = battle.type === "defensive" ? `Defensive battle: the defenders must hold the stronghold for ${Math.round(BALANCE.battle.defensiveTimerSeconds / 60)} minutes${battle.fortification ? ` (+${Math.round(battle.fortification * 100)}% defence near it)` : ""}.` : "Field battle: break the enemy army.";
  return `<h2>⚔ Battle of ${esc(d.name)}</h2>
    <div class="vs">
      <div><b>${esc(fac(state, battle.sides.attacker.factionId))}</b><span>${num(a.start)} troops</span><small>${battle.sides.attacker.commander} commander</small></div>
      <div class="vs-mid">vs</div>
      <div><b>${esc(fac(state, battle.sides.defender.factionId))}</b><span>${num(df.start)} troops</span><small>${battle.sides.defender.commander} commander</small></div>
    </div>
    <p>${kind}${battle.ambush ? " Ambush! The attackers start shaken." : ""} Odds: <b>${odds}</b>. Terrain: ${esc(d.terrain)}.</p>
    <div class="choices">
      <button class="primary" data-action="battle-fight">Command the battle</button>
      <button data-action="battle-auto">Auto-resolve</button>
    </div>`;
}

export function resultHtml(result, state) {
  const player = state.playerFactionId;
  const won = result.winner === player;
  const lost = result.loser === player;
  return `<h2>${won ? "🏆 Victory" : lost ? "💀 Defeat" : "⚔ Battle"}</h2>
    <p>${esc(result.text)}</p>
    <div class="choices"><button class="primary" data-action="close-modal">Continue</button></div>`;
}

export function warConfirmHtml(state, factionId, armyId, districtId) {
  return `<h2>Declare war?</h2>
    <p>${esc(state.districts[districtId].name)} belongs to the ${esc(fac(state, factionId))}. Marching in means war, and their allies may join them.</p>
    <div class="choices">
      <button class="danger" data-action="war-and-move" data-faction="${factionId}" data-army="${armyId}" data-district="${districtId}">Declare war and march</button>
      <button data-action="close-modal">Not yet</button>
    </div>`;
}

export function endingHtml(state) {
  return `<h2>📜 The Chronicle of Britannia</h2>
    ${narrative(state).map((l) => `<p>${esc(l)}</p>`).join("")}
    <div class="choices">
      <button data-action="close-modal">Look upon the land</button>
      <button class="danger" data-action="new">New campaign</button>
    </div>`;
}

export function messageHtml(title, text) {
  return `<h2>${esc(title)}</h2><p>${esc(text)}</p><div class="choices"><button class="primary" data-action="close-modal">Continue</button></div>`;
}


// In-page confirmation (browser confirm() dialogs are not available everywhere the game runs).
export function confirmHtml(title, text, attrs, yes) {
  return `<h2>${esc(title)}</h2><p>${esc(text)}</p>
    <div class="choices"><button class="danger" ${attrs}>${esc(yes)}</button><button data-action="close-modal">Cancel</button></div>`;
}
