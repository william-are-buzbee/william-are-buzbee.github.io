// ==================== CONSTANTS ====================
export const TILE = 64, PIX = 2, SPR = 16;
export const VIEW_W = 17, VIEW_H = 11;

export const W_SURF = 164, H_SURF = 164;
// Underground dimensions always match surface — change W_SURF/H_SURF and these follow.
export const W_UNDER = W_SURF;
export const H_UNDER = H_SURF;

// Layer 0 is always the surface.  All other indices are generated on demand.
// LAYER_SURFACE is kept for readability; LAYER_UNDER is now just a convention
// (the first underground layer the player discovers) — any layerIndex >= 1
// can be underground, lava, town, shop interior, etc.
export const LAYER_SURFACE = 0;
export const LAYER_UNDER   = 1;   // default underground entry point

// ==================== LAYER TYPE REGISTRY ====================
// Maps a layerIndex to the *kind* of map it should be.
// Entries are added lazily by the world generator so callers can query
// "what kind of layer is this?" without importing world-gen.
//   key   = layerIndex (number)
//   value = { type, w, h, seed, ...extra }
//
// Types: 'surface' | 'underground' | 'lava' | 'town' | 'shop'
export const LAYER_META = {};

// Helper — dimensions of an already-registered layer
export function layerDims(layerIndex) {
  const meta = LAYER_META[layerIndex];
  if (!meta) return null;
  return { w: meta.w, h: meta.h };
}

// ==================== TILE_VOID ====================
// Impassable, opaque void tile used to surround underground caves.
// Renders as pure black and blocks all movement and vision.
export const TILE_VOID = { walkable: false, transparent: false };

// ==================== BIOME PALETTES ====================

export const COL_FG = '#e8e8e8';
export const COL_MID = '#8a8a8a';

export const BIOME = {
  plains:    {bg:'#2a3020', fg:'#d4d8b8', mid:'#8a9270', tint:null},
  forest:    {bg:'#1a2618', fg:'#a8c088', mid:'#607848', tint:'#a8c088'},
  desert:    {bg:'#3a2e1a', fg:'#e0c890', mid:'#b09868', tint:'#d8b878'},
  rock:      {bg:'#2a2620', fg:'#c8c0a8', mid:'#807060', tint:'#b0a890'},
  water:     {bg:'#18202e', fg:'#88a0c8', mid:'#485878', tint:null},
  deep:      {bg:'#0a0e18', fg:'#506078', mid:'#283040', tint:null},
  lava:      {bg:'#2a100a', fg:'#e08060', mid:'#a04020', tint:'#d06040'},
  stone:     {bg:'#1e1c1a', fg:'#a8a8a0', mid:'#5c5a50', tint:'#b0b0b0'},
  cave:      {bg:'#0e0a0a', fg:'#787878', mid:'#484040', tint:'#888090'},
  uwater:    {bg:'#0a1218', fg:'#406080', mid:'#203040', tint:'#6890b0'},
  town:      {bg:'#20181a', fg:'#e0d8b8', mid:'#a08c70', tint:null},
  castle:    {bg:'#1a1a20', fg:'#d0d0d8', mid:'#6a6a78', tint:null},
  road:      {bg:'#241e18', fg:'#c0a878', mid:'#806848', tint:null},
  mushroom:  {bg:'#1a1820', fg:'#9878a8', mid:'#604878', tint:'#9070a0'},
  mushforest:{bg:'#1e1620', fg:'#a06838', mid:'#704890', tint:'#9070a0'},
  wheat:     {bg:'#2e2a18', fg:'#d4b860', mid:'#a08830', tint:null},
  wood_floor:{bg:'#1a1410', fg:'#8a6840', mid:'#584028', tint:null},

  // --- New / updated palettes ---
  beach:     {bg:'#3a3422', fg:'#e8d8a0', mid:'#b0a068', tint:'#d0c078'},
  dirt_road: {bg:'#2a2218', fg:'#a08860', mid:'#6e5a3a', tint:null},
  ruin:      {bg:'#1a1818', fg:'#706860', mid:'#484440', tint:'#585050'},
  void:      {bg:'#000000', fg:'#000000', mid:'#000000', tint:null},
  cave_rock: {bg:'#0a0a0a', fg:'#1a1a1a', mid:'#101010', tint:null},
  mud:       {bg:'#1a1c12', fg:'#5a6038', mid:'#3a4020', tint:'#4a5028'},
  fungal_grass:{bg:'#181420', fg:'#7a6898', mid:'#504060', tint:'#685880'},
  dirt:      {bg:'#28200e', fg:'#a08050', mid:'#6a5430', tint:null},
};

// ==================== DAMAGE TYPES ====================
export const DMG = {
  BLADE:'blade', BLUNT:'blunt', FIRE:'fire', COLD:'cold', ELEC:'electric', POISON:'poison'
};

