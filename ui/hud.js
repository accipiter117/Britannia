// ui/hud.js
// Owns the permanent HUD (faction, resources, date, critical warning) and the notifications bar.

import { districtsOf, seasonName } from "../simulation/campaign.js";
import { forecast, storageCaps } from "../simulation/economy.js";
import { ICON, SEASON_ICON, esc, num, signed } from "./format.js";
import { advice } from "./advisor.js";

export function renderHud(el, state) {
  const fid = state.playerFactionId;
  const f = state.factions[fid];
  const fc = forecast(state, fid);
  const caps = storageCaps(state, fid);
  const pop = districtsOf(state, fid).reduce((n, d) => n + d.population, 0);
  const r = f.resources;

  const stat = (key, value, extra = "", title = "") =>
    `<span class="stat" title="${esc(title)}"><b>${ICON[key]}</b>${value}${extra}</span>`;
  const delta = (n) => `<small class="${n < 0 ? "neg" : "pos"}">${signed(n)}</small>`;

  el.innerHTML = `
    <span class="faction"><i style="background:${f.colour}"></i>${esc(f.name)}</span>
    <span class="stats">
      ${stat("population", num(pop), "", "Population")}
      ${stat("food", `${num(r.food)}<small class="cap">/${num(caps.food)}</small>`, delta(fc.net.food), "Food: stored / storage, and change at End Season")}
      ${stat("timber", num(r.timber), delta(fc.net.timber), "Timber")}
      ${stat("materials", num(r.materials), delta(fc.net.materials), "Materials")}
      ${stat("wealth", num(r.wealth), delta(fc.net.wealth), "Wealth")}
    </span>
    <span class="date">Year ${state.year} · ${seasonName(state)} ${SEASON_ICON[seasonName(state)]}</span>
    ${warning(state, fc)}`;
}

function warning(state, fc) {
  const food = state.factions[state.playerFactionId].resources.food;
  if (fc.famine) return `<span class="warn critical">⚠ Famine at End Season</span>`;
  if (fc.net.food < 0 && food + fc.net.food * 2 < 0) return `<span class="warn important">⚠ Food runs out next season</span>`;
  return "";
}

export function renderNotifications(el, state, onPick) {
  const list = state.notifications;
  el.innerHTML = `<span class="note advice">💡 ${esc(advice(state))}</span>` +
    list.map((n, i) => `<button class="note ${n.level}" data-i="${i}">${esc(n.text)}</button>`).join("");
  el.onclick = (e) => {
    const b = e.target.closest("[data-i]");
    if (b) onPick(list[+b.dataset.i]);
  };
}
