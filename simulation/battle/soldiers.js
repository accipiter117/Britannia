// simulation/battle/soldiers.js
// Owns what each individual soldier does in a tick: keep his place in the band's formation, pick a
// foe nearby and close with him, trade blows (skill, shields from the front, blows from behind,
// charges that knock men down, braced spears against horse), shoot, and run when the band breaks.
// Plus everything that flies: stones, arrows, javelins, pila and scorpion bolts. Unit-level rules
// (orders, morale, the end of the battle) live in engine.js.

import { BALANCE } from "../../config/balance.js";
import { nextRandom } from "../random.js";
import { GROUND, groundAt, heightAt, insideWalls, passable, speedMult } from "./terrain.js";
import { slotPos } from "./setup.js";

const B = BALANCE.battle;
const F = BALANCE.formations;
const CELL = 24;

// ---------- spatial grid ----------

export function buildGrid(b) {
  const cols = Math.ceil(B.width / CELL) + 2;
  const grid = new Map();
  for (const s of b.soldiers) {
    if (!s.alive || s.fled) continue;
    const k = Math.floor(s.x / CELL) + 1 + (Math.floor(s.y / CELL) + 1) * cols;
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(s);
  }
  b.grid = { map: grid, cols };
}

function near(b, x, y, r, fn) {
  const { map, cols } = b.grid;
  const c0 = Math.floor((x - r) / CELL) + 1, c1 = Math.floor((x + r) / CELL) + 1;
  const r0 = Math.floor((y - r) / CELL) + 1, r1 = Math.floor((y + r) / CELL) + 1;
  for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
    const list = map.get(i + j * cols);
    if (list) for (const s of list) fn(s);
  }
}

const rnd = (b) => nextRandom(b);
const buff = (u, key) => u.buffs.reduce((m, x) => m + (x[key] || 0), 0);
const radius = (s) => (s.u.mounted ? B.radius.mounted : B.radius.foot);

// ---------- soldiers ----------

export function stepSoldiers(b, dt) {
  // slots: where each man should stand this tick
  for (const u of b.units) {
    if (u.state === "gone") continue;
    const alive = u.soldiers.filter((s) => s.alive && !s.fled);
    alive.forEach((s, i) => { [s.sx, s.sy] = slotPos(u, i, alive.length, s); });
    u.fighting = 0;
  }
  b.gateHackers = 0;
  for (const s of b.soldiers) {
    if (!s.alive || s.fled) continue;
    const u = s.u;
    s.px = s.x; s.py = s.y;
    if (s.stun > 0) { s.stun -= dt; continue; }
    if (u.state === "routing") { flee(b, s, dt); continue; }
    s.cd -= dt;
    const foe = pickFoe(b, s);
    s.target = foe;
    if (foe) {
      u.fighting++;
      const d = Math.hypot(foe.x - s.x, foe.y - s.y);
      const reach = (u.mounted ? B.reach.mounted : B.reach.foot) + radius(foe) * 0.5;
      s.face = foe.x >= s.x ? 1 : -1;
      if (d > reach) walk(b, s, foe.x, foe.y, dt, 1.1);
      else if (s.cd <= 0) { strike(b, s, foe); s.cd = B.attackInterval * (u.stamina < B.tiredAt ? 1.35 : 1) * (0.8 + rnd(b) * 0.4); }
    } else if (gateWork(b, s, dt)) {
      // battering the gate
    } else {
      walk(b, s, s.sx, s.sy, dt, 1.25);
    }
  }
  separate(b);
  for (const s of b.soldiers) if (s.alive && !s.fled) { s.vx = (s.x - s.px) / dt; s.vy = (s.y - s.py) / dt; s.moving = Math.hypot(s.vx, s.vy) > 4; if (s.moving) s.walk += dt * 9; }
}

function pickFoe(b, s) {
  const u = s.u;
  // shooters with arrows left keep out of the melee unless it comes to them
  const shy = u.ranged && s.ammo > 0;
  const range = shy ? B.reach.foot + 3 : B.engageRange;
  const keep = s.target && s.target.alive && !s.target.fled && Math.hypot(s.target.x - s.x, s.target.y - s.y) < B.engageRange * 1.5 &&
    Math.hypot(s.x - s.sx, s.y - s.sy) < B.leash;
  if (keep && !shy) return s.target;
  // a band marching away only fights what is on top of it
  const r = u.order.kind === "move" ? B.reach.foot + 4 : range;
  let best = null, bd = r;
  near(b, s.x, s.y, r, (o) => {
    if (o.u.side === u.side || (o.u.hidden && o.u.side !== u.side && Math.hypot(o.x - s.x, o.y - s.y) > B.reach.foot + 4)) return;
    const d = Math.hypot(o.x - s.x, o.y - s.y);
    if (d < bd) { bd = d; best = o; }
  });
  if (best && Math.hypot(s.x - s.sx, s.y - s.sy) > B.leash && Math.hypot(best.x - s.x, best.y - s.y) > B.reach.foot + 2) return null;
  return best;
}

