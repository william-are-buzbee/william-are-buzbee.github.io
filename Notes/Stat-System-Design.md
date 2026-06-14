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

Each sense is computed from the body map: transducer quality (the hardware) and neural processing allocation (the software). Detection is per-zone — there is no creature-level aggregated sensitivity. Each zone independently determines its own detection range on each channel through its own transducers, and information quality scales continuously with signal-to-noise ratio. See Sensory-Design.md for the full detection and information quality framework.

### Chemical (Chemoreception)

Chemical sensing operates through three physically distinct coupling media, each a different instrument:

**Contact** — surface-level chemical reading through direct touch. Taste, essentially. Operates at touch range only. Reads molecular composition of whatever the zone is contacting. Quality determines resolution of the surface reading.

**Airborne** — volatile sampling at distance. Smell. Reads airborne chemical concentrations carried by atmosphere. This is the distance sense — creatures and the player leave chemical trails on tiles they've visited, and airborne chemoreception reads those trails. Only Clade A creatures carry meaningful airborne chemical values; Clade B's chemical world is entirely contact-based.

**Dissolved** — aquatic chemical sensing. Reading dissolved compounds in water. Future implementation — reserved for aquatic and semi-aquatic niches.

Each zone that carries chemical transducers has independent quality values on each coupling medium. A zone with contact 2 and airborne 6 is a precise taster and an excellent nose — two different instruments in the same organ. Detection range per zone per medium follows the standard formula: range = cbrt(emission) × zoneQuality × channelCoefficient. Information quality scales with SNR (zoneRange / distance) — from "something is here" at the edge of range to precise species identification at close range with good sensors.

The bottleneck between hardware and software still applies: a zone with excellent transducers but minimal chemicalProcessing neural allocation gets range but poor interpretation. A zone with dense chemoreceptors and heavy processing investment extracts rich information. This relationship is folded into how range and SNR produce information through the detection system, not expressed as a separate derived value.

Clade A: primary sense. Dense chemoreceptors concentrated in the head zone with high airborne quality (the nose) and contact quality (the mouth). Heavy neural investment in chemical processing. Losing the head is catastrophic — the creature loses its primary distance sense entirely.

Clade B: secondary sense for most. Chemoreceptors distributed across limb tips, contact-only — Clade B creatures taste what they touch but cannot smell at range. Modest processing in each local ganglion. Losing one limb reduces coverage on that flank but doesn't eliminate chemical sensing.

### Vibration (Mechanoreception)

Vibration sensing operates through three coupling media:

**Ground** — substrate-contact vibration. Reading tremors, footsteps, and pressure changes through physical contact with the ground. The primary vibration channel for terrestrial creatures. Still creatures emit zero ground vibration — a motionless target is invisible to this channel regardless of sensor quality.

**Air** — airborne pressure waves. Lower fidelity than ground, but detects signals without requiring substrate contact. The meso-predator's mobile ear-flaps pick up airborne vibration at low quality. The ambush predator's sensor limbs detect airborne vibration as a secondary confirmation channel.

**Water** — aquatic displacement waves. Future implementation — reserved for aquatic niches. The large herbivore's paddle-limbs carry water vibration transducers for detecting movement while submerged.

Each zone detects independently through its own transducers on specific coupling media. A creature with vibration sensors on every limb detects from all directions — each limb's ganglion processes its own vibration input locally. A creature with sensors only on its front limbs has a detection gap behind it. There is no aggregation into a creature-level vibration value.

Clade A: weak or vestigial. Most Clade A descendants have minimal ground vibration sensitivity through locomotion limbs (quality 1) and low-fidelity airborne pickup through ear-flaps (quality 2-3 in the head). Neither channel is reliable enough to drive behavior.

Clade B: primary sense. Dense mechanoreceptor arrays on limb surfaces with high ground vibration quality, heavy neural investment in vibration processing distributed across limb ganglia. Each limb processes its own vibration input locally — detection is fast, local, and independent.

### Visual (Eyesight)

Light-based detection. Pattern recognition, motion detection, distance assessment. Visual uses the existing FOV cone system — visual determines cone depth and clarity.

Visual remains a single transducer value per zone (no coupling media split). The creature's visual capability depends on which zones have eyes and how much visualProcessing neural allocation supports them. Losing a zone with eyes drops visual to whatever the next-best zone provides.

Both clades have eyes. Visual varies by creature and lifestyle, not by clade. The ambush predator has distributed eyes (including small rear-facing ones on the rear limbs with visual quality 1). The meso-predator has all eyes concentrated in the head (visual quality 3).

### Future Senses

The system accommodates new senses without restructuring. Each future sense follows the same pattern: transducer quality on zones with coupling media where appropriate, neural processing allocation in local ganglia, per-zone detection with SNR-based information quality.

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

The highest fraction of total neural mass concentrated in any single zone. This correlates with integration capacity — the creature's ability to override reactive behavior with contextual deliberation.

### Cognitive Tiers

