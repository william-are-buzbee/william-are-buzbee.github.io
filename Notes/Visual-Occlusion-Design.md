# Visual Occlusion Design

## Overview

Terrain cover affects vision through two physically distinct mechanisms. This document defines both, describes how they interact with the existing per-eye visual system and SNR-based detection, and specifies per-cover-type values.

This replaces the broken tree transparency system (trees are currently fully transparent — they should partially occlude) and generalizes to all cover types.

---

## The Two Mechanisms

### 1. Sightline Opacity — Ray Degradation

Cover between the observer and the target degrades the sightline. Each cover tile along the ray adds opacity. When accumulated opacity exceeds the observer's occlusion budget, the ray terminates — tiles beyond that point are not visible (terrain, creatures, items, nothing).

This affects the FOV system. A creature looking through dense forest has a dramatically shorter effective visual range along that ray than across open ground. The effect is per-ray — a tree directly to your east doesn't affect your vision to the north.

**Occlusion budget:** Each eye's budget is derived from its acuity.

```
occlusionBudget = acuity × OCCLUSION_BUDGET_COEFF
```

Higher acuity means the observer can resolve signal through more accumulated noise. When accumulated sightline opacity along a ray exceeds the budget, the ray stops.

**Binocular depth advantage:** Rays through the binocular zone get a budget bonus because stereoscopic depth perception helps separate "tree at 3 tiles" from "target at 5 tiles." Monocular rays use the base budget.

```
binocularBudget = occlusionBudget × BINOCULAR_DEPTH_BONUS
monocularBudget = occlusionBudget
```

This gives forward-eyed predators a meaningful advantage in forest environments — their large binocular zone gets the depth bonus across a wide forward arc, letting them see further through cover than a lateral-eyed prey animal looking through the same forest.

**What this produces:**
- A hare (acuity ~3, lateral eyes, thin binocular strip) in dense forest sees maybe 2-3 tiles in any direction. Its small binocular zone barely helps.
- A mesocarnivore (acuity ~4, forward eyes, wide binocular zone) sees 3-4 tiles forward through the same forest, maybe 2-3 in its monocular periphery.
- An apex predator (acuity ~5, forward eyes) sees 4-5 tiles forward through forest.
- All of them see 15-20 tiles across open ground (sightline opacity of zero, budget irrelevant).

### 2. Local Concealment — Target-Tile Cover

Cover on the target's tile partially hides creatures standing on it. Unlike sightline opacity, this doesn't affect terrain visibility — you can see the tile, see the grass, see the ground. But a creature there has its visual signal reduced.

Local concealment feeds into the detection system as an SNR modifier on the visual channel. It doesn't create a new detection mechanism — it adjusts the existing one.

**Size-dependent concealment:**

Cover has an effective height class. The creature has a derived height from its body plan. The concealment effect scales with how much of the creature the cover actually hides.

```
coverRatio = min(1.0, coverHeight / creatureHeight)
effectiveConcealment = baseConcealmentValue × coverRatio
```

A mouse in tall grass: `coverRatio ≈ 1.0`, full concealment.
A hare in tall grass: `coverRatio ≈ 0.7`, strong concealment.
A large predator in tall grass: `coverRatio ≈ 0.3`, weak concealment — head and back exposed.
Any creature on open ground: `coverRatio = 0`, zero concealment.

**Creature height derivation:**

Rather than storing height explicitly, derive it from body map data. A simple proxy:

```
creatureHeight = (totalMass)^(1/3) × BODY_PLAN_HEIGHT_COEFF
```

The cube root of mass gives a rough linear dimension. The coefficient adjusts for body plan — low-slung creatures (clade B, cephalopod-like) would have a lower coefficient than tall upright creatures. For the initial implementation, a single coefficient is fine. Per-clade or per-species coefficients can be added later.

**SNR modifier:**

Local concealment reduces the visual signal strength at the detection step:

```
visualSignal = baseVisualSignal × (1.0 - effectiveConcealment)
```

This plugs into the existing `detectTargetPerZone` calculation for visual channels. The detection system already computes SNR = signal / noise. Reducing the signal is equivalent to the creature being partially hidden.

**Motion reduces concealment benefit:**

A motionless creature gets full concealment from cover. A moving creature gets reduced concealment because biological motion detection is a separate, low-acuity visual pathway — it doesn't need to resolve the full silhouette, just detect that the cover pattern is disturbed.

```
motionFactor = isMoving ? MOTION_CONCEALMENT_REDUCTION : 1.0
effectiveConcealment = effectiveConcealment × motionFactor
```

A hare sitting motionless in tall grass is very hard to detect. A hare bolting through tall grass is much easier — the grass itself reveals the movement. `MOTION_CONCEALMENT_REDUCTION` of ~0.3-0.4 means a moving creature retains only 30-40% of the concealment benefit.

---

## Cover Type Properties

Each cover type carries two values: `sightlineOpacity` and `baseConcealmentValue`, plus a `coverHeightClass`.

Cover height classes (relative scale, not real units):
```
none:   0    — open ground, water, bare rock
low:    0.3  — short grass, moss, shallow scrub
medium: 0.7  — tall grass, ferns, dense undergrowth
high:   1.0  — forest undergrowth, dense brush
```

Cover type table:

| Cover Type | Sightline Opacity | Base Concealment | Cover Height Class | Notes |
|---|---|---|---|---|
| None / open ground | 0.0 | 0.0 | none | Full visibility in all directions |
| Short grass | 0.0 | 0.1 | low | Negligible visual effect |
| Tall grass | 0.05 | 0.6 | medium | Almost transparent to sightlines, strong local concealment for small creatures |
| Dense undergrowth | 0.3 | 0.7 | high | Moderate sightline blocking AND strong concealment |
| Scattered trees | 0.35 | 0.15 | — | Moderate sightline blocking, minimal concealment on the tile itself (trunks, not ground cover) |
| Dense forest | 0.5 | 0.25 | medium | Heavy sightline blocking, moderate ground-level concealment from undergrowth |
| Boulders / rocky outcrop | 0.6 | 0.1 | — | Very opaque sightlines (solid rock), but standing next to a boulder doesn't hide you |
| Solid wall | 1.0 | — | — | Full block, ray terminates immediately (existing behavior) |

**Note on trees and concealment:** Trees block sightlines (trunks are opaque) but their concealment value reflects ground-level undergrowth, not the trunk itself. A creature standing in dense forest has moderate concealment from ferns and undergrowth, not from the tree trunk it's next to. The sightline opacity is the primary effect of trees.

**Note on height class for trees:** Tree cover height class is listed as medium for dense forest (undergrowth component) and unmarked for scattered trees (minimal ground cover). The sightline opacity is doing the heavy lifting for trees, not the concealment.

---

## Interaction with Existing Systems

### FOV System (fov.js)

The shadowcasting algorithm currently treats tiles as fully transparent or fully opaque. This changes to: each tile along a ray accumulates sightline opacity. The ray terminates when accumulated opacity exceeds the observer's occlusion budget.

The per-eye computation (`updatePlayerFOV`) already processes rays per eye. The occlusion budget check goes inside the ray-marching loop. The budget is per-eye (from that eye's acuity), with the binocular bonus applied to rays in the binocular zone.

Tiles reached before budget exhaustion are added to `fovSet` (binocular) or `monocularSet` as before. Tiles beyond budget exhaustion on that ray are simply not added — same as if a wall blocked them.

### Ambient Visual Sensing (fov.js)

Ambient visual peripheral range (`updateAmbientSensing`) currently uses a simple radius. It should also be subject to sightline opacity — the ambient visual radius is reduced in forested areas because you can't see terrain 15 tiles away through trees.

Simplest approach: compute an effective ambient visual radius that accounts for average sightline opacity of surrounding terrain. This is an approximation (ambient sensing is already an approximation — it doesn't cast individual rays). A weighted average of nearby tile opacities could scale the radius down.

Alternatively, leave ambient sensing unmodified for now and let the per-eye FOV changes handle the important cases. The ambient system marks tiles as explored (terrain visible, no entities). If the per-eye system correctly limits entity detection through cover, ambient sensing being slightly generous for terrain-only display is acceptable.

### Detection System (detection.js)

`detectTargetPerZone` computes visual SNR per zone per target. Local concealment modifies the visual signal before SNR computation. This is the only change to detection — add the concealment modifier to the visual channel's signal calculation.

The detection system should also check whether the target tile is actually in the observer's FOV (it already does this). If a tree-heavy sightline means the tile didn't make it into the FOV set, the detection system never runs for targets on that tile. The systems compose naturally.

### Rendering (rendering.js)

Currently three tiers: binocular (bright), monocular (18% overlay), explored (42% overlay). No changes needed to the tier system. The FOV changes mean fewer tiles make it into fovSet/monocularSet when trees are in the way, which naturally results in less visible terrain in forests. The renderer doesn't need to know about occlusion — it just draws what the FOV system says is visible.

Optional future enhancement: tiles at high accumulated occlusion (near the budget limit) could render slightly dimmer than tiles at zero occlusion, representing visual clarity degradation. Not required for the initial implementation.

### Scent System (scent.js)

Not affected. Scent doesn't care about visual occlusion. Ground trails are detected by contact chemical transducers (physical proximity). Airborne scent is wind-driven. Neither uses sightlines.

### Vibration System

Not affected. Vibration propagates through substrate, not through sightlines. The vibration ambient grounding (future work) will have its own terrain interaction model.

---

## Constants

```
OCCLUSION_BUDGET_COEFF      — acuity → budget scaling (tune so acuity 3 ≈ 2-3 tree tiles, acuity 5 ≈ 4-5)
BINOCULAR_DEPTH_BONUS        — multiplier on budget for binocular rays (~1.3-1.5)
MOTION_CONCEALMENT_REDUCTION — fraction of concealment retained when moving (~0.3-0.4)
BODY_PLAN_HEIGHT_COEFF       — mass^(1/3) → creature height proxy
```

Cover properties (sightlineOpacity, baseConcealmentValue, coverHeightClass) live on the terrain/cover type definitions, not as separate constants. They are intrinsic to the cover type.

---

## What This Is Not

This system handles how terrain cover interacts with visual detection. It does not handle:

- **Camouflage** — integument matching environment (future, depends on pattern library system)
- **Active concealment** — creature choosing to hide (future, depends on motor system + stealth behavior)
- **Non-visual detection through cover** — vibration and scent have their own terrain interactions
- **NPC vision** — NPCs still use VISION_PROFILES and don't have per-eye computation. NPC vision through cover is deferred to the NPC vision update

---

## Design Principles Compliance

**Everything is physical.** Sightline opacity is a physical property of the cover (how much material blocks light). Occlusion budget is derived from the eye's acuity (a physical property of the transducer). Concealment is a ratio of cover height to creature height (physical dimensions). Motion detection is a separate neural pathway (physical visual processing). No probabilities, no creature-level stats, no named programs.

**If the structure is destroyed, the behavior stops.** If an eye zone is destroyed, that eye's FOV contribution stops — no rays, no budget, no detection through that eye. Existing per-eye system already handles this.

**A biologist could infer this from anatomy.** Looking at a creature's eye acuity and placement, a biologist would predict: "this forward-eyed predator with high acuity can resolve targets through moderate cover that this lateral-eyed prey animal with lower acuity cannot." That's exactly what the system produces.
