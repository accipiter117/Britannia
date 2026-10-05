# FINAL CLAUDE BUILD BRIEF

Build Prototype 1 of Britannia from these documents.

The user is not a programmer. Keep the implementation clear and maintainable.

Build the playable simulation first with placeholders.

## Milestones
M1 Map
- 10 Districts, 2 Regions, connections, selection, camera, HUD

M2 Economy
- population/workforce/resources/storage/buildings/construction

M3 Seasons
- production/consumption/winter/population

M4 Armies
- recruitment/formations/movement/stances/supply

M5 AI
- seasonal defence/expansion/recovery

M6 Diplomacy
- trade/access/alliance/tribute/war

M7 Battle
- pre-battle/battlefield/formations/pause/commands/morale/terrain/victory/retreat/campaign consequences

M8 Events/Rome
- minor/major events/Roman chain/invasion

M9 Occupation/Culture
- occupation/admin/integration/loyalty/culture/rebellion

M10 Chronicle/Victory
- history/divergence/dominance/conclusion

M11 Mobile
- drawers/touch/responsive layout

M12 Art
- replace placeholders only after simulation is proven

## Hard rules
1. Campaign state must be serialisable.
2. Balance values configurable.
3. Simulation separate from rendering.
4. District is fundamental world unit.
5. No fixed AD dates in Prototype 1.
6. No major unspecifed systems.
7. Prefer simplest implementation for ambiguity.
8. Prototype save can use localStorage.
9. Desktop/mobile responsive.
10. Keep code suitable for iterative AI-assisted development.

## Do not add
tech tree, dynasties, marriage, detailed religion, Christianity, naval warfare, multiplayer, huge map/factions, complex commodities, Total War-scale battles, Crusader Kings politics, procedural quest system.

## Completion
Player can start campaign, inspect/build Districts, end seasons, recruit/move armies, manage supply, fight battles, recover, trade/diplomatically interact, see AI, receive events, experience Roman invasion, govern occupied territory, see culture/loyalty consequences, continue after setbacks, view Chronicle, save/load, and play on desktop/mobile.

If something is unspecified, choose the simplest implementation that supports the core loop and keep it configurable.
