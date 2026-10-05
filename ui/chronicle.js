// ui/chronicle.js
// Owns the Chronicle screen (spec 07's seventh main state): the campaign's history grouped by
// year, with filters, the story so far, and a few standing figures. Read-only.

import { districtsOf } from "../simulation/campaign.js";
import { dominanceLevel, narrative } from "../simulation/victory.js";
import { esc } from "./format.js";
import { icon } from "./icons.js";

const TYPE_ICON = {
  FOUNDING: "scroll", BATTLE: "armies", VICTORY: "trophy", DEFEAT: "skull", SETTLEMENT_FOUNDED: "village",
  SETTLEMENT_DESTROYED: "warning", FACTION_DEFEATED: "candle", ALLIANCE: "diplomacy", REBELLION: "warning",
  INVASION: "eagle", COMMANDER_DEATH: "skull", MAJOR_DISASTER: "warning", HISTORICAL_DIVERGENCE: "crown", LOG: "scroll",
};

export const FILTERS = [
  ["all", "Everything"],
  ["mine", "Your story"],
  ["war", "Battles"],
  ["rome", "Rome"],
  ["land", "The land"],
];

function matches(state, c, filter) {
  const me = state.factions[state.playerFactionId].name;
  if (filter === "mine") return ["VICTORY", "DEFEAT"].includes(c.type) || c.text.includes(me);
  if (filter === "war") return ["BATTLE", "VICTORY", "DEFEAT", "COMMANDER_DEATH", "FACTION_DEFEATED"].includes(c.type) || c.text.startsWith("Battle of");
  if (filter === "rome") return ["INVASION", "HISTORICAL_DIVERGENCE"].includes(c.type) || /Rom(e|an)|legion/i.test(c.text);
  if (filter === "land") return ["MAJOR_DISASTER", "REBELLION", "SETTLEMENT_FOUNDED", "SETTLEMENT_DESTROYED"].includes(c.type) || /grew into|raised at|road now runs/i.test(c.text);
  return true;
}

export function chronicleHtml(state, filter = "all") {
  const fid = state.playerFactionId;
  const won = state.chronicle.filter((c) => c.type === "VICTORY" && c.text.startsWith("Battle of")).length;
  const lost = state.chronicle.filter((c) => c.type === "DEFEAT" && c.text.startsWith("Battle of")).length;
  const score = state.victory.score?.[fid] || 0;

  const byYear = new Map();
  for (const c of state.chronicle.filter((x) => matches(state, x, filter))) {
    const year = c.date.split(" ").slice(0, 2).join(" ");
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(c);
  }
  const years = [...byYear.entries()].reverse().map(([year, list]) => `
    <section class="ch-year">
      <h3>${esc(year)}</h3>
      <ol>${list.reverse().map((c) => `<li class="ch-${c.type || "LOG"}">${icon(TYPE_ICON[c.type] || "scroll")}
        <span><small>${esc(c.date.split(" ").slice(2).join(" "))}</small> ${esc(c.text)}</span></li>`).join("")}</ol>
    </section>`).join("") || `<p class="muted">Nothing of this kind has been recorded yet.</p>`;

  return `
    <header class="ch-head">
      <h2>${icon("scroll")} The Chronicle of Britannia</h2>
      <button data-action="close-chronicle" aria-label="Close the Chronicle">✕</button>
    </header>
    <div class="ch-body">
      <div class="ch-story">${narrative(state, false).slice(0, 3).map((l) => `<p>${esc(l)}</p>`).join("")}</div>
      <div class="ch-figures">
        <div><b>${state.turn - 1}</b><span>seasons</span></div>
        <div><b>${districtsOf(state, fid).length}</b><span>districts held</span></div>
        <div><b>${won}–${lost}</b><span>battles won–lost</span></div>
        <div><b>${Math.round(score * 100)}%</b><span>${dominanceLevel(score) || "dominance"}</span></div>
      </div>
      <div class="seg ch-filters">${FILTERS.map(([id, lbl]) => `<button data-action="chronicle-filter" data-filter="${id}" class="${filter === id ? "on" : ""}">${lbl}</button>`).join("")}</div>
      ${years}
    </div>`;
}
