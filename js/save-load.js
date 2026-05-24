// ==================== SAVE / LOAD SYSTEM ====================
// Serializes full game state to localStorage. Auto-saved after every turn.
// Handles circular references (bondPartner), Set objects, and item registry refs.

import { state, worlds, covers, monsters, features, groundItems } from './state.js';
import { LAYER_META, HP_PER_SIZE, HP_PER_LEVEL_FACTOR } from './constants.js';
import { findWeapon, findArmor } from './items.js';
import { render } from './rendering.js';
import { log } from './log.js';
import { updatePlayerFOV } from './fov.js';

const SAVE_KEY = 'overworld_zero_save';
const SAVE_VERSION = 3;

// ==================== HELPERS ====================

// Dynamically import cellKeyToLayer — it may live in world-state or state.
// We access it at call time, not import time, to avoid circular deps.
let _cellKeyToLayer = null;
export function registerCellKeyToLayer(obj) { _cellKeyToLayer = obj; }

// ==================== EXPLORED SET SERIALIZATION ====================
// state.explored is { layerIndex → Set<"x,y"> }. Sets don't survive
// JSON.stringify, so we convert to/from arrays of strings.

function serializeExplored(explored) {
  if (!explored) return {};
  const out = {};
  for (const layer of Object.keys(explored)) {
    out[layer] = explored[layer] ? [...explored[layer]] : [];
  }
  return out;
}

function deserializeExplored(raw) {
  if (!raw) return {};
  const out = {};
  for (const layer of Object.keys(raw)) {
    out[layer] = new Set(raw[layer] || []);
  }
  return out;
}

// ==================== STAT MIGRATION (v1 → v2) ====================
// Converts old 5-stat system (str/con/dex/int/per) to new 7-stat system
// (siz/strength/chem/vib/vis/central/distributed).
// Applied to both player and monster data when loading old saves.

function migratePlayerStats(p) {
  if (p.str != null || p.con != null || p.dex != null || p.per != null) {
    // Player migration: use formula shims
    p.siz = p.con || 1;           // CON → Size
    p.strength = p.str || 1;      // STR → Strength
    p.chem = p.per || 1;          // PER → Chemical
    p.vib = 0;                    // new stat
    p.vis = p.per || 1;           // PER → Visual
    p.central = p.int || 1;       // INT → Central
    p.distributed = 0;            // new stat
    delete p.str; delete p.con; delete p.dex; delete p.int; delete p.per;
  }
  return p;
}

function migrateMonsterStats(mon) {
  if (mon.str != null || mon.con != null || mon.dex != null || mon.per != null) {
    mon.siz = mon.con || 1;
    mon.strength = mon.str || 1;
    mon.chem = mon.per || 1;
    mon.vib = 0;
    mon.vis = mon.per || 1;
    mon.central = mon.int || 1;
    mon.distributed = 0;
    delete mon.str; delete mon.con; delete mon.dex; delete mon.int; delete mon.per;
  }
  return mon;
}

