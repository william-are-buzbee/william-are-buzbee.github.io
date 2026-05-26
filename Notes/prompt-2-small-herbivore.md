# Body Map Drafting — Clade B Small Herbivore

You have five design documents attached, plus the completed apex predator body map from the previous session:

- **Body-Sim-Design.md** — the body simulation system, zone composition format, derived value formulas, pathway topology, and two completed body maps (Clade A meso-predator at 22 kg, Clade B ambush predator at 24 kg)
- **Stat-System-Design.md** — derived stat definitions, sense profiles per creature, cognitive tier thresholds, combat value formulas
- **Mutation-Design.md** — how mutations modify the body map, what tissue changes each creature type drives
- **Ecology-Foundations.md** — clade architecture patterns, sensory paradigms, neural organization, reproduction, body plan ancestry
- **Surface-Creatures.md** — creature role descriptions, behavioral profiles, sense priorities, size ranges, habitat
- **The completed apex predator body map** (attach the finalized version from the previous session as additional reference)

Your job is to draft a full body map for the Clade B small herbivore, matching the format and level of detail of the completed maps in Body-Sim-Design.md. The body map needs:

1. **Every zone** with full mass breakdown (muscle, structural, neural, sensory, connective) and total zone mass
2. **Neural allocation** per zone (which functions the local neural mass is spent on, in kg, summing to the zone's neural total)
3. **Transducers** per zone (chemical, vibration, visual quality ratings)
4. **Attacks** per zone (key, name, damage type, canReflex flag) — or empty if the zone has none
5. **Zone flags** (locomotion, vital, targetWeight)
6. **Pathway topology** with bandwidth values
7. **Derived value summary** (total neural mass, peak concentration and tier, locomotion muscle total, raw speed ratio, coordination bonus or lack thereof, knockout vulnerability)

## The Creature

### Clade B Small Herbivore (~5 kg)

Apply the Clade B template at small scale with no offensive capability. Eight-limb, four-pair body plan, mesh topology, distributed ganglia.

- **Mass:** ~5 kg. Small, light, high dodge potential.
- **Senses:** Vibration 5 (primary, distributed across all limbs — mechanoreceptors on every limb that contacts the ground), Visual 4 (good motion detection, four diamond-pattern eyes in the head), Chemical 2 (minor, front limb tips only).
- **Centralization:** ~0.15 (Tier 1, fully distributed). No zone should hold more than ~15–20% of total neural mass. Head is modestly larger than individual limbs neurally but not by much.
- **Attacks:** None offensive. The creature flees, it doesn't fight. If any zone has a defensive capability (curl/shell), represent that as high structural mass rather than an attack. No canReflex attacks.
- **Neural allocation:** Pattern library in every limb ganglion (territory-trained stimulus-response). Vibration processing in every ground-contact limb. Motor control everywhere. No episodic memory, no integration, no threat assessment (Tier 1). Minimal motor relay in torso (mesh topology means less routing through trunk).
- **Locomotion:** Rear two pairs are locomotory. Front two pairs are grazing limbs (not locomotion-flagged). The front limbs are described as "long, thin, independently active" grazing structures — low muscle, low structural, some sensory (mechanoreceptors + chemical at the tips), moderate neural for independent motor programs.
- **Speed:** High raw speed ratio. Light body, strong rear locomotion muscle relative to total mass. No coordination bonus (distributed, no centralized motor coordination). Fast through raw power-to-weight, not efficiency.
- **Pathway topology:** Mesh. Direct connections between adjacent limb pairs. Cross-connections between left and right. Some torso bypass routes. Resilient to single-zone loss.
- **Head:** Small. The four eyes live here. Modest visual processing. Some vibration processing. Integration is minimal (Tier 1). The head is NOT vital — Clade B heads are not vital in the ambush predator template either. Torso is vital (organs).

Refer to the stat doc's sense profile: Chemical 2, Vibration 5, Visual 4, Centralization ~0.15, Tier 1.

## Format

Output the body map as a section with the same layout as the meso-predator and ambush predator examples in Body-Sim-Design.md:

- Zone table with all mass breakdowns, neural allocations, transducers, attacks, flags
- Pathway diagram with bandwidth values
- Derived values summary

Use the same notation style (the plaintext block format with labeled fields per zone, pathway arrows with bandwidth in parentheses, derived values as bullet list).

## Constraints

- All zone targetWeights must sum to 1.0.
- All neural allocation values within a zone must sum to that zone's neural mass.
- Total mass across all zones must approximately equal the target mass (~5 kg).
- Tissue masses within a zone must sum to the zone's total mass.
- Transducer quality ratings must be consistent with the sense profile in Stat-System-Design.md.
- Pathway topology must be mesh (Clade B pattern): multiple routes, direct limb-to-limb connections, torso bypass paths.
- Vital flags: torso is vital (organs), head is NOT vital (Clade B distributed ganglia).
- Mirror zones (left/right pairs) should be noted as mirrors, not fully duplicated, same as in the existing examples.
