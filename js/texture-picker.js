// ==================== TEXTURE PICKER ====================
// Canvas-based overlay for previewing and swapping tile sprite variants.
// Press T to toggle. Click a tile to cycle its variant.
// Selections persist via save/load and can be exported/imported as JSON.

import { SPRITE_LIBRARY, textureConfig, getActiveSprite, rebuildSpriteCache, S } from './sprites.js';
import { BIOME } from './constants.js';
import { SPRITE_NATIVE } from './display.js';
import { render } from './rendering.js';

// ── State ──
let _pickerOpen = false;
let _overlayEl = null;

// ── Palette mapping for preview rendering ──
// Maps each SPRITE_LIBRARY key to a BIOME palette key.
// Cave wall uses a special dark palette (not in BIOME).
const CAVE_WALL_DARK = { bg: '#1a1614', fg: '#342e28', mid: '#262220' };

const PREVIEW_PALETTE_KEYS = {
  GRASS:        'plains',
  DIRT:         'plains',
  MUD:          'swamp',
  SAND:         'desert',
  ROCK:         'stone',
  BEACH:        'beach',
  FUNGAL_GRASS: 'fungal',
  WATER:        'water',
  DEEP_WATER:   'deep_water',
  CAVE_FLOOR:   'cave',
  ROAD:         'road',
  RUIN_FLOOR:   'ruin',
  FOREST:       'forest',
  MUSHFOREST:   'mushforest',
  CAVE_WALL:    '_cave_wall_dark',
  CAVE_ROCK:    'cave',
  HUT_WALL:     'town',
  WHEAT:        'wheat',
};

function getPreviewPalette(spriteName) {
  const key = PREVIEW_PALETTE_KEYS[spriteName];
  if (key === '_cave_wall_dark') return CAVE_WALL_DARK;
  if (key && BIOME[key]) return BIOME[key];
  return BIOME.plains || { bg: '#2a2a1e', fg: '#c0b898', mid: '#706848' };
}

// ── Preview rendering ──
const PREVIEW_SCALE = 3;

