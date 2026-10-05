// ui/drawer.js
// Owns the contextual drawer content for a selected District or Army, plus the mobile
// selection summary. Returns HTML; buttons carry data-action attributes handled in ui/main.js.

import { BALANCE } from "../config/balance.js";
import {
  RESOURCES, canBuild, canBuildRoad, districtConsumption, districtProduction, settlementTier,
  totalSlots, usedSlots, workforce,
} from "../simulation/economy.js";
import { armyTroops, seasonName } from "../simulation/campaign.js";
import { prosperityMult } from "../simulation/economy.js";
import { visibleArmies } from "../simulation/armies.js";
import { bar, recruitRows } from "./armyPanel.js";
import {
  BUILDING_ICON, ICON, SEASON_ICON, TERRAIN_ICON, TIER_ICON, costText, effectText, esc,
  factionColour, factionName, label, num, signed,
} from "./format.js";
import { icon } from "./icons.js";

export function districtPanel(state, id) {
  const d = state.districts[id];
  const fid = state.playerFactionId;
  const mine = d.owner === fid;
  const season = seasonName(state);
  const prod = districtProduction(state, d, season);
  const eat = districtConsumption(d, season);
  const tier = settlementTier(d);
  const region = state.regions.find((r) => r.id === d.region).name;

  const prodRows = RESOURCES.map((r) => {
    const base = prod.base[r] + prod.buildings[r];
    const net = r === "food" ? prod.total[r] - eat : prod.total[r];
    return `<tr><td>${ICON[r]} ${label(r)}</td><td>${num(base)}</td><td>${num(prod.total[r])}</td>
      <td class="${net < 0 ? "neg" : "pos"}">${signed(net)}</td></tr>`;
  }).join("");

  const built = d.buildings.length
    ? d.buildings.map((b) => `<li>${BUILDING_ICON[b]} ${label(b)}</li>`).join("") : `<li class="muted">None yet</li>`;
  const queue = d.construction.map((c) => {
    const need = BALANCE.buildings[c.building].seasons;
    return `<li>${icon("workshop")} ${label(c.building)} <span class="muted">${c.progress}/${need} seasons</span></li>`;
  }).join("");

  return `
    <header class="panel-head" style="--fc:${factionColour(state, d.owner)}">
      <h2>${esc(d.name)}</h2>
      <p>${TIER_ICON[tier.id]} ${label(tier.id)} · ${TERRAIN_ICON[d.terrain]} ${label(d.terrain)} · ${esc(region)}</p>
      <p><i class="swatch"></i>${esc(factionName(state, d.owner))}${d.special.length ? " · " + d.special.map(label).join(", ") : ""}</p>
    </header>

    <section>
      <div class="kv">
        <span>${ICON.population} Population</span><b>${num(d.population)}</b>
        <span>Workforce</span><b>${num(workforce(d))}${prod.workforceMult < 1 ? ` <small class="neg">(${Math.round(prod.workforceMult * 100)}% output)</small>` : ""}</b>
        <span>Food eaten</span><b>${num(eat)} /season</b>
        <span>Culture</span><b>${d.culture.celtic}% Celtic${d.culture.roman ? `, ${d.culture.roman}% Roman` : ""}</b>
        ${d.garrison ? `<span>Militia</span><b>${d.garrison.levies} levies, ${d.garrison.stance}</b>` : ""}
      </div>
      ${d.garrison ? `<p class="hint">Neutral. Its militia must be defeated by an army before it can be taken.</p>` : ""}
    </section>

    ${controlSection(state, d)}
    ${armiesSection(state, d)}

    <section>
      <h3>Production this season <small>${season} ${SEASON_ICON[season]} · food ×${prod.seasonMult.food}, other ×${prod.seasonMult.other}${prod.governanceMult < 1 ? `, to owner ×${prod.governanceMult.toFixed(2)}` : ""}${Object.keys(prod.events).length ? " · event!" : ""}</small></h3>
      <table class="prod"><tr><th></th><th>Base</th><th>${season}</th><th>Net</th></tr>${prodRows}</table>
    </section>

    <section>
      <h3>Buildings <small>${usedSlots(d)}/${totalSlots(d)} slots</small></h3>
      <ul class="plain">${built}${queue}</ul>
    </section>

    <section id="build">
      <h3>Build</h3>
      ${Object.keys(BALANCE.buildings).map((b) => buildRow(state, fid, d, b)).join("")}
    </section>

    <section>
      <h3>Roads</h3>
      ${roadRows(state, fid, id)}
    </section>
    ${mine ? `<section><h3>Recruit</h3>${recruitRows(state, id)}</section>` : ""}
    ${mine ? "" : `<p class="hint">You can view this district but only build in your own.</p>`}`;
}

