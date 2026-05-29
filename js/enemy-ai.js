// ==================== TURN MANAGEMENT + ENEMY AI ====================
// End-of-turn processing, monster state machine, movement, and melee.

import { state, worlds, covers, monsters } from './state.js';
import { DMG, LAYER_META, LAYER_SURFACE, getBodyMap, selectHitZone,
         MAX_BONUS_MOVE_CHANCE, MIN_ACTION_CHANCE, STAT_MAX, TURN_AGILITY_COEFF,
         facingSteps, checkNeuralDeath, getAvailableAttacks, hasLocomotion, checkSenseLoss,
         getPathways, computeBleedPenalty, SEEP_COEFF, CLOT_RATE, REGEN_FRACTION,
         BLOOD_DEATH_THRESHOLD, BURST_COEFF, BLOOD_CRITICAL_THRESHOLD,
         ARMOR_PER_STRUCTURAL_KG, getAttackDirection, getExposedZones, selectContactedZones } from './constants.js';
import { T, isWalkable } from './terrain.js';
import { rand, randi, roll100 } from './rng.js';
import { playerDef, playerDodge, poisonResistance, passiveRegenInterval, restHealAmount, creatureViewRadius } from './player.js';
import { monAcc, monDodge, monDamage, monCritChance, monCritMult } from './monsters.js';
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

// Helper: get the effective biome type at a position (cover if present, else ground)
function biomeAt(layer, x, y){
  const c = getCover(layer, x, y);
  return c || worlds[layer][y][x];
}

// ==================== AQUATIC MOVEMENT LOCK ====================
// Fish / aquatic enemies are confined to water tiles.
// They can melee-attack an adjacent target on land but never step onto it.
// The wading grazer (cave_crab key) is amphibious and explicitly excluded.
const WATER_TILES = new Set([T.WATER, T.DEEP_WATER, T.UWATER]);

function isWaterTile(layer, x, y){
  if (!inBounds(layer, x, y)) return false;
  return WATER_TILES.has(worlds[layer][y][x]);
}

/** True if this monster must stay on water tiles. */
function isWaterLocked(mon){
  return mon.tags && mon.tags.includes('aquatic') && mon.key !== 'cave_crab';
}

// ==================== BIOME LEASHING ====================
// Species-specific leash: max tiles a creature will stray from its home biome.
// Measured from the nearest tile of the home biome, not from spawn point.

function getLeashDist(mon){
  switch (mon.key){
    case 'mushroom':  return 0;  // NEVER leave fungal/chemotrophic ground
    case 'scorpion':  return 2;
    case 'lurker':    return 2;
    case 'mummy':     return 3;
    case 'wolf': case 'dire_wolf':
      if (mon.personality === 'leader')      return 10;
      if (mon.personality === 'pair_bond')   return 8;
      if (mon.personality === 'lone_hunter' || mon.personality === 'skittish' || mon.personality === 'wary') return 4;
      return 5;
    case 'hare':       return 99; // flee AI handles drift
    case 'ambush_pred': return 3; // stays close to home biome
    case 'cave_eel': case 'deep_squid': case 'drowned': return 0; // water-locked
    case 'cave_crab':  return 5;
    default:           return 5;
  }
}

/** Which tile types count as "home" for leash-distance measurement. */
function getHomeTiles(mon){
  switch (mon.key){
    case 'mushroom':  return [T.MUSHFOREST, T.FUNGAL_GRASS];
    case 'scorpion': case 'lurker': case 'mummy': return [T.SAND];
    case 'wolf': case 'dire_wolf': return [T.FOREST];
    case 'cave_crab':  return [T.WATER, T.DEEP_WATER, T.UWATER, T.BEACH];
    case 'ambush_pred': return [T.FOREST, T.MUSHFOREST, T.FUNGAL_GRASS];
    case 'hare':       return [T.GRASS, T.FOREST, T.DIRT, T.DIRT_ROAD];
    default:           return mon.biomes && mon.biomes.length ? [...mon.biomes] : [];
  }
}

/** Tiles a creature will NEVER step onto, regardless of leash distance. */
function getHardAvoidTiles(mon){
  if (mon.key === 'wolf' || mon.key === 'dire_wolf') return [T.SAND, T.ROCK];
  if (mon.key === 'hare') return [T.SAND, T.ROCK, T.WATER, T.DEEP_WATER, T.UWATER];
  return null;
}

/** True if (x,y) is a tile this monster must never enter. */
function isForbiddenTile(mon, layer, x, y){
  if (!inBounds(layer, x, y)) return true;
  const g = worlds[layer][y][x];
  // Chemotrophs: fungal-only
  if (mon.key === 'mushroom'){
    const b = biomeAt(layer, x, y);
    const fungal = [T.MUSHFOREST, T.FUNGAL_GRASS];
    return !fungal.includes(b) && !fungal.includes(g);
  }
  const avoid = getHardAvoidTiles(mon);
  if (avoid && avoid.includes(g)) return true;
  return false;
}

/** Chebyshev distance from monster to nearest home-biome tile. 0 = currently on home. */
function distFromHomeBiome(mon, layer){
  const homeTiles = getHomeTiles(mon);
  if (!homeTiles.length) return 0;
  // Check current tile (cover then ground)
  if (!inBounds(layer, mon.x, mon.y)) return 999;
  const curBiome = biomeAt(layer, mon.x, mon.y);
  const curGround = worlds[layer][mon.y][mon.x];
  if (homeTiles.includes(curBiome) || homeTiles.includes(curGround)) return 0;
  // Spiral scan outward
  const maxScan = 30;
  for (let r = 1; r <= maxScan; r++){
    for (let dy = -r; dy <= r; dy++){
      for (let dx = -r; dx <= r; dx++){
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = mon.x + dx, ny = mon.y + dy;
        if (!inBounds(layer, nx, ny)) continue;
        const b = biomeAt(layer, nx, ny);
        const g = worlds[layer][ny][nx];
        if (homeTiles.includes(b) || homeTiles.includes(g)) return r;
      }
    }
  }
  return maxScan + 1;
}

/** Position of nearest home-biome tile for retreat pathfinding. */
function nearestHomeTilePos(mon, layer){
  const homeTiles = getHomeTiles(mon);
  if (!homeTiles.length) return null;
  const maxScan = 30;
  for (let r = 1; r <= maxScan; r++){
    for (let dy = -r; dy <= r; dy++){
      for (let dx = -r; dx <= r; dx++){
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = mon.x + dx, ny = mon.y + dy;
        if (!inBounds(layer, nx, ny)) continue;
        const b = biomeAt(layer, nx, ny);
        const g = worlds[layer][ny][nx];
        if (homeTiles.includes(b) || homeTiles.includes(g)) return { x: nx, y: ny };
      }
    }
  }
  return { x: mon.homeX, y: mon.homeY }; // fallback to spawn
}

