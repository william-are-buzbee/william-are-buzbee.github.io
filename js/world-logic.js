// ==================== WORLD LOGIC — placement, spawning, init ====================
import { state, worlds, covers, features, monsters, activateLayer } from './state.js';
import { LAYER_SURFACE, LAYER_UNDER, W_SURF, H_SURF, W_UNDER, H_UNDER, LAYER_META, BIOME_TARGET, CELL_TILE_W, CELL_TILE_H, DORMANT_RADIUS,
         SPAWN_DENSITY_SMALL_HERB, SPAWN_DENSITY_LARGE_HERB, SPAWN_DENSITY_MESO_PRED,
         SPAWN_DENSITY_AMBUSH_PRED, SPAWN_DENSITY_APEX_PRED,
         SPAWN_CLUSTER_SIZE, SPAWN_CLUSTER_RADIUS,
         SPAWN_VIABILITY_RADIUS, SPAWN_VIABILITY_MIN } from './constants.js';
import { T, isWalkable, isCover } from './terrain.js';
import { rand, randi, choice } from './rng.js';
// DISABLED — town removed (was used for initScholarInventory)
// import { BOOKS } from './items.js';
import { spawnMonster, MON, SPAWN_BLACKLIST, HABITAT, SPAWN_HABITAT } from './monsters.js';
import { SIGN_TEXTS } from './npcs.js';
import { worldDims, getFeature, setFeature, inBounds, chebyshev, getCover, setCover } from './world-state.js';
import { generateLayer } from './world-gen.js';
import { makeSurface } from './surface-gen.js';
import { makeUnderground, carveBetween } from './underground-gen.js';
// DISABLED — town removed
// import { placeStartingTown, initScholarInventory } from './town-gen.js';
import {
  clearPlacementState, registerStructurePosition,
  runStructurePlacement,
} from './structures.js';

// ==================== DORMANCY INITIALIZATION (Prompt S) ====================
// Creatures spawned far from the player start dormant to avoid wasted work.
// Creatures on a different layer than the player are always dormant.
function initDormancy(creature, spawnLayer) {
  const p = state.player;
  const layer = spawnLayer != null ? spawnLayer : (creature.layer != null ? creature.layer : p.layer);
  // Different layer → always dormant (distance is effectively infinite)
  if (layer !== p.layer) {
    creature._dormant = true;
    creature._dormantTurns = 0;
    return;
  }
  const dx = creature.x - p.x;
  const dy = creature.y - p.y;
  if (dx * dx + dy * dy > DORMANT_RADIUS * DORMANT_RADIUS) {
    creature._dormant = true;
    creature._dormantTurns = 0;
  } else {
    creature._dormant = false;
    creature._dormantTurns = 0;
  }
}

// ==================== STRUCTURE PLACEMENT ====================
/**
 * placeAt(layer, x, y, terrainType, featureObj)
 * Smart placement: if terrainType is a cover type, set it as cover
 * (preserving existing ground). If it's a ground type, set ground.
 */
export function placeAt(layer, x, y, terrainType, featureObj){
  if (isCover(terrainType)){
    covers[layer][y][x] = terrainType;
  } else {
    worlds[layer][y][x] = terrainType;
  }
  if (featureObj) setFeature(layer, x, y, featureObj);
}

export function findSpot(layer, predicate, tries=500){
  const [w,h] = worldDims(layer);
  for (let i=0;i<tries;i++){
    const x = randi(w), y = randi(h);
    const ground = worlds[layer][y][x];
    const cover = covers[layer] ? covers[layer][y][x] : 0;
    if (predicate(ground, x, y, cover)) return [x,y];
  }
  return null;
}
export function findSpotNear(layer, cx, cy, predicate, radius){
  const [w,h] = worldDims(layer);
  cx = Math.max(0, Math.min(w-1, cx));
  cy = Math.max(0, Math.min(h-1, cy));
  for (let r=0;r<=radius;r++){
    for (let dy=-r;dy<=r;dy++){
      for (let dx=-r;dx<=r;dx++){
        if (Math.max(Math.abs(dx),Math.abs(dy)) !== r) continue;
        const x=cx+dx, y=cy+dy;
        if (!inBounds(layer,x,y)) continue;
        const cover = covers[layer] ? covers[layer][y][x] : 0;
        if (cover) continue;  // skip tiles with cover (replaces isOverlay check)
        const ground = worlds[layer][y][x];
        if (predicate(ground, x, y, cover)) return [x,y];
      }
    }
  }
  return null;
}

