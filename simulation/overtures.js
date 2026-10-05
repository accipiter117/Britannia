// simulation/overtures.js
// Owns what rival powers ask of the player (and of each other): tribute demands from the
// strong, tribute offered for peace by the losing, trade offers, pleas for help when Rome
// strikes, Rome's offer of client status, and Rome's peace once the invasion settles into a
// New Political Reality. Truces and client treaties stop attacks for their term.
// Pending items are { kind: "overture", type, from, ... }; answers go through answerOverture.

import { BALANCE } from "../config/balance.js";
import { addChronicle, districtsOf, neighbours } from "./campaign.js";
import { armyStrength } from "./armies.js";
import {
  allied, atWar, changeRelation, declareWar, formAlliance, grantAccess, makePeace, pairKey, relation, tradeLinked, warWeary,
} from "./diplomacy.js";
import { chance } from "./random.js";

const O = BALANCE.overtures;
const fname = (state, id) => state.factions[id]?.name || "Unknown";

// ---------- truces and client treaties ----------

export function inTruce(state, a, b) {
  return (state.diplomacy.truces?.[pairKey(a, b)] ?? -1) >= state.turn;
}

function setTruce(state, a, b, seasons) {
  state.diplomacy.truces ||= {};
  state.diplomacy.truces[pairKey(a, b)] = state.turn + seasons;
}

export function isRomanClient(state, fid) {
  return (state.rome.clients || []).includes(fid);
}

// ---------- generation (called once a season from the AI step) ----------

export function resolveOvertures(state) {
  const player = state.playerFactionId;
  const strength = (fid) => state.armies.filter((a) => a.factionId === fid).reduce((n, a) => n + armyStrength(a), 0);
  const waiting = (from) => state.pending.some((p) => (p.kind === "overture" || p.kind === "proposal") && p.from === from);

  for (const f of Object.values(state.factions)) {
    if (f.player || f.defeated || f.id === "rome" || !districtsOf(state, f.id).length) continue;
    if (state.turn - (f.lastOvertureTurn ?? -99) < O.cooldownSeasons || waiting(f.id)) continue;
    const rel = relation(state, f.id, player);
    const pers = BALANCE.ai.personalities[f.personality] || {};
    const borders = districtsOf(state, f.id).some((d) => neighbours(state, d.id).some((n) => state.districts[n].owner === player));
    let p = null;
    if (atWar(state, f.id, player) && warWeary(state, f.id, player) && f.resources.wealth >= O.tributeAmount) {
      p = { type: "tributeOffer", amount: O.tributeAmount };
    } else if (!atWar(state, f.id, player) && !allied(state, f.id, player) && borders && (pers.expand || 1) >= 1.1 &&
        rel < O.demandBelowRelation && strength(f.id) >= strength(player) * O.demandStrengthRatio && !inTruce(state, f.id, player) &&
        state.turn >= BALANCE.ai.earliestWarSeason - 2) {
      p = { type: "tributeDemand", amount: O.tributeAmount };
    } else if (!atWar(state, f.id, player) && rel > BALANCE.diplomacy.states.Suspicious && tradeLinked(state, f.id, player) &&
        !state.diplomacy.trades.some((t) => pairKey(t.from, t.to) === pairKey(f.id, player)) &&
        (f.personality === "Trader" ? chance(state, 0.5) : chance(state, 0.15))) {
      const sell = ["food", "timber", "materials"].sort((a, b) => f.resources[b] - f.resources[a])[0];
      if (f.resources[sell] >= O.tradeSurplus) p = { type: "trade", resource: sell, amount: 100 };
    }
    if (p) {
      state.pending.push({ kind: "overture", from: f.id, ...p });
      f.lastOvertureTurn = state.turn;
    }
  }

  // a Celtic people struck by Rome this season asks the player for help
  const hit = state.rome.lastConquest;
  if (hit && hit.turn === state.turn && hit.victim && hit.victim !== player && !state.factions[hit.victim]?.defeated &&
      !allied(state, hit.victim, player) && !atWar(state, hit.victim, player) && !waiting(hit.victim)) {
    state.pending.push({ kind: "overture", type: "plea", from: hit.victim, district: hit.districtId });
  }

  // Rome's envoys offer client status before the invasion; the AI decides for itself
  if (["presence", "infrastructure"].includes(state.rome.stage) && !state.rome.clientOffered) {
    state.rome.clientOffered = true;
    state.pending.push({ kind: "overture", type: "client", from: "rome", amount: O.clientTribute });
    for (const f of Object.values(state.factions)) {
      if (f.player || f.id === "rome" || f.defeated || !districtsOf(state, f.id).length) continue;
      if (["Trader", "Diplomat"].includes(f.personality) && chance(state, 0.5)) becomeClient(state, f.id);
    }
  }

  // New Political Reality: after a long invasion Rome offers peace on the borders as they stand
  const r = state.rome;
  if (r.stage === "invasion" && r.landedTurn && state.turn - r.landedTurn >= BALANCE.rome.settleAfterSeasons && !r.settled) {
    r.settled = true;
    const held = districtsOf(state, "rome").length;
    addChronicle(state, held >= 3
      ? `A new order settled on Britannia: Rome held ${held} districts and meant to stay.`
      : `Rome clung to ${held} district${held === 1 ? "" : "s"}, its grip on Britannia weaker than the histories remember.`, "HISTORICAL_DIVERGENCE");
    for (const f of Object.values(state.factions)) {
      if (f.id === "rome" || f.defeated || !atWar(state, "rome", f.id)) continue;
      if (f.player) state.pending.push({ kind: "overture", type: "romePeace", from: "rome" });
      else if (warWeary(state, f.id, "rome") || chance(state, 0.5)) { makePeace(state, "rome", f.id); setTruce(state, "rome", f.id, O.truceSeasons); }
    }
  }
}

