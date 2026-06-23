// ==================== PHYSIOLOGY ====================
// Body physics functions: power-to-weight computation, bleed processing,
// substrate depletion/regeneration, stress chemistry, zone healing.
// Split from enemy-ai.js — these are tissue physics, not AI.

import { getBodyMap, computeBleedPenalty,
         SEEP_COEFF, CLOT_RATE, REGEN_FRACTION, BLOOD_DEATH_THRESHOLD,
         SUBSTRATE_DEPLETION_HIGH, SUBSTRATE_DEPLETION_MOD,
         SUBSTRATE_REGEN_BASE, CIRC_REGEN_EFF_CLOSED, CIRC_REGEN_EFF_OPEN, CIRC_REGEN_EFF_HYBRID,
         VASCULARITY_MIN, REGEN_UPREGULATION,
         FAST_TWITCH_RECRUIT_THRESHOLD,
         CIRC_EFFICIENCY_CLOSED, CIRC_EFFICIENCY_OPEN, CIRC_EFFICIENCY_HYBRID,
         SPECIES_TEMPLATES,
         STRESS_RELEASE_AMOUNT, STRESS_RELEASE_MILD, STRESS_CLEARANCE_BASE, STRESS_MAX,
         HEAL_BASE_RATE, HEAL_REST_MULTIPLIER } from './constants.js';
import { log } from './log.js';

/** Locomotion muscle / total mass — physics-derived power-to-weight ratio.
 *  Used by the speed system so player and NPCs of the same species are at parity.
 *  Only locomotion-tagged zones contribute muscle — head and torso muscle
 *  generates force for biting and twisting, not running. */
/**
 * Compute locomotion power-to-weight ratio from tissue state.
 * Each locomotion zone contributes force based on its fiber composition
 * and current substrate level. Speed is total locomotion force / total mass.
 *
 * If the creature has no fiberRatio data (not yet annotated), falls back
 * to static locomotion muscle / total mass.
 */
function getBodyPTW(entity) {
  const bodyMap = getBodyMap(entity);
  if (!bodyMap) return (entity.strength || 1) / (entity.siz || 1);

  let totalMass = 0;
  let totalLocoForce = 0;
  let hasFiberData = false;

  // Determine circulatory efficiency
  const circEff = _getCirculatoryEfficiency(entity);

  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    totalMass += zone.mass || 0;

    if (zone.locomotion && zone.muscle > 0) {
      if (zone.fiberRatio != null) {
        hasFiberData = true;
        const fastMass = zone.muscle * zone.fiberRatio;
        const slowMass = zone.muscle * (1 - zone.fiberRatio);
        const substrateFraction = (zone.substrateMax > 0)
          ? (zone.substrate || 0) / zone.substrateMax
          : 0;

        // Fast-contracting force scales with available substrate
        const fastForce = fastMass * substrateFraction;
        // Slow-contracting force scales with circulatory efficiency
        const slowForce = slowMass * circEff;

        totalLocoForce += fastForce + slowForce;
      } else {
        // No fiber data — static fallback (locomotion muscle as-is)
        totalLocoForce += zone.muscle;
      }
    }
  }

  if (totalMass <= 0) return 1;

  // If no zones had fiber data, fall back to static ratio
  if (!hasFiberData) return totalLocoForce / totalMass;

  return totalLocoForce / totalMass;
}

/** Get circulatory efficiency for an entity based on its circulationType. */
function _getCirculatoryEfficiency(entity) {
  const circType = entity.circulationType;
  if (circType === 'closed') return CIRC_EFFICIENCY_CLOSED;
  if (circType === 'open') return CIRC_EFFICIENCY_OPEN;
  if (circType === 'hybrid') return CIRC_EFFICIENCY_HYBRID;
  // Default: check species template
  if (entity.species) {
    const template = SPECIES_TEMPLATES[entity.species];
    if (template && template.circulationType) {
      return _getCirculatoryEfficiency({ circulationType: template.circulationType });
    }
  }
  return CIRC_EFFICIENCY_CLOSED; // safe default
}

