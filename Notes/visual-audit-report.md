# Visual Pipeline Diagnostic Audit

## Note on Scope

All 8 pipeline modules have been audited. `planet-gen.js` was provided in a follow-up upload; the findings below include the full planetary-scale analysis.

---

## 1. Pipeline Map — From Position to Pixel

This section traces how a single regional cell goes from "a coordinate on the planet" to "a color on screen" in the **high-res path** (the primary path when `state.hiResData` exists).

### Phase A: Establish Elevation and Atmospheric Context

**`generateRegionalDetailHiRes()`** (`regional-gen.js` ~479–895)

1. **World coordinate mapping.** The regional view is a 512×512 grid centered on a planetary cell. Each regional cell gets world-space coordinates `(worldX, worldY)` in regional-cell units (~0.15 km/cell). These map to hi-res grid coordinates via `hx = (worldX / 512) * hiResMultiplier`, `hy = (worldY / 512) * hiResMultiplier`.

2. **Base elevation** is bilinear-sampled from the hi-res typed array `state.hiResData.elevation` at `(hx, hy)`. A 64-cell padded grid is built for drainage stability.

3. **Drainage direction** is computed from the global hi-res elevation field using an 8-direction wide-window gradient (radius 3.0 hi-res cells ≈ 117 km at 4×). Steep terrain uses local 7×7 slope; flat terrain uses the wide gradient. A convergence perturbation rotates drainage vectors by low-frequency noise (`freq = 0.007`, `maxAngle = 0.35`) scaled by flatness, creating dendritic branching.

4. **Detail noise** is added: isotropic fractal noise (5 octaves, world-coordinate seeded) plus anisotropic channel noise aligned with the drainage direction. The anisotropic noise uses different frequencies along-drain (`0.004`) vs across-drain (`0.07`), producing linear ridge-channel topography. Zone-dependent amplitudes suppress isotropic noise on flat terrain (lowland: ×0.4) so channels dominate. The resulting elevation is `baseElev + detail * detailAmp + channelOffset`.

5. **Physical field sampling** from the hi-res grid via `bilinearSampleHR`: grainSize, saturation, groundCover, canopyDensity, chemoCrust, organicContent, waterTableDepth, precipitation, groundwater, volcanism, iron, copper, manganese. These are continuous fields — bilinear interpolation is correct.

6. **Flora type** is sampled via `nearestSampleHR` (discrete categorical field: 0=barren, 1=photo, 2=chemo, 3=mixo). At 4× hi-res multiplier, each hi-res cell covers ~128 regional cells, producing blocky boundaries. A boundary-jittering pass (lines 1016–1033) uses noise to perturb ~50% of boundary cells.

### Phase B: Slope, Zone, Drainage Accumulation

7. **Slope magnitude** is computed from the refined elevation grid (local gradient). **Zone** is classified: summit (>0.65 normalized), upper_slope (>0.35), mid_slope (>0.06), lowland (>0), tidal/coastal (≤0).

8. **Regional drainage** (`computeRegionalDrainage`, lines 1137–1192): D8 flow accumulation on the 512×512 grid. Stream order assigned from log-normalized flow: SO 3 at >0.75, SO 2 at >0.50, SO 1 at >0.28, SO 0 below.

9. **Hi-res stream order inheritance** (Pass 3b, lines 849–874): The hi-res grid's globally-computed stream order is nearest-neighbor-sampled and used as a floor — regional computation can only increase it. Minimum `drainageDensity` values are enforced per stream order (SO 1→0.30, SO 2→0.55, SO 3→0.80).

### Phase C: Substrate and Water Refinement

10. **`refineRegionalSubstrateFromHiRes()`** (lines 902–978):
    - Starts from the hi-res base values for grainSize, saturation, and WTD.
    - Adds noise to precipitation (±0.06) and groundwater (±0.04) at freq 0.015 to break bilinear contours.
    - Applies **drainage-responsive WTD modulation**: ridge cells (SO 0) get WTD pushed positive (lowland: +0.18), channel cells (SO ≥3) get WTD pushed negative (lowland: −0.02). Intermediate SO values get intermediate adjustments.
    - **Recomputes saturation** from the drainage-modulated WTD using the same capillary fringe model as `stepHR4`: `effDepth = WTD - (1 − grain) × 0.15`, sat = `min(1, max(0.7, 1 − effDepth × 0.5))` if effDepth ≤ 0, else `min(0.7, exp(−effDepth × 8))`.
    - Channels get grain fined (SO ≥2: capped at 0.2; SO ≥1: reduced by 20%).

11. **Standing water** (`computeStandingWater`, lines 1242–1441): Fills basins (local minima) and SO ≥3 channels where saturation > 0.85. Gate conditions: basin area ≥20, depth ≥0.04, center saturation ≥0.4, center WTD ≤0.10. Connected components smaller than 15 cells (without ocean connection) are removed.

### Phase D: Flora and Terrain Derivation

12. **`refineRegionalFloraFromHiRes()`** (lines 986–1134):
    - **Flora type** is inherited from the hi-res grid (nearest-neighbor), with boundary jittering already applied in Phase A.
    - **Ground cover** and **canopy** are **recomputed** using formulas that differ from the hi-res pipeline (see Findings §1).
    - **Chemo crust** is computed from the cell's unwarped mineralTotal (the hi-res pipeline uses domain-warped mineral coordinates — see Findings §4).
    - **Organic content** mirrors stepHR6.

13. **`deriveRegionalTerrainType()`** (lines 1502–1538): Thin wrapper over `deriveTerrainAndCover()`. Water/ice handled locally; everything else routes through the canonical function with the cell's refined physical values.

### Phase E: Rendering

14. **`renderRegionalMap()`** (`regional-render.js` lines 108–128): Iterates all 512×512 cells. For the 'surface' overlay, calls `computeTilePalette(regionalPhysical(cell))`.

