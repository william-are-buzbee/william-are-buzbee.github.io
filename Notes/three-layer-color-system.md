# Three-Layer Color System — Material Table, Transforms, and Derived Palette

Reference document for all visual color decisions. The tile palettes used by the sprite renderer are **derived** from this system, not hand-picked. To add a new material or tile, define its Layer 1 color and material composition — the pipeline produces the screen color.

Include this document alongside Ecology-Foundations.md and Underground-Chemotrophic-Ecology.md for any visual, palette, sprite, or rendering work.

---

## Transform Parameters (Locked)

### Layer 2: Star Modification
Yellow-orange star at ~65% Earth intensity. Strongly suppresses blue, moderately suppresses green, passes red.

```
R_L2 = R_L1 × 0.95 × 0.65   (net: × 0.6175)
G_L2 = G_L1 × 0.62 × 0.65   (net: × 0.403)
B_L2 = B_L1 × 0.25 × 0.65   (net: × 0.1625)
```

### Layer 3: Chromatic Adaptation (modified von Kries)
Visual system evolved under the star. Gain-reduces expected channels (red), gain-boosts rare channels (blue/green). Neural brightening compensates for dim environment.

```
R_L3 = R_L2 × 0.80 × 1.60   (gain-suppress red — it's background noise)
G_L3 = G_L2 × 1.25 × 1.60   (gain-boost green — informative)
B_L3 = B_L2 × 2.80 × 1.60   (gain-boost blue hard — rare and valuable)
```

### Net Multipliers (Layer 1 → Layer 3, open sky)

```
R: × 0.790
G: × 0.806
B: × 0.728
```

R and G are near-equal, so spectrally neutral materials stay neutral on screen. Materials with genuine blue content (water, copper) retain visible coolness because the blue gain is aggressive relative to the channel's L2 suppression. Materials with red dominance (photosynthetic tissue) stay visibly red because their L1 red is far higher than their green.

### Shade Modifiers (applied to L3 linearly)

```
Open sky:       × 1.00
Light shade:    × 0.70   (scattered canopy, structure shadow)
Full canopy:    × 0.55   (forest interior)
Deep shade:     × 0.40   (dense undergrowth, cave entrance)
```

### Wet Film Modifier
Applied to any surface with water film. Darkens, increases saturation slightly, minimal cool shift.

```
R_wet = R × 0.82
G_wet = G × 0.82
B_wet = B × 0.82 + 6   (thin water film scatters blue weakly)
```

---

## Material Table — Layer 1 (neutral white light)

### Chemistry-Insensitive Materials

| Key | Layer 1 Hex | RGB | Description |
|---|---|---|---|
| `photosynthetic_tissue` | `#821D2D` | 130, 29, 45 | Living mat/frond. Deep crimson-maroon. Pigment absorbs blue/green/violet, reflects red with violet undertone. The visual anchor of the planet. |
| `dead_organic` | `#8C6E3C` | 140, 110, 60 | Decomposed mat, detritus. Warm amber-brown. Pigment degraded, structural compounds remain. |
| `hemolymph` | `#1E96AA` | 30, 150, 170 | Copper-based blood. Blue-cyan when oxygenated (hemocyanin). |
| `calcium_structure` | `#E8B8A0` | 232, 184, 160 | Bone-like CaCO₃. Warm pink-cream under white light. (Adjusted warm at L1 so L3 reads as warm off-white, not green.) |
| `liquid_water` | `#1E2D41` | 30, 45, 65 | H₂O. Absorbs red, scatters blue. Subtle cool bias independent of illuminant. |
| `sky_reflection` | `#FFC870` | 255, 200, 112 | Star-colored specular highlight on reflective surfaces. Not a material — a lighting phenomenon. |

### Chemistry-Sensitive Materials

Base color under neutral/mixed chemistry, then shifts per mineral regime. Materials that incorporate local minerals are tinted by whatever's in the groundwater.

**Mineral substrate** (soil, loose earth):

| Chemistry | Layer 1 Hex | RGB | Notes |
|---|---|---|---|
| Iron | `#8C5535` | 140, 85, 53 | Rust-brown. Most common surface soil. |
| Copper | `#4E7C62` | 78, 124, 98 | Gray-green. Wetlands and seep zones. |
| Manganese | `#5C3D58` | 92, 61, 88 | Purple-brown. Chemotrophic zones. |
| Mixed/neutral | `#786E5F` | 120, 110, 95 | Gray-brown. Default. |
| Depleted | `#A89B87` | 168, 155, 135 | Pale tan. Mineral-poor zones. |

