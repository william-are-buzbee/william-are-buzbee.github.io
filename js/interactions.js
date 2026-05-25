// ==================== USE / INTERACT — core hub ====================
import { state, worlds, covers, features, monsters } from './state.js';
import { DMG, resistMult, LAYER_SURFACE, LAYER_UNDER, W_SURF, H_SURF, PRICE_CAT, FED_MAX } from './constants.js';
import { T, terrainName, coverBonus } from './terrain.js';
import { rand, randi, choice } from './rng.js';
import { FOOD, POTIONS, BOOKS, findWeapon, findArmor, itemPriceCategory } from './items.js';
import { INV_SLOTS, carryCapacity, totalWeight, overWeight, bagFull, addItem,
         defaultWeight, buyPriceMul, innPriceMul, sellValueMul, deriveHP,
         playerMelee, effectiveAP, playerDef, playerAcc, playerDodge,
         playerCritChance, playerCritMult, stealthBonus, poisonResistance, foodFedMul } from './player.js';
import { monDodge, monAcc, monDamage, monCritChance, monCritMult, spawnMonster } from './monsters.js';
import { NPCS, SHOPS } from './npcs.js';
import { inBounds, monsterAt, chebyshev, getFeature, setFeature, fkey,
         getCover, setCover } from './world-state.js';
import { log } from './log.js';
import { openModal, closeModal, showModal, modalEl } from './modal.js';
import { updateUI, interactable, adjacentFeature, effectLabel } from './ui.js';
import { render } from './rendering.js';
import { endPlayerTurn } from './enemy-ai.js';
import { updatePlayerFOV } from './fov.js';

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
      // Price = fed * ratio, then Central discount for staples, then mercantile
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
  // Safety: skip if target layer or coordinates are missing (e.g. removed structures)
  if (f.targetLayer == null || f.targetX == null || f.targetY == null) {
    log('These stairs lead nowhere.', 'muted');
    return;
  }
  teleportPlayer(f.targetLayer, f.targetX, f.targetY);
  log(f.dir === 'down' ? 'You descend into the dark.' : 'You climb up to the world.', 'warn');
  updatePlayerFOV();  // compute FOV for new layer before render
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
  if (fromInventory && state.player.central >= b.intReq && !state.player.booksRead.has(bookKey)){
    html += `<div class="shop-h">Knowledge</div>`;
    html += `<div class="dialogue" style="font-style:normal;font-size:10px;color:#a8c8e0;">${b.summary}</div>`;
  }
  html += `<div class="close-row">`;
  if (fromInventory && state.player.central >= b.intReq && !state.player.booksRead.has(bookKey)){
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
    <b>F</b> · toggle stealth (Size drives it)<br>
    <b>R</b> · use stairs/sign/NPC/chest/town<br>
    <b>G</b> · pick up item from ground<br>
    <b>L</b> · look at items on ground<br>
  </div>`;
  html += `<div class="shop-h">FED & Healing</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    <b>FED is a second HP bar.</b> Food fills FED — it doesn't heal HP directly.<br>
    <b>Resting</b> converts FED → HP (Size controls the rate and reduces hunger cost).<br>
    Every action drains FED. Resting drains it slowly, moving more, attacking the most.<br>
    Passive regen does not drain FED. At FED 0 you start losing HP. Eat, or visit an inn for a full restore.<br>
    Potions are the only consumable that heals HP directly — use them sparingly.
  </div>`;
  html += `<div class="shop-h">Inventory</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    Bag is <b>10 slots, no stacking.</b> Each item has a <b>weight</b>.<br>
    <b>Strength</b> determines carry capacity (4 + Strength×2). Overweight pickups are blocked.<br>
    Weapons and armor go into your bag — equip from the Items tab.<br>
    Dropping items (×) places them on the ground — pick them up later with <b>G</b>.
  </div>`;
  html += `<div class="shop-h">Attributes</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    <b>Size</b>: HP, per-level HP scaling. Rest heals random HP based on Size. Passive regen at all Size levels. Reduces rest hunger cost. Poison resistance (75% weight, scales with level). Dodge, crit chance, stealth (temporary).<br>
    <b>Strength</b>: melee dmg (probabilistic), carry weight, blunt AP (scales gradually), crit dmg (50%), +1 HP per point.<br>
    <b>Chemical</b>: chemoreception (smell/taste). Future use.<br>
    <b>Vibration</b>: mechanoreception (ground-feel, tremors). Future use.<br>
    <b>Visual</b>: eyesight, accuracy, vision radius.<br>
    <b>Central</b>: centralized processing. XP gain, crit dmg (50%), shop prices, sell value. 1 stunts speech.<br>
    <b>Distributed</b>: multi-node processing (reflexes). Future use.
  </div>`;
  html += `<div class="shop-h">Damage Types</div>`;
  html += `<div class="dialogue" style="font-style:normal;font-size:10px;line-height:1.7;">
    BLADE cuts flesh but <b>resists</b> on armored, shelled, scaled, and stone foes. BLUNT breaks bone/armor/stone.<br>
    FIRE ruins plants, ice, mummies. COLD cracks fire-things but does NOTHING to undead/bone/ice.<br>
    ELECTRIC devastates aquatic foes. POISON useless on undead/bone/stone/fungal. Poison stacks and deals %HP+flat, resisted by Size/Strength.
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
    <b>Poison</b> stacks and deals % max HP + flat damage per turn, reduced by Size (75%) and Strength (25%). Antidotes clear all stacks.
  </div>`;
  html += `<div class="close-row"><button class="btn" id="btn-close">CLOSE</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
}

