# Muscle Fiber & Energy Systems Design

Extension to Body-Sim-Design. Covers zone-level muscle fiber composition, local energy substrate as a tissue property, circulation-dependent aerobic efficiency, and how these produce speed, combat force, and fatigue as downstream physical consequences.

## Core Concept

Every muscle contains fibers on a spectrum from slow-contracting/fatigue-resistant to fast-contracting/fatigue-prone. This spectrum is convergent — any planet with motile multicellular life would produce it, because the physics of force generation demands it. Fast contraction requires rapid local energy release. Rapid energy release depletes local stores. Depletion means fatigue. The specific biochemistry is alien and unspecified. The physical constraint is universal.

Each zone's position on this spectrum is described by one new property:

`fiberRatio` (0.0 = all slow-contracting, 1.0 = all fast-contracting)

The zone's existing `muscle` mass splits into two functional pools:

```
fastContractingMass = zone.muscle × zone.fiberRatio
slowContractingMass = zone.muscle × (1 - zone.fiberRatio)
```

These are not separate tissues. They describe the composition of the muscle in that zone — what it can do and at what cost.

## The Fiber Spectrum

On Earth this spectrum is categorized as Type I (slow-twitch), Type IIa (fast oxidative), and Type IIx (fast glycolytic). The underlying reality is a continuum of contraction speed versus fatigue resistance. Faster contraction requires more local energy per contraction cycle. More local energy consumption means faster depletion. More depletion means shorter time to exhaustion.

Slow-contracting fibers are sustained by circulatory delivery of fuel and oxygen. They produce moderate force indefinitely as long as circulation delivers. They can also work intensely — a sustained isometric hold, a grinding grapple, load-bearing under weight — can push slow-contracting fibers to their aerobic ceiling. They fatigue too, through circulatory limitation and metabolic heat, but they recover quickly because the aerobic infrastructure supports them.

Fast-contracting fibers burn local energy substrate stored directly in the muscle cells. They produce high force rapidly but deplete their local stores in seconds to minutes of intense use. The substrate must be local because circulatory delivery is too slow for the energy demand of fast contraction. When the substrate is gone, these fibers cannot fire at full capacity regardless of the signal they receive.

The intermediate range exists — fibers that contract faster than pure slow but recover better than pure fast. On an alien planet the spectrum might be distributed differently, but the endpoints are fixed by physics: sustained-and-slow on one end, explosive-and-depleting on the other.

## Local Energy Substrate

Substrate is stored in muscle cells. It is a physical consequence of having muscle tissue, not a separate resource. More muscle stores more substrate. Fast-contracting fibers store more substrate per unit mass than slow-contracting fibers (their metabolic machinery is oriented toward local storage rather than circulatory dependence).

Each zone has its own substrate level. Per-zone, not per-creature. A zone's substrate capacity derives from its muscle mass:

```
zone.substrateMax = zone.muscle × SUBSTRATE_PER_KG_MUSCLE
```

`SUBSTRATE_PER_KG_MUSCLE` is a game-wide constant. Substrate initializes to max after rest and depletes independently per zone based on that zone's activity.

### Depletion

When a zone's fast-contracting fibers are activated (the zone receives a high-intensity activation signal through its motor pathway), the fibers consume substrate proportional to the fast-contracting mass recruited and the duration of activation:

```
substrateCost = zone.fastContractingMass × SUBSTRATE_DEPLETION_RATE × activationDuration
```

A zone that isn't receiving high-intensity activation consumes negligible substrate. Slow-contracting fibers don't draw meaningfully from the local store — they're sustained by circulation.

### Regeneration

Substrate regenerates when the zone is at low activity. Every muscle cell — regardless of fiber type — has the enzymatic machinery to resynthesize substrate from circulating blood sugar. The rate limiter is circulatory delivery of raw material and the activity level of the resynthesis enzymes, not which fiber type the cell is.

```
vascularityFactor = VASCULARITY_MIN + (1.0 - VASCULARITY_MIN) × (1 - zone.fiberRatio)
depletionBoost = 1.0 + REGEN_UPREGULATION × (1.0 - substrateFraction)
regenRate = zone.muscle × SUBSTRATE_REGEN_BASE × circRegenEfficiency × vascularityFactor × depletionBoost
```

Four factors govern the rate:

