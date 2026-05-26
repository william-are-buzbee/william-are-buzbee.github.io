# Stat System Design

All gameplay-relevant values derive from the body map. There are no independent stats. What the player sees on their status screen are derived summary values computed from the physical composition of their body — total mass, muscle distribution, sensory organs, neural architecture. This document describes what those derived values are, how they're computed, and what they mean in gameplay.

Include this alongside Body-Sim-Design.md, Mutation-Design.md, and Ecology-Foundations.md when implementing.

---

## Why No Independent Stats

The original system had seven stats (Size, Strength, Chemical, Vibration, Visual, Central, Distributed) assigned directly to each creature. This was a bridge from the D&D-derived system (STR/CON/DEX/INT/PER) toward something more physical. But the body sim made independent stats redundant — every number they described is a physical property of a specific body zone:

- "Size" is total body mass in kg.
- "Strength" is muscle mass distributed across zones.
- "Chemical" is chemoreceptor transducer quality plus neural processing allocated to interpreting it.
- "Vibration" is mechanoreceptor transducer quality plus neural processing allocated to interpreting it.
- "Visual" is eye quality plus neural processing allocated to interpreting it.
- "Central" is the centralization score — the peak concentration of neural mass in any single zone.
- "Distributed" is the distribution score — 1.0 minus the centralization score.

Keeping independent stats alongside the body map means two systems describing the same creature, which creates conflicts. The body map is the source of truth. Stats are views into it.

---

## Derived Physical Values

### Total Mass

```
totalMass = sum of all zone masses (kg)
```

This is what "Size" used to be. The player sees their total mass in kg on the status screen.

What it determines:
- Zone HP pools (heavier zones have more HP)
- Total HP (sum of zone HPs)
- Target profile (bigger = easier to hit)
- Stealth penalty (bigger = harder to hide)
- Dodge chance (bigger = less dodge, inverse relationship)
- Food cost (bigger body = more calories)
- Turn agility (bigger = harder to change direction quickly)
- Carrying capacity (future)
- Terrain interaction (future — tight spaces)
- Intimidation (future)

Approximate mass ranges for context:

| Mass (kg) | Feels like | Earth comparison |
|---|---|---|
| 0.3 | Rat-sized | Large rat |
| 1.5 | Cat-sized | Small cat |
| 5 | Small dog / large rabbit | Jack rabbit, fox |
| 12 | Medium dog | Coyote |
| 24 | Large dog | Labrador, small wolf |
| 45 | Large dog / small human | Large wolf |
| 90 | Large human / small bear | Small black bear |
| 200 | Large bear | Grizzly |
| 400 | Bison | Bison |
| 1000 | Rhino | White rhino |
| 2500 | Terrestrial maximum | Hippo-to-small-elephant range |

This planet's terrestrial ceiling is roughly 2000-3000 kg due to archipelago geography (limited landmass, lower primary productivity from the dim star). Aquatic organisms can be much larger — up to 30-40 tonnes for a Clade A whale analogue.

### Muscle Mass and Distribution

There is no single "Strength" value. Muscle is distributed across zones and serves different functions depending on where it is:

**Locomotion muscle:** Muscle mass in zones flagged as locomotion. This drives speed.

```
locomotionMuscle = sum of muscle in all locomotion zones
```

**Strike muscle:** Muscle mass in the zone housing a specific attack. This drives that attack's damage.

**Total muscle percentage:** Total muscle mass / total body mass. A rough indicator of how "powerful" the creature is overall, but the distribution matters more than the total.

The player doesn't see "Strength 40." They might see "muscle: 48%" on the status screen, or they might just see the downstream effects — speed, damage per attack. The exact player-facing display is a design decision for implementation.

---

## Derived Senses

Each sense is computed from the body map: transducer quality (the hardware) and neural processing allocation (the software).

### Chemical (Chemoreception)

Smell, taste, reading dissolved compounds in air and water.

```
effectiveChemical = max(zone.transducers.chemical for all surviving zones)
discrimination = min(transducerQuality, chemicalProcessing * PROCESSING_SCALE)
```

The creature's effective Chemical is the best chemoreceptor array it still has. Discrimination — how much useful information is extracted — is bottlenecked by whichever is lower: the transducer quality or the neural tissue processing it.

