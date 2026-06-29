// ==================== CHEMICAL SCENT SYSTEM ====================
// Two-layer model:
//   Ground scent  — deposited on tiles, persistent, follows exact path, no wind.
//   Airborne scent — emitted into air, wind-driven, fast-decaying plumes.
//
// Each tile carries a vector of MOLECULAR_CLASSES (8 volatile families), not a
// few named "creature type" channels. What a creature emits is determined purely
// by its body: a per-species emission profile distributes its metabolic output
// across the molecular classes. Detection reads those classes back out and the
// reader infers what produced them. No tile ever stores "predator" — it stores
// ketones and amines, and a nose that knows what ketones+amines mean calls that
// a meat-eater.
//
// See Chemical-Scent-System-Design.md for full design rationale.

import { state, worlds, monsters } from './state.js';
import { inBounds, getCover } from './world-state.js';
import { T, terrainInfo, tileBlocksVision, isWaterGround } from './terrain.js';
import { getBodyMap, SCENT_PROFILES } from './constants.js';
import { log, LOG_CATEGORIES } from './log.js';
import {
  GROUND_EMISSION_BASE, AIRBORNE_EMISSION_BASE, BLOOD_EMISSION_MULT,
  AIRBORNE_DECAY_RATE, ADVECTION_RATE, SPREAD_RATE, SCENT_FLOOR,
} from './constants.js';

// ==================== MOLECULAR CLASSES ====================
// The volatile families a chemical transducer can resolve. Each is a broad class
// of compounds produced by metabolism, tissue, or terrain:
//   ketones    — carnivore metabolism
//   amines     — protein breakdown, carnivore indicator
//   terpenoids — tree/plant resins, forest terrain
//   greenLeaf  — fresh vegetation, herbivore digestion
//   hemolymph  — blood (copper-based alien)
//   fattyAcids — general animal metabolism
//   sulfur     — wetland, decay, cave air
//   phenolics  — woody/fungal vegetation
export const MOLECULAR_CLASSES = [
  'ketones', 'amines', 'terpenoids', 'greenLeaf',
  'hemolymph', 'fattyAcids', 'sulfur', 'phenolics',
];

/** A fresh zeroed scent vector (airborne entry, or base of a ground entry). */
function _emptyScent() {
  return {
    ketones: 0, amines: 0, terpenoids: 0, greenLeaf: 0,
    hemolymph: 0, fattyAcids: 0, sulfur: 0, phenolics: 0,
  };
}

/** A fresh zeroed ground entry — scent vector plus an age counter. */
function _emptyGroundScent() {
  return { ..._emptyScent(), age: 0 };
}

// ==================== DATA STRUCTURES ====================
// Scent maps are module-level, transient (not saved).
// On load, they start empty and rebuild as creatures move.

// groundScent[layer]  = Map<"x,y", { ...8 classes, age }>
const _groundScent = {};

// airborneScent[layer] = Map<"x,y", { ...8 classes }>
const _airborneScent = {};

// Self-shadow maps — track ONLY the player's own emission with identical
// transport physics. Subtracted at detection time so the player never
// smells their own scent trail or deposits.
const _selfGroundScent = {};
const _selfAirborneScent = {};

function _getGroundMap(layer) {
  if (!_groundScent[layer]) _groundScent[layer] = new Map();
  return _groundScent[layer];
}

function _getAirborneMap(layer) {
  if (!_airborneScent[layer]) _airborneScent[layer] = new Map();
  return _airborneScent[layer];
}

function _getSelfGroundMap(layer) {
  if (!_selfGroundScent[layer]) _selfGroundScent[layer] = new Map();
  return _selfGroundScent[layer];
}

