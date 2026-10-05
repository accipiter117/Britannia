// config/balance.js
// Every tunable number in Britannia lives here. All values are provisional.
// Logic files import BALANCE and never hard-code numbers.

export const BALANCE = {

  // ---------- CALENDAR ----------
  seasons: ["Spring", "Summer", "Autumn", "Winter"],

  // ---------- STARTING STATE ----------
  // Food starts at full storage (storageMultiplier x seasonal consumption), set at campaign start.
  startingResources: {
    food: "full",
    timber: 300,
    materials: 300,
    wealth: 300,
  },

  // Militia garrison in each neutral district (only taken by military occupation)
  neutralGarrison: { levies: 150, stance: "Defensive" },

  // ---------- PRODUCTION (per district, per season) ----------
  terrainProduction: {
    fertile: { food: 180, timber: 20,  materials: 20,  wealth: 40 },
    forest:  { food: 70,  timber: 180, materials: 30,  wealth: 25 },
    hills:   { food: 60,  timber: 60,  materials: 150, wealth: 25 },
    plains:  { food: 140, timber: 40,  materials: 40,  wealth: 70 },
    marsh:   { food: 80,  timber: 50,  materials: 30,  wealth: 20 },
    coast:   { food: 100, timber: 40,  materials: 30,  wealth: 100 },
  },

  // Specials add to base production
  specialBonuses: {
    river:           { food: 30, wealth: 10 },
    iron_deposit:    { materials: 60 },
    dense_forest:    { timber: 60 },
    natural_harbour: { wealth: 40, food: 20 },
    roman_road:      { wealth: 20 },
    river_crossing:  { wealth: 10 },
    hillfort:        { defence: 0.25 },
    ancient_hillfort:{ defence: 0.20 },
  },

  // Multiplier on all production by season
  seasonModifiers: {
    Spring: { production: 1.0,  foodProduction: 1.0,  movement: 1.0, construction: 1.0 },
    Summer: { production: 1.15, foodProduction: 1.15, movement: 1.0, construction: 1.0 },
    Autumn: { production: 1.0,  foodProduction: 1.3,  movement: 1.0, construction: 0.9 },
    Winter: { production: 0.8,  foodProduction: 0.4,  movement: 0.67, construction: 0.6 },
  },

  // ---------- CONSUMPTION & STORAGE ----------
  foodPer1000Pop: 100,
  winterConsumptionMultiplier: 1.2,
  storageMultiplier: 1.5,          // default storage = 1.5 x seasonal food consumption
  granaryStorageMultiplier: 3.0,
  timberMaterialsStorageBase: 600, // per district owned
  timberMaterialsStoragePerBuilding: 200,

  // ---------- POPULATION ----------
  populationGrowth: {
    surplus: 0.02,      // per season when fed and food stored > 0
    stable: 0.005,
    winter: 0.0,        // no growth in Winter
    starving: -0.05,    // per season when food hits 0
  },
  workforceShare: 0.6,  // share of civilian pop that works; production scales below 1.0 only if workforce drops
  workforceFloor: 0.5,  // production cannot fall below 50% of base from recruitment

  // ---------- SETTLEMENT ----------
  settlementTiers: [
    { id: "village",    minPop: 0,    militaryCapacity: 100 },
    { id: "town",       minPop: 2000, militaryCapacity: 300 },
    { id: "major_town", minPop: 4000, militaryCapacity: 600, requires: ["market"] },
  ],

  developmentSlots: { wilderness: 2, normal: 3, developed: 4, major: 5 },
  districtDevelopment: {
    dunarraidh: "wilderness", fenmere: "wilderness",
    strath_mor: "developed",  avon_vale: "developed", white_harbour: "developed",
    dun_fhada: "normal", loch_abar: "normal", coille_dubh: "normal",
    caer_bryn: "normal", old_road: "normal",
  },

  // ---------- BUILDINGS ----------
  // cost, build time in seasons, effects. maxPerDistrict: omitted = limited only by slots.
  // Construction progresses by seasonModifiers.construction per season (a 1-season build started in Winter takes 2).
  buildings: {
    farm:          { cost: { timber: 100, materials: 50,  wealth: 100 }, seasons: 1, effect: { food: 250 } },
    granary:       { cost: { timber: 100, materials: 100, wealth: 100 }, seasons: 1, effect: { storage: "granary" }, maxPerDistrict: 1 },
    timber_camp:   { cost: { timber: 100, materials: 50,  wealth: 50  }, seasons: 1, effect: { timber: 120 }, requiresTerrain: ["forest"] },
    mine:          { cost: { timber: 100, materials: 150, wealth: 100 }, seasons: 2, effect: { materials: 120 }, requiresTerrain: ["hills"] },
    workshop:      { cost: { timber: 100, materials: 100, wealth: 150 }, seasons: 2, effect: { constructionCostMultiplier: 0.85 }, maxPerDistrict: 1 },
    warrior_hall:  { cost: { timber: 150, materials: 150, wealth: 150 }, seasons: 2, effect: { unlocks: "warriors", militaryCapacity: 200 }, maxPerDistrict: 1 },
    fortification: { cost: { timber: 200, materials: 250, wealth: 150 }, seasons: 3, effect: { defence: 0.3, militaryCapacity: 100, siegeResistance: 0.3 }, maxPerDistrict: 1 },
    market:        { cost: { timber: 100, materials: 100, wealth: 200 }, seasons: 2, effect: { wealth: 75, enablesTrade: true }, maxPerDistrict: 1 },
    supply_depot:  { cost: { timber: 100, materials: 100, wealth: 100 }, seasons: 1, effect: { supplyRange: 1 }, maxPerDistrict: 1 },
  },
  // Roads are built on a connection, not in a slot
  road: { cost: { timber: 100, materials: 100, wealth: 0 }, seasons: 1, movementCost: 1, supplyRange: 1 },

  // ---------- MILITARY ----------
  // per 100 troops, per season
  formations: {
    levies:      { strength: 1.0, food: 10, wealth: 2,  requires: null },
    warriors:    { strength: 2.0, food: 10, wealth: 8,  requires: "warrior_hall" },
    skirmishers: { strength: 1.2, food: 10, wealth: 6,  requires: null, ranged: true },
    legionaries: { strength: 3.0, food: 12, wealth: 10, romanOnly: true },
  },
  recruitCostWealthPer100: { levies: 20, warriors: 80, skirmishers: 50 },
  recruitBatch: 100,
  // Warriors are professionals: total Warriors across the realm cannot exceed the sum of
  // settlement militaryCapacity plus building militaryCapacity in owned districts.
  professionalFormations: ["warriors"],

  army: {
    startMorale: 70,
    maxMorale: 100,
    defaultCommander: "Average",
    startingCommanders: { western_host: "Skilled", strath_host: "Average", southern_host: "Average" },
    maxArmiesPerFaction: 4,
    fatigueRecoveryPerSeason: 20,
    unpaidMoralePenalty: 10,        // per season of unpaid upkeep (food or wealth)
    visibilityRange: 1,             // connections from owned districts and armies that a faction can see
  },

  movement: {
    basePoints: 3,
    terrainCost: { road: 1, plains: 1, fertile: 1, coast: 1, forest: 2, hills: 2, marsh: 2, mountain: 3 },
    riverCrossingExtra: 1,
    forcedMarch: { bonusPoints: 1, fatigue: 20, moralePenalty: 10 },
  },

  stances: {
    Normal:     { attack: 1.0, defence: 1.0 },
    Defensive:  { attack: 0.85, defence: 1.25 },
    Aggressive: { attack: 1.2, defence: 0.85 },
    "Forced March": { attack: 0.9, defence: 0.8 },
  },

  // Supply: distance in connections from nearest friendly district (roads/depots extend range by 1)
  supply: {
    states: ["Well Supplied", "Adequate", "Strained", "Starving"],
    byDistance: { 0: "Well Supplied", 1: "Adequate", 2: "Strained" }, // 3+ = Starving
    foragingBonus: { fertile: 1, plains: 1 },  // reduces effective distance by 1 in Summer/Autumn
    effects: {
      "Well Supplied": { morale: +5,  attritionPct: 0,    recovery: true },
      "Adequate":      { morale: 0,   attritionPct: 0,    recovery: true },
      "Strained":      { morale: -5,  attritionPct: 0.02, recovery: false },
      "Starving":      { morale: -15, attritionPct: 0.06, recovery: false },
    },
    winterAttritionMultiplier: 2.0, // applies only to Strained/Starving
  },

  recovery: { moralePerSeason: 20, replacementsPctPerSeason: 0.15 }, // replacements only in friendly territory

  // ---------- TACTICAL BATTLE ----------
  battle: {
    gridSize: 12,
    tickSeconds: 1.0,
    defensiveTimerSeconds: 300,
    maxDurationSeconds: 600,
    troopsPerBlock: 100,     // each formation block on the grid represents ~100 troops
    terrain: {
      open:   { attack: 1.0, defence: 1.0, move: 1 },
      forest: { attack: 0.9, defence: 1.25, move: 2, skirmisherBonus: 1.2 },
      hill:   { attack: 1.1, defence: 1.3, move: 2 },
      river:  { attack: 0.8, defence: 0.8, move: 3 },
      road:   { attack: 1.0, defence: 0.9, move: 0.5 },
    },
    flankMultiplier: 1.3,
    rearMultiplier: 1.6,
    casualtyRatePerTick: 0.006,
    effectivenessExponent: 0.6,     // casualties scale with (attack/defence)^this, softening one-sided fights
    engagedMoralePerTick: 0.3,      // morale drain while in melee, scaled by enemy/own effectiveness
    moraleFactorMin: 0.5,           // power multiplier at 0 morale (1.0 at start morale)
    skirmisherRange: 2,             // ranged formations attack from this many cells
    rangedDamageMult: 0.6,          // ranged attacks inflict less than melee
    pursuitLossPct: 0.2,            // routed troops lost to pursuit after the battle
    maxBlocksPerSide: 24,           // larger armies use bigger blocks
    ambushMoraleHit: 10,            // attacker morale loss when ambushed
    objectiveRadius: 1,             // defensive battle: cells around the objective that count as held
    objectiveCaptureSeconds: 15,    // attackers holding the objective uncontested this long win
    fortifiedRadius: 2,             // fortification and hillfort bonuses apply this close to the objective
    rallyMorale: 20,                // routed units that survive rallyDelaySeconds return at this morale
    speeds: [1, 2, 4],              // playback speed options (ticks per second multiplier)

    morale: { start: 70, normal: 50, shaken: 30, breaking: 15, routed: 0 },
    moraleLoss: { per10PctCasualties: 8, flanked: 10, nearbyRout: 12, commanderDeath: 20, fatiguePer20: 5 },
    routPanicRadius: 1,             // a routing block shakes friends this close
    rallyDelaySeconds: 30,  // routed units cannot rejoin before this
    experience: {
      Green:    { power: 1.0,  moraleLossMult: 1.0,  next: 2 },  // battles needed to advance
      Seasoned: { power: 1.1,  moraleLossMult: 0.85, next: 3 },
      Veteran:  { power: 1.2,  moraleLossMult: 0.7,  next: null },
    },
    commander: { Poor: 0.9, Average: 1.0, Skilled: 1.1, Exceptional: 1.2 },
    commanderDeathChancePerBattle: 0.05,
    commanderDeathChanceIfRouted: 0.15,
    autoResolveAvailable: true,
  },

  // ---------- DIPLOMACY ----------
  diplomacy: {
    relationRange: [-100, 100],
    states: { Hostile: -40, Suspicious: -10, Neutral: 30 }, // above 30 = Friendly
    startingRelations: 0,
    exchangeRates: { food: 2, timber: 2, materials: 1.5 }, // units per 1 Wealth
    tradeRelationGain: 3,
    allianceMinRelation: 40,
    refuseAllianceCall: -30,
    limitedAssistance: -10,
    tributeRelationGain: 15,
    declareWar: -50,
    borderArmyPenalty: -3,  // per season with armies next to their territory
    decayToNeutralPerSeason: 2,
    accessMinRelation: 30,          // military access granted above this
    limitedAssistanceWealth: 100,   // "limited assistance" to an ally sends this much Wealth
    peaceStrengthRatio: 0.7,        // a faction this much weaker than its enemy accepts peace
    tradeAmounts: [50, 100, 200],   // per-season trade agreement sizes offered in the UI
    tributeAmount: 100,             // Wealth, Food or Materials sent as tribute
    battleRelationPenalty: -10,
  },

  // ---------- AI ----------
  ai: {
    priorities: ["SURVIVE", "PROSPER", "EXPAND"],
    surviveThreatThreshold: 0.6,  // threat score above this = Survive mode
    expandOpportunityThreshold: 0.5,
    targetWeights: {
      territory: 1.0, resources: 0.8, strategic: 0.7, population: 0.5,
      distance: -0.6, defence: -1.0, supplyDifficulty: -0.7, diplomaticRisk: -0.5,
    },
    attackStrengthRatio: 1.3,     // only attacks with this strength advantage
    earliestWarSeason: 7,
    peacetimeArmsRatio: 1.1,      // in PROSPER, match the strongest visible rival by this much (x personality expand)         // AI will not declare war on a Celtic faction before this season
    loyaltyForAutonomy: 40,       // AI switches conquered districts to Autonomy below this loyalty
    personalities: {
      Warrior:     { expand: 1.3, prosper: 0.8, prefers: ["hills", "chokepoint"] },
      Trader:      { expand: 0.8, prosper: 1.3, prefers: ["coast", "river", "market"] },
      Defender:    { expand: 0.6, prosper: 1.1, survive: 1.3 },
      Diplomat:    { expand: 0.8, alliance: 1.4 },
      Opportunist: { expand: 1.1, attackWeakened: 1.5 },
    },
    factionPersonalities: { strath_mor_kingdom: "Warrior", southern_league: "Trader", rome: "Roman" },
    memorySeasons: 8,
  },

  // ---------- OCCUPATION, CULTURE, LOYALTY ----------
  occupation: {
    stages: ["Occupied", "Administered", "Integrated"],
    toAdministered: { seasons: 2, needsGarrison: true },
    toIntegrated:   { seasons: 4, minLoyalty: 60 },
    startingLoyaltyOnConquest: 30,
  },
  policies: {
    Extract:   { outputToOwner: 1.5, loyaltyPerSeason: -5, culturePerSeason: 0 },
    Autonomy:  { outputToOwner: 0.5, loyaltyPerSeason: +3, culturePerSeason: 0 },
    Integrate: { outputToOwner: 1.0, loyaltyPerSeason: -1, culturePerSeason: 5 }, // culture shift in % per season
  },
  loyalty: {
    unrest: 25, rebellionRisk: 10,
    rebellionChancePerSeason: 0.25,
    rebelArmyPctOfPop: 0.1,
    maxEmergentFactions: 2,
    garrisonBonus: 2,  // loyalty per season while garrisoned
    unrestOutputMult: 0.75,      // production while loyalty is below `unrest`
    starvingLoyalty: -5,         // per season the owner's people starve
    suppressedLoyalty: 10,       // loyalty after a garrison puts down a rising (fear, not love)
    integratedTarget: 80,        // integrated districts drift back towards this loyalty
    integratedDrift: 2,
    rebelColour: "#5c7d5a",
  },

  // ---------- REGIONS ----------
  regionStatus: [
    { id: "Presence",  minShare: 0.01 },
    { id: "Contested", minShare: 0.2 },
    { id: "Majority",  minShare: 0.5 },
    { id: "Dominant",  minShare: 0.8 },
    { id: "Complete",  minShare: 1.0 },
  ],
  regionBonuses: { Majority: { wealth: 0.05 }, Dominant: { wealth: 0.1, loyalty: 1 }, Complete: { wealth: 0.15, loyalty: 2 } },

  // ---------- EVENTS ----------
  events: {
    minorChancePerSeason: 0.35,
    playerChoiceCooldownSeasons: 3, // at most one event choice for the player in this many seasons
    majorChancePerSeason: 0.08,
    harvestFailure: { foodMultiplier: 0.5, seasons: ["Summer", "Autumn"] },
    mineCollapse:   { materialsMultiplier: 0.5, durationSeasons: 2 },
    bandits:        { wealthLoss: 60, loyalty: -5 },
    famineTriggerSeasonsStarving: 2,
    epidemic:       { popLossPct: 0.06, chanceIfOvercrowded: 0.15 },
  },

  // ---------- ROME ----------
  rome: {
    // Season index: 1 = Year 1 Spring. Matches the test plan pressure beats.
    presenceSeason: 14,
    infrastructureSeason: 15,
    warningSeason: 16,
    countdownSeasons: 4,           // invasion lands at season 20 (Year 5 Winter)
    entryDistrict: "old_road",
    firstArmy: { legionaries: 500, skirmishers: 200, commander: "Skilled", experience: "Seasoned" },
    reinforcements: { legionaries: 200, everySeasons: 2, requiresSupplyLine: true },
    behaviour: ["Consolidate", "Secure Supply", "Advance"],
    holdSeasonsBeforeAdvance: 1,   // after capturing a district
    maxArmies: 3,
    maxTotalTroops: 1100,          // reinforcements stop while Rome has this many troops on the island
    celticUnityRelation: -20,      // once Rome lands, Celtic AIs ally against it above this relation
  },

  // ---------- VICTORY ----------
  // Composite score: territory, population, military, economy, regional influence (each 0 to 1 share of total)
  victory: {
    weights: { territory: 0.3, population: 0.2, military: 0.2, economy: 0.15, regional: 0.15 },
    majorPower: 0.35,
    hegemon: 0.5,
    decisiveDominance: 0.7,
    offerEndChronicleAt: "decisiveDominance",
  },
};
