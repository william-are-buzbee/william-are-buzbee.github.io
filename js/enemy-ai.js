// ==================== TURN MANAGEMENT + ENEMY AI ====================
// End-of-turn processing, monster state machine, movement, and melee.

import { state, worlds, covers, monsters } from './state.js';
import { DMG } from './constants.js';
import { T, isWalkable } from './terrain.js';
import { rand, randi, roll100 } from './rng.js';
import { playerDef, playerDodge, poisonResistance, passiveRegenInterval, restHealAmount } from './player.js';
import { monAcc, monDodge, monDamage, monCritChance, monCritMult } from './monsters.js';
import { inBounds, monsterAt, chebyshev, isTownCell, getCover } from './world-state.js';
import { log } from './log.js';
import { render } from './rendering.js';
import { endStealth, stealthDetectChance, rollHit } from './combat.js';
import { fedDrainFor } from './player-actions.js';
import { advanceTick } from './time-cycle.js';
import { saveGame } from './save-load.js';

// Forward references — set by main.js

let _onPlayerDeathCallback = null;
export function setOnPlayerDeathCallback(fn){ _onPlayerDeathCallback = fn; }
let _useActionCallback = null;
export function setUseActionCallback(fn){ _useActionCallback = fn; }


function monstersHere(){ return monsters[state.player.layer] || []; }

let turnCount = 0;

// Helper: get the effective biome type at a position (cover if present, else ground)
function biomeAt(layer, x, y){
  const c = getCover(layer, x, y);
  return c || worlds[layer][y][x];
}

// ==================== AQUATIC MOVEMENT LOCK ====================
// Fish / aquatic enemies (not crabs) are confined to water tiles.
// They can melee-attack an adjacent target on land but never step onto it.
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
    case 'mushroom':  return 0;  // NEVER leave fungal ground
    case 'scorpion':  return 2;
    case 'lurker':    return 2;
    case 'mummy':     return 3;
    case 'wolf': case 'dire_wolf':
      if (mon.personality === 'leader')      return 18;
      if (mon.personality === 'pair_bond')   return 15;
      if (mon.personality === 'lone_hunter' || mon.personality === 'skittish') return 8;
      return 10;
    case 'hare':       return 99; // flee AI handles drift
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
  // Mushrooms: fungal-only
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

  // Passive regen — scales linearly with CON, all values get regen
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

  // Enemies act — only on current layer, town cells are safe
  if (!isTownCell(state.player.layer)){
    const mons = monstersHere();
    for (const m of mons){
      if (m.hp <= 0) continue;
      enemyAct(m);
      if (state.player.hp <= 0){ _onPlayerDeathCallback && _onPlayerDeathCallback(); return; }
    }
  }
  for (const layer of Object.keys(monsters)){
    if (monsters[layer]) monsters[layer] = monsters[layer].filter(m => m.hp > 0);
  }
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

// True if monster currently has "line of sight" to player:
// simple check — within perception range and player is in monster's territory OR very close
function canSeePlayer(mon){
  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);
  if (d > Math.max(mon.aggroRange * 2, 8)) return false;
  // Stealth obscures distant detection even when alerted — closer = harder to hide
  if (state.player.stealth && d > 1){
    const chance = stealthDetectChance(mon);
    return roll100() <= chance;
  }
  return true;
}