**Structural wood** (trunks, stalks — mineral-impregnated):

| Chemistry | Layer 1 Hex | RGB | Notes |
|---|---|---|---|
| Iron | `#8A4A30` | 138, 74, 48 | Rust-red trunk. Most common. |
| Copper | `#4A8868` | 74, 136, 104 | Verdigris-green trunk. |
| Manganese | `#3A2830` | 58, 40, 48 | Near-black trunk. |
| Depleted | `#C0B498` | 192, 180, 152 | Pale fibrous trunk. Looks sickly. |

**Chemotrophic colony** (mound and bracket body — dense layered mineral-organic structure, color IS the chemistry):

| Chemistry | Layer 1 Hex | RGB | Notes |
|---|---|---|---|
| Manganese | `#6A4088` | 106, 64, 136 | Deep violet. Primary mushroom zone color. |
| Copper | `#30887A` | 48, 136, 122 | Teal-green colony. |
| Iron | `#A07030` | 160, 112, 48 | Amber-ochre colony. |

**Chemotrophic mat** (thin mineral crust coating rock/soil — thinner, less saturated than colony body):

| Chemistry | Layer 1 Hex | RGB | Notes |
|---|---|---|---|
| Manganese | `#503860` | 80, 56, 96 | Muted violet crust. The "ground" of fungal zones. |
| Copper | `#387060` | 56, 112, 96 | Muted teal crust. |
| Iron | `#785838` | 120, 88, 56 | Rusty mineral crust. |

**Chemotrophic spire** (thin reproductive stalk — slightly paler, drier than colony body):

| Chemistry | Layer 1 Hex | RGB | Notes |
|---|---|---|---|
| Manganese | `#7A50A0` | 122, 80, 160 | Lighter violet. Visible against dark colony. |
| Copper | `#40A090` | 64, 160, 144 | Pale teal stalk. |
| Iron | `#B08040` | 176, 128, 64 | Pale ochre stalk. |

**Mixotrophic tissue** (photosynthetic surface over chemotrophic base — dual-energy organisms in transition zones):

| Zone chemistry | Layer 1 Hex | RGB | Notes |
|---|---|---|---|
| Manganese | `#782B51` | 120, 43, 81 | Red-purple. Photosynthetic crimson + violet mineral base. Striking and distinct from either parent lineage. |
| Copper | `#61484C` | 97, 72, 76 | Dark muted mauve. Crimson pigment muted by teal base. |
| Iron | `#8E3E2E` | 142, 62, 46 | Deep warm red. Closest to pure photosynthetic tissue because iron base is already warm-toned. |

**Granular mineral** (sand, gravel, particulate):

| Chemistry | Layer 1 Hex | RGB | Notes |
|---|---|---|---|
| Iron | `#A87850` | 168, 120, 80 | Ochre sand. |
| Mixed | `#908878` | 144, 136, 120 | Gray-tan. Default. |
| Depleted | `#B8B0A0` | 184, 176, 160 | Pale buff sand. Desert zones. |

**Bedrock** (solid exposed stone):

| Chemistry | Layer 1 Hex | RGB | Notes |
|---|---|---|---|
| Iron | `#705040` | 112, 80, 64 | Warm dark stone. |
| Mixed | `#605850` | 96, 88, 80 | Gray-brown neutral stone. |
| Depleted | `#8A8478` | 138, 132, 120 | Light gray stone. |

---

## Computed Layer 3 Reference Values (open sky)

These are the pipeline outputs for individual materials. Tile palettes are composed from these.

### Core materials

| Material | L1 | L3 (open sky) | Visual |
|---|---|---|---|
| `photosynthetic_tissue` | `#821D2D` | `#671721` | Dark vivid crimson |
| `dead_organic` | `#8C6E3C` | `#6F592C` | Warm brown |
| `hemolymph` | `#1E96AA` | `#18797C` | Teal-cyan (beacon) |
| `calcium_structure` | `#E8B8A0` | `#B89574` | Warm cream-tan |
| `liquid_water` | `#1E2D41` | `#18242F` | Dark blue-gray |
| `sky_reflection` | `#FFC870` | `#C9A152` | Bright amber-gold |

