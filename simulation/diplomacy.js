// simulation/diplomacy.js
// Owns relations between factions: relation values and states, war and peace, alliances,
// military access and trade agreements, plus End Season steps 8 (trade) and 9 (diplomacy).
// Neutral districts (owner null) are not a faction: they can always be attacked.

import { BALANCE } from "../config/balance.js";
import { addChronicle, armiesIn, districtsOf, neighbours } from "./campaign.js";

const D = BALANCE.diplomacy;
export const pairKey = (a, b) => [a, b].sort().join("|");

// ---------- relations ----------

export function relation(state, a, b) {
  if (!a || !b || a === b) return 0;
  return state.diplomacy.relations[pairKey(a, b)] ?? D.startingRelations;
}

export function changeRelation(state, a, b, delta) {
  if (!a || !b || a === b) return;
  const [lo, hi] = D.relationRange;
  state.diplomacy.relations[pairKey(a, b)] = Math.max(lo, Math.min(hi, Math.round(relation(state, a, b) + delta)));
}

export function relationState(value) {
  if (value <= D.states.Hostile) return "Hostile";
  if (value <= D.states.Suspicious) return "Suspicious";
  if (value <= D.states.Neutral) return "Neutral";
  return "Friendly";
}

// ---------- war, peace, alliance, access ----------

export function atWar(state, a, b) {
  if (!a || !b) return true; // neutral militia always fight intruders
  if (a === b) return false;
  return state.diplomacy.wars.includes(pairKey(a, b));
}

export function allied(state, a, b) {
  return !!a && !!b && a !== b && state.diplomacy.alliances.includes(pairKey(a, b));
}

// owner lets mover's armies pass and draw supply
export function hasAccess(state, mover, owner) {
  if (!owner) return false;
  return mover === owner || allied(state, mover, owner) || state.diplomacy.access.includes(`${owner}>${mover}`);
}

export function declareWar(state, a, b) {
  if (!a || !b || atWar(state, a, b)) return;
  const dip = state.diplomacy;
  dip.wars.push(pairKey(a, b));
  dip.alliances = dip.alliances.filter((k) => k !== pairKey(a, b));
  dip.access = dip.access.filter((k) => k !== `${a}>${b}` && k !== `${b}>${a}`);
  dip.trades = dip.trades.filter((t) => pairKey(t.from, t.to) !== pairKey(a, b));
  changeRelation(state, a, b, D.declareWar);
  addChronicle(state, `${state.factions[a].name} declared war on ${state.factions[b].name}.`);
  callAllies(state, b, a);
}

export function makePeace(state, a, b) {
  state.diplomacy.wars = state.diplomacy.wars.filter((k) => k !== pairKey(a, b));
  addChronicle(state, `${state.factions[a].name} and ${state.factions[b].name} made peace.`);
}

export function formAlliance(state, a, b) {
  if (allied(state, a, b) || atWar(state, a, b)) return;
  state.diplomacy.alliances.push(pairKey(a, b));
  addChronicle(state, `${state.factions[a].name} and ${state.factions[b].name} swore an alliance.`, "ALLIANCE");
}

export function grantAccess(state, owner, mover) {
  const key = `${owner}>${mover}`;
  if (!state.diplomacy.access.includes(key)) state.diplomacy.access.push(key);
}

// When `victim` is attacked by `aggressor`, its allies are asked to honour the alliance.
// AI allies decide at once; the player gets a pending decision.
function callAllies(state, victim, aggressor) {
  for (const k of state.diplomacy.alliances) {
    if (!k.split("|").includes(victim)) continue;
    const ally = k.split("|").find((x) => x !== victim);
    if (ally === aggressor || atWar(state, ally, aggressor)) continue;
    if (state.factions[ally].player) {
      state.pending.push({ kind: "allyCall", ally, victim, aggressor });
    } else {
      answerAllyCall(state, ally, victim, aggressor, aiAllyAnswer(state, ally, aggressor));
    }
  }
}

function aiAllyAnswer(state, ally, aggressor) {
  const p = state.factions[ally].personality;
  if (p === "Warrior" || p === "Diplomat") return "honour";
  return relation(state, ally, aggressor) < 0 ? "honour" : "limited";
}

// answer: "honour" (join the war), "limited" (send wealth), "refuse"
export function answerAllyCall(state, ally, victim, aggressor, answer) {
  if (answer === "honour") {
    declareWar(state, ally, aggressor); // also ends any alliance, access or trade with the aggressor
    addChronicle(state, `${state.factions[ally].name} honoured its alliance and marched against ${state.factions[aggressor].name}.`, "ALLIANCE");
  } else if (answer === "limited") {
    const res = state.factions[ally].resources;
    const gift = Math.min(res.wealth, D.limitedAssistanceWealth);
    res.wealth -= gift;
    state.factions[victim].resources.wealth += gift;
    changeRelation(state, ally, victim, D.limitedAssistance);
  } else {
    changeRelation(state, ally, victim, D.refuseAllianceCall);
  }
}

// ---------- AI acceptance (no cheats: decided from relations, strength and circumstance) ----------

export function willAccept(state, proposer, target, action) {
  const rel = relation(state, proposer, target);
  const p = state.factions[target].personality;
  if (action === "trade") return !atWar(state, proposer, target) && rel > D.states.Suspicious;
  if (action === "access") return !atWar(state, proposer, target) && rel > D.accessMinRelation;
  if (action === "alliance") return !atWar(state, proposer, target) && rel >= D.allianceMinRelation - (p === "Diplomat" ? 10 : 0);
  if (action === "peace") return rel > D.states.Hostile || warWeary(state, target, proposer);
  return false;
}

