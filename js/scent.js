// ==================== CHEMICAL SCENT SYSTEM ====================
// Two-layer model:
//   Ground scent  — deposited on tiles, persistent, follows exact path, no wind.
//   Airborne scent — emitted into air, wind-driven, fast-decaying plumes.
//
// See Chemical-Scent-System-Design.md for full design rationale.

import { state, worlds, monsters } from './state.js';
import { inBounds, getCover } from './world-state.js';
import { T, terrainInfo, tileBlocksVision, isWaterGround } from './terrain.js';
import { getBodyMap } from './constants.js';
import { log } from './log.js';
import {
  GROUND_EMISSION_BASE, AIRBORNE_EMISSION_BASE, BLOOD_EMISSION_MULT,
  AIRBORNE_DECAY_RATE, ADVECTION_RATE, SPREAD_RATE, SCENT_FLOOR,
} from './constants.js';

// ==================== DATA STRUCTURES ====================
// Scent maps are module-level, transient (not saved).
// On load, they start empty and rebuild as creatures move.

// groundScent[layer] = Map<"x,y", { predator, herbivore, blood, age }>
const _groundScent = {};

// airborneScent[layer] = Map<"x,y", { predator, herbivore, blood }>
const _airborneScent = {};

function _getGroundMap(layer) {
  if (!_groundScent[layer]) _groundScent[layer] = new Map();
  return _groundScent[layer];
}

function _getAirborneMap(layer) {
  if (!_airborneScent[layer]) _airborneScent[layer] = new Map();
  return _airborneScent[layer];
}

// ==================== SCENT TRANSPORT BLOCKING ====================
// Scent (airborne) propagates to any tile air can reach. It is stopped by
// solid obstacles — walls, void, dense rock — but NOT by water (air flows over
// open water) or by forest canopy (which only *reduces* transport, handled via
// the advection/spread modifiers below).
//
// We reuse tileBlocksVision(ground, cover) as the air-flow predicate because the
// set of "solid, light-blocking" tiles is the same set of "solid, air-blocking"
// tiles for our purposes: cave walls / void / dense rock all block, transparent
// water does not, and vision-penalty foliage is treated as passable (its damping
// is applied through advectionMod/spreadMod, not as a hard block). Crucially this
// also catches wall-type COVER tiles (hut walls, ruined walls, boulders) that the
// ground-only tile check would have missed.
function _blocksScent(layer, x, y) {
  const ground = worlds[layer]?.[y]?.[x];
  if (ground == null) return true;              // ungenerated / out of grid → blocked
  const cover = getCover(layer, x, y);
  return tileBlocksVision(ground, cover);
}

// ==================== WIND ====================

// Advection offset: given windDirection (where wind comes FROM),
// scent moves in the OPPOSITE direction (downwind).
// windDirection: 0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE
const WIND_OFFSETS = [
  [-1,  0], // 0: from E  → scent moves W
  [-1, -1], // 1: from SE → scent moves NW
  [ 0, -1], // 2: from S  → scent moves N
  [ 1, -1], // 3: from SW → scent moves NE
  [ 1,  0], // 4: from W  → scent moves E
  [ 1,  1], // 5: from NW → scent moves SE
  [ 0,  1], // 6: from N  → scent moves S
  [-1,  1], // 7: from NE → scent moves SW
];

const COMPASS_NAMES = ['east','southeast','south','southwest','west','northwest','north','northeast'];

/**
 * Gradually shift wind direction and speed.
 * Called once per player turn.
 */
function _updateWind() {
  // Small chance of direction shift each turn
  if (Math.random() < 0.03) {
    state.windDirection = (state.windDirection + (Math.random() < 0.5 ? 1 : 7)) % 8;
  }
  // Small chance of speed change
  if (Math.random() < 0.05) {
    const delta = Math.random() < 0.5 ? 1 : -1;
    state.windSpeed = Math.max(0, Math.min(3, state.windSpeed + delta));
  }
}

// ==================== TERRAIN MODIFIERS ====================

/**
 * Get terrain-dependent modifiers for scent behavior at a tile.
 * Returns { groundDecay, advectionMod, spreadMod }.
 */