### Mineral substrates and structural materials

| Material | L1 | L3 (open sky) | Visual |
|---|---|---|---|
| `iron_substrate` | `#8C5535` | `#6F4527` | Rust brown earth |
| `copper_substrate` | `#4E7C62` | `#3E6447` | Muted green earth |
| `mn_substrate` | `#5C3D58` | `#493240` | Purple-dark brown |
| `mixed_substrate` | `#786E5F` | `#5F5944` | Neutral olive-brown |
| `depleted_substrate` | `#A89B87` | `#857D62` | Pale warm tan |
| `iron_wood` | `#8A4A30` | `#6D3C23` | Dark rust trunk |
| `copper_wood` | `#4A8868` | `#3B6E4C` | Green trunk |
| `mn_wood` | `#3A2830` | `#2E2123` | Near-black trunk |
| `iron_sand` | `#A87850` | `#85613A` | Ochre sand |
| `depleted_sand` | `#B8B0A0` | `#918E74` | Pale buff |
| `iron_bedrock` | `#705040` | `#59402F` | Warm dark stone |
| `mixed_bedrock` | `#605850` | `#4C473A` | Gray-brown stone |

### Chemotrophic flora

| Material | L1 | L3 (open sky) | Visual |
|---|---|---|---|
| `mn_colony` | `#6A4088` | `#543463` | Deep violet mound/bracket |
| `copper_colony` | `#30887A` | `#276E59` | Teal colony |
| `iron_colony` | `#A07030` | `#7E5A23` | Amber colony |
| `mn_mat` | `#503860` | `#3F2D46` | Muted violet crust |
| `copper_mat` | `#387060` | `#2C5A46` | Muted teal crust |
| `iron_mat` | `#785838` | `#5F4729` | Rusty mineral crust |
| `mn_spire` | `#7A50A0` | `#604174` | Light violet stalk |
| `copper_spire` | `#40A090` | `#338169` | Pale teal stalk |
| `iron_spire` | `#B08040` | `#8B672F` | Pale ochre stalk |

### Mixotrophic flora

| Material | L1 | L3 (open sky) | Visual |
|---|---|---|---|
| `mn_mixotroph` | `#782B51` | `#5F233B` | Red-purple, striking |
| `copper_mixotroph` | `#61484C` | `#4D3A37` | Dark muted mauve |
| `iron_mixotroph` | `#8E3E2E` | `#703221` | Deep warm red |

---

## Material Texture Profiles

How each material distributes visually across a tile surface at 16×16 pixel scale. Each profile describes the spatial pattern, density, and character of that material's visible features. These are the specs for procedural texture generation and for hand-authoring sprites that correctly represent material composition.

In the current sprite system, '.' = bg (tile fill), '#' = fg (primary detail), '-' = mid (secondary detail). The texture profile describes what each of these pixel types represents physically for each material, and how densely they distribute.

### Photosynthetic Flora Textures

**`photosynthetic_tissue` (living mat/frond)**
Pattern: mat-forming. Continuous coverage with irregular gaps where the mat is damaged, thin, or hasn't filled in. At low coverage (grassland), scattered patches and short filaments — 2-3px clusters separated by gaps. At high coverage (forest canopy), near-solid with occasional 1px gaps where substrate shows through. The key character: organic continuity — patches connect to each other, not isolated dots. Edges are soft and irregular, not geometric. At canopy scale (cover tile), reads as the crown of a branching fern-tree — a dome-shaped mass with fractal frond subdivisions visible as internal detail.

**`dead_organic` (detritus)**
Pattern: scattered fragments. No continuous structure. Random 1px dots and 1-2px dashes distributed with no directional bias. Denser near living mat zones (decomposition happens where things grew), sparser on exposed substrate. The key character: scatter without pattern — looks like debris because it is. No clusters, no alignment, no growth structure. Just random organic litter on the ground.

**`structural_wood` (trunk/stalk material)**
Pattern: vertical, linear, narrow. A trunk is 2-3px wide at 16×16 scale. Internal detail is vertical grain — 1px '-' marks running parallel to the trunk axis, representing mineral banding in the impregnated ceramic-like material. No branching at ground level (branching happens at canopy height). The key character: rigid vertical axis — unlike the organic sprawl of mat tissue, trunks are straight structural columns.

### Chemotrophic Flora Textures

These look geological, not botanical. Growth forms are dictated by mineral substrate contact, not light capture.