function findSpotAdjacentTo(layer, adjType){
  const [w,h] = worldDims(layer);
  for (let tries=0; tries<400; tries++){
    const x = randi(w), y = randi(h);
    const ground = worlds[layer][y][x];
    const cover = covers[layer] ? covers[layer][y][x] : 0;
    if (!isWalkable(ground, cover) || cover) continue;
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
      const nx=x+dx, ny=y+dy;
      if (!inBounds(layer,nx,ny)) continue;
      // Check if adjacent tile has the target ground type
      if (worlds[layer][ny][nx] === adjType) return [x,y];
    }
  }
  return null;
}

function weightedPick(pairs){
  const total = pairs.reduce((s,p) => s + p[1], 0);
  let r = rand() * total;
  for (const [item, w] of pairs){
    r -= w;
    if (r <= 0) return item;
  }
  return pairs[pairs.length-1][0];
}

function findUndergroundNear(surfX, surfY, layer, predicate, radius){
  if (!worlds[layer]) return null;
  const h = worlds[layer].length, w = worlds[layer][0].length;
  const cx = Math.max(0, Math.min(w - 1, surfX));
  const cy = Math.max(0, Math.min(h - 1, surfY));
  for (let r = 0; r <= radius; r++){
    for (let dy = -r; dy <= r; dy++){
      for (let dx = -r; dx <= r; dx++){
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        const cover = covers[layer] ? covers[layer][y][x] : 0;
        if (cover) continue;  // skip tiles with cover
        if (predicate(worlds[layer][y][x], x, y)) return [x, y];
      }
    }
  }
  return null;
}

