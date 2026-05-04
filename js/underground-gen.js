// ==================== UNDERGROUND & LAVA GENERATION ====================
import { features, covers } from './state.js';
import {
  W_UNDER, H_UNDER, LAYER_SURFACE, LAYER_UNDER,
  ATMOSPHERE, getAtmosphere,
} from './constants.js';
import { T, isCoverAllowedOnGround } from './terrain.js';
import { srand, rand, randi } from './rng.js';
import { setFeature } from './world-state.js';
import { ensureCoverGrid, populateMonsters } from './gen-utils.js';

// ==================== PLAYABLE RADIUS (kept for API compat) ====================
// No longer constrains generation — the whole floor is playable.
export function playableRadius(layerIndex, w, h) {
  return Math.max(w, h); // effectively infinite — whole grid is valid
}

// ==================== CHAMBER-AND-TUNNEL GENERATION ====================

// Generate an irregular chamber by carving a noisy ellipse.
// Returns number of newly carved tiles.
function carveChamber(grid, w, h, cx, cy, radius) {
  const wobbleCount = 5 + randi(4);       // 5-8 lobes
  const wobbleAmps = [];
  for (let i = 0; i < wobbleCount; i++) {
    wobbleAmps.push(0.15 + rand() * 0.30); // 15-45% amplitude variation
  }
  const wobblePhases = [];
  for (let i = 0; i < wobbleCount; i++) {
    wobblePhases.push(rand() * Math.PI * 2);
  }
  // Slight elliptical stretch
  const stretchX = 0.8 + rand() * 0.4;
  const stretchY = 0.8 + rand() * 0.4;

  const margin = Math.ceil(radius * 1.3);
  let carved = 0;

  for (let dy = -margin; dy <= margin; dy++) {
    for (let dx = -margin; dx <= margin; dx++) {
      const px = cx + dx, py = cy + dy;
      if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue;

      const sx = dx / stretchX, sy = dy / stretchY;
      const dist = Math.sqrt(sx * sx + sy * sy);
      if (dist < 0.01) {
        if (grid[py][px] === T.CAVE_WALL) { grid[py][px] = T.CAVE_FLOOR; carved++; }
        continue;
      }

      const angle = Math.atan2(dy, dx);
      let localR = radius;
      for (let i = 0; i < wobbleCount; i++) {
        localR += radius * wobbleAmps[i] * Math.cos((i + 1) * angle + wobblePhases[i]);
      }
      localR = Math.max(radius * 0.4, localR);

      if (dist <= localR) {
        if (grid[py][px] === T.CAVE_WALL) { grid[py][px] = T.CAVE_FLOOR; carved++; }
      }
    }
  }
  return carved;
}

