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
- [x] Implemented a temporary "Size" and "Strength" system that roughly reflects total mass and total muscle mass % (relative to total mass in kg) to help current build reflect size disparities & how that should affect damage

## Up Next
- [ ] Implement the next phase of the 3d body plan, of which there will be many rounds

## Near-Term Plans
- [ ] Implement necesary AI changes (most animals will eat corpses they run into, herbivores have to actually forage and eat plants, eating takes time, implement sleeping, implement basic intimidation logic, etc)
- [ ] Implement basic sensory abilities (visual map for chemical sense, tremor/AOE around player for vibration)
- [ ] Playtest gameplay with the 3d body plan functioning as multiple different animals/niches

## Long-Term Plans
- [ ] Implement underground generation of new floors and cave systems 
- [ ] Historical record overhaul (canon events across history, inventions, demigod interventions, factions, major events, wars, etc)
- [ ] "Modernity" as a concept (religion, trade, communication, animals with complex sapience or similar level of societal complexity)
- [ ] Build functional underground ecosystem on parity with surface (in terms of complexity and thoroughness, not fully complete though) 
- [ ] AI overhaul (complex creature behavior based on instincts, body plan and evolutionary principles)

## Very Long-Term Plans
- [ ] World editing (base building, tree cutting, ore mining, wall destroying, village creating, etc)
- [ ] Follower system (unclear if pet system, follower system or more of a niche possibility) 
- [ ] Online interactivity (ability to share worlds and upload them, spectate, view/enter leaderboards, chat with other players/spectators, shared saves, etc)

## Prompt Reference
For new chats, include:
- Only the files that touch the system being changed
- Key utility signatures (worldDims returns array, getFeature returns by reference, etc.)
- Known bugs and what causes them
- What NOT to change

Typical file sets:
- **Biome/terrain work:** surface-gen.js, constants.js, terrain.js
- **Enemy AI:** enemy-ai.js, monsters.js, combat.js, terrain.js
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
