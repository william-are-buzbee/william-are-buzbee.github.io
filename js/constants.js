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

// ==================== PHYSICS-BASED DAMAGE ====================
// Strike damage derives entirely from the attacking zone's tissue composition.
// Muscle generates force, mass adds momentum, structural fraction sets transfer efficiency.
export const MUSCLE_FORCE_COEFF = 4.0;    // base damage per kg of effective muscle
export const MOMENTUM_COEFF    = 0.15;    // damage bonus per kg of effective mass
export const BASE_TRANSFER     = 0.6;     // minimum force transfer (soft tissue)
export const HARDNESS_BONUS    = 1.5;     // additional transfer per point of structural fraction

// Compute physics-based strike damage from the attacking zone's tissue.
// Called once per attack — the result enters the footprint distribution pipeline.
// attacker: the creature (for bleedPenalty)
// atkZone: the zone object performing the strike (from the attacker's body map)
// Returns integer damage.
export function computeStrikeDamage(attacker, atkZone) {
  if (!atkZone) return 1;

  const hpFrac = (atkZone.maxHp > 0) ? (atkZone.hp / atkZone.maxHp) : 1;

  const effMuscle = (atkZone.muscle || 0) * hpFrac;
  const effMass   = (atkZone.mass   || 0) * hpFrac;
  const structFrac = (atkZone.mass > 0) ? ((atkZone.structural || 0) / atkZone.mass) : 0;

  let damage = effMuscle * MUSCLE_FORCE_COEFF
             * (1 + effMass * MOMENTUM_COEFF)
             * (BASE_TRANSFER + structFrac * HARDNESS_BONUS);

  // Blood loss penalty — less oxygen to muscles, less force output
  damage *= (1 - (attacker.bleedPenalty || 0));

  return Math.max(1, Math.round(damage));
}

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

// ==================== SIGNAL EMISSION CONSTANTS (Prompt L-A) ====================
// Chemical emission
export const CHEM_MASS_COEFF     = 0.1;    // base emission per kg of mass
export const CHEM_PREDATOR_MULT  = 1.6;    // predators smell 60% stronger (protein metabolism)
export const CHEM_ACTIVITY_MULT  = 1.4;    // moving increases emission by 40%
export const CHEM_WOUND_COEFF    = 0.3;    // wound emission per kg per unit of blood loss severity

// Vibration emission
export const VIB_GROUND_COEFF       = 0.15;  // ground vibration intensity per (mass / contact area)
export const VIB_AIR_BASELINE_COEFF = 0.005; // air vibration from breathing per kg (always on)
export const VIB_AIR_ACTIVITY_COEFF = 0.02;  // additional air vibration from movement per kg
export const VIB_AIR_COMBAT_BONUS   = 3.0;   // flat bonus during combat (impacts are loud in air)
export const VIB_WATER_COEFF        = 0.2;   // water vibration from movement per kg
export const VIB_WATER_IDLE_COEFF   = 0.02;  // water vibration from being still in water per kg
export const CONTACT_AREA_COEFF     = 0.15;  // contact area per kg of locomotion zone mass

// Visual detectability
export const VIS_SIZE_COEFF    = 1.0;   // visual detectability per cube-root-kg
export const VIS_MOVEMENT_MULT = 3.0;   // moving creatures are 3x more visible

// Default contact area fraction (fallback if no locomotion zones tagged)
export const DEFAULT_CONTACT_FRACTION = 0.15;

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

// ==================== ZONE DESTRUCTION CONSTANTS ====================
// If remaining neural mass fraction falls below this, the creature dies.
export const NEURAL_DEATH_THRESHOLD = 0.35;  // die when surviving neural mass drops to 35% of original

// ==================== FOOTPRINT SYSTEM ====================
// Armor derived from structural tissue mass per zone
export const ARMOR_PER_STRUCTURAL_KG = 1.5;

// 8-directional exposure labels, indexed clockwise from north (0=N facing → 'front')
export const EXPOSURE_LABELS = ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'];

// ==================== SPECIES TEMPLATES (Prompt F) ====================
// Maps player-selectable species keys to creature template keys and display data.
// The player inherits the creature's complete body map, pathways, and attacks.
export const SPECIES_TEMPLATES = {
  prowler: {
    displayName: 'Prowler',
    creatureKey: 'wolf',
    clade: 'A',
    mass: 22,
    limbs: 6,
    attacks: 3,
    description: 'Six limbs. Centralized brain, chemical-dominant senses. Bite and two claw attacks. The generalist — good at reading threats, decent in a fight, mobile enough to disengage.',
    bodyType: 'meso',
    colorPalette: 'meso_predator',
  },
  ravager: {
    displayName: 'Ravager',
    creatureKey: 'dire_wolf',
    clade: 'A',
    mass: 90,
    limbs: 6,
    attacks: 3,
    description: 'Six limbs. Centralized brain, enhanced chemical senses. Bite and two heavy claw attacks. Hits hard, takes hits, dominates smaller creatures. Vulnerable to being flanked.',
    bodyType: 'apex',
    colorPalette: 'meso_predator',
  },
  grazer: {
    displayName: 'Grazer',
    creatureKey: 'hare',
    clade: 'B',
    mass: 5,
    limbs: 8,
    attacks: 0,
    description: 'Eight limbs. Distributed ganglia, vibration-dominant senses. No attacks. Fastest creature in the game. Survives by not being caught. The hard mode.',
    bodyType: 'grazer',
    colorPalette: 'meso_predator',
  },
  shaleback: {
    displayName: 'Shale-back',
    creatureKey: 'cave_crab',
    clade: 'A',
    mass: 200,
    limbs: 6,
    attacks: 4,
    description: 'Six limbs. Centralized brain, chemical and visual senses. Front shove and rear kick attacks. Massive, slow, extremely tanky. Almost impossible to kill head-on.',
    bodyType: 'meso',       // placeholder — no PLAYER_SHALEBACK sprite yet
    colorPalette: 'meso_predator',
  },
  lurker: {
    displayName: 'Lurker',
    creatureKey: 'ambush_pred',
    clade: 'B',
    mass: 24,
    limbs: 8,
    attacks: 7,
    description: 'Eight limbs. Distributed ganglia, vibration-dominant senses. Seven attacks, mostly puncture. Devastating single-zone damage but fragile. Fights like a stiletto.',
    bodyType: 'meso',       // placeholder — no PLAYER_LURKER sprite yet
    colorPalette: 'meso_predator',
  },
};

// ==================== BLOOD SYSTEM CONSTANTS ====================
export const BLOOD_FRACTION         = 0.07;   // blood volume as fraction of total mass
export const SEEP_COEFF             = 0.02;   // bleed rate multiplier per kg connective tissue
export const BURST_COEFF            = 0.03;   // burst multiplier per bandwidth point severed
export const CLOT_RATE              = 0.05;   // clotting progress per turn (1.0 = fully clotted)
export const REGEN_FRACTION         = 0.002;  // blood regeneration per turn as fraction of max
export const BLOOD_DEATH_THRESHOLD  = 0.10;   // die at 10% blood remaining
export const BLOOD_WEAKENED_THRESHOLD = 0.50; // speed/damage penalty begins
export const BLOOD_CRITICAL_THRESHOLD = 0.25; // severe penalty, AI flee trigger

