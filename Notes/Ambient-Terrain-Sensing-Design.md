# Ambient Terrain Sensing — Design Document

Design reference for the ambient terrain sensing system. Describes how creatures passively know the terrain around them through multiple sensory channels, without needing to sweep their directed visual field across every tile. This document captures extended discussion about the biological basis for ambient awareness, how each sense contributes, and how it maps to the existing per-zone transducer model.

Include alongside Sensory-Design.md, Cognition-Design.md, and Design-Principles.md when working on FOV, sensory rendering, exploration, or perception systems.

---

## The Problem This System Solves

The game currently treats the world as unknown until visually confirmed, tile by tile. The player's directed visual cone (the FOV) is the only mechanism that reveals terrain. Every tile outside the cone is black until the player sweeps their gaze across it. This produces a "pressure washer" play experience — the player compulsively rotates to uncover the map — and it misrepresents the creature's actual sensory experience.

A hare standing in open grassland does not experience the world as a narrow spotlight of knowledge surrounded by void. Its chemical transducers (where present) detect volatile signatures from surrounding biomes. Its vibration transducers (quality 3-5 across its many limbs) read substrate character in all directions through ground-propagated waves. Its visual system (quality 4 with 170° foveal cone on the head) registers terrain in a wide arc. Between these channels, the creature passively knows what the terrain is around it — grassland continuing in all directions, a treeline to the west, a rocky outcrop ahead — without needing to look at each tile individually.

The directed visual FOV remains the high-fidelity, entity-revealing sense. Ambient terrain sensing reveals terrain type in a radius around the creature through the combined contribution of all sensory channels. Entities (other creatures) are NOT revealed by ambient sensing — detecting entities requires the existing per-zone entity detection system (Sensory-Design.md). Ambient sensing answers "what is the ground like around me?" not "is anything moving out there?"

---

## Physical Grounding

### Terrain Signals Are Real

Every biome produces physical signals that propagate through the environment. These are not abstractions — they are molecules, photons, and mechanical waves that actually exist in the medium.

**Chemical signals.** Vegetation emits volatile organic compounds — terpenoids, phenolics, green-leaf volatiles — that diffuse into the air. Different biome types produce distinct volatile profiles. Grassland, forest, wetland, exposed rock, and water each have characteristic chemical signatures. These molecules are physically present in the air at decreasing concentration with distance from their source. A creature with airborne chemical transducers detects these volatiles the same way it detects predator metabolism volatiles — the receptors don't distinguish "terrain chemical" from "creature chemical." They bind to molecules.

**Vibration signals.** Every substrate has resonance and propagation properties. Hard rock transmits vibration cleanly over long distances. Soil dampens it faster. Sand absorbs it rapidly. Water boundaries create impedance mismatches that reflect vibration back. A creature standing on any surface receives constant substrate-borne vibration from ambient sources (wind-driven surface movement, geological micro-tremors, water flow, its own footfalls reflecting off substrate transitions). The character of these vibrations tells the creature about the ground around it — not a spatial map, but a physical characterization: "the substrate is consistent" vs. "there's an impedance change in that direction."

**Visual signals.** Reflected light from the environment reaches the creature's visual transducers from a wide arc. The high-acuity foveal zone (the directed gaze) resolves fine detail in a narrow cone. The peripheral visual field covers a much wider arc at low acuity — sufficient to register terrain type (color, texture, vegetation density, openness) without resolving entities or detail. Peripheral vision is a physical consequence of the eye's optics and the retina's receptor distribution, not a cognitive ability.

### The Transducer IS the Pattern Library for Terrain

Identifying terrain from raw sensory signals requires pattern matching — mapping "this volatile profile" to "grassland" or "this vibration propagation pattern" to "rocky substrate." In the general case, pattern matching requires a pattern library stored in neural tissue (Sensory-Design.md, section "Pattern Libraries Are Physically Located").