**`chemotrophic_mat` (mineral crust)**
Pattern: near-uniform with concentric growth features. Covers surfaces as a continuous crust, more homogeneous than photosynthetic mat (no gaps for substrate to show through — the crust IS on the substrate). Visible features are concentric arcs radiating from growth centers, and occasional ridge lines where two spreading mats meet. At 16×16, the fg pixels form subtle arc fragments and ridges across a mostly-solid bg fill. The key character: geological uniformity with growth lines — more like lichen crust or mineral deposit than a living mat. Slightly glossy (higher reflectance detail) when wet.

**`chemotrophic_colony` (mound/bracket body)**
Pattern: horizontal banding. The growth layers of a colony mound are visible as concentric horizontal lines — each layer a ring of mineral-encrusted organic material deposited over time. At 16×16, a mound silhouette is a wide dome (8-12px wide, 5-8px tall) in the lower portion of the tile, with 2-3 horizontal '-' lines across its body showing growth rings. A bracket shelf is similar but horizontal — a flat projection from a vertical surface, 4-8px wide and 1-2px tall, with a single growth line. The key character: layered, architectural, wider than tall. Colony structures look built, not grown. More termite-mound than mushroom.

**`chemotrophic_spire` (reproductive stalk)**
Pattern: thin vertical. 1px wide, 6-8px tall, projecting upward from a mound or mat surface. May have a 2px bulb at the top (spore release structure). Sparse — at most 1-2 per tile, and only on tiles representing mature colonies. The key character: needle-thin vertical accent against the horizontal banding of the colony body. The only chemotrophic growth form with significant vertical extent.

### Mixotrophic Flora Textures

**`mixotrophic_tissue` (dual-energy organisms)**
Pattern: low mound base with filamentous crown. The base is chemotrophic-style — a low dome (4-6px wide, 3-4px tall) with horizontal growth banding. The crown is photosynthetic-style — 2-4px of irregular organic filament/frond texture rising from the top of the mound. The two textures stack vertically with a visible transition. At 16×16, this reads as a small dome with a fuzzy red top. The key character: geological base, botanical crown. The only organism on the planet that looks half-rock, half-plant.

### Mineral and Geological Textures

**`mineral_substrate` (soil)**
Pattern: mostly uniform with sparse inclusions. Soil is fine-grained at the tile scale — the bg fill dominates. fg pixels are rare — occasional pebble-scale inclusions (1px dots, very sparse, 2-4 per tile). The key character: ground. Uninteresting. The substrate is what shows between the interesting things growing on it.

**`bedrock` (exposed solid stone)**
Pattern: irregular slab edges and crack lines. Blocky features — 2-3px rectangular fg clusters representing raised stone slabs, with 1px '-' marks representing fractures and grain boundaries between them. More dense and angular than soil. The key character: hard, fractured, geometric. Stone has visible structure because it breaks along crystal planes and bedding surfaces.

**`granular_mineral` (sand/gravel)**
Pattern: nearly homogeneous fine grain. At 16×16, sand is almost solid bg fill with extremely sparse fg dots (1-2 per tile). Gravel is slightly denser (3-5 fg dots). The key character: uniformity. Sand looks like sand because every grain is the same size and nothing interrupts the surface. The most visually monotone material — variety comes from chemistry tint, not texture.

### Water Textures

**`liquid_water` (water body)**
Pattern: directional wave marks. fg pixels form 2-3px dashes oriented roughly parallel to each other (wave crests), distributed with regular spacing (4-5px apart vertically). At 16×16, 3-4 wave mark dashes per tile. The key character: directional rhythm. Wave marks are NOT random scatter — they follow surface tension and wind patterns. They should have consistent orientation within a region. Calm water has fewer, fainter marks. Rough water has more, brighter marks.

**`wet_film` (water on surface)**
Not a standalone texture. Modifies the underlying material: reduces the number of visible fg/mid pixels by ~30% (water fills micro-gaps, reducing surface detail) and applies the wet color modifier (darken, slight cool shift). Wet versions of any material look smoother and darker than dry versions.

### Animal Tissue Textures (for corpse/body rendering)

**`hemolymph` (blood/fluid)**
Pattern: pooling. On a corpse or wound, hemolymph gathers in low spots — fills the bottom of the tile or pools in irregular 3-5px blobs. The key character: liquid accumulation. Not scattered dots — pooling fluid that flows to the lowest point.

