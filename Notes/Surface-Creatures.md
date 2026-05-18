# Surface Creature Designs — Marsh Archipelago

First-pass creature designs for the primary surface biomes. These six form a minimum viable ecosystem: two predator tiers, two herbivore strategies, one colonial chemotroph, and one ambush specialist. All are common, generalist-niche organisms — the baseline fauna the player encounters in the first hour.

Include this alongside Ecology-Foundations.md and Spawn-Design.md when implementing creatures.

---

## Design Principles

**Both clades are present in every biome.** No biome belongs to one clade. The player encounters Clade A and Clade B descendants side by side, filling similar roles through different means.

**Clade determines the feel, not the role.** Two herbivores from different clades are both herbivores — but one is readable, personality-driven, and navigates by chemical sense. The other is parallel-processing, vibration-sensing, and territory-efficient. The player learns the difference through experience, not labels.

**Each creature has a "ship today" AI path and a "build toward" AI vision.** The current AI column describes which existing behavior pattern the creature uses right now. The future AI column describes what it should eventually become. Nothing blocks on future work — every creature is playable with current tools.

**No creature here is niche or exotic.** These are all common animals. The weird specialists, deep-water oddities, and colonial superorganisms come later. These six are the deer, the rabbits, the wolves, and the coyotes of this world.

---

## Creature 1 — Clade A Meso-Predator

**Role:** The common surface predator. The first dangerous thing the player learns to deal with. Analogous to a fox, coyote, or dhole — a mid-sized social carnivore that hunts in varied terrain.

**Clade:** A

**Body plan:** Six limbs (three pairs). Front pair shorter, semi-dexterous. Thick textured skin — wrinkled, tough, hairless. Lower-slung body, broad through the midsection. Mobile ear-flaps that communicate attentional and emotional state. Two wide-set primary eyes, three smaller close-range eyes clustered near the ventral mouth. Mouth is on the underside.

**Size:** Roughly dog-sized. Low center of gravity.

**Senses:** Chemical sensing is dominant. Tracks prey by scent trail over long distances — follows the path the player walked, not a straight line to the player's current position. Vision is secondary, used for close-range engagement and threat detection. Navigates by building a chemical map of its environment layered with experiential memory.

**Cognition:** Centralized brain. Strong episodic memory. Recognizes individuals. Learns from prior encounters. Develops personal behavioral habits based on its history. Older individuals are meaningfully more dangerous than young ones — not larger, just smarter.

**Social behavior:** Flexible. Can hunt solo or in groups. Personality variance within the species:
- Pack-tendency: prefers groups of 3-6, coordinates with others, defers to a dominant individual.
- Lone hunter: operates solo, larger home range, avoids others of its kind except for mating.
- Wary: won't engage unless it has numerical or positional advantage. Breaks off if the situation shifts.

Social groups have clear dominance hierarchies. Reproductive roles are determined by social rank (sequential hermaphroditism — the subordinate individual in a pair becomes the gestating parent).

**Habitat:** Generalist. Crosses between forest, plains, wetland, and coastal biomes freely. Avoids deep water but tolerates shallow crossings. Follows prey rather than defending a fixed territory, though packs maintain loose home ranges anchored to denning sites.

**Behavior in play:** Commits to behavioral states and transitions cleanly between them. The player can learn to read the evaluation moment — the pause where it decides whether to chase, hold, or break off. Ear-flaps telegraph attention (forward-focused = locked on, splayed = alert/scanning, flattened = about to flee or submit). Tracks the player by scent, so visual stealth (hiding behind cover) is less effective than moving downwind or crossing water to break the trail.

**Current AI:** Gray wolf behavior. State machine: patrol → detect → chase → engage → break off. Pack coordination. Personality variants (wary, pack, lone). Crosses biome boundaries.

