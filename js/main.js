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
import { tintedSprite } from './sprites.js';

import { attemptMove, restAction, eatBest, eatItem, eatCorpseFromInv, usePotion, dropItem, equipWeaponFromInv, equipArmorFromInv, turnInPlace, lookAtGround, pickUpFromGround, setGroundModalCallbacks, eatAction } from './player-actions.js';
import { T, terrainName, terrainInfo } from './terrain.js';
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
import { openCharGen, renderCharGen, randomizeAttrs, beginGame, onPlayerDeath, onVictory, speciesKeyNav } from './chargen.js';
import { hasSave, tryResume, deleteSave, migrateFromLocalStorage } from './save-load.js';
import { isMapOpen, toggleMap, closeMap, markCurrentCell } from './worldmap.js';
// LEGACY POPUP: overlay.js still used by inventory panel. Migrate to HUD-native.
import { isOverlayOpen, activePanel, togglePanel, closeOverlay, setInventoryActions } from './overlay.js';


// ==================== WIRE CALLBACKS ====================
setUpdateUICallback(updateUI);
setOnPlayerDeathCallback(() => {
  deleteSave().catch(e => console.error('[Save]', e));
  onPlayerDeath();
  hideHud();
  renderDeathScreen();
});
setOnVictoryCallback(() => {
  deleteSave().catch(e => console.error('[Save]', e));
  onVictory();
  hideHud();
  renderVictoryScreen();
});
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
  if (_restartConfirmVisible) return;
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
    else if (state.gameState === 'title') {
      _titleBackdropCanvas = null; // invalidate cache for new tile size
      renderTitle();
    } else if (state.gameState === 'death') renderDeathScreen();
    else if (state.gameState === 'victory') renderVictoryScreen();
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
  'r': () => eatAction(),          // Eat (ground corpses first, then legacy inventory fallback)
  'f': () => toggleStealth(),      // Sneak toggle
  'g': () => pickUpFromGround(),   // Get/pickup
  // V (sniff) handled explicitly below ACTION_MAP — V: ground, Shift+V: air
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

  // Restart confirm — canvas-rendered, keyboard only (Y/N/Escape)
  if (_restartConfirmVisible) {
    const kLow = ev.key.toLowerCase();
    if (ev.key === 'Escape' || kLow === 'n') {
      hideRestartConfirm();
      ev.preventDefault();
    } else if (kLow === 'y') {
      hideRestartConfirm();
      deleteSave().catch(e => console.error('[Save]', e));
      goToTitle();
      ev.preventDefault();
    }
    return;
  }

  // ---- Canvas-rendered screen states: title, species, death, victory ----
  // Title screen keyboard navigation
  if (state.gameState === 'title') {
    const speciesScreen = document.getElementById('species-screen');
    if (speciesScreen && speciesScreen.style.display === 'flex') {
      // Species selection is open — delegate to species keyboard handler
      handleSpeciesKeys(ev);
    } else {
      // Title menu navigation
      handleTitleKeys(ev);
    }
    return;
  }

  // Death screen — Enter returns to title
  if (state.gameState === 'death') {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      deleteSave().catch(e => console.error('[Save]', e));
      goToTitle();
    }
    return;
  }

  // Victory screen — Enter returns to title
  if (state.gameState === 'victory') {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      deleteSave().catch(e => console.error('[Save]', e));
      goToTitle();
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

  // ══════════════════════════════════════════════════════════════
  // LEGACY INVENTORY — commented out, not deleted.
  // The inventory system (items, equipment, potions, books) predates
  // the body map. Will be replaced by object manipulation system.
  // UI entry point severed here. Data structures in items.js,
  // interactions.js, player.js left intact for future use.
  // ══════════════════════════════════════════════════════════════

  // // ── Overlay panel handling (inventory only) ──
  // // LEGACY POPUP: inventory still uses overlay. Migrate to HUD-native pattern.
  // const PANEL_KEYS = { i: 'inventory' };
  const kLow = ev.key.toLowerCase();

  // if (isOverlayOpen()) {
  //   if (ev.key === 'Escape') { closeOverlay(); ev.preventDefault(); return; }
  //   if (PANEL_KEYS[kLow]) { ev.preventDefault(); togglePanel(PANEL_KEYS[kLow]); return; }
  //   ev.preventDefault();
  //   return;
  // }

  // T key: toggle HUD bar display mode (minimal ↔ full)
  if (kLow === 't' && !ev.shiftKey && !isMapOpen()) {
    ev.preventDefault();
    toggleStatusFullMode();
    updateUI();
    return;
  }

  // // LEGACY INVENTORY: I key binding severed (see comment block above)
  // // No overlay open — intercept inventory key before movement
  // if (PANEL_KEYS[kLow] && !ev.shiftKey && !isMapOpen()) {
  //   ev.preventDefault();
  //   togglePanel(PANEL_KEYS[kLow]);
  //   return;
  // }

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

  // Alt+direction: turn in place (reorient without moving)
  if (ev.altKey && !ev.shiftKey) {
    const dir = DIR_MAP[kLow];
    if (dir) {
      ev.preventDefault();
      safeDispatch(turnInPlace, dir[0], dir[1]);
      return;
    }
  }

  // Shift+direction: sprint movement (replaces legacy turn-in-place)
  // Sprint mode set by keydown/keyup — Shift+direction now does sprint move.
  if (ev.shiftKey) {
    const dir = DIR_MAP[kLow];
    if (dir) {
      ev.preventDefault();
      state.player.sprintMode = true;
      safeDispatch(attemptMove, dir[0], dir[1]);
      return;
    }
  }

  // Wait/rest: S, Space, numpad 5, Clear
  if (SELF_KEYS.has(kLow)) {
    ev.preventDefault();
    safeDispatch(restAction);
    return;
  }

  // Movement (direction keys) — non-sprint
  const dir = DIR_MAP[kLow];
  if (dir) {
    ev.preventDefault();
    if (state.player) state.player.sprintMode = false;
    safeDispatch(attemptMove, dir[0], dir[1]);
    return;
  }

  // Smell — V: ground contact, Shift+V: airborne
  if (kLow === 'v') {
    ev.preventDefault();
    safeDispatch(performSniff, ev.shiftKey ? 'air' : 'ground');
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

// ── Sprint mode: reset when Shift is released ──
document.addEventListener('keyup', (ev) => {
  if (ev.key === 'Shift' && state.player) {
    state.player.sprintMode = false;
  }
});

// ══════════════════════════════════════════════════════════════
// LEGACY INVENTORY DELEGATION — commented out, not deleted.
// These handlers fired when inventory-panel buttons were clicked inside
// modals. With the I key binding severed, the inventory panel no longer
// opens, so these handlers are unreachable. Ground loot (data-gpick) and
// ground eat (data-geat) use separate wiring in player-actions.js.
// ══════════════════════════════════════════════════════════════
// const INV_ACTIONS = {
//   eat:        (i) => eatItem(i),
//   drop:       (i) => dropItem(i),
//   potion:     (i) => usePotion(i),
//   book:       (i) => readBook(i),
//   equipW:     (i) => equipWeaponFromInv(i),
//   equipA:     (i) => equipArmorFromInv(i),
//   eatCorpse:  (i) => eatCorpseFromInv(i),
// };
//
// document.getElementById('modal-inner').addEventListener('click', (ev) => {
//   for (const [key, fn] of Object.entries(INV_ACTIONS)) {
//     const raw = ev.target.dataset[key];
//     if (raw != null) {
//       const idx = parseInt(raw, 10);
//       if (Number.isFinite(idx)) {
//         try { fn(idx); } catch (err) { console.error(err); }
//       }
//       return;
//     }
//   }
// });

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
// Canvas-rendered screens replace DOM overlays. showScreen is now only
// used internally by canvas rendering — DOM elements stay hidden via CSS.

function showScreen(id) {
  // DOM screens are hidden via CSS (!important) — no need to toggle them.
  // Just manage game state and trigger appropriate canvas rendering.
  if (id === 'title') {
    state.gameState = 'title';
    hideHud();
    // Invalidate backdrop so it regenerates fresh
    _titleBackdropCanvas = null;
    updateTitleMenu().then(() => renderTitle()).catch(e => console.error(e));
  }
  if (id === 'death' || id === 'victory') hideHud();
}

// ---- Save-aware title screen (canvas-rendered) ----
// DOM refs kept for backward compat — elements are hidden via CSS.
const titleEl = document.getElementById('title');
const titleContinueBtn = document.getElementById('title-continue');
const titleNewGameBtn  = document.getElementById('title-newgame');

// Legacy: updateTitleButtons still used during startup migration path.
// Replaced by updateTitleMenu for canvas rendering.
async function updateTitleButtons() {
  await updateTitleMenu();
}

// ══════════════════════════════════════════════════════════════
// LEGACY DOM HANDLERS — commented out, replaced by keyboard navigation.
// Title menu: handleTitleKeys (above) replaces these click handlers.
// Death/victory: Enter key replaces these click handlers.
// ══════════════════════════════════════════════════════════════

// titleContinueBtn.addEventListener('click', async (ev) => {
//   ev.stopPropagation();
//   if (await hasSave()) {
//     const resumed = await tryResume();
//     if (resumed) {
//       titleEl.style.display = 'none';
//       state.gameState = 'play';
//       try { updateUI(); } catch(e) { console.error(e); }
//     } else {
//       deleteSave().catch(e => console.error('[Save]', e));
//       await updateTitleButtons();
//       openCharGen();
//     }
//   }
// });
//
// titleNewGameBtn.addEventListener('click', (ev) => {
//   ev.stopPropagation();
//   deleteSave().catch(e => console.error('[Save]', e));
//   openCharGen();
// });
//
// titleEl.addEventListener('click', (ev) => {
//   // Only buttons above should act
// });
//
// document.getElementById('death').addEventListener('click', () => {
//   deleteSave().catch(e => console.error('[Save]', e));
//   showScreen('title');
// });
// document.getElementById('victory').addEventListener('click', () => {
//   deleteSave().catch(e => console.error('[Save]', e));
//   showScreen('title');
// });

// ---- In-game restart confirmation (canvas-rendered) ----
// showRestartConfirm / hideRestartConfirm defined above in canvas section.
// DOM click handlers for restart-yes/restart-no commented out —
// Y/N keyboard handling replaces them.

// document.getElementById('restart-yes').addEventListener('click', (ev) => {
//   ev.stopPropagation();
//   hideRestartConfirm();
//   deleteSave().catch(e => console.error('[Save]', e));
//   showScreen('title');
// });
//
// document.getElementById('restart-no').addEventListener('click', (ev) => {
//   ev.stopPropagation();
//   hideRestartConfirm();
// });
//
// restartConfirmEl.addEventListener('click', (ev) => {
//   ev.stopPropagation();
// });

// ==================== CANVAS-RENDERED SCREENS ====================
// Title, death, victory, and restart confirmation are all rendered on
// the game canvas using the same sprite pipeline as gameplay.
// DOM elements for these screens are hidden via CSS.

// ---- Seeded 2D Perlin noise (self-contained for title backdrop) ----
function _titleNoise2D(seed) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed | 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }
  return function(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const g = grad2;
    const aa = g[perm[perm[X] + Y] & 7];
    const ba = g[perm[perm[X + 1] + Y] & 7];
    const ab = g[perm[perm[X] + Y + 1] & 7];
    const bb = g[perm[perm[X + 1] + Y + 1] & 7];
    return lerp(
      lerp(aa[0]*xf + aa[1]*yf, ba[0]*(xf-1) + ba[1]*yf, u),
      lerp(ab[0]*xf + ab[1]*(yf-1), bb[0]*(xf-1) + bb[1]*(yf-1), u),
      v
    );
  };
}

