// simulation/battle/engine.js
// Owns the battle's rules, stepped in real time (balance.battle.tick): movement and facing,
// contact, melee with flanks, rear attacks and charges, missiles and pila, morale, routs and
// rallies, fatigue, ambushes from woods, generals and their abilities, and siege gates, walls
// and the plaza. Orders come from the player (battleView) or the AI (ai.js). No DOM.

import { BALANCE } from "../../config/balance.js";
import { nextRandom } from "../random.js";
import { GROUND, groundAt, heightAt, insideWalls, passable, speedMult } from "./terrain.js";
import { aiThink } from "./ai.js";

const B = BALANCE.battle;
const F = BALANCE.formations;
const U = BALANCE.units;

// ---------- geometry ----------

export function unitSize(u) {
  const f = F[u.formation];
  const area = u.men * (u.mounted ? 13 : 6.5);
  const w = Math.max(18, (16 + u.start * 0.4) * f.width);
  return { w, d: Math.max(9, area / w) };
}

export const facing = (a) => [Math.sin(a), -Math.cos(a)];
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const live = (u) => u.state !== "gone";
export const fighting = (u) => u.state !== "gone" && u.state !== "routing";

// Half-extent of a unit's footprint along a unit direction (dx, dy).
function extent(u, dx, dy) {
  const { w, d } = unitSize(u);
  const [fx, fy] = facing(u.a);
  return Math.abs(dx * fx + dy * fy) * d / 2 + Math.abs(dx * -fy + dy * fx) * w / 2;
}

function inContact(a, b) {
  const dd = dist(a, b) || 0.01;
  const dx = (b.x - a.x) / dd, dy = (b.y - a.y) / dd;
  return dd <= extent(a, dx, dy) + extent(b, -dx, -dy) + B.contactRange;
}

// Where `attacker` strikes `target`: "front", "flank" or "rear".
export function aspect(target, attacker) {
  const dd = dist(target, attacker) || 0.01;
  const [fx, fy] = facing(target.a);
  const c = ((attacker.x - target.x) * fx + (attacker.y - target.y) * fy) / dd;
  return c > 0.45 ? "front" : c < -0.45 ? "rear" : "flank";
}

const rnd = (b) => nextRandom(b);
const buff = (u, key) => u.buffs.reduce((m, x) => m * (x[key] || 1), 1);
const isRomanSide = (b, side) => b.sides[side].faction === "rome";
export const visibleTo = (b, side, u) => !u.hidden || u.side === side;

// ---------- orders (player or AI) ----------

export function orderUnits(b, ids, order) {
  for (const u of b.units) if (ids.includes(u.id) && fighting(u)) u.order = { ...order };
}

export function setFormation(b, id, formation) {
  const u = b.units.find((x) => x.id === id);
  if (!u || !fighting(u) || u.formation === formation || !U[u.type].formations.includes(formation)) return false;
  u.formation = formation;
  u.reform = 1.5;
  return true;
}

export function startBattle(b) {
  b.phase = "fight";
  if (b.terrain.siege) for (const u of b.units) if (u.side === "defender" && insideWalls(b.terrain, u.x, u.y)) { u.baseMorale += B.garrisonCourage; u.morale += B.garrisonCourage; }
  // units standing in woods at the start lie hidden
  for (const u of b.units) u.hidden = groundAt(b.terrain, u.x, u.y) === GROUND.forest && !BALANCE.units[u.type].artillery;
}

export function soundRetreat(b, side) {
  for (const u of b.units) if (u.side === side && fighting(u)) { u.state = "routing"; u.morale = 0; u.routTime = -999; }
  b.log.push({ t: b.time, text: side === b.playerSide ? "You sound the retreat." : "The enemy sounds the retreat." });
}

// ---------- abilities ----------

export function abilityReady(b, side, key) {
  return b.sides[side].generalAlive && (b.sides[side].cooldowns[key] ?? -1) <= b.time;
}

