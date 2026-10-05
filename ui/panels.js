// ui/panels.js
// Owns the bottom-nav panels: Realm overview, Armies list, Diplomacy list and More
// (Chronicle, save, load, new campaign). Returns HTML with data-action buttons.

import { BALANCE } from "../config/balance.js";
import { districtsOf, seasonName } from "../simulation/campaign.js";
import { allied, atWar, canTrade, hasAccess, hasMarket, relation, relationState, tradePrice } from "../simulation/diplomacy.js";
import { dominanceLevel } from "../simulation/victory.js";
import { visibleArmies } from "../simulation/armies.js";
import { regionStatus } from "../simulation/governance.js";
import { RESOURCES, forecast, settlementTier, storageCaps } from "../simulation/economy.js";
import { ICON, SEASON_ICON, TIER_ICON, esc, factionColour, label, num, signed } from "./format.js";

const CH_ICON = {
  FOUNDING: "📜", BATTLE: "⚔️", VICTORY: "🏆", DEFEAT: "💀", SETTLEMENT_FOUNDED: "🏘️", SETTLEMENT_DESTROYED: "🔥",
  FACTION_DEFEATED: "🕯️", ALLIANCE: "🤝", REBELLION: "🔥", INVASION: "🦅", COMMANDER_DEATH: "⚰️",
  MAJOR_DISASTER: "☠️", HISTORICAL_DIVERGENCE: "✨",
};

export function realmPanel(state) {
  const fid = state.playerFactionId;
  const f = state.factions[fid];
  const fc = forecast(state, fid);
  const caps = storageCaps(state, fid);
  const season = seasonName(state);

  const rows = RESOURCES.map((r) => {
    const use = r === "food" ? -(fc.consumption + fc.upkeep.food) : r === "wealth" ? -fc.upkeep.wealth : 0;
    return `<tr><td>${ICON[r]} ${label(r)}</td><td>${num(f.resources[r])}<small class="muted">/${num(caps[r])}</small></td>
      <td class="pos">${signed(fc.production[r])}</td><td class="${use < 0 ? "neg" : ""}">${signed(use)}</td>
      <td class="${fc.net[r] < 0 ? "neg" : "pos"}">${signed(fc.net[r])}</td></tr>`;
  }).join("");

  const districts = districtsOf(state, fid).map((d) => {
    const jobs = d.construction.map((c) => `🚧 ${label(c.building)}`).join(", ");
    return `<button class="row" data-action="select-district" data-district="${d.id}">
      <span>${TIER_ICON[settlementTier(d).id]} <b>${esc(d.name)}</b></span>
      <span class="muted">${ICON.population}${num(d.population)} ${jobs ? "· " + jobs : ""}</span></button>`;
  }).join("");

  const wintry = season === "Autumn"
    ? `<p class="hint">Winter is next: food output falls to 40% and the people eat 20% more. Fill the granaries now.</p>` : "";

  return `
    <header class="panel-head" style="--fc:${f.colour}"><h2>${esc(f.name)}</h2>
      <p>${season} ${SEASON_ICON[season]} forecast for End Season</p></header>

    <section>
      <table class="prod"><tr><th></th><th>Stored</th><th>In</th><th>Out</th><th>Net</th></tr>${rows}</table>
      <p class="muted small">Out = people's food (${num(fc.consumption)}) and army upkeep (${ICON.food}${num(fc.upkeep.food)} ${ICON.wealth}${num(fc.upkeep.wealth)}). Surplus beyond storage spoils.</p>
      ${fc.famine ? `<p class="hint critical">Food will run out at End Season. Starving districts lose 5% of their people each season.</p>` : ""}
      ${wintry}
    </section>
    <section><h3>Districts</h3>${districts}</section>
    <section><h3>Standing</h3>
      <div class="kv">
        ${state.regions.map((r) => `<span>${esc(r.name)}</span><b>${regionStatus(state, fid, r.id) || "No presence"}</b>`).join("")}
        <span>Dominance</span><b>${Math.round((state.victory.score?.[fid] || 0) * 100)}% ${dominanceLevel(state.victory.score?.[fid] || 0) || ""}</b>
        <span>Rome</span><b>${romeText(state)}</b>
      </div>
      <p class="muted small">Dominance weighs territory, people, armies, economy and regions. Major Power ${Math.round(BALANCE.victory.majorPower * 100)}%, Hegemon ${Math.round(BALANCE.victory.hegemon * 100)}%, Decisive ${Math.round(BALANCE.victory.decisiveDominance * 100)}%.</p>
    </section>`;
}

