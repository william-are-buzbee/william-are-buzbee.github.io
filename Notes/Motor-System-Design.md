# Motor System Design

The physical layer between neural activation and bodily movement. Describes how signals become actions through tissue.

## Overview

The game currently goes: cognition selects a behavior → `executeAction` moves the creature one tile or performs an attack. The physical execution is abstracted away. There is no concept of which zones do the work, what energy they consume, how the same action changes character as tissue depletes, or whether the action is even physically possible given the creature's neural infrastructure.

The motor system fills this gap. It is not a decision-making layer. It is tissue responding to neural signals. The signals arrive through physical pathways, activate muscle at whatever intensity and duration the signal carries, and the tissue responds with whatever it can physically produce. What we observe — a sprint, a strike, a grip, a flinch — is emergent. The system underneath is continuous and physical.

## What Exists Physically

### Pathways

Motor pathways are physical neural connections traced through the body map. They run from coordinating centers (ganglia, brain regions, spinal-equivalent structures) to effector zones (zones with muscle tissue). A pathway is a physical structure with a specific topology — it passes through specific zones, it has a bandwidth determined by neural investment, and it can be severed by zone destruction along its route.

A zone can only be recruited for motor activity if a motor pathway connects it to a coordinating center capable of sending the activation signal. No pathway, no activation. Intact muscle with no neural connection is inert. This is paralysis — the tissue exists but cannot be reached.

The body map already describes pathway topology for sensory signal flow and cognitive integration. Motor pathways are the same physical infrastructure carrying signals in the effector direction: coordinating center → motor neurons → muscle tissue. A single pathway may carry both sensory and motor signals (as many biological nerve bundles do), or they may be distinct — this is a property of the body plan, not a rule.

### Coordinating Centers

A motor pathway terminates upstream at a coordinating center — a neural structure capable of generating activation signals. The simplest is a single ganglion directly connected to a single zone, producing simple contraction-relaxation. More complex centers are connected to multiple zones through separate pathways and can shape the activation signal's intensity, duration, and timing across those pathways independently.

Coordination of multi-zone movements happens *at the center*, not between the zones. The zones don't talk to each other. They each receive independent instructions from the same coordinating center. A creature that runs with four limbs in a synchronized gait does so because one coordinating center sends precisely timed signals down four separate motor pathways. The limbs are independent receivers. The timing originates at the center.

What limits the complexity of coordinated movement is the coordinating center's internal processing capacity — how many independent, precisely timed output signals it can generate simultaneously. A simple ganglion connected to four limbs might only manage "all on simultaneously" or "alternating pairs." A complex motor coordination region with more neural investment can shape independent timing for each connected pathway — different intensity, different phase, real-time adjustment.

This maps directly to the existing neural allocation system and body map pathway topology. The body map already describes hub-and-spoke architecture: coordinating centers (hubs) with pathway connections (spokes) to effector zones. Motor coordination capability is determined by: which zones connect to which hubs, and how much internal processing capacity each hub has. No additional cross-connection infrastructure between zones is needed. The architecture the body map already describes is the right topology for motor coordination.

### Activation Parameters

There are no named motor programs. There are continuous activation parameters sent through pathways to effector zones:

**Intensity** — how hard the motor neurons fire. A continuous variable from near-zero to maximum. Determines which fibers in the zone are recruited (see "How Tissue Responds" below). Higher intensity recruits fibers capable of faster contraction. Lower intensity recruits fibers suited to sustained force.

**Duration** — how long the activation signal is maintained. A brief pulse produces a single contraction (a strike, a jump). A sustained signal maintains force (a grip, a hold, an isometric brace). Duration is continuous — from a single-tick impulse to indefinite sustained activation.

**Pattern** — the timing relationship when a coordinating center activates multiple zones through separate pathways. Simultaneous signals to all locomotion zones (a jump or lunge). Alternating signals (a gait cycle). Sequential signals (rear legs fire first, then forelimbs extend). The pattern is shaped entirely at the coordinating center and sent down each pathway independently. The zones just receive and respond.

These three parameters — intensity, duration, pattern — are all the motor system specifies. Everything else is downstream of tissue response.

### How Tissue Responds

A zone receives an activation signal at some intensity for some duration. The zone's muscle tissue responds based on what it physically is.

