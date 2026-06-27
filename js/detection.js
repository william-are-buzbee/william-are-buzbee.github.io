// ==================== DETECTION — Sensing and Information Quality ====================
// Everything about what a creature knows and how it learns it.
// The sensory pipeline: per-zone detection, visual, SNR, uncertainty.
// Split from enemy-ai.js — zero behavior change.

import { state, worlds, groundItems } from './state.js';
import { getBodyMap,
         CHEM_RANGE_COEFF, VIB_GROUND_RANGE_COEFF, VIB_AIR_RANGE_COEFF, VIS_RANGE_COEFF,
         MAX_DETECTION_DISTANCE,
         SAFETY_PROXIMITY_COEFF, SAFETY_DAMAGE_COEFF,
         HUNGER_THRESHOLD,
         CHEM_MASS_COEFF,
         SIZE_UNCERTAINTY_BASE,
         DIET_CONF_MIN, DIET_CONF_FULL, SPECIES_CONF_MIN, SPECIES_CONF_FULL,
         CONDITION_CONF_MIN, CONDITION_CONF_FULL, DIET_DECISION_THRESHOLD,
         ASSESS_INTEGRATION_THRESHOLD,
         SPECIES_DISPLAY_CONFIDENCE,
         computeBleedPenalty, computeStrikeDamage, getPathways,
         getAvailableAttacks, checkNeuralDeath, hasLocomotion,
         BURST_COEFF, BLOOD_DEATH_THRESHOLD, ARMOR_PER_STRUCTURAL_KG,
         selectHitZone,
         MOTION_CONCEALMENT_REDUCTION, BODY_PLAN_HEIGHT_COEFF,
         // Visual Detection Pass 1 — motion and contrast
         MOTION_SIGNAL_STILL,
         CONTRAST_FLOOR, BRIGHTNESS_CONTRAST_WEIGHT, HUE_MISMATCH_PENALTY,
         BLEED_CONTRAST_BONUS, BLEED_VISUAL_SATURATION,
         getIntegument,
       } from './constants.js';
import { currentTimePhase } from './time-cycle.js';
import { hasLOS } from './fov.js';
import { chebyshev, getCover } from './world-state.js';
import { stealthDetectChance, rollHit } from './combat.js';
import { roll100 } from './rng.js';
import { creatureViewRadius } from './player.js';
import { tileConcealmentData, getTerrainVisual } from './terrain.js';
import { dist, directionToward, getCreatureMass, getPlayerDiet, WATER_TILES, isWaterTile,
         getNearbyCreatures } from './ai-utils.js';

// ==================== LIGHT LEVEL ====================
// Maps the day/night cycle phase to a 0.0–1.0 light multiplier.
function getLightLevel() {
  const { phase, progress } = currentTimePhase();
  switch (phase) {
    case 'day':   return 1.0;
    case 'dusk':  return 1.0 + (0.1 - 1.0) * progress;   // 1.0 → 0.1
    case 'night': return 0.1;
    case 'dawn':  return 0.1 + (1.0 - 0.1) * progress;   // 0.1 → 1.0
    default:      return 1.0;
  }
}

// ==================== PER-ZONE DETECTION (Prompt P) ====================
// Each zone-channel pair independently computes detection range and SNR.
// No creature-level aggregation. A creature detects when ANY one zone detects.

// Coefficient map: channel name → range coefficient
const _CHANNEL_COEFF = {
  chemicalAirborne: CHEM_RANGE_COEFF,
  vibrationGround:  VIB_GROUND_RANGE_COEFF,
  vibrationAir:     VIB_AIR_RANGE_COEFF,
};

// Emission map: extract target emission for a given channel
function _getTargetEmission(target, channel) {
  if (!target.signals) return 0;
  switch (channel) {
    case 'chemicalAirborne': return target.signals.chemical || 0;
    case 'vibrationGround':  return (target.signals.vibration && target.signals.vibration.ground) || 0;
    case 'vibrationAir':     return (target.signals.vibration && target.signals.vibration.air) || 0;
    default: return 0;
  }
}

/**
 * Iterate transducers on a zone, yielding [channel, quality] pairs.
 * Only distance-detection channels: chemical.airborne, vibration.ground, vibration.air.
 * Skips contact/dissolved/water (touch-range or aquatic).
 * Skips visual (handled by FOV system).
 */
function* _iterZoneTransducers(zone) {
  if (!zone.transducers) return;
  // Chemical airborne
  const chem = zone.transducers.chemical;
  if (chem) {
    const airborne = (typeof chem === 'object') ? (chem.airborne || 0) : 0;
    if (airborne > 0) yield ['chemicalAirborne', airborne];
  }
  // Vibration ground
  const vib = zone.transducers.vibration;
  if (vib) {
    if ((vib.ground || 0) > 0) yield ['vibrationGround', vib.ground];
    if ((vib.air || 0) > 0) yield ['vibrationAir', vib.air];
  }
}

/**
 * Per-zone detection: check whether observer detects target through non-visual channels.
 * Returns array of { zone, channel, quality, snr } or null if not detected.
 *
 * Performance: skips zero-quality channels immediately. Precomputes quality×coeff per
 * observer zone-channel pair (constant for the turn), skips targets with zero emission.
 */
function detectTargetPerZone(observer, target) {
  const bodyMap = getBodyMap(observer);
  if (!bodyMap) return null;
  if (!target.signals) return null;

  const d = dist(observer.x, observer.y, target.x, target.y);
  if (d > MAX_DETECTION_DISTANCE) return null;

  const detections = [];

  for (const zone of bodyMap) {
    if (zone.destroyed) continue;

    for (const [channel, quality] of _iterZoneTransducers(zone)) {
      const emission = _getTargetEmission(target, channel);
      if (emission <= 0) continue;

      const coeff = _CHANNEL_COEFF[channel];
      const zoneRange = Math.cbrt(emission) * quality * coeff;
      if (d <= zoneRange) {
        const snr = d > 0 ? zoneRange / d : zoneRange * 10; // adjacent = very high SNR
        detections.push({ zone, channel, quality, snr });
      }
    }
  }

  return detections.length > 0 ? detections : null;
}

// ==================== SENSE HELPERS ====================

/**
 * Helper: get the best chemical airborne quality from surviving zones.
 * Used by detectCorpses and movementCompromisesSense.
 */
