// ui/art.js
// Owns the map's hand-drawn vector art: terrain textures, settlements by tier, landmarks,
// army banners and status badges. Painted-diorama look: muted earth palette, light from the
// upper left, soft shadows. Pure string builders; no state changes, no external images.

export const TERRAIN_BASE = {
  fertile: "#8b9a5c", forest: "#4f6541", hills: "#86865c", plains: "#97a368", marsh: "#6b7a5e", coast: "#a29c78",
};

// <defs> for the whole map: textures, gradients, shadows and reusable symbols.
export function artDefs() {
  return `
    <radialGradient id="g-crown" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#6f8f57"/><stop offset="0.6" stop-color="#425a35"/><stop offset="1" stop-color="#2c3d24"/>
    </radialGradient>
    <radialGradient id="g-crown-dark" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#5a7748"/><stop offset="1" stop-color="#26351f"/>
    </radialGradient>
    <linearGradient id="g-thatch" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#c9a866"/><stop offset="0.55" stop-color="#a98a4d"/><stop offset="1" stop-color="#7d6436"/>
    </linearGradient>
    <linearGradient id="g-wall" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#9b7a52"/><stop offset="1" stop-color="#6b5236"/>
    </linearGradient>
    <linearGradient id="g-hump" x1="0" y1="0" x2="1" y2="0.6">
      <stop offset="0" stop-color="#b3ad78"/><stop offset="0.45" stop-color="#959060"/><stop offset="1" stop-color="#5f5c3e"/>
    </linearGradient>
    <radialGradient id="g-vignette" cx="0.5" cy="0.48" r="0.7">
      <stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.45"/>
    </radialGradient>
    <linearGradient id="g-sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#22363e"/><stop offset="1" stop-color="#1a2a31"/>
    </linearGradient>

    <pattern id="t-fertile" width="90" height="70" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
      <rect width="90" height="70" fill="${TERRAIN_BASE.fertile}"/>
      <rect x="2" y="2" width="40" height="30" fill="#97a765"/><rect x="46" y="2" width="42" height="30" fill="#a9ad6a"/>
      <rect x="2" y="36" width="56" height="32" fill="#7f8f51"/><rect x="62" y="36" width="26" height="32" fill="#9aa95f"/>
      <path d="M4 10h36M4 18h36M4 26h36" stroke="#86965a" stroke-width="1.5"/>
      <path d="M48 8h38M48 16h38M48 24h38" stroke="#b9b878" stroke-width="1.2"/>
      <path d="M0 34h90M44 0v34M60 34v36" stroke="#5f6f3e" stroke-width="2.4" stroke-dasharray="3 2"/>
    </pattern>
    <pattern id="t-forest" width="64" height="56" patternUnits="userSpaceOnUse">
      <rect width="64" height="56" fill="${TERRAIN_BASE.forest}"/>
      ${tree(12, 14, 11)}${tree(36, 10, 12)}${tree(56, 22, 10)}${tree(22, 36, 12)}${tree(46, 44, 11)}${tree(4, 50, 9)}
    </pattern>
    <pattern id="t-dense" width="48" height="44" patternUnits="userSpaceOnUse">
      <rect width="48" height="44" fill="#3f5434"/>
      ${tree(10, 10, 11, true)}${tree(30, 8, 12, true)}${tree(44, 24, 10, true)}${tree(18, 30, 12, true)}${tree(36, 40, 10, true)}${tree(2, 40, 9, true)}
    </pattern>
    <pattern id="t-hills" width="120" height="90" patternUnits="userSpaceOnUse">
      <rect width="120" height="90" fill="${TERRAIN_BASE.hills}"/>
      ${tuft(56, 14)}${tuft(104, 54)}${tuft(14, 52)}
      ${hump(30, 38, 30, 18)}${hump(88, 26, 24, 15)}${hump(76, 78, 32, 17)}${hump(16, 86, 18, 10)}
      <circle cx="52" cy="58" r="2.5" fill="#6e6a52"/><circle cx="108" cy="80" r="2" fill="#6e6a52"/>
    </pattern>
    <pattern id="t-plains" width="60" height="50" patternUnits="userSpaceOnUse">
      <rect width="60" height="50" fill="${TERRAIN_BASE.plains}"/>
      ${tuft(10, 12)}${tuft(38, 8)}${tuft(52, 30)}${tuft(22, 34)}${tuft(6, 44)}${tuft(40, 46)}
    </pattern>
    <pattern id="t-marsh" width="70" height="56" patternUnits="userSpaceOnUse">
      <rect width="70" height="56" fill="${TERRAIN_BASE.marsh}"/>
      <ellipse cx="22" cy="18" rx="15" ry="6" fill="#56707a"/><ellipse cx="54" cy="40" rx="12" ry="5" fill="#56707a"/>
      <ellipse cx="20" cy="17" rx="10" ry="3" fill="#6d8790"/><ellipse cx="53" cy="39" rx="7" ry="2.5" fill="#6d8790"/>
      ${reeds(40, 18)}${reeds(10, 42)}${reeds(62, 12)}${reeds(30, 50)}
    </pattern>
    <pattern id="t-coast" width="70" height="50" patternUnits="userSpaceOnUse">
      <rect width="70" height="50" fill="${TERRAIN_BASE.coast}"/>
      <path d="M0 14q17 -6 35 0t35 0M0 38q17 -6 35 0t35 0" stroke="#b8b18a" stroke-width="3" fill="none"/>
      ${tuft(14, 26)}${tuft(50, 6)}${tuft(56, 44)}
    </pattern>
    <pattern id="waves" width="46" height="24" patternUnits="userSpaceOnUse">
      <path d="M0 12 q11.5 -7 23 0 t23 0" fill="none" stroke="#2f4a53" stroke-width="1.6"/>
    </pattern>

    <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3"/>
    </filter>

    <symbol id="roundhouse" viewBox="-20 -24 40 34" overflow="visible">
      <ellipse cx="3" cy="8" rx="19" ry="5" fill="#000" opacity="0.28"/>
      <path d="M-15 0v6q15 6 30 0v-6z" fill="url(#g-wall)"/>
      <path d="M-18 1L0 -22L18 1q-18 6 -36 0z" fill="url(#g-thatch)" stroke="#5e4a28" stroke-width="1"/>
      <path d="M-3 3h5v5h-5z" fill="#3a2a18"/>
      <path d="M-2 -18l-8 14M2 -18l6 14" stroke="#e3cc8c" stroke-width="0.8" opacity="0.6"/>
    </symbol>
    <symbol id="hall" viewBox="-34 -30 68 42" overflow="visible">
      <ellipse cx="4" cy="10" rx="34" ry="6" fill="#000" opacity="0.28"/>
      <path d="M-28 -4h56v12h-56z" fill="url(#g-wall)"/>
      <path d="M-32 -2L-18 -26h36L32 -2z" fill="url(#g-thatch)" stroke="#5e4a28" stroke-width="1"/>
      <path d="M-4 1h8v7h-8z" fill="#3a2a18"/>
      <path d="M-18 -26l-4 -4M18 -26l4 -4" stroke="#5e4a28" stroke-width="2"/>
    </symbol>
    <symbol id="palisade" viewBox="-60 -40 120 70" overflow="visible">
      <ellipse cx="0" cy="-2" rx="56" ry="26" fill="#6f6a46" opacity="0.35"/>
      <ellipse cx="0" cy="-2" rx="56" ry="26" fill="none" stroke="#4a3620" stroke-width="6"/>
      <ellipse cx="0" cy="-2" rx="56" ry="26" fill="none" stroke="#9a7a4e" stroke-width="3" stroke-dasharray="2.5 3.5"/>
    </symbol>`;
}