Muscle fibers exist on a spectrum from slow-contracting/fatigue-resistant to fast-contracting/fatigue-prone. On Earth, this spectrum is categorized as Type I (slow-twitch), Type IIa (fast oxidative), and Type IIx (fast glycolytic), but the underlying reality is a continuum of contraction speed versus fatigue resistance. Any motile alien biology would produce an equivalent spectrum because the physics of force generation demands it — fast contraction requires rapid energy release, rapid energy release depletes local substrate, and depletion means fatigue.

Each zone's `fiberRatio` describes where on this spectrum its muscle tissue falls. A zone with high fiberRatio has tissue capable of fast contraction but rapid depletion. A zone with low fiberRatio has tissue suited to sustained force but limited contraction speed. The ratio describes tissue composition, and the tissue responds to whatever signal it receives.

When a high-intensity signal arrives at a zone:
- Fibers capable of the fastest contraction are recruited first (lowest activation threshold for rapid force production)
- These fibers consume local energy substrate stored in the muscle cells (fast contraction requires local fuel because circulatory delivery is too slow)
- The zone produces high force rapidly
- Substrate depletes proportional to the fast-contracting fiber mass activated and the duration of activation

When a low-intensity signal arrives at a zone:
- Fibers suited to sustained contraction are recruited (lowest activation threshold for maintained force)
- These fibers are sustained primarily by circulatory delivery of fuel and oxygen
- The zone produces moderate force indefinitely (as long as circulation delivers)
- Local substrate is barely consumed

When a moderate-intensity signal arrives:
- Both ends of the fiber spectrum contribute
- The zone produces intermediate force with moderate substrate consumption

**Slow-contracting fibers can work intensely.** A sustained isometric hold — jaw locked on prey, torso maintaining a grapple, limbs bearing heavy load — can drive slow-contracting fibers to their aerobic ceiling. They fatigue through different mechanisms (circulatory limitation, metabolic heat, oxygen debt at the tissue level) but they absolutely fatigue. "Slow-contracting" does not mean "effortless." It means "sustained at the expense of contraction speed."

**Fast-contracting fibers can fire at low intensity.** Fine motor control — delicate positioning of a sensory limb, a tentative probing touch — may recruit fast-contracting fibers at sub-maximal activation for their precision rather than their force. The substrate cost is minimal because the recruitment is brief and partial. Fiber type selection isn't strictly about intensity — it's about what the activation profile demands from the tissue.

### Local Energy Substrate

The local substrate stored in muscle tissue is a physical consequence of having muscle. More muscle stores more substrate, because the substrate is stored in the cells themselves. There is no separate "energy pool" stat. The substrate level is a property of the tissue, the way blood volume is a property of body mass.

Substrate is consumed when fast-contracting fibers fire. It is regenerated when the zone is at low activity, at a rate driven by total muscle mass (every cell has resynthesis enzymes), circulatory regeneration efficiency (nutrient delivery at rest), vascularity (capillary density, correlated with oxidative fiber content), and enzymatic upregulation (resynthesis enzymes are more active when stores are depleted, producing a front-loaded recovery curve).