15. **`regionalPhysical()`** (`palette-compute.js` lines 397–414): Adapter that reads from the cell object: `terrainType`, `coverType`, `minerals.{iron,copper,manganese}`, `grainSize`, `saturation`, `organicContent`, `groundCover`, `canopy` (mapped to `canopyDensity`), `chemoCrust`, `waterDepth`, `floraType`.

16. **`computeTilePalette()`** (`palette-compute.js` lines 104–374): Three-layer color pipeline:
    - **Background (Layer 1):** Terrain-type-specific base color. For GRASS: blend of `livingCoverColor` (flora-type dependent: crimson for photo, mineral-tinted for chemo) and substrate. Wet film modifier darkens + blue-shifts for shallow standing water below the 5cm threshold.
    - **Foreground (Layer 1):** Highlights and detail color, terrain-type-specific.
    - **Cover modification:** Forest/mushforest canopy at density > 0.45 blocks up to 65% of light (dense forest) or 55% (mushforest). Sparse variants at density > 0.15 block 40%/30%. Below 0.15 canopy density → no cover modification.
    - **Mid-tone:** 65/35 blend of bg/fg.
    - **Screen transform (Layers 2+3):** Fixed multipliers (R×0.790, G×0.806, B×0.728).

17. **Globe rendering** (`planet-render.js`): The flat map renders from `state.planet` typed arrays (populated by `planet-gen.js`, likely equivalent to `state.hiResData`). For the 'surface' overlay, it reads pre-computed `colorR/G/B` from `stepHR8_colorRow`, which called `computeTilePalette` with the **original hi-res values** — not the regional-recomputed values. The globe and Mollweide projections sample the flat map pixel data.

---

## 2. Findings

### SCALE DISAGREEMENT

#### Finding SD-1: Ground Cover and Canopy WaterFactor Multiplier Mismatch

**Where:** `hires-gen.js` `stepHR6_floraRow` lines 332–334, 340 vs `regional-gen.js` `refineRegionalFloraFromHiRes` lines 1093, 1103.

**What:** The waterFactor formula that drives ground cover and canopy density uses different multipliers at hi-res vs regional scale:

| Formula | Hi-Res (stepHR6) | Regional (refineRegionalFloraFromHiRes) |
|---------|-------------------|----------------------------------------|
| groundCover waterFactor | `precip × 3.0 + gw × 2.0` | `precip × 1.5 + gw × 1.0` |
| canopy waterFactor | `precip × 3.0 + gw × 1.5` | `precip × 1.5 + gw × 0.8` |

The regional code has a "FIX 2" comment noting these were intentionally reduced from the hi-res values "to preserve gradient across the planet's actual precipitation range." However, this creates a fundamental disagreement: a ridge cell whose saturation and grain were inherited from hi-res will still produce different groundCover and canopy values because the waterFactor formula itself changed.

**Impact:** The globe (rendered from hi-res values) and the regional view compute different ground cover and canopy for the same physical location. A cell at precip=0.2, gw=0.1 gets hi-res waterFactor=0.75 but regional waterFactor=0.38. Combined with the saturation difference from SD-2, this compounds into a substantial color mismatch between views.

**Category:** SCALE DISAGREEMENT

#### Finding SD-2: Drainage-Induced Saturation Shift for Ridge Cells

**Where:** `regional-gen.js` `refineRegionalSubstrateFromHiRes` lines 937–966.

**What:** The hi-res grid computes WTD from the physical formula (`max(0, elev) × 3.0 − precip × 1.2 − volc × 1.0`). For typical lowland cells (low elevation, moderate precip), this WTD is near 0 or slightly positive. The regional refinement then adds a drainage-dependent adjustment: ridge cells (SO 0) in lowland get `+0.18`, pushing WTD from ~0 to ~0.18.

Saturation is recomputed from this new WTD. With WTD=0, the capillary model gives sat ≈ 1.0. With WTD=0.18 (grain=0.3), effective depth ≈ 0.075, giving sat ≈ 0.55. This is a large shift: **hi-res sat ≈ 1.0 → regional ridge sat ≈ 0.55**.

The satFactor function (see GL-1) amplifies this: sat=1.0 gives satFactor=0.15, sat=0.55 gives satFactor=0.80. The canopy multiplier shifts by 5.3× between the two scales for the same cell.

**Impact:** Ridge cells (the majority of the regional grid at SO 0) have dramatically different saturation, canopy, and resulting color in the regional view vs the globe. The comment in the code claims "a ridge cell whose saturation/grain were left at the high-res base reproduces the high-res flora exactly" — this is false because saturation is NOT left at the hi-res base; it is recomputed from a modified WTD.

**Category:** SCALE DISAGREEMENT

#### Finding SD-3: Chemo Crust Mineral Sampling Mismatch

**Where:** `hires-gen.js` `stepHR6_floraRow` lines 319–325, 355 vs `regional-gen.js` `refineRegionalFloraFromHiRes` lines 1117–1118.

**What:** The hi-res pipeline uses **domain-warped** mineral coordinates for the chemo crust threshold (`mineralTotalW > 0.4`), where the warped coordinates are displaced by noise (warpAmp=1.8 hi-res cells, ~27 km). The regional pipeline uses the cell's **unwarped** `mineralTotal` for the same threshold.

Near the 0.4 boundary, the warped vs unwarped mineral totals differ by the displacement amount, causing some cells to have chemo crust at hi-res but not at regional (or vice versa). Chemo crust reduces groundCover by up to 60% (`groundCover *= (1 − cc × 0.6)`), so a disagreement in crust presence produces a visible difference in ground cover and therefore color.

**Impact:** Scattered cells near mineral boundaries show different ground cover between globe and regional views. Less systematic than SD-1/SD-2 but adds noise to the scale mismatch.

**Category:** SCALE DISAGREEMENT