**Total muscle mass.** More muscle means more cells, more enzymatic capacity to process delivered substrate. This is the primary driver — every cell contributes, not just one fiber type.

**Circulatory regeneration efficiency.** How effectively the circulatory system delivers blood sugar to the zone at rest. This uses separate efficiency values from the aerobic force output constants because the physical process is different. Aerobic force output requires real-time oxygen delivery under load — open circulation genuinely struggles there. Substrate regeneration happens at rest, over minutes, with the muscle slowly absorbing circulating sugar. Open circulation (hemolymph bathing tissue directly) is adequate for this; the penalty is modest (roughly 20%) rather than severe (35% for aerobic output).

**Vascularity.** Oxidative fibers correlate with higher capillary density — more blood vessels per unit volume, because those fibers rely on constant circulatory delivery for normal operation. A zone with high fiberRatio has fewer capillaries and receives somewhat less blood flow, slowing nutrient delivery. This is a secondary modifier (25-35% penalty at extreme fiberRatio), not the primary bottleneck. A purely fast-twitch zone still regenerates — it just receives less blood flow per unit volume.

**Enzymatic upregulation (depletion boost).** The resynthesis enzyme is allosterically inhibited by its own product — when substrate stores are full, the enzyme slows down. When stores are depleted, the enzyme is maximally active. This produces a front-loaded recovery curve: rapid initial resynthesis that tapers as stores approach capacity. An empty zone refills its first 50% much faster than its last 50%. This is the mechanism that allows prey animals to recover functional sprint capacity within minutes of a bolt — the enzymatic acceleration at low stores does the heavy lifting.

The combination of these factors means that a heavily fast-twitch zone with open circulation (like the hare's rear locomotion) has a slower baseline regeneration rate, but the depletion boost ensures functional recovery is fast enough to survive repeated predator encounters. A mixed-fiber zone with closed circulation (like a prowler's locomotion) regenerates faster at baseline because it has better vascularity and better circulatory delivery.

### Consequences of Per-Zone Substrate

Each zone depletes and regenerates independently. This creates physical sequencing:

- A creature that has been sprinting has depleted locomotion zone substrate. Its jaw zone is fresh. Its torso is fresh. It can still bite at full force and grapple at full strength. It just can't run fast.
- A creature that has been fighting — repeated strikes with a claw limb — has depleted that limb's substrate. Its other limbs and locomotion zones are fresh. It can switch to a different attack limb at full force, or disengage at full sprint speed.
- A zone that was both striking and locomoting (a limb tagged for both) depletes from both demands simultaneously. Dual-purpose zones burn substrate faster than single-purpose zones under the same total activity.

The order in which a creature uses its body matters. Substrate is local. Depletion is local. Recovery is local.

## How Fiber Composition Produces Physical Outputs

The motor system (see Motor-System-Design.md) sends activation signals through pathways to effector zones. The zone's tissue responds based on what it physically is. Fiber composition and substrate state determine the response. There are no named outputs or ability categories — just tissue producing force.

### Speed

When locomotion zones are activated at high intensity, each zone produces force based on:

```
zoneForce = zone.slowContractingMass × circulationEfficiency
          + zone.fastContractingMass × (zone.substrate / zone.substrateMax)
```

Total locomotion force is the sum across all active locomotion zones. Speed for that turn:

```
speed = totalLocoForce / totalBodyMass
```

At full substrate, the hare's locomotion zones produce approximately 2.29 force units (1.90 fast + 0.39 slow). At empty substrate, they produce 0.39 (slow only). Same activation signal, same pathways, dramatically different output. The hare doesn't "decide" to slow down. Its tissue can't do what it used to do.

### Strike Force

When an attack zone is activated at high intensity (a strike, a bite), the zone produces:

```
strikeForce = zone.slowContractingMass × circulationEfficiency
            + zone.fastContractingMass × (zone.substrate / zone.substrateMax)
```

A fresh zone hits hard. A depleted zone hits with slow-contracting force only. The same pathway fires, the same coordinating center sends the same signal. The output depends on tissue state.

### Sustained Force (Holds, Grapples)

When a zone is activated at low-to-moderate intensity over sustained duration (a bite hold, a grapple, load bearing), the slow-contracting fibers do the work. Force output:

```
sustainedForce = zone.slowContractingMass × circulationEfficiency
```

