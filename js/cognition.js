// ==================== COGNITION — Decision Architecture ====================
// The reactive-deliberative system. Takes detection info as input,
// produces a behavioral decision as output.
// Split from enemy-ai.js — zero behavior change.

import { state } from './state.js';
import { getBodyMap, getAvailableAttacks, computeStrikeDamage,
         DRIVE_COMPARE_THRESHOLD, PLANNING_THRESHOLD,
         SAFETY_THRESHOLD, HUNGER_THRESHOLD, REST_THRESHOLD,
         HERBIVORE_SAFETY_BONUS,
         OVERRIDE_SCALE, STIMULUS_RESISTANCE, CRITICAL_MAGNITUDE,
         REACTIVE_HUNGER_THRESHOLD,
         MIN_SEEK, SEEK_SCALE, PERSISTENCE_SCALE,
         ASSESS_INTEGRATION_THRESHOLD,
         DIET_DECISION_THRESHOLD } from './constants.js';
import { chebyshev } from './world-state.js';
import { dist, getCreatureMass, findNearestWaterTile, findNearestFoodTile,
         tileIsFood, getCorpseAt } from './ai-utils.js';
import { getDominantSenseChannel, getAdjacentPrey } from './detection.js';

// ==================== COGNITIVE TIER SYSTEM (Prompt M-A1) ====================
// Integration capacity = total mass of integration-dedicated neural tissue across
// all surviving zones. Tier is derived from capacity vs two thresholds.
// Recomputed each turn so zone destruction updates tier in real time.

function computeIntegrationCapacity(creature) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return 0;
  let total = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;            // destroyed zone contributes nothing
    const neuralMass = zone.neural || 0;     // kg of neural tissue in this zone
    const integrationFrac = (zone.neuralAllocation && zone.neuralAllocation.integration) || 0;
    total += neuralMass * integrationFrac;
  }
  return total;
}

function getTier(integrationCapacity) {
  if (integrationCapacity >= PLANNING_THRESHOLD) return 3;
  if (integrationCapacity >= DRIVE_COMPARE_THRESHOLD) return 2;
  return 1;
}

// ==================== PHYSICAL QUERY FUNCTIONS (Prompt O) ====================
// Universal helpers called by reactive rules. Each reads from body map,
// detection results, and game state. No per-species profiles.

/** What weapons does this body have? */
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

/** Does movement compromise the creature's dominant sense? */
function movementCompromisesSense(creature) {
  const dominant = getDominantSenseChannel(creature);
  // Ground vibration: own footsteps create noise in the listening channel AND emit detectable signal
  return dominant.type === 'groundVibration';
}

/** Find nearest refuge. */
function findRefuge(creature) {
  // Water refuge
  if (creature.canEnterWater) {
    const water = findNearestWaterTile(creature.x, creature.y);
    if (water) return { type: 'water', target: water };
  }
  // Territory/home refuge
  const home = creature.wanderProfile && creature.wanderProfile.homePosition;
  if (home && creature.territoryRadius > 0) {
    const d = dist(creature.x, creature.y, home.x, home.y);
    if (d > 2) return { type: 'territory', target: home };
  }
  return { type: 'none', target: null };
}

/** Is this creature hungry enough for reactive food rules? */
function isReactivelyHungry(creature) {
  return creature.drives && creature.drives.hunger > REACTIVE_HUNGER_THRESHOLD;
}

/** Blood state category. */
function getBloodState(creature) {
  if (creature.blood == null || creature.bloodMax == null || creature.bloodMax <= 0) return 'healthy';
  const ratio = creature.blood / creature.bloodMax;
  if (ratio <= 0.25) return 'critical';
  if (ratio <= 0.50) return 'impaired';
  return 'healthy';
}

// ==================== DRIVE COMPARISON ====================

/** Get the dominant active drive. Highest urgency above threshold wins. */
function getDominantDrive(creature) {
  const drives = creature.drives;
  const active = [];

  if (drives.safety > SAFETY_THRESHOLD) {
    let safetyUrgency = drives.safety;
    // Herbivores weigh safety more heavily — survival over food
    if (creature.diet === 'herbivore') {
      safetyUrgency += HERBIVORE_SAFETY_BONUS;
    }
    active.push({ drive: 'safety', urgency: safetyUrgency });
  }
  if (drives.hunger > HUNGER_THRESHOLD) {
    active.push({ drive: 'hunger', urgency: drives.hunger });
  }
  if (drives.rest > REST_THRESHOLD) {
    active.push({ drive: 'rest', urgency: drives.rest });
  }

  if (active.length === 0) return { drive: 'none', urgency: 0 };

  // Highest urgency wins; ties favor safety
  active.sort((a, b) => {
    if (b.urgency !== a.urgency) return b.urgency - a.urgency;
    return a.drive === 'safety' ? -1 : 1;
  });
  return active[0];
}

