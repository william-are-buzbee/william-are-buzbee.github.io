// ==================== PLAYER ACTIONS ====================
import { state, worlds, covers } from './state.js';
import { FED_MAX } from './constants.js';
import { isWalkable, terrainName } from './terrain.js';
import { rand, randi, randomRound } from './rng.js';
import { FOOD, findWeapon, findArmor } from './items.js';
import { restHealAmount, foodFedMul, INV_SLOTS, defaultWeight, deriveHP } from './player.js';
import { NPCS, TOWNS } from './npcs.js';
import { inBounds, monsterAt, getFeature, isImpassable, getCover } from './world-state.js';
import { log } from './log.js';
import { updateUI } from './ui.js';
import { playerAttack } from './combat.js';
import { endPlayerTurn } from './enemy-ai.js';

function fedDrainFor(action){
  if (action === 'rest') return 2;
  if (action === 'move') return 0.5625;
  if (action === 'attack') return 5.4;
  if (action === 'miss') return 5.4;
  return 1;
}

function attemptMove(dx, dy){
  const player = state.player; 
  const nx = state.player.x + dx, ny = state.player.y + dy;
  if (!inBounds(state.player.layer, nx, ny)){ log('The world ends here.', 'muted'); return; }
  if (isImpassable(state.player.layer, nx, ny)) return;
  const mon = monsterAt(nx, ny, state.player.layer);
  if (mon){ const didHit = playerAttack(mon); endPlayerTurn(didHit ? 'attack' : 'miss'); return; }
  const ground = worlds[state.player.layer][ny][nx];
  const cover = getCover(state.player.layer, nx, ny);
  if (!isWalkable(ground, cover)){ log(`Blocked by ${terrainName(ground, cover)}.`, 'muted'); return; }
  state.player.x = nx; state.player.y = ny;
  const f = getFeature(state.player.layer, nx, ny);
  if (f){
    if (f.type === 'sign') log('A signpost — press R to read.', 'muted');
    else if (f.type === 'npc'){ const n=NPCS[f.npcKey]; log(`${n.name} stands here. Press R.`, 'muted'); }
    else if (f.type === 'town') log(`Gates of ${TOWNS[f.townKey].name}. Press R to enter.`, 'muted');
    else if (f.type === 'castle') log(`${f.name}. Press R.`, 'muted');
    else if (f.type === 'stairs') log(`Stairs ${f.dir}. Press R.`, 'muted');
    else if (f.type === 'chest') log('A chest. Press R.', 'muted');
    else if (f.type === 'book') log('A book. Press R to pick up.', 'muted');
    else if (f.type === 'gate') log('Town gate. Press R to leave.', 'muted');
    else if (f.type === 'shop_building') log(`${f.name}. Press R to enter.`, 'muted');
    else if (f.type === 'well') log('A well. Press R.', 'muted');
    else if (f.type === 'home') log('A home. Press R to knock.', 'muted');
    else if (f.type === 'throne') log('A throne of bone and crowns.', 'warn');
  }
  endPlayerTurn('move');
}

function restAction(){
  const player = state.player;
  const amt = restHealAmount(player);
  if (amt > 0 && state.player.hp < state.player.hpMax && state.player.fed > 0){
    const want = Math.min(state.player.hpMax - state.player.hp, amt);
    const actual = Math.min(want, state.player.fed);
    state.player.hp += actual;
    const hungerReduction = 1 - (state.player.con * 0.05);
    const hungerCost = randomRound(actual * hungerReduction);
    state.player.fed -= Math.min(hungerCost, state.player.fed);
    if (actual > 0) log(`You rest. [+${actual} HP · -${hungerCost} FED]`, 'muted');
    else log('You wait.', 'muted');
  } else if (state.player.fed <= 0){
    log('You cannot rest on an empty stomach.', 'warn');
  } else if (state.player.hp >= state.player.hpMax){
    log('You wait.', 'muted');
  } else {
    log('You rest briefly.', 'muted');
  }
  endPlayerTurn('rest');
}

function eatBest(){
  const player = state.player;
  const deficit = FED_MAX - state.player.fed;
  const foodItems = state.player.inventory
    .map((it,idx) => it.kind==='food' ? {it,idx,fed:FOOD[it.key].fed} : null)
    .filter(Boolean);
  if (!foodItems.length){ log('You have no food.', 'warn'); return; }
  if (deficit <= 0){ log('Your belly is full.', 'muted'); return; }
  foodItems.sort((a,b) => a.fed - b.fed);
  const pick = foodItems.find(f => f.fed >= deficit) || foodItems[foodItems.length-1];
  eatItem(pick.idx);
}

function eatItem(idx){
  const player = state.player;
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'food') return;
  const f = FOOD[it.key];
  const before = state.player.fed;
  const gain = Math.round(f.fed * foodFedMul(player));
  state.player.fed = Math.min(FED_MAX, state.player.fed + gain);
  const gained = state.player.fed - before;
  log(`You eat ${f.name}. [+${gained} FED]`, 'hit');
  state.player.inventory.splice(idx, 1);
  endPlayerTurn('rest');
}

function usePotion(idx){
  const player = state.player;
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'potion') return;
  const p = POTIONS[it.key];
  if (p.heal){
    const heal = Math.min(state.player.hpMax - state.player.hp, p.heal);
    state.player.hp += heal;
    log(`You drink the ${p.name}. [+${heal} HP]`, 'hit');
  }
  if (p.cure){
    const before = state.player.effects.length;
    state.player.effects = state.player.effects.filter(e => e.type !== p.cure);
    if (state.player.effects.length < before) log(`The ${p.cure} subsides.`, 'hit');
    else log(`The ${p.name} tastes bitter.`, 'muted');
  }
  state.player.inventory.splice(idx, 1);
  endPlayerTurn('rest');
}

function dropItem(idx){
  const player = state.player;
  state.player.inventory.splice(idx, 1);
  updateUI();
}

function equipWeaponFromInv(idx) {
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'weapon') return;
  const w = findWeapon(it.key);
  const oldKey = state.player.weapon.key;
  state.player.weapon = w;
  state.player.inventory.splice(idx, 1);
  if (oldKey !== 'dagger') {
    const oldItem = { kind: 'weapon', key: oldKey };
    oldItem.weight = defaultWeight(oldItem);
    if (state.player.inventory.length < INV_SLOTS) {
      state.player.inventory.push(oldItem);
    } else {
      log(`Left ${findWeapon(oldKey).name} behind — no room.`, 'muted');
    }
  }
  log(`Equipped ${w.name}.`, 'hit');
  updateUI();
}

function equipArmorFromInv(idx) {
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'armor') return;
  const a = findArmor(it.key);
  const oldKey = state.player.armor.key;
  state.player.armor = a;
  state.player.hpMax = deriveHP(state.player);
  if (state.player.hp > state.player.hpMax) state.player.hp = state.player.hpMax;
  state.player.inventory.splice(idx, 1);
  if (oldKey !== 'rags') {
    const oldItem = { kind: 'armor', key: oldKey };
    oldItem.weight = defaultWeight(oldItem);
    if (state.player.inventory.length < INV_SLOTS) {
      state.player.inventory.push(oldItem);
    } else {
      log(`Left ${findArmor(oldKey).name} behind — no room.`, 'muted');
    }
  }
  log(`Donned ${a.name}.`, 'hit');
  updateUI();
}

export { attemptMove, restAction, eatBest, eatItem, usePotion, dropItem, equipWeaponFromInv, equipArmorFromInv, fedDrainFor };