export const TAG_RESIST = {
  flesh:    {blade:1.2, blunt:0.9, fire:1.1, cold:1.0, electric:1.0, poison:1.2},
  bone:     {blade:0.35,blunt:1.7, fire:1.0, cold:0,   electric:0.9, poison:0},
  armored:  {blade:0.4, blunt:1.6, fire:0.8, cold:0.8, electric:1.1, poison:0.6},
  plant:    {blade:1.1, blunt:0.8, fire:2.0, cold:0.7, electric:1.1, poison:0.5},
  insect:   {blade:0.85,blunt:1.4, fire:1.4, cold:1.2, electric:1.1, poison:0.8},
  undead:   {blade:0.9, blunt:1.1, fire:1.3, cold:0,   electric:1.0, poison:0},
  fire:     {blade:1.0, blunt:1.0, fire:0,   cold:1.9, electric:1.2, poison:0},
  ice:      {blade:1.0, blunt:1.1, fire:1.9, cold:0,   electric:1.0, poison:0},
  aquatic:  {blade:1.0, blunt:1.0, fire:0.8, cold:1.0, electric:2.0, poison:1.0},
  stone:    {blade:0.3, blunt:1.6, fire:0.8, cold:1.0, electric:0.7, poison:0},
  cursed:   {blade:0.75,blunt:0.85,fire:1.5, cold:0,   electric:1.2, poison:0},
  beast:    {blade:1.1, blunt:1.0, fire:1.2, cold:1.0, electric:1.2, poison:1.1},
  scaled:   {blade:0.5, blunt:1.3, fire:1.0, cold:1.0, electric:1.0, poison:0.8},
  shelled:  {blade:0.4, blunt:1.5, fire:0.9, cold:0.9, electric:1.0, poison:0.7},
  fungal:   {blade:1.0, blunt:1.2, fire:1.5, cold:0.8, electric:1.0, poison:0},
  rockite:  {blade:0,   blunt:2.0, fire:0,   cold:0,   electric:0.8, poison:0},
};

export function resistMult(tags, dmgType){
  let m = 1;
  for (const t of tags){
    const r = TAG_RESIST[t];
    if (r && r[dmgType] != null){
      if (r[dmgType] === 0) return 0;
      m *= r[dmgType];
    }
  }
  return m;
}

// ==================== BIOME TARGET MAP ====================
// 16×16 low-resolution grid — the single source of truth for biome placement.
// Each cell names the biome that owns that region.  Surface generation reads
// this directly; no intermediate atmosphere fields are needed.
// Rows run north (0) → south (15), columns west (0) → east (15).
//
// The "mountain" biome has been removed.  All former mountain cells are now
// "stone", which uses walkable rock ground with boulder/outcrop cover.
export const BIOME_TARGET = [
  ['stone','stone','stone','forest','forest','forest','forest','forest','forest','forest','forest','forest','stone','stone','forest','water'],
  ['stone','stone','forest','forest','forest','stone','forest','forest','forest','forest','forest','stone','stone','stone','stone','forest'],
  ['stone','stone','forest','forest','forest','forest','forest','forest','forest','stone','stone','stone','stone','stone','stone','water'],
  ['stone','stone','plains','forest','plains','forest','forest','plains','plains','plains','plains','stone','stone','stone','stone','water'],
  ['stone','plains','forest','stone','plains','plains','forest','stone','plains','stone','stone','stone','plains','water','water','water'],
  ['stone','forest','plains','plains','stone','plains','plains','plains','plains','plains','plains','stone','water','water','water','water'],
  ['stone','stone','plains','plains','plains','plains','plains','plains','plains','plains','water','water','water','water','water','water'],
  ['stone','plains','plains','forest','plains','plains','plains','plains','plains','plains','plains','water','water','water','water','water'],
  ['stone','plains','plains','plains','plains','plains','plains','plains','plains','stone','plains','plains','water','water','water','water'],
  ['plains','plains','stone','plains','plains','plains','plains','plains','plains','plains','plains','plains','mushroom','plains','mushroom','mushroom'],
  ['plains','plains','plains','plains','plains','desert','plains','desert','plains','plains','mushroom','plains','mushroom','mushroom','mushroom','water'],
  ['plains','plains','plains','plains','stone','plains','desert','desert','plains','desert','plains','mushroom','mushroom','mushroom','mushroom','mushroom'],
  ['plains','plains','stone','desert','desert','desert','desert','desert','desert','plains','mushroom','mushroom','mushroom','mushroom','mushroom','mushroom'],
  ['plains','plains','desert','desert','desert','desert','desert','desert','desert','desert','plains','mushroom','mushroom','mushroom','mushroom','water'],
  ['plains','desert','desert','desert','desert','desert','desert','desert','desert','desert','plains','mushroom','mushroom','mushroom','plains','mushroom'],
  ['desert','desert','desert','desert','desert','desert','desert','desert','desert','desert','desert','plains','mushroom','mushroom','mushroom','mushroom'],
];