function walk(b, s, tx, ty, dt, hurry) {
  const u = s.u;
  const dx = tx - s.x, dy = ty - s.y, d = Math.hypot(dx, dy);
  if (d < 0.8) return;
  const tired = u.stamina < B.tiredAt ? 0.7 : 1;
  const sp = u.def.speed * F[u.formation].speed * speedMult(b.terrain, s.x, s.y, u.mounted) * tired * (u.charge > 0 ? 1.2 : 1) * (d > 6 ? hurry : 1);
  const step = Math.min(d, sp * dt);
  const nx = s.x + (dx / d) * step, ny = s.y + (dy / d) * step;
  if (passable(b.terrain, nx, ny, u.mounted)) { s.x = nx; s.y = ny; }
  else if (passable(b.terrain, nx, s.y, u.mounted)) s.x = nx;
  else if (passable(b.terrain, s.x, ny, u.mounted)) s.y = ny;
  if (Math.abs(dx) > 0.5) s.face = dx > 0 ? 1 : -1;
}

function flee(b, s, dt) {
  const edge = b.top === s.u.side ? -30 : B.height + 30;
  walk(b, s, s.x + s.jx * 30, edge, dt, 1.2);
  if (s.y < -20 || s.y > B.height + 20) s.fled = true;
}

function separate(b) {
  buildGrid(b);
  for (const s of b.soldiers) {
    if (!s.alive || s.fled) continue;
    const rs = radius(s);
    near(b, s.x, s.y, 12, (o) => {
      if (o === s || o.id < s.id) return;
      const need = rs + radius(o);
      const dx = o.x - s.x, dy = o.y - s.y, d = Math.hypot(dx, dy) || 0.01;
      if (d >= need) return;
      const push = (need - d) / 2, ux = dx / d, uy = dy / d;
      if (passable(b.terrain, s.x - ux * push, s.y - uy * push, s.u.mounted)) { s.x -= ux * push; s.y -= uy * push; }
      if (passable(b.terrain, o.x + ux * push, o.y + uy * push, o.u.mounted)) { o.x += ux * push; o.y += uy * push; }
    });
  }
}

// ---------- blows ----------

// Where a blow comes from, relative to the struck man's band: front, flank or rear.
function side(t, ax, ay) {
  const fx = Math.sin(t.u.a), fy = -Math.cos(t.u.a);
  const d = Math.hypot(ax - t.x, ay - t.y) || 1;
  const ang = Math.acos(Math.max(-1, Math.min(1, ((ax - t.x) * fx + (ay - t.y) * fy) / d)));
  return ang * 180 / Math.PI < F[t.u.formation].shieldFront ? "front" : ang > B.rearAngle ? "rear" : "flank";
}

function strike(b, a, t) {
  a.struck = b.time;
  const au = a.u, tu = t.u;
  const from = side(t, a.x, a.y);
  let p = B.hitBase + (attackOf(b, a, t) - defenceOf(b, t, a)) * B.hitPerSkill;
  if (from === "rear") { p += B.flankBonus; tu.flankHit = b.time; }
  if (from === "flank") { p += B.flankBonus / 2; tu.flankHit = b.time; }
  let extra = 0;
  if (au.charge > 0 && !a.charged) {
    a.charged = true;
    let energy = au.def.charge * (1 + buff(au, "charge"));
    const braced = from === "front" && au.mounted && (tu.spear || tu.formation === "tight");
    if (braced) { energy *= B.braceVsHorse; if (rnd(b) < 0.4) hurt(b, a, 1, tu); }
    extra = energy * B.chargeDamage;
    if (!tu.impacted.includes(au.id) && !au.impacted.includes(tu.id)) {
      au.impacted.push(tu.id);
      tu.morale -= energy * B.chargeMorale * (braced ? 0.3 : 1) + (au.ambush ? B.ambushMorale : 0);
      b.effects.push({ kind: "charge", x: t.x, y: t.y, t: b.time });
    }
    if (rnd(b) < energy * B.chargeKnock) {
      const d = Math.hypot(t.x - a.x, t.y - a.y) || 1;
      const kx = t.x + ((t.x - a.x) / d) * 9, ky = t.y + ((t.y - a.y) / d) * 9;
      if (passable(b.terrain, kx, ky, tu.mounted)) { t.x = kx; t.y = ky; }
      t.stun = 0.9;
      p += 0.25;
    }
  }
  if (rnd(b) > Math.max(0.05, Math.min(0.95, p))) return;
  if (from === "front" && rnd(b) < tu.def.shield * B.shieldPerPoint * (t.stun > 0 ? 0.3 : 1)) return; // caught on the shield
  hurt(b, t, 1 + extra, au);
}

