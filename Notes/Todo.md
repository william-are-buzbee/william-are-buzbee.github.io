# Todo

Prompt queue and task tracker. Check things off as they're done.

## Completed
- [x] Fix staircase transitions (underground entrance matches surface exit)
- [x] Underground grids match surface size (112x112)
- [x] Fix playableRadius for larger grid
- [x] Pocket boundary system (multiple entrances per underground layer)
- [x] Day/night cycle (turn-based, visual tint, surface only)
- [x] Separate terrain into ground + cover
- [x] Atmosphere fields driving biome generation
- [x] Biome target map system
- [x] Structure placement system
- [x] Split world-gen.js into focused modules-
- [x] Remove enemy movement blocking + remove disengage check
- [x] Hare passivity fix
- [x] Water-locked aquatic AI
- [x] Mushroom swarm ambush overhaul
- [x] Remove scattered trees tile type, use regular forest cover with probability gradient
- [x] Save system (localStorage, auto-save after every action, version number in save data)
- [x] Fix surface stone/cave terrain visual (should look like rocky ground)
- [x] Re-establish biome layout functionality (can use target map to generate any biome combinations in a 16 x 16 grid with natural blending)
- [x] Make world size fully configurable (audit all hardcoded positions/distances)
- [x] Structure/landmark system using coordinates
- [x] Implement "blend" variable for each biome on the target map to allow for more control
- [x] Added minimap system (press M key)
- [x] Removed visual grain effect and grass tile added noise (was not part of the ground tile sprite)
- [x] Added beach biome (removed beach logic when next to water tile)
- [x] Update world map until it looks good
- [x] Add a corpse/item drop system (enemies drop a corpse upon death which can be looted, objects can be seen and picked up on the ground)
- [x] Update UI to have no icons and use key presses to bring up info screens
- [x] Create two alien "clades" that all alien life is related too (clade A resembles more mammalian, clade B resembles more cephalopod, but both are terrestrial)
- [x] Designed a 3d body map system as a core game mechanic that will replace stats like CON, STR, INT, etc. (instead, the body map visualizes and describes weight, muscularity, connective tissue, neural mass, armor, texture, hardness, sensory organs, neural pathways, etc and a 3d animal could be created from this description with a lot of functional detail)
- [x] Create body maps for the main ancestors of the two clades (small herbivore, large herbivore, ambush predator, meso carnivore, apex carnivore)
- [x] First-pass "Size" and "Strength" system that roughly reflects total mass & relative muscle mass)
- [x] First-pass Bleeding system (open vs closed circulatory system, bleed out, blood loss weakening, etc)
- [x] First-pass Footprint system (attacks have a size, shape and area- relates to hitting multiple zones, like an elephant stepping on a rabbit, which should obviously hit multiple body parts)
- [x] Physics based damage (weight, musculature and musclemass determine damage)
- [x] Death conditions (lethal zones, brain death, blood loss)
- [x] Species selection at chargen & parity (lets you pick and play as any species, no plot armor given to player)
- [x] UI overlays (for multi limb health pools, bleed counter, removal of "max hp" which is vestigial)
- [x] First-pass AI drive system (wandering, fleeing, hunting/foraging, sleeping, recovering bloodloss, etc)
- [x] First-pass perception/transducer system (transducers based sensing, no more abstract "perception" stat)
- [x] First-pass cognitive/ganglia/nervous system (episodic memory, pattern library, sensory integration, cognitive "workspace", planning, reflexive behavior, compression of signals, etc)
- [x] First-pass player perception/transducer visibility (make the player's visual field at parity with an equivalent animal, no free lunch or plot armor for player perception)
- [x] Second-pass over cognition/ganglia system
- [x] Second-pass over perception/transducer system (chemical transducer restructure to airborn, ground and water based vibration, plus contact vs air for chemical)
- [x] Species-confidence gated rendering (shows blobs if you can't identify a creature but know something is there)
- [x] Significant optimization improvements (indexDB, active simulation radius, spatial hash grid)
- [x] Remove telepathic knowledge of environment (granted by earlier passes of chemical sensing)
- [x] UI minimalism overhaul (fullscreen support, flexible screen size, adjustable log, HUD can be scaled with a button press, zoom function, no stretch or visual issues)
- [x] Vision cone vix (each eye has a specific cone of vision, binocular vs monocular vision, very possible for multiple unique eye placements to exist on a single creature)
- [x] First pass muscle fiber system (muscle fiber type by contraction, aerobic vs anaerobic, aerobic capacity vs glycogen capacity, demand exceeding aerobic thresholds consumes glycogen)
- [x] Third pass over cognitive system (Ganglia are physical structures that inform motor circuits, so running away is not an abstraction but a physical set of circuits connected to motor function)
- [x] Chemical sensing third pass (molecule based detection, wind direction & detection, contact vs airborn detection, air diffusion, emittance, etc)
- [x] Creature density scaled down for testing (~30-50 total, proportions preserved, original values commented out)
- [x] Speed system overhaul (fiber data on all species, player sprint/walk, mass-dependent acceleration, mass-dependent turning cost, legacy turn probability removed)
- [x] Hare freeze behavior — first pass (ganglion freeze state between alert and flee)
- [x] Cleanup batch (blood cyan not red, Alt+dir turn-in-place, Shift+V air smell, V ground smell, inventory commented out, 8-directional ground scent)
- [x] Hare freeze behavior rewrite — physical two-threshold architecture (remove _shouldBreakFreeze, replace with two-ganglion signal-vs-threshold system, decouple confidence normalization)
- [x] Ecological palette and tile texture update (red-violet grass, amber water, new dirt/sand/stone/water textures, creature tints, meso/apex profile sprites)
- [x] Ambient brightness dip rendering (subtle terrain darkening near creatures for visibility)
- [x] Canvas-rendered title screen (terrain background, keyboard menu, death screen, species selection restyle)
- [x] Detection performance optimization (BLOCKING for full density — profile the hot path, reduce spatial query radius per species, cache LOS per tile-pair, cache best transducer per channel)
- [x] Palette revert to pre-overhaul working values (terrain palettes, chargen COLOR_PALETTES, T.SAND palette mapping)
- [x] Three-layer color pipeline designed (material table, star modification transforms, chromatic adaptation, derived tile palettes — documented in three-layer-color-system.md)
- [x] Pipeline palette applied to game (11 BIOME entries in ecology-data.js updated to pipeline-derived values)
- [x] Chemotrophic sprite redesign (MUSHFOREST → colony mound, FUNGAL_GRASS → mineral crust texture)
- [x] Water tile texture redesign (added '#' pixels for amber wave crests on blue water)
- [x] Sprite variant library (GRASS V2-V4, WATER V2-V5, DEEP_WATER V2-V3 added to sprites.js)
- [x] Standalone planet generator/viewer (planet-viewer.html — plates, elevation, minerals, atmosphere, flora, globe/flat/Mollweide views, regional 1km detail zoom, tuning panel with save/load)
- [x] Weather/wind system for planet (atmospheric circulation cells, topographic deflection, trade winds/westerlies/ITCZ — full wind vector field)
- [x] Ocean current system (wind-driven surface currents, Coriolis deflection, SST advection, western boundary warm/eastern cold, upwelling)
- [x] Precipitation model (moisture advection, orographic precipitation, convergence precipitation, background convective rain, iterative solver to steady state)
- [x] Humid planet corrections (atmospheric pressure 1.2 atm, SST floor 0.50, increased evaporation, softer rain shadows, moisture diffusion scaling)
- [x] Groundwater model (coastal proximity, precipitation recharge, geothermal upwelling, elevation penalty)
- [x] Drainage accumulation (flow accumulation algorithm, log-scaled drainage bonus)
- [x] Water availability metric (precipitation × 0.7 + groundwater × 0.3 + drainage — replaces distance-from-ocean moisture)
- [x] Substrate grain size system (slope, elevation, drainage position, coastal type, volcanism → grain size 0-1)
- [x] Water table depth model (elevation, precip recharge, geothermal, drainage, coastal pull, basin check for ponding)
- [x] Saturation from water table (capillary fringe, grain size interaction)
- [x] Physical terrain derivation (substrate × saturation × flora → terrain type, groundCover determines GRASS not saturation)
- [x] Regional drainage network (Phase A — structured anisotropic noise, flow accumulation, zone classification, drainage-derived physical state at 1km resolution)
- [x] Tile detail view (Phase B — chunk generator prototype at 2m resolution, same drainage approach with tighter channel spacing)
- [x] Per-tile palette computation (computeTilePalette — material colors through three-layer pipeline, chemistry-sensitive mineral tinting, continuous variation within terrain types)
- [x] High-resolution planetary surface (configurable 1×-8× multiplier, atmospheric sim at 512×256, surface detail at full resolution, progress bar)
- [x] Planet viewer pipeline rewrite (unified typed array data structure, one deriveTerrainAndCover, one computeTilePalette, inheritance-based view hierarchy, consistent views)
- [x] Flora type palette differentiation (livingCoverColor selected by floraType — photo=crimson, chemo=mineral-tinted, mixo=blend)
- [x] MUD palette flora blending (MUD branch uses livingCoverColor × groundCover, same pattern as GRASS)
- [x] Tile body map spec designed (physical state per tile, rendering philosophy: ~30 sprites × continuous palette, gameplay-readable properties, integration plan)
- [x] Drainage chunk generator designed (drainage as organizing skeleton, zone classification, structured noise, flow accumulation, cross-chunk continuity, implementation phases)
- [x] palette-compute.js standalone module (zero-dependency game-ready palette computation)

## Up Next
- [ ] Sprite variants and selector (Piece 2 from tile body map spec — ~30 sprite patterns, variant selection from physical state, hand-tuning)
- [ ] Rendering integration (Piece 3 — wire per-tile palette and variant selector into game renderer, replace biome-lookup palettes)
- [ ] Chunk loading system (Phase C — generate chunks on demand as player moves, cache in IndexedDB, predictive loading)
- [ ] Full game integration (Phase D — replace BIOME_TARGET with planetary chunk generator, creature spawning, save migration)
- [ ] Planet viewer tuning — find ideal archipelago parameters using tuning panel (island shapes still blobby)
- [ ] Visual revert verification (confirm old visual overhaul changes fully reverted)
- [ ] Visual planning for future (creature body map → visual representation on screen)
- [ ] Visual rethinking (use 16x16 palettes as color reference for 32x32 sprites)
- [ ] Visual customization (settings menu with texture/resource pack option — texture picker prompt written)

## Near-Term Plans (no particular order at the moment)
- [ ] 32×32 directional sprites (8 facings per creature, mass-proportional tile footprints, designed at 32×32, downscaled to 16×16). Reference: sprite-lineup-reference.md
- [ ] Second-pass over bleed/metabolism/healing mechanic
- [ ] Fourth-pass over cognition/ganglia system (actual pattern libraries/memory system)
- [ ] NPC scent tracking AI (plume following, trail following, search patterns)
- [ ] Vibration ambient grounding (substrate-aware propagation — now informed by tile body map saturation/grainSize)
- [ ] NPC vision update (per-eye body map computation, replace VISION_PROFILES)
- [ ] Creature 5 (colonial chemotroph) redesign in doc and legacy content removal from game
- [ ] Legacy creature name cleanup (wolf→prowler, dire_wolf→ravager, cave_crab→shaleBack, etc.)
- [ ] Legacy elemental damage and name cleanup (blade damage)
- [ ] Restore ecological creature density after detection performance optimization
- [ ] Chemical workspace / scent gradient system (integration capacity determines how many samples are held, neural tissue computes gradient direction from sequential contact samples)
- [ ] Player movement intensity expansion (creep/stalk mode — slower, quieter emission, beyond current walk/sprint)

## Long-Term Plans
- [ ] Immune/infection mechanics (needs metabolism first)
- [ ] Gut/Digestion/gut microbiome (lower priority)
- [ ] Aquatic Ecosystems
- [ ] Sub-terranian ecosystem
- [ ] AI overhaul (complex creature behavior based on instincts, body plan and evolutionary principles)
- [ ] Energy-budget ecosystem (photosynthetic productivity → herbivore carrying capacity → predator carrying capacity, reproduction, sustainability test)
- [ ] Regional mineral zones on surface (trunk color variation by local soil chemistry — now derivable from planetary geology system and tile body map)
- [ ] Visual detection pass 2 (per-zone integument, countershading, disruptive coloration)
- [ ] Visual detection pass 3 (atmospheric modifiers — moisture, rain, fog — now informed by precipitation/saturation data)
- [ ] Visual detection pass 4 (spectral sensitivity, polarization for Clade B, bioluminescence, aposematic display)

## Very Long-Term Plans
- [ ] Lore overhaul (canon events across history, inventions, demigod interventions, factions, major events, wars, etc)
- [ ] "Modernity" as a concept (religion, trade, communication, animals with complex sapience or similar level of societal complexity)
- [ ] World editing (base building, tree cutting, ore mining, wall destroying, village creating, etc)
- [ ] Follower system (unclear if pet system, follower system or more of a niche possibility)
- [ ] Online interactivity (ability to share worlds and upload them, spectate, view/enter leaderboards, chat with other players/spectators, shared saves, etc)
- [ ] 3d rendering of the 2d gameworld (very much plausible given the way development works on this project, will implement 100% eventually)

## Prompt Reference
For new chats, include:
- Only the files that touch the system being changed
- The Project Handoff document (always)
- Design-Principles.md (always — describes HOW systems must be built)
- Session-Handoff-Weather-Drainage.md (for any planetary, weather, drainage, terrain generation, palette, or tile body map work)
- Session-Handoff-Visual-Planet.md (for sprite work, older visual/palette context)
- Session-Handoff-Sensory-UI.md (for any sensory, vision, scent, or UI work)
- Session-Handoff-Prompts-UI-Visual.md (for visual detection, occlusion, spawning, log system, or sprite work)
- Relevant design documents:
  - drainage-chunk-generator-design.md — drainage as landscape skeleton, zone classification, structured noise, chunk generation pipeline, cross-chunk continuity
  - tile-body-map-spec.md — what a tile IS (physical state), how it looks (~30 sprites × computed palette), how it plays (movement/vibration/scent/visibility from physics), rendering philosophy, game integration plan
  - three-layer-color-system.md — material table, transform parameters, derived palettes, texture profiles, mixotrophic concept
  - planetary-geology-design.md — bottom-up world generation architecture, plate tectonics, mineral chemistry, flora emergence
  - palette-compute.js — standalone game-ready palette module (computeTilePalette, MAT table, mineralColor, toScreen)
  - Body-Sim-Design — body map architecture, zone composition, tissue types
  - Surface-Creatures — all five creature body maps with exact transducer values, mass breakdowns, neural allocations
  - Ecology-Foundations — biome logic, ecological niches, food web, THREE-LAYER COLOR MODEL, Color Interpretation Guide with hex values, regional mineral chemistry
  - Underground-Chemotrophic-Ecology — mineral chemistry, chemotrophic ecosystem, energy sources
  - Cognition-Design — reactive-deliberative architecture, integration capacity, memory design, hormonal system
  - Sensory-Design — per-zone detection, SNR-based information quality, continuous uncertainty ranges
  - Muscle-Fiber-Design — per-zone fiber composition, substrate system, regeneration formula
  - Motor-System-Design — motor pathway activation, force computation
  - Endocrine-Design — hormonal broadcasting, alarm/mobilization, clade-specific chemistry
  - (other design docs unchanged from previous handoffs)

### Known Gotchas

- **One terrain function, one palette function.** `deriveTerrainAndCover` and `computeTilePalette` are the ONLY functions that assign terrain types or compute colors. Never write a second version. Call the existing ones.

- **Inheritance, not recomputation.** Each zoom level reads from the level above. Regional inherits from planetary. Tile inherits from regional. Local drainage only ADDS wetness (Math.max). Never recompute saturation, groundCover, or waterTableDepth from scratch at a lower level.

- **livingCoverColor depends on floraType.** Photosynthetic → crimson. Chemotrophic → mineral-tinted. Mixotrophic → blend. Computed at top of computeTilePalette, used in every terrain type branch.

- **MUD is the dominant terrain.** ~80% of lowland tiles. MUD palette blends livingCoverColor by groundCover × 0.7. Dark wet substrate shows through even at max coverage.

- **GRASS threshold is groundCover > 0.25, not saturation.** This planet's flora grows on any stable surface.

- **Three-layer color pipeline is locked.** Net: R×0.790, G×0.806, B×0.728. Adjust Layer 1 material values if output looks wrong, never the transforms.

- **Atmospheric simulation always at 512×256.** Surface detail at configurable resolution (default 2048×1024). Wind/currents/precipitation don't benefit from higher resolution.

- **Planet viewer is the data source, not just a design tool.** The game's chunk generator reads from the planetary grid. If the viewer's physics is wrong, the game world is wrong.

- **palette-compute.js is game-ready.** Zero dependencies. Exports computeTilePalette, MAT, mineralColor, toScreen. Import directly.

- **Chemotrophic organisms are geological.** Mounds, brackets, crusts, spires — not trees or mushrooms. Colony mound sprite, mineral crust texture.

- **Mixo fitness is additive.** (0.6 + 0.5 × mineralTotal) × water. The 0.6 is baked-in photosynthetic energy.

- **GRASS tiles don't have noRotate:true.** Directional variants look chaotic with random rotation.

- **Sprite variants exist but picker may not.** GRASS V2-V4, WATER V2-V5, DEEP_WATER V2-V3 defined in sprites.js. Picker UI unverified.
