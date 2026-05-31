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
import { getBodyMap, getAvailableAttacks, computeStrikeDamage } from './constants.js';
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

/** Convert a facing {dx, dy} to a human-readable compass label. */
function facingToLabel(facing) {
  if (!facing) return 'unknown';
  const { dx, dy } = facing;
  if (dx === 0  && dy === -1) return 'north';
  if (dx === 1  && dy === -1) return 'northeast';
  if (dx === 1  && dy === 0)  return 'east';
  if (dx === 1  && dy === 1)  return 'southeast';
  if (dx === 0  && dy === 1)  return 'south';
  if (dx === -1 && dy === 1)  return 'southwest';
  if (dx === -1 && dy === 0)  return 'west';
  if (dx === -1 && dy === -1) return 'northwest';
  return 'unknown';
}

/** Blood status — qualitative word, not a number. */
function getBloodStatus(p) {
  if (!p || p.blood == null || p.bloodMax == null || p.bloodMax <= 0) return null;
  const ratio = p.blood / p.bloodMax;
  // Check if any zones are actively bleeding (below 50% HP, not fully clotted)
  const bodyMap = p.bodyMap || [];
  const activelyBleeding = bodyMap.some(z =>
    !z.destroyed && z.hp != null && z.maxHp != null &&
    z.hp < z.maxHp * 0.5 && (z.clotting || 0) < 1.0
  );

  if (ratio > 0.75) return activelyBleeding ? { label: 'bleeding', css: 'blood-bleeding' } : null;
  if (ratio > 0.50) return { label: 'weakened', css: 'blood-weakened' };
  if (ratio > 0.25) return { label: 'weakened', css: 'blood-weakened' };
  return { label: 'critical', css: 'blood-critical' };
}

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

    // blood status
    bloodStatus: getBloodStatus(p),

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
//  §4b  MINIMAL HUD  (zone HP bars + blood + food, top-right)
//  Prompt G.3: replaced single HP bar with per-zone bars
// ───────────────────────────────────────────────────────

const _hudEl      = document.getElementById('hud');
const _hudHpBar   = document.getElementById('hud-hp');
const _hudFoodBar = document.getElementById('hud-food');
const _hudHpNum   = document.getElementById('hud-hp-num');
const _hudFoodNum = document.getElementById('hud-food-num');

// Zone key → short label for HUD bars
const _ZONE_ABBREV = {
  head: 'HD', torso: 'TO',
  front_l: 'FL', front_r: 'FR',
  mid_l: 'ML', mid_r: 'MR',
  rear_l: 'RL', rear_r: 'RR',
  // Grazer extra zones
  mid_graze_l: 'GL', mid_graze_r: 'GR',
  mid_loco_l: 'LL', mid_loco_r: 'LR',
  // Exotic body plans
  front_sensory: 'FS', second_limbs: 'SL',
  rear_limbs_a: 'RA', rear_limbs_b: 'RB',
};

// Persistent references for zone bar DOM elements
let _zoneContainer = null;   // wrapper div for all zone + blood bars
let _zoneBars = [];          // array of { key, labelEl, fill, numEl, row } per zone
let _bloodBarEls = null;     // { labelEl, fill, numEl, row } for blood
let _hudInitialized = false;

// Reference element for cloning — the HP bar's row wrapper
let _hpRowTemplate = null;

/**
 * Build a single bar row by cloning the existing HP bar's DOM structure.
 * Returns { row, fill, numEl } — the cloned row, its fill div, and its number span.
 */
