# Tile Body Map — Design Specification

Every tile in the game is a physical place with measurable properties. The terrain type label (MUD, GRASS, FOREST) is a rendering convenience — the same way calling a creature a "predator" is a convenience. The physical state is what's real. This document defines what a tile IS, how it looks, and how gameplay reads it.

Include alongside Design-Principles.md, three-layer-color-system.md, and drainage-chunk-generator-design.md for any terrain, rendering, or world integration work.

---

## The Tile Data Structure

Every tile carries physical state computed by the chunk generator, plus derived rendering data. The physical state is permanent for a given world coordinate (deterministic from seed). Player modifications are stored as diffs against the generated base.

```
tile = {
    // ── Physical state (from chunk generator) ──
    substrate: {
        grainSize:      float 0.0-1.0,    // 0=clay, 0.3=silt, 0.5=sand, 0.7=gravel, 1.0=bedrock
        iron:           float 0.0-1.0,    // mineral concentrations
        copper:         float 0.0-1.0,
        manganese:      float 0.0-1.0,
        organicContent: float 0.0-1.0,    // decomposed biological material mixed in
    },
    water: {
        tableDepth:     float,            // meters below surface (negative = ponded)
        saturation:     float 0.0-1.0,    // pore space filled with water
        standing:       boolean,          // surface water present
        depth:          float,            // standing water depth in meters (0 if none)
    },
    flora: {
        type:           enum,             // photosynthetic | chemotrophic | mixotrophic | barren
        groundCover:    float 0.0-1.0,    // mat/crust coverage on ground surface
        canopyDensity:  float 0.0-1.0,    // stalked flora overhead coverage
        chemoCrust:     float 0.0-1.0,    // chemotrophic crust coverage (subset of ground)
    },
    drainage: {
        streamOrder:    int 0-3,          // 0=ridge, 1=tributary, 2=secondary, 3=major
        flowDirection:  int 0-7,          // which neighbor water flows toward
    },
    elevation:          float,            // meters above sea level (local micro-topography)

    // ── Derived rendering (from physical state) ──
    terrainType:        enum,             // MUD, GRASS, DIRT, SAND, ROCK, WATER, DEEP_WATER, BEACH
    coverType:          enum,             // NONE, FOREST, MUSHFOREST, SPARSE_FOREST, SPARSE_MUSHFOREST
    palette:            { bg, fg, mid },  // computed per-tile from material composition
    spriteVariant:      int,              // which variant of the terrain sprite to use
    coverVariant:       int,              // which variant of the cover sprite to use

    // ── Gameplay-readable (derived on demand or cached) ──
    movementCost:       float,            // derived from terrain + saturation + cover
    soundPropagation:   float,            // how well vibration travels through this ground
    scentRetention:     float,            // how well chemical traces linger
    visibility:         float,            // how far you can see from/through this tile
}
```

### Memory footprint

Per tile in compact storage (for chunk arrays):
- Substrate: 5 floats = 20 bytes
- Water: 3 floats + 1 byte = 13 bytes
- Flora: 4 floats + 1 byte = 17 bytes
- Drainage: 2 bytes
- Elevation: 4 bytes
- Derived: 2 bytes (terrain + cover enums) + 6 bytes (palette) + 2 bytes (variants)

Total: ~66 bytes per tile. A 512×512 chunk: ~17 MB. Active area of ~9 chunks (3×3): ~153 MB. Manageable. Can compress by using Float16 or quantized Uint8 for properties that don't need full precision (saturation, groundCover, organicContent, minerals).

Compact alternative at ~28 bytes per tile (Uint8 for 0-1 ranges, Int16 for elevation):
```
grainSize:      Uint8     // ×255 to decode
iron:           Uint8
copper:         Uint8
manganese:      Uint8
organicContent: Uint8
saturation:     Uint8
groundCover:    Uint8
canopyDensity:  Uint8
chemoCrust:     Uint8
tableDepth:     Int8      // ×0.01m resolution, -1.28m to +1.27m
waterDepth:     Uint8     // ×0.01m, 0-2.55m
elevation:      Int16     // ×0.001m resolution
streamOrder:    2 bits  }
flowDirection:  3 bits  } packed into 1 byte
floraType:      2 bits  }
standing:       1 bit   }
terrainType:    4 bits  } packed into 1 byte
coverType:      3 bits  }
spriteVariant:  4 bits  } packed into 1 byte
coverVariant:   3 bits  }
```

