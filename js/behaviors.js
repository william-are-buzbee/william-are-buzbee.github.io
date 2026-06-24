// ==================== BEHAVIORS — Action Execution ====================
// What the creature physically does after a decision is made.
// Movement, combat, eating, resting, wandering.
// Split from enemy-ai.js — zero behavior change.

import { state, groundItems } from './state.js';
import { DMG, getBodyMap, getAvailableAttacks, selectHitZone,
         computeStrikeDamage, computeBleedPenalty, getPathways,
         checkNeuralDeath, hasLocomotion, checkSenseLoss,
         ARMOR_PER_STRUCTURAL_KG, getAttackDirection, getExposedZones, selectContactedZones,
         CHASE_LEASH_BASE, CHASE_LEASH_HUNGER_MULT, MEAL_HUNGER_REDUCTION,
         BITE_MASS_FRACTION, GRAZE_HUNGER_REDUCTION,
         REST_RECOVERY_NORMAL, REST_RECOVERY_WEAKENED, REST_RECOVERY_CRITICAL,
         REST_EATING_BONUS,
         BURST_COEFF, BLOOD_DEATH_THRESHOLD,
         SAFETY_DECAY_RATE } from './constants.js';
import { rand, randi, roll100 } from './rng.js';
import { monAcc, monDodge, monDamage, monCritChance, monCritMult, DEFAULT_WANDER_PROFILE } from './monsters.js';
import { chebyshev } from './world-state.js';
import { log, LOG_CATEGORIES } from './log.js';
import { endStealth, stealthDetectChance, rollHit } from './combat.js';
import { placeItem, generateItemId } from './ground-items.js';
import { playerDef, playerDodge, poisonResistance } from './player.js';
import { DIRECTION_DELTAS, dist, directionToward, directionAwayFrom,
         canMoveTo, moveInDirection, isNearWater, findNearestWaterTile,
         getCreatureMass, weightedRandomChoice, movesCloserTo,
         wouldExceedTerritory, hasCladeTerritory, tileIsFood,
         findNearestFoodTile, getCorpseAt } from './ai-utils.js';
import { getAdjacentPrey, isViablePrey, applySafetyFromDamage } from './detection.js';

// ==================== ACTION DISPATCHER (Prompt O) ====================
// Translates reactive/deliberative output into existing behavior functions.

