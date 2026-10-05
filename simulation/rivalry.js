// simulation/rivalry.js
// Owns the feud between the Celtic kingdoms that flank the Confederation (balance.rivalry).
// They share no border, so their quarrel runs through the player's land: relations sour until
// one declares war, then each side asks the player for passage (grant, refuse, or join them),
// and a host granted passage marches across the player's districts. Rome's coming cools it.
// Called from the AI step (10); the AI's march toward a distant enemy is marchOnRival.

import { BALANCE } from "../config/balance.js";
import { addChronicle, districtsOf, neighbours } from "./campaign.js";
import { armyStrength, entryKind, moveArmy, reachable } from "./armies.js";
import { allied, atWar, changeRelation, declareWar, hasAccess, makePeace, relation } from "./diplomacy.js";
import { inTruce } from "./overtures.js";
import { isBesieging } from "./siege.js";

const R = BALANCE.rivalry;
const alive = (state, fid) => state.factions[fid] && !state.factions[fid].defeated && districtsOf(state, fid).length > 0;

export function resolveRivalry(state, notes) {
  state.rivalry ||= { started: false, fought: [] };
  const player = state.playerFactionId;
  for (const [a, b] of R.pairs) {
    if (!alive(state, a) || !alive(state, b)) continue;
    const key = `${a}|${b}`;
    if (!state.rivalry.started) changeRelation(state, a, b, R.startRelation - relation(state, a, b));
    const romeNear = ["warning", "invasion"].includes(state.rome.stage);
    // Rome's sails on the horizon end the feud: a cold peace that can thaw into unity
    if (romeNear && atWar(state, a, b)) {
      makePeace(state, a, b);
      changeRelation(state, a, b, Math.max(0, R.peaceRelation - relation(state, a, b)));
      addChronicle(state, `With Rome's sails on the horizon, the ${state.factions[a].name} and the ${state.factions[b].name} laid down their feud.`, "ALLIANCE");
      notes.push({ level: "important", text: `${state.factions[a].name} and ${state.factions[b].name} have made peace in the face of Rome.` });
    }
    if (romeNear) { if (!atWar(state, a, b)) changeRelation(state, a, b, R.romeThawPerSeason); }
    else if (!state.rivalry.fought.includes(key)) changeRelation(state, a, b, R.driftPerSeason);

    // the feud boils over: the stronger side strikes first
    if (!atWar(state, a, b) && !romeNear && state.turn >= R.earliestSeason && relation(state, a, b) <= R.warAtRelation &&
        !allied(state, a, b) && !inTruce(state, a, b)) {
      const [first, second] = strength(state, a) >= strength(state, b) ? [a, b] : [b, a];
      declareWar(state, first, second);
      state.rivalry.fought.push(key);
      addChronicle(state, `The old feud broke into war: the ${state.factions[first].name} marched against the ${state.factions[second].name}.`, "BATTLE");
      notes.push({ level: "important", text: `${state.factions[first].name} has declared war on ${state.factions[second].name}. Your lands lie between them.` });
    }

    // at war: each side asks the player for passage
    if (atWar(state, a, b)) for (const [from, against] of [[a, b], [b, a]]) askPassage(state, from, against, player);
  }
  state.rivalry.started = true;
}

function askPassage(state, from, against, player) {
  const f = state.factions[from];
  if (hasAccess(state, from, player) || atWar(state, from, player)) return;
  if (state.turn - (f.lastPassageTurn ?? -99) < R.passageCooldown * (1 + (f.passageRefusals || 0))) return;
  if (state.pending.some((p) => p.from === from)) return;
  const gate = districtsOf(state, player).find((d) => neighbours(state, d.id).some((n) => state.districts[n].owner === from));
  if (!gate) return;
  f.lastPassageTurn = state.turn;
  state.pending.push({ kind: "overture", type: "passage", from, against, district: gate.id, toll: R.grant.wealth });
}

function strength(state, fid) {
  return state.armies.filter((x) => x.factionId === fid).reduce((n, x) => n + armyStrength(x), 0);
}

// An AI at war with a faction it cannot reach this season marches its strongest host toward it
// through any land it may cross. Returns true if a host moved.
export function marchOnRival(state, fid) {
  const enemies = Object.keys(state.factions).filter((e) => e !== fid && e !== "rome" && atWar(state, fid, e) && alive(state, e));
  if (!enemies.length) return false;
  const host = state.armies.filter((a) => a.factionId === fid && a.movesLeft > 0 && !isBesieging(state, a)).sort((x, y) => armyStrength(y) - armyStrength(x))[0];
  if (!host) return false;
  const targets = new Set(enemies.flatMap((e) => districtsOf(state, e).map((d) => d.id)));
  // breadth-first over districts the host may enter (its own, granted, or enemy land at the end)
  const prev = { [host.districtId]: null };
  const queue = [host.districtId];
  let goal = null;
  while (queue.length && !goal) {
    const here = queue.shift();
    for (const n of neighbours(state, here)) {
      if (n in prev) continue;
      const owner = state.districts[n].owner;
      if (targets.has(n)) { prev[n] = here; goal = n; break; }
      if (owner && !hasAccess(state, fid, owner)) continue;
      if (!owner) continue; // unclaimed land is a conquest, not a road
      prev[n] = here;
      queue.push(n);
    }
  }
  if (!goal) return false;
  const path = [];
  for (let d = goal; d; d = prev[d]) path.unshift(d);
  // go as far along the road as this season allows; strike only with a clear edge
  const reach = reachable(state, host);
  const stops = path.slice(1).filter((d) => reach[d] && reach[d].kind !== "blocked");
  const last = stops[stops.length - 1];
  if (!last) return false;
  if (reach[last].kind === "attack") {
    const defence = state.armies.filter((a) => a.districtId === last && atWar(state, fid, a.factionId)).reduce((n, a) => n + armyStrength(a), 0);
    if (armyStrength(host) < defence * BALANCE.ai.attackStrengthRatio) {
      // not strong enough yet: wait at the border for an opening
      const before = stops[stops.length - 2];
      if (!before || reach[before].kind !== "move") return { holding: true };
      return moveArmy(state, host.id, before).ok;
    }
    return { engagement: moveArmy(state, host.id, last).engagement };
  }
  return entryKind(state, host, last).kind === "move" && moveArmy(state, host.id, last).ok;
}