/** Get circulatory efficiency for substrate regeneration (nutrient delivery at rest).
 *  Separate from _getCirculatoryEfficiency which governs aerobic force output.
 *  Open circulation is less penalized at rest because hemolymph bathing tissue
 *  directly is adequate for slow, steady nutrient uptake. */
function _getCirculatoryRegenEfficiency(entity) {
  const circType = entity.circulationType;
  if (circType === 'closed') return CIRC_REGEN_EFF_CLOSED;
  if (circType === 'open')   return CIRC_REGEN_EFF_OPEN;
  if (circType === 'hybrid') return CIRC_REGEN_EFF_HYBRID;
  if (entity.species) {
    const template = SPECIES_TEMPLATES[entity.species];
    if (template && template.circulationType) {
      return _getCirculatoryRegenEfficiency({ circulationType: template.circulationType });
    }
  }
  return CIRC_REGEN_EFF_CLOSED;
}

/**
 * Deplete substrate from locomotion zones based on movement intensity.
 * High intensity (flee, chase): fast-contracting fibers fully recruited.
 * Moderate intensity (wander, forage, maintain_distance): partial recruitment.
 * No depletion for hold, rest, orient, or if creature didn't move.
 */
function _depleteLocomotionSubstrate(creature) {
  if (!creature.movedThisTurn) return;

  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return;

  // Use ganglion intensity if available, otherwise fall back to behavior label
  let intensityFactor;
  if (creature._lastGanglionIntensity != null) {
    intensityFactor = creature._lastGanglionIntensity;
  } else {
    const behavior = creature.currentBehavior;
    if (behavior === 'flee' || behavior === 'flee_refuge' || behavior === 'hunt') {
      intensityFactor = 1.0;
    } else if (behavior === 'wander' || behavior === 'forage' || behavior === 'maintain_distance') {
      intensityFactor = 0.25;
    } else {
      return;
    }
  }

  // Fast-twitch fibers only recruit above a minimum intensity.
  // Below this threshold, locomotion is fully aerobic — slow-twitch only, zero substrate cost.
  if (intensityFactor < FAST_TWITCH_RECRUIT_THRESHOLD) return;

  const excessIntensity = intensityFactor - FAST_TWITCH_RECRUIT_THRESHOLD;

  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    if (!zone.locomotion) continue;
    if (zone.fiberRatio == null) continue;

    const fastMass = zone.muscle * zone.fiberRatio;
    const cost = fastMass * excessIntensity * SUBSTRATE_DEPLETION_HIGH;
    zone.substrate = Math.max(0, (zone.substrate || 0) - cost);
  }
}

/**
 * Regenerate substrate on all zones that are at low activity.
 * Regen rate is proportional to the zone's slow-contracting mass
 * (which houses the aerobic regeneration machinery) and circulatory efficiency.
 *
 * Locomotion zones that were used at high intensity this turn do NOT regenerate.
 * All other zones with substrate below max regenerate.
 *
 * @param {object} creature
 * @param {number} [ticks=1] — world-time elapsed; scales regen proportionally.
 */
/**
 * Regenerate substrate on all zones that are at low activity.
 * 
 * Regen rate scales with:
 *   - total muscle mass (enzymatic capacity — every cell has glycogen synthase)
 *   - circulatory regen efficiency (nutrient delivery at rest)
 *   - vascularity factor (capillary density, correlated with oxidative fiber content)
 *   - depletion boost (enzymatic upregulation when stores are low — front-loaded curve)
 *
 * Locomotion zones that were used at high intensity this turn do NOT regenerate.
 * All other zones with substrate below max regenerate.
 *
 * @param {object} creature
 * @param {number} [ticks=1] — world-time elapsed; scales regen proportionally.
 */
