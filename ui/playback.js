// ui/playback.js
// Owns the season playback: after End Season, what happened is replayed on the board in order
// (hosts marching, battles, districts changing hands, buildings rising, Rome landing), limited
// to what the player could see. Then the season report sums it up. Reads state.seasonLog only.

import { esc, factionName, label } from "./format.js";
import { icon } from "./icons.js";
import { dateLabel } from "../simulation/campaign.js";

const PAUSE = { battle: 1200, capture: 900, landing: 1500, rebellion: 1000, built: 450 };

export async function playSeason(state, map, visible, control) {
  const me = state.playerFactionId;
  const seen = (did) => visible.has(did);
  const wait = (ms) => new Promise((r) => setTimeout(r, control.skip ? 0 : ms));
  for (const e of state.seasonLog || []) {
    if (control.skip) break;
    if (e.t === "move") {
      if (e.faction === me || !e.path.some(seen)) continue;
      // start the march from the first step the player can see
      const first = e.path.findIndex(seen);
      const path = e.path.slice(Math.max(0, first - 1));
      map.ensureVisible(path[path.length - 1]);
      if (map.hasArmy(e.army)) await map.animateArmy(e.army, path);
      else await map.ghostMarch(e.snapshot, path);
    } else if (e.t === "battle" && seen(e.district)) {
      map.ensureVisible(e.district);
      const mine = e.attacker === me || e.defender === me;
      const text = mine ? (e.winner === me ? "Victory" : "Defeat") : `${factionName(state, e.winner)} win`;
      map.flash(e.district, "battle", text, mine ? (e.winner === me ? "good" : "bad") : "");
      await wait(PAUSE.battle);
    } else if (e.t === "capture" && seen(e.district)) {
      map.flash(e.district, "capture", `Taken by ${factionName(state, e.to)}`, e.to === me ? "good" : e.from === me ? "bad" : "", e.to);
      await wait(PAUSE.capture);
    } else if (e.t === "built" && e.faction === me) {
      map.flash(e.district, "built", label(e.building), "good", null, e.building);
      await wait(PAUSE.built);
    } else if (e.t === "landing") {
      map.ensureVisible(e.district);
      map.flash(e.district, "landing", "Rome lands!", "bad");
      await wait(PAUSE.landing);
    } else if (e.t === "rebellion" && seen(e.district)) {
      map.flash(e.district, "rebellion", "Rebellion!", e.faction === me ? "bad" : "");
      await wait(PAUSE.rebellion);
    }
  }
}

// The season report: one card that sums up the season before any decisions.
export function seasonReportHtml(state, before) {
  const me = state.factions[state.playerFactionId];
  const r = me.resources;
  const delta = (k) => {
    const d = r[k] - before.resources[k];
    return `<span class="${d < 0 ? "neg" : "pos"}">${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(Math.round(d))}</span>`;
  };
  const notes = state.notifications.filter((n) => !/ begins\.$/.test(n.text));
  const group = (lvl) => notes.filter((n) => n.level === lvl).map((n) => `<li class="${lvl}">${esc(n.text)}</li>`).join("");
  const fights = (state.seasonLog || []).filter((e) => e.t === "battle" && (e.attacker === me.id || e.defender === me.id)).length;
  const waiting = state.pending.length;
  return `<h2>${icon("scroll")} ${esc(dateLabel(state))}</h2>
    <p class="muted">The season turns. Here is what it brought.</p>
    <div class="report-res">
      <span>${icon("food", "res res-food")} ${delta("food")}</span>
      <span>${icon("timber", "res res-timber")} ${delta("timber")}</span>
      <span>${icon("materials", "res res-materials")} ${delta("materials")}</span>
      <span>${icon("wealth", "res res-wealth")} ${delta("wealth")}</span>
      ${fights ? `<span>${icon("armies")} ${fights} battle${fights > 1 ? "s" : ""}</span>` : ""}
    </div>
    ${group("critical") ? `<h3>Needs your attention</h3><ul class="report">${group("critical")}</ul>` : ""}
    ${group("important") ? `<h3>This season</h3><ul class="report">${group("important")}</ul>` : ""}
    ${group("info") ? `<h3>Also</h3><ul class="report">${group("info")}</ul>` : ""}
    ${!notes.length ? `<p>A quiet season.</p>` : ""}
    <div class="choices"><button class="primary" data-action="close-modal">${waiting ? `${waiting} decision${waiting > 1 ? "s" : ""} await you` : "To the map"}</button></div>`;
}
