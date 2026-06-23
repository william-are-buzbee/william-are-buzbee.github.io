# Chemical Scent System — Design Document

Design reference for the dynamic scent system that models volatile chemical transport across the world map. Describes two physically distinct scent layers (ground-deposited trails and airborne plumes), wind interaction, terrain effects, creature emission, and how the existing per-zone chemical transducers detect these signals.

Include alongside Sensory-Design.md, Ambient-Terrain-Sensing-Design.md, Per-Eye-Visual-Field-Design.md, and Design-Principles.md when working on chemical sensing, AI behavior, detection, tracking, or stealth.

---

## Why Two Layers

A creature moving through the world produces two chemically distinct signatures that travel through completely different physical media, obey different physics, and decay on different timescales. The scent system must model them separately because they provide different information to different transducers.

### Ground Scent

When a creature walks, it deposits chemicals directly onto the substrate surface. Skin oils, footpad secretions, cuticle compounds, crushed vegetation, shed cells. These molecules adsorb onto the ground surface — they are physically stuck to the tile. The result is a trail that marks the exact path the creature walked, tile by tile, like footprints in mud.

**Physics:** Not affected by wind (stuck to the ground). Does not spread to neighboring tiles (it's adsorbed, not airborne). Decays slowly — hours to days on Earth, depending on substrate. The molecules gradually evaporate from the surface, break down under UV light, or get absorbed into the substrate. Rain washes ground scent away quickly.

**Detection:** Contact chemical transducers (touching the ground with a limb or antennae). Also detectable at very close range (1-2 tiles) by airborne transducers, because the deposited chemicals slowly volatilize from the surface. A dog following a track has its nose inches from the ground — it's detecting the evaporation layer directly above the deposited trail.

**Information provided:** Where the creature was. The exact path, tile by tile. The direction of travel (trail is fresher at one end). How long ago it passed (trail age/freshness). What kind of creature it was (species-specific metabolic volatiles). Whether it was wounded (blood deposited along the trail).

### Airborne Scent

A creature's body continuously releases volatile compounds into the air through respiration, skin/cuticle evaporation, and metabolic waste gases. These molecules enter the atmosphere and are transported by air movement.

**Physics:** Pushed by wind (advection). Mixes into surrounding air (turbulent spreading, modeled as diffusion). Decays rapidly — minutes, as the volatiles disperse vertically and dilute below detection threshold. Not tied to the creature's path — tied to the wind. A creature standing still produces a plume that extends downwind. Once the creature moves away, the plume at the old location dissipates within a few turns.

**Detection:** Airborne chemical transducers. Range depends on wind speed and transducer quality. Directional information comes from the wind vector, not from the scent gradient itself — bilateral nostril comparison only works at centimeter distances. When a creature detects airborne scent, it knows the source is upwind, because that's the only direction scent can arrive from.

**Information provided:** Something is upwind of you right now (or was very recently). What kind of creature it is. How strong the signal is (which correlates loosely with distance and source intensity, but wind and terrain confound the relationship). NOT where the creature was — where the wind carried its scent.

### Why the Distinction Matters for Gameplay

A prowler tracking prey uses both layers differently:

It detects the airborne plume first — "herbivore scent from the northeast, wind is blowing southwest, so the prey is northeast of me." It moves northeast. As it gets closer, the airborne signal gets stronger but still doesn't reveal the exact position — wind creates a cone of possibility, not a line.

Then it cuts across the ground trail — specific tiles with deposited scent. Now it has exact path information. It follows the trail in the direction of freshening scent (trail gets newer/stronger). It doesn't need to smell the air anymore — the ground tells it exactly where the prey walked.

A hare can't detect airborne plumes (zero airborne chemical transducers on all zones). But it CAN detect ground trails through contact chemistry on its forelimbs (quality 2). If the hare walks over a prowler's ground trail, it knows a predator was here. It doesn't know where the predator IS — just where it WAS. Different information, different survival response (heightened alertness, change of path, rather than targeted flight).

---

## Scent Channels

Each scent entry (ground or airborne) carries typed volatile information. The types correspond to broad molecular classes that different receptor families detect independently.

### Metabolic Predator

Volatile byproducts of carnivorous metabolism — ketones, sulfur compounds, protein breakdown products. Emitted by any creature that eats meat (wolf, dire wolf, lurker, ambush predator). The signature is continuous: as long as the creature is alive and metabolically active, it produces these volatiles.

### Metabolic Herbivore

Volatile byproducts of plant/fungal metabolism — different ketone ratios, fermentation products, plant-derived compounds passing through the digestive system. Emitted by grazers (hare, shaleback). Distinguishable from predator metabolism by a different receptor family.

### Blood

Hemolymph and tissue-damage volatiles. Emitted only when a creature is wounded (bleeding, recent zone damage). Strong signal — blood is chemically intense. Iron (or copper, in these alien hemocyanin-based organisms) compounds are highly volatile and distinctive. Both layers carry blood scent: the creature bleeds onto the ground (deposited trail of blood) and into the air (aerosolized blood volatiles).

### Future Channels (Not Implemented Now)

**Stress/Alarm** — alarm pheromones released during flight or combat. On Earth, many prey species produce volatile alarm substances that warn conspecifics. Would require the endocrine system to trigger emission during stress states.

**Carrion/Decay** — decomposition volatiles from dead creatures. Attracts scavengers. Persistent and strong.

**Reproductive** — pheromones related to mating state. Not relevant to current gameplay.

---

## Emission

Every living creature emits scent every turn. The emission amount and channel depend on the creature's body, state, and activity.

### Ground Scent Deposition

Each turn, the creature deposits ground scent at its current tile (if it moved or is standing):

```
groundDeposit = bodyMass × GROUND_EMISSION_BASE × activityMultiplier
```

**bodyMass:** Larger creatures deposit more. A 200 kg shaleback leaves a much stronger trail than a 5 kg hare. This is physically obvious — bigger body, more surface area, more secretions.

**activityMultiplier:** Moving creatures deposit more than stationary ones. Walking = 1.0 (footfalls, substrate contact). Resting = 0.3 (some body contact with ground). Fleeing = 1.5 (heavier footfalls, stress sweating equivalent). This reflects ground contact intensity.

**Channel:** The creature's diet determines the metabolic channel (predator or herbivore). Blood is deposited additionally if the creature is wounded, proportional to wound severity.

### Airborne Scent Emission

Each turn, the creature adds airborne scent at its current tile:

```
airborneEmission = bodyMass × AIRBORNE_EMISSION_BASE × activityMultiplier × respirationFactor
```

**respirationFactor:** Faster breathing = more volatile output. Resting = 0.5. Walking = 1.0. Fleeing/fighting = 2.5 (panting, heavy metabolic load). This is the primary modulator — a sprinting prowler pumps out far more airborne scent than a resting one.

**Channel and blood:** Same as ground deposition.

### Emission Constants (Tunable)

```
GROUND_EMISSION_BASE    = 0.02    // ground scent deposited per kg body mass per turn
AIRBORNE_EMISSION_BASE  = 0.01   // airborne scent emitted per kg body mass per turn
BLOOD_EMISSION_MULT     = 5.0     // multiplier on blood channel emission when wounded
```

Example — prowler (22 kg) walking:
- Ground: 22 × 0.02 × 1.0 = 0.44 per turn deposited at current tile
- Airborne: 22 × 0.01 × 1.0 = 0.22 per turn emitted at current tile

Example — hare (5 kg) fleeing:
- Ground: 5 × 0.02 × 1.5 = 0.15 per turn
- Airborne: 5 × 0.01 × 2.5 = 0.125 per turn

Larger creatures leave stronger scent. More active creatures leave stronger scent. Both physically correct.

---

## Ground Layer Mechanics

The ground layer is simple: deposit and decay. No spreading, no wind interaction.

### Per-Turn Update

```
For each tile with ground scent:
  tile.scent[channel] *= groundDecayRate    // fade over time
  if tile.scent[channel] < SCENT_FLOOR:
    remove this channel from the tile       // cleanup for performance
```

### Terrain-Dependent Decay Rates

The substrate affects how quickly deposited scent breaks down:

| Substrate | Decay Rate (per turn) | Reasoning |
|---|---|---|
| Rock / stone floor | 0.985 | Non-porous, scent sits on surface, slow evaporation |
| Packed earth / firm soil | 0.970 | Moderate absorption into soil |
| Grassland (soil + vegetation) | 0.965 | Vegetation absorbs some, moderate persistence |
| Forest floor (leaf litter) | 0.955 | Organic material absorbs and masks |
| Sand | 0.920 | Porous, dry, rapid absorption and dispersal |
| Water | 0.0 | Instant dissolution — scent does not persist on water |

At decay rate 0.970 (packed earth), a deposited scent of 0.44 (prowler walking):
- After 10 turns: 0.44 × 0.970^10 = 0.33
- After 50 turns: 0.44 × 0.970^50 = 0.10
- After 100 turns: 0.44 × 0.970^100 = 0.02
- Below threshold (~150 turns): effectively gone

A prowler's ground trail on firm soil lasts roughly 100-150 turns. On rock, longer. On sand, much shorter. On water, nonexistent. This maps well to ecological expectations — a tracker following a trail on good substrate can follow a trail that's an hour old. On sand, the trail fades within minutes.

### Trail Freshness

Each ground scent entry tracks an `age` counter (incremented each turn). This allows a tracking creature to determine trail direction — the fresher end of the trail is the direction the prey went. Age is distinct from concentration: a large creature's old trail might have higher concentration than a small creature's fresh trail, but the age tells you which end is newer.

```
tile.groundScent = {
  predator: 0.33,
  herbivore: 0.0,
  blood: 0.0,
  age: 47    // turns since deposition
}
```

---

## Airborne Layer Mechanics

The airborne layer is dynamic: emit, advect, spread, decay. Every turn, the entire layer shifts and changes.

### Per-Turn Update Order

The order matters. Each turn:

1. **Emit** — add scent at each creature's current position
2. **Advect** — shift scent downwind based on wind speed
3. **Spread** — each tile shares a fraction with neighbors (turbulent mixing)
4. **Decay** — all values reduced by airborne decay rate

### Advection (Wind Transport)

Wind has a direction and speed. Each turn, a fraction of each tile's airborne scent is moved to the downwind neighbor tile:

```
advectionFraction = windSpeed × ADVECTION_RATE

For each tile with airborne scent (process upwind-to-downwind to avoid cascading):
  moved = tile.scent[channel] × advectionFraction
  tile.scent[channel] -= moved
  downwindTile.scent[channel] += moved
```

**ADVECTION_RATE** ≈ 0.35 per unit wind speed. At wind speed 1 (light breeze), 35% of each tile's scent moves downwind per turn. At speed 2 (moderate), 70%. At speed 0 (still), none — scent pools around the source.

Processing order: iterate tiles from upwind to downwind so that moved scent doesn't cascade in the same turn. Alternatively, use a double-buffer (read from current, write to next) to avoid order dependency.

Wind direction maps to a neighboring tile offset. Wind from the west (blowing east) means scent moves to the tile at (x+1, y). Diagonal wind (from the northwest) moves to (x+1, y+1). Eight discrete wind directions matching the eight compass directions.

### Spreading (Turbulent Mixing Proxy)

After advection, remaining scent on each tile spreads to all walkable neighbors equally:

```
spreadFraction = SPREAD_RATE    // e.g., 0.15

For each tile with airborne scent:
  shared = tile.scent[channel] × spreadFraction
  walkableNeighbors = count of adjacent walkable tiles
  perNeighbor = shared / walkableNeighbors
  tile.scent[channel] -= shared
  for each walkable neighbor:
    neighbor.scent[channel] += perNeighbor
```

This creates the lateral spread of a plume — it doesn't just travel straight downwind, it widens. The combination of advection (directional push) and spreading (omnidirectional mixing) produces a plume shape: narrow near the source, widening downwind. Physically this is a crude approximation of turbulent dispersion, but it produces the right macroscopic shape.

Walls and non-walkable tiles block spreading — scent doesn't pass through solid obstacles. This creates scent shadows behind walls, which is physically correct (buildings block wind and scent transport).

### Airborne Decay

```
For each tile with airborne scent:
  tile.scent[channel] *= AIRBORNE_DECAY_RATE    // e.g., 0.80 per turn
  if tile.scent[channel] < SCENT_FLOOR:
    remove channel
```

At decay rate 0.80, airborne scent dissipates rapidly:
- After 5 turns: 0.33 (33% remaining)
- After 10 turns: 0.11 (11%)
- After 15 turns: 0.035 (below most detection thresholds)
- After 20 turns: 0.012 (effectively gone)

A stationary source maintains a plume because it keeps emitting. The plume extends downwind as far as the advection carries scent before it decays below threshold. A source that moves away stops emitting at its old position and the plume there dissipates within 10-15 turns. This creates the correct behavior: you smell a creature's plume when it's upwind right now (or was very recently), not when it was upwind 50 turns ago.

### Terrain Effects on Airborne Transport

| Terrain | Advection Modifier | Spread Modifier | Reasoning |
|---|---|---|---|
| Open grassland | 1.0 | 1.0 | Unobstructed airflow |
| Savanna / light scrub | 0.8 | 1.0 | Slight wind reduction |
| Forest / mushforest | 0.3 | 0.6 | Canopy drastically reduces wind; scent pools under trees |
| Cave / underground | 0.05 | 0.3 | Near-stagnant air; scent pools in chambers and corridors |
| Open water surface | 1.2 | 1.1 | Wind accelerates over flat water |

In forest, scent advection is heavily reduced — the canopy blocks wind. But scent still pools (spreading at 0.6 rate), creating a concentrated local cloud around the source. A predator in a forest is harder to detect from far away (reduced plume length) but creates a strong local scent cloud. A prey animal entering that cloud gets a sudden strong signal with no wind-based directional cue (wind is blocked by canopy) — it knows a predator is nearby but not which direction. Tactically terrifying, and physically accurate.

In caves, scent barely moves at all. It pools in chambers and seeps slowly through corridors. Cave scent is old, mixed, and directionless. A creature in a cave might smell predator scent that pooled from a creature that passed through 50 turns ago, with no way to know how old it is (because the scent hasn't dispersed much due to stagnant air).

---

## Wind System

### Global Wind State

The world has a global wind direction and speed that affects all tiles on the surface layer:

```
windDirection: 0-7 (corresponding to 8 compass directions)
windSpeed: 0 (still) | 1 (light breeze) | 2 (moderate) | 3 (strong)
```

Wind direction maps to a tile offset for advection: direction 0 = east (+1,0), direction 1 = southeast (+1,+1), etc.

### Wind Changes Over Time

Wind shifts gradually. Each turn, there's a small chance of direction shift and speed change:

```
directionShiftChance = 0.03 per turn (shift ±1 compass direction)
speedChangeChance = 0.05 per turn (change ±1 speed level)
```

This produces slow, natural wind variation — the wind from the northeast gradually shifts to the north over many turns, with occasional speed changes. Gusts and calms emerge from the stochastic speed changes.

### Underground Wind

Underground layers have effectively zero wind speed. Scent transport in caves is almost entirely spreading (slow omnidirectional creep) with minimal advection. Corridor geometry dominates — scent follows corridors because it can only spread to walkable tiles.

### Future Enhancements (Not Now)

**Local wind shadows** — large terrain features (hills, buildings, dense forest patches) creating zones of reduced wind on their lee side. This would make terrain tactically important for scent concealment.

**Updrafts and thermals** — vertical air movement over sun-warmed ground, carrying scent upward faster. Would reduce surface-level scent concentration during hot parts of the day.

**Weather integration** — rain reducing airborne scent (water droplets absorb volatiles), storms increasing wind speed dramatically.

---

## Detection

### How Chemical Transducers Read the Scent Map

A creature's chemical transducers don't "see" the scent map spatially. They sample the scent concentration at specific tiles based on their coupling medium:

**Contact transducers (chemical.contact):** Read the ground scent layer at the creature's current tile only. The creature must physically be on the tile to detect deposited scent. This is nose-to-ground tracking. The transducer quality determines the minimum detectable ground scent concentration:

```
detectionThreshold = SCENT_FLOOR / contactQuality
```

A quality-2 contact transducer (hare forelimbs) detects ground scent above ~0.005. A quality-4 contact transducer detects above ~0.0025 — older, fainter trails become visible.

**Airborne transducers (chemical.airborne):** Read the airborne scent layer at the creature's current tile and potentially 1-2 neighboring tiles. The transducer quality determines the minimum detectable airborne concentration:

```
detectionThreshold = SCENT_FLOOR / airborneQuality
```

A quality-6 airborne transducer (wolf head) detects airborne scent above ~0.0017 — extremely sensitive, picks up faint plumes from far sources. A quality-0 (hare — no airborne transducers) detects nothing.

### Directionality

**Airborne detections:** Direction comes from the current wind vector, not from the scent gradient. When a creature detects airborne scent, the system reports: "predator metabolic scent detected, intensity [value], wind from [direction]." The creature infers the source is upwind. In still air (wind speed 0), no directional information is available — the scent pooled omnidirectionally. The detection is "predator metabolic scent detected, intensity [value], no directional cue."

**Ground trail detections:** Direction comes from trail freshness gradient. When a creature detects ground scent, it can compare the age of the scent at its current tile with the age at adjacent tiles (if they also have ground scent). The fresher direction is the direction the source traveled. If multiple adjacent tiles have ground scent, the creature can infer the trail direction.

### What Transducers Tell the Creature

This is a detection event, not a map. The creature's AI (or the player's UI) receives:

```
{
  channel: 'metabolic_predator',
  intensity: 0.23,                // concentration at detection tile
  source: 'airborne' | 'ground',  // which layer produced the detection
  windDirection: 3,                // compass direction wind is blowing FROM (airborne only)
  trailAge: 47,                    // turns since deposition (ground only)
  trailFreshensToward: 'NE',       // direction trail gets fresher (ground only, if determinable)
}
```

The player UI could render this as a faint scent indicator at the edge of the screen in the upwind direction (airborne), or as highlighted tiles showing the ground trail (ground).

---

## Sparse Data Structures

### Ground Scent Map

```
groundScent[layer] = Map<string, { predator, herbivore, blood, age }>
```

Key: `"x,y"` string (matching the existing tile key format). Only tiles with nonzero scent have entries. Tiles are removed when all channels fall below `SCENT_FLOOR`. Typical active size: a few hundred tiles near creature paths.

### Airborne Scent Map

```
airborneScent[layer] = Map<string, { predator, herbivore, blood }>
```

Same key format. Tiles removed when all channels below threshold. Typical active size: a few hundred tiles near creature positions and downwind plumes.

### Performance

Per-turn computation:
1. Emission: O(N creatures) — constant per creature
2. Ground decay: O(G ground tiles with scent) — one multiply per channel per tile
3. Airborne advection: O(A airborne tiles with scent) — one transfer per tile
4. Airborne spreading: O(A × 8) — check each neighbor per tile
5. Airborne decay: O(A) — one multiply per channel per tile
6. Cleanup: O(G + A) — remove below-threshold tiles

With ~20 creatures and plumes of ~100-200 tiles each, total per-turn cost is a few thousand operations — negligible.

---

## Relationship to Existing Systems

### Ambient Terrain Sensing (Ambient-Terrain-Sensing-Design.md)

Ambient terrain sensing uses the creature's airborne chemical transducer quality to compute a static ambient radius for terrain type awareness. The scent system is separate and additive — it provides dynamic creature-scent information on top of the static terrain-volatile awareness. The ambient radius tells you "the terrain to the north smells like grassland." The scent system tells you "there's predator metabolic scent in the air, blowing from the north."

### Entity Detection (Sensory-Design.md)

The current entity detection system computes per-zone detection ranges using the SNR formula. The scent system provides a different detection pathway: instead of "is there a creature at tile X,Y that my transducer can detect," it provides "is there creature-scent at MY tile that my transducer can detect." The information is less precise (you don't know the source's exact location, only that it's upwind or that its trail passes through this tile) but potentially longer range (scent plumes can extend far downwind).

The scent system does NOT replace entity detection. It supplements it. A creature might detect a predator's scent plume from 30 tiles downwind, giving it early warning, then detect the predator visually at 10 tiles for precise identification and location.

### Body Map (Design-Principles.md)

Scent emission is downstream of the body map: body mass determines emission amount, wound state determines blood emission, metabolic type (predator/herbivore) comes from species diet. Scent detection is per-zone: contact chemical transducers on specific zones detect ground trails, airborne transducers detect airborne plumes. Zone destruction removes that zone's detection capability. The scent system is fully physically grounded in the body map.

### Endocrine System (Endocrine-Design.md)

Future integration: stress hormones could modulate scent emission (stressed creatures emit more volatiles — "the smell of fear" is real, caused by apocrine gland activation under adrenaline). An adrenalized creature's emission would increase, making it more detectable by scent while it flees. This creates a physically grounded trade-off: fleeing is fast but makes you smellier.

---

## Implementation Order

1. **Data structures and emission.** Create the ground and airborne scent maps. Hook emission into the creature turn loop. Verify that creatures leave ground trails and emit airborne scent at their positions.

2. **Ground layer decay.** Apply per-turn decay to ground scent with terrain-specific rates. Verify that trails fade over the correct timescale.

3. **Airborne layer: advection + spread + decay.** Add the wind state. Implement the three-step airborne update. Verify that plumes form downwind of stationary sources, extend with wind speed, and dissipate after the source moves.

4. **Detection.** Connect the scent maps to the player's chemical transducers. Fire detection events when the player's contact or airborne transducers detect above-threshold scent at their position. Report direction from wind (airborne) or trail freshness (ground).

5. **Player rendering.** Show scent detections on the UI — directional indicators for airborne scent, highlighted trail tiles for ground scent.

6. **NPC AI.** NPC predators follow airborne plumes upwind and ground trails by freshness. NPC prey detect predator scent and respond with heightened alertness or flight.

---

## What This Document Does NOT Cover

- **Rendering of scent information** — how the player sees/reads scent detections on screen. Separate UI design decision.
- **NPC scent-tracking AI** — how predator AI uses scent to hunt. Depends on the cognition system.
- **Stress/alarm pheromones** — depends on endocrine system integration.
- **Carrion scent** — depends on death/decay system.
- **Scent camouflage / masking** — creatures concealing their scent with environmental chemicals. Future behavioral system.
- **Rain and weather effects** — washing ground trails, reducing airborne transport. Future weather system.
- **Pheromone communication** — creatures deliberately emitting chemical signals. Future behavioral system.

---

## Implementation Status

**Designed (this document):** Two-layer scent system — ground trails, airborne plumes, wind-driven transport, terrain effects, per-channel emission, transducer-based detection.

**Ready to implement:** Ground layer (deposit + decay), airborne layer (emit + advect + spread + decay), wind state, sparse data structures. Detection hookup and rendering as follow-up prompts.

**Deferred:** NPC scent tracking AI, stress pheromones, carrion scent, weather effects, scent masking, pheromone communication.