#### Finding SD-4: Three-Way Flora Type Formula Disagreement (Planetary vs Hi-Res vs Regional-LowRes)

**Where:** `planet-gen.js` `step5_computeFlora` lines 1413–1432 vs `hires-gen.js` `stepHR6_floraRow` lines 366–373 vs `regional-gen.js` `computeRegionalFloraCell` lines 1480–1493.

**What:** Each scale computes flora type fitness using a different formula for the same competitive model:

| Component | Planetary (step5) | Hi-Res (stepHR6) | Regional LowRes |
|-----------|-------------------|-------------------|-----------------|
| **Water metric** | `waterAvailability` (= precip×0.7 + gw×0.3 + drainage) | `min(1, precipW×3.0 + gwW×1.5)` (domain-warped) | `max(saturation, waterAvailability)` |
| **photoFitness** | `water × 0.8` | `regWaterW × 0.8` | `water × 0.85 × (0.5 + 0.5×(1−elev))` |
| **chemoFitness** | `mineralTotal × max(water, **gw×1.5**) × 1.2` | `mineralTotalW × max(regWaterW, **volcW×1.5**) × 1.2` | `mineralTotal × max(water, **gw×1.4**) × 1.2` |
| **mixoFitness** | `(0.6 + 0.5×mineralTotal) × water` | `(0.6 + 0.5×mineralTotalW) × regWaterW` | `(0.6 + 0.5×mineralTotal) × water` |
| **Mineral source** | unwarped `c.mineralTotal` | domain-warped `mineralTotalW` | unwarped `cell.mineralTotal` |
| **Barren threshold** | 0.02 | 0.02 | 0.05 |

Key divergences:

1. **ChemoFitness secondary factor:** The planetary version uses `groundwater × 1.5` as the chemo boost, but the hi-res version uses `volcanism × 1.5`. These are entirely different physical fields. Volcanism and groundwater are weakly correlated at best. This means a cell near a volcanic vent scores high chemo at hi-res (volcanism boosts it) but may score low chemo at planetary scale (if groundwater is low there). Conversely, a wet coastal cell scores high chemo at planetary scale (high groundwater) but low chemo at hi-res (low volcanism).

2. **PhotoFitness elevation scaling:** The regional LowRes formula includes `(0.5 + 0.5 × (1 − elev))`, penalizing photosynthetic fitness at high elevation. Neither the planetary nor hi-res formulas include this term. At elevation 0.4, this reduces photoFitness by 30% at regional LowRes, potentially flipping the winner from photo to chemo.

3. **Water saturation:** The hi-res waterFactor (`precip × 3.0`) saturates at precip > 0.33, effectively making most of the wet planet equally water-rich for flora competition. The planetary `waterAvailability` includes drainage and has a different dynamic range.

**Impact:** Flora type assignments differ systematically between scales. In the hi-res path, the regional view inherits flora type from the hi-res grid (masking this), but the **planetary overlay** (which uses step5's assignments) and the **hi-res overlay** (which uses stepHR6's assignments) can show different flora types for the same cell. The "floraType" diagnostic overlay on the globe vs the snapshot panel reading may disagree — the globe overlay at low-res reads `state.cells[i].floraType` (step5), while the hi-res overlay reads `state.hiResData.floraType[hi]` (stepHR6). **This is a direct contributor to symptom 2.**

**Category:** SCALE DISAGREEMENT

#### Finding SD-5: Planetary Terrain Derivation Uses Rough Estimates That Diverge From Hi-Res Values

**Where:** `planet-gen.js` `step5b_deriveTerrainType` lines 1460–1465.

**What:** The planetary grid lacks the detailed physical fields that the hi-res grid computes (grainSize, saturation, canopy, etc.), so step5b **estimates** them from the planetary simulation's own fields. These estimates differ substantially from what the hi-res pipeline produces for the same location:

| Field | Planetary Estimate | Hi-Res Actual |
|-------|-------------------|---------------|
| grainSize | `0.25 + elevation × 0.6` (purely elevation-based) | Slope + elevation + volcanism + coastal proximity + noise |
| saturation | `waterAvailability` (direct) | Capillary fringe model from WTD, grain |
| groundCover | `max(0.3, floraDensity × 0.8)` if flora present; floor of 0.3 | `waterFactor × (0.5 + (1−grain) × 0.4)`; can be <0.1 |
| canopyDensity | `floraDensity × 0.7` if floraDensity > 0.2 | `waterFactor × satFactor × subFactor`; often 0.12–0.15 |
| chemoCrust | `floraDensity × 0.5` if chemotrophic | Threshold-based: `mineralTotalW > 0.4` |
| waterTableDepth | `(1 − sat) × (0.3 + elev × 2)`, range [0, 1] | `max(0, elev) × 3 − precip × 1.2 − volc × 1.0`, range can go negative |

The most impactful divergence is **groundCover**. The planetary estimate floors groundCover at 0.30 for any cell with floraDensity > 0. In `deriveTerrainAndCover`, groundCover > 0.25 → terrainType = 'grass'. This means virtually all vegetated planetary cells get classified as 'grass'. The hi-res grid, with its waterFactor-scaled groundCover, may produce groundCover < 0.25 on dry or rocky cells, classifying them as 'dirt' or 'rock' instead.

The **canopyDensity** estimate (`floraDensity × 0.7`) can reach 0.56 for floraDensity=0.8, producing coverType='forest' at the planetary level. The hi-res pipeline's satFactor-crushed canopy (0.12–0.15 at high saturation) produces coverType='none' for the same cell. The low-res surface overlay for the globe (used as fallback if hi-res data isn't available) would show forest darkening where the hi-res surface overlay shows no forest.

These estimates are stashed on the cell as `_estGrainSize`, `_estSaturation`, `_estGroundCover`, `_estCanopy`, `_estChemoCrust` and consumed by `overlayFunctions['surface']` in `planet-render.js` lines 64–79 (the low-res fallback overlay).