Gameplay layer: a scent map. Creatures and the player leave chemical trails on tiles they've visited. Chemical sense reads those trails. Higher effective Chemical + higher processing = longer detection range, richer information (from "something was here" to identifying specific creatures and their state).

Clade A: primary sense. Dense chemoreceptors concentrated in the head zone, heavy neural investment in chemical processing. Losing the head is catastrophic for Chemical.

Clade B: secondary sense for most. Chemoreceptors distributed across limb tips, modest processing in each local ganglion. Losing one limb reduces coverage on that flank but doesn't eliminate Chemical.

### Vibration (Mechanoreception)

Reading ground tremors, footsteps, pressure changes through substrate contact.

```
effectiveVibration = sum(zone.transducers.vibration for all surviving zones), capped
discrimination = min(transducerQuality, vibrationProcessing * PROCESSING_SCALE)
```

Vibration uses sum-with-cap rather than max because spatial coverage matters — more mechanoreceptor arrays across the body = wider detection area. A creature with vibration sensors on every limb detects from all directions. A creature with sensors only on its front limbs has a detection gap behind it.

Gameplay layer: movement detection. Any moving creature generates vibration. Vibration sense detects movement through the ground, potentially through walls. Higher effective Vibration = wider range, better identification (from "something moved" to recognizing specific creatures by footstep signature).

Clade A: vestigial or absent. Most Clade A descendants have little to no vibration sensing.

Clade B: primary sense. Dense mechanoreceptor arrays on limb surfaces, heavy neural investment in vibration processing distributed across limb ganglia. Each limb processes its own vibration input locally — detection is fast, local, and independent.

### Visual (Eyesight)

Light-based detection. Pattern recognition, motion detection, distance assessment.

```
effectiveVisual = max(zone.transducers.visual for all surviving zones)
discrimination = min(transducerQuality, visualProcessing * PROCESSING_SCALE)
```

Visual uses max — you see through your best eye.

Gameplay layer: standard FOV (field of view). Visual determines cone depth and clarity. Higher effective Visual = longer sight range, better detail at distance.

Both clades have eyes. Visual varies by creature and lifestyle, not by clade. The ambush predator has distributed eyes (including small rear-facing ones on the rear limbs). The meso-predator has all eyes concentrated in the head.

### Future Senses

The system accommodates new senses without restructuring. Each future sense follows the same pattern: transducer quality on zones, neural processing allocation in local ganglia, derived effective value.

- Thermal — heat signatures. Useful underground, at night, through cover.
- Echolocation — active sonar. Reveals own position.
- Electromagnetic — bioelectric fields in water. Aquatic niche.
- Pressure — atmospheric changes. Weather, altitude.

---

## Derived Cognition

Cognition is not a stat. It's an emergent property of neural mass distribution across the body map.

### Centralization Score

```
totalNeuralMass = sum of neural mass across all zones
centralizationScore = max(zone.neural / totalNeuralMass for all zones)
```

The highest fraction of total neural mass concentrated in any single zone. This determines what cognitive capabilities are available.

### Cognitive Tiers

| Tier | Centralization Score | Capabilities |
|---|---|---|
| Tier 1 (< 0.20) | Fully distributed | Reflexive pattern matching only. No episodic memory. No integration. Pure stimulus-response per ganglion. |
| Tier 2 (0.20 — 0.40) | Partially centralized | Episodic memory available (limited, short-term). Basic two-modal integration where senses converge. Short-term individual recognition. |
| Tier 3 (> 0.40) | Heavily centralized | Full episodic memory. Multi-modal integration (cross-referencing chemical, visual, vibration, spatial, and temporal data). Generalization. Threat assessment. Targeted zone attacks. The creature is recognizably intelligent. |

### What Each Tier Means in Gameplay

**Tier 1 — Reflexive only:**
- AI: parallel weighted behaviors, no readable state transitions
- Detection: each zone detects independently using its local senses
- Combat: reflexive strikes from zones with sufficient neural mass and local senses, no targeted attacks
- Memory: pattern library only — trained stimulus-response associations local to each ganglion. No memory of specific events or individuals.
- Examine: minimal information extracted ("a creature is here")
- Territory: strong — each ganglion builds deep local pattern library through experience

