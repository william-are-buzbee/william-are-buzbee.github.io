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

## Up Next
- [ ] Detection performance optimization (BLOCKING — profile the hot path, reduce spatial query radius per species, cache LOS per tile-pair, cache best transducer per channel)
- [ ] Ganglion and substrate work for the small grazer (escape mechanics, physical behavior from body map)

## Near-Term Plans (no particular order at the moment)
- [ ] Second-pass over bleed/metabolism/healing mechanic
- [ ] Fourth-pass over cognition/ganglia system (actual pattern libraries/memory system)
- [ ] NPC scent tracking AI (plume following, trail following, search patterns)
- [ ] Vibration ambient grounding (substrate-aware propagation)
- [ ] NPC vision update (per-eye body map computation, replace VISION_PROFILES)
- [ ] Creature 5 (colonial chemotroph) redesign in doc and legacy content removal from game
- [ ] Legacy creature name cleanup (wolf→prowler, dire_wolf→ravager, cave_crab→shaleBack, etc.)
- [ ] Legacy elemental damage and name cleanup (blade damage )
- [ ] Restore ecological creature density after detection performance optimization

## Long-Term Plans
- [ ] Immune/infection mechanics (needs metabolism first)
- [ ] Gut/Digestion/gut microbiome (lower priority)
- [ ] Aquatic Ecosystems
- [ ] Sub-terranian ecosystem
- [ ] AI overhaul (complex creature behavior based on instincts, body plan and evolutionary principles)
- [ ] Chunk-based loading (allows for vastly larger world sizes)
- [ ] Energy-budget ecosystem (photosynthetic productivity → herbivore carrying capacity → predator carrying capacity, reproduction, sustainability test)
- [ ] Regional mineral zones on surface (trunk color variation by local soil chemistry)
- [ ] Visual detection pass 2 (per-zone integument, countershading, disruptive coloration)
- [ ] Visual detection pass 3 (atmospheric modifiers — moisture, rain, fog)
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
- Session-Handoff-Sensory-UI.md (for any sensory, vision, scent, or UI work)
- Session-Handoff-Prompts-UI-Visual.md (for visual detection, occlusion, spawning, log system, or sprite work)
- Relevant design documents:
  - Body-Sim-Design — body map architecture, zone composition, tissue types
  - Surface-Creatures — all five creature body maps with exact transducer values, mass breakdowns, neural allocations
  - Stat-System-Design — legacy stat derivations, bridge values
  - Ecology-Foundations — biome logic, ecological niches, food web, THREE-LAYER COLOR MODEL, Color Interpretation Guide with hex values, regional mineral chemistry
  - Mutation-Design — mutation mechanics, consumption tracking, tissue deposition
  - Lore — demigod phases, planet history, central narrative
  - Cognition-Design — reactive-deliberative architecture, integration capacity, memory design, hormonal system
  - Sensory-Design — per-zone detection, SNR-based information quality, continuous uncertainty ranges
  - Circulatory-Immune-Design — circulatory diversity, immune architecture, infection mechanics
  - Muscle-Fiber-Design — per-zone fiber composition, substrate system, regeneration formula
  - Motor-System-Design — motor pathway activation, force computation
  - Ambient-Terrain-Sensing-Design — per-channel ambient terrain awareness (visual peripheral + vibration ground)
  - Per-Eye-Visual-Field-Design — per-eye visual field computation, binocular/monocular zones, three-tier rendering
  - Chemical-Scent-System-Design — two-layer scent model, wind-driven transport, 8 molecular classes, sniff action
  - Visual-Occlusion-Design — sightline opacity, local concealment, occlusion budgets, cover type properties
  - Visual-Detection-Design — motion factor, background contrast, integument properties, signal modifiers
  - Spawning-Design — first pass density spawning (placeholder), long-term energy-budget vision
  - Endocrine-Design — hormonal broadcasting, alarm/mobilization, clade-specific chemistry
  - Hare-Turn-Walkthrough — step-by-step ganglion behavior reference
  - Underground-Chemotrophic-Ecology — mineral chemistry, chemotrophic ecosystem, energy sources
- Key utility signatures (worldDims returns array, getFeature returns by reference, etc.)
- Known bugs and what causes them
- What NOT to change

### Known Gotchas

- **Save system is async IndexedDB:** saveGame() and loadGame() are async. Auto-save is fire-and-forget. Load on startup must be awaited. Old localStorage saves auto-migrate.

- **Save bloat — TRANSIENT_FIELDS:** New per-turn transient fields on creatures must be added to TRANSIENT_FIELDS in save-load.js. Entity reference fields explicitly deleted in serializers.

- **Save bloat — reconstructable constants:** pathways and clade stripped before save, reconstructed from templates on load.

- **Visual transducers are structured objects:** { acuity, placement, fieldAngle }. Use getVisualAcuity() and getVisualConfig() helpers.

- **Chemical transducers are objects:** { contact, airborne, dissolved }.

- **Vibration transducers are objects:** { ground, air, water }.

- **Chemical detection removed from player perception:** Only vibration and visual channels contribute to sensed-creature rendering.

- **VISION_PROFILES deprecated for player, active for NPCs:** Player uses per-eye body map. NPC vision update deferred.

- **display.js owns viewport state:** TILE, VIEW_W, VIEW_H are computed functions, not constants. Three zoom levels.

- **Three-tier visual rendering:** fovSet (binocular, bright) → monocularSet (18% overlay) → explored (42% overlay). Entities in binocular and monocular only.

- **drawEntityAtTile gates on _visuallyDetected.** Three rendering states: full sprite (high SNR), blob (moderate SNR, _visualFOV: true), invisible (below threshold). Creatures on FOV tiles are NOT rendered unconditionally.