// ==================== CLADE B TERRITORY RADIUS ====================
// Creatures with clade.territorial = true are leashed to a fixed radius
// around their spawn point (homeX, homeY).  They will not pursue, wander,
// or flee beyond this radius.  If the player leaves the radius the creature
// disengages immediately and returns toward home.
//
// ---- FUTURE: TERRITORY EFFECTIVENESS SCALING (not yet implemented) ----
// Creatures with territorial: true will eventually receive stat bonuses
// when fighting inside their territory radius and stat penalties outside it.
// Planned modifiers:
//   • Inside territory: +10-15% accuracy, +10% damage, +5% dodge
//   • Outside territory (if somehow forced): -15% accuracy, -15% damage,
//     -10% dodge, -20% perception
// The scaling will be continuous, strongest at home and weakening toward
// the radius edge, not a hard on/off toggle.  This creates a tactical
// incentive to kite territorial creatures outward.
// Implementation will go in monAcc/monDodge/monDamage and a new
// territoryEffectiveness(mon) helper that returns a 0.0–1.0 scalar
// based on distance from home vs territory radius.
// ---- END FUTURE SYSTEM ----

/** True if this monster has a clade-based territory radius leash. */
function hasCladeTerritory(mon){
  return !!(mon.clade && mon.clade.territorial && mon.territoryRadius > 0);
}

/** True if position (nx, ny) would be outside this monster's territory radius. */
function wouldExceedTerritory(mon, nx, ny){
  if (!hasCladeTerritory(mon)) return false;
  return chebyshev(nx, ny, mon.homeX, mon.homeY) > mon.territoryRadius;
}

/** True if the player is adjacent to at least one water tile (reachable attack position). */
function playerAdjacentToWater(layer){
  const px = state.player.x, py = state.player.y;
  for (let dx = -1; dx <= 1; dx++){
    for (let dy = -1; dy <= 1; dy++){
      if (dx === 0 && dy === 0) continue;
      if (isWaterTile(layer, px + dx, py + dy)) return true;
    }
  }
  return false;
}

// ==================== BONUS MOVE (relative speed system) ====================
// Called after all normal enemy actions for enemies with PTW ratio > player's.
// Movement only — no attacks, no special abilities, no interactions.
// Uses the enemy's existing AI movement logic for direction.
function performBonusMove(mon){
  // Immobilized creatures can't move
  if (mon.immobilized) return;

  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);

  // Hare: flee movement (bonus move makes them harder to catch)
  if (mon.key === 'hare' || (mon.icon && mon.icon === 'HARE')){
    if (d <= 4 || mon.wasAttacked || mon.alerted){
      const fdx = Math.sign(mon.x - state.player.x);
      const fdy = Math.sign(mon.y - state.player.y);
      const nx = mon.x + (fdx || (rand()<0.5?1:-1));
      const ny = mon.y + (fdy || (rand()<0.5?1:-1));
      if (inBounds(state.player.layer, nx, ny)
          && isWalkable(worlds[state.player.layer][ny][nx], getCover(state.player.layer, nx, ny))
          && !monsterAt(nx,ny,state.player.layer) && !(nx===state.player.x && ny===state.player.y)
          && !wouldExceedTerritory(mon, nx, ny)){
        if (mon.facing) { mon.facing.dx = Math.sign(nx - mon.x); mon.facing.dy = Math.sign(ny - mon.y); }
        mon.x = nx; mon.y = ny;
      }
    } else {
      if (rand() < 0.15) wanderInTerritory(mon);
    }
    return;
  }

  // Mushroom / sync swarm — drift (no touch attack)
  if (mon.clade && mon.clade.sync){
    if (mon.swarmPhase === 'mobbing' || mon.swarmPhase === 'coalescing'){
      if (d > 1) moveMonsterToward(mon, state.player.x, state.player.y, true);
    } else {
      if (rand() < 0.08) wanderInTerritory(mon);
    }
    return;
  }

  // Chase state — move toward target (no attack — movementOnly flag)
  if (mon.aiState === 'chase'){
    if (canSeePlayer(mon)){
      moveMonsterToward(mon, state.player.x, state.player.y, true);
    } else if (mon.lastSeenX >= 0){
      moveMonsterToward(mon, mon.lastSeenX, mon.lastSeenY, true);
    }
    return;
  }

  // Search state — wander toward last seen
  if (mon.aiState === 'search'){
    if (mon.lastSeenX >= 0 && rand() < 0.5){
      moveMonsterToward(mon, mon.lastSeenX, mon.lastSeenY, true);
    } else {
      wanderInTerritory(mon);
    }
    return;
  }

  // Idle — occasional drift
  if (rand() < 0.15) wanderInTerritory(mon);
}

 function endPlayerTurn(action){
    const player = state.player; // Add this line to define 'player'
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
    // Phase 1: Each enemy takes its normal action (speed skip + instant turn + AI)
    for (const m of mons){
      if (m.hp <= 0) continue;
      // Blood system — process monster bleed each turn
      if (processBleed(m, false)) {
        m.hp = 0;  // blood loss death
        continue;
      }
      enemyAct(m);
      if (state.player.hp <= 0){ _onPlayerDeathCallback && _onPlayerDeathCallback(); return; }
    }
    // Phase 2: Each enemy that acted normally rolls for a bonus move (faster enemies only)
    for (const m of mons){
      if (m.hp <= 0) continue;
      if (!m._actedNormally) continue;
      const monPTW  = m.strength / m.siz;
      const plrPTW  = state.player.strength / state.player.siz;
      const ratio   = monPTW / plrPTW;
      if (ratio >= 1) {
        // Apply bleedPenalty to effective speed
        const bleedMul = 1 - (m.bleedPenalty || 0);
        const bonusChance = Math.min((ratio - 1) * bleedMul, MAX_BONUS_MOVE_CHANCE);
        if (Math.random() < bonusChance) {
          performBonusMove(m);
        }
      }
      m._actedNormally = false;  // clean up flag
    }
  }
  for (const layer of Object.keys(monsters)){
    if (monsters[layer]) monsters[layer] = monsters[layer].filter(m => m.hp > 0);
  }
  updatePlayerFOV();  // recompute FOV before rendering
  render();
  saveGame();  // Auto-save after every player action
}

/*
  Enemy AI state machine:
  - idle:   creature is at home, wandering occasionally. Transitions to chase when it sees/is-hit-by player.
  - chase:  actively pursuing. Tracks lastSeen position.
  - search: only for enemies with search > 0 (smarter ones). Pokes around last-known location.
  Territory: creatures give up chase if player leaves their biome AND creature has wandered off home.
  Stealth: reduces detection chance, especially at range.
*/
function playerInTerritory(mon){
  // Check: is player currently in a tile type considered "home" for this monster?
  if (!mon.territory || !mon.territory.length) return true;
  if (!inBounds(state.player.layer, state.player.x, state.player.y)) return false;
  // Territory types like T.FOREST are now cover types, so check cover first, fall back to ground
  const pt = biomeAt(state.player.layer, state.player.x, state.player.y);
  return mon.territory.includes(pt);
}

function monInOwnTerritory(mon){
  if (!mon.territory || !mon.territory.length) return true;
  // Check cover first (e.g. T.FOREST is cover), fall back to ground
  const mt = biomeAt(state.player.layer, mon.x, mon.y);
  return mon.territory.includes(mt);
}