// ==================== UNIVERSAL REACTIVE RULE SET (Prompt O) ====================
// Evaluated in priority order. First matching rule fires.
// Every creature runs the same rules — body differences produce behavioral differences.

function evaluateReactiveRules(creature) {
  const cc = combatCapability(creature);
  const diet = creature.diet || 'predator';
  const bState = getBloodState(creature);
  const refuge = findRefuge(creature);
  const hungry = isReactivelyHungry(creature);
  const detections = creature.detectionInfo || [];

  // Find adjacent entities
  const adjacentDetections = detections.filter(d => d.distance <= 1.5);
  // Find nearby entities (short range, 3-5 tiles)
  const nearbyDetections = detections.filter(d => d.distance <= 5);

  // Was there damage from an undetected source (ambush)?
  let ambushed = false;
  if (creature.tookDamageThisTurn && creature.threatSource) {
    const sourceDetected = detections.find(d => d.entity === creature.threatSource);
    // If source was not detected BEFORE the damage, it's an ambush
    // Approximate: if creature didn't have the source in prior detections, treat as ambush
    if (!sourceDetected) ambushed = true;
  }

  // Torso damage this turn
  let torsoCritical = false;
  if (creature.tookDamageThisTurn) {
    const bodyMap = getBodyMap(creature);
    if (bodyMap) {
      const torso = bodyMap.find(z => z.vital && !z.destroyed);
      if (torso && torso.maxHp > 0 && torso.hp < torso.maxHp * 0.5) {
        torsoCritical = true;
      }
    }
  }

  // Blood crossed critical this turn?
  const bloodCrossedCritical = creature.tookDamageThisTurn && bState === 'critical';

  // RULE 1 — CRITICAL EMERGENCY
  if ((ambushed || bloodCrossedCritical || torsoCritical) && creature.tookDamageThisTurn) {
    // Adjacent attacker and can fight → retaliate
    if (cc.canFight && creature.threatSource &&
        chebyshev(creature.x, creature.y, creature.threatSource.x, creature.threatSource.y) <= 1) {
      return { behavior: 'retaliate', magnitude: 0.9, target: creature.threatSource };
    }
    // Flee toward refuge or away from damage source
    if (refuge.type !== 'none') {
      return { behavior: 'flee_refuge', magnitude: 0.9, target: refuge.target, refugeType: refuge.type };
    }
    return { behavior: 'flee', magnitude: 0.9 };
  }

  // RULE 2 — DAMAGE RESPONSE
  if (creature.tookDamageThisTurn) {
    if (!cc.canFight) {
      if (refuge.type !== 'none') {
        return { behavior: 'flee_refuge', magnitude: 0.7, target: refuge.target, refugeType: refuge.type };
      }
      return { behavior: 'flee', magnitude: 0.7 };
    }
    if (creature.threatSource &&
        chebyshev(creature.x, creature.y, creature.threatSource.x, creature.threatSource.y) <= 1) {
      if (bState === 'critical') {
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.7, target: refuge.target, refugeType: refuge.type };
        }
        return { behavior: 'flee', magnitude: 0.7 };
      }
      return { behavior: 'retaliate', magnitude: 0.7, target: creature.threatSource };
    }
    // Attacker not adjacent — disengage
    if (refuge.type !== 'none') {
      return { behavior: 'flee_refuge', magnitude: 0.7, target: refuge.target, refugeType: refuge.type };
    }
    return { behavior: 'flee', magnitude: 0.7 };
  }

  // RULE 3 — ADJACENT THREAT
  for (const det of adjacentDetections) {
    const size = det.sizeRelative || 'unknown';
    if (size === 'larger' || size === 'much_larger') {
      const isMovingOrPredator = det.isMoving || det.dietType === 'predator';
      if (isMovingOrPredator || size === 'much_larger') {
        if (!cc.canFight) {
          if (refuge.type !== 'none') {
            return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
          }
          return { behavior: 'flee', magnitude: 0.6 };
        }
        // Can fight but has escape route
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
        }
        // Cornered — fight
        return { behavior: 'retaliate', magnitude: 0.6, target: det.entity };
      }
    }
    // Ambiguous size — could be larger or smaller
    if (size === 'ambiguous') {
      if (diet === 'herbivore') {
        // Herbivores treat ambiguity as potentially larger — flee
        if (!cc.canFight) {
          if (refuge.type !== 'none') {
            return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
          }
          return { behavior: 'flee', magnitude: 0.6 };
        }
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.6, target: refuge.target, refugeType: refuge.type };
        }
        return { behavior: 'retaliate', magnitude: 0.6, target: det.entity };
      }
      // Predators treat ambiguous as caution — orient, don't commit
      if (cc.canFight) {
        return { behavior: 'orient', magnitude: 0.6, target: det.entity };
      }
    }
    // Similar size — orient toward (face potential threat)
    if (size === 'similar' && cc.canFight) {
      return { behavior: 'orient', magnitude: 0.6, target: det.entity };
    }
  }

  // RULE 4 — NEARBY STRONG SIGNAL
  for (const det of nearbyDetections) {
    if (det.distance <= 1.5) continue; // already handled by Rule 3
    const size = det.sizeRelative || 'unknown';
    if (size === 'larger' || size === 'much_larger' || size === 'unknown' || size === 'ambiguous') {
      const isStrong = det.isMoving !== false; // moving or unknown movement = strong signal
      if (!isStrong && size !== 'unknown' && size !== 'ambiguous') continue;

      if (diet === 'herbivore') {
        if (refuge.type !== 'none') {
          return { behavior: 'flee_refuge', magnitude: 0.5, target: refuge.target, refugeType: refuge.type };
        }
        return { behavior: 'flee', magnitude: 0.5 };
      }
      if (diet === 'predator') {
        if (size === 'much_larger') {
          return { behavior: 'hold', magnitude: 0.5 };
        }
        // Ambiguous or larger: orient cautiously, don't commit
        return { behavior: 'orient', magnitude: 0.5, target: det.entity };
      }
    }
  }

  // RULE 5 — ADJACENT PREY / FOOD
  if (diet === 'predator' && cc.canFight && hungry) {
    for (const det of adjacentDetections) {
      const size = det.sizeRelative || 'unknown';
      if (size === 'smaller' || size === 'much_smaller') {
        return { behavior: 'attack_adjacent', magnitude: 0.3, target: det.entity };
      }
    }
    // Also check for corpse at current position
    const corpseHere = getCorpseAt(state.player.layer, creature.x, creature.y);
    if (corpseHere) {
      return { behavior: 'eat_corpse', magnitude: 0.3 };
    }
  }
  if (diet === 'herbivore' && hungry) {
    if (tileIsFood(creature.x, creature.y)) {
      return { behavior: 'graze', magnitude: 0.3 };
    }
  }

  // RULE 6 — NEARBY FOOD
  if (diet === 'predator' && cc.canFight && hungry) {
    // Check detected smaller entities within 4 tiles
    for (const det of detections) {
      if (det.distance > 4) continue;
      const size = det.sizeRelative || 'unknown';
      if (size === 'smaller' || size === 'much_smaller') {
        return { behavior: 'approach_food', magnitude: 0.2, target: det.entity };
      }
    }
    // Check for nearby corpses
    if (creature.detectedCorpses && creature.detectedCorpses.length > 0) {
      const nearCorpse = creature.detectedCorpses.find(c => c.distance <= 4);
      if (nearCorpse) {
        return { behavior: 'approach_corpse', magnitude: 0.2, corpse: nearCorpse };
      }
    }
  }
  if (diet === 'herbivore' && hungry) {
    const nearFood = findNearestFoodTile(creature.x, creature.y);
    if (nearFood && dist(creature.x, creature.y, nearFood.x, nearFood.y) <= 3) {
      return { behavior: 'approach_food_tile', magnitude: 0.2, target: nearFood };
    }
  }

  // RULE 7 — TERRITORY RETURN
  const home = creature.wanderProfile && creature.wanderProfile.homePosition;
  if (home && creature.territoryRadius > 0) {
    if (dist(creature.x, creature.y, home.x, home.y) > creature.territoryRadius) {
      return { behavior: 'return_home', magnitude: 0.2, target: home };
    }
  }

  // RULE 8 — REST
  if ((bState === 'impaired' || bState === 'critical') &&
      nearbyDetections.filter(d => {
        const sz = d.sizeRelative || 'unknown';
        return sz === 'larger' || sz === 'much_larger' || sz === 'unknown' || sz === 'ambiguous';
      }).length === 0) {
    return { behavior: 'rest', magnitude: 0.2 };
  }

  // RULE 9 — DEFAULT BEHAVIOR
  if (movementCompromisesSense(creature)) {
    return { behavior: 'hold', magnitude: 0.1 };
  }
  return { behavior: 'wander', magnitude: 0.1 };
}

