// ui/main.js
// Owns the app: the title screen (choose your leader and difficulty, continue, or a quick
// skirmish), saving, the campaign screen (map, top bar, the host and region panel), the season's
// flow (End Season, then Rome's attacks as decisions), what to do with a taken region, and handing
// clashes to the battle screen and back. Simulation code does the rules; this wires taps to it.

import { BALANCE } from "../config/balance.js";
import {
  armiesIn, armyMen, armyPower, createCampaign, dateLabel, deserialise, foodCap, garrisonPower, neighbours, newUnit, rankOf, regionsOf, seasonName, serialise,
} from "../simulation/state.js";
import {
  applyBattle, attackOdds, canRaiseArmy, captureOptions, clashAt, decideCapture, disband, endTurn, foodNeed, harvest, income, moveArmy, pendingBattle,
  raiseArmy, recruit, recruitOptions, transfer, upgrade, upgradeCost,
} from "../simulation/campaign.js";
import { createBattle } from "../simulation/battle/setup.js";
import { autoResolve } from "../simulation/battle/engine.js";
import { romeThreats } from "../simulation/romeAI.js";
import { createMap } from "./mapView.js";
import { openBattle } from "./battleView.js";
import { icon, injectIconSprite } from "./icons.js";
import { initAudio, setScene, sfx, soundOn, toggleSound } from "./audio.js";

const KEY = "britannia-invicta.save.v2";
const $ = (id) => document.getElementById(id);
const U = BALANCE.units;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

let data, state, map;
const ui = { army: null, region: null, era: "caratacus", difficulty: "normal" };

// ---------- start ----------

async function start() {
  injectIconSprite();
  data = await (await fetch("data/britannia.json")).json();
  wire();
  title();
}

function load() {
  try { const s = localStorage.getItem(KEY); return s ? deserialise(s) : null; } catch { return null; }
}
function save() {
  try { if (state) localStorage.setItem(KEY, serialise(state)); } catch { /* storage blocked: play on */ }
}

// ---------- title ----------

const LEADERS = {
  caratacus: { who: "Caratacus of the Catuvellauni", art: "warriors" },
  boudica: { who: "Boudica, queen of the Iceni", art: "chariots" },
  calgacus: { who: "Calgacus of the Caledonii", art: "champions" },
};

function title() {
  document.body.classList.add("on-title");
  const saved = load();
  $("title").hidden = false;
  $("title").innerHTML = `
    <div class="title-card">
      <h1>Britannia <span>Invicta</span></h1>
      <p class="tag">Rally the tribes. Break the legions. Keep the island free.</p>
      ${saved ? `<button class="primary wide" data-action="continue">Continue: ${esc(data.eras[saved.era].label)}, ${esc(dateLabel(saved))}</button>` : ""}
      <h3>Choose your leader</h3>
      <div class="leaders">${Object.entries(data.eras).map(([id, e]) => `
        <button class="leader ${ui.era === id ? "on" : ""}" data-action="era" data-era="${id}">
          <canvas class="leader-art" data-art="${LEADERS[id].art}" width="48" height="32"></canvas>
          <b>${esc(e.label)}</b><small>AD ${e.year} · ${esc(e.tribe)}</small></button>`).join("")}</div>
      <p class="intro">${esc(data.eras[ui.era].intro)}</p>
      <h3>Difficulty</h3>
      <div class="seg">${Object.entries(BALANCE.difficulty).map(([id, d]) => `<button data-action="difficulty" data-difficulty="${id}" class="${ui.difficulty === id ? "on" : ""}">${d.label}</button>`).join("")}</div>
      <div class="title-actions">
        <button class="primary wide" data-action="new-game">${saved ? "Begin a new campaign" : "Begin the campaign"}</button>
        <button class="wide" data-action="skirmish">Quick battle</button>
      </div>
      <p class="muted small">Real-time battles with hundreds of warriors; a campaign across Britannia in about an hour.</p>
    </div>`;
  drawLeaderArt();
}