function executeAction(creature, action) {
  let moved = false;
  switch (action.behavior) {
    case 'retaliate': {
      // Attack the target
      const target = action.target;
      if (target && target.isPlayer && chebyshev(creature.x, creature.y, target.x, target.y) <= 1) {
        monsterMelee(creature);
        moved = true;
      } else if (target && !target.isPlayer && chebyshev(creature.x, creature.y, target.x, target.y) <= 1) {
        performNPCAttack(creature, target);
        moved = true;
      }
      break;
    }
    case 'flee_refuge': {
      if (action.refugeType === 'water') {
        moved = executeFleeToWater(creature);
      } else if (action.refugeType === 'territory') {
        moved = executeFleeToHome(creature);
      } else {
        moved = executeStandardFlee(creature);
      }
      creature.currentBehavior = 'flee';
      break;
    }
    case 'flee': {
      // Ganglion direction fallback: if the ganglion system computed a flee
      // bearing but no threatSource entity is available (e.g. bolt reflex
      // from ambiguous signal), use moveInDirection with the ganglion bearing
      if (!creature.threatSource && action.direction != null) {
        moved = moveInDirection(creature, action.direction);
      } else {
        moved = executeFlee(creature);
      }
      creature.currentBehavior = 'flee';
      break;
    }
    case 'orient': {
      // Face toward the target without moving
      if (action.target && creature.facing) {
        creature.facing.dx = Math.sign(action.target.x - creature.x);
        creature.facing.dy = Math.sign(action.target.y - creature.y);
      } else if (action.direction != null && creature.facing) {
        // Ganglion system passes direction index — convert to facing vector
        const delta = DIRECTION_DELTAS[action.direction];
        if (delta) {
          creature.facing.dx = delta.x;
          creature.facing.dy = delta.y;
        }
      }
      creature.currentBehavior = 'wander'; // cosmetically wander
      break;
    }
    case 'hold': {
      // Stay still — do nothing
      creature.currentBehavior = 'rest';
      break;
    }
    case 'maintain_distance': {
      // Move perpendicular to or slightly away from the target.
      // Face the competitor while spacing — posturing, not fleeing.
      if (action.target) {
        const awayDir = directionAwayFrom(creature.x, creature.y,
                                          action.target.x, action.target.y);
        // Prefer perpendicular (90°), then angled away, then directly away
        const candidates = [
          (awayDir + 2) % 8,  // perpendicular right
          (awayDir + 6) % 8,  // perpendicular left
          (awayDir + 1) % 8,  // angled away right
          (awayDir + 7) % 8,  // angled away left
          awayDir,            // directly away (last resort)
        ];
        for (const dir of candidates) {
          const dx = DIRECTION_DELTAS[dir].x;
          const dy = DIRECTION_DELTAS[dir].y;
          const tx = creature.x + dx;
          const ty = creature.y + dy;
          if (canMoveTo(creature, tx, ty)) {
            creature.x = tx;
            creature.y = ty;
            creature.movedThisTurn = true;
            if (creature.facing) {
              // Face the competitor, not the movement direction
              creature.facing.dx = Math.sign(action.target.x - creature.x);
              creature.facing.dy = Math.sign(action.target.y - creature.y);
            }
            moved = true;
            break;
          }
        }
      }
      creature.currentBehavior = 'wander';
      break;
    }
    case 'attack_adjacent': {
      const target = action.target;
      if (target) {
        if (target.isPlayer && chebyshev(creature.x, creature.y, target.x, target.y) <= 1) {
          monsterMelee(creature);
        } else if (!target.isPlayer && chebyshev(creature.x, creature.y, target.x, target.y) <= 1) {
          performNPCAttack(creature, target);
        }
      }
      creature.currentBehavior = 'hunt';
      moved = true;
      break;
    }
    case 'eat_corpse': {
      const corpse = getCorpseAt(state.player.layer, creature.x, creature.y);
      if (corpse) eatCorpse(creature, corpse, creature.x, creature.y);
      creature.currentBehavior = 'hunt';
      break;
    }
    case 'graze': {
      executeGraze(creature);
      creature.currentBehavior = 'forage';
      break;
    }
    case 'approach_food': {
      // Move toward prey entity
      if (action.target) {
        const dir = directionToward(creature.x, creature.y, action.target.x, action.target.y);
        moved = moveInDirection(creature, dir);
      }
      creature.currentBehavior = 'hunt';
      break;
    }
    case 'approach_corpse': {
      if (action.corpse) {
        const dir = directionToward(creature.x, creature.y, action.corpse.x, action.corpse.y);
        moved = moveInDirection(creature, dir);
      }
      creature.currentBehavior = 'hunt';
      break;
    }
    case 'approach_food_tile': {
      if (action.target) {
        const dir = directionToward(creature.x, creature.y, action.target.x, action.target.y);
        moved = moveInDirection(creature, dir);
      }
      creature.currentBehavior = 'forage';
      break;
    }
    case 'forage_approach': {
      // Walk toward food at moderate speed (ganglion system output)
      if (action.direction != null) {
        moved = moveInDirection(creature, action.direction);
      }
      creature.currentBehavior = 'forage';
      break;
    }
    case 'return_home': {
      if (action.target) {
        const dir = directionToward(creature.x, creature.y, action.target.x, action.target.y);
        moved = moveInDirection(creature, dir);
      }
      creature.currentBehavior = 'wander';
      break;
    }
    case 'rest': {
      executeRest(creature);
      creature.currentBehavior = 'rest';
      break;
    }
    case 'hunt_attack': {
      if (action.target) {
        performHuntAttack(creature, action.target);
      }
      creature.currentBehavior = 'hunt';
      moved = true;
      break;
    }
    case 'hunt_chase': {
      if (action.target) {
        creature.huntTarget = action.target;
        const dir = directionToward(creature.x, creature.y, action.target.x, action.target.y);
        moved = moveInDirection(creature, dir);
      }
      creature.currentBehavior = 'hunt';
      break;
    }
    case 'wander':
    default: {
      // If ganglion system provided a specific direction, use it
      if (action.direction != null) {
        moved = moveInDirection(creature, action.direction);
        if (!moved) executeWander(creature); // fallback if blocked
      } else {
        executeWander(creature);
      }
      creature.currentBehavior = 'wander';
      break;
    }
  }
  return moved;
}

// ==================== FLEE SYSTEM (I-B) ====================

/** Standard flee: move away from threat source. Returns true if moved. */
function executeStandardFlee(creature) {
  const threat = creature.threatSource;
  if (!threat) {
    // Lost track of threat, accelerate safety decay and wander
    creature.drives.safety = Math.max(0, creature.drives.safety - SAFETY_DECAY_RATE * 3);
    executeWander(creature);
    return true; // wander counts as "doing something"
  }

  // Direction away from threat
  const fleeDir = directionAwayFrom(creature.x, creature.y, threat.x, threat.y);

  // Try primary direction first, then +/- 1 (45° off), then +/- 2 (90° off),
  // then +/- 3 (135° off) — steep angle fallback to slip around obstacles
  const candidates = [
    fleeDir,
    (fleeDir + 1) % 8,
    (fleeDir + 7) % 8,
    (fleeDir + 2) % 8,
    (fleeDir + 6) % 8,
    (fleeDir + 3) % 8,
    (fleeDir + 5) % 8,
  ];

  for (const dir of candidates) {
    const dx = DIRECTION_DELTAS[dir].x;
    const dy = DIRECTION_DELTAS[dir].y;
    const tx = creature.x + dx;
    const ty = creature.y + dy;

    if (canMoveTo(creature, tx, ty)) {
      creature.x = tx;
      creature.y = ty;
      creature.movedThisTurn = true;  // Prompt L-A
      if (creature.facing) {
        creature.facing.dx = dx;
        creature.facing.dy = dy;
      }
      return true;
    }
  }

  // Completely blocked — can't flee. Stay put.
  return false;
}

