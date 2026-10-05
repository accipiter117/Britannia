// simulation/governance.js
// Owns control of districts after conquest: capture, Occupied / Administered / Integrated stages,
// Extract / Autonomy / Integrate policies, loyalty, culture shift, unrest and rebellion
// (End Season step 11), region status (step 14), and faction elimination.
// Conquest is fast; governance is slow.

import { BALANCE } from "../config/balance.js";
import { addChronicle, armiesIn, districtsOf, newArmy, uid } from "./campaign.js";
import { declareWar } from "./diplomacy.js";
import { chance } from "./random.js";
import { refugeesFrom } from "./events.js";

const O = BALANCE.occupation;
const L = BALANCE.loyalty;

export function captureDistrict(state, districtId, fid) {
  const d = state.districts[districtId];
  const prev = d.owner;
  d.owner = fid;
  d.previousOwner = prev;
  d.stage = "Occupied";
  d.stageSeasons = 0;
  d.loyalty = O.startingLoyaltyOnConquest;
  d.policy = "Integrate";
  d.garrison = null;
  d.construction = [];
  const player = state.playerFactionId;
  const taker = state.factions[fid].name;
  if (fid === "rome") refugeesFrom(state, districtId, []);
  if (prev === player) addChronicle(state, `${d.name} fell to ${taker}.`, "DEFEAT");
  else if (fid === player) addChronicle(state, `${d.name} was taken by the ${taker}.`, "VICTORY");
  else addChronicle(state, `${taker} took ${d.name}${prev ? ` from ${state.factions[prev].name}` : ""}.`, "BATTLE");
}

// Share of a district's output that reaches its owner, and unrest penalty.
export function governanceMultiplier(d) {
  let m = d.stage === "Integrated" ? 1 : BALANCE.policies[d.policy].outputToOwner;
  if (d.loyalty < L.unrest) m *= L.unrestOutputMult;
  return m;
}

export function setPolicy(state, fid, districtId, policy) {
  const d = state.districts[districtId];
  if (d.owner !== fid || d.stage === "Integrated" || !BALANCE.policies[policy]) return false;
  d.policy = policy;
  return true;
}

export function ownerCulture(state, d) {
  return state.factions[d.owner]?.culture || "celtic";
}

// ---------- step 11: occupation, loyalty, culture, rebellion ----------

export function resolveGovernance(state, notes) {
  const player = state.playerFactionId;
  for (const d of Object.values(state.districts)) {
    if (!d.owner) continue;
    const f = state.factions[d.owner];
    const garrisoned = armiesIn(state, d.id, d.owner).length > 0;
    const regionLoyalty = regionBonus(state, d.owner, d.region).loyalty || 0;
    let delta = regionLoyalty + (f.lastFoodStatus === "starving" ? L.starvingLoyalty : 0);
    if (d.stage === "Integrated") {
      delta += Math.sign(L.integratedTarget - d.loyalty) * Math.min(L.integratedDrift, Math.abs(L.integratedTarget - d.loyalty));
    } else {
      const pol = BALANCE.policies[d.policy];
      delta += pol.loyaltyPerSeason + (garrisoned ? L.garrisonBonus : 0);
      shiftCulture(d, ownerCulture(state, d), pol.culturePerSeason);
      d.stageSeasons += 1;
      if (d.stage === "Occupied" && d.stageSeasons >= O.toAdministered.seasons && (!O.toAdministered.needsGarrison || garrisoned)) {
        d.stage = "Administered";
        d.stageSeasons = 0;
        if (d.owner === player) notes.push({ level: "important", text: `${d.name} is now Administered.`, districtId: d.id });
      } else if (d.stage === "Administered" && d.stageSeasons >= O.toIntegrated.seasons && d.loyalty >= O.toIntegrated.minLoyalty) {
        d.stage = "Integrated";
        d.stageSeasons = 0;
        if (d.owner === player) notes.push({ level: "important", text: `${d.name} is fully Integrated into the realm.`, districtId: d.id });
        addChronicle(state, `${d.name} became part of the ${f.name} in heart as well as name.`);
      }
    }
    d.loyalty = Math.max(0, Math.min(100, Math.round(d.loyalty + delta)));

    if (d.loyalty < L.rebellionRisk && chance(state, L.rebellionChancePerSeason)) rebel(state, d, notes);
    else if (d.loyalty < L.unrest && d.owner === player) notes.push({ level: "critical", text: `Unrest in ${d.name} (loyalty ${d.loyalty}). Rebellion looms below ${L.rebellionRisk}.`, districtId: d.id });
  }
}

function shiftCulture(d, toward, pct) {
  if (!pct) return;
  const other = toward === "roman" ? "celtic" : "roman";
  const move = Math.min(pct, d.culture[other] || 0);
  d.culture[other] -= move;
  d.culture[toward] = (d.culture[toward] || 0) + move;
}

