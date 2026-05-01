// ==================== MAIN ENTRY POINT ====================
// The conductor: wires modules, binds input, runs the state machine.
// NO game logic lives here — only delegation.

import { state } from './state.js';
import { TILE, VIEW_W, VIEW_H } from './constants.js';
import { modalEl, closeModal, setUpdateUICallback } from './modal.js';
import { updateUI } from './ui.js';
import { canvas, ctx } from './rendering.js';

import { attemptMove, restAction, eatBest, eatItem, usePotion, dropItem, equipWeaponFromInv, equipArmorFromInv } from './player-actions.js';
import { setOnPlayerDeathCallback } from './enemy-ai.js';
import { setOnVictoryCallback, toggleStealth } from './combat.js';
import { useAction, showHelp, examineTile, readBook } from './interactions.js';
import { openCharGen, setDiffButton, renderCharGen, randomizeAttrs, beginGame, onPlayerDeath, onVictory } from './chargen.js';
import { hasSave, tryResume, deleteSave } from './save-load.js';

// ==================== WIRE CALLBACKS ====================
setUpdateUICallback(updateUI);
setOnPlayerDeathCallback(() => { deleteSave(); onPlayerDeath(); });
setOnVictoryCallback(() => { deleteSave(); onVictory(); });

// ==================== SAFE DISPATCH ====================
// Wraps every player action so one bad throw doesn't brick the game.
function safeDispatch(fn, ...args) {
  if (state.gameState !== 'play') return;
  if (modalEl.classList.contains('show')) return;
  if (state.inputLocked) return;          // ← prevents double-fire
  try {
    fn(...args);
  } catch (err) {
    console.error('[OverWorld Zero] Action failed:', err);
    // Unlock input so the player isn't softlocked
    state.inputLocked = false;
  }
}

// ==================== COORDINATE HELPERS ====================
// Centering offsets (must match rendering.js)
const VIEW_OFS_X = (canvas.width  - VIEW_W * TILE) >> 1;
const VIEW_OFS_Y = (canvas.height - VIEW_H * TILE) >> 1;

function canvasToWorld(ev) {
  const rect = canvas.getBoundingClientRect();
  const cx = Math.floor(((ev.clientX - rect.left) * (canvas.width / rect.width) - VIEW_OFS_X) / TILE);
  const cy = Math.floor(((ev.clientY - rect.top) * (canvas.height / rect.height) - VIEW_OFS_Y) / TILE);
  return {
    wx: state.player.x - (VIEW_W >> 1) + cx,
    wy: state.player.y - (VIEW_H >> 1) + cy,
  };
}

// ==================== INPUT: MOUSE ====================
canvas.addEventListener('click', (ev) => {
  if (state.gameState !== 'play' || modalEl.classList.contains('show')) return;
  if (state.inputLocked) return;
  if (restartConfirmEl.style.display === 'flex') return;

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

  // Far click: step one tile in the dominant direction
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
    examineTile(wx, wy);
  } catch (err) {
    console.error('[OverWorld Zero] examineTile failed:', err);
  }
});

// ==================== INPUT: KEYBOARD ====================
const KEY_MAP = {
  'w': () => attemptMove(0, -1),
  'arrowup': () => attemptMove(0, -1),
  's': () => attemptMove(0, 1),
  'arrowdown': () => attemptMove(0, 1),
  'a': () => attemptMove(-1, 0),
  'arrowleft': () => attemptMove(-1, 0),
  'd': () => attemptMove(1, 0),
  'arrowright': () => attemptMove(1, 0),
  ' ': restAction,
  'e': eatBest,
  'f': toggleStealth,
  'r': useAction,
  '?': showHelp,
  '/': showHelp,
};

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

  // N key: open restart confirmation
  if (ev.key.toLowerCase() === 'n') {
    ev.preventDefault();
    showRestartConfirm();
    return;
  }

  const action = KEY_MAP[ev.key.toLowerCase()];
  if (action) {
    ev.preventDefault();
    safeDispatch(action);
  }
});