Total compact: ~16 bytes per tile. Chunk: ~4 MB. Nine chunks: ~36 MB. Comfortable.

Palette is computed at render time from the physical properties, not stored per tile. This saves 6 bytes per tile and ensures palette always reflects current physical state.

---

## Terrain Type Vocabulary

The terrain type is the game's rendering and mechanics vocabulary. It determines the base sprite, the base movement cost, and the base interaction rules. There are 8 ground types and 4 cover types.

### Ground types

| Type | Physical meaning | When assigned |
|---|---|---|
| WATER | Standing water on surface | standing = true, depth > 0.1m |
| DEEP_WATER | Deep standing water or ocean | standing = true, depth > 0.5m OR ocean |
| MUD | Saturated fine substrate | grainSize < 0.35, saturation > 0.75 |
| GRASS | Living photosynthetic mat on stable ground | groundCover > 0.3, not saturated, rootable |
| DIRT | Exposed damp substrate, minimal flora | groundCover < 0.3, moderate saturation |
| SAND | Dry medium-grain substrate | grainSize 0.35-0.6, saturation < 0.4 |
| ROCK | Coarse substrate or exposed bedrock | grainSize > 0.6 OR high elevation barren |
| BEACH | Wave-sorted coast sand | grainSize 0.4-0.6, coastal, saturated |

### Cover types

| Type | Physical meaning | When assigned |
|---|---|---|
| NONE | No overhead canopy | canopyDensity < 0.15 |
| FOREST | Dense photosynthetic/mixotrophic canopy | canopyDensity > 0.45, photo/mixo type |
| SPARSE_FOREST | Open photosynthetic/mixotrophic canopy | canopyDensity 0.15-0.45, photo/mixo type |
| MUSHFOREST | Dense chemotrophic colony structures | canopyDensity > 0.45, chemo type |
| SPARSE_MUSHFOREST | Scattered chemotrophic structures | canopyDensity 0.15-0.45, chemo type |

### The derivation function

This is the same function used in the planet viewer at every scale. It takes physical state as input and outputs terrain + cover type. It lives in one place and is called identically whether computing planetary cells, regional cells, or game tiles:

```
deriveTerrainType(physical) → { terrainType, coverType }
```

The function is documented in drainage-chunk-generator-design.md and implemented identically in planet-viewer.html and the game chunk generator. Any change to the derivation rules must be mirrored in both.

---

## Per-Tile Palette Computation

The palette is NOT looked up from a biome table. It is computed per tile from the physical state through the three-layer color pipeline.

### Layer 1: Material color under white light

Each tile's visible material is a blend determined by its physical state:

**Ground surface (bg color):**

The ground color is a weighted blend of the materials visible at the surface:

```
if terrainType == MUD:
    // Visible material: wet mineral substrate + organic content
    material = blend(
        mineralSubstrate(iron, copper, manganese) × (1 - organicContent),
        wetOrganic × organicContent
    )
    // Saturation darkens: wet surfaces absorb more light
    material = darken(material, saturation × 0.3)

if terrainType == GRASS:
    // Visible material: photosynthetic mat with substrate showing between
    material = blend(
        photosyntheticTissue × groundCover,
        mineralSubstrate(iron, copper, manganese) × (1 - groundCover)
    )

if terrainType == DIRT:
    // Visible material: substrate + sparse organic
    material = blend(
        mineralSubstrate(iron, copper, manganese) × (1 - organicContent × 0.5),
        dryOrganic × organicContent × 0.5
    )

if terrainType == SAND:
    material = sandSubstrate(iron, copper, manganese)

if terrainType == ROCK:
    material = bedrockSubstrate(iron, copper, manganese)

if terrainType == WATER:
    // Water bg: reflected sky + substrate visible through shallow water
    material = blend(
        waterSurface,
        mineralSubstrate(iron, copper, manganese) × (1 - depth × 3)
    )
```

