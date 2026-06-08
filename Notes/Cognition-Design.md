# Cognition Design — Neural Architecture, Memory, and Hormonal Systems

This document captures the design theory for how cognition works in the game. It was developed through extended discussion between the human and the collaborator, grounded in real neuroscience and evolutionary biology. The principles here drive all cognitive system implementation.

Include alongside Surface-Creatures.md, Sensory-Design.md, and Ecology-Foundations.md when working on AI behavior, perception, or creature design.

## Core Principle

Cognition is not a stat. It's neural tissue, physically located in zones, allocated to specific functions, connected by pathways with bandwidth limits. Every cognitive capability is a downstream consequence of the physical neural architecture described in the body map.

A corollary: reactivity is not failed cognition. A creature with zero integration and excellent sensors is not broken — it's a well-evolved animal whose reactive pathways are refined, fast, and domain-appropriate. Integration adds capability on top of reactivity. It does not replace it.

---

## The Four Layers of Neural Processing

### Layer 1 — Local Processing

Every zone with neural mass above a minimum threshold is a local processor. It receives raw transducer input from its own sensors and computes a local interpretation. The quality of that interpretation depends on:

- **Transducer quality** — how good the sensors are (from the body map)
- **Processing allocation** — how much neural mass is dedicated to processing that sense type (chemicalProcessing, vibrationProcessing, visualProcessing allocations in neuralAllocation)
- **Pattern library** — stored associations from past experience (patternLibrary allocation)

The lurker's sensor limb has vibration quality 5 and significant vibrationProcessing and patternLibrary allocation. That limb doesn't just detect vibration — it interprets it. It matches incoming patterns against its library to identify what's moving, how heavy, which direction, and whether it matches known threat signatures. This is a local mind doing real cognitive work.

The meso-predator's front limb has vibration ground quality 1 and almost no vibrationProcessing. It detects that the ground shook. That's it. No pattern matching, no identification. Raw signal.

**Local processing quality** per zone per sense:
```
localAssessment = transducerQuality × processingAllocation × neuralMass
```

When a zone is destroyed, its local processing is gone entirely — not degraded, gone. The pattern library, learned associations, and multi-modal integration are all destroyed. This is "destroying a sensor limb kills a local mind."

### Layer 2 — Signal Compression and Transmission

Local assessments travel through neural pathways to reach other zones. Pathways have bandwidth (already in the body map). The pathway doesn't transmit the local assessment directly — it transmits a compressed version.

**Compression quality:**
```
compressionQuality = min(1.0, pathwayBandwidth / localAssessment)
```

If bandwidth exceeds the local assessment, everything gets through (compression = 1.0). If the assessment exceeds bandwidth, information is lost (compression < 1.0).

**What arrives at the destination:**
```
transmittedSignal = localAssessment × compressionQuality
```

The hub ganglion receives compressed summaries, not raw sensory data. It's an administrator receiving field reports, not a brain experiencing the world. The richer the local processing and the narrower the pathway, the more the hub works from abstractions.

### Three Configurations

**Long wire (no local processing).** Zone has a transducer but zero processing allocation. Raw signal enters the pathway and travels to wherever processing lives (usually the hub). Pathway bandwidth limits the raw signal directly. This is the cheap, ancestral configuration. Example: the meso-predator's limb chemical transducers (quality 1, negligible chemicalProcessing) — they detect "chemical present" and send a raw blip to the head.

**Local processing (ganglionic).** Zone has both a transducer and significant processing allocation. It interprets locally and transmits a compressed summary. This is the expensive, optimized configuration. Example: the lurker's sensor limbs.

**Relay processing.** Signal passes through an intermediate zone that has processing allocation but no transducers. The intermediate zone processes signals in transit (like the thalamus in vertebrates). Deferred for implementation — adds routing complexity.

### Layer 3 — Integration

The hub zone (whichever zone has the highest integration allocation) receives transmitted signals from all connected zones. Its job is to combine compressed summaries into a unified picture and make decisions that override reactive behavior when context warrants it.

**Integration capacity:**
```
integrationCapacity = sum across all surviving zones of (neuralMass × integrationAllocation)
```

Integration capacity determines override reliability — how consistently the creature can suppress reactive impulses with contextual decisions. It also determines fight assessment capability and deliberative seeking range. See the Reactive-Deliberative Architecture section below for how this works.