function romeText(state) {
  const r = state.rome;
  return { consolidation: "Busy in Gaul", presence: "Envoys in the south", infrastructure: "Building roads", warning: `Lands in ${r.countdown} season${r.countdown === 1 ? "" : "s"}!`, invasion: `Invading (${districtsOf(state, "rome").length} districts)`, repulsed: "Driven into the sea" }[r.stage] || r.stage;
}

export function armiesPanel(state) {
  const fid = state.playerFactionId;
  const mine = state.armies.filter((a) => a.factionId === fid);
  const others = visibleArmies(state, fid).filter((a) => a.factionId !== fid);
  const row = (a) => {
    const troops = a.formations.reduce((n, f) => n + f.troops, 0);
    return `<button class="row" data-action="select-army" data-army="${a.id}">
      <span><i class="swatch" style="background:${factionColour(state, a.factionId)}"></i><b>${esc(a.name)}</b></span>
      <span class="muted">${a.factionId === fid ? num(troops) : "about " + num(Math.round(troops / 100) * 100)} at ${esc(state.districts[a.districtId].name)}</span></button>`;
  };
  return `<header class="panel-head"><h2>Armies</h2></header>
    <section><h3>Your hosts</h3>${mine.map(row).join("") || `<p class="muted">None</p>`}</section>
    <section><h3>Seen abroad</h3>${others.map(row).join("") || `<p class="muted small">No foreign armies in sight.</p>`}</section>
    <p class="hint">Select an army, then Move and tap a highlighted district. Red districts mean battle.</p>`;
}

export function diplomacyPanel(state) {
  const me = state.playerFactionId;
  const D = BALANCE.diplomacy;
  const rows = Object.values(state.factions).filter((f) => !f.player && !f.defeated).map((f) => {
    const n = districtsOf(state, f.id).length;
    const rel = relation(state, me, f.id);
    const war = atWar(state, me, f.id);
    const ally = allied(state, me, f.id);
    const access = hasAccess(state, me, f.id);
    const status = war ? `<b class="neg">At war</b>` : ally ? `<b class="pos">Allied</b>` : f.id === "rome" ? (state.rome.stage === "invasion" ? `<b class="neg">Invader</b>` : "Watching") : relationState(rel);
    const trade = canTrade(state, f.id);
    const btn = (action, text, extra = "", ok = true) => `<button data-action="diplo" data-faction="${f.id}" data-do="${action}" ${extra} ${ok ? "" : "disabled"}>${text}</button>`;
    const isRome = f.id === "rome";
    const actions = isRome
      ? [btn("tribute", `Send tribute (${D.tributeAmount} ${ICON.wealth})`), war ? "" : btn("war", "Declare war", 'class="danger"')].join("")
      : war
      ? btn("peace", "Propose peace")
      : [
          ally ? "" : btn("alliance", "Propose alliance", "", rel >= D.allianceMinRelation - 10),
          access ? "" : btn("access", "Request access"),
          btn("tribute", `Send tribute (${D.tributeAmount} ${ICON.wealth})`),
          btn("war", "Declare war", 'class="danger"'),
        ].join("");
    const tradeUi = war || isRome ? "" : `<div class="trade">
        <select data-trade="${f.id}">${["food", "timber", "materials"].flatMap((r) => D.tradeAmounts.map((amt) =>
          `<option value="sell:${r}:${amt}">Sell ${amt} ${r}/season for ${tradePrice(state, { from: me, to: f.id, resource: r, amount: amt }).gets} ${ICON.wealth}</option>
           <option value="buy:${r}:${amt}">Buy ${amt} ${r}/season for ${tradePrice(state, { from: f.id, to: me, resource: r, amount: amt }).pays} ${ICON.wealth}</option>`)).join("")}</select>
        ${btn("trade", "Agree trade", "", trade.ok)}
        ${trade.ok ? "" : `<small class="reason">${esc(trade.reason)}</small>`}
      </div>`;
    return `<div class="faction-card" style="--fc:${f.colour}">
      <div class="fc-head"><b><i class="swatch"></i>${esc(f.name)}</b><span>${status} <small class="muted">${rel > 0 ? "+" : ""}${rel}</small></span></div>
      <p class="muted small">${n ? `${n} district${n > 1 ? "s" : ""}` : f.id === "rome" ? "Beyond the sea" : "Landless"} · ${f.personality}${f.id === "rome" ? "" : ` · ${f.mode}`}${access && !ally ? " · grants you access" : ""}</p>
      <div class="buttons">${actions}</div>
      ${tradeUi}
    </div>`;
  }).join("");
  const trades = state.diplomacy.trades.map((t, i) => {
    if (t.from !== me && t.to !== me) return "";
    const other = state.factions[t.from === me ? t.to : t.from].name;
    return `<div class="row"><span>${t.from === me ? "Selling" : "Buying"} ${t.amount} ${t.resource} ${t.from === me ? "to" : "from"} ${esc(other)}${t.disrupted ? ` <b class="neg">disrupted</b>` : ""}</span>
      <button data-action="cancel-trade" data-index="${i}">Cancel</button></div>`;
  }).join("");
  return `<header class="panel-head"><h2>Diplomacy</h2></header>
    ${rows}
    ${trades ? `<section><h3>Trade agreements</h3>${trades}</section>` : ""}
    <p class="muted small">Relations drift towards neutral each season. Trade needs a safe border${hasMarket(state, me) ? "" : `, and without a Market middlemen take half`}; armies parked on someone's border sour relations.</p>`;
}