function _cloneBarRow() {
  // Find the template row on first call
  if (!_hpRowTemplate) {
    // The HP bar's parent chain: fill (hud-hp) → track → row (.hud-bar-row)
    _hpRowTemplate = _hudHpBar && _hudHpBar.closest('.hud-bar-row');
    if (!_hpRowTemplate) {
      // Fallback: the fill's grandparent is probably the row
      _hpRowTemplate = _hudHpBar && _hudHpBar.parentElement;
    }
  }
  if (!_hpRowTemplate) return null;

  const row = _hpRowTemplate.cloneNode(true);

  // Find the fill bar and number span in the clone BEFORE stripping IDs
  const fill = row.querySelector('.hud-bar-fill');
  const numEl = row.querySelector('[id*="num"]') || row.querySelector('span');

  // Clear IDs from cloned elements so they don't collide
  row.removeAttribute('id');
  const allEls = row.querySelectorAll('[id]');
  allEls.forEach(el => el.removeAttribute('id'));

  return { row, fill, numEl };
}

/**
 * Build the zone + blood bar DOM structure inside the HUD.
 * Called once on first frame with a valid player body map.
 */
function _initZoneHud(player) {
  if (!_hudEl || _hudInitialized) return;

  // Test that we can clone the existing bar structure
  const testClone = _cloneBarRow();
  if (!testClone) return; // can't find template — leave HUD as-is

  // Hide old HP bar row — replaced by zone bars
  const hpRow = _hudHpBar && _hudHpBar.closest('.hud-bar-row');
  if (hpRow) hpRow.style.display = 'none';
  else if (_hudHpBar) _hudHpBar.parentElement.style.display = 'none';
  if (_hudHpNum) _hudHpNum.style.display = 'none';

  // Remove old dynamic blood text element if present
  const oldBlood = document.getElementById('hud-blood');
  if (oldBlood) oldBlood.remove();

  // Create zone container
  _zoneContainer = document.createElement('div');
  _zoneContainer.id = 'hud-zones';

  const bodyMap = player.bodyMap || [];

  // Build zone bar rows by cloning the existing HP bar structure
  _zoneBars = [];
  for (const zone of bodyMap) {
    if (zone.hp == null || zone.maxHp == null) continue;

    const { row, fill, numEl } = _cloneBarRow();

    // Set the label text to the zone abbreviation
    if (numEl) {
      numEl.textContent = _ZONE_ABBREV[zone.key] || zone.key.slice(0, 2).toUpperCase();
    }

    // Start with correct fill state
    if (fill) {
      fill.style.width = '100%';
      fill.className = 'hud-bar-fill hp ok';
    }

    _zoneContainer.appendChild(row);
    _zoneBars.push({ key: zone.key, fill, numEl, row });
  }

  // Blood bar — same structure, labeled BL
  {
    const { row, fill, numEl } = _cloneBarRow();
    if (numEl) numEl.textContent = 'BL';
    if (fill) {
      fill.style.width = '100%';
      fill.className = 'hud-bar-fill hp ok';
    }
    _zoneContainer.appendChild(row);
    _bloodBarEls = { fill, numEl, row };
  }

  // Insert zone container at top of HUD (before existing children)
  _hudEl.insertBefore(_zoneContainer, _hudEl.firstChild);

  _hudInitialized = true;
}

/**
 * Tear down zone bar DOM elements so they can be rebuilt for a new body plan.
 */
function _resetZoneHud() {
  if (_zoneContainer && _zoneContainer.parentElement) {
    _zoneContainer.remove();
  }
  _zoneContainer = null;
  _zoneBars = [];
  _bloodBarEls = null;
  _hudInitialized = false;
}

