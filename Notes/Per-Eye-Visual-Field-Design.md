# Per-Eye Visual Field System — Design Document

Design reference for the physical visual field system that replaces the creature-level cone angle. Describes how visual fields are computed from individual eyes as physical organs on specific body map zones, how binocular and monocular zones emerge from eye overlap, and what information each zone provides.

Include alongside Sensory-Design.md, Ambient-Terrain-Sensing-Design.md, and Design-Principles.md when working on FOV, vision, detection, rendering, or new creature body maps.

---

## What This Replaces

The current system has a single creature-level cone angle from `VISION_PROFILES`:

```js
wolf:  { visionType: 'cone', coneAngle: 90 },
hare:  { visionType: 'cone', coneAngle: 170 },
lurker: { visionType: 'cone', coneAngle: 100 },
```

This fails the Design Principles test on every point:

- **"Can I point to the physical structure?"** No. The cone is on the creature, not on a zone. It can't be traced to a specific eye or transducer.
- **"If that structure were destroyed, would this behavior stop?"** No. Destroying the head zone doesn't change the cone angle — it's a creature-level property.
- **"Can someone infer this from the body map?"** No. Looking at `transducers: { visual: 4 }` on the head zone tells you nothing about the visual field shape. You need to look up VISION_PROFILES by species key, which is a behavior label, not anatomy.

The replacement: each eye is a physical organ described in the body map's transducer data. The visual field is computed as the geometric union of all eyes' individual fields. The cone angle stops being a creature property and becomes an emergent result of eye placement and optics.

---

## Eye Data on the Body Map

The visual transducer on a zone changes from a single quality number:

```js
// OLD
transducers: { visual: 4 }
```

To a structured object describing the eye's physical properties:

```js
// NEW
transducers: {
  visual: {
    acuity: 4,              // optical quality (same role as old quality number)
    placement: 'lateral',    // eye orientation relative to zone facing
    fieldAngle: 170,         // single eye's field of view in degrees
  }
}
```

### Acuity

The optical quality of the eye — receptor density, lens quality, neural wiring precision. This is the existing quality number. It determines:
- **Detection SNR** for entities in the visual field (same role as current visual quality in the entity detection formula)
- **Terrain awareness range** for ambient sensing (acuity × AMBIENT_VISUAL_COEFF × lightModifier)
- **Information extraction quality** — higher acuity resolves more detail at a given distance

Destroying a zone with visual transducers removes this acuity from the creature's sensing. If it was the only eye pair, visual sensing goes to zero.

### Placement

Where the eyes point relative to the zone's forward direction. Determines how the two eyes of a pair are oriented, which controls the binocular overlap geometry.

**`'lateral'`** — Eyes on the sides, pointing outward. Prey configuration. Each eye is offset ~80° from the zone's forward direction (left eye points ~80° left, right eye points ~80° right). Produces vast total coverage with thin binocular strips front and back.

**`'forward'`** — Eyes in front, pointing the same direction. Predator configuration. Each eye is offset ~20° from the zone's forward direction. Produces heavy binocular overlap in front with narrow monocular wings and a large rear blind spot.

These are the two placements needed now. Future placements could include `'dorsal'` (eyes on top, covering above — flying predator), `'ventral'` (eyes underneath — bottom-feeding aquatic), or numeric angles for truly alien configurations. The system should treat placement as determining the center direction of each eye relative to the zone's facing, so adding new placements is just adding new offset values.

### Field Angle

How wide each individual eye's field of view is, in degrees. This is the optical spread of a single eye, not the total creature field (which is computed from the union of all eyes).

Typical values on Earth:
- Rabbit eye: ~170° per eye (almost hemispherical)
- Cat eye: ~120° per eye
- Human eye: ~120° per eye
- Owl eye: ~110° per eye (tubular eyes, reduced field but extreme acuity)

Smaller field angles indicate more focused optics (tube-shaped eyes like owls or deep-sea fish). Larger field angles indicate wide-angle optics (bulging lateral eyes like prey animals).

---

## Computing the Visual Field

### Per-Eye Field Projection

For a zone with a visual transducer, the zone faces in the creature's current facing direction (for head zones; limb zones could have independent facing in the future). Each eye's center direction is computed from the placement:

```
For 'lateral':
  leftEyeCenter  = creatureFacing + 80°    (pointing left)
  rightEyeCenter = creatureFacing - 80°     (pointing right)

For 'forward':
  leftEyeCenter  = creatureFacing + 20°     (pointing slightly left of forward)
  rightEyeCenter = creatureFacing - 20°     (pointing slightly right of forward)
```