// ==================== STRUCTURE PLACEMENT ON SURFACE ====================
export function placeStructures(){
  // Search radius scales with map size (~22% of smaller dimension)
  const searchR = Math.max(5, Math.round(Math.min(W_SURF, H_SURF) * 0.22));
  const searchRSm = Math.max(4, Math.round(Math.min(W_SURF, H_SURF) * 0.16));

  // (Starting town has been disabled — player spawns directly on surface.)

  // DORMANT: Underground layer transitions — reactivate when underground is reimplemented
  // // Mountain cave entrance — SW
  // const cave = findSpotNear(LAYER_SURFACE,
  //   Math.floor(W_SURF * 0.31), Math.floor(H_SURF * 0.63), t=>t===T.ROCK, searchR);
  // if (cave){
  //   const [x,y] = cave;
  //   const uSpot = findUndergroundNear(x, y, LAYER_UNDER, t=>t===T.CAVE_FLOOR, Math.max(10, Math.round(Math.min(W_UNDER, H_UNDER) * 0.36)))
  //              || findSpot(LAYER_UNDER, t=>t===T.CAVE_FLOOR, 500)
  //              || [W_UNDER>>1, H_UNDER>>1];
  //   placeAt(LAYER_SURFACE, x, y, T.STAIRS_DOWN, {
  //     type:'stairs', dir:'down', targetLayer:LAYER_UNDER, targetX:uSpot[0], targetY:uSpot[1]
  //   });
  //   for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
  //     const nx=uSpot[0]+dx, ny=uSpot[1]+dy;
  //     if (inBounds(LAYER_UNDER,nx,ny) && worlds[LAYER_UNDER][ny][nx]===T.CAVE_WALL){
  //       worlds[LAYER_UNDER][ny][nx] = T.CAVE_FLOOR;
  //     }
  //   }
  //   placeAt(LAYER_UNDER, uSpot[0], uSpot[1], T.STAIRS_UP, {
  //     type:'stairs', dir:'up', targetLayer:LAYER_SURFACE, targetX:x, targetY:y
  //   });
  //   const sn2 = findSpotNear(LAYER_SURFACE, x-2, y+2, t=>t===T.GRASS||t===T.ROCK, 8);
  //   if (sn2) placeAt(LAYER_SURFACE, sn2[0], sn2[1], T.SIGN, {type:'sign', text:SIGN_TEXTS.cave_warn});
  // }

  // DORMANT: Underground layer transitions — reactivate when underground is reimplemented
  // // Northeast surface cave entrances
  // const neCaveSearchR = Math.max(4, Math.round(Math.min(W_SURF, H_SURF) * 0.134));
  // const neScatterX = Math.max(1, Math.round(W_SURF * 0.134));
  // const neScatterY = Math.max(1, Math.round(H_SURF * 0.16));
  // for (let i=0; i<3; i++){
  //   const neCave = findSpotNear(LAYER_SURFACE,
  //     Math.floor(W_SURF * 0.65) + randi(neScatterX),
  //     Math.floor(H_SURF * 0.07) + randi(neScatterY),
  //     t=>t===T.ROCK||t===T.CAVE_FLOOR, neCaveSearchR);
  //   if (neCave){
  //     const [x,y] = neCave;
  //     const uSpot = findUndergroundNear(x, y, LAYER_UNDER, t=>t===T.CAVE_FLOOR||t===T.ROCK, Math.max(10, Math.round(Math.min(W_UNDER, H_UNDER) * 0.36)))
  //                || findSpot(LAYER_UNDER, t=>t===T.CAVE_FLOOR||t===T.ROCK, 500);
  //     if (uSpot){
  //       for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
  //         const nx=uSpot[0]+dx, ny=uSpot[1]+dy;
  //         if (inBounds(LAYER_UNDER,nx,ny) && worlds[LAYER_UNDER][ny][nx]===T.CAVE_WALL){
  //           worlds[LAYER_UNDER][ny][nx] = T.CAVE_FLOOR;
  //         }
  //       }
  //       placeAt(LAYER_SURFACE, x, y, T.STAIRS_DOWN, {
  //         type:'stairs', dir:'down', targetLayer:LAYER_UNDER, targetX:uSpot[0], targetY:uSpot[1]
  //       });
  //       placeAt(LAYER_UNDER, uSpot[0], uSpot[1], T.STAIRS_UP, {
  //         type:'stairs', dir:'up', targetLayer:LAYER_SURFACE, targetX:x, targetY:y
  //       });
  //     }
  //   }
  // }

  // Eastern water cave entrances
  const wCaveMargin = Math.max(2, Math.round(Math.min(W_SURF, H_SURF) * 0.18));
  const wCaveScatter = Math.max(1, Math.round(W_SURF * 0.09));
  const wCaveSearchR = Math.max(3, Math.round(Math.min(W_SURF, H_SURF) * 0.09));
  for (let i=0; i<2; i++){
    const wCave = findSpotNear(LAYER_SURFACE,
      W_SURF - wCaveMargin - randi(wCaveScatter),
      wCaveMargin + randi(Math.max(1, H_SURF - wCaveMargin * 2)),
      t=>t===T.BEACH||t===T.GRASS, wCaveSearchR);
    if (wCave){
      const [x,y] = wCave;
      for (let dy2=-3; dy2<=3; dy2++){
        for (let dx2=-3; dx2<=3; dx2++){
          const nx=x+dx2, ny=y+dy2;
          if (!inBounds(LAYER_SURFACE,nx,ny)) continue;
          const nt = worlds[LAYER_SURFACE][ny][nx];
          // Eels spawn on water tiles ONLY; crabs can spawn on beach or water
          if ((nt === T.WATER || nt === T.DEEP_WATER) && rand() < 0.15){
            const pick = rand() < 0.5 ? 'cave_eel' : 'cave_crab';
            if (!SPAWN_BLACKLIST.has(pick)) {  // safety: respect blacklist for direct spawns
            const m = spawnMonster(pick);
            m.x = nx; m.y = ny;
            m.homeX = nx; m.homeY = ny;
            m.hp = m.hpMax;
            initDormancy(m);
            monsters[LAYER_SURFACE].push(m);
            }
          } else if (nt === T.BEACH && rand() < 0.075){
            // Crabs only on beach (amphibious)
            if (!SPAWN_BLACKLIST.has('cave_crab')) {  // safety: respect blacklist for direct spawns
            const m = spawnMonster('cave_crab');
            m.x = nx; m.y = ny;
            m.homeX = nx; m.homeY = ny;
            m.hp = m.hpMax;
            initDormancy(m);
            monsters[LAYER_SURFACE].push(m);
            }
          }
        }
      }
    }
  }

  // DISABLED — legacy content (standalone NPCs)
  // const npcSearchR = Math.max(6, Math.round(Math.min(W_SURF, H_SURF) * 0.27));
  // const fh = findSpotNear(LAYER_SURFACE,
  //   Math.floor(W_SURF * 0.34), Math.floor(H_SURF * 0.11),
  //   (t,x,y,c)=>c===T.FOREST, npcSearchR)
  //         || findSpotNear(LAYER_SURFACE,
  //   Math.floor(W_SURF * 0.34), Math.floor(H_SURF * 0.11),
  //   t=>t===T.GRASS, npcSearchR);
  // if (fh){
  //   // Clear forest cover and place NPC
  //   if (covers[LAYER_SURFACE]) covers[LAYER_SURFACE][fh[1]][fh[0]] = 0;
  //   worlds[LAYER_SURFACE][fh[1]][fh[0]] = T.GRASS;
  //   placeAt(LAYER_SURFACE, fh[0], fh[1], T.NPC, {type:'npc', npcKey:'forest_hermit'});
  // }
  // DISABLED — legacy content (scholar NPC)
  // const sch = findSpotNear(LAYER_SURFACE,
  //   Math.floor(W_SURF * 0.55), Math.floor(H_SURF * 0.29), t=>t===T.GRASS, searchR);
  // if (sch) placeAt(LAYER_SURFACE, sch[0], sch[1], T.NPC, {type:'npc', npcKey:'scholar'});
  // DISABLED — legacy content (fisherman NPC)
  // const fish = findSpot(LAYER_SURFACE, (t)=>t===T.BEACH);
  // if (fish) placeAt(LAYER_SURFACE, fish[0], fish[1], T.NPC, {type:'npc', npcKey:'fisherman'});

  // Signs, chests, and ruins are now handled by the structure registry.
  // Run the placement pass for both surface and underground.
  runStructurePlacement(LAYER_SURFACE, 'surface');
  runStructurePlacement(LAYER_UNDER, 'underground');

  // DISABLED — legacy system, do not delete yet
  // Books (not migrated — simple scatter, no constraints)
  // const bookKeys = Object.keys(BOOKS);
  // const shuffled = [...bookKeys].sort(() => rand()-0.5);
  // const surfaceBooks = shuffled.slice(0,4);
  // const underBooks   = shuffled.slice(4,7);
  // for (const bk of surfaceBooks){
  //   const s = findSpot(LAYER_SURFACE, (t,x,y,c)=>(t===T.GRASS||t===T.SAND||t===T.ROCK) && !c);
  //   if (s) placeAt(LAYER_SURFACE, s[0], s[1], T.BOOK, {type:'book', bookKey:bk});
  // }
  // for (const bk of underBooks){
  //   const s = findSpot(LAYER_UNDER, (t,x,y,c)=>(t===T.CAVE_FLOOR||t===T.ROCK) && !c);
  //   if (s) placeAt(LAYER_UNDER, s[0], s[1], T.BOOK, {type:'book', bookKey:bk});
  // }
}

