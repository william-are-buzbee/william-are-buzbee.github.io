// ==================== CONSTANTS ====================
export const TILE = 48, PIX = 2, SPR = 16;
export const VIEW_W = 19, VIEW_H = 15;

export const W_SURF = 224, H_SURF = 224;

// Biome target map resolution.  Change this and supply a matching NxN grid
// in BIOME_TARGET below.  Larger = finer biome control, smaller = broader zones.
// Use separate W/H if you ever want a non-square grid.
export const BIOME_GRID_W = 16;
export const BIOME_GRID_H = 16;

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
  // --- Photosynthetic biomes ---
  // Native Clade-A vision: lifted brightness, rich warm-spectrum separation.

  // Plains: OLIVE-brown — warmer, more yellow-shifted than forest.
  // Green channel leads slightly over forest; firmly warm, not cool.
  plains:    {bg:'#342818', fg:'#7a4c38', mid:'#583a28', tint:null},

  // Forest: RED-brown — dominant red channel, deep maroon-red canopy.
  // Clearly redder than plains at a glance.
  forest:    {bg:'#2e160e', fg:'#6a2c24', mid:'#4a2018', tint:'#6a2c24'},

  // --- Mineral-depleted zone: pale, desaturated, washed-out gray ---
  // The "dead zone" — muted and gray against the rich living biomes.
  desert:    {bg:'#383636', fg:'#bab6b2', mid:'#868280', tint:'#a09c98'},

  // --- Rock/mountain: warm earthy stone ---
  rock:      {bg:'#3a3228', fg:'#a89a84', mid:'#786c58', tint:'#968a76'},

  // --- Water: amber-tinted, translucent, readable ---
  // Shallows warm and inviting; deep darker but still clearly amber.
  water:     {bg:'#302a1c', fg:'#b09868', mid:'#6e5c3c', tint:null},
  deep:      {bg:'#221c14', fg:'#786a50', mid:'#443a28', tint:null},

  // --- Geothermal: lava stays hot ---
  lava:      {bg:'#3e1a10', fg:'#e08060', mid:'#b85030', tint:'#d06040'},

  // --- Stone (boulders, stairs, structural) ---
  stone:     {bg:'#302c24', fg:'#a09686', mid:'#665e50', tint:'#a89886'},

  // --- Underground: warm amber-brown, well-lit by native eyes ---
  // Geothermally active ecosystem — not a dark dungeon.
  cave:      {bg:'#261e18', fg:'#8e8474', mid:'#584e40', tint:'#8e7860'},
  uwater:    {bg:'#1c2214', fg:'#748c5c', mid:'#404a34', tint:'#7a9a64'},

  // --- Built structures: warm amber lamplight ---
  town:      {bg:'#302418', fg:'#d4be98', mid:'#9a8060', tint:null},
  castle:    {bg:'#2e2a28', fg:'#beb8b0', mid:'#746c60', tint:null},
  road:      {bg:'#362c20', fg:'#987c58', mid:'#6a5438', tint:null},
  wood_floor:{bg:'#2c2010', fg:'#8e6c44', mid:'#604828', tint:null},

  // --- Chemotrophic biomes: manganese PURPLE — most visually distinct ---
  // Cool purple against all the warm reds and browns makes it pop.
  mushroom:  {bg:'#241c30', fg:'#806898', mid:'#583c68', tint:'#70587e'},
  mushforest:{bg:'#261e32', fg:'#866c90', mid:'#5a3e6c', tint:'#70587e'},

  // --- Crops: muted amber ---
  wheat:     {bg:'#382e18', fg:'#aa8c48', mid:'#7a6438', tint:null},

  // --- New / updated palettes ---
  beach:     {bg:'#403628', fg:'#a89474', mid:'#786a50', tint:'#8e7c58'},
  ruin:      {bg:'#2a2624', fg:'#6e645c', mid:'#524e48', tint:'#645c58'},
  void:      {bg:'#000000', fg:'#000000', mid:'#000000', tint:null},
  cave_wall: {bg:'#1a1614', fg:'#342e28', mid:'#262220', tint:null},
  cave_rock: {bg:'#181816', fg:'#2c2a28', mid:'#201e1c', tint:null},

  // --- Wetland: AMBER-brown, warmest, most golden biome ---
  // Mineral-rich water + organic material = rich golden tint.
  mud:       {bg:'#2c2010', fg:'#7a5c28', mid:'#54401c', tint:'#664820'},

  // --- Fungal ground: purple-dark chemotrophic mat ---
  fungal_grass:{bg:'#221c2e', fg:'#6c5c88', mid:'#4c3e5e', tint:'#5c4c6e'},

  // --- Bare earth ---
  dirt:      {bg:'#362a14', fg:'#7e6840', mid:'#5e482c', tint:null},
  hut_wall:  {bg:'#2c2010', fg:'#8e6c44', mid:'#604828', tint:null},
};