For terrain sensing specifically, the pattern library is implicit in the transducer's evolutionary tuning. Chemical receptors are proteins with binding pockets shaped to specific molecular classes. A receptor that binds terpenoids IS a pattern matcher for "vegetation present" — the binding event itself is the recognition. The "library" is encoded in protein structure, shaped by millions of generations of evolutionary exposure to these terrain types. Every individual of the species inherits the same receptor tuning for terrain-relevant signals.

This is distinct from entity identification. Recognizing that a specific volatile cocktail means "prowler, wounded, moving fast" requires complex pattern matching against learned or innately encoded templates stored in neural tissue (ganglia, coordinating centers). That pattern matching depends on the pattern library system (designed but not yet implemented). Terrain recognition does not — the transducer's receptor sensitivity handles it at the hardware level.

**Consequence:** Ambient terrain sensing is physically grounded in transducer properties alone. If a transducer zone is destroyed, that channel's contribution to ambient awareness degrades. If all transducer zones for a channel are destroyed, that channel goes dark. No abstract "awareness" stat, no pattern library dependency. Just transducers detecting what their receptors are built to detect.

**Future extension:** When the pattern library system is built, it can add a refinement layer. A creature encountering a terrain type it has never evolved to recognize (a biome from a different world, a novel artificial material) might detect a signal through its transducers but fail to match it to a terrain type — "I smell something unfamiliar" rather than "I smell wetland." The ambient sensing system would mark the tile as "detected but unrecognized." This is a clean extension, not a redesign.

---

## How Each Channel Contributes

### Visual Peripheral Field

The creature's visual transducers (on zones with `visual > 0`) have a directed foveal cone (the existing FOV system, using `coneAngle` from the species vision profile) and a peripheral field that extends beyond that cone.

**Physical basis.** Eye placement determines peripheral arc. Prey animals with laterally placed eyes (hare: coneAngle 170° foveal) have nearly 360° total visual field — the peripheral arc covers the remaining ~190° at low acuity. Predators with forward-facing eyes (wolf: coneAngle 90° foveal) have a narrower total field — maybe 220-240° total, with ~130-150° of peripheral arc.

**What peripheral vision reveals.** Terrain type at coarse resolution. Ground color, vegetation density, openness, large terrain features (water, rock formations, biome boundaries). NOT entities — entities require foveal acuity for recognition and are handled by the entity detection system.

**Range.** Shorter than foveal range because peripheral acuity is lower. Approximately 60-70% of the creature's visual detection range. Limited by line-of-sight — peripheral vision still requires photons, still blocked by walls, hills, dense vegetation.

**Requires light.** In caves without a light source, or at night without dark-adapted vision, the peripheral visual radius collapses toward zero. Visual ambient sensing is a surface-and-daylight sense primarily.

**Formula:**

```
peripheralRange = maxVisualQuality × AMBIENT_VISUAL_COEFF × terrainVisualModifier
peripheralArc = 360  (simplified — all non-foveal directions)
```

Where `maxVisualQuality` is the best `visual` transducer quality across all non-destroyed zones on the creature.

The peripheral field reveals terrain (marks tiles as explored) but does not reveal entities. It is computed in addition to the existing foveal FOV, not instead of it.

### Chemical Airborne Ambient Sensing

Zones with `chemical.airborne > 0` detect volatile signatures from terrain in all directions (omnidirectional — volatiles diffuse through air without directionality at terrain-sensing distances).

**Physical basis.** Terrain volatile profiles diffuse outward from their sources. The concentration decreases with distance. A creature's airborne chemical transducers detect the volatile mix in the air around it. The profile changes as the creature moves through different biomes — the gradient tells the creature where terrain transitions are.

**Range depends on conditions.** Open terrain with air movement: long range (volatiles diffuse freely). Dense vegetation: shorter range (volatiles pool in the canopy and understory). Cave/underground: very short range (minimal air exchange, stagnant atmosphere).

**No line-of-sight requirement.** Volatiles go around obstacles. You can smell the wetland even if there's a hill between you and it. This is a fundamental advantage of chemical sensing — it provides terrain awareness through and around obstructions that block vision.

**Formula:**

