# Drainage-Network Chunk Generator — Design Document

Design document for the physical terrain generation system that bridges the planetary map to tile-level gameplay. The drainage network is the organizing skeleton of the landscape. Water flows downhill, carves channels, deposits sediment, and determines what grows where. Every tile the player walks through exists because of water.

Include this alongside planetary-geology-design.md, Ecology-Foundations.md, three-layer-color-system.md, and Design-Principles.md for any terrain generation, chunk loading, or world integration work.

---

## The Core Principle

The planet viewer computes WHAT a region is — its elevation, precipitation, minerals, water table, substrate character, flora balance. The chunk generator computes what that region LOOKS LIKE at ground level. The bridge between them is drainage: the physical process of water flowing downhill over geological time, which determines the spatial arrangement of wet channels, dry ridges, deposited sediment, and rooted flora within any region.

Terrain types (MUD, GRASS, FOREST, ROCK) are the rendering vocabulary — human labels for physical states. They are outputs, never inputs. The generator computes physical state per tile. The renderer maps physical state to terrain type. If you deleted the terrain type labels and just rendered the raw physical state (substrate color × saturation × flora coverage), the world would look the same. The labels exist because the game needs a discrete vocabulary for gameplay mechanics (movement cost, visibility, creature spawning).

---

## Architecture

```
Planetary grid (512×256, ~156 km/cell)
        ↓ bilinear interpolation
Regional context (what kind of landscape is this?)
        ↓ parameterization
Structured micro-topography (ridge-channel pattern)
        ↓ flow accumulation
Drainage network (where water concentrates)
        ↓ physical derivation
Per-tile state (substrate, saturation, flora)
        ↓ rendering function
Terrain type + cover type + palette
```

Each step is deterministic from seed and world position. No randomness. No budgets to distribute. The tile exists because the physics at that coordinate produced it.

---

## Scale Relationships

| Scale | Grid | Cell size | What it contains |
|---|---|---|---|
| Planetary | 512 × 256 | ~156 km | Plates, elevation, minerals, precipitation, water table, flora balance |
| Regional | 512 × 512 per region | ~1 km | Coastline detail, river corridors, volcanic features, mineral deposit boundaries |
| Chunk | 512 × 512 tiles | ~2 m/tile (~1 km total) | The tiles the player walks through |

A single planetary cell contains roughly 78,000 × 78,000 tiles — about 150 × 150 chunks. The player's visible area (~224 × 224 tiles) is less than half a chunk. The active simulation radius is maybe 3-5 chunks in each direction.

A chunk aligns with a regional cell. One regional cell = one chunk. This is deliberate: the regional grid exists to provide the intermediate-scale data that the chunk generator needs without querying the planetary grid at tile resolution.

---

## Step 1: Regional Context Lookup

When a chunk needs to be generated, the generator first determines the regional context — what kind of landscape this chunk sits within.

### Input
Chunk coordinates (chunkX, chunkY) in world space.

### Process
Map chunk position to planetary grid coordinates. Sample the planetary cell at this position and its 8 neighbors. Bilinearly interpolate all planetary properties across the chunk to get smooth gradients:

- `elevation` — regional average elevation above sea level
- `slope` — magnitude of the elevation gradient (how steep the regional terrain is)
- `slopeDirection` — which way is downhill (2D vector, points from high to low)
- `precipitation` — how much rain falls here
- `waterTableBaseline` — how deep the water table sits on average
- `grainSizeRegional` — average substrate grain size from the planetary substrate model
- `minerals` — iron, copper, manganese concentrations
- `volcanism` — geothermal activity level
- `floraType` — dominant flora type (photo/chemo/mixo)
- `floraDensityPlanetary` — planetary-scale flora density estimate

These values set the CHARACTER of the chunk — they determine the parameters of the drainage pattern, not the specific tile layout.

### Landscape Zone Classification

From the interpolated values, classify the chunk into a landscape zone. The zone determines the drainage pattern parameters. This isn't a biome label — it's a description of the geomorphological regime.

