// ui/objectivesView.js
// Owns the objectives card on the map: the open objectives (simulation/objectives.js), a tick
// when one will complete at End Season, and the hint for what to do. Collapses to a pill.

import { openObjectives, OBJECTIVES } from "../simulation/objectives.js";
import { esc } from "./format.js";
import { icon } from "./icons.js";

export function objectivesHtml(state, open) {
  const list = openObjectives(state);
  const done = state.objectives?.done?.length || 0;
  if (!list.length) return "";
  const ready = list.filter((o) => o.check(state)).length;
  const head = `<button class="obj-head" data-action="toggle-objectives">${icon("trophy")} <b>${esc(list[0].chapter)}</b>
    <small>${done}/${OBJECTIVES.length}${ready ? ` · ${ready} ready` : ""}</small><span class="obj-caret">${open ? "▾" : "▸"}</span></button>`;
  if (!open) return head;
  return head + `<ul>${list.map((o) => {
    const ok = o.check(state);
    const where = o.where?.(state);
    return `<li class="${ok ? "ready" : ""}" ${where ? `data-action="select-district" data-district="${where}"` : ""}>
      <span class="obj-box">${ok ? "✓" : ""}</span>
      <div><b>${esc(o.title)}</b><small>${ok ? "Done: completes at End Season." : esc(o.hint)}</small></div></li>`;
  }).join("")}</ul>`;
}
