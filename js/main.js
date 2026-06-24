// ==================== MAIN ENTRY POINT ====================
// The conductor: wires modules, binds input, runs the state machine.
// NO game logic lives here — only delegation.

import { state, worlds, covers } from './state.js';
import { tileSize, viewW, viewH, cycleZoom, setZoom, zoom, toggleSpritePack, getSpritePack } from './display.js';
// LEGACY POPUP: modal.js still used by ground items, shops, NPC dialogue, books.
// Migrate these features to HUD-native patterns, then remove this import.
import { modalEl, closeModal, openModal, setUpdateUICallback } from './modal.js';
import { updateUI, hideHud, toggleStatusFullMode } from './ui.js';
import { canvas, ctx, resizeCanvas, render } from './rendering.js';

import { attemptMove, restAction, eatBest, eatItem, eatCorpseFromInv, usePotion, dropItem, equipWeaponFromInv, equipArmorFromInv, turnInPlace, lookAtGround, pickUpFromGround, setGroundModalCallbacks, eatAction } from './player-actions.js';
import { terrainName, terrainInfo } from './terrain.js';
import { inBounds, getCover, monsterAt as worldMonsterAt } from './world-state.js';
import { getItems } from './ground-items.js';
import { setOnPlayerDeathCallback, debugEcology, debugForceHunger, debugCognition, debugSubstrate } from './enemy-ai.js';
import { debugScentAt, debugScentStats, performSniff } from './scent.js';
window.debugEcology = debugEcology;
window.debugForceHunger = debugForceHunger;
window.debugCognition = debugCognition;
window.debugSubstrate = debugSubstrate;
window.scentAt = debugScentAt;
window.scentStats = debugScentStats;
import { setOnVictoryCallback, toggleStealth } from './combat.js';
import { useAction, showHelp, readBook } from './interactions.js';
import { log as _rawLog, LOG_CATEGORIES } from './log.js';

// Wrap log() to push the category into the global queue before the DOM
// element is appended. The MutationObserver in index.html reads the queue
// and tags each new <div> with data-category for tab/mute filtering.
function log(text, category) {
  if (window._pendingLogCatQueue) window._pendingLogCatQueue.push(category || 'system');
  _rawLog(text, category);
}
import { openCharGen, renderCharGen, randomizeAttrs, beginGame, onPlayerDeath, onVictory } from './chargen.js';
import { hasSave, tryResume, deleteSave, migrateFromLocalStorage } from './save-load.js';
import { isMapOpen, toggleMap, closeMap, markCurrentCell } from './worldmap.js';
// LEGACY POPUP: overlay.js still used by inventory panel. Migrate to HUD-native.
import { isOverlayOpen, activePanel, togglePanel, closeOverlay, setInventoryActions } from './overlay.js';


// ==================== WIRE CALLBACKS ====================
setUpdateUICallback(updateUI);
setOnPlayerDeathCallback(() => { deleteSave().catch(e => console.error('[Save]', e)); onPlayerDeath(); });
setOnVictoryCallback(() => { deleteSave().catch(e => console.error('[Save]', e)); onVictory(); });
// LEGACY POPUP: ground pickup still uses modal. Migrate to HUD-native.
setGroundModalCallbacks(openModal, closeModal);
setInventoryActions({
  eat:       (i) => eatItem(i),
  drop:      (i) => dropItem(i),
  potion:    (i) => usePotion(i),
  book:      (i) => readBook(i),
  equipW:    (i) => equipWeaponFromInv(i),
  equipA:    (i) => equipArmorFromInv(i),
  eatCorpse: (i) => eatCorpseFromInv(i),
});

// ==================== SAFE DISPATCH ====================
function safeDispatch(fn, ...args) {
  if (state.gameState !== 'play') return;
  if (modalEl.classList.contains('show')) return;
  if (isMapOpen()) return;
  if (isOverlayOpen()) return;
  if (state.inputLocked) return;
  if (state.lookMode) return;
  try {
    fn(...args);
    markCurrentCell();
  } catch (err) {
    console.error('[OverWorld Zero] Action failed:', err);
    state.inputLocked = false;
  }
}