/** Flee toward water (large herbivore). Returns true if moved. */
function executeFleeToWater(creature) {
  const threat = creature.threatSource;

  // If already near water, move along water edge away from threat
  if (isNearWater(creature.x, creature.y)) {
    const awayDir = threat ? directionAwayFrom(creature.x, creature.y, threat.x, threat.y) : (creature.wander ? creature.wander.direction : 0);
    // Try directions near awayDir that keep us near water
    const candidates = [awayDir, (awayDir + 1) % 8, (awayDir + 7) % 8, (awayDir + 2) % 8, (awayDir + 6) % 8, (awayDir + 3) % 8, (awayDir + 5) % 8];
    for (const dir of candidates) {
      const dx = DIRECTION_DELTAS[dir].x;
      const dy = DIRECTION_DELTAS[dir].y;
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      if (canMoveTo(creature, tx, ty) && isNearWater(tx, ty)) {
        creature.x = tx;
        creature.y = ty;
        creature.movedThisTurn = true;  // Prompt L-A
        if (creature.facing) { creature.facing.dx = dx; creature.facing.dy = dy; }
        return true;
      }
    }
    // Can't move along water edge — try any water-adjacent tile
    for (const dir of candidates) {
      const dx = DIRECTION_DELTAS[dir].x;
      const dy = DIRECTION_DELTAS[dir].y;
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      if (canMoveTo(creature, tx, ty)) {
        creature.x = tx;
        creature.y = ty;
        creature.movedThisTurn = true;  // Prompt L-A
        if (creature.facing) { creature.facing.dx = dx; creature.facing.dy = dy; }
        return true;
      }
    }
    return false;
  }

  // Not near water — find nearest water and head toward it
  // Use cached result if available and recent
  if (!creature._cachedWater || creature._cachedWaterAge == null || creature._cachedWaterAge > 5) {
    creature._cachedWater = findNearestWaterTile(creature.x, creature.y);
    creature._cachedWaterAge = 0;
  }
  creature._cachedWaterAge = (creature._cachedWaterAge || 0) + 1;

  const nearestWater = creature._cachedWater;
  if (nearestWater) {
    const waterDir = directionToward(creature.x, creature.y, nearestWater.x, nearestWater.y);
    const candidates = [waterDir, (waterDir + 1) % 8, (waterDir + 7) % 8, (waterDir + 2) % 8, (waterDir + 6) % 8, (waterDir + 3) % 8, (waterDir + 5) % 8];
    for (const dir of candidates) {
      const dx = DIRECTION_DELTAS[dir].x;
      const dy = DIRECTION_DELTAS[dir].y;
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      if (canMoveTo(creature, tx, ty)) {
        creature.x = tx;
        creature.y = ty;
        creature.movedThisTurn = true;  // Prompt L-A
        if (creature.facing) { creature.facing.dx = dx; creature.facing.dy = dy; }
        return true;
      }
    }
  }

  // No water found or can't reach it — fall back to standard flee
  return executeStandardFlee(creature);
}

/** Flee toward home position (ambush predator). Returns true if moved. */
function executeFleeToHome(creature) {
  const home = creature.wanderProfile && creature.wanderProfile.homePosition;
  if (!home) {
    return executeStandardFlee(creature); // fallback if no home set
  }

  const distToHome = dist(creature.x, creature.y, home.x, home.y);

  // Already home — stop fleeing, drop safety faster
  if (distToHome <= 2) {
    creature.drives.safety = Math.max(0, creature.drives.safety - SAFETY_DECAY_RATE * 5);
    // Don't move — hold position at home
    return false;
  }

  // Head toward home
  const homeDir = directionToward(creature.x, creature.y, home.x, home.y);
  const candidates = [homeDir, (homeDir + 1) % 8, (homeDir + 7) % 8, (homeDir + 2) % 8, (homeDir + 6) % 8, (homeDir + 3) % 8, (homeDir + 5) % 8];
  for (const dir of candidates) {
    const dx = DIRECTION_DELTAS[dir].x;
    const dy = DIRECTION_DELTAS[dir].y;
    const tx = creature.x + dx;
    const ty = creature.y + dy;
    if (canMoveTo(creature, tx, ty)) {
      creature.x = tx;
      creature.y = ty;
      creature.movedThisTurn = true;  // Prompt L-A
      if (creature.facing) { creature.facing.dx = dx; creature.facing.dy = dy; }
      return true;
    }
  }

  // Can't reach home — standard flee
  return executeStandardFlee(creature);
}

/** Flee dispatcher — routes to specialized flee based on creature fleeMode. Returns true if moved. */
function executeFlee(creature) {
  if (creature.fleeMode === 'water') {
    return executeFleeToWater(creature);
  }
  if (creature.fleeMode === 'home') {
    return executeFleeToHome(creature);
  }
  // Default: standard flee (away from threat)
  return executeStandardFlee(creature);
}

// ==================== HUNT SYSTEM (I-C) ====================

/** Check if chase leash allows continued pursuit. */
function withinChaseLeash(creature, preyEntry) {
  const baseLeash = CHASE_LEASH_BASE;
  const hungerBonus = creature.drives.hunger * CHASE_LEASH_HUNGER_MULT;
  const maxChase = baseLeash + hungerBonus;
  return preyEntry.distance <= maxChase;
}