// ==================== ENEMY VISION ====================
// Monster vision radius — delegates to the shared creatureViewRadius in player.js
// so that Visual-to-depth scaling is defined in exactly one place.
// Visual 1 = 3 tiles (day), Visual 10 = 7 tiles (day).
// Night / underground = hard 1 tile cone depth, unless nightVision (full daytime base).
// Blindsight creatures bypass vision entirely (proximity-only detection).
function monsterViewRadius(mon){
  // Blindsight creatures don't use vision at all (handled separately)
  if (mon.mods && mon.mods.blindsight != null) return 0;

  const nightVision = !!(mon.mods && mon.mods.nightVision);
  return creatureViewRadius(mon.vis, state.player.layer, { nightVision });
}

// Can the monster see the player's tile?  (vision range + LOS, no stealth check)
// Used by idle-state aggro logic which handles stealth separately.
// Trees are probabilistically transparent based on the monster's Visual.
function canSeePlayerTile(mon){
  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);

  // Blindsight — proximity detection, ignores LOS and light entirely
  if (mon.mods && mon.mods.blindsight != null){
    return d <= mon.mods.blindsight;
  }

  // Quick distance reject — skip expensive LOS if out of vision range
  const vr = monsterViewRadius(mon);
  if (d > vr) return false;

  // LOS raycast with probabilistic tree transparency.
  // Each tree tile in the line independently rolls against the monster's
  // Visual-based chance. A failed roll blocks the sightline.
  return hasLOS(state.player.layer, mon.x, mon.y, state.player.x, state.player.y, mon.vis);
}

// Full detection check: can the monster see the player's tile AND detect them
// through stealth?  Used by chase/search states where stealth is bundled in.
function canSeePlayer(mon){
  if (!canSeePlayerTile(mon)) return false;

  // Stealth gate — even if the tile is visible, a stealthed player may go unnoticed
  if (state.player.stealth){
    const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);
    if (d > 1){
      const chance = stealthDetectChance(mon);
      return roll100() <= chance;
    }
  }
  return true;
}