// ==================== PRICE CATEGORIES ====================
// Tiered Central-discount brackets.  Each item is tagged (or derived)
// into one of these so buyPriceMul / sellValueMul can apply the
// correct per-Central scaling.
//   staple   — food, basic supplies.          1% per Central above 1 (max ~9%).
//   standard — basic weapons, basic armor.    2% per Central above 1 (max ~18%).
//   luxury   — books, potions, high-end gear. 3% per Central above 1 (max ~27%).
export const PRICE_CAT = { STAPLE:'staple', STANDARD:'standard', LUXURY:'luxury' };

// ==================== FED MAX ====================
export const FED_MAX = 100;

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
// BIOME_GRID_W × BIOME_GRID_H low-resolution grid — the single source of truth
// for biome placement.  Each cell names the biome that owns that region.
// Surface generation reads this directly; no intermediate atmosphere fields
// are needed.
// Rows run north (0) → south (BIOME_GRID_H-1),
// columns west (0) → east (BIOME_GRID_W-1).
//
// The "mountain" biome has been removed.  All former mountain cells are now
// "rock", which uses walkable rock ground with boulder/outcrop cover.
// The former "water" biome has been split into "ocean" (deep open water)
// and "shallows" (coastal transition).  "stone" → "rock", "mushroom" →
// "fungal", "mud" → "wetland".
//
// Each cell is { biome, density, blend }.  `density` (0.0–1.0) controls cover
// intensity — e.g. tree probability in forests — without changing biome
// identity.  `blend` (0.0–1.0) controls how far this cell's ground palette
// reaches into neighboring cells and the noise wavelength in the transition
// zone.  Both values are bilinearly interpolated across the map.
// Density and blend are independent parameters.
function B(biome, density, blend) { return { biome, density, blend: blend !== undefined ? blend : 0.5 }; }

// BIOME_TARGET — 16 x 16
// Generated by Biome Map Editor
//
// The "mountain" biome has been removed.  All former mountain cells are now
// "rock", which uses walkable rock ground with boulder/outcrop cover.
// The former "water" biome has been split into "ocean" (deep open water)
// and "shallows" (coastal transition).  "stone" → "rock", "mushroom" →
// "fungal", "mud" → "wetland".

