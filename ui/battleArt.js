// ui/battleArt.js
// Owns drawing the battlefield: the ground painted once in chunky pixel art (grass, hills, woods,
// rivers and fords, marsh, palisades), then every frame the fallen, every living soldier in depth
// order with walk and strike frames, banners and bars over each band, missiles in flight with
// their shadows, and battle effects. Camera { scale, x, y, flip } maps world to screen; when
// flipped the player's side is still drawn at the bottom. No rules here.

import { BALANCE } from "../config/balance.js";
import { COLS, GROUND, ROWS } from "../simulation/battle/terrain.js";
import { bannerSprite, getSprite } from "./sprites.js";

const B = BALANCE.battle;
const W = B.width, H = B.height, C = B.cell;

// ---------- ground ----------

export function paintGround(terrain) {
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const g = cv.getContext("2d");
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const block = (x, y, col, s = 2) => { g.fillStyle = col; g.fillRect(Math.floor(x / s) * s, Math.floor(y / s) * s, s, s); };
  g.fillStyle = "#6f8a3c"; g.fillRect(0, 0, W, H);
  const greens = ["#67813a", "#78944a", "#5f7a34", "#6a873d", "#7e9a4c"];
  for (let i = 0; i < 26000; i++) block(r() * W, r() * H, greens[Math.floor(r() * greens.length)], 2);
  for (let i = 0; i < 40; i++) { // worn patches
    const x = r() * W, y = r() * H;
    for (let k = 0; k < 60; k++) block(x + (r() - 0.5) * 40, y + (r() - 0.5) * 18, r() < 0.5 ? "#8a8a4a" : "#7d7a42", 2);
  }
  for (let i = 0; i < 500; i++) block(r() * W, r() * H, ["#e8d86a", "#f0ece0", "#d58a9a"][Math.floor(r() * 3)], 1);

  // hills: a softened height field, lit from the upper left, in 4px pixel-art bands
  const hs = smoothHeights(terrain.height);
  const hAt = (x, y) => {
    const gx = Math.max(0, Math.min(COLS - 1.001, x / C - 0.5)), gy = Math.max(0, Math.min(ROWS - 1.001, y / C - 0.5));
    const i = Math.floor(gx), j = Math.floor(gy), fx = gx - i, fy = gy - j;
    const a = hs[j * COLS + i], b2 = hs[j * COLS + i + 1], c = hs[(j + 1) * COLS + i], d = hs[(j + 1) * COLS + i + 1];
    return a * (1 - fx) * (1 - fy) + b2 * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  };
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) {
    const h = hAt(x + 2, y + 2);
    if (h < 0.06) continue;
    const slope = (hAt(x + 6, y + 2) - hAt(x - 2, y + 2)) + (hAt(x + 2, y + 6) - hAt(x + 2, y - 2));
    const light = Math.round(-slope * 60) / 4; // quantised
    g.fillStyle = light > 0 ? `rgba(255,240,190,${Math.min(0.3, light * 0.12 + h * 0.06)})` : `rgba(40,30,10,${Math.min(0.32, -light * 0.12 + h * 0.04)})`;
    g.fillRect(x, y, 4, 4);
    if (Math.floor(h * 6) !== Math.floor(hAt(x + 2, y - 2) * 6)) { g.fillStyle = "rgba(60,50,20,0.22)"; g.fillRect(x, y, 4, 1); }
  }

  // water and marsh
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const t = terrain.ground[j * COLS + i];
    const x = i * C, y = j * C;
    if (t === GROUND.river || t === GROUND.ford) {
      g.fillStyle = t === GROUND.ford ? "#6fa0ac" : "#3d6f8c"; g.fillRect(x - 2, y - 2, C + 4, C + 4);
      for (let k = 0; k < 4; k++) { g.fillStyle = t === GROUND.ford ? "#9cc4c8" : "#5a8eaa"; g.fillRect(x + r() * C, y + r() * C, 4, 1); }
      if (t === GROUND.ford) for (let k = 0; k < 3; k++) { g.fillStyle = "#a89a7a"; g.fillRect(x + r() * C, y + r() * C, 3, 2); }
    }
    if (t === GROUND.marsh) {
      g.fillStyle = "#56693a"; g.fillRect(x, y, C, C);
      for (let k = 0; k < 4; k++) { g.fillStyle = "#3f5a5a"; g.fillRect(x + r() * C, y + r() * C, 4, 2); g.fillStyle = "#a9b37a"; g.fillRect(x + r() * C, y + r() * C, 1, 4); }
    }
  }
  // woods: pixel trees, back to front
  const trees = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    if (terrain.ground[j * COLS + i] !== GROUND.forest) continue;
    for (let t = 0; t < 2; t++) trees.push([i * C + r() * C, j * C + r() * C, 6 + Math.floor(r() * 4)]);
  }
  trees.sort((a, b) => a[1] - b[1]);
  for (const [x, y, s] of trees) tree(g, Math.round(x), Math.round(y), s);

  // palisade
  if (terrain.siege) {
    const s = terrain.siege;
    g.fillStyle = "#857652"; // the beaten earth inside
    g.globalAlpha = 0.35; g.fillRect(s.cx - s.half + C, s.cy - s.half + C, (s.half - C) * 2, (s.half - C) * 2); g.globalAlpha = 1;
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      if (terrain.ground[j * COLS + i] !== GROUND.wall) continue;
      const x = i * C, y = j * C;
      for (let k = 0; k < C; k += 4) {
        g.fillStyle = "#3a2a18"; g.fillRect(x + k + 1, y - 6, 3, C + 4);
        g.fillStyle = "#8a6a3e"; g.fillRect(x + k, y - 7, 3, C + 3);
        g.fillStyle = "#a8865a"; g.fillRect(x + k, y - 7, 1, C + 3);
        g.fillStyle = "#8a6a3e"; g.fillRect(x + k + 1, y - 9, 1, 2);
      }
    }
    g.strokeStyle = "rgba(60,45,25,0.5)"; g.setLineDash([4, 4]); g.beginPath(); g.arc(s.cx, s.cy, B.plazaRadius, 0, 7); g.stroke(); g.setLineDash([]);
  }
  return cv;
}