function enemyAct(mon){
  // ---- Relative speed system (PTW-based) ----
  // Compare enemy's power-to-weight ratio to the player's.
  // Slower enemies may skip their turn; faster enemies always act
  // (and may earn a bonus move in the separate pass after all normal actions).
  const player = state.player;
  const monPTW  = mon.strength / mon.siz;
  const plrPTW  = player.strength / player.siz;
  const spdRatio = monPTW / plrPTW;

  mon._actedNormally = false;  // reset — set true if the enemy takes a normal action

  if (spdRatio < 1) {
    // Enemy is slower — may skip this turn entirely
    const actionChance = Math.max(spdRatio, MIN_ACTION_CHANCE);
    if (Math.random() >= actionChance) {
      return;  // skipped — no action at all this turn
    }
  }
  // If spdRatio >= 1, enemy always acts (bonus move handled in endPlayerTurn)

  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);

  // ---- Instant turn check for cone-vision enemies ----
  // If the enemy has cone vision and needs to face a new direction for its
  // intended action, roll against its Size-based instant turn chance.
  // On failure, the enemy spends its action turning only.
  if (mon.visionType === 'cone' && mon.facing) {
    let desiredDx = 0, desiredDy = 0;
    // Determine desired direction from current AI state
    if (mon.key === 'hare' && (d <= 4 || mon.wasAttacked || mon.alerted)) {
      // Fleeing — away from player
      desiredDx = Math.sign(mon.x - player.x) || (Math.random() < 0.5 ? 1 : -1);
      desiredDy = Math.sign(mon.y - player.y) || (Math.random() < 0.5 ? 1 : -1);
    } else if (mon.aiState === 'chase') {
      const tx = (mon.lastSeenX >= 0 && !canSeePlayerTile(mon)) ? mon.lastSeenX : player.x;
      const ty = (mon.lastSeenY >= 0 && !canSeePlayerTile(mon)) ? mon.lastSeenY : player.y;
      desiredDx = Math.sign(tx - mon.x);
      desiredDy = Math.sign(ty - mon.y);
    } else if (mon.aiState === 'search' && mon.lastSeenX >= 0) {
      desiredDx = Math.sign(mon.lastSeenX - mon.x);
      desiredDy = Math.sign(mon.lastSeenY - mon.y);
    }
    // Only roll if the creature actually needs to change direction
    if ((desiredDx !== 0 || desiredDy !== 0)
        && (mon.facing.dx !== desiredDx || mon.facing.dy !== desiredDy)) {
      const steps = facingSteps(mon.facing.dx, mon.facing.dy, desiredDx, desiredDy);
      const baseChance = (STAT_MAX + 1 - mon.siz) * TURN_AGILITY_COEFF / 100;
      const instantTurnChance = Math.min(1, baseChance * (5 - steps) / 3);
      mon.facing.dx = desiredDx;
      mon.facing.dy = desiredDy;
      if (Math.random() >= instantTurnChance) {
        // Failed — spent action turning, no further action
        mon._actedNormally = true;  // counts as having acted (for bonus move eligibility)
        return;
      }
    }
  }

  // Enemy passed speed + turn checks — mark as having acted normally.
  // This flag is read by the bonus move pass in endPlayerTurn.
  mon._actedNormally = true;

  // ── Facing initialization for large herbivore (cave_crab) ──
  // The crab AI template never initializes mon.facing, but this Clade A
  // creature needs it for directional exposure (shove/kick zones, head
  // reachability).  All movement helpers guard on `if (mon.facing)`, so
  // without an object here facing is never updated.  Default to south to
  // match the rendering fallback, then let normal movement overwrite it.
  if (!mon.facing && mon.key === 'cave_crab') {
    mon.facing = { dx: 0, dy: 1 };
  }

  // ====== IMMOBILIZED CHECK ======
  // Creatures with all locomotion zones destroyed can't move but can still
  // attack if adjacent to a target and have surviving attack zones.
  if (mon.immobilized) {
    const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);
    if (d <= 1) {
      // Mushroom touch is special (enzyme contact, not zone-based attack)
      if (mon.key === 'mushroom') {
        mushroomTouch(mon);
      } else {
        const monBodyMap = getBodyMap(mon);
        const hasAttacks = !monBodyMap || getAvailableAttacks(monBodyMap).length > 0;
        if (hasAttacks) monsterMelee(mon);
      }
    }
    return;  // can't move regardless
  }

  // ====== NO ATTACKS CHECK ======
  // Creatures with zero available attacks flee from the player if they have
  // flee behavior, otherwise just wander. Mushrooms are exempt (enzyme touch).
  if (mon.key !== 'mushroom') {
    const _monBodyMap = getBodyMap(mon);
    if (_monBodyMap && getAvailableAttacks(_monBodyMap).length === 0) {
    const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);
    if (d <= 6) {
      // Flee from player
      const fdx = Math.sign(mon.x - state.player.x);
      const fdy = Math.sign(mon.y - state.player.y);
      const nx = mon.x + (fdx || (rand()<0.5?1:-1));
      const ny = mon.y + (fdy || (rand()<0.5?1:-1));
      if (inBounds(state.player.layer, nx, ny)
          && isWalkable(worlds[state.player.layer][ny][nx], getCover(state.player.layer, nx, ny))
          && !monsterAt(nx,ny,state.player.layer) && !(nx===state.player.x && ny===state.player.y)){
        if (mon.facing) { mon.facing.dx = Math.sign(nx - mon.x); mon.facing.dy = Math.sign(ny - mon.y); }
        mon.x = nx; mon.y = ny;
      }
    } else {
      if (rand() < 0.15) wanderInTerritory(mon);
    }
    return;
  }
  } // end mushroom exemption for no-attacks check

  // Eels always heal +1 HP in water per turn
  // T.WATER, T.UWATER, T.BEACH are ground types — read from worlds directly
  if (mon.mods && mon.mods.waterHeal && mon.hp < mon.hpMax){
    const mt = inBounds(state.player.layer, mon.x, mon.y) ? worlds[state.player.layer][mon.y][mon.x] : -1;
    if (mt === T.WATER || mt === T.UWATER || mt === T.BEACH){
      mon.hp = Math.min(mon.hpMax, mon.hp + 1);
    }
  }

  // ====== BIOME LEASH ENFORCEMENT ======
  // If the creature is beyond its leash distance from home biome, redirect
  // toward home. It can still melee if adjacent but won't chase further.
  if (!isWaterLocked(mon) && !mon.isBoss){
    const leashDist = getLeashDist(mon);
    const homeDist  = distFromHomeBiome(mon, state.player.layer);
    if (homeDist > leashDist){
      // Fight back if adjacent (melee only — no pursuit)
      if (d <= 1 && (mon.wasAttacked || mon.alerted)){
        if (mon.key === 'mushroom') mushroomTouch(mon);
        else monsterMelee(mon);
      }
      // Retreat toward nearest home tile
      const home = nearestHomeTilePos(mon, state.player.layer);
      if (home) moveMonsterToward(mon, home.x, home.y);
      // Reset pursuit state
      mon.aiState = 'idle';
      mon.alerted = false;
      mon.chaseTurnsLeft = 0;
      mon.searchTurnsLeft = 0;
      mon.wasAttacked = false;
      if (mon.clade && mon.clade.sync){
        mon.swarmPhase = 'passive';
        mon.coalesceTick = 0;
      }
      return;
    }
  }

  // ====== CLADE B TERRITORY RADIUS ENFORCEMENT ======
  // Creatures with clade.territorial = true are leashed to a fixed radius
  // around their home position.  This is separate from the biome-based leash
  // above — it's a hard spatial boundary centered on spawn point.
  if (hasCladeTerritory(mon) && !mon.isBoss){
    const monDistHome = chebyshev(mon.x, mon.y, mon.homeX, mon.homeY);
    const playerDistHome = chebyshev(state.player.x, state.player.y, mon.homeX, mon.homeY);

    // Monster has strayed too far beyond territory — retreat home immediately
    if (monDistHome > mon.territoryRadius + 2){
      mon.aiState = 'idle';
      mon.alerted = false;
      mon.chaseTurnsLeft = 0;
      mon.searchTurnsLeft = 0;
      if (mon.clade && mon.clade.sync){
        mon.swarmPhase = 'passive';
        mon.coalesceTick = 0;
      }
      moveMonsterToward(mon, mon.homeX, mon.homeY);
      return;
    }

    // Player left territory — disengage, stop chasing, return home
    if (playerDistHome > mon.territoryRadius){
      if (mon.aiState === 'chase' && d <= 10){
        log(`${mon.name} breaks off and retreats.`, 'muted');
      }
      mon.aiState = 'idle';
      mon.alerted = false;
      mon.chaseTurnsLeft = 0;
      mon.searchTurnsLeft = 0;
      mon.wasAttacked = false;
      if (mon.clade && mon.clade.sync){
        mon.swarmPhase = 'passive';
        mon.coalesceTick = 0;
      }
      if (monDistHome > 2) moveMonsterToward(mon, mon.homeX, mon.homeY);
      else if (rand() < 0.10) wanderInTerritory(mon);
      return;
    }
  }

  // Small grazers — always passive, never aggro. Flee from threats, never chase/attack.
  if (mon.key === 'hare' || (mon.icon && mon.icon === 'HARE')){
    // If player is nearby or grazer was attacked/alerted, flee
    if (d <= 4 || mon.wasAttacked || mon.alerted){
      const fdx = Math.sign(mon.x - state.player.x);
      const fdy = Math.sign(mon.y - state.player.y);
      const nx = mon.x + (fdx || (rand()<0.5?1:-1));
      const ny = mon.y + (fdy || (rand()<0.5?1:-1));
      if (inBounds(state.player.layer, nx, ny)
          && isWalkable(worlds[state.player.layer][ny][nx], getCover(state.player.layer, nx, ny))
          && !monsterAt(nx,ny,state.player.layer) && !(nx===state.player.x && ny===state.player.y)
          && !wouldExceedTerritory(mon, nx, ny)){
        // Update facing to match flee direction
        if (mon.facing) { mon.facing.dx = Math.sign(nx - mon.x); mon.facing.dy = Math.sign(ny - mon.y); }
        mon.x = nx; mon.y = ny;
      } else {
        wanderInTerritory(mon);
      }
      // Reset any combat state — hares never fight
      mon.aiState = 'idle';
      mon.alerted = false;
      mon.wasAttacked = false;
      mon.chaseTurnsLeft = 0;
      mon.searchTurnsLeft = 0;
      return;
    }
    // Otherwise just peacefully wander
    if (rand() < 0.15) wanderInTerritory(mon);
    return;
  }

  // ====== SYNC SWARM AI ======
  // Creatures with clade.sync === true always use swarm AI — never the normal state machine.
  // This intercept catches them in any aiState (idle, chase from mobbing, etc.)
  if (mon.clade && mon.clade.sync){
    syncSwarmAI(mon);
    return;
  }

  // ====== AMBUSH PREDATOR AI ======
  // Territory leash (disengage + retreat) is handled by the general Clade B
  // territory radius enforcement above.  If we reach here, the player is
  // inside the territory — fall through to the normal state machine for
  // standard aggro/chase behavior.

  // ====== WATER-LOCKED AQUATIC AI ======
  // Aquatic enemies never leave water. They attack from
  // the water's edge and give up if the player moves away.
  if (isWaterLocked(mon)){
    // If adjacent, attack regardless of target terrain
    if (d <= 1){ monsterMelee(mon); return; }

    // Chase: only pursue while the player is adjacent to water we could reach
    if (mon.aiState === 'chase'){
      if (!playerAdjacentToWater(state.player.layer)){
        // Player left the waterside — give up
        mon.aiState = 'idle';
        mon.alerted = false;
        mon.wasAttacked = false;
        mon.chaseTurnsLeft = 0;
        mon.searchTurnsLeft = 0;
        return;
      }
      if (canSeePlayer(mon)){
        mon.chaseTurnsLeft = mon.chase;
        mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
        moveMonsterToward(mon, state.player.x, state.player.y);
        return;
      }
      mon.chaseTurnsLeft--;
      if (mon.chaseTurnsLeft <= 0){
        mon.aiState = 'idle';
        mon.alerted = false;
      } else if (mon.lastSeenX >= 0){
        moveMonsterToward(mon, mon.lastSeenX, mon.lastSeenY);
      }
      return;
    }

    // Idle: detect player and transition to chase, or wander within water
    if (mon.wasAttacked){
      mon.aiState = 'chase';
      mon.alerted = true;
      mon.chaseTurnsLeft = mon.chase;
      mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      return;
    }
    if (canSeePlayer(mon)){
      mon.aiState = 'chase';
      mon.alerted = true;
      mon.chaseTurnsLeft = mon.chase;
      mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      return;
    }
    if (rand() < 0.15) wanderInTerritory(mon);
    return;
  }

  // Rock golem 'still' personality — won't move until it has taken 10% max HP damage
  if (mon.personality === 'still' && mon.key === 'rock_golem'){
    if (mon.damageTaken < mon.hpMax * 0.10){
      // Just stand there. If player adjacent, attack but don't move
      if (d <= 1 && mon.wasAttacked){ monsterMelee(mon); }
      return;
    }
    // Once threshold met, act normally (becomes 'active' effectively)
  }

  // Rock golem 'roaming' personality — peacefully wanders, doesn't attack unless hit
  if (mon.personality === 'roaming' && mon.key === 'rock_golem' && !mon.wasAttacked){
    if (rand() < 0.15) wanderInTerritory(mon);
    return;
  }

  // Meso/apex predator 'skittish' personality — flee at low HP
  if (mon.personality === 'skittish' && (mon.key === 'wolf' || mon.key === 'dire_wolf')){
    if (mon.hp < mon.hpMax * 0.3 && d <= 3){
      // Run away from player
      const fdx = Math.sign(mon.x - state.player.x);
      const fdy = Math.sign(mon.y - state.player.y);
      const nx = mon.x + (fdx || (rand()<0.5?1:-1));
      const ny = mon.y + (fdy || (rand()<0.5?1:-1));
      if (inBounds(state.player.layer, nx, ny)
          && isWalkable(worlds[state.player.layer][ny][nx], getCover(state.player.layer, nx, ny))
          && !monsterAt(nx,ny,state.player.layer)){
        if (mon.facing) { mon.facing.dx = Math.sign(nx - mon.x); mon.facing.dy = Math.sign(ny - mon.y); }
        mon.x = nx; mon.y = ny;
      }
      return;
    }
  }

  // Blood loss flee — Tier 3 creatures (central > 40) flee at critical blood level
  if (mon.blood != null && mon.bloodMax > 0 && mon.central > 40) {
    if (mon.blood < mon.bloodMax * BLOOD_CRITICAL_THRESHOLD && d <= 6) {
      // Flee from player — blood loss is critical
      const fdx = Math.sign(mon.x - state.player.x);
      const fdy = Math.sign(mon.y - state.player.y);
      const nx = mon.x + (fdx || (rand()<0.5?1:-1));
      const ny = mon.y + (fdy || (rand()<0.5?1:-1));
      if (inBounds(state.player.layer, nx, ny)
          && isWalkable(worlds[state.player.layer][ny][nx], getCover(state.player.layer, nx, ny))
          && !monsterAt(nx,ny,state.player.layer)){
        if (mon.facing) { mon.facing.dx = Math.sign(nx - mon.x); mon.facing.dy = Math.sign(ny - mon.y); }
        mon.x = nx; mon.y = ny;
      }
      return;
    }
  }

  // Predator pair bonding — try to stay within 3 tiles of partner
  if (mon.personality === 'pair_bond' && mon.bondPartner){
    const partner = mon.bondPartner;
    if (partner.hp > 0){
      const pd = chebyshev(mon.x, mon.y, partner.x, partner.y);
      if (pd > 3 && mon.aiState === 'idle' && rand() < 0.6){
        moveMonsterToward(mon, partner.x, partner.y);
        return;
      }
      // If partner is in combat, join
      if (partner.alerted && partner.aiState === 'chase' && !mon.alerted){
        mon.alerted = true;
        mon.aiState = 'chase';
        mon.chaseTurnsLeft = mon.chase;
        mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      }
    }
  }

  // Goblin 'wary' — won't attack alone, needs another goblin nearby
  if (mon.personality === 'wary' && mon.key === 'goblin' && mon.aiState === 'idle'){
    const nearGoblins = monstersHere().filter(m =>
      m.hp > 0 && m.key === 'goblin' && m !== mon && chebyshev(m.x,m.y,mon.x,mon.y) <= 4
    );
    if (nearGoblins.length === 0 && !mon.wasAttacked){
      if (rand() < 0.15) wanderInTerritory(mon);
      return;
    }
  }

  // Goblin/predator 'leader' — when entering combat, alert nearby same-type
  if (mon.personality === 'leader' && mon.aiState === 'chase' && mon.alerted){
    const followerType = mon.key;
    for (const m of monstersHere()){
      if (m.hp <= 0 || m === mon || m.key !== followerType) continue;
      if (chebyshev(m.x,m.y,mon.x,mon.y) <= 6 && !m.alerted){
        m.alerted = true;
        m.aiState = 'chase';
        m.chaseTurnsLeft = m.chase;
        m.lastSeenX = state.player.x; m.lastSeenY = state.player.y;
      }
    }
  }

  // Treant 'dormant' — won't respond to nearby treant combat, only direct hits
  if (mon.personality === 'dormant' && mon.key === 'treant' && !mon.wasAttacked){
    if (rand() < 0.08) wanderInTerritory(mon);
    return;
  }

  // ====== IDLE STATE ======
  if (mon.aiState === 'idle'){
    // If attacked, ALWAYS transition to chase regardless of biome/territory
    if (mon.wasAttacked){
      mon.aiState = 'chase';
      mon.alerted = true;
      mon.chaseTurnsLeft = mon.chase;
      mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      // fall through to chase logic below
    } else {
    // Passive creatures ignore player unless attacked (handled above)
    if (mon.hostility === 0){
      // Wary predators: passive at range, but aggro if player is right next to them
      if (mon.personality === 'wary' && (mon.key === 'wolf' || mon.key === 'dire_wolf') && d <= 1){
        mon.aiState = 'chase';
        mon.alerted = true;
        mon.chaseTurnsLeft = mon.chase;
        mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
        // fall through to chase logic
      } else {
      // Treants regen in forest when idle and not alerted (Size-based rest healing)
      // T.FOREST is now a cover type — check cover layer
      if (mon.key === 'treant' && !mon.alerted && mon.hp < mon.hpMax){
        const mc = getCover(state.player.layer, mon.x, mon.y);
        if (mc === T.FOREST){
          const heal = restHealAmount(mon);
          if (heal > 0) mon.hp = Math.min(mon.hpMax, mon.hp + heal);
        }
      }
      if (rand() < 0.15) wanderInTerritory(mon);
      return;
      }
    }
    // Territorial: only engage if can SEE the player AND player is in their territory
    if (mon.hostility === 1){
      if (!canSeePlayerTile(mon) || !playerInTerritory(mon)){
        if (rand() < 0.15) wanderInTerritory(mon);
        return;
      }
    }
    // Aggressive: engage if can see the player (territory check relaxed — still prefer home)
    if (mon.hostility === 2){
      if (!canSeePlayerTile(mon)){
        if (rand() < 0.2) wanderInTerritory(mon);
        return;
      }
      // Won't chase into foreign biome unless player is VERY close
      if (!playerInTerritory(mon) && d > 3){
        if (rand() < 0.15) wanderInTerritory(mon);
        return;
      }
    }
    // Check stealth
    if (state.player.stealth && d > 1){
      const chance = stealthDetectChance(mon);
      if (roll100() > chance){
        if (rand() < 0.2) wanderInTerritory(mon);
        return;
      }
      log(`${mon.name} spotted you!`, 'warn');
    }
    // Don't initiate chase if already at leash limit
    if (mon.chase < 99){
      const leashDist = getLeashDist(mon);
      const homeDist  = distFromHomeBiome(mon, state.player.layer);
      if (homeDist >= leashDist){
        if (rand() < 0.15) wanderInTerritory(mon);
        return;
      }
    }
    // Transition to chase
    mon.aiState = 'chase';
    mon.alerted = true;
    mon.chaseTurnsLeft = mon.chase;
    mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
    } // end else (not wasAttacked)
  }

  // ====== CHASE STATE ======
  if (mon.aiState === 'chase'){
    // Treants NEVER leave forest, even when attacked
    if (mon.key === 'treant' && !monInOwnTerritory(mon)){
      if (d <= 8) log(`${mon.name} retreats into the trees.`, 'muted');
      mon.aiState = 'idle';
      mon.alerted = false;
      mon.wasAttacked = false;
      mon.chaseTurnsLeft = 0;
      mon.searchTurnsLeft = 0;
      return;
    }
    // Biome avoidance — predators (and any monster with avoidBiomes) give up
    // chase when they've wandered too deep into avoided terrain.
    if (mon.avoidBiomes && mon.avoidBiomes.length && mon.chase < 99){
      const monGround = worlds[state.player.layer][mon.y][mon.x];
      if (mon.avoidBiomes.includes(monGround)){
        mon._avoidTicks = (mon._avoidTicks || 0) + 1;
        if (mon._avoidTicks >= (mon.avoidLeash || 3)){
          if (d <= 8) log(`${mon.name} turns back.`, 'muted');
          mon.aiState = 'idle';
          mon.alerted = false;
          mon.chaseTurnsLeft = 0;
          mon.searchTurnsLeft = 0;
          mon._avoidTicks = 0;
          return;
        }
      } else {
        mon._avoidTicks = 0;  // reset when back on comfortable ground
      }
    }
    // Soft territory drain: when both monster and player are outside the
    // monster's preferred territory, chase turns tick down faster (2× rate).
    // This is a gentle leash, not a hard stop — the monster still fights
    // normally, it just loses interest sooner.
    if (!monInOwnTerritory(mon) && !playerInTerritory(mon) && mon.chase < 99){
      mon.chaseTurnsLeft = Math.max(0, mon.chaseTurnsLeft - 1);  // extra drain
    }
    if (canSeePlayer(mon)){
      mon.chaseTurnsLeft = mon.chase;  // refresh on sight
      mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      if (d <= 1){ monsterMelee(mon); return; }
      moveMonsterToward(mon, state.player.x, state.player.y);
      return;
    }
    // Lost sight
    mon.chaseTurnsLeft--;
    if (mon.chaseTurnsLeft > 0){
      // Move toward last known position
      if (mon.lastSeenX >= 0){
        if (mon.x === mon.lastSeenX && mon.y === mon.lastSeenY){
          // Reached it — transition to search if smart
          if (mon.search > 0){
            mon.aiState = 'search';
            mon.searchTurnsLeft = mon.search;
          } else {
            mon.aiState = 'idle';
            mon.alerted = false;
          }
        } else {
          moveMonsterToward(mon, mon.lastSeenX, mon.lastSeenY);
        }
        return;
      }
    }
    // Chase expired
    if (mon.search > 0){
      mon.aiState = 'search';
      mon.searchTurnsLeft = mon.search;
    } else {
      mon.aiState = 'idle';
      mon.alerted = false;
    }
    return;
  }

  // ====== SEARCH STATE ======
  if (mon.aiState === 'search'){
    if (canSeePlayer(mon)){
      // Re-acquired — back to chase
      mon.aiState = 'chase';
      mon.chaseTurnsLeft = mon.chase;
      mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
      return;
    }
    mon.searchTurnsLeft--;
    if (mon.searchTurnsLeft <= 0){
      mon.aiState = 'idle';
      mon.alerted = false;
      return;
    }
    // Wander — slightly toward last known spot but with randomness
    if (rand() < 0.5 && mon.lastSeenX >= 0){
      moveMonsterToward(mon, mon.lastSeenX, mon.lastSeenY);
    } else {
      wanderInTerritory(mon);
    }
  }
}

