// simulation/battle/ai.js
// Owns the battle AI for a side (or just the bands the player has handed over), run twice a
// second. Infantry advance as a line and close with the nearest foe, throwing javelins or pila as
// they close; shooters shoot and fall back from melee; horse hunt skirmishers and strike engaged
// enemies in the flank or rear; the general stays behind the line and uses abilities. In a siege
// attackers batter the gate (and climb when it holds too long); defenders hold the walls.

import { BALANCE } from "../../config/balance.js";
import { insideWalls } from "./terrain.js";
import { abilityReady, canThrow, fighting, orderUnits, throwAt, useAbility, visibleTo } from "./engine.js";

const B = BALANCE.battle;
const dist = (a, b) => Math.hypot(a.cx - b.cx, a.cy - b.cy);

// wholeSide: the AI commands every band of this side; otherwise only bands marked `ai`.
export function aiThink(b, side, wholeSide) {
  const mine = b.units.filter((u) => u.side === side && fighting(u) && (wholeSide || u.ai));
  if (!mine.length) return;
  const all = b.units.filter((u) => u.side === side && fighting(u));
  const foes = b.units.filter((u) => u.side !== side && fighting(u) && visibleTo(b, side, u));
  if (!foes.length) return;
  const s = b.terrain.siege;
  const centre = (list) => ({ cx: list.reduce((n, u) => n + u.cx, 0) / list.length, cy: list.reduce((n, u) => n + u.cy, 0) / list.length });
  const infantry = all.filter((u) => !u.mounted && !u.ranged);
  const enemyMid = centre(foes);
  const closest = Math.min(...all.map((u) => Math.min(...foes.map((f) => dist(u, f)))));
  const defending = side === "defender";
  const waitForThem = defending && (s || closest > 300) && b.time < 150;
  const back = b.top === side ? -1 : 1;                   // towards our own edge
  const order = (u, o) => {
    const same = u.order.kind === o.kind && u.order.target === o.target && (o.kind !== "move" || Math.hypot(u.order.x - o.x, u.order.y - o.y) < 20);
    if (!same) orderUnits(b, [u.id], o);
  };

  if (wholeSide) abilities(b, side, all);

  for (const u of mine) {
    const nearest = foes.reduce((best, f) => (!best || dist(u, f) < dist(u, best) ? f : best), null);
    const nd = dist(u, nearest);

    // skill shots: throw as the enemy closes
    if (canThrow(b, u) && nd < u.def.throw.range + 30 && nd > 25) {
      const t = nearest.soldiers.find((x) => x.alive && !x.fled);
      if (t) throwAt(b, u.id, nearest.cx + (t.vx || 0) * B.throwFlight, nearest.cy + (t.vy || 0) * B.throwFlight);
    }
    if (u.fighting > u.men * 0.2) continue;              // already at grips

    if (u.general) {
      const line = infantry.length ? centre(infantry) : u;
      const prey = foes.find((f) => (f.ranged || f.state === "routing") && dist(f, u) < 220);
      if (prey && u.men > u.start * 0.5) order(u, { kind: "attack", target: prey.id });
      else order(u, { kind: "move", x: line.cx, y: line.cy + back * 110 });
      continue;
    }
    if (u.artillery) {
      if (s && side === "attacker" && s.gateHp > 0) order(u, { kind: "gate" });
      else if (nd > u.def.range) order(u, { kind: "move", x: u.cx + (nearest.cx - u.cx) * 0.2, y: u.cy + (nearest.cy - u.cy) * 0.2 });
      else order(u, { kind: "attack", target: nearest.id });
      continue;
    }
    if (u.ranged) {
      if (s && defending) {
        // shoot from behind the palisade; fall back only from enemies already inside
        const inside = foes.find((f) => insideWalls(b.terrain, f.cx, f.cy) && dist(f, u) < 100);
        if (inside) order(u, { kind: "move", x: u.cx, y: s.cy - 50 });
        else order(u, { kind: "hold" });
        continue;
      }
      const threat = foes.find((f) => !f.ranged && dist(f, u) < (f.mounted ? 220 : 150));
      if (threat) order(u, { kind: "move", x: u.cx + (u.cx - threat.cx) * 0.3, y: u.cy + back * 90 });
      else if (nd > u.def.range * 0.95 && waitForThem) order(u, { kind: "hold" });
      else order(u, { kind: "attack", target: nearest.id });
      continue;
    }
    if (u.mounted) {
      if (s && defending && s.gateHp > 0) { order(u, { kind: "hold" }); continue; }
      const soft = foes.filter((f) => f.ranged || f.state === "routing").sort((p, q) => dist(u, p) - dist(u, q))[0];
      const engaged = foes.filter((f) => f.fighting > 0 && !f.spear).sort((p, q) => dist(u, p) - dist(u, q))[0];
      const target = soft && dist(u, soft) < 450 ? soft : engaged;
      if (target) {
        // ride round to strike from behind
        const fx = Math.sin(target.a), fy = -Math.cos(target.a);
        const behind = { x: target.cx - fx * 90, y: target.cy - fy * 90 };
        const inFront = ((u.cx - target.cx) * fx + (u.cy - target.cy) * fy) > 0;
        if (target === engaged && inFront && dist(u, target) > 70) order(u, { kind: "move", x: behind.x + (u.cx < target.cx ? -60 : 60), y: behind.y });
        else order(u, { kind: "attack", target: target.id });
      } else {
        const line = infantry.length ? infantry : all;
        const xs = line.map((x) => x.cx);
        const left = all.filter((x) => x.mounted && !x.general).indexOf(u) % 2 === 0;
        const wx = left ? Math.max(60, Math.min(...xs) - 140) : Math.min(B.width - 60, Math.max(...xs) + 140);
        order(u, { kind: "move", x: wx, y: centre(line).cy + back * 20 });
      }
      continue;
    }
    // infantry
    if (s && side === "attacker" && s.gateHp > 0) {
      const climbers = b.time > 120 && infantry.indexOf(u) % 2 === 1;
      order(u, climbers ? { kind: "attack", target: nearest.id } : { kind: "gate" });
      continue;
    }
    if (s && defending) {
      // hold the inside of the gate; go for anyone who gets in
      const insider = foes.find((f) => insideWalls(b.terrain, f.cx, f.cy));
      if (insider && dist(insider, u) < 280) order(u, { kind: "attack", target: insider.id });
      else order(u, { kind: "hold" });
      continue;
    }
    if (waitForThem && nd > 160) { order(u, { kind: "hold" }); continue; }
    if (nd > 260) {
      const toward = Math.sign(enemyMid.cy - u.cy) || 1;
      order(u, { kind: "move", x: u.cx, y: u.cy + toward * Math.min(nd - 200, 120), face: toward > 0 ? Math.PI : 0 });
    } else order(u, { kind: "attack", target: nearest.id });
  }
}

function abilities(b, side, mine) {
  const routing = b.units.filter((u) => u.side === side && u.state === "routing").length;
  const engaged = mine.filter((u) => u.fighting > 0).length;
  if (b.sides[side].faction === "rome") {
    if (engaged >= 2 && abilityReady(b, side, "hold")) useAbility(b, side, "hold");
    return;
  }
  if (routing >= 2 && abilityReady(b, side, "rally")) useAbility(b, side, "rally");
  else if (engaged >= 2 && abilityReady(b, side, "warcry")) useAbility(b, side, "warcry");
  else if (engaged >= 1 && abilityReady(b, side, "fury")) {
    const best = mine.filter((u) => u.fighting > 0 && !u.general).sort((p, q) => q.men - p.men)[0];
    if (best) useAbility(b, side, "fury", best.id);
  }
}
