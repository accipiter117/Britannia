// ui/format.js
// Owns display text and icons: names, numbers, terrain and building labels. No state changes.

import { icon } from "./icons.js";

const set = (names, cls = "") => Object.fromEntries(names.map(([k, n]) => [k, icon(n, cls)]));
export const ICON = Object.fromEntries(["population", "food", "timber", "materials", "wealth"].map((k) => [k, icon(k === "population" ? "people" : k, `res res-${k}`)]));
export const TERRAIN_ICON = set(["fertile", "forest", "hills", "plains", "marsh", "coast"].map((t) => [t, t]));
export const SEASON_ICON = { Spring: icon("spring", "season"), Summer: icon("summer", "season"), Autumn: icon("autumn", "season"), Winter: icon("winter", "season") };
export const TIER_ICON = set(["village", "town", "major_town"].map((t) => [t, t]));
export const NEUTRAL_COLOUR = "#9d9784";

export const BUILDING_ICON = set(["farm", "granary", "timber_camp", "mine", "workshop", "warrior_hall", "fortification", "market", "supply_depot"].map((b) => [b, b]));

export const label = (id) => id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const num = (n) => (n === Infinity ? "∞" : Math.round(n).toLocaleString("en-GB"));
export const signed = (n) => (n > 0 ? `+${num(n)}` : n < 0 ? `−${num(-n)}` : "0");

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function costText(cost) {
  return Object.entries(cost).filter(([, v]) => v > 0).map(([r, v]) => `${ICON[r]}${v}`).join(" ");
}

// Plain-English effect line for a building definition. Systems not yet built say which milestone adds them.
export function effectText(effect) {
  const parts = [];
  for (const r of ["food", "timber", "materials", "wealth"]) if (effect[r]) parts.push(`+${effect[r]} ${label(r)}/season`);
  if (effect.storage === "granary") parts.push("Triples food storage here");
  if (effect.constructionCostMultiplier) parts.push(`−${Math.round((1 - effect.constructionCostMultiplier) * 100)}% building costs, realm-wide`);
  if (effect.unlocks) parts.push(`Unlocks ${label(effect.unlocks)} here`);
  if (effect.militaryCapacity) parts.push(`+${effect.militaryCapacity} Warrior capacity`);
  if (effect.defence) parts.push(`+${Math.round(effect.defence * 100)}% defence when holding`);
  if (effect.enablesTrade) parts.push("Enables trade agreements");
  if (effect.supplyRange) parts.push(`Supplies armies one district further`);
  return parts.join(" · ");
}

export function factionName(state, id) {
  return id ? state.factions[id].name : "Neutral";
}

export function factionColour(state, id) {
  return id ? state.factions[id].colour : NEUTRAL_COLOUR;
}