function attackOf(b, s, foe) {
  const u = s.u;
  let v = u.attack + buff(u, "attack");
  if (u.stamina < B.tiredAt) v -= 1.5;
  if (u.morale < 20) v -= 1;
  if (heightAt(b.terrain, s.x, s.y) > heightAt(b.terrain, foe.x, foe.y) + 0.2) v += B.hillAttack / B.hitPerSkill;
  if (foe.u.mounted && u.spear) v += 2;
  return v;
}

function defenceOf(b, s, foe) {
  const u = s.u;
  let v = u.defence * F[u.formation].defence + buff(u, "defence");
  const g = groundAt(b.terrain, s.x, s.y);
  if (g === GROUND.forest) v += 1;
  if (g === GROUND.river) v -= 1.5;
  if (g === GROUND.wall) v -= 2;                      // climbing
  if (b.terrain.siege && insideWalls(b.terrain, s.x, s.y) && !insideWalls(b.terrain, foe.x, foe.y)) v += B.wallDefence;
  return v;
}

// Damage can be fractional (charges): the remainder is a chance of one more wound.
function hurt(b, t, dmg, byUnit) {
  const whole = Math.floor(dmg) + (rnd(b) < dmg % 1 ? 1 : 0);
  t.hp -= whole;
  if (t.hp > 0) return;
  t.alive = false;
  t.deadAt = b.time;
  t.target = null;
  const u = t.u;
  u.men = Math.max(0, u.men - 1);
  const walled = b.terrain.siege && insideWalls(b.terrain, t.x, t.y);
  u.morale -= (B.casualtyMorale / u.start) * (walled ? B.wallMorale : 1);
  if (byUnit) byUnit.kills++;
  if (u.men === 0 && u.general) b.generalFell = u;
}

// ---------- shooting ----------

const SPEED = { stone: 300, arrow: 340, javelin: 220, pilum: 200, bolt: 520 };

export function stepMissiles(b, dt) {
  for (const u of b.units) {
    if (!u.ranged || u.state === "gone" || u.state === "routing") continue;
    const target = missileTarget(b, u);
    if (!target) continue;
    for (const s of u.soldiers) {
      if (!s.alive || s.fled || s.ammo <= 0 || s.target || s.stun > 0) continue;
      s.reload -= dt;
      if (s.reload > 0) continue;
      if (target.gate) {
        launch(b, s, target.x, target.y, u.artillery ? "bolt" : "arrow", 0, true);
      } else {
        const victims = target.soldiers.filter((o) => o.alive && !o.fled);
        if (!victims.length) continue;
        const v = victims[Math.floor(rnd(b) * victims.length)];
        const kind = u.artillery ? "bolt" : u.def.tags?.includes("archer") ? "arrow" : u.type === "javelinmen" ? "javelin" : "stone";
        const flight = Math.hypot(v.x - s.x, v.y - s.y) / SPEED[kind];
        launch(b, s, v.x + (v.vx || 0) * flight, v.y + (v.vy || 0) * flight, kind, u.def.missile);
      }
      s.ammo--;
      s.struck = b.time;
      s.reload = (u.artillery ? B.artilleryReload : B.reload) * (0.8 + rnd(b) * 0.4);
      s.face = (target.x ?? target.cx) >= s.x ? 1 : -1;
    }
    u.hidden = false;
  }
}

