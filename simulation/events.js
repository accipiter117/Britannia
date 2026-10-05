// simulation/events.js
// Owns minor and major events (End Season step 12). Events arise from the current state where
// possible (a mine can only collapse where there is a mine; famine follows starvation) and the
// player gets choices for some. Ongoing effects live in state.events and are read by economy.js.

import { BALANCE } from "../config/balance.js";
import { addChronicle, districtsOf } from "./campaign.js";
import { chance, pickOne } from "./random.js";

const E = BALANCE.events;

export function resolveEvents(state, notes, season) {
  state.events = state.events.filter((e) => e.until >= state.turn + 1);
  for (const f of Object.values(state.factions)) {
    if (f.id === "rome" || f.defeated) continue;
    const owned = districtsOf(state, f.id);
    if (!owned.length) continue;
    const isPlayer = f.player;
    if (f.starvingSeasons >= E.famineTriggerSeasonsStarving && f.starvingSeasons % E.famineTriggerSeasonsStarving === 0) famine(state, f, owned, notes);
    if (chance(state, E.majorChancePerSeason)) major(state, f, owned, notes, isPlayer);
    if (chance(state, E.minorChancePerSeason)) minor(state, f, owned, notes, isPlayer, season);
  }
}

function minor(state, f, owned, notes, isPlayer, season) {
  const options = [];
  const fields = owned.filter((d) => ["fertile", "plains"].includes(d.terrain) || d.buildings.includes("farm"));
  const nextSeason = BALANCE.seasons[(state.seasonIndex + 1) % 4];
  if (fields.length && E.harvestFailure.seasons.includes(nextSeason)) options.push("harvestFailure");
  if (owned.some((d) => d.buildings.includes("mine"))) options.push("mineCollapse");
  options.push("bandits", "dispute");
  const kind = pickOne(state, options);

  if (kind === "harvestFailure") {
    const d = pickOne(state, fields);
    state.events.push({ kind, districtId: d.id, factionId: f.id, until: state.turn + 1 });
    if (isPlayer) notes.push({ level: "important", text: `Blight in the fields of ${d.name}: next season's harvest there will be halved.`, districtId: d.id });
  } else if (kind === "mineCollapse") {
    const d = pickOne(state, owned.filter((x) => x.buildings.includes("mine")));
    state.events.push({ kind, districtId: d.id, factionId: f.id, until: state.turn + E.mineCollapse.durationSeasons });
    if (isPlayer) notes.push({ level: "important", text: `The mine at ${d.name} has collapsed: materials there halved for ${E.mineCollapse.durationSeasons} seasons.`, districtId: d.id });
  } else if (kind === "bandits") {
    // bandits favour the least loyal district
    const d = [...owned].sort((a, b) => a.loyalty - b.loyalty)[0];
    if (isPlayer) {
      state.pending.push({
        kind: "event", title: "Bandits on the roads", districtId: d.id,
        text: `Raiders are robbing travellers near ${d.name}. The elders ask what you will do.`,
        choices: [
          { label: `Pay them to move on (−${E.bandits.wealthLoss} Wealth)`, effects: { wealth: -E.bandits.wealthLoss } },
          { label: `Let the locals cope (${E.bandits.loyalty * 2} loyalty in ${d.name})`, effects: { loyalty: { districtId: d.id, delta: E.bandits.loyalty * 2 } } },
        ],
      });
    } else {
      f.resources.wealth = Math.max(0, f.resources.wealth - E.bandits.wealthLoss);
      d.loyalty = Math.max(0, d.loyalty + E.bandits.loyalty);
    }
  } else if (kind === "dispute") {
    const d = pickOne(state, owned);
    if (isPlayer) {
      state.pending.push({
        kind: "event", title: "A local dispute", districtId: d.id,
        text: `Two kin-groups in ${d.name} quarrel over grazing rights and ask you to judge.`,
        choices: [
          { label: "Judge in person, with gifts to both (−40 Wealth, +5 loyalty)", effects: { wealth: -40, loyalty: { districtId: d.id, delta: 5 } } },
          { label: "Let them settle it (−5 loyalty)", effects: { loyalty: { districtId: d.id, delta: -5 } } },
        ],
      });
    } else d.loyalty = Math.max(0, d.loyalty - 3);
  }
}

function major(state, f, owned, notes, isPlayer) {
  const crowded = owned.filter((d) => d.population > d.basePopulation * 1.2);
  if (crowded.length && chance(state, E.epidemic.chanceIfOvercrowded / E.majorChancePerSeason * 0.5)) {
    const d = pickOne(state, crowded);
    const lost = Math.round(d.population * E.epidemic.popLossPct);
    d.population -= lost;
    addChronicle(state, `Sickness swept through crowded ${d.name}; ${lost} died.`, "MAJOR_DISASTER");
    if (isPlayer) notes.push({ level: "critical", text: `Epidemic in ${d.name}: ${lost} dead.`, districtId: d.id });
    return;
  }
  // unrest where loyalty is already thin
  const d = [...owned].sort((a, b) => a.loyalty - b.loyalty)[0];
  if (d.loyalty < 60) {
    d.loyalty = Math.max(0, d.loyalty - 10);
    if (isPlayer) notes.push({ level: "important", text: `Unrest spreads in ${d.name} (loyalty −10).`, districtId: d.id });
  }
}

function famine(state, f, owned, notes) {
  for (const d of owned) d.loyalty = Math.max(0, d.loyalty - 10);
  addChronicle(state, `Famine gripped the lands of the ${f.name}.`, "MAJOR_DISASTER");
  if (f.player) notes.push({ level: "critical", text: "Famine! Loyalty falls across the realm. Feed your people." });
}

// Applies a player's choice for a pending event.
export function applyEventChoice(state, pending, choiceIndex) {
  const fx = pending.choices[choiceIndex].effects;
  const res = state.factions[state.playerFactionId].resources;
  if (fx.wealth) res.wealth = Math.max(0, res.wealth + fx.wealth);
  if (fx.loyalty) {
    const d = state.districts[fx.loyalty.districtId];
    d.loyalty = Math.max(0, Math.min(100, d.loyalty + fx.loyalty.delta));
  }
}
