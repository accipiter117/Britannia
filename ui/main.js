// ui/main.js
// Owns app start-up and wiring: loads starter data or a save, holds UI state (selection, open
// panel, move mode, modal, battle), routes taps and buttons to simulation functions, and
// re-renders after every change. Game rules never live here.

import { createCampaign, dateLabel } from "../simulation/campaign.js";
import { startBuilding, startRoad } from "../simulation/economy.js";
import { disband, ghostsFor, mergeArmies, moveArmy, updateIntel, visibleDistricts, reachable, recruit, setStance, visibleArmies } from "../simulation/armies.js";
import { aiResponse, resolveWithoutBattle, setupBattle } from "../simulation/engagement.js";
import { cancelTrade, declareWar, playerAction } from "../simulation/diplomacy.js";
import { finishBattle, resolveAllyCall, resolveDefence, resolveEnding, resolveEvent, resolveProposal } from "../simulation/decisions.js";
import { setPolicy } from "../simulation/governance.js";
import { answerOverture } from "../simulation/overtures.js";
import { endSeason } from "../simulation/season.js";
import { setOrder } from "../simulation/orders.js";
import { districtPanel, summaryCard } from "./drawer.js";
import { armyPanel } from "./armyPanel.js";
import { esc, factionColour, label } from "./format.js";
import { renderHud, renderNotifications } from "./hud.js";
import { createMap } from "./map.js";
import { armiesPanel, diplomacyPanel, morePanel, realmPanel } from "./panels.js";
import { confirmHtml, endingHtml, messageHtml, pendingHtml, preBattleHtml, resultHtml, warConfirmHtml } from "./modal.js";
import { openBattle } from "./battleView.js";
import { chronicleHtml } from "./chronicle.js";
import { playSeason, seasonReportHtml } from "./playback.js";
import { objectivesHtml } from "./objectivesView.js";
import { icon, injectIconSprite } from "./icons.js";
import { initAudio, setScene, sfx, soundOn, toggleSound } from "./audio.js";
import { clearSave, loadGame, saveGame, saveLabel } from "./save.js";

const $ = (id) => document.getElementById(id);
const desktop = window.matchMedia("(min-width: 900px)");
const sideways = window.matchMedia("(orientation: landscape) and (max-height: 520px)"); // phone on its side: no summary card

let starter;
let state;
let map;
const ui = { selection: null, panel: null, drawerOpen: false, moveArmyId: null, modal: null, battle: null };

async function boot() {
  injectIconSprite();
  initAudio();
  starter = await fetch("data/starter_campaign.json").then((r) => r.json());
  state = loadGame() || createCampaign(starter);
  map = createMap($("map"), state, { onTap });
  wire();
  render();
  showNextPending();
}

// ---------- rendering ----------

function render() {
  const player = state.playerFactionId;
  if (!ui.battle) saveGame(state); // every action is kept, so a reload or update loses nothing
  renderHud($("hud"), state);
  renderNotifications($("notifications"), state, onNotification);

  updateIntel(state, player);
  const overlay = { highlight: ui.modal?.anchored ? ui.highlight : null, armies: visibleArmies(state, player), ghosts: ghostsFor(state, player), threats: state.pending.filter((p) => p.kind === "defend").map((p) => ({ from: p.eng.fromId, to: p.eng.districtId })) };
  const mover = ui.moveArmyId && state.armies.find((a) => a.id === ui.moveArmyId);
  if (mover) {
    overlay.reach = reachable(state, mover);
    if (ui.preview) overlay.path = overlay.reach[ui.preview.districtId]?.path;
  }
  else ui.moveArmyId = null;
  map.render(state, ui.selection, overlay);
  setScene(state);

  document.body.classList.toggle("move-mode", !!ui.moveArmyId);
  $("move-banner").hidden = !ui.moveArmyId;
  ui.objOpen ??= window.innerWidth > 700;
  $("objectives").innerHTML = objectivesHtml(state, ui.objOpen);
  $("move-banner").innerHTML = ui.moveArmyId ? moveBanner() : "";
  $("summary").innerHTML = desktop.matches ? "" : summaryCard(state, ui.selection);
  $("summary").hidden = desktop.matches || !ui.selection || ui.drawerOpen || !!ui.moveArmyId;
  document.body.classList.toggle("drawer-open", ui.drawerOpen && !ui.moveArmyId);
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.panel === ui.panel && ui.drawerOpen));
  const pend = state.pending.length;
  $("end-season").textContent = pend ? `Decide (${pend})` : "End Season";
  $("end-season").classList.toggle("urgent", pend > 0);

  const body = $("drawer-body");
  const scroll = body.scrollTop;
  body.innerHTML = drawerHtml();
  body.scrollTop = scroll;

  $("modal").hidden = !ui.modal;
  if (ui.modal) $("modal-card").innerHTML = ui.modal.html;
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

