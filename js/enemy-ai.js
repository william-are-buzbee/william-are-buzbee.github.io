// ==================== TURN MANAGEMENT + ENEMY AI ====================
// Drive-based creature AI. Every creature runs the same drive/behavior loop.
// Prompt I-A: drives tick, all creatures wander, adjacency combat only.
// Prompt I-B: safety drive + flee behavior. Threat detection, flee dispatch.
//
// Slimmed orchestrator: detection, cognition, and behaviors live in separate
// modules. This file keeps the turn loop, spatial grid, blood/healing, drives,
// dormancy, and the runCreatureAI wiring function.

import { state, worlds, covers, monsters, groundItems } from './state.js';
import { DMG, LAYER_META, LAYER_SURFACE, getBodyMap, selectHitZone,
         MAX_BONUS_MOVE_CHANCE, MIN_ACTION_CHANCE, STAT_MAX, TURN_AGILITY_COEFF,
         facingSteps, checkNeuralDeath, getAvailableAttacks, hasLocomotion, checkSenseLoss,
         getPathways, computeBleedPenalty, computeStrikeDamage, SEEP_COEFF, CLOT_RATE, REGEN_FRACTION,
         BLOOD_DEATH_THRESHOLD, BURST_COEFF, BLOOD_CRITICAL_THRESHOLD,
         ARMOR_PER_STRUCTURAL_KG, getAttackDirection, getExposedZones, selectContactedZones,
         MASS_HUNGER_COEFF, NEURAL_HUNGER_COEFF, SAFETY_DECAY_RATE, REST_BASE_RATE,
         SAFETY_THRESHOLD, HUNGER_THRESHOLD,
         CHEM_RANGE_COEFF, VIB_GROUND_RANGE_COEFF, VIB_AIR_RANGE_COEFF, VIS_RANGE_COEFF,
         MAX_DETECTION_DISTANCE,
         SAFETY_PROXIMITY_COEFF, SAFETY_DAMAGE_COEFF,
         CHASE_LEASH_BASE, CHASE_LEASH_HUNGER_MULT, MEAL_HUNGER_REDUCTION,
         BITE_MASS_FRACTION, GRAZE_HUNGER_REDUCTION, HERBIVORE_SAFETY_BONUS,
         FORAGE_SEARCH_RADIUS,
         DRIVE_COMPARE_THRESHOLD, PLANNING_THRESHOLD,
         REST_BLOOD_IMPAIRED, REST_BLOOD_WEAKENED, REST_BLOOD_CRITICAL, REST_WOUND_COEFF,
         REST_RECOVERY_NORMAL, REST_RECOVERY_WEAKENED, REST_RECOVERY_CRITICAL,
         REST_EATING_BONUS, REST_THRESHOLD,
         HEAL_BASE_RATE, HEAL_REST_MULTIPLIER,
         SIZE_UNCERTAINTY_BASE,
         DIET_CONF_MIN, DIET_CONF_FULL, SPECIES_CONF_MIN, SPECIES_CONF_FULL,
         CONDITION_CONF_MIN, CONDITION_CONF_FULL, DIET_DECISION_THRESHOLD,
         OVERRIDE_SCALE, STIMULUS_RESISTANCE, CRITICAL_MAGNITUDE, REACTIVE_HUNGER_THRESHOLD,
         MIN_SEEK, SEEK_SCALE, PERSISTENCE_SCALE,
         ASSESS_INTEGRATION_THRESHOLD,
         CHEM_MASS_COEFF,
         SPATIAL_CELL_SIZE, SPATIAL_QUERY_RADIUS,
         ACTIVE_RADIUS, DORMANT_RADIUS, MAX_DRIFT } from './constants.js';
import { T, isWalkable, isFoodTile, terrainInfo, tileBlocksVision } from './terrain.js';
import { rand, randi, roll100 } from './rng.js';
import { playerDef, playerDodge, poisonResistance, passiveRegenInterval, restHealAmount, creatureViewRadius } from './player.js';
import { monAcc, monDodge, monDamage, monCritChance, monCritMult, WANDER_PROFILES, DEFAULT_WANDER_PROFILE } from './monsters.js';
import { inBounds, monsterAt, chebyshev, isTownCell, getCover } from './world-state.js';
import { log } from './log.js';
import { render } from './rendering.js';
import { endStealth, stealthDetectChance, rollHit } from './combat.js';
import { placeItem, generateItemId } from './ground-items.js';
import { fedDrainFor } from './player-actions.js';
import { advanceTick, getTimePhase, currentTimePhase } from './time-cycle.js';
import { saveGame } from './save-load.js';
import { updatePlayerFOV, hasLOS } from './fov.js';
import { computeSignals } from './signals.js';

