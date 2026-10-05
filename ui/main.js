// ui/main.js
// Owns app start-up and wiring: loads starter data or a save, holds UI selection state,
// routes taps and buttons to simulation functions, and re-renders after every change.

import { createCampaign, dateLabel } from "../simulation/campaign.js";
import { startBuilding, startRoad } from "../simulation/economy.js";
import { endSeason } from "../simulation/season.js";
import { armyPanel, districtPanel, summaryCard } from "./drawer.js";
import { label } from "./format.js";
import { renderHud, renderNotifications } from "./hud.js";
import { createMap } from "./map.js";
import { armiesPanel, diplomacyPanel, morePanel, realmPanel } from "./panels.js";
import { clearSave, loadGame, saveGame, saveLabel } from "./save.js";

const $ = (id) => document.getElementById(id);
const desktop = window.matchMedia("(min-width: 900px)");

let starter;
let state;
let map;
const ui = { selection: null, panel: null, drawerOpen: false };

async function boot() {
  starter = await fetch("data/starter_campaign.json").then((r) => r.json());
  state = loadGame() || createCampaign(starter);
  map = createMap($("map"), state, { onTap });
  wire();
  render();
}

// ---------- rendering ----------

function render() {
  renderHud($("hud"), state);
  renderNotifications($("notifications"), state, onNotification);
  map.render(state, ui.selection);
  $("summary").innerHTML = desktop.matches ? "" : summaryCard(state, ui.selection);
  $("summary").hidden = desktop.matches || !ui.selection || ui.drawerOpen;
  document.body.classList.toggle("drawer-open", ui.drawerOpen);
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.panel === ui.panel && ui.drawerOpen));

  const body = $("drawer-body");
  const scroll = body.scrollTop;
  body.innerHTML = drawerHtml();
  body.scrollTop = scroll;
}

function drawerHtml() {
  const panel = ui.panel || "realm";
  if (panel === "district" && ui.selection?.type === "district") return districtPanel(state, ui.selection.id);
  if (panel === "army" && ui.selection?.type === "army") return armyPanel(state, ui.selection.id);
  if (panel === "armies") return armiesPanel(state);
  if (panel === "diplomacy") return diplomacyPanel(state);
  if (panel === "more") return morePanel(state, saveLabel());
  return realmPanel(state);
}

// ---------- input ----------

function onTap(target) {
  const same = target && ui.selection && target.type === ui.selection.type && target.id === ui.selection.id;
  if (!target) {
    ui.selection = null;
    ui.drawerOpen = false;
    if (desktop.matches) ui.panel = "realm";
  } else if (same) {
    ui.panel = target.type;
    ui.drawerOpen = true; // tap selected = drawer
  } else {
    ui.selection = target;
    ui.panel = target.type;
    ui.drawerOpen = desktop.matches; // mobile shows the summary card first
    $("drawer-body").scrollTop = 0;
  }
  render();
}

function select(target, { open = true, focus = true } = {}) {
  ui.selection = target;
  ui.panel = target.type;
  ui.drawerOpen = open;
  $("drawer-body").scrollTop = 0;
  if (focus && target.type === "district") map.focus(target.id);
  render();
}

function onNotification(n) {
  if (n.districtId) select({ type: "district", id: n.districtId }, { open: desktop.matches });
}

const actions = {
  open: () => { ui.drawerOpen = true; ui.panel = ui.selection.type; render(); },
  "open-build": () => {
    actions.open();
    document.getElementById("build")?.scrollIntoView({ block: "start" });
  },
  build: (el) => {
    const r = startBuilding(state, state.playerFactionId, el.dataset.district, el.dataset.building);
    toast(r.ok ? `${label(el.dataset.building)} ordered at ${state.districts[el.dataset.district].name}` : r.reason);
    render();
  },
  road: (el) => {
    const r = startRoad(state, state.playerFactionId, +el.dataset.connection);
    toast(r.ok ? "Road ordered" : r.reason);
    render();
  },
  "select-district": (el) => select({ type: "district", id: el.dataset.district }),
  "select-army": (el) => select({ type: "army", id: el.dataset.army }, { focus: false }),
  save: () => { toast(saveGame(state) ? "Saved" : "Could not save: storage is blocked"); render(); },
  load: () => {
    const s = loadGame();
    if (!s) return toast("No save found");
    state = s;
    ui.selection = null;
    toast(`Loaded ${dateLabel(state)}`);
    render();
  },
  new: () => {
    if (!window.confirm("Start a new campaign? Your current save will be replaced.")) return;
    clearSave();
    state = createCampaign(starter);
    Object.assign(ui, { selection: null, panel: "realm" });
    map.reset();
    render();
  },
};

function wire() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el && !el.disabled && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  $("nav").addEventListener("click", (e) => {
    const b = e.target.closest("[data-panel]");
    if (!b) return;
    const again = ui.drawerOpen && ui.panel === b.dataset.panel;
    ui.panel = b.dataset.panel;
    ui.drawerOpen = desktop.matches || !again;
    $("drawer-body").scrollTop = 0;
    render();
  });

  $("end-season").addEventListener("click", () => {
    endSeason(state);
    saveGame(state);
    toast(`${dateLabel(state)}`);
    render();
  });

  $("zoom-in").onclick = () => map.zoomBy(0.75);
  $("zoom-out").onclick = () => map.zoomBy(1.33);
  $("zoom-reset").onclick = () => map.reset();
  $("drawer-close").onclick = () => { ui.drawerOpen = false; render(); };
  desktop.addEventListener("change", render);
  wireSwipe();
}

// Swipe the drawer down to close it (mobile). Only starts when the content is scrolled to the top.
function wireSwipe() {
  const drawer = $("drawer");
  let startY = null;
  drawer.addEventListener("touchstart", (e) => {
    startY = $("drawer-body").scrollTop <= 0 ? e.touches[0].clientY : null;
  }, { passive: true });
  drawer.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    drawer.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
  }, { passive: true });
  drawer.addEventListener("touchend", (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    drawer.style.transform = "";
    startY = null;
    if (dy > 80 && !desktop.matches) { ui.drawerOpen = false; render(); }
  });
}

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1800);
}

boot().catch((err) => {
  document.body.innerHTML = `<p style="padding:1rem">Britannia failed to start: ${err.message}</p>`;
  console.error(err);
});