function missileTarget(b, u) {
  const range = u.def.range;
  const s = b.terrain.siege;
  if (u.artillery && s && s.gateHp > 0 && u.side === "attacker" && u.order.kind === "gate" && Math.hypot(u.cx - s.gate.x, u.cy - s.gate.y) < range) return { gate: true, x: s.gate.x, y: s.gate.y };
  if (u.order.kind === "move" && u.state === "moving") return null;
  const ordered = u.order.kind === "attack" && b.units.find((x) => x.id === u.order.target);
  const inRange = (t) => t && t.state !== "gone" && !t.hidden && Math.hypot(t.cx - u.cx, t.cy - u.cy) <= range;
  if (inRange(ordered)) return ordered;
  let best = null, bd = range;
  for (const t of b.units) {
    if (t.side === u.side || !inRange(t)) continue;
    const d = Math.hypot(t.cx - u.cx, t.cy - u.cy);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

export function launch(b, s, x, y, kind, dmg, gate = false) {
  const dist = Math.hypot(x - s.x, y - s.y);
  const flight = kind === "javelin" || kind === "pilum" ? B.throwFlight * (0.8 + rnd(b) * 0.4) : dist / SPEED[kind];
  const spread = kind === "bolt" ? 3 : B.missileSpread * Math.min(1, dist / 200);
  b.projectiles.push({
    kind, side: s.u.side, from: s.u, x0: s.x, y0: s.y - 5, x1: x + (rnd(b) - 0.5) * spread, y1: y + (rnd(b) - 0.5) * spread,
    t0: b.time, t1: b.time + flight, dmg, gate,
  });
}

// A skill shot: every man in the band throws at a point.
export function volleyAt(b, u, x, y) {
  const kind = u.side === "attacker" || u.side === "defender" ? (b.sides[u.side].faction === "rome" ? "pilum" : "javelin") : "javelin";
  for (const s of u.soldiers) {
    if (!s.alive || s.fled) continue;
    launch(b, s, x + (rnd(b) - 0.5) * B.throwSpread * 2, y + (rnd(b) - 0.5) * B.throwSpread * 2, kind, u.def.throw.damage);
    s.struck = b.time;
    s.face = x >= s.x ? 1 : -1;
  }
}

export function landMissiles(b) {
  const still = [];
  for (const p of b.projectiles) {
    if (b.time < p.t1) { still.push(p); continue; }
    b.effects.push({ kind: "stuck", x: p.x1, y: p.y1, t: b.time, missile: p.kind });
    const s = b.terrain.siege;
    if (p.gate && s && s.gateHp > 0) { s.gateHp -= p.kind === "bolt" ? B.artilleryGate : 1; continue; }
    const hits = [];
    const r = p.kind === "bolt" ? B.missileHitRadius * 2 : B.missileHitRadius;
    near(b, p.x1, p.y1, r, (o) => { if (o.u.side !== p.side && Math.hypot(o.x - p.x1, o.y - p.y1) < r) hits.push(o); });
    hits.sort((m, n) => Math.hypot(m.x - p.x1, m.y - p.y1) - Math.hypot(n.x - p.x1, n.y - p.y1));
    const n = p.kind === "bolt" ? B.artilleryPierce : 1;
    for (const t of hits.slice(0, n)) {
      let chance = p.kind === "javelin" || p.kind === "pilum" || p.kind === "bolt" ? 0.7 : B.missileHit;
      if (groundAt(b.terrain, t.x, t.y) === GROUND.forest) chance *= B.forestCover;
      if (b.terrain.siege && insideWalls(b.terrain, t.x, t.y) && !insideWalls(b.terrain, p.x0, p.y0)) chance *= B.palisadeCover;
      if (rnd(b) > chance) continue;
      const from = side(t, p.x0, p.y0);
      if (from === "front" && p.kind !== "bolt" && rnd(b) < t.u.def.shield * B.shieldVsMissile) continue;
      t.u.hitBy = b.time;
      t.u.morale -= 0.3;
      hurt(b, t, p.dmg, p.from);
    }
  }
  b.projectiles = still;
}

// ---------- the gate ----------

function gateWork(b, s, dt) {
  const g = b.terrain.siege;
  if (!g || g.gateHp <= 0 || s.u.order.kind !== "gate" || s.u.mounted || s.u.side !== "attacker") return false;
  const d = Math.hypot(s.x - g.gate.x, s.y - (g.gate.y + 14));
  if (d > B.gateReach) return false;
  if (b.gateHackers >= B.gateHackers) return false; // no room at the gate: wait your turn
  b.gateHackers++;
  if (s.cd <= 0) { g.gateHp -= B.gateBlow; s.cd = B.attackInterval; s.face = g.gate.x >= s.x ? 1 : -1; s.struck = b.time; }
  return true;
}
