// ui/battleArt.js
// Owns the tactical battlefield's look on canvas: painted terrain (drawn once to an offscreen
// canvas), the stronghold, and formation blocks drawn as ranks of shields. Light from upper left.

const GROUND = { open: "#76835a", forest: "#56693f", hill: "#8b855c", river: "#41687a", road: "#a8946a" };

// Deterministic jitter so the field looks the same every frame.
const rnd = (x, y, k) => {
  const s = Math.sin(x * 127.1 + y * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

export function paintTerrain(grid, size, dpr) {
  const n = grid.length;
  const c = size / n;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.floor(size * dpr);
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    g.fillStyle = GROUND[grid[y][x]];
    g.fillRect(x * c, y * c, c + 0.6, c + 0.6);
  }
  // grass flecks everywhere on open ground
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const t = grid[y][x];
    const px = x * c, py = y * c;
    if (t === "open") {
      g.strokeStyle = "rgba(60,72,38,0.5)";
      for (let k = 0; k < 4; k++) {
        const fx = px + rnd(x, y, k) * c, fy = py + rnd(x, y, k + 9) * c;
        g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx - 2, fy - 5); g.moveTo(fx, fy); g.lineTo(fx + 2, fy - 5); g.stroke();
      }
    }
    if (t === "hill") {
      g.fillStyle = "rgba(0,0,0,0.18)";
      g.beginPath(); g.ellipse(px + c * 0.55, py + c * 0.78, c * 0.42, c * 0.12, 0, 0, 7); g.fill();
      const grad = g.createLinearGradient(px, py, px + c, py + c);
      grad.addColorStop(0, "#b0a978"); grad.addColorStop(0.5, "#918a60"); grad.addColorStop(1, "#5f5a3d");
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(px + c * 0.08, py + c * 0.78); g.quadraticCurveTo(px + c * 0.5, py - c * 0.05, px + c * 0.92, py + c * 0.78); g.closePath(); g.fill();
      g.strokeStyle = "rgba(220,212,160,0.6)"; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(px + c * 0.25, py + c * 0.55); g.quadraticCurveTo(px + c * 0.4, py + c * 0.25, px + c * 0.55, py + c * 0.25); g.stroke();
      g.lineWidth = 1;
    }
    if (t === "river") {
      g.strokeStyle = "rgba(170,205,215,0.55)";
      for (let k = 0; k < 3; k++) {
        const ry = py + c * (0.25 + k * 0.25);
        g.beginPath(); g.moveTo(px + c * 0.1, ry); g.quadraticCurveTo(px + c * 0.3, ry - 3, px + c * 0.5, ry); g.quadraticCurveTo(px + c * 0.7, ry + 3, px + c * 0.9, ry); g.stroke();
      }
    }
    if (t === "road") {
      g.fillStyle = "rgba(70,56,36,0.45)";
      for (let k = 0; k < 5; k++) g.fillRect(px + rnd(x, y, k) * c * 0.8 + 2, py + rnd(x, y, k + 4) * c * 0.8 + 2, 4, 3);
    }
  }
  // trees last so their crowns overlap neighbouring cells a little
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (grid[y][x] !== "forest") continue;
    for (let k = 0; k < 4; k++) {
      const tx = x * c + (0.2 + rnd(x, y, k) * 0.6) * c, ty = y * c + (0.2 + rnd(x, y, k + 5) * 0.6) * c, r = c * (0.17 + rnd(x, y, k + 11) * 0.08);
      g.fillStyle = "rgba(0,0,0,0.25)";
      g.beginPath(); g.ellipse(tx + 3, ty + r * 0.8, r, r * 0.45, 0, 0, 7); g.fill();
      const grad = g.createRadialGradient(tx - r * 0.35, ty - r * 0.4, r * 0.1, tx, ty, r);
      grad.addColorStop(0, "#7e9a5f"); grad.addColorStop(0.6, "#47603a"); grad.addColorStop(1, "#2a3a22");
      g.fillStyle = grad;
      g.beginPath(); g.arc(tx, ty, r, 0, 7); g.fill();
    }
  }
  // soft vignette
  const v = g.createRadialGradient(size / 2, size / 2, size * 0.35, size / 2, size / 2, size * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = v;
  g.fillRect(0, 0, size, size);
  return canvas;
}

