// ==================== RENDERING ====================
import { state, worlds, covers, groundItems } from './state.js';
import { TILE, VIEW_W, VIEW_H, LAYER_UNDER, BIOME } from './constants.js';
import { T, terrainInfo } from './terrain.js';
import { spriteCache, tintedSprite, tintedMonsterSprite, COLOR_PALETTES } from './sprites.js';
import { inBounds, isTownCell, monsterAt, getCover } from './world-state.js';
import { updateUI } from './ui.js';
import { drawTimeTint } from './time-cycle.js';

export const canvas = document.getElementById('viewport');
canvas.width  = VIEW_W * TILE;
canvas.height = VIEW_H * TILE;

// Publish viewport dimensions as CSS custom properties so the device shell,
// overlays, and display-size canvas all derive from VIEW_W / VIEW_H / TILE.
document.documentElement.style.setProperty('--vp-w', canvas.width  + 'px');
document.documentElement.style.setProperty('--vp-h', canvas.height + 'px');

export const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
canvas.style.imageRendering = 'pixelated';

const S = TILE / 32;

// ---- Ground item display priority ----
// When multiple items share a tile, render only the highest-priority one.
// Priority: corpse (4) > weapon/armor (3) > potion/food/book (2) > other (1).
const GROUND_ITEM_PRIORITY = { corpse: 4, weapon: 3, armor: 3, potion: 2, food: 2, book: 2 };
function groundItemPriority(stack) {
  let best = null, bestP = 0;
  for (const it of stack) {
    const p = GROUND_ITEM_PRIORITY[it.kind] || 1;
    if (p > bestP) { bestP = p; best = it; }
  }
  return best;
}

const VIEW_OFS_X = (canvas.width  - VIEW_W * TILE) >> 1;
const VIEW_OFS_Y = (canvas.height - VIEW_H * TILE) >> 1;