**Tier 2 — Partial centralization:**
- AI: rudimentary state machine with limited transitions
- Detection: modest cross-referencing of two sensory modalities
- Combat: deliberate attacks from the concentrated zone, reflexive strikes from distributed zones
- Memory: short-term episodic memory. Remembers recent encounters but not in detail. Basic individual recognition.
- Examine: moderate information ("a predator, six limbs, wounded")
- Territory: moderate — episodic memory supplements pattern matching

**Tier 3 — Full centralization:**
- AI: complex state machine with readable transitions, personality, learning
- Detection: full multi-modal integration. Cross-references scent trails with visual confirmation with vibration data with past experience.
- Combat: targeted zone attacks (requires centralization + sensory acuity to perceive the target zone). Full-body committed strikes with coordinated gait.
- Memory: rich episodic memory. Remembers specific encounters with the player, adjusts behavior based on personal history. Recognizes individuals. Remembers dangerous locations.
- Examine: detailed information gated by centralization score ("a meso-predator, left mid-limb destroyed, bleeding, favoring right side, likely to flee")
- Territory: moderate — episodic memory of landmarks and routes, but less locally optimized than Tier 1 pattern matching

### Distribution Score

```
distributionScore = 1.0 - centralizationScore
```

Higher distribution provides:
- Reflexive defense (zones react independently to local threats)
- Graceful degradation (no single point of failure for cognition)
- Parallel motor execution (multiple limbs acting on independent motor programs simultaneously)
- Knockout resistance (no zone holds enough neural mass for a knockout blow)
- Territory-optimized pattern matching (each ganglion builds its own local stimulus-response library)

### The Cross-Clade Impossibility

No native creature has both high centralization AND high distribution with sensory coverage to support both. A Clade A organism has centralization 0.50+ with vestigial limb ganglia. A Clade B organism has centralization below 0.20 with dense limb ganglia. The architectures are mutually exclusive because neural mass is a finite resource — concentrating it in the head means it's not in the limbs, and vice versa.

A player who mutates through consuming Clade B creatures develops neural mass in limb zones. Their head's concentration fraction drops as limb ganglia grow. They're physically restructuring their neural architecture from centralized toward distributed. At some point their centralization score drops below 0.40 and they begin losing Tier 3 capabilities while gaining reflexive defense. The stat display reflects this — the player can see their cognitive tier shifting as they mutate.

This is the biologically impossible signal. No native organism transitions between architectures. The player doing so hints at the demigod's nature.

---

## Derived Combat Values

### Dodge

```
dodgeChance = ((DODGE_REFERENCE_MASS - totalMass) / DODGE_REFERENCE_MASS) * MAX_DODGE_PERCENT
```

Smaller creatures dodge more because there's physically less of them to hit. DODGE_REFERENCE_MASS is the mass at which dodge reaches 0%. Armor penalties still apply as flat subtractions.

Dodge is resolved. It's total-mass-inverted, nothing else. No separate dodge stat, no Distributed contribution. The clade difference in combat comes from reflexive defense (Clade B limbs strike back when you attack from outside their attention arc), not from an abstract dodge modifier.

### Speed

```
locomotionMuscle = sum of muscle in all locomotion zones
rawSpeedRatio = locomotionMuscle / totalMass
coordinationBonus = motorCoordinationNeural * COORDINATION_MULT
effectiveSpeed = rawSpeedRatio * (1 + coordinationBonus)
```

Speed is power-to-weight ratio for locomotion specifically, modified by neural coordination efficiency. Centralized motor coordination (one hub timing all limbs) extracts more speed from the same muscle. Distributed self-timing (each limb manages its own motor program) is less efficient but resilient to damage.

Speed feeds into the relative speed system: enemies faster than the player occasionally get bonus moves, enemies slower occasionally skip turns. The player always acts once per turn — the world speeds up or slows down around them.

Speed is resolved. Locomotion muscle / total mass + coordination bonus. Damaged locomotion zones reduce locomotionMuscle. Destroyed motor coordination zones remove the coordination bonus.

### Damage

