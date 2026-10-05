// simulation/battle.js
// Owns the compact tactical battle: a 12x12 grid, formation blocks, real-time ticks, morale,
// terrain, flanking, routing and victory. Pure and DOM-free: the UI calls tick() on a timer and
// issues orders; auto-resolve runs the same simulation with both sides on AI control.

import { BALANCE } from "../config/balance.js";
import { hashString, seeded } from "./random.js";

const B = BALANCE.battle;
const N = B.gridSize;
const ACTIVE = (u) => u.state !== "Gone" && u.state !== "Routing";

// ---------- battlefield ----------

export function makeGrid(district, seed) {
  const r = seeded(seed);
  const g = Array.from({ length: N }, () => Array(N).fill("open"));
  const scatter = (kind, share, clusters) => {
    for (let c = 0; c < clusters; c++) {
      let x = Math.floor(r() * N), y = 2 + Math.floor(r() * (N - 4));
      for (let i = 0; i < (share * N * N) / clusters; i++) {
        g[y][x] = kind;
        x = Math.max(0, Math.min(N - 1, x + Math.floor(r() * 3) - 1));
        y = Math.max(1, Math.min(N - 2, y + Math.floor(r() * 3) - 1));
      }
    }
  };
  const t = district.terrain;
  if (t === "forest") scatter("forest", 0.35, 5);
  if (t === "hills") { scatter("hill", 0.25, 4); scatter("forest", 0.06, 2); }
  if (t === "marsh") scatter("river", 0.16, 6);
  if (t === "fertile" || t === "plains") scatter("forest", 0.06, 2);
  if (t === "coast") scatter("hill", 0.06, 2);
  if (district.special.includes("river") || district.special.includes("river_crossing")) {
    const y = 5 + Math.floor(r() * 2);
    const fords = [Math.floor(r() * 4) + 1, Math.floor(r() * 4) + 7];
    for (let x = 0; x < N; x++) g[y][x] = fords.includes(x) ? "road" : "river";
  }
  if (district.special.includes("roman_road")) for (let y = 0; y < N; y++) if (g[y][5] !== "river") g[y][5] = "road";
  return g;
}

// ---------- setup ----------

// sides: { attacker: Force, defender: Force } where Force = { factionId, armies: [army], garrison?: n }
// opts: { type: "field" | "defensive", ambush, fortification (defence bonus near objective), playerSide }
export function createBattle(district, sides, opts) {
  const seed = hashString(district.id) + (opts.seed || 0);
  const grid = makeGrid(district, seed);
  const bottom = opts.playerSide || "attacker";
  const battle = {
    districtId: district.id, districtName: district.name, terrain: district.terrain,
    type: opts.type, ambush: !!opts.ambush, fortification: opts.fortification || 0,
    playerSide: opts.playerSide || null, bottom,
    grid, units: [], time: 0, over: false, result: null, captureTimer: 0,
    objective: opts.type === "defensive" ? { x: 6, y: bottom === "defender" ? N - 3 : 2 } : null,
    sides: {
      attacker: { factionId: sides.attacker.factionId, commander: bestCommander(sides.attacker.armies) },
      defender: { factionId: sides.defender.factionId, commander: sides.defender.armies.length ? bestCommander(sides.defender.armies) : "Average" },
    },
    log: [],
  };
  deploy(battle, "attacker", sides.attacker);
  deploy(battle, "defender", sides.defender);
  // the commander rides with the strongest block on each side
  for (const side of ["attacker", "defender"]) {
    const lead = battle.units.filter((u) => u.side === side).sort((a, b) => b.troops * BALANCE.formations[b.type].strength - a.troops * BALANCE.formations[a.type].strength)[0];
    if (lead) { lead.commander = true; lead.wasCommander = true; }
  }
  battle.rng = (seed ^ 0x5bd1e995) | 0;
  if (battle.ambush) for (const u of battle.units) if (u.side === "attacker") u.morale -= B.ambushMoraleHit;
  return battle;
}