// ==================== DELIBERATIVE OVERRIDE (Prompt O) ====================
// After reactive layer produces a recommendation, the deliberative layer
// attempts to override it based on integration capacity.

function canOverrideReactive(creature, reactiveMagnitude) {
  // Critical stimuli bypass deliberation regardless of integration
  if (reactiveMagnitude >= CRITICAL_MAGNITUDE) return false;

  const overrideCapacity = creature.integrationCapacity * OVERRIDE_SCALE;
  const threshold = reactiveMagnitude * STIMULUS_RESISTANCE;
  if (threshold <= 0) return true;

  // Probabilistic override: ratio of capacity to threshold = probability of success.
  // This models the signal race: higher integration = faster suppression signal,
  // but even low-integration creatures occasionally manage it for weaker stimuli.
  const ratio = overrideCapacity / threshold;
  if (ratio >= 1.0) return true;
  if (ratio <= 0) return false;
  return Math.random() < ratio;
}

/** Run deliberative evaluation when override succeeds. */
function deliberativeEvaluation(creature) {
  // Compare drive urgencies (existing drive comparison)
  const dominant = getDominantDrive(creature);
  const detections = creature.detectionInfo || [];

  // Compute deliberative seeking range
  const seekRange = MIN_SEEK + creature.integrationCapacity * SEEK_SCALE;

  switch (dominant.drive) {
    case 'safety': {
      // Deliberative safety: evaluate threat using full detection info
      // If threat has assessment 'weaker', suppress flee
      for (const det of detections) {
        if (det.threatAssessment === 'weaker' && det.distance > 2) {
          // Threat is assessed as weaker — hold ground or ignore
          return { behavior: 'wander', fromDeliberate: true };
        }
      }
      return { behavior: 'flee', fromDeliberate: true };
    }
    case 'hunger': {
      if (creature.diet === 'predator') {
        // Deliberative hunting: long-range pursuit with full info
        // Check for corpses first
        const corpseHere = getCorpseAt(state.player.layer, creature.x, creature.y);
        if (corpseHere) return { behavior: 'eat_corpse', fromDeliberate: true };

        // Check for adjacent prey
        const adjPrey = getAdjacentPrey(creature);
        if (adjPrey) return { behavior: 'hunt_attack', target: adjPrey, fromDeliberate: true };

        // Seek detected prey within deliberative range
        if (creature.detectedCorpses && creature.detectedCorpses.length > 0) {
          const nearest = creature.detectedCorpses[0];
          if (nearest.distance <= seekRange) {
            return { behavior: 'approach_corpse', corpse: nearest, fromDeliberate: true };
          }
        }
        if (creature.detectedPrey && creature.detectedPrey.length > 0) {
          // Use fight assessment if available to avoid costly fights
          for (const prey of creature.detectedPrey) {
            if (prey.distance > seekRange) continue;
            // Find detection info for this prey
            const pInfo = detections.find(d => d.entity === prey.target);
            if (pInfo && pInfo.threatAssessment === 'overwhelming') continue; // skip dangerous targets
            if (pInfo && pInfo.threatAssessment === 'stronger') continue;      // too risky
            // Require minimum diet confidence before committing to a hunt (Prompt P)
            if (pInfo && pInfo.dietConfidence < DIET_DECISION_THRESHOLD) continue;
            return { behavior: 'hunt_chase', target: prey.target, fromDeliberate: true };
          }
        }
        // No viable prey — wander
        return { behavior: 'wander', fromDeliberate: true };
      } else {
        // Deliberative foraging: seek food at range
        if (tileIsFood(creature.x, creature.y)) {
          return { behavior: 'graze', fromDeliberate: true };
        }
        const nearestFood = findNearestFoodTile(creature.x, creature.y);
        if (nearestFood) {
          const foodDist = dist(creature.x, creature.y, nearestFood.x, nearestFood.y);
          if (foodDist <= seekRange) {
            return { behavior: 'approach_food_tile', target: nearestFood, fromDeliberate: true };
          }
        }
        return { behavior: 'wander', fromDeliberate: true };
      }
    }
    case 'rest':
      return { behavior: 'rest', fromDeliberate: true };
    default:
      return { behavior: 'wander', fromDeliberate: true };
  }
}

