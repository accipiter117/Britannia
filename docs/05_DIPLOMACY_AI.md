# DIPLOMACY / AI

## Diplomacy states
Friendly, Neutral, Suspicious, Hostile.

Actions:
Trade, Access, Alliance, Tribute, War.

Trade prototype:
Food↔Wealth
Timber↔Wealth
Materials↔Wealth

Trade requires physical connection and can be disrupted.

Alliance creates obligations:
- Honour alliance: send troops
- Refuse: relationship damage
- Limited assistance: supplies/wealth

Tribute allows weaker factions to offer Food/Wealth/Materials for peace/protection/autonomy.

No marriage, dynasty, family, hostage systems.

## AI
AI behaves like a faction with circumstances, not a perfect player.

Priorities:
SURVIVE / PROSPER / EXPAND

Seasonally calculate:
- Threat
- Opportunity
- Need

Survive actions: retreat, fortify, recruit, seek alliance/peace, stockpile.
Prosper actions: farms, roads, markets, trade, recovery.
Expand actions: choose target, gather, check supply, attack, consolidate.

Target value:
territory value + resource value + strategic value + population value
- distance - defence - supply difficulty - diplomatic risk.

AI personalities are lightweight modifiers:
Warrior, Trader, Defender, Diplomat, Opportunist.

AI makes decisions once per season at End Season.
No resource cheats.
No omniscience.

Strategic memory:
- threat level toward factions
- recent battles
- diplomatic actions
- known weak Districts

Faction preferences can value terrain:
warrior → hills/frontiers/chokepoints
trader → coast/rivers/markets
agricultural → fertile valleys
