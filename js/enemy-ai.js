// ==================== TURN MANAGEMENT + ENEMY AI ====================
// Drive-based creature AI. Every creature runs the same drive/behavior loop.
// Prompt I-A: drives tick, all creatures wander, adjacency combat only.
// Prompt I-B: safety drive + flee behavior. Threat detection, flee dispatch.

import { state, worlds, covers, monsters, groundItems } from './state.js';
import { DMG, LAYER_META, LAYER_SURFACE, getBodyMap, selectHitZone,
         MAX_BONUS_MOVE_CHANCE, MIN_ACTION_CHANCE, STAT_MAX, TURN_AGILITY_COEFF,
         facingSteps, checkNeuralDeath, getAvailableAttacks, hasLocomotion, checkSenseLoss,
         getPathways, computeBleedPenalty, computeStrikeDamage, SEEP_COEFF, CLOT_RATE, REGEN_FRACTION,
         BLOOD_DEATH_THRESHOLD, BURST_COEFF, BLOOD_CRITICAL_THRESHOLD,
         ARMOR_PER_STRUCTURAL_KG, getAttackDirection, getExposedZones, selectContactedZones,
         MASS_HUNGER_COEFF, NEURAL_HUNGER_COEFF, SAFETY_DECAY_RATE, REST_BASE_RATE,
         SAFETY_THRESHOLD, HUNGER_THRESHOLD, CHEMICAL_RANGE_MULT, VIBRATION_RANGE_MULT, VISUAL_RANGE_MULT,
         SAFETY_PROXIMITY_COEFF, SAFETY_DAMAGE_COEFF,
         CHASE_LEASH_BASE, CHASE_LEASH_HUNGER_MULT, MEAL_HUNGER_REDUCTION,
         BITE_MASS_FRACTION, GRAZE_HUNGER_REDUCTION, HERBIVORE_SAFETY_BONUS,
         FORAGE_SEARCH_RADIUS,
         REST_BLOOD_IMPAIRED, REST_BLOOD_WEAKENED, REST_BLOOD_CRITICAL, REST_WOUND_COEFF,
         REST_RECOVERY_NORMAL, REST_RECOVERY_WEAKENED, REST_RECOVERY_CRITICAL,
         REST_EATING_BONUS, REST_THRESHOLD } from './constants.js';
import { T, isWalkable, isFoodTile } from './terrain.js';
import { rand, randi, roll100 } from './rng.js';
import { playerDef, playerDodge, poisonResistance, passiveRegenInterval, restHealAmount, creatureViewRadius } from './player.js';
import { monAcc, monDodge, monDamage, monCritChance, monCritMult, WANDER_PROFILES, DEFAULT_WANDER_PROFILE } from './monsters.js';
import { inBounds, monsterAt, chebyshev, isTownCell, getCover } from './world-state.js';
import { log } from './log.js';
import { render } from './rendering.js';
import { endStealth, stealthDetectChance, rollHit } from './combat.js';
import { placeItem, generateItemId } from './ground-items.js';
import { fedDrainFor } from './player-actions.js';
import { advanceTick, getTimePhase } from './time-cycle.js';
import { saveGame } from './save-load.js';
import { updatePlayerFOV, hasLOS } from './fov.js';

// Forward references — set by main.js
let _onPlayerDeathCallback = null;
export function setOnPlayerDeathCallback(fn){ _onPlayerDeathCallback = fn; }
let _useActionCallback = null;
export function setUseActionCallback(fn){ _useActionCallback = fn; }

function monstersHere(){ return monsters[state.player.layer] || []; }

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

let turnCount = 0;

// ==================== AQUATIC MOVEMENT LOCK ====================
const WATER_TILES = new Set([T.WATER, T.DEEP_WATER, T.UWATER]);

function isWaterTile(layer, x, y){
  if (!inBounds(layer, x, y)) return false;
  return WATER_TILES.has(worlds[layer][y][x]);
}

/** True if this monster must stay on water tiles. */
function isWaterLocked(mon){
  return mon.tags && mon.tags.includes('aquatic') && mon.key !== 'cave_crab';
}

// ==================== CLADE B TERRITORY RADIUS ====================
/** True if this monster has a clade-based territory radius leash. */
function hasCladeTerritory(mon){
  return !!(mon.clade && mon.clade.territorial && mon.territoryRadius > 0);
}