function bestCommander(armies) {
  const order = ["Poor", "Average", "Skilled", "Exceptional"];
  return armies.reduce((best, a) => (order.indexOf(a.commander) > order.indexOf(best) ? a.commander : best), "Poor");
}

function deploy(battle, side, force) {
  const blocks = [];
  for (const army of force.armies) {
    const start = Math.max(0, army.morale - (army.fatigue / 20) * B.moraleLoss.fatiguePer20);
    for (const f of army.formations) blocks.push({ armyId: army.id, type: f.type, troops: f.troops, morale: start, experience: army.experience, stance: army.stance });
  }
  if (force.garrison) blocks.push({ armyId: null, type: "levies", troops: force.garrison, morale: B.morale.start, experience: "Green", stance: BALANCE.neutralGarrison.stance });
  // grow the block size until every block has a cell: 12 front (melee), 12 back (ranged), 12 overflow
  const fits = (size) => {
    const count = (ranged) => blocks.filter((b) => !!BALANCE.formations[b.type].ranged === ranged).reduce((n, b) => n + Math.ceil(b.troops / size), 0);
    const melee = count(false), ranged = count(true);
    return melee + ranged <= B.maxBlocksPerSide && Math.max(0, melee - N) + Math.max(0, ranged - N) <= N;
  };
  let size = B.troopsPerBlock;
  while (!fits(size)) size += 50;

  const units = [];
  for (const b of blocks) {
    let left = b.troops;
    while (left > 0) {
      const troops = Math.min(size, left);
      left -= troops;
      units.push({ ...b, troops });
    }
  }
  // melee in front, skirmishers behind; the bottom side deploys on rows N-2/N-1
  const atBottom = battle.bottom === side;
  const front = atBottom ? N - 2 : 1, back = atBottom ? N - 1 : 0;
  const melee = units.filter((u) => !BALANCE.formations[u.type].ranged);
  const ranged = units.filter((u) => BALANCE.formations[u.type].ranged);
  const rows = [[front, melee], [back, ranged]];
  for (const [row, list] of rows) placeRow(battle, side, list, row);
  const overflow = units.filter((u) => u.x === undefined);
  placeRow(battle, side, overflow, atBottom ? N - 3 : 2);
  // ambush: the defenders lie in wait three rows further forward
  if (battle.ambush && side === "defender") {
    for (const u of battle.units.filter((x) => x.side === "defender")) u.y = atBottom ? Math.min(N - 1, u.y - 3) : u.y + 3;
  }
}

function placeRow(battle, side, list, row) {
  const order = [6, 5, 7, 4, 8, 3, 9, 2, 10, 1, 11, 0];
  let i = 0;
  for (const u of list) {
    while (i < order.length && battle.units.some((v) => v.x === order[i] && v.y === row)) i++;
    if (i >= order.length) return;
    Object.assign(u, {
      id: battle.units.length + 1, side, x: order[i], y: row, start: u.troops, state: "Holding",
      order: { kind: battle.playerSide === side ? "hold" : "auto" }, budget: 0, routTime: 0, flankedHit: false,
    });
    battle.units.push(u);
    i++;
  }
}

// ---------- orders (player) ----------

export function orderUnits(battle, unitIds, order) {
  for (const u of battle.units) if (unitIds.includes(u.id) && ACTIVE(u)) u.order = order;
}

export function retreatAll(battle, side) {
  for (const u of battle.units) if (u.side === side && ACTIVE(u)) u.order = { kind: "retreat" };
}

// ---------- tick ----------