function migrateCgAttrs(attrs) {
  if (attrs && (attrs.str != null || attrs.con != null)) {
    return {
      siz: attrs.con || 1,
      strength: attrs.str || 1,
      chem: attrs.per || 1,
      vib: attrs.dex || 1,
      vis: attrs.per || 1,
      central: attrs.int || 1,
      distributed: 0,
    };
  }
  return attrs;
}

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
  // Backwards compat: migrate old 5-stat system to new 7-stat system
  migratePlayerStats(p);
  // Backwards compat: ensure all new stats have defaults
  if (p.siz == null) p.siz = 1;
  if (p.strength == null) p.strength = 1;
  if (p.chem == null) p.chem = 1;
  if (p.vib == null) p.vib = 0;
  if (p.vis == null) p.vis = 1;
  if (p.central == null) p.central = 1;
  if (p.distributed == null) p.distributed = 0;
  // Backwards compat: colorPalette added post-launch
  if (p.colorPalette == null) p.colorPalette = 'meso_predator';
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

      // Ground items per layer — Object keyed by layerIndex,
      // each value is a sparse map of "x,y" → array of item objects
      groundItems: serializeFeatures(groundItems),  // same plain-object structure

      // Layer metadata registry
      layerMeta: { ...LAYER_META },

      // Town cell → layer mappings
      cellKeyToLayer: _cellKeyToLayer ? { ..._cellKeyToLayer } : {},

      // FOV explored tiles per layer — Set<"x,y"> → array of strings
      explored: serializeExplored(state.explored),

      // World-map explored cells — Set<"cx,cy"> → array of strings
      exploredCells: state.exploredCells ? [...state.exploredCells] : [],
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
    // Accept current version AND previous versions (will be migrated on load)
    return data && (data.version === SAVE_VERSION || data.version === 2 || data.version === 1) && data.state && data.state.player;
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

    // Version check — accept v1, v2 (will migrate) and current version
    if (!data || (data.version !== SAVE_VERSION && data.version !== 2 && data.version !== 1)) {
      console.warn('[Save] Incompatible save version, discarding.');
      deleteSave();
      return false;
    }

    const needsStatMigration = data.version === 1;   // v1 → rename old stat keys
    const needsHPRecalc = data.version <= 2;          // v1 & v2 → recalc HP with new formula
    if (needsStatMigration) {
      console.log('[Save] Migrating v1 save to v3 (stat system rename + HP recalc).');
    } else if (data.version === 2) {
      console.log('[Save] Migrating v2 save to v3 (HP recalc).');
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
    state.turnCount   = savedState.turnCount  || 0;
    state.worldTick   = savedState.worldTick  || 0;
    state.activeLayer = savedState.activeLayer || 0;
    state.gameState   = 'play';
    state.inputLocked = false;
    if (savedState.worldSeed != null) state.worldSeed = savedState.worldSeed;
    if (savedState.cgAttrs) {
      state.cgAttrs = needsStatMigration ? migrateCgAttrs(savedState.cgAttrs) : savedState.cgAttrs;
    }

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

    // --- Migrate monster stats if loading old save ---
    if (needsStatMigration) {
      for (const li of Object.keys(monsters)) {
        if (!monsters[li]) continue;
        for (const mon of monsters[li]) {
          if (mon) migrateMonsterStats(mon);
        }
      }
    }

    // --- Recalculate HP for v1/v2 saves using new Size-based formula ---
    if (needsHPRecalc) {
      // Recalc player HP
      const p = state.player;
      if (p) {
        const newMax = p.siz * HP_PER_SIZE + (p.level - 1) * Math.ceil(p.siz * HP_PER_LEVEL_FACTOR)
                       + (p.perks && p.perks.hp_bonus ? 8 : 0);
        p.hpMax = newMax;
        p.hp = Math.min(p.hp, p.hpMax);  // clamp current HP to new max
      }
      // Recalc monster HP where applicable
      for (const li of Object.keys(monsters)) {
        if (!monsters[li]) continue;
        for (const mon of monsters[li]) {
          if (!mon) continue;
          // Monsters have hpMax set from their template; recalc using Size
          if (mon.siz != null) {
            const newMax = mon.siz * HP_PER_SIZE + ((mon.level || 1) - 1) * Math.ceil(mon.siz * HP_PER_LEVEL_FACTOR);
            mon.hpMax = newMax;
            mon.hp = Math.min(mon.hp, mon.hpMax);
          }
        }
      }
    }

    // --- Restore features (Object keyed by layerIndex) ---
    for (const key of Object.keys(features)) delete features[key];
    if (data.features) {
      for (const [key, value] of Object.entries(data.features)) {
        features[key] = value || {};
      }
    }

    // --- Restore ground items (Object keyed by layerIndex) ---
    for (const key of Object.keys(groundItems)) delete groundItems[key];
    if (data.groundItems) {
      for (const [key, value] of Object.entries(data.groundItems)) {
        groundItems[key] = value || {};
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

    // --- Restore FOV explored tiles ---
    state.explored = deserializeExplored(data.explored);
    // fovSet is recomputed on the first action (or by tryResume before render)

    // --- Restore world-map explored cells ---
    state.exploredCells = new Set(data.exploredCells || []);

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
    updatePlayerFOV();  // compute FOV before first render
    render();
    log('Game resumed.', 'system');
  } catch (err) {
    console.error('[Save] Render after load failed:', err);
    return false;
  }
  return true;
}