// ==================== SYNC SWARM AI ====================
// Generic swarm behavior for any creature with clade.sync === true.
// Reads syncRange from clade data and counts nearby same-species creatures.
// Phase 1 — Passive:  wander slowly, ignore player entirely
// Phase 2 — Coalescing: drift toward player when enough nearby allies (syncCount >= SYNC_COALESCE_THRESHOLD)
// Phase 3 — Mobbing: full convergence when packed tight (SYNC_MOB_THRESHOLD within half syncRange)

/** Min same-species neighbors (at full syncRange) to start drifting toward player. */
const SYNC_COALESCE_THRESHOLD = 3;
/** Min same-species neighbors (at half syncRange) to trigger full hostile convergence. */
const SYNC_MOB_THRESHOLD = 5;
/** Max distance from nearest mobbing ally before a mobbing creature resets. */
const SWARM_LEASH_DISTANCE = 6;
/** Radius to count as "local group" for mobbing transition and reset. */
const SWARM_GROUP_RADIUS = 8;

/**
 * Count living creatures with the same species key within `radius` tiles of `mon`.
 * Does not count `mon` itself.
 */
function countSyncNeighbors(mon, radius){
  let count = 0;
  for (const m of monstersHere()){
    if (m === mon || m.hp <= 0 || m.key !== mon.key) continue;
    if (chebyshev(m.x, m.y, mon.x, mon.y) <= radius) count++;
  }
  return count;
}

