// ui/armyPanel.js
// Owns the Army drawer (stance, movement, supply, formations, merge, recruit) and the shared
// Recruit rows also shown in the District drawer. Returns HTML with data-action buttons.

import { BALANCE } from "../config/balance.js";
import { armiesIn, armyTroops } from "../simulation/campaign.js";
import { canRecruit, militaryCapacity, movementPoints, professionalsInService } from "../simulation/armies.js";
import { supplyDistance } from "../simulation/supply.js";
import { atWar, relation, relationState } from "../simulation/diplomacy.js";
import { ICON, esc, factionColour, factionName, label, num } from "./format.js";

const STANCE_HINT = {
  Normal: "Balanced.",
  Defensive: "Defence ×1.25, attack ×0.85.",
  Aggressive: "Attack ×1.2, defence ×0.85.",
  "Forced March": "+1 movement, but fatigue and −10 morale; weak in battle.",
};
const SUPPLY_ICON = { "Well Supplied": "🟢", Adequate: "🟡", Strained: "🟠", Starving: "🔴" };

export function armyPanel(state, id) {
  const a = state.armies.find((x) => x.id === id);
  if (!a) return `<p class="muted">This army is no more.</p>`;
  const mine = a.factionId === state.playerFactionId;
  const where = state.districts[a.districtId];
  const head = `<header class="panel-head" style="--fc:${factionColour(state, a.factionId)}">
      <h2>${a.factionId === "rome" ? "🦅" : "⚔"} ${esc(a.name)}</h2>
      <p><i class="swatch"></i>${esc(factionName(state, a.factionId))} · at ${esc(where.name)}</p>
    </header>`;
  if (!mine) return head + foreignArmy(state, a);

  const full = movementPoints(state, a);
  const dist = supplyDistance(state, a.factionId, a.districtId);
  const rows = a.formations.map((f) => {
    const def = BALANCE.formations[f.type];
    return `<tr><td>${label(f.type)}</td><td>${num(f.troops)}<small class="muted">/${num(f.max)}</small></td><td>${def.strength}</td>
      <td>${ICON.food}${Math.round((f.troops / 100) * def.food)} ${ICON.wealth}${Math.round((f.troops / 100) * def.wealth)}</td>
      <td><button class="mini" data-action="disband" data-army="${a.id}" data-type="${f.type}" title="Disband ${BALANCE.recruitBatch}">−${BALANCE.recruitBatch}</button></td></tr>`;
  }).join("");
  const others = armiesIn(state, a.districtId, a.factionId).filter((x) => x.id !== a.id);

  return head + `
    <section class="buttons">
      <button class="primary" data-action="move-mode" ${a.movesLeft > 0 ? "" : "disabled"}>🧭 Move (${a.movesLeft}/${full})</button>
      ${others.map((o) => `<button data-action="merge" data-into="${a.id}" data-from="${o.id}">Absorb ${esc(o.name)}</button>`).join("")}
    </section>
    <section>
      <div class="kv">
        <span>Troops</span><b>${num(armyTroops(a))}</b>
        <span>Morale</span><b>${bar(a.morale, 100)} ${a.morale}</b>
        <span>Fatigue</span><b>${a.fatigue}</b>
        <span>Supply</span><b>${SUPPLY_ICON[a.supply]} ${a.supply} <small class="muted">(${dist === Infinity ? "cut off" : dist ? `${dist} from friendly land` : "home ground"})</small></b>
        <span>Experience</span><b>${a.experience} <small class="muted">${a.battles} battle${a.battles === 1 ? "" : "s"}</small></b>
        <span>Commander</span><b>${a.commander}</b>
        ${a.unpaid?.length ? `<span>Upkeep</span><b class="neg">Unpaid ${a.unpaid.join(", ")}</b>` : ""}
      </div>
    </section>
    <section>
      <h3>Stance</h3>
      <div class="seg">${Object.keys(BALANCE.stances).map((s) => `<button data-action="stance" data-army="${a.id}" data-stance="${s}" class="${a.stance === s ? "on" : ""}">${s}</button>`).join("")}</div>
      <p class="muted small">${STANCE_HINT[a.stance]}</p>
    </section>
    <section>
      <h3>Formations</h3>
      <table class="prod"><tr><th>Type</th><th>Troops</th><th>Str/100</th><th>Upkeep</th><th></th></tr>${rows}</table>
      <p class="muted small">Disbanding (−${BALANCE.recruitBatch}) cuts upkeep; in your own land the troops go home to work. Lost troops are replaced slowly (${Math.round(BALANCE.recovery.replacementsPctPerSeason * 100)}% a season) while the army rests in its own land.</p>
    </section>
    ${where.owner === a.factionId ? `<section><h3>Recruit at ${esc(where.name)}</h3>${recruitRows(state, where.id)}</section>` : ""}`;
}

function foreignArmy(state, a) {
  const me = state.playerFactionId;
  const rough = Math.round(armyTroops(a) / 100) * 100;
  const mood = a.morale > 60 ? "Confident" : a.morale > 30 ? "Wary" : "Shaken";
  const rel = a.factionId === "rome" ? "Invader" : atWar(state, me, a.factionId) ? "At war" : relationState(relation(state, me, a.factionId));
  return `<section><div class="kv">
      <span>Troops</span><b>about ${num(rough)}</b>
      <span>Formations</span><b>${a.formations.map((f) => label(f.type)).join(", ")}</b>
      <span>Bearing</span><b>${mood}, ${a.experience}</b>
      <span>Stance</span><b>${a.stance}</b>
      <span>Relations</span><b>${rel}</b>
    </div></section>
    <p class="hint">Move one of your armies into this district to attack it${atWar(state, me, a.factionId) ? "" : " (you will need to be at war)"}.</p>`;
}

export function recruitRows(state, districtId) {
  const fid = state.playerFactionId;
  const cap = militaryCapacity(state, fid);
  const pro = professionalsInService(state, fid);
  return Object.keys(BALANCE.recruitCostWealthPer100).map((type) => {
    const check = canRecruit(state, fid, districtId, type);
    const def = BALANCE.formations[type];
    return `<div class="build ${check.ok ? "" : "off"}">
      <div><b>${label(type)}</b> <small>+${BALANCE.recruitBatch}, strength ${def.strength}</small>
        <div class="cost">${ICON.wealth}${check.cost.wealth} · ${ICON.population}−${BALANCE.recruitBatch} people</div>
        ${check.ok ? "" : `<div class="reason">${esc(check.reason)}</div>`}
      </div>
      <button data-action="recruit" data-district="${districtId}" data-type="${type}" ${check.ok ? "" : "disabled"}>Raise</button>
    </div>`;
  }).join("") + `<p class="muted small">Warriors in service: ${num(pro)}/${num(cap)} (capacity from towns, Warrior Halls and Fortifications).</p>`;
}

export function bar(value, max) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const cls = pct > 50 ? "good" : pct > 25 ? "mid" : "bad";
  return `<span class="bar"><i class="${cls}" style="width:${pct}%"></i></span>`;
}
