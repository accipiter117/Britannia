// simulation/siege.js
// Owns sieges (balance.siege). A fortified district left without a defending host is besieged
// rather than taken: the attackers camp round the walls, the town's supplies fall each End Season
// (starved out at zero), production halves and loyalty sags. The besieger can storm, a battle
// against the town's militia behind its walls, or lift. The player besieging gets a decision
// each season; the AI storms when strong enough. A siege ends if the camp is driven off.

import { BALANCE } from "../config/balance.js";
import { addChronicle, armiesIn, armyTroops, logSeason, neighbours } from "./campaign.js";
import { armyStrength, lossesProportional, removeEmptyArmies } from "./armies.js";
import { atWar, hasAccess } from "./diplomacy.js";

const S = BALANCE.siege;

export function isFortified(d) {
  return d.buildings.includes("fortification") || d.special.some((s) => /hillfort/.test(s));
}

// A host camped round walls it is besieging stays put; the AI leaves it alone.
export function isBesieging(state, army) {
  return state.districts[army.districtId]?.siege?.by === army.factionId;
}

export function siegeSupplies(d) {
  return S.baseSupplies + (d.special.some((s) => /hillfort/.test(s)) ? S.hillfortSupplies : 0) +
    (d.buildings.includes("fortification") ? S.fortificationSupplies : 0) + (d.buildings.includes("granary") ? S.granarySupplies : 0);
}

export function wallsBonus(state, d, attackerFactionId) {
  let bonus = d.special.reduce((n, s) => n + (BALANCE.specialBonuses[s]?.defence || 0), 0) +
    (d.buildings.includes("fortification") ? BALANCE.buildings.fortification.effect.defence : 0);
  if (attackerFactionId === "rome") bonus *= S.romeEngineering;
  return bonus;
}

export function militia(d) {
  return Math.max(50, Math.round((d.population * S.militiaPct) / 10) * 10);
}

// Should this advance become a siege instead of a capture?
export function wouldBesiege(state, eng) {
  const d = state.districts[eng.districtId];
  return !eng.storm && !!d.owner && isFortified(d) && atWar(state, d.owner, eng.attackerFactionId);
}

export function beginSiege(state, eng) {
  const d = state.districts[eng.districtId];
  d.siege = { by: eng.attackerFactionId, since: state.turn, supplies: siegeSupplies(d), max: siegeSupplies(d) };
  logSeason(state, { t: "siege", district: d.id, by: eng.attackerFactionId, owner: d.owner });
  addChronicle(state, `${the(state, eng.attackerFactionId)} laid siege to ${d.name}.`.replace(/^./, (c) => c.toUpperCase()), "BATTLE");
}

export function besiegers(state, d) {
  return d.siege ? armiesIn(state, d.id).filter((a) => a.factionId === d.siege.by) : [];
}

// The engagement for storming the walls (setupBattle gives the defenders the town's militia).
export function stormEngagement(state, districtId) {
  const d = state.districts[districtId];
  return { attackerFactionId: d.siege.by, armyIds: besiegers(state, d).map((a) => a.id), fromId: districtId, districtId, storm: true };
}

export function liftSiege(state, districtId, why) {
  const d = state.districts[districtId];
  if (!d.siege) return;
  const by = d.siege.by;
  d.siege = null;
  if (why) addChronicle(state, `The siege of ${d.name} was lifted: ${why}.`, "BATTLE");
  logSeason(state, { t: "siegeLifted", district: districtId, by });
}

// The player gives up a siege: the camp breaks and marches to the nearest friendly ground.
export function abandonSiege(state, districtId) {
  const d = state.districts[districtId];
  for (const a of besiegers(state, d)) {
    const back = neighbours(state, d.id).find((n) => hasAccess(state, a.factionId, state.districts[n].owner));
    if (back) a.districtId = back;
  }
  liftSiege(state, districtId, "the besiegers marched away");
}

// ---------- End Season (after the AI acts) ----------
// hooks: { capture(state, districtId, fid), storm(state, eng) -> text } from engagement.js, to
// avoid a circular import.
export function resolveSieges(state, notes, hooks) {
  const me = state.playerFactionId;
  for (const d of Object.values(state.districts)) {
    const s = d.siege;
    if (!s) continue;
    const camp = besiegers(state, d);
    if (!camp.length || !d.owner || !atWar(state, s.by, d.owner)) { liftSiege(state, d.id, camp.length ? "peace was made" : "the camp was broken"); continue; }
    if (s.since === state.turn) { // begun this season: the stores hold, but the besieger may already storm
      if (s.by === me) state.pending.push({ kind: "siege", districtId: d.id });
      if (d.owner === me) notes.push({ level: "critical", text: `${d.name} is besieged by ${the(state, s.by)}! Its stores last ${s.supplies} seasons. Relieve it with a host.`, districtId: d.id });
      continue;
    }
    for (const a of camp) lossesProportional(a, Math.round(armyTroops(a) * S.besiegerAttritionPct));
    removeEmptyArmies(state);
    d.loyalty = Math.max(0, d.loyalty + S.loyaltyPerSeason);
    s.supplies -= 1;
    const name = the(state, s.by);
    if (s.supplies <= 0) {
      d.siege = null;
      addChronicle(state, `${d.name} was starved into surrender by ${name}.`, s.by === me ? "VICTORY" : d.owner === me ? "DEFEAT" : "BATTLE");
      if (d.owner === me || s.by === me) notes.push({ level: s.by === me ? "important" : "critical", text: `${d.name} has fallen to ${name}: its stores ran out.`, districtId: d.id });
      hooks.capture(state, d.id, s.by);
      continue;
    }
    if (s.by === me) {
      state.pending.push({ kind: "siege", districtId: d.id });
    } else {
      const ours = besiegers(state, d).reduce((n, a) => n + armyStrength(a), 0);
      const walls = (militia(d) / 100) * BALANCE.formations.levies.strength * (1 + wallsBonus(state, d, s.by));
      if (ours >= walls * (s.by === "rome" ? S.romeStormRatio : S.aiStormRatio)) {
        const defender = d.owner;
        const text = hooks.storm(state, stormEngagement(state, d.id));
        if (defender === me) notes.push({ level: "critical", text, districtId: d.id });
        continue;
      }
      if (d.owner === me) notes.push({ level: "critical", text: `${d.name} is under siege by ${name}: ${s.supplies} season${s.supplies > 1 ? "s" : ""} of supplies left. Relieve it with a host.`, districtId: d.id });
    }
  }
}

const the = (state, fid) => (fid === "rome" ? "Rome" : `the ${state.factions[fid].name}`);
