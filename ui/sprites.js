// ui/sprites.js
// Owns the pixel-art soldiers, drawn in code into small offscreen canvases once and reused every
// frame: Britons in plaid and woad with oval shields, legionaries in segmented armour behind red
// scuta, auxilia, archers, horsemen, chariots, the scorpion, chieftains and legates, each with walk,
// strike and fallen frames, facing left or right. getSprite() is the only entry point.

const cache = new Map();

// ---------- palettes ----------

const SKIN = ["#e2b791", "#d9a97e", "#ebc6a0"];
const HAIR = ["#b4532a", "#d6b25a", "#6a4426", "#2c241c", "#c46a2e"];
const PLAID = [["#5d7f3a", "#3f5a28"], ["#8e3b2a", "#5e2418"], ["#3c5e8f", "#28406a"], ["#9c7a35", "#6a5222"]];
const CELT_SHIELD = [["#b5432f", "#e8d8a8"], ["#3a6aa8", "#e8d8a8"], ["#d0a84a", "#6a3a1a"], ["#4c7a3a", "#e8d8a8"]];
const HORSE = ["#6b4a2e", "#3a2a20", "#8a6a4a", "#b8b0a0", "#5a3a26"];
const WOAD = "#3f63b0";
const IRON = "#a7adb4", DARK_IRON = "#6d737a", WOOD = "#7a5a32", BRONZE = "#c09a48", GOLD = "#e6c25a";
const R_RED = "#a82f35", R_SHIELD = "#b3262d";

// Every sprite is drawn into a canvas `w` x `h` with its feet at (w/2, h-1), facing right.
function make(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  const px = (x, y, col, ww = 1, hh = 1) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  draw(px, g);
  return c;
}

function flipped(src) {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const g = c.getContext("2d");
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0);
  return c;
}

function fallen(src) {
  // lying on the ground: rotate the standing figure, darken a little, a spot of blood
  const c = document.createElement("canvas");
  c.width = src.height + 2; c.height = src.width;
  const g = c.getContext("2d");
  g.translate(c.width / 2, c.height / 2); g.rotate(-Math.PI / 2); g.globalAlpha = 0.85;
  g.drawImage(src, -src.width / 2, -src.height / 2);
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 0.5;
  g.fillStyle = "#6e1a14"; g.fillRect(c.width / 2 - 1, c.height - 3, 3, 1); g.fillRect(c.width / 2 + 2, c.height - 2, 2, 1);
  return c;
}

// ---------- the parts ----------

function legs(px, frame, x0, col, bootCol) {
  // x0: left of the body; frames: 0 stand, 1 and 2 walking, 3 strike (lunge)
  const L = frame === 1 ? [x0 - 1, x0 + 3] : frame === 2 ? [x0 + 1, x0 + 2] : frame === 3 ? [x0 - 1, x0 + 4] : [x0, x0 + 3];
  for (const lx of L) { px(lx, 10, col, 1, 3); px(lx, 13, bootCol); }
}

function head(px, x, y, skin, hair, opts = {}) {
  px(x, y, skin, 3, 3);
  if (opts.helmet) { px(x - 1, y - 1, opts.helmet, 5, 2); px(x - 1, y + 1, opts.helmet, 1, 2); if (opts.crest) px(x, y - 3, opts.crest, 3, 2); if (opts.horns) { px(x - 2, y - 3, opts.horns); px(x + 4, y - 3, opts.horns); } }
  else if (hair) { px(x - 1, y - 1, hair, 4, 2); px(x - 1, y + 1, hair, 1, 3); if (opts.long) px(x - 2, y + 2, hair, 1, 3); }
  px(x + 2, y + 1, "#2a1a10"); // eye
  if (opts.woad) px(x + 1, y + 2, WOAD, 2, 1);
}

// ---------- foot soldiers ----------

