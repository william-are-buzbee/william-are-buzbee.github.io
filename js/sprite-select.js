// sprite-select.js
//
// Per-Tile Sprite Variant Selection — Physical State Drives Texture.
//
// Pure function: physical tile state in, variant indices out.
// No dependencies on any renderer, viewer, or game system.
//
//   selectSpriteVariant(terrainType, coverType, physical, wx, wy)
//     → { ground: int, cover: int }
//
// ground = index into SPRITE_LIBRARY[terrainName]
// cover = index into SPRITE_LIBRARY[coverName]
//
// Position hash (wx, wy) provides deterministic spatial variation
// so adjacent tiles with similar physical state don't visually tile.

/**
 * Deterministic position hash: same coordinates always produce the same value.
 * Returns 0.0 - 1.0. Used to pick between equivalent variants at a given tile.
 *
 * @param {number} x - world X coordinate
 * @param {number} y - world Y coordinate
 * @returns {number} 0.0 - 1.0
 */
function positionHash(x, y) {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return (h & 0x7FFFFFFF) / 0x7FFFFFFF;
}

/**
 * Select sprite variant indices from physical state.
 *
 * @param {string} terrainType - 'mud'|'grass'|'dirt'|'sand'|'rock'|'water'|'deep_water'|'beach'
 * @param {string} coverType - 'none'|'forest'|'sparse_forest'|'mushforest'|'sparse_mushforest'
 * @param {object} physical - tile physical state
 * @param {number} physical.saturation - 0-1
 * @param {number} physical.groundCover - 0-1
 * @param {number} physical.grainSize - 0-1
 * @param {number} physical.waterDepth - meters (0 if no standing water)
 * @param {number} physical.canopyDensity - 0-1
 * @param {number} physical.streamOrder - 0-3
 * @param {number} physical.organicContent - 0-1
 * @param {number} wx - world X coordinate (for position hash)
 * @param {number} wy - world Y coordinate (for position hash)
 *
 * @returns {{ ground: number, cover: number }}
 */
function selectSpriteVariant(terrainType, coverType, physical, wx, wy) {
    // Position hash for tiling avoidance (0.0 - 1.0)
    const ph = positionHash(wx, wy);

    let ground = 0;
    let cover = 0;

    // ── Ground variant ──
    switch (terrainType) {

        case 'grass':
            // 4 existing variants:
            //   0: GRASS — standard scattered marks (moderate coverage)
            //   1: GRASS_V2 — dense marks (thick mat)
            //   2: GRASS_V3 — sparse patchy marks (thin struggling coverage)
            //   3: GRASS_V4 — wind-combed diagonal (exposed/windy sites)
            if (physical.groundCover > 0.75) {
                ground = 1;  // dense mat
            } else if (physical.groundCover < 0.35) {
                // Sparse — choose between patchy and wind-combed by position
                ground = ph < 0.6 ? 2 : 3;
            } else {
                // Standard coverage — choose between two standard-density
                // patterns by position to break tiling
                ground = ph < 0.5 ? 0 : 1;
            }
            break;

        case 'mud':
            // 1 existing variant (MUD). The selector is ready for future variants.
            // When MUD_POOLED, MUD_SLICK etc. are added, uncomment:
            //
            // if (physical.saturation > 0.92) ground = 0;  // MUD_POOLED (index TBD)
            // else if (physical.saturation > 0.82) ground = 1;  // MUD_SLICK
            // else ground = 2;  // MUD_TEXTURED
            //
            // For now, single variant:
            ground = 0;
            break;

        case 'water':
            // 5 existing variants:
            //   0: WATER — standard wave marks
            //   1: WATER_V2 — crests with trailing ripples
            //   2: WATER_V3 — calm, nearly still
            //   3: WATER_V4 — choppy, dense marks
            //   4: WATER_V5 — long swells
            if (physical.waterDepth < 0.05) {
                ground = 2;  // very shallow = calm puddle
            } else if (physical.streamOrder >= 3) {
                // Flowing channel water — choppy or rippled
                ground = ph < 0.5 ? 1 : 3;
            } else if (physical.waterDepth > 0.2) {
                // Deeper still water — calm or long swells
                ground = ph < 0.5 ? 2 : 4;
            } else {
                // Moderate pond — standard or rippled
                ground = ph < 0.5 ? 0 : 1;
            }
            break;

        case 'deep_water':
            // 3 existing variants:
            //   0: DEEP_WATER — sparse marks
            //   1: DEEP_WATER_V2 — single distant glint
            //   2: DEEP_WATER_V3 — dead calm glass
            // Position hash picks between them for variety
            ground = Math.floor(ph * 3);
            break;

        case 'rock':
            // 3 existing variants (different gravel/slab arrangements).
            // Ideally these would map to grainSize (bedrock vs boulder vs gravel),
            // but all three currently have the same visual character (scattered
            // slab marks). Use position hash for spatial variety.
            ground = Math.floor(ph * 3);
            break;

        case 'dirt':
            // 1 existing variant
            ground = 0;
            break;

        case 'sand':
            // 1 existing variant
            ground = 0;
            break;

        case 'beach':
            // 1 existing variant
            ground = 0;
            break;

        default:
            ground = 0;
    }

    // ── Cover variant ──
    switch (coverType) {

        case 'forest':
            // 1 existing variant (FOREST).
            // Ready for future variants:
            // if (physical.canopyDensity > 0.7) cover = 0;  // FOREST_CLOSED
            // else if (physical.canopyDensity > 0.5) cover = 1;  // FOREST_STANDARD
            // else cover = 2;  // FOREST_OPEN
            cover = 0;
            break;

        case 'sparse_forest':
            // No dedicated sprite yet. Could use SCATTERED_TREES (exists but
            // not in SPRITE_LIBRARY). For now, use FOREST at index 0.
            // The renderer currently falls back to FOREST for sparse_forest.
            cover = 0;
            break;

        case 'mushforest':
            // 1 existing variant
            cover = 0;
            break;

        case 'sparse_mushforest':
            cover = 0;
            break;

        default:
            cover = 0;
    }

    return { ground, cover };
}

if (typeof module !== 'undefined') module.exports = { selectSpriteVariant, positionHash };
