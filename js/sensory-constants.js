// ==================== SENSORY CONSTANTS ====================
// Signal emission coefficients, detection range coefficients, confidence
// thresholds, rendering thresholds, and ambient sensing coefficients.
// Split from constants.js — pure data, no imports.

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

// --- Perception Range (Prompt P) — per-zone detection coefficients ---
// Retuned for per-zone quality (no aggregation). Range = cbrt(emission) × quality × coeff.
// Chemical: meso-pred nose (q6) detects 22kg meso at ~12-13 tiles.
// VibGround: lurker sensor (q5) detects 22kg meso at ~10-11 tiles; q1 limb at ~2 tiles.
// VibAir: meso-pred head (q2) detects combat at ~3-4 tiles.
export const CHEM_RANGE_COEFF        = 1.3;   // chemical airborne range coefficient
export const VIB_GROUND_RANGE_COEFF  = 1.75;  // ground vibration range coefficient
export const VIB_AIR_RANGE_COEFF     = 1.15;  // air vibration range coefficient
export const VIS_RANGE_COEFF         = 1.9;   // visual range = cbrt(detectability × light) × sensitivity × coeff
export const MAX_DETECTION_DISTANCE  = 40;    // absolute ceiling — nothing detected beyond this

// ── Ambient terrain sensing ──
// Per-channel coefficients: tiles of ambient awareness per unit of transducer quality.
// These determine how far each sensory channel reveals terrain around the creature.
// Ambient sensing marks terrain as explored; it does NOT reveal entities.
export const AMBIENT_VISUAL_COEFF   = 5.0;   // tiles per unit visual transducer quality (before light modifier)
export const AMBIENT_CHEM_COEFF     = 4.0;   // tiles per unit chemical.airborne quality
export const AMBIENT_VIB_COEFF      = 3.0;   // tiles per unit vibration.ground quality

// --- Continuous Uncertainty (Prompt P) ---
// Replaces binary SNR thresholds with continuously narrowing ranges.
// Size uncertainty: range width = SIZE_UNCERTAINTY_BASE / bestSNR
export const SIZE_UNCERTAINTY_BASE   = 3.0;    // controls how wide size range is at low SNR

// Diet discrimination confidence curve (chemical airborne only)
export const DIET_CONF_MIN          = 2.0;     // SNR below this: diet unknown
export const DIET_CONF_FULL         = 6.0;     // SNR above this: diet certain

// Species identification confidence curve (any channel)
export const SPECIES_CONF_MIN       = 1.2;     // SNR below this: species unknown
export const SPECIES_CONF_FULL      = 2.2;    // SNR above this: species identified

// Wound/condition detection confidence curve
export const CONDITION_CONF_MIN     = 7.0;
export const CONDITION_CONF_FULL    = 14.0;

// Deliberative diet decision threshold — must have this confidence to commit
export const DIET_DECISION_THRESHOLD = 0.7;

// SNR-based player rendering (Phase 3)
export const SNR_FULL_RENDER        = 5.0;     // SNR at which sprite reaches full opacity

// --- Species-Confidence Gated Rendering (Prompt Q) ---
// Below this confidence, non-visual detections render as generic size-scaled blobs.
// Above it, the creature's actual sprite is shown.  Separate from the AI's
// DIET_DECISION_THRESHOLD (0.7) — the player "recognises" a species visually at
// a potentially different confidence than an AI creature commits to a diet classification.
export const SPECIES_DISPLAY_CONFIDENCE = 0.75;

// Unidentified creature marker sizing (Prompt Q)
// Cube-root mass scaling maps the biological range onto a manageable visual range.
export const MARKER_MIN_RADIUS = 0.15;   // fraction of tile size for smallest creatures
export const MARKER_MAX_RADIUS = 0.45;   // fraction of tile size for largest creatures
export const MARKER_MASS_MIN   = 3;      // kg — at or below this → minimum marker
export const MARKER_MASS_MAX   = 250;    // kg — at or above this → maximum marker