function _getScentTerrainMods(layer, x, y) {
  const ground = worlds[layer]?.[y]?.[x];
  const cover = getCover(layer, x, y);

  let groundDecay = 0.970;  // default: firm soil
  let advectionMod = 1.0;
  let spreadMod = 1.0;

  const isCave = ground === T.CAVE_FLOOR || ground === T.CAVE_WALL || ground === T.CAVE_ROCK;

  if (isCave) {
    groundDecay = 0.985;   // stone — slow decay
    advectionMod = 0.05;   // near-stagnant air
    spreadMod = 0.3;
  } else if (isWaterGround(ground)) {
    groundDecay = 0.0;     // water dissolves ground scent instantly (water/deep/under)
    advectionMod = 1.2;    // wind accelerates over water
    spreadMod = 1.1;
  } else if (cover === T.FOREST || cover === T.MUSHFOREST) {
    groundDecay = 0.955;   // organic floor absorbs
    advectionMod = 0.3;    // canopy blocks wind
    spreadMod = 0.6;       // reduced mixing under canopy
  } else if (ground === T.SAND) {
    groundDecay = 0.920;   // porous, fast absorption
    advectionMod = 0.9;
    spreadMod = 1.0;
  } else if (ground === T.ROCK) {
    groundDecay = 0.985;   // non-porous surface
    advectionMod = 1.0;
    spreadMod = 1.0;
  }

  return { groundDecay, advectionMod, spreadMod };
}

// ==================== EMISSION ====================

/**
 * Emit scent for a single creature.
 * Deposits ground scent at current tile and adds airborne scent.
 */
function _emitCreatureScent(creature, layer) {
  if (!creature || creature.hp <= 0) return;
  const x = creature.x, y = creature.y;
  if (!inBounds(layer, x, y)) return;

  const mass = creature.totalMass || 5;
  const diet = creature.diet || 'predator';

  // Activity multiplier — proxied here through the creature's current behavior
  // label. The physically-grounded source is locomotor/respiratory intensity
  // (how hard the locomotion zones fire, breathing rate); see notes in the
  // accompanying summary. We use currentBehavior to stay consistent with how the
  // rest of the codebase represents activity state today.
  const behavior = creature.currentBehavior;
  let groundActivity = 1.0;
  let airActivity = 1.0;
  if (behavior === 'flee' || behavior === 'flee_refuge' || behavior === 'hunt') {
    groundActivity = 1.5;
    airActivity = 2.5;
  } else if (behavior === 'rest' || behavior === 'idle' || !creature.movedThisTurn) {
    groundActivity = 0.3;
    airActivity = 0.5;
  }

  // Metabolic channel
  const isPredator = diet === 'predator';
  const groundAmount = mass * GROUND_EMISSION_BASE * groundActivity;
  const airAmount = mass * AIRBORNE_EMISSION_BASE * airActivity;

  // Blood emission (if wounded)
  let bloodAmount = 0;
  if (creature.blood != null && creature.bloodMax != null && creature.bloodMax > 0) {
    const bloodLost = 1.0 - (creature.blood / creature.bloodMax);
    if (bloodLost > 0.01) {
      bloodAmount = mass * GROUND_EMISSION_BASE * BLOOD_EMISSION_MULT * bloodLost;
    }
  }

  const key = `${x},${y}`;

  // ── Ground deposit ──
  const gMap = _getGroundMap(layer);
  const gExisting = gMap.get(key);
  if (gExisting) {
    if (isPredator) gExisting.predator += groundAmount;
    else gExisting.herbivore += groundAmount;
    gExisting.blood += bloodAmount;
    gExisting.age = 0; // refresh age — most recent deposit
  } else {
    gMap.set(key, {
      predator: isPredator ? groundAmount : 0,
      herbivore: isPredator ? 0 : groundAmount,
      blood: bloodAmount,
      age: 0,
    });
  }

  // ── Airborne emission ──
  const aMap = _getAirborneMap(layer);
  const aExisting = aMap.get(key);
  if (aExisting) {
    if (isPredator) aExisting.predator += airAmount;
    else aExisting.herbivore += airAmount;
    aExisting.blood += bloodAmount * 0.3; // less blood aerosolizes than deposits
  } else {
    aMap.set(key, {
      predator: isPredator ? airAmount : 0,
      herbivore: isPredator ? 0 : airAmount,
      blood: bloodAmount * 0.3,
    });
  }
}

