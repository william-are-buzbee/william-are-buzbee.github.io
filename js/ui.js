// ==================== UI REFRESH ====================
// Stripped: sidebar panels removed. DOM writes that targeted removed
// elements are gutted. Data computation kept for future modal/HUD use.

import { state, worlds, features, monsters } from './state.js';
import { DMG, LAYER_SURFACE, LAYER_UNDER } from './constants.js';
import { T } from './terrain.js';
import { FOOD, POTIONS, BOOKS, findWeapon, findArmor } from './items.js';
import {
  INV_SLOTS, carryCapacity, totalWeight,
  playerMelee, playerDef, playerAcc, playerDodge,
  playerCritChance, playerCritMult, buyPriceMul,
  poisonResistance, passiveRegenInterval, describeAttributePerks
} from './player.js';
import { inBounds, getFeature } from './world-state.js';

// ───────────────────────────────────────────────────────
//  §1  CONSTANTS & HELPERS
// ───────────────────────────────────────────────────────

const EFFECT_LABELS = {
  stealth: 'Hidden',
  regen:   'Regen',
  burning: 'Burning',
  poison:  'Poisoned',
  alert:   'Alerted',
};

const INTERACTABLE_TYPES = new Set([
  'stairs', 'sign', 'npc', 'castle', 'chest',
  'book', 'well', 'home', 'shop_building', 'throne',
]);

const $ = id => document.getElementById(id);

/** Shared empty-state markup — one source of truth. */
const EMPTY_HTML = '<div class="empty-state">— None —</div>';

function effectLabel(e) {
  return EFFECT_LABELS[e.type] || e.type;
}

function interactable(f) {
  return f != null && INTERACTABLE_TYPES.has(f.type);
}

function adjacentFeature() {
  const p = state.player;
  if (!p) return null;
  const dirs = [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]];
  for (const [dx, dy] of dirs) {
    const x = p.x + dx, y = p.y + dy;
    if (!inBounds(p.layer, x, y)) continue;
    const f = getFeature(p.layer, x, y);
    if (f && interactable(f)) return { f, x, y };
  }
  return null;
}

function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function monsterAt(x, y, layer) {
  const l = layer ?? state.player?.layer;
  if (l == null || !monsters[l]) return undefined;
  return monsters[l].find(m => m.x === x && m.y === y && m.hp > 0);
}


// ───────────────────────────────────────────────────────
//  §2  DATA FORMATTERS  (pure — no DOM access)
// ───────────────────────────────────────────────────────

/** Return a plain object with every computed display value. */
function computeUIData() {
  const p = state.player;
  if (!p) return null;

  const tWt    = totalWeight(p);
  const cap    = carryCapacity(p);
  const overwt = tWt > cap;

  // Weapon tooltip pieces
  let displayAP = p.weapon.ap || 0;
  if (p.weapon.type === DMG.BLUNT) {
    displayAP += (p.strength - 1) * (3 / 9);
  }
  const elemTag = p.weapon.elem ? '+' + p.weapon.elem : '';
  const apStr   = displayAP > 0 ? ` ap~${displayAP.toFixed(1)}` : '';

  return {
    // vitals
    level:    p.level,
    xpText:   `${p.xp} / ${p.xpNext}`,
    xpPct:    Math.min(100, (p.xp / p.xpNext) * 100),
    hpText:   `${p.hp} / ${p.hpMax}`,
    hpPct:    Math.max(0, (p.hp / p.hpMax) * 100),

    // hunger
    fedPct:   Math.max(0, p.fed),
    fedLabel: p.fed > 75 ? 'FULL' : p.fed > 40 ? 'FED' : p.fed > 15 ? 'HUNGRY' : 'STARVING',
    fedWarn:  p.fed <= 40,

    // attributes
    siz: p.siz, strength: p.strength, chem: p.chem, vib: p.vib, vis: p.vis, central: p.central, distributed: p.distributed,
    gold: p.gold,
    slotsText: `${p.inventory.length}/${INV_SLOTS} · ${tWt}/${cap}wt`,

    // derived combat
    dexSuffix: p.armor.dodgePenalty ? ` (-${p.armor.dodgePenalty}%)` : '',
    atkText:   '~' + playerMelee(p) + ` [${p.weapon.type}${elemTag}]`,
    defVal:    playerDef(p),
    accVal:    playerAcc(p),
    dodgeText: Math.round(playerDodge(p)) + '%',
    critChanceText: Math.round(playerCritChance(p)) + '%',
    critDmgText:  '×' + playerCritMult(p).toFixed(2),

    // equipment
    wpnName: p.weapon.name,
    wpnTag:  `[${p.weapon.type}${elemTag}${apStr}]`,
    armText: p.armor.name + (p.armor.dodgePenalty ? ` (-${p.armor.dodgePenalty}% dodge)` : ''),

    // flags
    stealth: p.stealth,
    overwt,

    // location
    regionName: getRegionName(),
    layerLabel: p.layer === LAYER_SURFACE ? 'Surface'
              : 'Underground',

    // raw refs for list builders
    _player: p,
    _tWt: tWt,
    _cap: cap,
  };
}