function modal(html, extra = {}) {
  ui.modal = { html, ...extra };
  render();
  $("modal").classList.toggle("anchored", !!extra.anchored);
}

function closeModal() {
  ui.modal = null;
  render();
  showNextPending();
}

function showNextPending() {
  if (ui.modal || ui.battle || ui.playing) return;
  if (state.victory.ended && !ui.endingShown) {
    ui.endingShown = true;
    return modal(endingHtml(state));
  }
  ui.highlight = null;
  if (state.pending.length) {
    const p = state.pending[0];
    // decisions about a place are shown over the map, with that district lit
    const where = p.eng?.districtId || p.ev?.districtId || p.district || null;
    if (where) { ui.highlight = where; map.focus(where); }
    modal(pendingHtml(state, p, 0), { anchored: !!where });
  }
}

// End Season: resolve, play the season back on the board, sum it up, then the decisions.
async function endSeasonFlow() {
  if (ui.playing) return;
  if (state.pending.length) return showNextPending();
  Object.assign(ui, { moveArmyId: null, preview: null });
  const player = state.playerFactionId;
  const before = { resources: { ...state.factions[player].resources } };
  const visible = visibleDistricts(state, player);
  endSeason(state);
  saveGame(state);
  visibleDistricts(state, player).forEach((d) => visible.add(d));
  sfx(state.notifications.some((n) => n.level === "critical") ? "alert" : "season");
  ui.playing = { skip: false };
  document.body.classList.add("playing");
  $("playback").hidden = false;
  await playSeason(state, map, visible, ui.playing);
  ui.playing = null;
  document.body.classList.remove("playing");
  $("playback").hidden = true;
  render();
  modal(seasonReportHtml(state, before));
}

// ---------- map input ----------

function onTap(target) {
  if (ui.playing) { ui.playing.skip = true; return; }
  if (ui.moveArmyId) return moveTap(target);
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
    ui.drawerOpen = desktop.matches || sideways.matches; // portrait phones show the summary card first
    $("drawer-body").scrollTop = 0;
  }
  render();
}

// Move mode: the first tap on a destination previews the route and its cost; a second tap
// on the same district (or the March button) commits.
function moveTap(target) {
  const armyId = ui.moveArmyId;
  // tapping an army marker means its district
  if (target?.type === "army") target = { type: "district", id: state.armies.find((a) => a.id === target.id)?.districtId };
  const army = state.armies.find((a) => a.id === armyId);
  if (!target || target.type !== "district" || !target.id || target.id === army.districtId) {
    Object.assign(ui, { moveArmyId: null, preview: null });
    return render();
  }
  const route = reachable(state, army)[target.id];
  if (!route) { toast("Out of reach this season"); return render(); }
  if (ui.preview?.districtId !== target.id) {
    ui.preview = { districtId: target.id };
    return render();
  }
  commitMove();
}

function commitMove() {
  const armyId = ui.moveArmyId, districtId = ui.preview?.districtId;
  Object.assign(ui, { moveArmyId: null, preview: null });
  if (!armyId || !districtId) return render();
  const army = state.armies.find((a) => a.id === armyId);
  const route = reachable(state, army)[districtId];
  if (route?.kind === "blocked") return modal(warConfirmHtml(state, state.districts[districtId].owner, armyId, districtId));
  doMove(armyId, districtId);
}

function moveBanner() {
  const army = state.armies.find((a) => a.id === ui.moveArmyId);
  if (!army) return "";
  const route = ui.preview && reachable(state, army)[ui.preview.districtId];
  if (!route) return `<span>${icon("move")} Choose where the ${esc(army.name)} marches (${army.movesLeft} movement left). Red means battle.</span><button data-action="cancel-move">Cancel</button>`;
  const to = state.districts[ui.preview.districtId].name;
  const what = route.kind === "attack" ? `Attack ${esc(to)}` : route.kind === "blocked" ? `Declare war and march on ${esc(to)}` : `March to ${esc(to)}`;
  return `<span><b>${what}</b> · ${route.path.length - 1} step${route.path.length > 2 ? "s" : ""}, ${route.cost} movement</span>
    <button class="primary" data-action="commit-move">${route.kind === "move" ? "March" : "Attack"}</button><button data-action="cancel-move">Cancel</button>`;
}