function getBestChemicalAirborne(entity) {
  const bodyMap = getBodyMap(entity);
  if (!bodyMap) return 0;
  let best = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const chem = zone.transducers && zone.transducers.chemical;
    const val = (chem && typeof chem === 'object') ? (chem.airborne || 0) : 0;
    if (val > best) best = val;
  }
  return best;
}

/**
 * Helper: get effective visual quality (max across surviving zones).
 * Used by visual detection in canDetect (visual remains max-based).
 */
function getEffectiveVisual(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return 0;
  let best = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const val = (zone.transducers && zone.transducers.visual) || 0;
    if (val > best) best = val;
  }
  return best;
}

/**
 * Compute dominant sense channel for a creature (for movementCompromisesSense).
 * Returns { type, value } for the highest-quality non-visual sense.
 */
function getDominantSenseChannel(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return { type: 'none', value: 0 };

  let bestChem = 0, bestVibG = 0, bestVibA = 0, bestVis = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    // Chemical airborne
    const chem = zone.transducers && zone.transducers.chemical;
    const chemVal = (chem && typeof chem === 'object') ? (chem.airborne || 0) : 0;
    if (chemVal > bestChem) bestChem = chemVal;
    // Vibration
    const vib = zone.transducers && zone.transducers.vibration;
    if (vib) {
      if ((vib.ground || 0) > bestVibG) bestVibG = vib.ground;
      if ((vib.air || 0) > bestVibA) bestVibA = vib.air;
    }
    // Visual
    const visVal = (zone.transducers && zone.transducers.visual) || 0;
    if (visVal > bestVis) bestVis = visVal;
  }

  const channels = [
    { type: 'groundVibration', value: bestVibG },
    { type: 'chemicalAirborne', value: bestChem },
    { type: 'visual', value: bestVis },
    { type: 'airVibration', value: bestVibA },
  ];
  let dominant = channels[0];
  for (const ch of channels) {
    if (ch.value > dominant.value) dominant = ch;
  }
  return dominant;
}

// ==================== VISUAL DETECTION ====================

// ── Motion & Contrast Helpers (Visual Detection Pass 1) ──
// Motion state: temporal change detection (fast, involuntary) vs
// spatial pattern recognition (slow, effortful).
// The existing VIS_MOVEMENT_MULT in signals.js boosts moving creature
// signal. MOTION_SIGNAL_STILL applies the reduction for stationary
// creatures — the dominant factor in most detection scenarios.

/**
 * Is the target currently moving? Checks movedThisTurn (NPC AI flag)
 * or prevX/prevY comparison (fallback, used by concealment system).
 */
function _isTargetMoving(target) {
  // AI-tracked flag (set in runCreatureAI for NPCs)
  if (target.movedThisTurn != null) return target.movedThisTurn;
  // Fallback: previous-position comparison (works for player and NPCs)
  if (target.prevX != null && target.prevY != null) {
    return target.prevX !== target.x || target.prevY !== target.y;
  }
  // No motion data available — assume stationary (conservative)
  return false;
}

/**
 * Compute background contrast factor for a target on its current tile.
 * Measures the difference between the creature's integument reflectance
 * and the terrain's visual properties. High contrast = easier to detect.
 * Returns a multiplier: ~0.1 (perfect match) to ~1.0+ (maximum contrast).
 *
 * Bleed bonus: exposed cyan blood on dark red flora is maximum contrast.
 * Any wound makes you a target.
 */
function _computeContrastFactor(target) {
  const integument = getIntegument(target);
  if (!integument) return 1.0;  // no integument data → fully visible (legacy creatures)

  const layer = target.layer != null ? target.layer : state.player.layer;
  if (!worlds[layer]) return 1.0;

  const ground = worlds[layer][target.y]?.[target.x];
  if (ground == null) return 1.0;
  const cover = getCover(layer, target.x, target.y);
  const terrainVis = getTerrainVisual(ground, cover);

  // Brightness difference: luminance dominates edge detection
  const brightnessDiff = Math.abs(integument.brightness - terrainVis.brightness);
  // Hue mismatch: categorical — a brown creature on gray rock stands out
  const hueMatch = (integument.hue === terrainVis.hue) ? 0.0 : HUE_MISMATCH_PENALTY;

  let contrast = CONTRAST_FLOOR + brightnessDiff * BRIGHTNESS_CONTRAST_WEIGHT + hueMatch;

  // Bleed bonus: cyan blood against dark red flora is the most visible
  // signal on the planet. More bleeding = more visible, up to saturation.
  if (target.blood != null && target.bloodMax != null && target.bloodMax > 0
      && target.blood < target.bloodMax) {
    const bleedFraction = 1.0 - (target.blood / target.bloodMax);
    contrast += BLEED_CONTRAST_BONUS * Math.min(1.0, bleedFraction / BLEED_VISUAL_SATURATION);
  }

  return contrast;
}

function getVisualRange(detector, target) {
  let detectability = target.signals ? target.signals.visual : 0;
  const sensitivity = getEffectiveVisual(detector);
  const light = getLightLevel();
  if (detectability <= 0 || sensitivity <= 0 || light <= 0) return 0;

  // ── Motion factor (Visual Detection Pass 1) ──
  // Moving creatures already have VIS_MOVEMENT_MULT applied in signals.js.
  // Still creatures get a dramatic reduction — they require spatial pattern
  // recognition rather than temporal change detection.
  const isMoving = _isTargetMoving(target);
  if (!isMoving) {
    detectability *= MOTION_SIGNAL_STILL;
  }

  // ── Background contrast factor (Visual Detection Pass 1) ──
  // How different the creature's integument looks from the terrain.
  // Near-perfect match → ~0.1× (nearly invisible).
  // Maximum mismatch → ~1.0+× (fully visible).
  const contrastFactor = _computeContrastFactor(target);
  detectability *= contrastFactor;

  return Math.cbrt(detectability * light) * sensitivity * VIS_RANGE_COEFF;
}

function facingToAngle(facing) {
  if (!facing) return 0;
  return Math.atan2(facing.dy, facing.dx) * (180 / Math.PI);
}

function isInVisionCone(detector, target) {
  const coneWidth = detector.visionConeWidth || 120;
  // 360° or wider = omnidirectional, always in cone
  if (coneWidth >= 360) return true;
  // No facing data = omnidirectional
  if (!detector.facing) return true;

  const halfCone = coneWidth / 2;

  const dx = target.x - detector.x;
  const dy = target.y - detector.y;
  const angleToTarget = Math.atan2(dy, dx) * (180 / Math.PI);

  const facingAngleDeg = facingToAngle(detector.facing);

  let diff = Math.abs(angleToTarget - facingAngleDeg);
  if (diff > 180) diff = 360 - diff;

  return diff <= halfCone;
}

