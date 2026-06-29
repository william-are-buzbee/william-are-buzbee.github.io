// ==================== CONSTANTS ====================
// Display constants (TILE, VIEW_W, VIEW_H) moved to display.js — they are now
// dynamic, computed from window size and zoom level.
// Sprite source resolution: SPRITE_NATIVE = 16 (in display.js).

// ==================== RE-EXPORTS (transition bridge) ====================
// These re-exports maintain backward compatibility. Files that import from
// './constants.js' continue to work. Over time, imports should be migrated
// to the specific module for clarity.
export * from './body-maps.js';
export * from './combat-constants.js';
export * from './sensory-constants.js';
export * from './ecology-data.js';

// Import for validation (BIOME_TARGET moved to ecology-data.js)
import { BIOME_TARGET } from './ecology-data.js';

// ==================== WORLD DIMENSIONS ====================
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

// ==================== UI / DISPLAY ====================

export const COL_FG = '#e8e8e8';
export const COL_MID = '#8a8a8a';

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

// ==================== AMBIENT BRIGHTNESS DIP ====================
// Subtle terrain darkening around creatures to aid visibility of camouflaged
// species.  Values are black-overlay alpha levels at pixel distances 1 and 2
// from the creature silhouette.  BLOB_SCALE multiplies both alphas for the
// unidentified-blob rendering tier (low visual confidence).
export const AMBIENT_DIP_INNER      = 0.20;  // alpha for terrain pixels 1px from creature
export const AMBIENT_DIP_OUTER      = 0.08;  // alpha for terrain pixels 2px from creature
export const AMBIENT_DIP_BLOB_SCALE = 0.5;   // multiplier for blob rendering tier

// ==================== GANGLION SYSTEM (Hare Vertical Slice) ====================
// Thresholds for the ganglion-based behavior system.  Only creatures with
// CREATURE_NEURAL data run this path; all others use evaluateReactiveRules.
// First pass — tune during playtesting.
export const BASE_BOLT_THRESHOLD       = 4.0;   // vibration SNR required for bolt reflex at calm
export const BASE_FLEE_THRESHOLD       = 1.5;   // total threat confidence required for flee ganglion (excitatory, overcomes freeze)
export const BASE_FREEZE_THRESHOLD     = 0.5;   // total threat confidence required for freeze ganglion (inhibitory)
export const BASE_ALERT_THRESHOLD      = 0.25;  // total threat confidence required for alert
export const STRESS_NEURAL_SENSITIVITY = 0.6;   // how much stress depresses thresholds (0-1)

// FIRST PASS — transducer confidence normalization.
// Placeholder for proper transducer signal model. Currently a fixed scaling factor
// that determines how raw SNR maps to threat confidence. Transducer output should not
// depend on ganglion thresholds — the signal is what it is, ganglia fire or don't.
export const CONFIDENCE_NORMALIZATION  = 1.0;

// FIRST PASS — confidence contribution caps and size weights.
// These are placeholders for proper transducer sensitivity modeling.
export const THREAT_CONF_CHANNEL_CAP       = 0.7;   // max confidence from any single channel
export const THREAT_CONF_SIZE_MUCH_LARGER  = 0.3;   // confidence bonus for much-larger threat
export const THREAT_CONF_SIZE_LARGER       = 0.2;   // confidence bonus for larger threat
export const THREAT_CONF_SIZE_AMBIGUOUS    = 0.1;   // confidence bonus for ambiguous-size threat
export const STRESS_RELEASE_AMOUNT     = 0.3;   // stress added per threat-ganglion trigger
export const STRESS_RELEASE_MILD       = 0.08;  // stress added from alert (not flee)
export const STRESS_CLEARANCE_BASE     = 0.04;  // stress cleared per turn before circ efficiency
export const STRESS_MAX                = 1.5;   // ceiling on stress accumulation

// ==================== DRIVE SYSTEM ====================
export const MASS_HUNGER_COEFF   = 0.000015;  // hunger per turn per kg of total mass
export const NEURAL_HUNGER_COEFF = 0.0003;    // hunger per turn per kg of neural mass
export const SAFETY_DECAY_RATE   = 0.02;      // safety decays toward 0 per turn
export const REST_BASE_RATE      = 0.001;     // rest increases per turn (very slow baseline)

// Drive thresholds (used by selectBehavior in future prompts)
export const SAFETY_THRESHOLD    = 0.5;       // above this → flee (I-B)
export const HUNGER_THRESHOLD    = 0.6;       // above this → hunt/forage (I-C)
export const REST_THRESHOLD      = 0.7;       // above this → rest (I-D)


