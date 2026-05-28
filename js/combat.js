// ==================== COMBAT + STEALTH ====================
import { render } from './rendering.js';
import { monsterMelee } from './enemy-ai.js';
import { state, worlds, monsters } from './state.js';
import { DMG, GOLD_DROP_MUL, resistMult, getBodyMap, selectHitZone,
         checkNeuralDeath, getAvailableAttacks, hasLocomotion, checkSenseLoss,
         getPathways, computeBleedPenalty, BLOOD_FRACTION, BURST_COEFF,
         BLOOD_DEATH_THRESHOLD, DAMAGE_SCALAR } from './constants.js';
import { T, coverBonus } from './terrain.js';
import { rand, randi, randRange, roll100 } from './rng.js';
import { playerMelee, playerAcc, playerDodge, playerDef, playerCritChance,
         playerCritMult, effectiveAP, cursedBaneMul, xpFromKill, deriveHP,
         stealthBonus, poisonResistance } from './player.js';
import { monDodge, monAcc, monCritChance, monCritMult, monDamage } from './monsters.js';
import { inBounds, chebyshev, monsterAt, isTownCell, getCover } from './world-state.js';
import { log } from './log.js';
import { placeItem, generateItemId } from './ground-items.js';

// Forward reference — set by main.js to break circular dep
let _onVictoryCallback = null;
export function setOnVictoryCallback(fn){ _onVictoryCallback = fn; }

function monstersHere(){ return monsters[state.player.layer]; }

// ==================== ZONE DESTRUCTION RESOLUTION ====================
// Apply damage to a specific zone and resolve all consequences.
// `entity` is the creature whose zone was hit (monster or player).
// `hitZone` is the zone object from the entity's body map.
// `dmg` is the damage dealt (already subtracted from entity.hp).
// `entityName` is the display name for log messages.
// `bodyMap` is the zone array for the entity.
// Returns true if the entity died from zone destruction consequences.