// ── Imports from new modules ──
import { computeIntegrationCapacity, getTier, evaluateReactiveRules,
         canOverrideReactive, deliberativeEvaluation, updateGoalPersistence,
         _ruleLabel, getDominantDrive, combatCapability } from './cognition.js';
import { buildAllDetectionInfo, detectThreats, applySafetyFromThreats,
         detectPrey, detectCorpses, computePlayerPerception,
         canSeePlayer, canSeePlayerTile, monsterViewRadius,
         getDetectionRange, getDominantSenseChannel, getBestChemicalAirborne,
         getEffectiveVisual, applySafetyFromDamage } from './detection.js';
import { executeAction, adjacencyCombatCheck, monsterMelee, executeWander,
         performBonusMove, executeFlee } from './behaviors.js';
import { dist, isWaterTile, isWaterLocked, hasCladeTerritory, wouldExceedTerritory,
         getCreatureMass, canMoveTo, WATER_TILES,
         rebuildSpatialGrid, getNearbyCreatures } from './ai-utils.js';

// Forward references — set by main.js
let _onPlayerDeathCallback = null;
export function setOnPlayerDeathCallback(fn){ _onPlayerDeathCallback = fn; }
let _useActionCallback = null;
export function setUseActionCallback(fn){ _useActionCallback = fn; }

function monstersHere(){ return monsters[state.player.layer] || []; }

