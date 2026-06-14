// ==================== AI UTILITIES — Shared Spatial + Entity Helpers ====================
// Pure helpers used across multiple AI modules. No AI logic.
// Split from enemy-ai.js — zero behavior change.

import { state, worlds, monsters, groundItems } from './state.js';
import { T, isWalkable, isFoodTile, terrainInfo } from './terrain.js';
import { rand, randi } from './rng.js';
import { inBounds, monsterAt, chebyshev, getCover } from './world-state.js';
import { getBodyMap, SPATIAL_CELL_SIZE, SPATIAL_QUERY_RADIUS, FORAGE_SEARCH_RADIUS } from './constants.js';

// ==================== DIRECTION SYSTEM ====================
// 8 directions, indexed 0-7 clockwise from north
const DIRECTION_DELTAS = [
  { x:  0, y: -1 },  // 0: N
  { x:  1, y: -1 },  // 1: NE
  { x:  1, y:  0 },  // 2: E
  { x:  1, y:  1 },  // 3: SE
  { x:  0, y:  1 },  // 4: S
  { x: -1, y:  1 },  // 5: SW
  { x: -1, y:  0 },  // 6: W
  { x: -1, y: -1 },  // 7: NW
];

/** Convert dx/dy to direction index 0-7. Returns nearest match. */
function dirFromDelta(dx, dy) {
  for (let i = 0; i < 8; i++) {
    if (DIRECTION_DELTAS[i].x === dx && DIRECTION_DELTAS[i].y === dy) return i;
  }
  // Fallback: find nearest
  let best = 0, bestDot = -Infinity;
  for (let i = 0; i < 8; i++) {
    const dot = DIRECTION_DELTAS[i].x * dx + DIRECTION_DELTAS[i].y * dy;
    if (dot > bestDot) { bestDot = dot; best = i; }
  }
  return best;
}

/** Euclidean distance between two points. */
function dist(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Weighted random selection from an array of numeric weights. Returns index. */
function weightedRandomChoice(weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return randi(weights.length);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

/** Direction index from (ax,ay) toward (bx,by). */
function directionToward(ax, ay, bx, by) {
  const dx = Math.sign(bx - ax);
  const dy = Math.sign(by - ay);
  if (dx === 0 && dy === 0) return randi(8);
  return dirFromDelta(dx, dy);
}

/** Direction index from (ax,ay) AWAY from (bx,by). */
function directionAwayFrom(ax, ay, bx, by) {
  // Direction toward, then reverse it
  const towardDir = directionToward(ax, ay, bx, by);
  return (towardDir + 4) % 8;
}

/** True if moving in direction `dir` from creature moves closer to target position. */
function movesCloserTo(dir, cx, cy, tx, ty) {
  const d = DIRECTION_DELTAS[dir];
  const nx = cx + d.x, ny = cy + d.y;
  return dist(nx, ny, tx, ty) < dist(cx, cy, tx, ty);
}

// ==================== AQUATIC MOVEMENT LOCK ====================
const WATER_TILES = new Set([T.WATER, T.DEEP_WATER, T.UWATER]);

function isWaterTile(layer, x, y){
  if (!inBounds(layer, x, y)) return false;
  return WATER_TILES.has(worlds[layer][y][x]);
}

/** True if tile at (x,y) is adjacent to (or is) a water tile. */
function isNearWater(x, y) {
  const layer = state.player.layer;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(layer, nx, ny) && WATER_TILES.has(worlds[layer][ny][nx])) return true;
    }
  }
  return false;
}

/** True if this monster must stay on water tiles. */
function isWaterLocked(mon){
  return mon.tags && mon.tags.includes('aquatic') && mon.key !== 'cave_crab';
}

// ==================== CLADE B TERRITORY RADIUS ====================
/** True if this monster has a clade-based territory radius leash. */
function hasCladeTerritory(mon){
  return !!(mon.clade && mon.clade.territorial && mon.territoryRadius > 0);
}

/** True if position (nx, ny) would be outside this monster's territory radius. */
function wouldExceedTerritory(mon, nx, ny){
  if (!hasCladeTerritory(mon)) return false;
  return chebyshev(nx, ny, mon.homeX, mon.homeY) > mon.territoryRadius;
}

// ==================== ENTITY HELPERS ====================

/** Get a creature's effective mass from surviving body zones. */
function getCreatureMass(entity) {
  const bodyMap = getBodyMap(entity);
  if (bodyMap) {
    let m = 0;
    for (const zone of bodyMap) {
      if (!zone.destroyed) m += zone.mass || 0;
    }
    return m;
  }
  return entity.totalMass || 1;
}

/** Helper: get the player's effective diet based on species. */
function getPlayerDiet() {
  const player = state.player;
  if (!player || !player.species) return null;
  // Herbivore species: grazer (hare), shaleback (cave_crab)
  const PLAYER_DIET_MAP = { grazer: 'herbivore', shaleback: 'herbivore' };
  return PLAYER_DIET_MAP[player.species] || 'predator';
}

// ==================== MOVEMENT ====================

/** Check if a creature can move to a tile. */
function canMoveTo(mon, tx, ty) {
  const layer = state.player.layer;
  if (!inBounds(layer, tx, ty)) return false;
  const ground = worlds[layer][ty][tx];
  const cover = getCover(layer, tx, ty);
  // Prompt K-B: water tiles are passable for creatures with canEnterWater
  if (WATER_TILES.has(ground)) {
    if (mon.canEnterWater !== true) return false;
    // Water creature still needs cover to be walkable (if any)
    if (cover) {
      const ci = terrainInfo(cover);
      if (!ci.walk) return false;
    }
  } else {
    if (!isWalkable(ground, cover)) return false;
  }
  // Water-locked creatures can't leave water
  if (isWaterLocked(mon) && !WATER_TILES.has(ground)) return false;
  // Can't step on another monster
  if (monsterAt(tx, ty, layer)) return false;
  // Can't step on the player
  if (tx === state.player.x && ty === state.player.y) return false;
  // Territory radius check (clade-based)
  if (wouldExceedTerritory(mon, tx, ty)) return false;
  return true;
}

