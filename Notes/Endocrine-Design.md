# Endocrine System Design

The chemical broadcast layer. Describes how hormonal signals produce sustained whole-body state changes through the circulatory system, and how those state changes modulate neural thresholds, metabolic priorities, and tissue behavior.

## Important Note on Clade Descriptions

Throughout this document, "ancestral Clade A" and "ancestral Clade B" describe the starting conditions of each evolutionary lineage — the traits of the common ancestor from which modern species descended. **Clade is ancestry, not capability.** Any modern species from either clade may have evolved any trait that selection pressure demanded, including traits that resemble the other clade's ancestral condition.

When this document says "ancestral Clade B has open circulation," it means the common ancestor did. The hare has open circulation. A different modern Clade B species might have hybrid or fully closed circulation if its evolutionary history selected for it. Do not read clade descriptions as constraints on what a species can be. Read them as the default starting point for new species design — deviate whenever the creature's ecology demands it.

## The Problem Hormones Solve

A neural signal is point-to-point, instantaneous, and transient. It connects one sender to one receiver through a specific pathway, delivers a message, and ends. This works for precise, momentary instructions: contract this muscle, process this transducer signal.

Some situations require telling every tissue in the body to change what it's doing, simultaneously, and to sustain that change for a prolonged period. A neural signal can't do this without continuously firing along dedicated pathways to every target tissue, which is metabolically prohibitive.

The solution: dump a chemical into a fluid transport system that reaches every tissue. The chemical IS the message. Every cell with the right receptor hears the broadcast and changes its behavior. The chemical persists in the fluid until metabolized, so the message keeps broadcasting without the sender continuously transmitting.

This is what a hormone is: a chemical broadcast through a fluid transport system. The specific molecule is contingent on the organism's biochemistry. The concept — persistent whole-body state change via chemical broadcast — is convergent. Any multicellular organism that needs coordinated state changes and has a fluid transport system will evolve this solution. There is no alternative that provides persistent, whole-body broadcasting without continuous neural firing.

## Why Multiple Hormones Evolve

One broadcast chemical would work if every tissue needed the same instruction at the same time for the same duration. That's never the case.

Under threat, the nervous system needs lower firing thresholds (react faster), the muscles need mobilized energy (fight or flee), the gut needs to reduce activity (digestion can wait), the immune system needs to deprioritize certain functions (infection response can wait), and the reproductive system needs to pause (not the time). These are different instructions to different tissues, on different timescales.

Two evolutionary mechanisms produce tissue-specific responses:

**Receptor diversity.** One molecule arrives everywhere, but different tissues have different receptor proteins that trigger different downstream responses. The same chemical speeds up the heart (one receptor type) and constricts gut blood vessels (different receptor type). This is the cheap evolutionary path — mutate a receptor gene in one tissue lineage and you get tissue-specific interpretation of a universal signal.

**Multiple molecules.** Different chemicals with different receptor distributions and different clearance rates. Each molecule reaches every tissue but only affects tissues expressing its receptor. This allows independent state changes on independent timescales — one chemical for the acute 5-turn response, a different chemical for the sustained 20-turn metabolic shift. This is the expensive evolutionary path (new synthesis pathways, new receptors, new endocrine tissue) but it's necessary when the organism needs independent control of state changes that operate on different timescales.

Both mechanisms coexist. Receptor diversity handles tissue-specific response to a single signal. Multiple molecules handle independent timescale control. The number of distinct hormones a species has reflects the number of independent state changes it needs to manage on distinct timescales.

## Functional Categories

Regardless of the specific biochemistry, any organism with predator-prey dynamics, variable resource availability, and a circulatory system will converge on at least these functional hormone categories. The molecules are alien. The functions are universal.

### Alarm Hormone

**Function:** Acute threat response. Shift the entire body to emergency mode.

**Trigger:** Endocrine tissue receives neural signal from threat-detection ganglion (or equivalent). Release is fast — the gland dumps chemical into the circulatory system within the turn the neural signal arrives.