// ==================== COORDINATE HELPERS ====================
function canvasToWorld(ev) {
  const TILE = tileSize();
  const VW = viewW();
  const VH = viewH();
  const rect = canvas.getBoundingClientRect();
  // Scale from CSS pixels to canvas pixels, then to tile coordinates
  const cx = Math.floor((ev.clientX - rect.left) * (canvas.width / rect.width) / TILE);
  const cy = Math.floor((ev.clientY - rect.top) * (canvas.height / rect.height) / TILE);
  return {
    wx: state.player.x - (VW >> 1) + cx,
    wy: state.player.y - (VH >> 1) + cy,
  };
}

// ==================== EARLY DOM REFS ====================
// Must be declared before event handlers that reference them.
const restartConfirmEl = document.getElementById('restart-confirm');

// ==================== INPUT: MOUSE ====================
canvas.addEventListener('click', (ev) => {
  if (state.gameState !== 'play' || modalEl.classList.contains('show')) return;
  if (state.inputLocked) return;
  if (isMapOpen()) return;
  if (isOverlayOpen()) return;
  if (restartConfirmEl.style.display === 'flex') return;
  if (state.lookMode) { exitLookMode(); return; }

  const { wx, wy } = canvasToWorld(ev);

  if (wx === state.player.x && wy === state.player.y) {
    safeDispatch(restAction);
    return;
  }

  const dx = wx - state.player.x;
  const dy = wy - state.player.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);

  if (Math.max(adx, ady) <= 1) {
    safeDispatch(attemptMove, dx, dy);
    return;
  }

  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  if (adx > ady)      safeDispatch(attemptMove, sx, 0);
  else if (ady > adx) safeDispatch(attemptMove, 0, sy);
  else                 safeDispatch(attemptMove, sx, sy);
});

canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (state.gameState !== 'play' || modalEl.classList.contains('show')) return;
  const { wx, wy } = canvasToWorld(ev);
  try {
    inspectTile(wx, wy);
  } catch (err) {
    console.error('[OverWorld Zero] inspectTile failed:', err);
  }
});

// ── UI zoom (HUD/log/labels magnification, independent of world zoom) ──
const UI_ZOOM_LEVELS = [1, 1.5, 2];
let _uiZoomIndex = 0;

function cycleUIZoom(direction) {
  const next = _uiZoomIndex + direction;
  if (next < 0 || next >= UI_ZOOM_LEVELS.length) return;
  _uiZoomIndex = next;
  document.documentElement.style.setProperty('--ui-zoom', UI_ZOOM_LEVELS[_uiZoomIndex]);
}

// ── Zoom label updater ──
function updateZoomLabel() {
  const label = document.getElementById('zoom-label');
  if (label) {
    label.textContent = '×' + zoom();
    label.classList.add('flash');
    clearTimeout(label._fadeTimer);
    label._fadeTimer = setTimeout(() => label.classList.remove('flash'), 800);
  }
}

// ── Zoom controls ──
canvas.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  // Scroll up = zoom in (larger tiles), scroll down = zoom out (smaller tiles)
  const direction = ev.deltaY < 0 ? 1 : -1;
  if (cycleZoom(direction)) {
    resizeCanvas();
    if (state.gameState === 'play') render();
    updateZoomLabel();
  }
}, { passive: false });

// ==================== LOG TOGGLE (TAB key) ====================
function toggleLog() {
  const w = document.getElementById('log-wrapper');
  if (w) w.classList.toggle('minimized');
}

// ==================== INPUT: KEYBOARD ====================

// ── Direction map: every key that selects a direction ──
// Used for movement, shift+turn, and look mode.
const DIR_MAP = {
  // Left-hand QWEASDZXC (8-directional)
  'q': [-1, -1], 'w': [0, -1], 'e': [1, -1],
  'a': [-1,  0],                'd': [1,  0],
  'z': [-1,  1], 'x': [0,  1], 'c': [1,  1],
  // Arrow keys (4 cardinal)
  'arrowup': [0, -1], 'arrowdown': [0, 1],
  'arrowleft': [-1, 0], 'arrowright': [1, 0],
  // Numpad (8-directional)
  '7': [-1, -1], '8': [0, -1], '9': [1, -1],
  '4': [-1,  0],               '6': [1,  0],
  '1': [-1,  1], '2': [0,  1], '3': [1,  1],
  // Legacy numpad names
  'home': [-1, -1], 'pageup': [1, -1],
  'end': [-1,  1],  'pagedown': [1,  1],
};

