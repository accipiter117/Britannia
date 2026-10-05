// ui/panels.js
// Owns the bottom-nav panels: Realm overview, Armies list, Diplomacy list and More
// (Chronicle, save, load, new campaign). Returns HTML with data-action buttons.

import { districtsOf, seasonName } from "../simulation/campaign.js";
import { RESOURCES, forecast, settlementTier, storageCaps } from "../simulation/economy.js";
import { ICON, SEASON_ICON, TIER_ICON, esc, factionColour, label, num, signed } from "./format.js";

export function realmPanel(state) {
  const fid = state.playerFactionId;
  const f = state.factions[fid];
  const fc = forecast(state, fid);
  const caps = storageCaps(state, fid);
  const season = seasonName(state);

  const rows = RESOURCES.map((r) => {
    const use = r === "food" ? -(fc.consumption + fc.upkeep.food) : r === "wealth" ? -fc.upkeep.wealth : 0;
    return `<tr><td>${ICON[r]} ${label(r)}</td><td>${num(f.resources[r])}<small class="muted">/${num(caps[r])}</small></td>
      <td class="pos">${signed(fc.production[r])}</td><td class="${use < 0 ? "neg" : ""}">${signed(use)}</td>
      <td class="${fc.net[r] < 0 ? "neg" : "pos"}">${signed(fc.net[r])}</td></tr>`;
  }).join("");

  const districts = districtsOf(state, fid).map((d) => {
    const jobs = d.construction.map((c) => `🚧 ${label(c.building)}`).join(", ");
    return `<button class="row" data-action="select-district" data-district="${d.id}">
      <span>${TIER_ICON[settlementTier(d).id]} <b>${esc(d.name)}</b></span>
      <span class="muted">${ICON.population}${num(d.population)} ${jobs ? "· " + jobs : ""}</span></button>`;
  }).join("");

  const wintry = season === "Autumn"
    ? `<p class="hint">Winter is next: food output falls to 40% and the people eat 20% more. Fill the granaries now.</p>` : "";

  return `
    <header class="panel-head" style="--fc:${f.colour}"><h2>${esc(f.name)}</h2>
      <p>${season} ${SEASON_ICON[season]} forecast for End Season</p></header>
    <section>
      <table class="prod"><tr><th></th><th>Stored</th><th>In</th><th>Out</th><th>Net</th></tr>${rows}</table>
      <p class="muted small">Out = people's food (${num(fc.consumption)}) and army upkeep (${ICON.food}${num(fc.upkeep.food)} ${ICON.wealth}${num(fc.upkeep.wealth)}). Surplus beyond storage spoils.</p>
      ${fc.famine ? `<p class="hint critical">Food will run out at End Season. Starving districts lose 5% of their people each season.</p>` : ""}
      ${wintry}
    </section>
    <section><h3>Districts</h3>${districts}</section>`;
}

export function armiesPanel(state) {
  const fid = state.playerFactionId;
  const mine = state.armies.filter((a) => a.factionId === fid);
  const others = state.armies.filter((a) => a.factionId !== fid);
  const row = (a) => {
    const troops = a.formations.reduce((n, f) => n + f.troops, 0);
    return `<button class="row" data-action="select-army" data-army="${a.id}">
      <span><i class="swatch" style="background:${factionColour(state, a.factionId)}"></i><b>${esc(a.name)}</b></span>
      <span class="muted">${num(troops)} at ${esc(state.districts[a.districtId].name)}</span></button>`;
  };
  return `<header class="panel-head"><h2>Armies</h2></header>
    <section><h3>Your hosts</h3>${mine.map(row).join("") || `<p class="muted">None</p>`}</section>
    <section><h3>Seen abroad</h3>${others.map(row).join("")}</section>
    <p class="hint">Recruitment, movement, stances and supply arrive in M4.</p>`;
}

export function diplomacyPanel(state) {
  const rows = Object.values(state.factions).filter((f) => !f.player).map((f) => {
    const n = districtsOf(state, f.id).length;
    return `<div class="row"><span><i class="swatch" style="background:${f.colour}"></i><b>${esc(f.name)}</b></span>
      <span class="muted">${n ? `${n} districts` : "Beyond the sea"} · Neutral</span></div>`;
  }).join("");
  return `<header class="panel-head"><h2>Diplomacy</h2></header>
    <section>${rows}</section>
    <p class="hint">Relations, trade, alliances, tribute and war arrive in M6.</p>`;
}

export function morePanel(state, saveInfo) {
  const entries = [...state.chronicle].reverse().slice(0, 60)
    .map((c) => `<li><small class="muted">${esc(c.date)}</small> ${esc(c.text)}</li>`).join("");
  return `<header class="panel-head"><h2>More</h2></header>
    <section class="buttons">
      <button data-action="save">Save</button>
      <button data-action="load" ${saveInfo ? "" : "disabled"}>Load</button>
      <button data-action="new" class="danger">New campaign</button>
    </section>
    <p class="muted small">${saveInfo ? `Saved: ${esc(saveInfo)}. ` : ""}The game also saves itself every End Season.</p>
    <section><h3>Chronicle</h3><ul class="chronicle">${entries}</ul></section>`;
}