// Carve a winding tunnel between two points, 2-3 tiles wide
function carveTunnel(grid, w, h, x1, y1, x2, y2) {
  let x = x1, y = y1;
  const maxSteps = (Math.abs(x2 - x1) + Math.abs(y2 - y1)) * 3 + 100;
  let steps = 0;
  const baseWidth = 1 + (rand() < 0.6 ? 1 : 0); // most tunnels are 2 wide

  while ((x !== x2 || y !== y2) && steps < maxSteps) {
    steps++;

    for (let wd = -baseWidth; wd <= baseWidth; wd++) {
      const goingHoriz = Math.abs(x2 - x) >= Math.abs(y2 - y);
      const px = goingHoriz ? x : x + wd;
      const py = goingHoriz ? y + wd : y;
      if (px >= 1 && py >= 1 && px < w - 1 && py < h - 1) {
        if (grid[py][px] === T.CAVE_WALL) grid[py][px] = T.CAVE_FLOOR;
      }
    }

    if (rand() < 0.20) {
      const perp = rand() < 0.5 ? 1 : -1;
      if (Math.abs(x2 - x) >= Math.abs(y2 - y)) {
        y += perp;
      } else {
        x += perp;
      }
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

  if (x2 >= 1 && y2 >= 1 && x2 < w - 1 && y2 < h - 1) {
    if (grid[y2][x2] === T.CAVE_WALL) grid[y2][x2] = T.CAVE_FLOOR;
  }
}

// Scatter chambers across the full grid, ensuring staircases land in chambers.
// Returns array of { cx, cy, radius }.
function generateChambers(grid, w, h, entrancePositions, exitPos) {
  const chambers = [];

  // 1. Mandatory chambers at staircase positions
  for (const ep of entrancePositions) {
    const r = 5 + randi(4); // 5-8 radius for entrance chambers
    carveChamber(grid, w, h, ep.x, ep.y, r);
    chambers.push({ cx: ep.x, cy: ep.y, radius: r });
  }
  {
    const r = 5 + randi(4);
    carveChamber(grid, w, h, exitPos.x, exitPos.y, r);
    chambers.push({ cx: exitPos.x, cy: exitPos.y, radius: r });
  }

  // 2. Target ~25% of total area from chambers (tunnels add ~8-12% more)
  const totalTiles = (w - 2) * (h - 2); // exclude border
  const targetChamberTiles = Math.floor(totalTiles * (0.20 + rand() * 0.06));

  let estimatedCarved = 0;
  for (const ch of chambers) {
    estimatedCarved += Math.PI * ch.radius * ch.radius * 0.65;
  }

  // Size categories
  const sizes = [
    { min: 4, max: 6,  weight: 4 },   // small — most common
    { min: 8, max: 12, weight: 3 },   // medium
    { min: 14, max: 18, weight: 1 },  // large / arena
  ];

  // Place chambers until we hit the target
  let placementAttempts = 0;
  const maxAttempts = 600;

  while (estimatedCarved < targetChamberTiles && placementAttempts < maxAttempts) {
    placementAttempts++;

    // Random position within the grid (margin of 3 from edges)
    const cx = 3 + randi(w - 6);
    const cy = 3 + randi(h - 6);

    // Pick size category (weighted random)
    const totalWeight = sizes.reduce((s, c) => s + c.weight, 0);
    let roll = rand() * totalWeight;
    let sizeCategory = sizes[0];
    for (const sc of sizes) {
      roll -= sc.weight;
      if (roll <= 0) { sizeCategory = sc; break; }
    }
    const radius = sizeCategory.min + randi(sizeCategory.max - sizeCategory.min + 1);

    // Ensure min distance from existing chambers (avoid total overlap)
    let tooClose = false;
    for (const ch of chambers) {
      const dx = cx - ch.cx, dy = cy - ch.cy;
      const minDist = (radius + ch.radius) * 0.45;
      if (dx * dx + dy * dy < minDist * minDist) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    // Ensure chamber fits within grid
    if (cx - radius < 1 || cy - radius < 1 || cx + radius >= w - 1 || cy + radius >= h - 1) continue;

    const carved = carveChamber(grid, w, h, cx, cy, radius);
    chambers.push({ cx, cy, radius });
    estimatedCarved += carved;
  }

  // 3. Force 2-3 arena chambers (radius 16-20) if none were placed large enough
  const arenaCount = 2 + randi(2); // 2-3
  let arenasPlaced = chambers.filter(c => c.radius >= 14).length;
  let arenaAttempts = 0;
  while (arenasPlaced < arenaCount && arenaAttempts < 100) {
    arenaAttempts++;
    const radius = 16 + randi(5); // 16-20
    const cx = radius + 3 + randi(w - 2 * radius - 6);
    const cy = radius + 3 + randi(h - 2 * radius - 6);

    let tooClose = false;
    for (const ch of chambers) {
      const dx = cx - ch.cx, dy = cy - ch.cy;
      const minDist = (radius + ch.radius) * 0.5;
      if (dx * dx + dy * dy < minDist * minDist) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;

    carveChamber(grid, w, h, cx, cy, radius);
    chambers.push({ cx, cy, radius });
    arenasPlaced++;
  }

  return chambers;
}

// Build a connectivity graph and carve tunnels (MST + extra loops + dead-end spurs)
function connectChambers(grid, w, h, chambers) {
  if (chambers.length <= 1) return;

  const n = chambers.length;
  const edges = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = chambers[i].cx - chambers[j].cx;
      const dy = chambers[i].cy - chambers[j].cy;
      edges.push({ i, j, dist: Math.sqrt(dx * dx + dy * dy) });
    }
  }
  edges.sort((a, b) => a.dist - b.dist);

  // Kruskal's MST
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
  function union(a, b) { parent[find(a)] = find(b); }

  const mstEdges = [];
  for (const e of edges) {
    if (find(e.i) !== find(e.j)) {
      union(e.i, e.j);
      mstEdges.push(e);
    }
  }

  // Extra edges for loops (~20% of remaining short edges)
  const extraEdges = [];
  for (const e of edges) {
    if (mstEdges.includes(e)) continue;
    if (rand() < 0.18) {
      extraEdges.push(e);
    }
    if (extraEdges.length >= Math.max(3, Math.floor(n * 0.25))) break;
  }

  const allEdges = [...mstEdges, ...extraEdges];

  // Carve tunnels along each edge
  for (const e of allEdges) {
    const a = chambers[e.i], b = chambers[e.j];
    const dx = b.cx - a.cx, dy = b.cy - a.cy;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const aEdgeX = Math.round(a.cx + (dx / dist) * a.radius * 0.6);
    const aEdgeY = Math.round(a.cy + (dy / dist) * a.radius * 0.6);
    const bEdgeX = Math.round(b.cx - (dx / dist) * b.radius * 0.6);
    const bEdgeY = Math.round(b.cy - (dy / dist) * b.radius * 0.6);

    carveTunnel(grid, w, h, aEdgeX, aEdgeY, bEdgeX, bEdgeY);
  }

  // Dead-end spurs for exploration interest
  const spurCount = Math.max(2, Math.floor(n * 0.2));
  for (let s = 0; s < spurCount; s++) {
    const src = chambers[randi(chambers.length)];
    const angle = rand() * Math.PI * 2;
    const spurLen = 8 + randi(16);
    const ex = Math.round(src.cx + Math.cos(angle) * (src.radius + spurLen));
    const ey = Math.round(src.cy + Math.sin(angle) * (src.radius + spurLen));
    if (ex < 2 || ey < 2 || ex >= w - 2 || ey >= h - 2) continue;
    carveTunnel(grid, w, h, src.cx, src.cy, ex, ey);
    // Small nook at the end of the spur
    if (rand() < 0.5) {
      carveChamber(grid, w, h, ex, ey, 2 + randi(3));
    }
  }
}

// Cellular automata smoothing — removes jagged edges, fills isolated pockets
function smoothCaves(grid, w, h, protectedSet, passes) {
  for (let pass = 0; pass < passes; pass++) {
    const copy = grid.map(r => r.slice());
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        if (protectedSet.has(x + ',' + y)) continue;
        let walls = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (copy[y + dy][x + dx] === T.CAVE_WALL) walls++;
          }
        }
        if (copy[y][x] === T.CAVE_WALL && walls <= 2) grid[y][x] = T.CAVE_FLOOR;
        if (copy[y][x] === T.CAVE_FLOOR && walls >= 7) grid[y][x] = T.CAVE_WALL;
      }
    }
  }
}

