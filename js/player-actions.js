// ==================== PLAYER ACTIONS ====================
import { state, worlds, covers } from './state.js';
import { FED_MAX, STAT_MAX, facingSteps } from './constants.js';
import { isWalkable, terrainName } from './terrain.js';
import { rand, randi, randomRound } from './rng.js';
import { FOOD, POTIONS, BOOKS, findWeapon, findArmor } from './items.js';
import { restHealAmount, foodFedMul, INV_SLOTS, defaultWeight, deriveHP, addItem, bagFull, overWeight } from './player.js';
import { getItems, removeItem, placeItem, generateItemId } from './ground-items.js';
import { NPCS, TOWNS } from './npcs.js';
import { inBounds, monsterAt, getFeature, isImpassable, getCover } from './world-state.js';
import { log, LOG_CATEGORIES } from './log.js';
import { updateUI } from './ui.js';
import { playerAttack } from './combat.js';
import { endPlayerTurn } from './enemy-ai.js';
import { applyTurningCost } from './physiology.js';

function fedDrainFor(action){
  if (action === 'rest') return 2;
  if (action === 'move') return 0.5625;
  if (action === 'attack') return 5.4;
  if (action === 'miss') return 5.4;
  if (action === 'turn') return 0.5625;
  return 1;
}

function dirName(dx, dy){
  if (dx === 0 && dy === -1) return 'north';
  if (dx === 1 && dy === -1) return 'northeast';
  if (dx === 1 && dy === 0)  return 'east';
  if (dx === 1 && dy === 1)  return 'southeast';
  if (dx === 0 && dy === 1)  return 'south';
  if (dx === -1 && dy === 1) return 'southwest';
  if (dx === -1 && dy === 0) return 'west';
  if (dx === -1 && dy === -1) return 'northwest';
  return '';
}

function attemptMove(dx, dy){
  const player = state.player; 
  const nx = state.player.x + dx, ny = state.player.y + dy;
  if (!inBounds(state.player.layer, nx, ny)){ log('The world ends here.', LOG_CATEGORIES.MOVEMENT); return; }
  if (isImpassable(state.player.layer, nx, ny)) return;

  // Update facing — always succeeds, no probability check.
  // Physical cost of turning handled by mass-dependent momentum loss.
  const oldDx = state.facing.dx;
  const oldDy = state.facing.dy;
  state.facing.dx = dx;
  state.facing.dy = dy;

  // Apply turning cost to momentum (mass-dependent)
  const stepsChanged = facingSteps(oldDx, oldDy, dx, dy);
  if (stepsChanged > 0) {
    applyTurningCost(state.player, stepsChanged);
  }

  // Set movement intensity based on sprint mode
  state.player._lastMovementIntensity = state.player.sprintMode ? 1.0 : 0.25;

  const mon = monsterAt(nx, ny, state.player.layer);
  if (mon){
    state.player.inCombatThisTurn = true;  // Prompt L-A
    const didHit = playerAttack(mon); endPlayerTurn(didHit ? 'attack' : 'miss'); return;
  }
  const ground = worlds[state.player.layer][ny][nx];
  const cover = getCover(state.player.layer, nx, ny);
  if (!isWalkable(ground, cover)){ log(`Blocked by ${terrainName(ground, cover)}.`, LOG_CATEGORIES.MOVEMENT); return; }
  state.player.x = nx; state.player.y = ny;
  state.player.movedThisTurn = true;  // Prompt L-A
  const f = getFeature(state.player.layer, nx, ny);
  if (f){
    if (f.type === 'sign') log('A signpost. Press R to read.', LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'npc'){ const n=NPCS[f.npcKey]; log(`${n.name} stands here. Press R.`, LOG_CATEGORIES.INTERACTION); }
    else if (f.type === 'town') log(`Gates of ${TOWNS[f.townKey].name}. Press R to enter.`, LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'castle') log(`${f.name}. Press R.`, LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'stairs') log(`Stairs ${f.dir}. Press R.`, LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'chest') log('A chest. Press R.', LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'book') log('A book. Press R to pick up.', LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'gate') log('Town gate. Press R to leave.', LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'shop_building') log(`${f.name}. Press R to enter.`, LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'well') log('A well. Press R.', LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'home') log('A home. Press R to knock.', LOG_CATEGORIES.INTERACTION);
    else if (f.type === 'throne') log('A throne of bone and crowns.', LOG_CATEGORIES.INTERACTION);
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
    const hungerReduction = 1 - (state.player.siz * 0.005);
    const hungerCost = randomRound(actual * hungerReduction);
    state.player.fed -= Math.min(hungerCost, state.player.fed);
    if (actual > 0) log(`You rest. [+${actual} HP · -${hungerCost} FED]`, LOG_CATEGORIES.SYSTEM);
    else log('You wait.', LOG_CATEGORIES.SYSTEM);
  } else if (state.player.fed <= 0){
    log('Cannot rest while starving.', LOG_CATEGORIES.SYSTEM);
  } else if (state.player.hp >= state.player.hpMax){
    log('You wait.', LOG_CATEGORIES.SYSTEM);
  } else {
    log('You rest briefly.', LOG_CATEGORIES.SYSTEM);
  }
  endPlayerTurn('rest');
}