// Two passes of a box blur so hills read as rounded slopes, not cells.
function smoothHeights(src) {
  let h = Float32Array.from(src);
  for (let pass = 0; pass < 2; pass++) {
    const out = new Float32Array(h.length);
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      let n = 0, s = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const x = i + di, y = j + dj;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        s += h[y * COLS + x]; n++;
      }
      out[j * COLS + i] = s / n;
    }
    h = out;
  }
  return h;
}

function tree(g, x, y, s) {
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x - s + 3, y + 2, s * 2, 3);
  g.fillStyle = "#4a3420"; g.fillRect(x - 1, y - 3, 2, 5);
  const shades = ["#2d4a22", "#3f6a2e", "#4f7d36"];
  for (let k = 0; k < 3; k++) {
    g.fillStyle = shades[k];
    const rr = s - k * 2;
    for (let dy = -rr; dy <= rr; dy += 2) for (let dx = -rr; dx <= rr; dx += 2) if (dx * dx + dy * dy <= rr * rr) g.fillRect(x + dx - k, y - s - 2 + dy - k, 2, 2);
  }
  g.fillStyle = "#6f9a46"; g.fillRect(x - 3, y - s - 5, 2, 2);
}

// ---------- camera ----------

const view = (cam, x, y) => (cam.flip ? [W - x, H - y] : [x, y]);
export function toScreen(cam, x, y) { const [vx, vy] = view(cam, x, y); return [(vx - cam.x) * cam.scale, (vy - cam.y) * cam.scale]; }
export function toWorld(cam, px, py) { const vx = px / cam.scale + cam.x, vy = py / cam.scale + cam.y; return cam.flip ? [W - vx, H - vy] : [vx, vy]; }

// ---------- frame ----------

