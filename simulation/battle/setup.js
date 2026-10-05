// simulation/battle/setup.js
// Owns turning a campaign clash into a battle: the field (terrain.js), each side's units with
// their campaign stats (rank, upgrades), and deployment. Sides are "attacker" and "defender";
// `top` is the side deployed along the top edge (defenders in sieges, otherwise whoever is not
// the player). Units keep a `ref` back to their campaign unit for the results.

import { BALANCE } from "../../config/balance.js";
import { rankOf } from "../state.js";
import { hashString } from "../random.js";
import { GROUND, groundAt, makeTerrain } from "./terrain.js";

const B = BALANCE.battle;

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
    units: [], effects: [], log: [], plazaTimer: 0, nextId: 1,
  };
  for (const side of ["attacker", "defender"]) {
    const force = side === "attacker" ? attacker : defender;
    const list = [];
    for (const army of force.armies || []) army.units.forEach((u, i) => list.push(makeUnit(battle, side, u, { armyId: army.id, index: i })));
    (force.garrison || []).forEach((u, i) => list.push(makeUnit(battle, side, u, { garrison: true, index: i })));
    deploy(battle, side, list);
    battle.units.push(...list);
    battle.sides[side].generalAlive = list.some((u) => u.general);
  }
  return battle;
}

function makeUnit(battle, side, cu, ref) {
  const d = BALANCE.units[cu.type];
  const rank = rankOf(cu);
  return {
    id: battle.nextId++, side, type: cu.type, ref, name: d.name,
    men: cu.men, start: cu.men, x: 0, y: 0, a: 0,
    formation: d.formations[0], reform: 0,
    order: { kind: "hold" }, state: "ready",
    morale: d.morale + BALANCE.ranks[rank].morale, baseMorale: d.morale + BALANCE.ranks[rank].morale,
    fatigue: 0, ammo: d.ammo || 0, reload: 0, pila: d.pila ? 1 : 0,
    charge: 0, run: 0, kills: 0, rank, weapons: cu.weapons || 0, armour: cu.armour || 0,
    general: !!d.general, mounted: !!d.mounted, ranged: !!d.range, hidden: false,
    routTime: 0, rallies: 0, buffs: [], foes: [], hitBy: 0,
  };
}

// Deployment: melee in a front line, skirmishers ahead or behind, horse on the wings, the
// general behind the centre. In a siege the defenders stand inside their walls.
function deploy(battle, side, list) {
  const atTop = battle.top === side;
  const dir = atTop ? 1 : -1;                         // towards the enemy
  const baseY = atTop ? 70 : B.height - 70;
  const cx = B.width / 2;
  const by = (pred) => list.filter(pred);
  const melee = by((u) => !u.ranged && !u.mounted && !BALANCE.units[u.type].artillery);
  const ranged = by((u) => u.ranged && !BALANCE.units[u.type].artillery);
  const horse = by((u) => u.mounted && !u.general);
  const art = by((u) => BALANCE.units[u.type].artillery);
  const gen = by((u) => u.general);
  const roman = battle.sides[side].faction === "rome";

  if (battle.siege && side === "defender") {
    const s = battle.terrain.siege;
    row(ranged, cx, s.cy + s.half - 48, 90, dir);
    row(melee, cx, s.cy + s.half - 90, 80, dir);
    row([...horse, ...art], cx, s.cy - 20, 80, dir);
    row(gen, cx, s.cy - 70, 60, dir);
  } else {
    const front = baseY + dir * 60;
    row(melee, cx, front, 92, dir);
    // Romans shoot from behind their line; Picts screen with skirmishers in front
    row(ranged, cx, roman ? baseY : front + dir * 55, 100, dir);
    const half = Math.ceil(horse.length / 2);
    const edge = Math.min(B.width / 2 - 70, (melee.length * 92) / 2 + 90);
    row(horse.slice(0, half), cx - edge, front, 70, dir);
    row(horse.slice(half), cx + edge, front, 70, dir);
    row(art, cx, baseY - dir * 25, 80, dir);
    row(gen, cx, baseY - dir * 10, 60, dir);
  }
  // anyone standing in a wall or river is nudged clear
  for (const u of list) {
    for (let k = 0; k < 8 && [GROUND.wall, GROUND.gate, GROUND.river].includes(groundAt(battle.terrain, u.x, u.y)); k++) u.y -= dir * 20;
  }
}

function row(units, cx, y, spacing, dir) {
  units.forEach((u, i) => {
    u.x = Math.max(40, Math.min(B.width - 40, cx + (i - (units.length - 1) / 2) * spacing));
    u.y = y;
    u.a = dir > 0 ? Math.PI : 0; // facing: 0 = up the field, PI = down
  });
}

// The deployment zone for a side (for the player's drag-to-place before battle).
export function deployZone(battle, side) {
  const atTop = battle.top === side;
  if (battle.siege && side === "defender") {
    const s = battle.terrain.siege;
    return { x0: s.cx - s.half + 25, x1: s.cx + s.half - 25, y0: s.cy - s.half + 25, y1: s.cy + s.half - 25 };
  }
  return atTop ? { x0: 30, x1: B.width - 30, y0: 20, y1: B.deployDepth } : { x0: 30, x1: B.width - 30, y0: B.height - B.deployDepth, y1: B.height - 20 };
}
