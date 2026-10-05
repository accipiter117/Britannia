// ui/main.js
// Owns the app: loading and saving, the campaign screen (map, top bar, the host and region
// panel), the season's flow (End Season, then Rome's attacks as decisions), and handing clashes
// to the battle screen and back. Simulation code does the rules; this wires taps to it.

import { BALANCE } from "../config/balance.js";
import {
  armiesIn, armyMen, armyPower, createCampaign, dateLabel, deserialise, garrisonPower, neighbours, rankOf, regionsOf, seasonName, serialise,
} from "../simulation/state.js";
import {
  applyBattle, canRaiseArmy, clashAt, disband, endTurn, income, moveArmy, pendingBattle, raiseArmy, recruit, recruitOptions, transfer, upgrade, upgradeCost,
} from "../simulation/campaign.js";
import { autoResolve } from "../simulation/battle/engine.js";
import { createMap } from "./mapView.js";
import { openBattle } from "./battleView.js";
import { icon, injectIconSprite } from "./icons.js";
import { initAudio, setScene, sfx, soundOn, toggleSound } from "./audio.js";

const KEY = "caledonia.save.v1";
const $ = (id) => document.getElementById(id);
const U = BALANCE.units;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let data, state, map;
const ui = { army: null, region: null, queue: [] };

// ---------- start ----------

async function start() {
  injectIconSprite();
  data = await (await fetch("data/caledonia.json")).json();
  state = load() || createCampaign(data, Date.now() % 100000);
  map = createMap($("map"), { onRegion: tapRegion, onArmy: tapArmy });
  ui.army = state.armies.find((a) => a.faction === "picts")?.id || null;
  wire();
  render();
  if (!localStorage.getItem("caledonia.seenHelp")) { help(); try { localStorage.setItem("caledonia.seenHelp", "1"); } catch { /* storage blocked */ } }
  else nextPending();
}

function load() {
  try { const s = localStorage.getItem(KEY); return s ? deserialise(s) : null; } catch { return null; }
}
function save() {
  try { localStorage.setItem(KEY, serialise(state)); } catch { /* storage blocked: play on */ }
}

// ---------- render ----------

function render() {
  save();
  const army = state.armies.find((a) => a.id === ui.army);
  if (!army) ui.army = null;
  const view = { selected: ui.army, focus: ui.region };
  if (army && army.faction === "picts" && army.moves > 0) {
    const near = neighbours(state, army.region);
    view.attack = near.filter((n) => clashAt(state, "picts", n));
    view.reach = near.filter((n) => !view.attack.includes(n));
  }
  map.render(state, view);
  hud();
  $("panel").innerHTML = army ? armyPanel(army) : ui.region ? regionPanel(state.regions[ui.region]) : overview();
  const romanNear = state.armies.some((a) => a.faction === "rome" && neighbours(state, a.region).some((n) => state.regions[n].owner === "picts"));
  setScene({ season: seasonName(state), mood: regionsOf(state, "picts").length < 3 ? "crisis" : state.pending.length ? "war" : romanNear ? "tension" : "peace" });
}

function hud() {
  const inc = income(state);
  $("hud").innerHTML = `
    <span class="brand">${icon("crown")} Caledonia</span>
    <span class="silver" title="Silver: income ${inc.gross}, upkeep ${inc.upkeep}">◉ ${state.silver} <small class="${inc.net < 0 ? "neg" : "pos"}">${inc.net >= 0 ? "+" : ""}${inc.net}</small></span>
    <span class="date">${dateLabel(state)}</span>
    <span class="spacer"></span>
    <button class="icon-btn" data-action="help" title="How to play">?</button>
    <button class="icon-btn" data-action="sound" title="Sound">${icon(soundOn() ? "sound_on" : "sound_off")}</button>
    <button class="icon-btn" data-action="menu" title="Campaign">☰</button>
    <button id="end-turn" class="primary" data-action="end-turn">${state.pending.length ? `Rome attacks (${state.pending.length})` : "End Season"}</button>`;
}

