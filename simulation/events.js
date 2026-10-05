// simulation/events.js
// Owns the event engine (End Season step 12): rolling new events from the catalogue in
// eventDefs.js, the WARNING → CRISIS lifecycle for events that give time to prepare,
// production modifiers left behind as consequences, famine, and refugees. The player decides
// through pending items; AI factions decide for themselves. Choices are stored by index so
// state stays JSON.

import { BALANCE } from "../config/balance.js";
import { addChronicle, armiesIn, districtsOf, neighbours, uid } from "./campaign.js";
import { changeRelation } from "./diplomacy.js";
import { EVENT_DEFS, REFUGEES, defById } from "./eventDefs.js";
import { rand } from "./random.js";

const E = BALANCE.events;

export function resolveEvents(state, notes) {
  state.modifiers = (state.modifiers || []).filter((m) => m.until > state.turn);
  // crises that were warned about strike now
  const due = state.events.filter((ev) => ev.due <= state.turn);
  state.events = state.events.filter((ev) => ev.due > state.turn);
  for (const ev of due) {
    if (!state.factions[ev.factionId] || state.factions[ev.factionId].defeated) continue;
    const def = defById(ev.def);
    def.crisis?.(state, ev, helpers(state, ev, notes, state.turn + 1));
  }

  for (const f of Object.values(state.factions)) {
    if (f.id === "rome" || f.defeated || !districtsOf(state, f.id).length) continue;
    if (f.starvingSeasons >= E.famineTriggerSeasonsStarving && f.starvingSeasons % E.famineTriggerSeasonsStarving === 0) famine(state, f, notes);
    const cooling = state.turn - (f.lastEventTurn ?? -99) < E.playerChoiceCooldownSeasons;
    if (cooling) continue;
    const major = rand(state) < E.majorChancePerSeason;
    if (!major && rand(state) >= E.minorChancePerSeason) continue;
    const pool = EVENT_DEFS.filter((d) => d.major === major && !(f.player && state.pending.some((p) => p.def === d.id)))
      .map((d) => [d, d.weight(state, f)]).filter(([, w]) => w > 0);
    if (!pool.length) continue;
    let roll = rand(state) * pool.reduce((n, [, w]) => n + w, 0);
    const def = pool.find(([, w]) => (roll -= w) < 0)?.[0] || pool[0][0];
    const district = def.district(state, f, rand(state));
    if (!district) continue;
    raiseEvent(state, f.id, def, district.id, notes);
    f.lastEventTurn = state.turn;
  }
}

// Starts an event for a faction. The player gets a decision; the AI chooses at once.
export function raiseEvent(state, fid, def, districtId, notes) {
  const ev = { id: uid(state, "ev"), def: def.id, factionId: fid, districtId, due: state.turn + (def.prepare || 0), prepared: null };
  if (state.factions[fid].player) {
    state.pending.push({ kind: "event", def: def.id, ev, title: def.title, text: def.text(state, ev), prepare: def.prepare || 0 });
    return;
  }
  const choices = def.choices.map((c, i) => [i, choiceStatus(state, ev, c)]).filter(([, s]) => s.ok);
  const [idx] = choices.find(([i]) => !/let |leave|trust|send (him|them) on|refuse/i.test(def.choices[i].label)) || choices[choices.length - 1] || [def.choices.length - 1];
  applyChoice(state, ev, def, idx, notes, state.turn + 1);
}

export function choiceStatus(state, ev, choice) {
  const res = state.factions[ev.factionId].resources;
  if (choice.romeOnly && state.rome.stage !== "invasion") return { ok: false, reason: "Only while Rome is in Britannia", hidden: true };
  if (choice.needsArmy) {
    const near = armiesIn(state, ev.districtId, ev.factionId).length ||
      neighbours(state, ev.districtId).some((n) => state.districts[n].owner === ev.factionId && armiesIn(state, n, ev.factionId).length);
    if (!near) return { ok: false, reason: "No army in or next to the district" };
  }
  for (const [r, v] of Object.entries(choice.cost || {})) if (res[r] < v) return { ok: false, reason: `Needs ${v} ${r}` };
  return { ok: true };
}

