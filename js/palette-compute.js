// ═══════════════════════════════════════════════════════════════════════════
// palette-compute.js
//
// Per-Tile Palette Computation — Three-Layer Color Pipeline.
//
// A pure function: physical tile state in, three screen-space hex colors out
// (bg / fg / mid). No dependencies on any renderer, viewer, or game system.
//
//   computeTilePalette(physical) → { bg:{r,g,b}, fg:{r,g,b}, mid:{r,g,b} }
//
// The three layers:
//   Layer 1  Material color under white light   (MAT table below)
//   Layer 2  Star spectrum modification         (dim yellow-orange star)
//   Layer 3  Chromatic adaptation               (creatures' visual systems)
// Layers 2+3 are folded into the LOCKED toScreen() multipliers. Do not change
// the material values or the toScreen multipliers without referencing
// three-layer-color-system.md.
// ═══════════════════════════════════════════════════════════════════════════

// Material color tables (Layer 1, under white light)
const MAT = {
    photoLiving:    { r: 165, g: 28, b: 28 },
    photoBright:    { r: 200, g: 42, b: 38 },
    deadFresh:      { r: 130, g: 80, b: 45 },
    deadPeat:       { r: 50, g: 30, b: 20 },
    waterSurface:   { r: 65, g: 95, b: 135 },
    skyReflection:  { r: 175, g: 145, b: 80 },

    substrate: {
        iron:     { r: 150, g: 85, b: 50 },
        copper:   { r: 85, g: 130, b: 78 },
        manganese:{ r: 105, g: 82, b: 115 },
        depleted: { r: 155, g: 145, b: 130 },
    },
    bedrock: {
        iron:     { r: 120, g: 75, b: 55 },
        copper:   { r: 70, g: 100, b: 68 },
        manganese:{ r: 88, g: 72, b: 95 },
        depleted: { r: 130, g: 125, b: 115 },
    },
    sand: {
        iron:     { r: 185, g: 145, b: 95 },
        copper:   { r: 150, g: 165, b: 120 },
        manganese:{ r: 160, g: 145, b: 155 },
        depleted: { r: 195, g: 185, b: 165 },
    },
    chemo: {
        iron:     { r: 140, g: 90, b: 55 },
        copper:   { r: 55, g: 120, b: 105 },
        manganese:{ r: 110, g: 70, b: 130 },
        depleted: { r: 130, g: 125, b: 110 },
    },
};