function examineTile(x, y){
  const player = state.player;
  if (!inBounds(state.player.layer, x, y)) return;

  // Self-inspect: right-click your own tile
  if (x === player.x && y === player.y && player.layer === state.player.layer){
    openModal(buildPlayerCard(player));
    document.getElementById('btn-close').onclick = closeModal;
    return;
  }

  const ground = worlds[state.player.layer][y][x];
  const cover = getCover(state.player.layer, x, y);
  const mon = monsterAt(x, y, state.player.layer);

  if (mon){
    openModal(buildMonsterCard(mon, player, ground, cover));
    document.getElementById('btn-close').onclick = closeModal;
    return;
  }

  // Plain terrain examine (no monster)
  const tName = terrainName(ground, cover);
  const cb = coverBonus(ground, cover);
  let html = cardCSS();
  html += `<div class="ex-card">`;
  html += `<div class="ex-header"><span class="ex-name">${tName}</span></div>`;
  if (cb){
    html += `<div class="ex-sep"></div>`;
    html += `<div class="ex-row"><span class="ex-dim">Cover</span> <span class="ex-val">+${cb} defense</span></div>`;
  }
  const f = getFeature(state.player.layer, x, y);
  if (f){
    html += `<div class="ex-sep"></div>`;
    html += `<div class="ex-row"><span class="ex-dim">${f.type}</span> <span>${f.name||''}</span></div>`;
  }
  html += `</div>`;
  html += `<div class="close-row"><button class="btn" id="btn-close">OK</button></div>`;
  openModal(html);
  document.getElementById('btn-close').onclick = closeModal;
}

// ==================== STAT CARD: EMBEDDED STYLES ====================
function cardCSS(){
  return `<style>
    .ex-card { font-size:11px; line-height:1.5; padding:4px 0; }
    .ex-card * { box-sizing:border-box; }
    .ex-header { display:flex; align-items:baseline; gap:8px; padding:2px 4px 6px; }
    .ex-name { font-size:14px; font-weight:bold; color:#e0d0b0; letter-spacing:.5px; }
    .ex-sep { height:1px; background:#555; margin:8px 0; opacity:0.6; }
    .ex-dim { color:#777; }
    .ex-val { color:#ddd; }
    .ex-row { display:flex; justify-content:space-between; align-items:baseline; padding:4px 4px; }
    .ex-pair { display:flex; justify-content:space-between; padding:4px 4px; }
    .ex-pair > span { flex:1; display:flex; gap:5px; align-items:baseline; }
    .ex-attrs { display:flex; justify-content:space-between; padding:5px 4px; font-size:11px; }
    .ex-attrs > span { display:flex; gap:4px; align-items:baseline; color:#ddd; }
    .ex-specials { padding:2px 4px; }
    .ex-special-line { color:#c8a050; font-size:10px; line-height:1.8; padding:1px 0; }
    .ex-special-line:before { content:'· '; color:#666; }
    .ex-terrain { font-size:10px; }
    .ex-terrain .ex-dim { color:#666; }
  </style>`;
}

// ==================== STAT CARD: HP BAR HELPER ====================
function hpBar(hp, hpMax, width){
  const pct = Math.max(0, Math.min(1, hp / hpMax));
  const filled = Math.round(pct * width);
  const empty  = width - filled;
  const color = pct > 0.5 ? '#6a4' : pct > 0.25 ? '#ca4' : '#c44';
  return `<span style="color:${color}">${'█'.repeat(filled)}</span><span style="color:#444">${'░'.repeat(empty)}</span>`;
}