function enemyAct(mon){
  // Speed system — accumulate energy, act only when >= 100
  mon.energy = (mon.energy || 0) + (mon.speed || 60);
  if (mon.energy < 100) return;
  mon.energy -= 100;

  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);

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
      if (mon.key === 'mushroom'){
        mon.swarmPhase = 'passive';
        mon.coalesceTick = 0;
      }
      return;
    }
  }

  // Hares — always passive, never aggro. Flee from threats, never chase/attack.
  if (mon.key === 'hare' || (mon.icon && mon.icon === 'HARE')){
    // If player is nearby or hare was attacked/alerted, flee
    if (d <= 4 || mon.wasAttacked || mon.alerted){
      const fdx = Math.sign(mon.x - state.player.x);
      const fdy = Math.sign(mon.y - state.player.y);
      const nx = mon.x + (fdx || (rand()<0.5?1:-1));
      const ny = mon.y + (fdy || (rand()<0.5?1:-1));
      if (inBounds(state.player.layer, nx, ny)
          && isWalkable(worlds[state.player.layer][ny][nx], getCover(state.player.layer, nx, ny))
          && !monsterAt(nx,ny,state.player.layer) && !(nx===state.player.x && ny===state.player.y)){
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

  // ====== MUSHROOM SWARM AI ======
  // Mushrooms always use swarm AI — never the normal state machine.
  // This intercept catches them in any aiState (idle, chase from mobbing, etc.)
  if (mon.key === 'mushroom'){
    mushroomPackAI(mon);
    return;
  }

  // ====== WATER-LOCKED AQUATIC AI ======
  // Fish / aquatic enemies (not crabs) never leave water. They attack from
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
    if (d <= mon.aggroRange && canSeePlayer(mon)){
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

  // Wolf 'skittish' personality — flee at low HP
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
        mon.x = nx; mon.y = ny;
      }
      return;
    }
  }

  // Wolf pair bonding — try to stay within 3 tiles of partner
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

  // Goblin/wolf 'leader' — when entering combat, alert nearby same-type
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
      // Treants regen in forest when idle and not alerted (CON-based rest healing)
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
    // Territorial: only engage if player is within aggro AND in their territory
    if (mon.hostility === 1){
      if (d > mon.aggroRange || !playerInTerritory(mon)){
        if (rand() < 0.15) wanderInTerritory(mon);
        return;
      }
    }
    // Aggressive: engage if within aggroRange (territory check relaxed — still prefer home)
    if (mon.hostility === 2){
      if (d > mon.aggroRange){
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
    // Biome avoidance — wolves (and any monster with avoidBiomes) give up
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

// ==================== MUSHROOM SWARM AI ====================
// Phase 1 — Passive:  wander slowly, ignore player entirely
// Phase 2 — Coalescing: drift toward player over many turns (organic, not a beeline)
// Phase 3 — Surround trigger: 4+ mushrooms within 2 tiles → ALL nearby go hostile
// Phase 4 — Mobbing: poison-touch every turn, chase briefly, reset at 6+ tile distance

/** Threshold of mushrooms within 2 tiles of player to trigger the ambush. */
const SWARM_TRIGGER_COUNT = 4;
/** Max distance from nearest swarm member before mobbing resets. */
const SWARM_LEASH_DISTANCE = 6;
/** Radius to count as "local group" for trigger and mobbing. */
const SWARM_GROUP_RADIUS = 8;

function mushroomPackAI(mon){
  const d = chebyshev(mon.x, mon.y, state.player.x, state.player.y);

  // ---- MOBBING PHASE ----
  if (mon.swarmPhase === 'mobbing'){
    // Reset check: if player is 6+ tiles from the nearest mobbing mushroom, disperse
    const mobbingNearby = monstersHere().filter(m =>
      m.hp > 0 && m.key === 'mushroom' && m.swarmPhase === 'mobbing'
      && chebyshev(m.x, m.y, state.player.x, state.player.y) <= SWARM_LEASH_DISTANCE
    );
    if (mobbingNearby.length === 0){
      // Entire group resets — player escaped
      for (const m of monstersHere()){
        if (m.hp > 0 && m.key === 'mushroom' && m.swarmPhase === 'mobbing'){
          m.swarmPhase = 'passive';
          m.alerted = false;
          m.aiState = 'idle';
        }
      }
      return;
    }
    // Individual check: if THIS mushroom is too far, it also resets
    if (d > SWARM_LEASH_DISTANCE + 2){
      mon.swarmPhase = 'passive';
      mon.alerted = false;
      mon.aiState = 'idle';
      return;
    }
    // Adjacent → poison touch
    if (d <= 1){
      mushroomTouch(mon);
      return;
    }
    // Close in on the player
    moveMonsterToward(mon, state.player.x, state.player.y);
    return;
  }

  // ---- PASSIVE PHASE ----
  // Far from player or player not in mushroom forest area — just wander slowly
  if (d > 10){
    if (rand() < 0.10) wanderInTerritory(mon);
    mon.swarmPhase = 'passive';
    return;
  }

  // Player is within awareness range — transition to coalescing
  if (mon.swarmPhase === 'passive'){
    // Don't detect stealth at all — mushrooms have zero perception
    if (state.player.stealth) {
      if (rand() < 0.10) wanderInTerritory(mon);
      return;
    }
    mon.swarmPhase = 'coalescing';
    mon.coalesceTick = 0;
  }

  // ---- COALESCING PHASE ----
  if (mon.swarmPhase === 'coalescing'){
    // If player stealths during coalescing, stop drifting and reset
    if (state.player.stealth){
      mon.swarmPhase = 'passive';
      if (rand() < 0.10) wanderInTerritory(mon);
      return;
    }

    // Check surround trigger BEFORE moving
    const nearPlayer = monstersHere().filter(m =>
      m.hp > 0 && m.key === 'mushroom'
      && chebyshev(m.x, m.y, state.player.x, state.player.y) <= 2
    );
    if (nearPlayer.length >= SWARM_TRIGGER_COUNT){
      // AMBUSH! All mushrooms in local group go hostile simultaneously
      const localGroup = monstersHere().filter(m =>
        m.hp > 0 && m.key === 'mushroom'
        && chebyshev(m.x, m.y, state.player.x, state.player.y) <= SWARM_GROUP_RADIUS
      );
      for (const m of localGroup){
        m.swarmPhase = 'mobbing';
        m.alerted = true;
        m.aiState = 'chase';
      }
      log('The mushrooms close in — it\'s an ambush!', 'warn');
      // This mushroom acts immediately if adjacent
      if (d <= 1) mushroomTouch(mon);
      else moveMonsterToward(mon, state.player.x, state.player.y);
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
      // Each mushroom gets a consistent angular offset based on position hash
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

// Mushroom poison touch — zero physical damage, flat poison chance
function mushroomTouch(mon){
  const player = state.player;
  if (player.hp <= 0) return;

  // No hit/miss roll for touch — it's automatic contact
  log(`${mon.name} brushes against you with toxic spores.`, 'muted');

  // Flat poison chance vs player's poison resistance
  const poisonResist = poisonResistance(player);
  const baseChance = mon.sporeHeavy ? 70 : 55;  // spore_heavy personality = higher base
  const poisonChance = Math.max(5, baseChance - poisonResist.chanceReduction);

  if (roll100() <= poisonChance){
    state.player.effects.push({
      type: 'poison',
      turns: Math.max(2, 4 - Math.floor(poisonResist.durationReduction)),
      percentDmg: 0.03,  // 3% max HP per tick
      flatDmg: 1,        // +1 flat per tick
    });
    const stacks = state.player.effects.filter(e => e.type === 'poison').length;
    if (stacks === 1) log('Spores seep in — you are poisoned!', 'warn');
    else log(`Poison stacks from the spores! (×${stacks})`, 'warn');
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
    if (monsterAt(nx, ny, state.player.layer)) continue;
    if (nx === state.player.x && ny === state.player.y) continue;
    // Prefer staying in home territory — check biome from cover || ground
    const nt = cover || ground;
    if (mon.territory.length && !mon.territory.includes(nt) && rand() < 0.7) continue;
    mon.x = nx; mon.y = ny;
    return;
  }
}

function moveMonsterToward(mon, tx, ty){
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
    if (nx === state.player.x && ny === state.player.y){ monsterMelee(mon); return; }
    if (waterLock && !WATER_TILES.has(worlds[state.player.layer][ny][nx])) continue;
    // Biome leash: never step onto forbidden tiles
    if (isForbiddenTile(mon, state.player.layer, nx, ny)) continue;
    if (monsterAt(nx, ny, state.player.layer)) continue;
    mon.x = nx; mon.y = ny;
    return;
  }
}

// Old aliases kept for compatibility
function wanderMonster(mon){ wanderInTerritory(mon); }
function moveMonsterTowardPlayer(mon){ moveMonsterToward(mon, state.player.x, state.player.y); }

export function monsterMelee(mon){
  const player = state.player; // Define local reference to player
  if (player.hp <= 0) return;
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
  state.player.hp -= dmg;
  state.player.hitFlash = 3;
  if (crit) log(`${mon.name} CRITS you for ${dmg} ${mon.dmgType}!`, 'crit');
  else log(`${mon.name} hits you for ${dmg} ${mon.dmgType}.`, 'dmg');
  // Poison application — probability reduced by 75% CON / 25% STR
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

export { endPlayerTurn, enemyAct, playerInTerritory, monInOwnTerritory, canSeePlayer,
         mushroomPackAI, mushroomTouch, wanderInTerritory, moveMonsterToward,
         wanderMonster, moveMonsterTowardPlayer,
         isWaterLocked, isWaterTile };