// Keys that mean "self / wait / center" (for look mode: look at own tile)
const SELF_KEYS = new Set(['s', '5', 'clear', ' ']);

// ── Action keys (non-movement) ──
const ACTION_MAP = {
  'r': () => eatAction(),          // Eat (ground corpses first, then inventory)
  'f': () => toggleStealth(),      // Sneak toggle
  'g': () => pickUpFromGround(),   // Get/pickup
  'v': () => performSniff(),       // Sniff — deliberate chemical readout (free, no turn)
  '?': () => showHelp(),           // Help
  '/': () => showHelp(),
};

// ── Look mode helpers ──
function enterLookMode() {
  state.lookMode = true;
  log('Look where?', LOG_CATEGORIES.SYSTEM);
  updateUI();
}
function exitLookMode() {
  state.lookMode = false;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function articleFor(name) {
  return /^[aeiou]/i.test(name) ? 'An' : 'A';
}

/** Log-only tile inspection — never opens a panel or modal. */
function lookAtTile(tx, ty) {
  const layer = state.player.layer;
  if (!inBounds(layer, tx, ty)) {
    log('Nothing but void.', LOG_CATEGORIES.INTERACTION);
    return;
  }

  const ground = worlds[layer]?.[ty]?.[tx];
  const parts = [];

  // 1. Ground type
  const gName = terrainName(ground) || 'unknown';
  parts.push(capitalize(gName) + ' tile.');

  // 2. Cover
  const cover = getCover(layer, tx, ty);
  if (cover) {
    const cName = (cover.name || cover.type || 'obstacle').replace(/_/g, '-');
    parts.push(`${articleFor(cName)} ${cName} grows here.`);
  }

  // 3. Ground items
  const items = getItems(layer, tx, ty);
  for (const it of items) {
    parts.push(`${articleFor(it.name)} ${it.name} lies on the ground.`);
  }

  // 4. Creature
  const mon = worldMonsterAt(tx, ty, layer);
  if (mon) {
    parts.push(`${articleFor(mon.name)} ${mon.name} is here.`);
  }

  // 5. If own tile and nothing notable
  const isSelf = tx === state.player.x && ty === state.player.y;
  if (!cover && items.length === 0 && !mon && isSelf) {
    parts.push('Nothing else here.');
  }

  log(parts.join(' '), LOG_CATEGORIES.INTERACTION);
}

// ==================== RIGHT-CLICK TILE INSPECTION → LOG ====================
// Replaces the old popup/overlay examineTile. Pushes terse log entries
// based on the player's current visibility of the tile.

/** Right-click tile inspection — log-only, visibility gated. */
function inspectTile(tx, ty) {
  const layer = state.player.layer;

  // Out-of-bounds: nothing to see
  if (!inBounds(layer, tx, ty)) {
    log("You can't see that area.", LOG_CATEGORIES.INTERACTION);
    return;
  }

  const tileKey = `${tx},${ty}`;

  // Determine visibility tier
  const inBinocular = state.fovSet && state.fovSet.has(tileKey);
  const inMonocular = !inBinocular && state.monocularSet && state.monocularSet.has(tileKey);
  const inExplored  = !inBinocular && !inMonocular && state.explored[layer] && state.explored[layer].has(tileKey);
  // If FOV hasn't been computed yet (first frame), treat as visible
  const fovActive = state.fovSet !== null;

  // ── Unexplored / not visible ──
  if (fovActive && !inBinocular && !inMonocular && !inExplored) {
    log("You can't see that area.", LOG_CATEGORIES.INTERACTION);
    return;
  }

  // ── Explored but not currently visible (memory only) ──
  if (fovActive && inExplored) {
    const ground = worlds[layer]?.[ty]?.[tx];
    const coverType = covers[layer]?.[ty]?.[tx] || 0;
    const gName = coverType ? terrainInfo(coverType).name : terrainInfo(ground).name;
    log(`You recall ${gName} there.`, LOG_CATEGORIES.INTERACTION);
    return;
  }

  // ── Currently visible (binocular or monocular) ──
  const ground = worlds[layer]?.[ty]?.[tx];
  const coverType = covers[layer]?.[ty]?.[tx] || 0;
  const parts = [];

  // 1. Terrain type
  const gName = coverType ? terrainInfo(coverType).name : terrainInfo(ground).name;
  parts.push(capitalize(gName) + '.');

  // 2. Cover / features (non-terrain cover objects)
  const cover = getCover(layer, tx, ty);
  if (cover && !coverType) {
    const cName = (cover.name || cover.type || 'obstacle').replace(/_/g, ' ');
    parts.push(capitalize(cName) + '.');
  }

  // 3. Ground items (only if currently visible)
  const items = getItems(layer, tx, ty);
  for (const it of items) {
    if (inMonocular) {
      // Monocular: vague item descriptions
      parts.push('Something on the ground.');
      break;  // only mention once
    } else {
      parts.push(`${articleFor(it.name)} ${it.name}.`);
    }
  }

  // 4. Creatures
  const mon = worldMonsterAt(tx, ty, layer);
  if (mon) {
    if (inBinocular || !fovActive) {
      // Binocular: clear identification
      parts.push(`${articleFor(mon.name)} ${mon.name} is here.`);
    } else if (inMonocular) {
      // Monocular: less certain description
      parts.push('A shape moves here.');
    }
  }

  // 5. Self tile
  const isSelf = tx === state.player.x && ty === state.player.y;
  if (isSelf && !cover && !coverType && items.length === 0 && !mon) {
    parts.push('Nothing else here.');
  }

  log(parts.join(' '), LOG_CATEGORIES.INTERACTION);
}

function handleLookDirection(dx, dy) {
  exitLookMode();
  const tx = state.player.x + dx;
  const ty = state.player.y + dy;
  lookAtTile(tx, ty);
}
function handleLookSelf() {
  exitLookMode();
  lookAtTile(state.player.x, state.player.y);
}

document.addEventListener('keydown', (ev) => {
  // Modal escape
  if (modalEl.classList.contains('show')) {
    if (ev.key === 'Escape') { closeModal(); ev.preventDefault(); }
    return;
  }

  // Restart confirm escape
  if (restartConfirmEl.style.display === 'flex') {
    if (ev.key === 'Escape' || ev.key.toLowerCase() === 'n') {
      hideRestartConfirm();
      ev.preventDefault();
    }
    return;
  }

  if (state.gameState !== 'play') return;

  // ── Look mode: waiting for a direction ──
  if (state.lookMode) {
    ev.preventDefault();
    const kLow = ev.key.toLowerCase();
    if (ev.key === 'Escape') { exitLookMode(); log('Cancelled.', LOG_CATEGORIES.SYSTEM); return; }
    const dir = DIR_MAP[kLow];
    if (dir) { handleLookDirection(dir[0], dir[1]); return; }
    if (SELF_KEYS.has(kLow)) { handleLookSelf(); return; }
    // Unknown key while in look mode — ignore
    return;
  }

  // ── Overlay panel handling (inventory only) ──
  // LEGACY POPUP: inventory still uses overlay. Migrate to HUD-native pattern.
  const PANEL_KEYS = { i: 'inventory' };
  const kLow = ev.key.toLowerCase();

  if (isOverlayOpen()) {
    if (ev.key === 'Escape') { closeOverlay(); ev.preventDefault(); return; }
    if (PANEL_KEYS[kLow]) { ev.preventDefault(); togglePanel(PANEL_KEYS[kLow]); return; }
    ev.preventDefault();
    return;
  }

  // T key: toggle HUD bar display mode (minimal ↔ full)
  if (kLow === 't' && !ev.shiftKey && !isMapOpen()) {
    ev.preventDefault();
    toggleStatusFullMode();
    updateUI();
    return;
  }

  // No overlay open — intercept inventory key before movement
  if (PANEL_KEYS[kLow] && !ev.shiftKey && !isMapOpen()) {
    ev.preventDefault();
    togglePanel(PANEL_KEYS[kLow]);
    return;
  }

  // TAB key: toggle log visibility
  if (ev.key === 'Tab') {
    ev.preventDefault();
    toggleLog();
    return;
  }

  // World map overlay: M toggles, Escape closes, all else blocked while open
  if (kLow === 'm') {
    ev.preventDefault();
    toggleMap();
    return;
  }
  if (isMapOpen()) {
    if (ev.key === 'Escape') { closeMap(); ev.preventDefault(); }
    return;
  }

  // Zoom
  if (ev.key === '=' || ev.key === '+') {
    ev.preventDefault();
    if (cycleZoom(1)) { resizeCanvas(); render(); updateZoomLabel(); }
    return;
  }
  if (ev.key === '-') {
    ev.preventDefault();
    if (cycleZoom(-1)) { resizeCanvas(); render(); updateZoomLabel(); }
    return;
  }

  // UI zoom (scales HUD, log, labels) — [ decrease, ] increase
  if (ev.key === ']') { ev.preventDefault(); cycleUIZoom(1); return; }
  if (ev.key === '[') { ev.preventDefault(); cycleUIZoom(-1); return; }

  // P key: toggle sprite pack (16px ↔ 32px)
  if (kLow === 'p' && !ev.shiftKey) {
    ev.preventDefault();
    const pack = toggleSpritePack();
    render();
    log('Sprite pack: ' + pack + 'px', LOG_CATEGORIES.SYSTEM);
    return;
  }

  // L key: enter look mode
  if (kLow === 'l') {
    ev.preventDefault();
    enterLookMode();
    return;
  }

  // Shift+direction: turn in place without moving
  if (ev.shiftKey) {
    const dir = DIR_MAP[kLow];
    if (dir) {
      ev.preventDefault();
      safeDispatch(turnInPlace, dir[0], dir[1]);
      return;
    }
  }

  // Wait/rest: S, Space, numpad 5, Clear
  if (SELF_KEYS.has(kLow)) {
    ev.preventDefault();
    safeDispatch(restAction);
    return;
  }

  // Movement (direction keys)
  const dir = DIR_MAP[kLow];
  if (dir) {
    ev.preventDefault();
    safeDispatch(attemptMove, dir[0], dir[1]);
    return;
  }

  // Action keys
  const action = ACTION_MAP[kLow];
  if (action) {
    ev.preventDefault();
    safeDispatch(action);
  }
});

// ==================== INVENTORY DELEGATION ====================
// LEGACY POPUP: inventory buttons still appear inside modals (ground loot,
// shops). Migrate these to HUD-native patterns then remove this listener.
const INV_ACTIONS = {
  eat:        (i) => eatItem(i),
  drop:       (i) => dropItem(i),
  potion:     (i) => usePotion(i),
  book:       (i) => readBook(i),
  equipW:     (i) => equipWeaponFromInv(i),
  equipA:     (i) => equipArmorFromInv(i),
  eatCorpse:  (i) => eatCorpseFromInv(i),
};

document.getElementById('modal-inner').addEventListener('click', (ev) => {
  for (const [key, fn] of Object.entries(INV_ACTIONS)) {
    const raw = ev.target.dataset[key];
    if (raw != null) {
      const idx = parseInt(raw, 10);
      if (Number.isFinite(idx)) {
        try { fn(idx); } catch (err) { console.error(err); }
      }
      return;
    }
  }
});

// ==================== CHARGEN CONTROLS ====================
// Prompt F: old stat-allocation buttons (cg-random, cg-reset, cg-begin) removed.
// Species selection wiring is handled inside chargen.js openCharGen().
// Guard legacy elements in case old HTML is still cached.
const _cgRandom = document.getElementById('cg-random');
const _cgReset  = document.getElementById('cg-reset');
const _cgBegin  = document.getElementById('cg-begin');
if (_cgRandom) _cgRandom.addEventListener('click', randomizeAttrs);
if (_cgReset) _cgReset.addEventListener('click', () => {
  state.cgAttrs = { siz: 1, strength: 1, chem: 1, vib: 1, vis: 1, central: 1, distributed: 1 };
  renderCharGen();
});
if (_cgBegin) _cgBegin.addEventListener('click', beginGame);

// ==================== STATE MACHINE TRANSITIONS ====================
function showScreen(id) {
  for (const s of ['title', 'death', 'victory']) {
    document.getElementById(s).style.display = s === id ? 'flex' : 'none';
  }
  state.gameState = id === 'title' ? 'title' : state.gameState;
  if (id === 'title') { updateTitleButtons().catch(e => console.error(e)); hideHud(); }
  if (id === 'death' || id === 'victory') hideHud();
}

// ---- Save-aware title screen ----
const titleEl = document.getElementById('title');
const titleContinueBtn = document.getElementById('title-continue');
const titleNewGameBtn  = document.getElementById('title-newgame');

async function updateTitleButtons() {
  if (await hasSave()) {
    titleContinueBtn.style.display = '';
  } else {
    titleContinueBtn.style.display = 'none';
  }
}

titleContinueBtn.addEventListener('click', async (ev) => {
  ev.stopPropagation();
  if (await hasSave()) {
    const resumed = await tryResume();
    if (resumed) {
      titleEl.style.display = 'none';
      state.gameState = 'play';
      try { updateUI(); } catch(e) { console.error(e); }
    } else {
      deleteSave().catch(e => console.error('[Save]', e));
      await updateTitleButtons();
      openCharGen();
    }
  }
});

titleNewGameBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  deleteSave().catch(e => console.error('[Save]', e));
  openCharGen();
});