function _getSelfAirborneMap(layer) {
  if (!_selfAirborneScent[layer]) _selfAirborneScent[layer] = new Map();
  return _selfAirborneScent[layer];
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
 * Resolve a creature's emission profile — the fractions of its metabolic output
 * that fall into each molecular class. This is a property of the body, looked up
 * by species first, then body-map key, then creature key. The fallback is a
 * generic animal signature for any creature without a defined profile yet.
 */
function _getScentProfile(creature) {
  return SCENT_PROFILES[creature.species]
      || SCENT_PROFILES[creature.bodyMapKey]
      || SCENT_PROFILES[creature.key]
      || { fattyAcids: 0.5, ketones: 0.3, amines: 0.2 };
}

/**
 * Emit scent for a single creature.
 * Deposits ground scent at current tile and adds airborne scent, distributing
 * the total emission across molecular classes via the species profile. Blood
 * (hemolymph) is added separately when the creature is wounded.
 */
function _emitCreatureScent(creature, layer) {
  if (!creature || creature.hp <= 0) return;
  const x = creature.x, y = creature.y;
  if (!inBounds(layer, x, y)) return;

  const mass = creature.totalMass || 5;

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

  // Total metabolic emission (mass × base × activity), distributed across classes.
  const groundAmount = mass * GROUND_EMISSION_BASE * groundActivity;
  const airAmount = mass * AIRBORNE_EMISSION_BASE * airActivity;
  const profile = _getScentProfile(creature);

  // Blood emission (if wounded) — added to the hemolymph class only.
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
  let gEntry = gMap.get(key);
  if (!gEntry) {
    gEntry = _emptyGroundScent();
    gMap.set(key, gEntry);
  }
  for (const cls of MOLECULAR_CLASSES) {
    const frac = profile[cls] || 0;
    if (frac > 0) gEntry[cls] += groundAmount * frac;
  }
  gEntry.hemolymph += bloodAmount;
  gEntry.age = 0; // refresh age — most recent deposit

  // ── Airborne emission ──
  const aMap = _getAirborneMap(layer);
  let aEntry = aMap.get(key);
  if (!aEntry) {
    aEntry = _emptyScent();
    aMap.set(key, aEntry);
  }
  for (const cls of MOLECULAR_CLASSES) {
    const frac = profile[cls] || 0;
    if (frac > 0) aEntry[cls] += airAmount * frac;
  }
  aEntry.hemolymph += bloodAmount * 0.3; // less blood aerosolizes than deposits

  // ── Self-shadow deposit (player only) ──
  // Mirror the exact same emission into shadow maps so detection can subtract it.
  // Must include the blood/hemolymph component — otherwise the subtraction leaves
  // a hemolymph residual after bleeding stops.
  if (creature === state.player) {
    const sgMap = _getSelfGroundMap(layer);
    let sgEntry = sgMap.get(key);
    if (!sgEntry) {
      sgEntry = _emptyGroundScent();
      sgMap.set(key, sgEntry);
    }
    for (const cls of MOLECULAR_CLASSES) {
      const frac = profile[cls] || 0;
      if (frac > 0) sgEntry[cls] += groundAmount * frac;
    }
    sgEntry.hemolymph += bloodAmount;
    sgEntry.age = 0;

    const saMap = _getSelfAirborneMap(layer);
    let saEntry = saMap.get(key);
    if (!saEntry) {
      saEntry = _emptyScent();
      saMap.set(key, saEntry);
    }
    for (const cls of MOLECULAR_CLASSES) {
      const frac = profile[cls] || 0;
      if (frac > 0) saEntry[cls] += airAmount * frac;
    }
    saEntry.hemolymph += bloodAmount * 0.3;
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

    for (const cls of MOLECULAR_CLASSES) scent[cls] *= decay;
    scent.age++;

    // Cleanup — drop the tile once every class has fallen below the floor.
    if (!MOLECULAR_CLASSES.some(cls => scent[cls] >= SCENT_FLOOR)) {
      toRemove.push(key);
    }
  }

  for (const key of toRemove) gMap.delete(key);

  // ── Self-shadow ground decay (identical physics) ──
  const sgMap = _getSelfGroundMap(layer);
  const sgRemove = [];
  for (const [key, scent] of sgMap) {
    const comma = key.indexOf(',');
    const x = +key.substring(0, comma);
    const y = +key.substring(comma + 1);

    const mods = _getScentTerrainMods(layer, x, y);
    const decay = mods.groundDecay;

    for (const cls of MOLECULAR_CLASSES) scent[cls] *= decay;
    scent.age++;

    if (!MOLECULAR_CLASSES.some(cls => scent[cls] >= SCENT_FLOOR)) {
      sgRemove.push(key);
    }
  }
  for (const key of sgRemove) sgMap.delete(key);
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

    for (const ch of MOLECULAR_CLASSES) {
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
    for (const cls of MOLECULAR_CLASSES) scent[cls] *= AIRBORNE_DECAY_RATE;
    if (!MOLECULAR_CLASSES.some(cls => scent[cls] >= SCENT_FLOOR)) {
      toRemove.push(key);
    }
  }
  for (const key of toRemove) next.delete(key);

  // Swap
  _airborneScent[layer] = next;

  // ── Self-shadow airborne transport (identical physics) ──
  const selfCurrent = _getSelfAirborneMap(layer);
  const selfNext = new Map();

  for (const [key, scent] of selfCurrent) {
    const comma = key.indexOf(',');
    const x = +key.substring(0, comma);
    const y = +key.substring(comma + 1);

    const mods = _getScentTerrainMods(layer, x, y);
    const tileAdvFrac = advFraction * mods.advectionMod;
    const tileSpreadFrac = SPREAD_RATE * mods.spreadMod;

    const nbrs = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (inBounds(layer, nx, ny) && !_blocksScent(layer, nx, ny)) {
          nbrs.push(`${nx},${ny}`);
        }
      }
    }

    for (const ch of MOLECULAR_CLASSES) {
      const val = scent[ch];
      if (val < SCENT_FLOOR) continue;

      let remaining = val;

      const advAmt = val * tileAdvFrac;
      remaining -= advAmt;
      const dwx = x + windOfs[0], dwy = y + windOfs[1];
      const dwKey = `${dwx},${dwy}`;
      if (inBounds(layer, dwx, dwy) && !_blocksScent(layer, dwx, dwy)) {
        _addToMap(selfNext, dwKey, ch, advAmt);
      } else {
        remaining += advAmt;
      }

      const spreadTot = val * tileSpreadFrac;
      remaining -= spreadTot;
      if (nbrs.length > 0) {
        const per = spreadTot / nbrs.length;
        for (const nKey of nbrs) _addToMap(selfNext, nKey, ch, per);
      } else {
        remaining += spreadTot;
      }

      if (remaining > 0) _addToMap(selfNext, key, ch, remaining);
    }
  }

  const selfRemove = [];
  for (const [key, scent] of selfNext) {
    for (const cls of MOLECULAR_CLASSES) scent[cls] *= AIRBORNE_DECAY_RATE;
    if (!MOLECULAR_CLASSES.some(cls => scent[cls] >= SCENT_FLOOR)) {
      selfRemove.push(key);
    }
  }
  for (const key of selfRemove) selfNext.delete(key);

  _selfAirborneScent[layer] = selfNext;
}

