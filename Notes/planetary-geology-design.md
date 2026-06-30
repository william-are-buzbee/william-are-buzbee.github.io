# Planetary Geology Generation — Design Document

Design document for the bottom-up world generation system. The planet generates the geology, the geology generates the chemistry, the chemistry generates the biology, the biology generates what the player sees. Biomes are outputs, not inputs.

Include this alongside Ecology-Foundations.md, Underground-Chemotrophic-Ecology.md, and three-layer-color-system.md for any world generation, terrain, or biome work.

---

## The Architecture

```
Tectonic plates  →  Elevation/landmass  →  Mineral chemistry  →  Atmosphere/moisture
                                                    ↓
                                           Flora emergence rules
                                                    ↓
                                        Ground type, cover, palette
                                                    ↓
                                         Fauna carrying capacity
```

Each stage is a pure function of the stage above it. Nothing references "biome" as an input. The word "forest" is a description of the output at a tile where photosynthetic flora grew dense enough to produce canopy cover — it is never an instruction to the generator.

---

## Coordinate System

**Planetary coordinates** are absolute tile addresses on the planet surface.

- X axis: 0 to ~20,000,000 (circumference at equator). Wraps — x at max = x at 0.
- Y axis: 0 to ~10,000,000 (pole to pole). Does NOT wrap — y=0 is north pole, y=max is south pole.
- Every tile on the planet has a unique (x, y) address.
- Walking east increments x. Walking north decrements y. Standard.

**Three resolution scales:**

| Scale | Grid size | Cell width | Purpose |
|---|---|---|---|
| Planetary | 512 × 256 | ~156 km | Tectonics, mineral chemistry, atmosphere. Generated once. Permanent. |
| Regional | variable | ~1 km | River paths, coastline detail, mineral deposit boundaries. Generated per-region. Cached. |
| Tile | 2 m | 2 m | Gameplay. Generated per-chunk from regional data. Active radius around player. |

**Scale mapping:** A single planetary cell contains ~78,000 × 78,000 tiles. A regional cell contains ~500 × 500 tiles. The current 224×224 play area is roughly half a regional cell.

**Chunk system:** The tile-level world exists as chunks (512×512 tiles each, ~1 km square). Only chunks near the player are in memory. Chunks generate deterministically from planetary/regional data + seed. Visited chunks save to disk with modifications (corpses, tracks, altered terrain). Unvisited chunks don't exist yet — they generate on first approach.

---

## Stage 1: Tectonic Plates

### Generation Algorithm

1. **Seed N plate centers** on the planetary grid. N = 8–15 (configurable). Distribution is random but with a minimum spacing constraint — no two centers closer than ~40 cells apart. This prevents tiny sliver plates.

2. **Voronoi assignment.** Each planetary cell belongs to the plate whose center is nearest (Euclidean distance, wrapping on x-axis). This produces 8–15 irregular plate shapes with natural-looking boundaries.

3. **Assign plate properties** per plate:

```
plate = {
  id:           integer,
  center:       { x, y },
  type:         'continental' | 'oceanic',    // ~40% continental, ~60% oceanic
  drift:        { angle: 0-360, speed: 0-3 }, // direction and magnitude of motion
  baseRock:     { iron, copper, manganese },   // background mineral signature (0.0–1.0 each)
  thickness:    0.5–1.0,                       // crustal thickness (continental thicker)
}
```