export function tick(battle) {
  if (battle.over) return;
  battle.time += B.tickSeconds;
  const units = battle.units;
  const hits = new Map(); // target id -> [{ attacker, dmg }]

  // alternate who acts first each tick so neither side gets the jump
  const order = Math.round(battle.time / B.tickSeconds) % 2 ? [...units].reverse() : units;
  for (const u of order) {
    if (u.state === "Gone") continue;
    if (u.state === "Routing") { flee(battle, u); continue; }
    if (u.order.kind === "retreat") { u.state = "Retreating"; withdraw(battle, u); continue; }
    const target = targetFor(battle, u);
    if (target && dist(u, target) <= range(u)) {
      if (u.state !== "Engaging" && u.type === "warriors" && !u.charged) { u.charge = B.chargeTicks; u.charged = true; }
      u.state = "Engaging";
      if (u.commander && rnd(battle) < B.commanderRiskPerTick) commanderFalls(battle, u);
      if (!hits.has(target.id)) hits.set(target.id, []);
      hits.get(target.id).push(u);
      continue;
    }
    const goal = goalFor(battle, u, target);
    if (goal) { u.state = "Advancing"; stepToward(battle, u, goal); } else u.state = "Holding";
  }

  for (const [id, attackers] of hits) {
    const t = units.find((x) => x.id === id);
    let lost = 0;
    attackers.forEach((a, i) => {
      const flank = i === 0 ? 1 : i === 1 ? B.flankMultiplier : B.rearMultiplier;
      lost += B.casualtyRatePerTick * a.troops * Math.pow(attackEff(battle, a) / defenceEff(battle, t), B.effectivenessExponent) * flank;
    });
    const before = t.troops;
    t.troops = Math.max(0, t.troops - lost);
    const pctLost = (before - t.troops) / t.start;
    t.morale -= (pctLost / 0.1) * B.moraleLoss.per10PctCasualties * moraleMult(t, battle);
    const pressure = attackers.reduce((n, a) => n + attackEff(battle, a) * a.troops, 0) / Math.max(1, defenceEff(battle, t) * t.troops);
    t.morale -= B.engagedMoralePerTick * Math.min(3, Math.pow(pressure, B.effectivenessExponent)) * moraleMult(t, battle);
    if (attackers.length > 1 && !t.flankedHit) { t.morale -= B.moraleLoss.flanked * moraleMult(t); t.flankedHit = true; }
  }
  // melee is mutual: an engaged unit also feels pressure from whoever it is fighting (handled above per target)

  for (const u of units) if (u.charge > 0 && u.state === "Engaging") u.charge -= 1;
  for (const u of units) {
    if (u.state === "Gone") continue;
    if (u.troops < 1) { u.state = "Gone"; u.troops = 0; u.destroyed = true; continue; }
    if (u.state !== "Routing" && u.morale <= B.morale.routed) rout(battle, u);
  }
  checkEnd(battle);
}

function rout(battle, u) {
  if (u.commander && rnd(battle) < B.commanderRiskIfRouted) commanderFalls(battle, u);
  u.state = "Routing";
  u.routTime = 0;
  u.morale = 0;
  for (const v of battle.units) if (v !== u && v.side === u.side && ACTIVE(v) && dist(u, v) <= B.routPanicRadius) v.morale -= B.moraleLoss.nearbyRout * moraleMult(v);
}

// Routed units run for their own edge; if they survive long enough out of contact they rally.
function flee(battle, u) {
  u.routTime += B.tickSeconds;
  const edge = homeRow(battle, u.side);
  if (u.y === edge) { u.state = "Gone"; u.escaped = true; return; }
  const enemyNear = battle.units.some((v) => v.side !== u.side && ACTIVE(v) && dist(u, v) <= 2);
  if (u.routTime >= B.rallyDelaySeconds && !enemyNear) {
    u.state = "Holding";
    u.morale = B.rallyMorale;
    u.order = { kind: battle.playerSide === u.side ? "hold" : "auto" };
    return;
  }
  stepToward(battle, u, { x: u.x, y: edge });
}

function withdraw(battle, u) {
  const edge = homeRow(battle, u.side);
  if (u.y === edge) { u.state = "Gone"; u.withdrawn = true; return; }
  stepToward(battle, u, { x: u.x, y: edge });
}