function updateHud(d) {
  if (!_hudEl) return;
  if (!d || state.gameState !== 'play') { _hudEl.classList.remove('show'); return; }

  _hudEl.classList.add('show');

  const p = state.player;

  // Initialize zone bars on first valid frame
  if (!_hudInitialized && p && p.bodyMap && p.bodyMap.length > 0) {
    _initZoneHud(p);
  }

  // If body map changed (e.g. species change), rebuild
  if (_hudInitialized && p && p.bodyMap) {
    const mapKeys = p.bodyMap.filter(z => z.hp != null).map(z => z.key).join(',');
    const barKeys = _zoneBars.map(b => b.key).join(',');
    if (mapKeys !== barKeys) {
      _resetZoneHud();
      _initZoneHud(p);
    }
  }

  // Update zone bars — using the same className pattern as the old HP bar
  if (p && p.bodyMap) {
    for (const bar of _zoneBars) {
      const zone = p.bodyMap.find(z => z.key === bar.key);
      if (!zone || !bar.fill) continue;

      if (zone.destroyed) {
        bar.fill.style.width = '0%';
        bar.fill.className = 'hud-bar-fill hp';
        bar.row.style.opacity = '0.35';
      } else {
        const pct = zone.maxHp > 0
          ? Math.max(0, Math.min(100, (zone.hp / zone.maxHp) * 100))
          : 0;
        bar.fill.style.width = pct + '%';
        // Same two-state color logic as the original HP bar:
        // 'ok' when above 50%, default (no 'ok') when at or below 50%
        bar.fill.className = 'hud-bar-fill hp' + (pct > 50 ? ' ok' : '');
        bar.row.style.opacity = '1';
      }
    }
  }

  // Update blood bar — same visual treatment as zone bars
  if (_bloodBarEls && _bloodBarEls.fill && p && p.blood != null && p.bloodMax > 0) {
    const bloodPct = Math.max(0, Math.min(100, (p.blood / p.bloodMax) * 100));
    _bloodBarEls.fill.style.width = bloodPct + '%';
    _bloodBarEls.fill.className = 'hud-bar-fill hp' + (bloodPct > 50 ? ' ok' : '');
  }

  // Food bar — kept as-is
  const fedPct = Math.max(0, Math.min(100, d.fedPct));
  _hudFoodBar.style.width = fedPct + '%';
  _hudFoodBar.className = 'hud-bar-fill food' + (d.fedWarn ? ' warn' : '');
  _hudFoodNum.textContent = Math.round(state.player.fed) + '%';
}