function _regenerateSubstrate(creature, ticks) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return;

  const circRegenEff = _getCirculatoryRegenEfficiency(creature);
  const timeScale = ticks || 1.0;

  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    if (zone.fiberRatio == null) continue;
    if (zone.substrateMax == null || zone.substrateMax <= 0) continue;
    if (zone.substrate >= zone.substrateMax) continue; // already full

    // Only block locomotion-zone regen when movement intensity was high enough
    // to recruit fast-twitch fibers. Below the threshold the system is fully
    // aerobic — regen proceeds as if the zone were at rest.
    if (zone.locomotion && creature.movedThisTurn) {
      let intensity;
      if (creature._lastGanglionIntensity != null) {
        intensity = creature._lastGanglionIntensity;
      } else {
        const behavior = creature.currentBehavior;
        intensity = (behavior === 'flee' || behavior === 'flee_refuge' || behavior === 'hunt')
          ? 1.0 : 0.25;
      }
      if (intensity >= FAST_TWITCH_RECRUIT_THRESHOLD) continue;
    }

    // Vascularity: oxidative fibers correlate with capillary density.
    // Pure fast-twitch zones have fewer capillaries (reduced nutrient delivery).
    const vascularityFactor = VASCULARITY_MIN + (1.0 - VASCULARITY_MIN) * (1.0 - zone.fiberRatio);

    // Enzymatic upregulation: glycogen synthase is more active when stores are low.
    // Produces a front-loaded recovery curve — rapid initial refill, long tail to full.
    const substrateFraction = (zone.substrate || 0) / zone.substrateMax;
    const depletionBoost = 1.0 + REGEN_UPREGULATION * (1.0 - substrateFraction);

    const regen = zone.muscle * SUBSTRATE_REGEN_BASE * circRegenEff * vascularityFactor * depletionBoost * timeScale;
    zone.substrate = Math.min(zone.substrateMax, (zone.substrate || 0) + regen);
  }
}

// ==================== BLOOD SYSTEM — PER-TURN PROCESSING ====================
// Runs once per turn for each creature (player or monster).
// Handles wound seep, blood regeneration, clotting, and blood death.
// Returns true if the creature died from blood loss.

function processBleed(creature, isPlayer) {
  if (creature.blood == null || creature.bloodMax == null || creature.bloodMax <= 0) return false;
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return false;

  const prevBloodRatio = creature.blood / creature.bloodMax;

  // 1. Seep from wounded zones (below 50% HP, not destroyed)
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    if (zone.hp == null || zone.maxHp == null) continue;
    if (zone.hp < zone.maxHp * 0.5) {
      const damageFraction = 1 - (zone.hp / zone.maxHp);
      const connective = zone.connective || 0;
      const clotting = zone.clotting || 0;
      const seep = connective * SEEP_COEFF * damageFraction * (1 - clotting);
      creature.blood -= seep;
      // Advance clotting (only if no new damage — clotting is reset on hit in combat.js)
      zone.clotting = Math.min((zone.clotting || 0) + CLOT_RATE, 1.0);
    }
  }

  // 2. Regeneration
  creature.blood = Math.min(creature.blood + creature.bloodMax * REGEN_FRACTION, creature.bloodMax);

  // 3. Clamp
  creature.blood = Math.max(creature.blood, 0);

  // 4. Compute bleed penalty
  creature.bleedPenalty = computeBleedPenalty(creature);

  const newBloodRatio = creature.blood / creature.bloodMax;

  // 5. Player threshold-crossing log messages
  if (isPlayer) {
    if (prevBloodRatio >= 0.75 && newBloodRatio < 0.75) {
      log('Blood seeps from your wounds.', 'warn');
    }
    if (prevBloodRatio >= 0.50 && newBloodRatio < 0.50) {
      log('You feel lightheaded. Blood runs freely.', 'warn');
    }
    if (prevBloodRatio >= 0.25 && newBloodRatio < 0.25) {
      log('Your vision darkens at the edges. You\'re losing too much blood.', 'crit');
    }

    // Clotting feedback (player only)
    const woundedZones = bodyMap.filter(z => !z.destroyed && z.hp != null && z.maxHp != null && z.hp < z.maxHp * 0.5);
    if (woundedZones.length > 0) {
      const allNearlyClotted = woundedZones.every(z => (z.clotting || 0) > 0.8);
      const allFullyClotted = woundedZones.every(z => (z.clotting || 0) >= 1.0);
      if (allFullyClotted && newBloodRatio < 1.0 && !creature._bleedClotMsg) {
        log('The bleeding has stopped, but you feel drained.', 'muted');
        creature._bleedClotMsg = true;
      } else if (allNearlyClotted && !allFullyClotted && !creature._bleedClosingMsg) {
        log('Your wounds are closing.', 'muted');
        creature._bleedClosingMsg = true;
      }
      // Reset flags if new wounds open
      if (!allNearlyClotted) {
        creature._bleedClosingMsg = false;
        creature._bleedClotMsg = false;
      }
    }
  }

  // 6. Check death
  if (creature.blood <= creature.bloodMax * BLOOD_DEATH_THRESHOLD) {
    if (isPlayer) {
      log('Everything narrows. Fades. Goes still.', 'dead');
    } else {
      log(`The ${creature.name} collapses. Its wounds finally emptied it.`, 'dead');
    }
    creature.deathCause = 'blood';
    return true; // caller handles death
  }

  return false;
}

