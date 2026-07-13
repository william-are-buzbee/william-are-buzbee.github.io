# Session Handoff — Precipitation Fix & Regional Drainage (Session 19)

## What This Session Did

Session 19 diagnosed and fixed the planet's globally arid atmosphere, added organized drainage structure to the regional elevation grid, fixed standing water thresholds for the now-wet planet, and restored canopy computation on lowland. The planet went from ecologically dead (Precip 0.00, Canopy 0% everywhere) to alive (widespread rain, 40-80% canopy, organized coastal drainage, visible flora differentiation).

### Changes Applied (in order)

**1. Conservative moisture advection (critical bug fix)**

The moisture advection scheme in `step4_computeAtmosphere` was non-conservative: it added incoming moisture from upwind neighbors via a snapshot but never subtracted outgoing moisture from the source cell. The outgoing "cap" only fired when `totalOut > 0.9`, which never happened for typical wind speeds (~0.11). Result: moisture grew exponentially over 70 iterations, reaching ~200-400× normal over ocean. The 95th-percentile normalization then crushed all moderate precipitation to 0.00 — only extreme orographic mountain cells showed any rain.

Fix: explicit outgoing subtraction using the snapshot value: `moisture[ci] -= snap[ci] * min(totalOut, 0.9)`. Ocean moisture now reaches a stable equilibrium of ~3-5 instead of hundreds. Additionally, the advection transfer coefficient was doubled (0.06 → 0.12) for deeper inland moisture penetration, and `moistureDiffusion` was increased (0.03 → 0.06).

**2. Anisotropic drainage noise in regional elevation grid**

The regional elevation grid for flat lowland had only isotropic multi-octave noise, producing random bumps and dips in all directions. Flow accumulation on isotropic noise creates scattered, disconnected drainage patterns — not the coherent dendritic networks that water erosion produces on real terrain.

Fix: `generateRegionalDetailHiRes` Pass 1 was restructured into three sub-passes:
- Pass 1a: Compute base elevation from hi-res grid (no noise)
- Pass 1b: Compute drainage direction field — BFS from coast cells for flat terrain direction, wide-window slope gradient for steep terrain, blended by slope magnitude
- Pass 1c: Add isotropic noise AND anisotropic noise (stretched along drainage direction, compressed perpendicular) to get final elevation

The anisotropic noise creates organized ridge-channel topography with channel spacing of ~14 cells (~2 km). Flow accumulation on this surface produces coherent tree-shaped drainage networks, especially near coastlines where the slope signal is strong.

**3. Standing water threshold tightening**

With precipitation now reaching all land, the Session 18 standing water thresholds were too loose — they filled shallow random depressions with water, which suppressed canopy computation (the flora function sets canopy = 0 for any cell with `hasWater = true`). Thresholds were tightened: basin area 12 → 20, depth 0.02 → 0.04, connected component 8 → 15, pour tolerance 0.008 → 0.005, channel saturation threshold 0.6 → 0.85.