/**
 * True if the creature is actively fleeing and tracking this specific target
 * as its threat source. Represents head/eye rotation to maintain visual
 * contact with the threat during flight. Only applies to the tracked threat —
 * other entities still use the normal cone check.
 */
function _isActivelyTracking(detector, target) {
    if (!detector.threatSource) return false;
    const behavior = detector.currentBehavior;
    if (behavior !== 'flee' && behavior !== 'flee_refuge') return false;
    return detector.threatSource === target;
}

// ==================== LOCAL CONCEALMENT ====================
// Cover on the target's tile partially hides creatures standing on it.
// This reduces the visual signal before SNR computation. Does NOT affect
// terrain visibility (you see the tile, but the creature is harder to spot).
// Only applies to the VISUAL channel — chemical/vibration are unaffected.

/**
 * Compute effective concealment for a creature on its current tile.
 * Size-dependent: cover hides more of a small creature than a large one.
 * Motion-dependent: moving through cover disturbs it, reducing concealment.
 *
 * @param {object} target — the creature being observed
 * @returns {number} concealment factor 0–1 (0 = no concealment, 1 = fully hidden)
 */
function computeEffectiveConcealment(target) {
  const layer = target.layer != null ? target.layer : state.player.layer;
  if (!worlds[layer]) return 0;

  const ground = worlds[layer][target.y]?.[target.x];
  const cover = getCover(layer, target.x, target.y);
  const coverData = tileConcealmentData(ground, cover);
  if (!coverData || coverData.concealment <= 0) return 0;

  // Size-dependent: how much of the creature does the cover actually hide?
  const mass = getCreatureMass(target);
  const creatureHeight = Math.pow(mass, 1/3) * BODY_PLAN_HEIGHT_COEFF;
  const coverRatio = creatureHeight > 0
    ? Math.min(1.0, coverData.heightClass / creatureHeight)
    : 1.0;
  let concealment = coverData.concealment * coverRatio;

  // Motion reduces concealment: grass rustling, branches moving, etc.
  // Check if the creature moved this turn by comparing current vs previous position.
  const isMoving = (target.prevX != null && target.prevY != null &&
                    (target.prevX !== target.x || target.prevY !== target.y));
  if (isMoving) {
    concealment *= MOTION_CONCEALMENT_REDUCTION;
  }

  return concealment;
}

// --- Line of Sight ---
// Uses hasLOS from fov.js. Forests do NOT block NPC LOS in this pass
// (no per parameter → tree transparency is skipped, only walls block).

function hasLineOfSight(detector, target) {
  const layer = detector.layer != null ? detector.layer : state.player.layer;
  return hasLOS(layer, detector.x, detector.y, target.x, target.y);
}

// ==================== MASTER DETECTION (Prompt P) ====================
// Uses per-zone detection for non-visual channels, max-based for visual.
// Returns { detected, detections, senses, distance, bestSNR }

function canDetect(detector, target) {

  const d = dist(detector.x, detector.y, target.x, target.y);

  // Early exit — nothing detects beyond absolute ceiling
  if (d > MAX_DETECTION_DISTANCE) return { detected: false, detections: null, senses: [], distance: d, bestSNR: 0 };

  const senses = [];
  let bestSNR = 0;

  // Non-visual: per-zone detection
  const perZoneDetections = detectTargetPerZone(detector, target);
  if (perZoneDetections) {
    // Collect which channel types were detected
    const channelsSeen = new Set();
    for (const det of perZoneDetections) {
      channelsSeen.add(det.channel);
      if (det.snr > bestSNR) bestSNR = det.snr;
    }
    if (channelsSeen.has('chemicalAirborne')) senses.push('chemical');
    if (channelsSeen.has('vibrationGround')) senses.push('vibration_ground');
    if (channelsSeen.has('vibrationAir')) senses.push('vibration_air');
  }

  // Visual — cone + line of sight + light + local concealment
  const visRange = getVisualRange(detector, target);
  if (visRange > 0 && d <= visRange && hasLineOfSight(detector, target)) {
    const inCone = isInVisionCone(detector, target);
    const isTrackedThreat = _isActivelyTracking(detector, target);
    if (inCone || isTrackedThreat) {
        // Local concealment: cover on the target's tile reduces visual signal.
        // Signal reduction scales the effective range (cube-root relationship).
        // Only affects the visual channel — chemical/vibration are unaffected.
        const concealment = computeEffectiveConcealment(target);
        const effectiveVisRange = concealment > 0
          ? visRange * Math.cbrt(1.0 - concealment)
          : visRange;

        if (d <= effectiveVisRange) {
          senses.push('visual');
          const visSNR = d > 0 ? effectiveVisRange / d : effectiveVisRange * 10;
          if (visSNR > bestSNR) bestSNR = visSNR;
        }
    }
  }

  return {
    detected: senses.length > 0,
    detections: perZoneDetections,  // per-zone array (non-visual only) or null
    senses:   senses,
    distance: d,
    bestSNR:  bestSNR,
  };
}

// --- Legacy helper for external callers / debug ---
// Returns the max detection range across all senses for a hypothetical average target.
function getDetectionRange(creature) {
  // Compute max quality per non-visual channel from zones
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return 0;
  let bestChem = 0, bestVibG = 0, bestVibA = 0, bestVis = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const chem = zone.transducers && zone.transducers.chemical;
    const chemVal = (chem && typeof chem === 'object') ? (chem.airborne || 0) : 0;
    if (chemVal > bestChem) bestChem = chemVal;
    const vib = zone.transducers && zone.transducers.vibration;
    if (vib) {
      if ((vib.ground || 0) > bestVibG) bestVibG = vib.ground;
      if ((vib.air || 0) > bestVibA) bestVibA = vib.air;
    }
    const visVal = (zone.transducers && zone.transducers.visual) || 0;
    if (visVal > bestVis) bestVis = visVal;
  }
  // Rough estimate using typical emission values — for debug display only
  const chemR  = bestChem > 0 ? Math.cbrt(2.0) * bestChem * CHEM_RANGE_COEFF : 0;
  const vibGR  = bestVibG > 0 ? Math.cbrt(1.0) * bestVibG * VIB_GROUND_RANGE_COEFF : 0;
  const vibAR  = bestVibA > 0 ? Math.cbrt(0.5) * bestVibA * VIB_AIR_RANGE_COEFF : 0;
  const visR   = bestVis > 0 ? Math.cbrt(3.0) * bestVis * VIS_RANGE_COEFF : 0;
  return Math.max(chemR, vibGR, vibAR, visR);
}

