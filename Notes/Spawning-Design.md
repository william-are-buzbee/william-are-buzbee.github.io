# Spawning & Population Design

## ⚠️ FIRST PASS — PLACEHOLDER SYSTEM

**Everything in the "First Pass" section of this document is a pragmatic placeholder.** It uses hardcoded ratios, simple habitat filtering, and static density caps to produce a map that LOOKS ecologically plausible. It is not ecologically simulated. The creatures are placed, not born. The populations are configured, not emergent.

The eventual system (described in "Long-Term Vision" below) derives population from energy flow — photosynthetic productivity → herbivore carrying capacity → predator carrying capacity. That system would sustain itself over arbitrary simulation length. The first pass will not. It will produce a reasonable starting snapshot that plays well and tests well, nothing more.

**Any code implementing the first pass must be commented with `// FIRST PASS SPAWNING — placeholder, see Spawning-Design.md` so that future sessions immediately recognize it as temporary scaffolding.**

---

## First Pass — Static Density Spawning

### The Problem Being Solved

Current spawning places creatures at random valid coordinates with no consideration of:
- Ecological density (predators and prey at equal numbers)
- Habitat suitability (forest predators spawning on isolated water-adjacent tiles)
- Spatial viability (creatures stranded on single valid tiles surrounded by impassable terrain)
- Spacing (two apex predators spawning 5 tiles apart)
- Grouping (solitary prey in the open — already dead, just doesn't know it yet)

The first pass fixes all five with simple static rules. No simulation, no energy budgets, no reproduction — just a better initial placement.

### Density Ratios

Based on the ~10% trophic transfer efficiency observed in comparable Earth ecosystems. For every unit of habitat, how many of each creature type should exist:

```
Small herbivore (C3):    1 per 8-12 tiles of suitable habitat
Large herbivore (C4):    1 per 25-40 tiles of suitable habitat
Meso-predator (C1):      1 per 100-150 tiles of suitable habitat
Ambush predator (C6):    1 per 120-180 tiles of suitable habitat
Apex predator (C2):      1 per 350-500 tiles of suitable habitat
```

"Suitable habitat" means tiles matching the species' habitat preference (see below). The ratio is per habitat tile, not per total map tile. A map that's 50% forest and 50% water has half the land area for terrestrial creatures.

**These numbers are tuning parameters, not derived values.** They should feel right during play: small grazers are common (you see several on screen regularly), large grazers are present but not everywhere, meso-predators are uncommon (encountering one is a moderate event), apex predators are rare (encountering one is significant). Adjust the ranges during testing to hit that feel.

**The overall population on the map should communicate the food chain visually.** Walking across the world, the player should internalize without being told: there are a lot of small things, fewer big things, and very few predators. The pyramid is visible in the population distribution.

### Habitat Preferences

Each species has preferred terrain types for spawning. These reflect where the species naturally lives, feeds, and shelters.

```
Small herbivore (C3):    grassland, light forest, dirt
                         Avoids: dense forest, deep water, rock
                         Reasoning: open-ground grazer, feeds on photosynthetic mats in open light

Large herbivore (C4):    grassland, mud, shallow water, beach
                         Avoids: dense forest, deep water, rock
                         Reasoning: amphibious grazer, prefers edges between land and water

Meso-predator (C1):      grassland, light forest, dense forest, dirt
                         Avoids: deep water
                         Reasoning: generalist, crosses biome boundaries

Ambush predator (C6):    dense forest, light forest
                         Avoids: open grassland, water, rock, beach
                         Reasoning: cover specialist, needs concealment for ambush strategy

Apex predator (C2):      dense forest, light forest
                         Avoids: open water (can cross grassland but prefers forest)
                         Reasoning: forest apex, hunts under canopy
```

These are simplified habitat masks. The real system (long-term) would derive habitat from body map properties — a creature with high visual concealment on forest tiles "prefers" forest because it survives there, not because a table says so. For the first pass, the table is fine.

### Spawn Viability Check

Before placing a creature, verify the spawn location is viable:

**Connectivity check:** The spawn tile must have at least 6-8 habitat-appropriate tiles within a small radius (5-7 tiles). This prevents stranding a creature on a single valid tile surrounded by water or impassable terrain. If the check fails, reject the spawn location and try another.

This is a simple flood-fill or neighbor count, not a pathfinding operation. It doesn't need to verify that the creature can reach the entire map — just that it has room to move locally.

### Predator Spacing

Predators spawn with minimum distance from other predators of the same species:

```
Meso-predator (C1):      minimum 15-20 tiles from nearest C1
Ambush predator (C6):    minimum 15-20 tiles from nearest C6
Apex predator (C2):      minimum 30-40 tiles from nearest C2
```

This loosely represents territory. Two apex predators 5 tiles apart is ecologically implausible — one would have killed or displaced the other. The spacing enforces a minimum territory size without simulating territory dynamics.

Cross-species spacing is not enforced. A meso-predator near an apex predator is fine — they coexist in real ecosystems (the meso avoids the apex, the apex occasionally eats the meso, but they overlap spatially).

### Prey Grouping

Small herbivores spawn in loose clusters:

```
Small herbivore (C3):    clusters of 3-6 individuals
                         cluster radius: 4-8 tiles
                         minimum distance between cluster centers: 15-25 tiles
```

Pick a valid cluster center, then scatter individuals within the radius on valid habitat tiles. A solitary small herbivore far from any group is ecologically wrong — prey animals group for dilution effect and collective vigilance.

Large herbivores are less social — spawn individually or in pairs, with loose spacing (10-15 tiles minimum between individuals).

### Spawn Order

Spawn in this order to ensure spacing constraints work:

1. **Apex predators first** — fewest individuals, largest spacing requirements. Place them, then build around them.
2. **Ambush predators and meso-predators** — moderate numbers, moderate spacing. Place respecting predator spacing.
3. **Large herbivores** — individual placement with loose spacing.
4. **Small herbivores last** — most numerous, clustered. Fill remaining habitat.

### Active Radius Interaction

The game uses an active simulation radius around the player (ACTIVE_RADIUS ~40 tiles, DORMANT_RADIUS ~45 tiles). Creatures beyond DORMANT_RADIUS are dormant — no AI, no emission, no detection. Spawning should populate the entire map, not just the active radius. Dormant creatures exist as placed data and wake up when the player approaches.

---

## Long-Term Vision — Energy-Budget Ecosystem

**This section describes the eventual replacement for the first pass. None of this is implemented now. It's documented here so the design direction is clear and the first pass is understood as temporary.**

### The Core Idea

Population density is not configured — it emerges from energy flow through the ecosystem. The map has a measurable energy budget. Photosynthetic flora captures stellar energy. Herbivores consume flora. Predators consume herbivores. Each transfer is ~10% efficient. The population the map can sustain falls out of the math.

### Energy Input — Photosynthetic Productivity

Each tile of photosynthetic flora produces energy as a function of:
- Light exposure (open ground > forest edge > deep canopy > underground = zero)
- Flora density/health on the tile
- Season/time (if implemented)

This is the caloric foundation. Total photosynthetic productivity across a region determines how many herbivore-calories that region can support.

### Herbivore Carrying Capacity

Each herbivore species has a metabolic rate (calories consumed per turn to survive). The total herbivore population a region can sustain:

```
maxHerbivores = regionalPhotosyntheticOutput / averageHerbivoreMetabolicRate
```

When herbivore population exceeds carrying capacity, individuals starve. When it's below, the population grows (reproduction). The population oscillates around the carrying capacity — classic predator-prey dynamics.

### Predator Carrying Capacity

Each predator species has a metabolic rate and a kill rate (how often it successfully hunts). The predator population a region can sustain:

```
maxPredators = (herbivorePopulation × averagePreyCalories × killRate) / predatorMetabolicRate
```

Predator populations lag behind prey populations. When prey is abundant, predators thrive and reproduce. When predators overshoot, prey declines, predators starve, predators decline, prey recovers. Lotka-Volterra dynamics emerge from the energy budget.

### Reproduction

Creatures reproduce when metabolic conditions are met — sufficient caloric surplus, body condition above threshold, species-specific reproductive requirements (from the ecology doc: Clade A = sequential hermaphroditism, always sexual; Clade B = simultaneous hermaphroditism + fragmentation).

Offspring spawn near parents on suitable habitat. Juvenile survival rate is low (most die to predation, starvation, or exposure). The reproduction rate and juvenile mortality together determine whether the population is growing, stable, or declining.

### Fecundity and Mortality

Different species have different reproductive strategies:

- **Small herbivores:** High fecundity, high mortality. Many offspring, most die young. Population recovers quickly from crashes.
- **Large herbivores:** Low fecundity, lower mortality. Fewer offspring, better survival. Population recovers slowly.
- **Meso-predators:** Moderate fecundity. Population tracks prey availability with a lag.
- **Apex predators:** Very low fecundity. Population responds slowly to ecosystem changes. Vulnerable to local extinction if prey crashes.

### The Sustainability Test

The ultimate test of the ecosystem simulation: can it sustain itself indefinitely without manual intervention? Start a world, leave it running for 10,000 turns. Do populations oscillate around stable levels? Does any species go extinct? Do predator-prey cycles emerge naturally? If yes, the ecosystem is self-sustaining. If a species consistently crashes to zero, the energy budget or reproductive parameters need adjustment.

This test is not possible with the first pass system. It requires reproduction, mortality, and energy flow — none of which exist yet. The first pass places a plausible snapshot; the long-term system generates a living ecosystem.

### Prerequisites

The energy-budget ecosystem requires systems that don't exist yet:

- **Metabolism system** — creatures consume calories, burn them through activity, starve without them. (Partially exists via substrate/fiber system, but not caloric.)
- **Reproduction system** — creatures produce offspring under metabolic conditions. (Not implemented.)
- **Flora as a dynamic resource** — photosynthetic mats can be depleted by grazing and regrow over time. (Flora is currently static terrain.)
- **Death from starvation** — creatures that can't find enough food die. (Not implemented — current death is only from combat/blood loss.)
- **Population tracking** — per-region population counts by species, compared against carrying capacity. (Not implemented.)

Each of these is a significant system. The energy-budget ecosystem is a long-term convergence of multiple systems, not a single implementation task.

---

## Prompt Reference

When implementing spawning, include this document so the session knows:
- The first pass is explicitly a placeholder with hardcoded ratios
- All first pass code must be commented as placeholder
- Density ratios are tuning parameters, not derived values
- Habitat preferences are table-based, not body-map-derived
- Spawn viability requires local connectivity check
- Predators need spacing, prey need clustering
- The long-term system is energy-budget-driven with emergent population dynamics
- The long-term system requires metabolism, reproduction, dynamic flora, and starvation mechanics — none of which exist yet
