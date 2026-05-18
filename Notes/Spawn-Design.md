# Spawn System Design

Reference document for implementing the creature spawn overhaul. Grounded in the current codebase as of this writing. Include this file alongside the relevant source files when starting implementation work.

---

## What Exists Now

### Current Spawn Pipeline

`initWorld()` in `world-logic.js` calls `spawnMonstersInWorld()` after terrain generation, structure placement, and town placement. Spawning runs once at world creation. There is no respawn system.

Two independent spawn paths exist today, but they're tangled together in one function:

**Tile-density spawning** (`spawnMonstersInWorld`): Iterates every surface tile. Each ground/cover type has a hardcoded spawn probability (e.g. `T.FOREST: 0.04`, `T.GRASS: 0.008`). If the roll passes, it filters `MON` entries whose `biomes` array includes that tile type. One is picked at random. Underground works similarly with `underDensity`.

**Hardcoded regional spawning** (also in `spawnMonstersInWorld` and `placeStructures`): Water cave entrances manually spawn eels and crabs in a 7×7 area. Rock golems are restricted to `NE_QUADRANT` via `spawnRules.restrictedRegion`. The Dread King is manually placed next to the throne. Atmosphere checks force high-elevation dry zones to only allow rock golems.

### Current Monster Definition Format

Each `MON` entry is a flat array. The spawn-relevant fields are:

| Index | Field | Example (wolf) |
|-------|-------|----------------|
| 12 | `biomes` — tile types this creature spawns ON | `[T.FOREST]` |
| 13 | `layer` — which layer constant | `LAYER_SURFACE` |
| 14 | `territory` — tile types this creature can MOVE on | `[T.FOREST, T.GRASS, T.MUD, ...]` |

`biomes` is the spawn filter — it matches against ground or cover tile types, not biome names. A wolf spawns on `T.FOREST` (the cover type), not in the "forest biome." This means wolves can only spawn on tiles that have forest cover, even if they're in the middle of a forest biome on a grass tile without a tree.

### What's Wrong

1. **Tile type ≠ biome.** Creatures are tied to terrain tile IDs, not biome identity. A wolf needs `T.FOREST` cover, but a forest biome cell at low density might be mostly bare grass — no wolves spawn there despite it being "forest." Conversely, a sparse tree on a plains tile technically has `T.FOREST` cover and could spawn a wolf.

2. **No spatial grouping.** Every creature spawns individually. Wolves appear scattered across every forest tile independently. There's no concept of "a wolf pack lives in this area" or "goblins cluster around their village."

3. **Structure creatures are hacked in.** The Dread King, water cave eels, and castle-area spawns are all manually placed in `placeStructures` or special-cased in the spawn loop. There's no general system for "this structure has inhabitants."

4. **Density is per-tile-type, not per-region.** You can't say "the deep forest is dangerous but the forest edge is safe." Every forest tile worldwide has the same 0.04 chance.

5. **`populateMonsters` in gen-utils.js is dead code for surface spawning.** Surface spawning goes through `spawnMonstersInWorld` in `world-logic.js`, not `populateMonsters`. The gen-utils version might still be called for underground layers in some paths but the surface path ignores it entirely.

---

## The New System

Two clearly separated spawn paths. Wild spawns and structure spawns have different triggers, different data, and run at different points in the pipeline.

### Path 1: Wild Spawns (Habitat Tables)

For creatures that exist because of the environment — wolves in forests, hares on plains, scorpions in desert, crabs near water.

#### Habitat Table Format

Each creature defines what it *needs* to spawn. This replaces the current `biomes` array (index 12) with a richer filter:

```js
habitat: {
  biomes: ['forest'],              // biome NAME, not tile type
  ground: [T.GRASS, T.DIRT],       // allowed ground types (optional — null = any)
  cover:  [T.FOREST, null],        // allowed cover types (null = no cover is OK)
  nearWater: false,                // must be within N tiles of water? (for crabs, eels)
  nearWaterDist: 0,                // how close
  avoidStructures: 8,              // minimum tile distance from any placed structure
  minDensity: 0.0,                 // minimum target map density at this position
  maxDensity: 1.0,                 // maximum target map density
}
```

Evaluation: a tile is valid for a creature if ALL conditions pass. The biome check samples the target map to find which biome owns that tile (using the same biome ownership logic from surface-gen). Ground/cover checks filter against the actual terrain. `avoidStructures` prevents wild wolves from spawning inside a goblin village.

#### Why Biome Names, Not Tile Types

The biome target map is the source of truth for "what region is this." A tile at position (50, 30) might be `T.GRASS` ground with no cover, but the target map says it's in a forest cell at density 0.3. That's a sparse forest clearing — wolves should be able to spawn there. The current system can't do this because it only sees `T.GRASS`.

