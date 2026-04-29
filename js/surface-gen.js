// ==================== SURFACE GENERATION ====================
import { covers } from './state.js';
import {
  W_SURF, H_SURF, LAYER_SURFACE, LAYER_UNDER,
  ATMOSPHERE_NOISE, BIOME_RULES, ATMOSPHERE,
  BIOME_TARGET, BIOME_TARGET_BIAS,
} from './constants.js';
import { T, isWalkable } from './terrain.js';
import { srand, rand, randi } from './rng.js';
import { setFeature } from './world-state.js';
import { ensureCoverGrid, populateMonsters } from './gen-utils.js';

// ==================== NOISE ====================
// Seeded 2D Perlin noise generator
function createNoise2D(seed) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed | 0;
  for (let i = 255; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = p[i]; p[i] = p[j]; p[j] = tmp;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const grad2 = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
  function lerp(a, b, t) { return a + t * (b - a); }

  return function noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const g = grad2;
    const aa = g[perm[perm[X    ] + Y    ] & 7];
    const ba = g[perm[perm[X + 1] + Y    ] & 7];
    const ab = g[perm[perm[X    ] + Y + 1] & 7];
    const bb = g[perm[perm[X + 1] + Y + 1] & 7];
    return lerp(
      lerp(aa[0]*xf     + aa[1]*yf,     ba[0]*(xf-1) + ba[1]*yf,     u),
      lerp(ab[0]*xf     + ab[1]*(yf-1), bb[0]*(xf-1) + bb[1]*(yf-1), u),
      v
    );
  };
}

// Fractal Brownian Motion — layered noise
function fbm(noiseFn, x, y, cfg) {
  let sum = 0, amp = 1, freq = cfg.frequency, maxAmp = 0;
  for (let i = 0; i < cfg.octaves; i++) {
    sum += noiseFn(x * freq, y * freq) * amp;
    maxAmp += amp;
    freq *= cfg.lacunarity;
    amp *= cfg.gain;
  }
  return sum / maxAmp;  // ≈ [-1, 1]
}

// ==================== BIOME TARGET MAP SAMPLING ====================
// Bilinear interpolation of the 16×16 target map at full-resolution coords.
// Returns the blended bias values { moisture, elevation, fungal } for (x, y).
function sampleTargetMap(x, y, w, h) {
  const targetH = BIOME_TARGET.length;       // 16
  const targetW = BIOME_TARGET[0].length;    // 16

  // Map full-res coords to target-map space (center of each target cell)
  const tx = (x / w) * targetW - 0.5;
  const ty = (y / h) * targetH - 0.5;

  // Integer cell coords and fractional part
  const x0 = Math.max(0, Math.min(targetW - 1, Math.floor(tx)));
  const y0 = Math.max(0, Math.min(targetH - 1, Math.floor(ty)));
  const x1 = Math.min(targetW - 1, x0 + 1);
  const y1 = Math.min(targetH - 1, y0 + 1);
  const fx = Math.max(0, Math.min(1, tx - x0));
  const fy = Math.max(0, Math.min(1, ty - y0));

  // Look up bias for four corners
  const b00 = BIOME_TARGET_BIAS[BIOME_TARGET[y0][x0]];
  const b10 = BIOME_TARGET_BIAS[BIOME_TARGET[y0][x1]];
  const b01 = BIOME_TARGET_BIAS[BIOME_TARGET[y1][x0]];
  const b11 = BIOME_TARGET_BIAS[BIOME_TARGET[y1][x1]];

  // Bilinear interpolation per field
  function bilerp(field) {
    const v00 = b00[field], v10 = b10[field], v01 = b01[field], v11 = b11[field];
    // If any corner is null for this field, return null (no bias)
    if (v00 == null || v10 == null || v01 == null || v11 == null) return null;
    const top    = v00 + (v10 - v00) * fx;
    const bottom = v01 + (v11 - v01) * fx;
    return top + (bottom - top) * fy;
  }

  return {
    moisture:  bilerp('moisture'),
    elevation: bilerp('elevation'),
    fungal:    bilerp('fungal'),
  };
}

