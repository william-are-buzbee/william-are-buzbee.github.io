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
      // Subtle warm amber enhancement — native eyes evolved for this light.
      // Tints warm without dimming; the world feels like a comfortable amber afternoon.
      return { r: 50, g: 32, b: 8, a: 0.04 };

    case 'dusk': {
      // Amber deepens toward night, but native eyes compensate well.
      // progress 0 → daytime warmth, progress 1 → dim but navigable
      const a = lerp(0.04, 0.30, progress);
      const r = lerp(50, 18, progress);
      const g = lerp(32, 10, progress);
      const b = lerp(8, 4, progress);
      return { r, g, b, a };
    }

    case 'night': {
      // Dim but not blind — native eyes are sensitive in low light.
      // Warm-dark ambient, subtle breathing pulse for atmosphere.
      const a = lerp(0.30, 0.36, Math.sin(progress * Math.PI) * 0.5 + 0.5);
      return { r: 14, g: 8, b: 4, a };
    }

    case 'dawn': {
      // Night dims lighten back to daytime amber.
      // progress 0 → like late night, progress 1 → daytime warmth
      const a = lerp(0.30, 0.04, progress);
      const r = lerp(14, 50, progress);
      const g = lerp(8, 32, progress);
      const b = lerp(4, 8, progress);
      return { r, g, b, a };
    }

    default:
      return { r: 50, g: 32, b: 8, a: 0.04 };
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