```
if elevation > 0.45:
    zone = SUMMIT
    // Volcanic peak. Exposed bedrock. Radial drainage, steep V-channels.
    // Sparse or no flora. Coarse substrate. Deep water table.

else if elevation > 0.25 && slope > 0.15:
    zone = UPPER_SLOPE
    // Steep volcanic flanks. Deep V-cut channels, narrow ridges.
    // Moderate flora on ridges. Coarse to moderate substrate.

else if elevation > 0.10 && slope > 0.06:
    zone = MID_SLOPE
    // Moderate terrain. Channels widen, ridges broaden.
    // Good flora on ridges, wet channels. Moderate substrate.

else if elevation > 0.03:
    zone = LOWLAND
    // Near sea level but above tidal influence. Gentle terrain.
    // Wide shallow channels, subtle ridges. Fine substrate.
    // Dense swamp forest. This is the DOMINANT zone on this planet.

else if elevation > 0.005:
    zone = COASTAL
    // Tidal influence. Very flat. Channels merge into tidal flats.
    // Saturated fine substrate. Open mud/mat. Minimal canopy.

else:
    zone = TIDAL
    // At or barely above sea level. Intermittently submerged.
    // Pure mud flat or shallow water. No rooted canopy flora.
```

On this planet — wet archipelago, most land low-elevation — the LOWLAND zone dominates. COASTAL is the next most common. MID_SLOPE and UPPER_SLOPE exist on volcanic islands with significant elevation. SUMMIT is rare. TIDAL is narrow but extensive (high coastline-to-area ratio).

---

## Step 2: Structured Micro-Topography

The chunk generator creates local elevation variation that produces the ridge-and-channel pattern appropriate for the zone. This is NOT random noise. It is physically constrained noise that produces the specific topographic texture that water erosion creates.

### The physics of drainage-carved topography

Water erosion over geological time produces a characteristic landscape texture: parallel-ish channels running downhill, separated by ridges. The channels collect water, the ridges shed it. The spacing and depth of channels depends on:

- **Slope**: steeper terrain = more erosive energy = deeper, closer-spaced channels
- **Precipitation**: more rain = more water = wider channels, narrower ridges
- **Substrate resistance**: hard rock = wider-spaced channels (harder to erode). Soft sediment = closer-spaced (erodes easily)
- **Time**: longer exposure = more developed drainage pattern

These relationships are well-studied in geomorphology. The key metric is **drainage density** — total channel length per unit area. It increases with precipitation and decreases with substrate resistance.

### Noise parameterization by zone

The micro-topography is generated by an anisotropic noise function. "Anisotropic" means it has different wavelengths in different directions — stretched perpendicular to the slope direction (channels run downhill, ridges run along contours).

| Zone | Channel spacing (tiles) | Channel depth (elevation units) | Ridge width (tiles) | Anisotropy | Character |
|---|---|---|---|---|---|
| SUMMIT | 20-30 | 0.04-0.06 | 10-15 | moderate | Radial from peak. Deep V-cuts in rock. |
| UPPER_SLOPE | 25-40 | 0.03-0.05 | 15-25 | high | Parallel channels running downslope. Steep sided. |
| MID_SLOPE | 40-70 | 0.02-0.03 | 25-45 | high | Widening channels with some meander. |
| LOWLAND | 60-120 | 0.005-0.015 | 30-60 | moderate | Wide, shallow, meandering channels. Subtle ridges. |
| COASTAL | 80-150 | 0.002-0.005 | 40-80 | low | Very subdued channels merging into flats. |
| TIDAL | n/a | 0 | n/a | none | Essentially flat. No channel-ridge structure. |

### Noise construction

The micro-topography for a chunk is computed as:

```
localElevation(x, y) = regionalElevation
                      + ridgeChannelNoise(x, y, params)
                      + detailNoise(x, y)
```

**ridgeChannelNoise** is the primary structure. It produces the ridge-and-channel pattern:

1. Compute a directional coordinate system aligned with the regional slope:
   - `downslope` = slopeDirection (unit vector pointing downhill)
   - `contour` = perpendicular to downslope (runs along elevation contours)

2. Transform tile coordinates into this system:
   - `u` = dot(tilePos, contour)  — position along the contour
   - `v` = dot(tilePos, downslope) — position down the slope

3. The noise is periodic in `u` (channels repeat along the contour direction) with wavelength = channel spacing. It's smoother in `v` (channels are continuous downslope). Multiple octaves add tributary structure — smaller channels branching off larger ones:

```
amplitude = channelDepth
for octave in [1, 2, 3]:
    frequency_u = octave / channelSpacing
    frequency_v = octave / (channelSpacing * anisotropy)
    contribution = noise2D(u * frequency_u + seedOffset, v * frequency_v + seedOffset)
    ridgeChannel += contribution * amplitude
    amplitude *= 0.45  // each octave is less than half the previous
```

The first octave creates the primary channels. The second creates tributaries. The third creates rills and micro-channels. Each successive octave has half the spacing and less than half the amplitude.

4. The noise uses WORLD coordinates (not chunk-local). This ensures channels are continuous across chunk boundaries. Two adjacent chunks produce topography that connects seamlessly because the noise function receives the same world-space coordinates at the shared edge.

**detailNoise** adds small-scale terrain variation — individual boulders, root mounds, shallow depressions. This is standard multi-octave noise at tile scale. Low amplitude. Breaks up uniformity without creating structure.

### Slope direction at SUMMIT zone

At the summit, drainage is radial — channels point outward in every direction from the peak. The slope direction rotates around the summit. The noise should be computed in polar coordinates relative to the peak center rather than in the u/v directional system:

```
angle = atan2(tileY - peakY, tileX - peakX)
radius = distance(tile, peak)
// Channels are radial (along radius), ridges are circumferential (along angle)
u = angle * radius   // circumferential position (channels repeat around the peak)
v = radius           // radial position (channels extend outward)
```

This produces a starburst drainage pattern that matches real volcanic island geomorphology.

### Cross-chunk continuity

Because the noise uses world coordinates, channel patterns are automatically continuous across chunk boundaries. No stitching needed. The seed offsets per octave are computed from the planetary seed:

```
seedOffset_octave_N = hash(planetarySeed, octave_N)
```

Every chunk on the planet uses the same noise function with the same seeds. The only thing that varies is the input coordinates and the zone-derived parameters.

**Parameter interpolation at zone boundaries:** When a chunk spans the transition between two zones (e.g., MID_SLOPE to LOWLAND), the parameters (channel spacing, depth, anisotropy) should interpolate smoothly across the transition. Use the interpolated elevation to blend:

```
t = smoothstep(zoneA.elevMax, zoneB.elevMin, localElevation)
channelSpacing = lerp(zoneA.spacing, zoneB.spacing, t)
channelDepth = lerp(zoneA.depth, zoneB.depth, t)
```

This prevents abrupt changes in drainage character at zone boundaries.

---

## Step 3: Local Flow Accumulation

With local elevation computed, run a flow accumulation algorithm on the chunk to determine where water concentrates.

### Algorithm

1. **Sort all tiles in the chunk by elevation, highest first.** Use a counting sort or radix sort for speed — elevation can be quantized to 256 or 1024 bins without loss of meaningful precision.

2. **For each tile in descending elevation order:**
   - Find the lowest neighbor among the 8 surrounding tiles.
   - Record the flow direction: this tile drains toward that neighbor.
   - Add this tile's water contribution to that neighbor's accumulation.

3. **Each tile's water contribution** is its local precipitation plus any water flowing in from upstream tiles:
   ```
   waterContribution(tile) = tilePrecipitation + sum(upstream tiles' contributions that flow here)
   ```
   Since tiles are processed highest-first, all upstream contributions are already computed when a tile is processed.

4. **Edge handling:** Tiles at chunk edges that would flow off the chunk contribute their water to a boundary sink. In practice, for a 512×512 chunk, the edge tiles are a small fraction and the drainage network interior to the chunk is unaffected. For visual continuity, the noise-generated topography already extends smoothly beyond chunk edges, so channels that exit one chunk enter the adjacent chunk at the corresponding position.

### Output per tile

```
tile.flowAccumulation — total upstream water flowing through this tile (0 = ridge crest, large numbers = main channel)
tile.flowDirection — which of the 8 neighbors this tile drains toward
```

### Stream order classification

From flow accumulation, classify each tile's position in the drainage hierarchy:

```
if flowAccumulation > channelThreshold_3:
    streamOrder = 3   // Main channel. Wide, slow, deep.
else if flowAccumulation > channelThreshold_2:
    streamOrder = 2   // Secondary channel. Moderate.
else if flowAccumulation > channelThreshold_1:
    streamOrder = 1   // Tributary/rill. Narrow, fast.
else:
    streamOrder = 0   // Interfluve/ridge. Sheds water, doesn't collect it.
```