**`calcium_structure` (bone)**
Pattern: linear exposed edges. Bone shows through as curved lines on a corpse — 1-2px wide arcs where the flesh has parted and the underlying structure is visible. Not scattered dots — continuous structural elements partially revealed.

---

## Tile Palettes — Layer 3 (derived)

Each tile's bg/fg/mid is composed from the materials and lighting appropriate to that terrain. Material compositions noted for traceability.

### Surface natural terrain

**plains** — open sky, iron-chemistry region
```
bg:  #36221A    dead_organic(0.40) + photosyn(0.30) + iron_sub(0.30), micro-shade
fg:  #7A4830    photosyn(0.45) + dead_organic(0.55), surface highlights
mid: #5A3E26    dead_organic(0.55) + iron_sub(0.45), intermediate
tint: null
```
Ground is a mix of living red mat, dead amber detritus, and mineral soil. fg reads as warm red-brown flecks on dark ground. Texture: scattered organic debris and mat fragments — dead_organic scatter pattern with photosynthetic_tissue patches.

**forest** — canopy shade (×0.55), iron-chemistry
```
bg:  #2E1610    photosyn(0.45) + dead_organic(0.30) + iron_sub(0.25), full canopy shade
fg:  #671721    photosynthetic_tissue, canopy catching open sky (the red anchor)
mid: #4C2A18    iron_wood, partial shade (×0.70) — trunk/understory material
tint: #671721
```
Dark floor with vivid crimson canopy features. Texture: the cover tile is a fern-tree canopy (dome-shaped photosynthetic crown) over a structural_wood trunk. The most visually saturated tile — this is the photosynthetic anchor.

**dirt** — open sky, iron-chemistry, no living mat
```
bg:  #382814    dead_organic(0.60) + iron_sub(0.40), micro-shade
fg:  #78532C    iron_sub(0.60) + dead_organic(0.40), surface detail
mid: #583E22    intermediate blend
tint: null
```
Warmer and yellower than plains — dead matter without red pigment signal. Texture: mineral_substrate pattern (sparse inclusions) with dead_organic scatter. No mat patches.

**mud** — wet, copper-influenced iron-chemistry, organic
```
bg:  #2E2114    dead_organic(0.50) + iron_sub(0.50), wet film applied
fg:  #706830    copper_sub(0.35) + dead_organic(0.65), wet surface highlights
mid: #4C4824    intermediate wet ground
tint: #706830
```
Wet organic substrate with copper traces producing justified green-amber tint. Texture: wet_film modifier applied — smoother, fewer visible features than dry ground. fg marks are mineral glints and organic matter poking above the water film.

**sand** — uses `desert` palette (T.SAND palette mapping: 'desert')

**desert** — mineral-depleted zone, open sky *(unchanged)*
```
bg:  #383636    depleted_substrate, micro-shade — desaturated gray
fg:  #BAB6B2    depleted_substrate, bright highlights — near-white
mid: #868280    intermediate
tint: #A09C98
```
The chemically dead zone. Texture: granular_mineral pattern — nearly homogeneous, extremely sparse features.

**rock** — exposed bedrock, mixed/iron chemistry, open sky
```
bg:  #3A3428    mixed_bedrock, micro-shade
fg:  #9C9278    depleted_bedrock(0.70) + iron_bedrock(0.30), bright mineral faces
mid: #68604E    intermediate stone
tint: #968A6E
```
Warm gray-brown stone. Texture: bedrock pattern — blocky slab edges, angular fracture lines.

**beach** — transition zone, iron-sand + organic, open sky
```
bg:  #40321C    iron_sand(0.60) + dead_organic(0.40), micro-shade
fg:  #A69270    iron_sand bright + depleted_sand, surface glint
mid: #76684C    intermediate
tint: #8E7C58
```
Coastal transition. Texture: granular_mineral pattern — fine, mostly uniform, with sparse shell/pebble inclusions.

### Water

**water** — open sky, mineral-rich surface
```
bg:  #18242F    liquid_water — intrinsic H₂O blue survives chromatic adaptation
fg:  #A08848    sky_reflection at ~60% — amber wave crests catching starlight
mid: #68582F    sky_reflection at ~40% — dimmer surface movement
tint: null
```
Cool-dark body with warm amber highlights. Texture: liquid_water pattern — directional wave dashes, 3-4 per tile, roughly parallel.