titleEl.addEventListener('click', (ev) => {
  // Only buttons above should act
});

document.getElementById('death').addEventListener('click', () => {
  deleteSave().catch(e => console.error('[Save]', e));
  showScreen('title');
});
document.getElementById('victory').addEventListener('click', () => {
  deleteSave().catch(e => console.error('[Save]', e));
  showScreen('title');
});

// ---- In-game restart confirmation ----
function showRestartConfirm() {
  restartConfirmEl.style.display = 'flex';
}
function hideRestartConfirm() {
  restartConfirmEl.style.display = 'none';
}

document.getElementById('restart-yes').addEventListener('click', (ev) => {
  ev.stopPropagation();
  hideRestartConfirm();
  deleteSave().catch(e => console.error('[Save]', e));
  showScreen('title');
});

document.getElementById('restart-no').addEventListener('click', (ev) => {
  ev.stopPropagation();
  hideRestartConfirm();
});

restartConfirmEl.addEventListener('click', (ev) => {
  ev.stopPropagation();
});

// ==================== TITLE-SCREEN BACKDROP ====================
function drawTitleBackdrop() {
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.02)';
  for (let y = 0; y < canvas.height; y += 3) {
    ctx.fillRect(0, y, canvas.width, 1);
  }
}
drawTitleBackdrop();
updateZoomLabel();