**Impact:** The planetary terrain type / cover type may not match the hi-res terrain type / cover type. The low-res overlay path (`overlayFunctions['surface']`) uses the `_est*` values, producing different palette inputs than the hi-res pre-computed colors. When the globe renders at low-res (OOM fallback or for overlays like `floraType`), visual disagreement with the regional view is expected. The diagnostic-panel reading of planetary terrainType/coverType may also disagree with the regional-derived values.

**Category:** SCALE DISAGREEMENT

### GRID ARTIFACT

#### Finding GA-1: Flora Type Nearest-Neighbor Produces 128-Pixel Blocks

**Where:** `regional-gen.js` `refineRegionalFloraFromHiRes` line 1009, and boundary mitigation at lines 1016–1033.

**What:** Flora type is a categorical variable (0–3). It is sampled from the hi-res grid using `nearestSampleHR`. At 4× hi-res multiplier, one hi-res cell maps to `512/4 = 128` regional cells in each dimension. Each hi-res flora type value therefore covers a 128×128 block of regional cells.

A boundary-jittering mitigation samples 4 neighbors at ±1 hi-res cell and flips cells where `noise > 0.15` (~42% of boundary cells). This creates some boundary roughness but has limitations:

- Only fires at actual type boundaries — produces a 1-hi-res-cell-wide transition zone (~128 regional cells), not a gradual transition.
- Picks the **first** differing neighbor type (`neighborTypes.find()`), not the most appropriate one. In 3-way junctions (photo/chemo/mixo meeting), the chosen alternative may be wrong.
- The noise frequency (0.12 in world coords, ~8 regional cell wavelength) creates contours that are still relatively coarse.

**Impact:** This is the **primary cause of symptom 1** ("grid-aligned rectangular blocks approximately 128 pixels wide"). The blocks are most visible in wet photosynthetic zones because flora type directly determines the living cover color (crimson vs mineral-tinted), and the block boundaries produce abrupt color changes.

**Category:** GRID ARTIFACT

#### Finding GA-2: Hi-Res Stream Order Nearest-Neighbor Blocks

**Where:** `regional-gen.js` Pass 3b, line 863.

**What:** Hi-res stream order is sampled via `nearestSampleHR`, producing the same 128-cell blocks as flora type. Stream order feeds into `refineRegionalSubstrateFromHiRes` (WTD adjustment, grain fining) and `computeStandingWater` (SO ≥3 triggers water). Because stream order is used as a **floor** (can only increase), the regional drainage computation can mask the blocks where it produces higher values, but where the hi-res stream order exceeds the regional computation, hard block boundaries appear.

The WTD adjustment is zone-dependent and discontinuous (e.g., SO 0 → +0.18, SO 1 → +0.06 for lowland). A boundary where the hi-res grid transitions from SO 0 to SO 1 creates a WTD step of 0.12, which produces a saturation step from ~0.55 to ~0.85 — a visible color change aligned to the hi-res grid.

**Impact:** This is a **secondary cause of symptom 1 and the primary cause of symptom 5** ("hard horizontal/vertical boundaries"). The WTD and saturation steps produce color changes that follow the hi-res grid exactly, appearing as straight lines on the regional map.

**Category:** GRID ARTIFACT

#### Finding GA-3: Bilinear Interpolation of Continuous Fields Produces Smooth but Grid-Aligned Gradients

**Where:** `regional-gen.js` Pass 1c, lines 758–770.

**What:** All continuous hi-res fields (grainSize, saturation, precipitation, etc.) are bilinear-sampled. At 4× multiplier, this produces smooth gradients but they are constrained to vary linearly within each 128×128 cell quad. Combined with threshold functions downstream (e.g., saturation > 0.75 → saturated terrain type), the bilinear contours produce grid-aligned isolines — straight diagonal lines at 45° through hi-res cell corners.

The noise-breaking code in `refineRegionalSubstrateFromHiRes` (lines 919–929) adds ±0.06 precipitation and ±0.04 groundwater noise at freq 0.015 (~65-cell wavelength), which helps break these contours but doesn't affect saturation, grain size, or minerals directly.

**Impact:** Moderate contributor to grid-aligned boundaries, especially where threshold functions amplify the bilinear gradients into step changes.

**Category:** GRID ARTIFACT

### GRADIENT LOSS

#### Finding GL-1: SatFactor Step Function Crushes Canopy at High Saturation

**Where:** `hires-gen.js` `stepHR6_floraRow` lines 341–346 (identical in `regional-gen.js` lines 1104–1109).

**What:** The satFactor function is a step function with large jumps:

| Saturation Range | satFactor |
|-----------------|-----------|
| > 0.95 | 0.15 |
| 0.85–0.95 | 0.35 |
| 0.50–0.85 | 0.80 |
| 0.30–0.50 | 1.00 |
| < 0.30 | 0.45 |

The jump from 0.80 to 0.35 at sat=0.85 is a 2.3× change. The jump from 0.35 to 0.15 at sat=0.95 is another 2.3×. For the hi-res pipeline, most lowland cells have WTD near 0, giving sat ≈ 1.0, so nearly all lowland cells get satFactor=0.15.

Combined with the hi-res waterFactor (`precip × 3.0 + gw × 1.5` which saturates to 1.0 for precip > 0.33), the resulting canopy for most wet lowland cells is: `1.0 × 0.15 × 1.0 = 0.15`, barely above the 0.12 floor. This means canopy is clamped to 0.12–0.15 across the majority of the planet's wet lowland area.

**Impact:** This is the **direct cause of symptom 3** ("uniform canopy at 80% or 15% after fix"). The "15%" value corresponds to the satFactor=0.15 regime. The "80%" may have been a pre-fix state where the satFactor code was absent or different. Canopy below 0.15 means coverType='none' (no forest), eliminating the canopy-darkening visual layer from computeTilePalette entirely.