function overview() {
  const hosts = state.armies.filter((a) => a.faction === "picts");
  const inc = income(state);
  return `<h2>The Picts</h2>
    <p class="muted">Seven provinces of the north stand against Rome. Take Eboracum and Rome's grip on the north is broken.</p>
    <div class="kv"><span>Provinces</span><b>${regionsOf(state, "picts").length}</b><span>Silver</span><b>${state.silver} (${inc.net >= 0 ? "+" : ""}${inc.net} a season)</b><span>Roman armies</span><b>${state.armies.filter((a) => a.faction === "rome").length}</b></div>
    <h3>Your hosts</h3>
    ${hosts.map((a) => `<button class="list-row" data-action="select-army" data-army="${a.id}"><b>${esc(a.name)}</b><span>${a.units.length} units · ${armyMen(a)} men · ${state.regions[a.region].name}${a.moves ? "" : " · marched"}</span></button>`).join("") || `<p class="muted">You have no host. Raise one in a province you hold.</p>`}
    <h3>Chronicle</h3>
    <ul class="chron">${state.log.slice(-8).reverse().map((l) => `<li class="${l.kind}">${esc(l.text)}</li>`).join("")}</ul>`;
}

function armyPanel(a) {
  const mine = a.faction === "picts";
  const r = state.regions[a.region];
  const home = r.owner === "picts";
  const others = armiesIn(state, a.region, "picts").filter((x) => x.id !== a.id);
  const stars = "★".repeat(a.general.rank) + "☆".repeat(3 - a.general.rank);
  const head = `<header class="army-head ${a.faction}">
      <h2>${esc(a.name)}</h2>
      <p>${a.faction === "rome" ? "Legate" : "Chieftain"} ${esc(a.general.name)} <span class="stars">${stars}</span> · ${esc(r.name)}${mine ? ` · ${a.moves ? `${a.moves} march${a.moves > 1 ? "es" : ""} left` : "has marched"}` : ""}</p>
    </header>`;
  if (!mine) {
    return head + `<p class="muted">About ${Math.round(armyMen(a) / 50) * 50} men in ${a.units.length} units.</p>
      <ul class="unit-list">${a.units.map((u) => `<li class="unit-row foe"><b>${U[u.type].name}</b><span class="muted">${Math.round(u.men / 10) * 10} men</span></li>`).join("")}</ul>
      <button data-action="deselect">Back</button>`;
  }
  const units = a.units.map((u, i) => {
    const rank = rankOf(u);
    const pct = u.men / u.maxMen;
    const canUp = home && !U[u.type].general;
    return `<li class="unit-row">
      <div class="unit-main"><b>${U[u.type].name}</b><span class="rank r${rank}" title="${BALANCE.ranks[rank].label}">${"▲".repeat(rank) || "·"}</span>
        <span class="men"><i style="width:${pct * 100}%"></i></span><small>${u.men}/${u.maxMen}</small></div>
      <div class="unit-sub">
        <span class="pips" title="Weapons">⚔ ${"●".repeat(u.weapons)}${"○".repeat(3 - u.weapons)}</span>
        <span class="pips" title="Armour">⛨ ${"●".repeat(u.armour)}${"○".repeat(3 - u.armour)}</span>
        ${canUp && u.weapons < 3 ? `<button class="mini" data-action="upgrade" data-index="${i}" data-kind="weapons">+⚔ ${upgradeCost(u, "weapons")}</button>` : ""}
        ${canUp && u.armour < 3 ? `<button class="mini" data-action="upgrade" data-index="${i}" data-kind="armour">+⛨ ${upgradeCost(u, "armour")}</button>` : ""}
        ${others.length && !U[u.type].general ? `<button class="mini" data-action="transfer" data-index="${i}" data-to="${others[0].id}">→ ${esc(others[0].name.replace("Host of ", ""))}</button>` : ""}
        ${!U[u.type].general ? `<button class="mini ghost" data-action="disband" data-index="${i}" title="Disband">✕</button>` : ""}
      </div></li>`;
  }).join("");
  const rec = home ? recruitOptions(state, a).map((o) => `<button class="recruit ${o.ok ? "" : "off"}" data-action="recruit" data-type="${o.type}" ${o.ok ? "" : "disabled"} title="${esc(o.reason || U[o.type].desc)}">
      <b>${U[o.type].name}</b><small>◉ ${o.cost}${o.ok ? "" : ` · ${esc(o.reason)}`}</small></button>`).join("") : "";
  return head + `
    <p class="hint">${a.moves ? "Tap a lit region to march there. Red means battle." : "This host has marched this season."}${home ? "" : " Far from home, it loses men each season."}</p>
    <ul class="unit-list">${units}</ul>
    <p class="muted small">${a.units.length}/${BALANCE.maxUnitsPerArmy} units · strength ${Math.round(armyPower(a))}${home ? " · regaining men at home" : ""}</p>
    ${home ? `<h3>Recruit at ${esc(r.name)}</h3><div class="recruit-grid">${rec}</div>` : ""}
    <div class="row"><button data-action="deselect">Close</button></div>`;
}