function eatBest(){
  const player = state.player;
  const deficit = FED_MAX - state.player.fed;

  // Collect all edible items: regular food and corpses with nutrition
  const edibles = state.player.inventory
    .map((it, idx) => {
      if (it.kind === 'food') {
        return { idx, fed: FOOD[it.key].fed, isCorpse: false };
      }
      if (it.kind === 'corpse' && it.nutrition > 0) {
        return { idx, fed: it.nutrition, isCorpse: true };
      }
      return null;
    })
    .filter(Boolean);

  if (!edibles.length){ log('You have no food.', LOG_CATEGORIES.INTERACTION); return; }
  if (deficit <= 0){ log('Already satiated.', LOG_CATEGORIES.INTERACTION); return; }

  // Prefer regular food over corpses
  const food    = edibles.filter(e => !e.isCorpse).sort((a,b) => a.fed - b.fed);
  const corpses = edibles.filter(e => e.isCorpse).sort((a,b) => a.fed - b.fed);

  let pick;
  if (food.length){
    pick = food.find(f => f.fed >= deficit) || food[food.length - 1];
  } else {
    pick = corpses.find(f => f.fed >= deficit) || corpses[corpses.length - 1];
  }

  if (pick.isCorpse) eatCorpseFromInv(pick.idx);
  else               eatItem(pick.idx);
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
  log(`You eat ${f.name}. [+${gained} FED]`, LOG_CATEGORIES.INTERACTION);
  state.player.inventory.splice(idx, 1);
  endPlayerTurn('rest');
}

function eatCorpseFromInv(idx){
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'corpse' || !it.nutrition) return;
  const before = state.player.fed;
  state.player.fed = Math.min(FED_MAX, state.player.fed + it.nutrition);
  const gained = state.player.fed - before;
  log(`You eat the ${it.name}. [+${gained} FED]`, LOG_CATEGORIES.INTERACTION);
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
    log(`You drink the ${p.name}. [+${heal} HP]`, LOG_CATEGORIES.INTERACTION);
  }
  if (p.cure){
    const before = state.player.effects.length;
    state.player.effects = state.player.effects.filter(e => e.type !== p.cure);
    if (state.player.effects.length < before) log(`The ${p.cure} subsides.`, LOG_CATEGORIES.INTERACTION);
    else log(`The ${p.name} tastes bitter.`, LOG_CATEGORIES.INTERACTION);
  }
  state.player.inventory.splice(idx, 1);
  endPlayerTurn('rest');
}

function itemDisplayName(it){
  if (it.kind === 'food')   { const f = FOOD[it.key]; return f ? f.name : it.key; }
  if (it.kind === 'potion') { const p = POTIONS[it.key]; return p ? p.name : it.key; }
  if (it.kind === 'book')   { const b = BOOKS[it.key]; return b ? b.name : it.key; }
  if (it.kind === 'weapon') { const w = findWeapon(it.key); return w ? w.name : it.key; }
  if (it.kind === 'armor')  { const a = findArmor(it.key); return a ? a.name : it.key; }
  if (it.kind === 'corpse') { return it.name || 'Corpse'; }
  return it.key || 'item';
}