// ==================== STAT CARD: MONSTER (INT-GATED) ====================
function buildMonsterCard(mon, player, ground, cover){
  const pCentral = player.central;
  let h = cardCSS();
  h += `<div class="ex-card">`;

  // --- Always visible: name, level, HP ---
  h += `<div class="ex-header">`;
  h += `<span class="ex-name">${mon.name}</span>`;
  h += `<span class="ex-dim">(Level ${mon.tier})</span>`;
  h += `</div>`;
  h += `<div class="ex-sep"></div>`;
  h += `<div class="ex-row"><span class="ex-dim">HP</span> ${hpBar(mon.hp, mon.hpMax, 10)} <span class="ex-val">${mon.hp}/${mon.hpMax}</span></div>`;
  h += `<div class="ex-pair">`;
  h += `<span><span class="ex-dim">ATK</span> <span class="ex-val">${monDamage(mon)}</span></span>`;
  h += `<span><span class="ex-dim">DEF</span> <span class="ex-val">${mon.def}</span></span>`;
  h += `</div>`;

  // --- Central 30+: attributes, accuracy, dodge ---
  if (pCentral >= 30){
    h += `<div class="ex-sep"></div>`;
    h += `<div class="ex-attrs">`;
    h += `<span><span class="ex-dim">Size</span> ${mon.siz}</span>`;
    h += `<span><span class="ex-dim">Str</span> ${mon.strength}</span>`;
    h += `<span><span class="ex-dim">Chem</span> ${mon.chem}</span>`;
    h += `<span><span class="ex-dim">Vib</span> ${mon.vib}</span>`;
    h += `<span><span class="ex-dim">Vis</span> ${mon.vis}</span>`;
    h += `<span><span class="ex-dim">Cen</span> ${mon.central}</span>`;
    h += `<span><span class="ex-dim">Dist</span> ${mon.distributed}</span>`;
    h += `</div>`;
    h += `<div class="ex-sep"></div>`;
    h += `<div class="ex-pair">`;
    h += `<span><span class="ex-dim">Accuracy</span> <span class="ex-val">${monAcc(mon)}%</span></span>`;
    h += `<span><span class="ex-dim">Dodge</span> <span class="ex-val">${Math.round(monDodge(mon))}%</span></span>`;
    h += `</div>`;
  }

  // --- Central 50+: crit, AP, stealth, specials ---
  if (pCentral >= 50){
    h += `<div class="ex-sep"></div>`;
    const critCh = monCritChance(mon);
    const critMl = monCritMult(mon);
    h += `<div class="ex-pair">`;
    h += `<span><span class="ex-dim">Crit</span> <span class="ex-val">${Math.round(critCh)}%</span></span>`;
    h += `<span><span class="ex-dim">Crit Dmg</span> <span class="ex-val">×${critMl.toFixed(2)}</span></span>`;
    h += `</div>`;
    if (mon.weaponAtk && mon.def){
      h += `<div class="ex-row"><span class="ex-dim">Armor Pierce</span> <span class="ex-val">0</span></div>`;
    }
    h += `<div class="ex-row"><span class="ex-dim">Percept</span> <span class="ex-val">${mon.percept}</span></div>`;

    // Special abilities
    const specials = [];
    if (mon.dmgType === DMG.POISON) specials.push('Poison touch');
    if (mon.dmgType === DMG.FIRE) specials.push('Fire attack');
    if (mon.dmgType === DMG.COLD) specials.push('Cold attack');
    if (mon.dmgType === DMG.ELEC) specials.push('Electric attack');
    if (mon.mods && mon.mods.waterHeal) specials.push('Water healing');
    if (mon.mods && mon.mods.blindsight) specials.push(`Blindsight (${mon.mods.blindsight})`);
    const dtypes = [DMG.BLADE, DMG.BLUNT, DMG.FIRE, DMG.COLD, DMG.ELEC, DMG.POISON];
    const weaks  = dtypes.map(d => ({d, m:resistMult(mon.tags, d)}));
    const weakTo  = weaks.filter(w => w.m >= 1.3 && w.m !== 0).map(w => w.d);
    const resists = weaks.filter(w => w.m < 1 && w.m > 0 && w.m <= 0.7).map(w => w.d);
    const immune  = weaks.filter(w => w.m === 0).map(w => w.d);
    if (weakTo.length)  specials.push(`<span style="color:#e0a060">Weak: ${weakTo.join(', ')}</span>`);
    if (resists.length) specials.push(`<span style="color:#888">Resist: ${resists.join(', ')}</span>`);
    if (immune.length)  specials.push(`<span style="color:#555">Immune: ${immune.join(', ')}</span>`);

    if (specials.length){
      h += `<div class="ex-sep"></div>`;
      h += `<div class="ex-specials">`;
      for (const s of specials) h += `<div class="ex-special-line">${s}</div>`;
      h += `</div>`;
    }
  }

  // --- Central 70+: behavior, leash, biome, night vision ---
  if (pCentral >= 70){
    h += `<div class="ex-sep"></div>`;
    const hostNames = ['Passive','Territorial','Aggressive'];
    const traits = [];
    traits.push(hostNames[mon.hostility] || 'Unknown');
    if (mon.personality && mon.personality !== 'normal'){
      traits.push(mon.personality.replace(/_/g, ' '));
    }
    h += `<div class="ex-row"><span class="ex-dim">Behavior</span> <span class="ex-val">${traits.join(' · ')}</span></div>`;
    h += `<div class="ex-pair">`;
    h += `<span><span class="ex-dim">Leash</span> <span class="ex-val">${mon.chase} tiles</span></span>`;
    h += `<span><span class="ex-dim">Search</span> <span class="ex-val">${mon.search > 0 ? mon.search + ' turns' : 'none'}</span></span>`;
    h += `</div>`;
    const visionTraits = [];
    if (mon.mods && mon.mods.nightVision) visionTraits.push('Night vision');
    if (mon.mods && mon.mods.blindsight) visionTraits.push('Blindsight');
    if (visionTraits.length){
      h += `<div class="ex-row"><span class="ex-dim">Senses</span> <span class="ex-val">${visionTraits.join(', ')}</span></div>`;
    }
    h += `<div class="ex-row"><span class="ex-dim">Speed</span> <span class="ex-val">${mon.speed || 60}</span></div>`;
  }

  // --- Central 90+: exact damage range, loot hints ---
  if (pCentral >= 90){
    h += `<div class="ex-sep"></div>`;
    const baseDmg = monDamage(mon);
    const low = Math.max(1, baseDmg - Math.floor(mon.strength * 0.025));
    const high = baseDmg + Math.floor(mon.strength * 0.025);
    h += `<div class="ex-row"><span class="ex-dim">Dmg Range</span> <span class="ex-val">${low}–${high} ${mon.dmgType}</span></div>`;
    if (mon.goldRange){
      h += `<div class="ex-row"><span class="ex-dim">Loot</span> <span class="ex-val">${mon.goldRange[0]}–${mon.goldRange[1]} gold</span></div>`;
    }
    h += `<div class="ex-row"><span class="ex-dim">XP Value</span> <span class="ex-val">${mon.xp}</span></div>`;
  }

  // Terrain footer
  h += `<div class="ex-sep"></div>`;
  const cb = coverBonus(ground, cover);
  h += `<div class="ex-row ex-terrain"><span class="ex-dim">${terrainName(ground, cover)}</span>${cb ? `<span>cover +${cb}</span>` : ''}</div>`;

  h += `</div>`;
  h += `<div class="close-row"><button class="btn" id="btn-close">OK</button></div>`;
  return h;
}