// ==================== MONSTER SPAWNING ====================
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
//
// This entire section is temporary scaffolding. It places a static snapshot
// of creature populations using hardcoded density ratios, spacing rules, and
// clustering. The long-term system will derive population from energy budgets
// and dynamic reproduction. See Spawning-Design.md for the full roadmap.

// Cover types that block creature spawning (structures, interactables, etc.)
const NO_SPAWN_COVERS = new Set([
  T.STAIRS_DOWN, T.STAIRS_UP, T.GATE, T.NPC, T.SHOP, T.INN,
  T.HOUSE, T.HOUSE_LG, T.WALL, T.SHOPKEEPER, T.SIGN, T.CHEST,
  T.BOOK, T.WELL, T.WELL_TL, T.WELL_TR, T.WELL_BL,
  T.WELL_BR, T.BARREL, T.CRATE, T.LAMP_POST, T.FOUNTAIN,
  T.FARM, T.CASTLE, T.BLACKSPIRE, T.TOWN,
]);

// ---- Tile-level habitat matching ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
// Returns true if a tile's ground+cover combination matches a species' habitat.
function tileMatchesHabitat(ground, cover, habitatDef) {
  if (cover && habitatDef.cover.has(cover)) return true;
  if (habitatDef.ground.has(ground)) return true;
  return false;
}