```
strikeDamage = (zoneMuscle * MUSCLE_FORCE_COEFF) + (zoneMass * MOMENTUM_COEFF)
attackDamage = strikeDamage * attack.damageModifier
```

Each attack derives damage from the zone housing it. Muscle provides force, zone mass provides momentum. A bite's damage comes from jaw muscle in the head. A kick's damage comes from leg muscle. There is no creature-wide "damage" number — each attack has its own damage derived from its own zone.

### Accuracy

```
accuracy = BASE_ACCURACY + (effectiveSense * SENSE_ACCURACY_COEFF)
```

Where effectiveSense is whichever sense the creature is using to detect the target (Chemical for scent-tracking Clade A, Vibration for ground-sensing Clade B, Visual for sight-based attacks). The attacker uses the sense that led to detection. This is a placeholder until full sense-specific accuracy is implemented.

### Stealth

```
stealthProfile = totalMass * STEALTH_MASS_COEFF
```

Stealth is primarily about being physically small enough to not be noticed. Future expansion: stealth effectiveness against specific senses depends on understanding what the detector can perceive. Sneaking past a Chemical-dominant creature means staying downwind. Sneaking past a Vibration-dominant creature means moving slowly. The player's knowledge of enemy sense profiles (from the examine system, gated by their own centralization score) feeds into stealth strategy.

### Turn Agility

```
instantTurnChance = (AGILITY_REFERENCE_MASS - totalMass) / AGILITY_REFERENCE_MASS
```

Smaller creatures change facing direction almost for free. Larger creatures commit to a direction. Derived from total mass — inertia is mass times velocity, changing direction means overcoming momentum.

---

## Creature Sense Profiles

These are not assigned stats — they're the effective sense values derived from each creature's body map. Listed here for reference:

**Clade A Meso-Predator (22 kg):**
- Chemical: 6 (head transducers, 0.25 kg processing) — primary sense
- Visual: 3 (head transducers, 0.10 kg processing) — secondary
- Vibration: 0 — absent
- Centralization: 0.66 — Tier 3
- Cognitive: full episodic memory, integration, threat assessment, targeted attacks

**Clade A Apex Predator (~90 kg):**
- Chemical: 7 — primary, extended range
- Visual: 4 — better developed than meso-predator
- Vibration: 0-1 — vestigial
- Centralization: ~0.60 — Tier 3
- Cognitive: same as meso-predator with more experience accumulation (longer-lived)

**Clade A Large Herbivore (~200 kg):**
- Chemical: 5 — adapted for aquatic mineral detection
- Visual: 5 — better distance vision than predators (open terrain)
- Vibration: 0 — absent
- Centralization: ~0.50 — Tier 3
- Cognitive: episodic memory, spatial mapping, threat avoidance. Less threat assessment than predators.

**Clade B Small Herbivore (~5 kg):**
- Chemical: 2 — minor
- Vibration: 5 — primary, distributed across all limbs
- Visual: 4 — good motion detection
- Centralization: ~0.15 — Tier 1
- Cognitive: reflexive only. No memory of specific encounters. Deep territory-trained pattern libraries.

**Clade B Colonial Chemotroph node (~5 kg):**
- Chemical: 1 — minimal
- Vibration: 6 — primary, communication + detection
- Visual: 2 — minimal
- Centralization: ~0.12 — Tier 1
- Cognitive: reflexive only. Colony-level behavior emerges from inter-node chemical signaling, not individual intelligence.

**Clade B Ambush Predator (~24 kg):**
- Chemical: 2 — minor, limb-tip chemoreceptors
- Vibration: 7 — primary, dense arrays on sensor limbs and all other limbs
- Visual: 5 — good motion detection, including rear-facing eyes
- Centralization: 0.15 — Tier 1 with modest Tier 2 integration in head
- Cognitive: reflexive pattern matching with deep territory familiarity. Modest visual+vibration cross-referencing in head. No episodic memory.

**Player (starting Clade A body, ~24 kg):**
- Chemical: 5 — Clade A default
- Vibration: 0 — absent (Clade A body has no mechanoreceptors)
- Visual: 4 — moderate
- Centralization: ~0.55 — Tier 3
- Cognitive: full episodic memory, integration, targeted attacks, examine depth

