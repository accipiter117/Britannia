// ui/mapView.js
// Owns the campaign map: northern Britannia as a hand-drawn SVG (sea, coast, regions tinted by
// owner, terrain textures, settlements), the hosts as painted standards on the board, and the
// highlights for where a selected host can march. Taps call back to main.js; no game rules here.

import { coastline, voronoiCells, MAP_BOUNDS } from "./geometry.js";

const TERRAIN_FILL = { highlands: "#8f8a6a", hills: "#9a9a6c", fertile: "#a8ad6a", plains: "#a9a777", coast: "#a3a67b" };
const path = (pts) => `M${pts.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join("L")}Z`;

export function createMap(svg, { onRegion, onArmy }) {
  let state = null;
  const ids = [];
  const cells = {};

  function build(s) {
    state = s;
    const regions = Object.values(s.regions);
    regions.forEach((r) => ids.push(r.id));
    const polys = voronoiCells(regions.map((r) => r.pos), MAP_BOUNDS);
    regions.forEach((r, i) => { cells[r.id] = path(polys[i]); });
    const coast = path(coastline());
    svg.setAttribute("viewBox", `0 0 ${MAP_BOUNDS.w} ${MAP_BOUNDS.h}`);
    svg.innerHTML = `
      <defs>
        <clipPath id="land"><path d="${coast}"/></clipPath>
        <pattern id="t-highlands" width="60" height="44" patternUnits="userSpaceOnUse"><path d="M4 36l13-22l13 22M24 36l11-17l11 17" fill="none" stroke="#5d5640" stroke-width="2" opacity="0.55"/><path d="M13 20l4-6l4 6" fill="#e9e6da" opacity="0.6"/></pattern>
        <pattern id="t-hills" width="46" height="30" patternUnits="userSpaceOnUse"><path d="M4 24q10-14 20 0M24 26q8-10 16 0" fill="none" stroke="#5f6040" stroke-width="2" opacity="0.5"/></pattern>
        <pattern id="t-fertile" width="38" height="24" patternUnits="userSpaceOnUse"><path d="M0 6h16M20 14h16M4 20h12" stroke="#6f7a36" stroke-width="2" opacity="0.45"/></pattern>
        <pattern id="t-plains" width="30" height="24" patternUnits="userSpaceOnUse"><path d="M6 16l3-6l3 6M20 10l2-5l2 5" fill="none" stroke="#6c6b40" stroke-width="1.5" opacity="0.45"/></pattern>
        <pattern id="t-coast" width="34" height="34" patternUnits="userSpaceOnUse"><circle cx="8" cy="9" r="1.6" fill="#6b6a48" opacity="0.4"/><circle cx="24" cy="22" r="1.4" fill="#6b6a48" opacity="0.4"/><path d="M14 30q4-4 8 0" fill="none" stroke="#6b6a48" opacity="0.4"/></pattern>
        <pattern id="waves" width="60" height="30" patternUnits="userSpaceOnUse"><path d="M0 15q15-8 30 0t30 0" fill="none" stroke="#9fb9c0" stroke-width="1.5" opacity="0.25"/></pattern>
        <filter id="shadow"><feGaussianBlur stdDeviation="6"/></filter>
      </defs>
      <rect x="-600" y="-600" width="2200" height="2500" fill="#2d4a55"/>
      <rect x="-600" y="-600" width="2200" height="2500" fill="url(#waves)"/>
      <path d="${coast}" fill="#0f1f25" opacity="0.6" transform="translate(8 12)" filter="url(#shadow)"/>
      <path d="${coast}" fill="none" stroke="#c9d6cf" stroke-opacity="0.35" stroke-width="22" stroke-linejoin="round"/>
      <g clip-path="url(#land)">
        ${regions.map((r) => `<path d="${cells[r.id]}" fill="${TERRAIN_FILL[r.terrain]}"/><path d="${cells[r.id]}" fill="url(#t-${r.terrain})"/>`).join("")}
      </g>
      <path d="${coast}" fill="none" stroke="#e3d9b8" stroke-width="5" stroke-linejoin="round"/>
      <g id="owners" clip-path="url(#land)"></g>
      <g id="links"></g>
      <g id="hits" clip-path="url(#land)"></g>
      <g id="places"></g>
      <g id="hosts"></g>
      <text x="840" y="760" class="sea-label">Mare Germanicum</text>
      <text x="70" y="1000" class="sea-label">Oceanus Hibernicus</text>`;
    svg.querySelector("#hits").addEventListener("click", (e) => {
      const id = e.target.closest("[data-region]")?.dataset.region;
      if (id) onRegion(id);
    });
    svg.querySelector("#hosts").addEventListener("click", (e) => {
      const id = e.target.closest("[data-army]")?.dataset.army;
      if (id) { e.stopPropagation(); onArmy(id); }
    });
  }

  // view: { selected: armyId, reach: [regionIds], attack: [regionIds], focus: regionId }
  function render(s, view = {}) {
    if (!ids.length) build(s);
    state = s;
    const g = (id) => svg.querySelector(`#${id}`);
    g("owners").innerHTML = ids.map((id) => {
      const r = s.regions[id];
      const col = s.factions[r.owner].colour;
      return `<g clip-path="url(#c-${id})"><clipPath id="c-${id}"><path d="${cells[id]}"/></clipPath>
        <path d="${cells[id]}" fill="${col}" opacity="${r.owner === "neutral" ? 0.06 : 0.2}"/>
        <path d="${cells[id]}" fill="none" stroke="${col}" stroke-width="14" opacity="0.65"/>
        <path d="${cells[id]}" fill="none" stroke="#2b261b" stroke-width="2.5" opacity="0.6"/></g>`;
    }).join("");
    g("links").innerHTML = s.links.map(([a, b]) => {
      const p = s.regions[a].pos, q = s.regions[b].pos;
      return `<line x1="${p[0]}" y1="${p[1]}" x2="${q[0]}" y2="${q[1]}" class="link"/>`;
    }).join("");
    const reach = new Set(view.reach || []), attack = new Set(view.attack || []);
    g("hits").innerHTML = ids.map((id) => {
      const cls = attack.has(id) ? "hit attack" : reach.has(id) ? "hit reach" : view.focus === id ? "hit focus" : "hit";
      return `<path d="${cells[id]}" class="${cls}" data-region="${id}"/>`;
    }).join("");
    g("places").innerHTML = ids.map((id) => placeSvg(s, s.regions[id])).join("");
    g("hosts").innerHTML = hostsSvg(s, view.selected);
  }

  return { render, regionCentre: (id) => state.regions[id].pos };
}