function dropItem(idx){
  const it = state.player.inventory[idx];
  if (!it) return;
  const name = itemDisplayName(it);
  // Place on ground at player position
  const groundObj = {
    id: generateItemId(),
    kind: it.kind,
    key: it.key,
    name: name,
    weight: it.weight || defaultWeight(it),
    quantity: 1,
  };
  // Corpses carry extra fields not in lookup tables
  if (it.kind === 'corpse') {
    groundObj.type   = 'corpse';
    groundObj.desc   = it.desc;
    groundObj.source = it.source;
    groundObj.sprite = it.sprite || 'CORPSE';
    groundObj.nutrition = it.nutrition || 0;
  }
  placeItem(state.player.layer, state.player.x, state.player.y, groundObj);
  state.player.inventory.splice(idx, 1);
  log(`Dropped ${name}.`, LOG_CATEGORIES.INTERACTION);
  endPlayerTurn('rest');
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
      log(`No room. ${findWeapon(oldKey).name} left behind.`, LOG_CATEGORIES.INTERACTION);
    }
  }
  log(`Equipped ${w.name}.`, LOG_CATEGORIES.INTERACTION);
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
      log(`No room. ${findArmor(oldKey).name} left behind.`, LOG_CATEGORIES.INTERACTION);
    }
  }
  log(`Donned ${a.name}.`, LOG_CATEGORIES.INTERACTION);
  updateUI();
}

function turnInPlace(dx, dy){
  if (state.facing.dx === dx && state.facing.dy === dy) return;
  const oldDx = state.facing.dx;
  const oldDy = state.facing.dy;
  state.facing.dx = dx;
  state.facing.dy = dy;
  // Apply turning cost to momentum
  const stepsChanged = facingSteps(oldDx, oldDy, dx, dy);
  if (stepsChanged > 0) {
    applyTurningCost(state.player, stepsChanged);
  }
  log(`You turn ${dirName(dx, dy)}.`, LOG_CATEGORIES.MOVEMENT);
  endPlayerTurn('turn');
}

// ==================== GROUND ITEM INTERACTIONS ====================

/** Look at items on the current tile. Does NOT cost a turn. */
function lookAtGround(){
  const items = getItems(state.player.layer, state.player.x, state.player.y);
  if (!items.length){
    log('Nothing on the ground.', LOG_CATEGORIES.INTERACTION);
    return;
  }
  if (items.length === 1){
    log(`On the ground: ${items[0].name}.`, LOG_CATEGORIES.INTERACTION);
  } else {
    const names = items.map(it => it.name).join(', ');
    log(`On the ground: ${names}.`, LOG_CATEGORIES.INTERACTION);
  }
  updateUI();
}

/** Pick up an item from the ground. Costs one turn. */
function pickUpFromGround(){
  const px = state.player.x, py = state.player.y;
  const layer = state.player.layer;
  const items = getItems(layer, px, py);
  if (!items.length){
    log('Nothing to pick up.', LOG_CATEGORIES.INTERACTION);
    return;
  }
  if (items.length === 1){
    pickUpGroundItem(items[0], layer, px, py);
    return;
  }
  // Multiple items: show selection via modal
  showGroundPickupPanel(items, layer, px, py);
}

function pickUpGroundItem(groundItem, layer, x, y){
  const invItem = {
    kind: groundItem.kind,
    key:  groundItem.key,
    weight: groundItem.weight || defaultWeight({kind: groundItem.kind, key: groundItem.key}),
  };
  // Corpses carry extra fields that aren't in a lookup table
  if (groundItem.kind === 'corpse') {
    invItem.type   = 'corpse';
    invItem.name   = groundItem.name;
    invItem.desc   = groundItem.desc || `${groundItem.name} — could be butchered or examined.`;
    invItem.source = groundItem.source;
    invItem.sprite = groundItem.sprite || 'CORPSE';
    invItem.nutrition = groundItem.nutrition || 0;
  }
  const result = addItem(state.player, invItem);
  if (result === 'full'){ log('Your bag is full.', LOG_CATEGORIES.INTERACTION); return; }
  if (result === 'heavy'){ log("Too heavy to carry.", LOG_CATEGORIES.INTERACTION); return; }
  removeItem(layer, x, y, groundItem.id);
  log(`Picked up ${groundItem.name}.`, LOG_CATEGORIES.INTERACTION);
  endPlayerTurn('rest');
}