| Tier | Centralization Score | Typical Characteristics |
|---|---|---|
| Tier 1 (< 0.20) | Fully distributed | Reactive dominance. Deep pattern libraries per ganglion. No episodic memory. No integration. Excellent reflexive defense and knockout resistance. |
| Tier 2 (0.20 — 0.40) | Partially centralized | Some deliberative override capability. Short-term episodic memory. Basic two-modal integration where senses converge. Modest goal persistence. |
| Tier 3 (> 0.40) | Heavily centralized | Reliable deliberative override. Full episodic memory. Multi-modal integration. Generalization. Threat assessment. Targeted zone attacks. The creature is recognizably intelligent. |

Tiers are derived display labels that correlate with integration capacity ranges. They do not gate which behavioral system runs — all creatures run the same decision architecture. The tier label tells the player roughly what cognitive characteristics a creature exhibits, not which AI system is selected for it.

### What Each Tier Means in Gameplay

All creatures run universal reactive rules every turn. Behavioral differences emerge because each rule's conditions query the body map, and different bodies produce different answers. The deliberative layer attempts override when integration capacity is sufficient — a continuous contest between stimulus magnitude and override capacity, not a tier gate. See Cognition-Design.md for the full reactive-deliberative architecture.

**Tier 1 range — Reactive dominance:**
- Reactive layer handles all behavior. Immediate stimulus-response: detect threat → flee or strike, detect prey → pursue briefly, detect nothing → hold or wander (depending on whether movement compromises the dominant sense)
- No sustained pursuit — if the target leaves detection range, the creature drops the goal within a few turns
- No contextual assessment — the creature cannot evaluate whether it's winning a fight or compare threat magnitude against its own capability
- Each zone detects and reacts independently using its local senses. Territory-trained pattern libraries make each ganglion deeply competent within its home patch
- Examine: minimal information extracted ("a creature is here")

**Tier 2 range — Partial override:**
- Deliberative layer fires on moderate stimuli but fails on strong ones. The creature can suppress reactive impulses when the situation isn't urgent — continuing to graze when a distant predator is detected, for example
- Short goal persistence — can sustain a pursuit or investigation for several turns after the target leaves detection
- Modest cross-referencing of two sensory modalities where they converge on the integration zone
- Basic individual recognition through short-term episodic memory
- Examine: moderate information ("a predator, six limbs, wounded")

**Tier 3 range — Reliable override:**
- Deliberative layer reliably overrides reactive impulses in most situations. The creature evaluates context before committing — fight assessment, threat comparison, cost-benefit analysis
- Full episodic memory. Remembers specific encounters with the player, adjusts behavior based on personal history. Recognizes individuals. Remembers dangerous locations
- Multi-modal integration: cross-references scent trails with visual confirmation with vibration data with past experience
- Sustained pursuit. Goal persistence extends well beyond detection range, scaled by integration capacity
- Targeted zone attacks (requires centralization + sensory acuity to perceive the target zone)
- Examine: detailed information gated by centralization score ("a meso-predator, left mid-limb destroyed, bleeding, favoring right side, likely to flee")

Integration capacity is continuous — the tier boundaries are display thresholds, not behavioral switches. A creature at centralization 0.19 and one at 0.21 behave very similarly. The difference between Tier 1 and Tier 3 is dramatic in aggregate, but the transition is gradual.

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

