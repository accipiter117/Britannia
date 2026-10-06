// simulation/mapGrid.js
// Owns the shape of Britannia for the rules: a 320 x 480 grid laid over the painted map
// (assets/britannia-map.webp, 1024 x 1536, so one cell is 3.2 image pixels). Which cells are land
// comes from data/britannia.json `land` (run lengths, traced from the painting's sea). Each land
// cell goes to its nearest tribe, measured through a gentle noise warp so borders meander like
// rivers and ridges rather than running straight. Which tribes border which is worked out from the
// cells, so the map and the rules always agree. Pure maths, no DOM; used by the campaign and the map.

export const MAP_W = 320, MAP_H = 480;

export function landMask(land) {
  const mask = new Uint8Array(MAP_W * MAP_H);
  let k = 0, v = 0;
  for (const n of land.runs) { if (v) mask.fill(1, k, k + n); k += n; v ^= 1; }
  return mask;
}

// smooth value noise in [-1, 1]
function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) & 0xffff) / 32767.5 - 1;
}
function noise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const warp = (x, y, s) => (noise(x / 26, y / 26, s) * 9 + noise(x / 9, y / 9, s + 7) * 3);

// owner[y * MAP_W + x] = index of the region the cell belongs to, or -1 for sea.
export function buildMapGrid(regions, land) {
  const mask = landMask(land);
  const owner = new Int16Array(MAP_W * MAP_H).fill(-1);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!mask[y * MAP_W + x]) continue;
    const wx = x + warp(x, y, 1), wy = y + warp(x, y, 2);
    let best = -1, bd = Infinity;
    regions.forEach((r, i) => {
      const d = (wx - r.pos[0]) ** 2 + (wy - r.pos[1]) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    owner[y * MAP_W + x] = best;
  }
  return owner;
}

// Regions sharing a real border on land (a few touching cells are a corner, not a border).
export function regionLinks(regions, owner) {
  const count = new Map();
  for (let y = 0; y < MAP_H - 1; y++) for (let x = 0; x < MAP_W - 1; x++) {
    const a = owner[y * MAP_W + x];
    if (a < 0) continue;
    for (const b of [owner[y * MAP_W + x + 1], owner[(y + 1) * MAP_W + x]]) {
      if (b < 0 || b === a) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      count.set(key, (count.get(key) || 0) + 1);
    }
  }
  return [...count].filter(([, n]) => n >= 4).map(([key]) => key.split("|").map((i) => regions[+i].id));
}