/** Select which prey to chase. Prefers existing target for consistency. */
function selectChaseTarget(creature) {
  // If we have an existing hunt target that's still detected, keep chasing it
  if (creature.huntTarget) {
    const existing = creature.detectedPrey.find(p => p.target === creature.huntTarget);
    if (existing) return existing;
    // Lost track of target — it fled out of range or died
    creature.huntTarget = null;
  }
  // Pick nearest prey
  return creature.detectedPrey[0] || null;
}

/** Chase detected prey. */
function chasePrey(creature) {
  const target = selectChaseTarget(creature);
  if (!target) return false;

  // Check chase leash
  if (!withinChaseLeash(creature, target)) {
    creature.huntTarget = null;
    return false; // give up, return to wander
  }

  creature.huntTarget = target.target; // remember what we're chasing

  // Move toward prey
  const dir = directionToward(creature.x, creature.y, target.target.x, target.target.y);
  return moveInDirection(creature, dir);
}

/** Remove a ground item from its tile. */
function removeGroundItem(layer, x, y, item) {
  const items = groundItems[layer];
  if (!items) return;
  const key = `${x},${y}`;
  const arr = items[key];
  if (!arr) return;
  const idx = arr.indexOf(item);
  if (idx !== -1) arr.splice(idx, 1);
  if (arr.length === 0) delete items[key];
}

/** Eat a corpse — reduces hunger and depletes corpse mass. */
function eatCorpse(creature, corpse, cx, cy) {
  const creatureMass = getCreatureMass(creature);
  const corpseMass = corpse.mass || corpse.nutrition || 1;

  // Hunger reduction proportional to corpse mass relative to predator mass
  const mealValue = (corpseMass / creatureMass) * MEAL_HUNGER_REDUCTION;
  creature.drives.hunger = Math.max(0, creature.drives.hunger - mealValue);

  // Eating aids recovery — reduce rest slightly (I-D)
  creature.drives.rest = Math.max(0, creature.drives.rest - REST_EATING_BONUS);

  // Deplete corpse
  const biteMass = creatureMass * BITE_MASS_FRACTION;
  corpse.mass = (corpse.mass || corpseMass) - biteMass;

  if (corpse.mass <= 0) {
    removeGroundItem(state.player.layer, cx, cy, corpse);
  }

  creature.huntTarget = null; // no longer hunting
}

/** Perform a hunt attack on a target (player or NPC). */
function performHuntAttack(creature, target) {
  if (target.isPlayer) {
    // Attack the player via existing monsterMelee
    monsterMelee(creature);
  } else {
    // NPC-on-NPC attack: use simplified combat
    performNPCAttack(creature, target);
  }
}

/** Simplified NPC-on-NPC combat. */
function performNPCAttack(attacker, defender) {
  const atkBodyMap = getBodyMap(attacker);
  if (!atkBodyMap) return;
  const attacks = getAvailableAttacks(atkBodyMap);
  if (attacks.length === 0) return;

  // Prompt L-A: mark both combatants
  attacker.inCombatThisTurn = true;
  defender.inCombatThisTurn = true;

  const usedAttack = attacks[randi(attacks.length)];
  const atkZone = atkBodyMap.find(z => z.key === usedAttack.sourceZone);

  // Compute damage from physics
  const dmg = computeStrikeDamage(attacker, atkZone);

  // Simple hit check based on stats
  const acc = monAcc(attacker);
  const dodge = monDodge(defender);
  if (!rollHit(acc, dodge)) return; // miss

  // Select hit zone on defender
  const defBodyMap = getBodyMap(defender);
  if (!defBodyMap) {
    // Fallback: direct HP damage
    defender.hp = Math.max(0, defender.hp - dmg);
    if (defender.hp <= 0) {
      log(`The ${attacker.name} kills the ${defender.name}.`, LOG_CATEGORIES.COMBAT);
      placeItem(state.player.layer, defender.x, defender.y, {
        id:       generateItemId(),
        kind:     'corpse',
        type:     'corpse',
        name:     `${defender.name} Corpse`,
        desc:     `${defender.name} Corpse — could be butchered or examined.`,
        sprite:   'CORPSE',
        weight:   2,
        quantity: 1,
        source:   defender.key,
        nutrition: defender.hpMax,
        mass:     defender.totalMass || 1,
      });
    }
    return;
  }

  const hitZone = selectHitZone(defBodyMap);
  if (!hitZone) return;

  // Apply zone armor
  const zoneArmor = (hitZone.structural || 0) * ARMOR_PER_STRUCTURAL_KG;
  const finalDmg = Math.max(1, dmg - zoneArmor);

  hitZone.hp = Math.max(0, (hitZone.hp || 0) - finalDmg);

  // Reset clotting on hit
  if (hitZone.clotting > 0) hitZone.clotting = 0;

  // Spike defender's safety
  applySafetyFromDamage(defender, finalDmg, attacker);

  // Zone destruction
  if (hitZone.hp <= 0 && !hitZone.destroyed) {
    hitZone.hp = 0;
    hitZone.destroyed = true;

    // Blood dump from destroyed zone
    if (defender.blood != null && defender.bloodMax > 0) {
      const dump = hitZone.bloodShare || 0;
      defender.blood -= dump;

      const pathways = getPathways(defender);
      let severedBandwidth = 0;
      for (const pw of pathways) {
        if (pw.from === hitZone.key || pw.to === hitZone.key) {
          severedBandwidth += pw.bandwidth;
        }
      }
      const burst = severedBandwidth * BURST_COEFF * defender.bloodMax;
      defender.blood -= burst;
      defender.blood = Math.max(0, defender.blood);
      defender.bleedPenalty = computeBleedPenalty(defender);
    }

    // Death checks
    if (hitZone.vital) {
      defender.hp = 0;
      defender.deathCause = 'vital';
    } else if (checkNeuralDeath(defBodyMap)) {
      defender.hp = 0;
      defender.deathCause = 'neural';
    } else if (defender.blood != null && defender.blood <= defender.bloodMax * BLOOD_DEATH_THRESHOLD) {
      defender.hp = 0;
      defender.deathCause = 'blood';
    }

    if (defender.hp <= 0) {
      log(`The ${attacker.name} kills the ${defender.name}.`, LOG_CATEGORIES.COMBAT);
      // Drop a corpse for the predator (or others) to eat
      placeItem(state.player.layer, defender.x, defender.y, {
        id:       generateItemId(),
        kind:     'corpse',
        type:     'corpse',
        name:     `${defender.name} Corpse`,
        desc:     `${defender.name} Corpse — could be butchered or examined.`,
        sprite:   'CORPSE',
        weight:   2,
        quantity: 1,
        source:   defender.key,
        nutrition: defender.hpMax,
        mass:     defender.totalMass || 1,
      });
    }

    // Locomotion check
    if (hitZone.locomotion && !hasLocomotion(defBodyMap)) {
      defender.immobilized = true;
    }
  }
}

