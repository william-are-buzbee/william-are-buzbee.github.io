// ==================== STRUCTURE PLACEMENT SYSTEM ====================
// Central registry for all world structures (ruins, chests, signs, camps,
// ponds, etc.).  A single placement pass reads this registry and places
// everything after biome generation and town placement, but before the
// main monster-spawning pass.
//
// Structure definitions live in STRUCTURE_REGISTRY.  Each entry describes
// what to place, where it can go, and how many to attempt.
//
// Castles and towns keep their hand-coded layout logic but register their
// positions here so the distance constraints are respected.

import { worlds, covers, features, monsters } from './state.js';
import { T, isCover, isWalkable, terrainInfo } from './terrain.js';
import {
  LAYER_SURFACE, LAYER_UNDER,
  W_SURF, H_SURF, W_UNDER, H_UNDER,
  LAYER_META, getAtmosphere,
} from './constants.js';
import { rand, randi, choice } from './rng.js';
import {
  setFeature, inBounds, getCover, chebyshev,
} from './world-state.js';
import { spawnMonster } from './monsters.js';
import { SIGN_TEXTS } from './npcs.js';

// ==================== PLACEMENT STATE ====================
// Accumulated during a world-gen run; cleared on new world.
const placedStructures = [];   // { key, x, y, layer }
const townPositions    = [];   // { key, x, y }

export function clearPlacementState() {
  placedStructures.length = 0;
  townPositions.length    = 0;
}

/** Register a town so structures can respect distance constraints. */
export function registerTownPosition(key, x, y) {
  townPositions.push({ key, x, y });
}

/** Register any manually-placed structure (castles, etc.). */
export function registerStructurePosition(key, x, y, layer) {
  placedStructures.push({ key, x, y, layer });
}

export function getTownPositions()    { return townPositions; }
export function getPlacedStructures() { return placedStructures; }

// ==================== INTERNAL HELPERS ====================

function layerDims(layerIndex) {
  if (layerIndex === LAYER_SURFACE) return [W_SURF, H_SURF];
  const meta = LAYER_META[layerIndex];
  if (meta) return [meta.w, meta.h];
  return [W_UNDER, H_UNDER];
}

/** Place terrain + optional feature without importing world-logic (avoids cycle). */
function placeAtInternal(layer, x, y, terrainType, featureObj) {
  if (isCover(terrainType)) {
    covers[layer][y][x] = terrainType;
  } else {
    worlds[layer][y][x] = terrainType;
  }
  if (featureObj) setFeature(layer, x, y, featureObj);
}

