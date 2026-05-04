// ==================== USE / INTERACT — core hub ====================
import { state, worlds, covers, features, monsters } from './state.js';
import { DMG, DIFFICULTIES, resistMult, LAYER_SURFACE, LAYER_UNDER, W_SURF, H_SURF, PRICE_CAT, FED_MAX } from './constants.js';
import { T, terrainName, coverBonus } from './terrain.js';
import { rand, randi, choice } from './rng.js';
import { FOOD, POTIONS, BOOKS, findWeapon, findArmor, itemPriceCategory } from './items.js';
import { INV_SLOTS, carryCapacity, totalWeight, overWeight, bagFull, addItem,
         defaultWeight, buyPriceMul, innPriceMul, sellValueMul, deriveHP,
         playerMelee, playerDef, playerAcc, playerDodge,
         playerCritChance, playerCritMult, poisonResistance, foodFedMul } from './player.js';
import { monDodge, monAcc, monDamage, monCritChance, spawnMonster } from './monsters.js';
import { NPCS, SHOPS } from './npcs.js';
import { inBounds, monsterAt, chebyshev, getFeature, setFeature, fkey,
         getCover, setCover } from './world-state.js';
import { log } from './log.js';
import { openModal, closeModal, showModal, modalEl } from './modal.js';
import { updateUI, interactable, adjacentFeature } from './ui.js';
import { render } from './rendering.js';
import { endPlayerTurn } from './enemy-ai.js';

import { openShop, renderShop, buyCost, sellValue, itemBaseValue } from './shops.js';
import { openNPC } from './dialogue.js';
import { openCastle, openSunward, openBlackspire, setUseStairs } from './castle.js';
import { SHOP_PROFILES } from './town-gen.js';

import { teleportPlayer } from './world-gen.js';

function monstersHere(){ return monsters[state.player.layer]; }

// ==================== USE / INTERACT ====================
function useAction(){
  const player = state.player;
  const here = getFeature(state.player.layer, state.player.x, state.player.y);
  if (here && interactable(here)){ interact(here, state.player.x, state.player.y); return; }
  const adj = adjacentFeature();
  if (adj){ interact(adj.f, adj.x, adj.y); return; }
  if (tryWellInteract()) return;
  log('Nothing to use here.', 'muted');
}

// ---- Well quadrant interaction ----
function tryWellInteract(){
  const px = state.player.x, py = state.player.y;
  const ly = state.player.layer;
  const coverGrid = covers[ly];
  for (let dy = -1; dy <= 1; dy++){
    for (let dx = -1; dx <= 1; dx++){
      const x = px + dx, y = py + dy;
      if (!inBounds(ly, x, y)) continue;
      const c = coverGrid ? coverGrid[y][x] : 0;
      if (c === T.WELL_TL || c === T.WELL_TR || c === T.WELL_BL || c === T.WELL_BR){
        const wellPositions = [
          [x, y], [x-1, y], [x+1, y], [x, y-1], [x, y+1],
          [x-1, y-1], [x+1, y-1], [x-1, y+1], [x+1, y+1]
        ];
        for (const [wx, wy] of wellPositions){
          const f = getFeature(ly, wx, wy);
          if (f && f.type === 'well'){
            interact(f, wx, wy);
            return true;
          }
        }
        const fallback = {type:'well', text:'A stone well. The water is cold.'};
        interact(fallback, x, y);
        return true;
      }
    }
  }
  return false;
}

