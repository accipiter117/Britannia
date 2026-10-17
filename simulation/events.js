// simulation/events.js
// Owns the small stories that turn up between seasons, the way Civilization and Crusader Kings keep
// "one more turn" alive: a choice or a stroke of luck about one season in three. Each event checks
// whether it fits the moment (`when`), then offers choices whose effects change the campaign.
// No DOM. `rollEvent` picks one at the end of a season; `chooseEvent` applies the player's choice.

import { BALANCE } from "../config/balance.js";
import { nextRandom } from "./random.js";
import { log, newUnit, regionsOf } from "./state.js";
import { maxPop } from "./settlements.js";

const mine = (s) => regionsOf(s, "celts");
const pick = (s, list) => list[Math.floor(nextRandom(s) * list.length)];
const hostsOf = (s) => s.armies.filter((a) => a.faction === "celts");

const EVENTS = {
  harvest: {
    when: (s, season) => season === "Summer" && mine(s).length,
    make: (s) => {
      const r = pick(s, mine(s)), n = 15 + r.pop * 3;
      return { title: "A golden harvest", text: `The fields of the ${r.name} bend under the grain.`, choices: [{ label: `Gather it in (+${n} wheat)`, fx: [["wheat", n]] }] };
    },
  },
  druid: {
    when: (s) => mine(s).length && s.silver >= 50,
    make: (s) => {
      const r = pick(s, mine(s));
      return { title: "The druids ask for a grove", text: `A druid of the ${r.name} asks you to honour the old gods with a sacred grove.`,
        choices: [{ label: "Pay for the grove (50 silver): the tribe flourishes", fx: [["silver", -50], ["growth", r.id, 3]] }, { label: "Refuse politely", fx: [] }] };
    },
  },
  traders: {
    when: (s) => s.wheat >= 60 && mine(s).some((r) => r.coastal),
    make: () => ({ title: "Traders from Gaul", text: "A ship from Armorica beaches on your coast. Its merchants want grain and pay in silver.",
      choices: [{ label: "Sell 50 wheat for 110 silver", fx: [["wheat", -50], ["silver", 110]] }, { label: "Keep the grain", fx: [] }] }),
  },
  raiders: {
    when: (s) => mine(s).some((r) => r.coastal && !hostsOf(s).some((a) => a.region === r.id)),
    make: (s) => {
      const r = pick(s, mine(s).filter((x) => x.coastal && !hostsOf(s).some((a) => a.region === x.id)));
      const loss = Math.min(s.wheat, 25 + r.pop * 4);
      return { title: "Raiders from the sea", text: `Sea raiders burn the shore of the ${r.name}; no host stood there to stop them.`,
        choices: [{ label: `Bear the loss (-${loss} wheat)`, fx: [["wheat", -loss]] }] };
    },
  },
  bard: {
    when: (s) => hostsOf(s).length,
    make: (s) => {
      const a = pick(s, hostsOf(s));
      return { title: "A bard sings of you", text: `A wandering bard sings of ${a.general.name}. Young warriors come asking to follow.`,
        choices: [{ label: `A band of warriors joins ${a.general.name}`, fx: [["band", a.id, "warriors"]] }, { label: "Reward the bard (30 silver) and spread the song: +1 growth everywhere", fx: [["silver", -30], ["growthAll", 1]] }] };
    },
  },
  sickness: {
    when: (s) => mine(s).some((r) => r.pop >= 4),
    make: (s) => {
      const r = pick(s, mine(s).filter((x) => x.pop >= 4));
      return { title: "Sickness", text: `A fever runs through the ${r.name}.`,
        choices: [{ label: "Pay healers (40 silver)", fx: [["silver", -40]] }, { label: "Let it run its course (-1 people)", fx: [["pop", r.id, -1]] }] };
    },
  },
  refugees: {
    when: (s) => mine(s).some((r) => r.pop < maxPop(r)),
    make: (s) => {
      const r = pick(s, mine(s).filter((x) => x.pop < maxPop(x)));
      return { title: "Refugees from Roman land", text: `Families fleeing the Roman tax-gatherers reach the ${r.name}.`,
        choices: [{ label: "Take them in (+1 people)", fx: [["pop", r.id, 1]] }, { label: "Turn them away", fx: [] }] };
    },
  },
  hoard: {
    when: () => true,
    make: () => ({ title: "A hoard in the earth", text: "Ploughmen turn up a hoard of gold torcs and coins from an older age.",
      choices: [{ label: "Into the treasury (+60 silver)", fx: [["silver", 60]] }, { label: "Offer it to the gods in the lake: every war leader gains a star", fx: [["rankAll"]] }] }),
  },
};

export function rollEvent(state, season) {
  if (state.event || state.over || nextRandom(state) > BALANCE.events.chance) return null;
  const ok = Object.entries(EVENTS).filter(([, e]) => e.when(state, season));
  if (!ok.length) return null;
  const [id, e] = pick(state, ok);
  state.event = { id, ...e.make(state) };
  return state.event;
}

export function chooseEvent(state, index) {
  const ev = state.event;
  if (!ev) return;
  state.event = null;
  const c = ev.choices[index] || ev.choices[0];
  for (const [kind, a, b] of c.fx) {
    if (kind === "wheat") state.wheat = Math.max(0, state.wheat + a);
    else if (kind === "silver") state.silver = Math.max(0, state.silver + a);
    else if (kind === "growth") { const r = state.regions[a]; if (r) r.growth += b; }
    else if (kind === "growthAll") for (const r of mine(state)) r.growth += a;
    else if (kind === "pop") { const r = state.regions[a]; if (r) r.pop = Math.max(1, Math.min(maxPop(r), r.pop + b)); }
    else if (kind === "band") { const h = state.armies.find((x) => x.id === a); if (h && h.units.length < BALANCE.maxUnitsPerArmy) h.units.push(newUnit(b)); }
    else if (kind === "rankAll") for (const h of hostsOf(state)) {
      const g = h.general, X = BALANCE.generals.rankXp;
      g.rank = Math.min(X.length - 1, g.rank + 1); g.xp = Math.max(g.xp, X[g.rank]);
    }
  }
  log(state, `${ev.title}: ${c.label}.`, "story");
}