export function useAbility(b, side, key, targetId = null) {
  const A = BALANCE.abilities[key];
  const gen = b.units.find((u) => u.side === side && u.general && live(u));
  if (!A || !gen || !abilityReady(b, side, key)) return false;
  const near = (u, r) => dist(u, gen) <= r;
  if (key === "warcry") {
    for (const u of b.units) {
      if (u.side === side && fighting(u) && near(u, A.radius)) { u.morale = Math.min(110, u.morale + A.morale); u.buffs.push({ attack: A.attack, until: b.time + A.duration }); }
      if (u.side !== side && fighting(u) && near(u, A.radius * 0.7)) u.morale += A.enemyMorale;
    }
  } else if (key === "rally") {
    for (const u of b.units) if (u.side === side && u.state === "routing" && u.routTime > -100 && near(u, A.radius)) { u.state = "ready"; u.morale = A.morale; u.order = { kind: "hold" }; }
  } else if (key === "fury") {
    const t = b.units.find((u) => u.id === targetId && u.side === side && fighting(u)) || gen;
    t.buffs.push({ attack: A.attack, charge: A.charge, noFatigue: true, until: b.time + A.duration });
    t.fatigue = 0;
  } else if (key === "hold") {
    for (const u of b.units) if (u.side === side && fighting(u) && near(u, A.radius)) { u.morale += A.morale; u.buffs.push({ defence: A.defence, until: b.time + A.duration }); }
  }
  b.sides[side].cooldowns[key] = b.time + A.cooldown;
  b.effects.push({ kind: key, x: gen.x, y: gen.y, r: A.radius || 60, t: b.time, side });
  b.log.push({ t: b.time, text: `${side === b.playerSide ? "Your" : "The enemy"} general: ${A.label}!` });
  return true;
}

// ---------- the tick ----------

export function tick(b) {
  if (b.over || b.phase !== "fight") return;
  const dt = B.tick;
  b.time += dt;
  if (Math.round(b.time / dt) % 10 === 0) for (const side of ["attacker", "defender"]) if (side !== b.playerSide) aiThink(b, side);

  for (const u of b.units) {
    u.buffs = u.buffs.filter((x) => x.until > b.time);
    if (u.reform > 0) u.reform -= dt;
    if (u.charge > 0) u.charge -= dt;
  }
  reveal(b);
  contacts(b);
  for (const u of b.units) if (live(u)) move(b, u, dt);
  separate(b);
  contacts(b);
  missiles(b, dt);
  melee(b, dt);
  morale(b, dt);
  siege(b, dt);
  cull(b);
  checkEnd(b);
  b.effects = b.effects.filter((e) => b.time - e.t < 2);
}

function reveal(b) {
  for (const u of b.units) {
    if (!u.hidden) continue;
    const out = groundAt(b.terrain, u.x, u.y) !== GROUND.forest;
    const spotted = b.units.some((e) => e.side !== u.side && fighting(e) && dist(e, u) < B.ambushRevealRange);
    if (out || spotted || u.foes.length) { u.hidden = false; u.ambushing = true; }
  }
}

function contacts(b) {
  for (const u of b.units) u.foes = [];
  const list = b.units.filter(live);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = list[i], q = list[j];
    if (p.side === q.side || !inContact(p, q)) continue;
    p.foes.push(q); q.foes.push(p);
  }
}

// ---------- movement ----------

function destination(b, u) {
  const o = u.order;
  if (u.state === "routing") {
    const edge = b.top === u.side ? -40 : B.height + 40;
    return { x: u.x, y: edge };
  }
  if (o.kind === "move") return { x: o.x, y: o.y };
  if (o.kind === "attack") {
    const t = b.units.find((x) => x.id === o.target);
    if (!t || !live(t) || !visibleTo(b, u.side, t)) { u.order = { kind: "hold" }; return null; }
    return { x: t.x, y: t.y };
  }
  if (o.kind === "gate" && b.terrain.siege) {
    const g = b.terrain.siege.gate;
    // spread along the gateway rather than queueing on one spot
    const lane = ((u.id % 3) - 1) * 26;
    return b.terrain.siege.gateHp > 0 ? { x: g.x + lane, y: g.y + 32 + (u.id % 2) * 22 } : { x: b.terrain.siege.cx + lane, y: b.terrain.siege.cy };
  }
  return null;
}

