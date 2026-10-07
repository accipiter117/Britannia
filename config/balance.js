// config/balance.js
// Every number in the game lives here. Simulation code reads these; nothing is hard-coded.
// Caledonia (working title): the Celts of Britannia against Rome, in the spirit of Roma Invicta.

export const BALANCE = {
  // ---------- UNITS ----------
  // A unit is a band of individual soldiers. Fields (after Roma Invicta's own unit files):
  //   men: soldiers at full strength. hp: blows a soldier can take. formation: tight | dense | loose | wild | cavalry
  //   rows: ranks in line. attack / defence: melee skill. shield: chance (x6%) to block a blow from the front.
  //   charge: charge energy (bonus damage, knock-downs, morale shock). speed: field units per second.
  //   morale / stamina: nerve and wind. range / ammo / missile: shooting. throw: a skill-shot volley (javelins, pila).
  //   tags: spear (braces against horse), mounted, archer, skirmisher, artillery, general.
  units: {
    // ----- the Britons -----
    warriors:   { name: "Warriors", side: "celts", men: 48, hp: 2, formation: "wild", rows: 3, attack: 7, defence: 4, shield: 4, charge: 8, speed: 34, morale: 62, stamina: 80, throw: { ammo: 1, damage: 2, range: 90 }, cost: 60, desc: "Sword and shield, painted for war. A ferocious charge, and a javelin volley before it." },
    spearmen:   { name: "Spearmen", side: "celts", men: 44, hp: 2, formation: "dense", rows: 3, attack: 4, defence: 6, shield: 5, charge: 3, speed: 30, morale: 60, stamina: 90, tags: ["spear"], cost: 55, desc: "A wall of spears. Horse will not charge home into them." },
    slingers:   { name: "Slingers", side: "celts", men: 26, hp: 1, formation: "loose", rows: 2, attack: 2, defence: 2, shield: 0, charge: 1, speed: 38, morale: 45, stamina: 90, range: 190, ammo: 14, missile: 1, tags: ["skirmisher"], cost: 45, desc: "Stones from the hillsides. Long reach, no stomach for a melee." },
    javelinmen: { name: "Javelin Men", side: "celts", men: 26, hp: 1, formation: "loose", rows: 2, attack: 3, defence: 3, shield: 2, charge: 2, speed: 40, morale: 50, stamina: 90, range: 110, ammo: 6, missile: 2, throw: { ammo: 1, damage: 2, range: 110 }, tags: ["skirmisher"], cost: 50, desc: "Fast and hard-hitting at short range." },
    horsemen:   { name: "Horsemen", side: "celts", men: 16, hp: 3, formation: "cavalry", rows: 2, attack: 6, defence: 4, shield: 3, charge: 10, speed: 72, morale: 60, stamina: 70, tags: ["mounted"], cost: 85, desc: "Light horse. Ride down slingers, strike flanks, chase the beaten." },
    chariots:   { name: "Chariots", side: "celts", men: 8, hp: 6, formation: "cavalry", rows: 1, attack: 7, defence: 4, shield: 2, charge: 18, speed: 66, morale: 65, stamina: 70, throw: { ammo: 2, damage: 2, range: 100 }, tags: ["mounted", "chariot"], cost: 110, desc: "The terror of the Britons: javelins from the car, then a crashing charge." },
    champions:  { name: "Champions", side: "celts", men: 24, hp: 3, formation: "wild", rows: 2, attack: 9, defence: 6, shield: 5, charge: 9, speed: 32, morale: 85, stamina: 85, cost: 120, desc: "Chosen warriors of noble blood. They hold a gap or break a line." },
    chieftain:  { name: "Chieftain", side: "celts", men: 10, hp: 5, formation: "cavalry", rows: 1, attack: 9, defence: 8, shield: 5, charge: 11, speed: 66, morale: 95, stamina: 90, tags: ["mounted", "general"], cost: 0, desc: "The war leader and his sworn riders." },
    // ----- Rome -----
    legionaries:{ name: "Legionaries", side: "rome", men: 40, hp: 2, formation: "tight", rows: 4, attack: 7, defence: 7, shield: 7, charge: 4, speed: 28, morale: 78, stamina: 95, throw: { ammo: 1, damage: 3, range: 70 }, cost: 0, desc: "Heavy infantry: pila, then the gladius behind a wall of scuta." },
    auxilia:    { name: "Auxilia", side: "rome", men: 40, hp: 2, formation: "dense", rows: 3, attack: 5, defence: 6, shield: 6, charge: 3, speed: 30, morale: 62, stamina: 90, cost: 0, desc: "Provincial infantry, the frontier's backbone." },
    archers:    { name: "Sagittarii", side: "rome", men: 26, hp: 1, formation: "loose", rows: 2, attack: 3, defence: 3, shield: 1, charge: 1, speed: 30, morale: 50, stamina: 85, range: 240, ammo: 16, missile: 1, tags: ["archer"], cost: 0, desc: "Eastern archers with a long reach." },
    equites:    { name: "Equites", side: "rome", men: 16, hp: 3, formation: "cavalry", rows: 2, attack: 7, defence: 6, shield: 5, charge: 9, speed: 66, morale: 66, stamina: 80, tags: ["mounted"], cost: 0, desc: "Auxiliary cavalry." },
    scorpion:   { name: "Scorpion", side: "rome", men: 4, hp: 2, formation: "loose", rows: 1, attack: 1, defence: 2, shield: 0, charge: 0, speed: 16, morale: 55, stamina: 90, range: 380, ammo: 20, missile: 3, tags: ["artillery"], cost: 0, desc: "Bolt thrower. Pierces ranks, breaks gates." },
    legate:     { name: "Legate", side: "rome", men: 10, hp: 5, formation: "cavalry", rows: 1, attack: 9, defence: 9, shield: 6, charge: 9, speed: 60, morale: 95, stamina: 90, tags: ["mounted", "general"], cost: 0, desc: "The legate and his escort." },
  },

  // Formation spacing (field units between soldiers) and how they fight
  formations: {
    tight:   { label: "Tight", spacing: 7, depth: 7, jitter: 0.5, defence: 1.15, shieldFront: 75, speed: 0.95 },
    dense:   { label: "Dense", spacing: 8, depth: 8, jitter: 1, defence: 1.05, shieldFront: 70, speed: 1 },
    wild:    { label: "Wild", spacing: 10, depth: 9, jitter: 4, defence: 0.95, shieldFront: 60, speed: 1.05 },
    loose:   { label: "Loose", spacing: 14, depth: 12, jitter: 3, defence: 0.85, shieldFront: 50, speed: 1.1 },
    cavalry: { label: "Cavalry", spacing: 13, depth: 13, jitter: 1.5, defence: 1, shieldFront: 60, speed: 1 },
  },

  ranks: [
    { xp: 0, label: "Raw", attack: 0, defence: 0, morale: 0 },
    { xp: 30, label: "Blooded", attack: 0.5, defence: 0.5, morale: 5 },
    { xp: 80, label: "Veteran", attack: 1, defence: 1, morale: 10 },
    { xp: 160, label: "Elite", attack: 1.5, defence: 1.5, morale: 18 },
  ],
  xp: { perBattle: 10, perKill: 1, win: 10 },
  upgrades: {
    weapons: { label: "Weapons", perLevel: 0.6, cost: 40 },  // + attack per level
    armour:  { label: "Armour", perLevel: 0.6, cost: 40 },   // + defence per level
    maxLevel: 3,
  },

  // ---------- GENERALS ----------
  generals: { auraRadius: 160, auraMorale: 3, deathMoraleHit: 25, xpPerBattle: 20, xpPerWin: 20, rankXp: [0, 40, 100, 200] },
  abilities: {
    warcry: { label: "War Cry", cooldown: 40, radius: 200, morale: 25, attack: 1.5, duration: 18, enemyMorale: -12, desc: "Allies nearby take heart and strike harder; enemies nearby falter." },
    rally:  { label: "Rally", cooldown: 55, radius: 240, morale: 45, desc: "Fleeing warriors nearby turn and fight." },
    fury:   { label: "Fury", cooldown: 60, duration: 15, attack: 2, charge: 1.6, desc: "The chosen band fights in a frenzy: harder blows, a heavier charge, no tiring." },
    hold:   { label: "Hold the Line", cooldown: 45, radius: 200, defence: 1.5, morale: 15, duration: 18, desc: "Roman: the line braces and steadies." },
  },
  celtAbilities: ["warcry", "rally", "fury"],
  romeAbilities: ["hold"],

  // ---------- BATTLE ----------
  battle: {
    width: 760, height: 1040, cell: 20,   // field units (portrait, to fill a phone held upright); terrain grid cell size
    tick: 0.05,                           // seconds per step
    speeds: [0.5, 1, 2, 3],               // slow motion to fast
    timeLimit: 480, siegeTimeLimit: 480,
    deployDepth: 300,
    radius: { foot: 3.2, mounted: 5.5 },  // soldier body radius for spacing
    engageRange: 18,                      // a soldier picks a foe within this
    reach: { foot: 7, mounted: 9 },       // striking distance
    leash: 55,                            // how far a soldier strays from its place in a melee
    attackInterval: 1.1,                  // seconds between blows
    hitBase: 0.5, hitPerSkill: 0.05,      // chance to hit: base + (attack - defence) x this
    shieldPerPoint: 0.06,                 // chance to block a frontal blow per point of shield
    flankBonus: 0.2, flankMoralePerSec: 3, rearAngle: 1.9, // blows from behind (radians off the facing)
    chargeRun: 60,                        // a unit must run this far to charge
    chargeSeconds: 2.5,
    chargeDamage: 0.12, chargeKnock: 0.05, // per point of charge energy: extra damage, knock-down chance
    chargeMorale: 0.9,                    // morale shock per point of charge on impact
    braceVsHorse: 0.25,                   // charge left to horse hitting braced spears in front
    casualtyMorale: 75,                   // morale lost when a unit loses all its men (pro rata)
    nearbyRoutMorale: 8, rallyAt: 35, routSeconds: 12,
    staminaRun: 2.2, staminaFight: 1.2, staminaRest: 2.5, tiredAt: 30,
    reload: 4.5, missileSpread: 14, missileHitRadius: 4.5, shieldVsMissile: 0.08, missileHit: 0.32,
    throwSpread: 16, throwFlight: 0.9,
    artilleryPierce: 3, artilleryReload: 6,
    forestCover: 0.5, forestSpeed: 0.65, forestMountedSpeed: 0.45, riverSpeed: 0.45,
    hillAttack: 0.12, // hit chance bonus for the higher fighter
    ambushReveal: 90, ambushMorale: 15,
    // sieges
    gateHp: 100, gateBlow: 0.12, gateReach: 16, gateHackers: 6, palisadeCover: 0.4, artilleryGate: 2, // only men at the gate face can hack at it
    wallSpeed: 0.15, wallDefence: 2, wallMorale: 0.6, garrisonCourage: 12,
    plazaRadius: 70, plazaHold: 40,
  },

  // ---------- CAMPAIGN ----------
  seasons: ["Spring", "Summer", "Autumn", "Winter"],
  maxUnitsPerArmy: 10,
  maxArmies: 4,
  newArmyCost: 120,
  movesPerSeason: 1, fastMoves: 2,
  upkeepPerUnit: 2,                     // silver per unit per season
  // Wheat: every army carries food. It eats each season; at home or in friendly land it is fed from
  // the region's harvest; abroad it forages in summer and autumn; in winter it eats more and finds none.
  food: {
    carry: 8,                           // seasons of food an army can carry
    eatPerUnit: 1, winterExtra: 0.5,    // food per unit per season (x carry scale)
    forageSummer: 0.5,                  // share of needs found abroad in summer and autumn
    starvingLossPct: 0.12,              // men lost per season when the wagons are empty
  },
  regionYield: { village: { silver: 15, food: 6 }, oppidum: { silver: 30, food: 10 }, fort: { silver: 20, food: 6 }, town: { silver: 45, food: 10 } },
  pacify: { silver: 0, food: 0, unrest: 0 },
  plunder: { silver: 90, food: 12, unrest: 4, nearbyAnger: 1 }, // unrest: seasons a region may rise; neighbours grow wary
  revoltChance: 0.3,                    // per season of unrest, if no host stands there
  replenishPct: 0.2, replenishCost: 1,  // men regained per season at home; silver per man
  garrison: { village: ["warriors", "slingers"], oppidum: ["spearmen", "warriors", "slingers"], fort: ["auxilia", "archers", "auxilia"], town: ["legionaries", "auxilia", "archers"], fortress: ["legionaries", "legionaries", "auxilia", "archers", "scorpion"] },
  requires: { champions: "oppidum", chariots: "lowland" },
  rome: {
    legion: ["legate", "legionaries", "legionaries", "legionaries", "auxilia", "auxilia", "archers", "equites", "scorpion"],
    vexillation: ["legate", "legionaries", "auxilia", "auxilia", "archers", "equites"],
    reinforceEvery: 2, newArmyEvery: 8, maxArmies: 4,
    attackRatio: 1.2,
    fortAfter: 2,
  },
  difficulty: {
    easy:   { label: "Easy", silver: 1.4, romeStrength: 0.8, romeEvery: 1.4 },
    normal: { label: "Normal", silver: 1, romeStrength: 1, romeEvery: 1 },
    hard:   { label: "Hard", silver: 0.8, romeStrength: 1.2, romeEvery: 0.75 },
  },
};
