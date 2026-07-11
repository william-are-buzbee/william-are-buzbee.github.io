# Todo

Prompt queue and task tracker. Check things off as they're done.

## Completed — Game Systems
- [x] Fix staircase transitions (underground entrance matches surface exit)
- [x] Underground grids match surface size (112x112)
- [x] Fix playableRadius for larger grid
- [x] Pocket boundary system (multiple entrances per underground layer)
- [x] Day/night cycle (turn-based, visual tint, surface only)
- [x] Separate terrain into ground + cover
- [x] Atmosphere fields driving biome generation
- [x] Biome target map system
- [x] Structure placement system
- [x] Split world-gen.js into focused modules
- [x] Remove enemy movement blocking + remove disengage check
- [x] Hare passivity fix
- [x] Water-locked aquatic AI
- [x] Mushroom swarm ambush overhaul
- [x] Remove scattered trees tile type, use regular forest cover with probability gradient
- [x] Save system (localStorage, auto-save after every action, version number in save data)
- [x] Fix surface stone/cave terrain visual (should look like rocky ground)
- [x] Re-establish biome layout functionality
- [x] Make world size fully configurable (audit all hardcoded positions/distances)
- [x] Structure/landmark system using coordinates
- [x] Implement "blend" variable for each biome on the target map
- [x] Added minimap system (press M key)
- [x] Removed visual grain effect and grass tile added noise
- [x] Added beach biome
- [x] Update world map until it looks good
- [x] Add a corpse/item drop system
- [x] Update UI to have no icons and use key presses to bring up info screens
- [x] Create two alien clades (clade A mammalian, clade B cephalopod, both terrestrial)
- [x] 3D body map system designed (replaces stats — weight, muscularity, connective tissue, neural mass, armor, texture, hardness, sensory organs, neural pathways)
- [x] Body maps for main ancestors of both clades (small herbivore, large herbivore, ambush predator, meso carnivore, apex carnivore)
- [x] First-pass Size & Strength system
- [x] First-pass Bleeding system (open vs closed circulatory)
- [x] First-pass Footprint system (attack area and multi-zone hits)
- [x] Physics based damage (weight, musculature, musclemass)
- [x] Death conditions (lethal zones, brain death, blood loss)
- [x] Species selection at chargen & parity
- [x] UI overlays (multi limb health, bleed counter, removal of max hp)
- [x] First-pass AI drive system (wander, flee, hunt, forage, sleep, recover)
- [x] First-pass perception/transducer system
- [x] First-pass cognitive/ganglia/nervous system
- [x] First-pass player perception/transducer visibility
- [x] Second-pass cognition/ganglia system
- [x] Second-pass perception/transducer system (chemical restructure)
- [x] Species-confidence gated rendering (blobs for unidentified creatures)
- [x] Significant optimization improvements (indexDB, active simulation radius, spatial hash grid)
- [x] Remove telepathic knowledge of environment
- [x] UI minimalism overhaul (fullscreen, flexible screen size, adjustable log, HUD scaling, zoom)
- [x] Vision cone fix (per-eye cone, binocular vs monocular, multiple eye placements)
- [x] First pass muscle fiber system (fiber type, aerobic vs anaerobic, glycogen)
- [x] Third pass cognitive system (ganglia as physical motor circuits)
- [x] Chemical sensing third pass (molecule-based, wind direction, contact vs airborne, diffusion)
- [x] Creature density scaled down for testing (~30-50 total)
- [x] Speed system overhaul (fiber data, sprint/walk, mass-dependent accel/turning)
- [x] Hare freeze behavior — two-threshold ganglion architecture
- [x] Ecological palette and tile texture update
- [x] Ambient brightness dip rendering
- [x] Canvas-rendered title screen
- [x] Detection performance optimization
- [x] Palette revert to pre-overhaul working values