let _groundModalOpen = null, _groundModalClose = null;
function setGroundModalCallbacks(openFn, closeFn){
  _groundModalOpen = openFn;
  _groundModalClose = closeFn;
}

function showGroundPickupPanel(items, layer, px, py){
  let html = `<h2>Ground</h2>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;">Items at your feet:</div>`;
  for (let i = 0; i < items.length; i++){
    const it = items[i];
    html += `<div class="row">`;
    html += `<div class="lbl"><b>${it.name}</b><div class="sub">${it.kind} · wt ${it.weight||1}</div></div>`;
    html += `<button class="btn" data-gpick="${i}">TAKE</button>`;
    html += `</div>`;
  }
  html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;

  if (_groundModalOpen){
    _groundModalOpen(html);
    wireGroundPickupButtons(items, layer, px, py);
  }
}

function wireGroundPickupButtons(items, layer, px, py){
  document.getElementById('btn-close').onclick = () => { if (_groundModalClose) _groundModalClose(); };
  document.querySelectorAll('[data-gpick]').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.gpick, 10);
      // Re-fetch items in case something changed
      const current = getItems(layer, px, py);
      if (idx >= 0 && idx < current.length){
        if (_groundModalClose) _groundModalClose();
        pickUpGroundItem(current[idx], layer, px, py);
      }
    };
  });
}

// ==================== EAT ACTION (R key) ====================
// Priority: ground corpses → inventory food/corpses → nothing.
// Eating from the ground consumes the corpse in place (never enters inventory).

function eatAction(){
  const px = state.player.x, py = state.player.y;
  const layer = state.player.layer;
  const items = getItems(layer, px, py);
  const corpses = items.filter(it => it.kind === 'corpse' && (it.nutrition || 0) > 0);

  if (corpses.length === 1){
    eatCorpseFromGround(corpses[0], layer, px, py);
    return;
  }
  if (corpses.length > 1){
    showGroundCorpseEatPanel(corpses, layer, px, py);
    return;
  }
  // No ground corpses — fall through to inventory
  eatBest();
}

function eatCorpseFromGround(groundItem, layer, x, y){
  const before = state.player.fed;
  state.player.fed = Math.min(FED_MAX, state.player.fed + (groundItem.nutrition || 0));
  const gained = state.player.fed - before;
  removeItem(layer, x, y, groundItem.id);
  log(`You eat the ${groundItem.name}. [+${gained} FED]`, LOG_CATEGORIES.INTERACTION);
  endPlayerTurn('rest');
}

function showGroundCorpseEatPanel(corpses, layer, px, py){
  let html = `<h2>Eat</h2>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;">Corpses at your feet:</div>`;
  for (let i = 0; i < corpses.length; i++){
    const it = corpses[i];
    const nutri = it.nutrition || 0;
    html += `<div class="row">`;
    html += `<div class="lbl"><b>${it.name}</b><div class="sub">+${nutri} FED · wt ${it.weight||2}</div></div>`;
    html += `<button class="btn" data-geat="${i}">EAT</button>`;
    html += `</div>`;
  }
  html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;

  if (_groundModalOpen){
    _groundModalOpen(html);
    wireGroundCorpseEatButtons(corpses, layer, px, py);
  }
}

function wireGroundCorpseEatButtons(corpses, layer, px, py){
  document.getElementById('btn-close').onclick = () => { if (_groundModalClose) _groundModalClose(); };
  document.querySelectorAll('[data-geat]').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.geat, 10);
      if (idx >= 0 && idx < corpses.length){
        if (_groundModalClose) _groundModalClose();
        // Re-verify the corpse is still on the ground
        const current = getItems(layer, px, py);
        const found = current.find(it => it.id === corpses[idx].id);
        if (found) eatCorpseFromGround(found, layer, px, py);
      }
    };
  });
}

export { attemptMove, restAction, eatBest, eatItem, eatCorpseFromInv, usePotion, dropItem, equipWeaponFromInv, equipArmorFromInv, fedDrainFor, dirName, turnInPlace, lookAtGround, pickUpFromGround, setGroundModalCallbacks, eatAction };