Current creature values:
- Apex predator: 0.252
- Large herbivore: 0.154
- Meso-predator: 0.128
- Ambush predator (lurker): 0.014
- Small herbivore: 0.000

### Layer 4 — Motor Output

Decisions translate to actions through motor control allocation. Zones with high motorControl execute precise, coordinated movements. Low allocation means clumsy execution. This already works implicitly through effectiveMuscle scaling with zone HP.

---

## Reactive-Deliberative Architecture

### The Two-Layer Decision Model

Every creature runs two decision layers each turn:

**The reactive layer** fires every turn on every creature. It scans current stimuli, evaluates them against a universal set of prioritized rules, and produces a behavioral recommendation with an associated stimulus magnitude. The rules are identical for every creature — behavioral differences emerge because each rule's conditions query the creature's body map, and different bodies produce different answers. There are no per-species behavioral profiles.

**The deliberative layer** attempts to override the reactive recommendation when integration capacity is sufficient. Override success is deterministic — a contest between the stimulus magnitude (how urgently the reactive layer wants to act) and the integration capacity (how much cognitive override the creature can muster).

### Reactivity Is Not Failed Integration

A cockroach cercal system detects air displacement from a lunging predator and triggers a directional escape in under 10 milliseconds. This is a dedicated circuit, refined over 300 million years of selection. It is not trying to compare drives and failing. It is executing a hardwired pathway that converts a specific stimulus into a specific motor output with near-zero processing.

A rabbit freezes, then bolts. Not because it's badly evaluating hunger versus safety. Because freeze-then-bolt is an evolved strategy that evolution already optimized.

Reactive pathways are the product of immense evolutionary optimization. They are fast, reliable, and domain-appropriate. They are a different kind of cognition, not a worse kind. The small herbivore with zero integration and ground vibration quality 5 on its fore-limbs is a superb sensing machine attached to refined reactive circuits. It doesn't need to think because its sensors give it enough warning to simply run.

### The Physical Basis of Override

The reactive pathway is anatomically short: stimulus hits local ganglion, local ganglion fires motor output. Two stops. Very fast.

The deliberative pathway is anatomically long: stimulus travels through neural pathway to the integration hub, hub holds the signal in workspace alongside other sensory data, hub evaluates, suppression signal travels back through the pathway to the motor output. Many stops, constrained by pathway bandwidth at every hop.

Override success is fundamentally a signal race. Can the deliberative suppression signal complete its round trip before the reactive motor output executes? This depends on pathway bandwidth, pathway hop count, and integration processing speed.

**Current implementation** approximates this as:
```
overrideCapacity = integrationCapacity × OVERRIDE_SCALE
if overrideCapacity > reactiveMagnitude × STIMULUS_RESISTANCE:
    deliberative layer runs
else:
    reactive wins
```

This correlates well with physical override capability because higher-integration creatures also tend to have higher-bandwidth pathways. When Layer 2 (signal transmission timing) is fully implemented, the formula should be replaced with an actual signal race computation.

### Universal Reactive Rules

The reactive layer asks physical questions and the body answers:

- **combatCapability** — do I have attacks on surviving zones? How much damage can I deal? (Determines fight vs flee)
- **relativeMagnitude** — how does this signal compare to my own body's emissions? (Determines threat/prey assessment from signal magnitude)
- **movementCompromisesSense** — does my dominant detection channel degrade when I move? (Determines hold vs wander as default)
- **hasRefuge** — can I enter water? Do I have a territory to return to? (Determines flee target)
- **dietResponse** — am I a predator or herbivore? (Determines whether "bigger than me" means flee or investigate)

These queries produce the full behavioral repertoire:

The lurker freezes when prey enters its territory because its dominant sense is ground vibration, and movement both degrades its detection and creates detectable emission. No lurker-specific code — the body answers "movement compromises sense" and the universal rule says "hold still."

The meso-predator wanders and patrols because its dominant sense is airborne chemical, which works fine while moving. The body answers "movement doesn't compromise sense" and the universal rule says "wander."

The small herbivore flees from anything larger because it has no attacks (combatCapability = false) and it's an herbivore (large signals are threats, not prey). It detects threats at substantial range through excellent distributed vibration sensing and bolts early.

### What Override Produces