// ---- Spawn viability check ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
// Verifies that the spawn point has enough habitat tiles nearby to support
// local movement. Prevents stranding a creature on a single valid tile
// surrounded by water or impassable terrain.
// This is a simple neighbor count, not pathfinding.
function isSpawnViable(x, y, habitatDef) {
  const grid = worlds[LAYER_SURFACE];
  const coverGrid = covers[LAYER_SURFACE];
  let count = 0;
  const r = SPAWN_VIABILITY_RADIUS;
  const x0 = Math.max(0, x - r);
  const x1 = Math.min(W_SURF - 1, x + r);
  const y0 = Math.max(0, y - r);
  const y1 = Math.min(H_SURF - 1, y + r);
  for (let sy = y0; sy <= y1; sy++) {
    for (let sx = x0; sx <= x1; sx++) {
      const g = grid[sy][sx];
      const c = coverGrid ? coverGrid[sy][sx] : 0;
      if (tileMatchesHabitat(g, c, habitatDef)) count++;
      if (count >= SPAWN_VIABILITY_MIN) return true; // early exit
    }
  }
  return false;
}

// ---- Check whether any water tile exists within `dist` of (cx, cy) ----
function hasNearbyWater(cx, cy, dist) {
  const grid = worlds[LAYER_SURFACE];
  const h = grid.length, w = grid[0].length;
  const x0 = Math.max(0, cx - dist);
  const x1 = Math.min(w - 1, cx + dist);
  const y0 = Math.max(0, cy - dist);
  const y1 = Math.min(h - 1, cy + dist);
  for (let sy = y0; sy <= y1; sy++) {
    for (let sx = x0; sx <= x1; sx++) {
      const t = grid[sy][sx];
      if (t === T.WATER || t === T.DEEP_WATER) return true;
    }
  }
  return false;
}

// ---- Pick a random value within an integer range [lo, hi] ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
function randRange(lo, hi) {
  return lo + randi(hi - lo + 1);
}

// ---- Fisher-Yates shuffle (in-place) ----
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randi(i + 1);
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// ---- Place a creature and initialize standard fields ----
// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
function placeCreature(key, x, y) {
  const m = spawnMonster(key);
  if (!m) return null;
  m.x = x; m.y = y;
  m.homeX = x; m.homeY = y;
  m.hp = m.hpMax;

  // Drive system: set wander home position for territorial creatures
  if (m._needsHomePosition && m.wanderProfile) {
    m.wanderProfile.homePosition = { x: x, y: y };
    delete m._needsHomePosition;
  }

  // Prompt S: initialize dormancy state based on distance to player
  initDormancy(m);

  if (!monsters[LAYER_SURFACE]) monsters[LAYER_SURFACE] = [];
  monsters[LAYER_SURFACE].push(m);
  return m;
}

