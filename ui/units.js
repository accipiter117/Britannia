// ui/units.js
// Owns the armies' presence on the board: painted miniature stands whose figures show what a
// host is made of (spears, swordsmen, javelins, legionaries) and roughly how big it is, with
// the standard, troop plaque, movement pips, stance and supply marks. Each army keeps one
// persistent SVG node, so a change of district animates as a march. Last-seen enemy hosts
// stay on the board as faded ghosts.

import { BALANCE } from "../config/balance.js";
import { armyTroops } from "../simulation/campaign.js";
import { isDugIn, orderOf } from "../simulation/orders.js";
import { emblemSvg } from "./art.js";
import { factionColour, num } from "./format.js";

const STEP_MS = 520;
const SCALE = 1.8;               // miniatures are drawn at this size on the board
const HOME = [108, -16];          // offset of the first stand from its district's settlement

export function createUnitLayer(group, districtPos) {
  const nodes = new Map();   // armyId -> <g>
  const intents = document.createElementNS("http://www.w3.org/2000/svg", "g"); // raid arrows
  intents.setAttribute("class", "intents");
  group.appendChild(intents);
  const ghosts = new Map();  // armyId -> <g>
  let seasonLabel = (turn) => `${turn}`;

  function place(node, [x, y], instant = false) {
    if (instant) node.style.transition = "none";
    node.style.transform = `translate(${x}px, ${y}px)`;
    if (instant) { node.getBoundingClientRect(); node.style.transition = ""; }
  }

  // armies in the same district fan out around the settlement: one column for a pair, a
  // tighter two-column muster (drawn smaller) for a crowd
  function slots(list) {
    const out = new Map();
    if (list.length <= 2) {
      list.forEach((a, i) => out.set(a.id, [HOME[0] + (i % 2) * 26, HOME[1] + i * 62 - (list.length - 1) * 26]));
      return out;
    }
    const rows = Math.ceil(list.length / 2);
    list.forEach((a, i) => out.set(a.id, [HOME[0] - 10 + (i % 2) * 92, HOME[1] + Math.floor(i / 2) * 44 - (rows - 1) * 22]));
    return out;
  }

  function update(state, armies, ghostList, selection, labelFor) {
    seasonLabel = labelFor || seasonLabel;
    const byDistrict = {};
    for (const a of armies) (byDistrict[a.districtId] ||= []).push(a);
    const seen = new Set();
    for (const [did, list] of Object.entries(byDistrict)) {
      const [x, y] = districtPos(did);
      const offs = slots(list);
      for (const a of list) {
        seen.add(a.id);
        let node = nodes.get(a.id);
        const fresh = !node;
        if (fresh) {
          node = document.createElementNS("http://www.w3.org/2000/svg", "g");
          node.setAttribute("class", "unit");
          node.dataset.army = a.id;
          group.appendChild(node);
          nodes.set(a.id, node);
        }
        node.innerHTML = miniature(state, a, {
          selected: selection?.type === "army" && selection.id === a.id,
          mine: a.factionId === state.playerFactionId,
          scale: list.length > 2 ? SCALE * 0.72 : SCALE,
        });
        const [ox, oy] = offs.get(a.id);
        place(node, [x + ox, y + oy], fresh);
        node.classList.remove("leaving");
      }
    }
    // a raid in preparation: a burning arrow from the host to its target
    intents.innerHTML = armies.map((a) => {
      const o = orderOf(a);
      if (o?.kind !== "raid" || !o.target) return "";
      const [x1, y1] = districtPos(a.districtId), [x2, y2] = districtPos(o.target);
      const sx = x1 + HOME[0] * 0.6, sy = y1 + HOME[1];
      const mx = (sx + x2) / 2 + (y2 - sy) * 0.18, my = (sy + y2) / 2 - (x2 - sx) * 0.18;
      const mine = a.factionId === state.playerFactionId;
      return `<g class="raid-intent ${mine ? "mine" : "foe"}"><path d="M${sx} ${sy}Q${mx} ${my} ${x2} ${y2}" marker-end="url(#raid-head)"/>
        <g transform="translate(${mx} ${my})"><circle r="15"/><path d="M-5 6q0-11 5-13q5 2 5 13q-5 3-10 0z" class="flame"/></g></g>`;
    }).join("");
    for (const [id, node] of nodes) {
      if (seen.has(id)) continue;
      nodes.delete(id);
      node.classList.add("leaving");
      setTimeout(() => node.remove(), 450);
    }
    // ghosts: last-seen positions of hosts now out of sight
    const keep = new Set();
    for (const gh of ghostList) {
      keep.add(gh.id);
      let node = ghosts.get(gh.id);
      if (!node) {
        node = document.createElementNS("http://www.w3.org/2000/svg", "g");
        node.setAttribute("class", "unit ghost");
        group.prepend(node);
        ghosts.set(gh.id, node);
      }
      node.innerHTML = ghostSvg(state, gh, seasonLabel(gh.turn));
      const [x, y] = districtPos(gh.districtId);
      place(node, [x - 110, y + 24], true);
    }
    for (const [id, node] of ghosts) if (!keep.has(id)) { node.remove(); ghosts.delete(id); }
  }

  // March a token along district positions, one step at a time.
  function animatePath(armyId, path) {
    const node = nodes.get(armyId);
    if (!node || path.length < 2) return Promise.resolve();
    return new Promise((resolve) => {
      path.slice(1).forEach((did, i) => setTimeout(() => {
        const [x, y] = districtPos(did);
        place(node, [x + HOME[0], y + HOME[1]]);
        if (i === path.length - 2) setTimeout(resolve, STEP_MS);
      }, i * STEP_MS));
    });
  }

  // Briefly show a token for an army that is not (or no longer) on the board, e.g. a host
  // destroyed this season, marching from A to B.
  function ghostMarch(state, army, path) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "g");
    node.setAttribute("class", "unit");
    node.innerHTML = miniature(state, army, { selected: false, mine: false });
    group.appendChild(node);
    const [x0, y0] = districtPos(path[0]);
    place(node, [x0 + HOME[0], y0 + HOME[1]], true);
    return new Promise((resolve) => {
      path.slice(1).forEach((did, i) => setTimeout(() => {
        const [x, y] = districtPos(did);
        place(node, [x + HOME[0], y + HOME[1]]);
      }, i * STEP_MS));
      setTimeout(() => { node.classList.add("leaving"); setTimeout(() => { node.remove(); resolve(); }, 300); }, path.length * STEP_MS);
    });
  }

  function positionOf(armyId) {
    return nodes.get(armyId)?.style.transform;
  }

  return { update, animatePath, ghostMarch, positionOf, has: (id) => nodes.has(id) };
}

