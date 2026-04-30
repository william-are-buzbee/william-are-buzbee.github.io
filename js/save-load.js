// ==================== SAVE / LOAD SYSTEM ====================
// Serializes full game state to localStorage. Auto-saved after every turn.
// Handles circular references (bondPartner), Set objects, and item registry refs.

import { state, worlds, covers, monsters, features } from './state.js';
import { LAYER_META } from './constants.js';
import { findWeapon, findArmor } from './items.js';
import { render } from './rendering.js';
import { log } from './log.js';

const SAVE_KEY = 'overworld_zero_save';
const SAVE_VERSION = 1;

// ==================== HELPERS ====================

// Dynamically import cellKeyToLayer — it may live in world-state or state.
// We access it at call time, not import time, to avoid circular deps.
let _cellKeyToLayer = null;
export function registerCellKeyToLayer(obj) { _cellKeyToLayer = obj; }

// ==================== SERIALIZATION ====================

/** Serialize a player object into a plain JSON-safe structure. */
function serializePlayer(p) {
  if (!p) return null;
  const out = { ...p };
  // Weapon & armor → store keys only
  out._weaponKey = p.weapon ? p.weapon.key : 'dagger';
  out._armorKey  = p.armor  ? p.armor.key  : 'rags';
  delete out.weapon;
  delete out.armor;
  // Sets → arrays
  out._npcsMet   = p.npcsMet   ? [...p.npcsMet]   : [];
  out._booksRead = p.booksRead ? [...p.booksRead] : [];
  delete out.npcsMet;
  delete out.booksRead;
  return out;
}

/** Deserialize a player object, reconnecting registry references. */
function deserializePlayer(raw) {
  if (!raw) return null;
  const p = { ...raw };
  // Reconstruct weapon & armor from registry
  p.weapon = findWeapon(raw._weaponKey) || findWeapon('dagger');
  p.armor  = findArmor(raw._armorKey)   || findArmor('rags');
  delete p._weaponKey;
  delete p._armorKey;
  // Reconstruct Sets
  p.npcsMet   = new Set(raw._npcsMet   || []);
  p.booksRead = new Set(raw._booksRead || []);
  delete p._npcsMet;
  delete p._booksRead;
  return p;
}

/**
 * Serialize all monsters across all layers.
 * Handles bondPartner circular refs by replacing with an index-based ID.
 * monsters is an Object keyed by layerIndex.
 */
function serializeMonsters(allLayers) {
  const result = {};
  for (const li of Object.keys(allLayers)) {
    const layer = allLayers[li] || [];
    const serialized = [];
    for (let mi = 0; mi < layer.length; mi++) {
      const mon = layer[mi];
      if (!mon) { serialized.push(null); continue; }
      const out = { ...mon };
      // bondPartner → store as { layer, index } or null
      if (mon.bondPartner && mon.bondPartner !== mon) {
        const partnerIdx = layer.indexOf(mon.bondPartner);
        if (partnerIdx >= 0) {
          out._bondRef = { layer: li, index: partnerIdx };
        } else {
          out._bondRef = null;
        }
      } else {
        out._bondRef = null;
      }
      delete out.bondPartner;
      serialized.push(out);
    }
    result[li] = serialized;
  }
  return result;
}

/** Deserialize monsters and reconnect bondPartner references. */
function deserializeMonsters(allLayers) {
  const result = {};
  for (const li of Object.keys(allLayers)) {
    const layer = allLayers[li];
    result[li] = layer ? layer.map(m => (m ? { ...m } : null)).filter(Boolean) : [];
  }
  // Second pass: reconnect bond partners
  for (const li of Object.keys(allLayers)) {
    const layer = allLayers[li];
    if (!layer) continue;
    for (let mi = 0; mi < layer.length; mi++) {
      const raw = layer[mi];
      if (!raw || !raw._bondRef) continue;
      const ref = raw._bondRef;
      if (result[ref.layer] && result[ref.layer][ref.index]) {
        if (result[li][mi]) {
          result[li][mi].bondPartner = result[ref.layer][ref.index];
        }
      }
    }
  }
  // Clean up _bondRef markers
  for (const li of Object.keys(result)) {
    for (const mon of result[li]) {
      if (mon) {
        delete mon._bondRef;
        if (!mon.bondPartner) mon.bondPartner = null;
      }
    }
  }
  return result;
}

/**
 * Serialize features. Features is an Object keyed by layerIndex,
 * each value is an Object keyed by "x,y".
 */
function serializeFeatures(allFeatures) {
  if (!allFeatures) return {};
  try {
    return JSON.parse(JSON.stringify(allFeatures));
  } catch (e) {
    console.warn('[Save] Features serialization warning:', e);
    return {};
  }
}

// ==================== SAVE ====================

