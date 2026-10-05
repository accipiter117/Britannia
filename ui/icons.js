// ui/icons.js
// Owns the hand-drawn UI icon set: one SVG sprite injected once, and icon(name) for markup.
// Woodcut style: 24px grid, round strokes in currentColor, a warm fill for solid parts.
// Replaces emoji so the game looks the same on every device.

const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
const F = 'fill="var(--ico-fill, currentColor)"';

const SYMBOLS = {
  // resources
  people: `<circle cx="9" cy="8" r="3" ${S}/><path d="M3.5 19c.5-3.5 2.6-5.5 5.5-5.5s5 2 5.5 5.5" ${S}/><circle cx="16.5" cy="9" r="2.4" ${S}/><path d="M15 13.6c2.8-.3 5 1.6 5.5 5" ${S}/>`,
  food: `<path d="M12 21V9" ${S}/><path d="M12 9c-2-1-3-3-3-5 2 1 3 3 3 5zm0 0c2-1 3-3 3-5-2 1-3 3-3 5zM12 14c-2.4-.6-4-2.4-4.3-4.6 2.3.4 4 2.2 4.3 4.6zm0 0c2.4-.6 4-2.4 4.3-4.6-2.3.4-4 2.2-4.3 4.6zM12 19c-2.4-.6-4-2.4-4.3-4.6 2.3.4 4 2.2 4.3 4.6zm0 0c2.4-.6 4-2.4 4.3-4.6-2.3.4-4 2.2-4.3 4.6z" ${S}/>`,
  timber: `<path d="M4 9h12M4 15h12" ${S}/><ellipse cx="17" cy="9" rx="2.5" ry="3" ${S}/><ellipse cx="17" cy="15" rx="2.5" ry="3" ${S}/><path d="M4 6v12" ${S}/><circle cx="17" cy="9" r=".8" ${F}/><circle cx="17" cy="15" r=".8" ${F}/>`,
  materials: `<path d="M3 19h18M4 19v-5h7v5M11 19v-5h8v5M7 14V9h8v5" ${S}/><path d="M9 9V6h4" ${S}/>`,
  wealth: `<circle cx="12" cy="12" r="8" ${S}/><path d="M8 13a4 4 0 0 0 8 0" ${S}/><circle cx="8" cy="12" r="1.2" ${F}/><circle cx="16" cy="12" r="1.2" ${F}/>`,
  // seasons
  spring: `<path d="M12 21v-9" ${S}/><path d="M12 13c-4 0-6-2.5-6-6 3.5 0 6 2 6 6zm0-2c0-3.5 2.5-6 6-6 0 3.5-2.5 6-6 6z" ${S}/>`,
  summer: `<circle cx="12" cy="12" r="4" ${S}/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" ${S}/>`,
  autumn: `<path d="M5 19C5 10 10 5 19 5c0 9-5 14-14 14z" ${S}/><path d="M5 19l9-9M9 15h4M11 13V9" ${S}/>`,
  winter: `<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5" ${S}/>`,
  // settlements
  village: `<path d="M3 13L8 7l5 6M4.5 13v5h7v-5M13 15l4-4.5 4 4.5M14 15v3h6v-3" ${S}/>`,
  town: `<path d="M5 12l5-6 5 6M6 12v5h8v-5M14 13l3.5-4 3.5 4M15 13v4h5" ${S}/><path d="M2 20h20" ${S}/><path d="M3 20v-3M6 20v-3M18 20v-3M21 20v-3" ${S}/>`,
  major_town: `<path d="M3 11l4-5h10l4 5M4 11v8h16v-8" ${S}/><path d="M10 19v-4h4v4M7 6l-1-2M17 6l1-2" ${S}/>`,
  // terrain
  fertile: `<path d="M3 20h18M6 20c0-4 1-8 3-11M12 20c0-5 0-9 0-12M18 20c0-4-1-8-3-11" ${S}/><path d="M9 9l-2-2M12 8V5M15 9l2-2" ${S}/>`,
  forest: `<path d="M12 3l-5 8h3l-4 6h12l-4-6h3z" ${S}/><path d="M12 17v4" ${S}/>`,
  hills: `<path d="M2 19l6-9 4 5 3-4 7 8z" ${S}/><path d="M6.5 12.5l1.5-1.5" ${S}/>`,
  plains: `<path d="M3 19h18M6 19l-1-4M7 19l1-5M15 19l-1-3M16 19l1-5M17 19l2-3" ${S}/>`,
  marsh: `<path d="M3 17q3-2 6 0t6 0 6 0M6 14l-1-6M8 14l1-8M16 14l-1-5M18 14l1-7" ${S}/>`,
  coast: `<path d="M3 9q3-2 6 0t6 0 6 0M3 14q3-2 6 0t6 0 6 0M3 19q3-2 6 0t6 0 6 0" ${S}/>`,
  // buildings
  farm: `<path d="M3 18l4-8h10l4 8z" ${S}/><path d="M8 18l2-8M13 18l1-8M18 18l-2-8" ${S}/>`,
  granary: `<path d="M5 10l7-6 7 6M6 10v7h12v-7M6 20l2-3M18 20l-2-3" ${S}/><path d="M10 13h4" ${S}/>`,
  timber_camp: `<path d="M5 20L15 6M13 4l5 3-3 4-4-3z" ${S}/>`,
  mine: `<path d="M12 9L5 20M4 7q8-5 16 0" ${S}/><path d="M14 17l3 3M16 15l3 3" ${S}/>`,
  workshop: `<path d="M4 20l9-9M11 5l5-1 4 4-1 5-3 1-6-6z" ${S}/>`,
  warrior_hall: `<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" ${S}/><path d="M12 8v7M9 11.5h6" ${S}/>`,
  fortification: `<path d="M3 20h18M4 20v-9l2-2 2 2v-2l2-2 2 2v-2l2-2 2 2v2l2-2 2 2v9" ${S}/><path d="M10 20v-4h4v4" ${S}/>`,
  market: `<path d="M12 4v16M8 20h8M5 7h14M5 7l-2 6h4zM19 7l-2 6h4z" ${S}/>`,
  harbour: `<path d="M12 4v14M8 7h8M5 13q0 6 7 6t7-6M3 13h4M17 13h4" ${S}/><circle cx="12" cy="4" r="1.5" ${S}/>`,
  sacred_site: `<path d="M6 20V9M18 20V9M4 9h16M12 20v-7" ${S}/><circle cx="12" cy="10" r="2" ${S}/><path d="M4 20h16" ${S}/>`,
  supply_depot: `<path d="M4 9l8-4 8 4v9l-8 4-8-4z" ${S}/><path d="M4 9l8 4 8-4M12 13v9" ${S}/>`,
  // navigation and actions
  realm: `<path d="M4 17l2-9 4 4 2-6 2 6 4-4 2 9z" ${S}/><path d="M4 20h16" ${S}/>`,
  armies: `<path d="M5 19L18 6M19 19L6 6M15 5h4v4M9 5H5v4" ${S}/>`,
  diplomacy: `<circle cx="9" cy="12" r="5" ${S}/><circle cx="15" cy="12" r="5" ${S}/>`,
  more: `<path d="M7 4h11v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2h12" ${S}/><path d="M7 4a2 2 0 0 0-2 2v10M10 8h5M10 11h5" ${S}/>`,
  move: `<circle cx="12" cy="12" r="8.5" ${S}/><path d="M12 6l2.5 6-2.5 6-2.5-6z" ${S}/><circle cx="12" cy="12" r="1" ${F}/>`,
  sword: `<path d="M14.5 4H20v5.5L10 19.5 4.5 14z" ${S}/><path d="M7 12l5 5M4 20l2-2" ${S}/>`,
  eagle: `<path d="M3 9q4 0 9 4 5-4 9-4-2 4-6 5l-3 5-3-5q-4-1-6-5z" ${S}/><circle cx="12" cy="8" r="1.8" ${S}/>`,
  warning: `<path d="M12 4l9 16H3z" ${S}/><path d="M12 10v4" ${S}/><circle cx="12" cy="17" r="1" ${F}/>`,
  advice: `<path d="M9 17h6M10 20h4M12 3a6 6 0 0 0-3.5 10.9V17h7v-3.1A6 6 0 0 0 12 3z" ${S}/>`,
  sound_on: `<path d="M4 10h4l5-4v12l-5-4H4z" ${S}/><path d="M16 9q2 3 0 6M18.5 7q3.5 5 0 10" ${S}/>`,
  sound_off: `<path d="M4 10h4l5-4v12l-5-4H4z" ${S}/><path d="M16 10l5 5M21 10l-5 5" ${S}/>`,
  trophy: `<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" ${S}/>`,
  skull: `<path d="M5 11a7 7 0 0 1 14 0v3l-2 1v4H7v-4l-2-1z" ${S}/><circle cx="9.5" cy="12" r="1.6" ${F}/><circle cx="14.5" cy="12" r="1.6" ${F}/><path d="M10 19v-2M14 19v-2" ${S}/>`,
  dove: `<path d="M4 14q5 0 8-5 2-3 6-3l2 2-3 1q0 7-8 9l-5 2 2-3z" ${S}/>`,
  crown: `<path d="M4 18l1-10 4 4 3-6 3 6 4-4 1 10z" ${S}/>`,
  candle: `<path d="M9 21V11h6v10M12 11V9" ${S}/><path d="M12 4q2 2 0 4-2-2 0-4z" ${S}/>`,
  scroll: `<path d="M7 4h11v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2h12" ${S}/><path d="M7 4a2 2 0 0 0-2 2v10" ${S}/>`,
};

export function injectIconSprite() {
  if (document.getElementById("icon-sprite")) return;
  const div = document.createElement("div");
  div.innerHTML = `<svg id="icon-sprite" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
    ${Object.entries(SYMBOLS).map(([k, v]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${v}</symbol>`).join("")}</svg>`;
  document.body.prepend(div.firstElementChild);
}

export function icon(name, cls = "") {
  return `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
}
