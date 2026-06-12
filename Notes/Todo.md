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
- [x] Second-pass over perception/transducer system

## Up Next
- [ ] Second-pass over AI drive system

## Near-Term Plans (no particular order at the moment)
- [ ] Second-pass over bleed/metabolism/healing mechanic
- [ ] Third-pass over AI drive system
- [ ] Third-pass over bleed/metabolism/healing
- [ ] Third-pass over cognition/ganglia system

## Long-Term Plans
- [ ] Aquatic Ecosystems
- [ ] Sub-terranian ecosystem
- [ ] AI overhaul (complex creature behavior based on instincts, body plan and evolutionary principles)

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
- Relevant design documents (Body-Sim-Design, Surface-Creatures, Stat-System-Design, Ecology-Foundations, Mutation-Design, Lore)
- Key utility signatures (worldDims returns array, getFeature returns by reference, etc.)
- Known bugs and what causes them
- What NOT to change

### Known Gotchas
- **Save bloat:** Any new per-turn transient fields on creatures must be added to the TRANSIENT_FIELDS array in save-load.js or saves will exceed localStorage quota
- **Vibration transducers are objects:** `zone.transducers.vibration` is `{ ground, air, water }`, not a single number. Any code reading it as a number will break.
- **Player must inherit template fields:** When new fields are added to creature templates (monsters.js), the species selection path (chargen.js) must copy them to the player or the AI will not evaluate the player correctly
- **Integration capacity is recomputed each turn:** Don't persist it. Zone destruction changes tier in real time.

### Typical File Sets
- **Biome/terrain work:** surface-gen.js, constants.js, terrain.js
- **Enemy AI / drives / behavior:** enemy-ai.js, monsters.js, combat.js, terrain.js, signals.js
- **Perception / detection:** enemy-ai.js, signals.js, constants.js, fov.js, time-cycle.js, terrain.js
- **Movement/combat:** player-actions.js, combat.js, enemy-ai.js, state.js
- **Transitions:** world-gen.js, interactions.js, state.js, world-state.js
- **Rendering:** rendering.js, sprites.js, terrain.js, constants.js
- **Spawning:** world-logic.js, monsters.js, surface-gen.js or underground-gen.js
- **FOV/vision:** fov.js, player.js, rendering.js, terrain.js, time-cycle.js, state.js
- **Facing/turning:** player-actions.js, enemy-ai.js, fov.js, main.js, state.js
- **Underground:** underground-gen.js, world-gen.js, constants.js, terrain.js
- **Shops/economy:** interactions.js, items.js, player.js, ui.js, modal.js, constants.js
- **NPCs/structures:** world-logic.js, surface-gen.js, constants.js, interactions.js, terrain.js, sprites.js
- **Chargen/attributes:** chargen.js, player.js, constants.js, main.js, index.html, state.js
- **UI/layout:** index.html, ui.js, main.js, rendering.js, constants.js
- **Save/load:** save-load.js, state.js, chargen.js, interactions.js
- **Input/controls:** main.js, player-actions.js, constants.js
- **Body map / creatures:** constants.js, monsters.js, combat.js, Body-Sim-Design.md, Surface-Creatures.md
- **Signals / emission:** signals.js, enemy-ai.js, constants.js, terrain.js
