// ui/geometry.js
// Owns map shapes: Voronoi district cells from district positions, with wobbly shared borders,
// and the island coastline. Pure maths, no DOM, no game state.

export const MAP_BOUNDS = { x: 0, y: 0, w: 1000, h: 1200 };

// Hand-drawn coastline; jittered so it reads as land, not a polygon.
const COAST = [
  [120, 80], [380, 40], [620, 70], [800, 50], [905, 160], [860, 330], [770, 410], [830, 560],
  [935, 700], [965, 900], [945, 1110], [780, 1175], [600, 1130], [420, 1175], [230, 1090],
  [150, 910], [215, 770], [135, 640], [75, 480], [130, 300], [55, 170],
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
