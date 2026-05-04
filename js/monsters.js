// ==================== MONSTER DATA ====================
import { DMG, LAYER_SURFACE, LAYER_UNDER } from './constants.js';
import { T } from './terrain.js';
import { rand, randi, roll100 } from './rng.js';

const MON = {
  // PLAINS
  hare:       ['Dust Hare',      'HARE',
               1, 1, 6, 1,  1, 0,
               2,  [0,1],
               ['flesh','beast'], DMG.BLADE,
               [T.GRASS],          LAYER_SURFACE,
               15, 1,
               0, 2,                // passive, tiny aggro
               [T.GRASS,T.DIRT,T.DIRT_ROAD,T.BEACH],
               0, 0,
               '#c0a878',           // sandy brown
               null],
  // FOREST
  wolf:       ['Grey Wolf',      'WOLF',
               2, 2, 6, 3,  2, 1,
               12, [2,6],
               ['flesh','beast'], DMG.BLADE,
               [T.FOREST],            LAYER_SURFACE,
               40, 2,
               2, 5,
               [T.FOREST,T.GRASS,T.MUD,T.DIRT,T.DIRT_ROAD,T.BEACH],  // wolves roam freely across most terrain
               4, 2,
               '#888078',           // brown-grey (not green!)
               null],
  goblin:     ['Forest Goblin',  'GOBLIN',
               3, 3, 5, 4,  2, 2,
               12, [6,16],
               ['flesh'], DMG.BLADE,
               [T.FOREST], LAYER_SURFACE,
               45, 2,
               2, 4,
               [T.FOREST],
               3, 3,                // search a bit — they're clever
               '#887040',           // dirty brown — distinct from treant green
               null],
  treant:     ['Treant',         'TREANT',
               8, 8, 1, 1,  3, 5,
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
               4, 3, 6, 1,  3, 4,
               22, [4,12],
               ['insect','shelled'], DMG.POISON,
               [T.SAND],           LAYER_SURFACE,
               35, 3,
               1, 3,
               [T.SAND,T.BEACH],
               3, 0,
               '#a88838',           // tan-yellow
               null],
  lurker:     ['Sand Lurker',    'SAND_LURKER',
               5, 4, 4, 2,  3, 3,
               24, [6,16],
               ['flesh','beast'], DMG.BLADE,
               [T.SAND],           LAYER_SURFACE,
               30, 3,
               2, 4,
               [T.SAND],
               4, 0,                // aggressive but won't search — ambush predator
               '#c4a068',
               null],
  mummy:      ['Desert Mummy',   'MUMMY',
               6, 6, 1, 3,  3, 3,
               32, [12,28],
               ['flesh','undead'], DMG.BLUNT,
               [T.SAND],           LAYER_SURFACE,
               20, 3,
               1, 2,
               [T.SAND],
               6, 2,                // slow but persistent
               '#a09070',
               null],
  // MOUNTAIN
  ice_wraith: ['Ice Wraith',     'ICE_WRAITH',
               3, 4, 8, 5,  4, 1,
               38, [14,32],
               ['undead','ice'], DMG.COLD,
               [T.ROCK],           LAYER_SURFACE,
               60, 4,
               2, 5,
               [T.ROCK],
               5, 4,                // intelligent undead — searches
               '#b0c8d8',
               {dodgeMul:1.4}],
  frost_troll:['Frost Troll',    'FROST_TROLL',
               10, 10, 2, 1,  4, 5,
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
               4, 3, 4, 2,  3, 3,
               22, [6,14],
               ['bone','undead'], DMG.BLADE,
               [T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               30, 3,
               2, 4,
               [T.CAVE_FLOOR,T.ROCK],
               4, 0,
               '#c8c4b8',
               null],
  zombie:     ['Zombie',         'ZOMBIE',
               5, 5, 1, 1,  3, 2,
               24, [4,10],
               ['flesh','undead'], DMG.BLADE,
               [T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               20, 3,
               2, 3,
               [T.CAVE_FLOOR,T.ROCK],
               4, 0,
               '#708070',
               null],
  knight:     ['Fallen Knight',  'KNIGHT',
               8, 8, 3, 5,  4, 9,
               90, [30,70],
               ['armored','undead'], DMG.BLADE,
               [T.ROCK], LAYER_UNDER,
               45, 5,
               2, 4,
               [T.CAVE_FLOOR,T.ROCK],
               5, 3,                // disciplined — searches
               '#b0b0c0',
               null],
  // LAVA
  magma_hound:['Magma Hound',    'MAGMA_HOUND',
               5, 4, 6, 3,  4, 3,
               40, [10,22],
               ['fire','beast'], DMG.FIRE,
               [T.LAVA,T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               50, 4,
               2, 4,
               [T.LAVA,T.CAVE_FLOOR,T.ROCK],
               5, 3,                // hounds track
               '#d06040',
               null],
  lava_fiend: ['Lava Fiend',     'LAVA_FIEND',
               8, 8, 4, 6,  4, 4,
               85, [25,55],
               ['fire'], DMG.FIRE,
               [T.LAVA,T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               40, 5,
               1, 3,
               [T.LAVA,T.CAVE_FLOOR],
               4, 4,                // intelligent, searches
               '#e07030',
               null],

  // MUSHROOM FOREST (SE)
  mushroom:   ['Sporecap',        'MUSHROOM',
               0, 8, 0, 7,  0, 2,  // no STR/DEX, high CON/INT, zero weaponAtk
               28, [8,20],
               ['plant','fungal'], DMG.POISON,
               [T.MUSHFOREST], LAYER_SURFACE,
               0, 3,               // zero perception — they don't detect stealth
               0, 0,               // passive, zero aggro range
               [T.MUSHFOREST,T.FUNGAL_GRASS],
               0, 0,               // no chase, no search — swarm AI handles everything
               null],
  // NORTHEAST CAVES — surface
  rock_golem: ['Rock Golem',      'ROCK_GOLEM',
               7, 10, 1, 1,  4, 8,
               65, [20,45],
               ['stone','rockite'], DMG.BLUNT,
               [T.CAVE_FLOOR,T.ROCK], LAYER_SURFACE,
               25, 5,
               1, 3,
               [T.CAVE_FLOOR,T.ROCK],
               2, 0,
               '#808080',
               null,
               { restrictedRegion: 'NE_QUADRANT', layers: [0, 1] }],
  // WATER CAVES — aquatic enemies
  cave_eel:   ['Cave Eel',        'EEL',
               4, 3, 7, 2,  3, 1,
               30, [8,18],
               ['aquatic','beast'], DMG.ELEC,
               [T.WATER,T.DEEP_WATER,T.UWATER], LAYER_SURFACE,
               35, 3,
               1, 4,
               [T.WATER,T.DEEP_WATER,T.UWATER],
               3, 0,
               '#4090b0',
               {waterHeal:true}],
  cave_crab:  ['Cave Crab',       'CAVE_CRAB',
               5, 6, 3, 1,  3, 6,
               35, [10,25],
               ['aquatic','shelled'], DMG.BLUNT,
               [T.WATER,T.DEEP_WATER,T.UWATER,T.BEACH], LAYER_SURFACE,
               25, 3,
               1, 3,
               [T.WATER,T.DEEP_WATER,T.UWATER,T.BEACH,T.GRASS,T.SAND],
               2, 0,
               '#607868',
               null],
  // UNDERGROUND OCEAN
  drowned:    ['The Drowned',    'DROWNED',
               5, 6, 3, 2,  3, 2,
               46, [12,30],
               ['undead','aquatic'], DMG.BLADE,
               [T.UWATER,T.CAVE_FLOOR,T.ROCK], LAYER_UNDER,
               30, 4,
               1, 3,
               [T.UWATER,T.CAVE_FLOOR],
               3, 0,
               '#6890a8',
               null],
  deep_squid: ['Deep Squid',     'DEEP_SQUID',
               8, 10, 5, 4,  4, 4,
               120,[30,75],
               ['aquatic','beast'], DMG.BLADE,
               [T.UWATER], LAYER_UNDER,
               40, 6,
               0, 2,                // passive until provoked
               [T.UWATER],
               2, 0,
               '#4080a0',
               null],
};
// Boss: intelligent undead. High search, won't pursue beyond throne chamber.
const DREAD_KING = ['The Dread King','DREAD_KING',
               14, 14, 7, 10,  6, 10,
               900, [800,1200],
               ['cursed','undead','armored'], DMG.BLADE,
               [], LAYER_UNDER,
               95, 7,
               2, 8,
               [T.CAVE_FLOOR,T.ROCK],  // throne area
               99, 99,              // never gives up
               '#6a6080',
               {critMul:2.0}];

// Monster derived stats — mirrors player math where sensible
function monHP(mon){ return 10 + mon.con * 4 + (mon.tier||0) * 3; }

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
    {trait:'normal', weight:0.35},
    {trait:'lone_hunter', weight:0.20},  // hunts alone, slightly stronger
    {trait:'pair_bond', weight:0.15},    // stays near a bonded partner
    {trait:'leader', weight:0.10},       // pack follows
    {trait:'skittish', weight:0.20},     // flees at low HP
  ],
  dire_wolf: [
    {trait:'normal', weight:0.40},
    {trait:'lone_hunter', weight:0.30},
    {trait:'leader', weight:0.15},
    {trait:'pair_bond', weight:0.15},
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

// ==================== DIRE WOLF DATA ====================
// Rarer, higher STR/CON, lower DEX, same INT, tends toward lone or small packs
MON.dire_wolf = ['Dire Wolf',      'WOLF',
               5, 5, 4, 3,  4, 2,
               22, [6,14],
               ['flesh','beast'], DMG.BLADE,
               [T.FOREST],            LAYER_SURFACE,
               45, 4,
               2, 5,
               [T.FOREST,T.GRASS,T.MUD,T.DIRT,T.DIRT_ROAD,T.BEACH],
               5, 2,
               '#5a4840',           // darker brown
               null];
function monDodge(mon){
  const raw = (mon.dex - 1) * 2.5 + (mon.int - 1) * 0.8;
  const m = (mon.mods && mon.mods.dodgeMul) || 1;
  return Math.max(0, raw * m);
}
function monAcc(mon){ return 30 + mon.dex * 3 + mon.int * 1; }
function monCritChance(mon){
  if (mon.dex < 2) return 0;
  const base = (mon.dex - 2) * 3 + (mon.int - 1) * 1;
  const m = (mon.mods && mon.mods.critMul) || 1;
  return Math.min(50, base * m);
}
function monCritMult(mon){ return 1.5 + mon.str * 0.03; }
function monDamage(mon){
  // Base swing: weaponAtk + 0.5 STR + small tier bonus
  return (mon.weaponAtk || 1) + Math.floor(mon.str * 0.5);
}

function spawnMonster(key){
  let d;
  if (key === 'dread_king') d = DREAD_KING;
  else d = MON[key];
  if (!d) return null;
  const [name, spr,
         str, con, dex, intel,
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
    str, con, dex, int: intel,
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
    // Mushroom swarm phase tracking
    swarmPhase: 'passive',    // passive | coalescing | mobbing
    coalesceTick: 0,          // counter for slow drift during coalescing
  };
  // Apply personality stat modifiers
  if (personality === 'ancient' && key === 'treant'){
    m.con += 3; m.str += 1;
  } else if (personality === 'withered' && key === 'treant'){
    m.con -= 2; m.speed = 50;
  } else if (personality === 'guardian' && key === 'treant'){
    m.percept += 10; m.aggroRange += 2;
  } else if (personality === 'lone_hunter' && (key === 'wolf' || key === 'dire_wolf')){
    m.str += 1; m.con += 1;
  } else if (personality === 'aggressive' && key === 'goblin'){
    m.aggroRange += 3; m.chase += 3; m.hostility = 2;
  } else if (personality === 'wary' && key === 'goblin'){
    m.hostility = 1; m.aggroRange = Math.max(2, m.aggroRange - 2);
  } else if (personality === 'explorer' && key === 'goblin'){
    m.territory = [T.FOREST, T.GRASS, T.ROCK]; // explores beyond forest
  } else if (personality === 'skulker' && key === 'goblin'){
    m.percept += 5; m.dex += 1;
  } else if (personality === 'spore_heavy' && key === 'mushroom'){
    m.sporeHeavy = true;  // flag checked during poison touch
  }
  // Wolf biome avoidance: wolves avoid desert and rock, give up chase into those biomes.
  // Pack/leader wolves range wider, lone/wary stick closer to forest.
  if (key === 'wolf' || key === 'dire_wolf'){
    m.avoidBiomes = [T.SAND, T.ROCK];  // won't chase deep into desert or stone
    m.avoidLeash = 3;  // give up after 3 tiles into avoided terrain
    if (personality === 'lone_hunter' || personality === 'skittish'){
      m.chase = Math.max(2, m.chase - 2);  // shorter chase range
      m.avoidLeash = 2;
    } else if (personality === 'leader'){
      m.chase += 2;  // pack leaders range wider
      m.avoidLeash = 5;
    } else if (personality === 'pair_bond'){
      m.avoidLeash = 4;
    }
  }
  m.hpMax = monHP(m);
  m.hp = m.hpMax;
  return m;
}

// ==================== SPAWN RULES LOOKUP ====================
/*
  getSpawnRules(key)
  Returns the spawnRules object for a monster key, or null if none.
  Used by world-gen spawner to enforce regional exclusivity.
*/
function getSpawnRules(key){
  if (key === 'dread_king') return DREAD_KING[24] || null;
  const d = MON[key];
  if (!d) return null;
  return d[24] || null;
}

// Re-export everything that other modules need
export { MON, DREAD_KING, MON_SPEED, PERSONALITY_POOL };
export { rollPersonality, monHP, monDodge, monAcc, monCritChance, monCritMult, monDamage, spawnMonster, getSpawnRules };