Substrate consumption is negligible because fast-contracting fibers aren't recruited. But the slow-contracting fibers can still fatigue at their aerobic ceiling — sustained intense holds eventually degrade through circulatory limitation. This is slower and less dramatic than fast-fiber depletion but it's real.

## Circulation and Fiber Interaction

The key interaction: fast-contracting fibers don't need efficient circulation. They burn substrate stored locally, without oxygen. Slow-contracting fibers depend entirely on circulatory oxygen delivery.

A creature's circulatory type selectively affects one end of the fiber spectrum. Efficient circulation (closed systems) gets full value from slow-contracting fibers. Less efficient circulation (open systems) gets reduced value. Both get full value from fast-contracting fibers because those fibers don't use circulatory delivery.

Circulation affects substrate regeneration through a different mechanism and with a different penalty than aerobic force output. During exertion, the muscle needs oxygen delivered in real time — open circulation genuinely struggles here (lower pressure, non-directed flow, hemocyanin carrying less oxygen per volume). The aerobic output penalty for open circulation is substantial. During rest, the muscle slowly rebuilds substrate stores from circulating blood sugar — hemolymph bathing tissue directly is adequate for this slow, steady nutrient uptake. The regeneration penalty for open circulation is modest. These are separate physical processes with separate efficiency values.

Consequence: creatures with less efficient circulation naturally evolve toward higher fiberRatio in high-demand zones, because fast-contracting fibers give them the most return on muscle investment. This is an evolutionary outcome that body maps should reflect for species with open circulation — not a rule imposed on the design.

Creatures with efficient circulation face no such pressure. They can afford mixed fibers and balanced strategies because both fiber types work well.

Circulation type is a per-creature property, not a per-clade constant. Both clades have radiated extensively. While ancestral Clade B used open circulation and ancestral Clade A used closed, modern descendants of either clade may have evolved any circulatory configuration that selection pressure demanded. See Circulatory-Immune-Design.md for full details.

## Clade Fiber Organization

### Clade A — Ancestral Pattern: Mixed Fibers

The ancestral Clade A body plan interleaves slow-contracting and fast-contracting fibers within each muscle. Both fiber types contribute simultaneously within a zone. `fiberRatio` represents a smooth blend — a zone with fiberRatio 0.5 has half its muscle producing fast force and half producing sustained force at any activation intensity.

This makes Clade A zones versatile. A locomotion zone responds smoothly across the full range of activation intensities. The trade-off: Clade A zones are rarely as explosive as a fully specialized fast-contracting zone.

### Clade B — Ancestral Pattern: Segregated Fibers

The ancestral Clade B body plan tends to segregate fiber types across zones rather than blending within them. A locomotion zone is either heavily fast-contracting (fiberRatio 0.7+) or heavily slow-contracting (fiberRatio below 0.3), with the intermediate range being less common.

This makes Clade B zones specialized. A fast-contracting locomotion zone is explosively powerful but contributes little sustained force. A slow-contracting postural zone maintains position efficiently but can't contribute to burst acceleration. The creature as a whole transitions between explosive activity and stillness rather than smoothly modulating.

### Modern Radiation

Both patterns are the ancestral condition, not a fixed rule. Modern descendants of either clade have diversified. A Clade B lineage under sustained selection for endurance could evolve more mixed fibers and improved circulation to support them. A Clade A lineage under selection for ambush predation could evolve more segregated, fast-contracting-dominant muscles. The ancestral pattern describes the starting point and the common case, not a biological law.

When designing new species, use the ancestral pattern as the default and deviate when the creature's ecology demands it.

## Example Species Profiles (Current Roster)

### Small Grazer (Hare) — Clade B, 5kg, Open Circulation

Locomotion fiberRatio: 0.70-0.80. Massive burst. Locomotion substrate depletes in ~8-10 turns of maximum-intensity activation. Slow-contracting fallback is weak (open circulation reduces aerobic output). Power cliff ~6× from full to empty. Strategy: detect threat early, explosive flee to cover, rest and regenerate. If caught in the open after depletion, extremely vulnerable.

### Meso-Predator (Prowler) — Clade A, 22kg, Closed Circulation

Locomotion fiberRatio: 0.40-0.50. Moderate burst, good sustain. Locomotion substrate lasts 12-15 turns of active chase. Slow-contracting base is strong (closed circulation). Power curve is a gentle slope, not a cliff. Strategy: stalk close, short burst to close distance, sustained chase if needed. Can outlast burst-dependent prey in extended pursuits.