/** Add a value to a class on a tile in a scent map, creating the entry if needed. */
function _addToMap(map, key, channel, amount) {
  let entry = map.get(key);
  if (!entry) {
    entry = _emptyScent();
    map.set(key, entry);
  }
  entry[channel] += amount;
}

/**
 * Return a new scent vector with the self-shadow subtracted.
 * Values are clamped to 0 — the shadow should never exceed the real value,
 * but floating-point drift could produce tiny negatives.
 */
function _subtractSelf(real, shadow) {
  if (!shadow) return real;
  const result = {};
  for (const cls of MOLECULAR_CLASSES) {
    result[cls] = Math.max(0, (real[cls] || 0) - (shadow[cls] || 0));
  }
  if (real.age != null) result.age = real.age;
  return result;
}

// ==================== SCENT INTERPRETATION ====================
// Turning a raw molecular vector into words. The reader's nose detects classes;
// what those classes mean is inference. ketones+amines together read as a
// meat-eater; greenLeaf reads as a plant-feeder; and so on. This is the single
// place that mapping lives, shared by the sniff action and involuntary alerts.

/** Coarse intensity word for a concentration value. */
function _intensityWord(v) {
  if (v >= 0.30) return 'strong';
  if (v >= 0.08) return 'distinct';
  return 'faint';
}