function syncSwarmAI(mon){
  const syncRange = mon.clade.syncRange;
  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);

  // ---- Compute sync counts at start of turn ----
  mon.syncCount = countSyncNeighbors(mon, syncRange);

  // ---- MOBBING PHASE ----
  if (mon.swarmPhase === 'mobbing'){
    // Reset check: if player is beyond leash from ALL mobbing allies, disperse
    const mobbingNearby = monstersHere().filter(m =>
      m.hp > 0 && m.key === mon.key && m.swarmPhase === 'mobbing'
      && chebyshev(m.x, m.y, state.player.x, state.player.y) <= SWARM_LEASH_DISTANCE
    );
    if (mobbingNearby.length === 0){
      // Entire group resets — player escaped
      for (const m of monstersHere()){
        if (m.hp > 0 && m.key === mon.key && m.swarmPhase === 'mobbing'){
          m.swarmPhase = 'passive';
          m.alerted = false;
          m.aiState = 'idle';
        }
      }
      return;
    }
    // Individual check: if THIS creature is too far, it also resets
    if (d > SWARM_LEASH_DISTANCE + 2){
      mon.swarmPhase = 'passive';
      mon.alerted = false;
      mon.aiState = 'idle';
      return;
    }
    // Adjacent → species-specific attack
    if (d <= 1){
      if (mon.key === 'mushroom') mushroomTouch(mon);
      else monsterMelee(mon);
      return;
    }
    // Close in on the player
    moveMonsterToward(mon, state.player.x, state.player.y);
    return;
  }

  // ---- PASSIVE PHASE ----
  // Far from player or player not in detection zone — just wander slowly
  if (d > 10){
    if (rand() < 0.10) wanderInTerritory(mon);
    mon.swarmPhase = 'passive';
    return;
  }

  // Player is within awareness range — transition to coalescing if enough allies nearby
  if (mon.swarmPhase === 'passive'){
    // Don't detect stealth at all — chemotrophs have zero perception
    if (state.player.stealth) {
      if (rand() < 0.10) wanderInTerritory(mon);
      return;
    }
    // Only begin coalescing if enough same-species are nearby
    if (mon.syncCount >= SYNC_COALESCE_THRESHOLD){
      mon.swarmPhase = 'coalescing';
      mon.coalesceTick = 0;
    } else {
      if (rand() < 0.10) wanderInTerritory(mon);
      return;
    }
  }

  // ---- COALESCING PHASE ----
  if (mon.swarmPhase === 'coalescing'){
    // If player stealths during coalescing, stop drifting and reset
    if (state.player.stealth){
      mon.swarmPhase = 'passive';
      if (rand() < 0.10) wanderInTerritory(mon);
      return;
    }

    // If sync neighbors dropped below coalesce threshold, fall back to passive
    if (mon.syncCount < SYNC_COALESCE_THRESHOLD){
      mon.swarmPhase = 'passive';
      if (rand() < 0.10) wanderInTerritory(mon);
      return;
    }

    // Check mob trigger: enough same-species packed within half syncRange
    const mobCount = countSyncNeighbors(mon, Math.max(1, Math.floor(syncRange / 2)));
    if (mobCount >= SYNC_MOB_THRESHOLD){
      // Colony convergence! All same-species in local group go hostile simultaneously
      const localGroup = monstersHere().filter(m =>
        m.hp > 0 && m.key === mon.key
        && chebyshev(m.x, m.y, state.player.x, state.player.y) <= SWARM_GROUP_RADIUS
      );
      for (const m of localGroup){
        m.swarmPhase = 'mobbing';
        m.alerted = true;
        m.aiState = 'chase';
      }
      log('The colony converges — you\'re surrounded!', 'warn');
      // This creature acts immediately if adjacent
      if (d <= 1){
        if (mon.key === 'mushroom') mushroomTouch(mon);
        else monsterMelee(mon);
      } else {
        moveMonsterToward(mon, state.player.x, state.player.y);
      }
      return;
    }

    // Slow organic drift toward player — 1 step every 2-3 turns with directional noise
    mon.coalesceTick = (mon.coalesceTick || 0) + 1;
    const driftInterval = 2 + (mon.coalesceTick % 3 === 0 ? 1 : 0); // 2 or 3 turns
    if (mon.coalesceTick % driftInterval !== 0){
      // Not moving this turn — maybe a tiny random shuffle
      if (rand() < 0.08) wanderInTerritory(mon);
      return;
    }

    // Drift toward player with angular offset for encirclement feel
    if (d > 2){
      const angle = Math.atan2(state.player.y - mon.y, state.player.x - mon.x);
      // Each creature gets a consistent angular offset based on position hash
      const offset = ((mon.x * 31 + mon.y * 17) % 5 - 2) * 0.6;
      const driftAngle = angle + offset;
      // Target a spot 2 tiles from player at that angle
      const tx = state.player.x - Math.round(Math.cos(driftAngle) * 2);
      const ty = state.player.y - Math.round(Math.sin(driftAngle) * 2);
      // Add some noise — sometimes just wander instead
      if (rand() < 0.25){
        wanderInTerritory(mon);
      } else {
        moveMonsterToward(mon, tx, ty);
      }
    } else {
      // Already close — hold position, maybe shuffle slightly
      if (rand() < 0.15) wanderInTerritory(mon);
    }
    return;
  }
}

