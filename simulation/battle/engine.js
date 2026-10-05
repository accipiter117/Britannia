// simulation/battle/engine.js
// Owns the battle at the level of bands (units): orders and marching, wheeling to face, charges,
// morale, stamina, routs and rallies, ambushes from woods, generals and their abilities, skill-shot
// volleys, sieges (gate and centre) and the end of the battle. Each soldier's part is soldiers.js.
// Orders come from the player (battleView) or the AI (ai.js). No DOM.

import { BALANCE } from "../../config/balance.js";
import { GROUND, groundAt, insideWalls, speedMult } from "./terrain.js";
import { buildGrid, landMissiles, stepMissiles, stepSoldiers, volleyAt } from "./soldiers.js";
import { unitWidth } from "./setup.js";
import { aiThink } from "./ai.js";

const B = BALANCE.battle;
const F = BALANCE.formations;

export const live = (u) => u.state !== "gone";
export const fighting = (u) => u.state !== "gone" && u.state !== "routing";
export const visibleTo = (b, side, u) => !u.hidden || u.side === side;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// The rough footprint of a band, for picking it out with a tap.
export function unitSize(u) {
  const f = F[u.formation];
  return { w: unitWidth(u) + 6, d: u.rows * f.depth + 6 };
}

// ---------- orders ----------

export function orderUnits(b, ids, order) {
  for (const u of b.units) if (ids.includes(u.id) && fighting(u)) { u.order = { ...order }; u.impacted = []; }
}

export function setAI(b, id, on) {
  const u = b.units.find((x) => x.id === id);
  if (u) u.ai = on;
}

export function startBattle(b) {
  b.phase = "fight";
  for (const u of b.units) u.hidden = groundAt(b.terrain, u.cx, u.cy) === GROUND.forest && !u.artillery;
  if (b.terrain.siege) for (const u of b.units) if (u.side === "defender" && insideWalls(b.terrain, u.cx, u.cy)) { u.baseMorale += B.garrisonCourage; u.morale += B.garrisonCourage; }
  buildGrid(b);
}

export function soundRetreat(b, side) {
  for (const u of b.units) if (u.side === side && fighting(u)) { u.state = "routing"; u.morale = -50; u.rallies = 9; }
  b.log.push({ t: b.time, text: side === b.playerSide ? "You sound the retreat." : "The enemy sounds the retreat." });
}

// ---------- skill shots ----------

export function canThrow(b, u) {
  return fighting(u) && u.throwLeft > 0 && b.phase === "fight";
}

// Throw the band's javelins (or pila) at a point. Only within reach.
export function throwAt(b, id, x, y) {
  const u = b.units.find((v) => v.id === id);
  if (!u || !canThrow(b, u)) return false;
  if (Math.hypot(x - u.cx, y - u.cy) > u.def.throw.range + unitWidth(u) / 2) return false;
  u.throwLeft--;
  u.hidden = false;
  volleyAt(b, u, x, y);
  return true;
}

// ---------- abilities ----------

export function abilityReady(b, side, key) {
  return b.sides[side].generalAlive && (b.sides[side].cooldowns[key] ?? -1) <= b.time;
}

export function useAbility(b, side, key, targetId = null) {
  const A = BALANCE.abilities[key];
  const gen = b.units.find((u) => u.side === side && u.general && fighting(u));
  if (!A || !gen || !abilityReady(b, side, key)) return false;
  const g = { x: gen.cx, y: gen.cy };
  const near = (u, r) => Math.hypot(u.cx - g.x, u.cy - g.y) <= r;
  if (key === "warcry") {
    for (const u of b.units) {
      if (u.side === side && fighting(u) && near(u, A.radius)) { u.morale = Math.min(120, u.morale + A.morale); u.buffs.push({ attack: A.attack, until: b.time + A.duration }); }
      if (u.side !== side && fighting(u) && near(u, A.radius * 0.8)) u.morale += A.enemyMorale;
    }
  } else if (key === "rally") {
    for (const u of b.units) if (u.side === side && u.state === "routing" && u.rallies < 9 && near(u, A.radius)) { u.state = "ready"; u.morale = A.morale; u.order = { kind: "hold" }; }
  } else if (key === "fury") {
    const t = b.units.find((u) => u.id === targetId && u.side === side && fighting(u)) || gen;
    t.buffs.push({ attack: A.attack, charge: A.charge - 1, noFatigue: true, until: b.time + A.duration });
    t.stamina = t.def.stamina;
  } else if (key === "hold") {
    for (const u of b.units) if (u.side === side && fighting(u) && near(u, A.radius)) { u.morale += A.morale; u.buffs.push({ defence: A.defence, until: b.time + A.duration }); }
  }
  b.sides[side].cooldowns[key] = b.time + A.cooldown;
  b.effects.push({ kind: key, x: g.x, y: g.y, r: A.radius || 60, t: b.time, side });
  b.log.push({ t: b.time, text: `${side === b.playerSide ? "Your" : "The enemy"} ${side === b.playerSide || b.sides[side].faction !== "rome" ? "chieftain" : "legate"}: ${A.label}!` });
  return true;
}

