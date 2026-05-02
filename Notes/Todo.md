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

## Up Next
- [ ] Increase biome variety, like light or dense forest
- [ ] Underground generation improvements
- [ ] Surface buildings with walls
- [ ] Underground biome leakage mirrors surface (sample surface atmosphere at each coordinate, proportional bleed)

## Ideas (not yet scoped)
- [ ] Creature taxonomy (design lineage-based tags, replace or reskin enemy roster)
- [ ] Stealth visual rework (desaturation instead of dimming, coexists with night tint)
- [ ] Compass UI for day/night time display
- [ ] Replay system (record seed + inputs for spectate-like playback)
- [ ] Custom creature taxonomy based on demigod lore (survivor lineages, body plan tags)
- [ ] Environmental storytelling moments (silent protagonist, world reacts to player)
- [ ] Encounter with the demigod (or evidence of them)
- [ ] Enemy AI overhaul — general (patrol, flee at low HP, pack behavior, passive until attacked)
- [ ] More structure types (goblin camps, witch huts, mushroom rings, ponds, bone piles)
- [ ] Town NPC dialogue that hints at demigod lore (contradicting folk tales between towns)
- [ ] Underground as geological history (deeper = older phase, stranger creatures)
- [ ] Fossil/artifact system (discoverable evidence of Phase 1 experiments)
- [ ] Server-based features (leaderboards, shared saves) — way later
- [ ] Custom domain for GitHub Pages

## Prompt Reference
For new chats, include:
- Only the files that touch the system being changed
- Key utility signatures (worldDims returns array, getFeature returns by reference, etc.)
- Known bugs and what causes them
- What NOT to change

Typical file sets:
- **Biome/terrain work:** surface-gen.js, constants.js, terrain.js
- **Enemy AI:** enemy-ai.js, monsters.js, combat.js, terrain.js
- **Movement/combat:** player-actions.js, combat.js, enemy-ai.js
- **Transitions:** world-gen.js, interactions.js, state.js, world-state.js
- **Rendering:** rendering.js, sprites.js, terrain.js, constants.js
- **Spawning:** world-logic.js, monsters.js, surface-gen.js or underground-gen.js