async function doMove(armyId, districtId) {
  const route = reachable(state, state.armies.find((a) => a.id === armyId))[districtId];
  const r = moveArmy(state, armyId, districtId);
  if (!r.ok) { toast(r.reason); return render(); }
  ui.selection = { type: "army", id: armyId };
  ui.panel = "army";
  sfx("march");
  // the host marches across the board, stopping short of an enemy it means to attack
  const steps = r.engagement ? route.path.slice(0, -1) : route.path;
  ui.animating = true;
  await map.animateArmy(armyId, steps);
  ui.animating = false;
  if (r.engagement) return playerAttack(r.engagement);
  toast(`Marched to ${state.districts[state.armies.find((a) => a.id === armyId).districtId].name}`);
  saveGame(state);
  render();
}

// The player attacks: the defender chooses a response, then the player fights or auto-resolves.
function playerAttack(eng) {
  const response = aiResponse(state, eng);
  const quiet = resolveWithoutBattle(state, eng, response === "none" ? "none" : response);
  if (quiet) {
    saveGame(state);
    return modal(messageHtml("The march", quiet));
  }
  startBattleChoice(setupBattle(state, eng, response, "attacker"));
}

function startBattleChoice(battle) {
  ui.pendingBattle = battle;
  modal(preBattleHtml(state, battle));
}

function fight() {
  const battle = ui.pendingBattle;
  ui.modal = null;
  ui.battle = battle;
  render();
  const colours = {
    attacker: factionColour(state, battle.sides.attacker.factionId),
    defender: factionColour(state, battle.sides.defender.factionId),
  };
  sfx("battle");
  openBattle($("battle"), battle, colours, (b, auto) => {
    ui.battle = null;
    afterBattle(finishBattle(state, b, auto));
  }, { onClash: () => sfx("clash") });
}

function afterBattle(result) {
  ui.pendingBattle = null;
  sfx(result.winner === state.playerFactionId ? "victory" : result.loser === state.playerFactionId ? "defeat" : "battle");
  saveGame(state);
  modal(resultHtml(result, state));
}

function onNotification(n) {
  if (n.districtId) select({ type: "district", id: n.districtId }, { open: desktop.matches });
}

function select(target, { open = true, focus = true } = {}) {
  ui.selection = target;
  ui.panel = target.type;
  ui.drawerOpen = open;
  $("drawer-body").scrollTop = 0;
  if (focus && target.type === "district") map.focus(target.id);
  if (focus && target.type === "army") map.focus(state.armies.find((a) => a.id === target.id).districtId);
  render();
}

// ---------- buttons ----------

