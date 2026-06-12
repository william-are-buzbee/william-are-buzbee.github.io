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

// Forward references — set by main.js
let _onPlayerDeathCallback = null;
export function setOnPlayerDeathCallback(fn){ _onPlayerDeathCallback = fn; }
let _useActionCallback = null;
export function setUseActionCallback(fn){ _useActionCallback = fn; }

function monstersHere(){ return monsters[state.player.layer] || []; }

// ==================== SPATIAL HASH GRID (Prompt R) ====================
// Eliminates N² creature-vs-creature detection cost.  The grid partitions
// the map into SPATIAL_CELL_SIZE-wide cells.  Each detection query checks
// only the (2·SPATIAL_QUERY_RADIUS+1)² cells around the observer.
// Rebuilt once per turn before any detection runs.  Transient — never saved.

const _spatialGrid = new Map();   // "cellX,cellY" → creature[]

/** Clear and rebuild the spatial grid from the given creature list (or all living creatures on the active layer). */
function rebuildSpatialGrid(creatureList) {
  _spatialGrid.clear();
  const mons = creatureList || monstersHere();
  for (let i = 0; i < mons.length; i++) {
    const creature = mons[i];
    if (creature.hp <= 0) continue;
    const cx = Math.floor(creature.x / SPATIAL_CELL_SIZE);
    const cy = Math.floor(creature.y / SPATIAL_CELL_SIZE);
    const key = cx + ',' + cy;
    let cell = _spatialGrid.get(key);
    if (!cell) {
      cell = [];
      _spatialGrid.set(key, cell);
    }
    cell.push(creature);
  }
}

/**
 * Return all living creatures near (x, y) within SPATIAL_QUERY_RADIUS cells.
 * The result is a superset of creatures within detection range — the actual
 * per-zone detection still applies exact distance checks.
 */
function getNearbyCreatures(x, y) {
  const results = [];
  const centerCX = Math.floor(x / SPATIAL_CELL_SIZE);
  const centerCY = Math.floor(y / SPATIAL_CELL_SIZE);
  const r = SPATIAL_QUERY_RADIUS;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const key = (centerCX + dx) + ',' + (centerCY + dy);
      const cell = _spatialGrid.get(key);
      if (cell) {
        for (let i = 0; i < cell.length; i++) {
          results.push(cell[i]);
        }
      }
    }
  }
  return results;
}

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
  // Prompt K-B: water tiles are passable for creatures with canEnterWater
  if (WATER_TILES.has(ground)) {
    if (mon.canEnterWater !== true) return false;
    // Water creature still needs cover to be walkable (if any)
    if (cover) {
      const ci = terrainInfo(cover);
      if (!ci.walk) return false;
    }
  } else {
    if (!isWalkable(ground, cover)) return false;
  }
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

// ==================== TIER 1 — REACTIVE BEHAVIOR SELECTION (Prompt M-A2) ====================
// Replaces selectBehavior for creatures with tier === 1.
// Loudest immediate stimulus wins. No drive comparison. No long-range seeking.

function selectBehaviorTier1(creature) {
  const stimuli = [];

  // --- Threat stimulus ---
  // Direct response to detected threats — proximity-based, not safety-drive-mediated
  if (creature.detectedThreats && creature.detectedThreats.length > 0) {
    const worst = creature.detectedThreats.reduce((a, b) =>
      (a.threatLevel / Math.max(1, a.distance)) > (b.threatLevel / Math.max(1, b.distance)) ? a : b);

    // Intensity = threat level scaled by proximity (closer = louder)
    const intensity = worst.threatLevel / Math.max(1, worst.distance);
    if (intensity > 0) {
      stimuli.push({ behavior: 'flee', intensity: intensity });
      creature.threatSource = worst.source;
    }
  }

  // --- Corpse stimulus (predators only) ---
  // Standing on free food is very loud
  if (creature.diet === 'predator') {
    const corpseHere = getCorpseAt(state.player.layer, creature.x, creature.y);
    if (corpseHere && creature.drives.hunger > HUNGER_THRESHOLD * 0.5) {
      stimuli.push({ behavior: 'hunt', intensity: creature.drives.hunger * 2.0 });
    }
  }

  // --- Adjacent prey stimulus (predators only) ---
  // Prey right next to me triggers attack — no planning, just reaction
  if (creature.diet === 'predator') {
    const adjacentPrey = getAdjacentPrey(creature);
    if (adjacentPrey && creature.drives.hunger > HUNGER_THRESHOLD) {
      stimuli.push({ behavior: 'hunt', intensity: creature.drives.hunger * 1.5 });
    }
  }

  // --- Food underfoot stimulus (herbivores only) ---
  // Grazing is reactive — eat what you're standing on
  if (creature.diet === 'herbivore') {
    if (tileIsFood(creature.x, creature.y) && creature.drives.hunger > HUNGER_THRESHOLD) {
      stimuli.push({ behavior: 'forage', intensity: creature.drives.hunger });
    }
  }

  // --- Rest stimulus ---
  // Only fires when body is in severe distress — Tier 1 doesn't strategically rest
  if (creature.drives.rest > REST_THRESHOLD + 0.15) {
    stimuli.push({ behavior: 'rest', intensity: creature.drives.rest });
  }

  // No strong stimulus — wander
  if (stimuli.length === 0) return 'wander';

  // Loudest wins
  stimuli.sort((a, b) => b.intensity - a.intensity);
  return stimuli[0].behavior;
}