**Type assignment:** Seed roughly 40% continental, 60% oceanic. Continentals tend toward the center of plate clusters (they're the survivors of ancient collisions). Oceanics fill the rest. For an archipelago world, make some continentals small — small continental plates produce island groups.

**Drift vectors:** Random angle + random speed. Speed range 0 (stationary) to 3 (fast). The relative motion between adjacent plates is what matters — absolute drift is cosmetic.

**Base rock chemistry:** Continental plates get higher background iron and mixed minerals (granitic crust weathers to clay-rich, iron-bearing soil). Oceanic plates get higher baseline manganese (ocean floor sediments concentrate manganese). Copper is rare in base rock — it concentrates at specific geological features.

4. **Classify boundaries.** For each pair of adjacent plates (cells whose Voronoi neighbors differ), compute the boundary character from relative drift:

```
// Boundary normal points from plate A toward plate B
normalAngle = atan2(B.center.y - A.center.y, B.center.x - A.center.x)

// Relative motion along the normal
convergence = A.drift projected onto normal - B.drift projected onto normal
// positive = plates moving toward each other (convergent)
// negative = plates moving apart (divergent)
// near zero = sliding past (transform)

// Lateral motion perpendicular to normal
shear = lateral component of relative drift
```

Classify each boundary cell:

| Convergence | Plate A type | Plate B type | Boundary class |
|---|---|---|---|
| Strong positive | oceanic | oceanic | **subduction zone** — volcanic island arc + deep trench |
| Strong positive | oceanic | continental | **continental subduction** — coastal mountain range + volcanoes |
| Strong positive | continental | continental | **collision zone** — mountain range, no volcanoes, thickened crust |
| Negative | oceanic | oceanic | **spreading ridge** — new basaltic crust, rift, shallow volcanic |
| Negative | continental | continental | **continental rift** — thinning crust, rift valley, future ocean |
| Near zero | any | any | **transform fault** — seismic, no major elevation change |

5. **Place volcanic hotspots.** In addition to boundary volcanism, place 3–8 random hotspot locations on the planetary grid. These represent mantle plumes — deep volcanic sources independent of plate boundaries. Each hotspot produces a local elevation spike and concentrated mineral output. On oceanic plates, hotspots create volcanic island chains (the plate drifts over the stationary hotspot, producing a trail of islands).

### Data Output

Per planetary cell:

```
cell = {
  plateId:        integer,
  plateType:      'continental' | 'oceanic',
  boundaryType:   null | 'subduction' | 'collision' | 'spreading' | 'rift' | 'transform',
  boundaryStrength: 0.0–1.0,  // how close to boundary center, how strong the convergence
  hotspot:        0.0–1.0,    // proximity/intensity of nearest volcanic hotspot
  volcanism:      0.0–1.0,    // composite volcanic activity (boundary + hotspot)
}
```

---

## Stage 2: Elevation Model

Elevation at each planetary cell is computed from plate properties and boundary interactions. No separate elevation map is authored — it derives from the tectonics.

### Computation

```
baseElevation =
  if continental: +0.15 to +0.25 (above sea level by default)
  if oceanic:     -0.30 to -0.20 (below sea level by default)

boundaryModifier =
  subduction:     trench at boundary center (-0.3), mountain arc offset inland (+0.4 to +0.6)
  collision:      mountain range at boundary (+0.4 to +0.8, highest of all)
  spreading:      shallow ridge at center (+0.05), slight depression on flanks
  rift:           valley at center (-0.15), raised shoulders (+0.05)
  transform:      minimal elevation change, slight local depression

hotspotModifier = +0.2 to +0.5 at hotspot center, falling off with distance

noise = fractal Perlin noise at planetary scale, amplitude ±0.08
        (natural variation — gentle hills, shallow basins)

elevation = baseElevation + boundaryModifier + hotspotModifier + noise
```

**Sea level = 0.0.** Cells above 0 are land. Cells below 0 are ocean.

**Coastline character:** The transition from land to ocean isn't a single threshold line — it's a gradient. Cells near 0 produce beaches, tidal flats, and shallow water. Cells well above 0 are firmly land. Cells well below are deep ocean. This gradient drives moisture, coastal biome identity, and aquatic habitat availability.

### Derived Properties

From elevation, compute:

```
cell.elevation      = raw value (-0.5 to +1.0)
cell.isLand         = elevation > 0.0
cell.isShallowWater = elevation > -0.08 && elevation <= 0.0
cell.isDeepWater    = elevation <= -0.08
cell.isMountain     = elevation > 0.45
cell.isFrozen       = elevation > 0.65   // high enough for ice — rare specialist niche
```

---

## Stage 3: Mineral Chemistry

The chemistry layer is the heart of the system. Everything visible to the player — tree trunk color, ground tint, chemotrophic zone identity, biome character — traces back to mineral concentrations at each cell.

### Mineral Channels

Each cell carries concentrations for three mineral channels (matching the three-layer color system):

```
cell.minerals = {
  iron:      0.0–1.0,   // iron oxides, rust-red, warm
  copper:    0.0–1.0,   // copper compounds, verdigris-green, cool
  manganese: 0.0–1.0,   // manganese oxides, purple-dark
}

cell.mineralTotal = iron + copper + manganese  // total mineral availability
cell.isDepleted   = mineralTotal < 0.15        // mineral desert
```

### Sources

**1. Plate base chemistry** — background mineral signature from the plate's rock type. Low, diffuse, everywhere on the plate.

```
iron      += plate.baseRock.iron      × 0.3
copper    += plate.baseRock.copper    × 0.3
manganese += plate.baseRock.manganese × 0.3
```

**2. Volcanic concentration** — volcanism brings up specific minerals from depth. Concentrated at boundaries and hotspots. The mineral *type* depends on the geological context:

```
if subduction zone:
  iron      += volcanism × 0.6    // basaltic arc volcanism is iron-rich
  manganese += volcanism × 0.3    // manganese concentrates in volcanic sediments
  copper    += volcanism × 0.4    // hydrothermal fluids at subduction zones carry copper

if spreading ridge:
  iron      += volcanism × 0.7    // new basaltic crust is iron-rich
  manganese += volcanism × 0.2
  copper    += volcanism × 0.5    // black smoker hydrothermal copper deposits

if hotspot:
  iron      += volcanism × 0.5
  manganese += volcanism × 0.4    // hotspot lavas concentrate manganese
  copper    += volcanism × 0.2
```

**3. Erosion transport** — minerals wash downhill. For each cell with elevated mineral concentrations, distribute a fraction of its minerals to lower-elevation neighbors. Iterate a few times to simulate rivers carrying dissolved minerals to the coast. This is what produces copper-rich mud flats, iron-stained river deltas, and manganese deposits in ocean basins.

```
for each iteration (3–5 passes):
  for each cell:
    find lowest-elevation neighbor
    transfer 15–25% of minerals to that neighbor
    reduce own minerals by same amount
```

This is simplified erosion — no actual river pathing needed at the planetary scale. The effect is that minerals concentrate at low-elevation areas (coastlines, basins, river mouths) and thin out at high elevations (mountain peaks). Mineral-rich volcanic slopes feed mineral-rich coastal flats.

**4. Marine sedimentation** — ocean floor cells accumulate manganese from dissolved minerals in seawater (this is how real manganese nodules form). Add a small manganese increment to all deep ocean cells. These become relevant when ocean floor gets uplifted by tectonic activity — ancient ocean sediments exposed on land are manganese-rich.

### Chemistry Output

Per cell:
```
cell.minerals     = { iron: 0.0-1.0, copper: 0.0-1.0, manganese: 0.0-1.0 }
cell.mineralTotal = sum
cell.isDepleted   = mineralTotal < 0.15
cell.dominant     = whichever channel is highest (for quick lookups)
```

---

## Stage 4: Atmosphere

Simplified atmospheric model. The planet has mild temperatures everywhere (ecology doc: ±15-20°C range). Temperature is a secondary differentiator. Moisture is the primary atmospheric biome driver.

### Moisture Model

```
baseMoisture = distance from nearest ocean cell, inverted
               (coast = 1.0, far inland = 0.3)
               On an archipelago, almost nowhere is far from coast — moisture is high everywhere.

windEffect:
  Prevailing winds blow from west to east in mid-latitudes (Coriolis effect).
  Compute wind direction from latitude bands:
    0-30° from equator:  trade winds (east to west)
    30-60°:              westerlies (west to east)
    60-90°:              polar easterlies (east to west)

rainShadow:
  Wind hits mountains. Moisture drops on windward side, dry on lee side.
  For each cell, trace upwind. If a mountain cell is upwind within ~20 cells,
  reduce moisture proportional to the mountain's elevation.

moisture = baseMoisture + coastalBonus - rainShadowPenalty
clamp 0.0 to 1.0
```

### Temperature Model

```
baseTemp = latitude-based
  equator = 1.0 (warmest)
  poles = 0.6 (cool but not frozen — mild planet)

elevationCooling = elevation × 0.3
  (higher = cooler, standard lapse rate)

temperature = baseTemp - elevationCooling
clamp 0.4 to 1.0

cell.isFreezing = temperature < 0.5  // rare, high-elevation only
```

### Wind

```
cell.prevailingWind = {
  direction: computed from latitude band (0-7, matching game's 8-direction system),
  speed: 1-3 (stronger at coast, weaker inland)
}
```

This feeds directly into the existing wind system for scent dispersal and spore transport.

### Atmosphere Output

Per cell:
```
cell.moisture    = 0.0–1.0
cell.temperature = 0.4–1.0
cell.isFreezing  = boolean
cell.wind        = { direction: 0-7, speed: 1-3 }
```

---

## Stage 5: Flora Emergence

Given the physical conditions at each cell, determine what grows. This is NOT a biome lookup — it's a competition between producer lineages.

### Producer Fitness Functions

Each flora type has a fitness value at each cell based on the physical conditions:

```
photosyntheticFitness =
  light × moisture × 0.8
  (needs light AND moisture — multiplicative, not additive)
  (light = 1.0 on land surface, 0.0 underground, reduced by canopy shade)
  (the 0.8 cap means photosynthetic flora never reaches maximum productivity
   on this dim-star planet — it's always slightly energy-limited)

chemotrophicFitness =
  mineralTotal × moisture × 1.2
  (needs minerals AND moisture — multiplicative)
  (the 1.2 means in mineral-rich zones, chemotrophic flora can outproduce
   photosynthetic — this is what makes the underground richer than the surface)

mixotrophicFitness =
  min(light, mineralTotal) × moisture × 0.9
  (needs BOTH light and minerals — limited by whichever is lower)
  (the 0.9 means it never beats a specialist in ideal conditions,
   but it survives where neither specialist thrives)
```

### Flora Assignment

The dominant flora at each cell is whoever has the highest fitness:

```
if max fitness < 0.1:
  flora = 'barren'              // nothing grows — depleted desert or frozen
else if photosyntheticFitness is highest:
  flora = 'photosynthetic'      // forest, grassland, mat
else if chemotrophicFitness is highest:
  flora = 'chemotrophic'        // fungal zone, colony field
else:
  flora = 'mixotrophic'         // transition zone, dual-energy organisms

floraDensity = max fitness value   // how much grows (0.1 = sparse, 1.0 = lush)
```

### Flora → Terrain Mapping

Flora type and density determine the game-level terrain:

```
if flora == 'barren':
  ground = DIRT or ROCK (based on elevation)
  cover = none
  palette driven by mineral chemistry (depleted = 'desert', iron = 'dirt', etc.)

if flora == 'photosynthetic':
  if floraDensity > 0.6:
    ground = GRASS, cover = FOREST at (floraDensity - 0.4) probability
  if floraDensity 0.3–0.6:
    ground = GRASS, cover = none or sparse FOREST
  if floraDensity < 0.3:
    ground = DIRT with sparse GRASS patches

if flora == 'chemotrophic':
  if floraDensity > 0.6:
    ground = FUNGAL_GRASS, cover = MUSHFOREST at (floraDensity - 0.4) probability
  if floraDensity 0.3–0.6:
    ground = FUNGAL_GRASS, cover = none or sparse MUSHFOREST
  if floraDensity < 0.3:
    ground = DIRT or ROCK with sparse fungal patches

if flora == 'mixotrophic':
  ground = GRASS or FUNGAL_GRASS (blend based on relative fitness)
  cover = mixed — some FOREST, some MUSHFOREST, lower density than specialist zones
```

### Water Tiles

```
if cell.isDeepWater:  ground = DEEP_WATER
if cell.isShallowWater: ground = WATER
if cell.isLand && elevation < 0.03 && moisture > 0.7: ground = MUD (coastal wetland)
if cell.isLand && elevation < 0.02: ground = BEACH (tidal zone)
```

---

## Stage 6: Chunk Generation Interface

When the player approaches an unvisited area, the chunk generator creates the tile-level terrain.

### Input
Chunk coordinates (which 512×512 tile block to generate).

### Process

1. **Map chunk to planetary cells.** A 512×512 chunk spans a fraction of one planetary cell. Look up the planetary cell and its neighbors. Interpolate all planetary properties (elevation, minerals, moisture, temperature, wind, flora type, flora density) across the chunk using bilinear interpolation. This produces smooth gradients at tile scale.

2. **Add regional detail.** Apply fractal noise at regional scale (~1 km features) to elevation, moisture, and mineral concentrations. This creates local variation — a hill within a plain, a wet depression within dry grassland, a copper-rich pocket within an iron-rich zone. The noise is seeded deterministically from planetary coordinates.

3. **Compute per-tile terrain.** For each tile in the chunk, use the interpolated + noise-modified values to determine ground type, cover type, and palette. Apply the flora emergence rules at tile resolution. Place water bodies based on elevation. Add cover based on flora density.

4. **Place features.** Rivers (following elevation gradients), mineral seeps (at high mineral + high moisture + geological activity), hot springs (at volcanic activity + water), and other landmark features. These are deterministic from the planetary data.

5. **Spawn fauna.** Compute carrying capacity from flora density. Spawn creatures from both clades based on the energy budget. Predator density tracks herbivore density tracks flora density tracks mineral chemistry. All the way down to the rocks.

### Output
A 512×512 tile grid with ground types, cover types, creature spawns, and feature placements. Indistinguishable from a hand-authored map — but completely derived from geology.

---

## Data Structures

### PlanetaryGrid (generated once, stored permanently)

```
class PlanetaryGrid {
  width: 512
  height: 256
  seed: integer
  
  plates: [
    { id, center, type, drift, baseRock, thickness }
  ]
  
  hotspots: [
    { x, y, intensity }
  ]
  
  cells: 2D array of {
    plateId,
    elevation,
    minerals: { iron, copper, manganese },
    mineralTotal,
    isDepleted,
    moisture,
    temperature,
    isFreezing,
    wind: { direction, speed },
    volcanism,
    floraType: 'photosynthetic' | 'chemotrophic' | 'mixotrophic' | 'barren',
    floraDensity: 0.0–1.0,
    isLand,
    isShallowWater,
    isDeepWater,
  }
}
```

Total data: 512 × 256 × ~64 bytes per cell = ~8 MB. Trivial.

### ChunkCache (per-session, saved to disk for visited chunks)

```
class ChunkCache {
  // Key: "chunkX,chunkY" string
  // Value: { tiles: 512×512 grid, creatures: [], features: [], modified: boolean }
  
  activeChunks: Map     // currently in memory (near player)
  savedChunks: IndexedDB  // visited, saved to disk
  
  getOrGenerate(chunkX, chunkY, planetaryGrid) → chunk
  save(chunkX, chunkY) → disk
  unload(chunkX, chunkY) → remove from memory
}
```

---

## What This Replaces

| Current system | Replaced by | Status |
|---|---|---|
| BIOME_TARGET (16×16 hand-placed biome grid) | PlanetaryGrid (512×256 geology-derived) | Fully replaced |
| BIOME_PROFILES (per-biome ground/cover weights) | Flora emergence rules (physics-driven) | Fully replaced |
| BIOME blend system | Bilinear interpolation of planetary properties | Fully replaced |
| Surface-gen.js terrain placement | Chunk generator reading planetary data | Fully replaced |
| Hardcoded spawn densities | Energy-budget carrying capacity | Future (Stage 6) |

**What is NOT replaced:**
- Terrain types (T.GRASS, T.FOREST, etc.) — these stay, they're the output vocabulary
- TERRAIN_INFO — properties per terrain type stay
- The palette system (BIOME object in ecology-data.js) — palettes stay, just selected by chemistry instead of biome name
- The sprite system — sprites stay
- The rendering pipeline — unchanged
- All gameplay systems — unchanged

---

## Implementation Order

### Phase 1 — Standalone planet viewer
Build the PlanetaryGrid generator as an independent module. Output to a canvas visualization (not in-game). Validate that plates, boundaries, elevation, coastlines, and mineral chemistry look right. Iterate on parameters until the planet looks like a real planet. This is design work, not integration.

**Deliverable:** A standalone HTML page that generates and displays a planet from a seed. Show elevation map, mineral chemistry map (iron/copper/manganese as RGB channels), moisture map, and flora type map as selectable overlays.

### Phase 2 — Flora emergence validation
Add the flora emergence rules to the planet viewer. Verify that biomes emerge in plausible locations: forests on wet, mineral-moderate land; chemotrophic zones on mineral-rich, moderate-moisture land; deserts on depleted dry land; mixed zones at transitions. Tune fitness functions until the planet looks ecologically correct.

**Deliverable:** Flora overlay on the planet viewer. Color-coded: green=photosynthetic, purple=chemotrophic, red-purple=mixotrophic, gray=barren.

### Phase 3 — Chunk generator prototype
Build the chunk generator that reads the planetary grid and produces tile-level terrain for a 512×512 area. Test by generating a single chunk and comparing it to the current hand-authored world. Verify that terrain variety, cover density, and palette selection match or exceed the current system.

**Deliverable:** A generated chunk that could replace the current starting area. Side-by-side comparison.

### Phase 4 — Integration
Replace the current world-gen pipeline with the planetary system. Hook up chunk loading/unloading. Maintain save compatibility (old saves specify a starting chunk; new saves include the planetary seed). The current 224×224 world becomes one chunk within the planetary grid.

**Deliverable:** The game runs on the planetary system. Walking in any direction generates new terrain. Walking far enough east returns you to where you started.

### Phase 5 — Energy-budget fauna
Compute carrying capacity from flora density. Replace spawn tables with population dynamics. Both clades fill niches based on available energy. This is the long-term todo item, now with a real energy base to compute from.

---

## Notes

**Determinism is sacred.** The same seed + the same coordinates must produce the same terrain, always. Every random choice in generation must use a seedable RNG derived from planetary coordinates. Two players with the same world seed see the same planet. A player who visits a location, leaves, and returns finds the same terrain (minus their modifications).

**The planetary grid is cheap.** 512×256 cells, ~64 bytes each, ~8 MB total. Generate in under a second. Store permanently. Query instantly. The expensive work is chunk generation, and that only happens for the ~4-9 chunks near the player.

**The archipelago is emergent.** We don't tell the generator to make an archipelago. We set the ratio of continental-to-oceanic plates, the plate sizes, and the sea level threshold. Small continental plates + moderate sea level = islands. Large continental plates + low sea level = continents. The current ecology doc describes an archipelago — so we tune toward small continental fragments and moderate sea level.

**Ice is rare and emergent.** The ecology doc says ice is alien on this planet, a rare specialist niche at high elevations. The temperature model produces this naturally: only cells above elevation 0.65 (tall mountain peaks at convergent boundaries) drop below freezing. This is a tiny fraction of the planet's surface. We don't place ice — it occurs where physics says it should.

**Regional mineral zones match the ecology doc.** The doc describes mineral zones at multiple scales: large basaltic regions (200-500+ tiles), mineral deposits (40-150 tiles), hydrothermal patches (15-40 tiles). The planetary-to-regional-to-tile resolution cascade produces exactly this: planetary cells give the large-scale chemistry, regional noise creates deposit-scale variation, and tile-level noise creates patch-scale detail.

**Trunk color variation for free.** The ecology doc describes tree trunks varying by local mineral chemistry (iron-red, copper-green, manganese-dark). With this system, trunk color is a direct lookup: read the mineral chemistry at the tree's tile, select the corresponding structural_wood color from the three-layer material table. No special system needed — it falls out of the architecture.