// ==================== LEGACY VISION ====================

function monsterViewRadius(mon){
  if (mon.mods && mon.mods.blindsight != null) return 0;
  const nightVision = !!(mon.mods && mon.mods.nightVision);
  return creatureViewRadius(mon.vis, state.player.layer, { nightVision });
}

function canSeePlayerTile(mon){
  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);
  if (mon.mods && mon.mods.blindsight != null){
    return d <= mon.mods.blindsight;
  }
  const vr = monsterViewRadius(mon);
  if (d > vr) return false;
  return hasLOS(state.player.layer, mon.x, mon.y, state.player.x, state.player.y, mon.vis);
}

function canSeePlayer(mon){
  const player = state.player;
  if (!player || player.hp <= 0) return false;

  const d = chebyshev(mon.x, mon.y, player.x, player.y);

  // Blindsight creatures use vibration, not vision — unaffected by motion/contrast
  if (mon.mods && mon.mods.blindsight != null){
    return d <= mon.mods.blindsight;
  }

  // Line of sight required
  if (!hasLOS(player.layer, mon.x, mon.y, player.x, player.y, mon.vis)){
    return false;
  }

  // Base view radius
  const vr = monsterViewRadius(mon);
  if (d > vr) return false;

  // ── Motion × contrast × concealment (Visual Detection Pass 1) ──
  // Player's visual signal to NPCs is modified by motion state,
  // integument-vs-terrain contrast, and local cover concealment.
  // The effective view radius scales as cbrt of the combined modifier
  // (same relationship as signal → range in getVisualRange).
  const isMoving = _isTargetMoving(player);
  const motionFactor = isMoving ? 1.0 : MOTION_SIGNAL_STILL;
  const contrastFactor = _computeContrastFactor(player);
  const concealment = computeEffectiveConcealment(player);
  const concealmentFactor = Math.max(0, 1.0 - concealment);

  const combinedFactor = motionFactor * contrastFactor * concealmentFactor;
  const effectiveVR = vr * Math.cbrt(combinedFactor);

  if (d > effectiveVR) return false;

  // Legacy stealth check (retained for backward compatibility)
  if (player.stealth){
    if (d > 1){
      const chance = stealthDetectChance(mon);
      return roll100() <= chance;
    }
  }
  return true;
}

// ==================== SNR AND UNCERTAINTY (Prompt P) ====================

/** Estimate target mass from signal — uses chemical emission as primary mass proxy.
 *  Observer uses its own body as a measuring stick. */
function estimateMassFromSignal(target, observer) {
  const observerMass = getCreatureMass(observer);
  // Use chemical emission as primary proxy (always nonzero for living creatures)
  const targetChemEmission = target.signals ? target.signals.chemical : 0;
  // Compute what the observer's own chemical emission would be (at rest, base)
  const selfChemEmission = observerMass * CHEM_MASS_COEFF;
  if (selfChemEmission > 0 && targetChemEmission > 0) {
    return observerMass * (targetChemEmission / selfChemEmission);
  }
  // Fallback: use vibration ground emission if available
  const targetVibG = target.signals ? target.signals.vibration.ground : 0;
  if (targetVibG > 0) {
    // Vibration scales with mass/contactArea — rough mass proxy
    return observerMass * (targetVibG / Math.max(0.01, observerMass * 0.02));
  }
  // No usable signal — return observer mass as default
  return observerMass;
}

/** Compute relativeMagnitude from size uncertainty bounds.
 *  Returns a category string for the reactive layer. */
function relativeMagnitude(observer, info) {
  if (!info.sizeEstimate) return 'unknown';

  const selfMass = getCreatureMass(observer);
  const upper = info.sizeEstimate.upper;
  const lower = info.sizeEstimate.lower;

  // Worst-case interpretation for reactive layer
  if (lower > selfMass * 2.0) return 'much_larger';
  if (lower > selfMass * 1.3) return 'larger';
  if (upper < selfMass * 0.3) return 'much_smaller';
  if (upper < selfMass * 0.7) return 'smaller';

  // Range spans "similar" — could be larger or smaller
  return 'ambiguous';
}

/** Check if any locomotion zone is destroyed on the target. */
function _hasDestroyedLocomotionZone(target) {
  const bodyMap = getBodyMap(target);
  if (!bodyMap) return false;
  return bodyMap.some(z => z.locomotion && z.destroyed);
}

/** Build continuous-uncertainty detection info from per-zone detections.
 *  Produces narrowing size ranges and confidence curves instead of binary flags. */