export function drawFrame(ctx, b, ground, cam, opt) {
  const dpr = opt.dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#1b1f15"; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(dpr * cam.scale, 0, 0, dpr * cam.scale, -cam.x * dpr * cam.scale, -cam.y * dpr * cam.scale);
  ctx.save();
  if (cam.flip) { ctx.translate(W, H); ctx.rotate(Math.PI); }
  ctx.drawImage(ground, 0, 0);
  ctx.restore();
  const V = (x, y) => view(cam, x, y);
  if (b.terrain.siege) drawGate(ctx, b.terrain.siege, V);
  if (opt.zone) {
    const z = opt.zone; const [a0, b0] = V(z.x0, z.y0), [a1, b1] = V(z.x1, z.y1);
    ctx.fillStyle = "rgba(240,230,160,0.1)"; ctx.strokeStyle = "rgba(240,230,160,0.7)"; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    ctx.fillRect(Math.min(a0, a1), Math.min(b0, b1), Math.abs(a1 - a0), Math.abs(b1 - b0)); ctx.strokeRect(Math.min(a0, a1), Math.min(b0, b1), Math.abs(a1 - a0), Math.abs(b1 - b0)); ctx.setLineDash([]);
  }
  if (opt.aim) {
    const [ax, ay] = V(opt.aim.x, opt.aim.y);
    ctx.strokeStyle = "rgba(255,230,140,0.8)"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.arc(ax, ay, opt.aim.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  }
  // spent missiles in the turf
  for (const e of b.effects) {
    if (e.kind !== "stuck") continue;
    const [x, y] = V(e.x, e.y);
    ctx.fillStyle = e.missile === "stone" ? "#8a8478" : "#5a4026";
    if (e.missile === "stone") ctx.fillRect(x, y, 1, 1); else { ctx.fillRect(x, y - 3, 1, 3); ctx.fillStyle = "#ddd"; ctx.fillRect(x, y - 4, 1, 1); }
  }
  // the fallen
  for (const s of b.soldiers) {
    if (s.alive) continue;
    const [x, y] = V(s.x, s.y);
    const spr = getSprite(s.u.type, s.id % 5, 4, (cam.flip ? -s.face : s.face) || 1, s.slot);
    ctx.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height));
  }
  // selection rings under the feet
  for (const s of b.soldiers) {
    if (!s.alive || s.fled || !opt.selected.has(s.u.id)) continue;
    const [x, y] = V(s.x, s.y);
    ctx.fillStyle = "rgba(255,246,176,0.85)"; ctx.fillRect(Math.round(x) - 3, Math.round(y), 7, 1);
  }
  // the living, back to front
  const live = b.soldiers.filter((s) => s.alive && !s.fled && (!s.u.hidden || s.u.side === opt.side));
  const placed = live.map((s) => [s, ...V(s.x, s.y)]).sort((p, q) => p[2] - q[2]);
  for (const [s, x, y] of placed) {
    const frame = b.time - (s.struck ?? -9) < 0.25 ? 3 : s.moving ? 1 + (Math.floor(s.walk) % 2) : 0;
    const spr = getSprite(s.u.type, s.id % 5, frame, (cam.flip ? -s.face : s.face) || 1, s.slot);
    ctx.globalAlpha = s.u.hidden ? 0.55 : s.u.state === "routing" ? 0.85 : 1;
    ctx.drawImage(spr, Math.round(x - spr.width / 2), Math.round(y - spr.height + 1));
  }
  ctx.globalAlpha = 1;
  // banners over each band
  for (const u of b.units) {
    if (u.state === "gone" || (u.hidden && u.side !== opt.side)) continue;
    const carrier = u.soldiers.find((s) => s.alive && !s.fled);
    if (!carrier || u.state === "routing") continue;
    const [x, y] = V(carrier.x, carrier.y);
    const spr = bannerSprite(opt.factions[u.side], u.general);
    ctx.drawImage(spr, Math.round(x - 3), Math.round(y - spr.height - 8));
  }
  drawMissiles(ctx, b, V);
  drawEffects(ctx, b, V);
  if (opt.drag) {
    const [x0, y0] = V(opt.drag[0], opt.drag[1]), [x1, y1] = V(opt.drag[2], opt.drag[3]);
    ctx.strokeStyle = "#fff6c0"; ctx.lineWidth = 3 / cam.scale;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0), k = 14 / cam.scale;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - k * Math.cos(a - 0.4), y1 - k * Math.sin(a - 0.4)); ctx.lineTo(x1 - k * Math.cos(a + 0.4), y1 - k * Math.sin(a + 0.4)); ctx.closePath(); ctx.fillStyle = "#fff6c0"; ctx.fill();
  }
  // plaques: name, strength and nerve, upright and readable at any zoom
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const u of b.units) if (u.state !== "gone" && (!u.hidden || u.side === opt.side)) plaque(ctx, u, cam, opt);
}

const SHORT = { warriors: "Warriors", spearmen: "Spears", slingers: "Slingers", javelinmen: "Javelins", horsemen: "Horse", chariots: "Chariots", champions: "Champions", chieftain: "Chieftain", legionaries: "Legion", auxilia: "Auxilia", archers: "Archers", equites: "Equites", scorpion: "Scorpion", legate: "Legate" };