// In a siege, horse (and anyone once the gate is down, or sent at it) go by the gate; other foot
// climb straight over the wall.
function waypoint(b, u, dest) {
  const s = b.terrain.siege;
  if (!s || !dest) return dest;
  const inU = insideWalls(b.terrain, u.x, u.y), inD = insideWalls(b.terrain, dest.x, dest.y);
  if (inU === inD) return dest;
  if (!(u.mounted || s.gateHp <= 0 || u.order.kind === "gate")) return dest;
  const g = s.gate;
  const outside = { x: g.x, y: g.y + 30 }, inside = { x: g.x, y: g.y - 30 };
  if (s.gateHp > 0) return inU ? dest : outside;
  // line up on the gate from afar; once at it, go straight through
  const far = inU ? outside : inside;
  if (Math.hypot(u.x - g.x, u.y - g.y) < 45) return far;
  return inU ? inside : outside;
}

function move(b, u, dt) {
  const engaged = u.foes.some(fighting) && u.state !== "routing";
  if (engaged) {
    // turn to face the main foe (slowly if braced)
    const f = u.foes.find(fighting);
    turnTo(u, Math.atan2(f.x - u.x, -(f.y - u.y)), dt * (F[u.formation].braced ? 0.4 : 1));
    u.run = 0;
    u.state = "fighting";
    u.fatigue = Math.min(100, u.fatigue + (u.buffs.some((x) => x.noFatigue) ? 0 : B.fatiguePerSecFight * dt));
    return;
  }
  if (u.state === "fighting") u.state = "ready";
  let dest = destination(b, u);
  dest = waypoint(b, u, dest);
  if (!dest) { idle(u, dt); return; }
  const dx = dest.x - u.x, dy = dest.y - u.y, dd = Math.hypot(dx, dy);
  if (dd < 4) {
    if (u.order.kind === "move") { if (u.order.face !== undefined) turnTo(u, u.order.face, dt); if (u.order.face === undefined || Math.abs(angDiff(u.a, u.order.face)) < 0.05) u.order = { kind: "hold", face: u.order.face }; }
    idle(u, dt);
    return;
  }
  const want = Math.atan2(dx, -dy);
  const diff = Math.abs(angDiff(u.a, want));
  turnTo(u, want, dt);
  const d = U[u.type];
  let speed = d.speed * F[u.formation].speed * speedMult(b.terrain, u.x, u.y, u.mounted) * (1 - u.fatigue / 220);
  if (u.reform > 0) speed *= 0.5;
  if (u.state === "routing") speed *= 1.15;
  if (diff > 1.2) speed *= 0.25;
  const step = Math.min(dd, speed * dt);
  const nx = u.x + (dx / dd) * step, ny = u.y + (dy / dd) * step;
  if (passable(b.terrain, nx, ny, u.mounted)) { u.x = nx; u.y = ny; }
  else if (passable(b.terrain, nx, u.y, u.mounted)) u.x = nx;
  else if (passable(b.terrain, u.x, ny, u.mounted)) u.y = ny;
  u.climbing = groundAt(b.terrain, u.x, u.y) === GROUND.wall;
  u.run = diff < 0.6 ? u.run + step : u.run * 0.5;
  if (u.state !== "routing") u.state = "moving";
  u.fatigue = Math.min(100, u.fatigue + (u.buffs.some((x) => x.noFatigue) ? 0 : B.fatiguePerSecRun * dt * (speed > 30 ? 1.4 : 0.6)));
}

function idle(u, dt) {
  if (u.state === "moving") u.state = "ready";
  u.run *= 0.8;
  u.fatigue = Math.max(0, u.fatigue - B.fatigueRecover * dt);
}

function turnTo(u, want, dt) {
  const rate = (u.mounted ? 2.4 : 1.5) * dt;
  const diff = angDiff(u.a, want);
  u.a += Math.max(-rate, Math.min(rate, diff));
}

const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

// Friends do not stand inside each other.
function separate(b) {
  const list = b.units.filter((u) => live(u) && u.state !== "routing");
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = list[i], q = list[j];
    if (p.side !== q.side) continue;
    const dd = dist(p, q) || 0.01;
    const dx = (q.x - p.x) / dd, dy = (q.y - p.y) / dd;
    const need = (extent(p, dx, dy) + extent(q, -dx, -dy)) * 0.9;
    if (dd >= need) continue;
    const push = (need - dd) / 2;
    if (canNudge(b, p, p.x - dx * push, p.y - dy * push)) { p.x -= dx * push; p.y -= dy * push; }
    if (canNudge(b, q, q.x + dx * push, q.y + dy * push)) { q.x += dx * push; q.y += dy * push; }
  }
}