// Backward-compatible alias — external callers may still reference this name
const mushroomPackAI = syncSwarmAI;

// Chemotroph enzyme touch — zero physical damage, flat poison chance
function mushroomTouch(mon){
  const player = state.player;
  if (player.hp <= 0) return;

  // No hit/miss roll for touch — it's automatic contact
  log(`${mon.name} presses close — caustic enzymes burn.`, 'muted');

  // Flat poison chance vs player's poison resistance
  const poisonResist = poisonResistance(player);
  const baseChance = mon.sporeHeavy ? 70 : 55;  // enzyme-heavy variant = higher base
  const poisonChance = Math.max(5, baseChance - poisonResist.chanceReduction);

  if (roll100() <= poisonChance){
    state.player.effects.push({
      type: 'poison',
      turns: Math.max(2, 4 - Math.floor(poisonResist.durationReduction)),
      percentDmg: 0.03,  // 3% max HP per tick
      flatDmg: 1,        // +1 flat per tick
    });
    const stacks = state.player.effects.filter(e => e.type === 'poison').length;
    if (stacks === 1) log('Enzymes seep in — you are poisoned!', 'warn');
    else log(`Enzymatic damage stacks! (×${stacks})`, 'warn');
  }
  if (state.player.stealth) endStealth('Your cover is blown!');
}

// Wander only within territory if possible
function wanderInTerritory(mon){
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  // Shuffle
  for (let i=dirs.length-1;i>0;i--){ const j=randi(i+1); [dirs[i],dirs[j]]=[dirs[j],dirs[i]]; }
  const waterLock = isWaterLocked(mon);
  for (const [dx,dy] of dirs){
    const nx = mon.x+dx, ny = mon.y+dy;
    if (!inBounds(state.player.layer, nx, ny)) continue;
    const ground = worlds[state.player.layer][ny][nx];
    const cover = getCover(state.player.layer, nx, ny);
    if (!isWalkable(ground, cover)) continue;
    // Water-locked: only step onto water tiles
    if (waterLock && !WATER_TILES.has(ground)) continue;
    // Biome leash: never step onto forbidden tiles
    if (isForbiddenTile(mon, state.player.layer, nx, ny)) continue;
    // Territory radius: never wander beyond home range
    if (wouldExceedTerritory(mon, nx, ny)) continue;
    if (monsterAt(nx, ny, state.player.layer)) continue;
    if (nx === state.player.x && ny === state.player.y) continue;
    // Prefer staying in home territory — check biome from cover || ground
    const nt = cover || ground;
    if (mon.territory.length && !mon.territory.includes(nt) && rand() < 0.7) continue;
    mon.x = nx; mon.y = ny;
    // Update facing to match wander direction
    if (mon.facing) { mon.facing.dx = dx; mon.facing.dy = dy; }
    return;
  }
}