function plaque(ctx, u, cam, opt) {
  const carrier = u.soldiers.find((s) => s.alive && !s.fled);
  if (!carrier) return;
  const [sx, sy] = toScreen(cam, carrier.x, carrier.y);
  const top = sy - 40 * cam.scale - 8;
  const mine = u.side === opt.side;
  const named = opt.selected.has(u.id) || u.general;
  const w = named ? 56 : 30;
  ctx.globalAlpha = u.state === "routing" ? 0.7 : 0.92;
  if (named) {
    ctx.fillStyle = mine ? "rgba(20,32,52,0.88)" : "rgba(60,16,18,0.88)";
    ctx.fillRect(sx - w / 2, top - 11, w, 17);
    if (opt.selected.has(u.id)) { ctx.strokeStyle = "#fff6b0"; ctx.lineWidth = 1.5; ctx.strokeRect(sx - w / 2, top - 11, w, 17); }
    ctx.fillStyle = "#f4ecd4"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "center";
    ctx.fillText(u.state === "routing" ? "FLEEING" : (u.ai && mine ? "⚙ " : "") + SHORT[u.type], sx, top - 2);
  }
  ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillRect(sx - w / 2, top, w, 5);
  ctx.fillStyle = mine ? "#cfe0ff" : "#ffd0c8"; ctx.fillRect(sx - w / 2 + 1, top + 1, (w - 2) * Math.max(0, u.men / u.start), 1.5);
  const m = Math.max(0, Math.min(1, u.morale / 80));
  ctx.fillStyle = u.state === "routing" ? "#e2735f" : m > 0.45 ? "#8fc27a" : m > 0.2 ? "#e0a83a" : "#e2735f";
  ctx.fillRect(sx - w / 2 + 1, top + 3, (w - 2) * m, 1.5);
  if (u.charge > 0) { ctx.fillStyle = "#ffe08a"; ctx.font = "bold 10px system-ui"; ctx.textAlign = "center"; ctx.fillText("CHARGE!", sx, top - (named ? 14 : 3)); }
  ctx.globalAlpha = 1;
}

function drawGate(ctx, s, V) {
  const [x, y] = V(s.gate.x, s.gate.y);
  if (s.gateHp > 0) {
    ctx.fillStyle = "#5a3e22"; ctx.fillRect(x - 21, y - 14, 42, 22);
    ctx.fillStyle = "#3a2612"; for (let k = -18; k <= 18; k += 6) ctx.fillRect(x + k, y - 14, 2, 22);
    ctx.fillStyle = "#7a5a32"; ctx.fillRect(x - 21, y - 8, 42, 2); ctx.fillRect(x - 21, y + 2, 42, 2);
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x - 21, y + 12, 42, 3);
    ctx.fillStyle = "#e2735f"; ctx.fillRect(x - 21, y + 12, 42 * (s.gateHp / B.gateHp), 3);
  } else {
    ctx.fillStyle = "#3a2a18";
    for (let k = 0; k < 6; k++) ctx.fillRect(x - 20 + k * 7, y - 4 + (k % 2) * 6, 6, 2);
  }
}

function drawMissiles(ctx, b, V) {
  for (const p of b.projectiles) {
    const t = Math.max(0, Math.min(1, (b.time - p.t0) / (p.t1 - p.t0)));
    const gx = p.x0 + (p.x1 - p.x0) * t, gy = p.y0 + (p.y1 - p.y0) * t;
    const d = Math.hypot(p.x1 - p.x0, p.y1 - p.y0);
    const arc = p.kind === "bolt" ? d * 0.03 : p.kind === "javelin" || p.kind === "pilum" ? Math.min(45, d * 0.35) : Math.min(70, d * 0.3);
    const h = 4 * arc * t * (1 - t);
    const [sx, sy] = V(gx, gy);
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(Math.round(sx), Math.round(sy), 2, 1);
    const [tx, ty] = V(p.x1, p.y1), [fx, fy] = V(p.x0, p.y0);
    const vx = tx - fx, vy = (ty - fy) - 4 * arc * (1 - 2 * t);
    const len = Math.hypot(vx, vy) || 1;
    const x = sx, y = sy - h;
    if (p.kind === "stone") { ctx.fillStyle = "#cfc8b8"; ctx.fillRect(Math.round(x), Math.round(y), 2, 2); continue; }
    const L = p.kind === "arrow" ? 5 : p.kind === "bolt" ? 7 : 9;
    ctx.strokeStyle = p.kind === "bolt" ? "#5a4026" : p.kind === "arrow" ? "#e8e0c8" : "#8a6a3e";
    ctx.lineWidth = p.kind === "bolt" ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(x - (vx / len) * L, y - (vy / len) * L); ctx.lineTo(x, y); ctx.stroke();
    ctx.fillStyle = "#d8dde2"; ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
}

function drawEffects(ctx, b, V) {
  for (const e of b.effects) {
    if (e.kind === "stuck") continue;
    const age = b.time - e.t;
    const fade = Math.max(0, 1 - age / 1.5);
    const [x, y] = V(e.x, e.y);
    if (e.kind === "charge" || e.kind === "gate") {
      ctx.fillStyle = `rgba(200,180,140,${0.5 * fade})`;
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + age * 2; ctx.fillRect(Math.round(x + Math.cos(a) * (6 + age * 20)), Math.round(y + Math.sin(a) * (3 + age * 10)), 3, 3); }
    } else {
      ctx.strokeStyle = e.kind === "hold" ? `rgba(255,140,120,${fade})` : `rgba(160,210,255,${fade})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, e.r * Math.min(1, age * 2), e.r * 0.6 * Math.min(1, age * 2), 0, 0, 7); ctx.stroke();
    }
  }
}