// Jostling never carries a unit onto or across a wall.
function canNudge(b, u, x, y) {
  if (!passable(b.terrain, x, y, u.mounted)) return false;
  if (!b.terrain.siege) return true;
  const g = groundAt(b.terrain, x, y);
  return g !== GROUND.wall && g !== GROUND.gate && insideWalls(b.terrain, x, y) === insideWalls(b.terrain, u.x, u.y);
}

// ---------- fighting ----------

function attackValue(b, a, t) {
  const d = U[a.type], f = F[a.formation];
  const rank = BALANCE.ranks[a.rank];
  let v = d.attack * rank.attack * (1 + BALANCE.upgrades.weapons.perLevel * a.weapons) * f.attack * buff(a, "attack");
  v *= 0.55 + 0.45 * Math.min(1, Math.max(0, a.morale) / 60);
  v *= 1 - a.fatigue / 250;
  if (a.charge > 0) {
    const braced = F[t.formation].braced && aspect(t, a) === "front";
    v *= 1 + d.charge * f.charge * buff(a, "charge") * 0.09 * (braced ? 0.35 : 1);
  }
  if (heightAt(b.terrain, a.x, a.y) > heightAt(b.terrain, t.x, t.y) + 0.2) v *= B.hillAttack;
  if (t.mounted && d.antiCav) v *= d.antiCav;
  if (a.mounted && F[t.formation].braced && aspect(t, a) === "front") v *= 0.7;
  if (t.climbing) v *= 1.3;
  return v;
}

function defenceValue(b, t, a) {
  const d = U[t.type], f = F[t.formation];
  const rank = BALANCE.ranks[t.rank];
  let v = d.defence * rank.defence * (1 + BALANCE.upgrades.armour.perLevel * t.armour) * f.defence * buff(t, "defence");
  const g = groundAt(b.terrain, t.x, t.y);
  if (g === GROUND.forest) v *= B.forestDefence;
  if (g === GROUND.river || g === GROUND.marsh) v *= B.riverDefence;
  if (heightAt(b.terrain, t.x, t.y) > heightAt(b.terrain, a.x, a.y) + 0.2) v *= B.hillDefence;
  if (b.terrain.siege && insideWalls(b.terrain, t.x, t.y) && !insideWalls(b.terrain, a.x, a.y)) v *= B.wallDefence;
  if (t.climbing) v *= B.ladderDefence;
  if (t.reform > 0) v *= 0.75;
  v *= 1 - t.fatigue / 300;
  return v;
}

function melee(b, dt) {
  for (const a of b.units) {
    if (!fighting(a) || !a.foes.length) continue;
    // a fresh contact after a run is a charge
    for (const t of a.foes) {
      if (a.charged?.includes(t.id)) continue;
      (a.charged ||= []).push(t.id);
      if (a.run >= B.chargeMinRun && fighting(a)) {
        a.charge = B.chargeSeconds;
        const braced = F[t.formation].braced && aspect(t, a) === "front";
        const d = U[a.type];
        t.morale -= d.charge * F[a.formation].charge * B.chargeShockMorale * (braced ? 0.3 : 1) + (d.shock && !braced ? d.shock : 0) + (a.ambushing ? B.ambushMorale : 0);
        b.effects.push({ kind: "charge", x: t.x, y: t.y, t: b.time });
      }
      a.ambushing = false;
    }
    const share = 1 / a.foes.length;
    const fronts = Math.min(a.men, B.frontage * Math.max(0.85, F[a.formation].width)) / B.frontage;
    for (const t of a.foes) {
      const walled = b.terrain.siege && insideWalls(b.terrain, t.x, t.y) && !insideWalls(b.terrain, a.x, a.y);
      const where = walled ? "front" : aspect(t, a);
      const pos = where === "rear" ? B.rearMult : where === "flank" ? B.flankMult : 1;
      let kills = B.killRate * dt * share * fronts * (attackValue(b, a, t) / defenceValue(b, t, a)) * pos * (0.85 + rnd(b) * 0.3);
      if (t.state === "routing") kills *= B.pursuitKills;
      kills = Math.min(kills, t.men);
      t.men -= kills;
      a.kills += kills;
      t.morale -= (kills / t.start) * B.casualtyMorale * (walled ? B.wallMorale : 1);
      if (where !== "front" && t.state !== "routing") t.morale -= (where === "rear" ? B.rearMoralePerSec : B.flankMoralePerSec) * dt * share;
    }
  }
}