const homeRow = (battle, side) => (battle.bottom === side ? N - 1 : 0);

function targetFor(battle, u) {
  const enemies = battle.units.filter((v) => v.side !== u.side && v.state !== "Gone");
  if (!enemies.length) return null;
  if (u.order.kind === "attack") {
    const t = enemies.find((v) => v.id === u.order.targetId);
    if (t && t.state !== "Routing") return t;
  }
  // anyone in reach gets hit, whatever the order; otherwise the nearest fighting enemy
  const fighting = enemies.filter((v) => v.state !== "Routing");
  const inReach = fighting.filter((v) => dist(u, v) <= range(u)).sort((a, b) => dist(u, a) - dist(u, b));
  if (inReach.length) return inReach[0];
  return nearest(u, fighting.length ? fighting : enemies);
}

function goalFor(battle, u, target) {
  const o = u.order;
  if (o.kind === "move") {
    if (u.x === o.x && u.y === o.y) { u.order = { kind: "hold" }; return null; }
    return o;
  }
  if (o.kind === "hold") return null;
  if (!target) return null;
  // AI defenders in a defensive battle stay on their walls: they only strike at enemies who
  // come within the fortified ground, and otherwise fall back to it
  if (o.kind === "auto" && battle.type === "defensive" && u.side === "defender") {
    if (dist(target, battle.objective) <= B.fortifiedRadius + 1) return openCellNear(battle, u, target) || target;
    return dist(u, battle.objective) > B.fortifiedRadius ? battle.objective : null;
  }
  // skirmishers keep their distance
  if (BALANCE.formations[u.type].ranged && dist(u, target) < range(u)) {
    const away = { x: u.x + Math.sign(u.x - target.x), y: u.y + Math.sign(u.y - target.y) };
    return inside(away) ? away : null;
  }
  return openCellNear(battle, u, target) || target;
}

// The nearest free cell from which `u` can strike `target`, so blocks wrap around and flank
// instead of queueing behind their own line.
function openCellNear(battle, u, target) {
  const r = range(u);
  let best = null;
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
    const c = { x: target.x + dx, y: target.y + dy };
    if ((!dx && !dy) || !inside(c) || occupied(battle, c)) continue;
    const d = Math.hypot(c.x - u.x, c.y - u.y);
    if (!best || d < best.d) best = { ...c, d };
  }
  return best;
}

function stepToward(battle, u, goal) {
  u.budget += B.tickSeconds;
  for (let guard = 0; guard < 4; guard++) {
    let best = null;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const c = { x: u.x + dx, y: u.y + dy };
      if ((!dx && !dy) || !inside(c) || occupied(battle, c)) continue;
      const d = Math.hypot(goal.x - c.x, goal.y - c.y);
      const here = Math.hypot(goal.x - u.x, goal.y - u.y);
      // strictly closer, or a sideways step (same distance) to get round a blockage
      if (d < here + 0.01 && !(c.x === u.lastX && c.y === u.lastY) && (!best || d < best.d)) best = { ...c, d };
    }
    if (!best) return;
    const cost = B.terrain[battle.grid[best.y][best.x]].move;
    if (u.budget < cost) return;
    u.budget -= cost;
    u.lastX = u.x;
    u.lastY = u.y;
    u.x = best.x;
    u.y = best.y;
    if (u.x === goal.x && u.y === goal.y) return;
  }
}

// ---------- combat maths ----------

function range(u) {
  return BALANCE.formations[u.type].ranged ? B.skirmisherRange : 1;
}

function moraleMult(u, battle) {
  const walls = battle && u.side === "defender" && battle.objective && dist(u, battle.objective) <= B.fortifiedRadius ? 1 + battle.fortification : 1;
  return B.experience[u.experience].moraleLossMult / walls; // walls steady the nerves
}

function common(battle, u) {
  const exp = B.experience[u.experience].power;
  const cmd = B.commander[battle.sides[u.side].commander] || 1;
  return exp * cmd;
}