**4. Canopy restoration (resolved by #3)**

No code change needed. Canopy was 0% on lowland despite adequate conditions (sat 0.59, precip 1.00, gw 0.91) because standing water incorrectly flagged ridge cells as water features, triggering the early return in `refineRegionalFloraFromHiRes`. Once standing water thresholds were tightened, the canopy formula runs and produces the expected 40-80% canopy values.

### Prompts Written But Possibly Not Yet Applied

Two additional tuning prompts were written during this session:

**Prompt: Interior drainage tuning** — Reduces isotropic noise amplitude for lowland zones (×0.4) so anisotropic channel structure dominates, and increases anisotropic channel amplitude for lowland (0.014 → 0.018). Currently the interior flat-land drainage is still noisy because isotropic noise overwhelms the channel structure far from coastlines.

**Prompt: Precipitation gradient widening** — Increases `bgPrecipRate` from 0.03 to 0.045 and `moistureDiffusion` from 0.06 to 0.08. Currently precipitation values are compressed (0.10–0.41 range). The fix widens the gap between windward (0.6–1.0) and leeward (0.05–0.20) areas, making rain shadows visible on the surface.

**Check whether these were applied before proceeding.** If not, they should be applied before further tuning. The prompt files are `prompt-drainage-tuning-precip-gradients.md`.

### Current State of the Planet Viewer

- **Seed 5 at Very High** is the reference planet
- **Precipitation reaches all land.** Precip values range 0.10–0.41 (may widen to 0.05–1.0 if the gradient tuning prompt is applied). Rain shadows exist but are subtle.
- **Canopy establishes on lowland.** Mid-slope ridges show 42% canopy (sparse_forest). Lowland shows 80% canopy (forest). These match the design targets.
- **Coastal drainage is organized.** Near coastlines, drainage shows clear dendritic branching — tributaries converging into main channels flowing toward the coast. Small islands show radial drainage from their centers.
- **Interior flat-land drainage still noisy.** Far from coastlines, drainage lines remain dense and disorganized. The isotropic noise amplitude tuning prompt addresses this.
- **Coastline complexity is excellent.** Bays, peninsulas, island fragments, narrow channels — the coastAmplitude and peakAngularNoise parameters produce genuinely complex and realistic coastal shapes.
- **Flora distributions plausible.** Photosynthetic on wet lowland, chemotrophic near volcanic/mineral-rich zones, mixotrophic at intermediate areas.
- **Volcanic island anatomy partially confirmed.** Central ridges, elevation-dependent canopy gradients, radial drainage visible on some islands. Rain shadow effect present but subtle.
- **Standing water tightened but may need further adjustment** once the drainage tuning is applied — organized channels may change which cells qualify as standing water.
- **`palette-compute.js` still out of sync** with the viewer's `computeTilePalette`. Unchanged from Session 18.
- **Scale mismatch still present** (viewer only, not blocking). Regional cells are ~150m, design says 1km.
- **Planet viewer UI still awkward for screenshotting.** Deferred.

### Known Issues / Not Yet Addressed

- **Precipitation gradients compressed** — windward/leeward contrast is subtle. bgPrecipRate tuning prompt written but may not be applied yet.
- **Interior drainage noise** — anisotropic channel amplitude vs isotropic noise ratio needs tuning on flat interior terrain. Prompt written but may not be applied yet.
- **Mineral distributions not audited.** Fe/Cu/Mn placement relative to geology hasn't been scrutinized.
- **Chemotrophic organisms need visual audit.** Do colony mounds appear in the right places? Are mineral crusts on volcanic features?
- **No rock outcrops, springs, tidal pools, or beach/dune features** yet at tile level (Feature Vocabulary items from the Todo).
- **Tile-level drainage has too much standing water** in some areas — 10-15 cm across flatland. This is partly the standing water thresholds and partly the fact that tile generation inherits regional saturation which is now higher everywhere.

---

## Next Session: Geography Tuning & Feature Vocabulary

### The Goal

The core physical systems are now working: plates → elevation → atmosphere → precipitation → groundwater → drainage → saturation → flora → terrain → palette. The next session refines the OUTPUT quality — making the planet look like a specific, believable place rather than a generic procedural result.

### What the Next Session Should Cover

**Priority 1: Verify and apply tuning prompts**

Check whether the two tuning prompts from Session 19 were applied:
1. Interior drainage tuning (isotropic noise reduction for lowland, anisotropic amplitude increase)
2. Precipitation gradient widening (bgPrecipRate 0.03 → 0.045)

If not applied, apply them first. Then verify:
- Precipitation overlay shows visible windward/leeward contrast
- Interior drainage shows organized channels, not spaghetti
- Rain shadow areas look visibly drier on the Surface overlay

**Priority 2: Volcanic island deep audit**

Navigate to an elongated mid-ocean arc island. Check:
- Central ridge with high elevation, steep slope
- Radial drainage from ridge to coast
- Windward side wetter (more canopy) than leeward side (rain shadow)
- Mineral-rich zones near the peak (chemotrophic flora)
- Complex coastline with bays and headlands
- Tile view shows a believable landscape cross-section

This is the best integration test — it touches every system at once.

**Priority 3: Planetary-scale shape assessment**

Step back and assess the whole planet:
- Is this convincingly an archipelago world? (Yes from Session 19 observations, but confirm)
- Are there any obviously wrong zones (desert where swamp should be, forest on a mountaintop)?
- Does the flora type distribution match the Ecology Foundations doc?
- Are the plate boundaries visible as geological features (mountain ranges, volcanic arcs)?

**Priority 4: Feature vocabulary for tile level**

Identify what's missing at tile scale to make tiles read as specific places:
- Rock outcrops on ridges and cliffs
- Springs where groundwater meets surface (WTD crossing zero on a slope)
- Tidal pools in coastal zones
- Colony mounds (chemotrophic structures from Ecology Foundations)
- Beach/dune formations at coastlines
- Volcanic features near plate boundaries

These would be additions to the tile generation system, not the regional system. They're identified here, designed in this session, and prompted for implementation later.

**Priority 5: bgPrecipRate fine-tuning**

If the precipitation gradients are still too compressed after the first tuning pass, iterate. The target is dramatic enough that windward and leeward sides of an island look visually different on the Surface overlay — the windward side should be deep crimson (dense forest), the leeward should be lighter (sparser vegetation or different flora mix).

### Documents to Include

- **Always**: Design-Principles.md, Ecology-Foundations.md
- **For generation tuning**: three-layer-color-system.md, drainage-chunk-generator-design.md
- **For reference**: tile-body-map-spec.md, this handoff document, Todo.md
- **The planet viewer HTML file** (current version with Session 19 fixes applied)

### Role Reminder

The next Claude serves as design collaborator and prompt writer. It discusses game design, proposes systems, pushes back on abstractions, and writes implementation prompts for a separate coding session. It does NOT write code itself. It brings evolutionary biology, geology, and ecology knowledge to design questions. When the human asks "what would this actually look like?", give thorough scientifically grounded answers.

The core design philosophy: **everything is physical, everything is observable, everything is downstream of the body map.** A planet's geography follows from its physical processes — plate tectonics produces mountains, mountains produce rain shadows, rain shadows produce flora distributions, flora distributions produce the visual character of the landscape.

### Key Parameter Reference (Current Defaults, Post-Session 19)

```
// Plates
plateCountBase: 14,  plateCountRange: 6,  continentalRatio: 0.30
minPlateSpacing: 0.28

// Elevation
continentalBase: -0.08,  continentalNoise: 0.18,  oceanicBase: -0.30
collisionHeight: 0.65,  arcHeight: 0.55

// Peak shape
peakAspectRatio: 2.5,  peakAngularNoise: 0.25,  peakAngularFreq: 5

// Arc chains
arcChainMinPeaks: 4,  arcChainMaxPeaks: 8,  arcChainSpacing: 4
arcChainJitter: 1.5,  arcSubPeakRadiusMin: 3,  arcSubPeakRadiusMax: 6

// Precipitation (CHANGED Session 19)
moistureIterations: 70,  bgPrecipRate: 0.03 (→ 0.045 if tuning prompt applied)
thermalEvapFactor: 0.18,  windEvapFactor: 0.10
oroFactor: 0.4,  convFactor: 0.3
moistureDiffusion: 0.06 (was 0.03; → 0.08 if tuning prompt applied)
// Advection transfer coefficient: 0.12 (was 0.06)
// Advection is now CONSERVATIVE (outgoing subtracted from source)

// Atmosphere
atmosphericPressure: 1.2,  sstFloor: 0.50

// Regional anisotropic drainage (NEW Session 19)
// Along-slope frequency: 0.004, Across-slope frequency: 0.07
// Channel amplitude by zone:
//   lowland: 0.014 (→ 0.018 if tuning prompt applied)
//   coastal: 0.010, tidal: 0.006, mid_slope: 0.006
//   upper_slope: 0.003, summit: 0.001
// Coast direction BFS blended with slope direction
// Flat threshold: 0.0015, Steep threshold: 0.005

// Regional WTD modulation (Session 18)
// Zone-dependent ridge drain values:
//   summit: 0.55, upper_slope: 0.40, mid_slope: 0.28
//   lowland: 0.18, coastal: 0.06, tidal: 0.00

// Regional standing water (CHANGED Session 19)
REG_MIN_BASIN_AREA: 20,  REG_MIN_BASIN_DEPTH: 0.04
REG_MIN_WATER_FEAT: 15,  REG_POUR_TOLERANCE: 0.005
REG_SHORE_DIST: 2
// Channel water: SO ≥ 3, sat > 0.85 (was 0.6)
// Shoreline boost: 0.12 - dist * 0.05
```
