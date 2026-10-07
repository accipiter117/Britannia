// simulation/battle/setup.js
// Owns turning a campaign clash into a battle: the field (terrain.js), each side's units as bands
// of individual soldiers with their campaign stats (rank, upgrades), and deployment. Sides are
// "attacker" and "defender"; `top` is the side deployed along the top edge (defenders in sieges,
// otherwise whoever is not the player). Units keep a `ref` back to their campaign unit.

import { BALANCE } from "../../config/balance.js";
import { rankOf } from "../state.js";
import { hashString, nextRandom } from "../random.js";
import { GROUND, groundAt, makeTerrain } from "./terrain.js";

const B = BALANCE.battle;
const U = BALANCE.units;

// forces: { attacker: { faction, armies: [army], garrison?: [unit] }, defender: {...} }
export function createBattle({ region, attacker, defender, siege = false, playerSide = null, seed = 1 }) {
  const rng = hashString(region.id) ^ (seed * 7919);
  const terrain = makeTerrain(region.terrain, rng, siege);
  const top = siege ? "defender" : playerSide ? (playerSide === "attacker" ? "defender" : "attacker") : "defender";
  const battle = {
    region: region.id, regionName: region.name, siege, playerSide, top,
    terrain, time: 0, phase: "deploy", over: false, result: null, rng,
    sides: {
      attacker: { faction: attacker.faction, cooldowns: {}, generalAlive: false },
      defender: { faction: defender.faction, cooldowns: {}, generalAlive: false },
    },
    units: [], soldiers: [], projectiles: [], effects: [], log: [], plazaTimer: 0, nextId: 1,
  };
  for (const side of ["attacker", "defender"]) {
    const force = side === "attacker" ? attacker : defender;
    const list = [];
    for (const army of force.armies || []) army.units.forEach((u, i) => { if (u.men > 0) list.push(makeUnit(battle, side, u, { armyId: army.id, index: i })); });
    (force.garrison || []).forEach((u, i) => { if (u.men > 0) list.push(makeUnit(battle, side, u, { garrison: true, index: i })); });
    deploy(battle, side, list);
    battle.units.push(...list);
    battle.sides[side].generalAlive = list.some((u) => u.general);
  }
  for (const u of battle.units) spawnSoldiers(battle, u);
  return battle;
}

function makeUnit(battle, side, cu, ref) {
  const d = U[cu.type];
  const rank = rankOf(cu);
  const tags = d.tags || [];
  return {
    id: battle.nextId++, side, type: cu.type, def: d, ref, name: d.name,
    start: cu.men, men: cu.men, cx: 0, cy: 0, a: 0, formation: d.formation, rows: d.rows,
    order: { kind: "hold" }, state: "ready", ai: false,
    morale: d.morale + BALANCE.ranks[rank].morale, baseMorale: d.morale + BALANCE.ranks[rank].morale,
    stamina: d.stamina, charge: 0, run: 0, impacted: [], throwLeft: d.throw?.ammo || 0,
    rank, attack: d.attack + BALANCE.ranks[rank].attack + BALANCE.upgrades.weapons.perLevel * (cu.weapons || 0),
    defence: d.defence + BALANCE.ranks[rank].defence + BALANCE.upgrades.armour.perLevel * (cu.armour || 0),
    general: tags.includes("general"), mounted: tags.includes("mounted"), spear: tags.includes("spear"),
    ranged: !!d.range, artillery: tags.includes("artillery"), hidden: false,
    routTime: 0, rallies: 0, kills: 0, buffs: [], fighting: 0, flankHit: -99, hitBy: -99,
  };
}

function spawnSoldiers(b, u) {
  const r = { rng: b.rng ^ u.id * 131 };
  for (let i = 0; i < u.men; i++) {
    b.soldiers.push({
      id: b.soldiers.length, u, slot: i, x: u.cx, y: u.cy, hp: u.def.hp, alive: true, fled: false,
      target: null, cd: nextRandom(r) * B.attackInterval, stun: 0, reload: nextRandom(r) * B.reload,
      ammo: u.def.ammo || 0, jx: (nextRandom(r) - 0.5) * 2, jy: (nextRandom(r) - 0.5) * 2,
      face: u.a > Math.PI / 2 ? 1 : -1, walk: nextRandom(r) * 10, moving: false, deadAt: 0, charged: false,
    });
  }
  const list = b.soldiers.filter((s) => s.u === u);
  u.soldiers = list;
  for (const s of list) { const [x, y] = slotPos(u, s.slot, list.length, s); s.x = x; s.y = y; }
}

