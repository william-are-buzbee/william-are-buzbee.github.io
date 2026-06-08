# Circulatory Diversity, Immunity, and Microbial Ecology

Design reference for future systems involving metabolism, immune response, infection, digestion, and circulatory architecture. This document captures principles and design decisions from extended discussion. Nothing here is implementable yet — it establishes the physical and evolutionary framework that future prompts will build on.

Include alongside Ecology-Foundations.md, Cognition-Design.md, and Body-Sim-Design.md when designing metabolism, healing, infection, or new creature body plans.

---

## The Core Principle: Peak Demand, Not Total Demand

Closed circulation solves a concentration problem, not a total-demand problem.

A 2kg brain in one head is a metabolic furnace. Every neuron fires, consumes oxygen, generates waste, and it all has to be serviced at that single location. Open hemolymph can't deliver a firehose of oxygenated fluid to one point. Hence closed vessels, pressurized delivery, priority routing. This is why Clade A evolved closed circulation — to feed one hungry brain.

But 2kg of neural tissue distributed across eight limbs at 0.25kg each? The hottest point in the body draws only an eighth of the demand. The metabolic landscape is flat. No peaks, no bottleneck. Hemolymph washing through each body cavity only needs to service a modest local load. Open circulation survives as adequate because nothing is on fire.

**Closed circulation is not an upgrade. It's a solution to a specific problem — metabolic concentration — that only arises when tissues with high per-gram demand accumulate in one location.** An animal that distributes demand evenly never encounters the problem and never needs the solution.

### The Octopus Complication

Octopuses have distributed cognition (two-thirds of neurons in the arms) AND closed circulation. This seems to contradict the principle. It doesn't — octopus arms are doing enormous amounts of active neural processing. The per-arm metabolic demand is high enough that hemolymph bathing can't keep up. The octopus solved this with three hearts (one systemic, two branchial) pushing hemocyanin-based blood through pressurized vessels to every arm.

The octopus proves that closed circulation can serve distributed neural architecture. It also proves that the trigger is peak local demand in any tissue, not centralization specifically.

### The Insect Alternative

Insect brains are sophisticated — a honeybee navigates, learns, communicates, makes decisions. All on open circulation. The hemolymph bathes the brain directly. No pressurized vessels.

How? Two strategies. First, the brain is tiny in absolute terms (roughly one cubic millimeter), so diffusion across that volume is adequate. Second, insects evolved tracheal systems — direct air tubes that penetrate into tissues and deliver oxygen without going through the blood at all. The hemolymph carries nutrients and immune cells. Oxygen arrives through a parallel infrastructure.

This completely decouples oxygen delivery from circulatory pressure. You don't need pressurized blood to push oxygen to tissues if air is already there.

---

## Clade B Circulatory Diversity

Clade B's ancestral open circulation is not a fixed limitation. It's a starting point from which multiple evolutionary paths radiate. Different Clade B lineages solve the metabolic demand problem differently depending on their niche, and the solutions produce different kinds of animals.

### Path 1 — Keep Demand Flat

Distribute neural mass so evenly that no location creates a bottleneck. The hemolymph doesn't need to be richer or faster because no single point demands more than what diffuse bathing provides.

**Ceiling:** Low per-ganglion intelligence, but substantial collective computation across all ganglia. Can never build a heavy-integration hub — any zone that accumulates neural mass for integration work becomes a local metabolic hotspot the open system can't feed.

**Current creatures on this path:**
- Small herbivore (peak concentration 0.146) — perfectly flat demand
- Colonial chemotroph — individual nodes need minimal neural capacity
- Lurker (peak concentration 0.15) — mostly flat, with modest head integration at the edge of what open circulation supports

**Ecological fit:** Parallelism-dependent roles. Prey animals, colonial organisms, ambush predators that rely on distributed pattern matching over integration.

**The physical constraint on integration:** This is where cognition meets circulation. A Clade B creature on Path 1 can't evolve a brain — not because of neural architecture, but because the blood supply can't feed one. The ceiling on integration capacity is metabolic, not cognitive. The committee can never elect a president because the president's office can't get enough oxygen.

