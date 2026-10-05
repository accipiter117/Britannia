// simulation/ai.js
// Owns the Celtic AI factions (End Season step 10). Each season a faction weighs Threat,
// Opportunity and Need from what it can see, picks SURVIVE / PROSPER / EXPAND, then builds,
// recruits, moves and attacks with the same rules and resources as the player. No cheats.
// Rome has its own behaviour in rome.js.

import { BALANCE } from "../config/balance.js";
import { armiesIn, districtsOf, neighbours } from "./campaign.js";
import {
  armyStrength, canRecruit, entryKind, garrisonStrength, moveArmy, reachable, recruit, setStance, visibleArmies,
} from "./armies.js";
import { canBuild, forecast, startBuilding, districtProduction } from "./economy.js";
import { allied, atWar, declareWar, formAlliance, relation, warWeary, willAccept, makePeace } from "./diplomacy.js";
import { engagePlayer, playerDefends, resolveEngagementAuto } from "./engagement.js";
import { supplyDistance } from "./supply.js";
import { aiGovern } from "./governance.js";
import { inTruce, resolveOvertures } from "./overtures.js";

const A = BALANCE.ai;

export function resolveAI(state, notes) {
  for (const f of Object.values(state.factions)) {
    if (f.player || f.id === "rome" || f.defeated || !districtsOf(state, f.id).length) continue;
    const view = assess(state, f.id);
    const pers = A.personalities[f.personality] || {};
    f.mode = view.threat > A.surviveThreatThreshold / (pers.survive || 1) ? "SURVIVE"
      : view.opportunity * (pers.expand || 1) > A.expandOpportunityThreshold ? "EXPAND" : "PROSPER";
    aiGovern(state, f.id);
    economy(state, f.id, view);
    military(state, f.id, view, notes);
    diplomacy(state, f.id, view);
  }
  resolveOvertures(state);
}

// ---------- perception ----------

function hostileTo(state, fid, other) {
  return other !== fid && (atWar(state, fid, other) || other === "rome" || relation(state, fid, other) <= BALANCE.diplomacy.states.Hostile);
}

function assess(state, fid) {
  const ours = state.armies.filter((a) => a.factionId === fid).reduce((n, a) => n + armyStrength(a), 0) || 0.1;
  const owned = new Set(districtsOf(state, fid).map((d) => d.id));
  const seen = visibleArmies(state, fid).filter((a) => a.factionId !== fid);
  // threat: hostile armies on or next to our land, against our own strength
  let danger = 0;
  const threatBy = {};
  const threatened = {};
  for (const a of seen) {
    if (!hostileTo(state, fid, a.factionId)) continue;
    const close = owned.has(a.districtId) || neighbours(state, a.districtId).some((n) => owned.has(n));
    if (!close) continue;
    const s = armyStrength(a);
    danger += s;
    threatBy[a.factionId] = (threatBy[a.factionId] || 0) + s;
    for (const n of [a.districtId, ...neighbours(state, a.districtId)]) if (owned.has(n)) threatened[n] = (threatened[n] || 0) + s;
  }
  state.factions[fid].memory.threat = threatBy;
  const target = bestTarget(state, fid, ours);
  const fc = forecast(state, fid);
  return { ours, threat: danger / ours, threatened, target, opportunity: target ? target.score : 0, foodNet: fc.net.food, fc };
}