**Future AI:** Scent-trail tracking (follows the player's path history, not a straight line). Episodic memory (remembers prior encounters with the player — if it survived a fight, it behaves differently next time). Age-based competence scaling. Ear-flap state visualization on the sprite.

---

## Creature 2 — Clade A Apex Predator

**Role:** The large, dangerous version of Creature 1. Same lineage, different scale and strategy. Analogous to the relationship between a black bear and a short-faced bear, or a coyote and a dire wolf. The player's Creature 1 instincts transfer, but the margin for error disappears.

**Clade:** A

**Body plan:** Same six-limb, three-pair layout as Creature 1 but significantly larger and heavier. The front manipulative limbs are thicker, more powerful — less dexterous, more forceful. Skin is denser, more heavily textured. Ear-flaps are larger and more expressive. The overall proportions are shifted toward bulk — broader skull, deeper chest, heavier rear limbs.

**Size:** Large. Substantially bigger than Creature 1 — think the size jump from a coyote to a bear.

**Senses:** Same chemical-dominant sensory profile as Creature 1 but with greater range and sensitivity. Detects the player from significantly further away. The player may be tracked for many tiles before the first visual contact. Where Creature 1 stumbles into the player at medium range, Creature 2 knew the player was coming well before the player knew it was there.

**Cognition:** Same centralized episodic architecture as Creature 1, but with more accumulated experience (longer-lived, fewer threats, more encounters survived). Excellent spatial memory — remembers terrain features, denning sites, water sources, and productive hunting areas over long periods.

**Social behavior:** Predominantly solitary. Occasionally found in mated pairs. Rarely in small groups (2-3). When groups occur, they are more dangerous than an equivalent number of Creature 1s — these are experienced, large-bodied individuals coordinating, not a loose pack of generalists. Dominance hierarchy still applies but the hierarchy is simpler with fewer individuals.

**Habitat:** Same generalist cross-biome profile as Creature 1 but with a preference for denser cover and terrain with good chemical-sensing conditions (humid areas, sheltered valleys, forest interiors). More common in deep forest and heavy wetland than on open plains. Maintains a larger home range than Creature 1.

**Behavior in play:** Same readable state-machine structure as Creature 1. The player's existing skills transfer — they can read the ear-flaps, predict the evaluation moments, exploit the transitions. But the detection range is much longer (the player is detected before they're aware of the creature), the engagement is harder to survive (more HP, more damage), and breaking contact is harder (better tracking persistence). The skill check isn't "can you read this creature" — it's "can you read it fast enough when you were already being hunted."

**Current AI:** Dire wolf behavior. Same state machine as Creature 1 with higher stats, longer detection range, more solo tendency, lower group probability.