**Distribution:** Via circulatory system. Reaches tissues at a rate determined by circulatory efficiency. In a species with efficient circulation, the alarm chemical reaches peripheral tissues within the same turn. In a species with less efficient circulation, peripheral tissues may not receive the chemical until the following turn.

**Effects on target tissues (via receptors):**
- Neural tissue: lowers firing thresholds. Sensory neurons become more sensitive. Reflex arcs trigger more easily. Ganglion templates match on weaker input. This is the mechanism that produces sustained vigilance and post-scare jumpiness.
- Muscle tissue: increases energy mobilization to muscle cells. Slight improvement in force recruitment. Muscles are "ready."
- Digestive tissue: suppresses activity. Energy and blood flow redirected away from digestion.
- Circulatory tissue (heart equivalent): increases pumping rate. More rapid distribution of oxygen, fuel, and the alarm chemical itself.

**Clearance:** Metabolized by liver/kidney equivalent organs. Clearance rate gated by circulatory efficiency (the same system that distributed the chemical removes it). Half-life equivalent: 4-8 turns in a species with efficient clearance. Longer in species with less efficient clearance.

**Behavioral consequence:** After the threat ganglion stops firing (threat gone), the alarm chemical persists for several turns. During this window, lowered neural thresholds mean ambient sensory noise can trigger ganglion templates that would normally be sub-threshold. The animal is jumpy. It reacts to things a calm animal would ignore. This gradually resolves as the chemical clears.

### Mobilization Hormone

**Function:** Sustained metabolic reallocation. Shift energy priorities from growth, digestion, and storage toward vigilance, muscle readiness, and immune modulation.

**Trigger:** NOT directly triggered by a neural signal. Triggered by prolonged elevation of the alarm chemical. The endocrine tissue producing the mobilization hormone has receptors for the alarm hormone — when alarm levels have been elevated for multiple consecutive turns, the mobilization gland begins releasing. This is a chemical cascade: threat ganglion → alarm hormone → mobilization hormone. The mobilization hormone is the body noticing "I've been alarmed for a while — this isn't a momentary scare."

**Distribution:** Same circulatory route. Slower onset than alarm (takes 2-3 turns of sustained alarm to begin release, then builds gradually).

**Effects on target tissues:**
- Metabolic tissue: mobilize stored energy reserves. Convert stored substrate into circulating fuel. This is where the connection to muscle substrate becomes relevant — the mobilization hormone promotes replenishment of depleted muscle substrate from systemic energy reserves.
- Immune tissue: modulate immune activity. Shift resources away from long-term immune maintenance toward acute wound-response readiness. (Connects to Circulatory-Immune-Design.md.)
- Neural tissue: modest threshold depression (less than alarm hormone, but persistent). Sustained background vigilance.
- Growth/repair tissue: suppress non-essential repair. Wound healing may slow during sustained mobilization.

**Clearance:** Slow. Half-life equivalent: 15-25+ turns. This chemical is the sustained state change that outlasts the alarm. An animal that was under prolonged threat carries mobilization hormone for many turns after the threat ends, affecting its metabolism, immune function, and baseline alertness.

**Behavioral consequence:** An animal that has been stressed for many turns doesn't just calm down when the alarm clears. The mobilization hormone keeps it in a metabolically shifted state — eating more aggressively when food is available (replenishing depleted reserves), digesting less efficiently (gut is still suppressed), healing more slowly, but maintaining a modest vigilance boost. The animal is "recovering" even after it's no longer jumpy.

### Satiety / Hunger Hormones

**Function:** Regulate feeding drive. Signal energy state to the nervous system.

**Trigger:** Released by digestive tissue and energy-storage tissue based on current nutritional state. Full gut and adequate energy reserves → satiety hormone released → feeding drive suppressed. Empty gut and depleted reserves → hunger hormone released → feeding drive elevated.

**Relevance to current system:** The existing hunger drive in the AI system is an abstraction of this. Future implementation would replace the abstract hunger float with actual hormonal signaling from the gut/storage tissues. For now, note the connection and defer.

### Other Functional Categories (Future)

