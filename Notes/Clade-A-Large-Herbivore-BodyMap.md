### Clade A Large Herbivore — 200 kg total

Six limbs, three pairs. Barrel-shaped body, heavy torso, thick structural mass everywhere. Front pair is paddle-like (digging, pulling vegetation, sculling through water). All six limbs are locomotory. Star topology, head-concentrated but diluted by massive body demands. Tier 3 cognition with spatial mapping emphasis. Defensive attacks only — front limb shove, rear limb kick. No bite (mouth is ventral, adapted for grazing and rooting).

```
HEAD — 12.0 kg                             targetWeight: 0.06
  muscle: 2.50    structural: 2.80    neural: 1.10    sensory: 1.00    connective: 4.60
  Neural allocation:
    chemicalProcessing:  0.28    visualProcessing: 0.26    episodicMemory: 0.22
    integration:         0.14    motorCoordination: 0.10   patternLibrary: 0.08
    threatAssessment:    0.02
  Transducers: chemical 5, visual 5, vibration 0
  Attacks: []
  Locomotion: false    Vital: true

TORSO — 80.0 kg                             targetWeight: 0.34
  muscle: 26.00    structural: 20.00    neural: 0.54    sensory: 0.10    connective: 33.36
  Neural allocation:
    motorRelay: 0.38    chemicalProcessing: 0.08    patternLibrary: 0.08
  Transducers: chemical 1, vibration 0, visual 0
  Attacks: []
  Locomotion: false    Vital: true (organs)

FRONT-L LIMB — 15.0 kg                    targetWeight: 0.08
  muscle: 5.00    structural: 4.20    neural: 0.10    sensory: 0.15    connective: 5.55
  Neural allocation:
    motorControl: 0.08    chemicalProcessing: 0.02
  Transducers: chemical 1, vibration 0, visual 0
  Attacks: [{shove, blunt, canReflex: false}]
  Locomotion: true    Vital: false

FRONT-R LIMB — 15.0 kg                    targetWeight: 0.08
  (mirror of front-L)

MID-L LIMB — 18.0 kg                      targetWeight: 0.10
  muscle: 9.00    structural: 3.80    neural: 0.08    sensory: 0.00    connective: 5.12
  Neural allocation:
    motorControl: 0.08
  Transducers: none
  Attacks: []
  Locomotion: true    Vital: false

MID-R LIMB — 18.0 kg                      targetWeight: 0.10
  (mirror of mid-L)

REAR-L LIMB — 21.0 kg                     targetWeight: 0.12
  muscle: 11.00    structural: 4.40    neural: 0.08    sensory: 0.00    connective: 5.52
  Neural allocation:
    motorControl: 0.08
  Transducers: none
  Attacks: [{kick, blunt, canReflex: false}]
  Locomotion: true    Vital: false

REAR-R LIMB — 21.0 kg                     targetWeight: 0.12
  (mirror of rear-L)
```

**Pathways:**
```
head ──(0.8)──► torso
torso ──(0.6)──► front-L
torso ──(0.6)──► front-R
torso ──(0.5)──► mid-L
torso ──(0.5)──► mid-R
torso ──(0.5)──► rear-L
torso ──(0.5)──► rear-R
```

**Derived values:**
- Total neural: 2.16 kg
- Peak concentration: 1.10 / 2.16 = 0.509 (head) — Tier 3
- Locomotion muscle: 50.00 kg (front pair 10.00 + mid pair 18.00 + rear pair 22.00)
- Raw speed ratio: 50.00 / 200.0 = 0.250
- Coordination bonus: motorCoordination 0.10 in head
- Knockout vulnerability: HIGH (head at 0.509 — above 0.30 threshold, though lower than either predator)

---

### Design Notes

**Mass distribution rationale:** The torso dominates at 40% of total mass (80 kg), reflecting the barrel-shaped body described in the creature profile. Limbs scale rearward: front pair (15%) is the lightest because the paddle-limbs trade muscle for structural and connective mass; mid pair (18%) is the primary land locomotion pair; rear pair (21%) is the heaviest limb set, providing the main thrust on land and the power stroke in water. The head at 6% is the smallest proportional head of any Clade A body map — at 200 kg the brain doesn't need to scale linearly with the body, and the head serves no offensive function.

**Structural mass rationale:** Total structural mass is 47.60 kg, or 23.8% of body mass. This is the highest structural ratio of any body map:

| Creature | Total Mass | Structural Mass | Structural % |
|---|---|---|---|
| Clade A Meso-Predator | 22 kg | 4.44 kg | 20.2% |
| Clade B Ambush Predator | 24 kg | 4.60 kg | 19.2% |
| Clade A Apex Predator | 90 kg | 17.10 kg | 19.0% |
| Clade B Small Herbivore | 5 kg | 0.76 kg | 15.2% |
| **Clade A Large Herbivore** | **200 kg** | **47.60 kg** | **23.8%** |

The front paddle-limbs have the highest per-zone structural ratio (28%) — broader, flatter limbs with heavy integument and connective reinforcement for digging and water resistance. The torso at 25% structural reflects the thick, water-adapted skin described in the creature profile.

**Neural architecture:** Total neural mass is 2.16 kg (1.08% of body mass), significantly lower as a body-mass fraction than either predator (meso at 5.86%, apex at 2.31%). The absolute neural mass is higher than the meso-predator (1.29 kg) but lower than the apex (2.08 kg) — this 200 kg creature has roughly the same amount of brain as a 90 kg predator. The brain doesn't scale with body mass; it scales with cognitive demand.