The thresholds scale with precipitation — wetter chunks have wider channels (more water per channel, reaching higher stream orders). Drier chunks have narrower channels.

```
channelThreshold_1 = baseThreshold / (1 + precipitation * thresholdPrecipFactor)
channelThreshold_2 = channelThreshold_1 * 4
channelThreshold_3 = channelThreshold_1 * 16
```

---

## Step 4: Per-Tile Physical State

Every tile gets a physical state computed from its position in the drainage network, the regional context, and the planetary data. This is the tile's body map.

### 4a: Local Substrate

Substrate grain size varies within the chunk based on drainage position:

```
In channels (streamOrder > 0):
    // Water velocity determines what stays and what washes away
    if regional slope is steep (UPPER_SLOPE, SUMMIT):
        // Fast water carries everything fine away. Coarse gravel/cobble remains.
        grainSize = 0.7 + noise * 0.1
    else if regional slope is moderate (MID_SLOPE):
        // Moderate water sorts to gravel-sand.
        grainSize = 0.5 + noise * 0.1
    else (LOWLAND, COASTAL):
        // Slow water drops fine sediment. Silt and clay accumulate.
        grainSize = 0.1 + noise * 0.1

On ridges/interfluves (streamOrder == 0):
    // Inherited from regional substrate, modified by local conditions
    grainSize = regionalGrainSize + noise * 0.1
    // Ridges on steep slopes: coarser (weathered rock, not transported)
    // Ridges on gentle slopes: moderate (in-situ soil development)

Transition (low streamOrder, channel margins):
    // Graded between channel and ridge values
    grainSize = lerp(channelGrain, ridgeGrain, distanceFromChannelCenter / channelWidth)
```

Mineral chemistry at tile scale: interpolated from planetary data, with enrichment along channels (dissolved minerals precipitate where water slows) and near volcanic features:

```
tile.iron = regional.iron + channelEnrichment * regional.iron * 0.2
tile.copper = regional.copper + channelEnrichment * regional.copper * 0.2
tile.manganese = regional.manganese + channelEnrichment * regional.manganese * 0.2
```

Where `channelEnrichment` scales with stream order (higher order = more concentrated minerals from upstream transport).

### 4b: Local Water Table and Saturation

The water table within a chunk follows the drainage network:

```
// Base water table from planetary data
baseDepth = waterTableBaseline

// Channel position pulls water table to surface (or above)
if streamOrder >= 2:
    // Main channel: water table at or above surface
    localDepth = min(baseDepth, -0.01 * streamOrder)
else if streamOrder == 1:
    // Tributary: water table near surface
    localDepth = min(baseDepth, 0.01)
else:
    // Interfluve: water table at regional baseline
    // Modified by local elevation relative to channel
    localRelief = localElevation - nearestChannelElevation
    localDepth = baseDepth + localRelief * reliefFactor
```

Saturation from water table depth (same physics as planetary model, applied per tile):

```
capillaryHeight = (1.0 - grainSize) * capillaryFactor
effectiveDepth = localDepth - capillaryHeight

if effectiveDepth <= 0:
    saturation = clamp(1.0 - effectiveDepth * 2.0, 0.7, 1.0)
else:
    saturation = clamp(exp(-effectiveDepth * saturationDecayRate), 0, 0.7)
```

**The critical outcome on this wet planet:** On LOWLAND and COASTAL zones, the water table baseline is near the surface. Even the ridges between channels have moderate saturation (0.4-0.6) because the water table is only slightly below the surface. The channels are fully saturated or ponded. The only well-drained ground is on MID_SLOPE and above, where elevation creates enough water table depth for the ridges to genuinely dry out. This produces the marshy, wet-underfoot experience that dominates the lowland islands.

### 4c: Ponding and Standing Water

Standing water (water tiles at ground level) occurs where:

1. The water table is above the surface AND the tile is in a topographic depression (flow accumulation has no lower neighbor — a local minimum), OR
2. The tile is in a high-order channel in a low-slope zone (the channel is wide and slow enough that water pools rather than flowing)

```
if waterTableDepth < 0 AND tile is local minimum:
    hasStandingWater = true
    waterDepth = -waterTableDepth  // positive = depth of water above ground

else if streamOrder >= 3 AND zone is LOWLAND or COASTAL:
    hasStandingWater = true
    waterDepth = streamOrder * 0.005  // shallow — ankle to knee depth

else if streamOrder >= 2 AND zone is COASTAL:
    hasStandingWater = true
    waterDepth = streamOrder * 0.01   // tidal channels are wider and deeper

else:
    hasStandingWater = false
    waterDepth = 0
```