// ==================== ATMOSPHERE FIELD GENERATION ====================
function generateAtmosphereFields(seed, w, h) {
  const mCfg = ATMOSPHERE_NOISE.moisture;
  const eCfg = ATMOSPHERE_NOISE.elevation;
  const fCfg = ATMOSPHERE_NOISE.fungal;

  const mNoise = createNoise2D(seed + mCfg.seedOffset);
  const eNoise = createNoise2D(seed + eCfg.seedOffset);
  const fNoise = createNoise2D(seed + fCfg.seedOffset);

  const moisture  = new Float32Array(w * h);
  const elevation = new Float32Array(w * h);
  const fungal    = new Float32Array(w * h);

  const lakeNoise = createNoise2D(seed + 17);
  const lakeCfg = { octaves: 2, frequency: 0.06, lacunarity: 2.0, gain: 0.5 };

  const NOISE_WEIGHT  = 0.4;
  const TARGET_WEIGHT = 0.6;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const target = sampleTargetMap(x, y, w, h);

      // ---- Moisture ----
      let mRaw = (fbm(mNoise, x, y, mCfg) + 1) * 0.5;   // noise → [0, 1]
      // Scattered lake pockets — secondary noise adds moisture hotspots
      const lakeVal = (fbm(lakeNoise, x, y, lakeCfg) + 1) * 0.5;
      if (lakeVal > 0.72) mRaw += (lakeVal - 0.72) * 1.8;
      mRaw = Math.max(0, Math.min(1, mRaw));
      if (target.moisture != null) {
        moisture[idx] = Math.max(0, Math.min(1, mRaw * NOISE_WEIGHT + target.moisture * TARGET_WEIGHT));
      } else {
        moisture[idx] = mRaw;
      }

      // ---- Elevation ----
      let eRaw = (fbm(eNoise, x, y, eCfg) + 1) * 0.5;
      eRaw = Math.max(0, Math.min(1, eRaw));
      if (target.elevation != null) {
        elevation[idx] = Math.max(0, Math.min(1, eRaw * NOISE_WEIGHT + target.elevation * TARGET_WEIGHT));
      } else {
        elevation[idx] = eRaw;
      }

      // ---- Fungal ----
      let fRaw = (fbm(fNoise, x, y, fCfg) + 1) * 0.5;
      fRaw = Math.max(0, Math.min(1, fRaw));
      if (target.fungal != null) {
        fungal[idx] = Math.max(0, Math.min(1, fRaw * NOISE_WEIGHT + target.fungal * TARGET_WEIGHT));
      } else {
        // Outside mushroom zones the fungal field should stay low
        fungal[idx] = fRaw * 0.25;
      }
    }
  }

  return { moisture, elevation, fungal, w, h };
}

// ==================== BIOME RESOLUTION ====================
function resolveBiome(m, e, f) {
  for (let i = 0; i < BIOME_RULES.length; i++) {
    const r = BIOME_RULES[i];
    if (m < r.moisture[0]  || m > r.moisture[1])  continue;
    if (e < r.elevation[0] || e > r.elevation[1]) continue;
    if (r.fungal && (f < r.fungal[0] || f > r.fungal[1])) continue;
    return r;
  }
  // Fallback
  return { ground: 0, cover: 0, coverChance: 0 };
}

// ==================== HELPERS ====================
function findWalkableNear(grid, coverGrid, tx, ty, w, h) {
  const walkable = (x, y) => {
    const g = grid[y][x];
    const c = coverGrid ? coverGrid[y][x] : 0;
    return isWalkable(g, c) && !c; // walkable ground with no cover
  };
  // Also accept walkable ground with walkable cover
  const walkableAny = (x, y) => {
    const g = grid[y][x];
    const c = coverGrid ? coverGrid[y][x] : 0;
    return isWalkable(g, c);
  };
  if (tx >= 0 && ty >= 0 && tx < w && ty < h && walkable(tx, ty)) {
    return { x: tx, y: ty };
  }
  for (let r = 1; r < Math.max(w, h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        if (walkable(x, y)) return { x, y };
      }
    }
  }
  // Fallback: accept any walkable
  for (let r = 1; r < Math.max(w, h); r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const x = tx + dx, y = ty + dy;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        if (walkableAny(x, y)) return { x, y };
      }
    }
  }
  return { x: tx, y: ty };
}