function buildDetectionInfo(observer, target, detections) {
  const info = {
    detected: true,
    distance: dist(observer.x, observer.y, target.x, target.y),
    direction: directionToward(observer.x, observer.y, target.x, target.y),
    bestSNR: 0,

    // Size: narrowing range
    sizeEstimate: null,  // { lower, upper, estimated }
    sizeRelative: null,  // category for reactive rules compatibility

    // Movement: from vibration detections
    isMoving: null,

    // Diet: confidence curve from chemical airborne
    dietConfidence: 0,
    dietType: null,

    // Species: confidence curve from best channel
    speciesConfidence: 0,
    species: null,

    // Condition: confidence curve from high-SNR channels
    conditionConfidence: 0,
    woundChemistry: false,
    visibleWounds: false,
    gaitAnomaly: false,

    // Fight assessment
    threatAssessment: null,
  };

  let bestSNR = 0;
  let bestChemSNR = 0;
  let bestVibSNR = 0;
  let bestVisSNR = 0;

  for (const det of detections) {
    if (det.snr > bestSNR) bestSNR = det.snr;

    if (det.channel === 'chemicalAirborne' && det.snr > bestChemSNR) {
      bestChemSNR = det.snr;
    }
    if ((det.channel === 'vibrationGround' || det.channel === 'vibrationAir')
        && det.snr > bestVibSNR) {
      bestVibSNR = det.snr;
    }
    if (det.channel === 'visual' && det.snr > bestVisSNR) {
      bestVisSNR = det.snr;
    }

    // Movement is inherent in vibration detection — if vibration detected, target was moving
    if (det.channel === 'vibrationGround' || det.channel === 'vibrationAir') {
      info.isMoving = true;
    }
  }

  info.bestSNR = bestSNR;

  // Per-channel best SNR — used by ganglion template matching
  info.vibrationSNR = bestVibSNR;
  info.visualSNR    = bestVisSNR;
  info.chemicalSNR  = bestChemSNR;

  // Size estimate: uncertainty narrows with best SNR from any channel
  if (bestSNR > 0) {
    const uncertaintyFactor = SIZE_UNCERTAINTY_BASE / bestSNR;
    const rawEstimate = estimateMassFromSignal(target, observer);
    info.sizeEstimate = {
      estimated: rawEstimate,
      lower: rawEstimate / (1 + uncertaintyFactor),
      upper: rawEstimate * (1 + uncertaintyFactor),
    };
    // Compute category for reactive layer compatibility
    info.sizeRelative = relativeMagnitude(observer, info);
  }

  // Diet: chemical airborne only
  if (bestChemSNR > DIET_CONF_MIN) {
    info.dietConfidence = Math.min(1.0,
      (bestChemSNR - DIET_CONF_MIN) / (DIET_CONF_FULL - DIET_CONF_MIN));
    info.dietType = target.diet || null;
  }

  // Species: best SNR on any channel
  if (bestSNR > SPECIES_CONF_MIN) {
    info.speciesConfidence = Math.min(1.0,
      (bestSNR - SPECIES_CONF_MIN) / (SPECIES_CONF_FULL - SPECIES_CONF_MIN));
    info.species = target.key || target.species || null;
  }

  // Condition: requires high SNR
  if (bestChemSNR > CONDITION_CONF_MIN) {
    info.conditionConfidence = Math.min(1.0,
      (bestChemSNR - CONDITION_CONF_MIN) / (CONDITION_CONF_FULL - CONDITION_CONF_MIN));
    info.woundChemistry = target.blood != null && target.bloodMax != null &&
                          target.blood < target.bloodMax * 0.7;
  }
  if (bestVibSNR > CONDITION_CONF_MIN) {
    const vibCondConf = Math.min(1.0,
      (bestVibSNR - CONDITION_CONF_MIN) / (CONDITION_CONF_FULL - CONDITION_CONF_MIN));
    if (vibCondConf > info.conditionConfidence) {
      info.conditionConfidence = vibCondConf;
    }
    info.gaitAnomaly = _hasDestroyedLocomotionZone(target);
  }
  // Visual wounds (still uses visual detection if present — check via FOV/visual sense)
  if (bestSNR > CONDITION_CONF_MIN) {
    const targetBodyMap = getBodyMap(target);
    if (targetBodyMap) {
      info.visibleWounds = targetBodyMap.some(z => z.destroyed);
    }
  }

  // Fight assessment requires integration capacity above threshold AND useful info
  if (observer.integrationCapacity >= ASSESS_INTEGRATION_THRESHOLD) {
    if (info.sizeEstimate && info.dietConfidence > 0.5) {
      info.threatAssessment = assessFightOutcome(observer, target, info);
    }
  }

  return info;
}

/** Fight assessment — uses size uncertainty range for conservative evaluation. */
function assessFightOutcome(observer, target, info) {
  const cc = combatCapability(observer);
  const observerMass = getCreatureMass(observer);
  const selfPower = observerMass * cc.maxDamage *
                    ((observer.blood != null && observer.bloodMax > 0) ?
                     (observer.blood / observer.bloodMax) : 1.0);

  // Use worst-case (upper bound) for assessing target danger
  const estimatedTargetMass = info.sizeEstimate ? info.sizeEstimate.upper : observerMass;

  let targetConditionModifier = 1.0;
  if (info.woundChemistry) targetConditionModifier *= 0.7;
  if (info.visibleWounds) targetConditionModifier *= 0.7;
  if (info.gaitAnomaly) targetConditionModifier *= 0.8;

  const estimatedTargetPower = estimatedTargetMass * targetConditionModifier;
  if (estimatedTargetPower <= 0) return 'weaker';
  const ratio = selfPower / estimatedTargetPower;

  if (ratio > 2.0) return 'weaker';       // target is weaker
  if (ratio > 1.2) return 'comparable';
  if (ratio > 0.5) return 'stronger';
  return 'overwhelming';                   // target is overwhelming
}

// combatCapability is needed by assessFightOutcome — imported inline to avoid
// circular dep with cognition.js. This is a local copy of the same logic.
function combatCapability(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return { canFight: false, maxDamage: 0, attackCount: 0 };
  const attacks = getAvailableAttacks(bodyMap);
  let maxDamage = 0;
  for (const atk of attacks) {
    const zone = bodyMap.find(z => z.key === atk.sourceZone);
    if (zone) {
      const dmg = computeStrikeDamage(creature, zone);
      if (dmg > maxDamage) maxDamage = dmg;
    }
  }
  return { canFight: attacks.length > 0, maxDamage, attackCount: attacks.length };
}

// ==================== DETECTION AGGREGATORS ====================

/** Build continuous-uncertainty detection info for all detected entities each turn. */
function buildAllDetectionInfo(creature) {
  creature.detectionInfo = [];
  const player = state.player;

  // Prompt R: spatial grid narrows candidate list
  const nearby = getNearbyCreatures(creature.x, creature.y);

  // Build info for all entities in detection range
  const allTargets = [];
  if (player && player.hp > 0) allTargets.push(player);
  for (const m of nearby) {
    if (m === creature || m.hp <= 0) continue;
    allTargets.push(m);
  }

  for (const target of allTargets) {
    const result = canDetect(creature, target);
    if (!result.detected) continue;

    // Gather per-zone detections (non-visual). If visual detected, ensure a visual
    // entry exists so buildDetectionInfo can compute per-channel SNR for all channels.
    let detections = result.detections || [];
    if (result.senses.includes('visual')) {
      // Compute visual SNR the same way canDetect does
      const d = dist(creature.x, creature.y, target.x, target.y);
      const visRange = getVisualRange(creature, target);
      const visSNR = d > 0 ? visRange / d : visRange * 10;
      detections = detections.concat([{
        zone: null, channel: 'visual',
        quality: getEffectiveVisual(creature), snr: visSNR
      }]);
    }

    const info = buildDetectionInfo(creature, target, detections);
    info.entity = target;
    info.senses = result.senses;
    creature.detectionInfo.push(info);
  }
}

