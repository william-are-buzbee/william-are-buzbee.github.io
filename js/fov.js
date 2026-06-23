// ==================== FIELD OF VISION ====================
// Recursive shadowcasting — standard roguelike FOV algorithm.
// Computes which tiles are visible from a given origin within a radius.
// A tile with vision-blocking cover is itself visible, but tiles behind it are not.
//
// PROBABILISTIC TREE TRANSPARENCY:
//   Trees (FOREST, MUSHFOREST) don't hard-block vision. Instead, each tree
//   tile is checked against a deterministic spatial hash seeded by both the
//   tree's position and the viewer's position. If the hash value falls
//   below the PER-based transparency threshold, the tree is see-through;
//   otherwise it blocks that angular slice like a wall.
//
//   Because the hash is deterministic, standing still always shows the same
//   pattern — no accumulation from re-checking. Moving to a new vantage
//   point produces a different pattern (different viewing angles).
//
//   PER 1 → 5% chance per tree (forests are effectively opaque walls).
//   PER 10 → 60% chance per tree (can generally see 2-4 tiles into dense forest).
//   Walls, boulders, and other non-walkable cover still block LOS completely.
//
// The player uses a PER-EYE VISUAL FIELD model (see Per-Eye-Visual-Field-Design.md):
//   1. Awareness bubble: full-circle FOV within 1 tile (the 8 adjacent squares).
//      Always visible (binocular) regardless of facing. Not affected by PER,
//      night, layer, or tree transparency rolls.
//   2. Eye fields: each eye on a non-destroyed body-map zone projects a cone
//      whose center direction comes from its placement ('lateral'/'forward')
//      and whose width comes from its fieldAngle. A single shadowcast over the
//      whole visual range supplies line-of-sight; each LOS tile is then
//      classified by how many eye cones contain it.
//   3. Binocular set (state.fovSet) = tiles in 2+ eye cones. Monocular set
//      (state.monocularSet) = tiles in exactly 1. Tiles in LOS but no eye cone
//      are not visible. The composite field is the union of all eyes' fields.
//
// Enemies still use the cone+awareness model (computeConeFOV); hasLOS rolls
// tree transparency per-tile using the monster's PER.

import { worlds, covers, state } from './state.js';
import { inBounds, getCover } from './world-state.js';
import { T, tileBlocksVision, tileHasVisionPenalty } from './terrain.js';

// Ambient terrain sensing — constants and the player body-map accessor.
// getBodyMap is defined in constants.js (enemy-ai.js and combat.js both import
// it from there); importing from constants.js avoids a circular dependency.
import {
  AMBIENT_VISUAL_COEFF, AMBIENT_VIB_COEFF,
  LAYER_SURFACE, LAYER_META,
  getBodyMap, getVisualConfig,
} from './constants.js';

// Time-of-day phase for the ambient visual light modifier.
import { getTimePhase } from './time-cycle.js';

// Import player stat functions here to avoid circular dependency issues.
// player.js has no dependency on fov.js, so this is safe.
import { playerViewRadius, awarenessRadius } from './player.js';

// Octant multipliers for the 8 cardinal+diagonal directions.
// Each row = [xx, xy, yx, yy] mapping (row, col) in octant space → (dx, dy) in world space.
const OCTANTS = [
  [ 1,  0,  0,  1],
  [ 0,  1,  1,  0],
  [ 0, -1,  1,  0],
  [-1,  0,  0,  1],
  [-1,  0,  0, -1],
  [ 0, -1, -1,  0],
  [ 0,  1, -1,  0],
  [ 1,  0,  0, -1],
];

// ==================== TREE TRANSPARENCY ====================
// Trees (and mushroom trees) are probabilistically transparent.
// Each tree's transparency is determined by a deterministic spatial hash
// of (tree position, viewer position). This means:
//   • Standing still: the same trees are always transparent/opaque.
//     No accumulation from re-rolling.
//   • Moving one tile: a new vantage point produces a new pattern.
//     Scouting from different positions reveals different parts of the forest.
//   • Returning to the same spot: same pattern as before (deterministic).
//
//   PER 1  →  5%  (almost never see through a tree)
//   PER 5  → ~30% (occasionally peek through one layer)
//   PER 7  → ~42% (meaningful but unreliable penetration)
//   PER 10 → 60%  (generally 2-4 tiles into dense forest)

/**
 * Probability that a creature with the given PER can see through a single
 * tree tile. Compared against the spatial hash for each tree.
 * @param {number} per — creature's PER (1–10)
 * @returns {number} probability 0–1
 */