// ───────────────────────────────────────────────────────
//  §3  LIST BUILDERS  (return HTML strings)
// ───────────────────────────────────────────────────────

const BOOK_PERK_DESCRIPTIONS = [
  ['hp_bonus',      '📖 +8 HP (Hermit\'s Treatise)'],
  ['stealth_bonus', '📖 +20 stealth (Shadowplay)'],
  ['blade_bonus',   '📖 +1 blade dmg (Steel & Tempering)'],
  ['blunt_bonus',   '📖 +1 blunt dmg (Stone & Force)'],
  ['food_bonus',    '📖 +50% food FED (Old Physicians)'],
  ['cursed_bane',   '📖 +25% vs cursed (Pacts)'],
  ['xp_bonus',      '📖 +15% XP (Scribe\'s Margin)'],
];

function buildPerksHTML(player) {
  const attrPerks = describeAttributePerks(player);
  const bookPerks = BOOK_PERK_DESCRIPTIONS
    .filter(([key]) => player.perks[key])
    .map(([, label]) => label);

  const all = attrPerks.concat(bookPerks);
  if (all.length === 0) return EMPTY_HTML;

  return all.map(line =>
    `<div class="perkline">${line.replace(/^(Size|Strength|Chemical|Vibration|Visual|Central|Distributed) (\d+):/, '<b>$1 $2:</b>')}</div>`
  ).join('');
}

function buildEffectsHTML(player) {
  if (player.effects.length === 0) return EMPTY_HTML;

  const poisonStacks = player.effects.filter(e => e.type === 'poison');
  const otherEffects = player.effects.filter(e => e.type !== 'poison');

  let html = otherEffects.map(e => {
    const label    = effectLabel(e);
    const duration = e.turns === 999 ? '∞' : e.turns + 't';
    return `<div class="effline"><b>${label}</b> <span style="color:#666;">${duration}</span></div>`;
  }).join('');

  if (poisonStacks.length > 0) {
    const maxTurns = Math.max(...poisonStacks.map(s => s.turns));
    const resist   = poisonResistance(player);
    const dmgPct   = Math.round(resist.damageReduction * 100);
    html += `<div class="effline"><b>Poisoned ×${poisonStacks.length}</b> `
          + `<span style="color:#666;">${maxTurns}t max</span> `
          + `<span style="color:#555;font-size:9px;">(-${dmgPct}% resist)</span></div>`;
  }
  return html;
}

function buildInventoryHTML(player, totalWt, cap) {
  const overwt = totalWt > cap;
  let html = `<div class="inv-header">
    <span>GOLD <b class="gold-val">${player.gold}</b></span>
    <span>SLOTS <b>${player.inventory.length}/${INV_SLOTS}</b></span>
    <span class="${overwt ? 'over' : ''}">WT <b>${totalWt}/${cap}</b></span>
  </div>`;

  if (player.inventory.length === 0) {
    return html + '<div class="empty-state">Empty.</div>';
  }

  html += player.inventory.map((it, idx) => buildItemRow(it, idx, player)).join('');
  return html;
}