function tree(x, y, r, dark = false) {
  return `<ellipse cx="${x + 3}" cy="${y + r * 0.8}" rx="${r}" ry="${r * 0.45}" fill="#000" opacity="0.22"/>
    <circle cx="${x}" cy="${y}" r="${r}" fill="url(#${dark ? "g-crown-dark" : "g-crown"})"/>`;
}

function hump(x, y, w, h) {
  return `<ellipse cx="${x + 4}" cy="${y + 2}" rx="${w}" ry="${h * 0.35}" fill="#000" opacity="0.18"/>
    <path d="M${x - w} ${y}q${w} ${-h * 2.2} ${w * 2} 0z" fill="url(#g-hump)" stroke="#55523a" stroke-width="1"/>
    <path d="M${x - w * 0.55} ${y - h * 0.45}q${w * 0.35} ${-h * 0.95} ${w * 0.6} ${-h * 0.9}" stroke="#d2cb98" stroke-width="2" fill="none" opacity="0.7"/>`;
}

function tuft(x, y) {
  return `<path d="M${x} ${y}l-3 -6M${x} ${y}l0 -7M${x} ${y}l3 -6" stroke="#7e8b52" stroke-width="1.4" stroke-linecap="round"/>`;
}

function reeds(x, y) {
  return `<path d="M${x} ${y}l-2 -10M${x + 3} ${y}l1 -12M${x + 6} ${y}l3 -9" stroke="#8f8a55" stroke-width="1.4" stroke-linecap="round"/>`;
}