// ---------- the tick ----------

export function tick(b) {
  if (b.over || b.phase !== "fight") return;
  const dt = B.tick;
  b.time += dt;
  if (Math.round(b.time / dt) % 10 === 0) {
    for (const side of ["attacker", "defender"]) aiThink(b, side, side !== b.playerSide);
  }
  for (const u of b.units) {
    u.buffs = u.buffs.filter((x) => x.until > b.time);
    if (u.charge > 0) u.charge -= dt;
  }
  reveal(b);
  for (const u of b.units) if (fighting(u)) march(b, u, dt);
  stepSoldiers(b, dt);
  stepMissiles(b, dt);
  landMissiles(b);
  for (const u of b.units) if (live(u)) nerve(b, u, dt);
  if (b.generalFell) generalFalls(b, b.generalFell);
  siege(b, dt);
  for (const u of b.units) {
    if (!live(u)) continue;
    u.men = u.soldiers.filter((s) => s.alive && !s.fled).length;
    if (u.men === 0) u.state = "gone";
  }
  checkEnd(b);
  b.effects = b.effects.filter((e) => b.time - e.t < (e.kind === "stuck" ? 6 : 2));
}

function reveal(b) {
  for (const u of b.units) {
    if (!u.hidden) continue;
    const out = groundAt(b.terrain, u.cx, u.cy) !== GROUND.forest;
    const spotted = b.units.some((e) => e.side !== u.side && fighting(e) && Math.hypot(e.cx - u.cx, e.cy - u.cy) < B.ambushReveal + unitWidth(u) / 2);
    if (out || spotted || u.fighting) { u.hidden = false; u.ambush = true; setTimeout0(() => { u.ambush = false; }, b, 4); }
  }
  b.timers = (b.timers || []).filter((t) => { if (b.time >= t.at) { t.fn(); return false; } return true; });
}
function setTimeout0(fn, b, secs) { (b.timers ||= []).push({ at: b.time + secs, fn }); }

