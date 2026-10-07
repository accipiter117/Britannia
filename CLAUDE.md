# BRITANNIA INVICTA: Claude Code brief

Read this file first in every session.

## What this is
A browser game modelled closely on Roma Invicta, set in Britannia and played as **the Celts (Britons)** against Rome. A small pixel-art campaign map is only for moving hosts, food and silver; the heart is **real-time-with-pause battles of hundreds of individual pixel soldiers** with formations, charges, skill-shot javelin volleys, morale, stamina, terrain, generals' abilities and sieges.

The owner (Matthew) is not a programmer and plays mostly on his phone via GitHub Pages. Keep code clear, small and easy for future sessions to pick up.

Archived: Britannia v1 (grand strategy) on the `britannia-v1` branch, spec in `docs/v1/`. Caledonia (the Picts prototype) lives in git history before this rewrite.

## Tech
- Vanilla JavaScript ES modules, HTML and CSS. No frameworks, no build step, no runtime dependencies.
- Entry point `index.html`; GitHub Pages deploys from `main` (https://accipiter117.github.io/Britannia/). `skirmish.html` is a dev page for custom battles (`?terrain=&siege=&side=&seed=`).
- Campaign map: a painted map (`assets/britannia-map.webp`, 1024x1536, made with ChatGPT) drawn on a canvas (`ui/mapView.js`), with owner washes, borders and pieces layered over it. The rules use a 320x480 cell grid over the same picture (`simulation/mapGrid.js`): land cells come from `land.runs` in `data/britannia.json` (traced from the painting's sea and closed over thin river channels), and each cell goes to its nearest tribe through a noise warp so borders meander. Replacing the art means re-tracing `land` and re-placing tribe `pos` values (grid units = image pixels / 3.2). Battles: canvas (`ui/battleArt.js`, `ui/battleView.js`), sprites generated in code (`ui/sprites.js`).
- Save: `localStorage` key `britannia-invicta.save.v2`, saved after every action. State must stay JSON-serialisable (battles are rebuilt from the map, never saved).
- Sound is synthesised (`ui/audio.js`).

## Folders
```
config/balance.js       every number: units, formations, ranks, upgrades, generals, abilities, battle, campaign, Rome, difficulty
data/britannia.json     23 tribes (pos, terrain, settlement), the land mask, and the three eras (Caratacus AD 43, Boudica AD 60, Calgacus AD 83)
simulation/             rules only, no DOM
  state.js              campaign state, units, hosts, lookups, power estimates, save/load
  mapGrid.js            land mask, region grid and links
  campaign.js           moving, clashes, capture (win over or plunder), recruiting, upgrades, income, food, end of season
  romeAI.js             Rome's season: replacements, new legions at the port, attacks and marches
  random.js             seeded RNG
  battle/terrain.js     battlefield grid: ground, heights, woods, river, palisade and gate
  battle/setup.js       building a battle from a clash; formation slots; deployment
  battle/soldiers.js    per-soldier movement, duels, missiles
  battle/engine.js      orders, morale, generals, abilities, sieges, victory
  battle/ai.js          battle AI for any side or unit not under the player's hand
ui/                     rendering and input only
tools/                  Node checks (see Testing)
```
Rule: `simulation/` never touches the DOM; `ui/` calls simulation functions and never changes rules.

## Design rules
1. Battles are the heart. The campaign map exists to set up interesting battles.
2. Every number lives in `config/balance.js`.
3. Rome is stronger man for man; the Britons win with numbers, charges, ground, ambush and timing.
4. Food is the only supply rule: hosts carry wheat, eat each season, refill in friendly land, forage abroad in summer and autumn, starve in winter.
5. Taking a tribe offers a choice: win them over (a band joins you) or plunder (silver and wheat, but unrest and angry neighbours).
6. The battle AI and the player use the same rules. No cheats.
7. Mobile first, portrait first: the campaign map and battles are both laid out for a phone held upright; every control must work by touch.

## How battles work
- Field 760x1040, portrait so it fills a phone held upright: armies deploy top and bottom (the player's always at the bottom), a big host in two lines. Ticks of 0.05s; one header button cycles speed (half to 3x) beside pause.
- Every soldier is simulated: units march to formation slots (tight, dense, wild, loose, cavalry), soldiers pick foes and duel. Hit chance from attack vs defence; frontal shields block; flank and rear hits land more; a charge adds damage, knock-downs and morale shock; braced spears and tight ranks blunt horse.
- Missiles fly in arcs (stones, arrows, javelins, pila, scorpion bolts that pierce). Skirmishers keep their distance while they have ammo. "Throw javelins" is a skill shot: aim a volley where the enemy will be.
- Morale falls with losses, flanking, charges and the general's death; units rout and may rally. Stamina drains with running and fighting.
- Woods hide units deployed in them (ambush). Each unit can be handed to the AI, or the whole army.
- Sieges: palisade walls can be climbed slowly, the gate hacked (at most `gateHackers` men at once) or shot by scorpions; defenders get wall bonuses and missile cover. Attackers win by breaking the defenders or holding the centre (`plazaHold`); defenders win at the time limit.

## Campaign screen
- One slim top bar: menu (realm, hosts, chronicle, help, sound), silver, wheat, season, End Season.
- The map fills the screen. A panel opens only when a host or tribe is chosen (side card on desktop, collapsible bottom sheet on phones).
- With a host chosen, reachable regions carry a badge: March, Take, or Fight/Siege with the odds (`attackOdds`). Pulsing red borders mark where Rome may strike next season (`romeThreats`, same rule as Rome's AI).
- The advice line at the top of the map says what to do next and steps through hosts that can still march.
- `window.britanniaMap.screenOf(id)` gives a region's screen position for browser tests.

## Testing
- `node tools/battletest.mjs [runs]`: set-piece battles AI vs AI, win rates and losses. Run after any battle balance change.
- `node tools/battletrace.mjs [field|siege] [every]`: one battle printed unit by unit over time.
- `node tools/campaignsim.mjs [seasons] [idle|bot] [era] [difficulty] [seed]`: the campaign in Node with battles auto-resolved; round-trips the save.
- Browser checks with Playwright from the scratchpad (Chromium is preinstalled); local server `python3 -m http.server 8765`.

## Status
Done: three eras and three difficulties, pixel campaign map with seasons, hosts with food, win over or plunder, revolts, recruiting, upgrades, veterancy, Rome's AI, field battles and sieges with individual soldiers, skill-shot volleys, abilities, per-unit AI hand-over, quick battle.
Next candidates: more unit art variety, battle sounds, campaign events, a real-phone pass, balance from play.
