// ==================== UNDERGROUND & LAVA GENERATION ====================
import { features, covers } from './state.js';
import {
  W_UNDER, H_UNDER, LAYER_SURFACE, LAYER_UNDER,
  ATMOSPHERE, getAtmosphere,
} from './constants.js';
import { T } from './terrain.js';
import { srand, rand, randi } from './rng.js';
import { setFeature } from './world-state.js';
import { ensureCoverGrid, populateMonsters } from './gen-utils.js';

// ==================== BOUNDARY MASK (Multi-Pocket) ====================
export function playableRadius(layerIndex, w, h) {
  const base = Math.min(w, h);
  if (layerIndex === 0) return Math.max(w, h);
  // ~18-21% of base for early layers, ~37-41% for mid, tapering for deep
  if (layerIndex <= 2) return Math.round(base * 0.18 + Math.min(layerIndex, 2) * base * 0.036);
  if (layerIndex <= 5) return Math.round(base * 0.375 + (layerIndex - 3) * base * 0.054);
  return Math.max(Math.round(base * 0.125), Math.round(base * 0.41 - (layerIndex - 5) * base * 0.054));
}

function insidePocket(x, y, pocket) {
  const dx = x - pocket.x, dy = y - pocket.y;
  return dx * dx + dy * dy <= pocket.radius * pocket.radius;
}

function insideAnyPocket(x, y, pockets) {
  for (let i = 0; i < pockets.length; i++) {
    if (insidePocket(x, y, pockets[i])) return true;
  }
  return false;
}

function owningPocket(x, y, pockets) {
  for (let i = 0; i < pockets.length; i++) {
    if (insidePocket(x, y, pockets[i])) return pockets[i];
  }
  return null;
}

function enforceVoidBoundary(grid, w, h, pockets) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!insideAnyPocket(x, y, pockets)) {
        if (grid[y][x] === T.CAVE_WALL) {
          grid[y][x] = T.VOID;
        }
      }
    }
  }
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y][x] !== T.CAVE_WALL) continue;
      if (insideAnyPocket(x, y, pockets)) continue;
      let bordersCarved = false;
      for (let dy = -1; dy <= 1 && !bordersCarved; dy++) {
        for (let dx = -1; dx <= 1 && !bordersCarved; dx++) {
          if (dx === 0 && dy === 0) continue;
          const t = grid[y + dy][x + dx];
          if (t !== T.VOID && t !== T.CAVE_WALL) bordersCarved = true;
        }
      }
      if (!bordersCarved) grid[y][x] = T.VOID;
    }
  }
}

function enforceVoidBoundaryPreservingCorridors(grid, w, h, pockets) {
  enforceVoidBoundary(grid, w, h, pockets);
}

