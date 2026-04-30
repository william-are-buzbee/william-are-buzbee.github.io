// ==================== WORLD STATE HELPERS ====================
import { state, worlds, covers, features, monsters, cellKeyToLayer } from './state.js';
import { T, isCover, defaultGroundFor } from './terrain.js';
import { W_SURF, H_SURF, LAYER_META } from './constants.js';
import { registerCellKeyToLayer } from './save-load.js';

// Wire cellKeyToLayer into the save system so it can be serialized/restored.
registerCellKeyToLayer(cellKeyToLayer);

// ==================== REGIONAL SPAWN REGISTRY ====================
const SPAWN_REGIONS = {
  NE_QUADRANT: (x, y, layerW, layerH) => {
    return x >= Math.floor(layerW / 2) && y < Math.floor(layerH / 2);
  },
};

export function isCoordInRegion(x, y, regionName, layerIndex){
  const check = SPAWN_REGIONS[regionName];
  if (!check) return false;

  let layerW, layerH;
  if (layerIndex === 0){
    layerW = W_SURF;
    layerH = H_SURF;
  } else {
    const meta = LAYER_META[layerIndex];
    if (!meta) return false;
    layerW = meta.w;
    layerH = meta.h;
  }
  return check(x, y, layerW, layerH);
}

export function addLayer(w, h){
  const grid = [];
  const coverGrid = [];
  for (let y=0;y<h;y++){
    const row = [];
    const crow = [];
    for (let x=0;x<w;x++){
      row.push(T.PLAINS);
      crow.push(0);
    }
    grid.push(row);
    coverGrid.push(crow);
  }
  worlds.push(grid);
  covers.push(coverGrid);
  features.push({});
  monsters.push([]);
  return worlds.length - 1;
}

export function worldDims(layer){
  return [worlds[layer][0].length, worlds[layer].length];
}
export function fkey(x,y){ return x+','+y; }
export function getFeature(layer, x, y){ return features[layer][fkey(x,y)]; }
export function setFeature(layer, x, y, f){ features[layer][fkey(x,y)] = f; }
export function inBounds(layer, x, y){
  const [w,h] = worldDims(layer);
  return x>=0 && y>=0 && x<w && y<h;
}
export function isTownCell(layer){ return layer >= 2; }

// ==================== COVER ACCESS ====================
/** Get the cover type at (x,y) on the given layer. Returns 0 if none. */
export function getCover(layer, x, y){
  if (!covers[layer]) return 0;
  const row = covers[layer][y];
  if (!row) return 0;
  return row[x] || 0;
}

/** Set the cover type at (x,y) on the given layer. Use 0 to clear. */
export function setCover(layer, x, y, coverType){
  if (!covers[layer]) return;
  covers[layer][y][x] = coverType || 0;
}

/** Get ground type at (x,y). */
export function getGround(layer, x, y){
  return worlds[layer][y][x];
}

/** Set ground type at (x,y). */
export function setGround(layer, x, y, groundType){
  worlds[layer][y][x] = groundType;
}

/**
 * setTile(layer, x, y, terrainType)
 * Smart setter: if terrainType is classified as cover, set cover and
 * ensure ground has a sensible default. If it's ground, set ground
 * and leave cover unchanged.
 * This is the primary replacement for `grid[y][x] = T.XXX` in world-gen.
 */
export function setTile(layer, x, y, terrainType){
  if (isCover(terrainType)){
    covers[layer][y][x] = terrainType;
    // Only set default ground if current ground doesn't make sense
    // (e.g. is still the initial value or is itself a cover type somehow)
    const curGround = worlds[layer][y][x];
    if (isCover(curGround)){
      worlds[layer][y][x] = defaultGroundFor(terrainType);
    }
  } else {
    worlds[layer][y][x] = terrainType;
  }
}

/**
 * setGroundAndCover(layer, x, y, ground, cover)
 * Explicit setter for both layers at once.
 */
export function setGroundAndCover(layer, x, y, ground, cover){
  worlds[layer][y][x] = ground;
  covers[layer][y][x] = cover || 0;
}

export function monsterAt(x, y, layer){
  if (layer == null) layer = state.player.layer;
  return monsters[layer].find(m => m.x===x && m.y===y && m.hp>0);
}
export function chebyshev(ax,ay,bx,by){ return Math.max(Math.abs(ax-bx), Math.abs(ay-by)); }

/*
  isImpassable(layer, x, y)
  Returns true if the tile at (x,y) on the given layer should block all
  movement — VOID, CAVE_ROCK, CAVE_WALL, and out-of-bounds.
  Checks GROUND only — these are hard terrain blockers.
*/
export function isImpassable(layer, x, y){
  if (!inBounds(layer, x, y)) return true;
  const t = worlds[layer][y][x];
  return t === T.VOID || t === T.CAVE_ROCK || t === T.CAVE_WALL;
}