A player who mutates through consuming Clade B creatures develops neural mass in limb zones. Their head's concentration fraction drops as limb ganglia grow. They're physically restructuring their neural architecture from centralized toward distributed. At some point their centralization score drops below 0.40 and they begin losing reliable deliberative override while gaining reflexive defense. The stat display reflects this — the player can see their cognitive tier shifting as they mutate.

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
accuracy = BASE_ACCURACY + (zoneDetectionQuality * SENSE_ACCURACY_COEFF)
```

Bridge formula — reads the detecting zone's transducer quality or best SNR for the channel that led to detection, not a creature-level aggregated sense value. The attacker uses the sense that led to detection (airborne chemical for scent-tracking Clade A, ground vibration for ground-sensing Clade B, visual for sight-based attacks). Exact implementation deferred — the correct input is the SNR or zone quality from the specific detection event that initiated engagement.

### Stealth

```
stealthProfile = totalMass * STEALTH_MASS_COEFF
```

Stealth is primarily about being physically small enough to not be noticed. Future expansion: stealth effectiveness against specific senses depends on understanding what the detector can perceive. Sneaking past a Chemical-dominant creature means staying downwind. Sneaking past a Vibration-dominant creature means moving slowly. The player's knowledge of enemy sensory capabilities (from the examine system, gated by their own centralization score) feeds into stealth strategy.

### Turn Agility

```
instantTurnChance = (AGILITY_REFERENCE_MASS - totalMass) / AGILITY_REFERENCE_MASS
```

Smaller creatures change facing direction almost for free. Larger creatures commit to a direction. Derived from total mass — inertia is mass times velocity, changing direction means overcoming momentum.

---

## Creature Sense Profiles

These are not assigned stats — they're the per-zone transducer values from each creature's body map, summarized here for reference. Detection operates per-zone, not per-creature — these summaries show the best values across all zones. See Surface-Creatures.md for the full zone-by-zone body maps and Sensory-Design.md for how these values produce detection ranges.

**Clade A Meso-Predator (22 kg):**
- Chemical: airborne 6 (head), contact 2 (head), contact 1 (torso, front limbs) — airborne is the primary distance sense
- Vibration: air 2 (head ear-flaps), ground 1 (front, mid, rear limbs) — weak, not behavior-driving
- Visual: 3 (head)
- Centralization: 0.66 — Tier 3
- Integration capacity 0.128 — reliable deliberative override, sustained pursuit, fight assessment

**Clade A Apex Predator (~90 kg):**
- Chemical: airborne 7 (head), contact 2 (head), contact 1 (torso, front limbs) — extended range over meso-predator
- Vibration: air 3 (head), ground 1 (front, mid, rear limbs) — slightly better than meso-predator, still weak
- Visual: 4 (head) — better developed than meso-predator
- Centralization: 0.61 — Tier 3
- Integration capacity 0.252 — reliable deliberative override with more experience accumulation (longer-lived). Sustained pursuit over long distances.

**Clade A Large Herbivore (~200 kg):**
- Chemical: airborne 5 (head), contact 4 (head), contact 3 (front limbs, with dissolved 3 for aquatic foraging), contact 1 (torso) — adapted for evaluating flora quality and detecting submerged vegetation
- Vibration: air 2 (head), ground 1 (mid, rear limbs), water 3 (front paddle-limbs) — the only Clade A creature with meaningful aquatic mechanoreception
- Visual: 5 (head) — better distance vision than predators (open terrain)
- Centralization: 0.509 — Tier 3
- Integration capacity 0.154 — reliable deliberative override. Strong spatial memory, threat avoidance. Evaluates before fleeing — calm until the stimulus overwhelms override.

**Clade B Small Herbivore (~5 kg):**
- Chemical: contact 2 (fore limbs), contact 1 (mid-graze limbs) — contact only, no airborne
- Vibration: ground 5 (fore limbs), ground 4 (mid-graze limbs), ground 3 (mid-loco, rear limbs), ground 1 (torso), air 1 (head, fore limbs, mid-graze limbs) — dense distributed coverage
- Visual: 4 (head)
- Centralization: 0.146 — Tier 1
- Integration capacity 0.000 — reactive dominance. No memory of specific encounters. Deep territory-trained pattern libraries across all ganglia.

**Clade B Ambush Predator (~24 kg):**
- Chemical: contact 2 (sensor limbs), contact 1 (front limbs) — contact only, no airborne
- Vibration: ground 5 (sensor limbs), ground 4 (front limbs), ground 2 (rear limbs), ground 1 (torso), air 2 (head, sensor limbs), air 1 (front, rear limbs) — dense distributed coverage with sensor limbs as primary arrays
- Visual: 3 (head), visual 1 (rear limbs) — includes rear-facing eyes for motion detection
- Centralization: 0.15 — Tier 1 with modest integration in head
- Integration capacity 0.014 — reactive dominance with minimal deliberative capability. Pattern matching with deep territory familiarity. No episodic memory.

**Player (starting Clade A body, ~24 kg):**
- Chemical: airborne 5 (head), contact 2 (head) — Clade A default sensory profile
- Vibration: ground 1 (limbs) — minimal, Clade A body has no significant mechanoreceptors
- Visual: 4 (head)
- Centralization: ~0.55 — Tier 3
- Integration capacity ~0.13 — reliable deliberative override, full episodic memory, examine depth

**Player (late game, heavily mutated, ~30 kg):**
- Chemical: airborne 6, contact 3 (head, enhanced from Clade A consumption)
- Vibration: ground 4 (limb zones, grown through Clade B consumption — mechanoreceptors developed), air 2
- Visual: 5 (enhanced)
- Centralization: ~0.30 — dropped from 0.55 as neural mass redistributed to limbs. Tier 2 — reduced integration capacity, less reliable deliberative override, reduced examine depth, but gained reflexive defense and knockout resistance.

This profile is biologically impossible for any native organism. Both airborne chemical 6 (Clade A signature) and ground vibration 4 (Clade B signature) on the same body, with a centralization score that's neither Clade A-high nor Clade B-low but somewhere in between.

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
Detection is per-zone — each zone's transducers independently determine detection range on each coupling medium. AI behavior uses a universal reactive layer with integration-capacity-based deliberative override. All creatures run the same decision architecture. Chemical-dominant creatures track by scent trail (airborne chemoreception). Vibration-dominant creatures detect by movement proximity (ground mechanoreception). Visual-dominant creatures use line-of-sight.

### Combat
Accuracy uses the detecting zone's quality or SNR for the channel that led to engagement. Damage uses the striking zone's muscle and mass. Dodge uses the defender's total mass. Armor uses the target zone's structural mass. Everything from the body map.

### Chargen
The player selects a species at game start and inherits that creature's complete body map. No stats are allocated. The body map IS the character sheet.

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