// ==================== SIDEBAR TABS ====================
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t =>
      t.classList.toggle('active', t === tab)
    );
    document.querySelectorAll('.tab-content').forEach(c =>
      c.classList.toggle('hidden', c.id !== 'tab-' + target)
    );
  });
});

// ==================== ACTION BAR ====================
const ACTION_BINDINGS = {
  'act-rest':    restAction,
  'act-eat':     eatBest,
  'act-stealth': toggleStealth,
  'act-use':     useAction,
};
for (const [id, fn] of Object.entries(ACTION_BINDINGS)) {
  document.getElementById(id).addEventListener('click', () => safeDispatch(fn));
}
// Help works even outside 'play' state
document.getElementById('act-help').addEventListener('click', () => {
  try { showHelp(); } catch (e) { console.error(e); }
});

// ==================== INVENTORY DELEGATION ====================
const INV_ACTIONS = {
  eat:    (i) => eatItem(i),
  drop:   (i) => dropItem(i),
  potion: (i) => usePotion(i),
  book:   (i) => readBook(i),
  equipW: (i) => equipWeaponFromInv(i),
  equipA: (i) => equipArmorFromInv(i),
};

document.getElementById('items-list').addEventListener('click', (ev) => {
  for (const [key, fn] of Object.entries(INV_ACTIONS)) {
    const raw = ev.target.dataset[key];
    if (raw != null) {
      const idx = parseInt(raw, 10);
      if (Number.isFinite(idx)) safeDispatch(fn, idx);
      return;
    }
  }
});

// ==================== CHARGEN CONTROLS ====================
document.querySelectorAll('.diff-btn').forEach(b =>
  b.addEventListener('click', () => {
    state.difficulty = b.dataset.diff;
    setDiffButton();
  })
);
document.getElementById('cg-random').addEventListener('click', randomizeAttrs);
document.getElementById('cg-reset').addEventListener('click', () => {
  state.cgAttrs = { str: 1, con: 1, dex: 1, int: 1 };
  renderCharGen();
});
document.getElementById('cg-begin').addEventListener('click', beginGame);

// ==================== STATE MACHINE TRANSITIONS ====================
function showScreen(id) {
  for (const s of ['title', 'death', 'victory']) {
    document.getElementById(s).style.display = s === id ? 'flex' : 'none';
  }
  state.gameState = id === 'title' ? 'title' : state.gameState;
  // Update title screen to reflect save availability
  if (id === 'title') updateTitleButtons();
}

// ---- Save-aware title screen ----
const titleEl = document.getElementById('title');
const titleContinueBtn = document.getElementById('title-continue');
const titleNewGameBtn  = document.getElementById('title-newgame');
const restartConfirmEl = document.getElementById('restart-confirm');

function updateTitleButtons() {
  if (hasSave()) {
    titleContinueBtn.style.display = '';
  } else {
    titleContinueBtn.style.display = 'none';
  }
}

// Continue button: load save
titleContinueBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  if (hasSave()) {
    if (tryResume()) {
      titleEl.style.display = 'none';
      state.gameState = 'play';
      try { updateUI(); } catch(e) { console.error(e); }
    } else {
      deleteSave();
      updateTitleButtons();
      openCharGen();
    }
  }
});

// New Game button: delete save and start chargen
titleNewGameBtn.addEventListener('click', (ev) => {
  ev.stopPropagation();
  deleteSave();
  openCharGen();
});

// Prevent stray clicks on the title background from doing anything
titleEl.addEventListener('click', (ev) => {
  // Only buttons above should act
});

// Death / Victory: delete save, return to title
document.getElementById('death').addEventListener('click', () => {
  deleteSave();
  showScreen('title');
});
document.getElementById('victory').addEventListener('click', () => {
  deleteSave();
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
  deleteSave();
  showScreen('title');
});

document.getElementById('restart-no').addEventListener('click', (ev) => {
  ev.stopPropagation();
  hideRestartConfirm();
});

// Prevent background clicks on the confirm overlay from leaking
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

// ==================== STARTUP: CHECK FOR SAVED GAME ====================
updateTitleButtons();