function buildItemRow(it, idx, player) {
  switch (it.kind) {
    case 'food':   return foodRow(it, idx);
    case 'potion': return potionRow(it, idx);
    case 'book':   return bookRow(it, idx, player);
    case 'weapon': return weaponRow(it, idx, player);
    case 'armor':  return armorRow(it, idx, player);
    case 'corpse': return corpseRow(it, idx);
    default:       return '';
  }
}

function foodRow(it, idx) {
  const f = FOOD[it.key];
  return `<div class="item-row">
    <span class="iname">${f.name} <span class="ifood">+${f.fed} FED</span> <span class="iwt">wt ${it.weight || 1}</span></span>
    <button data-eat="${idx}">EAT</button>
    <button data-drop="${idx}">×</button>
  </div>`;
}

function potionRow(it, idx) {
  const p = POTIONS[it.key];
  const desc = p.heal ? '+' + p.heal + ' HP' : 'cures';
  return `<div class="item-row">
    <span class="iname">${p.name} <span class="ifood">${desc}</span> <span class="iwt">wt ${it.weight || 1}</span></span>
    <button data-potion="${idx}">USE</button>
    <button data-drop="${idx}">×</button>
  </div>`;
}

function bookRow(it, idx, player) {
  const b = BOOKS[it.key];
  const canRead = player.central >= b.intReq;
  return `<div class="item-row">
    <span class="iname">${b.name} <span class="ibook">Central ${b.intReq}+</span> <span class="iwt">wt ${it.weight || 1}</span></span>
    <button data-book="${idx}" ${canRead ? '' : 'disabled'}>READ</button>
    <button data-drop="${idx}">×</button>
  </div>`;
}

function weaponRow(it, idx, player) {
  const w = findWeapon(it.key);
  const equipped = player.weapon.key === it.key;
  const elemTag  = w.elem ? '+' + w.elem : '';
  return `<div class="item-row">
    <span class="iname">${w.name} <span class="icount">[${w.type}${elemTag}]</span> ${equipped ? '<span class="ieq">EQUIPPED</span>' : ''} <span class="iwt">wt ${it.weight || 2}</span></span>
    <button data-equip-w="${idx}" ${equipped ? 'disabled' : ''}>EQUIP</button>
    <button data-drop="${idx}">×</button>
  </div>`;
}

function armorRow(it, idx, player) {
  const a = findArmor(it.key);
  const equipped = player.armor.key === it.key;
  return `<div class="item-row">
    <span class="iname">${a.name} <span class="icount">DEF+${a.def}</span> ${equipped ? '<span class="ieq">WORN</span>' : ''} <span class="iwt">wt ${it.weight || 3}</span></span>
    <button data-equip-a="${idx}" ${equipped ? 'disabled' : ''}>WEAR</button>
    <button data-drop="${idx}">×</button>
  </div>`;
}

function corpseRow(it, idx) {
  const nutri = it.nutrition || 0;
  const nutriTag = nutri > 0 ? `<span class="ifood">+${nutri} FED</span> ` : '';
  return `<div class="item-row">
    <span class="iname">${it.name} <span class="icount" style="color:#777;">[corpse]</span> ${nutriTag}<span class="iwt">wt ${it.weight || 2}</span></span>
    ${nutri > 0 ? `<button data-eat-corpse="${idx}">EAT</button>` : ''}
    <button data-drop="${idx}">×</button>
  </div>`;
}


// ───────────────────────────────────────────────────────
//  §4  DOM WRITER  (sidebar removed — no-op for now)
// ───────────────────────────────────────────────────────

function applyToDOM(d) {
  // Sidebar panels have been removed from the DOM.
  // Update the minimal always-visible HUD instead.
  updateHud(d);
}