### Path 2 — Enrich the Medium

Better hemocyanin. Higher copper concentration. More oxygen carried per milliliter of hemolymph. The open system stays open but the fluid itself becomes more potent. Every cavity is bathed in richer soup.

**Ceiling:** Higher than Path 1. Permits modestly concentrated ganglia — maybe a zone holding 25-30% of neural mass, doing real integration work, fed by enriched hemolymph that can just barely keep up. Not a full brain, but a genuine processing hub.

**Cost:** Dietary copper dependency. The creature needs to consume more copper to maintain enriched hemolymph. Mineral-rich habitats become essential. The animal is smarter but geographically constrained by blood chemistry. A Clade B lineage on this path becomes ecologically tied to specific geochemistry in a way that Clade A (with its closed system and more modest hemocyanin needs per ml) isn't.

**On this planet:** Plausible and interesting. Copper is abundant but unevenly distributed. Manganese-rich zones would support different hemocyanin variants than copper-rich zones. Path 2 creatures might specialize by mineral region, with different populations running different hemolymph chemistry.

**Ecological fit:** Solitary Clade B predators or complex social species that need more integration than Path 1 provides but don't need Clade A-level centralization. An underground predator in copper-rich cave systems that evolved enriched hemolymph for better processing — genuinely smarter than the lurker, still distributed, still vibration-dominant.

### Path 3 — Parallel Delivery (Tracheal)

Evolve a secondary system that delivers oxygen directly to high-demand ganglia through tissue-penetrating channels. The hemolymph continues doing everything else — nutrients, immune cells, waste transport. Oxygen arrives through dedicated infrastructure.

**On this planet:** The tracheal equivalent would likely be mineral-walled tubules. Clade B's ancestral integument material (cuttlebone-meets-fingernail, semi-rigid, layered, mineral-incorporated) could form internal tubule structures. Air channels lined with mineralized tissue, branching from external openings (spiracle equivalents) and penetrating to ganglia. The animal breathes through its body surface into a distributed network of air tubes.

**Ceiling:** The highest of the three paths. A tracheal Clade B animal could have genuinely high per-ganglion neural mass without a metabolic bottleneck. Multiple powerful processors, not one brain. Could potentially develop integration hubs that rival Clade A centralization — but distributed across the body, each fed by local tracheal networks.

**Cost:** Body size ceiling. Air diffusion through tubes works at small-to-medium body size. At larger sizes, the tubes need active ventilation (pumping air through the network). This planet's thicker atmosphere (1.1-1.3 atm) raises the ceiling compared to Earth but doesn't eliminate it. A tracheal Clade B creature might max out at medium body size — lurker-scale, possibly larger, but not 200kg.

**Ecological fit:** Small-to-medium Clade B creatures in niches that reward cognitive sophistication. The underground ecology might be dominated by Path 3 creatures — vibration-sensing predators with multiple high-power ganglia, navigating cave systems with distributed intelligence that rivals Clade A in capability while remaining distinctly Clade B in architecture.

### Path 4 — Convergent Closure

A Clade B lineage independently evolves closed circulation. Pressurized vessels develop from hemolymph channels. Hearts evolve from muscular vessel segments. The animal closes its circulation to feed high-demand neural tissue.

**The result is not Clade A.** It's a Clade B animal with closed circulation. The neural topology is still mesh-derived even if one node grew dominant. The integument is still cuttlebone-derived. The sensory world is still vibration-primary. The reproductive biology is still simultaneous hermaphroditism with fragmentation capacity. The immune system runs on hemolymph-derived strategies even though the hemolymph is now pressurized. The ancestry is written into every system of the body in ways convergence can't erase.

**Configurations:** Closed circulation doesn't mean uniform circulation. Different Clade B lineages might pressurize different regions:
- Head and limb ganglia pressurized, body cavity still open — feeding distributed processors
- Head and torso pressurized, limbs open — convergent on Clade A's pattern but with different neural topology
- Sensor limbs and head pressurized, everything else open — feeding the detection-integration loop specifically
- Multi-heart systems — one heart per pressurized region, like the octopus model