// The stronghold: fortified ground tinted, a palisade ring and a hall at the centre.
export function drawStronghold(ctx, o, c, radius, objectiveRadius) {
  ctx.fillStyle = "rgba(242,209,107,0.08)";
  ctx.fillRect((o.x - radius) * c, (o.y - radius) * c, (radius * 2 + 1) * c, (radius * 2 + 1) * c);
  const cx = o.x * c + c / 2, cy = o.y * c + c / 2, rr = (objectiveRadius + 0.5) * c;
  ctx.strokeStyle = "#3d2c18"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.85, 0, 0, 7); ctx.stroke();
  ctx.strokeStyle = "#a07e50"; ctx.lineWidth = 3; ctx.setLineDash([3, 4]);
  ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.85, 0, 0, 7); ctx.stroke();
  ctx.setLineDash([]); ctx.lineWidth = 1;
  // hall: wall and thatched roof
  ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(cx + 3, cy + c * 0.3, c * 0.5, c * 0.14, 0, 0, 7); ctx.fill();
  ctx.fillStyle = "#7b5d3c"; ctx.fillRect(cx - c * 0.38, cy - c * 0.05, c * 0.76, c * 0.32);
  const roof = ctx.createLinearGradient(cx - c * 0.5, 0, cx + c * 0.5, 0);
  roof.addColorStop(0, "#d0b06c"); roof.addColorStop(1, "#7d6436");
  ctx.fillStyle = roof;
  ctx.beginPath(); ctx.moveTo(cx - c * 0.48, cy); ctx.lineTo(cx - c * 0.22, cy - c * 0.4); ctx.lineTo(cx + c * 0.22, cy - c * 0.4); ctx.lineTo(cx + c * 0.48, cy); ctx.closePath(); ctx.fill();
}