// Where the band as a whole is heading, and whether it charges.
function march(b, u, dt) {
  const o = u.order;
  let dest = null, face = null;
  if (o.kind === "move") { dest = { x: o.x, y: o.y }; face = o.face; }
  else if (o.kind === "attack") {
    const t = b.units.find((x) => x.id === o.target);
    if (!t || !fighting(t) || !visibleTo(b, u.side, t)) { u.order = { kind: "hold" }; }
    else {
      const gap = (u.rows * F[u.formation].depth + t.rows * F[t.formation].depth) / 2 + 4;
      const d = Math.hypot(t.cx - u.cx, t.cy - u.cy) || 1;
      dest = d > gap ? { x: t.cx - ((t.cx - u.cx) / d) * gap, y: t.cy - ((t.cy - u.cy) / d) * gap } : null;
      face = Math.atan2(t.cx - u.cx, -(t.cy - u.cy));
      if (u.ranged && !u.artillery && d <= u.def.range * 0.9) dest = null; // shooters stop at range
    }
  } else if (o.kind === "gate" && b.terrain.siege) {
    const g = b.terrain.siege;
    dest = g.gateHp > 0 ? { x: g.gate.x, y: g.gate.y + 34 } : { x: g.cx, y: g.cy };
    if (u.artillery) dest = Math.hypot(u.cx - g.gate.x, u.cy - g.gate.y) > u.def.range * 0.85 ? { x: g.gate.x, y: g.gate.y + u.def.range * 0.7 } : null;
    face = 0;
    if (g.gateHp <= 0 && !u.mounted && Math.hypot(u.cx - g.gate.x, u.cy - g.gate.y) < 40) dest = { x: g.cx, y: g.cy }; // through
  }
  const engaged = u.fighting > Math.max(2, u.men * 0.2);
  if (engaged && o.kind !== "move") dest = null;               // locked in the melee
  if (face !== null && face !== undefined && (!dest || Math.hypot(dest.x - u.cx, dest.y - u.cy) < 10)) turn(u, face, dt);
  if (!dest) { rest(u, dt, engaged); u.state = engaged ? "fighting" : "ready"; return; }
  const dx = dest.x - u.cx, dy = dest.y - u.cy, d = Math.hypot(dx, dy);
  if (d < 3) { rest(u, dt, engaged); u.state = engaged ? "fighting" : "ready"; if (o.kind === "move" && (o.face === undefined || Math.abs(angDiff(u.a, o.face)) < 0.05)) u.order = { kind: "hold" }; return; }
  const want = Math.atan2(dx, -dy);
  // marching backwards a short way is fine; otherwise wheel to face the march
  const backstep = o.kind === "move" && d < 80 && Math.abs(angDiff(u.a, want)) > 2.4;
  if (!backstep) turn(u, want, dt);
  const lag = u.soldiers.reduce((n, s) => n + (s.alive && !s.fled ? Math.hypot(s.x - (s.sx ?? s.x), s.y - (s.sy ?? s.y)) : 0), 0) / Math.max(1, u.men);
  let sp = u.def.speed * F[u.formation].speed * speedMult(b.terrain, u.cx, u.cy, u.mounted) * (u.stamina < B.tiredAt ? 0.7 : 1);
  if (lag > 14) sp *= 0.5;                               // wait for the stragglers
  if (!backstep && Math.abs(angDiff(u.a, want)) > 0.9) sp *= 0.3;
  if (backstep) sp *= 0.5;
  const step = Math.min(d, sp * dt);
  u.cx += (dx / d) * step; u.cy += (dy / d) * step;
  u.state = "moving";
  u.run = o.kind === "attack" || o.kind === "move" ? u.run + step : 0;
  u.stamina = Math.max(0, u.stamina - (u.buffs.some((x) => x.noFatigue) ? 0 : B.staminaRun * dt * (sp > 40 ? 1.4 : 0.7)));
  // a run that ends in the enemy is a charge
  if (u.run >= B.chargeRun && u.fighting > 0 && u.charge <= 0) {
    u.charge = B.chargeSeconds;
    u.run = 0;
    for (const s of u.soldiers) s.charged = false;
  }
}

function rest(u, dt, engaged) {
  if (engaged && u.fighting > 0 && u.charge <= 0 && u.run >= B.chargeRun) { u.charge = B.chargeSeconds; for (const s of u.soldiers) s.charged = false; }
  u.run *= 0.7;
  const tire = u.buffs.some((x) => x.noFatigue) ? 0 : B.staminaFight;
  u.stamina = engaged ? Math.max(0, u.stamina - tire * dt) : Math.min(u.def.stamina, u.stamina + B.staminaRest * dt);
}

function turn(u, want, dt) {
  const rate = (u.mounted ? 2.4 : 1.6) * dt;
  const diff = angDiff(u.a, want);
  u.a += Math.max(-rate, Math.min(rate, diff));
}

// ---------- morale ----------

