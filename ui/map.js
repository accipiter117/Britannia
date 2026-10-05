// ui/map.js
// Owns the SVG campaign map: terrain, ownership borders, connections, roads, settlements, army banners,
// selection highlight and camera (drag to pan, pinch or wheel to zoom, tap to select).
// Reads state only; taps are reported through the onTap callback.

import { BALANCE } from "../config/balance.js";
import { settlementTier } from "../simulation/economy.js";
import { MAP_BOUNDS, coastline, pathFrom, voronoiCells } from "./geometry.js";
import { esc, factionColour, num } from "./format.js";
import { createUnitLayer } from "./units.js";
import { artDefs, badgeSvg, landmarksSvg, riverSvg, settlementSvg, terrainFill } from "./art.js";

const ZOOM_MIN_W = 280;
const ZOOM_MAX_W = 1500;
const TAP_SLOP_PX = 8;
const ZOOM_STRATEGIC_W = 1000; // wider view than this: banners and names only
const ZOOM_DISTRICT_W = 620;   // narrower than this: buildings and gauges appear

// A Roman galley: hull, oars, a red sail with a gold eagle. Drawn at the origin.
const GALLEY = `<path d="M-30 6q30 14 60 0l-4 -8h-52z" fill="#5a3a22" stroke="#21150b" stroke-width="1.5"/>
  <path d="M-24 4l-6 10M-14 6l-5 11M-4 7l-3 11M6 7l-1 11M16 6l1 11" stroke="#21150b" stroke-width="1.4"/>
  <path d="M30 -2q8 -2 10 -10" fill="none" stroke="#5a3a22" stroke-width="3"/>
  <path d="M-2 -2V-36" stroke="#21150b" stroke-width="2"/>
  <path d="M-16 -32h28v20h-28z" fill="#a3242b" stroke="#21150b" stroke-width="1"/>
  <path d="M-2 -26l-5 4h10zM-2 -26v8" fill="#f2cf5b" stroke="#f2cf5b" stroke-width="1"/>`;

// A Roman marching camp: square bank and ditch with four gates, drawn round a settlement.
function castraSvg(x, y) {
  const s = 64;
  return `<g class="castra" transform="translate(${x} ${y - 6})">
    <rect x="${-s}" y="${-s * 0.7}" width="${s * 2}" height="${s * 1.4}" rx="10"/>
    <path d="M-8 ${-s * 0.7}h16M-8 ${s * 0.7}h16M${-s} -8v16M${s} -8v16" class="gate"/>
  </g>`;
}