// ==================== GOAL PERSISTENCE (Prompt O) ====================
// Deliberative goals expire if target leaves detection for too long.

function updateGoalPersistence(creature) {
  if (!creature.huntTarget) {
    creature._goalLostTurns = 0;
    return;
  }
  // Check if hunt target is still detected
  const detections = creature.detectionInfo || [];
  const found = detections.find(d => d.entity === creature.huntTarget);
  if (found) {
    creature._goalLostTurns = 0;
  } else {
    creature._goalLostTurns = (creature._goalLostTurns || 0) + 1;
    const maxPersistence = Math.max(1, Math.round(creature.integrationCapacity * PERSISTENCE_SCALE));
    if (creature._goalLostTurns > maxPersistence) {
      creature.huntTarget = null;
      creature._goalLostTurns = 0;
    }
  }
}

// ==================== DEBUG: RULE LABEL MAPPER ====================
// Maps reactive action outputs back to human-readable rule names.
const _RULE_LABELS = {
  // magnitude 0.9 — Rule 1
  'retaliate:0.9': 'R1 CRITICAL retaliate',
  'flee_refuge:0.9': 'R1 CRITICAL flee_refuge',
  'flee:0.9': 'R1 CRITICAL flee',
  // magnitude 0.7 — Rule 2
  'retaliate:0.7': 'R2 DAMAGE retaliate',
  'flee_refuge:0.7': 'R2 DAMAGE flee_refuge',
  'flee:0.7': 'R2 DAMAGE flee',
  // magnitude 0.6 — Rule 3
  'retaliate:0.6': 'R3 ADJ_THREAT retaliate',
  'flee_refuge:0.6': 'R3 ADJ_THREAT flee_refuge',
  'flee:0.6': 'R3 ADJ_THREAT flee',
  'orient:0.6': 'R3 ADJ_THREAT orient',
  // magnitude 0.5 — Rule 4
  'flee_refuge:0.5': 'R4 NEARBY_STRONG flee',
  'flee:0.5': 'R4 NEARBY_STRONG flee',
  'hold:0.5': 'R4 NEARBY_STRONG hold',
  'orient:0.5': 'R4 NEARBY_STRONG orient',
  // magnitude 0.3 — Rule 5
  'attack_adjacent:0.3': 'R5 ADJ_FOOD attack',
  'eat_corpse:0.3': 'R5 ADJ_FOOD eat_corpse',
  'graze:0.3': 'R5 ADJ_FOOD graze',
  // magnitude 0.2 — Rule 6/7/8
  'approach_food:0.2': 'R6 NEARBY_FOOD approach',
  'approach_corpse:0.2': 'R6 NEARBY_FOOD corpse',
  'approach_food_tile:0.2': 'R6 NEARBY_FOOD forage',
  'return_home:0.2': 'R7 TERRITORY return',
  'rest:0.2': 'R8 REST rest',
  // magnitude 0.1 — Rule 9
  'hold:0.1': 'R9 DEFAULT hold',
  'wander:0.1': 'R9 DEFAULT wander',
};

function _ruleLabel(action) {
  const key = action.behavior + ':' + action.magnitude;
  return _RULE_LABELS[key] || ('R? ' + action.behavior + ' @' + action.magnitude);
}

export {
  computeIntegrationCapacity, getTier,
  combatCapability, movementCompromisesSense, findRefuge,
  isReactivelyHungry, getBloodState,
  getDominantDrive,
  evaluateReactiveRules,
  canOverrideReactive, deliberativeEvaluation,
  updateGoalPersistence,
  _RULE_LABELS, _ruleLabel,
};