// Verify staircase tiles are carved — safety net
function ensureStairTilesCarved(grid, w, h, positions) {
  for (const pos of positions) {
    const x = pos.x, y = pos.y;
    if (x >= 0 && y >= 0 && x < w && y < h) {
      grid[y][x] = T.CAVE_FLOOR;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 1 && ny >= 1 && nx < w - 1 && ny < h - 1) {
            if (grid[ny][nx] === T.CAVE_WALL) grid[ny][nx] = T.CAVE_FLOOR;
          }
        }
      }
    }
  }
}

// ==================== BIOME LEAKAGE ====================
function applyBiomeLeakage(grid, coverGrid, w, h) {
  if (!ATMOSPHERE.w) return;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (grid[y][x] !== T.CAVE_FLOOR) continue;

      const atmo = getAtmosphere(x, y);

      const isFungal = atmo.fungal > 0.30;
      const isDry    = atmo.moisture < 0.25;
      const isWet    = atmo.moisture > 0.65;

      const maxSignal = Math.max(
        isFungal ? atmo.fungal : 0,
        isDry    ? (1 - atmo.moisture) : 0,
        isWet    ? atmo.moisture : 0,
      );
      if (maxSignal < 0.15) continue;

      const prob = Math.min(0.8, maxSignal * 1.4);
      if (rand() >= prob) continue;

      if (isFungal && atmo.fungal >= (1 - atmo.moisture) && atmo.fungal >= atmo.moisture) {
        if (isCoverAllowedOnGround(T.CAVE_FLOOR, T.MUSHFOREST)) {
          grid[y][x] = T.CAVE_FLOOR;
          coverGrid[y][x] = T.MUSHFOREST;
        }
      } else if (isDry && (1 - atmo.moisture) >= atmo.moisture) {
        grid[y][x] = T.SAND;
      } else if (isWet) {
        grid[y][x] = T.UWATER;
      }
    }
  }
}

