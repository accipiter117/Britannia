// ui/mapView.js
// Owns the campaign map on a canvas: the painted map of Britannia (assets/britannia-map.webp) as the
// base, a soft wash in each owner's colour with ink-dark borders over it (snow-pale in winter), then
// settlements, tribe names, highlights and badges for where a host can march, Rome's threats, and
// the hosts themselves as little pixel war bands with their banners.
// Drag to pan, pinch or wheel to zoom, tap a host or a region. No game rules here.

import { BALANCE } from "../config/balance.js";
import { buildMapGrid, MAP_H, MAP_W } from "../simulation/mapGrid.js";
import { FACTIONS, seasonName } from "../simulation/state.js";
import { bannerSprite, getSprite } from "./sprites.js";

const OWNER_TINT = { celts: [61, 111, 181], rome: [184, 50, 58], free: null };
const SEA = "#004372";

export function createMap(canvas, { regions: regionsData, land }, { onRegion, onArmy }) {
  const ctx = canvas.getContext("2d");
  const grid = buildMapGrid(regionsData, land);
  const ids = regionsData.map((r) => r.id);
  const index = Object.fromEntries(ids.map((id, i) => [id, i]));
  const masks = ids.map((_, i) => maskFor(grid, i));
  const edges = ids.map((_, i) => maskFor(grid, i, true));
  let state = null, view = {}, base = null, baseKey = "";
  const cam = { scale: 2, x: 0, y: 0, user: false };
  let tokens = [];

  // ---------- painting the island ----------
  // The painted map is the base; over it a soft wash in each owner's colour and the borders,
  // both built at cell scale and drawn smoothed so they sit on the painting like ink.

  const art = new Image();
  art.src = land.image;
  art.onload = () => draw();

  function paintOverlay(s) {
    const c = document.createElement("canvas");
    c.width = MAP_W; c.height = MAP_H;
    const g = c.getContext("2d");
    const img = g.createImageData(MAP_W, MAP_H);
    const winter = seasonName(s) === "Winter";
    for (let y = 1; y < MAP_H - 1; y++) for (let x = 1; x < MAP_W - 1; x++) {
      const k = y * MAP_W + x, o = k * 4;
      const reg = grid[k];
      if (reg < 0) continue;
      const R = s.regions[ids[reg]];
      const tint = OWNER_TINT[R.owner];
      let col = null, a = 0;
      if (tint) { col = tint; a = 0.34; }
      if (winter) { col = col ? col.map((v) => Math.round(v * 0.5 + 235 * 0.5)) : [235, 240, 245]; a = Math.max(a, 0.3); }
      const nb = [grid[k + 1], grid[k - 1], grid[k + MAP_W], grid[k - MAP_W]];
      if (nb.some((v) => v >= 0 && v !== reg)) { col = [34, 26, 16]; a = 0.75; }
      else if (tint && [grid[k + 2], grid[k - 2], grid[k + 2 * MAP_W], grid[k - 2 * MAP_W]].some((v) => v >= 0 && v !== reg)) { col = tint; a = 0.7; }
      if (!col) continue;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = Math.round(a * 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------- camera ----------

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = w * dpr; canvas.height = h * dpr;
    cam.dpr = dpr;
    cam.min = Math.min(w / MAP_W, h / MAP_H) * 0.95;
    if (!cam.user) { cam.scale = cam.min; cam.x = (MAP_W - w / cam.scale) / 2; cam.y = (MAP_H - h / cam.scale) / 2; }
    clamp();
    draw();
  }
  function clamp() {
    const vw = canvas.clientWidth / cam.scale, vh = canvas.clientHeight / cam.scale;
    // a generous margin, so a coastal region can still be brought clear of a panel
    const mx = vw * 0.4, my = vh * 0.4;
    cam.x = vw >= MAP_W ? (MAP_W - vw) / 2 : Math.max(-mx, Math.min(MAP_W - vw + mx, cam.x));
    cam.y = vh >= MAP_H ? (MAP_H - vh) / 2 : Math.max(-my, Math.min(MAP_H - vh + my, cam.y));
  }
  const toScreen = (x, y) => [(x - cam.x) * cam.scale, (y - cam.y) * cam.scale];
  const toMap = (px2, py) => [px2 / cam.scale + cam.x, py / cam.scale + cam.y];

  // ---------- drawing ----------

  function draw() {
    if (!state) return;
    const key = Object.values(state.regions).map((r) => r.owner[0]).join("") + seasonName(state);
    if (key !== baseKey) { base = paintOverlay(state); baseKey = key; }
    const W = canvas.width, H = canvas.height, s = cam.scale * cam.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = SEA; ctx.fillRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    if (art.complete && art.naturalWidth) ctx.drawImage(art, 0, 0, MAP_W, MAP_H);
    ctx.drawImage(base, 0, 0);
    // highlights: a faint wash and a bright pulsing edge
    const t = performance.now() / 1000;
    const glow = 0.65 + 0.35 * Math.sin(t * 5);
    for (const id of view.threats || []) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 3);
      ctx.drawImage(tinted(edges[index[id]], "rgba(255,60,40,1)"), 0, 0);
    }
    for (const [list, col] of [[view.reach || [], "rgba(255,236,140,1)"], [view.attack || [], "rgba(255,90,70,1)"], [view.focus ? [view.focus] : [], "rgba(255,255,235,1)"]]) {
      for (const id of list) {
        ctx.globalAlpha = 0.14;
        ctx.drawImage(tinted(masks[index[id]], col), 0, 0);
        ctx.globalAlpha = glow;
        ctx.drawImage(tinted(edges[index[id]], col), 0, 0);
      }
    }
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    // settlements
    for (const r of Object.values(state.regions)) settlement(ctx, r);
    // names and hosts in screen space, so text stays crisp
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.textAlign = "center";
    const badgeAt = [];
    for (const r of Object.values(state.regions)) {
      const [x, y] = toScreen(r.pos[0], r.pos[1] + 9);
      const fs = Math.max(9, Math.min(15, cam.scale * 4.2));
      ctx.font = `bold ${fs}px Georgia, serif`;
      ctx.lineWidth = 3; ctx.strokeStyle = "rgba(20,16,10,0.85)"; ctx.strokeText(r.name, x, y);
      ctx.fillStyle = r.owner === "celts" ? "#dbe8ff" : r.owner === "rome" ? "#ffd6cf" : "#f3ead2";
      ctx.fillText(r.name, x, y);
      const notes = [];
      if (view.badges?.[r.id]) badgeAt.push([r.id, y + fs * 0.4]);
      if ((view.threats || []).includes(r.id)) notes.push(["Rome may strike", "#ff8a78"]);
      if (r.unrest) notes.push(["unrest", "#ffb070"]);
      notes.forEach(([text, col], i) => {
        ctx.font = `bold ${fs - 2}px system-ui`;
        ctx.strokeText(text, x, y + fs * (i + 1)); ctx.fillStyle = col; ctx.fillText(text, x, y + fs * (i + 1));
      });
      if (badgeAt.length && badgeAt[badgeAt.length - 1][0] === r.id) badgeAt[badgeAt.length - 1][1] += notes.length * fs;
    }
    // what a selected host would meet: March, or the odds of a fight
    // (drawn under the tribe's name, clear of the hosts above it)
    for (const [rid, by] of badgeAt) {
      const b = view.badges[rid];
      const [x] = toScreen(state.regions[rid].pos[0], 0);
      ctx.font = "bold 11px system-ui";
      const w = ctx.measureText(b.text).width + 12;
      ctx.fillStyle = b.tone === "good" ? "#2f6b34" : b.tone === "even" ? "#8a6d1e" : b.tone === "bad" ? "#8e2a22" : "rgba(30,34,24,0.92)";
      ctx.beginPath(); ctx.roundRect(x - w / 2, by, w, 16, 8); ctx.fill();
      ctx.strokeStyle = b.tone ? "rgba(255,255,255,0.5)" : "#e6c25a"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "#fff8e6"; ctx.fillText(b.text, x, by + 12);
    }
    tokens = [];
    const by = {};
    for (const a of state.armies) (by[a.region] ||= []).push(a);
    for (const [rid, list] of Object.entries(by)) {
      const r = state.regions[rid];
      list.forEach((a, i) => host(a, r, i, list.length));
    }
  }

  function host(a, r, i, n) {
    const k = Math.max(1, Math.round(cam.scale * 0.75));      // sprite zoom
    const [cx, cy] = toScreen(r.pos[0] + (i - (n - 1) / 2) * 14, r.pos[1] - 2);
    const types = a.faction === "rome" ? ["legionaries", "legionaries", "auxilia"] : ["warriors", "spearmen", "warriors"];
    const general = a.units.find((u) => BALANCE.units[u.type].tags?.includes("general"));
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.scale(k, k);
    if (a.id === view.selected) { ctx.fillStyle = "rgba(255,246,176,0.9)"; ctx.fillRect(-12, 0, 24, 2); }
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.fillRect(-11, -1, 22, 3);
    types.forEach((t, j) => { const spr = getSprite(t, (j + a.id.length) % 5, 0, a.faction === "rome" ? -1 : 1); ctx.drawImage(spr, -14 + j * 6, -spr.height + (j % 2)); });
    if (general) { const spr = getSprite(general.type, 1, 0, a.faction === "rome" ? -1 : 1); ctx.drawImage(spr, 2, -spr.height - 1); }
    const flag = bannerSprite(a.faction, true);
    ctx.drawImage(flag, -16, -flag.height - 6);
    ctx.restore();
    // plaque: units, and wheat for your hosts
    const w = a.faction === "celts" ? 46 : 30;
    const py = cy + 4;
    ctx.fillStyle = a.faction === "celts" ? "rgba(18,30,50,0.9)" : a.faction === "rome" ? "rgba(60,14,16,0.9)" : "rgba(50,44,26,0.9)";
    ctx.fillRect(cx - w / 2, py, w, 13);
    if (a.id === view.selected) { ctx.strokeStyle = "#fff6b0"; ctx.lineWidth = 1.5; ctx.strokeRect(cx - w / 2, py, w, 13); }
    if (a.faction === "celts" && a.moves > 0) { ctx.fillStyle = "#e6c25a"; ctx.fillRect(cx - w / 2, py, 3, 13); }
    ctx.fillStyle = "#f4ecd4"; ctx.font = "bold 9px system-ui"; ctx.textAlign = "left";
    ctx.fillText(`${a.units.length}`, cx - w / 2 + 6, py + 10);
    if (a.faction === "celts") {
      const cap = a.units.length * BALANCE.food.carry;
      // a little sheaf of wheat
      ctx.fillStyle = "#e6c25a"; ctx.fillRect(cx - w / 2 + 25, py + 3, 1, 8); ctx.fillRect(cx - w / 2 + 23, py + 3, 1, 4); ctx.fillRect(cx - w / 2 + 27, py + 3, 1, 4);
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(cx + 9, py + 5, 12, 4);
      ctx.fillStyle = a.food / cap > 0.35 ? "#e6c25a" : "#e2735f"; ctx.fillRect(cx + 9, py + 5, 12 * Math.max(0, Math.min(1, a.food / cap)), 4);
    }
    ctx.textAlign = "center";
    tokens.push({ id: a.id, x0: cx - 18, x1: cx + 18, y0: cy - 30, y1: py + 13 });
  }

  // ---------- input ----------

  const pointers = new Map();
  let down = null, pinch = null;
  const local = (e) => { const b = canvas.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  canvas.addEventListener("pointerdown", (e) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    if (pointers.size === 2) { const [p, q] = [...pointers.values()]; pinch = Math.hypot(p[0] - q[0], p[1] - q[1]); down = null; return; }
    const [x, y] = local(e);
    down = { x, y, cx: cam.x, cy: cam.y, moved: false };
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, local(e));
    if (pinch && pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]);
      zoomAt(d / pinch, (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
      pinch = d;
      return;
    }
    if (!down) return;
    const [x, y] = local(e);
    if (Math.hypot(x - down.x, y - down.y) > 6) down.moved = true;
    if (down.moved) { cam.user = true; cam.x = down.cx - (x - down.x) / cam.scale; cam.y = down.cy - (y - down.y) / cam.scale; clamp(); draw(); }
  });
  const up = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!down || down.moved) { down = null; return; }
    const [x, y] = [down.x, down.y];
    down = null;
    const tok = tokens.slice().reverse().find((t) => x >= t.x0 && x <= t.x1 && y >= t.y0 && y <= t.y1);
    if (tok) return onArmy(tok.id);
    const [mx, my] = toMap(x, y).map(Math.floor);
    if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return;
    const reg = grid[my * MAP_W + mx];
    if (reg >= 0) onRegion(ids[reg]);
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); const [x, y] = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 0.87, x, y); }, { passive: false });

  function zoomAt(f, px2, py) {
    cam.user = true;
    const [mx, my] = toMap(px2, py);
    cam.scale = Math.max(cam.min, Math.min(cam.min * 5, cam.scale * f));
    cam.x = mx - px2 / cam.scale; cam.y = my - py / cam.scale;
    clamp(); draw();
  }

  new ResizeObserver(fit).observe(canvas);
  let anim = 0;
  const loop = () => { if (view.reach?.length || view.attack?.length || view.threats?.length) draw(); anim = requestAnimationFrame(loop); };
  anim = requestAnimationFrame(loop);

  return {
    render(s, v = {}) { state = s; view = v; if (!cam.min) fit(); else draw(); },
    // `cover` = { right, bottom } pixels hidden behind a panel, so the region lands in the open part
    centreOn(id, cover = {}) {
      const r = state.regions[id];
      if (!cam.min) fit();
      cam.user = true;
      cam.scale = Math.max(cam.scale, cam.min * 2);
      const w = canvas.clientWidth - (cover.right || 0), h = canvas.clientHeight - (cover.bottom || 0);
      cam.x = r.pos[0] - w / cam.scale / 2; cam.y = r.pos[1] - h / cam.scale / 2;
      clamp(); draw();
    },
    // where a region sits on screen (CSS pixels within the canvas); used by browser tests
    screenOf(id) { const r = state.regions[id]; return toScreen(r.pos[0], r.pos[1] + 4); },
    zoom(f) { zoomAt(f, canvas.clientWidth / 2, canvas.clientHeight / 2); },
    stop() { cancelAnimationFrame(anim); },
  };
}

