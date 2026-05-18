// ==================== GROUND ITEM LAYER ====================
// Items that exist on the world map, independent of cover and features.
// Stored as sparse maps: groundItems[layerIndex]["x,y"] → array of item objects.
//
// Each item object has at minimum:
//   { id, type, name, sprite, quantity }

import { groundItems } from './state.js';

// ==================== ID GENERATION ====================

let _idCounter = 0;

/**
 * Return a unique string id for a ground item instance.
 * Combines a monotonic counter with a random suffix to stay unique
 * even across save/load boundaries.
 */
export function generateItemId() {
  _idCounter++;
  const rand = ((Math.random() * 0xffff) | 0).toString(16);
  return `gi_${_idCounter}_${rand}`;
}

// ==================== CORE API ====================

/**
 * Ensure the sparse map for a layer exists. Called internally before
 * every read/write so callers never need to initialise layers manually.
 */
function ensureLayer(layerIndex) {
  if (!groundItems[layerIndex]) {
    groundItems[layerIndex] = {};
  }
}

/**
 * Place an item on the ground at (x, y) on the given layer.
 * If the tile already has items, the new item is appended to the stack.
 *
 * @param {number} layerIndex
 * @param {number} x
 * @param {number} y
 * @param {object} itemObj — must have at least { id, type, name, sprite, quantity }
 */
export function placeItem(layerIndex, x, y, itemObj) {
  ensureLayer(layerIndex);
  const key = `${x},${y}`;
  if (!groundItems[layerIndex][key]) {
    groundItems[layerIndex][key] = [];
  }
  groundItems[layerIndex][key].push(itemObj);
}

/**
 * Remove a specific item by its unique id from (x, y).
 * Returns the removed item object, or null if not found.
 *
 * @param {number} layerIndex
 * @param {number} x
 * @param {number} y
 * @param {string} itemId
 * @returns {object|null}
 */
export function removeItem(layerIndex, x, y, itemId) {
  ensureLayer(layerIndex);
  const key = `${x},${y}`;
  const stack = groundItems[layerIndex][key];
  if (!stack) return null;

  const idx = stack.findIndex(it => it.id === itemId);
  if (idx === -1) return null;

  const [removed] = stack.splice(idx, 1);

  // Clean up empty arrays to keep the map sparse
  if (stack.length === 0) {
    delete groundItems[layerIndex][key];
  }

  return removed;
}

/**
 * Return the array of items at (x, y), or an empty array if none.
 * The returned array is the live reference — mutations will persist.
 *
 * @param {number} layerIndex
 * @param {number} x
 * @param {number} y
 * @returns {object[]}
 */
export function getItems(layerIndex, x, y) {
  ensureLayer(layerIndex);
  const key = `${x},${y}`;
  return groundItems[layerIndex][key] || [];
}

/**
 * Remove all items at (x, y).
 *
 * @param {number} layerIndex
 * @param {number} x
 * @param {number} y
 */
export function clearItems(layerIndex, x, y) {
  ensureLayer(layerIndex);
  const key = `${x},${y}`;
  delete groundItems[layerIndex][key];
}