### Apex Predator (Ravager) — Clade A, 90kg, Closed Circulation

Locomotion fiberRatio: 0.30-0.40. Low burst, excellent sustain. Massive substrate reserves (large total muscle mass). Slow-contracting base is dominant. Strategy: persistence. Never sprints, never stops. Catches exhausted prey at a walk. Terrifying not because it's fast but because it's inevitable.

### Ambush Predator (Lurker) — Clade B, 24kg, Open Circulation

Locomotion fiberRatio: 0.80-0.90. Extreme burst. Locomotion substrate depletes in 4-6 turns. Strike zones also very high fiberRatio — devastating first-hit damage. Slow-contracting fallback is very weak. Strategy: ambush from stillness, kill in 2-3 turns, retreat if it fails. Extended engagement is a death sentence for this creature.

### Large Herbivore (Shale-back) — Clade A, 200kg, Closed Circulation

Locomotion fiberRatio: 0.25-0.35. Low burst, immense slow-contracting base. Enormous substrate reserves but rarely needs them. Strategy: too large for most predators. Slow-contracting torso mass provides grapple/shove strength. When it does flee to water, it maintains a steady pace that never drops.

## Intended Future: Action Point Speed System

The current speed system (probabilistic bonus moves from PTW ratio) will be replaced by a deterministic **action point (AP)** model. Each entity generates AP proportional to their current locomotion force output. When accumulated AP crosses a threshold, the entity may act. Movement, attacks, and other actions cost AP. Faster creatures act more frequently at a smooth, predictable cadence.

The fiber and substrate system feeds this directly: locomotion force output (which changes as per-zone substrate depletes) modulates AP generation rate per tick. A hare at full substrate generates AP rapidly. As substrate drops, AP generation slows smoothly. The player sees the creature visibly decelerate. AP costs can vary by action type, making substrate management tactically meaningful.

Implementation details, exact AP thresholds, and per-action costs are deferred to a dedicated speed-system design pass. The fiber and substrate systems described in this document are the upstream input to whatever speed model is active.

## Implementation Sequence

1. **Add `fiberRatio` to all body map zones.** One float per zone. Use species profiles and the hare data entry prompt as starting values. No behavioral change yet.

2. **Add per-zone substrate.** `substrateMax` derived from zone muscle mass × `SUBSTRATE_PER_KG_MUSCLE`. `substrate` initialized to max. Depleted by high-intensity motor activation on the zone, regenerated during low activity at a rate driven by total muscle mass, circulatory regeneration efficiency, vascularity (capillary density correlated with oxidative fiber content), and enzymatic upregulation (front-loaded curve — faster refill when stores are low).

3. **Modify speed to read fiber composition and per-zone substrate.** Replace `locoMuscle / totalMass` with per-zone force summation. Each locomotion zone contributes force based on its fiber composition and current substrate level. This makes speed dynamic. Still uses the probabilistic bonus-move system until AP is built.

4. **Modify combat damage to read strike zone fiber state.** The attacking zone's force output depends on its fiber composition and current substrate. A fresh zone hits hard. A depleted zone hits with slow-contracting force only.

5. **AP speed system (future).** Replace probabilistic bonus moves with deterministic action points. Per-zone locomotion force → AP generation rate. Substrate depletion smoothly reduces AP generation.

6. **Metabolic waste / recovery debt (optional, future).** Fast energy release produces byproducts that further inhibit fiber performance beyond simple substrate depletion. Cleared by aerobic metabolism during rest. Adds a recovery debt — a creature that sprinted hard needs longer to return to full burst capacity than substrate regeneration alone would suggest. Connects to the immune/metabolism system.

## What NOT to Change

- The body map zone structure — `fiberRatio` and substrate are additive properties, no existing fields change.
- The cognitive architecture — it sends behavioral signals, the motor system (Motor-System-Design.md) translates them into activation, and fiber/substrate determines tissue response. These are separate concerns.
- The detection/sensory system — independent of muscle fiber state.
- Existing `muscle` values on zones — these represent total muscle mass and remain correct. `fiberRatio` describes composition within that mass. Substrate capacity derives from muscle mass. Nothing replaces existing values.
- Circulatory type assignments per species — defined in Circulatory-Immune-Design.md and referenced here, not duplicated.