/** Assess how threatening a target is to the creature. Returns 0 if not threatening. */
function assessThreatLevel(creature, target, detInfo) {
  const creatureMass = creature.totalMass || 1;

  // Use detection-derived size if available, otherwise direct read
  let targetMass = creatureMass;
  if (detInfo && detInfo.sizeEstimate) {
    targetMass = detInfo.sizeEstimate.upper; // worst-case for threat assessment
  } else {
    const targetBodyMap = getBodyMap(target);
    if (targetBodyMap) {
      targetMass = 0;
      for (const zone of targetBodyMap) {
        if (!zone.destroyed) targetMass += zone.mass || 0;
      }
    } else if (target.totalMass) {
      targetMass = target.totalMass;
    }
  }
  const massRatio = targetMass / creatureMass;

  // Use detection-derived diet if available, otherwise direct read
  let targetDiet = null;
  if (detInfo && detInfo.dietConfidence > DIET_DECISION_THRESHOLD) {
    targetDiet = detInfo.dietType;
  } else if (!detInfo) {
    // No detection info passed — legacy fallback (direct read)
    targetDiet = target.diet || (target.isPlayer ? getPlayerDiet() : null);
  }
  // If detInfo exists but diet confidence is too low, targetDiet stays null (unknown)

  // Herbivores: fear predators and large unknowns
  if (creature.diet === 'herbivore') {
    if (targetDiet === 'predator') return Math.max(0.4, massRatio);
    // Unknown diet + large = cautious threat (can't determine what it eats)
    if (targetDiet === null && massRatio > 0.8) return Math.max(0.3, massRatio * 0.6);
    if (massRatio > 1.5) return massRatio * 0.5;
    return 0;
  }

  // Predators: fear significantly larger predators
  if (creature.diet === 'predator') {
    if (targetDiet === 'predator' && massRatio > 1.5) return massRatio;
    // Unknown diet + much larger = cautious
    if (targetDiet === null && massRatio > 2.0) return massRatio * 0.3;
    return 0;
  }

  return 0;
}

/** Detect threats in range using per-zone detection (Prompt P). */
function detectThreats(creature) {
  const threats = [];

  // Check player
  const player = state.player;
  if (player && player.hp > 0) {
    const result = canDetect(creature, player);
    if (result.detected) {
      const detInfo = (creature.detectionInfo || []).find(d => d.entity === player);
      const threatLevel = assessThreatLevel(creature, player, detInfo || null);
      if (threatLevel > 0) {
        threats.push({
          source: player,
          distance: result.distance,
          threatLevel: threatLevel,
          senses: result.senses,
          bestSNR: result.bestSNR,
        });
      }
    }
  }

  // Check other creatures (Prompt R: spatial grid narrows candidates)
  const nearby = getNearbyCreatures(creature.x, creature.y);
  for (const other of nearby) {
    if (other === creature) continue;
    if (other.hp <= 0) continue;

    const result = canDetect(creature, other);
    if (result.detected) {
      const detInfo = (creature.detectionInfo || []).find(d => d.entity === other);
      const threatLevel = assessThreatLevel(creature, other, detInfo || null);
      if (threatLevel > 0) {
        threats.push({
          source: other,
          distance: result.distance,
          threatLevel: threatLevel,
          senses: result.senses,
          bestSNR: result.bestSNR,
        });
      }
    }
  }

  creature.detectedThreats = threats;
  return threats;
}

/** Spike safety based on detected threats. Uses detection distance and max range. */
function applySafetyFromThreats(creature) {
  if (!creature.detectedThreats || creature.detectedThreats.length === 0) return;

  // Use the most threatening detected entity
  const worst = creature.detectedThreats.reduce((a, b) =>
    a.threatLevel > b.threatLevel ? a : b);

  if (worst.threatLevel <= 0) return;

  // Use bestSNR to determine proximity: SNR 1 = edge of detection, higher = closer
  // Proximity = 1 - 1/bestSNR, clamped [0, 1]
  const bestSNR = worst.bestSNR || 1;
  const proximity = Math.max(0, 1.0 - (1.0 / bestSNR));

  const spike = proximity * worst.threatLevel * SAFETY_PROXIMITY_COEFF;

  creature.drives.safety = Math.min(1.0, creature.drives.safety + spike);
  creature.threatSource = worst.source;
}

/** Spike safety when creature takes damage. Called from combat resolution. */
function applySafetyFromDamage(creature, damageAmount, attacker) {
  if (!creature.drives) return;

  // Prompt K-B: mark creature as having taken damage this turn for flee retaliation
  creature.tookDamageThisTurn = true;
  // Prompt L-A: creature is in combat (was attacked)
  creature.inCombatThisTurn = true;
  // Compute total max HP from surviving body map zones
  const bodyMap = getBodyMap(creature);
  let totalMaxHp = creature.hpMax || 1;
  if (bodyMap) {
    totalMaxHp = 0;
    for (const zone of bodyMap) {
      totalMaxHp += zone.maxHp || 0;
    }
    if (totalMaxHp <= 0) totalMaxHp = creature.hpMax || 1;
  }
  const hpFraction = damageAmount / totalMaxHp;
  let spike = hpFraction * SAFETY_DAMAGE_COEFF;

  // Hungry predators dampen safety spikes — they commit to the hunt.
  // At hunger 0.9, spike is reduced to ~30% (1 - 0.9 * 0.78 ≈ 0.30).
  // At hunger 0.6, spike is reduced to ~53%. Below threshold, no dampening.
  if (creature.diet === 'predator' && creature.drives.hunger > HUNGER_THRESHOLD) {
    const hungerDamp = 1.0 - (creature.drives.hunger * 0.78);
    spike *= Math.max(0.15, hungerDamp);  // floor at 15% — massive hits still register
  }

  creature.drives.safety = Math.min(1.0, creature.drives.safety + spike);

  // Set the threat source to whoever attacked us
  if (attacker) {
    creature.threatSource = attacker;
  }
}

// ==================== PREY / CORPSE DETECTION ====================