export const BIOME_TARGET = [
  [B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('shallows',1.0,0.2), B('wetland',1.0,0.9), B('shallows',1.0,0.8), B('wetland',1.0,0.9), B('shallows',1.0,0.8), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('shallows',1.0,0.2), B('wetland',1.0,0.9), B('wetland',1.0,0.9), B('wetland',1.0,0.2), B('wetland',1.0,0.9), B('shallows',1.0,0.8), B('forest',0.9,0.7), B('shallows',1.0,0.8), B('forest',0.9,0.7), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('beach',0.7,0.3), B('beach',0.7,0.3), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2)],
  [B('shallows',1.0,0.2), B('wetland',1.0,0.9), B('wetland',1.0,0.9), B('wetland',1.0,0.2), B('wetland',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('shallows',1.0,0.2), B('beach',0.7,0.3), B('beach',0.7,0.3), B('beach',0.7,0.3), B('beach',0.7,0.3), B('shallows',1.0,0.2), B('ocean',1.0,0.2)],
  [B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('wetland',1.0,0.9), B('wetland',1.0,0.2), B('forest',0.3,0.4), B('shallows',1.0,0.9), B('forest',0.9,0.5), B('shallows',1.0,0.7), B('forest',0.9,0.5), B('forest',1.0,0.2), B('plains',0.7,0.2), B('beach',0.7,0.3), B('beach',0.7,0.3), B('beach',0.7,0.3), B('shallows',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.8), B('plains',1.0,0.2), B('wetland',1.0,0.2), B('wetland',1.0,0.2), B('wetland',1.0,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.3,0.9), B('plains',0.3,0.2), B('plains',0.2,0.2), B('beach',0.7,0.3), B('shallows',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.8), B('forest',0.1,0.2), B('shallows',1.0,0.7), B('wetland',1.0,0.9), B('forest',0.1,0.9), B('wetland',1.0,1.0), B('plains',1.0,0.7), B('shallows',1.0,0.4), B('forest',0.7,0.9), B('shallows',1.0,0.2), B('plains',0.6,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',0.4,0.2), B('forest',0.3,0.2), B('forest',0.9,0.5), B('forest',0.7,0.9), B('wetland',1.0,1.0), B('plains',1.0,0.2), B('plains',1.0,0.2), B('plains',1.0,0.7), B('forest',0.7,0.9), B('shallows',1.0,0.5), B('plains',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('forest',0.6,0.2), B('wetland',1.0,0.9), B('forest',0.7,0.9), B('shallows',1.0,0.7), B('plains',1.0,0.2), B('forest',0.1,1.0), B('plains',1.0,0.7), B('forest',0.7,0.9), B('wetland',1.0,0.9), B('plains',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',0.8,0.7), B('forest',0.8,0.7), B('shallows',1.0,0.7), B('forest',0.7,0.9), B('plains',1.0,0.2), B('plains',1.0,0.7), B('plains',1.0,0.7), B('shallows',1.0,0.9), B('plains',1.0,0.2), B('plains',1.0,0.2), B('fungal',1.0,0.3), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('forest',0.7,0.9), B('forest',0.3,0.5), B('shallows',1.0,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('wetland',1.0,0.9), B('wetland',1.0,0.9), B('fungal',1.0,0.8), B('shallows',1.0,0.7), B('shallows',1.0,0.0), B('shallows',1.0,0.0), B('shallows',1.0,0.2)],
  [B('shallows',1.0,0.2), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',1.0,0.9), B('forest',0.7,0.9), B('forest',0.3,0.5), B('forest',0.3,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('shallows',1.0,0.3), B('fungal',1.0,0.8), B('fungal',1.0,0.3), B('fungal',1.0,0.3), B('fungal',1.0,0.3), B('shallows',1.0,0.2), B('shallows',1.0,0.2)],
  [B('shallows',1.0,0.2), B('shallows',1.0,0.7), B('forest',0.7,0.9), B('shallows',1.0,0.9), B('forest',0.7,0.3), B('forest',0.6,0.3), B('forest',0.3,0.3), B('forest',1.0,0.2), B('shallows',1.0,0.9), B('fungal',1.0,0.9), B('shallows',1.0,0.9), B('fungal',1.0,0.3), B('fungal',1.0,0.3), B('fungal',1.0,0.3), B('fungal',1.0,0.3), B('shallows',1.0,0.9)],
  [B('ocean',1.0,0.2), B('shallows',1.0,0.7), B('shallows',1.0,0.2), B('forest',0.7,0.9), B('shallows',1.0,0.9), B('forest',0.7,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('fungal',1.0,0.9), B('shallows',1.0,0.7), B('fungal',1.0,0.3), B('fungal',1.0,0.3), B('fungal',1.0,0.6), B('fungal',0.7,0.6), B('shallows',1.0,0.2)],
  [B('ocean',1.0,0.2), B('shallows',1.0,0.7), B('forest',0.7,0.9), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('fungal',1.0,0.3), B('fungal',1.0,0.3), B('fungal',0.7,0.3), B('fungal',0.7,0.6), B('fungal',0.7,0.6), B('shallows',1.0,0.7)],
  [B('ocean',1.0,0.2), B('shallows',1.0,0.7), B('shallows',1.0,0.7), B('shallows',1.0,0.7), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.7), B('shallows',1.0,0.7)]
];






















// ---- Target map validation ----
if (BIOME_TARGET.length !== BIOME_GRID_H) {
  console.warn(`BIOME_TARGET has ${BIOME_TARGET.length} rows but BIOME_GRID_H is ${BIOME_GRID_H}`);
}
for (let r = 0; r < BIOME_TARGET.length; r++) {
  if (BIOME_TARGET[r].length !== BIOME_GRID_W) {
    console.warn(`BIOME_TARGET row ${r} has ${BIOME_TARGET[r].length} cols but BIOME_GRID_W is ${BIOME_GRID_W}`);
    break;          // one warning is enough
  }
}

// ==================== BIOME PROFILES ====================
// Self-contained definition for every biome that appears on the target map.
// Adding a new biome = adding one entry here + placing it on BIOME_TARGET.
//
// Fields:
//   groundPalette — { terrainType: weight } map of weighted ground types.
//                   Weights should sum to 1.0.  During generation, palettes
//                   from blended biomes are interpolated by distance, and
//                   a noise field selects the ground type per tile.
//   ground        — legacy: dominant ground type (highest palette weight).
//                   Kept for downstream code that reads a single ground type.
//   covers        — array of { type, chance } objects.  Each is rolled
//                   independently per tile; first hit wins.
//   lakeChance    — probability of a coherent water pocket (noise-gated)
//   palette       — key into the BIOME palette table (for rendering)
//   derived       — { moisture, elevation, fungal } values written to the
//                   atmosphere fields so downstream systems can query them.
//                   These do NOT drive biome selection.

export const BIOME_PROFILES = {
  plains: {
    groundPalette: { 0: 0.70, 57: 0.08, 55: 0.12, 4: 0.05 },   // grass 70%, dirt 8%, mud 12%, water 5% — damp patches & puddles
    ground: 0,                                // legacy: dominant ground (T.GRASS)
    scatter: 0.10,                            // occasional dirt tiles, mostly grass
    noiseAmp: 0.30,
    covers: [
      { type: 1, chance: 0.08 },              // sparse trees
    ],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0.005 + density * 0.025;
      return null;
    },
    lakeChance: 0.015,
    palette: 'plains',
    derived: { moisture: 0.35, elevation: 0.30, fungal: 0 },
  },
  forest: {
    groundPalette: { 0: 0.62, 57: 0.08, 55: 0.18, 4: 0.07 },      // grass 62%, dirt 8%, mud 18%, water 7% — saturated forest floor
    ground: 0,
    scatter: 0.08,                             // mostly grass, rare dirt
    noiseAmp: 0.30,
    covers: [
      { type: 1, chance: 0.70 },              // dense canopy
    ],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0.03 + density * 0.89;
      return null;
    },
    lakeChance: 0.008,
    palette: 'forest',
    derived: { moisture: 0.58, elevation: 0.38, fungal: 0 },
  },
  desert: {
    groundPalette: { 2: 1.0 },                // sand 100%
    ground: 2,
    scatter: 0.03,                             // near-solid sand
    noiseAmp: 0.25,
    covers: [],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'desert',
    derived: { moisture: 0.10, elevation: 0.40, fungal: 0 },
  },
  rock: {
    groundPalette: { 3: 1.0 },                // rock 100%
    ground: 3,
    scatter: 0.05,                             // solid rock
    noiseAmp: 0.25,
    covers: [
      { type: 53, chance: 0.10 },             // boulders
      { type: 54, chance: 0.08 },             // rock outcrops
    ],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'rock',
    derived: { moisture: 0.18, elevation: 0.80, fungal: 0 },
  },
  ocean: {
    groundPalette: { 5: 0.7, 4: 0.3 },       // deep_water 70%, water 30%
    ground: 5,
    scatter: 0.05,                             // mostly solid deep/shallow mix
    noiseAmp: 0.25,
    covers: [],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'water',
    derived: { moisture: 0.90, elevation: 0.10, fungal: 0 },
  },
  shallows: {
    groundPalette: { 4: 0.50, 55: 0.20, 0: 0.15, 2: 0.10, 7: 0.05 }, // water 50%, mud 20%, grass 15%, sand 10%, beach 5% — tidal gradient
    ground: 4,
    scatter: 0.15,                             // moderate intermixing at coast
    noiseAmp: 0.30,
    covers: [],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'water',
    derived: { moisture: 0.80, elevation: 0.15, fungal: 0 },
  },
  wetland: {
    groundPalette: { 55: 0.35, 4: 0.35, 0: 0.25, 57: 0.05 }, // mud 35%, water 35%, grass 25%, dirt 5% — slightly wetter
    ground: 55,
    scatter: 0.35,                             // heavy speckling — puddles everywhere
    noiseAmp: 0.20,
    covers: [],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0.01 + density * 0.04;
      return null;
    },
    lakeChance: 0.02,
    palette: 'mud',
    derived: { moisture: 0.70, elevation: 0.25, fungal: 0 },
  },
  fungal: {
    groundPalette: { 56: 0.75, 55: 0.15, 4: 0.05 },     // fungal_grass 75%, mud 15%, water 5% — waterlogged mineral flats
    ground: 56,
    scatter: 0.12,                             // some mud speckling in fungal ground
    noiseAmp: 0.25,
    covers: [
      { type: 8, chance: 0.80 },              // mushroom forest
    ],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;
      return null;
    },
    lakeChance: 0,
    palette: 'fungal_grass',
    derived: { moisture: 0.45, elevation: 0.35, fungal: 0.65 },
  },
  beach: {
    groundPalette: { 7: 0.80, 2: 0.12, 57: 0.08 }, // beach 80%, sand 12%, dirt 8%
    ground: 7,
    scatter: 0.10,                             // occasional sand/dirt patches
    noiseAmp: 0.25,
    covers: [
      { type: 53, chance: 0.03 },              // sparse boulders
      { type: 54, chance: 0.04 },              // occasional rock outcrops
    ],
    coverScale: (coverType, density) => {
      if (coverType === 1) return 0;           // no forest from cover blending
      return null;
    },
    lakeChance: 0,
    palette: 'beach',
    derived: { moisture: 0.75, elevation: 0.12, fungal: 0 },
  },
};