function rebel(state, d, notes) {
  const oldOwner = d.owner;
  // a garrison crushes the rising before it can take the district, at a cost in lives
  if (armiesIn(state, d.id, oldOwner).length) {
    const dead = Math.round(d.population * L.rebelArmyPctOfPop * 0.5);
    d.population -= dead;
    d.loyalty = Math.min(100, d.loyalty + L.suppressedLoyalty);
    addChronicle(state, `A rising in ${d.name} was put down by the ${state.factions[oldOwner].name}; ${dead} died.`, "REBELLION");
    if (oldOwner === state.playerFactionId) notes.push({ level: "critical", text: `Your garrison crushed a rising in ${d.name}. ${dead} dead.`, districtId: d.id });
    return;
  }
  const emergent = Object.values(state.factions).filter((f) => f.emergent && districtsOf(state, f.id).length);
  addChronicle(state, `${d.name} rose in rebellion against the ${state.factions[oldOwner].name}.`, "REBELLION");
  if (oldOwner === state.playerFactionId) notes.push({ level: "critical", text: `${d.name} has rebelled!`, districtId: d.id });
  for (const a of armiesIn(state, d.id, oldOwner)) a.morale = Math.max(0, a.morale - 20);

  if (emergent.length >= L.maxEmergentFactions) {
    d.owner = null;
    d.garrison = { levies: Math.round(d.population * L.rebelArmyPctOfPop), stance: "Defensive" };
    Object.assign(d, { stage: "Integrated", loyalty: 60, policy: "Integrate" });
    return;
  }
  const id = uid(state, "rebels");
  state.factions[id] = {
    id, name: `Free Folk of ${d.name}`, culture: d.culture.roman > 50 ? "roman" : "celtic", colour: BALANCE.loyalty.rebelColour,
    player: false, resources: { food: 200, timber: 100, materials: 100, wealth: 100 },
    starvingSeasons: 0, lastFoodStatus: "stable", personality: "Defender", mode: "SURVIVE",
    memory: { threat: {}, battles: [] }, emergent: true,
  };
  const troops = Math.max(100, Math.round((d.population * L.rebelArmyPctOfPop) / 100) * 100);
  d.population -= troops;
  Object.assign(d, { owner: id, stage: "Integrated", stageSeasons: 0, loyalty: 70, policy: "Integrate" });
  state.armies.push(newArmy(uid(state, "army"), `Rebels of ${d.name}`, id, d.id, [{ type: "levies", troops }]));
  declareWar(state, id, oldOwner);
}

// ---------- step 14: regions ----------

export function regionStatus(state, fid, regionId) {
  const inRegion = Object.values(state.districts).filter((d) => d.region === regionId);
  const share = inRegion.filter((d) => d.owner === fid).length / inRegion.length;
  let status = null;
  for (const s of BALANCE.regionStatus) if (share >= s.minShare) status = s.id;
  return status;
}

export function regionBonus(state, fid, regionId) {
  return BALANCE.regionBonuses[regionStatus(state, fid, regionId)] || {};
}

export function resolveRegions(state, notes) {
  state.regionStatus ||= {};
  const player = state.playerFactionId;
  for (const r of state.regions) {
    const before = state.regionStatus[r.id] || {};
    const now = {};
    for (const fid of Object.keys(state.factions)) {
      const s = regionStatus(state, fid, r.id);
      if (s) now[fid] = s;
    }
    if (now[player] && now[player] !== before[player]) {
      notes.push({ level: "important", text: `${r.name}: your standing is now ${now[player]}.` });
      if (now[player] === "Complete") addChronicle(state, `The ${state.factions[player].name} held all of the ${r.name}.`, "VICTORY");
    }
    state.regionStatus[r.id] = now;
  }
}

// ---------- elimination ----------

export function checkEliminations(state) {
  for (const f of Object.values(state.factions)) {
    if (f.defeated) continue;
    if (f.id === "rome" && state.rome.stage !== "invasion") continue;
    const hasLand = districtsOf(state, f.id).length > 0;
    const hasArmy = state.armies.some((a) => a.factionId === f.id);
    if (hasLand || hasArmy) continue;
    f.defeated = true;
    state.diplomacy.wars = state.diplomacy.wars.filter((k) => !k.split("|").includes(f.id));
    state.diplomacy.trades = state.diplomacy.trades.filter((t) => t.from !== f.id && t.to !== f.id);
    addChronicle(state, `The ${f.name} ${f.id === "rome" ? "were driven from Britannia" : "passed out of history"}.`, "FACTION_DEFEATED");
  }
}

// AI governance: ease off when loyalty sinks, integrate when it is safe.
export function aiGovern(state, fid) {
  for (const d of districtsOf(state, fid)) {
    if (d.stage === "Integrated") continue;
    d.policy = d.loyalty < BALANCE.ai.loyaltyForAutonomy ? "Autonomy" : "Integrate";
  }
}