/** Get a creature's species key for same-species check. */
function getSpeciesKey(entity) {
  if (entity.isPlayer) {
    // Player's species maps to a creature key
    const sp = entity.species;
    if (sp) {
      const SPECIES_CREATURE_MAP = {
        prowler: 'wolf', ravager: 'dire_wolf', grazer: 'hare',
        shaleback: 'cave_crab', lurker: 'ambush_pred',
      };
      return SPECIES_CREATURE_MAP[sp] || sp;
    }
    return '__player__';
  }
  return entity.key || '__unknown__';
}

/** Check if a target is viable prey for a predator. */
function isViablePrey(predator, target) {
  const predMass = getCreatureMass(predator);
  const targetMass = getCreatureMass(target);
  const massRatio = targetMass / predMass;

  // Too big to hunt — don't try to eat something 1.5x+ your mass
  if (massRatio > 1.5) return false;

  // Too small to bother — below 5% (or 2% if starving)
  const minRatio = predator.drives.hunger > 0.85 ? 0.02 : 0.05;
  if (massRatio < minRatio) return false;

  // Don't hunt your own species
  if (getSpeciesKey(target) === getSpeciesKey(predator)) return false;

  return true;
}

/** Get adjacent prey (within 1 tile). Returns the smallest viable prey or null. */
function getAdjacentPrey(creature) {
  let best = null;
  let bestMass = Infinity;

  // Check NPC creatures (Prompt R: spatial grid narrows candidates)
  const nearby = getNearbyCreatures(creature.x, creature.y);
  for (const other of nearby) {
    if (other === creature) continue;
    if (other.hp <= 0) continue;
    if (chebyshev(creature.x, creature.y, other.x, other.y) > 1) continue;
    if (!isViablePrey(creature, other)) continue;
    const m = getCreatureMass(other);
    if (m < bestMass) { bestMass = m; best = other; }
  }

  // Check player
  const player = state.player;
  if (player && player.hp > 0) {
    if (chebyshev(creature.x, creature.y, player.x, player.y) <= 1) {
      if (isViablePrey(creature, player)) {
        const m = getCreatureMass(player);
        if (m < bestMass) { best = player; }
      }
    }
  }

  return best;
}

/** Detect prey using sense-specific detection (L-B). Predators only. */
function detectPrey(creature) {
  if (creature.diet !== 'predator') return;

  creature.detectedPrey = [];

  // Scan NPC creatures (Prompt R: spatial grid narrows candidates)
  const nearby = getNearbyCreatures(creature.x, creature.y);
  for (const other of nearby) {
    if (other === creature) continue;
    if (other.hp <= 0) continue;
    if (!isViablePrey(creature, other)) continue;

    const result = canDetect(creature, other);
    if (result.detected) {
      creature.detectedPrey.push({
        target: other,
        distance: result.distance,
        senses: result.senses,
      });
    }
  }

  // Scan player
  const player = state.player;
  if (player && player.hp > 0 && isViablePrey(creature, player)) {
    const result = canDetect(creature, player);
    if (result.detected) {
      creature.detectedPrey.push({
        target: player,
        distance: result.distance,
        senses: result.senses,
      });
    }
  }

  // Sort by distance (nearest first)
  creature.detectedPrey.sort((a, b) => a.distance - b.distance);
}

/** Detect corpses within chemical detection range. Predators only.
 *  Corpses are detected primarily by smell — uses best chemical airborne quality
 *  per zone with range formula. */
function detectCorpses(creature) {
  if (creature.diet !== 'predator') return;

  creature.detectedCorpses = [];

  // Corpse chemical emission estimate: mass × base coeff (stationary, no activity)
  // Use chemical range formula: cbrt(emission) × quality × coeff
  const bestChemQuality = getBestChemicalAirborne(creature);
  if (bestChemQuality <= 0) {
    // Fall back to a minimal detection range of 2 tiles (adjacent + 1)
    // for creatures with no chemical sense — they can still stumble on corpses
    const fallbackRange = 2;
    const layer = state.player.layer;
    const items = groundItems[layer];
    if (!items) return;
    for (const posKey of Object.keys(items)) {
      const arr = items[posKey];
      if (!arr) continue;
      for (const item of arr) {
        if (item.kind !== 'corpse' && item.type !== 'corpse') continue;
        const [ix, iy] = posKey.split(',').map(Number);
        const d = dist(creature.x, creature.y, ix, iy);
        if (d > fallbackRange) continue;
        creature.detectedCorpses.push({ target: item, distance: d, x: ix, y: iy });
      }
    }
    creature.detectedCorpses.sort((a, b) => a.distance - b.distance);
    return;
  }

  const layer = state.player.layer;
  const items = groundItems[layer];
  if (!items) return;

  for (const posKey of Object.keys(items)) {
    const arr = items[posKey];
    if (!arr) continue;
    for (const item of arr) {
      if (item.kind !== 'corpse' && item.type !== 'corpse') continue;

      const [ix, iy] = posKey.split(',').map(Number);
      const d = dist(creature.x, creature.y, ix, iy);
      if (d > MAX_DETECTION_DISTANCE) continue;

      // Estimate corpse chemical emission from its mass
      const corpseMass = item.mass || item.nutrition || 1;
      const corpseEmission = corpseMass * CHEM_MASS_COEFF;
      const range = Math.cbrt(corpseEmission) * bestChemQuality * CHEM_RANGE_COEFF;

      if (d <= range) {
        creature.detectedCorpses.push({ target: item, distance: d, x: ix, y: iy });
      }
    }
  }

  creature.detectedCorpses.sort((a, b) => a.distance - b.distance);
}

// ==================== PLAYER PERCEPTION (Prompt P) ====================

/**
 * Compute which creatures the player detects through non-visual senses.
 * Uses per-zone detection (Prompt P) with SNR computation.
 * Populates player.sensedCreatures with
 *   { creature, bestSNR, speciesConfidence, sizeEstimate }
 * for creatures outside visual FOV that are within detection range.
 * Call after updatePlayerFOV() and after all creature signals are computed.
 *
 * Prompt Q: speciesConfidence and sizeEstimate are computed inline (lightweight
 * version of the species/size curves from buildDetectionInfo) so the rendering
 * system can gate blob-vs-sprite display.
 *
 * Visual Detection Pass 1: also computes visual detection for creatures ON
 * FOV tiles. Motion × contrast × concealment modifiers determine whether a
 * creature in the player's field of view is actually visually detectable.
 * Creatures that blend into their background may be invisible even on
 * visible tiles. Results populate player._visuallyDetected (Set of creature
 * references) and low-SNR visual detections are added to sensedCreatures
 * for blob rendering.
 */
