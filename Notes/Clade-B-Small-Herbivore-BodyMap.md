### Clade B Small Herbivore — 5.0 kg total

Eight limbs, four pairs. Front two pairs are grazing limbs (long, thin, independently active, not locomotory). Rear two pairs are locomotory. Mesh topology, fully distributed ganglia, Tier 1 cognition. No offensive attacks — this creature flees.

```
HEAD — 0.28 kg                             targetWeight: 0.06
  muscle: 0.04    structural: 0.06    neural: 0.042    sensory: 0.08    connective: 0.058
  Neural allocation:
    visualProcessing:    0.020    vibrationProcessing: 0.010
    patternLibrary:      0.008    motorControl:        0.004
  Transducers: visual 4, vibration 1, chemical 0
  Attacks: []
  Locomotion: false    Vital: false

TORSO — 1.00 kg                             targetWeight: 0.24
  muscle: 0.25    structural: 0.22    neural: 0.022    sensory: 0.02    connective: 0.488
  Neural allocation:
    motorRelay:          0.010    vibrationProcessing: 0.006
    patternLibrary:      0.006
  Transducers: vibration 1, chemical 0, visual 0
  Attacks: []
  Locomotion: false    Vital: true (organs)

FORE-L LIMB — 0.22 kg                      targetWeight: 0.05
  muscle: 0.03    structural: 0.03    neural: 0.028    sensory: 0.05    connective: 0.082
  Neural allocation:
    vibrationProcessing: 0.010    motorControl: 0.008
    patternLibrary:      0.006    chemicalProcessing: 0.004
  Transducers: vibration 5, chemical 2, visual 0
  Attacks: []
  Locomotion: false    Vital: false

FORE-R LIMB — 0.22 kg                      targetWeight: 0.05
  (mirror of fore-L)

MID-GRAZE-L LIMB — 0.22 kg                 targetWeight: 0.05
  muscle: 0.04    structural: 0.03    neural: 0.026    sensory: 0.035    connective: 0.089
  Neural allocation:
    vibrationProcessing: 0.010    motorControl: 0.008
    patternLibrary:      0.006    chemicalProcessing: 0.002
  Transducers: vibration 4, chemical 1, visual 0
  Attacks: []
  Locomotion: false    Vital: false

MID-GRAZE-R LIMB — 0.22 kg                 targetWeight: 0.05
  (mirror of mid-graze-L)

MID-LOCO-L LIMB — 0.58 kg                  targetWeight: 0.10
  muscle: 0.35    structural: 0.08    neural: 0.028    sensory: 0.02    connective: 0.102
  Neural allocation:
    motorControl:        0.012    vibrationProcessing: 0.008
    patternLibrary:      0.008
  Transducers: vibration 3, chemical 0, visual 0
  Attacks: []
  Locomotion: true    Vital: false

MID-LOCO-R LIMB — 0.58 kg                  targetWeight: 0.10
  (mirror of mid-loco-L)

REAR-L LIMB — 0.84 kg                      targetWeight: 0.15
  muscle: 0.55    structural: 0.10    neural: 0.030    sensory: 0.02    connective: 0.140
  Neural allocation:
    motorControl:        0.014    vibrationProcessing: 0.008
    patternLibrary:      0.008
  Transducers: vibration 3, chemical 0, visual 0
  Attacks: []
  Locomotion: true    Vital: false

REAR-R LIMB — 0.84 kg                      targetWeight: 0.15
  (mirror of rear-L)
```