// ---------- settlements ----------

function placeSvg(s, r) {
  const [x, y] = r.pos;
  const col = s.factions[r.owner].colour;
  let art;
  if (r.settlement === "fortress") {
    art = `<rect x="-26" y="-20" width="52" height="38" rx="4" class="roman-wall"/><rect x="-6" y="10" width="12" height="8" fill="#3b2a1a"/>
      <path d="M-26 -20l6-6h40l6 6" class="roman-wall"/><rect x="-14" y="-12" width="10" height="10" class="roof"/><rect x="4" y="-12" width="10" height="10" class="roof"/>`;
  } else if (r.settlement === "fort" && r.owner === "rome") {
    art = `<rect x="-20" y="-16" width="40" height="30" rx="5" class="roman-wall"/><rect x="-5" y="7" width="10" height="7" fill="#3b2a1a"/><rect x="-9" y="-8" width="18" height="10" class="roof"/>`;
  } else if (r.settlement === "oppidum" || r.walls) {
    art = `<ellipse cx="0" cy="4" rx="30" ry="18" class="rampart"/><ellipse cx="0" cy="4" rx="22" ry="12" class="rampart inner"/>
      ${hut(-9, 2)}${hut(7, -2)}${hut(0, 8)}`;
  } else {
    art = `${hut(-8, 0)}${hut(8, 3)}${hut(0, -6)}`;
  }
  const fortSoon = r.fortAt ? `<text y="44" class="place-note">fort rising</text>` : "";
  const garrison = r.garrison.length && r.owner !== "picts" ? `<g transform="translate(26 -22)"><circle r="9" fill="${col}" stroke="#1c1a14"/><text y="4" class="garrison-n">${r.garrison.length}</text></g>` : "";
  return `<g transform="translate(${x} ${y}) scale(1.25)" pointer-events="none">${art}${garrison}
    <text y="${r.capital ? 40 : 36}" class="place-name ${r.capital ? "capital" : ""}">${r.name}</text>${fortSoon}</g>`;
}

