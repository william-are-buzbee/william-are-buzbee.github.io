// ==================== COMBAT + STEALTH ====================
import { render } from './rendering.js';
import { monsterMelee } from './enemy-ai.js';
import { state, worlds, monsters } from './state.js';
import { DMG, DIFFICULTIES, resistMult } from './constants.js';
import { T, coverBonus } from './terrain.js';
import { rand, randi, randRange, roll100 } from './rng.js';
import { playerMelee, playerAcc, playerDodge, playerDef, playerCritChance,
         playerCritMult, effectiveAP, cursedBaneMul, xpFromKill, deriveHP,
         stealthBonus, poisonResistance } from './player.js';
import { monDodge, monAcc, monCritChance, monCritMult, monDamage } from './monsters.js';
import { inBounds, chebyshev, monsterAt, isTownCell, getCover } from './world-state.js';
import { log } from './log.js';

// Forward reference — set by main.js to break circular dep
let _onVictoryCallback = null;
export function setOnVictoryCallback(fn){ _onVictoryCallback = fn; }

function monstersHere(){ return monsters[state.player.layer]; }

function rollHit(acc, dodge){
  const c = Math.max(5, Math.min(95, acc - dodge));
  return roll100() <= c;
}

function playerAttack(mon){
  const player = state.player
  // Break stealth
  if (state.player.stealth) endStealth('You strike while undetected!!');

  const acc = playerAcc(player);
  const mdodge = monDodge(mon);
  if (!rollHit(acc, mdodge)){
    log(`You miss ${mon.name}.`, 'muted');
    mon.wasAttacked = true;
    mon.alerted = true;
    mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
    return false;  // missed
  }
  let base = playerMelee(player) + randi(3);
  const crit = roll100() <= playerCritChance(player);
  if (crit) base = Math.floor(base * playerCritMult(player));
  const effDef = Math.max(0, mon.def - effectiveAP(player));
  let dmg = Math.max(1, base - effDef);
  const mult = resistMult(mon.tags, state.player.weapon.type);
  let suffix = '';
  if (mult === 0){
    dmg = 0;
    suffix = ' [NO EFFECT]';
  } else {
    dmg = Math.max(1, Math.round(dmg * mult));
    if (mult >= 1.4) suffix = ' [WEAK]';
    else if (mult <= 0.6) suffix = ' [RESIST]';
  }
  // Cursed bane
  if (dmg > 0){
    const cb = cursedBaneMul(player, mon.tags);
    if (cb > 1) dmg = Math.round(dmg * cb);
  }
  // Weapon's own bane property
  if (dmg > 0 && state.player.weapon.bane && mon.tags.includes(state.player.weapon.bane)){
    dmg = Math.round(dmg * (state.player.weapon.baneMul || 1.5));
    suffix += ' [BANE]';
  }
  if (crit) suffix += ' ‼';

  mon.hp -= dmg;
  if (dmg > 0){ mon.hitFlash = 3; mon.damageTaken = (mon.damageTaken||0) + dmg; }
  if (crit) log(`CRIT! ${mon.name} takes ${dmg} ${state.player.weapon.type}${suffix}.`, 'crit');
  else log(`You hit ${mon.name} for ${dmg} ${state.player.weapon.type}${suffix}.`, 'hit');

  // Elemental bonus
  if (state.player.weapon.elem && mon.hp > 0){
    const player = state.player;
    const emul = resistMult(mon.tags, state.player.weapon.elem);
    if (emul === 0){
      log(`  ${state.player.weapon.elem}: no effect.`, 'muted');
    } else {
      const ebase = state.player.weapon.elemBonus + randi(3);
      const edmg = Math.max(1, Math.round(ebase * emul));
      let esuf = '';
      if (emul >= 1.4) esuf = ' [WEAK]';
      else if (emul <= 0.6) esuf = ' [RESIST]';
      mon.hp -= edmg;
      log(`  + ${edmg} ${state.player.weapon.elem}${esuf}.`, 'hit');
    }
  }

  // Mark attacked — switches to chase state, records last seen
  // Mushrooms don't react individually — swarm AI handles their behavior
  if (mon.key === 'mushroom'){
    mon.wasAttacked = true;
    // No aiState change, no alert, no chase — mushrooms stay passive even when hit
  } else {
    mon.wasAttacked = true;
    mon.alerted = true;
    mon.aiState = 'chase';
    mon.chaseTurnsLeft = mon.chase;
    mon.lastSeenX = state.player.x; mon.lastSeenY = state.player.y;
  }
  // Treant-specific: hitting one alerts nearby treants in forest, but they don't chase
  // unless personally attacked. They become aware but stay idle and alert.
  if (mon.key === 'treant'){
    for (const m of monstersHere()){
      if (m.hp <= 0 || m === mon) continue;
      if (m.key === 'treant' && chebyshev(m.x,m.y,mon.x,mon.y) <= 5){
        // Nearby treants become aware but do NOT chase — they stay idle
        m.alerted = true;
        // They stop healing (they know combat is happening nearby)
      }
    }
  } else {
    alertNearby(mon, 4);
  }

  if (mon.hp <= 0) killMonster(mon);
  return true;  // hit
}