// ───────────────────────────────────────────────────────
//  §4b  MINIMAL HUD  (HP + food bars, top-right)
// ───────────────────────────────────────────────────────

const _hudEl      = document.getElementById('hud');
const _hudHpBar   = document.getElementById('hud-hp');
const _hudFoodBar = document.getElementById('hud-food');
const _hudHpNum   = document.getElementById('hud-hp-num');
const _hudFoodNum = document.getElementById('hud-food-num');

function updateHud(d) {
  if (!_hudEl) return;
  if (!d || state.gameState !== 'play') { _hudEl.classList.remove('show'); return; }

  _hudEl.classList.add('show');

  // HP bar
  const hpPct = Math.max(0, Math.min(100, d.hpPct));
  _hudHpBar.style.width = hpPct + '%';
  _hudHpBar.className = 'hud-bar-fill hp' + (hpPct > 50 ? ' ok' : '');
  _hudHpNum.textContent = d.hpText;

  // Food bar
  const fedPct = Math.max(0, Math.min(100, d.fedPct));
  _hudFoodBar.style.width = fedPct + '%';
  _hudFoodBar.className = 'hud-bar-fill food' + (d.fedWarn ? ' warn' : '');
  _hudFoodNum.textContent = Math.round(state.player.fed) + '%';
}

function hideHud() {
  if (_hudEl) _hudEl.classList.remove('show');
}


// ───────────────────────────────────────────────────────
//  §5  THROTTLED PUBLIC ENTRY POINT
// ───────────────────────────────────────────────────────

let _rafPending = false;

/**
 * Main UI refresh.  Safe to call at any frequency — successive
 * calls within the same frame are coalesced via requestAnimationFrame
 * so the browser only paints once.
 */
function updateUI() {
  if (_rafPending) return;
  _rafPending = true;

  requestAnimationFrame(() => {
    _rafPending = false;
    const data = computeUIData();
    if (!data) return;
    applyToDOM(data);
  });
}

/**
 * Synchronous variant for moments that must reflect immediately.
 */
function updateUISync() {
  const data = computeUIData();
  if (!data) return;
  applyToDOM(data);
}


// ───────────────────────────────────────────────────────
//  §6  REGION NAME RESOLVER
// ───────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────
//  §6b  STAT GROUP BUILDERS (for status overlay + examine)
// ───────────────────────────────────────────────────────

/**
 * Build HTML for player stats in three groups (Physical / Senses / Processing).
 * For the player's own status overlay: always show Physical, hide sense/processing
 * stats that are 0.
 */
function buildPlayerStatGroupsHTML(p) {
  let html = '';

  // Physical — always show
  html += `<div class="ov-section">PHYSICAL</div>`;
  html += `<div class="ov-row"><span class="ov-k">Size</span><span class="ov-v">${p.siz}</span></div>`;
  html += `<div class="ov-row"><span class="ov-k">Strength</span><span class="ov-v">${p.strength}</span></div>`;

  // Senses — only show stats > 0
  const senses = [];
  if (p.chem > 0)  senses.push({name:'Chemical',  val:p.chem});
  if (p.vib > 0)   senses.push({name:'Vibration', val:p.vib});
  if (p.vis > 0)   senses.push({name:'Visual',    val:p.vis});
  if (senses.length > 0) {
    html += `<div class="ov-section">SENSES</div>`;
    for (const s of senses) {
      html += `<div class="ov-row"><span class="ov-k">${s.name}</span><span class="ov-v">${s.val}</span></div>`;
    }
  }

  // Processing — only show stats > 0
  const proc = [];
  if (p.central > 0)      proc.push({name:'Central',     val:p.central});
  if (p.distributed > 0)  proc.push({name:'Distributed', val:p.distributed});
  if (proc.length > 0) {
    html += `<div class="ov-section">PROCESSING</div>`;
    for (const s of proc) {
      html += `<div class="ov-row"><span class="ov-k">${s.name}</span><span class="ov-v">${s.val}</span></div>`;
    }
  }

  return html;
}