// Compute the bleed penalty multiplier from current blood level.
// Returns 0, 0.10, 0.25, or 0.45 — applied as (1 - penalty) to speed and damage.
export function computeBleedPenalty(entity) {
  if (!entity.bloodMax || entity.bloodMax <= 0) return 0;
  const ratio = entity.blood / entity.bloodMax;
  if (ratio > 0.75) return 0;
  if (ratio > 0.50) return 0.10;
  if (ratio > 0.25) return 0.25;
  return 0.45;
}

// Zone HP derived from zone mass. Each kg of zone tissue = this many HP.
export const HP_PER_KG = 5;

// ==================== DRIVE SYSTEM ====================
export const MASS_HUNGER_COEFF   = 0.000015;  // hunger per turn per kg of total mass
export const NEURAL_HUNGER_COEFF = 0.0003;    // hunger per turn per kg of neural mass
export const SAFETY_DECAY_RATE   = 0.02;      // safety decays toward 0 per turn
export const REST_BASE_RATE      = 0.001;     // rest increases per turn (very slow baseline)

// Drive thresholds (used by selectBehavior in future prompts)
export const SAFETY_THRESHOLD    = 0.5;       // above this → flee (I-B)
export const HUNGER_THRESHOLD    = 0.6;       // above this → hunt/forage (I-C)
export const REST_THRESHOLD      = 0.7;       // above this → rest (I-D)

// --- Threat Detection (I-B) ---
export const CHEMICAL_RANGE_MULT  = 2.5;      // chemical 6 → 15 tile detection
export const VIBRATION_RANGE_MULT = 2.0;      // vibration 5 → 10 tile detection
export const VISUAL_RANGE_MULT    = 1.5;      // visual 5 → 7.5 tile detection

// --- Safety Spikes (I-B) ---
export const SAFETY_PROXIMITY_COEFF = 0.15;   // how much proximity-based detection spikes safety per turn
export const SAFETY_DAMAGE_COEFF    = 3.0;    // how much taking damage spikes safety (multiplied by HP fraction)

// --- Rest Acceleration (I-D) ---
export const REST_BLOOD_IMPAIRED   = 0.01;   // rest accel per turn at 50-75% blood
export const REST_BLOOD_WEAKENED   = 0.04;   // rest accel per turn at 25-50% blood
export const REST_BLOOD_CRITICAL   = 0.10;   // rest accel per turn at 10-25% blood
export const REST_WOUND_COEFF      = 0.02;   // rest accel per turn × fraction of zones damaged

// --- Rest Recovery (I-D) ---
export const REST_RECOVERY_NORMAL   = 0.015; // rest decreases per turn while resting at >50% blood
export const REST_RECOVERY_WEAKENED = 0.008; // rest decreases per turn while resting at 25-50% blood
export const REST_RECOVERY_CRITICAL = 0.003; // rest decreases per turn while resting at 10-25% blood

// --- Rest Interactions (I-D) ---
export const REST_EATING_BONUS = 0.05;       // eating reduces rest slightly (nutrition aids recovery)

// --- Zone Healing (J) ---
export const HEAL_BASE_RATE      = 0.15;     // base HP restored per zone per turn at 100% blood
export const HEAL_REST_MULTIPLIER = 3.0;     // resting creatures heal 3× faster

// --- Hunt/Forage (I-C) ---
export const CHASE_LEASH_BASE        = 8;     // minimum chase distance (tiles) even at low hunger
export const CHASE_LEASH_HUNGER_MULT = 15;    // additional chase tiles at hunger 1.0
export const MEAL_HUNGER_REDUCTION   = 0.8;   // hunger reduction per (corpse mass / predator mass)
export const BITE_MASS_FRACTION      = 0.15;  // fraction of own mass consumed per eat turn
export const GRAZE_HUNGER_REDUCTION  = 0.03;  // hunger reduction per turn of grazing
export const HERBIVORE_SAFETY_BONUS  = 0.25;  // herbivores treat safety as 0.25 more urgent than raw value
export const FORAGE_SEARCH_RADIUS    = 12;    // how far herbivores look for food tiles

// ==================== GAMEPLAY FORMULA CONSTANTS ====================
// Stat scale: 1-100 range (scaled from legacy 1-10).
export const STAT_MIN = 1;
export const STAT_MAX = 100;

// HP — each point of Size = 1 HP, so Size 40 = 40 HP
export const HP_PER_SIZE           = 1;
export const HP_PER_LEVEL_FACTOR   = 0.05;  // hpPerLevel = Math.ceil(Size * HP_PER_LEVEL_FACTOR)

// Damage — LEGACY Size/Strength coefficients removed (Prompt E).
// Damage now derives from attacking zone tissue via computeStrikeDamage().

// Dodge — scaled to 1-100 stat range
export const MAX_DODGE_CHANCE      = 30;    // dodgeChance = floor(((STAT_MAX+1-Size)/STAT_MAX)*MAX_DODGE_CHANCE)

// Accuracy
export const BASE_ACCURACY         = 70;
export const ACC_PER_VISUAL        = 0.3;   // accuracy = BASE_ACCURACY + floor(Visual * ACC_PER_VISUAL)

// Stealth
export const STEALTH_SIZE_COEFF    = 0.4;   // stealthEffectiveness = floor((STAT_MAX+1-Size)*STEALTH_SIZE_COEFF)

// Relative speed system — power-to-weight ratio governs enemy action frequency.
export const MAX_BONUS_MOVE_CHANCE = 0.50;  // cap on bonus move probability (50%)
export const MIN_ACTION_CHANCE     = 0.25;  // floor — even the slowest enemy acts at least 25% of turns

// Instant turn agility — smaller creatures change facing for free more often.
export const TURN_AGILITY_COEFF    = 1.0;   // instantTurnChance = (STAT_MAX+1-Size)*TURN_AGILITY_COEFF/100

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
// Phase 2 — expanded body zone definitions with full physical composition.
// Each creature type maps to an array of zones.  targetWeight values
// sum to 1.0 per creature and represent the probability a random
// (non-targeted) attack lands on that zone.
//
// Each zone carries:
//   key, name, targetWeight  — identity and hit selection (Phase 1)
//   muscle, structural, neural, sensory, connective, mass — tissue mass (kg)
//   neuralAllocation — fractional breakdown of neural tissue functions
//   transducers      — sensory organ quality ratings per modality
//   locomotion       — whether this zone contributes to movement
//   vital            — zone destruction kills the creature (not enforced yet)
//   attacks          — attack definitions housed in this zone
//   bleedRate, bleedThreshold — bleed properties (tuning TBD)
//   destroyed        — runtime state (always false at spawn)
//
// Design note: Clade A heads are NOT vital (recent change).
// Only torso is vital on Clade A creatures.

