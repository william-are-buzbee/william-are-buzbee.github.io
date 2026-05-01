// ==================== WORLD LOGIC — placement, spawning, init ====================
import { state, worlds, covers, features, monsters, cellKeyToLayer, activateLayer } from './state.js';
import { LAYER_SURFACE, LAYER_UNDER, W_SURF, H_SURF, W_UNDER, H_UNDER, DIFFICULTIES, LAYER_META, getAtmosphere } from './constants.js';
import { T, isWalkable, isCover } from './terrain.js';
import { rand, randi, choice } from './rng.js';
import { BOOKS } from './items.js';
import { spawnMonster, MON } from './monsters.js';
import { SIGN_TEXTS } from './npcs.js';
import { worldDims, getFeature, setFeature, inBounds, chebyshev, getCover, setCover } from './world-state.js';
import { generateLayer } from './world-gen.js';
import { makeSurface } from './surface-gen.js';
import { makeUnderground, carveBetween } from './underground-gen.js';
import { makeTownCell } from './town-gen.js';
import {
  clearPlacementState, registerTownPosition, registerStructurePosition,
  runStructurePlacement,
} from './structures.js';

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

  // Millhaven (starter, plains) — center-south
  const mill = findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.50), Math.floor(H_SURF * 0.55), t=>t===T.PLAINS, searchR);
  if (mill){
    const [x,y] = mill;
    placeAt(LAYER_SURFACE, x, y, T.TOWN, {type:'town', townKey:'millhaven'});
    state.player.startX = x; state.player.startY = y+1;
    registerTownPosition('millhaven', x, y);
  }
  // Thornwell — NW forest
  const thorn = findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.39), Math.floor(H_SURF * 0.24), t=>t===T.PLAINS, searchRSm)
             || findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.39), Math.floor(H_SURF * 0.24), (t,x,y,c)=>t===T.PLAINS && (c===T.FOREST||c===T.SCATTERED_TREES), searchRSm);
  if (thorn){
    const [x,y] = thorn;
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
      const nx=x+dx, ny=y+dy;
      if (inBounds(LAYER_SURFACE,nx,ny)){
        // Clear forest cover around town placement
        if (covers[LAYER_SURFACE] && (covers[LAYER_SURFACE][ny][nx] === T.FOREST || covers[LAYER_SURFACE][ny][nx] === T.SCATTERED_TREES)){
          covers[LAYER_SURFACE][ny][nx] = 0;
        }
      }
    }
    placeAt(LAYER_SURFACE, x, y, T.TOWN, {type:'town', townKey:'thornwell'});
    registerTownPosition('thornwell', x, y);
  }
  // Dunegate — E desert
  const dune = findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.67), Math.floor(H_SURF * 0.54), t=>t===T.DESERT, searchRSm)
            || findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.67), Math.floor(H_SURF * 0.54), t=>t===T.PLAINS, searchRSm);
  if (dune){
    const [x,y] = dune;
    placeAt(LAYER_SURFACE, x, y, T.TOWN, {type:'town', townKey:'dunegate'});
    registerTownPosition('dunegate', x, y);
  }
  // Karst Hollow — SW mountain
  const karst = findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.27), Math.floor(H_SURF * 0.67), t=>t===T.PLAINS||t===T.MOUNTAIN, searchR);
  if (karst){
    const [x,y] = karst;
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
      const nx=x+dx, ny=y+dy;
      if (inBounds(LAYER_SURFACE,nx,ny) && worlds[LAYER_SURFACE][ny][nx]===T.MOUNTAIN){
        worlds[LAYER_SURFACE][ny][nx] = T.PLAINS;
      }
    }
    placeAt(LAYER_SURFACE, x, y, T.TOWN, {type:'town', townKey:'karst'});
    registerTownPosition('karst', x, y);
  }

  // Fix GATE return coords
  ['millhaven','thornwell','dunegate','karst'].forEach(tk => {
    const layer = cellKeyToLayer[tk];
    if (layer == null) return;
    let townX=-1, townY=-1;
    for (let y=0;y<H_SURF;y++) for (let x=0;x<W_SURF;x++){
      const f = getFeature(LAYER_SURFACE, x, y);
      if (f && f.type === 'town' && f.townKey === tk){ townX=x; townY=y; break; }
    }
    if (townX < 0) return;
    for (const k in features[layer]){
      const f = features[layer][k];
      if (f.type === 'gate'){
        f.returnLayer = LAYER_SURFACE;
        f.returnX = townX;
        f.returnY = townY+1;
      }
    }
  });

  // Sunward Hold — W
  const sunward = findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.16), Math.floor(H_SURF * 0.34), t=>t===T.PLAINS||t===T.MOUNTAIN, searchR);
  if (sunward){
    const [x,y] = sunward;
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
      const nx=x+dx, ny=y+dy;
      if (inBounds(LAYER_SURFACE,nx,ny) && worlds[LAYER_SURFACE][ny][nx]===T.MOUNTAIN){
        worlds[LAYER_SURFACE][ny][nx] = T.PLAINS;
      }
    }
    placeAt(LAYER_SURFACE, x, y, T.CASTLE, {
      type:'castle', castleKey:'sunward', name:'Sunward Hold',
      chests:[
        {key:'kingsbane', name:'Kingsbane', kind:'weapon'},
        {key:'kingsgarb',  name:'Kingslayer Plate', kind:'armor'},
      ],
      guarded:true, knightSpawned:false,
    });
    registerStructurePosition('sunward_hold', x, y, LAYER_SURFACE);
  }
  // Blackspire Keep — SE
  const bsR = Math.max(6, Math.round(Math.min(W_SURF, H_SURF) * 0.27));
  const bs = findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.61), Math.floor(H_SURF * 0.79), t=>t===T.PLAINS||t===T.DESERT, bsR);
  if (bs){
    const [x,y] = bs;
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
      const nx=x+dx, ny=y+dy;
      if (inBounds(LAYER_SURFACE,nx,ny) && !isWalkable(worlds[LAYER_SURFACE][ny][nx])){
        worlds[LAYER_SURFACE][ny][nx] = T.PLAINS;
      }
    }
    placeAt(LAYER_SURFACE, x, y, T.BLACKSPIRE, {
      type:'castle', castleKey:'blackspire', name:'Blackspire Keep', descent:true,
    });
    registerStructurePosition('blackspire_keep', x, y, LAYER_SURFACE);
    const sn = findSpotNear(LAYER_SURFACE, x-2, y-2, t=>t===T.PLAINS||t===T.DESERT, 10);
    if (sn) placeAt(LAYER_SURFACE, sn[0], sn[1], T.SIGN, {type:'sign', text:SIGN_TEXTS.castle_warn});
  }

  // Mountain cave entrance — SW
  const cave = findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.31), Math.floor(H_SURF * 0.63), t=>t===T.MOUNTAIN, searchR);
  if (cave){
    const [x,y] = cave;
    const uSpot = findUndergroundNear(x, y, LAYER_UNDER, t=>t===T.CAVE, Math.max(10, Math.round(Math.min(W_UNDER, H_UNDER) * 0.36)))
               || findSpot(LAYER_UNDER, t=>t===T.CAVE, 500)
               || [W_UNDER>>1, H_UNDER>>1];
    placeAt(LAYER_SURFACE, x, y, T.STAIRS_DOWN, {
      type:'stairs', dir:'down', targetLayer:LAYER_UNDER, targetX:uSpot[0], targetY:uSpot[1]
    });
    for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
      const nx=uSpot[0]+dx, ny=uSpot[1]+dy;
      if (inBounds(LAYER_UNDER,nx,ny) && worlds[LAYER_UNDER][ny][nx]===T.STONE){
        worlds[LAYER_UNDER][ny][nx] = T.CAVE;
      }
    }
    placeAt(LAYER_UNDER, uSpot[0], uSpot[1], T.STAIRS_UP, {
      type:'stairs', dir:'up', targetLayer:LAYER_SURFACE, targetX:x, targetY:y
    });
    const sn2 = findSpotNear(LAYER_SURFACE, x-2, y+2, t=>t===T.PLAINS||t===T.MOUNTAIN, 8);
    if (sn2) placeAt(LAYER_SURFACE, sn2[0], sn2[1], T.SIGN, {type:'sign', text:SIGN_TEXTS.cave_warn});
  }

  // Blackspire → throne in underground
  if (bs){
    const [bsX, bsY] = bs;

    let throneX = Math.max(4, Math.min(W_UNDER - 5, bsX));
    let throneY = Math.max(4, Math.min(H_UNDER - 5, bsY));

    for (let dy=-2;dy<=2;dy++) for (let dx=-2;dx<=2;dx++){
      const nx=throneX+dx, ny=throneY+dy;
      if (inBounds(LAYER_UNDER,nx,ny)) worlds[LAYER_UNDER][ny][nx] = T.STONE;
    }
    let nearestX = W_UNDER >> 1, nearestY = H_UNDER >> 1;
    let nearestDist = Infinity;
    for (const fk of Object.keys(features[LAYER_UNDER] || {})) {
      const f = features[LAYER_UNDER][fk];
      if (f && f.type === 'stairs' && f.dir === 'up') {
        const [fx, fy] = fk.split(',').map(Number);
        const d = Math.abs(fx - throneX) + Math.abs(fy - throneY);
        if (d < nearestDist) { nearestDist = d; nearestX = fx; nearestY = fy; }
      }
    }
    carveBetween(worlds[LAYER_UNDER], W_UNDER, H_UNDER, throneX, throneY - 3, nearestX, nearestY);
    const stairUpX = throneX, stairUpY = throneY - 4;
    if (inBounds(LAYER_UNDER, stairUpX, stairUpY)) worlds[LAYER_UNDER][stairUpY][stairUpX] = T.CAVE;
    placeAt(LAYER_UNDER, stairUpX, stairUpY, T.STAIRS_UP, {
      type:'stairs', dir:'up', targetLayer:LAYER_SURFACE, targetX:bsX, targetY:bsY
    });
    const bsFeat = getFeature(LAYER_SURFACE, bsX, bsY);
    bsFeat.targetLayer = LAYER_UNDER;
    bsFeat.targetX = stairUpX;
    bsFeat.targetY = stairUpY;
    placeAt(LAYER_UNDER, throneX, throneY, T.THRONE, {type:'throne'});
    // Boss
    const dk = spawnMonster('dread_king');
    dk.x = throneX; dk.y = throneY+1;
    dk.homeX = dk.x; dk.homeY = dk.y;
    worlds[LAYER_UNDER][dk.y][dk.x] = T.STONE;
    dk.isBoss = true;
    dk.hpMax = Math.round(dk.hpMax * DIFFICULTIES[state.difficulty].enemyHp);
    dk.hp = dk.hpMax;
    dk.weaponAtk = Math.round(dk.weaponAtk * DIFFICULTIES[state.difficulty].enemyAtk);
    monsters[LAYER_UNDER].push(dk);
  }

  // Northeast surface cave entrances
  const neCaveSearchR = Math.max(4, Math.round(Math.min(W_SURF, H_SURF) * 0.134));
  const neScatterX = Math.max(1, Math.round(W_SURF * 0.134));
  const neScatterY = Math.max(1, Math.round(H_SURF * 0.16));
  for (let i=0; i<3; i++){
    const neCave = findSpotNear(LAYER_SURFACE,
      Math.floor(W_SURF * 0.65) + randi(neScatterX),
      Math.floor(H_SURF * 0.07) + randi(neScatterY),
      t=>t===T.STONE||t===T.CAVE, neCaveSearchR);
    if (neCave){
      const [x,y] = neCave;
      const uSpot = findUndergroundNear(x, y, LAYER_UNDER, t=>t===T.CAVE||t===T.STONE, Math.max(10, Math.round(Math.min(W_UNDER, H_UNDER) * 0.36)))
                 || findSpot(LAYER_UNDER, t=>t===T.CAVE||t===T.STONE, 500);
      if (uSpot){
        for (let dy=-1;dy<=1;dy++) for (let dx=-1;dx<=1;dx++){
          const nx=uSpot[0]+dx, ny=uSpot[1]+dy;
          if (inBounds(LAYER_UNDER,nx,ny) && worlds[LAYER_UNDER][ny][nx]===T.STONE){
            worlds[LAYER_UNDER][ny][nx] = T.CAVE;
          }
        }
        placeAt(LAYER_SURFACE, x, y, T.STAIRS_DOWN, {
          type:'stairs', dir:'down', targetLayer:LAYER_UNDER, targetX:uSpot[0], targetY:uSpot[1]
        });
        placeAt(LAYER_UNDER, uSpot[0], uSpot[1], T.STAIRS_UP, {
          type:'stairs', dir:'up', targetLayer:LAYER_SURFACE, targetX:x, targetY:y
        });
      }
    }
  }

  // Eastern water cave entrances
  const wCaveMargin = Math.max(2, Math.round(Math.min(W_SURF, H_SURF) * 0.18));
  const wCaveScatter = Math.max(1, Math.round(W_SURF * 0.09));
  const wCaveSearchR = Math.max(3, Math.round(Math.min(W_SURF, H_SURF) * 0.09));
  for (let i=0; i<2; i++){
    const wCave = findSpotNear(LAYER_SURFACE,
      W_SURF - wCaveMargin - randi(wCaveScatter),
      wCaveMargin + randi(Math.max(1, H_SURF - wCaveMargin * 2)),
      t=>t===T.BEACH||t===T.PLAINS, wCaveSearchR);
    if (wCave){
      const [x,y] = wCave;
      for (let dy2=-3; dy2<=3; dy2++){
        for (let dx2=-3; dx2<=3; dx2++){
          const nx=x+dx2, ny=y+dy2;
          if (!inBounds(LAYER_SURFACE,nx,ny)) continue;
          const nt = worlds[LAYER_SURFACE][ny][nx];
          if (nt === T.BEACH && rand() < 0.3){
            const eel = rand() < 0.5 ? 'cave_eel' : 'cave_crab';
            const m = spawnMonster(eel);
            m.x = nx; m.y = ny;
            m.homeX = nx; m.homeY = ny;
            m.hpMax = Math.round(m.hpMax * DIFFICULTIES[state.difficulty].enemyHp);
            m.hp = m.hpMax;
            m.weaponAtk = Math.round(m.weaponAtk * DIFFICULTIES[state.difficulty].enemyAtk);
            monsters[LAYER_SURFACE].push(m);
          }
        }
      }
    }
  }

  // Standalone NPCs
  const npcSearchR = Math.max(6, Math.round(Math.min(W_SURF, H_SURF) * 0.27));
  const fh = findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.34), Math.floor(H_SURF * 0.11),
    (t,x,y,c)=>c===T.FOREST||c===T.SCATTERED_TREES, npcSearchR)
          || findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.34), Math.floor(H_SURF * 0.11),
    t=>t===T.PLAINS, npcSearchR);
  if (fh){
    // Clear forest cover and place NPC
    if (covers[LAYER_SURFACE]) covers[LAYER_SURFACE][fh[1]][fh[0]] = 0;
    worlds[LAYER_SURFACE][fh[1]][fh[0]] = T.PLAINS;
    placeAt(LAYER_SURFACE, fh[0], fh[1], T.NPC, {type:'npc', npcKey:'forest_hermit'});
  }
  const sch = findSpotNear(LAYER_SURFACE,
    Math.floor(W_SURF * 0.55), Math.floor(H_SURF * 0.29), t=>t===T.PLAINS, searchR);
  if (sch) placeAt(LAYER_SURFACE, sch[0], sch[1], T.NPC, {type:'npc', npcKey:'scholar'});
  const fish = findSpot(LAYER_SURFACE, (t)=>t===T.BEACH);
  if (fish) placeAt(LAYER_SURFACE, fish[0], fish[1], T.NPC, {type:'npc', npcKey:'fisherman'});

  // Signs, chests, and ruins are now handled by the structure registry.
  // Run the placement pass for both surface and underground.
  runStructurePlacement(LAYER_SURFACE, 'surface');
  runStructurePlacement(LAYER_UNDER, 'underground');

  // Books (not migrated — simple scatter, no constraints)
  const bookKeys = Object.keys(BOOKS);
  const shuffled = [...bookKeys].sort(() => rand()-0.5);
  const surfaceBooks = shuffled.slice(0,4);
  const underBooks   = shuffled.slice(4,7);
  for (const bk of surfaceBooks){
    const s = findSpot(LAYER_SURFACE, (t,x,y,c)=>(t===T.PLAINS||t===T.DESERT||t===T.MOUNTAIN) && !c);
    if (s) placeAt(LAYER_SURFACE, s[0], s[1], T.BOOK, {type:'book', bookKey:bk});
  }
  for (const bk of underBooks){
    const s = findSpot(LAYER_UNDER, (t,x,y,c)=>(t===T.CAVE||t===T.STONE) && !c);
    if (s) placeAt(LAYER_UNDER, s[0], s[1], T.BOOK, {type:'book', bookKey:bk});
  }
}