export function morePanel(state, saveInfo) {
  const entries = [...state.chronicle].reverse().slice(0, 60)
    .map((c) => `<li class="ch-${c.type || "LOG"}"><small class="muted">${esc(c.date)}</small> ${CH_ICON[c.type] || ""} ${esc(c.text)}</li>`).join("");
  return `<header class="panel-head"><h2>More</h2></header>
    <section class="buttons">
      <button data-action="save">Save</button>
      <button data-action="load" ${saveInfo ? "" : "disabled"}>Load</button>
      <button data-action="ending">${state.victory.ended ? "Read the Chronicle's close" : "End Chronicle"}</button>
      <button data-action="new" class="danger">New campaign</button>
    </section>
    <p class="muted small">${saveInfo ? `Saved: ${esc(saveInfo)}. ` : ""}The game also saves itself every End Season.</p>
    <section><h3>Chronicle</h3><ul class="chronicle">${entries}</ul></section>
    <details class="help"><summary>How to play</summary>
      <ul>
        <li><b>Map:</b> tap a district or army to select it, tap again for its full panel. Drag to pan, pinch or scroll to zoom.</li>
        <li><b>Build:</b> in your district's panel. Greyed options say why. Farms first: every faction starts short of food.</li>
        <li><b>Armies:</b> select one, press Move, tap a highlighted district. Red means battle. Your moves happen at once; everyone else moves at End Season.</li>
        <li><b>Recruit:</b> raising troops costs Wealth and takes people from the land. Warriors need a Warrior Hall.</li>
        <li><b>Supply:</b> armies far from friendly land go hungry and shrink, worse in Winter. Roads and Supply Depots help.</li>
        <li><b>Battle:</b> tap your blocks (light outline) to select, tap ground to move, tap an enemy to attack. Press Play; pause any time. Morale breaks armies before they die.</li>
        <li><b>Defence:</b> when attacked you choose Intercept, Hold, Ambush or Withdraw at the start of your season.</li>
        <li><b>Conquest:</b> taken districts are Occupied, then Administered (keep an army there), then Integrated. Pick a policy; low loyalty breeds rebellion.</li>
        <li><b>Rome:</b> watch the south. When the warning comes, you have four seasons.</li>
      </ul>
    </details>`;
}
