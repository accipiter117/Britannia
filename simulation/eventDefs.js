// simulation/eventDefs.js
// Owns the catalogue of events. Each event arises from the state (a mine collapses only where
// there is a mine) and offers choices. Events with `prepare` seasons follow the spec's
// lifecycle: WARNING (choose how to prepare) → CRISIS (outcome depends on preparation) →
// CONSEQUENCE (modifiers that last a while) → NEW NORMAL. Text is written for the player;
// AI factions get the same events and choose for themselves.
//
// Def shape: { id, title, major, weight(state, f) -> 0+, district(state, f) -> district|null,
//   prepare: seasons of warning (0 = decide and resolve at once), text(state, ev),
//   choices: [{ label, cost?, needsArmy?, apply(state, ev, fx) }], crisis?(state, ev, fx) }
// fx is the helper set from events.js (resources, loyalty, population, modifiers, notes).

import { BALANCE } from "../config/balance.js";
import { armiesIn, districtsOf, neighbours } from "./campaign.js";

const E = BALANCE.events;
const owned = (state, f) => districtsOf(state, f.id);
const pick = (list, r) => list[Math.floor(r * list.length)];
const hasArmyNear = (state, ev) => armiesIn(state, ev.districtId, ev.factionId).length > 0 ||
  neighbours(state, ev.districtId).some((n) => state.districts[n].owner === ev.factionId && armiesIn(state, n, ev.factionId).length);