// Where soldier number `i` of `n` stands in its unit's formation.
export function slotPos(u, i, n, s) {
  const f = BALANCE.formations[u.formation];
  const cols = Math.max(1, Math.ceil(n / u.rows));
  const col = i % cols, row = Math.floor(i / cols);
  const fx = Math.sin(u.a), fy = -Math.cos(u.a);   // facing
  const rx = Math.cos(u.a), ry = Math.sin(u.a);    // to the right
  const across = (col - (cols - 1) / 2) * f.spacing + (s ? s.jx * f.jitter : 0);
  const back = (row - (u.rows - 1) / 2) * f.depth + (s ? s.jy * f.jitter : 0);
  return [u.cx + rx * across - fx * back, u.cy + ry * across - fy * back];
}

export function unitWidth(u, n = u.men) {
  return Math.max(1, Math.ceil(n / u.rows)) * BALANCE.formations[u.formation].spacing;
}

// Deployment: the line in front, skirmishers ahead (Britons) or behind (Romans), horse on the
// wings, the general behind the centre. In a siege the defenders stand inside their walls.
function deploy(battle, side, list) {
  const atTop = battle.top === side;
  const dir = atTop ? 1 : -1;
  const cx = B.width / 2;
  const baseY = atTop ? 50 : B.height - 50;
  const by = (pred) => list.filter(pred);
  const melee = by((u) => !u.ranged && !u.mounted);
  const ranged = by((u) => u.ranged && !u.artillery);
  const horse = by((u) => u.mounted && !u.general);
  const art = by((u) => u.artillery);
  const gen = by((u) => u.general);
  const roman = battle.sides[side].faction === "rome";
  const face = dir > 0 ? Math.PI : 0;
  const place = (units, x, y, gap) => {
    const widths = units.map((u) => unitWidth(u) + gap);
    let off = -widths.reduce((n, w) => n + w, 0) / 2;
    units.forEach((u, i) => { u.cx = Math.max(60, Math.min(B.width - 60, x + off + widths[i] / 2)); u.cy = y; u.a = face; off += widths[i]; });
  };
  if (battle.siege && side === "defender") {
    const s = battle.terrain.siege;
    place(ranged, cx, s.cy + s.half - 50, 10);
    place(melee, cx, s.cy + s.half - 95, 10);
    place([...horse, ...art], cx, s.cy - 40, 10);
    place(gen, cx, s.cy - 100, 10);
  } else {
    // The field is narrow and deep, so a big host stands in two lines: the first line as wide as
    // the field allows, the rest close behind; horse on the wings of the second line.
    const front = baseY + dir * 190, second = front - dir * 75;
    const room = B.width - 140;
    const first = [];
    let used = 0;
    for (const u of melee) { const w = unitWidth(u) + 14; if (first.length && used + w > room) break; first.push(u); used += w; }
    const rest = melee.slice(first.length);
    place(first, cx, front, 14);
    place(rest, cx, second, 14);
    place(ranged, cx, roman ? second - dir * (rest.length ? 60 : 0) : front + dir * 60, 20);
    const behind = rest.length ? rest : roman ? ranged : [];
    const lineHalf = behind.reduce((n, u) => n + unitWidth(u) + 14, 0) / 2;
    const half = Math.ceil(horse.length / 2);
    place(horse.slice(0, half), cx - lineHalf - 70, second, 10);
    place(horse.slice(half), cx + lineHalf + 70, second, 10);
    place(art, cx, baseY + dir * 20, 30);
    place(gen, cx, baseY, 10);
  }
  for (const u of list) {
    for (let k = 0; k < 8 && [GROUND.wall, GROUND.gate, GROUND.river].includes(groundAt(battle.terrain, u.cx, u.cy)); k++) u.cy -= dir * 20;
  }
}

export function deployZone(battle, side) {
  const atTop = battle.top === side;
  if (battle.siege && side === "defender") {
    const s = battle.terrain.siege;
    return { x0: s.cx - s.half + 25, x1: s.cx + s.half - 25, y0: s.cy - s.half + 25, y1: s.cy + s.half - 25 };
  }
  return atTop ? { x0: 40, x1: B.width - 40, y0: 30, y1: B.deployDepth } : { x0: 40, x1: B.width - 40, y0: B.height - B.deployDepth, y1: B.height - 30 };
}

// Moves a whole unit (and its soldiers) during deployment.
export function placeUnit(b, u, x, y) {
  const z = deployZone(b, u.side);
  u.cx = Math.max(z.x0, Math.min(z.x1, x));
  u.cy = Math.max(z.y0, Math.min(z.y1, y));
  const alive = u.soldiers.filter((s) => s.alive);
  alive.forEach((s, i) => { const [sx, sy] = slotPos(u, i, alive.length, s); s.x = sx; s.y = sy; });
}
