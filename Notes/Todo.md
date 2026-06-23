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
- [ ] Legacy content removal (remove old king, old staircases, critical hits in message log, superfluous messages, old status menu is ancient, etc)

## Near-Term Plans (no particular order at the moment)
- [ ] UI refinement (enhance log for clarity and minimalism, get rid of old UI elements)
- [ ] 2x upscaled sprite pack (just to see if it looks better) 
- [ ] Second-pass over bleed/metabolism/healing mechanic
- [ ] Fourth-pass over cognition/ganglia system (actual pattern libraries/memory system) 

## Long-Term Plans
- [ ] Immune/infection mechanics (needs metabolism first)
- [ ] Gut/Digestion/gut microbiome (lower priority)
- [ ] Aquatic Ecosystems
- [ ] Sub-terranian ecosystem
- [ ] AI overhaul (complex creature behavior based on instincts, body plan and evolutionary principles)
- [ ] Chunk-based loading (allows for vastly larger world sizes)

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
- Session-Handoff-Sensory-UI.md (for any sensory, vision, scent, or UI work — captures the full state of the sensory/UI overhaul session)
- Relevant design documents:
  - Body-Sim-Design — body map architecture, zone composition, tissue types
  - Surface-Creatures — all five creature body maps with exact transducer values, mass breakdowns, neural allocations
  - Stat-System-Design — legacy stat derivations, bridge values
  - Ecology-Foundations — biome logic, ecological niches, food web
  - Mutation-Design — mutation mechanics, consumption tracking, tissue deposition
  - Lore — demigod phases, planet history, central narrative
  - Cognition-Design — reactive-deliberative architecture, integration capacity, memory design, hormonal system (UPDATED: reflects the reactive/deliberative two-layer model, NOT the old tier-based system)
  - Sensory-Design — per-zone detection, SNR-based information quality, continuous uncertainty ranges, sensitivity windows (future), signal-to-noise framework
  - Circulatory-Immune-Design — circulatory diversity across clades, immune architecture, infection mechanics, microbial ecology, mutation as immune event (all future/design-phase, not yet implemented)
  - Muscle-Fiber-Design — per-zone fiber composition, substrate system, regeneration formula (UPDATED: biologically grounded regeneration with enzymatic upregulation curve)
  - Motor-System-Design — motor pathway activation, force computation (UPDATED: references new regeneration model and separate circulatory regen efficiency)
  - Ambient-Terrain-Sensing-Design — per-channel ambient terrain awareness from transducers (visual peripheral + vibration ground; chemical ambient was removed as physically incorrect)
  - Per-Eye-Visual-Field-Design — per-eye visual field computation from body map anatomy, binocular/monocular zones, three-tier rendering, replaces VISION_PROFILES for player
  - Chemical-Scent-System-Design — two-layer scent model (ground trails + airborne plumes), wind-driven transport, 8 molecular classes, sniff action, detection architecture
- Key utility signatures (worldDims returns array, getFeature returns by reference, etc.)
- Known bugs and what causes them
- What NOT to change

### Known Gotchas

- **Save system is async IndexedDB:** Saves use IndexedDB, not localStorage. `saveGame()` and `loadGame()` are async. Auto-save in `endPlayerTurn` is fire-and-forget (`saveGame().catch(...)`). Load on startup must be awaited. Old localStorage saves auto-migrate on first load.

- **Save bloat — TRANSIENT_FIELDS:** Any new per-turn transient fields on creatures or the player must be added to the TRANSIENT_FIELDS array in save-load.js. Entity reference fields (sensedCreatures, detectionInfo, detectedThreats, detectedPrey, huntTarget, threatSource) are explicitly deleted in the serializers as belt-and-suspenders safety.

- **Save bloat — reconstructable constants:** `pathways` and `clade` on creatures are stripped before save and reconstructed from `CREATURE_PATHWAYS[key]` and `CLADE_DATA[key]` on load. Do not store data on creatures that can be derived from their template key.

- **Visual transducers are structured objects:** `zone.transducers.visual` is `{ acuity, placement, fieldAngle }`, not a single number. `placement` is `'lateral'` (prey eyes, ±80° offset) or `'forward'` (predator eyes, ±20° offset). `fieldAngle` is the single eye's FOV width in degrees. Use `getVisualAcuity(zone)` and `getVisualConfig(zone)` helpers (exported from constants.js) — they handle both the new structured format and the legacy flat-number format.

- **Chemical transducers are objects:** `zone.transducers.chemical` is `{ contact, airborne, dissolved }`, not a single number. Any code reading it as a number will break. This mirrors vibration's `{ ground, air, water }` structure.