A zone that has been heavily recruited at high intensity has depleted substrate. The same zone receiving the same high-intensity signal will now produce less force — not because a game rule reduces it, but because the fast-contracting fibers have no fuel. The slow-contracting fibers still respond (they're circulatory-sustained), so the zone still produces force. It's just slower and weaker than when substrate was available.

Each zone depletes and regenerates independently. A creature that has been sprinting has depleted locomotion zone substrate. Its jaw is fresh. Its torso is fresh. A creature that has been fighting has depleted strike zone substrate. Its legs are fresh. The order in which a creature uses its body matters, because substrate is local and depletion is local.

## Paths to Motor Activation

The motor system doesn't care where the activation signal comes from. It receives signals through pathways and fires tissue. What varies is how far up the neural hierarchy a sensory signal travels before motor activation occurs. This distance is physical — determined by pathway topology and what neural structures exist along the route. It's not three discrete categories. It's a continuum.

### Pathway-Level (Reflex Arcs)

The shortest path. A transducer fires. The signal travels down a sensory pathway, hits a junction point (a local ganglion or even just a synaptic connection at the pathway level), and immediately routes to a motor pathway. The signal never reaches anything that integrates across channels.

This is a single input, single threshold, single output. Pain on a zone → withdraw that zone. Sudden pressure wave → contract locomotion zones. The "pattern" being matched is just "did this one signal exceed this one threshold." There's no comparison, no weighting, no context. The pathway exists or it doesn't, and if it exists, it fires when the threshold is met.

Infrastructure required: one sensory pathway connected to one motor pathway through a junction point. The simplest neural circuit that exists. Almost any creature with a nervous system has these.

### Ganglion-Level (Template Matching)

A sensory signal reaches a ganglion that receives input from multiple pathways. The ganglion has physically wired templates — circuit configurations that fire motor outputs when a specific combination of inputs is present. "Large vibration signal + no matching chemical signature → fire locomotion pathways at high intensity." This requires more infrastructure: the ganglion needs connections to the right sensory pathways AND the right motor pathways AND the internal wiring to perform the template match.

But it's not thought. The templates are fixed physical circuits. The ganglion doesn't evaluate or choose. It runs parallel threshold checks across multiple inputs, and if a template matches, it fires. The creature doesn't "decide" to flee. A combination of sensory inputs matched a wired template and the ganglion fired its motor outputs.

This is what the current "reactive layer" in the code actually describes. The reactive rules are ganglion templates. Rule 3 (adjacent + large → flee) is a hardwired circuit that fires when two specific sensory conditions are met simultaneously. The hare's flight response is this kind of process — not a cognitive decision, but a multi-input template match at the ganglion level that directly activates motor pathways.

For small creatures with low integration capacity, this is how most behavior is produced. Thousands of actions per lifetime with zero cognitive content. The ganglion matches templates and fires motor pathways. What we observe looks like behavior — approach food, flee threats, hold still when sensing — but it's hardwired template matching producing motor activation, not decisions producing actions.

Infrastructure required: a ganglion receiving multiple sensory pathways, containing wired template circuits, and connected to motor pathways for the appropriate effector zones.

### Integration-Level (Deliberative)

Signals reach a processing center with enough capacity to hold multiple representations simultaneously, compare them against *learned* patterns (not just hardwired templates), sustain representations over time, and generate responses that aren't strictly template-matched. This is the deliberative layer as described in Cognition-Design.md.

The integration level can suppress ganglion-level motor activation because it operates on a richer representation — "this thing is large but last time I encountered one it didn't attack, and I'm not hungry enough to risk it." It can also modulate motor activation more precisely — shaping intensity to conserve substrate rather than always firing at maximum, or selecting which effector zone to recruit based on context.

This is the only level where anything resembling "choice" about motor execution occurs, and it's only available to creatures with sufficient neural infrastructure: integration capacity, memory structures, and the workspace architecture described in Cognition-Design.md.

Infrastructure required: all of the above (reflex arcs still exist, ganglion templates still exist) plus sufficient integration capacity and the memory/workspace structures for sustained representation and learned pattern matching.

### How These Levels Interact

Each level modulates the ones below it when the infrastructure supports it. A ganglion template can suppress a reflex arc — "the pathway-level reflex says withdraw, but the ganglion template says hold still because the vibration signature doesn't match threat." The integration level can suppress a ganglion template — "the template says flee, but I've learned this entity isn't dangerous."

Suppression requires physical connections between levels. If the integration center has no inhibitory pathway to the ganglion, it can't suppress the ganglion's motor output. The ganglion fires regardless of what the integration center "thinks." This is why startled animals bolt even when the threat isn't real — the ganglion-level template fires the motor pathways before the integration level can evaluate and suppress.

A creature's behavioral character emerges from which levels exist, what templates are wired at each level, and how much suppression/modulation each level can exert on the ones below it. A creature with only reflex arcs is purely reactive at the pathway level. A creature with ganglia but low integration capacity produces template-matched behavior that looks purposeful but isn't deliberated. A creature with high integration capacity can override templates, modulate motor activation, and produce genuinely novel responses — but the lower levels still fire by default unless actively suppressed.

### Hormonal / State Modulation

Future system. Hormonal states (stress, arousal, fatigue) modulate the sensitivity of all levels. A creature in a high-stress hormonal state has lower thresholds at every level — reflex arcs fire more easily, ganglion templates trigger on weaker input matches, and the integration level (if present) has a harder time suppressing lower-level activation because the lower levels are firing more aggressively. The creature is jumpy, explosive, quick to act, burning substrate faster.

A creature in a low-arousal state has higher thresholds — reflexes are dampened, templates require stronger matches, and the integration level has an easier time maintaining control. The creature is calm, efficient, harder to startle.

This isn't a decision. It's the biochemical environment all neural processing operates in. The same signal through the same pathway produces different motor response depending on hormonal state.

## Multi-Zone Coordination

What we observe as complex movements — a pounce, a gallop, a body slam — is the result of a coordinating center sending precisely timed signals down multiple separate pathways. The zones don't communicate with each other. They each independently receive and respond to signals from the same center.

The complexity of coordination a creature can produce is physically limited by:

**Pathway connectivity.** Which zones are connected to which coordinating centers. A zone can only participate in a coordinated movement if it has a motor pathway to the coordinating center generating the timing pattern. A zone connected to a different ganglion with no shared upstream coordinator cannot be synchronized with zones on the other ganglion — unless a higher-level center connects to both ganglia and can coordinate them.

**Coordinating center capacity.** A simple ganglion connected to four limbs might only manage "all on simultaneously" or "alternating pairs." A more complex motor coordination region (more neural investment) can shape independent timing for each pathway — different intensity per zone, variable phase relationships, real-time adjustment based on sensory feedback.

**Pathway bandwidth.** A thin pathway (low neural investment) can carry simple signals — on/off, high/low. A thick pathway (high neural investment) can carry graded, precisely modulated signals. This determines how finely the coordinating center can control the effector zone.

**Every observable motor behavior must be plausible given the creature's pathway topology and coordinating center capacity.** Having limbs is necessary but not sufficient. Having motor pathways from those limbs to a coordinating center with enough capacity to generate the required timing is sufficient. Body map authoring must ensure that any motor behavior a species exhibits is supported by its neural infrastructure.

## Zone Occupation

A zone can only participate in one activation pattern at a time. Muscle tissue that is sustaining a contraction (holding a grip, maintaining a bite) cannot simultaneously produce a different contraction (striking, locomoting). The zone is occupied.

This is not an action economy rule. It is a physical constraint of muscle tissue. A fiber that is contracted cannot contract again until it relaxes. A zone maintaining sustained activation is unavailable for other purposes until the activation ceases.

Consequences:
- A jaw holding prey cannot also snap-bite. The activation must change (release the hold, then strike).
- A limb grappling an opponent cannot also contribute to locomotion. The creature's speed is reduced by however much that limb's locomotion contribution mattered.
- A creature using all locomotion zones at maximum intensity cannot simultaneously execute a strike without disrupting its gait. It must reduce locomotion activation to free a zone for striking, or accept the disruption.

Zone occupation is the physical basis for trade-offs in combat. The game doesn't need rules about "one attack per turn" or "you can't move and attack." The body has zones, each zone does one thing at a time, and the activation pattern determines what each zone is doing at any moment.

## Pathway Destruction and Degradation

Zone destruction has motor consequences beyond losing muscle mass. If a destroyed zone lies along a motor pathway route, downstream zones connected through that pathway lose their neural connection. The tissue is intact but unreachable. This is paralysis or partial denervation.

The severity depends on pathway topology. A nervous system with multiple pathways from a coordinating center to the same effector zone (routed through different intermediate zones) degrades gracefully — losing one route still leaves alternatives, though bandwidth is reduced. A nervous system where each zone has a single pathway to its coordinating center is fragile — destroying one zone along the route disconnects everything downstream.

This connects to the existing clade architecture patterns. Clade A's distributed nervous system with pathway redundancy is more resilient to motor pathway disruption. Clade B's more centralized architecture with fewer redundant paths is more vulnerable — a single well-placed injury can disconnect entire limb groups from their coordinating centers.

## Relationship to Other Systems

**Cognition (Cognition-Design.md):** The current "reactive layer" in the code is mechanically equivalent to ganglion-level template matching. The "deliberative layer" is integration-level modulation. The motor system treats both as sources of activation signals — it doesn't distinguish between them. Cognition-Design.md may benefit from reframing the reactive layer as ganglion-level motor template matching rather than as a cognitive process, since template matching is physically a motor-adjacent phenomenon rather than a cognitive one. The deliberative layer is where cognition properly begins.

**Sensory (Sensory-Design.md):** Transducers are the input end of reflex arcs and the input to ganglion templates. A sensory signal can trigger motor activation with zero cognitive processing. Motor activity also produces sensory consequences — locomotion creates vibration emission, strikes create air pressure waves. The signal emission system (signals.js) should read motor activation state (which zones are active, at what intensity) to determine emission levels, replacing the binary `movedThisTurn` flag with continuous emission proportional to activation intensity.

**Body Map (Body-Sim-Design.md):** The body map is the source of truth for motor capability. Zone muscle mass, fiber composition, and local substrate determine tissue response. Pathway topology determines which zones can be recruited from which coordinating centers. Neural allocation determines coordinating center capacity. The motor system reads all of this. It never writes to the body map — tissue changes come from damage, healing, and mutation.

**Muscle Fiber & Energy (Muscle-Fiber-Design.md):** Fiber composition determines how tissue responds to different activation intensities. Local substrate determines whether fast-contracting fibers can fire. Circulatory efficiency determines slow-contracting fiber performance during exertion; circulatory regeneration efficiency (a separate, gentler measure) determines substrate regeneration rate at rest. The motor system sends activation signals. The fiber and energy system determines what those signals physically produce.

**Circulation (Circulatory-Immune-Design.md):** Circulatory type determines the aerobic ceiling — how effectively slow-contracting fibers perform during exertion. Circulatory regeneration efficiency (a separate measure with a gentler penalty for open systems) determines how quickly local substrate regenerates during low activity. The motor system doesn't read circulation directly. Tissue responds according to its state, and circulation affects tissue state continuously in the background.

## Implementation Sequence

1. **Audit existing body map pathway topology for motor use.** The body map already describes pathways for sensory/cognitive signal flow. Determine whether these same pathways can represent motor connections (likely yes — most biological nerve bundles are bidirectional). Add motor-specific pathway data only where the existing topology is insufficient.

2. **Add `fiberRatio` and per-zone substrate to body map zones.** One float for fiber composition, one float for current substrate level, one derived value for substrate capacity (from muscle mass). No behavioral change yet — the properties exist but nothing reads them.

3. **Insert motor layer between behavior selection and physical execution.** `executeAction` in behaviors.js currently dispatches directly to movement/combat functions. Insert a translation step: behavioral signal → pathway activation → zone recruitment → force/speed output. Initially the translation maps current behavioral outputs to activation parameters through the pathway topology.

4. **Derive speed from motor output.** Locomotion pathway activation at some intensity, locomotion zones respond with force based on tissue state, total force divided by total mass gives actual speed for that turn. Replaces static PTW computation. Speed becomes dynamic — it changes as substrate depletes across a chase.

5. **Derive strike damage from motor output.** Attack pathway activation at some intensity, attack zone responds with force based on tissue state. Replaces or augments the current flat damage formula. A fresh zone hits hard. A depleted zone hits with slow-contracting force only.

6. **Connect signal emission to motor activation intensity.** Vibration emission proportional to locomotion activation intensity rather than the binary `movedThisTurn` flag. High-intensity locomotion emits full vibration. Low-intensity emits proportionally less. Stalking becomes physically quiet because the activation intensity is low, not because of a special flag.

7. **Zone occupation tracking.** Zones in sustained activation (grapple, bite hold) are marked as occupied and excluded from other pathway recruitment. Release frees the zone. This becomes the physical basis for action trade-offs.

8. **Pathway destruction consequences.** Zone destruction checks whether motor pathways are severed. Downstream zones with intact muscle but severed pathways lose motor capability. When a zone is destroyed, trace all motor pathways through it and mark downstream zones as denervated for motor purposes.

9. **Reframe reactive rules as ganglion templates.** The reactive rules in cognition.js are mechanically ganglion-level template matching. As the motor system matures, these rules should be understood as wired motor templates — multi-input threshold checks that directly activate motor pathways — rather than as cognitive decisions that feed into a separate execution system.

10. **Action point speed system (future).** Replace probabilistic bonus moves with deterministic action points. Motor output (force from locomotion zones) → AP generation rate. Different activation intensities generate AP at different rates and consume substrate at different rates. The creature's speed profile changes continuously as tissue state changes.

## What NOT to Change

- The per-zone detection system. Sensing is upstream of motor execution (and also directly triggers motor activation via reflex arcs and ganglion templates).
- The body map zone structure. Motor pathway data, fiber properties, and substrate are additive properties on existing zones. No existing fields change.
- Zone HP, damage, and destruction mechanics. These still work as designed. The motor system adds consequences to destruction (pathway severing) but doesn't modify the damage model itself.
- Existing `muscle` values on zones. These represent total muscle mass. `fiberRatio` describes tissue composition within that mass. Substrate capacity derives from muscle mass. Nothing replaces existing values.