function computePlayerPerception() {
  const player = state.player;
  if (!player || player.hp <= 0) return;

  // Clear previous turn's results
  player.sensedCreatures = [];
  // Visual Detection Pass 1: track which FOV creatures passed visual detection
  player._visuallyDetected = new Set();

  const fovSet = state.fovSet;
  const monocularSet = state.monocularSet;

  // Prompt R: spatial grid narrows candidate list for player perception
  const nearby = getNearbyCreatures(player.x, player.y);
  if (!nearby || nearby.length === 0) return;

  for (const creature of nearby) {
    if (creature.hp <= 0) continue;

    const creatureKey = `${creature.x},${creature.y}`;
    const inBinocularFOV = fovSet && fovSet.has(creatureKey);
    const inMonocularFOV = !inBinocularFOV && monocularSet && monocularSet.has(creatureKey);
    const inAnyFOV = inBinocularFOV || inMonocularFOV;

    // ── Visual detection for FOV creatures (Visual Detection Pass 1) ──
    // Creatures on visible tiles are NOT automatically detected. The player's
    // visual system must produce enough signal to distinguish the creature
    // from its background, accounting for motion and integument contrast.
    if (inAnyFOV) {
      // Ensure creature has signals computed
      if (!creature.signals) continue;

      const visRange = getVisualRange(player, creature);
      const d = dist(player.x, player.y, creature.x, creature.y);

      if (visRange > 0 && d <= visRange && hasLineOfSight(player, creature)) {
        // Check vision cone
        const inCone = isInVisionCone(player, creature);
        if (inCone) {
          // Apply local concealment (cover on the target's tile)
          const concealment = computeEffectiveConcealment(creature);
          const effectiveVisRange = concealment > 0
            ? visRange * Math.cbrt(1.0 - concealment)
            : visRange;

          if (d <= effectiveVisRange) {
            // Creature visually detected — compute SNR for rendering quality
            const visSNR = d > 0 ? effectiveVisRange / d : effectiveVisRange * 10;

            let speciesConfidence = 0;
            if (visSNR > SPECIES_CONF_MIN) {
              speciesConfidence = Math.min(1.0,
                (visSNR - SPECIES_CONF_MIN) / (SPECIES_CONF_FULL - SPECIES_CONF_MIN));
            }

            if (speciesConfidence >= SPECIES_DISPLAY_CONFIDENCE) {
              // High confidence — creature renders normally via drawEntityAtTile
              player._visuallyDetected.add(creature);
            } else {
              // Low confidence — route through sensedCreatures for blob rendering
              let sizeEstimate = null;
              if (visSNR > 0) {
                const uncertaintyFactor = SIZE_UNCERTAINTY_BASE / visSNR;
                const rawEstimate = estimateMassFromSignal(creature, player);
                sizeEstimate = {
                  estimated: rawEstimate,
                  lower: rawEstimate / (1 + uncertaintyFactor),
                  upper: rawEstimate * (1 + uncertaintyFactor),
                };
              }
              player.sensedCreatures.push({
                creature, bestSNR: visSNR, speciesConfidence, sizeEstimate,
                _visualFOV: true,  // flag: from visual detection on FOV tile
              });
            }
          }
        }
      }
      // If NOT visually detected at all, creature is invisible on this tile.
      // Non-visual channels can still detect it (processed below for outside-FOV
      // creatures, but FOV creatures are not double-processed for non-visual
      // since the tile is visible and the player's attention is visual).
      continue;
    }

    // ── Non-visual detection (existing code, unchanged) ──
    // Skip creatures already in visual FOV — handled above
    if (!creature.signals) continue;

    // Per-zone detection against this creature
    const detections = detectTargetPerZone(player, creature);
    if (!detections) continue;

    // Find best SNR across non-chemical channels only.
    // Chemical creature detection is handled by the scent transport system now —
    // sniff action, ground trail overlay, involuntary alerts.
    let bestSNR = 0;
    for (const det of detections) {
      if (det.channel === 'chemicalAirborne') continue;
      if (det.snr > bestSNR) bestSNR = det.snr;
    }

    // If creature was only detected chemically, don't add to sensed list
    if (bestSNR <= 0) continue;
    
    // Prompt Q: species confidence — same curve as buildDetectionInfo (any channel)
    let speciesConfidence = 0;
    if (bestSNR > SPECIES_CONF_MIN) {
      speciesConfidence = Math.min(1.0,
        (bestSNR - SPECIES_CONF_MIN) / (SPECIES_CONF_FULL - SPECIES_CONF_MIN));
    }

    // Prompt Q: size estimate — uncertainty narrows with bestSNR
    let sizeEstimate = null;
    if (bestSNR > 0) {
      const uncertaintyFactor = SIZE_UNCERTAINTY_BASE / bestSNR;
      const rawEstimate = estimateMassFromSignal(creature, player);
      sizeEstimate = {
        estimated: rawEstimate,
        lower: rawEstimate / (1 + uncertaintyFactor),
        upper: rawEstimate * (1 + uncertaintyFactor),
      };
    }

    player.sensedCreatures.push({ creature, bestSNR, speciesConfidence, sizeEstimate });
  }
}

export {
  // Light
  getLightLevel,
  // Per-zone detection
  detectTargetPerZone,
  // Sense helpers
  getBestChemicalAirborne, getEffectiveVisual, getDominantSenseChannel,
  // Visual detection
  getVisualRange, facingToAngle, isInVisionCone, hasLineOfSight,
  // Local concealment
  computeEffectiveConcealment,
  // Visual detection helpers (Pass 1)
  _isTargetMoving, _computeContrastFactor,
  // Master detection
  canDetect, getDetectionRange,
  // Legacy vision
  monsterViewRadius, canSeePlayerTile, canSeePlayer,
  // SNR and uncertainty
  estimateMassFromSignal, relativeMagnitude, buildDetectionInfo, assessFightOutcome,
  // Detection aggregators
  buildAllDetectionInfo, detectThreats, applySafetyFromThreats, applySafetyFromDamage,
  assessThreatLevel,
  // Prey/corpse detection
  isViablePrey, getSpeciesKey, detectPrey, detectCorpses, getAdjacentPrey,
  // Player perception
  computePlayerPerception,
};