Standing water tiles become WATER terrain. They're not ocean — they're freshwater (or brackish near the coast) channels and ponds within the landscape. The water is shallow (usually < 0.5m), amber-tinted from dissolved minerals and organic matter, and often partially covered by floating photosynthetic mat.

### 4d: Flora per Tile

Flora is computed per tile from the local physical state. Three layers, as discussed in design:

**Ground cover (photosynthetic mat):**

Present almost everywhere there's stable substrate and light. The mat is the biological default on this planet — any surface that isn't actively submerged, fresh lava, or bare vertical rock has mat growing on it.

```
if hasStandingWater AND waterDepth > 0.1:
    groundCover = 0  // too deep for mat — submerged
else if hasStandingWater AND waterDepth <= 0.1:
    groundCover = 0.4  // shallow water: floating mat, partial coverage
else if grainSize > 0.8:
    groundCover = 0.1  // bare rock/boulder: mat in crevices only
else if saturation > 0.95:
    groundCover = 0.7  // saturated mud: mat grows but doesn't cover everything (puddles)
else:
    groundCover = 0.6 + (1.0 - grainSize) * 0.3  // fine substrate = more mat coverage
    // Damp fine soil: 0.9 coverage. Sandy soil: 0.75. Gravel: 0.6.
```

**Stalked flora (canopy / fern-trees):**

Requires rootable substrate, adequate water, and NOT being permanently submerged. This is the "forest" layer — the thing that creates canopy, shade, and vertical structure.

```
if hasStandingWater:
    canopyDensity = 0  // can't root in standing water
else if grainSize > 0.7:
    canopyDensity = 0  // can't root in coarse gravel/rock
else if saturation > 0.9:
    // Saturated but not submerged: can root, but waterlogged conditions 
    // stress root systems. Reduced density. This is swamp forest.
    canopyDensity = (saturation < 0.95) 
        ? 0.5 * floraDensityPlanetary  // marginal swamp
        : 0.3 * floraDensityPlanetary  // deep swamp, sparse canopy
else if saturation > 0.4:
    // Moist, drained soil: ideal growing conditions. Maximum density.
    canopyDensity = 0.8 * floraDensityPlanetary
else:
    // Dry: still viable but reduced
    canopyDensity = 0.4 * floraDensityPlanetary
```

The multiplication by `floraDensityPlanetary` ties the local density to the planetary prediction. A chunk in a high-precipitation zone (planetary density 0.7) produces denser canopy on its ridges than a chunk in a low-precipitation zone (planetary density 0.3). The local drainage structure determines WHERE within the chunk the canopy grows; the planetary data determines HOW MUCH total canopy to expect.

**Chemotrophic crust:**

Present where minerals are concentrated and conditions suit chemosynthesis. Competes with photosynthetic mat for ground surface.

```
mineralTotal = iron + copper + manganese
if mineralTotal > chemoThreshold:
    chemoFitness = mineralTotal * max(saturation, volcanism * 1.5)
    photoFitness = groundCover * 0.8
    if chemoFitness > photoFitness:
        chemoCrust = clamp((chemoFitness - photoFitness) * 2.0, 0, 1)
        groundCover *= (1.0 - chemoCrust * 0.7)  // chemo displaces some mat
    else:
        chemoCrust = 0
else:
    chemoCrust = 0
```

Chemotrophic crust concentrates at: volcanic vents (high volcanism, high minerals), mineral-enriched channel deposits (high stream order in mineral-rich zones), and exposed bedrock with high mineral content. It's patchy — islands of purple-teal crust within the crimson mat landscape.

### 4e: Organic Layer

Dead biological material accumulates based on production and decomposition rates:

```
production = (groundCover + canopyDensity) * 0.5  // more living material = more dead material
decompositionRate = saturation > 0.7 ? 0.3 : 0.7  // waterlogged = slow decomposition
organicContent = production * (1.0 - decompositionRate)
```

Saturated zones with dense flora accumulate thick organic layers (peat-like). Well-drained ridges with dense canopy have thinner organic layers. This affects substrate color (more organic = darker brown) and walkability (thick organic layer = softer, boggier ground even on ridges).