**Category:** GRADIENT LOSS

#### Finding GL-2: Hi-Res WaterFactor Saturates for Most of the Planet

**Where:** `hires-gen.js` `stepHR6_floraRow` lines 332, 340.

**What:** With `precip × 3.0`, any cell with precipitation > 0.33 has waterFactor ≥ 1.0 (clamped). On a wet planet where precipitation commonly ranges from 0.1 to 1.0, this means ~70–80% of land cells hit the waterFactor ceiling. The result is that precipitation variation is invisible in groundCover and canopy at the hi-res scale.

The regional path's reduced multiplier (`precip × 1.5`) has better gradient preservation, saturating at precip > 0.67. This is the intent of "FIX 2" but creates the scale disagreement documented in SD-1.

**Impact:** Loss of visual variation in the globe view — wet lowland forest appears uniform because both waterFactor and satFactor are clamped to their extreme values. **Contributes to symptom 6** ("insufficient visual variation in lowland forest").

**Category:** GRADIENT LOSS

### THRESHOLD CLIFF

#### Finding TC-1: SatFactor 0.85 Boundary Creates Hard Canopy Line

**Where:** `hires-gen.js` `stepHR6_floraRow` line 343, `regional-gen.js` line 1106.

**What:** At saturation = 0.85, satFactor jumps from 0.80 to 0.35 — a 2.3× change with zero transitional width. Because saturation is a continuous bilinear field, the 0.85 isoline is a smooth curve on the globe but produces a visible line where canopy density halves. At the regional scale, after drainage modification, the saturation field has more structure, but the isoline still creates an abrupt canopy step.

The coverType threshold at canopy=0.45 (forest) and canopy=0.15 (sparse forest) can coincide with the satFactor step: if canopy = waterFactor × satFactor and waterFactor ≈ 0.5, then at satFactor=0.80 canopy=0.40 (sparse forest) vs satFactor=0.35 canopy=0.175 (sparse forest boundary). This compounds into a visible terrain character change.

**Impact:** Hard lines in canopy density across the regional view, aligned to saturation isolines which follow bilinear contours (i.e., grid-aligned). **Contributes to symptoms 1 and 5.**

**Category:** THRESHOLD CLIFF

#### Finding TC-2: CoverType 0.45/0.15 Canopy Thresholds

**Where:** `terrain-derive.js` `deriveTerrainAndCover` lines 86–92.

**What:** Cover type transitions from 'none' to 'sparse_forest/sparse_mushforest' at canopy=0.15, and to 'forest/mushforest' at canopy=0.45. These are hard thresholds with no hysteresis or interpolation. Because canopy is driven by the stepped satFactor, cells near these thresholds flip between cover types with tiny saturation changes.

In `computeTilePalette`, forest cover darkens the background by up to 65% (`cd × 0.65`) and overlays the living cover color. A cell crossing from coverType='none' to 'forest' at canopy=0.46 gets a dramatic visual change — the same ground goes from brightly colored to deeply shaded.

**Impact:** Produces visible boundaries in the regional view where cover type changes. Most pronounced at the 0.15 threshold because that's near the canopy floor (0.12) for highly saturated cells.

**Category:** THRESHOLD CLIFF

### COLOR PATH SPLIT

#### Finding CP-1: Globe Uses Pre-Computed Hi-Res Colors; Regional Recomputes From Modified Values

**Where:** `planet-render.js` `render()` lines 399–421, `overlays.surface` line 177 vs `regional-render.js` `regionalOverlayFunctions['surface']` lines 36–42.

**What:** The globe's 'surface' overlay reads pre-computed colors from `state.planet.colorR/G/B` (populated by `stepHR8_colorRow`, which called `computeTilePalette` with the **original** hi-res physical values). The regional view calls `computeTilePalette(regionalPhysical(cell))` with **recomputed** values that differ due to:

1. **Different waterFactor multipliers** (SD-1): groundCover and canopy differ.
2. **Drainage-modified WTD → different saturation** (SD-2): ridge cells shift from sat ≈ 1.0 to sat ≈ 0.55.
3. **Noise-perturbed precipitation and groundwater**: ±0.06/±0.04 added in regional refinement.
4. **Drainage-modified grain size**: channels fined from hi-res values.
5. **Unwarped vs warped mineral threshold** (SD-3): chemo crust may differ.

For a typical lowland ridge cell, the compound effect is substantial. Example with precip=0.2, gw=0.1, grain=0.3:

| Property | Globe (hi-res) | Regional (ridge) |
|----------|---------------|------------------|
| WTD | ~0.00 | 0.18 |
| Saturation | ~1.00 | ~0.55 |
| waterFactor (canopy) | 0.75 | 0.38 |
| satFactor | 0.15 | 0.80 |
| Canopy | 0.12 | 0.30 |
| coverType | none | sparse_forest |

The globe shows no forest (coverType='none', no darkening). The regional view shows sparse forest (15–40% canopy darkening). These produce visibly different colors for the same location.

**Impact:** This is the **root cause of symptom 2** ("flora type disagreement between globe and regional view"). The mismatch isn't just flora type — it's a cascading disagreement in saturation, canopy, cover type, and therefore color. Even when flora type is correctly inherited, the rendered appearance differs because the physical inputs to `computeTilePalette` have diverged.

**Category:** COLOR PATH SPLIT

#### Finding CP-2: Regional Water Overlay Reads Hi-Res Colors for Ocean But Recomputes for Land

**Where:** `regional-render.js` `regionalOverlayFunctions['surface']` lines 21–26 vs 36–42.

**What:** Ocean cells in the regional view sample `state.hiResData.colorR/G/B` via `bilinearSampleHR` (matching the globe). Land cells call `computeTilePalette(regionalPhysical(cell))` with regional-recomputed values. This means ocean pixels match the globe but land pixels diverge. The transition at coastlines can produce a visible seam where the ocean color (globe-consistent) meets the land color (regionally recomputed).