function render(){
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  ctx.save();
  ctx.translate(VIEW_OFS_X, VIEW_OFS_Y);

  const ox = state.player.x - (VIEW_W>>1);
  const oy = state.player.y - (VIEW_H>>1);
  const layer = state.player.layer;
  const coverGrid = covers[layer];

  // FOV visibility — when fovSet is null (first frame before any action),
  // treat all tiles as visible for backward compatibility.
  const fovActive  = state.fovSet !== null;
  const fovVisible = state.fovSet;
  const fovExplored = state.explored[layer];

  for (let vy=0; vy<VIEW_H; vy++){
    for (let vx=0; vx<VIEW_W; vx++){
      const wx = ox+vx, wy = oy+vy;
      const px = vx*TILE, py = vy*TILE;

      if (!inBounds(layer, wx, wy)){
        ctx.fillStyle = '#050505';
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }

      // ---- FOV: tile visibility state ----
      const tileKey = `${wx},${wy}`;
      const isVisible  = !fovActive || fovVisible.has(tileKey);
      const isExplored = !fovActive || (fovExplored && fovExplored.has(tileKey));

      // Unexplored: pure black
      if (!isExplored){
        ctx.fillStyle = '#000';
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }

      const ground = worlds[layer][wy][wx];
      const cover = coverGrid ? coverGrid[wy][wx] : 0;

      // VOID tiles: pure black, skip everything else
      if (ground === T.VOID){
        ctx.fillStyle = '#000000';
        ctx.fillRect(px, py, TILE, TILE);
        continue;
      }
      // CAVE_ROCK tiles: dark warm wall, visible to native eyes
      if (ground === T.CAVE_ROCK){
        ctx.fillStyle = '#181816';
        ctx.fillRect(px, py, TILE, TILE);
        const rockHash = ((wx * 7919 + wy * 6271 + 1013) >>> 0) % 256;
        if (rockHash < 40){
          ctx.fillStyle = rockHash < 20 ? '#242220' : '#141412';
          const rx = (rockHash * 3) % 20 + 4, ry = (rockHash * 7) % 20 + 4;
          ctx.save();
          ctx.translate(px, py);
          ctx.scale(S, S);
          ctx.fillRect(rx, ry, 4, 3);
          ctx.restore();
        }
        continue;
      }

      const tileHash = ((wx * 7919 + wy * 6271 + 1013) >>> 0) % 256;

      // ---- Draw GROUND ----
      const groundInfo = terrainInfo(ground);
      const rotVariant = tileHash % 4;

      // Cave wall uses variant sprites for tiling variety
      let groundSpriteName = groundInfo.sprite;
      if (ground === T.CAVE_WALL){
        const wallVar = ((wx * 3571 + wy * 2909) >>> 0) % 3;
        groundSpriteName = wallVar === 1 ? 'CAVE_WALL_V2' : wallVar === 2 ? 'CAVE_WALL_V3' : 'CAVE_WALL';
      }
      // Rock surface uses variant sprites for tiling variety
      if (ground === T.ROCK){
        const rockVar = ((wx * 3571 + wy * 2909) >>> 0) % 3;
        groundSpriteName = rockVar === 1 ? 'ROCK_V2' : rockVar === 2 ? 'ROCK_V3' : 'ROCK';
      }

      if (!cover && (ground === T.GRASS || ground === T.SAND || ground === T.CAVE_FLOOR || ground === T.CAVE_WALL || ground === T.ROCK) && rotVariant > 0){
        ctx.save();
        ctx.translate(px + TILE/2, py + TILE/2);
        ctx.rotate(rotVariant * Math.PI/2);
        ctx.drawImage(tintedSprite(groundSpriteName, groundInfo.palette), -TILE/2, -TILE/2, TILE, TILE);
        ctx.restore();
      } else {
        ctx.drawImage(tintedSprite(groundSpriteName, groundInfo.palette), px, py, TILE, TILE);
      }

      // ---- Ground decorations ----
      if (!cover && !monsterAt(wx,wy,layer) && !(wx===state.player.x && wy===state.player.y)){
        const decor = tileHash;
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(S, S);

        
        if (ground === T.SAND && decor < 12){
          if (decor < 6){
            // scattered pale pebbles on gray depleted ground
            ctx.fillStyle = '#605e5c';
            ctx.fillRect((decor*4)%24+4, (decor*7)%24+4, 3, 2);
          } else {
            // desiccated scrub stub — gray-brown, no green
            ctx.fillStyle = '#524e48';
            const cx2 = (decor*3)%22+5;
            ctx.fillRect(cx2, 16, 2, 8);
            ctx.fillRect(cx2-2, 19, 2, 1);
            ctx.fillRect(cx2+2, 21, 2, 1);
          }
        }
        if (ground === T.ROCK && decor < 30){
          if (decor < 12){
            // small pebble cluster — warm earthy
            ctx.fillStyle = decor < 6 ? '#524a42' : '#463e32';
            const sx = (decor*4)%20+4, sy = (decor*6)%18+6;
            ctx.fillRect(sx, sy, 3, 2);
            ctx.fillRect(sx+1, sy+2, 2, 1);
          } else if (decor < 20){
            // scattered rock chips — dark ochre
            ctx.fillStyle = '#605840';
            const sx = (decor*3)%18+5, sy = (decor*5)%16+8;
            ctx.fillRect(sx, sy, 2, 1);
            ctx.fillRect(sx+6, sy+3, 2, 1);
            ctx.fillRect(sx+3, sy+7, 1, 1);
          } else {
            // hairline crack across rock surface
            ctx.fillStyle = 'rgba(30,24,14,0.35)';
            const cy2 = (decor*3)%12+10;
            ctx.fillRect(4, cy2, 7, 1);
            ctx.fillRect(11, cy2-1, 5, 1);
            ctx.fillRect(16, cy2, 8, 1);
          }
        }
        if (ground === T.BEACH && decor < 30){
          if (decor < 8){
            // mineral-stained pebbles — warm ochre
            ctx.fillStyle = '#988258';
            const sx = (decor*5)%22+5, sy = (decor*7)%18+8;
            ctx.fillRect(sx, sy, 2, 1);
            ctx.fillRect(sx+1, sy+1, 1, 1);
          } else if (decor < 16){
            // tide-line mineral deposits
            ctx.fillStyle = 'rgba(72,56,28,0.35)';
            const ry = (decor*3)%16+10;
            for (let i=0;i<5;i++){
              const rx = 4 + i*5 + ((decor+i)%3);
              ctx.fillRect(rx, ry, 3, 1);
            }
          } else if (decor < 22){
            // amber foam line
            ctx.fillStyle = 'rgba(170,148,90,0.22)';
            const fy = (decor*4)%12+16;
            ctx.fillRect(3, fy, 18, 1);
            ctx.fillRect(6, fy+1, 12, 1);
          } else {
            // dark driftwood — deep brown
            ctx.fillStyle = '#544428';
            const dwx = (decor*3)%20+4, dwy = (decor*5)%16+10;
            ctx.fillRect(dwx, dwy, 6, 2);
            ctx.fillRect(dwx+1, dwy-1, 1, 1);
          }
        }
        if (ground === T.CAVE_FLOOR && decor < 10){
          ctx.fillStyle = '#302a22';
          ctx.fillRect((decor*4)%26+3, (decor*6)%20+6, 2, 3);
        }
        if (ground === T.DIRT_ROAD && decor < 25){
          if (decor < 10){
            ctx.fillStyle = 'rgba(40,30,14,0.4)';
            const ry = (decor*3)%10+12;
            ctx.fillRect(6, ry, 20, 1);
          } else if (decor < 18){
            ctx.fillStyle = '#5a4c28';
            const px2 = (decor*4)%22+4, py2 = (decor*7)%20+6;
            ctx.fillRect(px2, py2, 2, 2);
            ctx.fillRect(px2+7, py2+3, 2, 1);
          } else {
            ctx.fillStyle = 'rgba(120,100,56,0.15)';
            const bx = (decor*3)%16+6, by = (decor*5)%14+8;
            ctx.fillRect(bx, by, 8, 5);
          }
        }
        if (ground === T.RUIN_FLOOR && decor < 20){
          if (decor < 10){
            ctx.fillStyle = '#3a362c';
            const cx2 = (decor*4)%20+4, cy2 = (decor*6)%18+4;
            ctx.fillRect(cx2, cy2, 1, 6);
            ctx.fillRect(cx2+1, cy2+3, 4, 1);
          } else {
            ctx.fillStyle = '#4a4638';
            const dx2 = (decor*3)%18+6, dy2 = (decor*5)%16+8;
            ctx.fillRect(dx2, dy2, 3, 2);
            ctx.fillRect(dx2+1, dy2+2, 1, 1);
          }
        }
        if (ground === T.SHOP_INSIDE && decor < 12){
          ctx.fillStyle = 'rgba(72,50,20,0.18)';
          const gy = (decor*4)%20+6;
          ctx.fillRect(2, gy, 28, 1);
        }
        if (ground === T.FUNGAL_GRASS && decor < 18){
          if (decor < 9){
            // manganese mineral flecks — violet
            ctx.fillStyle = '#3e3456';
            const dx2 = (decor*4)%22+4, dy2 = (decor*6)%18+6;
            ctx.fillRect(dx2, dy2, 3, 2);
          } else {
            // tiny chemotrophic spire stub — clear purple
            ctx.fillStyle = '#5c4c6e';
            const dx2 = (decor*3)%20+6;
            ctx.fillRect(dx2, 14, 1, 4);
            ctx.fillRect(dx2+1, 13, 1, 1);
          }
        }
        if (ground === T.MUD && decor < 15){
          // amber-brown organic puddle
          ctx.fillStyle = 'rgba(46,36,14,0.4)';
          const mx = (decor*4)%20+4, my = (decor*6)%16+8;
          ctx.fillRect(mx, my, 5, 3);
        }
        if (ground === T.DIRT && decor < 15){
          ctx.fillStyle = decor < 8 ? '#4a3a1e' : '#382c12';
          const dx2 = (decor*3)%22+4, dy2 = (decor*7)%20+6;
          ctx.fillRect(dx2, dy2, 3, 2);
        }

        ctx.restore();
      }

      // ---- Cover decorations (drawn on ground, before cover sprite) ----
      // Forest and mushforest decorations when they are cover
      if (cover && !monsterAt(wx,wy,layer) && !(wx===state.player.x && wy===state.player.y)){
        const decor = tileHash;
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(S, S);

        if (cover === T.FOREST && decor < 15){
          // photosynthetic mat debris at tree base — visible deep maroon
          ctx.fillStyle = '#361c14';
          const dx2 = (decor*3)%20+4, dy2 = (decor*5)%10+18;
          ctx.fillRect(dx2, dy2, 5, 3);
          ctx.fillRect(dx2+1, dy2-1, 3, 1);
        }
        if (cover === T.MUSHFOREST && decor < 20){
          if (decor < 10){
            // chemotrophic colony mat fragment — visible violet
            ctx.fillStyle = '#583c68';
            const dx2 = (decor*3)%20+4, dy2 = (decor*5)%14+14;
            ctx.fillRect(dx2, dy2, 3, 2);
            ctx.fillRect(dx2+1, dy2-1, 1, 1);
          } else {
            // fruiting spire base — clear purple-brown
            ctx.fillStyle = '#7e5e68';
            const dx2 = (decor*4)%22+3;
            ctx.fillRect(dx2, 20, 2, 4);
            ctx.fillRect(dx2-1, 19, 4, 1);
          }
        }

        ctx.restore();
      }

      // ---- Draw COVER (overlay) ----
      if (cover){
        const coverInfo = terrainInfo(cover);
        ctx.drawImage(tintedSprite(coverInfo.sprite, coverInfo.palette), px, py, TILE, TILE);
      }

      // ---- Draw GROUND ITEM indicator ----
      // Rendered after cover but before entities so items sit on top of trees/mushrooms.
      // Priority: corpse > weapon/armor > potion/food/book > other.
      // Draws the highest-priority item's visual; others just get the gold dot.
      const giLayer = groundItems[layer];
      if (giLayer) {
        const giStack = giLayer[tileKey];
        if (giStack && giStack.length > 0) {
          const topItem = groundItemPriority(giStack);
          if (topItem && topItem.kind === 'corpse' && spriteCache['CORPSE']) {
            // Draw corpse sprite at half-opacity so it's visible but subdued
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.drawImage(spriteCache['CORPSE'], px, py, TILE, TILE);
            ctx.restore();
          } else {
            // Default gold dot for non-corpse items
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(2, 25, 6, 6);
            ctx.fillStyle = '#d4a840';
            ctx.fillRect(3, 26, 4, 4);
            ctx.restore();
          }
          // If multiple items, also draw the gold dot on corpse tiles as a stack hint
          if (giStack.length > 1 && topItem && topItem.kind === 'corpse') {
            ctx.save();
            ctx.translate(px, py);
            ctx.scale(S, S);
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(2, 25, 6, 6);
            ctx.fillStyle = '#d4a840';
            ctx.fillRect(3, 26, 4, 4);
            ctx.restore();
          }
        }
      }

      // ---- FOV: fog overlay for seen-but-not-visible tiles ----
      if (!isVisible){
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fillRect(px, py, TILE, TILE);
        // Entities are NOT drawn on remembered-but-not-visible tiles
      } else {
        // ---- Entities (monster, player) ----
        drawEntityAtTile(wx, wy, px, py, layer);
      }
    }
  }

  drawTimeTint(ctx, 0, 0, VIEW_W * TILE, VIEW_H * TILE, layer);

  // ── Prompt N: Render creatures detected through non-visual senses ──
  // Draws sprites for creatures the player senses (chemical, vibration)
  // but cannot see visually. The tile remains fogged/dark; only the
  // creature sprite appears on top.
  if (state.player.sensedCreatures && state.player.sensedCreatures.length > 0) {
    for (const creature of state.player.sensedCreatures) {
      // Convert world position to viewport position
      const svx = creature.x - ox;
      const svy = creature.y - oy;
      // Skip if outside the viewport
      if (svx < 0 || svx >= VIEW_W || svy < 0 || svy >= VIEW_H) continue;
      const spx = svx * TILE;
      const spy = svy * TILE;
      // Draw the creature sprite identically to how drawEntityAtTile draws monsters
      let tintColor = null;
      if (creature.tint) {
        tintColor = creature.tint.startsWith('#') ? creature.tint : (BIOME[creature.tint] && BIOME[creature.tint].tint);
      }
      const spr = tintColor ? tintedMonsterSprite(creature.spr, tintColor) : spriteCache[creature.spr];
      if (spr) ctx.drawImage(spr, spx, spy, TILE, TILE);
      // Facing indicator
      if (creature.facing) {
        drawFacingIndicator(ctx, spx, spy, TILE, creature.facing);
      }
    }
  }

  canvas.classList.toggle('stealth', state.player.stealth);
  ctx.restore();
  const logEl = document.getElementById('log');
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
  updateUI();
}

