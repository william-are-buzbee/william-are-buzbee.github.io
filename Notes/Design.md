  -Design Decisions-
  
This doc is full of design decisions. One liners that describe how the game is supposed to run. So, if it says here that underground layers are the same size as above ground layers, that is intended and should exist in the game. If it doesn't, it belongs on the todo list. 

  -Architecture-
  
All layer transitions (stairs, towns, shops) go through teleportPlayer. No direct player.layer = X assignments.
activateLayer() must be called on every layer transition.
worldDims() returns [w, h] as an array, not {w, h}.
getFeature() returns by reference — mutations persist.
World-gen is split into world-gen.js (coordination), surface-gen.js, underground-gen.js, town-gen.js.

  -World Size-
  
Underground grids match surface dimensions (both 112x112). W_UNDER = W_SURF.
Everything should be resolution-independent. No hardcoded 112 or 75 anywhere outside constants.js.
Changing W_SURF/H_SURF in constants.js should scale the entire game. All positions are proportional or derived from these constants.

  -Terrain System-
  
Terrain is split into ground + cover. Every tile has a ground type and an optional cover type.
Ground: the floor (plains, desert, stone, cave, water, etc). Every tile has one.
Cover: what sits on the ground (trees, mushrooms, stairs, buildings, barrels, etc). Can be null.
Walkability: cover overrides ground. Non-walkable cover (barrel, wall) blocks movement regardless of ground.
Cover bonus for combat comes from cover if present, otherwise ground.
Trees are a single cover type — no scattered trees variant. Forest density is a probability gradient driven by moisture, not a separate tile.

  -Biome Generation-
  
Surface biomes driven by atmosphere fields (moisture, elevation, fungal) not hardcoded coordinate zones.
A 16x16 biome target map in constants.js guides the atmosphere fields. Editing the target map changes world geography. No noise parameter tuning needed.
Target map blends with noise (~60% target bias, ~40% noise) for natural edges.
Tree cover probability scales with moisture: 0% at low, ~5% medium-low, ~20-30% medium, ~60% medium-high, ~90%+ high.
Mushroom zone driven by a separate fungal field, not moisture/elevation.

  -Underground-
  
Multiple entrances per underground layer supported via pocket system.
Each staircase registers a boundary circle (pocket) on the underground layer.
Playable area = union of all pocket circles. Tile is playable if inside ANY pocket.
Walkers spawn from each entrance and carve within their local pocket.
Connectivity paths carved between pockets.
Staircase at surface (x, y) → underground STAIRS_UP at same (x, y). Same coordinates, straight down.
playableRadius values scaled for 112x112: early layers 20-28, mid layers 42-54, deep constrict to floor of 14.
Underground biome leakage samples the surface atmosphere fields at each coordinate.

  -Staircase Transitions-
  
Every staircase tile (up and down, every layer) has a feature via setFeature with {type:'stairs', dir, targetLayer, targetX, targetY}.
Surface staircase features include sourceX/sourceY.
generateLayer back-fills targetX/targetY on the parent staircase after child layer generates.
useStairs calls teleportPlayer(f.targetLayer, f.targetX, f.targetY).

  -Town Transitions-
  
enterTown writes the player's current surface position into the town gate feature at entry time. Not stored on player.returnX/Y (that gets overwritten by shop entry).
exitTown reads f.returnLayer/f.returnX/f.returnY from the gate feature.
placeGate hardcodes returnX: 0, returnY: 0 but placeStructures in world-logic.js patches all town gates with correct surface coordinates after towns are placed.
enterShopBuilding uses dims[0]/dims[1] not dims.w/dims.h.

  -Structure Placement-
  
Structures defined in a registry with: key, footprint, frequency, biome requirements, ground requirements, tiles, spawns, loot, distance constraints.
Single placement pass runs after biome generation and town placement, before monster spawning.
Structures can clear cover in their footprint.
Works for both surface and underground.

  -Day/Night Cycle-
  
Turn-based. Every player action increments state.worldTick.
Full cycle = 200 ticks. Phases: dawn, day, dusk, night.
Visual tint overlay on surface only (currently). Underground ticks but no visual effect yet.
Structured so underground visual effects can be added later.
Stealth currently dims the screen via CSS class. Night tint implementation must not conflict with it.
Future: Some way to integrate stealth display.
Future: some kind of clock, calendar or time telling tool (gold watch in minecraft??)

  -Enemy AI-
  
Hares: always flee, never aggro, even if player kills another hare next to them.
Aquatic (fish, not crabs): water-locked, can only move on water tiles, attack adjacent from water edge, give up chase if player leaves water vicinity. Crabs are excluded — free movement on land and water.
Mushrooms: four-phase behavior — passive → coalescing (slow drift toward player) → surround trigger (4+ within 2 tiles, mass aggro) → mobbing (poison touch, chase short distance then reset). Zero direct damage, touch-based poison only. Do not bypass stealth.
Wolves: Can hunt in packs or solo. Dire wolves are more likely to be solo
Most enemies have personality variants. For instance, wolves can be solo, in packs, wary (won't attack solo), etc. 

  -Combat / Movement-
  
Enemies can't stop the player from moving if they are being attacked. Restricted movement is not a normal part of combat unless a specific enemy inflicts it.  
Disengage check removed — player always moves freely.
There is some XP logic that is cobbled together, which will be made more coherent in the future. 