// ==================== ZONE HEALING — PER-TURN PROCESSING (Prompt J) ====================
// Wounded zones slowly recover HP each turn, gated by blood availability.
// Resting creatures heal 3× faster. Destroyed zones (0 HP) do not heal.

function getHealingRate(creature) {
  if (creature.blood == null || creature.bloodMax == null || creature.bloodMax <= 0) return 0;
  const bloodFraction = creature.blood / creature.bloodMax;

  // No healing below 50% blood
  if (bloodFraction <= 0.50) return 0;

  // Healing scales linearly from 50% to 100% blood
  const bloodScalar = (bloodFraction - 0.50) / 0.50;  // 0.0 at 50%, 1.0 at 100%
  let rate = HEAL_BASE_RATE * bloodScalar;

  // Resting creatures heal faster
  if (creature.currentBehavior === 'rest') {
    rate *= HEAL_REST_MULTIPLIER;
  }

  return rate;
}

function applyHealing(creature) {
  const rate = getHealingRate(creature);
  if (rate <= 0) return;

  const bodyMap = creature.bodyMap;
  if (!bodyMap) return;

  for (const zone of bodyMap) {
    // Skip destroyed zones — no healing at 0 HP
    if (zone.hp <= 0) continue;

    // Skip fully healed zones
    if (zone.hp >= zone.maxHp) continue;

    // Apply healing
    zone.hp = Math.min(zone.maxHp, zone.hp + rate);
  }
}

// ==================== STRESS CHEMISTRY (Hare Vertical Slice) ====================

/**
 * Update stress chemical level — RELEASE portion only.
 * Called per creature action (inside runCreatureAI).
 * Release: triggered by ganglion threat detection (flagged during processing).
 */
function _releaseStressChemistry(creature) {
  if (creature._ganglionTriggeredStress === true) {
    creature.stressLevel = Math.min(
      STRESS_MAX,
      (creature.stressLevel || 0) + STRESS_RELEASE_AMOUNT
    );
  } else if (creature._ganglionTriggeredStress === 'mild') {
    creature.stressLevel = Math.min(
      STRESS_MAX,
      (creature.stressLevel || 0) + STRESS_RELEASE_MILD
    );
  }
  // Clear the trigger flag
  creature._ganglionTriggeredStress = false;
}

/**
 * Clear stress chemicals — time-scaled, called once per player input.
 * Clearance is gated by circulatory efficiency and scales with world-time elapsed.
 * @param {object} creature
 * @param {number} ticksElapsed — world-time that passed this player input.
 */
function _clearStressChemistry(creature, ticksElapsed) {
  const circEff = _getCirculatoryEfficiency(creature);
  creature.stressLevel = Math.max(
    0,
    (creature.stressLevel || 0) - STRESS_CLEARANCE_BASE * circEff * (ticksElapsed || 1.0)
  );
}


// ==================== EXPORTS ====================
export { getBodyPTW, _getCirculatoryEfficiency, _getCirculatoryRegenEfficiency,
         _depleteLocomotionSubstrate, _regenerateSubstrate,
         processBleed, getHealingRate, applyHealing,
         _releaseStressChemistry, _clearStressChemistry };
