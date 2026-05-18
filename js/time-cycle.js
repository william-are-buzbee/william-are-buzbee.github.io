// ==================== DAY / NIGHT CYCLE ====================
// Pure functions for time-of-day phase calculation and visual tinting.
//
// Cycle length: 600 ticks (one full day).
//   Dawn  :   0 – 89   (90 ticks, 15%)
//   Day   :  90 – 359  (270 ticks, 45%)
//   Dusk  : 360 – 449  (90 ticks, 15%)
//   Night : 450 – 599  (150 ticks, 25%)

import { state } from './state.js';

export const CYCLE_LENGTH = 600;

const PHASES = [
  { name: 'dawn',  start: 0,   len: 90  },
  { name: 'day',   start: 90,  len: 270 },
  { name: 'dusk',  start: 360, len: 90  },
  { name: 'night', start: 450, len: 150 },
];

/**
 * Given the current world tick, return { phase, progress }.
 *   phase    — 'dawn' | 'day' | 'dusk' | 'night'
 *   progress — 0.0–1.0 within that phase (0 = just entered, 1 = about to leave)
 */
export function getTimePhase(tick) {
  const t = ((tick % CYCLE_LENGTH) + CYCLE_LENGTH) % CYCLE_LENGTH; // handle negatives
  for (const p of PHASES) {
    if (t >= p.start && t < p.start + p.len) {
      return { phase: p.name, progress: (t - p.start) / p.len };
    }
  }
  // Shouldn't reach here, but fallback
  return { phase: 'day', progress: 0.5 };
}

/** Convenience — calls getTimePhase with the current state tick. */
export function currentTimePhase() {
  return getTimePhase(state.worldTick);
}

/** Advance the world clock by 1 tick. Called from endPlayerTurn. */
export function advanceTick() {
  state.worldTick++;
}

// ==================== VISUAL TINT ====================
// Returns { r, g, b, a } for the overlay colour at the given tick.
// Day → warm amber wash (perpetual late-afternoon feel from the dim
//        yellow-orange star).  Never fully transparent.
// Dusk → amber deepens, world dims significantly.
// Night → genuinely dark.  No blue shift — ambient light on this
//         planet is warm (yellow-orange star), so even scattered
//         night-sky light trends warm-dark, not cool.
// Dawn → dark warm tones lighten back toward the daytime amber baseline.

/**
 * Compute the RGBA tint for the viewport overlay.
 * @param {number} tick - the world tick (defaults to state.worldTick)
 * @returns {{ r:number, g:number, b:number, a:number }}
 */
export function getTint(tick) {
  if (tick === undefined) tick = state.worldTick;
  const { phase, progress } = getTimePhase(tick);

  switch (phase) {
    case 'day':
      // Persistent warm amber wash — dim yellow-orange star,
      // perpetual late-afternoon feel even at midday.
      return { r: 45, g: 28, b: 6, a: 0.07 };

    case 'dusk': {
      // Amber deepens, world dims significantly toward night.
      // progress 0 → daytime amber, progress 1 → near-night darkness
      const a = lerp(0.07, 0.52, progress);
      const r = lerp(45, 12, progress);
      const g = lerp(28, 6, progress);
      const b = lerp(6, 3, progress);
      return { r, g, b, a };
    }

    case 'night': {
      // Genuinely dark — low ambient light, warm-dark not blue-shifted.
      // Subtle breathing pulse for atmosphere.
      const a = lerp(0.52, 0.58, Math.sin(progress * Math.PI) * 0.5 + 0.5);
      return { r: 8, g: 5, b: 3, a };
    }

    case 'dawn': {
      // Dark warm tones lighten back toward daytime amber baseline.
      // progress 0 → like late night, progress 1 → daytime amber
      const a = lerp(0.52, 0.07, progress);
      const r = lerp(8, 45, progress);
      const g = lerp(5, 28, progress);
      const b = lerp(3, 6, progress);
      return { r, g, b, a };
    }

    default:
      return { r: 45, g: 28, b: 6, a: 0.07 };
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Draw the time-of-day tint overlay onto a canvas 2D context.
 * Call this AFTER all tiles, sprites, monsters, and the player have been drawn.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x       - left edge of the tinted region (px)
 * @param {number} y       - top edge of the tinted region (px)
 * @param {number} w       - width  of the tinted region (px)
 * @param {number} h       - height of the tinted region (px)
 * @param {number} layer   - current layer index
 */
export function drawTimeTint(ctx, x, y, w, h, layer) {
  // Surface only for now — easy to expand later
  if (layer !== 0) return;

  const { r, g, b, a } = getTint();
  if (a <= 0) return;

  ctx.fillStyle = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)})`;
  ctx.fillRect(x, y, w, h);
}
