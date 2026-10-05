// ui/map.js
// Owns the SVG campaign map: district cells, connections, roads, labels, army markers,
// selection highlight and camera (drag to pan, pinch or wheel to zoom, tap to select).
// Reads state only; taps are reported through the onTap callback.

import { BALANCE } from "../config/balance.js";
import { settlementTier } from "../simulation/economy.js";
import { MAP_BOUNDS, coastline, pathFrom, voronoiCells } from "./geometry.js";
import { TERRAIN_ICON, TIER_ICON, esc, factionColour, num } from "./format.js";

const ZOOM_MIN_W = 280;
const ZOOM_MAX_W = 1500;
const TAP_SLOP_PX = 8;

export function createMap(svg, state, { onTap }) {
  const ids = Object.keys(state.districts);
  const cells = voronoiCells(ids.map((id) => state.districts[id].pos));
  const cellPath = Object.fromEntries(ids.map((id, i) => [id, pathFrom(cells[i])]));
  const coast = pathFrom(coastline());

  const view = { x: MAP_BOUNDS.x - 40, y: MAP_BOUNDS.y - 40, w: MAP_BOUNDS.w + 80, h: MAP_BOUNDS.h + 80 };
  const aspect = view.h / view.w;
  let selection = null;

  svg.innerHTML = `
    <defs>
      <clipPath id="island"><path d="${coast}"/></clipPath>
      <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="var(--critical)"/>
      </marker>
      <pattern id="waves" width="40" height="22" patternUnits="userSpaceOnUse">
        <path d="M0 11 q10 -6 20 0 t20 0" fill="none" stroke="var(--sea-line)" stroke-width="1.5"/>
      </pattern>
    </defs>
    <rect x="-2000" y="-2000" width="5000" height="5200" fill="var(--sea)"/>
    <rect x="-2000" y="-2000" width="5000" height="5200" fill="url(#waves)"/>
    <path d="${coast}" fill="var(--land)" stroke="var(--coast)" stroke-width="10" stroke-linejoin="round"/>
    <g id="cells" clip-path="url(#island)"></g>
    <g id="links"></g>
    <g id="labels"></g>
    <g id="armies"></g>
    <g id="sel" clip-path="url(#island)" pointer-events="none"></g>
    <g id="rome" pointer-events="none"></g>
    <text x="520" y="1225" class="sea-label">The Narrow Sea · Rome lies beyond</text>`;

  // overlay: { reach: { districtId: { kind } }, threats: [{ from, to }], armies: [visible armies] }
  function render(s, sel, overlay = {}) {
    state = s;
    selection = sel;
    const g = (id) => svg.querySelector(`#${id}`);
    const reach = overlay.reach || {};

    g("cells").innerHTML = ids.map((id) => {
      const d = state.districts[id];
      const r = reach[id] ? ` reach-${reach[id].kind}` : "";
      return `<path data-district="${id}" d="${cellPath[id]}" fill="${factionColour(state, d.owner)}"
        class="cell ${d.owner ? "" : "neutral"}${d.stage !== "Integrated" ? " occupied" : ""}${r}"/>`;
    }).join("");

    g("links").innerHTML = state.connections.map((c) => {
      const [a, b] = [state.districts[c.a].pos, state.districts[c.b].pos];
      const cls = c.road ? "road" : c.roadProgress !== null ? "road building" : "link";
      return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" class="${cls}"/>`;
    }).join("") + (overlay.threats || []).map((t) => {
      const b = state.districts[t.to].pos;
      const a = t.from ? state.districts[t.from].pos : [b[0] + 60, b[1] + 160]; // from the sea
      const mx = a[0] + (b[0] - a[0]) * 0.8, my = a[1] + (b[1] - a[1]) * 0.8;
      return `<line x1="${a[0]}" y1="${a[1]}" x2="${mx}" y2="${my}" class="threat" marker-end="url(#arrow)"/>`;
    }).join("");

    g("labels").innerHTML = ids.map((id) => {
      const d = state.districts[id];
      const [x, y] = d.pos;
      const tier = settlementTier(d).id;
      const badges = [];
      if (d.construction.length) badges.push("🚧");
      if (!d.owner && d.garrison) badges.push("🗡️");
      if (d.owner && d.stage !== "Integrated") badges.push("⛓️");
      if (d.owner && d.loyalty < BALANCE.loyalty.unrest) badges.push("🔥");
      return `<g data-district="${id}">
        <circle cx="${x}" cy="${y}" r="30" class="seat"/>
        <text x="${x}" y="${y + 9}" class="icon">${TIER_ICON[tier]}</text>
        <text x="${x - 36}" y="${y - 12}" class="badge">${TERRAIN_ICON[d.terrain]}</text>
        ${badges.map((b, i) => `<text x="${x + 38}" y="${y - 10 + i * 24}" class="badge">${b}</text>`).join("")}
        <text x="${x}" y="${y + 56}" class="name">${esc(d.name)}</text>
        <text x="${x}" y="${y + 78}" class="pop">${num(d.population)}</text>
      </g>`;
    }).join("");

    const byDistrict = {};
    for (const a of overlay.armies || state.armies) (byDistrict[a.districtId] ||= []).push(a);
    g("armies").innerHTML = Object.entries(byDistrict).map(([did, list]) => {
      const [x, y] = state.districts[did].pos;
      return list.map((a, i) => {
        const troops = a.formations.reduce((n, f) => n + f.troops, 0);
        const ax = x + 64 + (i % 2) * 8, ay = y - 34 + i * 36;
        const on = selection?.type === "army" && selection.id === a.id ? " on" : "";
        const mine = a.factionId === state.playerFactionId;
        const spent = mine && a.movesLeft <= 0 ? " spent" : "";
        return `<g data-army="${a.id}" class="army${on}${spent}">
          <rect x="${ax - 30}" y="${ay - 16}" width="60" height="32" rx="7" fill="${factionColour(state, a.factionId)}"/>
          <text x="${ax}" y="${ay + 6}" class="army-text">${a.factionId === "rome" ? "🦅" : "⚔"}${num(troops)}</text>
        </g>`;
      }).join("");
    }).join("");

    const rome = state.rome;
    const entry = state.districts[BALANCE.rome.entryDistrict].pos;
    g("sel").innerHTML = selection?.type === "district" ? `<path d="${cellPath[selection.id]}" class="selected"/>` : "";
    svg.querySelector("#rome").innerHTML = rome.stage === "warning"
      ? `<line x1="${entry[0] + 80}" y1="${entry[1] + 200}" x2="${entry[0] + 20}" y2="${entry[1] + 50}" class="threat rome" marker-end="url(#arrow)"/>
         <text x="${entry[0] + 90}" y="${entry[1] + 230}" class="rome-label">🦅 Rome lands in ${rome.countdown}</text>` : "";
    applyView();
  }

  // ---------- camera ----------

  function applyView() {
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
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

  render(state, selection);
  return { render, zoomBy, focus, reset };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