---

## Step 5: Terrain Type Derivation

The same rendering function from the planetary viewer, applied per tile:

```
// ── Standing water ──
if hasStandingWater:
    if waterDepth > 1.0:    terrainType = DEEP_WATER
    else:                     terrainType = WATER

// ── Saturated fine substrate ──
else if grainSize < 0.35 AND saturation > 0.75:
    terrainType = MUD

// ── Sandy coast ──
else if grainSize >= 0.35 AND grainSize < 0.6 AND isCoastal:
    terrainType = BEACH

// ── Moist ground with flora ──
else if saturation > 0.4 AND groundCover > 0.3:
    terrainType = GRASS  // photosynthetic mat on damp ground

// ── Coarse or bare ──
else if grainSize > 0.7 OR (elevation > regional.elevHigh AND saturation < 0.3):
    terrainType = ROCK

// ── Sandy dry ──
else if grainSize >= 0.4 AND saturation < 0.3:
    terrainType = SAND

// ── Default damp ground ──
else if groundCover > 0.1:
    terrainType = GRASS
else:
    terrainType = DIRT

// ── Cover type ──
if canopyDensity > 0.5:
    if floraType == photosynthetic: coverType = FOREST
    if floraType == chemotrophic:   coverType = MUSHFOREST
else if canopyDensity > 0.2:
    coverType = SPARSE_FOREST (or SPARSE_MUSHFOREST)
else:
    coverType = NONE
```

### The dominant tile combinations on this planet

In order of frequency across all land tiles:

1. **MUD + FOREST** — Swamp forest. Saturated fine substrate with fern-tree canopy. The default lowland terrain. Dark crimson canopy overhead, dark wet mud underfoot, amber-tinted water in every depression. The player walks through ankle-deep muck under a low ceiling of fronds. ~25-35% of all land tiles.

2. **MUD + NONE** — Open mud flat. Saturated fine substrate, no canopy. Photosynthetic mat covers most of the surface (the ground is crimson-brown, not bare). This is tidal flat, channel margin, or exposed lowland where canopy can't establish (too wet, too unstable). ~15-20%.

3. **GRASS + FOREST** — Elevated forest. Moist but drained fine substrate with dense canopy. The "nicest" terrain — relatively dry footing under dense canopy. Found on ridges and upper slopes where drainage carries water away. ~10-15%.

4. **WATER + NONE** — Standing water. Shallow channels, ponds, tidal pools. Amber-tinted. Often with floating photosynthetic mat at the edges. ~8-12%.

5. **GRASS + NONE** — Open mat. Photosynthetic ground cover on drained substrate, no canopy. Ridge crests, upper slopes, clearings. Red-brown ground visible to the sky. ~5-10%.

6. **MUD + MUSHFOREST** — Chemotrophic swamp. Mineral-rich saturated substrate with chemotrophic colony structures (mounds, brackets, crusts) instead of fern-trees. Found near volcanic vents and mineral deposits. Purple-teal-ochre tones on dark mud. ~3-5%.

7. **ROCK + NONE** — Exposed rock. Volcanic peaks, cliff faces, fresh lava. Sparse mat in crevices. Coarse substrate. ~3-5%.

8. **BEACH + NONE** — Sandy coast. Wave-sorted sand at the ocean margin. ~2-3%.

9. **SAND + NONE** — Dry sand. Rare on this planet. Only at mineral-depleted zones or specific geological contexts. ~1-2%.

---

## Step 6: Palette Selection

Each tile's palette (bg color, fg color, mid color) is derived from its physical state through the three-layer color pipeline documented in three-layer-color-system.md.

The key inputs to palette selection:

- **Substrate mineral chemistry** (iron/copper/manganese) → tints the base ground color
- **Saturation** → wet surfaces are darker
- **Organic content** → high organic darkens toward brown
- **Flora type** → photosynthetic mat is crimson, chemotrophic crust is mineral-tinted
- **Canopy density** → under canopy, everything darkens (reduced light reaching ground)

The palette is NOT selected from a biome lookup table. It is computed per tile from the material composition at that tile. Two tiles with terrainType = MUD might have different palettes because one is in an iron-chemistry zone (rust-brown mud) and the other is in a copper-chemistry zone (green-brown mud). The terrain type selects the sprite; the physical state selects the colors.

---

## Step 7: Feature Placement

