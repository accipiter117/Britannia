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
- Placeholder art only: coloured shapes, emoji or simple icons. No image generation.

## Folder structure
```
index.html
css/          styles (mobile first)
config/       balance.js (ALL numbers live here)
data/         starter_campaign.json (map, factions, armies)
simulation/   pure game logic, no DOM access
ui/           rendering and input only
docs/         original spec (reference only)
tools/        Node scripts (sim20.mjs: 20-season sanity run, `node tools/sim20.mjs`)
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
- Roads need one owned end; drawn on the map; movement/supply effects arrive in M4.
- Army upkeep (step 5) is already deducted, as affordability only; unpaid upkeep is flagged on the army for M4 to use.
- End Season steps 6 to 14 are stubbed with comments naming their milestone in `simulation/season.js`.
- AI factions run the same economy but take no actions until M5, so they starve meanwhile.
- Balance finding: Wealth (+20/season net for the player after upkeep) is the real bottleneck, while Materials hit their cap within 3 seasons. See `node tools/sim20.mjs`.

## End Season resolution order
1 construction, 2 production, 3 consumption, 4 population, 5 army upkeep, 6 supply, 7 army recovery, 8 trade, 9 diplomacy, 10 AI decisions and actions, 11 rebellions, 12 events, 13 historical events (Rome), 14 region and control updates, 15 Chronicle entries, 16 advance season.

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
| M4 | Armies | recruitment, formations, movement, stances, supply, engagement choices | Not started |
| M5 | AI | Survive / Prosper / Expand, threat/opportunity/need, personalities | Not started |
| M6 | Diplomacy | relations, trade, access, alliance, tribute, war | Not started |
| M7 | Battle | real-time with pause, 12x12 grid, morale, terrain, retreat, consequences | Not started |
| M8 | Events/Rome | minor/major events, Roman chain, invasion via Old Road | Not started |
| M9 | Occupation | Occupied/Administered/Integrated, policies, loyalty, culture, rebellion | Not started |
| M10 | Chronicle/Victory | Chronicle log, divergence, dominance, narrative summary | Not started |
| M11 | Mobile | final touch and drawer polish | Not started |
| M12 | Art | only after the simulation is proven | Not started |

Planned sessions: (1) M1 to M3, (2) M4, (3) M5 to M6, (4) M7, (5) M8 to M9, (6) M10 to M11.

## Spec reference (open only when needed)
- Map, factions, starting armies: `docs/02_PROTOTYPE_MAP.md`, `data/starter_campaign.json`
- Economy and buildings: `docs/03_ECONOMY_BUILDINGS.md`
- Military and battle: `docs/04_MILITARY_BATTLE.md`
- Diplomacy and AI: `docs/05_DIPLOMACY_AI.md`
- Events, Rome, Chronicle, rebellion, victory: `docs/06_EVENTS_ROME_CHRONICLE.md`
- UI: `docs/07_UI_UX.md`, `docs/14_UI_WIREFRAME.txt`
- 20-season pressure beats and acceptance test: `docs/10_PROTOTYPE_TEST_PLAN.md`