export function treeTransparencyChance(per) {
  // Linear: 5% at PER 1, 60% at PER 10
  return 0.05 + (per - 1) * (0.55 / 9);
}

/**
 * Deterministic spatial hash for tree transparency.
 * Same (tree, viewer) pair always produces the same value in [0, 1).
 * @param {number} tx, ty — tree tile position
 * @param {number} vx, vy — viewer position
 * @returns {number} pseudo-random value in [0, 1)
 */
function treeHash(tx, ty, vx, vy) {
  let h = Math.imul(tx, 374761393) + Math.imul(ty, 668265263);
  h = h + Math.imul(vx, 1274126177) + Math.imul(vy, 1572735817) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/**
 * Compute the set of tiles visible from (ox, oy) on the given layer.
 * Full circular FOV — no directional filtering.
 * Used by enemies and as the base computation for cone FOV.
 *
 * When `per` is provided, tree-cover tiles are probabilistically transparent:
 * each tree independently rolls against the PER-based chance during the
 * shadowcast. A failed roll makes the tree cast a shadow like a wall.
 *
 * @param {number} layer   — layer index
 * @param {number} ox      — origin x
 * @param {number} oy      — origin y
 * @param {number} radius  — vision radius in tiles
 * @param {number} [per]   — viewer's PER stat (omit to skip tree rolls)
 * @returns {Set<string>}  — set of "x,y" keys for all visible tiles
 */
export function computeFOV(layer, ox, oy, radius, per) {
  const visible = new Set();
  // Origin is always visible
  visible.add(`${ox},${oy}`);

  // Precompute the transparency chance once (null if no PER → trees never block)
  const treeChance = per != null ? treeTransparencyChance(per) : null;

  for (const oct of OCTANTS) {
    castOctant(layer, ox, oy, radius, 1, 1.0, 0.0, oct, visible, treeChance);
  }

  return visible;
}

/**
 * Recursive shadowcasting for one octant.
 * @param {number} layer
 * @param {number} ox, oy   — world origin
 * @param {number} radius
 * @param {number} row       — current distance from origin (starts at 1)
 * @param {number} startSlope — top slope of the unblocked arc (1.0 initially)
 * @param {number} endSlope   — bottom slope of the unblocked arc (0.0 initially)
 * @param {number[]} oct      — octant multipliers [xx, xy, yx, yy]
 * @param {Set<string>} visible — accumulator
 * @param {number|null} treeChance — probability (0–1) of seeing through a tree
 *                                    tile, or null to skip tree rolls entirely
 */
function castOctant(layer, ox, oy, radius, row, startSlope, endSlope, oct, visible, treeChance) {
  if (startSlope < endSlope) return;

  const [xx, xy, yx, yy] = oct;
  let newStart = startSlope;

  for (let r = row; r <= radius; r++) {
    let blocked = false;

    for (let col = Math.round(r * startSlope); col >= 0; col--) {
      // If the column exceeds startSlope at this row, skip forward
      const leftSlope  = (col + 0.5) / (r - 0.5);
      const rightSlope = (col - 0.5) / (r + 0.5);

      if (leftSlope < endSlope) break;
      if (rightSlope > startSlope) continue;

      // Map octant-space (r, col) → world (wx, wy)
      const wx = ox + col * xx + r * xy;
      const wy = oy + col * yx + r * yy;

      // Distance check (circular FOV)
      const dx = wx - ox, dy = wy - oy;
      if (dx * dx + dy * dy > (radius + 0.5) * (radius + 0.5)) continue;

      if (!inBounds(layer, wx, wy)) continue;

      // This tile is visible (the tile itself is always revealed, even if it blocks)
      visible.add(`${wx},${wy}`);

      // Check if this tile blocks vision
      const ground = worlds[layer][wy][wx];
      const cover  = getCover(layer, wx, wy);
      let isBlocking = tileBlocksVision(ground, cover);

      // Probabilistic tree transparency: if this tile has a vision penalty
      // (trees/mushroom forest), check the deterministic spatial hash to
      // decide if it blocks this sightline. Same viewer position always
      // produces the same pattern — no accumulation from standing still.
      if (!isBlocking && treeChance != null && tileHasVisionPenalty(ground, cover)) {
        isBlocking = treeHash(wx, wy, ox, oy) >= treeChance;
      }

      if (blocked) {
        // Previous tile was blocking
        if (isBlocking) {
          // Still in a wall — shrink the start slope
          newStart = rightSlope;
        } else {
          // Emerged from a wall — start a new scan
          blocked = false;
          startSlope = newStart;
        }
      } else {
        if (isBlocking && r < radius) {
          // Hit a wall — recurse with the remaining open arc above this wall,
          // then mark this wall as the new shadow boundary.
          blocked = true;
          castOctant(layer, ox, oy, radius, r + 1, startSlope, (col + 0.5) / (r - 0.5), oct, visible, treeChance);
          newStart = rightSlope;
        }
      }
    }

    // If the last tile in the row was blocking, the entire remaining arc is shadowed
    if (blocked) break;
  }
}

// ==================== CONE + AWARENESS FOV ====================

// Pre-computed cosine threshold for the cone half-angle.
// Cached so we don't recompute trig every frame.
let _cachedConeAngle = -1;
let _cachedCosHalf = 0;

/**
 * Compute cone+awareness FOV for a creature with directional vision.
 *
 * 1. Run awareness-radius shadowcast (no tree rolls — adjacent tiles always visible).
 * 2. Run cone-depth shadowcast with probabilistic tree transparency.
 * 3. Keep awareness tiles (omnidirectional) + cone tiles (facing-direction only).
 *
 * @param {number} layer
 * @param {number} ox, oy  — creature position
 * @param {number} coneDepth — max forward vision range (PER-based, time-modified)
 * @param {number} awareR — awareness radius (always 1 — adjacent tiles only)
 * @param {number} fdx, fdy — facing direction (need not be normalized)
 * @param {number} coneAngle — cone width in degrees
 * @param {number} [per]    — viewer's PER stat (omit to skip tree rolls)
 * @returns {Set<string>}
 */
export function computeConeFOV(layer, ox, oy, coneDepth, awareR, fdx, fdy, coneAngle, per) {
  // Awareness bubble: no tree rolls (always see adjacent tiles).
  // Cone: probabilistic tree transparency via PER-based rolls.
  const awareFOV = computeFOV(layer, ox, oy, awareR);           // no tree rolls
  const coneFOV  = computeFOV(layer, ox, oy, coneDepth, per);   // tree rolls applied

  // If the cone is effectively 360° or more, merge both sets and return
  if (coneAngle >= 360) {
    for (const key of awareFOV) coneFOV.add(key);
    return coneFOV;
  }

  // Precompute cosine of the half-angle for the cone check
  if (coneAngle !== _cachedConeAngle) {
    _cachedConeAngle = coneAngle;
    _cachedCosHalf = Math.cos((coneAngle / 2) * Math.PI / 180);
  }
  const cosHalf = _cachedCosHalf;

  // Normalize facing direction (handles diagonals like {1,1})
  const fLen = Math.sqrt(fdx * fdx + fdy * fdy);
  const nfx = fLen > 0 ? fdx / fLen : 0;
  const nfy = fLen > 0 ? fdy / fLen : 1;  // default: face south

  const result = new Set();

  // (a) All awareness-bubble tiles are always visible (omnidirectional, no tree penalty)
  for (const key of awareFOV) {
    result.add(key);
  }

  // (b) Cone tiles: must be within the facing-direction cone.
  //     Tree rolls already applied during shadowcast (opaque trees cast shadows).
  for (const key of coneFOV) {
    if (result.has(key)) continue; // already added from awareness

    const comma = key.indexOf(',');
    const wx = +key.substring(0, comma);
    const wy = +key.substring(comma + 1);

    const dx = wx - ox;
    const dy = wy - oy;
    const dist2 = dx * dx + dy * dy;
    if (dist2 === 0) { result.add(key); continue; }

    // Dot product between normalized facing direction and tile direction
    const tLen = Math.sqrt(dist2);
    const dot = (nfx * dx + nfy * dy) / tLen;

    if (dot >= cosHalf) {
      result.add(key);
    }
  }

  return result;
}

// ==================== LINE-OF-SIGHT RAYCAST ====================
// Cheap single-target LOS check for enemy AI.  Uses Bresenham's line
// algorithm to walk tiles from (x0,y0) to (x1,y1).  Returns true if no
// vision-blocking tile interrupts the path.  The origin tile is never
// checked (a creature can always "see out" of its own tile); the
// destination tile is always reachable if nothing blocks the way to it.
//
// When `per` is provided, tree tiles are probabilistically transparent
// using the same deterministic spatial hash as the shadowcasting FOV.

export function hasLOS(layer, x0, y0, x1, y1, per) {
  // Same tile — trivially visible
  if (x0 === x1 && y0 === y1) return true;

  // Precompute tree transparency chance (null → trees never block)
  const treeChance = per != null ? treeTransparencyChance(per) : null;

  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1,  sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;

  while (true) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 <  dx) { err += dx; cy += sy; }

    // Reached target — line is clear
    if (cx === x1 && cy === y1) return true;

    // Intermediate tile — does it block vision?
    if (!inBounds(layer, cx, cy)) return false;
    const ground = worlds[layer][cy][cx];
    const cover  = getCover(layer, cx, cy);
    if (tileBlocksVision(ground, cover)) return false;

    // Deterministic tree transparency — same (tree, viewer) pair always
    // produces the same result. No accumulation from repeated checks.
    if (treeChance != null && tileHasVisionPenalty(ground, cover)) {
      if (treeHash(cx, cy, x0, y0) >= treeChance) return false;
    }
  }
}