When the deliberative layer fires, it runs drive comparison (existing hunger/safety/rest urgency system) with SNR-gated information about detected entities (see below). This is where contextual behavior emerges:

The large herbivore smells a predator at range (reactive says: flee to water). Override fires because integration is sufficient and the stimulus is moderate. Deliberative layer evaluates: predator far away, not approaching, I'm near water. Continue grazing. When the predator closes and stimulus magnitude increases, the override fails and the herbivore bolts. This produces calm-until-threatened behavior.

The apex predator takes moderate damage (reactive says: retaliate). Override fires. Deliberative layer evaluates: I'm winning this fight, target is wounded, continue attacking. The meso-predator in the same situation may fail to override — it retaliates reflexively where the apex deliberates. The apex feels composed; the meso-predator feels twitchy. Both have the same reactive circuits. The difference is in the override.

### Seeking Range

Reactive seeking is short (2-4 tiles). The creature responds to nearby opportunity.

Deliberative seeking scales with integration:
```
seekRange = MIN_SEEK + integrationCapacity × SEEK_SCALE
```

Goal persistence: if the target leaves all detection channels for more turns than integrationCapacity × PERSISTENCE_SCALE, the deliberative goal expires and the creature falls back to reactive. The apex predator sustains pursuits across the map. The meso-predator gives up sooner. The lurker barely sustains goals past its territory edge.

### Critical Override

Some stimuli bypass deliberation regardless of integration. Ambush damage from an undetected source, blood crossing the critical threshold, massive torso trauma — these fire the reactive pathway before any deliberative signal can complete its round trip. Even the apex predator flinches from an ambush. The reactive circuitry is always running, and extreme stimuli produce signals too strong for the deliberative layer to override.

---

## SNR-Based Information Quality

What a creature learns about what it detects depends on signal-to-noise ratio per detection channel. SNR = signal strength / noise floor, where noise floor is derived from transducer quality. See Sensory-Design.md for the full framework.

Key thresholds (tunable):
- **SNR_MOVEMENT (~1.5):** Can tell if the signal source is moving or still
- **SNR_MAGNITUDE (~3.0):** Can estimate relative size (bigger/similar/smaller than me)
- **SNR_DISCRIMINATION (~5.0):** Can resolve compound profiles (predator vs herbivore scent)
- **SNR_IDENTIFICATION (~8.0):** Can match species signature from single-channel pattern library
- **SNR_DETAIL (~12.0):** Can resolve fine structure (gait anomaly, wound chemistry, behavioral state)

Each channel provides its own information independently. A creature detected through both chemical and vibration gets separate SNR per channel, separate information per channel. The cognitive system works with whatever the sensory system provides.

**Fight outcome assessment** is the one classification that requires integration capacity rather than sensory hardware. Holding a model of self and other, comparing multiple attributes, projecting a hypothetical — that's workspace computation. No single channel provides it. Requires integration above ~0.15.

**The reactive layer reads SNR-derived information for its conditions** (relative magnitude for threat assessment, movement state for vibration-triggered rules). When SNR is too low to provide a field, the reactive layer uses conservative defaults — unknown magnitude is treated as potentially larger, unknown diet as potential threat.

**The deliberative layer reads the full SNR-derived information** for drive comparison and target selection. Better sensors give the deliberative layer more to work with, producing more contextual decisions.

---

## Memory Architecture

### The Hippocampal Model

The hippocampus (in vertebrates) does not store memories. It indexes them.

When you experience an event — "I was at the beach and smelled salt air and heard waves and felt sand" — each sensory component is stored as a pattern of synaptic weights in the relevant processing area (olfactory cortex for smell, auditory cortex for sound, somatosensory cortex for touch). The hippocampus holds the associative links that bind these distributed patterns into a coherent episode.

When you recall the memory, the hippocampus reactivates all the distributed patterns simultaneously. The memory IS the coordinated reactivation, not a file stored in one place.

### Key Implications

**Memory is reconstruction, not replay.** Every recall re-derives an approximation from modified network weights. Memories are lossy, malleable, and influenced by current state.

**The processing cortex that holds memory patterns is the SAME cortex that processes current input.** The same neurons serve triple duty: current processing, recent memory, and long-term memory. Memory patterns overlap — "sand on feet" partially overlaps with "gravel on feet" and "desert sand visual."