Each eye covers a circular arc from `eyeCenter - fieldAngle/2` to `eyeCenter + fieldAngle/2`.

### Composite Field

The creature's total visual field is the union of all individual eye fields across all non-destroyed zones with visual transducers. Each tile in the world within visual range is classified:

- **Binocular** — covered by 2 or more eyes from the same or different zones. Both images provide parallax data.
- **Monocular** — covered by exactly 1 eye. Single-image detection, no parallax.
- **Blind** — not covered by any eye. No visual detection possible regardless of range.

### Example: Hare (lateral, 170° field)

```
Left eye:   center = facing + 80°,  covers facing-5° to facing+165°
Right eye:  center = facing - 80°,  covers facing-165° to facing+5°

Binocular overlap (front): ~10° zone centered on facing direction
Binocular overlap (rear):  ~10° zone centered on facing-180°
                           (exact size depends on field angle)
Monocular (left):  ~155° on the left side
Monocular (right): ~155° on the right side
Blind spot:        tiny or none — the wide field angles nearly close the circle
```

Total coverage: ~350°. Nearly omnidirectional, but with extremely narrow binocular strips front and back. The hare sees motion everywhere but has depth perception almost nowhere. It detects predators in every direction but has poor distance estimation.

### Example: Prowler / Wolf (forward, 120° field)

```
Left eye:   center = facing + 20°,  covers facing-40° to facing+80°
Right eye:  center = facing - 20°,  covers facing-80° to facing+40°

Binocular overlap: ~80° zone centered on facing direction
Monocular (left):  ~40° on the left wing
Monocular (right): ~40° on the right wing
Blind spot:        ~160° behind the creature
```

Total coverage: ~200°. Strong forward binocular zone for hunting (depth perception, camouflage breaking). Narrow monocular wings for peripheral motion detection. Large rear blind spot — the prowler is vulnerable from behind.

### Example: Lurker (forward, 100° field)

```
Left eye:   center = facing + 20°,  covers facing-30° to facing+70°
Right eye:  center = facing - 20°,  covers facing-70° to facing+30°

Binocular overlap: ~60° centered on facing direction
Monocular wings:   ~20° on each side
Blind spot:        ~200° — massive rear blind zone
```

Total coverage: ~160°. Extremely focused forward vision. The lurker is an ambush predator — it needs precise strike targeting in a narrow cone. It relies on vibration (quality 7 sensor limbs) for awareness outside its visual field.

---

## What Binocular Overlap Physically Provides

Binocular overlap does NOT extend range or reveal more tiles. Both monocular and binocular zones cover terrain out to the same optical range. The difference is in the quality of information extracted from visual detections within each zone.

### Depth Perception → Size Estimation Accuracy

Parallax from two eyes seeing the same object from slightly different positions allows distance computation. Known distance + apparent angular size = accurate real size. This directly reduces the size estimation uncertainty in the existing SNR-based detection system (Sensory-Design.md):

```
Visual detection in binocular zone:
  uncertaintyFactor = SIZE_UNCERTAINTY_BASE / (SNR × BINOCULAR_PRECISION_MULT)

Visual detection in monocular zone:
  uncertaintyFactor = SIZE_UNCERTAINTY_BASE / SNR    (no multiplier — standard)
```

`BINOCULAR_PRECISION_MULT` might be 1.5-2.0, meaning size estimates are 50-100% more accurate in the binocular field. The prowler looking straight at prey gets a tight size estimate ("that's a 5 kg animal at 8 tiles"). The hare seeing the same creature in its monocular lateral field gets a much wider uncertainty range ("something between 2 and 15 kg, somewhere over there").

### Camouflage Breaking → Stealth Detection Bonus

Stereoscopic depth computation separates objects from background by depth plane. An animal that perfectly matches the terrain color still stands out binocularly because it's at a different distance than the ground behind it. This is the primary evolutionary reason for predator forward-eye configuration.

In the detection system, visual detections in the binocular zone get a stealth detection bonus — effectively lowering the stealth threshold for detecting hidden creatures. The exact mechanism: the visual SNR for stealth checks is multiplied by a binocular factor in the overlap zone, making it easier to detect stealthed targets.

Monocular zones get no stealth bonus. A stealthed creature in the hare's vast lateral field has the full benefit of its camouflage. The same creature in the prowler's binocular cone is at a significant disadvantage.

### Motion Resolution

