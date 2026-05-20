// ==================== OVERLAY PANELS ====================
// Full-screen keyboard-driven panels: S(tatus), C(haracter), I(nventory), E(quipment).
// Only one overlay open at a time. ESC or the same key closes it.

import { state } from './state.js';
import {
  INV_SLOTS, carryCapacity, totalWeight,
  playerMelee, playerDef, playerAcc, playerDodge,
  playerCritChance, playerCritMult, passiveRegenInterval,
  poisonResistance, describeAttributePerks,
} from './player.js';
import { DMG } from './constants.js';
import { FOOD, POTIONS, BOOKS, findWeapon, findArmor } from './items.js';
import {
  computeUIData,
  buildPerksHTML,
  buildEffectsHTML,
} from './ui.js';

// ───────────────────────────────────────────────────────
//  DOM REFERENCES
// ───────────────────────────────────────────────────────

const overlayEl    = document.getElementById('game-overlay');
const overlayBody  = document.getElementById('overlay-body');

// ───────────────────────────────────────────────────────
//  STATE
// ───────────────────────────────────────────────────────

let _activePanel = null;   // 'status' | 'character' | 'inventory' | 'equipment' | null

export function isOverlayOpen() { return _activePanel !== null; }
export function activePanel()   { return _activePanel; }

// ───────────────────────────────────────────────────────
//  OPEN / CLOSE
// ───────────────────────────────────────────────────────

function openOverlay(panelKey, renderFn) {
  _activePanel = panelKey;
  overlayBody.innerHTML = '';
  renderFn(overlayBody);
  overlayEl.classList.add('show');
}

export function closeOverlay() {
  _activePanel = null;
  overlayEl.classList.remove('show');
  overlayBody.innerHTML = '';
}

/** Toggle a specific panel — if it's already open, close it. */
export function togglePanel(key) {
  if (_activePanel === key) { closeOverlay(); return; }
  // Close any other panel first
  if (_activePanel) closeOverlay();

  const renderers = {
    status:    renderStatus,
    character: renderCharacter,
    inventory: renderInventory,
    equipment: renderEquipment,
  };
  const fn = renderers[key];
  if (fn) openOverlay(key, fn);
}

// ───────────────────────────────────────────────────────
//  HELPERS
// ───────────────────────────────────────────────────────

function row(label, value, cls) {
  return `<div class="ov-row"><span class="ov-k">${label}</span><span class="ov-v${cls ? ' ' + cls : ''}">${value}</span></div>`;
}

function bar(pct, color) {
  return `<div class="ov-bar"><div class="ov-bar-fill" style="width:${Math.max(0, Math.min(100, pct))}%;background:${color};"></div></div>`;
}

function sectionHead(title) {
  return `<div class="ov-section">${title}</div>`;
}

function hint(text) {
  return `<div class="ov-hint">${text}</div>`;
}

// Pretty name for body types
const BODY_LABELS = { meso: 'Mesomorph', apex: 'Apex', grazer: 'Grazer' };