- **Reproductive hormones.** Seasonal or condition-dependent. Modulate behavior toward mating, territoriality, parental care. Deferred until reproduction is implemented.
- **Growth hormones.** Regulate development, tissue repair rate, body plan changes during maturation. Deferred until growth/mutation mechanics are implemented.
- **Social/signaling hormones.** In species with social behavior, internal hormonal state can influence external chemical emission (pheromones), affecting conspecific behavior. Deferred until social mechanics are considered.

## Endocrine Structures in the Body Map

Hormones don't appear from nowhere. They're produced by endocrine tissue — specialized cells whose job is to synthesize and release specific chemicals on command. This tissue lives somewhere in the body map.

### Where Endocrine Tissue Lives

On Earth, endocrine tissue takes several forms:

**Dedicated glands.** Discrete organs whose primary function is hormone production. Adrenal glands, thyroid, pituitary. These are typically located near major circulatory vessels for rapid distribution.

**Distributed endocrine cells.** Hormone-producing cells embedded in other organs. The gut lining contains cells that release hunger/satiety hormones. The heart itself releases hormones that regulate blood pressure. This is common in simpler organisms and in tissues that need to report their own state.

**Neurosecretory cells.** Neurons that are also endocrine cells — they receive neural signals and release hormones directly. Common in arthropods and mollusks. The neural and endocrine functions are combined in one cell type. This is especially relevant for Clade B's ancestral body plan, where distributed ganglia might include neurosecretory cells that release hormones locally.