export function createMap(svg, state, { onTap }) {
  const ids = Object.keys(state.districts);
  const cells = voronoiCells(ids.map((id) => state.districts[id].pos));
  const cellPath = Object.fromEntries(ids.map((id, i) => [id, pathFrom(cells[i])]));
  const coast = pathFrom(coastline());

  const view = { x: MAP_BOUNDS.x - 40, y: MAP_BOUNDS.y - 40, w: MAP_BOUNDS.w + 80, h: MAP_BOUNDS.h + 80 };
  const aspect = view.h / view.w;
  let selection = null;

  // static layers: sea, island, terrain textures and rivers are drawn once
  svg.innerHTML = `
    <defs>
      ${artDefs()}
      <clipPath id="island"><path d="${coast}"/></clipPath>
      ${ids.map((id) => `<clipPath id="cp-${id}"><path d="${cellPath[id]}"/></clipPath>`).join("")}
      <marker id="route-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#f2cf5b"/>
      </marker>
      <pattern id="snow" width="46" height="46" patternUnits="userSpaceOnUse" fill="#fff">
        <circle cx="6" cy="9" r="1.6"/><circle cx="27" cy="4" r="1.1"/><circle cx="38" cy="22" r="1.8"/><circle cx="15" cy="30" r="1.2"/><circle cx="31" cy="40" r="1.5"/><circle cx="3" cy="41" r="1"/>
      </pattern>
      <marker id="raid-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
        <path d="M0 0 L10 5 L0 10 z" fill="#e07a3a"/>
      </marker>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="var(--critical)"/>
      </marker>
    </defs>
    <rect x="-2000" y="-2000" width="5000" height="5200" fill="url(#g-sea)"/>
    <rect x="-2000" y="-2000" width="5000" height="5200" fill="url(#waves)"/>
    <path d="${coast}" fill="#0d1519" opacity="0.55" transform="translate(10 14)" filter="url(#soft-shadow)"/>
    <path d="${coast}" fill="none" stroke="#b9c7c4" stroke-opacity="0.35" stroke-width="26" stroke-linejoin="round"/>
    <g clip-path="url(#island)">
      ${ids.map((id) => `<path d="${cellPath[id]}" fill="${terrainFill(state.districts[id])}"/>`).join("")}
      ${ids.map((id) => riverSvg(state.districts[id], `cp-${id}`)).join("")}
    </g>
    <path d="${coast}" fill="none" stroke="#d8cfac" stroke-width="7" stroke-linejoin="round"/>
    <path d="${coast}" fill="none" stroke="#5c5338" stroke-width="2" stroke-linejoin="round" transform="translate(2 3)" opacity="0.6"/>
    <g id="season" clip-path="url(#island)" pointer-events="none">
      <rect class="tint" x="-500" y="-500" width="3000" height="3000"/>
      <rect class="flecks" x="-500" y="-500" width="3000" height="3000" fill="url(#snow)"/>
    </g>
    <g id="cells" clip-path="url(#island)"></g>
    <g id="links"></g>
    <g id="hits" clip-path="url(#island)"></g>
    <g id="labels"></g>
    <g id="armies"></g>
    <g id="sel" clip-path="url(#island)" pointer-events="none"></g>
    <g id="fx" pointer-events="none"></g>
    <g id="rome" pointer-events="none"></g>
    <text x="520" y="1225" class="sea-label">The Narrow Sea · Rome lies beyond</text>`;

  const units = createUnitLayer(svg.querySelector("#armies"), (did) => state.districts[did].pos);

  // overlay: { reach: { districtId: { kind } }, threats: [{ from, to }], armies: [visible armies] }
  function render(s, sel, overlay = {}) {
    state = s;
    selection = sel;
    const g = (id) => svg.querySelector(`#${id}`);
    const reach = overlay.reach || {};
    g("season").setAttribute("class", `season-${BALANCE.seasons[state.seasonIndex].toLowerCase()}`);

    // ownership: a soft tint and a coloured inner border, not a solid national block
    g("cells").innerHTML = ids.map((id) => {
      const d = state.districts[id];
      const col = factionColour(state, d.owner);
      const unrest = d.owner && d.stage !== "Integrated";
      return `<g clip-path="url(#cp-${id})" pointer-events="none">
        ${d.owner ? `<path d="${cellPath[id]}" fill="${col}" opacity="${unrest ? 0.08 : 0.16}"/>` : ""}
        <path d="${cellPath[id]}" fill="none" stroke="${col}" stroke-width="${d.owner ? 22 : 8}" opacity="${d.owner ? 0.4 : 0.35}"${unrest ? ' stroke-dasharray="22 12"' : ""}/>
        ${d.owner ? `<path d="${cellPath[id]}" fill="none" stroke="${col}" stroke-width="5" opacity="0.8"${unrest ? ' stroke-dasharray="22 12"' : ""}/>` : ""}
        <path d="${cellPath[id]}" fill="none" stroke="#1b1a12" stroke-width="3" opacity="0.55"/>
      </g>`;
    }).join("");

    g("links").innerHTML = state.connections.map((c) => {
      const [a, b] = [state.districts[c.a].pos, state.districts[c.b].pos];
      if (c.road || c.roadProgress !== null) {
        const building = c.road ? "" : " building";
        return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="road-edge${building}"/>
          <line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="road${building}"/>`;
      }
      return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="link"/>`;
    }).join("") + (overlay.threats || []).map((t) => {
      const b = state.districts[t.to].pos;
      const a = t.from ? state.districts[t.from].pos : [b[0] + 60, b[1] + 160]; // from the sea
      const mx = a[0] + (b[0] - a[0]) * 0.8, my = a[1] + (b[1] - a[1]) * 0.8;
      return `<line x1="${a[0]}" y1="${a[1]}" x2="${mx}" y2="${my}" class="threat" marker-end="url(#arrow)"/>`;
    }).join("");

    // move mode: movement cost on each reachable district, and the previewed route
    if (overlay.reach) {
      g("links").innerHTML += Object.entries(reach).filter(([, r]) => r.kind !== "blocked").map(([did, r]) => {
        const [x, y] = state.districts[did].pos;
        return `<g transform="translate(${x - 44} ${y - 44})" class="cost-tag ${r.kind}"><circle r="13"/><text y="5">${r.cost}</text></g>`;
      }).join("");
    }
    if (overlay.path?.length > 1) {
      const pts = overlay.path.map((did) => state.districts[did].pos);
      g("links").innerHTML += `<polyline points="${pts.map((p) => p.join(",")).join(" ")}" class="route-shadow"/>
        <polyline points="${pts.map((p) => p.join(",")).join(" ")}" class="route" marker-end="url(#route-arrow)"/>`;
    }

    // transparent tap targets, also showing move-mode highlights
    g("hits").innerHTML = ids.map((id) => {
      const r = reach[id] ? ` reach-${reach[id].kind}` : "";
      return `<path data-district="${id}" d="${cellPath[id]}" class="hit${r}"/>`;
    }).join("");

    g("labels").innerHTML = ids.map((id) => {
      const d = state.districts[id];
      const [x, y] = d.pos;
      const badges = [];
      if (d.construction.length) badges.push("construction");
      if (!d.owner && d.garrison) badges.push("militia");
      if (d.owner && d.stage !== "Integrated") badges.push("occupied");
      if (d.owner && d.loyalty < BALANCE.loyalty.unrest) badges.push("unrest");
      return `<g data-district="${id}">
        ${landmarksSvg(d, x, y)}
        <ellipse cx="${x}" cy="${y + 4}" rx="46" ry="30" fill="transparent"/>
        ${settlementSvg(settlementTier(d).id, x, y)}
        ${badges.map((b, i) => badgeSvg(b, x - 48 - i * 22, y - 26)).join("")}
        <text x="${x}" y="${y + 58}" class="name">${esc(d.name)}</text>
        <text x="${x}" y="${y + 80}" class="pop">${num(d.population)}</text>
        ${infrastructureSvg(d, x, y)}
        ${d.siege ? siegeSvg(d, x, y, factionColour(state, d.siege.by)) : ""}
        ${d.construction.length ? worksSvg(state, d, x, y) : ""}
        ${(d.disruptedUntil ?? -1) >= state.turn ? smokeSvg(x, y) : ""}
      </g>`;
    }).join("");

    units.update(state, overlay.armies || state.armies, overlay.ghosts || [], selection, (t) => seasonShort(t));

    const rome = state.rome;
    const entry = state.districts[BALANCE.rome.entryDistrict].pos;
    g("sel").innerHTML = (selection?.type === "district" ? `<path d="${cellPath[selection.id]}" class="selected"/>` : "") +
      (overlay.highlight ? `<path d="${cellPath[overlay.highlight]}" class="pulse"/>` : "");
    // the fleet gathers at sea as the countdown runs; once ashore, Rome's districts become camps
    const camps = Object.values(state.districts).filter((d) => d.owner === "rome").map((d) => castraSvg(d.pos[0], d.pos[1])).join("");
    svg.querySelector("#rome").innerHTML = (rome.stage === "warning" ? fleetSvg(entry, rome.countdown) : "") + camps;
    applyView();
  }

  function fleetSvg([ex, ey], countdown) {
    const total = BALANCE.rome.countdownSeasons;
    const near = 1 - (countdown - 1) / Math.max(1, total - 1); // 0 far out, 1 off the beach
    const cx = ex + 300 - near * 140, cy = ey - 260 + near * 220; // out of the east, closing on the beach
    const ships = Math.min(7, 2 + Math.round(near * 5));
    const fleet = Array.from({ length: ships }, (_, i) => {
      const ox = ((i * 37) % 90) - 45, oy = ((i * 53) % 150) - 75;
      return `<g class="galley" style="animation-delay:${-i * 0.7}s" transform="translate(${cx + ox} ${cy + oy})">${GALLEY}</g>`;
    }).join("");
    return `<path d="M${cx - 40} ${cy + 20}Q${(cx + ex) / 2 + 30} ${(cy + ey) / 2 + 40} ${ex + 50} ${ey + 10}" class="threat rome" marker-end="url(#arrow)"/>
      ${fleet}
      <text x="${cx}" y="${cy + 120}" class="rome-label">Rome lands in ${countdown}</text>`;
  }

  // ---------- camera ----------

  // three zoom levels (spec 01): strategic, regional, district
  function applyView() {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    const level = view.w > ZOOM_STRATEGIC_W ? "strategic" : view.w < ZOOM_DISTRICT_W ? "district" : "regional";
    svg.classList.remove("zoom-strategic", "zoom-regional", "zoom-district");
    svg.classList.add(`zoom-${level}`);
  }

  function toSvg(clientX, clientY, inv) {
    const p = svg.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    return p.matrixTransform(inv);
  }

  function zoomAbout(anchor, ratio, from = view) {
    const w = clamp(from.w * ratio, ZOOM_MIN_W, ZOOM_MAX_W);
    const r = w / from.w;
    view.x = anchor.x - (anchor.x - from.x) * r;
    view.y = anchor.y - (anchor.y - from.y) * r;
    view.w = w;
    view.h = w * aspect;
    clampPan();
  }

  function clampPan() {
    const m = 200;
    view.x = clamp(view.x, MAP_BOUNDS.x - m - view.w / 2, MAP_BOUNDS.x + MAP_BOUNDS.w + m - view.w / 2);
    view.y = clamp(view.y, MAP_BOUNDS.y - m - view.h / 2, MAP_BOUNDS.y + MAP_BOUNDS.h + m - view.h / 2);
  }

  const pointers = new Map();
  let drag = null;
  let pinch = null;

  svg.addEventListener("pointerdown", (e) => {
    svg.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const inv = svg.getScreenCTM().inverse();
    if (pointers.size === 1) {
      drag = { sx: e.clientX, sy: e.clientY, start: toSvg(e.clientX, e.clientY, inv), view: { ...view }, inv, moved: false };
    } else if (pointers.size === 2) {
      const [p, q] = [...pointers.values()];
      pinch = { dist: Math.hypot(p.x - q.x, p.y - q.y), anchor: toSvg((p.x + q.x) / 2, (p.y + q.y) / 2, inv), view: { ...view }, inv };
      if (drag) drag.moved = true;
    }
  });

  svg.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const [p, q] = [...pointers.values()];
      const ratio = pinch.dist / Math.max(1, Math.hypot(p.x - q.x, p.y - q.y));
      const mid = toSvg((p.x + q.x) / 2, (p.y + q.y) / 2, pinch.inv);
      zoomAbout(pinch.anchor, ratio, pinch.view);
      // keep the pinch midpoint under the fingers as they move
      const r = view.w / pinch.view.w;
      view.x = pinch.anchor.x - (mid.x - pinch.view.x) * r;
      view.y = pinch.anchor.y - (mid.y - pinch.view.y) * r;
      clampPan();
      applyView();
    } else if (drag) {
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > TAP_SLOP_PX) drag.moved = true;
      if (!drag.moved) return;
      const cur = toSvg(e.clientX, e.clientY, drag.inv);
      view.x = drag.view.x - (cur.x - drag.start.x);
      view.y = drag.view.y - (cur.y - drag.start.y);
      clampPan();
      applyView();
    }
  });

  const release = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      if (drag && !drag.moved && e.type === "pointerup") tapAt(e.clientX, e.clientY);
      drag = null;
    } else if (pointers.size === 1) {
      const [p] = [...pointers.values()];
      drag = { sx: p.x, sy: p.y, start: toSvg(p.x, p.y, svg.getScreenCTM().inverse()), view: { ...view }, inv: svg.getScreenCTM().inverse(), moved: true };
    }
  };
  svg.addEventListener("pointerup", release);
  svg.addEventListener("pointercancel", release);

  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const anchor = toSvg(e.clientX, e.clientY, svg.getScreenCTM().inverse());
    zoomAbout(anchor, Math.exp(e.deltaY * 0.0015));
    applyView();
  }, { passive: false });

  function tapAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const army = el?.closest?.("[data-army]");
    if (army) return onTap({ type: "army", id: army.dataset.army });
    const district = el?.closest?.("[data-district]");
    onTap(district ? { type: "district", id: district.dataset.district } : null);
  }

  function zoomBy(ratio) {
    zoomAbout({ x: view.x + view.w / 2, y: view.y + view.h / 2 }, ratio);
    applyView();
  }

  function focus(districtId) {
    const [x, y] = state.districts[districtId].pos;
    view.x = x - view.w / 2;
    view.y = y - view.h / 2;
    clampPan();
    applyView();
  }

  function reset() {
    Object.assign(view, { x: MAP_BOUNDS.x - 40, y: MAP_BOUNDS.y - 40, w: MAP_BOUNDS.w + 80, h: MAP_BOUNDS.h + 80 });
    applyView();
  }

  // ---------- playback effects ----------

  function ensureVisible(did) {
    const [x, y] = state.districts[did].pos;
    const m = 80;
    if (x < view.x + m || x > view.x + view.w - m || y < view.y + m || y > view.y + view.h - m) focus(did);
  }

  // kind: battle | capture | built | landing | rebellion; tone: good | bad | ""
  function flash(did, kind, text, tone = "", factionId = null, building = null) {
    const [x, y] = state.districts[did].pos;
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    node.setAttribute("class", `fx fx-${kind} ${tone}`);
    const col = factionId ? factionColour(state, factionId) : null;
    const glyph = kind === "built" ? `<use href="#i-${building}" x="-14" y="-14" width="28" height="28" class="fx-icon"/>`
      : kind === "landing" ? `<use href="#i-eagle" x="-18" y="-18" width="36" height="36" class="fx-icon"/>`
      : kind === "works" ? `<use href="#i-fortification" x="-16" y="-16" width="32" height="32" class="fx-icon"/>`
      : kind === "siege" ? `<use href="#i-fortification" x="-16" y="-16" width="32" height="32" class="fx-icon"/>`
      : kind === "objective" ? `<use href="#i-trophy" x="-16" y="-16" width="32" height="32" class="fx-icon"/>`
      : kind === "raid" ? `<use href="#i-torch" x="-16" y="-16" width="32" height="32" class="fx-icon"/>`
      : kind === "capture" ? `<path d="M-2 18V-22h22l-6 8 6 8H-2" fill="${col}" stroke="#1d1b16" stroke-width="2"/>`
      : `<use href="#i-armies" x="-18" y="-18" width="36" height="36" class="fx-icon"/>`;
    node.innerHTML = `<g transform="translate(${x} ${y - 20})">
      ${kind === "battle" || kind === "landing" || kind === "raid" || kind === "objective" ? `<circle r="10" class="fx-ring"/><circle r="10" class="fx-ring late"/>` : ""}
      <circle r="26" class="fx-disc"/>${glyph}
      <text y="50" class="fx-text">${text}</text></g>`;
    svg.querySelector("#fx").appendChild(node);
    setTimeout(() => node.classList.add("out"), 1300);
    setTimeout(() => node.remove(), 1900);
  }

  render(state, selection);
  return { ensureVisible, flash, hasArmy: (id) => units.has(id), animateArmy: (id, path) => units.animatePath(id, path), ghostMarch: (army, path) => units.ghostMarch(state, army, path), render, zoomBy, focus, reset };
}