// ─── Prompt G: Facing direction indicator for enemies ───
// Draws a small directional chevron in the top-right corner of the tile.
// facing: { dx, dy } — the direction the creature is looking.
// Converts dx/dy to an angle and draws a rotated triangle.
const _FACING_ANGLES = {
  '0,-1':  0,                    // N
  '1,-1':  Math.PI * 0.25,      // NE
  '1,0':   Math.PI * 0.5,       // E
  '1,1':   Math.PI * 0.75,      // SE
  '0,1':   Math.PI,             // S
  '-1,1':  Math.PI * 1.25,      // SW
  '-1,0':  Math.PI * 1.5,       // W
  '-1,-1': Math.PI * 1.75,      // NW
};

function drawFacingIndicator(ctx, screenX, screenY, tileSize, facing) {
  const indicatorSize = Math.floor(tileSize * 0.2);
  // Position in top-right corner of tile
  const cx = screenX + tileSize - indicatorSize - 2;
  const cy = screenY + indicatorSize + 2;

  // Facing as angle from dx/dy
  const key = `${facing.dx},${facing.dy}`;
  const angle = _FACING_ANGLES[key] ?? 0;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);

  // Draw a small triangle pointing up (rotated to face correct direction)
  ctx.beginPath();
  ctx.moveTo(0, -indicatorSize);                          // tip
  ctx.lineTo(-indicatorSize * 0.5, indicatorSize * 0.3);  // bottom-left
  ctx.lineTo(indicatorSize * 0.5, indicatorSize * 0.3);   // bottom-right
  ctx.closePath();

  ctx.fillStyle = 'white';
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