**Player (late game, heavily mutated, ~30 kg):**
- Chemical: 6 — enhanced from Clade A consumption
- Vibration: 4 — grown through Clade B consumption (mechanoreceptors developed in limb zones)
- Visual: 5 — enhanced
- Centralization: ~0.30 — dropped from 0.55 as neural mass redistributed to limbs. Tier 2 — reduced episodic memory, reduced examine depth, but gained reflexive defense and knockout resistance.

This profile is biologically impossible for any native organism. Both Chemical 6 (Clade A signature) and Vibration 4 (Clade B signature) on the same body, with a centralization score that's neither Clade A-high nor Clade B-low but somewhere in between.

---

## What the Player Sees

The status screen shows derived summary values, not body map internals:

- **Mass:** total body mass in kg
- **Speed:** effective speed (a descriptive word or relative value — "fast," "moderate," "slow" — rather than the raw ratio)
- **Senses:** each sense with an effective quality level. Only senses above 0 are shown. "Chemical: strong. Visual: moderate." Or numeric if preferred.
- **Cognition:** a descriptive tier. "Centralized" or "Distributed" or "Partially distributed." Not a number.
- **HP:** total across all zones (the sum)

The examine screen when looking at enemies shows information gated by the player's own centralization score. Higher centralization = better anatomical reasoning = more detail visible.

The player does NOT see: zone mass breakdowns, neural allocations, pathway bandwidths, tissue composition ratios, centralization scores as numbers. The body map is the simulation. The status screen is the dashboard.

---

## Interaction with Other Systems

### Body Sim
The body sim IS the stat system. Every value described in this document is computed from body map data. Damaging a zone changes the creature's derived values in real time — destroying a locomotion zone reduces speed, destroying a sensory zone reduces the corresponding sense, destroying a high-neural-mass zone can shift the creature's cognitive tier.

### Mutation
Mutations physically modify the body map. Eating Clade A creatures grows neural mass in the head zone and develops chemoreceptors. Eating Clade B creatures grows neural mass in limb zones and develops mechanoreceptors. The derived sense values and cognitive scores shift as the body map changes. The player sees "Chemical increased" in the log — behind the scenes, chemoreceptor transducer quality improved in a zone and chemical processing neural tissue grew in the local ganglion.

### Speed System
The relative speed system reads effectiveSpeed (derived from the body map) instead of the old Strength/Size ratio. Turn agility reads totalMass. All inputs from the body map.

### AI
Detection reads the creature's effective senses (derived from surviving zone transducers and processing). AI behavioral complexity reads the creature's cognitive tier (derived from centralization score). Chemical-dominant creatures track by scent trail. Vibration-dominant creatures detect by movement proximity. Visual-dominant creatures use line-of-sight.

### Combat
Accuracy uses the attacking creature's relevant effective sense. Damage uses the striking zone's muscle and mass. Dodge uses the defender's total mass. Armor uses the target zone's structural mass. Everything from the body map.

### Chargen
Character creation will need to move from abstract point allocation to body configuration. Options under consideration:
- Choose a body type template ("lean and fast" vs "heavy and powerful") that sets the body map, then fine-tune specific zones
- Allocate mass between categories (muscle, neural, structural) and let the body map compute from those inputs
- Simplified allocation that maps to body map parameters behind the scenes

Decision deferred to implementation. The current abstract stat allocation works as a temporary bridge — the allocated values map to body map parameters during creature initialization.

### Save System
Derived values are not saved — they're recomputed from the body map at load time. Only zone damage states (current HP, destroyed flag) need persisting per creature.

---

## Prompt Reference

When implementing, include:
- This document
- Body-Sim-Design.md (the body map system that all stats derive from)
- `player.js` (player body map)
- `monsters.js` (creature body map definitions and templates)
- `combat.js` (damage, accuracy, dodge formulas reading body map values)
- `enemy-ai.js` (detection and behavior reading derived senses and cognition)
- `chargen.js` (body configuration at character creation)
- `ui.js` (status display showing derived values)
- `interactions.js` (examine system gated by centralization score)
- `save-load.js` (zone state persistence)
- `constants.js` (tuning values for all derived formulas)
- Mutation-Design.md (how mutations modify the body map)
- Ecology-Foundations.md (clade context for neural architecture differences)