function resolveZoneDamage(entity, hitZone, dmg, entityName, bodyMap) {
  if (!hitZone || !bodyMap) return false;

  // Apply damage to the zone
  if (hitZone.hp == null) return false;  // zone HP not initialized
  hitZone.hp = Math.max(0, hitZone.hp - Math.round(dmg * DAMAGE_SCALAR));

  // Clotting reset — new damage tears open any clotting progress
  if (hitZone.clotting > 0) {
    hitZone.clotting = 0;
  }

  // Check if zone is newly destroyed
  if (hitZone.hp <= 0 && !hitZone.destroyed) {
    hitZone.hp = 0;
    hitZone.destroyed = true;

    log(`${entityName}'s ${hitZone.name} is destroyed!`, 'crit');

    // Blood system — destruction dump + severance burst
    if (entity.blood != null && entity.bloodMax > 0) {
      // Dump — zone's blood share is lost
      const dump = hitZone.bloodShare || 0;
      entity.blood -= dump;

      // Burst — severed pathway connections
      const pathways = getPathways(entity);
      let severedBandwidth = 0;
      for (const pw of pathways) {
        if (pw.from === hitZone.key || pw.to === hitZone.key) {
          severedBandwidth += pw.bandwidth;
        }
      }
      const burst = severedBandwidth * BURST_COEFF * entity.bloodMax;
      entity.blood -= burst;

      // Clamp and recompute penalty
      entity.blood = Math.max(0, entity.blood);
      entity.bleedPenalty = computeBleedPenalty(entity);

      // Check blood death
      if (entity.blood <= entity.bloodMax * BLOOD_DEATH_THRESHOLD) {
        if (entity.isPlayer) {
          log(`Everything narrows. Fades. Goes still.`, 'dead');
        } else {
          log(`${entityName} collapses. Its wounds finally emptied it.`, 'dead');
        }
        return true; // caller handles death
      }
    }

    // Step 2 — Vital check
    if (hitZone.vital) {
      log(`${entityName}'s ${hitZone.name} is destroyed — a fatal blow.`, 'dead');
      return true; // caller handles death
    }

    // Step 3 — Neural death check
    if (checkNeuralDeath(bodyMap)) {
      log(`${entityName} collapses — too much neural tissue destroyed.`, 'dead');
      return true; // caller handles death
    }

    // Step 4 — Locomotion check
    if (hitZone.locomotion && !hasLocomotion(bodyMap)) {
      entity.immobilized = true;
      log(`${entityName} collapses, unable to move.`, 'warn');
    }

    // Step 5 — Attack loss
    if (hitZone.attacks && hitZone.attacks.length > 0) {
      for (const atk of hitZone.attacks) {
        log(`${entityName}'s ${atk.name} is gone.`, 'warn');
      }
    }

    // Step 6 — Sensory log messages
    const senseLosses = checkSenseLoss(bodyMap, hitZone);
    for (const sl of senseLosses) {
      if (sl.type === 'lost') {
        log(`${entityName} can no longer ${sl.verb}.`, 'warn');
      } else {
        log(`${entityName}'s ${sl.sense} weakens.`, 'muted');
      }
    }
  }

  return false;
}

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

  // Zone selection — roll which body zone was hit
  const monBodyMap = getBodyMap(mon);
  const hitZone = monBodyMap ? selectHitZone(monBodyMap) : null;

  mon.hp -= dmg;
  if (dmg > 0){ mon.hitFlash = 3; mon.damageTaken = (mon.damageTaken||0) + dmg; }
  let totalZoneDmg = dmg;  // accumulate all damage for zone HP

  // Combat log with zone name when available
  const zoneSuffix = hitZone ? `'s ${hitZone.name}` : '';
  const verb = state.player.weapon.type === DMG.BLUNT ? 'crush' :
               state.player.weapon.type === DMG.BLADE ? 'strike' : 'hit';
  if (crit) log(`CRIT! You ${verb} ${mon.name}${zoneSuffix}. ${dmg} ${state.player.weapon.type}${suffix}.`, 'crit');
  else log(`You ${verb} ${mon.name}${zoneSuffix}. ${dmg} ${state.player.weapon.type}${suffix}.`, 'hit');

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
      totalZoneDmg += edmg;
      log(`  + ${edmg} ${state.player.weapon.elem}${esuf}.`, 'hit');
    }
  }

  // Zone destruction resolution — apply accumulated damage to the hit zone
  let zoneDeath = false;
  if (hitZone && monBodyMap && totalZoneDmg > 0) {
    zoneDeath = resolveZoneDamage(mon, hitZone, totalZoneDmg, mon.name, monBodyMap);
    if (zoneDeath) {
      mon.hp = 0;  // ensure global HP reflects death
    }
  }

  // Enemy bleed feedback — gated by player centralization
  if (!zoneDeath && mon.hp > 0 && mon.blood != null && mon.bloodMax > 0) {
    const bloodRatio = mon.blood / mon.bloodMax;
    if (bloodRatio < 0.75) {
      const cent = state.player.central || 0;
      if (cent >= 60) {
        // Tier 3 player: detailed bleed info
        if (bloodRatio < 0.25) log(`${mon.name}'s movements are sluggish. Blood loss.`, 'muted');
        else if (bloodRatio < 0.50) log(`${mon.name} is bleeding heavily — it's weakening.`, 'muted');
        else log(`${mon.name} bleeds from its wounds.`, 'muted');
      } else if (cent >= 30) {
        // Moderate centralization
        log(`${mon.name} bleeds from its wounds.`, 'muted');
      } else {
        // Low centralization: generic
        log(`The creature is wounded.`, 'muted');
      }
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

  if (mon.hp <= 0 || zoneDeath) killMonster(mon);
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

  // Drop a corpse item on the tile where the monster died
  placeItem(state.player.layer, mon.x, mon.y, {
    id:       generateItemId(),
    kind:     'corpse',
    type:     'corpse',
    name:     `${mon.name} Corpse`,
    desc:     `${mon.name} Corpse — could be butchered or examined.`,
    sprite:   'CORPSE',
    weight:   2,
    quantity: 1,
    source:   mon.key,
    nutrition: mon.hpMax,
  });

  const xp = xpFromKill(player, mon.xp);
  const gold = Math.round(randRange(mon.goldRange[0], mon.goldRange[1]) * GOLD_DROP_MUL);
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