## Completed — Planet Viewer & Generation Pipeline
- [x] Three-layer color pipeline designed and locked (material × star × adaptation, documented in three-layer-color-system.md)
- [x] Pipeline palette applied to game (11 BIOME entries updated)
- [x] Chemotrophic sprite redesign (colony mound, mineral crust)
- [x] Water tile texture redesign (amber wave crests)
- [x] Sprite variant library (GRASS V2-V4, WATER V2-V5, DEEP_WATER V2-V3)
- [x] Standalone planet generator/viewer (plates, elevation, minerals, atmosphere, flora, globe/flat/Mollweide, regional detail, tuning panel)
- [x] Weather/wind system (atmospheric circulation, topographic deflection, trade winds/westerlies/ITCZ)
- [x] Ocean current system (wind-driven, Coriolis, SST advection, upwelling)
- [x] Precipitation model (moisture advection, orographic, convergence, convective, iterative solver)
- [x] Humid planet corrections (1.2 atm, SST floor 0.50, softer rain shadows, moisture diffusion)
- [x] Groundwater model (coastal proximity, precip recharge, geothermal upwelling, elevation penalty)
- [x] Drainage accumulation (flow accumulation, log-scaled drainage bonus)
- [x] Water availability metric (precip × 0.7 + gw × 0.3 + drainage)
- [x] Substrate grain size system (slope, elevation, drainage, coastal type, volcanism → 0-1)
- [x] Water table depth model (elevation, precip, geothermal, drainage, coastal pull, basin ponding)
- [x] Saturation from water table (capillary fringe, grain size interaction)
- [x] Physical terrain derivation (substrate × saturation × flora → terrain type)
- [x] Regional drainage network (Phase A — structured noise, flow accumulation, zone classification)
- [x] Tile detail view (Phase B — chunk generator prototype, drainage at tile scale)
- [x] Per-tile palette computation (computeTilePalette — material colors through three-layer pipeline)
- [x] High-resolution planetary surface (configurable 1×-8×, atmospheric sim at 512×256)
- [x] Planet viewer pipeline rewrite (unified typed arrays, one deriveTerrainAndCover, one computeTilePalette)
- [x] Flora type palette differentiation (livingCoverColor by floraType — photo=crimson, chemo=mineral, mixo=blend)
- [x] MUD palette flora blending (livingCoverColor × groundCover)
- [x] Tile body map spec designed
- [x] Drainage chunk generator designed
- [x] palette-compute.js standalone module
- [x] sprite-select.js standalone module (physical state → variant indices)

## Completed — Planet Viewer Visual Polish
- [x] Shallow water terrain threshold (SHALLOW_WATER_TERRAIN_THRESHOLD = 0.05m — land tiles with < 5cm water keep ground terrain type with wet film, not blue water)
- [x] Regional surface overlay fix (uses cell.terrainType instead of cell.isLand for ocean detection — fixes coastal cells inside "land" planetary cells)
- [x] Shallow ocean depth classification (tiles 0-25cm below sea level get TT_WATER with bottom visibility; >25cm get TT_DEEP_WATER — coastal gradient matches regional view)
- [x] Cross-chunk continuity via border margin (576×576 padded grid, crop to 512×512 — flow accumulation, water bodies, tree placement all respect neighbors)
- [x] Tile position marker on regional map (white box shows which cell the tile view displays, updates on Shift+arrow)
- [x] Chunk cache (Map keyed by "rx,ry", instant revisit, clears on regional regeneration)
- [x] Regional pan closes tile view cleanly
- [x] Checkerboard elimination (blend zone 2-10cm with smoothstep, terrain classification stays binary, guard excludes water/deep_water tiles)
- [x] Square contour elimination (domain warp on bilinear interpolation — noise2D displaces sampling coordinates 12%, elevation excluded from warp)
- [x] Tooltip overhaul (water depth in cm/m, ocean label for negative elevation, flora hidden when barren, substrate grouped, sprites condensed)

## Completed — Planet Geography Realism Pass (Session 18)
- [x] Archipelago parameter tuning (continentalRatio 0.40→0.30, plateCountBase 10→14, minPlateSpacing 0.40→0.28, continentalBase -0.05→-0.08, continentalNoise 0.12→0.18, oceanicBase -0.25→-0.30)
- [x] Volcanic island arc chains along subduction zones (arc seeds generate 4-8 sub-peaks along boundary direction, oceanic-oceanic arcs get longer chains, tuning params for chain spacing/jitter/radius)
- [x] Elongated peaks and irregular coastlines (elliptical falloff aligned to boundary direction with peakAspectRatio 2.5, angular noise with peakAngularNoise 0.25 and peakAngularFreq 5 for irregular coastlines, hotspots stay radial)
- [x] Precipitation model fix for ocean-dominated planets (background precipitation now falls over ocean too, 95th-percentile normalization replaces max-based normalization, bgPrecipRate 0.02→0.03)
- [x] Persistent info panel with snapshot button (press I — captures planet/region/tile data simultaneously, bottom-left panel, persists until next snapshot)
- [x] Tuning presets updated (Earth-like, Waterworld, Pangaea adjusted for new defaults, new Archipelago preset added)
- [x] Arc height increased (arcHeight 0.45→0.55 — reliably creates islands from -0.30 ocean floor)

## Up Next — Regional Ecology Audit (Phase 2 of Geography Pass)

**This is the immediate next session.** Planetary-scale geography now passes the smell test — archipelago world with elongated islands, volcanic arcs, continental fragments, and working precipitation. The next step is inspecting regional and tile scale through the lens of Ecology-Foundations.md.