Sampling the biome is cheap: `Math.floor(x / CELL_TILE_W)` and `Math.floor(y / CELL_TILE_H)` gives you the target map cell. Read `.biome` from it. Done. No noise sampling needed — this is the coarse-grained "what region am I in" check, not the fine-grained "what ground type am I" check.

For transition zones where ownership is ambiguous, use the dominant biome (highest weight from `sampleBiomeWeights`). A tile in a forest/plains blend zone that's 60% forest counts as forest for spawn purposes.

#### Danger Layer

A `danger` value (0.0–1.0) on each biome target map cell. This is the fourth parameter alongside biome, density, and blend:

```js
B('forest', 0.8, 0.7, 0.6)   // dense forest, soft edges, moderately dangerous
B('plains', 0.4, 0.5, 0.1)   // sparse plains, low danger (near town)
B('ocean',  1.0, 0.2, 0.0)   // ocean, nothing spawns
```

The `B()` helper and editor grid get a fourth field. The spawn loop reads the danger value at each tile's target map position and uses it as a density multiplier:

```
effective_spawn_chance = base_chance_for_creature * danger * SPAWN_DENSITY_MULT
```

A creature's base spawn chance comes from its habitat definition (replaces the per-tile-type density table). Danger scales it regionally. Forest near town at danger 0.1 barely spawns anything. Deep forest at danger 0.8 is packed.

Danger 0.0 = nothing spawns here (ocean, town areas). Danger 1.0 = maximum spawn density.

#### Encounter Templates

Instead of spawning one creature at a time, spawn *groups* with spatial structure:

```js
encounters: {
  wolf: [
    { template: 'pack',        weight: 0.35, count: [3, 6], spacing: [2, 4], requires: { personality: 'leader', count: 1 } },
    { template: 'pair',        weight: 0.25, count: 2,      spacing: [1, 2], requires: { personality: 'pair_bond' } },
    { template: 'lone_hunter', weight: 0.25, count: 1 },
    { template: 'wary_solo',   weight: 0.15, count: 1,      requires: { personality: 'wary' } },
  ],
  hare: [
    { template: 'scatter',     weight: 1.0,  count: [2, 5], spacing: [3, 8] },
  ],
  mushroom: [
    { template: 'cluster',     weight: 0.7,  count: [5, 12], spacing: [1, 2] },
    { template: 'scatter',     weight: 0.3,  count: [2, 4],  spacing: [2, 5] },
  ],
  treant: [
    { template: 'grove',       weight: 0.6,  count: [2, 3],  spacing: [5, 10] },
    { template: 'solitary',    weight: 0.4,  count: 1 },
  ],
  rock_golem: [
    { template: 'solitary',    weight: 0.7,  count: 1 },
    { template: 'pair',        weight: 0.3,  count: 2,      spacing: [3, 6] },
  ],
  scorpion: [
    { template: 'solitary',    weight: 0.6,  count: 1 },
    { template: 'nest',        weight: 0.4,  count: [2, 4],  spacing: [1, 3] },
  ],
}
```

The spawn loop picks a valid tile, picks a creature whose habitat matches, picks an encounter template by weight, then places the group:
1. Place the first creature at the seed tile.
2. For each additional creature in the group, find a valid tile within `spacing` range of the seed. Valid = matches habitat, walkable, not already occupied.
3. Apply personality overrides from `requires` (e.g. one wolf in a pack gets `leader`).
4. Set all group members' `homeX/homeY` to the seed tile so they stay in the area.

If a group can't fully place (not enough valid tiles nearby), place as many as fit. A pack of 5 that can only fit 3 becomes a small pack, not a failed spawn.

#### Wild Spawn Loop (Pseudocode)

```
for each target map cell (cx, cy):
    danger = cell.danger
    if danger == 0: skip

    // Calculate how many encounter groups this cell should have
    groupBudget = floor(danger * MAX_GROUPS_PER_CELL)

    for i in 0..groupBudget:
        // Pick a random tile within this cell's area
        tile = randomTileInCell(cx, cy)
        if not walkable or has structure nearby: continue

        // Find creatures whose habitat matches this tile
        candidates = allCreatures.filter(c => habitatMatches(c, tile))
        if empty: continue

        // Pick creature, pick encounter template, place group
        creature = weightedPick(candidates)  // weight by base_chance
        template = weightedPick(encounters[creature])
        placeEncounterGroup(creature, template, tile)
```

This replaces the current per-tile iteration (`for y..for x..if rand() < density`). Instead of checking every tile, it works at the cell level and places a budget of groups per cell. Much faster for large maps and easier to reason about density.

### Path 2: Structure Spawns

For creatures that exist because a structure placed them — goblins in a village, guards at a castle, the Dread King on his throne.

#### Structure Spawn Definitions

The structure registry already defines footprints, tiles, and placement rules. Add an `inhabitants` field:

```js
{
  key: 'goblin_village',
  footprint: [7, 7],
  // ... existing fields ...
  inhabitants: [
    { creature: 'goblin', count: [4, 8], placement: 'interior', personality: null },
    { creature: 'goblin', count: [1, 1], placement: 'interior', personality: 'leader' },
    { creature: 'goblin', count: [1, 3], placement: 'perimeter', personality: 'skulker' },
  ],
}
```

Placement modes:
- `interior` — random walkable tile inside the footprint
- `perimeter` — walkable tile within 1–3 tiles outside the footprint edge
- `patrol` — placed on a walkable tile along the footprint border (future: actual patrol routes)
- `fixed` — specific offset from the structure origin (for bosses, shopkeepers)

Structure spawns run during `placeStructures()`, immediately after a structure is placed. The structure is the authority — it decides what lives there, how many, and where. No habitat check needed. The goblin doesn't need to ask "is this forest?" — it lives in the village.

#### Interaction: Wild Spawns Near Structures

Wild spawns must skip tiles near placed structures. The `avoidStructures` field in the habitat definition controls this. Default should be 6–8 tiles. This prevents random wolves from appearing in the middle of a goblin village. The structure already placed its own inhabitants — wild spawns respect that boundary.

`registerStructurePosition` already exists and tracks placed structures. The wild spawn loop checks distance to all registered positions.

#### Current Hardcoded Spawns to Migrate

These currently live in `placeStructures` and `spawnMonstersInWorld` as special cases. They should move to structure spawn definitions:

| Current code | Migration |
|---|---|
| Dread King next to throne | `inhabitants` on the Blackspire underground structure, `placement: 'fixed'`, offset (0, 1) |
| Eels/crabs near water cave entrances | `inhabitants` on the water cave entrance structure, `placement: 'perimeter'` with radius 3, filtered to water/beach tiles |
| Castle area monster spawns in `placeStructures` | `inhabitants` on Sunward Hold / Blackspire structures |

---

## Pipeline Order

```
initWorld(seed)
  ├── generateLayer(LAYER_SURFACE)     — terrain, biomes, ground, cover
  ├── generateLayer(LAYER_UNDER)       — underground terrain
  ├── placeStartingTown()              — town tiles + NPCs
  ├── placeStructures()                — landmarks, castles, caves, signs
  │     └── for each structure:
  │           ├── place tiles
  │           ├── registerStructurePosition()
  │           └── spawnStructureInhabitants()    ← NEW (path 2)
  ├── runStructurePlacement()          — structure registry pass
  │     └── for each placed structure:
  │           └── spawnStructureInhabitants()    ← NEW (path 2)
  ├── activateLayer()
  └── spawnWildCreatures()             ← REPLACES spawnMonstersInWorld() (path 1)
        ├── for each target map cell:
        │     ├── read danger value
        │     ├── calculate group budget
        │     └── for each group:
        │           ├── pick tile, check habitat, check structure distance
        │           ├── pick creature + encounter template
        │           └── place group
        └── wolf pair bonding pass (unchanged)
```

Key ordering: structure spawns happen during structure placement (before wild spawns). Wild spawns happen last and respect structure boundaries. This prevents overlap.

---

## Migration Strategy

### Phase 1: Habitat Tables (Biggest Payoff)

Add a `habitat` object to each `MON` entry alongside the existing `biomes` array. Rewrite `spawnMonstersInWorld` to use habitat checks instead of tile-type matching. Keep the current per-tile iteration for now — just swap the filter logic. Remove the atmosphere-based rock golem hack (habitat table handles it). Remove the `MUSHFOREST` special case (habitat table handles it).

Files: `monsters.js`, `world-logic.js`, `gen-utils.js`, `constants.js`

### Phase 2: Danger Layer

Add `danger` as the fourth parameter on `BIOME_TARGET`. Update the `B()` helper. Update the biome map editor. Replace per-tile-type density tables with per-creature base chances modulated by danger.

Files: `constants.js`, `world-logic.js`, biome editor HTML

### Phase 3: Structure Spawns

Add `inhabitants` to structure registry entries. Write `spawnStructureInhabitants()`. Migrate the Dread King, water cave eels/crabs, and castle guards out of their current hardcoded locations. Add `avoidStructures` to the wild spawn loop.

Files: `world-logic.js`, `structures.js`, `monsters.js`

### Phase 4: Encounter Templates

Add the encounter template registry. Rewrite the wild spawn loop from per-tile iteration to per-cell group budget. Implement group placement with spacing. Migrate wolf pair bonding into the pack template's `requires` field.

Files: `world-logic.js`, `monsters.js` (new encounter data)

### What NOT to Change

- Monster stat blocks (STR, CON, DEX, etc.)
- Combat system
- AI behavior and personality system
- Movement / territory restrictions (these stay on the monster, not the spawn system)
- Rendering, FOV, save system
- The `populateMonsters` function in gen-utils.js (it's used for underground layers — leave it until underground gets the same treatment)
- Biome generation, blend system, cover placement