```
chemAmbientRadius = maxChemAirborneQuality × AMBIENT_CHEM_COEFF × terrainChemModifier
```

Where `maxChemAirborneQuality` is the best `chemical.airborne` transducer quality across all non-destroyed zones.

**Species variation matters.** The hare has chemical.airborne = 0 on all zones — it has NO airborne chemical ambient sensing. It relies on vision and vibration for ambient awareness. The wolf (meso-predator) has chemical.airborne = 6 on its head — excellent nose, long chemical ambient range. The shaleback has chemical.airborne = 5 on its head. Each creature's ambient awareness profile is unique because it's downstream of the body map.

### Vibration Ground Ambient Sensing

Zones with `vibration.ground > 0` detect substrate character and transitions in all directions (omnidirectional through the ground — substrate vibrations propagate radially from the contact point).

**Physical basis.** Ambient vibrations propagate through the substrate — wind-driven surface movement, geological micro-activity, the creature's own footfalls reflecting off substrate boundaries. The propagation characteristics (speed, attenuation, reflection) depend on the substrate material. Hard rock carries vibrations far and cleanly. Soil dampens them. Sand absorbs them. Water creates strong reflections. A creature with mechanoreceptors in its limbs reads these propagation patterns continuously, passively characterizing the substrate around it.

**Range depends on substrate.** Hard rock / packed earth: longest range (efficient propagation). Soil / mixed substrate: moderate range. Sand / loose material: very short range. Near water: moderate range (water boundaries produce strong reflections).

**No line-of-sight requirement.** Vibrations propagate through the ground regardless of what's above it. You can feel the rocky substrate ahead even if vegetation blocks your view.

**Formula:**

```
vibAmbientRadius = maxVibGroundQuality × AMBIENT_VIB_COEFF × terrainVibModifier
```

Where `maxVibGroundQuality` is the best `vibration.ground` transducer quality across all non-destroyed zones.