function strength(state, fid) {
  return state.armies.filter((a) => a.factionId === fid)
    .reduce((n, a) => n + a.formations.reduce((m, f) => m + (f.troops / 100) * BALANCE.formations[f.type].strength, 0), 0);
}

export function warWeary(state, fid, enemy) {
  return strength(state, fid) < strength(state, enemy) * D.peaceStrengthRatio;
}

// ---------- trade (step 8) ----------

// A trade route needs a physical link: one of `a`'s districts adjacent to (or connected by road to)
// one of `b`'s, with no army at war with either side standing in those districts.
export function tradeLinked(state, a, b) {
  const blocked = (did) => armiesIn(state, did).some((x) => atWar(state, x.factionId, a) || atWar(state, x.factionId, b));
  return districtsOf(state, a).some((d) => !blocked(d.id) &&
    neighbours(state, d.id).some((n) => state.districts[n].owner === b && !blocked(n)));
}

// Without a Market, middlemen take a cut: the seller gets less and the buyer pays more.
export function tradePrice(state, t) {
  const price = Math.round(t.amount / D.exchangeRates[t.resource]);
  const cut = (fid) => (hasMarket(state, fid) ? 1 : D.noMarketRate);
  return { price, gets: Math.round(price * cut(t.from)), pays: Math.round(price / cut(t.to)) };
}

export function hasMarket(state, fid) {
  return districtsOf(state, fid).some((d) => d.buildings.includes("market"));
}

// Trade agreement: `from` sells `amount` of `resource` to `to` each season at the exchange rate.
export function resolveTrade(state, notes) {
  for (const t of state.diplomacy.trades) {
    const seller = state.factions[t.from], buyer = state.factions[t.to];
    const { pays, gets } = tradePrice(state, t);
    const linked = tradeLinked(state, t.from, t.to);
    t.disrupted = !linked || seller.resources[t.resource] < t.amount || buyer.resources.wealth < pays;
    if (t.disrupted) {
      if (seller.player || buyer.player) notes.push({ level: "important", text: `Trade with ${(seller.player ? buyer : seller).name} disrupted${linked ? ": not enough to exchange" : ": no safe route"}.` });
      continue;
    }
    seller.resources[t.resource] -= t.amount;
    buyer.resources[t.resource] += t.amount;
    buyer.resources.wealth -= pays;
    seller.resources.wealth += gets;
    changeRelation(state, t.from, t.to, D.tradeRelationGain);
  }
}

// ---------- relation drift (step 9) ----------

export function resolveDiplomacy(state) {
  const ids = Object.keys(state.factions);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      const r = relation(state, a, b);
      if (r !== 0 && !atWar(state, a, b)) changeRelation(state, a, b, -Math.sign(r) * Math.min(Math.abs(r), D.decayToNeutralPerSeason));
      if (bordering(state, a, b)) changeRelation(state, a, b, D.borderArmyPenalty);
    }
  }
}

// An army of one faction standing next to the other's territory (not invited in).
function bordering(state, a, b) {
  const near = (x, y) => state.armies.some((army) => army.factionId === x &&
    state.districts[army.districtId].owner !== y &&
    neighbours(state, army.districtId).some((n) => state.districts[n].owner === y));
  return !allied(state, a, b) && (near(a, b) || near(b, a));
}

// ---------- player actions (each returns { ok, text }) ----------

export function playerAction(state, other, action, opts = {}) {
  const me = state.playerFactionId;
  const them = state.factions[other];
  const res = state.factions[me].resources;
  const no = (text) => ({ ok: false, text });
  switch (action) {
    case "war":
      declareWar(state, me, other);
      return { ok: true, text: `You are at war with the ${them.name}.` };
    case "peace":
      if (!willAccept(state, me, other, "peace")) return no(`The ${them.name} refuse peace while they hold the upper hand.`);
      makePeace(state, me, other);
      return { ok: true, text: `Peace with the ${them.name}.` };
    case "alliance":
      if (!willAccept(state, me, other, "alliance")) return no(`The ${them.name} want warmer relations first (${D.allianceMinRelation}+).`);
      formAlliance(state, me, other);
      return { ok: true, text: `You are allied with the ${them.name}.` };
    case "access":
      if (!willAccept(state, me, other, "access")) return no(`The ${them.name} will not open their lands to your armies (needs relations above ${D.accessMinRelation}).`);
      grantAccess(state, other, me);
      return { ok: true, text: `Your armies may pass through ${them.name} lands.` };
    case "tribute": {
      const r = opts.resource || "wealth";
      if (res[r] < D.tributeAmount) return no(`You need ${D.tributeAmount} ${r}.`);
      res[r] -= D.tributeAmount;
      them.resources[r] += D.tributeAmount;
      changeRelation(state, me, other, D.tributeRelationGain);
      return { ok: true, text: `Tribute sent. The ${them.name} look on you more kindly.` };
    }
    case "trade": {
      const check = canTrade(state, other);
      if (!check.ok) return no(check.reason);
      const t = opts.sell ? { from: me, to: other } : { from: other, to: me };
      state.diplomacy.trades.push({ ...t, resource: opts.resource, amount: opts.amount });
      return { ok: true, text: `Trade agreed: ${opts.amount} ${opts.resource} per season ${opts.sell ? "sold to" : "bought from"} the ${them.name}.` };
    }
    default:
      return no("Unknown action");
  }
}

export function canTrade(state, other) {
  const me = state.playerFactionId;
  if (atWar(state, me, other)) return { ok: false, reason: "At war" };
  if (!tradeLinked(state, me, other)) return { ok: false, reason: "No safe route between your lands" };
  if (!willAccept(state, me, other, "trade")) return { ok: false, reason: "They distrust you too much to trade" };
  return { ok: true };
}

export function cancelTrade(state, index) {
  state.diplomacy.trades.splice(index, 1);
}