The centralization score of 0.509 is the lowest of any Clade A creature, driven by the torso's 0.54 kg of motor relay neural mass — the "trunk line tax" of routing commands through an 80 kg body to six massive limbs. The head still holds a clear majority of neural mass and the creature is firmly Tier 3, but the body's sheer bulk dilutes the concentration. This matches the design spec: Tier 3 with spatial mapping and threat avoidance capability, but less tactically sharp than the predators.

**Neural allocation comparison:**

| Function | Meso-Predator | Apex Predator | Large Herbivore |
|---|---|---|---|
| chemicalProcessing (head) | 0.25 | 0.38 | 0.28 |
| visualProcessing (head) | 0.10 | 0.20 | 0.26 |
| episodicMemory | 0.18 | 0.26 | 0.22 |
| threatAssessment | 0.04 | 0.06 | 0.02 |
| motorCoordination | 0.08 | 0.10 | 0.10 |

The herbivore invests more in visual processing than either predator (0.26 vs 0.20 and 0.10), consistent with its Visual 5 rating and open-terrain lifestyle. Chemical processing is moderate — good enough for aquatic mineral detection but not predator-tier chemical tracking. Threat assessment is minimal (0.02) because this animal avoids threats spatially rather than analyzing them tactically. Episodic memory is substantial (0.22) — this creature remembers productive feeding sites, safe water crossings, and dangerous areas across a large home range.

**Sensory coverage:** Chemical 5 transducers in the head and chemical 1 on each front paddle-limb (used during substrate rooting — the tips taste what they dig through). Visual 5 in the head provides the best distance vision of any body map drafted so far. No vibration sensing anywhere — standard Clade A absence. Losing the head eliminates all primary sensing. The front limb chemical 1 transducers are incidental — enough to taste food, nowhere near enough to detect threats.

**Attack profile:** Two defensive attack types on four zones. The front paddle-limbs each carry a "shove" (blunt damage) — these are heavy, broad limbs with 5.00 kg of muscle and 15.0 kg of total mass behind them, producing high momentum-based damage even with modest force multiplication. The rear limbs each carry a "kick" (blunt damage) — 11.00 kg of muscle in a 21.0 kg limb, the hardest single-zone strike in the body. No head attack — the ventral mouth is adapted for grazing, not combat. All attacks are canReflex: false (Clade A limb ganglia lack the local neural mass for independent reflexive response).

The shove attack is distinctive: low muscle-force component but extreme momentum component (15 kg zone mass). Against small creatures, it functions as a knockback or area denial. Against player-sized targets, it's a blunt-force hit that relies on mass rather than sharpness. The kick is more conventional — high muscle force from the rear limbs, blunt impact.

**Speed comparison across body maps:**

| Creature | Mass | Loco Muscle | Raw Speed Ratio | Coordination Bonus |
|---|---|---|---|---|
| Clade A Meso-Predator | 22 kg | 6.50 kg | 0.295 | 0.08 (head) |
| Clade B Ambush Predator | 24 kg | 5.80 kg | 0.242 | none |
| Clade A Apex Predator | 90 kg | 25.60 kg | 0.284 | 0.10 (head) |
| Clade B Small Herbivore | 5 kg | 1.80 kg | 0.360 | none |
| **Clade A Large Herbivore** | **200 kg** | **50.00 kg** | **0.250** | **0.10 (head)** |

The large herbivore has the most locomotion muscle in absolute terms (50 kg) but the second-lowest raw speed ratio (0.250). The coordination bonus of 0.10 matches the apex predator — same gait-coordination investment — but the mass penalty dominates. This creature is slow. Its survival strategy is not speed but mass (hard to damage), structural density (hard to penetrate), and water access (retreat to an environment where most predators can't follow).

**Pathway topology:** Pure star, seven connections, standard Clade A. Bandwidth is slightly lower than the predators — head-torso at 0.8 vs the predators' 0.9, front limbs at 0.6 vs 0.7. This reflects a body optimized for steady locomotion and spatial awareness rather than fast predatory response. The creature doesn't need sub-second reaction time; it needs reliable motor relay to coordinate six massive limbs through varied terrain and water.

**Destruction analysis:** Destroying the head eliminates 50.9% of neural mass, all chemical and visual sensing, episodic memory, integration, motor coordination, and threat assessment. The creature loses all coordinated behavior and reverts to aimless wandering — each limb's 0.08-0.10 kg ganglion can manage local motor control but nothing else. Destroying the torso kills the creature (vital organs) and severs all pathways. Destroying a single limb costs 3.7-4.6% of neural mass (negligible cognitive impact) and reduces speed proportionally — losing one rear limb drops locomotion muscle from 50.00 to 39.00 kg. The creature is durable enough that destroying multiple zones before it reaches water is the primary tactical challenge.

**Ecological context:** This body map produces a creature that is expensive to fight and unrewarding to kill — exactly the intended gameplay role. It has more total HP than any other surface creature (200 kg * HP_PER_KG), the highest structural mass for damage reduction, and attacks that punish melee engagement without being lethal. The player learns to leave it alone or to use it as ambient terrain — a large, slow, predictable obstacle that populates the coastlines and makes the water margins feel alive.