function footSprite(kind, v, frame) {
  return make(16, 15, (px) => {
    const skin = SKIN[v % SKIN.length];
    const strike = frame === 3;
    if (kind === "legionaries" || kind === "auxilia") {
      const roman = kind === "legionaries";
      legs(px, frame, 6, skin, "#4a3420");
      px(6, 6, R_RED, 4, 4); // tunic
      if (roman) { px(6, 5, IRON, 4, 4); px(6, 6, DARK_IRON, 4, 1); px(6, 8, DARK_IRON, 4, 1); }
      else { px(6, 5, "#8e949a", 4, 5); px(6, 9, "#c9b58a", 4, 1); }
      head(px, 6, 1, skin, null, { helmet: roman ? "#c2b89a" : "#8e949a", crest: roman && v === 0 ? "#b81d2a" : null });
      // sword arm and gladius
      if (strike) { px(10, 6, skin, 2, 1); px(12, 5, IRON, 3, 1); } else { px(5, 6, skin, 1, 3); px(4, 8, IRON, 1, 3); }
      // shield in front
      if (roman) { px(10, 3, R_SHIELD, 3, 9); px(10, 3, GOLD, 3, 1); px(10, 11, GOLD, 3, 1); px(11, 7, GOLD); }
      else { px(10, 4, "#2f5a8f", 3, 7); px(9, 5, "#2f5a8f", 1, 5); px(11, 7, "#e2bf55"); }
      return;
    }
    if (kind === "archers") {
      legs(px, frame, 6, skin, "#4a3420");
      px(6, 5, "#c4a86a", 4, 5); px(6, 9, "#8a6a3a", 4, 1);
      head(px, 6, 1, skin, null, { helmet: "#8e949a", crest: "#8e949a" });
      // bow
      px(11, 2, WOOD, 1, 1); px(12, 3, WOOD, 1, 6); px(11, 9, WOOD, 1, 1); px(11, 3, "#ddd", 1, 6);
      px(10, 6, skin, 1, 1);
      return;
    }
    if (kind === "scorpion-crew") {
      legs(px, frame, 6, skin, "#4a3420");
      px(6, 5, R_RED, 4, 5); head(px, 6, 1, skin, null, { helmet: "#8e949a" });
      return;
    }
    // ----- the Britons -----
    const [t1, t2] = PLAID[v % PLAID.length];
    const hair = HAIR[v % HAIR.length];
    const [sh, boss] = CELT_SHIELD[(v + 1) % CELT_SHIELD.length];
    const champ = kind === "champions";
    legs(px, frame, 6, "#5d4a30", "#3a2a1a");
    // tunic with checks
    px(6, 5, t1, 4, 5); px(7, 6, t2); px(9, 6, t2); px(6, 8, t2); px(8, 8, t2);
    if (champ) { px(6, 5, IRON, 4, 4); px(6, 6, DARK_IRON, 4, 1); px(4, 4, "#9e2a2a", 2, 6); }
    if (kind === "warriors" && v % 3 === 0) { px(6, 5, skin, 4, 4); px(7, 6, WOAD, 2, 1); px(8, 8, WOAD, 1, 1); } // bare-chested, painted
    head(px, 6, 1, skin, hair, { long: v % 2 === 0, woad: kind !== "champions", helmet: champ && v % 2 ? BRONZE : null, horns: champ && v % 2 ? BRONZE : null });
    px(6, 5, GOLD, 3, 1); // torc
    if (kind === "slingers") {
      px(5, 5, skin, 1, 3);
      if (strike) { px(10, 2, skin, 1, 3); px(10, 1, WOOD, 1, 1); px(11, 0, "#999", 1, 1); } else { px(10, 6, skin, 1, 3); px(10, 9, WOOD, 1, 2); }
      return;
    }
    if (kind === "spearmen") {
      // long spear and oval shield
      if (strike) { px(9, 6, skin, 2, 1); px(9, 6, WOOD, 7, 1); px(15, 6, IRON); } else { px(4, -0, WOOD, 1, 13); px(4, 0, IRON, 1, 2); px(5, 7, skin); }
      px(10, 4, sh, 3, 8); px(9, 5, sh, 1, 6); px(13, 5, sh, 1, 6); px(11, 7, boss, 1, 2);
      return;
    }
    if (kind === "javelinmen") {
      if (strike) { px(10, 3, skin, 1, 3); px(9, 2, WOOD, 6, 1); px(15, 2, IRON); } else { px(4, 2, WOOD, 1, 9); px(5, 2, WOOD, 1, 9); px(4, 1, IRON, 2, 1); }
      px(10, 6, sh, 2, 5); px(10, 8, boss);
      return;
    }
    // warriors and champions: long sword and oval shield
    if (strike) { px(10, 5, skin, 2, 1); px(12, 4, IRON, 4, 1); px(15, 4, "#d8dde2"); } else { px(5, 6, skin, 1, 3); px(4, 3, IRON, 1, 6); px(3, 8, BRONZE, 3, 1); }
    px(10, 4, sh, 3, 8); px(9, 5, sh, 1, 6); px(13, 5, sh, 1, 6); px(11, 7, boss, 1, 2);
  });
}