**Impact:** Minor seam at coastlines. Less impactful than CP-1 but adds to visual inconsistency.

**Category:** COLOR PATH SPLIT

### DEAD VALUE

#### Finding DV-1: Unused `acrossDrain` Variable

**Where:** `regional-gen.js` line 705.

**What:** `const acrossDrain = -worldX * fdy + worldX * fdx;` — this uses `worldX` twice (should be `worldY` for the second term). The correct version `acrossDrainCorr` on line 707 is what's actually used. The dead variable is harmless but indicates a previous bug that was patched by adding the corrected version alongside.

**Impact:** None (dead code).

**Category:** DEAD VALUE

#### Finding DV-2: Cell `_hrCanopy` and `_hrGroundCover` Stored But Not Used to Constrain Recomputation

**Where:** `regional-gen.js` lines 811–813, 1086–1114.

**What:** The cell stores `_hrCanopy` and `_hrGroundCover` from the hi-res grid, but `refineRegionalFloraFromHiRes` recomputes these values from scratch rather than using the stored hi-res base as a starting point or constraint. The only hi-res values that survive into the final cell are grain size and flora type. The stored `_hrCanopy` is used only in the standing-water path (line 1062: `cell.groundCover = cell._hrGroundCover * 0.3`).

For non-water cells, the recomputation with different formulas (SD-1) produces values that can differ substantially from `_hrCanopy`/`_hrGroundCover`. If the intent was to "reproduce the high-res flora exactly" for ridge cells, the recomputation defeats that intent.

**Impact:** Contributes to CP-1. The stored values could be used to enforce consistency but are not.

**Category:** DEAD VALUE

### MISCALIBRATION

#### Finding MC-1: Standing Water WTD Gate May Be Too Permissive for Some Drainage States

**Where:** `regional-gen.js` `computeStandingWater` line 1347.

**What:** The WTD gate `centerCell.waterTableDepth > 0.10` was designed to prevent basins from filling on dry ridges. For lowland ridge cells (SO 0), WTD = `_hrWTD + 0.18` ≈ 0.18, which correctly fails the gate (0.18 > 0.10). But for SO 1 lowland cells, WTD = `_hrWTD + 0.06`. If `_hrWTD` ≈ 0, then WTD = 0.06, which **passes** the gate (0.06 < 0.10), allowing basins to fill.

On cells with low precipitation and low water availability, SO 1 can still arise from the regional drainage computation or hi-res inheritance. The saturation gate (0.4) provides some additional filtering — at WTD=0.06, sat ≈ 0.65, which passes the 0.4 gate.

**Impact:** This is a **contributor to symptom 4** ("standing water on dry cells"). Cells in dry areas that happen to have SO ≥1 (from window-bounded regional drainage or hi-res inheritance) can accumulate standing water despite low actual water availability. The basin area/depth requirements provide some protection, but in areas with noisy elevation, local minima may satisfy those criteria spuriously.

**Category:** MISCALIBRATION

#### Finding MC-2: Standing Water Channel Threshold Uses SO ≥3 But Doesn't Check Precipitation

**Where:** `regional-gen.js` `computeStandingWater` lines 1283–1290.

**What:** Cells with `streamOrder >= 3 && saturation > 0.85` get standing water regardless of actual water availability or precipitation. On a cell with SO 3 (which can arise from regional flow accumulation even in a moderately dry region if terrain funnels flow) and high saturation (which can result from fine grain + moderate drainage), water appears even though actual precipitation may be very low.

**Impact:** Another contributor to **symptom 4**. The saturation > 0.85 check is the main protection, but after drainage modification, channel cells often reach this threshold automatically (WTD = −0.02 → sat ≈ 1.0).

**Category:** MISCALIBRATION

---

## 3. Scale Consistency Matrix