**Pathways:**
```
head ──(0.3)──► torso
torso ──(0.3)──► fore-L
torso ──(0.3)──► fore-R
torso ──(0.3)──► mid-graze-L
torso ──(0.3)──► mid-graze-R
torso ──(0.3)──► mid-loco-L
torso ──(0.3)──► mid-loco-R
torso ──(0.2)──► rear-L
torso ──(0.2)──► rear-R
fore-L ──(0.2)──► fore-R              (cross-body, grazing pair 1)
fore-L ──(0.2)──► mid-graze-L         (adjacent pair, left side)
fore-R ──(0.2)──► mid-graze-R         (adjacent pair, right side)
mid-graze-L ──(0.2)──► mid-graze-R    (cross-body, grazing pair 2)
mid-graze-L ──(0.2)──► mid-loco-L     (adjacent pair, left side)
mid-graze-R ──(0.2)──► mid-loco-R     (adjacent pair, right side)
mid-loco-L ──(0.2)──► mid-loco-R      (cross-body, loco pair 1)
mid-loco-L ──(0.2)──► rear-L          (adjacent pair, left side)
mid-loco-R ──(0.2)──► rear-R          (adjacent pair, right side)
rear-L ──(0.2)──► rear-R              (cross-body, loco pair 2)
```

**Derived values:**
- Total neural: 0.288 kg
- Peak concentration: 0.042 / 0.288 = 0.146 (head) — Tier 1
- Locomotion muscle: 1.80 kg (mid-loco pair 0.70 + rear pair 1.10)
- Raw speed ratio: 1.80 / 5.0 = 0.360
- Coordination bonus: none (no motorCoordination allocation — each limb self-times)
- Knockout vulnerability: VERY LOW (no zone above 0.146 — well below 0.30 threshold)

---

### Design Notes

**Mass distribution rationale:** The rear limb pair is the heaviest structure on the body (33.6% of total mass across the pair), reflecting the creature's primary survival strategy — explosive burst speed. The grazing limbs are the lightest (17.6% across all four), consistent with their description as long, thin manipulators. The torso at 20% holds the vital organs but isn't over-built. The head at 5.6% is the smallest zone — just an eye platform and a modest ganglion.

**Neural architecture:** Total neural mass is 5.76% of body mass, comparable to the ambush predator's 7.67% but lower in absolute terms. The distribution is flat: the head holds 14.6% of neural mass, and no other zone exceeds 10.4% (rear limbs at 0.030/0.288). Every limb has a full local ganglion with its own pattern library, vibration processing, and motor control. The creature processes threats locally — each ground-contact limb independently detects novel vibrations against its memorized territory baseline.

**Sensory coverage:** Vibration 5 transducers on the fore grazing limbs (which are always in contact with the ground during foraging) provide primary detection. Vibration 3-4 on the remaining six limbs provides wide spatial coverage — the creature detects approach from any direction. Visual 4 in the head handles motion detection at close-to-medium range. Chemical 2 on the fore limb tips is incidental — used for food evaluation, not threat detection.

**No attacks:** The creature has zero attack definitions on any zone. Its defensive strategy is structural (the torso's 0.22 kg structural mass supports the armadillo-like curl) and locomotive (0.360 raw speed ratio is the highest of any body map drafted so far). When threatened, it runs. When cornered, it curls. It does not fight.

**Pathway topology:** Full mesh with 20 connections across 10 zones. Every limb connects to its cross-body mirror and to the adjacent pair on the same side. The torso connects to everything. Destroying any single zone leaves all other zones reachable through alternate routes. Destroying the torso (the only vital zone) severs the central hub but leaves four cross-body and eight adjacent-pair direct connections intact — the body fragments into linked sub-clusters that retain local motor and sensory capability during the brief interval before organ death.

**Speed comparison across body maps:**

| Creature | Mass | Loco Muscle | Raw Speed Ratio | Coordination Bonus |
|---|---|---|---|---|
| Clade A Meso-Predator | 22 kg | 6.50 kg | 0.295 | 0.08 (head) |
| Clade B Ambush Predator | 24 kg | 5.80 kg | 0.242 | none |
| Clade A Apex Predator | 90 kg | 25.60 kg | 0.284 | 0.10 (head) |
| **Clade B Small Herbivore** | **5 kg** | **1.80 kg** | **0.360** | **none** |

The small herbivore is the fastest creature by raw ratio. It has no coordination bonus (distributed self-timing) so its effective speed equals its raw speed — but at 0.360, this already exceeds the meso-predator's coordination-boosted output. Combined with its 5 kg mass giving near-maximum dodge chance, this creature is extremely difficult to catch and extremely difficult to hit. The player must corner it against terrain.