- **Vibration transducers are objects:** `zone.transducers.vibration` is `{ ground, air, water }`, not a single number. Same principle as chemical.

- **Chemical detection removed from player perception:** `computePlayerPerception` in detection.js filters out `chemicalAirborne` channel from SNR aggregation. Creatures detected only through chemical SNR do NOT produce sensed-creature blobs. Chemical creature detection is exclusively through the scent transport system (sniff action, ground trail overlay, involuntary strong-signal alerts). Only vibration and visual channels contribute to sensed-creature rendering.

- **VISION_PROFILES deprecated for player, active for NPCs:** Player visual field is computed from body map per-eye anatomy (fov.js `updatePlayerFOV`). NPC vision still reads `visionConeWidth` from `VISION_CONE_WIDTHS` in monsters.js and `visionType`/`coneAngle` from `VISION_PROFILES`. NPC vision update to use body map is deferred.

- **display.js owns viewport state:** `TILE`, `VIEW_W`, `VIEW_H` are no longer constants — they are computed from `display.js` functions `tileSize()`, `viewW()`, `viewH()`. Only rendering.js and main.js import from display.js. Three zoom levels (×1/×2/×3). Canvas fills the browser window.

- **Three-tier visual rendering:** `state.fovSet` = binocular tiles (bright). `state.monocularSet` = monocular tiles (18% overlay). `state.explored[layer]` = explored/ambient tiles (42% overlay). Entities are rendered in both binocular and monocular zones but NOT in explored-only zones. The monocular set is computed per-eye from body map visual transducer placement and field angle.