// ---------- horse and rider ----------

function horseSprite(kind, v, frame) {
  return make(22, 18, (px) => {
    const coat = kind === "chieftain" ? "#ddd6c6" : kind === "legate" ? "#2a1e18" : HORSE[v % HORSE.length];
    const skin = SKIN[v % SKIN.length];
    // legs
    const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    for (const [lx, d] of [[5, step], [7, -step], [13, -step], [15, step]]) px(lx + d, 13, coat, 1, 4);
    px(4, 9, coat, 13, 5);          // body
    px(15, 5, coat, 3, 5); px(17, 4, coat, 3, 3); px(19, 5, "#2a1a10"); // neck, head
    px(3, 9, "#2a1a10", 1, 5);      // tail
    px(16, 4, "#2a1a10", 1, 3);     // mane
    // rider
    const roman = kind === "equites" || kind === "legate";
    const cloak = kind === "chieftain" ? "#7a2a4a" : kind === "legate" ? "#9e1f2a" : roman ? "#8e949a" : PLAID[v % PLAID.length][0];
    px(9, 3, cloak, 3, 6);
    px(8, 9, roman ? "#6a4426" : "#5d4a30", 2, 3);
    head(px, 9, 0, skin, roman ? null : HAIR[v % HAIR.length], { helmet: roman ? (kind === "legate" ? "#d8c47a" : "#8e949a") : kind === "chieftain" ? GOLD : null, crest: kind === "legate" ? "#b81d2a" : null, woad: !roman });
    if (kind === "chieftain") px(9, 3, GOLD, 3, 1);
    // spear or sword
    if (frame === 3) { px(12, 4, WOOD, 8, 1); px(20, 4, IRON); }
    else { px(12, -0, WOOD, 1, 10); px(12, 0, IRON); }
    // shield
    px(7, 4, roman ? "#b3262d" : CELT_SHIELD[v % CELT_SHIELD.length][0], 2, 5);
  });
}