async function drawLeaderArt() {
  const { getSprite } = await import("./sprites.js");
  document.querySelectorAll(".leader-art").forEach((c) => {
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    const spr = getSprite(c.dataset.art, 2, 0, 1);
    g.drawImage(spr, (c.width - spr.width * 1) / 2, c.height - spr.height - 1);
  });
}

function beginCampaign(s) {
  state = s;
  document.body.classList.remove("on-title");
  $("title").hidden = true;
  if (!map) map = createMap($("map"), data.regions, { onRegion: tapRegion, onArmy: tapArmy });
  window.britanniaMap = map; // for browser tests
  ui.army = state.armies.find((a) => a.faction === "celts")?.id || null;
  ui.region = null;
  render();
  const first = state.armies.find((a) => a.id === ui.army);
  if (first) centre(first.region);
  if (state.turn === 1 && !state.seenIntro) {
    state.seenIntro = true;
    modal(`<h2>${icon("scroll")} ${esc(data.eras[state.era].label)}, AD ${state.startYear}</h2><p>${esc(state.intro)}</p>
      <ul class="help">
        <li><b>The map:</b> your tribes are blue, Rome's red. Tap your host and the regions it can reach are marked: March, or a fight with the odds. Red pulsing borders show where Rome may strike next.</li>
        <li><b>Wheat:</b> every host carries food. At home it lives half off the land outside winter and refills from your granary; abroad it forages in summer and autumn and starves in winter.</li>
        <li><b>Taken land:</b> win a tribe over (its warriors join you) or plunder it (silver and wheat now, unrest later).</li>
        <li><b>Battles:</b> drag your bands into place, then fight. Tap to march, drag to march and face, tap an enemy to attack. Throw javelins with the skill shot: tap the button, then where they should land.</li>
        <li><b>Win</b> by driving Rome from Britannia.</li>
      </ul>
      <div class="choices"><button class="primary" data-action="close-modal">To war</button></div>`, { after: nextPending });
  } else nextPending();
}

// ---------- render ----------

function render() {
  if (!state) return;
  save();
  const army = state.armies.find((a) => a.id === ui.army);
  if (!army) ui.army = null;
  const view = { selected: ui.army, focus: ui.region, threats: romeThreats(state), badges: {} };
  if (army && army.faction === "celts" && army.moves > 0) {
    const near = neighbours(state, army.region);
    view.attack = near.filter((n) => clashAt(state, "celts", n));
    view.reach = near.filter((n) => !view.attack.includes(n));
    for (const n of view.attack) {
      const c = clashAt(state, "celts", n);
      const o = attackOdds(army, c);
      view.badges[n] = { text: `${c.siege ? "Siege" : "Fight"}: ${o.word}`, tone: o.tone };
    }
    for (const n of view.reach) view.badges[n] = { text: state.regions[n].owner === "celts" ? "March" : `Take ${state.regions[n].name}` };
  }
  map.render(state, view);
  hud();
  advise(view);
  const panel = army ? armyPanel(army) : ui.region ? regionPanel(state.regions[ui.region]) : "";
  $("panel").innerHTML = panel;
  $("panel").hidden = !panel;
  $("panel").classList.toggle("open", !!ui.sheet);
  const romanNear = state.armies.some((a) => a.faction === "rome" && neighbours(state, a.region).some((n) => state.regions[n].owner === "celts"));
  setScene({ season: seasonName(state), mood: regionsOf(state, "celts").length < 2 ? "crisis" : state.pending.length ? "war" : romanNear ? "tension" : "peace" });
}