const actions = {
  open: () => { ui.drawerOpen = true; ui.panel = ui.selection.type; render(); },
  "open-build": () => {
    actions.open();
    document.getElementById("build")?.scrollIntoView({ block: "start" });
  },
  build: (el) => {
    const r = startBuilding(state, state.playerFactionId, el.dataset.district, el.dataset.building);
    if (r.ok) sfx("build");
    toast(r.ok ? `${label(el.dataset.building)} ordered at ${state.districts[el.dataset.district].name}` : r.reason);
    render();
  },
  road: (el) => {
    const r = startRoad(state, state.playerFactionId, +el.dataset.connection);
    if (r.ok) sfx("build");
    toast(r.ok ? "Road ordered" : r.reason);
    render();
  },
  recruit: (el) => {
    const r = recruit(state, state.playerFactionId, el.dataset.district, el.dataset.type);
    if (r.ok) sfx("recruit");
    toast(r.ok ? `${label(el.dataset.type)} raised at ${state.districts[el.dataset.district].name}` : r.reason);
    render();
  },
  "move-mode": () => {
    const id = ui.selection?.type === "army" ? ui.selection.id : null;
    if (!id) return;
    ui.moveArmyId = id;
    ui.drawerOpen = desktop.matches;
    render();
  },
  "cancel-move": () => { Object.assign(ui, { moveArmyId: null, preview: null }); render(); },
  "commit-move": () => commitMove(),
  stance: (el) => { setStance(state, el.dataset.army, el.dataset.stance); render(); },
  order: (el) => {
    const r = setOrder(state, el.dataset.army, el.dataset.order || null, el.dataset.target || null);
    if (!r.ok) toast(r.reason);
    else sfx("march");
    render();
  },
  disband: (el) => {
    const r = disband(state, el.dataset.army, el.dataset.type);
    toast(r.ok ? `${r.n} ${label(el.dataset.type)} ${r.home ? "sent home to the land" : "disbanded"}` : r.reason);
    if (!state.armies.some((a) => a.id === el.dataset.army)) { ui.selection = null; ui.panel = "armies"; }
    render();
  },
  merge: (el) => { mergeArmies(state, el.dataset.into, el.dataset.from); toast("Armies merged"); render(); },
  policy: (el) => { setPolicy(state, state.playerFactionId, el.dataset.district, el.dataset.policy); render(); },
  "select-district": (el) => select({ type: "district", id: el.dataset.district }),
  "select-army": (el) => select({ type: "army", id: el.dataset.army }),
  diplo: (el) => {
    const opts = {};
    if (el.dataset.do === "trade") {
      const [dir, resource, amount] = document.querySelector(`[data-trade="${el.dataset.faction}"]`).value.split(":");
      Object.assign(opts, { sell: dir === "sell", resource, amount: +amount });
    }
    if (el.dataset.do === "war" && !el.dataset.confirmed) {
      return modal(confirmHtml(`Declare war on the ${state.factions[el.dataset.faction].name}?`, "Their allies may join them.",
        `data-action="diplo" data-do="war" data-faction="${el.dataset.faction}" data-confirmed="1"`, "Declare war"));
    }
    ui.modal = null;
    const r = playerAction(state, el.dataset.faction, el.dataset.do, opts);
    toast(r.text);
    render();
  },
  "cancel-trade": (el) => { cancelTrade(state, +el.dataset.index); render(); },
  "war-and-move": (el) => {
    declareWar(state, state.playerFactionId, el.dataset.faction);
    ui.modal = null;
    doMove(el.dataset.army, el.dataset.district);
  },
  decide: (el) => decide(el.dataset.kind, el.dataset.value, +el.dataset.index),
  "battle-fight": fight,
  "battle-auto": () => { ui.modal = null; afterBattle(finishBattle(state, ui.pendingBattle, true)); },
  "close-modal": closeModal,
  "toggle-objectives": () => { ui.objOpen = !ui.objOpen; render(); },
  "skip-playback": () => { if (ui.playing) ui.playing.skip = true; },
  ending: () => modal(endingHtml(state)),
  "open-chronicle": () => { ui.chronicle = "all"; renderChronicle(); },
  "chronicle-filter": (el) => { ui.chronicle = el.dataset.filter; renderChronicle(); },
  "close-chronicle": () => { ui.chronicle = null; renderChronicle(); },
  save: () => { toast(saveGame(state) ? "Saved" : "Could not save: storage is blocked"); render(); },
  load: () => {
    const s = loadGame();
    if (!s) return toast("No save found");
    state = s;
    Object.assign(ui, { selection: null, moveArmyId: null, modal: null });
    toast(`Loaded ${dateLabel(state)}`);
    render();
    showNextPending();
  },
  new: (el) => {
    if (!el.dataset.confirmed) {
      return modal(confirmHtml("Start a new campaign?", "Your current campaign and its save will be replaced.", 'data-action="new" data-confirmed="1"', "Start anew"));
    }
    clearSave();
    state = createCampaign(starter);
    Object.assign(ui, { selection: null, panel: "realm", moveArmyId: null, modal: null, endingShown: false });
    map.reset();
    render();
  },
};

function decide(kind, value, index) {
  const p = state.pending[index];
  if (!p) return closeModal();
  ui.modal = null;
  if (kind === "defend") {
    const r = resolveDefence(state, p, value);
    if (r.battle) return startBattleChoice(r.battle);
    saveGame(state);
    return modal(messageHtml("The defence", r.text));
  }
  if (kind === "ally") resolveAllyCall(state, p, value);
  if (kind === "proposal") resolveProposal(state, p, value === "yes");
  if (kind === "event") resolveEvent(state, p, +value);
  if (kind === "overture") answerOverture(state, p, value);
  if (kind === "ending") {
    resolveEnding(state, p, value === "end");
    if (value === "end") { saveGame(state); ui.endingShown = true; return modal(endingHtml(state)); }
  }
  saveGame(state);
  closeModal();
}

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
    ui.moveArmyId = null;
    $("drawer-body").scrollTop = 0;
    render();
  });

  $("end-season").addEventListener("click", endSeasonFlow);

  $("sound-toggle").onclick = () => { toggleSound(); paintSoundButton(); };
  paintSoundButton();
  $("zoom-in").onclick = () => map.zoomBy(0.75);
  $("zoom-out").onclick = () => map.zoomBy(1.33);
  $("zoom-reset").onclick = () => map.reset();
  $("drawer-close").onclick = () => { ui.drawerOpen = false; render(); };
  desktop.addEventListener("change", render);
  sideways.addEventListener("change", render);
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

function paintSoundButton() {
  const b = $("sound-toggle");
  b.innerHTML = icon(soundOn() ? "sound_on" : "sound_off");
  b.setAttribute("aria-label", soundOn() ? "Mute sound" : "Turn sound on");
}

function renderChronicle() {
  const el = $("chronicle-view");
  el.hidden = !ui.chronicle;
  el.innerHTML = ui.chronicle ? chronicleHtml(state, ui.chronicle) : "";
}

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

boot().catch((err) => {
  document.body.innerHTML = `<p style="padding:1rem">Britannia failed to start: ${err.message}</p>`;
  console.error(err);
});