### Regional Inspections Needed
- [ ] Continental coastline — navigate to where a large landmass meets ocean. Does the regional view produce complex coastlines (bays, headlands, lagoons, tidal flats)? Or is it a smooth gradient?
- [ ] Flora distribution at coast — photosynthetic mat should dominate wet lowlands, canopy should thin where substrate is too saturated or sandy for rooting
- [ ] Volcanic arc island — navigate to an elongated mid-ocean island. Does it have the right character? Rocky ridge center, steep slopes, drainage channels running to coast, mineral-rich zones near peak for chemotrophic flora?
- [ ] Lowland precipitation variation — is there windward/leeward difference at regional scale? Rain shadows behind mountains?
- [ ] Drainage patterns — do regional rivers flow ridge to coast? Do flat lowlands show meandering drainage?
- [ ] Any obviously wrong zones — desert where swamp should be, forest where bare rock should be, etc.
- [ ] Canopy coverage audit — the last snapshot showed 0% canopy on a well-watered upper slope with mixotrophic flora. Need to check whether canopy establishment is properly gated by physical conditions.

### Regional Tuning (based on audit findings)
- [ ] Regional coastline noise parameters (coastAmplitude, coastWidth) — may need adjustment for more complex coastlines
- [ ] Flora establishment thresholds — may need tuning now that precipitation is working
- [ ] Canopy establishment on different flora types — verify mixotrophic and chemotrophic canopy rules
- [ ] Groundwater parameters — check if regional groundwater distribution makes sense with new precipitation

### Phase 3: Planetary Tuning Refinements
- [ ] Mineral distributions audit — Fe volcanic, Cu hydrothermal, Mn sedimentary — are they geologically plausible?
- [ ] Arc island aspect ratio refinement — some mid-ocean islands may be too needle-thin (peakAspectRatio 2.5 → 2.0?)
- [ ] Continental shelf subduction trench asymmetry (deep trench on subducting side — identified as lower priority, still worth doing)

### Phase 4: Feature Vocabulary (identify what's missing at tile level)
- [ ] Rock outcrops on ridges/cliffs
- [ ] Springs where groundwater meets surface
- [ ] Tidal pools in coastal zones
- [ ] Colony mounds (Ecology Foundations — termite mound analogue)
- [ ] Volcanic features near plate boundaries
- [ ] Beach/dune formations

## Up Next — Game Integration (after geography pass)
- [ ] Sprite variants and selector completion (Piece 2 from tile body map spec — ~30 sprite patterns, variant selection from physical state)
- [ ] Rendering integration (Piece 3 — wire per-tile palette and variant into game renderer, replace biome-lookup palettes)
- [ ] Sync palette-compute.js with viewer's computeTilePalette (standalone module missing livingCoverColor system)
- [ ] Chunk loading system (Phase C — generate on demand, cache in IndexedDB, predictive loading)
- [ ] Full game integration (Phase D — replace BIOME_TARGET with planetary chunk generator, creature spawning, save migration)
- [ ] Scale mapping fix for game (tile = 2m, chunk = 1km, proper context sampling across ~7 regional cells — deferred from viewer, needed for game)

## Near-Term Plans (no particular order)
- [ ] 32×32 directional sprites (8 facings per creature, mass-proportional footprints)
- [ ] Second-pass over bleed/metabolism/healing
- [ ] Fourth-pass over cognition/ganglia (actual pattern libraries/memory)
- [ ] NPC scent tracking AI (plume following, trail following, search patterns)
- [ ] Vibration ambient grounding (substrate-aware propagation)
- [ ] NPC vision update (per-eye body map computation)
- [ ] Creature 5 (colonial chemotroph) redesign
- [ ] Legacy creature name cleanup (wolf→prowler, dire_wolf→ravager, cave_crab→shaleBack, etc.)
- [ ] Legacy elemental damage and name cleanup
- [ ] Restore ecological creature density after detection optimization
- [ ] Chemical workspace / scent gradient system
- [ ] Player movement intensity expansion (creep/stalk mode)
- [ ] Visual rethinking (16x16 palettes as color reference for 32x32 sprites)
- [ ] Visual customization (settings menu with texture/resource pack option)
- [ ] Planet viewer UI overhaul (layout cleanup, better screenshot workflow, less awkward tooltip positioning)

## Long-Term Plans
- [ ] Immune/infection mechanics (needs metabolism first)
- [ ] Gut/Digestion/gut microbiome
- [ ] Aquatic Ecosystems
- [ ] Sub-terranian ecosystem
- [ ] AI overhaul (complex creature behavior based on instincts, body plan and evolutionary principles)
- [ ] Energy-budget ecosystem (photosynthetic productivity → herbivore carrying capacity → predator capacity)
- [ ] Regional mineral zones on surface (trunk color variation by local soil chemistry)
- [ ] Visual detection pass 2 (per-zone integument, countershading, disruptive coloration)
- [ ] Visual detection pass 3 (atmospheric modifiers — moisture, rain, fog)
- [ ] Visual detection pass 4 (spectral sensitivity, polarization for Clade B, bioluminescence)