// ==================== STARTUP ====================
// Migration + async title-button check. Wrapped in async IIFE because
// the save system now uses IndexedDB (async) instead of localStorage.
(async () => {
  try {
    await migrateFromLocalStorage();
  } catch (e) {
    console.error('[Save] localStorage → IndexedDB migration failed:', e);
  }
  await updateTitleButtons();
})();

// ==================== DEBUG / ECOLOGY TESTING ====================
// Console helpers — call from browser devtools:
//   dbg()        → table of all creature drives, behavior, prey counts
//   ds()         → table of substrate %, regen rate, turns to full (all creatures + player)
//   ds('hare')   → filter to hares only
//   fh(0.85)     → force all predators to hunger 0.85 (triggers hunting)
//   fh(0.95)     → starving — extended chase, fights through damage
window.dbg = debugEcology;
window.fh  = debugForceHunger;
window.dc  = debugCognition;
window.ds  = debugSubstrate;
window.debugCognition = debugCognition;
window.state = state;

// ==================== WINDOW RESIZE ====================
window.addEventListener('resize', () => {
  resizeCanvas();
  if (state.gameState === 'play') render();
});

// ==================== ZOOM DEBUG ====================
//   setZoom(0) → ×1 (16px)   setZoom(1) → ×2 (32px)   setZoom(2) → ×3 (48px)
window.setZoom = (idx) => { if (setZoom(idx)) { resizeCanvas(); render(); updateZoomLabel(); } };
window.zoom = zoom;
window.uiZoom = () => UI_ZOOM_LEVELS[_uiZoomIndex];

// ==================== SPRITE PACK DEBUG ====================
//   spritePack()     → current pack (16 or 32)
//   togglePack()     → switch pack and re-render
window.spritePack = getSpritePack;
window.togglePack = () => { const p = toggleSpritePack(); render(); return p; };