function regionPanel(r) {
  const owner = state.factions[r.owner];
  const hosts = state.armies.filter((a) => a.region === r.id);
  const raise = r.owner === "picts" ? canRaiseArmy(state, r.id) : null;
  const walls = r.walls ? (r.owner === "rome" ? "Roman fort: a siege to take it" : "Walled oppidum: a siege to take it") : "Open ground";
  return `<header class="army-head ${r.owner}"><h2>${esc(r.name)}</h2><p>${owner.name} · ${r.terrain} · ${r.settlement}${r.capital ? " · capital" : ""}</p></header>
    <div class="kv"><span>Defences</span><b>${walls}</b>
      <span>Garrison</span><b>${r.garrison.length ? r.garrison.map((u) => U[u.type].name).join(", ") : "none"}</b>
      ${r.owner !== "picts" ? `<span>Defence</span><b>${Math.round(garrisonPower(r) + hosts.filter((a) => a.faction === r.owner).reduce((n, a) => n + armyPower(a), 0))}</b>` : ""}
      ${r.fortAt ? `<span>Rome</span><b class="neg">raising a fort</b>` : ""}</div>
    ${hosts.map((a) => `<button class="list-row" data-action="select-army" data-army="${a.id}"><b>${esc(a.name)}</b><span>${a.units.length} units · ${armyMen(a)} men</span></button>`).join("")}
    ${raise ? `<button class="primary" data-action="raise" ${raise.ok ? "" : "disabled"}>Raise a host here (◉ ${BALANCE.newArmyCost})</button>${raise.ok ? "" : `<p class="muted small">${esc(raise.reason)}</p>`}` : ""}
    <div class="row"><button data-action="deselect">Close</button></div>`;
}

// ---------- taps ----------

function tapArmy(id) {
  const a = state.armies.find((x) => x.id === id);
  if (ui.army && ui.army !== id && a.faction !== "picts") return tapRegion(a.region);
  ui.army = ui.army === id ? null : id;
  ui.region = null;
  render();
}

function tapRegion(id) {
  const army = state.armies.find((a) => a.id === ui.army && a.faction === "picts");
  if (army && army.moves > 0 && neighbours(state, army.region).includes(id)) {
    const clash = clashAt(state, "picts", id);
    if (clash) return confirmAttack(army, clash);
    moveArmy(state, army.id, id);
    sfx("march");
    return render();
  }
  ui.region = ui.region === id && !ui.army ? null : id;
  ui.army = null;
  render();
}

function confirmAttack(army, clash) {
  const r = state.regions[clash.regionId];
  const theirs = clash.armies.reduce((n, a) => n + armyPower(a), 0) + garrisonPower({ ...r, garrison: clash.garrison });
  const ours = armyPower(army);
  const odds = ours / Math.max(1, theirs);
  const word = odds > 1.6 ? "Overwhelming" : odds > 1.15 ? "Favourable" : odds > 0.85 ? "Even" : odds > 0.6 ? "Unfavourable" : "Desperate";
  modal(`<h2>${icon("sword")} ${clash.siege ? "Besiege" : "Attack"} ${esc(r.name)}?</h2>
    <p>${clash.armies.length ? `${clash.armies.map((a) => esc(a.name)).join(" and ")} (${clash.armies.reduce((n, a) => n + a.units.length, 0)} units)` : ""}${clash.armies.length && clash.garrison.length ? " with " : ""}${clash.garrison.length ? `a garrison of ${clash.garrison.length}` : ""} hold${clash.armies.length + (clash.garrison.length ? 1 : 0) > 1 ? "" : "s"} ${esc(r.name)}.${clash.siege ? " Behind walls: batter the gate or climb, then hold the centre." : ""}</p>
    <p class="odds">Odds: <b>${word}</b></p>
    <div class="choices"><button class="primary" data-action="attack-fight">Lead the attack</button><button data-action="attack-auto">Auto-resolve</button><button data-action="close-modal">Not yet</button></div>`);
  ui.attack = { armyId: army.id, to: clash.regionId };
}