**Ecological fit:** The most cognitively advanced Clade B creatures. Apex predators that rival Clade A in behavioral sophistication. Complex social species. Deep-time evolution products, rare and specialized.

### What All Paths Share

Regardless of circulatory solution, Clade B creatures retain:
- Mesh-derived neural topology (even if one node is dominant, cross-limb pathways persist)
- Vibration-primary sensory world (even if vision improves, the transducer hardware ancestry shows)
- Cuttlebone-derived integument (thickened, thinned, or modified, but the material is ancestral)
- Simultaneous hermaphroditism + fragmentation capacity (even if a lineage leans heavily on one mode)
- Contact chemoreception on limb tips (ancestral, present even when reduced)
- Hemolymph-based immunity (even in closed systems, the immune architecture descends from open-system strategies)

---

## Clade A Circulatory Stability

Clade A's closed circulation is ancestral and conserved. The centralized brain demanded it early. All Clade A descendants inherit pressurized vessels, heart(s), and high-throughput delivery to the head.

Variation within Clade A is more about **how much** flows where, not about circulatory type:
- Predators: high brain delivery (metabolically expensive integration, threat assessment, episodic memory)
- Herbivores: high gut delivery (massive fermentation chamber in the torso demands sustained blood flow)
- Aquatic forms: adapted pressure regulation for depth, possible secondary hearts for deep-diving
- Small-bodied forms: the closed system is overbuilt for their neural demand, which means metabolic overhead — maintaining pressurized vessels costs energy even when the brain doesn't need full throughput

The metabolic overhead of closed circulation in small Clade A creatures is a real evolutionary cost. A small Clade A herbivore (if one existed at 5kg) would spend proportionally more energy maintaining its circulatory infrastructure than a 5kg Clade B creature. This is part of why the small herbivore niche on this planet is filled by Clade B, not Clade A — open circulation is cheaper to maintain at small body size when neural demand is low.

---

## Immune Architecture

### What Circulation Constrains

The circulatory architecture constrains HOW the immune response is delivered, not WHETHER it's effective. Both systems mount strong immune responses. The difference is the geometry of defense.

**Closed circulation immune geometry:**
- Concentrates immune cells at wound sites through pressurized delivery
- Supports filtration organs — blood forced through dedicated filter tissue (spleen equivalent, lymph node equivalent) where immune cells screen for pathogens
- Fast delivery to specific sites
- Defense is organized, localized, and infrastructure-heavy
- Matches Clade A wound type — discrete punctures and lacerations that clot at specific sites

**Open circulation immune geometry:**
- Immune response distributed across all hemolymph-bathed tissue simultaneously
- No filtration bottleneck — the hemolymph itself is the immune medium
- Pathogens that enter hemolymph immediately encounter immune cells everywhere
- Defense is diffuse, broad, and medium-dependent
- Matches Clade B wound type — diffuse seeping from surfaces, no single breach point to defend

### Immune Memory Is Not Guaranteed

**Critical design note:** Adaptive immunity (antibody-based, memory-forming) evolved exactly once on Earth, in jawed vertebrates, under very specific selective pressures. It is NOT a consequence of closed circulation. Octopuses have closed circulation and no adaptive immunity. They run innate immunity — pattern recognition, phagocytosis, antimicrobial peptides. No antibodies, no immune memory.

Whether either clade evolves immune memory is an evolutionary design decision, not a circulatory consequence. Options:

**Option A — Neither clade has immune memory.** Both run innate immunity only. Immune function is about current tissue health and hemolymph quality, not infection history. Simplest and most defensible — no reason to assume immune memory is inevitable.

**Option B — Clade A evolves organ-based immune pattern recognition.** The filtration organs (enabled by closed circulation) accumulate molecular signatures over time. Not antibodies — accumulated chemical patterns in filter tissue that improve pathogen recognition with exposure. Slow, organ-dependent, destroyed if the filter organ is destroyed. Rhymes with the cognition parallel (organ-based memory) without forcing it. An older Clade A predator has survived more infections and carries a more experienced immune filter, just as it carries richer episodic memory.