// ── Chemical scent system ──
export const GROUND_EMISSION_BASE   = 0.02;   // ground scent per kg body mass per turn
export const AIRBORNE_EMISSION_BASE = 0.01;   // airborne scent per kg body mass per turn
export const BLOOD_EMISSION_MULT    = 5.0;    // multiplier on blood channel when wounded
export const AIRBORNE_DECAY_RATE    = 0.80;   // airborne scent retained per turn (20% loss)
export const ADVECTION_RATE         = 0.35;   // fraction of scent moved downwind per unit wind speed
export const SPREAD_RATE            = 0.12;   // fraction of scent spread to neighbors per turn (turbulent mixing)
export const SCENT_FLOOR            = 0.002;  // below this, scent is removed (sparse cleanup)

// ── Per-species emission profiles ──
// Fractions of a creature's total metabolic emission distributed across the 8
// molecular classes. They describe what a living, metabolically active body of
// this species off-gasses — the signature is produced by the tissue, not chosen.
// Fractions need not sum to exactly 1; the absolute emission amount is scaled by
// mass/activity in scent.js and each class gets its profile fraction of it.
// Hemolymph (wound blood) is added separately when the creature is bleeding.
// Looked up by creature.species, then creature.bodyMapKey, then creature.key.
export const SCENT_PROFILES = {
  wolf:        { ketones:0.30, amines:0.28, fattyAcids:0.22, sulfur:0.05, greenLeaf:0,    terpenoids:0,    hemolymph:0, phenolics:0    },
  dire_wolf:   { ketones:0.32, amines:0.30, fattyAcids:0.20, sulfur:0.05, greenLeaf:0,    terpenoids:0,    hemolymph:0, phenolics:0    },
  hare:        { ketones:0.04, amines:0.03, fattyAcids:0.20, greenLeaf:0.45, terpenoids:0.08, sulfur:0,    hemolymph:0, phenolics:0    },
  cave_crab:   { ketones:0.03, amines:0.02, fattyAcids:0.28, greenLeaf:0.30, phenolics:0.12, sulfur:0.08, terpenoids:0, hemolymph:0   },
  ambush_pred: { ketones:0.28, amines:0.24, fattyAcids:0.22, sulfur:0.08, greenLeaf:0,    terpenoids:0,    hemolymph:0, phenolics:0    },
  lurker:      { ketones:0.22, amines:0.20, fattyAcids:0.18, sulfur:0.18, greenLeaf:0,    terpenoids:0,    hemolymph:0, phenolics:0.05 },
  mushroom:    { phenolics:0.40, sulfur:0.30, greenLeaf:0.10, fattyAcids:0.05, ketones:0,  amines:0,        terpenoids:0, hemolymph:0   },
};

// --- Spatial Hash Grid (Prompt R) ---
export const SPATIAL_CELL_SIZE    = 16;   // tiles per cell side
export const SPATIAL_QUERY_RADIUS = 1;    // cells beyond center to query (1 = 3×3 neighborhood)

// --- Active Simulation Radius (Prompt S) ---
export const ACTIVE_RADIUS  = 40;   // tiles — full simulation within this range
export const DORMANT_RADIUS = 45;   // tiles — go dormant beyond this range (hysteresis)
export const MAX_DRIFT      = 15;   // tiles — maximum position drift on catch-up

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


export const DRIVE_COMPARE_THRESHOLD = 0.01;   // integration capacity >= this → Tier 2
export const PLANNING_THRESHOLD      = 0.08;   // integration capacity >= this → Tier 3

// --- Reactive-Deliberative Override (Prompt O) ---
export const OVERRIDE_SCALE          = 3.5;    // overrideCapacity = integrationCapacity × this
export const STIMULUS_RESISTANCE     = 1.0;    // override threshold = reactiveMagnitude × this
export const CRITICAL_MAGNITUDE      = 0.9;    // magnitude at which override is impossible
export const REACTIVE_HUNGER_THRESHOLD = 0.5;  // hunger level for reactive food rules

// --- Deliberative Seeking Range (Prompt O) ---
export const MIN_SEEK                = 8;      // minimum deliberative seek range (tiles)
export const SEEK_SCALE              = 90;     // seekRange = MIN_SEEK + integrationCapacity × this
export const PERSISTENCE_SCALE       = 30;     // goal persistence (turns) = integrationCapacity × this

// --- Fight Assessment (Prompt O) ---
export const ASSESS_INTEGRATION_THRESHOLD = 0.15; // integration capacity needed for fight assessment