// ==================== EXIT PLACEMENT ====================
// Place exit stairs far from entrance — at least 55% of diagonal distance
function placeExitFarFromEntrance(w, h, entrancePositions) {
  const ep = entrancePositions[0];
  const diagDist = Math.sqrt(w * w + h * h);
  const minDist = diagDist * 0.55;
  const margin = 6;

  let bestExit = null;
  let bestDist = 0;

  for (let attempt = 0; attempt < 60; attempt++) {
    const ex = margin + randi(w - 2 * margin);
    const ey = margin + randi(h - 2 * margin);
    const dx = ex - ep.x, dy = ey - ep.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > bestDist) {
      bestDist = dist;
      bestExit = { x: ex, y: ey };
      if (dist >= minDist) break;
    }
  }

  if (!bestExit) {
    // Fallback: opposite corner from entrance
    bestExit = {
      x: ep.x < w / 2 ? w - margin : margin,
      y: ep.y < h / 2 ? h - margin : margin,
    };
  }

  return bestExit;
}

// ==================== UNDERGROUND ====================
export function makeUnderground(seed, layerIndex, pockets, sourceStairs) {
  const li = layerIndex ?? LAYER_UNDER;
  srand(seed + 7777);
  const w = W_UNDER, h = H_UNDER;
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(T.CAVE_WALL);
    grid.push(row);
  }

  const coverGrid = ensureCoverGrid(li, w, h);

  // --- Entrance positions (from pockets/sourceStairs, clamped to grid) ---
  const entrancePositions = pockets.map(p => ({
    x: Math.max(4, Math.min(w - 5, p.x)),
    y: Math.max(4, Math.min(h - 5, p.y)),
  }));

  // Fallback: if no entrance, center of grid
  if (entrancePositions.length === 0) {
    entrancePositions.push({ x: Math.floor(w / 2), y: Math.floor(h / 2) });
  }

  // --- Locate exit stairs (stairs down to next layer) ---
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
          x: Math.max(4, Math.min(w - 5, fx)),
          y: Math.max(4, Math.min(h - 5, fy)),
        };
      }
    }
  }

  if (!exitPos) {
    exitPos = placeExitFarFromEntrance(w, h, entrancePositions);
  }

  // --- Generate chamber-and-tunnel network ---
  const chambers = generateChambers(grid, w, h, entrancePositions, exitPos);
  connectChambers(grid, w, h, chambers);

  // --- Cellular automata smoothing (2 passes) ---
  const protectedSet = new Set();
  for (const ep of entrancePositions) protectedSet.add(ep.x + ',' + ep.y);
  protectedSet.add(exitPos.x + ',' + exitPos.y);

  smoothCaves(grid, w, h, protectedSet, 2);

  // --- Ensure staircase tiles are walkable after smoothing ---
  ensureStairTilesCarved(grid, w, h, [...entrancePositions, exitPos]);

  // --- Place staircase cover + features ---
  for (let pi = 0; pi < entrancePositions.length; pi++) {
    const ep = entrancePositions[pi];
    grid[ep.y][ep.x] = T.CAVE_FLOOR;
    coverGrid[ep.y][ep.x] = T.STAIRS_UP;

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

  // --- Biome leakage from surface atmosphere ---
  applyBiomeLeakage(grid, coverGrid, w, h);

  // --- Ensure every tile is explicitly set (no undefined/null) ---
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] == null) grid[y][x] = T.CAVE_WALL;
    }
  }

  // --- Populate monsters ---
  populateMonsters(grid, li);

  return grid;
}