| Property | Planetary Scale (step5/5b) | Hi-Res Scale (stepHR1–8) | Regional Scale (HiRes path) | Agree? | Consequence |
|----------|---------------------------|--------------------------|----------------------------|--------|-------------|
| **Elevation** | Low-res grid cell values | Bilinear from planetary + coastline noise + terrain noise | Bilinear from hi-res + isotropic detail + anisotropic channel noise | Approximately | Regional adds sub-hi-res detail; coastline can shift between scales |
| **Precipitation** | `precipAccum / p95`, normalized 0–1 | Bilinear from planetary | Bilinear from hi-res + noise ±0.06 | Mostly | Small noise perturbation; ≤6% shift |
| **Groundwater** | `coastalBase + recharge + geothermal − depthPenalty` | Bilinear from planetary | Bilinear from hi-res + noise ±0.04 | Mostly | Small noise perturbation; ≤4% shift |
| **Grain Size** | Estimated: `0.25 + elev × 0.6` (no slope/volcanism/coast) | Computed from slope, elevation, volcanism, coastal proximity, noise | Inherited from hi-res (bilinear), then channels fined (SO≥2: capped 0.2) | **NO** | Planetary estimate ignores all factors except elevation (see SD-5) |
| **WTD** | Estimated: `(1−sat) × (0.3 + elev×2)`, range [0,1] | `max(0,elev)×3 − precip×1.2 − volc×1.0 − coastal`; range ≥0 | `_hrWTD + drainage adjustment`; ridge: +0.18 (lowland), channel: −0.02 | **NO** | Three different formulas; planetary can't go negative, hi-res can via basin check only (see SD-2, SD-5) |
| **Saturation** | Estimated: `waterAvailability` (direct) | Capillary model from WTD and grain; range 0.0–1.0 | Recomputed from drainage-modified WTD; same capillary model | **NO** | Planetary uses water availability as proxy; hi-res/regional use capillary physics (see SD-2, SD-5) |
| **Ground Cover** | Estimated: `max(0.3, floraDensity × 0.8)` — **floor of 0.3** | `waterFactor(precip×3+gw×2) × (0.5+(1−grain)×0.4)` | `waterFactor(precip×1.5+gw×1.0) × (0.5+(1−grain)×0.4)` | **NO** | Planetary floor forces 'grass' terrain everywhere; hi-res/regional compute much lower values (see SD-1, SD-5) |
| **Canopy** | Estimated: `floraDensity × 0.7` if floraDensity > 0.2 | `waterFactor(precip×3+gw×1.5) × satFactor × subFactor`; floor 0.12 | `waterFactor(precip×1.5+gw×0.8) × satFactor × subFactor`; floor 0.12 | **NO** | Planetary estimate can reach 0.56; hi-res crushes to 0.12–0.15 at high sat. Planetary shows forest; hi-res shows none (see GL-1, SD-5) |
| **Chemo Crust** | Estimated: `floraDensity × 0.5` if chemotrophic | `mineralTotalW > 0.4` threshold (domain-warped minerals) | `mineralTotal > 0.4` threshold (unwarped minerals) | **NO** | Three different methods (see SD-3, SD-5) |
| **Flora Type** | `waterAvail × 0.8` vs `minerals × max(waterAvail, **gw**×1.5) × 1.2`; unwarped minerals | `regWaterW × 0.8` vs `mineralsW × max(regWaterW, **volc**×1.5) × 1.2`; domain-warped | **Inherited** from hi-res via nearest-neighbor + boundary jitter | **NO** (planetary vs hi-res) | Chemo uses groundwater at planetary, volcanism at hi-res — different physical fields! (see SD-4) |
| **Terrain Type** | `deriveTerrainAndCover` with `_est*` values (groundCover floored at 0.3) | `deriveTerrainAndCover` with hi-res computed values | `deriveTerrainAndCover` with regionally-recomputed values | **NO** | Same function, three different input sets. Planetary biased toward 'grass' (see SD-5) |
| **Cover Type** | `deriveTerrainAndCover` with canopy up to 0.56 | `deriveTerrainAndCover` with canopy 0.12–0.15 | `deriveTerrainAndCover` with canopy 0.12–0.30 | **NO** | Planetary shows 'forest', hi-res shows 'none', regional shows 'sparse_forest' for same cell |
| **Organic Content** | Not computed at planetary | `(groundCover + canopy) × 0.5 × (sat>0.7 ? 0.7 : 0.3)` | Same formula with regionally-recomputed groundCover and canopy | Depends on inputs | Indirectly affected by SD-1 and SD-2 |
| **Rendered Color** | `computeTilePalette` via `_est*` values (coarse; low-res fallback only) | `computeTilePalette` in `stepHR8_colorRow` with hi-res values | `computeTilePalette` via `regionalPhysical` with regional values | **NO** | Compound of all above disagreements (see CP-1) |

---

## 4. Symptom-to-Finding Map

### Symptom 1: Grid-aligned rectangular blocks (~128 px) in regional view

**Primary cause:** GA-1 (flora type nearest-neighbor from hi-res → 128-cell blocks).
**Secondary causes:** GA-2 (stream order nearest-neighbor → WTD/saturation step blocks), GA-3 (bilinear gradient thresholding), TC-1 (satFactor cliff amplifies bilinear contours).

### Symptom 2: Flora type disagreement between globe and regional view

**Primary causes (two layers):**

1. **Flora TYPE disagreement:** SD-4 (planetary step5 uses `max(water, groundwater×1.5)` for chemo fitness; hi-res stepHR6 uses `max(water, volcanism×1.5)` — entirely different physical fields). The globe's floraType diagnostic overlay reads `state.cells[i].floraType` (from step5), while the hi-res overlay reads `state.hiResData.floraType[hi]` (from stepHR6). These can assign different winners in transition zones. The regional view inherits from hi-res, so the regional view and hi-res globe agree, but the snapshot panel's "PLANET" reading (from step5) may show a different type than "REGION" (from hi-res).

2. **Rendered APPEARANCE disagreement:** CP-1 (globe uses hi-res pre-computed colors; regional recomputes from modified values). The disagreement cascades through SD-2 (different saturation), SD-1 (different waterFactor), resulting in different canopy, cover type, and therefore color. Even when flora type matches, the rendered color diverges because canopy, ground cover, and saturation all differ.

### Symptom 3: Uniform canopy across wide conditions

**Primary cause:** GL-1 (satFactor=0.15 crushes canopy at sat>0.95, which covers most lowland). GL-2 (waterFactor saturates at precip>0.33) compounds the problem at hi-res. The resulting canopy is clamped to 0.12–0.15 across ~80% of wet lowland area.

### Symptom 4: Standing water on dry cells