function insideBoundary(x, y, cx, cy, radius) {
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function clampToBoundary(x, y, cx, cy, radius, w, h){
  let px = x, py = y;
  px = Math.max(1, Math.min(w - 2, px));
  py = Math.max(1, Math.min(h - 2, py));
  let safety = 200;
  while (!insideBoundary(px, py, cx, cy, radius) && safety-- > 0){
    if (px > cx) px--; else if (px < cx) px++;
    if (py > cy) py--; else if (py < cy) py++;
  }
  return { x: px, y: py };
}

function clampToBoundaryPocket(x, y, pocket, w, h) {
  let px = Math.max(2, Math.min(w - 3, x));
  let py = Math.max(2, Math.min(h - 3, y));
  let safety = 200;
  while (!insidePocket(px, py, pocket) && safety-- > 0) {
    if (px > pocket.x) px--; else if (px < pocket.x) px++;
    if (py > pocket.y) py--; else if (py < pocket.y) py++;
  }
  return { x: px, y: py };
}

function findCaveNear(grid, tx, ty, w, h, cx, cy, radius){
  for (let r = 0; r < Math.max(w, h); r++){
    for (let dy = -r; dy <= r; dy++){
      for (let dx = -r; dx <= r; dx++){
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        if (!insideBoundary(x, y, cx, cy, radius)) continue;
        if (grid[y][x] === T.CAVE_FLOOR) return { x, y };
      }
    }
  }
  const fx = Math.max(1, Math.min(w - 2, tx));
  const fy = Math.max(1, Math.min(h - 2, ty));
  grid[fy][fx] = T.CAVE_FLOOR;
  return { x: fx, y: fy };
}

// ==================== CAVE CARVING ====================
function carveBoundedPath(grid, w, h, x1, y1, x2, y2, cx, cy, radius){
  let x = x1, y = y1;
  let steps = 0;
  const maxSteps = w * h;
  while ((x !== x2 || y !== y2) && steps < maxSteps){
    steps++;
    if (x >= 1 && y >= 1 && x < w - 1 && y < h - 1){
      if (grid[y][x] === T.CAVE_WALL) grid[y][x] = T.CAVE_FLOOR;
    }
    if (rand() < 0.15){
      const perp = rand() < 0.5 ? 1 : -1;
      if (Math.abs(x2 - x) > Math.abs(y2 - y)) y += perp;
      else x += perp;
    } else {
      if (rand() < 0.5){
        if (x < x2) x++; else if (x > x2) x--;
      } else {
        if (y < y2) y++; else if (y > y2) y--;
      }
    }
    x = Math.max(1, Math.min(w - 2, x));
    y = Math.max(1, Math.min(h - 2, y));
    if (!insideBoundary(x, y, cx, cy, radius)){
      if (x > cx) x--; else x++;
      if (y > cy) y--; else y++;
    }
  }
  if (x2 >= 1 && y2 >= 1 && x2 < w - 1 && y2 < h - 1){
    if (grid[y2][x2] === T.CAVE_WALL) grid[y2][x2] = T.CAVE_FLOOR;
  }
}

function carveBoundedPathMulti(grid, w, h, x1, y1, x2, y2, pockets){
  let x = x1, y = y1;
  let steps = 0;
  const maxSteps = w * h;
  while ((x !== x2 || y !== y2) && steps < maxSteps){
    steps++;
    if (x >= 1 && y >= 1 && x < w - 1 && y < h - 1){
      if (grid[y][x] === T.CAVE_WALL) grid[y][x] = T.CAVE_FLOOR;
    }
    if (rand() < 0.15){
      const perp = rand() < 0.5 ? 1 : -1;
      if (Math.abs(x2 - x) > Math.abs(y2 - y)) y += perp;
      else x += perp;
    } else {
      if (rand() < 0.5){
        if (x < x2) x++; else if (x > x2) x--;
      } else {
        if (y < y2) y++; else if (y > y2) y--;
      }
    }
    x = Math.max(1, Math.min(w - 2, x));
    y = Math.max(1, Math.min(h - 2, y));
  }
  if (x2 >= 1 && y2 >= 1 && x2 < w - 1 && y2 < h - 1){
    if (grid[y2][x2] === T.CAVE_WALL) grid[y2][x2] = T.CAVE_FLOOR;
  }
}

function carveInterPocketPaths(grid, w, h, pockets, entrancePositions) {
  if (entrancePositions.length <= 1) return;

  const indices = entrancePositions.map((_, i) => i);
  const visited = new Set([0]);
  const order = [0];
  while (order.length < indices.length) {
    const last = order[order.length - 1];
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < indices.length; i++) {
      if (visited.has(i)) continue;
      const dx = entrancePositions[i].x - entrancePositions[last].x;
      const dy = entrancePositions[i].y - entrancePositions[last].y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    visited.add(bestIdx);
    order.push(bestIdx);
  }

  for (let i = 0; i < order.length - 1; i++) {
    const a = entrancePositions[order[i]];
    const b = entrancePositions[order[i + 1]];
    carveNarrowCorridor(grid, w, h, a.x, a.y, b.x, b.y);
  }
}

function carveNarrowCorridor(grid, w, h, x1, y1, x2, y2) {
  let x = x1, y = y1;
  let steps = 0;
  const maxSteps = w * h;
  while ((x !== x2 || y !== y2) && steps < maxSteps) {
    steps++;
    if (x >= 1 && y >= 1 && x < w - 1 && y < h - 1) {
      if (grid[y][x] === T.CAVE_WALL) grid[y][x] = T.CAVE_FLOOR;
      if (rand() < 0.3) {
        const sx = rand() < 0.5 ? 1 : -1;
        const sy = rand() < 0.5 ? 1 : -1;
        const nx = x + sx, ny = y + sy;
        if (nx >= 1 && ny >= 1 && nx < w - 1 && ny < h - 1) {
          if (grid[ny][nx] === T.CAVE_WALL) grid[ny][nx] = T.CAVE_FLOOR;
        }
      }
    }
    if (rand() < 0.10) {
      const perp = rand() < 0.5 ? 1 : -1;
      if (Math.abs(x2 - x) > Math.abs(y2 - y)) y += perp;
      else x += perp;
    } else {
      if (rand() < 0.5) {
        if (x < x2) x++; else if (x > x2) x--;
      } else {
        if (y < y2) y++; else if (y > y2) y--;
      }
    }
    x = Math.max(1, Math.min(w - 2, x));
    y = Math.max(1, Math.min(h - 2, y));
  }
}

// ==================== BIOME LEAKAGE ====================
// Biome leakage — uses atmosphere fields instead of sampling surface tiles
function applyBiomeLeakageMulti(grid, coverGrid, w, h, pockets){
  if (!ATMOSPHERE.w) return;  // no atmosphere data yet

  for (let y = 1; y < h - 1; y++){
    for (let x = 1; x < w - 1; x++){
      if (grid[y][x] !== T.CAVE_FLOOR) continue;
      if (!insideAnyPocket(x, y, pockets)) continue;

      // Sample atmosphere at this coordinate (surface position maps directly)
      const atmo = getAtmosphere(x, y);

      // Determine dominant surface characteristic
      const isFungal  = atmo.fungal > 0.30;
      const isDry     = atmo.moisture < 0.25;
      const isWet     = atmo.moisture > 0.65;

      const maxSignal = Math.max(
        isFungal ? atmo.fungal : 0,
        isDry    ? (1 - atmo.moisture) : 0,
        isWet    ? atmo.moisture : 0,
      );
      if (maxSignal < 0.15) continue;

      const prob = Math.min(0.8, maxSignal * 1.4);
      if (rand() >= prob) continue;

      if (isFungal && atmo.fungal >= (1 - atmo.moisture) && atmo.fungal >= atmo.moisture){
        // Mushroom leakage: cave floor ground + mushroom cover
        grid[y][x] = T.CAVE_FLOOR;
        coverGrid[y][x] = T.MUSHFOREST;
      } else if (isDry && (1 - atmo.moisture) >= atmo.moisture){
        grid[y][x] = T.SAND;
      } else if (isWet){
        grid[y][x] = T.UWATER;
      }
    }
  }
}

function applyBiomeLeakage(grid, w, h, cx, cy, radius){
  const coverGrid = covers[LAYER_UNDER] || [];
  applyBiomeLeakageMulti(grid, coverGrid, w, h, [{ x: cx, y: cy, radius }]);
}

// ==================== UNDERGROUND ====================
export function makeUnderground(seed, layerIndex, pockets, sourceStairs){
  const li = layerIndex ?? LAYER_UNDER;
  srand(seed + 7777);
  const w = W_UNDER, h = H_UNDER;
  const grid = [];
  for (let y = 0; y < h; y++){
    const row = [];
    for (let x = 0; x < w; x++) row.push(T.CAVE_WALL);
    grid.push(row);
  }

  // Initialize cover grid
  const coverGrid = ensureCoverGrid(li, w, h);

  for (const p of pockets) {
    p.x = Math.max(2, Math.min(w - 3, p.x));
    p.y = Math.max(2, Math.min(h - 3, p.y));
  }

  const entrancePositions = pockets.map(p => ({ x: p.x, y: p.y }));

  const nextLayer = li + 1;
  let exitPos = null;

  for (const lk of Object.keys(features)) {
    const layerFeats = features[lk];
    if (!layerFeats) continue;
    for (const fk of Object.keys(layerFeats)) {
      const f = layerFeats[fk];
      if (!f || f.targetLayer !== nextLayer) continue;
      let fx, fy;
      if (f.sourceX != null && f.sourceY != null) {
        fx = f.sourceX; fy = f.sourceY;
      } else {
        const parts = fk.split(',').map(Number);
        fx = parts[0]; fy = parts[1];
      }
      if (!exitPos || Number(lk) === LAYER_SURFACE) {
        exitPos = {
          x: Math.max(2, Math.min(w - 3, fx)),
          y: Math.max(2, Math.min(h - 3, fy)),
        };
      }
    }
  }

  if (!exitPos) {
    const baseDist = Math.max(4, Math.round(Math.min(w, h) * 0.071));
    const fallbackDist = baseDist + Math.floor(rand() * Math.max(2, Math.round(baseDist * 0.6)));
    const angle = rand() * Math.PI * 2;
    exitPos = {
      x: Math.max(2, Math.min(w - 3, Math.round(entrancePositions[0].x + Math.cos(angle) * fallbackDist))),
      y: Math.max(2, Math.min(h - 3, Math.round(entrancePositions[0].y + Math.sin(angle) * fallbackDist))),
    };
  }

  for (const ep of entrancePositions) {
    grid[ep.y][ep.x] = T.CAVE_FLOOR;
  }
  grid[exitPos.y][exitPos.x] = T.CAVE_FLOOR;

  const totalPocketArea = pockets.reduce((sum, p) => sum + Math.PI * p.radius * p.radius, 0);
  const totalBudget = Math.floor(totalPocketArea * 0.45);
  let carved = entrancePositions.length + 1;
  const walkersPerPocket = Math.max(3, Math.floor(8 / pockets.length));

  for (let pi = 0; pi < pockets.length && carved < totalBudget; pi++) {
    const pocket = pockets[pi];
    const entrance = entrancePositions[pi];
    const pocketBudget = Math.floor(totalBudget / pockets.length);

    for (let wi = 0; wi < walkersPerPocket && carved < totalBudget; wi++) {
      let wx = entrance.x + randi(3) - 1;
      let wy = entrance.y + randi(3) - 1;
      const walkerBudget = Math.floor(pocketBudget / walkersPerPocket) + randi(20);

      for (let step = 0; step < walkerBudget && carved < totalBudget; step++) {
        if (wx >= 1 && wy >= 1 && wx < w - 1 && wy < h - 1 &&
            insidePocket(wx, wy, pocket)) {
          if (grid[wy][wx] === T.CAVE_WALL) {
            grid[wy][wx] = T.CAVE_FLOOR;
            carved++;
          }
        }
        const dir = randi(4);
        if (dir === 0) wx++;
        else if (dir === 1) wx--;
        else if (dir === 2) wy++;
        else wy--;
        wx = Math.max(1, Math.min(w - 2, wx));
        wy = Math.max(1, Math.min(h - 2, wy));
        if (!insidePocket(wx, wy, pocket)) {
          if (wx > pocket.x) wx--; else wx++;
          if (wy > pocket.y) wy--; else wy++;
        }
      }
    }
  }

  // Cellular Automata smoothing
  const protectedSet = new Set();
  for (const ep of entrancePositions) protectedSet.add(ep.x + ',' + ep.y);
  protectedSet.add(exitPos.x + ',' + exitPos.y);

  for (let pass = 0; pass < 2; pass++){
    const copy = grid.map(r => r.slice());
    for (let y = 2; y < h - 2; y++){
      for (let x = 2; x < w - 2; x++){
        if (!insideAnyPocket(x, y, pockets)) continue;
        if (protectedSet.has(x + ',' + y)) continue;
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++){
          for (let dx = -1; dx <= 1; dx++){
            if (dx === 0 && dy === 0) continue;
            if (copy[y + dy][x + dx] === T.CAVE_WALL) walls++;
          }
        }
        if (copy[y][x] === T.CAVE_WALL && walls <= 3) grid[y][x] = T.CAVE_FLOOR;
        if (copy[y][x] === T.CAVE_FLOOR && walls >= 6) grid[y][x] = T.CAVE_WALL;
      }
    }
  }

  carveInterPocketPaths(grid, w, h, pockets, entrancePositions);

  // Place staircase cover + features
  for (let pi = 0; pi < pockets.length; pi++) {
    const ep = entrancePositions[pi];
    grid[ep.y][ep.x] = T.CAVE_FLOOR;     // ground stays cave floor
    coverGrid[ep.y][ep.x] = T.STAIRS_UP;  // stairs as cover

    const src = sourceStairs[pi];
    const retLayer = src ? src.sourceLayerIdx : Math.max(0, li - 1);
    const retX = src ? src.stair.sourceX : null;
    const retY = src ? src.stair.sourceY : null;
    setFeature(li, ep.x, ep.y, {
      type: 'stairs', dir: 'up',
      targetLayer: retLayer,
      targetX: retX, targetY: retY,
      label: 'Stairs lead back up.',
    });
  }

  grid[exitPos.y][exitPos.x] = T.CAVE_FLOOR;
  coverGrid[exitPos.y][exitPos.x] = T.STAIRS_DOWN;
  setFeature(li, exitPos.x, exitPos.y, {
    type: 'stairs', dir: 'down',
    targetLayer: li + 1,
    targetX: exitPos.x, targetY: exitPos.y,
    sourceX: exitPos.x, sourceY: exitPos.y,
    label: 'The stairs descend further into darkness.',
  });

  for (const ep of entrancePositions) {
    carveBoundedPathMulti(grid, w, h, ep.x, ep.y, exitPos.x, exitPos.y, pockets);
  }

  applyBiomeLeakageMulti(grid, coverGrid, w, h, pockets);

  enforceVoidBoundary(grid, w, h, pockets);

  populateMonsters(grid, li);

  return grid;
}