function applyChoice(state, ev, def, idx, notes, startTurn) {
  const choice = def.choices[idx];
  const res = state.factions[ev.factionId].resources;
  for (const [r, v] of Object.entries(choice.cost || {})) res[r] = Math.max(0, res[r] - v);
  choice.apply(state, ev, helpers(state, ev, notes, startTurn));
  if (def.prepare) state.events.push(ev);
}

// Player's answer to a pending event (from decisions.js). Falls back to the last choice if the
// chosen one is no longer possible.
export function applyEventChoice(state, pending, index) {
  const def = defById(pending.def);
  const ok = choiceStatus(state, pending.ev, def.choices[index]).ok;
  const idx = ok ? index : def.choices.length - 1;
  const notes = [];
  applyChoice(state, pending.ev, def, idx, notes, state.turn);
  state.notifications.push(...notes);
}

// ---------- effect helpers handed to event definitions ----------

function helpers(state, ev, notes, startTurn) {
  const f = state.factions[ev.factionId];
  const player = f.player;
  const say = (text, type = null) => {
    if (player) notes.push({ level: type === "MAJOR_DISASTER" ? "critical" : "important", text, districtId: ev.districtId });
    if (type) addChronicle(state, text, type);
  };
  const shift = (did, delta) => {
    const d = state.districts[did];
    if (d && d.owner === ev.factionId) d.loyalty = Math.max(0, Math.min(100, d.loyalty + delta));
  };
  return {
    say,
    res: (delta) => { for (const [r, v] of Object.entries(delta)) f.resources[r] = Math.max(0, f.resources[r] + v); },
    loyalty: (did, delta, text) => { shift(did, delta); if (text) say(text); },
    loyaltyAll: (delta) => districtsOf(state, ev.factionId).forEach((d) => shift(d.id, delta)),
    population: (did, pct, abs = 0) => {
      const d = state.districts[did];
      if (d) d.population = Math.max(0, Math.round(d.population * (1 + pct) + abs));
    },
    modifier: (e, resource, mult, seasons, label) => state.modifiers.push({ districtId: e.districtId, factionId: e.factionId, resource, mult, from: startTurn, until: startTurn + seasons - 1, label }),
    modifierAll: (resource, mult, seasons, label) => state.modifiers.push({ districtId: null, factionId: ev.factionId, resource, mult, from: startTurn, until: startTurn + seasons - 1, label }),
    relation: (other, delta) => changeRelation(state, ev.factionId, other, delta),
    flag: (name, value) => { f.flags = { ...(f.flags || {}), [name]: value }; },
    chronicle: (text) => addChronicle(state, text),
  };
}

// Production multipliers active this season for a district (read by economy.js).
export function modifiersFor(state, district) {
  const out = {};
  for (const m of state.modifiers || []) {
    if (m.factionId !== district.owner || state.turn < m.from || state.turn > m.until) continue;
    if (m.districtId && m.districtId !== district.id) continue;
    out[m.resource] = (out[m.resource] ?? 1) * m.mult;
  }
  return out;
}

function famine(state, f, notes) {
  for (const d of districtsOf(state, f.id)) d.loyalty = Math.max(0, d.loyalty - 10);
  addChronicle(state, `Famine gripped the lands of the ${f.name}.`, "MAJOR_DISASTER");
  if (f.player) notes.push({ level: "critical", text: "Famine! Loyalty falls across the realm. Feed your people." });
}

// When Rome takes a district, neighbouring Celtic lands receive refugees.
export function refugeesFrom(state, districtId, notes) {
  const seen = new Set();
  for (const n of neighbours(state, districtId)) {
    const owner = state.districts[n].owner;
    if (!owner || owner === "rome" || seen.has(owner)) continue;
    seen.add(owner);
    raiseEvent(state, owner, REFUGEES, n, notes);
  }
}