function hud() {
  const inc = income(state);
  const crop = harvest(state);
  $("hud").innerHTML = `
    <button class="icon-btn" data-action="menu" title="Your realm, chronicle and settings">☰</button>
    <span class="res" title="Silver: ${inc.gross} from your tribes, ${inc.upkeep} upkeep a season"><i class="coin"></i>${state.silver}<small class="${inc.net < 0 ? "neg" : "pos"}">${inc.net >= 0 ? "+" : ""}${inc.net}</small></span>
    <span class="res" title="Wheat in the granary${crop ? `; this season's harvest brings ${crop}` : ""}"><i class="wheat"></i>${state.wheat}${crop ? `<small class="pos">+${crop}</small>` : ""}</span>
    <span class="date">${seasonName(state)} <small>AD ${state.startYear + Math.floor((state.turn - 1) / 4)}</small></span>
    <span class="spacer"></span>
    <button id="end-turn" class="primary" data-action="end-turn">${state.pending.length ? `Rome attacks (${state.pending.length})` : "End Season"}</button>`;
}

function panelTools() {
  return `<div class="panel-tools"><button class="sheet-toggle" data-action="sheet" aria-label="Show or hide details">${ui.sheet ? "Less" : "More"}</button><button data-action="deselect" aria-label="Close">✕</button></div>`;
}

// One line on the map saying what to do next, with a tap to go there.
function advise(view) {
  const ready = state.armies.filter((a) => a.faction === "celts" && a.moves > 0);
  const sel = state.armies.find((a) => a.id === ui.army && a.faction === "celts");
  let text, action = "", extra = "";
  if (state.pending.length) text = "Rome is attacking!";
  else if (sel && sel.moves > 0) {
    const easy = Object.entries(view.badges).filter(([, b]) => b.tone === "good").map(([id]) => state.regions[id].name);
    text = easy.length ? `Good odds at ${esc(easy[0])}. Tap a marked region.` : "Tap a marked region to march or fight.";
    if (ready.length > 1) { action = "next-host"; extra = "Next ›"; }
  } else if (ready.length) {
    text = `${ready.length} host${ready.length > 1 ? "s" : ""} can still march.`;
    action = "next-host"; extra = "Select ›";
  } else if (view.threats.length) {
    text = `Rome may strike ${view.threats.map((id) => esc(state.regions[id].name)).join(", ")} next season.`;
    action = "show-threat"; extra = "Show ›";
  } else text = "All hosts have marched. End the season.";
  $("advice").innerHTML = `<span>${text}</span>${action ? `<button class="mini" data-action="${action}">${extra}</button>` : ""}`;
}

function realm() {
  const hosts = state.armies.filter((a) => a.faction === "celts");
  const inc = income(state);
  return `<h2>The Britons · ${esc(dateLabel(state))}</h2>
    <p class="muted">${esc(data.eras[state.era].label)}'s war. Drive Rome from Britannia.</p>
    <div class="kv"><span>Your tribes</span><b>${regionsOf(state, "celts").length}</b>
      <span>Rome holds</span><b>${regionsOf(state, "rome").length} · ${state.armies.filter((a) => a.faction === "rome").length} armies</b>
      <span>Free tribes</span><b>${regionsOf(state, "free").length}</b>
      <span>Silver</span><b>${state.silver} (${inc.net >= 0 ? "+" : ""}${inc.net} a season)</b>
      <span>Wheat</span><b>${state.wheat} in the granary</b></div>
    <h3>Your hosts</h3>
    ${hosts.map((a) => `<button class="list-row" data-action="select-army-close" data-army="${a.id}"><b>${esc(a.name)}</b><span>${a.units.length} bands · ${armyMen(a)} warriors · ${state.regions[a.region].name} · wheat ${a.food}/${foodCap(a)}${a.moves ? "" : " · marched"}</span></button>`).join("") || `<p class="muted">You have no host. Raise one in a region you hold.</p>`}
    <h3>Chronicle</h3>
    <ul class="chron">${state.log.slice(-8).reverse().map((l) => `<li class="${l.kind}">${esc(l.text)}</li>`).join("")}</ul>
    <div class="choices"><button data-action="help">How to play</button><button data-action="sound">Sound ${soundOn() ? "off" : "on"}</button><button data-action="to-title">Back to the title screen</button><button class="primary" data-action="close-modal">Back to the war</button></div>
    <p class="muted small">The game saves itself after every action.</p>`;
}

function armyPanel(a) {
  const mine = a.faction === "celts";
  const r = state.regions[a.region];
  const home = r.owner === "celts";
  const others = armiesIn(state, a.region, "celts").filter((x) => x.id !== a.id);
  const stars = "★".repeat(a.general.rank) + "☆".repeat(3 - a.general.rank);
  const head = `${panelTools()}<header class="army-head ${a.faction}">
      <h2>${esc(a.name)}</h2>
      <p>${a.faction === "rome" ? "Legate" : "Led by"} ${esc(a.general.name)} <span class="stars">${stars}</span> · ${esc(r.name)}${mine ? ` · ${a.moves ? `${a.moves} march${a.moves > 1 ? "es" : ""} left` : "has marched"}` : ""}</p>
    </header>`;
  if (!mine) {
    return head + `<p class="muted">About ${Math.round(armyMen(a) / 20) * 20} men in ${a.units.length} units.</p>
      <ul class="unit-list">${a.units.map((u) => `<li class="unit-row foe"><b>${U[u.type].name}</b><span class="muted">${u.men} men</span></li>`).join("")}</ul>
      <button data-action="deselect">Back</button>`;
  }
  const season = seasonName(state);
  const need = foodNeed(a, season);
  const cap = foodCap(a);
  const units = a.units.map((u, i) => {
    const rank = rankOf(u);
    const canUp = home && !U[u.type].tags?.includes("general");
    return `<li class="unit-row">
      <div class="unit-main"><canvas class="unit-art" data-type="${u.type}" width="22" height="18"></canvas><b>${U[u.type].name}</b><span class="rank r${rank}" title="${BALANCE.ranks[rank].label}">${"▲".repeat(rank) || "·"}</span>
        <span class="men"><i style="width:${(u.men / u.maxMen) * 100}%"></i></span><small>${u.men}/${u.maxMen}</small></div>
      <div class="unit-sub">
        <span class="pips" title="Weapons">⚔ ${"●".repeat(u.weapons)}${"○".repeat(3 - u.weapons)}</span>
        <span class="pips" title="Armour">⛨ ${"●".repeat(u.armour)}${"○".repeat(3 - u.armour)}</span>
        ${canUp && u.weapons < 3 ? `<button class="mini" data-action="upgrade" data-index="${i}" data-kind="weapons">+⚔ ${upgradeCost(u, "weapons")}</button>` : ""}
        ${canUp && u.armour < 3 ? `<button class="mini" data-action="upgrade" data-index="${i}" data-kind="armour">+⛨ ${upgradeCost(u, "armour")}</button>` : ""}
        ${others.length && canUp ? `<button class="mini" data-action="transfer" data-index="${i}" data-to="${others[0].id}" title="Send to ${esc(others[0].name)}">→ host</button>` : ""}
        ${canUp ? `<button class="mini ghost" data-action="disband" data-index="${i}" title="Disband">✕</button>` : ""}
      </div></li>`;
  }).join("");
  const rec = home ? recruitOptions(state, a).map((o) => `<button class="recruit ${o.ok ? "" : "off"}" data-action="recruit" data-type="${o.type}" ${o.ok ? "" : "disabled"} title="${esc(o.reason || U[o.type].desc)}">
      <canvas class="unit-art" data-type="${o.type}" width="22" height="18"></canvas><b>${U[o.type].name}</b><small><i class="coin"></i>${o.cost}${o.ok ? ` · ${U[o.type].men} men` : ` · ${esc(o.reason)}`}</small></button>`).join("") : "";
  return head + `
    <div class="wagon ${a.food < need ? "low" : ""}"><i class="wheat"></i><span>Wheat <b>${a.food}/${cap}</b> · eats ${need} this ${season.toLowerCase()}${home ? (season === "Winter" ? " · refills from the granary" : " · half off the land, refills from the granary") : season === "Summer" || season === "Autumn" ? " · foraging abroad" : " · nothing to forage"}</span>
      <i class="bar"><b style="width:${Math.min(100, (a.food / Math.max(1, cap)) * 100)}%"></b></i></div>
    <p class="hint">${a.moves ? "Tap a marked region: March, or a fight with its odds." : "This host has marched this season."}</p>
    <ul class="unit-list">${units}</ul>
    <p class="muted small">${a.units.length}/${BALANCE.maxUnitsPerArmy} bands · strength ${Math.round(armyPower(a))}${home ? " · men return to the colours at home" : ""}</p>
    ${home ? `<h3>Recruit at ${esc(r.name)}</h3><div class="recruit-grid">${rec}</div>` : ""}
`;
}

function regionPanel(r) {
  const hosts = state.armies.filter((a) => a.region === r.id);
  const raise = r.owner === "celts" ? canRaiseArmy(state, r.id) : null;
  const who = r.owner === "celts" ? "Yours" : r.owner === "rome" ? "Roman" : "A free tribe";
  const walls = r.settlement === "town" ? "Roman town, walled" : r.settlement === "fort" ? "Roman fort" : r.settlement === "oppidum" ? `Hill fort${r.seat ? ` of ${r.seat}` : ""}` : "Open villages";
  return `${panelTools()}<header class="army-head ${r.owner}"><h2>${esc(r.name)}</h2><p>${who} · ${r.terrain}${r.port ? " · port" : ""}</p></header>
    <div class="kv"><span>Settlement</span><b>${walls}</b>
      <span>Each season</span><b><i class="coin"></i>${BALANCE.regionYield[r.settlement]?.silver ?? 15} silver · <i class="wheat"></i>${BALANCE.regionYield[r.settlement]?.food ?? 4} wheat at harvest${r.owner === "celts" ? "" : " if yours"}</b>
      <span>Garrison</span><b>${r.garrison.length ? r.garrison.map((u) => U[u.type].name).join(", ") : "none"}</b>
      ${r.owner !== "celts" ? `<span>Defence</span><b>${Math.round(garrisonPower(r) + hosts.filter((a) => a.faction === r.owner).reduce((n, a) => n + armyPower(a), 0))}</b>` : ""}
      ${r.unrest ? `<span>Unrest</span><b class="neg">${r.unrest} seasons: may rise if left unguarded</b>` : ""}
      ${r.anger ? `<span>Mood</span><b class="neg">wary of you (${r.anger})</b>` : ""}
      ${r.fortAt ? `<span>Rome</span><b class="neg">raising a fort</b>` : ""}</div>
    ${hosts.map((a) => `<button class="list-row" data-action="select-army" data-army="${a.id}"><b>${esc(a.name)}</b><span>${a.units.length} bands · ${armyMen(a)} men</span></button>`).join("")}
    ${raise ? `<button class="primary" data-action="raise" ${raise.ok ? "" : "disabled"}>Raise a host here (<i class="coin"></i>${BALANCE.newArmyCost})</button>${raise.ok ? "" : `<p class="muted small">${esc(raise.reason)}</p>`}` : ""}
`;
}

// little pixel portraits of units in the panel
async function paintUnitArt() {
  const { getSprite } = await import("./sprites.js");
  document.querySelectorAll("canvas.unit-art").forEach((c) => {
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, c.width, c.height);
    const spr = getSprite(c.dataset.type, 2, 0, 1);
    const k = Math.min(c.width / spr.width, c.height / spr.height);
    g.drawImage(spr, (c.width - spr.width * k) / 2, c.height - spr.height * k, spr.width * k, spr.height * k);
  });
}
new MutationObserver(() => paintUnitArt()).observe(document.getElementById("panel"), { childList: true });

// ---------- taps ----------

function tapArmy(id) {
  const a = state.armies.find((x) => x.id === id);
  if (ui.army && ui.army !== id && a.faction !== "celts") return tapRegion(a.region);
  ui.army = ui.army === id ? null : id;
  ui.region = null;
  render();
}

function tapRegion(id) {
  const army = state.armies.find((a) => a.id === ui.army && a.faction === "celts");
  if (army && army.moves > 0 && neighbours(state, army.region).includes(id)) {
    const clash = clashAt(state, "celts", id);
    if (clash) return confirmAttack(army, clash);
    const r = moveArmy(state, army.id, id);
    sfx("march");
    if (r.capture) return askCapture();
    return nextHost(true);
  }
  ui.region = ui.region === id && !ui.army ? null : id;
  ui.army = null;
  render();
}

function confirmAttack(army, clash) {
  const r = state.regions[clash.regionId];
  const { word, tone } = attackOdds(army, clash);
  const who = clash.armies.length ? clash.armies.map((a) => esc(a.name)).join(" and ") : clash.defenderFaction === "free" ? `The warriors of the ${esc(r.name)}` : "The garrison";
  modal(`<h2>${icon("sword")} ${clash.siege ? "Besiege" : "Attack"} ${esc(r.seat || r.name)}?</h2>
    <p>${who} stand${clash.armies.length === 1 || !clash.armies.length ? "s" : ""} against you${clash.siege ? " behind a palisade: batter the gate or climb, then hold the centre" : ""}.</p>
    <p class="odds">Odds: <b class="tone-${tone}">${word}</b></p>
    <div class="choices"><button class="primary" data-action="attack-fight">Lead the attack</button><button data-action="attack-auto">Auto-resolve</button><button data-action="close-modal">Not yet</button></div>`);
  ui.attack = { armyId: army.id, to: clash.regionId };
}

function askCapture() {
  const o = captureOptions(state);
  if (!o) return render();
  render();
  modal(`<h2>${icon("crown")} ${esc(o.region.seat || o.region.name)} is yours</h2>
    <p>${o.roman ? "The Romans are gone. What becomes of this place?" : `The ${esc(o.region.name)} have laid down their arms. How will you treat them?`}</p>
    <div class="choices">
      <button class="primary" data-action="capture" data-choice="peace"><b>${esc(o.peace.label)}</b><small>${esc(o.peace.hint)}</small></button>
      <button data-action="capture" data-choice="plunder"><b>${esc(o.plunder.label)}</b><small>${esc(o.plunder.hint)}</small></button>
    </div>`);
}

// Bring a region into the part of the map not hidden by the panel.
function centre(id) {
  requestAnimationFrame(() => {
    const p = $("panel"), m = $("map").getBoundingClientRect();
    if (p.hidden) return map.centreOn(id);
    const b = p.getBoundingClientRect();
    map.centreOn(id, b.width >= m.width - 20 ? { bottom: m.bottom - b.top } : { right: m.right - b.left });
  });
}

// Select the next host that can still march and bring it into view. After a march, `soft`
// keeps the current host if nothing else is ready, so its panel stays open.
function nextHost(soft = false) {
  const ready = state.armies.filter((a) => a.faction === "celts" && a.moves > 0);
  if (!ready.length) { if (!soft) ui.army = null; return render(); }
  const at = ready.findIndex((a) => a.id === ui.army);
  const next = ready[(at + 1) % ready.length];
  ui.army = next.id; ui.region = null;
  render();
  centre(next.region);
}

// ---------- battles ----------

function fight(battle, auto) {
  const before = battle.units.filter((u) => u.side === battle.playerSide).map((u) => ({ id: u.id, name: u.name, men: u.men }));
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

function finish(b, before) {
  if (!state) return skirmishOver(b);
  const res = applyBattle(state, b);
  sfx(res.won ? "victory" : "defeat");
  const rows = before.map((x) => {
    const u = b.units.find((y) => y.id === x.id);
    const left = u.soldiers.filter((s) => s.alive).length;
    return `<tr><td>${esc(x.name)}</td><td>${x.men}</td><td class="${left < x.men ? "neg" : ""}">${left}</td><td>${u.kills}</td></tr>`;
  }).join("");
  const enemy = b.playerSide === "attacker" ? "defender" : "attacker";
  const killed = b.units.filter((u) => u.side === enemy).reduce((n, u) => n + u.soldiers.filter((s) => !s.alive).length, 0);
  modal(`<h2>${icon(res.won ? "trophy" : "skull")} ${res.won ? "Victory" : "Defeat"}</h2>
    <p>${esc(b.result.reason)}${b.sides[b.playerSide].generalSlain ? " Your war leader fell in the fighting." : ""}${b.sides[enemy].generalSlain ? " Their commander is dead." : ""}</p>
    <p class="muted">${killed} of the enemy lie on the field.</p>
    <table class="results"><tr><th>Band</th><th>Before</th><th>After</th><th>Kills</th></tr>${rows}</table>
    <div class="choices"><button class="primary" data-action="close-modal">Continue</button></div>`, { after: () => (res.capture ? askCapture() : nextPending()) });
  ui.army = state.armies.find((a) => b.clash.attackerIds.includes(a.id) && a.faction === "celts")?.id || ui.army;
  render();
}

// Rome's attacks, one at a time.
function nextPending() {
  if (!state) return;
  if (state.over) return gameOver();
  if (state.capture) return askCapture();
  const p = state.pending[0];
  if (!p) return render();
  const battle = pendingBattle(state, p);
  if (!battle) { state.pending.shift(); render(); return nextPending(); }
  const r = state.regions[p.regionId];
  const att = state.armies.find((a) => a.id === p.attackerIds[0]);
  const defenders = armiesIn(state, r.id, "celts");
  sfx("alert");
  ui.region = r.id; ui.army = null;
  render();
  centre(r.id);
  modal(`<h2>${icon("eagle")} ${esc(att.name)} marches on ${esc(r.name)}!</h2>
    <p>${att.units.length} Roman units under ${esc(att.general.name)}. ${defenders.length ? `${defenders.map((a) => esc(a.name)).join(" and ")} stand${defenders.length > 1 ? "" : "s"} to meet them` : r.garrison.length ? `Only the warriors of ${esc(r.name)} (${r.garrison.length} bands) stand in the way` : "No one stands in the way"}${r.walls ? ", behind the palisade" : ""}.</p>
    <div class="choices"><button class="primary" data-action="pending-fight">Take command</button><button data-action="pending-auto">Auto-resolve</button></div>`);
  ui.pendingBattle = battle;
}

function gameOver() {
  modal(`<h2>${icon(state.over.won ? "crown" : "candle")} ${state.over.won ? "Britannia is free" : "Britannia has fallen"}</h2><p>${esc(state.over.text)}</p>
    <div class="choices"><button class="primary" data-action="to-title">New campaign</button><button data-action="close-modal">Look at the map</button></div>`);
}

// ---------- quick battle ----------

function skirmish() {
  const army = (id, faction, types) => ({ id, faction, units: types.map((t) => newUnit(t)) });
  const celts = army("c", "celts", ["chieftain", "warriors", "warriors", "warriors", "spearmen", "spearmen", "slingers", "javelinmen", "horsemen", "chariots"]);
  const rome = army("r", "rome", ["legate", "legionaries", "legionaries", "legionaries", "auxilia", "auxilia", "archers", "equites", "scorpion"]);
  const terrains = ["hills", "fertile", "plains", "highlands", "coast"];
  const b = createBattle({ region: { id: `q${Date.now() % 1000}`, name: "the Medway", terrain: terrains[Date.now() % terrains.length] }, attacker: { faction: "rome", armies: [rome] }, defender: { faction: "celts", armies: [celts] }, playerSide: "defender", seed: Date.now() % 997 });
  $("title").hidden = true;
  fight(b, false);
}

function skirmishOver(b) {
  const mine = b.result.winner === b.playerSide;
  modal(`<h2>${icon(mine ? "trophy" : "skull")} ${mine ? "Victory" : "Defeat"}</h2><p>${esc(b.result.reason)}</p>
    <div class="choices"><button class="primary" data-action="skirmish">Fight again</button><button data-action="to-title">Back to the title</button></div>`);
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
  modal(`<h2>${icon("scroll")} How to play</h2>
    <ul class="help">
      <li><b>The map:</b> your tribes are blue, Rome's red, free tribes plain. Tap your host and the regions it can reach are marked with March or the odds of a fight (one region a season; all-horse hosts two). Red pulsing borders show where Rome may strike next season. The line at the top of the map says what to do next.</li>
      <li><b>Wheat:</b> each host carries wheat and eats every season, more in winter. At home it lives half off the land outside winter and refills from the granary; the harvest comes in summer and autumn. Abroad it forages in summer and autumn only. Empty wagons mean desertion.</li>
      <li><b>Silver</b> comes from your tribes each season. Recruit and upgrade in your own land; men return to the colours at home.</li>
      <li><b>Taken land:</b> win a tribe over and its warriors join you; plunder it for silver and wheat, but it may rise again and its neighbours will resist harder.</li>
      <li><b>Battles:</b> drag bands into place, then begin. Tap a soldier to select his band; tap ground to march; drag to march and face; tap an enemy to attack. Throw javelins: tap the button, then where they should land. Hit flanks and rears, charge downhill, ambush from woods. War Cry, Rally and Fury can turn a fight. Use ½× to slow time.</li>
      <li><b>Sieges:</b> batter the gate or climb the palisade, then hold the centre.</li>
    </ul>
    <div class="choices"><button class="primary" data-action="close-modal">Back</button></div>`);
}

// ---------- actions ----------

const actions = {
  era: (el) => { ui.era = el.dataset.era; title(); },
  difficulty: (el) => { ui.difficulty = el.dataset.difficulty; title(); },
  "new-game": () => beginCampaign(createCampaign(data, { era: ui.era, difficulty: ui.difficulty, seed: Date.now() % 100000 })),
  continue: () => { const s = load(); if (s) beginCampaign(s); },
  skirmish: () => { closeModal(); skirmish(); },
  "to-title": () => { closeModal(); state = null; title(); },
  "end-turn": () => {
    if (state.pending.length || state.capture) return nextPending();
    if (state.over) return gameOver();
    const notes = endTurn(state);
    sfx("season");
    ui.region = null;
    ui.army = state.armies.find((a) => a.faction === "celts")?.id || null;
    render();
    toast(notes.slice(-1)[0]);
    nextPending();
  },
  "select-army": (el) => { ui.army = el.dataset.army; ui.region = null; render(); },
  "select-army-close": (el) => { closeModal(); ui.army = el.dataset.army; ui.region = null; render(); centre(state.armies.find((a) => a.id === ui.army).region); },
  "next-host": () => nextHost(),
  sheet: () => { ui.sheet = !ui.sheet; render(); },
  "show-threat": () => { const id = romeThreats(state)[0]; if (id) { ui.region = id; ui.army = null; render(); centre(id); } },
  deselect: () => { ui.army = null; ui.region = null; render(); },
  recruit: (el) => { const r = recruit(state, ui.army, el.dataset.type); if (r.ok) sfx("recruit"); else toast(r.reason); render(); },
  upgrade: (el) => { const r = upgrade(state, ui.army, +el.dataset.index, el.dataset.kind); if (r.ok) sfx("build"); else toast(r.reason); render(); },
  disband: (el) => { disband(state, ui.army, +el.dataset.index); render(); },
  transfer: (el) => { transfer(state, ui.army, +el.dataset.index, el.dataset.to); render(); },
  raise: () => { const r = raiseArmy(state, ui.region); if (r.ok) { ui.army = r.army.id; ui.region = null; sfx("recruit"); } else toast(r.reason); render(); },
  capture: (el) => { decideCapture(state, el.dataset.choice); sfx(el.dataset.choice === "plunder" ? "build" : "recruit"); modalAfter = null; closeModal(); if (state.pending.length || state.over) nextPending(); else nextHost(true); },
  "attack-fight": () => { const m = moveArmy(state, ui.attack.armyId, ui.attack.to); if (m.battle) fight(m.battle, false); else closeModal(); },
  "attack-auto": () => { const m = moveArmy(state, ui.attack.armyId, ui.attack.to); if (m.battle) fight(m.battle, true); else closeModal(); },
  "pending-fight": () => { state.pending.shift(); fight(ui.pendingBattle, false); },
  "pending-auto": () => { state.pending.shift(); fight(ui.pendingBattle, true); },
  "close-modal": closeModal,
  help,
  sound: () => { initAudio(); toggleSound(); render(); if (!$("modal").hidden) modal(realm()); },
  menu: () => modal(realm()),
  "zoom-in": () => map.zoom(1.3),
  "zoom-out": () => map.zoom(0.77),
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