export function spawnMonstersInWorld(){
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // Initialize monster arrays
  if (!monsters[LAYER_SURFACE]) monsters[LAYER_SURFACE] = [];
  if (!monsters[LAYER_UNDER])   monsters[LAYER_UNDER]   = [];

  const grid = worlds[LAYER_SURFACE];
  const coverGrid = covers[LAYER_SURFACE];

  // ---- Safe zone around player start ----
  const safeZone = Math.max(3, Math.round(Math.min(W_SURF, H_SURF) * 0.063));
  const startX = state.player.startX || Math.floor(W_SURF * 0.50);
  const startY = state.player.startY || Math.floor(H_SURF * 0.56);

  function inSafeZone(x, y) {
    return Math.abs(x - startX) < safeZone && Math.abs(y - startY) < safeZone;
  }

  // ==================================================================
  // PHASE 0: Count habitat tiles per species
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // One-time scan at world generation. For each species in the density
  // system, collect all valid spawn tiles (matching habitat, walkable or
  // species-allowed, not in safe zone, not blocked by structure cover).
  // ==================================================================
  const speciesKeys = ['dire_wolf', 'ambush_pred', 'wolf', 'cave_crab', 'hare'];
  const habitatTiles = {};   // key → [{x, y}, ...]
  for (const key of speciesKeys) {
    habitatTiles[key] = [];
  }

  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {
      const ground = grid[y][x];
      const cover = coverGrid ? coverGrid[y][x] : 0;

      // Skip non-walkable tiles (exception: water for cave_crab)
      const walkable = isWalkable(ground, cover);
      const isWaterTile = (ground === T.WATER);

      // Skip structure covers
      if (cover && NO_SPAWN_COVERS.has(cover)) continue;
      // Skip town interiors
      if (ground === T.WOOD_FLOOR) continue;
      // Skip safe zone
      if (inSafeZone(x, y)) continue;

      for (const key of speciesKeys) {
        const hab = SPAWN_HABITAT[key];
        if (!hab) continue;

        // Walkability gate: most species need walkable tiles.
        // cave_crab can spawn on water tiles (canEnterWater = true).
        if (!walkable && !(key === 'cave_crab' && isWaterTile)) continue;

        if (tileMatchesHabitat(ground, cover, hab)) {
          habitatTiles[key].push({ x, y });
        }
      }
    }
  }

  // ==================================================================
  // Compute target populations from density ratios
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // A random value within each density range is chosen per spawn pass
  // so populations vary between maps.
  // ==================================================================
  const densityMap = {
    hare:        SPAWN_DENSITY_SMALL_HERB,
    cave_crab:   SPAWN_DENSITY_LARGE_HERB,
    wolf:        SPAWN_DENSITY_MESO_PRED,
    ambush_pred: SPAWN_DENSITY_AMBUSH_PRED,
    dire_wolf:   SPAWN_DENSITY_APEX_PRED,
  };

  const targetPop = {};
  const habitatCount = {};
  for (const key of speciesKeys) {
    const tiles = habitatTiles[key].length;
    habitatCount[key] = tiles;
    const [lo, hi] = densityMap[key];
    const ratio = randRange(lo, hi);
    targetPop[key] = Math.max(0, Math.round(tiles / ratio));
  }

  // Shuffle habitat tile arrays so random picks are O(1) pops
  for (const key of speciesKeys) {
    shuffleArray(habitatTiles[key]);
  }

  // Track all spawned wolves/dire_wolves for pair bonding
  const spawnedWolves = [];

  // ==================================================================
  // PHASES 1–3: Predators and large herbivores
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // Iterate shuffled habitat tiles, place on viable spots until target
  // reached. No spacing enforcement — map is small enough that sparse
  // density ratios handle distribution. Predators placed first so their
  // lower targets are always met before tiles are exhausted.
  // ==================================================================
  for (const key of ['dire_wolf', 'ambush_pred', 'wolf', 'cave_crab']) {
    const target = targetPop[key];
    const tiles = habitatTiles[key];
    const hab = SPAWN_HABITAT[key];
    let spawned = 0;

    for (let i = 0; i < tiles.length && spawned < target; i++) {
      const { x, y } = tiles[i];
      if (!isSpawnViable(x, y, hab)) continue;

      const m = placeCreature(key, x, y);
      if (m) {
        if (key === 'wolf' || key === 'dire_wolf') spawnedWolves.push(m);
        spawned++;
      }
    }

    console.log(`[Spawn] ${key}: ${spawned}/${target} placed (${habitatCount[key]} habitat tiles)`);
  }

  // ==================================================================
  // PHASE 4: Small herbivores in clusters (hare / C3)
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // Most numerous, clustered. Pick cluster centers from viable habitat
  // tiles, then scatter individuals within cluster radius.
  // ==================================================================
  {
    const key = 'hare';
    const target = targetPop[key];
    const tiles = habitatTiles[key];
    const hab = SPAWN_HABITAT[key];
    const avgCluster = Math.round((SPAWN_CLUSTER_SIZE[0] + SPAWN_CLUSTER_SIZE[1]) / 2);
    const clusterCount = Math.max(1, Math.round(target / avgCluster));

    const clusterCenters = [];
    let totalSpawned = 0;

    // Pick cluster centers from viable habitat tiles
    for (let i = 0; i < tiles.length && clusterCenters.length < clusterCount; i++) {
      const { x, y } = tiles[i];
      if (!isSpawnViable(x, y, hab)) continue;
      clusterCenters.push({ x, y });
    }

    // Populate each cluster
    for (const center of clusterCenters) {
      if (totalSpawned >= target) break;

      const clusterSize = randRange(SPAWN_CLUSTER_SIZE[0], SPAWN_CLUSTER_SIZE[1]);
      let clusterSpawned = 0;

      // Try to place individuals within SPAWN_CLUSTER_RADIUS of center
      for (let attempt = 0; attempt < clusterSize * 4 && clusterSpawned < clusterSize; attempt++) {
        const ox = randi(SPAWN_CLUSTER_RADIUS * 2 + 1) - SPAWN_CLUSTER_RADIUS;
        const oy = randi(SPAWN_CLUSTER_RADIUS * 2 + 1) - SPAWN_CLUSTER_RADIUS;
        const tx = center.x + ox;
        const ty = center.y + oy;

        // Bounds check
        if (tx < 0 || ty < 0 || tx >= W_SURF || ty >= H_SURF) continue;
        if (inSafeZone(tx, ty)) continue;

        const ground = grid[ty][tx];
        const cover = coverGrid ? coverGrid[ty][tx] : 0;
        if (!isWalkable(ground, cover)) continue;
        if (cover && NO_SPAWN_COVERS.has(cover)) continue;
        if (!tileMatchesHabitat(ground, cover, hab)) continue;

        const m = placeCreature(key, tx, ty);
        if (m) {
          clusterSpawned++;
          totalSpawned++;
        }
      }
    }

    console.log(`[Spawn] Small herbivore (hare): ${totalSpawned}/${target} placed in ${clusterCenters.length} clusters (${habitatCount[key]} habitat tiles)`);
  }

  // ==================================================================
  // LEGACY: Mushroom (chemotroph) spawning
  // FIRST PASS SPAWNING — placeholder, see Spawning-Design.md
  // Mushroom (C5) is NOT part of the density-based system per design doc.
  // Retained as legacy biome-weight spawning — fungal zones only.
  // ==================================================================
  {
    const mushroomHab = HABITAT.mushroom;
    if (mushroomHab && !SPAWN_BLACKLIST.has('mushroom')) {
      const cellCounters = {};
      function getCellKey(x, y) {
        return Math.floor(x / CELL_TILE_W) + ',' + Math.floor(y / CELL_TILE_H);
      }

      for (let y = 0; y < H_SURF; y++) {
        for (let x = 0; x < W_SURF; x++) {
          const ground = grid[y][x];
          const cover = coverGrid ? coverGrid[y][x] : 0;
          if (!isWalkable(ground, cover)) continue;
          if (ground === T.WOOD_FLOOR) continue;
          if (cover && NO_SPAWN_COVERS.has(cover)) continue;
          if (inSafeZone(x, y)) continue;

          // Determine biome from target map
          const cellX = Math.floor(x / CELL_TILE_W);
          const cellY = Math.floor(y / CELL_TILE_H);
          const clampedCX = Math.min(cellX, BIOME_TARGET[0].length - 1);
          const clampedCY = Math.min(cellY, BIOME_TARGET.length - 1);
          const biome = BIOME_TARGET[clampedCY][clampedCX].biome;

          if (!mushroomHab.biomes.includes(biome)) continue;

          const cellKey = clampedCX + ',' + clampedCY;
          const count = cellCounters[cellKey] || 0;
          if (count >= mushroomHab.maxPerCell) continue;

          if (rand() >= mushroomHab.spawnWeight) continue;

          const m = placeCreature('mushroom', x, y);
          if (m) {
            cellCounters[cellKey] = count + 1;
          }
        }
      }
    }
  }

  // ==================================================================
  // Wolf pair bonding (unchanged from previous system)
  // ==================================================================
  const pairBonders = spawnedWolves.filter(w => w.personality === 'pair_bond' && !w.bondPartner);
  for (let i=0; i<pairBonders.length-1; i+=2){
    const a = pairBonders[i], b = pairBonders[i+1];
    if (chebyshev(a.x,a.y,b.x,b.y) < Math.max(5, Math.round(Math.min(W_SURF, H_SURF) * 0.134))){
      a.bondPartner = b;
      b.bondPartner = a;
    }
  }

  // ==================================================================
  // Underground spawning (unchanged — not part of first-pass redesign)
  // ==================================================================
  const underDensity = {
    [T.CAVE_FLOOR]: 0.015,
    [T.ROCK]:       0.0125,
  };
  for (let y=0;y<H_UNDER;y++){
    for (let x=0;x<W_UNDER;x++){
      const ground = worlds[LAYER_UNDER][y][x];
      const cover = covers[LAYER_UNDER] ? covers[LAYER_UNDER][y][x] : 0;
      if (!isWalkable(ground, cover)) continue;
      if (cover) continue;  // skip tiles with cover (stairs, etc)
      let density = underDensity[ground] || 0;
      let biomeHint = null;
      for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++){
        const nx=x+dx,ny=y+dy;
        if (!inBounds(LAYER_UNDER,nx,ny)) continue;
        if (worlds[LAYER_UNDER][ny][nx]===T.LAVA){ biomeHint = T.LAVA; density = 0.02; }
        else if (worlds[LAYER_UNDER][ny][nx]===T.UWATER && biomeHint==null){ biomeHint = T.UWATER; density = 0.0175; }
      }
      if (rand() >= density) continue;
      const targetT = biomeHint || ground;
      const eligible = Object.keys(MON).filter(k => {
        if (SPAWN_BLACKLIST.has(k)) return false;
        const d = MON[k];
        return d[13].includes(targetT) && d[14] === LAYER_UNDER;
      });
      if (!eligible.length) continue;
      const m = spawnMonster(choice(eligible));
      m.x = x; m.y = y;
      m.homeX = x; m.homeY = y;
      m.hp = m.hpMax;
      // Drive system: set wander home position for territorial creatures
      if (m._needsHomePosition && m.wanderProfile) {
        m.wanderProfile.homePosition = { x: x, y: y };
        delete m._needsHomePosition;
      }
      // Prompt S: initialize dormancy (underground creatures start dormant)
      initDormancy(m, LAYER_UNDER);
      monsters[LAYER_UNDER].push(m);
    }
  }
}