function moveMonsterToward(mon, tx, ty, movementOnly){
  const dx = Math.sign(tx - mon.x);
  const dy = Math.sign(ty - mon.y);
  const attempts = [];
  if (dx !== 0 && dy !== 0) attempts.push([dx,dy],[dx,0],[0,dy]);
  else if (dx !== 0) attempts.push([dx,0],[dx,1],[dx,-1]);
  else attempts.push([0,dy],[1,dy],[-1,dy]);
  const waterLock = isWaterLocked(mon);
  for (const [ax,ay] of attempts){
    const nx = mon.x+ax, ny = mon.y+ay;
    if (!inBounds(state.player.layer, nx, ny)) continue;
    if (!isWalkable(worlds[state.player.layer][ny][nx], getCover(state.player.layer, nx, ny))) continue;
    // Water-locked monsters can melee the player from water, but never step on land
    if (nx === state.player.x && ny === state.player.y){
      if (movementOnly) return;  // bonus move — no attacks allowed
      monsterMelee(mon); return;
    }
    if (waterLock && !WATER_TILES.has(worlds[state.player.layer][ny][nx])) continue;
    // Biome leash: never step onto forbidden tiles
    if (isForbiddenTile(mon, state.player.layer, nx, ny)) continue;
    // Territory radius: don't step further from home beyond territory boundary.
    // Retreat toward home is always allowed (newDist <= curDist).
    if (hasCladeTerritory(mon)){
      const curDist = chebyshev(mon.x, mon.y, mon.homeX, mon.homeY);
      const newDist = chebyshev(nx, ny, mon.homeX, mon.homeY);
      if (newDist > mon.territoryRadius && newDist > curDist) continue;
    }
    if (monsterAt(nx, ny, state.player.layer)) continue;
    mon.x = nx; mon.y = ny;
    // Update facing to match movement direction
    if (mon.facing) { mon.facing.dx = ax; mon.facing.dy = ay; }
    return;
  }
}

// Old aliases kept for compatibility
function wanderMonster(mon){ wanderInTerritory(mon); }
function moveMonsterTowardPlayer(mon){ moveMonsterToward(mon, state.player.x, state.player.y); }

export function monsterMelee(mon){
  const player = state.player; // Define local reference to player
  if (player.hp <= 0) return;

  // Check if monster has available attacks (zone destruction may have removed them)
  const monBodyMap = getBodyMap(mon);
  let availableAttacks = [];
  if (monBodyMap) {
    availableAttacks = getAvailableAttacks(monBodyMap);
    if (availableAttacks.length === 0) return;  // no attacks available
  }

  // Face the target when attacking — ensures directional exposure zones
  // (front shove, rear kick, head reachability) are correct for this hit
  // and for the player's next retaliatory strike.
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
    // Pick a random attack from the monster's available attacks
    usedAttack = availableAttacks[randi(availableAttacks.length)];
    attackingZone = monBodyMap.find(z => z.key === usedAttack.sourceZone);

    // Determine player facing (use state.facing)
    const defFacing = state.facing || { dx: 0, dy: 1 };

    // Attack direction from monster position into player's frame
    const attackDir = getAttackDirection(
      { x: mon.x, y: mon.y },
      { x: player.x, y: player.y },
      defFacing
    );

    // Build exposed zone pool on the player
    const exposedZones = getExposedZones(playerBodyMap, attackDir);

    if (exposedZones.length > 0 && attackingZone) {
      // Compute footprint
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

  // Prompt H: creature-wide HP is no longer decremented by combat damage.
  // Death is determined by zone destruction (vital/neural/blood) only.
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

      // Per-zone structural armor
      const zoneArmor = (zone.structural || 0) * ARMOR_PER_STRUCTURAL_KG;
      zoneDmg = Math.max(1, zoneDmg - zoneArmor);

      resolvePlayerZoneDamage(zone, zoneDmg, playerBodyMap);
    }
  }

  // Poison application — probability reduced by 75% Size / 25% Strength
  if (mon.dmgType === DMG.POISON){
    const poisonResist = poisonResistance(player);
    const baseChance = 60;  // base 60% chance to poison
    const poisonChance = Math.max(5, baseChance - poisonResist.chanceReduction);
    if (roll100() <= poisonChance){
      // Poison stacks — each stack is independent
      state.player.effects.push({
        type:'poison',
        turns: Math.max(2, 5 - Math.floor(poisonResist.durationReduction)),
        percentDmg: 0.03,   // 3% max HP per tick
        flatDmg: 1,         // +1 flat per tick
      });
      const stacks = state.player.effects.filter(e => e.type === 'poison').length;
      if (stacks === 1) log('You are poisoned!', 'warn');
      else log(`Poison stacks! (×${stacks})`, 'warn');
    }
  }
  if (state.player.stealth) endStealth('Your cover is blown!');
}

// Resolve zone damage on the player.
// Similar to resolveZoneDamage in combat.js but for the player entity.
function resolvePlayerZoneDamage(hitZone, dmg, bodyMap) {
  if (hitZone.hp == null) return;
  hitZone.hp = Math.max(0, hitZone.hp - dmg);

  // Clotting reset — new damage tears open any clotting progress
  if (hitZone.clotting > 0) {
    hitZone.clotting = 0;
  }

  if (hitZone.hp <= 0 && !hitZone.destroyed) {
    hitZone.hp = 0;
    hitZone.destroyed = true;

    log(`Your ${hitZone.name} is destroyed!`, 'crit');

    // Blood system — destruction dump + severance burst
    const player = state.player;
    if (player.blood != null && player.bloodMax > 0) {
      // Dump — zone's blood share is lost
      const dump = hitZone.bloodShare || 0;
      player.blood -= dump;

      // Burst — severed pathway connections
      const pathways = getPathways(player);
      let severedBandwidth = 0;
      for (const pw of pathways) {
        if (pw.from === hitZone.key || pw.to === hitZone.key) {
          severedBandwidth += pw.bandwidth;
        }
      }
      const burst = severedBandwidth * BURST_COEFF * player.bloodMax;
      player.blood -= burst;

      // Clamp and recompute penalty
      player.blood = Math.max(0, player.blood);
      player.bleedPenalty = computeBleedPenalty(player);
    }

    // ── Death checks (Prompt H) — vital → neural → blood ──

    // Step 1 — Vital zone destruction (torso)
    if (hitZone.vital) {
      log(`Something vital tears loose inside you. Everything stops.`, 'dead');
      state.player.hp = 0;
      state.player.deathCause = 'vital';
      return;
    }

    // Step 2 — Neural death check
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

    // Step 3 — Blood loss death (from dump + burst)
    if (player.blood != null && player.blood <= player.bloodMax * BLOOD_DEATH_THRESHOLD) {
      log(`Everything narrows. Fades. Goes still.`, 'dead');
      state.player.hp = 0;
      state.player.deathCause = 'blood';
      return;
    }

    // Locomotion check
    if (hitZone.locomotion && !hasLocomotion(bodyMap)) {
      state.player.immobilized = true;
      log(`You collapse, unable to move.`, 'warn');
    }

    // Attack loss
    if (hitZone.attacks && hitZone.attacks.length > 0) {
      for (const atk of hitZone.attacks) {
        log(`Your ${atk.name} is gone.`, 'warn');
      }
    }

    // Sensory messages
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

export { endPlayerTurn, enemyAct, playerInTerritory, monInOwnTerritory,
         canSeePlayer, canSeePlayerTile, monsterViewRadius,
         syncSwarmAI, mushroomPackAI, mushroomTouch, wanderInTerritory, moveMonsterToward,
         wanderMonster, moveMonsterTowardPlayer,
         hasCladeTerritory, wouldExceedTerritory,
         isWaterLocked, isWaterTile, processBleed };