function interact(f, x, y){
  switch(f.type){
    case 'sign':
      openModal(`<h2>Signpost</h2><div class="dialogue" style="white-space:pre-line;">${f.text}</div><div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`);
      document.getElementById('btn-close').onclick = closeModal; break;
    case 'npc': openNPC(f.npcKey); break;
    case 'castle': openCastle(f, x, y); break;
    case 'stairs': useStairs(f); break;
    case 'chest': openChest(f, x, y); break;
    case 'book': pickUpBook(f, x, y); break;
    case 'shop_building':
      if (SHOP_PROFILES[f.shopKey]) {
        openProfileShop(f.shopKey);
      } else {
        openShop(f.shopKey);
      }
      break;
    case 'well':
      openModal(`<h2>Well</h2><div class="dialogue">${f.text||'A town well. The water is cool. It does not mend you.'}</div><div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`);
      document.getElementById('btn-close').onclick = closeModal;
      break;
    case 'home':
      openModal(`<h2>Home</h2><div class="dialogue">${f.text||'A quiet home. No one answers.'}</div><div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`);
      document.getElementById('btn-close').onclick = closeModal; break;
    case 'throne':
      openModal(`<h2>The Throne</h2><div class="dialogue">A seat of bone and crowns. Dust sits where kings once did.</div><div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`);
      document.getElementById('btn-close').onclick = closeModal; break;
  }
}

