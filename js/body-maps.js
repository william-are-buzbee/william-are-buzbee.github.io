// ==================== BODY MAPS ====================
// All creature body map data, species templates, neural architecture,
// pathway definitions, substrate/fiber constants, and body-map helper functions.
// Split from constants.js.

import { BLOOD_FRACTION } from './combat-constants.js';

// Zone HP derived from zone mass. Each kg of zone tissue = this many HP.
export const HP_PER_KG = 5;

// ==================== ZONE DESTRUCTION CONSTANTS ====================
// If remaining neural mass fraction falls below this, the creature dies.
export const NEURAL_DEATH_THRESHOLD = 0.35;  // die when surviving neural mass drops to 35% of original

// ==================== FOOTPRINT SYSTEM ====================
// Armor derived from structural tissue mass per zone
export const ARMOR_PER_STRUCTURAL_KG = 1.5;

// 8-directional exposure labels, indexed clockwise from north (0=N facing → 'front')
export const EXPOSURE_LABELS = ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'];

// ==================== SUBSTRATE SYSTEM ====================
// Substrate represents locally stored metabolic fuel in muscle tissue.
// Fast-contracting fibers deplete substrate rapidly during high-intensity output;
// slow-contracting fibers use aerobic pathways and deplete more slowly.
// Units are abstract (tuned so locomotion zones deplete in ~8-10 turns at max).
export const SUBSTRATE_PER_KG_MUSCLE = 5.0;
export const SUBSTRATE_DEPLETION_HIGH = 0.12;   // fraction of zone's fast-contracting mass consumed per turn at max intensity
export const SUBSTRATE_DEPLETION_MOD  = 0.03;   // fraction consumed per turn at moderate intensity (wander, forage)
export const FAST_TWITCH_RECRUIT_THRESHOLD = 0.4; // intensity below this is fully aerobic — no substrate depletion
export const CIRC_EFFICIENCY_CLOSED   = 1.0;    // circulatory efficiency for closed systems (aerobic force output)
export const CIRC_EFFICIENCY_OPEN     = 0.65;   // circulatory efficiency for open systems (aerobic force output)
export const CIRC_EFFICIENCY_HYBRID   = 0.85;   // circulatory efficiency for hybrid systems (aerobic force output)

// Substrate regeneration — biologically grounded formula (replaces SUBSTRATE_REGEN_RATE).
// Every muscle cell independently resynthesizes substrate from circulating nutrients via
// enzymatic activity. Rate scales with total muscle mass (enzymatic capacity), circulatory
// nutrient delivery at rest, capillary density (correlated with oxidative fiber content),
// and enzymatic upregulation when stores are depleted (front-loaded recovery curve).
export const SUBSTRATE_REGEN_BASE     = 0.08;   // base substrate regenerated per kg muscle per turn (before modifiers)
export const CIRC_REGEN_EFF_CLOSED    = 1.0;    // circulatory regen efficiency — closed systems (full nutrient delivery)
export const CIRC_REGEN_EFF_OPEN      = 0.80;   // circulatory regen efficiency — open systems (adequate at rest, lower pressure)
export const CIRC_REGEN_EFF_HYBRID    = 0.90;   // circulatory regen efficiency — hybrid systems
export const VASCULARITY_MIN          = 0.65;   // minimum vascularity factor for pure fast-twitch muscle (fiberRatio 1.0)
export const REGEN_UPREGULATION       = 3.0;    // enzymatic upregulation when substrate stores are depleted (boost multiplier at empty)

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
    circulationType: 'closed',
    // Visual detection: species-level integument reflectance (Pass 1).
    // Thick textured skin, wrinkled, hairless. Generalist cross-biome.
    // Medium-dark, neutral — decent match in most habitats, perfect in none.
    integument: { brightness: 0.25, hue: 'brown' },
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
    circulationType: 'closed',
    // Visual detection: dense, dark skin. Preference for denser cover.
    // Dark, reddish — optimized for forest interior.
    integument: { brightness: 0.18, hue: 'dark-red' },
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
    circulationType: 'open',
    // Visual detection: semi-flexible integument, thin. Open-terrain grazer.
    // Matches dark red-brown grassland mats where it feeds.
    integument: { brightness: 0.33, hue: 'warm-red' },
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
    circulationType: 'closed',
    // Visual detection: thick, mucousy/oily surface. Amphibious.
    // Dark, brownish — matches muddy coastal substrate.
    integument: { brightness: 0.22, hue: 'brown' },
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
    circulationType: 'open',
    // Visual detection: thickened, stiffened integument, segmented armor.
    // Forest/cover specialist. Very dark, reddish — near-perfect forest floor match.
    integument: { brightness: 0.15, hue: 'dark-red' },
  },
};

