# Sensory System Design — Sensitivity Windows, Signal Quality, and Operational Ranges

Design reference for the transducer and perception systems. Captures principles from extended discussion about how real sensory organs operate across signal ranges, how information quality degrades with signal-to-noise ratio, and how evolution produces multi-window sensor arrays. This document informs both the cognition system (what does the creature learn from what it detects?) and the future perception second pass (rich sensory modeling).

Include alongside Cognition-Design.md and Surface-Creatures.md when working on perception, cognition, AI behavior, or new creature body maps.

---

## Core Principle: Nothing Is Free

No information comes without a physical cost. Detection is not binary — it's a gradient of information quality that depends on the interaction between the signal's physical properties and the transducer's physical properties. A creature that detects something may learn almost nothing about it, or may learn everything, depending on how well the signal matches the sensor's operating characteristics.

---

## Signal-to-Noise Ratio (SNR)

Every transducer has a **noise floor** — the minimum signal amplitude it can distinguish from background noise. The noise floor is determined by the transducer's physical quality: receptor density, membrane sensitivity, neural wiring precision. Higher quality transducers have lower noise floors.

When a signal reaches a transducer, the amount of usable information depends on how far above the noise floor the signal is:

```
SNR = signalStrength / noiseFloor(transducerQuality)
```

**SNR determines information quality on a continuous gradient:**

- **SNR barely above 1.0 (just detected):** "Something is there." Direction (approximate). That's it. The signal emerged from the noise but carries no resolvable structure. The creature cannot tell size, speed, identity, or even whether the source is one entity or several.