// ==================== WATER STATE HELPER (Prompt L-A) ====================
// Update creature.inWater based on current tile. Called after movement.
function _updateInWater(creature) {
  const layer = creature.layer != null ? creature.layer : state.player.layer;
  creature.inWater = isWaterTile(layer, creature.x, creature.y);
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

let turnCount = 0;

// ── Layer-transition tracking for dormancy catch-up (Prompt S) ──
// When the player leaves a layer, we record the turn count.  When they return,
// every creature on that layer gets catch-up for the intervening turns.
let _prevLayer = null;
const _layerLeftTurn = {};   // layerIndex → turnCount when the player left

// ==================== DRIVE SYSTEM ====================

/** Update creature drives based on body composition. Called once per turn. */
function updateDrives(creature) {
  if (!creature.drives) return;

  // Compute total mass and neural mass from surviving body zones
  const bodyMap = getBodyMap(creature);
  let totalMass = creature.totalMass || 0;
  let totalNeural = 0;

  if (bodyMap) {
    // Recalculate from surviving zones (destroyed zones lose their mass)
    totalMass = 0;
    for (const zone of bodyMap) {
      if (!zone.destroyed) {
        totalMass += zone.mass || 0;
        totalNeural += zone.neural || 0;
      }
    }
  }

  // Hunger: increases based on body mass and neural mass
  creature.drives.hunger = Math.min(1.0, creature.drives.hunger +
    (totalMass * MASS_HUNGER_COEFF + totalNeural * NEURAL_HUNGER_COEFF));

  // Safety: decays toward 0 (threats spike it via applySafetyFromThreats)
  creature.drives.safety = Math.max(0, creature.drives.safety - SAFETY_DECAY_RATE);

  // Rest: base rate + wound acceleration + blood acceleration (I-D)
  const bloodAccel = getBloodRestAcceleration(creature);
  const woundAccel = getWoundRestAcceleration(creature);
  const restRate = REST_BASE_RATE + bloodAccel + woundAccel;
  creature.drives.rest = Math.min(1.0, creature.drives.rest + restRate);
}

/** Rest acceleration from blood loss (I-D). Mirrors bleed penalty thresholds. */
function getBloodRestAcceleration(creature) {
  if (creature.blood == null || creature.bloodMax == null || creature.bloodMax <= 0) return 0;
  const bloodFraction = creature.blood / creature.bloodMax;

  if (bloodFraction > 0.75) return 0;
  if (bloodFraction > 0.50) return REST_BLOOD_IMPAIRED;
  if (bloodFraction > 0.25) return REST_BLOOD_WEAKENED;
  return REST_BLOOD_CRITICAL;
}

/** Rest acceleration from zone damage (I-D). Proportional to fraction of zones wounded. */
function getWoundRestAcceleration(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return 0;

  let damagedZones = 0;
  let totalZones = 0;

  for (const zone of bodyMap) {
    totalZones++;
    if (zone.hp != null && zone.maxHp != null && zone.hp < zone.maxHp) {
      damagedZones++;
    } else if (zone.destroyed) {
      damagedZones++;
    }
  }

  if (totalZones === 0) return 0;
  return (damagedZones / totalZones) * REST_WOUND_COEFF;
}

// ==================== ACTIVE SIMULATION RADIUS (Prompt S) ====================
// Creatures beyond DORMANT_RADIUS from the player are dormant — they skip
// the expensive per-turn pipeline entirely.  When they re-enter ACTIVE_RADIUS
// they run a lightweight catch-up that advances their state to be plausible.
// Hysteresis between the two radii prevents flickering at the boundary.

/**
 * Classify a creature as active or dormant based on distance to the player.
 * Returns true if the creature is active (should run full simulation).
 */
function updateCreatureActivity(creature, player) {
  const dx = creature.x - player.x;
  const dy = creature.y - player.y;
  const distSq = dx * dx + dy * dy;

  if (creature._dormant) {
    // Wake up if within active radius
    if (distSq <= ACTIVE_RADIUS * ACTIVE_RADIUS) {
      if (creature._dormantTurns > 0) {
        catchUpCreature(creature);
      }
      creature._dormant = false;
      creature._dormantTurns = 0;
      return true;  // active
    }
    // Stay dormant
    creature._dormantTurns = (creature._dormantTurns || 0) + 1;
    return false;
  } else {
    // Go dormant if beyond dormant radius
    if (distSq > DORMANT_RADIUS * DORMANT_RADIUS) {
      creature._dormant = true;
      creature._dormantTurns = 0;
      return false;  // dormant
    }
    // Stay active
    return true;
  }
}

/**
 * Advance a dormant creature's state to be plausible when it wakes up.
 * Uses the same rates as the real simulation — no separate hardcoded values.
 * Never kills the creature — death events only happen during full simulation.
 */
function catchUpCreature(creature) {
  const turns = creature._dormantTurns;
  if (turns <= 0) return;

  // 1. Advance hunger (same rate as updateDrives)
  if (creature.drives) {
    const bodyMap = getBodyMap(creature);
    let totalMass = creature.totalMass || 0;
    let totalNeural = 0;
    if (bodyMap) {
      totalMass = 0;
      for (const zone of bodyMap) {
        if (!zone.destroyed) {
          totalMass += zone.mass || 0;
          totalNeural += zone.neural || 0;
        }
      }
    }
    const hungerPerTurn = totalMass * MASS_HUNGER_COEFF + totalNeural * NEURAL_HUNGER_COEFF;
    creature.drives.hunger = Math.min(1.0, creature.drives.hunger + hungerPerTurn * turns);
  }

  // 2. Heal wounds (if blood was sufficient — dormant creature was effectively resting)
  if (creature.blood != null && creature.bloodMax != null && creature.bloodMax > 0) {
    if (creature.blood > creature.bloodMax * 0.5) {
      const bodyMap = getBodyMap(creature);
      if (bodyMap) {
        const bloodFraction = creature.blood / creature.bloodMax;
        const bloodScalar = (bloodFraction - 0.50) / 0.50;
        const healPerTurn = HEAL_BASE_RATE * bloodScalar * HEAL_REST_MULTIPLIER;
        for (const zone of bodyMap) {
          if (zone.destroyed) continue;
          if (zone.hp != null && zone.maxHp != null && zone.hp < zone.maxHp) {
            zone.hp = Math.min(zone.maxHp, zone.hp + healPerTurn * turns);
          }
        }
      }
    }
  }

  // 3. Regenerate blood (same rate as processBleed regen)
  if (creature.blood != null && creature.bloodMax != null && creature.bloodMax > 0) {
    if (creature.blood < creature.bloodMax) {
      const regenPerTurn = creature.bloodMax * REGEN_FRACTION;
      creature.blood = Math.min(creature.bloodMax, creature.blood + regenPerTurn * turns);
    }
  }

  // 4. Clot wounds — after enough turns, all wounds are fully clotted
  if (turns > 20) {
    const bodyMap = getBodyMap(creature);
    if (bodyMap) {
      for (const zone of bodyMap) {
        if (zone.clotting !== undefined) {
          zone.clotting = 1.0;
        }
      }
    }
  }

  // 5. Drift position — dormant creatures weren't actually frozen, they were wandering
  driftPosition(creature, turns);

  // 6. Reset rest drive — if dormant long enough, the creature rested fully
  if (creature.drives && turns > 10) {
    creature.drives.rest = 0;
  }

  // 7. Reset safety drive — no threats while dormant
  if (creature.drives) {
    creature.drives.safety = 0;
  }
}

/**
 * Shift a creature's position based on dormancy duration to simulate wandering.
 * Territorial creatures drift within home radius; wanderers drift freely (capped).
 * Square root scaling: 10 turns → ~3 tiles, 100 → ~10, 400 → 15 (capped).
 */
function driftPosition(creature, dormantTurns) {
  let maxDrift;
  const layer = creature.layer != null ? creature.layer : state.player.layer;

  if (creature.territoryRadius > 0) {
    // Territorial creature: drift within territory, biased toward home
    maxDrift = Math.min(creature.territoryRadius, Math.floor(Math.sqrt(dormantTurns)));
  } else {
    // Wandering creature: drift scales with time, capped
    maxDrift = Math.min(MAX_DRIFT, Math.floor(Math.sqrt(dormantTurns)));
  }

  if (maxDrift <= 0) return;

  // Try random offsets, accept the first valid position
  for (let attempt = 0; attempt < 10; attempt++) {
    const dx = Math.floor(Math.random() * (maxDrift * 2 + 1)) - maxDrift;
    const dy = Math.floor(Math.random() * (maxDrift * 2 + 1)) - maxDrift;

    const newX = creature.x + dx;
    const newY = creature.y + dy;

    if (isDriftPositionValid(creature, newX, newY, layer)) {
      creature.x = newX;
      creature.y = newY;
      // Update home if creature has wander home tracking but is non-territorial
      return;
    }
  }
  // If no valid position found in 10 attempts, stay put
}

/**
 * Validate a drift target position — reuses the same constraints as normal movement.
 * Checks: bounds, terrain walkability, water locks, no creature collision, territory.
 */
function isDriftPositionValid(creature, tx, ty, layer) {
  if (!inBounds(layer, tx, ty)) return false;

  const ground = worlds[layer][ty][tx];
  const cover = getCover(layer, tx, ty);

  // Water tile check (mirrors canMoveTo)
  if (WATER_TILES.has(ground)) {
    if (creature.canEnterWater !== true) return false;
    // Water creature still needs cover to be walkable (if any)
    if (cover) {
      const ci = terrainInfo(cover);
      if (!ci.walk) return false;
    }
  } else {
    if (!isWalkable(ground, cover)) return false;
  }

  // Water-locked creatures can't leave water
  if (isWaterLocked(creature) && !WATER_TILES.has(ground)) return false;

  // No collision with another creature (skip self)
  const occupant = monsterAt(tx, ty, layer);
  if (occupant && occupant !== creature) return false;

  // No collision with player
  if (tx === state.player.x && ty === state.player.y) return false;

  // Territory radius check
  if (wouldExceedTerritory(creature, tx, ty)) return false;

  return true;
}

// ==================== UNIFIED AI LOOP ====================

/** Main AI entry point — called once per creature per turn. */
function runCreatureAI(creature) {
  if (creature.hp <= 0) return;

  // ── Reset per-turn state flags (Prompt L-A) ──
  creature.movedThisTurn = false;
  creature.inCombatThisTurn = false;

  // Immobilized creatures can't move but can still attack adjacently
  if (creature.immobilized) {
    updateDrives(creature);
    creature.integrationCapacity = computeIntegrationCapacity(creature);
    creature.tier = getTier(creature.integrationCapacity);
    buildAllDetectionInfo(creature);
    detectThreats(creature);
    applySafetyFromThreats(creature);
    detectPrey(creature);
    detectCorpses(creature);
    adjacencyCombatCheck(creature);
    _updateInWater(creature);
    computeSignals(creature);
    return;
  }

  // Update drives
  updateDrives(creature);

  // ── Cognitive tier (Prompt M-A1) ──
  creature.integrationCapacity = computeIntegrationCapacity(creature);
  creature.tier = getTier(creature.integrationCapacity);

  // ── Build continuous-uncertainty detection info (Prompt P) ──
  // Must run before detectThreats so threat assessment can use detection-derived info
  buildAllDetectionInfo(creature);

  // Threat detection — uses detection info for honest threat assessment
  detectThreats(creature);
  applySafetyFromThreats(creature);

  // Prey and corpse detection (I-C) — still used by deliberative layer
  detectPrey(creature);
  detectCorpses(creature);

  // ── Goal persistence check ──
  updateGoalPersistence(creature);

  // ══════════════════════════════════════════════════════════════
  // ── Reactive-Deliberative Architecture (Prompt O) ──
  // Step 1: Reactive layer always runs — produces recommendation + magnitude
  let reactiveAction = evaluateReactiveRules(creature);

  // Step 2: Deliberative override attempt
  let action = reactiveAction;
  let overrideAttempted = false;
  let overrideSucceeded = false;
  const overrideCapacity = creature.integrationCapacity * OVERRIDE_SCALE;
  const overrideThreshold = reactiveAction.magnitude * STIMULUS_RESISTANCE;
  const overrideProbability = (reactiveAction.magnitude >= CRITICAL_MAGNITUDE) ? 0
    : (overrideThreshold > 0 ? Math.min(1, overrideCapacity / overrideThreshold) : 1);

  if (canOverrideReactive(creature, reactiveAction.magnitude)) {
    overrideAttempted = true;
    const deliberateAction = deliberativeEvaluation(creature);
    if (deliberateAction) {
      overrideSucceeded = true;
      action = deliberateAction;
    }
  }

  // ── Store decision trace for debugCognition() ──
  creature._lastTrace = {
    reactiveRule: _ruleLabel(reactiveAction),
    reactiveBehavior: reactiveAction.behavior,
    reactiveMagnitude: reactiveAction.magnitude,
    overrideProbability: overrideProbability,
    overrideAttempted: overrideAttempted,
    overrideSucceeded: overrideSucceeded,
    finalBehavior: action.behavior,
    fromDeliberate: !!action.fromDeliberate,
  };

  // Step 3: Execute the selected action
  creature.currentBehavior = action.behavior;
  let moved = executeAction(creature, action);
  // ══════════════════════════════════════════════════════════════

  // Adjacency combat: skip if fleeing cleanly or if action already attacked
  const behavior = creature.currentBehavior;
  const fleeingCleanly = (behavior === 'flee' && moved && !creature.tookDamageThisTurn);
  const alreadyAttacked = (action.behavior === 'retaliate' || action.behavior === 'attack_adjacent' ||
                           action.behavior === 'hunt_attack');
  if (!fleeingCleanly && !alreadyAttacked) {
    adjacencyCombatCheck(creature);
  }

  // Prompt K-B: reset per-turn damage flag AFTER combat check
  creature.tookDamageThisTurn = false;

  // ── Signal emission (Prompt L-A) ──
  _updateInWater(creature);
  computeSignals(creature);
}

// ==================== END PLAYER TURN ====================

function endPlayerTurn(action){
  const player = state.player;

  // ── Ensure player signal fields exist (Prompt L-A) ──
  if (player.signals == null) {
    player.signals = { chemical: 0, vibration: { ground: 0, air: 0, water: 0 }, visual: 0 };
  }
  if (player.movedThisTurn == null) player.movedThisTurn = false;
  if (player.inCombatThisTurn == null) player.inCombatThisTurn = false;
  if (player.inWater == null) player.inWater = false;

  // ── Cognitive tier — player (Prompt M-A1) ──
  player.integrationCapacity = computeIntegrationCapacity(player);
  player.tier = getTier(player.integrationCapacity);

  turnCount++;
  advanceTick();  // advance day/night cycle
  // Drain FED based on action (scaled; 1 FED per accumulated 100)
  state.player.fedProgress = (state.player.fedProgress||0) + fedDrainFor(action||'move');
  while (state.player.fedProgress >= 10 && state.player.fed > 0){
    state.player.fed = Math.max(0, state.player.fed - 1);
    state.player.fedProgress -= 10;
  }
  // Clamp: discard banked progress once starving so it doesn't
  // instantly re-drain after eating
  if (state.player.fed <= 0){
    state.player.fed = 0;
    state.player.fedProgress = 0;
  }
  if (state.player.fed === 15 && !state.player._warnedHungry){
    log('You grow hungry.', 'warn'); state.player._warnedHungry = true;
  }
  if (state.player.fed > 15) state.player._warnedHungry = false;

  // Starvation: FED=0 drains HP slowly
  if (state.player.fed === 0){
    state.player.starveTurns = (state.player.starveTurns||0) + 1;
    if (state.player.starveTurns >= 3){  // 1 HP per 3 turns of starvation
      state.player.starveTurns = 0;
      state.player.hp -= 1;
      if (state.player.hp <= 0){
        state.player.hp = 0;
        log('You collapse from starvation.', 'dead');
        state.player.deathCause = 'starvation';
        if (_onPlayerDeathCallback) _onPlayerDeathCallback();
        return;
      }
      log('Starvation wears you down.', 'warn');
    }
  } else {
    state.player.starveTurns = 0;
  }

  // Passive regen — scales linearly with Size, all values get regen
  // Passive healing does NOT drain FED
  const iv = passiveRegenInterval(player);
  if (state.player.fed > 0 && state.player.hp < state.player.hpMax){
    state.player.regenProgress = (state.player.regenProgress||0) + 1;
    if (state.player.regenProgress >= iv){
      state.player.hp = Math.min(state.player.hpMax, state.player.hp + 1);
      state.player.regenProgress = 0;
    }
  }

  // Player effects tick
  const survivingEffects = [];
  for (const e of state.player.effects){
    if (e.type === 'stealth'){ survivingEffects.push(e); continue; }
    if (e.type === 'poison'){
      const resist = poisonResistance(player);
      const reduction = 1 - resist.damageReduction;
      // % max HP damage
      const pctDmg = Math.max(0, Math.round((e.percentDmg || 0.03) * state.player.hpMax * reduction));
      // Flat damage
      const flatDmg = Math.max(0, Math.round((e.flatDmg || 1) * reduction));
      const totalPoisonDmg = Math.max(1, pctDmg + flatDmg);
      state.player.hp -= totalPoisonDmg;
      log(`Poison bites. [-${totalPoisonDmg} HP]`, 'dmg');
      if (state.player.hp <= 0){
        state.player.hp = 0;
        log('The venom claims you.', 'dead');
        state.player.deathCause = 'poison';
        if (_onPlayerDeathCallback) _onPlayerDeathCallback();
        return;
      }
    }
    e.turns--;
    if (e.turns > 0) survivingEffects.push(e);
  }
  state.player.effects = survivingEffects;

  // Blood system — process player bleed (seep, regen, clotting, death check)
  if (processBleed(state.player, true)) {
    state.player.hp = 0;
    // deathCause already set by processBleed
    if (_onPlayerDeathCallback) _onPlayerDeathCallback();
    return;
  }

  // Zone healing (Prompt J) — player heals wounded zones after bleed
  // Set currentBehavior so getHealingRate can check for rest bonus
  state.player.currentBehavior = action === 'rest' ? 'rest' : action;
  applyHealing(state.player);

  // ── Player signal emission (Prompt L-A) ──
  // Update water state and compute player signals before NPC turns,
  // so NPCs see current player emission values.
  _updateInWater(state.player);
  computeSignals(state.player);

  // Reset player per-turn flags AFTER signals are computed (Prompt L-A).
  // They'll be set again during the player's next action.
  state.player.movedThisTurn = false;
  state.player.inCombatThisTurn = false;

  // ── Prompt S: layer-transition catch-up ──
  // If the player changed layers since last turn, record departure from the old
  // layer and catch up creatures on the new layer for the time the player was away.
  const currentLayer = state.player.layer;
  if (_prevLayer != null && _prevLayer !== currentLayer) {
    // Record when we left the previous layer
    _layerLeftTurn[_prevLayer] = turnCount;
    // If returning to a layer we've visited before, catch up its creatures
    if (_layerLeftTurn[currentLayer] != null) {
      const turnsAway = turnCount - _layerLeftTurn[currentLayer];
      if (turnsAway > 0) {
        const layerMons = monsters[currentLayer] || [];
        for (const m of layerMons) {
          if (m.hp <= 0) continue;
          // All creatures on a non-active layer are effectively dormant for the duration
          m._dormant = true;
          m._dormantTurns = (m._dormantTurns || 0) + turnsAway;
        }
      }
      delete _layerLeftTurn[currentLayer];
    }
  }
  _prevLayer = currentLayer;

  // Enemies act — only on current layer, town cells are safe
  if (!isTownCell(state.player.layer)){
    const mons = monstersHere();

    // Prompt S: classify creatures as active or dormant
    const activeCreatures = [];
    for (const m of mons) {
      if (m.hp <= 0) continue;
      if (updateCreatureActivity(m, player)) {
        activeCreatures.push(m);
      }
    }

    // Prompt R: rebuild spatial hash grid with active creatures only
    rebuildSpatialGrid(activeCreatures);

    // Phase 1: Each active enemy takes its normal action (speed skip + AI)
    for (const m of activeCreatures){
      if (m.hp <= 0) continue;
      // Blood system — process monster bleed each turn
      if (processBleed(m, false)) {
        m.hp = 0;  // blood loss death
        continue;
      }

      // Zone healing (Prompt J) — monsters heal wounded zones after bleed
      applyHealing(m);

      // ---- Relative speed system (PTW-based) ----
      const monPTW  = m.strength / m.siz;
      const plrPTW  = player.strength / player.siz;
      const spdRatio = monPTW / plrPTW;

      m._actedNormally = false;

      if (spdRatio < 1) {
        const actionChance = Math.max(spdRatio, MIN_ACTION_CHANCE);
        if (Math.random() >= actionChance) {
          continue;  // skipped — no action this turn
        }
      }

      m._actedNormally = true;

      // Facing initialization for creatures that need it
      if (!m.facing && (m.key === 'cave_crab')) {
        m.facing = { dx: 0, dy: 1 };
      }

      runCreatureAI(m);

      if (state.player.hp <= 0){ _onPlayerDeathCallback && _onPlayerDeathCallback(); return; }
    }
    // Phase 2: Each active enemy that acted normally rolls for a bonus move (faster enemies only)
    for (const m of activeCreatures){
      if (m.hp <= 0) continue;
      if (!m._actedNormally) continue;
      const monPTW  = m.strength / m.siz;
      const plrPTW  = player.strength / player.siz;
      const ratio   = monPTW / plrPTW;
      if (ratio >= 1) {
        const bleedMul = 1 - (m.bleedPenalty || 0);
        const bonusChance = Math.min((ratio - 1) * bleedMul, MAX_BONUS_MOVE_CHANCE);
        if (Math.random() < bonusChance) {
          performBonusMove(m);
        }
      }
      m._actedNormally = false;
    }
  }
  for (const layer of Object.keys(monsters)){
    if (monsters[layer]) monsters[layer] = monsters[layer].filter(m => m.hp > 0);
  }
  updatePlayerFOV();  // recompute FOV before rendering
  computePlayerPerception();  // Prompt N: detect creatures through non-visual senses
  render();
  saveGame().catch(err => console.error('[Save] Auto-save failed:', err));  // Async fire-and-forget
}

// ==================== LEGACY STUBS ====================
// These functions are exported for backward compatibility with modules
// that may import them. They are no-ops in the new drive-based AI.
function playerInTerritory(mon){ return true; }
function monInOwnTerritory(mon){ return true; }
function syncSwarmAI(mon){ /* removed — I-A */ }
const mushroomPackAI = syncSwarmAI;
function mushroomTouch(mon){ /* removed — I-A */ }
function wanderInTerritory(mon){ executeWander(mon); }
function moveMonsterToward(mon, tx, ty, movementOnly){
  // Simple step-toward — kept for any external callers
  const dx = Math.sign(tx - mon.x);
  const dy = Math.sign(ty - mon.y);
  const attempts = [];
  if (dx !== 0 && dy !== 0) attempts.push([dx,dy],[dx,0],[0,dy]);
  else if (dx !== 0) attempts.push([dx,0],[dx,1],[dx,-1]);
  else attempts.push([0,dy],[1,dy],[-1,dy]);
  for (const [ax,ay] of attempts){
    const nx = mon.x+ax, ny = mon.y+ay;
    if (canMoveTo(mon, nx, ny)){
      if (nx === state.player.x && ny === state.player.y){
        if (movementOnly) return;
        monsterMelee(mon); return;
      }
      mon.x = nx; mon.y = ny;
      if (mon.facing) { mon.facing.dx = ax; mon.facing.dy = ay; }
      return;
    }
  }
}
function wanderMonster(mon){ executeWander(mon); }
function moveMonsterTowardPlayer(mon){ moveMonsterToward(mon, state.player.x, state.player.y); }
// enemyAct is replaced by runCreatureAI — kept as alias for any external callers
function enemyAct(mon){ runCreatureAI(mon); }

// ==================== DEBUG / TESTING HELPERS ====================
// Call from console: import('./enemy-ai.js').then(m => m.debugEcology())
// Or assign to window in main.js: window.debugEcology = debugEcology

/** Dump drive state and behavior for all creatures on the active layer. */
function debugEcology() {
  const mons = monstersHere();
  const summary = [];
  for (const m of mons) {
    if (m.hp <= 0) continue;
    const dom = getDominantSenseChannel(m);
    const bestChem = getBestChemicalAirborne(m);
    const bestVis = getEffectiveVisual(m);
    summary.push({
      name: m.name,
      key: m.key,
      diet: m.diet,
      tier: m.tier || '?',
      pos: `${m.x},${m.y}`,
      behavior: m.currentBehavior,
      hunger: m.drives.hunger.toFixed(3),
      safety: m.drives.safety.toFixed(3),
      rest: m.drives.rest.toFixed(3),
      prey: m.detectedPrey ? m.detectedPrey.length : 0,
      corpses: m.detectedCorpses ? m.detectedCorpses.length : 0,
      huntTarget: m.huntTarget ? (m.huntTarget.name || m.huntTarget.key || 'player') : null,
      dominant: dom.type + '(' + dom.value + ')',
      detRange: Math.round(getDetectionRange(m)),
    });
  }
  console.table(summary);
  return summary;
}

/** Force all predators on the active layer to high hunger (for testing hunts). */
function debugForceHunger(value = 0.85) {
  const mons = monstersHere();
  let count = 0;
  for (const m of mons) {
    if (m.hp <= 0) continue;
    if (m.diet === 'predator') {
      m.drives.hunger = value;
      count++;
    }
  }
  console.log(`Set hunger to ${value} on ${count} predators.`);
  return count;
}

/** Dump the full reactive-deliberative decision trace for all creatures.
 *  Shows which reactive rule fired, override probability and result,
 *  and what SNR-based info each creature has about its detections.
 *  Call from console: window.debugCognition() */
function debugCognition() {
  const mons = monstersHere();
  const rows = [];

  for (const m of mons) {
    if (m.hp <= 0) continue;

    const t = m._lastTrace || {};
    const ic = (m.integrationCapacity || 0).toFixed(3);

    // Summarize best detection info (Prompt P: continuous uncertainty)
    let snrSummary = '—';
    if (m.detectionInfo && m.detectionInfo.length > 0) {
      const parts = [];
      for (const det of m.detectionInfo) {
        const who = det.entity ? (det.entity.name || det.entity.key || 'player') : '?';
        const sz = det.sizeRelative || '?';
        const snr = det.bestSNR ? det.bestSNR.toFixed(1) : '?';
        const dc = det.dietConfidence ? det.dietConfidence.toFixed(2) : '0';
        const dt = det.dietType || '?';
        const mv = det.isMoving != null ? (det.isMoving ? 'mv' : 'still') : '?';
        const asmt = det.threatAssessment || '';
        const d = det.distance ? det.distance.toFixed(1) : '?';
        let detail = `${who}(${d}t snr=${snr}): sz=${sz}`;
        if (det.sizeEstimate) detail += ` [${det.sizeEstimate.lower.toFixed(1)}-${det.sizeEstimate.upper.toFixed(1)}kg]`;
        if (dt !== '?' && dc !== '0') detail += ` diet=${dt}@${dc}`;
        if (mv !== '?') detail += ` ${mv}`;
        if (det.woundChemistry) detail += ' wound';
        if (det.gaitAnomaly) detail += ' limp';
        if (asmt) detail += ` [${asmt}]`;
        parts.push(detail);
      }
      snrSummary = parts.join(' | ');
    }

    // Dominant sense (Prompt P: computed from zones, not _senses cache)
    const dom = getDominantSenseChannel(m);

    rows.push({
      name: m.name,
      IC: ic,
      domSense: dom.type,
      rule: t.reactiveRule || '—',
      mag: t.reactiveMagnitude != null ? t.reactiveMagnitude.toFixed(1) : '—',
      'P(ovr)': t.overrideProbability != null ? (t.overrideProbability * 100).toFixed(0) + '%' : '—',
      override: t.overrideSucceeded ? 'YES' : (t.overrideAttempted ? 'tried' : 'no'),
      final: t.finalBehavior || '—',
      delib: t.fromDeliberate ? '✓' : '',
      detections: snrSummary,
    });
  }

  if (rows.length === 0) {
    console.log('No living creatures on the active layer.');
    return [];
  }

  console.table(rows);

  // Also log a compact override-effectiveness summary
  const bySpecies = {};
  for (const m of mons) {
    if (m.hp <= 0) continue;
    const k = m.key || m.name;
    if (!bySpecies[k]) bySpecies[k] = { key: k, ic: m.integrationCapacity, overrides: 0, reactive: 0, total: 0 };
    bySpecies[k].total++;
    if (m._lastTrace) {
      if (m._lastTrace.overrideSucceeded) bySpecies[k].overrides++;
      else bySpecies[k].reactive++;
    }
  }
  console.log('\n── Override summary ──');
  for (const sp of Object.values(bySpecies)) {
    const rate = sp.total > 0 ? ((sp.overrides / sp.total) * 100).toFixed(0) : '0';
    console.log(`  ${sp.key} (IC=${sp.ic.toFixed(3)}): ${sp.overrides}/${sp.total} overrode (${rate}%)`);
  }

  return rows;
}

// ==================== EXPORTS ====================
// Re-export the full public API so external modules don't need to change imports.

export { endPlayerTurn, enemyAct, playerInTerritory, monInOwnTerritory,
         syncSwarmAI, mushroomPackAI, mushroomTouch, wanderInTerritory, moveMonsterToward,
         wanderMonster, moveMonsterTowardPlayer,
         processBleed,
         debugEcology, debugForceHunger, debugCognition };

// Re-exports from sub-modules
export { monsterMelee } from './behaviors.js';
export { canSeePlayer, canSeePlayerTile, monsterViewRadius,
         applySafetyFromDamage, computePlayerPerception } from './detection.js';
export { hasCladeTerritory, wouldExceedTerritory,
         isWaterLocked, isWaterTile } from './ai-utils.js';
