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
      </g>`;
    }).join("");

    units.update(state, overlay.armies || state.armies, overlay.ghosts || [], selection, (t) => seasonShort(t));

    const rome = state.rome;
    const entry = state.districts[BALANCE.rome.entryDistrict].pos;
    g("sel").innerHTML = (selection?.type === "district" ? `<path d="${cellPath[selection.id]}" class="selected"/>` : "") +
      (overlay.highlight ? `<path d="${cellPath[overlay.highlight]}" class="pulse"/>` : "");
    svg.querySelector("#rome").innerHTML = rome.stage === "warning"
      ? `<line x1="${entry[0] + 80}" y1="${entry[1] + 200}" x2="${entry[0] + 20}" y2="${entry[1] + 50}" class="threat rome" marker-end="url(#arrow)"/>
         <text x="${entry[0] + 90}" y="${entry[1] + 230}" class="rome-label">Rome lands in ${rome.countdown}</text>` : "";
    applyView();
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
      : kind === "capture" ? `<path d="M-2 18V-22h22l-6 8 6 8H-2" fill="${col}" stroke="#1d1b16" stroke-width="2"/>`
      : `<use href="#i-armies" x="-18" y="-18" width="36" height="36" class="fx-icon"/>`;
    node.innerHTML = `<g transform="translate(${x} ${y - 20})">
      ${kind === "battle" || kind === "landing" ? `<circle r="10" class="fx-ring"/><circle r="10" class="fx-ring late"/>` : ""}
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