// ==================== BLEND TUNING ====================
// Per-cell `blend` parameter (0.0–1.0) on the BIOME_TARGET map controls
// transition width and noise coherence at biome boundaries.
//   blend: 0.0  → near-hard edge, 1–2 tiles of transition
//   blend: 0.5  → moderate transition, several tiles of gradient
//   blend: 1.0  → maximum blending, full smooth gradient between cell centers
// Each cell controls its OWN side of the boundary — asymmetric transitions
// emerge naturally when neighboring cells have different blend values.
// Noise wavelength within the transition zone scales with blend:
//   high blend → large smooth patches,  low blend → small sharp patches.
// The old global BLEND_WIDTH constant has been replaced by this system.
// CELL_TILE_SIZE is the number of world tiles per target-map cell — used
// by surface-gen to convert blend values into tile-space distances.
export const CELL_TILE_W = Math.floor(W_SURF / BIOME_GRID_W);
export const CELL_TILE_H = Math.floor(H_SURF / BIOME_GRID_H);

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

// ==================== BALANCE CONSTANTS ====================
// Single balance curve (formerly "easy" difficulty).
export const STARTING_POINTS = 22;  // Math.round(16 * 1.4) — scaled from 5-stat to 7-stat system
export const STARTING_GOLD   = 60;
export const ENEMY_HP_MUL    = 0.75;
export const ENEMY_ATK_MUL   = 0.70;
export const GOLD_DROP_MUL   = 1.30;
export const FOOD_DROP_MUL   = 1.30;