function _titleFbm(noiseFn, x, y, octaves, freq, lac, gain) {
  let sum = 0, amp = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noiseFn(x * freq, y * freq) * amp;
    maxAmp += amp;
    freq *= lac;
    amp *= gain;
  }
  return sum / maxAmp;
}

// ---- Title backdrop: cached terrain preview ----
const TITLE_SEED = 42;
let _titleBackdropCanvas = null;
let _titleBackdropW = 0;
let _titleBackdropH = 0;

function generateTitleBackdrop() {
  const TILE = tileSize();
  const cols = Math.ceil(canvas.width / TILE);
  const rows = Math.ceil(canvas.height / TILE);

  // Skip regeneration if cached at current canvas size
  if (_titleBackdropCanvas
      && _titleBackdropW === canvas.width
      && _titleBackdropH === canvas.height) {
    return;
  }

  const noise = _titleNoise2D(TITLE_SEED);
  const coverNoise = _titleNoise2D(TITLE_SEED + 7);

  const offscreen = document.createElement('canvas');
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const octx = offscreen.getContext('2d');
  octx.imageSmoothingEnabled = false;

  // Black base
  octx.fillStyle = '#000';
  octx.fillRect(0, 0, offscreen.width, offscreen.height);

  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const n = _titleFbm(noise, rx, ry, 4, 0.04, 2.0, 0.5);

      // Map noise to terrain type
      let terrain, cover = 0;
      if (n < -0.30)       terrain = T.DEEP_WATER;
      else if (n < -0.12)  terrain = T.WATER;
      else if (n < -0.02)  terrain = T.BEACH;
      else if (n < 0.08)   terrain = T.SAND;
      else if (n < 0.40)   terrain = T.GRASS;
      else if (n < 0.52)   terrain = T.DIRT;
      else                  terrain = T.ROCK;

      // Cover layer — trees and mushrooms for visual depth
      if (terrain === T.GRASS && n >= 0.18) {
        const cn = _titleFbm(coverNoise, rx, ry, 3, 0.06, 2.0, 0.5);
        if (cn > 0.12) cover = T.FOREST;
        else if (cn < -0.25) cover = T.MUSHFOREST;
      }

      // If mushforest cover, use fungal_grass ground
      if (cover === T.MUSHFOREST) terrain = T.FUNGAL_GRASS;

      // Resolve sprite name with variants (rocks)
      const groundInfo = terrainInfo(terrain);
      let spriteName = groundInfo.sprite;
      if (terrain === T.ROCK) {
        const rockVar = ((rx * 3571 + ry * 2909) >>> 0) % 3;
        spriteName = rockVar === 1 ? 'ROCK_V2' : rockVar === 2 ? 'ROCK_V3' : 'ROCK';
      }

      // Rotation for visual variety (same logic as rendering.js)
      const tileHash = ((rx * 7919 + ry * 6271 + 1013) >>> 0) % 256;
      const rotVariant = tileHash % 4;
      const canRotate = !cover && (terrain === T.GRASS || terrain === T.SAND || terrain === T.ROCK);

      const px = rx * TILE;
      const py = ry * TILE;

      if (canRotate && rotVariant > 0) {
        octx.save();
        octx.translate(px + TILE / 2, py + TILE / 2);
        octx.rotate(rotVariant * Math.PI / 2);
        octx.drawImage(tintedSprite(spriteName, groundInfo.palette), -TILE / 2, -TILE / 2, TILE, TILE);
        octx.restore();
      } else {
        octx.drawImage(tintedSprite(spriteName, groundInfo.palette), px, py, TILE, TILE);
      }

      // Draw cover sprite on top
      if (cover) {
        const coverInfo = terrainInfo(cover);
        octx.drawImage(tintedSprite(coverInfo.sprite, coverInfo.palette), px, py, TILE, TILE);
      }
    }
  }

  // Dim overlay — darkens terrain for text readability
  octx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  octx.fillRect(0, 0, offscreen.width, offscreen.height);

  _titleBackdropCanvas = offscreen;
  _titleBackdropW = canvas.width;
  _titleBackdropH = canvas.height;
}