function nerve(b, u, dt) {
  const gen = b.units.find((g) => g.side === u.side && g.general && fighting(g));
  const aura = gen && Math.hypot(gen.cx - u.cx, gen.cy - u.cy) < BALANCE.generals.auraRadius;
  if (u.state === "routing") {
    u.routTime += dt;
    const mean = centreOf(u);
    if (mean) { u.cx = mean.x; u.cy = mean.y; }
    const threatened = b.units.some((e) => e.side !== u.side && fighting(e) && Math.hypot(e.cx - u.cx, e.cy - u.cy) < 160);
    if (!threatened && u.routTime > B.routSeconds && u.rallies < 2) { u.state = "ready"; u.morale = B.rallyAt; u.rallies++; u.order = { kind: "hold" }; }
    return;
  }
  if (!u.fighting) {
    const cap = u.baseMorale + (aura ? 10 : 0);
    if (u.morale < cap) u.morale += (1 + (aura ? BALANCE.generals.auraMorale : 0)) * dt;
  } else if (aura) u.morale += BALANCE.generals.auraMorale * 0.3 * dt;
  if (b.time - u.flankHit < 1) u.morale -= B.flankMoralePerSec * dt;
  if (u.fighting && u.stamina < B.tiredAt) u.morale -= 0.6 * dt;
  if (u.morale <= 0) rout(b, u);
}

function centreOf(u) {
  const alive = u.soldiers.filter((s) => s.alive && !s.fled);
  if (!alive.length) return null;
  return { x: alive.reduce((n, s) => n + s.x, 0) / alive.length, y: alive.reduce((n, s) => n + s.y, 0) / alive.length };
}

function rout(b, u) {
  u.state = "routing";
  u.routTime = 0;
  u.order = { kind: "hold" };
  for (const f of b.units) if (f.side === u.side && fighting(f) && f !== u && Math.hypot(f.cx - u.cx, f.cy - u.cy) < 150) f.morale -= B.nearbyRoutMorale;
  b.log.push({ t: b.time, text: `${u.side === b.playerSide ? "Your" : "The enemy"} ${u.name} break and run!` });
}

function generalFalls(b, g) {
  b.generalFell = null;
  b.sides[g.side].generalAlive = false;
  b.sides[g.side].generalSlain = true;
  for (const u of b.units) if (u.side === g.side && fighting(u)) u.morale -= BALANCE.generals.deathMoraleHit;
  b.log.push({ t: b.time, text: g.side === b.playerSide ? "Your chieftain has fallen!" : `The enemy ${b.sides[g.side].faction === "rome" ? "legate" : "chieftain"} has fallen!` });
}

// ---------- sieges ----------

function siege(b, dt) {
  const s = b.terrain.siege;
  if (!s) return;
  if (s.gateHp <= 0 && !s.broken) { s.broken = true; b.log.push({ t: b.time, text: "The gate is broken!" }); b.effects.push({ kind: "gate", x: s.gate.x, y: s.gate.y, t: b.time }); }
  const centre = { x: s.cx, y: s.cy };
  const def = b.soldiers.some((x) => x.alive && !x.fled && x.u.side === "defender" && x.u.state !== "routing" && dist(x, centre) < B.plazaRadius * 1.5);
  const att = b.soldiers.some((x) => x.alive && !x.fled && x.u.side === "attacker" && x.u.state !== "routing" && dist(x, centre) < B.plazaRadius);
  b.plazaTimer = att && !def ? b.plazaTimer + dt : Math.max(0, b.plazaTimer - dt * 2);
}

// ---------- the end ----------

function checkEnd(b) {
  const broken = (side) => !b.units.some((u) => u.side === side && fighting(u));
  let winner = null, reason = "";
  if (broken("defender")) { winner = "attacker"; reason = "The defenders are broken."; }
  else if (broken("attacker")) { winner = "defender"; reason = "The attackers are broken."; }
  else if (b.terrain.siege && b.plazaTimer >= B.plazaHold) { winner = "attacker"; reason = "The attackers hold the heart of the stronghold."; }
  else if (b.time >= (b.siege ? B.siegeTimeLimit : B.timeLimit)) { winner = "defender"; reason = "Night falls; the attackers draw off."; }
  if (!winner) return;
  b.over = true;
  b.result = { winner, reason };
}

// Run a battle to its end with the AI on both sides.
export function autoResolve(b) {
  const keep = b.playerSide;
  b.playerSide = null;
  if (b.phase === "deploy") startBattle(b);
  let guard = 0;
  while (!b.over && guard++ < 12000) tick(b);
  b.playerSide = keep;
  return b.result;
}