// ==================== STAT CARD: PLAYER (SELF-INSPECT) ====================
function buildPlayerCard(p){
  let h = cardCSS();
  h += `<div class="ex-card">`;

  // Header
  h += `<div class="ex-header">`;
  h += `<span class="ex-name">Adventurer</span>`;
  h += `<span class="ex-dim">(Level ${p.level})</span>`;
  h += `</div>`;
  h += `<div class="ex-sep"></div>`;

  // HP bar
  h += `<div class="ex-row"><span class="ex-dim">HP</span> ${hpBar(p.hp, p.hpMax, 10)} <span class="ex-val">${p.hp}/${p.hpMax}</span></div>`;

  // FED bar
  const fedFilled = Math.round(Math.max(0, p.fed) / 10);
  const fedEmpty = 10 - fedFilled;
  const fedColor = p.fed > 40 ? '#6a4' : p.fed > 15 ? '#ca4' : '#c44';
  h += `<div class="ex-row"><span class="ex-dim">FED</span> <span style="color:${fedColor}">${'█'.repeat(fedFilled)}</span><span style="color:#444">${'░'.repeat(fedEmpty)}</span> <span class="ex-val">${Math.round(p.fed)}/100</span></div>`;

  // Attributes
  h += `<div class="ex-sep"></div>`;
  h += `<div class="ex-attrs">`;
  h += `<span><span class="ex-dim">Size</span> ${p.siz}</span>`;
  h += `<span><span class="ex-dim">Str</span> ${p.strength}</span>`;
  h += `<span><span class="ex-dim">Chem</span> ${p.chem}</span>`;
  h += `<span><span class="ex-dim">Vib</span> ${p.vib}</span>`;
  h += `<span><span class="ex-dim">Vis</span> ${p.vis}</span>`;
  h += `<span><span class="ex-dim">Cen</span> ${p.central}</span>`;
  h += `<span><span class="ex-dim">Dist</span> ${p.distributed}</span>`;
  h += `</div>`;

  // Equipment
  h += `<div class="ex-sep"></div>`;
  const elemTag = p.weapon.elem ? '+' + p.weapon.elem : '';
  h += `<div class="ex-row"><span class="ex-dim">Weapon</span> <span class="ex-val">${p.weapon.name} <span class="ex-dim">[${p.weapon.type}${elemTag}]</span></span></div>`;
  h += `<div class="ex-row"><span class="ex-dim">Armor</span> <span class="ex-val">${p.armor.name} <span class="ex-dim">DEF ${playerDef(p)}</span></span></div>`;

  // Derived combat stats
  h += `<div class="ex-sep"></div>`;
  h += `<div class="ex-pair">`;
  h += `<span><span class="ex-dim">ATK</span> <span class="ex-val">~${playerMelee(p)}</span></span>`;
  h += `<span><span class="ex-dim">DEF</span> <span class="ex-val">${playerDef(p)}</span></span>`;
  h += `</div>`;
  h += `<div class="ex-pair">`;
  h += `<span><span class="ex-dim">Accuracy</span> <span class="ex-val">${playerAcc(p)}%</span></span>`;
  h += `<span><span class="ex-dim">Dodge</span> <span class="ex-val">${Math.round(playerDodge(p))}%</span></span>`;
  h += `</div>`;
  h += `<div class="ex-pair">`;
  h += `<span><span class="ex-dim">Crit</span> <span class="ex-val">${Math.round(playerCritChance(p))}%</span></span>`;
  h += `<span><span class="ex-dim">Crit Dmg</span> <span class="ex-val">×${playerCritMult(p).toFixed(2)}</span></span>`;
  h += `</div>`;

  // Armor piercing (only if weapon has any)
  const ap = p.weapon.ap || 0;
  let displayAP = ap;
  if (p.weapon.type === DMG.BLUNT) displayAP += (p.strength / 10 - 1) * (3 / 9);
  if (displayAP > 0){
    h += `<div class="ex-row"><span class="ex-dim">Armor Pierce</span> <span class="ex-val">~${displayAP.toFixed(1)}</span></div>`;
  }

  // Stealth
  const sb = stealthBonus(p);
  if (sb > 0){
    h += `<div class="ex-row"><span class="ex-dim">Stealth</span> <span class="ex-val">${sb}${p.stealth ? ' (active)' : ''}</span></div>`;
  }

  // Active effects
  if (p.effects.length > 0){
    h += `<div class="ex-sep"></div>`;
    const poisonStacks = p.effects.filter(e => e.type === 'poison');
    const others = p.effects.filter(e => e.type !== 'poison');
    for (const e of others){
      const dur = e.turns === 999 ? '∞' : e.turns + 't';
      h += `<div class="ex-row"><span class="ex-dim">${effectLabel(e)}</span> <span class="ex-val">${dur}</span></div>`;
    }
    if (poisonStacks.length > 0){
      const maxT = Math.max(...poisonStacks.map(s => s.turns));
      const pr = poisonResistance(p);
      h += `<div class="ex-row"><span class="ex-dim">Poisoned ×${poisonStacks.length}</span> <span class="ex-val">${maxT}t <span class="ex-dim">(-${Math.round(pr.damageReduction*100)}% resist)</span></span></div>`;
    }
  }

  // XP
  h += `<div class="ex-sep"></div>`;
  h += `<div class="ex-row"><span class="ex-dim">XP</span> <span class="ex-val">${p.xp} / ${p.xpNext}</span></div>`;
  h += `<div class="ex-row"><span class="ex-dim">Gold</span> <span class="ex-val">${p.gold}</span></div>`;

  h += `</div>`;
  h += `<div class="close-row"><button class="btn" id="btn-close">OK</button></div>`;
  return h;
}

function readBook(idx){
  const player = state.player;
  const it = state.player.inventory[idx];
  if (!it || it.kind !== 'book') return;
  const b = BOOKS[it.key];
  if (state.player.central < b.intReq){
    log(`You can't make sense of it. (Central ${b.intReq}+ required)`, 'warn');
    return;
  }
  openBook(it.key, true, idx);
}

export { useAction, interact, useStairs, pickUpBook,
         openBook, readBook, openChest, consumeFeature,
         openNPC, openShop, renderShop, buyCost, sellValue, itemBaseValue,
         openCastle, openSunward, openBlackspire,
         showHelp, examineTile };
