# BRITANNIA: Claude Code brief

Read this file first in every session. Only open files in `/docs` when the current milestone needs that detail.

## What this is
A playable browser prototype of a seasonal strategy game set in ancient Britain. The single goal of Prototype 1 is to answer: **is the seasonal campaign loop fun?**

Core loop: LOOK > IDENTIFY > DECIDE > ACT > SEE CONSEQUENCE > END SEASON > WORLD RESOLUTION > REASSESS

The owner (Matthew) is not a programmer and works mostly from his phone. He playtests on GitHub Pages. Keep code clear, small and easy for future Claude sessions to pick up.

## Tech
- Vanilla JavaScript ES modules, HTML and CSS. No frameworks, no build step, no npm dependencies at runtime.
- Entry point: `index.html` at repo root. Deployed by GitHub Pages from `main`.
- Map rendered with SVG (district polygons). Tactical battle on a `<canvas>` or SVG grid.
- Save/load via `localStorage`. Whole campaign state must be JSON serialisable.
- Art is hand-drawn in code (SVG on the map, canvas in battle): no image generation, no image files. UI icons are an SVG sprite (`ui/icons.js`); use `icon(name)`, never emoji.

## Folder structure
```
index.html
css/          styles (mobile first)
config/       balance.js (ALL numbers live here)
data/         starter_campaign.json (map, factions, armies)
simulation/   pure game logic, no DOM access
ui/           rendering and input only
docs/         original spec (reference only)
tools/        Node scripts (sim20.mjs: full-loop sanity run, `node tools/sim20.mjs 24`)
```
`package.json` exists only to mark the repo as ES modules for Node. No dependencies.
Rule: `simulation/` never touches the DOM. `ui/` never changes state directly; it calls simulation functions.

## Hard rules
1. District is the fundamental world unit. Everything hangs off Districts.
2. Every number comes from `config/balance.js`. No magic numbers in logic.
3. Dates are Year and Season only (Year 1 Spring). No AD dates.
4. AI acts once per season at End Season. No resource cheats, no omniscience.
5. Armies never fight just because they are adjacent. Fights happen when one tries to enter the other's District.
6. Population is not currency. Recruiting removes population and workforce.
7. Upkeep is affordability; supply is operational access. Keep them separate.
8. Conquest is fast, governance is slow. Culture changes slowly.
9. Winter punishes poor preparation, it does not randomly destroy kingdoms.
10. Rome is pressure, not a scripted win. The player can defeat Rome.
11. No forced victory ending. Offer Continue or End Chronicle at Decisive Dominance.
12. Capital loss does not end the campaign.
13. When something is unspecified, pick the simplest option that serves the core loop and put any number in `balance.js`.

## Do not add
Tech tree, dynasties, marriage, characters beyond a commander quality value, detailed religion, Christianity, naval warfare, multiplayer, extra factions or districts, complex trade commodities, Total War-scale battles, Crusader Kings politics, procedural quests, cavalry.

## Decisions made after the spec (these override /docs)
- **Food:** spec production numbers are kept. Factions start with full food storage (see `startingResources`) and Farm output is raised to 250 so the deficit can be closed by building. Expect food pressure from turn 1; that is intended.
- **Neutral districts** (Dunarraidh, White Harbour, Fenmere, Old Road) can only be taken by military occupation. Each starts with a small militia garrison.
- **Rome** has its own formation type, Legionaries, plus Skirmishers as auxiliaries. Rome is stronger than any single Celtic faction but weaker than a coalition.
- **Faction IDs differ from district IDs** to avoid collisions: `dun_fhada_confederation`, `strath_mor_kingdom`, `southern_league`, `rome`. Update `starter_campaign.json` accordingly in M1.
- Settlement tiers, development slots, thresholds and Roman strength are provisional values in `balance.js`.

