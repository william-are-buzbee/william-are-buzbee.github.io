# Body Map Drafting — Clade A Large Herbivore

You have five design documents attached, plus the completed apex predator and small herbivore body maps from previous sessions:

- **Body-Sim-Design.md** — the body simulation system, zone composition format, derived value formulas, pathway topology, and two completed body maps (Clade A meso-predator at 22 kg, Clade B ambush predator at 24 kg)
- **Stat-System-Design.md** — derived stat definitions, sense profiles per creature, cognitive tier thresholds, combat value formulas
- **Mutation-Design.md** — how mutations modify the body map, what tissue changes each creature type drives
- **Ecology-Foundations.md** — clade architecture patterns, sensory paradigms, neural organization, reproduction, body plan ancestry
- **Surface-Creatures.md** — creature role descriptions, behavioral profiles, sense priorities, size ranges, habitat
- **The completed apex predator and small herbivore body maps** (attach the finalized versions from previous sessions as additional reference)

Your job is to draft a full body map for the Clade A large herbivore, matching the format and level of detail of the completed maps in Body-Sim-Design.md. The body map needs:

1. **Every zone** with full mass breakdown (muscle, structural, neural, sensory, connective) and total zone mass
2. **Neural allocation** per zone (which functions the local neural mass is spent on, in kg, summing to the zone's neural total)
3. **Transducers** per zone (chemical, vibration, visual quality ratings)
4. **Attacks** per zone (key, name, damage type, canReflex flag) — or empty if the zone has none
5. **Zone flags** (locomotion, vital, targetWeight)
6. **Pathway topology** with bandwidth values
7. **Derived value summary** (total neural mass, peak concentration and tier, locomotion muscle total, raw speed ratio, coordination bonus or lack thereof, knockout vulnerability)

## The Creature

### Clade A Large Herbivore (~200 kg)

Scale the Clade A template to large herbivore configuration. Six-limb, three-pair body plan, star topology, head-concentrated but less so than the predators.

- **Mass:** ~200 kg. The biggest surface Clade A creature. Heavy torso, barrel-shaped body, thick structural mass everywhere.
- **Senses:** Chemical 5 (adapted for aquatic mineral detection — good but not predator-tier chemical tracking), Visual 5 (better distance vision than either predator — open terrain and water scanning), Vibration 0 (absent, standard Clade A).
- **Centralization:** ~0.50 (Tier 3 but lower than predators). The large body demands more neural mass for motor relay in the torso and motor control in the massive limbs. The head still has the most neural mass but its share of total is diluted. Still firmly Tier 3 — episodic memory, spatial mapping, threat avoidance.
- **Attacks:** Defensive only. Front limbs are paddle-like — a "shove" or "slam" attack (blunt damage, high momentum from zone mass). Rear limbs could have a kick. Head might have no attack (mouth is ventral, adapted for grazing and rooting, not biting in combat). These attacks exist for self-defense, not predation.
- **Structural mass:** Very high. "Thicker and more water-adapted" skin. Highest structural-to-total ratio of any creature. This is the tankiest body on the surface.
- **Front limbs:** "Broader, flatter, almost paddle-like." More structural and connective mass, less muscle relative to size than predator front limbs. Used for digging, pulling vegetation, sculling through water. Flagged as locomotion (they contribute to movement on land and in water).
- **Locomotion:** All six limbs contribute. Raw speed ratio should be low (massive body, proportionally less locomotion muscle as a fraction of total mass). Coordination bonus present (centralized, Tier 3) but doesn't overcome the mass penalty. This is a slow creature.
- **Head:** Smaller relative to body than the predators (the head doesn't scale linearly with body mass). Contains the brain, chemical sensors, visual sensors, episodic memory, spatial mapping allocation. Vital: true. Ear-flaps present but described as "smaller and less mobile."
- **Torso:** Enormous. Most of the body mass. Vital: true. Heavy connective (organs), heavy structural (thick skin), heavy muscle (core stability, locomotion contribution from the barrel body).
- **Neural allocation in head:** Episodic memory (spatial mapping of large territories), chemical processing (aquatic mineral detection), visual processing (better distance vision than predators), integration, motor coordination. Less threat assessment allocation than the predators — this is a herbivore, it avoids threats rather than analyzing them tactically.

Refer to the stat doc's sense profile: Chemical 5, Visual 5, Vibration 0, Centralization ~0.50, Tier 3.

## Format

Output the body map as a section with the same layout as the meso-predator and ambush predator examples in Body-Sim-Design.md:

- Zone table with all mass breakdowns, neural allocations, transducers, attacks, flags
- Pathway diagram with bandwidth values
- Derived values summary

Use the same notation style (the plaintext block format with labeled fields per zone, pathway arrows with bandwidth in parentheses, derived values as bullet list).

## Constraints

- All zone targetWeights must sum to 1.0.
- All neural allocation values within a zone must sum to that zone's neural mass.
- Total mass across all zones must approximately equal the target mass (~200 kg).
- Tissue masses within a zone must sum to the zone's total mass.
- Transducer quality ratings must be consistent with the sense profile in Stat-System-Design.md.
- Pathway topology must be star (Clade A pattern): head to torso, torso to all limbs.
- Vital flags: torso is vital (organs), head is vital (Clade A single brain).
- Mirror zones (left/right pairs) should be noted as mirrors, not fully duplicated, same as in the existing examples.
