# TECHNICAL ARCHITECTURE

Separate simulation/data from rendering.

Suggested state:
CampaignState
- world
- factions
- armies
- diplomacy
- events
- battles
- season
- historicalState
- chronicle

Suggested code areas:
data/
simulation/
ui/
assets/
config/

Exact framework is an implementation choice unless the existing project dictates otherwise.

Put all balance values in configuration:
production, consumption, movement, combat, population growth, building costs, AI weights, event probabilities, Roman strength, victory thresholds.

Prototype save: localStorage.
Campaign state should be JSON serialisable.

End Season resolution:
1 construction
2 production
3 consumption
4 population
5 army upkeep
6 supply
7 army recovery
8 trade
9 diplomacy
10 AI decisions/actions
11 rebellions
12 events
13 historical events
14 region/control updates
15 Chronicle entries
16 advance season

AI decisions happen once per season.
Battle simulation runs only during battles.

Desktop/mobile use same data model.