// ---------- helpers ----------

function px(g, x, y, col, w = 1, h = 1) { g.fillStyle = col; g.fillRect(x, y, w, h); }

// A region's pixels, or (edge) just the two-pixel band along its border.
function maskFor(grid, i, edge = false) {
  const c = document.createElement("canvas");
  c.width = MAP_W; c.height = MAP_H;
  const g = c.getContext("2d");
  const img = g.createImageData(MAP_W, MAP_H);
  const other = (k) => grid[k] !== i;
  for (let k = 0; k < grid.length; k++) {
    if (grid[k] !== i) continue;
    if (edge && !(other(k - 1) || other(k + 1) || other(k - MAP_W) || other(k + MAP_W) || other(k - 2) || other(k + 2) || other(k - 2 * MAP_W) || other(k + 2 * MAP_W))) continue;
    img.data[k * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

const tintCache = new Map();
function tinted(mask, col) {
  const key = mask;
  let m = tintCache.get(key);
  if (!m) tintCache.set(key, (m = new Map()));
  let c = m.get(col);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = mask.width; c.height = mask.height;
  const g = c.getContext("2d");
  g.drawImage(mask, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  m.set(col, c);
  return c;
}

// Little pixel settlements: huts, a ringed hill fort, a red-roofed Roman town, a square fort.
function settlement(ctx, r) {
  const [x, y] = r.pos.map(Math.round);
  const hut = (hx, hy) => { px(ctx, hx - 2, hy, "#6a4a2a", 5, 2); px(ctx, hx - 1, hy - 2, "#c9a96a", 3, 2); px(ctx, hx, hy - 3, "#c9a96a"); };
  if (r.settlement === "town") {
    px(ctx, x - 6, y - 5, "#b6a787", 12, 8); px(ctx, x - 6, y - 5, "#7a6a4a", 12, 1); px(ctx, x - 6, y + 2, "#7a6a4a", 12, 1);
    px(ctx, x - 4, y - 3, "#a8462e", 3, 2); px(ctx, x + 1, y - 3, "#a8462e", 3, 2); px(ctx, x - 2, y, "#a8462e", 4, 2);
  } else if (r.settlement === "fort" || (r.owner === "rome" && r.walls)) {
    px(ctx, x - 5, y - 4, "#8a6a3e", 10, 1); px(ctx, x - 5, y + 3, "#8a6a3e", 10, 1); px(ctx, x - 5, y - 4, "#8a6a3e", 1, 8); px(ctx, x + 4, y - 4, "#8a6a3e", 1, 8);
    px(ctx, x - 2, y - 1, "#a8462e", 4, 2);
  } else if (r.settlement === "oppidum") {
    ctx.fillStyle = "#6e5e3a";
    for (let a = 0; a < 6.28; a += 0.35) ctx.fillRect(Math.round(x + Math.cos(a) * 7), Math.round(y - 1 + Math.sin(a) * 4), 1, 1);
    hut(x - 2, y - 1); hut(x + 3, y);
  } else {
    hut(x - 3, y); hut(x + 2, y - 1);
  }
  if (r.fortAt) { px(ctx, x + 6, y - 6, "#e2735f", 2, 2); }
}

export { FACTIONS };
