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
  // --- Photosynthetic biomes: dark red-brown / maroon / near-black ---
  // Ground cover is a continuous dark mat, not bright green.
  plains:    {bg:'#1e1410', fg:'#4a2828', mid:'#352018', tint:null},
  forest:    {bg:'#140c0a', fg:'#3a1818', mid:'#281210', tint:'#3a1818'},

  // --- Mineral-depleted zone: pale, washed-out, gray ---
  desert:    {bg:'#2a2828', fg:'#a8a4a0', mid:'#706c68', tint:'#908c88'},

  // --- Rock/mountain: warm earthy stone ---
  rock:      {bg:'#221e18', fg:'#8a7e6a', mid:'#5a5040', tint:'#78705e'},

  // --- Water: mineral-tinted amber, not pure blue ---
  water:     {bg:'#1a1810', fg:'#8a7a50', mid:'#4a4028', tint:null},
  deep:      {bg:'#0e0c08', fg:'#504838', mid:'#2a2418', tint:null},

  // --- Geothermal: lava stays hot ---
  lava:      {bg:'#2a100a', fg:'#e08060', mid:'#a04020', tint:'#d06040'},

  // --- Stone (boulders, stairs, structural) ---
  stone:     {bg:'#1a1814', fg:'#807868', mid:'#484238', tint:'#887868'},

  // --- Underground: warm amber-tinted, not cool gray ---
  cave:      {bg:'#0e0a08', fg:'#686058', mid:'#3a3428', tint:'#685848'},
  uwater:    {bg:'#0a0e08', fg:'#506040', mid:'#283020', tint:'#587848'},

  // --- Built structures: warm amber lamplight ---
  town:      {bg:'#1a1410', fg:'#c0a880', mid:'#806848', tint:null},
  castle:    {bg:'#181614', fg:'#a8a098', mid:'#585048', tint:null},
  road:      {bg:'#1e1810', fg:'#786040', mid:'#4a3a24', tint:null},
  wood_floor:{bg:'#161008', fg:'#6a5030', mid:'#403018', tint:null},

  // --- Chemotrophic biomes: manganese purple-dark to violet-black ---
  // Lighter than forest, mineral-colored, muted purple-gray.
  mushroom:  {bg:'#14101a', fg:'#5a4868', mid:'#3a2848', tint:'#504060'},
  mushforest:{bg:'#16101a', fg:'#5e4a60', mid:'#3c2850', tint:'#504060'},

  // --- Crops: muted amber ---
  wheat:     {bg:'#201a0c', fg:'#8a6e30', mid:'#5a4820', tint:null},

  // --- New / updated palettes ---
  beach:     {bg:'#282018', fg:'#8a7858', mid:'#5a4e38', tint:'#706040'},
  ruin:      {bg:'#141210', fg:'#504840', mid:'#383430', tint:'#484040'},
  void:      {bg:'#000000', fg:'#000000', mid:'#000000', tint:null},
  cave_wall: {bg:'#0c0a08', fg:'#1e1a16', mid:'#141210', tint:null},
  cave_rock: {bg:'#0a0a0a', fg:'#1a1a1a', mid:'#101010', tint:null},

  // --- Wetland: dark amber-brown, organic ---
  mud:       {bg:'#161008', fg:'#4a3818', mid:'#302410', tint:'#3e2c14'},

  // --- Fungal ground: purple-dark chemotrophic mat ---
  fungal_grass:{bg:'#12101a', fg:'#484060', mid:'#302840', tint:'#3e3450'},

  // --- Bare earth ---
  dirt:      {bg:'#1e1608', fg:'#5a4828', mid:'#3e2e18', tint:null},
  hut_wall:  {bg:'#161008', fg:'#6a5030', mid:'#403018', tint:null},
};

// ==================== PRICE CATEGORIES ====================
// Tiered INT-discount brackets.  Each item is tagged (or derived)
// into one of these so buyPriceMul / sellValueMul can apply the
// correct per-INT scaling.
//   staple   — food, basic supplies.          1% per INT above 1 (max ~9%).
//   standard — basic weapons, basic armor.    2% per INT above 1 (max ~18%).
//   luxury   — books, potions, high-end gear. 3% per INT above 1 (max ~27%).
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
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('wetland',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('wetland',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',1.0,0.2), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',1.0,0.2), B('forest',0.9,0.5), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.9,0.5), B('forest',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',1.0,0.2), B('forest',0.9,0.5), B('forest',0.7,0.9), B('plains',1.0,0.7), B('plains',1.0,0.7), B('plains',1.0,0.7), B('plains',1.0,0.7), B('forest',0.7,0.9), B('forest',0.9,0.5), B('forest',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',1.0,0.2), B('forest',0.9,0.5), B('forest',0.7,0.9), B('plains',1.0,0.7), B('plains',1.0,0.2), B('plains',1.0,0.2), B('plains',1.0,0.7), B('forest',0.7,0.9), B('forest',0.9,0.5), B('forest',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',1.0,0.2), B('forest',0.9,0.5), B('forest',0.7,0.9), B('plains',1.0,0.7), B('plains',1.0,0.2), B('plains',1.0,0.2), B('plains',1.0,0.7), B('forest',0.7,0.9), B('forest',0.9,0.5), B('forest',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',1.0,0.2), B('forest',0.9,0.5), B('forest',0.7,0.9), B('plains',1.0,0.7), B('plains',1.0,0.7), B('plains',1.0,0.7), B('plains',1.0,0.7), B('forest',0.7,0.9), B('forest',0.9,0.5), B('forest',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',1.0,0.2), B('forest',0.9,0.5), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.7,0.9), B('forest',0.9,0.5), B('forest',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('forest',1.0,0.2), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',0.9,0.5), B('forest',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('wetland',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('forest',1.0,0.2), B('wetland',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('shallows',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)],
  [B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2), B('ocean',1.0,0.2)]
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
    groundPalette: { 0: 0.85, 57: 0.15 },   // grass 85%, dirt 15%
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
    groundPalette: { 0: 0.9, 57: 0.1 },      // grass 90%, dirt 10%
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
    groundPalette: { 4: 0.7, 0: 0.15, 2: 0.15 }, // water 70%, grass 15%, sand 15%
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
    groundPalette: { 55: 0.4, 4: 0.3, 0: 0.3 }, // mud 40%, water 30%, grass 30%
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
    groundPalette: { 56: 0.9, 55: 0.1 },     // fungal_grass 90%, mud 10%
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
export const STARTING_POINTS = 16;
export const STARTING_GOLD   = 60;
export const ENEMY_HP_MUL    = 0.75;
export const ENEMY_ATK_MUL   = 0.70;
export const GOLD_DROP_MUL   = 1.30;
export const FOOD_DROP_MUL   = 1.30;

// ==================== LANDMARKS ====================
// Structures placed at biome-target-map scale.  Each entry defines:
//   type  — identifier string matching a generator in LANDMARK_GENERATORS
//   cells — array of target map coordinates this landmark occupies
// During surface generation the landmark system calculates a world-tile
// bounding box from the cells, clears cover in that footprint, and calls
// the generator to stamp its tiles.
export const LANDMARKS = [
  {
    type: 'village',
    cells: [
      { x: 4, y: 4 }, { x: 5, y: 4 },
      { x: 4, y: 5 }, { x: 5, y: 5 },
    ],
  },
];
