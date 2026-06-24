// ==================== SPRITES-32 (32×32, faithful 2× upscale) ====================
// Parallel sprite pack for 32×32 resolution.  Every sprite is derived from
// the 16×16 source-of-truth in sprites.js.
//
// Organic shapes (creatures, trees, NPCs, boulders, curved structures) are
// upscaled via Scale2x (EPX) — a proven pixel-art algorithm that creates
// smooth diagonal edges by redistributing boundary pixels.  The result is
// the Arx Fatalis HD-texture-mod effect: clearly the same art, clearly
// higher resolution, with staircase-stepped diagonals replaced by clean
// curves.
//
// Repeating textures and geometric structures use mechanical 2× doubling
// (each source pixel → 2×2 block) to preserve their intentional patterns
// and sharp edges.
//
// Canvas: SPR=32, PIX=1 → 32×32 canvases (same physical size as the 16px
// pack's SPR=16, PIX=2).  Display scaling to actual tile size happens in
// rendering.js via drawImage(sprite, ..., tileSize, tileSize).
//
// Architecture: same 3-character pixel encoding as sprites.js
//   '#' = foreground color (COL_FG or tint primary)
//   '-' = mid-tone color  (COL_MID or tint shadow)
//   '.' = transparent

import { S as S16 } from './sprites.js';
import { COL_FG, COL_MID, BIOME } from './constants.js';

const SPR = 32;
const PIX = 1;

// ==================== UPSCALE ENGINES ====================

// Mechanical 2× doubling: each 16×16 pixel becomes a 2×2 block in 32×32.
// Used for repeating textures and geometric structures where sharp edges
// and exact patterns must be preserved.
function upscale2x(rows16) {
  const rows32 = [];
  for (let y = 0; y < 16; y++) {
    const row = rows16[y] || '';
    let doubled = '';
    for (let x = 0; x < 16; x++) {
      const ch = row[x] || '.';
      doubled += ch + ch;
    }
    rows32.push(doubled);
    rows32.push(doubled);
  }
  return rows32;
}

// Scale2x (EPX) — pixel-art anti-aliasing upscale algorithm.
//
// For each source pixel P with cardinal neighbors:
//      A
//    C P B       E0 E1
//      D    →    E2 E3
//
// E0 = (C==A && C!=D && A!=B) ? A : P
// E1 = (A==B && A!=C && B!=D) ? B : P
// E2 = (D==C && D!=B && C!=A) ? C : P
// E3 = (B==D && B!=A && D!=C) ? D : P
//
// At staircase diagonals, this extends the dominant pixel into the corner
// of the 2×2 output block, creating smooth 45° edges.  Straight runs and
// interior pixels pass through unchanged.  The algorithm is symmetrical
// and artifact-free by construction.
function scale2x(rows16) {
  const rows32 = [];
  for (let y = 0; y < 16; y++) {
    let topRow = '';
    let botRow = '';
    const row = rows16[y] || '';
    const rowAbove = rows16[y - 1] || '';
    const rowBelow = rows16[y + 1] || '';

    for (let x = 0; x < 16; x++) {
      const P = row[x] || '.';
      const A = (y > 0 ? rowAbove[x] : '.') || '.';   // up
      const B = (x < 15 ? row[x + 1] : '.') || '.';   // right
      const C = (x > 0 ? row[x - 1] : '.') || '.';    // left
      const D = (y < 15 ? rowBelow[x] : '.') || '.';   // down

      const E0 = (C === A && C !== D && A !== B) ? A : P;
      const E1 = (A === B && A !== C && B !== D) ? B : P;
      const E2 = (D === C && D !== B && C !== A) ? C : P;
      const E3 = (B === D && B !== A && D !== C) ? D : P;

      topRow += E0 + E1;
      botRow += E2 + E3;
    }
    rows32.push(topRow);
    rows32.push(botRow);
  }
  return rows32;
}

// ==================== SPRITE CATEGORIZATION ====================

// Sprites that use mechanical 2× only — repeating textures, dense walls,
// and geometric structures where sharp edges are intentional.
const MECHANICAL_SPRITES = new Set([
  // Ground textures (tiling patterns — smoothing would break repeats)
  'GRASS', 'SAND', 'WATER', 'DEEP_WATER', 'LAVA',
  'ROCK', 'ROCK_V2', 'ROCK_V3',
  'CAVE_WALL', 'CAVE_WALL_V2', 'CAVE_WALL_V3',
  'CAVE_FLOOR', 'CAVE_ROCK',
  'ROAD', 'WHEAT', 'WOOD_FLOOR',
  'BEACH', 'DIRT', 'MUD', 'FUNGAL_GRASS',
  'RUIN_FLOOR',
  // Dense walls (repeating block patterns)
  'RUIN_WALL', 'HUT_WALL',
  // Geometric structures (sharp edges intentional)
  'CRATE', 'GATE', 'STAIRS_DOWN', 'STAIRS_UP',
  'SIGN', 'CHEST', 'BOOK', 'LAMP_POST',
  // Repeating crop/planting pattern
  'FARM',
]);

