// ==================== RENDERING ====================
import { state, worlds, covers } from './state.js';
import { TILE, VIEW_W, VIEW_H, LAYER_UNDER, BIOME } from './constants.js';
import { T, terrainInfo } from './terrain.js';
import { spriteCache, tintedSprite, tintedMonsterSprite } from './sprites.js';
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
      // CAVE_ROCK tiles: near-black solid wall
      if (ground === T.CAVE_ROCK){
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(px, py, TILE, TILE);
        const rockHash = ((wx * 7919 + wy * 6271 + 1013) >>> 0) % 256;
        if (rockHash < 40){
          ctx.fillStyle = rockHash < 20 ? '#0e0e0e' : '#080808';
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
            ctx.fillStyle = '#484644';
            ctx.fillRect((decor*4)%24+4, (decor*7)%24+4, 3, 2);
          } else {
            // desiccated scrub stub — gray-brown, no green
            ctx.fillStyle = '#3a3630';
            const cx2 = (decor*3)%22+5;
            ctx.fillRect(cx2, 16, 2, 8);
            ctx.fillRect(cx2-2, 19, 2, 1);
            ctx.fillRect(cx2+2, 21, 2, 1);
          }
        }
        if (ground === T.ROCK && decor < 30){
          if (decor < 12){
            // small pebble cluster — warm earthy
            ctx.fillStyle = decor < 6 ? '#38302a' : '#2e281e';
            const sx = (decor*4)%20+4, sy = (decor*6)%18+6;
            ctx.fillRect(sx, sy, 3, 2);
            ctx.fillRect(sx+1, sy+2, 2, 1);
          } else if (decor < 20){
            // scattered rock chips — dark ochre
            ctx.fillStyle = '#443e2c';
            const sx = (decor*3)%18+5, sy = (decor*5)%16+8;
            ctx.fillRect(sx, sy, 2, 1);
            ctx.fillRect(sx+6, sy+3, 2, 1);
            ctx.fillRect(sx+3, sy+7, 1, 1);
          } else {
            // hairline crack across rock surface
            ctx.fillStyle = 'rgba(18,14,8,0.35)';
            const cy2 = (decor*3)%12+10;
            ctx.fillRect(4, cy2, 7, 1);
            ctx.fillRect(11, cy2-1, 5, 1);
            ctx.fillRect(16, cy2, 8, 1);
          }
        }
        if (ground === T.BEACH && decor < 30){
          if (decor < 8){
            // mineral-stained pebbles — warm ochre
            ctx.fillStyle = '#7a6840';
            const sx = (decor*5)%22+5, sy = (decor*7)%18+8;
            ctx.fillRect(sx, sy, 2, 1);
            ctx.fillRect(sx+1, sy+1, 1, 1);
          } else if (decor < 16){
            // tide-line mineral deposits
            ctx.fillStyle = 'rgba(50,38,18,0.35)';
            const ry = (decor*3)%16+10;
            for (let i=0;i<5;i++){
              const rx = 4 + i*5 + ((decor+i)%3);
              ctx.fillRect(rx, ry, 3, 1);
            }
          } else if (decor < 22){
            // amber foam line
            ctx.fillStyle = 'rgba(140,120,70,0.18)';
            const fy = (decor*4)%12+16;
            ctx.fillRect(3, fy, 18, 1);
            ctx.fillRect(6, fy+1, 12, 1);
          } else {
            // dark driftwood — deep brown
            ctx.fillStyle = '#3a2e18';
            const dwx = (decor*3)%20+4, dwy = (decor*5)%16+10;
            ctx.fillRect(dwx, dwy, 6, 2);
            ctx.fillRect(dwx+1, dwy-1, 1, 1);
          }
        }
        if (ground === T.CAVE_FLOOR && decor < 10){
          ctx.fillStyle = '#181410';
          ctx.fillRect((decor*4)%26+3, (decor*6)%20+6, 2, 3);
        }
        if (ground === T.DIRT_ROAD && decor < 25){
          if (decor < 10){
            ctx.fillStyle = 'rgba(24,18,8,0.4)';
            const ry = (decor*3)%10+12;
            ctx.fillRect(6, ry, 20, 1);
          } else if (decor < 18){
            ctx.fillStyle = '#3e3418';
            const px2 = (decor*4)%22+4, py2 = (decor*7)%20+6;
            ctx.fillRect(px2, py2, 2, 2);
            ctx.fillRect(px2+7, py2+3, 2, 1);
          } else {
            ctx.fillStyle = 'rgba(90,76,40,0.12)';
            const bx = (decor*3)%16+6, by = (decor*5)%14+8;
            ctx.fillRect(bx, by, 8, 5);
          }
        }
        if (ground === T.RUIN_FLOOR && decor < 20){
          if (decor < 10){
            ctx.fillStyle = '#222018';
            const cx2 = (decor*4)%20+4, cy2 = (decor*6)%18+4;
            ctx.fillRect(cx2, cy2, 1, 6);
            ctx.fillRect(cx2+1, cy2+3, 4, 1);
          } else {
            ctx.fillStyle = '#302e24';
            const dx2 = (decor*3)%18+6, dy2 = (decor*5)%16+8;
            ctx.fillRect(dx2, dy2, 3, 2);
            ctx.fillRect(dx2+1, dy2+2, 1, 1);
          }
        }
        if (ground === T.SHOP_INSIDE && decor < 12){
          ctx.fillStyle = 'rgba(50,34,12,0.15)';
          const gy = (decor*4)%20+6;
          ctx.fillRect(2, gy, 28, 1);
        }
        if (ground === T.FUNGAL_GRASS && decor < 18){
          if (decor < 9){
            // manganese mineral flecks — dark violet
            ctx.fillStyle = '#28203a';
            const dx2 = (decor*4)%22+4, dy2 = (decor*6)%18+6;
            ctx.fillRect(dx2, dy2, 3, 2);
          } else {
            // tiny chemotrophic spire stub — muted purple
            ctx.fillStyle = '#3e3450';
            const dx2 = (decor*3)%20+6;
            ctx.fillRect(dx2, 14, 1, 4);
            ctx.fillRect(dx2+1, 13, 1, 1);
          }
        }
        if (ground === T.MUD && decor < 15){
          // dark amber-brown organic puddle
          ctx.fillStyle = 'rgba(30,22,8,0.4)';
          const mx = (decor*4)%20+4, my = (decor*6)%16+8;
          ctx.fillRect(mx, my, 5, 3);
        }
        if (ground === T.DIRT && decor < 15){
          ctx.fillStyle = decor < 8 ? '#302410' : '#221a08';
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
          // dark photosynthetic mat debris at tree base — deep maroon
          ctx.fillStyle = '#1e0e0a';
          const dx2 = (decor*3)%20+4, dy2 = (decor*5)%10+18;
          ctx.fillRect(dx2, dy2, 5, 3);
          ctx.fillRect(dx2+1, dy2-1, 3, 1);
        }
        if (cover === T.MUSHFOREST && decor < 20){
          if (decor < 10){
            // chemotrophic colony mat fragment — dark violet
            ctx.fillStyle = '#3a2848';
            const dx2 = (decor*3)%20+4, dy2 = (decor*5)%14+14;
            ctx.fillRect(dx2, dy2, 3, 2);
            ctx.fillRect(dx2+1, dy2-1, 1, 1);
          } else {
            // fruiting spire base — muted purple-brown
            ctx.fillStyle = '#5a4248';
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

      // ---- FOV: fog overlay for seen-but-not-visible tiles ----
      if (!isVisible){
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(px, py, TILE, TILE);
        // Entities are NOT drawn on remembered-but-not-visible tiles
      } else {
        // ---- Entities (monster, player) ----
        drawEntityAtTile(wx, wy, px, py, layer);
      }
    }
  }

  drawTimeTint(ctx, 0, 0, VIEW_W * TILE, VIEW_H * TILE, layer);

  canvas.classList.toggle('stealth', state.player.stealth);
  ctx.restore();
  const logEl = document.getElementById('log');
  if (logEl) logEl.scrollTop = logEl.scrollHeight;
  updateUI();
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
    if (mon.hitFlash > 0){
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(px, py, TILE, TILE);
      mon.hitFlash--;
    }
    const frac = mon.hp/mon.hpMax;
    const barX = px + Math.round(2*S);
    const barY = py + Math.round(1*S);
    const barW = TILE - Math.round(4*S);
    const barH = Math.round(2*S);
    ctx.fillStyle = '#111';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = frac>0.5?'#fff':(frac>0.25?'#aaa':'#888');
    ctx.fillRect(barX, barY, Math.floor(barW*frac), barH);
    if (mon.alerted){
      ctx.fillStyle = '#d4a050';
      ctx.fillRect(px+TILE-Math.round(4*S), py+Math.round(2*S), Math.round(2*S), Math.round(4*S));
    }
  }

  if (wx === state.player.x && wy === state.player.y){
    const pspr = state.player.stealth ? spriteCache.PLAYER_STEALTH : spriteCache.PLAYER;
    ctx.drawImage(pspr, px, py, TILE, TILE);
    if (state.player.hitFlash > 0){
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(px, py, TILE, TILE);
      state.player.hitFlash--;
    }
  }
}

export { render };
