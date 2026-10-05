// ui/battleArt.js
// Owns drawing the battlefield on a canvas: the ground painted once to an offscreen canvas
// (grass, hills shaded by height, woods, rivers, fords, marsh, walls and gate), then each frame
// the units as formed blocks of men in their colours, facing their way, with banners, strength
// and nerve bars, plus volleys, charges and ability effects. World units in, pixels out via a
// camera { scale, x, y, flip }. No rules here.

import { BALANCE } from "../config/balance.js";
import { COLS, GROUND, ROWS } from "../simulation/battle/terrain.js";
import { unitSize } from "../simulation/battle/engine.js";

const B = BALANCE.battle;
const W = B.width, H = B.height, C = B.cell;

// ---------- ground ----------

export function paintGround(terrain) {
  const k = 2; // pixels per world unit in the cached image
  const cv = document.createElement("canvas");
  cv.width = W * k; cv.height = H * k;
  const g = cv.getContext("2d");
  g.scale(k, k);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // base grass with mottling
  g.fillStyle = "#7d8a4e";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${60 + r() * 50},${80 + r() * 40},${30 + r() * 20},0.18)`;
    g.beginPath(); g.ellipse(r() * W, r() * H, 10 + r() * 40, 6 + r() * 20, r() * 3, 0, 7); g.fill();
  }
  // hills: light from the upper left, shaded on a small grid then smoothed up to size
  const shade = document.createElement("canvas");
  shade.width = COLS; shade.height = ROWS;
  const sg = shade.getContext("2d");
  const img = sg.createImageData(COLS, ROWS);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const h = terrain.height[j * COLS + i];
    const left = terrain.height[j * COLS + Math.max(0, i - 1)], up = terrain.height[Math.max(0, j - 1) * COLS + i];
    const light = (h - left) + (h - up);
    const k = (j * COLS + i) * 4;
    if (light >= 0) { img.data[k] = 255; img.data[k + 1] = 240; img.data[k + 2] = 200; img.data[k + 3] = Math.min(110, (light * 3 + h * 0.18) * 255); }
    else { img.data[k] = 30; img.data[k + 1] = 25; img.data[k + 2] = 10; img.data[k + 3] = Math.min(110, (-light * 3 + h * 0.08) * 255); }
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(shade, 0, 0, W, H);
  // hachures down the slopes, like an old survey map
  g.strokeStyle = "rgba(70,55,25,0.35)"; g.lineWidth = 1.2;
  for (let n = 0; n < 2600; n++) {
    const x = r() * W, y = r() * H;
    const i = Math.floor(x / C), j = Math.floor(y / C);
    const h = terrain.height[j * COLS + i];
    if (h < 0.25) continue;
    const dx = terrain.height[j * COLS + Math.min(COLS - 1, i + 1)] - terrain.height[j * COLS + Math.max(0, i - 1)];
    const dy = terrain.height[Math.min(ROWS - 1, j + 1) * COLS + i] - terrain.height[Math.max(0, j - 1) * COLS + i];
    const len = Math.hypot(dx, dy);
    if (len < 0.04) continue;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - (dx / len) * 7, y - (dy / len) * 7); g.stroke();
  }
  // waters and marsh
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const t = terrain.ground[j * COLS + i];
    const x = i * C, y = j * C;
    if (t === GROUND.river) { g.fillStyle = "#3f6e86"; g.beginPath(); g.arc(x + C / 2, y + C / 2, C * 0.85, 0, 7); g.fill(); }
    if (t === GROUND.ford) { g.fillStyle = "#7fa3a8"; g.beginPath(); g.arc(x + C / 2, y + C / 2, C * 0.85, 0, 7); g.fill(); g.fillStyle = "rgba(200,190,150,0.55)"; g.beginPath(); g.ellipse(x + C / 2, y + C / 2, 6, 3, 0.3, 0, 7); g.fill(); }
    if (t === GROUND.marsh) { g.fillStyle = "rgba(70,90,60,0.6)"; g.fillRect(x, y, C, C); g.strokeStyle = "#a9b37a"; g.beginPath(); g.moveTo(x + 5, y + 15); g.lineTo(x + 7, y + 6); g.moveTo(x + 12, y + 16); g.lineTo(x + 14, y + 8); g.stroke(); }
  }
  // woods: clusters of round crowns with shadow
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    if (terrain.ground[j * COLS + i] !== GROUND.forest) continue;
    for (let t = 0; t < 2; t++) {
      const x = i * C + r() * C, y = j * C + r() * C, rad = 7 + r() * 5;
      g.fillStyle = "rgba(0,0,0,0.25)"; g.beginPath(); g.arc(x + 3, y + 4, rad, 0, 7); g.fill();
      g.fillStyle = `rgb(${40 + r() * 20},${70 + r() * 25},${35 + r() * 15})`; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
      g.fillStyle = "rgba(160,190,110,0.25)"; g.beginPath(); g.arc(x - 2, y - 2, rad * 0.5, 0, 7); g.fill();
    }
  }
  // walls and gate
  if (terrain.siege) {
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const t = terrain.ground[j * COLS + i];
      if (t !== GROUND.wall && t !== GROUND.gate) continue;
      const x = i * C, y = j * C;
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(x + 3, y + 4, C, C);
      if (t === GROUND.wall) {
        g.fillStyle = "#8a7a5c"; g.fillRect(x, y, C, C);
        g.fillStyle = "#6e6046"; for (let s = 0; s < 4; s++) g.fillRect(x + s * 5 + 1, y + 1, 3, C - 2);
      }
    }
    const s = terrain.siege;
    g.fillStyle = "rgba(120,100,70,0.25)";
    g.beginPath(); g.arc(s.cx, s.cy, 40, 0, 7); g.fill();
    g.strokeStyle = "rgba(60,45,25,0.5)"; g.setLineDash([4, 4]); g.beginPath(); g.arc(s.cx, s.cy, B.plazaRadius, 0, 7); g.stroke(); g.setLineDash([]);
  }
  return cv;
}

// ---------- camera ----------

export function toScreen(cam, x, y) {
  const wx = cam.flip ? W - x : x, wy = cam.flip ? H - y : y;
  return [(wx - cam.x) * cam.scale, (wy - cam.y) * cam.scale];
}

export function toWorld(cam, px, py) {
  const wx = px / cam.scale + cam.x, wy = py / cam.scale + cam.y;
  return cam.flip ? [W - wx, H - wy] : [wx, wy];
}

// ---------- frame ----------

export function drawFrame(ctx, b, ground, cam, view) {
  const { width, height } = ctx.canvas;
  const dpr = view.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1d2117";
  ctx.fillRect(0, 0, width, height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.save();
  ctx.scale(cam.scale, cam.scale);
  ctx.translate(-cam.x, -cam.y);
  if (cam.flip) { ctx.translate(W, H); ctx.rotate(Math.PI); }
  ctx.drawImage(ground, 0, 0, W, H);
  if (b.terrain.siege) drawGate(ctx, b.terrain.siege);
  if (view.zone) {
    const z = view.zone;
    ctx.fillStyle = "rgba(240,230,160,0.12)"; ctx.strokeStyle = "rgba(240,230,160,0.6)"; ctx.setLineDash([8, 6]);
    ctx.fillRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0); ctx.strokeRect(z.x0, z.y0, z.x1 - z.x0, z.y1 - z.y0); ctx.setLineDash([]);
  }
  // orders of selected units
  for (const u of b.units) {
    if (!view.selected.has(u.id) || u.state === "gone") continue;
    const d = u.order.kind === "move" ? u.order : u.order.kind === "attack" ? b.units.find((x) => x.id === u.order.target) : null;
    if (!d) continue;
    ctx.strokeStyle = u.order.kind === "attack" ? "rgba(255,120,90,0.8)" : "rgba(255,255,230,0.7)";
    ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
    ctx.beginPath(); ctx.moveTo(u.x, u.y); ctx.lineTo(d.x, d.y); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const u of b.units) if (u.state !== "gone" && (!u.hidden || u.side === view.side)) drawUnit(ctx, u, view, cam);
  drawEffects(ctx, b);
  if (view.drag) {
    const [x0, y0, x1, y1] = view.drag;
    ctx.strokeStyle = "#fff6c0"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - 14 * Math.cos(a - 0.4), y1 - 14 * Math.sin(a - 0.4)); ctx.lineTo(x1 - 14 * Math.cos(a + 0.4), y1 - 14 * Math.sin(a + 0.4)); ctx.closePath(); ctx.fillStyle = "#fff6c0"; ctx.fill();
  }
  ctx.restore();
  // bars and labels, upright whatever the camera
  for (const u of b.units) if (u.state !== "gone" && (!u.hidden || u.side === view.side)) drawBars(ctx, u, view, cam);
}

const COLOURS = {
  picts: { body: "#4b72a6", shield: "#2f5d95", rim: "#d9d2b8", skin: "#d8b892", banner: "#3d6fb5" },
  rome: { body: "#a8323a", shield: "#b8323a", rim: "#e8c45a", skin: "#d8b892", banner: "#b8323a" },
  neutral: { body: "#8a7a4e", shield: "#7d6d3e", rim: "#d9d2b8", skin: "#d8b892", banner: "#8d8a6a" },
};

function drawUnit(ctx, u, view, cam) {
  const col = COLOURS[view.factions[u.side]] || COLOURS.neutral;
  const { w, d } = unitSize(u);
  const def = BALANCE.units[u.type];
  ctx.save();
  ctx.translate(u.x, u.y);
  ctx.rotate(u.a);
  ctx.globalAlpha = u.state === "routing" ? 0.45 + 0.2 * Math.sin(performance.now() / 120) : u.hidden ? 0.5 : 1;
  // shadow and ground plate
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.fillRect(-w / 2 + 2, -d / 2 + 3, w, d);
  if (view.selected.has(u.id)) { ctx.strokeStyle = "#fff6b0"; ctx.lineWidth = 3; ctx.strokeRect(-w / 2 - 3, -d / 2 - 3, w + 6, d + 6); }
  // the men: ranks of figures filling the footprint
  const spacing = def.mounted ? 6.5 : 4.2;
  const cols = Math.max(2, Math.floor(w / spacing)), rows = Math.max(1, Math.ceil(u.men / (cols * (def.mounted ? 1 : 1.25))));
  const sy = d / Math.max(1, rows);
  let shown = Math.ceil(u.men / (def.mounted ? 1 : 1.25));
  for (let rr = 0; rr < rows && shown > 0; rr++) {
    for (let cc = 0; cc < cols && shown > 0; cc++, shown--) {
      const x = -w / 2 + (cc + 0.5) * (w / cols) + (rr % 2 ? 1 : 0);
      const y = -d / 2 + (rr + 0.5) * sy;
      if (def.mounted) {
        ctx.fillStyle = "#5a3e26"; ctx.fillRect(x - 1.6, y - 3, 3.2, 6);
        ctx.fillStyle = col.body; ctx.beginPath(); ctx.arc(x, y - 0.5, 1.5, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = col.body; ctx.beginPath(); ctx.arc(x, y, 1.6, 0, 7); ctx.fill();
        if (rr === 0) { ctx.fillStyle = col.shield; ctx.fillRect(x - 1.8, y - 2.6, 3.6, 1.4); }
      }
    }
  }
  // front edge: shields catch the light
  ctx.fillStyle = col.rim;
  ctx.fillRect(-w / 2, -d / 2 - 1, w, 1.2);
  if (u.formation === "shieldwall" || u.formation === "testudo") { ctx.fillStyle = col.shield; ctx.fillRect(-w / 2, -d / 2 - 2.5, w, 2.5); }
  if (u.climbing) { ctx.strokeStyle = "#c9a96a"; ctx.lineWidth = 1; for (let k = -w / 2 + 6; k < w / 2; k += 12) { ctx.beginPath(); ctx.moveTo(k, -d / 2 - 8); ctx.lineTo(k, d / 2); ctx.stroke(); } }
  ctx.restore();
}

function drawBars(ctx, u, view, cam) {
  const [sx, sy] = toScreen(cam, u.x, u.y);
  const mine = u.side === view.side;
  const col = COLOURS[view.factions[u.side]] || COLOURS.neutral;
  const bw = 34;
  const top = sy - Math.max(16, unitSize(u).d * cam.scale * 0.6) - 14;
  ctx.globalAlpha = u.state === "routing" ? 0.6 : 1;
  // banner
  ctx.fillStyle = col.banner; ctx.strokeStyle = mine ? "#f4ecd4" : "#1a1a14"; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.rect(sx - 9, top - 14, 18, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#f4ecd4"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center";
  ctx.fillText(LETTER[u.type] || "?", sx, top - 5);
  if (u.general) { ctx.fillStyle = "#f2cf5b"; ctx.beginPath(); ctx.moveTo(sx - 6, top - 15); ctx.lineTo(sx - 3, top - 20); ctx.lineTo(sx, top - 16); ctx.lineTo(sx + 3, top - 20); ctx.lineTo(sx + 6, top - 15); ctx.fill(); }
  // strength and nerve
  ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(sx - bw / 2, top, bw, 7);
  ctx.fillStyle = "#efe8d0"; ctx.fillRect(sx - bw / 2, top, bw * Math.max(0, u.men / u.start), 3);
  const m = Math.max(0, Math.min(1, u.morale / 80));
  ctx.fillStyle = u.state === "routing" ? "#e2735f" : m > 0.45 ? "#8fc27a" : m > 0.2 ? "#e0a83a" : "#e2735f";
  ctx.fillRect(sx - bw / 2, top + 4, bw * m, 3);
  if (u.state === "routing") { ctx.fillStyle = "#ffb3a3"; ctx.font = "bold 10px system-ui"; ctx.fillText("ROUT", sx, top + 18); }
  else if (u.foes.length && u.charge > 0) { ctx.fillStyle = "#ffe08a"; ctx.font = "bold 10px system-ui"; ctx.fillText("CHARGE", sx, top + 18); }
  ctx.globalAlpha = 1;
}

const LETTER = { spearmen: "SP", warband: "WB", skirmishers: "SK", horsemen: "HR", chariots: "CH", champions: "CP", chieftain: "★", legionaries: "LG", auxilia: "AX", archers: "AR", equites: "EQ", ballista: "BL", legate: "★" };

function drawGate(ctx, s) {
  const { x, y } = s.gate;
  if (s.gateHp > 0) {
    ctx.fillStyle = "#5a3e22"; ctx.fillRect(x - 21, y - 10, 42, 20);
    ctx.strokeStyle = "#2c1c0c"; ctx.lineWidth = 2;
    for (let k = -14; k <= 14; k += 7) { ctx.beginPath(); ctx.moveTo(x + k, y - 10); ctx.lineTo(x + k, y + 10); ctx.stroke(); }
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x - 21, y + 13, 42, 4);
    ctx.fillStyle = "#e2735f"; ctx.fillRect(x - 21, y + 13, 42 * (s.gateHp / B.gateHp), 4);
  } else {
    ctx.fillStyle = "#3a2a18";
    for (let k = 0; k < 5; k++) ctx.fillRect(x - 18 + k * 8, y - 4 + (k % 2) * 6, 7, 3);
  }
}

function drawEffects(ctx, b) {
  for (const e of b.effects) {
    const age = b.time - e.t;
    const fade = Math.max(0, 1 - age / 1.5);
    if (e.kind === "volley" || e.kind === "bolt") {
      ctx.strokeStyle = `rgba(250,240,200,${0.7 * fade})`; ctx.lineWidth = e.kind === "bolt" ? 2.5 : 1;
      const p = Math.min(1, age / 0.5);
      for (let k = 0; k < (e.kind === "bolt" ? 1 : 5); k++) {
        const ox = (k - 2) * 6, oy = ((k * 7) % 5) - 2;
        const mx = (e.x0 + e.x) / 2, my = (e.y0 + e.y) / 2 - 40;
        const tx = e.x0 + (e.x - e.x0) * p, ty = e.y0 + (e.y - e.y0) * p;
        ctx.beginPath(); ctx.moveTo(e.x0 + ox, e.y0 + oy); ctx.quadraticCurveTo(mx + ox, my + oy, tx + ox, ty + oy); ctx.stroke();
      }
    } else if (e.kind === "charge" || e.kind === "gate") {
      ctx.strokeStyle = `rgba(255,220,120,${fade})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(e.x, e.y, 14 + age * 30, 0, 7); ctx.stroke();
    } else {
      ctx.strokeStyle = e.kind === "hold" ? `rgba(255,140,120,${fade})` : `rgba(160,210,255,${fade})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * Math.min(1, age * 2), 0, 7); ctx.stroke();
    }
  }
}