// ==================== GAMEPLAY FORMULA CONSTANTS ====================
// Size & Strength driven formulas (Prompt 2).
export const HP_PER_SIZE           = 10;   // maxHp = Size * HP_PER_SIZE
export const HP_PER_LEVEL_FACTOR   = 0.5;  // hpPerLevel = Math.ceil(Size * HP_PER_LEVEL_FACTOR)
export const DODGE_PER_SIZE_POINT  = 3;    // dodgeChance = (11 - Size) * DODGE_PER_SIZE_POINT
export const BASE_ACCURACY         = 70;
export const ACC_PER_VISUAL        = 3;    // accuracy = BASE_ACCURACY + (Visual * ACC_PER_VISUAL)
export const STEALTH_PER_SIZE_POINT = 4;   // stealthEffectiveness = (11 - Size) * STEALTH_PER_SIZE_POINT

// Relative speed system — power-to-weight ratio governs enemy action frequency.
export const MAX_BONUS_MOVE_CHANCE = 0.50;  // cap on bonus move probability (50%)
export const MIN_ACTION_CHANCE     = 0.25;  // floor — even the slowest enemy acts at least 25% of turns

// Instant turn agility — smaller creatures change facing for free more often.
export const TURN_AGILITY_PER_POINT = 10;   // instantTurnChance = (11 - Size) * TURN_AGILITY_PER_POINT, as %

// Angular scaling for instant turn: the base chance above is calibrated for a
// 90° turn (2 steps of 45°).  Smaller turns are easier, larger turns are harder.
//   chance = baseChance * (5 - steps) / 3
// Steps 1 (45°) → ×1.33,  2 (90°) → ×1.0,  3 (135°) → ×0.67,  4 (180°) → ×0.33