// ==================== FOV STATE MANAGEMENT ====================

// ==================== PER-EYE VISUAL FIELD ====================
// Eye center direction offsets from zone facing, per placement type.
// Lateral: eyes face outward from the sides (prey configuration) — vast total
//   coverage, thin binocular strips front and (near-)rear.
// Forward: eyes face ahead with slight offset (predator configuration) —
//   heavy binocular overlap ahead, narrow monocular wings, large rear blind spot.
// These offsets are the tuning levers for binocular geometry; adding a new
// placement is just adding a new offset value here.
const EYE_OFFSETS = {
  lateral: 80,    // each eye center is ±80° from facing
  forward: 20,    // each eye center is ±20° from facing
};

/**
 * Check if a tile falls within an eye's conical field.
 * Pure angular test — line-of-sight is handled separately by the shadowcast.
 * @param {number} ox, oy — creature position
 * @param {number} wx, wy — tile position
 * @param {number} eyeCenterDeg — eye's center direction in degrees
 * @param {number} halfFieldDeg — half of the eye's field angle
 * @returns {boolean}
 */
function _isInEyeField(ox, oy, wx, wy, eyeCenterDeg, halfFieldDeg) {
  const dx = wx - ox, dy = wy - oy;
  if (dx === 0 && dy === 0) return true; // origin always covered
  const tileAngle = Math.atan2(dy, dx) * (180 / Math.PI);
  let diff = Math.abs(tileAngle - eyeCenterDeg);
  if (diff > 180) diff = 360 - diff;
  return diff <= halfFieldDeg;
}