export function terrainFill(d) {
  if (d.terrain === "forest" && d.special.includes("dense_forest")) return "url(#t-dense)";
  return `url(#t-${d.terrain})`;
}

// Settlement by tier: a cluster of roundhouses, growing a palisade and then a great hall.
export function settlementSvg(tier, x, y) {
  const use = (id, dx, dy, s) => `<use href="#${id}" x="${x + dx - 20 * s}" y="${y + dy - 24 * s}" width="${40 * s}" height="${34 * s}"/>`;
  if (tier === "village") return use("roundhouse", -14, -2, 1) + use("roundhouse", 14, 4, 0.85) + use("roundhouse", 0, 10, 0.7);
  const houses = use("roundhouse", -24, -6, 0.95) + use("roundhouse", 24, -4, 0.9) + use("roundhouse", -10, 12, 0.85) + use("roundhouse", 16, 14, 0.8);
  const fence = `<use href="#palisade" x="${x - 60}" y="${y - 32}" width="120" height="70"/>`;
  if (tier === "town") return fence + houses + use("roundhouse", 0, -12, 1.05);
  return fence + houses + `<use href="#hall" x="${x - 34}" y="${y - 40}" width="68" height="42"/>`;
}

// Landmarks drawn around a settlement from its specials.
export function landmarksSvg(d, x, y) {
  let out = "";
  if (d.special.includes("hillfort") || d.special.includes("ancient_hillfort")) {
    const worn = d.special.includes("ancient_hillfort");
    out += `<ellipse cx="${x}" cy="${y + 6}" rx="74" ry="40" fill="none" stroke="#000" stroke-opacity="0.2" stroke-width="10" transform="translate(3 4)"/>
      <ellipse cx="${x}" cy="${y + 6}" rx="74" ry="40" fill="none" stroke="${worn ? "#7d7656" : "#6d6243"}" stroke-width="9"${worn ? ' stroke-dasharray="40 10"' : ""}/>
      <ellipse cx="${x}" cy="${y + 6}" rx="74" ry="40" fill="none" stroke="#b3a982" stroke-width="2.5" transform="translate(-1.5 -2)"${worn ? ' stroke-dasharray="40 10"' : ""}/>`;
  }
  if (d.special.includes("natural_harbour")) {
    out += `<path d="M${x + 40} ${y + 92}h44" stroke="#5a4229" stroke-width="5" stroke-linecap="round"/>
      <path d="M${x + 58} ${y + 104}q12 8 24 0z" fill="#6b5236"/><path d="M${x + 70} ${y + 104}v-18l10 12z" fill="#d9cfb0"/>`;
  }
  if (d.special.includes("iron_deposit")) {
    out += `<g transform="translate(${x - 72} ${y + 30})"><path d="M0 8l8 -12l10 4l4 10z" fill="#5d5b57"/><path d="M8 -4l10 4" stroke="#b4643a" stroke-width="2"/><circle cx="12" cy="4" r="2" fill="#c47a45"/></g>`;
  }
  if (d.special.includes("roman_road")) {
    out += `<g transform="translate(${x - 70} ${y + 34})"><rect width="10" height="22" rx="2" fill="#bdb5a0"/><rect y="-3" width="10" height="5" rx="2" fill="#d6cfbb"/></g>`;
  }
  return out;
}