**Primary cause:** MC-1 (WTD gate at 0.10 allows SO 1 cells to hold water even with low WTD). MC-2 (SO ≥3 channel water doesn't check precipitation). Basin detection in `computeStandingWater` can fill local minima in noisy terrain even where precipitation is low, because the WTD gate is calibrated relative to the drainage-modified WTD (which can be low for mid-stream-order cells) rather than to actual water availability.

### Symptom 5: Hard horizontal/vertical lines in regional view

**Primary cause:** GA-2 (hi-res stream order nearest-neighbor produces WTD steps at hi-res grid boundaries). TC-1 (satFactor cliff at 0.85 amplifies continuous saturation gradients into visible steps). GA-3 (bilinear gradients from hi-res grid produce grid-aligned isolines that threshold functions convert into visible edges).

### Symptom 6: Insufficient variation in lowland forest

**Root causes:** GL-1 (canopy clamped to 0.12–0.15 → cover type usually 'none' → no forest darkening), GL-2 (waterFactor saturated → groundCover uniform), and the resulting uniform inputs to `computeTilePalette`. Mineral variation exists but changes slowly (bilinear from the coarse planetary grid). Drainage features exist in the elevation field (channels) but don't propagate to strong enough saturation/grain/canopy differences to produce visible color variation because the satFactor and waterFactor compress the output range.

---

## 5. Recommendations

### For SD-1 (waterFactor multiplier mismatch)
**Direction:** Unify the formula. Either the hi-res pipeline should adopt the regional multipliers (1.5/1.0/0.8), or the regional pipeline should use the hi-res multipliers (3.0/2.0/1.5). The former preserves gradient (good for variation) but requires re-tuning the hi-res pipeline to compensate for lower canopy at low precipitation. The latter produces consistency but re-introduces the gradient loss. Best approach: adopt a single set of intermediate multipliers at both scales (e.g., 2.0/1.3/1.0) and adjust the satFactor to compensate (see GL-1 fix).

### For SD-2 (drainage WTD shift)
**Direction:** Either remove the WTD drainage adjustment for ridge cells and accept that the regional view shows the same uniform saturation as the globe, or apply a corresponding WTD adjustment in `stepHR6`/`stepHR8` at the hi-res scale so the globe matches. The former is simpler but loses the drainage variation the adjustment was designed to produce. An alternative: keep the WTD adjustment but use it to modulate only the fine-detail rendering (tile level), not the regional-scale physical state that feeds `deriveTerrainAndCover`. This decouples the "visible drainage features" goal from the "scale consistency" goal.

### For SD-3 (chemo crust mineral warping)
**Direction:** Use the same mineral sampling method at both scales. Either add domain warping to the regional chemo crust computation (using the same warp parameters as `stepHR6`), or inherit chemo crust from the hi-res grid (`_hrChemoCrust`) and only modulate it by drainage, the same way grain and WTD are modulated.

### For SD-4 (three-way flora type formula disagreement)
**Direction:** Unify the flora type fitness formulas across all three scales. The critical fix is the chemoFitness secondary factor: planetary uses `groundwater × 1.5`, hi-res uses `volcanism × 1.5`. Pick one — `volcanism` makes more physical sense for chemotrophic organisms (they metabolize minerals from volcanic vents), so update step5 to use volcanism. Align the water metrics: either all scales use the same `min(1, precip × M + gw × N)` formula (with agreed-upon multipliers from SD-1 fix), or all use `waterAvailability`. Remove the elevation scaling from the regional LowRes photoFitness formula. Align barren thresholds to 0.02 everywhere.

### For SD-5 (planetary terrain estimate divergence)
**Direction:** The planetary estimates are inherently coarse and will never match the hi-res computed values exactly. Two options: (a) Accept that the planetary grid's terrain/cover classification is a rough approximation and ensure the rendering always uses the hi-res pre-computed colors (which it does when `state.planet` exists). In this case, the `_est*` values only matter for the low-res fallback and diagnostic overlays — mark them clearly as estimates. (b) Reduce the worst divergences: remove the groundCover 0.3 floor (which biases everything toward 'grass'), and compute canopy from `waterAvailability × satFactor` using the same satFactor function as the hi-res pipeline (even if the saturation estimate is rough, the function shape should match). The groundCover floor is the single most impactful issue — it forces all vegetated cells to 'grass' terrain type at the planetary scale.

### For GA-1 (flora type blocks)
**Direction:** Replace nearest-neighbor inheritance with a **fitness-based recomputation** that uses the same formula as the hi-res pipeline but with inputs that include local regional noise. This would produce type boundaries that follow organic contours at regional resolution instead of hi-res grid lines. To prevent disagreement, the fitness competition should be seeded with the same domain-warped mineral values the hi-res pipeline used, just sampled at regional resolution. Alternatively, use a **dithering** approach: sample all four surrounding hi-res cells' flora types and probabilistically choose based on bilinear interpolation weights + noise.

### For GA-2 (stream order blocks)
**Direction:** Instead of nearest-neighbor floor, bilinear-sample the hi-res flow accumulation and recompute stream order from the interpolated flow value + the regional flow accumulation. This produces smooth transitions at hi-res cell boundaries. Stream order is derived from a continuous field (flow accumulation) so the interpolation is meaningful.

### For GL-1 (satFactor crushing canopy)
**Direction:** Replace the step function with a smooth continuous function. For example: `satFactor = 1.0 - 0.7 × smoothstep(0.5, 1.0, sat)` or a piecewise-linear version without jumps. The intent (waterlogged soil → reduced canopy) should be preserved but with a gradual transition, not a 2.3× cliff at 0.85. The floor at sat<0.3 (satFactor=0.45) can remain or be made continuous.

### For GL-2 (waterFactor saturation)
**Direction:** Reduce the hi-res multipliers to match the regional ones (or use an intermediate value). With precip × 1.5 + gw × 0.8, waterFactor varies meaningfully across the range precip=0.05 to precip=0.67, providing much better gradient preservation. The satFactor fix (GL-1) will compensate for the reduced canopy amplitude.

### For TC-1 (satFactor cliff)
**Direction:** Subsumed by GL-1 fix — replacing the step function with a smooth curve eliminates the cliff.

### For CP-1 (globe vs regional color split)
**Direction:** The root cause is that regional recomputes values that should be inherited. Fixing SD-1 and SD-2 will largely resolve this. Additionally, consider using `_hrGroundCover` and `_hrCanopy` as the base for ridge cells (SO 0) rather than recomputing from scratch. Only drainage-affected cells (SO ≥1) should deviate from the hi-res base.

### For MC-1 and MC-2 (standing water on dry cells)
**Direction:** Add a precipitation/waterAvailability check to the standing water computation. For example, require `centerCell.precipitation > 0.15` or `centerCell.waterAvailability > 0.2` for basins to fill, in addition to the WTD and saturation gates. For channel water (SO ≥3), replace the saturation-only check with `precip > 0.1 && sat > 0.85`.