// ==================== GROUND LAYER UPDATE ====================

/**
 * Decay ground scent on all tiles. No spreading, no wind.
 */
function _updateGroundLayer(layer) {
  const gMap = _getGroundMap(layer);
  const toRemove = [];

  for (const [key, scent] of gMap) {
    const comma = key.indexOf(',');
    const x = +key.substring(0, comma);
    const y = +key.substring(comma + 1);

    const mods = _getScentTerrainMods(layer, x, y);
    const decay = mods.groundDecay;

    scent.predator *= decay;
    scent.herbivore *= decay;
    scent.blood *= decay;
    scent.age++;

    // Cleanup
    if (scent.predator < SCENT_FLOOR && scent.herbivore < SCENT_FLOOR && scent.blood < SCENT_FLOOR) {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) gMap.delete(key);
}

// ==================== AIRBORNE LAYER UPDATE ====================

/**
 * Advect + spread + decay the airborne scent layer.
 * Uses double-buffer to avoid order-dependency.
 */
function _updateAirborneLayer(layer) {
  const current = _getAirborneMap(layer);
  const next = new Map();

  const windDir = state.windDirection;
  const windSpd = state.windSpeed;
  const windOfs = WIND_OFFSETS[windDir];
  const advFraction = Math.min(1.0, windSpd * ADVECTION_RATE);

  const channels = ['predator', 'herbivore', 'blood'];

  for (const [key, scent] of current) {
    const comma = key.indexOf(',');
    const x = +key.substring(0, comma);
    const y = +key.substring(comma + 1);

    const mods = _getScentTerrainMods(layer, x, y);
    const tileAdvFraction = advFraction * mods.advectionMod;
    const tileSpreadFraction = SPREAD_RATE * mods.spreadMod;

    // Find air-reachable neighbors for spreading (open tiles, not solid walls)
    const neighbors = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (inBounds(layer, nx, ny) && !_blocksScent(layer, nx, ny)) {
          neighbors.push(`${nx},${ny}`);
        }
      }
    }

    for (const ch of channels) {
      const val = scent[ch];
      if (val < SCENT_FLOOR) continue;

      let remaining = val;

      // Advection — move fraction downwind
      const advAmount = val * tileAdvFraction;
      remaining -= advAmount;
      const dwx = x + windOfs[0], dwy = y + windOfs[1];
      const dwKey = `${dwx},${dwy}`;
      if (inBounds(layer, dwx, dwy) && !_blocksScent(layer, dwx, dwy)) {
        _addToMap(next, dwKey, ch, advAmount);
      } else {
        remaining += advAmount; // wall blocks — scent stays
      }

      // Spreading — distribute fraction to air-reachable neighbors
      const spreadTotal = val * tileSpreadFraction;
      remaining -= spreadTotal;
      if (neighbors.length > 0) {
        const perNeighbor = spreadTotal / neighbors.length;
        for (const nKey of neighbors) {
          _addToMap(next, nKey, ch, perNeighbor);
        }
      } else {
        remaining += spreadTotal; // nowhere to spread
      }

      // Remaining scent stays at current tile
      if (remaining > 0) {
        _addToMap(next, key, ch, remaining);
      }
    }
  }

  // Apply decay to entire next map
  const toRemove = [];
  for (const [key, scent] of next) {
    scent.predator *= AIRBORNE_DECAY_RATE;
    scent.herbivore *= AIRBORNE_DECAY_RATE;
    scent.blood *= AIRBORNE_DECAY_RATE;
    if (scent.predator < SCENT_FLOOR && scent.herbivore < SCENT_FLOOR && scent.blood < SCENT_FLOOR) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) next.delete(key);

  // Swap
  _airborneScent[layer] = next;
}

/** Add a value to a channel on a tile in a scent map, creating the entry if needed. */
function _addToMap(map, key, channel, amount) {
  let entry = map.get(key);
  if (!entry) {
    entry = { predator: 0, herbivore: 0, blood: 0 };
    map.set(key, entry);
  }
  entry[channel] += amount;
}

