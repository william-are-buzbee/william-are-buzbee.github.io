// ==================== DISPLAY CONFIGURATION ====================
// Viewport state: zoom level, tile size, viewport dimensions.
// Pure data — no DOM references. Both rendering.js and main.js import from here.
//
// Key concept: sprite source resolution (SPRITE_NATIVE) is separate from
// display tile size (SPRITE_NATIVE × zoom). This decoupling supports future
// sprite packs at different resolutions and alternative renderers.

export const SPRITE_NATIVE = 16;          // source sprite resolution in pixels
const ZOOM_LEVELS = [1, 2, 3];            // multipliers → 16px, 32px, 48px tiles
const ZOOM_DEFAULT_INDEX = 1;             // default = ×2 (32px)

let _zoomIndex = ZOOM_DEFAULT_INDEX;

/** Current display tile size in pixels. */
export function tileSize() {
  return SPRITE_NATIVE * ZOOM_LEVELS[_zoomIndex];
}

/** Current zoom multiplier (1, 2, or 3). */
export function zoom() {
  return ZOOM_LEVELS[_zoomIndex];
}

/** Viewport width in tiles (always odd for centered player). */
export function viewW() {
  let vw = Math.floor(window.innerWidth / tileSize());
  if (vw % 2 === 0) vw--;
  return Math.max(3, vw); // floor at 3 for absurdly small windows
}

/** Viewport height in tiles (always odd for centered player). */
export function viewH() {
  let vh = Math.floor(window.innerHeight / tileSize());
  if (vh % 2 === 0) vh--;
  return Math.max(3, vh);
}

/** Cycle zoom in a direction (+1 = in, -1 = out). Returns true if changed. */
export function cycleZoom(direction) {
  const next = _zoomIndex + direction;
  if (next < 0 || next >= ZOOM_LEVELS.length) return false;
  _zoomIndex = next;
  return true;
}

/** Set zoom to a specific index (0, 1, 2). Returns true if changed. */
export function setZoom(index) {
  if (index < 0 || index >= ZOOM_LEVELS.length || index === _zoomIndex) return false;
  _zoomIndex = index;
  return true;
}