**The hare is a vibration specialist.** Its forelimbs have vibration.ground = 5 (matching the lurker's sensor limbs in quality). Its mid and rear limbs have quality 3-4. It senses substrate character well and at moderate range. Even with no airborne chemical sensing, the hare has strong ambient awareness through vibration + peripheral vision.

---

## Terrain Modifiers

The ambient range for each channel is modulated by the terrain the creature is currently in. This reflects the physics of signal propagation — open terrain allows signals to travel further than dense or enclosed terrain.

### Visual Terrain Modifier

| Terrain Context | Modifier | Reasoning |
|---|---|---|
| Open grassland, desert, water surface | 1.0 | Clear sight lines to horizon |
| Savanna, light scrub | 0.6 | Scattered obstacles reduce peripheral reach |
| Forest, heavy vegetation | 0.25 | Sight lines blocked at 3-5 tiles in most directions |
| Cave, underground (with light) | 0.3 | Walls constrain field, but illuminated stone is visible |
| Cave, underground (no light) | 0.0 | No photons, no vision. Period. |
| Night surface (no dark adaptation) | 0.15 | Very limited peripheral range |

### Chemical Terrain Modifier

| Terrain Context | Modifier | Reasoning |
|---|---|---|
| Open grassland, savanna | 1.0 | Free air movement, good diffusion |
| Light forest | 0.7 | Canopy creates mixing layer, reduces gradient clarity |
| Dense forest, jungle | 0.4 | Volatile pooling, many sources, confused gradients |
| Cave, underground | 0.15 | Stagnant air, minimal exchange, pooling in chambers |
| Near large water body | 0.8 | Water volatiles are strong but reduce other signals slightly |

### Vibration Terrain Modifier

| Terrain Context | Modifier | Reasoning |
|---|---|---|
| Exposed rock, stone floor | 1.2 | Rock transmits vibration efficiently |
| Packed earth, firm soil | 1.0 | Good propagation, moderate attenuation |
| Grassland (soil + root mat) | 0.9 | Slightly dampened by organic layer |
| Forest floor (leaf litter, roots) | 0.7 | Organic material dampens surface waves |
| Sand, loose material | 0.3 | Rapid absorption, very short range |
| Water (standing in shallow water) | 0.5 | Water decouples from substrate, confuses signals |
| Cave (stone floor) | 1.2 | Same as exposed rock — underground doesn't penalize vibration |

---

## Target Ambient Radii

These are the radii the system should produce for key species in their typical habitats, working backward from ecological plausibility to determine the coefficients.

### Hare (5 kg, open grassland)

| Channel | Best Quality | Coefficient | Terrain Modifier | Ambient Radius |
|---|---|---|---|---|
| Visual peripheral | 4 (head) | 5.0 | 1.0 (open) | **20 tiles** |
| Vibration ground | 5 (forelimbs) | 3.0 | 0.9 (grassland) | **13 tiles** |
| Chemical airborne | 0 (none!) | — | — | **0 tiles** |

Total ambient bubble: ~20 tile radius (dominated by peripheral vision). In open grassland during daytime, the hare passively knows terrain in a roughly 40-tile diameter circle. At night, the visual radius collapses and vibration becomes the primary channel (~13 tiles). In dense forest, visual drops to ~5 tiles, vibration to ~10 tiles.

### Wolf / Meso-Predator (22 kg, open grassland)

| Channel | Best Quality | Coefficient | Terrain Modifier | Ambient Radius |
|---|---|---|---|---|
| Visual peripheral | 3 (head) | 5.0 | 1.0 | **15 tiles** |
| Chemical airborne | 6 (head) | 4.0 | 1.0 | **24 tiles** |
| Vibration ground | 1 (limbs) | 3.0 | 0.9 | **2 tiles** |

Total ambient bubble: ~24 tile radius (dominated by chemical sensing — the wolf "smells" the landscape). The wolf's ambient awareness extends further than the hare's through smell alone, despite worse vision. At night, chemical sensing is unaffected — the wolf loses less ambient range in darkness than the hare does.

### Lurker / Ambush Predator (12 kg, varied terrain)

| Channel | Best Quality | Coefficient | Terrain Modifier | Ambient Radius |
|---|---|---|---|---|
| Visual peripheral | 2 (head) | 5.0 | varies | **10 tiles** (open) |
| Chemical airborne | 4 (head) | 4.0 | varies | **16 tiles** (open) |
| Vibration ground | 7 (sensor limbs) | 3.0 | varies | **18-25 tiles** (substrate-dependent) |

The lurker's vibration sensing is dominant — its specialized sensor limbs produce the longest ambient radius of any creature. It knows the substrate in a huge area around its ambush position. This is ecologically correct: an ambush predator that sits still for long periods benefits enormously from knowing its surroundings through the ground.

### Shaleback / Large Herbivore (200 kg, open grassland)

| Channel | Best Quality | Coefficient | Terrain Modifier | Ambient Radius |
|---|---|---|---|---|
| Visual peripheral | 5 (head) | 5.0 | 1.0 | **25 tiles** |
| Chemical airborne | 5 (head) | 4.0 | 1.0 | **20 tiles** |
| Vibration ground | 3 (front limbs) | 3.0 | 0.9 | **8 tiles** |

The shaleback has excellent ambient awareness through both vision and smell — it sees and smells the landscape broadly. Its vibration sensing is moderate. As a large herbivore that needs to navigate between grazing areas and water, this broad awareness profile makes ecological sense.

---

## Constants

```
AMBIENT_VISUAL_COEFF  = 5.0    // tiles per unit visual quality (before terrain modifier)
AMBIENT_CHEM_COEFF    = 4.0    // tiles per unit chemical airborne quality
AMBIENT_VIB_COEFF     = 3.0    // tiles per unit vibration ground quality
```

These are tuning values. They should be adjusted if the resulting radii don't feel right in gameplay. The target is: on an open surface in daylight, a creature should passively know terrain in a radius that makes the ×2 zoom viewport (roughly 60×34 tiles) mostly non-black when standing in open terrain. In dense forest or underground, the ambient radius should be noticeably smaller — the world closes in.

---

## Rendering

The rendering system already has two tiers: visible (in FOV, full brightness, entities drawn) and explored (remembered, dimmed with 42% black overlay, no entities). Ambient terrain sensing adds tiles to the explored set, NOT to the visible set. This means:

- **In FOV (foveal cone):** Full brightness. Entities visible. Sprites and decorations rendered normally. This is the "I am looking at this" state — unchanged from the current system.

- **Explored / Ambient-sensed (outside FOV but within ambient radius, or previously seen):** Terrain visible but dimmed. No entities rendered. This is the "I know the ground here" state. It covers both actively sensed terrain around the creature and remembered terrain from previous visits. Currently these are treated identically in rendering.

- **Unexplored (outside all sensing, never visited):** Pure black. The creature has no information about this tile.

For the first implementation pass, ambient-sensed tiles are simply added to the `explored` set in state. The existing rendering code handles them correctly without modification — they render as dimmed terrain with no entities, which is the right visual treatment.

**Future rendering enhancement.** A third rendering tier — "actively sensed but not in visual FOV" — could be added later to distinguish between "I can sense this right now through vibration/smell" and "I remember this from when I was here before." The active-sensing tier might use a different overlay color or opacity to convey "you have current non-visual awareness here." But this is polish, not essential for the first pass.

---

## Damage and Degradation

Ambient sensing degrades physically when transducer zones are damaged or destroyed. This follows directly from the per-zone computation.

**Zone destruction.** If the hare's forelimbs (vibration ground quality 5) are destroyed, its best vibration ground quality drops to the mid-loco limbs (quality 3). Ambient vibration radius drops from 13 to ~8 tiles. The creature's awareness of its surroundings physically shrinks because the hardware that produced that awareness is gone.

**Head destruction.** Most creatures have their primary visual and chemical transducers on the head. Head destruction eliminates visual ambient sensing and chemical ambient sensing simultaneously. The creature navigates by vibration alone — a dramatically different experience.

**Progressive degradation.** As limbs are destroyed in combat, the ambient radius shrinks incrementally. A hare that has lost several limbs has degraded vibration sensing — fewer limbs in contact with the ground means fewer zones contributing to the ambient vibration computation. The world literally closes in around a badly wounded creature.

No special damage code is needed. The per-zone computation naturally produces these effects by checking `zone.destroyed` and taking the maximum quality across non-destroyed zones.

---

## Relationship to Existing Systems

### FOV System

The ambient terrain sensing system runs AFTER the existing FOV computation each turn. It does not modify or replace the FOV. It adds tiles to the `explored` set that the FOV didn't reach, based on non-visual channels and peripheral vision.

The foveal FOV (directed visual cone) remains the only system that makes entities visible. Ambient sensing reveals terrain, not creatures. A creature standing 15 tiles away in your chemical ambient radius is NOT revealed by ambient sensing — detecting that creature requires the entity detection system (Sensory-Design.md).

### Entity Detection System (Sensory-Design.md)

Completely separate system, completely separate purpose. Entity detection asks "is there a creature at this location and what can I learn about it?" Ambient terrain sensing asks "what is the ground like around me?" They use the same transducer quality values from the body map, but they compute different things.

The entity detection system's per-zone range formula (`zoneRange = cbrt(emission) × zoneQuality × channelCoefficient`) incorporates target emission because entities vary in signal strength. The ambient terrain formula (`ambientRadius = maxQuality × ambientCoefficient × terrainModifier`) does not incorporate emission because terrain signal is baked into the coefficient — it's a persistent, stable signal, not a variable target.

### Pattern Libraries (Future)

The pattern library system (Sensory-Design.md, "Pattern Libraries Are Physically Located") is designed but not yet built. Ambient terrain sensing works without it because terrain pattern matching is implicit in transducer receptor sensitivity (see "Physical Grounding" section above). When pattern libraries are implemented, they will add a refinement layer for novel/unfamiliar terrain recognition. This is forward-compatible — the ambient system needs zero redesign to accommodate pattern libraries later.

### Integration vs. Deliberation (Design Decision)

Extended discussion during design of this system examined the neuroscience of sensory integration (early multimodal convergence — neurons receiving inputs from multiple senses simultaneously, producing superadditive responses and losing channel identity) vs. deliberation (late convergence — separately processed channels compared at a higher level, preserving channel identity).

**The conclusion:** For ambient terrain sensing, integration vs. deliberation does not matter. Terrain signals are persistent and strong. Each channel independently provides terrain information at a range determined by transducer quality and signal physics. There is no faint-signal-at-the-edge-of-detection problem where superadditive integration would help. Integration would enhance entity detection at the margins (faint predator signal on two channels simultaneously), but terrain sensing doesn't need it.

Ambient terrain sensing is computed per-channel independently. The channels do not interact. The ambient radius is the union of per-channel radii. This is the simplest, most physically grounded model and it's sufficient for terrain.

Integration enhancement for entity detection remains a future design topic, covered in its own eventual design document.

---

## What This Document Does NOT Cover

- **Entity detection through ambient channels** — detecting other creatures (moving or still) through chemical, vibration, or visual channels. This is the existing entity detection system (Sensory-Design.md). Ambient terrain sensing does NOT reveal entities.
- **Explicit pattern library matching** — learned templates for terrain types, novel terrain recognition. Future extension.
- **Sensory integration** — early multimodal convergence for enhanced detection sensitivity. Future design topic, relevant to entity detection rather than terrain sensing.
- **Weather and wind effects on chemical sensing** — wind direction extending chemical range downwind, reducing upwind. Future refinement.
- **Adaptation and gain control** — sensory adaptation to persistent background signals. Described in Sensory-Design.md, not yet implemented.
- **Active sonar / echolocation** — deliberate emission for terrain mapping. Not relevant to passive ambient sensing.

---

## Implementation Summary

**Each player turn, after foveal FOV computation:**

1. Find the creature's best transducer quality per ambient channel across all non-destroyed zones:
   - `maxVisualQuality` — best `visual` value
   - `maxChemAirborneQuality` — best `chemical.airborne` value
   - `maxVibGroundQuality` — best `vibration.ground` value

2. Determine terrain modifiers for each channel based on the creature's current tile's terrain type (or a blend of nearby terrain types for creatures at biome boundaries).

3. Compute ambient radii:
   - `visualPeripheralRadius = maxVisualQuality × AMBIENT_VISUAL_COEFF × terrainVisualMod`
   - `chemAmbientRadius = maxChemAirborneQuality × AMBIENT_CHEM_COEFF × terrainChemMod`
   - `vibAmbientRadius = maxVibGroundQuality × AMBIENT_VIB_COEFF × terrainVibMod`

4. For each channel, mark tiles within that radius as explored:
   - **Visual peripheral:** Circle with `visualPeripheralRadius`, requires line-of-sight check per tile (light still has to reach the eye — walls, hills, and dense vegetation block peripheral vision just as they block foveal vision).
   - **Chemical airborne:** Circle with `chemAmbientRadius`, NO line-of-sight check (volatiles diffuse around obstacles).
   - **Vibration ground:** Circle with `vibAmbientRadius`, NO line-of-sight check (vibrations propagate through the substrate regardless of surface obstacles).

5. All marked tiles are added to `state.explored[layer]`. The rendering system handles them as dimmed terrain (existing behavior).

**This runs for the player creature only.** NPC ambient sensing is not rendered and would be wasted computation. NPC terrain awareness could use the same formulas in the future for AI navigation, but that's a separate feature.

---

## Implementation Status

**Designed (this document):** Ambient terrain sensing system — per-channel ambient radii from transducer properties, terrain modifiers, rendering through existing explored-tile system.

**Ready to implement:** First pass — compute ambient radii, mark tiles as explored, visual peripheral with LOS, chemical and vibration as simple circles. Coefficients from the target radii table above.

**Deferred:** Third rendering tier (active-sensing vs. memory), weather/wind effects on chemical range, adaptation effects, pattern library integration for novel terrain, NPC ambient awareness for AI navigation.