Binocular vision also provides better motion tracking — you can see the direction of movement in three dimensions (approaching vs. crossing). In monocular vision, an approaching object and a stationary object can look identical until the approaching one changes apparent size. This could affect how quickly the creature resolves "moving vs. still" and "approaching vs. lateral" from visual detections. Implementation deferred to the movement detection system.

---

## Rendering — Three Visual Tiers

The current rendering has two visual brightness levels (bright FOV + dimmed explored). The per-eye system produces three:

### Binocular Zone — Full Brightness

Tiles within range, within the binocular overlap arc, with clear line-of-sight. Rendered at full brightness (current FOV treatment). Entities fully visible, sprites rendered at full detail. This is the creature's focused identification zone.

For the prowler: a tight ~80° forward cone.
For the hare: thin ~10° strips directly ahead and behind.

### Monocular Zone — Slightly Dimmed

Tiles within range, within a monocular arc, with clear line-of-sight. Rendered with a light overlay (maybe 15-20% darkened — noticeably lighter than the 42% explored overlay). Entities visible but with reduced rendering confidence — rendered at slightly reduced opacity or with a slight desaturation, communicating "I can see something here but not as clearly."

For the prowler: narrow wings alongside the binocular cone.
For the hare: vast lateral fields on both sides.

### Ambient-Sensed — Moderately Dimmed

Tiles outside all visual fields but within chemical airborne or vibration ground ambient radii. Current 42% overlay. Terrain visible. No entities rendered (not a visual detection).

### Unexplored — Black

No sensing has reached this tile. The creature has no information.

### Why Three Visual Tiers Matter

The player can read their creature's anatomy from the screen. A prowler player sees a tight bright cone surrounded by narrow monocular wings, surrounded by a large dim ambient zone (chemical), with a black blind spot behind. The screen shape tells you "I'm a forward-focused predator with a great nose." A hare player sees thin bright strips front and back, huge monocular coverage on both sides, a large ambient zone (vibration), and almost no blind spots. "I'm a panoramic prey animal that detects motion everywhere."

When the prowler turns, the binocular cone swings. When the hare turns, the thin binocular strips swing, but the monocular coverage barely changes because it's so vast. The creature's visual strategy is communicated continuously through the rendering, without any HUD or stat display needed.

---

## Damage and Degradation

### Eye Destruction

When a zone with visual transducers is destroyed, the eyes on that zone are lost. The composite visual field recomputes from remaining eyes only. If the head is the only zone with eyes, head destruction eliminates ALL visual sensing — both binocular and monocular zones vanish. The creature falls back to chemical and vibration ambient sensing only. The screen goes from three visual tiers to just the dimmed ambient tiles, which is visually striking and communicates the injury clearly.

### Partial Eye Loss

If a creature has eyes on multiple zones (e.g., head + forelimb sensors), destroying one zone removes that zone's eyes from the composite field. The binocular map changes — previously binocular tiles that were covered by the destroyed eye and one remaining eye become monocular. New blind spots appear where only the destroyed eye had coverage.

### One-Eye Creatures

If a creature has only one eye (a single visual transducer on one zone, not a pair), its entire visual field is monocular. No binocular zone exists. No depth perception, no camouflage breaking. This could be an alien body plan (cyclops-type creature) or the result of partial zone damage (if we model individual eye loss within a zone in the future).

---

## Body Map Data Updates

### Hare

```js
// OLD
transducers: { visual: 4, vibration: { ground: 0, air: 1, water: 0 }, chemical: { contact: 0, airborne: 0, dissolved: 0 } }

// NEW
transducers: {
  visual: { acuity: 4, placement: 'lateral', fieldAngle: 170 },
  vibration: { ground: 0, air: 1, water: 0 },
  chemical: { contact: 0, airborne: 0, dissolved: 0 }
}
```

Only the head zone has visual transducers. Other zones unchanged.

### Wolf / Prowler

```js
// OLD
transducers: { chemical: { contact: 2, airborne: 6, dissolved: 0 }, visual: 3, vibration: { ground: 0, air: 2, water: 0 } }

// NEW
transducers: {
  chemical: { contact: 2, airborne: 6, dissolved: 0 },
  visual: { acuity: 3, placement: 'forward', fieldAngle: 120 },
  vibration: { ground: 0, air: 2, water: 0 }
}
```

### Lurker