function hideHud() {
  if (_hudEl) _hudEl.classList.remove('show');
  // Reset zone bars so they rebuild fresh on next show
  _resetZoneHud();
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
//  §6b  ZONE HP + ATTACK LIST BUILDERS (Prompt G)
// ───────────────────────────────────────────────────────

/** Format a zone key for display: underscores→hyphens, capitalize first letter. */
function formatZoneKey(key) {
  return key.replace(/_/g, '-').replace(/^./, c => c.toUpperCase());
}

/** Build a 10-char HP bar string: ████████░░ */
function hpBar(current, max) {
  const BAR_LEN = 10;
  const filled = max > 0 ? Math.round((current / max) * BAR_LEN) : 0;
  return '█'.repeat(filled) + '░'.repeat(BAR_LEN - filled);
}

/** CSS color class for a zone based on HP ratio. */
function zoneColorClass(zone) {
  if (zone.destroyed) return 'zone-destroyed';
  if (zone.maxHp <= 0) return '';
  const ratio = zone.hp / zone.maxHp;
  if (ratio < 0.25) return 'zone-critical';
  if (ratio < 0.75) return 'zone-wounded';
  return '';
}

/**
 * Build HTML for the player's body map zone HP readout.
 * Shows each zone with an HP bar, numeric HP, and status flags.
 */
function buildZoneHPHTML(player) {
  const bodyMap = player.bodyMap;
  if (!bodyMap || bodyMap.length === 0) return '';

  let html = '<div class="ov-section">BODY MAP</div>';
  html += '<div class="zone-hp-list">';

  for (const zone of bodyMap) {
    if (zone.hp == null || zone.maxHp == null) continue;

    const label = formatZoneKey(zone.key);
    const bar = hpBar(zone.hp, zone.maxHp);
    const colorCls = zoneColorClass(zone);

    // Status flags
    let flags = '';
    if (zone.destroyed) {
      flags = '<span class="zone-flag zone-flag-destroyed">DESTROYED</span>';
    } else if (zone.hp < zone.maxHp * 0.5 && (zone.clotting || 0) < 1.0) {
      flags = '<span class="zone-flag zone-flag-bleeding">BLEEDING</span>';
    }

    html += `<div class="zone-hp-row ${colorCls}">`;
    html += `<span class="zone-name">${label}</span>`;
    html += `<span class="zone-bar">${bar}</span>`;
    html += `<span class="zone-nums">${zone.hp}/${zone.maxHp} HP</span>`;
    if (flags) html += flags;
    html += `</div>`;
  }

  html += '</div>';

  // Blood status line — qualitative + numeric (numeric for dev testing)
  if (player.blood != null && player.bloodMax > 0) {
    const ratio = player.blood / player.bloodMax;
    let label = 'stable';
    let bloodCls = '';
    if (ratio <= 0.25)      { label = 'critical';  bloodCls = 'zone-critical'; }
    else if (ratio <= 0.50) { label = 'weakened';   bloodCls = 'zone-wounded'; }
    else if (ratio <= 0.75) { label = 'bleeding';   bloodCls = 'zone-wounded'; }

    html += `<div class="zone-blood-line ${bloodCls}">`;
    html += `Blood: ${label}`;
    html += `<span class="zone-blood-nums">${player.blood.toFixed(2)} / ${player.bloodMax.toFixed(2)} kg</span>`;
    html += `</div>`;
  }

  return html;
}

/**
 * Build HTML for the player's available attacks list.
 * Shows attack name, source zone, damage type, and computed damage.
 */
function buildAttackListHTML(player) {
  const bodyMap = player.bodyMap;
  if (!bodyMap || bodyMap.length === 0) return '';

  const attacks = getAvailableAttacks(bodyMap);
  // Also collect destroyed-zone attacks to show them grayed out
  const destroyedAttacks = [];
  for (const zone of bodyMap) {
    if (zone.destroyed && zone.attacks) {
      for (const atk of zone.attacks) {
        destroyedAttacks.push({ ...atk, sourceZone: zone.key, _destroyed: true });
      }
    }
  }

  if (attacks.length === 0 && destroyedAttacks.length === 0) return '';

  let html = '<div class="ov-section">ATTACKS</div>';
  html += '<div class="attack-list">';

  for (const atk of attacks) {
    const zone = bodyMap.find(z => z.key === atk.sourceZone);
    const dmg = computeStrikeDamage(player, zone);
    const zoneName = formatZoneKey(atk.sourceZone);
    html += `<div class="attack-row">`;
    html += `<span class="atk-name">${atk.name}</span>`;
    html += `<span class="atk-zone">(${zoneName})</span>`;
    html += `<span class="atk-type">— ${atk.damageType}</span>`;
    html += `<span class="atk-dmg">${dmg} dmg</span>`;
    html += `</div>`;
  }

  for (const atk of destroyedAttacks) {
    const zoneName = formatZoneKey(atk.sourceZone);
    html += `<div class="attack-row zone-destroyed">`;
    html += `<span class="atk-name">${atk.name}</span>`;
    html += `<span class="atk-zone">(${zoneName})</span>`;
    html += `<span class="atk-type">— DESTROYED</span>`;
    html += `</div>`;
  }

  html += '</div>';
  return html;
}

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

  // Species identity (Prompt F)
  if (p.species && p.displayName) {
    const massLabel = p.totalMass ? ` — ${Math.round(p.totalMass)} kg` : '';
    html += `<div class="ov-section" style="color:var(--accent);">${p.displayName.toUpperCase()}${massLabel}</div>`;
  }

  // Prompt G: Zone HP display — prominent, top-of-screen
  html += buildZoneHPHTML(p);

  // Prompt G: Attack list
  html += buildAttackListHTML(p);

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

  // Blood status — qualitative, not numeric
  if (p.blood != null && p.bloodMax > 0) {
    const ratio = p.blood / p.bloodMax;
    let label = 'stable';
    if (ratio <= 0.25) label = 'critical';
    else if (ratio <= 0.50) label = 'weakened';
    else if (ratio <= 0.75) {
      // Check if actively bleeding
      const bm = p.bodyMap || [];
      const activelyBleeding = bm.some(z =>
        !z.destroyed && z.hp != null && z.maxHp != null &&
        z.hp < z.maxHp * 0.5 && (z.clotting || 0) < 1.0
      );
      label = activelyBleeding ? 'bleeding' : 'stable';
    }
    if (label !== 'stable') {
      html += `<div class="ov-section">CONDITION</div>`;
      html += `<div class="ov-row"><span class="ov-k">Blood</span><span class="ov-v">${label}</span></div>`;
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
  let html = '';

  // ─── Prompt G: Facing direction (always shown for enemies) ───
  if (!fullDetail && target.facing) {
    const facingLabel = facingToLabel(target.facing);
    html += `<div class="ov-row"><span class="ov-k">Facing</span><span class="ov-v">${facingLabel}</span></div>`;
  }

  // ─── Prompt G: Wound/destruction readout for enemies ───
  if (!fullDetail && target.bodyMap) {
    const destroyed = [];
    const wounded = [];
    for (const zone of target.bodyMap) {
      if (zone.hp == null || zone.maxHp == null) continue;
      if (zone.destroyed) {
        destroyed.push(zone.name);
      } else if (zone.hp < zone.maxHp * 0.75) {
        wounded.push(zone.name);
      }
    }
    if (destroyed.length > 0) {
      html += `<div class="ov-row"><span class="ov-k">Destroyed</span><span class="ov-v zone-destroyed">${destroyed.join(', ')}</span></div>`;
    }
    if (wounded.length > 0) {
      html += `<div class="ov-row"><span class="ov-k">Wounded</span><span class="ov-v zone-wounded">${wounded.join(', ')}</span></div>`;
    }

    // Blood status — qualitative only for enemies
    if (target.blood != null && target.bloodMax > 0) {
      const ratio = target.blood / target.bloodMax;
      if (ratio < 0.75) {
        let label = 'bleeding';
        if (ratio <= 0.25) label = 'near collapse';
        else if (ratio <= 0.50) label = 'bleeding heavily';
        html += `<div class="ov-row"><span class="ov-k">Blood</span><span class="ov-v">${label}</span></div>`;
      }
    }
  }

  if (!fullDetail) {
    if (playerCentral < 4) return html;  // too low to perceive stat details
  }

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

  // Blood status — gated by player Central for examined enemies
  // Prompt G: skip for enemies with bodyMap since wound readout already shows blood
  if (target.blood != null && target.bloodMax > 0) {
    const ratio = target.blood / target.bloodMax;
    if (fullDetail) {
      // Self-examine: always show qualitative status
      let label = 'stable';
      if (ratio <= 0.25) label = 'critical';
      else if (ratio <= 0.50) label = 'weakened';
      else if (ratio <= 0.75) label = 'bleeding';
      if (label !== 'stable') {
        html += `<div class="ov-section">CONDITION</div>`;
        html += `<div class="ov-row"><span class="ov-k">Blood</span><span class="ov-v">${label}</span></div>`;
      }
    } else if (!target.bodyMap && showProc && ratio < 0.75) {
      // Tier 3 player examining enemy without bodyMap: show blood status
      let label = 'bleeding';
      if (ratio <= 0.25) label = 'weakened from blood loss';
      else if (ratio <= 0.50) label = 'bleeding heavily';
      html += `<div class="ov-section">CONDITION</div>`;
      html += `<div class="ov-row"><span class="ov-k">Blood</span><span class="ov-v">${label}</span></div>`;
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
  buildZoneHPHTML,
  buildAttackListHTML,
  interactable,
  adjacentFeature,
  effectLabel,
  getRegionName,
  monsterAt,
  chebyshev,
  hideHud,
};