// ==================== MONSTER SPAWNING ====================
export function spawnMonstersInWorld(){
  const diffMul = DIFFICULTIES[state.difficulty];

  const surfaceDensity = {
    [T.PLAINS]:   0.008,
    [T.FOREST]:   0.04,
    [T.SCATTERED_TREES]: 0.02,
    [T.DESERT]:   0.035,
    [T.MOUNTAIN]: 0.035,
    [T.BEACH]:    0.003,
    [T.STONE]:    0.03,
    [T.CAVE]:     0.03,
    [T.MUSHFOREST]:0.05,
  };
  const spawnedWolves = [];
  for (let y=0;y<H_SURF;y++){
    for (let x=0;x<W_SURF;x++){
      const ground = worlds[LAYER_SURFACE][y][x];
      const cover = covers[LAYER_SURFACE] ? covers[LAYER_SURFACE][y][x] : 0;
      if (!isWalkable(ground, cover)) continue;
      if (cover && (cover === T.TOWN || cover === T.CASTLE || cover === T.BLACKSPIRE ||
          cover === T.SIGN || cover === T.NPC || cover === T.HOUSE || cover === T.SHOP ||
          cover === T.INN || cover === T.STAIRS_DOWN || cover === T.STAIRS_UP ||
          cover === T.CHEST || cover === T.BOOK)) continue;
      const safeZone = Math.max(3, Math.round(Math.min(W_SURF, H_SURF) * 0.063));
      const startX = state.player.startX || Math.floor(W_SURF * 0.50);
      const startY = state.player.startY || Math.floor(H_SURF * 0.56);
      if (Math.abs(x - startX) < safeZone && Math.abs(y - startY) < safeZone) continue;
      // Use cover type for biome if present, otherwise ground
      const biomeKey = cover || ground;
      const density = surfaceDensity[biomeKey] || 0;
      if (rand() >= density) continue;
      let eligible = Object.keys(MON).filter(k => {
        const d = MON[k];
        return d[12].includes(biomeKey) && d[13] === LAYER_SURFACE;
      });
      if (cover === T.MUSHFOREST){
        eligible = ['mushroom'];
      }
      // Atmosphere-driven: high elevation + dry → rock golems only
      {
        const atmo = getAtmosphere(x, y);
        if (atmo.elevation > 0.68 && atmo.moisture < 0.35 &&
            (ground === T.STONE || ground === T.CAVE || ground === T.MOUNTAIN)){
          eligible = ['rock_golem'];
        }
      }
      if (cover === T.FOREST && eligible.includes('wolf')){
        eligible.push('dire_wolf');
        eligible.push('wolf');
      }
      if (cover === T.SCATTERED_TREES && eligible.includes('wolf')){
        eligible.push('wolf');
      }
      if (!eligible.length) continue;
      const picked = choice(eligible);
      const m = spawnMonster(picked);
      m.x = x; m.y = y;
      m.homeX = x; m.homeY = y;
      m.hpMax = Math.round(m.hpMax * diffMul.enemyHp);
      m.hp = m.hpMax;
      m.weaponAtk = Math.round(m.weaponAtk * diffMul.enemyAtk);
      monsters[LAYER_SURFACE].push(m);
      if (picked === 'wolf' || picked === 'dire_wolf') spawnedWolves.push(m);
    }
  }
  // Wolf pair bonding
  const pairBonders = spawnedWolves.filter(w => w.personality === 'pair_bond' && !w.bondPartner);
  for (let i=0; i<pairBonders.length-1; i+=2){
    const a = pairBonders[i], b = pairBonders[i+1];
    if (chebyshev(a.x,a.y,b.x,b.y) < Math.max(5, Math.round(Math.min(W_SURF, H_SURF) * 0.134))){
      a.bondPartner = b;
      b.bondPartner = a;
    }
  }

  // Underground
  const underDensity = {
    [T.CAVE]:  0.03,
    [T.STONE]: 0.025,
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
        if (worlds[LAYER_UNDER][ny][nx]===T.LAVA){ biomeHint = T.LAVA; density = 0.04; }
        else if (worlds[LAYER_UNDER][ny][nx]===T.UWATER && biomeHint==null){ biomeHint = T.UWATER; density = 0.035; }
      }
      if (rand() >= density) continue;
      const targetT = biomeHint || ground;
      const eligible = Object.keys(MON).filter(k => {
        const d = MON[k];
        return d[12].includes(targetT) && d[13] === LAYER_UNDER;
      });
      if (!eligible.length) continue;
      const m = spawnMonster(choice(eligible));
      m.x = x; m.y = y;
      m.homeX = x; m.homeY = y;
      m.hpMax = Math.round(m.hpMax * diffMul.enemyHp);
      m.hp = m.hpMax;
      m.weaponAtk = Math.round(m.weaponAtk * diffMul.enemyAtk);
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
  for (const k in cellKeyToLayer) delete cellKeyToLayer[k];
  for (const k in LAYER_META) delete LAYER_META[k];
  clearPlacementState();

  generateLayer(LAYER_SURFACE, seed);
  generateLayer(LAYER_UNDER, seed);

  makeTownCell('millhaven');
  makeTownCell('thornwell');
  makeTownCell('dunegate');
  makeTownCell('karst');

  placeStructures();

  activateLayer(LAYER_SURFACE);
  state.player.layer = LAYER_SURFACE;
  state.player.x = state.player.startX || Math.floor(W_SURF * 0.50);
  state.player.y = state.player.startY || Math.floor(H_SURF * 0.56);
  spawnMonstersInWorld();
}