Material base colors from three-layer-color-system.md:

| Material | Base (white light) | Chemistry-sensitive? |
|---|---|---|
| Photosynthetic tissue | #8B1A1A (deep crimson) | No |
| Dead organic (fresh) | #6B4226 (warm brown) | No |
| Dead organic (aged/peat) | #2A1810 (near-black) | No |
| Mineral substrate | varies by chemistry | Yes |
| Water surface | #3A5C7A (cool blue-gray) | No |
| Chemotrophic tissue | varies by chemistry | Yes |

Chemistry-sensitive mineral substrate colors:

| Dominant chemistry | Substrate color |
|---|---|
| Iron-rich | #7A4B2E (rust brown) |
| Copper-rich | #4A6B42 (olive green) |
| Manganese-rich | #5A4860 (muted purple-gray) |
| Depleted | #8A8070 (pale warm gray) |
| Mixed | weighted blend of above |

**Foreground elements (fg color):**

The fg color renders the '#' pixels in the sprite — the bright details:

```
if terrainType == MUD:
    fg = waterHighlight  // amber reflection in puddles and wet surface

if terrainType == GRASS:
    fg = photosyntheticTissue  // brighter crimson where mat is thickest

if terrainType == WATER:
    fg = skyReflection  // amber sky reflected on water surface

if terrainType == ROCK:
    fg = mineralVeining(iron, copper, manganese)  // mineral streaks in rock

if coverType == FOREST:
    fg = canopyHighlight  // bright crimson frond tips catching light
    // Intensity scales with canopyDensity

if coverType == MUSHFOREST:
    fg = chemotrophicGrowthTip(iron, copper, manganese)  // mineral-tinted growth
```

**Mid-tone (mid color):**

The mid color renders intermediate detail. Blend of bg and fg, shifted toward the dominant material:

```
mid = blend(bg × 0.6, fg × 0.4)
```

### Layer 2: Star modification

Apply the locked star spectrum transform to all palette colors:

```
R_star = R_white × 0.95
G_star = G_white × 0.88
B_star = B_white × 0.72
```

The yellow-orange star suppresses blue, slightly reduces green, passes red nearly unchanged. This makes everything warmer but preserves relative color differences.

### Layer 3: Chromatic adaptation

Apply the visual system's compensation for the dim warm illuminant:

```
R_screen = R_star × 0.832
G_screen = G_star × 0.916
B_screen = B_star × 1.012
```

Net transform (Layer 1 → Layer 3):
```
R_final = R_white × 0.790
G_final = G_white × 0.806
B_final = B_white × 0.728
```

### Continuous variation within terrain types

Because the palette is computed from continuous physical properties, two tiles with the same terrain type get different colors when their properties differ:

- Two MUD tiles: one iron-rich (rust-brown mud), one copper-rich (olive-brown mud)
- Two GRASS tiles: one high groundCover (solid crimson), one low groundCover (substrate showing through)
- Two FOREST tiles: one high canopyDensity (dark, deep shade), one low canopyDensity (brighter, dappled)
- Two ROCK tiles: one high manganese (purple-gray), one depleted (pale gray)

This variation is not cosmetic. It's information. The player looking at the ground can read the mineral chemistry from the color. A rust-colored patch of mud tells them iron. An olive patch tells them copper. This is the same way a real geologist reads landscape.

---

## Sprite Variant Selection

The terrain type determines the base sprite. The physical state selects a VARIANT of that sprite.

### Variant selection rules

**MUD variants:**
```
if saturation > 0.95:  variant = MUD_POOLED      // standing water in depressions, wet gleam
if saturation > 0.85:  variant = MUD_SLICK        // smooth wet surface
if saturation > 0.75:  variant = MUD_TEXTURED     // slight texture, drying edges
default:               variant = MUD_DEFAULT
```