For the body map, endocrine tissue needs:
- A physical location (which zone it's housed in)
- A neural pathway from whatever triggers its release (for neurally-triggered hormones like the alarm chemical)
- Access to the circulatory system (for distribution)
- A mass/capacity value (more endocrine tissue = more hormone production capacity)

### The Hare's Endocrine Architecture

The hare needs, at minimum:

**Alarm endocrine tissue.** Located in the torso (near circulatory access). Receives neural input from the threat-classification ganglion via a dedicated pathway. When the ganglion fires a threat template match, the neural signal reaches this tissue, and it releases alarm hormone into the circulatory system. The tissue's mass determines production capacity — how much hormone can be dumped per release event.

**Mobilization endocrine tissue.** Could be the same physical tissue with a second secretory cell type, or a separate structure. Triggered not by neural signal but by circulating alarm hormone (it has receptors for the alarm chemical). When alarm levels are sustained, this tissue begins releasing mobilization hormone. Produces the chemical cascade.

**Satiety/hunger tissue.** Distributed in the gut equivalent (probably the torso zone). Releases feeding-drive hormones based on nutritional state. For the current implementation, this can be deferred — the existing hunger drive float serves as a placeholder.

In the CREATURE_NEURAL data structure, the endocrine tissue would appear as additional structures:

```javascript
{
  id: 'alarm_endocrine',
  type: 'endocrine_gland',
  zone: 'torso',
  neuralMass: 0.002,        // small — it's a gland, not a processing center
  receivesFrom: ['threat_classification'],   // neural trigger
  produces: 'alarm',
  releaseRate: 0.3,          // how much chemical per trigger event
  requiresCirculation: true  // distribution depends on circulatory system
},
{
  id: 'mobilization_endocrine',
  type: 'endocrine_gland',
  zone: 'torso',
  neuralMass: 0.001,
  triggeredBy: 'alarm',      // chemical trigger, not neural
  activationThreshold: 0.4,  // alarm level must exceed this for sustained turns
  produces: 'mobilization',
  releaseRate: 0.1,
  requiresCirculation: true
}
```

## Hormonal State on Creatures

Per-creature state (persists across turns, saved/loaded):

```
creature.hormones = {
  alarm: 0.0,          // current circulating alarm hormone level
  mobilization: 0.0,   // current circulating mobilization hormone level
}
```

Each turn:

```
// Release (if triggered)
if (threatGanglionFired) {
  hormones.alarm += alarmEndocrineTissue.releaseRate;
}
if (hormones.alarm > mobilizationEndocrine.activationThreshold && sustainedForNTurns) {
  hormones.mobilization += mobilizationEndocrine.releaseRate;
}

// Clearance
hormones.alarm -= ALARM_CLEARANCE_RATE × circulationEfficiency;
hormones.mobilization -= MOBILIZATION_CLEARANCE_RATE × circulationEfficiency;

// Clamp
hormones.alarm = max(0, min(hormones.alarm, ALARM_MAX));
hormones.mobilization = max(0, min(hormones.mobilization, MOBILIZATION_MAX));
```

## How Hormones Modulate Neural Thresholds

The alarm hormone is circulating. It reaches neural tissue. Neurons with alarm-hormone receptors lower their firing thresholds in proportion to the hormone concentration.

```
effectiveThreshold = baseThreshold × (1.0 - hormones.alarm × ALARM_NEURAL_SENSITIVITY)
```

This applies to:
- Bolt reflex threshold on fore-limb ganglia
- Flee threshold on threat-classification region
- Alert threshold on threat-classification region
- Any other neural threshold in the creature

The mobilization hormone has a separate, smaller effect on neural thresholds:

```
effectiveThreshold = baseThreshold
  × (1.0 - hormones.alarm × ALARM_NEURAL_SENSITIVITY)
  × (1.0 - hormones.mobilization × MOBILIZATION_NEURAL_SENSITIVITY)
```

Where `MOBILIZATION_NEURAL_SENSITIVITY` is much smaller than `ALARM_NEURAL_SENSITIVITY` — the mobilization hormone provides a modest sustained depression, not the dramatic acute depression of the alarm.

## Distribution Timing

Hormone release and distribution are not instant. The chemical must travel through the circulatory system to reach target tissues.

**Efficient circulation (e.g., closed system):** Distribution within the same turn. The alarm hormone released in Phase 9 of this turn affects thresholds in Phase 1 of the next turn. Effectively one-turn delay.

**Less efficient circulation (e.g., open system):** Distribution may take 1-2 additional turns. Peripheral tissues receive the chemical later than central tissues. This means a species with less efficient circulation has a delayed onset of the hormonal stress response — the bolt reflex fires immediately (neural, not hormonal), but the sustained threshold depression takes 2-3 turns to fully establish. The tradeoff: slower onset, but also slower clearance. The hormonal state persists longer because the same inefficient circulation that was slow to distribute is slow to clear.

**Implementation note:** For simplicity, the first implementation can treat distribution as instant (hormone released → affects thresholds next turn). The distribution delay based on circulatory efficiency can be added later when it matters for gameplay. What matters now is the clearance rate difference.

## Clade Ancestral Patterns

### Ancestral Clade A

Closed circulatory system. Fast distribution, fast clearance. The ancestral condition favors a more differentiated endocrine system — multiple distinct hormones with distinct clearance rates — because each hormone's window is short enough that you need separate molecules for separate timescales. The alarm hormone clears in 4-8 turns, so you need a separate mobilization hormone for the 15-25 turn sustained shift. If the alarm hormone lasted 20 turns on its own, you wouldn't need the mobilization hormone at all.

Ancestral Clade A species tend to have crisp hormonal state transitions. Calm → alarmed → calm happens in a predictable, bounded timeframe. Good for persistence hunters and endurance grazers that need to shift states efficiently.

### Ancestral Clade B

Open circulatory system. Slow distribution, slow clearance. The ancestral condition may favor a simpler endocrine system — fewer distinct hormones — because each hormone persists long enough in the slow-clearing hemolymph to serve both acute and sustained functions. The alarm hormone takes longer to distribute but also takes longer to clear, potentially lasting 12-20+ turns. The sustained threshold depression that Clade A needs a separate mobilization hormone to achieve, Clade B gets "for free" from slow alarm clearance.

Ancestral Clade B species tend to have blurry hormonal state transitions. Calm → alarmed → calm is a gradual, extended process. The animal may be chemically stressed for many turns after a brief scare. This produces the sustained jumpiness, the false-positive bolting, the slow return to foraging.

### Modern Divergence

These are ancestral tendencies. Modern species from either clade may have any endocrine architecture that their evolutionary history produced.

A modern Clade B species with evolved closed or hybrid circulation would have faster hormonal clearance and might have evolved additional hormone types to compensate — its endocrine system might look more like the ancestral Clade A pattern.

A modern Clade A species occupying an ambush-predator niche might have evolved reduced endocrine complexity because it doesn't need fine-grained state transitions — it waits, it strikes, it's done.

A modern Clade B species with neurosecretory cells in its distributed ganglia might release hormones locally at each ganglion rather than from a centralized gland, producing regionalized hormonal effects that a centralized system can't — different body regions at different stress levels simultaneously. This is architecturally distinct from anything in Clade A's ancestral toolkit.

The body map for each species defines its specific endocrine architecture. The clade tells you where to start designing. The species' ecology tells you where to deviate.

## Connection to Other Systems

**Circulatory (Circulatory-Immune-Design.md):** The circulatory system IS the distribution and clearance mechanism for hormones. Circulatory efficiency directly determines onset speed, distribution completeness, and clearance rate. Circulatory damage (blood loss, vessel damage) impairs hormone distribution — a severely wounded animal may not be able to mount a full hormonal stress response because the distribution system is compromised.

**Motor (Motor-System-Design.md):** The alarm hormone modulates neural thresholds, which determines how easily ganglion templates fire, which determines motor activation. The motor system doesn't read hormones directly — it reads ganglion output. Hormones modulate the ganglia, and the ganglia drive the motor pathways.

**Muscle Fiber (Muscle-Fiber-Design.md):** The alarm hormone's effect on muscle tissue (increased energy mobilization, slight force improvement) connects to the substrate system. The mobilization hormone's effect on stored energy connects to substrate regeneration — mobilization hormone could increase the rate at which systemic energy reserves are converted to local muscle substrate.

**Cognition (Cognition-Design.md):** For creatures with integration capacity, hormonal state modulates the integration workspace too. A heavily stressed animal has a harder time sustaining deliberative thought — the lowered thresholds mean reflexive and ganglion-level responses dominate because they fire more aggressively, giving the integration workspace less time to suppress them. This is physically accurate — stressed humans make worse decisions because the prefrontal cortex is competing with a hyperactive amygdala.

**Sensory (Sensory-Design.md):** Alarm hormone doesn't change transducer quality (that's hardware). But it changes the neural processing of transducer signals — lowered thresholds mean the same signal quality produces a stronger response. Effective sensitivity increases under stress, but so does noise sensitivity. More detections, more false positives.