/** Resolve randomised fields in a loot-item template. */
function resolveLootItem(item) {
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (Array.isArray(v)) {
      if (v.length === 2 && typeof v[0] === 'number') {
        // [min, max) → min + randi(max - min)
        out[k] = v[0] + randi(v[1] - v[0]);
      } else if (v.length > 0 && typeof v[0] === 'string') {
        // random pick from string list
        out[k] = choice(v);
      } else {
        out[k] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Weighted random pick from [[item, weight], …]. */
function weightedPick(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = rand() * total;
  for (const [item, w] of pairs) {
    r -= w;
    if (r <= 0) return resolveLootItem(item);
  }
  return resolveLootItem(pairs[pairs.length - 1][0]);
}

function distToNearestTown(x, y) {
  let min = Infinity;
  for (const t of townPositions) {
    min = Math.min(min, chebyshev(x, y, t.x, t.y));
  }
  return min;
}

function townPos(townKey) {
  return townPositions.find(t => t.key === townKey) || null;
}

function distToSameType(key, x, y, layer) {
  let min = Infinity;
  for (const s of placedStructures) {
    if (s.key === key && s.layer === layer) {
      min = Math.min(min, chebyshev(x, y, s.x, s.y));
    }
  }
  return min;
}

// Cover types that must never be overwritten by structure placement.
const PROTECTED_COVERS = new Set([
  T.STAIRS_DOWN, T.STAIRS_UP, T.GATE, T.NPC, T.SHOP, T.INN,
  T.HOUSE, T.HOUSE_LG, T.TOWN, T.CASTLE, T.BLACKSPIRE,
  T.SIGN, T.CHEST, T.BOOK, T.THRONE, T.WELL,
  T.WELL_TL, T.WELL_TR, T.WELL_BL, T.WELL_BR,
  T.SHOPKEEPER, T.FOUNTAIN, T.FARM,
  T.HUT_WALL, T.CAMPFIRE,
]);

// ==================== VALIDATION ====================

function isValidPlacement(def, x, y, layerIndex) {
  const grid     = worlds[layerIndex];
  const coverGrid = covers[layerIndex];
  const [w, h]   = layerDims(layerIndex);

  const tiles = def.tiles || [{ dx: 0, dy: 0 }];

  // --- Bounds check every tile ---
  for (const t of tiles) {
    const tx = x + t.dx, ty = y + t.dy;
    if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1) return false;
  }

  // --- Ground-type check (anchor only by default, all tiles if groundAll) ---
  if (def.ground) {
    if (def.groundAll) {
      for (const t of tiles) {
        if (!def.ground.includes(grid[y + t.dy][x + t.dx])) return false;
      }
    } else {
      if (!def.ground.includes(grid[y][x])) return false;
    }
  }

  // --- Cover collision ---
  for (const t of tiles) {
    const c = coverGrid ? coverGrid[y + t.dy][x + t.dx] : 0;
    if (c && PROTECTED_COVERS.has(c)) return false;
    if (!def.clearCover && c) return false;
  }

  // --- Atmosphere / biome ---
  if (def.biome) {
    const atmo = getAtmosphere(x, y);
    for (const field of Object.keys(def.biome)) {
      const [lo, hi] = def.biome[field];
      const val = atmo[field];
      if (val == null || val < lo || val > hi) return false;
    }
  }

  // --- Coordinate bounds ---
  if (def.bounds) {
    if (x < def.bounds.minX || x > def.bounds.maxX) return false;
    if (y < def.bounds.minY || y > def.bounds.maxY) return false;
  }

  // --- Town distance ---
  if (def.minDistFromTown && distToNearestTown(x, y) < def.minDistFromTown) return false;
  if (def.maxDistFromTown != null && distToNearestTown(x, y) > def.maxDistFromTown) return false;

  // --- Same-type distance ---
  if (def.minDistFromOther && distToSameType(def.key, x, y, layerIndex) < def.minDistFromOther) return false;

  // --- Adjacent-to constraint ---
  if (def.adjacentTo != null) {
    let found = false;
    for (let dy = -1; dy <= 1 && !found; dy++) {
      for (let dx = -1; dx <= 1 && !found; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && grid[ny][nx] === def.adjacentTo) {
          found = true;
        }
      }
    }
    if (!found) return false;
  }

  return true;
}

// ==================== SINGLE-STRUCTURE PLACEMENT ====================

function placeStructure(def, x, y, layerIndex) {
  const grid      = worlds[layerIndex];
  const coverGrid = covers[layerIndex];
  const tiles     = def.tiles || [{ dx: 0, dy: 0 }];

  // 1. Clear cover in footprint if requested
  if (def.clearCover && coverGrid) {
    for (const t of tiles) {
      coverGrid[y + t.dy][x + t.dx] = 0;
    }
  }

  // 2. Place tiles
  for (const t of tiles) {
    const tx = x + t.dx, ty = y + t.dy;
    if (t.ground != null) grid[ty][tx] = t.ground;
    if (t.cover  != null) {
      if (coverGrid) coverGrid[ty][tx] = t.cover;
    }
    if (t.feature) setFeature(layerIndex, tx, ty, { ...t.feature });
  }

  // 3. Place loot (chests with random contents)
  if (def.loot) {
    for (const l of def.loot) {
      if (l.chance != null && rand() >= l.chance) continue;
      const lx = x + l.dx, ly = y + l.dy;
      const contents = l.table ? weightedPick(l.table) : resolveLootItem(l.contents);
      const feat = { type: 'chest', contents };
      if (l.featureExtra) Object.assign(feat, l.featureExtra);
      placeAtInternal(layerIndex, lx, ly, T.CHEST, feat);
    }
  }

  // 4. Place spawns
  if (def.spawns) {
    const [w, h] = layerDims(layerIndex);
    for (const sp of def.spawns) {
      for (let i = 0; i < sp.count; i++) {
        for (let attempt = 0; attempt < 30; attempt++) {
          const sx = x + randi(sp.radius * 2 + 1) - sp.radius;
          const sy = y + randi(sp.radius * 2 + 1) - sp.radius;
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const g = grid[sy][sx];
          const c = coverGrid ? coverGrid[sy][sx] : 0;
          if (!isWalkable(g, c) || (c && PROTECTED_COVERS.has(c))) continue;
          const mon = spawnMonster(sp.key);
          if (!mon) continue;
          mon.x = sx; mon.y = sy;
          mon.homeX = sx; mon.homeY = sy;
          if (!monsters[layerIndex]) monsters[layerIndex] = [];
          monsters[layerIndex].push(mon);
          break;
        }
      }
    }
  }

  // 5. Record
  placedStructures.push({ key: def.key, x, y, layer: layerIndex });
}

// ==================== MAIN PLACEMENT PASS ====================

/**
 * Run the structure placement pass for a single layer.
 * Call once per layer, after biome gen and town placement, before main
 * monster spawning.
 *
 * @param {number} layerIndex  — the layer to populate
 * @param {string} [layerType] — 'surface' | 'underground' (auto-detected if omitted)
 */
export function runStructurePlacement(layerIndex, layerType) {
  if (!layerType) {
    layerType = layerIndex === LAYER_SURFACE ? 'surface' : 'underground';
  }
  const [w, h] = layerDims(layerIndex);

  for (const def of STRUCTURE_REGISTRY) {
    // Filter by layer type
    const defLayer = def.layer || 'surface';
    if (defLayer !== layerType) continue;

    for (let i = 0; i < (def.frequency || 1); i++) {
      let placed = false;

      // ----- Anchored to a specific town -----
      if (def.anchorTown) {
        const tp = townPos(def.anchorTown);
        if (!tp) continue;
        const ax = tp.x + (def.anchorOffset ? def.anchorOffset.dx : 0);
        const ay = tp.y + (def.anchorOffset ? def.anchorOffset.dy : 0);
        const radius = def.searchRadius || 6;
        for (let r = 0; r <= radius && !placed; r++) {
          for (let dy = -r; dy <= r && !placed; dy++) {
            for (let dx = -r; dx <= r && !placed; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              const px = ax + dx, py = ay + dy;
              if (isValidPlacement(def, px, py, layerIndex)) {
                placeStructure(def, px, py, layerIndex);
                placed = true;
              }
            }
          }
        }

      // ----- Preferred position (spiral search outward) -----
      } else if (def.preferredPos) {
        const radius = def.searchRadius || 35;
        for (let r = 0; r <= radius && !placed; r++) {
          for (let dy = -r; dy <= r && !placed; dy++) {
            for (let dx = -r; dx <= r && !placed; dx++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
              const px = def.preferredPos.x + dx;
              const py = def.preferredPos.y + dy;
              if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue;
              if (isValidPlacement(def, px, py, layerIndex)) {
                placeStructure(def, px, py, layerIndex);
                placed = true;
              }
            }
          }
        }

      // ----- Random (constrained by bounds / biome) -----
      } else {
        for (let attempt = 0; attempt < 250 && !placed; attempt++) {
          let px, py;
          if (def.bounds) {
            const bw = Math.max(1, def.bounds.maxX - def.bounds.minX);
            const bh = Math.max(1, def.bounds.maxY - def.bounds.minY);
            px = def.bounds.minX + randi(bw);
            py = def.bounds.minY + randi(bh);
          } else {
            px = 2 + randi(w - 4);
            py = 2 + randi(h - 4);
          }
          if (isValidPlacement(def, px, py, layerIndex)) {
            placeStructure(def, px, py, layerIndex);
            placed = true;
          }
        }
      }
    }
  }
}

// ==================== STRUCTURE REGISTRY ====================

export const STRUCTURE_REGISTRY = [

  // ========== MIGRATED: SW Ruins (from world-gen.js placeRuinsSW) ==========

  // DISABLED — legacy system, do not delete yet
  // {
  //   key:       'ruin_pocket',
  //   frequency: 12,
  //   layer:     'surface',
  //   ground:    [T.PLAINS, T.DESERT, T.BEACH, T.DIRT],
  //   groundAll: true,
  //   clearCover: true,
  //   bounds: {
  //     minX: 4,
  //     maxX: Math.floor(W_SURF * 0.45),
  //     minY: Math.floor(H_SURF * 0.55),
  //     maxY: H_SURF - 6,
  //   },
  //   tiles: [
  //     { dx: 0, dy: 0, ground: T.RUIN_FLOOR, cover: T.RUIN_PILLAR },
  //     { dx: 1, dy: 0, ground: T.RUIN_FLOOR },
  //   ],
  //   minDistFromOther: 4,
  // },
  // DISABLED — legacy system, do not delete yet
  // {
  //   key:       'ruin_cluster',
  //   frequency: 8,
  //   layer:     'surface',
  //   ground:    [T.PLAINS, T.DESERT, T.BEACH, T.DIRT],
  //   groundAll: true,
  //   clearCover: true,
  //   bounds: {
  //     minX: 4,
  //     maxX: Math.floor(W_SURF * 0.45),
  //     minY: Math.floor(H_SURF * 0.55),
  //     maxY: H_SURF - 6,
  //   },
  //   tiles: [
  //     { dx: 0, dy: 0, ground: T.RUIN_FLOOR, cover: T.RUIN_PILLAR },
  //     { dx: 1, dy: 0, ground: T.RUIN_FLOOR, cover: T.RUIN_PILLAR },
  //     { dx: 0, dy: 1, ground: T.RUIN_FLOOR },
  //   ],
  //   minDistFromOther: 4,
  // },

  // ========== MIGRATED: SW Ruin Chests (from world-logic.js placeContextualChests) ==========

  // DISABLED — legacy system, do not delete yet
  // {
  //   key:       'ruin_chest_sw',
  //   frequency: 3,
  //   layer:     'surface',
  //   ground:    [T.PLAINS, T.MOUNTAIN, T.RUIN_FLOOR],
  //   clearCover: true,
  //   bounds: {
  //     minX: 4,
  //     maxX: 35,
  //     minY: Math.floor(H_SURF * 0.55),
  //     maxY: H_SURF - 6,
  //   },
  //   tiles: [
  //     { dx: 0, dy: 0, ground: T.STONE },
  //   ],
  //   loot: [{
  //     dx: 0, dy: 0,
  //     featureExtra: { isRuin: true },
  //     table: [
  //       [{ type: 'weapon', key: ['dagger', 'short_sword', 'club'] }, 0.35],
  //       [{ type: 'gold',   amount: [15, 65] }, 0.35],
  //       [{ type: 'weapon', key: ['mace', 'long_sword'] }, 0.15],
  //       [{ type: 'armor',  key: ['leather', 'studded'] }, 0.15],
  //     ],
  //   }],
  //   minDistFromOther: 6,
  //   minDistFromTown: 8,
  // },

  // ========== MIGRATED: NE Rock Chests ==========

  {
    key:       'rock_chest_ne',
    frequency: 2,
    layer:     'surface',
    ground:    [T.STONE, T.CAVE],
    tiles:     [{ dx: 0, dy: 0 }],
    bounds: {
      minX: Math.floor(W_SURF * 0.55),
      maxX: W_SURF - 5,
      minY: 2,
      maxY: 30,
    },
    loot: [{
      dx: 0, dy: 0,
      table: [
        [{ type: 'weapon', key: ['mace', 'warhammer'] }, 0.30],
        [{ type: 'armor',  key: ['chain', 'scale'] }, 0.25],
        [{ type: 'gold',   amount: [40, 120] }, 0.25],
        [{ type: 'potion', key: ['minor_heal', 'heal'] }, 0.20],
      ],
    }],
    minDistFromOther: 8,
  },

  // ========== MIGRATED: Signs near Millhaven ==========

  {
    key: 'sign_millhaven_n',
    frequency: 1,
    layer: 'surface',
    anchorTown: 'millhaven',
    anchorOffset: { dx: 0, dy: -3 },
    searchRadius: 6,
    ground: [T.PLAINS],
    tiles: [
      { dx: 0, dy: 0, cover: T.SIGN, feature: { type: 'sign', text: SIGN_TEXTS.millhaven_n } },
    ],
  },
  {
    key: 'sign_millhaven_e',
    frequency: 1,
    layer: 'surface',
    anchorTown: 'millhaven',
    anchorOffset: { dx: 4, dy: 0 },
    searchRadius: 6,
    ground: [T.PLAINS],
    tiles: [
      { dx: 0, dy: 0, cover: T.SIGN, feature: { type: 'sign', text: SIGN_TEXTS.millhaven_e } },
    ],
  },
  {
    key: 'sign_millhaven_s',
    frequency: 1,
    layer: 'surface',
    anchorTown: 'millhaven',
    anchorOffset: { dx: 0, dy: 4 },
    searchRadius: 6,
    ground: [T.PLAINS],
    tiles: [
      { dx: 0, dy: 0, cover: T.SIGN, feature: { type: 'sign', text: SIGN_TEXTS.millhaven_s } },
    ],
  },

  // ========== MIGRATED: Standalone Signs ==========

  {
    key: 'sign_old_1',
    frequency: 1,
    layer: 'surface',
    preferredPos: { x: 50, y: 50 },
    searchRadius: 35,
    ground: [T.PLAINS],
    tiles: [
      { dx: 0, dy: 0, cover: T.SIGN, feature: { type: 'sign', text: SIGN_TEXTS.oldsign1 } },
    ],
  },
  {
    key: 'sign_old_2',
    frequency: 1,
    layer: 'surface',
    preferredPos: { x: 22, y: 35 },
    searchRadius: 35,
    ground: [T.PLAINS],
    tiles: [
      { dx: 0, dy: 0, cover: T.SIGN, feature: { type: 'sign', text: SIGN_TEXTS.oldsign2 } },
    ],
  },

  // ========== MIGRATED: Underground Cave Chests ==========

  {
    key:       'cave_chest',
    frequency: 2,
    layer:     'underground',
    ground:    [T.CAVE],
    tiles:     [{ dx: 0, dy: 0 }],
    loot: [{
      dx: 0, dy: 0,
      table: [
        [{ type: 'weapon', key: ['long_sword', 'warhammer', 'mace'] }, 0.30],
        [{ type: 'armor',  key: ['chain', 'scale'] }, 0.25],
        [{ type: 'potion', key: ['heal', 'greater_heal'] }, 0.25],
        [{ type: 'gold',   amount: [80, 200] }, 0.20],
      ],
    }],
    minDistFromOther: 10,
  },

  // ========== MIGRATED: Lava-adjacent Chests ==========

  {
    key:       'lava_chest',
    frequency: 2,
    layer:     'underground',
    ground:    [T.CAVE, T.STONE],
    adjacentTo: T.LAVA,
    tiles:     [{ dx: 0, dy: 0 }],
    loot: [{
      dx: 0, dy: 0,
      table: [
        [{ type: 'weapon', key: 'frost_hammer' }, 0.30],
        [{ type: 'weapon', key: 'frost_blade' }, 0.25],
        [{ type: 'weapon', key: 'maul' }, 0.20],
        [{ type: 'armor',  key: 'plate' }, 0.15],
        [{ type: 'potion', key: 'greater_heal' }, 0.10],
      ],
    }],
    minDistFromOther: 10,
  },

  // ========== MIGRATED: Dark-water-adjacent Chest ==========

  {
    key:       'water_chest',
    frequency: 1,
    layer:     'underground',
    ground:    [T.CAVE, T.STONE],
    adjacentTo: T.UWATER,
    tiles:     [{ dx: 0, dy: 0 }],
    loot: [{
      dx: 0, dy: 0,
      table: [
        [{ type: 'weapon', key: 'thunder_sword' }, 0.45],
        [{ type: 'weapon', key: 'storm_mace' }, 0.35],
        [{ type: 'potion', key: 'greater_heal' }, 0.20],
      ],
    }],
    minDistFromOther: 15,
  },

  // ========== MIGRATED: Deep Stone Chest ==========

  {
    key:       'deep_chest',
    frequency: 1,
    layer:     'underground',
    ground:    [T.STONE],
    tiles:     [{ dx: 0, dy: 0 }],
    loot: [{
      dx: 0, dy: 0,
      table: [
        [{ type: 'armor',  key: 'plate' }, 0.35],
        [{ type: 'weapon', key: ['falchion', 'maul'] }, 0.30],
        [{ type: 'gold',   amount: [150, 350] }, 0.20],
        [{ type: 'potion', key: 'greater_heal' }, 0.15],
      ],
    }],
    minDistFromOther: 20,
  },

  // ========== NEW: Stone Pillar Cluster ==========
  // 5 ruin pillars in a loose group.  Purely decorative.

  // DISABLED — legacy system, do not delete yet
  // {
  //   key:       'stone_pillar_cluster',
  //   frequency: 4,
  //   layer:     'surface',
  //   ground:    [T.PLAINS, T.DESERT],
  //   clearCover: true,
  //   biome:     { elevation: [0.10, 0.60], moisture: [0.15, 0.55] },
  //   tiles: [
  //     { dx:  0, dy:  0, ground: T.RUIN_FLOOR, cover: T.RUIN_PILLAR },
  //     { dx:  1, dy:  0, ground: T.RUIN_FLOOR },
  //     { dx: -1, dy:  0, ground: T.RUIN_FLOOR, cover: T.RUIN_PILLAR },
  //     { dx:  0, dy:  1, ground: T.RUIN_FLOOR, cover: T.RUIN_PILLAR },
  //     { dx:  1, dy: -1, ground: T.RUIN_FLOOR, cover: T.RUIN_PILLAR },
  //   ],
  //   minDistFromTown:  12,
  //   minDistFromOther: 18,
  // },

  // ========== NEW: Abandoned Camp ==========
  // 2×2 dead campfire area with a crate and an optional loot chest.

  {
    key:       'abandoned_camp',
    frequency: 3,
    layer:     'surface',
    ground:    [T.PLAINS],
    clearCover: true,
    biome:     { elevation: [0.05, 0.55], moisture: [0.20, 0.60] },
    tiles: [
      { dx: 0, dy: 0, ground: T.DIRT },
      { dx: 1, dy: 0, ground: T.DIRT, cover: T.CRATE },
      { dx: 0, dy: 1, ground: T.DIRT },
      { dx: 1, dy: 1, ground: T.PLAINS },
    ],
    loot: [{
      dx: 1, dy: 1,
      chance: 0.6,
      table: [
        [{ type: 'gold',   amount: [10, 40] }, 0.50],
        [{ type: 'potion', key: 'minor_heal' }, 0.30],
        [{ type: 'weapon', key: ['dagger', 'club'] }, 0.20],
      ],
    }],
    minDistFromTown:  10,
    minDistFromOther: 18,
  },

  // ========== NEW: Mushroom Ring ==========
  // Ring of mushroom-forest tiles on cave ground.
  // Signals nearby mushroom biome; purely decorative.

  {
    key:       'mushroom_ring',
    frequency: 2,
    layer:     'surface',
    ground:    [T.PLAINS, T.CAVE],
    clearCover: true,
    biome:     { fungal: [0.20, 1.0] },
    tiles: [
      { dx: -1, dy: -1, ground: T.CAVE, cover: T.MUSHFOREST },
      { dx:  0, dy: -1, ground: T.CAVE, cover: T.MUSHFOREST },
      { dx:  1, dy: -1, ground: T.CAVE, cover: T.MUSHFOREST },
      { dx: -1, dy:  0, ground: T.CAVE, cover: T.MUSHFOREST },
      { dx:  0, dy:  0, ground: T.CAVE },                       // hollow center
      { dx:  1, dy:  0, ground: T.CAVE, cover: T.MUSHFOREST },
      { dx: -1, dy:  1, ground: T.CAVE, cover: T.MUSHFOREST },
      { dx:  0, dy:  1, ground: T.CAVE, cover: T.MUSHFOREST },
      { dx:  1, dy:  1, ground: T.CAVE, cover: T.MUSHFOREST },
    ],
    minDistFromTown:  10,
    minDistFromOther: 14,
  },

  // ========== NEW: Pond ==========
  // Small 2×2 water patch with beach edges.
  // Appears where moisture is moderate but not high enough for a full lake.

  {
    key:       'pond',
    frequency: 3,
    layer:     'surface',
    ground:    [T.PLAINS],
    clearCover: true,
    biome:     { moisture: [0.35, 0.68], elevation: [0.05, 0.50] },
    tiles: [
      // Beach ring
      { dx: -1, dy: -1, ground: T.BEACH },
      { dx:  0, dy: -1, ground: T.BEACH },
      { dx:  1, dy: -1, ground: T.BEACH },
      { dx:  2, dy: -1, ground: T.BEACH },
      { dx: -1, dy:  0, ground: T.BEACH },
      { dx:  2, dy:  0, ground: T.BEACH },
      { dx: -1, dy:  1, ground: T.BEACH },
      { dx:  2, dy:  1, ground: T.BEACH },
      { dx: -1, dy:  2, ground: T.BEACH },
      { dx:  0, dy:  2, ground: T.BEACH },
      { dx:  1, dy:  2, ground: T.BEACH },
      { dx:  2, dy:  2, ground: T.BEACH },
      // Water center
      { dx: 0, dy: 0, ground: T.WATER },
      { dx: 1, dy: 0, ground: T.WATER },
      { dx: 0, dy: 1, ground: T.WATER },
      { dx: 1, dy: 1, ground: T.WATER },
    ],
    minDistFromTown:  8,
    minDistFromOther: 22,
  },
];