// ==================== INIT ====================
export function initWorld(seed){
  for (const k in worlds) delete worlds[k];
  for (const k in covers) delete covers[k];
  for (const k in features) delete features[k];
  for (const k in monsters) delete monsters[k];
  for (const k in LAYER_META) delete LAYER_META[k];
  clearPlacementState();

  generateLayer(LAYER_SURFACE, seed);
  generateLayer(LAYER_UNDER, seed);

  // DISABLED — town removed
  // const cx = Math.floor(W_SURF / 2);
  // const cy = Math.floor(H_SURF / 2);
  // initScholarInventory(Object.keys(BOOKS));
  // const { spawnX, spawnY } = placeStartingTown(LAYER_SURFACE, cx, cy);

  // Spawn player on the surface: scan outward from center for a walkable,
  // non-water, non-cover tile.
  const spawnCenter = findSpotNear(
    LAYER_SURFACE,
    Math.floor(W_SURF / 2),
    Math.floor(H_SURF / 2),
    (ground, x, y, cover) => {
      if (cover) return false;
      return isWalkable(ground, cover)
        && ground !== T.WATER && ground !== T.DEEP_WATER
        && ground !== T.LAVA;
    },
    Math.max(W_SURF, H_SURF),
  );
  const spawnX = spawnCenter ? spawnCenter[0] : Math.floor(W_SURF / 2);
  const spawnY = spawnCenter ? spawnCenter[1] : Math.floor(H_SURF / 2);
  state.player.startX = spawnX;
  state.player.startY = spawnY;

  placeStructures();

  activateLayer(LAYER_SURFACE);
  state.player.layer = LAYER_SURFACE;
  state.player.x = spawnX;
  state.player.y = spawnY;
  spawnMonstersInWorld();
}
