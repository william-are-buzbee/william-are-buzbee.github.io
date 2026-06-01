// ==================== TURN MANAGEMENT + ENEMY AI ====================
// Drive-based creature AI. Every creature runs the same drive/behavior loop.
// Prompt I-A: drives tick, all creatures wander, adjacency combat only.

import { state, worlds, covers, monsters } from './state.js';
import { DMG, LAYER_META, LAYER_SURFACE, getBodyMap, selectHitZone,
         MAX_BONUS_MOVE_CHANCE, MIN_ACTION_CHANCE, STAT_MAX, TURN_AGILITY_COEFF,
         facingSteps, checkNeuralDeath, getAvailableAttacks, hasLocomotion, checkSenseLoss,
         getPathways, computeBleedPenalty, SEEP_COEFF, CLOT_RATE, REGEN_FRACTION,
         BLOOD_DEATH_THRESHOLD, BURST_COEFF, BLOOD_CRITICAL_THRESHOLD,
         ARMOR_PER_STRUCTURAL_KG, getAttackDirection, getExposedZones, selectContactedZones,
         MASS_HUNGER_COEFF, NEURAL_HUNGER_COEFF, SAFETY_DECAY_RATE, REST_BASE_RATE } from './constants.js';
import { T, isWalkable } from './terrain.js';
import { rand, randi, roll100 } from './rng.js';
import { playerDef, playerDodge, poisonResistance, passiveRegenInterval, restHealAmount, creatureViewRadius } from './player.js';
import { monAcc, monDodge, monDamage, monCritChance, monCritMult, WANDER_PROFILES, DEFAULT_WANDER_PROFILE } from './monsters.js';
import { inBounds, monsterAt, chebyshev, isTownCell, getCover } from './world-state.js';
import { log } from './log.js';
import { render } from './rendering.js';
import { endStealth, stealthDetectChance, rollHit } from './combat.js';
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

  // Safety: decays toward 0 (threats spike it in future prompts)
  creature.drives.safety = Math.max(0, creature.drives.safety - SAFETY_DECAY_RATE);

  // Rest: increases slowly (wounds accelerate it in future prompts)
  creature.drives.rest = Math.min(1.0, creature.drives.rest + REST_BASE_RATE);
}

/** Select behavior based on drive priorities. I-A: always wander. */
function selectBehavior(creature) {
  // I-B will add: if safety > SAFETY_THRESHOLD → 'flee'
  // I-C will add: if hunger > HUNGER_THRESHOLD → 'hunt' or 'forage'
  // I-D will add: if rest > REST_THRESHOLD → 'rest'
  return 'wander';
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
    adjacencyCombatCheck(creature);
    return;
  }

  // Update drives
  updateDrives(creature);

  // Select behavior (I-A: always 'wander')
  const behavior = selectBehavior(creature);
  creature.currentBehavior = behavior;

  // Execute behavior
  if (behavior === 'wander') {
    executeWander(creature);
  }
  // Future: if (behavior === 'flee') executeFlee(creature);
  // Future: if (behavior === 'hunt') executeHunt(creature);
  // Future: if (behavior === 'rest') executeRest(creature);

  // Adjacency combat check (separate from behavior)
  adjacencyCombatCheck(creature);
}

// ==================== BONUS MOVE (relative speed system) ====================
// Called after all normal enemy actions for enemies with PTW ratio > player's.
// Movement only — no attacks. Uses wander movement logic.
function performBonusMove(mon){
  if (mon.immobilized) return;
  // Just take another wander step
  executeWander(mon);
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

export { endPlayerTurn, enemyAct, monsterMelee, playerInTerritory, monInOwnTerritory,
         canSeePlayer, canSeePlayerTile, monsterViewRadius,
         syncSwarmAI, mushroomPackAI, mushroomTouch, wanderInTerritory, moveMonsterToward,
         wanderMonster, moveMonsterTowardPlayer,
         hasCladeTerritory, wouldExceedTerritory,
         isWaterLocked, isWaterTile, processBleed };