/** Execute hunt behavior. */
function executeHunt(creature) {
  const layer = state.player.layer;

  // Priority 1: Eat a corpse if standing on one
  const corpseHere = getCorpseAt(layer, creature.x, creature.y);
  if (corpseHere) {
    eatCorpse(creature, corpseHere, creature.x, creature.y);
    return true; // stayed in place to eat, counts as action taken
  }

  // Priority 2: Attack adjacent prey
  const adjacentPrey = getAdjacentPrey(creature);
  if (adjacentPrey) {
    performHuntAttack(creature, adjacentPrey);
    return true;
  }

  // Priority 3: Move toward nearest corpse (free food)
  if (creature.detectedCorpses.length > 0) {
    const nearest = creature.detectedCorpses[0];
    const dir = directionToward(creature.x, creature.y, nearest.x, nearest.y);
    return moveInDirection(creature, dir);
  }

  // Priority 4: Chase detected prey
  if (creature.detectedPrey.length > 0) {
    return chasePrey(creature);
  }

  // Priority 5: No food detected — hungry wander
  executeWander(creature);
  return false;
}

// ==================== FORAGE SYSTEM (I-C) ====================

/** Execute graze — herbivore standing on food tile, reducing hunger. */
function executeGraze(creature) {
  creature.drives.hunger = Math.max(0, creature.drives.hunger - GRAZE_HUNGER_REDUCTION);
}

/** Execute forage behavior (herbivores). */
function executeForage(creature) {
  // If standing on a food tile, graze
  if (tileIsFood(creature.x, creature.y)) {
    executeGraze(creature);
    return true;
  }

  // Otherwise, move toward nearest food tile
  const nearestFood = findNearestFoodTile(creature.x, creature.y);
  if (nearestFood) {
    const dir = directionToward(creature.x, creature.y, nearestFood.x, nearestFood.y);
    return moveInDirection(creature, dir);
  }

  // No food detected — wander (looking for food)
  executeWander(creature);
  return false;
}

// ==================== REST SYSTEM (I-D) ====================

/** How fast the rest drive decreases while actively resting. Blood level determines recovery speed. */
function restRecoveryRate(creature) {
  if (creature.blood == null || creature.bloodMax == null || creature.bloodMax <= 0) {
    return REST_RECOVERY_NORMAL;
  }
  const bloodFraction = creature.blood / creature.bloodMax;
  if (bloodFraction <= 0.25) return REST_RECOVERY_CRITICAL;
  if (bloodFraction <= 0.50) return REST_RECOVERY_WEAKENED;
  return REST_RECOVERY_NORMAL;
}

/** Execute rest behavior — creature stops moving, rest drive decreases. */
function executeRest(creature) {
  // Apply rest recovery (rest drive decreases while resting)
  const recovery = restRecoveryRate(creature);
  creature.drives.rest = Math.max(0, creature.drives.rest - recovery);

  // Don't move. The creature stays in place. Facing doesn't change.
  // The existing bleed system handles blood regeneration and clotting per turn.
  return false; // did not move
}

// ==================== WANDER SYSTEM ====================