const hut = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-6 3a6 4 0 0 0 12 0v-2h-12z" fill="#7a5a3a"/><path d="M-7 1l7-8l7 8z" fill="#c9a96a" stroke="#4a3520" stroke-width="0.8"/></g>`;

// ---------- hosts ----------

function hostsSvg(s, selected) {
  const by = {};
  for (const a of s.armies) (by[a.region] ||= []).push(a);
  return Object.entries(by).map(([rid, list]) => {
    const [x, y] = s.regions[rid].pos;
    return list.map((a, i) => {
      const ox = 62 + i * 76, oy = -18 - (i % 2) * 12;
      return `<g class="host ${a.id === selected ? "selected" : ""} ${a.moves > 0 && a.faction === "picts" ? "ready" : ""}" data-army="${a.id}" transform="translate(${x + ox} ${y + oy}) scale(1.55)">${hostToken(s, a)}</g>`;
    }).join("");
  }).join("");
}

function hostToken(s, a) {
  const col = s.factions[a.faction].colour;
  const roman = a.faction === "rome";
  const men = a.units.reduce((n, u) => n + u.men, 0);
  const figs = Math.min(5, Math.max(2, Math.round(a.units.length / 2)));
  const people = Array.from({ length: figs }, (_, i) => {
    const fx = -16 + i * 8;
    return roman
      ? `<g transform="translate(${fx} 0)"><circle cy="-11" r="2.6" fill="#d8b892"/><rect x="-3" y="-8" width="6" height="9" fill="${col}"/><rect x="-5.5" y="-8" width="4" height="8" rx="1" fill="#c9a548" stroke="#5a3f12" stroke-width="0.5"/></g>`
      : `<g transform="translate(${fx} 0)"><circle cy="-11" r="2.6" fill="#d8b892"/><path d="M-3 -8h6l1 9h-8z" fill="#5d7fa8"/><circle cx="-3" cy="-4" r="3" fill="${col}" stroke="#1c2a3a" stroke-width="0.6"/><path d="M2 -12l3 -7" stroke="#c8c8c0"/></g>`;
  }).join("");
  const banner = roman
    ? `<path d="M20 4V-34" stroke="#3a2a18" stroke-width="2"/><path d="M14 -38q6-6 12 0" stroke="#f2cf5b" stroke-width="2" fill="none"/><rect x="13" y="-34" width="14" height="12" fill="${col}" stroke="#f2cf5b"/>`
    : `<path d="M20 4V-34" stroke="#3a2a18" stroke-width="2"/><path d="M20 -34h15l-4 6l4 6h-15z" fill="${col}" stroke="#13202d" stroke-width="0.8"/><path d="M23 -30a3 3 0 1 0 6 0M24 -24l6 -6" stroke="#e8e2cf" stroke-width="1" fill="none"/>`;
  return `<rect x="-30" y="-42" width="70" height="68" fill="transparent"/>
    <ellipse cx="0" cy="4" rx="26" ry="7" fill="#000" opacity="0.3"/>
    <ellipse cx="0" cy="2" rx="25" ry="7" fill="#4a3824" stroke="#22190f"/>
    ${people}${banner}
    <rect x="-22" y="8" width="44" height="14" rx="4" class="host-plaque"/>
    <text y="18.5" class="host-men">${men}</text>`;
}

export function unitsLabel(n) {
  return `${n} unit${n === 1 ? "" : "s"}`;
}

