// simulation/objectives.js
// Owns the Confederation's objectives: a guided thread through the campaign in four chapters
// (the realm, the feud, the eagle, Britannia). Up to three are open at once; each is checked at
// End Season, pays a small reward and is written into the Chronicle. Hints say what to do and
// where, so a new player always has a next step. No DOM.

import { BALANCE } from "../config/balance.js";
import { addChronicle, armyTroops, districtsOf, logSeason } from "./campaign.js";
import { allied, atWar, relation } from "./diplomacy.js";
import { storageCaps } from "./economy.js";

const OPEN_AT_ONCE = 3;

const mine = (state) => districtsOf(state, state.playerFactionId);
const hasBuilt = (state, b) => mine(state).some((d) => d.buildings.includes(b) || d.construction.some((c) => c.building === b));
const troops = (state) => state.armies.filter((a) => a.factionId === state.playerFactionId).reduce((n, a) => n + armyTroops(a), 0);
const celts = (state) => Object.values(state.factions).filter((f) => !f.player && f.id !== "rome" && !f.defeated && districtsOf(state, f.id).length);
const rivalsAtWar = (state) => BALANCE.rivalry.pairs.some(([a, b]) => atWar(state, a, b));
const first = (state) => mine(state)[0]?.id;

export const OBJECTIVES = [
  // Chapter I: the realm
  { id: "farm", chapter: "The Realm", title: "Break new ground",
    hint: "Order a Farm in one of your districts (District drawer, Build).", check: (s) => hasBuilt(s, "farm"),
    where: first, reward: { timber: 60 } },
  { id: "granary", chapter: "The Realm", title: "Fill the granaries before winter",
    hint: "Winter cuts the harvest to 40%. A Granary triples a district's food storage.", check: (s) => hasBuilt(s, "granary"),
    where: first, reward: { food: 150 } },
  { id: "host", chapter: "The Realm", title: "Raise the host",
    hint: "Have 1,000 troops under arms. Raise levies or, with a Warrior Hall, warriors.", check: (s) => troops(s) >= 1000,
    where: first, reward: { wealth: 60 } },
  { id: "friend", chapter: "The Realm", title: "Win a friend",
    hint: "Reach Friendly relations (above 30) with a neighbour, or agree a trade. Gifts and trade help (Diplomacy).",
    check: (s) => celts(s).some((f) => relation(s, s.playerFactionId, f.id) > BALANCE.diplomacy.states.Neutral || allied(s, s.playerFactionId, f.id)) ||
      s.diplomacy.trades.some((t) => t.from === s.playerFactionId || t.to === s.playerFactionId),
    reward: { wealth: 40 } },
  { id: "strongpoint", chapter: "The Realm", title: "Make a strongpoint",
    hint: "Order a Fortification, or have a host Dig in (Army drawer, Orders).",
    check: (s) => hasBuilt(s, "fortification") || s.armies.some((a) => a.factionId === s.playerFactionId && a.dugAt === a.districtId),
    where: first, reward: { materials: 80 } },

  // Chapter II: the feud (opens once the two kingdoms are at war)
  { id: "feud", chapter: "The Feud", title: "Profit from the feud",
    hint: "While your neighbours fight, take a district of your own: three districts in all.",
    when: (s) => rivalsAtWar(s) || (s.rivalry?.fought || []).length > 0, check: (s) => mine(s).length >= 3, reward: { wealth: 80 } },
  { id: "raid", chapter: "The Feud", title: "Carry the war to them",
    hint: "Win a battle, or bring home plunder from a raid (Army drawer, Orders, Raid).",
    when: (s) => rivalsAtWar(s) || Object.keys(s.factions).some((f) => f !== s.playerFactionId && atWar(s, s.playerFactionId, f)),
    check: (s) => s.factions[s.playerFactionId].memory.battles.some((b) => b.won) || (s.feats?.raids || 0) > 0, reward: { food: 100 } },

  // Chapter III: the eagle (opens with Rome's warning)
  { id: "muster", chapter: "The Eagle", title: "Muster before the landing",
    hint: "Rome lands at the Old Road. Have 1,500 troops under arms before it does.",
    when: (s) => ["warning", "invasion"].includes(s.rome.stage), check: (s) => troops(s) >= 1500,
    where: () => BALANCE.rome.entryDistrict, reward: { wealth: 100 } },
  { id: "alliance", chapter: "The Eagle", title: "No tribe stands alone",
    hint: "Swear an alliance with a Celtic people (Diplomacy). Rome's coming makes it easier.",
    when: (s) => ["warning", "invasion"].includes(s.rome.stage), check: (s) => celts(s).some((f) => allied(s, s.playerFactionId, f.id)),
    reward: { wealth: 60 } },

  // Chapter IV: Britannia (opens once Rome is ashore)
  { id: "eagle", chapter: "Britannia", title: "Break a legion",
    hint: "Defeat a Roman host in battle. Choose the ground: hills, forest, a fortified stronghold.",
    when: (s) => s.rome.stage === "invasion" || s.rome.stage === "repulsed",
    check: (s) => s.factions[s.playerFactionId].memory.battles.some((b) => b.won && b.enemy === "rome"), reward: { wealth: 120 } },
  { id: "power", chapter: "Britannia", title: "Become a Major Power",
    hint: "Reach 35% dominance: land, people, armies and wealth all count.",
    when: (s) => s.rome.stage === "invasion" || s.rome.stage === "repulsed",
    check: (s) => (s.victory.score?.[s.playerFactionId] ?? 0) >= BALANCE.victory.majorPower, reward: {} },
];

// The objectives open now: the first few, in order, whose chapter has begun and are not done.
export function openObjectives(state) {
  const done = new Set(state.objectives?.done || []);
  return OBJECTIVES.filter((o) => !done.has(o.id) && (!o.when || o.when(state))).slice(0, OPEN_AT_ONCE);
}

// End Season: open objectives that are met are completed and rewarded.
export function resolveObjectives(state, notes) {
  state.objectives ||= { done: [] };
  const me = state.factions[state.playerFactionId];
  if (!districtsOf(state, me.id).length) return;
  const caps = storageCaps(state, me.id);
  for (const o of openObjectives(state)) {
    if (!o.check(state)) continue;
    state.objectives.done.push(o.id);
    for (const [k, v] of Object.entries(o.reward)) me.resources[k] = Math.min(caps[k] ?? Infinity, me.resources[k] + v);
    const reward = Object.entries(o.reward).map(([k, v]) => `+${v} ${k}`).join(", ");
    notes.push({ level: "important", text: `Objective complete: ${o.title}.${reward ? ` ${reward}.` : ""}` });
    addChronicle(state, `${me.name}: ${o.title.toLowerCase().replace(/^./, (c) => c.toUpperCase())}.`, "VICTORY");
    logSeason(state, { t: "objective", id: o.id, title: o.title, district: o.where?.(state) || null });
  }
}