/**
 * Recompute the player's visual field from its body-map eyes and update
 * state.fovSet (binocular), state.monocularSet (monocular), and state.explored.
 *
 * The composite field is the geometric union of every non-destroyed eye's cone.
 * A single shadowcast over the whole visual range supplies line-of-sight; each
 * LOS tile is then classified by how many eye cones contain it (2+ binocular,
 * exactly 1 monocular, 0 not visible). If no eye survives, only the radius-1
 * awareness bubble remains.
 *
 * Call once per player action (after position is finalized, before render),
 * and on layer entry / new game.
 */
export function updatePlayerFOV() {
  const p = state.player;
  if (!p) return;

  const layer = p.layer;
  const { dx: fdx, dy: fdy } = state.facing;
  const facingAngleDeg = Math.atan2(fdy, fdx) * (180 / Math.PI);

  // ── Read eye configuration from body map ──
  // The best (highest-acuity) live eye drives the field geometry. Destroying a
  // zone with eyes removes it from consideration here, so head destruction with
  // no other eyes leaves eyeConfig null and collapses the field.
  const bodyMap = p.bodyMap;
  let eyeConfig = null;

  if (bodyMap) {
    let bestAcuity = 0;
    for (const zone of bodyMap) {
      if (zone.destroyed) continue;
      const cfg = getVisualConfig(zone);
      if (cfg && cfg.acuity > bestAcuity) {
        bestAcuity = cfg.acuity;
        eyeConfig = cfg;
      }
    }
  }

  // ── Compute visual range ──
  // identRange: entity-identification depth (gameplay feel — short, PER/light-gated).
  // fullEyeRange: physical optical reach of the eye for field coverage.
  // The visual field extends to whichever is larger.
  const identRange = playerViewRadius(p);
  const lightMod = _getVisualLightModifier(layer);
  const fullEyeRange = eyeConfig
    ? Math.round(eyeConfig.acuity * AMBIENT_VISUAL_COEFF * lightMod)
    : 0;
  const visualRadius = Math.max(identRange, fullEyeRange);

  // ── Awareness bubble (always binocular, radius 1) ──
  const awareR = awarenessRadius(p);
  const awareFOV = computeFOV(layer, p.x, p.y, awareR); // no tree rolls

  // ── Full visual field shadowcast ──
  // One shadowcast for the entire visual range, then classify by eye cones.
  const fullFOV = visualRadius > 0
    ? computeFOV(layer, p.x, p.y, visualRadius, p.per)
    : new Set();

  // ── Classify tiles by eye coverage ──
  const binocular = new Set();
  const monocular = new Set();

  // Awareness bubble is always binocular (you sense your immediate surroundings).
  for (const key of awareFOV) {
    binocular.add(key);
  }

  if (eyeConfig && visualRadius > 0) {
    const offset = EYE_OFFSETS[eyeConfig.placement] || EYE_OFFSETS.forward;
    const leftEyeCenter = facingAngleDeg + offset;
    const rightEyeCenter = facingAngleDeg - offset;
    const halfField = eyeConfig.fieldAngle / 2;

    for (const key of fullFOV) {
      if (binocular.has(key)) continue; // already in the awareness bubble

      const comma = key.indexOf(',');
      const wx = +key.substring(0, comma);
      const wy = +key.substring(comma + 1);

      const inLeft = _isInEyeField(p.x, p.y, wx, wy, leftEyeCenter, halfField);
      const inRight = _isInEyeField(p.x, p.y, wx, wy, rightEyeCenter, halfField);

      if (inLeft && inRight) {
        binocular.add(key);
      } else if (inLeft || inRight) {
        monocular.add(key);
      }
      // else: in shadowcast LOS but outside both eye cones — not visible
    }
  }

  // ── Store results ──
  state.fovSet = binocular;
  state.monocularSet = monocular;

  // ── Merge both tiers into the explored set ──
  if (!state.explored[layer]) {
    state.explored[layer] = new Set();
  }
  const exp = state.explored[layer];
  for (const key of binocular) exp.add(key);
  for (const key of monocular) exp.add(key);
}