function chariotSprite(v, frame) {
  return make(30, 20, (px, g) => {
    const coat = HORSE[v % HORSE.length], coat2 = HORSE[(v + 2) % HORSE.length];
    const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
    // two ponies, one behind the other
    for (const [c, oy, ox] of [[coat2, -2, 2], [coat, 0, 0]]) {
      for (const [lx, d] of [[15, step], [17, -step], [23, -step], [25, step]]) px(lx + d + ox, 14 + oy, c, 1, 4);
      px(14 + ox, 10 + oy, c, 13, 4); px(25 + ox, 7 + oy, c, 3, 4); px(27 + ox, 6 + oy, c, 2, 3);
    }
    px(9, 11, WOOD, 7, 1); // pole
    // the car: wicker sides and a big wheel
    px(2, 8, "#9c7a45", 8, 5); px(2, 8, "#6a5222", 8, 1);
    g.strokeStyle = "#3a2a1a"; g.lineWidth = 1; g.beginPath(); g.arc(6, 15, 3.5, 0, 7); g.stroke();
    px(6, 15, "#3a2a1a");
    // driver and warrior
    const skin = SKIN[v % SKIN.length];
    px(3, 3, PLAID[v % PLAID.length][0], 2, 5); head(px, 3, 0, skin, HAIR[v % HAIR.length], { woad: true });
    px(7, 2, PLAID[(v + 1) % PLAID.length][0], 2, 6); head(px, 7, -1, skin, HAIR[(v + 2) % HAIR.length], { woad: true });
    if (frame === 3) { px(9, 1, WOOD, 6, 1); px(15, 1, IRON); } else { px(9, -1, WOOD, 1, 8); px(9, -1, IRON); }
  });
}

function scorpionSprite() {
  return make(20, 14, (px) => {
    px(3, 10, WOOD, 14, 2); px(5, 12, WOOD, 1, 2); px(14, 12, WOOD, 1, 2); // stand
    px(4, 6, WOOD, 12, 2);                                               // stock
    px(13, 2, "#5a4026", 1, 4); px(13, 8, "#5a4026", 1, 4);              // arms
    px(16, 7, IRON, 3, 1);                                                // bolt
    px(8, 5, IRON, 3, 4);                                                 // frame
  });
}

// ---------- banners ----------

export function bannerSprite(faction, general) {
  const key = `banner:${faction}:${general}`;
  if (cache.has(key)) return cache.get(key);
  const c = make(14, 30, (px) => {
    px(2, 4, WOOD, 1, 26);
    if (faction === "rome") {
      if (general) { px(0, 0, GOLD, 5, 2); px(1, 2, GOLD, 3, 2); px(3, 6, "#9e1f2a", 9, 7); px(3, 13, GOLD, 9, 1); }
      else { px(3, 4, "#a82f35", 9, 8); px(3, 12, GOLD, 9, 1); px(6, 6, GOLD, 3, 3); }
    } else if (general) {
      // a bronze boar on the pole, as on the Celtic standards
      px(0, 1, BRONZE, 7, 3); px(6, 0, BRONZE, 2, 2); px(1, 0, BRONZE, 4, 1); px(1, 4, BRONZE, 1, 1); px(5, 4, BRONZE, 1, 1);
      px(3, 7, "#7a2a4a", 9, 8);
    } else {
      px(3, 4, "#3c5e8f", 9, 7); px(5, 6, "#e8d8a8", 2, 3); px(8, 6, "#e8d8a8", 2, 3); px(3, 11, "#28406a", 9, 1);
    }
  });
  cache.set(key, c);
  return c;
}

// ---------- entry point ----------

const FOOT = ["warriors", "spearmen", "slingers", "javelinmen", "champions", "legionaries", "auxilia", "archers"];

// type: a unit type; variant: 0..4; frame: 0 stand, 1/2 walk, 3 strike, 4 fallen; dir: 1 right, -1 left
export function getSprite(type, variant, frame, dir, slot = 0) {
  const key = `${type}:${variant}:${frame}:${dir}:${type === "scorpion" ? Math.min(slot, 1) : 0}`;
  let c = cache.get(key);
  if (c) return c;
  const pose = frame === 4 ? 0 : frame;
  let base;
  if (type === "scorpion") base = slot === 0 ? scorpionSprite() : footSprite("scorpion-crew", variant, pose);
  else if (type === "chariots") base = chariotSprite(variant, pose);
  else if (["horsemen", "equites", "chieftain", "legate"].includes(type)) base = horseSprite(type, variant, pose);
  else base = footSprite(FOOT.includes(type) ? type : "warriors", variant, pose);
  if (dir < 0) base = flipped(base);
  if (frame === 4) base = fallen(base);
  cache.set(key, base);
  return base;
}