// ==================== SENSE-SPECIFIC PERCEPTION (L-B) ====================
// Replaces the flat-range detection from I-B with real perception.
// Each creature detects others through chemical, vibration (ground/air),
// and visual senses using signal emissions from L-A.

// --- Light Level ---
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

// --- Per-Zone Detection (Prompt P) ---
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

// --- Visual Range (unchanged — uses max quality, cone + LOS) ---

function getVisualRange(detector, target) {
  const detectability = target.signals ? target.signals.visual : 0;
  const sensitivity = getEffectiveVisual(detector);
  const light = getLightLevel();
  if (detectability <= 0 || sensitivity <= 0 || light <= 0) return 0;
  return Math.cbrt(detectability * light) * sensitivity * VIS_RANGE_COEFF;
}

// --- Vision Cone Check ---
// Converts creature facing {dx, dy} to angle, checks if target is within cone.

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

// --- Line of Sight ---
// Uses hasLOS from fov.js. Forests do NOT block NPC LOS in this pass
// (no per parameter → tree transparency is skipped, only walls block).

function hasLineOfSight(detector, target) {
  const layer = detector.layer != null ? detector.layer : state.player.layer;
  return hasLOS(layer, detector.x, detector.y, target.x, target.y);
}

// --- Master Detection Function (Prompt P) ---
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

  // Visual — cone + line of sight + light (unchanged, max-based)
  const visRange = getVisualRange(detector, target);
  if (d <= visRange && isInVisionCone(detector, target) && hasLineOfSight(detector, target)) {
    senses.push('visual');
    const visSNR = d > 0 ? visRange / d : visRange * 10;
    if (visSNR > bestSNR) bestSNR = visSNR;
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

/** Detect threats in range using per-zone detection (Prompt P). */
function detectThreats(creature) {
  const threats = [];

  // Check player
  const player = state.player;
  if (player && player.hp > 0) {
    const result = canDetect(creature, player);
    if (result.detected) {
      const threatLevel = assessThreatLevel(creature, player);
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
      const threatLevel = assessThreatLevel(creature, other);
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
      creature.movedThisTurn = true;  // Prompt L-A: signal emission flag
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

// ==================== UNIFIED AI LOOP ====================

/** Main AI entry point — called once per creature per turn. */
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

// ==================== CONTINUOUS UNCERTAINTY (Prompt P) ====================
// Replaces binary SNR thresholds with continuously narrowing uncertainty ranges
// for size, and confidence curves for diet/species/condition identification.

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

  for (const det of detections) {
    if (det.snr > bestSNR) bestSNR = det.snr;

    if (det.channel === 'chemicalAirborne' && det.snr > bestChemSNR) {
      bestChemSNR = det.snr;
    }
    if ((det.channel === 'vibrationGround' || det.channel === 'vibrationAir')
        && det.snr > bestVibSNR) {
      bestVibSNR = det.snr;
    }

    // Movement is inherent in vibration detection — if vibration detected, target was moving
    if (det.channel === 'vibrationGround' || det.channel === 'vibrationAir') {
      info.isMoving = true;
    }
  }

  info.bestSNR = bestSNR;

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

// ==================== DETECTION INFO PER CREATURE (Prompt P) ====================
// Build continuous-uncertainty detection info for all detected entities each turn.

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

    // Gather per-zone detections (non-visual). If only visual detected, create minimal info.
    let detections = result.detections || [];
    // If visual detected but no per-zone non-visual detections, create a synthetic entry
    // so buildDetectionInfo has something to work with (visual SNR)
    if (detections.length === 0 && result.senses.includes('visual')) {
      const visSNR = result.bestSNR || 1;
      detections = [{ zone: null, channel: 'visual', quality: getEffectiveVisual(creature), snr: visSNR }];
    }

    const info = buildDetectionInfo(creature, target, detections);
    info.entity = target;
    info.senses = result.senses;
    creature.detectionInfo.push(info);
  }
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

// ==================== ACTION EXECUTOR (Prompt O) ====================
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
      moved = executeFlee(creature);
      creature.currentBehavior = 'flee';
      break;
    }
    case 'orient': {
      // Face toward the target without moving
      if (action.target && creature.facing) {
        creature.facing.dx = Math.sign(action.target.x - creature.x);
        creature.facing.dy = Math.sign(action.target.y - creature.y);
      }
      creature.currentBehavior = 'wander'; // cosmetically wander
      break;
    }
    case 'hold': {
      // Stay still — do nothing
      creature.currentBehavior = 'rest';
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
      executeWander(creature);
      creature.currentBehavior = 'wander';
      break;
    }
  }
  return moved;
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
    detectThreats(creature);
    applySafetyFromThreats(creature);
    detectPrey(creature);
    detectCorpses(creature);
    buildAllDetectionInfo(creature);
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

  // Threat detection (Prompt P — per-zone) — used for safety drive spikes
  detectThreats(creature);
  applySafetyFromThreats(creature);

  // Prey and corpse detection (I-C) — still used by deliberative layer
  detectPrey(creature);
  detectCorpses(creature);

  // ── Build continuous-uncertainty detection info (Prompt P) ──
  buildAllDetectionInfo(creature);

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

  // Prompt L-A: mark both combatants
  mon.inCombatThisTurn = true;
  player.inCombatThisTurn = true;

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

// ==================== PLAYER NON-VISUAL PERCEPTION (Prompt P) ====================
// Each turn, compute what the player detects through non-visual senses.
// Creatures detected through chemical airborne, ground vibration, or air vibration
// — but NOT currently in the player's visual FOV — are flagged for rendering
// with SNR-based opacity gradient and species-confidence gated blob/sprite display.
// Uses per-zone detection (Prompt P) — same detectTargetPerZone function as AI.
// Prompt Q: expanded to include speciesConfidence and sizeEstimate for rendering.

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
 */
function computePlayerPerception() {
  const player = state.player;
  if (!player || player.hp <= 0) return;

  // Clear previous turn's results
  player.sensedCreatures = [];

  const fovSet = state.fovSet;

  // Prompt R: spatial grid narrows candidate list for player perception
  const nearby = getNearbyCreatures(player.x, player.y);
  if (!nearby || nearby.length === 0) return;

  for (const creature of nearby) {
    if (creature.hp <= 0) continue;

    // Skip creatures already in visual FOV — they render normally
    if (fovSet && fovSet.has(`${creature.x},${creature.y}`)) continue;

    // Ensure creature has signals computed
    if (!creature.signals) continue;

    // Per-zone detection against this creature
    const detections = detectTargetPerZone(player, creature);
    if (!detections) continue;

    // Find best SNR across all detecting player zones
    let bestSNR = 0;
    for (const det of detections) {
      if (det.snr > bestSNR) bestSNR = det.snr;
    }

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

export { endPlayerTurn, enemyAct, monsterMelee, playerInTerritory, monInOwnTerritory,
         canSeePlayer, canSeePlayerTile, monsterViewRadius,
         syncSwarmAI, mushroomPackAI, mushroomTouch, wanderInTerritory, moveMonsterToward,
         wanderMonster, moveMonsterTowardPlayer,
         hasCladeTerritory, wouldExceedTerritory,
         isWaterLocked, isWaterTile, processBleed,
         applySafetyFromDamage,
         computePlayerPerception,
         debugEcology, debugForceHunger, debugCognition };