/** True if position (nx, ny) would be outside this monster's territory radius. */
function wouldExceedTerritory(mon, nx, ny){
  if (!hasCladeTerritory(mon)) return false;
  return chebyshev(nx, ny, mon.homeX, mon.homeY) > mon.territoryRadius;
}

// ==================== ENEMY VISION ====================
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
  if (!canSeePlayerTile(mon)) return false;
  if (state.player.stealth){
    const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);
    if (d > 1){
      const chance = stealthDetectChance(mon);
      return roll100() <= chance;
    }
  }
  return true;
}

// ==================== DIRECTION SYSTEM ====================
// 8 directions, indexed 0-7 clockwise from north
const DIRECTION_DELTAS = [
  { x:  0, y: -1 },  // 0: N
  { x:  1, y: -1 },  // 1: NE
  { x:  1, y:  0 },  // 2: E
  { x:  1, y:  1 },  // 3: SE
  { x:  0, y:  1 },  // 4: S
  { x: -1, y:  1 },  // 5: SW
  { x: -1, y:  0 },  // 6: W
  { x: -1, y: -1 },  // 7: NW
];

/** Convert dx/dy to direction index 0-7. Returns nearest match. */
function dirFromDelta(dx, dy) {
  for (let i = 0; i < 8; i++) {
    if (DIRECTION_DELTAS[i].x === dx && DIRECTION_DELTAS[i].y === dy) return i;
  }
  // Fallback: find nearest
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < 8; i++) {
    const dot = DIRECTION_DELTAS[i].x * dx + DIRECTION_DELTAS[i].y * dy;
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  return best;
}

/** Euclidean distance between two points. */
function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Weighted random selection from an array of numeric weights. Returns index. */
function weightedRandomChoice(weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return randi(weights.length);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** True if tile at (x,y) is adjacent to (or is) a water tile. */
function isNearWater(x, y) {
  const layer = state.player.layer;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(layer, nx, ny) && WATER_TILES.has(worlds[layer][ny][nx])) return true;
    }
  }
  return false;
}

/** True if moving in direction `dir` from creature moves closer to target position. */
function movesCloserTo(dir, cx, cy, tx, ty) {
  const d = DIRECTION_DELTAS[dir];
  const nx = cx + d.x, ny = cy + d.y;
  return dist(nx, ny, tx, ty) < dist(cx, cy, tx, ty);
}

/** Direction index from (ax,ay) toward (bx,by). */
function directionToward(ax, ay, bx, by) {
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  if (dx === 0 && dy === 0) return randi(8);
  return dirFromDelta(dx, dy);
}

/** Check if a creature can move to a tile. */
function canMoveTo(mon, tx, ty) {
  const layer = state.player.layer;
  if (!inBounds(layer, tx, ty)) return false;
  const ground = worlds[layer][ty][tx];
  const cover = getCover(layer, tx, ty);
  if (!isWalkable(ground, cover)) return false;
  // Water-locked creatures can't leave water
  if (isWaterLocked(mon) && !WATER_TILES.has(ground)) return false;
  // Can't step on another monster
  if (monsterAt(tx, ty, layer)) return false;
  // Can't step on the player
  if (tx === state.player.x && ty === state.player.y) return false;
  // Territory radius check (clade-based)
  if (wouldExceedTerritory(mon, tx, ty)) return false;
  return true;
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

/** Select behavior based on drive priorities. */
function selectBehavior(creature) {
  const dominant = getDominantDrive(creature);

  switch (dominant.drive) {
    case 'safety': return 'flee';
    case 'hunger': return creature.diet === 'predator' ? 'hunt' : 'forage';
    case 'rest':   return 'rest';
    default: return 'wander';
  }
}

// ==================== THREAT DETECTION (I-B) ====================

/** Get the best transducer value for a sense type across all surviving zones. */
function getEffectiveSense(creature, senseType) {
  const bodyMap = getBodyMap(creature);
  if (!bodyMap) return 0;
  let best = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const val = (zone.transducers && zone.transducers[senseType]) || 0;
    if (val > best) best = val;
  }
  return best;
}

/** Compute detection range from creature's best sense × range multiplier. */
function getDetectionRange(creature) {
  const chemRange = getEffectiveSense(creature, 'chemical') * CHEMICAL_RANGE_MULT;
  const vibRange  = getEffectiveSense(creature, 'vibration') * VIBRATION_RANGE_MULT;
  const visRange  = getEffectiveSense(creature, 'visual') * VISUAL_RANGE_MULT;
  return Math.max(chemRange, vibRange, visRange);
}