- **Scent maps are transient (not saved):** Ground and airborne scent maps are module-level Maps in scent.js. They are NOT in state.js and are NOT persisted. On load, scent maps start empty and rebuild naturally as creatures move. The self-shadow maps (for filtering the player's own scent) are also transient.

- **Scent system uses 8 molecular classes:** `ketones, amines, terpenoids, greenLeaf, hemolymph, fattyAcids, sulfur, phenolics`. Per-species emission profiles in `SCENT_PROFILES` (constants.js) distribute emission across these classes. The sniff action (V key, does not consume a turn) translates molecular concentrations into naturalistic text descriptions.

- **Wind state is in state.js:** `state.windDirection` (0-7 compass, where wind blows FROM) and `state.windSpeed` (0-3). Shifts gradually over time. Airborne scent advects downwind. Direction info for airborne detections comes from the wind vector, not from the scent gradient.

- **Creature UIDs for debug tracking:** Every creature gets `_uid` (monotonic integer) at spawn. `syncCreatureUIDs()` from monsters.js must be called after save-load to prevent UID collisions. Ctrl+right-click toggles per-turn stat tracking. Console: `track(uid)`, `untrack(uid)`, `untrackAll()`, `tracked()`.

- **Substrate regeneration uses enzymatic upregulation:** The formula is `zone.muscle × SUBSTRATE_REGEN_BASE × circRegenEff × vascularityFactor × depletionBoost`. The `depletionBoost = 1 + REGEN_UPREGULATION × (1 - substrateFraction)` creates a front-loaded recovery curve. Separate `CIRC_REGEN_EFF_*` constants for regeneration (gentler penalty for open circulation at rest) vs `CIRC_EFFICIENCY_*` for aerobic force output.

- **Detection is per-zone, not per-creature:** There is no creature-level aggregated sensitivity. Each zone independently computes detection range from its own transducer quality. `cacheEffectiveSenses` and `computePlayerSensoryProfile` no longer exist. Detection uses `detectTargetPerZone` which returns an array of `{zone, channel, quality, snr}` per detected target.

- **Detection info uses uncertainty ranges:** `buildDetectionInfo` produces continuous uncertainty — `sizeEstimate: {lower, upper, estimated}`, `dietConfidence` (0-1), `speciesConfidence` (0-1). NOT binary flags. The reactive layer reads worst-case bounds via `relativeMagnitude()` which can return `'ambiguous'` when the size range spans the observer's own mass.

- **Spatial grid must be rebuilt each turn:** `rebuildSpatialGrid` runs at the start of each AI turn with active creatures only. All detection loops use `getNearbyCreatures()` instead of iterating all creatures. Never iterate `state.creatures` directly for detection purposes.

- **Active radius / dormancy:** Creatures beyond DORMANT_RADIUS (45 tiles) from the player are dormant — no emission, no detection, no AI. They wake up with catch-up state advancement when the player approaches within ACTIVE_RADIUS (40 tiles). Dormant creatures are NOT in the spatial grid. `_dormant` and `_dormantTurns` are transient fields.

- **Player must inherit template fields:** When new fields are added to creature templates (monsters.js), the species selection path (chargen.js) must copy them to the player or the AI will not evaluate the player correctly.

- **Integration capacity is recomputed each turn:** Don't persist it. Zone destruction changes override reliability and classification depth in real time.

- **Species confidence gates rendering:** Non-visually sensed creatures render as size-scaled blobs below SPECIES_DISPLAY_CONFIDENCE (0.75), switching to actual sprites above it. The player perception pass stores `{creature, bestSNR, speciesConfidence, sizeEstimate}` on `player.sensedCreatures`.

- **SNR = zoneRange / distance:** Signal-to-noise ratio is computed per zone per channel. At the edge of detection SNR = 1.0, close range produces high SNR. SNR drives both the AI uncertainty model and the player rendering opacity gradient.

- **Reactive layer never reads target internals:** Reactive rule conditions check signal magnitude, distance, adjacency, and flags on self (tookDamageThisTurn, hunger, blood). They do NOT read target.diet, target.species, target.hp directly. Size comparison uses signal magnitude vs self-emission reference.

- **No species-specific code in AI:** The reactive-deliberative architecture uses universal rules with body-map-derived queries (combatCapability, movementCompromisesSense, hasRefuge, dietResponse). Search for species names or speciesId checks in AI decision logic — there should be none.

### Typical File Sets
- **Biome/terrain work:** surface-gen.js, constants.js, terrain.js
- **Enemy AI / drives / behavior:** enemy-ai.js, monsters.js, combat.js, terrain.js, signals.js
- **Perception / detection:** detection.js, signals.js, constants.js, fov.js, time-cycle.js, terrain.js
- **Movement/combat:** player-actions.js, combat.js, enemy-ai.js, state.js
- **Transitions:** world-gen.js, interactions.js, state.js, world-state.js
- **Rendering:** rendering.js, sprites.js, terrain.js, constants.js, display.js
- **Spawning:** world-logic.js, monsters.js, surface-gen.js or underground-gen.js
- **FOV / vision / visual field:** fov.js, player.js, rendering.js, terrain.js, time-cycle.js, state.js, display.js, constants.js (getVisualConfig, getVisualAcuity)
- **Scent system:** scent.js, constants.js (SCENT_PROFILES), state.js (wind), enemy-ai.js (call site), rendering.js (ground trail overlay)
- **Ambient terrain sensing:** fov.js (updateAmbientSensing), constants.js (AMBIENT_VISUAL_COEFF, AMBIENT_VIB_COEFF), terrain.js
- **Facing/turning:** player-actions.js, enemy-ai.js, fov.js, main.js, state.js
- **Underground:** underground-gen.js, world-gen.js, constants.js, terrain.js
- **Shops/economy:** interactions.js, items.js, player.js, ui.js, modal.js, constants.js
- **NPCs/structures:** world-logic.js, surface-gen.js, constants.js, interactions.js, terrain.js, sprites.js
- **Chargen/attributes:** chargen.js, player.js, constants.js, main.js, index.html, state.js
- **UI/layout:** index.html, ui.js, main.js, rendering.js, display.js, constants.js
- **Viewport / zoom:** display.js, rendering.js, main.js, index.html
- **Save/load:** save-load.js, state.js, chargen.js, interactions.js, main.js (async IndexedDB — saveGame is fire-and-forget, loadGame must be awaited)
- **Input/controls:** main.js, player-actions.js, constants.js
- **Body map / creatures:** constants.js, monsters.js, combat.js, Body-Sim-Design.md, Surface-Creatures.md
- **Muscle fiber / substrate:** enemy-ai.js (_regenerateSubstrate, _depleteLocomotionSubstrate), constants.js (substrate/fiber constants), Muscle-Fiber-Design.md
- **Signals / emission:** signals.js, enemy-ai.js, constants.js, terrain.js
- **Spatial grid / optimization:** enemy-ai.js, constants.js, state.js
- **Sensory / detection:** detection.js, signals.js, constants.js, rendering.js, Sensory-Design.md
- **Cognition / AI behavior:** enemy-ai.js, monsters.js, constants.js, Cognition-Design.md
- **Metabolism / immune (future):** Circulatory-Immune-Design.md, constants.js, monsters.js, combat.js
- **Debug tracking:** enemy-ai.js, monsters.js, rendering.js, main.js