// Pretty name for color palettes
function paletteName(key) {
  if (!key) return '???';
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ───────────────────────────────────────────────────────
//  PANEL: STATUS  (S)
// ───────────────────────────────────────────────────────

function renderStatus(container) {
  const p = state.player;
  if (!p) return;
  const d = computeUIData();
  if (!d) return;

  const fedColor = p.fed > 40 ? '#7a9a5a' : (p.fed > 15 ? '#d4a050' : '#c86a5a');
  const hpColor  = d.hpPct > 50 ? '#7a9a5a' : (d.hpPct > 25 ? '#d4a050' : '#c86a5a');

  let html = `<div class="ov-title">STATUS</div>`;
  html += row('Body', BODY_LABELS[p.bodyType] || p.bodyType);
  html += row('Palette', paletteName(p.colorPalette));
  html += sectionHead('VITALS');
  html += row('HP', d.hpText);
  html += bar(d.hpPct, hpColor);
  html += row('Food', `${Math.round(p.fed)}% · ${d.fedLabel}`, d.fedWarn ? 'warn' : '');
  html += bar(d.fedPct, fedColor);
  html += sectionHead('PROGRESS');
  html += row('Level', d.level);
  html += row('XP', d.xpText);
  html += bar(d.xpPct, '#6a7a9a');
  html += row('Gold', d.gold, 'accent');
  html += row('Region', d.regionName);
  html += row('Layer', d.layerLabel);

  // Active effects
  const effHtml = buildEffectsHTML(p);
  html += sectionHead('EFFECTS');
  html += `<div class="ov-block">${effHtml}</div>`;

  html += hint('[S] or [ESC] to close');
  container.innerHTML = html;
}

// ───────────────────────────────────────────────────────
//  PANEL: CHARACTER  (C)
// ───────────────────────────────────────────────────────

function renderCharacter(container) {
  const p = state.player;
  if (!p) return;
  const d = computeUIData();
  if (!d) return;

  let html = `<div class="ov-title">CHARACTER</div>`;
  html += sectionHead('ATTRIBUTES');
  html += row('STR', p.str);
  html += row('CON', p.con);
  html += row('DEX', p.dex);
  html += row('INT', p.int);
  html += row('PER', p.per);

  html += sectionHead('COMBAT');
  html += row('Melee', d.atkText);
  html += row('Defense', d.defVal);
  html += row('Accuracy', d.accVal + '%');
  html += row('Dodge', d.dodgeText + d.dexSuffix);
  html += row('Crit Chance', d.critChanceText);
  html += row('Crit Damage', d.critDmgText);

  html += sectionHead('WEIGHT');
  html += row('Slots', `${p.inventory.length} / ${INV_SLOTS}`);
  const tw = totalWeight(p), cap = carryCapacity(p);
  html += row('Weight', `${tw} / ${cap}`, tw > cap ? 'warn' : '');

  // Perks
  const perksHtml = buildPerksHTML(p);
  html += sectionHead('PERKS');
  html += `<div class="ov-block">${perksHtml}</div>`;

  html += hint('[C] or [ESC] to close');
  container.innerHTML = html;
}

// ───────────────────────────────────────────────────────
//  PANEL: INVENTORY  (I)
// ───────────────────────────────────────────────────────

function renderInventory(container) {
  const p = state.player;
  if (!p) return;

  const tw = totalWeight(p), cap = carryCapacity(p);
  let html = `<div class="ov-title">INVENTORY</div>`;
  html += `<div class="ov-inv-header">`;
  html += `<span>GOLD <b class="accent">${p.gold}</b></span>`;
  html += `<span>SLOTS <b>${p.inventory.length}/${INV_SLOTS}</b></span>`;
  html += `<span class="${tw > cap ? 'warn' : ''}">WT <b>${tw}/${cap}</b></span>`;
  html += `</div>`;

  if (p.inventory.length === 0) {
    html += `<div class="ov-empty">Empty.</div>`;
  } else {
    html += `<div class="ov-item-list">`;
    p.inventory.forEach((it, idx) => {
      html += buildOverlayItemRow(it, idx, p);
    });
    html += `</div>`;
  }

  html += hint('[I] or [ESC] to close');
  container.innerHTML = html;

  // Wire up item action buttons inside the overlay
  container.addEventListener('click', handleInventoryClick);
}

function buildOverlayItemRow(it, idx, player) {
  switch (it.kind) {
    case 'food':   return ovFoodRow(it, idx);
    case 'potion': return ovPotionRow(it, idx);
    case 'book':   return ovBookRow(it, idx, player);
    case 'weapon': return ovWeaponRow(it, idx, player);
    case 'armor':  return ovArmorRow(it, idx, player);
    case 'corpse': return ovCorpseRow(it, idx);
    default:       return '';
  }
}

function ovFoodRow(it, idx) {
  const f = FOOD[it.key];
  return `<div class="ov-item-row">
    <span class="ov-iname">${f.name} <span class="ov-itag accent">+${f.fed} FED</span> <span class="ov-iwt">wt ${it.weight || 1}</span></span>
    <span class="ov-item-actions"><button data-eat="${idx}">[EAT]</button> <button data-drop="${idx}">[DROP]</button></span>
  </div>`;
}

function ovPotionRow(it, idx) {
  const p = POTIONS[it.key];
  const desc = p.heal ? '+' + p.heal + ' HP' : 'cures';
  return `<div class="ov-item-row">
    <span class="ov-iname">${p.name} <span class="ov-itag accent">${desc}</span> <span class="ov-iwt">wt ${it.weight || 1}</span></span>
    <span class="ov-item-actions"><button data-potion="${idx}">[USE]</button> <button data-drop="${idx}">[DROP]</button></span>
  </div>`;
}

function ovBookRow(it, idx, player) {
  const b = BOOKS[it.key];
  const canRead = player.int >= b.intReq;
  return `<div class="ov-item-row">
    <span class="ov-iname">${b.name} <span class="ov-itag book">INT ${b.intReq}+</span> <span class="ov-iwt">wt ${it.weight || 1}</span></span>
    <span class="ov-item-actions"><button data-book="${idx}" ${canRead ? '' : 'disabled'}>[READ]</button> <button data-drop="${idx}">[DROP]</button></span>
  </div>`;
}

function ovWeaponRow(it, idx, player) {
  const w = findWeapon(it.key);
  const equipped = player.weapon.key === it.key;
  const elemTag = w.elem ? '+' + w.elem : '';
  return `<div class="ov-item-row">
    <span class="ov-iname">${w.name} <span class="ov-itag">[${w.type}${elemTag}]</span> ${equipped ? '<span class="ov-ieq">EQUIPPED</span>' : ''} <span class="ov-iwt">wt ${it.weight || 2}</span></span>
    <span class="ov-item-actions"><button data-equip-w="${idx}" ${equipped ? 'disabled' : ''}>[EQUIP]</button> <button data-drop="${idx}">[DROP]</button></span>
  </div>`;
}

function ovArmorRow(it, idx, player) {
  const a = findArmor(it.key);
  const equipped = player.armor.key === it.key;
  return `<div class="ov-item-row">
    <span class="ov-iname">${a.name} <span class="ov-itag">DEF+${a.def}</span> ${equipped ? '<span class="ov-ieq">WORN</span>' : ''} <span class="ov-iwt">wt ${it.weight || 3}</span></span>
    <span class="ov-item-actions"><button data-equip-a="${idx}" ${equipped ? 'disabled' : ''}>[WEAR]</button> <button data-drop="${idx}">[DROP]</button></span>
  </div>`;
}

function ovCorpseRow(it, idx) {
  const nutri = it.nutrition || 0;
  const nutriTag = nutri > 0 ? `<span class="ov-itag accent">+${nutri} FED</span> ` : '';
  return `<div class="ov-item-row">
    <span class="ov-iname">${it.name} <span class="ov-itag dim">[corpse]</span> ${nutriTag}<span class="ov-iwt">wt ${it.weight || 2}</span></span>
    <span class="ov-item-actions">${nutri > 0 ? `<button data-eat-corpse="${idx}">[EAT]</button>` : ''} <button data-drop="${idx}">[DROP]</button></span>
  </div>`;
}

// Inventory click delegation — wired externally via setInventoryActions
let _invActions = {};
export function setInventoryActions(actions) { _invActions = actions; }

function handleInventoryClick(ev) {
  const btn = ev.target.closest('button');
  if (!btn) return;

  const mapping = {
    eat:        'eat',
    drop:       'drop',
    potion:     'potion',
    book:       'book',
    'equip-w':  'equipW',
    'equip-a':  'equipA',
    'eat-corpse': 'eatCorpse',
  };

  for (const [dataKey, actionKey] of Object.entries(mapping)) {
    const raw = btn.dataset[dataKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase())];
    if (raw != null) {
      const idx = parseInt(raw, 10);
      if (Number.isFinite(idx) && _invActions[actionKey]) {
        try {
          _invActions[actionKey](idx);
          // Re-render inventory after action
          if (_activePanel === 'inventory') {
            overlayBody.innerHTML = '';
            renderInventory(overlayBody);
          }
        } catch (err) { console.error(err); }
      }
      return;
    }
  }
}

// ───────────────────────────────────────────────────────
//  PANEL: EQUIPMENT  (E)
// ───────────────────────────────────────────────────────

function renderEquipment(container) {
  const p = state.player;
  if (!p) return;

  let html = `<div class="ov-title">EQUIPMENT</div>`;
  html += sectionHead('EQUIPPED');

  // Weapon
  const elemTag = p.weapon.elem ? '+' + p.weapon.elem : '';
  html += row('WPN', `${p.weapon.name}  [${p.weapon.type}${elemTag}]`);

  // Armor
  const dodgePen = p.armor.dodgePenalty ? ` (-${p.armor.dodgePenalty}% dodge)` : '';
  html += row('ARM', `${p.armor.name}  DEF+${p.armor.def}${dodgePen}`);

  // Placeholder slots
  html += row('HELM', '— empty —', 'dim');
  html += row('BOOTS', '— empty —', 'dim');
  html += row('RING', '— empty —', 'dim');

  html += hint('[E] or [ESC] to close');
  container.innerHTML = html;
}