export function saveGame() {
  try {
    if (state.gameState !== 'play') return; // Only save during active play

    // Serialize worlds and covers as Objects keyed by layerIndex
    const serializedWorlds = {};
    for (const li of Object.keys(worlds)) {
      serializedWorlds[li] = worlds[li] || null;
    }

    const serializedCovers = {};
    for (const li of Object.keys(covers)) {
      serializedCovers[li] = covers[li] || null;
    }

    const saveData = {
      version: SAVE_VERSION,
      timestamp: Date.now(),

      // Core state fields
      state: {
        player: serializePlayer(state.player),
        difficulty: state.difficulty,
        turnCount: state.turnCount,
        worldTick: state.worldTick,
        activeLayer: state.activeLayer,
        gameState: state.gameState,
        worldSeed: state.worldSeed,
        cgAttrs: state.cgAttrs,
      },

      // World grids — Object keyed by layerIndex, values are 2D arrays
      worlds: serializedWorlds,
      covers: serializedCovers,

      // All monsters per layer — Object keyed by layerIndex
      monsters: serializeMonsters(monsters),

      // Features per layer — Object keyed by layerIndex
      features: serializeFeatures(features),

      // Layer metadata registry
      layerMeta: { ...LAYER_META },

      // Town cell → layer mappings
      cellKeyToLayer: _cellKeyToLayer ? { ..._cellKeyToLayer } : {},
    };

    const json = JSON.stringify(saveData);
    localStorage.setItem(SAVE_KEY, json);
  } catch (err) {
    console.error('[Save] Failed to save game:', err);
  }
}

// ==================== LOAD ====================

/** Check if a valid save exists. */
export function hasSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return data && data.version === SAVE_VERSION && data.state && data.state.player;
  } catch {
    return false;
  }
}

/** Delete saved game data. */
export function deleteSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.error('[Save] Failed to delete save:', err);
  }
}

/**
 * Load a saved game. Restores all state, grids, monsters, features.
 * Returns true on success, false on failure (caller should start fresh).
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;

    const data = JSON.parse(raw);

    // Version check
    if (!data || data.version !== SAVE_VERSION) {
      console.warn('[Save] Incompatible save version, discarding.');
      deleteSave();
      return false;
    }

    // Validate critical data
    if (!data.state || !data.state.player || !data.worlds) {
      console.warn('[Save] Corrupt save data, discarding.');
      deleteSave();
      return false;
    }

    // --- Restore core state ---
    const savedState = data.state;
    state.player     = deserializePlayer(savedState.player);
    state.difficulty  = savedState.difficulty || 'normal';
    state.turnCount   = savedState.turnCount  || 0;
    state.worldTick   = savedState.worldTick  || 0;
    state.activeLayer = savedState.activeLayer || 0;
    state.gameState   = 'play';
    state.inputLocked = false;
    if (savedState.worldSeed != null) state.worldSeed = savedState.worldSeed;
    if (savedState.cgAttrs) state.cgAttrs = savedState.cgAttrs;

    // --- Restore world grids (Object keyed by layerIndex) ---
    for (const key of Object.keys(worlds)) delete worlds[key];
    if (data.worlds) {
      for (const [key, value] of Object.entries(data.worlds)) {
        worlds[key] = value || null;
      }
    }

    for (const key of Object.keys(covers)) delete covers[key];
    if (data.covers) {
      for (const [key, value] of Object.entries(data.covers)) {
        covers[key] = value || null;
      }
    }

    // --- Restore monsters (Object keyed by layerIndex) ---
    for (const key of Object.keys(monsters)) delete monsters[key];
    if (data.monsters) {
      const restored = deserializeMonsters(data.monsters);
      for (const [key, value] of Object.entries(restored)) {
        monsters[key] = value;
      }
    }

    // --- Restore features (Object keyed by layerIndex) ---
    for (const key of Object.keys(features)) delete features[key];
    if (data.features) {
      for (const [key, value] of Object.entries(data.features)) {
        features[key] = value || {};
      }
    }

    // --- Restore LAYER_META ---
    if (data.layerMeta) {
      for (const key of Object.keys(LAYER_META)) delete LAYER_META[key];
      for (const [key, value] of Object.entries(data.layerMeta)) {
        LAYER_META[key] = value;
      }
    }

    // --- Restore cellKeyToLayer ---
    if (_cellKeyToLayer && data.cellKeyToLayer) {
      for (const key of Object.keys(_cellKeyToLayer)) delete _cellKeyToLayer[key];
      for (const [key, value] of Object.entries(data.cellKeyToLayer)) {
        _cellKeyToLayer[key] = value;
      }
    }

    return true;
  } catch (err) {
    console.error('[Save] Failed to load game:', err);
    deleteSave();
    return false;
  }
}

/**
 * Attempt to resume from save. Call from main.js after world-gen modules
 * are initialized. Returns true if a game was restored.
 */
export function tryResume() {
  if (!hasSave()) return false;
  if (!loadGame()) return false;
  try {
    render();
    log('Game resumed.', 'system');
  } catch (err) {
    console.error('[Save] Render after load failed:', err);
    return false;
  }
  return true;
}