function missiles(b, dt) {
  for (const u of b.units) {
    if (!fighting(u)) continue;
    const d = U[u.type];
    // legionaries hurl their pila as the enemy closes
    if (u.pila && !u.foes.length) {
      const t = nearestEnemy(b, u, B.pilaRange, true);
      if (t) volley(b, u, t, d.pila * 1.2, 5), (u.pila = 0);
    }
    if (!d.range || u.ammo <= 0 || u.foes.length || u.state === "moving") continue;
    u.reload -= dt;
    if (u.reload > 0) continue;
    const range = d.range * (wallPerch(b, u) ? 1.15 : 1);
    if (d.artillery && b.terrain.siege?.gateHp > 0 && u.side === "attacker" && u.order.kind === "gate" && dist(u, b.terrain.siege.gate) < range) {
      b.terrain.siege.gateHp -= B.artilleryGateDamage;
      b.effects.push({ kind: "bolt", x0: u.x, y0: u.y, x: b.terrain.siege.gate.x, y: b.terrain.siege.gate.y, t: b.time });
      u.ammo--; u.reload = B.missileReload * 1.8;
      continue;
    }
    const ordered = u.order.kind === "attack" && b.units.find((x) => x.id === u.order.target);
    const t = ordered && live(ordered) && dist(u, ordered) <= range ? ordered : nearestEnemy(b, u, range, false);
    if (!t) continue;
    turnTo(u, Math.atan2(t.x - u.x, -(t.y - u.y)), 1);
    volley(b, u, t, d.missile * (1 - 0.4 * dist(u, t) / range), 0.8);
    u.ammo--;
    u.reload = B.missileReload * (d.artillery ? 1.8 : 1);
    u.hidden = false;
  }
}

function volley(b, u, t, power, shock) {
  let cover = F[t.formation].missileDef * (1 - BALANCE.upgrades.armour.perLevel * t.armour);
  if (groundAt(b.terrain, t.x, t.y) === GROUND.forest) cover *= B.missileForestCover;
  if (b.terrain.siege && insideWalls(b.terrain, t.x, t.y) && !insideWalls(b.terrain, u.x, u.y)) cover /= B.wallMissile;
  if (wallPerch(b, u)) cover *= B.wallMissile;
  const kills = Math.min(t.men, (u.men / 100) * power * 1.6 * cover * (0.8 + rnd(b) * 0.4));
  t.men -= kills;
  u.kills += kills;
  t.morale -= (kills / t.start) * B.casualtyMorale + shock;
  t.hitBy = b.time;
  b.effects.push({ kind: "volley", x0: u.x, y0: u.y, x: t.x, y: t.y, t: b.time, side: u.side });
}

// Shooters standing just inside their own walls.
function wallPerch(b, u) {
  const s = b.terrain.siege;
  if (!s || !insideWalls(b.terrain, u.x, u.y)) return false;
  return Math.max(Math.abs(u.x - s.cx), Math.abs(u.y - s.cy)) > s.half - 60;
}

function nearestEnemy(b, u, range, frontOnly) {
  let best = null, bd = range;
  const [fx, fy] = facing(u.a);
  for (const e of b.units) {
    if (e.side === u.side || !live(e) || !visibleTo(b, u.side, e)) continue;
    const dd = dist(u, e);
    if (dd > bd) continue;
    if (frontOnly && ((e.x - u.x) * fx + (e.y - u.y) * fy) / (dd || 1) < 0.5) continue;
    best = e; bd = dd;
  }
  return best;
}

// ---------- morale ----------

