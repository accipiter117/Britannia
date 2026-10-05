// ui/format.js
// Owns display text and icons: names, numbers, terrain and building labels. No state changes.

export const ICON = { population: "👥", food: "🍞", timber: "🪵", materials: "🪨", wealth: "🪙" };
export const TERRAIN_ICON = { fertile: "🌾", forest: "🌲", hills: "⛰️", plains: "🌿", marsh: "🐸", coast: "🌊" };
export const SEASON_ICON = { Spring: "🌱", Summer: "☀️", Autumn: "🍂", Winter: "❄️" };
export const TIER_ICON = { village: "🛖", town: "🏘️", major_town: "🏰" };
export const NEUTRAL_COLOUR = "#9d9784";

export const BUILDING_ICON = {
  farm: "🌾", granary: "🏚️", timber_camp: "🪓", mine: "⛏️", workshop: "🔨",
  warrior_hall: "🛡️", fortification: "🧱", market: "⚖️", supply_depot: "📦",
};

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
  if (effect.unlocks) parts.push(`Unlocks ${label(effect.unlocks)} (M4)`);
  if (effect.militaryCapacity) parts.push(`+${effect.militaryCapacity} military capacity (M4)`);
  if (effect.defence) parts.push(`+${Math.round(effect.defence * 100)}% defence (M7)`);
  if (effect.enablesTrade) parts.push("Enables trade (M6)");
  if (effect.supplyRange) parts.push(`+${effect.supplyRange} supply range (M4)`);
  return parts.join(" · ");
}

export function factionName(state, id) {
  return id ? state.factions[id].name : "Neutral";
}

export function factionColour(state, id) {
  return id ? state.factions[id].colour : NEUTRAL_COLOUR;
}