**GRASS variants:**
```
if groundCover > 0.85: variant = GRASS_DENSE      // solid mat, no gaps
if groundCover > 0.6:  variant = GRASS_DEFAULT     // standard coverage
if groundCover > 0.3:  variant = GRASS_PATCHY      // substrate visible between patches
default:               variant = GRASS_SPARSE      // barely any mat, mostly substrate
```

**WATER variants:**
```
if depth > 0.3:  variant = WATER_DEEP        // darker, less bottom visible
if depth > 0.1:  variant = WATER_SHALLOW     // bottom visible, ripples
default:         variant = WATER_PUDDLE       // barely covering ground, reflection
```

**ROCK variants:**
```
if grainSize > 0.9:  variant = ROCK_BEDROCK     // solid exposed rock face
if grainSize > 0.75: variant = ROCK_BOULDER     // large loose rocks
default:             variant = ROCK_GRAVEL       // coarse loose material
```

**FOREST cover variants:**
```
if canopyDensity > 0.75: variant = FOREST_CLOSED     // dense canopy, deep shade
if canopyDensity > 0.5:  variant = FOREST_STANDARD    // moderate canopy
default:                  variant = FOREST_OPEN        // sparse canopy, light through
```

**MUSHFOREST cover variants:**
```
if canopyDensity > 0.6: variant = MUSH_COLONY        // dense mound colony
if canopyDensity > 0.3: variant = MUSH_SCATTERED      // scattered structures
default:                 variant = MUSH_CRUST          // low crust, no vertical structure
```

**SAND, DIRT, BEACH:** fewer variants needed. One or two based on grain size or organic content.

### Variant implementation

Each variant is a sprite definition in sprites.js with the same structure as existing sprites — a pixel grid using '.', '-', '#' characters. The palette determines the colors; the variant determines the pattern. This means:

- MUD_POOLED uses more '#' pixels (bright fg = amber water highlights)
- MUD_SLICK uses mostly '-' pixels (dim, uniform wet surface)
- GRASS_DENSE uses mostly '-' and '#' pixels (solid mat coverage)
- GRASS_PATCHY mixes '.' pixels (bg = visible substrate) with '-' and '#'

The variant is selected at chunk generation time and stored per tile (4 bits = 16 possible variants per terrain type, more than enough).

---

## Gameplay-Readable Properties

The physical state is available for any gameplay system to query. These are not separate stats — they're derived from the physical properties that already exist on the tile.

### Movement

```
movementCost = baseTerrainCost × saturationModifier × coverModifier

baseTerrainCost:
    WATER:      impassable (without swimming/wading)
    DEEP_WATER: impassable (without swimming)
    MUD:        1.5 (slogging through)
    GRASS:      1.0 (baseline)
    DIRT:       1.0
    SAND:       1.2 (footing shifts)
    ROCK:       1.1 (uneven surface)
    BEACH:      1.1

saturationModifier:
    saturation > 0.9:  ×1.3  (every step sinks)
    saturation > 0.7:  ×1.1  (soft ground)
    else:               ×1.0

coverModifier:
    FOREST:         ×1.2  (navigating around trunks)
    SPARSE_FOREST:  ×1.1
    MUSHFOREST:     ×1.3  (navigating around colony structures)
    NONE:           ×1.0
```

Movement cost is physical. Saturated mud is hard to walk through because your feet sink. Dense forest is slow because you navigate between trunks. This isn't a game balance lever — it's a physical consequence of what the tile IS.

### Vibration propagation

Ground vibration (footsteps, impacts) propagates through substrate. Relevant for creatures with vibration transducers.

```
vibrationTransmission = substrateDensity × saturationBonus × depthFactor

substrateDensity:
    grainSize < 0.2 (clay):   0.9  (dense, well-coupled particles)
    grainSize < 0.5 (sand):   0.6  (loose coupling, energy absorbed)
    grainSize < 0.7 (gravel): 0.4  (air gaps between particles)
    grainSize > 0.7 (rock):   0.95 (solid, excellent transmission)

saturationBonus:
    saturation > 0.8:  ×1.3  (water fills pore space, improves coupling)
    saturation > 0.5:  ×1.1
    else:               ×1.0

depthFactor:
    organicContent > 0.5: ×0.7  (organic layer absorbs vibration)
    else:                  ×1.0
```