**Pattern completion:** The hippocampus receives a partial cue, matches it against stored indices, and if the match exceeds a threshold, reactivates the full associated pattern. This is how cues trigger memories — and how false memories form (overlapping patterns from different experiences get bound into a coherent episode that never happened).

**Memory capacity** isn't storage volume — it's the number of distinguishable patterns the network can hold before they interfere. More episodicMemory allocation means more indices (more memories before interference), faster pattern completion (quicker recall from partial cues), and better pattern separation (less false matching).

### Clade A Memory (Centralized)

The meso-predator's head has episodicMemory allocation (~0.18). This is the hippocampal equivalent — indexing circuitry. The actual memory "content" is distributed across all processing allocations in the head: chemicalProcessing holds chemical components, visualProcessing holds visual components, patternLibrary holds pattern associations. The episodicMemory allocation determines how many distinct episodes can be indexed and how accurately partial cues trigger recall.

**Vulnerability:** Destroy the head and you destroy ALL episodic memory — both the indices and the stored patterns. The creature has total amnesia.

### Clade B Memory (Distributed)

Each limb's patternLibrary holds local patterns — the sensor limb remembers vibration patterns, the attack limb remembers strike sequences, the locomotion limbs remember movement paths. The mesh connectivity acts as the indexing system — when one limb's pattern activates (that vibration signature again), cross-body connections reactivate associated patterns in other limbs (that strike sequence, that movement path).

The "episodic memory" is the coordinated reactivation across the mesh.