// ---------- the miniature ----------

const FIG_SPACING = 9;

// Split a host into a handful of figures, by formation share, at least one per formation.
function figures(army) {
  const total = armyTroops(army) || 1;
  const n = Math.max(1, Math.min(9, Math.round(total / 130)));
  const list = [];
  const order = ["legionaries", "warriors", "levies", "skirmishers"];
  const forms = [...army.formations].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  let left = n;
  forms.forEach((f, i) => {
    const share = i === forms.length - 1 ? left : Math.max(1, Math.round((f.troops / total) * n));
    const take = Math.min(left - (forms.length - 1 - i > 0 ? 1 : 0), share);
    for (let k = 0; k < Math.max(1, take) && left > 0; k++) { list.push(f.type); left--; }
  });
  return list;
}

function figureSvg(type, x, y, colour) {
  const skin = "#d9b48a";
  const tunic = colour;
  const body = `<path d="M${x - 3} ${y + 7}v-6q0-3 3-3t3 3v6z" fill="${tunic}" stroke="#1e1a12" stroke-width="0.6"/>
    <circle cx="${x}" cy="${y - 4.5}" r="2.4" fill="${skin}" stroke="#1e1a12" stroke-width="0.5"/>`;
  if (type === "legionaries") {
    return body + `<path d="M${x - 2.6} ${y - 6}q2.6-3 5.2 0" fill="#9a9a96" stroke="#2a2a26" stroke-width="0.5"/>
      <path d="M${x} ${y - 8}v-2.5" stroke="#b8322a" stroke-width="1.6"/>
      <rect x="${x - 4.6}" y="${y - 2}" width="5.6" height="8.5" rx="1" fill="${colour}" stroke="#f2cf5b" stroke-width="0.9"/>
      <path d="M${x + 3} ${y + 1}l4 -9" stroke="#bfbfb8" stroke-width="0.9"/>`;
  }
  if (type === "warriors") {
    return body + `<path d="M${x + 3} ${y + 2}l4 -7" stroke="#cfcfc8" stroke-width="1.2"/>
      <circle cx="${x - 2.5}" cy="${y + 2}" r="3.8" fill="${colour}" stroke="#2a2418" stroke-width="0.7"/>
      <circle cx="${x - 2.5}" cy="${y + 2}" r="1.1" fill="#e6d8a8"/>`;
  }
  if (type === "skirmishers") {
    return body + `<path d="M${x + 2} ${y + 6}l5 -14M${x - 3} ${y + 5}l3 -10" stroke="#a8875a" stroke-width="0.8"/>`;
  }
  // levies: long spear and a small shield
  return body + `<path d="M${x + 2.5} ${y + 7}V${y - 12}" stroke="#8a6a3a" stroke-width="0.9"/><path d="M${x + 2.5} ${y - 12}l-1 2.4h2z" fill="#c9c9c2"/>
    <circle cx="${x - 2.2}" cy="${y + 2.5}" r="2.8" fill="${colour}" stroke="#2a2418" stroke-width="0.6"/>`;
}