// Rivers cross the district through its seat, clipped to the district's own cell.
export function riverSvg(d, clipId) {
  if (!d.special.includes("river") && !d.special.includes("river_crossing")) return "";
  const [x, y] = d.pos;
  const path = `M${x - 260} ${y - 70} C ${x - 120} ${y + 10}, ${x - 40} ${y - 40}, ${x + 30} ${y + 34} S ${x + 160} ${y + 30}, ${x + 280} ${y + 110}`;
  const ford = d.special.includes("river_crossing")
    ? `<path d="M${x + 14} ${y + 14}l26 26" stroke="#c9bf98" stroke-width="12" stroke-linecap="round" opacity="0.9"/>` : "";
  return `<g clip-path="url(#${clipId})" pointer-events="none">
    <path d="${path}" stroke="#2f4f5a" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="${path}" stroke="#5f8796" stroke-width="10" fill="none" stroke-linecap="round"/>
    <path d="${path}" stroke="#9cbcc4" stroke-width="2" fill="none" stroke-dasharray="14 18" opacity="0.7"/>${ford}</g>`;
}

const EMBLEM = {
  celtic: `<path d="M0 -4a4 4 0 1 1 4 4M0 -4a4 4 0 1 0 -4 4M4 0a4 4 0 1 1 -4 4" stroke="#f1e6c8" stroke-width="1.6" fill="none"/>`,
  roman: `<path d="M-7 -1q3 -6 7 -2q4 -4 7 2q-3 0 -4 3h-6q-1 -3 -4 -3z" fill="#f2cf5b"/><circle cy="-5" r="1.8" fill="#f2cf5b"/>`,
  rebel: `<path d="M-5 4l5 -10l5 10" stroke="#f1e6c8" stroke-width="1.8" fill="none"/>`,
};

// Army marker: a standard on a pole with the troop count on a plaque.
export function bannerSvg(colour, culture, x, y, label, { selected = false, spent = false, rebel = false } = {}) {
  const emblem = rebel ? EMBLEM.rebel : EMBLEM[culture] || EMBLEM.celtic;
  const roman = culture === "roman";
  const flag = roman
    ? `<rect x="-13" y="-46" width="26" height="22" rx="2" fill="${colour}" stroke="#f2cf5b" stroke-width="1.5"/>`
    : `<path d="M-13 -48h26v22l-13 -6l-13 6z" fill="${colour}" stroke="#2a2418" stroke-width="1"/>`;
  return `<g transform="translate(${x} ${y})" opacity="${spent ? 0.6 : 1}">
    <ellipse cx="4" cy="16" rx="18" ry="5" fill="#000" opacity="0.3"/>
    <path d="M0 16V-52" stroke="#4a3620" stroke-width="3"/>
    ${roman ? `<path d="M-8 -56q8 -8 16 0" stroke="#f2cf5b" stroke-width="2.5" fill="none"/>` : ""}
    ${flag}
    <g transform="translate(0 -36)">${emblem}</g>
    <rect x="-26" y="-4" width="52" height="22" rx="6" fill="#1d1b16" stroke="${selected ? "#fff6d0" : colour}" stroke-width="${selected ? 3.5 : 2}"/>
    <text y="12" class="army-text">${label}</text>
  </g>`;
}

const BADGE = {
  construction: `<path d="M-8 6l8 -14l8 14z" fill="#d6a43a" stroke="#3a2a10"/><path d="M-1 -2v4M-1 4v1" stroke="#3a2a10" stroke-width="2"/>`,
  militia: `<path d="M-9 10L7 -10" stroke="#5a4229" stroke-width="2.2"/><path d="M7 -10l-1 6l4 -3z" fill="#cfc6a6"/><circle r="8" fill="#7b5a36" stroke="#2a1f12" stroke-width="1.5"/><circle r="2.6" fill="#cfc6a6"/>`,
  occupied: `<circle r="8" fill="#3b3426" stroke="#cfc6a6" stroke-width="1.5"/><path d="M-4 -1h8v6h-8zM-2.5 -1v-3a2.5 2.5 0 0 1 5 0v3" fill="none" stroke="#cfc6a6" stroke-width="1.5"/>`,
  unrest: `<path d="M0 -10q8 8 4 14q-1 4 -4 4q-6 0 -6 -6q0 -4 3 -6q0 4 3 4q-2 -6 0 -10z" fill="#e0662f" stroke="#5a1c08"/>`,
};

export function badgeSvg(kind, x, y) {
  return `<g transform="translate(${x} ${y})">${BADGE[kind]}</g>`;
}