// Compute the minimum number of 45° increments between two facing directions.
// Returns 0–4 (0 = same direction, 4 = full reversal).
const _DIRS = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
export function facingSteps(dx1, dy1, dx2, dy2) {
  let i1 = -1, i2 = -1;
  for (let i = 0; i < 8; i++) {
    if (_DIRS[i][0] === dx1 && _DIRS[i][1] === dy1) i1 = i;
    if (_DIRS[i][0] === dx2 && _DIRS[i][1] === dy2) i2 = i;
  }
  if (i1 < 0 || i2 < 0) return 2; // fallback to 90° if direction is invalid
  const diff = Math.abs(i1 - i2);
  return Math.min(diff, 8 - diff);
}

// ==================== LANDMARKS ====================
// Structures placed at biome-target-map scale.  Each entry defines:
//   type  — identifier string matching a generator in LANDMARK_GENERATORS
//   cells — array of target map coordinates this landmark occupies
// During surface generation the landmark system calculates a world-tile
// bounding box from the cells, clears cover in that footprint, and calls
// the generator to stamp its tiles.
export const LANDMARKS = [
  // DISABLED — legacy content
  // {
  //   type: 'village',
  //   cells: [
  //     { x: 4, y: 4 }, { x: 5, y: 4 },
  //     { x: 4, y: 5 }, { x: 5, y: 5 },
  //   ],
  // },
];

// ==================== BODY MAPS ====================
// Phase 1 — body zone definitions for locational hit resolution.
// Each creature type maps to an array of zones.  targetWeight values
// sum to 1.0 per creature and represent the probability a random
// (non-targeted) attack lands on that zone.
//
// `vital: true`  — zone destruction kills the creature (not enforced yet).
// `functions`    — what the zone provides; used by future phases for
//                  degradation when the zone takes damage.
//
// Clade A (6 limbs, centralized brain): head is vital.
// Clade B (8 limbs, distributed ganglia): head is NOT vital; central
//   body ganglion cluster is the closest thing to a single point of failure.

// ---- Clade A base layout (meso-predator) ----
const CLADE_A_BASE = [
  { key: 'head',        name: 'head',        targetWeight: 0.10, vital: true,  functions: ['sensory', 'organ'] },
  { key: 'torso',       name: 'torso',       targetWeight: 0.35, vital: true,  functions: ['organ'] },
  { key: 'front_limbs', name: 'front limbs', targetWeight: 0.15, vital: false, functions: ['attack_melee', 'grip'] },
  { key: 'mid_limbs',   name: 'mid limbs',   targetWeight: 0.15, vital: false, functions: ['locomotion'] },
  { key: 'rear_limbs',  name: 'rear limbs',  targetWeight: 0.15, vital: false, functions: ['locomotion'] },
  { key: 'underside',   name: 'underside',   targetWeight: 0.10, vital: false, functions: ['attack_melee'] },
];

// ---- Clade B base layout (8 limbs, distributed ganglia) ----
const CLADE_B_BASE = [
  { key: 'head',           name: 'head',           targetWeight: 0.08, vital: false, functions: ['sensory'] },
  { key: 'central_body',   name: 'central body',   targetWeight: 0.25, vital: true,  functions: ['organ'] },
  { key: 'front_sensory',  name: 'front limbs',    targetWeight: 0.12, vital: false, functions: ['sensory'] },
  { key: 'second_limbs',   name: 'second limbs',   targetWeight: 0.15, vital: false, functions: ['grip'] },
  { key: 'rear_limbs_a',   name: 'rear limbs',     targetWeight: 0.15, vital: false, functions: ['locomotion'] },
  { key: 'rear_limbs_b',   name: 'hind limbs',     targetWeight: 0.15, vital: false, functions: ['locomotion'] },
  { key: 'integument',     name: 'shell',          targetWeight: 0.10, vital: false, functions: ['defense'] },
];

// Helper: clone a base map with optional per-zone weight overrides.
function deriveMap(base, overrides) {
  return base.map(z => {
    const o = overrides && overrides[z.key];
    if (!o) return { ...z, functions: [...z.functions] };
    return { ...z, ...o, functions: o.functions ? [...o.functions] : [...z.functions] };
  });
}