// District zoom: each finished building as a small plaque around the settlement, with
// loyalty and prosperity gauges for owned districts.
const SLOTS = [[-92, 34], [92, 40], [-100, -22], [104, -30], [-60, 96], [62, 100], [0, -70]];
// Works in progress: a timber scaffold beside the settlement with a progress bar; Roman works
// are framed in red and gold so their spread reads at a glance.
function worksSvg(state, d, x, y) {
  return d.construction.slice(0, 2).map((job, i) => {
    const done = Math.min(1, job.progress / BALANCE.buildings[job.building].seasons);
    const roman = job.roman || d.owner === "rome";
    const wx = x - 92 - i * 40, wy = y + 6;
    return `<g class="works ${roman ? "roman" : ""}" transform="translate(${wx} ${wy})" pointer-events="none">
      <path d="M-12 14V-14M12 14V-14M-12 -6H12M-12 4H12M-12 14L12 -14" class="scaffold"/>
      <use href="#i-${job.building}" x="-9" y="-30" width="18" height="18" class="works-icon"/>
      <rect x="-14" y="18" width="28" height="5" rx="2" class="gauge-bg"/><rect x="-14" y="18" width="${28 * done}" height="5" rx="2" class="works-bar"/>
    </g>`;
  }).join("");
}

// Smoke over a raided district: its supply is cut for now.
function smokeSvg(x, y) {
  return `<g class="smoke" transform="translate(${x + 40} ${y - 40})" pointer-events="none">
    <circle r="10" cx="0" cy="0"/><circle r="14" cx="8" cy="-16"/><circle r="18" cx="2" cy="-36"/>
    <path d="M-6 8q6-10 0-16q8 4 6 14z" class="ember"/></g>`;
}