**Future AI:** Extended scent-detection radius. Preemptive positioning (moves toward the player's predicted path based on scent trail direction, not just following directly behind). Rare pack encounters that use simple coordination — flanking, cutting off escape routes. Memory of player encounters persists longer and has stronger behavioral effects.

---

## Creature 3 — Clade B Small Herbivore

**Role:** The common small prey animal. Abundant, fast-reproducing, efficient grazer. Analogous to rabbits, voles, or small ground-feeding birds — the baseline food source for both clades' predators. The first Clade B creature the player encounters and the first place they unconsciously notice that something about this animal works differently.

**Clade:** B

**Body plan:** Eight limbs (four pairs). Front two pairs are long, thin, and independently active — these are the grazing limbs, tipped with fine manipulative structures that clip vegetation in parallel. The rear two pairs are robust and locomotory, built for rapid bursts of speed. The body can curl defensively (armadillo-like) but the default posture is low and spread, with the front limbs constantly working the ground ahead of it. Semi-flexible integument — the ancestral cuttlebone-meets-fingernail material, kept relatively thin in this lineage.

**Size:** Small. Roughly the size of a large rat or small rabbit. Low profile.

**Senses:** Vibration is dominant. Mechanoreceptors across the body surface, concentrated in the front limbs (which are always in contact with the ground), detect approaching footsteps at considerable range. The four diamond-pattern eyes are good at motion detection — any movement within close range triggers alerting behavior. Together, vibration + motion detection make this animal extremely difficult to approach undetected.

**Cognition:** Distributed ganglia. The parallel grazing behavior the player sees — multiple front limbs independently clipping different plant fibers simultaneously — is the Clade B motor architecture made visible. The animal doesn't "decide" to move each limb. Each limb's local ganglion cluster handles its own foraging motor program. The animal as a whole is simultaneously grazing with its front half and monitoring for threats with its rear half.

Pattern memory, not episodic. It doesn't remember the player specifically. It has deep stimulus-response libraries for its home patch — it knows every vibration signature of the local ground, so a novel vibration (player footsteps) stands out instantly. In unfamiliar terrain, its detection is measurably worse.

**Social behavior:** Not social in the Clade A sense (no hierarchies, no individual relationships). Found in loose aggregations around good feeding sites — multiple individuals in the same area because the food is there, not because they chose each other. Semi-synchronization occurs passively when individuals are close — nearby grazers tend to flee in the same direction at the same moment, not because of a decision but because their ganglion clusters are picking up each other's alarm signals. Looks like coordinated group flight. It's actually chemical signal bleed-through.

Reproduction is predominantly fragmentation when food is abundant. A productive meadow fills with near-clones rapidly. Sexual reproduction kicks in when conditions shift — seasonal changes, habitat disruption, population pressure.

**Habitat:** Anywhere with ground-level vegetation. Most common in plains and wetland margins. Present in forest clearings, coastal scrub, and fungal zone edges where photosynthetic ground cover still exists. Absent from deep water, bare rock, and dense canopy where ground vegetation is absent.

**Behavior in play:** Flees when approached. High dodge chance. Needs to be cornered against terrain to be killed reliably. Moves in quick, efficient bursts — the locomotory rear limbs fire hard, the animal covers ground fast, then stops and resumes grazing almost immediately. The player notices the constant independent limb movement during grazing, which is their introduction to the Clade B "doing several things at once" feel. Doesn't feel threatening. Feels *busy*.

**Current AI:** Hare behavior. Always flee, never aggro, high dodge, needs to be cornered.

**Future AI:** Vibration-based detection radius that scales with player movement speed (running = detected from far, creeping = detected from close, standing still = nearly undetectable). Home-range familiarity bonus to escape pathing — in familiar territory, it always finds the best escape route; in unfamiliar terrain, it sometimes gets cornered more easily. Loose-aggregation flight synchronization — when one flees, nearby individuals flee simultaneously in the same direction.

---

## Creature 4 — Clade A Large Herbivore

**Role:** The large amphibious grazer. Crosses land and water freely. Eats vegetation and supplements with mineral-rich water and substrate — a facultative chemotroph. Analogous to a hippo, manatee, or giant ground sloth occupying a semi-aquatic niche. This is the creature that makes coastlines and shallows feel inhabited.

**Clade:** A

**Body plan:** Six limbs (three pairs), same ancestral layout as Creatures 1 and 2 — the player can see the family resemblance. The front manipulative pair is adapted for digging and pulling vegetation — broader, flatter, almost paddle-like, useful for both rooting through substrate on land and sculling through water. The body is heavy, barrel-shaped, built for thermal stability in water and steady locomotion on land. Skin is the same thick, textured, wrinkled material as the predators but thicker and more water-adapted — possibly slightly mucousy or oily on the surface for water resistance. Ear-flaps are present but smaller and less mobile than the predators' — this lineage doesn't need complex social signaling.

**Size:** Large. Significantly bigger than Creature 2. The biggest Clade A animal the player encounters on the surface.

**Senses:** Chemical sensing is dominant, same as all Clade A, but adapted for aquatic conditions — reads dissolved minerals in water as easily as airborne scent on land. Uses this to locate mineral-rich water sources and nutrient-dense substrate. Vision is better developed than in the predators (larger primary eyes, better distance vision) because this animal operates in open terrain and water where visual scanning is useful.

**Cognition:** Centralized brain. Strong spatial memory — remembers productive feeding sites, safe water crossings, and seasonal patterns across a large home range. Not aggressive but not passive either. Has the full Clade A episodic memory architecture, which in an herbivore manifests as: it remembers threats, avoids areas where it's been attacked before, and recognizes individual predators. An older individual knows which areas are dangerous and when, and adjusts its movement patterns accordingly.

**Social behavior:** Loosely gregarious. Found alone or in small groups (2-4). Not hierarchical the way the predators are — the sequential hermaphroditism still operates but social dynamics are simpler because there's less competition pressure. Individuals in a group are aware of each other and will move together but don't coordinate tactically.

**Habitat:** Anywhere with water access. Most common along coastlines, in shallows, in wetlands, and along rivers/streams. Moves onto land to graze vegetation and back into water to forage for minerals, cool down, or avoid terrestrial predators. Can cross deep water between islands — this is one of the mechanisms by which Clade A genes spread across the archipelago. Present in every biome that has a water margin.

**Behavior in play:** Not aggressive by default. Moves slowly through its territory, alternating between land grazing and water foraging. If attacked, it's tanky — large HP pool, thick skin — but its primary defense is moving into water where most predators can't follow effectively. Doesn't flee in panic the way Creature 3 does. Evaluates the threat (readable Clade A state machine), decides whether to stand ground or move to water, and commits. Experienced individuals might be more cautious (move to water preemptively when they detect the player at range via chemical sensing).

The player sees this creature wading through shallows, rooting through coastal mud, and occasionally hauling itself onto land to graze. It's ambient life that makes the water margins feel alive. Combat is possible but not rewarding relative to the effort — it's tough and doesn't drop anything valuable (initially). It exists to populate the world, not to be a combat target.

**Current AI:** Crab behavior (water-locked movement, attacks adjacent from water edge). Adapted to be semi-aquatic — prefers water but freely transitions to land.

**Future AI:** True amphibious pathing (land/water transition is seamless, not a special case). Water-as-refuge behavior (retreats to water when threatened, stays there until threat passes). Mineral-foraging animation in water (stationary, rooting through substrate). Chemical-sensing detection of player at range. Memory of dangerous areas — avoids locations where it's been attacked in prior encounters.

---

## Creature 5 — Clade B Colonial Chemotroph

**Role:** The colonial swarm. The most important Clade B creature in the game because it teaches the player how synchronization works. A cluster of small organisms that are passive individually and lethal collectively. Analogous to army ants, siphonophores, or slime mold aggregation — individual units that become a superorganism through proximity.

**Clade:** B

**Body plan:** Eight limbs (four pairs), same ancestral layout as Creature 3. But the proportions have shifted for the colonial lifestyle. The front sensory limbs are oversized, constantly active — drumming, tapping, vibrating against the ground and air. These are the communication organs. Each individual is a relay node in a distributed network, and the front limbs are how it broadcasts and receives signals. The rear locomotory limbs are stubby — individual movement speed is low because the colony coordinates spatial coverage collectively; no single node needs to be fast.

The integument has thinned and become slightly porous compared to other Clade B lineages. Faintly translucent in patches, with visible internal chemical activity — subtle color shifts as metabolic processes run. Not bioluminescent, just active-looking. This thinning is a trade-off: worse physical protection, better chemical signal transmission between nodes. The colony architecture requires permeability.

**Size:** Individual node is small-to-medium. Roughly knee-height. Unremarkable alone. The colony can be any size — a handful of nodes in a small cluster or dozens spread across a cavern floor.

**Senses:** Vibration and chemical signaling. Each node reads ground vibration through its limbs and transmits position/threat data to nearby nodes via rapid limb-drumming against substrate (seismic pulses through ground) and body-surface vibration (low hum through air). Underground, seismic signals propagate through tunnel systems over long range. Above ground, range is shorter but still effective across the diameter of a typical colony cluster.

The player hears this as an ambient hum or buzz that intensifies as more nodes activate and synchronize. The hum IS the colony thinking. Louder = more network attention allocated to the player.

**Cognition:** Distributed ganglia within each node (standard Clade B), plus inter-node synchronization (the colonial scaling property). A single node has limited individual intelligence — stimulus-response pattern matching within its local sensory range. But nodes share information through chemical and vibrational signaling, building a collective awareness that no individual possesses. The colony "knows" where the player is even if no single node can see them — the information propagates through the network.

Colony intelligence scales with node count and proximity. A sparse, spread-out colony responds slowly (signal propagation delay between distant nodes). A tight cluster responds almost instantly (short signal paths, fast consensus). The colony doesn't make complex tactical decisions. It allocates attention, coordinates encirclement, and converges. The emergent behavior is sophisticated. The individual computation is simple.

**Harm mechanism:** Enzymatic contact digestion. These are chemotrophs — they break down mineral substrates using secreted enzymes. The same enzymatic toolkit works on organic matter. The "attack" isn't a strike or a bite. Each node in contact with the player secretes caustic metabolic compounds through its porous integument. One node is a mild chemical irritant. Multiple nodes in simultaneous contact is corrosive — the player is being metabolically processed. Damage scales with the number of adjacent nodes. This is poison-over-time that intensifies with saturation, not burst damage.

**Social behavior:** Colonial by default. Individual nodes don't have personalities, preferences, or individual behavioral variation — they're nodes in a network. Genetically identical within a colony (products of fragmentation). The colony is the organism. Individual nodes are expendable.

Inter-colony interactions are territorial. Two colonies occupying adjacent mineral substrates will slowly compete — expanding into each other's territory, depleting resources at the boundary, starving the other's periphery. These territorial wars are invisible on a turn-by-turn scale. On a long timescale, they shape which colonies expand and which contract.

**Habitat:** Wherever the mineral chemistry supports chemotrophy. Most common in fungal/chemotrophic zones (manganese-rich, copper-rich areas). Also present underground throughout. Absent from mineral-depleted zones and open water. The colony takes on the color of its local mineral substrate — purple-gray in manganese zones, blue-green in copper zones, rusty ochre in iron zones.

**Behavior in play:** Passive when the player is distant. Nodes sit still, processing substrate, limbs drumming idly. As the player approaches, the nearest nodes detect the vibration and begin signaling. The hum rises. More nodes activate. The colony begins to coalesce — nodes slowly drift toward the player's position, closing gaps, forming a tighter cluster. When critical density is reached (enough nodes within synchronization range), the colony shifts to convergence — coordinated encirclement, cutting off escape routes, closing to contact range. Once nodes are adjacent to the player, enzymatic damage begins and accumulates.

The player's options: leave before the coalesce phase triggers. Move fast enough to stay ahead of the convergence. Kill enough nodes to drop the colony below synchronization threshold (the remainder lose coordination and revert to passive). Don't let them surround you.

**Current AI:** Mushroom swarm behavior. Passive → coalesce (slow drift toward player) → surround trigger (enough nodes within range) → mob (convergence and contact poison). Zero direct damage, touch-based poison only.

**Future AI:** Multi-action-per-turn system where the synchronized colony gets N actions proportional to active node count. Each action is a communication/relay/reposition step — the colony "thinks faster" with more nodes online. Seismic ping propagation — nodes that detect the player relay position to nodes that can't detect the player, with propagation delay based on distance through the network. The player can learn to break line-of-sight to the nearest node and reposition before the update propagates. Ambient hum intensity as a direct audio cue for colony attention level. Colony fragmentation — if enough nodes are killed, the colony splits into sub-colonies that act independently until they re-establish signal contact.

---

## Creature 6 — Clade B Solitary Ambush Predator

**Role:** The ambush specialist. Territory-bound, vibration-sensing, lethally fast within its home range and disengaged outside it. Analogous to a trapdoor spider, mantis shrimp, or moray eel — devastating in its patch, not a threat beyond it. The creature that teaches the player that Clade B isn't just "the swarm clade." This is an individual Clade B predator, and it fights differently from everything else.

**Clade:** B

**Body plan:** Eight limbs (four pairs), same ancestral layout as Creatures 3 and 5. But this lineage diverged from the colonial branch — it evolved to suppress inter-organism synchronization completely. Fully solitary. The integument has thickened and stiffened, the opposite of Creature 5's thinning. The layered cuttlebone-like material has become tough, segmented armor — not impenetrable plate, but genuinely resistant. Heavier and less flexible than other Clade B descendants.

The front sensory limbs are long, held forward and low, in constant contact with the ground. Densely packed with mechanoreceptors. These are prey-detection arrays — they read ground vibration with extreme precision. The rear locomotory limbs are powerful, built for explosive short bursts. The overall body shape is compact and low — this animal crouches.

The four eyes are larger than in other Clade B creatures. Better motion detection at medium range. The eyes are the secondary confirmation system — vibration detects approach, vision confirms target identity. The mouthparts are adapted for predation: stronger jaw structures, capable of puncturing.

**Size:** Medium. Comparable to Creature 1 (the meso-predator). Not large. Doesn't need to be — the ambush compensates for raw size.

**Senses:** Vibration is primary with a specificity that other Clade B creatures don't match. This animal has spent its life learning the vibrational signature of every feature in its home territory — every rock, root, slope, and regular animal path. A novel vibration (player footsteps) is instantly recognized as foreign against this memorized baseline. Detection range scales with how much vibration the player generates: running is loud, walking is moderate, standing still is nearly undetectable.

Vision is secondary but better developed than in Creatures 3 or 5. Good motion detection at medium range. Poor at detail and distance. The animal doesn't identify prey visually — it identifies prey by vibration and confirms with visual motion.

**Cognition:** Distributed ganglia, standard Clade B. The inter-organism synchronization is suppressed — this lineage is fully individual. What it retains from the Clade B architecture is parallel motor processing: the front and rear limb pairs operate on independent motor programs simultaneously. During a strike, the front limbs lunge and grab while the rear limbs brace and reposition for withdrawal — not sequentially, but at the same time. There is no "wind-up" or "commitment" phase the way Clade A predators have. The strike and the escape preparation happen in the same action.

Pattern memory is extreme within home territory. Every vibration signature memorized, every surface feature known. In familiar ground, reaction time is near-instantaneous — the stimulus matches a stored pattern and the response fires without deliberation. In unfamiliar ground, every stimulus is novel. Response time degrades. The animal doesn't become confused — it becomes cautious, slow, and ineffective. It knows it doesn't know, and it retreats.

**Habitat:** Any biome with dense cover or terrain complexity — places where an ambush predator can set up without being seen. Forest undergrowth, rocky outcrops, fungal zone thickets, cave entrances, root systems. Not found in open terrain (plains, open coastline) where there's nothing to hide in. Prefers the edges between biome types where terrain complexity is high.

Home range is small — maybe 8-12 tiles radius. Every tile in that radius is intimately known. The animal rarely leaves. If it does (forced out by a larger predator or environmental disruption), it must establish a new territory by slowly re-mapping the vibration profile of a new patch, during which time it's vulnerable.

**Behavior in play:** The player walks into its territory and may not notice it until the ambush triggers. The animal has been tracking the player's approach by vibration for many tiles, repositioning to an optimal ambush point. The attack is fast: a lunge from concealment, striking and beginning to withdraw in the same action. If the ambush succeeds (player takes significant damage), the creature repositions for a second strike or waits for the player to bleed/weaken. If the ambush fails (player dodges or is too strong), the creature disengages quickly and resets to a new ambush position within its territory. It doesn't chase. If the player leaves the territory, the encounter is over. The animal doesn't pursue.

The player learns: pay attention to terrain type (dense cover = possible ambush territory). Move carefully in complex terrain. Recognize when they've entered a territory. Standing still reduces vibration-based detection. Leaving the territory ends the threat. The creature is dangerous because of where it is, not what it is.

**Current AI:** No direct equivalent in the current codebase. Closest approximation: a basic chase AI with short leash range (8-12 tiles from home position), high initial aggression, and immediate disengage when the player leaves the radius. Ships as a territorial predator that attacks on sight within its range and gives up outside it.

**Future AI:** Vibration-based detection radius scaling with player movement type (sprint > walk > creep > still). Ambush positioning — the creature preemptively moves to an intercept point on the player's predicted path rather than charging directly. The parallel-behavior system: simultaneously attacking and repositioning, no readable state transitions, no "wind-up" that the player can exploit for timing. Home-territory competence scaling — tiles within its established range get fast reflexive responses; tiles outside range get slow cautious behavior. If the player forces it out of territory, it becomes noticeably less dangerous.

---

## Ecosystem Dynamics

**Food web:** Creatures 1 and 6 prey on Creature 3. Creature 2 preys on Creatures 3, 4 (young or weakened individuals), and Creature 1. Creature 5 doesn't participate in the predator-prey web — it's a chemotroph that processes mineral substrate, not organic prey. Creature 4 grazes vegetation and forages minerals. Creature 3 grazes vegetation.

**Niche overlap between clades:** Creatures 1 and 6 occupy the same "mid-sized predator" niche but with completely different strategies. The player's anti-Creature 1 skills (read the state machine, exploit transitions, break scent trail) do not work against Creature 6 (no states to read, no trail to break, vibration-based). The player's anti-Creature 6 skills (spatial awareness, territory recognition, movement speed management) do not work against Creature 1 (it follows you anywhere, it remembers you). This asymmetry is the core of the two-clade system as experienced in gameplay.

**Biome distribution:**
- **Forest:** Creatures 1, 2, 3, 6. Dense cover favors both the scent-tracking persistence predators and the ambush predator. Small herbivores graze clearings.
- **Plains/wetland:** Creatures 1, 3, 4. Open terrain favors pursuit predators and the large amphibious grazer. Ambush predators (6) are rare in open ground. Small herbivore aggregations are largest here.
- **Fungal/chemotrophic zones:** Creatures 3, 5, 6. The colonial chemotroph dominates. Ambush predators set up at the edges. Small herbivores graze whatever photosynthetic ground cover exists at the margins.
- **Coastline/shallows:** Creatures 1, 3, 4. The large amphibious grazer is most common here. Predators patrol the water margin. Small herbivores on the shore.
- **Underground:** Creatures 5, 6 (primarily). Colonial chemotrophs and ambush predators in tunnel systems. Surface predators and herbivores are rare or absent underground.

**Danger pacing:** Creature 3 is everywhere and harmless (introduces Clade B). Creature 1 is common and moderately dangerous (teaches Clade A combat). Creature 5 is zone-specific and dangerous in groups (teaches synchronization). Creature 6 is uncommon and dangerous by surprise (teaches territory awareness). Creature 2 is rare and very dangerous (tests mastery of Clade A reading). Creature 4 is common and not worth fighting (ambient life, world-building).