function becomeClient(state, fid) {
  state.rome.clients = [...new Set([...(state.rome.clients || []), fid])];
  for (const o of Object.keys(state.factions)) if (o !== fid && o !== "rome") changeRelation(state, fid, o, O.clientResentment);
  addChronicle(state, `The ${fname(state, fid)} accepted Rome's friendship, and Rome's price.`, "HISTORICAL_DIVERGENCE");
}

// Called from rome.js each season: clients pay, or the treaty lapses.
export function collectClientTribute(state, notes) {
  for (const fid of [...(state.rome.clients || [])]) {
    const f = state.factions[fid];
    if (!f || f.defeated) continue;
    if (f.resources.wealth >= O.clientTribute) {
      f.resources.wealth -= O.clientTribute;
      continue;
    }
    state.rome.clients = state.rome.clients.filter((c) => c !== fid);
    addChronicle(state, `The ${f.name} could no longer pay Rome, and lost its protection.`);
    if (f.player) notes.push({ level: "critical", text: "You could not pay Rome's tribute. The treaty is broken." });
  }
}

// ---------- presentation and answers ----------

export function overtureView(state, p) {
  const from = fname(state, p.from);
  const me = state.factions[state.playerFactionId];
  const pay = (n) => me.resources.wealth >= n;
  switch (p.type) {
    case "tributeDemand": return {
      title: `${from} demand tribute`, icon: "warning",
      text: `The ${from} have gathered their host on your border. Their envoy says ${p.amount} Wealth would keep it there.`,
      choices: [
        { id: "pay", label: `Pay ${p.amount} Wealth`, hint: `A truce for ${O.truceSeasons} seasons; relations improve`, ok: pay(p.amount), reason: `Needs ${p.amount} Wealth` },
        { id: "refuse", label: "Send the envoy home", hint: "Relations fall, and they may take it as cause for war", ok: true },
      ] };
    case "tributeOffer": return {
      title: `${from} sue for peace`, icon: "dove",
      text: `Beaten and weary, the ${from} offer ${p.amount} Wealth if you end the war.`,
      choices: [
        { id: "accept", label: `Take the tribute and make peace`, hint: `+${p.amount} Wealth; a truce for ${O.truceSeasons} seasons`, ok: true },
        { id: "refuse", label: "Fight on", hint: "The war continues", ok: true },
      ] };
    case "trade": return {
      title: `${from} propose trade`, icon: "market",
      text: `The ${from} offer to sell you ${p.amount} ${p.resource} each season, for Wealth at the going rate.`,
      choices: [
        { id: "accept", label: "Agree", hint: "Cancel any time from the Diplomacy panel", ok: true },
        { id: "refuse", label: "Decline", hint: "No hard feelings", ok: true },
      ] };
    case "plea": return {
      title: `${from} beg for help`, icon: "eagle",
      text: `Rome has taken ${state.districts[p.district]?.name || "their land"}. The ${from} ask you to stand with them.`,
      choices: [
        { id: "aid", label: `Send ${O.aidWealth} Wealth in aid`, hint: "Relations with them rise sharply", ok: pay(O.aidWealth), reason: `Needs ${O.aidWealth} Wealth` },
        { id: "join", label: "Join the war against Rome", hint: "War with Rome and an alliance with them", ok: true },
        { id: "exploit", label: "Demand tribute for your friendship", hint: "Take what Wealth they can spare; they will not forget", ok: true },
        { id: "ignore", label: "Turn away", hint: "Relations with them fall", ok: true },
      ] };
    case "client": return {
      title: "Rome offers friendship", icon: "eagle",
      text: `A Roman envoy offers to name you a friend and ally of the Roman people. The price: ${p.amount} Wealth each season. While you pay, the legions will leave your lands alone.`,
      choices: [
        { id: "accept", label: "Accept Rome's friendship", hint: `−${p.amount} Wealth a season; other Celts will resent it`, ok: true },
        { id: "refuse", label: "Refuse", hint: "Rome will remember", ok: true },
      ] };
    case "passage": {
      const foe = fname(state, p.against);
      const V = BALANCE.rivalry;
      return {
        title: `${from} ask for passage`, icon: "armies",
        text: `The ${from} are at war with the ${foe}, and your lands lie between them. Their envoy asks that their hosts may cross your districts, and offers ${p.toll} Wealth for the road.`,
        choices: [
          { id: "grant", label: `Grant passage (+${p.toll} Wealth)`, hint: `Their hosts may march through and draw supply. The ${foe} will take it badly (${V.grant.rival}).`, ok: true },
          { id: "join", label: `Join the ${from} against the ${foe}`, hint: `An alliance with them and war with the ${foe}`, ok: !allied(state, me.id, p.against) && !atWar(state, me.id, p.from), reason: `You are allied with the ${foe}` },
          { id: "refuse", label: "Close your borders", hint: `Neither side crosses. The ${from} resent it (${V.refuse.requester}).`, ok: true },
        ] };
    }
    case "romePeace": return {
      title: "Rome offers peace", icon: "dove",
      text: "The invasion has settled into a long stalemate. Rome offers peace on the borders as they stand.",
      choices: [
        { id: "accept", label: "Accept the new borders", hint: `Peace with Rome and a truce for ${O.truceSeasons} seasons`, ok: true },
        { id: "refuse", label: "Fight on until Rome is gone", hint: "The war continues", ok: true },
      ] };
    default: return { title: "An envoy", icon: "scroll", text: "", choices: [{ id: "refuse", label: "Dismiss", ok: true }] };
  }
}