function buildPreview(spriteRows, palette) {
  const size = SPRITE_NATIVE;
  const scale = PREVIEW_SCALE;
  const c = document.createElement('canvas');
  c.width = size * scale;
  c.height = size * scale;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = palette.bg;
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < size; y++) {
    const row = spriteRows[y] || '';
    for (let x = 0; x < size; x++) {
      const ch = row[x] || '.';
      if (ch === '#') g.fillStyle = palette.fg;
      else if (ch === '-') g.fillStyle = palette.mid;
      else continue;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}

// ── Inject overlay CSS (once) ──
let _cssInjected = false;
function injectCSS() {
  if (_cssInjected) return;
  _cssInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    #texture-picker-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: rgba(0, 0, 0, 0.82);
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow-y: auto;
      padding: 20px 10px 40px;
      font-family: "Press Start 2P", monospace;
      color: #c0b898;
    }
    #texture-picker-overlay .tp-title {
      font-size: 14px;
      color: #e8e0c8;
      margin-bottom: 6px;
      letter-spacing: 2px;
    }
    #texture-picker-overlay .tp-hint {
      font-size: 7px;
      color: #706848;
      margin-bottom: 16px;
    }
    #texture-picker-overlay .tp-grid {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      max-width: 720px;
    }
    #texture-picker-overlay .tp-cell {
      display: flex;
      flex-direction: column;
      align-items: center;
      cursor: pointer;
      padding: 6px;
      border: 1px solid #3a3628;
      border-radius: 3px;
      transition: border-color 0.15s;
      user-select: none;
    }
    #texture-picker-overlay .tp-cell:hover {
      border-color: #8a7e60;
    }
    #texture-picker-overlay .tp-cell.has-variants {
      border-color: #5a5230;
    }
    #texture-picker-overlay .tp-cell.has-variants:hover {
      border-color: #c0a860;
    }
    #texture-picker-overlay .tp-cell canvas {
      display: block;
      image-rendering: pixelated;
      border: 1px solid #2a2620;
    }
    #texture-picker-overlay .tp-label {
      font-size: 5px;
      color: #908868;
      margin-top: 4px;
      text-align: center;
      max-width: ${SPRITE_NATIVE * PREVIEW_SCALE + 8}px;
      overflow: hidden;
      white-space: nowrap;
    }
    #texture-picker-overlay .tp-variant-info {
      font-size: 5px;
      color: #60a060;
      margin-top: 1px;
    }
    #texture-picker-overlay .tp-controls {
      margin-top: 20px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    #texture-picker-overlay .tp-btn {
      font-family: "Press Start 2P", monospace;
      font-size: 7px;
      padding: 6px 12px;
      background: #2a2620;
      color: #c0b898;
      border: 1px solid #5a5230;
      cursor: pointer;
      letter-spacing: 1px;
    }
    #texture-picker-overlay .tp-btn:hover {
      background: #3a3628;
      border-color: #8a7e60;
    }
    #texture-picker-overlay .tp-import-area {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
    }
    #texture-picker-overlay .tp-import-area.show {
      display: flex;
    }
    #texture-picker-overlay .tp-import-area textarea {
      font-family: monospace;
      font-size: 9px;
      width: 400px;
      max-width: 90vw;
      height: 48px;
      background: #1a1814;
      color: #c0b898;
      border: 1px solid #3a3628;
      padding: 6px;
      resize: vertical;
    }
    #texture-picker-overlay .tp-status {
      font-size: 6px;
      color: #60a060;
      min-height: 10px;
      margin-top: 4px;
    }
  `;
  document.head.appendChild(style);
}

// ── Build overlay DOM ──
function buildOverlay() {
  injectCSS();

  const overlay = document.createElement('div');
  overlay.id = 'texture-picker-overlay';

  // Title
  const title = document.createElement('div');
  title.className = 'tp-title';
  title.textContent = 'TEXTURE PICKER';
  overlay.appendChild(title);

  // Hint
  const hint = document.createElement('div');
  hint.className = 'tp-hint';
  hint.textContent = 'Click to cycle variants · Right-click to cycle back · Alt+T or Esc to close';
  overlay.appendChild(hint);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'tp-grid';

  const entries = Object.keys(SPRITE_LIBRARY);
  for (const name of entries) {
    const variants = SPRITE_LIBRARY[name];
    const cell = document.createElement('div');
    cell.className = 'tp-cell' + (variants.length > 1 ? ' has-variants' : '');
    cell.dataset.sprite = name;

    // Preview canvas
    const palette = getPreviewPalette(name);
    const idx = textureConfig[name] || 0;
    const previewCanvas = buildPreview(variants[Math.min(idx, variants.length - 1)], palette);
    previewCanvas.dataset.sprite = name;
    cell.appendChild(previewCanvas);

    // Label
    const label = document.createElement('div');
    label.className = 'tp-label';
    label.textContent = name.replace(/_/g, ' ');
    cell.appendChild(label);

    // Variant counter
    const varInfo = document.createElement('div');
    varInfo.className = 'tp-variant-info';
    varInfo.dataset.sprite = name;
    varInfo.textContent = `${(textureConfig[name] || 0) + 1}/${variants.length}`;
    cell.appendChild(varInfo);

    // Click: cycle forward
    cell.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      cycleVariant(name, 1);
    });

    // Right-click: cycle backward
    cell.addEventListener('contextmenu', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      cycleVariant(name, -1);
    });

    grid.appendChild(cell);
  }

  overlay.appendChild(grid);

  // Controls
  const controls = document.createElement('div');
  controls.className = 'tp-controls';

  const exportBtn = document.createElement('button');
  exportBtn.className = 'tp-btn';
  exportBtn.textContent = 'EXPORT';
  exportBtn.addEventListener('click', exportConfig);
  controls.appendChild(exportBtn);

  const importBtn = document.createElement('button');
  importBtn.className = 'tp-btn';
  importBtn.textContent = 'IMPORT';
  importBtn.addEventListener('click', toggleImportArea);
  controls.appendChild(importBtn);

  overlay.appendChild(controls);

  // Import area (hidden by default)
  const importArea = document.createElement('div');
  importArea.className = 'tp-import-area';
  importArea.id = 'tp-import-area';

  const textarea = document.createElement('textarea');
  textarea.id = 'tp-import-textarea';
  textarea.placeholder = 'Paste texture config JSON here...';
  importArea.appendChild(textarea);

  const applyBtn = document.createElement('button');
  applyBtn.className = 'tp-btn';
  applyBtn.textContent = 'APPLY';
  applyBtn.addEventListener('click', importConfig);
  importArea.appendChild(applyBtn);

  overlay.appendChild(importArea);

  // Status line
  const status = document.createElement('div');
  status.className = 'tp-status';
  status.id = 'tp-status';
  overlay.appendChild(status);

  // Prevent keyboard events from leaking to game while picker is focused
  overlay.addEventListener('keydown', (ev) => {
    // Only pass through Alt+T and Escape for closing
    if ((ev.key.toLowerCase() === 't' && ev.altKey) || ev.key === 'Escape') return;
    ev.stopPropagation();
  });

  return overlay;
}

// ── Variant cycling ──
function cycleVariant(name, direction) {
  const variants = SPRITE_LIBRARY[name];
  if (!variants || variants.length <= 1) return;

  let idx = textureConfig[name] || 0;
  idx = (idx + direction + variants.length) % variants.length;
  textureConfig[name] = idx;

  // Rebuild sprite cache for immediate game update
  rebuildSpriteCache(name);

  // Update preview canvas and variant label
  refreshCell(name);

  // Re-render game behind overlay
  try { render(); } catch (e) { /* overlay is on top, render errors are non-fatal */ }
}

function refreshCell(name) {
  if (!_overlayEl) return;
  const variants = SPRITE_LIBRARY[name];
  const idx = textureConfig[name] || 0;
  const palette = getPreviewPalette(name);

  // Update preview canvas
  const cell = _overlayEl.querySelector(`.tp-cell[data-sprite="${name}"]`);
  if (cell) {
    const oldCanvas = cell.querySelector('canvas');
    const newCanvas = buildPreview(variants[Math.min(idx, variants.length - 1)], palette);
    newCanvas.dataset.sprite = name;
    if (oldCanvas) {
      cell.replaceChild(newCanvas, oldCanvas);
    }
  }

  // Update variant label
  const varInfo = _overlayEl.querySelector(`.tp-variant-info[data-sprite="${name}"]`);
  if (varInfo) {
    varInfo.textContent = `${idx + 1}/${variants.length}`;
  }
}

function refreshAllCells() {
  if (!_overlayEl) return;
  for (const name of Object.keys(SPRITE_LIBRARY)) {
    refreshCell(name);
  }
}

// ── Export ──
function exportConfig() {
  // Build a minimal config (only non-zero entries)
  const minimal = {};
  for (const [k, v] of Object.entries(textureConfig)) {
    if (v !== 0) minimal[k] = v;
  }
  const json = JSON.stringify(minimal);

  // Try clipboard, fall back to showing in import textarea
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(json).then(() => {
      showStatus('Copied to clipboard');
    }).catch(() => {
      showInTextArea(json);
    });
  } else {
    showInTextArea(json);
  }
}

function showInTextArea(text) {
  const area = document.getElementById('tp-import-area');
  const textarea = document.getElementById('tp-import-textarea');
  if (area && textarea) {
    area.classList.add('show');
    textarea.value = text;
    textarea.select();
    showStatus('Config shown above — copy it manually');
  }
}

// ── Import ──
function toggleImportArea() {
  const area = document.getElementById('tp-import-area');
  if (area) {
    area.classList.toggle('show');
    if (area.classList.contains('show')) {
      const textarea = document.getElementById('tp-import-textarea');
      if (textarea) { textarea.value = ''; textarea.focus(); }
    }
  }
}

function importConfig() {
  const textarea = document.getElementById('tp-import-textarea');
  if (!textarea) return;
  const text = textarea.value.trim();
  if (!text) {
    showStatus('Nothing to import');
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    showStatus('Invalid JSON');
    return;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    showStatus('Expected a JSON object');
    return;
  }

  // Validate and apply
  let applied = 0;
  for (const [key, val] of Object.entries(parsed)) {
    if (!SPRITE_LIBRARY[key]) continue;
    const idx = Math.floor(Number(val));
    if (isNaN(idx) || idx < 0) continue;
    textureConfig[key] = Math.min(idx, SPRITE_LIBRARY[key].length - 1);
    rebuildSpriteCache(key);
    applied++;
  }

  if (applied === 0) {
    showStatus('No valid entries found');
    return;
  }

  showStatus(`Applied ${applied} texture selection${applied !== 1 ? 's' : ''}`);
  refreshAllCells();

  // Re-render game
  try { render(); } catch (e) { /* non-fatal */ }
}

function showStatus(msg) {
  const el = document.getElementById('tp-status');
  if (el) {
    el.textContent = msg;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.textContent = ''; }, 3000);
  }
}

// ── Toggle overlay ──
export function isTexturePickerOpen() {
  return _pickerOpen;
}

export function toggleTexturePicker() {
  if (_pickerOpen) {
    closeTexturePicker();
  } else {
    openTexturePicker();
  }
}

function openTexturePicker() {
  if (_pickerOpen) return;
  _pickerOpen = true;

  // Build fresh overlay each time (picks up any config changes)
  _overlayEl = buildOverlay();
  document.body.appendChild(_overlayEl);
}

function closeTexturePicker() {
  if (!_pickerOpen) return;
  _pickerOpen = false;

  if (_overlayEl && _overlayEl.parentNode) {
    _overlayEl.parentNode.removeChild(_overlayEl);
  }
  _overlayEl = null;
}