// ==================== PROFILE-DRIVEN SHOP MODAL ====================
// Handles shops defined via SHOP_PROFILES (the new surface-town shops).
// Reads inventory, pricing, and keeper mercantile from the profile.
// Pricing is now tiered by item category (staple/standard/luxury).
// Food shops use a per-shop fedRatio for consistent gold-per-fed pricing.
function openProfileShop(shopKey){
  const profile = SHOP_PROFILES[shopKey];
  if (!profile) return;
  const player = state.player;
  state.shopTab = state.shopTab || 'buy';

  // ---- Item resolver: key → display data ----
  function resolve(key){
    const w = findWeapon(key);
    if (w) return { kind:'weapon', key, name:w.name,
      desc:`[${w.type}${w.elem?'+'+w.elem:''}] ATK+${w.atk}`,
      weight: defaultWeight({kind:'weapon',key}) };
    const a = findArmor(key);
    if (a) return { kind:'armor', key, name:a.name,
      desc:`DEF+${a.def}${a.dodgePenalty?` -${a.dodgePenalty}%dodge`:''}${a.coldResist?` ❄${a.coldResist}`:''}`,
      weight: defaultWeight({kind:'armor',key}) };
    const f = FOOD[key];
    if (f) return { kind:'food', key, name:f.name,
      desc:`+${f.fed} FED`, weight: defaultWeight({kind:'food',key}) };
    const b = BOOKS[key];
    if (b) return { kind:'book', key, name:b.name,
      desc:`INT ${b.intReq}+`, weight: defaultWeight({kind:'book',key}) };
    const p = POTIONS[key];
    if (p) return { kind:'potion', key, name:p.name,
      desc:p.desc||'', weight: defaultWeight({kind:'potion',key}) };
    return null;
  }

  // ---- Tiered pricing with mercantile & profile modifiers ----
  const mercMod = 1 + (profile.keeper.mercantile - 3) * 0.05;

  // If the shop has a fedRatio (gold per FED point), food prices are
  // derived from it so every food item at this shop has the same ratio.
  const shopFedRatio = profile.fedRatio || null;

  function foodBuyCost(foodKey){
    const f = FOOD[foodKey];
    if (!f) return 0;
    if (shopFedRatio){
      // Price = fed * ratio, then INT discount for staples, then mercantile
      const rawCost = f.fed * shopFedRatio;
      return Math.max(1, Math.round(rawCost * mercMod * buyPriceMul(player, PRICE_CAT.STAPLE)));
    }
    // Fallback: use item base cost with staple discount
    const base = itemBaseValue({kind:'food', key:foodKey});
    return Math.max(1, Math.round(base * (profile.sellPriceMod||1) * mercMod * buyPriceMul(player, PRICE_CAT.STAPLE)));
  }

  function priceBuy(item){
    // Food uses the fedRatio path
    if (item.kind === 'food') return foodBuyCost(item.key);
    const cat = itemPriceCategory(item);
    const base = itemBaseValue({kind:item.kind, key:item.key});
    return Math.max(1, Math.round(base * (profile.sellPriceMod||1) * mercMod * buyPriceMul(player, cat)));
  }
  function priceSell(invItem){
    const cat = itemPriceCategory(invItem);
    const base = itemBaseValue(invItem);
    let mod = (profile.buyPriceMod||1) / mercMod * sellValueMul(player, cat);
    // Bonus for matching tags
    if (profile.bonusBuyTags && profile.bonusBuyTags.length){
      const itemTags = invItem.tags || [];
      for (const t of profile.bonusBuyTags){
        if (itemTags.includes(t)) mod *= 1.15;
      }
    }
    return Math.max(1, Math.round(base * mod));
  }

  // ---- Fill Up: buy enough food to max FED, no inventory slots used ----
  function computeFillUp(){
    const deficit = FED_MAX - player.fed;
    if (deficit <= 0) return { cost:0, fed:0, possible:false, reason:'full' };
    // Effective FED after foodFedMul — we need raw fed to produce 'deficit' after the multiplier
    const rawNeeded = Math.ceil(deficit / foodFedMul(player));
    if (!shopFedRatio){
      // No fedRatio set — use cheapest food item's ratio as fallback
      const foodKeys = (profile.sellInventory||[]).filter(k => FOOD[k]);
      if (!foodKeys.length) return { cost:0, fed:0, possible:false, reason:'no_food' };
      const ratios = foodKeys.map(k => {
        const cost = foodBuyCost(k);
        const f = FOOD[k];
        return { key:k, ratio: cost / f.fed };
      });
      ratios.sort((a,b) => a.ratio - b.ratio);
      const bestRatio = ratios[0].ratio;
      const totalCost = Math.max(1, Math.round(rawNeeded * bestRatio));
      if (player.gold < totalCost) return { cost:totalCost, fed:deficit, possible:false, reason:'gold' };
      return { cost:totalCost, fed:deficit, possible:true };
    }
    // FedRatio-based: straightforward
    const rawCost = rawNeeded * shopFedRatio;
    const totalCost = Math.max(1, Math.round(rawCost * mercMod * buyPriceMul(player, PRICE_CAT.STAPLE)));
    if (player.gold < totalCost) return { cost:totalCost, fed:deficit, possible:false, reason:'gold' };
    return { cost:totalCost, fed:deficit, possible:true };
  }

  // ---- Render the modal ----
  function draw(){
    const mi = document.getElementById('modal-inner');
    let html = `<h2>${profile.name}</h2>`;
    html += `<div class="dialogue"><i>${profile.keeper.name} stands behind the counter.</i></div>`;
    html += `<div style="display:flex;gap:6px;margin:6px 0;">`;
    html += `<button class="btn${state.shopTab==='buy'?' primary':''}" id="stab-buy">BUY</button>`;
    html += `<button class="btn${state.shopTab==='sell'?' primary':''}" id="stab-sell">SELL</button>`;
    html += `</div>`;
    html += `<div class="dialogue" style="font-style:normal;font-size:10px;">Gold: <b>${player.gold}</b>  ·  FED: <b>${Math.round(player.fed)}/${FED_MAX}</b></div>`;

    if (state.shopTab === 'buy'){
      const items = profile.sellInventory.map(resolve).filter(Boolean);
      if (!items.length) html += `<div class="dialogue" style="font-style:normal;">Nothing for sale.</div>`;

      // Show food items with consistent pricing
      for (const it of items){
        const cost = priceBuy(it);
        const ok = player.gold >= cost;
        html += `<div class="row">`;
        html += `<div class="lbl"><b>${it.name}</b><div class="sub">${it.desc} · wt ${it.weight}</div></div>`;
        html += `<button class="btn" data-pbuy="${it.key}" ${ok?'':'disabled'}>${cost}g</button>`;
        html += `</div>`;
      }

      // Fill Up button — only if shop sells food
      const hasFood = items.some(it => it.kind === 'food');
      if (hasFood && player.fed < FED_MAX){
        const fill = computeFillUp();
        if (fill.cost > 0){
          const canAfford = fill.possible;
          html += `<div class="row" style="margin-top:4px;border-top:1px solid #333;padding-top:4px;">`;
          html += `<div class="lbl"><b>Fill Up</b><div class="sub">+${fill.fed} FED to full</div></div>`;
          html += `<button class="btn${canAfford?' primary':''}" id="btn-fillup" ${canAfford?'':'disabled'}>${fill.cost}g</button>`;
          html += `</div>`;
        }
      }
    } else {
      const sellable = player.inventory
        .map((it,i) => ({...it, idx:i}))
        .filter(it => profile.buyCategories.includes(it.kind));
      if (!sellable.length) html += `<div class="dialogue" style="font-style:normal;">Nothing to sell here.</div>`;
      for (const it of sellable){
        const r = resolve(it.key);
        if (!r) continue;
        const val = priceSell(it);
        html += `<div class="row">`;
        html += `<div class="lbl"><b>${r.name}</b><div class="sub">${r.desc}</div></div>`;
        html += `<button class="btn" data-psell="${it.idx}">${val}g</button>`;
        html += `</div>`;
      }
    }

    html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;
    mi.innerHTML = html;

    // Wire handlers
    document.getElementById('btn-close').onclick = closeModal;
    document.getElementById('stab-buy').onclick = () => { state.shopTab='buy'; draw(); };
    document.getElementById('stab-sell').onclick = () => { state.shopTab='sell'; draw(); };

    // Fill Up handler
    const fillBtn = document.getElementById('btn-fillup');
    if (fillBtn){
      fillBtn.onclick = () => {
        const fill = computeFillUp();
        if (!fill.possible) return;
        player.gold -= fill.cost;
        player.fed = Math.min(FED_MAX, player.fed + fill.fed);
        log(`Filled up. [+${fill.fed} FED · -${fill.cost}g]`, 'gold');
        updateUI(); draw();
      };
    }

    mi.querySelectorAll('[data-pbuy]').forEach(btn => {
      btn.onclick = () => {
        const it = resolve(btn.dataset.pbuy);
        if (!it) return;
        const cost = priceBuy(it);
        if (player.gold < cost){ log('Not enough gold.','warn'); return; }
        const res = addItem(player, {kind:it.kind, key:it.key});
        if (res === 'full'){ log('Bag is full.','warn'); return; }
        if (res === 'heavy'){ log("Too heavy to carry.",'warn'); return; }
        player.gold -= cost;
        log(`Bought ${it.name} for ${cost}g.`,'gold');
        updateUI(); draw();
      };
    });

    mi.querySelectorAll('[data-psell]').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.psell);
        const it = player.inventory[idx];
        if (!it) return;
        const val = priceSell(it);
        player.gold += val;
        player.inventory.splice(idx, 1);
        const r = resolve(it.key);
        log(`Sold ${r?r.name:'item'} for ${val}g.`,'gold');
        updateUI(); draw();
      };
    });
  }

  showModal();
  draw();
}