export function answerOverture(state, p, choiceId) {
  state.pending = state.pending.filter((x) => x !== p);
  const me = state.playerFactionId;
  const mine = state.factions[me].resources;
  const theirs = state.factions[p.from]?.resources;
  const view = overtureView(state, p);
  const choice = view.choices.find((c) => c.id === choiceId && c.ok) || view.choices[view.choices.length - 1];
  switch (`${p.type}:${choice.id}`) {
    case "tributeDemand:pay": mine.wealth -= p.amount; theirs.wealth += p.amount; changeRelation(state, me, p.from, 15); setTruce(state, me, p.from, O.truceSeasons); break;
    case "tributeDemand:refuse": changeRelation(state, me, p.from, -15); state.factions[p.from].memory.grudge = me; break;
    case "tributeOffer:accept": {
      const n = Math.min(p.amount, theirs.wealth);
      theirs.wealth -= n; mine.wealth += n;
      makePeace(state, me, p.from); setTruce(state, me, p.from, O.truceSeasons); break;
    }
    case "trade:accept": state.diplomacy.trades.push({ from: p.from, to: me, resource: p.resource, amount: p.amount }); changeRelation(state, me, p.from, 5); break;
    case "trade:refuse": break;
    case "plea:aid": mine.wealth -= O.aidWealth; theirs.wealth += O.aidWealth; changeRelation(state, me, p.from, 25); break;
    case "plea:join": declareWar(state, me, "rome"); formAlliance(state, me, p.from); changeRelation(state, me, p.from, 25); break;
    case "plea:exploit": {
      const n = Math.min(O.exploitWealth, theirs.wealth);
      theirs.wealth -= n; mine.wealth += n; changeRelation(state, me, p.from, -25); break;
    }
    case "plea:ignore": changeRelation(state, me, p.from, -10); break;
    case "client:accept": becomeClient(state, me); break;
    case "client:refuse": changeRelation(state, me, "rome", -10); break;
    case "passage:grant": {
      const R = BALANCE.rivalry;
      grantAccess(state, me, p.from);
      const n = Math.min(p.toll, theirs.wealth);
      theirs.wealth -= n; mine.wealth += n;
      changeRelation(state, me, p.from, R.grant.requester); changeRelation(state, me, p.against, R.grant.rival);
      addChronicle(state, `The ${fname(state, me)} let the hosts of the ${fname(state, p.from)} cross their land.`);
      break;
    }
    case "passage:join": formAlliance(state, me, p.from); declareWar(state, me, p.against); changeRelation(state, me, p.from, BALANCE.rivalry.join.requester); break;
    case "passage:refuse":
      changeRelation(state, me, p.from, BALANCE.rivalry.refuse.requester);
      state.factions[p.from].passageRefusals = (state.factions[p.from].passageRefusals || 0) + 1; // they ask less often
      break;
    case "romePeace:accept": makePeace(state, me, "rome"); setTruce(state, me, "rome", O.truceSeasons); break;
    default: if (p.from !== "rome") changeRelation(state, me, p.from, -5);
  }
}