function alertNearby(src, radius){
  const player = state.player;
  for (const m of monstersHere()){
    if (m.hp <= 0) continue;
    // Treants only respond when personally attacked, not when nearby allies are hit
    if (m.key === 'treant' && m !== src) continue;
    // Mushrooms use pack coordination, not standard alert
    if (m.key === 'mushroom') continue;
    if (chebyshev(m.x,m.y,src.x,src.y) <= radius){
      m.alerted = true;
      if (m.aiState === 'idle'){
        m.aiState = 'chase';
        m.chaseTurnsLeft = m.chase;
        m.lastSeenX = state.player.x; m.lastSeenY = state.player.y;
      }
    }
  }
}

function killMonster(mon){
  const player = state.player;
  const xp = xpFromKill(player, mon.xp);
  const gold = Math.round(randRange(mon.goldRange[0], mon.goldRange[1]) * DIFFICULTIES[state.difficulty].goldMul);
  state.player.xp += xp;
  state.player.gold += gold;
  log(`${mon.name} falls. [+${xp} XP, +${gold}g]`, 'dead');
  if (mon.isBoss){
    state.player.defeatedBoss = true;
    setTimeout(() => { if (_onVictoryCallback) _onVictoryCallback(); }, 500);
  }
  checkLevelUp();
}

function checkLevelUp(){
  const player = state.player;
  while (state.player.xp >= state.player.xpNext){
    state.player.xp -= state.player.xpNext;
    state.player.level++;
    state.player.xpNext = Math.floor(state.player.xpNext * 1.4 + 5);
    const oldHpMax = state.player.hpMax;
    state.player.hpMax = deriveHP(player);
    // NO heal on level up per spec — just log max HP gain
    log(`★ Level ${state.player.level}! Max HP +${state.player.hpMax - oldHpMax}. Rest or find food to heal.`, 'crit');
  }
}

// ==================== STEALTH ====================
function inCombatProximity(){
  const player = state.player;
  for (const m of monstersHere()){
    if (m.hp <= 0) continue;
    if (!m.alerted) continue;
    if (chebyshev(m.x,m.y,state.player.x,state.player.y) <= 1) return true;
  }
  return false;
}
function toggleStealth(){
  const player = state.player;
  if (state.player.stealth){ endStealth('You step into the open.'); return; }
  if (inCombatProximity()){ log('Too close to alert enemies.', 'muted'); return; }
  state.player.stealth = true;
  if (!state.player.effects.find(e=>e.type==='stealth')){
    state.player.effects.push({type:'stealth', turns:999});
  }
  log('You blend into the shadows...', 'muted');
  render();
}
function endStealth(msg){
  const player = state.player;
  state.player.stealth = false;
  state.player.effects = state.player.effects.filter(e => e.type !== 'stealth');
  if (msg) log(msg, 'muted');
}

// Monster stealth-detection chance (lower = harder to spot player)
function stealthDetectChance(mon){
  const player = state.player;
  const ground = worlds[state.player.layer][state.player.y][state.player.x];
  const cover = getCover(state.player.layer, state.player.x, state.player.y);
  const cov = coverBonus(ground, cover);
  const d = chebyshev(mon.x,mon.y,state.player.x,state.player.y);
  let chance = mon.percept - cov - stealthBonus(player) - d*5;
  return Math.max(0, Math.min(95, chance));
}


export { rollHit, playerAttack, alertNearby, killMonster, checkLevelUp,
         inCombatProximity, toggleStealth, endStealth, stealthDetectChance, monsterMelee };
