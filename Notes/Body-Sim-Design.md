# Body Simulation Design

System design for locational damage, hit resolution, physical combat modeling, and neural architecture. Every gameplay-relevant number — health, damage, speed, senses, cognition, dodge, stealth — derives from the physical composition of the creature's body map. There are no abstract stats. The body map IS the creature.

The goal is not player-facing complexity — the player sees "you struck the predator's foreleg" in the log and notices it limping. They see derived summary values in the status screen (total mass, speed, primary senses). The simulation runs behind the numbers.

Include this alongside the relevant combat files when implementing.

---

## Core Concept

Every creature has a body map — a collection of body zones, each with its own physical composition measured in mass (kg). When an attack connects, the system determines which zone was hit, applies damage to that zone, and resolves consequences based on what that zone physically contains. Destroying a zone destroys everything in it — muscle, neural tissue, sensory organs, attack capability.

There are no independent stats. Everything the old stat system described — Size, Strength, Chemical, Vibration, Visual, Central, Distributed — is now a derived value computed from the body map. "Size" is total body mass. "Strength" is muscle distribution. Senses are transducer quality plus neural processing in specific zones. Cognition is neural mass distribution across the map. Nothing exists outside the body.

---

## Zone Physical Composition

Each zone is defined by its physical contents, measured in kg:

```js
{
  key: 'front_l_limb',
  name: 'Front-Left Limb',

  // Physical composition (kg)
  muscle: 1.10,           // force production, locomotion, strikes
  structural: 0.35,       // integument, bone-analogue, armor
  neural: 0.22,           // ganglion tissue (see Neural Allocation below)
  sensory: 0.18,          // transducer organs (eyes, mechanoreceptors, chemoreceptors)
  connective: 0.37,       // organs, circulatory, tendons, everything else

  // Total zone mass (sum of above)
  mass: 2.22,

  // Neural allocation (how this zone's neural mass is spent)
  neuralAllocation: {
    vibrationProcessing: 0.10,
    chemicalProcessing:  0.03,
    motorControl:        0.05,
    patternLibrary:      0.04,
  },

  // Transducer quality (what sensory organs are physically here)
  transducers: {
    chemical: { contact: 1, airborne: 0, dissolved: 0 },
    vibration: { ground: 4, air: 0, water: 0 },
    visual: 0,
  },

  // Target profile
  targetWeight: 0.08,     // probability of being hit (all weights sum to 1.0)

  // Zone role
  locomotion: true,        // contributes to movement
  vital: false,            // destruction kills the creature

  // Attacks housed in this zone
  attacks: [
    {
      key: 'hook',
      name: 'Hook',
      damageType: 'puncture',
      accuracy: 0.80,
      targetBias: null,
      canReflex: true,
    }
  ],

  // Bleed properties
  bleedRate: 0.5,
  bleedThreshold: 0.3,

  // Runtime state (not defined in template — initialized at spawn)
  // hp: computed from zone composition
  // maxHp: same
  // destroyed: false
}
```

---

## Derived Gameplay Values

Every number the player experiences comes from the body map. Nothing is assigned independently.

### Total Mass (replaces Size)

```
totalMass = sum of all zone masses
```

A creature's total mass in kg. This is what "Size" used to be. It determines:
- Target profile (bigger = easier to hit, harder to miss)
- Stealth penalty (bigger = harder to hide)
- Food cost (bigger body = more calories to maintain)
- Intimidation (future)
- Terrain interaction (future — tight spaces)

The player sees total mass in kg on the status screen. "24 kg" not "Size 40."

### Zone HP

```
zone.maxHp = Math.floor(zone.mass * HP_PER_KG)
```

HP is proportional to total zone mass. A heavier zone has more stuff to destroy. HP_PER_KG is a tuning constant. The specific tissue composition (more structural = tougher, more muscle = softer) could modify this with a multiplier in future, but zone mass is the primary input.

Creature-level HP displayed to the player is the sum of all zone HPs.

### Dodge

```
dodgeChance = ((DODGE_REFERENCE_MASS - totalMass) / DODGE_REFERENCE_MASS) * MAX_DODGE_PERCENT
```

DODGE_REFERENCE_MASS is the mass at which dodge reaches 0% (the largest thing on the planet — maybe 2500 kg). Smaller creatures have more dodge because there's physically less of them to connect with. A 5 kg creature dodges frequently. A 200 kg creature almost never dodges.

Clamp to 0 minimum. Armor penalties still apply as flat subtractions.