/**
 * Build a list of human descriptors for the classes in a scent vector that sit
 * above `threshold`. Related classes are combined (ketones + amines → meat-eater).
 * Returns an array of phrases (possibly empty).
 */
function _describeScent(scent, threshold) {
  const parts = [];
  const k = scent.ketones || 0;
  const a = scent.amines || 0;
  const meatEater = k > threshold && a > threshold;

  if (meatEater) {
    parts.push(`${_intensityWord(k + a)} meat-eater metabolism`);
  }
  if ((scent.greenLeaf || 0) > threshold) {
    parts.push(`${_intensityWord(scent.greenLeaf)} plant-feeder scent`);
  }
  if ((scent.hemolymph || 0) > threshold) {
    parts.push('blood — copper-bright');
  }
  // fatty acids on their own read as plain animal musk — but only when the
  // meat-eater signature hasn't already accounted for the animal.
  if (!meatEater && (scent.fattyAcids || 0) > threshold) {
    parts.push(`${_intensityWord(scent.fattyAcids)} animal musk`);
  }
  if ((scent.terpenoids || 0) > threshold) {
    parts.push('tree resins');
  }
  if ((scent.phenolics || 0) > threshold) {
    parts.push('fungal-woody notes');
  }
  if ((scent.sulfur || 0) > threshold) {
    parts.push('sulfurous traces');
  }
  return parts;
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

// ==================== SNIFF ACTION ====================

/** Local terrain volatiles — what the air smells like here from the terrain
 *  itself, independent of any transported creature scent. */
function _localTerrainVolatiles(layer, x, y) {
  const ground = worlds[layer]?.[y]?.[x];
  const cover = getCover(layer, x, y);
  const isCave = ground === T.CAVE_FLOOR || ground === T.CAVE_WALL || ground === T.CAVE_ROCK;

  if (isCave) return 'The air is stale — mineral dust and faint sulfur.';
  if (isWaterGround(ground)) return 'Fresh water and dissolved minerals.';
  if (cover === T.MUSHFOREST) return 'Heavy fungal spores and earthy decay surround you.';
  if (cover === T.FOREST) return 'Tree resins and leaf litter fill the canopy air.';
  if (ground === T.SAND) return 'Dry mineral dust — almost scentless.';
  if (ground === T.ROCK) return 'Cold stone. Faintly metallic.';
  return 'Fresh vegetation and warm soil.';
}

/** One-line wind description. */
function _windDescription() {
  const spd = state.windSpeed || 0;
  if (spd <= 0) return 'The air is still.';
  const word = spd === 1 ? 'gentle' : spd === 2 ? 'steady' : 'strong';
  return `A ${word} wind from the ${COMPASS_NAMES[state.windDirection]}.`;
}

/**
 * Deliberate sniff. Reads the player's contact and airborne chemical qualities
 * from the body map and produces a multi-line readout: local terrain volatiles,
 * wind, airborne creature scent (with source bearing), and ground trails (with
 * freshness and trail direction). Does NOT consume a turn.
 *
 * @param {string} [mode] — 'ground' for contact chemoreception only,
 *   'air' for airborne chemoreception only. Omit or undefined for both (legacy).
 */
export function performSniff(mode) {
  const p = state.player;
  if (!p) return;
  const layer = p.layer;
  const key = `${p.x},${p.y}`;

  const bodyMap = getBodyMap(p);
  let bestContact = 0;
  let bestAirborne = 0;
  if (bodyMap) {
    for (const zone of bodyMap) {
      if (zone.destroyed) continue;
      const contact = zone.transducers?.chemical?.contact || 0;
      const airborne = zone.transducers?.chemical?.airborne || 0;
      if (contact > bestContact) bestContact = contact;
      if (airborne > bestAirborne) bestAirborne = airborne;
    }
  }

  const doGround = mode === 'ground' || mode == null;
  const doAir    = mode === 'air'    || mode == null;

  // Check if the requested mode has a functioning transducer
  if (doGround && !doAir && bestContact <= 0) {
    log('You have no functioning contact chemoreceptors.', LOG_CATEGORIES.SENSING);
    return;
  }
  if (doAir && !doGround && bestAirborne <= 0) {
    log('You have no functioning airborne chemoreceptors.', LOG_CATEGORIES.SENSING);
    return;
  }
  if (bestContact <= 0 && bestAirborne <= 0) {
    log('You have no functioning chemical transducers.', LOG_CATEGORIES.SENSING);
    return;
  }

  // Flavor text for the sensing mode
  if (mode === 'ground') {
    log('You press your chemoreceptors to the ground...', LOG_CATEGORIES.SENSING);
  } else if (mode === 'air') {
    log('You sample the air...', LOG_CATEGORIES.SENSING);
  }

  // 1. Local terrain volatiles (always available — you breathe the air you stand in)
  if (doAir) {
    log(_localTerrainVolatiles(layer, p.x, p.y), LOG_CATEGORIES.SENSING);

    // 2. Wind
    log(_windDescription(), LOG_CATEGORIES.SENSING);
  }

  let detectedScent = false;

  // 3. Airborne creature scent
  if (doAir && bestAirborne > 0) {
    const rawAir = _getAirborneMap(layer).get(key);
    const selfAir = _getSelfAirborneMap(layer).get(key);
    const aScent = rawAir ? _subtractSelf(rawAir, selfAir) : null;
    const airThreshold = SCENT_FLOOR / bestAirborne;
    const descriptors = aScent ? _describeScent(aScent, airThreshold) : [];
    if (descriptors.length > 0) {
      detectedScent = true;
      const src = state.windSpeed > 0 ? ` from the ${COMPASS_NAMES[state.windDirection]}` : '';
      log(`Carried on the air${src}: ${descriptors.join(', ')}.`, LOG_CATEGORIES.SENSING);
    }
  }

  // 4. Ground scent (contact chemoreception — player's tile + 8 adjacent)
  if (doGround && bestContact > 0) {
    const gMap = _getGroundMap(layer);
    const sgMap = _getSelfGroundMap(layer);
    const contactThreshold = SCENT_FLOOR / bestContact;

    // Check all 9 tiles: player's own tile + 8 neighbors
    const DIRS_9 = [
      [0, 0],
      [0,-1], [1,-1], [1,0], [1,1],
      [0,1], [-1,1], [-1,0], [-1,-1],
    ];

    // Aggregate: find the strongest scent across checked tiles
    let bestScent = null;
    let bestTotal = 0;

    for (const [ddx, ddy] of DIRS_9) {
      const adjKey = `${p.x + ddx},${p.y + ddy}`;
      const adjRaw = gMap.get(adjKey);
      if (!adjRaw) continue;
      const adjSelf = sgMap.get(adjKey);
      const adj = _subtractSelf(adjRaw, adjSelf);
      let total = 0;
      for (const cls of MOLECULAR_CLASSES) total += adj[cls] || 0;
      if (total > bestTotal) {
        bestTotal = total;
        bestScent = adj;
      }
    }

    const descriptors = bestScent ? _describeScent(bestScent, contactThreshold) : [];
    if (descriptors.length > 0) {
      detectedScent = true;
      const freshness = bestScent.age < 8 ? 'Fresh' : bestScent.age < 30 ? 'Recent' : 'Fading';

      // Trail direction — the adjacent tile whose deposit is freshest (lowest age)
      // is where the trail freshens toward.
      let freshestDir = null;
      let freshestAge = bestScent.age;
      for (const [ddx, ddy] of DIRS_9) {
        if (ddx === 0 && ddy === 0) continue;  // skip own tile for direction
        const adjKey = `${p.x + ddx},${p.y + ddy}`;
        const adjRaw = gMap.get(adjKey);
        if (!adjRaw) continue;
        const adjSelf = sgMap.get(adjKey);
        const adj = _subtractSelf(adjRaw, adjSelf);
        if (!MOLECULAR_CLASSES.some(cls => (adj[cls] || 0) >= contactThreshold)) continue;
        if (adj.age < freshestAge) {
          freshestAge = adj.age;
          freshestDir = _offsetToCompass(ddx, ddy);
        }
      }
      const dirHint = freshestDir ? `, trail freshens toward the ${freshestDir}` : '';
      log(`${freshness} ground traces: ${descriptors.join(', ')}${dirHint}.`, LOG_CATEGORIES.SENSING);
    }
  }

  // 5. Nothing on the wind or the ground
  if (!detectedScent) {
    if (doAir && bestAirborne > 0) {
      log('No creature scent on the wind.', LOG_CATEGORIES.SENSING);
    } else if (doGround && bestContact > 0) {
      log('The ground carries no traces.', LOG_CATEGORIES.SENSING);
    } else {
      log('You detect nothing of note.', LOG_CATEGORIES.SENSING);
    }
  }
}

// ==================== GROUND TRAIL QUERY (rendering) ====================

/**
 * Return a Map of ground scent entries within `radius` tiles of (cx, cy) on the
 * given layer. Returns null if there are no entries in range. Used by the
 * rendering layer to paint a subtle trail overlay near the player.
 */
export function getGroundScentNear(layer, cx, cy, radius) {
  const gMap = _getGroundMap(layer);
  if (gMap.size === 0) return null;
  const sgMap = _getSelfGroundMap(layer);
  const r2 = radius * radius;
  const result = new Map();
  for (const [key, scent] of gMap) {
    const comma = key.indexOf(',');
    const x = +key.substring(0, comma);
    const y = +key.substring(comma + 1);
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= r2) {
      const selfScent = sgMap.get(key);
      const filtered = _subtractSelf(scent, selfScent);
      // Only include if something remains above floor after self-subtraction
      if (MOLECULAR_CLASSES.some(cls => (filtered[cls] || 0) >= SCENT_FLOOR)) {
        result.set(key, filtered);
      }
    }
  }
  return result.size > 0 ? result : null;
}

