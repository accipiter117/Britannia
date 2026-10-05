# CALEDONIA: Claude Code brief

Read this file first in every session.

## What this is
A browser game in the spirit of Roma Invicta, played as the **Picts of northern Britannia** against Roman Britain. The focus is **unit movement and battles**: a simple campaign map for moving hosts, simple supply, and real-time-with-pause battles with formations, flanks, charges, morale, terrain, generals' abilities and sieges.

The owner (Matthew) is not a programmer and plays mostly on his phone via GitHub Pages. Keep code clear, small and easy for future sessions to pick up.

The previous game (Britannia v1: seasonal grand strategy with economy, diplomacy, events) is archived on the `britannia-v1` branch, and its spec is in `docs/v1/`. Nothing from it is in use on `main`.

## Tech
- Vanilla JavaScript ES modules, HTML and CSS. No frameworks, no build step, no runtime dependencies.
- Entry point `index.html`; GitHub Pages deploys from `main` (https://accipiter117.github.io/Britannia/).
- Campaign map: SVG (`ui/mapView.js`, Voronoi regions from `ui/geometry.js`). Battles: `<canvas>` (`ui/battleArt.js`, `ui/battleView.js`).
- Save: `localStorage` key `caledonia.save.v1`, saved after every action. State must stay JSON-serialisable (battles are rebuilt from the map, never saved).
- Art is drawn in code; icons are the SVG sprite in `ui/icons.js`. Sound is synthesised (`ui/audio.js`, `setScene({ season, mood })`).

## Folders
```
config/balance.js     every number: units, formations, ranks, upgrades, abilities, battle, campaign, Rome
data/caledonia.json   regions (pos, terrain, owner, settlement, garrison), links, starting hosts
simulation/           rules only, no DOM
  state.js            campaign state, units, lookups, save/load
  campaign.js         moving, clashes, recruiting, upgrades, income, supply, applying battles, end of season
  romeAI.js           Rome's season: reinforcements, new legions, attacks and marches
  random.js           seeded RNG
  battle/terrain.js   battlefield grid: ground types, heights, walls and gate
  battle/setup.js     building a battle from a clash; deployment
  battle/engine.js    the battle rules, stepped every 0.1s
  battle/ai.js        battle AI for any side the player is not commanding
ui/                   rendering and input only
tools/                Node checks (see Testing)
```
Rule: `simulation/` never touches the DOM; `ui/` calls simulation functions and never changes rules.

## Design rules
1. Battles are the heart. Anything on the campaign map exists to set up interesting battles.
2. Every number lives in `config/balance.js`.
3. Rome is stronger unit for unit; the Picts win with ground, timing, flanks, charges and numbers.
4. Supply is one rule: hosts outside friendly land lose men each season; at home they regain them for silver.
5. Silver is the only currency.
6. The battle AI and the player use the same rules. No cheats.
7. Mobile first: every battle control must work by touch.

## How the battle engine works (engine.js)
- Field 1200x800 units; terrain grid of 20-unit cells (open, forest, river, ford, marsh, wall, gate) with heights.
- Units are rectangles (`unitSize`) facing an angle. Contact = footprints within `contactRange`.
- Melee: kills per second scale with attack/defence (type, rank, upgrades, formation, morale, fatigue, buffs), multiplied for flank/rear (`aspect`), charge (a run of `chargeMinRun` before contact; braced formations blunt it), downhill, anti-cavalry, climbing.
- Morale falls with casualties, flank/rear contact, charges, ambushes, nearby routs and the general's death; recovers near the general. At 0 a unit routs, may rally after `routSeconds` unthreatened.
- Missiles: volleys every `missileReload` with ammo; cover from formation, armour, woods and walls. Legionaries throw pila once at close range.
- Ambush: units starting in woods are hidden until they move out, fight or an enemy comes within `ambushRevealRange`.
- Sieges: walls are climbable by foot (slow, vulnerable), the gate must be battered (or shot by ballistae) for horse; defenders inside walls get defence, morale and missile bonuses and cannot be flanked across the wall. Attackers win by breaking the defenders or holding the centre (`plazaHold`); defenders win at the time limit.
- Abilities (general must live): War Cry, Rally, Fury of the Glens (Picts); Hold the Line (Rome).

## Testing
- `node tools/battletest.mjs [runs]`: set-piece battles AI vs AI, win rates and losses. Run after any battle balance change.
- `node tools/battletrace.mjs [field|siege] [every]`: one battle printed unit by unit over time, for debugging.
- `node tools/campaignsim.mjs [seasons] [idle|bot] [seed]`: the campaign in Node with every battle auto-resolved; round-trips the save.
- Browser checks with Playwright from the scratchpad (Chromium is preinstalled); local server `python3 -m http.server 8765`.

## Status (session 1 of Caledonia)
Done: campaign map, hosts, recruiting, upgrades, veterancy, generals with ranks, supply, Rome's AI, field battles, sieges, ambushes, abilities, deployment, results, save.
Next candidates: battle polish (unit art, sounds, battle speed feel), more Pictish unit variety, campaign events, a real-phone pass.