// ==================== LAVA LAYER ====================
export function makeLavaLayer(seed, layerIndex, pockets, sourceStairs){
  srand(seed + 13331);
  const w = W_UNDER, h = H_UNDER;
  const grid = [];
  for (let y = 0; y < h; y++){
    const row = [];
    for (let x = 0; x < w; x++) row.push(T.CAVE_WALL);
    grid.push(row);
  }

  const coverGrid = ensureCoverGrid(layerIndex, w, h);

  for (const p of pockets) {
    p.x = Math.max(2, Math.min(w - 3, p.x));
    p.y = Math.max(2, Math.min(h - 3, p.y));
  }

  const entrancePositions = pockets.map(p => ({ x: p.x, y: p.y }));

  const nextLayer = layerIndex + 1;
  let exitPos = null;

  for (const lk of Object.keys(features)) {
    const layerFeats = features[lk];
    if (!layerFeats) continue;
    for (const fk of Object.keys(layerFeats)) {
      const f = layerFeats[fk];
      if (!f || f.targetLayer !== nextLayer) continue;
      let fx, fy;
      if (f.sourceX != null && f.sourceY != null) {
        fx = f.sourceX; fy = f.sourceY;
      } else {
        const parts = fk.split(',').map(Number);
        fx = parts[0]; fy = parts[1];
      }
      if (!exitPos || Number(lk) === LAYER_SURFACE) {
        exitPos = {
          x: Math.max(2, Math.min(w - 3, fx)),
          y: Math.max(2, Math.min(h - 3, fy)),
        };
      }
    }
  }

  if (!exitPos) {
    const baseDist = Math.max(4, Math.round(Math.min(w, h) * 0.071));
    const fallbackDist = baseDist + Math.floor(rand() * Math.max(2, Math.round(baseDist * 0.6)));
    const angle = rand() * Math.PI * 2;
    exitPos = {
      x: Math.max(2, Math.min(w - 3, Math.round(entrancePositions[0].x + Math.cos(angle) * fallbackDist))),
      y: Math.max(2, Math.min(h - 3, Math.round(entrancePositions[0].y + Math.sin(angle) * fallbackDist))),
    };
  }

  for (const ep of entrancePositions) grid[ep.y][ep.x] = T.CAVE_FLOOR;
  grid[exitPos.y][exitPos.x] = T.CAVE_FLOOR;

  const totalPocketArea = pockets.reduce((sum, p) => sum + Math.PI * p.radius * p.radius, 0);
  const totalBudget = Math.floor(totalPocketArea * 0.38);
  let carved = entrancePositions.length + 1;
  const walkersPerPocket = Math.max(3, Math.floor(7 / pockets.length));

  for (let pi = 0; pi < pockets.length && carved < totalBudget; pi++) {
    const pocket = pockets[pi];
    const entrance = entrancePositions[pi];
    const pocketBudget = Math.floor(totalBudget / pockets.length);

    for (let wi = 0; wi < walkersPerPocket && carved < totalBudget; wi++) {
      let wx = entrance.x + randi(3) - 1;
      let wy = entrance.y + randi(3) - 1;
      const walkerBudget = Math.floor(pocketBudget / walkersPerPocket) + randi(15);

      for (let step = 0; step < walkerBudget && carved < totalBudget; step++) {
        if (wx >= 1 && wy >= 1 && wx < w - 1 && wy < h - 1 &&
            insidePocket(wx, wy, pocket)) {
          if (grid[wy][wx] === T.CAVE_WALL) {
            grid[wy][wx] = T.CAVE_FLOOR;
            carved++;
          }
        }
        const dir = randi(4);
        if (dir === 0) wx++; else if (dir === 1) wx--;
        else if (dir === 2) wy++; else wy--;
        wx = Math.max(1, Math.min(w - 2, wx));
        wy = Math.max(1, Math.min(h - 2, wy));
        if (!insidePocket(wx, wy, pocket)) {
          if (wx > pocket.x) wx--; else wx++;
          if (wy > pocket.y) wy--; else wy++;
        }
      }
    }
  }

  const protectedSet = new Set();
  for (const ep of entrancePositions) protectedSet.add(ep.x + ',' + ep.y);
  protectedSet.add(exitPos.x + ',' + exitPos.y);

  for (let pass = 0; pass < 2; pass++){
    const copy = grid.map(r => r.slice());
    for (let y = 2; y < h - 2; y++){
      for (let x = 2; x < w - 2; x++){
        if (!insideAnyPocket(x, y, pockets)) continue;
        if (protectedSet.has(x + ',' + y)) continue;
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++){
            if (dx === 0 && dy === 0) continue;
            if (copy[y + dy][x + dx] === T.CAVE_WALL) walls++;
          }
        if (copy[y][x] === T.CAVE_WALL && walls <= 3) grid[y][x] = T.CAVE_FLOOR;
        if (copy[y][x] === T.CAVE_FLOOR && walls >= 6) grid[y][x] = T.CAVE_WALL;
      }
    }
  }

  carveInterPocketPaths(grid, w, h, pockets, entrancePositions);

  // Lava pools
  for (let pi = 0; pi < pockets.length; pi++) {
    const pocket = pockets[pi];
    const poolCount = Math.max(3, Math.floor(10 / pockets.length));
    for (let i = 0; i < poolCount; i++) {
      const lx = pocket.x + randi(pocket.radius) - Math.floor(pocket.radius / 2);
      const ly = pocket.y + randi(pocket.radius) - Math.floor(pocket.radius / 2);
      const rx = 3 + randi(4), ry = 2 + randi(3);
      for (let dy = -ry; dy <= ry; dy++){
        for (let dx = -rx; dx <= rx; dx++){
          if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue;
          const px = lx + dx, py = ly + dy;
          if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue;
          if (!insideAnyPocket(px, py, pockets)) continue;
          if (protectedSet.has(px + ',' + py)) continue;
          if (grid[py][px] === T.CAVE_FLOOR && rand() < 0.85) grid[py][px] = T.LAVA;
        }
      }
    }
  }

  // Staircases as cover
  for (let pi = 0; pi < pockets.length; pi++) {
    const ep = entrancePositions[pi];
    grid[ep.y][ep.x] = T.CAVE_FLOOR;
    coverGrid[ep.y][ep.x] = T.STAIRS_UP;

    const src = sourceStairs[pi];
    const retLayer = src ? src.sourceLayerIdx : Math.max(0, layerIndex - 1);
    const retX = src ? src.stair.sourceX : null;
    const retY = src ? src.stair.sourceY : null;
    setFeature(layerIndex, ep.x, ep.y, {
      type: 'stairs', dir: 'up',
      targetLayer: retLayer,
      targetX: retX, targetY: retY,
      label: 'Stairs lead back up.',
    });
  }

  grid[exitPos.y][exitPos.x] = T.CAVE_FLOOR;
  coverGrid[exitPos.y][exitPos.x] = T.STAIRS_DOWN;
  setFeature(layerIndex, exitPos.x, exitPos.y, {
    type: 'stairs', dir: 'down',
    targetLayer: layerIndex + 1,
    targetX: exitPos.x, targetY: exitPos.y,
    sourceX: exitPos.x, sourceY: exitPos.y,
    label: 'The stairs descend into searing heat.',
  });

  for (const ep of entrancePositions) {
    carveBoundedPathMulti(grid, w, h, ep.x, ep.y, exitPos.x, exitPos.y, pockets);
  }

  enforceVoidBoundaryPreservingCorridors(grid, w, h, pockets);

  populateMonsters(grid, layerIndex);

  return grid;
}

// ==================== CORRIDOR UTILITIES ====================
export function carveCorridors(grid, w, h){
  const mx = Math.max(1, Math.round(w * 0.054));  // ~6 at w=112
  const my = Math.max(1, Math.round(h * 0.054));
  const pts = [[mx,my],[w-1-mx,my],[mx,h-1-my],[w-1-mx,h-1-my],[w>>1,h>>1]];
  for (let i=0;i<pts.length-1;i++){
    carveBetween(grid, w, h, pts[i][0], pts[i][1], pts[i+1][0], pts[i+1][1]);
  }
}
export function carveBetween(grid, w, h, x1, y1, x2, y2){
  let x=x1, y=y1;
  while (x !== x2 || y !== y2){
    if (x>=0&&y>=0&&x<w&&y<h){
      if (grid[y][x] !== T.LAVA && grid[y][x] !== T.UWATER) grid[y][x] = T.CAVE_FLOOR;
    }
    if (x<x2) x++; else if (x>x2) x--;
    if (rand()<0.5) continue;
    if (y<y2) y++; else if (y>y2) y--;
  }
}