// Draw monster and player at a tile position
function drawEntityAtTile(wx, wy, px, py, layer){
  const mon = monsterAt(wx, wy, layer);
  if (mon){
    let tintColor = null;
    if (mon.tint){
      tintColor = mon.tint.startsWith('#') ? mon.tint : (BIOME[mon.tint] && BIOME[mon.tint].tint);
    }
    const spr = tintColor ? tintedMonsterSprite(mon.spr, tintColor) : spriteCache[mon.spr];
    if (spr) ctx.drawImage(spr, px, py, TILE, TILE);

    // Prompt G: facing indicator overlay
    if (mon.facing) {
      drawFacingIndicator(ctx, px, py, TILE, mon.facing);
    }

    if (mon.hitFlash > 0){
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(px, py, TILE, TILE);
      mon.hitFlash--;
    }
    // Prompt G.3: enemy health bars removed — player assesses condition via examine
    if (mon.alerted){
      ctx.fillStyle = '#d4a050';
      ctx.fillRect(px+TILE-Math.round(4*S), py+Math.round(2*S), Math.round(2*S), Math.round(4*S));
    }
  }

  if (wx === state.player.x && wy === state.player.y){
    const bodyKey = { meso:'PLAYER_MESO', apex:'PLAYER_APEX', grazer:'PLAYER_GRAZER' }[state.player.bodyType] || 'PLAYER_MESO';
    const stealthKey = bodyKey + '_STEALTH';
    const sprKey = state.player.stealth ? stealthKey : bodyKey;
    // Apply creature color palette if set
    const palEntry = COLOR_PALETTES[state.player.colorPalette];
    const pspr = palEntry
      ? tintedMonsterSprite(sprKey, palEntry.color)
      : spriteCache[sprKey];
    ctx.drawImage(pspr, px, py, TILE, TILE);
    if (state.player.hitFlash > 0){
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(px, py, TILE, TILE);
      state.player.hitFlash--;
    }
  }
}

export { render };
