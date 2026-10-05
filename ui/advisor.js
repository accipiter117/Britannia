// ui/advisor.js
// Owns the advisor's one-line suggestion: a gentle nudge drawn from the test plan's pressure
// beats and the current state. Advice only; it never acts.

import { districtsOf, seasonName } from "../simulation/campaign.js";
import { forecast } from "../simulation/economy.js";
import { atWar } from "../simulation/diplomacy.js";
import { visibleArmies } from "../simulation/armies.js";

export function advice(state) {
  const fid = state.playerFactionId;
  const owned = districtsOf(state, fid);
  if (!owned.length) return "Your people have no land. Find a weakly held district and take it back.";
  const fc = forecast(state, fid);
  const has = (b) => owned.some((d) => d.buildings.includes(b) || d.construction.some((c) => c.building === b));
  const count = (b) => owned.reduce((n, d) => n + d.buildings.filter((x) => x === b).length + d.construction.filter((c) => c.building === b).length, 0);
  const season = seasonName(state);
  const rome = state.rome;

  if (rome.stage === "warning") return `Rome lands at Old Road in ${rome.countdown} season${rome.countdown > 1 ? "s" : ""}. Gather your hosts, seek allies, and fortify the south.`;
  if (rome.stage === "invasion") return "Rome is ashore. No single tribe can stop the legions: ally, concentrate your armies, and fight on ground of your choosing.";
  if (fc.famine && count("farm") < owned.length * 2) return "Food will run out at End Season. Build a Farm (+250 food a season).";
  if (season === "Autumn" && !has("granary")) return "Winter is next: food output falls to 40%. A Granary triples a district's food storage.";
  const enemies = visibleArmies(state, fid).filter((a) => a.factionId !== fid && atWar(state, fid, a.factionId));
  if (enemies.length) return `Enemy hosts are in sight (${enemies.length}). Keep an army near your borders; attacks come at End Season.`;
  if (fc.net.food < 0 && count("farm") < 2) return "Your people eat more than they grow. Farms first.";
  if (!has("warrior_hall") && state.turn >= 4) return "A Warrior Hall lets you raise Warriors, twice as strong as levies.";
  if (!has("market") && state.turn >= 10) return "A Market brings Wealth and opens trade agreements with your neighbours.";
  const neutral = Object.values(state.districts).filter((d) => !d.owner && d.garrison);
  if (neutral.length && state.turn >= 3) return `${neutral[0].name} is held only by militia. An army could take it.`;
  return "Your realm is quiet. Build, recruit, or press your claims.";
}