// Target value = territory + resources + strategic + population - distance - defence - supply - diplomatic risk
function bestTarget(state, fid, ours) {
  const W = A.targetWeights;
  const pers = A.personalities[state.factions[fid].personality] || {};
  const seenArmies = visibleArmies(state, fid);
  let best = null;
  for (const army of state.armies.filter((a) => a.factionId === fid)) {
    for (const [did, route] of Object.entries(reachable(state, army))) {
      const d = state.districts[did];
      if (d.owner === fid) continue;
      if (route.kind === "move" && d.owner) continue; // passing through friends is not a conquest
      const notAtWar = d.owner && !atWar(state, fid, d.owner);
      if (notAtWar && (allied(state, fid, d.owner) || d.owner === "rome" || inTruce(state, fid, d.owner))) continue;
      const defence = seenArmies.filter((a) => a.districtId === did && a.factionId !== fid && (!d.owner || a.factionId === d.owner || atWar(state, fid, a.factionId)))
        .reduce((n, a) => n + armyStrength(a), 0) + garrisonStrength(d);
      const mine = armyStrength(army);
      // walls and hillforts count, and a recent bloody nose is remembered
      const walls = 1 + d.special.reduce((n, sp) => n + (BALANCE.specialBonuses[sp]?.defence || 0), 0) + (d.buildings.includes("fortification") ? BALANCE.buildings.fortification.effect.defence : 0);
      const burned = state.factions[fid].memory.battles.some((b) => b.district === did && !b.won && state.turn - b.turn <= A.memorySeasons / 2);
      if (burned || mine < defence * walls * A.attackStrengthRatio) continue;
      const prod = districtProduction(state, d, "Summer").total;
      const prefers = (pers.prefers || []).some((p) => p === d.terrain || d.special.some((s) => s.includes(p)) || d.buildings.includes(p));
      const score = W.territory * 0.3 +
        W.resources * ((prod.food + prod.timber + prod.materials + prod.wealth) / 1000) +
        W.strategic * (neighbours(state, did).length / 6 + (prefers ? 0.3 : 0)) +
        W.population * (d.population / 4000) +
        W.distance * (route.cost / 6) +
        W.defence * (defence / Math.max(0.1, mine)) +
        W.supplyDifficulty * (supplyDistance(state, fid, did) / 3) +
        W.diplomaticRisk * (notAtWar ? 1 : 0) * (pers.attackWeakened ? 0.5 : 1);
      if (!best || score > best.score) best = { score, districtId: did, armyId: army.id, needsWar: notAtWar, owner: d.owner };
    }
  }
  return best;
}

// ---------- economy ----------

function economy(state, fid, view) {
  const pers = state.factions[fid].personality;
  const res = state.factions[fid].resources;
  const hungry = view.foodNet < 0;
  const reserve = hungry ? 0 : view.threat > 0 ? 120 : 40; // food first; otherwise keep Wealth for recruits
  const wishes = [];
  if (hungry || view.fc.season === "Autumn") wishes.push("farm", "farm");
  if (view.fc.season === "Summer" || view.fc.season === "Autumn") wishes.push("granary");
  if (pers === "Trader") wishes.push("market");
  if (pers === "Warrior" || state.factions[fid].mode === "EXPAND") wishes.push("warrior_hall");
  if (state.factions[fid].mode === "SURVIVE") wishes.push("fortification");
  wishes.push("farm", "market", "mine", "timber_camp", "workshop");

  let built = 0;
  for (const b of wishes) {
    if (built >= 2) break;
    const districts = districtsOf(state, fid).sort((x, y) => (view.threatened[y.id] || 0) - (view.threatened[x.id] || 0));
    for (const d of districts) {
      const check = canBuild(state, fid, d.id, b);
      if (!check.ok || res.wealth - (check.cost.wealth || 0) < reserve) continue;
      startBuilding(state, fid, d.id, b);
      built++;
      break;
    }
  }
}

// ---------- military ----------

