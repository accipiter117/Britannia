// ui/drawer.js
// Owns the contextual drawer content for a selected District or Army, plus the mobile
// selection summary. Returns HTML; buttons carry data-action attributes handled in ui/main.js.

import { BALANCE } from "../config/balance.js";
import {
  RESOURCES, canBuild, canBuildRoad, districtConsumption, districtProduction, settlementTier,
  totalSlots, usedSlots, workforce,
} from "../simulation/economy.js";
import { seasonName } from "../simulation/campaign.js";
import {
  BUILDING_ICON, ICON, SEASON_ICON, TERRAIN_ICON, TIER_ICON, costText, effectText, esc,
  factionColour, factionName, label, num, signed,
} from "./format.js";

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
    return `<li>🚧 ${label(c.building)} <span class="muted">${c.progress}/${need} seasons</span></li>`;
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
        <span>Culture</span><b>${label(d.culture)}</b>
        ${d.garrison ? `<span>Militia</span><b>${d.garrison.levies} levies, ${d.garrison.stance}</b>` : ""}
      </div>
      ${d.garrison ? `<p class="hint">Neutral. Can only be taken by military occupation (armies arrive in M4).</p>` : ""}
    </section>

    <section>
      <h3>Production this season <small>${season} ${SEASON_ICON[season]} · food ×${prod.seasonMult.food}, other ×${prod.seasonMult.other}</small></h3>
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
    ${mine ? "" : `<p class="hint">You can view this district but only build in your own.</p>`}`;
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
    if (c.road) return `<div class="build"><div>🛣️ to ${esc(other.name)} <span class="pos">Built</span></div></div>`;
    if (c.roadProgress !== null) return `<div class="build"><div>🚧 to ${esc(other.name)} <span class="muted">${c.roadProgress}/${BALANCE.road.seasons}</span></div></div>`;
    const check = canBuildRoad(state, fid, i);
    return `<div class="build ${check.ok ? "" : "off"}">
      <div><b>Road to ${esc(other.name)}</b> <small>${BALANCE.road.seasons} season</small>
        <div class="muted">Faster movement and longer supply (M4)</div>
        <div class="cost">${costText(check.cost)}</div>
        ${check.ok ? "" : `<div class="reason">${esc(check.reason)}</div>`}
      </div>
      <button data-action="road" data-connection="${i}" ${check.ok ? "" : "disabled"}>Build</button>
    </div>`;
  }).join("");
}

export function armyPanel(state, id) {
  const a = state.armies.find((x) => x.id === id);
  const troops = a.formations.reduce((n, f) => n + f.troops, 0);
  const rows = a.formations.map((f) => {
    const def = BALANCE.formations[f.type];
    return `<tr><td>${label(f.type)}</td><td>${num(f.troops)}</td><td>${def.strength}</td>
      <td>${ICON.food}${Math.round((f.troops / 100) * def.food)} ${ICON.wealth}${Math.round((f.troops / 100) * def.wealth)}</td></tr>`;
  }).join("");
  return `
    <header class="panel-head" style="--fc:${factionColour(state, a.factionId)}">
      <h2>⚔ ${esc(a.name)}</h2>
      <p><i class="swatch"></i>${esc(factionName(state, a.factionId))} · at ${esc(state.districts[a.districtId].name)}</p>
    </header>
    <section>
      <div class="kv"><span>Troops</span><b>${num(troops)}</b>
      ${a.unpaid?.length ? `<span>Upkeep</span><b class="neg">Unpaid ${a.unpaid.join(", ")}</b>` : ""}</div>
      <table class="prod"><tr><th>Formation</th><th>Troops</th><th>Str/100</th><th>Upkeep</th></tr>${rows}</table>
      <p class="hint">Movement, stances, supply and recruitment arrive in M4.</p>
    </section>`;
}

// Mobile: compact card for the current selection, with quick actions.
export function summaryCard(state, sel) {
  if (!sel) return "";
  if (sel.type === "army") {
    const a = state.armies.find((x) => x.id === sel.id);
    const troops = a.formations.reduce((n, f) => n + f.troops, 0);
    return `<div class="sum-main" data-action="open"><b>⚔ ${esc(a.name)}</b><span>${num(troops)} troops · ${esc(state.districts[a.districtId].name)}</span></div>
      <div class="sum-actions"><button disabled title="M4">Move</button><button data-action="open">More</button></div>`;
  }
  const d = state.districts[sel.id];
  const prod = districtProduction(state, d).total.food - districtConsumption(d, seasonName(state));
  const mine = d.owner === state.playerFactionId;
  return `<div class="sum-main" data-action="open"><b><i class="swatch" style="background:${factionColour(state, d.owner)}"></i>${esc(d.name)}</b>
      <span>${esc(factionName(state, d.owner))} · ${ICON.population}${num(d.population)} · ${ICON.food}<span class="${prod < 0 ? "neg" : "pos"}">${signed(prod)}</span> · ${usedSlots(d)}/${totalSlots(d)} slots</span></div>
    <div class="sum-actions"><button data-action="open-build" ${mine ? "" : "disabled"}>Build</button>
      <button disabled title="M4">Move</button><button data-action="open">More</button></div>`;
}
