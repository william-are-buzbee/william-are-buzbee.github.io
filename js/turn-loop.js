// ==================== TURN LOOP ====================
// The master turn loop that coordinates physiology, FOV, scent, AI,
// dormancy, and cleanup.  Calls into physiology.js, ai.js, fov.js,
// scent.js, and detection.js but doesn't implement any of them.
// Split from enemy-ai.js.

import { state, worlds, monsters } from './state.js';
import { getBodyMap, getNeuralArchitecture,
         BASE_AP_COST, MAX_ACTIONS_PER_INPUT, REFERENCE_SPEED, BASE_TICKS_PER_ACTION,
         HEAL_BASE_RATE, HEAL_REST_MULTIPLIER, REGEN_FRACTION,
         SUBSTRATE_DEPLETION_MOD, SUBSTRATE_DEPLETION_HIGH, SUBSTRATE_REGEN_BASE,
         CIRC_REGEN_EFF_CLOSED, CIRC_REGEN_EFF_OPEN, CIRC_REGEN_EFF_HYBRID,
         VASCULARITY_MIN, REGEN_UPREGULATION, FAST_TWITCH_RECRUIT_THRESHOLD,
         MASS_HUNGER_COEFF, NEURAL_HUNGER_COEFF,
         ACTIVE_RADIUS, DORMANT_RADIUS, MAX_DRIFT } from './constants.js';
import { computeIntegrationCapacity, getTier } from './cognition.js';
import { computePlayerPerception } from './detection.js';
import { isWalkable, terrainInfo } from './terrain.js';
import { playerDef, playerDodge, poisonResistance, passiveRegenInterval } from './player.js';
import { inBounds, monsterAt, isTownCell, getCover } from './world-state.js';
import { log, LOG_CATEGORIES } from './log.js';
import { render } from './rendering.js';
import { fedDrainFor } from './player-actions.js';
import { advanceTick } from './time-cycle.js';
import { saveGame } from './save-load.js';
import { updatePlayerFOV, updateAmbientSensing } from './fov.js';
import { computeSignals } from './signals.js';
import { updateScentSystem } from './scent.js';
import { getBodyPTW, processBleed, applyHealing,
         _getCirculatoryRegenEfficiency, _regenerateSubstrate,
         _clearStressChemistry,
         turnsToFullSpeed, getEntityTotalMass, applyTurningCost } from './physiology.js';
import { runCreatureAI, _updateInWater } from './ai.js';
import { isWaterTile, isWaterLocked, wouldExceedTerritory, WATER_TILES,
         rebuildSpatialGrid, canMoveTo } from './ai-utils.js';

// Forward references — set by main.js
let _onPlayerDeathCallback = null;
export function setOnPlayerDeathCallback(fn){ _onPlayerDeathCallback = fn; }
let _useActionCallback = null;
export function setUseActionCallback(fn){ _useActionCallback = fn; }

function monstersHere(){ return monsters[state.player.layer] || []; }

let turnCount = 0;