### Stealth

```
stealthEffectiveness = ((STEALTH_REFERENCE_MASS - totalMass) / STEALTH_REFERENCE_MASS) * MAX_STEALTH_PERCENT
```

Same logic as dodge — smaller is stealthier. The specific senses of the detector also matter (chemical detection isn't affected by visual stealth) but this is the base profile.

### Speed

Speed is the creature's ability to cover ground. It derives from the locomotion system, not from the whole body.

```
locomotionMuscle = sum of muscle mass in all zones where locomotion: true
rawSpeedRatio = locomotionMuscle / totalMass
```

This is power-to-weight ratio for movement specifically. A creature with 6 kg of leg muscle moving 22 kg of body has a rawSpeedRatio of 0.27. A creature with 2.5 kg of leg muscle moving 5 kg of body has a rawSpeedRatio of 0.50. The light creature is faster.

**Coordination bonus:** How efficiently the muscle is used depends on motor coordination neural tissue. Centralized gait coordination (one hub timing all limbs into a synchronized gait) extracts more speed from the same muscle than independent limb self-timing.

```
coordinationNeural = sum of motorCoordination allocation across all zones
coordinationBonus = coordinationNeural * COORDINATION_MULT
effectiveSpeed = rawSpeedRatio * (1 + coordinationBonus)
```

A creature with 0.08 kg of centralized motor coordination neural tissue (meso-predator head) gets an efficiency bonus. A creature where each limb manages its own motor program independently (ambush predator) gets no coordination bonus but also doesn't lose speed when one limb's ganglion is destroyed — the others keep self-timing.

**Speed in gameplay:** The effective speed feeds into the existing relative speed system (probabilistic bonus moves for fast enemies, probabilistic skip turns for slow enemies, relative to the player). The formula that produces the bonusMoveChance or skipChance reads effectiveSpeed instead of the old Strength/Size ratio.

**Speed degradation from damage:** When a locomotion zone is destroyed, its muscle is removed from locomotionMuscle. The creature's speed drops proportionally. When a zone containing motor coordination neural tissue is destroyed, the coordination bonus drops. A centralized creature that loses its gait-coordination hub (in the head) loses the efficiency bonus entirely — all remaining limbs revert to independent self-timing, which is slower.

### Damage

Each attack is zone-specific. The damage derives from the physical properties of the zone housing the attack.

**Melee strike damage (claw, hook, bite, kick):**

```
strikeDamage = (zoneMuscle * MUSCLE_FORCE_COEFF) + (zoneMass * MOMENTUM_COEFF)
```

Muscle provides force. Zone mass provides momentum behind the strike. A heavy limb with modest muscle (large herbivore paddle-limb) hits through sheer mass. A light limb with dense muscle (ambush predator hook-limb) hits through force. The coefficients determine the relative contribution — both matter, but muscle is primary.

Each attack type on the zone can have a modifier that scales this base:

```
attackDamage = strikeDamage * attack.damageModifier
```

A bite might have modifier 1.2 (focused through a narrow point). A blunt kick might have modifier 0.8 (spread across a wide surface). This replaces the old baseDamage field on attacks — damage is no longer a fixed number, it's derived from the zone's physical composition and then modified by attack geometry.

**Charge/tackle damage (future system):**

```
tackleDamage = effectiveSpeed * totalMass * TACKLE_COEFF
```

Speed times mass. A fast heavy creature charging is devastating. A fast light creature charging is negligible. A slow heavy creature can't generate the velocity. This emerges naturally from the same body map — no special tackle stat needed.

**Enzymatic/contact damage (colonial chemotroph):**

Not derived from muscle. Derived from the enzymatic secretion capability of the zone, which is a property of the creature's metabolism, stored as a flat value on the attack definition. This is the one attack type that doesn't use the muscle-based formula.

### Senses

Each sense is computed from the body map: transducer quality (the hardware) plus neural processing allocation (the software). Detection is per-zone — there is no creature-level aggregated sensitivity.

Each zone detects independently through its own transducers on specific coupling media. Chemical transducers operate through three media: contact (touch-range surface reading), airborne (volatile sampling at distance), and dissolved (aquatic, future). Vibration transducers operate through three media: ground (substrate contact), air (pressure waves), and water (future). Visual remains a single value per zone.

Detection range per zone: `zoneRange = cbrt(emission) × zoneQuality × channelCoefficient`. Information quality scales continuously with SNR (`zoneRange / distance`) — from bare detection at the edge of range to precise identification at close range with good sensors.

**Processing quality:** A high transducer value in a zone with low neural processing for that sense means raw signal with poor interpretation. A zone with ground vibration 5 but only 0.02 kg of vibration processing neural tissue detects that vibration exists but can't discriminate between signatures well. A zone with ground vibration 5 and 0.15 kg of vibration processing discriminates precisely — it knows what made the vibration, how heavy it is, how fast it's moving, and whether it matches a stored pattern. This bottleneck is folded into how range and SNR produce information, not expressed as a separate derived value.

See Sensory-Design.md for the full detection and information quality framework.

### Cognition

Cognition is not a stat. It's an emergent property of neural mass distribution.

**Centralization score:**

```
centralizationScore = max(zone.neural / totalNeuralMass for all zones)
```

The highest fraction of total neural mass concentrated in any single zone.

**Cognitive tier thresholds:**

| Tier | Centralization | Typical Characteristics |
|---|---|---|
| Tier 1 (< 0.20) | Fully distributed | Reactive dominance. Deep pattern libraries per ganglion. No episodic memory. No integration. Excellent reflexive defense and knockout resistance. |
| Tier 2 (0.20 — 0.40) | Partially centralized | Some deliberative override. Short-term episodic memory. Basic two-modal integration. Modest goal persistence. |
| Tier 3 (> 0.40) | Heavily centralized | Reliable deliberative override. Full episodic memory. Multi-modal integration. Generalization. Threat assessment. Targeted zone attacks. The creature is recognizably intelligent. |

Tiers are derived display labels that correlate with integration capacity ranges, not behavioral gates. All creatures run the same universal reactive rules every turn; the deliberative layer fires when integration capacity is sufficient to override reactive stimulus magnitude. See Cognition-Design.md for the full reactive-deliberative architecture.

These tiers correlate with:
- Examine system depth (higher centralization = more detail when the player examines things, because the player's own centralization determines their anatomical reasoning)
- Targeted attack capability (Tier 3 range required — concentrated processing to reason about where to aim)
- Knockout vulnerability (zones with neural concentration > 0.30 can cause knockout when hit)

**Distribution score:**

```
distributionScore = 1.0 - centralizationScore
```

Higher distribution means:
- Reflexive defense capability (zones can react independently)
- Graceful degradation (no single point of failure)
- Territory-optimized pattern matching (each ganglion builds local stimulus-response library)
- Knockout resistance (no zone holds enough neural mass to cross the knockout threshold)

---

## Neural Allocation

Each zone's neural mass is allocated to specific functions. The allocation is defined per creature type and determines what the local ganglion can do:

| Allocation | What it does | Centralization affinity |
|---|---|---|
| sensoryProcessing (per sense) | Interprets raw transducer input. Higher = richer information extraction. | Neutral — both architectures need it wherever sensors exist |
| motorControl | Manages the local zone's musculature. Every zone with muscle needs some. | Neutral — always local |
| motorCoordination | Synchronizes multiple zones into coordinated whole-body actions (gait, lunge). | Centralization — benefits from one hub timing everything |
| patternLibrary | Stored stimulus-response associations. Local to each ganglion. | Distribution — benefits from being everywhere |
| episodicMemory | Records events as sequences. Requires concentration threshold. | Centralization — requires minimum mass in one place |
| integration | Cross-references multiple sensory modalities and memory. | Centralization — requires convergence of data streams |
| threatAssessment | Evaluates danger by synthesizing current input against past experience. | Centralization — reads from episodic memory and integration |
| motorRelay | Routes commands between zones. Found in torso/trunk zones on the pathway. | Centralization — the trunk line tax |

Not every zone needs every allocation. A mid-limb on a Clade A creature might have only motorControl. A sensor limb on a Clade B creature might have vibrationProcessing, chemicalProcessing, patternLibrary, and motorControl. The allocation reflects what that zone physically does.

---

## Pathways

Neural pathways connect zones, allowing sensory data and motor commands to flow between them. Each pathway has a bandwidth value representing the capacity and speed of the connection.

```js
pathways: [
  { from: 'head', to: 'torso', bandwidth: 0.9 },
  { from: 'torso', to: 'front_l', bandwidth: 0.7 },
  // ...
]
```

**Bandwidth** determines:
- How much sensory data flows between zones (high bandwidth = the receiving zone gets detailed information; low bandwidth = summary signals only)
- How quickly motor commands propagate (high bandwidth = near-instantaneous coordinated response; low bandwidth = delay before the limb acts on a command from a distant ganglion)
- Whether coordination bonuses apply (motor coordination neural tissue can only synchronize limbs it has high-bandwidth connections to)

**Topology patterns:**

Clade A: star topology. Head connects to torso (thick pathway), torso connects to all limbs. Everything routes through the torso trunk line. No direct limb-to-limb connections. Efficient when intact. Catastrophic when the torso or head is destroyed — every connection is severed.

Clade B: mesh topology. Multiple routes between zones. Sensor limbs connect directly to adjacent strike limbs. Rear limbs cross-connect. Some connections bypass the torso entirely. Less efficient (more wiring cost, weaker individual connections) but resilient — destroying one zone doesn't disconnect the network because alternate routes exist.

**Severance:** When a zone is destroyed, all pathways routing through it are cut. Surviving zones check whether they can still reach other zones through remaining pathways. Zones that lose all connections to other zones operate fully autonomously — local capability only, no integration, no coordinated timing, no commands from distant ganglia.

For a centralized creature, torso destruction severs head from all limbs. The head has full cognitive capability but no body to command. The limbs have minimal local neural mass and can barely function independently.

For a distributed creature, torso destruction cuts some routes but direct limb-to-limb connections survive. The creature fragments into sub-clusters that each retain local competence. Less coordinated, but each fragment is still capable.

---

## Reflexive Defense

A zone with sufficient neural mass, local senses, and a reflex-capable attack can independently strike entities that enter adjacent tiles from outside the creature's primary attention arc.

**Conditions:**
- Zone has neural mass >= REFLEX_NEURAL_THRESHOLD (tuning value, maybe 0.08-0.10 kg)
- Zone has at least one local transducer above 0 that can detect the approaching entity
- Zone has at least one attack with canReflex: true
- The approaching entity enters from a direction outside the creature's primary sensory arc (the arc of the zone with the highest neural mass)

**Properties of reflexive strikes:**
- Damage derived from the local zone's muscle and mass only — not the creature's committed full-body strike
- No zone targeting — hits a random zone on the attacker weighted by target weights. The local ganglion doesn't reason about anatomy.
- Accuracy lower than a deliberate attack (scaled by a REFLEX_ACCURACY_PENALTY constant)
- One reflexive strike per zone per turn maximum

---

## Hit Resolution

### Step 1 — Zone Selection

**Untargeted attack (default):** Weighted random based on zone targetWeight values. Larger zones get hit more often.

**Targeted attack:** Requires the attacker's centralization score above TARGETED_ATTACK_THRESHOLD (tier 3). Accuracy penalty scales with how small the target zone is (lower targetWeight = harder to aim for). If the accuracy check fails, the hit either misses entirely or hits a random zone.

### Step 2 — Damage Application

```
zoneArmor = zone.structural * ARMOR_PER_STRUCTURAL_KG
effectiveDamage = max(1, incomingDamage - zoneArmor)
zone.hp -= effectiveDamage
```

Armor derives from the structural mass in the zone. More integument/bone = more damage reduction. This replaces the old flat armor value — it's now physical.

### Step 3 — Consequence Resolution

**Zone destroyed (HP reaches 0):**
- If vital: true → creature dies.
- All neural mass in this zone is permanently lost. Recompute centralization and distribution scores.
- All transducers in this zone are lost. Per-zone detection ranges update accordingly.
- All attacks in this zone become unavailable.
- All muscle in this zone is lost. Recompute locomotion speed (if locomotion zone) and potential strike damage for any attacks that were here.
- All pathways through this zone are severed. Recompute connectivity.
- If total remaining neural mass < NEURAL_DEATH_THRESHOLD fraction of original → creature dies from systemic neural failure.
- If all locomotion zones destroyed → creature is immobilized.
- Log message: "You sever the predator's front limb."

**Zone damaged below 50% HP:**
- Zone capabilities degrade proportionally. Muscle output at 40% of zone HP produces 40% of its contribution to locomotion and attack damage. Transducers at 30% HP reduce that zone's detection quality by 70%. Neural tissue in a damaged zone is not lost until destruction but processing degrades.

**Zone damaged below bleed threshold:**
- Zone begins bleeding (see Bleed System below).

---

## Bleed System

**Bleed accumulation:** Each damaged zone whose HP is below bleedThreshold × maxHp adds bleedRate to a creature-wide totalBleed counter each turn. Multiple bleeding zones stack.

**Bleed effects:**
- totalBleed > 30% of creature's total maxHp → weakened (speed reduced, attack damage reduced)
- totalBleed > 60% → critically weakened (severe penalties, may flee)
- totalBleed > 90% → death from blood loss

**Bleed stoppage:** Bleed naturally slows over time (clotting). Some creatures may clot faster. Rest or healing mechanics could stop bleed entirely.

---

## Unconsciousness

**Pain accumulation:** Each hit adds to a painTotal. When painTotal exceeds a threshold (scaled by total body mass — bigger creatures tolerate more pain), the creature falls unconscious.

**Neural trauma knockout:** A hit to a zone where (zone.neural / totalNeuralMass) >= 0.30 has a chance to cause immediate unconsciousness, scaled by damage relative to zone HP. Centralized creatures are vulnerable (head at 0.55+ concentration). Distributed creatures are nearly immune (no zone above 0.16).

**Unconscious state:** Creature can't act. Automatically hit by attacks. May die from bleed or wake up if pain fades and bleeding stops.

---

## Creature Global HP

Creature-level HP is the sum of all zone HPs. This is what the player sees in the status display. Two creatures at 50% HP are not equivalent — one may have all zones lightly damaged, the other may have its primary cognitive zone destroyed with the rest intact.

---

## Clade Architecture Patterns

### Clade A — Centralized

- Neural mass concentrated in head (50-65% of total)
- Primary senses concentrated in head
- Limb ganglia vestigial (0.03-0.05 kg each, motor control only)
- Star topology pathways (everything routes through torso)
- Typically Tier 3 range: reliable deliberative override, full episodic memory, integration, threat assessment
- High knockout vulnerability
- Flanking effective (limbs can't independently detect or react)
- Single point of failure (head destruction is cognitively catastrophic)

### Clade B — Distributed

- Neural mass spread across most zones (no zone above 15-20%)
- Senses distributed across multiple zones (vibration especially)
- Limb ganglia significant (0.10-0.28 kg each, full local processing)
- Mesh topology pathways (redundant connections, limb-to-limb bypasses)
- Typically Tier 1-2 range: reactive dominance, deep pattern libraries, modest integration at best
- Low knockout vulnerability
- Flanking ineffective (limbs detect and react independently via reflexive defense)
- No single point of failure (graceful degradation)

### The Player

Starts with a Clade A body map. Through mutation from consuming Clade B creatures, neural mass redistributes — growing ganglia in limb zones, developing mechanoreceptors. The body map physically changes. A late-game mutated player's head might hold 0.30 neural mass instead of 0.55, with the difference grown into limbs. They gain reflexive defense but lose reliable deliberative override (reduced examine depth, reduced targeted attack accuracy). The mutation system modifies the body map directly.

---

## Example Body Maps

### Clade A Meso-Predator — 22 kg total

```
HEAD — 3.5 kg                              targetWeight: 0.10
  muscle: 0.80    structural: 0.60    neural: 0.85    sensory: 0.50    connective: 0.75
  Neural allocation:
    chemicalProcessing:  0.25    visualProcessing: 0.10    episodicMemory: 0.18
    integration:         0.15    motorCoordination: 0.08   threatAssessment: 0.04
    patternLibrary:      0.05
  Transducers: chemical { contact: 2, airborne: 6, dissolved: 0 }, visual 3, vibration { ground: 0, air: 2, water: 0 }
  Attacks: [{bite, puncture, canReflex: false}]
  Locomotion: false    Vital: false

TORSO — 7.5 kg                              targetWeight: 0.30
  muscle: 3.00    structural: 1.50    neural: 0.22    sensory: 0.08    connective: 2.70
  Neural allocation:
    motorRelay: 0.12    chemicalProcessing: 0.05    patternLibrary: 0.05
  Transducers: chemical { contact: 1, airborne: 0, dissolved: 0 }, vibration { ground: 0, air: 0, water: 0 }, visual 0
  Attacks: []
  Locomotion: false    Vital: true (organs)

FRONT-L LIMB — 1.6 kg                      targetWeight: 0.08
  muscle: 0.85    structural: 0.35    neural: 0.05    sensory: 0.05    connective: 0.30
  Neural allocation:
    motorControl: 0.04    chemicalProcessing: 0.01
  Transducers: chemical { contact: 1, airborne: 0, dissolved: 0 }, vibration { ground: 1, air: 0, water: 0 }, visual 0
  Attacks: [{claw, slashing, canReflex: false}]
  Locomotion: true    Vital: false

FRONT-R LIMB — 1.6 kg                      targetWeight: 0.08
  (mirror of front-L)

MID-L LIMB — 1.9 kg                        targetWeight: 0.09
  muscle: 1.10    structural: 0.40    neural: 0.04    sensory: 0.00    connective: 0.36
  Neural allocation:
    motorControl: 0.04
  Transducers: chemical { contact: 0, airborne: 0, dissolved: 0 }, vibration { ground: 1, air: 0, water: 0 }
  Attacks: []
  Locomotion: true    Vital: false

MID-R LIMB — 1.9 kg                        targetWeight: 0.09
  (mirror of mid-L)

REAR-L LIMB — 2.1 kg                       targetWeight: 0.08
  muscle: 1.30    structural: 0.42    neural: 0.04    sensory: 0.00    connective: 0.34
  Neural allocation:
    motorControl: 0.04
  Transducers: chemical { contact: 0, airborne: 0, dissolved: 0 }, vibration { ground: 1, air: 0, water: 0 }
  Attacks: []
  Locomotion: true    Vital: false

REAR-R LIMB — 2.1 kg                       targetWeight: 0.08
  (mirror of rear-L)
```

**Pathways:**
```
head ──(0.9)──► torso
torso ──(0.7)──► front-L
torso ──(0.7)──► front-R
torso ──(0.5)──► mid-L
torso ──(0.5)──► mid-R
torso ──(0.5)──► rear-L
torso ──(0.5)──► rear-R
```

**Derived values:**
- Total neural: 1.29 kg
- Peak concentration: 0.85 / 1.29 = 0.66 (head) — Tier 3
- Locomotion muscle: 6.50 kg (all six limbs)
- Raw speed ratio: 6.50 / 22.0 = 0.295
- Coordination bonus: motorCoordination 0.08 in head
- Knockout vulnerability: HIGH (head at 0.66)

---

### Clade B Ambush Predator — 24 kg total

```
HEAD — 2.2 kg                              targetWeight: 0.08
  muscle: 0.40    structural: 0.50    neural: 0.28    sensory: 0.35    connective: 0.67
  Neural allocation:
    visualProcessing: 0.12    vibrationProcessing: 0.06    integration: 0.05
    motorControl: 0.03       patternLibrary: 0.02
  Transducers: visual 3, vibration { ground: 0, air: 2, water: 0 }, chemical { contact: 0, airborne: 0, dissolved: 0 }
  Attacks: [{bite, puncture, canReflex: false}]
  Locomotion: false    Vital: false

TORSO — 6.0 kg                              targetWeight: 0.24
  muscle: 2.20    structural: 1.30    neural: 0.20    sensory: 0.15    connective: 2.15
  Neural allocation:
    motorRelay: 0.08    vibrationProcessing: 0.06    patternLibrary: 0.06
  Transducers: vibration { ground: 1, air: 0, water: 0 }, chemical { contact: 0, airborne: 0, dissolved: 0 }, visual 0
  Attacks: []
  Locomotion: false    Vital: true (organs)

SENSOR-L LIMB — 1.8 kg                     targetWeight: 0.06
  muscle: 0.50    structural: 0.25    neural: 0.28    sensory: 0.40    connective: 0.37
  Neural allocation:
    vibrationProcessing: 0.15    chemicalProcessing: 0.06
    patternLibrary: 0.05        motorControl: 0.02
  Transducers: vibration { ground: 5, air: 2, water: 0 }, chemical { contact: 2, airborne: 0, dissolved: 0 }, visual 0
  Attacks: [{probe, puncture, canReflex: true}]
  Locomotion: false    Vital: false

SENSOR-R LIMB — 1.8 kg                     targetWeight: 0.06
  (mirror of sensor-L)

FRONT-L LIMB — 2.2 kg                      targetWeight: 0.08
  muscle: 1.10    structural: 0.35    neural: 0.22    sensory: 0.18    connective: 0.37
  Neural allocation:
    vibrationProcessing: 0.10    chemicalProcessing: 0.03
    motorControl: 0.05          patternLibrary: 0.04
  Transducers: vibration { ground: 4, air: 1, water: 0 }, chemical { contact: 1, airborne: 0, dissolved: 0 }, visual 0
  Attacks: [{hook, puncture, canReflex: true}]
  Locomotion: true    Vital: false

FRONT-R LIMB — 2.2 kg                      targetWeight: 0.08
  (mirror of front-L)

REAR-L LIMB — 2.9 kg                       targetWeight: 0.09
  muscle: 1.80    structural: 0.45    neural: 0.18    sensory: 0.12    connective: 0.35
  Neural allocation:
    vibrationProcessing: 0.06    visualProcessing: 0.04
    motorControl: 0.05          patternLibrary: 0.03
  Transducers: vibration { ground: 2, air: 1, water: 0 }, visual 1, chemical { contact: 0, airborne: 0, dissolved: 0 }
  Attacks: [{kick, blunt, canReflex: true}]
  Locomotion: true    Vital: false

REAR-R LIMB — 2.9 kg                       targetWeight: 0.09
  (mirror of rear-L)
```

**Pathways:**
```
head ──(0.5)──► torso
torso ──(0.4)──► sensor-L
torso ──(0.4)──► sensor-R
torso ──(0.5)──► front-L
torso ──(0.5)──► front-R
torso ──(0.4)──► rear-L
torso ──(0.4)──► rear-R
sensor-L ──(0.3)──► front-L       (direct detection-to-strike)
sensor-R ──(0.3)──► front-R       (direct detection-to-strike)
front-L ──(0.2)──► front-R        (cross-body)
rear-L ──(0.2)──► rear-R          (rear pair coordination)
```

**Derived values:**
- Total neural: 1.84 kg
- Peak concentration: 0.28 / 1.84 = 0.15 (sensor limbs and head tied) — Tier 1
- Locomotion muscle: 5.80 kg (front pair + rear pair)
- Raw speed ratio: 5.80 / 24.0 = 0.242
- Coordination bonus: none (no centralized motorCoordination)
- Knockout vulnerability: VERY LOW (no zone above 0.16)

---

### Destruction Comparison

| Action | Meso-Predator (Clade A) | Ambush Predator (Clade B) |
|---|---|---|
| Destroy head | 66% neural mass lost. Bite gone. Chemical 6, visual 3 gone. Creature wanders aimlessly — no tracking, no memory, no decisions. Functionally dead. | 15% neural mass lost. Bite gone. Visual 3 lost. Modest integration lost. Every limb still fully functional. Creature becomes pure reflex — less coordinated, still dangerous. |
| Destroy torso | Dead (vital organs) + all limb pathways severed. Head intact but commands nothing. | Dead (vital organs). Sub-clusters briefly linked via direct limb pathways. |
| Destroy one limb | ~3% neural loss. Negligible cognitive impact. Speed loss of ~1/6. | ~12% neural loss. One flank's detection and strike capability gone. Rest fully capable. |
| Flanking | Free hit. Limb ganglia can't detect or react independently. | Rear limbs detect via vibration + visual 1 and kick reflexively. No free hits. |
| Knockout attempt | Head zone at 0.66 concentration. High knockout chance on a solid hit. | No zone above 0.16. Knockout is nearly impossible. |
| Best player strategy | Target the head. One well-aimed strike can end the fight. | No high-value target. Destroy enough limbs to reduce coverage, or target the torso for the kill. |

---

## Creature Authoring — Templates

Defining full body maps with mass breakdowns, neural allocations, and pathways for every creature is labor-intensive. Templates reduce this to a few high-level inputs:

**Template inputs:**
- Total body mass (kg)
- Clade (A or B — determines limb count, topology pattern, neural distribution pattern)
- Role (predator, herbivore, chemotroph — influences muscle distribution, attack placement)
- Niche specialization (ambush, pursuit, grazer, colonial — adjusts specific zone proportions)
- Primary sense (chemical, vibration, visual — determines sensory organ placement and neural processing allocation)
- Centralization degree (0.0-1.0 — controls how much neural mass concentrates in the head)

**Template outputs:**
- Full zone list with mass breakdowns
- Neural allocation per zone
- Transducer placement
- Pathway topology
- Attack definitions

Individual creatures override specific zones where they diverge from the template. The meso-predator is a "Clade A pursuit predator, 22 kg, chemical-primary, centralization 0.66" with no overrides needed. A variant meso-predator on a different island might be the same template at 18 kg with visual as primary sense (adapted to open terrain) — most of the body map generates automatically, only the sensory layout changes.

---

## Interaction with Other Systems

### Mutation System
Mutations physically modify the body map. Eating Clade B creatures grows neural mass in limb zones (increasing zone.neural, adding vibrationProcessing to the neural allocation, adding mechanoreceptor transducers). The head's neural mass fraction decreases proportionally — the total neural mass may grow but the concentration shifts. A Clade A player developing Clade B neural architecture is physically restructuring their body map.

### Speed System
The relative speed system reads effectiveSpeed (derived from locomotionMuscle / totalMass + coordinationBonus) instead of the old Strength / Size ratio. The turn agility system reads totalMass instead of the old Size stat. All inputs come from the body map.

### Spawn System
Body maps are defined per creature type via templates. All meso-predators share the same template. Future individual variance would be small modifiers to template outputs, not full random generation.

### Save System
Zone runtime state (current HP, destroyed flag) must be persisted per creature. Zone composition (mass breakdowns, neural allocation) is static per creature type and recomputed from the template at load — only damage states need saving.

### What the Player Sees
The player sees derived summary values on the status screen:
- Total mass in kg
- Effective speed (derived)
- Primary senses with quality indicators (derived from per-zone transducer qualities — see Sensory-Design.md). The status display may summarize the best quality per sense type for readability, but the underlying detection system operates per-zone.
- Cognitive tier description ("centralized" or "distributed" or "partially distributed")
- Zone damage states when examining (gated by their own centralization score)

They do not see: individual zone mass breakdowns, neural allocations, pathway bandwidths, or tissue composition ratios. The simulation is deep. The presentation is simple.

---

## Implementation Phases

### Phase 1 — Body maps and zone selection (DONE)
Body map definitions on creature data. Attack hits roll for zone selection. Damage applied to selected zone. Log which zone was hit. No functional consequences.

### Phase 2 — Zone destruction and physical consequences
Destroy zones at 0 HP. Remove neural mass, transducers, attacks, locomotion contribution. Recompute all derived values (speed, senses, cognition scores, pathway connectivity). Check neural death threshold. Log messages describing what was lost.

### Phase 3 — Derived gameplay values
Replace all abstract stat references with body-map-derived calculations. HP from zone mass. Damage from zone muscle. Speed from locomotion muscle ratio. Dodge from total mass. Senses from transducers + processing. Cognition from neural distribution. This is the phase where the old stat system is fully retired.

### Phase 4 — Bleed system
Bleed accumulation from damaged zones. Bleed thresholds. Clotting. AI flee response.

### Phase 5 — Unconsciousness and pain
Pain accumulation. Knockout from neural concentration zones. Unconscious state.

### Phase 6 — Attack sources and degradation
Attacks derive damage from zone composition. Damaged zones produce weaker attacks. Attack loss when zones are destroyed.

### Phase 7 — Reflexive defense
Zones with sufficient neural mass, local senses, and reflex-capable attacks perform reflexive strikes. Conditions, accuracy penalty, one-per-zone limit.

### Phase 8 — Behavioral degradation from neural loss
AI reads current centralization/distribution scores. High neural loss on centralized creatures produces aimless wandering. High neural loss on distributed creatures produces reduced coordination with retained local competence.

### Phase 9 — Targeted attacks (player agency)
Player can target specific zones. Requires centralization score above threshold plus sensory acuity. Accuracy penalty scales with zone size.

### Phase 10 — Chargen revision
Replace abstract stat allocation with body type selection or physical attribute allocation that maps to a body map template. The player chooses high-level physical parameters and the body map generates from those inputs.

---

## What NOT to Change When Building This

- Enemy AI architecture (reactive-deliberative layers, universal rules, integration-based override) — sits above the body sim and reads its outputs
- Spawn system, biome generation, terrain
- Item system, ground items, corpse drops
- FOV calculation internals, rendering pipeline
- Save format structure (add zone states as addition, not restructure)
- Input handling, minimap, day/night cycle

---

## Prompt Reference

When implementing, include:
- This document
- `combat.js` (hit/damage resolution)
- `monsters.js` (creature definitions and body map templates)
- `enemy-ai.js` (behavior reading body sim outputs)
- `state.js` (creature state storage)
- `player.js` (player body map)
- `constants.js` (tuning values — HP_PER_KG, MUSCLE_FORCE_COEFF, MOMENTUM_COEFF, COORDINATION_MULT, REFLEX_NEURAL_THRESHOLD, NEURAL_DEATH_THRESHOLD, TARGETED_ATTACK_THRESHOLD, ARMOR_PER_STRUCTURAL_KG, DODGE_REFERENCE_MASS, STEALTH_REFERENCE_MASS, etc.)
- `Surface-Creatures.md` (creature-specific body zone layouts)
- `Ecology-Foundations.md` (clade-level differences)
- `Stat-System-Design.md` (to be revised — stats become derived values)
- `Mutation-Design.md` (to be revised — mutations modify body map directly)