/** Pick a new wander direction with spatial biases. */
function pickWanderDirection(creature) {
  let weights = [1, 1, 1, 1, 1, 1, 1, 1];

  const profile = creature.wanderProfile;
  if (!profile) return randi(8);

  // Bias 1: Home range pull
  if (profile.homePosition && profile.homeRadius) {
    const hx = profile.homePosition.x, hy = profile.homePosition.y;
    const distFromHome = dist(creature.x, creature.y, hx, hy);

    if (distFromHome > profile.homeRadius * 0.6) {
      const urgency = Math.min(3, (distFromHome - profile.homeRadius * 0.6) / (profile.homeRadius * 0.4));
      const homeDir = directionToward(creature.x, creature.y, hx, hy);
      weights[homeDir] += 3 * urgency;
      weights[(homeDir + 1) % 8] += 1.5 * urgency;
      weights[(homeDir + 7) % 8] += 1.5 * urgency;
    }

    // Hard leash: beyond homeRadius, only allow directions toward home
    if (distFromHome > profile.homeRadius) {
      for (let i = 0; i < 8; i++) {
        if (!movesCloserTo(i, creature.x, creature.y, hx, hy)) {
          weights[i] = 0;
        }
      }
    }
  }

  // Bias 2: Water affinity
  if (profile.waterAffinity > 0) {
    for (let dir = 0; dir < 8; dir++) {
      const tx = creature.x + DIRECTION_DELTAS[dir].x;
      const ty = creature.y + DIRECTION_DELTAS[dir].y;
      if (isNearWater(tx, ty)) {
        weights[dir] += 3 * profile.waterAffinity;
      }
    }
  }

  // Bias 3: Forward preference (slight bias toward current direction)
  if (creature.wander) {
    const current = creature.wander.direction;
    weights[current] += 0.5;
    weights[(current + 1) % 8] += 0.3;
    weights[(current + 7) % 8] += 0.3;
  }

  return weightedRandomChoice(weights);
}

/** Execute one turn of wander behavior. */
function executeWander(creature) {
  if (!creature.wander) {
    // Safety init if wander state is missing
    const wp = creature.wanderProfile || DEFAULT_WANDER_PROFILE;
    const [minP, maxP] = wp.persistenceRange;
    creature.wander = {
      direction: randi(8),
      persistence: minP + randi(maxP - minP + 1),
      pauseTimer: 0,
    };
  }

  const profile = creature.wanderProfile || DEFAULT_WANDER_PROFILE;

  // 1. If paused, decrement and skip movement
  if (creature.wander.pauseTimer > 0) {
    creature.wander.pauseTimer--;
    return;
  }

  // 2. Check for spontaneous pause
  if (rand() < profile.pauseChance) {
    const [minPause, maxPause] = profile.pauseDuration;
    creature.wander.pauseTimer = minPause + randi(maxPause - minPause + 1);
    return;
  }

  // 3. Check for direction change
  let needsNewDirection = false;

  if (creature.wander.persistence <= 0) {
    needsNewDirection = true;
  } else if (rand() < profile.turnChance) {
    needsNewDirection = true;
  }

  if (needsNewDirection) {
    creature.wander.direction = pickWanderDirection(creature);
    const [minP, maxP] = profile.persistenceRange;
    creature.wander.persistence = minP + randi(maxP - minP + 1);
  }

  // 4. Try to move in the current direction
  const d = DIRECTION_DELTAS[creature.wander.direction];
  const targetX = creature.x + d.x;
  const targetY = creature.y + d.y;

  if (canMoveTo(creature, targetX, targetY)) {
    creature.x = targetX;
    creature.y = targetY;
    creature.movedThisTurn = true;  // Prompt L-A
    // Update facing on move
    if (creature.facing) {
      creature.facing.dx = d.x;
      creature.facing.dy = d.y;
    }
    creature.wander.persistence--;
  } else {
    // Blocked — pick a new direction immediately
    creature.wander.direction = pickWanderDirection(creature);
    const [minP, maxP] = profile.persistenceRange;
    creature.wander.persistence = minP + randi(maxP - minP + 1);
    // Don't move this turn (bumped into something, recalculating)
  }
}

// ==================== ADJACENCY COMBAT CHECK ====================

/** Proactive adjacency attack — predators attack if they wander next to the player. */
function adjacencyCombatCheck(creature) {
  const player = state.player;
  if (player.hp <= 0) return;

  // Only if adjacent to the player
  const d = chebyshev(creature.x, creature.y, player.x, player.y);
  if (d > 1) return;

  // Check if creature has proactive (non-defensive) attacks
  const monBodyMap = getBodyMap(creature);
  if (!monBodyMap) return;
  const attacks = getAvailableAttacks(monBodyMap);
  if (attacks.length === 0) return;

  // Herbivores don't attack proactively — only counter-attack when attacked.
  // cave_crab (large herbivore) has shove/kick which are defensive only.
  // hare (small herbivore) has no attacks at all.
  // mushroom uses enzyme touch, not standard melee.
  // Prompt K-B: herbivores that took damage this turn DO retaliate.
  if (creature.key === 'cave_crab' || creature.key === 'hare' || creature.key === 'mushroom') {
    if (!creature.tookDamageThisTurn) return;
  }

  // Creature with attacks is adjacent to player — attack
  monsterMelee(creature);
}

// ==================== MONSTER MELEE ====================