Saturated clay transmits vibration well (water couples particles). Dry gravel absorbs it (air gaps). Thick organic layer dampens it (spongy material). A creature hiding in peat on dry gravel is nearly vibration-invisible. The same creature on wet clay is detectable from much further away.

### Chemical scent retention

Chemical traces (scent molecules) persist on surfaces. Relevant for creatures with chemical transducers.

```
scentRetention = surfaceArea × moistureBonus × organicBonus

surfaceArea:
    // Fine-grained materials have more surface area per volume
    grainSize < 0.2:  1.0  (clay: enormous surface area)
    grainSize < 0.5:  0.6  (sand: moderate)
    grainSize > 0.7:  0.2  (rock: minimal surface area)

moistureBonus:
    // Moisture helps scent molecules bind to surfaces
    saturation > 0.5:  ×1.4
    saturation > 0.2:  ×1.1
    else:               ×0.8  (dry surfaces release scent faster)

organicBonus:
    // Organic material binds and slowly releases scent
    organicContent > 0.3: ×1.3
    else:                  ×1.0
```

Wet clay with high organic content holds scent longest — a creature's trail through a swamp lingers for many turns. Dry rock holds almost nothing — a trail over a rocky ridge fades fast. This makes swamps dangerous for prey (scent trails persist, trackers can follow) and rocky ridges safer (trails vanish quickly).

### Visual detection

How well a creature blends into or stands out against this tile. Relevant for the visual detection system.

```
tileVisualComplexity:
    // Complex visual texture makes it harder to spot creatures
    // (disruptive coloration works better against busy backgrounds)
    
    if coverType != NONE:
        complexity = 0.8 + canopyDensity × 0.2  // forest is visually complex
    else if terrainType == MUD && saturation > 0.8:
        complexity = 0.3  // uniform dark mud, easy to spot things on it
    else if terrainType == GRASS:
        complexity = 0.5 + groundCover × 0.3  // patchy mat has moderate complexity
    else if terrainType == ROCK:
        complexity = 0.6  // rocks have irregular shapes, moderate complexity
    else:
        complexity = 0.4

tileLuminance:
    // Affects contrast detection — dark tiles make light creatures visible and vice versa
    // Derived from palette bg value
    luminance = (palette.bg.r * 0.299 + palette.bg.g * 0.587 + palette.bg.b * 0.114) / 255
```

A dark-colored creature on bright sand stands out. The same creature on dark mud under forest canopy is nearly invisible. The tile's visual properties are physical — they come from the material colors and coverage, not from a "concealment rating."

### Sound propagation

How well airborne sound propagates from this tile. Relevant for creatures with air vibration transducers (hearing).

```
soundAbsorption:
    if coverType == FOREST:      0.4  // canopy absorbs and scatters sound
    if coverType == MUSHFOREST:  0.5  // dense colony structures absorb more
    if coverType == SPARSE_*:    0.2  // some absorption
    if terrainType == WATER:     0.05 // water reflects sound well
    else:                         0.1  // open ground, minimal absorption
```

Sound carries further over water (minimal absorption) and less far through forest (canopy absorbs). A predator approaching through dense forest is harder to hear than one approaching across open mud.

---

## What Biomes Become

The word "biome" no longer describes a design category. It describes a REGION of similar physical conditions — an area where the tiles share similar substrate, saturation, mineral chemistry, and flora type because they share the same geological and hydrological context.

The player doesn't enter a "swamp biome." They walk downhill from a ridge and notice: the ground gets softer (saturation increasing), the mat gets wetter (groundCover pattern changing), puddles appear in the low spots (standing water in channels), the canopy thins (too waterlogged for deep roots), and the color shifts (more organic content darkens the mud). They're in a swamp because the physics put them there, not because a biome boundary triggered.