**Characteristics:**
- Slower than centralized recall (reactivation propagates across inter-limb pathways, not within one brain)
- Lower fidelity (each limb only remembers its own sensory modality — nobody has the unified multi-modal episode)
- Enormously more robust (destroy one limb, lose that limb's patterns, other limbs still cross-activate)
- Noisier (no dedicated hippocampal equivalent for precise indexing, more false completions, more blended memories)

**The deepest clade distinction:** Clade A remembers stories (coherent, sequential, episodic). Clade B remembers feelings ("this place makes my attack limbs tense and my sensor limbs cautious" — a distributed somatic memory that influences behavior without producing a coherent narrative).

### Species Identification and Pattern Libraries

Species identification from a single sensory channel requires hardware quality (high enough SNR to resolve a distinguishing signature) plus a pattern library (stored reference patterns to match against). This is hardware plus memory, not integration. A lurker's sensor limb with ground vibration quality 5 and a rich local pattern library identifies a meso-predator from footfall signature alone. The local ganglion does the match — it never routes to the hub. One channel, one library, done.

**Current approximation:** Pattern libraries are not yet implemented as explicit memory systems. For the AI, species identification is approximated by a hardware quality threshold — if the detecting channel's SNR exceeds SNR_IDENTIFICATION, the creature "recognizes" the target. This assumes adult animals in a stable ecosystem have encountered common species often enough to have built the relevant patterns. When the memory system is implemented, species identification will depend on actual learned patterns rather than assumed ones.

---

## Hormonal System

### What Hormones Do

Neural signals are fast, targeted, specific — a phone call between two zones through a pathway. Hormones are slow, global, broadcast — a PA announcement through the blood that reaches every cell with the right receptors.

**Drives ARE circulating hormone concentrations.** Hunger = ghrelin-equivalent in the blood. Safety = adrenaline-equivalent. Rest = adenosine-equivalent.

### Clade Difference in Hormonal Delivery

**Clade A (closed circulation):** High pressure, fast delivery. When the brain triggers an adrenaline-equivalent spike, the hormone reaches every muscle within 1-2 turns. The creature goes from calm to fight-or-flight almost instantly. This is why Clade A can make snap decisions — the broadcast system keeps up with the brain.

**Clade B (open/semi-open circulation):** Low pressure, diffuse delivery. Hemolymph fills body cavities and slowly washes over tissues. When a ganglion triggers a fear-hormone release, the hormone seeps through hemolymph over several turns. Zone by zone, the body enters a fear state. The sensor limbs near the threat feel it first. Far-side limbs feel it last.

**This physically explains why Clade B behavior looks like ensemble averaging.** It's not just that the ganglia are independent processors — the motivational state itself propagates slowly. The left side is scared before the right side knows there's a problem. The body is a committee not because the ganglia disagree on interpretation, but because they're literally in different hormonal states at the same moment.

### The Perception-Motivation Lag

The lag between perception and motivation is the most Clade B characteristic in the design. The sensor limb knows what's coming. The body isn't scared yet. The limb has to wait for the hormones to catch up, or act alone.

### Implementation Status

Designed but deferred. First pass uses a simple HORMONE_DELAY constant (3 turns) for open-circulation creatures. Drive spikes distribute evenly over the delay period instead of applying instantly. A more complete model would track per-zone hormone concentrations with circulatory propagation. See Circulatory-Immune-Design.md for how circulatory architecture relates to hormonal delivery.

---

## Cognitive Tradeoffs (Evolutionary)

**Centralization buys intelligence and pays for it in vulnerability.** More integration capacity means better override reliability, longer planning horizons, richer memory. But concentrating neural mass in one zone makes destroying that zone catastrophic.

**Distribution buys robustness and pays for it in coordination.** No single point of cognitive failure. But lower maximum cognitive capability, slower decision-making, noisier integration, and higher total metabolic cost (distributed processing requires more total neural mass to achieve equivalent computation because of pathway losses).

**Neural mass is the most expensive tissue per kg.** Requires constant blood supply, disproportionate calories, generates heat. The hunger system already scales with neural mass. See Circulatory-Immune-Design.md for the relationship between neural demand and circulatory architecture — closed circulation solves the concentration problem of feeding a metabolically expensive brain, but distributed neural architectures can avoid needing that solution by keeping demand flat.

**Allocation is zero-sum.** Each kg of neural mass is divided among functions. More chemicalProcessing means less integration. More episodicMemory means less patternLibrary. You can't be good at everything without more total neural mass, which costs more to feed and protect.

**Pathway bandwidth costs connective tissue.** Thicker pathways = more connective tissue mass = less room for muscle or structural tissue. A creature with fat neural highways has less room for muscle.

These costs are embedded in the body map numbers. The trade-offs manifest as mass allocation decisions that are already physical.

---

## The Amygdala Principle

Influence in a neural system isn't proportional to mass. It's proportional to connectivity × specificity of function. A tiny node at a critical routing junction matters more than a massive node on the periphery.

The amygdala is 1-2 cubic centimeters but fundamentally shapes conscious experience. It doesn't process much — it TAGS other processing with emotional valence. It's a gain control dial. Its power is positional and connective, not computational.

For game design: a zone with small neural mass but high integration allocation at a critical pathway junction (the torso hub in Clade A's star topology) has outsized influence on behavior. Destroying it has consequences disproportionate to its mass.

---

## Implementation Status

**Implemented:**
- Integration capacity computed from body map each turn
- Recomputed on zone destruction — drops in real time
- circulationType on all creature templates

**Implementing (Prompt O):**
- Reactive-deliberative two-layer architecture replacing the tier-based code fork
- Universal reactive rules with body-map-derived conditions (no per-species profiles)
- Deliberative override scaled by integration capacity (approximation of signal race)
- SNR-based information quality gating what creatures learn from detections
- Fight outcome assessment gated by integration threshold (~0.15)
- Deliberative seeking range scaled by integration
- Goal persistence scaled by integration
- Critical override for extreme stimuli (unoverridable regardless of integration)

**Designed, not yet implemented:**
- Layer 2 signal compression and transmission timing (replaces override approximation with actual signal race)
- Hormonal propagation delay (HORMONE_DELAY for open circulation)
- Local processing quality per zone per sense (localAssessment formula)
- Episodic memory for Clade A (Phase 4)
- Distributed pattern-library memory for Clade B (Phase 4)
- Per-zone hormone concentrations with circulatory propagation
- Sensitivity windows and saturation (see Sensory-Design.md)
- Gain control and sensory adaptation
- Territory-based sensory calibration

**Design principles established:**
- Reactivity is not failed integration — it's a refined, evolved decision system
- The reactive layer is universal, the body makes it specific
- Integration buys override, not better reactions
- Transducer values = physical hardware, sensing from physically coupled media
- SNR determines information quality on a continuous gradient — nothing is free
- Classification is hardware + pattern library, not integration (except fight assessment)
- Information through pathways = cognition, not sensation
- The hub receives compressed summaries, not raw data
- Destroying a sensor limb kills a local mind, not just a sensor
- Memory is reconstruction from distributed weight patterns, not file retrieval
- Clade A remembers stories, Clade B remembers feelings