// ==================== SURFACE ====================
export function makeSurface(seed){
  srand(seed);
  const grid = [];
  for (let y = 0; y < H_SURF; y++){
    const row = [];
    for (let x = 0; x < W_SURF; x++) row.push(T.PLAINS);
    grid.push(row);
  }

  // Initialize cover grid for surface
  const coverGrid = ensureCoverGrid(LAYER_SURFACE, W_SURF, H_SURF);

  // ---- Generate atmosphere fields ----
  const fields = generateAtmosphereFields(seed, W_SURF, H_SURF);

  // Store atmosphere globally so other modules can query it
  ATMOSPHERE.moisture  = fields.moisture;
  ATMOSPHERE.elevation = fields.elevation;
  ATMOSPHERE.fungal    = fields.fungal;
  ATMOSPHERE.w         = fields.w;
  ATMOSPHERE.h         = fields.h;

  // ---- Apply biome rules per-tile ----
  for (let y = 0; y < H_SURF; y++){
    for (let x = 0; x < W_SURF; x++){
      const idx = y * W_SURF + x;
      const m = fields.moisture[idx];
      const e = fields.elevation[idx];
      const f = fields.fungal[idx];

      const rule = resolveBiome(m, e, f);
      grid[y][x] = rule.ground;

      if (rule.cover && rule.coverChance > 0) {
        if (rand() < rule.coverChance) {
          coverGrid[y][x] = rule.cover;
        }
      }
    }
  }

  // ---- Smooth tree-cover gradient driven by moisture ----
  // For plains tiles with no cover, roll per-tile tree placement based on
  // a smooth probability curve so trees gradually thicken from open
  // grassland (low moisture) to dense forest (high moisture).
  for (let y = 0; y < H_SURF; y++){
    for (let x = 0; x < W_SURF; x++){
      if (grid[y][x] !== T.PLAINS || coverGrid[y][x] !== 0) continue;

      const idx = y * W_SURF + x;
      const m = fields.moisture[idx];

      if (m < 0.28) continue; // pure open plains — no trees at all

      // Quadratic ramp: ~0% at m=0.28, ~5% at m=0.35, ~25% at m=0.48,
      //                 ~60% at m=0.58, ~95% at m=0.68+
      const t = Math.min(1, (m - 0.28) / 0.40);
      const treeChance = t * t * 0.95;

      if (rand() < treeChance) {
        coverGrid[y][x] = T.FOREST;
      }
    }
  }

  // ---- Rock scatter on stone ground ----
  // Boulders and outcrops break up large stone expanses and add cover variety.
  // Density is modulated by elevation — higher elevation = denser rock scatter.
  for (let y = 0; y < H_SURF; y++){
    for (let x = 0; x < W_SURF; x++){
      if (grid[y][x] !== T.STONE) continue;
      if (coverGrid[y][x] !== 0) continue;

      const idx = y * W_SURF + x;
      const e = fields.elevation[idx];

      // Elevation-scaled probability: base + boost at high elevation
      const eMul = 0.6 + 0.4 * Math.min(1, (e - 0.55) / 0.35);

      const r = rand();
      if (r < 0.12 * eMul){
        coverGrid[y][x] = T.BOULDER;
      } else if (r < 0.22 * eMul){
        coverGrid[y][x] = T.ROCK_OUTCROP;
      }
    }
  }

  // ---- Beach: adjacency pass (tiles next to water) ----
  for (let y = 0; y < H_SURF; y++){
    for (let x = 0; x < W_SURF; x++){
      if (grid[y][x] !== T.PLAINS && grid[y][x] !== T.DESERT) continue;
      if (coverGrid[y][x]) continue;  // don't overwrite cover tiles
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W_SURF || ny >= H_SURF) continue;
        if (grid[ny][nx] === T.WATER || grid[ny][nx] === T.DEEP){
          grid[y][x] = T.BEACH;
          coverGrid[y][x] = 0;  // clear any cover on beach
          break;
        }
      }
    }
  }

  // ---- SURFACE STAIRCASES ----
  // SE staircase (in mushroom zone — find spot where fungal field is high)
  {
    const seX = Math.floor(W_SURF * 0.68);
    const seY = Math.floor(H_SURF * 0.78);
    const pos = findWalkableNear(grid, coverGrid, seX, seY, W_SURF, H_SURF);
    coverGrid[pos.y][pos.x] = T.STAIRS_DOWN;
    setFeature(LAYER_SURFACE, pos.x, pos.y, {
      type: 'stairs', dir: 'down',
      targetLayer: LAYER_UNDER,
      targetX: pos.x, targetY: pos.y,
      sourceX: pos.x, sourceY: pos.y,
      label: 'A staircase descends into the mushroom-choked dark.',
    });
  }
  // NW staircase (in mountain zone — find spot where elevation is high)
  {
    const nwX = Math.floor(W_SURF * 0.18);
    const nwY = Math.floor(H_SURF * 0.15);
    const pos = findWalkableNear(grid, coverGrid, nwX, nwY, W_SURF, H_SURF);
    coverGrid[pos.y][pos.x] = T.STAIRS_DOWN;
    setFeature(LAYER_SURFACE, pos.x, pos.y, {
      type: 'stairs', dir: 'down',
      targetLayer: 2,
      targetX: pos.x, targetY: pos.y,
      sourceX: pos.x, sourceY: pos.y,
      label: 'Worn steps lead down into cold stone passages.',
    });
  }

  // Spawn monsters
  populateMonsters(grid, LAYER_SURFACE);

  return grid;
}

