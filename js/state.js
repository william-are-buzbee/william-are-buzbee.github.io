// ==================== SHARED MUTABLE STATE ====================
// Every module that needs to read or write game state imports from here.
// This avoids circular dependencies and keeps mutation centralized.

export const state = {
  player: null,
  gameState: 'title',
  turnCount: 0,
  cgAttrs: { siz: 1, strength: 1, chem: 1, vib: 1, vis: 1, central: 1, distributed: 1 },
  selectedSpecies: null,     // Prompt F: species key during character creation

  // ---- Day/night cycle ----
  // Global tick counter — incremented every player action.
  // Persists across layer transitions. A full cycle is 200 ticks.
  worldTick: 0,

  // ---- Look mode ----
  // When true the game waits for a direction key to examine a tile.
  lookMode: false,

  // ---- Player facing direction ----
  // dx/dy pair representing which way the player is looking.
  // Updated on move and attack; unchanged on rest/wait.
  // Default: facing south (down the screen).
  facing: { dx: 0, dy: 1 },

  // ---- World map exploration (biome-grid scale) ----
  // Set of "cx,cy" strings for target-map cells the player has visited.
  // Persisted in the save system alongside other state.
  exploredCells: new Set(),

  // ---- Field of Vision ----
  // fovSet: Set of "x,y" strings for tiles currently visible this turn.
  // Recomputed each player action; read by the renderer.
  // With the per-eye visual field, this is the BINOCULAR tier (covered by 2+
  // eyes) — the bright, full-detail identification zone.
  fovSet: null,
  // monocularSet: Set of "x,y" strings covered by exactly one eye this turn.
  // The lightly-dimmed middle rendering tier between binocular (fovSet) and
  // ambient/explored. Recomputed each player action alongside fovSet.
  monocularSet: null,
  // explored: { layerIndex → Set<"x,y"> } — tiles the player has ever seen.
  // Persists across turns so revisiting shows remembered terrain (dimmed).
  explored: {},

  // ---- Dynamic layer tracking ----
  // Index of the layer currently being rendered / ticked.
  // Only this layer runs enemy AI and is drawn each frame.
  activeLayer: null,

  // ---- Wind ----
  // windDirection: compass direction wind blows FROM (0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE)
  // A creature detecting airborne scent knows the source is toward windDirection.
  windDirection: 4,   // default: wind from the west
  windSpeed: 1,       // 0=still, 1=light, 2=moderate, 3=strong
};

// ==================== SPARSE WORLD STORAGE ====================
// worlds is now an Object keyed by layerIndex (number → 2-D grid).
// Layers are created on demand by the world generator and persist here
// so revisiting a layer restores its exact state.
//
//   worlds[0]  → surface grid  (created at game start)
//   worlds[1]  → first underground grid (created when first entered)
//   worlds[n]  → any layer — town interiors, shop interiors, etc.
//
// To iterate all loaded layers:  Object.keys(worlds)
// To check existence:            worlds[layerIndex] !== undefined
// To remove / unload:            delete worlds[layerIndex]

export const worlds = {};
export const covers = [];

// Features & monsters follow the same sparse pattern.
// Key format for features: "layer,x,y"
export const features = {};

// monsters[layerIndex] → array of monster objects on that layer.
// Only state.activeLayer's array is ticked each turn.
export const monsters = {};

// ==================== GROUND ITEM LAYER ====================
// groundItems[layerIndex] → plain object keyed by "x,y" strings.
// Each value is an array of item objects on that tile.
// Sparse: only tiles with items have entries.  Most tiles have none.
//   groundItems[0]["14,22"] → [{ id, type, name, sprite, quantity }, ...]
export const groundItems = {};

// Reverse look-up: cellKey (e.g. "millhaven") → layerIndex
export const cellKeyToLayer = {};

// ==================== LAYER HELPERS ====================

// Returns the next unused layerIndex.  Because worlds is an object we
// just pick max(existing keys) + 1, or 0 if empty.
export function nextLayerIndex() {
  const keys = Object.keys(worlds).map(Number);
  return keys.length === 0 ? 0 : Math.max(...keys) + 1;
}

// Convenience: does layerIndex already have generated data?
export function layerExists(layerIndex) {
  return worlds[layerIndex] !== undefined;
}

// Convenience: get the grid for a layer (or null).
export function getGrid(layerIndex) {
  return worlds[layerIndex] ?? null;
}

// Activate a layer — sets state.activeLayer so the renderer and AI
// tick loop know which grid to use.  Call this after ensuring the
// layer has been generated.
export function activateLayer(layerIndex) {
  state.activeLayer = layerIndex;
}