/** Assess how threatening a target is to the creature. Returns 0 if not threatening. */
function assessThreatLevel(creature, target) {
  const creatureMass = creature.totalMass || 1;
  const targetBodyMap = getBodyMap(target);
  let targetMass = creatureMass; // default to same size
  if (targetBodyMap) {
    targetMass = 0;
    for (const zone of targetBodyMap) {
      if (!zone.destroyed) targetMass += zone.mass || 0;
    }
  } else if (target.totalMass) {
    targetMass = target.totalMass;
  }
  const massRatio = targetMass / creatureMass;

  // Herbivores: fear predators and large unknowns
  if (creature.diet === 'herbivore') {
    const targetDiet = target.diet || (target.isPlayer ? getPlayerDiet() : null);
    // Any predator is threatening — a 200 kg herbivore still notices a 22 kg predator.
    // Threat level scales with mass ratio but has a floor so small predators aren't ignored.
    if (targetDiet === 'predator') return Math.max(0.4, massRatio);
    // Large unknowns are threatening
    if (massRatio > 1.5) return massRatio * 0.5;
    return 0;
  }

  // Predators: fear significantly larger predators
  if (creature.diet === 'predator') {
    const targetDiet = target.diet || (target.isPlayer ? getPlayerDiet() : null);
    if (targetDiet === 'predator' && massRatio > 1.5) return massRatio;
    return 0;
  }

  return 0;
}

/** Helper: get the player's effective diet based on species. */
function getPlayerDiet() {
  const player = state.player;
  if (!player || !player.species) return null;
  // Herbivore species: grazer (hare), shaleback (cave_crab)
  const PLAYER_DIET_MAP = { grazer: 'herbivore', shaleback: 'herbivore' };
  return PLAYER_DIET_MAP[player.species] || 'predator';
}

/** Detect threats in range. Runs once per turn per creature. */
function detectThreats(creature) {
  const range = getDetectionRange(creature);
  const threats = [];

  // Check player
  const player = state.player;
  if (player && player.hp > 0) {
    const distToPlayer = dist(creature.x, creature.y, player.x, player.y);
    if (distToPlayer <= range) {
      const threatLevel = assessThreatLevel(creature, player);
      if (threatLevel > 0) {
        threats.push({
          source: player,
          distance: distToPlayer,
          threatLevel: threatLevel,
        });
      }
    }
  }

  // Check other creatures (predators as threats to herbivores and smaller predators)
  const mons = monstersHere();
  for (const other of mons) {
    if (other === creature) continue;
    if (other.hp <= 0) continue;

    const d = dist(creature.x, creature.y, other.x, other.y);
    if (d > range) continue;

    const threatLevel = assessThreatLevel(creature, other);
    if (threatLevel > 0) {
      threats.push({
        source: other,
        distance: d,
        threatLevel: threatLevel,
      });
    }
  }

  creature.detectedThreats = threats;
  return threats;
}

/** Spike safety based on detected threats. */
function applySafetyFromThreats(creature) {
  if (!creature.detectedThreats || creature.detectedThreats.length === 0) return;

  // Use the most threatening detected entity
  const worst = creature.detectedThreats.reduce((a, b) =>
    a.threatLevel > b.threatLevel ? a : b);

  if (worst.threatLevel <= 0) return;

  const range = getDetectionRange(creature);
  // Closer = scarier. At range boundary, mild spike. At adjacent, maximum spike.
  const proximity = 1.0 - (worst.distance / range);
  const spike = proximity * worst.threatLevel * SAFETY_PROXIMITY_COEFF;

  creature.drives.safety = Math.min(1.0, creature.drives.safety + spike);
  creature.threatSource = worst.source;
}