function morale(b, dt) {
  for (const u of b.units) {
    if (!live(u)) continue;
    const gen = b.units.find((g) => g.side === u.side && g.general && fighting(g));
    if (u.state === "routing") {
      u.routTime += dt;
      const threatened = b.units.some((e) => e.side !== u.side && fighting(e) && dist(e, u) < 140);
      if (!threatened && u.routTime > B.routSeconds && u.rallies < 2) { u.state = "ready"; u.morale = B.rallyAt; u.rallies++; u.order = { kind: "hold" }; }
      continue;
    }
    if (!u.foes.length) {
      const cap = u.baseMorale + (gen && dist(gen, u) < BALANCE.generals.auraRadius ? 10 : 0);
      if (u.morale < cap) u.morale += (1 + (gen && dist(gen, u) < BALANCE.generals.auraRadius ? BALANCE.generals.auraMorale : 0)) * dt;
    } else if (gen && dist(gen, u) < BALANCE.generals.auraRadius) u.morale += BALANCE.generals.auraMorale * 0.25 * dt;
    if (u.morale <= B.routAt) rout(b, u);
  }
}

function rout(b, u) {
  u.state = "routing";
  u.routTime = 0;
  u.order = { kind: "hold" };
  for (const f of b.units) if (f.side === u.side && fighting(f) && f !== u && dist(f, u) < 130) f.morale -= B.nearbyRoutMorale;
  b.log.push({ t: b.time, text: `${u.side === b.playerSide ? "Your" : "The enemy"} ${U[u.type].name} break and run!` });
}

// ---------- sieges ----------

function siege(b, dt) {
  const s = b.terrain.siege;
  if (!s) return;
  if (s.gateHp > 0) {
    for (const u of b.units) {
      if (u.side !== "attacker" || !fighting(u) || u.mounted || u.order.kind !== "gate") continue;
      if (Math.hypot(u.x - s.gate.x, u.y - (s.gate.y + 40)) < 50) {
        s.gateHp -= B.gateDamagePerSec * (u.men / 100) * (U[u.type].attack / 6) * dt * 10;
        u.state = "fighting";
      }
    }
    if (s.gateHp <= 0) { s.gateHp = 0; b.log.push({ t: b.time, text: "The gate is broken!" }); b.effects.push({ kind: "gate", x: s.gate.x, y: s.gate.y, t: b.time }); }
  }
  const centre = { x: s.cx, y: s.cy };
  const def = b.units.some((u) => u.side === "defender" && fighting(u) && dist(u, centre) < B.plazaRadius * 1.6);
  const att = b.units.some((u) => u.side === "attacker" && fighting(u) && dist(u, centre) < B.plazaRadius);
  b.plazaTimer = att && !def ? b.plazaTimer + dt : Math.max(0, b.plazaTimer - dt * 2);
}

// ---------- casualties and the end ----------

function cull(b) {
  for (const u of b.units) {
    if (!live(u)) continue;
    const offField = u.y < -30 || u.y > B.height + 30;
    if (u.men < u.start * 0.05 || offField) {
      if (!offField) u.men = 0;
      u.state = "gone";
      if (u.general && !offField) generalFalls(b, u);
    }
  }
}

function generalFalls(b, g) {
  b.sides[g.side].generalAlive = false;
  b.sides[g.side].generalSlain = true;
  for (const u of b.units) if (u.side === g.side && fighting(u)) u.morale -= BALANCE.generals.deathMoraleHit;
  b.log.push({ t: b.time, text: g.side === b.playerSide ? "Your chieftain has fallen!" : "The enemy general has fallen!" });
}

function checkEnd(b) {
  const broken = (side) => !b.units.some((u) => u.side === side && fighting(u));
  let winner = null, reason = "";
  if (broken("defender")) { winner = "attacker"; reason = "The defenders are broken."; }
  else if (broken("attacker")) { winner = "defender"; reason = "The attackers are broken."; }
  else if (b.terrain.siege && b.plazaTimer >= B.plazaHold) { winner = "attacker"; reason = "The attackers hold the heart of the fort."; }
  else if (b.time >= (b.siege ? B.siegeTimeLimit : B.timeLimit)) { winner = "defender"; reason = "Night falls; the attackers draw off."; }
  if (!winner) return;
  b.over = true;
  b.result = { winner, reason };
}

// Run a battle to its end with the AI on both sides (auto-resolve, or the AI fighting itself).
export function autoResolve(b) {
  const keep = b.playerSide;
  b.playerSide = null;
  if (b.phase === "deploy") startBattle(b);
  let guard = 0;
  while (!b.over && guard++ < 20000) tick(b);
  b.playerSide = keep;
  return b.result;
}