// ---- Title menu state ----
let _titleMenuOptions = ['NEW GAME'];
let _titleMenuIndex = 0;

async function updateTitleMenu() {
  if (await hasSave()) {
    _titleMenuOptions = ['CONTINUE', 'NEW GAME'];
  } else {
    _titleMenuOptions = ['NEW GAME'];
  }
  // Clamp index if options changed
  if (_titleMenuIndex >= _titleMenuOptions.length) {
    _titleMenuIndex = 0;
  }
}

// ---- Render: Title Screen ----
function renderTitle() {
  generateTitleBackdrop();

  // Draw cached terrain backdrop
  if (_titleBackdropCanvas) {
    ctx.drawImage(_titleBackdropCanvas, 0, 0);
  } else {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Title text
  ctx.font = '24px "Press Start 2P"';
  ctx.fillStyle = '#e8e8e8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('OVERWORLD', canvas.width / 2, canvas.height * 0.35);

  // Subtitle
  ctx.font = '7px "Press Start 2P"';
  ctx.fillStyle = '#3a3a3a';
  ctx.fillText('A world of tooth and claw', canvas.width / 2, canvas.height * 0.35 + 34);

  // Menu options
  const menuY = canvas.height * 0.52;
  const lineHeight = 28;

  for (let i = 0; i < _titleMenuOptions.length; i++) {
    const y = menuY + i * lineHeight;
    const selected = (i === _titleMenuIndex);
    ctx.font = '10px "Press Start 2P"';
    ctx.fillStyle = selected ? '#e8e8e8' : '#4a4a4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(_titleMenuOptions[i], canvas.width / 2, y);

    if (selected) {
      // Draw cursor
      const textWidth = ctx.measureText(_titleMenuOptions[i]).width;
      ctx.fillText('▶', canvas.width / 2 - textWidth / 2 - 20, y);
    }
  }
}

// ---- Render: Death Screen ----
function renderDeathScreen() {
  // Re-render the game world behind the overlay (handles resize too)
  if (state.player) {
    try { render(); } catch (e) { /* fallback: leave existing canvas */ }
  }

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // "YOU DIED" text
  ctx.font = '24px "Press Start 2P"';
  ctx.fillStyle = '#888';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('YOU DIED', canvas.width / 2, canvas.height * 0.42);

  // "PRESS ENTER" prompt
  ctx.font = '8px "Press Start 2P"';
  ctx.fillStyle = '#4a4a4a';
  ctx.fillText('PRESS ENTER', canvas.width / 2, canvas.height * 0.52);
}

// ---- Render: Victory Screen ----
function renderVictoryScreen() {
  // Re-render the game world behind the overlay
  if (state.player) {
    try { render(); } catch (e) { /* fallback: leave existing canvas */ }
  }

  // Dark overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // "VICTORY" text
  ctx.font = '24px "Press Start 2P"';
  ctx.fillStyle = '#e8e8e8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('VICTORY', canvas.width / 2, canvas.height * 0.38);

  // Subtitle
  ctx.font = '8px "Press Start 2P"';
  ctx.fillStyle = '#888';
  ctx.fillText('The land exhales.', canvas.width / 2, canvas.height * 0.46);

  // "PRESS ENTER" prompt
  ctx.fillStyle = '#4a4a4a';
  ctx.fillText('PRESS ENTER', canvas.width / 2, canvas.height * 0.54);
}

// ---- Render: Restart Confirmation (canvas overlay during gameplay) ----
let _restartConfirmVisible = false;

function renderRestartConfirm() {
  // Game world is already on the canvas from the last render
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.font = '14px "Press Start 2P"';
  ctx.fillStyle = '#e8e8e8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NEW GAME?', canvas.width / 2, canvas.height * 0.40);

  ctx.font = '8px "Press Start 2P"';
  ctx.fillStyle = '#888';
  ctx.fillText('This will delete your save.', canvas.width / 2, canvas.height * 0.47);

  ctx.font = '10px "Press Start 2P"';
  ctx.fillStyle = '#4a4a4a';
  ctx.fillText('Y / N', canvas.width / 2, canvas.height * 0.55);
}