export const EVENT_DEFS = [
  {
    id: "blight", title: "Rust in the barley", major: false, prepare: 1,
    weight: (state, f) => owned(state, f).some((d) => d.buildings.includes("farm") || ["fertile", "plains"].includes(d.terrain)) && state.seasonIndex <= 1 ? 1 : 0,
    district: (state, f, r) => pick(owned(state, f).filter((d) => d.buildings.includes("farm") || ["fertile", "plains"].includes(d.terrain)), r),
    text: (state, ev) => `A red rust is creeping through the barley at ${state.districts[ev.districtId].name}. By next season it will reach the whole harvest.`,
    choices: [
      { label: "Burn the worst fields now", hint: "−60 food now; next season's harvest there falls by a fifth", cost: { food: 60 }, apply: (s, ev) => { ev.prepared = "burn"; } },
      { label: "Leave it to the gods", hint: "Risk losing half the harvest there for two seasons", apply: (s, ev) => { ev.prepared = "none"; } },
    ],
    crisis: (state, ev, fx) => ev.prepared === "burn"
      ? fx.modifier(ev, "food", 0.8, 1, "Burned fields")
      : fx.modifier(ev, "food", 0.5, 2, "Blighted harvest"),
  },
  {
    id: "mineCollapse", title: "The mine gives way", major: false, prepare: 0,
    weight: (state, f) => owned(state, f).some((d) => d.buildings.includes("mine")) ? 1 : 0,
    district: (state, f, r) => pick(owned(state, f).filter((d) => d.buildings.includes("mine")), r),
    text: (state, ev) => `A gallery has collapsed in the mine at ${state.districts[ev.districtId].name}. Miners are trapped and the seam is closed.`,
    choices: [
      { label: "Shore it up with timber", hint: "−80 timber; materials there −25% for a season", cost: { timber: 80 }, apply: (s, ev, fx) => fx.modifier(ev, "materials", 0.75, 1, "Mine repairs") },
      { label: "Seal it until spring", hint: "Materials there −60% for two seasons", apply: (s, ev, fx) => fx.modifier(ev, "materials", 0.4, 2, "Mine sealed") },
    ],
  },
  {
    id: "bandits", title: "Outlaws in the woods", major: false, prepare: 1,
    weight: (state, f) => owned(state, f).length ? 1.2 : 0,
    district: (state, f) => [...owned(state, f)].sort((a, b) => a.loyalty - b.loyalty)[0],
    text: (state, ev) => `Outlaws are gathering near ${state.districts[ev.districtId].name}. Next season they will start robbing the roads.`,
    choices: [
      { label: "Send warriors to clear them", hint: "Needs an army in or next to the district; loyalty +5 there", needsArmy: true, apply: (s, ev) => { ev.prepared = "army"; } },
      { label: "Pay them to move on", hint: `−${E.bandits.wealthLoss} Wealth now`, cost: { wealth: E.bandits.wealthLoss }, apply: (s, ev) => { ev.prepared = "paid"; } },
      { label: "Let them be", hint: "Expect theft and anger next season", apply: (s, ev) => { ev.prepared = "none"; } },
    ],
    crisis: (state, ev, fx) => {
      if (ev.prepared === "army") return fx.loyalty(ev.districtId, 5, "The outlaws were hunted down.");
      if (ev.prepared === "paid") return fx.say("The outlaws took the silver and drifted away.");
      fx.res({ wealth: -E.bandits.wealthLoss * 2 });
      return fx.loyalty(ev.districtId, E.bandits.loyalty * 2, "Outlaws robbed the roads and the people blame you.");
    },
  },
  {
    id: "dispute", title: "A quarrel over grazing", major: false, prepare: 0,
    weight: (state, f) => owned(state, f).length ? 1 : 0,
    district: (state, f, r) => pick(owned(state, f), r),
    text: (state, ev) => `Two kin-groups in ${state.districts[ev.districtId].name} are feuding over grazing rights and ask you to judge.`,
    choices: [
      { label: "Judge in person, with gifts to both", hint: "−40 Wealth; loyalty +5 there", cost: { wealth: 40 }, apply: (s, ev, fx) => fx.loyalty(ev.districtId, 5) },
      { label: "Favour the larger kin", hint: "Loyalty −3 there; the feud is over", apply: (s, ev, fx) => fx.loyalty(ev.districtId, -3) },
      { label: "Let them settle it", hint: "Loyalty −6 there", apply: (s, ev, fx) => fx.loyalty(ev.districtId, -6) },
    ],
  },
  {
    id: "raiders", title: "Sails off the coast", major: false, prepare: 1,
    weight: (state, f) => owned(state, f).some((d) => ["coast", "marsh"].includes(d.terrain) || d.special.includes("natural_harbour")) ? 1 : 0,
    district: (state, f, r) => pick(owned(state, f).filter((d) => ["coast", "marsh"].includes(d.terrain) || d.special.includes("natural_harbour")), r),
    text: (state, ev) => `Fishermen have sighted raiders' boats off ${state.districts[ev.districtId].name}. They will land within the season.`,
    choices: [
      { label: "Man the shore", hint: "Needs an army in or next to the district; the raiders turn away", needsArmy: true, apply: (s, ev) => { ev.prepared = "army"; } },
      { label: "Hide the stores inland", hint: "−50 food spoiled in the moving; loyalty −3 there", apply: (s, ev, fx) => { fx.res({ food: -50 }); fx.loyalty(ev.districtId, -3); ev.prepared = "hide"; } },
      { label: "Trust to luck", hint: "Risk losing wealth, food and people", apply: (s, ev) => { ev.prepared = "none"; } },
    ],
    crisis: (state, ev, fx) => {
      if (ev.prepared === "army") return fx.say("The raiders saw spears on the shore and sailed on.");
      if (ev.prepared === "hide") return fx.say("The raiders found empty storehouses and left with little.");
      fx.res({ wealth: -120, food: -100 });
      fx.population(ev.districtId, -0.03);
      return fx.say(`Raiders burned farms near ${state.districts[ev.districtId].name} and carried off goods and captives.`, "MAJOR_DISASTER");
    },
  },
  {
    id: "bounty", title: "A bumper harvest", major: false, prepare: 0,
    weight: (state, f) => (state.seasonIndex === 1 || state.seasonIndex === 2) && owned(state, f).length ? 0.8 : 0,
    district: (state, f, r) => pick(owned(state, f), r),
    text: (state, ev) => `The harvest at ${state.districts[ev.districtId].name} is the best in living memory.`,
    choices: [
      { label: "Fill the granaries", hint: "+150 food", apply: (s, ev, fx) => fx.res({ food: 150 }) },
      { label: "Hold a feast for the realm", hint: "+50 food and loyalty +6 everywhere", apply: (s, ev, fx) => { fx.res({ food: 50 }); fx.loyaltyAll(6); } },
    ],
  },
  {
    id: "smiths", title: "Travelling smiths", major: false, prepare: 0,
    weight: (state, f) => owned(state, f).length ? 0.7 : 0,
    district: (state, f, r) => pick(owned(state, f), r),
    text: (state, ev) => `A band of smiths and wrights has come to ${state.districts[ev.districtId].name}, looking for work.`,
    choices: [
      { label: "Hire them", hint: "−40 Wealth; your next building costs half", cost: { wealth: 40 }, apply: (s, ev, fx) => fx.flag("halfPriceBuilding", true) },
      { label: "Buy their iron", hint: "−50 Wealth; +150 materials", cost: { wealth: 50 }, apply: (s, ev, fx) => fx.res({ materials: 150 }) },
      { label: "Send them on", hint: "Nothing changes", apply: () => {} },
    ],
  },
  {
    id: "bard", title: "A wandering bard", major: false, prepare: 0,
    weight: (state, f) => owned(state, f).length ? 0.6 : 0,
    district: (state, f, r) => pick(owned(state, f), r),
    text: () => "A bard asks for a place at your hearth. He sings of old victories, and he would sing of yours.",
    choices: [
      { label: "Feast him well", hint: "−25 Wealth; loyalty +4 everywhere", cost: { wealth: 25 }, apply: (s, ev, fx) => { fx.loyaltyAll(4); fx.chronicle(`A bard made songs of the ${s.factions[ev.factionId].name}.`); } },
      { label: "Send him on his way", hint: "Nothing changes", apply: () => {} },
    ],
  },
  {
    id: "hardWinter", title: "Signs of a hard winter", major: false, prepare: 1,
    weight: (state, f) => state.seasonIndex === 2 && owned(state, f).length ? 1.2 : 0,
    district: (state, f) => owned(state, f)[0],
    text: () => "The elders read the geese and the berries: this winter will be bitter. Food will be scarce until spring.",
    choices: [
      { label: "Ration the stores now", hint: "Loyalty −4 everywhere; winter food output only −15%", apply: (s, ev, fx) => { fx.loyaltyAll(-4); ev.prepared = "ration"; } },
      { label: "Trust the granaries", hint: "Winter food output −35% across the realm", apply: (s, ev) => { ev.prepared = "none"; } },
    ],
    crisis: (state, ev, fx) => fx.modifierAll("food", ev.prepared === "ration" ? 0.85 : 0.65, 1, "Hard winter"),
  },
  {
    id: "epidemic", title: "Fever", major: true, prepare: 1,
    weight: (state, f) => owned(state, f).some((d) => d.population > d.basePopulation * 1.15 || f.starvingSeasons > 0) ? 1 : 0,
    district: (state, f) => [...owned(state, f)].sort((a, b) => b.population / b.basePopulation - a.population / a.basePopulation)[0],
    text: (state, ev) => `A fever has broken out in crowded ${state.districts[ev.districtId].name}. Healers say it will spread within the season.`,
    choices: [
      { label: "Close the district off", hint: "Loyalty −8 there; its output −40% next season; few deaths", apply: (s, ev, fx) => { fx.loyalty(ev.districtId, -8); ev.prepared = "quarantine"; } },
      { label: "Let life go on", hint: "Risk many deaths there and in your neighbouring districts", apply: (s, ev) => { ev.prepared = "none"; } },
    ],
    crisis: (state, ev, fx) => {
      if (ev.prepared === "quarantine") {
        fx.population(ev.districtId, -0.02);
        ["food", "timber", "materials", "wealth"].forEach((r) => fx.modifier(ev, r, 0.6, 1, "Quarantine"));
        return fx.say(`The fever burned out inside ${state.districts[ev.districtId].name}.`);
      }
      fx.population(ev.districtId, -E.epidemic.popLossPct * 1.4);
      for (const n of neighbours(state, ev.districtId)) if (state.districts[n].owner === ev.factionId) fx.population(n, -0.03);
      return fx.say(`Fever swept out of ${state.districts[ev.districtId].name} and many died.`, "MAJOR_DISASTER");
    },
  },
  {
    id: "firebrand", title: "A firebrand speaks", major: true, prepare: 1,
    weight: (state, f) => owned(state, f).some((d) => d.loyalty < 60) ? 1 : 0,
    district: (state, f) => [...owned(state, f)].sort((a, b) => a.loyalty - b.loyalty)[0],
    text: (state, ev) => `A firebrand is rousing ${state.districts[ev.districtId].name} against you. Crowds grow each night.`,
    choices: [
      { label: "Grant their grievances", hint: "−80 Wealth; loyalty +10 there", cost: { wealth: 80 }, apply: (s, ev, fx) => { fx.loyalty(ev.districtId, 10); ev.prepared = "concede"; } },
      { label: "Arrest him", hint: "Needs an army in or next to the district; loyalty −4, but it ends", needsArmy: true, apply: (s, ev, fx) => { fx.loyalty(ev.districtId, -4); ev.prepared = "arrest"; } },
      { label: "Let him talk", hint: "Risk a sharp fall in loyalty", apply: (s, ev) => { ev.prepared = "none"; } },
    ],
    crisis: (state, ev, fx) => ev.prepared === "none"
      ? fx.loyalty(ev.districtId, -18, `The firebrand turned ${state.districts[ev.districtId].name} against its rulers.`)
      : fx.say("The crowds dispersed."),
  },
  {
    id: "oldRites", title: "The old rites", major: true, prepare: 0,
    weight: (state, f) => owned(state, f).length ? 0.8 : 0,
    district: (state, f, r) => pick(owned(state, f), r),
    text: (state, ev) => state.rome.stage === "invasion"
      ? `Roman priests ask leave to raise a shrine at ${state.districts[ev.districtId].name}. The druids say the grove will not forgive it.`
      : `The druids of ${state.districts[ev.districtId].name} demand a tithe of grain for the midwinter rites.`,
    choices: [
      { label: "Honour the druids", hint: "−80 food; loyalty +8 there, +2 elsewhere", cost: { food: 80 }, apply: (s, ev, fx) => { fx.loyalty(ev.districtId, 8); fx.loyaltyAll(2); } },
      { label: "Refuse them", hint: "Loyalty −8 there", apply: (s, ev, fx) => fx.loyalty(ev.districtId, -8) },
      { label: "Let the Roman priests build", hint: "Only while Rome is in Britannia; relations with Rome +15, loyalty −10 there", romeOnly: true,
        apply: (s, ev, fx) => { fx.loyalty(ev.districtId, -10); fx.relation("rome", 15); } },
    ],
  },
];

// Raised by the engine when Rome takes a district next to a faction's land.
export const REFUGEES = {
  id: "refugees", title: "Refugees", major: false, prepare: 0,
  text: (state, ev) => `Families fleeing the legions have reached ${state.districts[ev.districtId].name} with nothing but what they carry.`,
  choices: [
    { label: "Take them in", hint: "+200 people there; −100 food; loyalty +5 there", cost: { food: 100 }, apply: (s, ev, fx) => { fx.population(ev.districtId, 0, 200); fx.loyalty(ev.districtId, 5); } },
    { label: "Turn them away", hint: "Loyalty −5 there", apply: (s, ev, fx) => fx.loyalty(ev.districtId, -5) },
  ],
};

export function defById(id) {
  return id === REFUGEES.id ? REFUGEES : EVENT_DEFS.find((d) => d.id === id);
}
