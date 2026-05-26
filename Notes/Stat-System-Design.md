# Stat System Design

Replacement for the D&D-derived STR/DEX/CON/INT/PER attribute system. Stats now describe what an organism physically *is* — its body, its senses, and its neural architecture — rather than abstract RPG categories. Include this alongside Body-Sim-Design.md, Mutation-Design.md, and Ecology-Foundations.md when implementing.

---

## Why the Old System Doesn't Work

The old five stats (STR, CON, DEX, INT, PER) are human adventurer categories. They bundle unrelated things: DEX covers dodge, stealth, crit chance, and hand-eye coordination — four different physical properties jammed into one number. CON is "toughness" disconnected from body mass. PER is "awareness" without specifying awareness of *what* through *which sense*. INT is "smartness" without distinguishing between different cognitive architectures.

On a planet with two clades that see, think, and process the world through fundamentally different biological hardware, these abstractions hide the things that actually matter. A Clade A predator with PER 7 and a Clade B predator with PER 7 are doing completely different things with completely different organs. That needs to be visible in the stat block, not buried under one number.

---

## The New Stats

### Physical Stats (Universal)

Every creature has these. They describe the body itself.

**SIZE** — Body mass. Not height, not length — total physical bulk.

What it determines:
- Zone HP pools in the body sim (bigger zones have more HP)
- Total HP (sum of zone HPs, all scaling with Size)
- Food cost (bigger body, more calories to maintain)
- Target profile (bigger = easier to hit, harder to miss)
- Stealth penalty (bigger = harder to hide)
- Carrying capacity (bigger frame can bear more weight)
- Intimidation (future social mechanic)
- Terrain interaction (future — can't fit through tight spaces at high Size)

What it doesn't determine: how hard you hit (that's Strength), how fast you move (open question), how tough your skin is (that's armor from the body sim zones).

Scale: 1-10 where 1 is prawn-sized and 10 is the largest thing on the planet. The small herbivore is Size 2. The meso-predator is Size 4. The large herbivore is Size 7. Player starts around Size 4 and can grow through mutation.

**STRENGTH** — Muscular force relative to body size. Not absolute force — a small creature with high Strength is compact and disproportionately powerful. A large creature with low Strength is bulky but soft.

What it determines:
- Damage modifier (not primary damage — primary damage comes from Size/mass, the weapon/limb used, and the target's material properties. Strength modifies that baseline up or down.)
- Grapple/hold ability (future)
- Carrying capacity modifier (supplements Size)
- Armor requirements (heavy armor needs minimum Strength)
- Environmental interaction (future — breaking through obstacles, digging, climbing)

What it doesn't determine: HP (that's Size), accuracy (that's senses + processing), speed (open question). And it doesn't determine base damage on its own — damage is physics. Mass (Size) of the attacker, what body part or weapon struck, and the material interaction at the impact site (claw vs flesh, hook vs armor, blunt vs bone) are the primary damage inputs. Strength scales that result.

Scale: 1-10 relative to the creature's own body. A constrictor snake might be Size 2, Strength 8 — tiny but immensely powerful per unit mass. The large herbivore might be Size 7, Strength 3 — enormous but not built for fighting.

---

### Senses (Individually Tracked)

Each sense is its own stat. A creature can have any combination. Zero in a sense means that sense doesn't exist for this creature. New senses can be added to the system later without restructuring.

Each sense is not just a "detection range number." Each sense creates its own layer of world-information for the creature. Higher levels don't just mean "detect further" — they mean richer, more detailed information from that sense.

**CHEMICAL** — Chemoreception. Smell, taste, reading dissolved compounds in air and water.

Gameplay layer: a scent map. Creatures and the player leave chemical trails on tiles they've visited. Chemical sense lets you read those trails. Higher levels mean longer trail persistence, wider detection range, and richer information (from "something was here" up to identifying specific creatures and their state). The exact thresholds and detail tiers are open — to be determined through implementation and playtesting.

Clade A ancestors are high Chemical. Most Clade A descendants start with Chemical 4-7. Clade B descendants can evolve Chemical too but most start lower (1-3).

**VIBRATION** — Mechanoreception. Reading ground tremors, footsteps, pressure changes, body movements through substrate contact.

Gameplay layer: movement detection. Any creature that moves generates vibration. Vibration sense lets you detect movement through the ground, potentially through walls and obstacles. Higher levels mean wider range, better identification (from "something moved" to recognizing specific creature types by signature), and detection of subtler stimuli. The exact thresholds and detail tiers are open — to be determined through implementation and playtesting.

Clade B ancestors are high Vibration. Most Clade B descendants start with Vibration 4-7. Clade A descendants can evolve Vibration but most start at 0-2.

**VISUAL** — Eyes. Light-based detection. Pattern recognition, motion detection, color discrimination, distance assessment.

Gameplay layer: standard FOV (field of view). The existing sight system. Visual determines how far and how clearly you see. Higher levels mean longer FOV range, better detail at distance, and ability to read more information from what you observe. The exact thresholds are open.

Both clades have eyes. Visual varies by creature and lifestyle, not by clade. The ambush predator has moderate-high Visual (needs to confirm targets). The colonial chemotroph has low Visual (barely uses eyes). The meso-predator has moderate Visual (secondary sense, chemical is primary).

**Future senses (not implemented yet, but the system accommodates them):**
- Thermal — detecting heat signatures. Useful underground, at night, through cover.
- Echolocation — active sonar. Requires the creature to emit sound, which reveals its own position.
- Electromagnetic — detecting bioelectric fields in water. Aquatic niche.
- Pressure — atmospheric pressure changes. Weather prediction, altitude sensing.

Each would follow the same pattern: its own stat, its own gameplay layer, low-to-high detail scaling.

---

### Processing (Individually Tracked)

Two modes of neural processing. Not "intelligence" as a single axis. Different architectures that are good at different things.

**CENTRAL** — Single-brain efficiency. The centralized nervous system's capacity for deep, integrated processing.

What it's good at:
- Episodic memory (remembering specific events, recognizing individuals)
- Generalization (applying lessons from one context to a novel situation)
- Novel-situation handling (figuring out something you've never encountered before)
- Targeted zone attacks in the body sim (understanding anatomy well enough to aim for specific zones)
- Information extraction (the examine/look system — higher Central reveals more detail about what you're observing)
- Abstract reasoning (future — puzzle solving, tool use, communication)

What it's not good at:
- Reflexive reaction to familiar patterns (that's Distributed)
- Parallel motor execution (that's Distributed)
- Rapid-fire multi-stimulus response (that's Distributed)

Scale: 1-10. Most Clade A descendants have Central 4-8. Most Clade B descendants have Central 1-4. Advanced Clade B descendants that evolved central planning might reach Central 5-6. The player starts with Clade A-level Central (5-6).

**DISTRIBUTED** — Multi-ganglion efficiency. The distributed nervous system's capacity for parallel, pattern-matched processing.

What it's good at:
- Pattern-matched reflexes (reacting instantly to a recognized stimulus)
- Parallel motor execution (multiple limb groups acting independently and simultaneously)
- Territory-optimized performance (reaction speed scales with familiarity — a Distributed creature in known territory is dramatically faster than in unknown territory)
- Simultaneous threat assessment (tracking multiple nearby entities without context-switching)
- Graceful degradation under damage (body sim — damage to one segment doesn't impair processing in other segments)

What it's not good at:
- Novel situations (pattern library has no match, response is slow and cautious)
- Long-term memory of specific events (no episodic narrator)
- Targeted anatomical reasoning (can't plan a precise aimed strike the way Central can)
- Generalizing across contexts (a solution that worked in one territory doesn't transfer)

Scale: 1-10. Most Clade B descendants have Distributed 4-8. Most Clade A descendants have Distributed 0-1 (vestigial spinal reflexes at best). Advanced Clade B descendants with colonial synchronization might have Distributed 8-10. The player starts with Distributed 0 and can gain it through mutation — which is the biologically impossible cross-clade signal.

**The cross-clade impossibility:** No native creature has both Central 5+ AND Distributed 5+. A Clade B organism might evolve Central 4-5 over time (octopus-level), but alongside Distributed 6+, the Central is always the secondary system. A Clade A organism cannot develop Distributed processing at all — the architecture isn't there. The player accumulating both through mutation is the thing that shouldn't exist on this planet.

---

## Creature Stat Examples

**Clade A Meso-Predator:**
Size 4, Strength 4, Chemical 6, Vibration 1, Visual 3, Central 5, Distributed 1

**Clade A Large Predator:**
Size 6, Strength 6, Chemical 7, Vibration 1, Visual 4, Central 6, Distributed 1

**Clade A Large Herbivore:**
Size 7, Strength 3, Chemical 5, Vibration 0, Visual 5, Central 4, Distributed 0

**Clade B Small Herbivore:**
Size 2, Strength 1, Chemical 2, Vibration 5, Visual 4, Central 2, Distributed 4

**Clade B Colonial Chemotroph (per node):**
Size 2, Strength 1, Chemical 1, Vibration 6, Visual 2, Central 1, Distributed 7

**Clade B Solitary Ambush Predator:**
Size 4, Strength 5, Chemical 2, Vibration 7, Visual 5, Central 2, Distributed 5

**Player (starting Clade A body):**
Size 4, Strength 3, Chemical 5, Vibration 0, Visual 4, Central 5, Distributed 0

**Player (late game, heavily mutated from both clades):**
Size 5, Strength 5, Chemical 6, Vibration 4, Visual 5, Central 6, Distributed 3
(This stat block is biologically impossible for any native organism.)

---

## Derived Effects

These are gameplay consequences that emerge from stat combinations. Not separate numbers the player tracks — just how the stats express in play.

**Detection range:** Each sense provides its own detection layer. The creature's "awareness bubble" is the union of all its sense ranges. Chemical gives a trail-map extending behind where things have been. Vibration gives a proximity pulse around where things are moving. Visual gives a forward cone of identification. A creature can be detected by one sense and not another — you might smell something you can't see, or feel footsteps from something you can't smell.

**Melee damage:** Physics first. Size (mass) of the attacker, the body part or weapon used, and the material interaction at the impact point (claw vs flesh, blunt vs bone, hook vs armor) determine base damage. Strength modifies the result — a stronger creature hits harder than an equally-sized weaker one, but a Size 7 creature with Strength 2 still hits harder in absolute terms than a Size 2 creature with Strength 8, because mass is mass. The body sim's attack source zone determines what you're hitting with and whether that body part is functional.

**Information from Look/Examine:** Central processing determines how much detail you extract from observation. Low Central: "A creature is here." Medium Central: "A predator with six limbs, wounded." High Central: "A meso-predator, left mid-limb destroyed, bleeding, favoring right side, likely to flee."

**Targeted zone attacks:** Central processing + relevant sense. You need the Central capacity to understand anatomy AND the sensory acuity to perceive the target zone. High Central, low senses: you know where to aim but can't see clearly enough. High senses, low Central: you see everything but can't identify the weak point.

**Stealth:** Size inverted (primary — smaller is harder to see) combined with understanding of enemy senses. A creature with high Central can model what the enemy detects and avoid those channels. Sneaking past a Chemical-dominant creature means staying downwind. Sneaking past a Vibration-dominant creature means moving slowly. The player's knowledge of enemy sense profiles (from the examine system) feeds into stealth strategy.

**Territory effectiveness (Clade B):** Distributed processing provides a reaction speed bonus within familiar territory. The bonus scales with how high Distributed is and how long the creature has been in that territory. Outside familiar territory, Distributed still provides parallel motor coordination but loses the pattern-matched reaction speed.

---

## Dodge — Open Question

The old model was dodge = Size inverted (small = hard to hit). With the body sim, "dodge" might not be a single number anymore. When an attack is made:

1. Attacker rolls accuracy (based on their senses + Central processing).
2. Defender's profile determines hit chance — Size is the dominant factor (bigger target = easier to hit).
3. If hit, zone selection determines where (from body sim target weights).
4. Damage applied to that zone.

"Dodge" in this model is really just "the attack missed entirely" — which is the attacker's accuracy check failing against the defender's Size-based target profile. A small creature is hard to hit not because it's "dodging" but because there's physically less of it to connect with.

Distributed processing could contribute a small modifier — parallel motor evasion, limbs pulling away reflexively — but this might be unnecessary complexity. Or it could be the thing that makes Clade B creatures feel different to fight: at the same Size, a Clade B creature with high Distributed is slightly harder to land a clean hit on because its body segments react independently to incoming attacks. Each ganglion cluster flinches its local segment without waiting for central authorization.

This needs playtesting to determine whether it matters or is just noise on top of the Size-based hit chance.

---

## Speed — Open Question

Speed is not currently a stat. Movement in the turn-based system is "everyone gets one action per turn." Speed differences could be expressed as:

- **Turn order priority** (faster creatures act first each round)
- **Occasional extra actions** (a fast creature sometimes gets two moves in one round — but this is the "multiple attacks per turn" problem we already decided against)
- **Movement distance** (fast creatures move 2 tiles per turn, slow creatures move 1 — simple, legible, but changes the tactical geometry significantly)
- **Disengage chance** (fast creatures can break contact more reliably)
- **Not a stat at all** — speed is emergent from Size (small things are quick) and the situation (injured locomotion zones slow you down)

If speed becomes a stat, it probably derives from Size (inverted — small is fast) and Strength (powerful legs cover ground faster) rather than being an independent allocation. This avoids the old DEX problem of one stat doing too many unrelated things.

Decision deferred until movement mechanics are revisited.

---

## Interaction with Existing Systems

### Body Sim
Zone HP pools scale with Size. Attack damage scales with Strength via the attack source zone. Damaged locomotion zones reduce movement. Damaged sensory zones reduce the corresponding sense stat temporarily. Central processing enables targeted zone attacks. Distributed processing provides per-segment independent evasion (if implemented).

### Mutation
Eating creatures grants stat increases in the consumed creature's strong stats. Eating Clade A creatures increases Chemical, Central. Eating Clade B creatures increases Vibration, Distributed. Eating large creatures increases Size. Eating strong predators increases Strength. The mutation system reads these stats directly — no translation layer needed.

Cross-clade mutations are visible in the stat block: a player with both Chemical 6 and Vibration 4, or both Central 5 and Distributed 3, is displaying a profile that no native organism can have.

### Spawn System
Creature stats are defined per creature type, not generated randomly (for now). All meso-predators have the same stat block. Variance between individuals (if added later) would be small random modifiers on top of the base, not full random generation.

### Combat
Accuracy is attacker's relevant sense + Central processing vs defender's Size-based target profile. Damage is Strength * attack zone modifier. The old derived combat stats (accuracy %, dodge %, crit %) are replaced by direct stat interactions resolved through the body sim.

### AI
Detection behavior reads the creature's highest relevant sense. Chemical-dominant creatures track by scent trail. Vibration-dominant creatures detect by movement proximity. Visual-dominant creatures use line-of-sight. AI already has clade data flagging sensing mode — the sense stats make that quantitative instead of just tagged.

---

## Implementation Notes

### Migration from Old Stats

The current codebase has STR, CON, DEX, INT, PER on every creature and the player. The mapping:

| Old stat | New replacement |
|---|---|
| STR | Strength (direct rename, rebalance values) |
| CON | Size (conceptual change — HP now comes from body mass) |
| DEX | Removed. Dodge → Size inverted. Stealth → Size + sense awareness. Crit → body sim targeting. |
| INT | Central (rename + conceptual narrowing — no longer covers "smartness" broadly) |
| PER | Split into Chemical, Vibration, Visual (one number becomes three) |

Every file that references the old stat names needs updating: `monsters.js`, `player.js`, `chargen.js`, `combat.js`, `enemy-ai.js`, `ui.js`, `interactions.js`, `save-load.js`, and any derived stat calculations.

### Chargen

Character creation currently allocates points across 5 stats. With 7 stats, the allocation screen needs redesign. Options:
- Fixed physical stats (Size and Strength set by body type choice), player allocates points across senses and processing only.
- All 7 are allocatable but with suggested templates ("keen nose," "sharp eyes," "quick reflexes").
- Physical stats are fixed, two senses are preset by Clade A body (Chemical 5, Visual 4), player allocates remaining points to other senses and processing.

Decision deferred to implementation.

### Display

The status overlay (T key) shows all stats. Physical stats first, then senses (only showing senses that are above 0), then processing. A creature with Chemical 0 and Vibration 0 just doesn't show those lines.

The examine system reads Central processing to determine how much detail the player sees about enemies — this replaces the old INT-gating directly.

---

## Prompt Reference

When implementing, include:
- This document
- `player.js` (player stat storage)
- `monsters.js` (creature stat definitions)
- `combat.js` (damage and accuracy formulas that reference stats)
- `enemy-ai.js` (detection and behavior that reads stats)
- `chargen.js` (stat allocation at character creation)
- `ui.js` (stat display in status overlay)
- `interactions.js` (examine system that reads Central for info gating)
- `save-load.js` (stat persistence)
- `constants.js` (any derived stat formulas or thresholds)
- Body-Sim-Design.md (zone HP scaling with Size, attack damage with Strength)
- Mutation-Design.md (which stats mutations modify)
- Ecology-Foundations.md (clade context for why the stats are structured this way)