// ==================== AMBIENT TERRAIN SENSING ====================
// Passive, multi-channel terrain awareness around the player creature.
// Runs AFTER updatePlayerFOV() each turn. The directed foveal cone reveals
// terrain AND entities at high fidelity; ambient sensing extends only the
// *terrain* knowledge (the explored set) using channels that don't require a
// directed gaze: peripheral vision, airborne chemical signatures, and
// substrate-borne vibration. No entities are revealed here.
//
// Per-channel radii are computed from the creature's best transducer quality
// for that channel across all NON-destroyed body-map zones. Because the max is
// taken over live zones each turn, destroying transducer zones physically
// shrinks the relevant channel's reach (see Ambient-Terrain-Sensing-Design.md).

/**
 * Get terrain-based modifiers for ambient sensing channels.
 * Based on the ground tile and cover at the creature's position — local terrain
 * governs how well each signal propagates outward.
 * Returns { chem, vib }. The visual peripheral uses an LOS check instead of a
 * scalar modifier, so it has no entry here.
 *
 * @param {number} layer
 * @param {number} x, y — creature position
 * @returns {{chem: number, vib: number}}
 */
function _getAmbientTerrainModifiers(layer, x, y) {
  const ground = worlds[layer]?.[y]?.[x];
  const cover = getCover(layer, x, y);

  // Default modifiers (open terrain / grassland)
  let chem = 1.0;
  let vib = 0.9;

  // Underground (cave layer): stagnant air pools volatiles, rock carries vibration well.
  const isCave = ground === T.CAVE_FLOOR || ground === T.CAVE_WALL || ground === T.CAVE_ROCK;

  if (isCave) {
    chem = 0.15;
    vib = 1.2;
  } else if (cover === T.FOREST || cover === T.MUSHFOREST) {
    // Canopy traps volatiles; organic floor dampens vibration.
    chem = 0.45;
    vib = 0.7;
  } else if (ground === T.SAND) {
    // Decent air diffusion, terrible vibration propagation.
    chem = 0.85;
    vib = 0.3;
  } else if (ground === T.ROCK) {
    // Exposed rock: good air, excellent vibration.
    chem = 0.9;
    vib = 1.2;
  } else if (ground === T.WATER) {
    // Standing water: water volatiles dominate, vibration confused.
    chem = 0.8;
    vib = 0.5;
  }
  // else: grass/default → chem 1.0, vib 0.9

  return { chem, vib };
}