// ==================== BIOME PROFILES ====================
// Self-contained definition for every biome that appears on the target map.
// Adding a new biome = adding one entry here + placing it on BIOME_TARGET.
//
// Fields:
//   ground      — primary ground terrain type (T.* numeric ID)
//   covers      — array of { type, chance } objects.  Each is rolled
//                  independently per tile; first hit wins.
//   lakeChance  — probability of a coherent water pocket (noise-gated)
//   palette     — key into the BIOME palette table (for rendering)
//   derived     — { moisture, elevation, fungal } values written to the
//                  atmosphere fields so downstream systems can query them.
//                  These do NOT drive biome selection.
//
// Numeric terrain IDs (from terrain.js T.*):
//   0=GRASS  1=FOREST  2=SAND  3=ROCK  4=WATER  5=DEEP_WATER
//   8=MUSHFOREST  10=CAVE_WALL  11=CAVE_FLOOR  53=BOULDER  54=ROCK_OUTCROP
//   56=FUNGAL_GRASS

export const BIOME_PROFILES = {
  plains: {
    ground: 0,                      // T.GRASS
    covers: [
      { type: 1, chance: 0.08 },   // sparse trees
    ],
    lakeChance: 0.015,
    palette: 'plains',
    derived: { moisture: 0.35, elevation: 0.30, fungal: 0 },
  },
  forest: {
    ground: 0,                      // forest floor is grass
    covers: [
      { type: 1, chance: 0.70 },   // dense canopy
    ],
    lakeChance: 0.008,
    palette: 'forest',
    derived: { moisture: 0.58, elevation: 0.38, fungal: 0 },
  },
  desert: {
    ground: 2,                      // T.SAND
    covers: [],
    lakeChance: 0,
    palette: 'desert',
    derived: { moisture: 0.10, elevation: 0.40, fungal: 0 },
  },
  stone: {
    ground: 3,                      // T.ROCK — walkable rocky surface
    covers: [
      { type: 53, chance: 0.10 },  // boulders
      { type: 54, chance: 0.08 },  // rock outcrops
    ],
    lakeChance: 0,
    palette: 'rock',
    derived: { moisture: 0.18, elevation: 0.80, fungal: 0 },
  },
  water: {
    ground: 4,                      // T.WATER
    covers: [],
    lakeChance: 0,
    palette: 'water',
    derived: { moisture: 0.90, elevation: 0.15, fungal: 0 },
  },
  mushroom: {
    ground: 56,                     // T.FUNGAL_GRASS
    covers: [
      { type: 8, chance: 0.80 },   // mushroom forest
    ],
    lakeChance: 0,
    palette: 'fungal_grass',
    derived: { moisture: 0.45, elevation: 0.35, fungal: 0.65 },
  },
  mud: {
    ground: 0,                      // T.GRASS (palette tints it; add T.MUD later)
    covers: [],
    lakeChance: 0.02,
    palette: 'mud',
    derived: { moisture: 0.70, elevation: 0.25, fungal: 0 },
  },
};

// ==================== BLEND TUNING ====================
// Controls how wide (in world tiles) the transition zone is between
// adjacent biomes.  Higher = softer gradient, lower = sharper edge.
// The bilinear sampling of the 16×16 map over 112×112 tiles gives a
// natural ~7-tile blend.  BLEND_WIDTH adds noise-driven waviness on
// top of that, so the effective transition is roughly 7 + BLEND_WIDTH.
export const BLEND_WIDTH = 8;

// ==================== ATMOSPHERE FIELD STORAGE ====================
// Populated by surface-gen with values *derived from* the biome profile,
// NOT used to select biomes.  Downstream systems (fire spread, creature
// comfort, etc.) may query these; for now they are inert.
// Structure: { moisture: Float32Array, elevation: Float32Array,
//              fungal: Float32Array, w: number, h: number }
// Access pattern: fields.moisture[y * w + x]
export const ATMOSPHERE = {};

// Helper: query atmosphere value at a tile coordinate
export function getAtmosphere(x, y) {
  const a = ATMOSPHERE;
  if (!a.w) return { moisture: 0.5, elevation: 0.5, fungal: 0 };
  const cx = Math.max(0, Math.min(a.w - 1, Math.floor(x)));
  const cy = Math.max(0, Math.min(a.h - 1, Math.floor(y)));
  const idx = cy * a.w + cx;
  return {
    moisture:  a.moisture  ? a.moisture[idx]  : 0.5,
    elevation: a.elevation ? a.elevation[idx] : 0.5,
    fungal:    a.fungal    ? a.fungal[idx]    : 0,
  };
}

// ==================== DIFFICULTY ====================
export const DIFFICULTIES = {
  easy:   {label:'Easy',    enemyHp:0.75, enemyAtk:0.70, goldMul:1.30, foodMul:1.30, startGold:60, startPoints:14},
  normal: {label:'Normal',  enemyHp:1.00, enemyAtk:1.00, goldMul:1.00, foodMul:1.00, startGold:30, startPoints:12},
  hard:   {label:'Hard',    enemyHp:1.25, enemyAtk:1.25, goldMul:0.80, foodMul:0.80, startGold:20, startPoints:10},
};