function showRestartConfirm() {
  _restartConfirmVisible = true;
  renderRestartConfirm();
}
function hideRestartConfirm() {
  _restartConfirmVisible = false;
  if (state.gameState === 'play') render();
}

// ---- Title menu: keyboard actions ----
function handleTitleKeys(ev) {
  const kLow = ev.key.toLowerCase();
  // Navigate menu
  if (kLow === 'arrowup' || kLow === 'w' || kLow === 'k' || ev.key === '8') {
    ev.preventDefault();
    _titleMenuIndex = Math.max(0, _titleMenuIndex - 1);
    renderTitle();
    return;
  }
  if (kLow === 'arrowdown' || kLow === 's' || kLow === 'j' || ev.key === '2') {
    ev.preventDefault();
    _titleMenuIndex = Math.min(_titleMenuOptions.length - 1, _titleMenuIndex + 1);
    renderTitle();
    return;
  }
  // Select option
  if (ev.key === 'Enter') {
    ev.preventDefault();
    selectTitleOption();
    return;
  }
}

async function selectTitleOption() {
  const option = _titleMenuOptions[_titleMenuIndex];
  if (option === 'CONTINUE') {
    // Same logic as the old DOM title-continue button
    if (await hasSave()) {
      const resumed = await tryResume();
      if (resumed) {
        state.gameState = 'play';
        try { updateUI(); } catch(e) { console.error(e); }
      } else {
        deleteSave().catch(e => console.error('[Save]', e));
        await updateTitleMenu();
        openCharGen();
      }
    }
  } else if (option === 'NEW GAME') {
    deleteSave().catch(e => console.error('[Save]', e));
    openCharGen();
  }
}