/**
 * Mark all in-bounds tiles within a circular radius as explored.
 * No line-of-sight check — used for omnidirectional non-visual channels
 * (chemical diffusion, vibration propagation), which travel around/through
 * obstacles rather than along sightlines.
 *
 * @param {number} layer
 * @param {number} ox, oy — origin
 * @param {number} radius — circle radius in tiles (may be fractional)
 * @param {Set<string>} explored — accumulator set of "x,y" keys
 */
function _markCircleExplored(layer, ox, oy, radius, explored) {
  const r = Math.ceil(radius);
  const r2 = radius * radius;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const wx = ox + dx;
      const wy = oy + dy;
      if (inBounds(layer, wx, wy)) {
        explored.add(`${wx},${wy}`);
      }
    }
  }
}

/**
 * Get the ambient light modifier for visual peripheral sensing.
 * Peripheral vision requires light — it collapses in darkness.
 * Mirrors the darkness/time-of-day logic in creatureViewRadius() (player.js)
 * but returns a 0–1 modifier instead of a tile count.
 * Returns 0.0 (no light) to 1.0 (full daylight).
 *
 * @param {number} layer
 * @returns {number} light modifier in [0, 1]
 */
function _getVisualLightModifier(layer) {
  // Determine if the current layer is "dark" (underground, lava, etc.).
  // Surface and town/shop interiors use time-based lighting; everything else is dark.
  const meta = LAYER_META[layer];
  const layerType = meta ? meta.type : (layer === LAYER_SURFACE ? 'surface' : 'underground');
  const isDark = layerType !== 'surface' && layerType !== 'town' && layerType !== 'shop';

  if (isDark) return 0.0;  // no ambient light underground

  // Surface — time of day governs available light.
  const { phase } = getTimePhase(state.worldTick);
  switch (phase) {
    case 'day':   return 1.0;
    case 'dawn':  return 0.5;
    case 'dusk':  return 0.5;
    case 'night': return 0.0;   // no peripheral vision in darkness
    default:      return 1.0;
  }
}

/**
 * Mark tiles as explored based on the player creature's NON-VISUAL ambient
 * sensory channels. Runs AFTER updatePlayerFOV() each turn. Visual exploration
 * (binocular + monocular) is already handled by the per-eye field in
 * updatePlayerFOV(); this pass extends terrain knowledge through channels that
 * don't require a directed gaze:
 *
 *   Chemical airborne — omnidirectional circle, no LOS (volatiles diffuse around obstacles).
 *   Vibration ground  — omnidirectional circle, no LOS (propagates through substrate).
 *
 * Entities are NOT revealed — only terrain is marked as explored. state.fovSet
 * is never touched. Player creature only; NPCs do not compute ambient sensing.
 */
export function updateAmbientSensing() {
  const p = state.player;
  if (!p) return;

  const layer = p.layer;

  // Ensure explored set exists for this layer
  if (!state.explored[layer]) {
    state.explored[layer] = new Set();
  }
  const explored = state.explored[layer];

  // ── Read transducer qualities from body map (best across non-destroyed zones) ──
  // Visual is intentionally absent here: the per-eye visual field in
  // updatePlayerFOV() already marks the entire binocular + monocular field as
  // explored, so a separate visual-peripheral pass would be redundant.
  const bodyMap = getBodyMap(p);
  let maxVibGround = 0;

  if (bodyMap) {
    for (const zone of bodyMap) {
      if (zone.destroyed) continue;
      const vib = zone.transducers?.vibration?.ground;
      if (vib != null && vib > maxVibGround) maxVibGround = vib;
    }
  }

  // ── Terrain modifiers for current position ──
  const mods = _getAmbientTerrainModifiers(layer, p.x, p.y);

  // ── Vibration ground (omnidirectional circle, no LOS) ──
  // Chemical airborne ambient sensing was removed: a chemical transducer cannot
  // sense terrain shape from diffuse volatiles — it senses scent sources (handled
  // by the scent system and the deliberate sniff action), not the layout of empty
  // ground. Vibration genuinely does carry substrate structure, so it stays.
  const vibRadius = maxVibGround * AMBIENT_VIB_COEFF * mods.vib;
  if (vibRadius >= 1) {
    _markCircleExplored(layer, p.x, p.y, vibRadius, explored);
  }
}