- **Low SNR (1.5–3):** Direction (better). Rough movement state for vibration (moving vs still — the signal fluctuates or doesn't). Still no useful magnitude — the amplitude is too close to the noise floor to distinguish a faint signal from a nearby small source versus a distant large source.

- **Moderate SNR (3–6):** Above plus rough size category. Amplitude rises clearly above the noise, and the creature can compare it to its own body's signals as a reference. "Bigger than me," "similar," "smaller." Movement speed becomes resolvable for vibration. Chemical concentration gradients become trackable for scent.

- **High SNR (6–12):** Precise magnitude estimation. Movement pattern structure becomes resolvable — gait, speed changes, pauses. Chemical compound discrimination becomes possible (predator-metabolism volatiles vs herbivore-metabolism volatiles). Visual detail resolves features beyond silhouette. This is where the signal is clean enough for pattern matching against stored references.

- **Very high SNR (12+):** Full detail extraction. Species identification from single-channel signature matching (given a pattern library). Wound chemistry detection in chemical signals. Gait anomalies (limping, favoring a limb) in vibration signals. Behavioral state classification from movement pattern analysis.

**The same creature provides different information to different observers.** A 22kg meso-predator approaching two different animals:

- Detected by a lurker's sensor limb (ground vibration quality 5, low noise floor): High SNR. The lurker reads gait pattern, estimates mass precisely, matches against its vibration pattern library, identifies species, assesses approach speed and intent.

- Detected by a meso-predator's locomotion limb (ground vibration quality 1, high noise floor): Low SNR. "Something is moving, that direction." No size estimate, no pattern match, no identification.

- Detected by the meso-predator's nose (airborne chemical quality 6, low noise floor in the chemical domain): High SNR in a different channel. Species identification from volatile profile, diet type from metabolic chemistry, rough health from wound chemistry if present.

Each observer builds a different picture of the same entity based on which channels have high SNR.

---

## Sensitivity Windows

### The Problem with Single-Range Sensors

A transducer tuned to detect 5kg grazer footfalls at ten tiles would be permanently saturated in any environment where 200kg herbivores walk nearby. A transducer tuned to detect 200kg herbivore footfalls at fifty tiles would never notice the 5kg grazer at three tiles. No single operating window covers a complex ecology's signal range.

### How Real Sensors Solve This

The mammalian cochlea contains hair cells of different physical lengths. Short stiff hairs resonate at high frequencies. Long flexible hairs resonate at low frequencies. Each cell is tuned to a specific frequency window. The ear doesn't hear "everything on one dial" — it hears through an array of overlapping windows, each with its own operating range, and the brain assembles a composite from the parallel outputs.

The same principle applies to amplitude ranges, not just frequency. Retinal rod cells detect dim light and saturate in brightness. Cone cells detect bright light and can't function in darkness. Different hardware for different operating windows in the same modality.

### Saturation

When a signal exceeds a sensor's maximum operating range, the sensor **saturates**. The output clips to maximum. Fine structure is lost. The sensor reports MAX MAX MAX MAX — it knows "something enormous" but can't distinguish 100kg from 200kg because both peg the receptor at the same ceiling.

Saturation is not damage. The sensor isn't harmed. It just can't extract information from a signal that exceeds its dynamic range. Between footfalls of a passing megafauna, the sensor recovers and resumes normal operation.

### Gain Control and Adaptation

Biological sensors adapt to sustained input:

**Receptor-level adaptation:** Sustained loud input causes the receptor to reduce its own sensitivity. Eyes adjust to bright light. Ears adjust to background noise. A vibration sensor on a limb standing on vibrating ground adapts out the constant background within a few cycles and begins listening for deviations from baseline.

**Neural-level adaptation:** Lateral inhibition and adaptation circuits in the local ganglion filter sustained signals and enhance transient changes. This is why you stop noticing a constant smell after a few minutes but immediately notice a new one — the adapted background is subtracted, and only changes pass through.

**Implications for gameplay:** A creature standing near a constant vibration source (waterfall, herd of grazing animals, geological activity) adapts it out and detects new signals relative to that baseline. A creature entering a new environment takes a few turns to adapt — during that window, its detection is impaired by the unfamiliar background. Territory familiarity isn't just cognitive — it's sensory. Your sensors are calibrated to your home territory's baseline signals.

---

## Multi-Window Sensor Arrays

### Evolutionary Inevitability

In a complex ecology spanning multiple orders of magnitude in body size, evolution produces multi-window sensor arrays. Different receptors on the same body, or different receptor populations within the same organ, tuned to different signal ranges. Each window serves a different ecological function.

### Operational Windows

Each sensitivity window isn't just a detection range — it's an **operational context** with its own ecological meaning:

**Large-signal window:** Tracks megafauna. For a small predator: avoidance information ("the herd is passing, stay still"). For a scavenger: opportunity tracking ("follow the herd, something will die"). For a parasite: host-finding. The pattern library for this window contains large-animal signatures, migration patterns, environmental-scale disturbances.

**Medium-signal window:** Tracks competitive threats and similar-sized prey. This is the moment-to-moment survival window — what's hunting me, what can I hunt, what's competing for my territory. The pattern library contains predator signatures, prey signatures, competitor signatures.

**Small-signal window:** Tracks fine environmental detail. Tiny organisms in the substrate, shifts in soil composition, underground water movement, atmospheric pressure changes affecting substrate tension. The pattern library contains environmental baselines and deviation signatures.

### Per-Limb Window Tuning

On a multi-limbed creature with contact-coupled sensors (Clade B), different limbs may evolve different receptor tuning based on their mechanical coupling to the substrate and their ecological role:

- **Sensor limbs (lurker):** Tuned for the medium-signal window. Maximum resolution in the prey-sized range (5-30kg). Signals above this range saturate (large herbivore reads as "something big, too big, ignore"). Signals below fall under the noise floor. Optimized for the ambush niche.

- **Rear limbs:** Cruder tuning, broader window. Pick up large signals as early warning ("big thing moving, be alert") without the fine discrimination of the sensor limbs. A background alarm system, not a precision instrument.

- **Contact-feeding limbs:** Tuned for substrate-level signals. Micro-vibrations from soil organisms, mineral settling, water flow. A completely different operational world than the locomotion-scale sensors.

### Each Window Has Its Own Pattern Library

This follows directly from the local processing architecture in Cognition-Design.md. A ganglion receiving input from a specific sensitivity window builds pattern associations within that window's signal range. The large-signal patterns and the small-signal patterns don't mix — they're stored in different neural circuitry adapted to different operational domains.

Destroying a limb doesn't just remove a sensor — it removes the pattern library for that sensor's operational window. The creature loses an entire domain of sensory expertise.

---

## Connections to Existing Systems

### Detection Formula (Prompt L-B)
The current detection formula computes WHETHER something is detected:
```
range = cbrt(emission) × sensitivity × coefficient
```
This remains the detection gate. SNR adds a second computation for HOW MUCH INFORMATION the detection provides. Both use the same transducer quality values.

### Signal Emission (Prompt L-A)
Emission values are the signal source. Signal strength at the observer = emission attenuated by distance. The attenuation model (currently implicit in the range formula) determines how signal strength relates to distance for each medium. Ground vibration attenuates differently than airborne chemical.

### Chemical Coupling Media (Prompt N)
Chemical transducers split into contact, airborne, and dissolved. Each coupling medium is a different operational context with potentially different sensitivity windows. Contact chemical at quality 6 operates in a completely different signal range (molecular concentration on a touched surface) than airborne chemical at quality 6 (volatile concentration in atmosphere). The quality number describes resolution within the operating window, not across windows.

### Cognition System (Prompt O)
The cognition system reads sensory output to make decisions. SNR determines what information is available to both the reactive layer (stimulus magnitude, threat/no-threat) and the deliberative layer (classification, assessment). The cognitive system doesn't care how the information was extracted — it works with whatever the sensory system provides. Richer sensory input enables richer decisions without changing the decision architecture.

---

## Implementation Status

**Implemented:**
- Transducer quality values on all creature zones (body map)
- Detection range formula (L-B)
- Coupling media for chemical (contact/airborne/dissolved) and vibration (ground/air/water)

**Implementable now (Prompt O bridge):**
- Simple SNR computation from signal strength and transducer quality
- SNR thresholds gating information quality (magnitude → size category → diet type → species → wound state → assessment)

**Designed, not yet implementable:**
- Sensitivity windows with per-receptor tuning curves
- Saturation modeling (signal clipping above max operating range)
- Gain control and adaptation (baseline subtraction over turns)
- Per-limb window specialization
- Per-window pattern libraries (depends on memory system, Phase 4)
- Territory-based sensory calibration (adapted baselines in familiar territory)

---

## What This Document Constrains

| Decision | Constrained by |
|---|---|
| Whether a creature can identify species from detection | SNR on the detecting channel + pattern library existence |
| Whether a creature knows how big something is | SNR — low SNR gives no magnitude, moderate gives rough category, high gives precise estimate |
| Whether a sensor is "overwhelmed" by a huge signal | Saturation — signal above operating range clips, loses fine structure, doesn't damage sensor |
| Whether different limbs detect different things | Sensitivity window tuning — evolutionary specialization per limb based on ecological role |
| Whether a creature adapts to background noise | Gain control — sustained signals are adapted out over a few turns |
| Whether entering new territory impairs senses | Adaptation period — sensors calibrated to old baseline need time to recalibrate |
| What information the cognitive system receives | SNR output from the sensory system — cognition works with whatever the senses provide |