**Option C — Clade B evolves chemically-conditioned hemocyte sensitivity.** Hemocytes tuned by the local chemical environment rather than organ-based memory. A Clade B creature living in manganese-rich soil has hemocytes adapted to the local microbial community through chemical conditioning. Move the creature to a new mineral zone and its hemocytes are less effective against unfamiliar microbes — not because it forgot, but because the chemistry changed. This produces "territory immunity" that parallels Clade B's territory-based cognition.

Option B and C can coexist — different strategies for different clades, neither superior.

### Mineral Encapsulation (Clade B)

Clade B's copper-rich hemolymph enables a distinctive immune strategy: precipitating copper or manganese compounds around pathogens to entomb them. The pathogen isn't destroyed — it's mineralized. Walled off in a metalite nodule.

The horseshoe crab precedent: open-circulation animal with hemocyte clotting factors sensitive enough to detect bacterial endotoxins at parts per trillion. Open circulation doesn't mean weak immunity. It means different immunity.

**Visible consequence:** An old Clade B creature that's survived many infections might have visible mineral nodules under the integument — past infections entombed in metalite deposits. The body records immune history physically, even though the immune system has no memory in the cognitive sense. The body remembers what the mind doesn't.

---

## The Microbial Ecology

### The Base Layer

The microbial base layer survived every wipe. Bacterial mats, chemotrophic microorganisms embedded in soil, rock, and water. They were too small, too widespread, and too resilient to be affected by surface-level destruction. They've been evolving continuously for longer than either animal clade has existed.

This layer is not just "in the soil." It's inside every animal. Every creature on the planet is a walking microbial ecosystem.

### Gut Microbiome

Every animal with a digestive tract hosts symbiotic microbes tuned to its diet.

**Predator gut:** Short, acidic, fast-transit. Protein digests quickly without extensive bacterial help. Minimal fermentation. The meso-predator's torso at 7.5kg houses a compact, efficient predator gut.

**Herbivore gut:** Long, alkaline, slow-transit. Extensive fermentation chambers where symbiotic bacteria extract calories from plant matter. The large herbivore's massive torso (80kg) is largely digestive infrastructure — fermentation chambers processing vegetation and mineral-rich substrate.

**Chemotroph gut:** Specialized for processing mineral substrate. The colonial chemotroph's enzymatic digestion is essentially an externalized gut — secreting digestive compounds onto substrate rather than containing food inside a tract.

**Diet change disrupts the microbiome.** A predator that starts eating vegetation gets poor caloric yield — the gut flora can't efficiently extract nutrition from plant matter. A player switching from Clade A prey to Clade B prey might experience reduced caloric efficiency during the transition as the microbiome adapts to unfamiliar biochemistry. This is a real cost of dietary flexibility, relevant to the mutation system (which requires consuming diverse creature types).

### Exterior Microbiome

Microbial communities on the body surface serve functional roles:

**Oral microbiome as weapon.** A predator's mouth hosts bacteria from feeding on prey and carrion. These bacteria thrive in the copper-based blood chemistry of this planet. A bite wound introduces oral microbiome into the wound channel, where it encounters the victim's hemolymph. Infection from a predator bite can be more dangerous long-term than the tissue damage itself — the wound heals, but the bacteria colonize.

This isn't a designed weapon. It's a structural consequence of diet. The meso-predator doesn't intend to infect its prey. The bacteria are just there, and the bite delivers them.

**Integument microbiome.** The skin surface hosts microbial communities that may provide passive disease resistance (competitive exclusion — resident bacteria outcompete pathogens for surface resources). Clade B's semi-porous integument (especially in the colonial chemotroph lineage) may have a richer surface microbiome due to the permeability that enables chemical signaling.