// ==================== INVOLUNTARY DETECTION ====================
// The deliberate sniff handles everything the player goes looking for. The only
// thing that reaches awareness unbidden is an overwhelming signal — standing in
// a fresh kill, or a thick plume blowing straight into the face. High threshold
// only; everything subtler waits for a sniff.

const INVOLUNTARY_THRESHOLD = 0.5; // total concentration across all classes

// Per-detection-type log throttle so a strong tile doesn't flood the log.
const _lastDetectionTurn = { involAir: -99, involGround: -99 };
const DETECTION_LOG_COOLDOWN = 3;

function _shouldLog(type) {
  const turn = state.turnCount || 0;
  if (turn - _lastDetectionTurn[type] < DETECTION_LOG_COOLDOWN) return false;
  _lastDetectionTurn[type] = turn;
  return true;
}

/** Sum of all molecular classes in a scent vector. */
function _totalConcentration(scent) {
  let total = 0;
  for (const cls of MOLECULAR_CLASSES) total += scent[cls] || 0;
  return total;
}

/** The single strongest molecular class in a scent vector. */
function _dominantClass(scent) {
  let best = null, bestVal = 0;
  for (const cls of MOLECULAR_CLASSES) {
    const v = scent[cls] || 0;
    if (v > bestVal) { bestVal = v; best = cls; }
  }
  return best;
}