// A siege camp: a ring of stakes and tents round the town in the besieger's colour, with the
// town's remaining stores as pips.
function siegeSvg(d, x, y, colour) {
  const s = d.siege;
  const tents = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    const tx = x + Math.cos(a) * 78, ty = y - 4 + Math.sin(a) * 46;
    return `<path d="M${tx - 8} ${ty + 6}l8 -13l8 13z" fill="${colour}" stroke="#1d1b16" stroke-width="1.2"/>`;
  }).join("");
  const pips = Array.from({ length: s.max }, (_, i) => `<rect x="${x - s.max * 9 + i * 18}" y="${y + 92}" width="13" height="13" rx="3" class="${i < s.supplies ? "stores on" : "stores"}"/>`).join("");
  return `<g class="siege" pointer-events="none">
    <ellipse cx="${x}" cy="${y - 4}" rx="72" ry="42" fill="none" stroke="${colour}" stroke-width="4" stroke-dasharray="2 7" stroke-linecap="round"/>
    ${tents}
    <text x="${x}" y="${y + 120}" class="siege-label">Besieged</text>${pips}</g>`;
}

function infrastructureSvg(d, x, y) {
  const plaques = d.buildings.slice(0, SLOTS.length).map((b, i) => {
    const [dx, dy] = SLOTS[i];
    return `<g transform="translate(${x + dx} ${y + dy})"><circle r="15" class="plaque"/>
      <use href="#i-${b}" x="-10" y="-10" width="20" height="20" class="plaque-icon"/></g>`;
  }).join("");
  const gauges = d.owner ? `<g transform="translate(${x - 40} ${y + 90})">
      <rect width="80" height="5" rx="2" class="gauge-bg"/><rect width="${0.8 * d.loyalty}" height="5" rx="2" class="gauge-loyalty"/>
      <rect y="8" width="80" height="5" rx="2" class="gauge-bg"/><rect y="8" width="${0.8 * (d.prosperity ?? 50)}" height="5" rx="2" class="gauge-prosperity"/></g>` : "";
  return `<g class="z-district">${plaques}${gauges}</g>`;
}

// "Y3 Sp" for a turn number (turn 1 = Year 1 Spring)
function seasonShort(turn) {
  const y = Math.floor((turn - 1) / 4) + 1;
  return `Y${y} ${["Sp", "Su", "Au", "Wi"][(turn - 1) % 4]}`;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