function military(state, fid, view, notes) {
  const f = state.factions[fid];
  const res = f.resources;
  // recruit: worried or expanding factions spend; prosperous ones keep a modest host
  // a hungry faction only recruits when its survival is at stake
  const hungry = view.foodNet < 0 && f.mode !== "SURVIVE";
  const pers = A.personalities[f.personality] || {};
  // in peacetime, keep pace with the strongest neighbour we can see (Warriors want an edge)
  const rival = Math.max(0, ...Object.values(strengthByFaction(state, fid)));
  const peace = Math.max(6, rival * (pers.expand || 1) * A.peacetimeArmsRatio);
  const wantStrength = hungry ? 0 : f.mode === "SURVIVE" ? view.ours * (1 + view.threat) : f.mode === "EXPAND" ? view.ours * 1.3 : peace;
  let strength = view.ours;
  const homes = districtsOf(state, fid).sort((a, b) => (view.threatened[b.id] || 0) - (view.threatened[a.id] || 0) || b.population - a.population);
  for (let i = 0; i < 4 && strength < wantStrength && res.wealth > 40; i++) {
    const d = homes[i % homes.length];
    const type = canRecruit(state, fid, d.id, "warriors").ok ? "warriors" : "levies";
    if (!recruit(state, fid, d.id, type).ok) break;
    strength += BALANCE.formations[type].strength;
  }

  const armies = state.armies.filter((a) => a.factionId === fid && a.movesLeft > 0);
  if (f.mode === "SURVIVE") {
    const worst = Object.entries(view.threatened).sort((a, b) => b[1] - a[1])[0]?.[0];
    for (const a of armies) {
      setStance(state, a.id, "Defensive");
      if (worst && a.districtId !== worst) {
        const route = reachable(state, a)[worst];
        if (route && route.kind === "move") moveArmy(state, a.id, worst);
      }
    }
    return;
  }
  if (f.mode === "EXPAND" && view.target) {
    const t = view.target;
    const army = state.armies.find((a) => a.id === t.armyId);
    if (t.needsWar) {
      if (state.turn < A.earliestWarSeason) return;
      const pers = A.personalities[f.personality] || {};
      const rel = relation(state, fid, t.owner);
      const bold = ((pers.expand || 1) >= 1.1 && rel <= BALANCE.diplomacy.states.Neutral) || f.memory.grudge === t.owner;
      if (!bold && rel > BALANCE.diplomacy.states.Suspicious) return;
      // declare now, march next season: the enemy gets one season of warning
      declareWar(state, fid, t.owner);
      if (t.owner === state.playerFactionId) notes.push({ level: "critical", text: `${f.name} has declared war on you! Their host stands at ${state.districts[army.districtId].name}.`, districtId: army.districtId });
      setStance(state, army.id, "Aggressive");
      return;
    }
    if (entryKind(state, army, t.districtId).kind !== "attack" && state.districts[t.districtId].owner) return;
    setStance(state, army.id, "Aggressive");
    const r = moveArmy(state, army.id, t.districtId);
    if (!r.ok || !r.engagement) return;
    const eng = r.engagement;
    if (playerDefends(state, eng)) {
      const out = engagePlayer(state, eng);
      notes.push({ level: "critical", text: out.pending ? `${army.name} of ${f.name} marches on ${state.districts[t.districtId].name}! Choose your response.` : out.text, districtId: t.districtId });
    } else {
      const text = resolveEngagementAuto(state, eng);
      if (visibleToPlayer(state, t.districtId)) notes.push({ level: "important", text, districtId: t.districtId });
    }
    return;
  }
  // PROSPER: armies drift home and stand easy
  for (const a of armies) {
    if (a.stance !== "Normal") setStance(state, a.id, "Normal");
    if (state.districts[a.districtId].owner !== fid) {
      const home = Object.entries(reachable(state, a)).find(([did, r]) => r.kind === "move" && state.districts[did].owner === fid);
      if (home) moveArmy(state, a.id, home[0]);
    }
  }
}

function strengthByFaction(state, fid) {
  const out = {};
  for (const a of visibleArmies(state, fid)) {
    if (a.factionId === fid || allied(state, fid, a.factionId)) continue;
    out[a.factionId] = (out[a.factionId] || 0) + armyStrength(a);
  }
  return out;
}

function visibleToPlayer(state, did) {
  const p = state.playerFactionId;
  return state.districts[did].owner === p || neighbours(state, did).some((n) => state.districts[n].owner === p) || armiesIn(state, did, p).length > 0;
}

// ---------- diplomacy ----------

function diplomacy(state, fid, view) {
  const f = state.factions[fid];
  const player = state.playerFactionId;
  for (const other of Object.keys(state.factions)) {
    if (other === fid || state.factions[other].defeated) continue;
    // sue for peace when losing
    if (atWar(state, fid, other) && warWeary(state, fid, other) && view.threat > 0.5) {
      if (other === player) {
        // a faction that can pay offers tribute instead (overtures.js)
        if (f.resources.wealth < BALANCE.overtures.tributeAmount && !state.pending.some((p) => p.from === fid)) state.pending.push({ kind: "proposal", from: fid, action: "peace" });
      } else if (willAccept(state, fid, other, "peace")) makePeace(state, fid, other);
    }
    // close ranks against a shared enemy (above all Rome)
    const shared = Object.keys(f.memory.threat).some((e) => state.factions[other].memory?.threat?.[e]);
    const unity = state.rome.stage === "invasion" && other !== "rome" && relation(state, fid, other) >= BALANCE.rome.celticUnityRelation;
    if ((shared || unity) && !allied(state, fid, other) && !atWar(state, fid, other) && other !== "rome" &&
        (unity || relation(state, fid, other) >= BALANCE.diplomacy.allianceMinRelation - 20)) {
      if (other === player) {
        if (!state.pending.some((p) => p.kind === "proposal" && p.from === fid)) state.pending.push({ kind: "proposal", from: fid, action: "alliance" });
      } else if (willAccept(state, fid, other, "alliance") || relation(state, fid, other) >= 0) formAlliance(state, fid, other);
    }
  }
}
