// config/balance.js
// Every number in the game lives here. Simulation code reads these; nothing is hard-coded.
// Caledonia: the Picts of the north against Roman Britannia.

export const BALANCE = {
  // ---------- CAMPAIGN ----------
  seasons: ["Spring", "Summer", "Autumn", "Winter"],
  startYear: 80,                  // AD; Agricola's push north
  startSilver: 600,
  maxUnitsPerArmy: 10,
  maxArmies: 4,
  newArmyCost: 150,               // raising a new warband under a new chieftain
  requires: { champions: "oppidum", chariots: "lowland" }, // champions muster at an oppidum; chariots need open country
  replenishCostPerMan: 0.25,      // silver per man restored at home
  income: { base: 25, oppidum: 25, fertile: 15, coast: 10 }, // silver per region per season
  upkeepPerUnit: 8,               // silver per unit per season
  supply: {
    homeReplenishPct: 0.15,       // men regained per season in friendly land (pays recruit cost pro rata)
    hostileAttritionPct: 0.04,    // men lost per season outside friendly land
    winterAttritionPct: 0.08,
  },
  movesPerSeason: 1,              // regions per season (2 for an army of only horse and chariots)
  fastMoves: 2,

  // Victory: drive Rome from Eboracum. Defeat: lose every Pictish province.
  victoryRegion: "eboracum",

  // ---------- UNITS ----------
  // men: full strength. attack/defence: melee. charge: bonus on impact. speed: field units/sec.
  // range/ammo/missile: ranged attack. morale: starting nerve. cost: silver to raise.
  units: {
    // Picts
    spearmen:   { name: "Spearmen", side: "picts", men: 160, cost: 60,  attack: 5, defence: 7, charge: 2, speed: 26, morale: 60, antiCav: 1.6, formations: ["line", "shieldwall"], desc: "Steady spear line. Shield wall stops horse and arrows." },
    warband:    { name: "Warband", side: "picts", men: 150, cost: 70,  attack: 9, defence: 4, charge: 9, speed: 32, morale: 65, formations: ["line", "wedge"], desc: "Painted swordsmen. Devastating charge, brittle if it stalls." },
    skirmishers:{ name: "Skirmishers", side: "picts", men: 90, cost: 50, attack: 3, defence: 2, charge: 1, speed: 36, morale: 45, range: 110, ammo: 8, missile: 4, formations: ["loose", "line"], desc: "Javelins and slings. Harass, then run." },
    horsemen:   { name: "Horsemen", side: "picts", men: 70, cost: 90,  attack: 6, defence: 4, charge: 9, speed: 62, morale: 60, mounted: true, formations: ["line", "wedge"], desc: "Fast light horse. Flank, chase, ride down archers." },
    chariots:   { name: "Chariots", side: "picts", men: 40, cost: 110, attack: 7, defence: 4, charge: 14, speed: 58, morale: 60, mounted: true, shock: 12, formations: ["line"], desc: "Thundering shock. One terrible charge; fragile in a grind." },
    champions:  { name: "Champions", side: "picts", men: 80, cost: 130, attack: 11, defence: 7, charge: 9, speed: 30, morale: 85, formations: ["line", "wedge"], desc: "Chosen warriors. Hold a gap or break a line." },
    chieftain:  { name: "Chieftain's Guard", side: "picts", men: 40, cost: 0, attack: 9, defence: 8, charge: 10, speed: 58, morale: 90, mounted: true, general: true, formations: ["line"], desc: "The chieftain and his sworn men." },
    // Rome
    legionaries:{ name: "Legionaries", side: "rome", men: 160, cost: 0, attack: 7, defence: 8, charge: 3, speed: 24, morale: 75, pila: 6, formations: ["line", "testudo"], desc: "Heavy infantry. Pila volley at close range; testudo against missiles." },
    auxilia:    { name: "Auxilia", side: "rome", men: 150, cost: 0, attack: 5, defence: 6, charge: 3, speed: 27, morale: 60, formations: ["line", "shieldwall"], desc: "Provincial infantry, the frontier's backbone." },
    archers:    { name: "Sagittarii", side: "rome", men: 100, cost: 0, attack: 3, defence: 3, charge: 1, speed: 28, morale: 50, range: 170, ammo: 10, missile: 3.5, formations: ["loose", "line"], desc: "Eastern archers with long reach." },
    equites:    { name: "Equites", side: "rome", men: 80, cost: 0, attack: 7, defence: 6, charge: 8, speed: 58, morale: 65, mounted: true, formations: ["line", "wedge"], desc: "Auxiliary cavalry." },
    ballista:   { name: "Ballista", side: "rome", men: 30, cost: 0, attack: 1, defence: 2, charge: 0, speed: 14, morale: 50, range: 300, ammo: 14, missile: 9, artillery: true, formations: ["line"], desc: "Bolt thrower. Long range, slow to reload; breaks gates." },
    legate:     { name: "Legate's Guard", side: "rome", men: 50, cost: 0, attack: 9, defence: 9, charge: 8, speed: 54, morale: 90, mounted: true, general: true, formations: ["line"], desc: "The legate and his escort." },
  },

  // Formations: multipliers. width: frontage relative to line. missileDef: damage taken from missiles (lower is better).
  formations: {
    line:       { label: "Line", attack: 1.0, defence: 1.0, speed: 1.0, width: 1.0, missileDef: 1.0, charge: 1.0 },
    shieldwall: { label: "Shield wall", attack: 0.8, defence: 1.45, speed: 0.55, width: 1.1, missileDef: 0.55, charge: 0.3, braced: true },
    wedge:      { label: "Wedge", attack: 1.15, defence: 0.8, speed: 1.05, width: 0.6, missileDef: 1.1, charge: 1.6 },
    loose:      { label: "Loose", attack: 0.8, defence: 0.75, speed: 1.15, width: 1.6, missileDef: 0.5, charge: 0.7 },
    testudo:    { label: "Testudo", attack: 0.6, defence: 1.5, speed: 0.4, width: 0.8, missileDef: 0.15, charge: 0.2, braced: true },
  },

  // Veterancy: experience to reach each rank and what it gives
  ranks: [
    { xp: 0, label: "Raw", attack: 1.0, defence: 1.0, morale: 0 },
    { xp: 40, label: "Blooded", attack: 1.08, defence: 1.05, morale: 5 },
    { xp: 110, label: "Veteran", attack: 1.16, defence: 1.1, morale: 10 },
    { xp: 220, label: "Elite", attack: 1.25, defence: 1.16, morale: 18 },
  ],
  xp: { perBattle: 15, perKill: 0.25, win: 15 },

  // Upgrades: three levels each; cost per level (x level number)
  upgrades: {
    weapons: { label: "Weapons", perLevel: 0.08, cost: 50 },   // +8% attack per level
    armour:  { label: "Armour", perLevel: 0.08, cost: 50 },    // +8% defence and missile cover per level
    maxLevel: 3,
  },

  // ---------- GENERALS ----------
  generals: {
    auraRadius: 170,              // nearby units hold their nerve
    auraMorale: 4,                // morale per second regained near the general while not routing
    deathMoraleHit: 25,           // every unit on the side when the general falls
    xpPerBattle: 20, xpPerWin: 20,
    rankXp: [0, 50, 130, 250],
  },
  abilities: {
    warcry: { label: "War Cry", cooldown: 45, radius: 220, morale: 22, attack: 1.15, duration: 20, enemyMorale: -10, desc: "Allies nearby take heart and hit harder; enemies nearby falter." },
    rally:  { label: "Rally", cooldown: 60, radius: 260, morale: 45, desc: "Routing warriors nearby turn and fight again." },
    fury:   { label: "Fury of the Glens", cooldown: 70, duration: 15, charge: 1.6, attack: 1.25, desc: "The selected unit fights in a frenzy: harder charge, harder blows, no fatigue." },
    hold:   { label: "Hold the Line", cooldown: 50, radius: 220, defence: 1.25, duration: 20, morale: 15, desc: "Roman: the line braces and steadies." },
  },
  pictAbilities: ["warcry", "rally", "fury"],
  romeAbilities: ["hold"],

  // ---------- BATTLE ----------
  battle: {
    width: 1200, height: 800, cell: 20,  // field units; terrain grid cell size
    tick: 0.1,                            // seconds per simulation step
    speeds: [1, 2, 4],
    timeLimit: 600,                       // seconds; then the defender holds the field
    siegeTimeLimit: 540,
    deployDepth: 170,                     // depth of each side's deployment zone
    killRate: 0.55,                       // base kills per second per engaged unit at even odds
    frontage: 60,                         // men that can fight at once from a unit's front
    contactRange: 10,                     // gap between unit edges that counts as contact
    flankMult: 1.6, rearMult: 2.2,        // damage when hit in the flank or rear
    flankMoralePerSec: 2.5, rearMoralePerSec: 5,
    chargeSeconds: 3,                     // charge bonus lasts this long after impact
    chargeMinRun: 40,                     // distance a unit must run to charge
    chargeShockMorale: 1.2,               // morale hit on impact per point of charge
    casualtyMorale: 55,                   // morale lost per 100% of men lost
    routAt: 0, rallyAt: 30,               // routing units can rally after this many seconds unengaged
    routSeconds: 14,
    nearbyRoutMorale: 6,                  // one-off morale hit to units near a friend that breaks
    pursuitKills: 1.5,                    // multiplier when cutting down a routing unit
    fatiguePerSecRun: 0.6, fatiguePerSecFight: 0.35, fatigueRecover: 0.8,
    missileReload: 4,                     // seconds between volleys
    missileForestCover: 0.5,
    hillAttack: 1.2, hillDefence: 1.15,   // fighting downhill / holding high ground
    forestSpeed: 0.6, forestDefence: 1.15, forestMountedSpeed: 0.45, riverSpeed: 0.4, riverDefence: 0.75,
    ambushRevealRange: 70,                // hidden units are seen inside this range
    ambushMorale: 15,                     // morale hit on a unit charged from hiding
    pilaRange: 55,
    // sieges
    gateHp: 100, gateDamagePerSec: 0.022, // per 100 men hacking at the gate
    artilleryGateDamage: 4,               // per ballista volley
    ladderSpeed: 0.18, ladderDefence: 0.55, // units climbing a wall
    wallDefence: 1.35, wallMissile: 1.3,  // defenders right behind the wall
    wallMorale: 0.55,                     // share of casualty morale felt by defenders behind walls
    garrisonCourage: 12,                  // extra nerve for anyone defending inside walls
    plazaRadius: 70, plazaHold: 45,       // seconds attackers must hold the centre with no defenders
    garrison: { oppidum: ["spearmen", "skirmishers", "spearmen"], fort: ["auxilia", "archers", "auxilia"], village: ["spearmen", "skirmishers"], fortress: ["legionaries", "legionaries", "auxilia", "archers", "ballista"] },
  },

  // ---------- ROME ----------
  rome: {
    legionTemplate: ["legate", "legionaries", "legionaries", "legionaries", "auxilia", "auxilia", "archers", "equites", "ballista"],
    vexillationTemplate: ["legate", "legionaries", "auxilia", "auxilia", "archers", "equites"],
    reinforceEvery: 2,             // seasons between a unit added to each Roman army (while Eboracum holds)
    newArmyEvery: 10,              // seasons between new armies landing at Eboracum
    maxArmies: 4,
    attackRatio: 1.25,             // Rome attacks when this much stronger (walls count)
    siegeRatio: 1.1,
    buildFortSeasons: 2,           // a captured region becomes a walled fort after this long
    campaignSeasons: [2, 10, 18, 26], // seasons when a governor launches a great push (extra army)
  },
};
