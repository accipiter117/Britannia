// simulation/battle/terrain.js
// Owns the battlefield ground: a coarse grid of cells (balance.battle.cell) with a ground type
// and a height, generated from the region's terrain and a seed. Sieges add a walled enclosure
// with a gate near the defenders' edge. Lookups by field position.

import { BALANCE } from "../../config/balance.js";
import { nextRandom } from "../random.js";

const B = BALANCE.battle;
export const COLS = B.width / B.cell, ROWS = B.height / B.cell;
export const GROUND = { open: 0, forest: 1, river: 2, ford: 3, wall: 4, gate: 5, marsh: 6 };

const RECIPES = {
  highlands: { hills: 5, hillSize: [90, 170], woods: 3, river: 0.4, marsh: 0 },
  hills:     { hills: 4, hillSize: [80, 150], woods: 3, river: 0.4, marsh: 0 },
  coast:     { hills: 2, hillSize: [70, 120], woods: 2, river: 0.3, marsh: 1 },
  fertile:   { hills: 1, hillSize: [70, 120], woods: 3, river: 0.7, marsh: 1 },
  plains:    { hills: 1, hillSize: [60, 110], woods: 2, river: 0.5, marsh: 0 },
};

export function makeTerrain(kind, seed, siege) {
  const rng = { rng: seed | 0 };
  const r = () => nextRandom(rng);
  const ground = new Uint8Array(COLS * ROWS);
  const height = new Float32Array(COLS * ROWS);
  const recipe = RECIPES[kind] || RECIPES.plains;
  // keep deployment strips mostly clear so armies can form up
  const midBand = (y) => y > B.deployDepth * 0.6 && y < B.height - B.deployDepth * 0.6;

  for (let i = 0; i < recipe.hills; i++) {
    const cx = 80 + r() * (B.width - 160), cy = 100 + r() * (B.height - 200);
    const rad = recipe.hillSize[0] + r() * (recipe.hillSize[1] - recipe.hillSize[0]);
    const h = 0.6 + r() * 0.8;
    forCells((x, y, k) => {
      const d = Math.hypot(x - cx, (y - cy) * 1.3) / rad;
      if (d < 1) height[k] = Math.max(height[k], h * (1 - d * d));
    });
  }
  for (let i = 0; i < recipe.woods; i++) {
    const cx = 60 + r() * (B.width - 120), cy = 140 + r() * (B.height - 280);
    const rad = 50 + r() * 70;
    forCells((x, y, k) => {
      const wob = 1 + 0.25 * Math.sin(x * 0.05 + i) * Math.cos(y * 0.04 + i * 2);
      if (Math.hypot(x - cx, y - cy) < rad * wob) ground[k] = GROUND.forest;
    });
  }
  if (recipe.marsh) {
    const cx = 100 + r() * (B.width - 200), cy = B.height / 2 + (r() - 0.5) * 200;
    forCells((x, y, k) => { if (Math.hypot(x - cx, (y - cy) * 1.6) < 70 && ground[k] === 0) ground[k] = GROUND.marsh; });
  }
  if (!siege && r() < recipe.river) {
    // a river across the middle with two fords
    const y0 = B.height / 2 + (r() - 0.5) * 160, amp = 30 + r() * 50, ph = r() * 6;
    const fords = [150 + r() * 350, 650 + r() * 400];
    forCells((x, y, k) => {
      const ry = y0 + Math.sin(x / 140 + ph) * amp;
      if (Math.abs(y - ry) < 18) ground[k] = fords.some((f) => Math.abs(x - f) < 45) ? GROUND.ford : GROUND.river;
    });
  }
  // open ground in the very back rows so nobody deploys in a river
  forCells((x, y, k) => { if (!midBand(y) && (ground[k] === GROUND.river || ground[k] === GROUND.marsh)) ground[k] = 0; });

  const t = { ground, height, siege: null };
  if (siege) addWalls(t);
  return t;
}

// A square enclosure near the top (defenders' side) with a gate facing the attackers.
function addWalls(t) {
  const cx = B.width / 2, cy = 230, half = 150;
  const gateW = 40;
  forCells((x, y, k) => {
    const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
    const onRing = Math.max(dx, dy) > half - B.cell && Math.max(dx, dy) <= half;
    if (!onRing) { if (Math.max(dx, dy) < half - B.cell) { t.ground[k] = GROUND.open; } return; }
    t.ground[k] = (y > cy && dy > half - B.cell && dx < gateW / 2 + 1) ? GROUND.gate : GROUND.wall;
  });
  t.siege = { cx, cy, half, gate: { x: cx, y: cy + half - B.cell / 2 }, gateHp: B.gateHp };
}

function forCells(fn) {
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) fn(i * B.cell + B.cell / 2, j * B.cell + B.cell / 2, j * COLS + i);
}

export function cellAt(x, y) {
  const i = Math.max(0, Math.min(COLS - 1, Math.floor(x / B.cell)));
  const j = Math.max(0, Math.min(ROWS - 1, Math.floor(y / B.cell)));
  return j * COLS + i;
}

export function groundAt(t, x, y) { return t.ground[cellAt(x, y)]; }
export function heightAt(t, x, y) { return t.height[cellAt(x, y)]; }

// Inside the walls (for sieges).
export function insideWalls(t, x, y) {
  const s = t.siege;
  return !!s && Math.abs(x - s.cx) < s.half - B.cell && Math.abs(y - s.cy) < s.half - B.cell;
}

// Can a unit stand on this point? Walls are climbable by foot, not horse; an intact gate is shut.
export function passable(t, x, y, mounted) {
  if (x < 0 || y < 0 || x > B.width || y > B.height) return false;
  const g = groundAt(t, x, y);
  if (g === GROUND.gate) return t.siege.gateHp <= 0;
  if (g === GROUND.wall) return !mounted;
  if (g === GROUND.river) return true;
  return true;
}

export function speedMult(t, x, y, mounted) {
  const g = groundAt(t, x, y);
  if (g === GROUND.forest) return mounted ? B.forestMountedSpeed : B.forestSpeed;
  if (g === GROUND.river || g === GROUND.marsh) return B.riverSpeed;
  if (g === GROUND.wall) return B.ladderSpeed;
  return 1;
}