function monsterMelee(mon){
  const player = state.player;
  if (player.hp <= 0) return;

  // Check if monster has available attacks (zone destruction may have removed them)
  const monBodyMap = getBodyMap(mon);
  let availableAttacks = [];
  if (monBodyMap) {
    availableAttacks = getAvailableAttacks(monBodyMap);
    if (availableAttacks.length === 0) return;  // no attacks available
  }

  // Face the target when attacking
  if (mon.facing) {
    mon.facing.dx = Math.sign(player.x - mon.x);
    mon.facing.dy = Math.sign(player.y - mon.y);
  }

  // Prompt L-A: mark both combatants
  mon.inCombatThisTurn = true;
  player.inCombatThisTurn = true;

  const acc = monAcc(mon);
  const dodge = playerDodge(player);
  if (!rollHit(acc, dodge)){
    log(`${mon.name} misses.`, LOG_CATEGORIES.COMBAT);
    return;
  }
  let base = monDamage(mon) + randi(3);
  const crit = roll100() <= monCritChance(mon);
  if (crit) base = Math.floor(base * monCritMult(mon));
  const effDef = Math.max(0, playerDef(player));
  let dmg = Math.max(1, base - effDef);

  // ─── Footprint-based zone resolution on player ───
  const playerBodyMap = getBodyMap(player);
  let contactedZones = null;
  let usedAttack = null;
  let attackingZone = null;

  if (playerBodyMap && availableAttacks.length > 0) {
    usedAttack = availableAttacks[randi(availableAttacks.length)];
    attackingZone = monBodyMap.find(z => z.key === usedAttack.sourceZone);

    const defFacing = state.facing || { dx: 0, dy: 1 };
    const attackDir = getAttackDirection(
      { x: mon.x, y: mon.y },
      { x: player.x, y: player.y },
      defFacing
    );

    const exposedZones = getExposedZones(playerBodyMap, attackDir);

    if (exposedZones.length > 0 && attackingZone) {
      const footprintMod = usedAttack.footprintModifier || 0.3;
      const footprint = attackingZone.mass * footprintMod;
      const bodyDmgType = usedAttack.damageType || 'blunt';
      contactedZones = selectContactedZones(exposedZones, footprint, bodyDmgType);
    }
  }

  // Fallback: single zone selection
  if (!contactedZones || contactedZones.length === 0) {
    const fallbackZone = playerBodyMap ? selectHitZone(playerBodyMap) : null;
    contactedZones = fallbackZone ? [fallbackZone] : [];
  }

  state.player.hitFlash = 3;

  // Build log message with attack verb
  const atkName = usedAttack ? usedAttack.name.toLowerCase() : null;
  const dmgType = usedAttack ? usedAttack.damageType : (mon.dmgType || 'blunt');
  const verb = dmgType === 'puncture' ? (atkName === 'bite' ? 'bites' : atkName === 'hook' ? 'hooks' : 'pierces') :
               dmgType === 'slashing' ? (atkName === 'claw' ? 'claws' : 'rakes') :
               mon.dmgType === DMG.BLUNT ? 'crushes' :
               mon.dmgType === DMG.BLADE ? 'strikes' :
               mon.dmgType === DMG.POISON ? 'stings' : 'hits';

  if (contactedZones.length === 1) {
    const zn = contactedZones[0].name;
    if (crit) log(`${mon.name} ${verb} your ${zn} hard. ${dmg} ${mon.dmgType}.`, LOG_CATEGORIES.COMBAT);
    else log(`${mon.name} ${verb} your ${zn}. ${dmg} ${mon.dmgType}.`, LOG_CATEGORIES.COMBAT);
  } else if (contactedZones.length === 2) {
    const names = contactedZones.map(z => z.name).join(' and ');
    if (crit) log(`${mon.name} ${verb} deep into your ${names}. ${dmg} ${mon.dmgType}.`, LOG_CATEGORIES.COMBAT);
    else log(`${mon.name}'s attack catches your ${names}. ${dmg} ${mon.dmgType}.`, LOG_CATEGORIES.COMBAT);
  } else if (contactedZones.length >= 3) {
    const last = contactedZones[contactedZones.length - 1].name;
    const rest = contactedZones.slice(0, -1).map(z => z.name).join(', ');
    if (crit) log(`${mon.name} drives into your ${rest}, and ${last}. ${dmg} ${mon.dmgType}.`, LOG_CATEGORIES.COMBAT);
    else log(`${mon.name} crashes into your ${rest}, and ${last}. ${dmg} ${mon.dmgType}.`, LOG_CATEGORIES.COMBAT);
  } else {
    if (crit) log(`${mon.name} ${verb} with full force. ${dmg} ${mon.dmgType}.`, LOG_CATEGORIES.COMBAT);
    else log(`${mon.name} ${verb}. ${dmg} ${mon.dmgType}.`, LOG_CATEGORIES.COMBAT);
  }

  // ─── Distribute damage across contacted zones ───
  if (contactedZones.length > 0 && playerBodyMap && dmg > 0) {
    const totalContactedMass = contactedZones.reduce((sum, z) => sum + z.mass, 0);

    for (const zone of contactedZones) {
      const share = (totalContactedMass > 0) ? (zone.mass / totalContactedMass) : (1 / contactedZones.length);
      let zoneDmg = dmg * share;

      const zoneArmor = (zone.structural || 0) * ARMOR_PER_STRUCTURAL_KG;
      zoneDmg = Math.max(1, zoneDmg - zoneArmor);

      resolvePlayerZoneDamage(zone, zoneDmg, playerBodyMap);
    }
  }

  // Poison application
  if (mon.dmgType === DMG.POISON){
    const poisonResist = poisonResistance(player);
    const baseChance = 60;
    const poisonChance = Math.max(5, baseChance - poisonResist.chanceReduction);
    if (roll100() <= poisonChance){
      state.player.effects.push({
        type:'poison',
        turns: Math.max(2, 5 - Math.floor(poisonResist.durationReduction)),
        percentDmg: 0.03,
        flatDmg: 1,
      });
      const stacks = state.player.effects.filter(e => e.type === 'poison').length;
      if (stacks === 1) log('You are poisoned.', LOG_CATEGORIES.COMBAT);
      else log(`Poison stacks. (×${stacks})`, LOG_CATEGORIES.COMBAT);
    }
  }
  if (state.player.stealth) endStealth('Your cover is blown.');
}