// ==================== LAVA LAYER ====================
export function makeLavaLayer(seed, layerIndex, pockets, sourceStairs) {
  srand(seed + 13331);
  const w = W_UNDER, h = H_UNDER;
  const grid = [];
  for (let y = 0; y < h; y++) {
    const row = [];
    for (let x = 0; x < w; x++) row.push(T.CAVE_WALL);
    grid.push(row);
  }

  const coverGrid = ensureCoverGrid(layerIndex, w, h);

  const entrancePositions = pockets.map(p => ({
    x: Math.max(4, Math.min(w - 5, p.x)),
    y: Math.max(4, Math.min(h - 5, p.y)),
  }));

  if (entrancePositions.length === 0) {
    entrancePositions.push({ x: Math.floor(w / 2), y: Math.floor(h / 2) });
  }

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
          x: Math.max(4, Math.min(w - 5, fx)),
          y: Math.max(4, Math.min(h - 5, fy)),
        };
      }
    }
  }

  if (!exitPos) {
    exitPos = placeExitFarFromEntrance(w, h, entrancePositions);
  }

  // --- Generate chamber-and-tunnel network ---
  const chambers = generateChambers(grid, w, h, entrancePositions, exitPos);
  connectChambers(grid, w, h, chambers);

  const protectedSet = new Set();
  for (const ep of entrancePositions) protectedSet.add(ep.x + ',' + ep.y);
  protectedSet.add(exitPos.x + ',' + exitPos.y);

  smoothCaves(grid, w, h, protectedSet, 2);
  ensureStairTilesCarved(grid, w, h, [...entrancePositions, exitPos]);

  // --- Lava pools: replace some cave floor with lava ---
  const poolCount = 8 + randi(8); // 8-15 lava pools across the floor
  for (let i = 0; i < poolCount; i++) {
    const lx = 4 + randi(w - 8);
    const ly = 4 + randi(h - 8);
    const rx = 3 + randi(5), ry = 2 + randi(4);
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1) continue;
        const px = lx + dx, py = ly + dy;
        if (px < 1 || py < 1 || px >= w - 1 || py >= h - 1) continue;
        if (protectedSet.has(px + ',' + py)) continue;
        if (grid[py][px] === T.CAVE_FLOOR && rand() < 0.85) grid[py][px] = T.LAVA;
      }
    }
  }

  // --- Staircases as cover ---
  for (let pi = 0; pi < entrancePositions.length; pi++) {
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

  // --- Ensure every tile is explicitly set ---
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y][x] == null) grid[y][x] = T.CAVE_WALL;
    }
  }

  // --- Populate monsters ---
  populateMonsters(grid, layerIndex);

  return grid;
}

// ==================== CORRIDOR UTILITIES ====================
export function carveCorridors(grid, w, h) {
  const mx = Math.max(1, Math.round(w * 0.054));
  const my = Math.max(1, Math.round(h * 0.054));
  const pts = [[mx, my], [w - 1 - mx, my], [mx, h - 1 - my], [w - 1 - mx, h - 1 - my], [w >> 1, h >> 1]];
  for (let i = 0; i < pts.length - 1; i++) {
    carveBetween(grid, w, h, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  }
}
export function carveBetween(grid, w, h, x1, y1, x2, y2) {
  let x = x1, y = y1;
  while (x !== x2 || y !== y2) {
    if (x >= 0 && y >= 0 && x < w && y < h) {
      if (grid[y][x] !== T.LAVA && grid[y][x] !== T.UWATER) grid[y][x] = T.CAVE_FLOOR;
    }
    if (x < x2) x++; else if (x > x2) x--;
    if (rand() < 0.5) continue;
    if (y < y2) y++; else if (y > y2) y--;
  }
}