After terrain types are assigned, place specific features:

**Rivers:** Tiles with streamOrder >= 3 that have standing water form a connected river. The river follows the flow direction through connected water tiles. River tiles get a directional flow property for rendering (current direction = flow direction).

**Pools:** Tiles with standing water that are NOT connected to a river are isolated pools. Ponds in depressions, puddles in low spots.

**Mineral seeps:** Tiles with high volcanism + high minerals + high saturation near stream channels. Mark as feature for visual variation (discolored water, mineral deposits on adjacent substrate).

**Hot springs:** Tiles with very high volcanism + standing water. Geothermally heated, mineral-rich pools. Mark for fauna spawning (specialized chemotrophic creatures cluster here).

**Exposed bedrock outcrops:** Tiles with grainSize > 0.85 on slopes. Large rock surfaces. Mark for visual variation (different sprite, visible mineral veining).

All features are deterministic from the physical state — they're not placed by a separate feature system, they're recognized from the tile's properties.

---

## Cross-Chunk Continuity

### Noise continuity
The ridge-channel noise function takes world-space coordinates. Adjacent chunks produce identical values at shared edges. No stitching.

### Flow accumulation at edges
Water flowing off a chunk edge would naturally flow into the adjacent chunk. For chunk generation in isolation (adjacent chunk may not exist yet), edge-exiting water is simply lost. This is acceptable because:

1. The noise-generated topography ensures channels continue across boundaries — the visual continuity is maintained.
2. Flow accumulation values near chunk edges are slightly under-counted (missing upstream contribution from ungenerated chunks). This means edge-adjacent tiles might have slightly lower stream order than they "should." In practice, the effect is small and only affects tiles within ~20 tiles of the chunk edge.
3. When the adjacent chunk IS generated later, both chunks already agree on the topography. A full cross-chunk flow accumulation could be run as a refinement pass, but it's not necessary for visual quality.

### Parameter continuity
Zone classification and drainage parameters interpolate smoothly from the planetary grid. Two adjacent chunks in the same planetary cell get the same zone parameters. Two chunks straddling a zone transition get smoothly interpolated parameters. No discontinuities.

---

## What This Replaces

| Current system | Replaced by |
|---|---|
| BIOME_TARGET (16×16 hand-placed biome grid) | Planetary grid lookup (512×256 geology-derived) |
| BIOME_PROFILES (per-biome ground/cover weights) | Per-tile physical state derivation |
| Random terrain placement within biomes | Drainage network structure |
| BIOME blend system (gradient between biome types) | Smooth interpolation of physical properties |
| surface-gen.js terrain placement | Chunk generator reading planetary data |
| Hardcoded moisture/terrain correlations | Water table + saturation + drainage position |

### What is NOT replaced

- Terrain types (T.GRASS, T.FOREST, etc.) — rendering vocabulary stays
- TERRAIN_INFO — movement cost, visibility, etc per terrain type stays  
- The palette system — palettes stay, selected by physical state instead of biome name
- The sprite system — sprites stay
- The rendering pipeline — unchanged
- All gameplay systems — unchanged
- The planet viewer — stays as design/visualization tool, not runtime dependency

---

## Implementation Order

### Phase A: Regional detail drainage (planet viewer)
Add drainage network generation to the planet viewer's regional detail view. When zoomed to a 512×512 km region at 1km resolution, generate ridge-channel topography and flow accumulation. Show the drainage network as an overlay. This validates the structured noise approach and channel parameterization at intermediate scale before building the tile-level generator.

**Deliverable:** Regional detail view shows visible river networks, tributary patterns, and ridge-valley texture that varies by landscape zone.

### Phase B: Chunk generator prototype (standalone)
Build the chunk generator as a standalone module. Given a planetary grid, a seed, and chunk coordinates, generate a 512×512 tile grid with full physical state and terrain types. Test by generating individual chunks and rendering them using the existing game's rendering pipeline. Compare to the current hand-authored world.

**Deliverable:** A generated chunk that looks like a real place — channels, ridges, swamp forest, mud flats — all clearly caused by topography and water flow.

### Phase C: Chunk loading system
Build the chunk cache and loading system. Chunks generate on demand as the player approaches. Chunks unload when the player moves away. Visited chunks save modifications to IndexedDB. The active simulation radius covers the loaded chunks.

