// simulation/battle/ai.js
// Owns the battle AI for a side, run once a second (engine.js). Infantry advance as a line and
// close with the nearest foe; missile troops shoot and fall back from melee; horse hunt
// skirmishers and strike engaged enemies in the flank or rear; the general stays behind the line
// and uses abilities. Romans form testudo under arrows and brace when charged by horse. In a
// siege, attackers batter the gate (and climb when it holds too long); defenders hold the walls.

import { BALANCE } from "../../config/balance.js";
import { insideWalls } from "./terrain.js";
import { abilityReady, aspect, facing, fighting, setFormation, useAbility, visibleTo } from "./engine.js";

const U = BALANCE.units;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function aiThink(b, side) {
  const mine = b.units.filter((u) => u.side === side && fighting(u));
  const foes = b.units.filter((u) => u.side !== side && fighting(u) && visibleTo(b, side, u));
  if (!mine.length || !foes.length) return;
  const roman = b.sides[side].faction === "rome";
  const s = b.terrain.siege;
  const centre = (list) => ({ x: list.reduce((n, u) => n + u.x, 0) / list.length, y: list.reduce((n, u) => n + u.y, 0) / list.length });
  const enemyMid = centre(foes);
  const infantry = mine.filter((u) => !u.mounted && !u.ranged && !U[u.type].artillery);
  const closest = Math.min(...mine.map((u) => Math.min(...foes.map((f) => dist(u, f)))));

  // defenders on good ground wait for the enemy to come on
  const defending = side === "defender";
  const waitForThem = defending && (s || closest > 260) && b.time < 200;

  abilities(b, side, mine, roman);

  for (const u of mine) {
    const d = U[u.type];
    const nearest = foes.reduce((best, f) => (!best || dist(u, f) < dist(u, best) ? f : best), null);
    const nd = dist(u, nearest);

    // formations
    if (roman && u.type === "legionaries") {
      const shotAt = b.time - (u.hitBy || -99) < 4;
      setFormation(b, u.id, shotAt && nd > 110 ? "testudo" : "line");
    } else if (d.formations.includes("shieldwall")) {
      const horseNear = foes.some((f) => f.mounted && dist(f, u) < 180);
      setFormation(b, u.id, horseNear || (waitForThem && nd < 200) ? "shieldwall" : "line");
    } else if (d.formations.includes("wedge") && !u.ranged) {
      setFormation(b, u.id, nd < 220 && nd > 60 ? "wedge" : "line");
    } else if (d.formations.includes("loose") && u.ranged) {
      setFormation(b, u.id, "loose");
    }

    if (u.foes.length) continue; // already fighting: the engine handles it

    if (u.general) {
      // stay behind the infantry; finish off the broken
      const line = infantry.length ? centre(infantry) : u;
      const prey = foes.find((f) => (f.ranged || f.state === "routing") && dist(f, u) < 200);
      if (prey && u.men > u.start * 0.5) order(u, { kind: "attack", target: prey.id });
      else order(u, { kind: "move", x: line.x, y: line.y + towardsOwnEdge(b, side) * 90 });
      continue;
    }
    if (d.artillery) {
      if (s && side === "attacker" && s.gateHp > 0) { order(u, { kind: "gate" }); if (dist(u, s.gate) > d.range * 0.9) u.order = { kind: "move", x: s.gate.x, y: s.gate.y + d.range * 0.8 }; }
      else if (nd > d.range) order(u, { kind: "move", x: u.x, y: u.y - towardsOwnEdge(b, side) * 40 });
      else order(u, { kind: "hold" });
      continue;
    }
    if (u.ranged && s && defending) {
      // shoot from the rampart over the gate; only fall back from enemies already inside
      const inside = foes.find((f) => (insideWalls(b.terrain, f.x, f.y) || f.climbing) && dist(f, u) < 90);
      const spot = { x: s.gate.x + ((mine.filter((x) => x.ranged).indexOf(u) % 3) - 1) * 70, y: s.cy + s.half - 45 };
      if (inside) order(u, { kind: "move", x: u.x, y: s.cy - 40 });
      else if (dist(u, spot) > 25) order(u, { kind: "move", ...spot });
      else order(u, { kind: "hold" });
      continue;
    }
    if (u.ranged) {
      const threat = foes.find((f) => !f.ranged && dist(f, u) < (f.mounted ? 200 : 140));
      if (threat) {
        const away = towardsOwnEdge(b, side);
        order(u, { kind: "move", x: u.x + (u.x - threat.x) * 0.3, y: u.y + away * 70 });
      } else if (nd > d.range * 0.95 && !waitForThem && !(s && defending)) {
        order(u, { kind: "move", x: u.x + (nearest.x - u.x) * 0.25, y: u.y + (nearest.y - u.y) * 0.25 });
      } else order(u, { kind: "hold" });
      continue;
    }
    if (u.mounted) {
      // prefer skirmishers, the broken, or an engaged foe we can hit from behind
      const soft = foes.filter((f) => f.ranged || f.state === "routing").sort((p, q) => dist(u, p) - dist(u, q))[0];
      const engaged = foes.filter((f) => f.foes.length && !F(f).braced).sort((p, q) => dist(u, p) - dist(u, q))[0];
      const target = soft && dist(u, soft) < 400 ? soft : engaged;
      if (s && defending && s.gateHp > 0) { order(u, { kind: "hold" }); continue; }
      if (target) {
        if (target === engaged && aspect(target, u) === "front" && dist(u, target) > 90) {
          const [fx, fy] = facing(target.a);
          order(u, { kind: "move", x: target.x - fx * 80 + fy * 50, y: target.y - fy * 80 - fx * 50 });
        } else order(u, { kind: "attack", target: target.id });
      } else {
        // no opening yet: wait on the wing of our own line, out of reach of their front
        const line = infantry.length ? infantry : mine;
        const xs = line.map((x) => x.x);
        const left = mine.filter((x) => x.mounted && !x.general).indexOf(u) % 2 === 0;
        const wx = left ? Math.max(40, Math.min(...xs) - 110) : Math.min(BALANCE.battle.width - 40, Math.max(...xs) + 110);
        order(u, { kind: "move", x: wx, y: centre(line).y + towardsOwnEdge(b, side) * 30 });
      }
      continue;
    }
    // infantry
    if (s && side === "attacker" && s.gateHp > 0) {
      // half batter the gate, the rest climb once the gate has held a while
      const climbers = b.time > 150 && infantry.indexOf(u) % 2 === 1;
      if (climbers) order(u, { kind: "attack", target: nearest.id });
      else order(u, { kind: "gate" });
      continue;
    }
    if (s && defending) {
      const insider = foes.find((f) => insideWalls(b.terrain, f.x, f.y) || f.climbing);
      if (insider && dist(insider, u) < 260) order(u, { kind: "attack", target: insider.id });
      else if (nd < 70) order(u, { kind: "attack", target: nearest.id });
      else order(u, { kind: "hold" });
      continue;
    }
    if (waitForThem && nd > 140) { order(u, { kind: "hold" }); continue; }
    if (nd > 240) {
      // advance as a line: keep station across the field, close the distance together
      const slow = Math.min(...infantry.map((x) => U[x.type].speed));
      const step = Math.min(nd - 180, slow * 4);
      const toward = Math.sign(enemyMid.y - u.y) || 1;
      order(u, { kind: "move", x: u.x, y: u.y + toward * step });
    } else order(u, { kind: "attack", target: nearest.id });
  }
}

const F = (u) => BALANCE.formations[u.formation];

function order(u, o) {
  const same = u.order.kind === o.kind && u.order.target === o.target && (o.kind !== "move" || Math.hypot(u.order.x - o.x, u.order.y - o.y) < 15);
  if (!same) u.order = o;
}

// +1 if this side's own edge is at the bottom (y grows towards it), -1 if at the top.
function towardsOwnEdge(b, side) {
  return b.top === side ? -1 : 1;
}

function abilities(b, side, mine, roman) {
  const routing = b.units.filter((u) => u.side === side && u.state === "routing").length;
  const engaged = mine.filter((u) => u.foes.length).length;
  if (roman) {
    if (engaged >= 2 && abilityReady(b, side, "hold")) useAbility(b, side, "hold");
    return;
  }
  if (routing >= 2 && abilityReady(b, side, "rally")) useAbility(b, side, "rally");
  else if (engaged >= 2 && abilityReady(b, side, "warcry")) useAbility(b, side, "warcry");
  else if (engaged >= 1 && abilityReady(b, side, "fury")) {
    const best = mine.filter((u) => u.foes.length && !u.general).sort((p, q) => q.men - p.men)[0];
    if (best) useAbility(b, side, "fury", best.id);
  }
}