/** Spike safety when creature takes damage. Called from combat resolution. */
function applySafetyFromDamage(creature, damageAmount, attacker) {
  if (!creature.drives) return;
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

// ==================== FLEE SYSTEM (I-B) ====================

/** Direction index from (ax,ay) AWAY from (bx,by). */
function directionAwayFrom(ax, ay, bx, by) {
  // Direction toward, then reverse it
  const towardDir = directionToward(ax, ay, bx, by);
  return (towardDir + 4) % 8;
}

/** Find nearest water tile within bounded radius. Returns {x, y} or null. */
function findNearestWaterTile(sx, sy) {
  const layer = state.player.layer;
  const maxRadius = 25;
  for (let r = 1; r <= maxRadius; r++) {
    // Scan ring at distance r
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Only check tiles on the ring edge (Chebyshev distance == r)
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = sx + dx, ny = sy + dy;
        if (inBounds(layer, nx, ny) && WATER_TILES.has(worlds[layer][ny][nx])) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return null;
}

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

  // Try primary direction first, then +/- 1 (45° off), then +/- 2 (90° off)
  const candidates = [
    fleeDir,
    (fleeDir + 1) % 8,
    (fleeDir + 7) % 8,
    (fleeDir + 2) % 8,
    (fleeDir + 6) % 8,
  ];

  for (const dir of candidates) {
    const dx = DIRECTION_DELTAS[dir].x;
    const dy = DIRECTION_DELTAS[dir].y;
    const tx = creature.x + dx;
    const ty = creature.y + dy;

    if (canMoveTo(creature, tx, ty)) {
      creature.x = tx;
      creature.y = ty;
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
    const candidates = [awayDir, (awayDir + 1) % 8, (awayDir + 7) % 8, (awayDir + 2) % 8, (awayDir + 6) % 8];
    for (const dir of candidates) {
      const dx = DIRECTION_DELTAS[dir].x;
      const dy = DIRECTION_DELTAS[dir].y;
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      if (canMoveTo(creature, tx, ty) && isNearWater(tx, ty)) {
        creature.x = tx;
        creature.y = ty;
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
    const candidates = [waterDir, (waterDir + 1) % 8, (waterDir + 7) % 8];
    for (const dir of candidates) {
      const dx = DIRECTION_DELTAS[dir].x;
      const dy = DIRECTION_DELTAS[dir].y;
      const tx = creature.x + dx;
      const ty = creature.y + dy;
      if (canMoveTo(creature, tx, ty)) {
        creature.x = tx;
        creature.y = ty;
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
  const candidates = [homeDir, (homeDir + 1) % 8, (homeDir + 7) % 8];
  for (const dir of candidates) {
    const dx = DIRECTION_DELTAS[dir].x;
    const dy = DIRECTION_DELTAS[dir].y;
    const tx = creature.x + dx;
    const ty = creature.y + dy;
    if (canMoveTo(creature, tx, ty)) {
      creature.x = tx;
      creature.y = ty;
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

// ==================== PREY DETECTION (I-C) ====================

/** Get a creature's effective mass from surviving body zones. */
function getCreatureMass(entity) {
  const bodyMap = getBodyMap(entity);
  if (bodyMap) {
    let m = 0;
    for (const zone of bodyMap) {
      if (!zone.destroyed) m += zone.mass || 0;
    }
    return m;
  }
  return entity.totalMass || 1;
}

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

/** Detect prey within detection range. Predators only. */
function detectPrey(creature) {
  if (creature.diet !== 'predator') return;

  const range = getDetectionRange(creature);
  creature.detectedPrey = [];

  // Scan NPC creatures
  const mons = monstersHere();
  for (const other of mons) {
    if (other === creature) continue;
    if (other.hp <= 0) continue;

    const d = dist(creature.x, creature.y, other.x, other.y);
    if (d > range) continue;

    if (isViablePrey(creature, other)) {
      creature.detectedPrey.push({ target: other, distance: d });
    }
  }

  // Scan player
  const player = state.player;
  if (player && player.hp > 0) {
    const d = dist(creature.x, creature.y, player.x, player.y);
    if (d <= range && isViablePrey(creature, player)) {
      creature.detectedPrey.push({ target: player, distance: d });
    }
  }

  // Sort by distance (nearest first)
  creature.detectedPrey.sort((a, b) => a.distance - b.distance);
}

/** Detect corpses within detection range. Predators only. */
function detectCorpses(creature) {
  if (creature.diet !== 'predator') return;

  const range = getDetectionRange(creature);
  creature.detectedCorpses = [];

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
      if (d > range) continue;

      creature.detectedCorpses.push({
        target: item,
        distance: d,
        x: ix, y: iy,
      });
    }
  }

  creature.detectedCorpses.sort((a, b) => a.distance - b.distance);
}

// ==================== HUNT SYSTEM (I-C) ====================

/** Move in a direction with fallback to adjacent directions. */
function moveInDirection(creature, dir) {
  const candidates = [
    dir,
    (dir + 1) % 8,
    (dir + 7) % 8,
    (dir + 2) % 8,
    (dir + 6) % 8,
  ];
  for (const d of candidates) {
    const dx = DIRECTION_DELTAS[d].x;
    const dy = DIRECTION_DELTAS[d].y;
    const tx = creature.x + dx;
    const ty = creature.y + dy;
    if (canMoveTo(creature, tx, ty)) {
      creature.x = tx;
      creature.y = ty;
      if (creature.facing) {
        creature.facing.dx = dx;
        creature.facing.dy = dy;
      }
      return true;
    }
  }
  return false;
}

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

/** Get corpse at a specific position. */
function getCorpseAt(layer, x, y) {
  const items = groundItems[layer];
  if (!items) return null;
  const key = `${x},${y}`;
  const arr = items[key];
  if (!arr) return null;
  for (const item of arr) {
    if (item.kind === 'corpse' || item.type === 'corpse') return item;
  }
  return null;
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

/** Get adjacent prey (within 1 tile). Returns the smallest viable prey or null. */
function getAdjacentPrey(creature) {
  let best = null;
  let bestMass = Infinity;

  // Check NPC creatures
  const mons = monstersHere();
  for (const other of mons) {
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
      log(`The ${attacker.name} kills the ${defender.name}.`, 'muted');
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
      log(`The ${attacker.name} kills the ${defender.name}.`, 'muted');
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

/** Find the nearest food tile within search radius. Returns {x, y} or null. */
function findNearestFoodTile(cx, cy) {
  const layer = state.player.layer;
  const grid = worlds[layer];
  if (!grid) return null;

  for (let r = 0; r <= FORAGE_SEARCH_RADIUS; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(layer, nx, ny)) continue;
        const ground = grid[ny][nx];
        const cover = getCover(layer, nx, ny);
        if (isFoodTile(ground, cover)) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return null;
}

/** Check if tile at (x,y) is a food tile. */
function tileIsFood(x, y) {
  const layer = state.player.layer;
  if (!inBounds(layer, x, y)) return false;
  const ground = worlds[layer][y][x];
  const cover = getCover(layer, x, y);
  return isFoodTile(ground, cover);
}

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
  if (creature.key === 'cave_crab' || creature.key === 'hare' || creature.key === 'mushroom') return;

  // Creature with attacks is adjacent to player — attack
  monsterMelee(creature);
}

// ==================== UNIFIED AI LOOP ====================

/** Main AI entry point — called once per creature per turn. */
function runCreatureAI(creature) {
  if (creature.hp <= 0) return;

  // Immobilized creatures can't move but can still attack adjacently
  if (creature.immobilized) {
    updateDrives(creature);
    detectThreats(creature);
    applySafetyFromThreats(creature);
    adjacencyCombatCheck(creature);
    return;
  }

  // Update drives
  updateDrives(creature);

  // Threat detection (I-B)
  detectThreats(creature);
  applySafetyFromThreats(creature);

  // Prey and corpse detection (I-C)
  detectPrey(creature);
  detectCorpses(creature);

  // Select behavior
  const behavior = selectBehavior(creature);
  creature.currentBehavior = behavior;

  // Execute behavior
  let moved = false;
  switch (behavior) {
    case 'flee':   moved = executeFlee(creature); break;
    case 'hunt':   moved = executeHunt(creature); break;
    case 'forage': moved = executeForage(creature); break;
    case 'rest':   moved = executeRest(creature); break;
    case 'wander': executeWander(creature); break;
  }

  // Adjacency combat: skip if fleeing AND successfully moved away,
  // or if hunting (hunt handles its own combat).
  if (!(behavior === 'flee' && moved) && behavior !== 'hunt') {
    adjacencyCombatCheck(creature);
  }
}

// ==================== BONUS MOVE (relative speed system) ====================
// Called after all normal enemy actions for enemies with PTW ratio > player's.
// Movement only — no attacks. Uses current behavior's movement logic.
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

// ==================== END PLAYER TURN ====================

function endPlayerTurn(action){
  const player = state.player;
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

  // Enemies act — only on current layer, town cells are safe
  if (!isTownCell(state.player.layer)){
    const mons = monstersHere();
    // Phase 1: Each enemy takes its normal action (speed skip + AI)
    for (const m of mons){
      if (m.hp <= 0) continue;
      // Blood system — process monster bleed each turn
      if (processBleed(m, false)) {
        m.hp = 0;  // blood loss death
        continue;
      }

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
    // Phase 2: Each enemy that acted normally rolls for a bonus move (faster enemies only)
    for (const m of mons){
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
  render();
  saveGame();  // Auto-save after every player action
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

  const acc = monAcc(mon);
  const dodge = playerDodge(player);
  if (!rollHit(acc, dodge)){
    log(`${mon.name} misses.`, 'muted');
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
    if (crit) log(`${mon.name} CRITS — ${verb} your ${zn}! ${dmg} ${mon.dmgType}.`, 'crit');
    else log(`${mon.name} ${verb} your ${zn}. ${dmg} ${mon.dmgType}.`, 'dmg');
  } else if (contactedZones.length === 2) {
    const names = contactedZones.map(z => z.name).join(' and ');
    if (crit) log(`${mon.name} CRITS — ${verb} your ${names}! ${dmg} ${mon.dmgType}.`, 'crit');
    else log(`${mon.name}'s attack catches your ${names}. ${dmg} ${mon.dmgType}.`, 'dmg');
  } else if (contactedZones.length >= 3) {
    const last = contactedZones[contactedZones.length - 1].name;
    const rest = contactedZones.slice(0, -1).map(z => z.name).join(', ');
    if (crit) log(`${mon.name} CRITS — slams into your ${rest}, and ${last}! ${dmg} ${mon.dmgType}.`, 'crit');
    else log(`${mon.name} crashes into you — hits your ${rest}, and ${last}. ${dmg} ${mon.dmgType}.`, 'dmg');
  } else {
    if (crit) log(`${mon.name} CRITS — ${verb}! ${dmg} ${mon.dmgType}.`, 'crit');
    else log(`${mon.name} ${verb}. ${dmg} ${mon.dmgType}.`, 'dmg');
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
      if (stacks === 1) log('You are poisoned!', 'warn');
      else log(`Poison stacks! (×${stacks})`, 'warn');
    }
  }
  if (state.player.stealth) endStealth('Your cover is blown!');
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

    log(`Your ${hitZone.name} is destroyed!`, 'crit');

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
      log(`Something vital tears loose inside you. Everything stops.`, 'dead');
      state.player.hp = 0;
      state.player.deathCause = 'vital';
      return;
    }

    if (checkNeuralDeath(bodyMap)) {
      const headDestroyed = hitZone.key === 'head';
      if (headDestroyed) {
        log(`A flash of nothing. Then nothing.`, 'dead');
      } else {
        log(`Your limbs stop answering. The world blurs. Silence.`, 'dead');
      }
      state.player.hp = 0;
      state.player.deathCause = 'neural';
      return;
    }

    if (player.blood != null && player.blood <= player.bloodMax * BLOOD_DEATH_THRESHOLD) {
      log(`Everything narrows. Fades. Goes still.`, 'dead');
      state.player.hp = 0;
      state.player.deathCause = 'blood';
      return;
    }

    if (hitZone.locomotion && !hasLocomotion(bodyMap)) {
      state.player.immobilized = true;
      log(`You collapse, unable to move.`, 'warn');
    }

    if (hitZone.attacks && hitZone.attacks.length > 0) {
      for (const atk of hitZone.attacks) {
        log(`Your ${atk.name} is gone.`, 'warn');
      }
    }

    const senseLosses = checkSenseLoss(bodyMap, hitZone);
    for (const sl of senseLosses) {
      if (sl.type === 'lost') {
        log(`You can no longer ${sl.verb}.`, 'warn');
      } else {
        log(`Your ${sl.sense} weakens.`, 'muted');
      }
    }
  }
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
    summary.push({
      name: m.name,
      key: m.key,
      diet: m.diet,
      pos: `${m.x},${m.y}`,
      behavior: m.currentBehavior,
      hunger: m.drives.hunger.toFixed(3),
      safety: m.drives.safety.toFixed(3),
      rest: m.drives.rest.toFixed(3),
      prey: m.detectedPrey ? m.detectedPrey.length : 0,
      corpses: m.detectedCorpses ? m.detectedCorpses.length : 0,
      huntTarget: m.huntTarget ? (m.huntTarget.name || m.huntTarget.key || 'player') : null,
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

export { endPlayerTurn, enemyAct, monsterMelee, playerInTerritory, monInOwnTerritory,
         canSeePlayer, canSeePlayerTile, monsterViewRadius,
         syncSwarmAI, mushroomPackAI, mushroomTouch, wanderInTerritory, moveMonsterToward,
         wanderMonster, moveMonsterTowardPlayer,
         hasCladeTerritory, wouldExceedTerritory,
         isWaterLocked, isWaterTile, processBleed,
         applySafetyFromDamage,
         debugEcology, debugForceHunger };