// ==================== PLAYER DETECTION ====================

// Per-detection-type log throttle so standing on a scented tile doesn't flood
// the game log every turn.
const _lastDetectionTurn = {
  groundPred: -99, groundHerb: -99, groundBlood: -99,
  airPred: -99, airHerb: -99, airBlood: -99,
};
const DETECTION_LOG_COOLDOWN = 3;

function _shouldLog(type) {
  const turn = state.turnCount || 0;
  if (turn - _lastDetectionTurn[type] < DETECTION_LOG_COOLDOWN) return false;
  _lastDetectionTurn[type] = turn;
  return true;
}

/**
 * Check what the player's chemical transducers detect at their current position.
 * Fires log messages for significant detections.
 * Called once per turn after scent maps update.
 */
function _detectPlayerScent() {
  const p = state.player;
  if (!p) return;
  const layer = p.layer;
  const key = `${p.x},${p.y}`;

  const bodyMap = getBodyMap(p);
  if (!bodyMap) return;

  // Find best contact and airborne chemical qualities across surviving zones
  let bestContact = 0;
  let bestAirborne = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const contact = zone.transducers?.chemical?.contact || 0;
    const airborne = zone.transducers?.chemical?.airborne || 0;
    if (contact > bestContact) bestContact = contact;
    if (airborne > bestAirborne) bestAirborne = airborne;
  }

  // ── Ground trail detection (contact transducers) ──
  if (bestContact > 0) {
    const gMap = _getGroundMap(layer);
    const gScent = gMap.get(key);
    if (gScent) {
      const contactThreshold = SCENT_FLOOR / bestContact;

      // Also check adjacent tiles for trail direction
      let freshestDir = null;
      let freshestAge = gScent.age;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const adj = gMap.get(`${p.x + dx},${p.y + dy}`);
          if (adj && adj.age < freshestAge) {
            freshestAge = adj.age;
            freshestDir = _offsetToCompass(dx, dy);
          }
        }
      }

      if (gScent.predator > contactThreshold && _shouldLog('groundPred')) {
        const freshness = gScent.age < 10 ? 'fresh' : gScent.age < 40 ? 'recent' : 'fading';
        const dirHint = freshestDir ? `, trail freshens toward the ${freshestDir}` : '';
        log(`You detect a ${freshness} predator trail here${dirHint}.`, 'warn');
      }
      if (gScent.herbivore > contactThreshold && _shouldLog('groundHerb')) {
        const freshness = gScent.age < 10 ? 'fresh' : gScent.age < 40 ? 'recent' : 'fading';
        const dirHint = freshestDir ? `, trail freshens toward the ${freshestDir}` : '';
        log(`You detect a ${freshness} grazer trail here${dirHint}.`, 'muted');
      }
      if (gScent.blood > contactThreshold && _shouldLog('groundBlood')) {
        log('You detect blood on the ground here.', 'hit');
      }
    }
  }

  // ── Airborne detection (airborne transducers) ──
  if (bestAirborne > 0) {
    const aMap = _getAirborneMap(layer);
    const aScent = aMap.get(key);
    if (aScent) {
      const airThreshold = SCENT_FLOOR / bestAirborne;
      const windName = COMPASS_NAMES[state.windDirection];
      const hasWind = state.windSpeed > 0;
      const dirHint = hasWind ? ` from the ${windName}` : '';

      if (aScent.predator > airThreshold && _shouldLog('airPred')) {
        const intensity = aScent.predator > 0.5 ? 'strong' : aScent.predator > 0.1 ? 'faint' : 'trace';
        log(`You catch ${intensity} predator scent${dirHint}.`, 'warn');
      }
      if (aScent.herbivore > airThreshold && _shouldLog('airHerb')) {
        const intensity = aScent.herbivore > 0.5 ? 'strong' : aScent.herbivore > 0.1 ? 'faint' : 'trace';
        log(`You catch ${intensity} grazer scent${dirHint}.`, 'muted');
      }
      if (aScent.blood > airThreshold && _shouldLog('airBlood')) {
        const intensity = aScent.blood > 0.3 ? 'strong' : 'faint';
        log(`You smell ${intensity} blood in the air${dirHint}.`, 'hit');
      }
    }
  }
}

