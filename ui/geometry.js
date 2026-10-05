// ui/geometry.js
// Owns map shapes: Voronoi region cells from region positions, with wobbly shared borders,
// and the coastline of northern Britannia. Pure maths, no DOM, no game state.

export const MAP_BOUNDS = { x: 0, y: 0, w: 1000, h: 1260 };

// Northern Britannia, hand-drawn: the Highlands and Moray Firth at the top, the Tay and Forth
// cutting in from the east, the Clyde and Solway from the west, Roman England at the bottom.
const COAST = [
  [250, 70], [420, 45], [600, 60], [660, 120], [600, 200], [520, 240], [620, 270], [760, 300],
  [800, 390], [790, 480], [730, 560], [690, 600], [640, 612], [700, 640], [690, 700], [600, 722],
  [690, 742], [740, 800], [720, 880], [700, 960], [740, 1040], [760, 1120], [720, 1200], [560, 1235],
  [420, 1225], [300, 1205], [320, 1120], [270, 1050], [330, 1012], [230, 992], [200, 940], [180, 860],
  [250, 820], [300, 790], [250, 742], [300, 700], [220, 660], [170, 600], [140, 520], [190, 470],
  [140, 400], [180, 330], [150, 250], [190, 160],
];

export function coastline() {
  return wobble(COAST, 28);
}

// One polygon per site: the region of the box closer to that site than any other.
export function voronoiCells(sites, b = MAP_BOUNDS) {
  return sites.map((s, i) => {
    let poly = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
    sites.forEach((t, j) => {
      if (i === j) return;
      const mx = (s[0] + t[0]) / 2, my = (s[1] + t[1]) / 2;
      const nx = t[0] - s[0], ny = t[1] - s[1];
      poly = clip(poly, (p) => (p[0] - mx) * nx + (p[1] - my) * ny);
    });
    return wobble(poly, 22);
  });
}

// Sutherland-Hodgman against one half-plane: keeps points where f(p) <= 0.
function clip(poly, f) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

// Subdivides each edge with deterministic noise. Seeded by the edge's endpoints in a canonical
// order, so two neighbouring cells draw their shared border identically.
function wobble(poly, amp) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const flip = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
    const [p, q] = flip ? [b, a] : [a, b];
    let pts = [p, q];
    let k = amp;
    for (let depth = 0; depth < 3; depth++) {
      const next = [pts[0]];
      for (let j = 0; j < pts.length - 1; j++) {
        const u = pts[j], v = pts[j + 1];
        const len = Math.hypot(v[0] - u[0], v[1] - u[1]) || 1;
        const off = (hash(u[0] + v[0] * 7.1, u[1] + v[1] * 3.3) - 0.5) * k * Math.min(1, len / 120);
        next.push([(u[0] + v[0]) / 2 - ((v[1] - u[1]) / len) * off, (u[1] + v[1]) / 2 + ((v[0] - u[0]) / len) * off], v);
      }
      pts = next;
      k /= 2;
    }
    if (flip) pts.reverse();
    out.push(...pts.slice(0, -1));
  }
  return out;
}

function hash(x, y) {
  const s = Math.sin(Math.round(x * 10) * 12.9898 + Math.round(y * 10) * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function pathFrom(poly) {
  return "M" + poly.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L") + "Z";
}
