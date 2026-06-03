// ==================== SIGNAL EMISSION SYSTEM (Prompt L-A) ====================
// Computes per-turn chemical, vibration, and visual emission values for every
// creature (including the player).  These values are stored on creature.signals
// and recomputed each turn from current state — nothing is cached across turns.
//
// Detection still uses the flat-range I-B system until L-B replaces it.

import {
  CHEM_MASS_COEFF, CHEM_PREDATOR_MULT, CHEM_ACTIVITY_MULT, CHEM_WOUND_COEFF,
  VIB_GROUND_COEFF, VIB_AIR_BASELINE_COEFF, VIB_AIR_ACTIVITY_COEFF, VIB_AIR_COMBAT_BONUS,
  VIB_WATER_COEFF, VIB_WATER_IDLE_COEFF, CONTACT_AREA_COEFF, DEFAULT_CONTACT_FRACTION,
  VIS_SIZE_COEFF, VIS_MOVEMENT_MULT,
  getBodyMap,
} from './constants.js';

// ==================== CHEMICAL EMISSION ====================

function computeChemicalEmission(creature) {
  const mass = creature.totalMass || 0;
  if (mass <= 0) return 0;

  // Base emission from metabolism — larger bodies emit more
  let emission = mass * CHEM_MASS_COEFF;

  // Diet modifier — predators emit more (protein metabolism byproducts)
  if (creature.diet === 'predator') {
    emission *= CHEM_PREDATOR_MULT;
  }

  // Activity modifier — moving increases respiration and volatile output
  if (creature.movedThisTurn) {
    emission *= CHEM_ACTIVITY_MULT;
  }

  // Wound modifier — bleeding broadcasts chemical signal
  if (creature.blood != null && creature.bloodMax != null && creature.bloodMax > 0) {
    const bloodFraction = creature.blood / creature.bloodMax;
    if (bloodFraction < 0.75) {
      const woundSeverity = 1.0 - bloodFraction;
      emission += mass * woundSeverity * CHEM_WOUND_COEFF;
    }
  }

  return emission;
}

// ==================== VIBRATION EMISSION ====================

/**
 * Sum the mass of locomotion-tagged zones to estimate foot contact area.
 * Heavier, broader locomotion zones = larger ground contact = quieter per-mass.
 */
function getFootContactArea(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) {
    // Fallback: proportional contact area from total mass
    return Math.max(0.5, (creature.totalMass || 1) * DEFAULT_CONTACT_FRACTION);
  }

  let locoMass = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    if (zone.locomotion) {
      locoMass += zone.mass || 0;
    }
  }

  if (locoMass > 0) {
    return Math.max(0.5, locoMass * CONTACT_AREA_COEFF);
  }

  // No locomotion zones found — use total mass fallback
  return Math.max(0.5, (creature.totalMass || 1) * DEFAULT_CONTACT_FRACTION);
}

function computeVibrationEmission(creature) {
  const mass = creature.totalMass || 0;
  if (mass <= 0) return { ground: 0, air: 0, water: 0 };

  // --- Ground ---
  let ground = 0;
  if (creature.movedThisTurn && !creature.inWater) {
    const contactArea = getFootContactArea(creature);
    ground = (mass / contactArea) * VIB_GROUND_COEFF;
  }

  // --- Air ---
  let air = mass * VIB_AIR_BASELINE_COEFF;
  if (creature.movedThisTurn) {
    air += mass * VIB_AIR_ACTIVITY_COEFF;
  }
  if (creature.inCombatThisTurn) {
    air += VIB_AIR_COMBAT_BONUS;
  }

  // --- Water ---
  let water = 0;
  if (creature.inWater) {
    if (creature.movedThisTurn) {
      water = mass * VIB_WATER_COEFF;
    } else {
      water = mass * VIB_WATER_IDLE_COEFF;
    }
  }

  return { ground, air, water };
}

// ==================== VISUAL DETECTABILITY ====================

function computeVisualDetectability(creature) {
  const mass = creature.totalMass || 0;
  if (mass <= 0) return 0;

  // Size component — cube root of mass as proxy for visual cross-section
  let detectability = Math.pow(mass, 0.33) * VIS_SIZE_COEFF;

  // Movement component — moving things are dramatically easier to detect
  if (creature.movedThisTurn) {
    detectability *= VIS_MOVEMENT_MULT;
  }

  return detectability;
}

// ==================== MASTER SIGNAL COMPUTATION ====================

/**
 * Compute all signal emission values for a creature and store them on
 * creature.signals.  Call once per creature per turn, AFTER movement
 * and combat, BEFORE detection.
 */
export function computeSignals(creature) {
  // Ensure the signals object exists
  if (!creature.signals) {
    creature.signals = {
      chemical: 0,
      vibration: { ground: 0, air: 0, water: 0 },
      visual: 0,
    };
  }

  creature.signals.chemical = computeChemicalEmission(creature);

  const vib = computeVibrationEmission(creature);
  creature.signals.vibration.ground = vib.ground;
  creature.signals.vibration.air = vib.air;
  creature.signals.vibration.water = vib.water;

  creature.signals.visual = computeVisualDetectability(creature);
}