**Deliverable:** The player can walk in any direction and new terrain generates seamlessly. The world is effectively infinite and deterministic.

### Phase D: Full integration
Replace the current world-gen pipeline with the planetary chunk system. Hook up creature spawning to the new terrain. Verify all gameplay systems work with the generated terrain. Migrate save format.

**Deliverable:** The game runs entirely on planetary-derived terrain.

---

## Performance Considerations

Chunk generation must complete in under 100ms to feel instant when the player walks into new territory. The computation per chunk:

- Noise evaluation: ~512 × 512 = 262,144 tiles × 3 octaves × 2 noise calls = ~1.5M noise evaluations. At ~100ns each (optimized Simplex noise) = ~150ms. **This is the bottleneck.**

Mitigations:
- Pre-compute the noise at half resolution (256×256) and bilinearly interpolate to full resolution. Cuts noise evaluations by 4x.
- Use a fast hash-based value noise instead of Simplex for the detail octaves (octaves 2-3). Only the primary ridge-channel octave needs smooth Simplex noise.
- Generate chunks one tick ahead of the player's movement direction (predictive loading). The player never sees a chunk generate — it's ready before they arrive.

- Flow accumulation: sort 262,144 tiles (counting sort: ~1ms) + single pass accumulation (~1ms). Negligible.

- Physical state derivation: single pass over all tiles with arithmetic per tile. ~2-3ms. Negligible.

- Terrain type assignment: single pass, branch-heavy but simple. ~1ms. Negligible.

Total target: ~50-80ms with half-resolution noise optimization. Acceptable for predictive loading.

---

## Determinism Contract

**The same seed + the same world coordinates = the same tiles. Always.**

Every random choice uses a seedable RNG derived from world position:
```
tileSeed = hash(planetarySeed, worldX, worldY)
```

Two players with the same planetary seed see the same world. A player who visits a location, leaves, and returns finds the same terrain. A chunk generated today and a chunk generated tomorrow at the same coordinates are identical.

Player modifications (placed items, killed creatures, altered terrain) are stored as a diff against the generated base. Regenerating the chunk and applying the diff reproduces the exact modified state.

---

## Key Gotchas

- **The drainage network is the skeleton.** If the landscape looks random, the noise function isn't producing clear enough ridge-channel structure. Increase channel depth or decrease detail noise amplitude until the channels are visually obvious.

- **Channels run downhill.** The anisotropy of the noise must align with the regional slope direction. If channels run perpendicular to the slope, the coordinate system is rotated wrong.

- **Lowland channels are subtle.** On flat terrain, the ridge-channel relief is only a few centimeters — barely visible in elevation, but decisive for saturation and drainage. The visual difference between a ridge tile (moist grass with canopy) and a channel tile (saturated mud, no canopy) is large even though the elevation difference is tiny.

- **This planet is WET.** Even "dry" tiles on this planet have saturation 0.3-0.4. True dry ground (saturation < 0.2) exists only on upper slopes and summits. If the generator is producing large areas of dry terrain at low elevation, the water table baseline is wrong.

- **Ground cover is nearly universal.** Photosynthetic mat covers almost every non-submerged surface. "Barren" tiles (no biological coverage at all) are rare — maybe 3-5% of land, limited to fresh lava, bare cliff faces, and the highest peaks. If the generator produces large barren areas, the ground cover threshold is too restrictive.

- **Forest grows on ridges, not channels.** This is counterintuitive if you think "wet = more plants." Forest needs rootable substrate that isn't permanently waterlogged. Saturated mud is too unstable for deep roots. The best forest grows on the well-drained ridges between channels — moist but not saturated. Swamp forest (sparse canopy on saturated ground) exists but is less dense than ridge forest.

- **The planetary flora density is a spatial average.** A planetary cell with floraDensity 0.5 doesn't mean "50% of tiles have forest." It means the AREA-WEIGHTED average of canopy density across all tiles in the chunk is approximately 0.5. This emerges from the balance of channel area (no canopy) vs ridge area (dense canopy) at the given precipitation level. If the chunk generator's emergent density doesn't match the planetary prediction, adjust the channel/ridge area ratio by tuning channel spacing.

- **Terrain types are derived, never assigned.** If you find yourself writing "place MUD tiles in this area," stop. Compute the physical state. Let the derivation function assign the terrain type. The only way to get more MUD is to make the physical conditions wetter.