**deep** — open sky, deeper water, less specular
```
bg:  #121B23    liquid_water, deeper
fg:  #5A4825    sky_reflection at ~45%
mid: #3C3019    sky_reflection at ~30%
tint: null
```
Darker, fewer highlights. Texture: sparser wave marks, 1-2 per tile.

### Chemotrophic zones (manganese-dominated surface)

**NOTE: Current sprite silhouettes for mushroom/mushforest are reskinned tree sprites. These should be redesigned. Chemotrophic zones do not have tree-shaped organisms. The correct silhouettes are described in the texture profiles above: colony mounds (wide domes with horizontal banding), bracket shelves (horizontal projections from rock), and thin spires (needle-like vertical accents). The current sprites are placeholders.**

**fungal_grass** — chemotrophic ground mat, open sky, manganese chemistry
```
bg:  #241E30    mn_mat, micro-shade — crusty violet mineral ground
fg:  #6E5E8A    mn_mat bright + mn_colony fragments, surface features
mid: #4E3E62    intermediate
tint: #5E4E72
```
The ground between colony structures. Texture: chemotrophic_mat pattern — near-uniform mineral crust with concentric growth arcs and ridge lines. Visually distinct from organic grassland scatter. Open sky above — no canopy.

**mushroom** — colony mound zone, open sky, manganese chemistry (ground tile)
```
bg:  #281930    mn_mat, micro-shade — dark violet floor between mounds
fg:  #7E6494    mn_colony, mound/bracket surface features
mid: #523C64    intermediate colony material
tint: #6C5480
```
Colony structures rising from mineral crust ground. Texture: chemotrophic_colony pattern — wide dome silhouette with horizontal growth banding. NOT a tree. The cover tile should show a mound (8-12px wide dome, 5-8px tall, horizontal '-' lines for growth layers) with optional 1px spire projection from top.

**mushforest** — dense colony zone, colony self-shade, manganese chemistry (cover tile)
```
bg:  #281E34    mn_mat, light shade from colony structures
fg:  #886E94    mn_colony bright — bracket/mound surfaces catching light
mid: #5C4070    intermediate
tint: #705880
```
Denser colony coverage. Multiple mounds, possible bracket shelves. Texture: larger/overlapping colony mounds, tiered bracket shelving. The "forest" equivalent — but the visual impression should be geological terracing, not botanical canopy. More Yellowstone hot springs than Fangorn Forest.

### Underground *(unchanged — different lighting model)*

```
cave:       bg: #261E18   fg: #8E8474   mid: #584E40   tint: #8E7860
uwater:     bg: #1C2214   fg: #748C5C   mid: #404A34   tint: #7A9A64
cave_wall:  bg: #1A1614   fg: #342E28   mid: #262220   tint: null
cave_rock:  bg: #181816   fg: #2C2A28   mid: #201E1C   tint: null
```

### Built structures *(unchanged)*

```
town:       bg: #302418   fg: #D4BE98   mid: #9A8060   tint: null
castle:     bg: #2E2A28   fg: #BEB8B0   mid: #746C60   tint: null
road:       bg: #362C20   fg: #987C58   mid: #6A5438   tint: null
wood_floor: bg: #2C2010   fg: #8E6C44   mid: #604828   tint: null
hut_wall:   bg: #2C2010   fg: #8E6C44   mid: #604828   tint: null
wheat:      bg: #382E18   fg: #AA8C48   mid: #7A6438   tint: null
ruin:       bg: #2A2624   fg: #6E645C   mid: #524E48   tint: #645C58
```

### Structural *(unchanged)*

```
stone:      bg: #302C24   fg: #A09686   mid: #665E50   tint: #A89886
void:       bg: #000000   fg: #000000   mid: #000000   tint: null
lava:       bg: #3E1A10   fg: #E08060   mid: #B85030   tint: #D06040
```

---

## Creature Tint Colors (Layer 3)

These should eventually be derived from integument material + chemistry through the same pipeline. Current values are hand-picked but consistent with the palette. No changes proposed at this time — they work.

```
meso_predator (wolf):       #5A4A40   warm gray-brown, generalist
apex_predator (dire_wolf):  #3A302A   dark charcoal-brown, forest specialist
small_herbivore (hare):     #7A8070   light gray-green, grassland match
large_grazer (cave_crab):   #4A5040   olive-brown, marsh/coastal match
ambush_predator:            #5A5048   dark warm gray, substrate match
colonial_chemotroph:        #786880   muted purple-gray, manganese zone match
```