// Everything NOT in MECHANICAL_SPRITES gets Scale2x anti-aliasing:
// creatures, player sprites, NPCs, trees, boulders, curved structures
// (barrel, well, fountain, potion), roofed buildings (house, town),
// corpse, campfire, ruin pillar, rock outcrop, etc.

// ==================== SPRITE GENERATION ====================

export const S32 = {};

for (const key of Object.keys(S16)) {
  if (MECHANICAL_SPRITES.has(key)) {
    S32[key] = upscale2x(S16[key]);
  } else {
    S32[key] = scale2x(S16[key]);
  }
}

// ==================== SPRITE BAKE SYSTEM ====================

export const spriteCache32 = {};

function buildSprite32(rows) {
  const c = document.createElement('canvas');
  c.width = SPR * PIX;
  c.height = SPR * PIX;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < SPR; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < SPR; x++) {
      const ch = row[x] || '.';
      if (ch === '#') g.fillStyle = COL_FG;
      else if (ch === '-') g.fillStyle = COL_MID;
      else continue;
      g.fillRect(x * PIX, y * PIX, PIX, PIX);
    }
  }
  return c;
}

// Bake all sprites into canvas cache
Object.keys(S32).forEach(k => spriteCache32[k] = buildSprite32(S32[k]));

// Corpse sprite uses custom meat/bone colors instead of default COL_FG/COL_MID
(function bakeCorpseSprite32() {
  const MEAT = '#a84040';
  const BONE = '#e0caa8';
  const rows = S32.CORPSE;
  if (!rows) return;
  const c = document.createElement('canvas');
  c.width = SPR * PIX;
  c.height = SPR * PIX;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < SPR; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < SPR; x++) {
      const ch = row[x] || '.';
      if (ch === '#') g.fillStyle = MEAT;
      else if (ch === '-') g.fillStyle = BONE;
      else continue;
      g.fillRect(x * PIX, y * PIX, PIX, PIX);
    }
  }
  spriteCache32['CORPSE'] = c;
})();

// ==================== TERRAIN TINTING ====================

const tintedCache32 = {};

function buildTintedTerrain32(spriteName, palette) {
  const rows = S32[spriteName];
  if (!rows) return null;
  const c = document.createElement('canvas');
  c.width = SPR * PIX;
  c.height = SPR * PIX;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.fillStyle = palette.bg;
  g.fillRect(0, 0, c.width, c.height);
  for (let y = 0; y < SPR; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < SPR; x++) {
      const ch = row[x] || '.';
      if (ch === '#') g.fillStyle = palette.fg;
      else if (ch === '-') g.fillStyle = palette.mid;
      else continue;
      g.fillRect(x * PIX, y * PIX, PIX, PIX);
    }
  }
  return c;
}

// Cave wall renders as dark warm stone — visible to native eyes, not pure black
const CAVE_WALL_DARK32 = { bg: '#1a1614', fg: '#342e28', mid: '#262220' };

export function tintedSprite32(spriteName, paletteName) {
  const key = spriteName + '|' + paletteName;
  if (tintedCache32[key]) return tintedCache32[key];
  if (paletteName === 'cave_wall') {
    tintedCache32[key] = buildTintedTerrain32(spriteName, CAVE_WALL_DARK32);
    return tintedCache32[key];
  }
  const pal = BIOME[paletteName];
  if (!pal) {
    console.warn('Missing palette:', paletteName, 'for sprite:', spriteName);
    tintedCache32[key] = buildTintedTerrain32(spriteName, BIOME.plains);
    return tintedCache32[key];
  }
  tintedCache32[key] = buildTintedTerrain32(spriteName, pal);
  return tintedCache32[key];
}

// ==================== MONSTER TINTING ====================

const tintedMonCache32 = {};

export function tintedMonsterSprite32(spriteName, tintColor) {
  if (!tintColor) return spriteCache32[spriteName];
  const key = spriteName + '|' + tintColor;
  if (tintedMonCache32[key]) return tintedMonCache32[key];
  const rows = S32[spriteName];
  if (!rows) return spriteCache32[spriteName];
  const c = document.createElement('canvas');
  c.width = SPR * PIX;
  c.height = SPR * PIX;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const darker = mixColors32(tintColor, '#000000', 0.3);
  for (let y = 0; y < SPR; y++) {
    const row = rows[y] || '';
    for (let x = 0; x < SPR; x++) {
      const ch = row[x] || '.';
      if (ch === '#') g.fillStyle = tintColor;
      else if (ch === '-') g.fillStyle = darker;
      else continue;
      g.fillRect(x * PIX, y * PIX, PIX, PIX);
    }
  }
  tintedMonCache32[key] = c;
  return c;
}

function mixColors32(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar * (1 - t) + br * t);
  const gg = Math.round(ag * (1 - t) + bg * t);
  const bl = Math.round(ab * (1 - t) + bb * t);
  return '#' + ((r << 16) | (gg << 8) | bl).toString(16).padStart(6, '0');
}

// ==================== TINT CACHE CLEAR ====================

export function clearTintCaches32() {
  Object.keys(tintedCache32).forEach(k => delete tintedCache32[k]);
  Object.keys(tintedMonCache32).forEach(k => delete tintedMonCache32[k]);
}
