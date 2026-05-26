# Body Map Drafting — Clade A Apex Predator

You have five design documents attached:

- **Body-Sim-Design.md** — the body simulation system, zone composition format, derived value formulas, pathway topology, and two completed body maps (Clade A meso-predator at 22 kg, Clade B ambush predator at 24 kg)
- **Stat-System-Design.md** — derived stat definitions, sense profiles per creature, cognitive tier thresholds, combat value formulas
- **Mutation-Design.md** — how mutations modify the body map, what tissue changes each creature type drives
- **Ecology-Foundations.md** — clade architecture patterns, sensory paradigms, neural organization, reproduction, body plan ancestry
- **Surface-Creatures.md** — creature role descriptions, behavioral profiles, sense priorities, size ranges, habitat

Your job is to draft a full body map for the Clade A apex predator, matching the format and level of detail of the two completed maps in Body-Sim-Design.md (the meso-predator and ambush predator examples). The body map needs:

1. **Every zone** with full mass breakdown (muscle, structural, neural, sensory, connective) and total zone mass
2. **Neural allocation** per zone (which functions the local neural mass is spent on, in kg, summing to the zone's neural total)
3. **Transducers** per zone (chemical, vibration, visual quality ratings)
4. **Attacks** per zone (key, name, damage type, canReflex flag) — or empty if the zone has none
5. **Zone flags** (locomotion, vital, targetWeight)
6. **Pathway topology** with bandwidth values
7. **Derived value summary** (total neural mass, peak concentration and tier, locomotion muscle total, raw speed ratio, coordination bonus or lack thereof, knockout vulnerability)

## The Creature

### Clade A Apex Predator (~90 kg)

Scale up the meso-predator template. Same six-limb, three-pair Clade A body plan, star topology, head-concentrated neural architecture. The key differences from the meso-predator:

- **Mass:** ~90 kg (roughly 4x the meso-predator). Distribute the extra mass realistically — the torso and rear limbs gain proportionally more than the head. This is a heavier-built animal, not a uniformly scaled-up one.
- **Senses:** Chemical 7 (better than meso-predator's 6), Visual 4 (better than meso-predator's 3), Vibration 0–1 (vestigial at most). More neural mass allocated to chemical and visual processing in the head.
- **Centralization:** ~0.60 (slightly lower than meso-predator's 0.66 because the larger body requires proportionally more neural mass in the torso for motor relay and organ management, diluting the head's share — but still firmly Tier 3).
- **Attacks:** Bite in the head (stronger jaw muscle than meso-predator). Claws on front limbs. The front limbs are described as "thicker, more powerful, less dexterous" — more muscle, more structural mass than the meso-predator's front limbs.
- **Structural mass:** Denser skin, heavier integument than the meso-predator. Higher structural-to-total ratio across zones, especially torso and head.
- **Locomotion:** All six limbs contribute. Heavier rear limbs. Raw speed ratio should be lower than the meso-predator (bigger animal, proportionally more non-muscle mass) but coordination bonus should be comparable or slightly better (more motor coordination neural mass in the head).

Refer to the stat doc's sense profile: Chemical 7, Visual 4, Vibration 0–1, Centralization ~0.60, Tier 3.

## Format

Output the body map as a section with the same layout as the meso-predator and ambush predator examples in Body-Sim-Design.md:

- Zone table with all mass breakdowns, neural allocations, transducers, attacks, flags
- Pathway diagram with bandwidth values
- Derived values summary

Use the same notation style (the plaintext block format with labeled fields per zone, pathway arrows with bandwidth in parentheses, derived values as bullet list).

## Constraints

- All zone targetWeights must sum to 1.0.
- All neural allocation values within a zone must sum to that zone's neural mass.
- Total mass across all zones must approximately equal the target mass (~90 kg).
- Tissue masses within a zone must sum to the zone's total mass.
- Transducer quality ratings must be consistent with the sense profile in Stat-System-Design.md.
- Pathway topology must be star (Clade A pattern): head to torso, torso to all limbs.
- Vital flags: torso is vital (organs), head is vital (Clade A single brain).
- Mirror zones (left/right pairs) should be noted as mirrors, not fully duplicated, same as in the existing examples.