- **VIS_MOVEMENT_MULT removed from signals.js.** Motion handled entirely by MOTION_SIGNAL_MOVING/STILL in detection.js. Do not re-add motion multiplier to signal emission.

- **Contrast formula recentered.** Range ~0.08 to ~1.8. Below 1.0 = blending in. Above 1.0 = standing out.

- **Scent maps are transient (not saved).** Ground and airborne scent maps rebuild naturally on load.

- **Scent system uses 8 molecular classes.** Per-species emission profiles in SCENT_PROFILES.

- **Wind state is in state.js:** windDirection (0-7) and windSpeed (0-3).

- **Creature UIDs for debug tracking:** _uid at spawn. syncCreatureUIDs() after save-load.

- **Substrate regeneration uses enzymatic upregulation:** Front-loaded recovery curve.

- **Detection is per-zone, not per-creature.** No creature-level aggregated sensitivity.

- **Detection info uses uncertainty ranges:** sizeEstimate {lower, upper, estimated}, continuous confidence values.

- **Spatial grid rebuilt each turn.** Use getNearbyCreatures(), never iterate state.creatures for detection.

- **Active radius / dormancy:** ACTIVE_RADIUS 40, DORMANT_RADIUS 45. Creatures beyond dormant, wake with catch-up.

- **Player must inherit template fields:** New fields on creature templates must be copied in chargen.js.

- **Integration capacity recomputed each turn.** Don't persist.

- **Species confidence gates rendering.** Blobs below SPECIES_DISPLAY_CONFIDENCE.

- **SNR = zoneRange / distance.** Per zone per channel.

- **Reactive layer never reads target internals.** Uses signal magnitude, distance, flags on self.

- **No species-specific code in AI.** Universal rules with body-map-derived queries.

- **File split re-export bridges in place.** constants.js and enemy-ai.js re-export from child modules. Migrate to direct imports incrementally.

- **Log entries are objects.** { text, category, turn }. Renderer handles both formats for old saves.

- **Sightline opacity accumulates per-ray.** Trees are partial occluders. Budget = acuity × OCCLUSION_BUDGET_COEFF.

- **Integument is species-level.** brightness + hue on SPECIES_TEMPLATES. Per-zone is future.

- **All first-pass spawning tagged.** Grep `FIRST PASS SPAWNING`. Density temporarily reduced — grep `density reduced for testing` to restore.

- **Creature 5 (colonial chemotroph / "mushroom") is dead concept.** Do not implement new features.

- **Ecology doc three-layer color model.** Material × starlight × creature perception. Screen shows layer 3. Color Interpretation Guide has hex values.

- **Internal creature names:** wolf=meso-predator, dire_wolf=apex predator, hare=small herbivore, cave_crab=large wading grazer, mushroom=colonial chemotroph (dead), ambush_pred=ambush predator.

### Typical File Sets
- **Biome/terrain work:** surface-gen.js, constants.js, terrain.js
- **Enemy AI / drives / behavior:** enemy-ai.js, cognition.js, detection.js, behaviors.js, ai-utils.js, monsters.js, combat.js, terrain.js, signals.js
- **Perception / detection:** detection.js, signals.js, constants.js, fov.js, time-cycle.js, terrain.js
- **Movement/combat:** player-actions.js, combat.js, behaviors.js, enemy-ai.js, state.js
- **Transitions:** world-gen.js, interactions.js, state.js, world-state.js
- **Rendering:** rendering.js, sprites.js, terrain.js, constants.js, display.js
- **Spawning:** world-logic.js, monsters.js, surface-gen.js, constants.js, terrain.js
- **FOV / vision / visual field:** fov.js, player.js, rendering.js, terrain.js, time-cycle.js, state.js, display.js, constants.js
- **Visual occlusion:** fov.js, terrain.js, body-maps.js, sensory-constants.js
- **Visual detection:** detection.js, signals.js, sensory-constants.js, body-maps.js, terrain.js
- **Scent system:** scent.js, constants.js (SCENT_PROFILES), state.js (wind), enemy-ai.js (call site), rendering.js (ground trail overlay)
- **Ambient terrain sensing:** fov.js, constants.js, terrain.js
- **Facing/turning:** player-actions.js, enemy-ai.js, fov.js, main.js, state.js
- **Underground:** underground-gen.js, world-gen.js, constants.js, terrain.js
- **Shops/economy:** interactions.js, items.js, player.js, ui.js, modal.js, constants.js
- **NPCs/structures:** world-logic.js, surface-gen.js, constants.js, interactions.js, terrain.js, sprites.js
- **Chargen/attributes:** chargen.js, player.js, constants.js, main.js, index.html, state.js
- **UI/layout:** index.html, ui.js, main.js, rendering.js, display.js, constants.js
- **Log system:** ui.js, main.js, index.html, state.js
- **Viewport / zoom / sprites:** display.js, rendering.js, sprites.js, sprites-32.js, main.js, index.html
- **Save/load:** save-load.js, state.js, chargen.js, interactions.js, main.js
- **Input/controls:** main.js, player-actions.js, constants.js
- **Body map / creatures:** constants.js, body-maps.js, monsters.js, combat.js
- **Muscle fiber / substrate:** physiology.js, constants.js, body-maps.js
- **Signals / emission:** signals.js, detection.js, constants.js, terrain.js
- **Spatial grid / optimization:** ai-utils.js, constants.js, state.js
- **Sensory / detection:** detection.js, signals.js, sensory-constants.js, constants.js, rendering.js
- **Cognition / AI behavior:** cognition.js, enemy-ai.js, ai.js, monsters.js, constants.js
- **File splitting:** constants.js and enemy-ai.js are re-export bridges → body-maps.js, combat-constants.js, sensory-constants.js, ecology-data.js, physiology.js, ai.js, turn-loop.js, debug.js