// Mineral color interpolation — blend mineral endpoints by relative concentration.
// Given iron, copper, manganese concentrations (each 0-1) and a colorTable with
// .iron, .copper, .manganese, .depleted entries, returns the mineral-tinted color.
function mineralColor(iron, copper, manganese, colorTable) {
    const total = iron + copper + manganese;

    if (total < 0.05) {
        // Depleted — no significant mineral content
        return colorTable.depleted;
    }

    // Weighted blend by relative concentration
    const fi = iron / total;
    const fc = copper / total;
    const fm = manganese / total;

    let r = fi * colorTable.iron.r + fc * colorTable.copper.r + fm * colorTable.manganese.r;
    let g = fi * colorTable.iron.g + fc * colorTable.copper.g + fm * colorTable.manganese.g;
    let b = fi * colorTable.iron.b + fc * colorTable.copper.b + fm * colorTable.manganese.b;

    // Fade toward depleted at low total mineral concentration
    // (low minerals = more washed out, less saturated color)
    const mineralIntensity = Math.min(total * 2, 1);  // full intensity at total >= 0.5
    r = r * mineralIntensity + colorTable.depleted.r * (1 - mineralIntensity);
    g = g * mineralIntensity + colorTable.depleted.g * (1 - mineralIntensity);
    b = b * mineralIntensity + colorTable.depleted.b * (1 - mineralIntensity);

    return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

// Combined Layer 2+3 transform: white light → screen. Multipliers are LOCKED.
function toScreen(r, g, b) {
    return {
        r: Math.round(Math.min(255, Math.max(0, r * 0.790))),
        g: Math.round(Math.min(255, Math.max(0, g * 0.806))),
        b: Math.round(Math.min(255, Math.max(0, b * 0.728)))
    };
}

// Blend two colors by weight
function blend(c1, c2, w1, w2) {
    const t = w1 + w2;
    if (t < 0.001) return c1;
    const f1 = w1 / t, f2 = w2 / t;
    return {
        r: Math.round(c1.r * f1 + c2.r * f2),
        g: Math.round(c1.g * f1 + c2.g * f2),
        b: Math.round(c1.b * f1 + c2.b * f2)
    };
}

// Darken a color by a factor (0 = black, 1 = unchanged)
function darken(c, factor) {
    return {
        r: Math.round(c.r * factor),
        g: Math.round(c.g * factor),
        b: Math.round(c.b * factor)
    };
}

/**
 * Compute per-tile palette from physical state.
 *
 * @param {object} p - Physical state of the tile
 * @param {string|number} p.terrainType - terrain enum (string or int, both handled)
 * @param {string|number} p.coverType - cover enum (string or int, both handled)
 * @param {number} p.iron - iron concentration 0-1
 * @param {number} p.copper - copper concentration 0-1
 * @param {number} p.manganese - manganese concentration 0-1
 * @param {number} p.grainSize - substrate grain size 0-1
 * @param {number} p.saturation - water saturation 0-1
 * @param {number} p.organicContent - organic material 0-1
 * @param {number} p.groundCover - photosynthetic mat coverage 0-1
 * @param {number} p.canopyDensity - overhead canopy coverage 0-1
 * @param {number} p.chemoCrust - chemotrophic crust coverage 0-1
 * @param {number} p.waterDepth - standing water depth in meters (0 if none)
 * @param {string} p.floraType - 'photosynthetic'|'chemotrophic'|'mixotrophic'|'barren'
 *
 * @returns {{ bg: {r,g,b}, fg: {r,g,b}, mid: {r,g,b} }}
 */
function computeTilePalette(p) {
    const iron = p.iron || 0;
    const copper = p.copper || 0;
    const mn = p.manganese || 0;
    const sat = p.saturation || 0;
    const org = p.organicContent || 0;
    const gc = p.groundCover || 0;
    const cd = p.canopyDensity || 0;
    const cc = p.chemoCrust || 0;
    const grain = p.grainSize || 0.3;
    const depth = p.waterDepth || 0;
    const tt = p.terrainType;
    const ct = p.coverType;
    const ft = p.floraType || 'barren';

    let bgL1, fgL1, midL1;  // Layer 1 colors (white light)

    // ═══════════════════════════════════════════
    // BACKGROUND (Layer 1)
    // The dominant surface color — what you see looking at the ground
    // ═══════════════════════════════════════════

    if (tt === 'water' || tt === 2) {
        // ── Standing water ──
        // Shallow: see bottom substrate through water
        // Deeper: water surface color dominates
        const substrate = mineralColor(iron, copper, mn, MAT.substrate);
        const bottomVisibility = Math.max(0, 1 - depth * 4);  // fades by 0.25m
        bgL1 = blend(MAT.waterSurface, substrate, 1 - bottomVisibility, bottomVisibility);

    } else if (tt === 'deep_water' || tt === 1) {
        // ── Deep water / ocean ──
        bgL1 = { r: 40, g: 58, b: 95 };  // deep blue, no bottom visible

    } else if (tt === 'mud' || tt === 3) {
        // ── Saturated fine substrate ──
        // Blend: mineral substrate color + organic darkening + saturation darkening
        const substrate = mineralColor(iron, copper, mn, MAT.substrate);

        // Organic content shifts toward dark peat
        const organicColor = blend(MAT.deadFresh, MAT.deadPeat, 1 - org, org);
        bgL1 = blend(substrate, organicColor, 1 - org * 0.6, org * 0.6);

        // Saturation darkens (wet surfaces absorb more light)
        bgL1 = darken(bgL1, 1 - sat * 0.25);

        // Chemotrophic crust tints the ground where present
        if (cc > 0.1) {
            const chemoColor = mineralColor(iron, copper, mn, MAT.chemo);
            bgL1 = blend(bgL1, chemoColor, 1 - cc * 0.5, cc * 0.5);
        }

    } else if (tt === 'grass' || tt === 4) {
        // ── Photosynthetic mat on ground ──
        // Blend: living mat + substrate showing through gaps
        const substrate = mineralColor(iron, copper, mn, MAT.substrate);
        const organicSub = blend(substrate, MAT.deadFresh, 1 - org * 0.3, org * 0.3);

        // Ground cover determines how much mat vs substrate is visible
        bgL1 = blend(MAT.photoLiving, organicSub, gc, 1 - gc);

        // Chemotrophic crust replaces some mat where present
        if (cc > 0.1) {
            const chemoColor = mineralColor(iron, copper, mn, MAT.chemo);
            bgL1 = blend(bgL1, chemoColor, 1 - cc * 0.4, cc * 0.4);
        }

        // Slight saturation darkening on wet ground
        if (sat > 0.5) {
            bgL1 = darken(bgL1, 1 - (sat - 0.5) * 0.15);
        }

    } else if (tt === 'dirt' || tt === 5) {
        // ── Exposed substrate with minimal flora ──
        const substrate = mineralColor(iron, copper, mn, MAT.substrate);
        const organicTint = blend(substrate, MAT.deadFresh, 1 - org * 0.4, org * 0.4);
        bgL1 = organicTint;

        // Any ground cover slightly tints toward crimson
        if (gc > 0.05) {
            bgL1 = blend(bgL1, MAT.photoLiving, 1 - gc * 0.3, gc * 0.3);
        }

        // Saturation darkening
        if (sat > 0.3) {
            bgL1 = darken(bgL1, 1 - (sat - 0.3) * 0.2);
        }

    } else if (tt === 'sand' || tt === 6) {
        // ── Dry sandy substrate ──
        bgL1 = mineralColor(iron, copper, mn, MAT.sand);

        // Any sparse ground cover
        if (gc > 0.05) {
            bgL1 = blend(bgL1, MAT.photoLiving, 1 - gc * 0.25, gc * 0.25);
        }

    } else if (tt === 'rock' || tt === 7) {
        // ── Coarse substrate / bedrock ──
        if (grain > 0.85) {
            // Solid bedrock
            bgL1 = mineralColor(iron, copper, mn, MAT.bedrock);
        } else {
            // Loose gravel/cobble — blend between bedrock and substrate
            const rock = mineralColor(iron, copper, mn, MAT.bedrock);
            const sub = mineralColor(iron, copper, mn, MAT.substrate);
            const rockiness = (grain - 0.6) / 0.4;  // 0 at grain=0.6, 1 at grain=1.0
            bgL1 = blend(rock, sub, rockiness, 1 - rockiness);
        }

        // Sparse mat in crevices
        if (gc > 0.03) {
            bgL1 = blend(bgL1, MAT.photoLiving, 1 - gc * 0.2, gc * 0.2);
        }

        // Chemotrophic crust on mineral-rich rock
        if (cc > 0.1) {
            const chemoColor = mineralColor(iron, copper, mn, MAT.chemo);
            bgL1 = blend(bgL1, chemoColor, 1 - cc * 0.5, cc * 0.5);
        }

    } else if (tt === 'beach' || tt === 8) {
        // ── Wave-sorted coastal sand ──
        bgL1 = mineralColor(iron, copper, mn, MAT.sand);
        // Wet beach is slightly darker
        if (sat > 0.5) {
            bgL1 = darken(bgL1, 1 - (sat - 0.5) * 0.2);
        }

    } else {
        // Fallback
        bgL1 = { r: 100, g: 90, b: 75 };
    }

    // ═══════════════════════════════════════════
    // FOREGROUND (Layer 1)
    // The bright detail — '#' pixels in the sprite
    // ═══════════════════════════════════════════

    if (tt === 'water' || tt === 2 || tt === 'deep_water' || tt === 1) {
        // Water: sky reflection as highlights (amber on the water surface)
        fgL1 = MAT.skyReflection;

    } else if (tt === 'mud' || tt === 3) {
        // Mud: puddle reflections (amber water highlights in depressions)
        // Higher saturation = more visible water = more amber
        fgL1 = blend(MAT.skyReflection, MAT.substrate.depleted, sat, 1 - sat);

    } else if (tt === 'grass' || tt === 4) {
        // Grass: brightest parts of the photosynthetic mat
        if (cc > 0.3) {
            // Chemotrophic-dominated ground: highlights are mineral-colored
            fgL1 = mineralColor(iron, copper, mn, MAT.chemo);
            fgL1 = { r: Math.min(255, fgL1.r + 30), g: Math.min(255, fgL1.g + 20), b: Math.min(255, fgL1.b + 20) };
        } else {
            fgL1 = MAT.photoBright;
        }

    } else if (tt === 'dirt' || tt === 5) {
        // Dirt: lighter mineral patches, or sparse mat spots
        if (gc > 0.1) {
            fgL1 = MAT.photoLiving;  // mat fragments as highlights
        } else {
            const sub = mineralColor(iron, copper, mn, MAT.substrate);
            fgL1 = { r: Math.min(255, sub.r + 35), g: Math.min(255, sub.g + 25), b: Math.min(255, sub.b + 20) };
        }

    } else if (tt === 'rock' || tt === 7) {
        // Rock: mineral veining, bright crystal/oxide faces
        const rockBase = mineralColor(iron, copper, mn, MAT.bedrock);
        fgL1 = { r: Math.min(255, rockBase.r + 40), g: Math.min(255, rockBase.g + 30), b: Math.min(255, rockBase.b + 25) };

    } else if (tt === 'sand' || tt === 6 || tt === 'beach' || tt === 8) {
        // Sand/beach: bright grains catching light
        const sandBase = mineralColor(iron, copper, mn, MAT.sand);
        fgL1 = { r: Math.min(255, sandBase.r + 25), g: Math.min(255, sandBase.g + 20), b: Math.min(255, sandBase.b + 15) };

    } else {
        fgL1 = { r: Math.min(255, bgL1.r + 30), g: Math.min(255, bgL1.g + 25), b: Math.min(255, bgL1.b + 20) };
    }

    // ═══════════════════════════════════════════
    // COVER MODIFICATION
    // Forest and mushforest canopy modify both bg and fg
    // ═══════════════════════════════════════════

    if (ct === 'forest' || ct === 1) {
        // Dense photosynthetic canopy overhead
        // bg: darkened by shade, tinted by canopy color falling through
        const shadeAmount = cd * 0.65;  // dense canopy blocks up to 65% of light
        bgL1 = darken(bgL1, 1 - shadeAmount);
        // Mix in fallen frond/mat color on the darkened ground
        bgL1 = blend(bgL1, darken(MAT.photoLiving, 0.4), 1 - cd * 0.3, cd * 0.3);

        // fg: canopy frond tips and highlights
        fgL1 = blend(MAT.photoBright, MAT.photoLiving, 0.6, 0.4);
        // At low canopy density, ground fg bleeds through
        if (cd < 0.5) {
            const groundFg = fgL1;
            fgL1 = blend(groundFg, MAT.photoBright, 1 - cd, cd);
        }

    } else if (ct === 'sparse_forest' || ct === 3) {
        // Open canopy — some shade, some light through
        const shadeAmount = cd * 0.4;
        bgL1 = darken(bgL1, 1 - shadeAmount);
        bgL1 = blend(bgL1, darken(MAT.photoLiving, 0.5), 1 - cd * 0.15, cd * 0.15);

        // fg: mix of ground highlights and canopy tips
        fgL1 = blend(fgL1, MAT.photoBright, 0.5, 0.5);

    } else if (ct === 'mushforest' || ct === 2) {
        // Dense chemotrophic colony structures
        const chemoColor = mineralColor(iron, copper, mn, MAT.chemo);
        const shadeAmount = cd * 0.55;
        bgL1 = darken(bgL1, 1 - shadeAmount);
        bgL1 = blend(bgL1, darken(chemoColor, 0.5), 1 - cd * 0.35, cd * 0.35);

        // fg: chemotrophic growth tips (brighter version of chemo color)
        fgL1 = { r: Math.min(255, chemoColor.r + 35), g: Math.min(255, chemoColor.g + 25), b: Math.min(255, chemoColor.b + 30) };

    } else if (ct === 'sparse_mushforest' || ct === 4) {
        const chemoColor = mineralColor(iron, copper, mn, MAT.chemo);
        const shadeAmount = cd * 0.3;
        bgL1 = darken(bgL1, 1 - shadeAmount);
        bgL1 = blend(bgL1, darken(chemoColor, 0.6), 1 - cd * 0.2, cd * 0.2);

        fgL1 = blend(fgL1, chemoColor, 0.5, 0.5);
    }

    // ═══════════════════════════════════════════
    // MID-TONE (Layer 1)
    // Intermediate detail — blend of bg and fg
    // ═══════════════════════════════════════════

    midL1 = blend(bgL1, fgL1, 0.65, 0.35);

    // ═══════════════════════════════════════════
    // APPLY LAYERS 2+3 (star + adaptation)
    // ═══════════════════════════════════════════

    const bg = toScreen(bgL1.r, bgL1.g, bgL1.b);
    const fg = toScreen(fgL1.r, fgL1.g, fgL1.b);
    const mid = toScreen(midL1.r, midL1.g, midL1.b);

    return { bg, fg, mid };
}

if (typeof module !== 'undefined') module.exports = { computeTilePalette, MAT, mineralColor, toScreen };