export const BODY_MAPS = {
  // ─── Clade A creatures ───────────────────────────────

  // Meso-predator — standard Clade A proportions
  wolf: deriveMap(CLADE_A_BASE),

  // Apex predator — heavier torso (bigger target), slightly smaller head
  dire_wolf: deriveMap(CLADE_A_BASE, {
    head:        { targetWeight: 0.08 },
    torso:       { targetWeight: 0.38 },
    front_limbs: { targetWeight: 0.14 },
    mid_limbs:   { targetWeight: 0.14 },
    rear_limbs:  { targetWeight: 0.14 },
    underside:   { targetWeight: 0.12 },
  }),

  // Wading grazer (large herbivore) — bulkier limbs, slightly smaller torso
  cave_crab: deriveMap(CLADE_A_BASE, {
    head:        { targetWeight: 0.08 },
    torso:       { targetWeight: 0.30 },
    front_limbs: { targetWeight: 0.17 },
    mid_limbs:   { targetWeight: 0.17 },
    rear_limbs:  { targetWeight: 0.18 },
    underside:   { targetWeight: 0.10 },
  }),

  // ─── Clade B creatures ───────────────────────────────

  // Small herbivore — standard Clade B
  hare: deriveMap(CLADE_B_BASE),

  // Colonial chemotroph — sessile, no melee on front limbs
  mushroom: deriveMap(CLADE_B_BASE, {
    front_sensory: { name: 'sensory fronds', functions: ['sensory'] },
    second_limbs:  { name: 'mid fronds',     functions: ['grip'] },
    integument:    { name: 'outer rind',     targetWeight: 0.10 },
  }),

  // Ambush predator — front sensory limbs double as attack weapons
  ambush_pred: deriveMap(CLADE_B_BASE, {
    front_sensory: { name: 'strike limbs', functions: ['sensory', 'attack_melee'] },
    second_limbs:  { functions: ['attack_melee', 'grip'] },
  }),

  // ─── Boss ────────────────────────────────────────────
  // Dread King — undead armored biped.  Simplified body map.
  dread_king: [
    { key: 'head',      name: 'crowned skull', targetWeight: 0.10, vital: true,  functions: ['sensory', 'organ'] },
    { key: 'torso',     name: 'ribcage',       targetWeight: 0.35, vital: true,  functions: ['organ'] },
    { key: 'left_arm',  name: 'shield arm',    targetWeight: 0.15, vital: false, functions: ['defense', 'grip'] },
    { key: 'right_arm', name: 'sword arm',     targetWeight: 0.15, vital: false, functions: ['attack_melee'] },
    { key: 'legs',      name: 'legs',          targetWeight: 0.20, vital: false, functions: ['locomotion'] },
    { key: 'mantle',    name: 'mantle',        targetWeight: 0.05, vital: false, functions: ['defense'] },
  ],

  // ─── Player body maps (all Clade A) ─────────────────
  // All three player body types use Clade A layout with minor tweaks.
  player_meso: deriveMap(CLADE_A_BASE),

  player_apex: deriveMap(CLADE_A_BASE, {
    head:        { targetWeight: 0.08 },
    torso:       { targetWeight: 0.38 },
    front_limbs: { targetWeight: 0.14 },
    mid_limbs:   { targetWeight: 0.14 },
    rear_limbs:  { targetWeight: 0.14 },
    underside:   { targetWeight: 0.12 },
  }),

  player_grazer: deriveMap(CLADE_A_BASE, {
    head:        { targetWeight: 0.08 },
    torso:       { targetWeight: 0.30 },
    front_limbs: { targetWeight: 0.17 },
    mid_limbs:   { targetWeight: 0.17 },
    rear_limbs:  { targetWeight: 0.18 },
    underside:   { targetWeight: 0.10 },
  }),
};

// Look up a body map for any combatant (player or monster).
// Returns the zone array or null if no map is defined.
export function getBodyMap(entity) {
  if (entity.isPlayer) {
    const bt = entity.bodyType || 'meso';
    return BODY_MAPS['player_' + bt] || BODY_MAPS.player_meso;
  }
  if (entity.key) {
    return BODY_MAPS[entity.key] || null;
  }
  return null;
}

// Weighted random zone selection.  Takes a body map (zone array),
// returns the selected zone object.  Uses Math.random — called only
// after a hit is confirmed, so the roll is independent of the hit roll.
export function selectHitZone(bodyMap) {
  let r = Math.random();
  for (const zone of bodyMap) {
    r -= zone.targetWeight;
    if (r <= 0) return zone;
  }
  // Floating-point safety — return last zone
  return bodyMap[bodyMap.length - 1];
}