// ---------- battles ----------

function fight(battle, auto) {
  const before = snapshot(battle);
  closeModal();
  if (auto) { autoResolve(battle); return finish(battle, before); }
  sfx("battle");
  $("toast").hidden = true;
  document.body.classList.add("in-battle");
  openBattle($("battle"), battle, {
    factions: { attacker: battle.sides.attacker.faction, defender: battle.sides.defender.faction },
    sfx,
    onEnd: (b, autoNow) => { document.body.classList.remove("in-battle"); if (autoNow && !b.over) autoResolve(b); finish(b, before); },
  });
}

function snapshot(b) {
  return b.units.filter((u) => u.side === b.playerSide).map((u) => ({ id: u.id, name: U[u.type].name, men: u.men, rank: u.rank, ref: u.ref }));
}

function finish(b, before) {
  const res = applyBattle(state, b);
  sfx(res.won ? "victory" : "defeat");
  const rows = before.map((x) => {
    const u = b.units.find((y) => y.id === x.id);
    const left = Math.round(u.men);
    return `<tr><td>${x.name}</td><td>${Math.round(x.men)}</td><td class="${left < x.men ? "neg" : ""}">${left}</td></tr>`;
  }).join("");
  const killed = b.units.filter((u) => u.side !== b.playerSide).reduce((n, u) => n + (u.start - u.men), 0);
  modal(`<h2>${icon(res.won ? "trophy" : "skull")} ${res.won ? "Victory" : "Defeat"}</h2>
    <p>${esc(b.result.reason)}${b.sides[b.playerSide].generalSlain ? " Your chieftain fell in the fighting." : ""}${b.sides[b.playerSide === "attacker" ? "defender" : "attacker"].generalSlain ? " The enemy general is dead." : ""}</p>
    <p class="muted">Enemy losses: about ${Math.round(killed / 10) * 10} men.</p>
    <table class="results"><tr><th>Unit</th><th>Before</th><th>After</th></tr>${rows}</table>
    <div class="choices"><button class="primary" data-action="close-modal">Continue</button></div>`, { after: nextPending });
  ui.army = state.armies.find((a) => b.clash.attackerIds.includes(a.id) && a.faction === "picts")?.id || ui.army;
  render();
}

// Rome's attacks queued at End Season, one decision at a time.
function nextPending() {
  if (state.over) return gameOver();
  const p = state.pending[0];
  if (!p) return render();
  const battle = pendingBattle(state, p);
  if (!battle) { state.pending.shift(); render(); return nextPending(); }
  const r = state.regions[p.regionId];
  const att = state.armies.find((a) => a.id === p.attackerIds[0]);
  const defenders = armiesIn(state, r.id, "picts");
  sfx("alert");
  ui.region = r.id; ui.army = null;
  render();
  modal(`<h2>${icon("eagle")} ${esc(att.name)} marches on ${esc(r.name)}!</h2>
    <p>${att.units.length} Roman units under ${esc(att.general.name)}. ${defenders.length ? `${defenders.map((a) => esc(a.name)).join(" and ")} stand${defenders.length > 1 ? "" : "s"} to meet them` : r.garrison.length ? `Only the local militia (${r.garrison.length} units) stands in the way` : "No one stands in the way"}${r.walls ? ", behind the walls of the oppidum" : ""}.</p>
    <div class="choices"><button class="primary" data-action="pending-fight">Take command</button><button data-action="pending-auto">Auto-resolve</button></div>`);
  ui.pendingBattle = battle;
}

function gameOver() {
  modal(`<h2>${icon(state.over.won ? "crown" : "candle")} ${state.over.won ? "The north is free" : "The north has fallen"}</h2><p>${esc(state.over.text)}</p>
    <div class="choices"><button class="primary" data-action="new">New campaign</button><button data-action="close-modal">Look at the map</button></div>`);
}

// ---------- modal ----------