// Resolve zone damage on the player.
function resolvePlayerZoneDamage(hitZone, dmg, bodyMap) {
  if (hitZone.hp == null) return;
  hitZone.hp = Math.max(0, hitZone.hp - dmg);

  if (hitZone.clotting > 0) {
    hitZone.clotting = 0;
  }

  if (hitZone.hp <= 0 && !hitZone.destroyed) {
    hitZone.hp = 0;
    hitZone.destroyed = true;

    log(`Your ${hitZone.name} is destroyed.`, LOG_CATEGORIES.COMBAT);

    const player = state.player;
    if (player.blood != null && player.bloodMax > 0) {
      const dump = hitZone.bloodShare || 0;
      player.blood -= dump;

      const pathways = getPathways(player);
      let severedBandwidth = 0;
      for (const pw of pathways) {
        if (pw.from === hitZone.key || pw.to === hitZone.key) {
          severedBandwidth += pw.bandwidth;
        }
      }
      const burst = severedBandwidth * BURST_COEFF * player.bloodMax;
      player.blood -= burst;

      player.blood = Math.max(0, player.blood);
      player.bleedPenalty = computeBleedPenalty(player);
    }

    // Death checks — vital → neural → blood
    if (hitZone.vital) {
      log(`Something vital tears loose inside you. Everything stops.`, LOG_CATEGORIES.COMBAT);
      state.player.hp = 0;
      state.player.deathCause = 'vital';
      return;
    }

    if (checkNeuralDeath(bodyMap)) {
      const headDestroyed = hitZone.key === 'head';
      if (headDestroyed) {
        log(`A flash of nothing. Then nothing.`, LOG_CATEGORIES.COMBAT);
      } else {
        log(`Your limbs stop answering. The world blurs. Silence.`, LOG_CATEGORIES.COMBAT);
      }
      state.player.hp = 0;
      state.player.deathCause = 'neural';
      return;
    }

    if (player.blood != null && player.blood <= player.bloodMax * BLOOD_DEATH_THRESHOLD) {
      log(`Everything narrows. Fades. Goes still.`, LOG_CATEGORIES.COMBAT);
      state.player.hp = 0;
      state.player.deathCause = 'blood';
      return;
    }

    if (hitZone.locomotion && !hasLocomotion(bodyMap)) {
      state.player.immobilized = true;
      log(`You collapse, unable to move.`, LOG_CATEGORIES.COMBAT);
    }

    if (hitZone.attacks && hitZone.attacks.length > 0) {
      for (const atk of hitZone.attacks) {
        log(`Your ${atk.name} is gone.`, LOG_CATEGORIES.COMBAT);
      }
    }

    const senseLosses = checkSenseLoss(bodyMap, hitZone);
    for (const sl of senseLosses) {
      if (sl.type === 'lost') {
        log(`You can no longer ${sl.verb}.`, LOG_CATEGORIES.COMBAT);
      } else {
        log(`Your ${sl.sense} weakens.`, LOG_CATEGORIES.COMBAT);
      }
    }
  }
}

// ==================== BONUS MOVE (DEPRECATED) ====================
// DEPRECATED: replaced by the AP action-point system in endPlayerTurn.
// No longer called by enemy-ai.js. Retained for backward compatibility with
// any external callers; safe to remove once all references are confirmed dead.
function performBonusMove(mon){
  if (mon.immobilized) return;
  if (mon.currentBehavior === 'rest') return; // resting creatures don't move
  // Bonus move respects current behavior for movement direction
  if (mon.currentBehavior === 'hunt' && mon.huntTarget) {
    const dir = directionToward(mon.x, mon.y, mon.huntTarget.x, mon.huntTarget.y);
    if (!moveInDirection(mon, dir)) executeWander(mon);
  } else if (mon.currentBehavior === 'flee') {
    executeFlee(mon);
  } else {
    executeWander(mon);
  }
}

export {
  executeAction,
  executeStandardFlee, executeFleeToWater, executeFleeToHome, executeFlee,
  withinChaseLeash, selectChaseTarget, chasePrey,
  removeGroundItem, eatCorpse, performHuntAttack, performNPCAttack, executeHunt,
  executeGraze, executeForage,
  restRecoveryRate, executeRest,
  pickWanderDirection, executeWander,
  adjacencyCombatCheck, monsterMelee,
  performBonusMove,
};