```js
// OLD
transducers: { chemical: { contact: 3, airborne: 4, dissolved: 0 }, visual: 2, vibration: { ground: 7, air: 2, water: 0 } }

// NEW
transducers: {
  chemical: { contact: 3, airborne: 4, dissolved: 0 },
  visual: { acuity: 2, placement: 'forward', fieldAngle: 100 },
  vibration: { ground: 7, air: 2, water: 0 }
}
```

### Shaleback (cave_crab)

```js
// NEW
transducers: {
  chemical: { contact: 4, airborne: 5, dissolved: 0 },
  visual: { acuity: 5, placement: 'lateral', fieldAngle: 150 },
  vibration: { ground: 0, air: 2, water: 0 }
}
```

Large herbivore with lateral eyes — wide field coverage but slightly less than the hare (150° per eye vs. 170°). The shaleback has good binocular overlap front and moderate rear coverage.

### Backward Compatibility

All code that currently reads `zone.transducers.visual` as a number (e.g., `zone.transducers.visual || 0`) must be updated to read `zone.transducers.visual.acuity` (or handle both formats during transition). A helper function:

```js
function getVisualAcuity(zone) {
  const v = zone.transducers?.visual;
  if (v == null) return 0;
  if (typeof v === 'number') return v;    // legacy format
  return v.acuity || 0;                    // new structured format
}
```

This helper should be used everywhere visual quality is read: entity detection, player stat derivation, ambient sensing, FOV range computation.

---

## Relationship to Existing Systems

### Ambient Terrain Sensing (Ambient-Terrain-Sensing-Design.md)

The visual peripheral ambient radius stays the same — `maxVisualAcuity × AMBIENT_VISUAL_COEFF × lightModifier` — but now the entire visual field (binocular + monocular) contributes to terrain exploration, not just a single cone. Tiles in the visual field at any tier (binocular or monocular) are marked as explored. The ambient terrain system just needs to use the composite visual field instead of a single cone.

### Entity Detection (Sensory-Design.md)

Visual entity detection continues using the existing per-zone range and SNR formulas. Acuity replaces the old visual quality number in those formulas (same value, same role). The new information: whether a visual detection falls in the binocular or monocular zone of the detecting eye pair. This feeds into the SNR multiplier for size estimation and the stealth detection bonus.

### FOV System (fov.js)

`computeConeFOV()` and `computeFOV()` stay as foundational tools. The new system calls them per-eye rather than once per creature. Each eye gets its own `computeFOV()` with a cone restriction to its angular coverage. The composite field is the union of all per-eye results, tagged by coverage count (binocular = 2+, monocular = 1).

### VISION_PROFILES (monsters.js)

Fully replaced. The `VISION_PROFILES` constant becomes unnecessary — all visual field information is derived from the body map's per-zone visual transducer data. `VISION_PROFILES` can be removed or kept temporarily as documentation only, with a deprecation comment pointing to the body map as the source of truth.

NPC vision computations that currently read from `VISION_PROFILES` (for cone angle, vision type) need to be updated to read from the creature's body map visual transducers instead.

---

## What This Document Does NOT Cover

- **Per-eye damage within a zone** — losing one eye of a pair while the zone survives. Could be a future refinement (injury severity affecting individual organs within a zone). For now, zone destruction removes both eyes.
- **Independent limb-zone eye facing** — eyes on limbs that face a direction different from the creature's heading. Requires a per-zone facing system. Deferred.
- **Exotic placements beyond lateral/forward** — dorsal, ventral, stalked eyes, eye turrets. The placement system is designed to accommodate these via new placement keywords or numeric angle offsets. Not needed for current fauna.
- **Active eye movement (saccades)** — the idea that the creature could shift its binocular focus within its field. Deferred to cognitive control systems.
- **Accommodation and focus distance** — the idea that acuity varies with distance within the field (better at certain focal distances). Deferred.

---

## Implementation Status

**Designed (this document):** Per-eye visual field system — transducer data format, composite field computation, binocular/monocular classification, three-tier rendering, SNR multiplier, what it replaces.

**Ready to implement:**
1. Body map data format change (visual transducer becomes structured object)
2. Backward-compatible `getVisualAcuity()` helper
3. Per-eye field computation replacing single creature-level cone
4. Three-tier rendering (binocular → monocular → ambient → black)
5. Removal of `VISION_PROFILES` dependency from player FOV
6. NPC vision updated to read from body map

**Deferred:**
- Binocular SNR multiplier for entity detection (requires coordination with Sensory-Design.md's detection refactor)
- Stealth detection bonus in binocular zone
- Per-eye damage within a zone
- Exotic eye placements
- Independent limb-zone facing
