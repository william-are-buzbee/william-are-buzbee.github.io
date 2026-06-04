# Cognition Design — Neural Architecture, Memory, and Hormonal Systems

This document captures the design theory for how cognition works in the game. It was developed through extended discussion between the human and the collaborator, grounded in real neuroscience and evolutionary biology. The principles here drive all future cognitive system implementation.

## Core Principle

Cognition is not a stat. It's neural tissue, physically located in zones, allocated to specific functions, connected by pathways with bandwidth limits. Every cognitive capability is a downstream consequence of the physical neural architecture described in the body map.

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

The hub zone (whichever zone has the highest integration allocation) receives transmitted signals from all connected zones. Its job is to combine compressed summaries into a unified picture and make decisions.

**Integration capacity:**
```
integrationCapacity = sum across all surviving zones of (neuralMass × integrationAllocation)
```

Integration capacity gates behavioral sophistication along a continuum (not hard tiers — tiers are scaffolding, the final version uses continuous scaling):

- **Very low integration:** Cannot compare drives. Responds to loudest stimulus. No long-range seeking. Reactive, stimulus-driven. Behavior emerges from ensemble of local responses.
- **Low integration:** Can compare drives but slowly and noisily. Simple coordination. Responds to current state, not projected future.
- **Moderate integration:** Accurate drive comparison, purposeful behavior, chase commitment. Can assess current fight but not project outcomes.
- **High integration:** Multi-step planning, working memory, pre-emptive decisions. Can assess a losing fight before it becomes critical.

The final system should use continuous scaling: integration capacity produces a noise level for drive comparison, a maximum seeking range, a threat assessment accuracy, etc. Each capability degrades continuously as integration is lost, rather than dropping at discrete thresholds.

### Layer 4 — Motor Output

Decisions translate to actions through motor control allocation. Zones with high motorControl execute precise, coordinated movements. Low allocation means clumsy execution. This already works implicitly through effectiveMuscle scaling with zone HP.

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

---

## Hormonal System

### What Hormones Do

Neural signals are fast, targeted, specific — a phone call between two zones through a pathway. Hormones are slow, global, broadcast — a PA announcement through the blood that reaches every cell with the right receptors.

**Drives ARE circulating hormone concentrations.** Hunger = ghrelin-equivalent in the blood. Safety = adrenaline-equivalent. Rest = adenosine-equivalent.

### Clade Difference in Hormonal Delivery

**Clade A (closed circulation):** High pressure, fast delivery. When the brain triggers an adrenaline-equivalent spike, the hormone reaches every muscle within 1-2 turns. The creature goes from calm to fight-or-flight almost instantly. This is why Clade A can make snap decisions — the broadcast system keeps up with the brain.

**Clade B (open circulation):** Low pressure, diffuse delivery. Hemolymph fills body cavities and slowly washes over tissues. When a ganglion triggers a fear-hormone release, the hormone seeps through hemolymph over several turns. Zone by zone, the body enters a fear state. The sensor limbs near the threat feel it first. Far-side limbs feel it last.

**This physically explains why Clade B behavior looks like ensemble averaging.** It's not just that the ganglia are independent processors — the motivational state itself propagates slowly. The left side is scared before the right side knows there's a problem. The body is a committee not because the ganglia disagree on interpretation, but because they're literally in different hormonal states at the same moment.

### The Perception-Motivation Lag

The lag between perception and motivation is the most Clade B characteristic in the design. The sensor limb knows what's coming. The body isn't scared yet. The limb has to wait for the hormones to catch up, or act alone.

### Implementation Status

Designed but deferred. First pass uses a simple HORMONE_DELAY constant (3 turns) for open-circulation creatures. Drive spikes distribute evenly over the delay period instead of applying instantly. A more complete model would track per-zone hormone concentrations with circulatory propagation.

---

## Cognitive Tradeoffs (Evolutionary)

**Centralization buys intelligence and pays for it in vulnerability.** More integration capacity means better drive comparison, longer planning horizons, richer memory. But concentrating neural mass in one zone makes destroying that zone catastrophic.

**Distribution buys robustness and pays for it in coordination.** No single point of cognitive failure. But lower maximum cognitive capability, slower decision-making, noisier integration, and higher total metabolic cost (distributed processing requires more total neural mass to achieve equivalent computation because of pathway losses).

**Neural mass is the most expensive tissue per kg.** Requires constant blood supply, disproportionate calories, generates heat. The hunger system already scales with neural mass. The bleed system already requires closed circulation for high-pressure brain delivery.

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

**Implemented (first pass):**
- Integration capacity computed from body map each turn
- Tier assignment (1/2/3) from thresholds (scaffolding for continuous scaling)
- Tier 1 reactive behavior (loudest stimulus, no drive comparison, no long-range seeking)
- Tier 2/3 existing drive comparison system
- Head destruction drops tier in real time

**Designed, not implemented:**
- Hormonal propagation delay (HORMONE_DELAY for open circulation)
- Local processing quality per zone per sense
- Signal compression through pathways
- Continuous scaling replacing threshold tiers (noise in drive comparison, seeking range proportional to integration, threat assessment accuracy)
- Episodic memory for Tier 3 creatures
- Distributed pattern-library memory for Clade B
- Per-zone hormone concentrations with circulatory propagation

**Design principles established:**
- Transducer values = physical hardware at the zone, sensing from physically coupled media
- Information through pathways = cognition, not sensation
- The hub receives compressed summaries, not raw data
- Destroying a sensor limb kills a local mind, not just a sensor
- Memory is reconstruction from distributed weight patterns, not file retrieval
- Clade A remembers stories, Clade B remembers feelings