function controlSection(state, d) {
  if (!d.owner) return "";
  const mine = d.owner === state.playerFactionId;
  const L = BALANCE.loyalty;
  const loyaltyNote = d.loyalty < L.rebellionRisk ? `<b class="neg">Rebellion risk</b>` : d.loyalty < L.unrest ? `<b class="neg">Unrest</b>` : "";
  const stageHint = d.stage === "Occupied"
    ? `Becomes Administered after ${BALANCE.occupation.toAdministered.seasons} seasons with an army garrisoned here.`
    : d.stage === "Administered" ? `Becomes Integrated after ${BALANCE.occupation.toIntegrated.seasons} seasons with loyalty ${BALANCE.occupation.toIntegrated.minLoyalty}+.` : "";
  const policies = d.stage !== "Integrated" && mine ? `
    <div class="seg">${Object.entries(BALANCE.policies).map(([p, v]) => `<button data-action="policy" data-district="${d.id}" data-policy="${p}" class="${d.policy === p ? "on" : ""}">${p}</button>`).join("")}</div>
    <p class="muted small">${policyText(d.policy)}</p>` : "";
  return `<section>
    <h3>Control</h3>
    <div class="kv">
      <span>Stage</span><b>${d.stage}</b>
      <span>Loyalty</span><b>${bar(d.loyalty, 100)} ${d.loyalty} ${loyaltyNote}</b>
      <span>Prosperity</span><b>${bar(d.prosperity ?? 50, 100)} ${d.prosperity ?? 50} <small class="muted">wealth ×${prosperityMult(d).toFixed(2)}</small></b>
      ${d.stage !== "Integrated" ? `<span>Policy</span><b>${d.policy}</b>` : ""}
    </div>
    ${stageHint ? `<p class="muted small">${stageHint}</p>` : ""}
    <p class="muted small">Prosperity grows with full granaries, roads, markets and peace; famine, battle and conquest wreck it.</p>
    ${policies}
  </section>`;
}

function policyText(p) {
  const v = BALANCE.policies[p];
  return `${Math.round(v.outputToOwner * 100)}% of output to you, loyalty ${v.loyaltyPerSeason > 0 ? "+" : ""}${v.loyaltyPerSeason}/season${v.culturePerSeason ? `, culture shifts ${v.culturePerSeason}%/season` : ""}.`;
}

function armiesSection(state, d) {
  const seen = visibleArmies(state, state.playerFactionId).filter((a) => a.districtId === d.id);
  if (!seen.length) return "";
  return `<section><h3>Armies here</h3>${seen.map((a) => `<button class="row" data-action="select-army" data-army="${a.id}">
    <span><i class="swatch" style="background:${factionColour(state, a.factionId)}"></i><b>${esc(a.name)}</b></span>
    <span class="muted">${a.factionId === state.playerFactionId ? num(armyTroops(a)) : "about " + num(Math.round(armyTroops(a) / 100) * 100)}</span></button>`).join("")}</section>`;
}

function buildRow(state, fid, d, b) {
  const def = BALANCE.buildings[b];
  const check = canBuild(state, fid, d.id, b);
  return `<div class="build ${check.ok ? "" : "off"}">
    <div><b>${BUILDING_ICON[b]} ${label(b)}</b> <small>${def.seasons} season${def.seasons > 1 ? "s" : ""}</small>
      <div class="muted">${effectText(def.effect)}</div>
      <div class="cost">${costText(check.cost)}</div>
      ${check.ok ? "" : `<div class="reason">${esc(check.reason)}</div>`}
    </div>
    <button data-action="build" data-district="${d.id}" data-building="${b}" ${check.ok ? "" : "disabled"}>Build</button>
  </div>`;
}

function roadRows(state, fid, id) {
  return state.connections.map((c, i) => {
    if (c.a !== id && c.b !== id) return "";
    const other = state.districts[c.a === id ? c.b : c.a];
    if (c.road) return `<div class="build"><div>${icon("move")} to ${esc(other.name)} <span class="pos">Built</span></div></div>`;
    if (c.roadProgress !== null) return `<div class="build"><div>${icon("workshop")} to ${esc(other.name)} <span class="muted">${c.roadProgress}/${BALANCE.road.seasons}</span></div></div>`;
    const check = canBuildRoad(state, fid, i);
    return `<div class="build ${check.ok ? "" : "off"}">
      <div><b>Road to ${esc(other.name)}</b> <small>${BALANCE.road.seasons} season</small>
        <div class="muted">Movement cost 1 and supply flows along it</div>
        <div class="cost">${costText(check.cost)}</div>
        ${check.ok ? "" : `<div class="reason">${esc(check.reason)}</div>`}
      </div>
      <button data-action="road" data-connection="${i}" ${check.ok ? "" : "disabled"}>Build</button>
    </div>`;
  }).join("");
}

// Mobile: compact card for the current selection, with quick actions.
export function summaryCard(state, sel) {
  if (!sel) return "";
  if (sel.type === "army") {
    const a = state.armies.find((x) => x.id === sel.id);
    const troops = a.formations.reduce((n, f) => n + f.troops, 0);
    return `<div class="sum-main" data-action="open"><b>${icon(a.factionId === "rome" ? "eagle" : "sword")} ${esc(a.name)}</b><span>${num(troops)} troops · ${esc(state.districts[a.districtId].name)}</span></div>
      <div class="sum-actions">${a.factionId === state.playerFactionId ? `<button data-action="move-mode" ${a.movesLeft > 0 ? "" : "disabled"}>Move</button>` : ""}<button data-action="open">More</button></div>`;
  }
  const d = state.districts[sel.id];
  const prod = districtProduction(state, d).total.food - districtConsumption(d, seasonName(state));
  const mine = d.owner === state.playerFactionId;
  return `<div class="sum-main" data-action="open"><b><i class="swatch" style="background:${factionColour(state, d.owner)}"></i>${esc(d.name)}</b>
      <span>${esc(factionName(state, d.owner))} · ${ICON.population}${num(d.population)} · ${ICON.food}<span class="${prod < 0 ? "neg" : "pos"}">${signed(prod)}</span> · ${usedSlots(d)}/${totalSlots(d)} slots</span></div>
    <div class="sum-actions"><button data-action="open-build" ${mine ? "" : "disabled"}>Build</button>
      <button data-action="open">More</button></div>`;
}
