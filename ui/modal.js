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
import { defById } from "../simulation/eventDefs.js";
import { choiceStatus } from "../simulation/events.js";
import { overtureView } from "../simulation/overtures.js";
import { esc, num } from "./format.js";
import { icon } from "./icons.js";

const fac = (state, id) => (id ? state.factions[id].name : "Local militia");

export function pendingHtml(state, p, index) {
  const total = state.pending.length;
  const more = total > 1 ? `<p class="muted small">${total - 1} more decision${total > 2 ? "s" : ""} waiting.</p>` : "";
  if (p.kind === "defend") return defendHtml(state, p, index) + more;
  if (p.kind === "allyCall") {
    return box(`${icon("diplomacy")} Your ally calls`, pendingText(state, p), [
      ["ally", "honour", "Honour the alliance (declare war)"],
      ["ally", "limited", "Send limited help (Wealth)"],
      ["ally", "refuse", "Refuse (relations suffer)"],
    ], index) + more;
  }
  if (p.kind === "proposal") {
    return box(p.action === "peace" ? `${icon("dove")} An offer of peace` : `${icon("diplomacy")} An offer of alliance`, pendingText(state, p), [
      ["proposal", "yes", "Accept"], ["proposal", "no", "Decline"],
    ], index) + more;
  }
  if (p.kind === "event") return eventHtml(state, p, index) + more;
  if (p.kind === "siege") {
    const d = state.districts[p.districtId];
    const s = d.siege;
    const pips = s ? Array.from({ length: s.max }, (_, i) => `<i class="supply-pip ${i < s.supplies ? "on" : ""}"></i>`).join("") : "";
    return `<h2>${icon("fortification")} The siege of ${esc(d.name)}</h2><p>${esc(pendingText(state, p))}</p>
      <p class="siege-pips">Stores ${pips}</p>
      <div class="choices">
        <button data-action="decide" data-kind="siege" data-value="storm" data-index="${index}"><b>Storm the walls</b><small class="muted">A battle against the town's militia behind its walls. Win and it is yours now.</small></button>
        <button data-action="decide" data-kind="siege" data-value="wait" data-index="${index}"><b>Starve them out</b><small class="muted">Your camp loses a few men a season; the town falls when its stores run out.</small></button>
        <button data-action="decide" data-kind="siege" data-value="lift" data-index="${index}"><b>Lift the siege</b><small class="muted">Break camp and march back to friendly ground.</small></button>
      </div>${more}`;
  }
  if (p.kind === "overture") {
    const v = overtureView(state, p);
    return `<h2>${icon(v.icon)} ${esc(v.title)}</h2><p>${esc(v.text)}</p><div class="choices">${v.choices.map((c) =>
      `<button data-action="decide" data-kind="overture" data-value="${c.id}" data-index="${index}" ${c.ok ? "" : "disabled"}>
        <b>${esc(c.label)}</b>${c.hint || !c.ok ? `<small class="muted">${esc(c.ok ? c.hint : c.reason)}</small>` : ""}</button>`).join("")}</div>${more}`;
  }
  if (p.kind === "dominance") {
    return box(`${icon("crown")} Decisive Dominance`, "No power in Britannia can stand against you. The bards are already composing. Will you close the Chronicle here, or play on?", [
      ["ending", "continue", "Continue the campaign"], ["ending", "end", "End the Chronicle"],
    ], index);
  }
  if (p.kind === "defeat") {
    return box(`${icon("candle")} The last fire goes out`, "Your people hold no land and field no army. Their story may yet be told.", [
      ["ending", "end", "Close the Chronicle"], ["ending", "continue", "Watch on"],
    ], index);
  }
  return "";
}

// Events: each choice shows what it costs or risks; impossible ones are greyed with the reason.
function eventHtml(state, p, index) {
  const def = defById(p.def);
  const when = p.prepare ? `<p class="deadline">${icon("warning")} Strikes at the end of ${p.prepare === 1 ? "this season" : `${p.prepare} seasons`}. Choose how to prepare.</p>` : "";
  const buttons = def.choices.map((c, i) => {
    const st = choiceStatus(state, p.ev, c);
    if (st.hidden) return "";
    return `<button data-action="decide" data-kind="event" data-value="${i}" data-index="${index}" ${st.ok ? "" : "disabled"}>
      <b>${esc(c.label)}</b><small class="muted">${esc(st.ok ? c.hint : st.reason)}</small></button>`;
  }).join("");
  return `<h2>${icon(def.major ? "warning" : "scroll")} ${esc(p.title)}</h2><p>${esc(p.text)}</p>${when}<div class="choices">${buttons}</div>`;
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
  return `<h2>${icon("warning")} ${fromSea ? "The legions land" : "Attack"} at ${esc(d.name)}</h2>
    <p>${esc(fac(state, eng.attackerFactionId))} ${fromSea ? "comes ashore" : `marches from ${esc(state.districts[eng.fromId].name)}`} with about ${num(Math.round(troops / 100) * 100)} troops (${att.map((a) => esc(a.name)).join(", ")}).</p>
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
  return `<h2>${icon("armies")} Battle of ${esc(d.name)}</h2>
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
  return `<h2>${won ? `${icon("trophy")} Victory` : lost ? `${icon("skull")} Defeat` : `${icon("armies")} Battle`}</h2>
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
  return `<h2>${icon("scroll")} The Chronicle of Britannia</h2>
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