// --- Hunt/Forage (I-C) ---
export const CHASE_LEASH_BASE        = 8;     // minimum chase distance (tiles) even at low hunger
export const CHASE_LEASH_HUNGER_MULT = 15;    // additional chase tiles at hunger 1.0
export const MEAL_HUNGER_REDUCTION   = 0.8;   // hunger reduction per (corpse mass / predator mass)
export const BITE_MASS_FRACTION      = 0.15;  // fraction of own mass consumed per eat turn
export const GRAZE_HUNGER_REDUCTION  = 0.03;  // hunger reduction per turn of grazing
export const HERBIVORE_SAFETY_BONUS  = 0.25;  // herbivores treat safety as 0.25 more urgent than raw value
export const FORAGE_SEARCH_RADIUS    = 12;    // how far herbivores look for food tiles

// ==================== FIRST-PASS SPAWNING CONSTANTS ====================
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
// All values below are hardcoded tuning parameters, not derived from
// energy budgets or ecological simulation. They produce a plausible
// initial snapshot — nothing more. The long-term system will replace
// everything in this section with emergent population dynamics.

// ---- Density ratios (1 creature per N tiles of suitable habitat) ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
//
// Original ecological density values — restore after detection performance optimization:
// export const SPAWN_DENSITY_SMALL_HERB  = [20, 30];   // C3 — small herbivore (hare)
// export const SPAWN_DENSITY_LARGE_HERB  = [80, 120];  // C4 — large herbivore (cave_crab)
// export const SPAWN_DENSITY_MESO_PRED   = [100, 150]; // C1 — meso-predator (wolf)
// export const SPAWN_DENSITY_AMBUSH_PRED = [120, 180]; // C6 — ambush predator (ambush_pred)
// export const SPAWN_DENSITY_APEX_PRED   = [350, 500]; // C2 — apex predator (dire_wolf)
//
// FIRST PASS SPAWNING — density reduced for testing (engine can't handle full ecological density yet)
// Restore higher values after detection system performance optimization
// ~15× increase in denominators — targets ~30-50 total on 224×224 map
export const SPAWN_DENSITY_SMALL_HERB  = [300, 450];   // C3 — small herbivore (hare)        ~15-25 total
export const SPAWN_DENSITY_LARGE_HERB  = [1200, 1800]; // C4 — large herbivore (cave_crab)    ~5-10 total
export const SPAWN_DENSITY_MESO_PRED   = [1500, 2250]; // C1 — meso-predator (wolf)           ~3-5 total
export const SPAWN_DENSITY_AMBUSH_PRED = [1800, 2700]; // C6 — ambush predator (ambush_pred)  ~2-4 total
export const SPAWN_DENSITY_APEX_PRED   = [5000, 7500]; // C2 — apex predator (dire_wolf)      ~1-2 total

// ---- Prey clustering (small herbivores) ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
export const SPAWN_CLUSTER_SIZE    = [3, 6];  // C3 individuals per cluster
export const SPAWN_CLUSTER_RADIUS  = 6;       // tiles from cluster center

// ---- Viability check ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
export const SPAWN_VIABILITY_RADIUS = 6;  // check this radius around spawn point
export const SPAWN_VIABILITY_MIN    = 6;  // need at least this many habitat tiles in radius

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

// ── Action Point system ──
// Deterministic AP accumulation replaces probabilistic bonus-move speed.
// AP and world-time are SEPARATE calculations that both read player speed:
//   AP accumulation:  ratio-based (creaturePTW / playerPTW) — no world-ticks involved.
//   World-time:       BASE_TICKS_PER_ACTION × (REFERENCE_SPEED / playerPTW) per player input.
export const BASE_AP_COST          = 1000;  // AP required to take one action
export const MAX_ACTIONS_PER_INPUT = 3;     // cap on creature actions per player input
export const DAY_CYCLE_TICKS       = 1200;  // ticks per full day/night cycle (was 600)
export const REFERENCE_SPEED       = 0.26;  // baseline PTW for "normal" walking speed (prowler at full substrate)
export const BASE_TICKS_PER_ACTION = 1.0;   // world-ticks per player action at REFERENCE_SPEED

// DEPRECATED — retained for any external references; no longer used by the AP system.
// Relative speed system — power-to-weight ratio governs enemy action frequency.
export const MAX_BONUS_MOVE_CHANCE = 0.50;  // DEPRECATED (no bonus moves in AP system)
export const MIN_ACTION_CHANCE     = 0.25;  // DEPRECATED (no action skipping in AP system)

// DEPRECATED — replaced by mass-dependent turning cost system (applyTurningCost in physiology.js).
// Turning is now deterministic: player always faces the pressed direction, and the physical cost
// is reflected in reduced _consecutiveMoveTurns (momentum loss proportional to mass and turn angle).
export const TURN_AGILITY_COEFF    = 1.0;   // DEPRECATED — no longer used

// Compute the minimum number of 45° increments between two facing directions.
// Returns 0–4 (0 = same direction, 4 = full reversal).
// Used by mass-dependent turning cost system (applyTurningCost in physiology.js).
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