// Short descriptor for an involuntary alert's dominant class.
const _CLASS_ALERT = {
  ketones:    'meat-eater metabolism',
  amines:     'meat-eater metabolism',
  terpenoids: 'tree resins',
  greenLeaf:  'plant-feeder scent',
  hemolymph:  'blood',
  fattyAcids: 'animal musk',
  sulfur:     'sulfurous decay',
  phenolics:  'fungal-woody rot',
};

/**
 * Fire a warning only for overwhelming chemical signals at the player's tile.
 * Called once per turn after scent maps update. Deliberate detail comes from
 * performSniff(); this is just the reflex that something is *right here*.
 */
function _detectPlayerScent() {
  const p = state.player;
  if (!p) return;
  const layer = p.layer;
  const key = `${p.x},${p.y}`;

  const bodyMap = getBodyMap(p);
  if (!bodyMap) return;

  let bestContact = 0;
  let bestAirborne = 0;
  for (const zone of bodyMap) {
    if (zone.destroyed) continue;
    const contact = zone.transducers?.chemical?.contact || 0;
    const airborne = zone.transducers?.chemical?.airborne || 0;
    if (contact > bestContact) bestContact = contact;
    if (airborne > bestAirborne) bestAirborne = airborne;
  }

  // ── Overwhelming airborne plume ──
  if (bestAirborne > 0) {
    const rawAir = _getAirborneMap(layer).get(key);
    const selfAir = _getSelfAirborneMap(layer).get(key);
    const aScent = rawAir ? _subtractSelf(rawAir, selfAir) : null;
    if (aScent && _totalConcentration(aScent) >= INVOLUNTARY_THRESHOLD && _shouldLog('involAir')) {
      const cls = _dominantClass(aScent);
      const src = state.windSpeed > 0 ? ` from the ${COMPASS_NAMES[state.windDirection]}` : '';
      log(`A powerful scent hits you${src} — ${_CLASS_ALERT[cls] || 'something overwhelming'}.`, LOG_CATEGORIES.SENSING);
    }
  }

  // ── Overwhelming ground deposit underfoot ──
  if (bestContact > 0) {
    const rawGround = _getGroundMap(layer).get(key);
    const selfGround = _getSelfGroundMap(layer).get(key);
    const gScent = rawGround ? _subtractSelf(rawGround, selfGround) : null;
    if (gScent && _totalConcentration(gScent) >= INVOLUNTARY_THRESHOLD && _shouldLog('involGround')) {
      const cls = _dominantClass(gScent);
      log(`The ground reeks beneath you — ${_CLASS_ALERT[cls] || 'something overwhelming'}.`, LOG_CATEGORIES.SENSING);
    }
  }
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

  // 5. Involuntary detection (high-threshold only)
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

  const fmt = (s) => MOLECULAR_CLASSES
    .map(cls => `${cls}=${(s[cls] || 0).toFixed(4)}`)
    .join(' ');

  console.log(`Scent at (${x},${y}) layer ${layer}:`);
  console.log(`  Wind: from ${COMPASS_NAMES[state.windDirection]}, speed ${state.windSpeed}`);
  if (g) {
    console.log(`  Ground: ${fmt(g)} age=${g.age}`);
  } else {
    console.log('  Ground: none');
  }
  if (a) {
    console.log(`  Airborne: ${fmt(a)}`);
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

  const maxes = (map) => {
    const m = _emptyScent();
    for (const [, s] of map) {
      for (const cls of MOLECULAR_CLASSES) {
        if ((s[cls] || 0) > m[cls]) m[cls] = s[cls];
      }
    }
    return m;
  };
  const fmt = (m) => MOLECULAR_CLASSES
    .map(cls => `${cls}=${m[cls].toFixed(4)}`)
    .join(' ');

  console.log(`Scent stats (layer ${layer}):`);
  console.log(`  Wind: from ${COMPASS_NAMES[state.windDirection]}, speed ${state.windSpeed}`);
  console.log(`  Ground tiles: ${gMap.size} | max ${fmt(maxes(gMap))}`);
  console.log(`  Airborne tiles: ${aMap.size} | max ${fmt(maxes(aMap))}`);
}

// Export for debug / rendering
export { _getGroundMap, _getAirborneMap, COMPASS_NAMES };