## Session 1 notes (M1 to M3)
- Map cells are Voronoi polygons from each district's `pos` in `starter_campaign.json`, clipped to a hand-drawn coastline (`ui/geometry.js`).
- Workforce: production scales down only when a district's population falls below its starting population (floor `workforceFloor`). Growth above it adds settlement tier, not output.
- Food storage is summed per district (Granary triples that district's share). Timber/Materials cap = per district + per completed building. Wealth is uncapped. Overflow spoils.
- Construction progresses by the season's `construction` modifier, so Winter builds run long.
- Workshop discount applies realm-wide once one is complete. Unique buildings use `maxPerDistrict` in `balance.js`.
- Roads need one owned end; they cost 1 movement and carry supply.
- Army upkeep (step 5) is affordability only; unpaid upkeep costs morale in step 7.
- Balance finding: Wealth (+20/season net for the player after upkeep) is the real bottleneck, while Materials hit their cap within 3 seasons. See `node tools/sim20.mjs`.

## Session 2 notes (M4 to M10)
Where things live:
- `simulation/armies.js` movement, stances, recruitment, capacity, visibility. `supply.js` steps 6 and 7.
- `simulation/engagement.js` entering hostile districts: defender choice, battle setup, aftermath (retreat, capture, experience, commander death).
- `simulation/battle.js` the tactical battle engine; auto-resolve runs the same engine with both sides on AI. `ui/battleView.js` draws it.
- `simulation/ai.js` Celtic AI (step 10). `rome.js` Roman chain and Roman AI (step 13). `diplomacy.js` relations, war, alliances, access, trade (steps 8 and 9).
- `simulation/governance.js` capture, stages, policies, loyalty, culture, rebellion (step 11), regions (step 14), eliminations.
- `simulation/events.js` (step 12). `victory.js` dominance and the closing narrative. `decisions.js` the player's pending choices.
- `simulation/random.js` seeded RNG stored in state, so a save replays identically.

Decisions made:
- Player moves happen immediately during the season; AI and Rome move at End Season. An AI attack on the player becomes a pending decision (Intercept / Hold / Ambush / Withdraw) shown at the start of the next season. End Season is blocked until decisions are made.
- Intercept can use armies in the district or in a district next to both the target and the attacker's origin. Hold is a defensive battle around a stronghold (fortification and hillfort bonuses apply near it; hold for `defensiveTimerSeconds` to win). Ambush needs forest, hills or marsh.
- Supply: road connections carry supply at no cost; a Supply Depot makes neighbouring districts count as friendly; foraging in fertile/plains in Summer/Autumn. Unreachable = Starving.
- Warriors are limited realm-wide by military capacity (settlement tiers plus Warrior Hall and Fortification). Replacements need population and Wealth and only happen in your own district.
- Moving into an empty unclaimed district claims it. Attacking a faction you are not at war with asks to declare war first.
- Rome lands as an engagement "from the sea": beaten landings are thrown back into the sea. Rome pays no upkeep (paid from Gaul) and stops reinforcing at `rome.maxTotalTroops`. After the landing Celtic AIs will ally against Rome (`celticUnityRelation`).
- Rebels: at most `maxEmergentFactions` rebel factions; further rebellions return the district to neutral militia. A garrison puts a rising down instead (with deaths).
- The player sees only armies within `army.visibilityRange` of their land and armies; the AI uses the same rule.
- Balance passes (all in `balance.js`): casualty and morale rates, `effectivenessExponent`, rout panic radius and flanking were tuned so battles last 1 to 3 minutes and Rome beats any single host but loses to about 1,600 Celts. The AI waits until `earliestWarSeason` before declaring war on Celts and builds arms in peacetime (`peacetimeArmsRatio`).

Session 3 changes (recovery and fairness):
- AI declares war one season before it attacks, so the player can move a host to meet it. AI weighs fortifications and avoids districts where it lost a battle in the last `memorySeasons / 2` seasons.
- Intercept: any army in or next to the threatened district can respond.
- Disband (army drawer, −100 per formation): cuts upkeep; troops return to the district's population if it is yours.
- Trade no longer needs a Market; without one the price is cut by `noMarketRate` (sell for half, buy at double).

- Rome rebalanced (session 3): legionary strength 2.5 (from 3.0); battles cap at `maxBlocksPerSide` 14 so big armies form bigger blocks and numbers count on the 12-wide field; defenders in a Hold battle stay on their walls, the stronghold holds while any defender stands within `fortifiedRadius` (3), and walls reduce defenders' morale loss. Measured: Rome's 700 beats a single 700 host every time; 1,000 Celts behind hillfort plus Fortification beat it 8/10; 2,000 Celts beat Rome's 1,100 in the open 7/10.

Art (M12, session 3):
- `ui/art.js` builds the map's vector art: terrain textures per terrain type (dense forest has its own), roundhouse settlements by tier (palisade for towns, great hall for major towns), hillfort ramparts, rivers and the Fenmere ford, harbour, iron, Roman milestone, army standards (Celtic triskele, Roman gilded eagle, rebel mark) and status badges.
- Ownership is a soft tint plus a coloured inner border, not a solid block (per the art brief). Occupied districts get a dashed border.
- `ui/battleArt.js` paints the battlefield once to an offscreen canvas (grass, hills, trees, river, road) and draws blocks as ranks of shields (rectangular gilded scuta for legionaries) with a type letter in the corner.
- Palette and lighting follow `docs/08_ART_AUDIO.md`: muted earth tones, light from the upper left, soft shadows.

- `ui/icons.js`: one SVG sprite of ~45 woodcut-style icons (resources, seasons, settlements, terrain, buildings, nav, events). `ui/format.js` maps game ids to them.

Audio (session 3):
- `ui/audio.js` synthesises everything with Web Audio, no files: wind/rain/birds by season, generative lyre music with four moods (peace, tension, war, crisis) chosen from state each render, and effects (build, recruit, march, battle, clash, season, alert, victory, defeat). Muted by default; the speaker button in the map controls toggles it and the choice is remembered.

Depth pass (session 4):
- Events v2: `simulation/eventDefs.js` (catalogue) and `simulation/events.js` (engine). Events with `prepare` follow WARNING → CRISIS → CONSEQUENCE; their effects linger as `state.modifiers` (production multipliers read by economy.js). Choices can cost resources or need an army in or next to the district. Add new events to the catalogue, not the engine.
- Overtures: `simulation/overtures.js`. Rivals demand tribute, offer tribute for peace, offer trade, and beg for help when Rome strikes. Rome offers client status before the invasion and peace once it has been ashore `rome.settleAfterSeasons` (the New Political Reality). Truces (`diplomacy.truces`) and Roman clients are never attacked by AI or Rome.
- Prosperity (0-100) per district: see `balance.prosperity`; scales Wealth output and growth. Harbour and Sacred Site added (spec 03's optional buildings).
- Map zoom levels: strategic / regional / district (`ZOOM_*_W` in ui/map.js); district zoom shows building plaques and gauges.
- Chronicle screen: `ui/chronicle.js`, opened from More.
- Battle: the commander rides with the strongest block (crown marker) and can fall mid-battle (`commanderRiskPerTick`, `commanderRiskIfRouted`), shaking his side; warriors charge on first contact; veterans recover morale faster between battles.

Board presence and stitched phases (session 5), to move the feel away from menus and toward a board game:
- Armies are painted miniatures (`ui/units.js`): figures per formation share, standard with the faction emblem, troop plaque, movement pips, stance and order marks, supply ring. Each army keeps one SVG node so moves animate as marches. Last-seen enemy hosts stay as faded ghosts (`state.intel`, `army.intelSeasons`).
- Moving: tap a district to preview the route and cost (`ui.preview`), tap again or press March/Attack to commit.
- End Season is played back on the board (`ui/playback.js`) from `state.seasonLog` (written by `logSeason` while `state.logging`): enemy marches, battles, captures, raids, buildings, Rome landing, rebellions, limited to what the player could see. Then one season report card; decisions after it are anchored to their district with a pulsing highlight.
- Army orders (`simulation/orders.js`, `balance.orders`), an alternative to marching, resolved at step 7b: Raid an adjacent enemy or unclaimed district (loot food and wealth, hurt its prosperity, loyalty and relations; repelled if the defence is much stronger), Dig in (entrenched after one End Season: defence ×1.3 when attacked there), Rest (extra recovery, double replacements, own land only). Moving cancels an order. The AI raids at war, digs in when threatened and rests when worn; its raid orders show on the map as burning arrows for a season before they land, so the player can answer them.
- Battle plans (`balance.battle.plans`, `setPlan` in battle.js): Line, Deep (+morale, narrow centre) or Wings (flanks forward, thin centre), chosen on the battlefield before Play. The AI picks by relative strength.
- Seasons tint the land (snow in winter, gold in autumn). During the countdown Rome's fleet gathers at sea and closes on the Old Road; Roman-held districts show as marching camps.

Objectives and the feud (session 6):
- Objectives (`simulation/objectives.js`, card in `ui/objectivesView.js`): eleven goals in four chapters (The Realm, The Feud, The Eagle, Britannia). Up to three open at once, checked at End Season (step after victory), small rewards, Chronicle entries, a flash in the playback. Each has a hint and, where useful, a district to jump to. Add goals to the list; chapters open by `when(state)`.
- Rivalry (`simulation/rivalry.js`, `balance.rivalry`): Strath Mor and the Southern League share no border, so their feud runs through the player's land. Relations sour each season until war (about Year 2 Autumn); then each side asks the player for passage (grant for a toll, join one side, or refuse; refusals slow further requests). A granted host marches through the player's districts (`marchOnRival`, waits at the border until strong enough). Rome's warning ends the feud in a cold peace that can thaw into Celtic unity.

Sieges (session 7, `simulation/siege.js`, `balance.siege`): a fortified district (hillfort or Fortification) left without a defending host is besieged, not taken. The camp shows round the town with its remaining stores as pips. Each End Season (step 10b, after the AI) the stores fall by one; at zero the town is starved out; production halves and loyalty sags meanwhile. The besieger can storm (a real battle against the town's militia, `militiaPct` of its people, behind its walls) or lift. The player besieging gets a decision each season; the AI storms when `aiStormRatio` stronger (Rome at `romeStormRatio`, and its engineers halve the walls). A relieving host attacks the camp; the siege ends when the camp is gone. Besieging hosts are left in place by the AI and Rome; no recruiting in a besieged district. Rome now counts walls before attacking.

Saving: the game saves after every action (in `render()`), not only at End Season.

Testing:
- `node tools/smartbot.mjs [seeds] [seasons]` plays the player's side sensibly and reports how the Confederation fares. Use it after balance changes.
- `node tools/sim20.mjs [seasons]` plays the whole loop in Node with AI, events and Rome, round-tripping the save each season.

## End Season resolution order
1 construction, 2 production, 3 consumption, 4 population, 5 army upkeep, 6 supply, 7 army recovery, 7b army orders (raids, digging in), 8 trade, 9 diplomacy, 10 AI decisions and actions, 10b sieges, 11 rebellions, 12 events, 13 historical events (Rome), 14 region and control updates, 15 Chronicle entries, 16 advance season.

## UI
- Map first. Permanent HUD: faction, Population, Food, Timber, Materials, Wealth, Year/Season, critical warning. Persistent END SEASON button.
- Desktop: map centre, contextual drawer on the right, notifications bar at the bottom.
- Mobile: tap to select, tap selected for drawer, drag to pan, pinch to zoom, swipe drawer down to close. Bottom nav: Realm / Armies / Diplomacy / More.
- Build options always visible; unavailable ones greyed out with a reason.
- Notifications: red critical, amber important, grey info. Tapping one jumps to its location.
- Build responsive from M1. Do not leave mobile until M11.

## Working conventions
- One milestone group per session. Finish with a working, playable build.
- Commit at the end of each session with a clear message, and update the status table below.
- Keep files under roughly 400 lines. Split by system (e.g. `simulation/economy.js`, `simulation/armies.js`).
- Add a short comment at the top of each file saying what it owns.
- After changes, sanity check by running a scripted 20-season simulation in Node where possible (simulation code must be importable without a browser).
- Do not polish balance before the whole loop works.

## Milestones
| # | Milestone | Covers | Status |
|---|-----------|--------|--------|
| M1 | Map | 10 districts, 2 regions, connections, selection, camera, HUD | Done (session 1) |
| M2 | Economy | population, workforce, resources, storage, buildings, construction | Done (session 1) |
| M3 | Seasons | production, consumption, winter, population change, save/load | Done (session 1) |
| M4 | Armies | recruitment, formations, movement, stances, supply, engagement choices | Done (session 2) |
| M5 | AI | Survive / Prosper / Expand, threat/opportunity/need, personalities | Done (session 2) |
| M6 | Diplomacy | relations, trade, access, alliance, tribute, war | Done (session 2) |
| M7 | Battle | real-time with pause, 12x12 grid, morale, terrain, retreat, consequences | Done (session 2) |
| M8 | Events/Rome | minor/major events, Roman chain, invasion via Old Road | Done (session 2) |
| M9 | Occupation | Occupied/Administered/Integrated, policies, loyalty, culture, rebellion | Done (session 2) |
| M10 | Chronicle/Victory | Chronicle log, divergence, dominance, narrative summary | Done (session 2) |
| M11 | Mobile | final touch and drawer polish | Done in emulation (portrait, landscape, small phone, tablet); needs a real-phone pass |
| M12 | Art | only after the simulation is proven | Done (session 3): hand-drawn map, battlefield and UI icons; synthesised audio |

Planned sessions: (1) M1 to M3, (2) M4, (3) M5 to M6, (4) M7, (5) M8 to M9, (6) M10 to M11.

## Spec reference (open only when needed)
- Map, factions, starting armies: `docs/02_PROTOTYPE_MAP.md`, `data/starter_campaign.json`
- Economy and buildings: `docs/03_ECONOMY_BUILDINGS.md`
- Military and battle: `docs/04_MILITARY_BATTLE.md`
- Diplomacy and AI: `docs/05_DIPLOMACY_AI.md`
- Events, Rome, Chronicle, rebellion, victory: `docs/06_EVENTS_ROME_CHRONICLE.md`
- UI: `docs/07_UI_UX.md`, `docs/14_UI_WIREFRAME.txt`
- 20-season pressure beats and acceptance test: `docs/10_PROTOTYPE_TEST_PLAN.md`