function attackEff(battle, u) {
  const def = BALANCE.formations[u.type];
  const charge = u.charge > 0 ? B.chargeMult : 1;
  const cell = battle.grid[u.y][u.x];
  const terrain = B.terrain[cell];
  const moraleF = B.moraleFactorMin + (1 - B.moraleFactorMin) * Math.min(1, Math.max(0, u.morale) / B.morale.start);
  let eff = def.strength * terrain.attack * BALANCE.stances[u.stance].attack * common(battle, u) * moraleF * charge;
  if (def.ranged) eff *= B.rangedDamageMult * (cell === "forest" ? terrain.skirmisherBonus || 1 : 1);
  return eff;
}

function defenceEff(battle, u) {
  const def = BALANCE.formations[u.type];
  const terrain = B.terrain[battle.grid[u.y][u.x]];
  let eff = def.strength * terrain.defence * BALANCE.stances[u.stance].defence * common(battle, u);
  if (u.side === "defender" && battle.objective && dist(u, battle.objective) <= B.fortifiedRadius) eff *= 1 + battle.fortification;
  return eff;
}

// The commander falls: every block on that side is shaken, and command passes to a lesser man.
function commanderFalls(battle, u) {
  const side = battle.sides[u.side];
  if (side.fallen) return;
  side.fallen = true;
  side.commander = "Poor";
  u.commander = false;
  battle.log.push({ time: battle.time, side: u.side, text: "The commander has fallen!" });
  for (const v of battle.units) if (v.side === u.side && ACTIVE(v)) v.morale -= B.moraleLoss.commanderDeath * moraleMult(v, battle);
}

function rnd(battle) {
  let t = (battle.rng = (battle.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ---------- end ----------

function checkEnd(battle) {
  const alive = (side) => battle.units.some((u) => u.side === side && ACTIVE(u));
  const end = (winner, reason) => {
    battle.over = true;
    battle.result = { winner, reason };
  };
  if (!alive("attacker")) return end("defender", "The attackers broke");
  if (!alive("defender")) return end("attacker", "The defenders broke");
  if (battle.objective) {
    const near = (side, r) => battle.units.some((u) => u.side === side && ACTIVE(u) && dist(u, battle.objective) <= r);
    // the stronghold holds while any defender still stands on the fortified ground
    battle.captureTimer = near("attacker", B.objectiveRadius) && !near("defender", B.fortifiedRadius) ? battle.captureTimer + B.tickSeconds : 0;
    if (battle.captureTimer >= B.objectiveCaptureSeconds) return end("attacker", "The attackers took the stronghold");
    if (battle.time >= B.defensiveTimerSeconds) return end("defender", "The defenders held until nightfall");
  }
  if (battle.time >= B.maxDurationSeconds) end("defender", "The attack ran out of daylight");
}

export function autoResolve(battle) {
  for (const u of battle.units) if (u.order.kind === "hold") u.order = { kind: "auto" };
  battle.playerSide = null;
  while (!battle.over) tick(battle);
  return battle;
}

// Totals for the UI and aftermath.
export function sideSummary(battle, side) {
  const us = battle.units.filter((u) => u.side === side);
  const start = us.reduce((n, u) => n + u.start, 0);
  const now = us.reduce((n, u) => n + u.troops, 0);
  const fighting = us.filter(ACTIVE).reduce((n, u) => n + u.troops, 0);
  return { start: Math.round(start), now: Math.round(now), fighting: Math.round(fighting), lost: Math.round(start - now) };
}

// ---------- helpers ----------

const dist = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const inside = (c) => c.x >= 0 && c.y >= 0 && c.x < N && c.y < N;
const occupied = (battle, c) => battle.units.some((u) => u.state !== "Gone" && u.x === c.x && u.y === c.y);
const nearest = (u, list) => list.reduce((best, v) => (!best || dist(u, v) < dist(u, best) ? v : best), null);

export const isActive = ACTIVE;