**Claw and limb-tip microbiome.** Limbs that dig through mineral-rich soil carry soil bacteria. A wound from a digging limb (like the large herbivore's paddle) introduces soil microbes. Different mineral zones host different microbial communities — an infection from a manganese-zone creature might be different from a copper-zone infection.

---

## Infection as a System

### The Wound-Infection Pipeline

The bleed system already models wound physics. Infection is the companion system running on the same wound site.

1. **Wound occurs** — zone takes damage, begins bleeding (existing system)
2. **Pathogen introduction** — probability scales with wound severity, attacker's oral/limb microbiome load, and wound type (puncture introduces bacteria deep, slash exposes a surface, blunt may not breach the integument at all)
3. **Clotting and immune response** — the same wound site where clotting is progressing (existing system) is also where immune response activates. Clotting physically traps pathogens at the wound site. Immune cells are recruited by the same chemical gradients that trigger clotting.
4. **Infection resolution** — the immune system either contains the infection (pathogen load decreases over turns) or doesn't (infection spreads, affecting zone healing, potentially spreading to adjacent zones)

### Clade Differences in Infection

**Clade A:** Discrete wound sites clot quickly, trapping pathogens locally. Immune cells concentrate at the breach. Defense is focused and infrastructure-supported. Infection is an event at a specific location. If the immune system wins, the wound heals. If it loses, the infection is still localized (until it spreads through the vessel system to other organs — sepsis equivalent, which is catastrophic in closed circulation because the vessels carry the pathogen everywhere).

**Clade B:** Diffuse wound surfaces seep broadly. Pathogens enter across a wide area. Immune response is distributed — hemolymph bathes the wound surface with antimicrobial compounds. Harder to achieve high local immune cell concentration, but broader coverage means pathogens can't hide in a pocket the immune system missed. Infection is a diffuse state rather than a localized event. Harder to wall off cleanly. But also harder for the pathogen to overwhelm the system at any single point. Mineral encapsulation handles persistent pathogens.

### Clotting-Immunity Overlap

On Earth, the clotting cascade and inflammatory immune response share molecular signals. The same chemical gradients trigger both. This is already implicit in our bleed system — clotting progresses per zone when undamaged.

**Design implication:** A creature with better clotting (higher connective tissue in the wounded zone, per the existing bleed formula) also mounts faster local immune response. Connective tissue is the structural matrix that immune cells navigate through. More connective tissue = better clotting AND better immune cell deployment. The body map already encodes immune potential through connective tissue mass, even though we haven't built the immune system yet.

---

## Mutation as Immune Event

The mutation mechanic requires the player's body to accept foreign tissue from an incompatible clade. Immunologically, this should be impossible. The immune system should recognize cross-clade tissue as foreign and destroy it — transplant rejection, autoimmune attack.

The fact that it doesn't is another biological impossibility pointing at the demigod. The demigod's gift isn't just mutation. It's **immune tolerance of mutation**. Normal animals that eat cross-clade food digest it into raw nutrients and their immune system ensures nothing foreign survives intact. The player's body incorporates foreign tissue architecture without rejection.

**Potential gameplay expression:**
- Early mutations come with brief immune stress — a turn or two of impaired healing, mild stat penalties, as the immune system flares and then stands down
- As mutations accumulate, immune stress decreases — the system adapts to tolerating foreign tissue, or is gradually suppressed
- A heavily mutated player has a fundamentally altered immune profile — neither pure Clade A nor Clade B immune response, but something novel
- Native creatures that somehow encounter cross-clade tissue (eating a mutated player's corpse?) might experience immune complications that the player's demigod-gifted tolerance protects against

---

## Connections to Existing Systems

### Blood (existing)
Blood is already physical mass with volume tracking, loss from wounds, and regeneration. Blood is the carrier for both immune cells and hormones. The circulatory type (open vs closed) determines delivery geometry. The immune system operates through the same blood infrastructure the bleed system models.

### Clotting (existing)
Clotting progression per zone is already implemented. Clotting is the immune system's first responder — the same wound site, the same biological process. Connective tissue mass already influences clotting rate. Future immune function can read the same connective tissue values.

### Zone Destruction (existing)
Destroying a zone that contains immune organs (filter organs in the torso for Clade A) would reduce systemic immune capacity. The torso is already the vital zone. This makes the torso doubly important — both the organs that keep you alive and the organs that keep you healthy.

### Metabolism (planned)
Immune function costs calories. Mounting an immune response is metabolically expensive — immune cells proliferate, proteins are synthesized, inflammation increases local metabolic rate. An animal fighting an infection heals more slowly and gets hungrier. This connects to the hunger drive (existing), the healing system (existing), and the planned metabolism system.

### Mutation (planned)
Consumption tracking already exists. The immune tolerance question — why the player's body accepts foreign tissue — is a lore-level design decision with potential gameplay expression through transient immune stress during mutations.

### Cognition (existing)
The parallel between cognitive architecture and immune architecture is real but not forced:
- Clade A: centralized cognition + localized immune response + organ-based immune pattern recognition
- Clade B: distributed cognition + diffuse immune response + chemically-conditioned hemocyte sensitivity
Both parallels emerge from the same physical cause (circulatory geometry) rather than being mirror images of each other.

---

## Circulatory Type — Future Data Representation

The current binary flag (`circulationType: 'open'` or `'closed'`) works for the five implemented creatures. Future creatures with hybrid circulatory systems will need richer representation.

**Eventual structure might be per-zone:**
- Which zones have pressurized vessels (closed regions)
- Which zones rely on hemolymph bathing (open regions)
- Where hearts are located (and what they service)
- Whether tracheal supplementation exists (and in which zones)
- Hemocyanin concentration / quality (enriched hemolymph for Path 2 creatures)

Zone destruction that takes out a heart affects blood delivery downstream. A Clade B creature with a multi-heart system loses pressurized delivery to one region when a heart is destroyed — that region reverts to passive hemolymph bathing, reducing neural function in the affected ganglia.

This is not needed yet. The binary flag handles the current five creatures correctly. But the design should not assume the flag stays binary.

---

## Implementation Priority

None of this is implementable now. The build order when we get here:

1. **Metabolism** — metabolic rate from body map tissue composition. Caloric cost of neural tissue, muscle maintenance, healing. This comes first because everything downstream reads metabolic state.
2. **Gut / digestion** — caloric yield from different food types based on gut adaptation. Diet-switching costs. Fermentation time for herbivores. This is part of metabolism.
3. **Infection** — pathogen introduction at wound sites, immune response as automatic process (like clotting), resolution over time. Reads wound state from the existing bleed system.
4. **Immune architecture** — clade-specific immune strategies, connective tissue as immune infrastructure, possible organ-based immune pattern recognition for Clade A, mineral encapsulation for Clade B.
5. **Mutation immune tolerance** — transient immune stress during cross-clade mutations, decreasing with accumulated mutations.

Each layer adds to existing systems rather than replacing them. The bleed system doesn't change — infection runs alongside it on the same wound data. The hunger drive doesn't change — metabolism replaces the simplified version with physically derived rates. The body map doesn't change — immune function reads existing tissue composition values.

---

## What This Document Constrains

| Decision | Constrained by |
|---|---|
| Whether a new Clade B creature needs closed circulation | Peak local metabolic demand, not total neural mass |
| Immune response geometry | Circulatory architecture (open = diffuse, closed = localized) |
| Whether immune memory exists | Evolutionary design choice, not circulatory consequence |
| Infection risk per wound | Wound type (puncture vs slash vs blunt) + clotting speed + attacker microbiome |
| Gut efficiency for different diets | Microbiome adaptation, not a stat |
| Mutation acceptance | Demigod-gifted immune tolerance, not normal biology |
| Clade B circulatory diversity | Four evolutionary paths, none requiring convergence on Clade A's solution |
| Body size ceiling for tracheal Clade B | Air diffusion physics, raised but not eliminated by thick atmosphere |
| Small-body-size niche dominance | Clade B's open circulation is cheaper to maintain at small size |
| Visible immune history on Clade B | Mineral encapsulation nodules under integument |