/**
 * Build HTML for examining a creature's stats in groups.
 * Gated by the player's Central value — only show stats the player can perceive.
 * centralThreshold: the minimum Central to reveal stat details.
 *   Central 1–3: no stat details shown
 *   Central 4–5: Physical stats only
 *   Central 6–7: Physical + Senses
 *   Central 8+:  All stats
 * If examining self: always full detail (pass fullDetail=true).
 */
function buildExamineStatGroupsHTML(target, playerCentral, fullDetail) {
  if (!fullDetail) {
    if (playerCentral < 4) return '';  // too low to perceive any stats
  }

  let html = '';
  const showPhysical = fullDetail || playerCentral >= 4;
  const showSenses   = fullDetail || playerCentral >= 6;
  const showProc     = fullDetail || playerCentral >= 8;

  // Physical
  if (showPhysical && (target.siz > 0 || target.strength > 0)) {
    html += `<div class="ov-section">PHYSICAL</div>`;
    if (target.siz > 0)      html += `<div class="ov-row"><span class="ov-k">Size</span><span class="ov-v">${target.siz}</span></div>`;
    if (target.strength > 0) html += `<div class="ov-row"><span class="ov-k">Strength</span><span class="ov-v">${target.strength}</span></div>`;
  }

  // Senses
  if (showSenses) {
    const senses = [];
    if (target.chem > 0)  senses.push({name:'Chemical',  val:target.chem});
    if (target.vib > 0)   senses.push({name:'Vibration', val:target.vib});
    if (target.vis > 0)   senses.push({name:'Visual',    val:target.vis});
    if (senses.length > 0) {
      html += `<div class="ov-section">SENSES</div>`;
      for (const s of senses) {
        html += `<div class="ov-row"><span class="ov-k">${s.name}</span><span class="ov-v">${s.val}</span></div>`;
      }
    }
  }

  // Processing
  if (showProc) {
    const proc = [];
    if (target.central > 0)      proc.push({name:'Central',     val:target.central});
    if (target.distributed > 0)  proc.push({name:'Distributed', val:target.distributed});
    if (proc.length > 0) {
      html += `<div class="ov-section">PROCESSING</div>`;
      for (const s of proc) {
        html += `<div class="ov-row"><span class="ov-k">${s.name}</span><span class="ov-v">${s.val}</span></div>`;
      }
    }
  }

  return html;
}

function getRegionName() {
  const p = state.player;
  if (!p) return '';

  const row = worlds[p.layer]?.[p.y];
  if (!row) return 'unknown';
  const t = row[p.x];

  if (p.layer === LAYER_SURFACE && (t === T.WOOD_FLOOR || t === T.WALL)) {
    return 'Millhaven';
  }

  if (p.layer === LAYER_UNDER) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const nx = p.x + dx, ny = p.y + dy;
        if (!inBounds(LAYER_UNDER, nx, ny)) continue;
        const nt = worlds[LAYER_UNDER]?.[ny]?.[nx];
        if (nt === T.LAVA)   return 'lava caves';
        if (nt === T.UWATER) return 'dark deep';
      }
    }
    return 'stone caverns';
  }

  const SURFACE_LABELS = {
    [T.FOREST]:     'forest',
    [T.MUSHFOREST]: 'mushroom forest',
    [T.DESERT]:     'desert',
    [T.MOUNTAIN]:   'mountains',
    [T.WATER]:      'sea',
    [T.DEEP]:       'sea',
    [T.BEACH]:      'coast',
  };
  return SURFACE_LABELS[t] ?? 'plains';
}


// ───────────────────────────────────────────────────────
//  §7  EXPORTS
// ───────────────────────────────────────────────────────

export {
  updateUI,
  updateUISync,
  computeUIData,
  buildInventoryHTML,
  buildPerksHTML,
  buildEffectsHTML,
  buildPlayerStatGroupsHTML,
  buildExamineStatGroupsHTML,
  interactable,
  adjacentFeature,
  effectLabel,
  getRegionName,
  monsterAt,
  chebyshev,
  hideHud,
};