// ── Layer-transition tracking for dormancy catch-up (Prompt S) ──
// When the player leaves a layer, we record the turn count.  When they return,
// every creature on that layer gets catch-up for the intervening turns.
let _prevLayer = null;
const _layerLeftTurn = {};   // layerIndex → turnCount when the player left

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

  // ── Player acceleration tracking (mass-dependent startup) ──
  // Must run BEFORE AP calculation so first turn of movement isn't at 0.
  if (state.player.movedThisTurn) {
    state.player._consecutiveMoveTurns = (state.player._consecutiveMoveTurns || 0) + 1;
  } else {
    state.player._consecutiveMoveTurns = 0;
  }

  // ── AP and world-time calculations ──
  // These are SEPARATE systems that both read the player's speed.
  //   AP accumulation:  ratio-based (creaturePTW / playerPTW) — determines
  //                     how often creatures act relative to the player.
  //   World-time:       reference-speed-based — determines how fast the
  //                     day/night cycle and time-scaled effects advance.
  const playerIntensity = state.player._lastMovementIntensity || 0.25;
  const playerPTW = getBodyPTW(player, playerIntensity);
  // Apply mass-dependent acceleration scalar
  const playerTotalMass = getEntityTotalMass(player);
  const playerTTFS = turnsToFullSpeed(playerTotalMass);
  const playerAccelScalar = Math.min(1.0, (state.player._consecutiveMoveTurns || 0) / playerTTFS);
  const playerAPRate = playerPTW * (state.player.movedThisTurn ? playerAccelScalar : 1.0);
  const effectivePlayerRate = Math.max(playerAPRate, 0.001);  // guard against zero/tiny

  // World-time: how many day-cycle ticks pass per player action.
  // At REFERENCE_SPEED → 1 tick/action → 1200 actions per full day.
  // Faster player → fewer ticks/action → more actions per day.
  // Slower player → more ticks/action → fewer actions per day.
  const worldTicksElapsed = BASE_TICKS_PER_ACTION * (REFERENCE_SPEED / effectivePlayerRate);
  advanceTick(worldTicksElapsed);
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
    log('You grow hungry.', LOG_CATEGORIES.ENVIRONMENT); state.player._warnedHungry = true;
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
        log('You collapse from starvation.', LOG_CATEGORIES.ENVIRONMENT);
        state.player.deathCause = 'starvation';
        if (_onPlayerDeathCallback) _onPlayerDeathCallback();
        return;
      }
      log('Starvation weakens you.', LOG_CATEGORIES.ENVIRONMENT);
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
      log(`Toxin damage. [-${totalPoisonDmg} HP]`, LOG_CATEGORIES.COMBAT);
      if (state.player.hp <= 0){
        state.player.hp = 0;
        log('The venom claims you.', LOG_CATEGORIES.COMBAT);
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

  // ── Player substrate depletion — uses actual movement intensity ──
  if (state.player.movedThisTurn) {
    const playerBodyMap = getBodyMap(state.player);
    if (playerBodyMap) {
      const intensity = state.player._lastMovementIntensity || 0.25;
      // Only deplete if intensity exceeds fast-twitch recruitment threshold
      if (intensity >= FAST_TWITCH_RECRUIT_THRESHOLD) {
        const excessIntensity = intensity - FAST_TWITCH_RECRUIT_THRESHOLD;
        for (const zone of playerBodyMap) {
          if (zone.destroyed || !zone.locomotion || zone.fiberRatio == null) continue;
          const fastMass = zone.muscle * zone.fiberRatio;
          const cost = fastMass * excessIntensity * SUBSTRATE_DEPLETION_HIGH;
          zone.substrate = Math.max(0, (zone.substrate || 0) - cost);
        }
      }
    }
  }

  // ── Player substrate regeneration (all non-depleted zones) ──
  {
    const playerBodyMap = getBodyMap(state.player);
    if (playerBodyMap) {
      const circRegenEff = _getCirculatoryRegenEfficiency(state.player);
      const playerIntensity = state.player._lastMovementIntensity || 0.25;
      for (const zone of playerBodyMap) {
        if (zone.destroyed || zone.fiberRatio == null) continue;
        if (zone.substrateMax == null || zone.substrateMax <= 0) continue;
        if (zone.substrate >= zone.substrateMax) continue;

        // Block regen on locomotion zones only when movement intensity was high
        if (zone.locomotion && state.player.movedThisTurn) {
          if (playerIntensity >= FAST_TWITCH_RECRUIT_THRESHOLD) continue;
        }

        const vascularityFactor = VASCULARITY_MIN + (1.0 - VASCULARITY_MIN) * (1.0 - zone.fiberRatio);
        const substrateFraction = (zone.substrate || 0) / zone.substrateMax;
        const depletionBoost = 1.0 + REGEN_UPREGULATION * (1.0 - substrateFraction);
        const regen = zone.muscle * SUBSTRATE_REGEN_BASE * circRegenEff * vascularityFactor * depletionBoost;
        zone.substrate = Math.min(zone.substrateMax, (zone.substrate || 0) + regen);
      }
    }
  }

  // ── Sprint exhaustion: auto-disable sprint when any locomotion zone runs dry ──
  if (state.player.sprintMode) {
    const playerBodyMap = getBodyMap(state.player);
    if (playerBodyMap) {
      let anyDepleted = false;
      let warned25 = false;
      for (const zone of playerBodyMap) {
        if (zone.destroyed || !zone.locomotion || zone.fiberRatio == null) continue;
        if (zone.substrateMax > 0 && zone.substrate <= 0) {
          anyDepleted = true;
        }
        if (!state.player._sprintWarnedLow && zone.substrateMax > 0 &&
            zone.substrate / zone.substrateMax <= 0.25 && zone.substrate > 0) {
          warned25 = true;
        }
      }
      if (warned25) {
        log('Your legs burn.', LOG_CATEGORIES.ENVIRONMENT);
        state.player._sprintWarnedLow = true;
      }
      if (anyDepleted) {
        log("Your legs give out — you can't maintain this pace.", LOG_CATEGORIES.ENVIRONMENT);
        state.player.sprintMode = false;
        state.player._sprintWarnedLow = false;
      }
    }
  } else {
    state.player._sprintWarnedLow = false;
  }

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

    // ── AP-based creature action loop ──
    // Each creature accumulates AP proportional to its speed ratio vs the player.
    // When accumulated AP >= BASE_AP_COST, the creature acts.  Fast creatures
    // act multiple times per player input; slow creatures act less than once.
    // AP is pure ratio math — no world-ticks involved.
    for (const m of activeCreatures){
      if (m.hp <= 0) continue;

      // Blood system — process monster bleed each turn
      if (processBleed(m, false)) {
        m.hp = 0;  // blood loss death
        continue;
      }

      // Zone healing (Prompt J) — monsters heal wounded zones after bleed
      applyHealing(m);

      // Facing initialization for creatures that need it
      if (!m.facing && (m.key === 'cave_crab')) {
        m.facing = { dx: 0, dy: 1 };
      }

      // Accumulate AP based on speed ratio (pure ratio math, no world-ticks)
      // Apply mass-dependent acceleration scalar.
      // Only reduces speed once the creature has been moving (consecutiveMoveTurns > 0).
      // Standing creatures act at full AP rate so they can detect, react, and start moving.
      // Once in motion, speed ramps up from 1/ttfs to full over several turns.
      const creatureTotalMass = getEntityTotalMass(m);
      const creatureTTFS = turnsToFullSpeed(creatureTotalMass);
      const rawConsecutive = m._consecutiveMoveTurns || 0;
      const creatureAccelScalar = rawConsecutive > 0
        ? Math.min(1.0, rawConsecutive / creatureTTFS)
        : 1.0;
      const creaturePTW = getBodyPTW(m);
      const speedRatio = (creaturePTW * creatureAccelScalar) / effectivePlayerRate;
      m._accumulatedAP = (m._accumulatedAP || 0) + speedRatio * BASE_AP_COST;

      // Act while enough AP is accumulated (up to cap)
      let actionsThisTurn = 0;
      let movedAnyAction = false;  // Track if creature moved during ANY action this input
      while (m._accumulatedAP >= BASE_AP_COST && actionsThisTurn < MAX_ACTIONS_PER_INPUT) {
        m._accumulatedAP -= BASE_AP_COST;
        actionsThisTurn++;

        // Reset per-action transient flags
        m.movedThisTurn = false;
        m.inCombatThisTurn = false;
        m._lastGanglionIntensity = null;
        m._ganglionTriggeredStress = false;

        // Run the creature's full AI cycle
        runCreatureAI(m);
        if (m.movedThisTurn) movedAnyAction = true;

        if (state.player.hp <= 0){ _onPlayerDeathCallback && _onPlayerDeathCallback(); return; }
        if (m.hp <= 0) break;  // creature died during its action
      }

      // Cap accumulated AP to prevent runaway accumulation on dormant-then-active creatures.
      // At most ~1.5 actions worth — enough for carryover, never a huge burst.
      m._accumulatedAP = Math.min(m._accumulatedAP, BASE_AP_COST * 1.5);

      // Store action count for debugCognition
      m._actionsThisTurn = actionsThisTurn;

      // ── NPC acceleration tracking (mass-dependent startup) ──
      // Track whether the creature moved during any of its actions this player input.
      if (movedAnyAction) {
        m._consecutiveMoveTurns = (m._consecutiveMoveTurns || 0) + 1;
      } else {
        m._consecutiveMoveTurns = 0;
      }

      // ── Time-scaled substrate regeneration (runs once per player input) ──
      _regenerateSubstrate(m, worldTicksElapsed);

      // ── Time-scaled stress clearance (runs once per player input) ──
      _clearStressChemistry(m, worldTicksElapsed);
    }
  }
  for (const layer of Object.keys(monsters)){
    if (monsters[layer]) monsters[layer] = monsters[layer].filter(m => m.hp > 0);
  }
  updatePlayerFOV();  // recompute FOV before rendering
  updateAmbientSensing();  // ambient terrain sensing — extends explored set (no entities)
  updateScentSystem(state.activeLayer);  // scent emission, transport, and player detection (log after vision)
  computePlayerPerception();  // Prompt N: detect creatures through non-visual senses
  render();
  saveGame().catch(err => console.error('[Save] Auto-save failed:', err));  // Async fire-and-forget
}

// ==================== EXPORTS ====================
export { endPlayerTurn, monstersHere };
