// ==================== WORLD GENERATION — COORDINATION LAYER ====================
import {
  worlds, covers, features, monsters,
  state, nextLayerIndex, layerExists, activateLayer,
} from './state.js';
import {
  W_SURF, H_SURF, W_UNDER, H_UNDER,
  LAYER_SURFACE, LAYER_UNDER, LAYER_META,
  ATMOSPHERE,
} from './constants.js';
import { T } from './terrain.js';
import { makeSurface } from './surface-gen.js';
import { makeUnderground, makeLavaLayer, playableRadius } from './underground-gen.js';

// Re-export from gen-utils so existing consumers that import from world-gen still work
export { validateMonsterSpawn, filterSpawnCandidates, populateMonsters } from './gen-utils.js';

// Re-export from sub-modules so existing consumers can keep importing from world-gen
export { makeSurface, placeDirtRoads } from './surface-gen.js';
export { makeUnderground, makeLavaLayer, playableRadius, carveCorridors, carveBetween } from './underground-gen.js';
// town-gen.js no longer exports interior-layer generators.
// Surface town placement is handled by placeStartingTown in town-gen.js,
// called from world-logic.js during initWorld.

// ==================== LAYER BOOTSTRAPPING ====================
export function addLayer(w, h) {
  const idx = nextLayerIndex();
  const grid = [];
  const coverGrid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    const crow = [];
    for (let x = 0; x < w; x++){
      row.push(T.STONE);
      crow.push(0);
    }
    grid.push(row);
    coverGrid.push(crow);
  }
  worlds[idx] = grid;
  covers[idx] = coverGrid;
  if (!features[idx]) features[idx] = {};
  if (!monsters[idx]) monsters[idx] = [];
  return idx;
}

export function generateLayer(layerIndex, seed) {
  if (layerExists(layerIndex)) return;

  if (!features[layerIndex]) features[layerIndex] = {};
  if (!monsters[layerIndex]) monsters[layerIndex] = [];

  const sourceStairs = [];
  if (layerIndex !== LAYER_SURFACE) {
    for (const lk of Object.keys(features)) {
      const layerFeats = features[lk];
      if (!layerFeats) continue;
      for (const fk of Object.keys(layerFeats)) {
        const f = layerFeats[fk];
        if (f && f.type === 'stairs' && f.dir === 'down' && f.targetLayer === layerIndex) {
          sourceStairs.push({ stair: f, sourceLayerIdx: Number(lk) });
        }
      }
    }
  }

  const defaultRadius = playableRadius(layerIndex, W_UNDER, H_UNDER);
  const pockets = sourceStairs.map(({ stair }) => ({
    x: stair.targetX ?? stair.sourceX ?? Math.floor(W_UNDER / 2),
    y: stair.targetY ?? stair.sourceY ?? Math.floor(H_UNDER / 2),
    radius: defaultRadius,
  }));

  if (pockets.length === 0 && layerIndex !== LAYER_SURFACE) {
    pockets.push({
      x: Math.floor(W_UNDER / 2),
      y: Math.floor(H_UNDER / 2),
      radius: defaultRadius,
    });
  }

  if (layerIndex === LAYER_SURFACE) {
    const grid = makeSurface(seed);
    worlds[layerIndex] = grid;
    LAYER_META[layerIndex] = {
      type: 'surface', w: W_SURF, h: H_SURF, seed,
      atmosphere: ATMOSPHERE,
    };

  } else if (layerIndex === LAYER_UNDER) {
    const grid = makeUnderground(seed, layerIndex, pockets, sourceStairs);
    worlds[layerIndex] = grid;
    LAYER_META[layerIndex] = {
      type: 'underground', w: W_UNDER, h: H_UNDER, seed, pockets,
    };

  } else {
    const isLava = layerIndex % 2 === 0;
    const layerSeed = seed + layerIndex * 3571;
    const grid = isLava
      ? makeLavaLayer(layerSeed, layerIndex, pockets, sourceStairs)
      : makeUnderground(layerSeed, layerIndex, pockets, sourceStairs);

    worlds[layerIndex] = grid;
    LAYER_META[layerIndex] = {
      type: isLava ? 'lava' : 'underground',
      w: W_UNDER,
      h: H_UNDER,
      seed: layerSeed,
      pockets,
    };
  }

  // Back-fill targetX/targetY on source stairs
  for (const { stair, sourceLayerIdx } of sourceStairs) {
    if (stair.targetX != null && stair.targetY != null) continue;
    const grid = worlds[layerIndex];
    const coverGrid = covers[layerIndex];
    if (!grid) continue;
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[0].length; x++) {
        if (coverGrid && coverGrid[y][x] === T.STAIRS_UP) {
          const sf = features[layerIndex] && features[layerIndex][x + ',' + y];
          if (sf && sf.type === 'stairs' && sf.targetLayer === sourceLayerIdx) {
            stair.targetX = x;
            stair.targetY = y;
          }
        }
      }
    }
  }
}

// ==================== TELEPORT / LAZY LOAD ====================
export function teleportPlayer(layerIndex, x, y, seed) {
  let feat = null;
  if (state.player) {
    const pKey = state.player.x + ',' + state.player.y;
    feat = features[state.player.layer] && features[state.player.layer][pKey];
  }

  if (!layerExists(layerIndex)) {
    generateLayer(layerIndex, seed ?? 42);
  }

  if (x == null || y == null) {
    if (feat && feat.type === 'stairs' && feat.targetX != null && feat.targetY != null) {
      x = feat.targetX;
      y = feat.targetY;
    }
  }

  if (x == null || y == null) {
    const grid = worlds[layerIndex];
    const coverGrid = covers[layerIndex];
    if (grid) {
      const goingDown = state.player && state.player.layer < layerIndex;
      const lookFor = goingDown ? T.STAIRS_UP : T.STAIRS_DOWN;
      let fallbackX = null, fallbackY = null;
      for (let sy = 0; sy < grid.length; sy++) {
        for (let sx = 0; sx < grid[0].length; sx++) {
          if (coverGrid && coverGrid[sy][sx] === lookFor) {
            const sf = features[layerIndex] && features[layerIndex][sx + ',' + sy];
            if (sf && sf.type === 'stairs' &&
                sf.targetLayer === (state.player && state.player.layer)) {
              x = sx; y = sy;
              break;
            }
            if (fallbackX == null) { fallbackX = sx; fallbackY = sy; }
          }
        }
        if (x != null) break;
      }
      if (x == null) { x = fallbackX; y = fallbackY; }
    }
  }

  if (x == null || y == null) {
    const grid = worlds[layerIndex];
    x = x ?? Math.floor((grid ? grid[0].length : W_UNDER) / 2);
    y = y ?? Math.floor((grid ? grid.length : H_UNDER) / 2);
  }

  activateLayer(layerIndex);

  if (state.player) {
    state.player.layer = layerIndex;
    state.player.x = x;
    state.player.y = y;
  }
}
