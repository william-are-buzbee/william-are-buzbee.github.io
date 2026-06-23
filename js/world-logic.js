// ==================== WORLD LOGIC — placement, spawning, init ====================
import { state, worlds, covers, features, monsters, activateLayer } from './state.js';
import { LAYER_SURFACE, LAYER_UNDER, W_SURF, H_SURF, W_UNDER, H_UNDER, LAYER_META, getAtmosphere, BIOME_TARGET, CELL_TILE_W, CELL_TILE_H, DORMANT_RADIUS } from './constants.js';
import { T, isWalkable, isCover } from './terrain.js';
import { rand, randi, choice } from './rng.js';
// DISABLED — town removed (was used for initScholarInventory)
// import { BOOKS } from './items.js';
import { spawnMonster, MON, SPAWN_BLACKLIST, HABITAT } from './monsters.js';
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
          if ((nt === T.WATER || nt === T.DEEP_WATER) && rand() < 0.3 * SPAWN_DENSITY_MULT){
            const pick = rand() < 0.5 ? 'cave_eel' : 'cave_crab';
            if (!SPAWN_BLACKLIST.has(pick)) {  // safety: respect blacklist for direct spawns
            const m = spawnMonster(pick);
            m.x = nx; m.y = ny;
            m.homeX = nx; m.homeY = ny;
            m.hp = m.hpMax;
            initDormancy(m);
            monsters[LAYER_SURFACE].push(m);
            }
          } else if (nt === T.BEACH && rand() < 0.15 * SPAWN_DENSITY_MULT){
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

// Global spawn density multiplier — halved to reduce crowding
const SPAWN_DENSITY_MULT = 0.5;

// Cover types that block creature spawning (structures, interactables, etc.)
const NO_SPAWN_COVERS = new Set([
  T.STAIRS_DOWN, T.STAIRS_UP, T.GATE, T.NPC, T.SHOP, T.INN,
  T.HOUSE, T.HOUSE_LG, T.WALL, T.SHOPKEEPER, T.SIGN, T.CHEST,
  T.BOOK, T.WELL, T.WELL_TL, T.WELL_TR, T.WELL_BL,
  T.WELL_BR, T.BARREL, T.CRATE, T.LAMP_POST, T.FOUNTAIN,
  T.FARM, T.CASTLE, T.BLACKSPIRE, T.TOWN,
]);

// Check whether any water tile (T.WATER or T.DEEP_WATER) exists within
// `dist` Chebyshev distance of (cx, cy) on the surface grid.
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

export function spawnMonstersInWorld(){

  // ---- Build the list of surface habitat candidates (non-blacklisted) ----
  const habitatKeys = Object.keys(HABITAT).filter(k => !SPAWN_BLACKLIST.has(k));

  // ---- Per-cell spawn counters: cellCounters["cx,cy"][monKey] → count ----
  const cellCounters = {};
  function getCellKey(x, y) {
    return Math.floor(x / CELL_TILE_W) + ',' + Math.floor(y / CELL_TILE_H);
  }
  function getCellCount(cellKey, monKey) {
    const bucket = cellCounters[cellKey];
    return bucket ? (bucket[monKey] || 0) : 0;
  }
  function incCellCount(cellKey, monKey) {
    if (!cellCounters[cellKey]) cellCounters[cellKey] = {};
    cellCounters[cellKey][monKey] = (cellCounters[cellKey][monKey] || 0) + 1;
  }

  // ---- Safe zone around player start ----
  const safeZone = Math.max(3, Math.round(Math.min(W_SURF, H_SURF) * 0.063));
  const startX = state.player.startX || Math.floor(W_SURF * 0.50);
  const startY = state.player.startY || Math.floor(H_SURF * 0.56);

  const spawnedWolves = [];

  for (let y = 0; y < H_SURF; y++) {
    for (let x = 0; x < W_SURF; x++) {
      const ground = worlds[LAYER_SURFACE][y][x];
      const cover = covers[LAYER_SURFACE] ? covers[LAYER_SURFACE][y][x] : 0;

      // Skip non-walkable tiles
      if (!isWalkable(ground, cover)) continue;
      // Skip town interiors
      if (ground === T.WOOD_FLOOR) continue;
      // Skip special cover tiles (structures, interactables)
      if (cover && NO_SPAWN_COVERS.has(cover)) continue;
      // Skip player safe zone
      if (Math.abs(x - startX) < safeZone && Math.abs(y - startY) < safeZone) continue;

      // ---- Determine biome from target map ----
      const cellX = Math.floor(x / CELL_TILE_W);
      const cellY = Math.floor(y / CELL_TILE_H);
      const clampedCX = Math.min(cellX, BIOME_TARGET[0].length - 1);
      const clampedCY = Math.min(cellY, BIOME_TARGET.length - 1);
      const biome = BIOME_TARGET[clampedCY][clampedCX].biome;

      const cellKey = clampedCX + ',' + clampedCY;

      // ---- Find creatures whose habitat includes this biome ----
      for (let i = 0; i < habitatKeys.length; i++) {
        const key = habitatKeys[i];
        const hab = HABITAT[key];

        // Biome check
        if (!hab.biomes.includes(biome)) continue;

        // maxPerCell check
        if (getCellCount(cellKey, key) >= hab.maxPerCell) continue;

        // nearWater proximity check
        if (hab.nearWater && !hasNearbyWater(x, y, hab.nearWaterDist)) continue;

        // Roll independently against spawnWeight (modulated by density mult)
        if (rand() >= hab.spawnWeight * SPAWN_DENSITY_MULT) continue;

        // Spawn this creature
        const m = spawnMonster(key);
        if (!m) continue;

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
        incCellCount(cellKey, key);

        if (key === 'wolf' || key === 'dire_wolf') spawnedWolves.push(m);
      }
    }
  }

  // Wolf pair bonding (unchanged)
  const pairBonders = spawnedWolves.filter(w => w.personality === 'pair_bond' && !w.bondPartner);
  for (let i=0; i<pairBonders.length-1; i+=2){
    const a = pairBonders[i], b = pairBonders[i+1];
    if (chebyshev(a.x,a.y,b.x,b.y) < Math.max(5, Math.round(Math.min(W_SURF, H_SURF) * 0.134))){
      a.bondPartner = b;
      b.bondPartner = a;
    }
  }

  // ==== OLD TILE-TYPE SURFACE SPAWN LOGIC (replaced by habitat system above) ====
  // const surfaceDensity = {
  //   [T.GRASS]:    0.008  * SPAWN_DENSITY_MULT,
  //   [T.FOREST]:   0.04   * SPAWN_DENSITY_MULT,
  //   [T.SAND]:     0.035  * SPAWN_DENSITY_MULT,
  //   [T.ROCK]:     0.035  * SPAWN_DENSITY_MULT,
  //   [T.BEACH]:    0.003  * SPAWN_DENSITY_MULT,
  //   [T.CAVE_FLOOR]:0.03  * SPAWN_DENSITY_MULT,
  //   [T.MUSHFOREST]:0.05  * SPAWN_DENSITY_MULT,
  //   [T.FUNGAL_GRASS]:0.04 * SPAWN_DENSITY_MULT,
  //   [T.MUD]:      0.01   * SPAWN_DENSITY_MULT,
  //   [T.DIRT]:     0.008  * SPAWN_DENSITY_MULT,
  // };
  // for (let y=0;y<H_SURF;y++){
  //   for (let x=0;x<W_SURF;x++){
  //     const ground = worlds[LAYER_SURFACE][y][x];
  //     const cover = covers[LAYER_SURFACE] ? covers[LAYER_SURFACE][y][x] : 0;
  //     if (!isWalkable(ground, cover)) continue;
  //     if (ground === T.WOOD_FLOOR) continue;
  //     if (cover && (cover === T.TOWN || cover === T.CASTLE || cover === T.BLACKSPIRE ||
  //         cover === T.SIGN || cover === T.NPC || cover === T.HOUSE || cover === T.SHOP ||
  //         cover === T.INN || cover === T.STAIRS_DOWN || cover === T.STAIRS_UP ||
  //         cover === T.CHEST || cover === T.BOOK || cover === T.SHOPKEEPER ||
  //         cover === T.FOUNTAIN || cover === T.LAMP_POST)) continue;
  //     const safeZone = Math.max(3, Math.round(Math.min(W_SURF, H_SURF) * 0.063));
  //     const startX = state.player.startX || Math.floor(W_SURF * 0.50);
  //     const startY = state.player.startY || Math.floor(H_SURF * 0.56);
  //     if (Math.abs(x - startX) < safeZone && Math.abs(y - startY) < safeZone) continue;
  //     const biomeKey = cover || ground;
  //     const density = surfaceDensity[biomeKey] || 0;
  //     if (rand() >= density) continue;
  //     let eligible = Object.keys(MON).filter(k => {
  //       if (SPAWN_BLACKLIST.has(k)) return false;
  //       const d = MON[k];
  //       return d[13].includes(biomeKey) && d[14] === LAYER_SURFACE;
  //     });
  //     if (cover === T.MUSHFOREST) eligible = ['mushroom'];
  //     {
  //       const atmo = getAtmosphere(x, y);
  //       if (atmo.elevation > 0.68 && atmo.moisture < 0.35 &&
  //           (ground === T.ROCK || ground === T.CAVE_FLOOR)){
  //         eligible = ['rock_golem'];
  //       }
  //     }
  //     if (cover === T.FOREST && eligible.includes('wolf')){
  //       eligible.push('dire_wolf');
  //       eligible.push('wolf');
  //     }
  //     eligible = eligible.filter(k => !SPAWN_BLACKLIST.has(k));
  //     if (!eligible.length) continue;
  //     const picked = choice(eligible);
  //     const m = spawnMonster(picked);
  //     m.x = x; m.y = y;
  //     m.homeX = x; m.homeY = y;
  //     m.hp = m.hpMax;
  //     monsters[LAYER_SURFACE].push(m);
  //     if (picked === 'wolf' || picked === 'dire_wolf') spawnedWolves.push(m);
  //   }
  // }

  // Underground
  const underDensity = {
    [T.CAVE_FLOOR]: 0.03  * SPAWN_DENSITY_MULT,
    [T.ROCK]:       0.025 * SPAWN_DENSITY_MULT,
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
        if (worlds[LAYER_UNDER][ny][nx]===T.LAVA){ biomeHint = T.LAVA; density = 0.04 * SPAWN_DENSITY_MULT; }
        else if (worlds[LAYER_UNDER][ny][nx]===T.UWATER && biomeHint==null){ biomeHint = T.UWATER; density = 0.035 * SPAWN_DENSITY_MULT; }
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
