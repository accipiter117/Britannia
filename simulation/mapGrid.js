// simulation/mapGrid.js
// Owns the shape of Britannia at pixel-art scale: a hand-drawn coastline on a 320 x 500 grid, each
// land pixel given to its nearest tribe, and which tribes border which (worked out from the pixels,
// so the map and the rules always agree). Pure maths, no DOM; used by the campaign and the map view.

export const MAP_W = 320, MAP_H = 500;

// The coast, clockwise from Cape Wrath: Scotland, the east coast and the Wash, Kent, the south coast,
// Cornwall, the Bristol Channel and Wales, then up the west coast past the Solway and the Clyde.
export const COAST = [
  [96, 30], [150, 21], [204, 26], [212, 36], [206, 56], [184, 74], [202, 80], [226, 94], [230, 112], [222, 126],
  [202, 138], [212, 150], [196, 160], [174, 168], [204, 172], [216, 188], [226, 218], [236, 248], [246, 272],
  [228, 284], [252, 294], [276, 316], [288, 334], [278, 354], [266, 368], [242, 376], [270, 384], [278, 398],
  [262, 414], [232, 420], [202, 426], [172, 430], [142, 440], [112, 454], [78, 468], [60, 472], [70, 456],
  [94, 440], [112, 420], [132, 402], [102, 396], [72, 386], [54, 380], [70, 366], [86, 350], [76, 332],
  [68, 316], [90, 306], [96, 294], [114, 298], [120, 280], [116, 256], [106, 242], [126, 233], [100, 228],
  [84, 214], [90, 200], [102, 186], [122, 172], [98, 166], [86, 142], [76, 112], [80, 82], [70, 56],
];

function inside(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// owner[y * MAP_W + x] = index of the region the pixel belongs to, or -1 for sea.
export function buildMapGrid(regions) {
  const owner = new Int16Array(MAP_W * MAP_H).fill(-1);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (!inside(x + 0.5, y + 0.5, COAST)) continue;
    let best = -1, bd = Infinity;
    regions.forEach((r, i) => {
      // a little wobble so borders read as hand-drawn
      const d = (x - r.pos[0]) ** 2 + (y - r.pos[1]) ** 2 + Math.sin(x * 0.21 + i) * Math.cos(y * 0.17 + i * 2) * 40;
      if (d < bd) { bd = d; best = i; }
    });
    owner[y * MAP_W + x] = best;
  }
  return owner;
}

// Regions sharing a border on land.
export function regionLinks(regions, owner) {
  const seen = new Set();
  const links = [];
  for (let y = 0; y < MAP_H - 1; y++) for (let x = 0; x < MAP_W - 1; x++) {
    const a = owner[y * MAP_W + x];
    if (a < 0) continue;
    for (const b of [owner[y * MAP_W + x + 1], owner[(y + 1) * MAP_W + x]]) {
      if (b < 0 || b === a) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push([regions[Math.min(a, b)].id, regions[Math.max(a, b)].id]);
    }
  }
  // a handful of pixels is a corner, not a border
  return links;
}