function miniature(state, army, { selected, mine, scale = SCALE }) {
  const f = state.factions[army.factionId];
  const colour = factionColour(state, army.factionId);
  const figs = figures(army);
  const rows = figs.length > 5 ? [figs.slice(0, Math.ceil(figs.length / 2)), figs.slice(Math.ceil(figs.length / 2))] : [figs];
  const roman = f?.culture === "roman";
  const supplyBad = army.supply === "Starving" ? "#e2735f" : army.supply === "Strained" ? "#e0a83a" : null;
  const full = Math.round(BALANCE.movement.basePoints);
  const pips = mine ? Array.from({ length: Math.max(full, army.movesLeft) }, (_, i) =>
    `<circle cx="${-10 + i * 7}" cy="27" r="2.4" class="${i < army.movesLeft ? "pip on" : "pip"}"/>`).join("") : "";
  const stance = { Defensive: "M-3 -4h6v4q0 4-3 5q-3-1-3-5z", Aggressive: "M-4 3l4-7l4 7", "Forced March": "M-4 -3l3 3l-3 3M1 -3l3 3l-3 3" }[army.stance];
  const live = army.formations ? orderOf(army) : null;
  const order = live ? ORDER_MARK[live.kind] : "";
  const dug = army.formations && isDugIn(army);
  let figsSvg = "";
  rows.forEach((row, r) => {
    const y = r === 0 && rows.length > 1 ? -4 : 4;
    const start = -((row.length - 1) * FIG_SPACING) / 2 - 4;
    row.forEach((t, i) => { figsSvg += figureSvg(t, start + i * FIG_SPACING + (r ? 4 : 0), y, colour); });
  });
  return `<g transform="scale(${scale})">
    ${selected ? `<ellipse cx="0" cy="10" rx="40" ry="15" class="unit-glow"/>` : ""}
    <ellipse cx="3" cy="13" rx="34" ry="10" fill="#000" opacity="0.32"/>
    <ellipse cx="0" cy="10" rx="33" ry="9.5" fill="#4a3824" stroke="${supplyBad || "#2a1f12"}" stroke-width="${supplyBad ? 2.5 : 1}"/>
    <ellipse cx="0" cy="8.5" rx="31" ry="8" fill="#6b5236"/>
    ${dug ? `<path d="M-36 14q36 14 72 0l2 4q-38 16-76 0z" fill="#5b4527" stroke="#2a1f12" stroke-width="0.8"/>${[-30, -20, -10, 0, 10, 20, 30].map((px) => `<path d="M${px} ${17 + Math.abs(px) * -0.12}l2 -9l2 9z" fill="#8a6a3e" stroke="#2a1f12" stroke-width="0.5"/>`).join("")}` : ""}
    <g transform="translate(26 0)">
      <path d="M0 10V-34" stroke="#3a2a18" stroke-width="2"/>
      ${roman
        ? `<path d="M-6 -38q6-6 12 0" stroke="#f2cf5b" stroke-width="2" fill="none"/><rect x="-7" y="-34" width="14" height="12" rx="1.5" fill="${colour}" stroke="#f2cf5b" stroke-width="1"/>`
        : `<path d="M0 -34h14v12l-7-3l-7 3z" fill="${colour}" stroke="#1e1a12" stroke-width="0.8"/>`}
      <g transform="translate(${roman ? 0 : 7} -28) scale(0.7)">${emblemSvg(f, roman)}</g>
    </g>
    ${figsSvg}
    ${stance ? `<g transform="translate(-36 -4)"><circle r="6.5" class="unit-mark"/><path d="${stance}" class="unit-mark-glyph"/></g>` : ""}
    ${order}
    <rect x="-20" y="15" width="40" height="13" rx="3.5" class="unit-plaque"/>
    <text y="25" class="unit-count">${num(armyTroops(army))}</text>
    ${pips}</g>`;
}

const ORDER_MARK = {
  raid: `<g transform="translate(-36 12)"><circle r="6.5" class="unit-mark raid"/><path d="M-3 3q0-6 3-7q3 1 3 7q-3 2-6 0z" class="unit-mark-glyph"/></g>`,
  dig: `<g transform="translate(-36 12)"><circle r="6.5" class="unit-mark"/><path d="M-4 2h8M-3 -1h6M-2 -4h4" class="unit-mark-glyph"/></g>`,
  rest: `<g transform="translate(-36 12)"><circle r="6.5" class="unit-mark"/><path d="M-3 -3h5l-5 6h5" class="unit-mark-glyph"/></g>`,
};

function ghostSvg(state, gh, when) {
  const colour = factionColour(state, gh.factionId);
  return `<g transform="scale(${SCALE})"><ellipse cx="0" cy="10" rx="30" ry="8.5" fill="none" stroke="${colour}" stroke-dasharray="4 3" stroke-width="1.6"/>
    <path d="M18 8V-24" stroke="${colour}" stroke-width="1.6"/><path d="M18 -24h11v9l-5.5-2.5l-5.5 2.5z" fill="${colour}" opacity="0.7"/>
    <text y="4" class="ghost-count">~${num(gh.troops)}</text>
    <text y="27" class="ghost-when">seen ${when}</text></g>`;
}
