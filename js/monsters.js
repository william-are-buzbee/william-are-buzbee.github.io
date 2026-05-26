// ==================== MONSTER DATA ====================
import { DMG, LAYER_SURFACE, LAYER_UNDER,
         HP_PER_SIZE, STAT_MAX, MAX_DODGE_CHANCE, BASE_ACCURACY, ACC_PER_VISUAL,
         DAMAGE_SIZE_COEFF, DAMAGE_STR_COEFF, CREATURE_PATHWAYS, initBodyMap } from './constants.js';
import { T } from './terrain.js';
import { rand, randi, roll100 } from './rng.js';

const MON = {
  // PLAINS
  hare:       ['Small Grazer',   'SMALL_GRAZER',
               20, 30, 20, 50, 40, 20, 40,  1, 0,
               2,  [0,1],
               ['flesh','beast'], DMG.BLADE,
               [T.GRASS],          LAYER_SURFACE,
               15, 1,
               0, 2,                // passive, tiny aggro
               [T.GRASS,T.DIRT,T.DIRT_ROAD,T.BEACH],
               0, 0,
               '#7a8070',           // muted gray-green, plated integument
               null],
  // FOREST
  wolf:       ['Meso-Predator',  'MESO_PRED',
               40, 40, 60, 10, 30, 50, 10,  2, 1,
               12, [2,6],
               ['flesh','beast'], DMG.BLADE,
               [T.FOREST],            LAYER_SURFACE,
               40, 2,
               1, 3,                // territorial, reduced aggro range
               [T.FOREST,T.GRASS,T.MUD,T.DIRT,T.DIRT_ROAD,T.BEACH],  // roams freely across most terrain
               5, 2,                // solo chase ~5 tiles; personalities adjust for pack/wary
               '#5a4a40',           // dark warm gray-brown, wrinkled skin
               {nightVision:true}],
  goblin:     ['Forest Goblin',  'GOBLIN',
               30, 30, 40, 0, 40, 40, 0,  2, 2,
               12, [6,16],
               ['flesh'], DMG.BLADE,
               [T.FOREST], LAYER_SURFACE,
               45, 2,
               2, 4,
               [T.FOREST],
               3, 3,                // search a bit — they're clever
               '#887040',           // dirty brown — distinct from treant green
               {nightVision:true}],
  treant:     ['Treant',         'TREANT',
               80, 80, 20, 0, 20, 10, 0,  3, 5,
               35, [8,18],
               ['plant'], DMG.BLUNT,
               [T.FOREST], LAYER_SURFACE,
               20, 4,
               0, 1,                // passive — ignore unless hit
               [T.FOREST],
               2, 0,                // lumber slowly, won't search
               '#5a7a3a',           // forest green (it IS the forest)
               null],
  // DESERT
  scorpion:   ['Dune Scorpion',  'SCORPION',
               30, 40, 30, 0, 30, 10, 0,  3, 4,
               22, [4,12],
               ['insect','shelled'], DMG.POISON,
               [T.SAND],           LAYER_SURFACE,
               35, 3,
               1, 3,
               [T.SAND,T.BEACH],
               2, 0,                // short chase — gives up quickly
               '#a88838',           // tan-yellow
               {nightVision:true}],
  lurker:     ['Sand Lurker',    'SAND_LURKER',
               40, 50, 50, 0, 50, 20, 0,  3, 3,
               24, [6,16],
               ['flesh','beast'], DMG.BLADE,
               [T.SAND],           LAYER_SURFACE,
               30, 3,
               2, 4,
               [T.SAND],
               2, 0,                // ambush predator — strikes then gives up
               '#c4a068',
               {nightVision:true}],
  mummy:      ['Desert Mummy',   'MUMMY',
               60, 60, 20, 0, 20, 30, 0,  3, 3,
               32, [12,28],
               ['flesh','undead'], DMG.BLUNT,
               [T.SAND],           LAYER_SURFACE,
               20, 3,
               1, 2,
               [T.SAND],
               3, 1,                // slow, short pursuit
               '#a09070',
               {nightVision:true}],
  // MOUNTAIN
  ice_wraith: ['Ice Wraith',     'ICE_WRAITH',
               40, 30, 70, 0, 70, 50, 0,  4, 1,
               38, [14,32],
               ['undead','ice'], DMG.COLD,
               [T.ROCK],           LAYER_SURFACE,
               60, 4,
               2, 5,
               [T.ROCK],
               5, 4,                // intelligent undead — searches
               '#b0c8d8',
               {dodgeMul:1.4, nightVision:true}],
  frost_troll:['Frost Troll',    'FROST_TROLL',
               100, 100, 30, 0, 30, 10, 0,  4, 5,
               70, [25,55],
               ['flesh','ice','beast'], DMG.BLUNT,
               [T.ROCK],           LAYER_SURFACE,
               35, 5,
               2, 4,
               [T.ROCK],
               3, 0,                // tough and dumb, won't search
               '#a8c0c0',
               null],
  // UNDERGROUND
  skeleton:   ['Skeleton',       'SKELETON',
               30, 40, 30, 0, 30, 20, 0,  3, 3,
               22, [6,14],
               ['bone','undead'], DMG.BLADE,
               [T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               30, 3,
               2, 4,
               [T.CAVE_FLOOR,T.ROCK],
               4, 0,
               '#c8c4b8',
               {nightVision:true}],
  zombie:     ['Zombie',         'ZOMBIE',
               50, 50, 10, 0, 10, 10, 0,  3, 2,
               24, [4,10],
               ['flesh','undead'], DMG.BLADE,
               [T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               20, 3,
               2, 3,
               [T.CAVE_FLOOR,T.ROCK],
               4, 0,
               '#708070',
               {nightVision:true}],
  knight:     ['Fallen Knight',  'KNIGHT',
               80, 80, 60, 0, 60, 50, 0,  4, 9,
               90, [30,70],
               ['armored','undead'], DMG.BLADE,
               [T.ROCK], LAYER_UNDER,
               45, 5,
               2, 4,
               [T.CAVE_FLOOR,T.ROCK],
               5, 3,                // disciplined — searches
               '#b0b0c0',
               {nightVision:true}],
  // LAVA
  magma_hound:['Magma Hound',    'MAGMA_HOUND',
               40, 50, 60, 0, 60, 30, 0,  4, 3,
               40, [10,22],
               ['fire','beast'], DMG.FIRE,
               [T.LAVA,T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               50, 4,
               2, 4,
               [T.LAVA,T.CAVE_FLOOR,T.ROCK],
               5, 3,                // hounds track
               '#d06040',
               {nightVision:true}],
  lava_fiend: ['Lava Fiend',     'LAVA_FIEND',
               80, 80, 50, 0, 50, 60, 0,  4, 4,
               85, [25,55],
               ['fire'], DMG.FIRE,
               [T.LAVA,T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               40, 5,
               1, 3,
               [T.LAVA,T.CAVE_FLOOR],
               4, 4,                // intelligent, searches
               '#e07030',
               {nightVision:true}],

  // CHEMOTROPHIC ZONE (SE)
  mushroom:   ['Chemotroph',       'CHEMOTROPH_NODE',
               20, 10, 10, 60, 20, 10, 70,  0, 2,  // Size 2, high Vibration/Distributed, zero weaponAtk
               28, [8,20],
               ['plant','fungal'], DMG.POISON,
               [T.MUSHFOREST], LAYER_SURFACE,
               0, 3,               // zero perception — they don't detect stealth
               0, 0,               // passive, zero aggro range
               [T.MUSHFOREST,T.FUNGAL_GRASS],
               0, 0,               // no chase, no search — swarm AI handles everything
               '#786880',          // muted purple-gray (manganese zone default)
               {blindsight:5}],    // vibration sense — ignores LOS and light
  // NORTHEAST CAVES — surface
  rock_golem: ['Rock Golem',      'ROCK_GOLEM',
               100, 70, 20, 0, 20, 10, 0,  4, 8,
               65, [20,45],
               ['stone','rockite'], DMG.BLUNT,
               [T.CAVE_FLOOR,T.ROCK], LAYER_SURFACE,
               25, 5,
               1, 3,
               [T.CAVE_FLOOR,T.ROCK],
               2, 0,
               '#808080',
               {nightVision:true},
               { restrictedRegion: 'NE_QUADRANT', layers: [0, 1] }],
  // WATER CAVES — aquatic enemies
  cave_eel:   ['Cave Eel',        'EEL',
               30, 40, 50, 0, 50, 20, 0,  3, 1,
               30, [8,18],
               ['aquatic','beast'], DMG.ELEC,
               [T.WATER,T.DEEP_WATER,T.UWATER], LAYER_SURFACE,
               35, 3,
               1, 4,
               [T.WATER,T.DEEP_WATER,T.UWATER],
               3, 0,
               '#4090b0',
               {waterHeal:true, nightVision:true}],
  cave_crab:  ['Wading Grazer',   'WADING_GRAZER',
               70, 30, 50, 0, 50, 40, 0,  3, 6,
               35, [10,25],
               ['flesh','beast'], DMG.BLUNT,
               [T.WATER,T.DEEP_WATER,T.UWATER,T.BEACH], LAYER_SURFACE,
               25, 3,
               1, 3,
               [T.WATER,T.DEEP_WATER,T.UWATER,T.BEACH,T.GRASS,T.SAND],
               2, 0,
               '#4a5040',          // dark muddy brown-green, lighter belly
               {nightVision:true}],
  // UNDERGROUND OCEAN
  drowned:    ['The Drowned',    'DROWNED',
               60, 50, 20, 0, 20, 20, 0,  3, 2,
               46, [12,30],
               ['undead','aquatic'], DMG.BLADE,
               [T.UWATER,T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               30, 4,
               1, 3,
               [T.UWATER,T.CAVE_FLOOR],
               3, 0,
               '#6890a8',
               {nightVision:true}],
  deep_squid: ['Deep Squid',     'DEEP_SQUID',
               100, 80, 60, 0, 60, 40, 0,  4, 4,
               120,[30,75],
               ['aquatic','beast'], DMG.BLADE,
               [T.UWATER], LAYER_UNDER,
               40, 6,
               0, 2,                // passive until provoked
               [T.UWATER],
               2, 0,
               '#4080a0',
               {nightVision:true}],
};
// Boss: intelligent undead. High search, won't pursue beyond throne chamber.
const DREAD_KING = ['The Dread King','DREAD_KING',
               140, 140, 80, 0, 80, 100, 0,  6, 10,
               900, [800,1200],
               ['cursed','undead','armored'], DMG.BLADE,
               [], LAYER_UNDER,
               95, 7,
               2, 8,
               [T.CAVE_FLOOR,T.ROCK],  // throne area
               99, 99,              // never gives up
               '#6a6080',
               {critMul:2.0, nightVision:true}];

// Monster derived stats — Size & Strength driven (Prompt 2)
function monHP(mon){ return mon.siz * HP_PER_SIZE; }

// ==================== MONSTER SPEED ====================
// Speed determines action frequency. 100 = every turn. Lower = skip turns.
// Each turn, monster acts only if accumulated energy >= 100.
const MON_SPEED = {
  hare: 90,
  wolf: 80,       dire_wolf: 65,
  goblin: 70,     treant: 35,
  scorpion: 65,   lurker: 55,     mummy: 40,
  ice_wraith: 75, frost_troll: 45,
  skeleton: 55,   zombie: 35,     knight: 60,
  magma_hound: 75,lava_fiend: 55,
  mushroom: 45,   rock_golem: 25,
  cave_eel: 80,   cave_crab: 45,
  drowned: 45,    deep_squid: 50,
  dread_king: 70,
  ambush_pred: 70,
};

// ==================== PERSONALITY SYSTEM ====================
/*
  Each monster can have a personality trait assigned at spawn.
  Traits modify AI behavior subtly. Some creatures have few variants
  (mushrooms: almost none), others have many (goblins, wolves).
  Probability-weighted so unique behaviors are less common.
*/
const PERSONALITY_POOL = {
  rock_golem: [
    {trait:'still', weight:0.50},     // won't move until takes 10% max HP damage
    {trait:'active', weight:0.35},    // moves around, attacks within 1 tile
    {trait:'roaming', weight:0.15},   // peacefully wanders territory
  ],
  goblin: [
    {trait:'normal', weight:0.30},
    {trait:'aggressive', weight:0.20},   // runs and attacks blindly, higher aggroRange
    {trait:'wary', weight:0.18},         // unlikely to attack while alone
    {trait:'explorer', weight:0.12},     // explores beyond territory
    {trait:'leader', weight:0.08},       // others follow, triggers group aggro
    {trait:'skulker', weight:0.12},      // prefers stealth, retreats if hurt
  ],
  wolf: [
    {trait:'normal', weight:0.25},
    {trait:'lone_hunter', weight:0.15},  // hunts alone, slightly stronger
    {trait:'pair_bond', weight:0.15},    // stays near a bonded partner
    {trait:'leader', weight:0.10},       // pack follows
    {trait:'skittish', weight:0.15},     // flees at low HP
    {trait:'wary', weight:0.20},         // passive unless very close or attacked
  ],
  dire_wolf: [
    {trait:'normal', weight:0.40},
    {trait:'lone_hunter', weight:0.30},
    {trait:'leader', weight:0.15},
    {trait:'pair_bond', weight:0.15},
  ],
  ambush_pred: [
    {trait:'normal', weight:0.70},
    {trait:'patient', weight:0.30},      // waits longer before striking, tighter leash
  ],
  treant: [
    {trait:'normal', weight:0.30},
    {trait:'ancient', weight:0.15},      // higher HP, slower to anger
    {trait:'guardian', weight:0.20},      // protects nearby treants more actively
    {trait:'withered', weight:0.15},      // lower HP but faster
    {trait:'dormant', weight:0.20},       // won't wake unless directly hit
  ],
  mushroom: [
    {trait:'normal', weight:0.90},
    {trait:'spore_heavy', weight:0.10},  // slightly more poison damage
  ],
  // Others get no personality variance
};

function rollPersonality(key){
  const pool = PERSONALITY_POOL[key];
  if (!pool) return 'normal';
  let total = pool.reduce((s,p) => s + p.weight, 0);
  let r = rand() * total;
  for (const p of pool){
    r -= p.weight;
    if (r <= 0) return p.trait;
  }
  return pool[pool.length-1].trait;
}

// ==================== APEX PREDATOR DATA ====================
// Rarer, higher Size/Strength, same Central, tends toward lone or small groups
MON.dire_wolf = ['Apex Predator',  'APEX_PRED',
               60, 60, 70, 10, 40, 60, 10,  4, 2,
               22, [6,14],
               ['flesh','beast'], DMG.BLADE,
               [T.FOREST],            LAYER_SURFACE,
               45, 4,
               1, 3,                // territorial, reduced aggro range
               [T.FOREST,T.GRASS,T.MUD,T.DIRT,T.DIRT_ROAD,T.BEACH],
               5, 2,
               '#3a302a',           // dark charcoal-brown, dense skin
               {nightVision:true}];

// ==================== AMBUSH PREDATOR DATA ====================
// Clade B solitary ambush predator. Territorial, disengages outside home range.
// Spawns at forest and fungal zone edges. Less common than other surface creatures.
MON.ambush_pred = ['Ambush Predator', 'AMBUSH_PRED',
               40, 50, 20, 70, 50, 20, 50,  3, 3,
               18, [4,10],
               ['flesh','beast'], DMG.BLADE,
               [T.FOREST,T.MUSHFOREST],  LAYER_SURFACE,
               40, 2,
               2, 5,                // aggressive within territory, moderate aggro range
               [T.FOREST,T.MUSHFOREST,T.FUNGAL_GRASS],
               4, 0,                // short chase, no search — disengages cleanly
               '#5a5048',           // dark mottled gray-brown, blends with terrain
               null];
function monDodge(mon){
  const raw = Math.floor(((STAT_MAX + 1 - mon.siz) / STAT_MAX) * MAX_DODGE_CHANCE);
  const m = (mon.mods && mon.mods.dodgeMul) || 1;
  return Math.max(0, raw * m);
}
function monAcc(mon){ return BASE_ACCURACY + Math.floor(mon.vis * ACC_PER_VISUAL); }
function monCritChance(mon){
  if (mon.siz < 20) return 0;
  const base = (mon.siz / 10 - 2) * 3 + (mon.central / 10 - 1) * 1;
  const m = (mon.mods && mon.mods.critMul) || 1;
  return Math.min(50, base * m);
}
function monCritMult(mon){ return 1.5 + mon.strength * 0.003; }
function monDamage(mon){
  // baseDamage = floor(Size * DAMAGE_SIZE_COEFF) + floor(Strength * DAMAGE_STR_COEFF)
  return Math.floor(mon.siz * DAMAGE_SIZE_COEFF) + Math.floor(mon.strength * DAMAGE_STR_COEFF);
}

// ==================== VISION PROFILES ====================
// Per-species vision type and cone parameters.
// visionType: 'cone' (directional) or 'radius' (omnidirectional).
// coneAngle: forward vision arc in degrees (only used for cone type).
// awarenessRadius is computed from Visual at runtime, not stored here.
// These properties are defined on monsters for future AI use but are
// currently only read for the player's own FOV calculation.
const VISION_PROFILES = {
  // Humanoids — wide forward arc
  goblin:      { visionType: 'cone', coneAngle: 120 },
  knight:      { visionType: 'cone', coneAngle: 120 },
  mummy:       { visionType: 'cone', coneAngle: 120 },
  dread_king:  { visionType: 'cone', coneAngle: 120 },
  // Clade A predators — focused hunting cone
  wolf:        { visionType: 'cone', coneAngle: 90 },
  dire_wolf:   { visionType: 'cone', coneAngle: 90 },
  // Clade B ambush predator — moderate forward cone, good motion detection
  ambush_pred: { visionType: 'cone', coneAngle: 120 },
  magma_hound: { visionType: 'cone', coneAngle: 90 },
  // Prey / herbivores — near-panoramic awareness
  hare:        { visionType: 'cone', coneAngle: 170 },
  // Desert predators — moderate forward cone
  scorpion:    { visionType: 'cone', coneAngle: 100 },
  lurker:      { visionType: 'cone', coneAngle: 100 },
  // Aquatic — moderate cone
  cave_eel:    { visionType: 'cone', coneAngle: 110 },
  deep_squid:  { visionType: 'cone', coneAngle: 110 },
  drowned:     { visionType: 'cone', coneAngle: 110 },
  // Full-radius vision (omnidirectional / blindsight)
  cave_crab:   { visionType: 'radius' },
  mushroom:    { visionType: 'radius' },  // blindsight — vibration sense
  // Slow / rooted creatures — wide radius
  treant:      { visionType: 'radius' },
  rock_golem:  { visionType: 'radius' },
  // Undead / spectral — wide cone
  skeleton:    { visionType: 'cone', coneAngle: 120 },
  zombie:      { visionType: 'cone', coneAngle: 120 },
  ice_wraith:  { visionType: 'cone', coneAngle: 130 },
  frost_troll: { visionType: 'cone', coneAngle: 100 },
  lava_fiend:  { visionType: 'cone', coneAngle: 120 },
};

// ==================== CLADE TRAIT DATA ====================
// Biological clade identity and trait properties for surface fauna.
// Data-only — no AI behavior changes.  Read by future ecology systems.
//
// Keys match MON keys.  Only creatures with defined clade biology are
// listed; legacy/undead/elemental creatures have no clade assignment.
//
//   id              'A' or 'B'
//   cognition       'centralized' | 'distributed'
//   sensing         'chemical' | 'vibration'
//   memory          'episodic' | 'pattern'
//   sync            true if capable of inter-organism synchronization
//   syncRange       tile radius for sync signal propagation (0 if sync false)
//   territorial     true if effectiveness scales with home-range familiarity
//   territoryRadius home range radius in tiles (0 if not territorial)
//   integument      'skin' | 'plates'
//   reproduction    'sequential' | 'simultaneous'
const CLADE_DATA = {
  // Clade A — centralized, chemical-sensing, episodic memory, skin integument
  wolf: {
    id: 'A',
    cognition: 'centralized',
    sensing: 'chemical',
    memory: 'episodic',
    sync: false,
    syncRange: 0,
    territorial: false,
    territoryRadius: 0,
    integument: 'skin',
    reproduction: 'sequential',
  },
  dire_wolf: {
    id: 'A',
    cognition: 'centralized',
    sensing: 'chemical',
    memory: 'episodic',
    sync: false,
    syncRange: 0,
    territorial: false,
    territoryRadius: 0,
    integument: 'skin',
    reproduction: 'sequential',
  },
  cave_crab: {
    id: 'A',
    cognition: 'centralized',
    sensing: 'chemical',
    memory: 'episodic',
    sync: false,
    syncRange: 0,
    territorial: false,
    territoryRadius: 0,
    integument: 'skin',
    reproduction: 'sequential',
  },

  // Clade B — distributed, vibration-sensing, pattern memory, plated integument
  hare: {
    id: 'B',
    cognition: 'distributed',
    sensing: 'vibration',
    memory: 'pattern',
    sync: false,          // no synchronization — flees individually via vibration detection
    syncRange: 0,
    territorial: true,    // home-patch familiarity improves detection & escape
    territoryRadius: 8,
    integument: 'plates',
    reproduction: 'simultaneous',
  },
  mushroom: {
    id: 'B',
    cognition: 'distributed',
    sensing: 'vibration',
    memory: 'pattern',
    sync: true,           // full inter-node synchronization — the core mechanic
    syncRange: 6,
    territorial: true,    // colony bound to mineral substrate patch
    territoryRadius: 12,
    integument: 'plates',
    reproduction: 'simultaneous',
  },
  ambush_pred: {
    id: 'B',
    cognition: 'distributed',
    sensing: 'vibration',
    memory: 'pattern',
    sync: false,          // synchronization suppressed in this lineage
    syncRange: 0,
    territorial: true,    // effectiveness scales sharply with home-range familiarity
    territoryRadius: 10,
    integument: 'plates',
    reproduction: 'simultaneous',
  },
};

/*
  getCladeData(monsterKey)
  Returns the clade trait object for a creature key, or null if the
  creature has no clade assignment (legacy/undead/elemental).
*/
function getCladeData(key) {
  return CLADE_DATA[key] || null;
}

function spawnMonster(key){
  let d;
  if (key === 'dread_king') d = DREAD_KING;
  else d = MON[key];
  if (!d) return null;
  const [name, spr,
         siz, strength, chem, vib, vis, central, distributed,
         weaponAtk, def,
         xp, gold,
         tags, dmgT,
         biomes, layer,
         percept, tier,
         hostility, aggroRange,
         territory,
         chase, search,
         tint,
         mods,
         spawnRules] = d;
  const personality = rollPersonality(key);
  const m = {
    key, name, spr,
    siz, strength, chem, vib, vis, central, distributed,
    weaponAtk, def,
    xp, goldRange: gold,
    tags: [...tags],
    dmgType: dmgT,
    biomes: [...biomes],
    layer,
    percept, tier,
    hostility, aggroRange,
    territory: [...territory],
    chase, search,
    tint, mods,
    spawnRules: spawnRules || null,
    pathways: CREATURE_PATHWAYS[key] || [],
    effects: [],
    isMonster: true,
    alerted: false,
    wasAttacked: false,
    aiState: 'idle',  // idle | chase | search
    chaseTurnsLeft: 0,
    searchTurnsLeft: 0,
    lastSeenX: -1, lastSeenY: -1,
    homeX: 0, homeY: 0,
    hitFlash: 0,
    // Speed and personality
    speed: MON_SPEED[key] || 60,
    energy: randi(100),  // randomize initial phase so they don't all sync
    personality,
    damageTaken: 0,  // track total damage for rock golem 'still' trait
    bondPartner: null,  // for pair-bonded wolves
    // Vision profile
    visionType: 'radius',
    coneAngle: 360,
    // Chemotroph swarm phase tracking
    swarmPhase: 'passive',    // passive | coalescing | mobbing
    coalesceTick: 0,          // counter for slow drift during coalescing
  };
  // Apply personality stat modifiers
  if (personality === 'ancient' && key === 'treant'){
    m.siz += 30; m.strength += 10;
  } else if (personality === 'withered' && key === 'treant'){
    m.siz -= 20; m.speed = 50;
  } else if (personality === 'guardian' && key === 'treant'){
    m.percept += 10; m.aggroRange += 2;
  } else if (personality === 'lone_hunter' && (key === 'wolf' || key === 'dire_wolf')){
    m.strength += 10; m.siz += 10;
  } else if (personality === 'aggressive' && key === 'goblin'){
    m.aggroRange += 3; m.chase += 3; m.hostility = 2;
  } else if (personality === 'wary' && key === 'goblin'){
    m.hostility = 1; m.aggroRange = Math.max(2, m.aggroRange - 2);
  } else if (personality === 'explorer' && key === 'goblin'){
    m.territory = [T.FOREST, T.GRASS, T.ROCK]; // explores beyond forest
  } else if (personality === 'skulker' && key === 'goblin'){
    m.percept += 5; m.siz += 10;
  } else if (personality === 'spore_heavy' && key === 'mushroom'){
    m.sporeHeavy = true;  // flag checked during poison touch
  } else if (personality === 'patient' && key === 'ambush_pred'){
    m.aggroRange = Math.max(2, m.aggroRange - 2);  // tighter detection
    m.chase += 2;  // but more persistent once committed
  }
  // Wolf biome avoidance: wolves avoid desert and rock, give up chase into those biomes.
  // Pack/leader wolves range wider, lone/wary stick closer to forest.
  if (key === 'wolf' || key === 'dire_wolf'){
    m.avoidBiomes = [T.SAND, T.ROCK];  // won't chase deep into desert or stone
    m.avoidLeash = 3;  // give up after 3 tiles into avoided terrain
    if (personality === 'wary'){
      m.hostility = 0;     // passive — only fights when attacked or player is adjacent
      m.aggroRange = 2;    // very short detection
      m.chase = 4;         // gives up quickly
      m.avoidLeash = 2;
    } else if (personality === 'lone_hunter' || personality === 'skittish'){
      m.chase = 4;           // shorter chase range
      m.avoidLeash = 2;
    } else if (personality === 'leader'){
      m.chase = 10;          // pack leaders range wider
      m.aggroRange = 4;      // slightly more alert than solo
      m.avoidLeash = 5;
    } else if (personality === 'pair_bond'){
      m.chase = 8;           // bonded pairs pursue moderately
      m.avoidLeash = 4;
    }
  }
  // Ambush predator: personality adjusts territory radius (set from clade data above).
  // Patient variants patrol a tighter home range.
  if (key === 'ambush_pred'){
    if (personality === 'patient') m.territoryRadius = 8;
  }
  // Apply vision profile from lookup
  const vp = VISION_PROFILES[key];
  if (vp) {
    m.visionType = vp.visionType;
    if (vp.coneAngle != null) m.coneAngle = vp.coneAngle;
  }
  // Initialize facing direction for cone-vision creatures.
  // Radius-vision creatures have no facing (set to null).
  if (m.visionType === 'cone') {
    const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
    const pick = dirs[randi(dirs.length)];
    m.facing = { dx: pick[0], dy: pick[1] };
  } else {
    m.facing = null;
  }
  // Attach clade trait data (null for creatures without clade biology)
  m.clade = getCladeData(key);
  // Territory radius from clade data (Clade B territorial creatures).
  // Creatures with territorial: true are leashed to their home position.
  if (m.clade && m.clade.territorial && m.clade.territoryRadius > 0) {
    m.territoryRadius = m.clade.territoryRadius;
  }
  m.hpMax = monHP(m);
  m.hp = m.hpMax;
  m.immobilized = false;
  // Initialize per-instance body map with zone HP
  initBodyMap(m);
  return m;
}

// ==================== SPAWN RULES LOOKUP ====================
/*
  getSpawnRules(key)
  Returns the spawnRules object for a monster key, or null if none.
  Used by world-gen spawner to enforce regional exclusivity.
*/
function getSpawnRules(key){
  if (key === 'dread_king') return DREAD_KING[26] || null;
  const d = MON[key];
  if (!d) return null;
  return d[26] || null;
}

// ==================== SPAWN BLACKLIST ====================
// Creatures whose definitions are kept but should never appear in the world.
// World-gen spawner must skip any key in this set.
const SPAWN_BLACKLIST = new Set([
  'dread_king',    // DISABLED — legacy content (boss)
  'ice_wraith',    // removed from rotation — too punishing
  'magma_hound',   // lava monsters disabled
  'lava_fiend',    // lava monsters disabled
  'zombie',        // undead disabled
  'skeleton',      // undead disabled
  'knight',        // undead disabled (Fallen Knight)
  'mummy',         // undead disabled (Desert Mummy)
  'drowned',       // undead disabled (The Drowned)
  // DISABLED — legacy creatures, do not delete yet
  'goblin',        // legacy — not part of current fauna
  'scorpion',      // legacy — not part of current fauna
  'lurker',        // legacy — not part of current fauna
  'frost_troll',   // legacy — not part of current fauna
  'cave_eel',      // legacy — not part of current fauna
  'deep_squid',    // legacy — not part of current fauna
  'rock_golem',    // legacy — not part of current fauna
  'treant',        // legacy — not part of current fauna
]);

// ==================== HABITAT DEFINITIONS ====================
// Biome-based spawn rules for surface creatures.  Replaces the old
// tile-type matching in index 12 of MON arrays.
//
//   biomes       — biome NAME strings from BIOME_TARGET, not tile types
//   spawnWeight  — base probability per valid tile
//   nearWater    — if true, only spawn within nearWaterDist of a water tile
//   nearWaterDist— radius to scan for water proximity
//   maxPerCell   — max spawns of this creature per target-map cell
//
// Only surface creatures that are NOT in SPAWN_BLACKLIST need entries.
const HABITAT = {
  // Meso-predator: generalist, crosses biomes freely.  Common but not everywhere.
  wolf: {
    biomes: ['plains', 'forest', 'wetland', 'fungal', 'beach'],
    spawnWeight: 0.012,
    nearWater: false,
    nearWaterDist: 0,
    maxPerCell: 4,
  },
  // Large predator (apex): rare, prefers dense cover and wet terrain.
  dire_wolf: {
    biomes: ['forest', 'wetland'],
    spawnWeight: 0.003,
    nearWater: false,
    nearWaterDist: 0,
    maxPerCell: 1,
  },
  // Small herbivore: the most common creature.  Found everywhere with vegetation.
  hare: {
    biomes: ['plains', 'forest', 'wetland', 'beach', 'fungal'],
    spawnWeight: 0.025,
    nearWater: false,
    nearWaterDist: 0,
    maxPerCell: 10,
  },
  // Large herbivore (amphibious grazer): spawns on walkable land near water.
  cave_crab: {
    biomes: ['plains', 'wetland', 'shallows', 'beach'],
    spawnWeight: 0.006,
    nearWater: true,
    nearWaterDist: 8,
    maxPerCell: 2,
  },
  // Colonial chemotroph: only in fungal zones, spawns in clusters.
  mushroom: {
    biomes: ['fungal'],
    spawnWeight: 0.030,
    nearWater: false,
    nearWaterDist: 0,
    maxPerCell: 15,
  },
  // Solitary ambush predator: uncommon, prefers dense cover and biome edges.
  ambush_pred: {
    biomes: ['forest', 'fungal'],
    spawnWeight: 0.005,
    nearWater: false,
    nearWaterDist: 0,
    maxPerCell: 2,
  },
};

// Re-export everything that other modules need
export { MON, DREAD_KING, MON_SPEED, PERSONALITY_POOL, SPAWN_BLACKLIST, VISION_PROFILES, CLADE_DATA, HABITAT };
export { rollPersonality, monHP, monDodge, monAcc, monCritChance, monCritMult, monDamage, spawnMonster, getSpawnRules, getCladeData };