// ---- Species selection: keyboard handler ----
function handleSpeciesKeys(ev) {
  const kLow = ev.key.toLowerCase();
  if (kLow === 'arrowup' || kLow === 'w' || kLow === 'k' || ev.key === '8') {
    ev.preventDefault();
    speciesKeyNav(-1);
    return;
  }
  if (kLow === 'arrowdown' || kLow === 's' || kLow === 'j' || ev.key === '2') {
    ev.preventDefault();
    speciesKeyNav(1);
    return;
  }
  if (ev.key === 'Enter') {
    ev.preventDefault();
    beginGame();
    return;
  }
}

// ---- Transition: go to title screen ----
function goToTitle() {
  state.gameState = 'title';
  hideHud();
  // Invalidate backdrop cache so it regenerates at current canvas size
  _titleBackdropCanvas = null;
  updateTitleMenu().then(() => renderTitle()).catch(e => console.error(e));
}

// ---- Draw initial title (replaced old drawTitleBackdrop) ----
document.fonts.ready.then(() => {
  if (state.gameState === 'title') renderTitle();
});
updateZoomLabel();

// ==================== STARTUP ====================
// Migration + async title-menu check. Wrapped in async IIFE because
// the save system now uses IndexedDB (async) instead of localStorage.
(async () => {
  try {
    await migrateFromLocalStorage();
  } catch (e) {
    console.error('[Save] localStorage → IndexedDB migration failed:', e);
  }
  await updateTitleMenu();
  // Initial title render — terrain backdrop + menu.
  // Font may still be loading; document.fonts.ready handler above
  // will re-render once the pixel font is available.
  renderTitle();
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
  if (state.gameState === 'play') {
    render();
    if (_restartConfirmVisible) renderRestartConfirm();
  } else if (state.gameState === 'title') {
    // Invalidate backdrop cache — new canvas size requires regeneration
    _titleBackdropCanvas = null;
    renderTitle();
  } else if (state.gameState === 'death') {
    renderDeathScreen();
  } else if (state.gameState === 'victory') {
    renderVictoryScreen();
  }
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