// ==================== DIRT ROADS ====================
export function placeDirtRoads(grid, settlements){
  if (!settlements || settlements.length < 2) return;
  const pts = settlements.slice().sort((a,b) => a.x - b.x);
  const connected = new Set();
  for (let i = 0; i < pts.length; i++){
    let best = [];
    for (let j = 0; j < pts.length; j++){
      if (i === j) continue;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (connected.has(key)) continue;
      const dx = pts[j].x - pts[i].x;
      const dy = pts[j].y - pts[i].y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      best.push({j, dist, key});
    }
    best.sort((a,b) => a.dist - b.dist);
    const links = Math.min(best.length, 1 + (rand() < 0.5 ? 1 : 0));
    for (let k = 0; k < links; k++){
      connected.add(best[k].key);
      dirtPathBetween(grid, pts[i].x, pts[i].y, pts[best[k].j].x, pts[best[k].j].y);
    }
  }
  for (const s of settlements){
    dirtRing(grid, s.x, s.y, 2);
  }
}

function dirtPathBetween(grid, x1, y1, x2, y2){
  let x = x1, y = y1;
  const coverGrid = covers[LAYER_SURFACE];
  while (x !== x2 || y !== y2){
    if (x >= 0 && y >= 0 && x < W_SURF && y < H_SURF){
      const t = grid[y][x];
      const c = coverGrid ? coverGrid[y][x] : 0;
      if ((t === T.PLAINS || t === T.DESERT || t === T.BEACH) && !c){
        if (rand() < 0.72) grid[y][x] = T.DIRT_ROAD;
      }
    }
    if (rand() < 0.25){
      const perp = rand() < 0.5 ? 1 : -1;
      if (Math.abs(x2 - x) > Math.abs(y2 - y)){
        y += perp;
      } else {
        x += perp;
      }
    } else {
      if (rand() < 0.5){
        if (x < x2) x++; else if (x > x2) x--;
      } else {
        if (y < y2) y++; else if (y > y2) y--;
      }
    }
  }
}

function dirtRing(grid, cx, cy, radius){
  const coverGrid = covers[LAYER_SURFACE];
  for (let dy = -radius; dy <= radius; dy++){
    for (let dx = -radius; dx <= radius; dx++){
      if (dx*dx + dy*dy > radius*radius + 1) continue;
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= W_SURF || y >= H_SURF) continue;
      const t = grid[y][x];
      const c = coverGrid ? coverGrid[y][x] : 0;
      if ((t === T.PLAINS || t === T.DESERT || t === T.BEACH) && !c && rand() < 0.6){
        grid[y][x] = T.DIRT_ROAD;
      }
    }
  }
}
