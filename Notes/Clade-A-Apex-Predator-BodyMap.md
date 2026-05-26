### Clade A Apex Predator — 90 kg total

```
HEAD — 8.0 kg                              targetWeight: 0.08
  muscle: 2.00    structural: 1.60    neural: 1.26    sensory: 0.90    connective: 2.24
  Neural allocation:
    chemicalProcessing:  0.38    visualProcessing: 0.20    episodicMemory: 0.26
    integration:         0.20    motorCoordination: 0.10   threatAssessment: 0.06
    patternLibrary:      0.06
  Transducers: chemical 7, visual 4, vibration 0
  Attacks: [{bite, puncture, canReflex: false}]
  Locomotion: false    Vital: true

TORSO — 30.0 kg                             targetWeight: 0.30
  muscle: 10.50    structural: 5.50    neural: 0.42    sensory: 0.10    connective: 13.48
  Neural allocation:
    motorRelay: 0.26    chemicalProcessing: 0.08    patternLibrary: 0.08
  Transducers: chemical 1, vibration 0, visual 0
  Attacks: []
  Locomotion: false    Vital: true (organs)

FRONT-L LIMB — 8.0 kg                     targetWeight: 0.10
  muscle: 3.80    structural: 1.60    neural: 0.08    sensory: 0.12    connective: 2.40
  Neural allocation:
    motorControl: 0.06    chemicalProcessing: 0.02
  Transducers: chemical 1, vibration 1, visual 0
  Attacks: [{claw, slashing, canReflex: false}]
  Locomotion: true    Vital: false

FRONT-R LIMB — 8.0 kg                     targetWeight: 0.10
  (mirror of front-L)

MID-L LIMB — 8.5 kg                       targetWeight: 0.10
  muscle: 4.20    structural: 1.60    neural: 0.06    sensory: 0.00    connective: 2.64
  Neural allocation:
    motorControl: 0.06
  Transducers: none
  Attacks: []
  Locomotion: true    Vital: false

MID-R LIMB — 8.5 kg                       targetWeight: 0.10
  (mirror of mid-L)

REAR-L LIMB — 9.5 kg                      targetWeight: 0.11
  muscle: 4.80    structural: 1.80    neural: 0.06    sensory: 0.00    connective: 2.84
  Neural allocation:
    motorControl: 0.06
  Transducers: none
  Attacks: []
  Locomotion: true    Vital: false

REAR-R LIMB — 9.5 kg                      targetWeight: 0.11
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
- Total neural: 2.08 kg
- Peak concentration: 1.26 / 2.08 = 0.61 (head) — Tier 3
- Locomotion muscle: 25.60 kg (all six limbs)
- Raw speed ratio: 25.60 / 90.0 = 0.284
- Coordination bonus: motorCoordination 0.10 in head (slightly better than meso-predator's 0.08)
- Knockout vulnerability: HIGH (head at 0.61 — lower than meso-predator's 0.66 but still well above 0.30 threshold)