// A formation block: ranks of shields in the side's colour. Legionaries carry tall rectangular
// shields, warriors and levies round ones, skirmishers stand loose with javelins.
export function drawBlock(ctx, u, x, y, c, colour, { mine, selected }) {
  const pad = c * 0.08, w = c - pad * 2;
  ctx.globalAlpha = u.state === "Routing" ? 0.45 : 1;
  // ground shadow and a base plate so the block reads at a glance
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.fillRect(x + pad + 3, y + pad + 4, w, w);
  ctx.fillStyle = shade(colour, -0.35);
  ctx.fillRect(x + pad, y + pad, w, w);
  const strength = Math.max(0.15, u.troops / u.start);
  const rows = u.type === "skirmishers" ? 2 : 3, cols = u.type === "skirmishers" ? 3 : 4;
  const shown = Math.ceil(rows * cols * strength);
  let i = 0;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    if (i++ >= shown) continue;
    const sx = x + pad + (k + 0.5) * (w / cols) + (r % 2 ? w / cols / 4 : 0), sy = y + pad + (r + 0.55) * (w / rows);
    shield(ctx, u.type, sx, sy, (w / cols) * 0.42, colour);
  }
  if (u.dug) {
    // an earth bank with stakes along the block's edge
    ctx.fillStyle = "#5b4527";
    ctx.fillRect(x + pad - 2, y + pad - 5, w + 4, 4);
    ctx.fillStyle = "#8a6a3e";
    for (let k = 0; k < 5; k++) { const sx = x + pad + (k + 0.5) * (w / 5); ctx.beginPath(); ctx.moveTo(sx - 2, y + pad - 2); ctx.lineTo(sx, y + pad - 9); ctx.lineTo(sx + 2, y + pad - 2); ctx.fill(); }
  }
  ctx.lineWidth = selected ? 3 : 1.5;
  ctx.strokeStyle = selected ? "#fff6b0" : mine ? "#f4efe0" : "#1a1a14";
  ctx.strokeRect(x + pad, y + pad, w, w);
  ctx.lineWidth = 1;
  // troops (top) and morale (bottom) bars
  bar(ctx, x + pad, y + pad - 1, w * strength, "#efe8d0");
  const m = Math.max(0, u.morale) / 70;
  bar(ctx, x + pad, y + c - pad - 3, w * Math.min(1, m), u.morale > 30 ? "#8fc27a" : u.morale > 15 ? "#e0a83a" : "#e2735f");
  // type letter in the corner, so levies and warriors can be told apart at phone size
  ctx.font = `bold ${Math.max(9, c * 0.24)}px system-ui`;
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(10,10,6,0.75)";
  ctx.fillRect(x + c - pad - c * 0.27, y + c - pad - c * 0.3, c * 0.27, c * 0.26);
  ctx.fillStyle = "#f4ecd4";
  ctx.fillText({ levies: "L", warriors: "W", skirmishers: "S", legionaries: "R" }[u.type], x + c - pad - c * 0.05, y + c - pad - c * 0.09);
  if (u.state === "Routing") {
    ctx.fillStyle = "#fff"; ctx.font = `bold ${c * 0.45}px system-ui`; ctx.textAlign = "center";
    ctx.fillText("!", x + c / 2, y + c * 0.62);
  }
  if (u.commander) {
    // a small gilt crown marks the commander's block
    const cx = x + pad + c * 0.12, cy = y + pad + c * 0.12, s = c * 0.12;
    ctx.fillStyle = "#f2cf5b"; ctx.strokeStyle = "#3a2a10"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx - s, cy + s * 0.6); ctx.lineTo(cx - s, cy - s * 0.4); ctx.lineTo(cx - s * 0.5, cy); ctx.lineTo(cx, cy - s * 0.7);
    ctx.lineTo(cx + s * 0.5, cy); ctx.lineTo(cx + s, cy - s * 0.4); ctx.lineTo(cx + s, cy + s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (u.state === "Engaging") {
    ctx.strokeStyle = "#fff3c4"; ctx.lineWidth = 2;
    const ex = x + c * 0.84, ey = y + c * 0.18, s = c * 0.1;
    ctx.beginPath(); ctx.moveTo(ex - s, ey - s); ctx.lineTo(ex + s, ey + s); ctx.moveTo(ex + s, ey - s); ctx.lineTo(ex - s, ey + s); ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.globalAlpha = 1;
}

function shield(ctx, type, x, y, r, colour) {
  if (type === "legionaries") {
    ctx.fillStyle = colour; ctx.fillRect(x - r * 0.75, y - r, r * 1.5, r * 2);
    ctx.strokeStyle = "#f2cf5b"; ctx.lineWidth = 1; ctx.strokeRect(x - r * 0.75, y - r, r * 1.5, r * 2);
    ctx.fillStyle = "#f2cf5b"; ctx.beginPath(); ctx.arc(x, y, r * 0.25, 0, 7); ctx.fill();
    return;
  }
  if (type === "skirmishers") {
    ctx.strokeStyle = "#d9cba0"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - r * 0.4, y + r); ctx.lineTo(x + r * 0.8, y - r * 1.2); ctx.stroke();
  }
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  grad.addColorStop(0, shade(colour, 0.35)); grad.addColorStop(1, shade(colour, -0.15));
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, type === "skirmishers" ? r * 0.75 : r, 0, 7); ctx.fill();
  ctx.fillStyle = type === "warriors" ? "#e6d8a8" : "#3a2d1c";
  ctx.beginPath(); ctx.arc(x, y, r * 0.28, 0, 7); ctx.fill();
}

function bar(ctx, x, y, w, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x, y, Math.max(0, w), 3);
}

// Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour.
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt))));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
