// ==================== AI ====================
// Per-creature AI tick, reactive-deliberative decision making, drive updates,
// movement helpers, and legacy stubs.
// Split from enemy-ai.js.

import { state } from './state.js';
import { getBodyMap, getNeuralArchitecture,
         MASS_HUNGER_COEFF, NEURAL_HUNGER_COEFF, SAFETY_DECAY_RATE, REST_BASE_RATE,
         REST_BLOOD_IMPAIRED, REST_BLOOD_WEAKENED, REST_BLOOD_CRITICAL, REST_WOUND_COEFF,
         HUNGER_THRESHOLD, STRESS_MAX, STRESS_RELEASE_AMOUNT,
         OVERRIDE_SCALE, STIMULUS_RESISTANCE, CRITICAL_MAGNITUDE } from './constants.js';
import { computeIntegrationCapacity, getTier, evaluateReactiveRules,
         processGanglionSystem,
         canOverrideReactive, deliberativeEvaluation, updateGoalPersistence,
         _ruleLabel, getDominantDrive, combatCapability } from './cognition.js';
import { buildAllDetectionInfo, detectThreats, applySafetyFromThreats,
         detectPrey, detectCorpses } from './detection.js';
import { executeAction, adjacencyCombatCheck, monsterMelee, executeWander,
         executeFlee } from './behaviors.js';
import { isWaterTile, canMoveTo, getCorpseAt } from './ai-utils.js';
import { computeSignals } from './signals.js';
import { _depleteLocomotionSubstrate, _releaseStressChemistry } from './physiology.js';

// ==================== WATER STATE HELPER (Prompt L-A) ====================
// Update creature.inWater based on current tile. Called after movement.
function _updateInWater(creature) {
  const layer = creature.layer != null ? creature.layer : state.player.layer;
  creature.inWater = isWaterTile(layer, creature.x, creature.y);
}

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

/**
 * Translate ganglion motor output into an action the existing execution
 * system can handle. This is a bridge — eventually the execution system
 * will read intensity directly. For now, map to existing behavior labels.
 */
function _ganglionOutputToAction(output, creature) {
  if (!output) return { behavior: 'hold', magnitude: 0.1 };

  // Store ganglion intensity for substrate depletion
  creature._lastGanglionIntensity = output.intensity;

  if (output.intensity <= 0) {
    // No locomotion signal — hold still or check feeding
    if (output.type === 'alert') {
      // Orient toward threat bearing (face it while holding still)
      return {
        behavior: 'orient',
        magnitude: 0.4,
        direction: output.direction != null ? (output.direction + 4) % 8 : null,
      };
    }
    // At food tile — graze (mid-graze local ganglion contact-chemical reflex)
    if (output.atFood && creature.drives && creature.drives.hunger > HUNGER_THRESHOLD) {
      return { behavior: 'graze', magnitude: 0.3 };
    }
    // Check mid-graze contact feeding on corpses
    const corpse = getCorpseAt(state.player.layer, creature.x, creature.y);
    if (corpse && creature.drives && creature.drives.hunger > HUNGER_THRESHOLD) {
      return { behavior: 'eat_corpse', magnitude: 0.3 };
    }
    if (output.type === 'forage' && output.direction != null) {
      return {
        behavior: 'forage_approach',
        magnitude: 0.3,
        direction: output.direction,
      };
    }
    return { behavior: 'hold', magnitude: 0.1 };
  }

  // Locomotion signal present
  if (output.intensity >= 0.7) {
    // High intensity — flee equivalent
    creature.threatSource = output.source || creature.threatSource;
    return {
      behavior: 'flee',
      magnitude: output.intensity,
      direction: output.direction,    // bolt/flee bearing for fallback
      _ganglionIntensity: output.intensity,
    };
  } else if (output.intensity >= 0.3) {
    // Moderate intensity — directed movement (approach food, cautious movement)
    return {
      behavior: 'wander',
      magnitude: output.intensity,
      direction: output.direction,
      _ganglionIntensity: output.intensity,
    };
  } else {
    // Low intensity — slow approach
    return {
      behavior: 'wander',
      magnitude: output.intensity,
      direction: output.direction,
      _ganglionIntensity: output.intensity,
    };
  }
}

// ==================== UNIFIED AI LOOP ====================

/** Main AI entry point — called once per creature per turn. */
function runCreatureAI(creature) {
  if (creature.hp <= 0) return;

  // ── Reset per-turn state flags (Prompt L-A) ──
  creature.movedThisTurn = false;
  creature.inCombatThisTurn = false;
  // Reset ganglion transient fields
  creature._lastGanglionIntensity = null;
  creature._ganglionTriggeredStress = false;

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
  // NOTE: _regenerateSubstrate is now called from endPlayerTurn, scaled by ticksElapsed

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
  // ── Behavior Decision ──
  const neural = getNeuralArchitecture(creature);
  let action;
  let reactiveAction = null;

  if (neural) {
    // ── Ganglion Architecture Path ──
    // Creature has ganglion architecture — use physical system.
    // Pre-check: damage this turn spikes stress (pain is a physical signal
    // that bypasses the sensory ganglion pathway)
    if (creature.tookDamageThisTurn) {
      creature.stressLevel = Math.min(
        STRESS_MAX,
        (creature.stressLevel || 0) + STRESS_RELEASE_AMOUNT
      );
    }

    const ganglionOutput = processGanglionSystem(creature);
    action = _ganglionOutputToAction(ganglionOutput, creature);

    // ── Stress chemistry release (per-action; clearance runs in endPlayerTurn) ──
    _releaseStressChemistry(creature);

    // ── Store decision trace for debugCognition() ──
    creature._lastTrace = {
      reactiveRule: 'GANGLION ' + (ganglionOutput ? ganglionOutput.type : 'null'),
      reactiveBehavior: action.behavior,
      reactiveMagnitude: action.magnitude || 0,
      overrideProbability: 0,
      overrideAttempted: false,
      overrideSucceeded: false,
      finalBehavior: action.behavior,
      fromDeliberate: false,
      ganglionIntensity: ganglionOutput ? ganglionOutput.intensity : 0,
      stressLevel: creature.stressLevel || 0,
    };
  } else {
    // ── Reactive-Deliberative Architecture (Prompt O) ──
    // Step 1: Reactive layer always runs — produces recommendation + magnitude
    reactiveAction = evaluateReactiveRules(creature);

    // Step 2: Deliberative override attempt
    action = reactiveAction;
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
  }

  // Step 3: Execute the selected action
  creature.currentBehavior = action.behavior;
  let moved = executeAction(creature, action);
  _depleteLocomotionSubstrate(creature);
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

// ==================== EXPORTS ====================
export { runCreatureAI, updateDrives, _updateInWater,
         playerInTerritory, monInOwnTerritory,
         syncSwarmAI, mushroomPackAI, mushroomTouch,
         wanderInTerritory, moveMonsterToward, wanderMonster, moveMonsterTowardPlayer,
         enemyAct };