let modalAfter = null;
function modal(html, opts = {}) {
  $("modal-card").innerHTML = html;
  $("modal").hidden = false;
  modalAfter = opts.after || null;
}
function closeModal() {
  $("modal").hidden = true;
  const after = modalAfter;
  modalAfter = null;
  if (after) after();
}

function help() {
  modal(`<h2>${icon("scroll")} Caledonia</h2>
    <p>You lead the Picts of the north. Rome holds the south and its legions are coming. Take <b>Eboracum</b> to break Rome's grip; lose every province and the north is Rome's.</p>
    <ul class="help">
      <li><b>The map:</b> tap your host, then a lit region to march (one region a season; all-horse hosts two). Red regions mean battle; walls mean a siege.</li>
      <li><b>Silver</b> comes from your provinces each season. Recruit and upgrade in your own land. Hosts far from home lose men; at home they regain them.</li>
      <li><b>Battles:</b> drag your units into place, then begin. Tap a unit to select, tap ground to march, drag to march and face, tap an enemy to attack. Use formations: shield wall against horse and arrows, wedge to charge.</li>
      <li><b>Win battles</b> by hitting flanks and rears, charging downhill, and ambushing from woods. Your chieftain's War Cry, Rally and Fury can turn a fight.</li>
      <li><b>Sieges:</b> batter the gate or climb the walls, then hold the centre.</li>
    </ul>
    <div class="choices"><button class="primary" data-action="close-modal">To war</button></div>`, { after: nextPending });
}

// ---------- actions ----------

const actions = {
  "end-turn": () => {
    if (state.pending.length) return nextPending();
    if (state.over) return gameOver();
    const notes = endTurn(state);
    sfx("season");
    ui.region = null;
    render();
    toast(notes.slice(-1)[0]);
    nextPending();
  },
  "select-army": (el) => { ui.army = el.dataset.army; ui.region = null; render(); },
  deselect: () => { ui.army = null; ui.region = null; render(); },
  recruit: (el) => { const r = recruit(state, ui.army, el.dataset.type); if (r.ok) sfx("recruit"); else toast(r.reason); render(); },
  upgrade: (el) => { const r = upgrade(state, ui.army, +el.dataset.index, el.dataset.kind); if (r.ok) sfx("build"); else toast(r.reason); render(); },
  disband: (el) => { disband(state, ui.army, +el.dataset.index); render(); },
  transfer: (el) => { transfer(state, ui.army, +el.dataset.index, el.dataset.to); render(); },
  raise: () => { const r = raiseArmy(state, ui.region); if (r.ok) { ui.army = r.army.id; ui.region = null; sfx("recruit"); } else toast(r.reason); render(); },
  "attack-fight": () => { const m = moveArmy(state, ui.attack.armyId, ui.attack.to); if (m.battle) fight(m.battle, false); else closeModal(); },
  "attack-auto": () => { const m = moveArmy(state, ui.attack.armyId, ui.attack.to); if (m.battle) fight(m.battle, true); else closeModal(); },
  "pending-fight": () => { state.pending.shift(); fight(ui.pendingBattle, false); },
  "pending-auto": () => { state.pending.shift(); fight(ui.pendingBattle, true); },
  "close-modal": closeModal,
  help,
  sound: () => { initAudio(); toggleSound(); render(); },
  menu: () => modal(`<h2>Campaign</h2><p>${dateLabel(state)} · the game saves itself after every action.</p>
    <div class="choices"><button data-action="new">Start a new campaign</button><button data-action="close-modal">Back</button></div>`),
  new: () => {
    modal(`<h2>Start again?</h2><p>This campaign will be lost.</p><div class="choices"><button class="danger" data-action="new-confirm">Start a new campaign</button><button data-action="close-modal">Keep playing</button></div>`);
  },
  "new-confirm": () => { state = createCampaign(data, Date.now() % 100000); ui.army = state.armies.find((a) => a.faction === "picts").id; ui.region = null; closeModal(); render(); },
};

function wire() {
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el && !el.disabled && actions[el.dataset.action]) actions[el.dataset.action](el);
  });
  document.addEventListener("pointerdown", () => initAudio(), { once: true });
}

let toastTimer = 0;
function toast(text) {
  if (!text) return;
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $("toast").hidden = true; }, 2600);
}

start();