export const BODY_MAPS = {

  // ═══════════════════════════════════════════════════════
  // ─── Meso-Predator (wolf) — 22 kg, 8 zones ──────────
  // ═══════════════════════════════════════════════════════
  wolf: [
    { key: 'head', name: 'Head', targetWeight: 0.11,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 0.80, structural: 0.60, neural: 0.85, sensory: 0.50, connective: 0.75, mass: 3.5,
      neuralAllocation: { chemicalProcessing: 0.25, visualProcessing: 0.10, episodicMemory: 0.18, integration: 0.15, motorCoordination: 0.08, threatAssessment: 0.04, patternLibrary: 0.05 },
      transducers: { chemical: 6, visual: 3, vibration: { ground: 0, air: 2, water: 0 } },
      locomotion: false, vital: false,
      attacks: [{ key: 'bite', name: 'Bite', baseDamage: 4, damageType: 'puncture', accuracy: 0.80, canReflex: false, footprintModifier: 0.15 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.34,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 3.00, structural: 1.50, neural: 0.22, sensory: 0.08, connective: 2.70, mass: 7.5,
      neuralAllocation: { motorRelay: 0.12, chemicalProcessing: 0.05, patternLibrary: 0.05 },
      transducers: { chemical: 1, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.09,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.85, structural: 0.35, neural: 0.05, sensory: 0.05, connective: 0.30, mass: 1.6,
      neuralAllocation: { motorControl: 0.04, chemicalProcessing: 0.01 },
      transducers: { chemical: 1, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'claw', name: 'Claw', baseDamage: 3, damageType: 'slashing', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.09,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.85, structural: 0.35, neural: 0.05, sensory: 0.05, connective: 0.30, mass: 1.6,
      neuralAllocation: { motorControl: 0.04, chemicalProcessing: 0.01 },
      transducers: { chemical: 1, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'claw', name: 'Claw', baseDamage: 3, damageType: 'slashing', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_l', name: 'Mid-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'front_left', 'rear_left'],
      muscle: 1.10, structural: 0.40, neural: 0.04, sensory: 0.00, connective: 0.36, mass: 1.9,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_r', name: 'Mid-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'front_right', 'rear_right'],
      muscle: 1.10, structural: 0.40, neural: 0.04, sensory: 0.00, connective: 0.36, mass: 1.9,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.09,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 1.30, structural: 0.42, neural: 0.04, sensory: 0.00, connective: 0.34, mass: 2.1,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.08,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 1.30, structural: 0.42, neural: 0.04, sensory: 0.00, connective: 0.34, mass: 2.1,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
  ],

  // ═══════════════════════════════════════════════════════
  // ─── Apex Predator (dire_wolf) — 90 kg, 8 zones ─────
  // ═══════════════════════════════════════════════════════
  dire_wolf: [
    { key: 'head', name: 'Head', targetWeight: 0.08,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 2.00, structural: 1.60, neural: 1.26, sensory: 0.90, connective: 2.24, mass: 8.0,
      neuralAllocation: { chemicalProcessing: 0.38, visualProcessing: 0.20, episodicMemory: 0.26, integration: 0.20, motorCoordination: 0.10, threatAssessment: 0.06, patternLibrary: 0.06 },
      transducers: { chemical: 7, visual: 4, vibration: { ground: 0, air: 3, water: 0 } },
      locomotion: false, vital: false,
      attacks: [{ key: 'bite', name: 'Bite', baseDamage: 8, damageType: 'puncture', accuracy: 0.80, canReflex: false, footprintModifier: 0.15 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.30,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 10.50, structural: 5.50, neural: 0.42, sensory: 0.10, connective: 13.48, mass: 30.0,
      neuralAllocation: { motorRelay: 0.26, chemicalProcessing: 0.08, patternLibrary: 0.08 },
      transducers: { chemical: 1, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.10,
      exposure: ['front', 'front_left', 'left'],
      muscle: 3.80, structural: 1.60, neural: 0.08, sensory: 0.12, connective: 2.40, mass: 8.0,
      neuralAllocation: { motorControl: 0.06, chemicalProcessing: 0.02 },
      transducers: { chemical: 1, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'claw', name: 'Claw', baseDamage: 6, damageType: 'slashing', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.10,
      exposure: ['front', 'front_right', 'right'],
      muscle: 3.80, structural: 1.60, neural: 0.08, sensory: 0.12, connective: 2.40, mass: 8.0,
      neuralAllocation: { motorControl: 0.06, chemicalProcessing: 0.02 },
      transducers: { chemical: 1, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'claw', name: 'Claw', baseDamage: 6, damageType: 'slashing', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_l', name: 'Mid-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'front_left', 'rear_left'],
      muscle: 4.20, structural: 1.60, neural: 0.06, sensory: 0.00, connective: 2.64, mass: 8.5,
      neuralAllocation: { motorControl: 0.06 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_r', name: 'Mid-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'front_right', 'rear_right'],
      muscle: 4.20, structural: 1.60, neural: 0.06, sensory: 0.00, connective: 2.64, mass: 8.5,
      neuralAllocation: { motorControl: 0.06 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.11,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 4.80, structural: 1.80, neural: 0.06, sensory: 0.00, connective: 2.84, mass: 9.5,
      neuralAllocation: { motorControl: 0.06 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.11,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 4.80, structural: 1.80, neural: 0.06, sensory: 0.00, connective: 2.84, mass: 9.5,
      neuralAllocation: { motorControl: 0.06 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
  ],

  // ═══════════════════════════════════════════════════════
  // ─── Small Herbivore (hare) — 5 kg, 10 zones ────────
  // ═══════════════════════════════════════════════════════
  hare: [
    { key: 'head', name: 'Head', targetWeight: 0.06,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 0.04, structural: 0.06, neural: 0.042, sensory: 0.08, connective: 0.058, mass: 0.28,
      neuralAllocation: { visualProcessing: 0.020, vibrationProcessing: 0.010, patternLibrary: 0.008, motorControl: 0.004 },
      transducers: { visual: 4, vibration: { ground: 0, air: 1, water: 0 }, chemical: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.24,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 0.25, structural: 0.22, neural: 0.022, sensory: 0.02, connective: 0.488, mass: 1.00,
      neuralAllocation: { motorRelay: 0.010, vibrationProcessing: 0.006, patternLibrary: 0.006 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'fore_l', name: 'Fore-Left Limb', targetWeight: 0.05,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.03, structural: 0.03, neural: 0.028, sensory: 0.05, connective: 0.082, mass: 0.22,
      neuralAllocation: { vibrationProcessing: 0.010, motorControl: 0.008, patternLibrary: 0.006, chemicalProcessing: 0.004 },
      transducers: { vibration: { ground: 5, air: 1, water: 0 }, chemical: 2, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'fore_r', name: 'Fore-Right Limb', targetWeight: 0.05,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.03, structural: 0.03, neural: 0.028, sensory: 0.05, connective: 0.082, mass: 0.22,
      neuralAllocation: { vibrationProcessing: 0.010, motorControl: 0.008, patternLibrary: 0.006, chemicalProcessing: 0.004 },
      transducers: { vibration: { ground: 5, air: 1, water: 0 }, chemical: 2, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_graze_l', name: 'Mid-Graze-Left Limb', targetWeight: 0.05,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.04, structural: 0.03, neural: 0.026, sensory: 0.035, connective: 0.089, mass: 0.22,
      neuralAllocation: { vibrationProcessing: 0.010, motorControl: 0.008, patternLibrary: 0.006, chemicalProcessing: 0.002 },
      transducers: { vibration: { ground: 4, air: 1, water: 0 }, chemical: 1, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_graze_r', name: 'Mid-Graze-Right Limb', targetWeight: 0.05,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.04, structural: 0.03, neural: 0.026, sensory: 0.035, connective: 0.089, mass: 0.22,
      neuralAllocation: { vibrationProcessing: 0.010, motorControl: 0.008, patternLibrary: 0.006, chemicalProcessing: 0.002 },
      transducers: { vibration: { ground: 4, air: 1, water: 0 }, chemical: 1, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_loco_l', name: 'Mid-Loco-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'rear_left', 'rear'],
      muscle: 0.35, structural: 0.08, neural: 0.028, sensory: 0.02, connective: 0.102, mass: 0.58,
      neuralAllocation: { motorControl: 0.012, vibrationProcessing: 0.008, patternLibrary: 0.008 },
      transducers: { vibration: { ground: 3, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_loco_r', name: 'Mid-Loco-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'rear_right', 'rear'],
      muscle: 0.35, structural: 0.08, neural: 0.028, sensory: 0.02, connective: 0.102, mass: 0.58,
      neuralAllocation: { motorControl: 0.012, vibrationProcessing: 0.008, patternLibrary: 0.008 },
      transducers: { vibration: { ground: 3, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.15,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 0.55, structural: 0.10, neural: 0.030, sensory: 0.02, connective: 0.140, mass: 0.84,
      neuralAllocation: { motorControl: 0.014, vibrationProcessing: 0.008, patternLibrary: 0.008 },
      transducers: { vibration: { ground: 3, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.15,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 0.55, structural: 0.10, neural: 0.030, sensory: 0.02, connective: 0.140, mass: 0.84,
      neuralAllocation: { motorControl: 0.014, vibrationProcessing: 0.008, patternLibrary: 0.008 },
      transducers: { vibration: { ground: 3, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
  ],

  // ═══════════════════════════════════════════════════════
  // ─── Large Herbivore (cave_crab) — 200 kg, 8 zones ──
  // ═══════════════════════════════════════════════════════
  cave_crab: [
    { key: 'head', name: 'Head', targetWeight: 0.06,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 2.50, structural: 2.80, neural: 1.10, sensory: 1.00, connective: 4.60, mass: 12.0,
      neuralAllocation: { chemicalProcessing: 0.28, visualProcessing: 0.26, episodicMemory: 0.22, integration: 0.14, motorCoordination: 0.10, patternLibrary: 0.08, threatAssessment: 0.02 },
      transducers: { chemical: 5, visual: 5, vibration: { ground: 0, air: 2, water: 0 } },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.34,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 26.00, structural: 20.00, neural: 0.54, sensory: 0.10, connective: 33.36, mass: 80.0,
      neuralAllocation: { motorRelay: 0.38, chemicalProcessing: 0.08, patternLibrary: 0.08 },
      transducers: { chemical: 1, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.08,
      exposure: ['front', 'front_left', 'left'],
      muscle: 5.00, structural: 4.20, neural: 0.10, sensory: 0.15, connective: 5.55, mass: 15.0,
      neuralAllocation: { motorControl: 0.08, chemicalProcessing: 0.02 },
      transducers: { chemical: 1, vibration: { ground: 0, air: 0, water: 3 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'shove', name: 'Shove', baseDamage: 6, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.6 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.08,
      exposure: ['front', 'front_right', 'right'],
      muscle: 5.00, structural: 4.20, neural: 0.10, sensory: 0.15, connective: 5.55, mass: 15.0,
      neuralAllocation: { motorControl: 0.08, chemicalProcessing: 0.02 },
      transducers: { chemical: 1, vibration: { ground: 0, air: 0, water: 3 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'shove', name: 'Shove', baseDamage: 6, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.6 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_l', name: 'Mid-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'front_left', 'rear_left'],
      muscle: 9.00, structural: 3.80, neural: 0.08, sensory: 0.00, connective: 5.12, mass: 18.0,
      neuralAllocation: { motorControl: 0.08 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_r', name: 'Mid-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'front_right', 'rear_right'],
      muscle: 9.00, structural: 3.80, neural: 0.08, sensory: 0.00, connective: 5.12, mass: 18.0,
      neuralAllocation: { motorControl: 0.08 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.12,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 11.00, structural: 4.40, neural: 0.08, sensory: 0.00, connective: 5.52, mass: 21.0,
      neuralAllocation: { motorControl: 0.08 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [{ key: 'kick', name: 'Kick', baseDamage: 8, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.3 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.12,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 11.00, structural: 4.40, neural: 0.08, sensory: 0.00, connective: 5.52, mass: 21.0,
      neuralAllocation: { motorControl: 0.08 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [{ key: 'kick', name: 'Kick', baseDamage: 8, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.3 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
  ],

  // ═══════════════════════════════════════════════════════
  // ─── Colonial Chemotroph (mushroom) — placeholder ────
  // ═══════════════════════════════════════════════════════
  // No body map in Surface-Creatures.md yet.  Minimal placeholder values
  // so the data structure is consistent.  Will be replaced when colonial
  // architecture is designed.
  mushroom: [
    { key: 'head', name: 'head', targetWeight: 0.08,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'central_body', name: 'central body', targetWeight: 0.25,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_sensory', name: 'sensory fronds', targetWeight: 0.12,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'second_limbs', name: 'mid fronds', targetWeight: 0.15,
      exposure: ['left', 'front_left', 'rear_left', 'right', 'front_right', 'rear_right'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_limbs_a', name: 'rear limbs', targetWeight: 0.15,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_limbs_b', name: 'hind limbs', targetWeight: 0.15,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'integument', name: 'outer rind', targetWeight: 0.10,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
  ],

  // ═══════════════════════════════════════════════════════
  // ─── Ambush Predator — 24 kg, 8 zones ────────────────
  // ═══════════════════════════════════════════════════════
  ambush_pred: [
    { key: 'head', name: 'Head', targetWeight: 0.10,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 0.40, structural: 0.50, neural: 0.28, sensory: 0.35, connective: 0.67, mass: 2.2,
      neuralAllocation: { visualProcessing: 0.12, vibrationProcessing: 0.06, integration: 0.05, motorControl: 0.03, patternLibrary: 0.02 },
      transducers: { visual: 3, vibration: { ground: 0, air: 2, water: 0 }, chemical: 0 },
      locomotion: false, vital: false,
      attacks: [{ key: 'bite', name: 'Bite', baseDamage: 4, damageType: 'puncture', accuracy: 0.80, canReflex: false, footprintModifier: 0.15 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.31,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 2.20, structural: 1.30, neural: 0.20, sensory: 0.15, connective: 2.15, mass: 6.0,
      neuralAllocation: { motorRelay: 0.08, vibrationProcessing: 0.06, patternLibrary: 0.06 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: 0, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'sensor_l', name: 'Sensor-Left Limb', targetWeight: 0.08,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.50, structural: 0.25, neural: 0.28, sensory: 0.40, connective: 0.37, mass: 1.8,
      neuralAllocation: { vibrationProcessing: 0.15, chemicalProcessing: 0.06, patternLibrary: 0.05, motorControl: 0.02 },
      transducers: { vibration: { ground: 5, air: 2, water: 0 }, chemical: 2, visual: 0 },
      locomotion: false, vital: false,
      attacks: [{ key: 'probe', name: 'Probe', baseDamage: 2, damageType: 'puncture', accuracy: 0.80, canReflex: true, footprintModifier: 0.1 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'sensor_r', name: 'Sensor-Right Limb', targetWeight: 0.08,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.50, structural: 0.25, neural: 0.28, sensory: 0.40, connective: 0.37, mass: 1.8,
      neuralAllocation: { vibrationProcessing: 0.15, chemicalProcessing: 0.06, patternLibrary: 0.05, motorControl: 0.02 },
      transducers: { vibration: { ground: 5, air: 2, water: 0 }, chemical: 2, visual: 0 },
      locomotion: false, vital: false,
      attacks: [{ key: 'probe', name: 'Probe', baseDamage: 2, damageType: 'puncture', accuracy: 0.80, canReflex: true, footprintModifier: 0.1 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.10,
      exposure: ['front', 'front_left', 'left'],
      muscle: 1.10, structural: 0.35, neural: 0.22, sensory: 0.18, connective: 0.37, mass: 2.2,
      neuralAllocation: { vibrationProcessing: 0.10, chemicalProcessing: 0.03, motorControl: 0.05, patternLibrary: 0.04 },
      transducers: { vibration: { ground: 4, air: 1, water: 0 }, chemical: 1, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'hook', name: 'Hook', baseDamage: 3, damageType: 'puncture', accuracy: 0.80, canReflex: true, footprintModifier: 0.2 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.10,
      exposure: ['front', 'front_right', 'right'],
      muscle: 1.10, structural: 0.35, neural: 0.22, sensory: 0.18, connective: 0.37, mass: 2.2,
      neuralAllocation: { vibrationProcessing: 0.10, chemicalProcessing: 0.03, motorControl: 0.05, patternLibrary: 0.04 },
      transducers: { vibration: { ground: 4, air: 1, water: 0 }, chemical: 1, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'hook', name: 'Hook', baseDamage: 3, damageType: 'puncture', accuracy: 0.80, canReflex: true, footprintModifier: 0.2 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.12,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 1.80, structural: 0.45, neural: 0.18, sensory: 0.12, connective: 0.35, mass: 2.9,
      neuralAllocation: { vibrationProcessing: 0.06, visualProcessing: 0.04, motorControl: 0.05, patternLibrary: 0.03 },
      transducers: { vibration: { ground: 2, air: 1, water: 0 }, visual: 1, chemical: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'kick', name: 'Kick', baseDamage: 4, damageType: 'blunt', accuracy: 0.80, canReflex: true, footprintModifier: 0.35 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.11,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 1.80, structural: 0.45, neural: 0.18, sensory: 0.12, connective: 0.35, mass: 2.9,
      neuralAllocation: { vibrationProcessing: 0.06, visualProcessing: 0.04, motorControl: 0.05, patternLibrary: 0.03 },
      transducers: { vibration: { ground: 2, air: 1, water: 0 }, visual: 1, chemical: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'kick', name: 'Kick', baseDamage: 4, damageType: 'blunt', accuracy: 0.80, canReflex: true, footprintModifier: 0.35 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
  ],

  // ─── Boss ────────────────────────────────────────────
  // Dread King — undead armored biped.  Simplified body map.
  // No tissue composition (not a biological creature).
  dread_king: [
    { key: 'head',      name: 'crowned skull', targetWeight: 0.10, vital: true,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 0, structural: 0, neural: 0, sensory: 0, connective: 0, mass: 0,
      neuralAllocation: {}, transducers: { vibration: { ground: 0, air: 0, water: 0 } },
      locomotion: false,
      attacks: [], bleedRate: 0, bleedThreshold: 0, destroyed: false },
    { key: 'torso',     name: 'ribcage',       targetWeight: 0.35, vital: true,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 0, structural: 0, neural: 0, sensory: 0, connective: 0, mass: 0,
      neuralAllocation: {}, transducers: { vibration: { ground: 0, air: 0, water: 0 } },
      locomotion: false,
      attacks: [], bleedRate: 0, bleedThreshold: 0, destroyed: false },
    { key: 'left_arm',  name: 'shield arm',    targetWeight: 0.15, vital: false,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0, structural: 0, neural: 0, sensory: 0, connective: 0, mass: 0,
      neuralAllocation: {}, transducers: { vibration: { ground: 0, air: 0, water: 0 } },
      locomotion: false,
      attacks: [], bleedRate: 0, bleedThreshold: 0, destroyed: false },
    { key: 'right_arm', name: 'sword arm',     targetWeight: 0.15, vital: false,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0, structural: 0, neural: 0, sensory: 0, connective: 0, mass: 0,
      neuralAllocation: {}, transducers: { vibration: { ground: 0, air: 0, water: 0 } },
      locomotion: false,
      attacks: [], bleedRate: 0, bleedThreshold: 0, destroyed: false },
    { key: 'legs',      name: 'legs',          targetWeight: 0.20, vital: false,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 0, structural: 0, neural: 0, sensory: 0, connective: 0, mass: 0,
      neuralAllocation: {}, transducers: { vibration: { ground: 0, air: 0, water: 0 } },
      locomotion: true,
      attacks: [], bleedRate: 0, bleedThreshold: 0, destroyed: false },
    { key: 'mantle',    name: 'mantle',        targetWeight: 0.05, vital: false,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 0, structural: 0, neural: 0, sensory: 0, connective: 0, mass: 0,
      neuralAllocation: {}, transducers: { vibration: { ground: 0, air: 0, water: 0 } },
      locomotion: false,
      attacks: [], bleedRate: 0, bleedThreshold: 0, destroyed: false },
  ],

  // ─── Player body maps ───────────────────────────────
  // Player uses meso-predator template (8 zones, same tissue composition).
  // Front limbs carry a basic unarmed strike instead of claws.
  player_meso: [
    { key: 'head', name: 'Head', targetWeight: 0.11,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 0.80, structural: 0.60, neural: 0.85, sensory: 0.50, connective: 0.75, mass: 3.5,
      neuralAllocation: { chemicalProcessing: 0.25, visualProcessing: 0.10, episodicMemory: 0.18, integration: 0.15, motorCoordination: 0.08, threatAssessment: 0.04, patternLibrary: 0.05 },
      transducers: { chemical: 6, visual: 3, vibration: { ground: 0, air: 2, water: 0 } },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.34,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 3.00, structural: 1.50, neural: 0.22, sensory: 0.08, connective: 2.70, mass: 7.5,
      neuralAllocation: { motorRelay: 0.12, chemicalProcessing: 0.05, patternLibrary: 0.05 },
      transducers: { chemical: 1, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.09,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.85, structural: 0.35, neural: 0.05, sensory: 0.05, connective: 0.30, mass: 1.6,
      neuralAllocation: { motorControl: 0.04, chemicalProcessing: 0.01 },
      transducers: { chemical: 1, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'strike', name: 'Strike', baseDamage: 3, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.09,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.85, structural: 0.35, neural: 0.05, sensory: 0.05, connective: 0.30, mass: 1.6,
      neuralAllocation: { motorControl: 0.04, chemicalProcessing: 0.01 },
      transducers: { chemical: 1, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'strike', name: 'Strike', baseDamage: 3, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_l', name: 'Mid-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'front_left', 'rear_left'],
      muscle: 1.10, structural: 0.40, neural: 0.04, sensory: 0.00, connective: 0.36, mass: 1.9,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_r', name: 'Mid-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'front_right', 'rear_right'],
      muscle: 1.10, structural: 0.40, neural: 0.04, sensory: 0.00, connective: 0.36, mass: 1.9,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.09,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 1.30, structural: 0.42, neural: 0.04, sensory: 0.00, connective: 0.34, mass: 2.1,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.08,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 1.30, structural: 0.42, neural: 0.04, sensory: 0.00, connective: 0.34, mass: 2.1,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
  ],

  // player_apex and player_grazer are placeholders — they will be revised
  // when chargen is reworked.  For now they mirror player_meso.
  player_apex: null,   // filled below
  player_grazer: null,  // filled below
};

// Deep-copy meso map for the other two player body types
// (distinct arrays so future chargen can diverge them)
BODY_MAPS.player_apex   = BODY_MAPS.player_meso.map(z => ({ ...z, exposure: z.exposure ? [...z.exposure] : [], neuralAllocation: { ...z.neuralAllocation }, transducers: JSON.parse(JSON.stringify(z.transducers || {})), attacks: z.attacks.map(a => ({ ...a })) }));
BODY_MAPS.player_grazer = BODY_MAPS.player_meso.map(z => ({ ...z, exposure: z.exposure ? [...z.exposure] : [], neuralAllocation: { ...z.neuralAllocation }, transducers: JSON.parse(JSON.stringify(z.transducers || {})), attacks: z.attacks.map(a => ({ ...a })) }));

// ==================== CREATURE PATHWAYS ====================
// Neural pathway topology for each creature type.  Data only — nothing
// reads these yet.  Defined here so future prompts don't need a data migration.
// `from` and `to` values match zone keys within the creature's body map.
// `bandwidth` is an abstract 0–1 signal quality measure.
export const CREATURE_PATHWAYS = {

  // Meso-predator — star topology, head-to-torso hub
  wolf: [
    { from: 'head',  to: 'torso',   bandwidth: 0.9 },
    { from: 'torso', to: 'front_l', bandwidth: 0.7 },
    { from: 'torso', to: 'front_r', bandwidth: 0.7 },
    { from: 'torso', to: 'mid_l',   bandwidth: 0.5 },
    { from: 'torso', to: 'mid_r',   bandwidth: 0.5 },
    { from: 'torso', to: 'rear_l',  bandwidth: 0.5 },
    { from: 'torso', to: 'rear_r',  bandwidth: 0.5 },
  ],

  // Apex predator — same star topology as meso-predator
  dire_wolf: [
    { from: 'head',  to: 'torso',   bandwidth: 0.9 },
    { from: 'torso', to: 'front_l', bandwidth: 0.7 },
    { from: 'torso', to: 'front_r', bandwidth: 0.7 },
    { from: 'torso', to: 'mid_l',   bandwidth: 0.5 },
    { from: 'torso', to: 'mid_r',   bandwidth: 0.5 },
    { from: 'torso', to: 'rear_l',  bandwidth: 0.5 },
    { from: 'torso', to: 'rear_r',  bandwidth: 0.5 },
  ],

  // Small herbivore — mesh topology, fully distributed ganglia
  hare: [
    { from: 'head',        to: 'torso',       bandwidth: 0.3 },
    { from: 'torso',       to: 'fore_l',      bandwidth: 0.3 },
    { from: 'torso',       to: 'fore_r',      bandwidth: 0.3 },
    { from: 'torso',       to: 'mid_graze_l', bandwidth: 0.3 },
    { from: 'torso',       to: 'mid_graze_r', bandwidth: 0.3 },
    { from: 'torso',       to: 'mid_loco_l',  bandwidth: 0.3 },
    { from: 'torso',       to: 'mid_loco_r',  bandwidth: 0.3 },
    { from: 'torso',       to: 'rear_l',      bandwidth: 0.2 },
    { from: 'torso',       to: 'rear_r',      bandwidth: 0.2 },
    { from: 'fore_l',      to: 'fore_r',      bandwidth: 0.2 },
    { from: 'fore_l',      to: 'mid_graze_l', bandwidth: 0.2 },
    { from: 'fore_r',      to: 'mid_graze_r', bandwidth: 0.2 },
    { from: 'mid_graze_l', to: 'mid_graze_r', bandwidth: 0.2 },
    { from: 'mid_graze_l', to: 'mid_loco_l',  bandwidth: 0.2 },
    { from: 'mid_graze_r', to: 'mid_loco_r',  bandwidth: 0.2 },
    { from: 'mid_loco_l',  to: 'mid_loco_r',  bandwidth: 0.2 },
    { from: 'mid_loco_l',  to: 'rear_l',      bandwidth: 0.2 },
    { from: 'mid_loco_r',  to: 'rear_r',      bandwidth: 0.2 },
    { from: 'rear_l',      to: 'rear_r',      bandwidth: 0.2 },
  ],

  // Large herbivore — star topology
  cave_crab: [
    { from: 'head',  to: 'torso',   bandwidth: 0.8 },
    { from: 'torso', to: 'front_l', bandwidth: 0.6 },
    { from: 'torso', to: 'front_r', bandwidth: 0.6 },
    { from: 'torso', to: 'mid_l',   bandwidth: 0.5 },
    { from: 'torso', to: 'mid_r',   bandwidth: 0.5 },
    { from: 'torso', to: 'rear_l',  bandwidth: 0.5 },
    { from: 'torso', to: 'rear_r',  bandwidth: 0.5 },
  ],

  // Colonial chemotroph — simple star placeholder (torso hub)
  mushroom: [
    { from: 'central_body', to: 'head',          bandwidth: 0.3 },
    { from: 'central_body', to: 'front_sensory',  bandwidth: 0.3 },
    { from: 'central_body', to: 'second_limbs',   bandwidth: 0.3 },
    { from: 'central_body', to: 'rear_limbs_a',   bandwidth: 0.3 },
    { from: 'central_body', to: 'rear_limbs_b',   bandwidth: 0.3 },
    { from: 'central_body', to: 'integument',     bandwidth: 0.3 },
  ],

  // Ambush predator — mesh topology with direct detection-to-strike paths
  ambush_pred: [
    { from: 'head',     to: 'torso',    bandwidth: 0.5 },
    { from: 'torso',    to: 'sensor_l', bandwidth: 0.4 },
    { from: 'torso',    to: 'sensor_r', bandwidth: 0.4 },
    { from: 'torso',    to: 'front_l',  bandwidth: 0.5 },
    { from: 'torso',    to: 'front_r',  bandwidth: 0.5 },
    { from: 'torso',    to: 'rear_l',   bandwidth: 0.4 },
    { from: 'torso',    to: 'rear_r',   bandwidth: 0.4 },
    { from: 'sensor_l', to: 'front_l',  bandwidth: 0.3 },
    { from: 'sensor_r', to: 'front_r',  bandwidth: 0.3 },
    { from: 'front_l',  to: 'front_r',  bandwidth: 0.2 },
    { from: 'rear_l',   to: 'rear_r',   bandwidth: 0.2 },
  ],

  // Player — same topology as meso-predator
  player_meso: [
    { from: 'head',  to: 'torso',   bandwidth: 0.9 },
    { from: 'torso', to: 'front_l', bandwidth: 0.7 },
    { from: 'torso', to: 'front_r', bandwidth: 0.7 },
    { from: 'torso', to: 'mid_l',   bandwidth: 0.5 },
    { from: 'torso', to: 'mid_r',   bandwidth: 0.5 },
    { from: 'torso', to: 'rear_l',  bandwidth: 0.5 },
    { from: 'torso', to: 'rear_r',  bandwidth: 0.5 },
  ],
  player_apex: [
    { from: 'head',  to: 'torso',   bandwidth: 0.9 },
    { from: 'torso', to: 'front_l', bandwidth: 0.7 },
    { from: 'torso', to: 'front_r', bandwidth: 0.7 },
    { from: 'torso', to: 'mid_l',   bandwidth: 0.5 },
    { from: 'torso', to: 'mid_r',   bandwidth: 0.5 },
    { from: 'torso', to: 'rear_l',  bandwidth: 0.5 },
    { from: 'torso', to: 'rear_r',  bandwidth: 0.5 },
  ],
  player_grazer: [
    { from: 'head',  to: 'torso',   bandwidth: 0.9 },
    { from: 'torso', to: 'front_l', bandwidth: 0.7 },
    { from: 'torso', to: 'front_r', bandwidth: 0.7 },
    { from: 'torso', to: 'mid_l',   bandwidth: 0.5 },
    { from: 'torso', to: 'mid_r',   bandwidth: 0.5 },
    { from: 'torso', to: 'rear_l',  bandwidth: 0.5 },
    { from: 'torso', to: 'rear_r',  bandwidth: 0.5 },
  ],

  // Dread King — no pathways (undead, not biological)
  dread_king: [],
};

// Look up a body map for any combatant (player or monster).
// Returns the entity's per-instance body map if it exists (with zone HP state),
// otherwise falls back to the shared template (read-only, no HP).
export function getBodyMap(entity) {
  // Per-instance body map (has zone HP, destroyed state)
  if (entity.bodyMap) return entity.bodyMap;

  // Fallback to shared template (Phase 1 compat — no zone HP)
  if (entity.isPlayer) {
    // Prompt F: use creature template via species key
    if (entity.species && SPECIES_TEMPLATES[entity.species]) {
      const creatureKey = SPECIES_TEMPLATES[entity.species].creatureKey;
      return BODY_MAPS[creatureKey] || null;
    }
    // Legacy fallback
    const bt = entity.bodyType || 'meso';
    return BODY_MAPS['player_' + bt] || BODY_MAPS.player_meso;
  }
  if (entity.key) {
    return BODY_MAPS[entity.key] || null;
  }
  return null;
}

// Initialize a per-instance body map for a creature or player.
// Deep-copies the template and adds zone HP fields + blood system fields.
// Call at spawn time and store the result on the entity.
export function initBodyMap(entity) {
  let template;
  if (entity.isPlayer) {
    // Prompt F: use creature template via species key
    if (entity.species && SPECIES_TEMPLATES[entity.species]) {
      const creatureKey = SPECIES_TEMPLATES[entity.species].creatureKey;
      template = BODY_MAPS[creatureKey] || null;
    }
    // Legacy fallback for old saves without species
    if (!template) {
      const bt = entity.bodyType || 'meso';
      template = BODY_MAPS['player_' + bt] || BODY_MAPS.player_meso;
    }
  } else if (entity.key) {
    template = BODY_MAPS[entity.key] || null;
  }
  if (!template) return null;

  // Deep copy each zone, initialize HP
  const bodyMap = template.map(z => {
    const zone = {
      ...z,
      exposure: z.exposure ? [...z.exposure] : [],
      neuralAllocation: { ...z.neuralAllocation },
      transducers: JSON.parse(JSON.stringify(z.transducers || {})),
      attacks: z.attacks ? z.attacks.map(a => ({ ...a })) : [],
    };
    // Zone HP from mass
    zone.maxHp = Math.max(1, Math.floor(z.mass * HP_PER_KG));
    zone.hp = zone.maxHp;
    zone.destroyed = false;
    // Blood system — clotting per zone
    zone.clotting = 0.0;
    return zone;
  });

  entity.bodyMap = bodyMap;

  // Blood system — compute total mass and initialize blood pool
  const totalMass = bodyMap.reduce((sum, z) => sum + z.mass, 0);
  entity.totalMass = totalMass;
  entity.bloodMax = totalMass * BLOOD_FRACTION;
  entity.blood = entity.bloodMax;
  entity.bleedPenalty = 0;

  // Precompute zone blood shares (used for destruction dump)
  for (const zone of bodyMap) {
    zone.bloodShare = (totalMass > 0) ? (zone.mass / totalMass) * entity.bloodMax : 0;
  }

  return bodyMap;
}

// Look up pathways for any combatant (player or monster).
// Returns the pathway array or an empty array.
export function getPathways(entity) {
  if (entity.isPlayer) {
    // Prompt F: use creature pathways via species key
    if (entity.species && SPECIES_TEMPLATES[entity.species]) {
      const creatureKey = SPECIES_TEMPLATES[entity.species].creatureKey;
      return CREATURE_PATHWAYS[creatureKey] || [];
    }
    // Legacy fallback
    const bt = entity.bodyType || 'meso';
    return CREATURE_PATHWAYS['player_' + bt] || CREATURE_PATHWAYS.player_meso || [];
  }
  if (entity.key) {
    return CREATURE_PATHWAYS[entity.key] || [];
  }
  return [];
}

// Weighted random zone selection.  Takes a body map (zone array),
// returns the selected zone object.  Uses Math.random — called only
// after a hit is confirmed, so the roll is independent of the hit roll.
// Destroyed zones are excluded and their weight redistributed.
export function selectHitZone(bodyMap) {
  const alive = bodyMap.filter(z => !z.destroyed);
  if (alive.length === 0) return bodyMap[bodyMap.length - 1]; // safety fallback
  const totalWeight = alive.reduce((sum, z) => sum + z.targetWeight, 0);
  let r = Math.random() * totalWeight;
  for (const zone of alive) {
    r -= zone.targetWeight;
    if (r <= 0) return zone;
  }
  // Floating-point safety — return last alive zone
  return alive[alive.length - 1];
}

// ==================== FOOTPRINT-BASED HIT RESOLUTION ====================

// 8 directions as [dx, dy], clockwise from north (index 0)
const _DIR_VECS = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];

// Convert dx/dy to direction index 0-7
function directionIndex(dx, dy) {
  for (let i = 0; i < 8; i++) {
    if (_DIR_VECS[i][0] === dx && _DIR_VECS[i][1] === dy) return i;
  }
  return 0; // fallback — facing north
}

// Determine the attack direction in the defender's frame of reference.
// attackerPos/defenderPos: {x, y}
// defenderFacing: {dx, dy} — the direction the defender is facing
// Returns one of the 8 EXPOSURE_LABELS strings.
export function getAttackDirection(attackerPos, defenderPos, defenderFacing) {
  // Raw vector from defender to attacker
  const dx = Math.sign(attackerPos.x - defenderPos.x);
  const dy = Math.sign(attackerPos.y - defenderPos.y);

  // Absolute direction the attack comes from
  const absDirection = directionIndex(dx, dy);

  // Defender's facing as index
  const facingIdx = directionIndex(defenderFacing.dx, defenderFacing.dy);

  // Rotate so defender's facing becomes 'front' (index 0)
  const relIndex = (absDirection - facingIdx + 8) % 8;

  return EXPOSURE_LABELS[relIndex];
}

// Build the exposed zone pool: only surviving zones exposed from the attack direction.
export function getExposedZones(bodyMap, attackDirection) {
  return bodyMap.filter(z => !z.destroyed && z.exposure && z.exposure.includes(attackDirection));
}

// Weighted random selection from a zone array using targetWeight.
// Returns the selected zone. Does not modify the input array.
function weightedRandomSelect(zones) {
  const totalWeight = zones.reduce((sum, z) => sum + z.targetWeight, 0);
  let r = Math.random() * totalWeight;
  for (const zone of zones) {
    r -= zone.targetWeight;
    if (r <= 0) return zone;
  }
  return zones[zones.length - 1];
}

// Select contacted zones based on footprint size.
// Returns an array of zone objects that the attack physically contacts.
// If damageType is 'puncture', always selects exactly 1 zone.
export function selectContactedZones(exposedZones, footprint, damageType) {
  if (exposedZones.length === 0) return [];
  // Puncture always contacts exactly 1 zone
  if (damageType === 'puncture') {
    return [weightedRandomSelect(exposedZones)];
  }

  const contacted = [];
  let coveredMass = 0;
  const remaining = [...exposedZones]; // copy to draw without replacement

  while (coveredMass < footprint && remaining.length > 0) {
    const zone = weightedRandomSelect(remaining);
    contacted.push(zone);
    coveredMass += zone.mass;
    remaining.splice(remaining.indexOf(zone), 1);
  }

  return contacted;
}

// ==================== ZONE DESTRUCTION HELPERS ====================

// Check if remaining neural mass is below the death threshold.
// Returns true if creature should die from neural loss.
export function checkNeuralDeath(bodyMap) {
  let originalNeural = 0;
  let remainingNeural = 0;
  for (const zone of bodyMap) {
    originalNeural += zone.neural;
    if (!zone.destroyed) {
      remainingNeural += zone.neural;
    }
  }
  if (originalNeural === 0) return false; // non-biological (e.g. undead)
  return (remainingNeural / originalNeural) < NEURAL_DEATH_THRESHOLD;
}

// Get all attacks from non-destroyed zones.
// Returns array of { ...attackData, sourceZone: zone.key }
export function getAvailableAttacks(bodyMap) {
  const attacks = [];
  for (const zone of bodyMap) {
    if (!zone.destroyed && zone.attacks) {
      for (const atk of zone.attacks) {
        attacks.push({ ...atk, sourceZone: zone.key });
      }
    }
  }
  return attacks;
}

// Check if any locomotion zones survive.
export function hasLocomotion(bodyMap) {
  return bodyMap.some(z => z.locomotion && !z.destroyed);
}

// Check for sense loss when a zone is destroyed.
// Returns array of { sense, verb, type } where type is 'lost' or 'weakened'.
export function checkSenseLoss(bodyMap, destroyedZone) {
  const senses = [
    { key: 'chemical', verb: 'smell' },
    { key: 'vibration', verb: 'feel vibrations' },
    { key: 'visual', verb: 'see' },
  ];
  const results = [];
  for (const sense of senses) {
    const rawDestroyed = (destroyedZone.transducers && destroyedZone.transducers[sense.key]);
    const destroyedValue = (rawDestroyed && typeof rawDestroyed === 'object') ? Math.max(rawDestroyed.ground || 0, rawDestroyed.air || 0, rawDestroyed.water || 0) : (rawDestroyed || 0);
    if (destroyedValue === 0) continue;

    const bestRemaining = Math.max(
      0,
      ...bodyMap
        .filter(z => !z.destroyed)
        .map(z => { const v = (z.transducers && z.transducers[sense.key]); return (v && typeof v === 'object') ? Math.max(v.ground || 0, v.air || 0, v.water || 0) : (v || 0); })
    );

    if (bestRemaining === 0) {
      results.push({ sense: sense.key, verb: sense.verb, type: 'lost' });
    } else if (bestRemaining < destroyedValue) {
      results.push({ sense: sense.key, verb: sense.verb, type: 'weakened' });
    }
  }
  return results;
}