---

## Mixotrophic Flora — Design Concept

### What They Are

Dual-energy organisms that process both light (photosynthesis) and minerals (chemotrophy). Descended from chemotrophic lineage ancestors that acquired photosynthetic capability through endosymbiosis or horizontal gene transfer from the photosynthetic microbial lineage. Both flora lineages share the same deep ancestral microbial base — the genetic distance for pathway transfer is small enough that mixotrophy is a plausible and likely evolutionary outcome.

### Where They Grow

Transition zones where both light and mineral substrate are available. The boundary between photosynthetic forest and chemotrophic zone is their primary niche. Also: around surface mineral seeps within forested areas, along mineral-rich stream banks, on exposed rock faces in partial canopy, colonizing the bases of photosynthetic tree trunks where mineral substrate meets bark. They are the ecotone organisms — the "weeds" that fill every zone where at least one energy source is present.

### Why They Matter Visually

They produce colors that don't exist in either parent lineage. Photosynthetic crimson mixed with manganese violet = red-purple. Crimson mixed with copper teal = dark mauve. Crimson mixed with iron amber = deep warm red. These hybrid colors break up the hard visual boundary between forest (red) and fungal zone (purple), creating natural gradation. They also provide visual variety within forests near mineral sources — patches of differently-colored growth that signal "mineral chemistry is different here" without requiring a full biome transition.

### Growth Form

Low mound base (chemotrophic-style, 4-6px wide, 3-4px tall, horizontal growth banding) with photosynthetic filaments or frond-like extensions rising from the top (2-4px of irregular organic texture). The base is mineral-tinted by local chemistry. The crown is red-violet (photosynthetic pigment). The transition between the two materials is visible. At 16×16 tile scale, reads as a small dome with a fuzzy red top — clearly distinct from both tree silhouettes and pure colony mounds.

### Implementation Status

Not yet implemented. When implemented, mixotrophic growth would be:
- A new ground type or ground modifier for transition zones
- Chemistry-variable coloring (base tint from local minerals, crown always red-spectrum)
- Appearing in BIOME_PROFILES as a groundPalette component in ecotone zones
- Potentially a new cover type for dense mixotrophic growth

---

## Notes

**Calcium green-shift correction.** The transform slightly favors green (G_net=0.806 vs R_net=0.790). For most materials this is invisible. For very bright, near-neutral materials (bone, pale stone), it would produce a subtle green cast. Corrected by warming L1 for those specific materials. The transform stays fixed — we adjust source values, not the pipeline.

**Water texture note.** The blue water bg is a significant departure from the old warm-brown water bg. The color is physically justified. If the water TILE TEXTURE (sprite pattern) looks wrong with these colors, the texture should be redesigned for the new palette — the palette should not be bent to fit the old texture.

**Chemotrophic sprite redesign needed.** The current mushroom/mushforest sprites are reskinned tree silhouettes. Chemotrophic organisms are not tree-shaped. They are mounds, brackets, mats, and spires — geological forms, not botanical ones. New sprites should be designed from the texture profiles in this document. This is a sprite design task, not a palette task.

**Future per-species Layer 3.** The default Layer 3 transform represents "generic planet-adapted vision." To implement species-specific vision, replace only the adaptation gains (R×0.80, G×1.25, B×2.80) and brightness factor (×1.60) with per-species values derived from their transducer sensitivity curves. Everything upstream stays identical. A creature with no blue receptors would see water the same warm-brown as surrounding terrain — it literally cannot distinguish water from land by color.

**Future tile composition.** When tiles become material stacks with depth, each visible surface material runs through the same pipeline independently. The tile's rendered color is a weighted blend of constituent L3 values based on surface coverage percentage. The BIOME palette table becomes a cache of pre-blended L3 values, regenerated when tile composition or regional chemistry changes.

**Material texture profiles are forward-compatible.** The texture profiles describe spatial distribution behavior per material, independent of resolution. They apply to 16×16, 32×32, or procedurally generated tiles at any scale. The same profile ("concentric growth arcs, ridge lines where mats meet") can be rendered as 2px arcs at 16×16 or as detailed mineral crust at 64×64. The profiles don't need to change when resolution changes — only the rendering code does.