// ==================== INTEGUMENT LOOKUP (Visual Detection Pass 1) ====================
// Maps creature keys to integument reflectance data for visual detection.
// Species-level uniform color (per-zone is Pass 2).
// Derived from ecology descriptions and habitat preferences.
// Creature 5 (mushroom/colonial chemotroph) is a dead concept — intentionally omitted.
const CREATURE_INTEGUMENT = {
  wolf:        { brightness: 0.25, hue: 'brown' },      // C1 meso-predator: generalist, cross-biome
  dire_wolf:   { brightness: 0.18, hue: 'dark-red' },   // C2 apex predator: forest interior specialist
  hare:        { brightness: 0.33, hue: 'warm-red' },    // C3 small herbivore: open-terrain grazer
  cave_crab:   { brightness: 0.22, hue: 'brown' },      // C4 large grazer: amphibious, muddy coastal
  ambush_pred: { brightness: 0.15, hue: 'dark-red' },   // C6 ambush predator: forest/cover specialist
};

/**
 * Get integument data for any entity (player or creature).
 * Returns { brightness, hue } or null if no integument defined.
 */
export function getIntegument(entity) {
  // Player: look up via species template
  if (entity.isPlayer && entity.species) {
    const template = SPECIES_TEMPLATES[entity.species];
    if (template && template.integument) return template.integument;
    // Fallback: look up by creature key from template
    if (template && template.creatureKey) {
      return CREATURE_INTEGUMENT[template.creatureKey] || null;
    }
    return null;
  }
  // NPC creature: look up by key
  if (entity.key) {
    return CREATURE_INTEGUMENT[entity.key] || null;
  }
  return null;
}

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
      transducers: { chemical: { contact: 2, airborne: 6, dissolved: 0 }, visual: { acuity: 3, placement: 'forward', fieldAngle: 120 }, vibration: { ground: 0, air: 2, water: 0 } },
      locomotion: false, vital: false,
      attacks: [{ key: 'bite', name: 'Bite', baseDamage: 4, damageType: 'puncture', accuracy: 0.80, canReflex: false, footprintModifier: 0.15 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.34,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 3.00, structural: 1.50, neural: 0.22, sensory: 0.08, connective: 2.70, mass: 7.5,
      neuralAllocation: { motorRelay: 0.12, chemicalProcessing: 0.05, patternLibrary: 0.05 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.09,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.85, structural: 0.35, neural: 0.05, sensory: 0.05, connective: 0.30, mass: 1.6,
      neuralAllocation: { motorControl: 0.04, chemicalProcessing: 0.01 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'claw', name: 'Claw', baseDamage: 3, damageType: 'slashing', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.09,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.85, structural: 0.35, neural: 0.05, sensory: 0.05, connective: 0.30, mass: 1.6,
      neuralAllocation: { motorControl: 0.04, chemicalProcessing: 0.01 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'claw', name: 'Claw', baseDamage: 3, damageType: 'slashing', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_l', name: 'Mid-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'front_left', 'rear_left'],
      muscle: 1.10, structural: 0.40, neural: 0.04, sensory: 0.00, connective: 0.36, mass: 1.9,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_r', name: 'Mid-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'front_right', 'rear_right'],
      muscle: 1.10, structural: 0.40, neural: 0.04, sensory: 0.00, connective: 0.36, mass: 1.9,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.09,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 1.30, structural: 0.42, neural: 0.04, sensory: 0.00, connective: 0.34, mass: 2.1,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.08,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 1.30, structural: 0.42, neural: 0.04, sensory: 0.00, connective: 0.34, mass: 2.1,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
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
      transducers: { chemical: { contact: 2, airborne: 7, dissolved: 0 }, visual: { acuity: 4, placement: 'forward', fieldAngle: 120 }, vibration: { ground: 0, air: 3, water: 0 } },
      locomotion: false, vital: false,
      attacks: [{ key: 'bite', name: 'Bite', baseDamage: 8, damageType: 'puncture', accuracy: 0.80, canReflex: false, footprintModifier: 0.15 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.30,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 10.50, structural: 5.50, neural: 0.42, sensory: 0.10, connective: 13.48, mass: 30.0,
      neuralAllocation: { motorRelay: 0.26, chemicalProcessing: 0.08, patternLibrary: 0.08 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.10,
      exposure: ['front', 'front_left', 'left'],
      muscle: 3.80, structural: 1.60, neural: 0.08, sensory: 0.12, connective: 2.40, mass: 8.0,
      neuralAllocation: { motorControl: 0.06, chemicalProcessing: 0.02 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'claw', name: 'Claw', baseDamage: 6, damageType: 'slashing', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.10,
      exposure: ['front', 'front_right', 'right'],
      muscle: 3.80, structural: 1.60, neural: 0.08, sensory: 0.12, connective: 2.40, mass: 8.0,
      neuralAllocation: { motorControl: 0.06, chemicalProcessing: 0.02 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'claw', name: 'Claw', baseDamage: 6, damageType: 'slashing', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_l', name: 'Mid-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'front_left', 'rear_left'],
      muscle: 4.20, structural: 1.60, neural: 0.06, sensory: 0.00, connective: 2.64, mass: 8.5,
      neuralAllocation: { motorControl: 0.06 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_r', name: 'Mid-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'front_right', 'rear_right'],
      muscle: 4.20, structural: 1.60, neural: 0.06, sensory: 0.00, connective: 2.64, mass: 8.5,
      neuralAllocation: { motorControl: 0.06 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.11,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 4.80, structural: 1.80, neural: 0.06, sensory: 0.00, connective: 2.84, mass: 9.5,
      neuralAllocation: { motorControl: 0.06 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.11,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 4.80, structural: 1.80, neural: 0.06, sensory: 0.00, connective: 2.84, mass: 9.5,
      neuralAllocation: { motorControl: 0.06 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
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
      fiberRatio: 0.15, substrate: 0.20, substrateMax: 0.20,
      neuralAllocation: { visualProcessing: 0.020, vibrationProcessing: 0.010, patternLibrary: 0.008, motorControl: 0.004 },
      transducers: { visual: { acuity: 4, placement: 'lateral', fieldAngle: 170 }, vibration: { ground: 0, air: 1, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 } },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.24,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 0.25, structural: 0.22, neural: 0.022, sensory: 0.02, connective: 0.488, mass: 1.00,
      fiberRatio: 0.40, substrate: 1.25, substrateMax: 1.25,
      neuralAllocation: { motorRelay: 0.010, vibrationProcessing: 0.006, patternLibrary: 0.006 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'fore_l', name: 'Fore-Left Limb', targetWeight: 0.05,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.03, structural: 0.03, neural: 0.028, sensory: 0.05, connective: 0.082, mass: 0.22,
      fiberRatio: 0.10, substrate: 0.15, substrateMax: 0.15,
      neuralAllocation: { vibrationProcessing: 0.010, motorControl: 0.008, patternLibrary: 0.006, chemicalProcessing: 0.004 },
      transducers: { vibration: { ground: 5, air: 1, water: 0 }, chemical: { contact: 2, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'fore_r', name: 'Fore-Right Limb', targetWeight: 0.05,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.03, structural: 0.03, neural: 0.028, sensory: 0.05, connective: 0.082, mass: 0.22,
      fiberRatio: 0.10, substrate: 0.15, substrateMax: 0.15,
      neuralAllocation: { vibrationProcessing: 0.010, motorControl: 0.008, patternLibrary: 0.006, chemicalProcessing: 0.004 },
      transducers: { vibration: { ground: 5, air: 1, water: 0 }, chemical: { contact: 2, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_graze_l', name: 'Mid-Graze-Left Limb', targetWeight: 0.05,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.04, structural: 0.03, neural: 0.026, sensory: 0.035, connective: 0.089, mass: 0.22,
      fiberRatio: 0.15, substrate: 0.20, substrateMax: 0.20,
      neuralAllocation: { vibrationProcessing: 0.010, motorControl: 0.008, patternLibrary: 0.006, chemicalProcessing: 0.002 },
      transducers: { vibration: { ground: 4, air: 1, water: 0 }, chemical: { contact: 1, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_graze_r', name: 'Mid-Graze-Right Limb', targetWeight: 0.05,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.04, structural: 0.03, neural: 0.026, sensory: 0.035, connective: 0.089, mass: 0.22,
      fiberRatio: 0.15, substrate: 0.20, substrateMax: 0.20,
      neuralAllocation: { vibrationProcessing: 0.010, motorControl: 0.008, patternLibrary: 0.006, chemicalProcessing: 0.002 },
      transducers: { vibration: { ground: 4, air: 1, water: 0 }, chemical: { contact: 1, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_loco_l', name: 'Mid-Loco-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'rear_left', 'rear'],
      muscle: 0.5, structural: 0.08, neural: 0.028, sensory: 0.02, connective: 0.102, mass: 0.73,
      fiberRatio: 0.70, substrate: 2.50, substrateMax: 2.50,
      neuralAllocation: { motorControl: 0.012, vibrationProcessing: 0.008, patternLibrary: 0.008 },
      transducers: { vibration: { ground: 3, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_loco_r', name: 'Mid-Loco-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'rear_right', 'rear'],
      muscle: 0.5, structural: 0.08, neural: 0.028, sensory: 0.02, connective: 0.102, mass: 0.73,
      fiberRatio: 0.70, substrate: 2.50, substrateMax: 2.50,
      neuralAllocation: { motorControl: 0.012, vibrationProcessing: 0.008, patternLibrary: 0.008 },
      transducers: { vibration: { ground: 3, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.15,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 0.75, structural: 0.10, neural: 0.030, sensory: 0.02, connective: 0.140, mass: 1.04,
      fiberRatio: 0.80, substrate: 3.75, substrateMax: 3.75,
      neuralAllocation: { motorControl: 0.014, vibrationProcessing: 0.008, patternLibrary: 0.008 },
      transducers: { vibration: { ground: 3, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.15,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 0.75, structural: 0.10, neural: 0.030, sensory: 0.02, connective: 0.140, mass: 1.04,
      fiberRatio: 0.80, substrate: 3.75, substrateMax: 3.75,
      neuralAllocation: { motorControl: 0.014, vibrationProcessing: 0.008, patternLibrary: 0.008 },
      transducers: { vibration: { ground: 3, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
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
      transducers: { chemical: { contact: 4, airborne: 5, dissolved: 0 }, visual: { acuity: 5, placement: 'lateral', fieldAngle: 150 }, vibration: { ground: 0, air: 2, water: 0 } },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.34,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 26.00, structural: 20.00, neural: 0.54, sensory: 0.10, connective: 33.36, mass: 80.0,
      neuralAllocation: { motorRelay: 0.38, chemicalProcessing: 0.08, patternLibrary: 0.08 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.08,
      exposure: ['front', 'front_left', 'left'],
      muscle: 5.00, structural: 4.20, neural: 0.10, sensory: 0.15, connective: 5.55, mass: 15.0,
      neuralAllocation: { motorControl: 0.08, chemicalProcessing: 0.02 },
      transducers: { chemical: { contact: 3, airborne: 0, dissolved: 3 }, vibration: { ground: 0, air: 0, water: 3 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'shove', name: 'Shove', baseDamage: 6, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.6 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.08,
      exposure: ['front', 'front_right', 'right'],
      muscle: 5.00, structural: 4.20, neural: 0.10, sensory: 0.15, connective: 5.55, mass: 15.0,
      neuralAllocation: { motorControl: 0.08, chemicalProcessing: 0.02 },
      transducers: { chemical: { contact: 3, airborne: 0, dissolved: 3 }, vibration: { ground: 0, air: 0, water: 3 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'shove', name: 'Shove', baseDamage: 6, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.6 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_l', name: 'Mid-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'front_left', 'rear_left'],
      muscle: 9.00, structural: 3.80, neural: 0.08, sensory: 0.00, connective: 5.12, mass: 18.0,
      neuralAllocation: { motorControl: 0.08 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_r', name: 'Mid-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'front_right', 'rear_right'],
      muscle: 9.00, structural: 3.80, neural: 0.08, sensory: 0.00, connective: 5.12, mass: 18.0,
      neuralAllocation: { motorControl: 0.08 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.12,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 11.00, structural: 4.40, neural: 0.08, sensory: 0.00, connective: 5.52, mass: 21.0,
      neuralAllocation: { motorControl: 0.08 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [{ key: 'kick', name: 'Kick', baseDamage: 8, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.3 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.12,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 11.00, structural: 4.40, neural: 0.08, sensory: 0.00, connective: 5.52, mass: 21.0,
      neuralAllocation: { motorControl: 0.08 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
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
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'central_body', name: 'central body', targetWeight: 0.25,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_sensory', name: 'sensory fronds', targetWeight: 0.12,
      exposure: ['front', 'front_left', 'front_right'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'second_limbs', name: 'mid fronds', targetWeight: 0.15,
      exposure: ['left', 'front_left', 'rear_left', 'right', 'front_right', 'rear_right'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_limbs_a', name: 'rear limbs', targetWeight: 0.15,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_limbs_b', name: 'hind limbs', targetWeight: 0.15,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.3, bleedThreshold: 0.3, destroyed: false },
    { key: 'integument', name: 'outer rind', targetWeight: 0.10,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 0.02, structural: 0.02, neural: 0.01, sensory: 0.01, connective: 0.02, mass: 0.08,
      neuralAllocation: { patternLibrary: 0.005, motorControl: 0.005 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
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
      transducers: { visual: { acuity: 3, placement: 'forward', fieldAngle: 120 }, vibration: { ground: 0, air: 2, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 } },
      locomotion: false, vital: false,
      attacks: [{ key: 'bite', name: 'Bite', baseDamage: 4, damageType: 'puncture', accuracy: 0.80, canReflex: false, footprintModifier: 0.15 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.31,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 2.20, structural: 1.30, neural: 0.20, sensory: 0.15, connective: 2.15, mass: 6.0,
      neuralAllocation: { motorRelay: 0.08, vibrationProcessing: 0.06, patternLibrary: 0.06 },
      transducers: { vibration: { ground: 1, air: 0, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'sensor_l', name: 'Sensor-Left Limb', targetWeight: 0.08,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.50, structural: 0.25, neural: 0.28, sensory: 0.40, connective: 0.37, mass: 1.8,
      neuralAllocation: { vibrationProcessing: 0.15, chemicalProcessing: 0.06, patternLibrary: 0.05, motorControl: 0.02 },
      transducers: { vibration: { ground: 5, air: 2, water: 0 }, chemical: { contact: 2, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: false,
      attacks: [{ key: 'probe', name: 'Probe', baseDamage: 2, damageType: 'puncture', accuracy: 0.80, canReflex: true, footprintModifier: 0.1 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'sensor_r', name: 'Sensor-Right Limb', targetWeight: 0.08,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.50, structural: 0.25, neural: 0.28, sensory: 0.40, connective: 0.37, mass: 1.8,
      neuralAllocation: { vibrationProcessing: 0.15, chemicalProcessing: 0.06, patternLibrary: 0.05, motorControl: 0.02 },
      transducers: { vibration: { ground: 5, air: 2, water: 0 }, chemical: { contact: 2, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: false, vital: false,
      attacks: [{ key: 'probe', name: 'Probe', baseDamage: 2, damageType: 'puncture', accuracy: 0.80, canReflex: true, footprintModifier: 0.1 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.10,
      exposure: ['front', 'front_left', 'left'],
      muscle: 1.10, structural: 0.35, neural: 0.22, sensory: 0.18, connective: 0.37, mass: 2.2,
      neuralAllocation: { vibrationProcessing: 0.10, chemicalProcessing: 0.03, motorControl: 0.05, patternLibrary: 0.04 },
      transducers: { vibration: { ground: 4, air: 1, water: 0 }, chemical: { contact: 1, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'hook', name: 'Hook', baseDamage: 3, damageType: 'puncture', accuracy: 0.80, canReflex: true, footprintModifier: 0.2 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.10,
      exposure: ['front', 'front_right', 'right'],
      muscle: 1.10, structural: 0.35, neural: 0.22, sensory: 0.18, connective: 0.37, mass: 2.2,
      neuralAllocation: { vibrationProcessing: 0.10, chemicalProcessing: 0.03, motorControl: 0.05, patternLibrary: 0.04 },
      transducers: { vibration: { ground: 4, air: 1, water: 0 }, chemical: { contact: 1, airborne: 0, dissolved: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'hook', name: 'Hook', baseDamage: 3, damageType: 'puncture', accuracy: 0.80, canReflex: true, footprintModifier: 0.2 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.12,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 1.80, structural: 0.45, neural: 0.18, sensory: 0.12, connective: 0.35, mass: 2.9,
      neuralAllocation: { vibrationProcessing: 0.06, visualProcessing: 0.04, motorControl: 0.05, patternLibrary: 0.03 },
      transducers: { vibration: { ground: 2, air: 1, water: 0 }, visual: { acuity: 1, placement: 'forward', fieldAngle: 120 }, chemical: { contact: 0, airborne: 0, dissolved: 0 } },
      locomotion: true, vital: false,
      attacks: [{ key: 'kick', name: 'Kick', baseDamage: 4, damageType: 'blunt', accuracy: 0.80, canReflex: true, footprintModifier: 0.35 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.11,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 1.80, structural: 0.45, neural: 0.18, sensory: 0.12, connective: 0.35, mass: 2.9,
      neuralAllocation: { vibrationProcessing: 0.06, visualProcessing: 0.04, motorControl: 0.05, patternLibrary: 0.03 },
      transducers: { vibration: { ground: 2, air: 1, water: 0 }, visual: { acuity: 1, placement: 'forward', fieldAngle: 120 }, chemical: { contact: 0, airborne: 0, dissolved: 0 } },
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
      transducers: { chemical: { contact: 2, airborne: 6, dissolved: 0 }, visual: { acuity: 3, placement: 'forward', fieldAngle: 120 }, vibration: { ground: 0, air: 2, water: 0 } },
      locomotion: false, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'torso', name: 'Torso', targetWeight: 0.34,
      exposure: ['front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'front_left'],
      muscle: 3.00, structural: 1.50, neural: 0.22, sensory: 0.08, connective: 2.70, mass: 7.5,
      neuralAllocation: { motorRelay: 0.12, chemicalProcessing: 0.05, patternLibrary: 0.05 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 },
      locomotion: false, vital: true,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_l', name: 'Front-Left Limb', targetWeight: 0.09,
      exposure: ['front', 'front_left', 'left'],
      muscle: 0.85, structural: 0.35, neural: 0.05, sensory: 0.05, connective: 0.30, mass: 1.6,
      neuralAllocation: { motorControl: 0.04, chemicalProcessing: 0.01 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'strike', name: 'Strike', baseDamage: 3, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'front_r', name: 'Front-Right Limb', targetWeight: 0.09,
      exposure: ['front', 'front_right', 'right'],
      muscle: 0.85, structural: 0.35, neural: 0.05, sensory: 0.05, connective: 0.30, mass: 1.6,
      neuralAllocation: { motorControl: 0.04, chemicalProcessing: 0.01 },
      transducers: { chemical: { contact: 1, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 }, visual: 0 },
      locomotion: true, vital: false,
      attacks: [{ key: 'strike', name: 'Strike', baseDamage: 3, damageType: 'blunt', accuracy: 0.80, canReflex: false, footprintModifier: 0.45 }],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_l', name: 'Mid-Left Limb', targetWeight: 0.10,
      exposure: ['left', 'front_left', 'rear_left'],
      muscle: 1.10, structural: 0.40, neural: 0.04, sensory: 0.00, connective: 0.36, mass: 1.9,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'mid_r', name: 'Mid-Right Limb', targetWeight: 0.10,
      exposure: ['right', 'front_right', 'rear_right'],
      muscle: 1.10, structural: 0.40, neural: 0.04, sensory: 0.00, connective: 0.36, mass: 1.9,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_l', name: 'Rear-Left Limb', targetWeight: 0.09,
      exposure: ['rear', 'rear_left', 'left'],
      muscle: 1.30, structural: 0.42, neural: 0.04, sensory: 0.00, connective: 0.34, mass: 2.1,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
      locomotion: true, vital: false,
      attacks: [],
      bleedRate: 0.5, bleedThreshold: 0.3, destroyed: false },
    { key: 'rear_r', name: 'Rear-Right Limb', targetWeight: 0.08,
      exposure: ['rear', 'rear_right', 'right'],
      muscle: 1.30, structural: 0.42, neural: 0.04, sensory: 0.00, connective: 0.34, mass: 2.1,
      neuralAllocation: { motorControl: 0.04 },
      transducers: { chemical: { contact: 0, airborne: 0, dissolved: 0 }, vibration: { ground: 1, air: 0, water: 0 } },
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

// ==================== NEURAL ARCHITECTURE ====================
// Per-creature neural architecture: named ganglion structures, their sensory
// inputs, motor outputs, reflex arcs, pattern templates, and suppression/
// modulation connections.  Queryable: "what pathways connect center X to
// zone Y?", "what templates does this creature have?", "what is this
// creature's coordination capacity?"
//
// Nothing reads this data yet.  It exists so future systems (ganglion
// template matching, motor execution, dynamic speed) can consume it.
export const CREATURE_NEURAL = {
  hare: {
    structures: [
      // ── Fore-Limb Local Ganglia ──
      // Hair-trigger vibration sensors.  Shortest motor-activation path in the body:
      // vibration spike → local ganglion → central_loco bolt.  Fires before any
      // other neural structure has processed the signal.
      {
        id: 'fore_ganglion_l',
        type: 'local_ganglion',
        zone: 'fore_l',
        neuralMass: 0.005,
        sensoryInputs: ['fore_l.vibration.ground'],
        reflexArcs: [
          { trigger: 'vibration_magnitude_spike', output: 'central_loco', intensity: 'max' }
        ],
        forwardsTo: ['threat_classification']
      },
      {
        id: 'fore_ganglion_r',
        type: 'local_ganglion',
        zone: 'fore_r',
        neuralMass: 0.005,
        sensoryInputs: ['fore_r.vibration.ground'],
        reflexArcs: [
          { trigger: 'vibration_magnitude_spike', output: 'central_loco', intensity: 'max' }
        ],
        forwardsTo: ['threat_classification']
      },

      // ── Central Locomotion Ganglion ──
      // Hub for all locomotion motor output.  Two patterns only:
      //   simultaneous_max  — the bolt.  Every locomotion zone at peak.  No nuance.
      //   alternating_variable — normal gait.  Wandering, foraging, sustained flee.
      // Cannot produce per-limb independent timing or asymmetric recruitment.
      // 0.01kg coordination budget limits it to these two basic patterns.
      {
        id: 'central_loco',
        type: 'coordination_center',
        zone: 'torso',
        neuralMass: 0.01,
        motorOutputs: ['mid_loco_l', 'mid_loco_r', 'rear_l', 'rear_r'],
        patterns: ['simultaneous_max', 'alternating_variable'],
        receivesFrom: ['fore_ganglion_l', 'fore_ganglion_r', 'threat_classification', 'food_identification']
      },

      // ── Threat-Classification Region ──
      // Integrated threat detection.  Receives processed vibration from fore-limb
      // ganglia AND head visual.  Houses wired (non-plastic) threat templates:
      //   heavy_rhythmic_vibration + large_moving_visual → high-confidence predator → flee
      //   heavy_single_impact + no_visual → ambiguous → moderate alert
      //   light_rapid_vibration + small_visual → low-threat → no motor activation
      // Can suppress fore-limb bolt reflexes when template returns low-threat.
      {
        id: 'threat_classification',
        type: 'pattern_region',
        zone: 'torso',
        neuralMass: 0.01,
        sensoryInputs: ['fore_ganglion_l.processed', 'fore_ganglion_r.processed', 'head.visual'],
        templates: 'threat',
        output: 'central_loco',
        canSuppress: ['fore_ganglion_l.reflexArcs', 'fore_ganglion_r.reflexArcs']
      },

      // ── Food-Identification Region ──
      // Visual-only food detection.  Completely separate from threat pathway —
      // no shared neural tissue, no shared templates.  The only interaction point
      // is the central locomotion ganglion, where threat signal wins conflicts
      // (higher intensity + shorter reflex connection).
      {
        id: 'food_identification',
        type: 'pattern_region',
        zone: 'head',
        neuralMass: 0.01,
        sensoryInputs: ['head.visual'],
        templates: 'food_visual',
        output: 'central_loco'
      },

      // ── Mid-Graze Local Ganglia ──
      // Contact-triggered feeding reflex only.  Chemical contact → edible match →
      // local slow sustained motor pattern (grab, manipulate, chew).  Cannot seek
      // food — only processes what the limb is already touching.
      // Vibration from ground transducers (quality 4) forwards upstream to
      // threat_classification but does NOT integrate locally with feeding.
      {
        id: 'graze_ganglion_l',
        type: 'local_ganglion',
        zone: 'mid_graze_l',
        neuralMass: 0.003,
        sensoryInputs: ['mid_graze_l.chemical.contact'],
        reflexArcs: [
          { trigger: 'edible_contact', output: 'mid_graze_l', intensity: 'low_sustained' }
        ],
        forwardsTo: ['threat_classification']
      },
      {
        id: 'graze_ganglion_r',
        type: 'local_ganglion',
        zone: 'mid_graze_r',
        neuralMass: 0.003,
        sensoryInputs: ['mid_graze_r.chemical.contact'],
        reflexArcs: [
          { trigger: 'edible_contact', output: 'mid_graze_r', intensity: 'low_sustained' }
        ],
        forwardsTo: ['threat_classification']
      },

      // ── Integration Workspace ──
      // Minimal deliberative capacity (0.01kg).  Can compare current situation
      // against very short-term memory (last few encounters), modestly update
      // template confidence, resolve ambiguous matches, and suppress bolt reflex
      // when template match is uncertain.
      // Cannot: sustain representations beyond a few turns, learn complex new
      // templates, plan multi-step actions, or override strong ganglion-level signals.
      {
        id: 'integration_workspace',
        type: 'integration',
        zone: 'torso',
        neuralMass: 0.01,
        receivesFrom: ['threat_classification', 'food_identification'],
        capacity: 0.01,
        canSuppress: ['fore_ganglion_l.reflexArcs', 'fore_ganglion_r.reflexArcs', 'threat_classification.output'],
        canModulate: ['central_loco.intensity']
      }
    ],
    totalNeuralMass: 0.08
  }
};

// Look up neural architecture for any combatant.
// Returns the neural architecture object or null.
export function getNeuralArchitecture(entity) {
  if (entity.isPlayer) {
    if (entity.species && SPECIES_TEMPLATES[entity.species]) {
      const creatureKey = SPECIES_TEMPLATES[entity.species].creatureKey;
      return CREATURE_NEURAL[creatureKey] || null;
    }
    return null;
  }
  if (entity.key) {
    return CREATURE_NEURAL[entity.key] || null;
  }
  return null;
}

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

// ==================== VISUAL TRANSDUCER ACCESSORS ====================
// The visual transducer on a zone is a structured object describing a physical
// eye: { acuity, placement, fieldAngle }. The legacy flat-number format
// (visual: 4) is still accepted so older saves and any unconverted data keep
// working. These accessors are the single source of truth for reading eye data
// — every module that needs visual quality or eye optics goes through them.

/**
 * Read visual acuity from a zone's transducer data.
 * Handles both the new structured format { acuity, placement, fieldAngle }
 * and the legacy flat number format.
 * @param {object} zone — a body-map zone
 * @returns {number} acuity (0 if no visual transducer)
 */
export function getVisualAcuity(zone) {
  const v = zone?.transducers?.visual;
  if (v == null) return 0;
  if (typeof v === 'number') return v;      // legacy: visual: 4
  return v.acuity || 0;                     // new: visual: { acuity: 4, ... }
}

/**
 * Read the full visual transducer config from a zone.
 * Returns { acuity, placement, fieldAngle } or null if no visual transducer.
 * Handles the legacy flat-number format by returning a forward/120° default.
 * @param {object} zone — a body-map zone
 * @returns {{acuity:number, placement:string, fieldAngle:number}|null}
 */
export function getVisualConfig(zone) {
  const v = zone?.transducers?.visual;
  if (v == null || v === 0) return null;
  if (typeof v === 'number') {
    return { acuity: v, placement: 'forward', fieldAngle: 120 }; // legacy default
  }
  return {
    acuity: v.acuity || 0,
    placement: v.placement || 'forward',
    fieldAngle: v.fieldAngle || 120,
  };
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
    const destroyedValue = (rawDestroyed && typeof rawDestroyed === 'object') ? Math.max(rawDestroyed.ground || 0, rawDestroyed.air || 0, rawDestroyed.water || 0, rawDestroyed.contact || 0, rawDestroyed.airborne || 0, rawDestroyed.dissolved || 0) : (rawDestroyed || 0);
    if (destroyedValue === 0) continue;

    const bestRemaining = Math.max(
      0,
      ...bodyMap
        .filter(z => !z.destroyed)
        .map(z => { const v = (z.transducers && z.transducers[sense.key]); return (v && typeof v === 'object') ? Math.max(v.ground || 0, v.air || 0, v.water || 0, v.contact || 0, v.airborne || 0, v.dissolved || 0) : (v || 0); })
    );

    if (bestRemaining === 0) {
      results.push({ sense: sense.key, verb: sense.verb, type: 'lost' });
    } else if (bestRemaining < destroyedValue) {
      results.push({ sense: sense.key, verb: sense.verb, type: 'weakened' });
    }
  }
  return results;
}