/** Move in a direction with fallback to adjacent directions. */
function moveInDirection(creature, dir) {
  const candidates = [
    dir,
    (dir + 1) % 8,
    (dir + 7) % 8,
    (dir + 2) % 8,
    (dir + 6) % 8,
  ];
  for (const d of candidates) {
    const dx = DIRECTION_DELTAS[d].x;
    const dy = DIRECTION_DELTAS[d].y;
    const tx = creature.x + dx;
    const ty = creature.y + dy;
    if (canMoveTo(creature, tx, ty)) {
      creature.x = tx;
      creature.y = ty;
      creature.movedThisTurn = true;  // Prompt L-A: signal emission flag
      if (creature.facing) {
        creature.facing.dx = dx;
        creature.facing.dy = dy;
      }
      return true;
    }
  }
  return false;
}

// ==================== FOOD / WATER SEARCH ====================

/** Find nearest water tile within bounded radius. Returns {x, y} or null. */
function findNearestWaterTile(sx, sy) {
  const layer = state.player.layer;
  const maxRadius = 25;
  for (let r = 1; r <= maxRadius; r++) {
    // Scan ring at distance r
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        // Only check tiles on the ring edge (Chebyshev distance == r)
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = sx + dx, ny = sy + dy;
        if (inBounds(layer, nx, ny) && WATER_TILES.has(worlds[layer][ny][nx])) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return null;
}

/** Find the nearest food tile within search radius. Returns {x, y} or null. */
function findNearestFoodTile(cx, cy) {
  const layer = state.player.layer;
  const grid = worlds[layer];
  if (!grid) return null;

  for (let r = 0; r <= FORAGE_SEARCH_RADIUS; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(layer, nx, ny)) continue;
        const ground = grid[ny][nx];
        const cover = getCover(layer, nx, ny);
        if (isFoodTile(ground, cover)) {
          return { x: nx, y: ny };
        }
      }
    }
  }
  return null;
}

/** Check if tile at (x,y) is a food tile. */
function tileIsFood(x, y) {
  const layer = state.player.layer;
  if (!inBounds(layer, x, y)) return false;
  const ground = worlds[layer][y][x];
  const cover = getCover(layer, x, y);
  return isFoodTile(ground, cover);
}

/** Get corpse at a specific position. */
function getCorpseAt(layer, x, y) {
  const items = groundItems[layer];
  if (!items) return null;
  const key = `${x},${y}`;
  const arr = items[key];
  if (!arr) return null;
  for (const item of arr) {
    if (item.kind === 'corpse' || item.type === 'corpse') return item;
  }
  return null;
}

// ==================== SPATIAL HASH GRID (Prompt R) ====================
// Eliminates N² creature-vs-creature detection cost.  The grid partitions
// the map into SPATIAL_CELL_SIZE-wide cells.  Each detection query checks
// only the (2·SPATIAL_QUERY_RADIUS+1)² cells around the observer.
// Rebuilt once per turn before any detection runs.  Transient — never saved.

const _spatialGrid = new Map();   // "cellX,cellY" → creature[]

function _monstersHere(){ return monsters[state.player.layer] || []; }

/** Clear and rebuild the spatial grid from the given creature list (or all living creatures on the active layer). */
function rebuildSpatialGrid(creatureList) {
  _spatialGrid.clear();
  const mons = creatureList || _monstersHere();
  for (let i = 0; i < mons.length; i++) {
    const creature = mons[i];
    if (creature.hp <= 0) continue;
    const cx = Math.floor(creature.x / SPATIAL_CELL_SIZE);
    const cy = Math.floor(creature.y / SPATIAL_CELL_SIZE);
    const key = cx + ',' + cy;
    let cell = _spatialGrid.get(key);
    if (!cell) {
      cell = [];
      _spatialGrid.set(key, cell);
    }
    cell.push(creature);
  }
}

/**
 * Return all living creatures near (x, y) within SPATIAL_QUERY_RADIUS cells.
 * The result is a superset of creatures within detection range — the actual
 * per-zone detection still applies exact distance checks.
 */
function getNearbyCreatures(x, y) {
  const results = [];
  const centerCX = Math.floor(x / SPATIAL_CELL_SIZE);
  const centerCY = Math.floor(y / SPATIAL_CELL_SIZE);
  const r = SPATIAL_QUERY_RADIUS;
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const key = (centerCX + dx) + ',' + (centerCY + dy);
      const cell = _spatialGrid.get(key);
      if (cell) {
        for (let i = 0; i < cell.length; i++) {
          results.push(cell[i]);
        }
      }
    }
  }
  return results;
}

export {
  DIRECTION_DELTAS, dirFromDelta, dist, directionToward, directionAwayFrom,
  movesCloserTo, weightedRandomChoice,
  WATER_TILES, isWaterTile, isNearWater, isWaterLocked,
  hasCladeTerritory, wouldExceedTerritory,
  getCreatureMass, getPlayerDiet,
  canMoveTo, moveInDirection,
  findNearestWaterTile, findNearestFoodTile, tileIsFood,
  getCorpseAt,
  rebuildSpatialGrid, getNearbyCreatures,
};