The BIOME_PROFILES in ecology-data.js become palette generation rules keyed by physical property ranges rather than biome labels. The existing palette slots (bg, fg, mid per biome) are replaced by the per-tile palette computation described above. The biome name (if used at all) is a human-readable label derived from the tile cluster's physical properties — "iron-rich lowland swamp forest" is a description of what's there, not an instruction to the generator.

---

## Transition Properties

Physical properties change continuously across space. There are no hard biome boundaries. But some transitions ARE sharp because the physics produces them:

**Sharp transitions (physically real):**
- Land to water (the shoreline — elevation crosses sea level)
- Channel to ridge (the drainage bank — a few tiles of steep saturation gradient)
- Canopy to open (forest edge — where saturation or substrate crosses the rooting threshold)
- Rock to soil (cliff base — where deposited regolith begins)

**Gradual transitions (physically real):**
- Iron-rich to copper-rich substrate (mineral chemistry grades over hundreds of meters)
- Wet lowland to drier upslope (saturation decreases with elevation over tens of tiles)
- Dense canopy to sparse canopy (canopy thins gradually as conditions change)
- Photo-dominated to chemo-dominated ground cover (fitness competition grades over the mineral gradient)

The sharp transitions create visual landmarks. The gradual transitions create regional character. Both emerge from physics without any transition-blending code. The chunk generator computes physical state per tile; the physical state changes continuously; the rendering function responds to whatever state it finds.

---

## Rendering Philosophy: Finite Patterns × Continuous Color

The visual richness of the world comes from composing a small, hand-crafted set of sprite patterns with per-tile computed palettes. This is not a procedural sprite generation system. It is a hand-tuned texture library colored by physics.

### Why this works

The existing sprite system separates pattern from color. A sprite is a grid of `.` (bg), `-` (fg dimmed), `#` (fg bright). The pattern defines TEXTURE — the spatial structure of the surface. The palette defines COLOR — what those channels actually look like. Two tiles with the same sprite but different palettes look distinct because the colors communicate different physical properties. Iron-rich mud is rust-brown. Copper-rich mud is olive-brown. Same texture, different material, different color. The sprite doesn't change. The palette does.

This means textural variation (how many sprite patterns exist) and material variation (how many color combinations exist) scale independently. Roughly 25-30 hand-crafted sprite patterns cover all physically distinct textures on the planet. The palette computation produces continuous color variation across all of them. The result is thousands of visually distinct tiles from ~30 hand-tuned sprites.

### The sprite budget

Each terrain type needs 2-4 textural variants representing physically distinct surface states:

- **MUD:** smooth wet, pooled/flooded, drying/cracked (~3 variants)
- **GRASS:** dense mat, standard coverage, sparse/patchy (~3-4 variants)
- **DIRT:** smooth fine, gritty textured (~2 variants)
- **SAND/BEACH:** 1-2 variants each
- **ROCK:** bedrock, boulder, gravel (~3 variants)
- **WATER:** shallow/bottom-visible, deeper/reflective, puddle (~3 variants)
- **FOREST cover:** closed canopy, standard, open (~3 variants)
- **MUSHFOREST cover:** dense colony, scattered, crust-only (~3 variants)

Total: ~25-30 sprites. Each is a 16×16 grid that can be hand-scrutinized and tuned individually. Ground sprites and cover sprites compose independently — a good MUD sprite looks correct under any FOREST variant, and vice versa.

### What the palette handles (not sprites)

All of the following are palette/color variation, NOT sprite variation:

- Mineral chemistry tinting (iron rust-brown, copper olive, manganese purple-gray)
- Saturation darkening (wetter surfaces are darker)
- Organic content shift (high organic → darker brown toward black)
- Flora coverage tinting (more groundCover → more crimson showing through)
- Canopy shade (dense canopy darkens everything underneath)
- Star modification and chromatic adaptation (the locked three-layer pipeline)

A player walking through a mineral gradient notices the mud shifting from rust to olive. That's palette changing tile by tile. The sprite stays MUD_SMOOTH the entire time. The variation is real, physical, and essentially free — arithmetic on physical properties the tile already has.

### The tuning workflow

The sprites are designed to be hand-tuned through play:

1. Build the ~30 sprite variants and the palette computation
2. Generate chunks and walk through the world
3. Identify tiles that look wrong — too dark, too uniform, texture doesn't match the physical state
4. Adjust individual sprites or palette computation coefficients
5. Repeat until each of the ~16 common ground+cover combinations looks right

This is a bounded, completable task. Not an open-ended procedural art problem. The physical model ensures consistency — once a MUD sprite looks right, it looks right everywhere MUD occurs, because the palette adapts to local conditions automatically.

---

## Integration with Existing Game Systems

### What stays unchanged
- Terrain type enum (T.GRASS, T.MUD, etc.) — same values, same meaning
- TERRAIN_INFO lookup by terrain type — movement cost base, passability flags
- Sprite rendering — still reads terrain type and cover type to pick sprites
- Sprite variant system — already exists, just needs more variants and physical selection logic
- The three-layer color pipeline — already exists, just needs per-tile input instead of per-biome input
- Save system — stores player modifications as diffs against generated base

### What changes
- Palette is computed per-tile, not looked up per-biome
- Sprite variant is selected from physical state, not random
- World generation produces physical state arrays instead of biome+terrain pairs
- Creature spawning reads physical properties (mineral chemistry for chemotrophs, substrate for burrowers, water for aquatics) instead of biome labels
- Sensory systems (vibration, scent, vision) read tile physical properties for propagation

### What's new
- Per-tile physical state storage (the typed arrays in the chunk)
- Palette computation function (material → star → adaptation per tile)
- Sprite variant selection function (physical state → variant index)
- Chunk generator (planetary data → drainage → physical state → terrain type)
- Chunk loading/unloading system (generate on approach, cache visited, save modifications)

---

## File Dependencies

When implementing:

- **chunk-generator.js** (new) — generates physical state from planetary data. Reads planetary-geology grid. Writes tile physical state arrays. References drainage-chunk-generator-design.md.
- **palette-compute.js** (new or extracted from rendering.js) — computes per-tile palette from physical state. References three-layer-color-system.md material table.
- **sprites.js** (modified) — add new sprite variants. Add variant selection function.
- **rendering.js** (modified) — pass per-tile palette instead of biome palette. Pass variant index instead of random selection.
- **terrain.js** (modified) — terrain derivation function. Same logic as planet viewer.
- **ecology-data.js** (modified) — BIOME_PROFILES become physical property ranges, or are deprecated entirely.
- **world-gen.js / surface-gen.js** (replaced) — current biome-target generation replaced by chunk generator.

---

## Key Gotchas

- **Palette is computed, not stored.** Computing palette at render time from physical state means palette always matches current state. If a tile gets modified (dug up, flooded, burned), recomputing the palette automatically reflects the change. Don't cache palettes unless profiling proves it's necessary.

- **Terrain type is derived, never assigned.** The chunk generator never says "make this MUD." It computes physical state. The derivation function assigns MUD because grainSize < 0.35 and saturation > 0.75. If those conditions change (tile dries out), the terrain type changes automatically on re-derivation.

- **Sprite variant is deterministic.** The variant selection reads physical properties, not random numbers. Two tiles with identical physical state get the same variant. This ensures visual consistency when chunks are regenerated.

- **The physical state IS the gameplay.** Movement cost, scent retention, vibration propagation, visual detection — all read from the same physical properties that determine appearance. There's one source of truth. A tile can't be visually wet but mechanically dry.

- **Continuous properties, discrete rendering.** The physical state is continuous (saturation 0.78 vs 0.82). The terrain type is discrete (both are MUD). The palette bridges this — continuous physical input produces continuous color output even within a discrete terrain category. The sprite variant adds further visual variation within a category. The rendering is as continuous as the physical state, even though the gameplay vocabulary is discrete.

- **The chunk generator is the world.** Once integrated, there is no separate "world generation" step. The world exists as planetary data (permanent) plus a chunk generator function (deterministic). Chunks materialize when needed and dematerialize when distant. The world is infinite, consistent, and requires no pre-generation. The planet viewer is the design tool; the chunk generator is the runtime.