function useStairs(f){
  teleportPlayer(f.targetLayer, f.targetX, f.targetY);
  log(f.dir === 'down' ? 'You descend into the dark.' : 'You climb up to the world.', 'warn');
  render();
  endPlayerTurn('move');
}

setUseStairs(useStairs);

function pickUpBook(f, x, y){
  const player = state.player;
  const result = addItem(player, {kind:'book', key:f.bookKey});
  if (result === 'full'){ log('Your bag is full.', 'warn'); return; }
  if (result === 'heavy'){ log("It's too heavy to carry.", 'warn'); return; }
  log(`You pick up "${BOOKS[f.bookKey].name}".`, 'book');
  delete features[state.player.layer][fkey(x,y)];
  // Clear cover, keep ground
  setCover(state.player.layer, x, y, 0);
  updateUI();
}

function openBook(bookKey, fromInventory, invIdx){
  const player = state.player;
  const b = BOOKS[bookKey];
  let html = `<h2>${b.name}</h2>`;
  html += `<div class="book-text">${b.text}</div>`;
  if (fromInventory && state.player.int >= b.intReq && !state.player.booksRead.has(bookKey)){
    html += `<div class="shop-h">Knowledge</div>`;
    html += `<div class="dialogue" style="font-style:normal;font-size:10px;color:#a8c8e0;">${b.summary}</div>`;
  }
  html += `<div class="close-row">`;
  if (fromInventory && state.player.int >= b.intReq && !state.player.booksRead.has(bookKey)){
    html += `<button class="btn primary" id="btn-read">ABSORB</button> `;
  }
  html += `<button class="btn" id="btn-close">CLOSE</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
  const readBtn = document.getElementById('btn-read');
  if (readBtn){
    readBtn.onclick = () => {
      state.player.perks[b.perk] = true;
      state.player.booksRead.add(bookKey);
      if (b.perk === 'hp_bonus'){
        const old = state.player.hpMax;
        state.player.hpMax = deriveHP(player);
        state.player.hp += (state.player.hpMax - old);
      }
      log(`You read "${b.name}". ${b.summary}`, 'crit');
      if (invIdx != null) state.player.inventory.splice(invIdx, 1);
      closeModal();
    };
  }
}

function openChest(f, x, y){
  const player = state.player;
  const c = f.contents;
  const mi = document.getElementById('modal-inner');
  let html = `<h2>Chest</h2>`;
  if (c.type === 'weapon'){
    const w = findWeapon(c.key);
    html += `<div class="row">
      <div class="lbl">A <b>${w.name}</b><div class="sub">[${w.type}${w.elem?'+'+w.elem:''}] ATK+${w.atk} · wt ${defaultWeight({kind:'weapon',key:c.key})}</div></div>
      <button data-act="take">TAKE</button><button data-act="leave">LEAVE</button>
    </div>`;
  } else if (c.type === 'armor'){
    const a = findArmor(c.key);
    html += `<div class="row">
      <div class="lbl"><b>${a.name}</b><div class="sub">DEF+${a.def}${a.dodgePenalty?` -${a.dodgePenalty}% dodge`:''} · wt ${defaultWeight({kind:'armor',key:c.key})}</div></div>
      <button data-act="take">TAKE</button><button data-act="leave">LEAVE</button>
    </div>`;
  } else if (c.type === 'food'){
    const fd = FOOD[c.key];
    html += `<div class="row">
      <div class="lbl"><b>${fd.name}</b><div class="sub">+${fd.fed} FED</div></div>
      <button data-act="take">TAKE</button><button data-act="leave">LEAVE</button>
    </div>`;
  } else if (c.type === 'potion'){
    const p = POTIONS[c.key];
    html += `<div class="row">
      <div class="lbl"><b>${p.name}</b><div class="sub">${p.desc}</div></div>
      <button data-act="take">TAKE</button><button data-act="leave">LEAVE</button>
    </div>`;
  } else if (c.type === 'gold'){
    state.player.gold += c.amount;
    log(`${c.amount} gold!`, 'gold');
    consumeFeature(x,y);
    return;
  }
  html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;
  mi.innerHTML = html;
  showModal();
  mi.querySelectorAll('button[data-act]').forEach(b => b.onclick = () => {
    if (b.dataset.act === 'take'){
      let item = null;
      if (c.type === 'weapon') item = {kind:'weapon', key:c.key};
      else if (c.type === 'armor') item = {kind:'armor', key:c.key};
      else if (c.type === 'food')  item = {kind:'food', key:c.key};
      else if (c.type === 'potion')item = {kind:'potion', key:c.key};
      if (item){
        const result = addItem(player, item);
        if (result === 'full'){ log('Your bag is full.', 'warn'); return; }
        if (result === 'heavy'){ log("It's too heavy to carry.", 'warn'); return; }
        const name = c.type === 'weapon' ? findWeapon(c.key).name
                   : c.type === 'armor'  ? findArmor(c.key).name
                   : c.type === 'food'   ? FOOD[c.key].name
                   : POTIONS[c.key].name;
        log(`Took ${name}.`, 'hit');
      }
      consumeFeature(x,y);
    } else consumeFeature(x,y);
    closeModal();
  });
  document.getElementById('btn-close').onclick = closeModal;
}

function consumeFeature(x,y){
  delete features[state.player.layer][fkey(x,y)];
  // Clear cover, keep ground
  setCover(state.player.layer, x, y, 0);
  updateUI();
}

// ==================== HELP / EXAMINE ====================
function showHelp(){
  const player = state.player;
  let html = `<h2>Field Manual</h2>`;
  html += `<div class="shop-h">Controls</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    <b>WASD</b>/arrows · move<br>
    <b>CLICK</b> tile · walk / attack adjacent<br>
    <b>RIGHT-CLICK</b> · examine tile/monster<br>
    <b>SPACE</b> · wait/rest (converts FED to HP)<br>
    <b>E</b> · eat best food (fills FED only)<br>
    <b>F</b> · toggle stealth (DEX drives it)<br>
    <b>R</b> · use stairs/sign/NPC/chest/town<br>
  </div>`;
  html += `<div class="shop-h">FED & Healing</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    <b>FED is a second HP bar.</b> Food fills FED — it doesn't heal HP directly.<br>
    <b>Resting</b> converts FED → HP (CON controls the rate and reduces hunger cost).<br>
    Every action drains FED. Resting drains it slowly, moving more, attacking the most.<br>
    Passive regen does not drain FED. At FED 0 you start losing HP. Eat, or visit an inn for a full restore.<br>
    Potions are the only consumable that heals HP directly — use them sparingly.
  </div>`;
  html += `<div class="shop-h">Inventory</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    Bag is <b>10 slots, no stacking.</b> Each item has a <b>weight</b>.<br>
    <b>STR</b> determines carry capacity (4 + STR×2). Overweight pickups are blocked.<br>
    Weapons and armor go into your bag — equip from the Items tab.
  </div>`;
  html += `<div class="shop-h">Attributes</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    <b>STR</b>: melee dmg (probabilistic), carry weight, blunt AP (scales gradually), crit dmg (50%), +1 HP per point.<br>
    <b>CON</b>: HP, per-level HP scaling. Rest heals random HP based on CON. Passive regen at all CON levels. Reduces rest hunger cost. Poison resistance (75% weight, scales with level).<br>
    <b>DEX</b>: dodge, accuracy, crit chance, stealth. All scale linearly.<br>
    <b>INT</b>: XP gain (scales with INT, no level cap), crit dmg (50%), shop prices, sell value. 1 stunts speech.
  </div>`;
  html += `<div class="shop-h">Damage Types</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    BLADE cuts flesh but <b>resists</b> on armored, shelled, scaled, and stone foes. BLUNT breaks bone/armor/stone.<br>
    FIRE ruins plants, ice, mummies. COLD cracks fire-things but does NOTHING to undead/bone/ice.<br>
    ELECTRIC devastates aquatic foes. POISON useless on undead/bone/stone/fungal. Poison stacks and deals %HP+flat, resisted by CON/STR.
  </div>`;
  html += `<div class="shop-h">Enemy Behavior</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    Many creatures ignore you. Some defend their patch only. <b>Smarter</b> enemies will search for you if they lose sight; <b>dumber</b> ones give up. Leaving a creature's biome usually breaks pursuit.<br>
    <b>Treants</b> are passive unless you strike them — even nearby combat won't provoke them. They regenerate in their forest. Each treant has its own temperament.<br>
    <b>Mushrooms</b> in the southeastern forest will flee if approached individually. Once enough gather, they encircle and attack as a group — do not strike first.<br>
    <b>Rock Golems</b> in the northeastern caves are immune to everything except blunt weapons. Some stand motionless until struck hard enough.<br>
    <b>Wolves</b> roam forests and mountains. Dire wolves are rarer but stronger. Both may hunt in pairs or small packs.<br>
    <b>Goblins</b> vary in personality — some are aggressive, others wary without allies, and some lead packs.<br>
    <b>Aquatic enemies</b> near eastern shorelines approach from the water to fight.<br>
    <b>Poison</b> stacks and deals % max HP + flat damage per turn, reduced by CON (75%) and STR (25%). Antidotes clear all stacks.
  </div>`;
  html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
}

function examineTile(x, y){
  const player = state.player;
  if (!inBounds(state.player.layer, x, y)) return;
  const ground = worlds[state.player.layer][y][x];
  const cover = getCover(state.player.layer, x, y);
  const mon = monsterAt(x, y, state.player.layer);
  let html = `<h2>Examine</h2>`;
  html += `<div class="shop-h">Terrain</div>`;
  html += `<div class="dialogue" style="font-style:normal;">${terrainName(ground, cover)}${coverBonus(ground, cover)?` <span class="sub">(cover +${coverBonus(ground, cover)})</span>`:''}</div>`;
  if (mon){
    html += `<div class="shop-h">${mon.name}</div>`;
    html += `<div class="dialogue" style="font-style:normal;font-size:10px;">`;
    html += `HP: ${mon.hp}/${mon.hpMax}<br>`;
    html += `STR ${mon.str} · CON ${mon.con} · DEX ${mon.dex} · INT ${mon.int}<br>`;
    html += `Attack: ${monDamage(mon)} ${mon.dmgType} · Def ${mon.def} · Dodge ${Math.round(monDodge(mon))}%<br>`;
    html += `Tags: <b>${mon.tags.join(', ')}</b><br>`;
    html += `Percept: ${mon.percept} · Hostility: ${['passive','territorial','aggressive'][mon.hostility]}<br>`;
    html += `AI: ${mon.aiState}${mon.search>0?' (searches)':' (no search)'} · Speed: ${mon.speed||60}<br>`;
    if (mon.personality && mon.personality !== 'normal') html += `Trait: <b>${mon.personality.replace(/_/g,' ')}</b><br>`;
    const dtypes = [DMG.BLADE, DMG.BLUNT, DMG.FIRE, DMG.COLD, DMG.ELEC, DMG.POISON];
    const weaks = dtypes.map(d => ({d, m:resistMult(mon.tags, d)}));
    const immune = weaks.filter(w => w.m === 0).map(w=>w.d);
    const weakTo = weaks.filter(w => w.m >= 1.3 && w.m !== 0).map(w=>w.d);
    const resists = weaks.filter(w => w.m < 1 && w.m > 0 && w.m <= 0.7).map(w=>w.d);
    if (weakTo.length) html += `WEAK: <b style="color:#e0a060">${weakTo.join(', ')}</b><br>`;
    if (resists.length) html += `RESIST: <b style="color:#888">${resists.join(', ')}</b><br>`;
    if (immune.length)  html += `IMMUNE: <b style="color:#444">${immune.join(', ')}</b>`;
    html += `</div>`;
  }
  const f = getFeature(state.player.layer, x, y);
  if (f){ html += `<div class="shop-h">Feature</div><div class="dialogue" style="font-style:normal;font-size:10px;">${f.type}${f.name?' — '+f.name:''}</div>`; }
  html += `<div class="close-row"><button class="btn" id="btn-close">OK</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
}

function readBook(idx){
  const player = state.player;
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'book') return;
  const b = BOOKS[it.key];
  if (state.player.int < b.intReq){
    log(`You can't make sense of it. (INT ${b.intReq}+ required)`, 'warn');
    return;
  }
  openBook(it.key, true, idx);
}

export { useAction, interact, useStairs, pickUpBook,
         openBook, readBook, openChest, consumeFeature,
         openNPC, openShop, renderShop, buyCost, sellValue, itemBaseValue,
         openCastle, openSunward, openBlackspire,
         showHelp, examineTile };