/** Convert a dx,dy offset to a compass name. */
function _offsetToCompass(dx, dy) {
  if (dx ===  1 && dy ===  0) return 'east';
  if (dx ===  1 && dy ===  1) return 'southeast';
  if (dx ===  0 && dy ===  1) return 'south';
  if (dx === -1 && dy ===  1) return 'southwest';
  if (dx === -1 && dy ===  0) return 'west';
  if (dx === -1 && dy === -1) return 'northwest';
  if (dx ===  0 && dy === -1) return 'north';
  if (dx ===  1 && dy === -1) return 'northeast';
  return '';
}

// ==================== MASTER UPDATE ====================

/**
 * Full scent system update. Call once per player turn.
 * @param {number} layer — active layer
 */
export function updateScentSystem(layer) {
  const mons = monsters[layer] || [];

  // 1. Emit scent for all creatures on this layer
  for (const m of mons) {
    if (m.hp > 0) _emitCreatureScent(m, layer);
  }

  // Also emit for the player
  _emitCreatureScent(state.player, layer);

  // 2. Update ground layer (decay only)
  _updateGroundLayer(layer);

  // 3. Update airborne layer (advect + spread + decay)
  _updateAirborneLayer(layer);

  // 4. Wind shifts
  _updateWind();

  // 5. Player detection
  _detectPlayerScent();
}

// ==================== DEBUG ====================

/**
 * Debug: inspect scent at a specific tile.
 * Usage from console: scentAt(x, y)
 */
export function debugScentAt(x, y) {
  const layer = state.activeLayer;
  const key = `${x},${y}`;

  const gMap = _getGroundMap(layer);
  const aMap = _getAirborneMap(layer);
  const g = gMap.get(key);
  const a = aMap.get(key);

  console.log(`Scent at (${x},${y}) layer ${layer}:`);
  console.log(`  Wind: from ${COMPASS_NAMES[state.windDirection]}, speed ${state.windSpeed}`);
  if (g) {
    console.log(`  Ground: pred=${g.predator.toFixed(4)} herb=${g.herbivore.toFixed(4)} blood=${g.blood.toFixed(4)} age=${g.age}`);
  } else {
    console.log('  Ground: none');
  }
  if (a) {
    console.log(`  Airborne: pred=${a.predator.toFixed(4)} herb=${a.herbivore.toFixed(4)} blood=${a.blood.toFixed(4)}`);
  } else {
    console.log('  Airborne: none');
  }
}

/**
 * Debug: dump scent map stats.
 * Usage from console: scentStats()
 */
export function debugScentStats() {
  const layer = state.activeLayer;
  const gMap = _getGroundMap(layer);
  const aMap = _getAirborneMap(layer);

  let gMaxPred = 0, gMaxHerb = 0, gMaxBlood = 0;
  for (const [, s] of gMap) {
    if (s.predator > gMaxPred) gMaxPred = s.predator;
    if (s.herbivore > gMaxHerb) gMaxHerb = s.herbivore;
    if (s.blood > gMaxBlood) gMaxBlood = s.blood;
  }

  let aMaxPred = 0, aMaxHerb = 0, aMaxBlood = 0;
  for (const [, s] of aMap) {
    if (s.predator > aMaxPred) aMaxPred = s.predator;
    if (s.herbivore > aMaxHerb) aMaxHerb = s.herbivore;
    if (s.blood > aMaxBlood) aMaxBlood = s.blood;
  }

  console.log(`Scent stats (layer ${layer}):`);
  console.log(`  Wind: from ${COMPASS_NAMES[state.windDirection]}, speed ${state.windSpeed}`);
  console.log(`  Ground tiles: ${gMap.size} | max pred=${gMaxPred.toFixed(4)} herb=${gMaxHerb.toFixed(4)} blood=${gMaxBlood.toFixed(4)}`);
  console.log(`  Airborne tiles: ${aMap.size} | max pred=${aMaxPred.toFixed(4)} herb=${aMaxHerb.toFixed(4)} blood=${aMaxBlood.toFixed(4)}`);
}

// Export for debug
export { _getGroundMap, _getAirborneMap, COMPASS_NAMES };
