// ==================== UI REFRESH ====================
// Refactored: 5-button HUD system (Status, Character, Equipment, Inventory, Log Toggle)
// with pixel-art RPG styling. Gold now displayed in Inventory tab.

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
    displayAP += (p.str - 1) * (3 / 9);
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
    str: p.str, con: p.con, dex: p.dex, int: p.int,
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
    `<div class="perkline">${line.replace(/^(STR|CON|DEX|INT) (\d+):/, '<b>$1 $2:</b>')}</div>`
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
  // Gold is now shown here in the inventory header
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
  const canRead = player.int >= b.intReq;
  return `<div class="item-row">
    <span class="iname">${b.name} <span class="ibook">INT ${b.intReq}+</span> <span class="iwt">wt ${it.weight || 1}</span></span>
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


// ───────────────────────────────────────────────────────
//  §4  DOM WRITER  (no logic — just assignments)
// ───────────────────────────────────────────────────────

function applyToDOM(d) {
  // Vitals (Status tab)
  $('s-lvl').textContent  = d.level;
  $('s-xp').textContent   = d.xpText;
  $('b-xp').style.width   = d.xpPct + '%';
  $('s-hp').textContent   = d.hpText;
  $('b-hp').style.width   = d.hpPct + '%';

  // Hunger (Status tab)
  const fedEl = $('s-food');
  fedEl.textContent = d.fedLabel;
  fedEl.className   = 'v' + (d.fedWarn ? ' warn' : '');
  $('b-food').style.width = d.fedPct + '%';

  // Attributes (Character tab) — highlight ≥ 7
  const hi = (el, val) => { el.textContent = val; el.className = 'v' + (val >= 7 ? ' hi' : ''); };
  hi($('a-str'), d.str);
  hi($('a-con'), d.con);
  hi($('a-dex'), d.dex);
  hi($('a-int'), d.int);

  // Combat (Character tab)
  $('d-atk').textContent   = d.atkText;
  $('d-def').textContent   = d.defVal;
  $('d-acc').textContent   = d.accVal;
  $('d-dodge').textContent = d.dodgeText + d.dexSuffix;
  $('d-crit-chance').textContent = d.critChanceText;
  $('d-crit-dmg').textContent  = d.critDmgText;

  // Passives (Character tab)
  $('perks-list').innerHTML = buildPerksHTML(d._player);

  // Equipment tab (wealth section removed — gold now in inventory)
  $('eq-wpn').textContent     = d.wpnName;
  $('eq-wpn-tag').textContent = d.wpnTag;
  $('eq-arm').textContent     = d.armText;

  // Inventory tab (gold is embedded in the inventory header)
  $('items-list').innerHTML = buildInventoryHTML(d._player, d._tWt, d._cap);

  // Stealth toggle on hidden action button (for JS compat)
  const stealthBtn = $('act-stealth');
  if (stealthBtn) stealthBtn.classList.toggle('on', d.stealth);

  // Use button disable state (for JS compat)
  const here = getFeature(d._player.layer, d._player.x, d._player.y);
  const adj  = adjacentFeature();
  const useBtn = $('act-use');
  if (useBtn) useBtn.disabled = !(here && interactable(here)) && !(adj && interactable(adj.f));
}


// ───────────────────────────────────────────────────────
//  §5  THROTTLED PUBLIC ENTRY POINT
// ───────────────────────────────────────────────────────

let _rafPending = false;

/**
 * Main UI refresh.  Safe to call at any frequency — successive
 * calls within the same frame are coalesced via requestAnimationFrame
 * so the browser only paints once, eliminating flicker during
 * rapid movement or batch state changes.
 */
function updateUI() {
  if (_rafPending) return;          // already scheduled
  _rafPending = true;

  requestAnimationFrame(() => {
    _rafPending = false;
    const data = computeUIData();
    if (!data) return;              // player / world not ready
    applyToDOM(data);
  });
}

/**
 * Synchronous variant for moments that must reflect immediately
 * (e.g. right before opening a modal that reads DOM values).
 */
function updateUISync() {
  const data = computeUIData();
  if (!data) return;
  applyToDOM(data);
}


// ───────────────────────────────────────────────────────
//  §6  REGION NAME RESOLVER
// ───────────────────────────────────────────────────────

function getRegionName() {
  const p = state.player;
  if (!p) return '';

  // World tile lookup — guard against unloaded worlds
  const row = worlds[p.layer]?.[p.y];
  if (!row) return 'unknown';
  const t = row[p.x];

  // Inside the surface town compound (WOOD_FLOOR or WALL ground on surface)
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
//  §7  TAB TOGGLE & SWITCHING
// ───────────────────────────────────────────────────────

const TAB_IDS = ['status', 'character', 'equipment', 'inventory'];

/**
 * Toggle a tab: if it's already active, close the panel entirely.
 * If another tab is active (or none), open this one.
 */
function switchTab(tabName) {
  if (!TAB_IDS.includes(tabName)) return;

  const panel = document.getElementById('sidebar-panel');
  const isAlreadyActive = state.uiActiveTab === tabName;

  if (isAlreadyActive) {
    // Close panel
    state.uiActiveTab = null;
    document.querySelectorAll('.sidebar-tab[data-tab]').forEach(btn => {
      btn.classList.remove('active');
    });
    TAB_IDS.forEach(id => {
      const el = document.getElementById('tab-' + id);
      if (el) el.classList.add('hidden');
    });
    if (panel) panel.classList.remove('open');
  } else {
    // Open this tab
    state.uiActiveTab = tabName;
    document.querySelectorAll('.sidebar-tab[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    TAB_IDS.forEach(id => {
      const el = document.getElementById('tab-' + id);
      if (el) el.classList.toggle('hidden', id !== tabName);
    });
    if (panel) panel.classList.add('open');
  }
}

/** Restore HUD state on load (call once after DOM ready). */
function restoreHUDState() {
  if (state.uiActiveTab && TAB_IDS.includes(state.uiActiveTab)) {
    switchTab(state.uiActiveTab);
  }
}

// Wire up click handlers once the DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initHUD);
} else {
  _initHUD();
}

function _initHUD() {
  // Tab buttons — toggle behavior (only data-tab buttons, not toggle-log)
  document.querySelectorAll('.sidebar-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  restoreHUDState();
}


// ───────────────────────────────────────────────────────
//  §8  EXPORTS
// ───────────────────────────────────────────────────────

export {
  updateUI,
  updateUISync,
  interactable,
  adjacentFeature,
  effectLabel,
  getRegionName,
  monsterAt,
  chebyshev,
  restoreHUDState,
};