## Implementation Sequence

1. **Add endocrine structures to the hare's body map.** Alarm gland and mobilization gland in the torso zone. Neural pathway from threat-classification ganglion to alarm gland. Chemical trigger from alarm to mobilization.

2. **Add `hormones` object to creature state.** `{ alarm: 0.0, mobilization: 0.0 }`. Persists across turns. Saved and loaded.

3. **Hormonal update in the creature turn loop.** After ganglion processing, check if threat ganglion fired → release alarm. Check if alarm is sustained → release mobilization. Apply clearance each turn.

4. **Threshold modulation from hormonal state.** All ganglion thresholds (bolt, flee, alert) are multiplied by a factor derived from current alarm and mobilization levels. This is the core behavioral effect — jumpiness, sustained vigilance, gradual calming.

5. **Substrate regeneration modulation (future).** Mobilization hormone increases rate at which systemic energy is converted to local muscle substrate. Connects the endocrine system to the muscle fiber system.

6. **Metabolic effects (future).** Alarm suppresses digestion. Mobilization shifts energy priorities. Connects to future gut/metabolism system.

## What NOT to Change

- The ganglion architecture described in Motor-System-Design.md and CREATURE_NEURAL. Ganglia still fire when input matches and stop when it doesn't. Hormones modulate thresholds, not ganglion behavior. The ganglion doesn't "know" about hormones — its thresholds are lower because the chemical environment changed.
- The detection/sensory system. Transducer quality is hardware. Hormones affect the neural processing of signals, not the signal quality itself.
- The body map zone structure. Endocrine tissue is an additive structure, not a modification of existing zones.
- The existing reactive rules for non-CREATURE_NEURAL creatures. They continue to work as before. Hormonal state only applies to creatures with endocrine architecture defined.