## Very Long-Term Plans
- [ ] Lore overhaul (canon events, inventions, demigod interventions, factions, wars)
- [ ] "Modernity" as a concept (religion, trade, communication, complex sapience)
- [ ] World editing (base building, tree cutting, ore mining, wall destroying, village creating)
- [ ] Follower system
- [ ] Online interactivity (share worlds, spectate, leaderboards, chat, shared saves)
- [ ] 3D rendering of the 2d gameworld

## Prompt Reference

For new chats, include:
- Only the files that touch the system being changed
- Design-Principles.md (always — describes HOW systems must be built)
- Ecology-Foundations.md (always for planet/ecology work)
- The most recent session handoff document

### Key Documents by Topic

**Planet generation & viewer:** planet-viewer.html, drainage-chunk-generator-design.md, three-layer-color-system.md, session-handoff-geography-realism.md
**Tile rendering:** tile-body-map-spec.md, palette-compute.js, sprite-select.js, sprites.js
**Creature systems:** Body-Sim-Design, Surface-Creatures, Cognition-Design, Sensory-Design, Muscle-Fiber-Design, Motor-System-Design, Endocrine-Design
**Ecology:** Ecology-Foundations, Underground-Chemotrophic-Ecology

### Known Gotchas

- **One terrain function, one palette function.** `deriveTerrainAndCover` and `computeTilePalette` are the ONLY functions that assign terrain types or compute colors. Never write a second version.

- **Inheritance, not recomputation.** Each zoom level reads from the level above. Regional inherits from planetary. Tile inherits from regional. Local drainage only ADDS wetness. Never recompute saturation, groundCover, or waterTableDepth from scratch at a lower level.

- **livingCoverColor depends on floraType.** Photosynthetic → crimson. Chemotrophic → mineral-tinted. Mixotrophic → blend. Computed at top of computeTilePalette, used in every terrain branch.

- **MUD is the dominant terrain.** ~80% of lowland tiles. MUD palette blends livingCoverColor by groundCover × 0.7.

- **Three-layer color pipeline is locked.** Net: R×0.790, G×0.806, B×0.728. Adjust Layer 1 material values, never the transforms.

- **palette-compute.js is behind the viewer.** Missing livingCoverColor system. Needs sync before game integration.

- **Shallow water threshold (0.05m) applies to LAND only.** Ocean tiles (negative elevation) are classified by depth: >25cm = deep_water, ≤25cm = water with bottom visibility. The blend zone (2-10cm) only activates for ground terrain types.

- **Domain warp excludes elevation.** Context properties (flora, minerals, saturation) use warped coordinates for organic boundaries. Elevation uses raw coordinates so drainage stays locked to topography.

- **Scale mismatch (viewer only, not blocking).** Regional cells are 152m in the viewer. Design doc says 1km. Noise tuning makes it LOOK right at ~1km. Will be fixed properly for game integration.

- **Chemotrophic organisms are geological.** Mounds, brackets, crusts, spires — not trees or mushrooms.

- **Planet viewer is the data source.** The game's chunk generator reads from the planetary grid. If the viewer's physics is wrong, the game world is wrong.

- **Precipitation normalization uses 95th percentile.** Not max-based anymore. Top 5% of land cells can clamp to 1.0. This prevents extreme windward cells from crushing all other precipitation to zero.

- **Background precipitation falls over ocean.** This is the atmospheric moisture drain that keeps the precipitation model stable on ocean-dominated planets. Only land precipitation is tracked in precipAccum for downstream systems.

- **Peak falloff is elliptical, not radial.** Mountain and arc seeds use elliptical distance aligned to boundary direction (peakAspectRatio 2.5). Hotspots stay radial (no boundary direction). Angular noise (peakAngularNoise 0.25) adds coastline irregularity. Search radius in spatial grid must account for aspect ratio.

- **Arc chains are sub-peaks, not single seeds.** Each arc seed spawns 4-8 sub-peaks along the boundary. Oceanic-oceanic arcs get longer chains (5-8 peaks). Sub-peaks share the parent's boundaryDir and are processed identically by the elevation computation.

- **New default parameters (Session 18).** continentalRatio 0.30, plateCountBase 14, minPlateSpacing 0.28, continentalBase -0.08, continentalNoise 0.18, oceanicBase -0.30, arcHeight 0.55, bgPrecipRate 0.03. These produce an archipelago planet at ~20-25% land area.
